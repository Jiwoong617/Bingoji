import {
  advanceRetainedTurns,
  beginActorTurn,
  cloneCombatState,
  placeDrawnEmojiForActor,
} from "../../game/combat";
import { drawFromPool, SeededRandom } from "../../game/rng";
import type {
  Actor,
  CombatState,
  CombatantState,
  EffectEvent,
  Pool,
} from "../../game/types";
import { validateMultiplayerProfile } from "./rules";
import type { MultiplayerProfile, PvpSeat } from "./types";

export const PVP_STARTING_HP = 30;
export const PVP_DRAW_SIZE = 3;
export const PVP_TURN_TIMEOUT_MS = 15_000;
export const PVP_PLACEMENT_GRACE_MS = 400;
export const PVP_BINGO_PRESENTATION_MS = 2_450;
export const PVP_STANDARD_PRESENTATION_MS = 700;
export const PVP_BINGO_IMPACT_MS = 1_650;
export const PVP_STANDARD_IMPACT_MS = 260;

export interface PvpMatchParticipant extends MultiplayerProfile {
  playerId: string;
}

export interface CreatePvpMatchInput {
  matchId: string;
  host: PvpMatchParticipant;
  guest: PvpMatchParticipant;
  seed: number;
}

export type PvpMatchPhase = "turn" | "finished";
export type PvpMatchEndReason = "hp" | "forfeit" | "disconnect" | "server-error";

export interface PvpMatchOutcome {
  winnerSeat: PvpSeat | null;
  reason: PvpMatchEndReason;
}

export interface PvpMatchEffectEvent extends Omit<EffectEvent, "actor" | "target"> {
  actor: PvpSeat;
  target: PvpSeat;
}

export interface PvpPlacementRecord {
  seat: PvpSeat;
  cellIndex: number;
  drawIndex: number;
  drawnEmojiId: string;
  resolvedEmojiId: string;
  automatic: boolean;
}

export interface PvpMatchState {
  matchId: string;
  revision: number;
  turn: number;
  startingSeat: PvpSeat;
  activeSeat: PvpSeat;
  phase: PvpMatchPhase;
  rngState: number;
  combat: CombatState;
  events: PvpMatchEffectEvent[];
  lastPlacement: PvpPlacementRecord | null;
  outcome: PvpMatchOutcome | null;
}

export type PvpMatchCommand =
  | { type: "place"; seat: PvpSeat; drawIndex: number; cellIndex: number }
  | { type: "auto-place"; seat: PvpSeat };

export type PvpMatchCommandErrorCode =
  | "match-finished"
  | "not-your-turn"
  | "invalid-draw"
  | "invalid-cell"
  | "no-empty-cell";

export type PvpMatchCommandResult =
  | { ok: true; state: PvpMatchState }
  | {
      ok: false;
      state: PvpMatchState;
      error: { code: PvpMatchCommandErrorCode; message: string };
    };

const seatToActor: Record<PvpSeat, Actor> = { host: "player", guest: "enemy" };
const actorToSeat: Record<Actor, PvpSeat> = { player: "host", enemy: "guest" };

function emptyEnemyAbilityState(): CombatState["enemyAbility"] {
  return {
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
  };
}

function defaultCombatRules(): CombatState["combatRules"] {
  return {
    drawSize: PVP_DRAW_SIZE,
    excludedDrawEmojiIds: [],
    linkedDrawPair: null,
    shakyPlacementChance: 0,
    firstPlacementExtra: false,
    firstPlacementUsed: false,
    enemyFirstDouble: false,
    enemyFirstDoubleUsed: false,
    firstBingoBoost: 1,
    playerFirstBingoBoostUsed: false,
    enemyFirstBingoBoostUsed: false,
    openingRedrawAvailable: false,
    forcedDrawEmojiId: null,
    eventEggPlaced: false,
    eventBabyDestroyed: false,
  };
}

function createCombatant(participant: PvpMatchParticipant): CombatantState {
  return {
    id: participant.playerId,
    icon: participant.avatar,
    name: participant.nickname,
    ability: "",
    abilityId: "none",
    hp: PVP_STARTING_HP,
    maxHp: PVP_STARTING_HP,
    pool: { ...participant.pool },
    statuses: {},
    turnFlags: { firstShieldGranted: false, firstIncomingReductionUsed: false },
    combatFlags: { firstIncomingReductionUsed: false, randomHistory: {} },
  };
}

