import { useEffect, useMemo, useState } from "react";
import koreanEmojiData from "emoji-picker-react/dist/data/emojis-ko";
import { PixelEmoji } from "../components/PixelEmoji";

const CATEGORY_IDS = [
  "smileys_people",
  "animals_nature",
  "food_drink",
  "travel_places",
  "activities",
  "objects",
  "symbols",
  "flags",
] as const;
const PAGE_SIZE = 96;

const emojiData = koreanEmojiData as {
  categories: Record<string, { name: string } | undefined>;
  emojis: Record<string, Array<{ n: string[]; u: string; v?: string[] }>>;
};

function fromUnified(unified: string): string {
  return String.fromCodePoint(...unified.split("-").map((value) => Number.parseInt(value, 16)));
}

export default function AvatarEmojiGrid({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [category, setCategory] = useState<(typeof CATEGORY_IDS)[number]>(CATEGORY_IDS[0]);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => setVisibleCount(PAGE_SIZE), [category, query]);

  const emojis = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko");
    const categoryIds = normalizedQuery ? CATEGORY_IDS : CATEGORY_IDS.filter((id) => id === category);
    return categoryIds.flatMap((categoryId) => (emojiData.emojis[categoryId] ?? []).flatMap((item) => {
      if (normalizedQuery && !item.n.some((name) => name.toLocaleLowerCase("ko").includes(normalizedQuery))) return [];
      return [item.u, ...(item.v ?? [])].map((unified) => ({
        emoji: fromUnified(unified),
        name: item.n.at(-1) ?? item.n[0] ?? "Emoji",
        unified,
      }));
    }));
  }, [category, query]);

  return (
    <div className="pixel-avatar-picker">
      <label className="pixel-avatar-search">
        <span>Emoji 검색</span>
        <input value={query} placeholder="Emoji 검색" onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="pixel-avatar-categories" aria-label="Emoji 카테고리">
        {CATEGORY_IDS.map((categoryId) => (
          <button
            key={categoryId}
            type="button"
            aria-pressed={!query && category === categoryId}
            onClick={() => {
              setQuery("");
              setCategory(categoryId);
            }}
          >
            {emojiData.categories[categoryId]?.name ?? categoryId}
          </button>
        ))}
      </div>
      <div
        className="pixel-avatar-grid"
        role="listbox"
        aria-label={query ? "Emoji 검색 결과" : emojiData.categories[category]?.name ?? "Emoji 목록"}
        onScroll={(event) => {
          const grid = event.currentTarget;
          if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 80) {
            setVisibleCount((count) => Math.min(emojis.length, count + PAGE_SIZE));
          }
        }}
      >
        {emojis.slice(0, visibleCount).map((item, index) => (
          <button
            key={`${item.emoji}-${index}`}
            type="button"
            role="option"
            aria-selected="false"
            aria-label={item.name}
            title={item.name}
            data-unified={item.unified}
            onClick={() => onSelect(item.emoji)}
          >
            <PixelEmoji emoji={item.emoji} resolution={16} />
          </button>
        ))}
        {emojis.length === 0 && <p>검색 결과가 없습니다.</p>}
      </div>
      {visibleCount < emojis.length && (
        <button className="pixel-avatar-more" type="button" onClick={() => setVisibleCount((count) => Math.min(emojis.length, count + PAGE_SIZE))}>
          더 보기 · {visibleCount}/{emojis.length}
        </button>
      )}
    </div>
  );
}
