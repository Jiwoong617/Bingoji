# Bingoji Multiplayer 코드 리뷰

> 검토일: 2026-08-30
> 대상: `Bingoji_PvP_Multiplayer_Design.md`, `Bingoji_Multiplayer_Protocol.md`, `src/shared/multiplayer/`, `src/multiplayer/`, `worker/`
> 기준: `fa7bb18` 이후 untracked 멀티플레이 작업분
> 검증 상태: `npm run typecheck` / `typecheck:shared` 통과, `npm test` 154/154 통과, `wrangler deploy --dry-run` 통과

> 수정 상태(2026-08-30): 15개 항목 모두 코드·설정·문서에 반영 완료. Pool 정책은 이후 합의에 따라 고급 8개, 희귀 4개로 갱신했다. 전체 회귀 검증 결과는 작업 완료 보고를 기준으로 한다.

이 문서는 기획서와 구현을 대조해 찾은 결함과 수정 필요 지점을 정리한다. 각 항목은 실제 코드 위치를 명시하며, 재현 가능한 항목은 실행 결과를 함께 남긴다.

---

## 요약

| # | 심각도 | 항목 | 위치 |
|---|---|---|---|
| 1 | 심각 | Pool 검증이 prototype key를 통과시켜 상대 클라이언트가 크래시 | `src/shared/multiplayer/rules.ts:99` |
| 2 | 심각 | 배포된 사이트에서 멀티플레이 서버 주소가 잘못 결정됨 | `.github/workflows/deploy.yml` |
| 3 | 중간 | Bingo 연출 시간이 15초 Turn Timer를 갉아먹음 | `worker/match-state.ts:209` |
| 4 | 중간 | Deadline 경계에서 플레이어 배치가 버려지고 무작위 자동배치로 대체 | `worker/room.ts:377` |
| 5 | 중간 | 기권 확인 팝업이 없음 | `src/multiplayer/BattleScreen.tsx:281` |
| 6 | 중간 | `isPool`에 키 개수 상한이 없음 | `src/shared/multiplayer/protocol.ts:286` |
| 7 | 낮음 | `broadcast()`가 현재 방 소속을 확인하지 않음 | `worker/room.ts:848` |
| 8 | 낮음 | 결과 5분 TTL 만료가 결과 화면을 지움 | `worker/room.ts:150` |
| 9 | 낮음 | `leave()`의 80ms 하드코딩 close race | `src/multiplayer/client.ts:165` |
| 10 | 낮음 | 중복 요청 응답 캐시가 실질적으로 사용되지 않음 | `worker/reply-cache.ts` |
| 11 | 낮음 | 자동배치 실패 처리가 경로별로 불일치 | `worker/room.ts:196`, `worker/room.ts:648` |
| 12 | 낮음 | `cloneCombatState`가 `events` 배열을 공유 | `src/game/combat.ts:50` |
| 13 | 낮음 | Origin allowlist와 rate limit이 없음 | `worker/index.ts` |
| 14 | 낮음 | `drawIndex < 3` 하드코딩 | `src/shared/multiplayer/protocol.ts:452` |
| 15 | 낮음 | 문서 상태 표기가 서로 모순 | 기획서 헤더 |

권장 처리 순서: **1 → 2 → 3, 4 → 5 → 나머지**

---

## 1. Pool 검증이 prototype key를 통과시켜 상대 클라이언트가 크래시

**심각도: 높음 · 서버 검증 우회 + 원격 유발 클라이언트 크래시**

### 문제

`src/shared/multiplayer/rules.ts:99`

```ts
const emoji = EMOJIS[emojiId];
if (!emoji) {
  errors.push({ code: "unknown-emoji", emojiId, message: `알 수 없는 Emoji ID입니다: ${emojiId}` });
  continue;
}
```

`EMOJIS`는 `src/content/emojis.ts`에서 `Object.fromEntries(...)`로 생성되므로 `Object.prototype`을 상속한다. 따라서 다음이 모두 truthy다.

- `EMOJIS["constructor"]` → `Object` 함수
- `EMOJIS["__proto__"]` → `Object.prototype`
- `EMOJIS["toString"]` / `EMOJIS["valueOf"]` / `EMOJIS["hasOwnProperty"]` → 함수

