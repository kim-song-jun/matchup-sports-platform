# 어드민 대진 그림 편집기 구현 계획 — 색인과 공유 계약

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플랫폼 어드민이 대회·정규 리그의 대진을 템플릿으로 한 번에 만들고, 그림 위에서 자리에 팀을 넣고, 칸에서 점수를 넣어 즉시 확정·정정·무효할 수 있게 한다.

**Architecture:** 칸 = 실제 경기(`V1TeamMatch`). 새 표 `V1TournamentSlot` 이 "팀이 들어갈 칸"의 정본이고 경기는 `homeSlotId`·`awaySlotId` 로 자리를 가리킨다.
템플릿은 순수 함수 planner 가 만든 계획을 한 트랜잭션 executor 가 실행한다. 빠른 결과는 기존 결과 확인 서비스의 `withResultCommand` 안에 새 메서드로 들어가
기존 확정 파이프라인(진출·순위·전적·알림)을 그대로 탄다. 웹은 순수 레이아웃 함수 + 편집용 칸 컴포넌트로 캔버스를 그린다.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 (apps/v1_api, Jest 30), Next.js 16 + React 19 + TanStack Query 5 + Vitest + Testing Library (apps/v1_web).

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md` (S1~S7·Test Scenarios·Ambiguity Log 가 정본. 이 계획과 충돌하면 스펙이 이긴다.)

## PR 별 계획 파일 (순서대로 머지)

| PR | 파일 | 범위 |
|---|---|---|
| PR-1a | `2026-10-08-admin-bracket-canvas-pr1a-schema-tx.md` | 정본 §6 기록 · 스키마·마이그레이션·해시 5곳 · `…InTx` 추출 · 어드민/공개 대진 응답 확장 |
| PR-1b | `2026-10-08-admin-bracket-canvas-pr1b-slots-templates.md` | 자리 서비스(배정·비우기·무작위·조 편성·BYE·SLOT_LINKED·등록 이탈) · 대회 템플릿(knockout 4/8/12, league 대회) |
| PR-1c | `2026-10-08-admin-bracket-canvas-pr1c-round16.md` | 16강 단계 서버 규칙(인접·라벨·DTO·정렬) · knockout 16 템플릿 · 웹 16강 라벨/공개 라운드 순서/진행 단계/"+16강" (enum 값은 1a) |
| PR-2 | `2026-10-08-admin-bracket-canvas-pr2-quick-result.md` | `ADMIN_QUICK` 흐름 · 빠른 결과 · 정정 킥 수 면제 |
| PR-3 | `2026-10-08-admin-bracket-canvas-pr3-canvas-ui.md` | 웹 캔버스(토너먼트) · 트레이 · 패널 · 점수/정정/무효/확인 · 템플릿 창 · [그림\|목록] · 공개 자리 라벨 |
| PR-4 | `2026-10-08-admin-bracket-canvas-pr4-group-knockout.md` | group_knockout 템플릿 · GROUP_RANK · 순위 미리보기/채우기 (BE+FE) |
| PR-5a | `2026-10-08-admin-bracket-canvas-pr5a-league-backend.md` | 정규 리그 빈 경기·템플릿·리그 사이드 배정·공개 게이트·취소/재생성/리마인더·상태 전이 |
| PR-5b | `2026-10-08-admin-bracket-canvas-pr5b-league-ui.md` | 리그 어드민 일정 보드 · 리그 타입 nullable · 참가팀 registrationId |
| PR-6 | `2026-10-08-admin-bracket-canvas-pr6-mobile-finish.md` | 390 라운드 탭 + 바텀시트 · 구조 편집 숨김 · 마감 |

**병렬 실행 웨이브(2026-10-09 사용자: Ultracode 병렬)** — 같은 웨이브의 PR 은 각자 worktree 에서 동시에 구현하고, 머지는 웨이브 안에서 순서대로(뒤 PR 은 앞 PR 머지 뒤 `origin/dev` 를 3-way merge 해 충돌 해결·재검증):

| 웨이브 | PR | 선행 |
|---|---|---|
| 1 | 1a | — (스키마 변경은 여기 한 번: 자리 + `round16`) |
| 2 | 1b · 2 | 1a |
| 3 | 1c · 5a | 1b |
| 4 | 3 | 1b·1c·2 (3 은 1c 의 `tournamentRoundLabel`·`BRACKET_SOURCE_PHASES` 를 import) |
| 5 | 4 · 5b | 1b·1c·3(4), 5a·3(5b) |
| 6 | 6 | 3·4·5b |

PR-1a·1b 는 순서상 1a 가 먼저다. 각 PR 은 dev 머지 → alpha 배포 확인 → 새 테스트 대회로 ego-browser E2E(alpha 데이터 쓰기는 **실행 전 사용자 승인**) → 390/768/1440 갤러리를 그 PR 코멘트에 게시.

## Global Constraints (모든 태스크에 적용)

- 작업 위치: worktree `/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas`(브랜치 `feat/admin-bracket-canvas`, base `origin/dev`). PR 을 나누면 PR 마다 `git fetch origin dev` 후 `origin/dev` 에서 새 worktree 를 만든다. PR base 는 항상 `dev`(머지 직전 `gh pr view <N> --json baseRefName --repo kim-song-jun/matchup-sports-platform` 로 확인).
- 커밋은 `git commit -m "..." -- <명시 경로>` + 직후 `git show --stat HEAD`. `git add -A`·`git stash`·브랜치 전환 금지. 디렉터리 pathspec 금지(node_modules 심링크가 섞인다).
- **`prisma generate` 금지**(생성물이 모노레포 공유 경로). 새 Prisma 타입 검증은 격리 생성: `apps/v1_api/prisma-iso-tmp/schema.prisma` 사본의 generator `output` 만 scratchpad 로 돌려 생성하고, `@prisma/client` 를 그 출력으로 매핑한 `tsconfig.isocheck.json` 으로 `tsc` — 끝나면 두 임시 파일 즉시 삭제. 실행 전후 공유 client 오염이 없는지 확인. 진단을 끈 임시 jest 설정은 scratchpad 에만 두고, 썼다면 커밋 전에 격리 tsc 를 반드시 돌린다.
- 테스트 명령(앱 디렉터리 안에서): API unit `cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 <파일>` · Web `cd apps/v1_web && ./node_modules/.bin/vitest run <파일>` · 타입 `./node_modules/.bin/tsc --noEmit -p tsconfig.json` · 패턴 `node scripts/v1-pattern-check.mjs`(web) / `node scripts/v1-surface-check.mjs`(api). 통합 스펙(`apps/v1_api/test/**/*.integration-spec.ts`)은 `DATABASE_URL` 이 있는 CI 에서 돈다 — 로컬에서 돌리려면 `migrate deploy` → `competition-config-backfill.cli` → 스펙 순서.
- 로컬 next 서버(`next dev/start/build`)로 화면을 검증하지 않는다 — 화면은 dev 머지 후 alpha 에서 ego-browser 로.
- 마이그레이션 폴더 이름 `YYYYMMDDHHMMSS_v1_<snake>` 이고 **최신 마이그레이션보다 뒤** 타임스탬프(작성 시점 최신 `20261008120000_v1_group_team_backfill_for_fixtures`; PR 직전 다시 확인). SQL 은 additive 만(새 enum/표/nullable 컬럼/FK/인덱스) — 데이터 INSERT/UPDATE 금지.
- 스키마를 바꾸면 `sha256sum apps/v1_api/prisma/schema.prisma` 새 해시를 5곳에: `deploy/Dockerfile.v1-api`(교체), `deploy/alpha-manifest-common.sh`(허용 목록에 **추가**, 이전 값 유지), `scripts/release/create-alpha-release-manifest.sh`(교체 2곳), `scripts/release/prepare-task168-final-steady-inputs.sh`(교체), `apps/v1_api/test/fixtures/game-schema.fixture.ts`(교체).
- PR 마다 `.changeset/<이름>.md`(실제로 바뀐 앱만 `minor` — 아래 "머지 후 확인" 의 changeset 규칙, 사용자에게 달라지는 점 한국어 한 문단). 엔드포인트·응답 계약을 바꾸면 같은 PR 에서 `docs/api/domains/tournaments.md`·`league-matches.md` 갱신.
- DTO 는 class-validator(`whitelist + forbidNonWhitelisted`), 중첩은 전용 DTO + `@ValidateNested() @Type()`. 숫자 기본값은 `??`. 에러는 `{ code: 'DOMAIN_CODE', message: '…해요' }`.
- 쓰기 엔드포인트 권한: `V1AuthGuard` + `adminContext.getMutationAdmin(user.id)`(support 403). 빠른 결과는 추가로 `staffAccess.assertAccess` 결과 `role === 'platform_ops'`.
- 웹: 토큰만(하드코딩 색·`text-[Npx]` 금지), 44px 터치, `aria-label`, 모달은 `use-modal-a11y`, `transition-colors`/`transition-transform` 만, `React.forwardRef` 금지, 에러는 `extractErrorMessage(err, '…해요')`, UI 문구 해요체, 상태는 색 + 아이콘/텍스트 병기, 다크 모드 4.5:1.
- 주석은 코드가 말 못 하는 제약·함정만, 주변 코드의 주석 언어를 따른다(새 코드 주석 비율 1/3 이하).

## PR 시작 체크리스트 (PR 마다, 첫 태스크 전에)

1. `git -C /Users/sungjun/Dev/projects/matchup-sports-platform fetch origin dev` → 직전 PR 이 `origin/dev` 에 머지됐는지 확인 →
   `git -C /Users/sungjun/Dev/projects/matchup-sports-platform worktree add .claude/worktrees/<slug> -b feat/<slug> origin/dev`.
2. node_modules 심링크(읽기 전용, **절대 `git add` 하지 않는다** — `.gitignore` 의 `node_modules/` 는 심링크를 못 잡는다):
   `ln -s <main>/node_modules <wt>/node_modules`, `apps/v1_web`·`apps/v1_api` 도 같게.
3. 격리 Prisma 하네스를 **새 worktree 경로로 다시 만든다** — PR-1a Task 2 Step 10 의 명령을 `WT=<새 worktree>` 로 재실행.
   **`ISO` 는 worktree 마다 따로**: `ISO=/Users/sungjun/.cache/bracket-canvas-iso/<slug>`(병렬 웨이브에서 하네스가 서로 덮이지 않게 — 계획 본문의
   `ISO=/Users/sungjun/.cache/bracket-canvas-iso` 는 이 값으로 바꿔 읽는다). rootDir·paths 가 worktree 절대경로라 PR 마다 재생성 필요. 실행 전후 공유 client 오염 확인.
   내가 띄운 프로세스(postgres·dev 서버 등)는 태스크 끝에 PID 로 직접 종료한다.
4. 계획의 Task 0(있으면)로 선행 PR 심볼이 실제 코드에 있는지 grep 확인 — 없으면 BLOCKED 로 멈춘다.

## 머지 후 확인 (PR 마다)

- 배포 확인: `gh run list --workflow deploy-alpha.yml --branch dev --limit 1 --repo kim-song-jun/matchup-sports-platform` 와
  `curl -fsSI https://alpha.teameet.co.kr/landing | grep -i x-teameet-commit` 로 내 머지 커밋이 포함된 SHA 인지 확인(배포 창 중엔 측정 금지).
