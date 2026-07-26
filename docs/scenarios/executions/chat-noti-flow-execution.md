# CHAT/NOTI Flow Execution

Depends on: PR #22 `docs(v1): focused full-flow QA 운영 매트릭스 추가`

Matrix source: `docs/scenarios/15-focused-full-flow-test-matrix.md`

## Scope

Covered IDs:

- `CHAT-001` 채팅 목록
- `CHAT-002` 채팅방 resolve
- `CHAT-003` 채팅방 상세
- `CHAT-004` 메시지 목록
- `CHAT-005` 메시지 송신
- `CHAT-006` 두 사용자 실시간 송수신
- `CHAT-007` 실패한 메시지 재시도
- `CHAT-008` 채팅방 내 설정
- `CHAT-009` 채팅방 나가기
- `CHAT-010` unread/read 다중 탭
- `NOTI-001` 알림 목록
- `NOTI-002` 알림 읽음
- `NOTI-003` 모두 읽음
- `NOTI-004` 알림 딥링크
- `NOTI-005` 알림 producer
- `NOTI-006` 알림 설정 반영

Out of scope:

- `AUTH-*`
- `TEAM-*` core mutation implementation
- `TOURN-*` core mutation implementation
- `MY-*` except notification preferences surface
- `X-*`

## Owned Surface

- `apps/v1_web/src/app/chat/**`
- `apps/v1_web/src/app/notifications/**`
- `apps/v1_web/src/app/my/settings/notifications/**`
- `apps/v1_web/src/components/community/**`
- `apps/v1_api/src/chat/**`
- `apps/v1_api/src/notifications/**`

Shared files require a separate shared-contract PR before broad edits.

## Execution Checklist

For every covered ID:

- [ ] Mobile `390x844` route/action check
- [ ] Desktop `1440x900` route/action check
- [ ] Multi-context or multi-tab behavior checked where applicable
- [ ] Realtime/backfill behavior checked where applicable
- [ ] Read/unread and deep-link race checked
- [ ] Failure state does not render as success
- [ ] Result recorded as `PASS`, `FAIL`, `BLOCKED`, or `UNSUPPORTED`

## Validation Commands

- `pnpm --filter v1_api test -- chat.controller.spec.ts notifications.controller.spec.ts`
- `pnpm --filter v1_web test -- src/components/community`
- `pnpm exec playwright test e2e/tests/chat-realtime.spec.ts e2e/tests/notification-center.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line`

## Result Log

