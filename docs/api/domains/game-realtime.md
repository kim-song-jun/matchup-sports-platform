# Game realtime contract

<!-- API_CONTRACT_SECTION_BEGIN:Frozen realtime contract -->
### Frozen realtime contract

- Namespace는 `/game-operations`다. 운영 환경에서는 `teameet_v1_session` HMAC 세션 쿠키만 identity로 인정하며, `x-v1-user-id`/`x-v1-user-email` 헤더는 비운영 환경 호환 경로에서만 사용할 수 있다. 연결 전 middleware가 세션 identity, 필수 metadata인 비어 있지 않은 `clientInstanceId`와 0 이상의 safe integer `authorizationSubjectVersion`, DB 사용자 존재 여부, `suspended`/`blocked`/`deleted` 계정 상태, 소셜 가입 onboarding gate를 모두 검사한다. 성공한 identity는 `socket.data`에 먼저 hydrate되므로 `connect` callback에서 지연 없이 subscribe할 수 있다. 운영 환경의 누락·위조·변조·만료 세션 또는 다른 gate 실패는 `connect` 전에 `connect_error`(`SOCKET_AUTH_FAILED`)로 끝난다.
- Client event는 정확히 `game.subscribe {gameId,afterSequence}`, `game.unsubscribe {gameId}`, `game.time.ping {clientSentAt}`, `game.event.append {gameId,expectedVersion,clientEventId,takeoverToken?,payloadHash,event}`, `game.event.retry {gameId,rebasedExpectedVersion,clientEventId,takeoverToken?,payloadHash,event}`, 그리고 운영권 커맨드 `game.takeover.request`·`game.takeover.renew`다. append/retry에서 `takeoverToken` key는 생략할 수 있지만, 제공하면 공백 문자가 아닌 문자를 하나 이상 포함한 문자열이어야 하며 원문 그대로 전달된다. `null`, 빈 문자열·공백 전용 문자열, 다른 타입과 나머지 추가/누락 key, 잘못된 event shape, 음수·분수·unsafe integer는 `VALIDATION_ERROR`다. 생략은 lease를 부여하지 않으며 실제 source 권한과 lease 판정은 GamesService가 수행한다. Socket의 `afterSequence`는 JSON number인 0 이상의 safe integer여야 한다.
- Server event는 `game.snapshot {gameId,version,state,lastSequence,events}`, `game.event.ack {clientEventId,sequence,version,status}`, `game.event.committed {gameId,sequence,version,event}`, `game.gap {expectedSequence,availableFrom}`, `game.permission.revoked {gameId,assignmentVersion}`, `game.time.pong {clientSentAt,serverReceivedAt,serverSentAt}`, `game.error {code,clientEventId?,expectedVersion?}`다. `game.event.ack.status`는 `committed` 또는 `replayed`다. `game.time.ping`/`game.time.pong`은 timestamp를 왕복시킬 뿐이며 서버가 그 값으로 client offset을 계산하거나 거부를 판단하지는 않는다 — 이와 별개로, `game.event.append`(HTTP `POST /api/v1/games/:gameId/events`와 동일한 `GamesService.appendEvent` 경로)와 `start`/`pause`/`resume`/`end`/`end-period`/`start-period`/`revert-period`/`next-period` 커맨드(`GamesService.executeCommand`)는 요청에 실린 `occurredAt`이 서버 현재 시각과 30초(`CLOCK_DRIFT_TOLERANCE_MS`) 이상 벌어지면 `assertClockNotDrifted`가 `422 CLOCK_DRIFT`(socket에서는 `game.error {code:'CLOCK_DRIFT'}`)로 거부하며 이벤트를 만들지 않는다. `game.event.retry`만 이 검사에서 예외다 — offline 상태에서 캡처돼 뒤늦게 도착하는 event는 `occurredAt`이 서버 현재 시각과 멀어지는 것이 정상이고, `payloadHash` pinning이 이미 `occurredAt` 위변조를 막으므로 재검증하지 않는다.
- Subscribe는 source-scoped read 권한을 다시 검사하고 tournament fixture이면 현재 assignment version도 비교한 뒤에만 backfill하고 `game:<gameId>` room에 join한다. HTTP `GET /api/v1/games/:gameId/events?afterSequence=N`의 `N`은 생략 시 `0`, 그 외에는 ASCII 숫자만으로 된 0 이상의 safe integer여야 하며 exponent, hex, 부호, 소수, 빈 값, 반복 query는 `400 VALIDATION_ERROR`다. 서비스는 `RepeatableRead` 안에서 `lastSequence` watermark를 먼저 고정하고 `afterSequence < sequence <= lastSequence`만 오름차순으로 읽으므로 응답의 event 범위와 watermark가 일관된다.
- MD-QA #135: 인증된 `GET /api/v1/games/:gameId`는 해당 게임에서 서버가 선택한 `realtimeAuthorization`을 함께 반환해요. 스태프는 `{ kind: 'staff', subjectVersion }`, 운영자는 `{ kind: 'platform_ops', subjectVersion: 0 }`, 일반 비범위 구독은 `{ kind: 'unscoped', subjectVersion: 0 }`, 현재 실시간 권한을 확인할 수 없는 기존 읽기 주체는 `{ kind: 'unavailable' }`예요. 클라이언트는 대회 전체 배정 버전을 다시 계산하지 않고, 현재 게임 상세가 확인된 뒤 이 값을 핸드셰이크에 사용해요. 소켓 구독은 기존처럼 현재 게임 권한·정확한 버전·회수·만료·lease를 다시 검사해요.
  - Socket subscribe는 기존 cursor 계약대로 요청한 `afterSequence`에서 한 번 backfill한다. History 조회, room lease 활성화, 최종 resource/assignment 재검사와 ACK 준비는 동일한 fair refresh scheduler 작업에 묶여 global 4개·game별 2개의 실제 작업 한도를 공유한다. 같은 세대에서 더 최신인 snapshot이 먼저 만들어졌으면 ACK도 그 snapshot을 반환한다.
  - 경기별 권한 버전은 인증된 `GET /api/v1/games/:gameId`의 `realtimeAuthorization`에서 받아요. 서버는 Gateway와 동일한 canonical read 판정과 `createdAt`·`id` 정렬로 선택한 배정의 버전을 반환하며, 클라이언트는 대회 전체의 최댓값을 계산하지 않아요. 이 응답은 조회 시점의 권한 정보이므로 이후 회수·만료·버전 변경은 기존 Gateway의 구독·운영권 재검사에서 다시 거부돼요.