- UI 가 바뀐 PR(3·4·5b·6): ego-browser 로 시나리오 확인 + 390/768/1440 갤러리를 그 PR 코멘트에 게시.
- UI 없는 PR(1a·1b·2·5a): 갤러리 면제. 읽기 전용 API 스모크(새 응답 필드가 나오는지)만. **새 대회·결과를 만드는 alpha 쓰기는 사용자 승인 후.**
- changeset 은 실제로 바뀐 앱만 적는다(`v1_api`·`v1_web` 은 fixed 그룹이라 한쪽만 적어도 함께 올라간다). 웹 전용 PR 은 `v1_web` 만.

## 공유 계약 — 모든 PR 계획이 이 이름을 그대로 쓴다

### Prisma (PR-1a)

```prisma
enum V1TournamentSlotKind {
  ENTRY
  BYE
  GROUP_RANK
}

model V1TournamentSlot {
  id             String               @id @default(uuid())
  tournamentId   String               @map("tournament_id")
  kind           V1TournamentSlotKind @default(ENTRY)
  groupId        String?              @map("group_id")
  position       Int
  sourceGroupId  String?              @map("source_group_id")
  registrationId String?              @map("registration_id")
  createdAt      DateTime             @default(now()) @map("created_at")
  updatedAt      DateTime             @updatedAt @map("updated_at")

  tournament      V1Tournament              @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  group           V1TournamentGroup?        @relation("V1TournamentSlotGroup", fields: [groupId], references: [id], onDelete: Restrict)
  sourceGroup     V1TournamentGroup?        @relation("V1TournamentSlotSourceGroup", fields: [sourceGroupId], references: [id], onDelete: Restrict)
  registration    V1TournamentRegistration? @relation(fields: [registrationId], references: [id], onDelete: SetNull)
  homeTeamMatches V1TeamMatch[]             @relation("V1TeamMatchHomeSlot")
  awayTeamMatches V1TeamMatch[]             @relation("V1TeamMatchAwaySlot")

  @@unique([tournamentId, kind, registrationId])
  @@index([tournamentId, groupId])
  @@map("v1_tournament_slots")
}

// V1TeamMatch 에 추가
//   homeSlotId String? @map("home_slot_id")
//   awaySlotId String? @map("away_slot_id")
//   homeSlot   V1TournamentSlot? @relation("V1TeamMatchHomeSlot", fields: [homeSlotId], references: [id], onDelete: Restrict)
//   awaySlot   V1TournamentSlot? @relation("V1TeamMatchAwaySlot", fields: [awaySlotId], references: [id], onDelete: Restrict)
//   @@index([homeSlotId])  @@index([awaySlotId])
// V1Tournament.slots, V1TournamentGroup.slots("V1TournamentSlotGroup")·rankSlots("V1TournamentSlotSourceGroup"),
// V1TournamentRegistration.slots 역관계 추가. (실제 모델의 id 타입·@map 관례는 schema.prisma 를 따른다.)
```

