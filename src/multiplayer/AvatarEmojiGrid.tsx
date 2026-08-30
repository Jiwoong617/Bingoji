import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import koreanEmojiData from "emoji-picker-react/dist/data/emojis-ko";

export default function AvatarEmojiGrid({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <EmojiPicker
      className="bingoji-emoji-picker"
      width="100%"
      height={390}
      theme={Theme.DARK}
      emojiStyle={EmojiStyle.NATIVE}
      emojiData={koreanEmojiData}
      lazyLoadEmojis
      autoFocusSearch={false}
      searchPlaceholder="Emoji 검색"
      searchClearButtonLabel="검색어 지우기"
      previewConfig={{ showPreview: false }}
      onEmojiClick={(emojiData) => onSelect(emojiData.emoji)}
    />
  );
}
