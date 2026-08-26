import type { EnemyDefinition } from "../game/types";

export const ENEMIES: EnemyDefinition[] = [
  {
    id: "prairie_rat", icon: "🐀", name: "들쥐 정찰병", maxHp: 18,
    ability: "황급한 도주: 한 번에 HP를 8 이상 잃으면 방어막 4를 얻습니다. 전투당 한 번입니다.", abilityId: "hasty-escape",
    pool: { rabbit: 3, sheep: 2, ant: 2, hedgehog: 1, eagle: 1 }, stages: [1], kind: "normal", ai: "nearest-line",
  },
  {
    id: "venom_fox", icon: "🦊", name: "독꼬리 여우", maxHp: 20,
    ability: "독꼬리: 처음 완성한 Bingo가 플레이어에게 독 2를 추가합니다.", abilityId: "venom-tail",
    pool: { bee: 4, spider: 2, ant: 1, rabbit: 1, hedgehog: 1 }, stages: [1], kind: "normal", ai: "nearest-line",
  },
  {
    id: "thorn_boar", icon: "🐗", name: "가시 멧돼지", maxHp: 23,
    ability: "마지막 가시: 플레이어가 방어막을 완전히 파괴하면 피해 2로 반격합니다. Turn당 한 번입니다.", abilityId: "last-thorn",
    pool: { hedgehog: 3, sheep: 3, rabbit: 1, ant: 1, eagle: 1 }, stages: [1], kind: "normal", ai: "nearest-line",
  },
  {
    id: "hunting_raccoon", icon: "🦝", name: "사냥꾼 너구리", maxHp: 22,
    ability: "기습 조준: Enemy Bingo의 첫 직접 피해 치명타 확률이 25%p 증가합니다.", abilityId: "ambush-aim",
    pool: { eagle: 1, wolf: 3, rabbit: 2, ant: 2, bee: 1 }, stages: [1], kind: "normal", ai: "nearest-line",
  },
  {
    id: "pack_bear", icon: "🐻", name: "무리곰", maxHp: 33,
    ability: "무리 사냥: animal Emoji가 3개 이상인 Bingo는 피해 +5, HP +3을 얻습니다.", abilityId: "pack-hunt",
    pool: { wolf: 3, ant: 2, sheep: 1, eagle: 1, bee: 1, rabbit: 1 }, stages: [1], kind: "elite", ai: "nearest-line",
  },
  {
    id: "web_crocodile", icon: "🐊", name: "늪지 악어", maxHp: 36,
    ability: "포획 덫: 적 Turn 종료 시 인접 빈칸 하나에 배치 시 독 2를 받는 덫을 예고합니다.", abilityId: "snare-trap",
    pool: { spider: 3, bee: 2, hedgehog: 1, ant: 1, rabbit: 1, wolf: 1 }, stages: [1], kind: "elite", ai: "nearest-line",
  },
  {
    id: "prairie_lion", icon: "🦁", name: "초원의 왕", maxHp: 43,
    ability: "왕의 포효: 플레이어 Bingo마다 포효를 쌓고, 다음 Enemy Bingo에서 중첩당 피해 3·방어막 2를 얻습니다.", abilityId: "royal-roar",
    pool: { wolf: 2, sheep: 2, eagle: 1, rabbit: 1, ant: 1, hedgehog: 1, bee: 1 }, stages: [1], kind: "boss", ai: "nearest-line",
  },

  {
    id: "encore_hand", icon: "👋", name: "앙코르 손", maxHp: 26,
    ability: "한 번 더 인사: 처음 추가 배치를 얻을 때 방어막 3을 함께 얻습니다.", abilityId: "encore-shield",
    pool: { extra_turn: 3, cycle: 1, bell: 2, megaphone: 1, mask: 2 }, stages: [2], kind: "normal", ai: "nearest-line",
  },
  {
    id: "stop_hand", icon: "✋", name: "정지 신호", maxHp: 30,
    ability: "잠깐!: 플레이어가 Double Bingo 이상을 완성하면 방어막 4를 얻습니다.", abilityId: "double-response",
    pool: { boxing_glove: 3, brick: 2, helmet: 2, amulet: 1, bell: 1 }, stages: [2], kind: "normal", ai: "nearest-line",
  },
  {
    id: "perfect_hand", icon: "👌", name: "완벽주의 손", maxHp: 28,
    ability: "완벽한 각도: 대각선 Enemy Bingo의 직접 피해 치명타 확률이 20%p 증가합니다.", abilityId: "diagonal-precision",
    pool: { target: 3, lightning: 2, knife: 1, diamond: 1, bow: 1, magnifier: 1 }, stages: [2], kind: "normal", ai: "nearest-line",
  },
  {
    id: "pinch_hand", icon: "🤏", name: "한 꼬집", maxHp: 29,
    ability: "조금만 더: Enemy Bingo의 합산 피해가 5 이하이면 피해 3을 추가합니다.", abilityId: "small-finish",
    pool: { lone_blade: 3, thief: 2, knife: 1, magnifier: 1, mirror: 1, hourglass: 1 }, stages: [2], kind: "normal", ai: "nearest-line",
  },
  {
    id: "rock_hand", icon: "🤘", name: "록스타 손", maxHp: 42,
    ability: "피드백 공연: 두 번째 Enemy Bingo마다 마지막 수치 효과를 50%로 반복합니다.", abilityId: "feedback-show",
    pool: { bell: 2, megaphone: 2, lightning: 1, firecracker: 1, eruption: 1, extra_turn: 1, mirror: 1 }, stages: [2], kind: "elite", ai: "nearest-line",
  },
  {
    id: "boo_hand", icon: "👎", name: "야유단장", maxHp: 44,
    ability: "혹평: 플레이어가 피해 없는 Bingo를 만들면 약점 2를 부여합니다. Turn당 한 번입니다.", abilityId: "harsh-review",
    pool: { magnifier: 3, target: 2, boxing_glove: 1, thief: 1, pain_exchange: 1, mirror: 1 }, stages: [2], kind: "elite", ai: "nearest-line",
  },
  {
    id: "applause_king", icon: "🙌", name: "박수왕", maxHp: 56,
    ability: "생방송 3부제: 세 번째 Enemy Turn마다 예고된 Emoji를 두 번 배치합니다. 두 번째 배치는 연쇄되지 않습니다.", abilityId: "three-act-show",
    pool: { dice: 1, coin: 1, slot: 1, joker: 1, mask: 1, cycle: 1, bell: 1, megaphone: 1, mirror: 1 }, stages: [2], kind: "boss", ai: "nearest-line",
  },

  {
    id: "glitch_alien", icon: "👾", name: "글리치 외계체", maxHp: 35,
    ability: "오류 감염: 매 3번째 플레이어 Turn의 Draw 하나가 배치 시 무작위 공용 Emoji로 변합니다.", abilityId: "glitch-infection",
    pool: { comet: 2, starlight: 2, black_hole: 1, vortex: 1, rainbow: 1, rocket: 1, diamond: 1 }, stages: [3], kind: "normal", ai: "nearest-line",
  },
  {
    id: "abduction_ship", icon: "🛸", name: "납치선", maxHp: 37,
    ability: "납치 예고: 매 3번째 Enemy Turn에 점유 Cell을 표시하고 다음 Enemy Turn 시작에 제거합니다.", abilityId: "abduction-mark",
    pool: { magnet: 2, vortex: 2, rocket: 2, cycle: 1, puzzle: 1, comet: 1 }, stages: [3], kind: "normal", ai: "nearest-line",
  },
  {
    id: "ring_predator", icon: "🪐", name: "고리 포식자", maxHp: 39,
    ability: "중력 우물: 중앙 Cell을 포함한 Enemy Bingo를 완성하면 방어막 6을 얻습니다.", abilityId: "gravity-well",
    pool: { black_hole: 2, comet: 2, starlight: 1, hourglass: 2, rainbow: 1, amulet: 1 }, stages: [3], kind: "normal", ai: "nearest-line",
  },
  {
    id: "dark_moon", icon: "🌚", name: "암월", maxHp: 40,
    ability: "개기월식: HP가 50% 이하인 동안 양쪽 HP 회복량이 50% 감소합니다.", abilityId: "eclipse",
    pool: { miasma: 2, evil_eye: 2, candle: 2, pain_exchange: 1, blood: 1, black_hole: 1 }, stages: [3], kind: "normal", ai: "nearest-line",
  },
  {
    id: "nebula_oracle", icon: "🔮", name: "성운 예언자", maxHp: 50,
    ability: "불길한 예언: 예고된 방향으로 플레이어가 Bingo하면 방어막 6을 얻고 약점 2를 부여합니다.", abilityId: "prophecy",
    pool: { mirror: 2, diamond: 2, evil_eye: 1, gift: 1, hourglass: 1, rainbow: 1, crown: 1 }, stages: [3], kind: "elite", ai: "nearest-line",
  },
  {
    id: "star_warlock", icon: "🧙‍♂️", name: "별의 주술사", maxHp: 53,
    ability: "주술 반향: 두 번째 Enemy Bingo마다 처음 부여한 비HP 상태 효과를 한 번 더 부여합니다.", abilityId: "hex-echo",
    pool: { catalyst: 2, miasma: 2, zombie: 1, candle: 1, mirror: 1, amulet: 1, black_hole: 1 }, stages: [3], kind: "elite", ai: "nearest-line",
  },
  {
    id: "living_cosmos", icon: "🌌", name: "살아있는 우주", maxHp: 68,
    ability: "심연의 삼막: HP에 따라 메아리, 약점 저주, 양쪽 피해 50% 증가 Phase로 전환합니다.", abilityId: "abyss-phases",
    pool: { black_hole: 2, rainbow: 1, comet: 1, mirror: 1, megaphone: 1, vortex: 1, crown: 1, hourglass: 1 }, stages: [3], kind: "boss", ai: "nearest-line",
  },
];
