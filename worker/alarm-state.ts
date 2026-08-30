import { PVP_PLACEMENT_GRACE_MS } from "../src/shared";
import { isMatchDeadlineCurrent, type StoredPvpMatch } from "./match-state";
import {
  disconnectWinnerAfterGrace,
  RECONNECT_GRACE_MS,
  type StoredRoomState,
} from "./room-state";

export function nextRoomAlarmAt(
  room: StoredRoomState,
  match: StoredPvpMatch | null,
  now: number,
): number | null {
  const candidates: number[] = [];

  if (room.status === "waiting" || room.status === "finished") {
    candidates.push(Math.max(now, room.expiresAt));
  }

  if (room.status === "starting") {
    candidates.push(Math.max(now, room.startsAt ?? now));
    candidates.push(Math.max(now, room.expiresAt));
  }

  if (room.status === "in-game" && match) {
    if (isMatchDeadlineCurrent(match) && match.deadlineAt !== null) {
      candidates.push(Math.max(now, match.deadlineAt + PVP_PLACEMENT_GRACE_MS));
    }

    const disconnectOutcomeDue = disconnectWinnerAfterGrace(room, now) !== undefined;
    for (const participant of [room.host, room.guest]) {
      if (!participant || participant.connected || participant.disconnectedAt === null) continue;
      const reconnectDeadline = participant.disconnectedAt + RECONNECT_GRACE_MS;
      if (reconnectDeadline > now || disconnectOutcomeDue) {
        candidates.push(Math.max(now, reconnectDeadline));
      }
    }
  }

  return candidates.length > 0 ? Math.min(...candidates) : null;
}
