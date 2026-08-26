import { CHARACTER_REWARD_POOLS, COMMON_EMOJI_IDS, EMOJIS } from "../content/emojis";
import { STATUS_DEFINITIONS } from "../content/statuses";
import { BINGO_LINES, boardHasBingo, completedLinesAt } from "./lines";
import { drawFromPool, SeededRandom, weightedChoice, type RandomSource } from "./rng";
import type {
  Actor,
  BingoEffect,
  Board,
  CombatState,
  CombatantState,
  EffectCondition,
  EffectEvent,
  EffectTarget,
  EnemyDefinition,
  EnemyAbilityId,
  EnemyIntent,
  LineOrientation,
  LineDefinition,
  OwnedEffect,
  RunPlayer,
  StatusId,
  StatusState,
  StoredEnemyEffect,
} from "./types";

const INITIAL_PLACEMENTS_PER_SIDE = 3;
const MAX_SEED_ATTEMPTS = 80;
const ALLOW_EXTRA_PLACEMENT_CHAIN = false;
const opponent = (actor: Actor): Actor => actor === "player" ? "enemy" : "player";
const actorForTarget = (owner: Actor, target: EffectTarget = "self"): Actor => target === "self" ? owner : opponent(owner);
const floor = (value: number) => Math.max(0, Math.floor(value));

function cloneBoard(board: Board): Board {
  return board.map((cell) => cell ? { ...cell } : null);
}

function cloneCombatant(combatant: CombatantState): CombatantState {
  return {
    ...combatant,
    pool: { ...combatant.pool },
    statuses: Object.fromEntries(Object.entries(combatant.statuses).map(([id, status]) => [id, status ? { ...status } : status])),
    turnFlags: { ...combatant.turnFlags },
    combatFlags: { ...combatant.combatFlags, randomHistory: { ...combatant.combatFlags.randomHistory } },
  };
}

function cloneState(source: CombatState): CombatState {
  return {
    ...source,
    board: cloneBoard(source.board),
    player: cloneCombatant(source.player),
    enemy: cloneCombatant(source.enemy),
    draw: [...source.draw],
    discarded: [...source.discarded],
    events: [...source.events],
    enemyAbility: {
      ...source.enemyAbility,
      storedEffect: source.enemyAbility.storedEffect ? { ...source.enemyAbility.storedEffect } : undefined,
    },
  };
}

function newCombatant(
  source: RunPlayer | EnemyDefinition,
  isPlayer: boolean,
): CombatantState {
  const player = source as RunPlayer;
  return {
    id: isPlayer ? player.characterId : (source as EnemyDefinition).id,
    icon: source.icon,
    name: source.name,
    ability: source.ability,
    abilityId: isPlayer ? player.abilityId : (source as EnemyDefinition).abilityId,
    hp: isPlayer ? player.hp : source.maxHp,
    maxHp: source.maxHp,
    pool: { ...source.pool },
    statuses: {},
    turnFlags: { firstShieldGranted: false, firstIncomingReductionUsed: false },
    combatFlags: { firstIncomingReductionUsed: false, randomHistory: {} },
  };
}

function ownedValues(combatant: CombatantState): OwnedEffect {
  const result: OwnedEffect = {};
  for (const [emojiId, count] of Object.entries(combatant.pool)) {
    const owned = EMOJIS[emojiId]?.whileOwned;
    if (!owned) continue;
    for (const [key, raw] of Object.entries(owned) as Array<[keyof OwnedEffect, number]>) {
      if (key === "shieldCapRatio") result[key] = Math.max(result[key] ?? 0, raw);
      else result[key] = (result[key] ?? 0) + raw * count;
    }
  }
  return result;
}

export function getStatusValue(combatant: CombatantState, statusId: StatusId): number {
  return combatant.statuses[statusId]?.value ?? 0;
}

export function getCombatantDerivedStats(combatant: CombatantState): {
  critChance: number;
  critMultiplier: number;
  shieldCap: number;
  outgoingDamageMultiplier: number;
  incomingDamageMultiplier: number;
} {
  const owned = ownedValues(combatant);
  return {
    critChance: Math.min(1, 0.05 + (combatant.abilityId === "clown" ? 0.1 : 0) + getStatusValue(combatant, "precision") * 0.1 + (owned.critChanceBonus ?? 0)),
    critMultiplier: 2 + (owned.critMultiplierBonus ?? 0),
    shieldCap: floor(combatant.maxHp * Math.max(0.5, owned.shieldCapRatio ?? 0.5)),
    outgoingDamageMultiplier: combatant.abilityId === "rage" ? 1 + ((combatant.maxHp - combatant.hp) / combatant.maxHp) * 2 : 1,
    incomingDamageMultiplier: combatant.abilityId === "rage" ? 2 : 1,
  };
}

export interface EnemyAbilityIndicator {
  key: string;
  name: string;
  icon: string;
  value: string | number;
  description: string;
  danger?: boolean;
}

export function getEnemyAbilityIndicators(state: CombatState): EnemyAbilityIndicator[] {
  const runtime = state.enemyAbility;
  const ability = state.enemy.abilityId;
  const coordinates = runtime.markedCell === null ? "없음" : `${Math.floor(runtime.markedCell / 5) + 1}행 ${runtime.markedCell % 5 + 1}열`;
  const orientation = runtime.prophecyOrientation === "horizontal" ? "가로" : runtime.prophecyOrientation === "vertical" ? "세로" : "대각선";
  switch (ability) {
    case "hasty-escape": return [{ key: ability, name: "황급한 도주", icon: "🐀", value: runtime.used ? "소진" : "준비", description: "한 번에 HP를 8 이상 잃으면 방어막 4를 얻습니다." }];
    case "venom-tail": return [{ key: ability, name: "독꼬리", icon: "🦊", value: runtime.bingoCount > 0 ? "소진" : "준비", description: "첫 Enemy Bingo가 독 2를 추가합니다." }];
    case "last-thorn": return [{ key: ability, name: "마지막 가시", icon: "🐗", value: runtime.lastTriggeredTurn === state.turn ? "소진" : "2", description: "플레이어가 방어막을 완전히 파괴하면 피해 2로 반격합니다." }];
    case "ambush-aim": return [{ key: ability, name: "기습 조준", icon: "🦝", value: "+25%p", description: "Enemy Bingo의 첫 직접 피해 치명타 확률이 증가합니다." }];
    case "pack-hunt": return [{ key: ability, name: "무리 사냥", icon: "🐻", value: "3+", description: "Line에 animal Emoji가 3개 이상이면 피해 +5, 회복 +3입니다." }];
    case "snare-trap": return [{ key: ability, name: "포획 덫", icon: "🕸️", value: coordinates, description: runtime.markedCell === null ? "Enemy Turn 종료 시 인접 빈칸에 덫을 설치합니다." : "이 Cell에 배치하면 독 2를 받습니다.", danger: runtime.markedCell !== null }];
    case "royal-roar": return [{ key: ability, name: "왕의 포효", icon: "🦁", value: `${runtime.stacks}/3`, description: `다음 Enemy Bingo에 피해 +${runtime.stacks * 3}, 방어막 +${runtime.stacks * 2}가 적용됩니다.`, danger: runtime.stacks > 0 }];
    case "encore-shield": return [{ key: ability, name: "한 번 더 인사", icon: "👋", value: runtime.used ? "소진" : "준비", description: "처음 추가 배치를 얻을 때 방어막 3을 얻습니다." }];
    case "double-response": return [{ key: ability, name: "잠깐!", icon: "✋", value: "Double", description: "플레이어가 Double Bingo 이상을 완성하면 방어막 4를 얻습니다." }];
    case "diagonal-precision": return [{ key: ability, name: "완벽한 각도", icon: "👌", value: "+20%p", description: "대각선 Enemy Bingo의 직접 피해 치명타 확률이 증가합니다." }];
    case "small-finish": return [{ key: ability, name: "조금만 더", icon: "🤏", value: "≤5", description: "Enemy Bingo 합산 피해가 5 이하이면 피해 3을 추가합니다." }];
    case "feedback-show": return [{ key: ability, name: "피드백 공연", icon: "🤘", value: `${runtime.bingoCount % 2}/2`, description: "두 번째 Enemy Bingo마다 마지막 수치 효과를 50%로 반복합니다." }];
    case "harsh-review": return [{ key: ability, name: "혹평", icon: "👎", value: runtime.lastTriggeredTurn === state.turn ? "소진" : "준비", description: "피해 없는 Player Bingo에 약점 2를 부여합니다." }];
    case "three-act-show": {
      const act = state.isExtraPlacement ? ((Math.max(1, runtime.turnCount) - 1) % 3) + 1 : (runtime.turnCount % 3) + 1;
      return [{ key: ability, name: "생방송", icon: "🙌", value: `${act}부`, description: act === 3 ? "이번 Enemy Turn에 서로 다른 Emoji를 두 번 배치합니다." : act === 2 ? "다음 Enemy Turn 배치 후 행운 1을 얻습니다." : "다음 Enemy Turn은 일반 배치입니다.", danger: act === 3 }];
    }
    case "glitch-infection": return [{ key: ability, name: "오류 감염", icon: "👾", value: runtime.glitchDrawIndex === null ? `${state.turn % 3}/3` : `${runtime.glitchDrawIndex + 1}번`, description: runtime.glitchDrawIndex === null ? "매 3번째 Player Turn에 Draw 하나를 감염시킵니다." : "표시된 Draw는 배치 시 무작위 Emoji로 변합니다.", danger: runtime.glitchDrawIndex !== null }];
    case "abduction-mark": return [{ key: ability, name: "납치 예고", icon: "🛸", value: runtime.markedKind === "abduction" ? coordinates : `${runtime.turnCount % 3}/3`, description: runtime.markedKind === "abduction" ? "다음 Enemy Turn 시작에 표시 Cell을 제거합니다." : "매 3번째 Enemy Turn에 점유 Cell을 표시합니다.", danger: runtime.markedKind === "abduction" }];
    case "gravity-well": return [{ key: ability, name: "중력 우물", icon: "🪐", value: "CENTER", description: "중앙 Cell을 포함한 Enemy Bingo가 방어막 6을 얻습니다." }];
    case "eclipse": { const active = state.enemy.hp / state.enemy.maxHp <= 0.5; return [{ key: ability, name: "개기월식", icon: "🌚", value: active ? "활성" : "대기", description: "HP 50% 이하에서 양쪽 HP 회복량이 50% 감소합니다.", danger: active }]; }
    case "prophecy": return [{ key: ability, name: "불길한 예언", icon: "🔮", value: orientation, description: `이번 Player Turn에 ${orientation} Bingo를 만들면 적 방어막 +6, 플레이어 약점 +2입니다.`, danger: true }];
    case "hex-echo": return [{ key: ability, name: "주술 반향", icon: "🧙‍♂️", value: `${runtime.bingoCount % 2}/2`, description: "두 번째 Enemy Bingo마다 첫 비HP 상태 효과를 반복합니다." }];
    case "abyss-phases": return [{ key: ability, name: "심연의 삼막", icon: "🌌", value: `${runtime.phase}막`, description: runtime.phase === 1 ? "첫 수치 효과를 50%로 반복합니다." : runtime.phase === 2 ? "Enemy Bingo가 약점 2를 부여합니다." : "양쪽 Bingo 직접 피해가 50% 증가합니다.", danger: runtime.phase === 3 }];
    default: return [];
  }
}

