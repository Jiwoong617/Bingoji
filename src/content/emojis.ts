import type { BingoEffect, EmojiDefinition, OwnedEffect, PlaceEffect, Rarity } from "../game/types";

type EmojiOptions = {
  rarity?: Rarity;
  tags?: string[];
  bingo?: BingoEffect[];
  place?: PlaceEffect[];
  owned?: OwnedEffect;
  retentionTurns?: number;
};

function emoji(
  id: string,
  icon: string,
  name: string,
  description: string,
  options: EmojiOptions = {},
): EmojiDefinition {
  return {
    id,
    icon,
    name,
    description,
    rarity: options.rarity ?? "common",
    tags: options.tags ?? [],
    onBingo: options.bingo ?? [],
    onPlace: options.place,
    whileOwned: options.owned,
    retentionTurns: options.retentionTurns,
  };
}

const common = [
  emoji("sword", "⚔️", "쌍검", "Bingo: 피해 2", { tags: ["weapon", "damage"], bingo: [{ type: "damage", amount: 2, basic: true }] }),
  emoji("heart", "❤️", "하트", "Bingo: HP 3 회복", { tags: ["heal"], bingo: [{ type: "heal", amount: 3, basic: true }] }),
  emoji("fire", "🔥", "불꽃", "Bingo: 피해 3", { tags: ["fire", "damage"], bingo: [{ type: "damage", amount: 3, basic: true }] }),
  emoji("clover", "🍀", "행운의 클로버", "Bingo: HP 1 회복, 행운 1", { tags: ["nature", "luck"], bingo: [{ type: "heal", amount: 1 }, { type: "status", statusId: "luck", amount: 1 }] }),
  emoji("skull", "💀", "해골", "Bingo: 피해 4. 대상에게 독이 있으면 +2", { rarity: "uncommon", tags: ["undead", "damage"], bingo: [{ type: "damage", amount: 4, bonusWhen: { condition: { type: "has-status", target: "opponent", statusId: "poison" }, amount: 2 } }] }),
  emoji("bomb", "💣", "폭탄", "Bingo: 피해 6", { rarity: "uncommon", tags: ["explosive", "damage"], bingo: [{ type: "damage", amount: 6, basic: true }] }),
  emoji("lone_blade", "🗡️", "고독한 칼", "Bingo: 피해 2. 같은 Line에 다른 고독한 칼이 없으면 5배", { rarity: "uncommon", tags: ["weapon", "damage"], bingo: [{ type: "damage", amount: 2, ifNoOtherSame: { multiplier: 5 } }] }),
  emoji("extra_turn", "✌️", "한 번 더!", "Place: 남은 Draw에서 추가 배치 1회. Bingo: 피해 1", { rarity: "uncommon", tags: ["gesture"], bingo: [{ type: "damage", amount: 1 }], place: [{ type: "extra-placement", count: 1 }] }),
  emoji("statue", "🗿", "모아이", "Bingo: 피해 2. 처리 후 3턴 유지", { rarity: "uncommon", tags: ["magic", "growth"], bingo: [{ type: "damage", amount: 2 }], retentionTurns: 3 }),
  emoji("rainbow", "🌈", "무지개", "Bingo: 피해와 회복 4. Line 테마가 모두 다르면 각각 6", { rarity: "rare", tags: ["magic", "heal", "damage"], bingo: [{ type: "damage", amount: 4, bonusWhen: { condition: { type: "line-distinct-major-themes" }, amount: 2 } }, { type: "heal", amount: 4, bonusWhen: { condition: { type: "line-distinct-major-themes" }, amount: 2 } }] }),
  emoji("battle_eye", "👁️", "전투의 눈", "Owned: 모든 직접 피해 +1", { rarity: "rare", tags: ["magic", "damage"], owned: { damageBonus: 1 } }),
  emoji("starlight", "⭐", "별빛", "Bingo: 피해 2, HP 2 회복", { tags: ["celestial", "heal", "damage"], bingo: [{ type: "damage", amount: 2, basic: true }, { type: "heal", amount: 2, basic: true }] }),
  emoji("bandage", "🩹", "응급 붕대", "Bingo: HP 2 회복, 방어막 2", { tags: ["heal", "shield"], bingo: [{ type: "heal", amount: 2, basic: true }, { type: "shield", amount: 2, basic: true }] }),
  emoji("healing_burst", "💞", "회복의 파동", "Bingo: HP 4 회복. 실제 회복량의 50%를 피해로 전환", { rarity: "uncommon", tags: ["heal", "damage"], bingo: [{ type: "heal", amount: 4 }, { type: "heal-linked-damage", ratio: 0.5 }] }),
  emoji("pain_exchange", "😖", "고통 교환", "Bingo: 자신의 HP 2를 잃고 피해 7", { tags: ["curse", "damage"], bingo: [{ type: "self-damage", amount: 2 }, { type: "damage", amount: 7 }] }),
  emoji("pepper", "🌶️", "매운 고추", "Bingo: 피해 2 + Line의 food 수", { tags: ["food", "spicy", "fire"], bingo: [{ type: "damage", amount: 2, scale: { type: "line-tag-count", tag: "food", factor: 1 } }] }),

  emoji("shield", "🛡️", "둥근 방패", "Bingo: 방어막 5", { tags: ["armor", "shield"], bingo: [{ type: "shield", amount: 5, basic: true }] }),
  emoji("brick", "🧱", "벽돌", "Bingo: 방어막 3. 모서리에서는 +3", { tags: ["shield"], bingo: [{ type: "shield", amount: 3, bonusWhen: { condition: { type: "corner" }, amount: 3 } }] }),
  emoji("helmet", "🪖", "전투모", "Bingo: 방어막 3, 약점 1 제거", { tags: ["armor", "shield"], bingo: [{ type: "shield", amount: 3 }, { type: "cleanse", statuses: ["weakness"], amount: 1 }] }),
  emoji("shell", "🐚", "단단한 조개", "Bingo: 방어막 4. 이미 방어막이 있으면 HP 2 회복", { rarity: "uncommon", tags: ["water", "shield"], bingo: [{ type: "heal", amount: 2, condition: { type: "has-status", statusId: "shield" } }, { type: "shield", amount: 4 }] }),
  emoji("hedgehog", "🦔", "고슴도치", "Bingo: 방어막 3, 가시 2", { rarity: "uncommon", tags: ["animal", "shield"], bingo: [{ type: "shield", amount: 3 }, { type: "status", statusId: "thorns", amount: 2 }] }),
  emoji("castle", "🏰", "움직이는 성", "Bingo: 방어막 3. Double 이상이면 10", { rarity: "rare", tags: ["shield", "magic"], bingo: [{ type: "shield", amount: 3, bonusWhen: { condition: { type: "multi", min: 2 }, amount: 7 } }] }),
  emoji("amulet", "🪬", "수호 부적", "Owned: 전투마다 처음 받는 직접 피해 3 감소. Bingo: 방어막 2", { rarity: "uncommon", tags: ["magic", "shield"], bingo: [{ type: "shield", amount: 2 }], owned: { firstDirectDamageReduction: 3 } }),

  emoji("battery", "🔋", "건전지", "Bingo: 충전 2", { tags: ["machine", "charge"], bingo: [{ type: "status", statusId: "charge", amount: 2, basic: true }] }),
  emoji("gear", "⚙️", "증폭 기어", "Bingo: 충전 1. 다른 machine이 있으면 +1", { tags: ["machine", "charge"], bingo: [{ type: "status", statusId: "charge", amount: 1, bonusWhen: { condition: { type: "line-tag", tag: "machine", min: 2 }, amount: 1 } }] }),
  emoji("bulb", "💡", "번뜩임", "Bingo: 서로 다른 Emoji 수만큼 충전, 최대 5", { rarity: "uncommon", tags: ["machine", "charge"], bingo: [{ type: "status", statusId: "charge", amount: 0, scale: { type: "line-distinct-emojis", factor: 1 }, cap: 5 }] }),
  emoji("rocket", "🚀", "로켓", "Bingo: 충전 3을 소비해 피해 10. 부족하면 피해 3", { rarity: "uncommon", tags: ["machine", "explosive", "damage"], bingo: [{ type: "consume-status-damage", statusId: "charge", required: 3, factor: 0, bonus: 10, failureDamage: 3 }] }),
  emoji("comet", "☄️", "혜성", "Bingo: 피해 4 + 현재 충전, 추가 최대 10", { rarity: "rare", tags: ["celestial", "damage"], bingo: [{ type: "damage", amount: 4, scale: { type: "status", statusId: "charge", factor: 1 }, cap: 14 }] }),
  emoji("firecracker", "🧨", "기폭 장치", "Bingo: 충전을 모두 소비하고 충전당 피해 2", { rarity: "uncommon", tags: ["fire", "explosive"], bingo: [{ type: "consume-status-damage", statusId: "charge", factor: 2, consumeAll: true }] }),
  emoji("eruption", "🌋", "과부하", "Bingo: 충전 10으로 피해 25. 부족하면 현재 충전의 2배 피해", { rarity: "rare", tags: ["fire", "explosive"], bingo: [{ type: "consume-status-damage", statusId: "charge", required: 10, factor: 2, bonus: 25, consumeOnFailureAll: true }] }),

  emoji("target", "🎯", "조준점", "Bingo: 정밀 1", { tags: ["crit"], bingo: [{ type: "status", statusId: "precision", amount: 1, basic: true }] }),
  emoji("lightning", "⚡", "전광석화", "Bingo: 피해 3. 치명타 확률 +20%", { tags: ["celestial", "crit", "damage"], bingo: [{ type: "damage", amount: 3, critChanceBonus: 0.2 }] }),
  emoji("knife", "🔪", "급소 칼날", "Bingo: 피해 2. 치명타 배율 3배", { rarity: "uncommon", tags: ["weapon", "crit"], bingo: [{ type: "damage", amount: 2, critMultiplier: 3 }] }),
  emoji("eagle", "🦅", "매의 눈", "Owned: 치명타 확률 +10%. Bingo: 피해 1", { rarity: "uncommon", tags: ["animal", "crit"], bingo: [{ type: "damage", amount: 1 }], owned: { critChanceBonus: 0.1 } }),
  emoji("diamond", "💎", "예리한 보석", "Owned: 치명타 피해 배율 +0.5. Bingo: 정밀 1", { rarity: "rare", tags: ["magic", "crit"], bingo: [{ type: "status", statusId: "precision", amount: 1 }], owned: { critMultiplierBonus: 0.5 } }),
  emoji("bow", "🏹", "집중 사격", "Bingo: 피해 2 + 정밀", { rarity: "uncommon", tags: ["weapon", "crit"], bingo: [{ type: "damage", amount: 2, scale: { type: "precision", factor: 1 } }] }),
  emoji("boxing_glove", "🥊", "반격 펀치", "Bingo: 방어막이 있으면 피해 5 확정 치명타, 아니면 피해 3", { rarity: "uncommon", tags: ["gesture", "crit"], bingo: [{ type: "damage", amount: 3, bonusWhen: { condition: { type: "has-status", statusId: "shield" }, amount: 2 }, guaranteedCritWhen: { type: "has-status", statusId: "shield" } }] }),
  emoji("magnifier", "🔍", "약점 분석", "Bingo: 대상에게 약점 3", { tags: ["crit"], bingo: [{ type: "status", statusId: "weakness", target: "opponent", amount: 3 }] }),

  emoji("germ", "🦠", "독성 세균", "Bingo: 독 3", { tags: ["poison"], bingo: [{ type: "status", statusId: "poison", target: "opponent", amount: 3, basic: true }] }),
  emoji("spider", "🕷️", "맹독 거미", "Bingo: 독 2, 피해 1", { tags: ["animal", "poison"], bingo: [{ type: "status", statusId: "poison", target: "opponent", amount: 2 }, { type: "damage", amount: 1 }] }),
  emoji("bee", "🐝", "독침 벌", "Bingo: 피해 2, 독 1", { tags: ["animal", "insect", "poison"], bingo: [{ type: "damage", amount: 2 }, { type: "status", statusId: "poison", target: "opponent", amount: 1 }] }),
  emoji("mushroom", "🍄", "위험한 버섯", "Bingo: 상대에게 독 4, 자신에게 독 1", { rarity: "uncommon", tags: ["food", "nature", "poison"], bingo: [{ type: "status", statusId: "poison", target: "opponent", amount: 4 }, { type: "status", statusId: "poison", amount: 1 }] }),
  emoji("miasma", "🌫️", "독안개", "Bingo: Line의 poison Emoji마다 독 2", { rarity: "uncommon", tags: ["magic", "poison"], bingo: [{ type: "status", statusId: "poison", target: "opponent", amount: 0, scale: { type: "line-tag-count", tag: "poison", factor: 2 } }] }),
  emoji("catalyst", "⚗️", "약한 촉매", "Bingo: 대상 독을 감소 없이 즉시 발동", { rarity: "uncommon", tags: ["poison", "magic"], bingo: [{ type: "trigger-poison", noDecay: true }] }),
  emoji("soap", "🧼", "해독 비누", "Bingo: 자신의 독을 최대 4 제거하고 제거량만큼 회복", { tags: ["water", "heal"], bingo: [{ type: "cleanse", statuses: ["poison"], amount: 4, healPerRemoved: 1 }] }),
  emoji("zombie", "🧟", "부패한 손", "Bingo: 대상 독의 절반만큼 피해, 독 +2", { rarity: "rare", tags: ["undead", "poison"], bingo: [{ type: "damage", amount: 0, target: "opponent", scale: { type: "status", target: "opponent", statusId: "poison", factor: 0.5 } }, { type: "status", statusId: "poison", target: "opponent", amount: 2 }] }),

  emoji("dice", "🎲", "전투 주사위", "Bingo: 1~6 피해. 행운만큼 결과 증가", { tags: ["luck", "random", "damage"], bingo: [{ type: "dice", sides: 6 }] }),
  emoji("coin", "🪙", "앞면인가?", "Bingo: 50%로 피해 8, 실패하면 방어막 3", { tags: ["luck", "random"], bingo: [{ type: "coin", successChance: 0.5, damage: 8, failureShield: 3 }] }),
  emoji("slot", "🎰", "세븐 슬롯", "Bingo: 1~7 숫자 3개. Pair 피해 10, Triple 피해 25, 실패 행운 2", { rarity: "rare", tags: ["luck", "random"], bingo: [{ type: "slot", symbols: 7 }] }),
  emoji("joker", "🃏", "조커", "Bingo: 피해 4·회복 4·방어막 5·독 3 중 하나", { rarity: "uncommon", tags: ["luck", "random"], bingo: [{ type: "random", options: [[{ type: "damage", amount: 4 }], [{ type: "heal", amount: 4 }], [{ type: "shield", amount: 5 }], [{ type: "status", statusId: "poison", target: "opponent", amount: 3 }]] }] }),
  emoji("mask", "🎭", "변화의 가면", "Place: 무작위 획득 가능 Emoji로 변신", { rarity: "uncommon", tags: ["magic", "random"], place: [{ type: "transform" }] }),
  emoji("cycle", "🔄", "운명의 새로고침", "Place: 남은 Draw를 새로 뽑고 추가 배치 1회", { rarity: "rare", tags: ["magic", "random"], place: [{ type: "redraw-extra", count: 1 }] }),
  emoji("rabbit", "🐇", "행운의 토끼", "Bingo: 행운 2", { tags: ["animal", "luck"], bingo: [{ type: "status", statusId: "luck", amount: 2 }] }),
  emoji("evil_eye", "🧿", "불운 먹는 눈", "Owned: 최악 결과 시 행운 1. Bingo: 방어막 1", { rarity: "uncommon", tags: ["magic", "luck"], bingo: [{ type: "shield", amount: 1 }], owned: { refundLuckOnWorst: 1 } }),
  emoji("gift", "🎁", "깜짝 선물", "Bingo: 충전 3·정밀 2·회복 5 중 하나", { rarity: "uncommon", tags: ["luck", "random"], bingo: [{ type: "random", options: [[{ type: "status", statusId: "charge", amount: 3 }], [{ type: "status", statusId: "precision", amount: 2 }], [{ type: "heal", amount: 5 }]] }] }),

  emoji("mirror", "🪞", "메아리 거울", "Bingo: 바로 전 Emoji 수치 효과 반복", { rarity: "uncommon", tags: ["magic", "copy"], bingo: [{ type: "repeat-previous", multiplier: 1 }] }),
  emoji("megaphone", "📣", "증폭 메가폰", "Bingo: 바로 전 Emoji 수치 효과를 2배 반복", { rarity: "rare", tags: ["machine", "copy"], bingo: [{ type: "repeat-previous", multiplier: 2 }] }),
  emoji("magnet", "🧲", "팔방 자석", "Bingo: 주변 8칸 수치 효과 사용", { rarity: "rare", tags: ["machine", "copy"], bingo: [{ type: "trigger-adjacent", count: "all" }] }),
  emoji("vortex", "🌀", "작은 소용돌이", "Bingo: 주변 점유 Cell 중 무작위 3개의 수치 효과 사용", { rarity: "uncommon", tags: ["magic", "random", "copy"], bingo: [{ type: "trigger-adjacent", count: 3 }] }),
  emoji("puzzle", "🧩", "교차 설계도", "Bingo: Double 이상이면 충전 4와 정밀 2", { rarity: "uncommon", tags: ["machine"], bingo: [{ type: "status", statusId: "charge", amount: 4, condition: { type: "multi", min: 2 } }, { type: "status", statusId: "precision", amount: 2, condition: { type: "multi", min: 2 } }] }),
  emoji("bell", "🔔", "더블 벨", "Bingo: Double 이상이면 피해 8, 아니면 방어막 2", { rarity: "uncommon", tags: ["music"], bingo: [{ type: "damage", amount: 8, condition: { type: "multi", min: 2 } }, { type: "shield", amount: 0, condition: { type: "multi", min: 2 }, elseAmount: 2 }] }),
  emoji("crown", "👑", "Bingo 왕관", "Bingo: Triple 이상이면 이후 직접 피해 +3", { rarity: "rare", tags: ["magic"], bingo: [{ type: "set-damage-bonus", amount: 3, condition: { type: "multi", min: 3 } }] }),
  emoji("candle", "🕯️", "순서의 촛불", "Bingo: Line에 fire가 있으면 바로 전 회복을 피해로 반복", { rarity: "uncommon", tags: ["fire", "magic"], bingo: [{ type: "repeat-previous", multiplier: 1, requireLineTag: "fire", asDamage: true }] }),
  emoji("hourglass", "⏳", "마지막 한 수", "Bingo: Line 마지막 위치라면 Line 피해의 25% 추가", { rarity: "uncommon", tags: ["magic", "growth"], bingo: [{ type: "line-damage-ratio", ratio: 0.25, condition: { type: "last-in-line" } }] }),
  emoji("seed", "🌱", "자라는 씨앗", "Bingo: 피해 1 + Board 유지 Turn. 처리 후 3턴 유지", { rarity: "uncommon", tags: ["nature", "plant", "growth"], bingo: [{ type: "damage", amount: 1, scale: { type: "retained-turns", factor: 1 } }], retentionTurns: 3 }),
  emoji("sunflower", "🌻", "해바라기 고리", "Bingo: 주변 점유 Cell 수만큼 회복, 최대 8", { rarity: "uncommon", tags: ["nature", "plant", "heal"], bingo: [{ type: "heal", amount: 0, scale: { type: "adjacent-occupied", factor: 1 }, cap: 8 }] }),
  emoji("demolition", "💥", "소거 폭발", "Place: 자신과 상하좌우 Emoji 파괴. Bingo 불가능", { rarity: "rare", tags: ["explosive", "board-control"], place: [{ type: "destroy", pattern: "cross" }] }),

  emoji("wolf", "🐺", "무리의 우두머리", "Bingo: Line의 animal 하나당 피해 2", { rarity: "uncommon", tags: ["animal", "damage"], bingo: [{ type: "damage", amount: 0, scale: { type: "line-tag-count", tag: "animal", factor: 2 } }] }),
  emoji("sheep", "🐑", "포근한 무리", "Bingo: Line의 animal 하나당 방어막 2", { tags: ["animal", "shield"], bingo: [{ type: "shield", amount: 0, scale: { type: "line-tag-count", tag: "animal", factor: 2 } }] }),
  emoji("ant", "🐜", "협동 개미", "Bingo: Line에 animal이 3개 이상이면 이전 효과 반복", { rarity: "uncommon", tags: ["animal", "insect", "copy"], bingo: [{ type: "repeat-previous", multiplier: 1, requireLineTag: "animal" }] }),
  emoji("apple", "🍎", "싱싱한 사과", "Bingo: HP 2 + 서로 다른 food 수 회복", { tags: ["food", "fruit", "heal"], bingo: [{ type: "heal", amount: 2, scale: { type: "line-tag-count", tag: "food", factor: 1, distinct: true } }] }),
  emoji("cake", "🍰", "완성된 만찬", "Bingo: 서로 다른 food가 3개 이상이면 HP 8 회복, 방어막 5", { rarity: "uncommon", tags: ["food", "heal"], bingo: [{ type: "heal", amount: 8, condition: { type: "line-tag", tag: "food", min: 3, distinct: true } }, { type: "shield", amount: 5, condition: { type: "line-tag", tag: "food", min: 3, distinct: true } }] }),
  emoji("meat", "🍖", "야성의 식사", "Bingo: 피해 3, HP 2 회복. animal이 있으면 각각 +2", { rarity: "uncommon", tags: ["food", "damage"], bingo: [{ type: "damage", amount: 3, bonusWhen: { condition: { type: "line-tag", tag: "animal" }, amount: 2 } }, { type: "heal", amount: 2, bonusWhen: { condition: { type: "line-tag", tag: "animal" }, amount: 2 } }] }),
  emoji("tea", "🍵", "진정의 차", "Bingo: 독과 약점 2 제거, HP 1 회복", { tags: ["food", "drink", "heal"], bingo: [{ type: "cleanse", statuses: ["poison", "weakness"], amount: 2 }, { type: "heal", amount: 1 }] }),
  emoji("blood", "🩸", "피의 계약", "Bingo: HP 3을 잃고 피해 10. HP 25% 이하면 자해 없이 피해 12", { rarity: "uncommon", tags: ["curse", "damage"], bingo: [{ type: "self-damage", amount: 0, condition: { type: "hp-at-most", ratio: 0.25 }, elseAmount: 3 }, { type: "damage", amount: 10, bonusWhen: { condition: { type: "hp-at-most", ratio: 0.25 }, amount: 2 } }] }),
  emoji("black_hole", "🕳️", "공허의 대가", "Bingo: 자신을 제외한 Line 수치 효과 +50%", { rarity: "rare", tags: ["celestial", "curse"], bingo: [{ type: "line-multiplier", multiplier: 1.5 }] }),
  emoji("thief", "🥷", "역전의 강탈자", "Bingo: Line에서 적이 배치한 Cell마다 피해 2", { rarity: "uncommon", tags: ["gesture", "damage"], bingo: [{ type: "damage", amount: 0, scale: { type: "enemy-cell-count", factor: 2 } }] }),
];

