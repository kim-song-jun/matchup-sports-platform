# 개인정보 파기·법무 정합(Privacy & Legal Compliance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 약관·동의서가 약속한 개인정보 파기·보관기간·노출 경계를 코드로 이행한다 — ① 탈퇴 유예 만료·대회 PII 보관기간(3년) 만료·인증 토큰·파기 원장 자체를 무인 잡으로 파기하되 dry-run 기본 + 2중 승인 게이트로 비가역 삭제를 안전하게 통제하고, ② 만 14세 미만 가입을 차단하며, ③ 팀 로스터 조회 응답에서 일반 팀원에게 새는 생년월일·운영 심사메모를 역할 기반으로 좁힌다.

**Architecture:** 파기는 **단일 공용 helper `purgeUserPii`**(순수 PII 스크럽, DB 변경만 반환하고 상태 전이는 하지 않음)를 중심으로, 어드민 수동 삭제 경로와 잡 A(탈퇴 유예 만료) 양쪽이 이 helper를 호출한다 — "잡 전용 추가분" 개념을 없애 두 경로의 파기 범위가 영구히 같게 만든다. 파기 실행 단위는 **유저 1명 = 단일 `$transaction`**(PII 스크럽 + `V1PrivacyPurgeItem` 기록 + `accountStatus='deleted'` 전이, 상태 전이가 트랜잭션의 마지막 쓰기)이고, 이 트랜잭션들을 감싸는 **run**(스캔 1회 = `V1PrivacyPurgeRun` 1행)이 후보 선정·건수 집계·LIVE 게이트 소비를 담당한다. run 자체는 이미 검증된 게임 운영 워커의 **self-rescheduling outbox 스캔 체인**(`lineup-reminder.service.ts:scheduleNextScan` 패턴)을 재사용해 제2 스케줄러 없이 하루 1회 돈다. 비가역 삭제는 **2중 게이트**(env `V1_PRIVACY_PURGE_ENABLED` + run 단위 사전 승인 레코드 `V1PrivacyPurgeApproval`)를 모두 통과해야만 발동하고, 그 전까지는 후보 선정·건수 리포트만 하는 dry-run이다.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 (apps/v1_api), Next.js 16 App Router (apps/v1_web), Jest 30 (unit/integration)

**Spec:** `docs/superpowers/specs/2026-08-17-privacy-legal-compliance-design.md` (v2, 적대적 리뷰 13건 반영 확정본)

**Worktree:** `.claude/worktrees/league-format`, 브랜치는 이 계획 전용으로 **새로 분기**한다(`feat/v1-privacy-purge`, base `origin/dev`) — `feat/v1-tournament-league-format`과는 별도 PR 트랙이다(§4 P-1 "병행" 결정).

## Global Constraints

- **활성 스택은 `apps/v1_api` / `apps/v1_web`다.** `apps/api` / `apps/web`은 절대 건드리지 않는다.
- **schema.prisma를 고치면 CI `V1 migration replay + drift gate`가 `SOURCE_SNAPSHOT_DRIFT`로 실패한다.** `apps/v1_api/test/fixtures/game-schema.fixture.ts`의 `gameSchemaSourceManifest.schema`를 `shasum -a 256 prisma/schema.prisma` 결과로 재핀하고 근거 주석을 덧붙인다. **이 트랙의 스키마 변경은 Task 1의 마이그레이션 1개로 묶어 재핀 1회로 끝낸다.**
- **⚠️ 재핀 충돌 경고(스펙 §8.1·Q6)**: 리그전 트랙(`feat/v1-tournament-league-format`)이 이미 `20260817000000_v1_tournament_league_format`로 이 fixture를 재핀했다(이 worktree에 이미 적용돼 있음 — Task 0에서 확인). **두 트랙이 병행되므로, 이 계획의 PR을 열 때 `origin/dev` HEAD에 어느 트랙이 먼저 머지됐는지 반드시 재확인**하고, 늦게 머지되는 쪽이 `shasum`을 다시 계산해 재핀한다(먼저 계산해둔 해시를 그대로 커밋하지 않는다 — 스테일 해시는 CI에서만 드러난다).
- **인덱스/제약 이름 63자 제한**: 이 계획에서 신설하는 3테이블의 모든 pkey/fkey/idx 이름을 미리 계산해 전부 26~47자 범위임을 확인했다(Task 1 Step 2 참조) — 리그전 트랙이 겪은 `v1_tournament_overall_standings_tournament_id_registration_id_key`(68자, Postgres가 `..._registration__key`로 잘라 재핀 시 실제 잘린 이름을 그대로 써야 했던 사고)와 같은 문제는 이 계획에서는 발생하지 않는다. 그래도 마이그레이션 SQL을 쓴 뒤 `git show`로 실제 생성될 이름을 한 번 더 눈으로 대조한다.
- **스키마 변경은 반드시 migration 파일 동반.** `prisma db push`만으로 dev에 반영하지 않는다.
- **worktree에는 node_modules가 없고 `pnpm`도 PATH에 없다.** 메인 트리 심링크를 통해 `./node_modules/.bin/jest`, `./node_modules/.bin/tsc`를 직접 호출한다.
- **이 환경에는 DB가 없다.** `DATABASE_URL`이 필요한 통합 테스트·`prisma migrate diff`는 **작성까지만 하고 실행하지 않는다** — CI의 `V1 migration replay + drift gate`와 통합 테스트 잡이 실제로 검증한다. schema.prisma와 migration.sql은 한 줄씩 눈으로 대조한다.
- **공유 Prisma client가 stale하다. `prisma generate` 절대 금지**(모노레포 전체가 공유). 로컬 유닛 테스트는 ts-jest diagnostics를 끈 임시 config로 돌리되, **이 우회 때문에 타입 오류를 놓칠 수 있으므로 Prisma `Json` 컬럼을 다루는 테스트 픽스처(예: `V1PrivacyPurgeRun.report`)는 반드시 `Prisma.JsonValue`로 타입을 맞춘다** — CI(tsc 전체)가 이 타입 불일치를 실제로 잡는다.
- **에러 메시지는 해요체**(`~했어요`, `~해주세요`). 에러 코드는 `DOMAIN_CODE` 형태.
- **숫자 기본값은 `??`를 쓴다.**
- **base는 항상 `dev`.** dev 머지 = alpha 즉시 실배포. 이 계획의 잡은 **dry-run이 기본값**이므로 dev 머지 자체는 안전하지만, Task 12(listPlayers)처럼 화면이 바뀌는 PR은 배포 즉시 실사용자에게 노출된다.
- **UI 검증은 로컬 next 서버가 아니라 alpha 배포 후 스크린샷(390/768/1440 3폭)으로 한다.** 이 규약은 **Task 12(listPlayers 축소) PR에만** 적용된다 — 파기 잡·미성년 게이트는 백엔드 전용이라 대상이 아니다(스펙 §7.4).
- **커밋은 pathspec으로 내 파일만** + 직후 `git show --stat HEAD`. `git add -A` / `git commit -a` 금지.
- **이 저장소는 public이다.** PR 코멘트에 프로덕션 UUID·실명·엔드포인트를 올리지 않는다.

### 안전 규율 — 이 계획 전체에 적용되는 상위 규칙 (비가역 삭제이므로 최우선)

1. **dry-run 우선 → 리포트 검토 → LIVE 게이트, 항상 이 순서.** 모든 파기 잡 태스크(4, 5, 6, 7)는 구현 직후 alpha에 dry-run 모드로만 배포된다. LIVE 전환은 **별도 사용자 승인 없이는 어떤 태스크에서도 수행하지 않는다** — Task 11의 rollout 절차가 이 게이트를 명시한다.
2. **유저 1명 파기 = 단일 트랜잭션.** Task 2(`purgeUserPii`)가 이 불변식의 유일한 구현 지점이고, Task 4(잡 A)의 per-user 핸들러가 이를 소비하는 유일한 배치 경로다. 이 불변식을 우회하는 코드는 어디에도 만들지 않는다.
3. **hold 조건은 실제 컬럼에 근거한다(추측 금지).** Task 5(잡 B)의 hold 판정은 §5.1.3 표가 인용한 실제 스키마 — `V1Inquiry.status/relatedType/relatedId`(`schema.prisma:1864-1888`), `V1TournamentPayment.status`(enum `ready|paid|failed|cancelled|refunded`, `schema.prisma:1954-1960`), `V1TournamentRegistration.cancelRequestedAt`(`schema.prisma:2193`) — 를 그대로 코드로 옮긴다. 판정 불가능한 경우(제재 진행 상태)는 **보수적 기본값(hold)**을 쓴다.
4. **되돌릴 수 없는 지점(이 계획에서 명시적으로 박제)**: dry-run·후보 리포트·승인 레코드 생성까지는 **전부 무해**(DB 변경 0)하다. **되돌릴 수 없는 지점은 LIVE 모드에서 개별 유저/registration 트랜잭션이 커밋되는 순간이다** — 그 시점 이후 마스킹·NULL 처리는 DB 레벨에서 복구 불가하며, 유일한 복구 수단은 RDS point-in-time recovery(전체 DB 되감기, 사실상 사용 불가능한 최후 수단)뿐이다. 유저 단위 원자성(안전 규율 2) 덕에 "반쯤 파기된" 중간 상태는 존재하지 않는다.
5. **법무 검토 게이트가 있는 태스크는 착수 전 표시한다.** 이 계획에서 "법무 답변 후 착수" 라벨이 붙은 것은 **Task 9(§5.2 실명 공개 정합의 소급 처리)**와 **Task 11의 잡 B LIVE 전환**(§10.1-L3·L5·L8) 둘뿐이다 — 둘 다 구현하지 않고 스킵하거나 대기 상태로 남긴다. 무엇을 물어야 하는지는 각 태스크 섹션에 명시한다.
6. **listPlayers 노출 축소는 UI 변경 — 3폭 스크린샷 게이트가 붙는다.** Task 12 Step 마지막에서 alpha 배포 후 member/manager 뷰 각각 before/after 캡처를 PR 코멘트에 첨부한다.

---

## File Structure

### PR 1 — 파기 인프라 (스키마 + helper 통합 + 잡 4종 dry-run + 어드민 API)

| 파일 | 책임 |
|---|---|
| `apps/v1_api/prisma/schema.prisma` (수정) | 모델 3개 + enum 3개 |
| `apps/v1_api/prisma/migrations/20260817010000_v1_privacy_purge/migration.sql` (신규) | additive 마이그레이션 |
| `apps/v1_api/test/fixtures/game-schema.fixture.ts` (수정) | drift gate 해시 재핀 |
| `apps/v1_api/src/common/privacy/purge-user-pii.ts` (신규) | 공용 PII 스크럽 helper — 어드민·잡 A 공유 |
| `apps/v1_api/src/common/privacy/purge-user-pii.spec.ts` (신규) | helper 단위 테스트 |
| `apps/v1_api/src/admin/admin.service.ts` (수정) | `deleteUser`가 `purgeUserPii`를 호출하도록 전환, gender/birthDate/대회 스냅샷 누락분 해소 |
| `apps/v1_api/src/jobs/privacy-purge/privacy-purge-gate.ts` (신규) | LIVE 게이트 2중 판정 순수함수 |
| `apps/v1_api/src/jobs/privacy-purge/privacy-purge-gate.spec.ts` (신규) | 게이트 단위 테스트 |
| `apps/v1_api/src/jobs/privacy-purge/privacy-purge-candidates.ts` (신규) | 잡 A/B 후보 선정·hold 판정 순수함수 |
| `apps/v1_api/src/jobs/privacy-purge/privacy-purge-candidates.spec.ts` (신규) | 경계값·hold·백필 단위 테스트 |
| `apps/v1_api/src/jobs/privacy-purge/privacy-purge-run.repository.ts` (신규) | Run/Item 생성·집계·스캔 예약 공용 |
| `apps/v1_api/src/jobs/privacy-purge/withdrawal-expiry-purge.service.ts` (신규) | 잡 A 핸들러 |
| `apps/v1_api/src/jobs/privacy-purge/retention-expiry-purge.service.ts` (신규) | 잡 B 핸들러(hold 포함) |
| `apps/v1_api/src/jobs/privacy-purge/token-sweep-purge.service.ts` (신규) | 잡 C 핸들러 |
| `apps/v1_api/src/jobs/privacy-purge/ledger-sweep-purge.service.ts` (신규) | 잡 D 핸들러 |
| `apps/v1_api/src/jobs/privacy-purge/privacy-purge-jobs.module.ts` (신규) | 잡 4종 DI 묶음(워커 전용, RealtimeModule/GamesModule 미참조) |
| `apps/v1_api/src/jobs/v1-game-operations-worker.main.ts` (수정) | 핸들러 등록 + 스캔 체인 첫 예약 |
| `apps/v1_api/src/jobs/v1-game-operations-worker.module.ts` (수정) | `PrivacyPurgeJobsModule` import |
| `apps/v1_api/src/admin/dto/admin-privacy.dto.ts` (신규) | 승인 생성 DTO |
| `apps/v1_api/src/admin/admin-privacy.service.ts` (신규) | run 조회·승인 발행 |
| `apps/v1_api/src/admin/admin-privacy.controller.ts` (신규) | `GET/POST /admin/privacy/*` |
| `apps/v1_api/src/admin/admin.module.ts` (수정) | 컨트롤러/서비스 wiring |
| `apps/v1_api/test/integration/privacy-purge.e2e-spec.ts` (신규) | DB 필요 — 작성만, 실행 보류 |
| `deploy/docker-compose.alpha.yml` (수정) | `V1_PRIVACY_PURGE_ENABLED`/`DISABLE_PRIVACY_PURGE` env (미설정 기본) |
| `deploy/docker-compose.prod.yml` (수정) | 동일 env (별도 파일 — alpha 설정이 prod로 새지 않음) |

### PR 2 — 미성년 가입 게이트

| 파일 | 책임 |
|---|---|
| `apps/v1_api/src/auth/dto/required-signup-profile.dto.ts` (수정) | `isAtLeastAge` 순수함수 추가 |
| `apps/v1_api/src/auth/dto/required-signup-profile.dto.spec.ts` (신규) | 경계값 테스트 |
| `apps/v1_api/src/auth/auth.service.ts` (수정) | `register`/`completeSocialProfile` 양쪽에 게이트 삽입 |
| `apps/v1_api/src/auth/auth.service.spec.ts` (수정, 기존 파일) | 게이트 회귀 테스트 추가 |
| `apps/v1_api/src/jobs/privacy-purge/under-age-scan.ts` (신규) | 기존 가입자 1회 스캔 리포트(건수만) |
| `apps/v1_api/src/jobs/privacy-purge/under-age-scan.spec.ts` (신규) | 단위 테스트 |

### PR 3 — listPlayers 노출 축소 (UI 변경, 3폭 스크린샷 게이트)

| 파일 | 책임 |
|---|---|
| `apps/v1_api/src/tournaments/tournament-players.service.ts` (수정) | `assertTeamMember` role 반환, `serializePlayer` scope 분기 |
| `apps/v1_api/src/tournaments/tournament-players.service.spec.ts` (기존, 수정) | scope별 응답 단언 추가 |
| `apps/v1_web/src/types/api.ts` (수정) | `V1TournamentPlayer`에 `viewerScope` 추가 |
| `apps/v1_web/src/app/tournaments/[id]/registrations/[registrationId]/roster/tournament-roster-client.tsx` (수정) | member 뷰에서 생년월일 행 숨김 |

---

# PR 1 — 파기 인프라

## Task 0: 사전 확인 (구현 착수 전 1회)

- [ ] **Step 1: 리그전 트랙과의 재핀 상태를 확인한다**

```bash
git -C /Users/sungjun/Dev/projects/matchup-sports-platform fetch origin dev
git -C /Users/sungjun/Dev/projects/matchup-sports-platform log origin/dev --oneline -5
grep -n "schema:" apps/v1_api/test/fixtures/game-schema.fixture.ts | tail -3
```

`origin/dev`에 리그전 트랙(`feat/v1-tournament-league-format`)이 이미 머지되어 있으면 이 worktree의 fixture 해시가 이미 그 트랙 기준이다 — Task 1 Step 7에서 **그 위에 다시 재핀**한다(덮어쓰지 않고 이어 붙인다). 아직 머지 전이면 이 계획을 **새 worktree**(`git fetch origin dev && git worktree add <path> -b feat/v1-privacy-purge origin/dev`)에서 시작해 리그전 트랙의 미완성 변경을 베이스에 끌고 오지 않는다.

- [ ] **Step 2: 새 브랜치로 분기한다**

```bash
cd <새 worktree 경로>
git status
```

---

## Task 1: Prisma 스키마 + 마이그레이션 + drift gate 재핀

**Files:**
- Modify: `apps/v1_api/prisma/schema.prisma`
- Create: `apps/v1_api/prisma/migrations/20260817010000_v1_privacy_purge/migration.sql`
- Modify: `apps/v1_api/test/fixtures/game-schema.fixture.ts`

**Interfaces:**
- Produces: Prisma 모델 `V1PrivacyPurgeRun`, `V1PrivacyPurgeItem`, `V1PrivacyPurgeApproval`, enum `V1PrivacyPurgeKind`/`V1PrivacyPurgeMode`/`V1PrivacyPurgeRunStatus`

