import { DurableObject } from "cloudflare:workers";
import { nextRoomAlarmAt } from "./alarm-state";
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  isRoomCode,
  parseClientMessage,
  serializeMultiplayerMessage,
  type ClientMessage,
  type PvpSeat,
  type ServerMessage,
} from "../src/shared";
import {
  autoPlaceExpiredMatch,
  createStoredPvpMatch,
  finishStoredMatch,
  isMatchDeadlineCurrent,
  isPlacementDeadlineExpired,
  matchEffectEvents,
  matchResult,
  matchSnapshotForSeat,
  placeInStoredMatch,
  type StoredPvpMatch,
} from "./match-state";
import {
  createWaitingRoom,
  disconnectWinnerAfterGrace,
  isRoomAvailableForCreate,
  joinWaitingRoom,
  leaveWaitingRoom,
  participantByToken,
  roomSnapshot,
  setParticipantConnected,
  setRoomReady,
  type RoomOperationError,
  type StoredRoomState,
} from "./room-state";
import { cacheReply, type CachedReply } from "./reply-cache";

const ROOM_STORAGE_KEY = "room";
const MATCH_STORAGE_KEY = "match";
const RESULT_TTL_MS = 5 * 60_000;

interface ConnectionAttachment {
  connectionId: string;
  connectedAt: number;
  roomCode: string;
  mode: "create" | "join";
  sessionToken?: string;
  seat?: PvpSeat;
  replies: CachedReply[];
}

function messageBase(requestId?: string) {
  return {
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    messageId: crypto.randomUUID(),
    serverTime: Date.now(),
    ...(requestId ? { requestId } : {}),
  } as const;
}

