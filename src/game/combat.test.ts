import { advanceRetainedTurns, beginActorTurn, createCombat, createEnemyIntent, chooseEnemyCell, getCombatantDerivedStats, getEnemyAbilityIndicators, performEnemyTurn, playerPlace, resolveCompletedBingos, selectCombatCell } from "./combat";
import { EMOJIS, ENEMIES } from "../content/data";
import { SeededRandom, type RandomSource } from "./rng";
import { boardHasBingo } from "./lines";
import type { Board, CombatState, RunPlayer } from "./types";

function combatFixture(board: Board): CombatState {
  return {
    board,
    player: { id: "p", icon: "🙂", name: "P", ability: "", abilityId: "none", hp: 50, maxHp: 50, pool: { sword: 4, heart: 2 }, statuses: {}, turnFlags: { firstShieldGranted: false, firstIncomingReductionUsed: false }, combatFlags: { firstIncomingReductionUsed: false, randomHistory: {} } },
    enemy: { id: "e", icon: "👿", name: "E", ability: "", abilityId: "none", hp: 100, maxHp: 100, pool: { sword: 4, fire: 2 }, statuses: {}, turnFlags: { firstShieldGranted: false, firstIncomingReductionUsed: false }, combatFlags: { firstIncomingReductionUsed: false, randomHistory: {} } },
    enemyKind: "normal",
    stage: 1,
    phase: "player-selecting",
    turn: 1,
    draw: ["sword", "heart", "extra_turn"],
    selectedCell: null,
    placementsRemaining: 1,
    isExtraPlacement: false,
    discarded: [],
    events: [],
    lastBingo: null,
    enemyAbility: { bingoCount: 0, playerBingoCount: 0, turnCount: 0, used: false, lastTriggeredTurn: 0, stacks: 0, markedCell: null, markedKind: null, glitchDrawIndex: null, threeActFirstEmojiId: null, prophecyOrientation: "horizontal", phase: 1 },
  };
}

const emptyBoard = (): Board => Array.from({ length: 25 }, () => null);
const noCritRng: RandomSource = {
  next: () => 0.99,
  int: () => 0,
  pick: <T,>(items: readonly T[]) => items[0],
  shuffle: <T,>(items: readonly T[]) => [...items],
};

