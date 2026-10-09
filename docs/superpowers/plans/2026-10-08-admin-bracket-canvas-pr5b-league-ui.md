# 어드민 대진 그림 편집기 PR-5b — 정규 리그 일정 보드 (웹)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플랫폼 어드민이 리그 상세 화면에서 [일정 보드 | 목록]을 전환하고(기본 일정 보드), 템플릿으로 빈 경기를 만든 뒤 보드에서 자리에 팀을 넣고 경기 상태·공개 대기를 한눈에 보게 한다. 리그 경기의 팀이 비어 있을 수 있게 된 타입 변경(`homeTeamId`/`awayTeamId` nullable)을 모든 소비처에 "미정" 문구로 반영한다.

**Architecture:** 서버(PR-5a)가 내려주는 `fixtures[].homeSlotId/awaySlotId/game`, 최상위 `slots`, 참가팀 `registrationId` 를 웹 타입에 얹고, 순수 함수 `buildLeagueBoard` 가 경기를 KST 날짜 열로 묶어 보드 모델을 만든다. `LeagueScheduleBoard` 는 PR-3 의 `BracketTeamTray` 와 `useV1AssignTournamentSlot`/`useV1RandomFillSlots`(scope `'league'`)를 재사용하고, 경기 상세는 리그용 `LeagueFixturePanel` 이 PR-3 의 점수 입력 폼·결과 확정/정정/무효 컴포넌트를 그대로 끼워 만든다.  템플릿 창은 기존 리그 일정 입력(날짜 달력·요일 채우기)을 그대로 쓴다. 기존 리그 화면(`league-match-fixtures-client.tsx`)은 보기 전환만 얹고 목록 경로는 그대로 둔다.