마이그레이션: `apps/v1_api/prisma/migrations/20261009090000_v1_tournament_slots/migration.sql` (타임스탬프는 PR 직전 재확인).

### "자리를 쓰는 경기"·공개 게이트 (PR-1b·PR-5a)

- 자리를 쓰는 경기 = `deletedAt IS NULL AND status <> 'cancelled'` 이고 `homeSlotId = slot.id OR awaySlotId = slot.id`.
- `apps/v1_api/src/common/competition/unfilled-slot-gate.ts` (PR-5a):
  - `export function excludeUnfilledSlotFixturesWhere(): Prisma.V1TeamMatchWhereInput` →
    `{ NOT: { OR: [ { homeSlotId: { not: null }, hostTeamId: null }, { awaySlotId: { not: null }, approvedApplicantTeamId: null } ] } }`
  - `export function excludeUnfilledSlotFixturesSql(alias: string): Prisma.Sql` → 같은 술어의 raw SQL 조각.

### 백엔드 이름 (파일 · 시그니처)

| 이름 | 파일 | PR |
|---|---|---|
| `tournamentSlotLabel(input: { kind: V1TournamentSlotKind; position: number; groupName: string \| null; groupPhase: V1TournamentGroupPhase \| null; sourceGroupName: string \| null }): string` | `apps/v1_api/src/tournaments/slots/tournament-slot-label.ts` | 1a |
| `createGroupInTx(tx, admin, tournamentId, input: { name; phase; sortOrder; advanceCount: number \| null }): Promise<{ id: string }>` | `apps/v1_api/src/tournaments/tournament-bracket-tx.ts` | 1a |
| `createEmptyTournamentFixtureInTx(tx, deps: { games: GamesService }, admin, input: { tournament: { id; sportId; regionId; venue; competitionConfigVersionId: string; title: string }; groupId: string; round: string; fixtureNumber: number; legNumber: number; homeSlotId: string \| null; awaySlotId: string \| null }): Promise<{ id: string }>` | 같은 파일 | 1a |
| `assignTournamentFixtureSideInTx(tx, deps, admin, input: { fixtureId: string; side: 'HOME' \| 'AWAY'; registrationId: string \| null }): Promise<void>` — `updateFixture` 의 tx 안 로직 추출, `updateFixture` 도 이것을 호출 | 같은 파일 | 1a |
| `softDeleteTournamentFixtureInTx(tx, admin, fixtureId): Promise<void>` (자리 연결 해제 포함) · `deleteTournamentGroupInTx(tx, admin, groupId): Promise<void>` | 같은 파일 | 1a |
| `lockCompetitionForBracketMutationInTx(tx, competition: { id: string; kind: V1CompetitionKind \| null }): Promise<void>` (스키마상 `kind` 가 nullable — null 은 대회 레인) — 대회: advisory lock / 리그: 행 `FOR UPDATE` + `assertFixtureGenerationAllowedInTx` | `apps/v1_api/src/tournaments/slots/competition-bracket-lock.ts` | 1b |
| `TournamentSlotService.assignSlot(user, slotId, registrationId \| null)` · `randomFill(user, competitionId)` · `standingsPreview(user, tournamentId)`(PR-4) · `fillFromStandings(user, tournamentId, overrides)`(PR-4) | `apps/v1_api/src/tournaments/slots/tournament-slot.service.ts` | 1b |
| `assignSlotInTx(tx, ctx: SlotMutationContext, slotId, registrationId \| null): Promise<string[]>`(영향 경기 id) · `releaseSlotsForRegistrationInTx(tx, ctx, registrationId): Promise<void>` | 같은 파일(export function) | 1b |
| `planBracketTemplate(input: BracketTemplateInput, ctx: { fixtureNumberOffset: number }): BracketTemplatePlan` (순수) | `apps/v1_api/src/tournaments/templates/bracket-template-plan.ts` | 1b(knockout·league) / 4(group_knockout) |
| `groupRankPairings(groupCount: number, advancePerGroup: 1 \| 2): Array<[GroupRankRef, GroupRankRef]>`, `GroupRankRef = { group: number; rank: number }` (0-based group index) | `apps/v1_api/src/tournaments/templates/group-rank-pairings.ts` | 4 |
| `BracketTemplateService.apply(user, tournamentId, dto)` (executor, 한 트랜잭션) | `apps/v1_api/src/tournaments/templates/bracket-template.service.ts` | 1b |
| `RevisionFlow = 'STANDARD' \| 'CORRECTION' \| 'ADMIN_QUICK'` | `apps/v1_api/src/games/core/revision-state-machine.ts` | 2 |
| `QUICK_RESULT_REASON_MARKER = '[quick-result]'`, `revisionEntryMethod(rev: { reason: string \| null; supersedesId: string \| null }): 'quick' \| 'console' \| 'correction'` | `apps/v1_api/src/tournament-operations/results/quick-result.constants.ts` | 1a(entryMethod 직렬화에 필요) |
| `TournamentResultReviewService.quickResult(user, gameId, dto, idempotencyKey)` | 기존 서비스 | 2 |
| `assignLeagueFixtureSideInTx(tx, deps, admin, input: { teamMatchId: string; side: 'HOME' \| 'AWAY'; registrationId: string \| null }): Promise<void>` | `apps/v1_api/src/league-matches/league-fixture-side-assignment.ts` | 5a |
| `promoteLeagueWhenSlotsFilledInTx(tx, leagueId): Promise<boolean>` (조건부 `status in (draft, open, closed)`; on_hold·completed·in_progress 제외) | `apps/v1_api/src/league-matches/league-slot-status.ts` | 5a |
| `LeagueMatchAdminService.applyTemplate(user, leagueId, dto)` | 기존 서비스 | 5a |

