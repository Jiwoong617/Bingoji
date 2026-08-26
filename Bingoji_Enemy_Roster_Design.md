# Bingoji Stage별 적 콘텐츠 설계

> 상태: 구현됨  
> 목표: Stage마다 일반 4종, Elite 2종, Boss 1종으로 총 21종의 적을 구성한다.

## 1. 설계 기준

### 1.1 Enemy 아이콘과 Board Emoji를 분리한다

적의 초상화에 사용하는 Emoji는 다음 두 목록과 겹치지 않는다.

- `EMOJIS` registry에 등록되어 Bingo 칸에 들어가는 Emoji
- 플레이어 캐릭터 아이콘 `🙂 / 👷 / 🤡 / 🧑‍🔬 / 😡`

이 문서에서 제안하는 Enemy 아이콘 21개는 모두 현재 두 목록에 없는 Emoji다. Enemy의 전투 Pool은 실제 Board에 Emoji를 놓아야 하므로 기존 `EMOJIS` registry의 **공용 Emoji만** 사용한다. 캐릭터 전용 Emoji는 적에게 주지 않는다.

현재 Enemy Pool에서 사용 중인 Emoji는 다음 7종뿐이다.

`sword`, `fire`, `skull`, `heart`, `bomb`, `statue`, `battle_eye`

새 Enemy Pool에서는 위 7종을 사용하지 않는다. 따라서 기존에 적에게서 보기 어려웠던 동물 시너지, 손동작 예능, 기계·복사, 우주·주술 효과를 전투 중 자연스럽게 경험할 수 있다.

### 1.2 Stage별 학습 곡선

| Stage | 콘텐츠 군 | 주로 가르치는 것 | 전투 감각 |
|---|---|---|---|
| 1 | 동물 중심 | 태그 시너지, 독, 방어막, 치명타 | 읽기 쉽고 개성이 명확함 |
| 2 | 손동작·공연 중심 | 추가 배치, 치명타, 복사, 무작위 결과 | 우스꽝스럽지만 Combo가 강함 |
| 3 | 우주·초자연 중심 | Board 방해, 예고 패턴, 상태 증폭, 단계 변화 | 대응 판단을 요구하는 결전 |

### 1.3 공통 밸런스 원칙

- 모든 Enemy Pool은 정확히 9개로 통일한다.
- 같은 Emoji 사본 수가 해당 Enemy의 핵심 전략과 Draw 가중치를 보여준다.
- 모든 소수점은 버린다.
- Enemy 능력으로 발생한 피해에도 방어막이 정상 적용된다.
- 능력 발동 조건, 남은 Turn, 표식 Cell, Boss Phase는 상태 칸에서 항상 확인할 수 있게 한다.
- 플레이어가 대응할 수 없는 숨은 즉발 효과는 사용하지 않는다.
- 무작위 대상과 결과는 전부 seed 기반으로 결정한다.
- 일반 몬스터 능력은 한 문장으로 이해할 수 있게 하고, Elite부터 Board 규칙을 바꾸며, Boss는 Stage의 핵심 규칙을 종합한다.

## 2. Stage 1

### 2.1 Stage 콘셉트

Enemy 초상화는 현재 Board Emoji에 없는 동물로 구성한다. 전투 Pool은 `animal` 태그를 중심으로 묶는다. 일반 몬스터는 동물 Emoji의 기본 효과를 하나씩 보여주고, Elite와 Boss는 여러 동물을 한 Line에 모았을 때 생기는 시너지를 사용한다.

### 2.2 일반 몬스터 4종

#### `prairie_rat` 🐀 들쥐 정찰병

- 등급: 일반
- 최대 HP: 18
- 능력 — **황급한 도주**: 한 번의 피해 정산으로 HP를 8 이상 잃으면 방어막 4를 얻는다. 전투당 한 번만 발동한다.
- Pool: `rabbit×3`, `sheep×2`, `ant×2`, `hedgehog×1`, `eagle×1`
- AI 성향: Bingo가 가장 가까운 Line을 따른다.
- 플레이 감각: 첫 전투에서도 쉽게 이해할 수 있는 생존형 적이다. 작은 피해를 나눠 넣거나, 방어막까지 뚫을 큰 Combo를 준비할 수 있다.
- UI 표시: 미발동 상태에는 `도주 준비`, 발동 후에는 `도주 소진`으로 표시한다.

