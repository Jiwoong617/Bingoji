import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { EmojiDetailContent } from "./components/EmojiDetailContent";
import { Modal } from "./components/Modal";
import { CHARACTERS, EMOJIS, MAP_META, validateContent } from "./content/data";
import {
  createCombat,
  createEnemyIntent,
  getEnemyAbilityIndicators,
  getCombatantDerivedStats,
  performEnemyTurn,
  playerPlace,
  rerollOpeningDraw,
  SeededRandom,
  selectCombatCell,
  type CombatState,
  type Difficulty,
  type EffectEvent,
  type EnemyDefinition,
  type EnemyIntent,
  type EnemyKind,
  type GameEventDefinition,
  type MapCandidate,
  type ResultState,
  type RunPlayer,
  type RunProgress,
  type StatusState,
  type MultiplayerProfile,
} from "./shared";
import {
  emptyMultiplayerProfile,
  MultiplayerProfileScreen,
  type MultiplayerRoomAction,
} from "./multiplayer/ProfileScreen";
import { isMultiplayerServerConfigured, MultiplayerRoomClient, type MultiplayerClientState } from "./multiplayer/client";
import { MultiplayerRoomScreen } from "./multiplayer/RoomScreen";
import { MultiplayerBattleScreen } from "./multiplayer/BattleScreen";
import { DIFFICULTIES, DIFFICULTY_BY_ID } from "./game/difficulty";
import {
  advanceEventTimers,
  canChooseEventChoice,
  claimPendingEventReward,
  consumeBattleEventModifiers,
  resolveEventChoice,
  selectableEventEmojiIds,
  settleScheduledRewards,
} from "./game/events";
import {
  addEmoji,
  applyRest,
  canRemoveEmoji,
  completeCurrentMap,
  createRewardOptions,
  createRun,
  enterMap,
  generateRunMapCandidates,
  pickEnemy,
  pickEvent,
  removeEmoji,
  resolveQuestionMap,
} from "./game/run";

type Screen =
  | "title"
  | "mode"
  | "character"
  | "difficulty"
  | "multiplayer-profile"
  | "multiplayer-room"
  | "map"
  | "battle"
  | "reward"
  | "event"
  | "rest"
  | "result";

interface RewardOptions {
  characterEmojiId: string;
  commonEmojiId: string;
}

const BINGO_PRESENTATION_MS = 2850;
const BINGO_IMPACT_MS = 2050;

const CONTENT_ERRORS = validateContent();

function splitAbility(ability: string): { name: string; description: string } {
  const separator = ability.indexOf(":");
  return separator < 0
    ? { name: "능력 없음", description: ability }
    : { name: ability.slice(0, separator), description: ability.slice(separator + 1).trim() };
}

function HpBar({ hp, maxHp, tone }: { hp: number; maxHp: number; tone: "player" | "enemy" }) {
  const ratio = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  return (
    <div className="hp-wrap" aria-label={`HP ${hp} / ${maxHp}`}>
      <div className="hp-track">
        <div className={`hp-fill hp-${tone}`} style={{ width: `${ratio}%` }} />
      </div>
      <strong>{hp} / {maxHp}</strong>
    </div>
  );
}

