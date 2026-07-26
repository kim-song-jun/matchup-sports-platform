# v1 Web Push — 설계

- 작성일: 2026-07-19
- 대상 스택: `apps/v1_api`, `apps/v1_web`, `deploy/`
- 선행 조건: `2026-07-19-v1-realtime-gateway-design.md`(Sub-project 1)가 dev에 먼저 머지되어 있어야 한다 — 같은 트리거 지점(`NotificationsService.createNotificationWithPrefCheck`)을 공유.
- 후속: 완료 시 GA4 `push_subscribe_complete` 이벤트를 이 기능의 구독 성공 지점에 연결(별도 Phase 1 워크트리 패턴 재사용).

## 배경

legacy(`apps/api/src/notifications/web-push.service.ts`)에 VAPID 기반 Web Push가 완성돼 있다(그레이스풀 디스에이블, `sendToUser()`, 410/404 구독 정리, `WebPushFailureLog`, Slack 알람 cron). v1에는 대응 기능이 전혀 없다(Prisma 모델도, 엔드포인트도, 서비스워커도 없음 — 조사로 확인). VAPID 시크릿 배관은 프로덕션(`deploy.yml`)에 이미 존재하지만 소비하는 서비스가 없는 "끊긴 배선" 상태였다.

**사용자 결정(2026-07-19)**: 운영자용 실패 로그 대시보드도 이번에 함께 만든다. 푸시 권한 요청은 (a) 알림 설정 페이지의 수동 토글과 (b) 온보딩 완료 직후 자동 프롬프트 두 경로 모두 지원한다.

## 아키텍처

### 백엔드 (`apps/v1_api`)

**Prisma 신규 모델** (schema.prisma, `V1` 네이밍 컨벤션):
```prisma
model V1PushSubscription {
  id         String   @id @default(cuid())
  userId     String
  endpoint   String   @unique
  p256dh     String
  auth       String
  createdAt  DateTime @default(now())
  lastUsedAt DateTime @updatedAt
  user       V1User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("v1_push_subscriptions")
}

model V1WebPushFailureLog {
  id             String    @id @default(cuid())
  userId         String
  subscriptionId String?
  statusCode     Int?
  errorCode      String?
  endpointSuffix String
  occurredAt     DateTime  @default(now())
  acknowledgedAt DateTime?
  acknowledgedBy String?

  @@index([occurredAt])
  @@index([acknowledgedAt])
  @@index([userId])
  @@map("v1_web_push_failure_logs")
}
```
신규 migration 파일 필수(idempotent, CLAUDE.md 마이그레이션 규율 준수).

**`apps/v1_api/src/notifications/web-push.service.ts`** (legacy 로직 이식, ConfigService/PrismaService DI 패턴은 v1과 동일하므로 구조 그대로):
- `onModuleInit()` — `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` 중 하나라도 없으면 `enabled=false` + warn 로그, 있으면 `webpush.setVapidDetails(...)`.
- `getPublicKey(): string | null` — `enabled`false면 null.
- `sendToUser(userId, {title, body, url?}): Promise<void>` — `enabled=false`면 즉시 return. `V1PushSubscription` 전체 조회 후 `Promise.all`로 `webpush.sendNotification()`. `410`/`404`는 구독 삭제, 그 외 실패는 `V1WebPushFailureLog`에 fire-and-forget 기록.
- `subscribe(userId, dto)` — endpoint 기준 upsert. `unsubscribe(userId, endpoint)` — 삭제.
- 의존성 추가: `web-push`, `@types/web-push`(apps/v1_api).

**엔드포인트 추가** (`apps/v1_api/src/notifications/notifications.controller.ts`):
- `GET /notifications/vapid-public-key` — 인증 불필요, `@Throttle({ default: { limit: 30, ttl: 60_000 } })`.
- `POST /notifications/push-subscribe` — `@UseGuards(V1AuthGuard)`, `@Throttle({ default: { limit: 10, ttl: 60_000 } })`, body `PushSubscribeDto { endpoint: string(IsUrl), keys: { p256dh: string, auth: string } }`.
- `DELETE /notifications/push-unsubscribe` — `@UseGuards(V1AuthGuard)`, body `PushUnsubscribeDto { endpoint: string }`.

**트리거 연결**: `NotificationsService.createNotificationWithPrefCheck()` — Sub-project 1에서 이미 `emitToUser(...)`(소켓)를 호출하도록 수정된 지점 바로 옆에, `void this.webPushService.sendToUser(userId, { title, body: body ?? undefined, url: deepLink ?? undefined }).catch(() => {})`를 나란히 추가(fire-and-forget, 실패가 알림 생성 자체를 막지 않음).

