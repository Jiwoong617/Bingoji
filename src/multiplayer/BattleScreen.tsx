import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { EmojiDetailContent } from "../components/EmojiDetailContent";
import { Modal } from "../components/Modal";
import { EMOJIS } from "../content/emojis";
import {
  PVP_BINGO_IMPACT_MS,
  PVP_BINGO_PRESENTATION_MS,
  PVP_STANDARD_IMPACT_MS,
  PVP_STANDARD_PRESENTATION_MS,
  PVP_TURN_TIMEOUT_MS,
  type Pool,
  PvpEffectEvent,
  PvpMatchResult,
  PvpMatchSnapshot,
  PvpPlayerSnapshot,
  PvpSeat,
} from "../shared";
import type { MultiplayerClientState } from "./client";

const PVP_INITIATIVE_NOTICE_MS = 2_200;

function otherSeat(seat: PvpSeat): PvpSeat {
  return seat === "host" ? "guest" : "host";
}

function PvpHpBar({ hp, maxHp, tone }: { hp: number; maxHp: number; tone: "player" | "enemy" }) {
  const ratio = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  return (
    <div className="hp-wrap" aria-label={`HP ${hp} / ${maxHp}`}>
      <div className="hp-track"><div className={`hp-fill hp-${tone}`} style={{ width: `${ratio}%` }} /></div>
      <strong>{hp} / {maxHp}</strong>
    </div>
  );
}

function PvpFighterPanel({
  player,
  mine,
  shownHp,
  impacts,
  impactActive,
}: {
  player: PvpPlayerSnapshot;
  mine: boolean;
  shownHp: number;
  impacts: PvpEffectEvent[];
  impactActive: boolean;
}) {
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const hasDamage = impacts.some((item) => item.kind === "damage");
  const hasHeal = impacts.some((item) => item.kind === "heal");

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
    <section className={`fighter-panel ${mine ? "player" : "enemy"} ${impactActive && hasDamage ? "taking-hit" : ""} ${impactActive && hasHeal ? "receiving-heal" : ""}`}>
      <span className="fighter-icon">{player.avatar}</span>
      <div className="fighter-copy">
        <div className="fighter-name"><span>{mine ? "YOU" : "OPPONENT"}</span><strong>{player.nickname}</strong></div>
        <div className="fighter-hp-line">
          <PvpHpBar hp={shownHp} maxHp={player.maxHp} tone={mine ? "player" : "enemy"} />
          {impactActive && impacts.length > 0 && (
            <div className="hp-deltas" aria-live="polite">
              {impacts.map((item) => <span key={item.eventId} className={item.kind}>{item.kind === "damage" ? "−" : "+"}{item.value ?? 0}</span>)}
            </div>
          )}
        </div>
        <div className="status-chips" aria-label={`${player.nickname} 상태`}>
          {player.statuses.map((status) => (
            <button
              key={status.statusId}
              className={`status-chip ${activeStatus === status.statusId ? "active" : ""}`}
              type="button"
              aria-label={`${status.name}: ${status.description}`}
              aria-expanded={activeStatus === status.statusId}
              onClick={(event) => { event.stopPropagation(); setActiveStatus((current) => current === status.statusId ? null : status.statusId); }}
            >
              <span>{status.icon}</span><strong>{status.value}</strong>{status.duration !== undefined && <small>{status.duration}T</small>}
              <span className="status-tooltip" role="tooltip"><b>{status.name}</b><em>{status.description}</em></span>
            </button>
          ))}
        </div>
        <p>{player.connected ? `POOL ${player.poolSize}` : "재접속을 기다리는 중…"}</p>
      </div>
    </section>
  );
}

