import { useMemo, useState } from "react";
import { EmojiDetailContent } from "../components/EmojiDetailContent";
import { EMOJIS } from "../content/emojis";
import type { Pool, Rarity } from "../game/types";
import {
  PVP_EMOJI_IDS,
  PVP_MAX_COPIES_PER_EMOJI,
  PVP_MAX_RARE,
  PVP_MAX_UNCOMMON,
  PVP_POOL_MAX_SIZE,
  PVP_POOL_MIN_SIZE,
  validateMultiplayerProfile,
  type MultiplayerProfile,
} from "../shared";
import { AvatarEmojiPicker } from "./AvatarEmojiPicker";

export type MultiplayerRoomAction = "create" | "join";

const RARITIES: Array<{ id: "all" | Rarity; label: string }> = [
  { id: "all", label: "전체" },
  { id: "common", label: "일반" },
  { id: "uncommon", label: "고급" },
  { id: "rare", label: "희귀" },
];

const RARITY_LABEL: Record<Rarity, string> = {
  common: "일반",
  uncommon: "고급",
  rare: "희귀",
};

function addBlockedReason(pool: Pool, emojiId: string): string | null {
  const emoji = EMOJIS[emojiId];
  const validation = validateMultiplayerProfile({ avatar: "🙂", nickname: "검사용", pool });
  if (validation.pool.total >= PVP_POOL_MAX_SIZE) return `Pool은 최대 ${PVP_POOL_MAX_SIZE}개입니다.`;
  if ((pool[emojiId] ?? 0) >= PVP_MAX_COPIES_PER_EMOJI) return `같은 Emoji는 최대 ${PVP_MAX_COPIES_PER_EMOJI}개입니다.`;
  if (emoji.rarity === "uncommon" && validation.pool.rarityCounts.uncommon >= PVP_MAX_UNCOMMON) return `고급 Emoji는 최대 ${PVP_MAX_UNCOMMON}개입니다.`;
  if (emoji.rarity === "rare" && validation.pool.rarityCounts.rare >= PVP_MAX_RARE) return `희귀 Emoji는 최대 ${PVP_MAX_RARE}개입니다.`;
  return null;
}

