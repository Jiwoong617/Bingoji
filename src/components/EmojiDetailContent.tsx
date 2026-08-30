import { EMOJIS } from "../content/emojis";
import { STATUS_DEFINITIONS } from "../content/statuses";
import type { BingoEffect, PlaceEffect, StatusId } from "../game/types";

function relatedStatuses(effects: Array<BingoEffect | PlaceEffect>): StatusId[] {
  const result = new Set<StatusId>();
  const visit = (effect: BingoEffect | PlaceEffect) => {
    if (effect.type === "shield") result.add("shield");
    else if (effect.type === "status") result.add(effect.statusId);
    else if (effect.type === "cleanse") effect.statuses.forEach((status) => result.add(status));
    else if (effect.type === "consume-status-damage") result.add(effect.statusId);
    else if (effect.type === "trigger-poison") result.add("poison");
    else if (effect.type === "lowest-resource") effect.resources.forEach((resource) => result.add(resource.statusId));
    else if (effect.type === "post-if-no-crit") {
      result.add("luck");
      result.add("shield");
    } else if (effect.type === "coin") result.add("shield");
    else if (effect.type === "slot") result.add("luck");
    else if (effect.type === "dice" && effect.otherwiseShield) {
      result.add("shield");
      result.add("luck");
    } else if (effect.type === "heal" && effect.overflowToShield) result.add("shield");
    else if (effect.type === "random") effect.options.flat().forEach(visit);
  };
  effects.forEach(visit);
  return [...result];
}

const RARITY_LABEL = {
  common: "일반",
  uncommon: "고급",
  rare: "희귀",
} as const;

export function EmojiDetailContent({ emojiId }: { emojiId: string }) {
  const emoji = EMOJIS[emojiId];
  const abilityLabel = [
    emoji.onPlace?.length ? "PLACEMENT" : null,
    emoji.onBingo.length ? "BINGO" : null,
    emoji.whileOwned ? "OWNED" : null,
  ].filter(Boolean).join(" · ") + " EFFECT";
  const statusIds = relatedStatuses([...(emoji.onPlace ?? []), ...emoji.onBingo]);

  return (
    <div className="emoji-detail">
      <span className="emoji-detail-icon">{emoji.icon}</span>
      <div>
        <p className="eyebrow">{abilityLabel}</p>
        <h3>{emoji.name}</h3>
        <p>{emoji.description}</p>
        <div className="emoji-meta">
          <span>{RARITY_LABEL[emoji.rarity]}</span>
          {emoji.tags.map((tag) => <span key={tag}>#{tag}</span>)}
        </div>
        {statusIds.length > 0 && (
          <section className="emoji-status-list">
            <strong>관련 BUFF / DEBUFF</strong>
            {statusIds.map((statusId) => {
              const status = STATUS_DEFINITIONS[statusId];
              return (
                <div key={statusId}>
                  <span>{status.icon}</span>
                  <p><b>{status.name}</b><small>{status.description}</small></p>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