**계획 작성 뒤 확정한 보충 계약(2026-10-09) — 중복 구현 금지:**

| 이름 | 파일 | 생산 PR | 소비 |
|---|---|---|---|
| `ensureGroupPhaseTeamsInTx(tx, admin, tournamentId, groupId, …)`, `recalculateStandingsInTx(tx, tournamentId)`, `updateTournamentFixtureInTx`, `assertSidesNotSlotLinked` | `apps/v1_api/src/tournaments/tournament-bracket-tx.ts` | 1a | 1b·4 는 **import 만** 한다(따로 추출하지 않는다) |
| `releaseUnusedGroupTeamsInTx(tx, admin, tournamentId, groupId, registrationIds)` | `apps/v1_api/src/tournaments/tournament-bracket-tx.ts` | 1b (새 로직) | 1b·5a |
| `writeAdminActionLog(tx, admin, input)` | `apps/v1_api/src/common/admin-context.service.ts` | 1a | 1a~5a 의 `…InTx` |
| `createGroupInTx` 는 그룹 행 전체를 돌려준다(`{ id }` 아님) | — | 1a | 1b·4 |
| `serializeAdminBracketSlot(...)`, `serializeAdminBracketGame(...)` | `apps/v1_api/src/tournaments/slots/admin-bracket-view.ts` | 1a | 5a 리그 어드민 응답도 **이것을 import**(별도 `league-admin-fixture-view.ts` 만들지 않음) |
| `assertLeagueFixtureGenerationAllowedInTx(tx, leagueId)` | `apps/v1_api/src/league-matches/league-fixture-generation-guard.ts` | 1b (private 메서드 추출) | 1b·5a |
| `lockCompetitionForSlotReleaseInTx(tx, competition)` (보류 리그도 해제는 허용하는 잠금 전용판) | `apps/v1_api/src/tournaments/slots/competition-bracket-lock.ts` | 1b | 1b·5a |
| `SlotMutationContext`, `assignSlotsBatchInTx(tx, ctx, changes)`, `ROUND12_BYE_SORT_ORDERS = [0, 3, 4, 7]` | `apps/v1_api/src/tournaments/slots/…` (1b 계획 기준) | 1b | 4·5a |
| `TournamentSlotService.releaseForRegistrationInTx(tx, admin, registrationId)` — `releaseSlotsForRegistrationInTx` 를 감싼 서비스 메서드 | `tournament-slot.service.ts` | 1b | 대회·리그 등록 취소 경로 |
| 공개 일정 `PublicScheduleEntry.homeSlotLabel/awaySlotLabel: string \| null`(`items[]`·`unscheduled[]`) | `games/public-records/*` | 1a | 3(`schedule-content.tsx` 가 라벨 우선 표시) |
| `ApplyLeagueTemplateDto.placeName?: string` | `league-matches/dto/*` | 5a | 5b |

