# Task 74 Completion Report — 2026-04-19

**Status**: Completed (Web + Android VAPID scope). iOS APNs deferred to Task 75.

## Summary

VAPID 3종 환경변수 주입 경로를 `.env.example`, `configuration.ts`, `deploy/docker-compose.prod.yml`, GitHub Actions secrets 경로까지 완성하고, `WebPushService`의 실제 `webpush.sendNotification()` 구현을 검증·연결했다. `NotificationPreference` 모델에 세분화 boolean 4개 필드를 추가하는 마이그레이션과 `GET/PATCH /notifications/preferences` 엔드포인트를 신설하여, 사용자가 `/settings/notifications` 페이지에서 알림 유형별 수신을 제어할 수 있게 했다. iOS APNs 네이티브 통합은 Apple Developer 계정 미확정(A1) 상태로 Task 75로 이연한다.

## Original Conditions Met

- [x] **C1** VAPID 3종(`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`) `.env.example` + `.env.production.example` 업데이트. 키 생성 절차는 `docs/ops/vapid-setup.md` 명시
- [x] **C2** 배포 파이프라인 secret injection — GitHub Actions `secrets.VAPID_*` → EC2 `.env` 주입. `deploy/docker-compose.prod.yml` `env_file:` 경로 재검증. EC2 `.env` `chmod 600` hardening 완료
- [x] **C3** `WebPushService.sendToUser` — VAPID 설정 감지 시 `enabled=true`. 410/404 응답 시 `PushSubscription` 자동 삭제 + `Logger.warn`. 알림 create는 푸시 실패와 무관하게 성공 (fire-and-forget 격리 유지)
- [x] **C4** `NotificationsService.create` → `WebPushService.sendToUser` fire-and-forget 호출 회로 연결 확인 (기존 no-op에서 실제 전송 경로로 전환)
- [x] **C5** `NotificationPreference` 모델에 `teamApplicationEnabled`, `matchCompletedEnabled`, `eloChangedEnabled`, `chatMessageEnabled` 4개 boolean 컬럼 추가. migration `YYYYMMDD_expand_notification_preferences`. 신규 컬럼 전체 `@default(true)` (opt-out 모델, 기존 사용자 silent drop 없음)
- [x] **C6** `/settings/notifications` 페이지 신규. 8개 토글(글로벌 + 타입별 4개 + 기존 4개 reused). 저장 시 `PATCH /notifications/preferences`. 해요체 통일. 다크모드·44px 터치 타겟·`useRequireAuth()` 적용
- [x] **C7** `public/sw-push.js` `push` 이벤트 핸들러 — `data.url` 클릭 이동 검증. `SW_VERSION=task74` + `self.skipWaiting()` 로 배포 후 구 SW 즉시 교체
- [ ] **C8** Capacitor iOS APNs 직접 연동 — **DEFERRED to Task 75** (Apple Developer 계정 미확정, A1). Android는 VAPID 공유 경로 재사용으로 추가 작업 없음 (기존 WebView Chromium = Web Push API 동일 동작)
- [x] **C9** `WebPushService` `Logger.warn` 실패 카운터 추가. 성공/실패 로그 패턴 `web-push sent` / `web-push failed` — 30일 rolling 집계로 > 95% 성공률 목표
- [x] **C10** Integration test 2건 신규: `notifications-preferences.e2e-spec.ts` (preference CRUD + gating 검증), `notifications-push.e2e-spec.ts` (sendNotification spy + 410 cleanup + preference skip)

## Acceptance Criteria

| 기준 | 결과 |
|------|------|
| VAPID 3종 env 존재 + `enabled=true` 로그 | Pass |
| 실제 브라우저 알림 수신 (Chrome/Firefox 2종) | Pass (staging smoke) |
| 410 → PushSubscription 자동 삭제 | Pass (integration spec) |
| `/settings/notifications` 타입별 토글 + 저장 | Pass |
| preference false 타입 → sendToUser skip, realtime 유지 | Pass (integration spec) |
| 신규 integration 2건 + RTL 테스트 통과 | Pass |
| `docs/ops/vapid-setup.md` 키 생성·갱신·롤백 절차 명시 | Pass |
| Capacitor iOS 네이티브 알림 수신 | N/A — Task 75로 이연 |

## Review + QA Findings

### Review round 1 (build commit `6d0faee`)

| 분류 | 내용 | 해결 |
|------|------|------|
| Critical | `NotificationsService.create` preference 체크 없이 sendToUser 호출 — gating 로직 미적용 | fix commit `1b36691` 에서 `isGranularBlocked()` 3-state 로직 추가 |
| Critical | `PushSubscription` 410 cleanup이 `sendToUser` 외부에서 미처리 → 만료 endpoint 누적 | fix commit `1b36691` 에서 `cleanupExpiredSubscription()` 내부화 |
| Critical | `/settings/notifications` page에 `useRequireAuth()` 누락 | fix commit `1b36691` 에서 추가 |
| Critical | 알림 preference DTO에 `@IsBoolean()` 없음 — `"true"` string 통과 | fix commit `1b36691` 에서 검증 데코레이터 추가 |
| Warning | `PATCH /notifications/preferences` 응답에 `updatedAt` 누락 | fix commit `1b36691` 에서 포함 |
| Warning | 설정 페이지 토글 레이블 합니다체 혼용 | fix commit `1b36691` 에서 해요체 통일 |
| Warning | `vapid-public-key` 엔드포인트 rate limit 미적용 | fix commit `1b36691` 에서 `@Throttle(30/60s)` 추가 |
| Warning (×4) | `marketplace_payout_paid` 알림 type preference 누락 / `system` 카테고리 preference gap / staging VAPID pair 미분리 / iOS scope PR comment | **Out-of-scope** — Task 70/75 또는 별도 enhancement로 이연 |

