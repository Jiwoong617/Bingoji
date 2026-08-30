import { EMOJIS } from "../../content/emojis";
import type { Pool, Rarity } from "../../game/types";
import type { MultiplayerProfile } from "./types";

export type { MultiplayerProfile } from "./types";

export const PVP_POOL_MIN_SIZE = 10;
export const PVP_POOL_MAX_SIZE = 15;
export const PVP_MAX_COPIES_PER_EMOJI = 2;
export const PVP_MAX_UNCOMMON = 8;
export const PVP_MAX_RARE = 4;

export const PVP_EXCLUDED_EMOJI_IDS = ["event_egg", "event_baby"] as const;
const excludedEmojiIds = new Set<string>(PVP_EXCLUDED_EMOJI_IDS);

export const PVP_EMOJI_IDS = Object.values(EMOJIS)
  .filter((emoji) => !excludedEmojiIds.has(emoji.id))
  .map((emoji) => emoji.id);
const pvpEmojiIds = new Set(PVP_EMOJI_IDS);

export type PvpPoolErrorCode =
  | "pool-too-small"
  | "pool-too-large"
  | "invalid-copy-count"
  | "too-many-copies"
  | "unknown-emoji"
  | "excluded-emoji"
  | "too-many-uncommon"
  | "too-many-rare";

export interface PvpPoolValidationError {
  code: PvpPoolErrorCode;
  message: string;
  emojiId?: string;
}

export interface PvpPoolValidationResult {
  valid: boolean;
  total: number;
  rarityCounts: Record<Rarity, number>;
  errors: PvpPoolValidationError[];
}

export type PvpProfileErrorCode = "invalid-avatar" | "invalid-nickname" | "invalid-pool";

export interface PvpProfileValidationError {
  code: PvpProfileErrorCode;
  message: string;
}

export interface PvpProfileValidationResult {
  valid: boolean;
  normalizedNickname: string;
  pool: PvpPoolValidationResult;
  errors: PvpProfileValidationError[];
}

export function poolSize(pool: Pool): number {
  return Object.values(pool).reduce(
    (total, count) => total + (Number.isInteger(count) && count > 0 ? count : 0),
    0,
  );
}

export function validatePvpPool(pool: Pool): PvpPoolValidationResult {
  const errors: PvpPoolValidationError[] = [];
  const rarityCounts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0 };
  let total = 0;

  for (const [emojiId, count] of Object.entries(pool)) {
    if (!Number.isInteger(count) || count <= 0) {
      errors.push({
        code: "invalid-copy-count",
        emojiId,
        message: `${emojiId}의 사본 수는 1 이상의 정수여야 합니다.`,
      });
      continue;
    }

    total += count;
    if (excludedEmojiIds.has(emojiId)) {
      const emoji = EMOJIS[emojiId];
      errors.push({ code: "excluded-emoji", emojiId, message: `${emoji.name}은 PvP Pool에 넣을 수 없습니다.` });
      continue;
    }
    if (!pvpEmojiIds.has(emojiId)) {
      errors.push({ code: "unknown-emoji", emojiId, message: `알 수 없는 Emoji ID입니다: ${emojiId}` });
      continue;
    }
    const emoji = EMOJIS[emojiId];
    if (count > PVP_MAX_COPIES_PER_EMOJI) {
      errors.push({
        code: "too-many-copies",
        emojiId,
        message: `같은 Emoji는 최대 ${PVP_MAX_COPIES_PER_EMOJI}개까지 넣을 수 있습니다.`,
      });
    }
    rarityCounts[emoji.rarity] += count;
  }

  if (total < PVP_POOL_MIN_SIZE) {
    errors.push({ code: "pool-too-small", message: `Pool은 최소 ${PVP_POOL_MIN_SIZE}개여야 합니다.` });
  }
  if (total > PVP_POOL_MAX_SIZE) {
    errors.push({ code: "pool-too-large", message: `Pool은 최대 ${PVP_POOL_MAX_SIZE}개입니다.` });
  }
  if (rarityCounts.uncommon > PVP_MAX_UNCOMMON) {
    errors.push({ code: "too-many-uncommon", message: `고급 Emoji는 최대 ${PVP_MAX_UNCOMMON}개입니다.` });
  }
  if (rarityCounts.rare > PVP_MAX_RARE) {
    errors.push({ code: "too-many-rare", message: `희귀 Emoji는 최대 ${PVP_MAX_RARE}개입니다.` });
  }

  return { valid: errors.length === 0, total, rarityCounts, errors };
}

export function normalizeMultiplayerNickname(nickname: string): string {
  return nickname.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function isProfileAvatarEmoji(value: string): boolean {
  if (!value || value.length > 32) return false;
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)];
  if (graphemes.length !== 1 || graphemes[0].segment !== value) return false;
  return /\p{Extended_Pictographic}|\p{Emoji_Presentation}|[#*0-9]\uFE0F?\u20E3/u.test(value);
}

export function validateMultiplayerProfile(profile: MultiplayerProfile): PvpProfileValidationResult {
  const errors: PvpProfileValidationError[] = [];
  const normalizedNickname = normalizeMultiplayerNickname(profile.nickname);
  const nicknameLength = Array.from(normalizedNickname).length;
  const pool = validatePvpPool(profile.pool);

  if (!isProfileAvatarEmoji(profile.avatar)) {
    errors.push({ code: "invalid-avatar", message: "프로필에는 Emoji 한 개를 선택해야 합니다." });
  }
  if (
    nicknameLength < 2
    || nicknameLength > 12
    || !/^[\p{L}\p{N} ]+$/u.test(normalizedNickname)
  ) {
    errors.push({
      code: "invalid-nickname",
      message: "닉네임은 한글·영문·숫자·공백을 사용해 2~12자로 입력해야 합니다.",
    });
  }
  if (!pool.valid) {
    errors.push({ code: "invalid-pool", message: "PvP Pool 구성 규칙을 확인해 주세요." });
  }

  return { valid: errors.length === 0, normalizedNickname, pool, errors };
}