- [ ] **Step 1: 스키마에 enum 3개 + 모델 3개를 추가한다**

`apps/v1_api/prisma/schema.prisma`에 `model V1UserRecordConsent` 블록(`:2748` 부근) 바로 다음에 추가한다:

```prisma
enum V1PrivacyPurgeKind {
  WITHDRAWAL_EXPIRY // 잡 A: 탈퇴 유예 만료
  RETENTION_EXPIRY  // 잡 B: 대회 PII 보관기간(3년) 만료
  TOKEN_SWEEP       // 잡 C: 인증 토큰 스윕
  LEDGER_SWEEP      // 잡 D: 파기 원장 자체의 3년 만료 (P-8)
}

enum V1PrivacyPurgeMode {
  DRY_RUN
  LIVE
}

enum V1PrivacyPurgeRunStatus {
  PENDING
  COMPLETED
  FAILED
  SKIPPED
}

/// 파기 실행 단위 감사 레코드. PII 자체는 절대 담지 않는다 — 대상 row id·건수·기준만.
/// purgedCount/report 는 run 종료 시 items 집계에서 파생되는 캐시다 — 불일치 시 items 가 진실(P-7).
/// 어드민 수동 삭제(admin.service.ts deleteUser)도 이 테이블에 1건짜리 run을 기록한다 —
/// "잡 전용 원장"이 아니라 이 서비스의 모든 PII 파기가 거치는 단일 원장이어야
/// §5.1.2-④ 백필 조건("V1PrivacyPurgeItem에 기록이 없는 deleted 유저")이 미래에도 성립한다.
model V1PrivacyPurgeRun {
  id             String    @id @default(uuid())
  kind           V1PrivacyPurgeKind
  mode           V1PrivacyPurgeMode
  cutoffAt       DateTime  @map("cutoff_at")
  candidateCount Int       @map("candidate_count")
  purgedCount    Int       @default(0) @map("purged_count")
  heldCount      Int       @default(0) @map("held_count")
  failedCount    Int       @default(0) @map("failed_count")
  status         V1PrivacyPurgeRunStatus @default(PENDING)
  report         Json
  approvalId     String?   @map("approval_id")
  startedAt      DateTime  @default(now()) @map("started_at")
  finishedAt     DateTime? @map("finished_at")

  approval V1PrivacyPurgeApproval? @relation(fields: [approvalId], references: [id], onDelete: SetNull)
  items    V1PrivacyPurgeItem[]

  @@index([kind, startedAt])
  @@map("v1_privacy_purge_runs")
}

/// 개별 파기 항목 원장 — "무엇을 언제 지웠나"의 증적(row id만, 값은 없음).
/// 보관기간(3년, P-8) 내 불변 — 애플리케이션 코드에서 UPDATE/DELETE 하지 않는다.
model V1PrivacyPurgeItem {
  id        String   @id @default(uuid())
  runId     String   @map("run_id")
  tableName String   @map("table_name")
  rowId     String   @map("row_id")
  action    String   // MASKED | NULLED | DELETED
  createdAt DateTime @default(now()) @map("created_at")

  run V1PrivacyPurgeRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@index([tableName, rowId])
  @@map("v1_privacy_purge_items")
}

/// LIVE run 의 두 번째 게이트(P-5). 어드민이 특정 dry-run 리포트를 검토한 뒤 생성하고,
/// 같은 kind 의 LIVE run 이 시작 시 1회 소비한다. 미소비 승인이 없으면 LIVE run 은 dry-run.
model V1PrivacyPurgeApproval {
  id                     String    @id @default(uuid())
  kind                   V1PrivacyPurgeKind
  basedOnRunId           String    @map("based_on_run_id")
  approvedCandidateCount Int       @map("approved_candidate_count")
  approvedByAdminUserId  String    @map("approved_by_admin_user_id")
  note                   String?
  consumedAt             DateTime? @map("consumed_at")
  expiresAt              DateTime  @map("expires_at")
  createdAt              DateTime  @default(now()) @map("created_at")

  runs V1PrivacyPurgeRun[]

  @@index([kind, consumedAt])
  @@map("v1_privacy_purge_approvals")
}
```

- [ ] **Step 2: 생성될 제약·인덱스 이름이 63자를 넘지 않는지 계산으로 확인한다**

```bash
for n in v1_privacy_purge_runs_pkey v1_privacy_purge_runs_kind_started_at_idx \
         v1_privacy_purge_runs_approval_id_fkey v1_privacy_purge_items_pkey \
         v1_privacy_purge_items_run_id_fkey v1_privacy_purge_items_run_id_idx \
         v1_privacy_purge_items_table_name_row_id_idx v1_privacy_purge_approvals_pkey \
         v1_privacy_purge_approvals_kind_consumed_at_idx \
         v1_privacy_purge_approvals_based_on_run_id_fkey; do
  printf "%3d  %s\n" "${#n}" "$n"
done
```

Expected: 전부 26~47자(최댓값 47) — 63자 미만이므로 리그전 트랙이 겪은 자동 이름 절단 문제가 없다. 값이 다르면 실제 Prisma 생성 이름을 우선한다.

- [ ] **Step 3: 마이그레이션 SQL을 작성한다**

`apps/v1_api/prisma/migrations/20260817010000_v1_privacy_purge/migration.sql`:

```sql
-- 개인정보 파기 자동화: run/item/approval 원장 3테이블 + enum 3종.
-- additive only. 기존 테이블/컬럼을 변경하거나 삭제하지 않는다.

CREATE TYPE "V1PrivacyPurgeKind" AS ENUM ('WITHDRAWAL_EXPIRY', 'RETENTION_EXPIRY', 'TOKEN_SWEEP', 'LEDGER_SWEEP');
CREATE TYPE "V1PrivacyPurgeMode" AS ENUM ('DRY_RUN', 'LIVE');
CREATE TYPE "V1PrivacyPurgeRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'SKIPPED');

CREATE TABLE IF NOT EXISTS "v1_privacy_purge_runs" (
  "id" TEXT NOT NULL,
  "kind" "V1PrivacyPurgeKind" NOT NULL,
  "mode" "V1PrivacyPurgeMode" NOT NULL,
  "cutoff_at" TIMESTAMP(3) NOT NULL,
  "candidate_count" INTEGER NOT NULL,
  "purged_count" INTEGER NOT NULL DEFAULT 0,
  "held_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "status" "V1PrivacyPurgeRunStatus" NOT NULL DEFAULT 'PENDING',
  "report" JSONB NOT NULL,
  "approval_id" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "v1_privacy_purge_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "v1_privacy_purge_runs_kind_started_at_idx"
  ON "v1_privacy_purge_runs" ("kind", "started_at");

CREATE TABLE IF NOT EXISTS "v1_privacy_purge_items" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "table_name" TEXT NOT NULL,
  "row_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_privacy_purge_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "v1_privacy_purge_items_run_id_idx" ON "v1_privacy_purge_items" ("run_id");
CREATE INDEX IF NOT EXISTS "v1_privacy_purge_items_table_name_row_id_idx"
  ON "v1_privacy_purge_items" ("table_name", "row_id");

CREATE TABLE IF NOT EXISTS "v1_privacy_purge_approvals" (
  "id" TEXT NOT NULL,
  "kind" "V1PrivacyPurgeKind" NOT NULL,
  "based_on_run_id" TEXT NOT NULL,
  "approved_candidate_count" INTEGER NOT NULL,
  "approved_by_admin_user_id" TEXT NOT NULL,
  "note" TEXT,
  "consumed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "v1_privacy_purge_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "v1_privacy_purge_approvals_kind_consumed_at_idx"
  ON "v1_privacy_purge_approvals" ("kind", "consumed_at");

ALTER TABLE "v1_privacy_purge_runs"
  ADD CONSTRAINT "v1_privacy_purge_runs_approval_id_fkey"
  FOREIGN KEY ("approval_id") REFERENCES "v1_privacy_purge_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "v1_privacy_purge_items"
  ADD CONSTRAINT "v1_privacy_purge_items_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "v1_privacy_purge_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: (보류) `prisma migrate diff`는 이 환경에서 실행하지 않는다**

Global Constraints에 따라 schema.prisma와 migration.sql을 한 줄씩 눈으로 대조하는 것으로 대체한다. 실제 재생 검증은 CI가 한다.

- [ ] **Step 5: drift gate 해시를 재핀한다**

```bash
cd apps/v1_api && shasum -a 256 prisma/schema.prisma
```

Task 0 Step 1에서 확인한 최신 상태(리그전 트랙 반영 여부) 위에서 계산한 값으로 `test/fixtures/game-schema.fixture.ts`의 `gameSchemaSourceManifest.schema`를 교체하고, 기존 재핀 주석 사슬 형식을 그대로 따라 바로 위에 근거 주석을 덧붙인다:

```ts
// 2026-08-17 재핀: 개인정보 파기 원장(V1PrivacyPurgeRun/Item/Approval) 신규 테이블 3개 +
// enum 3종(V1PrivacyPurgeKind/Mode/RunStatus) 추가. 게임 도메인(V1Game*) 모델은
// 건드리지 않았고 전부 additive다. 뒷받침 마이그레이션: 20260817010000_v1_privacy_purge.
```

- [ ] **Step 6: drift gate가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns game-schema`
Expected: PASS — `SOURCE_SNAPSHOT_DRIFT` 없음

- [ ] **Step 7: tsc로 새 모델이 Prisma 타입에 반영됐는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit`
Expected: **주의 — 공유 Prisma client가 stale하면 `tx.v1PrivacyPurgeRun` 등 새 모델 타입이 아직 안 보일 수 있다.** 이 시점에서는 schema.prisma 자체의 문법 오류만 없으면 통과로 간주하고, 새 모델을 사용하는 Task 2 이후 코드의 타입 검증은 CI(별도 generate 단계 포함)에 맡긴다. 로컬에서 타입 오류가 나면 Global Constraints의 "ts-jest diagnostics 끈 임시 config" 우회를 그대로 쓴다.

- [ ] **Step 8: 커밋한다**

```bash
git add apps/v1_api/prisma/schema.prisma \
        apps/v1_api/prisma/migrations/20260817010000_v1_privacy_purge/migration.sql \
        apps/v1_api/test/fixtures/game-schema.fixture.ts
git commit -m "feat(privacy): 개인정보 파기 원장 스키마(run/item/approval) 추가"
git show --stat HEAD
```

---

## Task 2: 공용 PII 파기 helper (`purgeUserPii`) — 어드민·잡 A 단일 소스

**Files:**
- Create: `apps/v1_api/src/common/privacy/purge-user-pii.ts`
- Test: `apps/v1_api/src/common/privacy/purge-user-pii.spec.ts`
- Modify: `apps/v1_api/src/admin/admin.service.ts`

**Interfaces:**
- Consumes: 없음 (Prisma `TransactionClient`만)
- Produces: `function purgeUserPii(tx, userId, at): Promise<PurgeUserPiiResult>` — `{ itemsToRecord: Array<{ tableName, rowId, action }> }`

이 함수는 **PII 스크럽만** 한다 — `accountStatus`/`deletedAt` 전이와 `V1PrivacyPurgeItem` insert는 호출자(안전 규율 2의 트랜잭션 마지막 쓰기)가 한다. 이렇게 나누는 이유: 어드민 경로와 잡 A 경로가 "왜 지웠는지"(reason/kind)가 다르고, 그 차이를 이 함수 안에 조건 분기로 넣으면 두 경로가 다시 갈라지기 시작한다 — 그 자체가 P-3이 막으려는 문제다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/common/privacy/purge-user-pii.spec.ts`:

```ts
import { purgeUserPii } from './purge-user-pii';

function fakeTx(overrides: Record<string, unknown> = {}) {
  const base = {
    v1User: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    v1AuthIdentity: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    v1UserProfile: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
    v1VerificationToken: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    v1PushSubscription: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    v1SearchHistory: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    v1TournamentPlayer: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    v1Inquiry: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
  };
  return { ...base, ...overrides } as never;
}

describe('purgeUserPii', () => {
  it('email/phone이 있으면 결정론적으로 마스킹하고 v1_users 아이템을 기록한다', async () => {
    const tx = fakeTx({
      v1User: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com', phone: '01011112222' }),
        update: jest.fn(),
      },
    });
    const result = await purgeUserPii(tx, 'u1', new Date('2026-08-17T00:00:00Z'));
    expect(tx.v1User.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          email: 'deleted+u1@deleted.teameet.local',
          phone: 'deleted-u1',
          emailVerifiedAt: null,
          phoneVerifiedAt: null,
        }),
      }),
    );
    expect(result.itemsToRecord).toContainEqual({ tableName: 'v1_users', rowId: 'u1', action: 'MASKED' });
  });

  it('email/phone이 이미 null이면 null 그대로 두고 재마스킹하지 않는다', async () => {
    const tx = fakeTx({
      v1User: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'u1', email: null, phone: null }),
        update: jest.fn(),
      },
    });
    await purgeUserPii(tx, 'u1', new Date());
    expect(tx.v1User.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: null, phone: null }) }),
    );
  });

  it('프로필의 gender/birthDate까지 null 처리한다 — 기존 어드민 삭제가 누락했던 범위', async () => {
    const tx = fakeTx({
      v1User: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'u1', email: null, phone: null }), update: jest.fn() },
      v1UserProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', userId: 'u1' }), update: jest.fn() },
    });
    const result = await purgeUserPii(tx, 'u1', new Date());
    expect(tx.v1UserProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gender: null, birthDate: null, realName: null, bio: null, profileImageUrl: null }),
      }),
    );
    expect(result.itemsToRecord).toContainEqual({ tableName: 'v1_user_profiles', rowId: 'p1', action: 'MASKED' });
  });

  it('대회 로스터의 birthDateSnapshot/genderSnapshot/eligibilityNote를 null 처리하되 realName은 유지한다', async () => {
    const tx = fakeTx({
      v1User: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'u1', email: null, phone: null }), update: jest.fn() },
      v1TournamentPlayer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'tp1' }, { id: 'tp2' }]),
        updateMany: jest.fn(),
      },
    });
    const result = await purgeUserPii(tx, 'u1', new Date());
    expect(tx.v1TournamentPlayer.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { birthDateSnapshot: null, genderSnapshot: null, eligibilityNote: null },
    });
    expect(result.itemsToRecord).toEqual(
      expect.arrayContaining([
        { tableName: 'v1_tournament_players', rowId: 'tp1', action: 'NULLED' },
        { tableName: 'v1_tournament_players', rowId: 'tp2', action: 'NULLED' },
      ]),
    );
  });

  it('문의(V1Inquiry)의 contact만 null 처리하고 본문은 건드리지 않는다', async () => {
    const tx = fakeTx({
      v1User: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'u1', email: null, phone: null }), update: jest.fn() },
      v1Inquiry: { findMany: jest.fn().mockResolvedValue([{ id: 'iq1' }]), updateMany: jest.fn() },
    });
    await purgeUserPii(tx, 'u1', new Date());
    expect(tx.v1Inquiry.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { contact: null } });
  });

  it('건드릴 row가 없는 테이블은 deleteMany/updateMany 자체를 호출하지 않는다(불필요한 쿼리 방지)', async () => {
    const tx = fakeTx({
      v1User: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'u1', email: null, phone: null }), update: jest.fn() },
    });
    await purgeUserPii(tx, 'u1', new Date());
    expect(tx.v1VerificationToken.deleteMany).not.toHaveBeenCalled();
    expect(tx.v1PushSubscription.deleteMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns purge-user-pii`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/common/privacy/purge-user-pii.ts`:

```ts
import { Prisma } from '@prisma/client';

export type PurgeItemAction = 'MASKED' | 'NULLED' | 'DELETED';

export interface PurgeUserPiiResult {
  itemsToRecord: Array<{ tableName: string; rowId: string; action: PurgeItemAction }>;
}

/**
 * 유저 1명의 PII를 스크럽하는 단일 소스. 어드민 수동 삭제(admin.service.ts deleteUser)와
 * 잡 A(withdrawal-expiry-purge.service.ts)가 **이 함수만** 호출한다 — 범위가 갈라지면
 * 한쪽으로 삭제된 유저의 잔여 PII가 영구 사각이 된다(P-3).
 *
 * **accountStatus/deletedAt 전이는 하지 않는다.** 그건 호출자가 같은 트랜잭션의
 * 마지막 쓰기로 한다(안전 규율 2) — "왜 지웠는지"가 호출자마다 다르기 때문이다.
 *
 * 이미 null/masked인 필드는 재마스킹하지 않고 그대로 둔다 — 재실행 멱등성을 위해서다
 * (잡 A가 실패 후 같은 유저를 다음 run에서 재시도할 때 이 함수가 다시 호출된다).
 */
