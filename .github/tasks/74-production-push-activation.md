# Task 74 — Production Push Notifications Activation

Owners: project-director + tech-planner
Drafted: 2026-04-19
Status: Draft — awaiting iOS APNs availability confirmation (Firebase 미사용 정책)

---

## Context

`CLAUDE.md` 의 Known Blockers:
> 1. **VAPID 키 미생성**: `WebPushService`는 크레덴셜 없을 때 graceful disable(`enabled=false`)로 동작하므로 빌드/머지는 가능. 실제 디바이스 푸시 수신은 아래 환경변수가 필요 — `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`. Capacitor 모바일 푸시는 `@capacitor/push-notifications` + 네이티브 프로젝트 설정 추가 필요.

Task 69 에서 알림 fan-out (team application, match completed 등) 12건은 서버 측에서 DB 에 `Notification` 레코드를 생성하지만, 실제 사용자 디바이스까지 **푸시가 도달하지 않는 상태** 다. `NotificationsService` 는 Socket.IO realtime emit 까지만 보장하고, `WebPushService.sendToUser` 는 VAPID 미설정으로 no-op.

이번 task 는 이 블로커를 최종적으로 해소하여 **로그인 없이 닫아둔 탭/홈 화면에서도 알림이 도달**하도록 한다.

### 기술 스택 확정 (Firebase 미사용)

본 프로젝트는 의도적으로 **Firebase / FCM 스택을 배제**했다. 근거:
- `CLAUDE.md` §WebPushService: "Firebase 미사용 — `web-push` 패키지 + VAPID로 EC2에서 직접 발송"
- migration `20260406020000_replace_fcm_with_web_push` — 초기 FCM 모델을 `PushSubscription` 테이블로 교체 완료
- `apps/api/package.json` — `web-push@^3.6.7` 만 설치, `firebase-admin` 없음
- `apps/web/src/hooks/use-push-registration.ts` — Capacitor 분기에서 `@capacitor/push-notifications` 사용 (iOS=APNs 직접)

따라서 이번 task 의 스택은:
- **웹(Chrome/Firefox/Safari/Edge, 데스크톱 + 모바일 PWA)**: `web-push` + VAPID
- **Capacitor iOS**: `@capacitor/push-notifications` + APNs 인증 키(.p8) 직접 연동 (Firebase 게이트웨이 없음)
- **Capacitor Android**: Chrome 의 Web Push API 가 네이티브 동작. 별도 FCM 게이트웨이 불필요 — Capacitor WebView 가 Chromium 기반이므로 VAPID 구독이 그대로 유효. 네이티브 `PushNotifications` 플러그인이 요구하는 FCM 경로는 **사용하지 않는다**

---

## Goal

1. 프로덕션 환경에서 웹 푸시 알림이 실제로 발송되어 사용자 디바이스 알림창에 표시된다
2. 사용자가 `/settings/notifications` (또는 동등 경로)에서 알림 유형별 수신 여부를 제어할 수 있다
3. 만료/폐기된 구독은 자동으로 DB 에서 삭제되어 useless push 시도를 최소화한다
4. Capacitor 네이티브 iOS/Android 푸시는 계정 가용 시 함께 활성화, 아니면 별도 후속 task 로 이연

---

## Original Conditions (verbatim)

- [ ] **C1** VAPID 키 생성 + `.env.example`, `.env.production.example` 업데이트. `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT=mailto:admin@teameet.kr` 삼종 등록
- [ ] **C2** 배포 파이프라인에 secret injection — GitHub Actions `secrets.VAPID_*` 또는 EC2 SSM Parameter Store / `.env.production` 주입 경로 확정 (infra-security-dev 결정)
- [ ] **C3** `WebPushService` — VAPID 설정 감지 시 `enabled=true` 로 실제 `webpush.sendNotification()` 호출. 실패(410 Gone, 404 등) 시 해당 `PushSubscription` 자동 삭제 + warn log
- [ ] **C4** `NotificationsService.create` → `WebPushService.sendToUser` 를 fire-and-forget 으로 호출 (기존 회로 이미 있으나 실제 전송 경로 연결)
- [ ] **C5** `NotificationPreference` 모델 확인. 알림 유형별 `boolean` 필드 존재 여부 — 없으면 마이그레이션으로 `team_application`, `match_completed`, `elo_changed`, `chat_message` 등 핵심 타입 컬럼 추가
- [ ] **C6** 프론트엔드 `/settings/notifications` 페이지 신규 — 각 알림 유형 체크박스 토글, 저장 시 `PATCH /notifications/preferences` 호출
- [ ] **C7** 서비스 워커 `public/sw-push.js` 에서 `push` 이벤트 클릭 시 해당 알림의 `data.url` 로 이동 (기존 파일에 이미 있는지 검증, 없으면 추가)
- [ ] **C8** Capacitor 모바일 푸시 (**optional scope — Ambiguity Log A1 에서 결정**):
  - `@capacitor/push-notifications` 설치 상태 확인 (프론트엔드 훅이 이미 dynamic import 사용)
  - **iOS**: Apple Developer 계정 + APNs `.p8` 인증 key 등록. `capacitor.config.ts` 에 `PushNotifications` presentationOptions 설정. 서버 측 APNs 발송은 `node-apn` / `@parse/node-apn` 패키지 + `.p8` key 로 직접 구현 (Firebase 경유 금지)
  - **Android**: 별도 네이티브 푸시 없이 **Chrome WebView 의 Web Push API 를 그대로 사용**. `@capacitor/push-notifications` 의 Android(FCM) 경로는 **사용하지 않음**. 필요 시 `@capacitor-community/webpush` 폴백 검토
  - `usePushRegistration` 훅에서 `Capacitor.getPlatform()` 결과가 `ios` 일 때만 네이티브 토큰 등록, `android`·`web` 은 VAPID 구독 경로로 통일
