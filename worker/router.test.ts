import { describe, expect, it } from "vitest";
import {
  generateRoomCode,
  isWebSocketUpgrade,
  ROOM_CODE_ALPHABET,
  roomCodeFromSocketPath,
} from "./router";

describe("Cloudflare Worker routing", () => {
  it("normalizes and accepts valid six-character room codes", () => {
    expect(roomCodeFromSocketPath("/api/rooms/abc234/socket")).toBe("ABC234");
    expect(roomCodeFromSocketPath("/api/rooms/ABC234/socket/")).toBe("ABC234");
  });

  it("rejects invalid room code paths", () => {
    expect(roomCodeFromSocketPath("/api/rooms/ABC01I/socket")).toBeNull();
    expect(roomCodeFromSocketPath("/api/rooms/ABC23/socket")).toBeNull();
    expect(roomCodeFromSocketPath("/api/rooms/ABC234/other")).toBeNull();
  });

  it("recognizes WebSocket upgrades case-insensitively", () => {
    expect(isWebSocketUpgrade(new Request("https://example.com", {
      headers: { Upgrade: "WebSocket" },
    }))).toBe(true);
    expect(isWebSocketUpgrade(new Request("https://example.com"))).toBe(false);
  });

  it("generates six-character codes without ambiguous characters", () => {
    const code = generateRoomCode(new Uint8Array([0, 1, 2, 30, 31, 255]));
    expect(code).toHaveLength(6);
    expect([...code].every((character) => ROOM_CODE_ALPHABET.includes(character))).toBe(true);
    expect(code).not.toMatch(/[01IO]/);
  });
});
