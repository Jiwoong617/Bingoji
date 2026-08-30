import { cloneCombatState } from "../../game/combat";
import { EMOJIS } from "../../content/emojis";
import {
  applyPvpMatchCommand,
  createPvpMatch,
  PVP_DRAW_SIZE,
  PVP_STARTING_HP,
  type PvpMatchParticipant,
  type PvpMatchState,
} from "./match";
import { PVP_EMOJI_IDS } from "./rules";
import type { PvpSeat } from "./types";

const host: PvpMatchParticipant = {
  playerId: "host-id",
  avatar: "🙂",
  nickname: "호스트",
  pool: { sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2 },
};

const guest: PvpMatchParticipant = {
  playerId: "guest-id",
  avatar: "😎",
  nickname: "게스트",
  pool: { target: 2, dice: 2, coin: 2, starlight: 2, battery: 2 },
};

function match(seed = 2026): PvpMatchState {
  return createPvpMatch({ matchId: "match-1", host, guest, seed });
}

function actorForSeat(seat: PvpSeat): "player" | "enemy" {
  return seat === "host" ? "player" : "enemy";
}

function forceActive(source: PvpMatchState, seat: PvpSeat, draw: string[]): PvpMatchState {
  const combat = cloneCombatState(source.combat);
  combat.phase = seat === "host" ? "player-selecting" : "enemy-thinking";
  combat.draw = [...draw];
  combat.placementsRemaining = 1;
  combat.isExtraPlacement = false;
  return { ...source, activeSeat: seat, combat };
}