- `game.snapshot.events`와 `lastSequence`는 위 bounded backfill 결과다. 반환된 event 사이에서 처음 기대한 sequence가 없으면 `game.gap {expectedSequence,availableFrom}`을 추가 emit한다. 이는 반환 목록에서 처음 관측된 불연속을 뜻하며 gap 자체를 복구하거나 누락 event를 합성하지 않는다. 재연결은 HTTP backfill 또는 새 subscribe snapshot의 durable sequence를 기준으로 이어가고, client는 sequence/clientEventId로 중복 delivery를 제거해야 한다.
- Persisted `game.event.committed`는 각 현재 구독 socket에 미완료된 subscribe/lifecycle snapshot이 있을 때 그 snapshot이 먼저 전달된 뒤 FIFO로 보낸다. 이미 수렴한 event-only 경로는 추가 full-history 조회 없이 기존처럼 보낸다. 수신자별 FIFO는 socket/game/generation에만 묶이며 게임별 미전달 event는 128개, socket 전체는 512개까지 보관한다. 한도를 넘기거나 필요한 snapshot을 확인할 수 없으면 해당 socket의 Engine.IO transport만 닫는다. 이는 Socket.IO namespace disconnect packet을 보내지 않아 자동 재연결을 유지하며, 클라이언트는 기존 connect 경로에서 `game.subscribe {afterSequence: 0}` 전체 backfill을 받아 복구한다. 중간 committed event를 서버 메모리에서 조용히 버리지 않는다. Socket command 발신자의 `game.event.ack`는 즉시 반환하고, 구독 중이면 자기 `game.event.committed`도 다른 recipient와 같은 순서 규칙을 따른다. 한 recipient의 전달 지연은 다른 socket/game을 막지 않는다. unsubscribe·재구독·lease 회수·만료·disconnect·shutdown은 소유 queue를 정리한다.
- REST 경기 lifecycle command(`start`, `pause`, `resume`, `end`, `end-period`, `start-period`, `revert-period`, `next-period`)가 새 변경으로 성공하면, HTTP 응답을 보존하면서 서버는 실제 game room에 연결된 각 live socket의 기존 scoped 또는 unscoped read 권한을 다시 확인한 뒤 `afterSequence: 0`의 전체 durable history와 최신 game `state`/`version`을 해당 socket에 기존 `game.snapshot`으로 보낸다. Scoped staff는 assignment version·lease 만료·room generation을, unscoped 구독은 room generation/owner를 재확인한다. 동일 socket/game/generation에서는 이미 보낸 `(version,lastSequence)`보다 낮은 snapshot을 보내지 않으며, unsubscribe·재구독·disconnect 때 해당 watermark를 정리한다. replay와 실패한 command는 이 refresh를 만들지 않는다. 이 snapshot은 room에 operator HTTP payload를 공유하지 않으며, 상세 period clock은 기존 `GET /api/v1/games/:gameId` 응답으로 확인한다. 접근이 취소됐거나 재검증 중 lease/generation이 바뀐 socket에는 snapshot을 보내지 않는다.
- Offline retry의 canonical 경로는 `GamesService.retryEvent(user, gameId, input)` 하나다. `payloadHash`는 takeover token을 제외한 immutable event의 canonical hash와 일치해야 한다. 같은 actor/game/clientEventId의 저장된 event와 hash가 같으면 새 token이나 rebased version 검사보다 먼저 기존 sequence/version을 `replayed`로 반환한다. 기존 ID의 immutable payload가 다르면 `409 IDEMPOTENCY_PAYLOAD_CONFLICT`; unseen ID의 hash, rebased version, 권한, 비어 있지 않은 token 요구 또는 event 참조가 맞지 않으면 mutation 없이 `OFFLINE_EVENT_REBASE_CONFLICT` 등 해당 domain error를 반환한다. 실패에는 ACK/committed를 emit하지 않는다.
- 소셜 가입에서 프로필 입력을 미룬 계정(`onboardingStatus = social_profile_deferred`)은 읽기·구독만 가능하다. 어드민이 아닌 이 계정이 `game.event.append`/`game.event.retry`를 보내면 `game.error {code:'ACTIVITY_PROFILE_REQUIRED'}`(error ack code도 동일)로 거부되고 mutation은 없으며, `game.takeover.request`/`game.takeover.renew`는 `{status:'denied', code:'ACTIVITY_PROFILE_REQUIRED'}`를 돌려준다. 재시도해도 같은 결과이므로 retryable이 아니다 — 클라이언트는 재전송·큐 재시도를 멈추고 사용자를 `/signup/social?redirect=…`로 보내 프로필을 마치게 한 뒤 다시 시도하게 한다(HTTP 쓰기의 `403 ACTIVITY_PROFILE_REQUIRED`와 같은 게이트).
- token 발급·갱신은 Socket `game.takeover.request`·`game.takeover.renew`가 맡고 REST로는 발급되지 않는다(`TOURNAMENT_FIXTURE` 게임 커맨드에 필수). 실제 서비스는 발급된 token의 game·authorization subject·client instance binding과 만료를 검사한다. Socket은 전달·알림 계층이며 DB transaction과 HTTP/service 권한·version·idempotency 결과가 authoritative하다. replay도 ACK와 committed delivery를 다시 만들 수 있으므로 수신자는 durable sequence 기준으로 멱등 처리한다.
- MD-QA #139: `game.takeover.request`는 첫 활동 프로필/권한 조회 전에 서버 내부 예약을 만들며, 마지막 game metadata 조회 후 성공한 발급 순서를 동기적으로 적용한다. 이미 더 늦게 도착한 정상 요청이 발급받았으면 과거 요청은 `{status:'denied', code:'TAKEOVER_SUPERSEDED'}`를 반환하고 token을 바꾸지 않는다. 새 요청이 권한 검사에 실패했으면 이전 정상 요청은 계속 가능하다. 클라이언트 payload로 ordinal을 받지 않으며 프로필 거부·DB 실패·정상 종료 모두 예약을 해제한다. 만료/회수가 진행 중 예약의 성공 순서 기록을 지우지 않고, 모든 예약 종료 시 해당 기록을 제거한다. `TAKEOVER_SUPERSEDED`는 새 요청과 갱신 모두의 오류이며 만료처럼 자동 재획득하지 않는다. MD-QA #165: `game.takeover.request`는 선택 key `force:boolean`을 받는다. `force`가 없거나 false인데 **다른 authorization subject**(다른 사람)의 살아 있는 grant가 있으면 `{status:'denied', code:'TAKEOVER_HELD', holderName}`으로 거절하고 그 grant를 건드리지 않는다 — 콘솔은 보기 모드로 열리고, 사용자가 확인 창을 거친 뒤에만 `force:true`로 다시 요청한다. 같은 subject(같은 사람의 새 탭·새로고침)는 지금처럼 바로 넘긴다. 갱신이 `TAKEOVER_SUPERSEDED`로 거절될 때도 `holderName`을 싣는다. `holderName`은 보유자 닉네임이며 모르거나 묻는 사람 자신이면 `null`이다. 이 순서·grant registry는 현재 단일 API 프로세스의 메모리 상태다. 다중 API 인스턴스 간 일관성은 이 변경의 검증 범위가 아니다.
- Tournament staff revoke가 commit되면 해당 사용자의 해당 tournament 구독만 대상으로, 추적된 game마다 `game.permission.revoked`를 그 사용자의 socket에 먼저 보내고 그 socket만 해당 room에서 퇴장시킨다. 다른 사용자와 다른 tournament 구독은 유지되며, 이후 stale `authorizationSubjectVersion` subscribe는 `STAFF_SCOPE_DENIED`다. 계정 정지·차단·삭제는 별도 user-room 강제 disconnect 경계다.