**16강(2026-10-09 추가):** `V1TournamentGroupPhase` 에 `'round16'`(1a 마이그레이션), round 문자열 `'16강'`, 인접 `quarter ← round12 | round16`, `BracketTemplateInput` knockout `size: 4 | 8 | 12 | 16`(1c 가 planner 확장), `groupRankPairings(8, 2)` → 16강 8경기 (결선 크기 K = 조 수 × 진출 팀 수 ∈ {2,4,8,16}). 결선 번호·그룹 순서는 `… → 4강 → 결승 → 3·4위전`(결승 다음 3·4위전), 라벨 표는 `knockout-phase-labels.ts` 한 곳(4). 웹 단계 순서 상수는 `round16 > round12 > quarter > semi > final > third_place`(실제로 한 대회에 16강·12강이 함께 있지는 않다).

`BracketTemplatePlan`(1b, 4 에서 확장):

```ts
export type BracketTemplateInput =
  | { kind: 'knockout'; size: 4 | 8 | 12 | 16; thirdPlace: boolean }
  | { kind: 'group_knockout'; groupCount: number; teamsPerGroup: number; advancePerGroup: 1 | 2; legs: 1 | 2; thirdPlace: boolean }
  | { kind: 'league'; teamCount: number; legs: 1 | 2 };
export type PlanGroup = { key: string; name: string; phase: V1TournamentGroupPhase; sortOrder: number; advanceCount: number | null };
export type PlanSlot = { key: string; kind: V1TournamentSlotKind; groupKey: string | null; position: number; sourceGroupKey: string | null };
export type PlanFixture = { key: string; groupKey: string; round: string; fixtureNumber: number; legNumber: number; homeSlotKey: string | null; awaySlotKey: string | null };
export type PlanEdge = { sourceFixtureKey: string; outcome: 'WINNER' | 'LOSER'; targetFixtureKey: string; targetSide: 'HOME' | 'AWAY' };
export type PlanByeSlot = { groupKey: string; sortOrder: number };
export type BracketTemplatePlan = { groups: PlanGroup[]; slots: PlanSlot[]; fixtures: PlanFixture[]; edges: PlanEdge[]; byeSlots: PlanByeSlot[] };
export const BRACKET_TEMPLATE_MAX_FIXTURES = 240;
```