function setStatus(
  combatant: CombatantState,
  statusId: StatusId,
  value: number,
  sourceEmojiId?: string,
  sourceActor?: Actor,
): void {
  const limits: Partial<Record<StatusId, number>> = { charge: 20, precision: 7 };
  const clamped = floor(Math.min(value, limits[statusId] ?? Number.POSITIVE_INFINITY));
  if (clamped <= 0) {
    delete combatant.statuses[statusId];
    return;
  }
  combatant.statuses[statusId] = {
    statusId,
    ...STATUS_DEFINITIONS[statusId],
    value: clamped,
    sourceEmojiId,
    sourceActor: sourceActor ?? combatant.statuses[statusId]?.sourceActor,
  };
}

function addStatus(
  combatant: CombatantState,
  statusId: StatusId,
  amount: number,
  sourceEmojiId?: string,
  sourceActor?: Actor,
): number {
  if (amount <= 0) return 0;
  const before = getStatusValue(combatant, statusId);
  let target = before + floor(amount);
  if (statusId === "shield") {
    const capRatio = Math.max(0.5, ownedValues(combatant).shieldCapRatio ?? 0.5);
    target = Math.min(target, floor(combatant.maxHp * capRatio));
  }
  setStatus(combatant, statusId, target, sourceEmojiId, sourceActor);
  return getStatusValue(combatant, statusId) - before;
}

function seedBoard(playerPool: RunPlayer["pool"], enemyPool: EnemyDefinition["pool"], rng: RandomSource): Board {
  const playerSeeds = drawFromPool(playerPool, INITIAL_PLACEMENTS_PER_SIDE, rng);
  const enemySeeds = drawFromPool(enemyPool, INITIAL_PLACEMENTS_PER_SIDE, rng);
  for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt += 1) {
    const board: Board = Array.from({ length: 25 }, () => null);
    const positions = rng.shuffle(Array.from({ length: 25 }, (_, index) => index)).slice(0, 6);
    playerSeeds.forEach((emojiId, index) => { board[positions[index]] = { emojiId, placedBy: "player", turnsOnBoard: 0 }; });
    enemySeeds.forEach((emojiId, index) => { board[positions[index + 3]] = { emojiId, placedBy: "enemy", turnsOnBoard: 0 }; });
    if (!boardHasBingo(board)) return board;
  }
  const fallback: Board = Array.from({ length: 25 }, () => null);
  [0, 6, 17].forEach((cell, index) => { fallback[cell] = { emojiId: playerSeeds[index], placedBy: "player", turnsOnBoard: 0 }; });
  [4, 8, 21].forEach((cell, index) => { fallback[cell] = { emojiId: enemySeeds[index], placedBy: "enemy", turnsOnBoard: 0 }; });
  return fallback;
}

export function createCombat(player: RunPlayer, enemy: EnemyDefinition, rng: RandomSource, stage = 1): CombatState {
  return {
    board: seedBoard(player.pool, enemy.pool, rng),
    player: newCombatant(player, true),
    enemy: newCombatant(enemy, false),
    enemyKind: enemy.kind,
    stage,
    phase: "player-selecting",
    turn: 1,
    draw: drawFromPool(player.pool, 3, rng),
    selectedCell: null,
    placementsRemaining: 1,
    isExtraPlacement: false,
    discarded: [],
    events: [],
    lastBingo: null,
    enemyAbility: {
      bingoCount: 0,
      playerBingoCount: 0,
      turnCount: 0,
      used: false,
      lastTriggeredTurn: 0,
      stacks: 0,
      markedCell: null,
      markedKind: null,
      glitchDrawIndex: null,
      threeActFirstEmojiId: null,
      prophecyOrientation: "horizontal",
      phase: 1,
    },
  };
}

function event(
  state: CombatState,
  actor: Actor,
  emojiId: string,
  kind: EffectEvent["kind"],
  target: Actor,
  text: string,
  lineId?: string,
  value?: number,
): EffectEvent {
  return {
    id: `${state.turn}-${state.events.length}-${actor}-${emojiId}-${lineId ?? "effect"}`,
    actor,
    target,
    kind,
    emojiId,
    icon: EMOJIS[emojiId]?.icon ?? (actor === "enemy" ? state.enemy.icon : "✨"),
    text,
    lineId,
    value,
  };
}

function orderedResolutionLines(lines: LineDefinition[]): LineDefinition[] {
  const ids = new Set(lines.map((line) => line.id));
  return BINGO_LINES.filter((line) => ids.has(line.id));
}