#### `venom_fox` 🦊 독꼬리 여우

- 등급: 일반
- 최대 HP: 20
- 능력 — **독꼬리**: 이 적이 전투에서 처음 Bingo를 완성하면 플레이어에게 독 2를 추가한다.
- Pool: `bee×4`, `spider×2`, `ant×1`, `rabbit×1`, `hedgehog×1`
- AI 성향: `bee` 또는 `spider`가 포함된 미완성 Line을 우선한다.
- 플레이 감각: Stage 1에서 독의 Turn 시작 피해와 감소 규칙을 가르친다. 첫 Bingo만 막으면 능력을 오래 봉인할 수 있다.
- UI 표시: `독꼬리 준비` 또는 `독꼬리 소진`.

#### `thorn_boar` 🐗 가시 멧돼지

- 등급: 일반
- 최대 HP: 23
- 능력 — **마지막 가시**: 플레이어의 직접 피해로 자신의 방어막이 1 이상에서 0이 되면 플레이어에게 피해 2를 준다. 플레이어 Turn마다 한 번만 발동한다.
- Pool: `hedgehog×3`, `sheep×3`, `rabbit×1`, `ant×1`, `eagle×1`
- AI 성향: 방어막을 얻을 수 있는 Line을 우선한다.
- 플레이 감각: 방어막을 단순히 큰 공격으로 제거하는 것이 항상 정답은 아니라는 점을 보여준다.
- UI 표시: 방어막이 있을 때 `마지막 가시 2`를 함께 표시한다.

#### `hunting_raccoon` 🦝 사냥꾼 너구리

- 등급: 일반
- 최대 HP: 22
- 능력 — **기습 조준**: 이 적이 완성한 각 Bingo에서 첫 번째 직접 피해 효과의 치명타 확률이 25%p 증가한다.
- Pool: `eagle×1`, `wolf×3`, `rabbit×2`, `ant×2`, `bee×1`
- AI 성향: 피해 기댓값이 높은 `wolf` 포함 Line을 우선한다.
- 플레이 감각: 적도 치명타를 사용할 수 있다는 사실을 낮은 수치로 소개한다.
- UI 표시: 파생 능력치에 증가분을 포함하고 `기습 조준 +25%p`를 표시한다.

### 2.3 Elite 2종

#### `pack_bear` 🐻 무리곰

- 등급: Elite
- 최대 HP: 33
- 능력 — **무리 사냥**: 이 적이 완성한 Line에 `animal` Emoji가 3개 이상이면 해당 Bingo의 최종 합산 피해가 5 증가하고 HP를 3 회복한다.
- Pool: `wolf×3`, `ant×2`, `sheep×1`, `eagle×1`, `bee×1`, `rabbit×1`
- AI 성향: `animal` 3개 조건을 만들 수 있는 Line을 최우선으로 한다.
- 플레이 감각: Enemy가 놓은 동물 Cell을 이용해 플레이어가 먼저 Bingo를 빼앗을지, 해당 Line을 피할지 선택하게 한다.
- UI 표시: 조건을 만족할 가능성이 있는 Line에 작은 `무리` 표식을 표시한다.

#### `web_crocodile` 🐊 늪지 악어

- 등급: Elite
- 최대 HP: 36
- 능력 — **포획 덫**: 적 Turn 종료 후 마지막 배치 Cell과 인접한 빈칸 하나를 `덫`으로 예고한다. 플레이어가 그 Cell에 배치하면 배치는 정상 처리되지만 독 2를 받고 덫이 사라진다. 사용하지 않은 덫은 다음 적 Turn 시작 시 사라진다. 덫은 동시에 하나만 존재한다.
- Pool: `spider×3`, `bee×2`, `hedgehog×1`, `ant×1`, `rabbit×1`, `wolf×1`
- AI 성향: 빈 인접 Cell이 많은 위치를 선호한다.
- 플레이 감각: 가치가 높은 Cell을 독을 감수하고 차지할지 판단하게 하는 첫 Board Hazard 적이다.
- UI 표시: 덫 Cell에 거미줄 테두리와 `배치 시 독 2` Tooltip을 표시한다.

