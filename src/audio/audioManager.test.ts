import { soundCuesForEvent } from "./audioManager";

describe("game audio event mapping", () => {
  it("groups combat effects into one attack and one recovery cue", () => {
    expect(soundCuesForEvent({
      type: "combat-effects",
      effects: [{ kind: "damage" }, { kind: "critical" }, { kind: "heal" }, { kind: "shield" }],
    })).toEqual(["attack", "recovery"]);
  });

  it("maps gameplay events to the agreed compact sound set", () => {
    expect(soundCuesForEvent({ type: "placement" })).toEqual(["placement"]);
    expect(soundCuesForEvent({ type: "draw" })).toEqual(["draw"]);
    expect(soundCuesForEvent({ type: "discard" })).toEqual(["discard"]);
    expect(soundCuesForEvent({ type: "bingo" })).toEqual(["bingo"]);
    expect(soundCuesForEvent({ type: "rest" })).toEqual(["rest"]);
    expect(soundCuesForEvent({ type: "result", outcome: "victory" })).toEqual(["victory"]);
    expect(soundCuesForEvent({ type: "result", outcome: "defeat" })).toEqual(["defeat"]);
    expect(soundCuesForEvent({ type: "scene", scene: "battle" })).toEqual([]);
  });
});