function adjacentCells(cellIndex: number): number[] {
  const row = Math.floor(cellIndex / 5);
  const col = cellIndex % 5;
  return [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
    .map(([dr, dc]) => [row + dr, col + dc])
    .filter(([r, c]) => r >= 0 && r < 5 && c >= 0 && c < 5)
    .map(([r, c]) => r * 5 + c);
}

interface NumericResult {
  kind: "damage" | "heal" | "shield" | "status";
  value: number;
  target: Actor;
  statusId?: StatusId;
  basic?: boolean;
}

interface ResolutionContext {
  state: CombatState;
  snapshot: Board;
  owner: Actor;
  multiplier: number;
  rng: RandomSource;
  pendingDamage: Record<Actor, number>;
  pendingHeal: Record<Actor, number>;
  overflowHeal: Record<Actor, number>;
  healDamageRatio: Record<Actor, number>;
  damageContributions: Record<Actor, number>;
  criticalOccurred: boolean;
  killedBySelfDamage: boolean;
  damageBonus: number;
  guaranteedRemaining: boolean;
  postNoCrit: Array<{ actor: Actor; luck: number; shield: number; emojiId: string }>;
  enemyAbilityCritUsed: boolean;
  firstNumeric?: StoredEnemyEffect;
  lastNumeric?: StoredEnemyEffect;
  firstStatus?: StoredEnemyEffect;
}

interface LineContext {
  line: LineDefinition;
  lineCells: Board;
  lineIndex: number;
  cellIndex: number;
  emojiId: string;
  previous: NumericResult[];
  current: NumericResult[];
  lineDamage: number;
  lineMultiplier: number;
  scientistChargeUsed: boolean;
  scientistPoisonUsed: boolean;
  auxiliaryDepth: number;
}

function combatant(state: CombatState, actor: Actor): CombatantState {
  return actor === "player" ? state.player : state.enemy;
}

function lineOrientation(lineId: string): LineOrientation {
  if (lineId.startsWith("row-")) return "horizontal";
  if (lineId.startsWith("col-")) return "vertical";
  return "diagonal";
}

function rememberEnemyEffect(ctx: ResolutionContext, result: NumericResult): void {
  if (ctx.owner !== "enemy" || result.value <= 0) return;
  const stored: StoredEnemyEffect = {
    kind: result.kind,
    value: result.value,
    target: result.target,
    statusId: result.statusId,
  };
  ctx.firstNumeric ??= stored;
  ctx.lastNumeric = stored;
  if (result.kind === "status" && result.statusId !== "shield") ctx.firstStatus ??= stored;
}

function lineTagCount(line: LineContext, tag: string, distinct = false): number {
  const ids = line.lineCells.filter(Boolean).map((cell) => cell!.emojiId).filter((id) => EMOJIS[id]?.tags.includes(tag));
  return distinct ? new Set(ids).size : ids.length;
}

function conditionMet(condition: EffectCondition | undefined, ctx: ResolutionContext, line: LineContext): boolean {
  if (!condition) return true;
  const self = combatant(ctx.state, ctx.owner);
  const targetActor = actorForTarget(ctx.owner, "target" in condition ? condition.target : "self");
  const target = combatant(ctx.state, targetActor);
  switch (condition.type) {
    case "multi": return ctx.multiplier >= condition.min;
    case "hp-at-most": return target.hp / target.maxHp <= condition.ratio;
    case "has-status": return getStatusValue(target, condition.statusId) >= (condition.min ?? 1);
    case "line-tag": return lineTagCount(line, condition.tag, condition.distinct) >= (condition.min ?? 1);
    case "line-emoji": return line.lineCells.some((cell) => cell?.emojiId === condition.emojiId);
    case "corner": return [0, 4, 20, 24].includes(line.cellIndex);
    case "last-in-line": return line.lineIndex === line.line.cells.length - 1;
    case "luck-at-least": return getStatusValue(self, "luck") >= condition.value;
    case "first-shield-this-turn": return !self.turnFlags.firstShieldGranted;
    case "line-distinct-major-themes": {
      const tactical = new Set(["damage", "heal", "shield", "charge", "crit", "poison", "random", "copy", "growth"]);
      const themes = line.lineCells.filter(Boolean).map((cell) => EMOJIS[cell!.emojiId]?.tags.find((tag) => !tactical.has(tag)) ?? EMOJIS[cell!.emojiId]?.tags[0] ?? cell!.emojiId);
      return new Set(themes).size === themes.length;
    }
  }
}

type NumericBingoEffect =
  | Extract<BingoEffect, { type: "damage" }>
  | Extract<BingoEffect, { type: "heal" }>
  | Extract<BingoEffect, { type: "shield" }>
  | Extract<BingoEffect, { type: "status" }>;

function numericAmount(
  effect: NumericBingoEffect,
  ctx: ResolutionContext,
  line: LineContext,
): number | null {
  const met = conditionMet(effect.condition, ctx, line);
  if (!met && effect.elseAmount === undefined) return null;
  let amount = met ? effect.amount : effect.elseAmount ?? 0;
  if (effect.scale) {
    const target = combatant(ctx.state, actorForTarget(ctx.owner, effect.scale.type === "status" ? effect.scale.target : "self"));
    switch (effect.scale.type) {
      case "line-tag-count": amount += lineTagCount(line, effect.scale.tag, effect.scale.distinct) * effect.scale.factor; break;
      case "line-distinct-emojis": amount += new Set(line.lineCells.filter(Boolean).map((cell) => cell!.emojiId)).size * effect.scale.factor; break;
      case "enemy-cell-count": amount += line.lineCells.filter((cell) => cell?.placedBy === opponent(ctx.owner)).length * effect.scale.factor; break;
      case "adjacent-occupied": amount += adjacentCells(line.cellIndex).filter((index) => ctx.snapshot[index]).length * effect.scale.factor; break;
      case "status": amount += getStatusValue(target, effect.scale.statusId) * effect.scale.factor; break;
      case "precision": amount += getStatusValue(combatant(ctx.state, ctx.owner), "precision") * effect.scale.factor; break;
      case "missing-hp": {
        const self = combatant(ctx.state, ctx.owner);
        amount += (self.maxHp - self.hp) * effect.scale.factor;
        break;
      }
      case "retained-turns": amount += (ctx.snapshot[line.cellIndex]?.turnsOnBoard ?? 0) * effect.scale.factor; break;
    }
  }
  if (effect.bonusWhen && conditionMet(effect.bonusWhen.condition, ctx, line)) amount += effect.bonusWhen.amount;
  if (effect.cap !== undefined) amount = Math.min(amount, effect.cap);
  return floor(amount);
}

function pushLog(ctx: ResolutionContext, line: LineContext, kind: EffectEvent["kind"], target: Actor, text: string, value?: number): void {
  ctx.state.events.push(event(ctx.state, ctx.owner, line.emojiId, kind, target, text, line.line.id, value));
}

function consumeLuck(owner: CombatantState): number {
  const value = getStatusValue(owner, "luck");
  if (value > 0) setStatus(owner, "luck", value - 1);
  return value;
}

function rerollWorst(ctx: ResolutionContext, initialWorst: boolean, roll: () => number): { value: number; rerolled: boolean } {
  const owner = combatant(ctx.state, ctx.owner);
  const refund = ownedValues(owner).refundLuckOnWorst ?? 0;
  if (!initialWorst || refund <= 0) return { value: roll(), rerolled: false };
  addStatus(owner, "luck", refund, "evil_eye", ctx.owner);
  return { value: roll(), rerolled: true };
}

function addShield(ctx: ResolutionContext, line: LineContext, amount: number, targetActor = ctx.owner, basic = false, alreadyScaled = false): NumericResult {
  const target = combatant(ctx.state, targetActor);
  const owned = ownedValues(target);
  let adjusted = amount;
  if (!alreadyScaled) {
    adjusted += (owned.shieldBonus ?? 0) + (basic ? owned.basicBonus ?? 0 : 0);
    if (target.abilityId === "worker" && !target.turnFlags.firstShieldGranted) adjusted += 3;
    adjusted = floor(adjusted * line.lineMultiplier * ctx.multiplier);
  }
  const gained = addStatus(target, "shield", adjusted, line.emojiId, ctx.owner);
  target.turnFlags.firstShieldGranted = true;
  pushLog(ctx, line, "shield", targetActor, `${EMOJIS[line.emojiId].icon} 방어막 +${gained}`, gained);
  return { kind: "shield", value: gained, target: targetActor, statusId: "shield", basic };
}

function addGeneralStatus(
  ctx: ResolutionContext,
  line: LineContext,
  statusId: Exclude<StatusId, "shield">,
  amount: number,
  targetActor: Actor,
  basic = false,
  alreadyScaled = false,
): NumericResult {
  const target = combatant(ctx.state, targetActor);
  let adjusted = amount;
  if (!alreadyScaled) {
    if (statusId === "poison" && targetActor !== ctx.owner) {
      adjusted += ownedValues(combatant(ctx.state, ctx.owner)).poisonBonus ?? 0;
      if (combatant(ctx.state, ctx.owner).abilityId === "scientist" && !line.scientistPoisonUsed) {
        adjusted += 1;
        line.scientistPoisonUsed = true;
      }
    }
    if (statusId === "charge" && targetActor === ctx.owner && combatant(ctx.state, ctx.owner).abilityId === "scientist" && !line.scientistChargeUsed) {
      adjusted += 1;
      line.scientistChargeUsed = true;
    }
    adjusted = floor(adjusted * line.lineMultiplier * ctx.multiplier);
  }
  const gained = addStatus(target, statusId, adjusted, line.emojiId, ctx.owner);
  pushLog(ctx, line, "status", targetActor, `${STATUS_DEFINITIONS[statusId].icon} ${STATUS_DEFINITIONS[statusId].name} ${gained >= 0 ? "+" : ""}${gained}`, gained);
  return { kind: "status", value: gained, target: targetActor, statusId, basic };
}

function enqueueHeal(ctx: ResolutionContext, line: LineContext, amount: number, targetActor: Actor, basic = false, overflow = false): NumericResult {
  const owned = ownedValues(combatant(ctx.state, targetActor));
  let adjusted = floor((amount + (owned.healingBonus ?? 0) + (basic ? owned.basicBonus ?? 0 : 0)) * line.lineMultiplier * ctx.multiplier);
  if (ctx.state.enemy.abilityId === "eclipse" && ctx.state.enemy.hp / ctx.state.enemy.maxHp <= 0.5) adjusted = floor(adjusted * 0.5);
  ctx.pendingHeal[targetActor] += adjusted;
  if (overflow) ctx.overflowHeal[targetActor] += adjusted;
  pushLog(ctx, line, "log", targetActor, `${EMOJIS[line.emojiId].icon} 회복 기여 +${adjusted}`);
  return { kind: "heal", value: adjusted, target: targetActor, basic };
}

function critDamage(
  ctx: ResolutionContext,
  line: LineContext,
  effect: Extract<BingoEffect, { type: "damage" }>,
  rawAmount: number,
  targetActor: Actor,
): number {
  const owner = combatant(ctx.state, ctx.owner);
  const target = combatant(ctx.state, targetActor);
  const owned = ownedValues(owner);
  let base = rawAmount + (owned.damageBonus ?? 0) + (effect.basic ? owned.basicBonus ?? 0 : 0) + ctx.damageBonus;
  const sameCount = line.lineCells.filter((cell) => cell?.emojiId === line.emojiId).length;
  if (effect.ifNoOtherSame && sameCount === 1) base *= effect.ifNoOtherSame.multiplier;
  base *= line.lineMultiplier * ctx.multiplier;
  if (owner.abilityId === "rage") base *= 1 + ((owner.maxHp - owner.hp) / owner.maxHp) * 2;
  let amount = floor(base);

  if (getStatusValue(target, "weakness") > 0) {
    amount += getStatusValue(target, "weakness");
    setStatus(target, "weakness", 0);
  }

  const guaranteedByStatus = getStatusValue(owner, "guaranteedCrit") > 0;
  const guaranteedByMark = getStatusValue(target, "mark") > 0;
  const guaranteed = effect.guaranteedCrit || ctx.guaranteedRemaining || guaranteedByStatus || guaranteedByMark || (!!effect.guaranteedCritWhen && conditionMet(effect.guaranteedCritWhen, ctx, line));
  let enemyAbilityCritBonus = 0;
  if (ctx.owner === "enemy" && owner.abilityId === "ambush-aim" && !ctx.enemyAbilityCritUsed) {
    enemyAbilityCritBonus += 0.25;
    ctx.enemyAbilityCritUsed = true;
  }
  if (ctx.owner === "enemy" && owner.abilityId === "diagonal-precision" && lineOrientation(line.line.id) === "diagonal") enemyAbilityCritBonus += 0.2;
  const chance = Math.min(1, 0.05 + (owner.abilityId === "clown" ? 0.1 : 0) + getStatusValue(owner, "precision") * 0.1 + (owned.critChanceBonus ?? 0) + (effect.critChanceBonus ?? 0) + enemyAbilityCritBonus);
  let critical = guaranteed || ctx.rng.next() < chance;
  if (!critical && owner.abilityId === "clown") {
    owner.hp = Math.max(0, owner.hp - 1);
    critical = ctx.rng.next() < chance;
    pushLog(ctx, line, "log", ctx.owner, `🤡 제발 한 대만: HP -1, 치명타 재판정 ${critical ? "성공" : "실패"} (${floor(chance * 100)}%)`, 1);
    if (owner.hp <= 0) ctx.killedBySelfDamage = true;
  }
  if (guaranteedByStatus) setStatus(owner, "guaranteedCrit", getStatusValue(owner, "guaranteedCrit") - 1);
  if (guaranteedByMark) setStatus(target, "mark", getStatusValue(target, "mark") - 1);
  if (critical) {
    const critMultiplier = (guaranteedByStatus && effect.critMultiplierWhenGuaranteed
      ? effect.critMultiplierWhenGuaranteed
      : effect.critMultiplier ?? 2) + (owned.critMultiplierBonus ?? 0);
    amount = floor(amount * critMultiplier);
    ctx.criticalOccurred = true;
    pushLog(ctx, line, "critical", targetActor, `CRITICAL! ${amount} 피해 기여`, amount);
  }

  const reductionOwned = ownedValues(target);
  if (!target.combatFlags.firstIncomingReductionUsed && (reductionOwned.firstDirectDamageReduction ?? 0) > 0) {
    amount = Math.max(0, amount - (reductionOwned.firstDirectDamageReduction ?? 0));
    target.combatFlags.firstIncomingReductionUsed = true;
  }
  if (!target.turnFlags.firstIncomingReductionUsed && (reductionOwned.firstDamageReductionPerTurn ?? 0) > 0) {
    amount = Math.max(0, amount - (reductionOwned.firstDamageReductionPerTurn ?? 0));
    target.turnFlags.firstIncomingReductionUsed = true;
  }
  if (target.abilityId === "rage" && ctx.owner !== targetActor) amount = floor(amount * 2);
  if (ctx.state.enemy.abilityId === "abyss-phases" && ctx.state.enemyAbility.phase === 3) amount = floor(amount * 1.5);
  return amount;
}

function enqueueDamage(
  ctx: ResolutionContext,
  line: LineContext,
  effect: Extract<BingoEffect, { type: "damage" }>,
  amount: number,
  targetActor: Actor,
): NumericResult {
  const adjusted = critDamage(ctx, line, effect, amount, targetActor);
  ctx.pendingDamage[targetActor] += adjusted;
  ctx.damageContributions[targetActor] += 1;
  line.lineDamage += adjusted;
  pushLog(ctx, line, "log", targetActor, `${EMOJIS[line.emojiId].icon} 피해 기여 ${adjusted}`);
  return { kind: "damage", value: adjusted, target: targetActor, basic: effect.basic };
}

function replayNumeric(ctx: ResolutionContext, line: LineContext, source: NumericResult[], multiplier: number, asDamage = false): NumericResult[] {
  const results: NumericResult[] = [];
  for (const item of source) {
    const value = floor(item.value * multiplier);
    if (asDamage) {
      if (item.kind !== "heal") continue;
      const target = opponent(ctx.owner);
      ctx.pendingDamage[target] += value;
      ctx.damageContributions[target] += 1;
      line.lineDamage += value;
      results.push({ kind: "damage", value, target });
    } else if (item.kind === "damage") {
      ctx.pendingDamage[item.target] += value;
      ctx.damageContributions[item.target] += 1;
      line.lineDamage += value;
      results.push({ ...item, value });
    } else if (item.kind === "heal") {
      ctx.pendingHeal[item.target] += value;
      results.push({ ...item, value });
    } else if (item.kind === "shield") {
      results.push(addShield(ctx, line, value, item.target, item.basic, true));
    } else if (item.statusId && item.statusId !== "shield") {
      results.push(addGeneralStatus(ctx, line, item.statusId, value, item.target, item.basic, true));
    }
  }
  return results;
}

function executeEffect(effect: BingoEffect, ctx: ResolutionContext, line: LineContext): NumericResult[] {
  const self = combatant(ctx.state, ctx.owner);
  const targetActor = actorForTarget(ctx.owner, "target" in effect ? effect.target : "self");
  const target = combatant(ctx.state, targetActor);
  switch (effect.type) {
    case "damage": {
      const amount = numericAmount(effect, ctx, line);
      return amount === null ? [] : [enqueueDamage(ctx, line, effect, amount, targetActor === ctx.owner ? opponent(ctx.owner) : targetActor)];
    }
    case "heal": {
      const amount = numericAmount(effect, ctx, line);
      return amount === null ? [] : [enqueueHeal(ctx, line, amount, targetActor, effect.basic, effect.overflowToShield)];
    }
    case "shield": {
      const amount = numericAmount(effect, ctx, line);
      if (amount === null) return [];
      return [addShield(ctx, line, amount, targetActor, effect.basic)];
    }
    case "status": {
      const amount = numericAmount(effect, ctx, line);
      if (amount === null) return [];
      return [addGeneralStatus(ctx, line, effect.statusId, amount, targetActor, effect.basic)];
    }
    case "self-damage": {
      const met = conditionMet(effect.condition, ctx, line);
      if (!met && effect.elseAmount === undefined) return [];
      const amount = floor((met ? effect.amount : effect.elseAmount ?? 0) * ctx.multiplier * line.lineMultiplier);
      self.hp = Math.max(0, self.hp - amount);
      pushLog(ctx, line, "log", ctx.owner, `${EMOJIS[line.emojiId].icon} 자해 -${amount}`, amount);
      if (self.hp <= 0) ctx.killedBySelfDamage = true;
      return [];
    }
    case "cleanse": {
      let removed = 0;
      for (const statusId of effect.statuses) {
        const before = getStatusValue(self, statusId);
        const count = effect.amount === "all" ? before : Math.min(before, effect.amount);
        setStatus(self, statusId, before - count);
        removed += count;
      }
      pushLog(ctx, line, "status", ctx.owner, `🧼 상태 ${removed} 제거`, removed);
      if (effect.healPerRemoved && removed > 0) {
        const amount = Math.min(removed * effect.healPerRemoved, effect.healCap ?? Number.POSITIVE_INFINITY);
        return [enqueueHeal(ctx, line, amount, ctx.owner)];
      }
      return [];
    }
    case "consume-status-damage": {
      const statusTargetActor = actorForTarget(ctx.owner, effect.target ?? "self");
      const statusTarget = combatant(ctx.state, statusTargetActor);
      const available = getStatusValue(statusTarget, effect.statusId);
      let damage: number;
      if (effect.required !== undefined && available >= effect.required) {
        damage = effect.bonus ?? available * effect.factor;
        setStatus(statusTarget, effect.statusId, effect.consumeAll ? 0 : available - effect.required);
      } else if (effect.required !== undefined && available < effect.required) {
        damage = effect.failureDamage ?? available * effect.factor;
        if (effect.consumeAll || effect.consumeOnFailureAll) setStatus(statusTarget, effect.statusId, 0);
      } else {
        damage = available * effect.factor + (effect.bonus ?? 0);
        if (effect.consumeAll) setStatus(statusTarget, effect.statusId, 0);
      }
      if (effect.cap !== undefined) damage = Math.min(damage, effect.cap);
      const damageEffect: Extract<BingoEffect, { type: "damage" }> = { type: "damage", amount: floor(damage) };
      return [enqueueDamage(ctx, line, damageEffect, floor(damage), opponent(ctx.owner))];
    }
    case "trigger-poison": {
      const poisoned = combatant(ctx.state, opponent(ctx.owner));
      const amount = getStatusValue(poisoned, "poison");
      if (amount <= 0) return [];
      const poisonTarget = opponent(ctx.owner);
      const adjusted = amount * ctx.multiplier * (combatant(ctx.state, poisonTarget).abilityId === "rage" ? 2 : 1);
      ctx.pendingDamage[poisonTarget] += adjusted;
      line.lineDamage += adjusted;
      pushLog(ctx, line, "log", poisonTarget, `☠️ 독 즉시 발동 ${adjusted}`);
      if (!effect.noDecay) setStatus(poisoned, "poison", amount - 1);
      return [{ kind: "damage", value: adjusted, target: poisonTarget }];
    }
    case "heal-linked-damage":
      ctx.healDamageRatio[ctx.owner] = Math.min(1, ctx.healDamageRatio[ctx.owner] + effect.ratio * ctx.multiplier);
      return [];
    case "repeat-previous": {
      if (effect.requireBasic && !line.previous.some((item) => item.basic)) return [];
      if (effect.requireLineTag && lineTagCount(line, effect.requireLineTag) < (effect.requireLineTag === "animal" ? 3 : 1)) return [];
      return replayNumeric(ctx, line, line.previous.filter((item) => !effect.requireBasic || item.basic), effect.multiplier, effect.asDamage);
    }
    case "trigger-adjacent": {
      if (line.auxiliaryDepth >= 1) return [];
      let candidates = adjacentCells(line.cellIndex).filter((index) => ctx.snapshot[index]);
      if (effect.count !== "all") candidates = ctx.rng.shuffle(candidates).slice(0, effect.count);
      const results: NumericResult[] = [];
      for (const cellIndex of candidates) {
        const cell = ctx.snapshot[cellIndex];
        if (!cell) continue;
        const auxiliary: LineContext = { ...line, cellIndex, emojiId: cell.emojiId, lineIndex: 0, previous: [], current: [], auxiliaryDepth: 1 };
        const allowed = EMOJIS[cell.emojiId].onBingo.filter((item) => !["repeat-previous", "trigger-adjacent", "line-multiplier", "set-damage-bonus", "set-guaranteed-remaining", "post-if-no-crit"].includes(item.type));
        for (const item of allowed) results.push(...executeEffect(item, ctx, auxiliary));
      }
      return results;
    }
    case "random": {
      const luckBefore = getStatusValue(self, "luck");
      let candidates = effect.options.map((_, index) => index);
      if (effect.noRepeatKey) {
        const previous = self.combatFlags.randomHistory[effect.noRepeatKey];
        if (previous !== undefined && candidates.length > 1) candidates = candidates.filter((index) => index !== previous);
      }
      const chosen = ctx.rng.pick(candidates);
      if (effect.noRepeatKey) self.combatFlags.randomHistory[effect.noRepeatKey] = chosen;
      consumeLuck(self);
      pushLog(ctx, line, "log", ctx.owner, `🎁 무작위 결과 ${chosen + 1}${luckBefore ? " · 행운 1 소비" : ""}`);
      return effect.options[chosen].flatMap((item) => executeEffect(item, ctx, line));
    }
    case "dice": {
      const luck = getStatusValue(self, "luck");
      let raw = ctx.rng.int(effect.sides) + 1;
      if (raw === 1 && (ownedValues(self).refundLuckOnWorst ?? 0) > 0) {
        addStatus(self, "luck", ownedValues(self).refundLuckOnWorst ?? 0, "evil_eye", ctx.owner);
        raw = ctx.rng.int(effect.sides) + 1;
        pushLog(ctx, line, "log", ctx.owner, `🧿 최악 결과 재추첨 → ${raw}`);
      }
      const rolled = Math.min(effect.sides, raw + luck);
      consumeLuck(self);
      if (effect.jackpotDamage && rolled === effect.sides) {
        return [enqueueDamage(ctx, line, { type: "damage", amount: effect.jackpotDamage }, effect.jackpotDamage, opponent(ctx.owner))];
      }
      if (effect.otherwiseShield) {
        const shield = addShield(ctx, line, rolled, ctx.owner);
        const luckResult = addGeneralStatus(ctx, line, "luck", 1, ctx.owner);
        return [shield, luckResult];
      }
      return [enqueueDamage(ctx, line, { type: "damage", amount: rolled }, rolled, opponent(ctx.owner))];
    }
    case "coin": {
      const luck = getStatusValue(self, "luck");
      const chance = Math.min(1, effect.successChance + luck * 0.1);
      let success = ctx.rng.next() < chance;
      if (!success && (ownedValues(self).refundLuckOnWorst ?? 0) > 0) {
        addStatus(self, "luck", ownedValues(self).refundLuckOnWorst ?? 0, "evil_eye", ctx.owner);
        success = ctx.rng.next() < chance;
        pushLog(ctx, line, "log", ctx.owner, `🧿 동전 실패 재추첨 → ${success ? "성공" : "실패"}`);
      }
      consumeLuck(self);
      return success
        ? [enqueueDamage(ctx, line, { type: "damage", amount: effect.damage }, effect.damage, opponent(ctx.owner))]
        : [addShield(ctx, line, effect.failureShield, ctx.owner)];
    }
    case "slot": {
      const roll = () => [ctx.rng.int(effect.symbols) + 1, ctx.rng.int(effect.symbols) + 1, ctx.rng.int(effect.symbols) + 1];
      let values = roll();
      const matched = (items: number[]) => new Set(items).size < 3;
      if (!matched(values) && (ownedValues(self).refundLuckOnWorst ?? 0) > 0) {
        addStatus(self, "luck", ownedValues(self).refundLuckOnWorst ?? 0, "evil_eye", ctx.owner);
        values = roll();
        pushLog(ctx, line, "log", ctx.owner, `🧿 슬롯 재추첨 → ${values.join("-")}`);
      }
      consumeLuck(self);
      if (new Set(values).size === 1) return [enqueueDamage(ctx, line, { type: "damage", amount: 25 }, 25, opponent(ctx.owner))];
      if (matched(values)) return [enqueueDamage(ctx, line, { type: "damage", amount: 10 }, 10, opponent(ctx.owner))];
      return [addGeneralStatus(ctx, line, "luck", 2, ctx.owner)];
    }
    case "lowest-resource": {
      const lowest = effect.resources.reduce((best, item) => getStatusValue(self, item.statusId) < getStatusValue(self, best.statusId) ? item : best);
      return [addGeneralStatus(ctx, line, lowest.statusId, lowest.amount, ctx.owner)];
    }
    case "line-damage-ratio": {
      if (!conditionMet(effect.condition, ctx, line)) return [];
      const amount = floor(line.lineDamage * effect.ratio);
      ctx.pendingDamage[opponent(ctx.owner)] += amount;
      line.lineDamage += amount;
      return [{ kind: "damage", value: amount, target: opponent(ctx.owner) }];
    }
    case "line-multiplier": return [];
    case "set-damage-bonus":
      if (conditionMet(effect.condition, ctx, line)) ctx.damageBonus += effect.amount;
      return [];
    case "set-guaranteed-remaining":
      if (conditionMet(effect.condition, ctx, line)) ctx.guaranteedRemaining = true;
      return [];
    case "post-if-no-crit":
      ctx.postNoCrit.push({ actor: ctx.owner, luck: floor(effect.luck * ctx.multiplier * line.lineMultiplier), shield: floor(effect.shield * ctx.multiplier * line.lineMultiplier), emojiId: line.emojiId });
      return [];
  }
}

function applyDamageToCombatant(state: CombatState, targetActor: Actor, amount: number, sourceActor: Actor, emojiId: string): number {
  const target = combatant(state, targetActor);
  let remaining = floor(amount);
  const shield = getStatusValue(target, "shield");
  const absorbed = Math.min(shield, remaining);
  if (absorbed > 0) {
    setStatus(target, "shield", shield - absorbed);
    remaining -= absorbed;
    state.events.push(event(state, sourceActor, emojiId, "shield", targetActor, `🛡️ 방어막이 ${absorbed} 피해 흡수`, undefined, absorbed));
  }
  if (
    targetActor === "enemy"
    && sourceActor === "player"
    && emojiId === "aggregate_damage"
    && state.enemy.abilityId === "last-thorn"
    && shield > 0
    && getStatusValue(target, "shield") === 0
    && state.enemyAbility.lastTriggeredTurn !== state.turn
  ) {
    state.enemyAbility.lastTriggeredTurn = state.turn;
    const retaliation = applyDamageToCombatant(state, "player", 2, "enemy", "enemy_ability");
    state.events.push(event(state, "enemy", "enemy_ability", "damage", "player", `🐗 마지막 가시 −${retaliation}`, undefined, retaliation));
  }
  const before = target.hp;
  target.hp = Math.max(0, target.hp - remaining);
  return before - target.hp;
}

function settleResolution(ctx: ResolutionContext): void {
  const owner = combatant(ctx.state, ctx.owner);
  const ownerPotentialHeal = Math.min(ctx.pendingHeal[ctx.owner], Math.max(0, owner.maxHp - owner.hp));
  const linkedDamage = floor(ownerPotentialHeal * Math.min(1, ctx.healDamageRatio[ctx.owner]));
  if (linkedDamage > 0) ctx.pendingDamage[opponent(ctx.owner)] += linkedDamage;

  for (const targetActor of ["player", "enemy"] as Actor[]) {
    const total = ctx.pendingDamage[targetActor];
    if (total <= 0) continue;
    const target = combatant(ctx.state, targetActor);
    const shieldBefore = getStatusValue(target, "shield");
    const thorns = getStatusValue(target, "thorns");
    const hpDamage = applyDamageToCombatant(ctx.state, targetActor, total, ctx.owner, "aggregate_damage");
    ctx.state.events.push(event(ctx.state, ctx.owner, "aggregate_damage", "damage", targetActor, `총피해 −${hpDamage}${total > hpDamage ? ` · 방어 ${total - hpDamage}` : ""}`, undefined, hpDamage));
    if (targetActor === "enemy" && ctx.state.enemy.abilityId === "hasty-escape" && !ctx.state.enemyAbility.used && hpDamage >= 8 && ctx.state.enemy.hp > 0) {
      ctx.state.enemyAbility.used = true;
      const gained = addStatus(ctx.state.enemy, "shield", 4, "enemy_ability", "enemy");
      ctx.state.events.push(event(ctx.state, "enemy", "enemy_ability", "shield", "enemy", `🐀 황급한 도주 · 방어막 +${gained}`, undefined, gained));
    }
    if (shieldBefore > 0 && thorns > 0 && ctx.damageContributions[targetActor] > 0 && targetActor !== ctx.owner) {
      const retaliation = floor(thorns * ctx.damageContributions[targetActor]);
      const reflected = applyDamageToCombatant(ctx.state, ctx.owner, retaliation, targetActor, "thorns");
      ctx.state.events.push(event(ctx.state, targetActor, "thorns", "damage", ctx.owner, `가시 반격 −${reflected}`, undefined, reflected));
    }
  }

  if (!ctx.criticalOccurred) {
    for (const post of ctx.postNoCrit) {
      const postActor = combatant(ctx.state, post.actor);
      addStatus(postActor, "luck", post.luck, post.emojiId, post.actor);
      addStatus(postActor, "shield", post.shield, post.emojiId, post.actor);
      ctx.state.events.push(event(ctx.state, post.actor, post.emojiId, "status", post.actor, `🎪 치명타 없음: 행운 +${post.luck}, 방어막 +${post.shield}`));
    }
  }

  for (const targetActor of ["player", "enemy"] as Actor[]) {
    const target = combatant(ctx.state, targetActor);
    if (target.hp <= 0 || ctx.pendingHeal[targetActor] <= 0) continue;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + ctx.pendingHeal[targetActor]);
    const healed = target.hp - before;
    const overflow = Math.min(ctx.overflowHeal[targetActor], Math.max(0, ctx.pendingHeal[targetActor] - healed));
    if (overflow > 0) addStatus(target, "shield", overflow, "healing_overflow", targetActor);
    ctx.state.events.push(event(ctx.state, ctx.owner, "aggregate_heal", "heal", targetActor, `총회복 +${healed}${overflow ? ` · 초과 방어막 +${overflow}` : ""}`, undefined, healed));
  }
}

