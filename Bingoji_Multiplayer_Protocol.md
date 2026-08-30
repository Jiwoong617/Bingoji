# Bingoji Multiplayer 공유 엔진·Protocol v1

> 상태: Multiplayer Backend·대기방·PvP 전투/결과 UI Local 구현·검증 완료 · Cloudflare Production 배포 전  
> 범위: Browser와 Cloudflare Worker가 공유하는 TypeScript 경계, PvP 규칙 검증, 방·전투 WebSocket 메시지 계약  
> Source of truth: `src/shared/index.ts`, `src/shared/multiplayer/rules.ts`, `src/shared/multiplayer/protocol.ts`

## 1. 공용 전투 엔진 경계

기존 `src/game`은 React Component나 Browser API를 사용하지 않는 순수 TypeScript 규칙 계층이다. 다음 진입점을 통해서만 UI와 Worker에 공개한다.

```text
src/game/index.ts                 # 전투, Bingo, RNG, 도메인 타입 공개
src/shared/index.ts               # 게임 규칙 + Multiplayer 규칙·Protocol 통합 공개
src/shared/multiplayer/rules.ts   # Profile·Pool 규칙과 Validator
src/shared/multiplayer/protocol.ts# 직렬화 DTO, 메시지 Union, Runtime Decoder
```

- React UI는 `src/shared/index.ts`에서 공용 규칙을 가져온다.
- Cloudflare Worker도 같은 진입점을 사용한다.
- `tsconfig.shared.json`은 DOM Library 없이 이 경계를 별도로 검사한다.
- 애니메이션, Component 상태, `window`, `document`, `localStorage`, WebSocket 객체는 공용 엔진에 들어가지 않는다.
- Network 계층은 Command를 검증해 엔진에 전달하고, 반환된 State/Event를 Snapshot으로 변환한다.
- Multiplayer Profile과 Pool 초안은 Web Page Runtime 전체의 App Memory에 두고 화면 전환 사이에 유지한다. Session Token은 활성 방·Match가 있는 동안만 Memory에 둔다. 어느 값도 Browser Storage나 DB에 영구 저장하지 않는다.

## 2. 확정된 PvP 규칙 상수

`rules.ts`가 다음 값을 단일 소유한다.

| 규칙 | 값 |
|---|---:|
| Pool 최소/최대 | 10 / 15 |
| 동일 Emoji | 최대 2개 |
| 고급 | 최대 8개 |
| 희귀 | 최대 4개 |
| 이벤트 전용 제외 | `event_egg`, `event_baby` |
| 닉네임 | 정규화 후 2~12자 |

`validatePvpPool()`과 `validateMultiplayerProfile()`은 Browser의 즉시 안내와 Server의 최종 검증에서 함께 사용한다. Protocol Decoder의 구조 검증을 통과했더라도 이 Business Validator를 통과하지 못하면 방을 만들거나 참가할 수 없다.

## 3. Envelope

모든 Client 메시지는 다음 공통 필드를 가진다.

```json
{
  "protocolVersion": 1,
  "requestId": "request-uuid",
  "type": "room.create",
  "payload": {}
}
```

모든 Server 메시지는 다음 공통 필드를 가진다.

```json
{
  "protocolVersion": 1,
  "messageId": "message-uuid",
  "serverTime": 1788012345678,
  "requestId": "optional-original-request-id",
  "type": "room.created",
  "payload": {}
}
```

- `protocolVersion`이 다르면 Payload를 처리하지 않고 `unsupported-protocol`로 거절한다.
- `requestId`는 요청과 응답 연결 및 중복 요청 추적에 사용한다.
- `messageId`는 Client의 중복 Event 재생을 막는 데 사용한다.
- `serverTime`과 Match의 `deadlineAt`은 Unix epoch milliseconds다.

## 4. Client → Server 메시지

| Type | 주요 Payload | 용도 |
|---|---|---|
| `room.create` | `profile` | Profile과 Pool을 검증하고 Host 방 생성 |
| `room.join` | `roomCode`, `profile` | 유효한 방에 Guest로 참가 |
| `room.ready.set` | `sessionToken`, `ready` | 준비 또는 준비 취소 |
| `room.leave` | `sessionToken` | 대기방 퇴장 또는 전투 기권 |
| `session.resume` | `roomCode`, `sessionToken` | 같은 Page Runtime에서 일시적으로 끊어진 WebSocket Session 복구 |
| `match.place` | `sessionToken`, `matchId`, `expectedRevision`, `turn`, `drawIndex`, `cellIndex` | 현재 Draw의 Emoji를 Board에 배치 |
| `match.sync.request` | `sessionToken`, `matchId` | 최신 권위 Snapshot 요청 |
| `connection.ping` | `nonce` | 연결 상태 및 Server 시간 확인 |

