# 어드민 대진 그림 편집기 — PR-5a 정규 리그 백엔드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정규 리그(`kind=regular_league`)도 템플릿으로 "빈 경기" 대진을 먼저 만들고, 자리에 팀을 넣는 순간 경기·팀 일정·신청서가 생기며, 팀이 다 차지 않은 경기는 공개 화면 어디에도 새지 않게 한다.

**Architecture:** 경기 한 건을 만드는 단일 경로 `createLeagueFixture` 가 팀 null + 자리 id 를 받는다. 템플릿은 순수 planner(`planLeagueTemplate`)가 계산한 계획을 `LeagueMatchAdminService.applyTemplate` 가 한 트랜잭션(리그 행 `FOR UPDATE`)으로 실행한다. 자리 배정은 `assignLeagueFixtureSideInTx`(대회 `updateTournamentMatchInTx` 패턴 이식)가 사이드·팀 일정·신청서를 맞추고, 공개 노출은 술어 하나(`unfilled-slot-gate.ts`)를 모든 공개 쿼리에 거는 방식으로 막는다.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 (apps/v1_api), Jest 30 + ts-jest, Supertest 통합 스펙(CI 의 `DATABASE_URL`).

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md` (S2 리그 부분 · S3 리그 부분 · S6 · Test Scenarios) · 색인과 공유 계약 `docs/superpowers/plans/2026-10-08-admin-bracket-canvas-index.md`. 충돌하면 스펙이 이긴다.

## 계약 이탈

계약의 이름·경로·시그니처·에러 코드는 그대로 쓴다(`assignLeagueFixtureSideInTx(tx, deps, admin, input)` 의 `deps` 는 PR-1a 의 `assignTournamentFixtureSideInTx` 와 같이 쓰지 않는 자리표시로 유지한다). 계약이 말하지 않은 곳을 채우는 **추가** 하나만 있다.

- **`ApplyLeagueTemplateDto` 에 선택 필드 `placeName?: string` 을 더한다(추가만, 이름 변경 아님).** 계약 본문은 `{ teamCount, legs, schedule, replaceExisting? }` 이지만 스펙 시나리오 4 가 일정 입력에 "장소"를 넣고, 공개 가드는 `placeName` 이 있는 경기만 통과시킨다(`league-match-public.service.ts` 의 `placeName` 가드 — `grep -n "placeName" src/league-matches/league-match-public.service.ts`). 비우면 기존 일괄 생성과 같은 기본값 `'장소 미정'` 이다.

PR-1b 가 "PR-5a 가 교체한다"고 남긴 곳은 한 군데다: `assertTournamentLane`(`tournament-slot.service.ts`, 409 `SLOT_LEAGUE_NOT_SUPPORTED_YET`). Task 10 이 그것을 지우고 리그 분기로 바꾼다.

## Global Constraints

색인의 "Global Constraints" 전부가 적용된다(worktree·pathspec 커밋·`prisma generate` 금지·테스트 명령·마이그레이션 규율·changeset·DTO·권한·주석 비율). 이 PR 에만 더해지는 제약:

- **선행 PR 가정:** PR-1a(스키마 `V1TournamentSlot`·`homeSlotId`/`awaySlotId`·해시 5곳·`tournamentSlotLabel`·`revisionEntryMethod`)와 PR-1b(`TournamentSlotService`·`assignSlotInTx`·`releaseSlotsForRegistrationInTx`·`BRACKET_TEMPLATE_MAX_FIXTURES`)가 이 브랜치에 이미 머지돼 있다. Task 0 이 존재 여부를 기계적으로 확인한다. 이 PR 은 **스키마를 바꾸지 않는다** — 마이그레이션·해시 갱신 없음.
- **공유 Prisma client 는 새 컬럼을 모른다**(`prisma generate` 금지). 이 문서의 모든 서버 unit `jest`·`tsc` 는 PR-1a Task 2 가 만든 격리 하네스(`$ISO/jest.iso.config.cjs`·`$ISO/tsconfig.isocheck.json`)로 돈다. PR 시작 시 한 번 확인한다: `export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas ISO=/Users/sungjun/.cache/bracket-canvas-iso; ls "$ISO/jest.iso.config.cjs" "$ISO/tsconfig.isocheck.json" "$ISO/prisma-client/client.d.ts"` — 없으면 PR-1a Task 2 Step 10 의 생성 절차를 다시 실행한다. 이 계획의 `tsc | grep -c …` 확인은 "새 Prisma 타입 오류 외에 이 PR 이 만든 오류 0" 을 보려는 것이다. 통합 스펙(`*.integration-spec.ts`)은 로컬에 `DATABASE_URL` 이 없어 **CI 에서만 돈다** — 아래 "run" 단계의 통합 항목은 "로컬: `tsc` 로 심볼 부재 확인 / CI: red→green" 로 읽는다.
- **공개 게이트의 의미(S6):** "자리에 연결됐는데 팀이 비어 있는 경기"(`homeSlotId≠null ∧ hostTeamId=null` 또는 `awaySlotId≠null ∧ approvedApplicantTeamId=null`)만 가린다. 자리 없는 기존 경기는 원정이 null 이어도 **그대로 포함**한다. 새 공개 쿼리는 반드시 `excludeUnfilledSlotFixturesWhere()` 를 쓴다.
- **주차(N주차) 형제 집합은 게이트와 무관하게 비삭제 전체**다. 게이트는 표시 목록만 거른다.
- 통합 스펙은 파일마다 격리 DB 클론에서 돈다(`jest.config.ts` 의 `isolated-integration-environment`) — 스펙 안에서 정리(cleanup) 코드를 쓰지 않는다.
- **보충 계약(색인 2026-10-09) 소비:** 이 PR 은 `serializeAdminBracketSlot`/`serializeAdminBracketGame`(PR-1a)·`assertLeagueFixtureGenerationAllowedInTx`·`lockCompetitionForSlotReleaseInTx`·`lockCompetitionForBracketMutationInTx`·`assignSlotInTx`/`assignSlotsBatchInTx`/`releaseSlotsForRegistrationInTx`/`SlotMutationContext`(PR-1b)·`seedBracketTournament`/`seedSupportAdmin`(PR-1b 테스트 헬퍼)를 **import 만** 한다 — 같은 일을 하는 함수·시드를 새로 만들지 않는다. 리그에는 조(group)가 없어 `releaseUnusedGroupTeamsInTx` 는 호출하지 않는다. 이 PR 이 **생산**하는 이름은 `excludeUnfilledSlotFixturesWhere`/`…Sql`, `assignLeagueFixtureSideInTx`, `promoteLeagueWhenSlotsFilledInTx`, `LeagueMatchAdminService.applyTemplate`, `ApplyLeagueTemplateDto.placeName` 뿐이다.
- 로컬 `next`·alpha 에 **쓰지 않는다**(Task 20 의 alpha 비교와 「머지 후 확인」 스모크는 GET 읽기 전용 — 어드민 GET 은 로그인 쿠키만 발급받는다). 이 PR 은 API 만 바꾼다(웹은 PR-5b).

## File Structure

**Create (api src)**
- `apps/v1_api/src/common/competition/unfilled-slot-gate.ts` — 공개 게이트 술어 하나의 세 표현(Prisma where · raw SQL · TS 판정). 새 공개 쿼리가 가져다 쓰는 유일한 출처.
- `apps/v1_api/src/common/competition/unfilled-slot-gate.spec.ts` — SQL alias 검증·TS 판정 unit.
- `apps/v1_api/src/league-matches/league-fixture-side-assignment.ts` — `assignLeagueFixtureSideInTx`: 리그 경기 한 사이드에 팀을 넣고/빼고 팀 일정·신청서·명단 이벤트를 맞춘다.
- `apps/v1_api/src/league-matches/league-slot-status.ts` — `promoteLeagueWhenSlotsFilledInTx`: 자리를 쓰는 경기가 모두 찼을 때 리그를 진행 상태로(조건부).
- `apps/v1_api/src/league-matches/league-template-plan.ts` + `.spec.ts` — 리그 라운드로빈 빈 경기 계획(순수).

**Create (api test)**
- `apps/v1_api/test/league-matches/helpers/league-slot-harness.ts` — 통합 스펙 공용: 리그 전용 시드(정규 리그·자리·팀·경기)만 둔다. support 어드민은 PR-1b 의 `test/helpers/bracket-canvas-fixture.ts` `seedSupportAdmin` 을 import 한다(어드민 시드 중복 금지).
- `apps/v1_api/test/league-matches/league-slot-fixture-creation.integration-spec.ts`
- `apps/v1_api/test/league-matches/league-fixture-side-assignment.integration-spec.ts`
- `apps/v1_api/test/league-matches/league-slot-status.integration-spec.ts`
- `apps/v1_api/test/league-matches/league-template.integration-spec.ts`
- `apps/v1_api/test/league-matches/league-slot-cancel-regenerate.integration-spec.ts`
- `apps/v1_api/test/league-matches/league-slot-assignment-lane.integration-spec.ts`
- `apps/v1_api/test/league-matches/league-slot-registration-release.integration-spec.ts`
- `apps/v1_api/test/league-matches/league-unfilled-gate.integration-spec.ts` — 5종 대조군 × 공개 경로 전부.
- `apps/v1_api/test/league-matches/league-slot-admin-view.integration-spec.ts`

**Modify**
- `apps/v1_api/src/league-matches/league-fixture-creation.ts` — `createLeagueFixture` 가 팀 null + 자리 id 를 받는다.
- `apps/v1_api/src/tournaments/tournament-match-update.ts` — `invalidateLineupAndTactics`·`upsertSchedule` 에 `export` 만 추가.
- `apps/v1_api/src/league-matches/league-match-admin.service.ts` — 가드 import 교체 · `applyTemplate` · 취소 헬퍼(`cancelLeagueFixtureRowInTx`) · 재생성 409 · `requireLeagueHostTeamId` 삭제 · `removeTeam` 자리 해제 · 어드민 상세/참가팀 응답 확장.
- `apps/v1_api/src/league-matches/league-match-admin.controller.ts` — `POST :leagueId/fixtures/template`.
- `apps/v1_api/src/league-matches/dto/league-match.dto.ts` — `ApplyLeagueTemplateDto`.
- `apps/v1_api/src/league-matches/league-fixture-list-source.ts` — `publicLeagueFixtureListWhere`.
- `apps/v1_api/src/league-matches/league-match-public.service.ts` — 일정·순위에 게이트.
- `apps/v1_api/src/tournaments/tournaments-read.service.ts` — 통합 상세의 리그 경기·진행률에 게이트.
- `apps/v1_api/src/games/public-records/public-tournament-records.service.ts` — 기록 일정·경기 상세에 게이트, 주차 집합 분리.
- `apps/v1_api/src/team-matches/team-matches.service.ts` — 공개 목록(sitemap 원천)·상세·마이 팀매치 전 범위에 게이트.
- `apps/v1_api/src/league-matches/league-fixture-videos.service.ts` — 어드민 영상 목록이 host null 을 허용.
- `apps/v1_api/src/jobs/league-reminders/league-result-entry-reminder.service.ts` — 팀이 빈 경기는 리마인더 생략.
- `apps/v1_api/src/tournaments/slots/tournament-slot.service.ts` (PR-1b 산출물) — `assertTournamentLane` 삭제, 리그 사이드 배정 분기·상태 전이 연결.
- `apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts` · `docs/api/domains/tournaments.md` (PR-1b 산출물) — `SLOT_LEAGUE_NOT_SUPPORTED_YET` 단언·설명 제거.
- `apps/v1_api/test/jobs/league-result-entry-reminder.integration-spec.ts` — 빈 경기 케이스 추가.
- `apps/v1_api/src/league-matches/league-match-admin.service.spec.ts` · `league-fixture-videos.service.spec.ts` — 기존 가짜 tx/행을 새 select·호출에 맞춤(해당 Task 의 단계에 명시).
- `docs/api/domains/league-matches.md` · `.changeset/league-slot-template-backend.md`.

### Task 0: 선행 PR 산출물 확인 (코드 변경 없음)

**Files:** 없음(읽기 전용).

- [ ] **Step 1: 이 PR 이 소비하는 심볼이 브랜치에 있는지 확인한다**

```bash
cd apps/v1_api
grep -c "model V1TournamentSlot" prisma/schema.prisma; grep -c "homeSlotId" prisma/schema.prisma
grep -n "export function tournamentSlotLabel" src/tournaments/slots/tournament-slot-label.ts
grep -n "export function revisionEntryMethod\|QUICK_RESULT_REASON_MARKER" src/tournament-operations/results/quick-result.constants.ts
grep -n "export type BracketTxDeps\|export async function assignTournamentFixtureSideInTx" src/tournaments/tournament-bracket-tx.ts
grep -n "export async function assertLeagueFixtureGenerationAllowedInTx" src/league-matches/league-fixture-generation-guard.ts
grep -n "export async function lockCompetitionForSlotReleaseInTx\|export async function lockCompetitionForBracketMutationInTx" src/tournaments/slots/competition-bracket-lock.ts
grep -n "export type SlotMutationContext\|export async function assignSlotInTx\|export async function assignSlotsBatchInTx\|export async function releaseSlotsForRegistrationInTx\|assertTournamentLane" src/tournaments/slots/tournament-slot.service.ts
grep -n "export const BRACKET_TEMPLATE_MAX_FIXTURES" src/tournaments/templates/bracket-template-plan.ts
# 어드민 응답 직렬화(PR-1a) — Task 18 이 import 만 한다(리그 전용 직렬화 파일을 만들지 않는다)
grep -n "export function serializeAdminBracketSlot\|export function serializeAdminBracketGame\|export const adminBracketSlotInclude" src/tournaments/slots/admin-bracket-view.ts
# 통합 스펙 시드(PR-1b) — Task 2 하네스가 seedSupportAdmin 을 import 한다
grep -n "export async function seedBracketTournament\|export async function seedSupportAdmin" test/helpers/bracket-canvas-fixture.ts
# 그룹 팀 해제 헬퍼(PR-1b) — 리그 자리는 조가 없어 이 PR 이 호출하지 않지만 assignSlotCore 의 releases 인자가 이것에서 온다. 위치는 PR-1b 구현을 따른다
grep -rn "export async function releaseUnusedGroupTeamsInTx" src/tournaments
```
Expected: 각 줄이 한 건 이상 나오고, `tournament-slot.service.ts` 줄에 `assertTournamentLane` 이 **정의 1 + 호출 2**(`assignSlotCore`·`randomFill`)로 나온다. 하나라도 비면 **멈추고 PR-1a/1b 머지를 기다린다**(이 PR 은 그 위에 얹힌다). PR-1b 에서 `SLOT_LEAGUE_NOT_SUPPORTED_YET` 를 단언하는 테스트 위치도 적어 둔다(Task 10 이 뒤집는다):

```bash
grep -rn "SLOT_LEAGUE_NOT_SUPPORTED_YET" src test ../../docs | cut -c1-150
```

### Task 1: 공개 게이트 술어 헬퍼

공개 노출 규칙을 코드 세 곳에 따로 적지 않도록 술어를 한 파일에 둔다. 이 Task 는 헬퍼만 만들고 쓰는 곳은 Task 4·6·8·12~16 이 붙인다.

**Files:**
- Create: `apps/v1_api/src/common/competition/unfilled-slot-gate.ts`
- Test: `apps/v1_api/src/common/competition/unfilled-slot-gate.spec.ts`

**Interfaces:**
- Produces:
  - `unfilledSlotFixtureWhere(): Prisma.V1TeamMatchWhereInput` — `{ OR: [{ homeSlotId: { not: null }, hostTeamId: null }, { awaySlotId: { not: null }, approvedApplicantTeamId: null }] }`
  - `excludeUnfilledSlotFixturesWhere(): Prisma.V1TeamMatchWhereInput` — `{ NOT: unfilledSlotFixtureWhere() }` (계약과 같은 모양)
  - `excludeUnfilledSlotFixturesSql(alias: string): Prisma.Sql`
  - `isUnfilledSlotFixture(row: { homeSlotId: string | null; awaySlotId: string | null; hostTeamId: string | null; approvedApplicantTeamId: string | null }): boolean`

- [ ] **Step 1: 실패하는 unit 테스트를 쓴다**

`apps/v1_api/src/common/competition/unfilled-slot-gate.spec.ts`:

```ts
import { excludeUnfilledSlotFixturesSql, isUnfilledSlotFixture } from './unfilled-slot-gate';

describe('isUnfilledSlotFixture — 자리에 연결됐는데 팀이 빈 사이드가 있는가', () => {
  const filled = { homeSlotId: 's1', awaySlotId: 's2', hostTeamId: 'a', approvedApplicantTeamId: 'b' };

  it('자리 두 곳 모두 팀이 찼으면 false', () => {
    expect(isUnfilledSlotFixture(filled)).toBe(false);
  });

  it('홈 자리만 비었거나, 원정 자리만 비었거나, 둘 다 비면 true (반쪽 경기 포함)', () => {
    expect(isUnfilledSlotFixture({ ...filled, hostTeamId: null })).toBe(true);
    expect(isUnfilledSlotFixture({ ...filled, approvedApplicantTeamId: null })).toBe(true);
    expect(isUnfilledSlotFixture({ ...filled, hostTeamId: null, approvedApplicantTeamId: null })).toBe(true);
  });

  it('대조군: 자리 없는 기존 경기는 원정이 null 이어도 false — 게이트가 기존 경기를 가리면 안 된다', () => {
    expect(
      isUnfilledSlotFixture({ homeSlotId: null, awaySlotId: null, hostTeamId: 'a', approvedApplicantTeamId: null }),
    ).toBe(false);
  });

  it('홈만 자리에 연결된 경기는 홈 팀만 본다', () => {
    const homeOnly = { homeSlotId: 's1', awaySlotId: null, hostTeamId: 'a', approvedApplicantTeamId: null };
    expect(isUnfilledSlotFixture(homeOnly)).toBe(false);
    expect(isUnfilledSlotFixture({ ...homeOnly, hostTeamId: null })).toBe(true);
  });
});

describe('excludeUnfilledSlotFixturesSql — alias 는 식별자만 받는다', () => {
  it('네 컬럼 모두 alias 로 한정한다', () => {
    const { sql } = excludeUnfilledSlotFixturesSql('team_match');
    for (const column of ['home_slot_id', 'host_team_id', 'away_slot_id', 'approved_applicant_team_id']) {
      expect(sql).toContain(`team_match.${column}`);
    }
  });

  it('식별자가 아닌 alias 는 던진다 — raw 조각에 문자열이 그대로 들어가기 때문이다', () => {
    expect(() => excludeUnfilledSlotFixturesSql('tm; DROP TABLE v1_users')).toThrow();
    expect(() => excludeUnfilledSlotFixturesSql('')).toThrow();
    expect(() => excludeUnfilledSlotFixturesSql('1tm')).toThrow();
  });
});
```

- [ ] **Step 2: 실행해 실패를 확인한다**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/common/competition/unfilled-slot-gate.spec.ts
```
Expected: FAIL — `Cannot find module './unfilled-slot-gate'`.

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/common/competition/unfilled-slot-gate.ts`:

```ts
import { Prisma } from '@prisma/client';

/**
 * 정규 리그 빈 경기 공개 게이트의 **유일한 출처**.
 *
 * 자리(slot)에 연결됐는데 그 사이드의 팀이 비어 있는 경기는 공개 화면 어디에도 나가면 안 된다 —
 * 반쪽만 찬 경기도 같다(팀 일정은 양 팀이 다 찼을 때만 생기므로 일정 링크가 404 가 된다).
 * 자리가 없는 기존 경기는 원정이 null 이어도 이 술어에 걸리지 않는다.
 */
export function unfilledSlotFixtureWhere(): Prisma.V1TeamMatchWhereInput {
  return {
    OR: [
      { homeSlotId: { not: null }, hostTeamId: null },
      { awaySlotId: { not: null }, approvedApplicantTeamId: null },
    ],
  };
}

export function excludeUnfilledSlotFixturesWhere(): Prisma.V1TeamMatchWhereInput {
  return { NOT: unfilledSlotFixtureWhere() };
}

const SQL_ALIAS = /^[a-z_][a-z0-9_]*$/i;

/** raw SQL 용 같은 술어. `alias` 는 `Prisma.raw` 로 들어가므로 식별자 모양만 받는다. */
export function excludeUnfilledSlotFixturesSql(alias: string): Prisma.Sql {
  if (!SQL_ALIAS.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  const a = Prisma.raw(alias);
  return Prisma.sql`NOT ((${a}.home_slot_id IS NOT NULL AND ${a}.host_team_id IS NULL) OR (${a}.away_slot_id IS NOT NULL AND ${a}.approved_applicant_team_id IS NULL))`;
}

export function isUnfilledSlotFixture(row: {
  homeSlotId: string | null;
  awaySlotId: string | null;
  hostTeamId: string | null;
  approvedApplicantTeamId: string | null;
}): boolean {
  return (
    (row.homeSlotId !== null && row.hostTeamId === null) ||
    (row.awaySlotId !== null && row.approvedApplicantTeamId === null)
  );
}
```

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/common/competition/unfilled-slot-gate.spec.ts
```
Expected: PASS (6 tests). (진단을 끈 임시 설정이 필요하면 Global Constraints 참고 — `Prisma.V1TeamMatchWhereInput` 의 `homeSlotId` 가 공유 client 에 없다.)

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(league): 자리 미배정 경기 공개 게이트 술어 헬퍼" -- apps/v1_api/src/common/competition/unfilled-slot-gate.ts apps/v1_api/src/common/competition/unfilled-slot-gate.spec.ts
git show --stat HEAD
```

### Task 2: 팀 null + 자리 id 를 받는 `createLeagueFixture` (+ 통합 스펙 공용 하네스)

`createLeagueFixture`(`league-matches/league-fixture-creation.ts`)는 지금 양 팀이 non-null 이라고 가정하고 팀 일정 2건·승인 신청서·참가자를 만든다. 템플릿의 빈 경기를 만들려면 팀이 null 일 때 이 셋을 만들지 않고 사이드 이름을 '미정'으로 둬야 한다(대회 쪽 `createTournamentMatchInTx` 가 이미 같은 규칙 — `grep -n "export async function createTournamentMatchInTx" src/tournaments/tournament-match-creation.ts`).

**Files:**
- Create: `apps/v1_api/test/league-matches/helpers/league-slot-harness.ts`
- Create: `apps/v1_api/test/league-matches/league-slot-fixture-creation.integration-spec.ts`
- Modify: `apps/v1_api/src/league-matches/league-fixture-creation.ts` (`LeagueFixtureCreationInput` 타입, `createLeagueFixture` 본문)

**Interfaces:**
- Consumes: `GamesService.createFromSourceInTransaction`(sides 의 `teamId` 가 null 이어도 된다 — 대회 빈 경기가 이미 그렇게 호출한다), `createTeamMatchScheduleInTx`(`team-schedules/team-schedules.service`), `scheduleLeagueResultEntryReminder`.
- Produces: `LeagueFixtureCreationInput.home: LeagueFixtureTeam | null`, `away: LeagueFixtureTeam | null`, `homeSlotId?: string | null`, `awaySlotId?: string | null` — 반환은 그대로 `Promise<string>`(teamMatchId).

- [ ] **Step 1: 공용 하네스를 만든다** (이후 모든 통합 스펙이 쓴다)

`apps/v1_api/test/league-matches/helpers/league-slot-harness.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { AdminContextService, type V1ActiveAdmin } from '../../../src/common/admin-context.service';
import { GamesService } from '../../../src/games/games.service';
import {
  createLeagueFixture,
  loadLeagueTeamRosters,
} from '../../../src/league-matches/league-fixture-creation';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { resolveTeamMatchCompetitionConfig } from '../../../src/team-matches/resolve-team-match-competition-config';
import { ManagedTermsRuntimeService } from '../../../src/terms/managed-terms-runtime.service';
import { seedLeagueOnTournamentAxis } from '../../fixtures/league-on-tournament-axis.fixture';
import { seedSupportAdmin } from '../../helpers/bracket-canvas-fixture';

export interface HarnessTeam {
  id: string;
  name: string;
}

export interface HarnessFixtureInput {
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeSlotId?: string | null;
  awaySlotId?: string | null;
  startAt?: Date;
  title?: string;
}

/** 리그 자리·빈 경기 통합 스펙의 공통 시드. 스펙마다 손으로 적으면 필드 매핑이 갈린다. */
export async function createLeagueSlotHarness(app: INestApplication, label: string) {
  const prisma = app.get(PrismaService);
  const games = app.get(GamesService);
  const suiteId = randomUUID().slice(0, 8);
  const terms = app.get(ManagedTermsRuntimeService);
  const signupTerms = await terms.currentSignupTerms();
  /** 약관 동의가 없으면 역할과 무관하게 403 이라 권한 테스트가 엉뚱한 이유로 통과한다. */
  const acceptRequiredTerms = (userId: string) =>
    terms.acceptSignupTerms(
      userId,
      signupTerms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    );
  const verifiedPhoneAt = new Date('2026-08-01T00:00:00.000Z');
  const adminUserId = `${label}-admin-${suiteId}`;
  await prisma.v1User.create({
    data: { id: adminUserId, email: `${adminUserId}@integration.test`, onboardingStatus: 'completed', phoneVerifiedAt: verifiedPhoneAt, accountStatus: 'active' },
  });
  await acceptRequiredTerms(adminUserId);
  await prisma.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'owner' } });
  const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
  const region = await prisma.v1Region.create({ data: { code: `${label}-region-${suiteId}`, name: `${label} 지역`, level: 2 } });
  const config = await resolveTeamMatchCompetitionConfig(prisma, sport.id);
  if (config === null) throw new Error('futsal competition config is missing in the test DB');
  const admin: V1ActiveAdmin = await app.get(AdminContextService).getMutationAdmin(adminUserId);
  let seq = 0;

  return {
    prisma,
    games,
    adminUserId,
    admin,
    sportId: sport.id,
    regionId: region.id,

    /**
     * 팀마다 **자기 팀장 계정**을 따로 만든다 — 한 사용자를 여러 팀 명단에 올리면 리그 자동 명단 채우기가
     * 팀 간 중복 선수로 부딪힌다.
     */
    async makeTeam(name: string): Promise<HarnessTeam> {
      seq += 1;
      const ownerId = `${label}-owner-${suiteId}-${seq}`;
      await prisma.v1User.create({
        data: { id: ownerId, email: `${ownerId}@integration.test`, onboardingStatus: 'completed', accountStatus: 'active' },
      });
      const team = await prisma.v1Team.create({
        data: { ownerUserId: ownerId, sportId: sport.id, regionId: region.id, name: `${name}-${suiteId}-${seq}` },
      });
      await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: ownerId, role: 'owner', status: 'active' } });
      return { id: team.id, name: team.name };
    },

    /**
     * 약관 동의까지 마친 어드민 계정. support 는 PR-1b 의 `seedSupportAdmin`(test/helpers/bracket-canvas-fixture.ts)을
     * 그대로 쓰고 HTTP 경로에 필요한 휴대폰 인증·약관만 얹는다 — 어드민 시드를 두 벌 두지 않는다.
     */
    async makeAdmin(adminRole: 'owner' | 'ops' | 'support'): Promise<string> {
      seq += 1;
      if (adminRole === 'support') {
        const support = await seedSupportAdmin(prisma, `${label}-support-${suiteId}-${seq}`);
        await prisma.v1User.update({ where: { id: support.id }, data: { phoneVerifiedAt: verifiedPhoneAt } });
        await acceptRequiredTerms(support.id);
        return support.id;
      }
      const userId = `${label}-${adminRole}-${suiteId}-${seq}`;
      await prisma.v1User.create({
        data: { id: userId, email: `${userId}@integration.test`, onboardingStatus: 'completed', phoneVerifiedAt: verifiedPhoneAt, accountStatus: 'active' },
      });
      await acceptRequiredTerms(userId);
      await prisma.v1AdminUser.create({ data: { userId, adminRole } });
      return userId;
    },

    /** 경기가 만들어진 **뒤에** 부르면 명단 자동 채우기와 겹치지 않는다. */
    async joinTeam(userId: string, teamId: string): Promise<void> {
      await prisma.v1TeamMembership.create({ data: { teamId, userId, role: 'member', status: 'active' } });
    },

    /** `teams` 는 확정 등록으로 참가한다. `state` 기본은 draft. */
    async makeLeague(options: { teams?: HarnessTeam[]; state?: 'draft' | 'active' | 'completed' } = {}): Promise<string> {
      seq += 1;
      const league = await seedLeagueOnTournamentAxis(prisma, {
        title: `${label} 리그 ${suiteId}-${seq}`,
        sportId: sport.id,
        regionId: region.id,
        state: options.state ?? 'draft',
        teamIds: (options.teams ?? []).map((team) => team.id),
        appliedByUserId: adminUserId,
      });
      return league.id;
    },

    async makeSlots(leagueId: string, count: number): Promise<Array<{ id: string; position: number }>> {
      const slots: Array<{ id: string; position: number }> = [];
      for (let position = 1; position <= count; position += 1) {
        const row = await prisma.v1TournamentSlot.create({ data: { tournamentId: leagueId, kind: 'ENTRY', position } });
        slots.push({ id: row.id, position: row.position });
      }
      return slots;
    },

    async registrationId(leagueId: string, teamId: string): Promise<string> {
      const row = await prisma.v1TournamentRegistration.findUniqueOrThrow({
        where: { tournamentId_teamId: { tournamentId: leagueId, teamId } },
        select: { id: true },
      });
      return row.id;
    },

    /** 팀·자리를 마음대로 조합한 경기 한 건 — 운영 코드와 같은 `createLeagueFixture` 로 만든다. */
    async createFixture(leagueId: string, input: HarnessFixtureInput = {}): Promise<string> {
      seq += 1;
      const teamIds = [input.homeTeamId, input.awayTeamId].filter((id): id is string => typeof id === 'string');
      return prisma.$transaction(async (tx) => {
        const teams = await loadLeagueTeamRosters(tx, leagueId, teamIds);
        const pick = (teamId: string | null | undefined) => {
          if (typeof teamId !== 'string') return null;
          const team = teams.get(teamId);
          if (team === undefined) throw new Error(`team ${teamId} is not active`);
          return team;
        };
        return createLeagueFixture(tx, games, {
          leagueId,
          adminUserId,
          sportId: sport.id,
          regionId: region.id,
          competitionConfigId: config.id,
          title: input.title ?? `슬롯 하네스 대진 ${seq}`,
          placeName: '테스트 구장',
          startAt: input.startAt ?? new Date(Date.now() + (seq + 7) * 86_400_000),
          endAt: null,
          home: pick(input.homeTeamId),
          away: pick(input.awayTeamId),
          homeSlotId: input.homeSlotId ?? null,
          awaySlotId: input.awaySlotId ?? null,
        });
      });
    },
  };
}