export function MultiplayerProfileScreen({
  draft,
  onDraftChange,
  onCancel,
  onRoomAction,
}: {
  draft: MultiplayerProfile;
  onDraftChange: (profile: MultiplayerProfile) => void;
  onCancel: () => void;
  onRoomAction: (action: MultiplayerRoomAction, profile: MultiplayerProfile) => void;
}) {
  const [filter, setFilter] = useState<"all" | Rarity>("all");
  const [selectedEmojiId, setSelectedEmojiId] = useState(PVP_EMOJI_IDS[0]);
  const [notice, setNotice] = useState("");
  const validation = validateMultiplayerProfile(draft);
  const visibleEmojiIds = useMemo(
    () => PVP_EMOJI_IDS.filter((id) => filter === "all" || EMOJIS[id].rarity === filter),
    [filter],
  );

  const updatePool = (pool: Pool) => {
    onDraftChange({ ...draft, pool });
    setNotice("");
  };

  const addEmoji = (emojiId: string) => {
    const reason = addBlockedReason(draft.pool, emojiId);
    if (reason) {
      setNotice(reason);
      return;
    }
    updatePool({ ...draft.pool, [emojiId]: (draft.pool[emojiId] ?? 0) + 1 });
  };

  const removeEmoji = (emojiId: string) => {
    const count = draft.pool[emojiId] ?? 0;
    if (count <= 0) return;
    const pool = { ...draft.pool, [emojiId]: count - 1 };
    if (pool[emojiId] <= 0) delete pool[emojiId];
    updatePool(pool);
  };

  const clearPool = () => {
    if (validation.pool.total <= 0) return;
    onDraftChange({ ...draft, pool: {} });
    setNotice("Pool을 모두 비웠습니다.");
  };

  const submit = (action: MultiplayerRoomAction) => {
    if (!validation.valid) return;
    onRoomAction(action, {
      avatar: draft.avatar,
      nickname: validation.normalizedNickname,
      pool: { ...draft.pool },
    });
  };

  const messages = [...new Set([
    ...validation.errors.map((error) => error.message),
    ...validation.pool.errors.map((error) => error.message),
  ])];

  return (
    <main className="center-screen multiplayer-profile-screen">
      <header className="screen-heading compact">
        <p className="eyebrow">BUILD YOUR PVP PROFILE</p>
        <h1>멀티플레이 설정</h1>
        <p>Avatar와 닉네임을 정하고 10~15개의 Emoji로 Pool을 만드세요.</p>
      </header>

      <section className="multiplayer-profile-panel" aria-label="플레이어 프로필">
        <AvatarEmojiPicker
          value={draft.avatar}
          onChange={(avatar) => onDraftChange({ ...draft, avatar })}
        />
        <div className="profile-fields">
          <label htmlFor="multiplayer-nickname">닉네임 <small>2~12자</small></label>
          <input
            id="multiplayer-nickname"
            value={draft.nickname}
            maxLength={12}
            placeholder="닉네임 입력"
            autoComplete="off"
            onChange={(event) => onDraftChange({ ...draft, nickname: event.target.value })}
          />
          <strong>AVATAR EMOJI</strong>
          <p className="avatar-picker-help">왼쪽의 프로필 Emoji를 눌러 전체 Emoji 중에서 선택하세요.</p>
        </div>
      </section>

      <section className="pool-builder" aria-label="PvP Emoji Pool 편집">
        <header className="pool-builder-heading">
          <div><p className="eyebrow">EMOJI CATALOG</p><h2>Pool 만들기</h2></div>
          <div className={`pool-total ${validation.pool.total >= PVP_POOL_MIN_SIZE && validation.pool.total <= PVP_POOL_MAX_SIZE ? "valid" : ""}`}>
            <strong>{validation.pool.total}</strong><span>/ {PVP_POOL_MAX_SIZE}</span>
          </div>
        </header>

        <div className="pvp-pool-workspace">
          <section className="pvp-catalog-panel" aria-label="Emoji 카탈로그">
            <div className="rarity-filter" aria-label="Emoji 등급 필터">
              {RARITIES.map((rarity) => (
                <button key={rarity.id} type="button" aria-pressed={filter === rarity.id} onClick={() => setFilter(rarity.id)}>{rarity.label}</button>
              ))}
            </div>

            <div className="pvp-emoji-catalog" aria-label="선택 가능한 Emoji 목록">
              {visibleEmojiIds.map((emojiId) => {
                const emoji = EMOJIS[emojiId];
                const count = draft.pool[emojiId] ?? 0;
                return (
                  <button
                    key={emojiId}
                    type="button"
                    className={`pvp-emoji-card rarity-${emoji.rarity} ${selectedEmojiId === emojiId ? "selected" : ""}`}
                    aria-label={`${emoji.name} 정보 보기, Pool ${count}/${PVP_MAX_COPIES_PER_EMOJI}`}
                    aria-pressed={selectedEmojiId === emojiId}
                    onClick={() => {
                      setSelectedEmojiId(emojiId);
                      setNotice("");
                    }}
                  >
                    <span>{emoji.icon}</span><strong>{emoji.name}</strong><small>{RARITY_LABEL[emoji.rarity]} · {count}/{PVP_MAX_COPIES_PER_EMOJI}</small>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="pvp-pool-sidebar">
            <section className="pvp-selected-detail" aria-label="선택한 Emoji 정보">
              <div className="copy-counter"><strong>{draft.pool[selectedEmojiId] ?? 0}</strong><span>/ {PVP_MAX_COPIES_PER_EMOJI} IN POOL</span></div>
              <EmojiDetailContent emojiId={selectedEmojiId} />
              <div className="selected-detail-actions">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={(draft.pool[selectedEmojiId] ?? 0) <= 0}
                  onClick={() => removeEmoji(selectedEmojiId)}
                >제거</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={addBlockedReason(draft.pool, selectedEmojiId) !== null}
                  title={addBlockedReason(draft.pool, selectedEmojiId) ?? undefined}
                  onClick={() => addEmoji(selectedEmojiId)}
                >추가</button>
              </div>
            </section>

            <section className="selected-pvp-pool" aria-label="현재 선택한 Pool">
              <div className="selected-pool-heading">
                <div><p className="eyebrow">YOUR POOL</p><h2>현재 Pool</h2></div>
                <button className="pool-reset-button" type="button" disabled={validation.pool.total <= 0} onClick={clearPool}>전체 초기화</button>
              </div>
              <div className="rarity-counts">
                <span>일반 {validation.pool.rarityCounts.common}</span>
                <span>고급 {validation.pool.rarityCounts.uncommon}/{PVP_MAX_UNCOMMON}</span>
                <span>희귀 {validation.pool.rarityCounts.rare}/{PVP_MAX_RARE}</span>
              </div>
              {Object.keys(draft.pool).length > 0 ? (
                <div className="selected-pool-grid">
                  {Object.entries(draft.pool).map(([emojiId, count]) => (
                    <button
                      key={emojiId}
                      type="button"
                      aria-pressed={selectedEmojiId === emojiId}
                      onClick={() => setSelectedEmojiId(emojiId)}
                      aria-label={`${EMOJIS[emojiId].name} 정보 보기, Pool ${count}개`}
                    >
                      <span>{EMOJIS[emojiId].icon}</span><strong>×{count}</strong><small>{EMOJIS[emojiId].name}</small>
                    </button>
                  ))}
                </div>
              ) : <p className="empty-pool-copy">카탈로그에서 Emoji 정보를 확인한 뒤 추가하세요.</p>}
            </section>
          </div>
        </div>

        <div className="profile-validation" aria-live="polite">
          {notice && <p className="limit-notice">{notice}</p>}
          {!validation.valid && messages.map((message) => <p key={message}>{message}</p>)}
          {validation.valid && <p className="valid-profile">✓ 대전에 사용할 프로필과 Pool이 준비되었습니다.</p>}
        </div>

        <div className="multiplayer-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>← 모드 선택</button>
          <button className="primary-button" type="button" disabled={!validation.valid} onClick={() => submit("create")}>방 만들기</button>
          <button className="primary-button" type="button" disabled={!validation.valid} onClick={() => submit("join")}>방 참가</button>
        </div>
      </section>
    </main>
  );
}

export function emptyMultiplayerProfile(): MultiplayerProfile {
  return { avatar: "", nickname: "", pool: {} };
}
