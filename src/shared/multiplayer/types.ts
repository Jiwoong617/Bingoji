import type { Pool } from "../../game/types";

export type PvpSeat = "host" | "guest";

export interface MultiplayerProfile {
  avatar: string;
  nickname: string;
  pool: Pool;
}
