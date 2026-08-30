export function isAllowedWebSocketOrigin(origin: string | null, configuredOrigins: string): boolean {
  // Browser WebSocket requests always include Origin. Origin-less CLI smoke checks
  // remain available and are still covered by the room-creation rate limiter.
  if (origin === null) return true;
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    return false;
  }
  const allowed = new Set(configuredOrigins.split(",").map((value) => value.trim()).filter(Boolean));
  return allowed.has(normalized);
}

export function requestRateLimitKey(request: Request): string {
  return `room-create:${request.headers.get("CF-Connecting-IP") ?? "unknown-client"}`;
}