describe("combat engine", () => {
  it("deselects a selected empty Cell when it is clicked again", () => {
    const state = combatFixture(emptyBoard());
    const selected = selectCombatCell(state, 7);
    expect(selected.selectedCell).toBe(7);
    expect(selectCombatCell(selected, 7).selectedCell).toBeNull();
  });

  it("gives a mixed line to the actor who places the last cell", () => {
    const board = emptyBoard();
    for (let index = 0; index < 5; index += 1) {
      board[index] = { emojiId: "sword", placedBy: index % 2 ? "enemy" : "player" };
    }
    const result = resolveCompletedBingos(combatFixture(board), 4, "player", noCritRng);
    expect(result.enemy.hp).toBe(90);
    expect(result.player.hp).toBe(50);
    expect(result.lastBingo?.owner).toBe("player");
    expect(result.events.filter((item) => item.kind === "damage")).toHaveLength(1);
    expect(result.events.at(-1)?.value).toBe(10);
    expect(result.board.slice(0, 5)).toEqual([null, null, null, null, null]);
  });

  it("resolves double Bingo independently and triggers the intersection twice", () => {
    const board = emptyBoard();
    const cross = [2, 7, 10, 11, 12, 13, 14, 17, 22];
    cross.forEach((index) => { board[index] = { emojiId: "sword", placedBy: "enemy" }; });
    const result = resolveCompletedBingos(combatFixture(board), 12, "player", noCritRng);
    expect(result.lastBingo?.lineIds).toEqual(["row-2", "col-2"]);
    expect(result.lastBingo?.multiplier).toBe(2);
    expect(result.enemy.hp).toBe(60);
    expect(result.events.filter((item) => item.kind === "damage")).toHaveLength(1);
    expect(result.events.at(-1)?.value).toBe(40);
    expect(cross.every((index) => result.board[index] === null)).toBe(true);
  });

  it("resolves simultaneous Bingo lines in horizontal, vertical, then diagonal order", () => {
    const board = emptyBoard();
    const linesThroughCenter = [
      10, 11, 12, 13, 14,
      2, 7, 17, 22,
      0, 6, 18, 24,
      20, 16, 8, 4,
    ];
    linesThroughCenter.forEach((index) => {
      board[index] = { emojiId: "sword", placedBy: "enemy" };
    });

    const result = resolveCompletedBingos(combatFixture(board), 12, "player", noCritRng);

    expect(result.lastBingo?.lineIds).toEqual([
      "row-2",
      "col-2",
      "diag-main",
      "diag-anti",
    ]);
    expect(result.events.filter((item) => item.lineId).map((item) => item.lineId)).toEqual([
      ...Array(5).fill("row-2"),
      ...Array(5).fill("col-2"),
      ...Array(5).fill("diag-main"),
      ...Array(5).fill("diag-anti"),
    ]);
  });

  it("keeps a retained Emoji for three turns after its line resolves", () => {
    const board = emptyBoard();
    for (let index = 0; index < 5; index += 1) board[index] = { emojiId: "statue", placedBy: "player" };
    const result = resolveCompletedBingos(combatFixture(board), 4, "player");
    expect(result.board.slice(0, 5).every((cell) => cell?.remainingTurns === 3)).toBe(true);
    const afterOne = advanceRetainedTurns(result.board);
    const afterTwo = advanceRetainedTurns(afterOne);
    const afterThree = advanceRetainedTurns(afterTwo);
    expect(afterOne[0]?.remainingTurns).toBe(2);
    expect(afterTwo[0]?.remainingTurns).toBe(1);
    expect(afterThree.slice(0, 5)).toEqual([null, null, null, null, null]);
  });

  it("does not reset a retained Emoji countdown when another Bingo includes it", () => {
    const board = emptyBoard();
    board[0] = { emojiId: "statue", placedBy: "player", remainingTurns: 1 };
    for (let index = 1; index < 5; index += 1) board[index] = { emojiId: "sword", placedBy: "player" };
    const result = resolveCompletedBingos(combatFixture(board), 4, "player");
    expect(result.board[0]?.remainingTurns).toBe(1);
    expect(advanceRetainedTurns(result.board)[0]).toBeNull();
  });

  it("grants one extra placement and does not remove the permanent Pool", () => {
    const state = combatFixture(emptyBoard());
    state.draw = ["extra_turn", "fire", "heart"];
    state.selectedCell = 0;
    const result = playerPlace(state, 0);
    expect(result.phase).toBe("player-selecting");
    expect(result.placementsRemaining).toBe(1);
    expect(result.draw).toEqual(["fire", "heart"]);
    expect(result.player.pool).toEqual(state.player.pool);
  });

  it("ends the turn without an unusable extra placement when peace is used last", () => {
    const state = combatFixture(emptyBoard());
    state.draw = ["extra_turn"];
    state.selectedCell = 0;
    const result = playerPlace(state, 0);
    expect(result.phase).toBe("enemy-thinking");
    expect(result.placementsRemaining).toBe(0);
    expect(result.draw).toEqual([]);
    expect(result.events.at(-1)?.text).toContain("남은 Emoji가 없어");
  });

  it("chooses a cell from the closest incomplete line", () => {
    const board = emptyBoard();
    [0, 1, 2, 3].forEach((index) => { board[index] = { emojiId: "sword", placedBy: "player" }; });
    expect(chooseEnemyCell(board, new SeededRandom(10))).toBe(4);
  });

  it("avoids leaving a one-cell Bingo chance from Stage 2 onward", () => {
    const board = emptyBoard();
    [0, 1, 2].forEach((index) => { board[index] = { emojiId: "sword", placedBy: "player" }; });
    const chosen = chooseEnemyCell(board, new SeededRandom(10), 2);
    expect([3, 4]).not.toContain(chosen);
  });

  it("still completes its own Bingo immediately on Stage 2", () => {
    const board = emptyBoard();
    [0, 1, 2, 3].forEach((index) => { board[index] = { emojiId: "sword", placedBy: "player" }; });
    expect(chooseEnemyCell(board, new SeededRandom(10), 2)).toBe(4);
  });

  it("lets the perfect hand prefer a diagonal setup when no immediate Bingo exists", () => {
    const board = emptyBoard();
    [0, 6, 12].forEach((index) => { board[index] = { emojiId: "target", placedBy: "enemy" }; });
    expect([18, 24]).toContain(chooseEnemyCell(board, new SeededRandom(4), 1, "diagonal-precision", "target"));
  });

  it("seeds six cells without an initial Bingo and leaves Pools unchanged", () => {
    const player: RunPlayer = {
      characterId: "p", icon: "🙂", name: "P", ability: "", abilityId: "none", hp: 30, maxHp: 30,
      pool: { sword: 3, heart: 3, fire: 3 },
    };
    const enemy = ENEMIES[0];
    const result = createCombat(player, enemy, new SeededRandom(77));
    expect(result.board.filter(Boolean)).toHaveLength(6);
    expect(boardHasBingo(result.board)).toBe(false);
    expect(result.player.pool).toEqual(player.pool);
    expect(result.draw).toHaveLength(3);
  });

  it("settles all Bingo damage and healing once per target", () => {
    const board = emptyBoard();
    [0, 1, 2, 3].forEach((index) => { board[index] = { emojiId: "sword", placedBy: "player" }; });
    board[4] = { emojiId: "starlight", placedBy: "player" };
    const state = combatFixture(board);
    state.player.hp = 45;
    const result = resolveCompletedBingos(state, 4, "player", noCritRng);
    expect(result.enemy.hp).toBe(90);
    expect(result.player.hp).toBe(47);
    expect(result.events.filter((item) => item.kind === "damage")).toHaveLength(1);
    expect(result.events.filter((item) => item.kind === "heal")).toHaveLength(1);
  });

  it("stacks owned damage effects per copy", () => {
    const board = emptyBoard();
    [0, 1, 2, 3, 4].forEach((index) => { board[index] = { emojiId: "sword", placedBy: "player" }; });
    const state = combatFixture(board);
    state.player.pool = { sword: 3, heart: 1, battle_eye: 2 };
    const result = resolveCompletedBingos(state, 4, "player", noCritRng);
    expect(result.enemy.hp).toBe(80);
  });

  it("caps shield at half max HP without a blueprint", () => {
    const board = emptyBoard();
    [0, 1, 2, 3, 4].forEach((index) => { board[index] = { emojiId: "shield", placedBy: "player" }; });
    const result = resolveCompletedBingos(combatFixture(board), 4, "player", noCritRng);
    expect(result.player.statuses.shield?.value).toBe(25);
  });

  it("keeps remaining shield between turns after it absorbs poison damage", () => {
    const state = combatFixture(emptyBoard());
    state.player.statuses.shield = { statusId: "shield", name: "방어막", icon: "🛡️", value: 5, description: "test" };
    state.player.statuses.poison = { statusId: "poison", name: "독", icon: "☠️", value: 3, sourceActor: "enemy", description: "test" };
    const result = beginActorTurn(state, "player");
    expect(result.player.hp).toBe(50);
    expect(result.player.statuses.shield?.value).toBe(2);
    expect(result.player.statuses.poison?.value).toBe(2);
  });

  it("resolves every registered Bingo effect without an engine error", () => {
    for (const emojiId of Object.keys(EMOJIS)) {
      const board = emptyBoard();
      [0, 1, 2, 3, 4].forEach((index) => { board[index] = { emojiId, placedBy: "player", turnsOnBoard: 2 }; });
      const state = combatFixture(board);
      state.player.hp = 500;
      state.player.maxHp = 500;
      state.enemy.hp = 500;
      state.enemy.maxHp = 500;
      state.player.statuses.charge = { statusId: "charge", name: "충전", icon: "🔋", value: 12, description: "test" };
      state.enemy.statuses.poison = { statusId: "poison", name: "독", icon: "☠️", value: 8, sourceActor: "player", description: "test" };
      expect(() => resolveCompletedBingos(state, 4, "player", noCritRng), emojiId).not.toThrow();
    }
  });

  it("resolves every registered placement effect without an engine error", () => {
    for (const emoji of Object.values(EMOJIS).filter((item) => item.onPlace?.length)) {
      const state = combatFixture(emptyBoard());
      state.draw = [emoji.id, "sword", "heart"];
      state.selectedCell = 12;
      expect(() => playerPlace(state, 0, noCritRng), emoji.id).not.toThrow();
    }
  });

  it("adds the Clown's ten percentage point base critical chance", () => {
    const state = combatFixture(emptyBoard());
    state.player.abilityId = "clown";
    expect(getCombatantDerivedStats(state.player).critChance).toBeCloseTo(0.15);
  });

  it("activates Hasty Escape once after a large settled hit", () => {
    const state = combatFixture(emptyBoard());
    state.enemy.abilityId = "hasty-escape";
    [0, 1, 2, 3, 4].forEach((index) => { state.board[index] = { emojiId: "sword", placedBy: "player" }; });
    const first = resolveCompletedBingos(state, 4, "player", noCritRng);
    expect(first.enemy.hp).toBe(90);
    expect(first.enemy.statuses.shield?.value).toBe(4);
    expect(first.enemyAbility.used).toBe(true);
    [0, 1, 2, 3, 4].forEach((index) => { first.board[index] = { emojiId: "sword", placedBy: "player" }; });
    const second = resolveCompletedBingos(first, 4, "player", noCritRng);
    expect(second.enemy.hp).toBe(84);
    expect(second.enemy.statuses.shield).toBeUndefined();
  });

  it("adds Venom Tail poison only to the first Enemy Bingo", () => {
    const state = combatFixture(emptyBoard());
    state.enemy.abilityId = "venom-tail";
    [0, 1, 2, 3, 4].forEach((index) => { state.board[index] = { emojiId: "sword", placedBy: "enemy" }; });
    const first = resolveCompletedBingos(state, 4, "enemy", noCritRng);
    expect(first.player.statuses.poison?.value).toBe(2);
    [0, 1, 2, 3, 4].forEach((index) => { first.board[index] = { emojiId: "sword", placedBy: "enemy" }; });
    const second = resolveCompletedBingos(first, 4, "enemy", noCritRng);
    expect(second.player.statuses.poison?.value).toBe(2);
    expect(second.enemyAbility.bingoCount).toBe(2);
  });

  it("applies Ambush Aim to the first direct hit of every completed Line", () => {
    const state = combatFixture(emptyBoard());
    state.enemy.abilityId = "ambush-aim";
    [2, 7, 10, 11, 12, 13, 14, 17, 22].forEach((index) => { state.board[index] = { emojiId: "sword", placedBy: "enemy" }; });
    const aimedRng: RandomSource = { ...noCritRng, next: () => 0.2 };
    const result = resolveCompletedBingos(state, 12, "enemy", aimedRng);
    expect(result.events.filter((item) => item.kind === "critical")).toHaveLength(2);
  });

  it("retaliates once when the thorn boar's shield breaks", () => {
    const state = combatFixture(emptyBoard());
    state.enemy.abilityId = "last-thorn";
    state.enemy.statuses.shield = { statusId: "shield", name: "방어막", icon: "🛡️", value: 4, description: "test" };
    [0, 1, 2, 3, 4].forEach((index) => { state.board[index] = { emojiId: "sword", placedBy: "player" }; });
    const result = resolveCompletedBingos(state, 4, "player", noCritRng);
    expect(result.player.hp).toBe(48);
    expect(result.enemy.hp).toBe(94);
    expect(result.events.filter((item) => item.text.includes("마지막 가시"))).toHaveLength(1);
  });

  it("uses Stop Hand's Double response only once for one multi-Bingo", () => {
    const state = combatFixture(emptyBoard());
    state.enemy.abilityId = "double-response";
    [2, 7, 10, 11, 12, 13, 14, 17, 22].forEach((index) => { state.board[index] = { emojiId: "sword", placedBy: "player" }; });
    const result = resolveCompletedBingos(state, 12, "player", noCritRng);
    expect(result.enemy.hp).toBe(64);
    expect(result.events.filter((item) => item.text.includes("잠깐!"))).toHaveLength(1);
  });

  it("triggers one prophecy punishment for a multi-Bingo Turn", () => {
    const state = combatFixture(emptyBoard());
    state.enemy.abilityId = "prophecy";
    state.enemyAbility.prophecyOrientation = "horizontal";
    [2, 7, 10, 11, 12, 13, 14, 17, 22].forEach((index) => { state.board[index] = { emojiId: "heart", placedBy: "player" }; });
    const result = resolveCompletedBingos(state, 12, "player", noCritRng);
    expect(result.enemy.statuses.shield?.value).toBe(6);
    expect(result.player.statuses.weakness?.value).toBe(2);
    expect(result.events.filter((item) => item.text.includes("예언 적중"))).toHaveLength(1);
  });

  it("applies and consumes a telegraphed trap on placement", () => {
    const state = combatFixture(emptyBoard());
    state.enemy.abilityId = "snare-trap";
    state.enemyAbility.markedCell = 12;
    state.enemyAbility.markedKind = "trap";
    state.selectedCell = 12;
    const result = playerPlace(state, 0, noCritRng);
    expect(result.player.statuses.poison?.value).toBe(2);
    expect(result.enemyAbility.markedCell).toBeNull();
    expect(result.enemyAbility.markedKind).toBeNull();
  });

  it("removes an abducted Cell at the next Enemy Turn start", () => {
    const state = combatFixture(emptyBoard());
    state.board[12] = { emojiId: "heart", placedBy: "player" };
    state.enemy.abilityId = "abduction-mark";
    state.enemyAbility.markedCell = 12;
    state.enemyAbility.markedKind = "abduction";
    const result = beginActorTurn(state, "enemy");
    expect(result.board[12]).toBeNull();
    expect(result.events.some((item) => item.text.includes("납치"))).toBe(true);
  });

  it("previews and resolves the applause king's third act as two distinct placements", () => {
    const state = combatFixture(emptyBoard());
    state.phase = "enemy-thinking";
    state.stage = 2;
    state.enemy.abilityId = "three-act-show";
    state.enemy.pool = { dice: 1, coin: 1, slot: 1, joker: 1, mask: 1, cycle: 1, bell: 1, megaphone: 1, mirror: 1 };
    state.enemyAbility.turnCount = 2;
    const first = performEnemyTurn(state, new SeededRandom(9), { cellIndex: 0, emojiId: "dice" });
    expect(first.phase).toBe("enemy-thinking");
    expect(first.isExtraPlacement).toBe(true);
    expect(first.placementsRemaining).toBe(1);
    const secondIntent = createEnemyIntent(first, new SeededRandom(9));
    expect(secondIntent.emojiId).not.toBe("dice");
    const second = performEnemyTurn(first, new SeededRandom(10), secondIntent);
    expect(second.phase).toBe("player-selecting");
    expect(second.board.filter(Boolean)).toHaveLength(2);
    expect(second.enemyAbility.turnCount).toBe(3);
    expect(second.enemyAbility.threeActFirstEmojiId).toBeNull();
  });

  it("lets an Enemy redraw Emoji grant a separately previewed extra placement", () => {
    const state = combatFixture(emptyBoard());
    state.phase = "enemy-thinking";
    state.enemy.abilityId = "encore-shield";
    state.enemy.pool = { cycle: 3, sword: 3, heart: 3 };
    const first = performEnemyTurn(state, new SeededRandom(3), { cellIndex: 0, emojiId: "cycle" });
    expect(first.phase).toBe("enemy-thinking");
    expect(first.placementsRemaining).toBe(1);
    expect(first.enemy.statuses.shield?.value).toBe(3);
    const second = performEnemyTurn(first, new SeededRandom(4), { cellIndex: 1, emojiId: "sword" });
    expect(second.phase).toBe("player-selecting");
    expect(second.board.filter(Boolean)).toHaveLength(2);
  });

  it("transitions the living cosmos at the exact HP boundaries", () => {
    const phaseAfterHit = (startingHp: number) => {
      const state = combatFixture(emptyBoard());
      state.enemy.abilityId = "abyss-phases";
      state.enemy.hp = startingHp;
      [0, 1, 2, 3, 4].forEach((index) => { state.board[index] = { emojiId: "sword", placedBy: "player" }; });
      return resolveCompletedBingos(state, 4, "player", noCritRng).enemyAbility.phase;
    };
    expect(phaseAfterHit(78)).toBe(1);
    expect(phaseAfterHit(77)).toBe(2);
    expect(phaseAfterHit(43)).toBe(3);
  });

  it("provides a visible ability indicator for all 21 Enemies", () => {
    for (const enemy of ENEMIES) {
      const player: RunPlayer = { characterId: "p", icon: "🙂", name: "P", ability: "", abilityId: "none", hp: 30, maxHp: 30, pool: { sword: 3, heart: 3, fire: 3 } };
      const state = createCombat(player, enemy, new SeededRandom(11), enemy.stages[0]);
      expect(getEnemyAbilityIndicators(state), enemy.id).toHaveLength(1);
      expect(getEnemyAbilityIndicators(state)[0].name.length, enemy.id).toBeGreaterThan(0);
    }
  });
});
