# v1 어드민 에러·로그 뷰어 설계

**작성일**: 2026-07-26
**상태**: 승인됨

## 배경

운영자가 어드민에서 에러를 조사할 방법이 없다. 현재 서버 에러(`AllExceptionsFilter`)와 클라이언트 에러(`POST /logs/client-error`)는 **pino 로그로 출력만 되고 어디에도 저장되지 않는다**. 조사하려면 EC2에 SSM으로 붙어 `docker logs`를 읽어야 하고, 그 로그마저 컨테이너를 재시작하면 사라진다 — 2026-07-25 rate limit 사고 조사 당시 nginx 로그가 20분치만 남아 있어 사건 발생 시점의 기록을 이미 놓친 상태였다.

어드민에는 `/admin/ops` 아래 `push-failures`·`sms-failures`가 이미 있지만 각각 전용 테이블을 읽을 뿐, 일반 에러를 담는 곳은 없다.

## 목표

운영자가 어드민에서 에러를 찾아 **원인 파악에 필요한 전부를 한 화면에서 보고, 그대로 복사해 공유**할 수 있게 한다.

요구 항목: traceback / request / response / 테이블 목록 / 상세 모달 / 복사 붙여넣기 / 서버 버전.

## 비목표

- 외부 APM(Sentry 등) 도입 — 자체 호스팅 기조 유지
- 실시간 스트리밍(tail) — 조회는 새로고침 기반으로 충분
- 로그 검색 엔진(ES 등) 도입

## 설계

### 1. 데이터 모델

`apps/v1_api/prisma/schema.prisma`에 추가한다. 기존 `V1WebPushFailureLog`·`V1SmsEventLog`와 같은 계열이다.

```prisma
model V1ErrorLog {
  id              String    @default(uuid())
  fingerprint     String
  windowBucket    DateTime  @map("window_bucket")
  occurrenceCount Int       @default(1) @map("occurrence_count")

  source          String
  level           String
  statusCode      Int?      @map("status_code")
  errorCode       String?   @map("error_code")
  method          String?
  route           String?
  message         String
  stack           String?

  requestBody     Json?     @map("request_body")
  requestHeaders  Json?     @map("request_headers")
  responseBody    Json?     @map("response_body")
  context         Json?

  userId          String?   @map("user_id")
  userAgent       String?   @map("user_agent")
  releaseSha      String?   @map("release_sha")

  firstSeenAt     DateTime  @default(now()) @map("first_seen_at")
  lastSeenAt      DateTime  @default(now()) @map("last_seen_at")

  @@id([id, windowBucket])
  @@unique([fingerprint, windowBucket])
  @@index([lastSeenAt])
  @@index([source, statusCode])
  @@map("v1_error_logs")
}
```

`source`는 `server | client`, `level`은 `error | warn`.

**복합 PK인 이유는 파티셔닝 대비다.** Postgres 파티션 테이블은 PK·UNIQUE 제약에 파티션 키를 반드시 포함해야 한다. `id` 단독 PK로 두면 나중에 파티셔닝할 때 PK를 바꿔야 하고, 그건 테이블 재생성과 데이터 이관을 부른다. 지금 `windowBucket`을 PK에 넣어두면 전환 시 스키마 변경 없이 파티션만 얹으면 된다. `@@unique([fingerprint, windowBucket])`도 이미 파티션 키를 포함하고 있어 그대로 유효하다.

조회는 `id` 단독으로 해도 되지만(사실상 유일), 상세 API는 `id` + `windowBucket`을 함께 받아 파티션 프루닝이 걸리게 한다 — 목록 응답에 두 값을 모두 실어 보내면 된다.

### 2. 중복 억제 (dedupe)

정상 흐름까지 전수 적재하되 같은 에러가 목록을 덮지 않도록, **창(window) 버킷으로 접는다**.

- `fingerprint` = `sha256(source + statusCode + route + 정규화된 message)`의 앞 32자
  - `route`는 UUID·숫자 ID를 `:id`로 치환해 정규화한다 (`/tournaments/abc-123` → `/tournaments/:id`). 이 정규화가 없으면 같은 에러가 대상마다 다른 행이 된다.
  - `message`도 숫자·UUID를 치환해 정규화한다.
- `windowBucket` = 발생 시각을 창 크기로 내림한 값
  - `statusCode`가 **401 또는 403 → 24시간**
  - 그 외 → **1시간**
- 적재는 `upsert({ where: { fingerprint_windowBucket }, update: { occurrenceCount: { increment: 1 }, lastSeenAt: now }, create: {...} })` 한 번으로 원자적으로 처리한다.

창이 지나면 자동으로 새 행이 열리므로 별도 만료 처리가 없다. 중복이 버려지지 않고 카운트로 남아 "24시간 동안 1,432회" 같은 빈도가 그대로 보인다.

