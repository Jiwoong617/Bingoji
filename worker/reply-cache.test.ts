import { describe, expect, it } from "vitest";
import { cacheReply } from "./reply-cache";

describe("cacheReply", () => {
  it("replaces an existing request and keeps only the newest entry count", () => {
    const cached = cacheReply(
      [
        { requestId: "a", serialized: "old-a" },
        { requestId: "b", serialized: "b" },
      ],
      { requestId: "a", serialized: "new-a" },
      { maxEntries: 2, maxBytes: 1_000 },
    );

    expect(cached).toEqual([
      { requestId: "b", serialized: "b" },
      { requestId: "a", serialized: "new-a" },
    ]);
  });

  it("drops older replies before exceeding the byte budget", () => {
    const cached = cacheReply(
      [
        { requestId: "a", serialized: "a".repeat(40) },
        { requestId: "b", serialized: "b".repeat(40) },
      ],
      { requestId: "c", serialized: "c".repeat(40) },
      { maxEntries: 8, maxBytes: 150 },
    );

    expect(cached.map((reply) => reply.requestId)).toEqual(["b", "c"]);
  });

  it("does not attach a single oversized response", () => {
    const cached = cacheReply(
      [{ requestId: "small", serialized: "ok" }],
      { requestId: "large", serialized: "x".repeat(500) },
      { maxEntries: 8, maxBytes: 100 },
    );

    expect(cached).toEqual([{ requestId: "small", serialized: "ok" }]);
  });
});