**Tech Stack:** Next.js 16 App Router + React 19 + TanStack Query 5 + Vitest + Testing Library (apps/v1_web). 백엔드 변경 없음.

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md` (S3·S5·S6·S7) · 색인/공유 계약 `docs/superpowers/plans/2026-10-08-admin-bracket-canvas-index.md`

## 계약 이탈 / 계약 보강

색인의 이름은 하나도 바꾸지 않는다. 아래 다섯은 색인에 없거나 실제 코드(PR-3 계획·현재 리그 코드)와 맞지 않아 이 PR 이 추가·대체하는 항목이다.

1. **리그 열은 `buildCanvasLayout(mode:'league')` 대신 `buildLeagueBoard`(신규, `apps/v1_web/src/lib/league-board-model.ts`)로 계산한다.**
   코드 이유: PR-3 의 `buildCanvasLayout` 은 `V1AdminBracketFixture` 를 입력으로 받아 리그 모드에서는 `fixture.round` 문자열로 열을 묶는다(PR-3 계획 Task 4 `leagueColumns`). 그런데 리그 어드민 상세의 경기(`V1LeagueFixture`, `league-match-admin.service.ts` 의 `detail()`)에는 `round`·`groupId`·`fixtureNumber` 가 없다(`title` 의 "N주차"뿐이고 문자열 파싱은 취약하다). 억지로 끼우면 값을 지어내야 한다. 대신 열 = 경기 날짜(KST), 노드 상태는 PR-3 의 `fixtureNodeState(game)` 를 그대로 재사용한다.
   **스펙 S7 의 "라운드 열"과의 관계(검토 지적 반영):** 이 도메인에서 정규 리그의 라운드는 곧 날짜다. DB 에 라운드 컬럼이 없고(제목의 "N주차"는 `leagueFixtureTitle` 이 만든 표시용), 공개 화면의 "N주차"도 `leagueWeekNumbers` 가 경기일 순번으로 센다(PR-5a 계획 Task 14). 템플릿은 "라운드마다 날짜 하나"(팀당 하루 1경기)로 만들어 날짜 열 = 라운드 열이다. 그래서 `roundNumber` 필드를 PR-5a 직렬화에 새로 만들지 않고(그러면 제목 파싱이거나 날짜 순번의 두 번째 사본이 된다), 보드가 **열 순번을 `N주차`로 보여 줘** 공개 화면과 같은 말로 맞춘다(`LeagueBoardColumn.weekNumber`, Task 5·7). 단 기존 일괄 생성(`generateFixtures`)이 `gamesPerTeamPerDay > 1` 로 만든 리그는 하루에 라운드가 여럿이라 열이 라운드와 1:1 이 아니다 — 보드는 템플릿으로 만든 자리 리그 기준이고 이 한계는 그대로 둔다. 스펙 S7 의 "라운드 열" 문구는 "라운드(주차) = 경기 날짜 열"로 고쳐야 한다(스펙·색인은 이 계획이 수정하지 않는다 — 최종 보고에 남김).
2. **PR-3 의 `BracketNodePanel` 은 리그 경기에 쓸 수 없어 `LeagueFixturePanel`(신규)을 둔다.**
   코드 이유: PR-3 계획 Task 12 의 `BracketNodePanel` props 는 `tournamentId`·`V1AdminBracketFixture`·`groups` 이고 내부에서 `useV1UpdateFixture(tournamentId)`·`useV1DeleteFixture` 를 직접 부른다(토너먼트 경기 PATCH/DELETE 경로). 리그 경기는 팀매치(`V1LeagueFixture`)이고 일정 수정·취소가 기존 리그 모달(`LeagueFixtureScheduleModal`·취소 `GateConfirmModal`)이다. 결과 구역은 PR-3 의 `BracketQuickResultForm`·`BracketResultActions` 와 `useV1QuickResult(leagueId, 'league')` 를 그대로 재사용한다. 또 정정·무효·확정 훅은 결과 검토 캐시만 무효화하므로(`use-tournament-result-review.ts` 의 정정·무효·확정 훅 `onSuccess`) 리그 패널이 성공 토스트를 가로채 `adminLeagueMatch` 를 함께 무효화한다.
3. **템플릿 요청 본문의 선택 필드 `placeName`.** 색인 HTTP 표의 본문은 `{ teamCount, legs, schedule, replaceExisting? }` 지만 PR-5a 계획이 같은 이유(공개 가드는 장소가 있는 경기만 통과, 시나리오 4 의 일정 입력에 장소 포함)로 선택 필드 `placeName?: string` 을 더했다(PR-5a 계획 "계약 이탈" 2번, 추가만). 이 PR 의 대화상자는 장소를 비우면 키를 아예 보내지 않고(서버 기본 `'장소 미정'`), 채우면 `placeName` 을 보낸다.

4. **(2026-10-09 보강) 참가팀 트레이의 "자리 없이 경기에 직접 들어간 팀".** PR-3 alpha 갤러리에서 자리 없이 만든 기존 대진이 트레이에 "미배정 12 / 전체 12"로 잘못 보이는 결함이 나왔고, 토너먼트 쪽은 #1725 가 `BracketTeamTray` 에 선택 prop `directPlacedIds?: ReadonlySet<string>`(그 팀은 "경기에 있음"으로 보이고 미배정 수에서 빠지되 계속 고를 수 있음)을 더해 고쳤다. 리그 보드(Task 7c)도 같은 결함을 피하려고, 취소되지 않은 리그 경기에서 **자리가 없는 사이드(`homeSlotId`/`awaySlotId` 가 null)에 팀이 있으면** 그 팀 id 를 `teams`(이름 조회용 `V1AdminLeagueTeam[]`)의 `registrationId` 로 바꿔 모은 집합을 `directPlacedIds` 로 넘긴다(`registrationId` 가 null 인 팀은 건너뛴다). 계산은 `league-board-model.ts` 의 순수 함수로 두고 단위 테스트한다(취소 경기 제외·자리 있는 사이드 제외·자리 없는 사이드 포함 — 양쪽 대조군). **#1725 가 아직 dev 에 없으면** 트레이에 이 prop 이 없으므로, Task 7c 시작 시 `git fetch origin dev && git merge origin/dev` 로 받아 온 뒤 진행하고, 그래도 없으면 BLOCKED 로 보고한다.

5. **(2026-10-09 보강) 트레이의 필수 prop `registrationsState`.** #1725 리뷰(P2)로 `BracketTeamTray` 가 참가팀 조회 상태 `RegistrationsLoadState = { status: 'pending'|'error'|'success', truncated, refetchFailed, error, onRetry }` 를 필수로 받는다 — 조회 실패·로딩·잘림을 "0팀"으로 보이지 않게. 리그 보드(Task 7c)는 확정 팀 목록을 직접 조회하므로 그 쿼리를 대회 화면(`app/admin/tournaments/[id]/bracket/page.tsx`)과 **같은 규칙**으로 바꿔 넘긴다: `status = data !== undefined ? 'success' : isError ? 'error' : 'pending'`, `refetchFailed = isError && data !== undefined`, `onRetry = refetch`. 잘림 정보가 없는 조회면 `truncated: false`. 보드의 무작위 채우기도 대회 화면처럼 `status !== 'success'` 이면 이유("참가팀을 불러오는 중이에요." / "참가팀을 불러오지 못했어요.")와 함께 막는다.

## PR-3 의존 계약 (이 PR 이 소비하는 것 — PR-3 계획 기준)

| 모듈 | 필요한 export | 모양 |
|---|---|---|
| `@/types/api` | `V1AdminBracketSlot`, `V1AdminBracketFixtureGame`, `V1AdminTournamentRegistration`(기존) | 색인 "AdminBracketSlot"/"game" 정의 그대로 |
| `@/lib/bracket-canvas-layout` | `fixtureNodeState` | `(game: V1AdminBracketFixtureGame \| null) => 'scheduled' \| 'live' \| 'submitted' \| 'official' \| 'cancelled'` (LIVE·PAUSED → `live`, 무효 → `scheduled`) |
| `@/lib/competition-status` | `bracketNodeStateChip` | `(state: FixtureNodeState) => StatusChipModel` — 칸 상태 칩의 **단일 정의**(예정·진행 중·확정 전·확정·취소). 이 PR 은 로컬 상태 맵(`STATE_TAG` 류)을 만들지 않고 import 만 한다 |
| `@/components/v1-ui/status-chip` | `StatusChip` | props `{ chip: StatusChipModel; size?: 'sm' \| 'md' }` — PR-3 `BracketCanvasNode` 가 같은 칩 렌더에 쓰는 기존 컴포넌트 |
| `@/lib/bracket-canvas-errors` | `describeBracketCanvasError` | `(err: unknown, fallback: string) => string` — 코드가 없는 에러는 `extractErrorMessage` 로 떨어진다 |
| `@/hooks/use-v1-bracket-canvas` | `useV1AssignTournamentSlot`, `useV1RandomFillSlots`, `useV1QuickResult` | `(competitionId: string, scope: 'tournament' \| 'league')` → 변이. assign 변수 `{ slotId: string; registrationId: string \| null }`, random-fill 변수 없음·결과 `{ assignments: { slotId: string; registrationId: string }[] }`, quick 변수 `{ gameId: string; expectedVersion: number; score: V1QuickResultScore }` |
| `.../bracket-canvas/bracket-canvas-dnd` | `REGISTRATION_DRAG_MIME` | 끌어 놓기 데이터 타입 상수 |
| `.../bracket-canvas/bracket-team-tray` | `BracketTeamTray` | props `{ registrations: V1AdminTournamentRegistration[]; slots: V1AdminBracketSlot[]; pendingRegistrationId: string \| null; canWrite: boolean; onPick: (registrationId: string \| null) => void }` — 확정 팀만 이름순, ENTRY·BYE 에 들어간 팀은 비활성 |
| `.../bracket-canvas/bracket-quick-result-form` | `BracketQuickResultForm` | props `{ homeLabel; awayLabel; isKnockout: boolean; initial?; submitLabel: string; pending: boolean; errorMessage?: string \| null; onSubmit: (score: V1QuickResultScore) => void; onCancel? }` |
| `.../bracket-canvas/bracket-result-actions` | `BracketResultActions` | props `{ tournamentId: string; fixtureId: string; game: V1AdminBracketFixtureGame; isKnockout: boolean; homeLabel: string; awayLabel: string; canWrite: boolean; showToast }` — `tournamentId` 는 정정 화면 링크(`/admin/live/{id}/records/corrections?fixtureId=`)와 결과 검토 캐시 키에만 쓰여 리그 id 를 넘긴다 |
| `@/test/bracket-canvas-fixtures` | `makeSlot`, `makeGame`, `makeRegistration` | 테스트 빌더 |

PR-5a 가 내려주는 계약(색인 "응답 확장"): 리그 어드민 상세의 경기 `homeSlotId`·`awaySlotId`·`game`, 최상위 `slots`, `homeTeamId`·`awayTeamId` nullable, 참가팀 `registrationId`; `POST /admin/league-matches/:leagueId/fixtures/template` `{ teamCount, legs, schedule: { dates, time }, replaceExisting? }` → `{ slots, fixtures }`.

## Global Constraints

색인의 "Global Constraints" 전부 적용된다(worktree·pathspec 커밋·`prisma generate` 금지·로컬 next 서버 금지·토큰만·44px·해요체·주석 비율 등). 이 PR 에만 해당하는 것:

- 웹 전용 PR. `apps/v1_api` 는 건드리지 않는다. changeset 은 `"v1_web": minor` 하나(`.changeset/config.json` 의 `fixed` 그룹이 두 패키지 버전을 함께 올리고, 단일 패키지 changeset 선례가 있다).
- 선행 PR: PR-3(웹 캔버스·훅·타입)와 PR-5a(리그 백엔드)가 이 브랜치의 base 에 들어와 있어야 한다. Task 1 첫 단계가 확인한다.
- 리그 상세 화면의 기존 목록 경로 동작은 바꾸지 않는다. 기존 테스트 49개 렌더는 `initialView="list"` 로 목록을 고정해 그대로 통과시킨다(Task 9).
- "미정" 문구: 홈 `홈팀 미정`, 원정 `원정팀 미정`. 부전승(원정 없음 + 원정 자리 없음)은 기존 `부전승` 유지 — 자리 방식 도입이 기존 부전승 표기를 바꾸면 안 된다.
- 테스트는 `apps/v1_web` 안에서: `./node_modules/.bin/vitest run <파일>`, 타입 `./node_modules/.bin/tsc --noEmit -p tsconfig.json`, 패턴 `node scripts/v1-pattern-check.mjs`.
- `[leagueId]`·`[fixtureId]`·`[id]` 같은 대괄호 경로는 git 이 글롭으로 읽을 수 있다. 이 계획의 모든 `git add`/`git commit -- <경로>` 는 `GIT_LITERAL_PATHSPECS=1 git ...` 로 실행한다. 새 파일은 `git add <명시 경로>` 로 먼저 올린 뒤 `git commit -m "..." -- <같은 경로>` 로 커밋한다(pathspec 커밋은 추적되지 않은 파일을 못 찾는다).
- 화면 검증(390/768/1440 갤러리·ego-browser)은 머지 후 alpha 에서 한다(색인 Sequential). 이 계획의 태스크는 로컬 next 서버를 띄우지 않는다.

## File Structure

| 파일 | 작업 | 책임 |
|---|---|---|
| `apps/v1_web/src/types/league-match.ts` | Modify | 경기 팀 id nullable, 슬롯·게임 필드, `slots`, 참가팀 `registrationId: string \| null`(필수 필드), 템플릿 payload/result |
| `apps/v1_web/src/lib/league-fixture-meta.ts` | Modify | `leagueSideLabel`, `leagueFixtureMatchupLabel` ("미정"·부전승 표기 단일 소스) |
| `apps/v1_web/src/lib/league-fixture-meta.test.ts` | Modify | 위 두 함수 테스트 |
| `apps/v1_web/src/lib/league-next-action.ts` · `.test.ts` | Modify | 홈 팀 미정 경기는 콘솔 대상 아님 |
| `apps/v1_web/src/app/league-matches/[leagueId]/fixtures/[fixtureId]/league-fixture-detail-client.tsx` · 해당 test | Modify | 홈 null 안전 + "홈팀 미정" |
| `apps/v1_web/src/app/league-matches/[leagueId]/league-match-standings-client.tsx` | Modify | 홈 null 폴백 문구 |
| `apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx` | Modify | 리그 카드 홈 라벨 null 안전 |
| `apps/v1_web/src/hooks/use-v1-bracket-canvas.ts` · `use-v1-bracket-canvas.league-template.test.tsx` | Modify · Create | `useV1ApplyLeagueTemplate` |
| `apps/v1_web/src/lib/league-board-model.ts` · `.test.ts` | Create | 경기→보드 열·노드·요약 순수 변환 |
| `apps/v1_web/src/components/admin/bracket-canvas/league-fixture-panel.tsx` · `.test.tsx` | Create | 리그 경기 상세 패널(팀 자리·결과·일정/취소) — PR-3 결과 컴포넌트 재사용 |
| `apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.tsx` · `.test.tsx` | Create | 일정 보드(열·카드·툴바·트레이·패널 연결) |
| `apps/v1_web/src/lib/league-fixture-dates.ts` | Modify | `WEEKDAY_OPTIONS` export(중복 방지) |
| `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-template-dialog.tsx` · `.test.tsx` | Create | 템플릿 대화상자(팀 수·회전·요일/날짜·시각) |
| `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx` | Modify | 보기 전환·보드·대화상자 연결, null 안전, 자리 리그 재생성 차단 |
| `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx` | Modify | `initialView="list"` 일괄, 모킹 추가, 보드·null·재생성 테스트 |
| `apps/v1_web/src/app/admin/league-matches/[leagueId]/page.tsx` | Modify | `?view=list` 를 `initialView` 로 전달 |
| `.changeset/admin-league-schedule-board.md` | Create | 사용자에게 달라지는 점 |

---

### Task 1: 선행 확인 + 추가 전용 타입 (슬롯·게임·참가팀 registrationId·템플릿 payload)

**Files:**
- Modify: `apps/v1_web/src/types/league-match.ts` (`interface V1LeagueFixture`, `interface V1AdminLeagueDetail`, `type V1AdminOnlyLeagueFields`, `interface V1AdminLeagueTeam`, 파일 끝에 payload 추가 — 위치는 `grep -n "export interface V1LeagueFixture\|export interface V1AdminLeagueDetail\|^type V1AdminOnlyLeagueFields\|export interface V1AdminLeagueTeam " apps/v1_web/src/types/league-match.ts` 로 찾는다)
- Modify(테스트 fixture): `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx` (참가팀 목 데이터 `teams: [` 배열과 `const TEAMS = [` 에 `registrationId` 추가)

**Interfaces:**
- Consumes: `V1AdminBracketSlot`, `V1AdminBracketFixtureGame` (`@/types/api`, PR-3)
- Produces: `V1LeagueFixture.homeSlotId?/awaySlotId?/game?`, `V1AdminLeagueDetail.slots?`, `V1AdminLeagueTeam.registrationId: string | null`(필수 필드·값만 nullable — 색인 공유 계약), `V1ApplyLeagueTemplatePayload`, `V1ApplyLeagueTemplateResult`

- [ ] **Step 1: 선행 PR 산출물 존재 확인 (없으면 여기서 멈춘다)**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas/apps/v1_web
grep -n "export type V1AdminBracketSlot\|export type V1AdminBracketFixtureGame\|export interface V1AdminBracketSlot\|export interface V1AdminBracketFixtureGame" src/types/api.ts
grep -n "export function fixtureNodeState" src/lib/bracket-canvas-layout.ts
grep -n "export function describeBracketCanvasError" src/lib/bracket-canvas-errors.ts
grep -n "export function bracketNodeStateChip" src/lib/competition-status.ts
grep -n "export function useV1AssignTournamentSlot\|export function useV1RandomFillSlots\|export function useV1QuickResult" src/hooks/use-v1-bracket-canvas.ts
grep -n "REGISTRATION_DRAG_MIME" src/components/admin/bracket-canvas/bracket-canvas-dnd.ts
grep -n "export function BracketTeamTray" src/components/admin/bracket-canvas/bracket-team-tray.tsx
grep -n "export function BracketQuickResultForm" src/components/admin/bracket-canvas/bracket-quick-result-form.tsx
grep -n "export function BracketResultActions" src/components/admin/bracket-canvas/bracket-result-actions.tsx
grep -n "export function makeSlot\|export function makeGame\|export function makeRegistration" src/test/bracket-canvas-fixtures.ts
```

Expected: 위 이름이 모두 한 줄 이상 출력된다. 하나라도 비면 PR-3 가 base 에 없는 것이므로 작업을 멈추고 "PR-3 미머지"를 보고한다. props 모양이 위 "PR-3 의존 계약" 표와 다르면 표를 실제 모양으로 고쳐 쓰고 Task 6·7 의 해당 호출부만 그 모양에 맞춘다(색인 이름은 바꾸지 않는다).

- [ ] **Step 2: tsc 기준선 확인**

타입 전용 변경이라 별도 테스트 파일은 만들지 않는다(필드 존재만 확인하는 가짜 테스트가 된다). Task 2·5·6·7 의 테스트가 이 필드를 직접 쓰고, 여기서는 변경 전후 `tsc` 가 깨지지 않는지(추가 전용)를 확인한다. 변경 전 기준선:

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

Expected: PASS(에러 0). 기준선이 이미 빨갛다면 이 PR 과 무관한 base 문제이므로 보고하고 멈춘다.

- [ ] **Step 3: 최소 구현 — `V1LeagueFixture` 와 `V1AdminLeagueDetail` 에 필드 추가**

`apps/v1_web/src/types/league-match.ts` 맨 위(첫 줄 앞)에 import 추가:

```ts
import type { V1AdminBracketFixtureGame, V1AdminBracketSlot } from './api';

```

`V1LeagueFixture` 의 `scoreHidden?: boolean;` 바로 아래(닫는 `}` 앞)에 추가:

```ts
  /**
   * 이 경기 사이드가 연결된 자리(slot). 어드민 상세에서만 채워지고, 자리 없이 만든 기존 경기는 null/없음이다.
   * 자리가 있는데 팀 id 가 null 이면 "자리만 있고 팀은 아직 안 정해진" 경기다.
   */
  homeSlotId?: string | null;
  awaySlotId?: string | null;
  /** 경기(Game) 요약 — 어드민 상세에서만 채워진다. 칸의 상태 칩과 결과 패널이 쓴다. */
  game?: V1AdminBracketFixtureGame | null;
```

`V1AdminLeagueDetail` 의 `fixtures: V1LeagueFixture[];` 바로 위에 추가:

```ts
  /**
   * 대진 자리(slot) 목록 — 어드민 상세 전용. optional 은 API 가 먼저 배포되지 않은 창의 구버전 응답용이다.
   * 자리를 쓰지 않는 기존 리그는 빈 배열로 온다.
   */
  slots?: V1AdminBracketSlot[];
```

`type V1AdminOnlyLeagueFields` 유니온(현재 마지막 항목 `| 'confirmedRegistrationCount';`) 끝에 `| 'slots'` 를 추가한다(공개 상세 타입으로 새지 않게):

```ts
type V1AdminOnlyLeagueFields =
  | 'isPublic'
  | 'bankName'
  | 'bankAccount'
  | 'bankHolder'
  | 'entryFeeConfiguredAt'
  | 'activeRegistrationCount'
  | 'confirmedRegistrationCount'
  | 'slots';
```

`V1AdminLeagueTeam` 의 `logoUrl: string | null;` 아래에 추가:

```ts
  /**
   * 자리 배정(PUT /admin/tournament-slots/:slotId/assignment)에 보낼 확정 등록 id.
   * 필수 필드다(색인 공유 계약) — 등록 행을 못 찾는 팀이면 값만 null.
   */
  registrationId: string | null;
```

파일 끝에 추가:

```ts
/** `POST /admin/league-matches/:leagueId/fixtures/template` */
export interface V1ApplyLeagueTemplatePayload {
  /** 3~20. */
  teamCount: number;
  legs: 1 | 2;
  /** 기존 일괄 생성과 같은 모양 — 날짜 목록이 정본이다. */
  schedule: V1LeagueFixtureScheduleTemplate;
  /** 모든 경기의 기본 장소. 비우면(키 없음) 서버가 '장소 미정' 을 쓴다. */
  placeName?: string;
  /** 경기가 이미 있는 리그를 새 템플릿으로 바꿀 때만 true. */
  replaceExisting?: boolean;
}

export interface V1ApplyLeagueTemplateResult {
  slots: number;
  fixtures: number;
}
```

- [ ] **Step 4: 타입 검사 실행**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

Expected: PASS. (`registrationId` 가 필수 필드라 `V1AdminLeagueTeam` 을 타입으로 만드는 코드가 있으면 여기서 깨진다 — 깨지는 위치에 `registrationId: <값 또는 null>` 을 추가한다. 선택 필드(`?`)로 바꿔 통과시키지 않는다.)

- [ ] **Step 4b: 기존 테스트 fixture 에 `registrationId` 추가**

어드민 리그 클라이언트 테스트의 참가팀 목 데이터(`useV1AdminLeagueTeamsMock` 반환의 `teams: [` 배열 3곳과 `const TEAMS = [`)는 `as never` 로 캐스팅돼 타입이 못 잡지만, 서버가 내려주는 모양과 같아야 하므로 같은 변경에서 맞춘다.

```bash
perl -i -pe "s/(\{ teamId: '(t\d)', name: '[^']*', status: 'active', memberCount: 5, logoUrl: null) \}/\$1, registrationId: 'r-\$2' }/" "src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx"
grep -c "registrationId: 'r-t" "src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx"
```

Expected: grep 이 `11` 을 출력한다(teams 배열 3곳 3+2+4 = 9 + `TEAMS` 2 — 숫자가 다르면 `grep -n "logoUrl: null }"` 로 남은 줄을 찾아 손으로 맞춘다). `{ teamId: 't1', name: 'A팀' }` 같은 이름만 있는 축약 목(`data: { teams: [{ teamId: 't1', name: 'A팀' }] }`)은 이 테스트가 읽는 필드만 가진 부분 목이라 건드리지 않는다.

- [ ] **Step 5: 커밋**

```bash
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 리그 어드민 타입에 자리·게임·참가팀 registrationId·템플릿 payload 추가" -- apps/v1_web/src/types/league-match.ts "apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx"
GIT_LITERAL_PATHSPECS=1 git show --stat HEAD
```

Expected: 변경 파일 2개.

---

### Task 2: 팀 미정 표기 단일 소스 — `leagueSideLabel` · `leagueFixtureMatchupLabel`

**Files:**
- Modify: `apps/v1_web/src/lib/league-fixture-meta.ts` (파일 끝에 추가)
- Test: `apps/v1_web/src/lib/league-fixture-meta.test.ts` (끝에 `describe` 추가)

**Interfaces:**
- Consumes: `V1LeagueFixture` (Task 1 타입)
- Produces:
  - `leagueSideLabel(teamId: string | null, nameById: ReadonlyMap<string, string>, labels: { tbd: string; unknown: string }): string`
  - `leagueFixtureMatchupLabel(fixture: Pick<V1LeagueFixture, 'homeTeamId' | 'awayTeamId' | 'awaySlotId'>, nameById: ReadonlyMap<string, string>): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/v1_web/src/lib/league-fixture-meta.test.ts` 의 import 줄을 다음으로 바꾸고

```ts
import { fixtureResultLabel, isUpcomingFixture, leagueFixtureMatchupLabel, leagueSideLabel } from './league-fixture-meta';
```

파일 끝에 추가한다. (`homeTeamId` 는 Task 3 에서 nullable 이 되므로, 이 태스크의 테스트는 `Pick` 모양 객체를 직접 만들어 타입 변경 순서와 무관하게 컴파일된다.)

```ts
describe('leagueSideLabel / leagueFixtureMatchupLabel', () => {
  const names = new Map([['t1', '독수리FC'], ['t2', '호랑이FC']]);

  it('팀 id 가 null 이면 자리만 있는 "미정"이고, 모르는 id 와 구분된다', () => {
    const labels = { tbd: '홈팀 미정', unknown: '홈팀' };
    expect(leagueSideLabel(null, names, labels)).toBe('홈팀 미정');
    expect(leagueSideLabel('t1', names, labels)).toBe('독수리FC');
    // 이름 맵에 없는 id 는 "미정"이 아니다 — 팀은 정해졌는데 이름을 못 읽은 것이다.
    expect(leagueSideLabel('ghost', names, labels)).toBe('홈팀');
  });

  it('두 팀이 정해진 경기는 이름 vs 이름이다', () => {
    expect(leagueFixtureMatchupLabel({ homeTeamId: 't1', awayTeamId: 't2', awaySlotId: null }, names)).toBe('독수리FC vs 호랑이FC');
  });

  it('원정 자리가 없는 기존 부전(bye) 경기는 예전대로 "부전승"이다 — 자리 도입이 기존 표기를 바꾸지 않는다', () => {
    expect(leagueFixtureMatchupLabel({ homeTeamId: 't1', awayTeamId: null, awaySlotId: null }, names)).toBe('독수리FC 부전승');
    // 구버전 응답처럼 필드 자체가 없는 경우도 같다.
    expect(leagueFixtureMatchupLabel({ homeTeamId: 't1', awayTeamId: null }, names)).toBe('독수리FC 부전승');
  });

  it('원정 자리가 있는데 팀이 비면 부전승이 아니라 "원정팀 미정"이다', () => {
    expect(leagueFixtureMatchupLabel({ homeTeamId: 't1', awayTeamId: null, awaySlotId: 'slot-2' }, names)).toBe('독수리FC vs 원정팀 미정');
  });

  it('양쪽이 모두 비면 홈팀 미정 vs 원정팀 미정이다', () => {
    expect(leagueFixtureMatchupLabel({ homeTeamId: null, awayTeamId: null, awaySlotId: 'slot-2' }, names)).toBe('홈팀 미정 vs 원정팀 미정');
  });
});
```

주의: 마지막 두 케이스가 `homeTeamId: null` 을 쓰므로 Task 3 의 타입 변경 전에는 `Pick<V1LeagueFixture, …>` 에 null 이 안 맞아 tsc 가 빨갛다. vitest 는 타입을 검사하지 않으므로 테스트 실행에는 영향이 없고, Task 3 에서 타입이 바뀌면 해소된다. 커밋 전 tsc 는 이 태스크에서는 돌리지 않는다.

- [ ] **Step 2: 실행해 실패 확인**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas/apps/v1_web
./node_modules/.bin/vitest run src/lib/league-fixture-meta.test.ts
```

Expected: FAIL — `leagueSideLabel is not a function`(아직 export 없음).

- [ ] **Step 3: 최소 구현**

`apps/v1_web/src/lib/league-fixture-meta.ts` 끝에 추가:

```ts
export interface LeagueSideLabels {
  /** 자리는 있는데 팀이 아직 없을 때. */
  tbd: string;
  /** 팀은 정해졌지만 이름 맵에서 못 찾았을 때. */
  unknown: string;
}

export function leagueSideLabel(
  teamId: string | null,
  nameById: ReadonlyMap<string, string>,
  labels: LeagueSideLabels,
): string {
  if (teamId === null) return labels.tbd;
  return nameById.get(teamId) ?? labels.unknown;
}

/**
 * 어드민 표·알림 문구의 "홈 vs 원정". 원정이 null 일 때 둘을 가른다: 원정 **자리**가 있으면 아직 안 정해진
 * 경기("원정팀 미정"), 자리가 없으면 예전부터 있던 부전승이다.
 */
export function leagueFixtureMatchupLabel(
  fixture: Pick<V1LeagueFixture, 'homeTeamId' | 'awayTeamId' | 'awaySlotId'>,
  nameById: ReadonlyMap<string, string>,
): string {
  const home = leagueSideLabel(fixture.homeTeamId, nameById, { tbd: '홈팀 미정', unknown: '홈팀' });
  if (fixture.awayTeamId !== null) {
    return `${home} vs ${leagueSideLabel(fixture.awayTeamId, nameById, { tbd: '원정팀 미정', unknown: '원정팀' })}`;
  }
  return fixture.awaySlotId == null ? `${home} 부전승` : `${home} vs 원정팀 미정`;
}
```

- [ ] **Step 4: 실행해 통과 확인**

```bash
./node_modules/.bin/vitest run src/lib/league-fixture-meta.test.ts
```

Expected: PASS(기존 테스트 + 신규 5개).

- [ ] **Step 5: 커밋**

```bash
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 리그 팀 미정·부전승 표기 헬퍼 추가" -- apps/v1_web/src/lib/league-fixture-meta.ts apps/v1_web/src/lib/league-fixture-meta.test.ts
GIT_LITERAL_PATHSPECS=1 git show --stat HEAD
```

Expected: 파일 2개.

---

### Task 3: 경기 팀 id nullable + 모든 소비처에 "미정" 반영

**Files:**
- Modify: `apps/v1_web/src/types/league-match.ts` (`V1LeagueFixture` 의 `homeTeamId`·`awayTeamId` 두 줄)
- Modify: `apps/v1_web/src/lib/league-next-action.ts` (`function isPlayable`) · Test: `apps/v1_web/src/lib/league-next-action.test.ts`
- Modify: `apps/v1_web/src/app/league-matches/[leagueId]/fixtures/[fixtureId]/league-fixture-detail-client.tsx` (`headToHead` useMemo, `homeRow`/`awayRow`/`homeName`/`awayName` 선언, 맞대결 목록의 `itemHome`/`itemAway`) · Test: 같은 폴더 `league-fixture-detail-client.test.tsx`
- Modify: `apps/v1_web/src/app/league-matches/[leagueId]/league-match-standings-client.tsx` (`<FixtureTeamLabel teamId={fixture.homeTeamId}` 줄)
- Modify: `apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx` (`homeLabel=`·`awayLabel=` 두 prop, `@/lib/league-fixture-meta` import)
- Modify: `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx` (import 묶음, `matchupLabelOf`, `teamIdsWithGameInProgress`, `rowActions`, `canOpenConsole`, 몰수 모달 `statusOptions` — 위치는 각각 `grep -n` 으로 찾는다) · Test: 같은 폴더 `league-match-fixtures-client.test.tsx`

**Interfaces:**
- Consumes: `leagueSideLabel`, `leagueFixtureMatchupLabel` (Task 2)
- Produces: `V1LeagueFixture.homeTeamId: string | null`, `awayTeamId: string | null` · 어드민 클라이언트 내부 `hasBothTeams(fixture)`

공개 화면은 서버 게이트(PR-5a)가 "자리만 있고 팀이 빈 경기"를 거르므로 실제로 null 홈을 받지는 않는다. 그래도 타입이 좁혀 주지 않으니 각 소비처가 null 을 안전하게 다뤄야 한다.

- [ ] **Step 1: 실패하는 테스트 작성 (3곳)**

(a) `apps/v1_web/src/lib/league-next-action.test.ts` 의 `describe('pickLeagueNextAction', …)` 안, 첫 `it` 바로 위에 추가:

```ts
  it('팀이 비어 있는 자리 경기는 콘솔을 열 수 없으므로 다음 경기로 가리키지 않는다 — 양쪽이 다 찬 경기는 그대로 가리킨다', () => {
    const noTeams = fixture({ startAt: W1, homeTeamId: null, awayTeamId: null });
    const onlyHomeEmpty = fixture({ startAt: W1, homeTeamId: null, awayTeamId: 't2' });
    const ready = fixture({ startAt: W2 });
    const action = pickLeagueNextAction([noTeams, onlyHomeEmpty, ready]);

    expect(action).toMatchObject({ kind: 'next' });
    expect(action?.fixture.teamMatchId).toBe(ready.teamMatchId);
    // 팀이 빈 경기만 있으면 할 일이 없다.
    expect(pickLeagueNextAction([noTeams, onlyHomeEmpty])).toBeNull();
  });
```

(b) `league-fixture-detail-client.test.tsx` 의 `it('예정 경기: …` 바로 앞에 추가:

```tsx
  it('홈 팀이 비어 있는 경기도 깨지지 않고 "홈팀 미정" 으로 읽히며 팀 링크는 없다', () => {
    mockLeague({
      fixtures: [
        { teamMatchId: 'fx-n', title: '3주차', homeTeamId: null, awayTeamId: null, startAt: '2026-09-15T10:00:00.000Z', placeName: '검증장', status: 'matched', homeScore: null, awayScore: null },
        // 같은 쌍 필터가 null 을 만나도 터지지 않는지 — 팀이 다 찬 경기는 맞대결 후보에 남는다.
        ...FIXTURES,
      ],
    });
    mockViewer('none');
    render(<LeagueFixtureDetailClient leagueId="lg-1" fixtureId="fx-n" />);

    expect(screen.getByText('홈팀 미정')).toBeInTheDocument();
    expect(screen.getByText('상대팀 미정')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /팀 상세로 이동/ })).toBeNull();
  });
```

(c) `league-match-fixtures-client.test.tsx` — 같은 describe(`지금 할 일 카드와 콘솔 열기`) 안, `// W4-V14 — 진행 중 경기의 대진을 취소하면` 주석 바로 위에 추가:

```tsx
  // 자리만 있고 팀이 비어 있는 경기 — 팀을 못 정했으니 콘솔·결과·몰수 대상이 아니다.
  it('팀이 비어 있는 자리 경기는 미정으로 읽히고 콘솔 열기·몰수패가 없다 — 양쪽이 다 찬 경기는 그대로다', () => {
    renderLeague([
      { ...base, teamMatchId: 'tm-ready', title: '1주차', startAt: W1 },
      { ...base, teamMatchId: 'tm-empty', title: '2주차', startAt: W2, homeTeamId: null, awayTeamId: null, homeSlotId: 'slot-1', awaySlotId: 'slot-2' },
      { ...base, teamMatchId: 'tm-half', title: '3주차', startAt: W2, awayTeamId: null, awaySlotId: 'slot-4' },
    ]);

    expect(screen.getAllByText('홈팀 미정 vs 원정팀 미정').length).toBeGreaterThan(0);
    expect(screen.getAllByText('마포 FC vs 원정팀 미정').length).toBeGreaterThan(0);
    // 대조군: 팀이 다 찬 1주차만 콘솔을 연다. 자리 경기 둘에는 링크가 없다.
    const consoleLinks = screen.getAllByRole('link', { name: /콘솔 열기/ });
    expect(consoleLinks.length).toBeGreaterThan(0);
    for (const link of consoleLinks) {
      expect(link.getAttribute('href')).toContain('/tm-ready/');
    }

    const emptySheet = openRowMenu('2주차');
    expect(within(emptySheet).getByRole('button', { name: /^일정 수정/ })).toBeInTheDocument();
    expect(within(emptySheet).getByRole('button', { name: /^대진 취소/ })).toBeInTheDocument();
    expect(within(emptySheet).queryByRole('button', { name: /^몰수패 처리/ })).toBeNull();
    fireEvent.click(within(emptySheet).getByRole('button', { name: '닫기' }));

    // 대조군: 팀이 다 찬 경기는 몰수패 항목이 있다.
    expect(within(openRowMenu('1주차')).getByRole('button', { name: /^몰수패 처리/ })).toBeInTheDocument();
  });

```

주의: `openRowMenu('3주차')` 처럼 같은 제목이 겹치지 않게 제목을 모두 다르게 썼다.

- [ ] **Step 2: 실행해 실패 확인**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas/apps/v1_web
./node_modules/.bin/vitest run src/lib/league-next-action.test.ts "src/app/league-matches/[leagueId]/fixtures/[fixtureId]/league-fixture-detail-client.test.tsx" "src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx" -t "비어 있는|미정"
```

Expected: FAIL 3건 — next-action 은 `onlyHomeEmpty` 가 `next` 로 뽑혀 `teamMatchId` 불일치, detail-client 는 `rowByTeam.get(null)`/`pair.has` 경로에서 `홈팀 정보 없음` 이 렌더돼 `getByText('홈팀 미정')` 실패, 어드민은 `홈팀 미정 vs 원정팀 미정` 텍스트 없음.

- [ ] **Step 3: 타입 변경 + tsc 로 영향 범위 확인**

`apps/v1_web/src/types/league-match.ts` `V1LeagueFixture`:

```ts
  homeTeamId: string | null;
  awayTeamId: string | null;
```

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

Expected: FAIL. 에러가 나는 파일은 읽어서 예상한 아래 목록이어야 한다 — 목록에 없는 파일이 나오면 그 파일도 같은 방식으로 고친다(tsc 가 권위):
`league-fixture-detail-client.tsx`(`rowByTeam.get(fixture.homeTeamId)`, `pair`, `item.homeTeamId`), `tournament-detail-client.tsx`(`teamNameById.get(fixture.homeTeamId)`), `league-match-fixtures-client.tsx`(`teamNameById.get(fixture.homeTeamId)`, 몰수 모달 `value: forfeitFixture.homeTeamId`).
(`league-match-standings-client.tsx` 의 `FixtureTeamLabel teamId={fixture.homeTeamId}` 줄은 `FixtureTeamLabel` 이 이미 `string | null` 을 받아 컴파일은 되지만 폴백 문구가 거짓이 되므로 아래에서 고친다. `league-next-action.ts` 는 컴파일되지만 동작이 틀려 고친다.)

- [ ] **Step 4: 소비처 수정**

`apps/v1_web/src/lib/league-next-action.ts`:

```ts
/** 취소·부전승(상대 없음)·팀이 아직 안 정해진 자리 경기는 콘솔이 열리는 경기가 아니다. */
function isPlayable(fixture: V1LeagueFixture): boolean {
  return fixture.status !== 'cancelled' && fixture.homeTeamId !== null && fixture.awayTeamId !== null;
}
```

`league-fixture-detail-client.tsx` — import 줄 `import { fixtureResultLabel } from '@/lib/league-fixture-meta';` 는 그대로 두고, `headToHead` 의 앞 두 줄과 필터를 교체:

```ts
  const headToHead = useMemo(() => {
    if (!series || !fixture || fixture.homeTeamId === null || fixture.awayTeamId === null) return [];
    const pair = new Set([fixture.homeTeamId, fixture.awayTeamId]);
    return series.fixtures
      .filter((item) =>
        item.teamMatchId !== fixture.teamMatchId &&
        item.homeTeamId !== null &&
        item.awayTeamId !== null &&
        pair.has(item.homeTeamId) &&
        pair.has(item.awayTeamId) &&
        item.status !== 'cancelled' &&
        typeof item.homeScore === 'number' &&
        typeof item.awayScore === 'number')
```

(`.sort(...).slice(0, 3)` 이하는 그대로.) `homeRow`/`awayRow`/이름 4줄:

```ts
  const homeRow = fixture.homeTeamId !== null ? rowByTeam.get(fixture.homeTeamId) : undefined;
  const awayRow = fixture.awayTeamId !== null ? rowByTeam.get(fixture.awayTeamId) : undefined;
  const homeName = fixture.homeTeamId === null ? '홈팀 미정' : homeRow?.teamName ?? '홈팀 정보 없음';
  const awayName = fixture.awayTeamId === null ? '상대팀 미정' : awayRow?.teamName ?? '상대팀 정보 없음';
```

맞대결 목록의 두 줄(`itemHome`, `itemAway`):

```tsx
              const itemHome = item.homeTeamId !== null ? rowByTeam.get(item.homeTeamId)?.teamName ?? '홈팀' : '홈팀';
              const itemAway = item.awayTeamId !== null ? rowByTeam.get(item.awayTeamId)?.teamName ?? '상대팀' : '상대팀';
```

`league-match-standings-client.tsx`(`grep -n "FixtureTeamLabel teamId={fixture.homeTeamId}"`):

```tsx
                      <FixtureTeamLabel teamId={fixture.homeTeamId} lookup={teamLookup} fallback={fixture.homeTeamId === null ? '홈팀 미정' : '홈팀 정보 없음'} />
```

`tournament-detail-client.tsx` — 기존 `@/lib/...` import 묶음(`grep -n "prize-breakdown"` 로 찾은 줄 다음)에 추가하고

```ts
import { leagueSideLabel } from '@/lib/league-fixture-meta';
```

`homeLabel=`·`awayLabel=` 두 prop(`grep -n "teamNameById.get(fixture.homeTeamId)"` 로 찾는다)을 교체:

```tsx
                    homeLabel={leagueSideLabel(fixture.homeTeamId, teamNameById, { tbd: '홈팀 미정', unknown: '홈팀 정보 없음' })}
                    awayLabel={leagueSideLabel(fixture.awayTeamId, teamNameById, { tbd: '상대팀 미정', unknown: '상대팀 정보 없음' })}
```

`league-match-fixtures-client.tsx`:

1. import(`describeLeagueRegistrationWindow` import 줄 아래)에 `import { leagueFixtureMatchupLabel } from '@/lib/league-fixture-meta';`
2. `isFixtureGameInProgress` 함수 아래에 추가:

```ts
/** 양쪽 팀이 모두 정해진 경기만 콘솔·결과·몰수 대상이다. 자리만 있고 팀이 빈 경기는 아직 치를 수 없다. */
function hasBothTeams(fixture: V1LeagueFixture): boolean {
  return fixture.homeTeamId !== null && fixture.awayTeamId !== null;
}
```

3. `matchupLabelOf` 전체(6줄)를 교체:

```ts
  const matchupLabelOf = (fixture: V1LeagueFixture) => leagueFixtureMatchupLabel(fixture, teamNameById);
```

4. `teamIdsWithGameInProgress`:

```ts
  const teamIdsWithGameInProgress = new Set(
    inProgressFixtures.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId]).filter((id): id is string => id !== null),
  );
```

5. `rowActions` 의 두 조건: `if (row.awayTeamId !== null && stage !== 'not_entered') {` → `if (hasBothTeams(row) && stage !== 'not_entered') {`, `if (row.status === 'matched' && row.awayTeamId !== null) {` → `if (row.status === 'matched' && hasBothTeams(row)) {`
6. `const canOpenConsole = row.status !== 'cancelled' && row.awayTeamId !== null;` → `const canOpenConsole = row.status !== 'cancelled' && hasBothTeams(row);`
7. 몰수 모달 `statusOptions` 를 교체:

```tsx
        statusOptions={
          forfeitFixture && forfeitFixture.homeTeamId !== null
            ? [
                { value: forfeitFixture.homeTeamId, label: `${forfeitHostTeam.data?.name ?? '홈팀'} 불참` },
                ...(forfeitFixture.awayTeamId
                  ? [{ value: forfeitFixture.awayTeamId, label: `${forfeitAwayTeam.data?.name ?? '원정팀'} 불참` }]
                  : []),
              ]
            : []
        }
```

- [ ] **Step 5: 타입·테스트 통과 확인**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/vitest run src/lib/league-next-action.test.ts src/lib/league-fixture-meta.test.ts "src/app/league-matches/[leagueId]/fixtures/[fixtureId]/league-fixture-detail-client.test.tsx" "src/app/league-matches/[leagueId]/league-match-standings-client.test.tsx" "src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx" "src/app/tournaments/[id]/tournament-detail-client.test.ts"
```

Expected: tsc 에러 0, 위 테스트 전부 PASS(기존 포함 — 부전승 행 테스트 `사자FC 부전승` 이 그대로 통과해야 한다).

- [ ] **Step 6: 커밋**

```bash
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 리그 경기 팀 id nullable 및 소비처 미정 처리" -- apps/v1_web/src/types/league-match.ts apps/v1_web/src/lib/league-next-action.ts apps/v1_web/src/lib/league-next-action.test.ts "apps/v1_web/src/app/league-matches/[leagueId]/fixtures/[fixtureId]/league-fixture-detail-client.tsx" "apps/v1_web/src/app/league-matches/[leagueId]/fixtures/[fixtureId]/league-fixture-detail-client.test.tsx" "apps/v1_web/src/app/league-matches/[leagueId]/league-match-standings-client.tsx" "apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx" "apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx" "apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx"
GIT_LITERAL_PATHSPECS=1 git show --stat HEAD
```

Expected: 파일 9개, 다른 세션 파일 없음.

---

### Task 4: `useV1ApplyLeagueTemplate` 훅

**Files:**
- Modify: `apps/v1_web/src/hooks/use-v1-bracket-canvas.ts` (파일 끝에 추가, 필요한 import 보강)
- Test: `apps/v1_web/src/hooks/use-v1-bracket-canvas.league-template.test.tsx` (신규)

**Interfaces:**
- Consumes: `v1Post` (`@/lib/api-client`), `v1Keys.adminLeagueMatch/adminLeagueMatchList/leagueMatches/leagueMatch/tournament` (`@/lib/query-keys`, 기존), `V1ApplyLeagueTemplatePayload/Result` (Task 1)
- Produces: `useV1ApplyLeagueTemplate(leagueId: string)` → `UseMutationResult<V1ApplyLeagueTemplateResult, Error, V1ApplyLeagueTemplatePayload>`

`adminLeagueMatch(leagueId)` 키는 `adminLeagueTeams(leagueId)` 의 접두사라(`lib/query-keys.ts` 의 `adminLeagueMatch`·`adminLeagueTeams` 정의) 하나만 무효화해도 참가팀 목록이 함께 새로고침된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/v1_web/src/hooks/use-v1-bracket-canvas.league-template.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { v1Post } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { V1ApplyLeagueTemplatePayload } from '@/types/league-match';
import { useV1ApplyLeagueTemplate } from './use-v1-bracket-canvas';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Post: vi.fn() };
});

const v1PostMock = vi.mocked(v1Post);

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const PAYLOAD: V1ApplyLeagueTemplatePayload = {
  teamCount: 4,
  legs: 2,
  schedule: { dates: ['2030-01-07', '2030-01-14'], time: '19:00' },
};

describe('useV1ApplyLeagueTemplate', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('본문을 그대로 리그 템플릿 경로에 보내고 어드민·공개 리그 화면을 새로고침한다', async () => {
    v1PostMock.mockResolvedValue({ slots: 4, fixtures: 12 });
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useV1ApplyLeagueTemplate('league-1'), { wrapper });

    result.current.mutate({ ...PAYLOAD, replaceExisting: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(v1PostMock).toHaveBeenCalledWith('/admin/league-matches/league-1/fixtures/template', {
      ...PAYLOAD,
      replaceExisting: true,
    });
    expect(result.current.data).toEqual({ slots: 4, fixtures: 12 });
    for (const queryKey of [
      v1Keys.adminLeagueMatch('league-1'),
      v1Keys.adminLeagueMatchList(),
      v1Keys.leagueMatches(),
      v1Keys.leagueMatch('league-1'),
      v1Keys.tournament('league-1'),
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
    }
  });

  it('replaceExisting 을 안 주면 본문에 그 키가 없다 — 서버 DTO 는 모르는 키를 400 으로 거부한다', async () => {
    v1PostMock.mockResolvedValue({ slots: 4, fixtures: 12 });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useV1ApplyLeagueTemplate('league-1'), { wrapper });

    result.current.mutate(PAYLOAD);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(Object.keys(v1PostMock.mock.calls[0][1] as object)).toEqual(['teamCount', 'legs', 'schedule']);
  });

  it('서버가 거부하면 아무 화면도 새로고침하지 않는다 — 만들어지지 않은 대진을 다시 읽을 이유가 없다', async () => {
    v1PostMock.mockRejectedValue(new Error('LEAGUE_FIXTURES_EXIST'));
    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useV1ApplyLeagueTemplate('league-1'), { wrapper });

    result.current.mutate(PAYLOAD);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas/apps/v1_web
./node_modules/.bin/vitest run src/hooks/use-v1-bracket-canvas.league-template.test.tsx
```

Expected: FAIL — `useV1ApplyLeagueTemplate is not a function`.

- [ ] **Step 3: 최소 구현**

먼저 이미 있는 import 를 확인한다.

```bash
grep -n "useMutation\|useQueryClient\|v1Post\|v1Keys\|V1ApplyLeagueTemplate" src/hooks/use-v1-bracket-canvas.ts | head
```

없는 것만 파일 맨 위 import 에 추가한다: `import { useMutation, useQueryClient } from '@tanstack/react-query';`, `import { v1Post } from '@/lib/api-client';`, `import { v1Keys } from '@/lib/query-keys';`, `import type { V1ApplyLeagueTemplatePayload, V1ApplyLeagueTemplateResult } from '@/types/league-match';`

파일 끝에 추가:

```ts
/** 정규 리그 템플릿으로 빈 경기·자리를 한 번에 만든다. */
export function useV1ApplyLeagueTemplate(leagueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: V1ApplyLeagueTemplatePayload) =>
      v1Post<V1ApplyLeagueTemplateResult>(`/admin/league-matches/${encodeURIComponent(leagueId)}/fixtures/template`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: v1Keys.adminLeagueMatch(leagueId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.adminLeagueMatchList() });
      queryClient.invalidateQueries({ queryKey: v1Keys.leagueMatches() });
      queryClient.invalidateQueries({ queryKey: v1Keys.leagueMatch(leagueId) });
      queryClient.invalidateQueries({ queryKey: v1Keys.tournament(leagueId) });
    },
  });
}
```

- [ ] **Step 4: 실행해 통과 확인**

```bash
./node_modules/.bin/vitest run src/hooks/use-v1-bracket-canvas.league-template.test.tsx
```

Expected: PASS 3건.

- [ ] **Step 5: 커밋**

```bash
GIT_LITERAL_PATHSPECS=1 git add apps/v1_web/src/hooks/use-v1-bracket-canvas.league-template.test.tsx
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 리그 템플릿 적용 훅 추가" -- apps/v1_web/src/hooks/use-v1-bracket-canvas.ts apps/v1_web/src/hooks/use-v1-bracket-canvas.league-template.test.tsx
GIT_LITERAL_PATHSPECS=1 git show --stat HEAD
```

Expected: 파일 2개.

---

### Task 5: 보드 모델 순수 함수 — `buildLeagueBoard`

**Files:**
- Create: `apps/v1_web/src/lib/league-board-model.ts`
- Test: `apps/v1_web/src/lib/league-board-model.test.ts`

**Interfaces:**
- Consumes: `fixtureNodeState` (`@/lib/bracket-canvas-layout`, PR-3), `toKstDateString` (`@/lib/kst-calendar`), `V1LeagueFixture`, `V1AdminBracketSlot`, `V1AdminBracketFixtureGame`
- Produces:

```ts
export type LeagueBoardNodeState = ReturnType<typeof fixtureNodeState>;
export interface LeagueBoardSide { slotId: string | null; label: string; filled: boolean; registrationId: string | null }
export interface LeagueBoardNode {
  fixtureId: string; title: string; startAt: string; placeName: string;
  state: LeagueBoardNodeState; hiddenFromPublic: boolean;
  home: LeagueBoardSide; away: LeagueBoardSide; game: V1AdminBracketFixtureGame | null;
}
export interface LeagueBoardColumn { key: string; weekNumber: number; nodes: LeagueBoardNode[] }   // key = KST 'YYYY-MM-DD', weekNumber = 열 순번(1부터, 공개 화면 'N주차' 와 같은 셈법)
export interface LeagueBoardSummary { slotCount: number; filledSlotCount: number; hiddenFixtureCount: number; hasEmptySlot: boolean }
export function buildLeagueBoard(input: { fixtures: readonly V1LeagueFixture[]; slots: readonly V1AdminBracketSlot[]; teamNameById: ReadonlyMap<string, string> }): { columns: LeagueBoardColumn[]; summary: LeagueBoardSummary }
```

규칙(코드로 고정): 열 = 경기 시작의 KST 날짜(오름차순), 열 안 = 시작 시각 → 제목 순. 사이드 라벨 = 팀이 있으면 `slot.teamName ?? 이름 맵 ?? '팀'`, 팀이 없으면 자리 라벨, 자리도 없으면 홈 `미정`/원정 `부전승`. `hiddenFromPublic` 는 서버 공개 게이트(색인 `excludeUnfilledSlotFixturesWhere`)와 같은 술어다: `(homeSlotId != null ∧ homeTeamId == null) ∨ (awaySlotId != null ∧ awayTeamId == null)`, 취소 경기는 제외(서버가 취소 시 자리 연결을 푼다).

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/v1_web/src/lib/league-board-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { V1AdminBracketFixtureGame, V1AdminBracketSlot } from '@/types/api';
import type { V1LeagueFixture } from '@/types/league-match';
import { fixtureNodeState } from './bracket-canvas-layout';
import { buildLeagueBoard } from './league-board-model';

function fixture(overrides: Partial<V1LeagueFixture> & { teamMatchId: string }): V1LeagueFixture {
  return {
    title: '가을 리그 1주차',
    homeTeamId: 't1',
    awayTeamId: 't2',
    startAt: '2030-01-07T10:00:00.000Z',
    placeName: '장소 미정',
    status: 'matched',
    ...overrides,
  };
}

function slot(overrides: Partial<V1AdminBracketSlot> & { id: string }): V1AdminBracketSlot {
  return {
    kind: 'ENTRY',
    groupId: null,
    sourceGroupId: null,
    position: 1,
    label: '1번 자리',
    registrationId: null,
    teamName: null,
    ...overrides,
  };
}

const NAMES = new Map([['t1', '독수리FC'], ['t2', '호랑이FC']]);

const SLOTS = [
  slot({ id: 's1', position: 1, label: '1번 자리' }),
  slot({ id: 's2', position: 2, label: '2번 자리' }),
  slot({ id: 's3', position: 3, label: '3번 자리', registrationId: 'r3', teamName: '사자FC' }),
];

describe('buildLeagueBoard', () => {
  it('경기를 KST 날짜 열로 묶고 열·열 안을 시간 순으로 정렬한다 — 자정 직전 UTC 도 다음 KST 날짜로 간다', () => {
    const { columns } = buildLeagueBoard({
      fixtures: [
        fixture({ teamMatchId: 'late', startAt: '2030-01-14T10:00:00.000Z' }),
        // 2030-01-07T16:00Z = KST 2030-01-08 01:00 — UTC 날짜로 묶으면 1/7 열에 잘못 들어간다.
        fixture({ teamMatchId: 'kst-next-day', startAt: '2030-01-07T16:00:00.000Z' }),
        fixture({ teamMatchId: 'b', startAt: '2030-01-07T11:00:00.000Z' }),
        fixture({ teamMatchId: 'a', startAt: '2030-01-07T10:00:00.000Z' }),
      ],
      slots: [],
      teamNameById: NAMES,
    });

    expect(columns.map((column) => column.key)).toEqual(['2030-01-07', '2030-01-08', '2030-01-14']);
    expect(columns[0].nodes.map((node) => node.fixtureId)).toEqual(['a', 'b']);
    expect(columns[1].nodes.map((node) => node.fixtureId)).toEqual(['kst-next-day']);
    // 주차 = 경기일 순번 — 공개 화면의 leagueWeekNumbers 와 같은 셈법이라 빈 날짜는 건너뛰지 않고 1,2,3.
    expect(columns.map((column) => column.weekNumber)).toEqual([1, 2, 3]);
  });

  it('사이드 라벨: 팀이 있으면 이름, 자리만 있으면 자리 라벨, 자리도 없는 원정은 부전승', () => {
    const { columns } = buildLeagueBoard({
      fixtures: [
        fixture({ teamMatchId: 'filled', homeTeamId: 't1', awayTeamId: 't2', homeSlotId: 's1', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'empty', homeTeamId: null, awayTeamId: null, homeSlotId: 's1', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'slot-team', homeTeamId: 't9', awayTeamId: null, homeSlotId: 's3', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'legacy-bye', homeTeamId: 't1', awayTeamId: null }),
      ],
      slots: SLOTS,
      teamNameById: NAMES,
    });
    const byId = new Map(columns.flatMap((column) => column.nodes).map((node) => [node.fixtureId, node]));

    expect([byId.get('filled')!.home.label, byId.get('filled')!.away.label]).toEqual(['독수리FC', '호랑이FC']);
    expect([byId.get('empty')!.home.label, byId.get('empty')!.away.label]).toEqual(['1번 자리', '2번 자리']);
    expect(byId.get('empty')!.home).toMatchObject({ slotId: 's1', filled: false, registrationId: null });
    // 자리에 이미 팀 이름이 있으면 이름 맵보다 그것을 쓴다(자리가 정본).
    expect(byId.get('slot-team')!.home).toMatchObject({ label: '사자FC', filled: true, registrationId: 'r3' });
    expect(byId.get('legacy-bye')!.away).toMatchObject({ label: '부전승', slotId: null, filled: false });
  });

  it('공개 대기는 자리 경기에서 한쪽이라도 팀이 비었을 때만 — 다 찬 경기·자리 없는 기존 경기·취소 경기는 아니다', () => {
    const { columns, summary } = buildLeagueBoard({
      fixtures: [
        fixture({ teamMatchId: 'both-empty', homeTeamId: null, awayTeamId: null, homeSlotId: 's1', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'half', homeTeamId: 't1', awayTeamId: null, homeSlotId: 's3', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'full', homeSlotId: 's1', awaySlotId: 's2' }),
        fixture({ teamMatchId: 'legacy-bye', homeTeamId: 't1', awayTeamId: null }),
        fixture({ teamMatchId: 'cancelled', status: 'cancelled', homeTeamId: null, awayTeamId: null, homeSlotId: null, awaySlotId: null }),
      ],
      slots: SLOTS,
      teamNameById: NAMES,
    });
    const hidden = columns.flatMap((column) => column.nodes).filter((node) => node.hiddenFromPublic).map((node) => node.fixtureId);

    expect(hidden.sort()).toEqual(['both-empty', 'half']);
    expect(summary.hiddenFixtureCount).toBe(2);
  });

  it('상태 태그: 취소는 game 이 뭐든 cancelled, 나머지는 PR-3 의 fixtureNodeState 와 같다', () => {
    const game: V1AdminBracketFixtureGame = {
      id: 'g1',
      state: 'ENDED',
      version: 3,
      hasLiveRecords: false,
      latestRevision: { id: 'rev1', state: 'OFFICIAL', score: { home: 2, away: 1 }, entryMethod: 'quick' },
    };
    const { columns } = buildLeagueBoard({
      fixtures: [
        fixture({ teamMatchId: 'official', game }),
        // 리그 취소는 게임을 SCHEDULED 로 남긴다 — game 만 보면 예정으로 읽힌다.
        fixture({ teamMatchId: 'cancelled', status: 'cancelled', game: null }),
        fixture({ teamMatchId: 'no-game', game: null }),
      ],
      slots: [],
      teamNameById: NAMES,
    });
    const byId = new Map(columns.flatMap((column) => column.nodes).map((node) => [node.fixtureId, node]));

    expect(byId.get('official')!.state).toBe(fixtureNodeState(game));
    expect(byId.get('cancelled')!.state).toBe('cancelled');
    expect(byId.get('no-game')!.state).toBe(fixtureNodeState(null));
  });

  it('요약: 자리 수·배정 수·빈 자리 유무', () => {
    expect(buildLeagueBoard({ fixtures: [], slots: SLOTS, teamNameById: NAMES }).summary).toEqual({
      slotCount: 3,
      filledSlotCount: 1,
      hiddenFixtureCount: 0,
      hasEmptySlot: true,
    });
    const allFilled = SLOTS.map((s) => ({ ...s, registrationId: `r-${s.id}`, teamName: s.id }));
    expect(buildLeagueBoard({ fixtures: [], slots: allFilled, teamNameById: NAMES }).summary.hasEmptySlot).toBe(false);
    // 자리가 없는 리그(기존 방식)는 빈 자리도 없다 — 무작위 채우기 버튼의 근거.
    expect(buildLeagueBoard({ fixtures: [], slots: [], teamNameById: NAMES }).summary.hasEmptySlot).toBe(false);
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

```bash
./node_modules/.bin/vitest run src/lib/league-board-model.test.ts
```

Expected: FAIL — `Failed to resolve import "./league-board-model"`.

- [ ] **Step 3: 최소 구현**

`apps/v1_web/src/lib/league-board-model.ts`:

```ts
import type { V1AdminBracketFixtureGame, V1AdminBracketSlot } from '@/types/api';
import type { V1LeagueFixture } from '@/types/league-match';
import { fixtureNodeState } from './bracket-canvas-layout';
import { toKstDateString } from './kst-calendar';

export type LeagueBoardNodeState = ReturnType<typeof fixtureNodeState>;

export interface LeagueBoardSide {
  slotId: string | null;
  label: string;
  filled: boolean;
  registrationId: string | null;
}

export interface LeagueBoardNode {
  fixtureId: string;
  title: string;
  startAt: string;
  placeName: string;
  state: LeagueBoardNodeState;
  /** 서버 공개 게이트와 같은 술어 — 자리에 연결됐는데 팀이 빈 사이드가 있으면 공개 화면에 아직 안 나간다. */
  hiddenFromPublic: boolean;
  home: LeagueBoardSide;
  away: LeagueBoardSide;
  game: V1AdminBracketFixtureGame | null;
}

/** key 는 경기 시작의 KST 달력 날짜(`YYYY-MM-DD`), weekNumber 는 날짜 오름차순 순번(1부터). */
export interface LeagueBoardColumn {
  key: string;
  weekNumber: number;
  nodes: LeagueBoardNode[];
}

export interface LeagueBoardSummary {
  slotCount: number;
  filledSlotCount: number;
  hiddenFixtureCount: number;
  hasEmptySlot: boolean;
}

interface BuildInput {
  fixtures: readonly V1LeagueFixture[];
  slots: readonly V1AdminBracketSlot[];
  teamNameById: ReadonlyMap<string, string>;
}

function buildSide(
  side: 'home' | 'away',
  teamId: string | null,
  slotId: string | null | undefined,
  slotById: ReadonlyMap<string, V1AdminBracketSlot>,
  teamNameById: ReadonlyMap<string, string>,
): LeagueBoardSide {
  const slot = slotId == null ? undefined : slotById.get(slotId);
  const resolvedSlotId = slot?.id ?? null;
  if (teamId !== null) {
    return {
      slotId: resolvedSlotId,
      label: slot?.teamName ?? teamNameById.get(teamId) ?? '팀',
      filled: true,
      registrationId: slot?.registrationId ?? null,
    };
  }
  // 자리 없이 원정이 비면 예전부터 있던 부전(bye) 경기다.
  return {
    slotId: resolvedSlotId,
    label: slot?.label ?? (side === 'home' ? '미정' : '부전승'),
    filled: false,
    registrationId: null,
  };
}

export function buildLeagueBoard({ fixtures, slots, teamNameById }: BuildInput): {
  columns: LeagueBoardColumn[];
  summary: LeagueBoardSummary;
} {
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const columnsByKey = new Map<string, LeagueBoardNode[]>();

  for (const fixture of fixtures) {
    const cancelled = fixture.status === 'cancelled';
    const game = fixture.game ?? null;
    const node: LeagueBoardNode = {
      fixtureId: fixture.teamMatchId,
      title: fixture.title,
      startAt: fixture.startAt,
      placeName: fixture.placeName,
      state: cancelled ? 'cancelled' : fixtureNodeState(game),
      hiddenFromPublic:
        !cancelled &&
        ((fixture.homeSlotId != null && fixture.homeTeamId === null) ||
          (fixture.awaySlotId != null && fixture.awayTeamId === null)),
      home: buildSide('home', fixture.homeTeamId, fixture.homeSlotId, slotById, teamNameById),
      away: buildSide('away', fixture.awayTeamId, fixture.awaySlotId, slotById, teamNameById),
      game,
    };
    const key = toKstDateString(new Date(fixture.startAt));
    const column = columnsByKey.get(key);
    if (column === undefined) columnsByKey.set(key, [node]);
    else column.push(node);
  }

  const columns = [...columnsByKey.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, nodes], index) => ({
      key,
      weekNumber: index + 1,
      nodes: nodes.sort((left, right) => left.startAt.localeCompare(right.startAt) || left.title.localeCompare(right.title)),
    }));

  const filledSlotCount = slots.filter((slot) => slot.registrationId !== null).length;
  return {
    columns,
    summary: {
      slotCount: slots.length,
      filledSlotCount,
      hiddenFixtureCount: columns.reduce((sum, column) => sum + column.nodes.filter((node) => node.hiddenFromPublic).length, 0),
      hasEmptySlot: filledSlotCount < slots.length,
    },
  };
}
```

- [ ] **Step 4: 실행해 통과 확인**

```bash
./node_modules/.bin/vitest run src/lib/league-board-model.test.ts
```

Expected: PASS 5건. (`startAt` 문자열 비교는 모두 `Z` ISO 라 시간 순과 같다 — 서버가 항상 ISO UTC 로 내린다.)

- [ ] **Step 5: 커밋**

```bash
GIT_LITERAL_PATHSPECS=1 git add apps/v1_web/src/lib/league-board-model.ts apps/v1_web/src/lib/league-board-model.test.ts
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 리그 일정 보드 모델 순수 함수 추가" -- apps/v1_web/src/lib/league-board-model.ts apps/v1_web/src/lib/league-board-model.test.ts
GIT_LITERAL_PATHSPECS=1 git show --stat HEAD
```

Expected: 파일 2개.

---

### Task 6: `LeagueFixturePanel` — 리그 경기 상세 패널 (PR-3 결과 컴포넌트 재사용)

PR-3 의 `BracketNodePanel` 은 토너먼트 전용이다(`tournamentId`·`V1AdminBracketFixture`·`useV1UpdateFixture`/`useV1DeleteFixture` 를 직접 쓴다). 리그 경기는 `V1LeagueFixture`(팀매치)이고 일정 수정·취소가 기존 리그 모달이라 그대로 끼울 수 없다. 그래서 같은 구역(팀 자리·결과·일정)을 갖는 리그 패널을 만들되, 결과 구역은 PR-3 의 `BracketQuickResultForm`·`BracketResultActions` 와 훅 `useV1QuickResult(leagueId, 'league')` 를 그대로 쓴다.

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/league-fixture-panel.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/league-fixture-panel.test.tsx`

**Interfaces:**
- Consumes: `LeagueBoardNode`(Task 5) · `useV1AssignTournamentSlot`, `useV1QuickResult` (`@/hooks/use-v1-bracket-canvas`) · `BracketQuickResultForm`, `BracketResultActions` (같은 폴더) · `describeBracketCanvasError` (`@/lib/bracket-canvas-errors`) · `v1Keys.adminLeagueMatch`
- Produces:

```ts
export interface LeagueFixturePanelProps {
  leagueId: string;
  node: LeagueBoardNode;
  slots: V1AdminBracketSlot[];
  registrations: V1AdminTournamentRegistration[];
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onEditSchedule: () => void;
  onCancelFixture: () => void;
  onClose: () => void;
}
export function LeagueFixturePanel(props: LeagueFixturePanelProps): JSX.Element
```

규칙: 잠금(`SLOT_LOCKED`) 판정은 서버와 같다 — 게임이 예정이고 결과가 없을 때만 자리를 바꿀 수 있다. 정정·무효·확정 훅은 결과 검토 캐시만 비우므로(`use-tournament-result-review.ts` 의 정정·무효·확정 훅 `onSuccess`), 패널이 성공 토스트를 가로채 `adminLeagueMatch` 를 함께 무효화한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/v1_web/src/components/admin/bracket-canvas/league-fixture-panel.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLeagueBoard, type LeagueBoardNode } from '@/lib/league-board-model';
import { v1Keys } from '@/lib/query-keys';
import { makeGame, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixtureGame } from '@/types/api';
import type { V1LeagueFixture } from '@/types/league-match';
import { LeagueFixturePanel, type LeagueFixturePanelProps } from './league-fixture-panel';

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  quick: vi.fn(),
  formProps: [] as Array<Record<string, unknown>>,
  resultProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutate: mocks.assign, isPending: false }),
  useV1QuickResult: () => ({ mutate: mocks.quick, isPending: false }),
}));

