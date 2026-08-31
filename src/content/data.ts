import type {
  CharacterDefinition,
  EnemyKind,
  EventEffect,
  MapType,
  Pool,
} from "../game/types";
import { CHARACTER_REWARD_POOLS, COMMON_EMOJI_IDS, EMOJIS } from "./emojis";
import { ENEMIES } from "./enemies";
import { EVENTS } from "./events";

export { EMOJIS } from "./emojis";
export { ENEMIES } from "./enemies";
export { EVENTS } from "./events";

export const CHARACTERS: CharacterDefinition[] = [
  {
    id: "rookie",
    icon: "🙂",
    name: "루키",
    maxHp: 42,
    ability: "고유 능력은 없지만 가장 높은 HP로 안정적으로 전투를 배웁니다.",
    abilityId: "none",
    startingPool: { sword: 3, heart: 1, extra_turn: 1, shield: 2, bandage: 1, starlight: 1, fire: 1 },
    rewardPool: CHARACTER_REWARD_POOLS.rookie,
  },
  {
    id: "worker",
    icon: "👷",
    name: "건설 노동자",
    maxHp: 36,
    ability: "안전 제일: 자신의 Turn에 처음 얻는 방어막이 3 증가합니다.",
    abilityId: "worker",
    startingPool: { sword: 3, heart: 1, extra_turn: 1, shield: 2, brick: 1, hedgehog: 1, shell: 1 },
    rewardPool: CHARACTER_REWARD_POOLS.worker,
  },
  {
    id: "clown",
    icon: "🤡",
    name: "광대",
    maxHp: 30,
    ability: "제발 한 대만: 기본 치명타 확률이 10% 증가합니다. 실패한 치명타를 피해 효과마다 한 번 재판정하고 HP 1을 잃습니다.",
    abilityId: "clown",
    startingPool: { sword: 3, heart: 1, extra_turn: 1, clover: 1, dice: 1, target: 1, coin: 1, clown_card: 1 },
    rewardPool: CHARACTER_REWARD_POOLS.clown,
  },
  {
    id: "scientist",
    icon: "🧑‍🔬",
    name: "과학자",
    maxHp: 32,
    ability: "실험 증폭: 각 Bingo에서 처음 얻는 충전과 처음 부여하는 독이 1 증가합니다.",
    abilityId: "scientist",
    startingPool: { sword: 3, heart: 1, extra_turn: 1, germ: 1, spider: 1, battery: 2, catalyst: 1 },
    rewardPool: CHARACTER_REWARD_POOLS.scientist,
  },
  {
    id: "rage",
    icon: "😡",
    name: "광전사",
    maxHp: 34,
    ability: "분노 폭주: 잃은 HP 비율에 따라 직접 피해가 증가하지만 적의 피해와 독을 2배로 받습니다.",
    abilityId: "rage",
    startingPool: { sword: 3, heart: 1, extra_turn: 1, blood: 2, fire: 1, rage_mark: 1, rage_fist: 1 },
    rewardPool: CHARACTER_REWARD_POOLS.rage,
  },
];

export const COMMON_REWARDS: Record<EnemyKind, string[]> = {
  normal: COMMON_EMOJI_IDS,
  elite: COMMON_EMOJI_IDS,
  boss: COMMON_EMOJI_IDS,
};

export const MAP_META: Record<MapType, { label: string; icon: string }> = {
  battle: { label: "일반 전투", icon: "⚔️" },
  elite: { label: "Elite 전투", icon: "💀" },
  question: { label: "물음표", icon: "❓" },
  rest: { label: "휴식", icon: "🔥" },
  boss: { label: "Boss Battle", icon: "👑" },
};