function PvpPoolModal({ pool, onClose }: { pool: Pool; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState(Object.keys(pool)[0] ?? null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  return (
    <div className="modal-backdrop modal-top" role="presentation" onMouseDown={onClose}>
      <section className="modal-card pool-view-modal" role="dialog" aria-modal="true" aria-labelledby="pvp-pool-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header"><h2 id="pvp-pool-title">MY PVP POOL</h2><button className="icon-button" type="button" onClick={onClose} aria-label="닫기">✕</button></div>
        <div className="pool-grid pool-inventory">
          {Object.entries(pool).map(([emojiId, count]) => (
            <button key={emojiId} className={`pool-item ${selectedId === emojiId ? "selected" : ""}`} type="button" aria-pressed={selectedId === emojiId} onClick={() => setSelectedId(emojiId)}>
              <span>{EMOJIS[emojiId].icon}</span><strong>×{count}</strong><small>{EMOJIS[emojiId].name}</small>
            </button>
          ))}
        </div>
        <section className="pool-inline-detail">{selectedId && <EmojiDetailContent emojiId={selectedId} />}</section>
      </section>
    </div>
  );
}

function PvpEffectZone({
  match,
  events,
  mine,
  presenting,
}: {
  match: PvpMatchSnapshot;
  events: PvpEffectEvent[];
  mine: PvpSeat;
  presenting: boolean;
}) {
  if (!match.lastBingo && events.length === 0) {
    return <section className="effect-zone empty"><span>✨</span><p>완성된 Bingo 효과가 여기에 표시됩니다.</p></section>;
  }
  const ownerTone = match.lastBingo?.owner === mine ? "player" : "enemy";
  return (
    <section className={`effect-zone ${ownerTone} ${presenting ? "presenting" : ""}`}>
      {match.lastBingo && (
        <div className="bingo-summary">
          <strong>{match.lastBingo.multiplier > 1 ? `${match.lastBingo.multiplier}× MULTI BINGO!` : "BINGO!"}</strong>
          <span>{match.lastBingo.owner === mine ? "YOUR EFFECT" : "OPPONENT EFFECT"}</span>
          <div className="animated-bingo-lines">
            {match.lastBingo.lineIds.map((lineId, lineIndex) => (
              <p key={lineId}>
                {events.filter((event) => event.lineId === lineId).slice(0, 5).map((event, iconIndex) => (
                  <span key={`${event.eventId}-${iconIndex}`} className="bingo-icon-token" style={{ "--icon-index": iconIndex, "--line-index": lineIndex } as CSSProperties}>{event.icon}</span>
                ))}
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="effect-log" aria-live="polite">{events.slice(-6).map((event) => <span key={event.eventId}>{event.text}</span>)}</div>
      {presenting && (
        <div className="effect-projectiles" aria-hidden="true">
          {events.filter((event) => event.kind === "damage" || event.kind === "heal").map((event, index) => (
            <span key={event.eventId} className={`effect-projectile ${event.kind} target-${event.target === mine ? "player" : "enemy"}`} style={{ "--effect-index": index } as CSSProperties}>
              {event.kind === "damage" ? "💥" : "💚"}<b>{event.value}</b>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function PvpResultScreen({ result, mine, onInfo, onClose }: { result: PvpMatchResult; mine: PvpSeat; onInfo: (emojiId: string) => void; onClose: () => void }) {
  const opponentSeat = otherSeat(mine);
  const me = result.players[mine];
  const opponent = result.players[opponentSeat];
  const won = result.winnerSeat === mine;
  const draw = result.winnerSeat === null;
  const reason = result.reason === "hp" ? "HP 승부" : result.reason === "forfeit" ? "기권" : result.reason === "disconnect" ? "연결 종료" : "Server 종료";
  const elapsedSeconds = Math.floor(result.elapsedMs / 1_000);
  return (
    <main className={`center-screen pvp-result-screen ${won ? "win" : draw ? "draw" : "loss"}`}>
      <section className="pvp-result-card">
        <p className="eyebrow">PVP MATCH RESULT</p>
        <span className="result-icon">{won ? "🏆" : draw ? "🤝" : "💔"}</span>
        <h1>{won ? "VICTORY" : draw ? "DRAW" : "DEFEAT"}</h1>
        <p>{reason} · TURN {result.turns} · {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}</p>
        <section className="pvp-result-players">
          {[{ player: me, label: "YOU" }, { player: opponent, label: "OPPONENT" }].map(({ player, label }) => (
            <article key={player.seat}>
              <small>{label}</small><span>{player.avatar}</span><h2>{player.nickname}</h2><strong>HP {player.hp} / {player.maxHp}</strong>
              <div className="pvp-result-pool">
                {Object.entries(player.pool).map(([emojiId, count]) => (
                  <button key={emojiId} type="button" onClick={() => onInfo(emojiId)} aria-label={`${player.nickname}의 ${EMOJIS[emojiId].name} 정보 보기`}>
                    <span>{EMOJIS[emojiId].icon}</span><small>×{count}</small>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </section>
        <button className="primary-button wide" type="button" onClick={onClose}>메인 화면으로</button>
      </section>
    </main>
  );
}

export function MultiplayerBattleScreen({
  clientState,
  onPlace,
  onForfeit,
  onCloseResult,
  onInfo,
}: {
  clientState: MultiplayerClientState;
  onPlace: (drawIndex: number, cellIndex: number) => boolean;
  onForfeit: () => void;
  onCloseResult: () => void;
  onInfo: (emojiId: string) => void;
}) {
  const match = clientState.match!;
  const mine = match.privateState.seat;
  const opponentSeat = otherSeat(mine);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [presenting, setPresenting] = useState(false);
  const [forfeitConfirmOpen, setForfeitConfirmOpen] = useState(false);
  const [impactActive, setImpactActive] = useState(false);
  const [initiativeVisible, setInitiativeVisible] = useState(() => match.revision === 0 && match.turn === 1);
  const [resolvedBatchKey, setResolvedBatchKey] = useState("");
  const previousHp = useRef({ host: match.players.host.hp, guest: match.players.guest.hp });
  const cancelForfeitRef = useRef<HTMLButtonElement>(null);
  const [shownHp, setShownHp] = useState(previousHp.current);
  const batchKey = clientState.events.length > 0 ? `${match.revision}:${clientState.events.map((event) => event.eventId).join(",")}` : "";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => setSelectedCell(null), [match.revision, match.activeSeat]);

  useEffect(() => {
    if (!initiativeVisible) return;
    const timer = window.setTimeout(() => setInitiativeVisible(false), PVP_INITIATIVE_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [initiativeVisible]);

  useEffect(() => {
    const nextHp = { host: match.players.host.hp, guest: match.players.guest.hp };
    if (!batchKey || batchKey === resolvedBatchKey) {
      setShownHp(nextHp);
      previousHp.current = nextHp;
      return;
    }
    setShownHp(previousHp.current);
    setPresenting(true);
    setImpactActive(false);
    const hasBingo = Boolean(match.lastBingo);
    const impactTimer = window.setTimeout(() => {
      setShownHp(nextHp);
      setImpactActive(true);
    }, hasBingo ? PVP_BINGO_IMPACT_MS : PVP_STANDARD_IMPACT_MS);
    const finishTimer = window.setTimeout(() => {
      setPresenting(false);
      setImpactActive(false);
      setResolvedBatchKey(batchKey);
      previousHp.current = nextHp;
    }, hasBingo ? PVP_BINGO_PRESENTATION_MS : PVP_STANDARD_PRESENTATION_MS);
    return () => {
      window.clearTimeout(impactTimer);
      window.clearTimeout(finishTimer);
    };
  }, [batchKey, match.lastBingo, match.players.guest.hp, match.players.host.hp, resolvedBatchKey]);

  const impacts = useMemo(() => ({
    host: clientState.events.filter((event) => event.target === "host" && (event.kind === "damage" || event.kind === "heal")),
    guest: clientState.events.filter((event) => event.target === "guest" && (event.kind === "damage" || event.kind === "heal")),
  }), [clientState.events]);

  const resultReady = clientState.result && (!batchKey || resolvedBatchKey === batchKey);
  if (resultReady) return <PvpResultScreen result={clientState.result!} mine={mine} onInfo={onInfo} onClose={onCloseResult} />;

  const myTurn = match.activeSeat === mine && match.phase === "turn";
  const interactionLocked = !myTurn || presenting || clientState.placementPending || clientState.connection !== "connected";
  const serverNow = now + clientState.serverTimeOffsetMs;
  const decisionStartsAt = match.deadlineAt === null ? null : match.deadlineAt - PVP_TURN_TIMEOUT_MS;
  const remainingMs = match.deadlineAt === null || decisionStartsAt === null
    ? 0
    : Math.max(0, match.deadlineAt - Math.max(serverNow, decisionStartsAt));
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const timerRatio = Math.max(0, Math.min(100, remainingMs / PVP_TURN_TIMEOUT_MS * 100));
  const bingoCells = new Set(match.lastBingo?.cells.flat() ?? []);
  const bingoAfterimages = new Map<number, string>();
  match.lastBingo?.cells.forEach((line, lineIndex) => {
    line.forEach((cellIndex, iconIndex) => {
      const icon = match.lastBingo?.icons?.[lineIndex]?.[iconIndex];
      if (icon && !bingoAfterimages.has(cellIndex)) bingoAfterimages.set(cellIndex, icon);
    });
  });
  const opponentLastPlacement = match.lastPlacement?.seat === opponentSeat ? match.lastPlacement.cellIndex : null;
  const startingSeat = match.startingSeat ?? (match.turn === 1 ? match.activeSeat : null);
  const turnCopy = presenting ? "Bingo 효과 처리 중…" : clientState.placementPending ? "Server의 배치 승인을 기다리는 중…" : myTurn ? "빈칸을 고른 뒤 Emoji를 배치하세요" : "상대가 Emoji를 고르는 중…";

  return (
    <main className="game-shell battle-screen pvp-battle-screen" onClick={() => setSelectedCell(null)}>
      {initiativeVisible && startingSeat && (
        <div className={`initiative-notice ${startingSeat === mine ? "first" : "second"}`} role="status" aria-live="polite">
          <small>{startingSeat === mine ? "FIRST MOVE" : "SECOND MOVE"}</small>
          <strong>{startingSeat === mine ? "당신은 선공입니다" : "당신은 후공입니다"}</strong>
          <span>{startingSeat === mine ? "먼저 Emoji를 배치하세요." : "상대가 먼저 배치합니다."}</span>
        </div>
      )}
      <header className="pvp-match-header">
        <div><small>ROOM</small><strong>{clientState.room?.roomCode}</strong></div>
        <div className={`pvp-timer ${remainingSeconds <= 5 ? "urgent" : ""}`} aria-label={`배치 제한 시간 ${remainingSeconds}초`}>
          <span>TURN {match.turn} · {myTurn ? "YOUR TURN" : "OPPONENT TURN"}</span><strong>{remainingSeconds}</strong>
          <i><b style={{ width: `${timerRatio}%` }} /></i>
        </div>
        <button className="danger-button compact-forfeit" type="button" disabled={clientState.placementPending} onClick={(event) => { event.stopPropagation(); setForfeitConfirmOpen(true); }}>기권</button>
      </header>

      <section className="combatants-row" onClick={(event) => event.stopPropagation()}>
        <PvpFighterPanel player={match.players[opponentSeat]} mine={false} shownHp={shownHp[opponentSeat]} impacts={impacts[opponentSeat]} impactActive={impactActive} />
        <PvpFighterPanel player={match.players[mine]} mine shownHp={shownHp[mine]} impacts={impacts[mine]} impactActive={impactActive} />
      </section>

      <PvpEffectZone match={match} events={clientState.events} mine={mine} presenting={presenting} />

      <section className="board-section" onClick={(event) => event.stopPropagation()}>
        <div className="turn-banner"><span>REV {match.revision}</span><strong>{turnCopy}</strong></div>
        {presenting && match.lastBingo && <div className={`board-bingo-callout ${match.lastBingo.owner === mine ? "player" : "enemy"}`}><strong>{match.lastBingo.multiplier > 1 ? `${match.lastBingo.multiplier}× BINGO!` : "BINGO!"}</strong><span>{match.lastBingo.owner === mine ? "YOU" : "OPPONENT"}</span></div>}
        <div className={`bingo-board ${interactionLocked ? "locked" : ""}`} role="grid" aria-label="PvP 5 곱하기 5 Bingo Board">
          {match.board.map((cell, index) => {
            const selected = selectedCell === index;
            const bingo = presenting && bingoCells.has(index);
            const opponentPlaced = opponentLastPlacement === index;
            return (
              <button
                key={index}
                className={`board-cell ${cell ? `occupied ${cell.placedBy === mine ? "player" : "enemy"}` : "empty"} ${selected ? "selected" : ""} ${opponentPlaced ? "opponent-last-move" : ""} ${bingo ? `bingo-complete bingo-${match.lastBingo?.owner === mine ? "player" : "enemy"}` : ""}`}
                type="button"
                role="gridcell"
                aria-pressed={selected}
                aria-label={`${cell ? `${EMOJIS[cell.emojiId].name}, ${cell.placedBy === mine ? "내" : "상대"} 배치` : `${Math.floor(index / 5) + 1}행 ${index % 5 + 1}열 빈칸`}${opponentPlaced ? ", 상대가 방금 선택한 칸" : ""}`}
                onClick={() => {
                  if (cell) onInfo(cell.emojiId);
                  else if (!interactionLocked) setSelectedCell((current) => current === index ? null : index);
                }}
              >
                {cell ? <><span>{EMOJIS[cell.emojiId].icon}</span><i />{cell.remainingTurns && <b className="retention-badge">{cell.remainingTurns}T</b>}</> : bingo && bingoAfterimages.has(index) ? <span className="bingo-afterimage">{bingoAfterimages.get(index)}</span> : <span className="cell-plus">+</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="draw-section" onClick={(event) => event.stopPropagation()}>
        <div className="draw-heading"><span>{myTurn ? "THIS TURN" : "WAITING"}</span><strong>DRAW EMOJI</strong></div>
        <div className="draw-row">
          <button className="pool-button draw-pool-button" type="button" onClick={() => setPoolOpen(true)}><span>🎒</span><small>MY POOL</small></button>
          <div className="draw-cards">
            {myTurn ? match.privateState.draw.map((emojiId, drawIndex) => (
              <button
                key={`${match.turn}-${drawIndex}-${emojiId}`}
                className="draw-card"
                type="button"
                disabled={presenting || clientState.placementPending}
                style={{ "--draw-index": drawIndex } as CSSProperties}
                onClick={() => {
                  if (selectedCell === null) onInfo(emojiId);
                  else if (!interactionLocked && onPlace(drawIndex, selectedCell)) setSelectedCell(null);
                }}
              ><span>{EMOJIS[emojiId].icon}</span><strong>{EMOJIS[emojiId].name}</strong><small>{selectedCell === null ? "정보 보기" : "여기에 배치"}</small></button>
            )) : <div className="enemy-thinking-card">상대의 수…</div>}
          </div>
          <div className="trash"><span>🗑️</span><small>DISCARD</small></div>
        </div>
      </section>

      {poolOpen && <PvpPoolModal pool={match.privateState.pool} onClose={() => setPoolOpen(false)} />}
      {forfeitConfirmOpen && (
        <Modal title="기권하고 나가시겠습니까?" onClose={() => setForfeitConfirmOpen(false)} cardClassName="confirmation-modal" initialFocusRef={cancelForfeitRef}>
          <p className="confirmation-copy">기권하면 즉시 패배 처리되며 현재 대전으로 돌아올 수 없습니다.</p>
          <div className="confirmation-actions">
            <button ref={cancelForfeitRef} className="ghost-button" type="button" onClick={() => setForfeitConfirmOpen(false)}>취소</button>
            <button className="danger-button" type="button" onClick={() => { setForfeitConfirmOpen(false); onForfeit(); }}>기권</button>
          </div>
        </Modal>
      )}
      {clientState.connection === "reconnecting" && <div className="reconnect-overlay" role="status"><span>🔄</span><strong>Server에 재접속 중…</strong><p>Board 입력을 잠시 멈췄습니다.</p></div>}
      {clientState.error && <div className="pvp-inline-error" role="alert">{clientState.error.message}</div>}
    </main>
  );
}
