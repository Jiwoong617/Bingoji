import {
  applyPvpMatchCommand,
  createPvpMatch,
  poolSize,
  PVP_BINGO_PRESENTATION_MS,
  PVP_PLACEMENT_GRACE_MS,
  PVP_STANDARD_PRESENTATION_MS,
  PVP_TURN_TIMEOUT_MS,
  type CombatantState,
  type MultiplayerErrorCode,
  type PvpEffectEvent,
  type PvpMatchParticipant,
  type PvpMatchResult,
  type PvpMatchSnapshot,
  type PvpMatchState,
  type PvpPlayerSnapshot,
  type PvpSeat,
  type PvpStatusSnapshot,
  type StatusState,
} from "../src/shared";
import type { RoomOperationError, StoredRoomParticipant, StoredRoomState } from "./room-state";

export interface StoredPvpMatch {
  state: PvpMatchState;
  startedAt: number;
  deadlineAt: number | null;
  deadlineRevision: number | null;
  deadlineTurn: number | null;
  deadlineSeat: PvpSeat | null;
}

export { PVP_TURN_TIMEOUT_MS };

export type MatchOperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RoomOperationError };

function matchParticipant(participant: StoredRoomParticipant): PvpMatchParticipant {
  return {
    playerId: participant.playerId,
    avatar: participant.profile.avatar,
    nickname: participant.profile.nickname,
    pool: { ...participant.profile.pool },
  };
}

export function createStoredPvpMatch(
  room: StoredRoomState,
  matchId: string,
  seed: number,
  now: number,
): MatchOperationResult<{ room: StoredRoomState; match: StoredPvpMatch }> {
  if (
    room.status !== "starting"
    || !room.guest
    || !room.host.ready
    || !room.guest.ready
  ) {
    return {
      ok: false,
      error: { code: "server-error", message: "대전 시작 조건이 충족되지 않았습니다.", retryable: false },
    };
  }
  const state = createPvpMatch({
    matchId,
    host: matchParticipant(room.host),
    guest: matchParticipant(room.guest),
    seed,
  });
  return {
    ok: true,
    value: {
      room: { ...room, revision: room.revision + 1, status: "in-game" },
      match: armMatchDeadline({
        state,
        startedAt: now,
        deadlineAt: null,
        deadlineRevision: null,
        deadlineTurn: null,
        deadlineSeat: null,
      }, now, 0),
    },
  };
}

function statuses(combatant: CombatantState): PvpStatusSnapshot[] {
  return Object.values(combatant.statuses)
    .filter((status): status is StatusState => !!status && status.value > 0)
    .map((status) => ({
      statusId: status.statusId,
      name: status.name,
      icon: status.icon,
      value: status.value,
      ...(status.duration === undefined ? {} : { duration: status.duration }),
      description: status.description,
    }));
}

function playerSnapshot(
  participant: StoredRoomParticipant,
  combatant: CombatantState,
): PvpPlayerSnapshot {
  return {
    playerId: participant.playerId,
    seat: participant.seat,
    avatar: participant.profile.avatar,
    nickname: participant.profile.nickname,
    hp: combatant.hp,
    maxHp: combatant.maxHp,
    poolSize: poolSize(combatant.pool),
    statuses: statuses(combatant),
    connected: participant.connected,
  };
}

export function matchSnapshotForSeat(
  stored: StoredPvpMatch,
  room: StoredRoomState,
  viewerSeat: PvpSeat,
): PvpMatchSnapshot {
  if (!room.guest) throw new Error("PvP Match Snapshot에는 Guest가 필요합니다.");
  const { state } = stored;
  const viewerCombatant = viewerSeat === "host" ? state.combat.player : state.combat.enemy;
  return {
    matchId: state.matchId,
    revision: state.revision,
    turn: state.turn,
    phase: state.phase,
    board: state.combat.board.map((cell) => cell ? ({
      emojiId: cell.emojiId,
      placedBy: cell.placedBy === "player" ? "host" : "guest",
      ...(cell.remainingTurns === undefined ? {} : { remainingTurns: cell.remainingTurns }),
      ...(cell.turnsOnBoard === undefined ? {} : { turnsOnBoard: cell.turnsOnBoard }),
    }) : null),
    players: {
      host: playerSnapshot(room.host, state.combat.player),
      guest: playerSnapshot(room.guest, state.combat.enemy),
    },
    activeSeat: state.phase === "finished" ? null : state.activeSeat,
    deadlineAt: state.phase === "finished" ? null : stored.deadlineAt,
    placementsRemaining: state.combat.placementsRemaining,
    lastBingo: state.combat.lastBingo ? {
      owner: state.combat.lastBingo.owner === "player" ? "host" : "guest",
      lineIds: [...state.combat.lastBingo.lineIds],
      cells: state.combat.lastBingo.cells.map((line) => [...line]),
      multiplier: state.combat.lastBingo.multiplier,
    } : null,
    privateState: {
      seat: viewerSeat,
      pool: { ...viewerCombatant.pool },
      draw: state.phase !== "finished" && state.activeSeat === viewerSeat
        ? [...state.combat.draw]
        : [],
    },
  };
}

export function matchEffectEvents(stored: StoredPvpMatch): PvpEffectEvent[] {
  return stored.state.events.map((event) => ({
    eventId: event.id,
    actor: event.actor,
    target: event.target,
    kind: event.kind,
    emojiId: event.emojiId,
    icon: event.icon,
    text: event.text,
    ...(event.lineId === undefined ? {} : { lineId: event.lineId }),
    ...(event.value === undefined ? {} : { value: event.value }),
  }));
}

