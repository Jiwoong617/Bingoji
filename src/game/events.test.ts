import { EVENTS } from "../content/events";
import { EMOJIS } from "../content/emojis";
import { SeededRandom } from "./rng";
import {
  advanceEventTimers,
  canChooseEventChoice,
  claimPendingEventReward,
  consumeBattleEventModifiers,
  pickRunEvent,
  resolveEventChoice,
  selectableEventEmojiIds,
} from "./events";
import { createRun } from "./run";

function richRun() {
  const run = createRun("rage", 0);
  run.player.hp = 20;
  run.player.maxHp = 40;
  run.player.pool = Object.fromEntries(Object.keys(EMOJIS).map((id) => [id, 2]));
  return run;
}

describe("event engine", () => {
  it("registers the 30 designed events plus four legacy events with unique IDs", () => {
    expect(EVENTS).toHaveLength(34);
    expect(new Set(EVENTS.map((event) => event.id)).size).toBe(34);
  });

  it("resolves every available event choice without breaking the minimum Pool size", () => {
    for (const gameEvent of EVENTS) {
      for (const choice of gameEvent.choices) {
        const run = richRun();
        const selectable = selectableEventEmojiIds(run, choice);
        const count = choice.selection?.minCount ?? choice.selection?.count ?? 0;
        const selected = selectable.slice(0, count);
        expect(canChooseEventChoice(run, choice), `${gameEvent.id}/${choice.id}`).toBe(true);
        const result = resolveEventChoice(run, choice, selected, new SeededRandom(123));
        expect(Object.values(result.run.player.pool).reduce((sum, copies) => sum + copies, 0), `${gameEvent.id}/${choice.id}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("rejects an invalid selection without mutating the source Run", () => {
    const run = richRun();
    const choice = EVENTS.find((event) => event.id === "clone-vat")!.choices[0];
    const before = structuredClone(run);
    const result = resolveEventChoice(run, choice, ["diamond"], new SeededRandom(1));
    expect(result.messages[0]).toContain("조건에 맞는");
    expect(run).toEqual(before);
    expect(result.run).toEqual(before);
  });

  it("is deterministic for the same Run, choice, selection, and seed", () => {
    const event = EVENTS.find((item) => item.id === "pregnant-man")!;
    const first = resolveEventChoice(richRun(), event.choices[0], [], new SeededRandom(77));
    const second = resolveEventChoice(richRun(), event.choices[0], [], new SeededRandom(77));
    expect(first).toEqual(second);
  });

  it("does not repeat a seen event while unseen eligible events remain", () => {
    const run = createRun("rookie", 0);
    run.seenEventIds = EVENTS.filter((event) => event.id !== "pregnant-man" && (!event.stages || event.stages.includes(1))).map((event) => event.id);
    expect(pickRunEvent(run, EVENTS, new SeededRandom(5)).id).toBe("pregnant-man");
  });

  it("ticks scheduled rewards and publishes the result on the Map screen", () => {
    const run = createRun("rookie", 0);
    run.scheduledRewards = [{ id: "test", name: "도착", icon: "📦", mapsRemaining: 1, kind: "duplicate-selected", emojiId: "heart", count: 1 }];
    const before = run.player.pool.heart;
    const advanced = advanceEventTimers(run, new SeededRandom(1));
    expect(advanced.player.pool.heart).toBe(before + 1);
    expect(advanced.scheduledRewards).toEqual([]);
    expect(advanced.notices.join(" ")).toContain("도착");
  });

  it("keeps a newly scheduled Map chain at its full count until the current Map closes", () => {
    const run = createRun("rookie", 0);
    const event = EVENTS.find((item) => item.id === "babysitting")!;
    let result = resolveEventChoice(run, event.choices[0], [], new SeededRandom(1)).run;
    expect(result.player.pool.event_baby).toBe(1);
    result = advanceEventTimers(result, new SeededRandom(1));
    expect(result.scheduledRewards[0].mapsRemaining).toBe(3);
    result = advanceEventTimers(result, new SeededRandom(2));
    result = advanceEventTimers(result, new SeededRandom(3));
    result = advanceEventTimers(result, new SeededRandom(4));
    expect(result.pendingEventReward?.options).toHaveLength(3);
    expect(result.player.pool.event_baby).toBeUndefined();
    const claimed = claimPendingEventReward(result, result.pendingEventReward!.options[0]);
    expect(claimed.pendingEventReward).toBeNull();
  });

  it("counts egg incubation by battles instead of Maps", () => {
    const run = createRun("rookie", 0);
    const event = EVENTS.find((item) => item.id === "mystery-egg")!;
    let result = resolveEventChoice(run, event.choices[0], [], new SeededRandom(1)).run;
    result = advanceEventTimers(result, new SeededRandom(2));
    expect(result.scheduledRewards[0].mapsRemaining).toBe(2);
    result = consumeBattleEventModifiers(result, true, new SeededRandom(3));
    expect(result.scheduledRewards[0].mapsRemaining).toBe(1);
    result.scheduledRewards[0].triggered = true;
    result = consumeBattleEventModifiers(result, true, new SeededRandom(4));
    expect(result.scheduledRewards).toEqual([]);
    expect(result.notices.join(" ")).toContain("알 부화");
  });

  it("consumes one-battle modifiers and grants victory hooks", () => {
    const run = createRun("rookie", 0);
    run.modifiers = [
      { id: "freeze-emoji", name: "냉동", icon: "🧊", description: "", remainingBattles: 1, emojiId: "heart" },
      { id: "future-fight-reward", name: "미래", icon: "🧓", description: "", remainingBattles: 1, emojiId: "sword" },
    ];
    const heart = run.player.pool.heart;
    const sword = run.player.pool.sword;
    const result = consumeBattleEventModifiers(run, true, new SeededRandom(1));
    expect(result.player.pool.heart).toBe(heart + 1);
    expect(result.player.pool.sword).toBe(sword + 2);
    expect(result.modifiers).toEqual([]);
  });
});
