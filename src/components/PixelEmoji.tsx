import { Fragment, type CSSProperties } from "react";

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const pixelEmojiCache = new Map<string, string>();
const emojiSequence = String.raw`(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*)`;
const emojiCapture = new RegExp(`(${emojiSequence})`, "gu");
const emojiOnly = new RegExp(`^${emojiSequence}$`, "u");

function canRasterizeEmoji(): boolean {
  return typeof document !== "undefined"
    && typeof navigator !== "undefined"
    && !/jsdom/iu.test(navigator.userAgent);
}

function findAlphaBounds(data: Uint8ClampedArray, size: number) {
  let left = size;
  let top = size;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (data[(y * size + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  return right < left || bottom < top ? null : { left, top, right, bottom };
}

function pixelEmojiDataUrl(emoji: string, resolution: number): string | null {
  if (!canRasterizeEmoji()) return null;
  const key = `${resolution}:${emoji}`;
  const cached = pixelEmojiCache.get(key);
  if (cached) return cached;

  const sampleSize = Math.max(64, resolution * 4);
  const sample = document.createElement("canvas");
  sample.width = sampleSize;
  sample.height = sampleSize;
  const sampleContext = sample.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!sampleContext) return null;

  sampleContext.clearRect(0, 0, sampleSize, sampleSize);
  sampleContext.font = `${Math.floor(sampleSize * 0.72)}px ${EMOJI_FONT}`;
  sampleContext.textAlign = "center";
  sampleContext.textBaseline = "middle";
  sampleContext.fillText(emoji, sampleSize / 2, sampleSize * 0.52);

  const bounds = findAlphaBounds(sampleContext.getImageData(0, 0, sampleSize, sampleSize).data, sampleSize);
  if (!bounds) return null;

  const sourceWidth = bounds.right - bounds.left + 1;
  const sourceHeight = bounds.bottom - bounds.top + 1;
  const targetSize = Math.max(1, resolution - 2);
  const scale = Math.min(targetSize / sourceWidth, targetSize / sourceHeight);
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  const target = document.createElement("canvas");
  target.width = resolution;
  target.height = resolution;
  const targetContext = target.getContext("2d", { alpha: true });
  if (!targetContext) return null;

  targetContext.imageSmoothingEnabled = true;
  targetContext.imageSmoothingQuality = "high";
  targetContext.drawImage(
    sample,
    bounds.left,
    bounds.top,
    sourceWidth,
    sourceHeight,
    Math.floor((resolution - targetWidth) / 2),
    Math.floor((resolution - targetHeight) / 2),
    targetWidth,
    targetHeight,
  );

  const dataUrl = target.toDataURL("image/png");
  pixelEmojiCache.set(key, dataUrl);
  return dataUrl;
}

export function PixelEmoji({
  emoji,
  resolution = 18,
  className = "",
  label,
  style,
}: {
  emoji: string;
  resolution?: number;
  className?: string;
  label?: string;
  style?: CSSProperties;
}) {
  const src = pixelEmojiDataUrl(emoji, resolution);

  return (
    <span
      className={`pixel-emoji ${src ? "rendered" : "fallback"} ${className}`.trim()}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={style}
    >
      {src && <img src={src} alt="" aria-hidden="true" draggable={false} />}
      <span className={src ? "pixel-emoji-fallback visually-hidden" : "pixel-emoji-fallback"} aria-hidden={label ? "true" : undefined}>{emoji}</span>
    </span>
  );
}

export function PixelEmojiText({ text, resolution = 14 }: { text: string; resolution?: number }) {
  return (
    <>
      {text.split(emojiCapture).filter(Boolean).map((part, index) => (
        emojiOnly.test(part)
          ? <PixelEmoji key={`${part}-${index}`} emoji={part} resolution={resolution} />
          : <Fragment key={`${part}-${index}`}>{part}</Fragment>
      ))}
    </>
  );
}
