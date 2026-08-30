import {
  MULTIPLAYER_PROTOCOL_VERSION,
  parseServerMessage,
  serializeMultiplayerMessage,
  type ClientMessage,
  type MultiplayerErrorCode,
  type MultiplayerProfile,
  type PvpEffectEvent,
  type PvpMatchResult,
  type PvpMatchSnapshot,
  type PvpSeat,
  type RoomSnapshot,
  type ServerMessage,
} from "../shared";

export type MultiplayerConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "closed" | "error";

export interface MultiplayerClientError {
  code: MultiplayerErrorCode | "connection-failed" | "invalid-server-message";
  message: string;
  retryable: boolean;
}

export interface MultiplayerClientState {
  connection: MultiplayerConnectionStatus;
  room: RoomSnapshot | null;
  sessionToken: string | null;
  seat: PvpSeat | null;
  match: PvpMatchSnapshot | null;
  result: PvpMatchResult | null;
  events: PvpEffectEvent[];
  placementPending: boolean;
  serverTimeOffsetMs: number;
  error: MultiplayerClientError | null;
}

type Listener = (state: MultiplayerClientState) => void;
type WebSocketFactory = (url: string) => WebSocket;

const INITIAL_STATE: MultiplayerClientState = {
  connection: "idle",
  room: null,
  sessionToken: null,
  seat: null,
  match: null,
  result: null,
  events: [],
  placementPending: false,
  serverTimeOffsetMs: 0,
  error: null,
};

const LEAVE_RESPONSE_TIMEOUT_MS = 2_000;
const PLACEMENT_RETRY_DELAY_MS = 750;
const MAX_PLACEMENT_RETRIES = 2;

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function defaultMultiplayerServerUrl(): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_SERVER_URL?.trim();
  if (configured) return configured;
  if (typeof window === "undefined") return "http://127.0.0.1:8787";
  const local = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  return local ? `${window.location.protocol}//${window.location.hostname}:8787` : "";
}

export function isMultiplayerServerConfigured(): boolean {
  return defaultMultiplayerServerUrl().length > 0;
}