### 실시간 전파의 자원 한도

- `/game-operations` namespace의 `game:<gameId>` room에 속한 socket ID만 순회하고, 추적 중인 소켓의 신원·room 참여·구독 세대를 확인해요. 미전달 committed event 수는 추가·전달·삭제 때 증분 집계해요. 기존 socket/game당 128개·socket 전체 512개 한도를 유지해요. 경기별 정리는 socket/game key로 바로 찾고, 소켓 전체 정리는 해당 소켓의 queue-key 인덱스를 사용해요.
- Lifecycle snapshot 갱신은 socket/game/generation마다 하나의 작업으로 병합해요. 대기 중에도 가장 높은 요청 version floor를 유지하며, 전체 최대 4개·경기당 최대 2개의 갱신 작업을 공정하게 실행해요. 승인된 수신자는 버리지 않고, 구독 가능한 소켓 수나 권한 정책을 바꾸지 않아요. 시작 전에 취소된 작업은 DB를 읽지 않고 끝나요. 진행 중인 작업은 실제 갱신 promise가 성공하거나 실패로 끝난 뒤에만 실행 자리를 반환해요. 서버 종료 때는 대기 작업을 취소하고 진행 중인 작업은 실제 완료 후 `finally`에서 자리를 반환해요. 개별 DB 요청의 외부 timeout은 이 한도로 보장하지 않아요.
- Pending 구독 또는 권한 만료 뒤 자동 재가입 중 갱신이 실패해도 이미 확정된 명령의 최소 버전은 해당 ACK record와 세대에 숫자로 보존해요. 초기 결과와 같은 세대의 최신 snapshot 모두 이 버전에 못 미치면 오래된 snapshot이나 성공 ACK를 보내지 않고 기존 내부 오류·transport 재연결 경로로 복구해요. 이미 버전을 충족하는 결과는 정상 응답하고, 이전 세대의 실패로 새 구독을 변경하지 않아요.