function applyStoredEnemyEffect(ctx: ResolutionContext, stored: StoredEnemyEffect, multiplier: number, label: string): void {
  const value = Math.max(1, floor(stored.value * multiplier));
  if (stored.kind === "damage") {
    ctx.pendingDamage[stored.target] += value;
    ctx.damageContributions[stored.target] += 1;
  } else if (stored.kind === "heal") {
    ctx.pendingHeal[stored.target] += value;
  } else if (stored.kind === "shield") {
    addStatus(combatant(ctx.state, stored.target), "shield", value, "enemy_ability", "enemy");
  } else if (stored.statusId && stored.statusId !== "shield") {
    addStatus(combatant(ctx.state, stored.target), stored.statusId, value, "enemy_ability", "enemy");
  }
  ctx.state.events.push(event(ctx.state, "enemy", "enemy_ability", stored.kind === "damage" || stored.kind === "heal" ? stored.kind : "status", stored.target, `${label} · ${value}`, undefined, value));
}

function applyEnemyBingoAbility(ctx: ResolutionContext, lines: LineDefinition[]): void {
  const ability = ctx.state.enemy.abilityId;
  const runtime = ctx.state.enemyAbility;
  const owner = ctx.owner;
  if (owner === "enemy") runtime.bingoCount += 1;
  else runtime.playerBingoCount += 1;

  if (ability === "venom-tail" && owner === "enemy" && runtime.bingoCount === 1) {
    const gained = addStatus(ctx.state.player, "poison", 2, "enemy_ability", "enemy");
    ctx.state.events.push(event(ctx.state, "enemy", "enemy_ability", "status", "player", `🦊 독꼬리 · 독 +${gained}`, undefined, gained));
  }

  if (ability === "pack-hunt" && owner === "enemy") {
    const activeLines = lines.filter((line) => line.cells.filter((index) => EMOJIS[ctx.snapshot[index]?.emojiId ?? ""]?.tags.includes("animal")).length >= 3).length;
    if (activeLines > 0) {
      ctx.pendingDamage.player += 5 * activeLines;
      ctx.pendingHeal.enemy += 3 * activeLines;
      ctx.state.events.push(event(ctx.state, "enemy", "enemy_ability", "log", "player", `🐻 무리 사냥 ${activeLines}회 · 피해 +${5 * activeLines} · 회복 +${3 * activeLines}`));
    }
  }

  if (ability === "royal-roar") {
    if (owner === "player") {
      runtime.stacks = Math.min(3, runtime.stacks + lines.length);
      ctx.state.events.push(event(ctx.state, "enemy", "enemy_ability", "status", "enemy", `🦁 포효 ${runtime.stacks}/3`));
    } else if (runtime.stacks > 0) {
      const stacks = runtime.stacks;
      ctx.pendingDamage.player += stacks * 3;
      const gained = addStatus(ctx.state.enemy, "shield", stacks * 2, "enemy_ability", "enemy");
      runtime.stacks = 0;
      ctx.state.events.push(event(ctx.state, "enemy", "enemy_ability", "log", "player", `🦁 왕의 포효 · 피해 +${stacks * 3} · 방어막 +${gained}`));
    }
  }

  if (ability === "double-response" && owner === "player" && lines.length >= 2) {
    const gained = addStatus(ctx.state.enemy, "shield", 4, "enemy_ability", "enemy");
    ctx.state.events.push(event(ctx.state, "enemy", "enemy_ability", "shield", "enemy", `✋ 잠깐! · 방어막 +${gained}`, undefined, gained));
  }

  if (ability === "small-finish" && owner === "enemy" && ctx.pendingDamage.player <= 5) {
    ctx.pendingDamage.player += 3;
    ctx.state.events.push(event(ctx.state, "enemy", "enemy_ability", "log", "player", "🤏 조금만 더 · 피해 +3"));
  }

  if (ability === "feedback-show" && owner === "enemy" && runtime.bingoCount % 2 === 0 && ctx.lastNumeric) {
    applyStoredEnemyEffect(ctx, ctx.lastNumeric, 0.5, "🤘 피드백 공연");
  }

  if (ability === "harsh-review" && owner === "player" && ctx.pendingDamage.enemy === 0 && runtime.lastTriggeredTurn !== ctx.state.turn) {
    runtime.lastTriggeredTurn = ctx.state.turn;
    const gained = addStatus(ctx.state.player, "weakness", 2, "enemy_ability", "enemy");
    ctx.state.events.push(event(ctx.state, "enemy", "enemy_ability", "status", "player", `👎 혹평 · 약점 +${gained}`, undefined, gained));
  }

  if (ability === "gravity-well" && owner === "enemy" && lines.some((line) => line.cells.includes(12))) {
    const activeLines = lines.filter((line) => line.cells.includes(12)).length;
    const gained = addStatus(ctx.state.enemy, "shield", 6 * activeLines, "enemy_ability", "enemy");
    ctx.state.events.push(event(ctx.state, "enemy", "enemy_ability", "shield", "enemy", `🪐 중력 우물 · 방어막 +${gained}`, undefined, gained));
  }

  if (ability === "prophecy" && owner === "player" && runtime.lastTriggeredTurn !== ctx.state.turn && lines.some((line) => lineOrientation(line.id) === runtime.prophecyOrientation)) {
    runtime.lastTriggeredTurn = ctx.state.turn;
    const shield = addStatus(ctx.state.enemy, "shield", 6, "enemy_ability", "enemy");
    const weakness = addStatus(ctx.state.player, "weakness", 2, "enemy_ability", "enemy");
    ctx.state.events.push(event(ctx.state, "enemy", "enemy_ability", "status", "player", `🔮 예언 적중 · 방어막 +${shield} · 약점 +${weakness}`));
  }

  if (ability === "hex-echo" && owner === "enemy" && runtime.bingoCount % 2 === 0 && ctx.firstStatus) {
    applyStoredEnemyEffect(ctx, ctx.firstStatus, 1, "🧙‍♂️ 주술 반향");
  }

  if (ability === "abyss-phases" && owner === "enemy") {
    if (runtime.phase === 1 && ctx.firstNumeric) applyStoredEnemyEffect(ctx, ctx.firstNumeric, 0.5, "🌌 1막 · 메아리");
    else if (runtime.phase === 2) {
      const gained = addStatus(ctx.state.player, "weakness", 2, "enemy_ability", "enemy");
      ctx.state.events.push(event(ctx.state, "enemy", "enemy_ability", "status", "player", `🌌 2막 · 약점 +${gained}`, undefined, gained));
    }
  }
}