### 2.4 Boss

#### `prairie_lion` 🦁 초원의 왕

- 등급: Boss
- 최대 HP: 43
- 능력 — **왕의 포효**:
  - 플레이어가 Bingo를 완성할 때마다 `포효` 1을 얻는다. 최대 3중첩이다.
  - 초원의 왕이 다음 Bingo를 완성하면 중첩당 추가 피해 3과 방어막 2를 얻은 뒤 모든 포효를 소비한다.
- Pool: `wolf×2`, `sheep×2`, `eagle×1`, `rabbit×1`, `ant×1`, `hedgehog×1`, `bee×1`
- AI 성향: 동물 수가 많은 Line과 즉시 Bingo를 최우선으로 한다.
- 플레이 감각: 플레이어가 공격하려면 Bingo가 필요하지만, 연속으로 Bingo만 만들면 Boss의 반격도 강해진다. 포효가 쌓였을 때는 방어막을 준비하거나 Enemy Bingo를 적극적으로 차단해야 한다.
- UI 표시: `포효 0/3`과 다음 Enemy Bingo의 예상 추가 피해·방어막을 표시한다.

## 3. Stage 2

### 3.1 Stage 콘셉트

Enemy 초상화는 Board와 플레이어 캐릭터에 사용하지 않는 손동작 Emoji로 구성한다. 전투 Pool은 손기술, 치명타, 무작위, 공연, 복사 효과를 묶는다. 이름과 연출은 예능처럼 가볍지만, Line 순서와 Combo를 본격적으로 시험한다.

### 3.2 일반 몬스터 4종

#### `encore_hand` 👋 앙코르 손

- 등급: 일반
- 최대 HP: 26
- 능력 — **한 번 더 인사**: 전투에서 처음 추가 배치를 얻었을 때 방어막 3을 함께 얻는다.
- Pool: `extra_turn×3`, `cycle×1`, `bell×2`, `megaphone×1`, `mask×2`
- AI 성향: 추가 배치 Emoji를 중앙 또는 교차 가능성이 높은 Cell에 둔다.
- 플레이 감각: 추가 배치가 Enemy에게도 위협적일 수 있음을 보여주되, 능력은 전투당 한 번으로 제한한다.
- UI 표시: `앙코르 준비/소진`.

#### `stop_hand` ✋ 정지 신호

- 등급: 일반
- 최대 HP: 30
- 능력 — **잠깐!**: 플레이어가 Double Bingo 이상을 완성하면 이 적은 방어막 4를 얻는다.
- Pool: `boxing_glove×3`, `brick×2`, `helmet×2`, `amulet×1`, `bell×1`
- AI 성향: 이미 방어막이 있으면 `boxing_glove` Line을 우선한다.
- 플레이 감각: 강한 다중 Bingo를 포기시키지는 않지만, 과도한 폭발력을 약간 완충한다.
- UI 표시: 전투 정보에 `Double 대응: 방어막 4`를 고정 표시한다.

#### `perfect_hand` 👌 완벽주의 손

- 등급: 일반
- 최대 HP: 28
- 능력 — **완벽한 각도**: 이 적이 완성한 대각선 Bingo의 모든 직접 피해는 치명타 확률이 20%p 증가한다.
- Pool: `target×3`, `lightning×2`, `knife×1`, `diamond×1`, `bow×1`, `magnifier×1`
- AI 성향: 대각선 완성 가능성을 다른 Line보다 한 단계 높게 평가한다.
- 플레이 감각: 대각선을 먼저 막아야 하는 명확한 공간 퍼즐을 만든다.
- UI 표시: 두 대각선에 `완벽한 각도 +20%p` 안내를 표시한다.