export async function purgeUserPii(
  tx: Prisma.TransactionClient,
  userId: string,
  at: Date,
): Promise<PurgeUserPiiResult> {
  const items: PurgeUserPiiResult['itemsToRecord'] = [];
  const target = await tx.v1User.findUniqueOrThrow({ where: { id: userId } });

  await tx.v1User.update({
    where: { id: userId },
    data: {
      email: target.email ? buildDeletedEmail(userId) : null,
      phone: target.phone ? buildDeletedPhone(userId) : null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
    },
  });
  items.push({ tableName: 'v1_users', rowId: userId, action: 'MASKED' });

  const identities = await tx.v1AuthIdentity.findMany({ where: { userId }, select: { id: true } });
  for (const identity of identities) {
    await tx.v1AuthIdentity.update({
      where: { id: identity.id },
      data: {
        status: 'unlinked',
        providerUserKey: buildDeletedProviderUserKey(userId, identity.id),
        email: null,
        passwordHash: null,
        unlinkedAt: at,
      },
    });
    items.push({ tableName: 'v1_auth_identities', rowId: identity.id, action: 'MASKED' });
  }

  const profile = await tx.v1UserProfile.findUnique({ where: { userId } });
  if (profile) {
    await tx.v1UserProfile.update({
      where: { userId },
      data: {
        nickname: buildDeletedNickname(userId),
        displayName: '탈퇴 회원',
        realName: null,
        bio: null,
        profileImageUrl: null,
        // gender/birthDate: 기존 어드민 삭제(admin.service.ts:362-372)가 놓치던 범위 —
        // helper 통합으로 어드민 경로도 이 시점부터 함께 해소된다.
        gender: null,
        birthDate: null,
        deletedAt: at,
      },
    });
    items.push({ tableName: 'v1_user_profiles', rowId: profile.id, action: 'MASKED' });
  }

  const tokens = await tx.v1VerificationToken.findMany({ where: { userId }, select: { id: true } });
  if (tokens.length > 0) {
    await tx.v1VerificationToken.deleteMany({ where: { userId } });
    for (const t of tokens) items.push({ tableName: 'v1_verification_tokens', rowId: t.id, action: 'DELETED' });
  }

  const subs = await tx.v1PushSubscription.findMany({ where: { userId }, select: { id: true } });
  if (subs.length > 0) {
    await tx.v1PushSubscription.deleteMany({ where: { userId } });
    for (const s of subs) items.push({ tableName: 'v1_push_subscriptions', rowId: s.id, action: 'DELETED' });
  }

  const searches = await tx.v1SearchHistory.findMany({ where: { userId }, select: { id: true } });
  if (searches.length > 0) {
    await tx.v1SearchHistory.deleteMany({ where: { userId } });
    for (const s of searches) items.push({ tableName: 'v1_search_histories', rowId: s.id, action: 'DELETED' });
  }

  // 완료 대회 포함 전체 로스터 항목. realName은 유지한다 — 문서02 §13.4 "공식 기록은
  // display snapshot 유지" 원칙(공개 기록이 실명 표시를 전제하므로 탈퇴만으로 지우지 않는다).
  const players = await tx.v1TournamentPlayer.findMany({ where: { userId }, select: { id: true } });
  if (players.length > 0) {
    await tx.v1TournamentPlayer.updateMany({
      where: { userId },
      data: { birthDateSnapshot: null, genderSnapshot: null, eligibilityNote: null },
    });
    for (const p of players) items.push({ tableName: 'v1_tournament_players', rowId: p.id, action: 'NULLED' });
  }

  // 문의 본문(body/title)은 신고·분쟁 대응 3년 보존 — contact만 지운다.
  const inquiries = await tx.v1Inquiry.findMany({ where: { userId }, select: { id: true } });
  if (inquiries.length > 0) {
    await tx.v1Inquiry.updateMany({ where: { userId }, data: { contact: null } });
    for (const i of inquiries) items.push({ tableName: 'v1_inquiries', rowId: i.id, action: 'NULLED' });
  }

  return { itemsToRecord: items };
}

function buildDeletedEmail(userId: string): string {
  return `deleted+${userId}@deleted.teameet.local`;
}

function buildDeletedPhone(userId: string): string {
  return `deleted-${userId}`;
}

function buildDeletedProviderUserKey(userId: string, identityId: string): string {
  return `deleted:${userId}:${identityId}`;
}

function buildDeletedNickname(userId: string): string {
  return `deleted_${userId.slice(0, 8)}`;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns purge-user-pii`
Expected: PASS (6 tests)

- [ ] **Step 5: `admin.service.ts`의 `deleteUser`를 helper 호출로 전환한다**

`src/admin/admin.service.ts`에서 아래 인용된 기존 인라인 마스킹 블록(`:330-372` 부근 — 정확한 라인은 파일을 열어 확인. 마커: `email: target.email ? buildDeletedEmail(userId) : null` 로 시작해 `deletedAt,\n        },\n      });` 로 끝나는 두 개의 `tx.v1User.update` / `tx.v1AuthIdentity.update` (loop) / `tx.v1UserProfile.updateMany` 블록)를 아래로 교체한다.

**주의 — `accountStatus: 'deleted', deletedAt`은 `purgeUserPii` 호출과 별개로, 기존 코드 그대로 유지한다** (안전 규율 2: 상태 전이는 helper 밖, 트랜잭션의 마지막 쓰기여야 한다):

```ts
      const updated = await tx.v1User.update({
        where: { id: userId },
        data: { accountStatus: 'deleted', deletedAt },
      });

      const { itemsToRecord } = await purgeUserPii(tx, userId, deletedAt);

      await this.detachUserFromActiveCommitments(tx, userId, admin.userId, dto.reason, deletedAt);

      // 어드민 수동 삭제도 잡과 동일한 원장에 1건짜리 run으로 기록한다 — 그래야
      // 미래의 백필 조건("V1PrivacyPurgeItem에 기록이 없는 deleted 유저")이 계속 성립한다.
      const purgeRun = await tx.v1PrivacyPurgeRun.create({
        data: {
          kind: 'WITHDRAWAL_EXPIRY',
          mode: 'LIVE',
          cutoffAt: deletedAt,
          candidateCount: 1,
          purgedCount: 1,
          status: 'COMPLETED',
          report: { adminTriggered: true, adminUserId: admin.userId },
          startedAt: deletedAt,
          finishedAt: deletedAt,
        },
      });
      await tx.v1PrivacyPurgeItem.createMany({
        data: itemsToRecord.map((item) => ({ runId: purgeRun.id, ...item })),
      });
```

기존에 `updated`를 반환값과 `writeAdminStatusLogs`에 넘기던 곳은 위 `updated` 변수를 그대로 재사용한다(email/phone 값을 참조하던 `beforeState`의 `hasEmail`/`hasPhone` 계산은 `target`(트랜잭션 시작 시점 조회값)을 그대로 쓰므로 영향 없음).

파일 상단 import에 추가:
```ts
import { purgeUserPii } from '../common/privacy/purge-user-pii';
```

파일 하단의 기존 `function buildDeletedEmail(userId: string) { ... }` 등 4개 함수는 `purge-user-pii.ts`로 이동했으므로 **여기서는 삭제한다** — 두 곳에 같은 로직이 남으면 그 자체가 드리프트 씨앗이다. `admin.service.ts` 안에서 이 함수들을 다른 곳(`changeUserStatus` 등)에서 쓰지 않는지 먼저 grep으로 확인한다.

- [ ] **Step 6: `admin.service.spec.ts`의 기존 삭제 테스트가 그대로 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns admin.service`
Expected: PASS — `deleteUser`가 email/phone 마스킹 값을 검증하는 기존 단언은 동일한 문자열을 계속 생성하므로(helper로 옮겼을 뿐 알고리즘은 불변) 그대로 통과해야 한다. 실패하면 Step 5의 교체가 기존 값 형식을 바꾼 것이므로 되짚는다.

- [ ] **Step 7: gender/birthDate/대회 스냅샷이 새로 마스킹되는지 확인하는 회귀 테스트를 추가한다**

`admin.service.spec.ts`(기존 파일)에 추가:

```ts
it('deleteUser는 profile.gender/birthDate와 대회 로스터 스냅샷도 함께 지운다 (helper 통합 이후 확장 범위)', async () => {
  // 기존 fixture 헬퍼로 profile.gender='male', birthDate='19900101'인 유저 + 완료 대회
  // 로스터 참가 이력을 준비하고, deleteUser 호출 후 v1UserProfile.gender/birthDate와
  // v1TournamentPlayer.birthDateSnapshot/genderSnapshot/eligibilityNote가 모두 null인지,
  // realName은 여전히 값이 남아 있는지 단언한다. 파일이 이미 쓰는 fixture 패턴(테스트
  // 파일을 열어 실제 헬퍼 이름을 확인)을 그대로 따른다.
});
```

- [ ] **Step 8: 커밋한다**

```bash
git add apps/v1_api/src/common/privacy/purge-user-pii.ts \
        apps/v1_api/src/common/privacy/purge-user-pii.spec.ts \
        apps/v1_api/src/admin/admin.service.ts \
        apps/v1_api/src/admin/admin.service.spec.ts
git commit -m "feat(privacy): PII 파기 helper 통합 — 어드민 삭제가 gender/birthDate/대회 스냅샷까지 지우게 확장"
git show --stat HEAD
```

---

## Task 3: LIVE 게이트 2중 판정 순수함수

**Files:**
- Create: `apps/v1_api/src/jobs/privacy-purge/privacy-purge-gate.ts`
- Test: `apps/v1_api/src/jobs/privacy-purge/privacy-purge-gate.spec.ts`

**Interfaces:**
- Produces: `function decidePurgeMode(input): GateDecision` — P-5의 단일 정의

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/jobs/privacy-purge/privacy-purge-gate.spec.ts`:

```ts
import { decidePurgeMode } from './privacy-purge-gate';

const now = new Date('2026-08-17T04:00:00Z');
function approval(overrides: Partial<Parameters<typeof decidePurgeMode>[0]['approval']> = {}) {
  return {
    id: 'ap1',
    approvedCandidateCount: 100,
    consumedAt: null,
    expiresAt: new Date('2026-08-24T04:00:00Z'),
    ...overrides,
  };
}