**주의**: `update`는 `occurrenceCount`·`lastSeenAt`만 갱신한다. body/stack을 매번 덮어쓰면 쓰기 비용만 늘고 얻는 게 없다 — 같은 fingerprint면 내용이 사실상 동일하다. 첫 발생 시점의 표본을 유지한다.

### 3. 적재 경로

기존 pino 로깅은 **그대로 두고** 적재를 얹는다.

| 출처 | 지점 | 내용 |
|---|---|---|
| 서버 | `apps/v1_api/src/common/filters/http-exception.filter.ts` | status·code·method·route·message·stack·request/response |
| 클라이언트 | `apps/v1_api/src/logs/logs.controller.ts` | message·stack·url·userAgent·context |

두 경로 모두 `ErrorLogService.record()`를 호출한다. **fire-and-forget** — 적재 실패가 사용자 응답이나 에러 처리에 영향을 주면 안 된다. 실패 시 pino로 warn만 남기고 삼킨다(빈 catch 금지).

`AllExceptionsFilter`는 이미 응답 직전에 모든 정보를 갖고 있으므로 추가 배선이 필요 없다.

### 4. 민감정보 마스킹

`apps/v1_api/src/common/logging/mask-sensitive.ts` (신규)에 **단일 상수 목록**을 두고 재귀 치환한다.

```
password, passwordConfirm, token, accessToken, refreshToken, code, authorization,
cookie, secret, phone, phoneNumber, ssn, birthDate, cardNumber
```

- 키 이름이 목록에 있으면(대소문자 무시) 값을 `[REDACTED]`로 치환
- 중첩 객체·배열을 재귀 순회
- 직렬화 후 4000자 상한 (기존 `client-error-reporter.ts`·`http-exception.filter.ts`와 같은 컨벤션)
- `requestHeaders`는 화이트리스트가 아니라 위 목록 기준 마스킹 후 저장 (`authorization`·`cookie`가 걸린다)

카카오 인가코드(`code`)와 세션 쿠키가 목록에 포함되는 것이 중요하다 — 실제로 콜백 URL과 헤더로 들어온다.

### 5. 서버 버전

배포 시 이미 릴리스 문자열을 만들어 nginx snippet(`X-Teameet-Release: 0.1.0-alpha.20260726.g3069cd0025e0`)으로 내보내고 있으나, **v1_api 프로세스는 그 값을 모른다**(컨테이너 env에 없음).

- `.github/workflows/deploy-alpha.yml`이 만드는 같은 값을 `V1_RELEASE` 환경변수로 `v1_api`에 주입한다 (`deploy/docker-compose.alpha.yml`)
- `ErrorLogService`가 `process.env.V1_RELEASE`를 각 행의 `releaseSha`에 기록
- 미주입 환경(로컬)에서는 `null` — 기능이 죽으면 안 된다

### 6. 어드민 화면 `/admin/ops/errors`

기존 `/admin/ops/push-failures` 구조를 따른다.

**목록 테이블**
| 컬럼 | 비고 |
|---|---|
| 마지막 발생 | `lastSeenAt`, 상대시각 |
| source | server / client 뱃지 |
| status | 색 + 숫자 (컬러 단독 금지 규칙 준수) |
| route | 정규화된 경로 |
| message | 말줄임 |
| 발생 횟수 | `occurrenceCount` |
| 버전 | `releaseSha` 축약 |

**필터**: source, statusCode 구간, 기간, 검색어(message·route)

**상세 모달** (`components/ui/modal.tsx` 기반, `role="dialog"` + ESC + focus trap)
- 메타: 최초/최종 발생, 횟수, userId, userAgent, **서버 버전**
- **Traceback**: `stack` 원문, 등폭 글꼴, 가로 스크롤
- **Request**: method·route·headers·body
- **Response**: statusCode·errorCode·body
- **Context**: 클라이언트 리포터의 context

**복사**
- 각 섹션 우상단에 복사 버튼
- 상단에 **"전체 복사"** — 이슈에 그대로 붙여넣을 수 있는 마크다운 한 덩어리(메타 + traceback + request + response)
- `navigator.clipboard` 실패 시 토스트로 알린다(조용히 실패 금지)

### 7. 보존 — 무제한, 파티셔닝으로 대비

**자동 삭제 cron을 두지 않는다.** 에러 이력은 오래된 것이 회귀 판단(“이 에러 지난 분기에도 있었나”)에 쓰이므로 보존한다.

대신 무한히 커지는 단일 테이블이 되지 않도록 **파티셔닝 전환 경로를 미리 확보한다.**

**지금 하는 것** — 전환 준비만, 파티션은 만들지 않는다.
- PK를 `@@id([id, windowBucket])`로 잡아 파티션 키를 포함시킨다 (위 모델 참조)
- 모든 목록 조회에 기간 조건을 넣어, 파티셔닝 후 프루닝이 그대로 걸리게 한다
- `lastSeenAt` 인덱스로 최신순 조회를 받친다