#### `pinch_hand` 🤏 한 꼬집

- 등급: 일반
- 최대 HP: 29
- 능력 — **조금만 더**: 한 Enemy Bingo의 합산 피해가 5 이하라면 피해 3을 추가한다.
- Pool: `lone_blade×3`, `thief×2`, `knife×1`, `magnifier×1`, `mirror×1`, `hourglass×1`
- AI 성향: 다른 같은 Emoji가 적은 Line과 플레이어가 많이 배치한 Line을 선호한다.
- 플레이 감각: 작은 공격을 여러 번 발동하는 구성을 보정하며, 이름과 실제 위협의 대비가 웃음을 만든다.
- UI 표시: 피해 정산 로그에 `한 꼬집 +3`을 별도로 기록한다.

### 3.3 Elite 2종

#### `rock_hand` 🤘 록스타 손

- 등급: Elite
- 최대 HP: 42
- 능력 — **피드백 공연**: 이 적이 두 번째로 Bingo를 완성할 때마다 해당 Line에서 마지막으로 발동한 복사 가능한 수치 효과를 50% 수치로 한 번 더 발동한다. 소수점은 버리고 최소 1이다.
- Pool: `bell×2`, `megaphone×2`, `lightning×1`, `firecracker×1`, `eruption×1`, `extra_turn×1`, `mirror×1`
- AI 성향: `megaphone`, `mirror`, `bell`이 뒤쪽 순서에 오는 Line을 선호한다.
- 플레이 감각: Line 내부 순서가 왜 중요한지 직접 보여주는 Elite다.
- UI 표시: `공연 1/2` Counter와 반복 예정 효과를 표시한다.

#### `boo_hand` 👎 야유단장

- 등급: Elite
- 최대 HP: 44
- 능력 — **혹평**: 플레이어가 피해 없는 Bingo를 완성하면 약점 2를 부여한다. 한 플레이어 Turn에 한 번만 발동한다.
- Pool: `magnifier×3`, `target×2`, `boxing_glove×1`, `thief×1`, `pain_exchange×1`, `mirror×1`
- AI 성향: 약점이 있는 플레이어를 상대로 직접 피해 Emoji가 많은 Line을 우선한다.
- 플레이 감각: 회복·방어만으로 시간을 끄는 플레이에 공격 전환을 요구한다. 피해가 1이라도 포함되면 혹평을 피할 수 있다.
- UI 표시: Bingo 결과 미리보기에 `피해 없음 → 혹평` 경고를 표시한다.

### 3.4 Boss

#### `applause_king` 🙌 박수왕

- 등급: Boss
- 최대 HP: 56
- 능력 — **생방송 3부제**:
  - Enemy Turn Counter를 1부터 3까지 반복한다.
  - `1부`: 일반적으로 1회 배치한다.
  - `2부`: 배치 후 행운 1을 얻는다.
  - `3부`: 서로 다른 Emoji 2개를 순서대로 예고하고 2회 배치한다. 두 번째 배치에서는 추가 배치 능력이 연쇄되지 않는다.
- Pool: `dice×1`, `coin×1`, `slot×1`, `joker×1`, `mask×1`, `cycle×1`, `bell×1`, `megaphone×1`, `mirror×1`
- AI 성향: 3부 첫 배치로 Bingo를 만들 수 있으면 우선하고, 두 번째 배치는 다음 Line 준비에 사용한다.
- 플레이 감각: 무작위 Pool 때문에 매 전투가 달라지지만, 강한 3부 Turn은 항상 예고되어 방어 계획을 세울 수 있다.
- UI 표시: `현재 1부/2부/3부`, 다음 배치 횟수, 3부의 두 목표 Cell을 순차적으로 표시한다.

## 4. Stage 3

### 4.1 Stage 콘셉트

