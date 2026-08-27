export type Actor = "player" | "enemy";
export type Difficulty = "easy" | "normal" | "hard";
export type EnemyKind = "normal" | "elite" | "boss";
export type Pool = Record<string, number>;
export type Rarity = "common" | "uncommon" | "rare";

export type StatusId =
  | "shield"
  | "thorns"
  | "charge"
  | "precision"
  | "guaranteedCrit"
  | "poison"
  | "weakness"
  | "mark"
  | "luck"
  | "poisonNoDecay";

export interface StatusState {
  statusId: StatusId;
  name: string;
  icon: string;
  value: number;
  duration?: number;
  sourceEmojiId?: string;
  sourceActor?: Actor;
  description: string;
}

export type StatusMap = Partial<Record<StatusId, StatusState>>;
export type EffectTarget = "self" | "opponent";

export type EffectCondition =
  | { type: "multi"; min: number }
  | { type: "hp-at-most"; target?: EffectTarget; ratio: number }
  | { type: "has-status"; target?: EffectTarget; statusId: StatusId; min?: number }
  | { type: "line-tag"; tag: string; min?: number; distinct?: boolean }
  | { type: "line-emoji"; emojiId: string }
  | { type: "corner" }
  | { type: "last-in-line" }
  | { type: "luck-at-least"; value: number }
  | { type: "first-shield-this-turn" }
  | { type: "line-distinct-major-themes" };

export type EffectScaling =
  | { type: "line-tag-count"; tag: string; factor: number; distinct?: boolean }
  | { type: "line-distinct-emojis"; factor: number }
  | { type: "enemy-cell-count"; factor: number }
  | { type: "adjacent-occupied"; factor: number }
  | { type: "status"; target?: EffectTarget; statusId: StatusId; factor: number }
  | { type: "precision"; factor: number }
  | { type: "missing-hp"; factor: number }
  | { type: "retained-turns"; factor: number };

export interface NumericEffectBase {
  amount: number;
  target?: EffectTarget;
  condition?: EffectCondition;
  elseAmount?: number;
  bonusWhen?: { condition: EffectCondition; amount: number };
  scale?: EffectScaling;
  cap?: number;
  basic?: boolean;
}

export type BingoEffect =
  | (NumericEffectBase & {
      type: "damage";
      critChanceBonus?: number;
      critMultiplier?: number;
      critMultiplierWhenGuaranteed?: number;
      guaranteedCrit?: boolean;
      guaranteedCritWhen?: EffectCondition;
      ifNoOtherSame?: { multiplier: number };
    })
  | (NumericEffectBase & { type: "heal"; overflowToShield?: boolean })
  | (NumericEffectBase & { type: "shield" })
  | (NumericEffectBase & { type: "status"; statusId: Exclude<StatusId, "shield"> })
  | { type: "self-damage"; amount: number; condition?: EffectCondition; elseAmount?: number }
  | { type: "cleanse"; statuses: StatusId[]; amount: number | "all"; healPerRemoved?: number; healCap?: number }
  | {
      type: "consume-status-damage";
      statusId: "charge" | "poison" | "shield";
      target?: EffectTarget;
      required?: number;
      factor: number;
      bonus?: number;
      cap?: number;
      failureDamage?: number;
      consumeAll?: boolean;
      consumeOnFailureAll?: boolean;
    }
  | { type: "trigger-poison"; noDecay: boolean }
  | { type: "heal-linked-damage"; ratio: number }
  | { type: "repeat-previous"; multiplier: number; requireBasic?: boolean; requireLineTag?: string; asDamage?: boolean }
  | { type: "trigger-adjacent"; count: "all" | number }
  | { type: "random"; options: BingoEffect[][]; noRepeatKey?: string }
  | { type: "dice"; sides: number; jackpotDamage?: number; otherwiseShield?: boolean }
  | { type: "coin"; successChance: number; damage: number; failureShield: number }
  | { type: "slot"; symbols: number }
  | { type: "lowest-resource"; resources: Array<{ statusId: "precision" | "charge" | "luck"; amount: number }> }
  | { type: "line-damage-ratio"; ratio: number; condition?: EffectCondition }
  | { type: "line-multiplier"; multiplier: number }
  | { type: "set-damage-bonus"; amount: number; condition?: EffectCondition }
  | { type: "set-guaranteed-remaining"; condition?: EffectCondition }
  | { type: "post-if-no-crit"; luck: number; shield: number };

export type PlaceEffect =
  | { type: "extra-placement"; count: number }
  | { type: "redraw-extra"; count: number }
  | { type: "transform"; rareBoost?: number }
  | { type: "destroy"; pattern: "cross" | "random-cross" };

