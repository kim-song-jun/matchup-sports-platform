# v1 실시간 Socket.IO 게이트웨이 — 설계

- 작성일: 2026-07-19
- 대상 스택: `apps/v1_api`, `apps/v1_web`
- 순서: 이 스펙(Sub-project 1)이 먼저 dev에 머지된 뒤 `2026-07-19-v1-web-push-design.md`(Sub-project 2)가 같은 트리거 지점을 공유하며 이어진다.

## 배경

v1에는 실시간 전달 메커니즘이 전혀 없다(Socket.IO 의존성 자체가 `apps/v1_api`/`apps/v1_web` 어디에도 없음 — 조사로 확인). 알림은 `V1Notification` DB row 생성이 전부이고 프론트는 React Query 폴링에만 의존한다. legacy(`apps/api/src/realtime/realtime.gateway.ts`)에는 JWT 핸드셰이크 인증 기반 게이트웨이가 있고 `notification:new`/`chat:message` 두 이벤트를 `emitToUser(userId, event, payload)` 헬퍼로 내보낸다.

이 스펙은 legacy와 동일한 UX(탭이 열려 있으면 즉시 반영)를 v1에 이식하되, v1의 인증 모델(`resolveV1RequestIdentity`, 헤더/세션 기반)에 맞게 재설계한다.

## 아키텍처

### 백엔드 (`apps/v1_api`)

- 신규 모듈: `apps/v1_api/src/realtime/realtime.module.ts` + `realtime.gateway.ts`.
- 의존성 추가: `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` (apps/v1_api).
- **핸드셰이크 인증**: `handleConnection(client: Socket)`에서 `resolveV1RequestIdentity()`를 재사용 — REST 요청과 동일한 헤더(`x-v1-user-id`/`x-v1-user-email`) 또는 서명 세션 쿠키를 `client.handshake.headers`/`client.handshake.auth`에서 읽는다. 식별 실패 시 `client.disconnect(true)`. `V1AuthGuard`처럼 계정 상태(`suspended`/`blocked`/`deleted`) 체크도 동일하게 수행.
- **Room 전략**: 연결 성공 시 `client.join(`user:${userId}`)`. 채팅방은 클라이언트가 REST로 방을 열 때(`GET /chat/rooms/:id` 성공 시) 프론트가 `chat:join { roomId }` 이벤트를 보내면 서버가 `assertParticipant()`(기존 `ChatService`의 참가자 검증 재사용) 통과 시 `client.join(`chat:${roomId}`)`.
- **헬퍼**: `emitToUser(userId: string, event: string, payload: unknown): void` — `server.to(`user:${userId}`).emit(event, payload)`. legacy와 동일 시그니처.
- **이벤트**:
  - `notification:new` — payload는 `V1Notification` row 전체(직렬화된 형태, `NotificationsService`가 이미 `list()`에서 쓰는 매핑 재사용).
  - `chat:message` — payload는 신규 `ChatMessage` row(발신자 정보 포함, 기존 REST `POST /chat/rooms/:id/messages` 응답과 동일한 shape).
- **연결 지점**:
  1. `NotificationsService.createNotificationWithPrefCheck()`(`notifications.service.ts:313`) — `prisma.v1Notification.create()` 직후, 생성된 row를 `realtimeGateway.emitToUser(userId, 'notification:new', notification)`로 전달. 현재 이 메서드는 `Promise<void>`라 생성된 row를 반환하도록 시그니처 변경 필요(내부 전용 private 메서드라 외부 계약 영향 없음).
  2. `ChatService.sendMessage()`(`chat.service.ts:143`) — 메시지 영속화 성공 직후, 해당 room의 모든 참가자에게 `emitToUser(participantUserId, 'chat:message', message)`(각 참가자의 `user:<id>` room으로 개별 전송 — room 자체를 `chat:${roomId}`로 브로드캐스트하지 않는 이유: 참가자가 다른 화면에 있어도 받아야 하므로 유저 room 기준이 legacy 패턴과 일치).
- **부하 방지**: 이벤트 전송은 fire-and-forget(REST 응답/DB 트랜잭션과 무관하게 성공해야 함) — try/catch로 감싸 실패해도 호출자에게 전파하지 않는다(기존 알림 생성의 fire-and-forget 철학과 동일).

### 프론트엔드 (`apps/v1_web`)

- 의존성 추가: `socket.io-client`.
- `apps/v1_web/src/lib/v1-socket.ts` — 소켓 커넥션을 lazy-singleton으로 관리하는 `getV1Socket()`(인증된 사용자 1명당 1개 연결, 로그아웃 시 `disconnect()`). 핸드셰이크에 `getV1DevAuthHeaders()`(기존 `api-client.ts`의 동일 함수 재사용)를 `auth` 페이로드로 전달.
- `apps/v1_web/src/hooks/use-v1-realtime-socket.ts`:
  - `useV1NotificationSocket()` — 마운트 시 소켓 연결, `notification:new` 수신 시 `['v1-notifications']`/`['v1-notification-unread-summary']` React Query invalidate.
  - `useV1ChatRoomSocket(roomId)` — 방 진입 시 `chat:join`emit, `chat:message` 수신 시 `['v1-chat-room', roomId]` invalidate. 언마운트 시 리스너 해제(연결 자체는 유지 — 다른 화면에서도 알림 소켓이 필요하므로).
- 마운트 지점: `useV1NotificationSocket()`은 `apps/v1_web/src/app/providers.tsx`에 로그인 상태일 때만 마운트(비로그인 사용자는 연결 안 함 — 불필요한 연결 시도 방지).

## 테스트 계획

- BE: `realtime.gateway.spec.ts` — 핸드셰이크 인증 성공/실패(식별 불가 시 disconnect), `emitToUser`가 올바른 room으로 emit하는지(mock `Server`). `notifications.service.spec.ts`/`chat.service.spec.ts`에 게이트웨이 mock 주입 후 이벤트 발동 검증 추가.
- FE: `use-v1-realtime-socket.test.ts` — mock `socket.io-client`, 이벤트 수신 시 올바른 쿼리 키가 invalidate되는지.
- 수동 검증: v1 스택 기동 후 두 브라우저 탭(하나는 알림 유발 액션, 하나는 수신)으로 실시간 반영 확인.

## 기술부채 / 리스크

- Socket.IO 연결은 EC2 단일 인스턴스 기준 in-memory room이라 향후 다중 인스턴스 스케일 시 Redis adapter 필요 — 지금은 단일 인스턴스이므로 범위 밖, 필요 시점에 별도 트랙.
- 핸드셰이크 인증 실패 시 연결 자체를 끊기만 하고 클라이언트에 에러 메시지를 명확히 전달하지 않음 — 프론트는 재연결 실패를 조용히 무시(폴링 폴백이 있으므로 치명적이지 않음).

## Ambiguity Log

- 다중 인스턴스 스케일링(Redis adapter): 현재 인프라(EC2 단일 인스턴스) 기준 불필요, 스코프 아웃(2026-07-19 확인).