Enemy 초상화는 Board에서 사용하지 않는 우주·초자연 Emoji로 구성한다. Pool은 `magic`, `celestial`, `curse`, `copy`, `poison` 효과를 중심으로 한다. 단순 수치 증가보다 예고된 Board 방해와 플레이어 선택을 역이용하는 능력을 사용한다.

### 4.2 일반 몬스터 4종

#### `glitch_alien` 👾 글리치 외계체

- 등급: 일반
- 최대 HP: 35
- 능력 — **오류 감염**: 매 3번째 플레이어 Turn의 Draw 중 하나를 무작위로 `오류` 표시한다. 해당 Emoji를 배치하면 배치 직후 무작위 공용 Emoji로 변신한다. 사용하지 않고 버리면 아무 일도 없다.
- Pool: `comet×2`, `starlight×2`, `black_hole×1`, `vortex×1`, `rainbow×1`, `rocket×1`, `diamond×1`
- AI 성향: 희귀 Emoji 효과가 많은 Line을 우선한다.
- 플레이 감각: 강한 카드를 그대로 버릴지, 변신의 위험을 감수할지 선택하게 한다.
- UI 표시: Draw 카드 위에 `GLITCH`와 변신 가능성 설명을 표시한다.

#### `abduction_ship` 🛸 납치선

- 등급: 일반
- 최대 HP: 37
- 능력 — **납치 예고**: 매 3번째 Enemy Turn이 끝날 때 점유 Cell 하나를 표시한다. 다음 Enemy Turn 시작까지 그 Cell이 남아 있으면 제거한다. 표시된 Cell이 Bingo로 먼저 제거되면 능력은 실패한다.
- Pool: `magnet×2`, `vortex×2`, `rocket×2`, `cycle×1`, `puzzle×1`, `comet×1`
- AI 성향: 교차점과 중앙에 가까운 Cell을 선호한다.
- 플레이 감각: 위험한 Emoji를 Line 완성으로 먼저 치울 수 있는 한 Turn짜리 구조 퍼즐이다.
- UI 표시: 대상 Cell에 광선 테두리와 `다음 Enemy Turn에 제거` Counter를 표시한다.

#### `ring_predator` 🪐 고리 포식자

- 등급: 일반
- 최대 HP: 39
- 능력 — **중력 우물**: 이 적이 중앙 Cell을 포함한 Bingo를 완성하면 방어막 6을 얻는다.
- Pool: `black_hole×2`, `comet×2`, `starlight×1`, `hourglass×2`, `rainbow×1`, `amulet×1`
- AI 성향: 중앙 Cell이 포함된 4개 Line을 우선한다.
- 플레이 감각: 중앙 Cell의 전략적 중요성을 직접 강화하지만, 플레이어가 중앙을 선점해 효과를 빼앗을 수도 있다.
- UI 표시: 중앙 Cell에 `중력 우물: Enemy Bingo 시 방어막 6` 안내를 표시한다.

#### `dark_moon` 🌚 암월

- 등급: 일반
- 최대 HP: 40
- 능력 — **개기월식**: HP가 50% 이하인 동안 양쪽의 모든 HP 회복량이 50% 감소한다. 소수점은 버린다. 방어막 획득에는 영향을 주지 않는다.
- Pool: `miasma×2`, `evil_eye×2`, `candle×2`, `pain_exchange×1`, `blood×1`, `black_hole×1`
- AI 성향: HP가 50% 이하가 되면 피해와 독 Line을 우선한다.
- 플레이 감각: 후반 회복 의존을 줄이고 빠른 마무리를 요구한다. Enemy 자신의 회복도 줄기 때문에 공정한 양면 규칙이다.
- UI 표시: HP 50% 이하에서 화면 상단에 `개기월식 · 회복 −50%`를 표시한다.

### 4.3 Elite 2종

#### `nebula_oracle` 🔮 성운 예언자

- 등급: Elite
- 최대 HP: 50
- 능력 — **불길한 예언**:
  - 플레이어 Turn 시작 시 `가로 → 세로 → 대각선` 순으로 금지 방향을 예고한다.
  - 플레이어가 예고된 방향의 Bingo를 완성하면 성운 예언자는 방어막 6을 얻고 플레이어에게 약점 2를 부여한다.
  - 여러 Line이 동시에 완성돼도 Turn당 한 번만 발동한다.