`match.place`는 Emoji ID를 보내지 않는다. Server가 해당 참가자의 권위 Draw에서 `drawIndex`를 조회하므로 Client가 가지지 않은 Emoji ID를 조작해 보낼 수 없다.

`cellIndex`는 0~24, 기본 `drawIndex`는 0~2다. 추가 배치 중에는 남은 Draw 배열의 현재 Index를 사용한다.

### WebSocket Endpoint

- 방 생성: `ws(s)://<worker-host>/api/rooms/socket`에 연결한 뒤 `room.create` 전송
- 방 참가·재접속: `ws(s)://<worker-host>/api/rooms/{ROOM_CODE}/socket`에 연결한 뒤 `room.join` 또는 `session.resume` 전송
- Worker는 생성 요청마다 혼동 문자를 제외한 6자리 코드를 만들고, 비어 있는 방별 Durable Object를 선택한다.
- Durable Object는 연결별 Session 정보와 최근 응답 8개를 WebSocket Attachment에 저장해 Hibernation과 중복 요청 재전송을 지원한다.

## 5. Server → Client 메시지

| Type | 주요 Payload | 용도 |
|---|---|---|
| `room.created` | `sessionToken`, `room` | Host 방 생성 완료 |
| `room.joined` | `sessionToken`, `room` | Guest 참가 완료 |
| `room.updated` | `room` | 참가·준비·연결 상태 Broadcast |
| `room.closed` | `reason`, `message` | Host 퇴장, 만료, Server 오류 |
| `session.resumed` | `room`, `match?` | 재접속 후 최신 상태 복구 |
| `match.started` | `match` | 선공과 첫 Turn이 포함된 Match 시작 |
| `match.updated` | `match`, `events` | 승인된 배치와 효과 처리 결과 |
| `match.finished` | `result` | 승리·패배·무승부 확정 |
| `error` | `code`, `message`, `retryable` | 요청 거절 사유 |
| `connection.pong` | `nonce` | Ping 응답 |

## 6. Session과 저장 수명

- Profile과 Pool 초안은 최상위 App State의 React Memory에 유지한다.
- 메인 화면이나 결과 화면으로 이동해도 같은 Page Runtime이면 Profile과 Pool 초안을 지우지 않는다.
- 같은 Page에서 멀티플레이를 다시 선택하면 직전 초안을 입력된 상태로 보여주고 사용자가 그대로 사용하거나 수정하게 한다.
- 방을 나가거나 Match가 끝나면 `sessionToken`과 방·Match 연결 상태만 폐기하고 Profile·Pool 초안은 유지한다.
- `localStorage`, `sessionStorage`, Cookie와 IndexedDB에는 해당 값을 기록하지 않는다.
- 같은 Page가 살아 있는 동안 WebSocket만 끊기면 Memory의 `sessionToken`으로 `session.resume`을 보낼 수 있다.
- 새로고침, Tab 종료, Browser 종료 후 재접속하면 App Memory가 사라지므로 Profile·Pool을 다시 설정하며 기존 Session도 복구하지 않는다.
- 전투 중 새로고침하거나 Page를 닫은 기존 참가자는 Server에서 Disconnect 상태가 되고, 30초 안에 같은 Runtime이 돌아오지 않으므로 기권패 처리된다.
- 대기방과 Match의 Server Snapshot은 방 운영을 위한 임시 상태일 뿐 플레이어 계정 정보가 아니다. 방이 닫히거나 만료되면 함께 정리한다.

## 7. Snapshot 공개 범위

### 대기방

`RoomParticipantSnapshot`은 Avatar, 닉네임, Pool 크기, 준비 및 연결 상태만 전송한다. 상대의 정확한 Pool은 포함하지 않는다.

### 전투

`PvpMatchSnapshot`에는 다음이 들어간다.

- 25칸 Board
- 양쪽의 공개 HP, 상태 효과와 연결 상태
- 현재 Turn, Phase, 행동 Seat, Deadline
- 남은 추가 배치 수
- 마지막 Bingo
- 메시지를 받는 사람에게만 제공되는 `privateState`

`privateState`에는 수신자의 전체 Pool과 현재 Draw만 들어간다. 상대 Pool과 Draw는 Match 종료 전까지 전송하지 않는다.

### 결과