const exclusive = [
  emoji("rookie_guard", "🙆", "어설픈 방어", "Bingo: 방어막 3, HP 1 회복", { tags: ["shield", "heal"], bingo: [{ type: "shield", amount: 3, basic: true }, { type: "heal", amount: 1, basic: true }] }),
  emoji("rookie_teddy", "🧸", "든든한 친구", "Bingo: HP 4 회복. 초과 회복은 방어막 전환", { tags: ["heal"], bingo: [{ type: "heal", amount: 4, overflowToShield: true }] }),
  emoji("rookie_book", "📘", "기본서", "Bingo: 이전 조건 없는 기본 수치 효과 반복", { rarity: "uncommon", tags: ["copy"], bingo: [{ type: "repeat-previous", multiplier: 1, requireBasic: true }] }),
  emoji("rookie_spark", "✨", "작은 가능성", "Bingo: 피해·회복·방어막 2", { rarity: "uncommon", tags: ["damage", "heal", "shield"], bingo: [{ type: "damage", amount: 2, basic: true }, { type: "heal", amount: 2, basic: true }, { type: "shield", amount: 2, basic: true }] }),
  emoji("rookie_stethoscope", "🩺", "상태 확인", "Bingo: 독과 약점 2 제거, HP 2 회복", { rarity: "uncommon", tags: ["heal"], bingo: [{ type: "cleanse", statuses: ["poison", "weakness"], amount: 2 }, { type: "heal", amount: 2 }] }),
  emoji("rookie_compass", "🧭", "다음 방향", "Bingo: 정밀·충전·행운 중 가장 낮은 자원 획득", { rarity: "rare", tags: ["magic"], bingo: [{ type: "lowest-resource", resources: [{ statusId: "precision", amount: 1 }, { statusId: "charge", amount: 2 }, { statusId: "luck", amount: 1 }] }] }),
  emoji("rookie_lunch", "🍱", "준비한 도시락", "Bingo: HP 5 회복, 실제 회복량의 30% 피해", { tags: ["food", "heal"], bingo: [{ type: "heal", amount: 5 }, { type: "heal-linked-damage", ratio: 0.3 }] }),
  emoji("rookie_training", "🏋️", "기초 훈련", "Bingo: 피해·방어막 3. Line에 쌍검이 있으면 각각 +2", { rarity: "uncommon", tags: ["damage", "shield"], bingo: [{ type: "damage", amount: 3, bonusWhen: { condition: { type: "line-emoji", emojiId: "sword" }, amount: 2 } }, { type: "shield", amount: 3, bonusWhen: { condition: { type: "line-emoji", emojiId: "sword" }, amount: 2 } }] }),
  emoji("rookie_medal", "🏅", "성장의 메달", "Owned: 조건 없는 피해·회복·방어막 +1", { rarity: "rare", tags: ["growth"], owned: { basicBonus: 1 } }),

  emoji("worker_hardhat", "⛑️", "단단한 안전모", "Bingo: 방어막 5. 이번 Turn 첫 방어막이면 +2", { tags: ["armor", "shield"], bingo: [{ type: "shield", amount: 5, bonusWhen: { condition: { type: "first-shield-this-turn" }, amount: 2 } }] }),
  emoji("worker_log", "🪵", "통나무 장벽", "Bingo: 방어막 5. 처리 후 2턴 유지", { tags: ["shield", "nature"], bingo: [{ type: "shield", amount: 5 }], retentionTurns: 2 }),
  emoji("worker_hammer", "🔨", "방패 강타", "Bingo: 현재 방어막 절반만큼 피해, 최대 10", { rarity: "uncommon", tags: ["weapon", "shield", "damage"], bingo: [{ type: "damage", amount: 0, scale: { type: "status", statusId: "shield", factor: 0.5 }, cap: 10 }] }),
  emoji("worker_vest", "🦺", "안전 조끼", "Owned: 적 Turn 첫 직접 피해 -2. Bingo: 방어막 2", { rarity: "uncommon", tags: ["armor", "shield"], bingo: [{ type: "shield", amount: 2 }], owned: { firstDamageReductionPerTurn: 2 } }),
  emoji("worker_barricade", "🚧", "완성된 방벽", "Bingo: 방어막을 모두 소비하고 소비량 +5 피해", { rarity: "rare", tags: ["shield", "damage"], bingo: [{ type: "consume-status-damage", statusId: "shield", factor: 1, bonus: 5, consumeAll: true }] }),
  emoji("worker_concrete", "🪨", "굳은 콘크리트", "Bingo: 방어막 7. 처리 후 3턴 유지", { rarity: "uncommon", tags: ["armor", "shield", "growth"], bingo: [{ type: "shield", amount: 7 }], retentionTurns: 3 }),
  emoji("worker_wrench", "🔧", "보강 렌치", "Bingo: Line의 armor와 machine마다 방어막 2", { tags: ["machine", "shield"], bingo: [{ type: "shield", amount: 0, scale: { type: "line-tag-count", tag: "armor", factor: 2 } }, { type: "shield", amount: 0, scale: { type: "line-tag-count", tag: "machine", factor: 2 } }] }),
  emoji("worker_crane", "🏗️", "대형 크레인", "Bingo: Double 이상이면 방어막 12와 가시 3, 아니면 방어막 3", { rarity: "rare", tags: ["machine", "shield"], bingo: [{ type: "shield", amount: 12, condition: { type: "multi", min: 2 }, elseAmount: 3 }, { type: "status", statusId: "thorns", amount: 3, condition: { type: "multi", min: 2 } }] }),
  emoji("worker_blueprint", "📐", "요새 설계도", "Owned: 방어막 상한 75%. Bingo: 방어막 2", { rarity: "uncommon", tags: ["shield"], bingo: [{ type: "shield", amount: 2 }], owned: { shieldCapRatio: 0.75 } }),

  emoji("clown_juggle", "🤹", "아슬아슬 저글링", "Bingo: 행운 1, 방어막 3", { tags: ["luck", "shield"], bingo: [{ type: "status", statusId: "luck", amount: 1 }, { type: "shield", amount: 3 }] }),
  emoji("clown_card", "🎴", "표시된 카드", "Bingo: 필중 1", { tags: ["crit"], bingo: [{ type: "status", statusId: "guaranteedCrit", amount: 1 }] }),
  emoji("clown_ticket", "🎟️", "황금 티켓", "Bingo: 행운 2. 행운 3 이상이면 정밀 1", { tags: ["luck", "crit"], bingo: [{ type: "status", statusId: "luck", amount: 2 }, { type: "status", statusId: "precision", amount: 1, condition: { type: "luck-at-least", value: 3 } }] }),
  emoji("clown_magic", "🪄", "손바닥 바꾸기", "Place: 희귀 가중치가 높은 무작위 Emoji로 변신", { rarity: "uncommon", tags: ["magic", "random"], place: [{ type: "transform", rareBoost: 2 }] }),
  emoji("clown_money", "💰", "대박 상금", "Bingo: 주사위 6이면 피해 24, 아니면 결과만큼 방어막과 행운 1", { rarity: "rare", tags: ["luck", "random"], bingo: [{ type: "dice", sides: 6, jackpotDamage: 24, otherwiseShield: true }] }),
  emoji("clown_envelope", "🧧", "붉은 봉투", "Bingo: 정밀 2·충전 4·회복 6 중 이전과 다른 하나", { rarity: "uncommon", tags: ["luck", "random"], bingo: [{ type: "random", noRepeatKey: "clown-envelope", options: [[{ type: "status", statusId: "precision", amount: 2 }], [{ type: "status", statusId: "charge", amount: 4 }], [{ type: "heal", amount: 6 }]] }] }),
  emoji("clown_spade", "♠️", "스페이드 에이스", "Bingo: 피해 5. 필중이 있으면 치명타 배율 4배", { rarity: "uncommon", tags: ["crit", "damage"], bingo: [{ type: "damage", amount: 5, critMultiplierWhenGuaranteed: 4 }] }),
  emoji("clown_circus", "🎪", "마지막 공연", "Bingo: 합산 피해에 치명타가 없으면 행운 2와 방어막 4", { rarity: "uncommon", tags: ["luck", "shield"], bingo: [{ type: "post-if-no-crit", luck: 2, shield: 4 }] }),
  emoji("clown_party", "🎉", "Double 축제", "Bingo: Double 이상이면 이후 직접 피해 확정 치명타", { rarity: "rare", tags: ["crit"], bingo: [{ type: "set-guaranteed-remaining", condition: { type: "multi", min: 2 } }] }),

  emoji("scientist_fang", "🐍", "합성 독니", "Bingo: 피해 2, 독 2", { tags: ["animal", "poison"], bingo: [{ type: "damage", amount: 2 }, { type: "status", statusId: "poison", target: "opponent", amount: 2 }] }),
  emoji("scientist_scorpion", "🦂", "농축 전갈독", "Bingo: 독 4. Double 이상이면 8", { rarity: "uncommon", tags: ["animal", "poison"], bingo: [{ type: "status", statusId: "poison", target: "opponent", amount: 4, bonusWhen: { condition: { type: "multi", min: 2 }, amount: 4 } }] }),
  emoji("scientist_flask", "🧪", "불안정 물질", "Bingo: 충전 3, 자신에게 독 1", { tags: ["charge", "poison"], bingo: [{ type: "status", statusId: "charge", amount: 3 }, { type: "status", statusId: "poison", amount: 1 }] }),
  emoji("scientist_suit", "🥼", "생체 연구복", "Owned: 자신이 부여하는 독 +1", { rarity: "uncommon", tags: ["poison"], owned: { poisonBonus: 1 } }),
  emoji("scientist_injection", "💉", "급속 주입", "Bingo: 독 3, 약점 3", { rarity: "uncommon", tags: ["poison", "crit"], bingo: [{ type: "status", statusId: "poison", target: "opponent", amount: 3 }, { type: "status", statusId: "weakness", target: "opponent", amount: 3 }] }),
  emoji("scientist_culture", "🧫", "증식 배양액", "Bingo: 대상의 다음 독 피해 후 독이 감소하지 않음", { rarity: "rare", tags: ["poison", "growth"], bingo: [{ type: "status", statusId: "poisonNoDecay", target: "opponent", amount: 1 }] }),
  emoji("scientist_herb", "🌿", "배양 해독초", "Bingo: 자신의 독 전부 제거, 제거량만큼 최대 8 회복", { tags: ["nature", "heal"], bingo: [{ type: "cleanse", statuses: ["poison"], amount: "all", healPerRemoved: 1, healCap: 8 }] }),
  emoji("scientist_detonator", "🧯", "독성 기폭", "Bingo: 대상 독을 모두 소비하고 2배 피해", { rarity: "rare", tags: ["poison", "damage"], bingo: [{ type: "consume-status-damage", statusId: "poison", target: "opponent", factor: 2, consumeAll: true }] }),
  emoji("scientist_disassembly", "🧬", "유전자 붕괴", "Place: 자신과 상하좌우 중 무작위 점유 Cell 하나를 파괴", { rarity: "uncommon", tags: ["board-control"], place: [{ type: "destroy", pattern: "random-cross" }] }),

  emoji("rage_fist", "👊", "분노의 주먹", "Bingo: 피해 4. HP 50% 이하면 7", { tags: ["gesture", "damage"], bingo: [{ type: "damage", amount: 4, bonusWhen: { condition: { type: "hp-at-most", ratio: 0.5 }, amount: 3 } }] }),
  emoji("rage_mark", "💢", "끓는 분노", "Bingo: HP 2를 잃고 이후 직접 피해마다 +2", { tags: ["face", "damage"], bingo: [{ type: "self-damage", amount: 2 }, { type: "set-damage-bonus", amount: 2 }] }),
  emoji("rage_swear", "🤬", "참지 못한 욕설", "Bingo: HP 2를 잃고 피해 7", { rarity: "uncommon", tags: ["face", "damage"], bingo: [{ type: "self-damage", amount: 2 }, { type: "damage", amount: 7 }] }),
  emoji("rage_axe", "🪓", "무모한 도끼", "Bingo: HP 3을 잃고 피해 10", { rarity: "uncommon", tags: ["weapon", "damage"], bingo: [{ type: "self-damage", amount: 3 }, { type: "damage", amount: 10 }] }),
  emoji("rage_muscle", "💪", "억눌린 힘", "Owned: 모든 직접 피해 +1. Bingo: HP 1을 잃음", { rarity: "uncommon", tags: ["gesture", "damage"], bingo: [{ type: "self-damage", amount: 1 }], owned: { damageBonus: 1 } }),
  emoji("rage_broken", "💔", "부서진 이성", "Bingo: HP 3을 잃고 정밀 2", { tags: ["curse", "crit"], bingo: [{ type: "self-damage", amount: 3 }, { type: "status", statusId: "precision", amount: 2 }] }),
  emoji("rage_breath", "😤", "들끓는 숨", "Bingo: 방어막 4. HP 50% 이하면 8", { tags: ["face", "shield"], bingo: [{ type: "shield", amount: 4, bonusWhen: { condition: { type: "hp-at-most", ratio: 0.5 }, amount: 4 } }] }),
  emoji("rage_brain", "🧠", "끊어진 제동", "Bingo: HP 4를 잃고 필중 1", { rarity: "uncommon", tags: ["curse", "crit"], bingo: [{ type: "self-damage", amount: 4 }, { type: "status", statusId: "guaranteedCrit", amount: 1 }] }),
  emoji("rage_burst", "🤯", "폭발 직전", "Bingo: 잃은 HP의 20% 피해, 최대 12", { rarity: "rare", tags: ["face", "damage"], bingo: [{ type: "damage", amount: 0, scale: { type: "missing-hp", factor: 0.2 }, cap: 12 }] }),
];

export const EMOJIS: Record<string, EmojiDefinition> = Object.fromEntries(
  [...common, ...exclusive].map((item) => [item.id, item]),
);

export const COMMON_EMOJI_IDS = common.map((item) => item.id);
export const CHARACTER_REWARD_POOLS: Record<string, string[]> = {
  rookie: exclusive.slice(0, 9).map((item) => item.id),
  worker: exclusive.slice(9, 18).map((item) => item.id),
  clown: exclusive.slice(18, 27).map((item) => item.id),
  scientist: exclusive.slice(27, 36).map((item) => item.id),
  rage: exclusive.slice(36, 45).map((item) => item.id),
};

export const TRANSFORM_EMOJI_IDS = [...COMMON_EMOJI_IDS, ...Object.values(CHARACTER_REWARD_POOLS).flat()]
  .filter((id) => !EMOJIS[id].onPlace?.some((effect) => effect.type === "transform"));