- Pool: `mirror×2`, `diamond×2`, `evil_eye×1`, `gift×1`, `hourglass×1`, `rainbow×1`, `crown×1`
- AI 성향: 현재 예언과 다른 방향에서 자신의 Bingo를 준비한다.
- 플레이 감각: Bingo 자체를 막지 않고 이번 Turn에 어느 방향을 노릴지 바꾸게 한다.
- UI 표시: Board 바깥에 금지 방향과 다음 Turn 방향을 함께 표시한다.

#### `star_warlock` 🧙‍♂️ 별의 주술사

- 등급: Elite
- 최대 HP: 53
- 능력 — **주술 반향**: 이 적이 두 번째로 Bingo를 완성할 때마다 그 Bingo에서 처음 부여한 비HP 상태 효과를 같은 대상에게 같은 수치로 한 번 더 부여한다. 방어막, 피해, 회복은 복사하지 않는다.
- Pool: `catalyst×2`, `miasma×2`, `zombie×1`, `candle×1`, `mirror×1`, `amulet×1`, `black_hole×1`
- AI 성향: 독이나 약점을 부여할 수 있는 Line을 우선한다.
- 플레이 감각: 상태 효과를 방치하면 위험하지만, 상태 Emoji가 놓인 Line을 플레이어가 가로채면 오히려 강한 독 빌드를 사용할 수 있다.
- UI 표시: `주술 1/2`와 복사 가능한 첫 상태 효과를 표시한다.

### 4.4 Final Boss

#### `living_cosmos` 🌌 살아있는 우주

- 등급: Boss
- 최대 HP: 68
- 능력 — **심연의 삼막**:
  - `1막 · 메아리` — HP 67% 초과: Enemy Bingo마다 첫 번째 복사 가능한 수치 효과를 50% 수치로 한 번 더 발동한다.
  - `2막 · 저주` — HP 34%~67%: Enemy Bingo를 완성할 때 플레이어에게 약점 2를 부여한다. Turn당 한 번이다.
  - `3막 · 붕괴` — HP 33% 이하: 양쪽이 Bingo로 주는 직접 피해가 50% 증가한다. 소수점은 버린다.
- Pool: `black_hole×2`, `rainbow×1`, `comet×1`, `mirror×1`, `megaphone×1`, `vortex×1`, `crown×1`, `hourglass×1`
- AI 성향:
  - 1막에는 복사 효과가 뒤에 오는 Line을 우선한다.
  - 2막에는 즉시 Bingo와 약점 활용 피해를 우선한다.
  - 3막에는 가장 높은 예상 피해 Line을 우선한다.
- 플레이 감각: 초반에는 Line 순서, 중반에는 상태 관리, 후반에는 먼저 끝내는 피해 경주를 요구한다. 3막의 피해 증가는 플레이어에게도 적용되므로 일방적인 Boss 강화가 아니라 마지막 역전 기회가 된다.
- UI 표시: 현재 막의 이름과 규칙, 다음 Phase HP 경계선을 HP Bar에 표시한다. Phase 전환 시 Board 입력을 잠깐 잠그고 한 줄 연출을 재생한다.

## 5. 전체 Roster 요약

| Stage | 일반 1 | 일반 2 | 일반 3 | 일반 4 | Elite 1 | Elite 2 | Boss |
|---|---|---|---|---|---|---|---|
| 1 | 🐀 들쥐 정찰병 | 🦊 독꼬리 여우 | 🐗 가시 멧돼지 | 🦝 사냥꾼 너구리 | 🐻 무리곰 | 🐊 늪지 악어 | 🦁 초원의 왕 |
| 2 | 👋 앙코르 손 | ✋ 정지 신호 | 👌 완벽주의 손 | 🤏 한 꼬집 | 🤘 록스타 손 | 👎 야유단장 | 🙌 박수왕 |
| 3 | 👾 글리치 외계체 | 🛸 납치선 | 🪐 고리 포식자 | 🌚 암월 | 🔮 성운 예언자 | 🧙‍♂️ 별의 주술사 | 🌌 살아있는 우주 |