function updateEnemyPhase(state: CombatState): void {
  if (state.enemy.abilityId !== "abyss-phases") return;
  const ratio = state.enemy.hp / state.enemy.maxHp;
  const nextPhase: 1 | 2 | 3 = ratio > 0.67 ? 1 : ratio > 0.33 ? 2 : 3;
  if (nextPhase === state.enemyAbility.phase) return;
  state.enemyAbility.phase = nextPhase;
  state.events.push(event(state, "enemy", "enemy_ability", "status", "enemy", `🌌 심연의 ${nextPhase}막으로 전환`));
}

export function resolveCompletedBingos(
  sourceState: CombatState,
  placedCell: number,
  owner: Actor,
  rng: RandomSource = new SeededRandom(sourceState.turn * 997 + placedCell),
): CombatState {
  const state = cloneState(sourceState);
  const lines = orderedResolutionLines(completedLinesAt(state.board, placedCell));
  if (lines.length === 0) {
    state.lastBingo = null;
    return state;
  }

  const snapshot = cloneBoard(state.board);
  const ctx: ResolutionContext = {
    state,
    snapshot,
    owner,
    multiplier: lines.length,
    rng,
    pendingDamage: { player: 0, enemy: 0 },
    pendingHeal: { player: 0, enemy: 0 },
    overflowHeal: { player: 0, enemy: 0 },
    healDamageRatio: { player: 0, enemy: 0 },
    damageContributions: { player: 0, enemy: 0 },
    criticalOccurred: false,
    killedBySelfDamage: false,
    damageBonus: 0,
    guaranteedRemaining: false,
    postNoCrit: [],
    enemyAbilityCritUsed: false,
  };

  for (const lineDefinition of lines) {
    ctx.enemyAbilityCritUsed = false;
    const lineCells = lineDefinition.cells.map((index) => snapshot[index]);
    const blackHoleCount = lineCells.filter((cell) => cell?.emojiId === "black_hole").length;
    const line: LineContext = {
      line: lineDefinition,
      lineCells,
      lineIndex: 0,
      cellIndex: lineDefinition.cells[0],
      emojiId: lineCells[0]?.emojiId ?? "unknown",
      previous: [],
      current: [],
      lineDamage: 0,
      lineMultiplier: 1.5 ** blackHoleCount,
      scientistChargeUsed: false,
      scientistPoisonUsed: false,
      auxiliaryDepth: 0,
    };
    for (let index = 0; index < lineDefinition.cells.length; index += 1) {
      const cellIndex = lineDefinition.cells[index];
      const cell = snapshot[cellIndex];
      if (!cell) continue;
      line.lineIndex = index;
      line.cellIndex = cellIndex;
      line.emojiId = cell.emojiId;
      line.current = [];
      for (const effect of EMOJIS[cell.emojiId]?.onBingo ?? []) {
        if (ctx.killedBySelfDamage) break;
        const results = executeEffect(effect, ctx, line);
        results.forEach((result) => rememberEnemyEffect(ctx, result));
        line.current.push(...results);
      }
      if (line.current.length > 0) line.previous = line.current;
      if (ctx.killedBySelfDamage) break;
    }
    if (ctx.killedBySelfDamage) break;
  }

  if (!ctx.killedBySelfDamage) {
    applyEnemyBingoAbility(ctx, lines);
    settleResolution(ctx);
    updateEnemyPhase(state);
  }

  const cellsToClear = new Set(lines.flatMap((line) => line.cells));
  for (const cellIndex of cellsToClear) {
    const cell = snapshot[cellIndex];
    if (!cell) continue;
    const retentionTurns = EMOJIS[cell.emojiId]?.retentionTurns;
    if (retentionTurns) {
      state.board[cellIndex] = { ...cell, remainingTurns: cell.remainingTurns ?? retentionTurns };
    } else state.board[cellIndex] = null;
  }

  state.lastBingo = {
    owner,
    lineIds: lines.map((line) => line.id),
    multiplier: lines.length,
    icons: lines.map((line) => line.cells.map((index) => EMOJIS[snapshot[index]?.emojiId ?? ""]?.icon ?? "")),
    cells: lines.map((line) => [...line.cells]),
  };

  if (state.player.hp <= 0) state.phase = "lost";
  else if (state.enemy.hp <= 0) state.phase = "won";
  return state;
}