function combatPhase(seat: PvpSeat): CombatState["phase"] {
  return seat === "host" ? "player-selecting" : "enemy-thinking";
}

function poolForSeat(combat: CombatState, seat: PvpSeat): Pool {
  return seat === "host" ? combat.player.pool : combat.enemy.pool;
}

function otherSeat(seat: PvpSeat): PvpSeat {
  return seat === "host" ? "guest" : "host";
}

function mapEvents(events: EffectEvent[]): PvpMatchEffectEvent[] {
  return events.map((item) => ({
    ...item,
    actor: actorToSeat[item.actor],
    target: actorToSeat[item.target],
  }));
}

function outcomeFor(combat: CombatState): PvpMatchOutcome | null {
  const hostDead = combat.player.hp <= 0;
  const guestDead = combat.enemy.hp <= 0;
  if (!hostDead && !guestDead) return null;
  if (hostDead && guestDead) return { winnerSeat: null, reason: "hp" };
  return { winnerSeat: hostDead ? "guest" : "host", reason: "hp" };
}

function finishMatch(
  state: PvpMatchState,
  combat: CombatState,
  rng: SeededRandom,
  outcome: PvpMatchOutcome,
  placement: PvpPlacementRecord,
): PvpMatchState {
  return {
    ...state,
    revision: state.revision + 1,
    phase: "finished",
    rngState: rng.snapshot(),
    combat,
    events: mapEvents(combat.events),
    lastPlacement: placement,
    outcome,
  };
}

function reject(
  state: PvpMatchState,
  code: PvpMatchCommandErrorCode,
  message: string,
): PvpMatchCommandResult {
  return { ok: false, state, error: { code, message } };
}

function assertParticipant(label: string, participant: PvpMatchParticipant): void {
  const validation = validateMultiplayerProfile(participant);
  if (!participant.playerId.trim()) throw new Error(`${label} playerId가 비어 있습니다.`);
  if (!validation.valid) {
    const messages = [
      ...validation.errors.map((error) => error.message),
      ...validation.pool.errors.map((error) => error.message),
    ];
    throw new Error(`${label} Profile이 올바르지 않습니다: ${[...new Set(messages)].join(" ")}`);
  }
}

export function createPvpMatch(input: CreatePvpMatchInput): PvpMatchState {
  if (!input.matchId.trim()) throw new Error("matchId가 비어 있습니다.");
  if (input.host.playerId === input.guest.playerId) throw new Error("두 참가자의 playerId가 같습니다.");
  assertParticipant("Host", input.host);
  assertParticipant("Guest", input.guest);

  const rng = new SeededRandom(input.seed);
  const startingSeat: PvpSeat = rng.int(2) === 0 ? "host" : "guest";
  const player = createCombatant(input.host);
  const enemy = createCombatant(input.guest);
  const combat: CombatState = {
    board: Array.from({ length: 25 }, () => null),
    player,
    enemy,
    enemyKind: "normal",
    stage: 1,
    difficulty: "hard",
    phase: combatPhase(startingSeat),
    turn: 1,
    draw: drawFromPool(startingSeat === "host" ? player.pool : enemy.pool, PVP_DRAW_SIZE, rng),
    selectedCell: null,
    placementsRemaining: 1,
    isExtraPlacement: false,
    discarded: [],
    events: [],
    lastBingo: null,
    enemyAbility: emptyEnemyAbilityState(),
    combatRules: defaultCombatRules(),
  };

  return {
    matchId: input.matchId,
    revision: 0,
    turn: 1,
    startingSeat,
    activeSeat: startingSeat,
    phase: "turn",
    rngState: rng.snapshot(),
    combat,
    events: [],
    lastPlacement: null,
    outcome: null,
  };
}