## 6. Encounter 배치 원칙

- 한 Run에서 같은 일반 Enemy가 연속으로 등장하지 않게 한다.
- 일반 전투는 해당 Stage 일반 4종 중 하나를 seed 기반으로 선택한다.
- Elite 전투는 해당 Stage Elite 2종 중 하나를 선택한다.
- 10번째 Map은 해당 Stage Boss로 고정한다.
- 물음표에서 전투가 나오면 해당 Stage 일반 Enemy를 사용하되 직전 Enemy는 제외한다.
- Stage 1의 첫 고정 전투는 `🐀 들쥐 정찰병`으로 권장한다. 가장 단순한 능력이라 게임의 기본 규칙을 가리지 않는다.

## 7. 구현 시 필요한 공통 Enemy 능력 Hook

Enemy별 조건문을 전투 reducer와 UI에 직접 늘리지 않고, 다음 Hook을 데이터로 등록한다.

- `onBattleStart`
- `onActorTurnStart`
- `onActorTurnEnd`
- `onDrawCreated`
- `onPlace`
- `onBingoStarted`
- `onBingoSettled`
- `onDamageSettled`
- `onShieldBroken`
- `onPhaseChanged`

능력 실행 결과는 기존 효과 이벤트와 마찬가지로 `source`, `target`, `value`, `text`, `telegraph`를 남긴다. AI는 능력 자체를 다시 계산하지 않고, 능력이 제공하는 평가 modifier만 사용한다.

## 8. 구현 우선순위

### 1차 — 데이터와 단순 능력

- Stage별 21종 Enemy 데이터와 Pool
- 첫 Bingo 추가 효과
- 피해 정산 후 방어막
- Line 방향 조건
- HP 비율 Phase
- Bingo 횟수 Counter

### 2차 — Board 예고 능력

- 늪지 악어의 덫
- 납치선의 제거 표식
- 성운 예언자의 방향 예고
- 글리치 외계체의 Draw 표식

### 3차 — 복사와 Boss Phase

- 록스타 손과 별의 주술사의 제한 복사
- 박수왕의 2회 배치 Turn
- 살아있는 우주의 3단계 AI와 Phase 연출

## 9. 필수 테스트

- 21개 Enemy 아이콘이 `EMOJIS` 아이콘 및 플레이어 캐릭터 아이콘과 겹치지 않음
- 각 Stage에 `normal 4 / elite 2 / boss 1`이 정확히 존재함
- 모든 Pool 합계가 9이고 캐릭터 전용 Emoji가 포함되지 않음
- 모든 Pool ID가 존재하며 기존 Enemy 사용 7종이 새 Pool에 포함되지 않음
- 같은 seed와 상태에서 Enemy 선택, 표식 Cell, 능력 결과가 동일함
- 능력 피해가 방어막을 정상 소비함
- 전투당 한 번과 Turn당 한 번 능력이 중복 발동하지 않음
- Double Bingo가 방향 예언 능력을 한 Turn에 여러 번 발동시키지 않음
- 추가 배치 능력이 연쇄되지 않음
- Boss HP 경계가 67%, 34%, 33%에서 올바르게 전환됨
- UI Tooltip에 능력 이름, 조건, 현재 Counter와 예상 효과가 표시됨

## 10. 기획 결론

이 Roster는 새 Board Emoji를 추가하지 않고도 현재 적이 사용하지 않는 공용 Emoji 대부분을 실제 전투에서 보여준다. Stage 1은 태그와 기본 상태, Stage 2는 순서와 Combo, Stage 3은 예고와 대응을 중심으로 난이도를 올린다. Enemy 초상화는 Board Emoji 및 플레이어 캐릭터와 완전히 분리되어 전투 화면에서 적과 아이템을 즉시 구분할 수 있다.
