import { lazy, Suspense, useEffect, useRef, useState } from "react";

const AvatarEmojiGrid = lazy(() => import("./AvatarEmojiGrid"));

export function AvatarEmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  const selectEmoji = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="avatar-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        className={`profile-avatar-preview avatar-picker-trigger ${open ? "open" : ""}`}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `현재 ${value}, 프로필 Emoji 선택` : "프로필 Emoji 선택"}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value || "❔"}</span>
        <small>{value ? "변경" : "선택"}</small>
      </button>

      {open && (
        <section className="avatar-picker-popover" role="dialog" aria-label="프로필 Emoji 선택 창">
          <header>
            <div><strong>PROFILE EMOJI</strong><span>원하는 Emoji를 검색하거나 골라주세요.</span></div>
            <button type="button" aria-label="프로필 Emoji 선택 창 닫기" onClick={() => setOpen(false)}>×</button>
          </header>
          <Suspense fallback={<div className="avatar-picker-loading">Emoji 불러오는 중…</div>}>
            <AvatarEmojiGrid onSelect={selectEmoji} />
          </Suspense>
        </section>
      )}
    </div>
  );
}