<!-- API_CONTRACT_SECTION_END:Frozen realtime contract -->

## 경기 시간 만료 확인 (MD-QA #142)

서버 worker의 자동 기간 종료는 [Game 기간 종료 계약](./games.md#실제-경기-시간-만료와-기간-종료-md-qa-142)을
따른다. 이 내부 처리를 위한 client/server Socket event나 payload는 추가하지 않는다. 기존
`game.snapshot`에는 기간 상세가 없고 standalone worker에는 room broadcast delegate도 없으므로,
Socket 연결이나 snapshot만으로 worker의 기간 종료가 즉시 전달된다고 가정하지 않는다.

- 콘솔의 시계는 서버 offset을 적용하고 완료된 정지 및 진행 중 정지를 제외해 경과 시간을
  표시한다. 진행 중인 기간의 설정 시간에 도달하고 일시정지가 아닐 때만 만료 안내를 보여 준다.
  브라우저의 만료 판단은 안내와 조회를 시작할 뿐, `end-period`·`end`나 결과 제출을 자동 전송하지 않는다.
- 일반 Game 상세 조회가 현재 경기와 일치하고 운영 snapshot보다 더 높은 버전을 반환하면,
  같은 응답의 `state`/`version`을 기존 수락 경계로 함께 반영해 운영 상태·버전을 최신으로 올린다.
  같은 React batch에서 더 최신 Socket 버전이 이미 수락됐으면 오래된 상세는 거부한다.
  이 동기화는 상세 캐시를 다시 쓰지 않는다.
- 만료 안내 중이거나 상세 조회의 `version`이 콘솔이 이미 수락한 `version`보다 뒤처지면
  `GET /api/v1/games/:gameId`를 즉시 읽고 이후 5초 간격으로 다시 확인한다. 버전 지연 복구는
  일시정지 중이거나 아직 만료되지 않은 기간에도 적용하고 ‘최신 경기 진행 상태를 확인하고 있어요’를
  표시한다. 두 조건이 모두 해소되면 이 재조회를 멈춘다.
- 같은 조회 범위에서 요청을 겹쳐 보내지 않으며 시간 초과나 범위 종료 시 진행 중인 요청을
  취소한다. 경기·사용자·현재 기간·기간 시작/정지 정보·경기 상태가 바뀌면 이전 범위의 응답은
  적용하지 않는다. 응답의 Game ID가 현재 경기와 같고, 현재 캐시 및 콘솔이 이미 수락한
  버전보다 오래되지 않았을 때만 기간 상세와 `state`/`version`을 함께 반영한다. 이후 운영
  명령은 새 버전을 기준으로 보낸다. worker의 기간 종료를 확인하면 `HALFTIME` 또는 마지막
  기간 종료 화면으로 전환하고, 다음 기간 시작이나 경기 종료/결과 제출은 운영자가 기존 흐름으로 진행한다.
- 조회 실패는 오류와 ‘종료 상태 다시 확인’을 표시하고 재조회할 수 있게 한다. 서버 확인을
  기다리는 동안 기존 수동 기간 종료도 유지하며, 운영 권한과 version 충돌 오류는 기존 HTTP
  계약을 따른다. 버전 지연 복구 중의 조회 실패도 같은 오류·재확인 경로를 사용한다.
  5초 조회 주기는 서버의 확정 처리 시한을 뜻하지 않는다.

## Account withdrawal

- A successful withdrawal commits `withdrawal_pending` before disconnecting the user's active user-room sockets. New connections for a pending account are rejected, and the user-room join path checks the current account state again after joining to close the race with a concurrent withdrawal commit.
- A failed withdrawal transaction preserves existing sockets. If disconnecting sockets fails after commit, the error is logged while the committed withdrawal state and successful API response remain authoritative.