export type LeagueSlotHarness = Awaited<ReturnType<typeof createLeagueSlotHarness>>;
```

- [ ] **Step 2: 실패하는 통합 스펙을 쓴다**

`apps/v1_api/test/league-matches/league-slot-fixture-creation.integration-spec.ts`:

```ts
import type { INestApplication } from '@nestjs/common';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

describe('createLeagueFixture — 팀 null + 자리 id', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lsfc');
  });
  afterAll(async () => cleanup?.());

  it('두 사이드가 모두 비면 팀 일정·참가자·신청서 없이 matched 경기와 "미정" 사이드가 생긴다', async () => {
    const leagueId = await h.makeLeague();
    const [slotA, slotB] = await h.makeSlots(leagueId, 2);
    const teamMatchId = await h.createFixture(leagueId, { homeSlotId: slotA.id, awaySlotId: slotB.id });

    const teamMatch = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    expect(teamMatch).toMatchObject({
      hostTeamId: null,
      approvedApplicantTeamId: null,
      status: 'matched',
      homeSlotId: slotA.id,
      awaySlotId: slotB.id,
      leagueId,
      tournamentId: leagueId,
    });
    const game = await h.prisma.v1Game.findUniqueOrThrow({
      where: { teamMatchId },
      include: { sides: { orderBy: { sideKey: 'asc' } }, participants: true },
    });
    expect(game.sides.map((side) => [side.sideKey, side.teamId, side.displayNameSnapshot])).toEqual([
      ['AWAY', null, '어웨이 팀 미정'],
      ['HOME', null, '홈 팀 미정'],
    ]);
    expect(game.participants).toHaveLength(0);
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatchId } })).toBe(0);
    expect(await h.prisma.v1TeamMatchApplication.count({ where: { teamMatchId } })).toBe(0);
    // 결과 입력 리마인더는 시작 시각만 있으면 예약된다 — 발화 시점에 팀이 비어 있으면 건너뛴다(Task 16).
    const reminders = await h.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v1_outbox_events WHERE aggregate_id = ${teamMatchId} AND type = 'LEAGUE_RESULT_ENTRY_REMINDER'`;
    expect(reminders).toHaveLength(1);
  });

  it('양 팀이 모두 정해지면 기존과 같다 — 팀 일정 2건 + 승인 신청서 + 자리 연결', async () => {
    const teamA = await h.makeTeam('lsfc-a');
    const teamB = await h.makeTeam('lsfc-b');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    const [slotA, slotB] = await h.makeSlots(leagueId, 2);
    const teamMatchId = await h.createFixture(leagueId, {
      homeTeamId: teamA.id,
      awayTeamId: teamB.id,
      homeSlotId: slotA.id,
      awaySlotId: slotB.id,
    });

    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatchId, state: 'SCHEDULED' } })).toBe(2);
    const application = await h.prisma.v1TeamMatchApplication.findUniqueOrThrow({
      where: { teamMatchId_applicantTeamId: { teamMatchId, applicantTeamId: teamB.id } },
    });
    expect(application).toMatchObject({ status: 'approved', message: '리그 대진 편성' });
    const teamMatch = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    expect(teamMatch).toMatchObject({ hostTeamId: teamA.id, approvedApplicantTeamId: teamB.id, homeSlotId: slotA.id });
  });

  it('대조군: 자리 id 를 주지 않으면 자리 컬럼은 null 이고 일반 대진처럼 동작한다', async () => {
    const teamA = await h.makeTeam('lsfc-c');
    const teamB = await h.makeTeam('lsfc-d');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    const teamMatchId = await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id });
    const teamMatch = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    expect(teamMatch.homeSlotId).toBeNull();
    expect(teamMatch.awaySlotId).toBeNull();
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatchId } })).toBe(2);
  });
});
```

- [ ] **Step 3: 실행해 실패를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -n "league-slot-harness\|league-fixture-creation" | head
```
Expected(로컬): `home: LeagueFixtureTeam | null` 대입이 `Type 'null' is not assignable to type 'LeagueFixtureTeam'` 로 실패, `homeSlotId` 가 `LeagueFixtureCreationInput` 에 없다는 오류. CI 통합: 첫 케이스가 `Cannot read properties of null (reading 'id')` 로 FAIL.

- [ ] **Step 4: `createLeagueFixture` 를 고친다**

`league-fixture-creation.ts` 의 `LeagueFixtureCreationInput` 에서 `home`·`away` 필드(`grep -n "home: LeagueFixtureTeam\|away: LeagueFixtureTeam" src/league-matches/league-fixture-creation.ts`)를 바꾼다:

```ts
  /** null = 아직 팀이 정해지지 않은 사이드(정규 리그 템플릿의 빈 경기). */
  home: LeagueFixtureTeam | null;
  away: LeagueFixtureTeam | null;
  /** 자리(`V1TournamentSlot`) 연결. 팀이 null 이어도 자리 id 는 채운다. */
  homeSlotId?: string | null;
  awaySlotId?: string | null;
```

`createLeagueFixture` 함수 본문 전체(`grep -n "export async function createLeagueFixture"` 부터 함수 끝까지)를 아래로 교체한다(① 팀매치 ~ ⑤ 리마인더 순서와 주석 요지는 유지, 팀 null 분기만 추가):

```ts
const UNDECIDED_SIDE_NAME = { HOME: '홈 팀 미정', AWAY: '어웨이 팀 미정' } as const;

export async function createLeagueFixture(
  tx: Prisma.TransactionClient,
  games: GamesService,
  input: LeagueFixtureCreationInput,
): Promise<string> {
  const { home, away, title, startAt } = input;
  // 종료 시각을 안 받았으면(대진 생성에서 경기 시간을 비움·수동 대진 길이 미입력) 시작 + 경기 설정의
  // 정규 시간(연장 제외 피리어드 합계)으로 채운다 — 비워 두면 일정·캘린더가 끝을 모르는 경기가 된다.
  const endAt = input.endAt ?? await defaultFixtureEndAt(tx, input.competitionConfigId, startAt);

  // ① 팀매치. 리그 대진은 생성 시점에 곧바로 matched 다 — 팀이 비어 있어도 같다(대회 빈 경기와 같은 규칙).
  const teamMatch = await tx.v1TeamMatch.create({
    data: {
      hostTeamId: home?.id ?? null,
      createdByUserId: input.adminUserId,
      sportId: input.sportId,
      regionId: input.regionId,
      title,
      placeName: input.placeName,
      startAt,
      endAt: endAt ?? undefined,
      status: 'matched',
      approvedApplicantTeamId: away?.id ?? null,
      homeSlotId: input.homeSlotId ?? null,
      awaySlotId: input.awaySlotId ?? null,
      competitionConfigVersionId: input.competitionConfigId,
      // A league match is also an official tournament-scoped TeamMatch. Keep
      // the canonical ownership column populated at creation time so audit
      // rows can use the composite (tournamentId, teamMatchId) scope without
      // mutating historical rows from the audit writer.
      tournamentId: input.leagueId,
      leagueId: input.leagueId,
    },
  });

  // ② 양 팀의 팀 일정. 두 팀이 **모두** 정해졌을 때만 만든다 — 반쪽 경기는 공개 게이트로 숨겨져
  //    일정 링크가 404 가 되기 때문이다(자리 배정이 양 팀이 찬 순간 만든다: league-fixture-side-assignment.ts).
  //    title/startAt/endAt 은 방금 create 에 넘긴 것과 **같은 로컬 변수**를 재사용한다.
  if (home !== null && away !== null) {
    await createTeamMatchScheduleInTx(tx, home.id, teamMatch.id, title, startAt, endAt);
    await createTeamMatchScheduleInTx(tx, away.id, teamMatch.id, title, startAt, endAt);
  }

  // ③ 게임 + 사이드 2개 + 자동 로스터. 팀이 없는 사이드는 참가자 없이 '미정' 이름으로 둔다.
  await games.createFromSourceInTransaction(
    tx,
    {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: teamMatch.id,
      competitionConfigVersionId: input.competitionConfigId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: home?.id ?? null, displayNameSnapshot: home?.name ?? UNDECIDED_SIDE_NAME.HOME },
        { sideKey: V1GameSideKey.AWAY, teamId: away?.id ?? null, displayNameSnapshot: away?.name ?? UNDECIDED_SIDE_NAME.AWAY },
      ],
      participants: [
        ...(home === null ? [] : fixtureRoster(home, V1GameSideKey.HOME)),
        ...(away === null ? [] : fixtureRoster(away, V1GameSideKey.AWAY)),
      ],
    },
    {
      actor: { actorType: 'USER', actorUserId: input.adminUserId, role: 'platform_ops' },
      expectedVersion: 0,
      durableCommandId: `league-fixture-create:${teamMatch.id}`,
      payloadHash: canonicalGameCommandPayloadHash({ teamMatchId: teamMatch.id, leagueId: input.leagueId }),
    },
  );

  // ④ 승인된 신청서 — 원정 팀이 있을 때만.
  if (away !== null) {
    await tx.v1TeamMatchApplication.create({
      data: {
        teamMatchId: teamMatch.id,
        applicantTeamId: away.id,
        appliedByUserId: input.adminUserId,
        status: 'approved',
        reviewedByUserId: input.adminUserId,
        reviewedAt: new Date(),
        // 자동 생성과 수동 추가가 **같은 함수**를 쓰므로 경로를 단정하지 않는다 —
        // 이 문구는 어드민 화면(팀매치 상세의 applications.message)에 그대로 노출된다.
        message: LEAGUE_APPLICATION_MESSAGE,
      },
    });
  }

  // ⑤ 결과 입력 리마인더. 사용자 확정: 경기 시작 +24시간에도 결과 미입력이면 운영자
  //    리마인더 1회. updateFixture() 가 시작 시각을 바꾸면 새 세대로 다시 스케줄한다.
  await scheduleLeagueResultEntryReminder(tx, { teamMatchId: teamMatch.id, startAt });

  return teamMatch.id;
}
```

같은 파일 상단에 상수를 둔다(자리 배정 파일이 신청서 문구를 공유한다):

```ts
/** 어드민 팀매치 상세(applications.message)에 그대로 노출되는 문구 — 생성·자리 배정이 같은 값을 쓴다. */
export const LEAGUE_APPLICATION_MESSAGE = '리그 대진 편성';
```
그리고 파일 머리 doc 주석의 "다섯 가지" 목록 2·4번 줄 끝에 `(팀이 모두 정해졌을 때만)`·`(원정 팀이 있을 때만)` 을 덧붙인다.

- [ ] **Step 5: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-fixture-creation\|league-slot-harness"
```
Expected: `0`(해당 두 파일 오류 없음. 이미 있던 무관한 오류는 `grep` 에 안 걸림). CI: `league-slot-fixture-creation.integration-spec.ts` 3건 PASS, 기존 `league-match-admin.service.spec.ts` 의 "자동·수동 다섯 가지" 단언 PASS 유지:

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/league-matches/league-match-admin.service.spec.ts
```
Expected: PASS(기존 케이스 전부 — 양 팀 non-null 경로는 동작이 같다).

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(league): createLeagueFixture 가 팀 null + 자리 id 를 받는다" -- apps/v1_api/src/league-matches/league-fixture-creation.ts apps/v1_api/test/league-matches/helpers/league-slot-harness.ts apps/v1_api/test/league-matches/league-slot-fixture-creation.integration-spec.ts
git show --stat HEAD
```

### Task 3: 리그 사이드 배정 `assignLeagueFixtureSideInTx`

대회 `updateTournamentMatchInTx`(`tournaments/tournament-match-update.ts`)의 사이드·팀 일정·명단 처리를 리그 경기(Details 없음)로 이식한다. 리그 고유 규칙 둘: ① **팀 일정은 양 팀이 모두 정해진 순간에 두 팀 몫을 만들고, 한쪽이 비면 두 팀 몫을 모두 취소한다.** ② **원정 승인 신청서는 `(teamMatchId, applicantTeamId)` 유일 제약 때문에 upsert** 한다.

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournament-match-update.ts` 의 `invalidateLineupAndTactics`·`upsertSchedule` — `export` 키워드만 추가
- Create: `apps/v1_api/src/league-matches/league-fixture-side-assignment.ts`
- Test: `apps/v1_api/test/league-matches/league-fixture-side-assignment.integration-spec.ts`

**Interfaces:**
- Consumes: `invalidateLineupAndTactics(tx, gameId, sideId): Promise<string | null>`, `upsertSchedule(tx, teamId, teamMatchId, title, startAt, endAt): Promise<void>`(둘 다 이 Task 에서 export), `revokeReplacedSideTeamAdjustments`(`games/roster/side-team-change.ts`), `enqueueRosterResync`·`competitionTeamTargets`(`games/roster/roster-resync-events.ts`), `cascadeCancelTeamMatchSchedulesInTx`, `BracketTxDeps`(PR-1a `tournaments/tournament-bracket-tx.ts`), `LEAGUE_APPLICATION_MESSAGE`(Task 2).
- Produces:
  ```ts
  export type LeagueSideAssignmentInput = { teamMatchId: string; side: 'HOME' | 'AWAY'; registrationId: string | null };
  export async function assignLeagueFixtureSideInTx(
    tx: Prisma.TransactionClient, _deps: BracketTxDeps, admin: V1ActiveAdmin, input: LeagueSideAssignmentInput,
  ): Promise<void>
  ```

- [ ] **Step 1: 실패하는 통합 스펙을 쓴다**

`apps/v1_api/test/league-matches/league-fixture-side-assignment.integration-spec.ts`:

```ts
import type { INestApplication } from '@nestjs/common';
import { assignLeagueFixtureSideInTx } from '../../src/league-matches/league-fixture-side-assignment';
import { drainOutboxWorker } from '../helpers/drain-outbox-worker';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type HarnessTeam, type LeagueSlotHarness } from './helpers/league-slot-harness';

describe('assignLeagueFixtureSideInTx — 리그 빈 경기에 팀 넣기/빼기', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let teamA: HarnessTeam;
  let teamB: HarnessTeam;
  let teamC: HarnessTeam;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lfsa');
    [teamA, teamB, teamC] = [await h.makeTeam('lfsa-a'), await h.makeTeam('lfsa-b'), await h.makeTeam('lfsa-c')];
  });
  afterAll(async () => cleanup?.());

  const assign = (teamMatchId: string, side: 'HOME' | 'AWAY', registrationId: string | null) =>
    h.prisma.$transaction((tx) => assignLeagueFixtureSideInTx(tx, { games: h.games }, h.admin, { teamMatchId, side, registrationId }));

  async function emptyFixture() {
    const leagueId = await h.makeLeague({ teams: [teamA, teamB, teamC] });
    const [home, away] = await h.makeSlots(leagueId, 2);
    const teamMatchId = await h.createFixture(leagueId, { homeSlotId: home.id, awaySlotId: away.id });
    const reg = {
      a: await h.registrationId(leagueId, teamA.id),
      b: await h.registrationId(leagueId, teamB.id),
      c: await h.registrationId(leagueId, teamC.id),
    };
    return { leagueId, teamMatchId, reg };
  }
  const schedules = (teamMatchId: string) =>
    h.prisma.v1TeamSchedule.findMany({ where: { teamMatchId }, select: { teamId: true, state: true } });
  const sideOf = async (teamMatchId: string, sideKey: 'HOME' | 'AWAY') => {
    const game = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    return h.prisma.v1GameSide.findUniqueOrThrow({ where: { gameId_sideKey: { gameId: game.id, sideKey } } });
  };

  it('한쪽만 채우면 사이드는 바뀌지만 팀 일정과 신청서는 아직 없다(반쪽 경기)', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);

    const teamMatch = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    expect(teamMatch).toMatchObject({ hostTeamId: teamA.id, approvedApplicantTeamId: null, status: 'matched' });
    expect(await sideOf(teamMatchId, 'HOME')).toMatchObject({ teamId: teamA.id, displayNameSnapshot: teamA.name });
    expect(await sideOf(teamMatchId, 'AWAY')).toMatchObject({ teamId: null, displayNameSnapshot: '어웨이 팀 미정' });
    expect(await schedules(teamMatchId)).toEqual([]);
    expect(await h.prisma.v1TeamMatchApplication.count({ where: { teamMatchId } })).toBe(0);
  });

  it('양쪽이 모두 차는 순간 팀 일정 2건 + 승인 신청서가 생기고, 명단은 이벤트 처리 뒤 채워진다', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);
    await assign(teamMatchId, 'AWAY', reg.b);

    expect((await schedules(teamMatchId)).map((row) => [row.teamId, row.state]).sort()).toEqual(
      [[teamA.id, 'SCHEDULED'], [teamB.id, 'SCHEDULED']].sort(),
    );
    expect(
      await h.prisma.v1TeamMatchApplication.findUniqueOrThrow({
        where: { teamMatchId_applicantTeamId: { teamMatchId, applicantTeamId: teamB.id } },
      }),
    ).toMatchObject({ status: 'approved', message: '리그 대진 편성', reviewedByUserId: h.adminUserId });

    await drainOutboxWorker(h.prisma);
    const game = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId }, include: { participants: true } });
    // 팀원이 팀장 한 명뿐인 하네스 팀이라 참가자는 팀당 1명이다 — 0이면 명단 재계산 이벤트가 안 만들어진 것이다.
    expect(game.participants.length).toBeGreaterThanOrEqual(2);
  });

  it('한쪽을 비우면 팀 일정 두 건이 모두 취소되고 신청서는 withdrawn 이 된다', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);
    await assign(teamMatchId, 'AWAY', reg.b);
    await assign(teamMatchId, 'AWAY', null);

    expect((await schedules(teamMatchId)).every((row) => row.state === 'CANCELLED')).toBe(true);
    expect(await schedules(teamMatchId)).toHaveLength(2);
    expect(
      await h.prisma.v1TeamMatchApplication.findUniqueOrThrow({
        where: { teamMatchId_applicantTeamId: { teamMatchId, applicantTeamId: teamB.id } },
      }),
    ).toMatchObject({ status: 'withdrawn' });
    expect(await sideOf(teamMatchId, 'AWAY')).toMatchObject({ teamId: null, displayNameSnapshot: '어웨이 팀 미정' });
  });

  it('원정 A→B→A 교체에서도 유일 제약 위반 없이 최종 팀만 approved 다', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.c);
    await assign(teamMatchId, 'AWAY', reg.a);
    await assign(teamMatchId, 'AWAY', reg.b);
    await assign(teamMatchId, 'AWAY', reg.a);

    const applications = await h.prisma.v1TeamMatchApplication.findMany({ where: { teamMatchId } });
    expect(applications.map((row) => [row.applicantTeamId, row.status]).sort()).toEqual(
      [[teamA.id, 'approved'], [teamB.id, 'withdrawn']].sort(),
    );
    const live = (await schedules(teamMatchId)).filter((row) => row.state === 'SCHEDULED');
    expect(live.map((row) => row.teamId).sort()).toEqual([teamA.id, teamC.id].sort());
  });

  it('팀을 바꾸면 이전 팀의 라인업이 무효화되고 활성 명단 조정이 시스템 회수된다', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);
    await assign(teamMatchId, 'AWAY', reg.b);
    await drainOutboxWorker(h.prisma);
    const game = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const awaySide = await sideOf(teamMatchId, 'AWAY');
    await h.prisma.v1GameRosterAdjustment.create({
      data: {
        gameId: game.id, sideId: awaySide.id, teamId: teamB.id, userId: h.adminUserId,
        action: 'EXCLUDE', actorUserId: h.adminUserId, actorRole: 'ADMIN',
      },
    });

    await assign(teamMatchId, 'AWAY', reg.c);

    const adjustments = await h.prisma.v1GameRosterAdjustment.findMany({ where: { gameId: game.id, sideId: awaySide.id } });
    expect(adjustments.every((row) => row.revokedAt !== null && row.revokedByRole === 'SYSTEM')).toBe(true);
    const invalidated = await h.prisma.v1GameLineup.count({
      where: { gameId: game.id, sideId: awaySide.id, invalidationReason: 'SIDE_TEAM_CHANGED' },
    });
    expect(invalidated).toBeGreaterThan(0);
  });

  it('같은 팀을 양쪽에 넣으면 400, 확정되지 않은 등록은 400 이고 아무것도 바뀌지 않는다', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);
    await expect(assign(teamMatchId, 'AWAY', reg.a)).rejects.toMatchObject({ response: { code: 'FIXTURE_SAME_TEAM' } });
    const otherLeague = await h.makeLeague({ teams: [teamB] });
    const foreignReg = await h.registrationId(otherLeague, teamB.id);
    await expect(assign(teamMatchId, 'AWAY', foreignReg)).rejects.toMatchObject({ response: { code: 'REGISTRATION_INVALID' } });
    const teamMatch = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    expect(teamMatch.approvedApplicantTeamId).toBeNull();
  });

  it('경기가 시작됐거나 공식 결과가 있으면 팀을 바꿀 수 없다(FIXTURE_HAS_RESULT)', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);
    await h.prisma.v1Game.update({ where: { teamMatchId }, data: { state: 'LIVE' } });
    await expect(assign(teamMatchId, 'HOME', reg.b)).rejects.toMatchObject({ response: { code: 'FIXTURE_HAS_RESULT' } });
    expect((await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).hostTeamId).toBe(teamA.id);
  });

  it('같은 값을 다시 넣으면 아무 일도 하지 않는다(멱등) — 게임 버전이 올라가지 않는다', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);
    const before = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    await assign(teamMatchId, 'HOME', reg.a);
    const after = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    expect(after.version).toBe(before.version);
  });
});
```

- [ ] **Step 2: 실행해 실패를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -n "league-fixture-side-assignment" | head -3
```
Expected(로컬): `Cannot find module '../../src/league-matches/league-fixture-side-assignment'`. CI: 스위트가 모듈 부재로 FAIL.

- [ ] **Step 3: 대회 쪽 두 헬퍼를 export 한다**

`tournaments/tournament-match-update.ts` 의 `async function invalidateLineupAndTactics(` 와 `async function upsertSchedule(` 두 선언 앞에 `export` 를 붙인다(본문 변경 없음). 대회 경로의 동작은 그대로다.

- [ ] **Step 4: 구현한다**

`apps/v1_api/src/league-matches/league-fixture-side-assignment.ts`:

```ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, V1GameSideKey } from '@prisma/client';
import type { V1ActiveAdmin } from '../common/admin-context.service';
import { competitionTeamTargets, enqueueRosterResync, type RosterResyncTarget } from '../games/roster/roster-resync-events';
import { revokeReplacedSideTeamAdjustments } from '../games/roster/side-team-change';
import { cascadeCancelTeamMatchSchedulesInTx } from '../team-schedules/team-schedules.service';
import type { BracketTxDeps } from '../tournaments/tournament-bracket-tx';
import { invalidateLineupAndTactics, upsertSchedule } from '../tournaments/tournament-match-update';
import { LEAGUE_APPLICATION_MESSAGE } from './league-fixture-creation';

type Tx = Prisma.TransactionClient;

export type LeagueSideAssignmentInput = {
  teamMatchId: string;
  side: 'HOME' | 'AWAY';
  registrationId: string | null;
};

const UNDECIDED_SIDE_NAME = { HOME: '홈 팀 미정', AWAY: '어웨이 팀 미정' } as const;
const SIDE_INCOMPLETE_CANCEL_REASON = 'LEAGUE_SLOT_SIDE_INCOMPLETE';
const TEAM_CHANGED_CANCEL_REASON = 'LEAGUE_SLOT_TEAM_CHANGED';

/**
 * 리그 경기 한 사이드의 팀을 바꾼다(null = 비우기). 호출자가 어드민 권한과 "자리를 쓰는 경기가
 * 전부 시작 전인가"를 이미 확인했다 — 여기서는 행 수준 변경과 그 파급(사이드·팀 일정·신청서·명단)만 소유한다.
 *
 * 잠금 순서는 결과 확인·대진 수정과 같다: Game → TeamMatch. `_deps` 는 PR-1a 의 `assignTournamentFixtureSideInTx` 와
 * 같은 호출 모양을 맞추는 자리표시다(사이드 배정에 서비스 의존성이 필요 없다).
 */
export async function assignLeagueFixtureSideInTx(
  tx: Tx,
  _deps: BracketTxDeps,
  admin: V1ActiveAdmin,
  input: LeagueSideAssignmentInput,
): Promise<void> {
  const gameRows = await tx.$queryRaw<Array<{ id: string; state: string; currentOfficialRevisionId: string | null }>>`
    SELECT id, state::text AS state, current_official_revision_id AS "currentOfficialRevisionId"
    FROM v1_games WHERE team_match_id = ${input.teamMatchId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM v1_team_matches WHERE id = ${input.teamMatchId} FOR UPDATE`;
  const teamMatch = await tx.v1TeamMatch.findUnique({
    where: { id: input.teamMatchId },
    select: {
      id: true,
      leagueId: true,
      title: true,
      startAt: true,
      endAt: true,
      hostTeamId: true,
      approvedApplicantTeamId: true,
    },
  });
  if (teamMatch === null || teamMatch.leagueId === null || gameRows.length !== 1) {
    throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '리그 경기를 찾을 수 없어요.' });
  }
  const { leagueId, startAt } = teamMatch;
  const game = gameRows[0];

  const registration = input.registrationId === null
    ? null
    : await tx.v1TournamentRegistration.findFirst({
        where: { id: input.registrationId, tournamentId: leagueId, status: 'confirmed' },
        select: { teamId: true, team: { select: { name: true } } },
      });
  if (input.registrationId !== null && registration === null) {
    throw new BadRequestException({ code: 'REGISTRATION_INVALID', message: '대진 등록이 해당 리그에 없거나 확정되지 않았어요.' });
  }

  const isHome = input.side === 'HOME';
  const previousTeamId = isHome ? teamMatch.hostTeamId : teamMatch.approvedApplicantTeamId;
  const otherTeamId = isHome ? teamMatch.approvedApplicantTeamId : teamMatch.hostTeamId;
  const nextTeamId = registration?.teamId ?? null;
  if (nextTeamId !== null && nextTeamId === otherTeamId) {
    throw new BadRequestException({ code: 'FIXTURE_SAME_TEAM', message: '같은 팀끼리 경기를 만들 수 없어요.' });
  }
  if (nextTeamId === previousTeamId) return;
  if (game.state !== 'SCHEDULED' || game.currentOfficialRevisionId !== null) {
    throw new ConflictException({
      code: 'FIXTURE_HAS_RESULT',
      message: '진행 중이거나 결과가 확정된 경기는 팀을 바꿀 수 없어요. 결과를 먼저 처리해 주세요.',
    });
  }

  const nextHostTeamId = isHome ? nextTeamId : otherTeamId;
  const nextAwayTeamId = isHome ? otherTeamId : nextTeamId;
  await tx.v1TeamMatch.update({
    where: { id: teamMatch.id },
    data: { hostTeamId: nextHostTeamId, approvedApplicantTeamId: nextAwayTeamId },
  });

  const sideKey = isHome ? V1GameSideKey.HOME : V1GameSideKey.AWAY;
  const gameSide = await tx.v1GameSide.findUnique({ where: { gameId_sideKey: { gameId: game.id, sideKey } }, select: { id: true } });
  if (gameSide === null) {
    throw new ConflictException({ code: 'TOURNAMENT_MATCH_GAME_SIDE_MISSING', message: '경기의 게임 사이드를 찾을 수 없어요.' });
  }
  const newLineupId = await invalidateLineupAndTactics(tx, game.id, gameSide.id);
  await tx.v1GameSide.update({
    where: { id: gameSide.id },
    data: { teamId: nextTeamId, displayNameSnapshot: registration?.team.name ?? UNDECIDED_SIDE_NAME[input.side] },
  });
  await revokeReplacedSideTeamAdjustments(tx, { gameId: game.id, sideId: gameSide.id });
  await tx.v1Game.update({ where: { id: game.id }, data: { version: { increment: 1 } } });

  if (nextHostTeamId !== null && nextAwayTeamId !== null && startAt !== null) {
    await upsertSchedule(tx, nextHostTeamId, teamMatch.id, teamMatch.title, startAt, teamMatch.endAt);
    await upsertSchedule(tx, nextAwayTeamId, teamMatch.id, teamMatch.title, startAt, teamMatch.endAt);
    await tx.v1TeamSchedule.updateMany({
      where: { teamMatchId: teamMatch.id, teamId: { notIn: [nextHostTeamId, nextAwayTeamId] }, state: 'SCHEDULED' },
      data: { state: 'CANCELLED', cancelReason: TEAM_CHANGED_CANCEL_REASON, version: { increment: 1 } },
    });
  } else {
    // 반쪽 경기는 공개 게이트로 숨겨지므로 팀 일정도 남기지 않는다(일정 링크가 404 가 된다).
    await cascadeCancelTeamMatchSchedulesInTx(tx, teamMatch.id, SIDE_INCOMPLETE_CANCEL_REASON);
  }

  if (!isHome) {
    // `(teamMatchId, applicantTeamId)` 유일 제약 — 지우고 다시 만들지 않고 되살린다.
    if (previousTeamId !== null) {
      await tx.v1TeamMatchApplication.updateMany({
        where: { teamMatchId: teamMatch.id, applicantTeamId: previousTeamId, status: 'approved' },
        data: { status: 'withdrawn', withdrawnAt: new Date() },
      });
    }
    if (nextTeamId !== null) {
      const now = new Date();
      await tx.v1TeamMatchApplication.upsert({
        where: { teamMatchId_applicantTeamId: { teamMatchId: teamMatch.id, applicantTeamId: nextTeamId } },
        create: {
          teamMatchId: teamMatch.id,
          applicantTeamId: nextTeamId,
          appliedByUserId: admin.userId,
          status: 'approved',
          reviewedByUserId: admin.userId,
          reviewedAt: now,
          message: LEAGUE_APPLICATION_MESSAGE,
        },
        update: { status: 'approved', reviewedByUserId: admin.userId, reviewedAt: now, withdrawnAt: null },
      });
    }
  }

  // 새 팀의 명단은 방금 만든 빈 리비전 위에 후속 이벤트가 채운다(대회 쪽과 같은 조건).
  const resync: RosterResyncTarget[] = competitionTeamTargets(leagueId, [previousTeamId, nextTeamId, otherTeamId]);
  if (newLineupId !== null && nextTeamId !== null) resync.push({ scope: 'game', gameId: game.id });
  await enqueueRosterResync(tx, resync);
}
```

- [ ] **Step 5: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-fixture-side-assignment\|tournament-match-update"
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-match-update.spec.ts
```
Expected: `0`; 이어서 `PASS`, 기존 케이스 전부 — `export` 추가만이라 동작 불변. CI: `league-fixture-side-assignment.integration-spec.ts` 8건 PASS.

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(league): 리그 경기 사이드 배정 — 양 팀이 찬 순간 팀 일정·신청서 upsert" -- apps/v1_api/src/league-matches/league-fixture-side-assignment.ts apps/v1_api/src/tournaments/tournament-match-update.ts apps/v1_api/test/league-matches/league-fixture-side-assignment.integration-spec.ts
git show --stat HEAD
```

### Task 4: 자리를 쓰는 경기가 모두 차면 리그를 진행 상태로 (`promoteLeagueWhenSlotsFilledInTx`)

기존 코드에는 상태 전이 함수가 없다 — `generateFixtures`·`regenerateFixtures` 안에 상태 `updateMany` 가 인라인으로 있다(`grep -n "updateMany" src/league-matches/league-match-admin.service.ts` 로 찾는다). 템플릿은 리그 상태를 바꾸지 않으므로(스펙 S2), **빈 사이드가 하나도 없어지는 순간** 같은 진행 상태로 올리는 조건부 헬퍼를 새로 둔다. `draft`·`open`·`closed`(경기 시작 전 상태 전부)에서만 올리고 보류·완료·이미 진행 중인 리그는 건드리지 않는다.

스펙 확정(2026-10-08 Ambiguity Log): 승격 대상은 경기 시작 전 상태 **`draft`·`open`·`closed` 전부**다. `on_hold`·`completed`·`in_progress` 는 건드리지 않는다. 일괄 생성이 상태와 무관하게 올리는 것과 `closed` 리그에서도 같은 결과를 낸다. 사용자 결정 게이트 없음 — 그대로 구현한다.

**Files:**
- Create: `apps/v1_api/src/league-matches/league-slot-status.ts`
- Test: `apps/v1_api/test/league-matches/league-slot-status.integration-spec.ts`

**Interfaces:**
- Consumes: `unfilledSlotFixtureWhere()`(Task 1), `STATUS_BY_LEAGUE_STATE`(`tournaments/league-competition-mirror.ts`).
- Produces: `promoteLeagueWhenSlotsFilledInTx(tx: Prisma.TransactionClient, leagueId: string): Promise<boolean>` — 전이했으면 true.

- [ ] **Step 1: 실패하는 통합 스펙을 쓴다**

`apps/v1_api/test/league-matches/league-slot-status.integration-spec.ts`:

```ts
import type { INestApplication } from '@nestjs/common';
import { promoteLeagueWhenSlotsFilledInTx } from '../../src/league-matches/league-slot-status';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

describe('promoteLeagueWhenSlotsFilledInTx', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lsst');
  });
  afterAll(async () => cleanup?.());

  const promote = (leagueId: string) => h.prisma.$transaction((tx) => promoteLeagueWhenSlotsFilledInTx(tx, leagueId));
  const statusOf = async (leagueId: string) =>
    (await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId }, select: { status: true } })).status;

  /** 자리 3개 · 경기 1개(자리 1↔2)로 시작하는 리그. */
  async function slotLeague(status: 'draft' | 'open' | 'closed' | 'on_hold' | 'completed' | 'in_progress' = 'draft') {
    const teamA = await h.makeTeam('lsst-a');
    const teamB = await h.makeTeam('lsst-b');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    await h.prisma.v1Tournament.update({ where: { id: leagueId }, data: { status } });
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    return { leagueId, teamA, teamB, s1, s2 };
  }

  it('빈 사이드가 남아 있으면 전이하지 않는다', async () => {
    const { leagueId, teamA, s1, s2 } = await slotLeague();
    await h.createFixture(leagueId, { homeTeamId: teamA.id, homeSlotId: s1.id, awaySlotId: s2.id });
    expect(await promote(leagueId)).toBe(false);
    expect(await statusOf(leagueId)).toBe('draft');
  });

  it('자리를 쓰는 경기가 전부 찼으면 draft·open·closed 는 진행 상태(in_progress)로 올라간다', async () => {
    for (const from of ['draft', 'open', 'closed'] as const) {
      const { leagueId, teamA, teamB, s1, s2 } = await slotLeague(from);
      await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id, homeSlotId: s1.id, awaySlotId: s2.id });
      expect(await promote(leagueId)).toBe(true);
      expect(await statusOf(leagueId)).toBe('in_progress');
      const log = await h.prisma.v1StatusChangeLog.findFirst({ where: { targetType: 'league_match', targetId: leagueId } });
      expect(log).toMatchObject({ fromStatus: 'draft', toStatus: 'active', reason: 'slots_filled' });
    }
  });

  it('대조군: 보류(on_hold)·완료·이미 진행 중인 리그는 다 차 있어도 건드리지 않는다', async () => {
    for (const status of ['on_hold', 'completed', 'in_progress'] as const) {
      const { leagueId, teamA, teamB, s1, s2 } = await slotLeague(status);
      await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id, homeSlotId: s1.id, awaySlotId: s2.id });
      expect(await promote(leagueId)).toBe(false);
      expect(await statusOf(leagueId)).toBe(status);
    }
  });

  it('취소된 빈 경기는 세지 않는다 — 남는 빈 경기를 취소하면 전이된다', async () => {
    const { leagueId, teamA, teamB, s1, s2 } = await slotLeague();
    await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id, homeSlotId: s1.id, awaySlotId: s2.id });
    const empty = await h.createFixture(leagueId, { homeSlotId: s1.id, awaySlotId: s2.id });
    expect(await promote(leagueId)).toBe(false);
    await h.prisma.v1TeamMatch.update({ where: { id: empty }, data: { status: 'cancelled', homeSlotId: null, awaySlotId: null } });
    expect(await promote(leagueId)).toBe(true);
  });

  it('자리를 쓰는 경기가 하나도 없으면(일반 대진 리그) 전이하지 않는다', async () => {
    const teamA = await h.makeTeam('lsst-c');
    const teamB = await h.makeTeam('lsst-d');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id });
    expect(await promote(leagueId)).toBe(false);
    expect(await statusOf(leagueId)).toBe('draft');
  });
});
```

- [ ] **Step 2: 실행해 실패를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -n "league-slot-status" | head -3
```
Expected(로컬): `Cannot find module '../../src/league-matches/league-slot-status'`. CI: 스위트 FAIL.

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/league-matches/league-slot-status.ts`:

```ts
import { Prisma, V1TournamentStatus } from '@prisma/client';
import { unfilledSlotFixtureWhere } from '../common/competition/unfilled-slot-gate';
import { STATUS_BY_LEAGUE_STATE } from '../tournaments/league-competition-mirror';
import { LeagueStateValue } from './league-state';

/**
 * 템플릿으로 만든 리그는 자리에 팀이 다 들어가기 전까지 상태를 바꾸지 않는다(빈 경기뿐인 리그가
 * 공개에 "진행 중"으로 보이지 않게). 자리를 쓰는 경기(비삭제·비취소)에 빈 사이드가 하나도 없어지면
 * 기존 일괄 생성(`generateFixtures`)과 같은 진행 상태로 올린다.
 *
 * `draft`·`open`·`closed`(경기 시작 전 상태 전부)에서만 올린다. 보류(`on_hold`)·완료는 건드리지 않고, `updateMany` 의 상태 조건이 동시
 * 요청에서 먼저 커밋한 쪽만 1행을 잡게 한다(`LeagueCompletionProjectionService.settle` 과 같은 방식).
 */
const PROMOTABLE_STATUSES: V1TournamentStatus[] = [
  V1TournamentStatus.draft,
  V1TournamentStatus.open,
  V1TournamentStatus.closed,
];

export async function promoteLeagueWhenSlotsFilledInTx(tx: Prisma.TransactionClient, leagueId: string): Promise<boolean> {
  const live = { leagueId, deletedAt: null, status: { not: 'cancelled' as const } };
  const unfilled = await tx.v1TeamMatch.count({ where: { ...live, ...unfilledSlotFixtureWhere() } });
  if (unfilled > 0) return false;
  const slotted = await tx.v1TeamMatch.count({
    where: { ...live, OR: [{ homeSlotId: { not: null } }, { awaySlotId: { not: null } }] },
  });
  if (slotted === 0) return false;

  const result = await tx.v1Tournament.updateMany({
    where: { id: leagueId, kind: 'regular_league', status: { in: PROMOTABLE_STATUSES } },
    data: { status: STATUS_BY_LEAGUE_STATE[LeagueStateValue.active] },
  });
  if (result.count === 0) return false;

  await tx.v1StatusChangeLog.create({
    data: {
      targetType: 'league_match',
      targetId: leagueId,
      fromStatus: LeagueStateValue.draft,
      toStatus: LeagueStateValue.active,
      actorType: 'system',
      reason: 'slots_filled',
    },
  });
  return true;
}
```

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-slot-status"
```
Expected: `0`. CI: `league-slot-status.integration-spec.ts` 5건 PASS(`closed` 승격은 두 번째 케이스의 반복에 들어 있고, `on_hold` 는 대조군 케이스가 잡는다).

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(league): 자리 경기가 모두 차면 draft/open/closed 리그를 진행 상태로 올리는 헬퍼" -- apps/v1_api/src/league-matches/league-slot-status.ts apps/v1_api/test/league-matches/league-slot-status.integration-spec.ts
git show --stat HEAD
```

### Task 5: 리그 템플릿 계획 `planLeagueTemplate` (순수 함수)

라운드로빈 페어링 커널 `generateRoundRobin`(`common/scheduling/round-robin.ts`)과 리그 어댑터 `generateRoundRobinFixtures`(`league-matches/round-robin-schedule.ts`)는 문자열 id 만 받으므로 자리 순번을 그대로 넣을 수 있다. 계획은 "몇 번 자리 vs 몇 번 자리, 몇 라운드"만 계산한다 — DB·시각은 모른다.

**Files:**
- Create: `apps/v1_api/src/league-matches/league-template-plan.ts`
- Test: `apps/v1_api/src/league-matches/league-template-plan.spec.ts`

**Interfaces:**
- Consumes: `generateRoundRobinFixtures(teamIds, weeksCount)`(`round-robin-schedule.ts`).
- Produces:
  ```ts
  export const LEAGUE_TEMPLATE_MIN_TEAMS = 3;
  export const LEAGUE_TEMPLATE_MAX_TEAMS = 20;
  export type LeagueTemplatePlan = {
    slotPositions: number[];                                   // 1..teamCount
    fixtures: Array<{ round: number; homePosition: number; awayPosition: number }>; // round 오름차순
    totalRounds: number;
  };
  export function planLeagueTemplate(input: { teamCount: number; legs: 1 | 2 }): LeagueTemplatePlan
  ```

- [ ] **Step 1: 실패하는 unit 테스트를 쓴다**

`apps/v1_api/src/league-matches/league-template-plan.spec.ts`:

```ts
import { planLeagueTemplate } from './league-template-plan';

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

describe('planLeagueTemplate', () => {
  it.each([
    { teamCount: 3, legs: 1 as const, fixtures: 3, rounds: 3 },
    { teamCount: 4, legs: 1 as const, fixtures: 6, rounds: 3 },
    { teamCount: 4, legs: 2 as const, fixtures: 12, rounds: 6 },
    { teamCount: 5, legs: 1 as const, fixtures: 10, rounds: 5 },
    { teamCount: 6, legs: 2 as const, fixtures: 30, rounds: 10 },
    { teamCount: 12, legs: 1 as const, fixtures: 66, rounds: 11 },
  ])('$teamCount팀 × $legs회전 = 경기 $fixtures · 라운드 $rounds', ({ teamCount, legs, fixtures, rounds }) => {
    const plan = planLeagueTemplate({ teamCount, legs });
    expect(plan.fixtures).toHaveLength(fixtures);
    expect(plan.totalRounds).toBe(rounds);
    expect(plan.slotPositions).toEqual(Array.from({ length: teamCount }, (_, index) => index + 1));
  });

  it('모든 쌍이 정확히 legs 번 만나고, 2회전이면 홈/원정이 서로 한 번씩이다', () => {
    const plan = planLeagueTemplate({ teamCount: 5, legs: 2 });
    const byPair = new Map<string, Array<[number, number]>>();
    for (const fixture of plan.fixtures) {
      const key = pairKey(fixture.homePosition, fixture.awayPosition);
      byPair.set(key, [...(byPair.get(key) ?? []), [fixture.homePosition, fixture.awayPosition]]);
    }
    expect(byPair.size).toBe(10);
    for (const meetings of byPair.values()) {
      expect(meetings).toHaveLength(2);
      expect(meetings[0][0]).toBe(meetings[1][1]);
      expect(meetings[0][1]).toBe(meetings[1][0]);
    }
  });

  it('한 라운드에 같은 자리가 두 번 나오지 않고 자리 번호는 1..teamCount 안이다', () => {
    for (const teamCount of [3, 4, 7, 12, 20]) {
      const plan = planLeagueTemplate({ teamCount, legs: 2 });
      const seen = new Set<string>();
      for (const fixture of plan.fixtures) {
        expect(fixture.homePosition).not.toBe(fixture.awayPosition);
        for (const position of [fixture.homePosition, fixture.awayPosition]) {
          expect(position).toBeGreaterThanOrEqual(1);
          expect(position).toBeLessThanOrEqual(teamCount);
          const roundKey = `${fixture.round}:${position}`;
          expect(seen.has(roundKey)).toBe(false);
          seen.add(roundKey);
        }
      }
    }
  });

  it('경기는 라운드 오름차순이고 라운드는 1부터 빠짐없이 이어진다', () => {
    const plan = planLeagueTemplate({ teamCount: 6, legs: 2 });
    const rounds = plan.fixtures.map((fixture) => fixture.round);
    expect(rounds).toEqual([...rounds].sort((a, b) => a - b));
    expect([...new Set(rounds)]).toEqual(Array.from({ length: plan.totalRounds }, (_, index) => index + 1));
  });
});
```

- [ ] **Step 2: 실행해 실패를 확인한다**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/league-matches/league-template-plan.spec.ts
```
Expected: FAIL — `Cannot find module './league-template-plan'`.

- [ ] **Step 3: 구현한다**

`apps/v1_api/src/league-matches/league-template-plan.ts`:

```ts
import { generateRoundRobinFixtures } from './round-robin-schedule';

export const LEAGUE_TEMPLATE_MIN_TEAMS = 3;
export const LEAGUE_TEMPLATE_MAX_TEAMS = 20;

export type LeagueTemplatePlan = {
  slotPositions: number[];
  fixtures: Array<{ round: number; homePosition: number; awayPosition: number }>;
  totalRounds: number;
};

/**
 * 정규 리그 빈 경기 계획. 팀 자리를 1..N 순번으로 두고 라운드로빈 페어링을 그대로 쓴다.
 * 자리 순번을 두 자리 0 패딩 문자열 id 로 넘기는 이유: 커널의 홈 균형 tie-break 가 id 를 문자열로
 * 비교하므로 `'2' < '10'` 같은 사전식 역전을 막는다.
 */
export function planLeagueTemplate(input: { teamCount: number; legs: 1 | 2 }): LeagueTemplatePlan {
  const slotPositions = Array.from({ length: input.teamCount }, (_, index) => index + 1);
  const cycleRounds = input.teamCount % 2 === 0 ? input.teamCount - 1 : input.teamCount;
  const totalRounds = cycleRounds * input.legs;
  const idOf = (position: number) => String(position).padStart(2, '0');
  const fixtures = generateRoundRobinFixtures(slotPositions.map(idOf), totalRounds).map((fixture) => ({
    round: fixture.round,
    homePosition: Number(fixture.homeTeamId),
    awayPosition: Number(fixture.awayTeamId),
  }));
  return { slotPositions, fixtures, totalRounds };
}
```

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/league-matches/league-template-plan.spec.ts
```
Expected: PASS (10 tests).

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(league): 리그 템플릿 라운드로빈 계획(순수) 추가" -- apps/v1_api/src/league-matches/league-template-plan.ts apps/v1_api/src/league-matches/league-template-plan.spec.ts
git show --stat HEAD
```

### Task 6: 취소 경로 — 팀 null 허용 · 자리 연결 해제 · 취소 뒤 상태 전이

리그 경기가 취소되는 곳은 셋이다: 단건 취소(`cancelFixture`), 재생성 루프(`regenerateFixtures`), 참가팀 제외 루프(`removeTeam`). 셋 모두 `requireLeagueHostTeamId`(`grep -n "requireLeagueHostTeamId"` 로 정의·호출 확인)로 홈 팀이 null 이면 409 `LEAGUE_FIXTURE_INCOMPLETE` 를 던져 빈 경기를 취소할 수 없다. 취소를 `cancelLeagueFixtureRowInTx` 한 곳으로 모아 ① 자리 연결(`homeSlotId`/`awaySlotId`)을 같이 풀고(스펙 S1 — 안 풀면 자리 삭제가 FK 로 막힌다) ② 알림은 **공개돼 있던 경기에만** 보낸다(자리에 연결됐는데 팀이 빈 경기는 공개된 적이 없고 팀에 "배정됐어요" 알림도 간 적이 없다). `cancelFixture` 는 취소 뒤 상태 전이 판정을 한다.

**Files:**
- Modify: `apps/v1_api/src/league-matches/league-match-admin.service.ts` — `requireLeagueHostTeamId` 삭제, 취소 3곳(`removeTeam`·`cancelFixture`·`regenerateFixtures` 의 `requireLeagueHostTeamId` 호출 루프), 알림 입력(위 세 곳의 `notifyFixturesCancelled` 호출부), `notifyFixturesCancelled`, 새 private `cancelLeagueFixtureRowInTx`
- Test: `apps/v1_api/test/league-matches/league-slot-cancel-regenerate.integration-spec.ts`

**Interfaces:**
- Consumes: `isUnfilledSlotFixture`(Task 1), `promoteLeagueWhenSlotsFilledInTx`(Task 4).
- Produces: private `cancelLeagueFixtureRowInTx(tx, teamMatchId: string, reason: string): Promise<number>` (반려된 신청 수).

- [ ] **Step 1: 실패하는 통합 스펙을 쓴다**

`apps/v1_api/test/league-matches/league-slot-cancel-regenerate.integration-spec.ts`:

```ts
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { NotificationsService } from '../../src/notifications/notifications.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

describe('리그 경기 취소 — 빈 경기·자리 연결', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let notified: jest.SpyInstance;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lscr');
    notified = jest.spyOn(app.get(NotificationsService), 'emitToManyDeferred');
  });
  beforeEach(() => notified.mockClear());
  afterAll(async () => cleanup?.());

  const cancel = (leagueId: string, teamMatchId: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/cancel`)
      .set('x-v1-user-id', h.adminUserId)
      .send({ reason: '일정 조정' });
  const cancelNotices = () => notified.mock.calls.filter((call) => call[1] === 'league_fixture_cancelled');

  it('팀이 없는 빈 경기도 취소된다 — 알림은 보내지 않고 자리 연결은 풀린다', async () => {
    const leagueId = await h.makeLeague();
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    const teamMatchId = await h.createFixture(leagueId, { homeSlotId: s1.id, awaySlotId: s2.id });

    const res = await cancel(leagueId, teamMatchId);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'cancelled', alreadyProcessed: false });
    expect(await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).toMatchObject({
      status: 'cancelled',
      homeSlotId: null,
      awaySlotId: null,
    });
    expect(cancelNotices()).toHaveLength(0);
  });

  it('반쪽만 찬 경기도 공개된 적이 없으니 팀에 취소 알림을 보내지 않는다', async () => {
    const teamA = await h.makeTeam('lscr-a');
    const leagueId = await h.makeLeague({ teams: [teamA] });
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    const teamMatchId = await h.createFixture(leagueId, { homeTeamId: teamA.id, homeSlotId: s1.id, awaySlotId: s2.id });

    expect((await cancel(leagueId, teamMatchId)).status).toBe(200);
    expect(cancelNotices()).toHaveLength(0);
  });

  it('대조군: 자리 없는 기존 경기는 지금처럼 양 팀에 취소 알림이 간다', async () => {
    const teamA = await h.makeTeam('lscr-b');
    const teamB = await h.makeTeam('lscr-c');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    const teamMatchId = await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id });

    expect((await cancel(leagueId, teamMatchId)).status).toBe(200);
    expect(cancelNotices()).toHaveLength(2);
  });

  it('남은 빈 경기를 취소해 자리 경기가 모두 차면 리그가 진행 상태로 바뀐다', async () => {
    const teamA = await h.makeTeam('lscr-d');
    const teamB = await h.makeTeam('lscr-e');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id, homeSlotId: s1.id, awaySlotId: s2.id });
    const spare = await h.createFixture(leagueId, { homeSlotId: s1.id, awaySlotId: s2.id });
    expect((await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).status).toBe('draft');

    expect((await cancel(leagueId, spare)).status).toBe(200);

    expect((await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).status).toBe('in_progress');
  });

  it('이미 취소된 경기는 alreadyProcessed 로 응답하고 자리 연결·알림에 손대지 않는다', async () => {
    const leagueId = await h.makeLeague();
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    const teamMatchId = await h.createFixture(leagueId, { homeSlotId: s1.id, awaySlotId: s2.id });
    await cancel(leagueId, teamMatchId);
    const again = await cancel(leagueId, teamMatchId);
    expect(again.body.data).toMatchObject({ alreadyProcessed: true });
  });
});
```

- [ ] **Step 2: 실행해 실패를 확인한다**

```bash
cd apps/v1_api && grep -n "requireLeagueHostTeamId" src/league-matches/league-match-admin.service.ts | wc -l
```
Expected: `4`(선언 1 + 호출 3). CI: 첫 케이스가 `409 LEAGUE_FIXTURE_INCOMPLETE` 로 FAIL(기대 200).

- [ ] **Step 3: 구현한다**

(a) `requireLeagueHostTeamId` 함수를 **삭제**한다. import 에 추가: `import { isUnfilledSlotFixture } from '../common/competition/unfilled-slot-gate';` · `import { promoteLeagueWhenSlotsFilledInTx } from './league-slot-status';`

(b) 취소 한 곳을 만든다(`cascadeCancelFixtureInTx` 바로 위에 둔다):

```ts
  /**
   * 대진 한 건을 취소 상태로 접는 단일 경로. 자리 연결도 같이 푼다 — 취소된 경기가 자리를 붙들고 있으면
   * 템플릿 교체의 자리 삭제가 FK(Restrict)로 막히고, 자리를 쓰는 경기 판정에 취소 경기가 섞인다.
   */
  private async cancelLeagueFixtureRowInTx(tx: Prisma.TransactionClient, teamMatchId: string, reason: string): Promise<number> {
    await tx.v1TeamMatch.update({
      where: { id: teamMatchId },
      data: { status: 'cancelled', cancelledAt: new Date(), homeSlotId: null, awaySlotId: null },
    });
    return this.cascadeCancelFixtureInTx(tx, teamMatchId, reason);
  }
```

(c) 세 취소 지점을 바꾼다.

- `removeTeam`: `freshTeamFixtures` select 에 `homeSlotId: true, awaySlotId: true` 를 더하고, 루프를
  ```ts
        await this.cancelLeagueFixtureRowInTx(tx, fixture.id, TEAM_REMOVAL_CANCEL_REASON);
        // 자리에 연결됐는데 팀이 비어 있던 경기는 공개된 적이 없다 — 알림 대상이 아니다.
        if (!isUnfilledSlotFixture(fixture)) {
          cancelledFixtures.push({ id: fixture.id, title: fixture.title, hostTeamId: fixture.hostTeamId, approvedApplicantTeamId: fixture.approvedApplicantTeamId });
        }
        cancelled += 1;
  ```
  로 바꾼다(`update` + `cascadeCancelFixtureInTx` + `requireLeagueHostTeamId` 호출 제거). `cancelledFixtures` 배열 타입의 `hostTeamId` 를 `string | null` 로 넓힌다.
- `cancelFixture`(`requireLeagueHostTeamId` 를 부르는 취소 분기):
  ```ts
      const rejected = await this.cancelLeagueFixtureRowInTx(tx, teamMatchId, dto.reason);
  ```
  (바로 위 `await tx.v1TeamMatch.update(...)` 와 아래 `const rejected = await this.cascadeCancelFixtureInTx(...)` 를 이 한 줄로 합친다.) 그리고 `settle` 호출 바로 위에 추가:
  ```ts
      // 남은 빈 경기를 취소하면 자리를 쓰는 경기가 모두 찬 상태가 될 수 있다.
      await promoteLeagueWhenSlotsFilledInTx(tx, leagueId);
  ```
  트랜잭션 밖 알림은
  ```ts
    if (!isUnfilledSlotFixture(teamMatch)) {
      this.notifyFixturesCancelled(leagueId, [{ id: teamMatch.id, title: teamMatch.title, hostTeamId: teamMatch.hostTeamId, approvedApplicantTeamId: teamMatch.approvedApplicantTeamId }], dto.reason);
    }
  ```
  로 감싼다(`teamMatch` 는 `cancelFixture` 첫머리의 `findFirst` 가 전 컬럼을 읽으므로 자리 id 가 이미 있다).
- `regenerateFixtures`: `existingFixtures` select 에 `homeSlotId: true, awaySlotId: true` 를 더하고, 루프를 위 removeTeam 과 같은 모양으로(`cancelLeagueFixtureRowInTx(tx, fixture.id, dto.reason)` + `isUnfilledSlotFixture` 필터) 바꾼다.

(d) `notifyFixturesCancelled` 의 입력 타입을 `hostTeamId: string | null` 로 넓히고, 홈 팀 집계를 null 안전하게 한다:

```ts
    for (const fixture of fixtures) {
      for (const teamId of [fixture.hostTeamId, fixture.approvedApplicantTeamId]) {
        if (teamId !== null) fixtureCountByTeamId.set(teamId, (fixtureCountByTeamId.get(teamId) ?? 0) + 1);
      }
    }
    if (fixtureCountByTeamId.size === 0) return;
```
(기존 `fixtureCountByTeamId.set(fixture.hostTeamId, ...)` 블록과 `approvedApplicantTeamId !== null` 블록을 이 루프 하나로 대체한다.)

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && grep -c "requireLeagueHostTeamId" src/league-matches/league-match-admin.service.ts
./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-match-admin.service"
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/league-matches/league-match-admin.service.spec.ts
```
Expected: `0`, `0`, spec PASS(기존 취소 단언 포함). 기존 `removeTeam` 스펙(`league-match-admin.service.spec.ts` 의 removeTeam 블록 — `grep -n "removeTeam" src/league-matches/league-match-admin.service.spec.ts`)의 가짜 대진 행에는 `homeSlotId: null, awaySlotId: null` 을 **추가**해 실제 조회 모양과 맞춘다(없어도 `isUnfilledSlotFixture` 가 false 라 통과하지만, 가짜 행이 실제 select 와 다르면 다음 컬럼 추가 때 같은 함정이 반복된다). CI: `league-slot-cancel-regenerate.integration-spec.ts` 5건 PASS.

- [ ] **Step 5: 커밋**

```bash
git commit -m "fix(league): 빈 경기 취소 허용 · 취소 시 자리 연결 해제 · 취소 뒤 상태 전이" -- apps/v1_api/src/league-matches/league-match-admin.service.ts apps/v1_api/src/league-matches/league-match-admin.service.spec.ts apps/v1_api/test/league-matches/league-slot-cancel-regenerate.integration-spec.ts
git show --stat HEAD
```

### Task 7: 리그 템플릿 적용 `POST /admin/league-matches/:leagueId/fixtures/template` (새로 만들기)

자리 N개와 라운드로빈 빈 경기를 **한 트랜잭션**으로 만든다. 리그 행 `FOR UPDATE` → 가드 → "경기가 이미 있으면 409" 순서가 `generateFixtures` 와 같아, 템플릿과 일괄 생성이 동시에 들어와도 하나만 성공한다. 이 Task 는 빈 리그에 처음 만드는 경로만 다루고, `replaceExisting` 은 Task 8 가 얹는다. 리그 `status` 는 바꾸지 않는다.

**Files:**
- Modify: `apps/v1_api/src/league-matches/dto/league-match.dto.ts` (파일 끝에 DTO 추가, 1행 import 에 `IsDefined` 추가)
- Modify: `apps/v1_api/src/league-matches/league-match-admin.service.ts` — `resolveScheduleStartAts` 오버로드, 새 `applyTemplate`, import 추가
- Modify: `apps/v1_api/src/league-matches/league-match-admin.controller.ts` — 새 라우트, import 추가
- Test: `apps/v1_api/test/league-matches/league-template.integration-spec.ts`

**Interfaces:**
- Consumes: `planLeagueTemplate`(Task 5), `createLeagueFixture`(Task 2), `lockCompetitionForBracketMutationInTx`(PR-1b `tournaments/slots/competition-bracket-lock.ts` — 리그 갈래가 행 `FOR UPDATE` + `assertLeagueFixtureGenerationAllowedInTx` 를 한 번에 한다), `BRACKET_TEMPLATE_MAX_FIXTURES`(PR-1b `tournaments/templates/bracket-template-plan.ts`), `resolveTeamMatchCompetitionConfig`, `leagueFixtureTitle`.
- Produces:
  ```ts
  export class ApplyLeagueTemplateDto { teamCount!: number; legs!: 1 | 2; schedule!: LeagueFixtureScheduleDto; placeName?: string }
  // LeagueMatchAdminService
  async applyTemplate(user: V1AuthUser, leagueId: string, dto: ApplyLeagueTemplateDto): Promise<{ slots: number; fixtures: number }>
  ```

- [ ] **Step 1: 실패하는 통합 스펙을 쓴다**

`apps/v1_api/test/league-matches/league-template.integration-spec.ts`:

```ts
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

/** KST 달력 날짜 문자열 — 서버가 그 날의 KST 벽시계로 해석한다. 과거 날짜는 422 라 항상 미래로 만든다. */
const kstDates = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + (index + 2) * 7 * 86_400_000)),
  );