export interface OwnedEffect {
  damageBonus?: number;
  healingBonus?: number;
  shieldBonus?: number;
  basicBonus?: number;
  critChanceBonus?: number;
  critMultiplierBonus?: number;
  poisonBonus?: number;
  firstDirectDamageReduction?: number;
  firstDamageReductionPerTurn?: number;
  shieldCapRatio?: number;
  refundLuckOnWorst?: number;
}

export interface EmojiDefinition {
  id: string;
  icon: string;
  name: string;
  description: string;
  rarity: Rarity;
  tags: string[];
  onBingo: BingoEffect[];
  onPlace?: PlaceEffect[];
  retentionTurns?: number;
  whileOwned?: OwnedEffect;
}

export type CharacterAbilityId = "none" | "worker" | "clown" | "scientist" | "rage";
export type EnemyAbilityId =
  | "none"
  | "hasty-escape"
  | "venom-tail"
  | "last-thorn"
  | "ambush-aim"
  | "pack-hunt"
  | "snare-trap"
  | "royal-roar"
  | "encore-shield"
  | "double-response"
  | "diagonal-precision"
  | "small-finish"
  | "feedback-show"
  | "harsh-review"
  | "three-act-show"
  | "glitch-infection"
  | "abduction-mark"
  | "gravity-well"
  | "eclipse"
  | "prophecy"
  | "hex-echo"
  | "abyss-phases";
export type CombatAbilityId = CharacterAbilityId | EnemyAbilityId;

export interface CharacterDefinition {
  id: string;
  icon: string;
  name: string;
  maxHp: number;
  ability: string;
  abilityId: CharacterAbilityId;
  startingPool: Pool;
  rewardPool: string[];
}

export interface EnemyDefinition {
  id: string;
  icon: string;
  name: string;
  maxHp: number;
  ability: string;
  abilityId: EnemyAbilityId;
  pool: Pool;
  stages: number[];
  kind: EnemyKind;
  ai: "nearest-line";
}

export interface BoardCell {
  emojiId: string;
  placedBy: Actor;
  remainingTurns?: number;
  turnsOnBoard?: number;
}
export type Board = Array<BoardCell | null>;

export interface CombatantState {
  id: string;
  icon: string;
  name: string;
  ability: string;
  abilityId: CombatAbilityId;
  hp: number;
  maxHp: number;
  pool: Pool;
  statuses: StatusMap;
  turnFlags: { firstShieldGranted: boolean; firstIncomingReductionUsed: boolean };
  combatFlags: { firstIncomingReductionUsed: boolean; randomHistory: Record<string, number> };
}

export type CombatPhase = "player-selecting" | "enemy-thinking" | "won" | "lost";

export interface EffectEvent {
  id: string;
  actor: Actor;
  target: Actor;
  kind: "damage" | "heal" | "shield" | "status" | "placement" | "critical" | "log";
  emojiId: string;
  icon: string;
  text: string;
  lineId?: string;
  value?: number;
}

export interface BingoResolution {
  owner: Actor;
  lineIds: string[];
  multiplier: number;
  icons: string[][];
  cells: number[][];
}

export interface EnemyIntent { cellIndex: number; emojiId: string }

export type LineOrientation = "horizontal" | "vertical" | "diagonal";
export interface StoredEnemyEffect {
  kind: "damage" | "heal" | "shield" | "status";
  value: number;
  target: Actor;
  statusId?: StatusId;
}
export interface EnemyAbilityState {
  bingoCount: number;
  playerBingoCount: number;
  turnCount: number;
  used: boolean;
  lastTriggeredTurn: number;
  stacks: number;
  markedCell: number | null;
  markedKind: "trap" | "abduction" | null;
  glitchDrawIndex: number | null;
  threeActFirstEmojiId: string | null;
  prophecyOrientation: LineOrientation;
  phase: 1 | 2 | 3;
  storedEffect?: StoredEnemyEffect;
}
export interface CombatRuleState {
  drawSize: number;
  excludedDrawEmojiIds: string[];
  linkedDrawPair: [string, string] | null;
  shakyPlacementChance: number;
  firstPlacementExtra: boolean;
  firstPlacementUsed: boolean;
  enemyFirstDouble: boolean;
  enemyFirstDoubleUsed: boolean;
  firstBingoBoost: number;
  playerFirstBingoBoostUsed: boolean;
  enemyFirstBingoBoostUsed: boolean;
  openingRedrawAvailable: boolean;
  forcedDrawEmojiId: string | null;
  eventEggPlaced: boolean;
  eventBabyDestroyed: boolean;
}