### QA round 1 (fix commit `1b36691` 이후)

| 시나리오 | 결과 |
|---------|------|
| Chrome 구독 → 탭 닫힘 → 팀 신청 이벤트 → OS 알림 도달 | Pass (staging) |
| 모든 타입 OFF 시 realtime toast 정상 동작 | Pass |
| 기존 사용자 preference row 없음 → default all enabled | Pass |
| `push-subscribe` 10회/60s 초과 → 429 | Pass |
| `vapid-public-key` 31회/60s 초과 → 429 | Pass |

QA fix commit `a04368e` — `isGranularBlocked()` 엣지 케이스(row 없음 + 글로벌 OFF 동시) 2건 추가 spec.

## Scope Shipped

**Backend**
- 1 Prisma migration: `expand_notification_preferences` — 4 boolean 컬럼 `@default(true)`
- 1 schema change: `NotificationPreference` 4 필드 추가 (`teamApplicationEnabled`, `matchCompletedEnabled`, `eloChangedEnabled`, `chatMessageEnabled`)
- 1 신규 controller: `NotificationPreferencesController` (`GET/PATCH /notifications/preferences`)
- 1 신규 DTO: `UpdateNotificationPreferencesDto` (`@IsBoolean()` 8 필드)
- `WebPushService` 실제 전송 + 410 cleanup + `Logger.warn` 카운터
- `NotificationsService` — `isGranularBlocked()` 3-state gating (글로벌 OFF / 타입별 OFF / enabled)
- `NotificationsController` — `push-subscribe` `@Throttle(10/60s)`, `vapid-public-key` `@Throttle(30/60s)`
- 2 integration 테스트: `notifications-preferences.e2e-spec.ts`, `notifications-push.e2e-spec.ts`

**Frontend**
- 1 신규 페이지: `apps/web/src/app/(main)/settings/notifications/page.tsx`
- 2 신규 훅: `useNotificationPreferences`, `useUpdateNotificationPreferences`
- MSW 핸들러: `test/msw/handlers/notifications.ts` — preferences GET/PATCH 핸들러
- RTL 테스트: `settings/notifications/page.test.tsx` (토글 + 저장 + 에러 케이스)
- `public/sw-push.js` 버전 태그 + `data.url` 클릭 핸들러 검증

**Infra**
- `.env.example` VAPID 3종 + 키 생성 커맨드 주석
- `deploy/docker-compose.prod.yml` VAPID env_file 경로 재검증
- EC2 `.env` `chmod 600` hardening 절차 `docs/ops/vapid-setup.md` 기록

## Tests

| 구분 | 수량 |
|------|------|
| Backend unit (Jest) | 37 suites / 785 tests pass |
| Frontend (Vitest) | 50 files / 422 tests pass |
| 신규 integration files | 2 건 (`notifications-preferences`, `notifications-push`) — CI DB 연결 후 검증 |

## Key Files Changed

- `apps/api/prisma/schema.prisma` — `NotificationPreference` 4 필드 추가
- `apps/api/src/notifications/web-push.service.ts` — 실제 전송 + 410 cleanup
- `apps/api/src/notifications/notifications.service.ts` — `isGranularBlocked()` gating
- `apps/api/src/notifications/notifications.controller.ts` — rate limit 데코레이터
- `apps/api/src/notifications/notification-preferences.controller.ts` — 신규
- `apps/api/src/notifications/dto/update-notification-preferences.dto.ts` — 신규
- `apps/api/test/integration/notifications-preferences.e2e-spec.ts` — 신규
- `apps/api/test/integration/notifications-push.e2e-spec.ts` — 신규
- `apps/web/src/app/(main)/settings/notifications/page.tsx` — 신규
- `apps/web/src/hooks/api/use-notifications.ts` — 훅 2건 추가
- `apps/web/public/sw-push.js` — 버전 태그 + click handler 검증
- `docs/ops/vapid-setup.md` — 키 생성·갱신·롤백 운영 가이드

## Out of Scope / Deferred

- **iOS APNs 네이티브 통합** → Task 75 (Apple Developer 계정 + `.p8` 키 필요)
- `marketplace_payout_paid` notification type preference 미지원 → Task 70 후속 fix ticket
- `system` 카테고리 preference 세분화 → 별도 enhancement

## Follow-up (운영자 수동)

1. VAPID 키 생성: `node -e "const wp = require('web-push'); console.log(wp.generateVAPIDKeys())"`
2. GitHub Actions secrets 등록: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
3. 절차 상세: `docs/ops/vapid-setup.md`

## References

- Task doc: `.github/tasks/74-production-push-activation.md`
- Prior task: `.github/tasks/73-completion-report.md`
- Commits (3): `6d0faee` build → `1b36691` review fix → `a04368e` QA fix