describe('POST /admin/league-matches/:leagueId/fixtures/template', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let supportUserId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lstp');
    supportUserId = await h.makeAdmin('support');
  });
  afterAll(async () => cleanup?.());

  const post = (leagueId: string, body: unknown, userId = h.adminUserId) =>
    request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/template`)
      .set('x-v1-user-id', userId)
      .send(body as object);
  const statusOf = async (leagueId: string) =>
    (await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId }, select: { status: true } })).status;

  it('4팀 2회전: 자리 4개 + 빈 경기 12개, 라운드마다 일정 날짜가 맞고 리그 상태는 그대로다', async () => {
    const leagueId = await h.makeLeague();
    const dates = kstDates(6);

    const res = await post(leagueId, { teamCount: 4, legs: 2, schedule: { dates, time: '19:00' }, placeName: '마포 풋살장' });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ slots: 4, fixtures: 12 });
    const slots = await h.prisma.v1TournamentSlot.findMany({ where: { tournamentId: leagueId }, orderBy: { position: 'asc' } });
    expect(slots.map((slot) => [slot.kind, slot.groupId, slot.position, slot.registrationId])).toEqual([
      ['ENTRY', null, 1, null], ['ENTRY', null, 2, null], ['ENTRY', null, 3, null], ['ENTRY', null, 4, null],
    ]);
    const fixtures = await h.prisma.v1TeamMatch.findMany({ where: { leagueId } });
    expect(fixtures).toHaveLength(12);
    expect(fixtures.every((f) => f.status === 'matched' && f.hostTeamId === null && f.approvedApplicantTeamId === null)).toBe(true);
    expect(fixtures.every((f) => f.placeName === '마포 풋살장' && f.homeSlotId !== null && f.awaySlotId !== null)).toBe(true);
    // 슬롯마다 홈 3 · 원정 3 — 2회전은 홈/원정이 서로 한 번씩이다.
    for (const slot of slots) {
      expect(fixtures.filter((f) => f.homeSlotId === slot.id)).toHaveLength(3);
      expect(fixtures.filter((f) => f.awaySlotId === slot.id)).toHaveLength(3);
    }
    // 제목의 N주차 ↔ 일정 날짜(N번째) — 라운드와 날짜가 어긋나면 여기서 잡힌다.
    for (const fixture of fixtures) {
      const round = Number(/(\d+)주차$/.exec(fixture.title)?.[1]);
      expect(fixture.startAt?.toISOString()).toBe(new Date(`${dates[round - 1]}T19:00:00+09:00`).toISOString());
    }
    expect(await statusOf(leagueId)).toBe('draft');
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatch: { leagueId } } })).toBe(0);
  });

  it('일정은 필수다 — 없으면 400, 날짜가 모자라면 422, 과거 날짜는 422 이고 아무것도 만들지 않는다', async () => {
    const leagueId = await h.makeLeague();
    expect((await post(leagueId, { teamCount: 4, legs: 1 })).status).toBe(400);
    const few = await post(leagueId, { teamCount: 4, legs: 1, schedule: { dates: kstDates(2), time: '19:00' } });
    expect(few.status).toBe(422);
    expect(few.body.code).toBe('LEAGUE_SCHEDULE_SLOTS_INSUFFICIENT');
    const past = await post(leagueId, { teamCount: 4, legs: 1, schedule: { dates: ['2020-01-01', ...kstDates(2)], time: '19:00' } });
    expect(past.status).toBe(422);
    expect(past.body.code).toBe('LEAGUE_SCHEDULE_DATE_PAST');
    expect(await h.prisma.v1TournamentSlot.count({ where: { tournamentId: leagueId } })).toBe(0);
    expect(await h.prisma.v1TeamMatch.count({ where: { leagueId } })).toBe(0);
  });

  it('범위 밖 팀 수(2·21)는 400, 경기 수가 240을 넘으면(17팀 2회전=272) 422 BRACKET_TEMPLATE_TOO_LARGE', async () => {
    const leagueId = await h.makeLeague();
    const schedule = { dates: kstDates(40), time: '19:00' };
    expect((await post(leagueId, { teamCount: 2, legs: 1, schedule })).status).toBe(400);
    expect((await post(leagueId, { teamCount: 21, legs: 1, schedule })).status).toBe(400);
    const tooLarge = await post(leagueId, { teamCount: 17, legs: 2, schedule });
    expect(tooLarge.status).toBe(422);
    expect(tooLarge.body.code).toBe('BRACKET_TEMPLATE_TOO_LARGE');
    expect(await h.prisma.v1TeamMatch.count({ where: { leagueId } })).toBe(0);
  });

  it('대진이 이미 있으면 409 LEAGUE_FIXTURES_EXIST — 템플릿 두 번째 호출·일반 대진·완료 리그 모두', async () => {
    const body = { teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } };
    const twice = await h.makeLeague();
    expect((await post(twice, body)).status).toBe(201);
    const second = await post(twice, body);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('LEAGUE_FIXTURES_EXIST');
    expect(await h.prisma.v1TeamMatch.count({ where: { leagueId: twice } })).toBe(3);

    const teamA = await h.makeTeam('lstp-a');
    const teamB = await h.makeTeam('lstp-b');
    const legacy = await h.makeLeague({ teams: [teamA, teamB], state: 'active' });
    await h.createFixture(legacy, { homeTeamId: teamA.id, awayTeamId: teamB.id });
    expect((await post(legacy, body)).body.code).toBe('LEAGUE_FIXTURES_EXIST');

    const completed = await h.makeLeague({ teams: [teamA, teamB], state: 'completed' });
    await h.createFixture(completed, { homeTeamId: teamA.id, awayTeamId: teamB.id });
    const done = await post(completed, body);
    expect(done.status).toBe(409);
    expect(await h.prisma.v1TournamentSlot.count({ where: { tournamentId: completed } })).toBe(0);
  });

  it('보류 리그는 409 LEAGUE_ON_HOLD, support 어드민과 일반 사용자는 403', async () => {
    const body = { teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } };
    const held = await h.makeLeague();
    await h.prisma.v1Tournament.update({ where: { id: held }, data: { status: 'on_hold' } });
    const res = await post(held, body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LEAGUE_ON_HOLD');

    const open = await h.makeLeague();
    const support = await post(open, body, supportUserId);
    expect(support.status).toBe(403);
    expect(support.body.code).toBe('PERMISSION_DENIED');
    expect((await post(open, body, 'lstp-nobody')).status).toBeGreaterThanOrEqual(401);
    expect(await h.prisma.v1TeamMatch.count({ where: { leagueId: open } })).toBe(0);
  });

  it('동시성: 같은 리그에 템플릿을 두 번 동시에 → 하나만 성공하고 경기는 한 벌만 남는다', async () => {
    const leagueId = await h.makeLeague();
    const body = { teamCount: 4, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } };
    const results = await Promise.all([post(leagueId, body), post(leagueId, body)]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await h.prisma.v1TeamMatch.count({ where: { leagueId } })).toBe(6);
    expect(await h.prisma.v1TournamentSlot.count({ where: { tournamentId: leagueId } })).toBe(4);
  });

  it('동시성: 템플릿과 기존 일괄 생성을 동시에 → 하나만 성공한다(리그 행 잠금이 직렬화)', async () => {
    const teamA = await h.makeTeam('lstp-c');
    const teamB = await h.makeTeam('lstp-d');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    const template = post(leagueId, { teamCount: 4, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } });
    const generate = request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', h.adminUserId)
      .send({ weeksCount: 1, schedule: { dates: kstDates(1), time: '19:00' } });
    const results = await Promise.all([template, generate]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const loser = results.find((res) => res.status === 409);
    expect(loser?.body.code).toBe('LEAGUE_FIXTURES_EXIST');
    const slotRows = await h.prisma.v1TournamentSlot.count({ where: { tournamentId: leagueId } });
    const fixtureRows = await h.prisma.v1TeamMatch.count({ where: { leagueId } });
    // 둘 중 한 갈래의 결과만 남는다 — 템플릿(자리 4 · 경기 6) 아니면 일괄 생성(자리 0 · 경기 1).
    expect(`${slotRows}:${fixtureRows}`).toMatch(/^(4:6|0:1)$/);
  });
});
```

- [ ] **Step 2: 실행해 실패를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "ApplyLeagueTemplateDto"
```
Expected: `0`(스펙은 HTTP 만 쓰므로 타입 신호 없음). CI: 첫 케이스가 `404`(라우트 없음)로 FAIL.

- [ ] **Step 3: DTO 를 추가한다**

`dto/league-match.dto.ts` 1행의 `class-validator` import 에 `IsDefined` 를 추가하고, 파일 끝(`UpdateLeagueDisciplineDto` 뒤)에 붙인다:

```ts
// 정규 리그 대진 템플릿(자리 기반 빈 경기). 팀은 나중에 자리에 넣으므로 teamIds 가 없다.
// 일정은 필수다 — 공개 가드가 startAt·placeName 이 있는 경기만 내보내기 때문이다. 라운드마다 날짜 하나씩
// 쓰므로(팀당 하루 1경기) 필요한 날짜 수는 총 라운드 수이고, 모자라면 422 LEAGUE_SCHEDULE_SLOTS_INSUFFICIENT.
export class ApplyLeagueTemplateDto {
  @IsInt()
  @Min(3)
  @Max(20)
  teamCount!: number;

  @IsInt()
  @IsIn([1, 2])
  legs!: 1 | 2;

  @IsDefined()
  @ValidateNested()
  @Type(() => LeagueFixtureScheduleDto)
  schedule!: LeagueFixtureScheduleDto;

  // 비우면 일괄 생성과 같은 기본값('장소 미정')이다.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  placeName?: string;
}
```

- [ ] **Step 4: 서비스에 `applyTemplate` 을 추가한다**

(a) `resolveScheduleStartAts` 에 오버로드를 단다 — 일정이 필수인 호출부가 `undefined` 분기를 처리하지 않게:

```ts
  private resolveScheduleStartAts(
    dto: { schedule: LeagueFixtureScheduleDto },
    totalRounds: number,
    timing: FixtureTimingOptions | undefined,
  ): Date[];
  private resolveScheduleStartAts(
    dto: Pick<GenerateLeagueFixturesDto, 'schedule'>,
    totalRounds: number,
    timing: FixtureTimingOptions | undefined,
  ): Date[] | undefined;
  private resolveScheduleStartAts(
    dto: Pick<GenerateLeagueFixturesDto, 'schedule'>,
    totalRounds: number,
    timing: FixtureTimingOptions | undefined,
  ): Date[] | undefined {
    // (기존 본문 그대로)
```
(기존 본문은 한 글자도 바꾸지 않는다. 기존 호출부는 전체 dto 를 넘기므로 두 번째 시그니처로 해석된다.)

(b) import 를 더한다:

```ts
import { BRACKET_TEMPLATE_MAX_FIXTURES } from '../tournaments/templates/bracket-template-plan';
import { lockCompetitionForBracketMutationInTx } from '../tournaments/slots/competition-bracket-lock';
import { planLeagueTemplate } from './league-template-plan';
```
그리고 `dto/league-match.dto` import 목록에 `ApplyLeagueTemplateDto`, `LeagueFixtureScheduleDto` 를 추가한다.

(c) `regenerateFixtures` 와 `createManualFixture` 사이에 메서드를 추가한다:

```ts
  /**
   * 템플릿으로 대진 뼈대를 만든다 — 자리(ENTRY) N개와 라운드로빈 빈 경기. 팀은 이후 자리 배정으로 들어온다.
   *
   * 잠금은 일괄 생성과 같다: 리그 행 `FOR UPDATE` → 상태 가드 → "경기가 이미 있으면 409". 두 요청이 동시에
   * 들어와도 먼저 잠근 쪽만 만들고 다른 쪽은 `LEAGUE_FIXTURES_EXIST` 를 받는다. 리그 `status` 는 바꾸지 않는다 —
   * 자리가 모두 차는 순간 `promoteLeagueWhenSlotsFilledInTx` 가 올린다.
   */
  async applyTemplate(user: V1AuthUser, leagueId: string, dto: ApplyLeagueTemplateDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const league = await this.loadLeague(leagueId);
    const config = await resolveTeamMatchCompetitionConfig(this.prisma, league.sportId);
    if (config === null) {
      throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '이 종목에 활성 경기 설정이 없어요.' });
    }
    const plan = planLeagueTemplate({ teamCount: dto.teamCount, legs: dto.legs });
    if (plan.fixtures.length > BRACKET_TEMPLATE_MAX_FIXTURES) {
      throw new UnprocessableEntityException({
        code: 'BRACKET_TEMPLATE_TOO_LARGE',
        message: `경기가 ${BRACKET_TEMPLATE_MAX_FIXTURES}개를 넘어요. 팀 수나 회전 수를 줄여 주세요.`,
      });
    }
    // 날짜 검증은 트랜잭션 밖 — 도메인 거부가 락을 잡을 이유가 없다.
    const startAts = this.resolveScheduleStartAts({ schedule: dto.schedule }, plan.totalRounds, undefined);
    const trimmedPlaceName = dto.placeName?.trim();
    const placeName = trimmedPlaceName ? trimmedPlaceName : DEFAULT_FIXTURE_PLACE_NAME;

    return this.prisma.$transaction(async (tx) => {
      // 리그 레인 = 행 FOR UPDATE + 보류 가드(PR-1b). raw SQL 을 이 파일에 새로 넣지 않는다 —
      // `tournament-raw-sql-baseline.json` 의 이 파일 허용치(5)가 이미 꽉 차 있다.
      await lockCompetitionForBracketMutationInTx(tx, { id: leagueId, kind: 'regular_league' });
      if ((await tx.v1TeamMatch.count({ where: { leagueId } })) > 0) {
        throw new ConflictException({ code: 'LEAGUE_FIXTURES_EXIST', message: '이미 대진이 생성된 리그예요.' });
      }
      const slotIds = plan.slotPositions.map(() => randomUUID());
      await tx.v1TournamentSlot.createMany({
        data: plan.slotPositions.map((position, index) => ({
          id: slotIds[index],
          tournamentId: leagueId,
          kind: 'ENTRY' as const,
          groupId: null,
          position,
        })),
      });
      for (const fixture of plan.fixtures) {
        await createLeagueFixture(tx, this.games, {
          leagueId: league.id,
          adminUserId: admin.userId,
          sportId: league.sportId,
          regionId: league.regionId,
          competitionConfigId: config.id,
          title: leagueFixtureTitle({ leagueTitle: league.title, round: fixture.round }),
          placeName,
          startAt: startAts[fixture.round - 1],
          endAt: null,
          home: null,
          away: null,
          homeSlotId: slotIds[fixture.homePosition - 1],
          awaySlotId: slotIds[fixture.awayPosition - 1],
        });
      }
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.apply_template',
          targetType: 'league_match',
          targetId: leagueId,
          afterJson: {
            teamCount: dto.teamCount,
            legs: dto.legs,
            slotCount: slotIds.length,
            fixtureCount: plan.fixtures.length,
            schedule: toKstScheduleLog(startAts),
            placeName,
          },
        },
        tx,
      );
      return { slots: slotIds.length, fixtures: plan.fixtures.length };
    }, {
      // 일괄 생성과 같은 이유 — ALB idle_timeout(60초)보다 낮아야 실패가 실제 실패와 일치한다.
      timeout: 45_000,
      maxWait: 5_000,
    });
  }
```

- [ ] **Step 5: 컨트롤러에 라우트를 추가한다**

`ApplyLeagueTemplateDto` 를 import 목록에 추가하고, `regenerateFixtures` 라우트 앞에 둔다(정적 세그먼트라 `:teamMatchId` 라우트와 충돌하지 않는다 — `POST :leagueId/fixtures/:teamMatchId/cancel` 은 세그먼트 수가 다르다):

```ts
  // 자리 기반 빈 대진 템플릿. 정적 세그먼트('template')라 `POST :leagueId/fixtures`·`/manual`·`/regenerate` 와 충돌하지 않는다.
  @Post(':leagueId/fixtures/template')
  applyTemplate(
    @CurrentUser() user: V1AuthUser,
    @Param('leagueId', leagueIdPipe) leagueId: string,
    @Body() dto: ApplyLeagueTemplateDto,
  ) {
    return this.service.applyTemplate(user, leagueId, dto);
  }
```

- [ ] **Step 6: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-match-admin\|league-match.dto"
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/league-matches/league-match-admin.service.spec.ts
node scripts/v1-surface-check.mjs
```
Expected: `0`, spec PASS, surface check 통과(raw `v1_tournaments` 참조를 추가하지 않으므로 baseline JSON 은 건드리지 않는다 — `league-match-admin.service.ts` 허용치 5 유지). CI: `league-template.integration-spec.ts` 7건 PASS(동시성 2건 포함).

- [ ] **Step 7: 커밋**

```bash
git commit -m "feat(league): 정규 리그 대진 템플릿 — 자리 N개 + 라운드로빈 빈 경기" -- apps/v1_api/src/league-matches/dto/league-match.dto.ts apps/v1_api/src/league-matches/league-match-admin.service.ts apps/v1_api/src/league-matches/league-match-admin.controller.ts apps/v1_api/test/league-matches/league-template.integration-spec.ts
git show --stat HEAD
```

### Task 8: `replaceExisting` — 취소 기반 교체

기존 재생성(`regenerateFixtures`)과 같은 이유로(게임 행이 `Restrict` 로 붙어 있어 지울 수 없다) 리그는 "삭제"가 아니라 **취소 + 자리 연결 해제**로 접는다(스펙 S2). 취소 안 된 경기가 **전부 시작 전·결과 없음**일 때만 허용하고, 하나라도 시작·결과가 있으면 아무것도 바꾸지 않고 409 `BRACKET_LOCKED`.

**Files:**
- Modify: `apps/v1_api/src/league-matches/dto/league-match.dto.ts` (`ApplyLeagueTemplateDto` 에 필드 추가)
- Modify: `apps/v1_api/src/league-matches/league-match-admin.service.ts` — `applyTemplate` 본문(아래 (c) 전체), 새 private `replaceLeagueFixturesInTx`, 상수
- Test: `apps/v1_api/test/league-matches/league-template.integration-spec.ts` (케이스 추가)

**Interfaces:**
- Consumes: `cancelLeagueFixtureRowInTx`(Task 6), `isUnfilledSlotFixture`(Task 1), `notifyFixturesCancelled`.
- Produces: `ApplyLeagueTemplateDto.replaceExisting?: boolean`.

- [ ] **Step 1: 실패하는 통합 케이스를 추가한다**

`league-template.integration-spec.ts` 의 `describe` 안, 마지막 `it` 뒤에 붙인다:

```ts
  describe('replaceExisting', () => {
    const body = (overrides: Record<string, unknown> = {}) => ({
      teamCount: 5, legs: 1, schedule: { dates: kstDates(5), time: '19:00' }, replaceExisting: true, ...overrides,
    });

    it('시작 전 템플릿 대진을 취소로 접고 옛 자리를 지운 뒤 새로 만든다', async () => {
      const leagueId = await h.makeLeague();
      expect((await post(leagueId, { teamCount: 4, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } })).status).toBe(201);
      const oldSlotIds = (await h.prisma.v1TournamentSlot.findMany({ where: { tournamentId: leagueId } })).map((slot) => slot.id);

      const res = await post(leagueId, body());

      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({ slots: 5, fixtures: 10 });
      const fixtures = await h.prisma.v1TeamMatch.findMany({ where: { leagueId } });
      const cancelled = fixtures.filter((f) => f.status === 'cancelled');
      expect(cancelled).toHaveLength(6);
      expect(cancelled.every((f) => f.homeSlotId === null && f.awaySlotId === null)).toBe(true);
      expect(fixtures.filter((f) => f.status === 'matched')).toHaveLength(10);
      const slots = await h.prisma.v1TournamentSlot.findMany({ where: { tournamentId: leagueId } });
      expect(slots).toHaveLength(5);
      expect(slots.some((slot) => oldSlotIds.includes(slot.id))).toBe(false);
      expect((await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).status).toBe('draft');
    });

    it('팀이 찬 시작 전 경기도 교체되고 그 팀의 팀 일정은 취소된다', async () => {
      const teamA = await h.makeTeam('lstp-r1');
      const teamB = await h.makeTeam('lstp-r2');
      const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
      const teamMatchId = await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id });

      expect((await post(leagueId, body({ teamCount: 3, schedule: { dates: kstDates(3), time: '19:00' } }))).status).toBe(201);

      expect((await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).status).toBe('cancelled');
      const schedules = await h.prisma.v1TeamSchedule.findMany({ where: { teamMatchId } });
      expect(schedules).toHaveLength(2);
      expect(schedules.every((row) => row.state === 'CANCELLED')).toBe(true);
    });

    it('시작했거나 결과가 있는 경기가 하나라도 있으면 409 BRACKET_LOCKED 이고 아무것도 바뀌지 않는다', async () => {
      for (const state of ['LIVE', 'ENDED'] as const) {
        const leagueId = await h.makeLeague();
        await post(leagueId, { teamCount: 4, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } });
        const fixtures = await h.prisma.v1TeamMatch.findMany({ where: { leagueId }, orderBy: { id: 'asc' } });
        await h.prisma.v1Game.update({ where: { teamMatchId: fixtures[3].id }, data: { state } });

        const res = await post(leagueId, body());

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('BRACKET_LOCKED');
        const after = await h.prisma.v1TeamMatch.findMany({ where: { leagueId } });
        expect(after).toHaveLength(6);
        expect(after.every((f) => f.status === 'matched' && f.homeSlotId !== null)).toBe(true);
        expect(await h.prisma.v1TournamentSlot.count({ where: { tournamentId: leagueId } })).toBe(4);
      }
    });

    it('이전에 취소된 경기는 교체를 막지 않고 그대로 남는다', async () => {
      const leagueId = await h.makeLeague();
      await post(leagueId, { teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } });
      const [first] = await h.prisma.v1TeamMatch.findMany({ where: { leagueId }, orderBy: { id: 'asc' } });
      await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${first.id}/cancel`)
        .set('x-v1-user-id', h.adminUserId)
        .send({ reason: '사전 취소' });

      const res = await post(leagueId, body({ teamCount: 3, schedule: { dates: kstDates(3), time: '19:00' } }));

      expect(res.status).toBe(201);
      expect(await h.prisma.v1TeamMatch.count({ where: { leagueId, status: 'cancelled' } })).toBe(3);
      expect(await h.prisma.v1TeamMatch.count({ where: { leagueId, status: 'matched' } })).toBe(3);
    });

    it('대조군: replaceExisting 을 안 주거나 false 면 기존 대진이 있을 때 그대로 409 LEAGUE_FIXTURES_EXIST', async () => {
      const leagueId = await h.makeLeague();
      await post(leagueId, { teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } });
      const res = await post(leagueId, body({ teamCount: 3, replaceExisting: false }));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LEAGUE_FIXTURES_EXIST');
    });
  });
