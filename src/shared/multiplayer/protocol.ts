import type { Pool } from "../../game/types";
import { PVP_DRAW_SIZE } from "./match";
import { PVP_POOL_MAX_SIZE } from "./rules";
import type { MultiplayerProfile, PvpSeat } from "./types";

export type { MultiplayerProfile, PvpSeat } from "./types";

export const MULTIPLAYER_PROTOCOL_VERSION = 1 as const;

export type RoomStatus = "waiting" | "starting" | "in-game" | "finished" | "closed";
export type MatchPhase = "turn" | "resolving" | "finished";
export type MatchEndReason = "hp" | "forfeit" | "disconnect" | "server-error";

export interface RoomParticipantSnapshot {
  playerId: string;
  seat: PvpSeat;
  avatar: string;
  nickname: string;
  poolSize: number;
  ready: boolean;
  connected: boolean;
}

export interface RoomSnapshot {
  roomCode: string;
  revision: number;
  status: RoomStatus;
  host: RoomParticipantSnapshot;
  guest: RoomParticipantSnapshot | null;
  expiresAt: number;
}

export interface PvpStatusSnapshot {
  statusId: string;
  name: string;
  icon: string;
  value: number;
  duration?: number;
  description: string;
}

export interface PvpPlayerSnapshot {
  playerId: string;
  seat: PvpSeat;
  avatar: string;
  nickname: string;
  hp: number;
  maxHp: number;
  poolSize: number;
  statuses: PvpStatusSnapshot[];
  connected: boolean;
}

export interface PvpBoardCellSnapshot {
  emojiId: string;
  placedBy: PvpSeat;
  remainingTurns?: number;
  turnsOnBoard?: number;
}

export interface PvpBingoSnapshot {
  owner: PvpSeat;
  lineIds: string[];
  cells: number[][];
  multiplier: number;
}

export interface PvpPrivateMatchState {
  /** 이 Snapshot을 받은 플레이어의 자리입니다. */
  seat: PvpSeat;
  /** 자기 Pool만 전송합니다. 상대 Pool은 Match 종료 전까지 노출하지 않습니다. */
  pool: Pool;
  /** 자기 Turn에만 값이 있으며, 상대 Turn에는 빈 배열입니다. */
  draw: string[];
}

export interface PvpMatchSnapshot {
  matchId: string;
  revision: number;
  turn: number;
  phase: MatchPhase;
  board: Array<PvpBoardCellSnapshot | null>;
  players: Record<PvpSeat, PvpPlayerSnapshot>;
  activeSeat: PvpSeat | null;
  deadlineAt: number | null;
  placementsRemaining: number;
  lastBingo: PvpBingoSnapshot | null;
  privateState: PvpPrivateMatchState;
}

export interface PvpEffectEvent {
  eventId: string;
  actor: PvpSeat;
  target: PvpSeat;
  kind: "damage" | "heal" | "shield" | "status" | "placement" | "critical" | "log";
  emojiId: string;
  icon: string;
  text: string;
  lineId?: string;
  value?: number;
}

export interface PvpResultPlayerSnapshot extends PvpPlayerSnapshot {
  pool: Pool;
}

export interface PvpMatchResult {
  matchId: string;
  winnerSeat: PvpSeat | null;
  reason: MatchEndReason;
  turns: number;
  elapsedMs: number;
  players: Record<PvpSeat, PvpResultPlayerSnapshot>;
}

interface ClientEnvelopeBase {
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  requestId: string;
}

export type ClientMessage =
  | (ClientEnvelopeBase & {
      type: "room.create";
      payload: { profile: MultiplayerProfile };
    })
  | (ClientEnvelopeBase & {
      type: "room.join";
      payload: { roomCode: string; profile: MultiplayerProfile };
    })
  | (ClientEnvelopeBase & {
      type: "room.ready.set";
      payload: { sessionToken: string; ready: boolean };
    })
  | (ClientEnvelopeBase & {
      type: "room.leave";
      payload: { sessionToken: string };
    })
  | (ClientEnvelopeBase & {
      type: "session.resume";
      /** 같은 Page Runtime의 Memory에 남아 있는 Token으로만 사용합니다. */
      payload: { roomCode: string; sessionToken: string };
    })
  | (ClientEnvelopeBase & {
      type: "match.place";
      payload: {
        sessionToken: string;
        matchId: string;
        expectedRevision: number;
        turn: number;
        drawIndex: number;
        cellIndex: number;
      };
    })
  | (ClientEnvelopeBase & {
      type: "match.sync.request";
      payload: { sessionToken: string; matchId: string };
    })
  | (ClientEnvelopeBase & {
      type: "connection.ping";
      payload: { nonce: string };
    });