// 점수 입력 폼과 결과 동작의 내부는 PR-3 테스트가 지킨다 — 여기서는 리그 패널이 넘기는 값과 반응만 본다.
vi.mock('./bracket-quick-result-form', () => ({
  BracketQuickResultForm: (props: { onSubmit: (score: { home: number; away: number }) => void }) => {
    mocks.formProps.push(props);
    return <button type="button" onClick={() => props.onSubmit({ home: 2, away: 1 })}>점수 확정 폼</button>;
  },
}));
vi.mock('./bracket-result-actions', () => ({
  BracketResultActions: (props: { showToast: (message: string, variant?: 'success' | 'error') => void }) => {
    mocks.resultProps.push(props);
    return (
      <div data-testid="result-actions">
        <button type="button" onClick={() => props.showToast('점수를 고쳤어요.', 'success')}>성공 신호</button>
        <button type="button" onClick={() => props.showToast('고치지 못했어요.', 'error')}>실패 신호</button>
      </div>
    );
  },
}));

const REGISTRATIONS = [
  makeRegistration({ id: 'r1', teamName: '독수리FC' }),
  makeRegistration({ id: 'r2', teamName: '호랑이FC' }),
  makeRegistration({ id: 'r3', teamName: '사자FC' }),
  makeRegistration({ id: 'r9', teamName: '입금 대기 팀', status: 'pending' }),
];
const SLOTS = [
  makeSlot({ id: 's1', position: 1, label: '1번 자리' }),
  makeSlot({ id: 's2', position: 2, label: '2번 자리' }),
  makeSlot({ id: 's3', position: 3, label: '3번 자리', registrationId: 'r3', teamName: '사자FC' }),
];