```

- [ ] **Step 2: 실행해 실패를 확인한다**

CI: 첫 케이스가 `400`(`replaceExisting` 이 `forbidNonWhitelisted` 에 걸림, `property replaceExisting should not exist`)으로 FAIL. 로컬은 `tsc` 신호 없음.

- [ ] **Step 3: 구현한다**

(a) DTO 에 필드를 더한다(`placeName` 아래):

```ts
  // true 면 취소 안 된 경기가 전부 시작 전·결과 없음일 때 기존 대진을 취소로 접고 다시 만든다.
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
```

(b) 서비스 상수(`TEAM_REMOVAL_CANCEL_REASON` 아래):

```ts
const TEMPLATE_REPLACE_CANCEL_REASON = '대진 템플릿으로 다시 만들면서 취소했어요.';
```

(c) `applyTemplate` 를 아래 **최종 전체 본문**으로 통째로 바꾼다(Task 7 의 같은 이름 메서드를 대체 — 바뀐 곳은 `existing` 판정·`replaced` 반환·감사 로그 `replacedCount`·커밋 뒤 알림 네 군데뿐이고, 나머지는 Task 7 과 글자 그대로 같다):

```ts
  async applyTemplate(user: V1AuthUser, leagueId: string, dto: ApplyLeagueTemplateDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const league = await this.loadLeague(leagueId);
    const config = await resolveTeamMatchCompetitionConfig(this.prisma, league.sportId);
    if (config === null) {
      throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '이 종목에 활성 경기 설정이 없어요.' });
    }
    const plan = planLeagueTemplate({ teamCount: dto.teamCount, legs: dto.legs });
    if (plan.fixtures.length > BRACKET_TEMPLATE_MAX_FIXTURES) {
      throw new UnprocessableEntityException({
        code: 'BRACKET_TEMPLATE_TOO_LARGE',
        message: `경기가 ${BRACKET_TEMPLATE_MAX_FIXTURES}개를 넘어요. 팀 수나 회전 수를 줄여 주세요.`,
      });
    }
    const startAts = this.resolveScheduleStartAts({ schedule: dto.schedule }, plan.totalRounds, undefined);
    const trimmedPlaceName = dto.placeName?.trim();
    const placeName = trimmedPlaceName ? trimmedPlaceName : DEFAULT_FIXTURE_PLACE_NAME;

    const result = await this.prisma.$transaction(
      async (tx) => {
        await lockCompetitionForBracketMutationInTx(tx, { id: leagueId, kind: 'regular_league' });
        const existing = await tx.v1TeamMatch.findMany({
          where: { leagueId },
          select: {
            id: true,
            status: true,
            title: true,
            hostTeamId: true,
            approvedApplicantTeamId: true,
            homeSlotId: true,
            awaySlotId: true,
          },
        });
        let replaced: Array<{ id: string; title: string; hostTeamId: string | null; approvedApplicantTeamId: string | null }> = [];
        if (existing.length > 0) {
          if (dto.replaceExisting !== true) {
            throw new ConflictException({ code: 'LEAGUE_FIXTURES_EXIST', message: '이미 대진이 생성된 리그예요.' });
          }
          replaced = await this.replaceLeagueFixturesInTx(tx, leagueId, existing);
        }
        const slotIds = plan.slotPositions.map(() => randomUUID());
        await tx.v1TournamentSlot.createMany({
          data: plan.slotPositions.map((position, index) => ({
            id: slotIds[index],
            tournamentId: leagueId,
            kind: 'ENTRY' as const,
            groupId: null,
            position,
          })),
        });
        for (const fixture of plan.fixtures) {
          await createLeagueFixture(tx, this.games, {
            leagueId: league.id,
            adminUserId: admin.userId,
            sportId: league.sportId,
            regionId: league.regionId,
            competitionConfigId: config.id,
            title: leagueFixtureTitle({ leagueTitle: league.title, round: fixture.round }),
            placeName,
            startAt: startAts[fixture.round - 1],
            endAt: null,
            home: null,
            away: null,
            homeSlotId: slotIds[fixture.homePosition - 1],
            awaySlotId: slotIds[fixture.awayPosition - 1],
          });
        }
        await this.adminContext.logAdminAction(
          admin,
          {
            action: 'league_match.apply_template',
            targetType: 'league_match',
            targetId: leagueId,
            afterJson: {
              teamCount: dto.teamCount,
              legs: dto.legs,
              slotCount: slotIds.length,
              fixtureCount: plan.fixtures.length,
              schedule: toKstScheduleLog(startAts),
              placeName,
              replacedCount: replaced.length,
            },
          },
          tx,
        );
        return { slots: slotIds.length, fixtures: plan.fixtures.length, replaced };
      },
      { timeout: 45_000, maxWait: 5_000 },
    );
    if (result.replaced.length > 0) this.notifyFixturesCancelled(leagueId, result.replaced, TEMPLATE_REPLACE_CANCEL_REASON);
    return { slots: result.slots, fixtures: result.fixtures };
  }
```

(d) 새 private 메서드(`cancelLeagueFixtureRowInTx` 근처):

```ts
  /**
   * 템플릿 교체 — 취소 안 된 경기가 **전부** 시작 전·결과 없음일 때만 접는다. 게임 행을 먼저 id 순으로
   * 잠근 뒤 판정해서, 판정과 취소 사이에 콘솔이 경기를 시작하지 못하게 한다. 리그엔 소프트 삭제가 없다
   * (게임이 `Restrict` 로 붙어 있다) — 취소가 곧 "접기"이고, 취소는 자리 연결도 풀기 때문에 옛 자리를 지울 수 있다.
   */
  private async replaceLeagueFixturesInTx(
    tx: Prisma.TransactionClient,
    leagueId: string,
    existing: ReadonlyArray<{
      id: string;
      status: string;
      title: string;
      hostTeamId: string | null;
      approvedApplicantTeamId: string | null;
      homeSlotId: string | null;
      awaySlotId: string | null;
    }>,
  ) {
    const live = existing.filter((fixture) => fixture.status !== 'cancelled').sort((a, b) => (a.id < b.id ? -1 : 1));
    if (live.length > 0) {
      const games = await tx.$queryRaw<Array<{ state: string; currentOfficialRevisionId: string | null; revisionCount: number }>>`
        SELECT game.state::text AS state,
               game.current_official_revision_id AS "currentOfficialRevisionId",
               (SELECT COUNT(*)::int FROM v1_game_result_revisions revision WHERE revision.game_id = game.id) AS "revisionCount"
        FROM v1_games game
        WHERE game.team_match_id = ANY(${live.map((fixture) => fixture.id)}::text[])
        ORDER BY game.id
        FOR UPDATE OF game`;
      if (games.some((game) => game.state !== 'SCHEDULED' || game.currentOfficialRevisionId !== null || game.revisionCount > 0)) {
        throw new ConflictException({
          code: 'BRACKET_LOCKED',
          message: '이미 시작했거나 결과가 있는 경기가 있어 대진 템플릿으로 바꿀 수 없어요.',
        });
      }
    }
    const notices: Array<{ id: string; title: string; hostTeamId: string | null; approvedApplicantTeamId: string | null }> = [];
    for (const fixture of live) {
      await this.cancelLeagueFixtureRowInTx(tx, fixture.id, TEMPLATE_REPLACE_CANCEL_REASON);
      if (!isUnfilledSlotFixture(fixture)) {
        notices.push({ id: fixture.id, title: fixture.title, hostTeamId: fixture.hostTeamId, approvedApplicantTeamId: fixture.approvedApplicantTeamId });
      }
    }
    await tx.v1TournamentSlot.deleteMany({ where: { tournamentId: leagueId } });
    return notices;
  }
```

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-match-admin\|league-match.dto"
```
Expected: `0`. CI: `league-template.integration-spec.ts` 12건 PASS.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(league): 템플릿 replaceExisting — 시작 전 대진만 취소로 접고 자리를 새로 만든다" -- apps/v1_api/src/league-matches/dto/league-match.dto.ts apps/v1_api/src/league-matches/league-match-admin.service.ts apps/v1_api/test/league-matches/league-template.integration-spec.ts
git show --stat HEAD
```

### Task 9: 자리 리그에서 기존 「재생성」 차단 (`LEAGUE_SLOT_FIXTURES_USE_TEMPLATE`)

자리를 쓰는 리그를 기존 `regenerateFixtures` 로 다시 만들면 팀 목록 기반 일반 대진이 자리 대진 위에 섞인다. 템플릿 교체로 단일화하기 위해 자리가 하나라도 있으면 409 로 막는다. 일반 리그(자리 없음)의 재생성은 그대로다.

**Files:**
- Modify: `apps/v1_api/src/league-matches/league-match-admin.service.ts` 의 `regenerateFixtures` 트랜잭션(가드 호출 바로 뒤)
- Test: `apps/v1_api/test/league-matches/league-slot-cancel-regenerate.integration-spec.ts` (케이스 추가)

- [ ] **Step 1: 실패하는 통합 케이스를 추가한다**

`league-slot-cancel-regenerate.integration-spec.ts` 의 `describe` 안에 붙인다:

```ts
  describe('재생성', () => {
    const regenerate = (leagueId: string) =>
      request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/regenerate`)
        .set('x-v1-user-id', h.adminUserId)
        .send({
          weeksCount: 1,
          reason: '재생성',
          schedule: {
            dates: [new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + 10 * 86_400_000))],
            time: '19:00',
          },
        });

    it('자리가 있는 리그는 409 LEAGUE_SLOT_FIXTURES_USE_TEMPLATE 이고 기존 경기를 취소하지 않는다', async () => {
      const teamA = await h.makeTeam('lscr-r1');
      const teamB = await h.makeTeam('lscr-r2');
      const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
      const [s1, s2] = await h.makeSlots(leagueId, 2);
      const teamMatchId = await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id, homeSlotId: s1.id, awaySlotId: s2.id });

      const res = await regenerate(leagueId);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LEAGUE_SLOT_FIXTURES_USE_TEMPLATE');
      expect((await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).status).toBe('matched');
    });

    it('대조군: 자리가 없는 일반 리그의 재생성은 그대로 동작한다', async () => {
      const teamA = await h.makeTeam('lscr-r3');
      const teamB = await h.makeTeam('lscr-r4');
      const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
      const teamMatchId = await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id });

      const res = await regenerate(leagueId);

      expect(res.status).toBe(201);
      expect((await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).status).toBe('cancelled');
      expect(await h.prisma.v1TeamMatch.count({ where: { leagueId, status: 'matched' } })).toBe(1);
    });
  });
```

- [ ] **Step 2: 실행해 실패를 확인한다**

CI: 첫 케이스가 `201`(자리 리그가 그대로 재생성됨)로 FAIL(기대 409).

- [ ] **Step 3: 구현한다**

`regenerateFixtures` 트랜잭션에서 `await assertLeagueFixtureGenerationAllowedInTx(tx, leagueId);`(PR-1b 가 바꾼 줄) 바로 뒤에 추가:

```ts
      // 자리로 만든 대진은 템플릿 교체로만 다시 만든다 — 팀 목록 기반 재생성이 자리 대진 위에 섞이지 않게.
      if ((await tx.v1TournamentSlot.count({ where: { tournamentId: leagueId } })) > 0) {
        throw new ConflictException({
          code: 'LEAGUE_SLOT_FIXTURES_USE_TEMPLATE',
          message: '자리로 만든 대진은 다시 만들 수 없어요. 대진 템플릿으로 바꿔 주세요.',
        });
      }
```
같은 메서드 위쪽 doc 주석(`// R13: 대진 재생성...`) 끝에 한 줄: `// 자리가 있는 리그는 409 LEAGUE_SLOT_FIXTURES_USE_TEMPLATE — 템플릿 교체(replaceExisting)로 단일화한다.`

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-match-admin"
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/league-matches/league-match-admin.service.spec.ts
```
Expected: `0`, spec PASS(기존 재생성 케이스의 fake tx 에 `v1TournamentSlot` 이 없으면 `Cannot read properties of undefined (reading 'count')` 로 깨진다 — 그때는 해당 spec 의 `FakeState`/tx 목에 `v1TournamentSlot: { count: async () => 0 }` 를 **추가**한다. 가짜 응답은 "자리 없음"이라는 사실 하나뿐이므로 목 검증이 아니다). CI: 2건 PASS.

- [ ] **Step 5: 커밋**

```bash
git commit -m "fix(league): 자리가 있는 리그의 기존 재생성은 409 로 막고 템플릿 교체로 단일화" -- apps/v1_api/src/league-matches/league-match-admin.service.ts apps/v1_api/test/league-matches/league-slot-cancel-regenerate.integration-spec.ts apps/v1_api/src/league-matches/league-match-admin.service.spec.ts
git show --stat HEAD
```

### Task 10: 자리 배정 서비스의 리그 레인 열기 (`assertTournamentLane` 교체)

PR-1b 의 `TournamentSlotService` 는 대회·리그 공통 경로(스펙 S3)이고, 리그 자리를 만드는 경로가 아직 없어서 `assertTournamentLane` 이 리그 자리를 409 `SLOT_LEAGUE_NOT_SUPPORTED_YET` 로 막아 둔다(정의 1 + 호출 2: `assignSlotCore`·`randomFill`). 이 Task 가 그 한 곳을 지우고 ① 자리를 쓰는 경기의 사이드 배정을 리그용 함수로 가르고 ② 배정이 끝난 뒤 `promoteLeagueWhenSlotsFilledInTx` 를 부른다. 잠금(`lockCompetitionForBracketMutationInTx` 의 리그 갈래 = 행 `FOR UPDATE` + 보류 가드)은 PR-1b 가 이미 리그를 안다. 맞바꾸기·무작위 채우기는 `assignSlotsBatchInTx` → `assignSlotCore` 를 거치므로 같은 분기를 탄다(배치 함수는 이 PR 이 건드리지 않는다). 리그 자리는 `groupId=null` 이라 PR-1b 가 넘기는 `releases` 목록이 비어 `releaseUnusedGroupTeamsInTx` 호출이 일어나지 않는다.

**Files:**
- Modify: `apps/v1_api/src/tournaments/slots/tournament-slot.service.ts` — `assertTournamentLane` 삭제, `assignSlotCore` 의 사이드 배정 분기·배정 뒤 훅, import
- Modify: `apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts` (+ 있으면 `tournament-slot.service.spec.ts`) — `SLOT_LEAGUE_NOT_SUPPORTED_YET` 를 단언하던 케이스 뒤집기/삭제
- Modify: `docs/api/domains/tournaments.md` — `SLOT_LEAGUE_NOT_SUPPORTED_YET` 언급 삭제
- Test: `apps/v1_api/test/league-matches/league-slot-assignment-lane.integration-spec.ts`

**Interfaces:**
- Consumes: `assignLeagueFixtureSideInTx(tx, deps, admin, { teamMatchId, side, registrationId })`(Task 3), `promoteLeagueWhenSlotsFilledInTx(tx, leagueId)`(Task 4), PR-1b 의 `assignSlotCore(tx, ctx, slotId, registrationId, releases)`(내부 함수, `competition` 을 이미 읽는다)·`SlotMutationContext`(`{ admin, adminContext, games }`).
- Produces: 리그 슬롯의 `PUT /admin/tournament-slots/:slotId/assignment` 와 `POST /admin/tournaments/:id/slots/random-fill` 이 동작한다(응답은 계약 그대로).

- [ ] **Step 1: 실패하는 통합 스펙을 쓴다**

```ts
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type HarnessTeam, type LeagueSlotHarness } from './helpers/league-slot-harness';

const kstDates = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + (index + 2) * 7 * 86_400_000)),
  );

describe('PUT /admin/tournament-slots/:slotId/assignment — 정규 리그 레인', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let supportUserId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lsal');
    supportUserId = await h.makeAdmin('support');
  });
  afterAll(async () => cleanup?.());

  /** 3팀 1회전 템플릿(자리 3 · 경기 3) 위에 참가팀 3개를 둔 리그. */
  async function templateLeague() {
    const teams: HarnessTeam[] = [await h.makeTeam('lsal-a'), await h.makeTeam('lsal-b'), await h.makeTeam('lsal-c')];
    const leagueId = await h.makeLeague({ teams });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/template`)
      .set('x-v1-user-id', h.adminUserId)
      .send({ teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } });
    expect(res.status).toBe(201);
    const slots = await h.prisma.v1TournamentSlot.findMany({ where: { tournamentId: leagueId }, orderBy: { position: 'asc' } });
    const regs = await Promise.all(teams.map((team) => h.registrationId(leagueId, team.id)));
    return { leagueId, teams, slots, regs };
  }
  const put = (slotId: string, registrationId: string | null, userId = h.adminUserId) =>
    request(app.getHttpServer())
      .put(`/api/v1/admin/tournament-slots/${slotId}/assignment`)
      .set('x-v1-user-id', userId)
      .send({ registrationId });
  const fixturesOf = (leagueId: string) => h.prisma.v1TeamMatch.findMany({ where: { leagueId }, orderBy: { id: 'asc' } });
  const statusOf = async (leagueId: string) =>
    (await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).status;

  it('자리 하나에 팀을 넣으면 그 자리를 쓰는 경기 두 건에만 반영되고 나머지는 그대로다(반쪽이라 팀 일정은 아직 없다)', async () => {
    const { leagueId, teams, slots, regs } = await templateLeague();

    const res = await put(slots[0].id, regs[0]);

    expect(res.status).toBe(200);
    const using = (await fixturesOf(leagueId)).filter((f) => f.homeSlotId === slots[0].id || f.awaySlotId === slots[0].id);
    expect(res.body.data.affectedTeamMatchIds.sort()).toEqual(using.map((f) => f.id).sort());
    expect(using).toHaveLength(2);
    for (const fixture of using) {
      const teamIds = [fixture.hostTeamId, fixture.approvedApplicantTeamId];
      expect(teamIds.filter((id) => id === teams[0].id)).toHaveLength(1);
    }
    const untouched = (await fixturesOf(leagueId)).filter((f) => !using.includes(f));
    expect(untouched).toHaveLength(1);
    expect([untouched[0].hostTeamId, untouched[0].approvedApplicantTeamId]).toEqual([null, null]);
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatch: { leagueId } } })).toBe(0);
    expect(await statusOf(leagueId)).toBe('draft');
  });

  it('양쪽 자리가 모두 찬 경기부터 팀 일정·신청서가 생기고, 마지막 자리가 차면 리그가 진행 상태가 된다', async () => {
    const { leagueId, slots, regs } = await templateLeague();
    await put(slots[0].id, regs[0]);
    await put(slots[1].id, regs[1]);

    const both = (await fixturesOf(leagueId)).find(
      (f) => [f.homeSlotId, f.awaySlotId].includes(slots[0].id) && [f.homeSlotId, f.awaySlotId].includes(slots[1].id),
    );
    expect(both).toBeDefined();
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatchId: both!.id, state: 'SCHEDULED' } })).toBe(2);
    expect(await h.prisma.v1TeamMatchApplication.count({ where: { teamMatchId: both!.id, status: 'approved' } })).toBe(1);
    expect(await statusOf(leagueId)).toBe('draft');

    await put(slots[2].id, regs[2]);

    expect(await statusOf(leagueId)).toBe('in_progress');
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatch: { leagueId }, state: 'SCHEDULED' } })).toBe(6);
  });

  it('자리를 비우면 그 경기들이 다시 미정으로 돌아가고 팀 일정이 취소된다 — 진행 상태는 되돌리지 않는다', async () => {
    const { leagueId, slots, regs } = await templateLeague();
    for (const [index, slot] of slots.entries()) await put(slot.id, regs[index]);
    expect(await statusOf(leagueId)).toBe('in_progress');

    const res = await put(slots[1].id, null);

    expect(res.status).toBe(200);
    const using = (await fixturesOf(leagueId)).filter((f) => f.homeSlotId === slots[1].id || f.awaySlotId === slots[1].id);
    expect(using).toHaveLength(2);
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatchId: { in: using.map((f) => f.id) }, state: 'SCHEDULED' } })).toBe(0);
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatch: { leagueId }, state: 'SCHEDULED' } })).toBe(2);
    expect(await statusOf(leagueId)).toBe('in_progress');
  });

  it('같은 자리를 C→B→C 로 바꿔도 신청서 유일 제약 오류 없이 원정 팀의 신청서만 approved 로 남는다', async () => {
    const { leagueId, teams, slots, regs } = await templateLeague();
    await put(slots[0].id, regs[0]);
    await put(slots[1].id, regs[1]);
    for (const reg of [regs[2], regs[1], regs[2]]) {
      expect((await put(slots[1].id, reg)).status).toBe(200);
    }
    const both = (await fixturesOf(leagueId)).find(
      (f) => [f.homeSlotId, f.awaySlotId].includes(slots[0].id) && [f.homeSlotId, f.awaySlotId].includes(slots[1].id),
    )!;
    // 자리 1이 이 경기의 원정이면 마지막 C 가, 홈이면 원정인 자리 0 의 A 가 승인 상태다.
    const awayTeam = both.awaySlotId === slots[1].id ? teams[2] : teams[0];
    const applications = await h.prisma.v1TeamMatchApplication.findMany({ where: { teamMatchId: both.id } });
    expect(applications.filter((row) => row.status === 'approved').map((row) => row.applicantTeamId)).toEqual([awayTeam.id]);
    expect((await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: both.id } })).approvedApplicantTeamId).toBe(awayTeam.id);
  });

  it('이미 다른 자리에 있는 팀은 409 SLOT_TEAM_ALREADY_PLACED, 시작한 경기가 있으면 409 SLOT_LOCKED', async () => {
    const { leagueId, slots, regs } = await templateLeague();
    await put(slots[0].id, regs[0]);
    const dup = await put(slots[1].id, regs[0]);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('SLOT_TEAM_ALREADY_PLACED');

    const using = (await fixturesOf(leagueId)).find((f) => f.homeSlotId === slots[0].id || f.awaySlotId === slots[0].id)!;
    await h.prisma.v1Game.update({ where: { teamMatchId: using.id }, data: { state: 'LIVE' } });
    const locked = await put(slots[0].id, regs[1]);
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('SLOT_LOCKED');
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[0].id } })).registrationId).toBe(regs[0]);
  });

  it('취소된 경기는 자리를 쓰는 경기에서 빠진다 — 반영 대상도 잠금 판정도 아니다', async () => {
    const { leagueId, slots, regs } = await templateLeague();
    const target = (await fixturesOf(leagueId)).find((f) => f.homeSlotId === slots[0].id || f.awaySlotId === slots[0].id)!;
    // 시작한 경기라도 취소하면 자리 연결이 풀려 더는 이 자리의 경기가 아니다.
    await h.prisma.v1Game.update({ where: { teamMatchId: target.id }, data: { state: 'ENDED' } });
    await h.prisma.v1TeamMatch.update({ where: { id: target.id }, data: { status: 'cancelled', homeSlotId: null, awaySlotId: null } });

    const res = await put(slots[0].id, regs[0]);

    expect(res.status).toBe(200);
    expect(res.body.data.affectedTeamMatchIds).toHaveLength(1);
    expect(res.body.data.affectedTeamMatchIds).not.toContain(target.id);
  });

  it('보류 리그는 409 LEAGUE_ON_HOLD, support 어드민은 403 이고 자리는 바뀌지 않는다', async () => {
    const { leagueId, slots, regs } = await templateLeague();
    const denied = await put(slots[0].id, regs[0], supportUserId);
    expect(denied.status).toBe(403);
    await h.prisma.v1Tournament.update({ where: { id: leagueId }, data: { status: 'on_hold' } });
    const held = await put(slots[0].id, regs[0]);
    expect(held.status).toBe(409);
    expect(held.body.code).toBe('LEAGUE_ON_HOLD');
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[0].id } })).registrationId).toBeNull();
  });
  describe('무작위 채우기 (POST /admin/tournaments/:id/slots/random-fill)', () => {
    const randomFill = (leagueId: string) =>
      request(app.getHttpServer())
        .post(`/api/v1/admin/tournaments/${leagueId}/slots/random-fill`)
        .set('x-v1-user-id', h.adminUserId);

    it('참가팀 수 = 자리 수면 전부 채우고 중복 없이 배정하며 리그가 진행 상태가 된다', async () => {
      const { leagueId, slots, regs } = await templateLeague();
      const res = await randomFill(leagueId);
      expect(res.status).toBe(201);
      const assignments: Array<{ slotId: string; registrationId: string }> = res.body.data.assignments;
      expect(assignments).toHaveLength(3);
      expect(new Set(assignments.map((a) => a.slotId)).size).toBe(3);
      expect(assignments.map((a) => a.registrationId).sort()).toEqual([...regs].sort());
      expect(assignments.map((a) => a.slotId).sort()).toEqual(slots.map((slot) => slot.id).sort());
      expect(await statusOf(leagueId)).toBe('in_progress');
    });

    it('팀이 자리보다 적으면 팀 수만큼만 채우고 리그 상태는 그대로다', async () => {
      const teams: HarnessTeam[] = [await h.makeTeam('lsal-r1'), await h.makeTeam('lsal-r2')];
      const leagueId = await h.makeLeague({ teams });
      await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/template`)
        .set('x-v1-user-id', h.adminUserId)
        .send({ teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } })
        .expect(201);

      const res = await randomFill(leagueId);

      expect(res.body.data.assignments).toHaveLength(2);
      expect(await h.prisma.v1TournamentSlot.count({ where: { tournamentId: leagueId, registrationId: null } })).toBe(1);
      expect(await statusOf(leagueId)).toBe('draft');
    });
  });
});
```

- [ ] **Step 2: 실행해 실패를 확인한다**

```bash
cd apps/v1_api && grep -n "assertTournamentLane\|SLOT_LEAGUE_NOT_SUPPORTED_YET" src/tournaments/slots/tournament-slot.service.ts
```
Expected: 정의 1 + 호출 2 + 메시지 1 이 나온다. CI: 첫 케이스가 `409 SLOT_LEAGUE_NOT_SUPPORTED_YET` 로 FAIL.

- [ ] **Step 3: 구현한다**

`tournament-slot.service.ts`:

1. import 를 더한다:
```ts
import { assignLeagueFixtureSideInTx } from '../../league-matches/league-fixture-side-assignment';
import { promoteLeagueWhenSlotsFilledInTx } from '../../league-matches/league-slot-status';
```
2. `function assertTournamentLane(...) { ... }` 와 그 위 doc 주석을 **삭제**하고, `assignSlotCore` 의 `assertTournamentLane(competition.kind);`·`randomFill` 의 `assertTournamentLane(competition.kind);` 두 줄을 지운다. 지운 뒤 `V1CompetitionKind` import 가 쓰이지 않으면 함께 지운다.
3. `assignSlotCore` 의 사이드 배정 루프(PR-1b 가 `assignTournamentFixtureSideInTx` 를 부르는 줄)를 분기로 바꾼다:
```ts
  for (const fixture of fixtures) {
    for (const side of sidesUsingSlot(fixture, slot.id)) {
      if (competition.kind === 'regular_league') {
        await assignLeagueFixtureSideInTx(tx, ctx, ctx.admin, { teamMatchId: fixture.id, side, registrationId });
      } else {
        await assignTournamentFixtureSideInTx(tx, ctx, ctx.admin, { fixtureId: fixture.id, side, registrationId });
      }
    }
  }
