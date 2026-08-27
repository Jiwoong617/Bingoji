import type { EventChoice, GameEventDefinition, RunModifier } from "../game/types";

const c = (id: string, label: string, hint: string, effects: EventChoice["effects"], selection?: EventChoice["selection"]): EventChoice => ({ id, label, hint, effects, selection });
const modifier = (id: string, name: string, icon: string, description: string, values: Partial<RunModifier> = {}): RunModifier => ({ id, name, icon, description, ...values });

export const EVENTS: GameEventDefinition[] = [
  {
    id: "mystery-box", icon: "📦", title: "수상한 상자", content: "길 한가운데서 안쪽이 쿵쿵거리는 상자를 발견했습니다.", category: "legacy",
    choices: [c("open", "상자를 연다", "HP 4를 잃고 💣 폭탄을 얻습니다.", [{ type: "damage", amount: 4 }, { type: "add-emoji", emojiId: "bomb" }]), c("leave", "지나간다", "아무 일도 일어나지 않습니다.", [])],
  },
  {
    id: "warm-spring", icon: "♨️", title: "Emoji 온천", content: "따뜻한 김 사이로 하트 모양 거품이 떠오릅니다.", category: "legacy",
    choices: [c("rest", "몸을 담근다", "HP를 8 회복합니다.", [{ type: "heal", amount: 8 }]), c("bottle", "거품을 담는다", "❤️ 하트를 얻습니다.", [{ type: "add-emoji", emojiId: "heart" }])],
  },
  {
    id: "ancient-idol", icon: "🗿", title: "고대의 석상", content: "석상은 힘을 바치는 자에게 흔들리지 않는 Emoji를 약속합니다.", category: "legacy",
    choices: [c("offer", "최대 HP를 바친다", "최대 HP -3, 🗿 모아이 획득", [{ type: "max-hp", amount: -3 }, { type: "add-emoji", emojiId: "statue" }]), c("pray", "조용히 기도한다", "최대 HP가 2 증가합니다.", [{ type: "max-hp", amount: 2 }])],
  },
  {
    id: "emoji-wind", icon: "🌬️", title: "정리의 바람", content: "Pool 속 오래된 Emoji 하나가 바람에 날아가려 합니다.", category: "legacy",
    choices: [c("release", "놓아준다", "무작위 Emoji 한 개 제거, HP 5 회복", [{ type: "remove-random-emoji" }, { type: "heal", amount: 5 }]), c("hold", "붙잡는다", "Pool을 그대로 유지합니다.", [])],
  },

  {
    id: "pregnant-man", icon: "🫃", title: "내가 임신했소", content: "한 남자가 배를 쓰다듬으며 이 아이가 행운을 가져올 거라고 말합니다.", category: "base",
    choices: [
      c("believe", "남자를 믿기", "70% 선물+회복 / 30% 세균+피해", [{ type: "random-branch", branches: [
        { weight: 70, label: "정말이었다", effects: [{ type: "add-emoji", emojiId: "gift" }, { type: "heal", amount: 4 }] },
        { weight: 30, label: "뭔가 이상하다", effects: [{ type: "add-emoji", emojiId: "germ" }, { type: "damage", amount: 3 }] },
      ] }]),
      c("doubt", "남자를 믿지 않기", "HP -3, 🔍 약점 분석 획득", [{ type: "damage", amount: 3 }, { type: "add-emoji", emojiId: "magnifier" }]),
    ],
  },
  {
    id: "melting-person", icon: "🫠", title: "정말 괜찮습니다", content: "사람이 바닥으로 녹아내리면서도 계속 괜찮다고 주장합니다.", category: "base",
    choices: [c("pass", "믿고 지나간다", "HP 7 회복", [{ type: "heal", amount: 7 }]), c("bottle", "병에 담아 돕는다", "HP -3, 🌀 작은 소용돌이", [{ type: "damage", amount: 3 }, { type: "add-emoji", emojiId: "vortex" }]), c("soap", "비누로 씻어준다", "최대 HP -2, 🧼 해독 비누", [{ type: "max-hp", amount: -2 }, { type: "add-emoji", emojiId: "soap" }])],
  },
  {
    id: "tooth-fairy", icon: "🦷", title: "너무 큰 이빨", content: "요정 대신 거대한 이빨 하나가 베개 위에서 기다립니다.", category: "base",
    choices: [c("pull", "이빨을 뽑는다", "최대 HP -3, 💎 예리한 보석", [{ type: "max-hp", amount: -3 }, { type: "add-emoji", emojiId: "diamond" }]), c("brush", "깨끗이 닦는다", "HP 8 회복, 🧼 해독 비누", [{ type: "heal", amount: 8 }, { type: "add-emoji", emojiId: "soap" }]), c("sleep", "못 본 척 잔다", "아무 일도 없습니다.", [])],
  },
  {
    id: "hungry-hole", icon: "🕳️", title: "배고픈 구멍", content: "바닥의 구멍이 ‘하나만 줘’라고 속삭입니다.", category: "base",
    choices: [c("feed-hp", "HP를 먹인다", "최대 HP -3, 🕳️ 공허의 대가", [{ type: "max-hp", amount: -3 }, { type: "add-emoji", emojiId: "black_hole" }]), c("feed-emoji", "Emoji를 던진다", "무작위 Emoji 제거, HP 6 회복", [{ type: "remove-random-emoji" }, { type: "heal", amount: 6 }]), c("leave", "구멍을 피한다", "아무 일도 없습니다.", [])],
  },
  {
    id: "free-cheese", icon: "🪤", title: "공짜 치즈", content: "누가 봐도 덫 위에 케이크가 놓여 있습니다.", category: "stage", stages: [1],
    choices: [c("trust", "무료를 믿는다", "HP -5, 🍰 완성된 만찬", [{ type: "damage", amount: 5 }, { type: "add-emoji", emojiId: "cake" }]), c("disarm", "덫만 해체한다", "HP -2, 🧱 벽돌", [{ type: "damage", amount: 2 }, { type: "add-emoji", emojiId: "brick" }]), c("photo", "사진만 찍고 간다", "HP 3 회복", [{ type: "heal", amount: 3 }])],
  },
  {
    id: "offseason-santa", icon: "🧑‍🎄", title: "비수기 산타", content: "한여름의 산타가 남은 선물을 정리하고 있습니다.", category: "stage", stages: [2],
    choices: [c("gift", "포장된 선물", "HP -2, 🎁 깜짝 선물", [{ type: "damage", amount: 2 }, { type: "add-emoji", emojiId: "gift" }]), c("return", "반품된 선물", "최대 HP -2, 🃏 조커", [{ type: "max-hp", amount: -2 }, { type: "add-emoji", emojiId: "joker" }]), c("cookie", "쿠키만 먹는다", "HP 6 회복", [{ type: "heal", amount: 6 }])],
  },
  {
    id: "wrong-grave", icon: "🪦", title: "이름이 같은 묘비", content: "아직 살아 있는데 자신의 이름이 적힌 묘비가 있습니다.", category: "stage", stages: [1],
    choices: [c("break", "묘비를 부순다", "HP -5, 최대 HP +4", [{ type: "damage", amount: 5 }, { type: "max-hp", amount: 4 }]), c("flower", "꽃을 놓는다", "🌱 씨앗, HP 3 회복", [{ type: "add-emoji", emojiId: "seed" }, { type: "heal", amount: 3 }]), c("play-dead", "죽은 척 눕는다", "HP -2, 💀 해골", [{ type: "damage", amount: 2 }, { type: "add-emoji", emojiId: "skull" }])],
  },
  {
    id: "genie-bottle", icon: "🧞", title: "소원 한 개 반", content: "예산이 부족한 지니가 소원을 한 개 반만 들어준다고 합니다.", category: "base",
    choices: [c("power", "강해지고 싶다", "쌍검 2개, 최대 HP -2", [{ type: "add-emoji", emojiId: "sword" }, { type: "add-emoji", emojiId: "sword" }, { type: "max-hp", amount: -2 }]), c("luck", "운이 좋아지고 싶다", "클로버+동전, HP -4", [{ type: "add-emoji", emojiId: "clover" }, { type: "add-emoji", emojiId: "coin" }, { type: "damage", amount: 4 }]), c("again", "다시 고르고 싶다", "🔄 새로고침, 최대 HP -3", [{ type: "add-emoji", emojiId: "cycle" }, { type: "max-hp", amount: -3 }])],
  },
  {
    id: "soap-prophet", icon: "🧼", title: "모든 문제는 씻으면 됩니다", content: "말하는 비누가 인생 상담을 시작합니다.", category: "stage", stages: [1],
    choices: [c("body", "몸을 씻는다", "HP 9 회복", [{ type: "heal", amount: 9 }]), c("pool", "Pool을 씻는다", "무작위 Emoji 제거, HP 3 회복", [{ type: "remove-random-emoji" }, { type: "heal", amount: 3 }]), c("take", "비누를 데려간다", "🧼 해독 비누", [{ type: "add-emoji", emojiId: "soap" }])],
  },
  {
    id: "rocket-delivery", icon: "🚀", title: "배송지가 달입니다", content: "택배 기사가 달까지 갈 물건을 맡아 달라고 합니다.", category: "stage", stages: [3],
    choices: [c("deliver", "대신 배송한다", "HP -5, ☄️ 혜성", [{ type: "damage", amount: 5 }, { type: "add-emoji", emojiId: "comet" }]), c("borrow", "로켓만 빌린다", "최대 HP -2, 🚀 로켓", [{ type: "max-hp", amount: -2 }, { type: "add-emoji", emojiId: "rocket" }]), c("wrong", "주소가 틀렸다고 말한다", "루키는 🧭, 나머지는 ⭐", [{ type: "add-character-or-common", characterId: "rookie", characterEmojiId: "rookie_compass", commonEmojiId: "starlight" }])],
  },

  {
    id: "emoji-divorce", icon: "🧑‍⚖️", title: "Emoji 이혼 법정", content: "서로 다른 두 Emoji 중 누구의 편을 들지 정해야 합니다.", category: "base",
    choices: [c("first", "첫 번째 편을 든다", "첫 Emoji 복제, 두 번째 제거", [{ type: "duplicate-selected", selectionIndex: 0, count: 1 }, { type: "remove-selected", selectionIndex: 1, count: 1 }], { count: 2, distinct: true }), c("second", "두 번째 편을 든다", "두 번째 복제, 첫 번째 제거", [{ type: "duplicate-selected", selectionIndex: 1, count: 1 }, { type: "remove-selected", selectionIndex: 0, count: 1 }], { count: 2, distinct: true }), c("reconcile", "화해시킨다", "HP -5, 두 Emoji 중 하나 복제", [{ type: "damage", amount: 5 }, { type: "random-branch", branches: [{ weight: 50, label: "첫 번째", effects: [{ type: "duplicate-selected", selectionIndex: 0, count: 1 }] }, { weight: 50, label: "두 번째", effects: [{ type: "duplicate-selected", selectionIndex: 1, count: 1 }] }] }], { count: 2, distinct: true })],
  },
  {
    id: "clone-vat", icon: "🧬", title: "복제 배양조", content: "배양조가 선택한 Emoji를 ‘거의 완벽하게’ 복제합니다.", category: "base",
    choices: [c("safe", "안정 복제", "일반 Emoji 복제, HP -3", [{ type: "duplicate-selected", count: 1 }, { type: "damage", amount: 3 }], { count: 1, filter: { rarities: ["common"] } }), c("overcharge", "과충전 복제", "고급/희귀 복제, 최대 HP -3", [{ type: "duplicate-selected", count: 1 }, { type: "max-hp", amount: -3 }], { count: 1, filter: { rarities: ["uncommon", "rare"] } }), c("break", "배양조를 분해한다", "⚙️ 증폭 기어", [{ type: "add-emoji", emojiId: "gear" }])],
  },
  {
    id: "brain-swap", icon: "🧠", title: "생각을 바꿔드립니다", content: "두 Emoji의 보유 개수를 서로 바꿀 수 있습니다.", category: "base",
    choices: [c("swap", "사본 수를 교환한다", "두 종류의 보유 개수 교환", [{ type: "swap-selected-counts" }], { count: 2, distinct: true }), c("erase", "한쪽 생각을 지운다", "선택 Emoji 제거, HP 5 회복", [{ type: "remove-selected", count: 1 }, { type: "heal", amount: 5 }], { count: 1 }), c("take", "뇌를 데려간다", "광전사는 🧠, 나머지는 💡", [{ type: "add-character-or-common", characterId: "rage", characterEmojiId: "rage_brain", commonEmojiId: "bulb" }])],
  },
  {
    id: "invisible-pickpocket", icon: "🫥", title: "보이지 않는 소매치기", content: "주머니가 가벼워졌지만 범인은 보이지 않습니다.", category: "base",
    choices: [c("bait", "Emoji를 미끼로 놓는다", "50% 복제 / 50% 제거", [{ type: "random-branch", branches: [{ weight: 50, label: "복제", effects: [{ type: "duplicate-selected", count: 1 }] }, { weight: 50, label: "도난", effects: [{ type: "remove-selected", count: 1 }] }] }], { count: 1 }), c("track", "발자국을 추적한다", "HP -3, 🔍 약점 분석", [{ type: "damage", amount: 3 }, { type: "add-emoji", emojiId: "magnifier" }]), c("ignore", "모른 척한다", "가장 많은 Emoji 제거, 🪙 획득", [{ type: "remove-most-common" }, { type: "add-emoji", emojiId: "coin" }])],
  },
  {
    id: "identity-laundry", icon: "🥸", title: "신분 세탁소", content: "가짜 콧수염을 쓴 주인이 Emoji의 이름표를 바꿔 줍니다.", category: "base",
    choices: [c("normal", "일반 세탁", "같은 태그의 다른 일반 Emoji로 변환", [{ type: "transform-selected", filter: { rarities: ["common"], commonOnly: true, sameTagsAsSelected: true } }], { count: 1, filter: { rarities: ["common"] } }), c("premium", "고급 세탁", "고급 Emoji를 희귀로 변환, 최대 HP -3", [{ type: "transform-selected", filter: { rarities: ["rare"], commonOnly: true } }, { type: "max-hp", amount: -3 }], { count: 1, filter: { rarities: ["uncommon"] } }), c("mustache", "콧수염만 산다", "Emoji 제거, 🎭 가면 획득", [{ type: "remove-selected", count: 1 }, { type: "add-emoji", emojiId: "mask" }], { count: 1 })],
  },
  {
    id: "goose-theft", icon: "🪿", title: "거위가 훔쳐 갔다", content: "거위가 Pool의 Emoji 하나를 물고 달아납니다.", category: "base",
    choices: [c("chase", "끝까지 쫓는다", "선택 Emoji 복제, HP -6", [{ type: "duplicate-selected", count: 1 }, { type: "damage", amount: 6 }], { count: 1 }), c("trade", "다른 것을 던진다", "대신 선택한 Emoji 한 개 제거", [{ type: "remove-selected", count: 1 }], { count: 1 }), c("release", "보내준다", "Emoji 제거, 최대 HP +2", [{ type: "remove-selected", count: 1 }, { type: "max-hp", amount: 2 }], { count: 1 })],
  },
  {
    id: "balance-scale", icon: "⚖️", title: "지나치게 공정한 저울", content: "가장 많은 Emoji와 가장 적은 Emoji가 불공평하다고 합니다.", category: "stage", stages: [2],
    choices: [c("balance", "개수를 맞춘다", "가장 많은 종류 -1, 가장 적은 종류 +1", [{ type: "remove-most-common" }, { type: "duplicate-least-common", count: 1 }]), c("tilt", "저울을 기울인다", "선택 Emoji 복제, 무작위 제거", [{ type: "duplicate-selected", count: 1 }, { type: "remove-random-emoji" }], { count: 1 }), c("break", "저울을 부순다", "HP -4, 💥 소거 폭발", [{ type: "damage", amount: 4 }, { type: "add-emoji", emojiId: "demolition" }])],
  },
  {
    id: "nesting-doll", icon: "🪆", title: "끝이 없는 인형", content: "인형 안에서 더 작은 Emoji가 계속 나옵니다.", category: "base",
    choices: [c("open", "계속 연다", "선택한 일반 Emoji 3개 추가", [{ type: "duplicate-selected", count: 3 }], { count: 1, filter: { rarities: ["common"] } }), c("stop", "중간에서 멈춘다", "일반 Emoji 복제, HP 4 회복", [{ type: "duplicate-selected", count: 1 }, { type: "heal", amount: 4 }], { count: 1, filter: { rarities: ["common"] } }), c("smash", "한 번에 부순다", "무작위 Emoji 2개 제거, 희귀 1개", [{ type: "remove-random-emoji", count: 2 }, { type: "add-random-emoji", filter: { rarities: ["rare"], commonOnly: true } }])],
  },
  {
    id: "mirror-contract", icon: "🪞", title: "거울 속 공동 투자", content: "거울 속의 자신이 똑같은 투자를 제안합니다.", category: "base",
    choices: [c("contract", "계약한다", "Emoji 복제, 다음 Enemy도 한 개 사용", [{ type: "duplicate-selected", count: 1 }, { type: "add-modifier", modifier: modifier("enemy-pool-copy", "거울 계약", "🪞", "다음 Enemy Pool에 선택 Emoji 한 개 추가", { remainingBattles: 1, emojiId: "$selected0" }) }], { count: 1 }), c("cheat", "거울을 속인다", "Emoji 복제, 다음 전투 시작 HP -4", [{ type: "duplicate-selected", count: 1 }, { type: "add-modifier", modifier: modifier("battle-start-damage", "깨진 약속", "🪞", "다음 전투 시작 시 HP 4 감소", { remainingBattles: 1, value: 4 }) }], { count: 1 }), c("break", "거울을 깬다", "최대 HP -2, 🪞 메아리 거울", [{ type: "max-hp", amount: -2 }, { type: "add-emoji", emojiId: "mirror" }])],
  },
  {
    id: "emoji-auction", icon: "🫵", title: "바로 당신입니다", content: "경매사가 Pool의 Emoji 하나를 오늘의 상품으로 지목합니다.", category: "base",
    choices: [c("sell", "판매한다", "선택 종류 전체 제거, 2개 이상이면 희귀 획득", [{ type: "add-random-emoji", filter: { rarities: ["rare"], commonOnly: true }, minSelectedCopies: 2 }, { type: "remove-selected", count: "all" }], { count: 1 }), c("buy", "낙찰받는다", "선택 Emoji 복제, HP -5", [{ type: "duplicate-selected", count: 1 }, { type: "damage", amount: 5 }], { count: 1 }), c("interrupt", "경매를 방해한다", "무작위 제거, 최대 HP -3, 📣 획득", [{ type: "remove-random-emoji" }, { type: "max-hp", amount: -3 }, { type: "add-emoji", emojiId: "megaphone" }])],
  },
  {
    id: "fussy-chef", icon: "🧑‍🍳", title: "Emoji는 다섯 가지 맛", content: "요리사가 Pool의 재료 구성을 평가합니다.", category: "base",
    choices: [c("same", "같은 재료를 늘린다", "food Emoji 2개 복제", [{ type: "duplicate-selected", count: 2 }], { count: 1, filter: { tags: ["food"] } }), c("new", "새 맛을 넣는다", "현재 Pool에 없는 food Emoji 획득", [{ type: "add-random-emoji", filter: { tags: ["food"], commonOnly: true, notOwned: true } }]), c("clean", "주방을 정리한다", "food Emoji를 1~2개 제거, 개당 HP 3 회복", [{ type: "remove-all-selected" }, { type: "heal-per-selection", amount: 3 }], { count: 2, minCount: 1, distinct: true, filter: { tags: ["food"] } })],
  },
  {
    id: "thread-of-fate", icon: "🧵", title: "운명의 실밥", content: "재봉사가 서로 다른 두 Emoji를 한 실로 묶어 줍니다.", category: "base",
    choices: [c("link", "둘을 묶는다", "다음 3전투 동안 함께 Draw될 확률 증가", [{ type: "add-modifier", modifier: modifier("linked-draw", "운명의 실", "🧵", "연결된 두 Emoji가 함께 Draw될 확률 증가", { remainingBattles: 3, emojiId: "$selected-pair" }) }], { count: 2, distinct: true }), c("sew", "하나만 꿰맨다", "선택 Emoji 복제, HP -3", [{ type: "duplicate-selected", count: 1 }, { type: "damage", amount: 3 }], { count: 1 }), c("cut", "실을 끊는다", "선택 Emoji 제거, HP 5 회복", [{ type: "remove-selected", count: 1 }, { type: "heal", amount: 5 }], { count: 1 })],
  },

  {
    id: "ice-storage", icon: "🧊", title: "냉동 보관소", content: "Emoji를 한 전투 동안 얼려 보관할 수 있습니다.", category: "base",
    choices: [c("freeze", "냉동한다", "다음 전투 Draw 제외, 승리 후 1개 복제", [{ type: "add-modifier", modifier: modifier("freeze-emoji", "냉동 보관", "🧊", "다음 전투 Draw에서 제외되고 승리 후 복제", { remainingBattles: 1, emojiId: "$selected0" }) }], { count: 1 }), c("thaw", "급속 해동한다", "Emoji 복제, 다음 전투 첫 Draw 2개", [{ type: "duplicate-selected", count: 1 }, { type: "add-modifier", modifier: modifier("first-draw-size", "급속 해동", "🧊", "다음 전투 첫 Draw만 2개", { remainingBattles: 1, value: 2 }) }], { count: 1 }), c("ice", "얼음만 챙긴다", "다음 전투 시작 방어막 6", [{ type: "add-modifier", modifier: modifier("starting-shield", "보관소 얼음", "🧊", "다음 전투 시작 방어막 6", { remainingBattles: 1, value: 6 }) }])],
  },
  {
    id: "vibration-clinic", icon: "🫨", title: "진동 치료소", content: "의사가 너무 심하게 떨면서 부작용은 거의 없다고 말합니다.", category: "base",
    choices: [c("full", "전신 치료", "HP 전부 회복, 다음 전투 배치 20% 흔들림", [{ type: "heal", amount: 999 }, { type: "add-modifier", modifier: modifier("shaky-placement", "진동 부작용", "🫨", "다음 전투 배치가 20%로 인접 칸에 이동", { remainingBattles: 1, value: 0.2 }) }]), c("hand", "손만 치료", "HP 6 회복, 첫 배치 무작위·Bingo 효과 2배", [{ type: "heal", amount: 6 }, { type: "add-modifier", modifier: modifier("first-placement-boost", "진동 집중", "🫨", "다음 전투 첫 배치는 무작위 빈칸에 놓이고 그 Bingo 효과가 2배", { remainingBattles: 1 }) }]), c("tea", "의사를 진정시킨다", "🍵 진정의 차", [{ type: "add-emoji", emojiId: "tea" }])],
  },
  {
    id: "alien-customs", icon: "👽", title: "외계 세관", content: "세관원이 지구산 Emoji를 검사합니다.", category: "stage", stages: [3],
    choices: [c("declare", "희귀품을 신고한다", "다음 전투 제외, 승리 후 희귀 획득", [{ type: "add-modifier", modifier: modifier("freeze-rare-reward", "희귀품 신고", "👽", "다음 전투에서 제외되고 승리 후 희귀 보상", { remainingBattles: 1, emojiId: "$selected0" }) }], { count: 1, filter: { rarities: ["rare"] } }), c("smuggle", "밀수한다", "Emoji 복제, 다음 Enemy 첫 Turn 2회 배치", [{ type: "duplicate-selected", count: 1 }, { type: "add-modifier", modifier: modifier("enemy-first-double", "밀수 적발", "👽", "다음 Enemy 첫 Turn이 2회 배치", { remainingBattles: 1 }) }], { count: 1 }), c("fine", "정직하게 벌금을 낸다", "HP -5, 🧲 팔방 자석", [{ type: "damage", amount: 5 }, { type: "add-emoji", emojiId: "magnet" }])],
  },
  {
    id: "disco-floor", icon: "🪩", title: "멈출 수 없는 무도회", content: "바닥의 모든 칸이 리듬에 맞춰 빛납니다.", category: "stage", stages: [2],
    choices: [c("dance", "끝까지 춘다", "다음 전투 양쪽 첫 Bingo 피해·회복 +50%", [{ type: "add-modifier", modifier: modifier("first-bingo-boost", "무도회 열기", "🪩", "다음 전투 양쪽 첫 Bingo 피해·회복 50% 증가", { remainingBattles: 1, value: 1.5 }) }]), c("dj", "DJ를 매수한다", "다음 전투 첫 Draw 1회 새로고침", [{ type: "add-modifier", modifier: modifier("opening-redraw", "DJ의 선곡", "🪩", "다음 전투 첫 Draw를 자동으로 한 번 새로 뽑음", { remainingBattles: 1 }) }]), c("leave", "조용한 곳으로 도망간다", "HP 5 회복", [{ type: "heal", amount: 5 }])],
  },
  {
    id: "thirteenth-floor", icon: "🛗", title: "없는 13층", content: "엘리베이터에 존재하지 않아야 할 13층 버튼이 있습니다.", category: "stage", stages: [3],
    choices: [c("thirteen", "13층을 누른다", "다음 Map Elite, 보상 희귀 확률 +20%p", [{ type: "force-next-map", mapType: "elite" }, { type: "add-modifier", modifier: modifier("reward-rare-boost", "13층의 전리품", "🛗", "다음 전투 보상 희귀 확률 +20%p", { remainingBattles: 1, value: 20 }) }]), c("open", "문 열림 버튼", "다음 Map 후보를 정상적으로 새로 생성", []), c("stop", "비상 정지", "HP 7 회복, 다음 후보 하나는 일반 전투", [{ type: "heal", amount: 7 }, { type: "ensure-next-battle-option" }])],
  },

  {
    id: "mystery-egg", icon: "🥚", title: "정체불명의 알", content: "미지근하고 가끔 안에서 무언가 두드리는 알입니다.", category: "rare",
    choices: [c("incubate", "품는다", "다음 2전투 Draw 한 칸은 🥚, 이후 부화", [{ type: "add-modifier", modifier: modifier("forced-egg-draw", "알 품기", "🥚", "다음 2전투 Draw 한 칸이 효과 없는 알로 고정", { remainingBattles: 2 }) }, { type: "schedule-reward", reward: { id: "egg-hatch", name: "알 부화", icon: "🐣", mapsRemaining: 2, counter: "battle", kind: "egg-hatch", count: 1 } }]), c("crack", "깨뜨린다", "animal 또는 food Emoji 획득", [{ type: "random-branch", branches: [{ weight: 50, label: "animal", effects: [{ type: "add-random-emoji", filter: { tags: ["animal"], commonOnly: true } }] }, { weight: 50, label: "food", effects: [{ type: "add-random-emoji", filter: { tags: ["food"], commonOnly: true } }] }] }]), c("leave", "두고 간다", "아무 일도 없습니다.", [])],
  },
  {
    id: "babysitting", icon: "🧑‍🍼", title: "잠깐만 안아 주세요", content: "보호자가 딱 세 Map만 아기를 맡아 달라고 부탁합니다.", category: "rare",
    choices: [c("accept", "안아 준다", "3 Map 동안 👶가 Pool에 추가, 이후 특별 보상", [{ type: "add-emoji", emojiId: "event_baby" }, { type: "schedule-reward", reward: { id: "baby-return", name: "보호자의 귀환", icon: "🧑‍🍼", mapsRemaining: 3, kind: "baby-return", count: 1 } }]), c("refuse", "거절한다", "HP 4 회복", [{ type: "heal", amount: 4 }])],
  },
  {
    id: "future-self", icon: "🧓", title: "미래의 나", content: "미래의 자신이 지금의 Pool을 바꿀 마지막 기회라고 말합니다.", category: "rare",
    choices: [c("advice", "조언을 듣는다", "3 Map 뒤 현재 주 태그의 희귀 후보 3개", [{ type: "schedule-reward", reward: { id: "future-advice", name: "미래의 조언", icon: "🧓", mapsRemaining: 3, kind: "random-tag", tag: "$dominant", count: 1, choiceCount: 3 } }]), c("change", "미래를 바꾼다", "Emoji 제거, 3 Map 뒤 같은 희귀도 2개", [{ type: "remove-selected", count: 1 }, { type: "schedule-reward", reward: { id: "future-change", name: "바뀐 미래", icon: "🌀", mapsRemaining: 3, kind: "transform-selected", emojiId: "$selected0", count: 2 } }], { count: 1 }), c("fight", "싸움을 건다", "다음 Map에서 복제 Enemy와 전투, 승리 시 2개 복제", [{ type: "force-next-map", mapType: "battle" }, { type: "add-modifier", modifier: modifier("player-clone-enemy", "미래의 결투", "🧓", "다음 전투 Enemy가 현재 캐릭터와 Pool을 복제", { remainingBattles: 1 }) }, { type: "add-modifier", modifier: modifier("future-fight-reward", "미래의 전리품", "🌀", "승리 시 선택 Emoji 2개 복제", { remainingBattles: 1, emojiId: "$selected0" }) }], { count: 1 })],
  },
];
