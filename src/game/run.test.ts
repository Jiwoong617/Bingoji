import { EMOJIS } from "../content/data";
import { SeededRandom, type RandomSource } from "./rng";
import { applyRest, canRemoveEmoji, completeCurrentMap, createRewardOptions, createRun, generateMapCandidates, pickEnemy } from "./run";
import type { EnemyKind, Rarity } from "./types";

class ScriptedRandom implements RandomSource {
  constructor(private readonly values: number[]) {}
  next(): number { return this.values.shift() ?? 0; }
  int(maxExclusive: number): number { return Math.floor(this.next() * maxExclusive); }
  pick<T>(items: readonly T[]): T { return items[this.int(items.length)]; }
  shuffle<T>(items: readonly T[]): T[] { return [...items]; }
}

function rewardRarities(kind: EnemyKind, roll: number): Rarity[] {
  const result = createRewardOptions(createRun("rookie", 0).player, kind, new ScriptedRandom([roll, 0, roll, 0]));
  return [EMOJIS[result.characterEmojiId].rarity, EMOJIS[result.commonEmojiId].rarity];
}

describe("run progression", () => {
  it("makes the first Map a forced normal battle", () => {
    const options = generateMapCandidates(0, new SeededRandom(1));
    expect(options).toHaveLength(1);
    expect(options[0].type).toBe("battle");
  });

  it("always offers at least one rest option for Map 9", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const options = generateMapCandidates(8, new SeededRandom(seed));
      expect(options.some((option) => option.type === "rest")).toBe(true);
    }
  });

  it("makes Map 10 a single Boss destination", () => {
    const options = generateMapCandidates(9, new SeededRandom(1));
    expect(options).toHaveLength(1);
    expect(options[0].type).toBe("boss");
  });

  it("always starts Stage 1 with the prairie rat", () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      expect(pickEnemy(1, "normal", new SeededRandom(seed), null, 1).id).toBe("prairie_rat");
    }
  });

  it("does not immediately repeat the previous normal Enemy", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      expect(pickEnemy(2, "normal", new SeededRandom(seed), "encore_hand", 4).id).not.toBe("encore_hand");
    }
  });

  it("moves to the next Stage after a Boss Map", () => {
    const run = { ...createRun("rookie", 0), stage: 1, completedMaps: 9, currentMap: 10, currentMapType: "boss" as const };
    const result = completeCurrentMap(run);
    expect(result.stage).toBe(2);
    expect(result.completedMaps).toBe(0);
  });

  it("rests for a rounded-down 30 percent of maximum HP", () => {
    const run = createRun("rookie", 0);
    run.player.hp = 10;
    run.player.maxHp = 31;
    const result = applyRest(run.player);
    expect(result.healed).toBe(9);
    expect(result.player.hp).toBe(19);
  });

  it("does not remove any Emoji when only three Pool copies remain", () => {
    const run = createRun("rookie", 0);
    run.player.pool = { sword: 1, heart: 1, eye: 1 };
    expect(canRemoveEmoji(run.player, "sword")).toBe(false);
    expect(canRemoveEmoji(run.player, "eye")).toBe(false);
  });

  it.each([
    ["normal", 0.749, "common"],
    ["normal", 0.75, "uncommon"],
    ["normal", 0.999, "uncommon"],
    ["elite", 0.349, "common"],
    ["elite", 0.35, "uncommon"],
    ["elite", 0.849, "uncommon"],
    ["elite", 0.85, "rare"],
    ["boss", 0.099, "common"],
    ["boss", 0.1, "uncommon"],
    ["boss", 0.349, "uncommon"],
    ["boss", 0.35, "rare"],
  ] as const)("uses exact %s reward rarity boundaries at roll %s", (kind, roll, expected) => {
    expect(rewardRarities(kind, roll)).toEqual([expected, expected]);
  });
});