function nodeOf(overrides: Partial<V1LeagueFixture> = {}): LeagueBoardNode {
  const fixture: V1LeagueFixture = {
    teamMatchId: 'fx-1', title: '1주차', homeTeamId: null, awayTeamId: null, homeSlotId: 's1', awaySlotId: 's2',
    startAt: '2030-01-07T10:00:00.000Z', placeName: '망원 유수지', status: 'matched', game: null, ...overrides,
  };
  const { columns } = buildLeagueBoard({ fixtures: [fixture], slots: SLOTS, teamNameById: new Map([['t1', '독수리FC'], ['t2', '호랑이FC']]) });
  return columns[0].nodes[0];
}

const showToast = vi.fn();
const onEditSchedule = vi.fn();
const onCancelFixture = vi.fn();
const onClose = vi.fn();
let queryClient: QueryClient;

function renderPanel(node: LeagueBoardNode, overrides: Partial<LeagueFixturePanelProps> = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <LeagueFixturePanel
        leagueId="league-1"
        node={node}
        slots={SLOTS}
        registrations={REGISTRATIONS}
        canWrite
        showToast={showToast}
        onEditSchedule={onEditSchedule}
        onCancelFixture={onCancelFixture}
        onClose={onClose}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

const READY_GAME: V1AdminBracketFixtureGame = makeGame({ id: 'g1', version: 3 });
const OFFICIAL_GAME: V1AdminBracketFixtureGame = makeGame({
  id: 'g1', state: 'ENDED', version: 4,
  latestRevision: { id: 'rev1', state: 'OFFICIAL', score: { home: 2, away: 1 }, entryMethod: 'quick' },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.formProps.length = 0;
  mocks.resultProps.length = 0;
  queryClient = new QueryClient();
});

describe('LeagueFixturePanel — 팀 자리', () => {
  it('자리가 있고 시작 전이면 확정 팀 중 아직 자리에 없는 팀만 고를 수 있고, 고르면 그 자리에 배정한다', () => {
    renderPanel(nodeOf());

    const select = screen.getByRole('combobox', { name: '홈 팀 선택' });
    const options = Array.from(select.querySelectorAll('option')).map((option) => option.textContent);
    // r3(사자FC)는 s3 에 이미 있고 r9 는 확정이 아니다.
    expect(options).toEqual(['비워 두기', '독수리FC', '호랑이FC']);

    mocks.assign.mockImplementation((_vars: unknown, handlers: { onSuccess: () => void }) => handlers.onSuccess());
    fireEvent.change(select, { target: { value: 'r1' } });
    expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's1', registrationId: 'r1' }, expect.any(Object));
    expect(showToast).toHaveBeenCalledWith('팀을 넣었어요.', 'success');
  });

  it('이미 들어간 팀은 그 자리의 선택지에 남고, 비워 두기는 null 로 보낸다', () => {
    renderPanel(nodeOf({ homeTeamId: 't3', homeSlotId: 's3' }));

    const select = screen.getByRole('combobox', { name: '홈 팀 선택' });
    expect(select).toHaveValue('r3');
    fireEvent.change(select, { target: { value: '' } });
    expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's3', registrationId: null }, expect.any(Object));
  });

  it('배정이 거부되면 서버 사유를 오류 토스트로 보인다', () => {
    mocks.assign.mockImplementation((_vars: unknown, handlers: { onError: (error: unknown) => void }) =>
      handlers.onError(new Error('이미 다른 자리에 들어간 팀이에요.')));
    renderPanel(nodeOf());

    fireEvent.change(screen.getByRole('combobox', { name: '원정 팀 선택' }), { target: { value: 'r2' } });
    expect(showToast).toHaveBeenCalledWith('이미 다른 자리에 들어간 팀이에요.', 'error');
  });

  it('시작했거나 결과가 있는 경기는 팀을 못 바꾼다고 안내한다 — 시작 전 경기에는 선택창이 있다(대조)', () => {
    const { unmount } = renderPanel(nodeOf({ game: OFFICIAL_GAME }));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getAllByText('경기가 시작됐거나 결과가 있어 팀을 바꿀 수 없어요.')).toHaveLength(2);
    unmount();

    renderPanel(nodeOf({ game: READY_GAME }));
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('자리 없이 만든 기존 경기는 여기서 팀을 바꾸지 않는다', () => {
    renderPanel(nodeOf({ homeTeamId: 't1', awayTeamId: 't2', homeSlotId: null, awaySlotId: null }));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getAllByText('자리 없이 만든 경기예요.')).toHaveLength(2);
  });
});

describe('LeagueFixturePanel — 결과', () => {
  const TEAMS_FILLED = { homeTeamId: 't1', awayTeamId: 't2' };

  it('양쪽 팀이 정해진 시작 전 경기는 점수 폼을 열고, 제출하면 게임 id·버전과 함께 빠른 결과를 보낸다', () => {
    mocks.quick.mockImplementation((_vars: unknown, handlers: { onSuccess: () => void }) => handlers.onSuccess());
    renderPanel(nodeOf({ ...TEAMS_FILLED, game: READY_GAME }));

    expect(mocks.formProps[0]).toMatchObject({ isKnockout: false, submitLabel: '점수 확정' });
    fireEvent.click(screen.getByRole('button', { name: '점수 확정 폼' }));

    expect(mocks.quick).toHaveBeenCalledWith({ gameId: 'g1', expectedVersion: 3, score: { home: 2, away: 1 } }, expect.any(Object));
    expect(showToast).toHaveBeenCalledWith('점수를 확정했어요.', 'success');
  });

  it('빠른 결과가 거부되면 폼 아래에 사유를 남기고 폼을 유지한다 — 명단 동기화 중이면 다시 시도 안내', () => {
    mocks.quick.mockImplementation((_vars: unknown, handlers: { onError: (error: unknown) => void }) =>
      handlers.onError(new Error('명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.')));
    renderPanel(nodeOf({ ...TEAMS_FILLED, game: READY_GAME }));

    fireEvent.click(screen.getByRole('button', { name: '점수 확정 폼' }));

    expect(mocks.formProps[mocks.formProps.length - 1]).toMatchObject({ errorMessage: '명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.' });
  });

  it('팀이 비어 있으면 점수 폼 대신 안내만 보인다', () => {
    renderPanel(nodeOf({ game: READY_GAME }));
    expect(screen.getByText('양쪽 팀이 정해지면 점수를 넣을 수 있어요.')).toBeInTheDocument();
    expect(mocks.formProps).toHaveLength(0);
  });

  it('라이브 득점 기록이 있으면 정정 화면으로 보내고, 진행 중이면 콘솔로 보낸다', () => {
    const { unmount } = renderPanel(nodeOf({ ...TEAMS_FILLED, game: makeGame({ id: 'g1', hasLiveRecords: true }) }));
    expect(screen.getByRole('link', { name: '결과 정정 화면 열기' })).toHaveAttribute(
      'href',
      '/admin/live/league-1/records/corrections?fixtureId=fx-1',
    );
    expect(mocks.formProps).toHaveLength(0);
    unmount();

    renderPanel(nodeOf({ ...TEAMS_FILLED, game: makeGame({ id: 'g1', state: 'LIVE' }) }));
    expect(screen.getByRole('link', { name: '콘솔 열기' })).toHaveAttribute('href', '/admin/live/league-1/fixtures/fx-1/operate');
  });

  it('확정 전·확정된 결과가 있으면 PR-3 결과 동작에 리그 id 를 넘기고, 성공할 때만 리그 화면을 새로 읽는다', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderPanel(nodeOf({ ...TEAMS_FILLED, game: OFFICIAL_GAME }));

    expect(mocks.resultProps[0]).toMatchObject({ tournamentId: 'league-1', fixtureId: 'fx-1', isKnockout: false, canWrite: true });

    fireEvent.click(screen.getByRole('button', { name: '실패 신호' }));
    expect(showToast).toHaveBeenLastCalledWith('고치지 못했어요.', 'error');
    expect(invalidate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '성공 신호' }));
    expect(showToast).toHaveBeenLastCalledWith('점수를 고쳤어요.', 'success');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: v1Keys.adminLeagueMatch('league-1') });
  });

  it('읽기 전용이면 점수 폼·자리 선택·일정/취소 버튼이 없다 — 결과 동작에는 canWrite=false 가 간다', () => {
    renderPanel(nodeOf({ ...TEAMS_FILLED, game: OFFICIAL_GAME }), { canWrite: false });

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: '일정 수정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '경기 취소' })).toBeNull();
    expect(mocks.resultProps[0]).toMatchObject({ canWrite: false });
  });
});