function continueOrPassTurn(
  state: PvpMatchState,
  combatAfterPlacement: CombatState,
  rng: SeededRandom,
  placement: PvpPlacementRecord,
): PvpMatchState {
  const immediateOutcome = outcomeFor(combatAfterPlacement);
  if (immediateOutcome) return finishMatch(state, combatAfterPlacement, rng, immediateOutcome, placement);

  if (combatAfterPlacement.placementsRemaining > 0 && combatAfterPlacement.draw.length > 0) {
    const combat = {
      ...combatAfterPlacement,
      phase: combatPhase(state.activeSeat),
      isExtraPlacement: true,
    };
    return {
      ...state,
      revision: state.revision + 1,
      rngState: rng.snapshot(),
      combat,
      events: mapEvents(combat.events),
      lastPlacement: placement,
    };
  }

  const nextSeat = otherSeat(state.activeSeat);
  let combat = cloneCombatState(combatAfterPlacement);
  combat.discarded = [...combat.discarded, ...combat.draw];
  combat.draw = [];
  combat.board = advanceRetainedTurns(combat.board);
  combat.placementsRemaining = 1;
  combat.isExtraPlacement = false;
  combat.phase = combatPhase(nextSeat);
  combat.turn = state.turn + 1;
  combat = beginActorTurn(combat, seatToActor[nextSeat]);

  const turnStartOutcome = outcomeFor(combat);
  if (turnStartOutcome) {
    return finishMatch(
      { ...state, turn: state.turn + 1, activeSeat: nextSeat },
      combat,
      rng,
      turnStartOutcome,
      placement,
    );
  }

  combat.draw = drawFromPool(poolForSeat(combat, nextSeat), PVP_DRAW_SIZE, rng);
  return {
    ...state,
    revision: state.revision + 1,
    turn: state.turn + 1,
    activeSeat: nextSeat,
    rngState: rng.snapshot(),
    combat,
    events: mapEvents(combat.events),
    lastPlacement: placement,
  };
}

function performPlacement(
  state: PvpMatchState,
  seat: PvpSeat,
  drawIndex: number,
  cellIndex: number,
  automatic: boolean,
  rng: SeededRandom,
): PvpMatchCommandResult {
  if (drawIndex < 0 || drawIndex >= state.combat.draw.length) {
    return reject(state, "invalid-draw", "현재 Draw에 없는 Emoji입니다.");
  }
  if (cellIndex < 0 || cellIndex >= 25 || state.combat.board[cellIndex]) {
    return reject(state, "invalid-cell", "배치할 수 없는 Cell입니다.");
  }

  const drawnEmojiId = state.combat.draw[drawIndex];
  const combat = placeDrawnEmojiForActor(
    state.combat,
    seatToActor[seat],
    cellIndex,
    drawIndex,
    rng,
  );
  const resolvedEmojiId = combat.board[cellIndex]?.emojiId ?? drawnEmojiId;
  const placement: PvpPlacementRecord = {
    seat,
    cellIndex,
    drawIndex,
    drawnEmojiId,
    resolvedEmojiId,
    automatic,
  };
  return { ok: true, state: continueOrPassTurn(state, combat, rng, placement) };
}

export function applyPvpMatchCommand(
  state: PvpMatchState,
  command: PvpMatchCommand,
): PvpMatchCommandResult {
  if (state.phase === "finished") return reject(state, "match-finished", "이미 종료된 Match입니다.");
  if (command.seat !== state.activeSeat) return reject(state, "not-your-turn", "현재 행동할 차례가 아닙니다.");

  const rng = SeededRandom.fromState(state.rngState);
  if (command.type === "place") {
    return performPlacement(state, command.seat, command.drawIndex, command.cellIndex, false, rng);
  }

  if (state.combat.draw.length === 0) return reject(state, "invalid-draw", "자동 배치할 Draw가 없습니다.");
  const emptyCells = state.combat.board
    .map((cell, index) => cell === null ? index : -1)
    .filter((index) => index >= 0);
  if (emptyCells.length === 0) return reject(state, "no-empty-cell", "자동 배치할 빈 Cell이 없습니다.");
  const drawIndex = rng.int(state.combat.draw.length);
  const cellIndex = rng.pick(emptyCells);
  return performPlacement(state, command.seat, drawIndex, cellIndex, true, rng);
}
