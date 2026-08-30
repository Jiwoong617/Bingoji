import { useState } from "react";
import { isRoomCode, type MultiplayerProfile, type RoomParticipantSnapshot } from "../shared";
import type { MultiplayerClientState } from "./client";
import type { MultiplayerRoomAction } from "./ProfileScreen";

function ParticipantCard({ participant, mine }: { participant: RoomParticipantSnapshot | null; mine: boolean }) {
  if (!participant) {
    return (
      <article className="room-player-card empty" aria-label="빈 참가자 자리">
        <span className="room-player-avatar">❔</span>
        <h2>상대 기다리는 중</h2>
        <p>방 코드를 공유해 초대하세요.</p>
      </article>
    );
  }
  return (
    <article className={`room-player-card ${mine ? "mine" : "opponent"}`} aria-label={`${mine ? "내" : "상대"} 플레이어 정보`}>
      <span className="room-seat-label">{mine ? "YOU" : participant.seat.toUpperCase()}</span>
      <span className="room-player-avatar">{participant.avatar}</span>
      <h2>{participant.nickname}</h2>
      <p>POOL {participant.poolSize}</p>
      <div className="room-player-state">
        <span className={participant.connected ? "online" : "offline"}>{participant.connected ? "● 연결됨" : "○ 재접속 중"}</span>
        <strong className={participant.ready ? "ready" : "waiting"}>{participant.ready ? "READY" : "WAITING"}</strong>
      </div>
    </article>
  );
}

export function MultiplayerRoomScreen({
  action,
  profile,
  clientState,
  onJoin,
  onReady,
  onLeave,
  onCancel,
  onClearError,
}: {
  action: MultiplayerRoomAction;
  profile: MultiplayerProfile;
  clientState: MultiplayerClientState;
  onJoin: (roomCode: string) => void;
  onReady: (ready: boolean) => void;
  onLeave: () => void;
  onCancel: () => void;
  onClearError: () => void;
}) {
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [copied, setCopied] = useState(false);
  const room = clientState.room;
  const myParticipant = clientState.seat === "host" ? room?.host : room?.guest;
  const opponent = clientState.seat === "host" ? room?.guest : room?.host;
  const normalizedCode = roomCodeInput.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/gu, "").slice(0, 6);

  const copyRoomCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  if (!room && action === "join") {
    return (
      <main className="center-screen room-entry-screen">
        <section className="room-code-entry">
          <p className="eyebrow">JOIN 1:1 MATCH</p>
          <span className="entry-profile-avatar">{profile.avatar}</span>
          <h1>방 참가</h1>
          <p>{profile.nickname} · POOL {Object.values(profile.pool).reduce((sum, count) => sum + count, 0)}</p>
          <label htmlFor="room-code">6자리 방 코드</label>
          <input
            id="room-code"
            value={normalizedCode}
            placeholder="ABC234"
            autoComplete="off"
            inputMode="text"
            onChange={(event) => setRoomCodeInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && isRoomCode(normalizedCode) && clientState.connection !== "connecting") onJoin(normalizedCode);
            }}
          />
          <button className="primary-button wide" type="button" disabled={!isRoomCode(normalizedCode) || clientState.connection === "connecting"} onClick={() => onJoin(normalizedCode)}>
            {clientState.connection === "connecting" ? "방 찾는 중…" : "참가하기"}
          </button>
          <button className="ghost-button wide" type="button" onClick={onCancel}>← 프로필로 돌아가기</button>
        </section>
        {clientState.error && (
          <section className="room-error-popup" role="alertdialog" aria-labelledby="room-error-title">
            <span>⚠️</span><h2 id="room-error-title">방에 참가할 수 없습니다</h2><p>{clientState.error.message}</p>
            <button className="primary-button" type="button" onClick={onClearError}>확인</button>
          </section>
        )}
      </main>
    );
  }

  if (!room) {
    return (
      <main className="center-screen room-entry-screen">
        <section className="room-code-entry connecting-card">
          <span className="connection-spinner" aria-hidden="true">⚔️</span>
          <p className="eyebrow">CREATING ROOM</p>
          <h1>{clientState.connection === "error" ? "연결 실패" : "방을 만들고 있습니다"}</h1>
          <p>{clientState.error?.message ?? "무료 Multiplayer Server와 연결하는 중입니다."}</p>
          <button className="ghost-button wide" type="button" onClick={onCancel}>취소</button>
        </section>
      </main>
    );
  }

  return (
    <main className="center-screen multiplayer-room-screen">
      <header className="room-header">
        <div>
          <p className="eyebrow">PRIVATE 1:1 ROOM</p>
          <h1>대기방</h1>
        </div>
        <button className="room-code-display" type="button" onClick={copyRoomCode} aria-label={`방 코드 ${room.roomCode} 복사`}>
          <small>ROOM CODE</small><strong>{room.roomCode}</strong><span>{copied ? "복사됨!" : "눌러서 복사"}</span>
        </button>
      </header>

      <section className="room-versus" aria-label="대기방 참가자">
        <ParticipantCard participant={myParticipant ?? null} mine />
        <div className="versus-mark">VS</div>
        <ParticipantCard participant={opponent ?? null} mine={false} />
      </section>

      <section className="room-status-panel" aria-live="polite">
        {clientState.match ? (
          <><span>⚔️</span><strong>대전이 시작되었습니다.</strong><p>다음 전투 화면을 불러오는 중입니다.</p></>
        ) : opponent ? (
          <><span>{myParticipant?.ready && opponent.ready ? "⚔️" : "✅"}</span><strong>{myParticipant?.ready ? "상대의 준비를 기다리는 중" : "두 플레이어가 준비하면 시작합니다."}</strong><p>상대의 정확한 Pool 구성은 결과 화면에서 공개됩니다.</p></>
        ) : (
          <><span>📨</span><strong>상대를 초대하세요.</strong><p>위 방 코드를 전달하면 상대가 참가할 수 있습니다.</p></>
        )}
      </section>

      <div className="room-actions">
        <button className="danger-button" type="button" onClick={onLeave}>방 나가기</button>
        <button className={myParticipant?.ready ? "ghost-button" : "primary-button"} type="button" disabled={!opponent || Boolean(clientState.match)} onClick={() => onReady(!myParticipant?.ready)}>
          {myParticipant?.ready ? "준비 취소" : "준비"}
        </button>
      </div>

      {clientState.connection === "reconnecting" && (
        <div className="reconnect-overlay" role="status"><span>🔄</span><strong>Server에 재접속 중…</strong><p>30초 동안 대전 자리를 유지합니다.</p></div>
      )}
      {clientState.error && clientState.connection !== "reconnecting" && (
        <section className="room-error-popup" role="alertdialog" aria-labelledby="room-error-title">
          <span>⚠️</span><h2 id="room-error-title">연결 안내</h2><p>{clientState.error.message}</p>
          <button className="primary-button" type="button" onClick={onClearError}>확인</button>
        </section>
      )}
    </main>
  );
}
