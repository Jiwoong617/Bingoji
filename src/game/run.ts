import {
  CHARACTERS,
  COMMON_REWARDS,
  EMOJIS,
  ENEMIES,
  EVENTS,
  MAP_META,
} from "../content/data";
import { poolEntries, type RandomSource, weightedChoice } from "./rng";
import { pickRunEvent } from "./events";
import type {
  EnemyDefinition,
  EnemyKind,
  Difficulty,
  GameEventDefinition,
  MapCandidate,
  MapType,
  RunPlayer,
  RunProgress,
  Rarity,
} from "./types";

export const RUN_CONFIG = {
  stageCount: 3,
  mapsPerStage: 10,
  restHealRatio: 0.3,
  questionBattleChance: 0.35,
  battlePairRepeatChance: 0.2,
  mapWeights: {
    battle: 46,
    question: 29,
    elite: 15,
    rest: 10,
  },
  rewardRarityWeights: {
    normal: { common: 75, uncommon: 25, rare: 0 },
    elite: { common: 35, uncommon: 50, rare: 15 },
    boss: { common: 10, uncommon: 25, rare: 65 },
  } satisfies Record<EnemyKind, Record<Rarity, number>>,
};

export function createRun(characterId: string, now = Date.now(), difficulty: Difficulty = "normal"): RunProgress {
  const character = CHARACTERS.find((item) => item.id === characterId) ?? CHARACTERS[0];
  return {
    player: {
      characterId: character.id,
      icon: character.icon,
      name: character.name,
      ability: character.ability,
      abilityId: character.abilityId,
      hp: character.maxHp,
      maxHp: character.maxHp,
      pool: { ...character.startingPool },
    },
    difficulty,
    stage: 1,
    completedMaps: 0,
    currentMap: 0,
    currentMapType: null,
    lastEnemyId: null,
    seenEventIds: [],
    modifiers: [],
    scheduledRewards: [],
    pendingEventReward: null,
    notices: [],
    forcedNextMapType: null,
    ensureNextBattleOption: false,
    startedAt: now,
  };
}

function candidate(type: MapType, position: number, side: number): MapCandidate {
  return {
    id: `${position}-${side}-${type}`,
    type,
    ...MAP_META[type],
  };
}

function randomMapType(rng: RandomSource, excludeRest = false): MapType {
  const options = [
    { value: "battle" as const, weight: RUN_CONFIG.mapWeights.battle },
    { value: "question" as const, weight: RUN_CONFIG.mapWeights.question },
    { value: "elite" as const, weight: RUN_CONFIG.mapWeights.elite },
    ...(excludeRest
      ? []
      : [{ value: "rest" as const, weight: RUN_CONFIG.mapWeights.rest }]),
  ];
  return weightedChoice(options, rng);
}

function randomNonBattleMapType(rng: RandomSource): Exclude<MapType, "battle" | "boss"> {
  return weightedChoice([
    { value: "question" as const, weight: RUN_CONFIG.mapWeights.question },
    { value: "elite" as const, weight: RUN_CONFIG.mapWeights.elite },
    { value: "rest" as const, weight: RUN_CONFIG.mapWeights.rest },
  ], rng);
}

export function generateMapCandidates(
  completedMaps: number,
  rng: RandomSource,
): MapCandidate[] {
  const nextPosition = completedMaps + 1;
  if (nextPosition === 1) return [candidate("battle", nextPosition, 0)];
  if (nextPosition >= RUN_CONFIG.mapsPerStage) return [candidate("boss", nextPosition, 0)];
  if (nextPosition === 9) {
    const restSide = rng.int(2);
    return [0, 1].map((side) =>
      candidate(side === restSide ? "rest" : randomMapType(rng, true), nextPosition, side),
    );
  }
  const leftType = randomMapType(rng);
  const rightType = leftType === "battle"
    ? rng.next() < RUN_CONFIG.battlePairRepeatChance
      ? "battle"
      : randomNonBattleMapType(rng)
    : randomMapType(rng);
  return [candidate(leftType, nextPosition, 0), candidate(rightType, nextPosition, 1)];
}

export function generateRunMapCandidates(
  sourceRun: RunProgress,
  rng: RandomSource,
): { run: RunProgress; candidates: MapCandidate[] } {
  const nextPosition = sourceRun.completedMaps + 1;
  let candidates: MapCandidate[];
  if (sourceRun.forcedNextMapType && nextPosition > 1 && nextPosition < RUN_CONFIG.mapsPerStage) {
    candidates = [candidate(sourceRun.forcedNextMapType, nextPosition, 0)];
  } else {
    candidates = generateMapCandidates(sourceRun.completedMaps, rng);
    if (sourceRun.ensureNextBattleOption && candidates.length > 1 && !candidates.some((item) => item.type === "battle")) {
      candidates[0] = candidate("battle", nextPosition, 0);
    }
  }
  return {
    run: { ...sourceRun, forcedNextMapType: null, ensureNextBattleOption: false },
    candidates,
  };
}

