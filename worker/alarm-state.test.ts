import { describe, expect, it } from "vitest";
import { PVP_PLACEMENT_GRACE_MS, type MultiplayerProfile } from "../src/shared";
import { createStoredPvpMatch } from "./match-state";
import { nextRoomAlarmAt } from "./alarm-state";
import {
  createWaitingRoom,
  joinWaitingRoom,
  RECONNECT_GRACE_MS,
  setParticipantConnected,
  setRoomReady,
} from "./room-state";

const profile = (avatar: string, nickname: string): MultiplayerProfile => ({
  avatar,
  nickname,
  pool: { sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2 },
});

function activeRoomAndMatch() {
  const created = createWaitingRoom("ABC234", profile("🙂", "호스트"), {
    playerId: "host-id",
    sessionToken: "host-token",
  }, 0);
  if (!created.ok) throw new Error(created.error.message);
  const joined = joinWaitingRoom(created.value.room, "ABC234", profile("😎", "게스트"), {
    playerId: "guest-id",
    sessionToken: "guest-token",
  }, 1);
  if (!joined.ok) throw new Error(joined.error.message);
  const hostReady = setRoomReady(joined.value.room, "host-token", true);
  if (!hostReady.ok) throw new Error(hostReady.error.message);
  const guestReady = setRoomReady(hostReady.value, "guest-token", true);
  if (!guestReady.ok) throw new Error(guestReady.error.message);
  const started = createStoredPvpMatch(guestReady.value, "match-id", 2026, 1_000);
  if (!started.ok) throw new Error(started.error.message);
  return started.value;
}

describe("Durable Object Alarm schedule", () => {
  it("uses the current placement deadline", () => {
    const { room, match } = activeRoomAndMatch();
    expect(nextRoomAlarmAt(room, match, 1_000)).toBe((match.deadlineAt ?? 0) + PVP_PLACEMENT_GRACE_MS);
  });

  it("schedules the earlier reconnect deadline", () => {
    const { room, match } = activeRoomAndMatch();
    const disconnected = setParticipantConnected(room, "guest-token", false, 2_000);
    if (!disconnected.ok) throw new Error(disconnected.error.message);
    expect(nextRoomAlarmAt(disconnected.value, match, 2_000)).toBe((match.deadlineAt ?? 0) + PVP_PLACEMENT_GRACE_MS);
  });

  it("does not loop on the first expired deadline while both players are disconnected", () => {
    const { room, match } = activeRoomAndMatch();
    const hostDown = setParticipantConnected(room, "host-token", false, 2_000);
    if (!hostDown.ok) throw new Error(hostDown.error.message);
    const guestDown = setParticipantConnected(hostDown.value, "guest-token", false, 7_000);
    if (!guestDown.ok) throw new Error(guestDown.error.message);
    const afterHostGrace = 2_000 + RECONNECT_GRACE_MS;
    const expectedGuestGrace = 7_000 + RECONNECT_GRACE_MS;
    const matchWithoutDeadline = {
      ...match,
      deadlineAt: null,
      deadlineRevision: null,
      deadlineTurn: null,
      deadlineSeat: null,
    };
    expect(nextRoomAlarmAt(guestDown.value, matchWithoutDeadline, afterHostGrace)).toBe(expectedGuestGrace);
  });

  it("schedules immediately once a disconnect outcome is due", () => {
    const { room, match } = activeRoomAndMatch();
    const guestDown = setParticipantConnected(room, "guest-token", false, 2_000);
    if (!guestDown.ok) throw new Error(guestDown.error.message);
    const due = 2_000 + RECONNECT_GRACE_MS;
    expect(nextRoomAlarmAt(guestDown.value, match, due)).toBe(due);
  });
});