`!emoji` 검사를 전부 통과하고, 이어지는 `excludedEmojiIds.has()`와 사본 수 검사도 통과한다.

### 재현 결과

```text
pool = {"sword":2,"heart":2,"fire":2,"clover":2,"constructor":2,"toString":2}

validatePvpPool(pool)
  → total: 12   valid: true   errors: []
  → rarityCounts: {"common":8,"uncommon":0,"rare":0,"undefined":NaN}

validateMultiplayerProfile({ avatar:"🙂", nickname:"테스터", pool })
  → valid: true   errors: []

createPvpMatch(...)
  → host pool: {"sword":2,"heart":2,"fire":2,"clover":2,"constructor":2,"toString":2}
```

`rarityCounts[emoji.rarity]`에서 `emoji.rarity`가 `undefined`이므로 `rarityCounts["undefined"] = NaN`도 함께 생성된다.

### 영향

기획서 §5.4의 "모든 Emoji ID가 현재 PvP 사용 가능 Registry에 존재한다"와 "클라이언트 데이터를 조작한 잘못된 Pool은 전투에 사용할 수 없다"가 **서버 측에서 무력화된다.**

공격 체인(전 단계 코드로 확인):

1. 조작된 클라이언트가 `{"constructor":2, ...}` Pool로 `room.create` 또는 `room.join` → 서버 검증 통과
2. `drawFromPool`이 `"constructor"`를 뽑아 공용 Board에 배치
3. 상대가 해당 칸을 탭 → `src/multiplayer/BattleScreen.tsx:307`

   ```tsx
   onClick={() => { if (cell) onInfo(cell.emojiId); ... }}
   ```

4. `src/components/EmojiDetailContent.tsx:39`

   ```ts
   emoji.onBingo.length ? "BINGO" : null,
   ```

   `EMOJIS["constructor"].onBingo`는 `undefined` → `undefined.length` → **TypeError**
5. Error boundary가 없어 React 트리가 통째로 언마운트 → **화이트 스크린**

Board 렌더 자체도 `EMOJIS[cell.emojiId].name`(`src/multiplayer/BattleScreen.tsx:305`)에서 `"Object"` 같은 값을 aria-label로 노출한다.

### 수정 방안

```ts
// src/shared/multiplayer/rules.ts
if (!Object.hasOwn(EMOJIS, emojiId)) {
  errors.push({ code: "unknown-emoji", emojiId, message: `알 수 없는 Emoji ID입니다: ${emojiId}` });
  continue;
}
```

또는 `PVP_EMOJI_IDS` 기반 `Set`으로 검사한다. 후자가 기획서 문구와 정확히 일치한다.

추가 권장:

- `src/content/emojis.ts`에서 `EMOJIS`를 `Object.assign(Object.create(null), Object.fromEntries(...))`로 만들어 근본 차단
- `EmojiDetailContent`와 Board 렌더에 미상 ID 가드 추가
- 회귀 테스트: prototype key가 섞인 Pool이 `unknown-emoji`로 거절되는지 확인

---

## 2. 배포된 사이트에서 멀티플레이 서버 주소가 잘못 결정됨

**심각도: 높음 · 배포본에서 기능 자체가 동작 불가**

### 문제

`src/multiplayer/client.ts:57`

```ts
export function defaultMultiplayerServerUrl(): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_SERVER_URL?.trim();
  if (configured) return configured;
  if (typeof window === "undefined") return "http://127.0.0.1:8787";
  const local = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  return local ? `${window.location.protocol}//${window.location.hostname}:8787` : window.location.origin;
}
```

`.github/workflows/deploy.yml`의 `npm run build` 단계에 `VITE_MULTIPLAYER_SERVER_URL`이 없고, 저장소에 `.env` / `.env.production`도 없다. `.env.example`만 존재한다.

### 영향

빌드 산출물이 `window.location.origin`으로 fallback한다. GitHub Pages 배포본에서는 `wss://jiwoong617.github.io/api/rooms/socket`에 연결을 시도하므로 항상 실패한다. Worker도 아직 배포되지 않았다(Protocol 문서 "다음 단계: 1. Cloudflare 배포와 Frontend WSS 주소 연결").