- [ ] **C9** 알림 전송 실패 메트릭 — `WebPushService` 에 `Logger.warn` + 카운터. 배포 후 30일 Rolling 집계로 발송 성공률 > 95% 달성
- [ ] **C10** E2E/integration test:
  - `WebPushService.sendToUser` 가 활성화 설정에서 올바르게 호출되는 spec
  - 구독 만료(410) → 자동 DB 삭제 spec
  - NotificationPreference 기반 수신 거부 → sendToUser skip spec

---

## User Scenarios

### S1 — 웹 사용자가 푸시 구독 후 탭 닫기 (C1·C3·C4)
사용자가 Chrome 에서 로그인 → 상단 배너에서 "알림 허용" 수락 → 서비스 워커 등록 + `POST /notifications/push-subscribe` 성공. 사용자가 브라우저 탭을 닫은 상태에서, 다른 사용자로부터 팀 가입 신청이 들어옴 → 몇 초 내에 OS 알림 센터에 "새 팀 가입 신청이 왔어요" 푸시 도달 → 클릭 시 `/my/teams` 로 이동.

### S2 — 알림 유형별 수신 거부 (C6)
사용자가 `/settings/notifications` 방문. "ELO 변경 알림" 토글 OFF. 이후 매치 완료로 ELO 가 바뀌었을 때 realtime toast 는 뜨지만 OS 푸시는 발송되지 않음. 다른 타입(팀 신청, 채팅 메시지)은 정상 수신.

### S3 — 만료 구독 자동 정리 (C3)
사용자가 기기 교체 후 구 구독이 만료. 백엔드가 해당 endpoint 로 푸시 전송 → 410 Gone 응답 → `PushSubscription` row 자동 삭제. 다음 알림부터는 해당 endpoint 대상 전송 시도 없음. 로그에 `removed expired subscription endpoint=...` 한 줄 기록.

### S4 — Capacitor iOS 사용자 (C8, optional)
iOS 앱 첫 실행 시 APNs 권한 요청 → 수락 → 네이티브 디바이스 토큰 획득 → `POST /notifications/push-subscribe` 에 플랫폼 정보와 함께 저장 → 팀 신청 수신 시 APNs 경유로 iOS 네이티브 알림 표시.

---

## Test Scenarios

### Happy path
- C3·C4: VAPID env 설정 + 웹 푸시 구독 후 `NotificationsService.create({ userId, type: 'team_application_received' })` 호출 → `webpush.sendNotification()` 실제 호출 확인 (spy)
- C6: `/settings/notifications` POST → `notificationPreference.team_application = false` 저장 → 후속 fan-out 시 sendToUser skip

### Edge cases
- C3: 만료 endpoint (410) → PushSubscription 삭제 + 예외 swallow (알림 create 는 성공)
- C3: 네트워크 오류 / 500 → retry 없음, warn log. 사용자는 영향 없음
- C5: 기존 NotificationPreference row 없는 사용자 → default 모든 타입 enabled 로 처리
- C6: 모든 타입 OFF 시에도 realtime 은 동작 (푸시만 off)

### Error cases
- C1: VAPID_PUBLIC_KEY 가 base64url 형식 아닐 때 → `WebPushService.onModuleInit` 에서 warn + `enabled=false` fallback (기존 동작 유지)
- C3: private key exposure 테스트 — 로그에 private key 문자열이 남지 않도록 cat .env 결과 grep

