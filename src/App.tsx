import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CHARACTERS, EMOJIS, MAP_META, validateContent } from "./content/data";
import { STATUS_DEFINITIONS } from "./content/statuses";
import {
  createCombat,
  createEnemyIntent,
  getEnemyAbilityIndicators,
  getCombatantDerivedStats,
  performEnemyTurn,
  playerPlace,
  selectCombatCell,
} from "./game/combat";
import { SeededRandom } from "./game/rng";
import {
  addEmoji,
  applyEventChoice,
  applyRest,
  canRemoveEmoji,
  completeCurrentMap,
  createRewardOptions,
  createRun,
  enterMap,
  generateMapCandidates,
  pickEnemy,
  pickEvent,
  removeEmoji,
  resolveQuestionMap,
} from "./game/run";
import type {
  CombatState,
  BingoEffect,
  EnemyKind,
  EnemyIntent,
  EffectEvent,
  GameEventDefinition,
  MapCandidate,
  PlaceEffect,
  ResultState,
  RunPlayer,
  RunProgress,
  StatusState,
  StatusId,
} from "./game/types";

type Screen =
  | "title"
  | "character"
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

function relatedStatuses(effects: Array<BingoEffect | PlaceEffect>): StatusId[] {
  const result = new Set<StatusId>();
  const visit = (effect: BingoEffect | PlaceEffect) => {
    if (effect.type === "shield") result.add("shield");
    else if (effect.type === "status") result.add(effect.statusId);
    else if (effect.type === "cleanse") effect.statuses.forEach((status) => result.add(status));
    else if (effect.type === "consume-status-damage") result.add(effect.statusId);
    else if (effect.type === "trigger-poison") result.add("poison");
    else if (effect.type === "lowest-resource") effect.resources.forEach((resource) => result.add(resource.statusId));
    else if (effect.type === "post-if-no-crit") { result.add("luck"); result.add("shield"); }
    else if (effect.type === "coin") result.add("shield");
    else if (effect.type === "slot") result.add("luck");
    else if (effect.type === "dice" && effect.otherwiseShield) { result.add("shield"); result.add("luck"); }
    else if (effect.type === "heal" && effect.overflowToShield) result.add("shield");
    else if (effect.type === "random") effect.options.flat().forEach(visit);
  };
  effects.forEach(visit);
  return [...result];
}

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