describe('LeagueFixturePanel — 일정 · 취소 · 닫기', () => {
  it('일정 수정·경기 취소는 부모의 기존 모달을 연다', () => {
    renderPanel(nodeOf({ game: READY_GAME }));

    fireEvent.click(screen.getByRole('button', { name: '일정 수정' }));
    fireEvent.click(screen.getByRole('button', { name: '경기 취소' }));
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));

    expect(onEditSchedule).toHaveBeenCalledTimes(1);
    expect(onCancelFixture).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('진행 중 경기에는 취소가 없고(서버가 409), 취소된 경기에는 쓰기 버튼이 모두 없다', () => {
    const { unmount } = renderPanel(nodeOf({ homeTeamId: 't1', awayTeamId: 't2', game: makeGame({ id: 'g1', state: 'PAUSED' }) }));
    expect(screen.getByRole('button', { name: '일정 수정' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '경기 취소' })).toBeNull();
    unmount();

    renderPanel(nodeOf({ status: 'cancelled', homeSlotId: null, awaySlotId: null }));
    expect(screen.getByText('취소된 경기예요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '일정 수정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '경기 취소' })).toBeNull();
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas/apps/v1_web
./node_modules/.bin/vitest run src/components/admin/bracket-canvas/league-fixture-panel.test.tsx
```

Expected: FAIL — `Failed to resolve import "./league-fixture-panel"`.

- [ ] **Step 3: 최소 구현**

`apps/v1_web/src/components/admin/bracket-canvas/league-fixture-panel.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useV1AssignTournamentSlot, useV1QuickResult } from '@/hooks/use-v1-bracket-canvas';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import type { LeagueBoardNode, LeagueBoardSide } from '@/lib/league-board-model';
import { v1Keys } from '@/lib/query-keys';
import type { V1AdminBracketSlot, V1AdminTournamentRegistration } from '@/types/api';
import { BracketQuickResultForm } from './bracket-quick-result-form';
import { BracketResultActions } from './bracket-result-actions';

export interface LeagueFixturePanelProps {
  leagueId: string;
  node: LeagueBoardNode;
  slots: V1AdminBracketSlot[];
  registrations: V1AdminTournamentRegistration[];
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onEditSchedule: () => void;
  onCancelFixture: () => void;
  onClose: () => void;
}

const SIDE_NAME = { home: '홈', away: '원정' } as const;
const MUTED = { color: 'var(--text-muted)' } as const;

export function LeagueFixturePanel({
  leagueId,
  node,
  slots,
  registrations,
  canWrite,
  showToast,
  onEditSchedule,
  onCancelFixture,
  onClose,
}: LeagueFixturePanelProps) {
  const queryClient = useQueryClient();
  const assignSlot = useV1AssignTournamentSlot(leagueId, 'league');
  const quickResult = useV1QuickResult(leagueId, 'league');
  const [quickError, setQuickError] = useState<string | null>(null);

  const game = node.game;
  // 서버 SLOT_LOCKED 와 같은 기준 — 게임이 예정이고 결과가 없을 때만 자리를 바꿀 수 있다.
  const locked = game !== null && (game.state !== 'SCHEDULED' || game.latestRevision !== null);
  const cancelled = node.state === 'cancelled';
  const confirmed = registrations.filter((registration) => registration.status === 'confirmed');
  const placedIds = new Set(
    slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map((slot) => slot.registrationId),
  );
  const bothTeamsSet = node.home.filled && node.away.filled;
  const correctionsHref = `/admin/live/${encodeURIComponent(leagueId)}/records/corrections?fixtureId=${encodeURIComponent(node.fixtureId)}`;
  const consoleHref = `/admin/live/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(node.fixtureId)}/operate`;

  // 정정·무효·확정 훅은 결과 검토 캐시만 비운다 — 리그 보드의 점수·상태는 여기서 다시 읽게 한다.
  const notifyResult = (message: string, variant: 'success' | 'error' = 'success') => {
    showToast(message, variant);
    if (variant === 'success') void queryClient.invalidateQueries({ queryKey: v1Keys.adminLeagueMatch(leagueId) });
  };

  const handleAssign = (slotId: string, value: string) => {
    const registrationId = value === '' ? null : value;
    assignSlot.mutate(
      { slotId, registrationId },
      {
        onSuccess: () => showToast(registrationId === null ? '자리를 비웠어요.' : '팀을 넣었어요.', 'success'),
        onError: (error) => showToast(describeBracketCanvasError(error, '팀을 넣지 못했어요.'), 'error'),
      },
    );
  };

  const renderSide = (sideKey: 'home' | 'away', side: LeagueBoardSide) => {
    let body: React.ReactNode;
    if (side.slotId === null) {
      body = <p className="tm-text-caption" style={MUTED}>자리 없이 만든 경기예요.</p>;
    } else if (locked || cancelled) {
      body = <p className="tm-text-caption" style={MUTED}>경기가 시작됐거나 결과가 있어 팀을 바꿀 수 없어요.</p>;
    } else if (!canWrite) {
      body = null;
    } else {
      const slotId = side.slotId;
      const options = confirmed.filter((registration) => !placedIds.has(registration.id) || registration.id === side.registrationId);
      body = (
        <select
          aria-label={`${SIDE_NAME[sideKey]} 팀 선택`}
          value={side.registrationId ?? ''}
          disabled={assignSlot.isPending}
          onChange={(event) => handleAssign(slotId, event.target.value)}
          className="tm-input"
          style={{ minHeight: 44 }}
        >
          <option value="">비워 두기</option>
          {options.map((registration) => (
            <option key={registration.id} value={registration.id}>
              {registration.teamName ?? registration.teamId}
            </option>
          ))}
        </select>
      );
    }
    return (
      <div key={sideKey} className="flex flex-col gap-1">
        <p className="tm-text-caption" style={MUTED}>{`${SIDE_NAME[sideKey]} · ${side.label}`}</p>
        {body}
      </div>
    );
  };

  const renderResult = () => {
    if (cancelled) return <p className="tm-text-caption" style={MUTED}>취소된 경기예요.</p>;
    if (game === null) return <p className="tm-text-caption" style={MUTED}>경기 정보가 아직 준비되지 않았어요.</p>;
    if (game.state === 'LIVE' || game.state === 'PAUSED') {
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="tm-text-caption" style={MUTED}>진행 중인 경기는 라이브 콘솔에서 입력해요.</p>
          <Link href={consoleHref} className="tm-btn tm-btn-sm tm-btn-outline">콘솔 열기</Link>
        </div>
      );
    }
    const revision = game.latestRevision;
    if (revision !== null && revision.state !== 'VOID') {
      return (
        <BracketResultActions
          tournamentId={leagueId}
          fixtureId={node.fixtureId}
          game={game}
          isKnockout={false}
          homeLabel={node.home.label}
          awayLabel={node.away.label}
          canWrite={canWrite}
          showToast={notifyResult}
        />
      );
    }
    if (game.hasLiveRecords) {
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="tm-text-caption" style={MUTED}>라이브로 득점이 기록된 경기예요. 결과 정정 화면에서 처리해 주세요.</p>
          <Link href={correctionsHref} className="tm-btn tm-btn-sm tm-btn-outline">결과 정정 화면 열기</Link>
        </div>
      );
    }
    if (!bothTeamsSet) return <p className="tm-text-caption" style={MUTED}>양쪽 팀이 정해지면 점수를 넣을 수 있어요.</p>;
    if (!canWrite) return null;
    return (
      <div className="flex flex-col gap-2">
        {revision !== null ? (
          <p className="tm-text-caption" style={MUTED}>무효 처리된 결과예요. 점수를 다시 넣을 수 있어요.</p>
        ) : null}
        <BracketQuickResultForm
          homeLabel={node.home.label}
          awayLabel={node.away.label}
          isKnockout={false}
          submitLabel="점수 확정"
          pending={quickResult.isPending}
          errorMessage={quickError}
          onSubmit={(score) => {
            setQuickError(null);
            quickResult.mutate(
              { gameId: game.id, expectedVersion: game.version, score },
              {
                onSuccess: () => showToast('점수를 확정했어요.', 'success'),
                onError: (error) => setQuickError(describeBracketCanvasError(error, '점수를 확정하지 못했어요.')),
              },
            );
          }}
        />
      </div>
    );
  };

  const sectionTitle = 'tm-text-label font-semibold';
  return (
    <aside
      aria-label="경기 상세"
      className="flex flex-col gap-5 p-4"
      style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="tm-text-body-lg min-w-0 truncate font-bold" style={{ color: 'var(--text-strong)' }}>
          {`${node.home.label} vs ${node.away.label}`}
        </h2>
        <button
          type="button"
          aria-label="패널 닫기"
          onClick={onClose}
          className="flex size-11 shrink-0 items-center justify-center transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          style={{ borderRadius: 'var(--radius-control)', color: 'var(--text-muted)' }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <section aria-label="팀 자리" className="flex flex-col gap-3">
        <h3 className={sectionTitle} style={{ color: 'var(--text-strong)' }}>팀 자리</h3>
        {renderSide('home', node.home)}
        {renderSide('away', node.away)}
      </section>

      <section aria-label="결과" className="flex flex-col gap-3">
        <h3 className={sectionTitle} style={{ color: 'var(--text-strong)' }}>결과</h3>
        {renderResult()}
      </section>

      <section aria-label="일정과 장소" className="flex flex-col gap-3">
        <h3 className={sectionTitle} style={{ color: 'var(--text-strong)' }}>일정과 장소</h3>
        <p className="tm-text-label" style={{ color: 'var(--text-body)' }}>
          {`${formatKstDateShort(node.startAt)} ${formatKstTime(node.startAt)} · ${node.placeName}`}
        </p>
        {canWrite && !cancelled ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onEditSchedule} className="tm-btn tm-btn-sm tm-btn-outline" style={{ minHeight: 44 }}>
              일정 수정
            </button>
            {node.state !== 'live' ? (
              <button
                type="button"
                onClick={onCancelFixture}
                className="tm-btn tm-btn-sm tm-btn-outline"
                style={{ minHeight: 44, color: 'var(--red700)' }}
              >
                경기 취소
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </aside>
  );
}
```

- [ ] **Step 4: 실행해 통과 확인**

```bash
./node_modules/.bin/vitest run src/components/admin/bracket-canvas/league-fixture-panel.test.tsx
./node_modules/.bin/tsc --noEmit -p tsconfig.json
node scripts/v1-pattern-check.mjs
```

Expected: 테스트 PASS(13건), tsc 0, 패턴 통과. (`LeagueBoardNode.state` 가 `'live'` 인 노드에서만 취소를 숨기므로, 진행 중 테스트의 `PAUSED` 게임이 PR-3 `fixtureNodeState` 로 `live` 가 되는지가 이 판정의 전제다 — Task 1 Step 1 에서 확인한 PR-3 구현은 LIVE·PAUSED 를 `live` 로 돌려준다.)

- [ ] **Step 5: 커밋**

```bash
GIT_LITERAL_PATHSPECS=1 git add apps/v1_web/src/components/admin/bracket-canvas/league-fixture-panel.tsx apps/v1_web/src/components/admin/bracket-canvas/league-fixture-panel.test.tsx
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 리그 경기 상세 패널 추가" -- apps/v1_web/src/components/admin/bracket-canvas/league-fixture-panel.tsx apps/v1_web/src/components/admin/bracket-canvas/league-fixture-panel.test.tsx
GIT_LITERAL_PATHSPECS=1 git show --stat HEAD
```

Expected: 파일 2개.

---

### Task 7: `LeagueScheduleBoard` 컴포넌트 — 7a 레이아웃·열·카드 → 7b 툴바 → 7c 트레이·패널·배정

한 컴포넌트를 세 번에 나눠 쌓는다. 태스크마다 vitest 한 파일(같은 `league-schedule-board.test.tsx` 를 이어서 키운다)을 red→green→커밋하고, 앞 태스크의 테스트는 그대로 green 을 유지한다. 최종 모양(7c 끝)의 동작 계약:

트레이에서 팀을 골라 둔 상태로 **자리가 있는 사이드**를 누르면 배정(PUT)한다. 선택이 없거나 자리 없는 기존 경기면 패널을 연다. 끌어 놓기는 `REGISTRATION_DRAG_MIME` 값을 읽어 같은 배정을 부른다. 읽기 전용(`canWrite=false`)이면 툴바·배정·패널 쓰기 동작을 모두 숨기거나 막는다(서버 403 에 기대지 않는다). 확정 팀 목록은 보드가 직접 조회한다(리그 상세 응답의 `teams` 는 이름 조회용).

최종 props(7c 끝):

```ts
export interface LeagueScheduleBoardProps {
  leagueId: string;
  fixtures: readonly V1LeagueFixture[];
  slots: V1AdminBracketSlot[];
  /** 팀 id → 이름(자리 없는 기존 경기의 라벨). undefined 는 아직 로딩. */
  teams: readonly V1AdminLeagueTeam[] | undefined;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onOpenTemplate: () => void;
  onEditSchedule: (teamMatchId: string) => void;
  onCancelFixture: (teamMatchId: string) => void;
  onShowList: () => void;
}
```

props 는 단계마다 필요한 만큼만 선언한다(7a: `fixtures`·`slots`·`teams`·`canWrite`·`onOpenTemplate`·`onShowList`, 7b: `leagueId`·`showToast` 추가, 7c: `onEditSchedule`·`onCancelFixture` 추가) — 쓰지 않는 prop 을 미리 받지 않는다.

**Files (7a~7c 공통):**
- Create (7a): `apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.tsx`
- Test (7a 생성, 7b·7c 확장): `apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.test.tsx`

**Consumes (7c 끝):** `buildLeagueBoard`(Task 5) · `LeagueFixturePanel`(Task 6) · `BracketTeamTray`(PR-3: `{ registrations, slots, pendingRegistrationId, canWrite, onPick }`) · `REGISTRATION_DRAG_MIME`(`./bracket-canvas-dnd`) · `useV1AssignTournamentSlot(leagueId, 'league')`, `useV1RandomFillSlots(leagueId, 'league')` · `useV1AdminTournamentRegistrations(leagueId)`(`@/hooks/use-v1-api`, 기존 — 확정 팀 목록은 리그 id 로도 읽힌다) · `describeBracketCanvasError` · `EmptyState`, `ErrorState`

---

#### Task 7a: 보드 레이아웃 — 경기일 열 · 카드 · 요약 · 빈 상태 (정적 렌더)

훅·트레이·패널 없이 `buildLeagueBoard` 결과만 그린다. 사이드는 아직 눌리지 않는 표시 요소이고(7c 가 버튼으로 바꾼다), 빈 자리는 스크린리더용 `비어 있음` 을 단다.

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeGame, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixtureGame } from '@/types/api';
import type { V1AdminLeagueTeam, V1LeagueFixture } from '@/types/league-match';
import { LeagueScheduleBoard, type LeagueScheduleBoardProps } from './league-schedule-board';

const TEAMS: V1AdminLeagueTeam[] = [
  { teamId: 't1', name: '독수리FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r1' },
  { teamId: 't2', name: '호랑이FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r2' },
  { teamId: 't3', name: '사자FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r3' },
];

const SLOTS = [
  makeSlot({ id: 's1', position: 1, label: '1번 자리' }),
  makeSlot({ id: 's2', position: 2, label: '2번 자리' }),
  makeSlot({ id: 's3', position: 3, label: '3번 자리', registrationId: 'r3', teamName: '사자FC' }),
  makeSlot({ id: 's4', position: 4, label: '4번 자리', registrationId: 'r2', teamName: '호랑이FC' }),
];

const OFFICIAL_QUICK: V1AdminBracketFixtureGame = makeGame({
  id: 'g1',
  state: 'ENDED',
  version: 2,
  latestRevision: { id: 'rev1', state: 'OFFICIAL', score: { home: 2, away: 1 }, entryMethod: 'quick' },
});

function fixture(overrides: Partial<V1LeagueFixture> & { teamMatchId: string }): V1LeagueFixture {
  return { title: '가을 리그', homeTeamId: 't1', awayTeamId: 't2', startAt: '2030-01-07T10:00:00.000Z', placeName: '망원 유수지', status: 'matched', ...overrides };
}

const FIXTURES: V1LeagueFixture[] = [
  fixture({ teamMatchId: 'fx-empty', homeTeamId: null, awayTeamId: null, homeSlotId: 's1', awaySlotId: 's2' }),
  fixture({ teamMatchId: 'fx-full', homeTeamId: 't3', awayTeamId: 't2', homeSlotId: 's3', awaySlotId: 's4', startAt: '2030-01-14T10:00:00.000Z', game: OFFICIAL_QUICK }),
  fixture({ teamMatchId: 'fx-legacy', startAt: '2030-01-21T10:00:00.000Z' }),
];

const onOpenTemplate = vi.fn();
const onShowList = vi.fn();

function renderBoard(overrides: Partial<LeagueScheduleBoardProps> = {}) {
  return render(
    <LeagueScheduleBoard
      fixtures={FIXTURES}
      slots={SLOTS}
      teams={TEAMS}
      canWrite
      onOpenTemplate={onOpenTemplate}
      onShowList={onShowList}
      {...overrides}
    />,
  );
}

const cardOf = (name: string) => screen.getByRole('listitem', { name });

describe('LeagueScheduleBoard — 렌더', () => {
  it('경기일마다 "N주차 · 날짜" 열을 만들고 자리 라벨·팀 이름·상태를 카드에 싣는다', () => {
    renderBoard();

    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(3);
    expect(headings.map((heading) => heading.textContent)).toEqual([
      expect.stringMatching(/^1주차 · /),
      expect.stringMatching(/^2주차 · /),
      expect.stringMatching(/^3주차 · /),
    ]);
    const empty = cardOf('1번 자리 대 2번 자리 경기');
    expect(within(empty).getByText('1번 자리')).toBeInTheDocument();
    expect(within(empty).getByText('2번 자리')).toBeInTheDocument();
    expect(within(empty).getAllByText('비어 있음')).toHaveLength(2);
    expect(within(empty).getByText('예정')).toBeInTheDocument();
    expect(within(empty).getByText(/망원 유수지/)).toBeInTheDocument();

    const full = cardOf('사자FC 대 호랑이FC 경기');
    expect(within(full).queryByText('비어 있음')).toBeNull();
    expect(within(full).getByText('확정')).toBeInTheDocument();
    expect(within(full).getByText('2 : 1')).toBeInTheDocument();
    expect(within(full).getByText('어드민 빠른 입력')).toBeInTheDocument();
  });

  it('공개 대기 표시는 팀이 빈 자리 경기에만 붙는다 — 다 찬 경기·자리 없는 기존 경기에는 없다', () => {
    renderBoard();

    expect(within(cardOf('1번 자리 대 2번 자리 경기')).getByText('공개 대기')).toBeInTheDocument();
    expect(within(cardOf('사자FC 대 호랑이FC 경기')).queryByText('공개 대기')).toBeNull();
    expect(within(cardOf('독수리FC 대 호랑이FC 경기')).queryByText('공개 대기')).toBeNull();
    expect(screen.getByText(/자리 2\/4 배정/)).toBeInTheDocument();
    expect(screen.getByText(/공개 대기 1경기/)).toBeInTheDocument();
  });

  it('읽기 전용이면 안내를 보인다', () => {
    renderBoard({ canWrite: false });
    expect(screen.getByRole('status')).toHaveTextContent('읽기 전용');
  });

  it('경기가 없으면 빈 상태에서 템플릿을 권하고(쓰기 권한 있을 때만) 목록으로 가는 길을 남긴다', () => {
    const { unmount } = renderBoard({ fixtures: [], slots: [] });
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 시작' }));
    expect(onOpenTemplate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /목록으로/ }));
    expect(onShowList).toHaveBeenCalledTimes(1);
    unmount();

    renderBoard({ fixtures: [], slots: [], canWrite: false });
    expect(screen.queryByRole('button', { name: '템플릿으로 시작' })).toBeNull();
  });

  it('경기가 있어도 자리가 없는 리그는 팀 넣기를 쓸 수 없다고 알린다', () => {
    renderBoard({ slots: [] });
    expect(screen.getByText(/자리 없이 만든 대진/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas/apps/v1_web
./node_modules/.bin/vitest run src/components/admin/bracket-canvas/league-schedule-board.test.tsx
```

Expected: FAIL — `Failed to resolve import "./league-schedule-board"`.

- [ ] **Step 3: 최소 구현 (정적 보드)**

`apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.tsx`:

```tsx
'use client';

import { useId, useMemo } from 'react';
import { EyeOff } from 'lucide-react';
import { EmptyState } from '@/components/v1-ui/primitives';
import { StatusChip } from '@/components/v1-ui/status-chip';
import { bracketNodeStateChip } from '@/lib/competition-status';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import { buildLeagueBoard, type LeagueBoardNode } from '@/lib/league-board-model';
import type { V1AdminBracketSlot } from '@/types/api';
import type { V1AdminLeagueTeam, V1LeagueFixture } from '@/types/league-match';

export interface LeagueScheduleBoardProps {
  fixtures: readonly V1LeagueFixture[];
  slots: V1AdminBracketSlot[];
  /** 팀 id → 이름(자리 없는 기존 경기의 라벨). undefined 는 아직 로딩. */
  teams: readonly V1AdminLeagueTeam[] | undefined;
  canWrite: boolean;
  onOpenTemplate: () => void;
  onShowList: () => void;
}

function scoreText(node: LeagueBoardNode): string | null {
  const score = node.game?.latestRevision?.score;
  if (score === undefined || score === null) return null;
  const penalties = score.penalties ? ` (승부차기 ${score.penalties.home} : ${score.penalties.away})` : '';
  return `${score.home} : ${score.away}${penalties}`;
}

export function LeagueScheduleBoard({ fixtures, slots, teams, canWrite, onOpenTemplate, onShowList }: LeagueScheduleBoardProps) {
  const headingId = useId();
  const teamNameById = useMemo(() => new Map((teams ?? []).map((team) => [team.teamId, team.name])), [teams]);
  const { columns, summary } = useMemo(
    () => buildLeagueBoard({ fixtures, slots, teamNameById }),
    [fixtures, slots, teamNameById],
  );

  if (fixtures.length === 0) {
    return (
      <div>
        <EmptyState
          title="아직 일정이 없어요"
          sub={
            canWrite
              ? '템플릿으로 빈 경기를 먼저 만들고, 팀은 나중에 자리에 넣을 수 있어요.'
              : '아직 만들어진 일정이 없어요.'
          }
          cta={canWrite ? '템플릿으로 시작' : undefined}
          onCta={onOpenTemplate}
        />
        {canWrite ? (
          <div className="mt-3 flex justify-center">
            <button type="button" onClick={onShowList} className="tm-btn tm-btn-sm tm-btn-ghost" style={{ minHeight: 44 }}>
              팀을 직접 정해 만들려면 목록으로 가요
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="sr-only">리그 일정 보드</h2>
      {!canWrite ? (
        <p role="status" className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
          읽기 전용이에요. 팀을 넣거나 경기를 바꾸려면 쓰기 권한이 필요해요.
        </p>
      ) : null}

      <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">
        {summary.slotCount > 0
          ? `자리 ${summary.filledSlotCount}/${summary.slotCount} 배정${summary.hiddenFixtureCount > 0 ? ` · 공개 대기 ${summary.hiddenFixtureCount}경기` : ''}`
          : '자리 없이 만든 대진이에요. 팀 넣기는 템플릿으로 다시 만든 뒤 쓸 수 있어요.'}
      </p>
      {summary.hiddenFixtureCount > 0 ? (
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          팀이 다 정해지지 않은 경기는 공개 화면에 아직 나오지 않아요. 자리에 팀을 모두 넣으면 나타나요.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <ol className="flex min-w-max gap-3" aria-label="경기일별 일정">
          {columns.map((column) => (
            <li key={column.key} className="w-64 shrink-0">
              <h3 className="mb-2 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
                {`${column.weekNumber}주차 · ${formatKstDateShort(column.nodes[0].startAt)}`}
              </h3>
              <ul className="flex flex-col gap-2">
                {column.nodes.map((node) => {
                  const score = scoreText(node);
                  return (
                    <li
                      key={node.fixtureId}
                      aria-label={`${node.home.label} 대 ${node.away.label} 경기`}
                      className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-2"
                    >
                      <div className="flex min-h-[44px] items-center justify-between gap-2 px-1">
                        <span className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                          {`${formatKstTime(node.startAt)} · ${node.placeName}`}
                        </span>
                        <StatusChip chip={bracketNodeStateChip(node.state)} />
                      </div>
                      {(['home', 'away'] as const).map((sideKey) => {
                        const side = node[sideKey];
                        return (
                          <p
                            key={sideKey}
                            className={`flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--border)] px-2 text-[length:var(--font-size-body-sm)] ${
                              side.filled ? 'bg-[var(--card-surface)] text-[var(--text-strong)]' : 'bg-[var(--surface-soft)] text-[var(--text-muted)]'
                            }`}
                          >
                            <span className="w-8 shrink-0 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                              {sideKey === 'home' ? '홈' : '원정'}
                            </span>
                            <span className="min-w-0 truncate">{side.label}</span>
                            {side.filled ? null : <span className="sr-only">비어 있음</span>}
                          </p>
                        );
                      })}
                      {score !== null ? (
                        <p className="px-1 text-[length:var(--font-size-body-sm)] font-semibold tabular-nums text-[var(--text-strong)]">{score}</p>
                      ) : null}
                      {node.game?.latestRevision?.entryMethod === 'quick' ? (
                        <p className="px-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">어드민 빠른 입력</p>
                      ) : null}
                      {node.hiddenFromPublic ? (
                        <p className="inline-flex items-center gap-1 px-1 text-[length:var(--font-size-caption)] text-[var(--orange700)]">
                          <EyeOff size={12} aria-hidden="true" />
                          공개 대기
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
```

색은 `--card-surface`·`--surface-soft`·`--border`·`--orange700` 토큰이고(`orange500` 텍스트는 대비 미달이라 쓰지 않는다), 폰트 크기는 `text-[length:var(--font-size-*)]` 형식이다.

- [ ] **Step 4: 실행해 통과 확인**

```bash
./node_modules/.bin/vitest run src/components/admin/bracket-canvas/league-schedule-board.test.tsx
./node_modules/.bin/tsc --noEmit -p tsconfig.json
node scripts/v1-pattern-check.mjs
```

Expected: 테스트 PASS(5건), tsc 에러 0, 패턴 검사 통과. 패턴 검사가 폰트 크기·반경 baseline 위반을 지적하면 지적된 클래스를 `.tm-text-*`/토큰으로 바꾼다.

- [ ] **Step 5: 커밋**

```bash
GIT_LITERAL_PATHSPECS=1 git add apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.tsx apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.test.tsx
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 리그 일정 보드 열·카드 렌더 추가" -- apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.tsx apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.test.tsx
GIT_LITERAL_PATHSPECS=1 git show --stat HEAD
```

Expected: 파일 2개.

---

#### Task 7b: 툴바 — 빈 자리 무작위 채우기 · 템플릿으로 다시 만들기

요약 줄 옆에 쓰기 권한이 있을 때만 보이는 툴바를 붙인다. 무작위 채우기는 PR-3 의 `useV1RandomFillSlots(leagueId, 'league')` 를 쓰고, 빈 자리가 없으면 잠근다. 자리 없는 리그(`slotCount === 0`)에는 무작위 채우기를 숨기고 "템플릿으로 다시 만들기"만 남긴다.

- [ ] **Step 1: 실패하는 테스트 추가**

`league-schedule-board.test.tsx` 를 고친다. (1) import 와 mock — 파일 맨 위 import 에 `waitFor`, `beforeEach` 를 더하고 `vi.mock` 을 import 아래에 둔다:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// …기존 import 유지…

const mocks = vi.hoisted(() => ({ randomFill: vi.fn() }));

vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1RandomFillSlots: () => ({ mutateAsync: mocks.randomFill, isPending: false }),
}));
```

(2) 공통 mock 함수와 `renderBoard` 에 새 props 를 넘기고, 매 테스트 전에 초기화한다:

```tsx
const showToast = vi.fn();
const onOpenTemplate = vi.fn();
const onShowList = vi.fn();