즉 **현재 배포본에서 멀티플레이는 진입 자체가 불가능**하며, 사용자에게는 원인 불명의 연결 실패로만 보인다.

### 수정 방안

1. Worker 배포 후 `deploy.yml` build step에 환경변수를 주입한다.

   ```yaml
   - name: Build
     run: npm run build
     env:
       VITE_MULTIPLAYER_SERVER_URL: ${{ vars.MULTIPLAYER_SERVER_URL }}
   ```

2. 값이 없을 때 `window.location.origin`으로 조용히 fallback하지 말고, 멀티플레이 진입을 비활성화하고 "멀티플레이 서버가 설정되지 않았습니다" 안내를 표시한다. 잘못된 주소로 붙어 타임아웃을 기다리는 것보다 원인 파악이 빠르다.

---

## 3. Bingo 연출 시간이 15초 Turn Timer를 갉아먹음

**심각도: 중간 · 기획서 §8.2 위반, 실효 결정 시간 약 16% 손실**

### 기획

기획서 §8.2:

> Bingo 처리 중에는 양쪽 입력과 Turn Timer를 멈춘다. 다음 결정 가능 시점에 서버가 새 15초 Deadline을 보낸다.

### 구현

`worker/match-state.ts:209`

```ts
value: armMatchDeadline({ ...stored, state: applied.state }, now),
```

`armMatchDeadline`은 `deadlineAt = now + PVP_TURN_TIMEOUT_MS`로, 서버가 배치를 처리한 **즉시** 15초를 시작한다. 연출 시간을 전혀 고려하지 않는다.

클라이언트는 `src/multiplayer/BattleScreen.tsx:14`

```ts
const PVP_EFFECT_MS = 2_450;
const PVP_IMPACT_MS = 1_650;
```

이 시간 동안 `interactionLocked = !myTurn || presenting || ...`로 입력이 잠긴다.

### 영향

- Bingo가 발생한 직후 턴의 실효 결정 시간은 **12.55초(약 16% 손실)**
- 추가 배치(`한 번 더` 계열)에서도 동일하게 손실
- 타이머 숫자와 Gauge는 입력이 잠긴 동안에도 계속 감소해 화면상으로도 드러난다

### 수정 방안

둘 중 하나를 택한다.

- 서버가 연출 소요 시간을 알고 `deadlineAt = now + PRESENTATION_MS + PVP_TURN_TIMEOUT_MS`로 arm
- `PvpMatchSnapshot`에 `presentationMs`를 실어 보내고, 클라이언트가 연출 종료 후부터 카운트다운을 시작하되 서버 Deadline도 그만큼 뒤로 잡는다

연출 시간 상수는 서버와 클라이언트가 같은 값을 공유해야 하므로 `src/shared/multiplayer/`로 옮기는 편이 안전하다.

---

## 4. Deadline 경계에서 플레이어 배치가 버려지고 무작위 자동배치로 대체

**심각도: 중간 · 제한 시간 안에 행동해도 불이익**

### 문제

`worker/room.ts:377`

```ts
if (stored.deadlineAt !== null && stored.deadlineAt <= now) {
  this.sendError(socket, message.requestId, {
    code: "turn-expired",
    message: "배치 제한 시간이 지났습니다.",
    retryable: false,
  });
  await this.resolveExpiredMatchDeadline(room, stored, now);
  return;
}
```

네트워크 지연 유예가 0이다. 클라이언트도 `placeEmoji()`(`src/multiplayer/client.ts:117`)에서 남은 시간을 검사하지 않는다.

### 영향

플레이어가 14.9초에 확정한 배치가 15.05초에 서버에 도착하면 **그 수는 버려지고**, 서버가 남은 Draw와 빈칸에서 무작위로 골라 대신 배치한다. 기획서 §9.2는 자동 배치를 "시간 초과의 불이익"으로 정의하지만, 이 경우 플레이어는 제한 시간 안에 행동했음에도 불이익을 받는다. RTT가 큰 모바일 네트워크에서 체감이 커진다.