function transformCandidate(state: CombatState, actor: Actor, rng: RandomSource, rareBoost = 1): string {
  const actorState = combatant(state, actor);
  const candidates = [...new Set(actor === "player"
    ? [...COMMON_EMOJI_IDS, ...(CHARACTER_REWARD_POOLS[actorState.id] ?? [])]
    : COMMON_EMOJI_IDS)]
    .filter((id) => !EMOJIS[id].onPlace?.some((effect) => effect.type === "transform"));
  const luck = getStatusValue(actorState, "luck");
  const result = weightedChoice(candidates.map((id) => ({
    value: id,
    weight: EMOJIS[id].rarity === "common" ? 65 : EMOJIS[id].rarity === "uncommon" ? 30 : 5 * rareBoost * (1 + luck),
  })), rng);
  consumeLuck(actorState);
  return result;
}

function applyPlaceEffects(
  sourceState: CombatState,
  actor: Actor,
  cellIndex: number,
  originalEmojiId: string,
  canChain: boolean,
  rng: RandomSource,
): { state: CombatState; emojiId: string; destroyed: boolean } {
  const state = sourceState;
  let emojiId = originalEmojiId;
  let destroyed = false;
  for (const effect of EMOJIS[originalEmojiId]?.onPlace ?? []) {
    if (effect.type === "transform") {
      emojiId = transformCandidate(state, actor, rng, effect.rareBoost);
      const cell = state.board[cellIndex];
      if (cell) state.board[cellIndex] = { ...cell, emojiId };
      state.events.push(event(state, actor, originalEmojiId, "placement", actor, `${EMOJIS[originalEmojiId].icon} → ${EMOJIS[emojiId].icon} ${EMOJIS[emojiId].name} 변신`));
    } else if (effect.type === "destroy") {
      const row = Math.floor(cellIndex / 5);
      const col = cellIndex % 5;
      const cross = [[row, col], [row - 1, col], [row, col - 1], [row, col + 1], [row + 1, col]]
        .filter(([r, c]) => r >= 0 && r < 5 && c >= 0 && c < 5)
        .map(([r, c]) => r * 5 + c);
      const targets = effect.pattern === "cross"
        ? cross
        : [cellIndex, ...rng.shuffle(cross.filter((index) => index !== cellIndex && state.board[index])).slice(0, 1)];
      targets.forEach((index) => { state.board[index] = null; });
      destroyed = true;
      state.events.push(event(state, actor, originalEmojiId, "placement", actor, `${EMOJIS[originalEmojiId].icon} 주변 ${targets.length}칸 파괴 · 이 배치로 Bingo 불가능`));
    } else if (effect.type === "extra-placement" && canChain) {
      const available = actor === "player" ? state.draw.length : effect.count;
      const granted = Math.min(effect.count, available);
      if (granted > 0) state.placementsRemaining += granted;
      state.events.push(event(state, actor, originalEmojiId, "placement", actor, granted > 0 ? `${EMOJIS[originalEmojiId].icon} 추가 배치 ${granted}회` : `${EMOJIS[originalEmojiId].icon} 남은 Emoji가 없어 추가 배치가 발동하지 않았습니다.`));
      if (actor === "enemy" && granted > 0 && state.enemy.abilityId === "encore-shield" && !state.enemyAbility.used) {
        state.enemyAbility.used = true;
        const gained = addStatus(state.enemy, "shield", 3, "enemy_ability", "enemy");
        state.events.push(event(state, "enemy", "enemy_ability", "shield", "enemy", `👋 한 번 더 인사 · 방어막 +${gained}`, undefined, gained));
      }
    } else if (effect.type === "redraw-extra" && canChain) {
      if (actor === "player") {
        const redrawCount = Math.max(1, state.draw.length);
        state.discarded.push(...state.draw);
        state.draw = drawFromPool(state.player.pool, redrawCount, rng);
        state.placementsRemaining += effect.count;
        state.events.push(event(state, actor, originalEmojiId, "placement", actor, `${EMOJIS[originalEmojiId].icon} ${redrawCount}개 새로 Draw · 추가 배치 ${effect.count}회`));
      } else {
        state.placementsRemaining += effect.count;
        state.events.push(event(state, actor, originalEmojiId, "placement", actor, `${EMOJIS[originalEmojiId].icon} 새 Emoji Draw · 추가 배치 ${effect.count}회`));
        if (state.enemy.abilityId === "encore-shield" && !state.enemyAbility.used) {
          state.enemyAbility.used = true;
          const gained = addStatus(state.enemy, "shield", 3, "enemy_ability", "enemy");
          state.events.push(event(state, "enemy", "enemy_ability", "shield", "enemy", `👋 한 번 더 인사 · 방어막 +${gained}`, undefined, gained));
        }
      }
    }
  }
  return { state, emojiId, destroyed };
}