interface ServerEnvelopeBase {
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  messageId: string;
  serverTime: number;
  requestId?: string;
}

export type MultiplayerErrorCode =
  | "invalid-message"
  | "unsupported-protocol"
  | "invalid-profile"
  | "invalid-pool"
  | "room-not-found"
  | "room-full"
  | "room-started"
  | "room-closed"
  | "not-authorized"
  | "not-your-turn"
  | "stale-revision"
  | "turn-expired"
  | "invalid-draw"
  | "invalid-cell"
  | "server-error";

export type ServerMessage =
  | (ServerEnvelopeBase & {
      type: "room.created";
      payload: { sessionToken: string; room: RoomSnapshot };
    })
  | (ServerEnvelopeBase & {
      type: "room.joined";
      payload: { sessionToken: string; room: RoomSnapshot };
    })
  | (ServerEnvelopeBase & {
      type: "room.updated";
      payload: { room: RoomSnapshot };
    })
  | (ServerEnvelopeBase & {
      type: "room.closed";
      payload: { reason: "host-left" | "expired" | "server-error"; message: string };
    })
  | (ServerEnvelopeBase & {
      type: "session.resumed";
      payload: { room: RoomSnapshot; match: PvpMatchSnapshot | null };
    })
  | (ServerEnvelopeBase & {
      type: "match.started";
      payload: { match: PvpMatchSnapshot };
    })
  | (ServerEnvelopeBase & {
      type: "match.updated";
      payload: { match: PvpMatchSnapshot; events: PvpEffectEvent[] };
    })
  | (ServerEnvelopeBase & {
      type: "match.finished";
      payload: { result: PvpMatchResult };
    })
  | (ServerEnvelopeBase & {
      type: "error";
      payload: { code: MultiplayerErrorCode; message: string; retryable: boolean };
    })
  | (ServerEnvelopeBase & {
      type: "connection.pong";
      payload: { nonce: string };
    });

export interface ProtocolDecodeError {
  code: "invalid-json" | "invalid-message" | "unsupported-protocol";
  message: string;
}

export type ProtocolDecodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProtocolDecodeError };

type UnknownRecord = Record<string, unknown>;

const seats: readonly PvpSeat[] = ["host", "guest"];
const roomStatuses: readonly RoomStatus[] = ["waiting", "starting", "in-game", "finished", "closed"];
const matchPhases: readonly MatchPhase[] = ["turn", "resolving", "finished"];
const effectKinds: readonly PvpEffectEvent["kind"][] = ["damage", "heal", "shield", "status", "placement", "critical", "log"];
const matchEndReasons: readonly MatchEndReason[] = ["hp", "forfeit", "disconnect", "server-error"];
const roomCloseReasons = ["host-left", "expired", "server-error"] as const;
const errorCodes: readonly MultiplayerErrorCode[] = [
  "invalid-message",
  "unsupported-protocol",
  "invalid-profile",
  "invalid-pool",
  "room-not-found",
  "room-full",
  "room-started",
  "room-closed",
  "not-authorized",
  "not-your-turn",
  "stale-revision",
  "turn-expired",
  "invalid-draw",
  "invalid-cell",
  "server-error",
];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isBoundedString(value: unknown, maxLength = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isSeat(value: unknown): value is PvpSeat {
  return seats.includes(value as PvpSeat);
}

export function isRoomCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(value);
}

function isPool(value: unknown): value is Pool {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= PVP_POOL_MAX_SIZE && entries.every(
    ([emojiId, count]) => emojiId.length > 0 && emojiId.length <= 64 && Number.isInteger(count),
  );
}

function isProfile(value: unknown): value is MultiplayerProfile {
  return isRecord(value)
    && isBoundedString(value.avatar, 32)
    && isBoundedString(value.nickname, 64)
    && isPool(value.pool);
}

function isRoomParticipant(value: unknown): value is RoomParticipantSnapshot {
  return isRecord(value)
    && isBoundedString(value.playerId, 128)
    && isSeat(value.seat)
    && isBoundedString(value.avatar, 32)
    && isBoundedString(value.nickname, 64)
    && isNonNegativeInteger(value.poolSize)
    && typeof value.ready === "boolean"
    && typeof value.connected === "boolean"
    && !("pool" in value);
}

function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  return isRecord(value)
    && isRoomCode(value.roomCode)
    && isNonNegativeInteger(value.revision)
    && roomStatuses.includes(value.status as RoomStatus)
    && isRoomParticipant(value.host)
    && value.host.seat === "host"
    && (value.guest === null || (isRoomParticipant(value.guest) && value.guest.seat === "guest"))
    && isFiniteNumber(value.expiresAt);
}