### HTTP (경로 · 본문 · 응답)

| 메서드 경로 | 본문 | 응답 `data` | PR |
|---|---|---|---|
| `POST /admin/tournaments/:tournamentId/bracket/template` | `ApplyBracketTemplateDto` = `BracketTemplateInput` 필드 평탄화(`kind` 필수, 나머지 kind 별 필수는 서비스가 검증) + `replaceExisting?: boolean` | `{ groups: number; slots: number; fixtures: number; edges: number }` | 1b / 4 |
| `PUT /admin/tournament-slots/:slotId/assignment` | `{ registrationId: string \| null }` | `{ slot: AdminBracketSlot; affectedTeamMatchIds: string[] }` | 1b |
| `POST /admin/tournaments/:tournamentId/slots/random-fill` (리그도 같은 경로, id = 리그 id) | 없음 | `{ assignments: { slotId: string; registrationId: string }[] }` | 1b |
| `GET /admin/tournaments/:tournamentId/slots/standings-preview` | — | `{ slots: { slotId; label; state: 'ready' \| 'tied' \| 'group_incomplete'; candidateRegistrationId: string \| null; candidateTeamName: string \| null; tiedRegistrationIds: string[]; currentRegistrationId: string \| null }[] }` | 4 |
| `POST /admin/tournaments/:tournamentId/slots/fill-from-standings` | `{ overrides?: { slotId: string; registrationId: string }[] }` | `{ assignments: { slotId; registrationId }[]; skipped: { slotId; reason: 'tied' \| 'group_incomplete' }[] }` | 4 |
| `POST /admin/games/:gameId/quick-result` + 헤더 `Idempotency-Key` | `{ clientCommandId: uuid; expectedVersion: int; score: { home: int≥0; away: int≥0; penalties?: { home: int≥0; away: int≥0 } } }` | `{ gameId; revisionId; version; score }` | 2 |
| `POST /admin/league-matches/:leagueId/fixtures/template` | `{ teamCount: 3..20; legs: 1 \| 2; schedule: LeagueFixtureScheduleDto(기존); replaceExisting?: boolean }` | `{ slots: number; fixtures: number }` | 5a |