export class BingojiRoom extends DurableObject<Env> {
  async canCreate(now: number): Promise<boolean> {
    const room = await this.ctx.storage.get<StoredRoomState>(ROOM_STORAGE_KEY);
    if (!isRoomAvailableForCreate(room ?? null, now)) return false;
    if (!room) return true;
    this.clearSessionAttachments();
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", {
        status: 426,
        headers: { Upgrade: "websocket" },
      });
    }

    const roomCode = request.headers.get("X-Bingoji-Room-Code");
    const mode = request.headers.get("X-Bingoji-Connection-Mode");
    if (!isRoomCode(roomCode) || (mode !== "create" && mode !== "join")) {
      return new Response("Invalid room route", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const attachment: ConnectionAttachment = {
      connectionId: crypto.randomUUID(),
      connectedAt: Date.now(),
      roomCode,
      mode,
      replies: [],
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const attachment = this.attachment(socket);
    if (!attachment) {
      socket.close(1011, "Connection state unavailable");
      return;
    }
    if (typeof message !== "string") {
      this.sendError(socket, undefined, {
        code: "invalid-message",
        message: "JSON Text WebSocket 메시지만 지원합니다.",
        retryable: false,
      });
      return;
    }

    const decoded = parseClientMessage(message);
    if (!decoded.ok) {
      this.sendError(socket, undefined, {
        code: decoded.error.code === "unsupported-protocol" ? "unsupported-protocol" : "invalid-message",
        message: decoded.error.message,
        retryable: false,
      });
      return;
    }

    const cached = attachment.replies.find((reply) => reply.requestId === decoded.value.requestId);
    if (cached) {
      socket.send(cached.serialized);
      return;
    }

    try {
      await this.handleMessage(socket, attachment, decoded.value);
    } catch {
      this.sendError(socket, decoded.value.requestId, {
        code: "server-error",
        message: "방 요청을 처리하지 못했습니다.",
        retryable: true,
      });
    }
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    await this.disconnect(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.disconnect(socket);
  }

  async alarm(): Promise<void> {
    const room = await this.room();
    if (!room) return;
    const now = Date.now();

    if (room.status === "starting") {
      const startsAt = room.startsAt ?? now;
      if (startsAt > now) {
        await this.ctx.storage.setAlarm(startsAt);
        return;
      }
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      const started = createStoredPvpMatch(room, crypto.randomUUID(), seed, now);
      if (!started.ok) {
        await this.closeForServerError(started.error.message);
        return;
      }
      await this.persistRoomAndMatch(started.value.room, started.value.match);
      await this.scheduleNextAlarm(started.value.room, started.value.match);
      this.sendMatchStarted(started.value.room, started.value.match);
      return;
    }

    if (room.status === "waiting" || room.status === "finished") {
      if (room.expiresAt > now) {
        await this.ctx.storage.setAlarm(room.expiresAt);
        return;
      }
      const closed: ServerMessage = {
        ...messageBase(),
        type: "room.closed",
        payload: { reason: "expired", message: room.status === "finished" ? "종료된 대전이 정리되었습니다." : "대기방이 만료되었습니다." },
      };
      this.broadcast(room, closed);
      this.clearSessionAttachments();
      await this.ctx.storage.deleteAll();
      return;
    }

    const stored = await this.match();
    if (!stored) {
      await this.closeForServerError("전투 상태를 복구하지 못했습니다.");
      return;
    }

    const disconnectWinner = disconnectWinnerAfterGrace(room, now);
    if (disconnectWinner !== undefined) {
      await this.finishAndBroadcast(room, finishStoredMatch(stored, disconnectWinner, "disconnect"), now);
      return;
    }

    if (
      isMatchDeadlineCurrent(stored)
      && isPlacementDeadlineExpired(stored, now)
    ) {
      const automatic = autoPlaceExpiredMatch(stored, now);
      if (!automatic.ok) {
        await this.finishAndBroadcast(room, finishStoredMatch(stored, null, "server-error"), now);
        return;
      }
      if (automatic.value.state.phase === "finished") {
        await this.finishAndBroadcast(room, automatic.value, now);
        return;
      }
      await this.persistMatch(automatic.value);
      this.sendMatchUpdated(room, automatic.value, matchEffectEvents(automatic.value));
      await this.scheduleNextAlarm(room, automatic.value);
      return;
    }

    await this.scheduleNextAlarm(room, stored);
  }

  private async handleMessage(
    socket: WebSocket,
    attachment: ConnectionAttachment,
    message: ClientMessage,
  ): Promise<void> {
    switch (message.type) {
      case "room.create":
        await this.createRoom(socket, attachment, message);
        return;
      case "room.join":
        await this.joinRoom(socket, attachment, message);
        return;
      case "room.ready.set":
        await this.setReady(socket, attachment, message);
        return;
      case "room.leave":
        await this.leaveRoom(socket, attachment, message);
        return;
      case "session.resume":
        await this.resumeSession(socket, attachment, message);
        return;
      case "connection.ping": {
        const response: ServerMessage = {
          ...messageBase(message.requestId),
          type: "connection.pong",
          payload: { nonce: message.payload.nonce },
        };
        this.reply(socket, response);
        return;
      }
      case "match.place":
        await this.placeMatchEmoji(socket, attachment, message);
        return;
      case "match.sync.request":
        await this.syncMatch(socket, attachment, message);
        return;
    }
  }

  private async createRoom(
    socket: WebSocket,
    attachment: ConnectionAttachment,
    message: Extract<ClientMessage, { type: "room.create" }>,
  ): Promise<void> {
    if (attachment.mode !== "create" || attachment.sessionToken) {
      this.sendError(socket, message.requestId, {
        code: "not-authorized",
        message: "방 생성용 WebSocket 연결이 아닙니다.",
        retryable: false,
      });
      return;
    }
    const existing = await this.room();
    if (existing && existing.expiresAt > Date.now() && existing.status !== "closed") {
      this.sendError(socket, message.requestId, {
        code: existing.status === "waiting" ? "room-full" : "room-started",
        message: "이미 사용 중인 방 코드입니다. 다시 방을 만들어 주세요.",
        retryable: true,
      });
      return;
    }

    const created = createWaitingRoom(attachment.roomCode, message.payload.profile, {
      playerId: crypto.randomUUID(),
      sessionToken: crypto.randomUUID(),
    }, Date.now());
    if (!created.ok) {
      this.sendError(socket, message.requestId, created.error);
      return;
    }
    await this.persist(created.value.room);
    await this.ctx.storage.setAlarm(created.value.room.expiresAt);
    this.attachSession(socket, created.value.participant.sessionToken, "host");
    const response: ServerMessage = {
      ...messageBase(message.requestId),
      type: "room.created",
      payload: {
        sessionToken: created.value.participant.sessionToken,
        room: roomSnapshot(created.value.room),
      },
    };
    this.reply(socket, response);
  }

  private async joinRoom(
    socket: WebSocket,
    attachment: ConnectionAttachment,
    message: Extract<ClientMessage, { type: "room.join" }>,
  ): Promise<void> {
    if (attachment.mode !== "join" || attachment.sessionToken || message.payload.roomCode !== attachment.roomCode) {
      this.sendError(socket, message.requestId, {
        code: "room-not-found",
        message: "존재하지 않는 방코드입니다.",
        retryable: false,
      });
      return;
    }
    const joined = joinWaitingRoom(
      await this.room(),
      attachment.roomCode,
      message.payload.profile,
      { playerId: crypto.randomUUID(), sessionToken: crypto.randomUUID() },
      Date.now(),
    );
    if (!joined.ok) {
      this.sendError(socket, message.requestId, joined.error);
      return;
    }
    await this.persist(joined.value.room);
    this.attachSession(socket, joined.value.participant.sessionToken, "guest");
    const response: ServerMessage = {
      ...messageBase(message.requestId),
      type: "room.joined",
      payload: {
        sessionToken: joined.value.participant.sessionToken,
        room: roomSnapshot(joined.value.room),
      },
    };
    this.reply(socket, response);
    this.broadcastRoom(joined.value.room, socket);
  }

  private async setReady(
    socket: WebSocket,
    attachment: ConnectionAttachment,
    message: Extract<ClientMessage, { type: "room.ready.set" }>,
  ): Promise<void> {
    const room = await this.authorizedRoom(attachment, message.payload.sessionToken);
    if (!room) {
      this.sendUnauthorized(socket, message.requestId);
      return;
    }
    const updated = setRoomReady(room, message.payload.sessionToken, message.payload.ready, Date.now());
    if (!updated.ok) {
      this.sendError(socket, message.requestId, updated.error);
      return;
    }
    if (updated.value !== room) await this.persist(updated.value);
    if (updated.value.status === "starting") await this.scheduleNextAlarm(updated.value, null);
    const response: ServerMessage = {
      ...messageBase(message.requestId),
      type: "room.updated",
      payload: { room: roomSnapshot(updated.value) },
    };
    this.reply(socket, response);
    this.broadcastRoom(updated.value, socket);
  }

  private async placeMatchEmoji(
    socket: WebSocket,
    attachment: ConnectionAttachment,
    message: Extract<ClientMessage, { type: "match.place" }>,
  ): Promise<void> {
    const room = await this.authorizedRoom(attachment, message.payload.sessionToken);
    const stored = await this.match();
    if (!room || !stored || room.status !== "in-game" || !attachment.seat) {
      this.sendUnauthorized(socket, message.requestId);
      return;
    }
    const now = Date.now();
    if (isPlacementDeadlineExpired(stored, now)) {
      this.sendError(socket, message.requestId, {
        code: "turn-expired",
        message: "배치 제한 시간이 지났습니다.",
        retryable: false,
      });
      await this.resolveExpiredMatchDeadline(room, stored, now);
      return;
    }
    const placed = placeInStoredMatch(stored, attachment.seat, message.payload, now);
    if (!placed.ok) {
      this.sendError(socket, message.requestId, placed.error);
      return;
    }

    if (placed.value.state.phase === "finished") {
      await this.finishAndBroadcast(room, placed.value, now, socket, message.requestId);
      return;
    }

    await this.persistMatch(placed.value);
    await this.scheduleNextAlarm(room, placed.value);
    this.sendMatchUpdated(
      room,
      placed.value,
      matchEffectEvents(placed.value),
      socket,
      message.requestId,
    );
  }

  private async syncMatch(
    socket: WebSocket,
    attachment: ConnectionAttachment,
    message: Extract<ClientMessage, { type: "match.sync.request" }>,
  ): Promise<void> {
    const room = await this.authorizedRoom(attachment, message.payload.sessionToken);
    const stored = await this.match();
    if (
      !room
      || !stored
      || !attachment.seat
      || message.payload.matchId !== stored.state.matchId
    ) {
      this.sendUnauthorized(socket, message.requestId);
      return;
    }
    const response: ServerMessage = {
      ...messageBase(message.requestId),
      type: "match.updated",
      payload: {
        match: matchSnapshotForSeat(stored, room, attachment.seat),
        events: [],
      },
    };
    this.reply(socket, response);
  }

  private async leaveRoom(
    socket: WebSocket,
    attachment: ConnectionAttachment,
    message: Extract<ClientMessage, { type: "room.leave" }>,
  ): Promise<void> {
    const room = await this.authorizedRoom(attachment, message.payload.sessionToken);
    if (!room) {
      this.sendUnauthorized(socket, message.requestId);
      return;
    }
    if (room.status === "in-game") {
      const stored = await this.match();
      if (!stored || !attachment.seat) {
        this.sendError(socket, message.requestId, {
          code: "server-error",
          message: "전투 상태를 찾을 수 없습니다.",
          retryable: false,
        });
        return;
      }
      const now = Date.now();
      const disconnected = setParticipantConnected(room, message.payload.sessionToken, false, now);
      const leavingRoom = disconnected.ok ? disconnected.value : room;
      const winner = attachment.seat === "host" ? "guest" : "host";
      await this.finishAndBroadcast(
        leavingRoom,
        finishStoredMatch(stored, winner, "forfeit"),
        now,
        socket,
        message.requestId,
      );
      this.clearSessionAttachment(socket);
      return;
    }
    if (room.status === "finished") {
      const stored = await this.match();
      if (!stored) {
        this.sendError(socket, message.requestId, {
          code: "server-error",
          message: "종료 결과를 찾을 수 없습니다.",
          retryable: false,
        });
        return;
      }
      const disconnected = setParticipantConnected(room, message.payload.sessionToken, false, Date.now());
      const updatedRoom = disconnected.ok ? disconnected.value : room;
      const result = matchResult(stored, updatedRoom, Date.now());
      if (!result) {
        this.sendError(socket, message.requestId, {
          code: "server-error",
          message: "종료 결과를 만들 수 없습니다.",
          retryable: false,
        });
        return;
      }
      const response: ServerMessage = {
        ...messageBase(message.requestId),
        type: "match.finished",
        payload: { result },
      };
      this.reply(socket, response);
      this.clearSessionAttachment(socket);
      if (!updatedRoom.host.connected && !updatedRoom.guest?.connected) {
        await this.ctx.storage.deleteAll();
      } else {
        await this.persist(updatedRoom);
        await this.scheduleNextAlarm(updatedRoom, stored);
      }
      return;
    }
    const left = leaveWaitingRoom(room, message.payload.sessionToken);
    if (!left.ok) {
      this.sendError(socket, message.requestId, left.error);
      return;
    }

    if (left.value.seat === "host" || !left.value.room) {
      const response: ServerMessage = {
        ...messageBase(message.requestId),
        type: "room.closed",
        payload: { reason: "host-left", message: "방장이 방을 나갔습니다." },
      };
      this.reply(socket, response);
      this.broadcast(room, response, socket);
      this.clearSessionAttachments();
      await this.ctx.storage.deleteAll();
      return;
    }

    await this.persist(left.value.room);
    const response: ServerMessage = {
      ...messageBase(message.requestId),
      type: "room.updated",
      payload: { room: roomSnapshot(left.value.room) },
    };
    this.reply(socket, response);
    this.broadcastRoom(left.value.room, socket);
    this.clearSessionAttachment(socket);
  }

  private async resumeSession(
    socket: WebSocket,
    attachment: ConnectionAttachment,
    message: Extract<ClientMessage, { type: "session.resume" }>,
  ): Promise<void> {
    const room = await this.room();
    if (
      !room
      || (room.status !== "in-game" && room.expiresAt <= Date.now())
      || message.payload.roomCode !== attachment.roomCode
    ) {
      this.sendError(socket, message.requestId, {
        code: "room-not-found",
        message: "존재하지 않는 방코드입니다.",
        retryable: false,
      });
      return;
    }
    const participant = participantByToken(room, message.payload.sessionToken);
    if (!participant) {
      this.sendUnauthorized(socket, message.requestId);
      return;
    }

    const now = Date.now();
    const storedMatch = await this.match();
    const disconnectWinner = room.status === "in-game" ? disconnectWinnerAfterGrace(room, now) : undefined;
    if (storedMatch && disconnectWinner !== undefined) {
      await this.finishAndBroadcast(room, finishStoredMatch(storedMatch, disconnectWinner, "disconnect"), now);
      this.sendError(socket, message.requestId, {
        code: "not-authorized",
        message: "재접속 유예 30초가 지나 대전이 종료되었습니다.",
        retryable: false,
      });
      return;
    }

    this.attachSession(socket, message.payload.sessionToken, participant.seat);
    const connected = setParticipantConnected(room, message.payload.sessionToken, true, now);
    if (!connected.ok) {
      this.sendError(socket, message.requestId, connected.error);
      return;
    }
    if (connected.value !== room) await this.persist(connected.value);
    const response: ServerMessage = {
      ...messageBase(message.requestId),
      type: "session.resumed",
      payload: {
        room: roomSnapshot(connected.value),
        match: storedMatch ? matchSnapshotForSeat(storedMatch, connected.value, participant.seat) : null,
      },
    };
    this.reply(socket, response);
    if (storedMatch) {
      this.sendMatchUpdated(connected.value, storedMatch, [], socket);
      await this.scheduleNextAlarm(connected.value, storedMatch);
    }
    else this.broadcastRoom(connected.value, socket);
  }

  private async disconnect(socket: WebSocket): Promise<void> {
    const attachment = this.attachment(socket);
    if (!attachment?.sessionToken) return;
    const stillConnected = this.ctx.getWebSockets().some((other) => (
      other !== socket && this.attachment(other)?.sessionToken === attachment.sessionToken
    ));
    if (stillConnected) return;
    const room = await this.room();
    if (!room) return;
    const disconnected = setParticipantConnected(room, attachment.sessionToken, false, Date.now());
    if (!disconnected.ok || disconnected.value === room) return;
    await this.persist(disconnected.value);
    const storedMatch = await this.match();
    if (storedMatch) {
      this.sendMatchUpdated(disconnected.value, storedMatch, [], socket);
      await this.scheduleNextAlarm(disconnected.value, storedMatch);
    }
    else this.broadcastRoom(disconnected.value, socket);
  }

  private async room(): Promise<StoredRoomState | null> {
    return (await this.ctx.storage.get<StoredRoomState>(ROOM_STORAGE_KEY)) ?? null;
  }

  private async persist(room: StoredRoomState): Promise<void> {
    await this.ctx.storage.put(ROOM_STORAGE_KEY, room);
  }

  private async match(): Promise<StoredPvpMatch | null> {
    return (await this.ctx.storage.get<StoredPvpMatch>(MATCH_STORAGE_KEY)) ?? null;
  }

  private async persistMatch(match: StoredPvpMatch): Promise<void> {
    await this.ctx.storage.put(MATCH_STORAGE_KEY, match);
  }

  private async persistRoomAndMatch(room: StoredRoomState, match: StoredPvpMatch): Promise<void> {
    await this.ctx.storage.put({
      [ROOM_STORAGE_KEY]: room,
      [MATCH_STORAGE_KEY]: match,
    });
  }

  private async scheduleNextAlarm(room: StoredRoomState, match: StoredPvpMatch | null): Promise<void> {
    const nextAlarm = nextRoomAlarmAt(room, match, Date.now());
    if (nextAlarm === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(nextAlarm);
  }

  private async resolveExpiredMatchDeadline(
    room: StoredRoomState,
    stored: StoredPvpMatch,
    now: number,
  ): Promise<void> {
    const disconnectWinner = disconnectWinnerAfterGrace(room, now);
    if (disconnectWinner !== undefined) {
      await this.finishAndBroadcast(room, finishStoredMatch(stored, disconnectWinner, "disconnect"), now);
      return;
    }
    const automatic = autoPlaceExpiredMatch(stored, now);
    if (!automatic.ok) {
      await this.finishAndBroadcast(room, finishStoredMatch(stored, null, "server-error"), now);
      return;
    }
    if (automatic.value.state.phase === "finished") {
      await this.finishAndBroadcast(room, automatic.value, now);
      return;
    }
    await this.persistMatch(automatic.value);
    this.sendMatchUpdated(room, automatic.value, matchEffectEvents(automatic.value));
    await this.scheduleNextAlarm(room, automatic.value);
  }

  private async finishAndBroadcast(
    room: StoredRoomState,
    match: StoredPvpMatch,
    now: number,
    requestSocket?: WebSocket,
    requestId?: string,
  ): Promise<void> {
    const finishedRoom: StoredRoomState = {
      ...room,
      revision: room.revision + 1,
      status: "finished",
      expiresAt: now + RESULT_TTL_MS,
    };
    await this.persistRoomAndMatch(finishedRoom, match);
    await this.scheduleNextAlarm(finishedRoom, match);
    const result = matchResult(match, finishedRoom, now);
    if (!result) {
      await this.closeForServerError("대전 결과를 만들지 못했습니다.");
      return;
    }
    if (match.state.outcome?.reason === "hp") {
      this.sendMatchUpdated(finishedRoom, match, matchEffectEvents(match));
    }
    const response: ServerMessage = {
      ...messageBase(requestSocket ? requestId : undefined),
      type: "match.finished",
      payload: { result },
    };
    if (requestSocket) {
      this.reply(requestSocket, response);
      this.broadcast(finishedRoom, response, requestSocket);
    } else {
      this.broadcast(finishedRoom, response);
    }
  }

  private async closeForServerError(message: string): Promise<void> {
    const response: ServerMessage = {
      ...messageBase(),
      type: "room.closed",
      payload: { reason: "server-error", message },
    };
    const room = await this.room();
    if (room) this.broadcast(room, response);
    this.clearSessionAttachments();
    await this.ctx.storage.deleteAll();
  }

  private async authorizedRoom(
    attachment: ConnectionAttachment,
    sessionToken: string,
  ): Promise<StoredRoomState | null> {
    if (attachment.sessionToken !== sessionToken) return null;
    const room = await this.room();
    return room && participantByToken(room, sessionToken) ? room : null;
  }

  private attachment(socket: WebSocket): ConnectionAttachment | null {
    const value = socket.deserializeAttachment() as ConnectionAttachment | null;
    return value?.connectionId && value.roomCode ? value : null;
  }

  private attachSession(socket: WebSocket, sessionToken: string, seat: PvpSeat): void {
    for (const other of this.ctx.getWebSockets()) {
      if (other === socket) continue;
      const existing = this.attachment(other);
      if (existing?.sessionToken !== sessionToken) continue;
      other.serializeAttachment({ ...existing, sessionToken: undefined, seat: undefined });
      other.close(4000, "Session resumed on another connection");
    }
    const attachment = this.attachment(socket);
    if (attachment) socket.serializeAttachment({ ...attachment, sessionToken, seat });
  }

  private clearSessionAttachment(socket: WebSocket): void {
    const attachment = this.attachment(socket);
    if (attachment) socket.serializeAttachment({ ...attachment, sessionToken: undefined, seat: undefined });
  }

  private clearSessionAttachments(): void {
    for (const socket of this.ctx.getWebSockets()) this.clearSessionAttachment(socket);
  }

  private reply(socket: WebSocket, message: ServerMessage): void {
    const serialized = serializeMultiplayerMessage(message);
    socket.send(serialized);
    if (!message.requestId) return;
    const attachment = this.attachment(socket);
    if (!attachment) return;
    const replies = cacheReply(attachment.replies, { requestId: message.requestId, serialized });
    socket.serializeAttachment({ ...attachment, replies });
  }

  private sendError(
    socket: WebSocket,
    requestId: string | undefined,
    error: RoomOperationError,
  ): void {
    const response: ServerMessage = {
      ...messageBase(requestId),
      type: "error",
      payload: error,
    };
    this.reply(socket, response);
  }

  private sendUnauthorized(socket: WebSocket, requestId: string): void {
    this.sendError(socket, requestId, {
      code: "not-authorized",
      message: "이 방의 참가자 Session이 아닙니다.",
      retryable: false,
    });
  }

  private sendMatchStarted(
    room: StoredRoomState,
    match: StoredPvpMatch,
    requestSocket?: WebSocket,
    requestId?: string,
  ): void {
    this.forEachParticipantSocket(room, (socket, seat) => {
      const response: ServerMessage = {
        ...messageBase(socket === requestSocket ? requestId : undefined),
        type: "match.started",
        payload: { match: matchSnapshotForSeat(match, room, seat) },
      };
      if (requestSocket && socket === requestSocket && requestId) this.reply(socket, response);
      else socket.send(serializeMultiplayerMessage(response));
    });
  }

  private sendMatchUpdated(
    room: StoredRoomState,
    match: StoredPvpMatch,
    events: ReturnType<typeof matchEffectEvents>,
    requestSocket?: WebSocket,
    requestId?: string,
  ): void {
    this.forEachParticipantSocket(room, (socket, seat) => {
      if (socket === requestSocket && !requestId) return;
      const response: ServerMessage = {
        ...messageBase(socket === requestSocket ? requestId : undefined),
        type: "match.updated",
        payload: {
          match: matchSnapshotForSeat(match, room, seat),
          events,
        },
      };
      if (socket === requestSocket) this.reply(socket, response);
      else socket.send(serializeMultiplayerMessage(response));
    });
  }

  private forEachParticipantSocket(
    room: StoredRoomState,
    callback: (socket: WebSocket, seat: PvpSeat) => void,
  ): void {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.attachment(socket);
      if (!attachment?.sessionToken || !attachment.seat) continue;
      const participant = participantByToken(room, attachment.sessionToken);
      if (!participant || participant.seat !== attachment.seat) continue;
      callback(socket, attachment.seat);
    }
  }

  private broadcastRoom(room: StoredRoomState, except?: WebSocket): void {
    const response: ServerMessage = {
      ...messageBase(),
      type: "room.updated",
      payload: { room: roomSnapshot(room) },
    };
    this.broadcast(room, response, except);
  }

  private broadcast(room: StoredRoomState, message: ServerMessage, except?: WebSocket): void {
    const serialized = serializeMultiplayerMessage(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      const attachment = this.attachment(socket);
      if (!attachment?.sessionToken || !participantByToken(room, attachment.sessionToken)) continue;
      try {
        socket.send(serialized);
      } catch {
        // Close/Error callback에서 연결 상태를 갱신합니다.
      }
    }
  }
}