function renderBoard(overrides: Partial<LeagueScheduleBoardProps> = {}) {
  return render(
    <LeagueScheduleBoard
      leagueId="league-1"
      fixtures={FIXTURES}
      slots={SLOTS}
      teams={TEAMS}
      canWrite
      showToast={showToast}
      onOpenTemplate={onOpenTemplate}
      onShowList={onShowList}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.randomFill.mockResolvedValue({ assignments: [] });
});
```

(3) 파일 끝에 추가:

```tsx
describe('LeagueScheduleBoard — 툴바', () => {
  it('빈 자리 무작위 채우기: 넣은 팀 수를 알리고, 아무것도 못 넣으면 그렇게 말한다', async () => {
    mocks.randomFill.mockResolvedValueOnce({ assignments: [{ slotId: 's1', registrationId: 'r1' }, { slotId: 's2', registrationId: 'r2' }] });
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: '빈 자리 무작위 채우기' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('2팀을 빈 자리에 넣었어요.', 'success'));

    fireEvent.click(screen.getByRole('button', { name: '빈 자리 무작위 채우기' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('넣을 수 있는 팀이나 빈 자리가 없어요.', 'success'));
  });

  it('무작위 채우기가 거부되면 서버 사유를 오류 토스트로 보여 준다', async () => {
    mocks.randomFill.mockRejectedValueOnce(new Error('참가팀이 모자라요.'));
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: '빈 자리 무작위 채우기' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('참가팀이 모자라요.', 'error'));
  });

  it('빈 자리가 없으면 무작위 채우기 버튼이 잠긴다', () => {
    renderBoard({ slots: SLOTS.map((slot) => ({ ...slot, registrationId: `r-${slot.id}`, teamName: slot.id })) });
    expect(screen.getByRole('button', { name: '빈 자리 무작위 채우기' })).toBeDisabled();
  });

  it('읽기 전용에는 툴바가 없다', () => {
    renderBoard({ canWrite: false });
    expect(screen.queryByRole('button', { name: '빈 자리 무작위 채우기' })).toBeNull();
    expect(screen.queryByRole('button', { name: /템플릿으로/ })).toBeNull();
  });

  it('자리가 없는 리그는 무작위 채우기 없이 템플릿으로 다시 만들기만 권한다', () => {
    renderBoard({ slots: [] });
    expect(screen.queryByRole('button', { name: '빈 자리 무작위 채우기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 다시 만들기' }));
    expect(onOpenTemplate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

```bash
./node_modules/.bin/vitest run src/components/admin/bracket-canvas/league-schedule-board.test.tsx
```

Expected: FAIL — 툴바 5건 red(`Unable to find an accessible element … 빈 자리 무작위 채우기`), 7a 의 5건은 green.

- [ ] **Step 3: 구현 — `league-schedule-board.tsx` 를 고친다**

(1) import 를 바꾼다.

```tsx
import { useId, useMemo } from 'react';
// …lucide/EmptyState import 유지…
import { useV1RandomFillSlots } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
```

(2) props 에 `leagueId`·`showToast` 를 더하고 구조분해에도 추가한다.

```tsx
export interface LeagueScheduleBoardProps {
  leagueId: string;
  // …기존 필드 유지…
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onOpenTemplate: () => void;
  onShowList: () => void;
}

const TOOLBAR_BUTTON = 'tm-btn tm-btn-sm tm-btn-outline';
```

(3) 컴포넌트 안, `useMemo` 들 아래·`if (fixtures.length === 0)` **위**에 훅을 둔다(훅은 조기 반환보다 앞).

```tsx
  const randomFill = useV1RandomFillSlots(leagueId, 'league');
```

(4) 조기 반환 아래, `return (` 위에 핸들러를 더한다.

```tsx
  const onRandomFill = async () => {
    try {
      const result = await randomFill.mutateAsync();
      showToast(
        result.assignments.length === 0
          ? '넣을 수 있는 팀이나 빈 자리가 없어요.'
          : `${result.assignments.length}팀을 빈 자리에 넣었어요.`,
        'success',
      );
    } catch (error) {
      showToast(describeBracketCanvasError(error, '빈 자리를 채우지 못했어요.'), 'error');
    }
  };
```

(5) 7a 의 요약 `<p>` 를 아래 블록으로 바꾼다(`<p>` 내용은 그대로).

```tsx
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">
          {summary.slotCount > 0
            ? `자리 ${summary.filledSlotCount}/${summary.slotCount} 배정${summary.hiddenFixtureCount > 0 ? ` · 공개 대기 ${summary.hiddenFixtureCount}경기` : ''}`
            : '자리 없이 만든 대진이에요. 팀 넣기는 템플릿으로 다시 만든 뒤 쓸 수 있어요.'}
        </p>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            {summary.slotCount > 0 ? (
              <button
                type="button"
                className={TOOLBAR_BUTTON}
                style={{ minHeight: 44 }}
                disabled={!summary.hasEmptySlot || randomFill.isPending}
                onClick={() => void onRandomFill()}
              >
                빈 자리 무작위 채우기
              </button>
            ) : null}
            <button type="button" className={TOOLBAR_BUTTON} style={{ minHeight: 44 }} onClick={onOpenTemplate}>
              템플릿으로 다시 만들기
            </button>
          </div>
        ) : null}
      </div>
```

- [ ] **Step 4: 실행해 통과 확인**

```bash
./node_modules/.bin/vitest run src/components/admin/bracket-canvas/league-schedule-board.test.tsx
./node_modules/.bin/tsc --noEmit -p tsconfig.json
node scripts/v1-pattern-check.mjs
```

Expected: 테스트 PASS(10건), tsc 에러 0, 패턴 검사 통과.

- [ ] **Step 5: 커밋**

```bash
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 리그 일정 보드 툴바(무작위 채우기·템플릿) 추가" -- apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.tsx apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.test.tsx
GIT_LITERAL_PATHSPECS=1 git show --stat HEAD
```

Expected: 파일 2개.

---

#### Task 7c: 참가팀 트레이 · 팀 배정(클릭·끌어 놓기) · 경기 패널 연결

사이드를 버튼으로 바꾸고, 보드가 확정 팀 목록을 조회해 PR-3 `BracketTeamTray` 에 넘기며, 경기 머리를 누르면 Task 6 의 `LeagueFixturePanel` 을 연다. 배정은 PR-3 의 `useV1AssignTournamentSlot(leagueId, 'league')` 다.

- [ ] **Step 1: 실패하는 테스트 추가**

`league-schedule-board.test.tsx` 를 고친다. (1) 맨 위 import 에 `REGISTRATION_DRAG_MIME`, `makeRegistration` 을 더하고 mock 블록을 아래로 **바꾼다**(7b 의 `mocks`·`vi.mock('@/hooks/use-v1-bracket-canvas', …)` 자리):

```tsx
import { makeGame, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

const REGISTRATIONS = [
  makeRegistration({ id: 'r1', teamName: '독수리FC' }),
  makeRegistration({ id: 'r2', teamName: '호랑이FC' }),
  makeRegistration({ id: 'r3', teamName: '사자FC' }),
];

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  randomFill: vi.fn(),
  registrations: { data: undefined as unknown, isError: false, refetch: vi.fn() },
  trayProps: [] as Array<Record<string, unknown>>,
  panelProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminTournamentRegistrations: () => mocks.registrations }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutateAsync: mocks.assign, isPending: false }),
  useV1RandomFillSlots: () => ({ mutateAsync: mocks.randomFill, isPending: false }),
}));

// 트레이·패널 내부는 PR-3 와 Task 6 의 자체 테스트가 지킨다 — 여기서는 보드가 넘기는 props 와 반응만 본다.
vi.mock('./bracket-team-tray', () => ({
  BracketTeamTray: (props: {
    registrations: Array<{ id: string; teamName: string }>;
    canWrite: boolean;
    pendingRegistrationId: string | null;
    onPick: (registrationId: string | null) => void;
  }) => {
    mocks.trayProps.push(props);
    return (
      <div data-testid="tray" data-canwrite={String(props.canWrite)}>
        {props.registrations.map((registration) => (
          <button key={registration.id} type="button" onClick={() => props.onPick(registration.id)}>
            {registration.teamName}
          </button>
        ))}
      </div>
    );
  },
}));
vi.mock('./league-fixture-panel', () => ({
  LeagueFixturePanel: (props: {
    node: { fixtureId: string; home: { label: string }; away: { label: string } };
    onEditSchedule: () => void;
    onCancelFixture: () => void;
    onClose: () => void;
  }) => {
    mocks.panelProps.push(props);
    return (
      <div role="dialog" aria-label="경기 패널">
        {`${props.node.home.label} vs ${props.node.away.label}`}
        <button type="button" onClick={props.onEditSchedule}>일정 수정</button>
        <button type="button" onClick={props.onCancelFixture}>경기 취소</button>
        <button type="button" onClick={props.onClose}>패널 닫기</button>
      </div>
    );
  },
}));
```

(2) `renderBoard` 에 새 콜백 props 를 넘기고, `cardOf` 아래에 `lastTray` 를 더하고, `beforeEach` 를 확장한다:

```tsx
const onEditSchedule = vi.fn();
const onCancelFixture = vi.fn();

function renderBoard(overrides: Partial<LeagueScheduleBoardProps> = {}) {
  return render(
    <LeagueScheduleBoard
      leagueId="league-1"
      fixtures={FIXTURES}
      slots={SLOTS}
      teams={TEAMS}
      canWrite
      showToast={showToast}
      onOpenTemplate={onOpenTemplate}
      onEditSchedule={onEditSchedule}
      onCancelFixture={onCancelFixture}
      onShowList={onShowList}
      {...overrides}
    />,
  );
}

const lastTray = () => mocks.trayProps[mocks.trayProps.length - 1];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.trayProps.length = 0;
  mocks.panelProps.length = 0;
  mocks.registrations = { data: { items: REGISTRATIONS, truncated: false }, isError: false, refetch: vi.fn() };
  mocks.assign.mockResolvedValue({ slot: {}, affectedTeamMatchIds: [] });
  mocks.randomFill.mockResolvedValue({ assignments: [] });
});
```

(3) 7a 의 사이드 표시 단언은 사이드가 버튼이 되므로 **바꾼다** — `'경기일마다 "N주차 · 날짜" 열…'` 테스트의 빈 카드 부분을 아래로 대체한다(`within(empty).getByText('1번 자리')` 두 줄과 `getAllByText('비어 있음')` 줄, 그리고 `full` 의 `queryByText('비어 있음')` 줄):

```tsx
    const empty = cardOf('1번 자리 대 2번 자리 경기');
    expect(within(empty).getByRole('button', { name: '홈 1번 자리 비어 있음' })).toBeInTheDocument();
    expect(within(empty).getByRole('button', { name: '원정 2번 자리 비어 있음' })).toBeInTheDocument();
    // …예정·장소 단언 유지…
    const full = cardOf('사자FC 대 호랑이FC 경기');
    expect(within(full).getByRole('button', { name: '홈 사자FC' })).toBeInTheDocument();
```

(4) 파일 끝에 추가:

```tsx
describe('LeagueScheduleBoard — 트레이', () => {
  it('확정 팀 목록을 PR-3 트레이에 그대로 넘긴다', () => {
    renderBoard();

    const tray = lastTray() as { registrations: Array<{ id: string }>; slots: unknown[]; canWrite: boolean };
    expect(tray.registrations.map((registration) => registration.id)).toEqual(['r1', 'r2', 'r3']);
    expect(tray.slots).toBe(SLOTS);
    expect(tray.canWrite).toBe(true);
  });

  it('읽기 전용이면 트레이가 canWrite=false 로 내려간다', () => {
    renderBoard({ canWrite: false });
    expect(screen.getByTestId('tray')).toHaveAttribute('data-canwrite', 'false');
  });

  it('참가팀 로딩 중에는 스켈레톤, 실패하면 다시 시도 버튼을 보인다', () => {
    mocks.registrations = { data: undefined, isError: false, refetch: vi.fn() };
    const { unmount } = renderBoard();
    expect(screen.getByLabelText('참가팀 불러오는 중')).toBeInTheDocument();
    expect(screen.queryByTestId('tray')).toBeNull();
    unmount();

    mocks.registrations = { data: undefined, isError: true, refetch: vi.fn() };
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(mocks.registrations.refetch).toHaveBeenCalledTimes(1);
  });
});

describe('LeagueScheduleBoard — 팀 넣기', () => {
  it('트레이에서 팀을 고르고 빈 자리를 누르면 그 자리에 배정하고 선택을 푼다', async () => {
    renderBoard();

    fireEvent.click(within(screen.getByTestId('tray')).getByRole('button', { name: '독수리FC' }));
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리 비어 있음' }));

    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's1', registrationId: 'r1' }));
    expect(showToast).toHaveBeenCalledWith('자리에 팀을 넣었어요.', 'success');
    await waitFor(() => expect(lastTray().pendingRegistrationId).toBeNull());
  });

  it('선택한 팀이 없으면 같은 자리를 눌러도 배정하지 않고 패널을 연다 — 자리 없는 기존 경기는 선택이 있어도 패널만 연다', () => {
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리 비어 있음' }));
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '경기 패널' })).toHaveTextContent('1번 자리 vs 2번 자리');

    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    fireEvent.click(within(screen.getByTestId('tray')).getByRole('button', { name: '독수리FC' }));
    fireEvent.click(within(cardOf('독수리FC 대 호랑이FC 경기')).getByRole('button', { name: '홈 독수리FC' }));
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '경기 패널' })).toHaveTextContent('독수리FC vs 호랑이FC');
  });

  it('배정이 거부되면 서버 사유를 오류 토스트로 보여 주고 선택을 유지한다', async () => {
    mocks.assign.mockRejectedValueOnce(new Error('이미 시작했거나 결과가 있는 경기라 팀을 바꿀 수 없어요.'));
    renderBoard();

    fireEvent.click(within(screen.getByTestId('tray')).getByRole('button', { name: '독수리FC' }));
    fireEvent.click(screen.getByRole('button', { name: '원정 2번 자리 비어 있음' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('이미 시작했거나 결과가 있는 경기라 팀을 바꿀 수 없어요.', 'error'));
    expect(lastTray().pendingRegistrationId).toBe('r1');
  });

  it('끌어 놓으면 놓인 자리에 그 등록을 배정한다 — 자리 없는 사이드나 읽기 전용에서는 무시한다', async () => {
    const { rerender } = renderBoard();
    const drop = (target: HTMLElement) =>
      fireEvent.drop(target, { dataTransfer: { getData: (type: string) => (type === REGISTRATION_DRAG_MIME ? 'r1' : '') } });
    const emptyAway = () => screen.getByRole('button', { name: '원정 2번 자리 비어 있음' });

    drop(emptyAway());
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's2', registrationId: 'r1' }));

    mocks.assign.mockClear();
    drop(within(cardOf('독수리FC 대 호랑이FC 경기')).getByRole('button', { name: '원정 호랑이FC' })); // 자리 없는 기존 경기 — slotId 가 없다
    expect(mocks.assign).not.toHaveBeenCalled();

    rerender(
      <LeagueScheduleBoard
        leagueId="league-1" fixtures={FIXTURES} slots={SLOTS} teams={TEAMS} canWrite={false} showToast={showToast}
        onOpenTemplate={onOpenTemplate} onEditSchedule={onEditSchedule} onCancelFixture={onCancelFixture} onShowList={onShowList}
      />,
    );
    drop(emptyAway());
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});

describe('LeagueScheduleBoard — 패널', () => {
  it('경기 머리를 누르면 패널이 열리고, 일정 수정·경기 취소는 패널을 닫고 부모 모달로 넘긴다', () => {
    renderBoard();

    fireEvent.click(within(cardOf('1번 자리 대 2번 자리 경기')).getByRole('button', { name: /경기 상세 열기/ }));
    expect((mocks.panelProps[mocks.panelProps.length - 1] as { node: { fixtureId: string } }).node.fixtureId).toBe('fx-empty');

    fireEvent.click(screen.getByRole('button', { name: '일정 수정' }));
    expect(onEditSchedule).toHaveBeenCalledWith('fx-empty');
    expect(screen.queryByRole('dialog', { name: '경기 패널' })).toBeNull();

    fireEvent.click(within(cardOf('1번 자리 대 2번 자리 경기')).getByRole('button', { name: /경기 상세 열기/ }));
    fireEvent.click(screen.getByRole('button', { name: '경기 취소' }));
    expect(onCancelFixture).toHaveBeenCalledWith('fx-empty');
    expect(screen.queryByRole('dialog', { name: '경기 패널' })).toBeNull();
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

```bash
./node_modules/.bin/vitest run src/components/admin/bracket-canvas/league-schedule-board.test.tsx
```

Expected: FAIL — 트레이·배정·패널 테스트와 사이드 버튼 단언이 red(`Unable to find … 홈 1번 자리 비어 있음`), 7b 까지의 테스트 중 사이드 단언을 바꾸지 않은 것은 green.

- [ ] **Step 3: 구현 — `league-schedule-board.tsx` 를 고친다**

(1) import 를 아래로 **바꾼다**(7b 의 import 블록 전체 대체).

```tsx
'use client';

import { useId, useMemo, useState, type DragEvent } from 'react';
import { EyeOff } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { StatusChip } from '@/components/v1-ui/status-chip';
import { useV1AdminTournamentRegistrations } from '@/hooks/use-v1-api';
import { useV1AssignTournamentSlot, useV1RandomFillSlots } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { bracketNodeStateChip } from '@/lib/competition-status';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import {
  buildLeagueBoard,
  type LeagueBoardNode,
  type LeagueBoardSide,
} from '@/lib/league-board-model';
import type { V1AdminBracketSlot } from '@/types/api';
import type { V1AdminLeagueTeam, V1LeagueFixture } from '@/types/league-match';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';
import { BracketTeamTray } from './bracket-team-tray';
import { LeagueFixturePanel } from './league-fixture-panel';
```

(2) props 에 두 콜백을 더하고 구조분해에도 추가한다.

```tsx
  onOpenTemplate: () => void;
  onEditSchedule: (teamMatchId: string) => void;
  onCancelFixture: (teamMatchId: string) => void;
  onShowList: () => void;
```

(3) 훅과 상태 — `randomFill` 훅 줄 근처(조기 반환보다 위)에 둔다.

```tsx
  const registrationsQuery = useV1AdminTournamentRegistrations(leagueId);
  const assign = useV1AssignTournamentSlot(leagueId, 'league');
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);
  const [openFixtureId, setOpenFixtureId] = useState<string | null>(null);

  const registrations = registrationsQuery.data?.items;
```

그리고 `columns` 계산 직후에 `openNode` 를 둔다.

```tsx
  const openNode = columns.flatMap((column) => column.nodes).find((node) => node.fixtureId === openFixtureId) ?? null;
```

(4) 조기 반환 아래, `onRandomFill` 옆에 핸들러를 더한다.

```tsx
  const place = async (slotId: string, registrationId: string | null) => {
    try {
      await assign.mutateAsync({ slotId, registrationId });
      setSelectedRegistrationId(null);
      showToast(registrationId === null ? '자리를 비웠어요.' : '자리에 팀을 넣었어요.', 'success');
    } catch (error) {
      // 선택을 유지한다 — 다른 자리로 바로 다시 시도할 수 있어야 한다.
      showToast(describeBracketCanvasError(error, '자리에 팀을 넣지 못했어요.'), 'error');
    }
  };

  const onSideClick = (node: LeagueBoardNode, side: LeagueBoardSide) => {
    if (canWrite && selectedRegistrationId !== null && side.slotId !== null) {
      void place(side.slotId, selectedRegistrationId);
      return;
    }
    setOpenFixtureId(node.fixtureId);
  };

  const onSideDragOver = (event: DragEvent<HTMLButtonElement>, side: LeagueBoardSide) => {
    if (canWrite && side.slotId !== null) event.preventDefault();
  };

  const onSideDrop = (event: DragEvent<HTMLButtonElement>, side: LeagueBoardSide) => {
    if (!canWrite || side.slotId === null) return;
    event.preventDefault();
    const registrationId = event.dataTransfer.getData(REGISTRATION_DRAG_MIME);
    if (registrationId !== '') void place(side.slotId, registrationId);
  };
```

(5) 보드 영역을 트레이 + 열의 2단 그리드로 감싼다. 7a 의 `<div className="overflow-x-auto">…</div>` 를 `<div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">` 안으로 옮기고 그 앞에 `aside` 를 둔다(내부 `<ol>` 은 그대로).

```tsx
      <div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside aria-label="참가팀 영역">
          {registrationsQuery.isError ? (
            <ErrorState message="참가팀을 불러오지 못했어요." onRetry={() => void registrationsQuery.refetch()} />
          ) : registrations === undefined ? (
            <div role="status" aria-label="참가팀 불러오는 중" className="tm-skeleton" style={{ height: 160 }} />
          ) : (
            <BracketTeamTray
              registrations={registrations}
              slots={slots}
              pendingRegistrationId={selectedRegistrationId}
              canWrite={canWrite}
              onPick={setSelectedRegistrationId}
            />
          )}
        </aside>

        <div className="overflow-x-auto">
          {/* 7a 의 <ol className="flex min-w-max gap-3" aria-label="경기일별 일정"> … </ol> */}
        </div>
      </div>
```

(6) 카드 머리(`<div className="flex min-h-[44px] items-center justify-between gap-2 px-1">`)를 패널을 여는 버튼으로 **바꾼다**.

```tsx
                      <button
                        type="button"
                        onClick={() => setOpenFixtureId(node.fixtureId)}
                        aria-label={`${node.home.label} 대 ${node.away.label} 경기 상세 열기`}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-1 text-left transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                      >
                        <span className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                          {`${formatKstTime(node.startAt)} · ${node.placeName}`}
                        </span>
                        <StatusChip chip={bracketNodeStateChip(node.state)} />
                      </button>
```

(7) 사이드 `<p>` 를 버튼으로 **바꾼다**(`sr-only` "비어 있음" 대신 aria-label 이 같은 정보를 준다).

```tsx
                      {(['home', 'away'] as const).map((sideKey) => {
                        const side = node[sideKey];
                        const sideName = sideKey === 'home' ? '홈' : '원정';
                        const armed = canWrite && selectedRegistrationId !== null && side.slotId !== null;
                        return (
                          <button
                            key={sideKey}
                            type="button"
                            aria-label={`${sideName} ${side.label}${side.filled ? '' : ' 비어 있음'}`}
                            title={armed ? '선택한 팀을 이 자리에 넣어요' : undefined}
                            onClick={() => onSideClick(node, side)}
                            onDragOver={(event) => onSideDragOver(event, side)}
                            onDrop={(event) => onSideDrop(event, side)}
                            className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg border px-2 text-left text-[length:var(--font-size-body-sm)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 ${
                              armed ? 'border-[var(--blue500)]' : 'border-[var(--border)]'
                            } ${side.filled ? 'bg-[var(--card-surface)] text-[var(--text-strong)]' : 'bg-[var(--surface-soft)] text-[var(--text-muted)]'}`}
                          >
                            <span className="w-8 shrink-0 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{sideName}</span>
                            <span className="min-w-0 truncate">{side.label}</span>
                          </button>
                        );
                      })}
```

(8) `</section>` 바로 위에 패널을 렌더한다.

```tsx
      {openNode !== null ? (
        <LeagueFixturePanel
          key={openNode.fixtureId}
          leagueId={leagueId}
          node={openNode}
          slots={slots}
          registrations={registrations ?? []}
          canWrite={canWrite}
          showToast={showToast}
          onEditSchedule={() => {
            setOpenFixtureId(null);
            onEditSchedule(openNode.fixtureId);
          }}
          onCancelFixture={() => {
            setOpenFixtureId(null);
            onCancelFixture(openNode.fixtureId);
          }}
          onClose={() => setOpenFixtureId(null)}
        />
      ) : null}
```

- [ ] **Step 4: 실행해 통과 확인**

```bash
./node_modules/.bin/vitest run src/components/admin/bracket-canvas/league-schedule-board.test.tsx
./node_modules/.bin/tsc --noEmit -p tsconfig.json
node scripts/v1-pattern-check.mjs
```

Expected: 테스트 PASS(7a 5 + 7b 5 + 7c 9 = 19건 안팎 — 개수보다 전부 green 인지를 본다), tsc 에러 0, 패턴 검사 통과. 패턴 검사가 폰트 크기·반경 baseline 위반을 지적하면 지적된 클래스를 `.tm-text-*`/토큰으로 바꾼다.

- [ ] **Step 5: 커밋**

```bash
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 리그 일정 보드 트레이·팀 배정·경기 패널 연결" -- apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.tsx apps/v1_web/src/components/admin/bracket-canvas/league-schedule-board.test.tsx
GIT_LITERAL_PATHSPECS=1 git show --stat HEAD
```

Expected: 파일 2개.

---

### Task 8: 템플릿 대화상자 `LeagueTemplateDialog` (+ `WEEKDAY_OPTIONS` 공유)

**Files:**
- Modify: `apps/v1_web/src/lib/league-fixture-dates.ts` (파일 끝에 `WEEKDAY_OPTIONS` export 추가)
- Modify: `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx` (`grep -n "const WEEKDAY_OPTIONS"` 로 찾는 로컬 `WEEKDAY_OPTIONS` 7항목 블록 삭제 후 import)
- Create: `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-template-dialog.tsx`
- Test: `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-template-dialog.test.tsx`

**Interfaces:**
- Consumes: `expandWeeklyFixtureDates`, `describeDateSelection` (`@/lib/league-fixture-calendar`), `roundRobinRounds`, `plannedGameCount` (`@/lib/league-round-robin-plan`), `LeagueFixtureDatePicker`(같은 폴더), `RecentVenueChips` (`@/components/v1-ui/create-form-fields`, 목록 폼과 같은 추천 칩), `SegmentedTabs`, `useModalA11y`, `toKstDateString`
- Produces:

```ts
export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }>;
export interface LeagueTemplateDialogProps {
  /** 리그 시작일(ISO) — 요일로 채울 때 기준일. */
  leagueStartsOn: string;
  initialTeamCount: number;
  /** 참가팀이 과거에 쓴 장소(추천 칩). 없으면 빈 배열. */
  recentVenues: readonly string[];
  /** 경기가 이미 있는 리그를 새 템플릿으로 바꾸는 중인가. */
  replaceExisting: boolean;
  isSubmitting: boolean;
  onSubmit: (payload: V1ApplyLeagueTemplatePayload) => Promise<unknown>;
  onClose: () => void;
}
export function LeagueTemplateDialog(props: LeagueTemplateDialogProps): JSX.Element
```

필요한 경기 날짜 수 = 라운드 수(`roundRobinRounds(teamCount, legs)`, 템플릿은 하루 한 라운드). 서버가 날짜 부족을 422 로 거부하므로(`describeDateSelection` 의 `short`) 제출 전에 막는다. 초과 날짜는 서버가 앞쪽부터 쓰므로 막지 않는다.

- [ ] **Step 1: 요일 상수 공유 (동작 보존 리팩터)**

`apps/v1_web/src/lib/league-fixture-dates.ts` 끝에 추가:

```ts
/** 요일 선택 목록. 값은 `Date#getUTCDay` 와 같은 0(일)~6(토) — `expandWeeklyFixtureDates` 의 `dayOfWeek`. */
export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: '일요일' },
  { value: 1, label: '월요일' },
  { value: 2, label: '화요일' },
  { value: 3, label: '수요일' },
  { value: 4, label: '목요일' },
  { value: 5, label: '금요일' },
  { value: 6, label: '토요일' },
];
```

`league-match-fixtures-client.tsx` 에서 같은 모양의 로컬 `const WEEKDAY_OPTIONS = [ … ];` 블록(7개 항목)을 삭제하고, 기존 import `import { expandWeeklyFixtureDates } from '@/lib/league-fixture-dates';` 를 다음으로 바꾼다.

```ts
import { expandWeeklyFixtureDates, WEEKDAY_OPTIONS } from '@/lib/league-fixture-dates';
```

확인: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` → 에러 0, `./node_modules/.bin/vitest run "src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx" -t "요일"` → PASS(기존 요일 테스트가 그대로 통과).

