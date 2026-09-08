import { render, screen } from "@testing-library/react";
import { PixelEmoji, PixelEmojiText } from "./PixelEmoji";

describe("PixelEmoji", () => {
  it("keeps the Unicode Emoji fallback in non-canvas environments", () => {
    render(<PixelEmoji emoji="⚔️" label="쌍검" />);
    expect(screen.getByRole("img", { name: "쌍검" })).toHaveTextContent("⚔️");
  });

  it("separates Emoji sequences from ordinary text", () => {
    const { container } = render(<p><PixelEmojiText text="🔥 불꽃과 ❤️ 하트" /></p>);
    expect(container.querySelectorAll(".pixel-emoji")).toHaveLength(2);
    expect(container).toHaveTextContent("🔥 불꽃과 ❤️ 하트");
  });
});