```
4. 같은 함수에서 감사 로그(`logAdminAction`) 바로 뒤, `return` 앞에 추가한다:
```ts
  // 리그: 빈 사이드가 하나도 없어진 순간 일괄 생성과 같은 진행 상태로 올린다(보류·완료는 건드리지 않는다).
  if (competition.kind === 'regular_league') await promoteLeagueWhenSlotsFilledInTx(tx, competition.id);
```
5. PR-1b 의 리그 거부 테스트를 지운다:
```bash
cd apps/v1_api && grep -rn "SLOT_LEAGUE_NOT_SUPPORTED_YET" src test ../../docs | cut -c1-140
```
나온 케이스(통합 스펙의 "정규 리그 자리는 이 PR 에서 409 …"·"정규 리그는 409 …, 없는 대회는 404")는 리그 부분을 지운다 — "없는 대회는 404" 단언은 남긴다. 문서의 `SLOT_LEAGUE_NOT_SUPPORTED_YET` 오류 설명 한 줄도 지운다.

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "tournament-slot.service"
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots
```
Expected: `0`, PR-1b 의 slot unit 스펙 PASS(대회 갈래 동작 불변). CI: `league-slot-assignment-lane.integration-spec.ts` 9건 + PR-1b 의 `tournament-slots.integration-spec.ts` PASS.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(league): 자리 배정의 리그 레인 열기 — 리그 사이드 배정과 상태 전이" -- apps/v1_api/src/tournaments/slots/tournament-slot.service.ts apps/v1_api/src/tournaments/slots/tournament-slot.service.spec.ts apps/v1_api/test/tournaments/tournament-slots.integration-spec.ts apps/v1_api/test/league-matches/league-slot-assignment-lane.integration-spec.ts docs/api/domains/tournaments.md
git show --stat HEAD
```

### Task 11: 리그 참가팀 제외 시 자리 해제 연결 (`removeTeam`) — 등록 취소는 PR-1b 가 이미 연결

`confirmed` 등록이 빠지는 지점을 전수 확인한 결과(`v1TournamentRegistration.update/updateMany` 호출 14곳 중 `confirmed` 를 벗어나는 것):

| 전이 | 위치 | 처리 |
|---|---|---|
| 리그 참가팀 제외 `confirmed → cancelled` | `league-match-admin.service.ts` (`removeTeam`) | **이 Task** |
| 어드민 등록 취소 `confirmed|cancel_requested(←confirmed) → cancelled` (**참가 취소 요청 승인도 같은 경로**) | `admin-registrations.service.ts` (`cancel`) | PR-1b Task 12 가 `TournamentSlotService.releaseForRegistrationInTx` 로 이미 연결 — 이 Task 의 통합 스펙이 리그 갈래를 검증 |
| 팀 자진 취소 요청 `confirmed → cancel_requested` | `tournament-registrations.service.ts` (`grep -n "cancel_requested"`) | 대상 아님 — 철회(`withdrawCancelRequest`)로 `confirmed` 로 돌아올 수 있어 승인 전에는 자리를 비우지 않는다 |
| 어드민 대기 처리 `→ waitlisted` | `admin-registrations.service.ts` (`waitlisted` 로 바꾸는 분기) | 대상 아님 — `ADMIN_CONFIRMABLE_STATUSES` 에 `confirmed` 가 없다 |
| 팀 해체 | `teams/team-dissolution-tx.ts` | 대상 아님 — 진행 중 등록이 있으면 해체가 이미 차단된다(스펙 S3) |

규칙(스펙 S3): 그 팀 자리를 쓰는 경기가 **전부 시작 전**이면 자리를 비우고(경기를 취소하지 않는다), 시작된 경기가 있으면 자리를 그대로 둔다(기록 보존). 자리 없는 기존 경기의 취소 동작은 지금 그대로다. 해제는 PR-1b 의 `lockCompetitionForSlotReleaseInTx` 를 쓰므로 **보류 리그에서도 막히지 않는다**(참가팀 제외는 보류 중에도 원래 가능하다).

**Files:**
- Modify: `apps/v1_api/src/league-matches/league-match-admin.service.ts` — `removeTeam`, import
- Modify: `apps/v1_api/src/league-matches/league-match-admin.service.spec.ts` (removeTeam 스펙의 가짜 tx)
- Test: `apps/v1_api/test/league-matches/league-slot-registration-release.integration-spec.ts`

**Interfaces:**
- Consumes: `releaseSlotsForRegistrationInTx(tx, ctx: SlotMutationContext, registrationId: string): Promise<void>`(PR-1b `tournaments/slots/tournament-slot.service.ts`). 컨텍스트는 `{ admin, adminContext: this.adminContext, games: this.games }` 로 서비스가 이미 가진 값으로 만든다.

- [ ] **Step 1: 실패하는 통합 스펙을 쓴다**

`apps/v1_api/test/league-matches/league-slot-registration-release.integration-spec.ts`:

```ts
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { NotificationsService } from '../../src/notifications/notifications.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type HarnessTeam, type LeagueSlotHarness } from './helpers/league-slot-harness';

const kstDates = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + (index + 2) * 7 * 86_400_000)),
  );

describe('등록이 confirmed 를 벗어날 때 자리 해제', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let notified: jest.SpyInstance;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lsrr');
    notified = jest.spyOn(app.get(NotificationsService), 'emitToManyDeferred');
  });
  beforeEach(() => notified.mockClear());
  afterAll(async () => cleanup?.());

  /** 3팀 템플릿 리그에서 자리 0←A, 1←B, 2←C 로 모두 채운 상태. */
  async function filledLeague() {
    const teams: HarnessTeam[] = [await h.makeTeam('lsrr-a'), await h.makeTeam('lsrr-b'), await h.makeTeam('lsrr-c')];
    const leagueId = await h.makeLeague({ teams });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/template`)
      .set('x-v1-user-id', h.adminUserId)
      .send({ teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } });
    const slots = await h.prisma.v1TournamentSlot.findMany({ where: { tournamentId: leagueId }, orderBy: { position: 'asc' } });
    const regs = await Promise.all(teams.map((team) => h.registrationId(leagueId, team.id)));
    for (const [index, slot] of slots.entries()) {
      await request(app.getHttpServer())
        .put(`/api/v1/admin/tournament-slots/${slot.id}/assignment`)
        .set('x-v1-user-id', h.adminUserId)
        .send({ registrationId: regs[index] })
        .expect(200);
    }
    return { leagueId, teams, slots, regs };
  }
  const removeTeam = (leagueId: string, teamId: string) =>
    request(app.getHttpServer()).delete(`/api/v1/admin/league-matches/${leagueId}/teams/${teamId}`).set('x-v1-user-id', h.adminUserId);
  const cancelRegistration = (registrationId: string) =>
    request(app.getHttpServer())
      .patch(`/api/v1/admin/registrations/${registrationId}/cancel`)
      .set('x-v1-user-id', h.adminUserId)
      .send({ reason: '참가 취소' });
  const usingSlot = (leagueId: string, slotId: string) =>
    h.prisma.v1TeamMatch.findMany({ where: { leagueId, OR: [{ homeSlotId: slotId }, { awaySlotId: slotId }] } });

  it('참가팀 제외: 시작 전 자리 경기는 취소하지 않고 자리만 비운다 — 팀 일정은 취소, 상대 팀 자리는 그대로', async () => {
    const { leagueId, teams, slots, regs } = await filledLeague();
    const before = await usingSlot(leagueId, slots[0].id);

    const res = await removeTeam(leagueId, teams[0].id);

    expect(res.status).toBe(200);
    expect(res.body.data.cancelledFixtureCount).toBe(0);
    const after = await usingSlot(leagueId, slots[0].id);
    expect(after.map((f) => f.id).sort()).toEqual(before.map((f) => f.id).sort());
    expect(after.every((f) => f.status === 'matched')).toBe(true);
    expect(after.every((f) => f.hostTeamId !== teams[0].id && f.approvedApplicantTeamId !== teams[0].id)).toBe(true);
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[0].id } })).registrationId).toBeNull();
    expect((await h.prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: regs[0] } })).status).toBe('cancelled');
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatchId: { in: after.map((f) => f.id) }, state: 'SCHEDULED' } })).toBe(0);
    // 대조군: A 가 없는 경기(자리 1 ↔ 2)는 그대로 양 팀이 차 있다.
    const rest = (await h.prisma.v1TeamMatch.findMany({ where: { leagueId } })).filter((f) => !after.some((a) => a.id === f.id));
    expect(rest).toHaveLength(1);
    expect(rest[0].hostTeamId).not.toBeNull();
    expect(rest[0].approvedApplicantTeamId).not.toBeNull();
  });

  it('참가팀 제외: 그 자리의 경기가 하나라도 시작됐으면 자리를 그대로 두고 그 팀의 경기는 기존대로 취소한다', async () => {
    const { leagueId, teams, slots, regs } = await filledLeague();
    const using = await usingSlot(leagueId, slots[0].id);
    await h.prisma.v1Game.update({ where: { teamMatchId: using[0].id }, data: { state: 'ENDED' } });

    const res = await removeTeam(leagueId, teams[0].id);

    expect(res.status).toBe(200);
    expect(res.body.data.cancelledFixtureCount).toBe(2);
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[0].id } })).registrationId).toBe(regs[0]);
    expect(await h.prisma.v1TeamMatch.count({ where: { id: { in: using.map((f) => f.id) }, status: 'cancelled' } })).toBe(2);
  });

  it('대조군: 자리 없는 기존 경기는 지금처럼 취소되고 양 팀에 알림이 간다', async () => {
    const teamA = await h.makeTeam('lsrr-l1');
    const teamB = await h.makeTeam('lsrr-l2');
    const teamC = await h.makeTeam('lsrr-l3');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB, teamC] });
    const fixtureId = await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id });

    const res = await removeTeam(leagueId, teamA.id);

    expect(res.body.data.cancelledFixtureCount).toBe(1);
    expect((await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: fixtureId } })).status).toBe('cancelled');
    expect(notified.mock.calls.filter((call) => call[1] === 'league_fixture_cancelled')).toHaveLength(2);
  });

  it('어드민 등록 취소(참가 취소 요청 승인 포함)도 시작 전이면 자리를 비우고, 시작됐으면 자리를 그대로 둔다', async () => {
    const { leagueId, slots, regs } = await filledLeague();
    expect((await cancelRegistration(regs[1])).status).toBe(200);
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[1].id } })).registrationId).toBeNull();
    expect((await usingSlot(leagueId, slots[1].id)).every((f) => f.status === 'matched')).toBe(true);

    const startedUsing = await usingSlot(leagueId, slots[2].id);
    await h.prisma.v1Game.update({ where: { teamMatchId: startedUsing[0].id }, data: { state: 'LIVE' } });
    expect((await cancelRegistration(regs[2])).status).toBe(200);
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[2].id } })).registrationId).toBe(regs[2]);
  });

  it('보류 리그에서도 참가팀 제외는 지금처럼 된다 — 자리 해제가 대진 생성 가드(LEAGUE_ON_HOLD)에 막히지 않는다', async () => {
    const { leagueId, teams, slots } = await filledLeague();
    await h.prisma.v1Tournament.update({ where: { id: leagueId }, data: { status: 'on_hold' } });

    const res = await removeTeam(leagueId, teams[0].id);

    expect(res.status).toBe(200);
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[0].id } })).registrationId).toBeNull();
  });
});
```

- [ ] **Step 2: 실행해 실패를 확인한다**

CI: 첫 케이스가 `cancelledFixtureCount` 2(기존 동작: 팀의 모든 경기를 취소)로 FAIL(기대 0). 어드민 등록 취소 케이스는 PR-1b 연결로 이미 PASS 일 수 있다.

- [ ] **Step 3: `removeTeam` 을 고친다**

`league-match-admin.service.ts` 상단에 import 를 더한다:

```ts
import { releaseSlotsForRegistrationInTx } from '../tournaments/slots/tournament-slot.service';
```
`removeTeam` 의 트랜잭션에서 `assertFixtureGamesNotInProgress(...)` 호출 바로 뒤, `let cancelled = 0;` 앞에 삽입하고 취소 루프의 대상 목록을 다시 읽도록 바꾼다:

```ts
      // 이 팀이 자리에 들어 있으면: 그 자리를 쓰는 경기가 전부 시작 전일 때 경기를 취소하지 않고 자리만 비운다
      // (자리 대진의 정본은 템플릿이다). 시작된 경기가 있으면 헬퍼가 자리를 그대로 두고, 그 경기는 아래 루프가 기존처럼 접는다.
      const registration = await tx.v1TournamentRegistration.findFirst({
        where: { tournamentId: leagueId, teamId, status: 'confirmed' },
        select: { id: true },
      });
      if (registration !== null) {
        await releaseSlotsForRegistrationInTx(
          tx,
          { admin, adminContext: this.adminContext, games: this.games },
          registration.id,
        );
      }
      // 비운 뒤 다시 읽는다 — 비워진 경기는 더 이상 이 팀의 경기가 아니다.
      const teamFixturesToCancel = await tx.v1TeamMatch.findMany({
        where: {
          leagueId,
          status: { not: 'cancelled' },
          OR: [{ hostTeamId: teamId }, { approvedApplicantTeamId: teamId }],
        },
        select: { id: true, title: true, hostTeamId: true, approvedApplicantTeamId: true, homeSlotId: true, awaySlotId: true },
      });
```
Task 6 이 바꾼 `for (const fixture of freshTeamFixtures) { if (fixture.status === 'cancelled') continue; ... }` 를 `for (const fixture of teamFixturesToCancel) {`(취소 필터 줄 삭제)로 바꾼다. `freshTeamFixtures` 는 공식 결과·진행 중 판정에만 쓰이므로, Task 6 에서 그 select 에 더했던 `homeSlotId/awaySlotId` 두 컬럼은 **되돌려 뺀다**.

- [ ] **Step 4: 기존 `removeTeam` 단위 스펙의 가짜 tx 를 맞춘다**

`league-match-admin.service.spec.ts` 상단 import 아래에 모듈 경계 스텁을 둔다 — 이 스펙의 관심은 알림·제외 확인이고, 자리 해제의 실제 동작은 위 통합 스펙이 DB 로 증명한다:

```ts
jest.mock('../tournaments/slots/tournament-slot.service', () => ({
  releaseSlotsForRegistrationInTx: jest.fn().mockResolvedValue(undefined),
}));
```
`makePrisma` 의 `v1TournamentRegistration` 에 `findFirst: jest.fn().mockResolvedValue({ id: 'registration-a' })` 를 추가한다. (`jest.mock` 은 파일 전체에 적용되므로 `grep -n "tournament-slot.service" src/league-matches/league-match-admin.service.spec.ts` 로 다른 describe 가 그 모듈을 쓰지 않는지 확인한다.)

- [ ] **Step 5: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-match-admin.service"
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/league-matches/league-match-admin.service.spec.ts
grep -n "releaseForRegistrationInTx" src/tournaments/admin-registrations.service.ts
```
Expected: `0`, spec PASS, 마지막 `grep` 이 PR-1b 의 연결 한 줄을 보여 준다(없으면 PR-1b 가 덜 머지된 것이다 — 멈춘다). CI: `league-slot-registration-release.integration-spec.ts` 5건 PASS.

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(league): 참가팀 제외 시 시작 전 자리 경기는 취소 대신 자리 비우기" -- apps/v1_api/src/league-matches/league-match-admin.service.ts apps/v1_api/src/league-matches/league-match-admin.service.spec.ts apps/v1_api/test/league-matches/league-slot-registration-release.integration-spec.ts
git show --stat HEAD
```

### Task 12: 공개 게이트 ① 리그 자기 페이지 — 일정·순위 (+ 5종 대조군 스펙 뼈대)

이 Task 부터 Task 15 까지가 스펙 S6 의 "공개 경로 전부"다. 경로마다 코드를 고치는 Task 를 따로 두되, **하나의 스펙 파일**(`league-unfilled-gate.integration-spec.ts`)이 같은 5종 fixture 를 모든 경로에 대고 읽는다. 좁히는 변경의 실패 모드는 "덜 돌려주는 것"이라 대조군이 하나면 테스트가 구조적으로 통과한다 — 그래서 가려야 하는 셋과 **그대로 포함돼야 하는 둘**을 같이 둔다.

| 이름 | 홈 자리 | 원정 자리 | 홈 팀 | 원정 팀 | 공개 |
|---|---|---|---|---|---|
| (a) 빈 경기 | s1 | s2 | — | — | 가림 |
| (b) 홈만 찬 경기 | s3 | s4 | A | — | 가림 |
| (c) 원정만 찬 경기 | s5 | s6 | — | B | 가림 |
| (d) 다 찬 경기 | s7 | s8 | C | D | **포함** |
| (e) 자리 없는 기존 경기 | — | — | E | — (원정 null) | **포함** |

경기일은 (a)<(b)<(c)<(d)<(e) 순으로 하루씩 벌려, **(d)의 주차 라벨이 4주차**로 나오면 주차 집합이 게이트와 무관한 비삭제 전체라는 증거가 된다(게이트가 주차 집합까지 걸렀다면 (d)는 1주차가 된다).

**Files:**
- Modify: `apps/v1_api/src/league-matches/league-fixture-list-source.ts` — `publicLeagueFixtureListWhere` 추가
- Modify: `apps/v1_api/src/league-matches/league-match-public.service.ts` 의 `detail`·`standings`
- Test: `apps/v1_api/test/league-matches/league-unfilled-gate.integration-spec.ts`

**Interfaces:**
- Consumes: `excludeUnfilledSlotFixturesWhere()`(Task 1).
- Produces: `publicLeagueFixtureListWhere(leagueId: string): Prisma.V1TeamMatchWhereInput` — `leagueFixtureListWhere` 와 같은 술어 + 게이트. **공개 소비처만** 쓴다(운영 콘솔 `tournament-operations-board.service.ts`·징계 경기 순서 `discipline/team-game-order.ts` 는 계속 `leagueFixtureListWhere` — 운영자·팀 내부 경로이고, 팀 내부 경기 순서는 반쪽 경기까지 세야 맞다).

- [ ] **Step 1: 스펙 뼈대와 첫 경로 케이스를 쓴다**

`apps/v1_api/test/league-matches/league-unfilled-gate.integration-spec.ts`:

```ts
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import {
  excludeUnfilledSlotFixturesSql,
  excludeUnfilledSlotFixturesWhere,
} from '../../src/common/competition/unfilled-slot-gate';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

/**
 * 정규 리그 빈 경기 공개 게이트 — 5종 fixture × 공개 경로 전부 (스펙 S6).
 * 가려야 하는 (a)(b)(c) 와 그대로 보여야 하는 (d)(e) 를 **같은 응답에서** 함께 단언한다.
 */
describe('정규 리그 빈 경기 공개 게이트', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let leagueId: string;
  let ids: { empty: string; homeOnly: string; awayOnly: string; filled: string; legacy: string };
  let gated: string[];
  let visible: string[];
  const teams: Record<'A' | 'B' | 'C' | 'D' | 'E', { id: string; name: string }> = {} as never;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lsug');
    for (const key of ['A', 'B', 'C', 'D', 'E'] as const) teams[key] = await h.makeTeam(`lsug-${key}`);
    // 공개 상세는 draft 를 숨기므로 진행 중 리그로 만든다.
    leagueId = await h.makeLeague({ teams: Object.values(teams), state: 'active' });
    const slots = await h.makeSlots(leagueId, 8);
    const day = (offset: number) => new Date(Date.now() + (10 + offset) * 86_400_000);
    ids = {
      empty: await h.createFixture(leagueId, { homeSlotId: slots[0].id, awaySlotId: slots[1].id, startAt: day(0) }),
      homeOnly: await h.createFixture(leagueId, { homeTeamId: teams.A.id, homeSlotId: slots[2].id, awaySlotId: slots[3].id, startAt: day(1) }),
      awayOnly: await h.createFixture(leagueId, { awayTeamId: teams.B.id, homeSlotId: slots[4].id, awaySlotId: slots[5].id, startAt: day(2) }),
      filled: await h.createFixture(leagueId, { homeTeamId: teams.C.id, awayTeamId: teams.D.id, homeSlotId: slots[6].id, awaySlotId: slots[7].id, startAt: day(3) }),
      legacy: await h.createFixture(leagueId, { homeTeamId: teams.E.id, startAt: day(4) }),
    };
    gated = [ids.empty, ids.homeOnly, ids.awayOnly];
    visible = [ids.filled, ids.legacy];
  });
  afterAll(async () => cleanup?.());

  const sorted = (values: string[]) => [...values].sort();

  it('술어 parity: Prisma where 와 raw SQL 조각이 같은 경기 집합을 낸다', async () => {
    const viaWhere = await h.prisma.v1TeamMatch.findMany({
      where: { leagueId, ...excludeUnfilledSlotFixturesWhere() },
      select: { id: true },
    });
    const viaSql = await h.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT team_match.id FROM v1_team_matches team_match
      WHERE team_match.league_id = ${leagueId} AND ${excludeUnfilledSlotFixturesSql('team_match')}`;
    expect(sorted(viaWhere.map((row) => row.id))).toEqual(sorted(visible));
    expect(sorted(viaSql.map((row) => row.id))).toEqual(sorted(visible));
  });

  describe('리그 자기 페이지', () => {
    it('GET /league-matches/:id — 일정에서 빈·반쪽 경기는 빠지고 다 찬 경기와 자리 없는 기존 경기는 그대로다', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}`);
      expect(res.status).toBe(200);
      const fixtureIds: string[] = res.body.data.fixtures.map((fixture: { teamMatchId: string }) => fixture.teamMatchId);
      expect(sorted(fixtureIds)).toEqual(sorted(visible));
    });

    it('GET /league-matches/:id/standings — 미확정 경기 목록도 같은 기준이고 500 으로 깨지지 않는다', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}/standings`);
      expect(res.status).toBe(200);
      const pending: string[] = res.body.data.pendingFixtures.map((fixture: { teamMatchId: string }) => fixture.teamMatchId);
      expect(sorted(pending)).toEqual(sorted(visible));
    });
  });
});
```

- [ ] **Step 2: 실행해 실패를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-unfilled-gate"
```
Expected: `0`(타입 오류 없음). CI: parity 케이스는 PASS(Task 1 의 헬퍼만 쓴다), 리그 자기 페이지 두 케이스는 `500 LEAGUE_FIXTURE_INCOMPLETE`(host null 불변식)로 FAIL.

- [ ] **Step 3: 구현한다**

`league-fixture-list-source.ts` 의 `leagueFixtureListWhere` 바로 아래에 추가한다(파일 상단에 `import type { Prisma } from '@prisma/client';`·`import { excludeUnfilledSlotFixturesWhere } from '../common/competition/unfilled-slot-gate';` 를 더한다 — 첫 줄은 이미 `import type { V1GameState, V1VisibilityMode } from '@prisma/client';` 이므로 그 목록에 `Prisma` 를 끼운다):

```ts
/**
 * **공개 화면용** 대진 술어 — `leagueFixtureListWhere` + "자리에 연결됐는데 팀이 빈 경기 제외"(S6 게이트).
 * 공개 일정·순위·통합 상세·기록 일정은 이것을 쓴다. 운영 콘솔·징계 경기 순서는 빈 경기까지 봐야 하므로
 * 게이트 없는 `leagueFixtureListWhere` 를 그대로 쓴다.
 */
export function publicLeagueFixtureListWhere(leagueId: string): Prisma.V1TeamMatchWhereInput {
  return { ...leagueFixtureListWhere(leagueId), ...excludeUnfilledSlotFixturesWhere() };
}
```

`league-match-public.service.ts`:
- 상단 import 의 `leagueFixtureListWhere` 를 `publicLeagueFixtureListWhere` 로 바꾸고, `detail()` 의 `where: leagueFixtureListWhere(leagueId)` → `where: publicLeagueFixtureListWhere(leagueId)`.
- `standings()` 의 `where: { leagueId },`(`grep -n "where: { leagueId }" src/league-matches/league-match-public.service.ts` — `standings` 함수 안의 한 건) → `where: { leagueId, ...excludeUnfilledSlotFixturesWhere() },` (상단에 `excludeUnfilledSlotFixturesWhere` import 추가). 이 쿼리는 `deletedAt` 조건이 원래 없으므로 그대로 둔다.
- 순위 계산 입력도 같은 목록이다 — 순위에는 반쪽 경기가 결과를 가질 수 없으므로(결과 입력은 양 팀 확정이 전제, PR-2) 순위 값은 변하지 않는다.

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-fixture-list-source\|league-match-public.service"
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/league-matches/league-fixture-list-source.spec.ts src/league-matches/league-match-public-listmine-read-swap.spec.ts src/league-matches/league-public-list-pagination.spec.ts
```
Expected: `0`, 세 spec PASS(가짜 prisma 의 `findMany` 는 where 를 무시하고 고정 목록을 돌려주므로 영향 없다). CI: `league-unfilled-gate.integration-spec.ts` 3건 PASS.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(league): 공개 리그 일정·순위에서 자리 미배정 경기를 가린다" -- apps/v1_api/src/league-matches/league-fixture-list-source.ts apps/v1_api/src/league-matches/league-match-public.service.ts apps/v1_api/test/league-matches/league-unfilled-gate.integration-spec.ts
git show --stat HEAD
```

### Task 13: 공개 게이트 ② 통합 상세의 리그 경기와 진행률 (`tournaments-read.service.ts`)

`/tournaments/:id`(상세)는 리그 경기를 `leagueCompetitionFixtures` 로, `/tournaments/:id/standings/overall` 은 진행률(`progress`)을 `leagueOverallStandings` 의 같은 대진 집합으로 계산한다. 둘 다 호스트 null 이면 500 이다(`assertLeagueFixtureListInvariant`/`assertLeagueStandingsInvariant`).

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournaments-read.service.ts` (import, `leagueCompetitionFixtures`, `leagueOverallStandings`)
- Test: `apps/v1_api/test/league-matches/league-unfilled-gate.integration-spec.ts` (케이스 추가)

- [ ] **Step 1: 실패하는 케이스를 추가한다**

`describe('리그 자기 페이지', …)` 아래에 붙인다:

```ts
  describe('통합 대회 표면 (/tournaments/:id)', () => {
    it('GET /tournaments/:id — leagueFixtures 에서 가려야 할 셋은 빠지고 둘은 그대로다', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/tournaments/${leagueId}`);
      expect(res.status).toBe(200);
      const fixtureIds: string[] = res.body.data.leagueFixtures.map((fixture: { teamMatchId: string }) => fixture.teamMatchId);
      expect(sorted(fixtureIds)).toEqual(sorted(visible));
    });

    it('GET /tournaments/:id/standings/overall — 진행률 분모는 공개되는 경기만 센다', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/tournaments/${leagueId}/standings/overall`);
      expect(res.status).toBe(200);
      // (d)(e) 둘 다 결과가 없다 — 총 2건 · 치른 0건. 가려진 셋이 분모에 섞이면 5가 된다.
      expect(res.body.data.progress).toMatchObject({ total: visible.length, played: 0, remaining: visible.length });
    });
  });