- [ ] **Step 2: 실패하는 테스트 작성**

`apps/v1_web/src/app/admin/league-matches/[leagueId]/league-template-dialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeagueTemplateDialog, type LeagueTemplateDialogProps } from './league-template-dialog';

// 2030-01-07 은 월요일이다. 시작일을 먼 미래로 두면 "지금" 과 무관하게 요일 전개 결과가 고정된다.
const STARTS_ON = '2030-01-07T00:00:00.000Z';

function setup(overrides: Partial<LeagueTemplateDialogProps> = {}) {
  const onSubmit = vi.fn().mockResolvedValue({ slots: 4, fixtures: 6 });
  const onClose = vi.fn();
  render(
    <LeagueTemplateDialog
      leagueStartsOn={STARTS_ON}
      initialTeamCount={4}
      recentVenues={[]}
      replaceExisting={false}
      isSubmitting={false}
      onSubmit={onSubmit}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSubmit, onClose };
}

function fillByWeekday() {
  fireEvent.change(screen.getByLabelText('요일'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: '요일로 채우기' }));
}

describe('LeagueTemplateDialog', () => {
  it('팀 수·회전·요일 전개 날짜·시각을 그대로 보내고 성공하면 닫는다 — replaceExisting 키는 없다', async () => {
    const { onSubmit, onClose } = setup();

    fireEvent.click(screen.getByRole('radio', { name: '홈앤어웨이' }));
    fillByWeekday();
    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    // 4팀 홈앤어웨이 = 6라운드 = 6일. 시작일(월)부터 매주.
    expect(payload).toEqual({
      teamCount: 4,
      legs: 2,
      schedule: {
        dates: ['2030-01-07', '2030-01-14', '2030-01-21', '2030-01-28', '2030-02-04', '2030-02-11'],
        time: '19:00',
      },
    });
    expect(Object.keys(payload)).not.toContain('replaceExisting');
  });

  it('다시 만들기 모드는 replaceExisting 을 실어 보내고 기존 경기가 취소된다고 알린다', async () => {
    const { onSubmit } = setup({ replaceExisting: true });

    expect(screen.getByRole('dialog', { name: '템플릿으로 다시 만들기' })).toBeInTheDocument();
    expect(screen.getByText(/기존 경기는 취소되고/)).toBeInTheDocument();
    fillByWeekday();
    fireEvent.click(screen.getByRole('button', { name: '다시 만들기' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ teamCount: 4, legs: 1, replaceExisting: true });
  });

  it('팀 수와 회전에 따라 필요한 라운드·경기 수 요약이 바뀐다', () => {
    setup();
    expect(screen.getByText('3라운드 · 6경기를 만들어요')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '홈앤어웨이' }));
    expect(screen.getByText('6라운드 · 12경기를 만들어요')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('팀 수'), { target: { value: '5' } });
    // 홀수 팀은 부전 한 자리를 더해 라운드가 5, 라운드당 2경기 → 홈앤어웨이 10라운드 20경기.
    expect(screen.getByText('10라운드 · 20경기를 만들어요')).toBeInTheDocument();
  });

  it('날짜가 라운드 수보다 모자라면 보내지 않고 몇 일이 필요한지 알린다', () => {
    const { onSubmit } = setup();

    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('경기 날짜가 3일 필요해요. 0일 골랐어요.');
  });

  it.each(['2', '21', 'abc', ''])('팀 수 %s 는 3~20 범위 밖이라 보내지 않는다', (value) => {
    const { onSubmit } = setup();
    fillByWeekday();

    fireEvent.change(screen.getByLabelText('팀 수'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('팀 수는 3팀에서 20팀 사이로 입력해 주세요.');
  });

  it('서버가 거부하면 메시지를 보이고 입력과 창을 그대로 둔다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('이미 시작했거나 결과가 있는 경기가 있어 바꿀 수 없어요.'));
    const { onClose } = setup({ onSubmit });
    fillByWeekday();

    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 시작했거나 결과가 있는 경기가 있어 바꿀 수 없어요.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('팀 수')).toHaveValue('4');
    expect(screen.getByLabelText('요일')).toHaveValue('1');
  });

  it('장소를 적으면 placeName 으로 보내고, 추천 칩을 누르면 채워지며, 비우면 키가 없다', async () => {
    const { onSubmit } = setup({ recentVenues: ['망원 유수지', '성수 풋살장'] });
    fillByWeekday();

    fireEvent.click(screen.getByRole('button', { name: /성수 풋살장/ }));
    expect(screen.getByLabelText('기본 장소')).toHaveValue('성수 풋살장');
    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ placeName: '성수 풋살장' });
  });

  it('장소를 비워 두면 placeName 키 자체를 보내지 않는다 — 서버 기본값("장소 미정")을 쓴다', async () => {
    const { onSubmit } = setup();
    fillByWeekday();
    fireEvent.change(screen.getByLabelText('기본 장소'), { target: { value: '   ' } });

    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(Object.keys(onSubmit.mock.calls[0][0])).not.toContain('placeName');
  });

  it('리그 시작일을 읽을 수 없으면 요일 채우기를 막고 이유를 적는다', () => {
    setup({ leagueStartsOn: 'not-a-date' });
    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '1' } });

    expect(screen.queryByRole('button', { name: '요일로 채우기' })).toBeNull();
    expect(screen.getByText('리그 시작일이 없어 요일로 채울 수 없어요.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 실행해 실패 확인**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas/apps/v1_web
./node_modules/.bin/vitest run "src/app/admin/league-matches/[leagueId]/league-template-dialog.test.tsx"
```

Expected: FAIL — `Failed to resolve import "./league-template-dialog"`.

- [ ] **Step 4: 최소 구현**

`apps/v1_web/src/app/admin/league-matches/[leagueId]/league-template-dialog.tsx`:

```tsx
'use client';

import { useId, useState } from 'react';
import { RecentVenueChips } from '@/components/v1-ui/create-form-fields';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { extractErrorMessage } from '@/lib/error-message';
import { toKstDateString } from '@/lib/kst-calendar';
import { describeDateSelection } from '@/lib/league-fixture-calendar';
import { expandWeeklyFixtureDates, WEEKDAY_OPTIONS } from '@/lib/league-fixture-dates';
import { plannedGameCount, roundRobinRounds, type RoundRobinLegs } from '@/lib/league-round-robin-plan';
import type { V1ApplyLeagueTemplatePayload } from '@/types/league-match';
import { LeagueFixtureDatePicker } from './league-fixture-date-picker';

const TEAM_COUNT_MIN = 3;
const TEAM_COUNT_MAX = 20;

const inputClass =
  'h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

export interface LeagueTemplateDialogProps {
  /** 리그 시작일(ISO) — 요일로 채울 때 기준일. */
  leagueStartsOn: string;
  initialTeamCount: number;
  /** 참가팀이 과거에 쓴 장소(추천 칩). 없으면 빈 배열. */
  recentVenues: readonly string[];
  /** 경기가 이미 있는 리그를 새 템플릿으로 바꾸는 중인가. */
  replaceExisting: boolean;
  isSubmitting: boolean;
  onSubmit: (payload: V1ApplyLeagueTemplatePayload) => Promise<unknown>;
  onClose: () => void;
}

export function LeagueTemplateDialog({
  leagueStartsOn,
  initialTeamCount,
  recentVenues,
  replaceExisting,
  isSubmitting,
  onSubmit,
  onClose,
}: LeagueTemplateDialogProps) {
  const titleId = useId();
  const [teamCountText, setTeamCountText] = useState(String(initialTeamCount));
  const [legs, setLegs] = useState<RoundRobinLegs>(1);
  const [dayOfWeek, setDayOfWeek] = useState<number | ''>('');
  const [time, setTime] = useState('19:00');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [placeName, setPlaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  // pending 을 넘겨 제출 중 ESC 로 닫히지 않게 한다 — 요청은 날아가는데 화면만 사라지면 결과를 알 수 없다.
  const { dialogRef } = useModalA11y({ open: true, onClose, pending: isSubmitting });

  const trimmedTeamCount = teamCountText.trim();
  const teamCount = /^\d{1,2}$/.test(trimmedTeamCount) ? Number(trimmedTeamCount) : null;
  const teamCountInRange = teamCount !== null && teamCount >= TEAM_COUNT_MIN && teamCount <= TEAM_COUNT_MAX;
  // 템플릿은 하루에 한 라운드를 치른다 — 필요한 경기 날짜 수가 곧 라운드 수다.
  const rounds = teamCountInRange ? roundRobinRounds(teamCount, legs) : 0;
  const hasStartsOn = !Number.isNaN(new Date(leagueStartsOn).getTime());

  const fillByWeekday =
    hasStartsOn && dayOfWeek !== '' && time.trim() !== '' && rounds > 0
      ? () =>
          setSelectedDates(
            expandWeeklyFixtureDates({ startsOn: leagueStartsOn, dayOfWeek, time, weeksCount: rounds, now: new Date() }),
          )
      : null;

  const submit = async () => {
    if (isSubmitting) return;
    setError(null);
    if (teamCount === null || !teamCountInRange) {
      setError(`팀 수는 ${TEAM_COUNT_MIN}팀에서 ${TEAM_COUNT_MAX}팀 사이로 입력해 주세요.`);
      return;
    }
    if (time.trim() === '') {
      setError('시작 시각을 입력해 주세요.');
      return;
    }
    if (describeDateSelection(selectedDates.length, rounds).state === 'short') {
      setError(`경기 날짜가 ${rounds}일 필요해요. ${selectedDates.length}일 골랐어요.`);
      return;
    }
    try {
      await onSubmit({
        teamCount,
        legs,
        schedule: { dates: selectedDates, time: time.trim() },
        ...(placeName.trim() === '' ? {} : { placeName: placeName.trim() }),
        ...(replaceExisting ? { replaceExisting: true } : {}),
      });
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, '빈 경기를 만들지 못했어요.'));
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <h2 id={titleId} className="text-base font-semibold text-[var(--text-strong)]">
          {replaceExisting ? '템플릿으로 다시 만들기' : '템플릿으로 빈 경기 만들기'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="닫기"
          className="tm-btn tm-btn-sm tm-btn-ghost"
          style={{ minHeight: 44, minWidth: 44 }}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          팀 없이 경기 틀과 일정을 먼저 만들어요. 팀은 일정 보드에서 자리에 넣어요. 장소를 비우면 ‘장소 미정’으로 들어가고, 만든 뒤 경기마다 「일정 수정」에서 바꿀 수 있어요.
          자리에 팀을 모두 넣기 전에는 공개 화면에 경기가 나오지 않아요.
        </p>
        {replaceExisting ? (
          <p className="tm-on-tint mb-4 rounded-xl bg-[var(--tint-orange)] px-3 py-2 text-xs text-[var(--orange700)]">
            기존 경기는 취소되고 새 일정으로 바뀌어요. 이미 시작했거나 결과가 있는 경기가 있으면 만들 수 없어요.
          </p>
        ) : null}

        <div className="mb-4 grid grid-cols-2 items-start gap-3 md:max-w-xl">
          <div>
            <label htmlFor="league-template-team-count" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">팀 수</label>
            <input
              id="league-template-team-count"
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={teamCountText}
              onChange={(event) => setTeamCountText(event.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>
          <div>
            <p className="mb-1 block text-sm font-medium text-[var(--text-strong)]">방식</p>
            <SegmentedTabs
              ariaLabel="리그 방식"
              role="radiogroup"
              activeId={legs === 2 ? 'double' : 'single'}
              onSelect={(id) => setLegs(id === 'double' ? 2 : 1)}
              items={[
                { id: 'single', label: '단일 리그' },
                { id: 'double', label: '홈앤어웨이' },
              ]}
            />
          </div>
        </div>
        {teamCountInRange ? (
          <p className="mb-4 text-sm font-semibold text-[var(--text-strong)]">
            {`${rounds}라운드 · ${plannedGameCount(teamCount, rounds)}경기를 만들어요`}
          </p>
        ) : null}

        <div className="mb-4 grid grid-cols-2 items-start gap-3 md:max-w-xl">
          <div>
            <label htmlFor="league-template-weekday" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">요일</label>
            <select
              id="league-template-weekday"
              value={dayOfWeek}
              onChange={(event) => setDayOfWeek(event.target.value === '' ? '' : Number(event.target.value))}
              className={`${inputClass} w-full`}
            >
              <option value="">요일 고르기</option>
              {WEEKDAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="league-template-time" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">시작 시각</label>
            <input
              id="league-template-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>
        </div>

        <div className="mb-4 md:max-w-xl">
          <label htmlFor="league-template-place-name" className="mb-1 block text-sm font-medium text-[var(--text-strong)]">기본 장소</label>
          <input
            id="league-template-place-name"
            type="text"
            maxLength={120}
            placeholder="장소 미정"
            value={placeName}
            onChange={(event) => setPlaceName(event.target.value)}
            className={`${inputClass} w-full`}
          />
          <RecentVenueChips
            items={recentVenues.map((venue) => ({ placeName: venue }))}
            selectedValue={placeName}
            onSelect={(venue) => setPlaceName(venue.placeName)}
          />
        </div>

        <p className="mb-1 block text-sm font-medium text-[var(--text-strong)]">경기 날짜</p>
        <LeagueFixtureDatePicker
          selectedDates={selectedDates}
          onChange={setSelectedDates}
          requiredCount={rounds}
          today={toKstDateString(new Date())}
          onFillByWeekday={fillByWeekday}
          fillDisabledReason={hasStartsOn ? '팀 수·요일·시각을 고르면 한 번에 채울 수 있어요.' : '리그 시작일이 없어 요일로 채울 수 없어요.'}
        />

        {error !== null ? (
          <p role="alert" className="mt-4 text-sm text-[var(--red700)]">{error}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="tm-btn tm-btn-sm tm-btn-outline" style={{ minHeight: 44 }}>
          취소
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isSubmitting}
          className="tm-btn tm-btn-sm tm-btn-primary"
          style={{ minHeight: 44 }}
        >
          {replaceExisting ? '다시 만들기' : '빈 경기 만들기'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 실행해 통과 확인**

```bash
./node_modules/.bin/vitest run "src/app/admin/league-matches/[leagueId]/league-template-dialog.test.tsx" "src/app/admin/league-matches/[leagueId]/league-fixture-date-picker.test.tsx"
./node_modules/.bin/tsc --noEmit -p tsconfig.json
node scripts/v1-pattern-check.mjs
```

Expected: 테스트 PASS(대화상자 11건 + 달력 기존), tsc 0, 패턴 통과. (주황 안내 칸은 틴트 배경이라 기존 재생성 카드처럼 `tm-on-tint` 마커를 달았다 — 마커 래칫 baseline 이 늘었다고 지적하면 `scripts/tint-marker-baseline.json` 규칙을 읽고 같은 방식으로 맞춘다.)

- [ ] **Step 6: 커밋**

```bash
GIT_LITERAL_PATHSPECS=1 git add "apps/v1_web/src/app/admin/league-matches/[leagueId]/league-template-dialog.tsx" "apps/v1_web/src/app/admin/league-matches/[leagueId]/league-template-dialog.test.tsx"
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 리그 템플릿 대화상자 추가" -- apps/v1_web/src/lib/league-fixture-dates.ts "apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx" "apps/v1_web/src/app/admin/league-matches/[leagueId]/league-template-dialog.tsx" "apps/v1_web/src/app/admin/league-matches/[leagueId]/league-template-dialog.test.tsx"
GIT_LITERAL_PATHSPECS=1 git show --stat HEAD
```

Expected: 파일 4개.

---

### Task 9: 리그 상세 화면 연결 — [일정 보드 | 목록] 전환 · 보드 · 템플릿 대화상자 · 자리 리그 재생성 차단

**Files:**
- Modify: `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx`
- Modify: `apps/v1_web/src/app/admin/league-matches/[leagueId]/page.tsx`
- Modify: `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx`

**Interfaces:**
- Consumes: `LeagueScheduleBoard` (Task 7), `LeagueTemplateDialog` (Task 8), `useV1ApplyLeagueTemplate` (Task 4), `useAdminCanWrite` (`@/hooks/use-admin-can-write`, 기존), `SegmentedTabs`
- Produces: `LeagueMatchFixturesClient` props `{ leagueId: string; returnHref?: string; initialView?: 'board' | 'list' }` (기본 `'board'`) · 페이지 `?view=list` → `initialView="list"`

설계 요점: 기존 목록 JSX 는 한 줄도 옮기지 않고 `view` 로 가린다. 모달(일정 수정·취소·몰수·재생성)은 보기와 무관하게 항상 렌더되어 보드의 패널이 그대로 재사용한다.

- [ ] **Step 1: 기존 테스트를 목록 보기로 고정하고 모킹을 보강한다 (동작 변화 없음)**

기본 보기가 보드로 바뀌므로 기존 49개 렌더가 표를 찾지 못한다. 기계적 치환이다.

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas/apps/v1_web
F="src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx"
grep -c '<LeagueMatchFixturesClient leagueId="league-1" />' "$F"        # 49
sed -i '' 's|<LeagueMatchFixturesClient leagueId="league-1" />|<LeagueMatchFixturesClient leagueId="league-1" initialView="list" />|' "$F"
grep -c '<LeagueMatchFixturesClient leagueId="league-1" />' "$F"        # 0
grep -c 'initialView="list"' "$F"                                       # 49
```

같은 파일 상단의 `vi.mock('@/hooks/use-admin-can-write', …)` 줄(`grep -n "vi.mock('@/hooks/use-admin-can-write'"`)을 쓰기 권한을 테스트가 바꿀 수 있게 교체하고, 그 아래에 PR-3 훅·컴포넌트 모킹을 추가한다.

```tsx
const adminCanWrite = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => adminCanWrite.value }));

const canvasMocks = vi.hoisted(() => ({ applyTemplate: vi.fn() }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1ApplyLeagueTemplate: () => ({ mutateAsync: canvasMocks.applyTemplate, isPending: false }),
  useV1AssignTournamentSlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1RandomFillSlots: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// 트레이·패널 내부는 PR-3 와 Task 6 테스트가 지킨다. 여기서는 보드가 부모의 일정 수정·취소 모달로 이어지는 배선만 본다.
vi.mock('@/components/admin/bracket-canvas/bracket-team-tray', () => ({
  BracketTeamTray: () => <div data-testid="tray" />,
}));
vi.mock('@/components/admin/bracket-canvas/league-fixture-panel', () => ({
  LeagueFixturePanel: ({ node, onEditSchedule, onCancelFixture }: {
    node: { home: { label: string }; away: { label: string } };
    onEditSchedule: () => void;
    onCancelFixture: () => void;
  }) => (
    <div role="dialog" aria-label="경기 패널">
      {`${node.home.label} vs ${node.away.label}`}
      <button type="button" onClick={onEditSchedule}>일정 수정</button>
      <button type="button" onClick={onCancelFixture}>경기 취소</button>
    </div>
  ),
}));
```

같은 파일의 `vi.mock('@/hooks/use-v1-api', () => ({ … }))` 팩토리 안에 보드가 직접 부르는 확정 팀 조회를 추가한다(없으면 보드 렌더 때 `No "useV1AdminTournamentRegistrations" export is defined on the mock` 로 터진다). 데이터는 빈 목록으로 두어 로딩 스켈레톤(`role="status"`)이 읽기 전용 안내와 섞이지 않게 한다.

```tsx
  useV1AdminTournamentRegistrations: vi.fn(() => ({ data: { items: [], truncated: false }, isError: false, refetch: vi.fn() })),
```

(`vi.mock` 은 호이스팅되므로 위 모킹들은 파일의 다른 `vi.mock` 옆에 둔다. `adminCanWrite` 는 새 describe 의 `afterEach` 가 `true` 로 되돌린다.)

```bash
./node_modules/.bin/vitest run "$F"
```

Expected: PASS(기존 전부 — 컴포넌트는 아직 `initialView` 를 모르지만 무시된다).

- [ ] **Step 2: 실패하는 테스트 작성**

같은 파일 맨 끝에 추가한다. 렌더 태그는 `initialView` 를 속성 값으로 받는 형태라 위 치환 패턴과 겹치지 않는다.

