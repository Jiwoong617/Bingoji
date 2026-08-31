import {
  PVP_EMOJI_IDS,
  PVP_MAX_RARE,
  PVP_MAX_UNCOMMON,
  isProfileAvatarEmoji,
  pvpMaxCopiesForEmoji,
  validateMultiplayerProfile,
  validatePvpPool,
} from "./rules";

describe("PvP multiplayer rules", () => {
  it("accepts a 10-card common Pool with at most two copies each", () => {
    const result = validatePvpPool({ sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2 });

    expect(result.valid).toBe(true);
    expect(result.total).toBe(10);
    expect(result.rarityCounts).toEqual({ common: 10, uncommon: 0, rare: 0 });
  });

  it("rejects Pools outside the 10 to 15 card range", () => {
    const tooSmall = validatePvpPool({ sword: 2, heart: 2, fire: 2, shield: 2 });
    const tooLarge = validatePvpPool({ sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2, starlight: 2, target: 2, dice: 2 });

    expect(tooSmall.errors.map((error) => error.code)).toContain("pool-too-small");
    expect(tooLarge.errors.map((error) => error.code)).toContain("pool-too-large");
  });

  it("enforces copy and rarity limits", () => {
    const tooManyCopies = validatePvpPool({ sword: 3, heart: 2, fire: 2, shield: 2, bandage: 1 });
    const tooManyUncommon = validatePvpPool({ firecracker: 2, catalyst: 2, seed: 2, shell: 2, hedgehog: 2 });
    const tooManyRare = validatePvpPool({ rainbow: 2, battle_eye: 2, castle: 1, sword: 2, heart: 2, fire: 1 });

    expect(tooManyCopies.errors.map((error) => error.code)).toContain("too-many-copies");
    expect(tooManyUncommon.errors.map((error) => error.code)).toContain("too-many-uncommon");
    expect(tooManyRare.errors.map((error) => error.code)).toContain("too-many-rare");
    expect(PVP_MAX_UNCOMMON).toBe(8);
    expect(PVP_MAX_RARE).toBe(4);
  });

  it("allows only one copy of each Emoji that grants an extra placement", () => {
    const uncommon = validatePvpPool({ extra_turn: 2, sword: 2, heart: 2, fire: 2, shield: 2 });
    const rare = validatePvpPool({ cycle: 2, sword: 2, heart: 2, fire: 2, shield: 2 });

    expect(pvpMaxCopiesForEmoji("extra_turn")).toBe(1);
    expect(pvpMaxCopiesForEmoji("cycle")).toBe(1);
    expect(pvpMaxCopiesForEmoji("sword")).toBe(2);
    expect(uncommon.errors.map((error) => error.code)).toContain("too-many-extra-placement-copies");
    expect(rare.errors.map((error) => error.code)).toContain("too-many-extra-placement-copies");
  });

  it("excludes event-only tokens but exposes every battle Emoji", () => {
    const result = validatePvpPool({ event_egg: 1, sword: 2, heart: 2, fire: 2, shield: 2, bandage: 1 });

    expect(PVP_EMOJI_IDS).not.toContain("event_egg");
    expect(PVP_EMOJI_IDS).not.toContain("event_baby");
    expect(PVP_EMOJI_IDS).toContain("sword");
    expect(result.errors.map((error) => error.code)).toContain("excluded-emoji");
  });

  it("rejects unknown Emoji IDs", () => {
    const result = validatePvpPool({ missing: 2, sword: 2, heart: 2, fire: 2, shield: 2 });

    expect(result.errors.map((error) => error.code)).toContain("unknown-emoji");
  });

  it("rejects Object prototype keys as unknown Emoji IDs", () => {
    const pool = Object.fromEntries([
      ["sword", 2], ["heart", 2], ["fire", 2], ["clover", 2],
      ["constructor", 1], ["toString", 1], ["__proto__", 1],
    ]);
    const result = validatePvpPool(pool);

    expect(result.valid).toBe(false);
    expect(result.errors.filter((error) => error.code === "unknown-emoji").map((error) => error.emojiId))
      .toEqual(["constructor", "toString", "__proto__"]);
    expect(result.rarityCounts).toEqual({ common: 8, uncommon: 0, rare: 0 });
  });

  it("normalizes and validates multiplayer profiles", () => {
    const result = validateMultiplayerProfile({
      avatar: "🙂",
      nickname: "  빙고   왕  ",
      pool: { sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2 },
    });

    expect(result.valid).toBe(true);
    expect(result.normalizedNickname).toBe("빙고 왕");
  });

  it("accepts any single Unicode Emoji and rejects text or multiple Emoji", () => {
    expect(isProfileAvatarEmoji("🐙")).toBe(true);
    expect(isProfileAvatarEmoji("🧑🏽‍🚀")).toBe(true);
    expect(isProfileAvatarEmoji("🇰🇷")).toBe(true);
    expect(isProfileAvatarEmoji("7️⃣")).toBe(true);
    expect(isProfileAvatarEmoji("A")).toBe(false);
    expect(isProfileAvatarEmoji("🙂😎")).toBe(false);
    expect(isProfileAvatarEmoji("")).toBe(false);
  });

  it("validates a profile with an Emoji outside the former preset list", () => {
    const result = validateMultiplayerProfile({
      avatar: "🐙",
      nickname: "문어왕",
      pool: { sword: 2, heart: 2, fire: 2, shield: 2, bandage: 2 },
    });

    expect(result.valid).toBe(true);
  });
});