export interface CombatState {
  board: Board;
  player: CombatantState;
  enemy: CombatantState;
  enemyKind: EnemyKind;
  stage: number;
  difficulty: Difficulty;
  phase: CombatPhase;
  turn: number;
  draw: string[];
  selectedCell: number | null;
  placementsRemaining: number;
  isExtraPlacement: boolean;
  discarded: string[];
  events: EffectEvent[];
  lastBingo: BingoResolution | null;
  enemyAbility: EnemyAbilityState;
  combatRules: CombatRuleState;
}

export interface LineDefinition { id: string; label: string; cells: number[] }
export type MapType = "battle" | "elite" | "question" | "rest" | "boss";
export interface MapCandidate { id: string; type: MapType; label: string; icon: string }

export interface EventEmojiFilter {
  rarities?: Rarity[];
  tags?: string[];
  characterOnly?: boolean;
  commonOnly?: boolean;
  sameTagsAsSelected?: boolean;
  notOwned?: boolean;
}

export interface EventSelectionRule {
  count: 1 | 2;
  minCount?: 1 | 2;
  distinct?: boolean;
  filter?: EventEmojiFilter;
}

export interface RunModifier {
  id: string;
  name: string;
  icon: string;
  description: string;
  remainingBattles?: number;
  remainingMaps?: number;
  emojiId?: string;
  value?: number;
  triggered?: boolean;
}

export interface ScheduledReward {
  id: string;
  name: string;
  icon: string;
  mapsRemaining: number;
  counter?: "map" | "battle";
  kind: "random-rare" | "random-tag" | "character-choice" | "duplicate-selected" | "transform-selected" | "egg-hatch" | "baby-return";
  emojiId?: string;
  tag?: string;
  count?: number;
  triggered?: boolean;
  skipNextTick?: boolean;
  choiceCount?: number;
}
export interface PendingEventReward {
  id: string;
  name: string;
  icon: string;
  options: string[];
}

export type EventEffect =
  | { type: "heal"; amount: number }
  | { type: "damage"; amount: number }
  | { type: "max-hp"; amount: number }
  | { type: "add-emoji"; emojiId: string }
  | { type: "add-random-emoji"; filter?: EventEmojiFilter; count?: number; minSelectedCopies?: number }
  | { type: "add-character-or-common"; characterId: string; characterEmojiId: string; commonEmojiId: string }
  | { type: "remove-random-emoji"; count?: number }
  | { type: "remove-selected"; selectionIndex?: number; count?: number | "all" }
  | { type: "remove-all-selected" }
  | { type: "duplicate-selected"; selectionIndex?: number; count: number }
  | { type: "swap-selected-counts" }
  | { type: "transform-selected"; selectionIndex?: number; filter: EventEmojiFilter }
  | { type: "remove-most-common"; count?: number }
  | { type: "duplicate-least-common"; count?: number }
  | { type: "heal-per-selection"; amount: number }
  | { type: "random-branch"; branches: Array<{ weight: number; label: string; effects: EventEffect[] }> }
  | { type: "add-modifier"; modifier: RunModifier }
  | { type: "schedule-reward"; reward: ScheduledReward }
  | { type: "force-next-map"; mapType: Exclude<MapType, "boss"> }
  | { type: "ensure-next-battle-option" };
export interface EventChoice {
  id: string;
  label: string;
  hint: string;
  effects: EventEffect[];
  selection?: EventSelectionRule;
}
export interface GameEventDefinition {
  id: string;
  icon: string;
  title: string;
  content: string;
  choices: EventChoice[];
  category?: "base" | "stage" | "rare" | "legacy";
  stages?: number[];
}

export interface RunPlayer {
  characterId: string;
  icon: string;
  name: string;
  ability: string;
  abilityId: CharacterAbilityId;
  hp: number;
  maxHp: number;
  pool: Pool;
}
export interface RunProgress {
  player: RunPlayer;
  difficulty: Difficulty;
  stage: number;
  completedMaps: number;
  currentMap: number;
  currentMapType: MapType | null;
  lastEnemyId: string | null;
  seenEventIds: string[];
  modifiers: RunModifier[];
  scheduledRewards: ScheduledReward[];
  pendingEventReward: PendingEventReward | null;
  notices: string[];
  forcedNextMapType: Exclude<MapType, "boss"> | null;
  ensureNextBattleOption: boolean;
  startedAt: number;
}
export type ResultState = { cleared: boolean; stage: number; map: number; elapsedMs: number; pool: Pool };
