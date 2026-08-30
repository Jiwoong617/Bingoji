import { describe, expect, it } from "vitest";
import {
  PVP_BINGO_PRESENTATION_MS,
  PVP_PLACEMENT_GRACE_MS,
  type MultiplayerProfile,
  type PvpSeat,
} from "../src/shared";
import { createWaitingRoom, joinWaitingRoom, setRoomReady } from "./room-state";
import {
  autoPlaceExpiredMatch,
  createStoredPvpMatch,
  finishStoredMatch,
  isPlacementDeadlineExpired,
  isMatchDeadlineCurrent,
  matchEffectEvents,
  matchResult,
  matchSnapshotForSeat,
  placeInStoredMatch,
  PVP_TURN_TIMEOUT_MS,
  type StoredPvpMatch,
} from "./match-state";

const profile = (avatar: string, nickname: string): MultiplayerProfile => ({
  avatar,
  nickname,
  pool: { sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2 },
});

function readyRoom() {
  const created = createWaitingRoom("ABC234", profile("🙂", "호스트"), {
    playerId: "host-id",
    sessionToken: "host-token",
  }, 1_000);
  if (!created.ok) throw new Error(created.error.message);
  const joined = joinWaitingRoom(created.value.room, "ABC234", profile("😎", "게스트"), {
    playerId: "guest-id",
    sessionToken: "guest-token",
  }, 1_100);
  if (!joined.ok) throw new Error(joined.error.message);
  const hostReady = setRoomReady(joined.value.room, "host-token", true, 1_200);
  if (!hostReady.ok) throw new Error(hostReady.error.message);
  const guestReady = setRoomReady(hostReady.value, "guest-token", true, 1_300);
  if (!guestReady.ok) throw new Error(guestReady.error.message);
  return guestReady.value;
}

function activeMatch() {
  const created = createStoredPvpMatch(readyRoom(), "match-id", 2026, 2_000);
  if (!created.ok) throw new Error(created.error.message);
  return created.value;
}

