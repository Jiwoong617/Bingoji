import {
  MULTIPLAYER_PROTOCOL_VERSION,
  decodeClientMessage,
  decodeServerMessage,
  parseClientMessage,
  parseServerMessage,
  serializeMultiplayerMessage,
  type ClientMessage,
  type PvpMatchSnapshot,
  type RoomSnapshot,
  type ServerMessage,
} from "./protocol";
import { PVP_DRAW_SIZE } from "./match";
import type { MultiplayerProfile } from "./rules";

const profile: MultiplayerProfile = {
  avatar: "🙂",
  nickname: "빙고왕",
  pool: { sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2 },
};

const room: RoomSnapshot = {
  roomCode: "AB7KQ3",
  revision: 2,
  status: "waiting",
  host: {
    playerId: "player-host",
    seat: "host",
    avatar: "🙂",
    nickname: "빙고왕",
    poolSize: 10,
    ready: false,
    connected: true,
  },
  guest: null,
  expiresAt: 1_800_000,
};

const match: PvpMatchSnapshot = {
  matchId: "match-1",
  revision: 4,
  turn: 1,
  phase: "turn",
  board: Array.from({ length: 25 }, () => null),
  players: {
    host: {
      playerId: "player-host",
      seat: "host",
      avatar: "🙂",
      nickname: "빙고왕",
      hp: 30,
      maxHp: 30,
      poolSize: 10,
      statuses: [],
      connected: true,
    },
    guest: {
      playerId: "player-guest",
      seat: "guest",
      avatar: "😎",
      nickname: "도전자",
      hp: 30,
      maxHp: 30,
      poolSize: 10,
      statuses: [],
      connected: true,
    },
  },
  activeSeat: "host",
  deadlineAt: 15_000,
  placementsRemaining: 1,
  lastBingo: null,
  privateState: { seat: "host", pool: profile.pool, draw: ["sword", "heart", "fire"] },
};

describe("multiplayer protocol", () => {
  it("decodes a structurally valid room.create command", () => {
    const message: ClientMessage = {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      requestId: "request-1",
      type: "room.create",
      payload: { profile },
    };

    expect(decodeClientMessage(message)).toEqual({ ok: true, value: message });
    expect(parseClientMessage(serializeMultiplayerMessage(message))).toEqual({ ok: true, value: message });
  });

  it("rejects unsupported protocol versions before reading the payload", () => {
    const result = decodeClientMessage({
      protocolVersion: 2,
      requestId: "request-1",
      type: "connection.ping",
      payload: { nonce: "n-1" },
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "unsupported-protocol" }),
    });
  });

  it("rejects malformed room codes and placement indices", () => {
    const invalidRoom = decodeClientMessage({
      protocolVersion: 1,
      requestId: "request-2",
      type: "room.join",
      payload: { roomCode: "abc123", profile },
    });
    const invalidPlacement = decodeClientMessage({
      protocolVersion: 1,
      requestId: "request-3",
      type: "match.place",
      payload: {
        sessionToken: "token",
        matchId: "match-1",
        expectedRevision: 4,
        turn: 1,
        drawIndex: PVP_DRAW_SIZE,
        cellIndex: 25,
      },
    });

    expect(invalidRoom.ok).toBe(false);
    expect(invalidPlacement.ok).toBe(false);
  });

  it("rejects a structurally oversized Pool before business validation", () => {
    const oversizedPool = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`emoji-${index}`, 1]));
    const result = decodeClientMessage({
      protocolVersion: 1,
      requestId: "request-oversized-pool",
      type: "room.create",
      payload: { profile: { ...profile, pool: oversizedPool } },
    });

    expect(result.ok).toBe(false);
  });

  it("reports invalid JSON separately from an invalid message", () => {
    expect(parseClientMessage("{not-json")).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid-json" }),
    });
  });

  it("round-trips a recipient-specific match snapshot", () => {
    const message: ServerMessage = {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      messageId: "message-1",
      serverTime: 100,
      type: "match.updated",
      payload: {
        match,
        events: [
          {
            eventId: "event-1",
            actor: "host",
            target: "guest",
            kind: "placement",
            emojiId: "sword",
            icon: "⚔️",
            text: "1행 1열에 배치",
          },
        ],
      },
    };

    expect(decodeServerMessage(message)).toEqual({ ok: true, value: message });
    expect(parseServerMessage(serializeMultiplayerMessage(message))).toEqual({ ok: true, value: message });
  });

  it("accepts room snapshots without exposing the opponent Pool", () => {
    const message: ServerMessage = {
      protocolVersion: 1,
      messageId: "message-2",
      serverTime: 100,
      type: "room.created",
      payload: { sessionToken: "secret-token", room },
    };

    const decoded = decodeServerMessage(message);
    expect(decoded.ok).toBe(true);
    expect("pool" in room.host).toBe(false);
  });

  it("rejects match snapshots whose Board is not exactly 25 cells", () => {
    const message = {
      protocolVersion: 1,
      messageId: "message-3",
      serverTime: 100,
      type: "match.started",
      payload: { match: { ...match, board: [] } },
    };

    expect(decodeServerMessage(message).ok).toBe(false);
  });

  it("rejects a live Match snapshot that leaks the opponent Pool", () => {
    const message = {
      protocolVersion: 1,
      messageId: "message-4",
      serverTime: 100,
      type: "match.started",
      payload: {
        match: {
          ...match,
          players: {
            ...match.players,
            guest: { ...match.players.guest, pool: profile.pool },
          },
        },
      },
    };

    expect(decodeServerMessage(message).ok).toBe(false);
  });
});