### Mock / fixture updates
- `apps/api/src/notifications/web-push.service.spec.ts` — 신규 또는 확장. sendNotification 모킹.
- `apps/api/test/integration/notifications-push.e2e-spec.ts` — 신규. VAPID 테스트 전용 key 주입.
- `apps/web/src/app/(main)/settings/notifications/page.test.tsx` — 신규 RTL 테스트.

---

## Parallel Work Breakdown

### Wave 0 (sequential — schema + secrets)
- **[infra-security-dev]** VAPID 키 3종 생성 + `.env.example` 갱신 + GitHub Actions secrets 등록 가이드 작성 (`docs/ops/vapid-setup.md` 신규)
- **[backend-data-dev]** `apps/api/prisma/schema.prisma` — `NotificationPreference` 모델 컬럼 확인, 필요한 알림 타입 boolean 필드 추가. migration `YYYYMMDD_expand_notification_preferences`

### Wave 1 (parallel)
- **Track A — backend-api-dev**: `NotificationPreferencesController` + `PATCH /notifications/preferences` 엔드포인트. DTO 검증.
- **Track B — backend-data-dev**: 
  - `WebPushService.sendToUser` 실제 `webpush.sendNotification` 구현 (graceful disable 유지)
  - 410 감지 시 PushSubscription 삭제 로직
  - `NotificationsService.create` 내 preference 체크 후 web push fire-and-forget 호출
  - 신규 spec `web-push.service.spec.ts` + 수정 `notifications.service.spec.ts`
- **Track C — frontend-ui-dev**: `apps/web/src/app/(main)/settings/notifications/page.tsx` 신규. 체크박스 리스트 + 저장 + toast 피드백. 다크모드·44px 터치타겟.
- **Track D — frontend-data-dev**: `useNotificationPreferences` + `useUpdateNotificationPreferences` 훅 신규. MSW 핸들러 추가.
- **Track E — infra-devops-dev**: deploy/Dockerfile.api 에 VAPID env 전달 경로 확인, `deploy/docker-compose.yml` 에 env_file 설정 재검증. `docs/ops/vapid-setup.md` 에 운영 팀용 키 갱신 절차 기록.
- **Track F (optional) — Capacitor**: A1 에서 확정되면 별도 sub-track 으로 iOS/Android 모듈 통합. 미확정 시 Track F 생략 및 Task 75 prerequisite 로 이관.

### Wave 2 (integration)
- `pnpm db:migrate` (preferences)
- 전체 테스트 + 통합 테스트
- **Staging 환경 실제 푸시 smoke** (prod 키 대신 staging VAPID pair)
- 수동 브라우저 smoke

---

## Verification & Validation

### Pre-merge checks
```bash
# Backend
cd apps/api
pnpm lint && npx tsc --noEmit && pnpm build
pnpm test                                # web-push spec + preferences spec 추가
pnpm test:integration -- notifications   # fan-out + preference skip 케이스

# Frontend  
cd apps/web
npx tsc --noEmit && pnpm lint && pnpm test
pnpm test settings/notifications        # 새 페이지 RTL 테스트
```

### VAPID 생성·검증
```bash
node -e "const wp = require('web-push'); console.log(wp.generateVAPIDKeys())"
# publicKey / privateKey 출력

# 공개키 형식 검증 (base64url 87자)
echo "$VAPID_PUBLIC_KEY" | wc -c   # ~87-88

# 서버 health check
curl http://localhost:8100/api/v1/notifications/vapid-public-key
# 응답: { data: { publicKey: "..." }, status: "success" }
```

### Manual smoke (staging 또는 dev)

1. **C1·C3 (웹 푸시 실제 발송)**
   - Chrome 로그인 → devtools Application 탭 → Service Workers 등록 확인
   - `/api/v1/notifications/push-subscribe` POST 확인 (Network)
   - 다른 브라우저로 해당 사용자에게 알림 발생 이벤트 트리거 (예: 팀 가입 신청)
   - 원 브라우저 탭 최소화 → 수 초 내 OS 알림 센터에 토스트 뜨는지 확인
   - 알림 클릭 → 설정된 URL 로 이동
2. **C3 (만료 endpoint cleanup)**
   - DevTools Application → Service Workers → Unregister
   - 서버에서 푸시 전송 시 410 로그 확인
   - `SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ...` → 구독 0건
3. **C6 (알림 선호도 UI)**
   - `/settings/notifications` 방문
   - "채팅 메시지" 토글 OFF → 저장 → 토스트 성공
   - 다른 사용자가 채팅 보냄 → OS 알림 미수신 확인, DB `Notification` row 는 생성 (realtime toast 는 정상)