```

- [ ] **Step 2: 실행해 실패를 확인한다**

CI: 두 케이스 모두 `500`(`LEAGUE_FIXTURE_INCOMPLETE`)로 FAIL.

- [ ] **Step 3: 구현한다**

`tournaments-read.service.ts`:
- 상단 import 의 `leagueFixtureListWhere` 를 `publicLeagueFixtureListWhere` 로 바꾸고 `leagueCompetitionFixtures` 의 `where: leagueFixtureListWhere(leagueId),` → `where: publicLeagueFixtureListWhere(leagueId),`.
- `leagueOverallStandings` 의 `where: { leagueId },`(`grep -n "where: { leagueId }" src/tournaments/tournaments-read.service.ts` 를 돌려 **`leagueOverallStandings` 함수 안의 한 건**만 고른다 — 같은 파일의 다른 `where: { leagueId }` 는 건드리지 않는다) → `where: { leagueId, ...excludeUnfilledSlotFixturesWhere() },` (import 추가: `import { excludeUnfilledSlotFixturesWhere } from '../common/competition/unfilled-slot-gate';`). `progress` 와 순위가 모두 이 `teamMatches` 에서 나오므로 한 줄로 둘 다 걸린다.

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "tournaments-read.service"
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournaments-read.service.spec.ts src/tournaments/tournament-detail.presenter.spec.ts
```
Expected: `0`, 두 spec PASS(없는 파일명이면 `ls src/tournaments | grep read` 로 실제 이름을 찾아 실행). CI: 게이트 스펙 5건 PASS.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(league): 통합 상세의 리그 경기·진행률에서 자리 미배정 경기를 가린다" -- apps/v1_api/src/tournaments/tournaments-read.service.ts apps/v1_api/test/league-matches/league-unfilled-gate.integration-spec.ts
git show --stat HEAD
```

### Task 14: 공개 게이트 ③ 기록 일정·경기 상세 + 주차 집합 분리 (`public-tournament-records.service.ts`)

공개 경기 기록 서비스에는 리그 갈래가 둘 있다: 일정(`leagueSchedule` — `/tournaments/:id/schedule`)과 경기 상세(`getLeagueFixtureRecord` — `/tournaments/:id/matches/:fixtureId`, `/league-matches/:id/fixtures/:fixtureId/record`). 일정은 `leagueWeekNumbers(resolvedTeamMatches)` 로 **표시 목록 자체에서** 주차를 센다(`leagueWeekNumbers`) — 목록에 게이트를 걸면 주차가 줄어 같은 경기가 화면마다 다른 주차가 된다. 그래서 주차 집합을 비삭제 전체로 따로 읽는다. 경기 상세의 주차(`resolveLeagueWeekNumber`)는 이미 `{ leagueId, deletedAt: null, startAt ≤ }` 라 게이트와 무관하다 — 건드리지 않는다.

**Files:**
- Modify: `apps/v1_api/src/games/public-records/public-tournament-records.service.ts` — import, `leagueSchedule`, `getLeagueFixtureRecord`, `leagueWeekNumbers`, 새 private `loadLeagueSiblingStartAts`
- Test: `apps/v1_api/test/league-matches/league-unfilled-gate.integration-spec.ts` (케이스 추가)

**Interfaces:**
- Consumes: `publicLeagueFixtureListWhere`(Task 12), `leagueFixtureListWhere`, `excludeUnfilledSlotFixturesWhere`.
- Produces: `leagueWeekNumbers(siblingStartAts: readonly Date[], fixtures: readonly { startAt: Date }[]): number[]` (모듈 내부 함수의 시그니처 변경).

- [ ] **Step 1: 실패하는 케이스를 추가한다**

게이트 스펙 `describe('통합 대회 표면 …')` 아래에 붙인다:

```ts
  describe('공개 경기 기록', () => {
    it('GET /tournaments/:id/schedule — 가릴 셋은 빠지고 둘은 남으며, 남은 경기의 주차는 가려진 경기를 포함해 센다', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/tournaments/${leagueId}/schedule`);
      expect(res.status).toBe(200);
      const items: Array<{ fixtureId: string; round: string }> = res.body.data.items;
      expect(sorted(items.map((item) => item.fixtureId))).toEqual(sorted(visible));
      // 경기일 순서가 a<b<c<d<e 이므로 d=4주차, e=5주차 — 게이트가 주차 집합까지 걸렀다면 1주차·2주차가 된다.
      expect(items.find((item) => item.fixtureId === ids.filled)?.round).toBe('4주차');
      expect(items.find((item) => item.fixtureId === ids.legacy)?.round).toBe('5주차');
    });

    it('경기 상세: 가릴 셋은 404, 둘은 200 이고 주차는 일정과 같다', async () => {
      for (const fixtureId of gated) {
        expect((await request(app.getHttpServer()).get(`/api/v1/tournaments/${leagueId}/matches/${fixtureId}`)).status).toBe(404);
        expect((await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}/fixtures/${fixtureId}/record`)).status).toBe(404);
      }
      const filled = await request(app.getHttpServer()).get(`/api/v1/tournaments/${leagueId}/matches/${ids.filled}`);
      expect(filled.status).toBe(200);
      expect(filled.body.data.round).toBe('4주차');
      const legacy = await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}/fixtures/${ids.legacy}/record`);
      expect(legacy.status).toBe(200);
      expect(legacy.body.data.round).toBe('5주차');
    });
  });
```

- [ ] **Step 2: 실행해 실패를 확인한다**

CI: `schedule` 케이스가 `500 LEAGUE_FIXTURE_INVALID`, 상세 케이스는 (a)(c) 가 500 / (b) 가 200 으로 FAIL.

- [ ] **Step 3: 구현한다**

`public-tournament-records.service.ts`:
1. 파일 상단 import 의 `leagueFixtureListWhere,` 옆에 `publicLeagueFixtureListWhere,` 를 더하고, 파일 상단에 `import { excludeUnfilledSlotFixturesWhere } from '../../common/competition/unfilled-slot-gate';` 를 더한다.
2. `leagueSchedule`:

```ts
    const teamMatches = await this.prisma.v1TeamMatch.findMany({
      // 술어는 손으로 적지 않는다 — ... (기존 주석 유지)
      where: publicLeagueFixtureListWhere(leagueId),
      orderBy: leagueFixtureListOrder(),
      select: LEAGUE_SCHEDULE_SELECT,
    });
```
그리고 `leagueSchedule` 안의 `const weekNumbers = leagueWeekNumbers(resolvedTeamMatches);` 를 바꾼다:

```ts
    // 주차 집합은 게이트와 무관한 비삭제 전체다 — 가려진 경기의 경기일도 날짜를 센다. 표시 목록에서 세면
    // 같은 경기가 일정 화면과 경기 상세(resolveLeagueWeekNumber)에서 다른 주차가 된다.
    const weekNumbers = leagueWeekNumbers(await this.loadLeagueSiblingStartAts(leagueId), resolvedTeamMatches);
```
3. `leagueWeekNumbers` 를 교체한다:

```ts
function leagueWeekNumbers(siblingStartAts: readonly Date[], fixtures: readonly { startAt: Date }[]): number[] {
  const days = [...new Set(siblingStartAts.map((startAt) => KST_DAY.format(startAt)))].sort();
  const indexByDay = new Map(days.map((day, index) => [day, index + 1]));
  return fixtures.map((fixture) => indexByDay.get(KST_DAY.format(fixture.startAt)) ?? 1);
}
```
(위 doc 주석의 "한 번에 계산한다" 설명은 유지하고 `@param siblingStartAts` 한 줄을 더한다.)
4. 클래스 안, `resolveLeagueWeekNumber` 위에 추가한다:

```ts
  /** 주차 계산의 형제 집합 — 취소·가려진 경기까지 포함한 비삭제 전체(`leagueFixtureListWhere`, 게이트 없음). */
  private async loadLeagueSiblingStartAts(leagueId: string): Promise<Date[]> {
    const rows = await this.prisma.v1TeamMatch.findMany({ where: leagueFixtureListWhere(leagueId), select: { startAt: true } });
    return rows.map((row) => {
      if (row.startAt === null) {
        throw new InternalServerErrorException({
          code: 'LEAGUE_FIXTURE_INVALID',
          message: '리그 경기의 시작 시간이 없습니다.',
          leagueId,
        });
      }
      return row.startAt;
    });
  }
```
5. `getLeagueFixtureRecord` 의 `findFirst`:

```ts
      where: { id: teamMatchId, leagueId, deletedAt: null, ...excludeUnfilledSlotFixturesWhere() },
```
(가려진 경기는 기존 `LEAGUE_FIXTURE_NOT_FOUND` 404 경로를 탄다 — 새 에러 코드를 만들지 않는다.)

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "public-tournament-records.service"
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/games/public-records/public-league-schedule.spec.ts src/games/public-records/public-league-fixture-record.spec.ts src/games/public-records/public-tournament-records.service.regular-league.spec.ts
```
Expected: `0`, 세 spec PASS(가짜 `v1TeamMatch.findMany` 가 호출마다 같은 목록을 돌려주므로 주차 집합 조회가 하나 더 늘어도 동일 결과). CI: 게이트 스펙 7건 PASS.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(league): 공개 기록 일정·경기 상세에서 자리 미배정 경기를 가리고 주차 집합은 전체로 고정" -- apps/v1_api/src/games/public-records/public-tournament-records.service.ts apps/v1_api/test/league-matches/league-unfilled-gate.integration-spec.ts
git show --stat HEAD
```

### Task 15: 공개 게이트 ④ 팀 매치 공개 목록·상세·sitemap 원천·마이 팀매치 전 범위 (`team-matches.service.ts`)

웹 sitemap(`apps/v1_web/src/app/sitemap.ts`)은 `GET /team-matches` 목록을 원천으로 쓰므로 목록 게이트가 곧 sitemap 게이트다. 공개 목록·상세는 `hostTeam: { status: 'active' }` 조건이 이미 호스트 null 을 걸러 빈 경기(a)(c)는 새지 않지만, **홈만 찬 경기(b)는 호스트가 있어 그대로 새고**(원정 자리가 비었는데도) 마이 팀매치는 `assertTeamMatchReadInvariant` 가 호스트 null 에 409 를 던진다. 세 곳에 같은 게이트를 건다.

**Files:**
- Modify: `apps/v1_api/src/team-matches/team-matches.service.ts` — `list`, `getPublicTeamMatch`, `myTeamMatches`, import
- Test: `apps/v1_api/test/league-matches/league-unfilled-gate.integration-spec.ts` (케이스 추가)

- [ ] **Step 1: 실패하는 케이스를 추가한다**

`describe('공개 경기 기록', …)` 아래에 붙인다. 마이 팀매치는 한 사용자가 여러 팀에 속해야 읽히므로 **경기 생성 뒤에** 관리자를 A~E 팀에 멤버로 넣는다(생성 전에 넣으면 명단 자동 채우기와 겹친다):

```ts
  describe('팀 매치 표면', () => {
    const itemIds = (res: request.Response) => res.body.data.items.map((item: { teamMatchId: string }) => item.teamMatchId) as string[];
    const only = (all: string[]) => all.filter((id) => Object.values(ids).includes(id));

    it('GET /team-matches (sitemap 원천) — 홈만 찬 경기가 새지 않고 다 찬 경기·자리 없는 기존 경기는 남는다', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/team-matches').query({ kind: 'competition', limit: 50 });
      expect(res.status).toBe(200);
      expect(sorted(only(itemIds(res)))).toEqual(sorted(visible));
    });

    it('GET /team-matches/:id — 가릴 셋은 404, 둘은 200', async () => {
      for (const id of gated) {
        expect((await request(app.getHttpServer()).get(`/api/v1/team-matches/${id}`)).status).toBe(404);
      }
      for (const id of visible) {
        expect((await request(app.getHttpServer()).get(`/api/v1/team-matches/${id}`)).status).toBe(200);
      }
    });

    it('GET /me/team-matches — created·hosted·applied·all 어느 범위에서도 409 없이 공개되는 경기만 나온다', async () => {
      for (const team of Object.values(teams)) await h.joinTeam(h.adminUserId, team.id);
      for (const scope of ['created', 'hosted', 'applied', 'all'] as const) {
        const res = await request(app.getHttpServer())
          .get('/api/v1/me/team-matches')
          .set('x-v1-user-id', h.adminUserId)
          .query({ scope, limit: 50 });
        expect(res.status).toBe(200);
        const found = only(itemIds(res));
        // created 는 관리자가 만든 다섯 건이 후보다. hosted/applied 는 소속 팀이 호스트/원정인 경기.
        for (const id of gated) expect(found).not.toContain(id);
        if (scope === 'created' || scope === 'all') expect(sorted(found)).toEqual(expect.arrayContaining(sorted(visible)));
        if (scope === 'hosted') expect(found).toContain(ids.legacy); // E 가 호스트
        if (scope === 'applied') expect(found).toContain(ids.filled); // D 가 승인된 원정
      }
    });
  });
```

- [ ] **Step 2: 실행해 실패를 확인한다**

CI: 목록에서 (b) `homeOnly` 가 남아 FAIL, 상세에서 (b) 가 200 으로 FAIL, 마이 팀매치는 `409`(`assertTeamMatchReadInvariant`)로 FAIL.

- [ ] **Step 3: 구현한다**

`team-matches.service.ts` 상단에 `import { excludeUnfilledSlotFixturesWhere } from '../common/competition/unfilled-slot-gate';` 를 더하고 세 쿼리의 `AND` 배열에 한 항목씩 넣는다.

- `list`: `AND: [ { OR: [{ leagueId: null }, { league: { is: { isPublic: true } } }] }, ...` 의 첫 항목 바로 뒤에 `excludeUnfilledSlotFixturesWhere(),` 를 추가한다.
- `getPublicTeamMatch`: `AND: [{ OR: [{ leagueId: null }, { league: { is: { isPublic: true } } }] }, { OR: [{ hostTeam: ... }] }]` 의 배열 끝에 `excludeUnfilledSlotFixturesWhere()` 를 추가한다. (이 헬퍼는 신청 가능 여부·신청 생성도 부르지만 리그 경기는 거기서 이미 막혀 영향이 없다.)
- `myTeamMatches`: `AND: [ { OR: [{ tournamentId: null }, { leagueId: { not: null } }] }, { OR: [{ leagueId: null }, { league: ... }] } ]` 에 `excludeUnfilledSlotFixturesWhere()` 를 추가한다. 최상위 `OR`(created/hosted/applied)은 건드리지 않으므로 네 범위 모두에 걸린다.

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "team-matches.service"
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/team-matches
```
Expected: `0`, `src/team-matches` 아래 spec 전부 PASS(Prisma 목이 where 를 비교하는 케이스가 있으면 `AND` 배열 길이 단언을 새 항목에 맞춘다). CI: 게이트 스펙 10건 PASS.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(league): 팀 매치 공개 목록·상세·마이 팀매치에서 자리 미배정 경기를 가린다" -- apps/v1_api/src/team-matches/team-matches.service.ts apps/v1_api/test/league-matches/league-unfilled-gate.integration-spec.ts
git show --stat HEAD
```

### Task 16: 결과 입력 리마인더는 팀이 빈 경기를 건너뛴다

리그 결과 미입력 리마인더(`league-result-entry-reminder.service.ts`)는 경기 **생성 때** 예약된다(`createLeagueFixture` ⑤). 템플릿의 빈 경기도 예약되므로, 발화 시점에 팀이 비어 있으면 "결과가 입력되지 않았어요" 알림이 가면 안 된다 — 입력할 결과 자체가 없다. 판정은 Task 1 의 **같은 SQL 술어**를 쓴다(조회 `WHERE` 에 걸어 행을 못 찾으면 기존 `fixture === null → return` 이 처리한다).

**Files:**
- Modify: `apps/v1_api/src/jobs/league-reminders/league-result-entry-reminder.service.ts` 의 `lockFixture`, import
- Test: `apps/v1_api/test/jobs/league-result-entry-reminder.integration-spec.ts` (`seedFixture` 확장 + 케이스 3건)

- [ ] **Step 1: 실패하는 케이스를 추가한다**

(a) `seedFixture` 의 `opts` 에 자리 연결을 더한다:

```ts
async function seedFixture(
  opts: {
    officialResult?: boolean;
    status?: 'matched' | 'cancelled';
    /** 자리 연결 경기 — 어느 사이드에 팀이 찼는지. 주지 않으면 기존처럼 양 팀이 찬 자리 없는 대진이다. */
    slots?: { homeFilled: boolean; awayFilled: boolean };
  } = {},
) {
```
`teamMatch` 를 만들기 직전(`const startAt = new Date();` 뒤)에 자리를 만들고, 생성 data 를 바꾼다:

```ts
  const slotRows = opts.slots
    ? await Promise.all(
        [1, 2].map((position) => prisma.v1TournamentSlot.create({ data: { tournamentId: league.id, kind: 'ENTRY', position } })),
      )
    : null;
```
```ts
      hostTeamId: opts.slots && !opts.slots.homeFilled ? null : homeTeam.id,
```
```ts
      approvedApplicantTeamId: opts.slots && !opts.slots.awayFilled ? null : awayTeam.id,
      ...(slotRows ? { homeSlotId: slotRows[0].id, awaySlotId: slotRows[1].id } : {}),
```
(두 번의 Edit: ① old_string `hostTeamId: homeTeam.id,` → 첫 블록. ② old_string `approvedApplicantTeamId: awayTeam.id,` → 둘째 블록 — 스프레드 줄은 `teamMatch.create` 의 `data` 객체 안, `approvedApplicantTeamId` 줄 바로 뒤에 들어간다. 정리 함수는 팀매치 삭제 뒤 리그를 지우면 자리가 cascade 로 사라지므로 변경 없다.)

(b) `describe` 안, 취소 케이스 뒤에 추가한다:

```ts
  it.each([
    { name: '양쪽 모두 빈 경기', slots: { homeFilled: false, awayFilled: false } },
    { name: '홈만 찬 반쪽 경기', slots: { homeFilled: true, awayFilled: false } },
    { name: '원정만 찬 반쪽 경기', slots: { homeFilled: false, awayFilled: true } },
  ])('자리 연결 $name 은 24시간이 지나도 알리지 않는다 — 입력할 결과가 없다', async ({ slots }) => {
    const service = new LeagueResultEntryReminderService();
    const ctx = await seedFixture({ slots });
    try {
      await prisma.$transaction(async (tx) => {
        await service.handler({ payload: { teamMatchId: ctx.teamMatchId, expectedStartAt: ctx.startAt.toISOString() } } as never, tx);
      });
      // 받을 사람(활성 ops creator)이 있는데도 0건이어야 "받을 사람이 없어서"가 아니라 게이트가 막은 것이다.
      expect(await recipientsFor(ctx.teamMatchId)).toHaveLength(0);
    } finally {
      await cleanupFixture(ctx);
    }
  });

  it('대조군: 자리 연결 경기라도 양 팀이 다 찼으면 지금처럼 알린다', async () => {
    const service = new LeagueResultEntryReminderService();
    const ctx = await seedFixture({ slots: { homeFilled: true, awayFilled: true } });
    try {
      await prisma.$transaction(async (tx) => {
        await service.handler({ payload: { teamMatchId: ctx.teamMatchId, expectedStartAt: ctx.startAt.toISOString() } } as never, tx);
      });
      expect(await recipientsFor(ctx.teamMatchId)).toEqual([ctx.creatorAdminUserId]);
    } finally {
      await cleanupFixture(ctx);
    }
  });
```

- [ ] **Step 2: 실행해 실패를 확인한다**

CI: `it.each` 세 건이 `recipientsFor` 길이 1로 FAIL(빈 경기도 알림이 나간다).

- [ ] **Step 3: 구현한다**

`league-result-entry-reminder.service.ts` 의 import 를 바꾸고 `lockFixture` 의 `WHERE` 에 술어를 건다:

```ts
import { excludeUnfilledSlotFixturesSql } from '../../common/competition/unfilled-slot-gate';
```
```ts
      WHERE team_match.id = ${teamMatchId}
        AND ${excludeUnfilledSlotFixturesSql('team_match')}
      FOR UPDATE OF team_match
```
`handler` 의 `if (fixture === null) return;` 위에 한 줄 주석을 단다: `// 자리에 연결됐는데 팀이 빈 경기도 여기서 null 이 된다 — 입력할 결과가 없으니 알리지 않는다.`

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-result-entry-reminder"
```
Expected: `0`. CI: `league-result-entry-reminder.integration-spec.ts` 기존 4건 + 신규 4건 PASS.

- [ ] **Step 5: 커밋**

```bash
git commit -m "fix(league): 팀이 빈 자리 경기는 결과 입력 리마인더를 보내지 않는다" -- apps/v1_api/src/jobs/league-reminders/league-result-entry-reminder.service.ts apps/v1_api/test/jobs/league-result-entry-reminder.integration-spec.ts
git show --stat HEAD
```

### Task 17: 어드민 리그 영상 목록이 호스트 null 을 허용

`listLeagueVideos`(`league-fixture-videos.service.ts` 의 `listLeagueVideos`)는 운영자 화면인데 홈 팀이 null 이면 409 `LEAGUE_FIXTURE_INCOMPLETE` 를 던진다 — 빈 경기가 하나라도 있으면 리그 영상 관리 화면 전체가 열리지 않는다. 운영자는 빈 경기도 봐야 하므로 팀 이름을 null 로 직렬화한다. 시작 시각 null 은 여전히 불변식 위반이라 그대로 던진다. 주차 집합(`days`)은 원래 비삭제 전체라 그대로다.

**Files:**
- Modify: `apps/v1_api/src/league-matches/league-fixture-videos.service.ts` (`listLeagueVideos`)
- Test: `apps/v1_api/test/league-matches/league-slot-admin-view.integration-spec.ts` (이 파일은 Task 18 가 이어서 채운다 — 여기서 만든다)

- [ ] **Step 1: 실패하는 통합 스펙을 쓴다**

`apps/v1_api/test/league-matches/league-slot-admin-view.integration-spec.ts`:

```ts
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

