import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MultiplayerProfile, RoomSnapshot } from "../shared";
import type { MultiplayerClientState } from "./client";
import { MultiplayerRoomScreen } from "./RoomScreen";

const profile: MultiplayerProfile = {
  avatar: "🙂",
  nickname: "호스트",
  pool: { sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2 },
};

function startingRoom(): RoomSnapshot {
  return {
    roomCode: "ABC234",
    revision: 4,
    status: "starting",
    host: { playerId: "host-id", seat: "host", avatar: "🙂", nickname: "호스트", poolSize: 10, ready: true, connected: true },
    guest: { playerId: "guest-id", seat: "guest", avatar: "😎", nickname: "게스트", poolSize: 10, ready: true, connected: true },
    expiresAt: 60_000,
    startsAt: 4_000,
  };
}

function clientState(): MultiplayerClientState {
  return {
    connection: "connected",
    room: startingRoom(),
    sessionToken: "host-token",
    seat: "host",
    match: null,
    result: null,
    events: [],
    placementPending: false,
    serverTimeOffsetMs: 0,
    error: null,
  };
}

afterEach(() => vi.useRealTimers());

describe("PvP room UI", () => {
  it("shows a Server-synchronized 3, 2, 1 countdown after both players are ready", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    render(
      <MultiplayerRoomScreen
        action="create"
        profile={profile}
        clientState={clientState()}
        onJoin={vi.fn()}
        onReady={vi.fn()}
        onLeave={vi.fn()}
        onCancel={vi.fn()}
        onClearError={vi.fn()}
      />,
    );

    const countdown = screen.getByLabelText("게임 시작 카운트다운");
    expect(screen.getByText("게임이 시작됩니다.")).toBeInTheDocument();
    expect(countdown).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: "시작 준비 중" })).toBeDisabled();

    act(() => vi.advanceTimersByTime(1_000));
    expect(countdown).toHaveTextContent("2");
    act(() => vi.advanceTimersByTime(1_000));
    expect(countdown).toHaveTextContent("1");
  });
});