export function enterMap(run: RunProgress, map: MapCandidate): RunProgress {
  return {
    ...run,
    currentMap: run.completedMaps + 1,
    currentMapType: map.type,
  };
}

export function completeCurrentMap(run: RunProgress): RunProgress {
  const completedMaps = run.currentMap;
  if (completedMaps >= RUN_CONFIG.mapsPerStage && run.stage < RUN_CONFIG.stageCount) {
    return {
      ...run,
      stage: run.stage + 1,
      completedMaps: 0,
      currentMap: 0,
      currentMapType: null,
    };
  }
  return {
    ...run,
    completedMaps,
    currentMapType: null,
  };
}

export function pickEnemy(
  stage: number,
  kind: EnemyKind,
  rng: RandomSource,
  lastEnemyId: string | null = null,
  currentMap = 0,
): EnemyDefinition {
  const candidates = ENEMIES.filter(
    (enemy) => enemy.kind === kind && enemy.stages.includes(stage),
  );
  const fallback = ENEMIES.filter((enemy) => enemy.kind === kind);
  const stageCandidates = candidates.length ? candidates : fallback;
  if (stage === 1 && kind === "normal" && currentMap === 1) {
    return stageCandidates.find((enemy) => enemy.id === "prairie_rat") ?? stageCandidates[0];
  }
  const withoutRepeat = stageCandidates.filter((enemy) => enemy.id !== lastEnemyId);
  return rng.pick(withoutRepeat.length ? withoutRepeat : stageCandidates);
}

export function resolveQuestionMap(rng: RandomSource): "event" | "battle" {
  return rng.next() < RUN_CONFIG.questionBattleChance ? "battle" : "event";
}

export function pickEvent(run: RunProgress, rng: RandomSource): GameEventDefinition {
  return pickRunEvent(run, EVENTS, rng);
}

export function applyRest(player: RunPlayer): { player: RunPlayer; healed: number } {
  const amount = Math.floor(player.maxHp * RUN_CONFIG.restHealRatio);
  const hp = Math.min(player.maxHp, player.hp + amount);
  return { player: { ...player, hp }, healed: hp - player.hp };
}

export function createRewardOptions(
  player: RunPlayer,
  enemyKind: EnemyKind,
  rng: RandomSource,
  rareBoostPercent = 0,
): { characterEmojiId: string; commonEmojiId: string } {
  const character = CHARACTERS.find((item) => item.id === player.characterId) ?? CHARACTERS[0];
  const rarityWeights = { ...RUN_CONFIG.rewardRarityWeights[enemyKind] };
  let remainingBoost = Math.max(0, rareBoostPercent);
  const commonShift = Math.min(rarityWeights.common, remainingBoost);
  rarityWeights.common -= commonShift;
  rarityWeights.rare += commonShift;
  remainingBoost -= commonShift;
  const uncommonShift = Math.min(rarityWeights.uncommon, remainingBoost);
  rarityWeights.uncommon -= uncommonShift;
  rarityWeights.rare += uncommonShift;
  const pickReward = (ids: string[]) => {
    const byRarity: Record<Rarity, string[]> = { common: [], uncommon: [], rare: [] };
    ids.forEach((id) => byRarity[EMOJIS[id].rarity].push(id));
    const rarity = weightedChoice(
      (["common", "uncommon", "rare"] as const)
        .filter((item) => (byRarity[item]?.length ?? 0) > 0 && rarityWeights[item] > 0)
        .map((item) => ({ value: item, weight: rarityWeights[item] })),
      rng,
    );
    return rng.pick(byRarity[rarity] ?? []);
  };
  return {
    characterEmojiId: pickReward(character.rewardPool),
    commonEmojiId: pickReward(COMMON_REWARDS[enemyKind]),
  };
}

export function addEmoji(player: RunPlayer, emojiId: string): RunPlayer {
  return {
    ...player,
    pool: {
      ...player.pool,
      [emojiId]: (player.pool[emojiId] ?? 0) + 1,
    },
  };
}

export function canRemoveEmoji(player: RunPlayer, emojiId: string): boolean {
  if (!player.pool[emojiId]) return false;
  return poolEntries(player.pool).length > 3;
}

export function removeEmoji(player: RunPlayer, emojiId: string): RunPlayer {
  if (!canRemoveEmoji(player, emojiId)) return player;
  const pool = { ...player.pool, [emojiId]: player.pool[emojiId] - 1 };
  if (pool[emojiId] <= 0) delete pool[emojiId];
  return { ...player, pool };
}