응답 확장(1a, 리그는 5a):
- `GET /admin/tournaments/:id/bracket` 최상위 `slots: AdminBracketSlot[]`, 경기마다 `homeSlotId`·`awaySlotId`·`game`.
- `AdminBracketSlot = { id; kind: 'ENTRY' | 'BYE' | 'GROUP_RANK'; groupId: string | null; sourceGroupId: string | null; position: number; label: string; registrationId: string | null; teamName: string | null }`
- `game = { id; state: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED' | 'CANCELLED'; version: number; hasLiveRecords: boolean; latestRevision: { id; state: 'DRAFT' | 'SUBMITTED' | 'CHANGE_REQUESTED' | 'OFFICIAL' | 'VOID'; score: { home: number; away: number; penalties?: { home: number; away: number } } | null; entryMethod: 'quick' | 'console' | 'correction' } | null } | null`
- 공개 경기 직렬화: `homeSlotLabel: string | null`, `awaySlotLabel: string | null`(팀이 없고 자리가 있을 때만 값).
- 리그 어드민(5a): 경기에 같은 `homeSlotId`·`awaySlotId`·`game`, 최상위 `slots`, `homeTeamId`·`awayTeamId` nullable, 참가팀 항목에 `registrationId`.

### 에러 코드

| 코드 | HTTP | 언제 |
|---|---|---|
| `BRACKET_TEMPLATE_UNSUPPORTED` | 422 | 결선 크기 K ∉ {2,4,8,16}(16강 = 8조×2팀), K=2 + 3위전, kind 별 필수 필드 누락·범위 밖 |
| `BRACKET_TEMPLATE_FORMAT_MISMATCH` | 422 | 템플릿 kind ≠ 대회 format |
| `BRACKET_TEMPLATE_TOO_LARGE` | 422 | 계획 경기 수 > 240 |
| `BRACKET_NOT_EMPTY` | 409 | 대진이 비어 있지 않은데 `replaceExisting` 없음 |
| `BRACKET_LOCKED` | 409 | 교체하려는데 시작·결과 있는 경기 존재 |
| `SLOT_NOT_FOUND` | 404 | |
| `SLOT_REGISTRATION_INVALID` | 422 | 다른 대회 등록·미확정 등록 |
| `SLOT_TEAM_ALREADY_PLACED` | 409 | 같은 팀이 이미 다른 자리(ENTRY·BYE 교차 포함) |
| `SLOT_LOCKED` | 409 | 자리를 쓰는 경기 중 시작·결과 있음 |
| `SLOT_LINKED` | 409 | 자리에 연결된 사이드를 `PATCH /admin/fixtures/:id` 로 직접 변경 |
| `LEAGUE_FIXTURES_EXIST` | 409 | (기존) 리그에 경기가 이미 있음 |
| `LEAGUE_SLOT_FIXTURES_USE_TEMPLATE` | 409 | 자리 리그에서 기존 재생성 |
| `QUICK_RESULT_UNSUPPORTED` | 409 | 대회·정규 리그 팀매치 경기가 아님 |
| `QUICK_RESULT_NOT_AVAILABLE` | 409 | 진행 중·확정 전 결과 있음·이미 확정 |
| `QUICK_RESULT_FIXTURE_CANCELLED` | 409 | 팀매치 status ≠ matched |
| `QUICK_RESULT_HAS_LIVE_RECORDS` | 409 | 게임 이벤트 ≥ 1 |
| `QUICK_RESULT_TEAMS_REQUIRED` | 409 | 사이드 팀 미정 |
| `QUICK_RESULT_ROSTER_SYNCING` | 409 | 사이드 참가자 0명 또는 미처리 `COMPETITION_ROSTER_RESYNC` |
| `GROUP_HAS_SLOTS` | 409 | 자리가 남은 조 삭제(1a — FK Restrict 가 500 이 되지 않게) |
| `SLOT_LEAGUE_NOT_SUPPORTED_YET` | 409 | **임시**: 1b 에서 정규 리그 자리 변경을 막고, 5a 가 코드·테스트·문서에서 지운다 |
| `IDEMPOTENCY_PAYLOAD_CONFLICT` | 409 | 같은 멱등 키에 다른 본문(2 — 지금은 원시 `GameContractError` 가 500) |
| `SLOT_BYE_POSITION_INVALID` | 422 | BYE 자리 position 이 12강 부전승 위치 밖(1b) |
| `SLOT_CHANGE_DUPLICATED` | 422 | 한 배치에 같은 자리가 두 번(1b) |
| `SLOT_CHANGE_CROSS_TOURNAMENT` | 422 | 한 배치에 다른 대회 자리가 섞임(1b) |
| `LEAGUE_ON_HOLD` | 409 | 보류 중 리그의 대진·자리 변경(1b 잠금 헬퍼, 5a) |

### 웹 이름

