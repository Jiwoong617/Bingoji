import { CHARACTERS, EMOJIS, ENEMIES, validateContent } from "./data";
import { COMMON_EMOJI_IDS } from "./emojis";

describe("expanded content registry", () => {
  it("registers every documented common and character Emoji", () => {
    expect(Object.keys(EMOJIS)).toHaveLength(122);
    expect(validateContent()).toEqual([]);
  });

  it("provides five person-like characters with fixed nine Emoji starts", () => {
    expect(CHARACTERS).toHaveLength(5);
    const rookie = CHARACTERS.find((item) => item.id === "rookie")!;
    expect(rookie.abilityId).toBe("none");
    expect(CHARACTERS.every((item) => rookie.maxHp > item.maxHp || item.id === "rookie")).toBe(true);
    for (const character of CHARACTERS) {
      expect(character.startingPool.sword).toBe(3);
      expect(character.startingPool.heart).toBe(1);
      expect(Object.values(character.startingPool).reduce((sum, count) => sum + count, 0)).toBe(9);
      expect(character.rewardPool).toHaveLength(9);
    }
  });

  it("gives every Emoji rarity, tags, and at least one supported trigger", () => {
    for (const emoji of Object.values(EMOJIS)) {
      expect(["common", "uncommon", "rare"]).toContain(emoji.rarity);
      expect(Array.isArray(emoji.tags)).toBe(true);
      expect(Boolean(emoji.onBingo.length || emoji.onPlace?.length || emoji.whileOwned)).toBe(true);
    }
  });

  it("registers 4 normal, 2 elite, and 1 boss Enemy for every Stage", () => {
    expect(ENEMIES).toHaveLength(21);
    for (const stage of [1, 2, 3]) {
      const stageEnemies = ENEMIES.filter((enemy) => enemy.stages.includes(stage));
      expect(stageEnemies.filter((enemy) => enemy.kind === "normal")).toHaveLength(4);
      expect(stageEnemies.filter((enemy) => enemy.kind === "elite")).toHaveLength(2);
      expect(stageEnemies.filter((enemy) => enemy.kind === "boss")).toHaveLength(1);
    }
  });

  it("keeps Enemy portraits unique and their Pools common-only with exactly nine copies", () => {
    const occupiedIcons = new Set([...Object.values(EMOJIS).map((emoji) => emoji.icon), ...CHARACTERS.map((character) => character.icon)]);
    const commonIds = new Set(COMMON_EMOJI_IDS);
    const legacyEnemyIds = new Set(["sword", "fire", "skull", "heart", "bomb", "statue", "battle_eye"]);
    expect(new Set(ENEMIES.map((enemy) => enemy.icon)).size).toBe(ENEMIES.length);
    expect(new Set(ENEMIES.map((enemy) => enemy.abilityId)).size).toBe(ENEMIES.length);
    for (const enemy of ENEMIES) {
      expect(occupiedIcons.has(enemy.icon), enemy.id).toBe(false);
      expect(Object.values(enemy.pool).reduce((sum, count) => sum + count, 0), enemy.id).toBe(9);
      expect(Object.keys(enemy.pool).every((id) => commonIds.has(id)), enemy.id).toBe(true);
      expect(Object.keys(enemy.pool).every((id) => !legacyEnemyIds.has(id)), enemy.id).toBe(true);
    }
  });
});
