import { isRoomCode } from "../src/shared";

export const HEALTH_PATH = "/health";
export const ROOM_CREATE_SOCKET_PATH = "/api/rooms/socket";
export const ROOM_SOCKET_PATH = "/api/rooms/:roomCode/socket";
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function roomCodeFromSocketPath(pathname: string): string | null {
  const matched = /^\/api\/rooms\/([^/]+)\/socket\/?$/.exec(pathname);
  if (!matched) return null;
  const roomCode = matched[1].toUpperCase();
  return isRoomCode(roomCode) ? roomCode : null;
}

export function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

export function generateRoomCode(randomBytes: Uint8Array): string {
  if (randomBytes.length < 6) throw new Error("방 코드 생성에는 최소 6개의 Random byte가 필요합니다.");
  return Array.from(randomBytes.slice(0, 6), (value) => (
    ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length]
  )).join("");
}