export function selectCombatCell(state: CombatState, cellIndex: number | null): CombatState {
  if (state.phase !== "player-selecting") return state;
  if (cellIndex !== null && state.board[cellIndex]) return state;
  if (cellIndex !== null && state.selectedCell === cellIndex) return { ...state, selectedCell: null };
  return { ...state, selectedCell: cellIndex };
}

export function playerPlace(sourceState: CombatState, drawIndex: number, rng: RandomSource = new SeededRandom(sourceState.turn * 541 + drawIndex)): CombatState {
  const cellIndex = sourceState.selectedCell;
  if (sourceState.phase !== "player-selecting" || cellIndex === null || sourceState.board[cellIndex] || drawIndex < 0 || drawIndex >= sourceState.draw.length) return sourceState;
  const state = cloneState(sourceState);
  state.events = [];
  const originalEmojiId = state.draw.splice(drawIndex, 1)[0];
  const glitched = state.enemy.abilityId === "glitch-infection" && state.enemyAbility.glitchDrawIndex === drawIndex;
  let emojiId = originalEmojiId;
  if (glitched) {
    emojiId = transformCandidate(state, "player", rng);
    state.enemyAbility.glitchDrawIndex = null;
    state.events.push(event(state, "enemy", "enemy_ability", "placement", "player", `👾 GLITCH · ${EMOJIS[originalEmojiId].icon} → ${EMOJIS[emojiId].icon}`));
  } else if (state.enemyAbility.glitchDrawIndex !== null && drawIndex < state.enemyAbility.glitchDrawIndex) {
    state.enemyAbility.glitchDrawIndex -= 1;
  }
  state.board[cellIndex] = { emojiId, placedBy: "player", turnsOnBoard: 0 };
  if (state.enemyAbility.markedKind === "trap" && state.enemyAbility.markedCell === cellIndex) {
    const gained = addStatus(state.player, "poison", 2, "enemy_ability", "enemy");
    state.enemyAbility.markedCell = null;
    state.enemyAbility.markedKind = null;
    state.events.push(event(state, "enemy", "enemy_ability", "status", "player", `🐊 포획 덫 · 독 +${gained}`, undefined, gained));
  }
  state.selectedCell = null;
  state.discarded = [];
  state.placementsRemaining -= 1;
  state.lastBingo = null;
  const canChain = !state.isExtraPlacement || ALLOW_EXTRA_PLACEMENT_CHAIN;
  const placed = glitched ? { state, emojiId, destroyed: false } : applyPlaceEffects(state, "player", cellIndex, emojiId, canChain, rng);
  let result = placed.destroyed ? placed.state : resolveCompletedBingos(placed.state, cellIndex, "player", rng);
  if (result.phase === "won" || result.phase === "lost") return result;
  if (result.placementsRemaining > 0 && result.draw.length > 0) return { ...result, phase: "player-selecting", isExtraPlacement: true };
  return { ...result, phase: "enemy-thinking", discarded: [...result.discarded, ...result.draw], draw: [], placementsRemaining: 0, isExtraPlacement: false, enemyAbility: { ...result.enemyAbility, glitchDrawIndex: null } };
}

export function advanceRetainedTurns(board: Board): Board {
  return board.map((cell) => {
    if (!cell) return null;
    const advanced = { ...cell, turnsOnBoard: (cell.turnsOnBoard ?? 0) + 1 };
    if (advanced.remainingTurns === undefined) return advanced;
    if (advanced.remainingTurns <= 1) return null;
    return { ...advanced, remainingTurns: advanced.remainingTurns - 1 };
  });
}

export function beginActorTurn(sourceState: CombatState, actor: Actor): CombatState {
  const state = cloneState(sourceState);
  if (actor === "enemy" && state.enemyAbility.markedKind) {
    if (state.enemyAbility.markedKind === "abduction" && state.enemyAbility.markedCell !== null) {
      const targetCell = state.enemyAbility.markedCell;
      if (state.board[targetCell]) {
        state.board[targetCell] = null;
        state.events.push(event(state, "enemy", "enemy_ability", "placement", "player", `🛸 ${Math.floor(targetCell / 5) + 1}행 ${targetCell % 5 + 1}열 Emoji 납치`));
      } else {
        state.events.push(event(state, "enemy", "enemy_ability", "log", "player", "🛸 납치 대상이 먼저 사라져 실패"));
      }
    }
    state.enemyAbility.markedCell = null;
    state.enemyAbility.markedKind = null;
  }
  const target = combatant(state, actor);
  target.turnFlags = { firstShieldGranted: false, firstIncomingReductionUsed: false };
  const poison = getStatusValue(target, "poison");
  if (poison > 0) {
    const sourceActor = target.statuses.poison?.sourceActor;
    let amount = poison;
    if (target.abilityId === "rage" && sourceActor && sourceActor !== actor) amount *= 2;
    const hpDamage = applyDamageToCombatant(state, actor, amount, sourceActor ?? opponent(actor), "poison");
    state.events.push(event(state, sourceActor ?? opponent(actor), "poison", "damage", actor, `☠️ 독 피해 −${hpDamage}`, undefined, hpDamage));
    if (getStatusValue(target, "poisonNoDecay") > 0) setStatus(target, "poisonNoDecay", getStatusValue(target, "poisonNoDecay") - 1);
    else setStatus(target, "poison", poison - 1);
  }
  if (state.player.hp <= 0) state.phase = "lost";
  else if (state.enemy.hp <= 0) state.phase = "won";
  return state;
}

