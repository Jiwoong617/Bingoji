import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { EMOJIS } from "../content/emojis";
import type { PvpMatchResult, PvpMatchSnapshot, RoomSnapshot } from "../shared";
import { MultiplayerBattleScreen } from "./BattleScreen";
import type { MultiplayerClientState } from "./client";

const pool = { sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2 };

function room(): RoomSnapshot {
  return {
    roomCode: "ABC234",
    revision: 3,
    status: "in-game",
    host: { playerId: "host-id", seat: "host", avatar: "🙂", nickname: "호스트", poolSize: 10, ready: true, connected: true },
    guest: { playerId: "guest-id", seat: "guest", avatar: "😎", nickname: "게스트", poolSize: 10, ready: true, connected: true },
    expiresAt: Date.now() + 60_000,
  };
}

function match(): PvpMatchSnapshot {
  return {
    matchId: "match-id",
    revision: 0,
    turn: 1,
    phase: "turn",
    board: Array.from({ length: 25 }, () => null),
    players: {
      host: { playerId: "host-id", seat: "host", avatar: "🙂", nickname: "호스트", hp: 30, maxHp: 30, poolSize: 10, statuses: [], connected: true },
      guest: { playerId: "guest-id", seat: "guest", avatar: "😎", nickname: "게스트", hp: 30, maxHp: 30, poolSize: 10, statuses: [], connected: true },
    },
    activeSeat: "host",
    startingSeat: "host",
    deadlineAt: Date.now() + 15_000,
    placementsRemaining: 1,
    lastBingo: null,
    lastPlacement: null,
    privateState: { seat: "host", pool, draw: ["sword", "heart", "fire"] },
  };
}

function clientState(result: PvpMatchResult | null = null): MultiplayerClientState {
  return {
    connection: "connected",
    room: room(),
    sessionToken: "host-token",
    seat: "host",
    match: match(),
    result,
    events: [],
    placementPending: false,
    serverTimeOffsetMs: 0,
    error: null,
  };
}

describe("PvP battle UI", () => {
  it("announces whether the local player has the first move", () => {
    render(<MultiplayerBattleScreen clientState={clientState()} onPlace={vi.fn()} onForfeit={vi.fn()} onCloseResult={vi.fn()} onInfo={vi.fn()} />);
    expect(screen.getByText("당신은 선공입니다")).toBeInTheDocument();
  });

  it("toggles a selected Cell and submits the authoritative draw and cell indexes", () => {
    const onPlace = vi.fn(() => true);
    const onInfo = vi.fn();
    render(<MultiplayerBattleScreen clientState={clientState()} onPlace={onPlace} onForfeit={vi.fn()} onCloseResult={vi.fn()} onInfo={onInfo} />);

    const cell = screen.getByRole("gridcell", { name: "1행 1열 빈칸" });
    fireEvent.click(cell);
    expect(cell).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(cell);
    expect(cell).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: /쌍검.*정보 보기/ }));
    expect(onInfo).toHaveBeenCalledWith("sword");
    fireEvent.click(cell);
    fireEvent.click(screen.getByRole("button", { name: /쌍검.*여기에 배치/ }));
    expect(onPlace).toHaveBeenCalledWith(0, 0);
    expect(screen.getByLabelText(/배치 제한 시간 15초|배치 제한 시간 14초/)).toBeInTheDocument();
  });

  it("shows both final Pools and closes a completed result", () => {
    const result: PvpMatchResult = {
      matchId: "match-id",
      winnerSeat: "host",
      reason: "hp",
      turns: 8,
      elapsedMs: 75_000,
      players: {
        host: { ...match().players.host, hp: 8, pool },
        guest: { ...match().players.guest, hp: 0, pool },
      },
    };
    const onClose = vi.fn();
    const props = { onPlace: vi.fn(), onForfeit: vi.fn(), onCloseResult: onClose, onInfo: vi.fn() };
    const { rerender } = render(<MultiplayerBattleScreen clientState={clientState()} {...props} />);
    rerender(<MultiplayerBattleScreen clientState={clientState(result)} {...props} />);
    expect(screen.getByRole("heading", { name: "VICTORY" })).toBeInTheDocument();
    expect(screen.getByText("HP 승부 · TURN 8 · 1:15")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "호스트의 쌍검 정보 보기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "게스트의 쌍검 정보 보기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "메인 화면으로" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("asks for confirmation before forfeiting and focuses the safe action", () => {
    const onForfeit = vi.fn();
    render(<MultiplayerBattleScreen clientState={clientState()} onPlace={vi.fn()} onForfeit={onForfeit} onCloseResult={vi.fn()} onInfo={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "기권" }));
    const dialog = screen.getByRole("dialog", { name: "기권하고 나가시겠습니까?" });
    const cancel = within(dialog).getByRole("button", { name: "취소" });
    expect(cancel).toHaveFocus();
    expect(cancel).toHaveClass("ghost-button");
    expect(onForfeit).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "기권" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "기권" }));
    expect(onForfeit).toHaveBeenCalledOnce();
  });

  it("keeps original Bingo Emoji afterimages and highlights the opponent's latest Cell", () => {
    const state = clientState();
    state.match = {
      ...state.match!,
      revision: 1,
      turn: 2,
      activeSeat: "host",
      lastPlacement: { seat: "guest", cellIndex: 0, automatic: false },
      lastBingo: {
        owner: "guest",
        lineIds: ["row-0"],
        cells: [[0, 1, 2, 3, 4]],
        icons: [[EMOJIS.sword.icon, EMOJIS.heart.icon, EMOJIS.fire.icon, EMOJIS.shield.icon, EMOJIS.bandage.icon]],
        multiplier: 1,
      },
    };
    state.events = [{
      eventId: "event-1",
      actor: "guest",
      target: "host",
      kind: "damage",
      emojiId: "sword",
      icon: EMOJIS.sword.icon,
      text: "피해 1",
      lineId: "row-0",
      value: 1,
    }];

    render(<MultiplayerBattleScreen clientState={state} onPlace={vi.fn()} onForfeit={vi.fn()} onCloseResult={vi.fn()} onInfo={vi.fn()} />);
    const latestCell = screen.getByRole("gridcell", { name: /1행 1열 빈칸, 상대가 방금 선택한 칸/ });
    expect(latestCell).toHaveClass("opponent-last-move");
    expect(within(latestCell).getByText(EMOJIS.sword.icon)).toBeInTheDocument();
    expect(within(latestCell).queryByText("✨")).not.toBeInTheDocument();
  });
});
