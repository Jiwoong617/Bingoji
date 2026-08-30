import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Modal({
  title,
  onClose,
  children,
  layout = "center",
  cardClassName = "",
  initialFocusRef,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  layout?: "center" | "top";
  cardClassName?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const card = cardRef.current;
    const focusable = Array.from(card?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    (initialFocusRef?.current ?? focusable[0] ?? card)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;
      const candidates = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (candidates.length === 0) {
        event.preventDefault();
        cardRef.current.focus();
        return;
      }
      const first = candidates[0];
      const last = candidates[candidates.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [initialFocusRef, onClose]);

  return (
    <div className={`modal-backdrop modal-${layout}`} role="presentation" onMouseDown={onClose}>
      <section
        ref={cardRef}
        className={`modal-card ${cardClassName}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        {children}
      </section>
    </div>
  );
}