`match.finished`의 `PvpMatchResult`에서만 양쪽의 최종 Pool을 모두 공개한다. `winnerSeat`가 `null`이면 무승부다.

## 8. 순서와 중복 방지

Server의 방과 Match 상태는 각각 증가하는 `revision`을 가진다.

1. Client가 마지막으로 받은 `expectedRevision`과 `turn`을 `match.place`에 담는다.
2. Server가 현재 값과 비교한다.
3. 값이 오래되었으면 `stale-revision`을 보내고 최신 Snapshot을 다시 전송한다.
4. 유효하면 행동을 정확히 한 번 처리하고 revision을 증가시킨다.
5. 같은 `requestId`가 다시 오면 처리 결과를 재전송하되 행동을 중복 실행하지 않는다.

Client는 `match.place` 응답이 750ms 동안 없을 때 같은 직렬화 메시지와 같은 `requestId`로 최대 2회 재전송한다. 권위 응답, 오류 또는 연결 종료를 받으면 재전송을 중단한다. Server는 연결 Attachment의 최근 응답 Cache를 사용해 같은 요청의 결과만 다시 보내고 배치를 중복 실행하지 않는다.

Server의 15초 Alarm도 `matchId`, `turn`, `revision`, `deadlineAt`을 다시 확인한 뒤 자동 배치한다. 이미 정상 행동으로 Turn이 넘어갔다면 오래된 Alarm은 아무 것도 하지 않는다.

## 9. 검증 계층

```text
JSON.parse
  → Protocol 구조 Decoder
  → Session/방 권한 검사
  → Profile·Pool Business Validator
  → Turn/revision/Deadline 검사
  → 공용 전투 엔진 Command 실행
  → Snapshot + Effect Event 생성
```

- `parseClientMessage()`와 `parseServerMessage()`는 잘못된 JSON을 구분한다.
- `decodeClientMessage()`와 `decodeServerMessage()`는 이미 Parse된 값을 검사한다.
- TypeScript `as`만 사용해 Network 값을 신뢰하지 않는다.
- `sessionToken`은 로그, 오류 문구, 상대 Snapshot에 포함하지 않는다.

## 10. 현재 완료와 다음 단계

완료:

- UI가 사용하는 공용 게임 API
- DOM 없는 Shared TypeScript Compile 경계
- PvP Emoji 목록, Profile과 Pool Validator
- Protocol v1 Client/Server Message Union
- 양방향 JSON Decoder와 Serializer
- Pool 제한, Version, Room Code, Cell, Board 크기, 비공개 Pool에 대한 단위 테스트
- UI와 Network에 의존하지 않는 순수 PvP Match State와 Command Reducer
- 빈 Board, HP 30, seed 기반 선공과 양쪽 Draw 3개
- 양쪽의 공용 Emoji 배치·Bingo·효과·추가 배치·Turn 전환
- 시간 초과용 seed 기반 자동 배치와 동시 HP 0 무승부 판정
- 기존 PvE 회귀를 포함한 Headless PvP 단위 테스트
- Wrangler 기반 Cloudflare Worker 프로젝트와 생성된 Runtime/Binding Type
- `BINGOJI_ROOMS` Durable Object Binding과 SQLite `v1` Migration
- 방 코드별 Durable Object WebSocket Hibernation 진입점
- `/health`, Room WebSocket Route와 Worker dry-run 검증
- `room.create`, `room.join`, `room.ready.set`, `room.leave`, `session.resume`, `connection.ping` 처리
- Private Profile·Pool·Session Token을 Durable Object Storage에 보관하고 Public Snapshot에는 Pool 개수만 공개
- Host/Guest 퇴장, 연결 상태 Broadcast, 중복 Request 응답 재사용
- 30분 대기방 만료 Alarm과 Host·Guest 준비 완료 시 `starting` 전환
- 실제 `wrangler dev` WebSocket Host 생성 → Guest 참가 → 양쪽 준비 Smoke Test
- 양쪽 준비 완료 시 빈 Board·HP 30·seed 기반 선공의 권위 PvP Match 생성 및 저장
- 수신 Seat의 Pool·Draw만 포함하는 `match.started`·`match.updated` Snapshot 변환
- `match.place`의 Session·Match ID·revision·turn·Draw·Cell·행동 Seat 검증
- `match.sync.request`, Effect Event 변환, HP 승패·무승부 `match.finished` 결과 처리
- 실제 `wrangler dev`에서 Match 시작 → 선공 배치 → revision 증가 WebSocket Smoke Test
- Match 시작·정상 배치·추가 배치마다 새로 설정되는 15초 권위 Deadline
- 저장된 Seat·revision·turn과 일치하는 만료 Alarm만 실행하는 seed 기반 자동 배치
- Deadline 이후 도착한 수동 배치의 `turn-expired` 거절과 즉시 최신 Match Broadcast
- 전투 중 연결 종료의 30초 재접속 유예, 재접속 시 Deadline 유지와 최신 비공개 Snapshot 복구
- 한 명 Disconnect 시 상대 승리, 양쪽 Disconnect 시 무승부, 명시적 `room.leave` 기권 처리
- 종료 결과 5분 보관 후 방 정리와 진행 중 Match의 30분 대기방 만료 오판 방지
- 실제 `wrangler dev`에서 15초 자동 배치 → 30초 Disconnect 종료 Alarm Smoke Test
- 메인 화면 다음의 싱글플레이·멀티플레이 모드 선택
- 현재 Registry에서 자동 생성되는 PvP Emoji Catalog와 등급 필터
- Avatar·닉네임·10~15개 Pool 편집, 사본·고급·희귀 제한의 실시간 검증
- 같은 Page Runtime의 화면 전환 동안 Profile·Pool 초안 유지
- Desktop·Mobile 반응형 Profile Builder와 공용 Emoji 상세 정보 재사용
- Browser WebSocket Client의 생성·참가·준비·나가기·Session 재개 상태 머신
- 6자리 코드 입력과 존재하지 않는 방 Popup, 방 코드 복사, 양쪽 참가자·연결·준비 상태 UI
- 일시적 연결 종료 후 지수 Backoff 재접속과 30초 유예 내 `session.resume`
- 실제 두 Browser 연결의 방 생성 → 코드 참가 → 양쪽 준비 → Match 시작 검증
- 권위 Match Snapshot 기반 5×5 Board, 자기 Draw·Pool, 선택·배치 입력 잠금
- Server 시간 Offset을 반영한 15초 Deadline 숫자·Gauge와 시간 초과 자동 배치 반영
- Bingo Cell·Effect log·투사체·피해/회복 HP Delta 순차 연출
- HP 종료 전 최종 Match Snapshot·Effect Event 전송과 연출 완료 후 결과 전환
- 승리·패배·무승부·기권·연결 종료 사유와 양쪽 최종 Pool 결과 화면
- 실제 두 Browser에서 수동 배치·Turn 동기화·자동 배치·기권 결과·Profile 유지 검증
- 실제 두 Browser에서 다중 Turn 수동 배치 → Bingo 피해·회복 합산 → HP 승패 → 최종 연출 완료 후 결과 전환 검증
- Worker 재시작 중 입력 잠금과 30초 내 양쪽 `session.resume`, Room·revision·Board 수렴 및 복구 후 배치 재개 검증
- WebSocket Hibernation Attachment의 16KiB 제한을 넘지 않는 용량 제한형 중복 응답 캐시와 경계 단위 테스트
- Browser WebSocket Origin 허용 목록과 방 생성 Rate Limiting Binding
- Bingo 연출 시간을 제외한 온전한 15초 결정 시간과 Deadline 도착 유예
- 기권 확인, 결과 TTL 이후 결과 보존, Server 응답 우선 방 나가기

다음 단계:

1. Cloudflare Worker 배포
2. GitHub Repository Variable `MULTIPLAYER_SERVER_URL`에 배포된 Worker Origin 등록

Worker 개발 명령:

- `npm run dev:worker`: `wrangler dev` 로컬 서버
- `npm run smoke:worker`: 방·Match 배치·기권 WebSocket Smoke Test
- `npm run smoke:worker:timers`: 실제 15초 자동 배치·30초 Disconnect Alarm Smoke Test
- `npm run types:worker`: 설정 기준 Runtime/Binding Type 재생성
- `npm run typecheck:worker`: Type 재생성 후 Worker TypeScript 검사
- `npm run build:worker`: 배포 없이 Wrangler Bundle과 Binding 검사
- `npm run deploy:worker`: Cloudflare 계정에 실제 배포

Frontend는 Localhost에서 별도 설정 없이 `http://127.0.0.1:8787`에 연결한다. 배포 환경에서는 GitHub Repository Variable `MULTIPLAYER_SERVER_URL` 또는 `.env.example`의 `VITE_MULTIPLAYER_SERVER_URL`을 실제 Worker Origin으로 설정한다. 값이 없으면 멀티플레이 진입을 비활성화하고 설정 오류를 즉시 안내한다.
