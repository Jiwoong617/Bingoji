import type { StatusId } from "../game/types";

export interface StatusDefinition {
  name: string;
  icon: string;
  description: string;
}

export const STATUS_DEFINITIONS: Record<StatusId, StatusDefinition> = {
  shield: { name: "방어막", icon: "🛡️", description: "전투가 끝날 때까지 유지되며, 피해를 HP보다 먼저 흡수한 만큼 감소합니다." },
  thorns: { name: "가시", icon: "🌵", description: "방어막이 있을 때 직접 피해를 받으면 공격자에게 가시 수치만큼 반격합니다." },
  charge: { name: "충전", icon: "🔋", description: "기폭 효과에 사용하는 전투 자원입니다. 최대 20까지 중첩됩니다." },
  precision: { name: "정밀", icon: "🎯", description: "1당 치명타 확률이 10% 증가합니다. 최대 7까지 중첩됩니다." },
  guaranteedCrit: { name: "필중", icon: "🎴", description: "다음 직접 피해 하나가 확정 치명타가 된 뒤 1 감소합니다." },
  poison: { name: "독", icon: "☠️", description: "자신의 Turn 시작에 현재 수치만큼 피해를 받고, 피해 후 1 감소합니다." },
  weakness: { name: "약점", icon: "🔍", description: "다음에 받는 직접 피해가 이 수치만큼 증가한 뒤 사라집니다." },
  mark: { name: "표식", icon: "💢", description: "다음에 받는 직접 피해가 확정 치명타가 된 뒤 사라집니다." },
  luck: { name: "행운", icon: "🍀", description: "주사위·동전·변신 결과를 강화하며 무작위 효과 처리 후 1 감소합니다." },
  poisonNoDecay: { name: "독 미감소", icon: "🧫", description: "다음 독 피해가 발동한 뒤 독 수치가 감소하지 않습니다." },
};
