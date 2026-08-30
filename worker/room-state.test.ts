import { describe, expect, it } from "vitest";
import type { MultiplayerProfile } from "../src/shared";
import {
  createWaitingRoom,
  disconnectWinnerAfterGrace,
  isRoomAvailableForCreate,
  joinWaitingRoom,
  leaveWaitingRoom,
  participantByToken,
  RECONNECT_GRACE_MS,
  ROOM_TTL_MS,
  roomSnapshot,
  setParticipantConnected,
  setRoomReady,
} from "./room-state";

const profile = (nickname: string): MultiplayerProfile => ({
  avatar: "🙂",
  nickname,
  pool: { sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2 },
});

function roomWithGuest() {
  const created = createWaitingRoom("ABC234", profile("호스트"), {
    playerId: "host-id",
    sessionToken: "host-token",
  }, 1_000);
  if (!created.ok) throw new Error(created.error.message);
  const joined = joinWaitingRoom(created.value.room, "ABC234", profile("게스트"), {
    playerId: "guest-id",
    sessionToken: "guest-token",
  }, 2_000);
  if (!joined.ok) throw new Error(joined.error.message);
  return joined.value.room;
}

describe("waiting room state", () => {
  it("creates a private host record and a public snapshot", () => {
    const result = createWaitingRoom("ABC234", profile("  호스트  "), {
      playerId: "host-id",
      sessionToken: "host-token",
    }, 10_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.room.expiresAt).toBe(10_000 + ROOM_TTL_MS);
    expect(result.value.room.host.profile.nickname).toBe("호스트");
    expect(roomSnapshot(result.value.room)).not.toHaveProperty("host.profile.pool");
    expect(JSON.stringify(roomSnapshot(result.value.room))).not.toContain("host-token");
  });

  it("never reuses a live in-game room even after its waiting-room expiry time", () => {
    const room = roomWithGuest();
    expect(isRoomAvailableForCreate({ ...room, status: "waiting" }, room.expiresAt - 1)).toBe(false);
    expect(isRoomAvailableForCreate({ ...room, status: "waiting" }, room.expiresAt)).toBe(true);
    expect(isRoomAvailableForCreate({ ...room, status: "in-game" }, room.expiresAt + 1_000_000)).toBe(false);
  });

  it("rejects invalid profiles and pools", () => {
    const badPool = createWaitingRoom("ABC234", { ...profile("호스트"), pool: { sword: 2 } }, {
      playerId: "host-id",
      sessionToken: "host-token",
    }, 0);
    const badName = createWaitingRoom("ABC234", profile("!"), {
      playerId: "host-id",
      sessionToken: "host-token",
    }, 0);
    expect(badPool.ok ? null : badPool.error.code).toBe("invalid-pool");
    expect(badName.ok ? null : badName.error.code).toBe("invalid-profile");
  });

  it("joins one guest and rejects full, missing, expired, and started rooms", () => {
    const room = roomWithGuest();
    const attempt = (target: typeof room | null, now = 2_000) => joinWaitingRoom(target, "ABC234", profile("새손님"), {
      playerId: "other-id",
      sessionToken: "other-token",
    }, now);
    expect(attempt(room).ok ? null : attempt(room).error.code).toBe("room-full");
    expect(attempt(null).ok ? null : attempt(null).error.code).toBe("room-not-found");
    expect(attempt({ ...room, expiresAt: 1_999 }).ok ? null : attempt({ ...room, expiresAt: 1_999 }).error.code).toBe("room-not-found");
    expect(attempt({ ...room, guest: null, status: "starting" }).ok ? null : attempt({ ...room, guest: null, status: "starting" }).error.code).toBe("room-started");
  });

  it("allows the host to ready before a guest joins", () => {
    const created = createWaitingRoom("ABC234", profile("호스트"), { playerId: "host-id", sessionToken: "host-token" }, 0);
    if (!created.ok) throw new Error(created.error.message);
    const ready = setRoomReady(created.value.room, "host-token", true, 1_000);
    expect(ready.ok && ready.value.host.ready).toBe(true);
    expect(ready.ok && ready.value.status).toBe("waiting");
  });

  it("moves to starting exactly when both participants are ready", () => {
    let room = roomWithGuest();
    const hostReady = setRoomReady(room, "host-token", true, 1_000);
    if (!hostReady.ok) throw new Error(hostReady.error.message);
    room = hostReady.value;
    expect(room.status).toBe("waiting");
    const guestReady = setRoomReady(room, "guest-token", true, 1_500);
    expect(guestReady.ok && guestReady.value.status).toBe("starting");
    expect(guestReady.ok && guestReady.value.revision).toBe(room.revision + 1);
    expect(guestReady.ok && guestReady.value.startsAt).toBe(4_500);
  });

  it("does not increment revision for an idempotent ready value", () => {
    const room = roomWithGuest();
    const unchanged = setRoomReady(room, "host-token", false, 1_000);
    expect(unchanged.ok && unchanged.value).toBe(room);
  });

  it("guest leave frees the seat and clears host readiness", () => {
    let room = roomWithGuest();
    const ready = setRoomReady(room, "host-token", true, 1_000);
    if (!ready.ok) throw new Error(ready.error.message);
    room = ready.value;
    const left = leaveWaitingRoom(room, "guest-token");
    expect(left.ok && left.value.room?.guest).toBeNull();
    expect(left.ok && left.value.room?.host.ready).toBe(false);
  });

  it("host leave closes the room", () => {
    const left = leaveWaitingRoom(roomWithGuest(), "host-token");
    expect(left.ok && left.value).toEqual({ room: null, seat: "host" });
  });

  it("tracks connection state without exposing tokens", () => {
    const room = roomWithGuest();
    const disconnected = setParticipantConnected(room, "guest-token", false, 5_000);
    expect(disconnected.ok && disconnected.value.guest?.connected).toBe(false);
    expect(disconnected.ok && disconnected.value.guest?.disconnectedAt).toBe(5_000);
    expect(disconnected.ok && participantByToken(disconnected.value, "guest-token")?.seat).toBe("guest");
    expect(disconnected.ok && JSON.stringify(roomSnapshot(disconnected.value))).not.toContain("guest-token");
  });

  it("awards a disconnect win only after 30 seconds and draws if both expire", () => {
    const room = roomWithGuest();
    const guestDown = setParticipantConnected(room, "guest-token", false, 5_000);
    if (!guestDown.ok) throw new Error(guestDown.error.message);
    expect(disconnectWinnerAfterGrace(guestDown.value, 5_000 + RECONNECT_GRACE_MS - 1)).toBeUndefined();
    expect(disconnectWinnerAfterGrace(guestDown.value, 5_000 + RECONNECT_GRACE_MS)).toBe("host");
    const hostDown = setParticipantConnected(guestDown.value, "host-token", false, 5_000);
    if (!hostDown.ok) throw new Error(hostDown.error.message);
    expect(disconnectWinnerAfterGrace(hostDown.value, 5_000 + RECONNECT_GRACE_MS)).toBeNull();

    const staggeredGuest = setParticipantConnected(room, "guest-token", false, 10_000);
    if (!staggeredGuest.ok) throw new Error(staggeredGuest.error.message);
    const staggeredBoth = setParticipantConnected(staggeredGuest.value, "host-token", false, 5_000);
    if (!staggeredBoth.ok) throw new Error(staggeredBoth.error.message);
    expect(disconnectWinnerAfterGrace(staggeredBoth.value, 5_000 + RECONNECT_GRACE_MS)).toBeUndefined();
    expect(disconnectWinnerAfterGrace(staggeredBoth.value, 10_000 + RECONNECT_GRACE_MS)).toBeNull();
  });
});