### 수정 방안

- 서버: `stored.deadlineAt + PLACEMENT_GRACE_MS <= now`로 완화한다. 300~500ms 권장.
- 클라이언트: 남은 시간이 예상 RTT보다 작으면 입력을 미리 잠가, 버려질 것이 확실한 요청을 보내지 않는다.

---

## 5. 기권 확인 팝업이 없음

**심각도: 중간 · 기획서 §11 위반, 오클릭으로 즉시 패배**

### 기획

기획서 §11:

> 전투 나가기 → `기권하고 나가시겠습니까?` 확인

### 구현

`src/multiplayer/BattleScreen.tsx:281`

```tsx
<button className="danger-button compact-forfeit" type="button"
  disabled={clientState.placementPending}
  onClick={(event) => { event.stopPropagation(); onForfeit(); }}>기권</button>
```

확인 단계 없이 즉시 `room.leave`를 보내 패배가 확정된다. 전투 화면의 다른 버튼과 인접해 있어 오클릭 위험이 실재한다.

### 수정 방안

기존 `Modal` 컴포넌트를 재사용해 확인 단계를 추가한다. `취소` / `기권` 두 버튼을 두고 기본 포커스를 `취소`에 준다.

---

## 6. `isPool`에 키 개수 상한이 없음

**심각도: 중간 · Durable Object CPU 낭비**

### 문제

`src/shared/multiplayer/protocol.ts:286`

```ts
function isPool(value: unknown): value is Pool {
  return isRecord(value) && Object.entries(value).every(
    ([emojiId, count]) => emojiId.length > 0 && emojiId.length <= 64 && Number.isInteger(count),
  );
}
```

키 개수 제한이 없다. `validatePvpPool`은 알 수 없는 ID마다 error 객체를 하나씩 만들므로, 10만 개 키를 보내면 10만 개 객체가 생성된 뒤에야 거절된다.

### 영향

WebSocket 메시지 1 MiB 한도가 유일한 방어선이다. 결국 거절되지만 Durable Object CPU를 낭비한다. Free plan 한도 아래에서는 무시하기 어렵다.

### 수정 방안

```ts
function isPool(value: unknown): value is Pool {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > PVP_POOL_MAX_SIZE) return false;
  return entries.every(([emojiId, count]) => emojiId.length > 0 && emojiId.length <= 64 && Number.isInteger(count));
}
```

`validatePvpPool`의 error 배열에도 상한을 두면 더 안전하다.

---

## 7. `broadcast()`가 현재 방 소속을 확인하지 않음

`worker/room.ts:848`

```ts
private broadcast(message: ServerMessage, except?: WebSocket): void {
  const serialized = serializeMultiplayerMessage(message);
  for (const socket of this.ctx.getWebSockets()) {
    if (socket === except || !this.attachment(socket)?.sessionToken) continue;
    ...
  }
}
```

`sessionToken` 존재 여부만 확인한다. `forEachParticipantSocket`은 `participantByToken`으로 현재 방 소속을 검사하지만 `broadcast`는 검사하지 않는다.

`canCreate`(`worker/room.ts:62`)가 만료된 방의 storage를 `deleteAll()`할 때 `clearSessionAttachments()`를 호출하지 않으므로, 이전 방의 소켓이 토큰을 유지한 채 남는다. 같은 방 코드로 새 방이 만들어지면 그 소켓들이 `room.closed`와 `match.finished` broadcast를 수신한다.

`match.finished`에는 양쪽 최종 Pool이 포함되므로 소규모 정보 노출에 해당한다. 30분 만료 Alarm이 정상 동작하면 발생 확률은 낮다.

**수정**: `broadcast`도 `participantByToken`으로 걸러내거나, `canCreate`의 `deleteAll` 경로에서 `clearSessionAttachments()`를 호출한다.

---

## 8. 결과 5분 TTL 만료가 결과 화면을 지움

`worker/room.ts:150`에서 `room.status === "finished"`이고 `expiresAt`이 지나면 `room.closed`를 broadcast한다.