function StageProgress({ stage, position }: { stage: number; position: number }) {
  return (
    <section className="stage-progress" aria-label={`Stage ${stage}, Map ${position}`}>
      <div className="stage-title">
        <span>STAGE {stage}</span>
        <small>MAP {position} / 10</small>
      </div>
      <div className="stage-dots">
        {Array.from({ length: 10 }, (_, index) => {
          const step = index + 1;
          const state = step < position ? "done" : step === position ? "current" : "future";
          return (
            <span key={step} className={`stage-dot ${state}`} aria-label={`${step}번째 Map`}>
              {step === 10 ? "♛" : step}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function EmojiInfo({ emojiId, onClose }: { emojiId: string; onClose: () => void }) {
  return <Modal title="Emoji 정보" onClose={onClose}><EmojiDetailContent emojiId={emojiId} /></Modal>;
}

function PoolView({ player, onClose }: { player: RunPlayer; onClose: () => void }) {
  const entries = Object.entries(player.pool).filter(([, count]) => count > 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <Modal title="MY EMOJI POOL" onClose={onClose} layout="top" cardClassName="pool-view-modal">
      <p className="modal-copy">모든 Emoji는 Draw·배치 대상입니다. 같은 Emoji가 많을수록 Draw 확률이 높아집니다.</p>
      <div className="pool-grid pool-inventory" aria-label="보유 Emoji 목록">
        {entries.map(([id, count]) => (
          <button key={id} className={`pool-item ${selectedId === id ? "selected" : ""}`} type="button" aria-pressed={selectedId === id} onClick={() => setSelectedId(id)}>
            <span>{EMOJIS[id].icon}</span><strong>×{count}</strong><small>{EMOJIS[id].name}</small>
          </button>
        ))}
      </div>
      <section className={`pool-inline-detail ${selectedId ? "has-selection" : ""}`} aria-live="polite">
        {selectedId
          ? <EmojiDetailContent emojiId={selectedId} />
          : <div className="pool-detail-empty"><span>👆</span><strong>Emoji를 선택하세요</strong><p>위 Pool에서 Emoji를 누르면 능력과 관련 상태 효과가 여기에 표시됩니다.</p></div>}
      </section>
    </Modal>
  );
}

function OwnedPoolStrip({
  pool,
  onInfo,
  title = "MY EMOJI POOL",
}: {
  pool: RunPlayer["pool"];
  onInfo: (id: string) => void;
  title?: string;
}) {
  return (
    <section className="owned-pool-strip">
      <div className="owned-pool-heading">
        <strong>{title}</strong>
        <small>Emoji를 눌러 능력 확인</small>
      </div>
      <div className="owned-pool-list">
        {Object.entries(pool).map(([id, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => onInfo(id)}
            aria-label={`${EMOJIS[id].name} ${count}개, 정보 보기`}
          >
            <span>{EMOJIS[id].icon}</span><small>×{count}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="HOW TO PLAY" onClose={onClose}>
      <ol className="rules-list">
        <li><span>1</span><p>플레이어와 적은 하나의 5×5 Board를 공유합니다.</p></li>
        <li><span>2</span><p>빈칸을 고른 뒤 이번 Turn에 뽑힌 Emoji 하나를 배치하세요.</p></li>
        <li><span>3</span><p>마지막 빈칸을 채운 쪽이 그 Bingo의 주인이 됩니다.</p></li>
        <li><span>4</span><p>라인의 모든 Emoji 능력이 주인 편에서 순서대로 발동합니다.</p></li>
        <li><span>5</span><p>상대가 만든 기회도 빼앗을 수 있습니다. 하지만 역으로 빼앗길 수도 있습니다!</p></li>
      </ol>
      <button className="primary-button wide" type="button" onClick={onClose}>알겠어요</button>
    </Modal>
  );
}

function TitleScreen({ onStart, onHelp }: { onStart: () => void; onHelp: () => void }) {
  return (
    <main className="center-screen title-screen">
      <div className="floating-emojis" aria-hidden="true">
        <span>🔥</span><span>⚔️</span><span>❤️</span><span>💀</span><span>🍀</span>
      </div>
      <div className="title-mark">
        <p className="eyebrow">EMOJI BINGO ROGUELIKE</p>
        <h1>BINGOJI</h1>
        <p className="title-kicker">마지막 한 칸이 전세를 뒤집는다</p>
      </div>
      <div className="title-actions">
        <button className="primary-button hero-button" type="button" onClick={onStart}>게임 시작</button>
        <button className="ghost-button" type="button" onClick={onHelp}>게임 방법</button>
      </div>
      <p className="title-note">공용 Board에서 상대의 Emoji까지 빼앗아 Bingo를 완성하세요.</p>
    </main>
  );
}

function ModeSelectScreen({ onSingle, onMultiplayer, onCancel, multiplayerEnabled }: { onSingle: () => void; onMultiplayer: () => void; onCancel: () => void; multiplayerEnabled: boolean }) {
  return (
    <main className="center-screen mode-screen">
      <header className="screen-heading">
        <p className="eyebrow">CHOOSE GAME MODE</p>
        <h1>게임 모드 선택</h1>
      </header>
      <section className="mode-options" aria-label="게임 모드 목록">
        <button className="mode-card single" type="button" onClick={onSingle}>
          <span>🗺️</span><h2>싱글플레이</h2><p>Stage를 돌파하는 기존 PvE Run</p>
        </button>
        <button className="mode-card multiplayer" type="button" onClick={onMultiplayer} disabled={!multiplayerEnabled}>
          <span>⚔️</span><h2>멀티플레이</h2><p>{multiplayerEnabled ? "방 코드로 만나는 실시간 1:1 대전" : "멀티플레이 Server가 아직 설정되지 않았습니다."}</p>
        </button>
      </section>
      <button className="ghost-button" type="button" onClick={onCancel}>← 메인 화면</button>
    </main>
  );
}

const CAROUSEL_SLOT_FALLBACK = 96;

function readCarouselSlot(track: HTMLElement): number {
  const slot = parseFloat(getComputedStyle(track).getPropertyValue("--slot"));
  return Number.isFinite(slot) && slot > 0 ? slot : CAROUSEL_SLOT_FALLBACK;
}

function CharacterScreen({ onStart, onCancel, onInfo }: { onStart: (id: string) => void; onCancel: () => void; onInfo: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState(CHARACTERS[0].id);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef<number | null>(null);
  const slotWidth = useRef(CAROUSEL_SLOT_FALLBACK);
  const dragged = useRef(false);
  const character = CHARACTERS.find((item) => item.id === selectedId) ?? CHARACTERS[0];
  const selectedIndex = CHARACTERS.findIndex((item) => item.id === character.id);
  const ability = splitAbility(character.ability);
  const moveSelection = (direction: number) => {
    setSelectedId((current) => {
      const index = CHARACTERS.findIndex((item) => item.id === current);
      return CHARACTERS[(index + direction + CHARACTERS.length) % CHARACTERS.length].id;
    });
  };
  return (
    <main className="center-screen character-screen">
      <header className="screen-heading">
        <p className="eyebrow">CHOOSE YOUR PLAYER</p>
        <h1>캐릭터 선택</h1>
      </header>
      <section className="character-carousel" aria-label="플레이어블 캐릭터 캐러셀">
        <div
          className={`carousel-track${dragging ? " dragging" : ""}`}
          role="listbox"
          aria-label="플레이어블 캐릭터 목록"
          onPointerDown={(event) => {
            dragStartX.current = event.clientX;
            slotWidth.current = readCarouselSlot(event.currentTarget);
            dragged.current = false;
            setDragging(true);
            setDragOffset(0);
          }}
          onPointerMove={(event) => {
            if (dragStartX.current === null) return;
            let base = dragStartX.current;
            let remainder = event.clientX - base;
            if (Math.abs(remainder) > 8) {
              dragged.current = true;
              if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.setPointerCapture?.(event.pointerId);
            }
            while (Math.abs(remainder) >= slotWidth.current) {
              const step = remainder > 0 ? 1 : -1;
              moveSelection(-step);
              base += step * slotWidth.current;
              remainder -= step * slotWidth.current;
            }
            dragStartX.current = base;
            setDragOffset(remainder);
          }}
          onPointerUp={(event) => {
            if (dragStartX.current === null) return;
            const distance = event.clientX - dragStartX.current;
            if (Math.abs(distance) >= slotWidth.current / 2) moveSelection(distance > 0 ? -1 : 1);
            dragStartX.current = null;
            setDragOffset(0);
            setDragging(false);
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
            if (dragged.current) window.setTimeout(() => { dragged.current = false; }, 0);
          }}
          onPointerCancel={() => { dragStartX.current = null; dragged.current = false; setDragOffset(0); setDragging(false); }}
        >
          {CHARACTERS.map((item, index) => {
            const half = Math.floor(CHARACTERS.length / 2);
            const slot = ((index - selectedIndex + CHARACTERS.length + half) % CHARACTERS.length) - half;
            const position = slot + dragOffset / slotWidth.current;
            const distance = Math.abs(position);
            return (
              <article
                key={item.id}
                className={`character-card character-slide ${slot === 0 ? "selected" : ""}`}
                style={{
                  "--slide-x": Math.sign(position) * Math.pow(distance, .82),
                  "--slide-scale": Math.max(.45, 1 - .2 * distance),
                  "--slide-turn": -Math.max(-2, Math.min(2, position)) * 13,
                  "--slide-fade": Math.max(0, 1 - .32 * distance),
                  zIndex: Math.round(10 - distance * 3),
                } as CSSProperties}
                role="option"
                aria-selected={slot === 0}
                aria-label={`${item.name}, HP ${item.maxHp}`}
                tabIndex={0}
                onClick={() => { if (!dragged.current && slot !== 0) setSelectedId(item.id); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(item.id); }
                  else if (event.key === "ArrowLeft") moveSelection(-1);
                  else if (event.key === "ArrowRight") moveSelection(1);
                }}
              >
                <span className="side-character-icon">{item.icon}</span>
                <strong className="side-character-name">{item.name}</strong>
                <small>HP {item.maxHp}</small>
              </article>
            );
          })}
        </div>
      </section>
      <section className="character-card selected-card" aria-label={`${character.name} 상세 정보`}>
        <div className="character-spotlight"><span>{character.icon}</span></div>
        <p className="selected-label">SELECTED</p>
        <h2>{character.name}</h2>
        <HpBar hp={character.maxHp} maxHp={character.maxHp} tone="player" />
        <div className="ability-box"><strong>{character.abilityId === "none" ? "TRAIT" : "ABILITY"}</strong><h3>{ability.name}</h3><p>{ability.description}</p></div>
        <div className="starting-pool">
          <strong>STARTING POOL</strong>
          <div>{Object.entries(character.startingPool).map(([id, count]) => <button key={id} type="button" onClick={() => onInfo(id)} aria-label={`${EMOJIS[id].name} 정보 보기`}>{EMOJIS[id].icon}<small>×{count}</small></button>)}</div>
        </div>
      </section>
      <div className="two-actions">
        <button className="ghost-button" type="button" onClick={onCancel}>취소</button>
        <button className="primary-button" type="button" onClick={() => onStart(character.id)}>이 캐릭터로 시작</button>
      </div>
    </main>
  );
}

function DifficultyScreen({ characterId, onStart, onCancel }: { characterId: string; onStart: (difficulty: Difficulty) => void; onCancel: () => void }) {
  const character = CHARACTERS.find((item) => item.id === characterId) ?? CHARACTERS[0];
  return (
    <main className="center-screen difficulty-screen">
      <header className="screen-heading">
        <p className="eyebrow">CHOOSE DIFFICULTY</p>
        <h1>난이도 선택</h1>
        <p><span className="difficulty-character-icon">{character.icon}</span> {character.name}의 Run 난이도를 정하세요.</p>
      </header>
      <section className="difficulty-options" aria-label="게임 난이도 목록">
        {DIFFICULTIES.map((difficulty) => (
          <button key={difficulty.id} className={`difficulty-card difficulty-${difficulty.id}`} type="button" onClick={() => onStart(difficulty.id)} aria-label={`${difficulty.label} 난이도로 시작`}>
            <span className="difficulty-icon">{difficulty.icon}</span>
            <h2>{difficulty.label}</h2>
          </button>
        ))}
      </section>
      <button className="ghost-button" type="button" onClick={onCancel}>← 캐릭터 다시 선택</button>
    </main>
  );
}

function MapScreen({ run, candidates, onSelect, onInfo, onClaimEventReward }: { run: RunProgress; candidates: MapCandidate[]; onSelect: (map: MapCandidate) => void; onInfo: (id: string) => void; onClaimEventReward: (emojiId: string) => void }) {
  return (
    <main className="game-shell map-screen">
      <StageProgress stage={run.stage} position={run.completedMaps + 1} />
      <header className="screen-heading compact">
        <p className="eyebrow">CHOOSE YOUR PATH</p>
        <h1>다음 Map을 선택하세요</h1>
        <p>전체 경로는 보이지 않습니다. 지금의 선택에 집중하세요.</p>
      </header>
      {run.pendingEventReward && (
        <section className="pending-event-reward">
          <span>{run.pendingEventReward.icon}</span>
          <div><p className="eyebrow">DELAYED EVENT REWARD</p><h2>{run.pendingEventReward.name}</h2><p>보상 Emoji 하나를 선택하세요.</p></div>
          <div className="pending-reward-options">
            {run.pendingEventReward.options.map((emojiId) => <button key={emojiId} type="button" onClick={() => onClaimEventReward(emojiId)}><span>{EMOJIS[emojiId].icon}</span><strong>{EMOJIS[emojiId].name}</strong><small>{EMOJIS[emojiId].description}</small></button>)}
          </div>
        </section>
      )}
      {!run.pendingEventReward && <section className={`map-options ${candidates.length === 1 ? "single" : ""}`}>
        {candidates.map((map, index) => (
          <button key={map.id} className={`map-card map-${map.type}`} type="button" onClick={() => onSelect(map)}>
            <span className="map-side">{candidates.length === 1 ? "DESTINATION" : index === 0 ? "LEFT" : "RIGHT"}</span>
            <span className="map-icon">{map.icon}</span>
            <strong>{map.label}</strong>
            <small>{map.type === "question" ? "무슨 일이 일어날지 알 수 없습니다" : map.type === "rest" ? "최대 HP의 30% 회복" : map.type === "boss" ? "Stage의 마지막 전투" : "승리하면 Pool을 강화할 수 있습니다"}</small>
          </button>
        ))}
      </section>}
      <section className="run-status">
        <div><span>{run.player.icon}</span><strong>{run.player.name}</strong></div>
        <HpBar hp={run.player.hp} maxHp={run.player.maxHp} tone="player" />
        <span className="pool-count">{DIFFICULTY_BY_ID[run.difficulty].label} · POOL {Object.values(run.player.pool).reduce((a, b) => a + b, 0)}</span>
      </section>
      {(run.notices.length > 0 || run.modifiers.length > 0 || run.scheduledRewards.length > 0) && (
        <section className="run-effects" aria-label="진행 중인 이벤트 효과">
          {run.notices.map((notice, index) => <p key={`${notice}-${index}`}>✨ {notice}</p>)}
          {run.modifiers.map((modifier, index) => (
            <p key={`${modifier.id}-${index}`}>{modifier.icon} <strong>{modifier.name}</strong> · {modifier.description}{modifier.remainingBattles ? ` (${modifier.remainingBattles}전투)` : modifier.remainingMaps ? ` (${modifier.remainingMaps} Map)` : ""}</p>
          ))}
          {run.scheduledRewards.map((reward) => <p key={reward.id}>{reward.icon} <strong>{reward.name}</strong>까지 {reward.mapsRemaining} {reward.counter === "battle" ? "전투" : "Map"}</p>)}
        </section>
      )}
      <OwnedPoolStrip pool={run.player.pool} onInfo={onInfo} />
    </main>
  );
}

function FighterPanel({
  combatant,
  tone,
  onPool,
  shownHp = combatant.hp,
  impacts = [],
  impactActive = false,
  abilityIndicators = [],
}: {
  combatant: CombatState["player"];
  tone: "player" | "enemy";
  onPool?: () => void;
  shownHp?: number;
  impacts?: EffectEvent[];
  impactActive?: boolean;
  abilityIndicators?: ReturnType<typeof getEnemyAbilityIndicators>;
}) {
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const hasDamage = impacts.some((item) => item.kind === "damage");
  const hasHeal = impacts.some((item) => item.kind === "heal");
  const derived = getCombatantDerivedStats(combatant);
  const statuses = Object.values(combatant.statuses).filter((status): status is StatusState => Boolean(status));
  const statusItems = [
    ...statuses.map((status) => ({ key: status.statusId, name: status.name, icon: status.icon, value: status.value, duration: status.duration, description: status.description })),
    { key: "derived-crit-chance", name: "치명타 확률", icon: "🎯", value: `${Math.floor(derived.critChance * 100)}%`, duration: undefined, description: `직접 피해 효과마다 적용되는 현재 치명타 확률입니다. 기본 확률과 캐릭터·정밀·보유 효과가 모두 포함됩니다.` },
    { key: "derived-crit-damage", name: "치명타 피해", icon: "💥", value: `×${derived.critMultiplier}`, duration: undefined, description: `치명타가 발생했을 때 적용되는 현재 기본 피해 배율입니다.` },
    ...(combatant.abilityId === "rage" ? [{ key: "derived-rage", name: "분노 폭주", icon: "😡", value: `×${derived.outgoingDamageMultiplier.toFixed(2)}`, duration: undefined, description: `현재 직접 피해 ×${derived.outgoingDamageMultiplier.toFixed(2)}. 적의 직접 피해와 적이 부여한 독 피해는 ×${derived.incomingDamageMultiplier}로 받습니다.` }] : []),
    ...abilityIndicators.map((indicator) => ({ ...indicator, duration: undefined })),
  ];

  useEffect(() => {
    const dismiss = () => setActiveStatus(null);
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, []);

  return (
    <section className={`fighter-panel ${tone} ${impactActive && hasDamage ? "taking-hit" : ""} ${impactActive && hasHeal ? "receiving-heal" : ""}`}>
      <span className="fighter-icon">{combatant.icon}</span>
      <div className="fighter-copy">
        <div className="fighter-name">
          <span>{tone === "enemy" ? "ENEMY" : "PLAYER"}</span>
          <strong>{combatant.name}</strong>
          {onPool && <button className="fighter-pool-button" type="button" onClick={onPool}>🎒 POOL</button>}
        </div>
        <div className="fighter-hp-line">
          <HpBar hp={shownHp} maxHp={combatant.maxHp} tone={tone} />
          {impactActive && impacts.length > 0 && (
            <div className="hp-deltas" aria-live="polite">
              {impacts.map((item) => (
                <span key={item.id} className={item.kind}>{item.kind === "damage" ? "−" : "+"}{item.value ?? 0}</span>
              ))}
            </div>
          )}
        </div>
        <div className="status-chips" aria-label={`${combatant.name} 상태`}>
          {statusItems.map((status) => (
            <button
              key={status.key}
              className={`status-chip ${status.key === "derived-rage" || ("danger" in status && status.danger) ? "danger-status" : ""} ${activeStatus === status.key ? "active" : ""}`}
              type="button"
              aria-label={`${status.name}: ${status.description}`}
              aria-expanded={activeStatus === status.key}
              onClick={() => setActiveStatus(status.key)}
            >
              <span>{status.icon}</span><strong>{status.value}</strong>{status.duration !== undefined && <small>{status.duration}T</small>}
              <span className="status-tooltip" role="tooltip"><b>{status.name}</b><em>{status.description}</em></span>
            </button>
          ))}
        </div>
        <p>{combatant.ability}</p>
      </div>
    </section>
  );
}

function BingoEffects({ combat, presenting }: { combat: CombatState; presenting: boolean }) {
  if (!combat.lastBingo && combat.events.length === 0) {
    return <section className="effect-zone empty"><span>✨</span><p>완성된 Bingo 효과가 여기에 표시됩니다.</p></section>;
  }
  return (
    <section className={`effect-zone ${combat.lastBingo?.owner ?? ""} ${presenting ? "presenting" : ""}`}>
      {combat.lastBingo && (
        <div className="bingo-summary">
          <strong>{combat.lastBingo.multiplier > 1 ? `${combat.lastBingo.multiplier}× MULTI BINGO!` : "BINGO!"}</strong>
          <span>{combat.lastBingo.owner === "player" ? "PLAYER EFFECT" : "ENEMY EFFECT"}</span>
          <div className="animated-bingo-lines">
            {combat.lastBingo.icons.map((icons, lineIndex) => (
              <p key={combat.lastBingo!.lineIds[lineIndex]}>
                {icons.map((icon, iconIndex) => (
                  <span
                    key={`${lineIndex}-${iconIndex}`}
                    className="bingo-icon-token"
                    style={{ "--icon-index": iconIndex, "--line-index": lineIndex } as CSSProperties}
                  >{icon}</span>
                ))}
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="effect-log" aria-live="polite">
        {combat.events.slice(-6).map((item) => <span key={item.id}>{item.text}</span>)}
      </div>
      {presenting && (
        <div className="effect-projectiles" aria-hidden="true">
          {combat.events.filter((item) => item.kind === "damage" || item.kind === "heal").map((item, index) => (
            <span
              key={`projectile-${item.id}`}
              className={`effect-projectile ${item.kind} target-${item.target}`}
              style={{ "--effect-index": index } as CSSProperties}
            >{item.kind === "damage" ? "💥" : "💚"}<b>{item.value}</b></span>
          ))}
        </div>
      )}
    </section>
  );
}

interface BattleScreenProps {
  run: RunProgress;
  combat: CombatState;
  rng: SeededRandom;
  onChange: (combat: CombatState) => void;
  onFinish: () => void;
  onInfo: (emojiId: string) => void;
  onPool: () => void;
}

function BattleScreen({ run, combat, rng, onChange, onFinish, onInfo, onPool }: BattleScreenProps) {
  const [presenting, setPresenting] = useState(false);
  const [impactActive, setImpactActive] = useState(false);
  const [shownHp, setShownHp] = useState({ player: combat.player.hp, enemy: combat.enemy.hp });
  const [enemyIntent, setEnemyIntent] = useState<EnemyIntent | null>(null);
  const preparingEnemyIntent = useRef(false);

  useEffect(() => {
    if (!combat.lastBingo) {
      setShownHp({ player: combat.player.hp, enemy: combat.enemy.hp });
      setPresenting(false);
      setImpactActive(false);
      return;
    }
    setPresenting(true);
    setImpactActive(false);
    const impactTimer = window.setTimeout(() => {
      setShownHp({ player: combat.player.hp, enemy: combat.enemy.hp });
      setImpactActive(true);
    }, BINGO_IMPACT_MS);
    const finishTimer = window.setTimeout(() => {
      setPresenting(false);
      setImpactActive(false);
    }, BINGO_PRESENTATION_MS);
    return () => {
      window.clearTimeout(impactTimer);
      window.clearTimeout(finishTimer);
    };
  }, [combat.enemy.hp, combat.events, combat.lastBingo, combat.player.hp]);

  useEffect(() => {
    if (combat.phase !== "enemy-thinking" || presenting || enemyIntent || preparingEnemyIntent.current) return;
    preparingEnemyIntent.current = true;
    setEnemyIntent(createEnemyIntent(combat, rng));
  }, [combat, enemyIntent, presenting, rng]);

  useEffect(() => {
    if (!enemyIntent || combat.phase !== "enemy-thinking" || presenting) return;
    const timer = window.setTimeout(() => {
      const intent = enemyIntent;
      setEnemyIntent(null);
      preparingEnemyIntent.current = false;
      onChange(performEnemyTurn(combat, rng, intent));
    }, 720);
    return () => window.clearTimeout(timer);
  }, [combat, enemyIntent, onChange, presenting, rng]);

  useEffect(() => {
    if (combat.phase !== "enemy-thinking") {
      setEnemyIntent(null);
      preparingEnemyIntent.current = false;
    }
  }, [combat.phase]);

  const playerImpacts = combat.events.filter((item) => item.target === "player" && (item.kind === "damage" || item.kind === "heal"));
  const enemyImpacts = combat.events.filter((item) => item.target === "enemy" && (item.kind === "damage" || item.kind === "heal"));
  const interactionLocked = combat.phase !== "player-selecting" || presenting;

  const turnMessage = combat.phase === "player-selecting"
    ? presenting ? "Bingo 효과 발동 중…" : combat.isExtraPlacement ? "추가 배치! 남은 Emoji를 사용하세요" : "빈칸을 고른 뒤 Emoji를 선택하세요"
    : combat.phase === "enemy-thinking" ? enemyIntent ? `적이 ${Math.floor(enemyIntent.cellIndex / 5) + 1}행 ${enemyIntent.cellIndex % 5 + 1}열을 선택했습니다` : "적이 Board를 살피는 중…" : combat.phase === "won" ? "전투 승리!" : "전투 패배";
  const presentingBingoCells = new Map<number, string>();
  if (presenting && combat.lastBingo) {
    combat.lastBingo.cells.forEach((line, lineIndex) => {
      line.forEach((cellIndex, iconIndex) => {
        presentingBingoCells.set(cellIndex, combat.lastBingo?.icons[lineIndex]?.[iconIndex] ?? "");
      });
    });
  }

  return (
    <main className="game-shell battle-screen" onClick={() => onChange(selectCombatCell(combat, null))}>
      <StageProgress stage={run.stage} position={run.currentMap} />
      <section className="combatants-row" onClick={(event) => event.stopPropagation()}>
        <FighterPanel combatant={combat.enemy} tone="enemy" shownHp={shownHp.enemy} impacts={enemyImpacts} impactActive={impactActive} abilityIndicators={getEnemyAbilityIndicators(combat)} />
        <FighterPanel combatant={combat.player} tone="player" shownHp={shownHp.player} impacts={playerImpacts} impactActive={impactActive} />
      </section>
      <BingoEffects combat={combat} presenting={presenting} />
      <section className="board-section" onClick={(event) => event.stopPropagation()}>
        <div className="turn-banner"><span>TURN {combat.turn}</span><strong>{turnMessage}</strong></div>
        {presenting && combat.lastBingo && <div className={`board-bingo-callout ${combat.lastBingo.owner}`} aria-hidden="true"><strong>{combat.lastBingo.multiplier > 1 ? `${combat.lastBingo.multiplier}× BINGO!` : "BINGO!"}</strong><span>{combat.lastBingo.owner === "player" ? "PLAYER" : "ENEMY"}</span></div>}
        <div className={`bingo-board ${interactionLocked ? "locked" : ""}`} role="grid" aria-label="5 곱하기 5 Bingo Board">
          {combat.board.map((cell, index) => {
            const selected = combat.selectedCell === index;
            const bingoIcon = presentingBingoCells.get(index);
            return (
              <button
                key={index}
                className={`board-cell ${cell ? `occupied ${cell.placedBy}` : "empty"} ${selected ? "selected" : ""} ${enemyIntent?.cellIndex === index ? "enemy-target" : ""} ${combat.enemyAbility.markedCell === index ? `ability-mark ability-${combat.enemyAbility.markedKind}` : ""} ${bingoIcon !== undefined ? `bingo-complete bingo-${combat.lastBingo?.owner}` : ""}`}
                type="button"
                role="gridcell"
                aria-label={`${cell ? `${EMOJIS[cell.emojiId].name}, ${cell.placedBy} 배치${cell.remainingTurns ? `, ${cell.remainingTurns}턴 뒤 제거` : ""}` : `${Math.floor(index / 5) + 1}행 ${index % 5 + 1}열 빈칸`}${combat.enemyAbility.markedCell === index ? combat.enemyAbility.markedKind === "trap" ? ", 포획 덫: 배치 시 독 2" : ", 납치 대상: 다음 Enemy Turn에 제거" : ""}`}
                onClick={() => {
                  if (cell) onInfo(cell.emojiId);
                  else if (!interactionLocked) onChange(selectCombatCell(combat, index));
                }}
              >
                {cell ? <><span>{EMOJIS[cell.emojiId].icon}</span><i aria-hidden="true" />{cell.remainingTurns && <b className="retention-badge">{cell.remainingTurns}T</b>}</> : bingoIcon !== undefined ? <span className="bingo-afterimage">{bingoIcon}</span> : <span className="cell-plus">{enemyIntent?.cellIndex === index ? "◎" : "+"}</span>}
              </button>
            );
          })}
        </div>
      </section>
      <section className="draw-section" onClick={(event) => event.stopPropagation()}>
        <div className="draw-heading"><span>THIS TURN</span><strong>DRAW EMOJI</strong>{combat.combatRules.openingRedrawAvailable && <button type="button" onClick={() => onChange(rerollOpeningDraw(combat, rng))}>🪩 첫 Draw 다시 뽑기</button>}</div>
        <div className="draw-row">
          <button className="pool-button draw-pool-button" type="button" onClick={onPool}><span>🎒</span><small>MY POOL</small></button>
          <div className="draw-cards">
            {combat.draw.map((emojiId, index) => (
              <button
                key={`${combat.turn}-${index}-${emojiId}`}
                className={`draw-card ${combat.enemyAbility.glitchDrawIndex === index ? "glitched" : ""}`}
                type="button"
                style={{ "--draw-index": index } as CSSProperties}
                onClick={() => {
                  if (combat.selectedCell === null) onInfo(emojiId);
                  else if (!interactionLocked) onChange(playerPlace(combat, index, rng));
                }}
              >
                <span>{EMOJIS[emojiId].icon}</span>
                <strong>{EMOJIS[emojiId].name}</strong>
                <small>{combat.enemyAbility.glitchDrawIndex === index ? "GLITCH · 배치 시 변신" : combat.selectedCell === null ? "정보 보기" : "여기에 배치"}</small>
              </button>
            ))}
            {combat.phase === "enemy-thinking" && <div className="enemy-thinking-card">상대의 수…</div>}
          </div>
          <div className={`trash ${combat.discarded.length ? "active" : ""}`} aria-label="사용하지 않은 Emoji">
            <div className="discarded-flight">{combat.discarded.map((id, index) => <span key={`${id}-${index}`} style={{ "--discard-index": index } as CSSProperties}>{EMOJIS[id].icon}</span>)}</div>
            <span>🗑️</span>
            <small>{combat.discarded.map((id) => EMOJIS[id].icon).join(" ") || "DISCARD"}</small>
          </div>
        </div>
      </section>
      {(combat.phase === "won" || combat.phase === "lost") && !presenting && (
        <div className={`battle-result-overlay ${combat.phase}`}>
          <span>{combat.phase === "won" ? "🏆" : "💔"}</span>
          <h2>{combat.phase === "won" ? "BATTLE CLEAR" : "RUN OVER"}</h2>
          <p>{combat.phase === "won" ? "마지막 한 칸을 지배했습니다." : "HP가 모두 소진되었습니다."}</p>
          <button className="primary-button" type="button" onClick={onFinish}>{combat.phase === "won" ? "보상 확인" : "결과 보기"}</button>
        </div>
      )}
    </main>
  );
}

function RewardScreen({ run, options, onChoose, onInfo }: { run: RunProgress; options: RewardOptions; onChoose: (player: RunPlayer) => void; onInfo: (id: string) => void }) {
  const [removing, setRemoving] = useState(false);
  const hasRemovableEmoji = Object.keys(run.player.pool).some((id) =>
    canRemoveEmoji(run.player, id),
  );
  const emojiOptions = [
    { label: "CHARACTER REWARD", emojiId: options.characterEmojiId },
    { label: "COMMON REWARD", emojiId: options.commonEmojiId },
  ];
  return (
    <main className="center-screen reward-screen">
      <header className="screen-heading">
        <p className="eyebrow">BATTLE REWARD</p>
        <h1>하나를 선택하세요</h1>
        <p>선택한 결과는 이번 Run의 Emoji Pool에 영구 적용됩니다.</p>
      </header>
      {!removing ? (
        <section className="reward-grid">
          {emojiOptions.map((option) => {
            const emoji = EMOJIS[option.emojiId];
            return (
              <article key={option.label} className="reward-card">
                <span className={`reward-label rarity-${emoji.rarity}`}>{option.label} · {emoji.rarity === "common" ? "일반" : emoji.rarity === "uncommon" ? "고급" : "희귀"}</span>
                <button className="reward-info" type="button" onClick={() => onInfo(option.emojiId)}>
                  <span>{emoji.icon}</span><h2>{emoji.name}</h2><p>{emoji.description}</p>
                </button>
                <button className="primary-button" type="button" onClick={() => onChoose(addEmoji(run.player, option.emojiId))}>Pool에 추가</button>
              </article>
            );
          })}
          <article className="reward-card remove-card">
            <span className="reward-label">POOL CLEANUP</span>
            <div className="reward-info"><span>🗑️</span><h2>Emoji 제거</h2><p>{hasRemovableEmoji ? "현재 Pool에서 Emoji 한 개를 영구 제거합니다." : "Pool에는 최소 3개의 Emoji가 필요합니다."}</p></div>
            <button className="danger-button" type="button" disabled={!hasRemovableEmoji} onClick={() => setRemoving(true)}>{hasRemovableEmoji ? "제거할 Emoji 선택" : "제거할 수 없음"}</button>
          </article>
        </section>
      ) : (
        <section className="remove-panel">
          <button className="text-button" type="button" onClick={() => setRemoving(false)}>← 보상으로 돌아가기</button>
          <h2>제거할 Emoji 한 개를 선택하세요</h2>
          <div className="pool-grid large">
            {Object.entries(run.player.pool).map(([id, count]) => (
              <button key={id} className="pool-item" type="button" disabled={!canRemoveEmoji(run.player, id)} onClick={() => onChoose(removeEmoji(run.player, id))}>
                <span>{EMOJIS[id].icon}</span><strong>×{count}</strong><small>{EMOJIS[id].name}</small>
              </button>
            ))}
          </div>
          <p className="modal-copy">Emoji가 3개만 남은 경우 더 이상 제거할 수 없습니다.</p>
        </section>
      )}
      <OwnedPoolStrip pool={run.player.pool} onInfo={onInfo} title="CURRENT EMOJI POOL" />
    </main>
  );
}

function EventScreen({ run, event, outcome, onChoose, onContinue, onInfo }: { run: RunProgress; event: GameEventDefinition; outcome: string[]; onChoose: (choiceIndex: number, selectedIds: string[]) => void; onContinue: () => void; onInfo: (emojiId: string) => void }) {
  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const choice = pendingChoice === null ? null : event.choices[pendingChoice];
  const selectableIds = choice ? selectableEventEmojiIds(run, choice) : [];
  const selectionMinimum = choice?.selection ? (choice.selection.minCount ?? choice.selection.count) : 0;
  const choose = (choiceIndex: number) => {
    const selectedChoice = event.choices[choiceIndex];
    if (!canChooseEventChoice(run, selectedChoice)) return;
    if (!selectedChoice.selection) onChoose(choiceIndex, []);
    else {
      setPendingChoice(choiceIndex);
      setSelectedIds([]);
    }
  };
  const toggleEmoji = (emojiId: string) => {
    if (!choice?.selection) return;
    setSelectedIds((current) => current.includes(emojiId)
      ? current.filter((id) => id !== emojiId)
      : current.length < choice.selection!.count ? [...current, emojiId] : current);
  };
  return (
    <main className="center-screen event-screen">
      <section className="story-card">
        <p className="eyebrow">MYSTERY EVENT</p>
        <span className="story-icon">{event.icon}</span>
        <h1>{event.title}</h1>
        <p className="story-copy">{event.content}</p>
        {outcome.length === 0 && pendingChoice === null ? (
          <div className="event-choices">
            {event.choices.map((eventChoice, index) => (
              <button key={eventChoice.id} type="button" disabled={!canChooseEventChoice(run, eventChoice)} onClick={() => choose(index)}>
                <strong>{eventChoice.label}</strong><span>{eventChoice.hint}</span>
                {!canChooseEventChoice(run, eventChoice) && <small>조건에 맞는 Emoji가 부족합니다.</small>}
              </button>
            ))}
          </div>
        ) : outcome.length === 0 && choice?.selection ? (
          <div className="event-pool-select">
            <button className="text-button" type="button" onClick={() => setPendingChoice(null)}>← 선택지로 돌아가기</button>
            <h2>{choice.label}</h2>
            <p>{choice.hint}</p>
            <strong>{selectionMinimum === choice.selection.count ? `${choice.selection.count}종` : `${selectionMinimum}~${choice.selection.count}종`} 선택 · {selectedIds.length}/{choice.selection.count}</strong>
            <div className="pool-grid large event-pool-grid">
              {selectableIds.map((id) => {
                const emoji = EMOJIS[id];
                const selected = selectedIds.includes(id);
                return (
                  <button key={id} className={`pool-item ${selected ? "selected" : ""}`} type="button" aria-pressed={selected} onClick={() => toggleEmoji(id)}>
                    <span>{emoji.icon}</span><strong>×{run.player.pool[id]}</strong><small>{emoji.name}</small>
                    <small>{emoji.rarity === "common" ? "일반" : emoji.rarity === "uncommon" ? "고급" : "희귀"} · {emoji.tags.slice(0, 2).join(", ") || "태그 없음"}</small>
                  </button>
                );
              })}
            </div>
            <button className="primary-button wide" type="button" disabled={selectedIds.length < selectionMinimum || selectedIds.length > choice.selection.count} onClick={() => onChoose(pendingChoice!, selectedIds)}>이 선택으로 확정</button>
          </div>
        ) : (
          <div className="event-outcome">
            {outcome.map((message) => <p key={message}>{message}</p>)}
            <button className="primary-button wide" type="button" onClick={onContinue}>계속하기</button>
          </div>
        )}
      </section>
      <OwnedPoolStrip pool={run.player.pool} onInfo={onInfo} title="CURRENT EMOJI POOL" />
    </main>
  );
}

function RestScreen({ run, healed, onContinue }: { run: RunProgress; healed: number; onContinue: () => void }) {
  const [animating, setAnimating] = useState(true);
  const [shownHp, setShownHp] = useState(() => Math.max(0, run.player.hp - healed));

  useEffect(() => {
    setAnimating(true);
    setShownHp(Math.max(0, run.player.hp - healed));
    const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const healTimer = window.setTimeout(() => setShownHp(run.player.hp), reducedMotion ? 0 : 650);
    const finishTimer = window.setTimeout(() => setAnimating(false), reducedMotion ? 0 : 1_450);
    return () => {
      window.clearTimeout(healTimer);
      window.clearTimeout(finishTimer);
    };
  }, [healed, run.player.hp]);

  return (
    <main className={`center-screen rest-screen ${animating ? "rest-animating" : ""}`}>
      <section className="story-card">
        <p className="eyebrow">REST AREA</p>
        <span className="story-icon campfire">🔥</span>
        <h1>잠시 쉬어갑니다</h1>
        <p className="story-copy">따뜻한 모닥불 앞에서 다음 Bingo를 준비했습니다.</p>
        <div className="rest-result"><strong>HP +{healed}</strong><HpBar hp={shownHp} maxHp={run.player.maxHp} tone="player" /></div>
        <button className="primary-button wide" type="button" onClick={onContinue}>다음 Map으로</button>
      </section>
    </main>
  );
}

function ResultScreen({ result, onRestart, onInfo }: { result: ResultState; onRestart: () => void; onInfo: (id: string) => void }) {
  const seconds = Math.floor(result.elapsedMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return (
    <main className={`center-screen result-screen ${result.cleared ? "clear" : "fail"}`}>
      <section className="result-card">
        <span className="result-icon">{result.cleared ? "🏆" : "💔"}</span>
        <p className="eyebrow">RUN RESULT</p>
        <h1>{result.cleared ? "BINGOJI CLEAR!" : "GAME OVER"}</h1>
        <p>{result.cleared ? "Stage 3의 Boss를 쓰러뜨렸습니다!" : `Stage ${result.stage} · Map ${result.map}에서 쓰러졌습니다.`}</p>
        <div className="result-stats">
          <div><small>TIME</small><strong>{minutes}:{remainingSeconds.toString().padStart(2, "0")}</strong></div>
          <div><small>LAST STAGE</small><strong>{result.stage} - {result.map}</strong></div>
          <div><small>POOL SIZE</small><strong>{Object.values(result.pool).reduce((a, b) => a + b, 0)}</strong></div>
        </div>
        <div className="final-pool">
          {Object.entries(result.pool).map(([id, count]) => <button key={id} type="button" onClick={() => onInfo(id)} aria-label={`${EMOJIS[id].name} 정보 보기`}>{EMOJIS[id].icon}<small>×{count}</small></button>)}
        </div>
        <button className="primary-button wide" type="button" onClick={onRestart}>새 Run 시작</button>
      </section>
    </main>
  );
}

export default function App() {
  const rngRef = useRef(new SeededRandom(Date.now()));
  const rng = rngRef.current;
  const multiplayerClientRef = useRef<MultiplayerRoomClient | null>(null);
  if (!multiplayerClientRef.current) multiplayerClientRef.current = new MultiplayerRoomClient();
  const multiplayerClient = multiplayerClientRef.current;
  const [screen, setScreen] = useState<Screen>("title");
  const [run, setRun] = useState<RunProgress | null>(null);
  const [candidates, setCandidates] = useState<MapCandidate[]>([]);
  const [combat, setCombat] = useState<CombatState | null>(null);
  const [reward, setReward] = useState<RewardOptions | null>(null);
  const [currentEvent, setCurrentEvent] = useState<GameEventDefinition | null>(null);
  const [eventOutcome, setEventOutcome] = useState<string[]>([]);
  const [restHealed, setRestHealed] = useState(0);
  const [result, setResult] = useState<ResultState | null>(null);
  const [infoEmoji, setInfoEmoji] = useState<string | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingCharacterId, setPendingCharacterId] = useState<string | null>(null);
  const [multiplayerDraft, setMultiplayerDraft] = useState<MultiplayerProfile>(emptyMultiplayerProfile);
  const [multiplayerAction, setMultiplayerAction] = useState<MultiplayerRoomAction | null>(null);
  const [multiplayerClientState, setMultiplayerClientState] = useState<MultiplayerClientState>(() => multiplayerClient.snapshot());

  useEffect(() => multiplayerClient.subscribe(setMultiplayerClientState), [multiplayerClient]);
  useEffect(() => () => multiplayerClient.destroy(), [multiplayerClient]);

  const runPoolPlayer = useMemo<RunPlayer | null>(() => {
    if (!run) return null;
    if (!combat) return run.player;
    return { ...run.player, hp: combat.player.hp, maxHp: combat.player.maxHp, pool: combat.player.pool };
  }, [combat, run]);

  if (CONTENT_ERRORS.length > 0) {
    return <main className="center-screen"><section className="error-card"><h1>콘텐츠 오류</h1>{CONTENT_ERRORS.map((error) => <p key={error}>{error}</p>)}</section></main>;
  }

  const chooseCharacter = (characterId: string) => {
    setPendingCharacterId(characterId);
    setScreen("difficulty");
  };

  const startRun = (difficulty: Difficulty) => {
    const characterId = pendingCharacterId ?? CHARACTERS[0].id;
    const nextRun = createRun(characterId, Date.now(), difficulty);
    const generated = generateRunMapCandidates(nextRun, rng);
    setRun(generated.run);
    setCandidates(generated.candidates);
    setCombat(null);
    setResult(null);
    setScreen("map");
  };

  const startBattle = (enteredRun: RunProgress, kind: EnemyKind) => {
    const cloneBattle = enteredRun.modifiers.some((modifier) => modifier.id === "player-clone-enemy");
    const enemy: EnemyDefinition = cloneBattle ? {
      id: "future_self_clone",
      icon: "🪞",
      name: "미래의 나",
      maxHp: enteredRun.player.maxHp,
      ability: "현재 캐릭터의 Emoji Pool을 그대로 사용합니다.",
      abilityId: "none",
      pool: { ...enteredRun.player.pool },
      stages: [enteredRun.stage],
      kind,
      ai: "nearest-line",
    } : pickEnemy(enteredRun.stage, kind, rng, enteredRun.lastEnemyId, enteredRun.currentMap);
    setRun({ ...enteredRun, lastEnemyId: enemy.id });
    setCombat(createCombat(enteredRun.player, enemy, rng, enteredRun.stage, enteredRun.modifiers, enteredRun.difficulty));
    setScreen("battle");
  };

  const selectMap = (map: MapCandidate) => {
    if (!run) return;
    const enteredRun = { ...enterMap(run, map), notices: [] };
    setRun(enteredRun);
    if (map.type === "battle") startBattle(enteredRun, "normal");
    else if (map.type === "elite") startBattle(enteredRun, "elite");
    else if (map.type === "boss") startBattle(enteredRun, "boss");
    else if (map.type === "question") {
      if (resolveQuestionMap(rng) === "battle") startBattle(enteredRun, "normal");
      else {
        const selectedEvent = pickEvent(enteredRun, rng);
        setRun({ ...enteredRun, seenEventIds: [...enteredRun.seenEventIds, selectedEvent.id] });
        setCurrentEvent(selectedEvent);
        setEventOutcome([]);
        setScreen("event");
      }
    } else {
      const rested = applyRest(enteredRun.player);
      const updatedRun = { ...enteredRun, player: rested.player };
      setRun(updatedRun);
      setRestHealed(rested.healed);
      setScreen("rest");
    }
  };

  const showResult = (cleared: boolean, sourceRun: RunProgress) => {
    setResult({
      cleared,
      stage: sourceRun.stage,
      map: sourceRun.currentMap || sourceRun.completedMaps,
      elapsedMs: Date.now() - sourceRun.startedAt,
      pool: { ...sourceRun.player.pool },
    });
    setScreen("result");
  };

  const advanceAfterMap = (sourceRun: RunProgress) => {
    const advanced = advanceEventTimers(completeCurrentMap(sourceRun), rng);
    const generated = generateRunMapCandidates(advanced, rng);
    setRun(generated.run);
    setCandidates(generated.candidates);
    setCurrentEvent(null);
    setCombat(null);
    setReward(null);
    setScreen("map");
  };

  const finishBattle = () => {
    if (!run || !combat) return;
    let syncedRun: RunProgress = {
      ...run,
      player: {
        ...run.player,
        hp: combat.player.hp,
        maxHp: combat.player.maxHp,
        pool: { ...combat.player.pool },
      },
    };
    if (combat.combatRules.eventEggPlaced) {
      syncedRun = {
        ...syncedRun,
        scheduledRewards: syncedRun.scheduledRewards.map((reward) => reward.id === "egg-hatch" ? { ...reward, triggered: true } : reward),
      };
    }
    if (combat.combatRules.eventBabyDestroyed) {
      syncedRun = {
        ...syncedRun,
        scheduledRewards: syncedRun.scheduledRewards.map((reward) => reward.id === "baby-return" ? { ...reward, triggered: true } : reward),
      };
    }
    if (combat.phase === "lost") {
      setRun(syncedRun);
      showResult(false, syncedRun);
      return;
    }
    const rareBoost = syncedRun.modifiers
      .filter((modifier) => modifier.id === "reward-rare-boost")
      .reduce((sum, modifier) => sum + (modifier.value ?? 0), 0);
    const processedRun = consumeBattleEventModifiers(syncedRun, true, rng);
    setRun(processedRun);
    if (syncedRun.stage === 3 && syncedRun.currentMap === 10 && syncedRun.currentMapType === "boss") {
      const settledRun = settleScheduledRewards(processedRun, rng);
      setRun(settledRun);
      showResult(true, settledRun);
      return;
    }
    setReward(createRewardOptions(processedRun.player, combat.enemyKind, rng, rareBoost));
    setScreen("reward");
  };

  const chooseReward = (player: RunPlayer) => {
    if (!run) return;
    advanceAfterMap({ ...run, player });
  };

  const chooseEvent = (choiceIndex: number, selectedIds: string[]) => {
    if (!run || !currentEvent) return;
    const outcome = resolveEventChoice(run, currentEvent.choices[choiceIndex], selectedIds, rng);
    const updatedRun = outcome.run;
    setRun(updatedRun);
    setEventOutcome(outcome.messages.length ? outcome.messages : ["아무 일도 일어나지 않았습니다."]);
    if (outcome.run.player.hp <= 0) showResult(false, updatedRun);
  };

  const resetToTitle = () => {
    rngRef.current = new SeededRandom(Date.now());
    setRun(null);
    setPendingCharacterId(null);
    setCombat(null);
    setResult(null);
    setMultiplayerAction(null);
    multiplayerClient.cancel();
    setScreen("title");
  };

  const prepareMultiplayerRoom = (action: MultiplayerRoomAction, profile: MultiplayerProfile) => {
    setMultiplayerDraft({ ...profile, pool: { ...profile.pool } });
    setMultiplayerAction(action);
    setScreen("multiplayer-room");
    if (action === "create") multiplayerClient.createRoom(profile);
    else multiplayerClient.cancel();
  };

  const leaveMultiplayerRoom = () => {
    multiplayerClient.leave();
    setMultiplayerAction(null);
    setScreen("multiplayer-profile");
  };

  const cancelMultiplayerRoom = () => {
    multiplayerClient.cancel();
    setMultiplayerAction(null);
    setScreen("multiplayer-profile");
  };

  const closeMultiplayerResult = () => {
    multiplayerClient.leave();
    setMultiplayerAction(null);
    setScreen("title");
  };

  return (
    <div className="app">
      {screen === "title" && <TitleScreen onStart={() => setScreen("mode")} onHelp={() => setHelpOpen(true)} />}
      {screen === "mode" && <ModeSelectScreen onSingle={() => setScreen("character")} onMultiplayer={() => setScreen("multiplayer-profile")} onCancel={() => setScreen("title")} multiplayerEnabled={isMultiplayerServerConfigured()} />}
      {screen === "character" && <CharacterScreen onStart={chooseCharacter} onCancel={() => setScreen("mode")} onInfo={setInfoEmoji} />}
      {screen === "difficulty" && pendingCharacterId && <DifficultyScreen characterId={pendingCharacterId} onStart={startRun} onCancel={() => setScreen("character")} />}
      {screen === "multiplayer-profile" && <MultiplayerProfileScreen draft={multiplayerDraft} onDraftChange={setMultiplayerDraft} onCancel={() => setScreen("mode")} onRoomAction={prepareMultiplayerRoom} />}
      {screen === "multiplayer-room" && multiplayerAction && (multiplayerClientState.match
        ? <MultiplayerBattleScreen clientState={multiplayerClientState} onPlace={(drawIndex, cellIndex) => multiplayerClient.placeEmoji(drawIndex, cellIndex)} onForfeit={() => multiplayerClient.forfeit()} onCloseResult={closeMultiplayerResult} onInfo={setInfoEmoji} />
        : <MultiplayerRoomScreen action={multiplayerAction} profile={multiplayerDraft} clientState={multiplayerClientState} onJoin={(roomCode) => multiplayerClient.joinRoom(roomCode, multiplayerDraft)} onReady={(ready) => multiplayerClient.setReady(ready)} onLeave={leaveMultiplayerRoom} onCancel={cancelMultiplayerRoom} onClearError={() => multiplayerClient.clearError()} />)}
      {screen === "map" && run && <MapScreen run={run} candidates={candidates} onSelect={selectMap} onInfo={setInfoEmoji} onClaimEventReward={(emojiId) => setRun((current) => current ? claimPendingEventReward(current, emojiId) : current)} />}
      {screen === "battle" && run && combat && <BattleScreen run={run} combat={combat} rng={rng} onChange={setCombat} onFinish={finishBattle} onInfo={setInfoEmoji} onPool={() => setPoolOpen(true)} />}
      {screen === "reward" && run && reward && <RewardScreen run={run} options={reward} onChoose={chooseReward} onInfo={setInfoEmoji} />}
      {screen === "event" && run && currentEvent && <EventScreen run={run} event={currentEvent} outcome={eventOutcome} onChoose={chooseEvent} onContinue={() => advanceAfterMap(run)} onInfo={setInfoEmoji} />}
      {screen === "rest" && run && <RestScreen run={run} healed={restHealed} onContinue={() => advanceAfterMap(run)} />}
      {screen === "result" && result && <ResultScreen result={result} onRestart={resetToTitle} onInfo={setInfoEmoji} />}

      {poolOpen && runPoolPlayer && <PoolView player={runPoolPlayer} onClose={() => setPoolOpen(false)} />}
      {infoEmoji && <EmojiInfo emojiId={infoEmoji} onClose={() => setInfoEmoji(null)} />}
      {helpOpen && <HowTo onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
