import type { Difficulty } from "./types";

export interface DifficultyDefinition {
  id: Difficulty;
  label: string;
  icon: string;
  invitationChance: number;
  description: string;
}

export const DIFFICULTIES: DifficultyDefinition[] = [
  {
    id: "easy",
    label: "쉬움",
    icon: "🟢",
    invitationChance: 0.8,
    description: "적이 Bingo를 우선하되, 80% 확률로 빈칸 2개인 Line을 한 칸 채워 줍니다.",
  },
  {
    id: "normal",
    label: "보통",
    icon: "🟡",
    invitationChance: 0.4,
    description: "적이 Bingo를 우선하되, 40% 확률로 빈칸 2개인 Line을 한 칸 채워 줍니다.",
  },
  {
    id: "hard",
    label: "어려움",
    icon: "🔴",
    invitationChance: 0,
    description: "적이 Bingo를 우선하고, 가능한 한 플레이어에게 확정 Bingo 기회를 주지 않습니다.",
  },
];

export const DIFFICULTY_BY_ID = Object.fromEntries(
  DIFFICULTIES.map((difficulty) => [difficulty.id, difficulty]),
) as Record<Difficulty, DifficultyDefinition>;