function Modal({ title, onClose, children, layout = "center", cardClassName = "" }: { title: string; onClose: () => void; children: React.ReactNode; layout?: "center" | "top"; cardClassName?: string }) {
  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  return (
    <div className={`modal-backdrop modal-${layout}`} role="presentation" onMouseDown={onClose}>
      <section
        className={`modal-card ${cardClassName}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function EmojiDetailContent({ emojiId }: { emojiId: string }) {
  const emoji = EMOJIS[emojiId];
  const abilityLabel = [
    emoji.onPlace?.length ? "PLACEMENT" : null,
    emoji.onBingo.length ? "BINGO" : null,
    emoji.whileOwned ? "OWNED" : null,
  ].filter(Boolean).join(" · ") + " EFFECT";
  const rarityLabel = emoji.rarity === "common" ? "일반" : emoji.rarity === "uncommon" ? "고급" : "희귀";
  const statusIds = relatedStatuses([...(emoji.onPlace ?? []), ...emoji.onBingo]);
  return (
    <div className="emoji-detail">
      <span className="emoji-detail-icon">{emoji.icon}</span>
      <div>
        <p className="eyebrow">{abilityLabel}</p>
        <h3>{emoji.name}</h3>
        <p>{emoji.description}</p>
        <div className="emoji-meta"><span>{rarityLabel}</span>{emoji.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
        {statusIds.length > 0 && <section className="emoji-status-list"><strong>관련 BUFF / DEBUFF</strong>{statusIds.map((statusId) => { const status = STATUS_DEFINITIONS[statusId]; return <div key={statusId}><span>{status.icon}</span><p><b>{status.name}</b><small>{status.description}</small></p></div>; })}</section>}
      </div>
    </div>
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

function CharacterScreen({ onStart, onCancel, onInfo }: { onStart: (id: string) => void; onCancel: () => void; onInfo: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState(CHARACTERS[0].id);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const dragged = useRef(false);
  const character = CHARACTERS.find((item) => item.id === selectedId) ?? CHARACTERS[0];
  const selectedIndex = CHARACTERS.findIndex((item) => item.id === character.id);
  const ability = splitAbility(character.ability);
  const moveSelection = (direction: number) => {
    const nextIndex = (selectedIndex + direction + CHARACTERS.length) % CHARACTERS.length;
    setSelectedId(CHARACTERS[nextIndex].id);
  };
  return (
    <main className="center-screen character-screen">
      <header className="screen-heading">
        <p className="eyebrow">CHOOSE YOUR PLAYER</p>
        <h1>캐릭터 선택</h1>
      </header>
      <section className="character-carousel" aria-label="플레이어블 캐릭터 캐러셀">
        <div
          className="carousel-track"
          role="listbox"
          aria-label="플레이어블 캐릭터 목록"
          style={{ "--carousel-drag": `${dragOffset}px` } as CSSProperties}
          onPointerDown={(event) => {
            dragStartX.current = event.clientX;
            dragged.current = false;
            setDragOffset(0);
          }}
          onPointerMove={(event) => {
            if (dragStartX.current === null) return;
            const distance = event.clientX - dragStartX.current;
            if (Math.abs(distance) > 8) {
              dragged.current = true;
              if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.setPointerCapture?.(event.pointerId);
            }
            setDragOffset(Math.max(-96, Math.min(96, distance)));
          }}
          onPointerUp={(event) => {
            if (dragStartX.current === null) return;
            const distance = event.clientX - dragStartX.current;
            if (Math.abs(distance) >= 45) moveSelection(distance > 0 ? -1 : 1);
            dragStartX.current = null;
            setDragOffset(0);
            if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
            if (dragged.current) window.setTimeout(() => { dragged.current = false; }, 0);
          }}
          onPointerCancel={() => { dragStartX.current = null; dragged.current = false; setDragOffset(0); }}
        >
          {[-2, -1, 0, 1, 2].map((offset) => {
            const item = CHARACTERS[(selectedIndex + offset + CHARACTERS.length) % CHARACTERS.length];
            return (
              <article
                key={item.id}
                className={`character-card character-slide offset-${offset < 0 ? `m${Math.abs(offset)}` : `p${offset}`} ${offset === 0 ? "selected" : ""}`}
                role="option"
                aria-selected={offset === 0}
                aria-label={`${item.name}, HP ${item.maxHp}`}
                tabIndex={0}
                onClick={() => { if (!dragged.current && offset !== 0) setSelectedId(item.id); }}
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

function MapScreen({ run, candidates, onSelect, onInfo }: { run: RunProgress; candidates: MapCandidate[]; onSelect: (map: MapCandidate) => void; onInfo: (id: string) => void }) {
  return (
    <main className="game-shell map-screen">
      <StageProgress stage={run.stage} position={run.completedMaps + 1} />
      <header className="screen-heading compact">
        <p className="eyebrow">CHOOSE YOUR PATH</p>
        <h1>다음 Map을 선택하세요</h1>
        <p>전체 경로는 보이지 않습니다. 지금의 선택에 집중하세요.</p>
      </header>
      <section className={`map-options ${candidates.length === 1 ? "single" : ""}`}>
        {candidates.map((map, index) => (
          <button key={map.id} className={`map-card map-${map.type}`} type="button" onClick={() => onSelect(map)}>
            <span className="map-side">{candidates.length === 1 ? "DESTINATION" : index === 0 ? "LEFT" : "RIGHT"}</span>
            <span className="map-icon">{map.icon}</span>
            <strong>{map.label}</strong>
            <small>{map.type === "question" ? "무슨 일이 일어날지 알 수 없습니다" : map.type === "rest" ? "최대 HP의 30% 회복" : map.type === "boss" ? "Stage의 마지막 전투" : "승리하면 Pool을 강화할 수 있습니다"}</small>
          </button>
        ))}
      </section>
      <section className="run-status">
        <div><span>{run.player.icon}</span><strong>{run.player.name}</strong></div>
        <HpBar hp={run.player.hp} maxHp={run.player.maxHp} tone="player" />
        <span className="pool-count">POOL {Object.values(run.player.pool).reduce((a, b) => a + b, 0)}</span>
      </section>
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
        <div className="draw-heading"><span>THIS TURN</span><strong>DRAW EMOJI</strong></div>
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

function EventScreen({ event, outcome, onChoose, onContinue }: { event: GameEventDefinition; outcome: string[]; onChoose: (choiceIndex: number) => void; onContinue: () => void }) {
  return (
    <main className="center-screen event-screen">
      <section className="story-card">
        <p className="eyebrow">MYSTERY EVENT</p>
        <span className="story-icon">{event.icon}</span>
        <h1>{event.title}</h1>
        <p className="story-copy">{event.content}</p>
        {outcome.length === 0 ? (
          <div className="event-choices">
            {event.choices.map((choice, index) => (
              <button key={choice.id} type="button" onClick={() => onChoose(index)}>
                <strong>{choice.label}</strong><span>{choice.hint}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="event-outcome">
            {outcome.map((message) => <p key={message}>{message}</p>)}
            <button className="primary-button wide" type="button" onClick={onContinue}>계속하기</button>
          </div>
        )}
      </section>
    </main>
  );
}

function RestScreen({ run, healed, onContinue }: { run: RunProgress; healed: number; onContinue: () => void }) {
  return (
    <main className="center-screen rest-screen">
      <section className="story-card">
        <p className="eyebrow">REST AREA</p>
        <span className="story-icon campfire">🔥</span>
        <h1>잠시 쉬어갑니다</h1>
        <p className="story-copy">따뜻한 모닥불 앞에서 다음 Bingo를 준비했습니다.</p>
        <div className="rest-result"><strong>HP +{healed}</strong><HpBar hp={run.player.hp} maxHp={run.player.maxHp} tone="player" /></div>
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

  const runPoolPlayer = useMemo<RunPlayer | null>(() => {
    if (!run) return null;
    if (!combat) return run.player;
    return { ...run.player, hp: combat.player.hp, maxHp: combat.player.maxHp, pool: combat.player.pool };
  }, [combat, run]);

  if (CONTENT_ERRORS.length > 0) {
    return <main className="center-screen"><section className="error-card"><h1>콘텐츠 오류</h1>{CONTENT_ERRORS.map((error) => <p key={error}>{error}</p>)}</section></main>;
  }

  const startRun = (characterId: string) => {
    const nextRun = createRun(characterId);
    setRun(nextRun);
    setCandidates(generateMapCandidates(0, rng));
    setCombat(null);
    setResult(null);
    setScreen("map");
  };

  const startBattle = (enteredRun: RunProgress, kind: EnemyKind) => {
    const enemy = pickEnemy(enteredRun.stage, kind, rng, enteredRun.lastEnemyId, enteredRun.currentMap);
    setRun({ ...enteredRun, lastEnemyId: enemy.id });
    setCombat(createCombat(enteredRun.player, enemy, rng, enteredRun.stage));
    setScreen("battle");
  };

  const selectMap = (map: MapCandidate) => {
    if (!run) return;
    const enteredRun = enterMap(run, map);
    setRun(enteredRun);
    if (map.type === "battle") startBattle(enteredRun, "normal");
    else if (map.type === "elite") startBattle(enteredRun, "elite");
    else if (map.type === "boss") startBattle(enteredRun, "boss");
    else if (map.type === "question") {
      if (resolveQuestionMap(rng) === "battle") startBattle(enteredRun, "normal");
      else {
        setCurrentEvent(pickEvent(rng));
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
    const advanced = completeCurrentMap(sourceRun);
    setRun(advanced);
    setCandidates(generateMapCandidates(advanced.completedMaps, rng));
    setCurrentEvent(null);
    setCombat(null);
    setReward(null);
    setScreen("map");
  };

  const finishBattle = () => {
    if (!run || !combat) return;
    const syncedRun: RunProgress = {
      ...run,
      player: {
        ...run.player,
        hp: combat.player.hp,
        maxHp: combat.player.maxHp,
        pool: { ...combat.player.pool },
      },
    };
    setRun(syncedRun);
    if (combat.phase === "lost") {
      showResult(false, syncedRun);
      return;
    }
    if (syncedRun.stage === 3 && syncedRun.currentMap === 10 && syncedRun.currentMapType === "boss") {
      showResult(true, syncedRun);
      return;
    }
    setReward(createRewardOptions(syncedRun.player, combat.enemyKind, rng));
    setScreen("reward");
  };

  const chooseReward = (player: RunPlayer) => {
    if (!run) return;
    advanceAfterMap({ ...run, player });
  };

  const chooseEvent = (choiceIndex: number) => {
    if (!run || !currentEvent) return;
    const outcome = applyEventChoice(run.player, currentEvent.choices[choiceIndex], rng);
    const updatedRun = { ...run, player: outcome.player };
    setRun(updatedRun);
    setEventOutcome(outcome.messages.length ? outcome.messages : ["아무 일도 일어나지 않았습니다."]);
    if (outcome.player.hp <= 0) showResult(false, updatedRun);
  };

  const resetToTitle = () => {
    rngRef.current = new SeededRandom(Date.now());
    setRun(null);
    setCombat(null);
    setResult(null);
    setScreen("title");
  };

  return (
    <div className="app">
      {screen === "title" && <TitleScreen onStart={() => setScreen("character")} onHelp={() => setHelpOpen(true)} />}
      {screen === "character" && <CharacterScreen onStart={startRun} onCancel={() => setScreen("title")} onInfo={setInfoEmoji} />}
      {screen === "map" && run && <MapScreen run={run} candidates={candidates} onSelect={selectMap} onInfo={setInfoEmoji} />}
      {screen === "battle" && run && combat && <BattleScreen run={run} combat={combat} rng={rng} onChange={setCombat} onFinish={finishBattle} onInfo={setInfoEmoji} onPool={() => setPoolOpen(true)} />}
      {screen === "reward" && run && reward && <RewardScreen run={run} options={reward} onChoose={chooseReward} onInfo={setInfoEmoji} />}
      {screen === "event" && run && currentEvent && <EventScreen event={currentEvent} outcome={eventOutcome} onChoose={chooseEvent} onContinue={() => advanceAfterMap(run)} />}
      {screen === "rest" && run && <RestScreen run={run} healed={restHealed} onContinue={() => advanceAfterMap(run)} />}
      {screen === "result" && result && <ResultScreen result={result} onRestart={resetToTitle} onInfo={setInfoEmoji} />}

      {poolOpen && runPoolPlayer && <PoolView player={runPoolPlayer} onClose={() => setPoolOpen(false)} />}
      {infoEmoji && <EmojiInfo emojiId={infoEmoji} onClose={() => setInfoEmoji(null)} />}
      {helpOpen && <HowTo onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