**운영 대시보드** (`apps/v1_api/src/admin/` 하위, 기존 v1 admin 모듈 컨벤션 따름 — legacy `AdminOpsModule`과 동일 계약):
- `GET /admin/ops/recent-push-failures?limit=20` — `AdminGuard`, `V1WebPushFailureLog` 최신순. PII 마스킹: `endpoint` 마지막 6자, `userId`는 sha256 8자.
- `POST /admin/ops/push-failures/ack` — `AdminGuard`, `acknowledgedAt` 타임스탬프 기록.
- 기존 v1 admin 요약 API가 없으므로 `pushFailures5m` 단일 카운트만 별도 `GET /admin/ops/summary`로 신설(legacy처럼 6개 KPI 전부는 v1에 대응 도메인이 없는 게 대부분이라 스코프 아웃 — push 실패 카운트 하나만).

### 프론트엔드 (`apps/v1_web`)

- `apps/v1_web/public/sw-push.js` — legacy 서비스워커 그대로 이식(프레임워크 독립적).
- `apps/v1_web/src/lib/analytics.ts`의 `trackEvent` 재사용 대상: 구독 성공 시 `push_subscribe_complete` 호출(이 스펙의 직접 범위는 아니지만 훅 지점만 마련 — 실제 이벤트 연결은 GA Phase 1 패턴대로 후속 워크트리에서).
- `apps/v1_web/src/hooks/use-v1-push-registration.ts` — Capacitor 없음 확인됨(웹 분기만 필요): `navigator.serviceWorker.register('/sw-push.js')` → `GET vapid-public-key` → `Notification.requestPermission()` → `pushManager.subscribe()` → `POST push-subscribe`. `cleanupPushSubscription()`(로그아웃 시 서버 delete 우선 → 브라우저 unsubscribe)도 이식.
- **권한 요청 트리거 두 곳**:
  1. `apps/v1_web/src/app/my/notifications/settings` (또는 기존 알림 설정 페이지)에 "브라우저 알림 받기" 토글 — 수동, 명시적 opt-in.
  2. 온보딩 완료(`onboarding-client.tsx`의 `complete()` 성공 직후) — 자동으로 `usePushRegistration()` 트리거. 단, `Notification.permission === 'denied'`(이전에 거부함)면 재요청하지 않음(브라우저 API 자체가 재요청을 막음 — 별도 처리 불필요).
- **관리자 UI**: `apps/v1_web/src/app/admin/ops/push-failures` — `components/admin/push-failure-table.tsx` 이식(PII 마스킹은 이미 백엔드에서 처리된 값 그대로 렌더).

### 인프라

- `deploy/docker-compose.prod.yml`의 `v1_api.environment`에 `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT: ${VAPID_...:-}` 3줄 추가 — 이미 CI가 `deploy/.env`에 동기화 중이므로(끊긴 배선 복구) 값이 즉시 사용 가능해질 것으로 예상(실값 존재는 GitHub Secrets 등록 여부에 달림, 운영자 확인 필요 — Known Blockers에 기록).
- Dockerfile 변경 불필요(GA와 달리 백엔드 런타임 시크릿, 프론트 빌드타임 값 아님).
- alpha 배포(`deploy-alpha.sh`)에도 동일하게 VAPID 값을 SSM 파라미터로 전달할지는 이번 스펙 범위 밖 — 필요 시 GA_ALPHA와 동일 패턴으로 별도 처리.

## 테스트 계획

- BE: `web-push.service.spec.ts` — graceful disable, `sendToUser` 성공/410/404/기타실패 각각. `notifications.controller.spec.ts`에 3개 엔드포인트 추가 테스트. admin ops 엔드포인트 PII 마스킹 검증.
- FE: `use-v1-push-registration.test.ts` — 구독 성공/거부/이미 구독됨 케이스, mock `serviceWorker`/`PushManager`/`Notification`.
- 수동 검증: 로컬 v1 스택 + 실제 VAPID 키 없이도 graceful-disable 동작 확인(엔드포인트 호출 시 에러 없이 null/no-op), 브라우저 알림 권한 팝업 트리거 지점 2곳 실제 클릭 확인.

## 기술부채 / 리스크

- 실패 로그 무제한 보관(legacy와 동일 이슈, Known Blockers #4 참고) — cleanup cron은 이번 스코프 밖.
- Slack 알람(`WebPushAlertService`)은 이번 스펙에서 포팅하지 않음(운영 대시보드 UI로 충분한 MVP로 판단) — 필요 시 후속.

## Ambiguity Log

- alpha 환경 VAPID 배관: 이번 스펙 범위 밖, 필요 시 GA_ALPHA 선례 재사용(2026-07-19 확인).
- Slack 알람 cron 포팅 여부: 스코프 아웃, 대시보드 UI로 대체(2026-07-19 확인).