4. **C9 (성공률 메트릭)**
   - 로그 `grep -c "web-push sent" api.log` vs `grep -c "web-push failed" api.log`
   - 성공률 계산 > 95% 목표

### Post-deploy validation
- 첫 1시간: Prod 로그에서 `WebPushService` 에러 비율 (410 외 실패) < 2%
- 24시간: VAPID 키 rotation 준비 절차 문서화 여부 확인
- 구독자 수 증가 추이 모니터링 (`SELECT COUNT(*) FROM push_subscriptions GROUP BY DATE(created_at)`)

### Rollback plan
- **VAPID 비활성화**: `.env` 에서 `VAPID_*` 제거 → `WebPushService.enabled=false` 로 graceful disable → 푸시 발송 중단. 구독 데이터는 유지.
- **Migration rollback**: `pnpm prisma migrate resolve --rolled-back YYYYMMDD_expand_notification_preferences`. 신규 컬럼만 제거 (기존 데이터 영향 X).
- **Code revert**: `git revert <merge-commit>` + 재배포.
- **부분 rollback**: 실제 전송만 비활성 하고 UI 는 유지 가능 (환경변수만 제거)

### Regression surface
- 기존 Socket.IO realtime 이벤트 회귀 확인 — 푸시와 realtime 은 독립 경로
- 기존 테스트: `notifications.service.spec.ts`, `realtime.gateway.spec.ts` 수정 시 무회귀
- `NotificationPreference` row 없는 기존 사용자가 **알림 silent drop 되지 않음** (default enable)
- `/settings/notifications` 방문 시 인증 필수 확인 (`useRequireAuth`)
- 구독 endpoint 중복 upsert 회귀 테스트 (task 69 race fix 건전성)

---

## Acceptance Criteria

1. Prod 환경변수 VAPID 3종 존재 + 서비스 booted 시 `enabled=true` 로그
2. 실제 브라우저 알림 수신 (Chrome/Firefox/Safari PWA 최소 2종)
3. 만료 구독은 410 → DB 에서 자동 삭제 (구독 table 청결 유지)
4. `/settings/notifications` 페이지에서 타입별 토글 + 저장 정상
5. 알림 선호 false 타입은 sendToUser skip, realtime 만 전달
6. 신규 integration test 3건 + RTL 테스트 통과, 기존 스위트 무회귀
7. `docs/ops/vapid-setup.md` 에 키 생성·갱신·롤백 절차 명시
8. (optional) Capacitor iOS/Android 토큰 등록이 활성화 시 네이티브 알림 수신 확인

---

## Tech Debt Resolved

- CLAUDE.md Known Blocker #1 (VAPID 미생성) 최종 해소
- 알림 유형별 수신 제어 부재 → 사용자 통제권 확보
- 만료 구독 누적으로 인한 무의미한 푸시 시도 제거
- Capacitor 분기 처리 스텁 → 실제 경로 연결 (A1 scope)

---

## Security Notes

- **VAPID private key**: `.env` 에만 저장. 로그·에러 메시지·응답에 절대 포함 금지. `WebPushService` 생성자에서 validate 후 즉시 process memory 보관 (파일 재읽기 X)
- **secrets 관리**: GitHub Actions secrets → EC2 SSM → docker `env_file` 경로. 이중 암호화
- **PushSubscription PII**: endpoint, p256dh, auth 는 fingerprint 성질. 로그 시 마지막 6자만 남기기 (기존 convention)
- **알림 payload**: 제목·본문에 사용자 식별 정보 최소화. 결제금액 등 민감 정보는 body 노출 금지 (title 만 표시 후 클릭 유도)
- **Rate limiting**: `POST /notifications/push-subscribe` 에 `@Throttle({ limit: 10, ttl: 60_000 })` 적용 — endpoint spam 방지
- **CSP**: `Content-Security-Policy` 에 `worker-src 'self'` 포함 확인 (기존 `next.config.ts`)
- **Capacitor iOS scope** (A1 진행 시): APNs `.p8` 키와 Apple Team ID / Key ID 는 `.env` 또는 secret store 에만 저장. 절대 repo 커밋 금지. `apps/api/src/notifications/apn.service.ts` 신규 시 키 원문은 메모리 1회 로드 후 파기

---

## Risks & Dependencies