export function roomWebSocketUrl(baseUrl: string, roomCode?: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
  url.pathname = roomCode ? `/api/rooms/${roomCode}/socket` : "/api/rooms/socket";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export class MultiplayerRoomClient {
  private state: MultiplayerClientState = { ...INITIAL_STATE };
  private readonly listeners = new Set<Listener>();
  private socket: WebSocket | null = null;
  private intendedClose = false;
  private reconnectStartedAt: number | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private leavePending = false;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPlacement: { serialized: string; retries: number } | null = null;
  private placementRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly seenMessageIds = new Set<string>();

  constructor(
    private readonly serverUrl = defaultMultiplayerServerUrl(),
    private readonly createSocket: WebSocketFactory = (url) => new WebSocket(url),
  ) {}

  snapshot(): MultiplayerClientState {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  createRoom(profile: MultiplayerProfile): void {
    if (!this.requireServerConfiguration()) return;
    this.startFreshConnection(roomWebSocketUrl(this.serverUrl), {
      type: "room.create",
      payload: { profile },
    });
  }

  joinRoom(roomCode: string, profile: MultiplayerProfile): void {
    if (!this.requireServerConfiguration()) return;
    this.startFreshConnection(roomWebSocketUrl(this.serverUrl, roomCode), {
      type: "room.join",
      payload: { roomCode, profile },
    });
  }

  setReady(ready: boolean): boolean {
    if (!this.state.sessionToken) return false;
    return this.send({ type: "room.ready.set", payload: { sessionToken: this.state.sessionToken, ready } });
  }

  placeEmoji(drawIndex: number, cellIndex: number): boolean {
    const { match, seat, sessionToken } = this.state;
    if (
      !match
      || !seat
      || !sessionToken
      || this.state.connection !== "connected"
      || this.state.placementPending
      || match.activeSeat !== seat
      || match.phase !== "turn"
      || (match.deadlineAt !== null && match.deadlineAt <= Date.now() + this.state.serverTimeOffsetMs)
    ) return false;
    this.patchState({ placementPending: true, error: null });
    const envelope: ClientMessage = {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      requestId: requestId(),
      type: "match.place",
      payload: {
        sessionToken,
        matchId: match.matchId,
        expectedRevision: match.revision,
        turn: match.turn,
        drawIndex,
        cellIndex,
      },
    };
    const serialized = serializeMultiplayerMessage(envelope);
    const sent = this.sendSerialized(serialized);
    if (sent) {
      this.pendingPlacement = { serialized, retries: 0 };
      this.schedulePlacementRetry();
    }
    if (!sent) this.patchState({ placementPending: false });
    return sent;
  }

  requestMatchSync(): boolean {
    const { match, sessionToken } = this.state;
    if (!match || !sessionToken) return false;
    return this.send({ type: "match.sync.request", payload: { sessionToken, matchId: match.matchId } });
  }

  forfeit(): boolean {
    if (!this.state.sessionToken || !this.state.match || this.state.result) return false;
    const sent = this.send({ type: "room.leave", payload: { sessionToken: this.state.sessionToken } });
    if (sent) this.patchState({ placementPending: true, error: null });
    return sent;
  }

  leave(): void {
    if (this.leavePending) return;
    if (!this.state.sessionToken) {
      this.finishLeave();
      return;
    }
    const sent = this.send({ type: "room.leave", payload: { sessionToken: this.state.sessionToken } });
    if (!sent) {
      this.finishLeave();
      return;
    }
    this.leavePending = true;
    this.clearReconnectTimer();
    this.leaveTimer = globalThis.setTimeout(() => this.finishLeave(), LEAVE_RESPONSE_TIMEOUT_MS);
  }

  cancel(): void {
    this.intendedClose = true;
    this.clearReconnectTimer();
    this.clearLeaveTimer();
    this.clearPlacementRetry();
    this.leavePending = false;
    this.socket?.close(1000, "Cancelled");
    this.socket = null;
    this.replaceState(INITIAL_STATE);
  }

  clearError(): void {
    if (!this.state.error) return;
    this.patchState({ error: null, connection: this.socket?.readyState === WebSocket.OPEN ? "connected" : this.state.connection });
  }

  destroy(): void {
    this.cancel();
    this.listeners.clear();
  }

  private startFreshConnection(url: string, pending: Omit<ClientMessage, "protocolVersion" | "requestId">): void {
    this.intendedClose = true;
    this.clearReconnectTimer();
    this.clearLeaveTimer();
    this.clearPlacementRetry();
    this.leavePending = false;
    this.socket?.close(1000, "New room request");
    this.intendedClose = false;
    this.reconnectAttempts = 0;
    this.reconnectStartedAt = null;
    this.replaceState({ ...INITIAL_STATE, connection: "connecting" });
    this.openSocket(url, () => this.send(pending));
  }

  private openSocket(url: string, onOpen: () => void): void {
    let socket: WebSocket;
    try {
      socket = this.createSocket(url);
    } catch {
      this.failConnection("WebSocket 연결을 시작하지 못했습니다.");
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (socket !== this.socket) return;
      onOpen();
    });
    socket.addEventListener("message", (event) => {
      if (socket !== this.socket || typeof event.data !== "string") return;
      this.receive(event.data);
    });
    socket.addEventListener("close", () => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.clearPlacementRetry();
      if (this.leavePending) {
        this.finishLeave();
        return;
      }
      if (this.intendedClose) return;
      if (this.state.sessionToken && this.state.room && !this.state.result) this.scheduleReconnect();
      else this.failConnection("멀티플레이 Server와 연결이 끊어졌습니다.");
    });
    socket.addEventListener("error", () => {
      if (socket !== this.socket || this.intendedClose) return;
      this.patchState({ connection: this.state.sessionToken ? "reconnecting" : "error" });
    });
  }

  private scheduleReconnect(): void {
    const now = Date.now();
    this.reconnectStartedAt ??= now;
    if (now - this.reconnectStartedAt >= 30_000 || !this.state.room || !this.state.sessionToken) {
      this.failConnection("재접속 유예 시간이 지나 방 연결을 복구하지 못했습니다.");
      return;
    }
    this.patchState({ connection: "reconnecting", error: null });
    const delay = Math.min(5_000, 500 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.clearReconnectTimer();
    this.reconnectTimer = globalThis.setTimeout(() => this.resume(), delay);
  }

  private resume(): void {
    if (!this.state.room || !this.state.sessionToken || !this.requireServerConfiguration()) return;
    const { roomCode } = this.state.room;
    const sessionToken = this.state.sessionToken;
    this.openSocket(roomWebSocketUrl(this.serverUrl, roomCode), () => {
      this.send({ type: "session.resume", payload: { roomCode, sessionToken } });
    });
  }

  private receive(serialized: string): void {
    const decoded = parseServerMessage(serialized);
    if (!decoded.ok) {
      this.patchState({
        connection: "error",
        error: { code: "invalid-server-message", message: decoded.error.message, retryable: false },
      });
      return;
    }
    const message = decoded.value;
    if (this.seenMessageIds.has(message.messageId)) return;
    this.seenMessageIds.add(message.messageId);
    if (this.seenMessageIds.size > 128) {
      const oldest = this.seenMessageIds.values().next().value;
      if (oldest) this.seenMessageIds.delete(oldest);
    }
    this.state = { ...this.state, serverTimeOffsetMs: message.serverTime - Date.now() };
    if (
      this.leavePending
      && (message.type === "room.updated" || message.type === "room.closed" || message.type === "match.finished" || message.type === "error")
    ) {
      this.finishLeave();
      return;
    }
    switch (message.type) {
      case "room.created":
        this.acceptSession(message.payload.sessionToken, "host", message.payload.room);
        break;
      case "room.joined":
        this.acceptSession(message.payload.sessionToken, "guest", message.payload.room);
        break;
      case "room.updated":
        this.patchState({ connection: "connected", room: message.payload.room, error: null });
        break;
      case "room.closed":
        this.intendedClose = true;
        this.clearReconnectTimer();
        this.clearLeaveTimer();
        this.clearPlacementRetry();
        const closedSocket = this.socket;
        this.socket = null;
        closedSocket?.close(1000, "Room closed");
        if (this.state.result && this.state.match) {
          this.patchState({
            connection: "closed",
            room: this.state.room ? { ...this.state.room, status: "finished" } : null,
            sessionToken: null,
            events: [],
            placementPending: false,
            error: null,
          });
          break;
        }
        this.replaceState({
          ...INITIAL_STATE,
          connection: "closed",
          error: { code: "connection-failed", message: message.payload.message, retryable: false },
        });
        break;
      case "session.resumed":
        this.clearPlacementRetry();
        this.reconnectAttempts = 0;
        this.reconnectStartedAt = null;
        this.patchState({ connection: "connected", room: message.payload.room, match: message.payload.match, events: [], placementPending: false, error: null });
        break;
      case "match.started":
        this.clearPlacementRetry();
        this.patchState({
          connection: "connected",
          room: this.state.room ? {
            ...this.state.room,
            status: "in-game",
            host: { ...this.state.room.host, ready: true },
            guest: this.state.room.guest ? { ...this.state.room.guest, ready: true } : null,
          } : null,
          match: message.payload.match,
          events: [],
          placementPending: false,
          error: null,
        });
        break;
      case "match.updated":
        this.clearPlacementRetry();
        this.patchState({
          connection: "connected",
          room: this.state.room ? { ...this.state.room, status: "in-game" } : null,
          match: message.payload.match,
          events: message.payload.events,
          placementPending: false,
          error: null,
        });
        break;
      case "match.finished":
        this.clearPlacementRetry();
        this.patchState({
          connection: "connected",
          room: this.state.room ? { ...this.state.room, status: "finished" } : null,
          result: message.payload.result,
          placementPending: false,
          error: null,
        });
        break;
      case "error":
        this.clearPlacementRetry();
        this.state = { ...this.state, placementPending: false };
        if (this.state.connection === "reconnecting") {
          if (message.payload.retryable) {
            this.socket?.close(1012, "Retry resume");
          } else {
            this.intendedClose = true;
            this.clearReconnectTimer();
            this.socket?.close(1000, "Resume rejected");
            this.socket = null;
            this.patchState({
              connection: "error",
              sessionToken: null,
              seat: null,
              error: message.payload,
            });
          }
          break;
        }
        this.patchState({
          connection: this.state.sessionToken ? this.state.connection : "error",
          error: message.payload,
        });
        if (message.payload.code === "stale-revision" || message.payload.code === "turn-expired") {
          this.requestMatchSync();
        }
        break;
      case "connection.pong":
        break;
    }
  }

  private acceptSession(sessionToken: string, seat: PvpSeat, room: RoomSnapshot): void {
    this.reconnectAttempts = 0;
    this.reconnectStartedAt = null;
    this.patchState({ connection: "connected", sessionToken, seat, room, error: null });
  }

  private send(message: Omit<ClientMessage, "protocolVersion" | "requestId">): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    const envelope = {
      ...message,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      requestId: requestId(),
    } as ClientMessage;
    return this.sendSerialized(serializeMultiplayerMessage(envelope));
  }

  private sendSerialized(serialized: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(serialized);
    return true;
  }

  private schedulePlacementRetry(): void {
    this.clearPlacementRetryTimer();
    if (!this.pendingPlacement || this.pendingPlacement.retries >= MAX_PLACEMENT_RETRIES) return;
    this.placementRetryTimer = globalThis.setTimeout(() => {
      const pending = this.pendingPlacement;
      if (!pending || !this.state.placementPending || !this.sendSerialized(pending.serialized)) return;
      pending.retries += 1;
      this.schedulePlacementRetry();
    }, PLACEMENT_RETRY_DELAY_MS);
  }

  private failConnection(message: string): void {
    this.clearReconnectTimer();
    this.patchState({
      connection: "error",
      error: { code: "connection-failed", message, retryable: true },
    });
  }

  private requireServerConfiguration(): boolean {
    if (this.serverUrl) return true;
    this.replaceState({
      ...INITIAL_STATE,
      connection: "error",
      error: {
        code: "connection-failed",
        message: "멀티플레이 Server 주소가 설정되지 않았습니다.",
        retryable: false,
      },
    });
    return false;
  }

  private finishLeave(): void {
    this.leavePending = false;
    this.intendedClose = true;
    this.clearReconnectTimer();
    this.clearLeaveTimer();
    this.clearPlacementRetry();
    const leavingSocket = this.socket;
    this.socket = null;
    leavingSocket?.close(1000, "Player left room");
    this.replaceState(INITIAL_STATE);
  }

  private patchState(patch: Partial<MultiplayerClientState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private replaceState(state: MultiplayerClientState): void {
    this.state = { ...state };
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) globalThis.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearLeaveTimer(): void {
    if (this.leaveTimer !== null) globalThis.clearTimeout(this.leaveTimer);
    this.leaveTimer = null;
  }

  private clearPlacementRetryTimer(): void {
    if (this.placementRetryTimer !== null) globalThis.clearTimeout(this.placementRetryTimer);
    this.placementRetryTimer = null;
  }

  private clearPlacementRetry(): void {
    this.clearPlacementRetryTimer();
    this.pendingPlacement = null;
  }
}
