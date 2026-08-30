import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  serializeMultiplayerMessage,
  type PvpMatchSnapshot,
  type PvpMatchResult,
  type RoomSnapshot,
  type ServerMessage,
} from "../shared";
import { MultiplayerRoomClient, roomWebSocketUrl } from "./client";

class FakeSocket {
  readyState: number = WebSocket.CONNECTING;
  sent: string[] = [];
  private readonly listeners = new Map<string, Array<(event: MessageEvent | Event) => void>>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: MessageEvent | Event) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
  }

  open() {
    this.readyState = WebSocket.OPEN;
    this.emit("open", new Event("open"));
  }

  disconnect() {
    this.readyState = WebSocket.CLOSED;
    this.emit("close", new Event("close"));
  }

  receive(message: ServerMessage) {
    this.emit("message", new MessageEvent("message", { data: serializeMultiplayerMessage(message) }));
  }

  private emit(type: string, event: MessageEvent | Event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const profile = {
  avatar: "🙂",
  nickname: "빙고왕",
  pool: { sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2 },
};

const room: RoomSnapshot = {
  roomCode: "ABC234",
  revision: 1,
  status: "waiting",
  host: { playerId: "host-id", seat: "host", avatar: "🙂", nickname: "빙고왕", poolSize: 10, ready: false, connected: true },
  guest: null,
  expiresAt: 99_999,
};

function matchForSeat(seat: "host" | "guest"): PvpMatchSnapshot {
  return {
    matchId: "match-1",
    revision: 0,
    turn: 1,
    phase: "turn",
    board: Array.from({ length: 25 }, () => null),
    players: {
      host: { playerId: "host-id", seat: "host", avatar: "🙂", nickname: "빙고왕", hp: 30, maxHp: 30, poolSize: 10, statuses: [], connected: true },
      guest: { playerId: "guest-id", seat: "guest", avatar: "😎", nickname: "도전자", hp: 30, maxHp: 30, poolSize: 10, statuses: [], connected: true },
    },
    activeSeat: seat,
    deadlineAt: Date.now() + 15_000,
    placementsRemaining: 1,
    lastBingo: null,
    privateState: { seat, pool: profile.pool, draw: ["sword", "heart", "fire"] },
  };
}

function message<T extends ServerMessage>(value: Omit<T, "protocolVersion" | "messageId" | "serverTime">): T {
  return {
    ...value,
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    messageId: crypto.randomUUID(),
    serverTime: Date.now(),
  } as T;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("MultiplayerRoomClient", () => {
  it("builds create and room-specific WebSocket URLs", () => {
    expect(roomWebSocketUrl("http://127.0.0.1:8787")).toBe("ws://127.0.0.1:8787/api/rooms/socket");
    expect(roomWebSocketUrl("https://pvp.example.com/base", "ABC234")).toBe("wss://pvp.example.com/api/rooms/ABC234/socket");
  });

  it("reports a clear configuration error without opening a socket", () => {
    const createSocket = vi.fn();
    const client = new MultiplayerRoomClient("", createSocket);
    client.createRoom(profile);
    expect(createSocket).not.toHaveBeenCalled();
    expect(client.snapshot()).toMatchObject({
      connection: "error",
      error: { message: "멀티플레이 Server 주소가 설정되지 않았습니다.", retryable: false },
    });
  });

  it("creates a room, keeps the session only in memory, and sends ready state", () => {
    const sockets: FakeSocket[] = [];
    const client = new MultiplayerRoomClient("http://127.0.0.1:8787", (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    });

    client.createRoom(profile);
    sockets[0].open();
    expect(JSON.parse(sockets[0].sent[0])).toMatchObject({ type: "room.create", payload: { profile } });
    sockets[0].receive(message({
      type: "room.created",
      payload: { sessionToken: "host-token", room },
    }));
    expect(client.snapshot()).toMatchObject({ connection: "connected", sessionToken: "host-token", seat: "host", room });

    expect(client.setReady(true)).toBe(true);
    expect(JSON.parse(sockets[0].sent.at(-1)!)).toMatchObject({
      type: "room.ready.set",
      payload: { sessionToken: "host-token", ready: true },
    });
    client.cancel();
  });

  it("joins by code and resumes the same in-memory session after a transient disconnect", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const client = new MultiplayerRoomClient("http://127.0.0.1:8787", (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    });
    const joinedRoom = { ...room, guest: { playerId: "guest-id", seat: "guest" as const, avatar: "😎", nickname: "도전자", poolSize: 10, ready: false, connected: true } };

    client.joinRoom("ABC234", profile);
    sockets[0].open();
    expect(JSON.parse(sockets[0].sent[0])).toMatchObject({ type: "room.join", payload: { roomCode: "ABC234" } });
    sockets[0].receive(message({ type: "room.joined", payload: { sessionToken: "guest-token", room: joinedRoom } }));
    sockets[0].receive(message({ type: "match.started", payload: { match: matchForSeat("guest") } }));
    expect(client.snapshot().room).toMatchObject({ status: "in-game", host: { ready: true }, guest: { ready: true } });
    expect(client.placeEmoji(1, 4)).toBe(true);
    expect(JSON.parse(sockets[0].sent.at(-1)!)).toMatchObject({
      type: "match.place",
      payload: { sessionToken: "guest-token", matchId: "match-1", expectedRevision: 0, turn: 1, drawIndex: 1, cellIndex: 4 },
    });
    sockets[0].disconnect();
    expect(client.snapshot().connection).toBe("reconnecting");

    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    expect(sockets[1].url).toContain("/api/rooms/ABC234/socket");
    sockets[1].open();
    expect(JSON.parse(sockets[1].sent[0])).toMatchObject({
      type: "session.resume",
      payload: { roomCode: "ABC234", sessionToken: "guest-token" },
    });
    sockets[1].receive(message({ type: "session.resumed", payload: { room: joinedRoom, match: null } }));
    expect(client.snapshot()).toMatchObject({ connection: "connected", sessionToken: "guest-token", seat: "guest", error: null });
    client.cancel();
  });

  it("does not send a placement after the displayed Turn deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    const sockets: FakeSocket[] = [];
    const client = new MultiplayerRoomClient("http://127.0.0.1:8787", (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    });

    client.createRoom(profile);
    sockets[0].open();
    sockets[0].receive(message({ type: "room.created", payload: { sessionToken: "host-token", room } }));
    sockets[0].receive(message({ type: "match.started", payload: { match: { ...matchForSeat("host"), deadlineAt: 19_999 } } }));
    const sentBefore = sockets[0].sent.length;

    expect(client.placeEmoji(0, 0)).toBe(false);
    expect(sockets[0].sent).toHaveLength(sentBefore);
    client.cancel();
  });

  it("waits for the authoritative leave response before closing the socket", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const client = new MultiplayerRoomClient("http://127.0.0.1:8787", (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    });

    client.createRoom(profile);
    sockets[0].open();
    sockets[0].receive(message({ type: "room.created", payload: { sessionToken: "host-token", room } }));
    client.leave();
    expect(sockets[0].readyState).toBe(WebSocket.OPEN);
    expect(client.snapshot().room).toEqual(room);
    expect(JSON.parse(sockets[0].sent.at(-1)!)).toMatchObject({ type: "room.leave" });

    sockets[0].receive(message({ type: "room.closed", payload: { reason: "host-left", message: "방장이 방을 나갔습니다." } }));
    expect(sockets[0].readyState).toBe(WebSocket.CLOSED);
    expect(client.snapshot()).toMatchObject({ connection: "idle", room: null, sessionToken: null });
  });

  it("keeps a completed result visible if the room closes afterwards", () => {
    const sockets: FakeSocket[] = [];
    const client = new MultiplayerRoomClient("http://127.0.0.1:8787", (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    });
    const finishedRoom = {
      ...room,
      status: "in-game" as const,
      guest: { playerId: "guest-id", seat: "guest" as const, avatar: "😎", nickname: "도전자", poolSize: 10, ready: true, connected: true },
    };
    const result: PvpMatchResult = {
      matchId: "match-1",
      winnerSeat: "host",
      reason: "hp",
      turns: 4,
      elapsedMs: 20_000,
      players: {
        host: { ...matchForSeat("host").players.host, hp: 12, pool: profile.pool },
        guest: { ...matchForSeat("host").players.guest, hp: 0, pool: profile.pool },
      },
    };

    client.createRoom(profile);
    sockets[0].open();
    sockets[0].receive(message({ type: "room.created", payload: { sessionToken: "host-token", room: finishedRoom } }));
    sockets[0].receive(message({ type: "match.started", payload: { match: matchForSeat("host") } }));
    sockets[0].receive(message({ type: "match.finished", payload: { result } }));
    sockets[0].receive(message({ type: "room.closed", payload: { reason: "expired", message: "방이 종료되었습니다." } }));

    expect(client.snapshot()).toMatchObject({ connection: "closed", match: { matchId: "match-1" }, result, error: null });
  });

  it("retries an unanswered placement with the same request ID and stops after an authoritative response", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const client = new MultiplayerRoomClient("http://127.0.0.1:8787", (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    });

    client.createRoom(profile);
    sockets[0].open();
    sockets[0].receive(message({ type: "room.created", payload: { sessionToken: "host-token", room } }));
    const activeMatch = matchForSeat("host");
    sockets[0].receive(message({ type: "match.started", payload: { match: activeMatch } }));
    client.placeEmoji(0, 0);
    const firstPlacement = JSON.parse(sockets[0].sent.at(-1)!);

    vi.advanceTimersByTime(750);
    const retryPlacement = JSON.parse(sockets[0].sent.at(-1)!);
    expect(retryPlacement).toEqual(firstPlacement);

    const sentBeforeResponse = sockets[0].sent.length;
    sockets[0].receive(message({
      type: "match.updated",
      payload: { match: { ...activeMatch, revision: 1, turn: 2, activeSeat: "guest" }, events: [] },
    }));
    vi.advanceTimersByTime(2_000);
    expect(sockets[0].sent).toHaveLength(sentBeforeResponse);
    client.cancel();
  });
});