describe('어드민 리그 화면 — 빈 경기 허용', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lsav');
  });
  afterAll(async () => cleanup?.());

  it('GET /admin/league-matches/:id/videos — 빈 경기가 있어도 200 이고 팀 이름은 null 이다', async () => {
    const teamA = await h.makeTeam('lsav-a');
    const leagueId = await h.makeLeague({ teams: [teamA] });
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    const empty = await h.createFixture(leagueId, { homeSlotId: s1.id, awaySlotId: s2.id });
    const half = await h.createFixture(leagueId, { homeTeamId: teamA.id, homeSlotId: s1.id, awaySlotId: s2.id });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/league-matches/${leagueId}/videos`)
      .set('x-v1-user-id', h.adminUserId);

    expect(res.status).toBe(200);
    const byId = new Map<string, { homeTeamName: string | null; awayTeamName: string | null }>(
      res.body.data.items.map((item: { fixtureId: string; homeTeamName: string | null; awayTeamName: string | null }) => [item.fixtureId, item]),
    );
    expect(byId.get(empty)).toMatchObject({ homeTeamName: null, awayTeamName: null });
    expect(byId.get(half)).toMatchObject({ homeTeamName: teamA.name, awayTeamName: null });
  });
});
```

- [ ] **Step 2: 실행해 실패를 확인한다**

CI: `409 LEAGUE_FIXTURE_INCOMPLETE` 로 FAIL.

- [ ] **Step 3: 구현한다**

`league-fixture-videos.service.ts` 의 `validFixtures` 변환과 직렬화를 바꾼다:

```ts
    const validFixtures = fixtures.map((fixture) => {
      if (fixture.startAt === null) {
        throw new ConflictException({ code: 'LEAGUE_FIXTURE_INCOMPLETE', message: '리그 대진의 일정 정보가 없어 영상을 표시할 수 없어요.' });
      }
      return { ...fixture, startAt: fixture.startAt };
    });
```
```ts
          homeTeamName: fixture.hostTeam?.name ?? null,
          awayTeamName: fixture.approvedApplicantTeam?.name ?? null,
```
(`hostTeam` 구조분해 변수와 `hostTeam === null` 검사를 지운다. 응답 타입이 `homeTeamName: string` 에서 `string | null` 로 넓어지는 것은 PR-5b 가 웹 타입을 맞춘다 — `docs/api/domains/league-matches.md` 에 Task 19 이 적는다.)

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-fixture-videos.service"
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/league-matches/league-fixture-videos.service.spec.ts
```
Expected: `0`, spec PASS(기존 케이스의 `hostTeam` 은 항상 있으므로 영향 없다 — 호스트 null 이 409 였다는 옛 단언이 있으면 새 계약(null 이름)으로 **뒤집는다**). CI: 신규 1건 PASS.

- [ ] **Step 5: 커밋**

```bash
git commit -m "fix(league): 어드민 리그 영상 목록이 팀 미정 경기를 막지 않는다" -- apps/v1_api/src/league-matches/league-fixture-videos.service.ts apps/v1_api/src/league-matches/league-fixture-videos.service.spec.ts apps/v1_api/test/league-matches/league-slot-admin-view.integration-spec.ts
git show --stat HEAD
```

### Task 18: 어드민 리그 응답 — 자리·경기 `game`·팀 id nullable·참가팀 `registrationId`

그림 편집기(PR-5b)가 읽을 계약이다(색인 "응답 확장"): `GET /admin/league-matches/:leagueId` 의 경기마다 `homeSlotId`·`awaySlotId`·`game`, 최상위 `slots[]`, 그리고 `GET .../teams`·상세의 참가팀 항목에 자리 배정 PUT 이 받는 `registrationId`. `homeTeamId`/`awayTeamId` 는 이미 `fixture.hostTeamId`/`approvedApplicantTeamId` 를 그대로 내려 null 을 허용한다 — 타입이 `string | null` 임을 문서에 명시하는 것이 변경이다.

직렬화는 **PR-1a 의 `serializeAdminBracketSlot`/`serializeAdminBracketGame`(`apps/v1_api/src/tournaments/slots/admin-bracket-view.ts`)을 그대로 import** 한다 — 색인 보충 계약상 리그 전용 직렬화 파일을 따로 만들지 않는다(두 벌 금지). 입력 모양만 맞춘다: 자리는 `adminBracketSlotInclude` 로 조회(리그 자리는 `group`·`sourceGroup` 이 null 이라 `tournamentSlotLabel` 이 "N번 자리"를 낸다), 게임은 `{ id, state, version, _count: { events }, resultRevisions[0]: { id, state, score, reason, supersedesId } }` 를 select 한다. 이 모양의 단위 테스트는 PR-1a 의 `admin-bracket-view.spec.ts` 가 이미 갖고 있으므로 이 Task 는 **연결을 고정하는 통합 케이스만** 더한다.

**Files:**
- Modify: `apps/v1_api/src/league-matches/league-match-admin.service.ts` — `loadLeague` 의 `registrations` select, `detail()`, `listTeams()` (심볼 기준으로 찾는다: `grep -n "private async loadLeague\|async detail(\|async listTeams(" src/league-matches/league-match-admin.service.ts`)
- Test: `apps/v1_api/test/league-matches/league-slot-admin-view.integration-spec.ts` (케이스 추가)

**Interfaces:**
- Consumes (PR-1a, `tournaments/slots/admin-bracket-view.ts`): `adminBracketSlotInclude`, `serializeAdminBracketSlot(row: AdminBracketSlotRow): AdminBracketSlot`, `serializeAdminBracketGame(game: AdminBracketGameInput): AdminBracketGame`. 시그니처가 다르면 PR-1a 계획의 어드민 대진 응답 확장 Task(`grep -n "export function serializeAdminBracket" docs/superpowers/plans/*pr1a*`)를 먼저 읽고 호출부 입력만 맞춘다 — PR-1a 파일은 이 PR 에서 고치지 않는다.
- Produces: `GET /admin/league-matches/:leagueId` 응답에 `slots: AdminBracketSlot[]` 와 경기마다 `homeSlotId`·`awaySlotId`·`game: AdminBracketGame | null`, `GET .../teams` 항목에 `registrationId`. 새 export 는 없다.

- [ ] **Step 1: 실패하는 통합 케이스를 추가한다**

`league-slot-admin-view.integration-spec.ts` 의 `describe` 안에 붙인다:

```ts
  it('GET /admin/league-matches/:id — 경기마다 자리 id·game, 최상위 slots[], 참가팀 registrationId 를 싣는다', async () => {
    const teamA = await h.makeTeam('lsav-b');
    const teamB = await h.makeTeam('lsav-c');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    const regA = await h.registrationId(leagueId, teamA.id);
    await h.prisma.v1TournamentSlot.update({ where: { id: s1.id }, data: { registrationId: regA } });
    const teamMatchId = await h.createFixture(leagueId, { homeTeamId: teamA.id, homeSlotId: s1.id, awaySlotId: s2.id });
    const game = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const draft = await h.prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id, revision: 1, state: 'DRAFT', score: { home: 2, away: 1 }, eventsHash: 'lsav-hash',
        createdByActorType: 'SYSTEM', createdBySystemActor: 'T_LSAV',
      },
    });

    const res = await request(app.getHttpServer()).get(`/api/v1/admin/league-matches/${leagueId}`).set('x-v1-user-id', h.adminUserId);

    expect(res.status).toBe(200);
    expect(res.body.data.slots).toEqual([
      expect.objectContaining({ id: s1.id, label: '1번 자리', registrationId: regA, teamName: teamA.name, kind: 'ENTRY' }),
      expect.objectContaining({ id: s2.id, label: '2번 자리', registrationId: null, teamName: null }),
    ]);
    const fixture = res.body.data.fixtures.find((row: { teamMatchId: string }) => row.teamMatchId === teamMatchId);
    expect(fixture).toMatchObject({
      homeTeamId: teamA.id,
      awayTeamId: null,
      homeSlotId: s1.id,
      awaySlotId: s2.id,
      game: {
        id: game.id,
        state: 'SCHEDULED',
        hasLiveRecords: false,
        latestRevision: { id: draft.id, state: 'DRAFT', score: { home: 2, away: 1 }, entryMethod: 'console' },
      },
    });
  });

  it('GET /admin/league-matches/:id/teams — 참가팀마다 자리 배정에 쓰는 registrationId 를 싣는다', async () => {
    const teamA = await h.makeTeam('lsav-d');
    const teamB = await h.makeTeam('lsav-e');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });

    const res = await request(app.getHttpServer()).get(`/api/v1/admin/league-matches/${leagueId}/teams`).set('x-v1-user-id', h.adminUserId);

    expect(res.status).toBe(200);
    const byTeam = new Map<string, string>(res.body.data.teams.map((row: { teamId: string; registrationId: string }) => [row.teamId, row.registrationId]));
    expect(byTeam.get(teamA.id)).toBe(await h.registrationId(leagueId, teamA.id));
    expect(byTeam.get(teamB.id)).toBe(await h.registrationId(leagueId, teamB.id));
  });
```

- [ ] **Step 2: 실행해 실패를 확인한다**

CI: `league-slot-admin-view.integration-spec.ts` 의 새 두 케이스가 `slots` 미정의·`registrationId` 미정의로 FAIL. 로컬(DB 없음)은 Step 3 뒤 `tsc` 로 연결부 타입만 확인한다.

- [ ] **Step 3: 서비스에 연결한다**

`league-match-admin.service.ts`:
1. import: `import { adminBracketSlotInclude, serializeAdminBracketGame, serializeAdminBracketSlot } from '../tournaments/slots/admin-bracket-view';`
2. `loadLeague` 의 `registrations` select(`grep -n "로스터 = confirmed 등록"` 로 찾는다)를 `select: { id: true, teamId: true },` 로 바꾼다(주석 "로스터 = confirmed 등록" 유지).
3. `detail()`:
   - 경기 `select` 에 `homeSlotId: true, awaySlotId: true,` 를 더하고, `game` select 를 확장한다:
     ```ts
         game: {
           select: {
             id: true,
             state: true,
             version: true,
             currentOfficialRevisionId: true,
             _count: { select: { events: true } },
             resultRevisions: {
               select: { id: true, state: true, score: true, reason: true, supersedesId: true },
               orderBy: { revision: 'desc' },
               take: 1,
             },
           },
         },
     ```
     (기존 `resultRevisions: { select: { state: true }, orderBy..., take: 1 }` 를 이것으로 대체한다 — `resolveResultStage` 는 `state` 만 읽으므로 호환된다. 기존 "진행 중 여부"·"최신 1건만 take:1" 주석은 유지한다.)
   - `recentVenues` 계산 아래에 자리 조회를 더한다:
     ```ts
         const slotRows = await this.prisma.v1TournamentSlot.findMany({
           where: { tournamentId: leagueId },
           orderBy: [{ position: 'asc' }],
           include: adminBracketSlotInclude,
         });
     ```
   - 응답에 `slots: slotRows.map(serializeAdminBracketSlot),` 를 `fixtures` 앞에 더하고, 경기 매핑에 `homeSlotId: fixture.homeSlotId, awaySlotId: fixture.awaySlotId, game: fixture.game === null ? null : serializeAdminBracketGame(fixture.game),` 를 더한다(`homeTeamId`·`awayTeamId` 는 이미 nullable 값 그대로다).
4. `listTeams()`: 참가팀 배열을 `league.teams`(등록) 기준으로 돌려 `registrationId` 를 싣는다:
   ```ts
       const teams = await this.prisma.v1Team.findMany({
         where: { id: { in: league.teams.map((entry) => entry.teamId) } },
         select: { id: true, name: true, status: true, memberCount: true, profile: { select: { logoUrl: true } } },
       });
       const teamById = new Map(teams.map((team) => [team.id, team]));
       return {
         leagueId: league.id,
         teams: league.teams.map((entry) => {
           const team = teamById.get(entry.teamId);
           return {
             teamId: entry.teamId,
             registrationId: entry.id,
             // 팀이 그 사이 소프트삭제됐으면 findMany 결과에 없다 — 운영자에게 원인을 숨기지 않는다.
             name: team?.name ?? '(삭제된 팀)',
             status: team?.status ?? null,
             memberCount: team?.memberCount ?? 0,
             logoUrl: team?.profile?.logoUrl ?? null,
           };
         }),
       };
   ```
   (`teamIds.length === 0` 삼항은 `in: []` 이 빈 결과를 내므로 필요 없다 — 지우되 기존 동작과 같다.)

- [ ] **Step 4: 실행해 통과를 확인한다**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "league-match-admin.service"
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/league-matches/league-match-admin.service.spec.ts
```
Expected: `0`, spec PASS(기존 spec 의 `loadLeague` 가짜 응답 `registrations: [{ teamId }]` 에 `id` 가 없어도 `listTeams` 를 부르지 않으면 영향 없다 — 불러 깨지면 가짜 행에 `id: 'registration-<teamId>'` 를 **추가**한다). CI: `league-slot-admin-view.integration-spec.ts` 3건 PASS.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(league): 어드민 리그 응답에 자리·game·registrationId 추가" -- apps/v1_api/src/league-matches/league-match-admin.service.ts apps/v1_api/src/league-matches/league-match-admin.service.spec.ts apps/v1_api/test/league-matches/league-slot-admin-view.integration-spec.ts
git show --stat HEAD
```

### Task 19: API 문서 · changeset · 마감 확인

**Files:**
- Modify: `docs/api/domains/league-matches.md` — "Read and manage fixtures" 절 뒤에 새 절
- Create: `.changeset/league-slot-template-backend.md`

- [ ] **Step 1: 문서를 쓴다**

`docs/api/domains/league-matches.md` 의 `## Read and manage fixtures` 절 끝(마지막 불릿 `The admin screen disables the team's remove button and the regenerate button on the same condition.` 뒤)에 새 절을 붙인다:

```markdown
## Template skeleton and slots (자리 기반 대진)

A league can be drawn first and filled with teams later. A **slot** (`V1TournamentSlot`, `kind=ENTRY`,
`groupId=null`) is a seat a team will take; a fixture points at its two seats with `homeSlotId` /
`awaySlotId`.

- `POST /api/v1/admin/league-matches/:leagueId/fixtures/template`
  (`{ teamCount: 3..20, legs: 1|2, schedule: { dates: string[], time: string }, placeName?, replaceExisting? }`)
  creates `teamCount` slots and the round-robin fixtures between them in one transaction (response
  `{ slots, fixtures }`). `schedule` is required: one date per round (`LEAGUE_SCHEDULE_SLOTS_INSUFFICIENT`
  / `LEAGUE_SCHEDULE_DATE_PAST` / `LEAGUE_SCHEDULE_DATE_INVALID` as in bulk generation). `placeName`
  defaults to `장소 미정`. More than 240 fixtures returns `422 BRACKET_TEMPLATE_TOO_LARGE`. The league
  `status` is **not** changed.
  - Locks the league row (`FOR UPDATE`) and applies the same guard as bulk generation (`409 LEAGUE_ON_HOLD`).
    A league that already has any fixture (cancelled ones included) returns `409 LEAGUE_FIXTURES_EXIST`, so
    a concurrent bulk generation and a template cannot both succeed.
  - `replaceExisting: true` cancels the existing non-cancelled fixtures (never deletes — games are
    `Restrict`-linked), releases their slot links, deletes the old slots and builds the new ones. Allowed
    only when **every** non-cancelled fixture is unstarted and has no result revision; otherwise
    `409 BRACKET_LOCKED` and nothing changes.
  - Support admins get `403`.
- An empty fixture has `hostTeamId = approvedApplicantTeamId = null`, `status = matched`, side names
  `홈 팀 미정` / `어웨이 팀 미정`, and no team schedules, participants or application.
- `PUT /api/v1/admin/tournament-slots/:slotId/assignment` (shared with tournaments, see
  `docs/api/domains/tournaments.md`) fills or empties a slot and updates every fixture that uses it
  ("uses" = `deletedAt IS NULL AND status <> 'cancelled'`). League specifics: **team schedules are created
  only when both sides are filled** (both are cancelled again if one side is emptied); the away side's
  approved application is upserted on `(teamMatchId, applicantTeamId)` and the previous team's row becomes
  `withdrawn`. When no slot-linked fixture has an empty side any more, a `draft`/`open`/`closed` league moves to the
  same in-progress state as bulk generation (`on_hold` / `completed` are never touched; it never moves back).
- Removing a team (`DELETE .../teams/:teamId`) or cancelling its registration releases its slots instead of
  cancelling the fixtures **when every fixture using the slot is unstarted**; if one has started the slot is
  kept. Fixtures without slots are cancelled exactly as before.
- `POST .../fixtures/regenerate` returns `409 LEAGUE_SLOT_FIXTURES_USE_TEMPLATE` for a league that has slots
  — use the template with `replaceExisting` instead.
- `POST .../fixtures/:teamMatchId/cancel` works for empty fixtures (no team notification) and clears the
  fixture's slot links. Cancelling the last empty fixture can promote the league (see above).

### Public visibility of unfilled fixtures

A fixture linked to a slot whose side has no team (`homeSlotId ≠ null ∧ hostTeamId = null`, or
`awaySlotId ≠ null ∧ approvedApplicantTeamId = null` — a half-filled fixture included) is **excluded** from:
`GET /league-matches/:id` and `/standings` (fixtures, pending fixtures), `GET /tournaments/:id` (`leagueFixtures`),
`GET /tournaments/:id/standings/overall` (progress), `GET /tournaments/:id/schedule`,
`GET /tournaments/:id/matches/:fixtureId` and `GET /league-matches/:id/fixtures/:fixtureId/record` (404),
`GET /team-matches` (also the web sitemap source) and `/team-matches/:id` (404), and every scope of
`GET /me/team-matches`. Fixtures without slots are unaffected, even when `approvedApplicantTeamId` is null.
The week label ("N주차") is always counted over all non-deleted fixtures of the league, gated or not.
The result-entry reminder skips such fixtures as well.

### Admin response additions

- `GET /admin/league-matches/:leagueId`: each fixture carries `homeSlotId`, `awaySlotId` and
  `game: { id, state, version, hasLiveRecords, latestRevision: { id, state, score, entryMethod } | null } | null`;
  `homeTeamId` / `awayTeamId` are `string | null`. Top level `slots[]`:
  `{ id, kind, groupId, sourceGroupId, position, label, registrationId, teamName }` (label `N번 자리`).
- `GET /admin/league-matches/:leagueId/teams`: each team carries `registrationId` (the confirmed
  registration id the slot assignment endpoint takes).
- `GET /admin/league-matches/:leagueId/videos`: `homeTeamName` is `string | null` (an unfilled fixture no
  longer returns `409 LEAGUE_FIXTURE_INCOMPLETE`).
```

- [ ] **Step 2: changeset 을 쓴다**

`.changeset/league-slot-template-backend.md`:

```markdown
---
"v1_api": minor
"v1_web": minor
---

정규 리그 대진을 템플릿으로 먼저 만들 수 있습니다. 팀 수와 일정을 정하면 자리와 빈 경기가 한 번에 만들어지고, 자리에 팀을 넣는 순간 그 팀의 경기와 일정이 생깁니다. 팀이 다 채워지지 않은 경기는 공개 일정·순위·경기 기록·팀 매치 목록에 나오지 않고, 빈 경기도 취소할 수 있습니다.
```

- [ ] **Step 3: 좁게 마감 확인한다** (풀스위트는 돌리지 않는다 — 이 PR 이 건드린 것만)

```bash
cd apps/v1_api
./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" 2>&1 | grep -c "error TS" ; node scripts/v1-surface-check.mjs
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 \
  src/common/competition src/league-matches src/games/public-records/public-league-schedule.spec.ts \
  src/games/public-records/public-league-fixture-record.spec.ts src/tournaments/tournaments-read.service.spec.ts \
  src/tournaments/admin-registrations.service.spec.ts src/team-matches
```
Expected: `tsc` 오류 수가 이 브랜치 시작 때(`git stash` 금지 — 시작 시 기록해 둔 값)와 같다(새 오류 0), surface-check 통과, 위 unit 전부 PASS. 로컬 `tsc` 가 공유 Prisma client 때문에 새 컬럼 오류를 내면 Global Constraints 의 격리 생성 `tsc` 로 한 번 더 확인하고 임시 파일을 지운다.
CI 에서 통과해야 하는 통합 스펙 묶음(이 PR 이 추가·수정한 것):

```bash
./node_modules/.bin/jest --selectProjects integration --runInBand \
  test/league-matches/league-slot-fixture-creation.integration-spec.ts \
  test/league-matches/league-fixture-side-assignment.integration-spec.ts \
  test/league-matches/league-slot-status.integration-spec.ts \
  test/league-matches/league-template.integration-spec.ts \
  test/league-matches/league-slot-cancel-regenerate.integration-spec.ts \
  test/league-matches/league-slot-assignment-lane.integration-spec.ts \
  test/league-matches/league-slot-registration-release.integration-spec.ts \
  test/league-matches/league-unfilled-gate.integration-spec.ts \
  test/league-matches/league-slot-admin-view.integration-spec.ts \
  test/jobs/league-result-entry-reminder.integration-spec.ts
```

- [ ] **Step 4: 커밋**

```bash
git commit -m "docs(league): 자리 기반 대진 템플릿·공개 게이트 API 문서와 changeset" -- docs/api/domains/league-matches.md .changeset/league-slot-template-backend.md
git show --stat HEAD
```

### Task 20: alpha 전후 응답 동등성 비교 (읽기 전용 — 쓰기 없음)

스펙 Risks 는 "공개 게이트 대조군 테스트와 **alpha 실데이터 전후 응답 비교**로 회귀를 막는다"고 정했다. Task 12~15 는 공개 쿼리를 좁히는 변경이라 fixture 대조군만으로는 "덜 돌려주는" 실패를 실데이터에서 못 본다. alpha 에 자리 기반 경기는 아직 없으므로(템플릿은 이 PR 이 처음 만든다) **기대는 diff 0** — 자리 없는 기존 경기는 한 건도 사라지면 안 된다. 요청은 전부 비인증 GET 이라 alpha 데이터를 바꾸지 않고, 자격증명도 필요 없다. 코드·파일 변경이 없고 결과 파일은 scratchpad 에만 둔다(저장소는 PUBLIC — 응답 본문·대회명·id 를 PR 코멘트에 붙이지 않고 집계 수치와 diff 줄 수만 남긴다).

**Files:** 없음(저장소 변경 0). 작업 디렉터리는 세션 scratchpad.

- [ ] **Step 1: 머지 전 기준선(before)을 받는다** — 이 PR 을 dev 에 머지하기 **전**에, alpha 가 서빙하는 옛 SHA 를 기록하고 응답을 저장한다.

```bash
cd "$SCRATCH" && mkdir -p before after
A=https://alpha.teameet.co.kr/api/v1
curl -fsSI https://alpha.teameet.co.kr/landing | grep -i 'x-teameet-commit' | tee before/sha.txt
# 대상 선정: 공개 리그 목록에서 리그 id 를 모두 뽑는다(목록 커서는 pageInfo.nextCursor — 한 페이지로 모자라면 끝까지 따라간다).
curl -fsS "$A/league-matches?limit=50" | jq -r '.data.items[]?.id // .data[]?.id' | sort > before/league-ids.txt
wc -l before/league-ids.txt   # 0 이면 응답 모양을 먼저 확인하고(.data 하위 키) jq 경로를 고친 뒤 다시 한다. 0 건을 통과로 읽지 않는다
```
Expected: SHA 한 줄, 리그 id 1건 이상.

- [ ] **Step 2: 리그마다 공개 응답을 저장한다** — 일정·순위·통합 상세·기록 일정·경기별 기록, 그리고 팀 매치 목록·상세.

```bash
norm() { jq -S 'del(.timestamp, .requestId)'; }   # 매 요청 달라지는 필드만 뺀다
snap() { # $1=디렉터리
  d=$1
  curl -fsS "$A/team-matches?limit=50" | norm > $d/team-matches.list.json
  jq -r '.data.items[]?.id // .data[]?.id' $d/team-matches.list.json | sort > $d/team-match-ids.txt
  for id in $(cat $d/team-match-ids.txt); do curl -fsS "$A/team-matches/$id" | norm > $d/tm-$id.json; done
  for l in $(cat before/league-ids.txt); do
    curl -fsS "$A/league-matches/$l"            | norm > $d/league-$l.json            # 리그 일정(경기 목록 포함)
    curl -fsS "$A/league-matches/$l/standings"  | norm > $d/standings-$l.json         # 순위
    curl -fsS "$A/tournaments/$l"               | norm > $d/unified-$l.json           # 통합 상세(경기·진행률)
    curl -fsS "$A/tournaments/$l/schedule"      | norm > $d/records-schedule-$l.json  # 기록 일정(주차 집합)
    for f in $(jq -r '.. | objects | select(.fixtures?) | .fixtures[]?.id' $d/league-$l.json | sort -u); do
      curl -fsS "$A/league-matches/$l/fixtures/$f/record" | norm > $d/record-$l-$f.json  # 경기 상세
    done
  done
}
snap before
ls before | wc -l
```
Expected: 파일 수가 리그 수 × (4 + 경기 수) + 팀 매치 수 이상. `curl -f` 가 4xx/5xx 에서 멈추므로 비어 있는 채 통과하지 않는다.

- [ ] **Step 3: 머지 → alpha 배포 완료를 확인한다** — CLAUDE.md "Alpha 실측 검증" 2 절차 그대로(배포 창 502 를 결함으로 읽지 않는다).

```bash
gh run list --workflow deploy-alpha.yml --branch dev --limit 1 --json headSha,status,conclusion --jq '.[0]'
curl -fsSI https://alpha.teameet.co.kr/landing | grep -i 'x-teameet-commit'
git merge-base --is-ancestor <이 PR 머지 커밋> <alpha 가 서빙하는 SHA> && echo 포함됨
```
Expected: 서빙 SHA 가 머지 커밋을 포함하고 `x-teameet-commit` 이 Step 1 의 값과 다르다.

- [ ] **Step 4: 머지 후 응답(after)을 받아 diff 한다**

```bash
snap after
diff -r before after && echo "응답 동등: diff 0"
```
Expected: `응답 동등: diff 0`. diff 가 있으면 **새 값이 옛 값의 부분집합인지**(사라진 경기·팀 매치가 있는지)부터 본다 — `diff` 한 줄이 "사라진 id" 이면 게이트가 자리 없는 기존 경기를 가린 회귀이므로 머지를 되돌리지 말고(전역 규칙 21 — 롤백은 사용자 게이트) 원인 Task(12~15)를 특정해 보고한다. 목록 순서·집계만 달라진 diff 는 의도된 변경인지 근거와 함께 판단한다. 같은 시간대에 다른 PR 이 alpha 데이터를 바꿨을 수 있으니, diff 가 나면 `before` 를 한 번 더 받아 본 뒤(데이터 드리프트 배제) 판정한다.

- [ ] **Step 5: 결과를 PR 에 집계 수치로만 남긴다** — "리그 N개·팀 매치 M건·파일 K개 diff 0 (before SHA / after SHA)" 한 줄. 응답 본문·id 는 붙이지 않는다. 커밋 없음.

- [ ] **Step 6: UI 없는 PR 의 「머지 후 확인」** (색인 「머지 후 확인」 — 갤러리·ego-browser 화면 시나리오 면제). Step 3 의 배포 확인 뒤, **새 응답 필드가 나오는지만** 비인증/읽기 전용으로 스모크한다. 새 대회·리그·결과를 만드는 alpha 쓰기(템플릿 적용 등)는 **사용자 승인 후**에만 한다 — 승인 전에는 아래만 실행한다.

```bash
# 공개 API 는 이 PR 이 소비자에게 새 필드를 더하지 않으므로 Step 4 의 diff 0 이 곧 스모크다.
# 어드민 응답(slots/game/registrationId)은 로그인이 필요하다 — 계정 목록은 저장소 밖 비공개 메모리의 alpha E2E 계정을 쓰고 비밀번호·토큰을 명령에 적지 않는다.
# 세션은 쿠키 하나이며 ALPHA_SESSION_TOKEN 환경변수로만 넘긴다. 기존 리그 하나의 어드민 상세에서 키 존재만 본다:
C="cookie: teameet_v1_session=$ALPHA_SESSION_TOKEN"
curl -fsS -H "$C" "$A/admin/league-matches/<리그 id>" \
  | jq '.data | {hasSlots: has("slots"), fixtureKeys: ([.fixtures[]? | has("homeSlotId") and has("awaySlotId") and has("game")] | all)}'
curl -fsS -H "$C" "$A/admin/league-matches/<리그 id>/teams" | jq '.data.teams | all(has("registrationId"))'
```
Expected: `hasSlots: true`, `fixtureKeys: true`, 마지막 줄 `true`(리그에 경기·참가팀이 없으면 `all` 이 vacuous `true` 이므로 경기·참가팀이 있는 리그를 고른다). PR 코멘트에는 이 불리언들과 Step 4 의 diff 0 한 줄만 남긴다(PUBLIC 저장소).

## Self-Review

**스펙 항목 → Task 대응**

| 스펙 항목 | Task |
|---|---|
| S2 리그: `createLeagueFixture` 팀 null + 자리 id, 팀 없으면 일정·참가자·신청서 없음, 사이드 '미정', matched | 2 |
| S2 리그 템플릿 엔드포인트: 행 잠금 + 가드, `LEAGUE_FIXTURES_EXIST`, 필수 일정 DTO, ENTRY `groupId=null`, 슬롯 라운드로빈, 상태 불변 | 5, 7 |
| S2 `replaceExisting`: 시작 전·결과 없음일 때만 취소 + `cascadeCancelFixtureInTx` + 자리 연결 해제, `BRACKET_LOCKED` | 6, 8 |
| S2 자리 리그의 기존 재생성 `LEAGUE_SLOT_FIXTURES_USE_TEMPLATE`, 「경기 하나 추가」는 그대로 | 9 (수동 생성은 코드 무변경 — 기존 스펙이 보호) |
| S2 리그 상태: 조건부 전이 헬퍼(`draft`/`open`/`closed` — 경기 시작 전 전부), 보류·완료 불변 | 4, 10 |
| S3 리그 사이드 배정: 사이드 팀·표시 이름, 라인업·전술 무효화, 명단 조정 회수, 명단 재계산 이벤트 | 3 |
| S3 리그: 팀 일정은 양 팀 모두 찼을 때만·한쪽 비면 둘 다 취소 | 3, 10 |
| S3 리그: 원정 신청서 upsert, A→B→A, 이전 팀 `withdrawn` | 3, 10 |
| S3 `releaseSlotsForRegistrationInTx` 를 `confirmed` 이탈 전이 전수에 연결(전이 지점 표) | 11 (어드민 등록 취소는 PR-1b 연결을 같은 스펙이 검증) |
| S3 보류 리그 자리 변경 거부 · 완료 리그 거부(`SLOT_LOCKED`/`LEAGUE_FIXTURES_EXIST`) | 7, 10 |
| S3 무작위 채우기가 리그에서도 동작 | 10 |
| S6 공개 게이트 공통 헬퍼(Prisma where + raw SQL) | 1 |
| S6 경로: 공개 일정·순위(`league-match-public`) | 12 |
| S6 경로: 통합 상세 리그 경기·진행률(`tournaments-read`) | 13 |
| S6 경로: 기록 일정·경기 상세(`public-tournament-records`) + 주차 집합 분리 | 14 |
| S6 경로: `/team-matches` 목록·상세·sitemap 원천·마이 팀매치 전 범위 | 15 |
| S6 공개 영상 경로 | 전수 확인 결과 별도 공개 영상 경로 없음(영상은 기록 일정·경기 상세 응답의 `videos` 로만 나가며 14 가 게이트) |
| S6 어드민 영상 목록 host null 허용 | 17 |
| S6 빈 경기 취소가 막히지 않게(`requireLeagueHostTeamId` 제거), 팀 알림 생략 | 6 |
| S6 결과 미입력 리마인더 생략 | 16 |
| S6 어드민 상세/참가팀: `homeSlotId`/`awaySlotId`/`game`/`slots`, nullable 팀 id, `registrationId` | 18 |
| Test Scenarios: 5종 대조군 × 모든 경로 · 주차 라벨 동일 | 12, 13, 14, 15 |
| Test Scenarios: 리그 반쪽 경기(팀 일정 0 → 2 → 취소) | 3, 10 |
| Test Scenarios: 리그 빈 경기 취소 성공·알림 0·리마인더 0·영상 200 | 6, 16, 17 |
| Test Scenarios: 참가팀 제외·등록 취소 시 자리만 비움 vs 자리 없는 경기는 취소 | 11 |
| Test Scenarios: 자리 리그 재생성 409 · 템플릿+경기 있음 409 · 보류·완료 거부 | 7, 9, 10 |
| Test Scenarios: 리그 상태 전이(마지막 사이드 채움/남은 빈 경기 취소, 보류 불변) | 4, 6, 10 |
| Test Scenarios: 동시성 — 템플릿×일괄 생성, 템플릿×템플릿 | 7 |
| Test Scenarios: 리그 취소 경기의 자리 연결 해제·잠금 판정 제외 | 6, 10 |
| Mock data updates: 서비스 spec 의 Prisma mock | 6, 9, 11, 18 (해당 Task 의 spec 수정 단계) |
| docs `league-matches.md` · changeset | 19 |
| Risks: 공개 게이트 alpha 실데이터 전후 응답 비교(읽기 전용) | 20 |
| 색인 「머지 후 확인」: UI 없는 PR(갤러리 면제) — 배포 SHA 확인 + 새 응답 필드 읽기 전용 스모크, alpha 쓰기는 사용자 승인 후 | 20 (Step 3·6) |
| 색인 보충 계약: 어드민 직렬화 재사용(별도 view 파일 없음) · PR-1b 시드 헬퍼 재사용 · 이름 일치(`assertLeagueFixtureGenerationAllowedInTx`·`lockCompetitionForSlotReleaseInTx`·`assignSlotCore`/`assignSlotsBatchInTx` 경유) | 0, 2, 10, 11, 18 |

**이 PR 에서 의도적으로 하지 않는 것**
- 스키마·마이그레이션·해시 5곳(PR-1a). 대진 생성 가드 추출·잠금 헬퍼·자리 서비스 본체(PR-1b). 웹 타입·화면(PR-5b). 빠른 결과(PR-2).
- 운영 콘솔 보드(`tournament-operations-board.service.ts`)·징계 경기 순서(`discipline/team-game-order.ts`)·`league-claimable-fixtures.service.ts`·`playerRecords`: S6 공개 경로 목록 밖이다. 앞의 둘은 운영자·팀 내부 경로라 반쪽 경기를 봐야 하고 `leagueFixtureListWhere` 를 계속 쓴다. 뒤의 둘은 결과를 가질 수 없는 경기를 다루거나 선수 본인 팀의 경기만 읽는다 — 필요하면 별도 태스크.

**알려진 한계 / 후속 확인**
- `promoteLeagueWhenSlotsFilledInTx` 의 승격 대상은 스펙 확정대로 `draft`·`open`·`closed`(경기 시작 전 전부)다 — 일괄 생성과 `closed` 에서도 결과가 같다. 사용자 결정 게이트는 없다. 상태 변경 로그의 `fromStatus` 는 리그 상태 어휘(`draft`)로 남기므로 `closed` 에서 올라가도 값이 같다.
- Task 18 은 새 직렬화 파일을 만들지 않고 PR-1a 의 `serializeAdminBracketSlot`/`serializeAdminBracketGame`(`tournaments/slots/admin-bracket-view.ts`)을 import 한다(색인 보충 계약, 별도 `league-admin-fixture-view.ts` 금지).
- 통합 스펙은 로컬에 DB 가 없어 CI 에서 처음 돈다. 특히 Task 3 의 명단 재계산(`drainOutboxWorker` 후 참가자 ≥ 2)과 Task 10 의 무작위 채우기는 PR-1b 의 실제 동작에 의존하므로 CI 첫 실행에서 어긋나면 해당 Task 의 기대값부터 확인한다.
