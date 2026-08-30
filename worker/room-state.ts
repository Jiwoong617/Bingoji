import {
  PVP_MATCH_START_COUNTDOWN_MS,
  poolSize,
  validateMultiplayerProfile,
  type MultiplayerErrorCode,
  type MultiplayerProfile,
  type PvpSeat,
  type RoomParticipantSnapshot,
  type RoomSnapshot,
  type RoomStatus,
} from "../src/shared";

export const ROOM_TTL_MS = 30 * 60 * 1_000;
export const RECONNECT_GRACE_MS = 30_000;

export interface StoredRoomParticipant {
  playerId: string;
  seat: PvpSeat;
  profile: MultiplayerProfile;
  sessionToken: string;
  ready: boolean;
  connected: boolean;
  disconnectedAt: number | null;
}

export interface StoredRoomState {
  roomCode: string;
  revision: number;
  status: RoomStatus;
  host: StoredRoomParticipant;
  guest: StoredRoomParticipant | null;
  createdAt: number;
  expiresAt: number;
  startsAt: number | null;
}

export interface RoomOperationError {
  code: MultiplayerErrorCode;
  message: string;
  retryable: boolean;
}

export type RoomOperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RoomOperationError };

interface ParticipantIds {
  playerId: string;
  sessionToken: string;
}

function cloneProfile(profile: MultiplayerProfile, nickname: string): MultiplayerProfile {
  return { avatar: profile.avatar, nickname, pool: { ...profile.pool } };
}

function validatedProfile(profile: MultiplayerProfile): RoomOperationResult<MultiplayerProfile> {
  const validation = validateMultiplayerProfile(profile);
  if (!validation.pool.valid) {
    return {
      ok: false,
      error: { code: "invalid-pool", message: "PvP Pool 구성 규칙을 확인해 주세요.", retryable: false },
    };
  }
  if (!validation.valid) {
    return {
      ok: false,
      error: { code: "invalid-profile", message: "Avatar 또는 닉네임이 올바르지 않습니다.", retryable: false },
    };
  }
  return { ok: true, value: cloneProfile(profile, validation.normalizedNickname) };
}

function participant(
  seat: PvpSeat,
  profile: MultiplayerProfile,
  ids: ParticipantIds,
): StoredRoomParticipant {
  return {
    playerId: ids.playerId,
    sessionToken: ids.sessionToken,
    seat,
    profile,
    ready: false,
    connected: true,
    disconnectedAt: null,
  };
}

function publicParticipant(value: StoredRoomParticipant): RoomParticipantSnapshot {
  return {
    playerId: value.playerId,
    seat: value.seat,
    avatar: value.profile.avatar,
    nickname: value.profile.nickname,
    poolSize: poolSize(value.profile.pool),
    ready: value.ready,
    connected: value.connected,
  };
}

export function roomSnapshot(room: StoredRoomState): RoomSnapshot {
  return {
    roomCode: room.roomCode,
    revision: room.revision,
    status: room.status,
    host: publicParticipant(room.host),
    guest: room.guest ? publicParticipant(room.guest) : null,
    expiresAt: room.expiresAt,
    startsAt: room.startsAt ?? null,
  };
}

export function isRoomAvailableForCreate(room: StoredRoomState | null, now: number): boolean {
  if (!room || room.status === "closed") return true;
  if (room.status === "in-game" || room.status === "starting") return false;
  return room.expiresAt <= now;
}

export function createWaitingRoom(
  roomCode: string,
  profile: MultiplayerProfile,
  ids: ParticipantIds,
  now: number,
): RoomOperationResult<{ room: StoredRoomState; participant: StoredRoomParticipant }> {
  const validated = validatedProfile(profile);
  if (!validated.ok) return validated;
  const host = participant("host", validated.value, ids);
  const room: StoredRoomState = {
    roomCode,
    revision: 1,
    status: "waiting",
    host,
    guest: null,
    createdAt: now,
    expiresAt: now + ROOM_TTL_MS,
    startsAt: null,
  };
  return { ok: true, value: { room, participant: host } };
}