function isStatus(value: unknown): value is PvpStatusSnapshot {
  return isRecord(value)
    && isBoundedString(value.statusId, 64)
    && isBoundedString(value.name, 64)
    && isBoundedString(value.icon, 32)
    && isFiniteNumber(value.value)
    && (value.duration === undefined || isFiniteNumber(value.duration))
    && typeof value.description === "string";
}

function isPlayerSnapshot(value: unknown, allowPool = false): value is PvpPlayerSnapshot {
  return isRecord(value)
    && isBoundedString(value.playerId, 128)
    && isSeat(value.seat)
    && isBoundedString(value.avatar, 32)
    && isBoundedString(value.nickname, 64)
    && isFiniteNumber(value.hp)
    && isFiniteNumber(value.maxHp)
    && isNonNegativeInteger(value.poolSize)
    && Array.isArray(value.statuses)
    && value.statuses.every(isStatus)
    && typeof value.connected === "boolean"
    && (allowPool || !("pool" in value));
}

function isBoardCell(value: unknown): value is PvpBoardCellSnapshot {
  return isRecord(value)
    && isBoundedString(value.emojiId, 64)
    && isSeat(value.placedBy)
    && (value.remainingTurns === undefined || isNonNegativeInteger(value.remainingTurns))
    && (value.turnsOnBoard === undefined || isNonNegativeInteger(value.turnsOnBoard));
}

function isBingo(value: unknown): value is PvpBingoSnapshot {
  return isRecord(value)
    && isSeat(value.owner)
    && Array.isArray(value.lineIds)
    && value.lineIds.every((item) => isBoundedString(item, 64))
    && Array.isArray(value.cells)
    && value.cells.every((line) => Array.isArray(line) && line.every((cell) => isNonNegativeInteger(cell) && cell < 25))
    && isNonNegativeInteger(value.multiplier);
}

function isPrivateMatchState(value: unknown): value is PvpPrivateMatchState {
  return isRecord(value)
    && isSeat(value.seat)
    && isPool(value.pool)
    && Array.isArray(value.draw)
    && value.draw.every((item) => isBoundedString(item, 64));
}

function isMatchSnapshot(value: unknown): value is PvpMatchSnapshot {
  if (!isRecord(value) || !isRecord(value.players)) return false;
  return isBoundedString(value.matchId, 128)
    && isNonNegativeInteger(value.revision)
    && isNonNegativeInteger(value.turn)
    && matchPhases.includes(value.phase as MatchPhase)
    && Array.isArray(value.board)
    && value.board.length === 25
    && value.board.every((cell) => cell === null || isBoardCell(cell))
    && isPlayerSnapshot(value.players.host)
    && value.players.host.seat === "host"
    && isPlayerSnapshot(value.players.guest)
    && value.players.guest.seat === "guest"
    && (value.activeSeat === null || isSeat(value.activeSeat))
    && (value.deadlineAt === null || isFiniteNumber(value.deadlineAt))
    && isNonNegativeInteger(value.placementsRemaining)
    && (value.lastBingo === null || isBingo(value.lastBingo))
    && isPrivateMatchState(value.privateState);
}

function isEffectEvent(value: unknown): value is PvpEffectEvent {
  return isRecord(value)
    && isBoundedString(value.eventId, 128)
    && isSeat(value.actor)
    && isSeat(value.target)
    && effectKinds.includes(value.kind as PvpEffectEvent["kind"])
    && isBoundedString(value.emojiId, 64)
    && typeof value.icon === "string"
    && typeof value.text === "string"
    && (value.lineId === undefined || isBoundedString(value.lineId, 64))
    && (value.value === undefined || isFiniteNumber(value.value));
}

function isResultPlayer(value: unknown): value is PvpResultPlayerSnapshot {
  if (!isRecord(value) || !isPlayerSnapshot(value, true)) return false;
  return isPool((value as UnknownRecord).pool);
}

function isMatchResult(value: unknown): value is PvpMatchResult {
  if (!isRecord(value) || !isRecord(value.players)) return false;
  return isBoundedString(value.matchId, 128)
    && (value.winnerSeat === null || isSeat(value.winnerSeat))
    && matchEndReasons.includes(value.reason as MatchEndReason)
    && isNonNegativeInteger(value.turns)
    && isNonNegativeInteger(value.elapsedMs)
    && isResultPlayer(value.players.host)
    && value.players.host.seat === "host"
    && isResultPlayer(value.players.guest)
    && value.players.guest.seat === "guest";
}