describe("pure PvP Match engine", () => {
  it("starts both players at 30 HP on an empty Board with a deterministic first player", () => {
    const first = match(77);
    const second = match(77);

    expect(first).toEqual(second);
    expect(first.combat.player.hp).toBe(PVP_STARTING_HP);
    expect(first.combat.enemy.hp).toBe(PVP_STARTING_HP);
    expect(first.combat.board).toEqual(Array.from({ length: 25 }, () => null));
    expect(first.combat.draw).toHaveLength(PVP_DRAW_SIZE);
    expect(first.phase).toBe("turn");
    expect(first.revision).toBe(0);
  });

  it("rejects out-of-turn, invalid Draw, and occupied Cell commands without mutation", () => {
    const state = match();
    const wrongSeat = state.activeSeat === "host" ? "guest" : "host";
    const outOfTurn = applyPvpMatchCommand(state, { type: "place", seat: wrongSeat, drawIndex: 0, cellIndex: 0 });
    const invalidDraw = applyPvpMatchCommand(state, { type: "place", seat: state.activeSeat, drawIndex: 3, cellIndex: 0 });
    const occupiedState = {
      ...state,
      combat: {
        ...cloneCombatState(state.combat),
        board: state.combat.board.map((cell, index) => index === 0 ? { emojiId: "sword", placedBy: "player" as const } : cell),
      },
    };
    const occupied = applyPvpMatchCommand(occupiedState, { type: "place", seat: state.activeSeat, drawIndex: 0, cellIndex: 0 });

    expect(outOfTurn.ok ? null : outOfTurn.error.code).toBe("not-your-turn");
    expect(invalidDraw.ok ? null : invalidDraw.error.code).toBe("invalid-draw");
    expect(occupied.ok ? null : occupied.error.code).toBe("invalid-cell");
    expect(outOfTurn.state).toBe(state);
    expect(invalidDraw.state).toBe(state);
  });

  it("lets Host and Guest use the same three-card Draw and passes the Turn", () => {
    let state = forceActive(match(), "host", ["sword", "heart", "fire"]);
    const hostMove = applyPvpMatchCommand(state, { type: "place", seat: "host", drawIndex: 0, cellIndex: 0 });
    expect(hostMove.ok).toBe(true);
    if (!hostMove.ok) return;
    state = hostMove.state;
    expect(state.combat.board[0]?.placedBy).toBe("player");
    expect(state.activeSeat).toBe("guest");
    expect(state.combat.draw).toHaveLength(3);
    expect(state.revision).toBe(1);

    state = forceActive(state, "guest", ["target", "dice", "coin"]);
    const guestMove = applyPvpMatchCommand(state, { type: "place", seat: "guest", drawIndex: 1, cellIndex: 1 });
    expect(guestMove.ok).toBe(true);
    if (!guestMove.ok) return;
    expect(guestMove.state.combat.board[1]?.placedBy).toBe("enemy");
    expect(guestMove.state.activeSeat).toBe("host");
  });

  it("resolves a mixed Bingo for either active PvP seat using the shared Emoji engine", () => {
    for (const seat of ["host", "guest"] as const) {
      let state = forceActive(match(), seat, ["sword", "heart", "fire"]);
      const combat = cloneCombatState(state.combat);
      for (let index = 0; index < 4; index += 1) {
        combat.board[index] = { emojiId: "sword", placedBy: index % 2 === 0 ? "player" : "enemy" };
      }
      state = { ...state, combat };
      const result = applyPvpMatchCommand(state, { type: "place", seat, drawIndex: 0, cellIndex: 4 });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      const opponentHp = seat === "host" ? result.state.combat.enemy.hp : result.state.combat.player.hp;
      expect(opponentHp).toBe(20);
      expect(result.state.events.some((event) => event.kind === "damage" && event.actor === seat)).toBe(true);
      expect(result.state.combat.board.slice(0, 5)).toEqual([null, null, null, null, null]);
    }
  });

  it("keeps the active seat for one extra placement and then passes the Turn", () => {
    let state = forceActive(match(), "host", ["extra_turn", "sword", "heart"]);
    const first = applyPvpMatchCommand(state, { type: "place", seat: "host", drawIndex: 0, cellIndex: 0 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.activeSeat).toBe("host");
    expect(first.state.combat.isExtraPlacement).toBe(true);
    expect(first.state.combat.placementsRemaining).toBe(1);
    expect(first.state.combat.draw).toEqual(["sword", "heart"]);

    state = first.state;
    const second = applyPvpMatchCommand(state, { type: "place", seat: "host", drawIndex: 0, cellIndex: 1 });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.activeSeat).toBe("guest");
    expect(second.state.combat.isExtraPlacement).toBe(false);
  });

  it("uses the Match RNG for deterministic timeout auto-placement", () => {
    const first = match(991);
    const second = match(991);
    const firstResult = applyPvpMatchCommand(first, { type: "auto-place", seat: first.activeSeat });
    const secondResult = applyPvpMatchCommand(second, { type: "auto-place", seat: second.activeSeat });

    expect(firstResult.ok).toBe(true);
    expect(secondResult).toEqual(firstResult);
    if (!firstResult.ok) return;
    expect(firstResult.state.lastPlacement?.automatic).toBe(true);
    expect(firstResult.state.combat.board.filter(Boolean)).toHaveLength(1);
  });

  it("finishes as a draw when one Bingo reduces both players to zero HP", () => {
    let state = forceActive(match(), "host", ["pain_exchange", "heart", "fire"]);
    const combat = cloneCombatState(state.combat);
    combat.player.hp = 2;
    combat.enemy.hp = 30;
    for (let index = 0; index < 4; index += 1) {
      combat.board[index] = { emojiId: "pain_exchange", placedBy: "enemy" };
    }
    state = { ...state, combat };

    const result = applyPvpMatchCommand(state, { type: "place", seat: "host", drawIndex: 0, cellIndex: 4 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.combat.player.hp).toBe(0);
    expect(result.state.combat.enemy.hp).toBe(0);
    expect(result.state.phase).toBe("finished");
    expect(result.state.outcome).toEqual({ winnerSeat: null, reason: "hp" });
  });

  it("does not mutate either permanent Pool while drawing and discarding", () => {
    const state = match();
    const hostPool = { ...state.combat.player.pool };
    const guestPool = { ...state.combat.enemy.pool };
    const result = applyPvpMatchCommand(state, { type: "place", seat: state.activeSeat, drawIndex: 0, cellIndex: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.combat.player.pool).toEqual(hostPool);
    expect(result.state.combat.enemy.pool).toEqual(guestPool);
  });

  it("can place every PvP-legal Emoji for both seats without UI or AI", () => {
    const base = match(31);
    for (const seat of ["host", "guest"] as const) {
      for (const emojiId of PVP_EMOJI_IDS) {
        const state = forceActive(base, seat, [emojiId, "sword", "heart"]);
        expect(
          () => applyPvpMatchCommand(state, { type: "place", seat, drawIndex: 0, cellIndex: 12 }),
          `${seat}/${emojiId}/${EMOJIS[emojiId].name}`,
        ).not.toThrow();
      }
    }
  });

  it("records the original actor mapping for Board ownership", () => {
    for (const seat of ["host", "guest"] as const) {
      const state = forceActive(match(), seat, ["sword", "heart", "fire"]);
      const result = applyPvpMatchCommand(state, { type: "place", seat, drawIndex: 0, cellIndex: 6 });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.state.lastPlacement?.seat).toBe(seat);
      expect(result.state.combat.board[6]?.placedBy).toBe(actorForSeat(seat));
    }
  });
});