| ID | Risk | Impact | Mitigation |
|----|------|--------|-----------|
| R1 | VAPID private key 유출 → 공격자가 사용자에게 임의 푸시 발송 | High | secret store 이중 검증, rotation 절차 문서화, GitHub audit log 활성화 |
| R2 | Preferences 마이그레이션 기존 데이터와 충돌 | Medium | 모든 신규 boolean 컬럼 `@default(true)` 로 설정 (opt-out 모델) |
| R3 | iOS Safari PWA 제한 (iOS 16.4+ 만 웹 푸시 지원) | Medium | 구독 불가 환경에서는 UI 에서 "이 브라우저는 푸시 미지원" 안내 |
| R4 | Capacitor iOS(APNs 직접) 네이티브 설정 추가가 일정 초과 | High | A1 에서 명확히 결정. iOS 계정 미확정이면 **웹 only** 로 출시 후 iOS 는 별도 후속 task 로 분리. Android 는 VAPID 경로 재사용이므로 추가 리스크 없음 |
| R5 | 410 처리 시 정상 endpoint 실수 삭제 | High | 410 뿐 아니라 404 도 포함. 타 응답은 retry 하지 않고 warn 만 |
| R6 | 서비스 워커 캐싱으로 인한 배포 후 구 SW 동작 | Medium | SW 버전 스키마 (`SW_VERSION=task74`) + `self.skipWaiting()` |

### Dependencies
- **Apple Developer 계정 + APNs `.p8` 인증 key** (iOS Capacitor scope — Firebase 경유 없음)
- **프로덕션 secret store** (GitHub Actions / EC2 SSM)
- Task 69 의 NotificationsService fan-out 12건 — 이미 완료, 본 task 는 전달 경로만 강화
- 기존 `PushSubscription` 테이블과 `web-push` 패키지 (마이그레이션 `20260406020000_replace_fcm_with_web_push` 로 이미 정착)

---

## Ambiguity Log

| ID | 질문 | 답변 대기 대상 |
|----|------|----------------|
| A1 | **Capacitor iOS 네이티브 푸시 scope 포함 여부** — Apple Developer 계정 + APNs `.p8` 키 가용? (Android 는 VAPID 재사용으로 계정 불필요) | **사용자** (본 task 시작 전 결정 필요) |
| A2 | VAPID 키 rotation 주기(6개월/1년)? | tech-planner |
| A3 | NotificationPreference 의 타입별 column 을 몇 개까지 열거? 전체 14개 알림 타입을 다 컬럼화할지 JSONB 로 단일 필드 저장할지 | tech-planner (현재 안: 핵심 4개 boolean + `otherTypes: Json` 기본 활성 — 확장 시 컬럼 추가) |
| A4 | Staging 환경에도 VAPID 키? | infra-security-dev (별도 pair 권장) |
| A5 | 푸시 실패율 > 5% 시 알람 임계치? | 운영 결정 (기본: Sentry/Slack webhook warn) |

---

## Complexity Estimate

**Medium** (web + Android 공유 VAPID) → **Large** (iOS APNs 포함)

| Item | Complexity | Est. LOC |
|------|------------|----------|
| VAPID setup + docs | Low | ~40 |
| WebPushService 실제 전송 + 410 cleanup | Medium | ~180 |
| NotificationPreference 마이그레이션 + DTO | Medium | ~120 |
| `/settings/notifications` 페이지 + 훅 + MSW | Medium | ~340 |
| SW push click handler 확인/추가 | Low | ~30 |
| Integration + RTL 테스트 | Medium | ~280 |
| Capacitor Android: VAPID 경로 재사용 검증만 | Low | ~40 |
| Capacitor iOS: APNs 직접 연동(`node-apn` + `.p8`) (optional) | High | ~420 |
| **Web + Android (공유 경로) subtotal** | **Medium** | **~1,030** |
| **With iOS APNs** | **Large** | **~1,450** |

---

## Handoff checklist

- [ ] A1 (iOS APNs scope) 사용자 확인 — **critical gate**. Android 는 VAPID 재사용으로 별도 결정 불필요
- [ ] A2~A5 tech-planner 답변
- [ ] VAPID 키 생성 (dev/staging/prod 각각)
- [ ] GitHub Actions secret 등록 권한 확인
- [ ] `web-push` 패키지 설치 상태 점검 (`pnpm list web-push` — 이미 `^3.6.7` 설치됨)
- [ ] `firebase-admin` / `@react-native-firebase/*` 등 Firebase 의존성 **없음** 재확인 (프로젝트 결정 사항 — `CLAUDE.md` §WebPushService 참조)
- [ ] Task 72·73 merge 후 착수 권장 (notifications.service.ts 충돌 방지)
- [ ] 운영팀 (VAPID rotation 담당자) 지정
