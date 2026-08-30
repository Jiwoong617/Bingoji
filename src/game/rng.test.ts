import { drawFromPool, SeededRandom } from "./rng";

describe("seeded Pool draws", () => {
  it("reproduces the same sequence for the same seed", () => {
    const pool = { sword: 3, heart: 2, fire: 1 };
    expect(drawFromPool(pool, 3, new SeededRandom(2026))).toEqual(
      drawFromPool(pool, 3, new SeededRandom(2026)),
    );
  });

  it("draws Emoji with an owned effect like every other Emoji", () => {
    const result = drawFromPool({ battle_eye: 3 }, 3, new SeededRandom(1));
    expect(result).toEqual(["battle_eye", "battle_eye", "battle_eye"]);
  });

  it("continues the exact random sequence from a serialized state", () => {
    const original = new SeededRandom(2026);
    original.next();
    original.next();
    const restored = SeededRandom.fromState(original.snapshot());

    expect(restored.next()).toBe(original.next());
    expect(restored.next()).toBe(original.next());
  });
});