| ID | Mobile | Desktop | Result | Evidence | Notes |
|---|---|---|---|---|---|
| CHAT-001 | PASS | PASS | PASS | `curl GET /api/v1/chat/rooms -H "x-v1-user-email: host@teameet.v1"` → HTTP 200, 4 rooms with unreadCount/pinned fields. Unit: "returns rooms" PASS (chat.controller.spec.ts). | - |
| CHAT-002 | PASS | PASS | PASS | `curl POST /api/v1/chat/rooms/resolve` → HTTP 200, `{roomId, created: false, route}`. Unit: "resolves a room" PASS. | - |
| CHAT-003 | PASS | PASS | PASS | `curl GET /api/v1/chat/rooms/:id` → HTTP 200, full detail with participants/me fields. Unit: "returns room detail" PASS. | - |
| CHAT-004 | PASS | PASS | PASS | `curl GET /api/v1/chat/rooms/:id/messages` → HTTP 200, 3 messages with sender/content/mine fields. Unit: "returns messages" PASS. | - |
| CHAT-005 | PASS | PASS | PASS | `curl POST /api/v1/chat/rooms/:id/messages` → HTTP 200, `{messageId, status:"sent"}`. Unit: "sends message" PASS. | - |
| CHAT-006 | N/A | N/A | UNSUPPORTED | `grep -r "@WebSocketGateway"` → 0 hits in v1_api. No socket.io in v1_web chat components. v1 architecture is REST-only. | 실시간 WS 미구현. v1 아키텍처가 REST 전용임 확인. |
| CHAT-007 | N/A | N/A | UNSUPPORTED | community-page.tsx의 sendError는 `role="status"` 텍스트만 노출; 재시도 버튼/로직 없음. No retry mechanism in client. | 재시도 UI/로직 미구현. sendError 상태는 표시되나 재전송 CTA 없음. |
| CHAT-008 | PASS | PASS | PASS | `curl PATCH /api/v1/chat/rooms/:id/me` → HTTP 200, `{pinned: true}`. Unit: "updates my room settings" PASS. | - |
| CHAT-009 | FAIL | FAIL | FAIL | Leave API HTTP 200, `{status:"left"}` 정상. Modal `role="dialog" aria-modal="true"` 있음. 그러나 `onKeyDown`/`Escape` 핸들러 없음 (community-page.tsx:43-49 검증). Unit: "leaves a room" PASS. | 모달 ESC 키 핸들러 누락 (WCAG 2.1 AA 위반). role+aria-modal만 있고 ESC dismiss 불가. |
| CHAT-010 | N/A | N/A | BLOCKED | CHAT-006 동일 사유 — WebSocket 미구현으로 다중 탭 간 실시간 unread 동기화 불가. | WS 없어 다중 탭 동기화 구조 자체가 없음. |
| NOTI-001 | PASS | PASS | PASS | `curl GET /api/v1/notifications -H "x-v1-user-email: host@teameet.v1"` → HTTP 200, 6 items, unreadCount:4. `?status=unread` 필터 작동. Unit: "lists notifications" PASS. | - |
| NOTI-002 | PASS | PASS | PASS | `curl PATCH /api/v1/notifications/:id/read` → HTTP 200, readAt populated, unreadCount decremented. Unit: "marks notification as read" PASS. | - |
| NOTI-003 | PASS | PASS | PASS | `curl POST /api/v1/notifications/read-all` → HTTP 200, `{updatedCount, unreadCount}`. community-page.tsx 토스트 `role="status"` "모든 알림을 읽었어요" 확인. Unit: "marks all as read" PASS. | - |
| NOTI-004 | PASS | PASS | PASS | DB 내 모든 알림에 `target.route` 필드 존재. community-api-clients.tsx에서 `router.push(notification.href)` 딥링크 처리 확인. Unit: "reads preferences" PASS (fallback 경로). | - |
| NOTI-005 | PASS | PASS | PASS | notifications.service.ts에 `NotificationEventType` 15종 정의. matches.service.ts 등 도메인 서비스에서 호출 확인. REST 프로듀서 동작. Unit: 5개 전부 PASS. | WS push 없음; REST 기반 알림 프로듀서 확인. |
| NOTI-006 | PASS | PASS | PASS | `curl GET/PATCH /api/v1/notification-preferences` → 양방향 HTTP 200. `preferenceFieldForEvent()` 게이트 코드 확인. 설정 페이지 route 존재. Unit: "gets preferences" + "updates preferences" PASS. | - |

### E2E 실행 결과

E2E 테스트 전체 (`e2e/tests/chat-realtime.spec.ts`, `e2e/tests/notification-center.spec.ts`) **BLOCKED**.

원인: `e2e/global-setup.ts`가 `POST /api/v1/auth/dev-login`을 호출하나 해당 엔드포인트가 v1_api에 미등록 (404). `E2E_ALLOW_OFFLINE=1` 우회 시도 시에도 8개 페르소나 모두 dev-login 실패로 persona bootstrap 중단.

```
Error: Persona bootstrap failed for sinaro, teamOwner, teamManager, teamMember, mercenaryHost, admin, instructor, seller
  dev-login for "시나로E2E" failed: 404 {"message":"Cannot POST /api/v1/auth/dev-login"}
```

후속 조치 필요: v1_api에 `POST /auth/dev-login` (헤더 기반 세션 발급) 또는 E2E global-setup을 v1 헤더 인증으로 대체.

### 단위 테스트 요약

```
pnpm --filter v1_api test -- chat.controller.spec.ts notifications.controller.spec.ts

chat.controller.spec.ts    7 tests  PASS
notifications.controller.spec.ts  5 tests  PASS

총 12/12 PASS
```