클라이언트(`src/multiplayer/client.ts:275`)는 `room.closed`를 받으면 `replaceState(INITIAL_STATE)`로 `result`까지 버린다. `App.tsx`는 `multiplayerClientState.match`가 null이 되므로 `MultiplayerRoomScreen`의 에러 화면으로 되돌아간다.

기획서 §12는 결과 화면을 사용자가 `닫기`로 닫는다고 정의한다. 결과를 5분 이상 보고 있으면 화면이 에러로 바뀐다.

**수정**: `room.closed` 처리 시 `result`가 있으면 유지하거나, `finished` 상태에서는 `room.closed` 없이 storage만 정리한다.

---

## 9. `leave()`의 80ms 하드코딩 close race

`src/multiplayer/client.ts:165`

```ts
const leavingSocket = this.socket;
globalThis.setTimeout(() => leavingSocket?.close(1000, "Player left room"), 80);
```

`room.leave`가 80ms 안에 flush되지 못하면 명시적 기권이 서버에 도달하지 않는다. 이 경우 소켓 종료로 인한 disconnect 처리로 격하되어, 상대는 30초를 기다린 뒤에야 승리한다.

**수정**: 서버 응답(`match.finished` 또는 `room.updated`)을 받은 뒤 닫는다. 타임아웃을 두더라도 응답 수신을 우선 조건으로 둔다.

---

## 10. 중복 요청 응답 캐시가 실질적으로 사용되지 않음

Protocol 문서 §8:

> 같은 `requestId`가 다시 오면 처리 결과를 재전송하되 행동을 중복 실행하지 않는다.

`worker/reply-cache.ts`와 `worker/room.ts:120`의 캐시 조회는 구현되어 있으나, 클라이언트 `send()`(`src/multiplayer/client.ts:365`)는 호출마다 새 `requestId`를 만든다. 재시도 경로가 없으므로 이 캐시는 현재 사용되지 않으며 실제 동작이 검증되지 않는다.

또한 재접속 시 새 소켓의 attachment는 비어 있어 캐시가 초기화된다. 중복 실행 자체는 `expectedRevision` / `turn` 검사로 막히므로 정합성 문제는 없다.

**수정**: 재전송이 필요한 요청(`match.place`)에 한해 클라이언트가 같은 `requestId`로 재시도하도록 하거나, 캐시를 제거하고 revision 검사만 남긴다. 어느 쪽이든 문서와 코드를 일치시킨다.

---

## 11. 자동배치 실패 처리가 경로별로 불일치

- `worker/room.ts:196`(`alarm()`): `autoPlaceExpiredMatch` 실패 시 `finishStoredMatch(stored, null, "server-error")`로 대전을 종료한다.
- `worker/room.ts:648`(`resolveExpiredMatchDeadline`): 실패 시 `scheduleNextAlarm`만 호출하고 반환한다.

후자는 즉시 Alarm이 다시 걸려 결국 전자 경로로 수렴하지만, 같은 조건에 대한 처리가 다르면 추적이 어렵다. 한쪽으로 통일한다.

---

## 12. `cloneCombatState`가 `events` 배열을 공유

`src/game/combat.ts:50`

```ts
export function cloneCombatState(source: CombatState): CombatState {
  return {
    ...source,
    board: cloneBoard(source.board),
    player: cloneCombatant(source.player),
    enemy: cloneCombatant(source.enemy),
    ...
  };
}
```

`events`가 깊은 복사되지 않아 원본과 같은 배열을 참조한다. `beginActorTurn`이 `state.events.push(...)`를 수행하면 원본 상태의 배열도 변한다.

현재 PvP 경로에서는 중간 상태만 오염되고 `placeDrawnEmojiForActor`가 `state.events = []`로 재할당하므로 revision 간 누수는 없다. 다만 이후 `PvpMatchState`를 보관하거나 비교하는 코드가 늘어나면 문제가 될 수 있다.

**수정**: `events: [...source.events]`, `discarded: [...source.discarded]`를 추가한다.

---

## 13. Origin allowlist와 rate limit이 없음

`worker/index.ts`는 WebSocket upgrade 요청의 `Origin`을 검사하지 않는다. WebSocket에는 CORS가 적용되지 않으므로 임의의 사이트에서 방 생성을 반복 호출할 수 있다.