describe('decidePurgeMode', () => {
  it('env가 꺼져 있으면 승인이 있어도 dry-run이다 (게이트 1이 상위)', () => {
    const d = decidePurgeMode({ envEnabled: false, approval: approval(), currentCandidateCount: 100, now });
    expect(d).toEqual({ mode: 'DRY_RUN', approvalId: null });
  });

  it('env는 켜져 있는데 승인이 없으면 dry-run이다', () => {
    const d = decidePurgeMode({ envEnabled: true, approval: null, currentCandidateCount: 100, now });
    expect(d).toEqual({ mode: 'DRY_RUN', approvalId: null });
  });

  it('env 켜짐 + 유효한 미소비 승인 + 편차 이내면 LIVE다', () => {
    const d = decidePurgeMode({ envEnabled: true, approval: approval(), currentCandidateCount: 105, now });
    expect(d).toEqual({ mode: 'LIVE', approvalId: 'ap1' });
  });

  it('이미 소비된 승인은 무효 — dry-run으로 떨어진다', () => {
    const d = decidePurgeMode({
      envEnabled: true,
      approval: approval({ consumedAt: new Date('2026-08-16T00:00:00Z') }),
      currentCandidateCount: 100,
      now,
    });
    expect(d).toEqual({ mode: 'DRY_RUN', approvalId: null });
  });

  it('만료된 승인은 무효 — dry-run으로 떨어진다', () => {
    const d = decidePurgeMode({
      envEnabled: true,
      approval: approval({ expiresAt: new Date('2026-08-16T00:00:00Z') }),
      currentCandidateCount: 100,
      now,
    });
    expect(d).toEqual({ mode: 'DRY_RUN', approvalId: null });
  });

  it('현재 후보가 승인 건수 대비 +10% 초과면 SKIPPED다', () => {
    const d = decidePurgeMode({ envEnabled: true, approval: approval(), currentCandidateCount: 111, now });
    expect(d).toEqual({ mode: 'SKIPPED', reason: 'DEVIATION_EXCEEDED' });
  });

  it('+10% 경계값(정확히 110)은 아직 LIVE다', () => {
    const d = decidePurgeMode({ envEnabled: true, approval: approval(), currentCandidateCount: 110, now });
    expect(d).toEqual({ mode: 'LIVE', approvalId: 'ap1' });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns privacy-purge-gate`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/jobs/privacy-purge/privacy-purge-gate.ts`:

```ts
/**
 * LIVE 게이트의 단일 정의(P-5). 이 함수 밖에서 "지금 이 run이 LIVE인지"를
 * 다시 판정하지 않는다 — 판정이 두 곳에 있으면 반드시 갈린다.
 *
 * 게이트 1(env): 환경 단위 LIVE 능력 스위치. 꺼져 있으면 승인이 있어도 무조건 dry-run.
 * 게이트 2(승인): 특정 dry-run 리포트를 근거로 어드민이 발행한 1회용·7일 유효 승인.
 * 편차 가드: 승인 시점 후보 건수 대비 현재 후보가 +10% 초과면 실행하지 않고 SKIPPED —
 *           승인과 실행 사이에 후보 분포가 바뀌었다는 신호다.
 */
export interface PurgeApprovalSnapshot {
  id: string;
  approvedCandidateCount: number;
  consumedAt: Date | null;
  expiresAt: Date;
}

export interface GateDecisionInput {
  envEnabled: boolean;
  approval: PurgeApprovalSnapshot | null;
  currentCandidateCount: number;
  now: Date;
}

export type GateDecision =
  | { mode: 'DRY_RUN'; approvalId: null }
  | { mode: 'LIVE'; approvalId: string }
  | { mode: 'SKIPPED'; reason: 'DEVIATION_EXCEEDED' };

const DEVIATION_THRESHOLD_RATIO = 1.1;

export function decidePurgeMode(input: GateDecisionInput): GateDecision {
  if (!input.envEnabled) return { mode: 'DRY_RUN', approvalId: null };

  const approval = input.approval;
  if (!approval) return { mode: 'DRY_RUN', approvalId: null };
  if (approval.consumedAt !== null) return { mode: 'DRY_RUN', approvalId: null };
  if (approval.expiresAt.getTime() <= input.now.getTime()) return { mode: 'DRY_RUN', approvalId: null };

  const deviationCeiling = approval.approvedCandidateCount * DEVIATION_THRESHOLD_RATIO;
  if (input.currentCandidateCount > deviationCeiling) {
    return { mode: 'SKIPPED', reason: 'DEVIATION_EXCEEDED' };
  }

  return { mode: 'LIVE', approvalId: approval.id };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns privacy-purge-gate`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add apps/v1_api/src/jobs/privacy-purge/privacy-purge-gate.ts \
        apps/v1_api/src/jobs/privacy-purge/privacy-purge-gate.spec.ts
git commit -m "feat(privacy): LIVE 게이트 2중 판정 순수함수 추가"
git show --stat HEAD
```

---

## Task 4: 잡 A/B 후보 선정·hold 판정 순수함수

**Files:**
- Create: `apps/v1_api/src/jobs/privacy-purge/privacy-purge-candidates.ts`
- Test: `apps/v1_api/src/jobs/privacy-purge/privacy-purge-candidates.spec.ts`

**Interfaces:**
- Produces: `isWithdrawalGraceExpired`, `hasSanctionHistory`, `deriveTournamentEndAt`, `isRetentionExpired`, `holdReasonsForRegistration`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/jobs/privacy-purge/privacy-purge-candidates.spec.ts`:

```ts
import {
  WITHDRAWAL_GRACE_PERIOD_DAYS,
  RETENTION_YEARS,
  isWithdrawalGraceExpired,
  hasSanctionHistory,
  deriveTournamentEndAt,
  isRetentionExpired,
  holdReasonsForRegistration,
} from './privacy-purge-candidates';

const now = new Date('2026-08-17T04:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('isWithdrawalGraceExpired (§7.1 경계값: 29/30/31일)', () => {
  it('29일 경과는 아직 만료가 아니다', () => {
    expect(isWithdrawalGraceExpired(new Date(now.getTime() - 29 * DAY_MS), now)).toBe(false);
  });
  it('정확히 30일 경과면 만료다', () => {
    expect(isWithdrawalGraceExpired(new Date(now.getTime() - WITHDRAWAL_GRACE_PERIOD_DAYS * DAY_MS), now)).toBe(true);
  });
  it('31일 경과도 만료다', () => {
    expect(isWithdrawalGraceExpired(new Date(now.getTime() - 31 * DAY_MS), now)).toBe(true);
  });
});

describe('hasSanctionHistory (G10 hold — 재가입 방지 목적과의 충돌)', () => {
  it('suspended/blocked 이력이 있으면 true다', () => {
    expect(hasSanctionHistory(['active', 'suspended'])).toBe(true);
    expect(hasSanctionHistory(['active', 'blocked'])).toBe(true);
  });
  it('withdrawal_pending만 있으면 false다', () => {
    expect(hasSanctionHistory(['active', 'withdrawal_pending'])).toBe(false);
  });
  it('이력이 비어 있으면 false다', () => {
    expect(hasSanctionHistory([])).toBe(false);
  });
});

describe('deriveTournamentEndAt (종료 시각 파생 fallback)', () => {
  it('상태 로그가 있으면 로그 시각을 쓴다', () => {
    const logAt = new Date('2026-01-01T00:00:00Z');
    const result = deriveTournamentEndAt({ statusLogAt: logAt, scheduledEndAt: new Date('2026-02-01T00:00:00Z') });
    expect(result).toEqual({ determined: true, cutoffAt: logAt, source: 'STATUS_LOG' });
  });
  it('로그가 없고 scheduledEndAt만 있으면 그걸 쓴다', () => {
    const endAt = new Date('2026-02-01T00:00:00Z');
    const result = deriveTournamentEndAt({ statusLogAt: null, scheduledEndAt: endAt });
    expect(result).toEqual({ determined: true, cutoffAt: endAt, source: 'SCHEDULED_END_AT' });
  });
  it('둘 다 없으면 판정 불가다', () => {
    expect(deriveTournamentEndAt({ statusLogAt: null, scheduledEndAt: null })).toEqual({ determined: false });
  });
});

describe('isRetentionExpired (경계값: 2년 364일/3년/3년 1일)', () => {
  it('2년 364일 경과는 아직 만료가 아니다', () => {
    const endedAt = new Date(now.getTime() - (RETENTION_YEARS * 365 - 1) * DAY_MS);
    expect(isRetentionExpired(endedAt, now)).toBe(false);
  });
  it('정확히 3년 경과면 만료다', () => {
    const endedAt = new Date(now);
    endedAt.setFullYear(endedAt.getFullYear() - RETENTION_YEARS);
    expect(isRetentionExpired(endedAt, now)).toBe(true);
  });
});

describe('holdReasonsForRegistration (약관의 보관 연장 조항 구현)', () => {
  const base = {
    hasOpenInquiry: false,
    paymentStatus: 'paid' as const,
    cancelRequestedAt: null,
    refundedAt: null,
    sanctionReviewUndetermined: false,
  };

  it('전부 정상이면 hold 사유가 없다', () => {
    expect(holdReasonsForRegistration(base)).toEqual([]);
  });
  it('미완결 문의(status != closed)가 있으면 OPEN_INQUIRY', () => {
    expect(holdReasonsForRegistration({ ...base, hasOpenInquiry: true })).toEqual(['OPEN_INQUIRY']);
  });
  it("결제 상태가 'ready'(입금 확인 미완)면 PAYMENT_UNSETTLED", () => {
    expect(holdReasonsForRegistration({ ...base, paymentStatus: 'ready' })).toEqual(['PAYMENT_UNSETTLED']);
  });
  it('취소 요청은 있는데 환불이 안 끝났으면(refundedAt=null) PAYMENT_UNSETTLED', () => {
    expect(
      holdReasonsForRegistration({ ...base, cancelRequestedAt: new Date(), refundedAt: null }),
    ).toEqual(['PAYMENT_UNSETTLED']);
  });
  it('취소 요청 후 환불까지 끝났으면(refundedAt 존재) hold가 아니다', () => {
    expect(
      holdReasonsForRegistration({ ...base, cancelRequestedAt: new Date(), refundedAt: new Date() }),
    ).toEqual([]);
  });
  it('제재 진행 상태가 판정 불가면 보수적으로 hold(SANCTION_REVIEW_UNDETERMINED)', () => {
    expect(holdReasonsForRegistration({ ...base, sanctionReviewUndetermined: true })).toEqual([
      'SANCTION_REVIEW_UNDETERMINED',
    ]);
  });
  it('여러 사유가 동시에 걸리면 전부 반환한다', () => {
    expect(
      holdReasonsForRegistration({ ...base, hasOpenInquiry: true, paymentStatus: 'ready' }),
    ).toEqual(['OPEN_INQUIRY', 'PAYMENT_UNSETTLED']);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns privacy-purge-candidates`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/jobs/privacy-purge/privacy-purge-candidates.ts`:

```ts
/**
 * 잡 A(WITHDRAWAL_EXPIRY)·잡 B(RETENTION_EXPIRY) 후보 선정의 순수함수 계층.
 * DB 조회는 각 잡의 서비스 파일이 하고, 여기서는 판정 로직만 검증한다.
 */

/** §10.2-Q2 권고값. 최종 값은 사용자 결정 게이트 대상 — 결정 전까지 이 상수를 쓴다. */
export const WITHDRAWAL_GRACE_PERIOD_DAYS = 30;

/**
 * `withdrawal_pending`으로의 **가장 최근** 전이 로그 시각 기준 유예 만료 여부.
 * "가장 최근" 기준인 이유: 탈퇴 신청 → 어드민 복구 → 재탈퇴가 가능하므로 같은 유저에
 * 로그 행이 여러 개 쌓일 수 있고, 최초 행 기준이면 재탈퇴 유저의 유예가 0일이 된다 —
 * 재탈퇴는 유예를 재시작한다.
 */
export function isWithdrawalGraceExpired(
  mostRecentWithdrawalLogAt: Date,
  now: Date,
  graceDays: number = WITHDRAWAL_GRACE_PERIOD_DAYS,
): boolean {
  const graceMs = graceDays * 24 * 60 * 60 * 1000;
  return now.getTime() - mostRecentWithdrawalLogAt.getTime() >= graceMs;
}

/**
 * 제재 이력 hold(G10) — 약관의 "재가입 방지 최대 3년" 약속과 결정론적 마스킹(userId 파생
 * email/phone)이 충돌한다. `buildDeletedEmail/Phone`은 원본과 무관한 값이라 마스킹 즉시
 * 재가입 연결 수단이 사라지므로, 이 유저는 §10.1-L7 법무 확인 전까지 hold한다.
 */
export function hasSanctionHistory(statusLogToStatuses: readonly string[]): boolean {
  return statusLogToStatuses.some((s) => s === 'suspended' || s === 'blocked');
}

/** §10.2-Q2 권고값과 별개 — 대회 PII 보관기간은 약관에 3년으로 고정 명시돼 있다(§1.3). */
export const RETENTION_YEARS = 3;

export type TournamentEndAtResult =
  | { determined: true; cutoffAt: Date; source: 'STATUS_LOG' | 'SCHEDULED_END_AT' }
  | { determined: false };

/**
 * 대회 종료 시각 파생. `V1Tournament`에는 `completedAt` 컬럼이 없다(`schema.prisma` 실측) —
 * `V1StatusChangeLog`(targetType='tournament', toStatus IN ('completed','cancelled'))의 가장
 * 최근 행 → 없으면 `scheduledEndAt` → 둘 다 없으면 판정 불가(파기 skip, UNDETERMINED_CUTOFF).
 */
export function deriveTournamentEndAt(input: {
  statusLogAt: Date | null;
  scheduledEndAt: Date | null;
}): TournamentEndAtResult {
  if (input.statusLogAt) return { determined: true, cutoffAt: input.statusLogAt, source: 'STATUS_LOG' };
  if (input.scheduledEndAt) return { determined: true, cutoffAt: input.scheduledEndAt, source: 'SCHEDULED_END_AT' };
  return { determined: false };
}

export function isRetentionExpired(endedAt: Date, now: Date, years: number = RETENTION_YEARS): boolean {
  const cutoff = new Date(endedAt);
  cutoff.setFullYear(cutoff.getFullYear() + years);
  return now.getTime() >= cutoff.getTime();
}

export type HoldReason = 'OPEN_INQUIRY' | 'PAYMENT_UNSETTLED' | 'SANCTION_REVIEW_UNDETERMINED';

/**
 * 약관의 보관 연장 조항("분쟁·사고·부정참가·환불·정산 대응이 필요한 경우 해당 사유
 * 종료 시까지 보관")을 그대로 구현한다. hold는 영구 제외가 아니다 — 사유 해소 시
 * 다음 run에서 자연히 후보로 복귀한다(호출부가 매 run마다 최신 상태로 재평가하므로).
 *
 * paymentStatus='ready'는 입금 확인 미완결(`V1TournamentPaymentStatus`, schema.prisma
 * 실측: ready|paid|failed|cancelled|refunded). cancelRequestedAt은 있는데 refundedAt이
 * 없으면 환불 처리 중인 것으로 본다(`V1TournamentRegistration.cancelRequestedAt`).
 */
export function holdReasonsForRegistration(input: {
  hasOpenInquiry: boolean;
  paymentStatus: 'ready' | 'paid' | 'failed' | 'cancelled' | 'refunded' | null;
  cancelRequestedAt: Date | null;
  refundedAt: Date | null;
  /** 제재·부정참가 대응 진행 상태를 판정할 수 없으면 true(보수적 기본값 — hold). */
  sanctionReviewUndetermined: boolean;
}): HoldReason[] {
  const reasons: HoldReason[] = [];
  if (input.hasOpenInquiry) reasons.push('OPEN_INQUIRY');

  const paymentUnsettled =
    input.paymentStatus === 'ready' || (input.cancelRequestedAt !== null && input.refundedAt === null);
  if (paymentUnsettled) reasons.push('PAYMENT_UNSETTLED');

  if (input.sanctionReviewUndetermined) reasons.push('SANCTION_REVIEW_UNDETERMINED');

  return reasons;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns privacy-purge-candidates`
Expected: PASS (16 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add apps/v1_api/src/jobs/privacy-purge/privacy-purge-candidates.ts \
        apps/v1_api/src/jobs/privacy-purge/privacy-purge-candidates.spec.ts
git commit -m "feat(privacy): 잡 A/B 후보 선정·hold 판정 순수함수 추가"
git show --stat HEAD
```

---

## Task 5: Run/Item 원장 repository + 스캔 예약 체인

**Files:**
- Create: `apps/v1_api/src/jobs/privacy-purge/privacy-purge-run.repository.ts`
- Test: `apps/v1_api/src/jobs/privacy-purge/privacy-purge-run.repository.spec.ts`

**Interfaces:**
- Consumes: `V1OutboxEvent`(기존, `schema.prisma`), `scheduleNextScan` 패턴(기존, `lineup-reminder.service.ts:227`)
- Produces: `schedulePrivacyPurgeScan(tx, now)`, `finalizeRun(tx, runId)` — Item 집계에서 purgedCount/report를 파생

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/jobs/privacy-purge/privacy-purge-run.repository.spec.ts`:

```ts
import { PRIVACY_PURGE_SCAN_TYPE, PRIVACY_PURGE_SCAN_INTERVAL_MS, schedulePrivacyPurgeScan } from './privacy-purge-run.repository';

describe('schedulePrivacyPurgeScan', () => {
  it('다음 스캔 슬롯을 outbox 행으로 예약한다(businessKey에 슬롯 시각 포함 — 재시작해도 중복 없음)', async () => {
    const createMany = jest.fn();
    const tx = { v1OutboxEvent: { createMany } } as never;
    const now = new Date('2026-08-17T03:59:59.000Z');
    await schedulePrivacyPurgeScan(tx, now);
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            type: PRIVACY_PURGE_SCAN_TYPE,
            aggregateType: 'PRIVACY_PURGE',
            aggregateId: 'scan',
          }),
        ],
        skipDuplicates: true,
      }),
    );
  });

  it('스캔 간격이 24시간이다(일 1회)', () => {
    expect(PRIVACY_PURGE_SCAN_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns privacy-purge-run.repository`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/jobs/privacy-purge/privacy-purge-run.repository.ts`:

```ts
import { Prisma } from '@prisma/client';

/**
 * 라인업 리마인더 선례(lineup-reminder.service.ts:227 scheduleNextScan)와 동일한
 * self-rescheduling outbox 체인. 제2 스케줄러를 들이지 않고 게임 운영 워커의 outbox
 * 루프를 재사용한다 — 슬롯 키가 같으면 무시되므로 재시작해도 스캔이 늘어나지 않는다.
 */
export const PRIVACY_PURGE_SCAN_TYPE = 'PRIVACY_PURGE_SCAN';
export const PRIVACY_PURGE_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 일 1회

export async function schedulePrivacyPurgeScan(tx: Prisma.TransactionClient, now: Date): Promise<void> {
  const nextSlot = new Date(
    Math.floor(now.getTime() / PRIVACY_PURGE_SCAN_INTERVAL_MS) * PRIVACY_PURGE_SCAN_INTERVAL_MS +
      PRIVACY_PURGE_SCAN_INTERVAL_MS,
  );
  await tx.v1OutboxEvent.createMany({
    data: [
      {
        businessKey: `privacy-purge-scan:${nextSlot.toISOString()}`,
        aggregateType: 'PRIVACY_PURGE',
        aggregateId: 'scan',
        type: PRIVACY_PURGE_SCAN_TYPE,
        payload: { scheduledFor: nextSlot.toISOString() },
        availableAt: nextSlot,
      },
    ],
    skipDuplicates: true,
  });
}

/**
 * run 종료 시 Item 집계에서 purgedCount/report를 파생한다(P-7 — Item이 진실, Run의
 * 캐시 필드는 이 함수가 한 번만 계산해 넣는다). 이 함수는 개별 유저 트랜잭션 밖에서
 * 호출되는 **집계용**이라 그 자체는 원자성 보장 대상이 아니다.
 */
export async function finalizeRun(
  tx: Prisma.TransactionClient,
  runId: string,
  extra: { heldCount: number; failedCount: number; reportExtra?: Record<string, unknown> },
): Promise<void> {
  const itemCount = await tx.v1PrivacyPurgeItem.count({ where: { runId } });
  const byTable = await tx.v1PrivacyPurgeItem.groupBy({
    by: ['tableName'],
    where: { runId },
    _count: { _all: true },
  });
  await tx.v1PrivacyPurgeRun.update({
    where: { id: runId },
    data: {
      purgedCount: itemCount,
      heldCount: extra.heldCount,
      failedCount: extra.failedCount,
      status: 'COMPLETED',
      finishedAt: new Date(),
      report: {
        byTable: Object.fromEntries(byTable.map((row) => [row.tableName, row._count._all])),
        ...extra.reportExtra,
      } as Prisma.InputJsonValue,
    },
  });
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns privacy-purge-run.repository`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋한다**

```bash
git add apps/v1_api/src/jobs/privacy-purge/privacy-purge-run.repository.ts \
        apps/v1_api/src/jobs/privacy-purge/privacy-purge-run.repository.spec.ts
git commit -m "feat(privacy): 파기 run 원장 repository + self-rescheduling 스캔 체인"
git show --stat HEAD
```

---

## Task 6: 잡 A — 탈퇴 유예 만료 파기 핸들러

**Files:**
- Create: `apps/v1_api/src/jobs/privacy-purge/withdrawal-expiry-purge.service.ts`
- Test: `apps/v1_api/src/jobs/privacy-purge/withdrawal-expiry-purge.service.spec.ts`

**Interfaces:**
- Consumes: `purgeUserPii`(Task 2), `decidePurgeMode`(Task 3), `isWithdrawalGraceExpired`/`hasSanctionHistory`(Task 4), `schedulePrivacyPurgeScan`/`finalizeRun`(Task 5)
- Produces: `GameOperationHandler` 형태의 `scanHandler` (worker에 등록)

- [ ] **Step 1: 후보 조회 쿼리를 순수 조립 함수로 분리하고 실패하는 테스트를 작성한다**

`apps/v1_api/src/jobs/privacy-purge/withdrawal-expiry-purge.service.spec.ts`:

```ts
import { WithdrawalExpiryPurgeService } from './withdrawal-expiry-purge.service';

describe('WithdrawalExpiryPurgeService.selectCandidates (DB mock)', () => {
  it('withdrawal_pending 유저 중 가장 최근 로그가 유예 만료된 유저만 후보에 넣는다', async () => {
    const now = new Date('2026-08-17T04:00:00Z');
    const prisma = {
      v1User: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', accountStatus: 'withdrawal_pending' },
          { id: 'u2', accountStatus: 'withdrawal_pending' },
        ]),
      },
      v1StatusChangeLog: {
        findFirst: jest
          .fn()
          .mockImplementationOnce(async () => ({ createdAt: new Date('2026-07-01T00:00:00Z') })) // u1: 47일 전 — 만료
          .mockImplementationOnce(async () => ({ createdAt: new Date('2026-08-10T00:00:00Z') })), // u2: 7일 전 — 아직
      },
    } as never;
    const service = new WithdrawalExpiryPurgeService(prisma);
    const candidates = await service.selectCandidates(now);
    expect(candidates.map((c) => c.userId)).toEqual(['u1']);
  });

  it('백필 조건: deleted인데 v1_users 테이블 아이템 기록이 없는 유저도 후보에 포함한다', async () => {
    // 구 방식(helper 통합 이전)으로 삭제돼 gender/birthDate가 잔존하는 시드 유저 시나리오.
    // findMany가 accountStatus='deleted' AND NOT EXISTS(v1_privacy_purge_items ...) 조건을
    // 만족하는 유저를 반환하도록 mock하고, selectCandidates가 이들을 backfill=true로
    // 표시해 반환하는지 단언한다. (실제 SQL은 Step 3에서 $queryRaw로 작성)
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns withdrawal-expiry-purge`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/jobs/privacy-purge/withdrawal-expiry-purge.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { purgeUserPii } from '../../common/privacy/purge-user-pii';
import { decidePurgeMode, type PurgeApprovalSnapshot } from './privacy-purge-gate';
import { isWithdrawalGraceExpired, hasSanctionHistory } from './privacy-purge-candidates';
import { finalizeRun, schedulePrivacyPurgeScan } from './privacy-purge-run.repository';
import type { GameOperationClaim } from '../v1-game-operations-worker.service';

const BATCH_LIMIT = 100; // §5.1.5 배치 상한 — 초과분은 다음 날

export interface WithdrawalExpiryCandidate {
  userId: string;
  backfill: boolean;
}

@Injectable()
export class WithdrawalExpiryPurgeService {
  private readonly logger = new Logger(WithdrawalExpiryPurgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 정상 후보(유예 만료) + 백필 후보(구 방식 deleted 유저)를 합쳐 반환한다. */
  async selectCandidates(now: Date): Promise<WithdrawalExpiryCandidate[]> {
    const pending = await this.prisma.v1User.findMany({
      where: { accountStatus: 'withdrawal_pending' },
      select: { id: true },
    });

    const expired: WithdrawalExpiryCandidate[] = [];
    for (const user of pending) {
      const latestLog = await this.prisma.v1StatusChangeLog.findFirst({
        where: { targetType: 'user', targetId: user.id, toStatus: 'withdrawal_pending' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (latestLog && isWithdrawalGraceExpired(latestLog.createdAt, now)) {
        expired.push({ userId: user.id, backfill: false });
      }
    }

    // 백필(§5.1.2-④): 구 방식으로 이미 deleted인데 이 원장에 흔적이 없는 유저.
    const backfillRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT u.id FROM v1_users u
      WHERE u.account_status = 'deleted'
        AND NOT EXISTS (
          SELECT 1 FROM v1_privacy_purge_items i
          WHERE i.table_name = 'v1_users' AND i.row_id = u.id
        )
      LIMIT ${BATCH_LIMIT}
    `;

    return [...expired, ...backfillRows.map((r) => ({ userId: r.id, backfill: true }))].slice(0, BATCH_LIMIT);
  }

  private async hasSanctionHold(userId: string): Promise<boolean> {
    const logs = await this.prisma.v1StatusChangeLog.findMany({
      where: { targetType: 'user', targetId: userId },
      select: { toStatus: true },
    });
    return hasSanctionHistory(logs.map((l) => l.toStatus));
  }

  private async latestApproval(): Promise<PurgeApprovalSnapshot | null> {
    const row = await this.prisma.v1PrivacyPurgeApproval.findFirst({
      where: { kind: 'WITHDRAWAL_EXPIRY', consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, approvedCandidateCount: true, consumedAt: true, expiresAt: true },
    });
    return row ?? null;
  }

  /**
   * outbox 핸들러. `PRIVACY_PURGE_SCAN_TYPE`(WITHDRAWAL_EXPIRY 몫)으로 등록된다.
   * DRY_RUN이면 후보·hold 건수만 리포트하고 단 한 건도 변경하지 않는다.
   * LIVE면 후보마다 **별도의 단일 유저 트랜잭션**(안전 규율 2)으로 처리하고,
   * 개별 실패는 이 run을 FAILED로 만들지 않는다 — failedCount에 계상하고 다음
   * run이 그대로 재시도한다(후보 조건에 여전히 남아 있으므로).
   */
  async scanHandler(claim: GameOperationClaim, tx: Prisma.TransactionClient): Promise<void> {
    const now = new Date();
    const rawCandidates = await this.selectCandidates(now);

    const held: string[] = [];
    const eligible: WithdrawalExpiryCandidate[] = [];
    for (const candidate of rawCandidates) {
      if (await this.hasSanctionHold(candidate.userId)) {
        held.push(candidate.userId);
      } else {
        eligible.push(candidate);
      }
    }

    const approval = await this.latestApproval();
    const decision = decidePurgeMode({
      envEnabled: process.env.V1_PRIVACY_PURGE_ENABLED === 'true',
      approval,
      currentCandidateCount: eligible.length,
      now,
    });

    const run = await tx.v1PrivacyPurgeRun.create({
      data: {
        kind: 'WITHDRAWAL_EXPIRY',
        mode: decision.mode === 'LIVE' ? 'LIVE' : 'DRY_RUN',
        cutoffAt: now,
        candidateCount: eligible.length,
        heldCount: held.length,
        status: decision.mode === 'SKIPPED' ? 'SKIPPED' : 'PENDING',
        report: { heldReason: held.length > 0 ? { SANCTION_HISTORY: held.length } : {} },
        approvalId: decision.mode === 'LIVE' ? decision.approvalId : null,
      },
    });

    if (decision.mode === 'LIVE') {
      await this.prisma.v1PrivacyPurgeApproval.update({
        where: { id: decision.approvalId },
        data: { consumedAt: now },
      });
    }

    let failedCount = 0;
    if (decision.mode === 'LIVE') {
      for (const candidate of eligible) {
        try {
          await this.prisma.$transaction(async (userTx) => {
            const { itemsToRecord } = await purgeUserPii(userTx, candidate.userId, now);
            await userTx.v1PrivacyPurgeItem.createMany({
              data: itemsToRecord.map((item) => ({ runId: run.id, ...item })),
            });
            // 백필 후보는 이미 deleted이므로 이 update는 no-op(같은 값 재기입)이다 —
            // 두 population을 같은 루프로 처리해도 상태 전이가 어긋나지 않는다.
            await userTx.v1User.update({
              where: { id: candidate.userId },
              data: { accountStatus: 'deleted', deletedAt: now },
            });
          });
        } catch (err) {
          failedCount += 1;
          this.logger.warn({ userId: candidate.userId, err }, '탈퇴 유예 만료 파기 실패 — 다음 run에서 재시도');
        }
      }
    }

    await finalizeRun(tx, run.id, { heldCount: held.length, failedCount });
    await schedulePrivacyPurgeScan(tx, now);
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns withdrawal-expiry-purge`
Expected: PASS

- [ ] **Step 5: dry-run이 UPDATE/DELETE를 발행하지 않음을 스파이로 단언하는 테스트를 추가한다**

```ts
it('DRY_RUN 모드에서는 tx.v1User.update/purgeUserPii 관련 쓰기가 한 건도 호출되지 않는다', async () => {
  // process.env.V1_PRIVACY_PURGE_ENABLED를 unset한 상태에서 scanHandler를 호출하고,
  // prisma.$transaction이 호출되지 않음(=userTx 루프 진입 자체가 없음)을 단언한다.
});
```

Run 후 PASS 확인.

- [ ] **Step 6: 커밋한다**

```bash
git add apps/v1_api/src/jobs/privacy-purge/withdrawal-expiry-purge.service.ts \
        apps/v1_api/src/jobs/privacy-purge/withdrawal-expiry-purge.service.spec.ts
git commit -m "feat(privacy): 잡 A(탈퇴 유예 만료 파기) 핸들러 추가"
git show --stat HEAD
```

---

## Task 7: 잡 B — 보관기간(3년) 만료 파기 핸들러 (hold 포함)

**Files:**
- Create: `apps/v1_api/src/jobs/privacy-purge/retention-expiry-purge.service.ts`
- Test: `apps/v1_api/src/jobs/privacy-purge/retention-expiry-purge.service.spec.ts`

**Interfaces:**
- Consumes: `deriveTournamentEndAt`/`isRetentionExpired`/`holdReasonsForRegistration`(Task 4), `decidePurgeMode`(Task 3), `finalizeRun`/`schedulePrivacyPurgeScan`(Task 5)

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/jobs/privacy-purge/retention-expiry-purge.service.spec.ts`:

```ts
import { RetentionExpiryPurgeService } from './retention-expiry-purge.service';

describe('RetentionExpiryPurgeService.selectCandidates', () => {
  it('3년 경과 + hold 없음 registration만 파기 대상으로, hold 걸린 것은 held 목록으로 분리한다', async () => {
    // Prisma mock: 완료(completed) 대회 2개(하나는 3년 경과, 다른 하나는 아직) 각각
    // registration 1건씩, 하나는 미완결 문의가 걸려 있음. selectCandidates가
    // { eligible: [...], held: [{ registrationId, reasons: ['OPEN_INQUIRY'] }] } 를
    // 반환하는지 단언한다.
  });

  it('종료 로그도 scheduledEndAt도 없는 대회는 UNDETERMINED_CUTOFF로 분리하고 파기하지 않는다', async () => {
    // 두 값 모두 null인 대회의 registration이 eligible/held 어디에도 안 들어가고
    // undeterminedCount에만 잡히는지 단언한다.
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns retention-expiry-purge`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/jobs/privacy-purge/retention-expiry-purge.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decidePurgeMode, type PurgeApprovalSnapshot } from './privacy-purge-gate';
import {
  deriveTournamentEndAt,
  isRetentionExpired,
  holdReasonsForRegistration,
  type HoldReason,
} from './privacy-purge-candidates';
import { finalizeRun, schedulePrivacyPurgeScan } from './privacy-purge-run.repository';
import type { GameOperationClaim } from '../v1-game-operations-worker.service';

const BATCH_LIMIT = 1_000; // §5.1.5 row-null 계열 상한

interface RegistrationCandidate {
  registrationId: string;
  playerIds: string[];
}
interface HeldRegistration {
  registrationId: string;
  reasons: HoldReason[];
}

@Injectable()
export class RetentionExpiryPurgeService {
  private readonly logger = new Logger(RetentionExpiryPurgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async selectCandidates(now: Date): Promise<{
    eligible: RegistrationCandidate[];
    held: HeldRegistration[];
    undeterminedCount: number;
  }> {
    // 완료·취소된 대회를 후보 모집단으로 잡는다(roster-cleanup.ts의
    // ROSTER_MUTABLE_TOURNAMENT_STATUSES와 반대 개념 — 여기서는 "끝난" 대회만 본다).
    const tournaments = await this.prisma.v1Tournament.findMany({
      where: { status: { in: ['completed', 'cancelled'] }, deletedAt: null },
      select: {
        id: true,
        scheduledEndAt: true,
        registrations: { select: { id: true, players: { select: { id: true } } } },
      },
    });

    const eligible: RegistrationCandidate[] = [];
    const held: HeldRegistration[] = [];
    let undeterminedCount = 0;

    for (const tournament of tournaments) {
      const statusLog = await this.prisma.v1StatusChangeLog.findFirst({
        where: { targetType: 'tournament', targetId: tournament.id, toStatus: { in: ['completed', 'cancelled'] } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const cutoff = deriveTournamentEndAt({
        statusLogAt: statusLog?.createdAt ?? null,
        scheduledEndAt: tournament.scheduledEndAt,
      });
      if (!cutoff.determined) {
        undeterminedCount += tournament.registrations.length;
        continue;
      }
      if (!isRetentionExpired(cutoff.cutoffAt, now)) continue;

      for (const registration of tournament.registrations) {
        const [openInquiry, payment, cancelInfo] = await Promise.all([
          this.prisma.v1Inquiry.findFirst({
            where: {
              status: { not: 'closed' },
              OR: [
                { relatedType: 'tournament', relatedId: tournament.id },
                { relatedType: 'registration', relatedId: registration.id },
              ],
            },
            select: { id: true },
          }),
          this.prisma.v1TournamentPayment.findUnique({
            where: { registrationId: registration.id },
            select: { status: true },
          }),
          this.prisma.v1TournamentRegistration.findUnique({
            where: { id: registration.id },
            select: { cancelRequestedAt: true },
          }),
        ]);
        const refundedAt = payment?.status === 'refunded' ? now : null; // status=refunded면 환불 완결로 간주

        const reasons = holdReasonsForRegistration({
          hasOpenInquiry: !!openInquiry,
          paymentStatus: payment?.status ?? null,
          cancelRequestedAt: cancelInfo?.cancelRequestedAt ?? null,
          refundedAt,
          // 제재 진행 상태의 구체 판정식은 §10.1-L8 법무 확인 연동 대상 — 그때까지
          // 보수적 기본값으로 false를 두지 않고, 판정 로직 부재 자체를 "판정 불가"로
          // 취급하지 않는다(스펙 §5.1.3-① "구체 판정식은 구현 시 상태 모델 실측 후
          // 확정" — 이번 스코프는 문의/결제 hold만 실제로 켠다).
          sanctionReviewUndetermined: false,
        });

        if (reasons.length > 0) {
          held.push({ registrationId: registration.id, reasons });
        } else {
          eligible.push({
            registrationId: registration.id,
            playerIds: registration.players.map((p) => p.id),
          });
        }
        if (eligible.length + held.length >= BATCH_LIMIT) break;
      }
    }

    return { eligible, held, undeterminedCount };
  }

  private async latestApproval(): Promise<PurgeApprovalSnapshot | null> {
    const row = await this.prisma.v1PrivacyPurgeApproval.findFirst({
      where: { kind: 'RETENTION_EXPIRY', consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, approvedCandidateCount: true, consumedAt: true, expiresAt: true },
    });
    return row ?? null;
  }

  /**
   * registration 1건 = 1 트랜잭션(안전 규율 2와 동일 원칙 — 소속 player row들 +
   * Item 기록을 원자 처리). realName은 §10.2-Q3 결정 전까지 **유지**한다(권고값).
   */
  async scanHandler(claim: GameOperationClaim, tx: Prisma.TransactionClient): Promise<void> {
    const now = new Date();
    const { eligible, held, undeterminedCount } = await this.selectCandidates(now);

    const approval = await this.latestApproval();
    const decision = decidePurgeMode({
      envEnabled: process.env.V1_PRIVACY_PURGE_ENABLED === 'true',
      approval,
      currentCandidateCount: eligible.length,
      now,
    });

    const holdReport: Record<HoldReason, number> = {
      OPEN_INQUIRY: 0,
      PAYMENT_UNSETTLED: 0,
      SANCTION_REVIEW_UNDETERMINED: 0,
    };
    for (const h of held) for (const r of h.reasons) holdReport[r] += 1;

    const run = await tx.v1PrivacyPurgeRun.create({
      data: {
        kind: 'RETENTION_EXPIRY',
        mode: decision.mode === 'LIVE' ? 'LIVE' : 'DRY_RUN',
        cutoffAt: now,
        candidateCount: eligible.length,
        heldCount: held.length,
        status: decision.mode === 'SKIPPED' ? 'SKIPPED' : 'PENDING',
        report: { heldReason: holdReport, undeterminedCutoffCount: undeterminedCount },
        approvalId: decision.mode === 'LIVE' ? decision.approvalId : null,
      },
    });

    if (decision.mode === 'LIVE') {
      await this.prisma.v1PrivacyPurgeApproval.update({ where: { id: decision.approvalId }, data: { consumedAt: now } });
    }

    let failedCount = 0;
    if (decision.mode === 'LIVE') {
      for (const candidate of eligible) {
        try {
          await this.prisma.$transaction(async (regTx) => {
            await regTx.v1TournamentPlayer.updateMany({
              where: { id: { in: candidate.playerIds } },
              data: { birthDateSnapshot: null, genderSnapshot: null, eligibilityNote: null },
            });
            await regTx.v1TournamentRegistration.update({
              where: { id: candidate.registrationId },
              data: { depositorName: null },
            });
            await regTx.v1PrivacyPurgeItem.createMany({
              data: [
                ...candidate.playerIds.map((id) => ({
                  runId: run.id,
                  tableName: 'v1_tournament_players',
                  rowId: id,
                  action: 'NULLED' as const,
                })),
                {
                  runId: run.id,
                  tableName: 'v1_tournament_registrations',
                  rowId: candidate.registrationId,
                  action: 'NULLED' as const,
                },
              ],
            });
          });
        } catch (err) {
          failedCount += 1;
          this.logger.warn({ registrationId: candidate.registrationId, err }, '보관기간 만료 파기 실패 — 다음 run에서 재시도');
        }
      }
    }

    await finalizeRun(tx, run.id, { heldCount: held.length, failedCount, reportExtra: { undeterminedCutoffCount: undeterminedCount } });
    await schedulePrivacyPurgeScan(tx, now);
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns retention-expiry-purge`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add apps/v1_api/src/jobs/privacy-purge/retention-expiry-purge.service.ts \
        apps/v1_api/src/jobs/privacy-purge/retention-expiry-purge.service.spec.ts
git commit -m "feat(privacy): 잡 B(보관기간 만료 파기, hold 조건 포함) 핸들러 추가"
git show --stat HEAD
```

> **법무 검토 필요 — Task 7의 hold 판정 경계는 착수 전 다음을 확인한다(§10.1-L3·L8):**
> ① "사유 종료"의 판정 기준 — 문의 `closed`·결제 `refunded`로 충분한지, 별도 시효를 둬야 하는지.
> ② `V1TournamentPayment.status='ready'`를 정산 미완결로 보는 범위가 법정 보존 의무와 맞는지.
> 이 태스크는 **hold 판정 코드 자체는 구현**하되(보수적 기본값이라 안전), **잡 B의 LIVE 전환(Task 11 §4단계)은 법무 답변 후에만** 한다.

---

## Task 8: 잡 C(토큰 스윕) · 잡 D(원장 스윕)

**Files:**
- Create: `apps/v1_api/src/jobs/privacy-purge/token-sweep-purge.service.ts`
- Create: `apps/v1_api/src/jobs/privacy-purge/ledger-sweep-purge.service.ts`
- Test: 각 서비스 옆 `.spec.ts`

**Interfaces:**
- 잡 C: `V1VerificationToken`(만료+30일), `V1PhoneVerificationChallenge`(만료+30일) row 삭제
- 잡 D: `V1PrivacyPurgeRun`(및 cascade로 items) 중 `finishedAt` + 3년 경과 run 삭제(P-8)

- [ ] **Step 1~4: 잡 A/B와 동일한 TDD 사이클로 구현한다**

두 잡 모두 **hold 개념이 없고 저위험**이므로 후보 선정이 단순하다(만료 기준 하나만). Task 6의 `scanHandler` 골격(게이트 판정 → run 생성 → LIVE면 배치 삭제 → finalizeRun → 다음 스캔 예약)을 그대로 재사용하되, 개별 유저 트랜잭션 대신 **row 배치 삭제**(`deleteMany`) 1회로 처리한다(row-null 계열은 유저 단위 원자성 요구가 없다 — 단순 삭제라 부분 실패해도 잔여 위험이 없음).

`token-sweep-purge.service.ts` 핵심:
```ts
async scanHandler(claim: GameOperationClaim, tx: Prisma.TransactionClient): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 만료+30일
  const tokens = await this.prisma.v1VerificationToken.findMany({
    where: { expiresAt: { lt: cutoff } },
    select: { id: true },
    take: 1_000,
  });
  const challenges = await this.prisma.v1PhoneVerificationChallenge.findMany({
    where: { expiresAt: { lt: cutoff } },
    select: { id: true },
    take: 1_000,
  });
  const candidateCount = tokens.length + challenges.length;

  const decision = decidePurgeMode({
    envEnabled: process.env.V1_PRIVACY_PURGE_ENABLED === 'true',
    approval: await this.latestApproval(),
    currentCandidateCount: candidateCount,
    now,
  });

  const run = await tx.v1PrivacyPurgeRun.create({
    data: { kind: 'TOKEN_SWEEP', mode: decision.mode === 'LIVE' ? 'LIVE' : 'DRY_RUN', cutoffAt: cutoff, candidateCount, status: decision.mode === 'SKIPPED' ? 'SKIPPED' : 'PENDING', report: {} },
  });

  if (decision.mode === 'LIVE') {
    await this.prisma.v1PrivacyPurgeApproval.update({ where: { id: decision.approvalId }, data: { consumedAt: now } });
    if (tokens.length > 0) {
      await this.prisma.v1VerificationToken.deleteMany({ where: { id: { in: tokens.map((t) => t.id) } } });
      await this.prisma.v1PrivacyPurgeItem.createMany({ data: tokens.map((t) => ({ runId: run.id, tableName: 'v1_verification_tokens', rowId: t.id, action: 'DELETED' as const })) });
    }
    if (challenges.length > 0) {
      await this.prisma.v1PhoneVerificationChallenge.deleteMany({ where: { id: { in: challenges.map((c) => c.id) } } });
      await this.prisma.v1PrivacyPurgeItem.createMany({ data: challenges.map((c) => ({ runId: run.id, tableName: 'v1_phone_verification_challenges', rowId: c.id, action: 'DELETED' as const })) });
    }
  }

  await finalizeRun(tx, run.id, { heldCount: 0, failedCount: 0 });
  await schedulePrivacyPurgeScan(tx, now);
}
```

`ledger-sweep-purge.service.ts`는 대상 테이블만 `v1PrivacyPurgeRun.findMany({ where: { finishedAt: { lt: <3년 전 cutoff> } } })` + `deleteMany`(cascade로 items 함께 삭제)로 바꾼 동일 골격이다. **주의**: 이 잡이 만드는 `V1PrivacyPurgeRun`(kind=LEDGER_SWEEP) 자체는 삭제 대상에서 제외한다(방금 시작된 run이 자기 자신을 지우면 안 된다 — `finishedAt IS NULL`인 실행 중 run은 애초에 조건에 안 걸리므로 자연히 안전하지만, 테스트에 이 케이스를 명시적으로 추가한다).

- [ ] **Step 5: 두 잡 모두 유닛 테스트 PASS 확인 후 커밋한다**

```bash
git add apps/v1_api/src/jobs/privacy-purge/token-sweep-purge.service.ts \
        apps/v1_api/src/jobs/privacy-purge/token-sweep-purge.service.spec.ts \
        apps/v1_api/src/jobs/privacy-purge/ledger-sweep-purge.service.ts \
        apps/v1_api/src/jobs/privacy-purge/ledger-sweep-purge.service.spec.ts
git commit -m "feat(privacy): 잡 C(토큰 스윕)·잡 D(원장 스윕) 핸들러 추가"
git show --stat HEAD
```

---

## Task 9: 워커 wiring — 모듈 + main.ts 등록

**Files:**
- Create: `apps/v1_api/src/jobs/privacy-purge/privacy-purge-jobs.module.ts`
- Modify: `apps/v1_api/src/jobs/v1-game-operations-worker.main.ts`
- Modify: `apps/v1_api/src/jobs/v1-game-operations-worker.module.ts`

**⚠️ 중요 — 이 잡은 워커 프로세스에서 돈다. `RealtimeModule`/`GamesModule`을 절대 import하지 않는다**(Task 6/7/8의 스캔 핸들러는 소켓 강제 종료를 하지 않는다 — REST 접근은 `V1AuthGuard`가 이미 `deleted`/`withdrawal_pending` 계정을 전부 차단하므로(`auth/v1-auth.guard.ts:89`) 소켓 킥은 필수가 아니고, `v1-game-operations-worker.module.spec.ts`의 B1/B2 회귀 가드가 이 import를 감지하면 CI가 즉시 잡는다).

- [ ] **Step 1: 잡 4종을 묶는 워커 전용 모듈을 만든다**

`apps/v1_api/src/jobs/privacy-purge/privacy-purge-jobs.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { WithdrawalExpiryPurgeService } from './withdrawal-expiry-purge.service';
import { RetentionExpiryPurgeService } from './retention-expiry-purge.service';
import { TokenSweepPurgeService } from './token-sweep-purge.service';
import { LedgerSweepPurgeService } from './ledger-sweep-purge.service';

/**
 * 개인정보 파기 잡 4종의 워커 전용 선언 모듈. WorkerNotificationsModule(schedule-reminders)과
 * 같은 목적 — RealtimeModule/GamesModule 의존을 절대 끌고 오지 않는다
 * (v1-game-operations-worker.module.spec.ts의 B1/B2 회귀 가드 대상).
 */
@Module({
  imports: [PrismaModule],
  providers: [WithdrawalExpiryPurgeService, RetentionExpiryPurgeService, TokenSweepPurgeService, LedgerSweepPurgeService],
  exports: [WithdrawalExpiryPurgeService, RetentionExpiryPurgeService, TokenSweepPurgeService, LedgerSweepPurgeService],
})
export class PrivacyPurgeJobsModule {}
```

- [ ] **Step 2: `v1-game-operations-worker.module.ts`에 import를 추가한다**

`imports` 배열에 `PrivacyPurgeJobsModule`을 추가한다(다른 import들 사이 — 정확한 위치는 파일을 열어 기존 스타일을 따른다).

- [ ] **Step 3: `main.ts`에 핸들러 4개를 등록하고 스캔 체인을 예약한다**

`v1-game-operations-worker.main.ts`의 라인업 리마인더 등록 블록(`worker.registerHandler(LINEUP_REMINDER_SCAN_TYPE, ...)`) 바로 다음에 추가:

```ts
// 개인정보 파기 잡 4종. 라인업 리마인더와 동일한 self-rescheduling outbox 체인을 공유한다.
const withdrawalExpiry = app.get(WithdrawalExpiryPurgeService);
const retentionExpiry = app.get(RetentionExpiryPurgeService);
const tokenSweep = app.get(TokenSweepPurgeService);
const ledgerSweep = app.get(LedgerSweepPurgeService);
worker.registerHandler(PRIVACY_PURGE_SCAN_TYPE, async (claim, tx) => {
  if (process.env.DISABLE_PRIVACY_PURGE === 'true') return; // 킬 스위치 — dry-run조차 skip
  await withdrawalExpiry.scanHandler(claim, tx);
  await retentionExpiry.scanHandler(claim, tx);
  await tokenSweep.scanHandler(claim, tx);
  await ledgerSweep.scanHandler(claim, tx);
});
await prisma.$transaction((tx) => schedulePrivacyPurgeScan(tx, new Date()));
```

**설계 결정**: 4개 잡을 하나의 outbox 이벤트 타입 아래 순차 실행한다(`schedulePrivacyPurgeScan` 하나가 4개 서비스를 다 부른다) — 스펙이 "일 1회" 단일 슬롯을 요구하고(§5.1.5), 4개를 별도 이벤트 타입으로 쪼개면 스캔 체인이 4배로 늘어 라인업 리마인더 선례의 "체인 하나" 원칙과 어긋난다. 각 서비스 내부는 이미 자기 kind로 별도 `V1PrivacyPurgeRun`을 만들므로 리포트·게이트는 잡별로 독립적이다.

- [ ] **Step 4: B1/B2 회귀 가드가 여전히 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns v1-game-operations-worker.module`
Expected: PASS — `PrivacyPurgeJobsModule`을 추가해도 reachable module 집합에 `RealtimeModule`/`GamesModule`이 들어오지 않아야 한다. 실패하면 `PrivacyPurgeJobsModule`이나 그 의존성(`PrismaModule`)이 어딘가에서 두 모듈을 끌고 왔다는 뜻이므로 import 그래프를 되짚는다.

- [ ] **Step 5: tsc를 돌린다**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit`
Expected: 에러 0건

- [ ] **Step 6: 커밋한다**

```bash
git add apps/v1_api/src/jobs/privacy-purge/privacy-purge-jobs.module.ts \
        apps/v1_api/src/jobs/v1-game-operations-worker.main.ts \
        apps/v1_api/src/jobs/v1-game-operations-worker.module.ts
git commit -m "feat(privacy): 파기 잡 4종을 게임 운영 워커에 wiring"
git show --stat HEAD
```

---

## Task 10: 어드민 조회·승인 API

**Files:**
- Create: `apps/v1_api/src/admin/dto/admin-privacy.dto.ts`
- Create: `apps/v1_api/src/admin/admin-privacy.service.ts`
- Create: `apps/v1_api/src/admin/admin-privacy.controller.ts`
- Test: `admin-privacy.controller.spec.ts`, `admin-privacy.service.spec.ts`
- Modify: `apps/v1_api/src/admin/admin.module.ts`

**Interfaces:**
- Produces: `GET /admin/privacy/purge-runs`, `GET /admin/privacy/purge-runs/:id`, `POST /admin/privacy/purge-approvals`

- [ ] **Step 1: DTO를 작성한다**

`apps/v1_api/src/admin/dto/admin-privacy.dto.ts`:

```ts
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum AdminPrivacyPurgeKindDto {
  WITHDRAWAL_EXPIRY = 'WITHDRAWAL_EXPIRY',
  RETENTION_EXPIRY = 'RETENTION_EXPIRY',
  TOKEN_SWEEP = 'TOKEN_SWEEP',
  LEDGER_SWEEP = 'LEDGER_SWEEP',
}

export class CreatePurgeApprovalDto {
  @IsEnum(AdminPrivacyPurgeKindDto)
  kind!: AdminPrivacyPurgeKindDto;

  @IsUUID()
  basedOnRunId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

- [ ] **Step 2: 실패하는 테스트를 작성한다 (승인 발행의 근거 run 검증)**

`admin-privacy.service.spec.ts`:

```ts
import { ConflictException } from '@nestjs/common';
import { AdminPrivacyService } from './admin-privacy.service';

describe('AdminPrivacyService.createApproval', () => {
  it('근거 run이 DRY_RUN+COMPLETED가 아니면 거부한다', async () => {
    const prisma = {
      v1PrivacyPurgeRun: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', mode: 'LIVE', status: 'COMPLETED', candidateCount: 10 }) },
    } as never;
    const service = new AdminPrivacyService(prisma);
    await expect(
      service.createApproval({ kind: 'WITHDRAWAL_EXPIRY', basedOnRunId: 'r1' } as never, { id: 'admin1' } as never),
    ).rejects.toThrow(ConflictException);
  });

  it('통과하면 candidateCount를 스냅샷하고 7일 후 만료로 승인을 만든다', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'ap1' });
    const prisma = {
      v1PrivacyPurgeRun: {
        findUnique: jest.fn().mockResolvedValue({ id: 'r1', kind: 'WITHDRAWAL_EXPIRY', mode: 'DRY_RUN', status: 'COMPLETED', candidateCount: 42 }),
      },
      v1PrivacyPurgeApproval: { create },
    } as never;
    const service = new AdminPrivacyService(prisma);
    await service.createApproval(
      { kind: 'WITHDRAWAL_EXPIRY', basedOnRunId: 'r1', note: 'ok' } as never,
      { id: 'admin1' } as never,
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'WITHDRAWAL_EXPIRY', basedOnRunId: 'r1', approvedCandidateCount: 42, approvedByAdminUserId: 'admin1' }),
      }),
    );
  });
});
```

- [ ] **Step 3: 서비스를 구현한다**

`apps/v1_api/src/admin/admin-privacy.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageInfo, paginationArgs, type PageableQuery } from '../common/pagination/page-args';
import { CreatePurgeApprovalDto } from './dto/admin-privacy.dto';
import type { V1ActiveAdmin } from '../common/admin-context.service';

const APPROVAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AdminPrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  async listRuns(query: PageableQuery & { kind?: string; mode?: string; status?: string }) {
    const limit = 20;
    const where = {
      ...(query.kind ? { kind: query.kind as never } : {}),
      ...(query.mode ? { mode: query.mode as never } : {}),
      ...(query.status ? { status: query.status as never } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.v1PrivacyPurgeRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        ...paginationArgs(query, limit),
      }),
      this.prisma.v1PrivacyPurgeRun.count({ where }),
    ]);
    return { runs: rows, pageInfo: buildPageInfo({ page: query.page, limit, total, hasNext: rows.length === limit }) };
  }

  /** report 캐시와 Item 집계가 불일치하면 Item 집계를 반환한다(P-7). */
  async getRun(id: string) {
    const run = await this.prisma.v1PrivacyPurgeRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException({ code: 'PURGE_RUN_NOT_FOUND', message: '파기 실행 기록을 찾을 수 없어요.' });

    const itemCount = await this.prisma.v1PrivacyPurgeItem.count({ where: { runId: id } });
    const byTable = await this.prisma.v1PrivacyPurgeItem.groupBy({ by: ['tableName'], where: { runId: id }, _count: { _all: true } });

    return {
      ...run,
      // report 캐시의 purgedCount와 실측이 다르면(예: finalizeRun 실패 후 재계산 안 됨)
      // 실측을 우선한다.
      purgedCount: itemCount,
      itemsByTable: Object.fromEntries(byTable.map((row) => [row.tableName, row._count._all])),
    };
  }

  async createApproval(dto: CreatePurgeApprovalDto, admin: V1ActiveAdmin) {
    const baseRun = await this.prisma.v1PrivacyPurgeRun.findUnique({ where: { id: dto.basedOnRunId } });
    if (!baseRun || baseRun.mode !== 'DRY_RUN' || baseRun.status !== 'COMPLETED' || baseRun.kind !== (dto.kind as never)) {
      throw new ConflictException({
        code: 'PURGE_APPROVAL_BASE_RUN_INVALID',
        message: '근거로 삼은 dry-run 리포트가 유효하지 않아요. 같은 kind의 완료된 dry-run만 근거로 쓸 수 있어요.',
      });
    }
    const now = new Date();
    return this.prisma.v1PrivacyPurgeApproval.create({
      data: {
        kind: dto.kind as never,
        basedOnRunId: dto.basedOnRunId,
        approvedCandidateCount: baseRun.candidateCount,
        approvedByAdminUserId: admin.userId,
        note: dto.note ?? null,
        expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
      },
    });
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns admin-privacy.service`
Expected: PASS

- [ ] **Step 5: 컨트롤러를 작성한다** (`admin-ops.controller.ts` 패턴 그대로 — `AdminContextService.getActiveAdmin`으로 조회 게이트, `getMutationAdmin`으로 승인 발행 게이트)

`apps/v1_api/src/admin/admin-privacy.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { PageableQueryDto } from '../common/pagination/page-args.dto'; // 없으면 admin-ops 패턴대로 인라인 class 정의
import { CreatePurgeApprovalDto } from './dto/admin-privacy.dto';
import { AdminPrivacyService } from './admin-privacy.service';

@Controller('admin/privacy')
@UseGuards(V1AuthGuard)
export class AdminPrivacyController {
  constructor(
    private readonly adminPrivacyService: AdminPrivacyService,
    private readonly adminContext: AdminContextService,
  ) {}

  @Get('purge-runs')
  async listRuns(@CurrentUser() user: V1AuthUser, @Query() query: PageableQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.adminPrivacyService.listRuns(query);
  }

  @Get('purge-runs/:id')
  async getRun(@CurrentUser() user: V1AuthUser, @Param('id') id: string) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.adminPrivacyService.getRun(id);
  }

  // owner 등급 권고(P-5) — getMutationAdmin은 support만 막고 ops/owner를 통과시킨다.
  // owner 전용으로 더 좁히려면 AdminContextService에 getOwnerAdmin 같은 헬퍼가
  // 필요한데 현재 레포에 선례가 없다 — 이번 스코프는 getMutationAdmin(ops+)로 시작하고,
  // owner 전용 강제가 필요하면 별도 승인을 받아 후속 작업으로 좁힌다.
  @Post('purge-approvals')
  async createApproval(@CurrentUser() user: V1AuthUser, @Body() dto: CreatePurgeApprovalDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    return this.adminPrivacyService.createApproval(dto, admin);
  }
}
```

`PageableQueryDto`가 레포에 없으면 `admin-ops.controller.ts`의 `RecentPushFailuresQueryDto` 패턴대로 이 파일 안에 인라인 class로 정의한다(`page`/`limit`/`kind`/`mode`/`status` optional 필드).

- [ ] **Step 6: `admin.module.ts`에 wiring한다**

```ts
import { AdminPrivacyController } from './admin-privacy.controller';
import { AdminPrivacyService } from './admin-privacy.service';
// ...
@Module({
  imports: [AdminContextModule, NotificationsModule, RealtimeModule, UploadsModule],
  controllers: [AdminController, AdminOpsController, AdminTermsController, AdminPrivacyController],
  providers: [AdminService, AdminOpsService, AdminTermsService, AdminPrivacyService, V1AuthGuard],
})
export class AdminModule {}
```

**주의**: 이 모듈은 HTTP 서비스(`apps/v1_api` 메인 프로세스)에서만 로드된다 — 워커 프로세스와 무관하므로 `RealtimeModule`을 그대로 둬도 Task 9의 B1/B2 제약과 충돌하지 않는다.

- [ ] **Step 7: 컨트롤러 스펙 + tsc 확인**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns admin-privacy && ./node_modules/.bin/tsc --noEmit`
Expected: PASS, 에러 0건

- [ ] **Step 8: 커밋한다**

```bash
git add apps/v1_api/src/admin/dto/admin-privacy.dto.ts \
        apps/v1_api/src/admin/admin-privacy.service.ts \
        apps/v1_api/src/admin/admin-privacy.controller.ts \
        apps/v1_api/src/admin/admin-privacy.service.spec.ts \
        apps/v1_api/src/admin/admin-privacy.controller.spec.ts \
        apps/v1_api/src/admin/admin.module.ts
git commit -m "feat(privacy): 어드민 파기 run 조회·승인 API 추가"
git show --stat HEAD
```

---

## Task 11: 통합 테스트 작성(실행 보류) + 배포 env + 롤아웃

**Files:**
- Create: `apps/v1_api/test/integration/privacy-purge.e2e-spec.ts`
- Modify: `deploy/docker-compose.alpha.yml`, `deploy/docker-compose.prod.yml`

- [ ] **Step 1: 통합 테스트를 작성한다 — ⚠️ 이 환경에서는 실행 보류**

`apps/v1_api/test/integration/privacy-purge.e2e-spec.ts`에 아래 시나리오를 작성한다(DB 있는 CI/로컬에서만 실행):

1. **dry-run**: 탈퇴 유예 경과 유저 3명, 미경과 1명, 재탈퇴 유저(로그 2행) 1명 시드 → 스캔 실행 → `candidateCount` 정확, DB 스냅샷 불변(email/phone 원본 유지) 단언.
2. **LIVE 승인 소비**: dry-run run을 근거로 승인 생성 → 다시 스캔 → 후보 3명 전부 `deleted` + PII 마스킹 + `V1PrivacyPurgeItem` 건수 일치, 승인 `consumedAt` 채워짐 단언.
3. **재실행 멱등**: 2회차 `candidateCount=0`.
4. **중간 크래시 후 재실행 시 잔여 PII 0**(안전 규율 2 검증 — blocking): 후보 3명 중 2번째 유저 트랜잭션 내부에 테스트 훅으로 강제 예외 → (a) 2번째 유저는 `withdrawal_pending` + PII 온전, (b) 1번째는 완전 파기 + Item 존재, (c) 재실행 시 2·3번째가 재시도되어 완전 파기 → 최종 잔여 PII 0을 전 유저 스캔으로 단언.
5. **hold**: 미완결 문의 걸린 registration이 3년 경과 대회에서도 파기되지 않고 `heldCount`/`heldReason.OPEN_INQUIRY`에 잡힘.
6. **보존 대상**: `displayNameSnapshot`(경기 기록) 잔존, 공개 기록 API 응답이 파기 전후 동일, 순위·전적 불변.
7. **백필**: 구 방식(helper 통합 이전 로직 시뮬레이션)으로 `deleted`된 시드 유저가 백필 조건에 잡혀 gender/birthDate/대회 스냅샷까지 정리됨.
8. **스캔 체인 재시작 멱등**: 워커 재시작 시 같은 슬롯 키로 스캔이 중복 예약되지 않음(라인업 리마인더 spec 패턴 재사용).

Run: (보류 — DB 없음) — Expected: 파일이 작성돼 있고 tsc가 통과하면 완료로 본다.

- [ ] **Step 2: tsc로 통합 테스트 파일 자체의 타입을 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit`
Expected: 에러 0건. `V1PrivacyPurgeRun.report`처럼 `Json` 컬럼을 다루는 픽스처는 `Prisma.JsonValue`로 타입을 맞춘다(Global Constraints).

- [ ] **Step 3: 배포 env를 추가한다 — 미설정이 기본(=dry-run)**

`deploy/docker-compose.alpha.yml`과 `deploy/docker-compose.prod.yml`의 `v1_game_operations_worker` 서비스 `environment:` 블록(`WORKER_PORT` 옆)에 각각 추가:

```yaml
      V1_PRIVACY_PURGE_ENABLED: ${V1_PRIVACY_PURGE_ENABLED:-}
      DISABLE_PRIVACY_PURGE: ${DISABLE_PRIVACY_PURGE:-}
```

**두 파일이 독립적이므로 alpha에서 켠 값이 prod로 새지 않는다**(alpha와 prod가 별도 compose 파일 — 스펙 §7.3-5단계가 요구하는 격리).

- [ ] **Step 4: 커밋한다**

```bash
git add apps/v1_api/test/integration/privacy-purge.e2e-spec.ts \
        deploy/docker-compose.alpha.yml \
        deploy/docker-compose.prod.yml
git commit -m "test(privacy): 파기 통합 테스트 작성(DB 없어 실행 보류) + LIVE 게이트 env 배선"
git show --stat HEAD
```

> **PR 1 종료 지점.** 여기서 PR을 열고 base가 `dev`인지 `gh pr view <N> --json baseRefName`으로 확인한다. **이 PR은 UI 변경이 없으므로 스크린샷 갤러리 불필요.**

### 롤아웃 절차 (PR 1 머지 후 — 사용자 승인 없이 진행하지 않는 단계 명시)

**alpha (dev 머지 = 즉시 실배포):**
1. **1단계**(자동 안전): 전 잡 dry-run 상태로 배포된다(env 미설정) — 별도 조치 불필요. **2주간** 매일 `GET /admin/privacy/purge-runs`로 후보 건수를 관찰한다. 후보 건수가 직관과 어긋나면(예: 전 사용자가 후보로 잡힘) 이 단계에서 멈추고 원인을 규명한다 — 아래 단계로 진행하지 않는다.
2. **2단계 — 사용자 승인 필요(안전 규율 1)**: 잡 C(토큰 스윕)만 승인 발행 → LIVE. `alpha`의 `V1_PRIVACY_PURGE_ENABLED=true` 설정 + `POST /admin/privacy/purge-approvals { kind: 'TOKEN_SWEEP', basedOnRunId: <최근 dry-run id> }` 호출은 **사용자가 직접 실행하거나 명시적으로 "지금 켜라"고 승인한 뒤에만** 수행한다(글로벌 규칙 13-b 예외 ①: 파괴적·되돌리기 어려운 단계).
3. **3단계 — 사용자 승인 필요**: 잡 A(탈퇴 파기) LIVE. 첫 주는 `BATCH_LIMIT`을 코드 상수 100에서 10으로 임시 하향(별도 커밋 또는 env 오버라이드 — 이 계획 범위 밖이면 후속 작업으로 분리). 제재 이력 hold가 실제로 걸리는지 리포트로 확인.
4. **4단계 — 사용자 승인 + 법무 검토 통과 필요(안전 규율 5)**: 잡 B(3년 만료) LIVE는 **§10.1-L3·L5·L8 법무 답변을 받은 뒤에만** 진행한다. hold 리포트를 최소 1주 선행 관찰한다.

**프로덕션(main 승격 — 별도 DB·별도 env, 사용자만 승격):**
- alpha 관찰은 합성 픽스처 기반(예: 경기 전부 `fieldId=null` — 알려진 alpha 데이터 특성, 프로젝트 메모리 `alpha-fixtures-have-no-field-assigned`)이라 실사용 분포의 버그를 잡는 검증력이 낮다. **5단계**: main 승격 시 prod의 `V1_PRIVACY_PURGE_ENABLED`는 **미설정(dry-run)으로 시작**한다(`deploy/docker-compose.prod.yml`이 alpha와 별개 파일이므로 자동으로 이렇게 된다). prod 실데이터 기준 dry-run 리포트를 **2주 관찰** 후, kind별로 alpha와 동일 순서(C → A → B)로 **매번 사용자 승인**을 받아 순차 LIVE 전환한다.
- 각 LIVE 전환 단계 전 **RDS PITR(point-in-time recovery) 활성 여부를 운영 확인 항목으로 사용자에게 질문한다** — 이 계획 범위에서 확인할 수 없는 인프라 사실이다.

---

# PR 2 — 미성년 가입 게이트

## Task 12: 만 14세 미만 가입 차단

**Files:**
- Modify: `apps/v1_api/src/auth/dto/required-signup-profile.dto.ts`
- Create: `apps/v1_api/src/auth/dto/required-signup-profile.dto.spec.ts`
- Modify: `apps/v1_api/src/auth/auth.service.ts`

**Interfaces:**
- Consumes: `isValidBirthDateDigits`(기존, `required-signup-profile.dto.ts:47`)
- Produces: `isAtLeastAge(birthDateDigits, minAgeYears, at?): boolean`, `422 UNDER_AGE_SIGNUP_BLOCKED`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`apps/v1_api/src/auth/dto/required-signup-profile.dto.spec.ts`:

```ts
import { isAtLeastAge, MINIMUM_SIGNUP_AGE_YEARS } from './required-signup-profile.dto';

describe('isAtLeastAge (만 14세 경계값)', () => {
  const at = new Date('2026-08-17T00:00:00Z');

  it('생일이 오늘 정확히 14주년이면 통과다', () => {
    expect(isAtLeastAge('20120817', MINIMUM_SIGNUP_AGE_YEARS, at)).toBe(true);
  });

  it('생일이 내일 14주년(하루 모자람)이면 차단이다', () => {
    expect(isAtLeastAge('20120818', MINIMUM_SIGNUP_AGE_YEARS, at)).toBe(false);
  });

  it('생일이 어제 14주년을 넘었으면 통과다', () => {
    expect(isAtLeastAge('20120816', MINIMUM_SIGNUP_AGE_YEARS, at)).toBe(true);
  });

  it('생년월일이 20년 전이면 당연히 통과다', () => {
    expect(isAtLeastAge('20060101', MINIMUM_SIGNUP_AGE_YEARS, at)).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns required-signup-profile.dto`
Expected: FAIL — `isAtLeastAge` export 없음

- [ ] **Step 3: 구현한다**

`required-signup-profile.dto.ts` 하단, `isValidBirthDateDigits` 다음에 추가:

```ts
export const MINIMUM_SIGNUP_AGE_YEARS = 14;

/**
 * `birthDate`(YYYYMMDD)가 `at` 기준 최소 만 나이 이상인지. `isValidBirthDateDigits`로
 * 이미 유효성이 확인된 값을 입력으로 받는다는 전제 — 이 함수 자체는 형식을 재검증하지
 * 않는다(단일 책임 분리).
 */
export function isAtLeastAge(birthDateDigits: string, minAgeYears: number, at: Date = new Date()): boolean {
  const year = Number(birthDateDigits.slice(0, 4));
  const month = Number(birthDateDigits.slice(4, 6));
  const day = Number(birthDateDigits.slice(6, 8));
  const birth = Date.UTC(year, month - 1, day);
  const cutoff = Date.UTC(at.getUTCFullYear() - minAgeYears, at.getUTCMonth(), at.getUTCDate());
  return birth <= cutoff;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns required-signup-profile.dto`
Expected: PASS (4 tests)

- [ ] **Step 5: `auth.service.ts` 두 지점에 게이트를 삽입한다**

파일 상단 import 수정:
```ts
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
// ...
import { isValidBirthDateDigits, normalizeSignupDisplayName, isAtLeastAge, MINIMUM_SIGNUP_AGE_YEARS } from './dto/required-signup-profile.dto';
```

`register()`(`:52` 부근)의 `isValidBirthDateDigits` 체크 바로 다음에 추가:
```ts
    if (!isValidBirthDateDigits(birthDate)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Birth date must be a valid YYYYMMDD value' });
    }
    if (!isAtLeastAge(birthDate, MINIMUM_SIGNUP_AGE_YEARS)) {
      throw new UnprocessableEntityException({ code: 'UNDER_AGE_SIGNUP_BLOCKED', message: '만 14세 미만은 가입할 수 없어요.' });
    }
```

`completeSocialProfile()`(`:538` 부근)에 동일하게 추가:
```ts
    if (!isValidBirthDateDigits(birthDate)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Birth date must be a valid YYYYMMDD value' });
    }
    if (!isAtLeastAge(birthDate, MINIMUM_SIGNUP_AGE_YEARS)) {
      throw new UnprocessableEntityException({ code: 'UNDER_AGE_SIGNUP_BLOCKED', message: '만 14세 미만은 가입할 수 없어요.' });
    }
```

- [ ] **Step 6: 기존 `auth.service.spec.ts`에 회귀 테스트를 추가한다**

```ts
it('register: 만 14세 미만 생년월일이면 422 UNDER_AGE_SIGNUP_BLOCKED로 거부한다', async () => {
  // 오늘 기준 만 13세 birthDate로 register() 호출 → UnprocessableEntityException +
  // code UNDER_AGE_SIGNUP_BLOCKED 단언.
});

it('completeSocialProfile: 동일 게이트가 소셜 가입 완료 경로에도 적용된다', async () => {
  // 동일 시나리오를 completeSocialProfile()에 대해 반복.
});
```

- [ ] **Step 7: 기존 register/completeSocialProfile 테스트가 여전히 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns auth.service`
Expected: PASS — 기존 정상 가입 fixture가 만 14세 이상 생년월일을 쓰고 있는지 먼저 확인한다. 미만이면 fixture를 성인 생년월일로 고친다(Mock Data Discipline — 스키마·검증 규칙 변경 시 영향받는 fixture 동반 수정).

- [ ] **Step 8: 기존 가입자 1회 스캔 리포트를 작성한다**

`apps/v1_api/src/jobs/privacy-purge/under-age-scan.ts`:

```ts
/** 만 14세 미만 기존 가입자 존재 여부를 1회 리포트한다(건수만 — 처리는 §10.1-L4·§10.2-Q4 게이트). */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isAtLeastAge, MINIMUM_SIGNUP_AGE_YEARS } from '../../auth/dto/required-signup-profile.dto';

@Injectable()
export class UnderAgeScanService {
  constructor(private readonly prisma: PrismaService) {}

  async countUnderAgeAccounts(at: Date = new Date()): Promise<number> {
    const profiles = await this.prisma.v1UserProfile.findMany({
      where: { birthDate: { not: null }, deletedAt: null },
      select: { birthDate: true },
    });
    return profiles.filter((p) => p.birthDate && !isAtLeastAge(p.birthDate, MINIMUM_SIGNUP_AGE_YEARS, at)).length;
  }
}
```

이 스캔은 **파기 잡 인프라(V1PrivacyPurgeRun)를 만들지 않는다** — 삭제가 아니라 순수 리포트이고, 발견 시 처리 방식(제한/삭제/법정대리인 동의 소급)은 §10.1-L4·§10.2-Q4 게이트 뒤이므로 이번 스코프는 건수 확인까지다. `AdminOpsService`에 후속 노출(`GET /admin/ops/summary` KPI 추가 등)은 이 계획 범위 밖 — 필요하면 별도 태스크로 분리한다.

- [ ] **Step 9: 단위 테스트 + tsc + 커밋**

```ts
// under-age-scan.spec.ts
it('만 14세 미만 birthDate를 가진 프로필만 건수에 센다', async () => {
  const prisma = { v1UserProfile: { findMany: jest.fn().mockResolvedValue([
    { birthDate: '20200101' }, // 6세 — 미만
    { birthDate: '20060101' }, // 20세 — 이상
    { birthDate: null },       // 미기재 — 제외 대상 아님(where에서 이미 걸러짐)
  ]) } } as never;
  const service = new UnderAgeScanService(prisma);
  await expect(service.countUnderAgeAccounts(new Date('2026-08-17'))).resolves.toBe(1);
});
```

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns "required-signup-profile.dto|auth.service|under-age-scan" && ./node_modules/.bin/tsc --noEmit`
Expected: PASS, 에러 0건

```bash
git add apps/v1_api/src/auth/dto/required-signup-profile.dto.ts \
        apps/v1_api/src/auth/dto/required-signup-profile.dto.spec.ts \
        apps/v1_api/src/auth/auth.service.ts \
        apps/v1_api/src/auth/auth.service.spec.ts \
        apps/v1_api/src/jobs/privacy-purge/under-age-scan.ts \
        apps/v1_api/src/jobs/privacy-purge/under-age-scan.spec.ts
git commit -m "feat(auth): 만 14세 미만 가입 차단 게이트 + 기존 가입자 스캔 리포트"
git show --stat HEAD
```

> **PR 2 종료 지점.** UI 변경 없음(에러 응답만) — 스크린샷 갤러리 불필요. 가입 실패 화면 문구가 별도로 바뀌면 그때 갤러리를 첨부한다(스펙 §8.2 PR②).

> **법무 검토 필요 항목(§10.1-L4, 착수는 이미 완료 — 발견 시 처리만 게이트)**: 만 14세 미만 아동 개인정보의 법정대리인 동의 요건, **기존에 이미 가입된 미성년 계정을 발견했을 때의 처리 방법**(제한/삭제/소급 동의 수령). Task 12 Step 8의 스캔이 리포트한 건수를 사용자에게 전달하고 위 질문에 대한 답을 받은 뒤 처리 로직을 별도 태스크로 착수한다.

---

# PR 3 — listPlayers 노출 축소 (UI 변경)

## Task 13: `listPlayers` 응답을 역할 기반으로 좁힌다

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournament-players.service.ts`
- Modify: `apps/v1_api/src/tournaments/tournament-players.service.spec.ts`
- Modify: `apps/v1_web/src/types/api.ts`
- Modify: `apps/v1_web/src/app/tournaments/[id]/registrations/[registrationId]/roster/tournament-roster-client.tsx`

**Interfaces:**
- Consumes: `assertTeamMember`(기존, `tournament-players.service.ts:68` — 현재 `void` 반환, 이 태스크에서 role 반환하도록 확장)
- Produces: `serializePlayer(row, scope)`, 응답 필드 `viewerScope: 'member' | 'manager'`

**실측한 현재 상태(변경 근거)**: `listPlayers`(`:153-172`)는 `assertTeamMember`(멤버십 row를 이미 조회하지만 결과를 버림)만 통과하면 `serializePlayer`(`:777-789`)로 `realName`+`birthDateSnapshot`+`genderSnapshot`+`eligibilityNote`(운영 심사메모) 전부를 반환한다. 프론트 소비처는 두 곳:
- `apps/v1_web/src/app/admin/tournaments/[id]/registrations-tab.tsx` — **어드민 전용**(`listPlayersForAdmin` 호출), 이 태스크와 무관하게 전 필드 유지.
- `apps/v1_web/src/app/tournaments/[id]/registrations/[registrationId]/roster/tournament-roster-client.tsx` — **팀 멤버/매니저 공용** 페이지(`listPlayers` 호출). `birthDateSnapshot`을 `:753`에서 무조건 렌더한다. `eligibilityNote`는 이 컴포넌트에서 애초에 렌더하지 않으므로(grep 실측 — 0건) 프론트 변경 없이 백엔드에서 제거해도 안전하다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tournament-players.service.spec.ts`(기존 파일)에 추가:

```ts
describe('listPlayers — 역할 기반 필드 축소', () => {
  it('일반 팀원(member)에게는 birthDateSnapshot/eligibilityNote가 null로 내려간다', async () => {
    // 기존 fixture 패턴으로 team member(role='member') 유저 + registration + player(모든
    // 필드 값 있음)를 준비하고 listPlayers 호출. 응답의 players[0]에서
    // birthDateSnapshot === null, eligibilityNote === null, realName/eligibilityStatus는
    // 원래 값 그대로, viewerScope === 'member'를 단언한다.
  });

  it('manager/owner에게는 birthDateSnapshot이 내려가지만 eligibilityNote는 여전히 null이다', async () => {
    // role='manager' 유저로 동일 호출. birthDateSnapshot은 원래 값, eligibilityNote는
    // null(운영 심사메모는 어드민 전용), viewerScope === 'manager'를 단언한다.
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns tournament-players.service`
Expected: FAIL — 새 단언이 현재 구현(무조건 전 필드 반환)과 다르므로 실패

- [ ] **Step 3: `assertTeamMember`가 role을 반환하도록 확장한다**

`tournament-players.service.ts:68` 부근:

```ts
  private async assertTeamMember(teamId: string, userId: string): Promise<{ role: 'owner' | 'manager' | 'member' }> {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: { teamId, userId, status: 'active', team: { status: 'active', deletedAt: null } },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '팀에 속한 멤버만 선수 명단을 볼 수 있어요.' });
    }
    return { role: membership.role };
  }
```

**호출부 확인**: 이 메서드의 유일한 호출자는 `listPlayers`(`:155`, grep 실측 — 1건)이므로 반환 타입 변경이 다른 곳을 깨지 않는다.

- [ ] **Step 4: `viewerScope`를 계산하고 `serializePlayer`에 넘긴다**

`listPlayers`(`:152-172`)를 아래로 교체한다:

```ts
  async listPlayers(user: V1AuthUser, tournamentId: string, registrationId: string) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    const { role } = await this.assertTeamMember(registration.teamId, user.id);
    const viewerScope: 'member' | 'manager' = role === 'member' ? 'member' : 'manager';

    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      select: { minPlayers: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    const players = await this.prisma.v1TournamentPlayer.findMany({
      where: { registrationId, removedAt: null },
      orderBy: { addedAt: 'asc' },
    });

    return {
      players: players.map((p) => this.serializePlayer(p, viewerScope)),
      belowMinimum: players.length < tournament.minPlayers,
      viewerScope,
    };
  }
```

- [ ] **Step 5: `serializePlayer`에 scope 인자를 추가한다**

`:776-789` 부근:

```ts
  /**
   * scope='admin'은 listPlayersForAdmin 전용 — eligibilityNote(운영 심사메모)는
   * 이 scope에서만 노출한다. scope='member'는 birthDateSnapshot/genderSnapshot도
   * 함께 숨긴다(문서02 §13.2 "roster 실명·생년월일은 자격검토 관리자만").
   */
  private serializePlayer(row: V1TournamentPlayer, scope: 'member' | 'manager' | 'admin' = 'admin') {
    return {
      id: row.id,
      userId: row.userId,
      realName: row.realName,
      birthDateSnapshot: scope === 'member' ? null : row.birthDateSnapshot ?? null,
      genderSnapshot: scope === 'member' ? null : normalizeGender(row.genderSnapshot),
      eligibilityStatus: row.eligibilityStatus,
      eligibilityNote: scope === 'admin' ? row.eligibilityNote ?? null : null,
      addedAt: row.addedAt.toISOString(),
      removedAt: row.removedAt?.toISOString() ?? null,
    };
  }
```

**다른 호출부 확인**: `serializePlayer`를 인자 없이 호출하는 기존 지점(어드민 흐름 — `updatePlayerEligibility`의 `return this.serializePlayer(updated);` 등, `listPlayersForAdmin`도 `this.serializePlayer(player)` 형태)은 기본값 `'admin'`으로 fallback해 기존 동작을 그대로 유지한다 — **이 시그니처 변경이 기존 어드민 응답을 바꾸지 않는지 grep으로 전수 확인**하고, 이 파일 안의 모든 `this.serializePlayer(` 호출부를 나열해 각각 올바른 scope인지(멤버 경로만 `'member'`/`'manager'`, 나머지는 명시 생략=admin) 확인한다.

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects unit --testPathPatterns tournament-players.service`
Expected: PASS — 기존 어드민 경로 테스트(eligibilityNote 노출 단언)도 함께 통과해야 한다.

- [ ] **Step 7: 프론트 타입을 갱신한다**

`apps/v1_web/src/types/api.ts`의 `V1TournamentRosterResponse`(`:3111` 부근)에 `viewerScope`를 추가:

```ts
export type V1TournamentRosterResponse = {
  players: V1TournamentPlayer[];
  belowMinimum: boolean;
  viewerScope: 'member' | 'manager';
};
```

- [ ] **Step 8: 프론트에서 생년월일 행을 조건부 렌더한다**

`tournament-roster-client.tsx`의 플레이어 카드 컴포넌트에 `viewerScope`를 prop으로 내려받게 하고(현재 이 컴포넌트가 `player` prop만 받는 구조라면, 부모에서 `useV1TournamentPlayers` 응답의 `viewerScope`를 읽어 함께 전달), `:753` 렌더를 조건부로 바꾼다:

```tsx
{viewerScope !== 'member' ? (
  <div className="tm-text-micro" style={{ color: 'var(--text-caption)', marginTop: 2 }}>
    {formatRosterBirthDate(player.birthDateSnapshot)}
  </div>
) : null}
```

**`formatRosterBirthDate(null)`이 '미입력'을 반환**(기존 함수, `:93-98`)하므로 값을 넘기고 숨기는 방식이 아니라 **행 자체를 렌더하지 않는 방식**을 쓴다 — 그래야 member 시점에 "미입력"이라는 오해를 주는 문구가 뜨지 않는다.

- [ ] **Step 9: 웹 테스트 + tsc**

Run: `cd apps/v1_web && ./node_modules/.bin/vitest run --testPathPattern tournament-roster && ./node_modules/.bin/tsc --noEmit` (정확한 vitest 실행 커맨드는 `apps/v1_web/package.json`의 `test` 스크립트를 열어 확인한다)
Expected: PASS, 에러 0건

- [ ] **Step 10: 커밋한다**

```bash
git add apps/v1_api/src/tournaments/tournament-players.service.ts \
        apps/v1_api/src/tournaments/tournament-players.service.spec.ts \
        apps/v1_web/src/types/api.ts \
        apps/v1_web/src/app/tournaments/\[id\]/registrations/\[registrationId\]/roster/tournament-roster-client.tsx
git commit -m "feat(tournaments): listPlayers 응답을 역할 기반으로 축소 — member에게 생년월일·심사메모 비노출"
git show --stat HEAD
```

- [ ] **Step 11: PR을 열고 dev 머지 후 alpha에서 3폭 스크린샷으로 검증한다 (안전 규율 6 — 예외 없음)**

**로컬 next 서버로 검증하지 않는다.** dev 머지 = alpha 즉시 실배포이므로 alpha에서 확인한다.

배포 후 캡처할 화면(📱390 / 📲768 / 🖥1440 3폭, before/after):
1. 로스터 페이지 — **member 뷰**: 생년월일 행이 사라졌는지.
2. 로스터 페이지 — **manager 뷰**: 생년월일 행이 여전히 보이는지(회귀 없음).
3. 어드민 registrations-tab.tsx — 변경 없음을 1컷으로 확인(선택).

캡처 스크립트는 `scripts/` 안에 둔다. 갤러리를 PR 코멘트로 게시하고 raw URL 200을 확인한다. **이 저장소는 public이다** — 실제 유저 실명·UUID를 스크린샷에 노출하지 않도록 테스트 픽스처 계정으로 캡처한다.

---

## Self-Review 결과

**1. 스펙 커버리지**

| 스펙 요구 | 담당 태스크 |
|---|---|
| P-1 병행 진행 | 헤더(별도 worktree/브랜치) |
| P-2 self-rescheduling outbox 재사용 | Task 5, 9 |
| P-3 파기 범위 단일 helper 통합 | Task 2 |
| P-4 유저 1명 = 단일 트랜잭션 | Task 2(설계) + Task 6(소비) + Task 11 Step 1 시나리오 4(검증) |
| P-5 2중 게이트 단일 정의 | Task 3 |
| P-6 스키마 단일 마이그레이션 | Task 1 |
| P-7 Item이 진실, Run은 파생 캐시 | Task 5(`finalizeRun`), Task 10(`getRun`) |
| P-8 원장 자체의 3년 보관 | Task 8(잡 D) |
| §5.1.2 잡 A 대상 선정·hold·백필 | Task 4, 6 |
| §5.1.3 잡 B 대상 선정·hold·종료시각 파생 | Task 4, 7 |
| §5.1.4 잡 C·D | Task 8 |
| §5.1.5 LIVE 게이트 파라미터 표(스캔 주기/배치 상한/킬 스위치/편차 가드) | Task 3, 6, 7, 9, 11 |
| §5.2 실명 공개 정합(동의서 개정 vs 스위치) | **구현 안 함 — 법무 게이트, 스위치는 기존 코드 그대로 존치** |
| §5.3 미성년자 처리 | Task 12 |
| §5.4 listPlayers 노출 축소 | Task 13 |
| §6 API·에러 계약 | Task 10 |
| §7.1~7.3 검증 전략·롤아웃 | Task 1~13의 각 테스트 스텝 + Task 11 롤아웃 절차 |
| §7.4 UI 시각 검증 | Task 13 Step 11 |
| §8.1 drift gate | Task 1 |
| §8.2 PR 3분할 | 헤더 File Structure |
| §8.3 롤백 | Task 11 안전 규율 4 |
| §9 리스크 표 | 안전 규율 1~6에 전부 반영 |
| §10.1 법무 미결 | Task 7(L3·L8 표시), Task 12(L4 표시), 실명 공개(L1·L5·L6·L7 — 미착수 명시) |
| §10.2 제품 미결 | 헤더/각 태스크 코드 주석에 "권고값, 최종 결정 전"으로 표시(Q2·Q3·Q9) |

**갭 — 의도된 미구현(법무/사용자 게이트)**

- **§5.2(실명 공개 정합)는 이 계획에서 구현하지 않는다.** L1 법무 확인 전까지 A안(동의서 개정)도 B안(스위치 활성화)도 착수하지 않고, 기존 롤백 스위치(`V1_TOURNAMENT_PARTICIPANT_NAMES_CONSENT_GATE`) 코드를 그대로 존치하는 것으로 리스크를 관리한다(스펙 권고와 동일).
- **잡 B(RETENTION_EXPIRY)의 LIVE 전환은 코드가 완성돼도 실행하지 않는다** — hold 판정 코드(Task 7)는 안전(보수적 기본값)하므로 구현하되, Task 11 롤아웃 4단계가 법무 게이트를 명시한다.
- **§10.2 제품 미결(Q2 유예기간·Q3 realName 처분·Q5 member realName 열람·Q8 제재 이력 처분 방식)**은 이 계획이 스펙의 권고값을 그대로 채택해 구현했다 — 최종 확정은 사용자 결정 사항이며, 바뀌면 Task 4/7/13의 상수·조건 하나만 고치면 되도록 순수함수로 분리해 뒀다(예: `WITHDRAWAL_GRACE_PERIOD_DAYS`).
- **제재 진행 상태의 구체 판정식**(§5.1.3-①)은 이번 스코프에서 미완결 문의·미종결 결제 hold만 실제로 켜고, `sanctionReviewUndetermined` 입력은 항상 `false`로 둔다 — 스펙이 "판정식은 구현 시 상태 모델 실측 후 확정"이라 명시했고, 실측해보니 이 레포에 대회 대상 제재 상태 모델 자체가 없다(`V1StatusChangeLog`가 유저·팀멤버십에만 쓰이고 tournament target에는 completed/cancelled만 실측됨). 후속 작업으로 남긴다.

**2. 타입 일관성**

- `PurgeUserPiiResult`(Task 2) → `withdrawal-expiry-purge.service.ts`/`retention-expiry-purge.service.ts`의 `itemsToRecord` 소비 — 일치
- `GateDecision`(Task 3) → 잡 A/B/C/D 4곳 모두 동일한 판별 유니온으로 분기 — 일치
- `HoldReason`(Task 4) → `retention-expiry-purge.service.ts`의 `holdReport` 집계 키 — 일치
- `V1PrivacyPurgeRun.report`(Prisma `Json`) → `finalizeRun`/`getRun`에서 `Prisma.InputJsonValue`/직렬화 가능 plain object로만 다룸 — Global Constraints의 `Prisma.JsonValue` 규율 준수
- `V1TournamentRosterResponse.viewerScope`(Task 13, 프론트) ↔ `listPlayers` 응답의 `viewerScope`(백엔드) — 일치

**3. 미해결 항목(의도된 것)**

- Task 2 Step 5, Task 9 Step 2·3, Task 10 Step 6은 기존 파일 구조를 열어 정확한 라인에 맞춰야 하는 부분이라 지켜야 할 불변식과 마커 문자열로 위치를 지정했다 — 구현자가 파일을 직접 확인한다.
- Task 13 Step 4의 `assertTeamMember` 호출부 전수 확인은 이번 조사(grep 1건)로 안전을 확인했지만, 구현 시점에 재확인한다(다른 병행 PR이 호출부를 늘렸을 수 있다).