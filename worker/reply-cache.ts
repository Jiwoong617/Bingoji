export interface CachedReply {
  requestId: string;
  serialized: string;
}

export interface ReplyCacheLimits {
  maxEntries: number;
  maxBytes: number;
}

const DEFAULT_LIMITS: ReplyCacheLimits = {
  maxEntries: 8,
  // Durable Object WebSocket attachments are limited to 16 KiB. Keep enough
  // headroom for connection metadata and structured-clone overhead.
  maxBytes: 8 * 1024,
};

const utf8Bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function cacheReply(
  current: readonly CachedReply[],
  next: CachedReply,
  limits: ReplyCacheLimits = DEFAULT_LIMITS,
): CachedReply[] {
  const candidates = [...current.filter((reply) => reply.requestId !== next.requestId), next];
  const kept: CachedReply[] = [];
  let bytes = 0;

  for (let index = candidates.length - 1; index >= 0 && kept.length < limits.maxEntries; index -= 1) {
    const candidate = candidates[index];
    const candidateBytes = utf8Bytes(candidate);
    if (candidateBytes > limits.maxBytes || bytes + candidateBytes > limits.maxBytes) continue;
    kept.unshift(candidate);
    bytes += candidateBytes;
  }

  return kept;
}