기획서 §14는 "접속자 수, WebSocket Message 수와 오류율을 기록한다"까지만 정한다. Free plan 한도를 쓰는 구조이므로 최소한의 방어가 필요하다.

**수정**: 허용 Origin 목록 검사, IP 단위 방 생성 rate limit(Durable Object 또는 Workers Rate Limiting binding).

---

## 14. `drawIndex < 3` 하드코딩

`src/shared/multiplayer/protocol.ts:452`

```ts
&& isNonNegativeInteger(payload.drawIndex)
&& payload.drawIndex < 3
```

`PVP_DRAW_SIZE`가 3이므로 현재는 맞지만 상수가 중복되어 있다. `PVP_DRAW_SIZE`를 참조하도록 바꾼다.

---

## 15. 문서 상태 표기가 서로 모순

`Bingoji_PvP_Multiplayer_Design.md` 헤더:

```text
> 문서 상태: 확정 기획안 · 공용 엔진 경계와 Protocol v1 구현 완료
...
> 비고: 이 문서는 기획 및 구현 기준이며, 현재 멀티플레이가 구현되었다는 뜻은 아니다.
```

같은 헤더 안에서 "구현 완료"와 "구현되었다는 뜻은 아니다"가 충돌한다.

`Bingoji_Multiplayer_Protocol.md` §1의 "향후 Cloudflare Worker도 같은 진입점을 사용한다"도 이미 사용 중이므로 표현이 낡았다.

**수정**: 두 문서의 상태 줄을 현재 구현 수준(Cloudflare 배포만 남은 상태)으로 통일한다.

---

## 기획서대로 잘 구현된 부분

검토 중 확인한, 의도대로 동작하는 설계 지점이다. 리팩터링 시 깨뜨리지 않도록 주의한다.

- **`match.place`가 emojiId를 받지 않는다.** `drawIndex`만 받아 서버 권위 Draw에서 조회하므로, 클라이언트가 보유하지 않은 Emoji를 배치할 수 없다. (Protocol §4)
- **`privateState` 공개 범위.** `matchSnapshotForSeat`이 수신자 Pool과 자기 Turn의 Draw만 포함한다. 상대 Draw는 빈 배열이다. (Protocol §7)
- **Alarm 3중 검증.** `deadlineRevision` / `deadlineTurn` / `deadlineSeat`가 현재 상태와 모두 일치할 때만 자동배치가 실행되어, 이미 진행된 Turn의 낡은 Alarm이 무시된다. (Protocol §8)
- **중복 Session 차단.** `attachSession`이 같은 `sessionToken`을 가진 이전 소켓의 토큰을 지우고 4000으로 닫는다.
- **동시 사망 무승부.** `resolveCompletedBingos(..., continueAfterSelfDefeat = true)`와 `outcomeFor`가 자기 피해로 양쪽 HP가 0이 되는 경우를 무승부로 확정한다. (기획서 §12, §19)
- **PvP 변신 후보.** `applyPlaceEffects`가 `mode === "pvp"`에서 `TRANSFORM_EMOJI_IDS`를 사용해, 이벤트 전용 Emoji가 변신 결과로 나오지 않는다. (기획서 §10)
- **보유 중 효과 귀속.** `ownedValues(combatant)`가 각 참가자 자신의 Pool만 읽는다. (기획서 §8.2)
- **방 코드 편향 없음.** `ROOM_CODE_ALPHABET` 길이가 32이고 `256 % 32 === 0`이므로 `value % 32`에 모듈로 편향이 없다.
- **진행 중 Match의 대기방 만료 오판 방지.** `alarm()`이 `in-game` 상태를 만료 분기에서 제외한다.
- **양쪽 Disconnect 판정.** `disconnectWinnerAfterGrace`가 한쪽만 유예를 넘긴 경우 `undefined`를 반환해 성급한 종료를 막고, 양쪽 모두 넘긴 경우에만 무승부로 확정한다.

---

## 검증 명령

```bash
npm run typecheck
```

```bash
npm run typecheck:shared
```

```bash
npm test
```

```bash
npm run build:worker
```