describe("Durable Object PvP Match adapter", () => {
  it("starts one authoritative match after both players are ready", () => {
    const { room, match } = activeMatch();
    expect(room.status).toBe("in-game");
    expect(match.state.combat.board.every((cell) => cell === null)).toBe(true);
    expect(match.state.combat.player.hp).toBe(30);
    expect(match.state.combat.enemy.hp).toBe(30);
    expect(room.startsAt).toBeNull();
    expect(matchSnapshotForSeat(match, room, "host").startingSeat).toBe(match.state.startingSeat);
    expect(match.deadlineAt).toBe(2_000 + PVP_TURN_TIMEOUT_MS);
    expect(isMatchDeadlineCurrent(match)).toBe(true);
  });

  it("only exposes the active player's Draw to that player", () => {
    const { room, match } = activeMatch();
    const active = match.state.activeSeat;
    const inactive: PvpSeat = active === "host" ? "guest" : "host";
    expect(matchSnapshotForSeat(match, room, active).privateState.draw).toHaveLength(3);
    expect(matchSnapshotForSeat(match, room, inactive).privateState.draw).toEqual([]);
    expect(matchSnapshotForSeat(match, room, "host").privateState.pool).toEqual(room.host.profile.pool);
    expect(matchSnapshotForSeat(match, room, "guest").privateState.pool).toEqual(room.guest?.profile.pool);
  });

  it("maps Board ownership without exposing the other player's Pool", () => {
    const { room, match } = activeMatch();
    match.state.combat.board[0] = { emojiId: "sword", placedBy: "enemy" };
    const hostView = matchSnapshotForSeat(match, room, "host");
    expect(hostView.board[0]).toEqual({ emojiId: "sword", placedBy: "guest" });
    expect(hostView.players.guest).not.toHaveProperty("pool");
  });

  it("validates match id, revision, turn, active seat, Draw, and Cell", () => {
    const { match } = activeMatch();
    const base = {
      matchId: match.state.matchId,
      expectedRevision: match.state.revision,
      turn: match.state.turn,
      drawIndex: 0,
      cellIndex: 0,
    };
    const inactive: PvpSeat = match.state.activeSeat === "host" ? "guest" : "host";
    const errors = [
      placeInStoredMatch(match, match.state.activeSeat, { ...base, matchId: "wrong" }, 3_000),
      placeInStoredMatch(match, match.state.activeSeat, { ...base, expectedRevision: 99 }, 3_000),
      placeInStoredMatch(match, match.state.activeSeat, { ...base, turn: 99 }, 3_000),
      placeInStoredMatch(match, inactive, base, 3_000),
      placeInStoredMatch(match, match.state.activeSeat, { ...base, drawIndex: 9 }, 3_000),
    ];
    expect(errors.map((result) => result.ok ? null : result.error.code)).toEqual([
      "not-authorized",
      "stale-revision",
      "stale-revision",
      "not-your-turn",
      "invalid-draw",
    ]);
  });

  it("applies an accepted placement and returns protocol effect events", () => {
    const { room, match } = activeMatch();
    const placed = placeInStoredMatch(match, match.state.activeSeat, {
      matchId: match.state.matchId,
      expectedRevision: match.state.revision,
      turn: match.state.turn,
      drawIndex: 0,
      cellIndex: 0,
    }, 3_000);
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    expect(placed.value.state.revision).toBe(1);
    expect(placed.value.state.combat.board[0]).not.toBeNull();
    expect(matchEffectEvents(placed.value).every((event) => "eventId" in event)).toBe(true);
    expect(matchSnapshotForSeat(placed.value, room, "host").lastPlacement).toMatchObject({
      seat: match.state.activeSeat,
      cellIndex: 0,
      automatic: false,
    });
    expect(placed.value.deadlineAt).toBe(3_000 + PVP_TURN_TIMEOUT_MS);
  });

  it("starts the next full Turn timer only after Bingo presentation", () => {
    const { room, match } = activeMatch();
    for (let index = 0; index < 4; index += 1) {
      match.state.combat.board[index] = { emojiId: "sword", placedBy: "player" };
    }
    const placed = placeInStoredMatch(match, match.state.activeSeat, {
      matchId: match.state.matchId,
      expectedRevision: match.state.revision,
      turn: match.state.turn,
      drawIndex: 0,
      cellIndex: 4,
    }, 3_000);

    expect(placed.ok && placed.value.state.combat.lastBingo).not.toBeNull();
    expect(placed.ok && placed.value.deadlineAt).toBe(3_000 + PVP_BINGO_PRESENTATION_MS + PVP_TURN_TIMEOUT_MS);
    if (placed.ok) {
      const snapshot = matchSnapshotForSeat(placed.value, room, "host");
      expect(snapshot.lastBingo?.icons?.[0]).toHaveLength(5);
      expect(snapshot.lastBingo?.icons?.[0].every(Boolean)).toBe(true);
    }
  });

  it("auto-places deterministically only for the current expired deadline", () => {
    const { match } = activeMatch();
    const automaticAt = (match.deadlineAt ?? 0) + PVP_PLACEMENT_GRACE_MS;
    const early = autoPlaceExpiredMatch(match, automaticAt - 1);
    expect(early.ok ? null : early.error.code).toBe("turn-expired");
    const first = autoPlaceExpiredMatch(match, automaticAt);
    const second = autoPlaceExpiredMatch(match, automaticAt);
    expect(first).toEqual(second);
    expect(first.ok && first.value.state.lastPlacement?.automatic).toBe(true);
    expect(first.ok && first.value.state.revision).toBe(1);
  });

  it("accepts the network grace boundary before automatic placement", () => {
    const { match } = activeMatch();
    const deadline = match.deadlineAt ?? 0;
    expect(isPlacementDeadlineExpired(match, deadline)).toBe(false);
    expect(isPlacementDeadlineExpired(match, deadline + PVP_PLACEMENT_GRACE_MS - 1)).toBe(false);
    expect(isPlacementDeadlineExpired(match, deadline + PVP_PLACEMENT_GRACE_MS)).toBe(true);
  });

  it("rejects a stale Alarm snapshot", () => {
    const { match } = activeMatch();
    const stale = { ...match, deadlineRevision: match.state.revision + 1 };
    const result = autoPlaceExpiredMatch(stale, (stale.deadlineAt ?? 0) + PVP_PLACEMENT_GRACE_MS);
    expect(result.ok ? null : result.error.code).toBe("turn-expired");
  });

  it("finishes by forfeit or disconnect and clears the deadline", () => {
    const { room, match } = activeMatch();
    const forfeited = finishStoredMatch(match, "guest", "forfeit");
    expect(forfeited.state.outcome).toEqual({ winnerSeat: "guest", reason: "forfeit" });
    expect(forfeited.deadlineAt).toBeNull();
    expect(matchResult(forfeited, room, 3_000)?.reason).toBe("forfeit");
    const disconnected = finishStoredMatch(match, null, "disconnect");
    expect(disconnected.state.outcome).toEqual({ winnerSeat: null, reason: "disconnect" });
  });

  it("builds a final result only for a finished match", () => {
    const { room, match } = activeMatch();
    expect(matchResult(match, room, 3_000)).toBeNull();
    const finished: StoredPvpMatch = {
      ...match,
      state: { ...match.state, phase: "finished", outcome: { winnerSeat: "host", reason: "hp" } },
    };
    expect(matchResult(finished, room, 3_500)).toMatchObject({
      matchId: "match-id",
      winnerSeat: "host",
      reason: "hp",
      elapsedMs: 1_500,
    });
  });
});