export function validateContent(): string[] {
  const errors: string[] = [];
  const ids = Object.values(EMOJIS).map((item) => item.id);
  const emojiIcons = new Set(Object.values(EMOJIS).map((item) => item.icon));
  const characterIcons = new Set(CHARACTERS.map((item) => item.icon));
  const commonEmojiIds = new Set(COMMON_EMOJI_IDS);
  if (new Set(ids).size !== ids.length) errors.push("중복 Emoji ID가 있습니다.");
  const validatePool = (label: string, pool: Pool) => {
    let total = 0;
    for (const [id, count] of Object.entries(pool)) {
      if (!EMOJIS[id]) errors.push(`${label}: 알 수 없는 Emoji ID ${id}`);
      if (!Number.isInteger(count) || count < 0) errors.push(`${label}: ${id} 개수가 잘못됨`);
      total += count;
    }
    if (total < 3) errors.push(`${label}: Emoji가 3개 미만`);
  };
  CHARACTERS.forEach((item) => {
    validatePool(`캐릭터 ${item.id}`, item.startingPool);
    if (Object.values(item.startingPool).reduce((sum, count) => sum + count, 0) !== 10) errors.push(`캐릭터 ${item.id}: 시작 Pool이 10개가 아님`);
    item.rewardPool.forEach((id) => { if (!EMOJIS[id]) errors.push(`캐릭터 ${item.id}: 알 수 없는 보상 ${id}`); });
  });
  const enemyIds = ENEMIES.map((item) => item.id);
  const enemyIcons = ENEMIES.map((item) => item.icon);
  const enemyAbilityIds = ENEMIES.map((item) => item.abilityId);
  if (new Set(enemyIds).size !== enemyIds.length) errors.push("중복 Enemy ID가 있습니다.");
  if (new Set(enemyIcons).size !== enemyIcons.length) errors.push("중복 Enemy 아이콘이 있습니다.");
  if (new Set(enemyAbilityIds).size !== enemyAbilityIds.length) errors.push("중복 Enemy 능력 ID가 있습니다.");
  ENEMIES.forEach((item) => {
    validatePool(`적 ${item.id}`, item.pool);
    if (Object.values(item.pool).reduce((sum, count) => sum + count, 0) !== 9) errors.push(`적 ${item.id}: Pool이 9개가 아님`);
    if (emojiIcons.has(item.icon)) errors.push(`적 ${item.id}: Board Emoji와 아이콘이 겹침`);
    if (characterIcons.has(item.icon)) errors.push(`적 ${item.id}: 캐릭터와 아이콘이 겹침`);
    Object.keys(item.pool).forEach((emojiId) => {
      if (!commonEmojiIds.has(emojiId)) errors.push(`적 ${item.id}: 캐릭터 전용 Emoji ${emojiId} 사용`);
    });
  });
  for (let stage = 1; stage <= 3; stage += 1) {
    const stageEnemies = ENEMIES.filter((enemy) => enemy.stages.includes(stage));
    const counts = { normal: 0, elite: 0, boss: 0 };
    stageEnemies.forEach((enemy) => { counts[enemy.kind] += 1; });
    if (counts.normal !== 4 || counts.elite !== 2 || counts.boss !== 1) {
      errors.push(`Stage ${stage}: Enemy 구성이 normal 4 / elite 2 / boss 1이 아님`);
    }
  }
  const eventIds = EVENTS.map((item) => item.id);
  if (new Set(eventIds).size !== eventIds.length) errors.push("중복 Event ID가 있습니다.");
  const validateEventEffect = (label: string, effect: EventEffect): void => {
    const references = effect.type === "add-emoji"
      ? [effect.emojiId]
      : effect.type === "add-character-or-common"
        ? [effect.characterEmojiId, effect.commonEmojiId]
        : [];
    references.forEach((id) => { if (!EMOJIS[id]) errors.push(`${label}: 알 수 없는 Emoji ID ${id}`); });
    if (effect.type === "random-branch") effect.branches.forEach((branch) => branch.effects.forEach((nested) => validateEventEffect(label, nested)));
  };
  EVENTS.forEach((gameEvent) => {
    if (gameEvent.choices.length === 0) errors.push(`이벤트 ${gameEvent.id}: 선택지가 없음`);
    if (gameEvent.stages?.some((stage) => stage < 1 || stage > 3)) errors.push(`이벤트 ${gameEvent.id}: 잘못된 Stage`);
    gameEvent.choices.forEach((choice) => choice.effects.forEach((effect) => validateEventEffect(`이벤트 ${gameEvent.id}/${choice.id}`, effect)));
  });
  return errors;
}