function enemyCellScore(
  board: Board,
  cellIndex: number,
  abilityId?: EnemyAbilityId,
  emojiId?: string,
  state?: CombatState,
): number {
  const cellLines = BINGO_LINES.filter((line) => line.cells.includes(cellIndex));
  const emoji = emojiId ? EMOJIS[emojiId] : undefined;
  const countTag = (line: LineDefinition, tag: string) => line.cells.reduce((count, index) => {
    const id = index === cellIndex ? emojiId : board[index]?.emojiId;
    return count + (id && EMOJIS[id]?.tags.includes(tag) ? 1 : 0);
  }, 0);
  const lineScore = (line: LineDefinition) => {
    const emptyCount = line.cells.filter((index) => !board[index]).length;
    let score = 100 - emptyCount * 10;
    const orientation = lineOrientation(line.id);
    const playerCells = line.cells.filter((index) => board[index]?.placedBy === "player").length;
    const sameEmoji = emojiId ? line.cells.filter((index) => board[index]?.emojiId === emojiId).length : 0;
    switch (abilityId) {
      case "venom-tail": case "hex-echo": score += countTag(line, "poison") * 7; break;
      case "last-thorn": case "double-response": score += countTag(line, "shield") * 7; break;
      case "ambush-aim": score += countTag(line, "damage") * 5 + countTag(line, "crit") * 5; break;
      case "pack-hunt": case "royal-roar": score += countTag(line, "animal") * 8; break;
      case "encore-shield": score += line.cells.includes(12) ? 8 : 0; break;
      case "diagonal-precision": score += orientation === "diagonal" ? 24 : 0; break;
      case "small-finish": score += playerCells * 6 + (emojiId === "lone_blade" && sameEmoji === 0 ? 10 : 0); break;
      case "feedback-show": score += countTag(line, "copy") * 7 + (line.cells.indexOf(cellIndex) >= 3 ? 5 : 0); break;
      case "harsh-review": score += countTag(line, "damage") * 6; break;
      case "three-act-show": score += cellLines.length * 3; break;
      case "glitch-infection": score += line.cells.reduce((sum, index) => sum + (EMOJIS[board[index]?.emojiId ?? ""]?.rarity === "rare" ? 4 : 0), 0); break;
      case "gravity-well": score += line.cells.includes(12) ? 28 : 0; break;
      case "eclipse": score += countTag(line, state && state.enemy.hp / state.enemy.maxHp <= 0.5 ? "damage" : "poison") * 6; break;
      case "prophecy": score += orientation !== state?.enemyAbility.prophecyOrientation ? 10 : 0; break;
      case "abyss-phases": score += countTag(line, state?.enemyAbility.phase === 1 ? "copy" : "damage") * 7; break;
      default: break;
    }
    return score;
  };
  let score = Math.max(...cellLines.map(lineScore));
  if (abilityId === "snare-trap") score += adjacentCells(cellIndex).filter((index) => !board[index]).length * 3;
  if (abilityId === "abduction-mark") {
    const row = Math.floor(cellIndex / 5);
    const col = cellIndex % 5;
    score += (4 - Math.abs(row - 2) - Math.abs(col - 2)) * 3 + cellLines.length * 2;
  }
  if (emoji?.tags.includes("copy")) score += 2;
  return score;
}

export function chooseEnemyCell(
  board: Board,
  rng: RandomSource,
  stage = 1,
  abilityId?: EnemyAbilityId,
  emojiId?: string,
  state?: CombatState,
): number {
  const lineStates = BINGO_LINES.map((line) => ({ line, empty: line.cells.filter((index) => !board[index]) })).filter((item) => item.empty.length > 0);
  const winningCells = [...new Set(lineStates.filter((item) => item.empty.length === 1).flatMap((item) => item.empty))];
  if (winningCells.length > 0) return rng.pick(winningCells);
  let availableCells = board.map((cell, index) => cell === null ? index : -1).filter((index) => index >= 0);
  if (stage >= 2) {
    const riskyCells = new Set(lineStates.filter((item) => item.empty.length === 2).flatMap((item) => item.empty));
    const safeCells = availableCells.filter((index) => !riskyCells.has(index));
    if (safeCells.length > 0) availableCells = safeCells;
  }
  const scored = availableCells.map((cellIndex) => ({ cellIndex, score: enemyCellScore(board, cellIndex, abilityId, emojiId, state) }));
  const best = Math.max(...scored.map((item) => item.score));
  return rng.pick(scored.filter((item) => item.score === best)).cellIndex;
}

export function createEnemyIntent(state: CombatState, rng: RandomSource): EnemyIntent {
  const nextBoard = state.isExtraPlacement ? state.board : advanceRetainedTurns(state.board);
  const drawPool = { ...state.enemy.pool };
  if (state.enemy.abilityId === "three-act-show" && state.isExtraPlacement && state.enemyAbility.threeActFirstEmojiId) {
    delete drawPool[state.enemyAbility.threeActFirstEmojiId];
  }
  const emojiId = drawFromPool(drawPool, 1, rng)[0];
  return { cellIndex: chooseEnemyCell(nextBoard, rng, state.stage, state.enemy.abilityId as EnemyAbilityId, emojiId, state), emojiId };
}

export function performEnemyTurn(sourceState: CombatState, rng: RandomSource, initialIntent?: EnemyIntent): CombatState {
  if (sourceState.phase !== "enemy-thinking") return sourceState;
  const continuing = sourceState.isExtraPlacement && sourceState.placementsRemaining > 0;
  let state: CombatState;
  if (continuing) {
    state = { ...cloneState(sourceState), events: [], lastBingo: null, discarded: [] };
  } else {
    const prepared = { ...cloneState(sourceState), board: advanceRetainedTurns(sourceState.board), events: [], lastBingo: null, discarded: [] };
    prepared.enemyAbility.turnCount += 1;
    state = beginActorTurn(prepared, "enemy");
  }
  if (state.phase === "won" || state.phase === "lost") return state;

  const threeAct = state.enemy.abilityId === "three-act-show" ? ((state.enemyAbility.turnCount - 1) % 3) + 1 : 0;
  const plannedPlacements = continuing ? state.placementsRemaining : threeAct === 3 ? 2 : 1;
  const intent = initialIntent ?? createEnemyIntent({ ...state, isExtraPlacement: true }, rng);
  const { emojiId, cellIndex } = intent;
  state.board[cellIndex] = { emojiId, placedBy: "enemy", turnsOnBoard: 0 };
  state.placementsRemaining = Math.max(0, plannedPlacements - 1);
  const placed = applyPlaceEffects(state, "enemy", cellIndex, emojiId, !continuing && !sourceState.isExtraPlacement, rng);
  state = placed.destroyed ? placed.state : resolveCompletedBingos(placed.state, cellIndex, "enemy", rng);
  if (state.phase === "won" || state.phase === "lost") return state;

  if (state.placementsRemaining > 0) {
    if (threeAct === 3 && !continuing) state.enemyAbility.threeActFirstEmojiId = emojiId;
    return { ...state, phase: "enemy-thinking", isExtraPlacement: true };
  }
  state.enemyAbility.threeActFirstEmojiId = null;

  if (threeAct === 2) {
    const gained = addStatus(state.enemy, "luck", 1, "enemy_ability", "enemy");
    state.events.push(event(state, "enemy", "enemy_ability", "status", "enemy", `🙌 2부 · 행운 +${gained}`, undefined, gained));
  }
  if (state.enemy.abilityId === "snare-trap") {
    const candidates = adjacentCells(cellIndex).filter((index) => !state.board[index]);
    if (candidates.length > 0) {
      state.enemyAbility.markedCell = rng.pick(candidates);
      state.enemyAbility.markedKind = "trap";
      state.events.push(event(state, "enemy", "enemy_ability", "placement", "player", "🐊 인접 Cell에 포획 덫 설치"));
    }
  }
  if (state.enemy.abilityId === "abduction-mark" && state.enemyAbility.turnCount % 3 === 0) {
    const occupied = state.board.map((cell, index) => cell ? index : -1).filter((index) => index >= 0);
    if (occupied.length > 0) {
      state.enemyAbility.markedCell = rng.pick(occupied);
      state.enemyAbility.markedKind = "abduction";
      state.events.push(event(state, "enemy", "enemy_ability", "placement", "player", "🛸 다음 Enemy Turn에 제거할 Cell 예고"));
    }
  }
  state = beginActorTurn({ ...state, board: advanceRetainedTurns(state.board) }, "player");
  if (state.phase === "won" || state.phase === "lost") return state;
  const nextTurn = state.turn + 1;
  const nextDraw = drawFromPool(state.player.pool, 3, rng);
  const glitchDrawIndex = state.enemy.abilityId === "glitch-infection" && nextTurn % 3 === 0 ? rng.int(nextDraw.length) : null;
  const prophecySequence: LineOrientation[] = ["horizontal", "vertical", "diagonal"];
  return {
    ...state,
    phase: "player-selecting",
    turn: nextTurn,
    draw: nextDraw,
    selectedCell: null,
    placementsRemaining: 1,
    isExtraPlacement: false,
    enemyAbility: {
      ...state.enemyAbility,
      glitchDrawIndex,
      prophecyOrientation: prophecySequence[(nextTurn - 1) % prophecySequence.length],
    },
  };
}
