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
| CHAT-001 | Not run | Not run | Pending | - | - |
| CHAT-002 | Not run | Not run | Pending | - | - |
| CHAT-003 | Not run | Not run | Pending | - | - |
| CHAT-004 | Not run | Not run | Pending | - | - |
| CHAT-005 | Not run | Not run | Pending | - | - |
| CHAT-006 | Not run | Not run | Pending | - | - |
| CHAT-007 | Not run | Not run | Pending | - | - |
| CHAT-008 | Not run | Not run | Pending | - | - |
| CHAT-009 | Not run | Not run | Pending | - | - |
| CHAT-010 | Not run | Not run | Pending | - | - |
| NOTI-001 | Not run | Not run | Pending | - | - |
| NOTI-002 | Not run | Not run | Pending | - | - |
| NOTI-003 | Not run | Not run | Pending | - | - |
| NOTI-004 | Not run | Not run | Pending | - | - |
| NOTI-005 | Not run | Not run | Pending | - | - |
| NOTI-006 | Not run | Not run | Pending | - | - |

