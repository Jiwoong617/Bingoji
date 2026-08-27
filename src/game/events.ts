import { CHARACTER_REWARD_POOLS, COMMON_EMOJI_IDS, EMOJIS } from "../content/emojis";
import { weightedChoice, type RandomSource } from "./rng";
import type {
  EventChoice,
  EventEffect,
  EventEmojiFilter,
  GameEventDefinition,
  RunModifier,
  RunProgress,
  ScheduledReward,
} from "./types";

const poolSize = (run: RunProgress) => Object.values(run.player.pool).reduce((sum, count) => sum + count, 0);

function matchesFilter(emojiId: string, filter: EventEmojiFilter | undefined, run: RunProgress, selectedId?: string): boolean {
  const emoji = EMOJIS[emojiId];
  if (!emoji) return false;
  if (filter?.rarities && !filter.rarities.includes(emoji.rarity)) return false;
  if (filter?.tags && !filter.tags.some((tag) => emoji.tags.includes(tag))) return false;
  if (filter?.commonOnly && !COMMON_EMOJI_IDS.includes(emojiId)) return false;
  if (filter?.characterOnly && !(CHARACTER_REWARD_POOLS[run.player.characterId] ?? []).includes(emojiId)) return false;
  if (filter?.notOwned && (run.player.pool[emojiId] ?? 0) > 0) return false;
  if (filter?.sameTagsAsSelected && selectedId) {
    const selectedTags = EMOJIS[selectedId]?.tags ?? [];
    if (!emoji.tags.some((tag) => selectedTags.includes(tag))) return false;
  }
  return true;
}

export function selectableEventEmojiIds(run: RunProgress, choice: EventChoice): string[] {
  return Object.keys(run.player.pool).filter((id) => !EMOJIS[id]?.tags.includes("event") && matchesFilter(id, choice.selection?.filter, run));
}

export function canChooseEventChoice(run: RunProgress, choice: EventChoice): boolean {
  if (!choice.selection) return true;
  return selectableEventEmojiIds(run, choice).length >= (choice.selection.minCount ?? choice.selection.count);
}

function cloneRun(source: RunProgress): RunProgress {
  return {
    ...source,
    player: { ...source.player, pool: { ...source.player.pool } },
    seenEventIds: [...source.seenEventIds],
    modifiers: source.modifiers.map((item) => ({ ...item })),
    scheduledRewards: source.scheduledRewards.map((item) => ({ ...item })),
    pendingEventReward: source.pendingEventReward ? { ...source.pendingEventReward, options: [...source.pendingEventReward.options] } : null,
    notices: [...source.notices],
  };
}

function randomEmoji(run: RunProgress, filter: EventEmojiFilter | undefined, rng: RandomSource, excludeId?: string): string | null {
  const candidates = Object.keys(EMOJIS).filter((id) => id !== excludeId && matchesFilter(id, filter, run, excludeId));
  return candidates.length > 0 ? rng.pick(candidates) : null;
}

function randomEmojiOptions(run: RunProgress, filter: EventEmojiFilter | undefined, rng: RandomSource, count: number, excludeId?: string): string[] {
  return rng.shuffle(Object.keys(EMOJIS).filter((id) => id !== excludeId && matchesFilter(id, filter, run, excludeId))).slice(0, count);
}

function addEmoji(run: RunProgress, emojiId: string, count: number, messages: string[]): void {
  if (!EMOJIS[emojiId] || count <= 0) return;
  run.player.pool[emojiId] = (run.player.pool[emojiId] ?? 0) + count;
  messages.push(`${EMOJIS[emojiId].icon} ${EMOJIS[emojiId].name} ${count > 1 ? `${count}개를` : "한 개를"} 얻었습니다.`);
}

function removeEmoji(run: RunProgress, emojiId: string, requested: number | "all", messages: string[]): number {
  const owned = run.player.pool[emojiId] ?? 0;
  const wanted = requested === "all" ? owned : Math.min(owned, requested);
  const removable = Math.max(0, poolSize(run) - 3);
  const removed = Math.min(wanted, removable);
  if (removed <= 0) {
    messages.push("Pool에는 최소 3개의 Emoji가 필요해 제거하지 않았습니다.");
    return 0;
  }
  run.player.pool[emojiId] -= removed;
  if (run.player.pool[emojiId] <= 0) delete run.player.pool[emojiId];
  messages.push(`${EMOJIS[emojiId].icon} ${EMOJIS[emojiId].name} ${removed}개를 제거했습니다.`);
  return removed;
}

