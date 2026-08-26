# Bingoji

플레이어와 적이 하나의 5×5 보드를 공유하는 Emoji 대전형 빙고 로그라이크 웹게임입니다.

마지막 빈칸을 채운 쪽이 Bingo의 주인이 되며, 라인에 놓인 양쪽 Emoji의 능력을 모두 자신의 효과로 사용합니다.

## 실행

```bash
npm install
npm run dev
```

프로덕션 빌드와 테스트:

```bash
npm run typecheck
npm test
npm run build
```

## 조작

1. 빈 Bingo Cell을 선택합니다.
2. 이번 Turn에 뽑힌 Emoji 중 하나를 선택해 배치합니다.
3. Cell을 선택하지 않은 상태에서 Emoji를 누르면 능력 정보를 볼 수 있습니다.
4. Board의 Emoji 또는 `MY POOL` 버튼을 눌러 상세 정보를 확인할 수 있습니다.

## 구현된 게임 흐름

- 메인 → 캐릭터 선택 → Map 선택
- 3 Stage × 10 Map Run
- 일반/Elite/Boss 전투, 물음표, 휴식
- 가중 Emoji Draw와 기본 적 AI
- 단일 및 다중 Bingo, 교차 Emoji, 라인 효과와 제거
- 순차 Bingo 발동, 피해·회복 투사체, HP 변화 애니메이션
- Pool에서 Draw되고 미사용 Emoji가 쓰레기통으로 이동하는 연출
- 추가 배치, Bingo 후 3턴 유지 Emoji, Draw 가능한 보유 중 효과 Emoji
- 전투 보상과 Emoji Pool 추가/제거
- 이벤트 선택지와 결과
- 사망 및 Stage 3 Boss 클리어 Result

자세한 구현 원칙과 미확정 정책은 `AGENTS.md`를 참고하세요.
