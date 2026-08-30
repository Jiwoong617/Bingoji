import { describe, expect, it } from "vitest";
import { isAllowedWebSocketOrigin, requestRateLimitKey } from "./security";

const allowed = "http://localhost:5173, http://127.0.0.1:5173, https://jiwoong617.github.io";

describe("Worker WebSocket security", () => {
  it("allows configured browser origins and rejects other or malformed origins", () => {
    expect(isAllowedWebSocketOrigin("http://localhost:5173", allowed)).toBe(true);
    expect(isAllowedWebSocketOrigin("https://jiwoong617.github.io", allowed)).toBe(true);
    expect(isAllowedWebSocketOrigin("https://attacker.example", allowed)).toBe(false);
    expect(isAllowedWebSocketOrigin("not-an-origin", allowed)).toBe(false);
  });

  it("allows origin-less non-browser diagnostics and derives a room-create rate key", () => {
    expect(isAllowedWebSocketOrigin(null, allowed)).toBe(true);
    expect(requestRateLimitKey(new Request("https://example.com", { headers: { "CF-Connecting-IP": "203.0.113.5" } }))).toBe("room-create:203.0.113.5");
  });
});