function hasClientBase(value: UnknownRecord): boolean {
  return value.protocolVersion === MULTIPLAYER_PROTOCOL_VERSION
    && isBoundedString(value.requestId, 64)
    && isRecord(value.payload);
}

function hasSessionToken(payload: UnknownRecord): boolean {
  return isBoundedString(payload.sessionToken, 256);
}

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!isRecord(value) || !hasClientBase(value)) return false;
  const payload = value.payload as UnknownRecord;
  switch (value.type) {
    case "room.create":
      return isProfile(payload.profile);
    case "room.join":
      return isRoomCode(payload.roomCode) && isProfile(payload.profile);
    case "room.ready.set":
      return hasSessionToken(payload) && typeof payload.ready === "boolean";
    case "room.leave":
      return hasSessionToken(payload);
    case "session.resume":
      return isRoomCode(payload.roomCode) && hasSessionToken(payload);
    case "match.place":
      return hasSessionToken(payload)
        && isBoundedString(payload.matchId, 128)
        && isNonNegativeInteger(payload.expectedRevision)
        && isNonNegativeInteger(payload.turn)
        && isNonNegativeInteger(payload.drawIndex)
        && payload.drawIndex < PVP_DRAW_SIZE
        && isNonNegativeInteger(payload.cellIndex)
        && payload.cellIndex < 25;
    case "match.sync.request":
      return hasSessionToken(payload) && isBoundedString(payload.matchId, 128);
    case "connection.ping":
      return isBoundedString(payload.nonce, 128);
    default:
      return false;
  }
}

function hasServerBase(value: UnknownRecord): boolean {
  return value.protocolVersion === MULTIPLAYER_PROTOCOL_VERSION
    && isBoundedString(value.messageId, 128)
    && isFiniteNumber(value.serverTime)
    && (value.requestId === undefined || isBoundedString(value.requestId, 64))
    && isRecord(value.payload);
}

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!isRecord(value) || !hasServerBase(value)) return false;
  const payload = value.payload as UnknownRecord;
  switch (value.type) {
    case "room.created":
    case "room.joined":
      return isBoundedString(payload.sessionToken, 256) && isRoomSnapshot(payload.room);
    case "room.updated":
      return isRoomSnapshot(payload.room);
    case "room.closed":
      return roomCloseReasons.includes(payload.reason as (typeof roomCloseReasons)[number])
        && typeof payload.message === "string";
    case "session.resumed":
      return isRoomSnapshot(payload.room)
        && (payload.match === null || isMatchSnapshot(payload.match));
    case "match.started":
      return isMatchSnapshot(payload.match);
    case "match.updated":
      return isMatchSnapshot(payload.match)
        && Array.isArray(payload.events)
        && payload.events.every(isEffectEvent);
    case "match.finished":
      return isMatchResult(payload.result);
    case "error":
      return errorCodes.includes(payload.code as MultiplayerErrorCode)
        && typeof payload.message === "string"
        && typeof payload.retryable === "boolean";
    case "connection.pong":
      return isBoundedString(payload.nonce, 128);
    default:
      return false;
  }
}

function decodeValue<T>(
  value: unknown,
  guard: (candidate: unknown) => candidate is T,
): ProtocolDecodeResult<T> {
  if (
    isRecord(value)
    && "protocolVersion" in value
    && value.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION
  ) {
    return {
      ok: false,
      error: {
        code: "unsupported-protocol",
        message: `지원하지 않는 Protocol version입니다: ${String(value.protocolVersion)}`,
      },
    };
  }
  if (!guard(value)) {
    return { ok: false, error: { code: "invalid-message", message: "메시지 형식이 올바르지 않습니다." } };
  }
  return { ok: true, value };
}

function parseValue<T>(
  serialized: string,
  guard: (candidate: unknown) => candidate is T,
): ProtocolDecodeResult<T> {
  try {
    return decodeValue(JSON.parse(serialized) as unknown, guard);
  } catch {
    return { ok: false, error: { code: "invalid-json", message: "JSON 메시지를 해석할 수 없습니다." } };
  }
}

export function decodeClientMessage(value: unknown): ProtocolDecodeResult<ClientMessage> {
  return decodeValue(value, isClientMessage);
}

export function parseClientMessage(serialized: string): ProtocolDecodeResult<ClientMessage> {
  return parseValue(serialized, isClientMessage);
}

export function decodeServerMessage(value: unknown): ProtocolDecodeResult<ServerMessage> {
  return decodeValue(value, isServerMessage);
}

export function parseServerMessage(serialized: string): ProtocolDecodeResult<ServerMessage> {
  return parseValue(serialized, isServerMessage);
}

export function serializeMultiplayerMessage(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}