export function joinWaitingRoom(
  room: StoredRoomState | null,
  roomCode: string,
  profile: MultiplayerProfile,
  ids: ParticipantIds,
  now: number,
): RoomOperationResult<{ room: StoredRoomState; participant: StoredRoomParticipant }> {
  if (!room || room.roomCode !== roomCode || room.expiresAt <= now || room.status === "closed") {
    return { ok: false, error: { code: "room-not-found", message: "존재하지 않는 방코드입니다.", retryable: false } };
  }
  if (room.status !== "waiting") {
    return { ok: false, error: { code: "room-started", message: "이미 게임이 시작된 방입니다.", retryable: false } };
  }
  if (room.guest) {
    return { ok: false, error: { code: "room-full", message: "이미 가득 찬 방입니다.", retryable: false } };
  }
  const validated = validatedProfile(profile);
  if (!validated.ok) return validated;
  const guest = participant("guest", validated.value, ids);
  return {
    ok: true,
    value: {
      participant: guest,
      room: { ...room, revision: room.revision + 1, guest },
    },
  };
}

export function participantByToken(
  room: StoredRoomState,
  sessionToken: string,
): StoredRoomParticipant | null {
  if (room.host.sessionToken === sessionToken) return room.host;
  if (room.guest?.sessionToken === sessionToken) return room.guest;
  return null;
}

export function setRoomReady(
  room: StoredRoomState,
  sessionToken: string,
  ready: boolean,
  now: number,
): RoomOperationResult<StoredRoomState> {
  if (room.status !== "waiting") {
    return { ok: false, error: { code: "room-started", message: "이미 게임 시작 절차가 진행 중입니다.", retryable: false } };
  }
  const current = participantByToken(room, sessionToken);
  if (!current) {
    return { ok: false, error: { code: "not-authorized", message: "이 방의 참가자 Session이 아닙니다.", retryable: false } };
  }
  if (current.ready === ready) return { ok: true, value: room };

  const updatedParticipant = { ...current, ready };
  const host = current.seat === "host" ? updatedParticipant : room.host;
  const guest = current.seat === "guest" ? updatedParticipant : room.guest;
  const bothReady = host.ready && guest?.ready === true;
  return {
    ok: true,
    value: {
      ...room,
      revision: room.revision + 1,
      status: bothReady ? "starting" : "waiting",
      startsAt: bothReady ? now + PVP_MATCH_START_COUNTDOWN_MS : null,
      host,
      guest,
    },
  };
}

export function setParticipantConnected(
  room: StoredRoomState,
  sessionToken: string,
  connected: boolean,
  now: number,
): RoomOperationResult<StoredRoomState> {
  const current = participantByToken(room, sessionToken);
  if (!current) {
    return { ok: false, error: { code: "not-authorized", message: "이 방의 참가자 Session이 아닙니다.", retryable: false } };
  }
  if (current.connected === connected) return { ok: true, value: room };
  const updated = { ...current, connected, disconnectedAt: connected ? null : now };
  return {
    ok: true,
    value: {
      ...room,
      revision: room.revision + 1,
      host: current.seat === "host" ? updated : room.host,
      guest: current.seat === "guest" ? updated : room.guest,
    },
  };
}

export function leaveWaitingRoom(
  room: StoredRoomState,
  sessionToken: string,
): RoomOperationResult<{ room: StoredRoomState | null; seat: PvpSeat }> {
  const current = participantByToken(room, sessionToken);
  if (!current) {
    return { ok: false, error: { code: "not-authorized", message: "이 방의 참가자 Session이 아닙니다.", retryable: false } };
  }
  if (current.seat === "host") return { ok: true, value: { room: null, seat: "host" } };
  return {
    ok: true,
    value: {
      seat: "guest",
      room: {
        ...room,
        revision: room.revision + 1,
        status: "waiting",
        startsAt: null,
        host: { ...room.host, ready: false },
        guest: null,
      },
    },
  };
}

export function disconnectWinnerAfterGrace(
  room: StoredRoomState,
  now: number,
): PvpSeat | null | undefined {
  const expired = (participant: StoredRoomParticipant | null) => (
    !!participant
    && !participant.connected
    && participant.disconnectedAt !== null
    && participant.disconnectedAt + RECONNECT_GRACE_MS <= now
  );
  const hostExpired = expired(room.host);
  const guestExpired = expired(room.guest);
  if (!room.host.connected && room.guest && !room.guest.connected) {
    return hostExpired && guestExpired ? null : undefined;
  }
  if (!hostExpired && !guestExpired) return undefined;
  if (hostExpired && guestExpired) return null;
  return hostExpired ? "guest" : "host";
}