function placementError(code: string, message: string): RoomOperationError {
  const mapped: MultiplayerErrorCode = code === "not-your-turn"
    ? "not-your-turn"
    : code === "invalid-draw"
      ? "invalid-draw"
      : code === "invalid-cell" || code === "no-empty-cell"
        ? "invalid-cell"
        : "server-error";
  return { code: mapped, message, retryable: false };
}

export function placeInStoredMatch(
  stored: StoredPvpMatch,
  seat: PvpSeat,
  input: {
    matchId: string;
    expectedRevision: number;
    turn: number;
    drawIndex: number;
    cellIndex: number;
  },
  now: number,
): MatchOperationResult<StoredPvpMatch> {
  if (input.matchId !== stored.state.matchId) {
    return { ok: false, error: { code: "not-authorized", message: "현재 방의 Match가 아닙니다.", retryable: false } };
  }
  if (input.expectedRevision !== stored.state.revision || input.turn !== stored.state.turn) {
    return {
      ok: false,
      error: { code: "stale-revision", message: "오래된 전투 상태입니다. 최신 Snapshot을 동기화해 주세요.", retryable: true },
    };
  }
  const applied = applyPvpMatchCommand(stored.state, {
    type: "place",
    seat,
    drawIndex: input.drawIndex,
    cellIndex: input.cellIndex,
  });
  if (!applied.ok) return { ok: false, error: placementError(applied.error.code, applied.error.message) };
  return {
    ok: true,
    value: armMatchDeadline({ ...stored, state: applied.state }, now),
  };
}

function matchPresentationMs(stored: StoredPvpMatch): number {
  if (stored.state.events.length === 0) return 0;
  return stored.state.combat.lastBingo ? PVP_BINGO_PRESENTATION_MS : PVP_STANDARD_PRESENTATION_MS;
}

export function armMatchDeadline(
  stored: StoredPvpMatch,
  now: number,
  presentationMs = matchPresentationMs(stored),
): StoredPvpMatch {
  if (stored.state.phase === "finished") {
    return {
      ...stored,
      deadlineAt: null,
      deadlineRevision: null,
      deadlineTurn: null,
      deadlineSeat: null,
    };
  }
  return {
    ...stored,
    deadlineAt: now + presentationMs + PVP_TURN_TIMEOUT_MS,
    deadlineRevision: stored.state.revision,
    deadlineTurn: stored.state.turn,
    deadlineSeat: stored.state.activeSeat,
  };
}

export function isMatchDeadlineCurrent(stored: StoredPvpMatch): boolean {
  return stored.deadlineAt !== null
    && stored.deadlineRevision === stored.state.revision
    && stored.deadlineTurn === stored.state.turn
    && stored.deadlineSeat === stored.state.activeSeat
    && stored.state.phase !== "finished";
}

export function isPlacementDeadlineExpired(stored: StoredPvpMatch, now: number): boolean {
  return stored.deadlineAt !== null && stored.deadlineAt + PVP_PLACEMENT_GRACE_MS <= now;
}

export function autoPlaceExpiredMatch(
  stored: StoredPvpMatch,
  now: number,
): MatchOperationResult<StoredPvpMatch> {
  if (!isMatchDeadlineCurrent(stored) || !isPlacementDeadlineExpired(stored, now) || !stored.deadlineSeat) {
    return {
      ok: false,
      error: { code: "turn-expired", message: "처리할 수 있는 만료 Turn이 없습니다.", retryable: false },
    };
  }
  const applied = applyPvpMatchCommand(stored.state, { type: "auto-place", seat: stored.deadlineSeat });
  if (!applied.ok) return { ok: false, error: placementError(applied.error.code, applied.error.message) };
  return {
    ok: true,
    value: armMatchDeadline({ ...stored, state: applied.state }, now),
  };
}

export function finishStoredMatch(
  stored: StoredPvpMatch,
  winnerSeat: PvpSeat | null,
  reason: "forfeit" | "disconnect" | "server-error",
): StoredPvpMatch {
  if (stored.state.phase === "finished") return stored;
  return {
    ...stored,
    state: {
      ...stored.state,
      revision: stored.state.revision + 1,
      phase: "finished",
      events: [],
      outcome: { winnerSeat, reason },
    },
    deadlineAt: null,
    deadlineRevision: null,
    deadlineTurn: null,
    deadlineSeat: null,
  };
}

export function matchResult(
  stored: StoredPvpMatch,
  room: StoredRoomState,
  now: number,
): PvpMatchResult | null {
  if (stored.state.phase !== "finished" || !stored.state.outcome || !room.guest) return null;
  const host = playerSnapshot(room.host, stored.state.combat.player);
  const guest = playerSnapshot(room.guest, stored.state.combat.enemy);
  return {
    matchId: stored.state.matchId,
    winnerSeat: stored.state.outcome.winnerSeat,
    reason: stored.state.outcome.reason,
    turns: stored.state.turn,
    elapsedMs: Math.max(0, now - stored.startedAt),
    players: {
      host: { ...host, pool: { ...stored.state.combat.player.pool } },
      guest: { ...guest, pool: { ...stored.state.combat.enemy.pool } },
    },
  };
}