function resolvedToken(value: string | undefined, selectedIds: string[]): string | undefined {
  if (value === "$selected0") return selectedIds[0];
  if (value === "$selected-pair") return selectedIds.slice(0, 2).join("|");
  return value;
}

function dominantPoolTag(run: RunProgress): string | undefined {
  const scores = new Map<string, number>();
  for (const [emojiId, count] of Object.entries(run.player.pool)) {
    for (const tag of EMOJIS[emojiId]?.tags ?? []) scores.set(tag, (scores.get(tag) ?? 0) + count);
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

function applyEffect(
  run: RunProgress,
  effect: EventEffect,
  selectedIds: string[],
  rng: RandomSource,
  messages: string[],
): void {
  switch (effect.type) {
    case "damage": {
      const before = run.player.hp;
      run.player.hp = Math.max(0, run.player.hp - effect.amount);
      messages.push(`HP를 ${before - run.player.hp} 잃었습니다.`);
      break;
    }
    case "heal": {
      const before = run.player.hp;
      run.player.hp = Math.min(run.player.maxHp, run.player.hp + effect.amount);
      messages.push(`HP를 ${run.player.hp - before} 회복했습니다.`);
      break;
    }
    case "max-hp": {
      const before = run.player.maxHp;
      run.player.maxHp = Math.max(3, run.player.maxHp + effect.amount);
      if (effect.amount > 0) run.player.hp = Math.min(run.player.maxHp, run.player.hp + (run.player.maxHp - before));
      else run.player.hp = Math.min(run.player.hp, run.player.maxHp);
      messages.push(`최대 HP가 ${run.player.maxHp - before >= 0 ? "+" : ""}${run.player.maxHp - before} 변화했습니다.`);
      break;
    }
    case "add-emoji": addEmoji(run, effect.emojiId, 1, messages); break;
    case "add-random-emoji": {
      if (effect.minSelectedCopies && (run.player.pool[selectedIds[0]] ?? 0) < effect.minSelectedCopies) {
        messages.push(`선택한 Emoji가 ${effect.minSelectedCopies}개 미만이라 추가 보상은 없습니다.`);
        break;
      }
      for (let index = 0; index < (effect.count ?? 1); index += 1) {
        const emojiId = randomEmoji(run, effect.filter, rng);
        if (emojiId) addEmoji(run, emojiId, 1, messages);
      }
      break;
    }
    case "add-character-or-common":
      addEmoji(run, run.player.characterId === effect.characterId ? effect.characterEmojiId : effect.commonEmojiId, 1, messages);
      break;
    case "remove-random-emoji": {
      for (let index = 0; index < (effect.count ?? 1); index += 1) {
        const entries = Object.entries(run.player.pool).filter(([id, count]) => count > 0 && !EMOJIS[id]?.tags.includes("event")).flatMap(([id, count]) => Array.from({ length: count }, () => id));
        if (poolSize(run) <= 3 || entries.length === 0) { messages.push("Pool이 너무 작아 Emoji를 제거하지 않았습니다."); break; }
        removeEmoji(run, rng.pick(entries), 1, messages);
      }
      break;
    }
    case "remove-selected": {
      const emojiId = selectedIds[effect.selectionIndex ?? 0];
      if (emojiId) removeEmoji(run, emojiId, effect.count ?? 1, messages);
      break;
    }
    case "remove-all-selected":
      selectedIds.forEach((emojiId) => removeEmoji(run, emojiId, 1, messages));
      break;
    case "duplicate-selected": {
      const emojiId = selectedIds[effect.selectionIndex ?? 0];
      if (emojiId) addEmoji(run, emojiId, effect.count, messages);
      break;
    }
    case "swap-selected-counts": {
      const [first, second] = selectedIds;
      if (first && second) {
        const firstCount = run.player.pool[first] ?? 0;
        run.player.pool[first] = run.player.pool[second] ?? 0;
        run.player.pool[second] = firstCount;
        messages.push(`${EMOJIS[first].icon}와 ${EMOJIS[second].icon}의 보유 개수를 교환했습니다.`);
      }
      break;
    }
    case "transform-selected": {
      const sourceId = selectedIds[effect.selectionIndex ?? 0];
      const targetId = sourceId ? randomEmoji(run, effect.filter, rng, sourceId) : null;
      if (sourceId && targetId && removeEmoji(run, sourceId, 1, messages) > 0) addEmoji(run, targetId, 1, messages);
      break;
    }
    case "remove-most-common": {
      const entries = Object.entries(run.player.pool).filter(([id]) => !EMOJIS[id]?.tags.includes("event"));
      const max = Math.max(...entries.map(([, count]) => count));
      removeEmoji(run, rng.pick(entries.filter(([, count]) => count === max))[0], effect.count ?? 1, messages);
      break;
    }
    case "duplicate-least-common": {
      const entries = Object.entries(run.player.pool).filter(([id]) => !EMOJIS[id]?.tags.includes("event"));
      const min = Math.min(...entries.map(([, count]) => count));
      addEmoji(run, rng.pick(entries.filter(([, count]) => count === min))[0], effect.count ?? 1, messages);
      break;
    }
    case "heal-per-selection": {
      const before = run.player.hp;
      run.player.hp = Math.min(run.player.maxHp, run.player.hp + effect.amount * selectedIds.length);
      messages.push(`HP를 ${run.player.hp - before} 회복했습니다.`);
      break;
    }
    case "random-branch": {
      const branch = weightedChoice(effect.branches.map((item) => ({ value: item, weight: item.weight })), rng);
      messages.push(`결과: ${branch.label}`);
      branch.effects.forEach((nested) => applyEffect(run, nested, selectedIds, rng, messages));
      break;
    }
    case "add-modifier": {
      const modifier: RunModifier = { ...effect.modifier, emojiId: resolvedToken(effect.modifier.emojiId, selectedIds) };
      run.modifiers.push(modifier);
      messages.push(`${modifier.icon} ${modifier.name}: ${modifier.description}`);
      break;
    }
    case "schedule-reward": {
      const reward: ScheduledReward = {
        ...effect.reward,
        emojiId: resolvedToken(effect.reward.emojiId, selectedIds),
        skipNextTick: effect.reward.counter !== "battle",
      };
      if (reward.tag === "$dominant") reward.tag = dominantPoolTag(run);
      if (reward.kind === "random-tag" && !reward.tag && reward.emojiId) reward.tag = EMOJIS[reward.emojiId]?.tags[0];
      run.scheduledRewards.push(reward);
      messages.push(`${reward.icon} ${reward.mapsRemaining} Map 뒤 ‘${reward.name}’ 결과가 도착합니다.`);
      break;
    }
    case "force-next-map":
      run.forcedNextMapType = effect.mapType;
      messages.push(`다음 Map이 ${effect.mapType === "elite" ? "Elite 전투" : effect.mapType === "battle" ? "일반 전투" : effect.mapType}로 고정됩니다.`);
      break;
    case "ensure-next-battle-option":
      run.ensureNextBattleOption = true;
      messages.push("다음 후보 중 하나가 일반 전투가 됩니다.");
      break;
  }
}

export function resolveEventChoice(
  sourceRun: RunProgress,
  choice: EventChoice,
  selectedIds: string[],
  rng: RandomSource,
): { run: RunProgress; messages: string[] } {
  const run = cloneRun(sourceRun);
  const messages: string[] = [];
  if (choice.selection) {
    const minimum = choice.selection.minCount ?? choice.selection.count;
    const eligible = new Set(selectableEventEmojiIds(sourceRun, choice));
    const validCount = selectedIds.length >= minimum && selectedIds.length <= choice.selection.count;
    const validIds = selectedIds.every((id) => eligible.has(id));
    const validDistinct = !choice.selection.distinct || new Set(selectedIds).size === selectedIds.length;
    if (!validCount || !validIds || !validDistinct) {
      return { run, messages: [`조건에 맞는 Emoji를 ${minimum === choice.selection.count ? minimum : `${minimum}~${choice.selection.count}`}개 선택해야 합니다.`] };
    }
  }
  choice.effects.forEach((effect) => applyEffect(run, effect, selectedIds, rng, messages));
  return { run, messages };
}

function grantScheduledReward(run: RunProgress, reward: ScheduledReward, rng: RandomSource, messages: string[]): void {
  if (reward.kind === "random-rare") {
    const id = randomEmoji(run, { rarities: ["rare"], commonOnly: true }, rng);
    if (id) addEmoji(run, id, reward.count ?? 1, messages);
  } else if (reward.kind === "random-tag") {
    if (reward.choiceCount && reward.choiceCount > 1) {
      const tagged = randomEmojiOptions(run, { tags: reward.tag ? [reward.tag] : undefined, rarities: ["rare"], commonOnly: true }, rng, reward.choiceCount);
      const fallback = randomEmojiOptions(run, { rarities: ["rare"], commonOnly: true }, rng, reward.choiceCount)
        .filter((id) => !tagged.includes(id));
      const options = [...tagged, ...fallback].slice(0, reward.choiceCount);
      if (options.length > 0) run.pendingEventReward = { id: reward.id, name: reward.name, icon: reward.icon, options };
      return;
    }
    const id = randomEmoji(run, { tags: reward.tag ? [reward.tag] : undefined, rarities: ["rare"], commonOnly: true }, rng)
      ?? randomEmoji(run, { tags: reward.tag ? [reward.tag] : undefined, commonOnly: true }, rng);
    if (id) addEmoji(run, id, reward.count ?? 1, messages);
  } else if (reward.kind === "character-choice") {
    const candidates = ["gift", "healing_burst", ...(CHARACTER_REWARD_POOLS[run.player.characterId] ?? [])];
    run.pendingEventReward = { id: reward.id, name: reward.name, icon: reward.icon, options: rng.shuffle(candidates).slice(0, 3) };
  } else if (reward.kind === "duplicate-selected" && reward.emojiId) {
    addEmoji(run, reward.emojiId, reward.count ?? 1, messages);
  } else if (reward.kind === "transform-selected" && reward.emojiId) {
    const rarity = EMOJIS[reward.emojiId]?.rarity;
    for (let index = 0; index < (reward.count ?? 1); index += 1) {
      const id = randomEmoji(run, { rarities: rarity ? [rarity] : undefined, commonOnly: true }, rng, reward.emojiId);
      if (id) addEmoji(run, id, 1, messages);
    }
  } else if (reward.kind === "egg-hatch") {
    if (reward.triggered) {
      const id = randomEmoji(run, { tags: ["animal", "growth"], rarities: ["rare"], commonOnly: true }, rng)
        ?? randomEmoji(run, { tags: ["animal", "growth"], commonOnly: true }, rng);
      if (id) addEmoji(run, id, 1, messages);
    } else {
      const id = randomEmoji(run, { tags: ["animal"], rarities: ["common"], commonOnly: true }, rng);
      if (id) addEmoji(run, id, 2, messages);
    }
  } else if (reward.kind === "baby-return") {
    if ((run.player.pool.event_baby ?? 0) > 0) removeEmoji(run, "event_baby", 1, messages);
    if (reward.triggered) {
      const before = run.player.maxHp;
      run.player.maxHp = Math.max(3, run.player.maxHp - 2);
      run.player.hp = Math.min(run.player.hp, run.player.maxHp);
      messages.push(`아기가 파괴되어 최대 HP가 ${before - run.player.maxHp} 감소했습니다.`);
    } else {
      const characterReward = rng.pick(CHARACTER_REWARD_POOLS[run.player.characterId] ?? ["gift"]);
      run.pendingEventReward = { id: reward.id, name: reward.name, icon: reward.icon, options: ["gift", "healing_burst", characterReward] };
    }
  }
}

export function claimPendingEventReward(sourceRun: RunProgress, emojiId: string): RunProgress {
  const run = cloneRun(sourceRun);
  const pending = run.pendingEventReward;
  if (!pending || !pending.options.includes(emojiId)) return run;
  const messages: string[] = [];
  addEmoji(run, emojiId, 1, messages);
  run.pendingEventReward = null;
  run.notices.push(...messages);
  return run;
}

export function advanceEventTimers(sourceRun: RunProgress, rng: RandomSource): RunProgress {
  const run = cloneRun(sourceRun);
  const messages: string[] = [];
  const pending: ScheduledReward[] = [];
  for (const reward of run.scheduledRewards) {
    if (reward.counter === "battle") {
      pending.push(reward);
      continue;
    }
    if (reward.skipNextTick) {
      pending.push({ ...reward, skipNextTick: false });
      continue;
    }
    const advanced = { ...reward, mapsRemaining: reward.mapsRemaining - 1 };
    if (advanced.mapsRemaining <= 0) {
      messages.push(`${advanced.icon} ${advanced.name}`);
      grantScheduledReward(run, advanced, rng, messages);
    } else pending.push(advanced);
  }
  run.scheduledRewards = pending;
  run.modifiers = run.modifiers
    .map((item) => item.remainingMaps === undefined ? item : { ...item, remainingMaps: item.remainingMaps - 1 })
    .filter((item) => item.remainingMaps === undefined || item.remainingMaps > 0);
  run.notices.push(...messages);
  return run;
}

export function consumeBattleEventModifiers(sourceRun: RunProgress, won: boolean, rng: RandomSource): RunProgress {
  const run = cloneRun(sourceRun);
  const notices: string[] = [];
  const remaining: RunModifier[] = [];
  for (const modifier of run.modifiers) {
    if (won && modifier.id === "freeze-emoji" && modifier.emojiId) addEmoji(run, modifier.emojiId, 1, notices);
    if (won && modifier.id === "freeze-rare-reward") {
      const id = randomEmoji(run, { rarities: ["rare"], commonOnly: true }, rng);
      if (id) addEmoji(run, id, 1, notices);
    }
    if (won && modifier.id === "future-fight-reward" && modifier.emojiId) addEmoji(run, modifier.emojiId, 2, notices);
    if (modifier.remainingBattles === undefined) remaining.push(modifier);
    else if (modifier.remainingBattles > 1) remaining.push({ ...modifier, remainingBattles: modifier.remainingBattles - 1 });
  }
  run.modifiers = remaining;
  const scheduled: ScheduledReward[] = [];
  for (const reward of run.scheduledRewards) {
    if (reward.counter !== "battle") {
      scheduled.push(reward);
      continue;
    }
    const advanced = { ...reward, mapsRemaining: reward.mapsRemaining - 1 };
    if (advanced.mapsRemaining <= 0 && won) {
      notices.push(`${advanced.icon} ${advanced.name}`);
      grantScheduledReward(run, advanced, rng, notices);
    } else if (advanced.mapsRemaining > 0) scheduled.push(advanced);
  }
  run.scheduledRewards = scheduled;
  run.notices.push(...notices);
  return run;
}

export function settleScheduledRewards(sourceRun: RunProgress, rng: RandomSource): RunProgress {
  const run = cloneRun(sourceRun);
  const notices: string[] = [];
  run.scheduledRewards.forEach((reward) => {
    notices.push(`${reward.icon} ${reward.name} · Run 종료 전 즉시 정산`);
    grantScheduledReward(run, reward, rng, notices);
  });
  run.scheduledRewards = [];
  if (run.pendingEventReward?.options.length) {
    const selected = rng.pick(run.pendingEventReward.options);
    addEmoji(run, selected, 1, notices);
    run.pendingEventReward = null;
  }
  run.notices.push(...notices);
  return run;
}

export function pickRunEvent(run: RunProgress, events: GameEventDefinition[], rng: RandomSource): GameEventDefinition {
  const hasActiveChain = run.scheduledRewards.length > 0 || run.pendingEventReward !== null;
  const eligible = events.filter((event) => (!event.stages || event.stages.includes(run.stage)) && !(hasActiveChain && event.category === "rare"));
  const unseen = eligible.filter((event) => !run.seenEventIds.includes(event.id));
  const pool = unseen.length > 0 ? unseen : eligible;
  const categories = {
    base: pool.filter((event) => event.category === "base" || event.category === "legacy"),
    stage: pool.filter((event) => event.category === "stage"),
    rare: pool.filter((event) => event.category === "rare"),
  };
  const available = (["base", "stage", "rare"] as const)
    .filter((category) => categories[category].length > 0)
    .map((category) => ({ value: category, weight: category === "base" ? 70 : category === "stage" ? 25 : 5 }));
  const category = weightedChoice(available, rng);
  return rng.pick(categories[category]);
}