**나중에 하는 것** — 행 수가 임계에 다다르면(수천만 행 또는 테이블 수 GB) 월별 RANGE 파티션으로 전환한다. `windowBucket`이 파티션 키이므로 `PARTITION BY RANGE (window_bucket)`이 자연스럽고, 창 버킷 자체가 시간으로 내림된 값이라 경계에 걸치는 행이 없다.

**전환 시 반드시 확인할 것 — 드리프트 게이트.** 이 레포 CI는 “빈 DB에 마이그레이션 전체 체인 재생 + `schema.prisma` 드리프트 0”을 강제한다. Prisma는 선언적 파티셔닝을 표현하지 못하고 파티션 자식 테이블을 별개 테이블로 introspect하므로, **파티션을 마이그레이션에 넣으면 게이트가 깨질 수 있다**. 이 레포에서 부분 인덱스를 포기한 것과 같은 제약이다(2026-07-25 대진표 예약 공개 작업 선례).

전환 시점에 아래를 먼저 검증한다.
1. raw SQL 마이그레이션으로 파티션 테이블을 만들었을 때 `prisma migrate diff`가 드리프트를 보고하는지
2. 보고한다면 — 자식 파티션을 마이그레이션이 아니라 **운영 스크립트로 생성**해 마이그레이션 체인에서 빼는 방안
3. 그래도 걸리면 게이트 예외 규칙을 명시적으로 추가할지 팀 결정

검증 전에는 파티셔닝을 도입하지 않는다. 준비된 스키마만으로도 전환 비용은 이미 크게 낮아진 상태다.

## 테스트 시나리오

**백엔드**
- fingerprint: route의 UUID가 `:id`로 정규화되어 같은 에러가 한 행으로 접힌다
- 창 버킷: 401은 24시간 창에서 같은 행에 누적되고, 25시간 뒤 요청은 새 행을 연다
- 창 버킷: 500은 1시간 창을 쓴다
- `occurrenceCount`가 중복 발생마다 증가하고 `lastSeenAt`이 갱신된다
- 마스킹: `password`·`code`·`authorization`이 `[REDACTED]`로 저장된다 (중첩 객체 포함)
- 적재 실패가 원래 에러 응답을 바꾸지 않는다 (fire-and-forget)
- `V1_RELEASE` 미설정 시 `releaseSha`가 null이어도 적재가 성공한다

**프론트엔드**
- 목록이 `lastSeenAt` 내림차순으로 렌더되고 발생 횟수가 표시된다
- 행 클릭 시 모달이 열리고 traceback·request·response가 각각 보인다
- "전체 복사"가 클립보드에 메타+traceback+request+response를 담는다
- 필터가 쿼리에 반영된다

## 보안 검토

- 마스킹 목록에 인증 관련 키를 전부 포함 (카카오 `code`, 세션 `cookie`, `authorization`)
- 어드민 화면은 기존 `AdminGuard` + `_gate.tsx` 경유 — 신규 노출면 없음
- 저장 상한 4000자로 대용량 payload 적재 차단
- **보존이 무기한이므로 마스킹이 유일한 방어선이다.** 자동 삭제로 뒤늦게 지워지는 안전망이 없으니, 마스킹 목록 누락은 곧 영구 저장을 뜻한다. 신규 필드를 담을 때마다 목록을 점검하고, 목록은 테스트로 고정한다.

## 리스크

| 리스크 | 대응 |
|---|---|
| 전수 적재로 쓰기 부하 증가 | dedupe upsert라 같은 에러는 UPDATE 1회. alpha 트래픽 규모에서 문제 없음 |
| 마스킹 누락으로 민감정보 **영구** 저장 | 보존 무기한이라 자동 삭제 안전망이 없다. 목록을 단일 상수로 두고 테스트로 고정, 신규 필드마다 점검 |
| fingerprint 과도 통합 | route·message 정규화 규칙을 테스트로 고정 |
| 무기한 보존으로 테이블 비대 | 파티션 키를 PK에 미리 포함해 전환 비용을 낮춰둔다. 임계 도달 시 월별 RANGE 파티션 — 단 드리프트 게이트 검증이 선행 조건 |

## 작업 순서

1. 백엔드: Prisma 모델 + 마이그레이션 → 마스킹 유틸 → `ErrorLogService` → 필터·컨트롤러 배선
2. 백엔드: 어드민 조회 API (`GET /admin/ops/errors`, `GET /admin/ops/errors/:id`)
3. 인프라: `V1_RELEASE` 주입
4. 프론트: 훅 → 테이블 → 상세 모달 → 복사

보존 cron은 만들지 않는다(무기한 보존). 파티셔닝은 이번 범위 밖이며, 위 7절의 검증을 마친 뒤 별도 작업으로 다룬다.