```tsx
describe('LeagueMatchFixturesClient — 일정 보드와 보기 전환', () => {
  type Fixture = Record<string, unknown>;
  const TEAMS = [
    { teamId: 't1', name: '마포 FC', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r1' },
    { teamId: 't2', name: '합정 유나이티드', status: 'active', memberCount: 5, logoUrl: null, registrationId: 'r2' },
  ];
  const SLOTS = [
    { id: 's1', kind: 'ENTRY', groupId: null, sourceGroupId: null, position: 1, label: '1번 자리', registrationId: null, teamName: null },
    { id: 's2', kind: 'ENTRY', groupId: null, sourceGroupId: null, position: 2, label: '2번 자리', registrationId: null, teamName: null },
  ];
  const EMPTY_FIXTURE: Fixture = {
    teamMatchId: 'tm-empty', title: '1주차', homeTeamId: null, awayTeamId: null, homeSlotId: 's1', awaySlotId: 's2',
    startAt: '2030-01-07T10:00:00.000Z', placeName: '장소 미정', status: 'matched',
    resultStage: 'not_entered', gameState: 'SCHEDULED', game: null, homeScore: null, awayScore: null,
  };

  function renderClient(options: { fixtures?: Fixture[]; slots?: unknown[]; initialView?: 'board' | 'list' } = {}) {
    const { fixtures = [EMPTY_FIXTURE], slots = SLOTS, initialView } = options;
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1AdminLeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', isPublic: true, title: '마포 주말 리그', state: 'active', teamIds: ['t1', 't2'],
        startsOn: '2030-01-07T00:00:00.000Z', recentVenues: [], fixtures, slots,
      },
      isPending: false,
    } as never);
    useV1AdminLeagueTeamsMock.mockReturnValue({ data: { leagueId: 'league-1', teams: TEAMS } } as never);
    useV1GenerateLeagueFixturesMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
    useV1UpdateLeagueFixtureMock.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    render(
      <Providers>
        <LeagueMatchFixturesClient leagueId="league-1" initialView={initialView} />
      </Providers>,
    );
  }

  afterEach(() => {
    adminCanWrite.value = true;
    canvasMocks.applyTemplate.mockReset();
  });

  it('기본은 일정 보드이고, 목록 탭으로 바꾸면 기존 표가 나오며 다시 보드로 돌아온다', () => {
    renderClient();

    expect(screen.getByRole('tab', { name: '일정 보드', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '리그 일정 보드' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: '목록' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '리그 일정 보드' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: '일정 보드' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('region', { name: '리그 일정 보드' })).toBeInTheDocument();
  });

  it('initialView 가 list 면 처음부터 표를 보여 준다', () => {
    renderClient({ initialView: 'list' });
    expect(screen.getByRole('tab', { name: '목록', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '리그 일정 보드' })).toBeNull();
  });

  it('대진이 없으면 보드가 템플릿을 권하고, 목록으로 가면 기존 라운드로빈 생성 폼이 그대로 있다', () => {
    renderClient({ fixtures: [], slots: [] });

    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 시작' }));
    expect(screen.getByRole('dialog', { name: '템플릿으로 빈 경기 만들기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    fireEvent.click(screen.getByRole('tab', { name: '목록' }));
    expect(screen.getByRole('button', { name: '라운드로빈 대진 생성' })).toBeInTheDocument();
  });

  it('템플릿을 만들면 새 경기만 보내고(replaceExisting 없음) 개수를 알린다 — 참가팀 2팀이어도 팀 수 기본값은 최소 3', async () => {
    canvasMocks.applyTemplate.mockResolvedValue({ slots: 3, fixtures: 3 });
    renderClient({ fixtures: [], slots: [] });

    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 시작' }));
    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '요일로 채우기' }));
    fireEvent.click(screen.getByRole('button', { name: '빈 경기 만들기' }));

    await waitFor(() => expect(canvasMocks.applyTemplate).toHaveBeenCalledTimes(1));
    const payload = canvasMocks.applyTemplate.mock.calls[0][0];
    expect(payload).toEqual({
      teamCount: 3,
      legs: 1,
      schedule: { dates: ['2030-01-07', '2030-01-14', '2030-01-21'], time: '19:00' },
    });
    expect(Object.keys(payload)).not.toContain('replaceExisting');
    expect(await screen.findByText(/빈 경기 3개를 만들었어요/)).toBeInTheDocument();
  });

  it('경기가 이미 있으면 템플릿 대화상자가 다시 만들기 모드로 열려 replaceExisting 을 보낸다', async () => {
    canvasMocks.applyTemplate.mockResolvedValue({ slots: 3, fixtures: 3 });
    renderClient();

    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 다시 만들기' }));
    fireEvent.change(screen.getByLabelText('요일'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '요일로 채우기' }));
    fireEvent.click(screen.getByRole('button', { name: '다시 만들기' }));

    await waitFor(() => expect(canvasMocks.applyTemplate).toHaveBeenCalledTimes(1));
    expect(canvasMocks.applyTemplate.mock.calls[0][0]).toMatchObject({ teamCount: 3, legs: 1, replaceExisting: true });
  });

  it('보드 패널의 일정 수정·경기 취소가 기존 모달로 이어진다', () => {
    renderClient();

    fireEvent.click(screen.getByRole('button', { name: /경기 상세 열기/ }));
    fireEvent.click(screen.getByRole('button', { name: '일정 수정' }));
    expect(screen.getByRole('heading', { name: '일정 수정' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    fireEvent.click(screen.getByRole('button', { name: /경기 상세 열기/ }));
    fireEvent.click(screen.getByRole('button', { name: '경기 취소' }));
    expect(screen.getByRole('heading', { name: '대진을 취소할까요?' })).toBeInTheDocument();
  });

  it('쓰기 권한이 없으면 보드는 읽기 전용이다', () => {
    adminCanWrite.value = false;
    renderClient();

    // 화면에는 다른 status 영역(대표 이미지 저장 안내 등)이 있을 수 있어 보드 안으로 좁힌다.
    expect(within(screen.getByRole('region', { name: '리그 일정 보드' })).getByRole('status')).toHaveTextContent('읽기 전용');
    expect(screen.queryByRole('button', { name: '빈 자리 무작위 채우기' })).toBeNull();
    expect(screen.queryByRole('button', { name: '템플릿으로 다시 만들기' })).toBeNull();
  });

  it('자리 방식 리그는 목록의 대진 재생성을 막고 템플릿으로 안내한다 — 자리 없는 리그는 그대로 열려 있다', () => {
    renderClient({ initialView: 'list', fixtures: [{ ...EMPTY_FIXTURE, homeTeamId: 't1', awayTeamId: 't2' }] });
    openFixtureManage();
    expect(screen.getAllByRole('button', { name: '대진 재생성' })[0]).toBeDisabled();
    expect(screen.getByText(/일정 보드의 ‘템플릿으로 다시 만들기’/)).toBeInTheDocument();
  });
});
```

주의: 마지막 케이스의 대조군("자리 없는 리그는 재생성이 열려 있다")은 이미 있는 `끝난 경기와 이미 취소된 대진만 있으면 제외·재생성은 예전대로 열린다` 테스트가 `slots` 없는 데이터로 `not.toBeDisabled()` 를 단언하므로 별도로 쓰지 않는다. 파일 상단 import 에 `afterEach` 가 이미 있다(`afterAll, afterEach, beforeAll, …`).

- [ ] **Step 3: 실행해 실패 확인**

```bash
./node_modules/.bin/vitest run "$F" -t "일정 보드와 보기 전환"
```

Expected: FAIL 8건 — 탭이 없고(`getByRole('tab', …)`), 기본 보기가 여전히 표이며, 재생성 버튼이 비활성이 아니다.

- [ ] **Step 4: 클라이언트 구현 (`league-match-fixtures-client.tsx`) — 위치는 앵커 문자열로 찾는다**

(1) import — `import { LeagueCoverImageControl } from './league-cover-image-control';` 바로 아래에 추가:

```ts
import { LeagueScheduleBoard } from '@/components/admin/bracket-canvas/league-schedule-board';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1ApplyLeagueTemplate } from '@/hooks/use-v1-bracket-canvas';
import { LeagueTemplateDialog } from './league-template-dialog';
```

(2) 보기 타입과 시그니처 — `export default function LeagueMatchFixturesClient(` 줄을 다음으로 교체:

```tsx
export type LeagueFixturesView = 'board' | 'list';

export default function LeagueMatchFixturesClient({
  leagueId,
  returnHref = '/admin/league-matches',
  initialView = 'board',
}: {
  leagueId: string;
  returnHref?: string;
  initialView?: LeagueFixturesView;
}) {
```

(3) 훅 — `const { data: teamsData } = useV1AdminLeagueTeams(leagueId);` 줄은 그대로 두고 그 아래에 추가:

```tsx
  const canWrite = useAdminCanWrite();
  const applyTemplate = useV1ApplyLeagueTemplate(leagueId);
  const [view, setView] = useState<LeagueFixturesView>(initialView);
  const [templateOpen, setTemplateOpen] = useState(false);
```

(4) 자리 리그 판정 — `const leagueHasOfficialResult = series.fixtures.some((fixture) => fixture.resultStage === 'official');` 바로 아래에 추가:

```tsx
  // 서버는 자리 방식 리그의 기존 「재생성」을 409 LEAGUE_SLOT_FIXTURES_USE_TEMPLATE 로 막는다 — 누르면 실패할 버튼을 미리 잠근다.
  const hasSlotFixtures = (series.slots?.length ?? 0) > 0;
```

(5) 보기 전환 + 보드 — `<LeagueCoverImageControl … />` 줄 바로 아래(그리고 `{series.fixtures.length === 0 ? (` 위)에 추가:

```tsx
      <div className="mb-4 md:max-w-xs">
        <SegmentedTabs
          ariaLabel="대진 보기 방식"
          role="tablist"
          activeId={view}
          onSelect={(id) => setView(id === 'list' ? 'list' : 'board')}
          items={[
            { id: 'board', label: '일정 보드' },
            { id: 'list', label: '목록' },
          ]}
        />
      </div>
      {view === 'board' ? (
        <LeagueScheduleBoard
          leagueId={leagueId}
          fixtures={series.fixtures}
          slots={series.slots ?? []}
          teams={teamsData?.teams}
          canWrite={canWrite}
          showToast={showToast}
          onOpenTemplate={() => setTemplateOpen(true)}
          onEditSchedule={(teamMatchId) =>
            setScheduleFixture(series.fixtures.find((fixture) => fixture.teamMatchId === teamMatchId) ?? null)
          }
          onCancelFixture={(teamMatchId) =>
            setCancelTarget(series.fixtures.find((fixture) => fixture.teamMatchId === teamMatchId) ?? null)
          }
          onShowList={() => setView('list')}
        />
      ) : null}
```

(6) 목록을 보드에서 가리기 — 두 곳의 첫 줄만 바꾼다(내용은 그대로).

첫째, 아래 세 줄(고유한 `참가 신청 관리 — 사용자 A안(FE-3).` 주석이 이어진다)에서 첫 줄:

```tsx
{series.fixtures.length === 0 ? (
<>
      {/* 참가 신청 관리 — 사용자 A안(FE-3).
```

→

```tsx
{view === 'list' && series.fixtures.length === 0 ? (
<>
      {/* 참가 신청 관리 — 사용자 A안(FE-3).
```

(이 삼항의 else 쪽 "지금 할 일" 카드는 두 보기 모두에서 그대로 보인다.)

둘째, 아래 세 줄에서 첫 줄:

```tsx
      {series.fixtures.length === 0 ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 items-start gap-x-3 gap-y-3 md:max-w-3xl md:grid-cols-4">
```

→

```tsx
      {view === 'board' ? null : series.fixtures.length === 0 ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 items-start gap-x-3 gap-y-3 md:max-w-3xl md:grid-cols-4">
```

(7) 자리 리그 재생성 잠금 — 재생성 버튼의 `disabled={!hasLeagueStartsOn || inProgressFixtures.length > 0}` 를

```tsx
                      disabled={!hasLeagueStartsOn || inProgressFixtures.length > 0 || hasSlotFixtures}
```

로 바꾸고, 그 아래 `진행 중인 경기가 있어 대진을 다시 만들 수 없어요.` 안내 `<p>` 를 닫는 `) : null}` 바로 뒤에 추가:

```tsx
                {hasSlotFixtures ? (
                  <p className="mt-2 text-[length:var(--font-size-body-sm)] text-[var(--orange700)]">
                    자리 방식으로 만든 리그는 여기서 다시 만들 수 없어요. 일정 보드의 ‘템플릿으로 다시 만들기’를 써 주세요.
                  </p>
                ) : null}
```

(8) 템플릿 대화상자 — `<AdminToasts toasts={toasts} />` 바로 위에 추가:

```tsx
      {templateOpen ? (
        <LeagueTemplateDialog
          leagueStartsOn={series.startsOn}
          initialTeamCount={Math.min(20, Math.max(3, teamCount))}
          recentVenues={series.recentVenues ?? []}
          replaceExisting={series.fixtures.length > 0}
          isSubmitting={applyTemplate.isPending}
          onSubmit={async (payload) => {
            const result = await applyTemplate.mutateAsync(payload);
            showToast(`빈 경기 ${result.fixtures}개를 만들었어요. 자리에 팀을 넣어 보세요.`, 'success');
          }}
          onClose={() => setTemplateOpen(false)}
        />
      ) : null}
```

(`teamCount` 는 이미 `series.teamIds.length` 로 정의돼 있다. 실패는 대화상자가 잡아 메시지를 보이고 열어 둔다.)

- [ ] **Step 5: 페이지가 `?view=list` 를 넘긴다**

`apps/v1_web/src/app/admin/league-matches/[leagueId]/page.tsx` 전체를 교체:

```tsx
import LeagueMatchFixturesClient from './league-match-fixtures-client';
import { sanitizeRedirectPath } from '@/lib/session-storage';

interface Props {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ from?: string | string[]; view?: string | string[] }>;
}

export default async function AdminLeagueMatchDetailPage({ params, searchParams }: Props) {
  const { leagueId } = await params;
  const { from, view } = await searchParams;
  const returnHref = sanitizeRedirectPath(typeof from === 'string' ? from : null)
    ?? '/admin/league-matches';
  return (
    <LeagueMatchFixturesClient
      leagueId={leagueId}
      returnHref={returnHref}
      initialView={view === 'list' ? 'list' : 'board'}
    />
  );
}
```

- [ ] **Step 6: 실행해 통과 확인**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas/apps/v1_web
./node_modules/.bin/vitest run "src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx" "src/app/admin/league-matches/[leagueId]/league-template-dialog.test.tsx" src/components/admin/bracket-canvas/league-schedule-board.test.tsx
./node_modules/.bin/tsc --noEmit -p tsconfig.json
node scripts/v1-pattern-check.mjs
```

Expected: 클라이언트 테스트 전부 PASS(기존 49개 렌더 + 신규 8건), 대화상자·보드 테스트 PASS, tsc 0, 패턴 통과. 기존 테스트가 하나라도 깨지면 `view` 가림이 목록 JSX 의 다른 부분을 같이 가린 것이므로 (6)의 두 앵커만 바뀌었는지 `git diff` 로 확인한다.

- [ ] **Step 7: 커밋**

```bash
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 리그 어드민 일정 보드 전환과 템플릿 대화상자 연결" -- "apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx" "apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx" "apps/v1_web/src/app/admin/league-matches/[leagueId]/page.tsx"
GIT_LITERAL_PATHSPECS=1 git show --stat HEAD
```

Expected: 파일 3개.

---

### Task 10: changeset + 마감 검증

**Files:**
- Create: `.changeset/admin-league-schedule-board.md`

- [ ] **Step 1: changeset 작성**

`.changeset/admin-league-schedule-board.md`:

```md
---
"v1_web": minor
---

리그 어드민에 일정 보드가 생겼어요. 템플릿으로 팀 없이 빈 경기와 일정을 먼저 만들고, 보드에서 참가팀을 자리에 넣거나 빈 자리를 무작위로 채울 수 있어요. 팀이 다 정해지지 않은 경기는 공개 화면에 나오지 않고, 기존 목록 보기는 탭으로 그대로 쓸 수 있어요.
```

- [ ] **Step 2: 영향 범위 타깃 검증 (풀스위트는 돌리지 않는다)**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas/apps/v1_web
./node_modules/.bin/tsc --noEmit -p tsconfig.json
node scripts/v1-pattern-check.mjs
./node_modules/.bin/vitest run src/lib/league-fixture-meta.test.ts src/lib/league-next-action.test.ts src/lib/league-board-model.test.ts src/hooks/use-v1-bracket-canvas.league-template.test.tsx src/components/admin/bracket-canvas/league-fixture-panel.test.tsx src/components/admin/bracket-canvas/league-schedule-board.test.tsx "src/app/admin/league-matches/[leagueId]/league-template-dialog.test.tsx" "src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx" "src/app/league-matches/[leagueId]/fixtures/[fixtureId]/league-fixture-detail-client.test.tsx" "src/app/league-matches/[leagueId]/league-match-standings-client.test.tsx" "src/app/tournaments/[id]/tournament-detail-client.test.ts" "src/app/tournaments/[id]/tournament-detail-page-client.test.tsx"
```

Expected: 전부 PASS, tsc 0, 패턴 통과.

- [ ] **Step 3: 커밋된 상태 기준 확인 (공유 트리의 미커밋 파일에 속지 않는다)**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git status --porcelain | grep -v '^??' || echo "추적 파일 변경 없음"
git diff --name-only origin/dev...HEAD | grep -v '^apps/v1_web/\|^\.changeset/\|^docs/' || echo "v1_web 밖 변경 없음"
```

Expected: 미커밋 추적 변경 없음, `apps/v1_web`·`.changeset`·`docs` 밖의 변경 없음(이 PR 은 웹 전용 — changeset 도 `v1_web` 하나뿐).

- [ ] **Step 4: 커밋**

```bash
GIT_LITERAL_PATHSPECS=1 git add .changeset/admin-league-schedule-board.md
GIT_LITERAL_PATHSPECS=1 git commit -m "chore(changeset): 리그 일정 보드" -- .changeset/admin-league-schedule-board.md
GIT_LITERAL_PATHSPECS=1 git show --stat HEAD
```

Expected: 파일 1개.


---

### Task 11: 머지 후 확인 (UI PR — 코드 변경 없음, 색인 "머지 후 확인")

**Files:** 없음(검증·게시만).

- [ ] **Step 1: 내 머지가 alpha 에 배포됐는지 확인한다 (배포 창 중엔 측정 금지)**

```bash
gh run list --workflow deploy-alpha.yml --branch dev --limit 1 --repo kim-song-jun/matchup-sports-platform --json headSha,status,conclusion --jq '.[0]'
curl -fsSI https://alpha.teameet.co.kr/landing | grep -i 'x-teameet-commit'
git -C /Users/sungjun/Dev/projects/matchup-sports-platform merge-base --is-ancestor <내 머지 커밋> <x-teameet-commit 값> && echo "포함됨"
```

Expected: run `completed/success`, `포함됨` 출력. 아니면 배포가 끝날 때까지 기다린 뒤 다시 확인한다.

- [ ] **Step 2: ego-browser 로 시나리오를 클릭으로 밟는다**

`ego-browser` 스킬을 먼저 읽는다. **alpha 데이터 쓰기는 사용자 승인 후**에만 한다(새 테스트 리그·템플릿 적용·자리 배정이 모두 쓰기다). 승인 뒤 새 테스트 리그로 시나리오 4(템플릿 4팀·2회전 → 빈 경기 12 → 공개 화면에 경기 0 → 자리에 팀 넣기 → 공개 나타남)를 밟는다. 보드는 `min-w-max` 열을 가로 스크롤하므로 390 에서 잘림이 없는지, 가로 스크롤이 페이지가 아니라 보드 안에서만 생기는지 computed 값(`scrollWidth`/`clientWidth`)으로 읽는다. 상태 칩 문구(예정·진행 중·확정 전·확정·취소)가 PR-3 대진 캔버스의 칩과 같은지도 대조한다. 모바일 바텀시트 전환은 PR-6 범위다. 끝나면 `await task.finish({ keep: [] })` 로 워크스페이스를 닫는다.

- [ ] **Step 3: 📱390 / 📲768 / 🖥1440 갤러리를 이 PR 코멘트에 게시한다**

페이지별 3열 스크린샷(보드·목록 전환·템플릿 대화상자·경기 패널)을 SHA 고정 raw URL 로 올리고 200 확인 뒤 같은 PR 에 코멘트로 게시한다. 이 저장소는 public 이므로 코멘트에 프로덕션 식별자·계정 정보를 넣지 않는다.

---

## Self-Review

**스펙 항목 → 태스크**

| 스펙 항목 | 커버하는 태스크 |
|---|---|
| S6 어드민 경로는 빈 경기를 보여 준다 — 웹 타입 `homeTeamId: string \| null`, 문구 "미정" | Task 3(타입 + 어드민 목록·몰수·콘솔 가드), Task 2(표기 헬퍼) |
| S6 공개 화면 소비처가 빈 홈을 안전하게 다룸(서버 게이트 뒤에도 타입이 좁혀지지 않음) | Task 3(리그 경기 상세·순위 화면·대회 상세 리그 카드·다음 할 일) |
| S5 리그 어드민 참가팀 `registrationId`, 상세 `slots`·경기 `homeSlotId/awaySlotId/game` 웹 타입 | Task 1 (참가팀 `registrationId` 는 서버 계약 반영용 타입이고, 이 PR 의 화면은 확정 팀을 `useV1AdminTournamentRegistrations` 로 읽는다) |
| S3 자리에 팀 넣기(칸 누르기 + 끌어 놓기 + 빈 자리 무작위 채우기) · 키보드 대체(트레이 선택 → 자리 누르기, 패널의 선택창) | Task 7(트레이 선택·클릭·drop·random-fill·실패 시 선택 유지), Task 6(패널 선택창·잠금 안내) |
| S7 정규 리그 [일정 보드 \| 목록] 전환, 기본 일정 보드 | Task 9(탭·`initialView`·`?view=list`) |
| S7 일정 보드: 열·칸(자리 라벨·일정/장소·상태 칩)·"어드민 빠른 입력" 표시 — 상태 칩은 PR-3 `bracketNodeStateChip` + `StatusChip` 재사용(로컬 `STATE_TAG` 없음) | Task 5(모델), Task 7(카드) |
| S7 템플릿 창(팀 수·회전·기존 리그 일정 입력 재사용) · 정규 리그는 일정 입력 필수 | Task 8, Task 4(훅), Task 9(연결·`replaceExisting`) |
| S7 상태: 로딩(스켈레톤)·에러(재시도)·빈 대진(EmptyState + 템플릿 유도) | 리그 본체 로딩/에러는 기존 클라이언트(변경 없음), 참가팀 로딩/에러·빈 대진은 Task 7 |
| S7 권한 `canWrite=false` 읽기 전용(서버 403 에 기대지 않음) | Task 7(툴바·배정·drop), Task 6(자리 선택·점수 폼·일정/취소 숨김), Task 9(`useAdminCanWrite` 연결) |
| S5/S7 결과 구역: 빠른 점수 입력·정정·무효·확인, 득점 기록 있는 경기는 정정 화면으로, 명단 동기화 중 안내 | Task 6 (PR-3 `BracketQuickResultForm`·`BracketResultActions`·`useV1QuickResult` 재사용 + 리그 캐시 무효화, 정정 화면/콘솔 링크) |
| S2 자리 리그의 기존 「재생성」 차단 | Task 9 (UI 선차단; 서버 409 는 PR-5a) |
| S6 공개 대기(팀 빈 자리 경기는 공개에 안 나감) 운영자에게 알림 | Task 5(`hiddenFromPublic` — 서버 게이트와 같은 술어, 양쪽 대조군 테스트), Task 7(배지·요약·안내) |
| Test Scenarios "웹: 로딩·에러·빈 대진 / canWrite=false / 키보드로 배정 / 리그 빈 경기 취소·부전승 표기 유지" | Task 2(부전승 유지 대조), Task 3, Task 6, Task 7, Task 9 |
| Mock data updates: `types/league-match.ts` nullable + 해당 테스트 고정 데이터 | Task 3 (next-action·상세·어드민 목록 테스트에 null 케이스, 기존 고정 데이터는 string 이라 그대로 유효), Task 9(`useV1AdminTournamentRegistrations`·`use-v1-bracket-canvas` 모킹 추가) |
| PR 공통: changeset(`v1_web` 만) | Task 10 |
| 색인 "머지 후 확인"(UI PR: 배포 SHA·ego-browser·3폭 갤러리) | Task 11 |

**이 PR 밖(다른 계획 파일 소관)**: 서버 템플릿·자리 배정·공개 게이트·리그 응답 확장(PR-5a), 점수 입력 폼/결과 동작/트레이/훅의 내부 구현(PR-3), 모바일 라운드 탭 + 바텀시트(PR-6), `docs/api/domains/league-matches.md` 갱신(PR-5a).

**검증하지 못한 가정(구현자가 Task 1 Step 1 과 Task 6·7 Step 5 에서 확인)**: PR-3 계획(작성 시점 `docs/superpowers/plans/2026-10-08-admin-bracket-canvas-pr3-canvas-ui.md`) 기준으로 쓴 `BracketTeamTray`·`BracketQuickResultForm`·`BracketResultActions`·`useV1*` 훅의 props/시그니처가 구현본과 같은지. 다르면 호출부(`league-fixture-panel.tsx`, `league-schedule-board.tsx`)만 맞춘다. PR-5a 응답이 `game`·`slots`·`registrationId` 를 색인 모양대로 내려주는지(어드민 리그 상세).