| 이름 | 파일 | PR |
|---|---|---|
| 타입 `V1AdminBracketSlot`, `V1AdminBracketFixtureGame`, `V1AdminBracketFixture.homeSlotId/awaySlotId/game`, `V1AdminTournamentBracket.slots`, 공개 `homeSlotLabel/awaySlotLabel`, `BracketTemplateInput` | `apps/v1_web/src/types/api.ts` | 3 |
| `useV1ApplyBracketTemplate(tournamentId)`, `useV1AssignTournamentSlot(competitionId, scope: 'tournament' \| 'league')`, `useV1RandomFillSlots(competitionId, scope)`, `useV1QuickResult(competitionId, scope)`, `useV1SlotStandingsPreview(tournamentId, enabled)`(4), `useV1FillSlotsFromStandings(tournamentId)`(4), `useV1ApplyLeagueTemplate(leagueId)`(5b) | `apps/v1_web/src/hooks/use-v1-bracket-canvas.ts` | 3/4/5b |
| `buildCanvasLayout(input: { groups; fixtures; slots; mode: 'bracket' \| 'league' }): CanvasLayout`, `fixtureNodeState(game): 'scheduled' \| 'live' \| 'submitted' \| 'official' \| 'cancelled'` | `apps/v1_web/src/lib/bracket-canvas-layout.ts` | 3 (4·5b 확장) |
| 컴포넌트 | `apps/v1_web/src/components/admin/bracket-canvas/` — `bracket-canvas.tsx`, `bracket-canvas-node.tsx`, `bracket-team-tray.tsx`, `bracket-node-panel.tsx`, `bracket-quick-result-form.tsx`, `bracket-result-actions.tsx`, `bracket-template-dialog.tsx`, `bracket-standings-fill-dialog.tsx`(4), `league-schedule-board.tsx`(5b), `bracket-canvas-mobile.tsx`(6) | 3~6 |
| 무효화 키 | `v1Keys.adminTournamentBracket(id)`, `v1Keys.tournament(id)`, `v1Keys.adminLeagueMatch(id)`, `resultReviewKeys.game(gameId)`·`.revisions(gameId)` | 3~5b |
| `bracketNodeStateChip(state)` — 칸 상태 → 칩 라벨·톤(취소는 빨강) **단 하나**. 5b 의 `STATE_TAG`·6 의 자체 함수는 만들지 않고 이것을 import | `apps/v1_web/src/lib/competition-status.ts` | 3 |
| `useV1SetBracketSources(tournamentId)`(기존 bracket-sources PATCH 래핑), 경기 추가·연결 창 | `use-v1-bracket-canvas.ts`, `lib/bracket-fixture-tools.ts` | 3 |
| `buildLeagueBoard(...)` — 정규 리그 보드 열(KST 경기 날짜 = 주차), `LeagueFixturePanel` | `apps/v1_web/src/lib/…`, `components/admin/bracket-canvas/…` (5b 계획 기준) | 5b — 리그 방식 **대회**는 3 의 `buildCanvasLayout(mode:'league')` |
| 모바일 보조: `bracket-canvas-responsive.tsx`, `bracket-canvas-mobile-sheet.tsx`, `bracket-canvas-mobile-screen.tsx`, `lib/bracket-canvas-mobile-model.ts`, 테스트 `src/test/viewport.ts` | `components/admin/bracket-canvas/` | 6 |
| 리그 타입 `V1AdminLeagueTeam.registrationId: string \| null`(필수 필드, 값은 nullable) | `types/league-match.ts` | 5b — 6 도 같은 타입을 가정 |

## Review Focus (테스트가 따로 겨냥하지 않으면 사람을 가장 먼저 무는 다섯 가지)

1. 반쪽만 찬 리그 경기가 게이트 헬퍼를 안 쓰는 공개 경로로 새는 것 — 새 공개 쿼리는 반드시 `excludeUnfilledSlotFixturesWhere()` 를 쓴다(PR-5a 대조군 테스트가 경로마다 고정).
2. 자리 배정 직후 바로 점수 확정 — 명단 동기화 전이면 409 이고 출전자 0명 OFFICIAL 이 절대 생기지 않는다(PR-2 테스트).
3. 다음 라운드가 이미 시작된 뒤 앞 경기 정정·무효 — 409 `NEXT_FIXTURE_CONFLICT` 와 해요체 안내, 부분 적용 없음(PR-3 화면 테스트 + PR-2 서버 테스트).
4. 시작된 경기가 하나라도 있는 대진에 템플릿 교체 — 409 이고 아무것도 지워지지 않는다(PR-1b 테스트).
5. 두 어드민의 동시 조작(같은 팀을 다른 자리에 / 템플릿과 일괄 생성 동시) — 유일 제약·잠금으로 하나만 성공(PR-1b·5a 통합 테스트).
