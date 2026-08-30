import {
  generateRoomCode,
  HEALTH_PATH,
  isWebSocketUpgrade,
  ROOM_CREATE_SOCKET_PATH,
  roomCodeFromSocketPath,
} from "./router";
import { isAllowedWebSocketOrigin, requestRateLimitKey } from "./security";

export { BingojiRoom } from "./room";

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function roomRequest(request: Request, roomCode: string, mode: "create" | "join"): Request {
  const headers = new Headers(request.headers);
  headers.set("X-Bingoji-Room-Code", roomCode);
  headers.set("X-Bingoji-Connection-Mode", mode);
  return new Request(request, { headers });
}

async function createRoomSocket(request: Request, env: Env): Promise<Response> {
  const rateLimit = await env.ROOM_CREATE_RATE_LIMITER.limit({ key: requestRateLimitKey(request) });
  if (!rateLimit.success) return json({ error: "rate-limit-exceeded" }, 429);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const roomCode = generateRoomCode(bytes);
    const roomId = env.BINGOJI_ROOMS.idFromName(roomCode);
    const room = env.BINGOJI_ROOMS.get(roomId);
    if (await room.canCreate(Date.now())) return room.fetch(roomRequest(request, roomCode, "create"));
  }
  return json({ error: "room-code-unavailable" }, 503);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === HEALTH_PATH) {
      return json({ service: "bingoji-multiplayer", status: "ok" });
    }

    if (request.method === "GET" && url.pathname === ROOM_CREATE_SOCKET_PATH) {
      if (!isWebSocketUpgrade(request)) {
        return json({ error: "websocket-upgrade-required" }, 426);
      }
      if (!isAllowedWebSocketOrigin(request.headers.get("Origin"), env.ALLOWED_ORIGINS)) {
        return json({ error: "origin-not-allowed" }, 403);
      }
      return createRoomSocket(request, env);
    }

    const roomCode = roomCodeFromSocketPath(url.pathname);
    if (request.method === "GET" && roomCode) {
      if (!isWebSocketUpgrade(request)) {
        return json({ error: "websocket-upgrade-required" }, 426);
      }
      if (!isAllowedWebSocketOrigin(request.headers.get("Origin"), env.ALLOWED_ORIGINS)) {
        return json({ error: "origin-not-allowed" }, 403);
      }
      const roomId = env.BINGOJI_ROOMS.idFromName(roomCode);
      return env.BINGOJI_ROOMS.get(roomId).fetch(roomRequest(request, roomCode, "join"));
    }

    return json({ error: "not-found" }, 404);
  },
} satisfies ExportedHandler<Env>;
