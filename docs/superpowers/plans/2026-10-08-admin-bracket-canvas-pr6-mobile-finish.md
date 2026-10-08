# 어드민 대진 그림 편집기 PR-6 — 모바일(390)과 마감

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 768px 미만에서 대진 그림 대신 "라운드 탭 + 칸 목록"을 보여 주고, 칸을 누르면 `BottomSheet` 에서 팀 넣기·점수 입력·확인을 할 수 있게 한다. 구조 편집 도구는 숨기고 "큰 화면에서 편집해요" 안내를 둔다. 정규 리그 일정 보드도 같은 모바일 뷰를 쓴다. 마지막으로 changeset·태스크 문서·alpha QA 체크리스트로 마감한다.

**Architecture:** 뷰포트 분기는 `useMediaQuery('(min-width: 768px)')` 하나로 `wide`/`narrow` 중 한쪽만 마운트하는 `BracketCanvasResponsive` 가 맡는다. 모바일 뷰는 PR-3 의 캔버스 레이아웃 좌표에 기대지 않고, 어드민 대진 응답(`groups`·`fixtures`·`slots`)을 "라운드 → 섹션 → 칸" 목록으로 바꾸는 순수 함수(`lib/bracket-canvas-mobile-model.ts`)와 그 결과를 그리는 `bracket-canvas-mobile.tsx` 로 이뤄진다. 칸 상태 칩(`bracketNodeStateChip`)·상태 도출(`fixtureNodeState`)·사이드 라벨(`fixtureSideLabel`)·점수 표기(`formatGameResultScoreWithPenalties`)·리그 날짜 묶음(`buildLeagueBoard`)은 각 생산자의 것을 **import 만** 하고 이 PR 에서 다시 만들지 않는다. 시트 안의 점수 입력·확인·정정은 PR-3 의 `BracketQuickResultForm`·`BracketResultActions` 를 그대로 재사용하고, 팀 넣기는 `useV1AssignTournamentSlot` 으로 모바일 전용 목록 UI 를 얹는다.

**Tech Stack:** Next.js 16 + React 19 + TanStack Query 5 + Vitest + Testing Library (apps/v1_web), 읽기 전용 Playwright 캡처 스크립트(scripts/), Jest 30 runner-contract 스펙(apps/v1_api).

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md` (S7 모바일 항, D8, Scenario 5, Test Scenarios "웹" 줄) · 색인·공유 계약 `docs/superpowers/plans/2026-10-08-admin-bracket-canvas-index.md`

## 계약 이탈

없음. 색인 계약의 이름·경로·시그니처·라우트·에러 코드를 그대로 쓴다. 계약 표에 없는 **보조 파일만** 아래 5개를 추가한다(이름 충돌 없음).

| 추가 파일 | 이유 |
|---|---|
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-responsive.tsx` | 뷰포트 분기 한 곳. 토너먼트 페이지·리그 화면이 같이 쓴다 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-sheet.tsx` | 시트 본문(상세·팀 고르기). 메인 파일이 300줄을 넘지 않게 분리 |
| `apps/v1_web/src/lib/bracket-canvas-mobile-model.ts` | 모바일 목록 모델(순수 함수) — `buildCanvasLayout` 의 좌표 계산과 무관해서 PR-3 계약에 기대지 않는다 |
| `apps/v1_web/src/test/viewport.ts` | 테스트용 뷰포트 스텁. PR-3 테스트도 `BracketCanvasResponsive` 를 거치면 필요하다 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.tsx` | 토너먼트 모바일 화면. `BracketCanvasWorkspace` 가 데이터 조회까지 안에 가지므로, 좁은 화면용으로 같은 `useV1AdminBracket` 를 읽어 모바일 목록에 넘기는 얇은 컨테이너(툴바·트레이는 두지 않는다) |

## 설계 결정 (왜 CSS 가 아니라 `useMediaQuery` 인가)

- 이 저장소의 어드민 표(`admin-data-table.tsx:292,304`)는 `hidden lg:block`/`lg:hidden` 으로 두 DOM 을 모두 그린다. 표는 값싸다. 대진 캔버스는 끌어 놓기 핸들러·SVG 연결선·`BottomSheet` 의 오버레이 히스토리 항목을 갖고 있어 **둘 다 마운트하면 같은 aria-label·같은 칸이 두 벌**이 되고(스크린리더·테스트 모두 오염), 모바일에서 보이지 않는 캔버스가 레이아웃 계산을 계속 한다.
- 데스크톱/모바일 분기점을 JS 로 정하는 선례가 이미 있다: `hooks/use-media-query.ts` 의 `DESKTOP_LIST_MEDIA_QUERY`(`tournaments-list-client.tsx:113`). 같은 파일에 상수를 하나 더 둔다. `useSyncExternalStore` 라 하이드레이션 불일치가 없고, 서버 기본값은 모바일(false)이다. 어드민 대진 화면은 데이터가 로딩 스켈레톤 뒤에 나오므로 첫 페인트에 잘못된 뷰가 번쩍이지 않는다.
- 분기점 768 은 Tailwind `md`·`tokens.css` 의 태블릿 시작과 같다(스펙 D8 "구조 편집은 768px 이상").


## 선행 조건과 허용되는 적응

PR-6 은 PR-3·4·5b 가 dev 에 머지된 뒤에 착수한다. **Task 1 Step 1** 이 아래를 실제 코드와 대조한다. 이 계획이 소비하는 PR-3/5b 쪽 이름과 시그니처는 다음과 같다(PR-3 계획서 Task 3·4·7·10·11·14·15 와 PR-5b 계획서 Task 1·5·9 의 Produces 를 그대로 옮긴 값이다).

| 소비하는 것 | 가정한 모양 | 출처 |
|---|---|---|
| `fixtureNodeState(game)` · 타입 `FixtureNodeState` | `V1AdminBracketFixtureGame \| null` → `'scheduled' \| 'live' \| 'submitted' \| 'official' \| 'cancelled'`. `null`→`scheduled`, 게임 `CANCELLED`→`cancelled`, `LIVE`·`PAUSED`→`live`, 리비전 `OFFICIAL`→`official`, `VOID`→`scheduled`, 그 밖의 리비전·종료 후 리비전 없음→`submitted` | `lib/bracket-canvas-layout.ts` (PR-3 Task 4) |
| `buildSideLabelContext(groups, fixtures, slots)` · `fixtureSideLabel(fixture, side: 'HOME' \| 'AWAY', ctx)` · 타입 `SideKey`·`SideLabelContext`(`slotsById` 포함) | 팀이 있으면 팀 이름, 없으면 자리 라벨 → `bracketSources` 라벨("8강 1번 경기 승자") → `미정` | `lib/bracket-canvas-layout.ts` (PR-3 Task 4) |
| `bracketNodeStateChip(state)` | `FixtureNodeState` → `StatusChipModel`(`예정`·`진행 중`·`확정 전`·`확정`·`취소`). 칸 상태 칩의 **단일 정의** | `lib/competition-status.ts` (PR-3 Task 7) |
| `formatGameResultScoreWithPenalties(score)` | 기존 유틸. `{ home, away, penalties? }` → `2:1 (승부차기 4:3)`. 점수를 새로 포맷하는 함수는 만들지 않는다 | `lib/game-result-score.ts` (기존) |
| `buildLeagueBoard({ fixtures, slots, teamNameById })` | `{ columns: { key(KST 날짜); weekNumber; nodes: LeagueBoardNode[] }[]; summary }`. 노드는 `state`(취소 포함)·`home/away: { slotId; label; filled; registrationId }`·`game`·`title`·`startAt`·`placeName` 을 가진다 | `lib/league-board-model.ts` (PR-5b Task 5) |
| `useV1AssignTournamentSlot(competitionId, scope).mutateAsync` | `({ slotId: string; registrationId: string \| null }) => Promise<...>` | `hooks/use-v1-bracket-canvas.ts` (PR-3 Task 3) |
| `useV1QuickResult(competitionId, scope)` | `.mutate({ gameId: string; expectedVersion: number; score: V1QuickResultScore }, { onSuccess, onError })`, `.isPending` — 변이는 **호출자가 소유**한다 | `hooks/use-v1-bracket-canvas.ts` (PR-3 Task 3) |
| `describeBracketCanvasError(err, fallback)` | 그림 편집기 서버 코드를 해요체로. 팀 배정 실패 토스트도 이것을 쓴다 | `lib/bracket-canvas-errors.ts` (PR-3 Task 2) |
| `BracketQuickResultForm` | `{ homeLabel: string; awayLabel: string; isKnockout: boolean; initial?: V1QuickResultScore; submitLabel: string; pending: boolean; errorMessage?: string \| null; onSubmit: (score: V1QuickResultScore) => void; onCancel?: () => void }` — 폼은 스스로 제출하지 않는다 | PR-3 Task 10 |
| `BracketResultActions` | `{ tournamentId: string; fixtureId: string; game: V1AdminBracketFixtureGame; isKnockout: boolean; homeLabel: string; awayLabel: string; canWrite: boolean; showToast }` — 확인·점수 고치기·무효를 `game.latestRevision.state` 로 가려 보여 주고 변이·토스트를 스스로 처리한다. `onDone` 이 없다. 리그면 `tournamentId` 에 리그 id (PR-5b 계약) | PR-3 Task 11 |
| `BracketCanvasWorkspace` · 페이지 `AdminTournamentBracketPage` | 워크스페이스 props `{ tournamentId; format; registrations; bracketPublishedAt; bracketPublishScheduledAt; canWrite; showToast; onShowList }` — 툴바·트레이·캔버스·칸 패널과 `useV1AdminBracket` 조회를 **안에** 가진다. 페이지(`BracketPageBody`)가 `view === 'canvas'` 분기에서 이것을 렌더한다 | PR-3 Task 14·15 |
| `LeagueMatchFixturesClient` · `LeagueScheduleBoard` | 클라이언트 props `{ leagueId; returnHref?; initialView?: 'board' \| 'list' }`, 변수 `series`(= `useV1AdminLeagueMatch`)·`teamsData`·`canWrite`(= `useAdminCanWrite()`)·`showToast`·`view`. `view === 'board'` 일 때 `<LeagueScheduleBoard leagueId fixtures slots teams canWrite showToast onOpenTemplate onEditSchedule onCancelFixture onShowList />` 를 렌더한다 | PR-5b Task 9 |
| 타입 | `V1AdminBracketSlot`, `V1AdminBracketFixtureGame`, `V1AdminBracketFixture.homeSlotId/awaySlotId: string \| null`·`game`·`bracketSources?`, `V1AdminTournamentBracket.slots` | `types/api.ts` (PR-3 Task 1) |
| 리그 타입 | `V1LeagueFixture` 에 `homeSlotId?/awaySlotId?/game?`, `homeTeamId: string \| null`; `V1AdminLeagueDetail.slots?: V1AdminBracketSlot[]`; **`V1AdminLeagueTeam.registrationId: string \| null`(필수 필드, 값만 nullable — 색인 공유 계약)** | `types/league-match.ts` (PR-5b Task 1) |
| 테스트 빌더 | `makeGroup({ id, name, phase, … })`·`makeFixture({ id, groupId, fixtureNumber, … })`·`makeSlot({ id, … })`·`makeGame({ … })`·`makeRegistration({ id, teamName, … })`·`makeBracket({ … })` | `src/test/bracket-canvas-fixtures.ts` (PR-3 Task 4·9) |

**허용되는 적응은 하나뿐이다.** 위 표와 **구현된** 코드의 props 이름이 다르면 이 계획의 호출부 JSX 만 실제 이름으로 고친다(PR-3 컴포넌트를 포크하거나 래핑하지 않는다). 변이 소유 방식(폼은 `onSubmit`, 액션은 스스로 변이)은 표에 이미 반영돼 있다. 위 표에 있는 이름과 같은 일을 하는 상태 칩 맵·점수 포맷 함수·사이드 라벨 함수·날짜 묶음 함수·테스트 빌더는 **어떤 경우에도 이 PR 에서 새로 만들지 않는다** — 표에 없어서 막히면 그 이름을 만드는 대신 `BLOCKED: {질문}` 으로 보고하고 멈춘다. 그 밖의 차이도 `BLOCKED` 로 보고한다.

## Global Constraints

색인 `Global Constraints` 전부가 적용된다(worktree·pathspec 커밋·`prisma generate` 금지·테스트 명령·로컬 next 금지·changeset·토큰 전용 스타일·44px·`forwardRef` 금지·해요체·주석 1/3 규칙). 이 PR 에만 해당하는 것:

- 백엔드·스키마·마이그레이션 변경이 **없다**. 스키마 해시 5곳·`docs/api/` 갱신 대상이 아니다. changeset 은 `"v1_web": minor` 하나만 쓴다(웹 전용 PR — 색인 "머지 후 확인").
- 새 파일은 `git add -- <파일>` 로 명시 추가한 뒤 `git commit -m "..." -- <경로들>` 로 커밋한다(미추적 파일은 pathspec 커밋만으로 들어가지 않는다). 디렉터리 pathspec 금지.
- UI 문구는 해요체, 모바일 목록·시트의 모든 터치 요소는 `min-h-[44px]`.
- 모바일 시트는 `BottomSheet` 의 `onClose` 모드(`components/v1-ui/bottom-sheet.tsx:46,135-137`)로만 쓴다 — URL 시트(`closeHref`)가 아니다. 뒤로가기 닫기는 `useModalA11y(closeOnBack)` → `useOverlayHistory` 가 맡으므로 이 PR 이 히스토리 코드를 새로 쓰지 않는다.
- `[id]`·`[leagueId]` 가 들어간 경로는 git pathspec 에서 글롭으로 읽히므로 `":(literal)<경로>"` 로 쓴다.
- 시트 안에서 구조를 바꾸는 동작(경기 추가·삭제·연결·템플릿·일정/장소 편집·무작위 채우기·공개 전환)은 **만들지 않는다.**
- alpha 에 데이터를 쓰는 E2E(Task 13)는 사용자 승인 전에 실행하지 않는다. 캡처 스크립트(Task 11)는 읽기 전용이라 승인 없이 돌릴 수 있다.

## File Structure

| 파일 | 구분 | 책임 | Task |
|---|---|---|---|
| `apps/v1_web/src/hooks/use-media-query.ts` | Modify | `BRACKET_CANVAS_WIDE_MEDIA_QUERY = '(min-width: 768px)'` 상수 | 1 |
| `apps/v1_web/src/test/viewport.ts` | Create | 테스트용 `installViewport(width)`·`resizeViewport(width)` | 1 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-responsive.tsx` | Create | `wide`/`narrow` 중 하나만 마운트하는 분기 | 1 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-responsive.test.tsx` | Create | 767/768 경계·리사이즈 교체·한쪽만 마운트 | 1 |
| `apps/v1_web/src/lib/bracket-canvas-mobile-model.ts` | Create | 모바일 목록 모델. Task 2 타입·사이드·후보 빌더 → Task 3 칸 카드 상태 도출 → Task 4 라운드 탭 묶기 순으로 한 파일에 쌓는다 | 2~4 |
| `apps/v1_web/src/lib/bracket-canvas-mobile-model.test.ts` | Create | 모델 계약 테스트(대조군 포함). Task 마다 describe 가 늘어난다 | 2~4 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.tsx` | Create | 라운드 탭/셀렉트·칸 카드 목록·안내·빈 상태·시트 열림 상태 | 5 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-sheet.tsx` | Create | 시트 본문: 상세(팀·결과 섹션)와 팀 고르기 | 6·7 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx` | Create | 목록·시트·팀 넣기 흐름 테스트 | 5~7 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.history.test.tsx` | Create | 실제 오버레이 히스토리로 뒤로가기 닫기 검증 | 8 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.tsx` | Create | 토너먼트 모바일 컨테이너: 조회·로딩/에러/빈 상태·모델 변환 | 9 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.test.tsx` | Create | 컨테이너 계약 테스트 | 9 |
| `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx` | Modify (PR-3 Task 15 산출물) | 그림 뷰의 `BracketCanvasWorkspace` 를 `BracketCanvasResponsive` 로 감싸 `wide`/`narrow` 로 가른다 | 9 |
| `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.test.tsx` | Modify (PR-3 Task 15 산출물) | 데스크톱 뷰포트 명시 + 모바일 컨테이너 stub | 9 |
| `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.responsive.test.tsx` | Create | 페이지가 뷰포트별로 누구를 어떤 props 로 마운트하는지 | 9 |
| `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx` | Modify (PR-5b Task 9 산출물) | 일정 보드를 `BracketCanvasResponsive` 로 감싼다 | 10 |
| `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx` | Modify (PR-5b Task 9 산출물) | 보드 케이스는 데스크톱 뷰포트로 고정, 모바일 분기 케이스 추가 | 10 |
| `scripts/capture-alpha-bracket-canvas.mjs` | Create | 읽기 전용 390/768/1440 캡처 + 계산값 판정 | 11 |
| `scripts/README-alpha-verify.md` | Modify | 스크립트 표에 한 줄 | 11 |
| `apps/v1_api/test/config/alpha-probe-readonly.contract.spec.ts` | Modify | `READ_ONLY_SCRIPTS` 에 새 스크립트 등록 | 11 |
| `.changeset/admin-bracket-canvas-mobile.md` | Create | PR-6 changeset(`v1_web` 만) | 12 |
| `.github/tasks/20261057-admin-bracket-canvas.md` | Modify | Status·PR-6 체크박스 | 12 |

`lib/competition-status.ts`(`bracketNodeStateChip`)·`lib/bracket-canvas-layout.ts`·`lib/league-board-model.ts`·`lib/game-result-score.ts` 는 **읽기만** 한다 — 이 PR 이 수정하지 않는다.

---

### Task 1: 뷰포트 분기 (`BracketCanvasResponsive`) + 테스트용 뷰포트 스텁

**Files:**
- Modify: `apps/v1_web/src/hooks/use-media-query.ts` (파일 끝, 현재 41행 `DESKTOP_LIST_MEDIA_QUERY` 선언 뒤에 추가)
- Create: `apps/v1_web/src/test/viewport.ts`
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-responsive.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-responsive.test.tsx`

**Interfaces:**
- Consumes: `useMediaQuery(query: string, serverFallback = false): boolean` (`hooks/use-media-query.ts:15`)
- Produces:
  - `export const BRACKET_CANVAS_WIDE_MEDIA_QUERY = '(min-width: 768px)'`
  - `export function BracketCanvasResponsive(props: { wide: ReactNode; narrow: ReactNode }): JSX.Element`
  - `export function installViewport(width: number): () => void` (복원 함수 반환), `export function resizeViewport(width: number): void`

- [ ] **Step 1: 선행 조건 대조 (코드 변경 없음)**

PR-3·4·5b 가 머지된 base 인지, 위 "선행 조건" 표의 이름이 실제로 있는지 확인한다. 하나라도 비면 만들지 말고 멈춘다.

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git fetch origin dev -q && git log origin/dev --oneline -1
cd apps/v1_web
ls src/components/admin/bracket-canvas/
grep -n "export type FixtureNodeState\|export function fixtureNodeState\|export function fixtureSideLabel\|export function buildSideLabelContext\|export type SideLabelContext\|export type SideKey" src/lib/bracket-canvas-layout.ts
grep -n "export function bracketNodeStateChip" src/lib/competition-status.ts
grep -n "export function formatGameResultScoreWithPenalties" src/lib/game-result-score.ts
grep -n "export function buildLeagueBoard\|export interface LeagueBoardNode\|export interface LeagueBoardSide" src/lib/league-board-model.ts
grep -n "export function useV1AssignTournamentSlot\|export function useV1QuickResult" src/hooks/use-v1-bracket-canvas.ts
grep -n "export function describeBracketCanvasError" src/lib/bracket-canvas-errors.ts
grep -n "export function makeGroup\|export function makeFixture\|export function makeSlot\|export function makeGame\|export function makeRegistration\|export function makeBracket" src/test/bracket-canvas-fixtures.ts
grep -n "export function BracketQuickResultForm\|export function BracketResultActions\|export function BracketCanvasWorkspace" src/components/admin/bracket-canvas/*.tsx
grep -n "registrationId" src/types/league-match.ts
grep -n "LeagueScheduleBoard\|initialView" "src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx"
```

Expected: 각 줄이 한 개 이상 출력되고, `src/types/league-match.ts` 의 `registrationId` 는 `registrationId: string | null;`(물음표 없음)이다. 표의 시그니처와 props 이름이 다르면 "허용되는 적응"에 따라 이후 Task 5~10 의 호출부 JSX 만 맞춘다. 위 이름 중 없는 것이 있으면 같은 일을 하는 함수를 이 PR 에서 만들지 않고 `BLOCKED` 로 보고한다.

- [ ] **Step 2: 테스트용 뷰포트 스텁 작성**

`apps/v1_web/src/test/viewport.ts`:

```ts
import { act } from '@testing-library/react';

/**
 * jsdom 에는 레이아웃이 없다. `(min-width: Npx)` 질의만 현재 폭으로 판정하는 matchMedia 스텁이고,
 * 폭이 바뀌면 구독자에게 change 를 알린다(`useMediaQuery` 가 이 경로로 갱신된다).
 * 불가피한 브라우저 API mock(CLAUDE.md 품질 규칙 3의 예외).
 */
let currentWidth = 1280;
const listeners = new Set<() => void>();

export function installViewport(width: number): () => void {
  const original = window.matchMedia;
  currentWidth = width;
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return {
      get matches() {
        return min !== null && currentWidth >= Number(min[1]);
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, callback: () => void) => listeners.add(callback),
      removeEventListener: (_type: string, callback: () => void) => listeners.delete(callback),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
    listeners.clear();
  };
}

export function resizeViewport(width: number): void {
  currentWidth = width;
  act(() => {
    listeners.forEach((callback) => callback());
  });
}
```

- [ ] **Step 3: 실패하는 테스트 작성**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-responsive.test.tsx`:

```tsx
/**
 * 768 이 경계다(스펙 D8: 구조 편집은 768px 이상). 두 뷰 중 **하나만** 마운트돼야 한다 —
 * 둘 다 마운트하면 모바일에서도 데스크톱 캔버스의 끌어 놓기·같은 aria-label 이 살아 있다.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { installViewport, resizeViewport } from '@/test/viewport';
import { BracketCanvasResponsive } from './bracket-canvas-responsive';

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

function renderSwitch() {
  return render(
    <BracketCanvasResponsive
      wide={<div data-testid="wide-view">큰 화면</div>}
      narrow={<div data-testid="narrow-view">작은 화면</div>}
    />,
  );
}

describe('BracketCanvasResponsive', () => {
  it('767px 는 모바일 뷰만 마운트한다', () => {
    restore = installViewport(767);
    renderSwitch();
    expect(screen.getByTestId('narrow-view')).toBeInTheDocument();
    expect(screen.queryByTestId('wide-view')).not.toBeInTheDocument();
  });

  it('768px 부터 큰 화면 뷰만 마운트한다', () => {
    restore = installViewport(768);
    renderSwitch();
    expect(screen.getByTestId('wide-view')).toBeInTheDocument();
    expect(screen.queryByTestId('narrow-view')).not.toBeInTheDocument();
  });

  it('창 크기가 바뀌면 뷰가 교체되고 이전 뷰는 언마운트된다', () => {
    restore = installViewport(390);
    renderSwitch();
    expect(screen.getByTestId('narrow-view')).toBeInTheDocument();

    resizeViewport(1200);
    expect(screen.getByTestId('wide-view')).toBeInTheDocument();
    expect(screen.queryByTestId('narrow-view')).not.toBeInTheDocument();

    resizeViewport(500);
    expect(screen.getByTestId('narrow-view')).toBeInTheDocument();
    expect(screen.queryByTestId('wide-view')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 실행해 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-responsive.test.tsx
```

Expected: FAIL — `Failed to resolve import "./bracket-canvas-responsive"` (모듈 없음).

- [ ] **Step 5: 구현**

`apps/v1_web/src/hooks/use-media-query.ts` 끝에 추가:

```ts

/**
 * 어드민 대진 그림이 편집 가능한 캔버스(데스크톱)로 바뀌는 폭. 스펙 D8 — 구조 편집은 768px 이상.
 * Tailwind `md` 와 같은 값이다.
 */
export const BRACKET_CANVAS_WIDE_MEDIA_QUERY = '(min-width: 768px)';
```

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-responsive.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { BRACKET_CANVAS_WIDE_MEDIA_QUERY, useMediaQuery } from '@/hooks/use-media-query';

/**
 * 폭에 따라 뷰를 **하나만** 마운트한다. CSS 로 숨기지 않는 이유: 캔버스는 끌어 놓기와 칸 aria-label 을
 * 갖고 있어 숨겨진 채로 남으면 모바일에서도 같은 칸이 두 벌이 된다.
 * 서버 렌더 기본값은 모바일이다 — 이 화면은 데이터가 스켈레톤 뒤에서 오므로 첫 페인트에 번쩍이지 않는다.
 */
export function BracketCanvasResponsive({ wide, narrow }: { wide: ReactNode; narrow: ReactNode }) {
  const isWide = useMediaQuery(BRACKET_CANVAS_WIDE_MEDIA_QUERY);
  return <>{isWide ? wide : narrow}</>;
}
```

- [ ] **Step 6: 실행해 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-responsive.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 7: 타입 확인과 커밋**

```bash
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
cd ../.. && git add -- apps/v1_web/src/test/viewport.ts apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-responsive.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-responsive.test.tsx
git commit -m "feat(admin): 대진 그림 뷰포트 분기(768) 추가" -- apps/v1_web/src/hooks/use-media-query.ts apps/v1_web/src/test/viewport.ts apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-responsive.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-responsive.test.tsx
git show --stat HEAD
```

Expected: tsc 0 오류, 커밋에 위 4개 파일만 포함.

---

### Task 2: 모바일 목록 모델 ① — 타입·사이드·후보 빌더 (순수 함수)

대진 응답을 "라운드 탭 → 섹션 → 칸" 으로 바꾸는 모델의 첫 조각이다. 캔버스 좌표(`buildCanvasLayout`)와 무관하다. 모델은 세 Task 로 쌓는다 — **Task 2(이 Task)** 타입과 사이드·후보 빌더 → **Task 3** 칸 카드 상태 도출 → **Task 4** 라운드 탭 묶기. 각 Task 는 자기 red/green/commit 을 가진다.

**Files:**
- Create: `apps/v1_web/src/lib/bracket-canvas-mobile-model.ts`
- Test: `apps/v1_web/src/lib/bracket-canvas-mobile-model.test.ts`

**Interfaces:**
- Consumes: `fixtureSideLabel`·`buildSideLabelContext`·타입 `FixtureNodeState`·`SideKey`·`SideLabelContext`(`lib/bracket-canvas-layout.ts`, PR-3) · `LeagueBoardSide`(`lib/league-board-model.ts`, PR-5b) · 타입 `V1AdminBracketFixture`·`V1AdminBracketFixtureGame`·`V1AdminBracketSlot`·`V1AdminTournamentRegistration`(`types/api.ts`) · `V1AdminLeagueTeam`(`types/league-match.ts`) · 테스트 빌더 `makeFixture`·`makeGroup`·`makeSlot`(`test/bracket-canvas-fixtures.ts`, PR-3)
- Produces:
  - `interface MobileSide { slotId: string | null; slotKind: 'ENTRY' | 'BYE' | 'GROUP_RANK' | null; registrationId: string | null; teamName: string | null; slotLabel: string | null }`
  - `interface MobileNode { fixtureId: string; title: string; state: FixtureNodeState; home: MobileSide; away: MobileSide; scoreText: string | null; scheduledAt: string | null; venue: string | null; game: V1AdminBracketFixtureGame | null; knockout: boolean; quickEntered: boolean }`
  - `interface MobileSection { key: string; heading: string | null; nodes: MobileNode[] }` · `interface MobileRound { key: string; label: string; sections: MobileSection[] }` · `interface MobilePickCandidate { registrationId: string; teamName: string }`
  - `sideDisplayName(side)` · `hasTeam(side)` · `bracketMobileSide(fixture, side, labels)` · `leagueMobileSide(side, slotsById)`
  - `candidatesFromRegistrations(regs)` · `candidatesFromLeagueTeams(teams)` · `pickableCandidates(candidates, slots, target)`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/v1_web/src/lib/bracket-canvas-mobile-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSideLabelContext } from '@/lib/bracket-canvas-layout';
import { makeFixture, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import {
  bracketMobileSide,
  candidatesFromLeagueTeams,
  candidatesFromRegistrations,
  hasTeam,
  leagueMobileSide,
  pickableCandidates,
  sideDisplayName,
} from './bracket-canvas-mobile-model';

describe('bracketMobileSide / sideDisplayName', () => {
  const slots = [
    makeSlot({ id: 's-gr', kind: 'GROUP_RANK', label: 'A조 1위' }),
    makeSlot({ id: 's-e', kind: 'ENTRY', label: '2번 자리', registrationId: 'r-2', teamName: '마포FC' }),
  ];
  const groups = [
    makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 }),
    makeGroup({ id: 'g-s', phase: 'semi', name: '4강', sortOrder: 2 }),
  ];
  const quarter = makeFixture({
    id: 'f-1', groupId: 'g-q', fixtureNumber: 1, homeSlotId: 's-gr', awaySlotId: 's-e', awayRegistrationId: 'r-2', awayTeamName: '마포FC',
  });
  const semi = makeFixture({
    id: 'f-5', groupId: 'g-s', fixtureNumber: 5, bracketSources: [{ fixtureId: 'f-1', outcome: 'WINNER', side: 'HOME' }],
  });
  const labels = buildSideLabelContext(groups, [quarter, semi], slots);

  it('팀이 있으면 팀 이름이 보이고 자리 라벨은 숨는다', () => {
    const away = bracketMobileSide(quarter, 'AWAY', labels);
    expect(away).toEqual({ slotId: 's-e', slotKind: 'ENTRY', registrationId: 'r-2', teamName: '마포FC', slotLabel: null });
    expect(hasTeam(away)).toBe(true);
    expect(sideDisplayName(away)).toBe('마포FC');
  });

  it('팀이 없고 자리가 있으면 자리 라벨 — 조 순위 자리는 종류도 보존한다', () => {
    const home = bracketMobileSide(quarter, 'HOME', labels);
    expect(home).toEqual({ slotId: 's-gr', slotKind: 'GROUP_RANK', registrationId: null, teamName: null, slotLabel: 'A조 1위' });
    expect(hasTeam(home)).toBe(false);
    expect(sideDisplayName(home)).toBe('A조 1위');
  });

  it('자리가 없고 앞 경기 결과를 기다리면 PR-3 라벨("8강 1번 경기 승자"), 아무것도 없으면 미정', () => {
    const waiting = bracketMobileSide(semi, 'HOME', labels);
    expect(waiting.slotId).toBeNull();
    expect(waiting.slotKind).toBeNull();
    expect(sideDisplayName(waiting)).toBe('8강 1번 경기 승자');
    expect(sideDisplayName(bracketMobileSide(semi, 'AWAY', labels))).toBe('미정');
  });
});

describe('leagueMobileSide', () => {
  const slotsById = new Map([['s-1', makeSlot({ id: 's-1', kind: 'ENTRY' })]]);

  it('보드 사이드에서 팀 이름·자리 라벨을 갈라 받고 자리 종류를 자리 목록에서 찾는다', () => {
    expect(leagueMobileSide({ slotId: 's-1', label: '강남FC', filled: true, registrationId: 'r-1' }, slotsById)).toEqual({
      slotId: 's-1', slotKind: 'ENTRY', registrationId: 'r-1', teamName: '강남FC', slotLabel: null,
    });
    expect(leagueMobileSide({ slotId: 's-1', label: '1번 자리', filled: false, registrationId: null }, slotsById)).toEqual({
      slotId: 's-1', slotKind: 'ENTRY', registrationId: null, teamName: null, slotLabel: '1번 자리',
    });
  });

  it('자리가 없는 사이드(예전 경기)는 자리 종류가 없고, 부전승 라벨도 그대로 보인다', () => {
    const bye = leagueMobileSide({ slotId: null, label: '부전승', filled: false, registrationId: null }, slotsById);
    expect(bye.slotKind).toBeNull();
    expect(sideDisplayName(bye)).toBe('부전승');
  });
});

describe('후보 팀', () => {
  it('확정된 등록만 후보가 된다', () => {
    expect(
      candidatesFromRegistrations([
        { id: 'r-1', status: 'confirmed', teamName: '강남FC' },
        { id: 'r-2', status: 'waitlisted', teamName: '마포FC' },
        { id: 'r-3', status: 'confirmed', teamName: null },
      ]),
    ).toEqual([
      { registrationId: 'r-1', teamName: '강남FC' },
      { registrationId: 'r-3', teamName: '이름 없는 팀' },
    ]);
  });

  it('리그 참가팀은 registrationId 가 있는 팀만 후보가 된다 (값이 null 이면 빠진다)', () => {
    expect(
      candidatesFromLeagueTeams([
        { name: '강남FC', registrationId: 'r-1' },
        { name: '없음FC', registrationId: null },
      ]),
    ).toEqual([{ registrationId: 'r-1', teamName: '강남FC' }]);
  });

  it('이미 다른 ENTRY·BYE 자리에 있는 팀은 빼고, GROUP_RANK 자리에 있는 팀과 지금 자리의 팀은 다르게 다룬다', () => {
    const target = makeSlot({ id: 's-target', kind: 'ENTRY' });
    const slots = [
      target,
      makeSlot({ id: 's-e', kind: 'ENTRY', registrationId: 'r-3' }),
      makeSlot({ id: 's-b', kind: 'BYE', registrationId: 'r-5' }),
      makeSlot({ id: 's-gr', kind: 'GROUP_RANK', registrationId: 'r-4' }),
    ];
    const candidates = ['r-1', 'r-2', 'r-3', 'r-4', 'r-5'].map((registrationId) => ({ registrationId, teamName: registrationId }));
    expect(pickableCandidates(candidates, slots, target).map((c) => c.registrationId)).toEqual(['r-1', 'r-2', 'r-4']);

    // 대조군: 자기 자리의 팀은 제외되지 않는다(비우기·교체는 호출부가 따로 다룬다)
    const own = { ...target, registrationId: 'r-1' };
    expect(pickableCandidates(candidates, [own, ...slots.slice(1)], own).map((c) => c.registrationId)).toContain('r-1');
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-canvas-mobile-model.test.ts
```

Expected: FAIL — `Failed to resolve import "./bracket-canvas-mobile-model"`.

- [ ] **Step 3: 구현**

`apps/v1_web/src/lib/bracket-canvas-mobile-model.ts`:

```ts
import { fixtureSideLabel, type FixtureNodeState, type SideKey, type SideLabelContext } from '@/lib/bracket-canvas-layout';
import type { LeagueBoardSide } from '@/lib/league-board-model';
import type {
  V1AdminBracketFixture,
  V1AdminBracketFixtureGame,
  V1AdminBracketSlot,
  V1AdminTournamentRegistration,
} from '@/types/api';
import type { V1AdminLeagueTeam } from '@/types/league-match';

export interface MobileSide {
  slotId: string | null;
  slotKind: V1AdminBracketSlot['kind'] | null;
  registrationId: string | null;
  teamName: string | null;
  slotLabel: string | null;
}

export interface MobileNode {
  fixtureId: string;
  title: string;
  state: FixtureNodeState;
  home: MobileSide;
  away: MobileSide;
  scoreText: string | null;
  scheduledAt: string | null;
  venue: string | null;
  game: V1AdminBracketFixtureGame | null;
  /** 결선 경기 — 무승부 시 승부차기를 받는다(조별·리그는 받지 않는다). */
  knockout: boolean;
  quickEntered: boolean;
}

export interface MobileSection {
  key: string;
  heading: string | null;
  nodes: MobileNode[];
}

export interface MobileRound {
  key: string;
  label: string;
  sections: MobileSection[];
}

export interface MobilePickCandidate {
  registrationId: string;
  teamName: string;
}

export function sideDisplayName(side: MobileSide): string {
  return side.teamName || side.slotLabel || '미정';
}

export function hasTeam(side: MobileSide): boolean {
  return side.teamName !== null;
}

/** 팀이 없을 때의 문구(자리 라벨 → 앞 경기 승자/패자 → 미정)는 PR-3 `fixtureSideLabel` 하나가 정한다. */
export function bracketMobileSide(fixture: V1AdminBracketFixture, side: SideKey, labels: SideLabelContext): MobileSide {
  const registrationId = side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId;
  const slotId = side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId;
  return {
    slotId,
    slotKind: slotId === null ? null : (labels.slotsById.get(slotId)?.kind ?? null),
    registrationId,
    teamName: registrationId === null ? null : side === 'HOME' ? fixture.homeTeamName : fixture.awayTeamName,
    slotLabel: registrationId === null ? fixtureSideLabel(fixture, side, labels) : null,
  };
}

/** 리그 사이드의 이름·라벨은 PR-5b `buildLeagueBoard` 가 이미 정했다 — 팀/라벨로 가르고 자리 종류만 보탠다. */
export function leagueMobileSide(side: LeagueBoardSide, slotsById: ReadonlyMap<string, V1AdminBracketSlot>): MobileSide {
  return {
    slotId: side.slotId,
    slotKind: side.slotId === null ? null : (slotsById.get(side.slotId)?.kind ?? null),
    registrationId: side.registrationId,
    teamName: side.filled ? side.label : null,
    slotLabel: side.filled ? null : side.label,
  };
}

export function candidatesFromRegistrations(
  registrations: ReadonlyArray<Pick<V1AdminTournamentRegistration, 'id' | 'status' | 'teamName'>>,
): MobilePickCandidate[] {
  return registrations
    .filter((r) => r.status === 'confirmed')
    .map((r) => ({ registrationId: r.id, teamName: r.teamName ?? '이름 없는 팀' }));
}

export function candidatesFromLeagueTeams(
  teams: ReadonlyArray<Pick<V1AdminLeagueTeam, 'name' | 'registrationId'>>,
): MobilePickCandidate[] {
  return teams.flatMap((team) => (team.registrationId === null ? [] : [{ registrationId: team.registrationId, teamName: team.name }]));
}

/**
 * 서버 규칙(S3)과 같다 — 같은 팀은 ENTRY·BYE 자리 중 한 곳에만 둘 수 있고(교차 포함),
 * GROUP_RANK 자리는 이 제약과 무관하다. 지금 자리(target)에 있는 팀은 "다른 자리"가 아니다.
 */
export function pickableCandidates(
  candidates: MobilePickCandidate[],
  slots: V1AdminBracketSlot[],
  target: V1AdminBracketSlot,
): MobilePickCandidate[] {
  const placed = new Set(
    slots
      .filter((s) => s.id !== target.id && s.kind !== 'GROUP_RANK' && s.registrationId !== null)
      .map((s) => s.registrationId),
  );
  return candidates.filter((c) => !placed.has(c.registrationId));
}
```

- [ ] **Step 4: 실행해 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-canvas-mobile-model.test.ts
```

Expected: PASS (8 tests). `bracketMobileSide` 의 PR-3 라벨 케이스가 실패하면 먼저 Task 1 Step 1 에서 확인한 `fixtureSideLabel` 의 실제 문구와 이 테스트의 `'8강 1번 경기 승자'` 를 비교한다 — 다르면 테스트의 기대 문자열만 실제 PR-3 문구에 맞춘다(라벨을 이 PR 에서 만들지 않는다).

- [ ] **Step 5: 타입 확인과 커밋**

```bash
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
cd ../.. && git add -- apps/v1_web/src/lib/bracket-canvas-mobile-model.ts apps/v1_web/src/lib/bracket-canvas-mobile-model.test.ts
git commit -m "feat(admin): 대진 모바일 모델 타입·사이드·후보 빌더" -- apps/v1_web/src/lib/bracket-canvas-mobile-model.ts apps/v1_web/src/lib/bracket-canvas-mobile-model.test.ts
git show --stat HEAD
```

Expected: tsc 0 오류, 커밋에 두 파일만.

---

### Task 3: 모바일 목록 모델 ② — 칸 카드 상태 도출

칸 하나(`MobileNode`)가 어떤 상태·점수·입력 방식으로 보이는지 정하는 조각이다. 상태 칸 매핑은 PR-3 `fixtureNodeState` 가, 리그 노드의 상태·사이드는 PR-5b `buildLeagueBoard` 가 이미 정했으므로 여기서는 **그 결과를 카드 모양으로 옮기고**, 새로 정하는 규칙은 둘뿐이다 — ① 토너먼트 경기의 팀매치 `status === 'cancelled'` 는 게임이 `SCHEDULED` 로 남아 있어도 `cancelled` 로 보인다(PR-5b 보드 모델과 같은 규칙) ② 점수 글자는 확정(또는 확정 전) 결과에만 붙는다.

**Files:**
- Modify: `apps/v1_web/src/lib/bracket-canvas-mobile-model.ts` (Task 2 파일에 추가)
- Test: `apps/v1_web/src/lib/bracket-canvas-mobile-model.test.ts` (Task 2 파일 끝에 describe 추가, import 블록 확장)

**Interfaces:**
- Consumes: `fixtureNodeState`(PR-3) · `formatGameResultScoreWithPenalties`(`lib/game-result-score.ts`) · `LeagueBoardNode`(PR-5b) · Task 2 의 `bracketMobileSide`·`leagueMobileSide` · 테스트 빌더 `makeGame`
- Produces: `bracketMobileNode(fixture: V1AdminBracketFixture, groupName: string | null, knockout: boolean, labels: SideLabelContext): MobileNode` · `leagueMobileNode(node: LeagueBoardNode, slotsById: ReadonlyMap<string, V1AdminBracketSlot>): MobileNode`

- [ ] **Step 1: 실패하는 테스트 추가**

`bracket-canvas-mobile-model.test.ts` 의 import 를 아래처럼 바꾸고(기존 이름은 유지, 새 이름만 추가), 파일 끝에 describe 를 붙인다.

```ts
import type { LeagueBoardNode } from '@/lib/league-board-model';
import type { V1AdminBracketFixtureGame } from '@/types/api';
import { makeFixture, makeGame, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import {
  bracketMobileNode,
  bracketMobileSide,
  leagueMobileNode,
  // …Task 2 에서 가져온 나머지 이름은 그대로
} from './bracket-canvas-mobile-model';
```

```ts

const officialGame = (entryMethod: 'quick' | 'console' = 'quick'): V1AdminBracketFixtureGame =>
  makeGame({
    state: 'ENDED',
    latestRevision: { id: 'rev-1', state: 'OFFICIAL', score: { home: 2, away: 1, penalties: { home: 4, away: 3 } }, entryMethod },
  });

describe('bracketMobileNode — 상태·점수·입력 방식', () => {
  const group = makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 });
  const nodeOf = (overrides: Parameters<typeof makeFixture>[0], knockout = true, groupName: string | null = '8강') => {
    const fixture = makeFixture(overrides);
    return bracketMobileNode(fixture, groupName, knockout, buildSideLabelContext([group], [fixture], []));
  };

  it('제목은 조 이름 · 경기 번호, 조 이름이 없으면 경기 번호만이고 결선 여부는 그대로 실린다', () => {
    const inGroup = nodeOf({ id: 'f-1', groupId: 'g-q', fixtureNumber: 3 });
    expect(inGroup.title).toBe('8강 · 3번 경기');
    expect(inGroup.knockout).toBe(true);
    const orphan = nodeOf({ id: 'f-9', groupId: null, fixtureNumber: 9 }, false, null);
    expect(orphan.title).toBe('9번 경기');
    expect(orphan.knockout).toBe(false);
  });

  it('취소된 경기는 게임이 SCHEDULED 로 남아 있어도 cancelled — 같은 게임의 비취소 경기가 대조군', () => {
    expect(nodeOf({ id: 'f-1', groupId: 'g-q', fixtureNumber: 1, status: 'cancelled', game: makeGame() }).state).toBe('cancelled');
    expect(nodeOf({ id: 'f-2', groupId: 'g-q', fixtureNumber: 2, game: makeGame() }).state).toBe('scheduled');
  });

  it('점수는 확정(또는 확정 전) 결과에만 나온다 — 무효된 리비전에 점수가 남아 있어도 숨긴다', () => {
    const official = nodeOf({ id: 'f-1', groupId: 'g-q', fixtureNumber: 1, game: officialGame() });
    expect(official.state).toBe('official');
    expect(official.scoreText).toBe('2:1 (승부차기 4:3)');

    const submitted = nodeOf({
      id: 'f-2', groupId: 'g-q', fixtureNumber: 2,
      game: makeGame({ state: 'ENDED', latestRevision: { id: 'rev-2', state: 'SUBMITTED', score: { home: 1, away: 0 }, entryMethod: 'console' } }),
    });
    expect(submitted.state).toBe('submitted');
    expect(submitted.scoreText).toBe('1:0');

    const voided = nodeOf({
      id: 'f-3', groupId: 'g-q', fixtureNumber: 3,
      game: makeGame({ state: 'ENDED', latestRevision: { id: 'rev-3', state: 'VOID', score: { home: 5, away: 5 }, entryMethod: 'quick' } }),
    });
    expect(voided.state).toBe('scheduled');
    expect(voided.scoreText).toBeNull();

    expect(nodeOf({ id: 'f-4', groupId: 'g-q', fixtureNumber: 4, game: makeGame() }).scoreText).toBeNull();
    expect(nodeOf({ id: 'f-5', groupId: 'g-q', fixtureNumber: 5, game: null }).scoreText).toBeNull();
  });

  it('빠른 입력 표시(quickEntered)는 리비전 entryMethod 가 quick 일 때만 — console·정정·게임 없음은 아니다', () => {
    expect(nodeOf({ id: 'f-1', groupId: 'g-q', fixtureNumber: 1, game: officialGame('quick') }).quickEntered).toBe(true);
    expect(nodeOf({ id: 'f-2', groupId: 'g-q', fixtureNumber: 2, game: officialGame('console') }).quickEntered).toBe(false);
    expect(nodeOf({ id: 'f-3', groupId: 'g-q', fixtureNumber: 3, game: null }).quickEntered).toBe(false);
  });

  it('일정·장소·게임은 응답 그대로 실린다', () => {
    const node = nodeOf({
      id: 'f-1', groupId: 'g-q', fixtureNumber: 1, scheduledAt: '2026-10-12T05:00:00.000Z', venue: '구장', game: makeGame({ id: 'g-7', version: 3 }),
    });
    expect(node.scheduledAt).toBe('2026-10-12T05:00:00.000Z');
    expect(node.venue).toBe('구장');
    expect(node.game).toMatchObject({ id: 'g-7', version: 3 });
  });
});

describe('leagueMobileNode', () => {
  const boardNode = (overrides: Partial<LeagueBoardNode> = {}): LeagueBoardNode => ({
    fixtureId: 'm-1', title: '1주차', startAt: '2026-10-12T05:00:00.000Z', placeName: '구장', state: 'scheduled', hiddenFromPublic: false,
    home: { slotId: 's-1', label: '강남FC', filled: true, registrationId: 'r-1' },
    away: { slotId: 's-2', label: '2번 자리', filled: false, registrationId: null },
    game: null, ...overrides,
  });
  const slotsById = new Map([
    ['s-1', makeSlot({ id: 's-1' })],
    ['s-2', makeSlot({ id: 's-2' })],
  ]);

  it('보드 노드의 제목·상태·일정을 옮기고, 리그는 결선이 아니다', () => {
    const node = leagueMobileNode(boardNode({ state: 'cancelled' }), slotsById);
    expect(node).toMatchObject({ fixtureId: 'm-1', title: '1주차', state: 'cancelled', scheduledAt: '2026-10-12T05:00:00.000Z', venue: '구장', knockout: false });
    expect(sideDisplayName(node.home)).toBe('강남FC');
    expect(sideDisplayName(node.away)).toBe('2번 자리');
  });

  it('점수·빠른 입력 표시는 토너먼트 칸과 같은 규칙이다', () => {
    const node = leagueMobileNode(boardNode({ state: 'official', game: officialGame('quick') }), slotsById);
    expect(node.scoreText).toBe('2:1 (승부차기 4:3)');
    expect(node.quickEntered).toBe(true);
    expect(leagueMobileNode(boardNode({ state: 'scheduled', game: makeGame() }), slotsById).scoreText).toBeNull();
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-canvas-mobile-model.test.ts
```

Expected: FAIL — Task 2 의 8개는 PASS, 새 describe 는 `bracketMobileNode is not a function` / `leagueMobileNode is not a function`.

- [ ] **Step 3: 구현**

`bracket-canvas-mobile-model.ts` 맨 위 import 두 줄을 아래로 바꾸고

```ts
import {
  fixtureNodeState,
  fixtureSideLabel,
  type FixtureNodeState,
  type SideKey,
  type SideLabelContext,
} from '@/lib/bracket-canvas-layout';
import { formatGameResultScoreWithPenalties } from '@/lib/game-result-score';
import type { LeagueBoardNode, LeagueBoardSide } from '@/lib/league-board-model';
```

`leagueMobileSide` 아래(후보 함수들 위)에 추가한다:

```ts
function scoreTextOf(state: FixtureNodeState, game: V1AdminBracketFixtureGame | null): string | null {
  if (state !== 'official' && state !== 'submitted') return null;
  const score = game?.latestRevision?.score ?? null;
  return score === null ? null : formatGameResultScoreWithPenalties(score);
}

function isQuickEntered(game: V1AdminBracketFixtureGame | null): boolean {
  return game?.latestRevision?.entryMethod === 'quick';
}

export function bracketMobileNode(
  fixture: V1AdminBracketFixture,
  groupName: string | null,
  knockout: boolean,
  labels: SideLabelContext,
): MobileNode {
  const game = fixture.game;
  // 취소는 게임을 SCHEDULED 로 남기는 경우가 있어 팀매치 status 가 먼저다(PR-5b `buildLeagueBoard` 와 같은 규칙).
  const state = fixture.status === 'cancelled' ? 'cancelled' : fixtureNodeState(game);
  return {
    fixtureId: fixture.id,
    title: groupName ? `${groupName} · ${fixture.fixtureNumber}번 경기` : `${fixture.fixtureNumber}번 경기`,
    state,
    home: bracketMobileSide(fixture, 'HOME', labels),
    away: bracketMobileSide(fixture, 'AWAY', labels),
    scoreText: scoreTextOf(state, game),
    scheduledAt: fixture.scheduledAt,
    venue: fixture.venue,
    game,
    knockout,
    quickEntered: isQuickEntered(game),
  };
}

export function leagueMobileNode(node: LeagueBoardNode, slotsById: ReadonlyMap<string, V1AdminBracketSlot>): MobileNode {
  return {
    fixtureId: node.fixtureId,
    title: node.title,
    state: node.state,
    home: leagueMobileSide(node.home, slotsById),
    away: leagueMobileSide(node.away, slotsById),
    scoreText: scoreTextOf(node.state, node.game),
    scheduledAt: node.startAt,
    venue: node.placeName,
    game: node.game,
    knockout: false,
    quickEntered: isQuickEntered(node.game),
  };
}
```

`V1AdminBracketFixture`·`V1AdminBracketFixtureGame` import 는 Task 2 에서 이미 있다.

- [ ] **Step 4: 실행해 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-canvas-mobile-model.test.ts
```

Expected: PASS (8 + 7 tests). 실패하면 먼저 Task 1 Step 1 에서 확인한 `fixtureNodeState` 의 실제 매핑(OFFICIAL→official, SUBMITTED→submitted, VOID→scheduled)과 이 테스트의 가정이 같은지 본다 — 다르면 테스트의 `latestRevision.state` 만 실제 값에 맞춘다.

- [ ] **Step 5: 타입 확인과 커밋**

```bash
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
cd ../.. && git commit -m "feat(admin): 대진 모바일 칸 카드 상태·점수·입력 방식 도출" -- apps/v1_web/src/lib/bracket-canvas-mobile-model.ts apps/v1_web/src/lib/bracket-canvas-mobile-model.test.ts
git show --stat HEAD
```

Expected: tsc 0 오류, 커밋에 두 파일만(두 파일 모두 Task 2 에서 이미 추적 중이라 `git add` 가 필요 없다).

---

### Task 4: 모바일 목록 모델 ③ — 라운드 탭 묶기

칸(`MobileNode`)들을 라운드 탭 → 섹션으로 묶는다. 토너먼트는 조(group) 단계로, 정규 리그는 PR-5b `buildLeagueBoard` 의 경기일 열로 묶는다(날짜 묶음을 이 PR 에서 다시 구현하지 않는다).

**Files:**
- Modify: `apps/v1_web/src/lib/bracket-canvas-mobile-model.ts` (Task 2·3 파일에 추가)
- Test: `apps/v1_web/src/lib/bracket-canvas-mobile-model.test.ts` (Task 2·3 파일 끝에 describe 추가, import 확장)

**Interfaces:**
- Consumes: `buildSideLabelContext`(PR-3) · `buildLeagueBoard`(PR-5b) · Task 3 의 `bracketMobileNode`·`leagueMobileNode` · `V1AdminBracketGroup`·`V1TournamentGroupPhase`(`types/api.ts`) · `V1LeagueFixture`(`types/league-match.ts`)
- Produces:
  - `buildBracketMobileRounds(input: { groups: V1AdminBracketGroup[]; fixtures: V1AdminBracketFixture[]; slots: V1AdminBracketSlot[] }): MobileRound[]`
  - `buildLeagueMobileRounds(input: { fixtures: V1LeagueFixture[]; slots: V1AdminBracketSlot[]; teamNameById: ReadonlyMap<string, string> }): MobileRound[]`
  - `pickInitialRoundKey(rounds: MobileRound[]): string | null`

- [ ] **Step 1: 실패하는 테스트 추가**

`bracket-canvas-mobile-model.test.ts` 의 import 에 아래를 더하고 파일 끝에 describe 를 붙인다.

```ts
import type { V1LeagueFixture } from '@/types/league-match';
import {
  buildBracketMobileRounds,
  buildLeagueMobileRounds,
  pickInitialRoundKey,
  // …앞 Task 의 이름은 그대로
} from './bracket-canvas-mobile-model';
```

```ts

describe('buildBracketMobileRounds', () => {
  const knockoutGroups = [
    // 3·4위전의 sortOrder 가 결승보다 앞서도 결승 탭 안에서는 결승이 먼저여야 한다.
    makeGroup({ id: 'g-3', phase: 'third_place', name: '3위 결정전', sortOrder: 3 }),
    makeGroup({ id: 'g-f', phase: 'final', name: '결승', sortOrder: 4 }),
    makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 }),
    makeGroup({ id: 'g-s', phase: 'semi', name: '4강', sortOrder: 2 }),
  ];
  const knockoutFixtures = [
    makeFixture({ id: 'f-2', groupId: 'g-q', fixtureNumber: 2 }),
    makeFixture({ id: 'f-1', groupId: 'g-q', fixtureNumber: 1 }),
    makeFixture({ id: 'f-5', groupId: 'g-s', fixtureNumber: 5 }),
    makeFixture({ id: 'f-7', groupId: 'g-f', fixtureNumber: 7 }),
    makeFixture({ id: 'f-8', groupId: 'g-3', fixtureNumber: 8 }),
  ];

  it('탭은 단계 순서이고 3·4위전은 결승 탭 안의 두 번째 섹션이다', () => {
    const rounds = buildBracketMobileRounds({ groups: knockoutGroups, fixtures: knockoutFixtures, slots: [] });
    expect(rounds.map((r) => r.label)).toEqual(['8강', '4강', '결승']);
    expect(rounds[2].sections.map((s) => s.heading)).toEqual(['결승', '3위 결정전']);
    // 대조군: 8강 안에서 경기 번호 순
    expect(rounds[0].sections[0].nodes.map((n) => n.fixtureId)).toEqual(['f-1', 'f-2']);
    expect(rounds[0].sections[0].nodes[0].title).toBe('8강 · 1번 경기');
    expect(rounds[0].sections[0].nodes[0].knockout).toBe(true);
  });

  it('같은 경기 번호는 차수(leg) 순이다', () => {
    const [round] = buildBracketMobileRounds({
      groups: [makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 })],
      fixtures: [
        makeFixture({ id: 'leg-2', groupId: 'g-q', fixtureNumber: 1, legNumber: 2 }),
        makeFixture({ id: 'leg-1', groupId: 'g-q', fixtureNumber: 1, legNumber: 1 }),
      ],
      slots: [],
    });
    expect(round.sections[0].nodes.map((n) => n.fixtureId)).toEqual(['leg-1', 'leg-2']);
  });

  it('조별 조는 한 탭으로 묶이고, 조가 하나뿐이면 그 조 이름이 탭 이름이다', () => {
    const multi = buildBracketMobileRounds({
      groups: [
        makeGroup({ id: 'g-a', phase: 'group', name: 'A조', sortOrder: 1 }),
        makeGroup({ id: 'g-b', phase: 'group', name: 'B조', sortOrder: 2 }),
        makeGroup({ id: 'g-s', phase: 'semi', name: '4강', sortOrder: 3 }),
      ],
      fixtures: [
        makeFixture({ id: 'a1', groupId: 'g-a', fixtureNumber: 1 }),
        makeFixture({ id: 'b1', groupId: 'g-b', fixtureNumber: 2 }),
        makeFixture({ id: 's1', groupId: 'g-s', fixtureNumber: 3 }),
      ],
      slots: [],
    });
    expect(multi.map((r) => r.label)).toEqual(['조별', '4강']);
    expect(multi[0].sections.map((s) => s.heading)).toEqual(['A조', 'B조']);
    expect(multi[0].sections[0].nodes[0].knockout).toBe(false);

    const single = buildBracketMobileRounds({
      groups: [makeGroup({ id: 'g-l', phase: 'group', name: '리그', sortOrder: 1 })],
      fixtures: [makeFixture({ id: 'l1', groupId: 'g-l', fixtureNumber: 1 })],
      slots: [],
    });
    expect(single.map((r) => r.label)).toEqual(['리그']);
  });

  it('경기가 없는 조는 탭을 만들지 않고, 조에 속하지 않은 경기는 기타 탭으로 남긴다(조용히 버리지 않는다)', () => {
    const rounds = buildBracketMobileRounds({
      groups: [
        makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 }),
        makeGroup({ id: 'g-empty', phase: 'semi', name: '4강', sortOrder: 2 }),
      ],
      fixtures: [
        makeFixture({ id: 'f-1', groupId: 'g-q', fixtureNumber: 1 }),
        makeFixture({ id: 'orphan', groupId: null, fixtureNumber: 9 }),
        makeFixture({ id: 'ghost', groupId: 'g-deleted', fixtureNumber: 10 }),
      ],
      slots: [],
    });
    expect(rounds.map((r) => r.label)).toEqual(['8강', '기타']);
    expect(rounds[1].sections[0].nodes.map((n) => n.fixtureId)).toEqual(['orphan', 'ghost']);
  });

  it('칸의 사이드 라벨은 같은 응답의 자리·앞 경기 정보로 채워진다', () => {
    const [quarterRound, semiRound] = buildBracketMobileRounds({
      groups: [
        makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 }),
        makeGroup({ id: 'g-s', phase: 'semi', name: '4강', sortOrder: 2 }),
      ],
      fixtures: [
        makeFixture({ id: 'f-1', groupId: 'g-q', fixtureNumber: 1, homeSlotId: 's-1' }),
        makeFixture({ id: 'f-5', groupId: 'g-s', fixtureNumber: 5, bracketSources: [{ fixtureId: 'f-1', outcome: 'WINNER', side: 'AWAY' }] }),
      ],
      slots: [makeSlot({ id: 's-1', label: '1번 자리' })],
    });
    expect(sideDisplayName(quarterRound.sections[0].nodes[0].home)).toBe('1번 자리');
    expect(sideDisplayName(semiRound.sections[0].nodes[0].away)).toBe('8강 1번 경기 승자');
  });
});

describe('pickInitialRoundKey', () => {
  const round = (key: string, states: Array<'scheduled' | 'official' | 'cancelled'>) => ({
    key,
    label: key,
    sections: [{ key, heading: null, nodes: states.map((state, i) => ({ fixtureId: `${key}-${i}`, state }) as never) }],
  });

  it('아직 끝나지 않은 경기가 있는 첫 라운드를 고른다', () => {
    expect(pickInitialRoundKey([round('a', ['official']), round('b', ['official', 'scheduled']), round('c', ['scheduled'])])).toBe('b');
  });
  it('전부 끝났으면 마지막 라운드, 비었으면 null', () => {
    expect(pickInitialRoundKey([round('a', ['official']), round('b', ['cancelled', 'official'])])).toBe('b');
    expect(pickInitialRoundKey([])).toBeNull();
  });
});

describe('buildLeagueMobileRounds', () => {
  const leagueFixture = (o: Partial<V1LeagueFixture> & { teamMatchId: string; startAt: string }): V1LeagueFixture =>
    ({ title: '', homeTeamId: null, awayTeamId: null, placeName: '구장', status: 'matched', ...o }) as unknown as V1LeagueFixture;

  it('KST 날짜별로 묶여 N주차 라운드가 된다 — 자정 직전·직후 경계의 양쪽 대조군 포함', () => {
    const rounds = buildLeagueMobileRounds({
      fixtures: [
        leagueFixture({ teamMatchId: 'm-late', startAt: '2026-10-11T14:59:00.000Z' }), // KST 10/11 23:59
        leagueFixture({ teamMatchId: 'm-0', startAt: '2026-10-11T15:00:00.000Z' }), // KST 10/12 00:00
        leagueFixture({ teamMatchId: 'm-1', startAt: '2026-10-12T05:00:00.000Z' }), // KST 10/12 14:00
      ],
      slots: [],
      teamNameById: new Map(),
    });
    expect(rounds.map((r) => [r.key, r.label])).toEqual([['2026-10-11', '1주차'], ['2026-10-12', '2주차']]);
    expect(rounds[1].sections[0].nodes.map((n) => n.fixtureId)).toEqual(['m-0', 'm-1']);
    expect(rounds[1].sections[0].nodes[0].knockout).toBe(false);
  });

  it('팀 이름은 자리에서, 자리가 없는 기존 경기는 팀 id 로 찾는다 — 빈 사이드는 자리 라벨', () => {
    const slots = [
      makeSlot({ id: 's-1', label: '1번 자리', registrationId: 'r-1', teamName: '강남FC' }),
      makeSlot({ id: 's-2', label: '2번 자리' }),
    ];
    const [round] = buildLeagueMobileRounds({
      fixtures: [
        leagueFixture({ teamMatchId: 'm-slot', startAt: '2026-10-12T05:00:00.000Z', homeSlotId: 's-1', awaySlotId: 's-2', homeTeamId: 'team-1', awayTeamId: null }),
        leagueFixture({ teamMatchId: 'm-legacy', startAt: '2026-10-12T06:00:00.000Z', homeTeamId: 'team-9', awayTeamId: 'team-8' }),
      ],
      slots,
      teamNameById: new Map([['team-9', '서초FC'], ['team-8', '송파FC']]),
    });
    const [withSlots, legacy] = round.sections[0].nodes;
    expect(sideDisplayName(withSlots.home)).toBe('강남FC');
    expect(withSlots.home.registrationId).toBe('r-1');
    expect(sideDisplayName(withSlots.away)).toBe('2번 자리');
    expect(withSlots.away.slotKind).toBe('ENTRY');
    expect(sideDisplayName(legacy.home)).toBe('서초FC');
    expect(legacy.home.slotId).toBeNull();
  });

  it('취소된 경기는 취소 칸으로 남고 라운드에서 빠지지 않는다', () => {
    const [round] = buildLeagueMobileRounds({
      fixtures: [
        leagueFixture({ teamMatchId: 'm-x', startAt: '2026-10-12T05:00:00.000Z', status: 'cancelled' }),
        leagueFixture({ teamMatchId: 'm-y', startAt: '2026-10-12T06:00:00.000Z' }),
      ],
      slots: [],
      teamNameById: new Map(),
    });
    expect(round.sections[0].nodes.map((n) => [n.fixtureId, n.state])).toEqual([['m-x', 'cancelled'], ['m-y', 'scheduled']]);
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-canvas-mobile-model.test.ts
```

Expected: FAIL — 앞 Task 의 15개는 PASS, 새 describe 는 `buildBracketMobileRounds is not a function` 계열.

- [ ] **Step 3: 구현**

`bracket-canvas-mobile-model.ts` 의 import 를 아래처럼 늘리고

```ts
import {
  buildSideLabelContext,
  fixtureNodeState,
  fixtureSideLabel,
  type FixtureNodeState,
  type SideKey,
  type SideLabelContext,
} from '@/lib/bracket-canvas-layout';
import { buildLeagueBoard, type LeagueBoardNode, type LeagueBoardSide } from '@/lib/league-board-model';
```

타입 import 에 `V1AdminBracketGroup`, `V1TournamentGroupPhase` 와 `import type { V1AdminLeagueTeam, V1LeagueFixture } from '@/types/league-match';` 를 추가한 뒤, 파일 끝(`pickableCandidates` 아래)에 붙인다:

```ts
// 3·4위전은 결승과 같은 탭에 둔다 — 탭이 6개를 넘으면 390 폭에서 한 칸이 너무 좁아진다.
const PHASE_BUCKET: Record<V1TournamentGroupPhase, { key: string; label: string }> = {
  group: { key: 'group', label: '조별' },
  round12: { key: 'round12', label: '12강' },
  quarter: { key: 'quarter', label: '8강' },
  semi: { key: 'semi', label: '4강' },
  final: { key: 'final', label: '결승' },
  third_place: { key: 'final', label: '결승' },
};

type FixtureOrder = { fixtureNumber: number; legNumber: number };
const byFixtureOrder = (a: FixtureOrder, b: FixtureOrder) => a.fixtureNumber - b.fixtureNumber || a.legNumber - b.legNumber;

export function buildBracketMobileRounds(input: {
  groups: V1AdminBracketGroup[];
  fixtures: V1AdminBracketFixture[];
  slots: V1AdminBracketSlot[];
}): MobileRound[] {
  const labels = buildSideLabelContext(input.groups, input.fixtures, input.slots);
  const groupIds = new Set(input.groups.map((group) => group.id));
  const groups = [...input.groups].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const rounds: MobileRound[] = [];
  const roundByKey = new Map<string, MobileRound>();
  const thirdPlaceSectionKeys = new Set<string>();

  for (const group of groups) {
    const nodes = input.fixtures
      .filter((f) => f.groupId === group.id)
      .sort(byFixtureOrder)
      .map((f) => bracketMobileNode(f, group.name, group.phase !== 'group', labels));
    if (nodes.length === 0) continue;

    const bucket = PHASE_BUCKET[group.phase as V1TournamentGroupPhase] ?? { key: `phase:${group.phase}`, label: group.name };
    let round = roundByKey.get(bucket.key);
    if (!round) {
      round = { key: bucket.key, label: bucket.label, sections: [] };
      roundByKey.set(bucket.key, round);
      rounds.push(round);
    }
    round.sections.push({ key: group.id, heading: group.name, nodes });
    if (group.phase === 'third_place') thirdPlaceSectionKeys.add(group.id);
  }

  for (const round of rounds) {
    if (round.key === 'group' && round.sections.length === 1) round.label = round.sections[0].heading ?? round.label;
    round.sections.sort((a, b) => Number(thirdPlaceSectionKeys.has(a.key)) - Number(thirdPlaceSectionKeys.has(b.key)));
  }

  const orphans = input.fixtures
    .filter((f) => f.groupId === null || !groupIds.has(f.groupId))
    .sort(byFixtureOrder)
    .map((f) => bracketMobileNode(f, null, false, labels));
  if (orphans.length > 0) rounds.push({ key: 'etc', label: '기타', sections: [{ key: 'etc', heading: null, nodes: orphans }] });
  return rounds;
}

// 리그 응답에는 라운드 번호가 없다 — 경기일(KST) 열이 라운드이고, 열 묶음과 'N주차' 번호는 PR-5b `buildLeagueBoard` 가 정한다.
export function buildLeagueMobileRounds(input: {
  fixtures: V1LeagueFixture[];
  slots: V1AdminBracketSlot[];
  teamNameById: ReadonlyMap<string, string>;
}): MobileRound[] {
  const slotsById = new Map(input.slots.map((slot) => [slot.id, slot]));
  return buildLeagueBoard(input).columns.map((column) => ({
    key: column.key,
    label: `${column.weekNumber}주차`,
    sections: [{ key: column.key, heading: null, nodes: column.nodes.map((node) => leagueMobileNode(node, slotsById)) }],
  }));
}

const UNFINISHED: ReadonlySet<FixtureNodeState> = new Set(['scheduled', 'live', 'submitted']);

/** 운영자가 지금 만져야 할 라운드 — 끝나지 않은 경기가 있는 첫 라운드, 없으면 마지막. */
export function pickInitialRoundKey(rounds: MobileRound[]): string | null {
  const open = rounds.find((round) => round.sections.some((section) => section.nodes.some((node) => UNFINISHED.has(node.state))));
  return open?.key ?? rounds.at(-1)?.key ?? null;
}
```

- [ ] **Step 4: 실행해 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-canvas-mobile-model.test.ts
```

Expected: PASS (8 + 7 + 10 tests).

- [ ] **Step 5: 타입 확인과 커밋**

```bash
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
cd ../.. && git commit -m "feat(admin): 대진 모바일 라운드 탭 묶기(토너먼트 단계·리그 경기일)" -- apps/v1_web/src/lib/bracket-canvas-mobile-model.ts apps/v1_web/src/lib/bracket-canvas-mobile-model.test.ts
git show --stat HEAD
```

Expected: tsc 0 오류, 커밋에 두 파일만. 이 시점에 `bracket-canvas-mobile-model.ts` 가 Task 5~10 이 쓰는 모든 이름(`buildBracketMobileRounds`·`buildLeagueMobileRounds`·`pickInitialRoundKey`·`sideDisplayName`·`hasTeam`·후보 함수 3종·타입 5종)을 export 한다.

---

### Task 5: 모바일 목록 — 라운드 탭·칸 카드·안내

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx`

**Interfaces:**
- Consumes: Task 2~4 의 모델 전부 · `bracketNodeStateChip`(`lib/competition-status.ts`, PR-3 Task 7 — import 만 한다) · `SegmentedTabs`(`components/v1-ui/segmented-tabs.tsx:70`, `items`·`activeId`·`onSelect`·`ariaLabel`·`role`) · `StatusChip`(`components/v1-ui/status-chip.tsx:18`) · `AlertBanner`·`EmptyState`(`components/v1-ui/primitives.tsx:199,425`) · `AdminToastVariant`(`components/admin/index.ts:42`)
- Produces:
  - ```ts
    export interface BracketCanvasMobileProps {
      competitionId: string;
      scope: 'tournament' | 'league';
      rounds: MobileRound[];
      slots: V1AdminBracketSlot[];
      candidates: MobilePickCandidate[];
      canWrite: boolean;
      showToast: (message: string, variant?: AdminToastVariant) => void;
    }
    export function BracketCanvasMobile(props: BracketCanvasMobileProps): JSX.Element
    ```

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx` (이 파일은 Task 6·7 에서 아래에 describe 블록이 이어진다. 공용 fixture 와 mock 은 여기서 한 번만 선언한다):

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBracketMobileRounds, type MobilePickCandidate } from '@/lib/bracket-canvas-mobile-model';
import {
  makeFixture,
  makeGame as buildGame,
  makeGroup as buildGroup,
  makeSlot as buildSlot,
} from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixtureGame, V1AdminBracketSlot, V1TournamentGroupPhase } from '@/types/api';
import { BracketCanvasMobile, type BracketCanvasMobileProps } from './bracket-canvas-mobile';

const { assignSlot, quickMutate } = vi.hoisted(() => ({ assignSlot: vi.fn(), quickMutate: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutateAsync: assignSlot, isPending: false }),
  useV1QuickResult: () => ({ mutate: quickMutate, isPending: false }),
}));
// 폼·액션 내부(검증·확인·정정)는 PR-3 의 테스트가 검증한다. 여기서는 시트가 알맞은 컴포넌트에 알맞은 props 를 넘기고
// 폼의 onSubmit 을 빠른 입력 변이로 이어 주는지만 본다. 폼 mock 의 버튼은 실제 폼처럼 onSubmit 을 호출한다.
vi.mock('./bracket-quick-result-form', () => ({
  BracketQuickResultForm: (props: { homeLabel: string; awayLabel: string; isKnockout: boolean; errorMessage?: string | null; onSubmit: (score: { home: number; away: number }) => void }) => (
    <div data-testid="quick-form" data-knockout={String(props.isKnockout)} data-home={props.homeLabel} data-away={props.awayLabel}>
      {props.errorMessage ? <p role="alert">{props.errorMessage}</p> : null}
      <button type="button" onClick={() => props.onSubmit({ home: 2, away: 1 })}>폼 완료</button>
    </div>
  ),
}));
vi.mock('./bracket-result-actions', () => ({
  BracketResultActions: (props: { tournamentId: string; fixtureId: string; isKnockout: boolean; canWrite: boolean; game: { id: string; latestRevision: { state: string } | null } }): ReactNode => (
    <div data-testid="result-actions" data-tournament-id={props.tournamentId} data-fixture-id={props.fixtureId} data-game-id={props.game.id} data-can-write={String(props.canWrite)} data-revision-state={props.game.latestRevision?.state ?? ''} />
  ),
}));

// 고정 데이터는 PR-3 공용 빌더 위의 얇은 별칭이다 — 이 파일이 자기 빌더를 따로 만들지 않는다.
const slot = (id: string, kind: V1AdminBracketSlot['kind'], label: string, registrationId: string | null, teamName: string | null) =>
  buildSlot({ id, kind, label, registrationId, teamName });

const makeGroup = (id: string, phase: V1TournamentGroupPhase, name: string, sortOrder: number) => buildGroup({ id, phase, name, sortOrder });

const makeGame = (id: string, o: Partial<V1AdminBracketFixtureGame> = {}) => buildGame({ id, ...o });

const revision = (state: string, entryMethod: 'quick' | 'console') => ({
  id: 'rev-1', state, entryMethod, score: { home: 2, away: 1, penalties: { home: 4, away: 3 } },
});

const bothTeams = { homeRegistrationId: 'r3', homeTeamName: '서초FC', awayRegistrationId: 'r4', awayTeamName: '송파FC' };

const groups = [makeGroup('g-q', 'quarter', '8강', 1), makeGroup('g-s', 'semi', '4강', 2), makeGroup('g-f', 'final', '결승', 3)];
const slots = [
  slot('s-h1', 'ENTRY', '1번 자리', 'r1', '강남FC'),
  slot('s-a1', 'ENTRY', '2번 자리', null, null),
  slot('s-x', 'ENTRY', '3번 자리', 'r3', '서초FC'),
  slot('s-bye', 'BYE', '부전승 1', 'r5', '용산FC'),
  slot('s-gr', 'GROUP_RANK', 'A조 1위', null, null),
];
const candidates: MobilePickCandidate[] = [
  { registrationId: 'r1', teamName: '강남FC' },
  { registrationId: 'r2', teamName: '마포FC' },
  { registrationId: 'r3', teamName: '서초FC' },
  { registrationId: 'r4', teamName: '송파FC' },
  { registrationId: 'r5', teamName: '용산FC' },
];
const fixtures = [
  // 한쪽만 찬 예정 경기(자리 연결)
  makeFixture({ id: 'fx-1', groupId: 'g-q', fixtureNumber: 1, homeSlotId: 's-h1', homeRegistrationId: 'r1', homeTeamName: '강남FC', awaySlotId: 's-a1', game: makeGame('g-1') }),
  // 두 팀이 다 찬 예정 경기
  makeFixture({ id: 'fx-2', groupId: 'g-q', fixtureNumber: 2, ...bothTeams, game: makeGame('g-2', { version: 3 }) }),
  // 빠른 입력으로 확정된 경기
  makeFixture({ id: 'fx-3', groupId: 'g-q', fixtureNumber: 3, ...bothTeams, game: makeGame('g-3', { state: 'ENDED', latestRevision: revision('OFFICIAL', 'quick') as never }) }),
  // 라이브 득점 기록이 있는 확정 경기
  makeFixture({ id: 'fx-4', groupId: 'g-q', fixtureNumber: 4, ...bothTeams, game: makeGame('g-4', { state: 'ENDED', hasLiveRecords: true, latestRevision: revision('OFFICIAL', 'console') as never }) }),
  // 콘솔에서 제출돼 확정 대기인 경기
  makeFixture({ id: 'fx-5', groupId: 'g-s', fixtureNumber: 5, ...bothTeams, game: makeGame('g-5', { state: 'ENDED', latestRevision: revision('SUBMITTED', 'console') as never }) }),
  // 조 순위 자리가 걸린 경기
  makeFixture({ id: 'fx-6', groupId: 'g-s', fixtureNumber: 6, homeSlotId: 's-gr', game: makeGame('g-6') }),
  makeFixture({ id: 'fx-9', groupId: 'g-s', fixtureNumber: 9, ...bothTeams, game: makeGame('g-9', { state: 'LIVE' }) }),
  makeFixture({ id: 'fx-7', groupId: 'g-f', fixtureNumber: 7, game: makeGame('g-7') }),
  makeFixture({ id: 'fx-8', groupId: 'g-f', fixtureNumber: 8, status: 'cancelled', game: makeGame('g-8') }),
];

function renderMobile(overrides: Partial<BracketCanvasMobileProps> = {}) {
  const showToast = vi.fn();
  const rounds = buildBracketMobileRounds({ groups, fixtures, slots });
  const utils = render(
    <BracketCanvasMobile competitionId="t-1" scope="tournament" rounds={rounds} slots={slots} candidates={candidates} canWrite showToast={showToast} {...overrides} />,
  );
  return { showToast, ...utils };
}

const card = (name: RegExp) => screen.getByRole('button', { name });

describe('BracketCanvasMobile — 목록', () => {
  it('끝나지 않은 경기가 있는 첫 라운드를 열고 그 라운드의 칸만 보인다', () => {
    renderMobile();
    expect(screen.getByRole('tab', { name: '8강' })).toHaveAttribute('aria-selected', 'true');
    expect(card(/8강 · 1번 경기/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /4강 · 5번 경기/ })).not.toBeInTheDocument();
  });

  it('탭을 바꾸면 그 라운드의 칸으로 바뀐다', () => {
    renderMobile();
    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    expect(card(/4강 · 5번 경기/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /8강 · 1번 경기/ })).not.toBeInTheDocument();
  });

  it('칸에는 팀 이름·자리 라벨·미정이 구분되어 나오고 상태는 글자로 적힌다', () => {
    renderMobile();
    const first = within(card(/8강 · 1번 경기/));
    expect(first.getByText('강남FC')).toBeInTheDocument();
    expect(first.getByText('2번 자리')).toBeInTheDocument();
    expect(first.getByText('예정')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    expect(within(card(/4강 · 6번 경기/)).getByText('A조 1위')).toBeInTheDocument();
    expect(within(card(/4강 · 6번 경기/)).getByText('미정')).toBeInTheDocument();
    expect(within(card(/4강 · 5번 경기/)).getByText('확정 전')).toBeInTheDocument();
    expect(within(card(/4강 · 9번 경기/)).getByText('진행 중')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '결승' }));
    expect(within(card(/결승 · 8번 경기/)).getByText('취소')).toBeInTheDocument();
  });

  it('빠른 입력으로 확정된 칸에만 "어드민 빠른 입력"과 점수가 나온다', () => {
    renderMobile();
    expect(screen.getAllByText('어드민 빠른 입력')).toHaveLength(1);
    const quick = within(card(/8강 · 3번 경기/));
    expect(quick.getByText('어드민 빠른 입력')).toBeInTheDocument();
    expect(quick.getByText('2:1 (승부차기 4:3)')).toBeInTheDocument();
    expect(quick.getByText('확정')).toBeInTheDocument();
    // 대조군: 콘솔로 확정된 칸은 점수는 보이지만 빠른 입력 표시는 없다
    expect(within(card(/8강 · 4번 경기/)).queryByText('어드민 빠른 입력')).not.toBeInTheDocument();
  });

  it('편집 권한이 있으면 큰 화면 안내가 보이고 구조 편집 버튼은 하나도 없다', () => {
    renderMobile();
    expect(screen.getByText(/큰 화면에서 편집해요/)).toBeInTheDocument();
    for (const name of [/템플릿/, /경기 추가/, /무작위/, /연결/, /공개/, /삭제/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('읽기 전용(canWrite=false)이면 안내 없이 칸만 보인다', () => {
    renderMobile({ canWrite: false });
    expect(screen.queryByText(/큰 화면에서 편집해요/)).not.toBeInTheDocument();
    expect(card(/8강 · 1번 경기/)).toBeInTheDocument();
  });

  it('라운드가 6개 이상이면 탭 대신 셀렉트로 고른다 — 5개 이하(위 테스트들)는 탭', () => {
    const wideGroups = [makeGroup('g-12', 'round12', '12강', 0), ...groups, makeGroup('g-g', 'group', 'A조', -1)];
    const wideFixtures = [
      ...fixtures,
      makeFixture({ id: 'fx-12', groupId: 'g-12', fixtureNumber: 12 }),
      makeFixture({ id: 'fx-g', groupId: 'g-g', fixtureNumber: 20 }),
      makeFixture({ id: 'fx-orphan', groupId: null, fixtureNumber: 30 }),
    ];
    const rounds = buildBracketMobileRounds({ groups: wideGroups, fixtures: wideFixtures, slots });
    expect(rounds).toHaveLength(6);
    renderMobile({ rounds });

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: '라운드' });
    expect(within(select).getAllByRole('option')).toHaveLength(6);
    fireEvent.change(select, { target: { value: 'etc' } });
    expect(card(/30번 경기/)).toBeInTheDocument();
  });

  it('대진이 비어 있으면 빈 상태를 보여 준다', () => {
    renderMobile({ rounds: [] });
    expect(screen.getByText('아직 대진이 없어요')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx
```

Expected: FAIL — `Failed to resolve import "./bracket-canvas-mobile"`.

- [ ] **Step 3: 컴포넌트 구현**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.tsx`:

```tsx
'use client';

import { useId, useState } from 'react';
import { Zap } from 'lucide-react';
import type { AdminToastVariant } from '@/components/admin';
import { AlertBanner, EmptyState } from '@/components/v1-ui/primitives';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { StatusChip } from '@/components/v1-ui/status-chip';
import {
  hasTeam,
  pickInitialRoundKey,
  sideDisplayName,
  type MobileNode,
  type MobilePickCandidate,
  type MobileRound,
  type MobileSide,
} from '@/lib/bracket-canvas-mobile-model';
import { bracketNodeStateChip } from '@/lib/competition-status';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import type { V1AdminBracketSlot } from '@/types/api';

export interface BracketCanvasMobileProps {
  competitionId: string;
  scope: 'tournament' | 'league';
  rounds: MobileRound[];
  slots: V1AdminBracketSlot[];
  candidates: MobilePickCandidate[];
  canWrite: boolean;
  showToast: (message: string, variant?: AdminToastVariant) => void;
}

// 390 폭에서 탭 한 칸이 44px 터치 타깃과 3~4글자 라벨을 담을 수 있는 한계. 넘으면 셀렉트로 바꾼다.
const ROUND_TABS_MAX = 5;

const selectClass =
  'h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

function whenText(node: MobileNode): string | null {
  const parts: string[] = [];
  if (node.scheduledAt) parts.push(`${formatKstDateShort(node.scheduledAt)} ${formatKstTime(node.scheduledAt)}`);
  if (node.venue) parts.push(node.venue);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function SideName({ side }: { side: MobileSide }) {
  return (
    <span
      className={`min-w-0 break-keep text-[length:var(--font-size-body-sm)] font-semibold ${hasTeam(side) ? 'text-[var(--text-strong)]' : 'text-[var(--text-muted)]'}`}
    >
      {sideDisplayName(side)}
    </span>
  );
}

function MobileNodeCard({ node, expanded, onOpen }: { node: MobileNode; expanded: boolean; onOpen: (fixtureId: string) => void }) {
  const when = whenText(node);
  return (
    <button
      type="button"
      onClick={() => onOpen(node.fixtureId)}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      className="flex min-h-[44px] w-full flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-3 text-left transition-colors hover:bg-[var(--grey50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)]"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">{node.title}</span>
        <StatusChip chip={bracketNodeStateChip(node.state)} />
      </span>
      <span className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <SideName side={node.home} />
        <span className="text-[length:var(--font-size-caption)] text-[var(--text-caption)]" aria-hidden="true">vs</span>
        <span className="text-right"><SideName side={node.away} /></span>
      </span>
      {node.scoreText ? (
        <span className="text-center text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">{node.scoreText}</span>
      ) : null}
      {when || node.quickEntered ? (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          {when ? <span>{when}</span> : null}
          {node.quickEntered ? (
            <span className="inline-flex items-center gap-1 font-semibold">
              <Zap size={12} aria-hidden="true" />
              어드민 빠른 입력
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

export function BracketCanvasMobile({ rounds, canWrite }: BracketCanvasMobileProps) {
  const roundSelectId = useId();
  const [pickedRoundKey, setPickedRoundKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeKey = rounds.some((round) => round.key === pickedRoundKey) ? pickedRoundKey : pickInitialRoundKey(rounds);
  const activeRound = rounds.find((round) => round.key === activeKey) ?? null;

  if (rounds.length === 0) {
    return (
      <EmptyState
        title="아직 대진이 없어요"
        sub="대진을 만드는 건 큰 화면에서 해요. 만들어지면 여기서 팀을 넣고 결과를 입력할 수 있어요."
      />
    );
  }

  return (
    <section aria-label="대진 보기" className="flex flex-col gap-3">
      {canWrite ? (
        <AlertBanner tone="info" message="대진 구조는 큰 화면에서 편집해요. 여기서는 팀 넣기와 결과 입력을 할 수 있어요." />
      ) : null}

      {rounds.length <= ROUND_TABS_MAX ? (
        <SegmentedTabs
          role="tablist"
          ariaLabel="라운드"
          items={rounds.map((round) => ({ id: round.key, label: round.label }))}
          activeId={activeKey ?? ''}
          onSelect={setPickedRoundKey}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={roundSelectId} className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">
            라운드
          </label>
          <select
            id={roundSelectId}
            className={selectClass}
            value={activeKey ?? ''}
            onChange={(event) => setPickedRoundKey(event.target.value)}
          >
            {rounds.map((round) => (
              <option key={round.key} value={round.key}>
                {round.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {activeRound ? (
        <div role="tabpanel" aria-label={activeRound.label} className="flex flex-col gap-4">
          {activeRound.sections.map((section) => (
            <section key={section.key} className="flex flex-col gap-2">
              {activeRound.sections.length > 1 && section.heading ? (
                <h3 className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">{section.heading}</h3>
              ) : null}
              <ul role="list" className="flex flex-col gap-2">
                {section.nodes.map((node) => (
                  <li key={node.fixtureId}>
                    <MobileNodeCard node={node} expanded={selectedId === node.fixtureId} onOpen={setSelectedId} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: 실행해 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx
```

Expected: PASS (8 tests). `getByRole('combobox', { name: '라운드' })` 가 실패하면 `<label htmlFor>` 연결을 확인한다.

- [ ] **Step 5: 린트·타입 확인과 커밋**

```bash
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs
cd ../.. && git add -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx
git commit -m "feat(admin): 대진 모바일 목록(라운드 탭·칸 카드·큰 화면 안내)" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx
git show --stat HEAD
```

Expected: tsc·패턴 검사 0 오류, 커밋에 두 파일만.

---

### Task 6: 바텀시트 — 상세와 결과 입력·확인·정정

칸을 누르면 `BottomSheet`(onClose 모드)가 열리고, 상태에 맞는 PR-3 폼을 보여 준다. 뒤로가기 닫기는 `BottomSheet` → `useModalA11y({ closeOnBack: true })` 가 이미 처리한다(`bottom-sheet.tsx:135-137`) — Task 8 이 실제 히스토리로 증명한다.

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-sheet.tsx`
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.tsx` (Task 5 에서 만든 파일)
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx` (Task 5 파일 끝에 describe 추가)

**Interfaces:**
- Consumes: `BottomSheet`(`components/v1-ui/bottom-sheet.tsx`, `{ open; onClose; title }`) · PR-3 `useV1QuickResult`·`BracketQuickResultForm`·`BracketResultActions`(위 선행 조건 표 — 폼은 `onSubmit` 만 가지므로 **시트 본문이 `useV1QuickResult` 를 직접 호출해 연결**하고, 액션은 스스로 변이한다) · `describeBracketCanvasError`(`lib/bracket-canvas-errors.ts`, PR-3 Task 2) · Task 2~4 모델 · `bracketNodeStateChip`(PR-3 Task 7)
- Produces:
  ```ts
  export interface MobileNodeSheetBodyProps {
    node: MobileNode; competitionId: string; scope: 'tournament' | 'league'; canWrite: boolean;
    showToast: (message: string, variant?: AdminToastVariant) => void; onDone: () => void;
  }
  export function MobileNodeSheetBody(props: MobileNodeSheetBodyProps): JSX.Element
  ```

- [ ] **Step 1: 실패하는 테스트 추가**

`bracket-canvas-mobile.test.tsx` 맨 아래에 이어서 붙인다:

```tsx

describe('BracketCanvasMobile — 시트', () => {
  const sheet = () => screen.getByRole('dialog');

  beforeEach(() => {
    quickMutate.mockReset();
    quickMutate.mockImplementation((_vars: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
  });

  it('칸을 누르면 시트가 열리고, 두 팀이 정해진 예정 경기는 점수 폼에 결선 여부·팀 이름을 넘긴다', () => {
    renderMobile();
    expect(card(/8강 · 2번 경기/)).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(card(/8강 · 2번 경기/));

    expect(screen.getByRole('dialog', { name: '8강 · 2번 경기' })).toBeInTheDocument();
    expect(card(/8강 · 2번 경기/)).toHaveAttribute('aria-expanded', 'true');
    const form = screen.getByTestId('quick-form');
    expect(form).toHaveAttribute('data-knockout', 'true');
    expect(form).toHaveAttribute('data-home', '서초FC');
    expect(form).toHaveAttribute('data-away', '송파FC');
  });

  it('폼을 제출하면 그 경기의 게임 id·버전으로 빠른 입력 변이를 부르고, 성공하면 토스트와 함께 시트가 닫힌다', () => {
    const { showToast } = renderMobile();
    fireEvent.click(card(/8강 · 2번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '폼 완료' }));

    expect(quickMutate).toHaveBeenCalledTimes(1);
    expect(quickMutate.mock.calls[0][0]).toEqual({ gameId: 'g-2', expectedVersion: 3, score: { home: 2, away: 1 } });
    expect(showToast).toHaveBeenCalledWith('점수를 확정했어요.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('빠른 입력이 실패하면 시트를 닫지 않고 폼에 오류 문구를 보여 준다', () => {
    quickMutate.mockImplementation((_vars: unknown, options?: { onError?: (err: unknown) => void }) => options?.onError?.({}));
    renderMobile();
    fireEvent.click(card(/8강 · 2번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '폼 완료' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(sheet()).getByRole('alert')).toHaveTextContent('점수를 확정하지 못했어요');
  });

  it('한쪽 팀이 미정이면 점수 폼 대신 안내만 나온다', () => {
    renderMobile();
    fireEvent.click(card(/8강 · 1번 경기/));
    expect(screen.queryByTestId('quick-form')).not.toBeInTheDocument();
    expect(within(sheet()).getByText('두 팀이 정해지면 점수를 넣을 수 있어요.')).toBeInTheDocument();
  });

  it('확정 전 결과는 확인 액션을 보여 주고 점수 폼은 숨긴다', () => {
    renderMobile();
    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    fireEvent.click(card(/4강 · 5번 경기/));
    const actions = screen.getByTestId('result-actions');
    expect(actions).toHaveAttribute('data-tournament-id', 't-1');
    expect(actions).toHaveAttribute('data-fixture-id', 'fx-5');
    expect(actions).toHaveAttribute('data-game-id', 'g-5');
    expect(actions).toHaveAttribute('data-can-write', 'true');
    expect(actions).toHaveAttribute('data-revision-state', 'SUBMITTED');
    expect(screen.queryByTestId('quick-form')).not.toBeInTheDocument();
  });

  it('빠른 입력으로 확정된 경기는 고치기·무효 액션과 득점자 없음 안내를 보여 준다', () => {
    renderMobile();
    fireEvent.click(card(/8강 · 3번 경기/));
    expect(screen.getByTestId('result-actions')).toHaveAttribute('data-revision-state', 'OFFICIAL');
    expect(within(sheet()).getByText(/득점자는 기록되지 않았어요/)).toBeInTheDocument();
  });

  it('라이브 득점 기록이 있는 확정 경기는 그림에서 고치지 않고 결과 정정 화면으로 보낸다', () => {
    renderMobile();
    fireEvent.click(card(/8강 · 4번 경기/));
    expect(screen.queryByTestId('result-actions')).not.toBeInTheDocument();
    expect(within(sheet()).getByRole('link', { name: /결과 정정 화면으로 가기/ })).toHaveAttribute(
      'href',
      '/admin/live/t-1/records/corrections?fixtureId=fx-4',
    );
  });

  it('진행 중·취소된 경기에는 폼 없이 안내만 나온다', () => {
    renderMobile();
    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    fireEvent.click(card(/4강 · 9번 경기/));
    expect(within(sheet()).getByText(/라이브 콘솔에서 넣어요/)).toBeInTheDocument();
    expect(screen.queryByTestId('quick-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('result-actions')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    fireEvent.click(screen.getByRole('tab', { name: '결승' }));
    fireEvent.click(card(/결승 · 8번 경기/));
    expect(within(sheet()).getByText('취소된 경기예요.')).toBeInTheDocument();
  });

  it('읽기 전용이면 시트는 열리지만 입력 폼도 액션도 없다(canWrite=true 인 첫 테스트가 대조군)', () => {
    renderMobile({ canWrite: false });
    fireEvent.click(card(/8강 · 2번 경기/));
    expect(sheet()).toBeInTheDocument();
    expect(screen.queryByTestId('quick-form')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.click(card(/8강 · 3번 경기/));
    expect(screen.queryByTestId('result-actions')).not.toBeInTheDocument();
  });

  it('점수가 확정돼 시트가 닫히면 그 칸은 더 이상 펼쳐진 상태가 아니다', () => {
    renderMobile();
    fireEvent.click(card(/8강 · 2번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '폼 완료' }));
    expect(card(/8강 · 2번 경기/)).toHaveAttribute('aria-expanded', 'false');
  });

  it('✕ 로 닫으면 시트가 사라진다', () => {
    renderMobile();
    fireEvent.click(card(/8강 · 1번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx
```

Expected: FAIL — 새 describe 의 `getByRole('dialog', ...)` 가 `Unable to find an accessible element with the role "dialog"` (시트가 아직 없다). Task 5 의 8개는 그대로 PASS.

- [ ] **Step 3: 시트 본문 구현**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-sheet.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { AdminToastVariant } from '@/components/admin';
import { StatusChip } from '@/components/v1-ui/status-chip';
import { useV1QuickResult } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { hasTeam, sideDisplayName, type MobileNode, type MobileSide } from '@/lib/bracket-canvas-mobile-model';
import { bracketNodeStateChip } from '@/lib/competition-status';
import { BracketQuickResultForm } from './bracket-quick-result-form';
import { BracketResultActions } from './bracket-result-actions';

export interface MobileNodeSheetBodyProps {
  node: MobileNode;
  competitionId: string;
  scope: 'tournament' | 'league';
  canWrite: boolean;
  showToast: (message: string, variant?: AdminToastVariant) => void;
  /** 빠른 입력이 성공하면 시트를 닫는다 — 현장 입력은 곧바로 다음 칸으로 넘어가야 한다. */
  onDone: () => void;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[length:var(--font-size-body-sm)] leading-relaxed text-[var(--text-muted)]">{children}</p>;
}

function SideRow({ label, side }: { label: string; side: MobileSide }) {
  return (
    <li className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-[var(--grey50)] px-3 py-2">
      <span className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">{label}</span>
      <span
        className={`min-w-0 break-keep text-right text-[length:var(--font-size-body-sm)] font-semibold ${hasTeam(side) ? 'text-[var(--text-strong)]' : 'text-[var(--text-muted)]'}`}
      >
        {sideDisplayName(side)}
      </span>
    </li>
  );
}

function ResultSection({ node, competitionId, scope, canWrite, showToast, onDone }: MobileNodeSheetBodyProps) {
  // 폼은 제출 로직을 갖지 않는다(PR-3 계약) — 변이를 여기서 소유하고 폼의 onSubmit 으로 잇는다.
  const quickResult = useV1QuickResult(competitionId, scope);
  const [quickError, setQuickError] = useState<string | null>(null);
  const homeName = sideDisplayName(node.home);
  const awayName = sideDisplayName(node.away);

  if (node.state === 'cancelled') return <Note>취소된 경기예요.</Note>;
  if (node.state === 'live') return <Note>진행 중인 경기예요. 결과는 라이브 콘솔에서 넣어요.</Note>;
  if (!canWrite) return null;
  if (node.game === null) return <Note>이 경기는 아직 결과를 넣을 수 없어요.</Note>;

  if (node.state === 'scheduled') {
    if (!hasTeam(node.home) || !hasTeam(node.away)) return <Note>두 팀이 정해지면 점수를 넣을 수 있어요.</Note>;
    const { id: gameId, version } = node.game;
    return (
      <BracketQuickResultForm
        homeLabel={homeName}
        awayLabel={awayName}
        isKnockout={node.knockout}
        submitLabel="점수 확정"
        pending={quickResult.isPending}
        errorMessage={quickError}
        onSubmit={(score) => {
          setQuickError(null);
          quickResult.mutate(
            { gameId, expectedVersion: version, score },
            {
              onSuccess: () => {
                showToast('점수를 확정했어요.');
                onDone();
              },
              onError: (error) => setQuickError(describeBracketCanvasError(error, '점수를 확정하지 못했어요.')),
            },
          );
        }}
      />
    );
  }

  // 라이브로 득점이 기록된 경기는 그림에서 점수만 고치면 기록과 어긋난다 — 기존 정정 화면으로 보낸다.
  if (node.state === 'official' && node.game.hasLiveRecords) {
    return (
      <div className="flex flex-col gap-2">
        <Note>득점 기록이 있는 경기는 결과 정정 화면에서 고쳐요.</Note>
        <Link
          href={`/admin/live/${encodeURIComponent(competitionId)}/records/corrections?fixtureId=${encodeURIComponent(node.fixtureId)}`}
          className="tm-btn tm-btn-md tm-btn-outline min-h-[44px]"
        >
          결과 정정 화면으로 가기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {node.quickEntered ? <Note>어드민 빠른 입력으로 확정한 결과예요. 득점자는 기록되지 않았어요.</Note> : null}
      <BracketResultActions
        tournamentId={competitionId}
        fixtureId={node.fixtureId}
        game={node.game}
        isKnockout={node.knockout}
        homeLabel={homeName}
        awayLabel={awayName}
        canWrite={canWrite}
        showToast={showToast}
      />
    </div>
  );
}

export function MobileNodeSheetBody(props: MobileNodeSheetBodyProps) {
  const { node } = props;
  return (
    <div className="flex flex-col gap-4 pb-1">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip chip={bracketNodeStateChip(node.state)} />
        {node.scoreText ? (
          <span className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">{node.scoreText}</span>
        ) : null}
      </div>
      <ul role="list" aria-label="참가팀" className="flex flex-col gap-2">
        <SideRow label="홈" side={node.home} />
        <SideRow label="어웨이" side={node.away} />
      </ul>
      <ResultSection {...props} />
    </div>
  );
}
```

- [ ] **Step 4: 메인 컴포넌트에 시트 연결**

`bracket-canvas-mobile.tsx` 를 다음과 같이 고친다.

(a) import 블록 — `import { useId, useState } from 'react';` 를 교체하고, 아래 두 줄을 `StatusChip` import 아래에 추가한다:

```tsx
import { useCallback, useId, useState } from 'react';
```
```tsx
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { MobileNodeSheetBody } from './bracket-canvas-mobile-sheet';
```

(b) 컴포넌트 머리 — `findNode` 헬퍼를 `whenText` 위에 추가하고, 함수 시작부를 아래로 교체한다:

```tsx
function findNode(rounds: MobileRound[], fixtureId: string): MobileNode | null {
  for (const round of rounds) {
    for (const section of round.sections) {
      const hit = section.nodes.find((node) => node.fixtureId === fixtureId);
      if (hit) return hit;
    }
  }
  return null;
}
```
```tsx
export function BracketCanvasMobile({ competitionId, scope, rounds, canWrite, showToast }: BracketCanvasMobileProps) {
  const roundSelectId = useId();
  const [pickedRoundKey, setPickedRoundKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closeSheet = useCallback(() => setSelectedId(null), []);

  const activeKey = rounds.some((round) => round.key === pickedRoundKey) ? pickedRoundKey : pickInitialRoundKey(rounds);
  const activeRound = rounds.find((round) => round.key === activeKey) ?? null;
  // 칸이 사라지면(템플릿 교체·새로고침) 시트도 함께 닫힌다 — 없는 경기의 폼을 붙들지 않는다.
  const selected = selectedId === null ? null : findNode(rounds, selectedId);
```

(c) 반환부 — 닫는 `</section>` 바로 앞(`) : null}` 뒤)에 시트를 추가한다:

```tsx
      {selected ? (
        <BottomSheet open onClose={closeSheet} title={selected.title}>
          <MobileNodeSheetBody node={selected} competitionId={competitionId} scope={scope} canWrite={canWrite} showToast={showToast} onDone={closeSheet} />
        </BottomSheet>
      ) : null}
```

- [ ] **Step 5: 실행해 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx
```

Expected: PASS (8 + 9 tests). `next/link` 가 라우터 컨텍스트 없이 렌더되지 않는다는 오류가 나면 테스트 파일 상단에 `vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a> }))` 를 추가한다(`bottom-sheet.test.tsx` 와 같은 방식).

- [ ] **Step 6: 타입·린트 확인과 커밋**

```bash
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs
cd ../.. && git add -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-sheet.tsx
git commit -m "feat(admin): 대진 모바일 바텀시트(점수 입력·확인·정정 연결)" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-sheet.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx
git show --stat HEAD
```

Expected: 오류 0, 커밋에 세 파일만.

---

### Task 7: 시트에서 팀 넣기·비우기

자리(slot)에 연결된 사이드에서 "팀 고르기/바꾸기"를 눌러 확정된 참가팀 목록에서 고른다. 끌어 놓기 없이 누르기만으로 되고, 서버 규칙(S3)과 같은 후보 필터를 쓴다.

**Files:**
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-sheet.tsx` (Task 6 파일)
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx`

**Interfaces:**
- Consumes: `useV1AssignTournamentSlot(competitionId, scope).mutateAsync({ slotId, registrationId: string | null })` (`hooks/use-v1-bracket-canvas.ts`, PR-3 · `PUT /admin/tournament-slots/:slotId/assignment`) · `pickableCandidates`(Task 2) · `describeBracketCanvasError(err, fallback)`(`lib/bracket-canvas-errors.ts`, PR-3 Task 2 — 워크스페이스의 팀 넣기 실패 토스트와 같은 문구)
- Produces:
  ```ts
  export type MobileSheetView = { kind: 'detail' } | { kind: 'pick'; side: 'HOME' | 'AWAY' };
  // MobileNodeSheetBodyProps 에 추가: slots: V1AdminBracketSlot[]; candidates: MobilePickCandidate[];
  //   showToast: (message: string, variant?: AdminToastVariant) => void; view: MobileSheetView; onViewChange: (view: MobileSheetView) => void;
  ```

- [ ] **Step 1: 실패하는 테스트 추가**

테스트 파일 상단 import 의 `import { fireEvent, render, screen, within } from '@testing-library/react';` 를 `import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';` 로 바꾼다(`beforeEach` 는 Task 6 에서 이미 가져왔다 — 없으면 vitest import 에 추가). 같은 파일 상단에 `import { V1ApiError } from '@/lib/api-client';` 도 추가한다. 파일 끝에 추가:

```tsx

describe('BracketCanvasMobile — 팀 넣기', () => {
  beforeEach(() => {
    assignSlot.mockReset();
    assignSlot.mockResolvedValue({});
  });

  const optionNames = () =>
    within(screen.getByRole('list', { name: '넣을 수 있는 팀' }))
      .getAllByRole('button')
      .map((button) => button.textContent);

  it('자리에 연결된 사이드에 고르기·바꾸기 버튼이 나오고, 후보에서 이미 다른 ENTRY·BYE 자리에 있는 팀은 빠진다', () => {
    renderMobile();
    fireEvent.click(card(/8강 · 1번 경기/));
    expect(screen.getByRole('button', { name: '홈 팀 바꾸기' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '어웨이 팀 고르기' }));
    // 강남FC(s-h1)·서초FC(s-x)는 ENTRY, 용산FC 는 BYE 자리에 있어 후보가 아니다
    expect(optionNames()).toEqual(['마포FC', '송파FC']);
  });

  it('팀을 고르면 해당 자리로 배정을 요청하고 상세로 돌아온다', async () => {
    const { showToast } = renderMobile();
    fireEvent.click(card(/8강 · 1번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '어웨이 팀 고르기' }));
    fireEvent.click(screen.getByRole('button', { name: '마포FC' }));

    await waitFor(() => expect(assignSlot).toHaveBeenCalledWith({ slotId: 's-a1', registrationId: 'r2' }));
    expect(assignSlot).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('자리에 팀을 넣었어요.'));
    expect(screen.queryByRole('list', { name: '넣을 수 있는 팀' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '8강 · 1번 경기' })).toBeInTheDocument();
  });

  it('이미 있는 팀을 바꾸는 화면에서는 현재 팀을 비울 수 있고, 현재 팀은 후보에 다시 나오지 않는다', async () => {
    const { showToast } = renderMobile();
    fireEvent.click(card(/8강 · 1번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '홈 팀 바꾸기' }));
    expect(optionNames()).toEqual(['마포FC', '송파FC']);

    fireEvent.click(screen.getByRole('button', { name: '현재 팀 비우기' }));
    await waitFor(() => expect(assignSlot).toHaveBeenCalledWith({ slotId: 's-h1', registrationId: null }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('자리를 비웠어요.'));
  });

  it('서버가 거절하면 그림 편집기 공용 안내 문구를 오류 토스트로 보여 주고 고르던 화면에 머문다', async () => {
    assignSlot.mockRejectedValue(
      new V1ApiError({
        statusCode: 409, code: 'SLOT_TEAM_ALREADY_PLACED', message: '서버 원문이에요.', details: null, requestId: 'req-1', timestamp: '2026-10-08T00:00:00.000Z',
      } as unknown as ConstructorParameters<typeof V1ApiError>[0]),
    );
    const { showToast } = renderMobile();
    fireEvent.click(card(/8강 · 1번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '어웨이 팀 고르기' }));
    fireEvent.click(screen.getByRole('button', { name: '송파FC' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('이미 다른 자리에 들어간 팀이에요.', 'error'));
    expect(screen.getByRole('list', { name: '넣을 수 있는 팀' })).toBeInTheDocument();
  });

  it('후보가 하나도 없으면 안내를 보여 준다', () => {
    renderMobile({ candidates: [] });
    fireEvent.click(card(/8강 · 1번 경기/));
    fireEvent.click(screen.getByRole('button', { name: '어웨이 팀 고르기' }));
    expect(screen.getByText(/넣을 수 있는 팀이 없어요/)).toBeInTheDocument();
  });

  it('고르기 버튼이 없어야 하는 곳 — 조 순위 자리·자리 없는 사이드·시작된 경기·읽기 전용', () => {
    const settled = makeFixture({
      id: 'fx-10', groupId: 'g-q', fixtureNumber: 10, homeSlotId: 's-x', homeRegistrationId: 'r3', homeTeamName: '서초FC',
      awayRegistrationId: 'r4', awayTeamName: '송파FC',
      game: makeGame('g-10', { state: 'ENDED', latestRevision: revision('OFFICIAL', 'console') as never }),
    });
    const rounds = buildBracketMobileRounds({ groups, fixtures: [...fixtures, settled], slots });
    const { unmount } = renderMobile({ rounds });

    // 조 순위 자리: 버튼 대신 안내
    fireEvent.click(screen.getByRole('tab', { name: '4강' }));
    fireEvent.click(card(/4강 · 6번 경기/));
    expect(screen.queryByRole('button', { name: /팀 (고르기|바꾸기)/ })).not.toBeInTheDocument();
    expect(screen.getByText(/큰 화면에서 순위대로 채워요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    // 자리 없는 사이드(fx-2)·시작된 경기(fx-10, 자리 연결이 있어도)
    fireEvent.click(screen.getByRole('tab', { name: '8강' }));
    fireEvent.click(card(/8강 · 2번 경기/));
    expect(screen.queryByRole('button', { name: /팀 (고르기|바꾸기)/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.click(card(/8강 · 10번 경기/));
    expect(screen.queryByRole('button', { name: /팀 (고르기|바꾸기)/ })).not.toBeInTheDocument();
    unmount();

    // 읽기 전용: 같은 fx-1 이 canWrite=true 일 때(위 테스트들)는 버튼이 있었다
    renderMobile({ canWrite: false });
    fireEvent.click(card(/8강 · 1번 경기/));
    expect(screen.queryByRole('button', { name: /팀 (고르기|바꾸기)/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실행해 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx
```

Expected: FAIL — `Unable to find an accessible element with the role "button" and name "홈 팀 바꾸기"` (버튼이 아직 없다). 앞의 17개는 PASS.

- [ ] **Step 3: 시트 본문에 팀 고르기 구현**

`bracket-canvas-mobile-sheet.tsx` 를 다음과 같이 고친다.

(a) import 블록 교체:

```tsx
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { AdminToastVariant } from '@/components/admin';
import { StatusChip } from '@/components/v1-ui/status-chip';
import { useV1AssignTournamentSlot, useV1QuickResult } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import {
  hasTeam,
  pickableCandidates,
  sideDisplayName,
  type MobileNode,
  type MobilePickCandidate,
  type MobileSide,
} from '@/lib/bracket-canvas-mobile-model';
import { bracketNodeStateChip } from '@/lib/competition-status';
import type { V1AdminBracketSlot } from '@/types/api';
import { BracketQuickResultForm } from './bracket-quick-result-form';
import { BracketResultActions } from './bracket-result-actions';
```

(b) `MobileNodeSheetBodyProps` 교체 + `MobileSheetView` 추가:

```tsx
export type MobileSheetView = { kind: 'detail' } | { kind: 'pick'; side: 'HOME' | 'AWAY' };

export interface MobileNodeSheetBodyProps {
  node: MobileNode;
  competitionId: string;
  scope: 'tournament' | 'league';
  canWrite: boolean;
  slots: V1AdminBracketSlot[];
  candidates: MobilePickCandidate[];
  showToast: (message: string, variant?: AdminToastVariant) => void;
  view: MobileSheetView;
  onViewChange: (view: MobileSheetView) => void;
  /** 폼·액션이 성공하면 시트를 닫는다 — 현장 입력은 곧바로 다음 칸으로 넘어가야 한다. */
  onDone: () => void;
}
```

(c) `SideRow` 교체(버튼과 안내 추가):

```tsx
function SideRow({ label, side, canPick, onPick }: { label: string; side: MobileSide; canPick: boolean; onPick: () => void }) {
  const verb = hasTeam(side) ? '바꾸기' : '고르기';
  return (
    <li className="flex flex-col gap-1">
      <div className="flex min-h-[44px] items-center gap-3 rounded-xl bg-[var(--grey50)] px-3 py-2">
        <span className="shrink-0 text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">{label}</span>
        <span
          className={`min-w-0 flex-1 break-keep text-[length:var(--font-size-body-sm)] font-semibold ${hasTeam(side) ? 'text-[var(--text-strong)]' : 'text-[var(--text-muted)]'}`}
        >
          {sideDisplayName(side)}
        </span>
        {canPick ? (
          <button type="button" onClick={onPick} aria-label={`${label} 팀 ${verb}`} className="tm-btn tm-btn-sm tm-btn-outline min-h-[44px] shrink-0">
            {hasTeam(side) ? '바꾸기' : '팀 고르기'}
          </button>
        ) : null}
      </div>
    </li>
  );
}
```

(d) `MobileNodeSheetBody` 위에 팀 고르기 컴포넌트를 추가하고 `MobileNodeSheetBody` 를 교체:

```tsx
function MobileTeamPicker({
  sideLabel, slot, slots, candidates, competitionId, scope, showToast, onBack,
}: {
  sideLabel: string;
  slot: V1AdminBracketSlot;
  slots: V1AdminBracketSlot[];
  candidates: MobilePickCandidate[];
  competitionId: string;
  scope: 'tournament' | 'league';
  showToast: MobileNodeSheetBodyProps['showToast'];
  onBack: () => void;
}) {
  const assign = useV1AssignTournamentSlot(competitionId, scope);
  // 지금 자리의 팀은 "비우기"로 따로 다룬다 — 같은 팀을 다시 고르는 요청을 만들지 않는다.
  const options = pickableCandidates(candidates, slots, slot).filter((c) => c.registrationId !== slot.registrationId);

  async function submit(registrationId: string | null) {
    try {
      await assign.mutateAsync({ slotId: slot.id, registrationId });
      showToast(registrationId === null ? '자리를 비웠어요.' : '자리에 팀을 넣었어요.');
      onBack();
    } catch (err) {
      showToast(describeBracketCanvasError(err, '팀을 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.'), 'error');
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-1">
      <button type="button" onClick={onBack} className="tm-btn tm-btn-sm tm-btn-ghost min-h-[44px] self-start">
        <ChevronLeft size={16} aria-hidden="true" />
        경기로 돌아가기
      </button>
      <p className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
        {sideLabel} 자리 · {slot.label}
      </p>
      {slot.registrationId !== null ? (
        <button type="button" disabled={assign.isPending} onClick={() => void submit(null)} className="tm-btn tm-btn-md tm-btn-outline min-h-[44px]">
          현재 팀 비우기
        </button>
      ) : null}
      {options.length === 0 ? (
        <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
          넣을 수 있는 팀이 없어요. 확정된 참가팀이 모두 다른 자리에 있어요.
        </p>
      ) : (
        // 시트(.tm-filter-sheet)는 touch-action: none 이라 긴 목록은 이 목록에서 pan-y 를 풀어야 스크롤된다.
        <ul
          role="list"
          aria-label="넣을 수 있는 팀"
          className="flex flex-col gap-1 overflow-y-auto overscroll-contain"
          style={{ touchAction: 'pan-y', maxHeight: '40dvh' }}
        >
          {options.map((candidate) => (
            <li key={candidate.registrationId}>
              <button
                type="button"
                disabled={assign.isPending}
                onClick={() => void submit(candidate.registrationId)}
                className="flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--grey50)] disabled:opacity-50"
              >
                {candidate.teamName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MobileNodeSheetBody(props: MobileNodeSheetBodyProps) {
  const { node, canWrite, view, onViewChange } = props;

  if (view.kind === 'pick') {
    const side = view.side === 'HOME' ? node.home : node.away;
    const slot = props.slots.find((s) => s.id === side.slotId) ?? null;
    if (slot !== null) {
      return (
        <MobileTeamPicker
          sideLabel={view.side === 'HOME' ? '홈' : '어웨이'}
          slot={slot}
          slots={props.slots}
          candidates={props.candidates}
          competitionId={props.competitionId}
          scope={props.scope}
          showToast={props.showToast}
          onBack={() => onViewChange({ kind: 'detail' })}
        />
      );
    }
  }

  // 자리 연결된 사이드만, 시작 전 경기에서만, 조 순위 자리는 순위대로 채우기(큰 화면)로만 채운다.
  const pickable = (side: MobileSide) => canWrite && node.state === 'scheduled' && side.slotId !== null && side.slotKind !== 'GROUP_RANK';
  const hasRankSlot = canWrite && node.state === 'scheduled' && [node.home, node.away].some((side) => side.slotKind === 'GROUP_RANK');

  return (
    <div className="flex flex-col gap-4 pb-1">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip chip={bracketNodeStateChip(node.state)} />
        {node.scoreText ? (
          <span className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">{node.scoreText}</span>
        ) : null}
      </div>
      <ul role="list" aria-label="참가팀" className="flex flex-col gap-2">
        <SideRow label="홈" side={node.home} canPick={pickable(node.home)} onPick={() => onViewChange({ kind: 'pick', side: 'HOME' })} />
        <SideRow label="어웨이" side={node.away} canPick={pickable(node.away)} onPick={() => onViewChange({ kind: 'pick', side: 'AWAY' })} />
      </ul>
      {hasRankSlot ? <Note>조 순위가 정해지면 큰 화면에서 순위대로 채워요.</Note> : null}
      <ResultSection {...props} />
    </div>
  );
}
```

(e) `bracket-canvas-mobile.tsx` — import 에 `type MobileSheetView` 추가(`import { MobileNodeSheetBody, type MobileSheetView } from './bracket-canvas-mobile-sheet';`), 함수 머리를 아래처럼 바꾸고 카드 `onOpen` 을 `openNode` 로 교체, 시트 본문에 새 props 를 넘긴다:

```tsx
export function BracketCanvasMobile({ competitionId, scope, rounds, slots, candidates, canWrite, showToast }: BracketCanvasMobileProps) {
  const roundSelectId = useId();
  const [pickedRoundKey, setPickedRoundKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<MobileSheetView>({ kind: 'detail' });
  const closeSheet = useCallback(() => setSelectedId(null), []);
  // 다른 칸을 열 때 이전 칸의 팀 고르기 화면이 남지 않게 한다.
  const openNode = useCallback((fixtureId: string) => {
    setView({ kind: 'detail' });
    setSelectedId(fixtureId);
  }, []);
```
(나머지 `activeKey`·`activeRound`·`selected` 줄은 그대로.) 카드: `<MobileNodeCard node={node} expanded={selectedId === node.fixtureId} onOpen={openNode} />`. 시트:

```tsx
        <BottomSheet open onClose={closeSheet} title={selected.title}>
          <MobileNodeSheetBody
            node={selected}
            competitionId={competitionId}
            scope={scope}
            canWrite={canWrite}
            slots={slots}
            candidates={candidates}
            showToast={showToast}
            view={view}
            onViewChange={setView}
            onDone={closeSheet}
          />
        </BottomSheet>
```

- [ ] **Step 4: 실행해 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx
```

Expected: PASS (8 + 9 + 6 tests). 후보 순서 단언이 깨지면 `candidates` fixture 순서(r1..r5)와 `pickableCandidates` 가 입력 순서를 보존하는지 본다.

- [ ] **Step 5: 타입·린트 확인과 커밋**

```bash
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs
cd ../.. && git commit -m "feat(admin): 대진 모바일 시트에서 팀 넣기·비우기" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-sheet.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx
git show --stat HEAD
```

Expected: 오류 0, 커밋에 세 파일만.

---

### Task 8: 뒤로가기로 시트 닫기 — 실제 오버레이 히스토리로 증명

`BottomSheet` onClose 모드는 `useModalA11y` 의 뒤로가기 닫기를 이미 쓴다. 이 태스크는 새 코드를 쓰지 않고, **칸 시트가 실제 히스토리 스택 위에서** 올바로 열리고 걷히는지(뒤로가기 한 번에 시트만 닫힘, 닫은 뒤 남는 항목 없음)를 `use-overlay-history.test.tsx` 와 같은 방식으로 고정한다. 모바일 현장에서 시트가 열린 채 뒤로가기를 누르면 대진 화면을 떠나 버리는 회귀가 가장 아프다.

**Files:**
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.history.test.tsx`

**Interfaces:**
- Consumes: `installNavigationHistory`·`subscribeAppPop`·`__resetNavigationHistoryForTests`(`lib/navigation-history`) · `overlayMarkerOf`·`__resetOverlayHistoryForTests`(`lib/overlay-history.ts:45,211`) · `currentPath`·`settleHistory`(`test/history-router.ts`) · Task 2~7 산출물
- Produces: 없음(테스트만)

- [ ] **Step 1: 테스트 작성**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.history.test.tsx`:

```tsx
/**
 * 시트가 열린 채 뒤로가기 → 시트만 닫히고 대진 화면에 남는다. 이 테스트가 잡는 버그: 뒤로가기가 시트를 건너뛰고
 * 화면을 떠나는 것, 시트를 ✕·폼 완료로 닫은 뒤 히스토리 항목이 남아 다음 뒤로가기가 헛도는 것.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBracketMobileRounds } from '@/lib/bracket-canvas-mobile-model';
import { __resetNavigationHistoryForTests, installNavigationHistory, subscribeAppPop } from '@/lib/navigation-history';
import { __resetOverlayHistoryForTests, overlayMarkerOf } from '@/lib/overlay-history';
import { currentPath, settleHistory } from '@/test/history-router';
import { makeFixture, makeGame, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import { BracketCanvasMobile } from './bracket-canvas-mobile';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useV1QuickResult: () => ({ mutate: (_vars: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.(), isPending: false }),
}));
vi.mock('./bracket-quick-result-form', () => ({
  BracketQuickResultForm: (props: { onSubmit: (score: { home: number; away: number }) => void }) => (
    <button type="button" onClick={() => props.onSubmit({ home: 1, away: 0 })}>폼 완료</button>
  ),
}));
vi.mock('./bracket-result-actions', () => ({ BracketResultActions: () => null }));

const BRACKET_PATH = '/admin/tournaments/t-1/bracket';
const nextRouterPop = vi.fn();
const appPop = vi.fn();

const group = makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 });
const slots = [makeSlot({ id: 's-1', label: '1번 자리' })];
const fixtures = [
  // 자리만 걸린 빈 경기 — 팀 고르기 화면용
  makeFixture({ id: 'fx-1', groupId: 'g-q', fixtureNumber: 1, homeSlotId: 's-1', awayRegistrationId: 'r2', awayTeamName: 'B팀', game: makeGame({ id: 'g-1' }) }),
  // 두 팀이 다 찬 경기 — 점수 폼(폼 완료)용
  makeFixture({
    id: 'fx-2', groupId: 'g-q', fixtureNumber: 2, homeRegistrationId: 'r1', homeTeamName: 'A팀', awayRegistrationId: 'r2', awayTeamName: 'B팀', game: makeGame({ id: 'g-2' }),
  }),
];

beforeEach(() => {
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/home');
  installNavigationHistory();
  window.history.pushState({}, '', BRACKET_PATH);
  window.addEventListener('popstate', nextRouterPop);
  subscribeAppPop(appPop);
  render(
    <BracketCanvasMobile
      competitionId="t-1"
      scope="tournament"
      rounds={buildBracketMobileRounds({ groups: [group], fixtures, slots })}
      slots={slots}
      candidates={[{ registrationId: 'r1', teamName: 'A팀' }]}
      canWrite
      showToast={vi.fn()}
    />,
  );
});
afterEach(() => {
  window.removeEventListener('popstate', nextRouterPop);
  __resetOverlayHistoryForTests();
  __resetNavigationHistoryForTests();
  vi.clearAllMocks();
});

const back = async () => {
  await act(async () => {
    window.history.back();
    await settleHistory();
  });
};
const openCard = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const sheetOpen = () => screen.queryByRole('dialog') !== null;

describe('대진 모바일 시트 — 뒤로가기', () => {
  it('시트가 열린 채 뒤로가기를 누르면 시트만 닫히고 대진 화면에 남는다', async () => {
    openCard(/8강 · 1번 경기/);
    expect(sheetOpen()).toBe(true);
    expect(overlayMarkerOf(window.history.state)).not.toBeNull();

    await back();

    expect(sheetOpen()).toBe(false);
    expect(currentPath()).toBe(BRACKET_PATH);
    expect(appPop).not.toHaveBeenCalled();
    expect(nextRouterPop).not.toHaveBeenCalled();
  });

  it('팀 고르기 화면에서 뒤로가기를 눌러도 시트 전체가 한 번에 닫힌다', async () => {
    openCard(/8강 · 1번 경기/);
    fireEvent.click(screen.getByRole('button', { name: '홈 팀 고르기' }));
    expect(screen.getByRole('list', { name: '넣을 수 있는 팀' })).toBeInTheDocument();

    await back();

    expect(sheetOpen()).toBe(false);
    expect(currentPath()).toBe(BRACKET_PATH);
  });

  it('✕ 로 닫으면 남는 항목이 없어서 다음 뒤로가기는 화면을 떠난다', async () => {
    openCard(/8강 · 1번 경기/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '닫기' }));
      await settleHistory();
    });
    expect(sheetOpen()).toBe(false);
    expect(overlayMarkerOf(window.history.state)).toBeNull();

    await back();
    expect(currentPath()).toBe('/home');
  });

  it('점수 입력이 끝나 시트가 닫혀도 남는 항목이 없다', async () => {
    openCard(/8강 · 2번 경기/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '폼 완료' }));
      await settleHistory();
    });
    expect(sheetOpen()).toBe(false);
    expect(overlayMarkerOf(window.history.state)).toBeNull();

    await back();
    expect(currentPath()).toBe('/home');
  });
});
```

- [ ] **Step 2: 실행해 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-mobile.history.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 3: 변이 확인 — 이 테스트가 실제로 뒤로가기 배선을 잡는지**

`bracket-canvas-mobile.tsx` 의 `<BottomSheet open onClose={closeSheet} ...>` 를 임시로 `onClose={() => {}}` 로 바꾸고 같은 명령을 다시 실행한다.

Expected: 첫 번째·두 번째 테스트 FAIL(`expect(sheetOpen()).toBe(false)` — 뒤로가기가 닫기 핸들러를 불러도 시트가 남는다). 확인 후 `onClose={closeSheet}` 로 **되돌리고** `git diff -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.tsx` 가 비어 있는지 본다.

- [ ] **Step 4: 커밋**

```bash
git add -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.history.test.tsx
git commit -m "test(admin): 대진 모바일 시트 뒤로가기 닫기 검증" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile.history.test.tsx
git show --stat HEAD
```

Expected: 커밋에 테스트 파일 하나만.

---

### Task 9: 토너먼트 대진 페이지 연결

PR-3 의 페이지(Task 15)는 `[그림 | 목록]` 탭 아래에서 `BracketCanvasWorkspace` 를 렌더하고, 툴바(템플릿·무작위 채우기·공개 전환)·트레이·캔버스·칸 패널과 `useV1AdminBracket` 조회가 전부 **워크스페이스 안**에 있다. 그래서 `BracketCanvas` 만 감싸면 모바일에도 구조 편집 툴바가 남는다. 이 Task 는 **워크스페이스 전체를 `wide` 로** 두고, `narrow` 에는 같은 조회를 읽어 모바일 목록에 넘기는 얇은 컨테이너 `BracketCanvasMobileScreen` 을 둔다. 목록 뷰(기존 `BracketTab`)와 `[그림|목록]` 탭은 바꾸지 않는다 — 모바일에서도 탭은 그대로 보이고, 구조 편집은 목록 뷰에서 계속 할 수 있다.

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.test.tsx`
- Modify: `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx` (PR-3 Task 15 Step 3 의 전체 교체본 — 아래 Step 8 이 그 파일의 import 두 줄과 `view === 'canvas'` 분기를 정확히 바꾼다)
- Modify: `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.test.tsx` (PR-3 Task 15 Step 1 의 테스트 — jsdom 기본 `matchMedia` 는 `matches: false` 라 이제 모바일 분기가 마운트되므로 데스크톱 뷰포트를 명시, Step 9)
- Test: `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.responsive.test.tsx`

**Interfaces:**
- Consumes: `BracketCanvasResponsive`(Task 1) · `BracketCanvasMobile`(Task 5~7) · `buildBracketMobileRounds`·`candidatesFromRegistrations`(Task 2~4) · `useV1AdminBracket(tournamentId)`(`hooks/use-v1-api.ts`, PR-3 워크스페이스가 쓰는 같은 훅 — 같은 쿼리 키라 캐시를 공유한다) · `BracketCanvasWorkspace`(PR-3 Task 14) · `AdminListSkeleton`·`ErrorState`(PR-3 워크스페이스와 같은 import) · `extractErrorMessage` · 테스트 빌더 `makeBracket`·`makeFixture`·`makeGroup`·`makeSlot`·`makeRegistration`(PR-3)
- Produces: `BracketCanvasMobileScreen(props: { tournamentId: string; registrations: V1AdminTournamentRegistration[]; canWrite: boolean; showToast: (message: string, variant?: AdminToastVariant) => void })`

- [ ] **Step 1: PR-3 이후 페이지 구조 확인 (코드 변경 없음)**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
P="apps/v1_web/src/app/admin/tournaments/[id]/bracket"
grep -n "BracketCanvasWorkspace\|view === 'canvas'\|onShowList\|<BracketTab" "$P/page.tsx"
grep -n "beforeEach\|vi.clearAllMocks\|^import" "$P/page.test.tsx"
grep -n "useV1AdminBracket\|AdminListSkeleton\|ErrorState\|대진을 불러오" apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx
```

확인할 것: (1) `page.tsx` 에 `BracketCanvasWorkspace` 를 렌더하는 곳이 **`view === 'canvas'` 분기 한 곳**이고 props 가 Step 8 의 "찾을 블록"과 글자 그대로 같은지, (2) `page.test.tsx` 에 `beforeEach` 가 `vi.clearAllMocks()` 로 시작하는지, (3) 워크스페이스의 로딩·에러 문구(컨테이너가 같은 문구를 쓴다). 다르면 Step 8·9 의 찾을 블록만 실제 모양에 맞추고 바꿀 내용은 그대로 둔다.

- [ ] **Step 2: 모바일 컨테이너의 실패하는 테스트 작성**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBracket, makeFixture, makeGroup, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import { BracketCanvasMobileScreen } from './bracket-canvas-mobile-screen';

const { bracketState, refetch } = vi.hoisted(() => ({
  bracketState: { value: {} as Record<string, unknown> },
  refetch: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminBracket: () => bracketState.value }));
vi.mock('./bracket-canvas-mobile', () => ({
  BracketCanvasMobile: (props: { competitionId: string; scope: string; canWrite: boolean; rounds: Array<{ label: string }>; candidates: unknown[]; slots: unknown[] }) => (
    <div
      data-testid="mobile-canvas"
      data-competition-id={props.competitionId}
      data-scope={props.scope}
      data-can-write={String(props.canWrite)}
      data-rounds={props.rounds.map((round) => round.label).join(',')}
      data-candidates={props.candidates.length}
      data-slots={props.slots.length}
    />
  ),
}));

const registrations = [
  makeRegistration({ id: 'r1', teamName: 'A팀', status: 'confirmed' }),
  makeRegistration({ id: 'r2', teamName: 'B팀', status: 'waitlisted' }),
];
const bracket = makeBracket({
  groups: [makeGroup({ id: 'g-q', phase: 'quarter', name: '8강', sortOrder: 1 })],
  fixtures: [makeFixture({ id: 'fx-1', groupId: 'g-q', fixtureNumber: 1, homeSlotId: 's-1' })],
  slots: [makeSlot({ id: 's-1' })],
});

function renderScreen(canWrite = true) {
  return render(<BracketCanvasMobileScreen tournamentId="t-1" registrations={registrations} canWrite={canWrite} showToast={vi.fn()} />);
}

beforeEach(() => {
  refetch.mockReset();
  bracketState.value = { data: bracket, isPending: false, isError: false, error: null, refetch };
});

describe('BracketCanvasMobileScreen', () => {
  it('응답에서 만든 라운드·자리와 확정된 참가팀만 후보로 모바일 목록에 넘긴다', () => {
    renderScreen();
    const mobile = screen.getByTestId('mobile-canvas');
    expect(mobile).toHaveAttribute('data-competition-id', 't-1');
    expect(mobile).toHaveAttribute('data-scope', 'tournament');
    expect(mobile).toHaveAttribute('data-rounds', '8강');
    expect(mobile).toHaveAttribute('data-slots', '1');
    expect(mobile).toHaveAttribute('data-candidates', '1');
    expect(mobile).toHaveAttribute('data-can-write', 'true');
  });

  it('읽기 전용 어드민은 canWrite=false 로 넘어간다', () => {
    renderScreen(false);
    expect(screen.getByTestId('mobile-canvas')).toHaveAttribute('data-can-write', 'false');
  });

  it('불러오는 동안에는 목록 대신 로딩 상태를 보여 준다', () => {
    bracketState.value = { data: undefined, isPending: true, isError: false, error: null, refetch };
    renderScreen();
    expect(screen.getByRole('status', { name: '대진을 불러오는 중이에요' })).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-canvas')).not.toBeInTheDocument();
  });

  it('조회가 실패하면 오류와 다시 시도 버튼을 보여 준다', () => {
    bracketState.value = { data: undefined, isPending: false, isError: true, error: new Error('x'), refetch };
    renderScreen();
    expect(screen.getByText('대진을 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-canvas')).not.toBeInTheDocument();
  });
});
```
- [ ] **Step 3: 실행해 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.test.tsx
```

Expected: FAIL — `Failed to resolve import "./bracket-canvas-mobile-screen"` (파일이 아직 없다).

- [ ] **Step 4: 모바일 컨테이너 구현**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useV1AdminBracket } from '@/hooks/use-v1-api';
import { buildBracketMobileRounds, candidatesFromRegistrations } from '@/lib/bracket-canvas-mobile-model';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { BracketCanvasMobile } from './bracket-canvas-mobile';

export interface BracketCanvasMobileScreenProps {
  tournamentId: string;
  registrations: V1AdminTournamentRegistration[];
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}

/** 768px 미만의 대진 그림 화면. 구조 편집 도구(툴바·트레이)는 두지 않고 목록과 시트만 보여 준다. */
export function BracketCanvasMobileScreen({ tournamentId, registrations, canWrite, showToast }: BracketCanvasMobileScreenProps) {
  const { data: bracket, isPending, isError, error, refetch } = useV1AdminBracket(tournamentId);
  const rounds = useMemo(
    () => (bracket === undefined ? [] : buildBracketMobileRounds({ groups: bracket.groups, fixtures: bracket.fixtures, slots: bracket.slots })),
    [bracket],
  );
  const candidates = useMemo(() => candidatesFromRegistrations(registrations), [registrations]);

  if (isPending) {
    return (
      <div role="status" aria-busy="true" aria-label="대진을 불러오는 중이에요">
        <AdminListSkeleton rows={4} />
      </div>
    );
  }
  if (isError || bracket === undefined) {
    return (
      <ErrorState
        title="대진을 불러오지 못했어요"
        message={extractErrorMessage(error, '잠시 뒤 다시 시도해 주세요.')}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <BracketCanvasMobile
      competitionId={tournamentId}
      scope="tournament"
      rounds={rounds}
      slots={bracket.slots}
      candidates={candidates}
      canWrite={canWrite}
      showToast={showToast}
    />
  );
}
```

`candidatesFromRegistrations` 가 확정(`confirmed`) 팀만 남기는지는 Task 2 가 검증한다 — 이 컨테이너는 그 결과를 그대로 넘긴다.

- [ ] **Step 5: 컨테이너 테스트 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 6: 페이지 연결의 실패하는 테스트 작성**

`apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.responsive.test.tsx`:

```tsx
/**
 * 뷰포트 분기가 페이지에 실제로 걸려 있는지 — 768 미만은 모바일 컨테이너, 이상은 작업 영역(툴바 포함).
 * 두 컴포넌트 자체는 각자의 테스트가 검증하므로 여기서는 stub 으로 바꾸고 "누가 어떤 props 로 마운트되는가"만 본다.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installViewport } from '@/test/viewport';
import AdminTournamentBracketPage from './page';

const { adminState } = vi.hoisted(() => ({ adminState: { canWrite: true } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/admin/tournaments/t-1/bracket',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../tournament-admin-context', () => ({
  useTournamentAdmin: () => ({ tournamentId: 't-1', role: 'platform_ops', canWrite: adminState.canWrite, showToast: vi.fn() }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => ({ data: { id: 't-1', format: 'knockout', bracketPublishedAt: null, bracketPublishScheduledAt: null, registrationDeadlineAt: null } }),
  useV1AdminTournamentRegistrations: () => ({
    data: { items: [{ id: 'r1', status: 'confirmed', teamName: 'A팀' }, { id: 'r2', status: 'waitlisted', teamName: 'B팀' }] },
  }),
}));
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-workspace', () => ({
  BracketCanvasWorkspace: (props: { canWrite: boolean; registrations: unknown[] }) => (
    <div data-testid="desktop-workspace" data-can-write={String(props.canWrite)} data-registrations={props.registrations.length} />
  ),
}));
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-mobile-screen', () => ({
  BracketCanvasMobileScreen: (props: { tournamentId: string; canWrite: boolean; registrations: unknown[] }) => (
    <div data-testid="mobile-screen" data-tournament-id={props.tournamentId} data-can-write={String(props.canWrite)} data-registrations={props.registrations.length} />
  ),
}));
vi.mock('../bracket-tab', () => ({ BracketTab: () => <div data-testid="list-tab" /> }));

let restoreViewport: (() => void) | null = null;
beforeEach(() => {
  adminState.canWrite = true;
});
afterEach(() => {
  restoreViewport?.();
  restoreViewport = null;
});

describe('어드민 대진 페이지 — 뷰포트 분기', () => {
  it('390 에서는 모바일 컨테이너만 마운트되고 구조 편집 작업 영역은 마운트되지 않는다', () => {
    restoreViewport = installViewport(390);
    render(<AdminTournamentBracketPage />);
    const mobile = screen.getByTestId('mobile-screen');
    expect(mobile).toHaveAttribute('data-tournament-id', 't-1');
    expect(mobile).toHaveAttribute('data-can-write', 'true');
    expect(mobile).toHaveAttribute('data-registrations', '2');
    expect(screen.queryByTestId('desktop-workspace')).not.toBeInTheDocument();
  });

  it('1280 에서는 작업 영역만 마운트된다', () => {
    restoreViewport = installViewport(1280);
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('desktop-workspace')).toHaveAttribute('data-can-write', 'true');
    expect(screen.queryByTestId('mobile-screen')).not.toBeInTheDocument();
  });

  it('지원(읽기 전용) 어드민은 모바일에서도 canWrite=false 로 넘어간다', () => {
    adminState.canWrite = false;
    restoreViewport = installViewport(390);
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('mobile-screen')).toHaveAttribute('data-can-write', 'false');
  });

  it('[그림|목록] 탭은 모바일에서도 보인다 — 구조 편집은 목록 뷰로 계속 갈 수 있다', () => {
    restoreViewport = installViewport(390);
    render(<AdminTournamentBracketPage />);
    expect(screen.getByRole('tab', { name: '목록' })).toBeInTheDocument();
  });
});
```

PR-3 페이지가 이 mock 이 다루지 않는 훅을 더 부르면 실행 시 오류 메시지가 이름을 알려 준다 — 그 훅만 mock 에 추가한다.

- [ ] **Step 7: 실행해 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run "src/app/admin/tournaments/[id]/bracket/page.responsive.test.tsx"
```

Expected: FAIL — 390 케이스에서 `Unable to find an element by: [data-testid="mobile-screen"]` (아직 분기가 없어 작업 영역만 렌더).

- [ ] **Step 8: 페이지 연결 구현 (PR-3 Task 15 Step 3 의 `page.tsx` 를 정확히 고친다)**

`apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx` 에서 세 군데만 바꾼다. 나머지(탭·`changeView`·`BracketTab` 분기)는 한 글자도 건드리지 않는다.

(1) import — `import { BracketCanvasWorkspace } from '@/components/admin/bracket-canvas/bracket-canvas-workspace';` 줄을 아래 세 줄로 교체한다.

```tsx
import { BracketCanvasMobileScreen } from '@/components/admin/bracket-canvas/bracket-canvas-mobile-screen';
import { BracketCanvasResponsive } from '@/components/admin/bracket-canvas/bracket-canvas-responsive';
import { BracketCanvasWorkspace } from '@/components/admin/bracket-canvas/bracket-canvas-workspace';
```

(2) `view === 'canvas'` 분기 — 아래 **찾을 블록**을 **바꿀 블록**으로 교체한다. 워크스페이스 props 는 그대로 `wide` 안으로 옮기기만 한다.

찾을 블록:

```tsx
      {view === 'canvas' ? (
        <BracketCanvasWorkspace
          tournamentId={tournamentId}
          format={tournament?.format}
          registrations={registrations}
          bracketPublishedAt={tournament?.bracketPublishedAt}
          bracketPublishScheduledAt={tournament?.bracketPublishScheduledAt}
          canWrite={canWrite}
          showToast={showToast}
          onShowList={() => changeView('list')}
        />
      ) : (
```

바꿀 블록:

```tsx
      {view === 'canvas' ? (
        <BracketCanvasResponsive
          wide={
            <BracketCanvasWorkspace
              tournamentId={tournamentId}
              format={tournament?.format}
              registrations={registrations}
              bracketPublishedAt={tournament?.bracketPublishedAt}
              bracketPublishScheduledAt={tournament?.bracketPublishScheduledAt}
              canWrite={canWrite}
              showToast={showToast}
              onShowList={() => changeView('list')}
            />
          }
          narrow={
            <BracketCanvasMobileScreen
              tournamentId={tournamentId}
              registrations={registrations}
              canWrite={canWrite}
              showToast={showToast}
            />
          }
        />
      ) : (
```

`) : (` 뒤의 `<BracketTab … />` 와 닫는 `)}` 는 PR-3 그대로다.

- [ ] **Step 9: PR-3 페이지 테스트를 데스크톱 뷰포트로 고정**

`apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.test.tsx`(PR-3 Task 15 Step 1)는 워크스페이스만 mock 한다. 기본 jsdom 폭에서는 모바일 분기가 마운트되어 실제 `useV1AdminBracket`(이 파일의 `@/hooks/use-v1-api` mock 에 없음)을 부르므로 깨진다. 동작은 바꾸지 않고 세 군데를 고친다.

(1) 파일 맨 위 import 두 줄을 교체/추가한다.

```tsx
// 찾을 줄
import { beforeEach, describe, expect, it, vi } from 'vitest';
// 바꿀 줄
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installViewport } from '@/test/viewport';
```

(2) 모바일 컨테이너 mock 을 기존 `vi.mock('../bracket-tab', …)` 바로 위에 추가한다(1280 에서는 마운트되지 않지만 모듈 로드 체인을 끊는다).

```tsx
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-mobile-screen', () => ({
  BracketCanvasMobileScreen: () => null,
}));
```

(3) `beforeEach` 첫 줄에 뷰포트를 심고 `afterEach` 를 추가한다.

```tsx
// 찾을 블록
beforeEach(() => {
  vi.clearAllMocks();
// 바꿀 블록
let restoreViewport: (() => void) | null = null;

beforeEach(() => {
  restoreViewport = installViewport(1280);
  vi.clearAllMocks();
```

기존 `beforeEach` 블록의 닫는 `});` 바로 뒤에 추가한다:

```tsx

afterEach(() => {
  restoreViewport?.();
  restoreViewport = null;
});
```
- [ ] **Step 10: 실행해 통과 확인, 기존 대진 테스트 회귀 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run "src/app/admin/tournaments/[id]/bracket/" src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.test.tsx "src/app/admin/tournaments/[id]/bracket-tab.test.tsx" src/app/admin/admin-wide-route.test.ts
```

Expected: 새 4개 + 컨테이너 4개 PASS, PR-3 기존 페이지 테스트도 PASS.

- [ ] **Step 11: 타입·린트 확인과 커밋**

```bash
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs
cd ../.. && git add -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.test.tsx ":(literal)apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.responsive.test.tsx"
git commit -m "feat(admin): 대진 그림 페이지에 모바일 분기 연결" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.test.tsx ":(literal)apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx" ":(literal)apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.test.tsx" ":(literal)apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.responsive.test.tsx"
git show --stat HEAD
```

Expected: 오류 0, 커밋에 위 5~6개 파일만.

---

### Task 10: 정규 리그 일정 보드 연결

PR-5b Task 9 가 만든 `LeagueMatchFixturesClient` 는 `[일정 보드 | 목록]` 탭 아래 `view === 'board'` 일 때 `<LeagueScheduleBoard …/>` 를 렌더한다. 이 Task 는 **그 요소 하나를** `BracketCanvasResponsive` 로 감싸 768 미만에서 `BracketCanvasMobile`(scope `'league'`)로 바꾼다. 탭·목록 뷰·템플릿 대화상자·모달은 건드리지 않는다. 테스트는 새 파일을 만들지 않고 PR-5b 가 이미 가진 `league-match-fixtures-client.test.tsx` 의 `renderClient` 헬퍼에 얹는다(그 파일이 훅·컴포넌트 mock 일체를 이미 갖고 있다).

**Files:**
- Modify: `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx` (PR-5b Task 9 Step 4 이후 모양)
- Modify: `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx` (PR-5b Task 9 Step 2 의 `describe('LeagueMatchFixturesClient — 일정 보드와 보기 전환')`)

**Interfaces:**
- Consumes: Task 1~7 산출물 · `buildLeagueMobileRounds`·`candidatesFromLeagueTeams`(Task 2~4) · PR-5b `LeagueScheduleBoard`(`components/admin/bracket-canvas/league-schedule-board.tsx`) · 클라이언트 안의 `series`·`teamsData`·`canWrite`·`showToast`·`view`·`leagueId`(PR-5b Task 9) · `useV1AdminLeagueMatch`·`useV1AdminLeagueTeams`(기존)
- Produces: 없음

- [ ] **Step 1: PR-5b 이후 구조 확인 (코드 변경 없음)**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas/apps/v1_web
C="src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx"
grep -n "LeagueScheduleBoard\|const canWrite\|const { data: teamsData }\|const \[view, setView\]\|import { useId, useState }\|if (isPending)" "$C"
grep -n "describe('LeagueMatchFixturesClient — 일정 보드와 보기 전환'\|function renderClient\|afterEach(() => {\|vi.mock('@/components/admin/bracket-canvas/bracket-team-tray'" "${C%.tsx}.test.tsx"
```

확인할 것: (1) `<LeagueScheduleBoard` 를 렌더하는 곳이 `{view === 'board' ? (` 분기 한 곳, (2) `useV1AdminLeagueTeams` 호출과 `view` 훅이 `if (isPending)` 조기 반환보다 **위**에 있다, (3) 테스트의 `renderClient` 가 `fixtures`·`slots`·`initialView` 옵션을 받는다. 다르면 Step 4·5 의 찾을 줄만 실제 모양에 맞춘다.

- [ ] **Step 2: 실패하는 테스트 작성 (PR-5b 테스트 파일 수정)**

`league-match-fixtures-client.test.tsx` 를 네 군데 고친다.

(1) 모바일 목록 stub — 기존 `vi.mock('@/components/admin/bracket-canvas/bracket-team-tray', …)` 바로 위에 추가한다. 목록 내부는 Task 5~7 이 지키므로 여기서는 "누가 어떤 props 로 마운트되는가"만 본다.

```tsx
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-mobile', () => ({
  BracketCanvasMobile: (props: {
    scope: string;
    competitionId: string;
    canWrite: boolean;
    rounds: Array<{ label: string }>;
    candidates: Array<{ teamName: string }>;
    slots: unknown[];
  }) => (
    <div
      data-testid="mobile-board"
      data-scope={props.scope}
      data-competition={props.competitionId}
      data-can-write={String(props.canWrite)}
      data-rounds={props.rounds.map((round) => round.label).join(',')}
      data-candidates={props.candidates.map((candidate) => candidate.teamName).join(',')}
      data-slots={props.slots.length}
    />
  ),
}));
```

파일 상단 import 에 `import { installViewport, resizeViewport } from '@/test/viewport';` 를 추가한다(`beforeEach` 가 vitest import 에 없으면 함께 추가).

(2) 보드 케이스를 데스크톱 폭으로 고정 — `describe('LeagueMatchFixturesClient — 일정 보드와 보기 전환', () => {` 안의 기존 `afterEach` 를 아래로 교체하고, 그 위에 `beforeEach` 를 둔다. jsdom 기본 폭에서는 모바일 분기가 마운트되어 PR-5b 의 보드 케이스가 보드를 못 찾는다.

```tsx
  // 찾을 블록
  afterEach(() => {
    adminCanWrite.value = true;
    canvasMocks.applyTemplate.mockReset();
  });

  // 바꿀 블록
  let restoreViewport: (() => void) | null = null;

  beforeEach(() => {
    restoreViewport = installViewport(1280);
  });

  afterEach(() => {
    adminCanWrite.value = true;
    canvasMocks.applyTemplate.mockReset();
    restoreViewport?.();
    restoreViewport = null;
  });
```

(3) `renderClient` 가 참가팀을 옵션으로 받게 한다 — 세 줄을 교체한다.

```tsx
  // 찾을 줄
  function renderClient(options: { fixtures?: Fixture[]; slots?: unknown[]; initialView?: 'board' | 'list' } = {}) {
    const { fixtures = [EMPTY_FIXTURE], slots = SLOTS, initialView } = options;
  // 바꿀 줄
  function renderClient(options: { fixtures?: Fixture[]; slots?: unknown[]; initialView?: 'board' | 'list'; teams?: unknown[] } = {}) {
    const { fixtures = [EMPTY_FIXTURE], slots = SLOTS, initialView, teams = TEAMS } = options;
```

```tsx
  // 찾을 줄
    useV1AdminLeagueTeamsMock.mockReturnValue({ data: { leagueId: 'league-1', teams: TEAMS } } as never);
  // 바꿀 줄
    useV1AdminLeagueTeamsMock.mockReturnValue({ data: { leagueId: 'league-1', teams } } as never);
```

(4) 모바일 분기 케이스 — 같은 describe 의 마지막 `it`(`자리 방식 리그는 목록의 대진 재생성을 막고…`) 뒤, describe 를 닫는 `});` 앞에 추가한다. `beforeEach` 가 1280 을 심어 두므로 `resizeViewport(390)` 로 폭만 바꾼 뒤 렌더한다.

```tsx

  it('390 에서는 보드 대신 모바일 목록이 마운트되고, 경기일 라운드와 registrationId 가 있는 팀만 후보로 넘어간다', () => {
    resizeViewport(390);
    renderClient({
      teams: [...TEAMS, { teamId: 't3', name: '미연결 팀', status: 'active', memberCount: 5, logoUrl: null, registrationId: null }],
    });

    const mobile = screen.getByTestId('mobile-board');
    expect(mobile).toHaveAttribute('data-scope', 'league');
    expect(mobile).toHaveAttribute('data-competition', 'league-1');
    expect(mobile).toHaveAttribute('data-rounds', '1주차');
    expect(mobile).toHaveAttribute('data-candidates', '마포 FC,합정 유나이티드');
    expect(mobile).toHaveAttribute('data-slots', '2');
    expect(mobile).toHaveAttribute('data-can-write', 'true');
    expect(screen.queryByRole('region', { name: '리그 일정 보드' })).toBeNull();
  });

  it('390 에서도 [일정 보드|목록] 탭은 보이고 목록 탭은 기존 표를 연다 — 구조 편집은 목록에서 계속 할 수 있다', () => {
    resizeViewport(390);
    renderClient();

    expect(screen.getByRole('tab', { name: '일정 보드', selected: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '목록' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-board')).toBeNull();
  });

  it('읽기 전용 어드민은 모바일에서도 canWrite=false 로 넘어간다', () => {
    adminCanWrite.value = false;
    resizeViewport(390);
    renderClient();
    expect(screen.getByTestId('mobile-board')).toHaveAttribute('data-can-write', 'false');
  });
```

- [ ] **Step 3: 실행해 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run "src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx" -t "일정 보드와 보기 전환"
```

Expected: FAIL 3건 — 새 케이스에서 `Unable to find an element by: [data-testid="mobile-board"]`(아직 분기가 없어 데스크톱 보드만 렌더). 기존 PR-5b 케이스는 1280 으로 고정돼 PASS 한다.

- [ ] **Step 4: 클라이언트 연결 (`league-match-fixtures-client.tsx`) — 위치는 앵커 문자열로 찾는다**

(1) import — `import { useId, useState } from 'react';` 를 교체하고, PR-5b 가 추가한 `import { LeagueScheduleBoard } from '@/components/admin/bracket-canvas/league-schedule-board';` 바로 위에 두 줄을 더한다.

```tsx
import { useId, useMemo, useState } from 'react';
```

```tsx
import { BracketCanvasMobile } from '@/components/admin/bracket-canvas/bracket-canvas-mobile';
import { BracketCanvasResponsive } from '@/components/admin/bracket-canvas/bracket-canvas-responsive';
```

그리고 `import { LeagueTemplateDialog } from './league-template-dialog';` 위에 한 줄을 더한다.

```tsx
import { buildLeagueMobileRounds, candidatesFromLeagueTeams } from '@/lib/bracket-canvas-mobile-model';
```

(2) 훅 — PR-5b 가 추가한 `const [templateOpen, setTemplateOpen] = useState(false);` 바로 아래, **`if (isPending)` 조기 반환보다 위**에 둔다. `series` 는 아직 없을 수 있으므로 비어 있으면 빈 목록이다.

```tsx
  const mobileRounds = useMemo(
    () =>
      series
        ? buildLeagueMobileRounds({
            fixtures: series.fixtures,
            slots: series.slots ?? [],
            teamNameById: new Map((teamsData?.teams ?? []).map((team) => [team.teamId, team.name])),
          })
        : [],
    [series, teamsData],
  );
  const mobileCandidates = useMemo(() => candidatesFromLeagueTeams(teamsData?.teams ?? []), [teamsData]);
```

(3) 보드 요소 — PR-5b Step 4 (5)의 `{view === 'board' ? ( <LeagueScheduleBoard … /> ) : null}` 에서 `<LeagueScheduleBoard … />` **한 요소만** 감싼다. props 는 PR-5b 그대로 `wide` 안에 둔다.

찾을 블록:

```tsx
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

바꿀 블록:

```tsx
      {view === 'board' ? (
        <BracketCanvasResponsive
          wide={
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
          }
          narrow={
            <BracketCanvasMobile
              competitionId={leagueId}
              scope="league"
              rounds={mobileRounds}
              slots={series.slots ?? []}
              candidates={mobileCandidates}
              canWrite={canWrite}
              showToast={showToast}
            />
          }
        />
      ) : null}
```

`canWrite` 는 PR-5b 가 이미 `useAdminCanWrite()` 로 만든 값이다 — 새 판정을 만들지 않는다.

- [ ] **Step 5: 실행해 통과 확인과 회귀 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run "src/app/admin/league-matches/[leagueId]/"
```

Expected: PASS — PR-5b 의 기존 렌더(목록 고정 49건 + 보드 케이스)와 새 3건 모두. 기존 보드 케이스가 `mobile-board` 때문에 깨지면 (2)의 `beforeEach(installViewport(1280))` 가 그 describe 안에 있는지 먼저 본다.

- [ ] **Step 6: 타입·린트 확인과 커밋**

```bash
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs
cd ../.. && git commit -m "feat(admin): 리그 일정 보드에 모바일 분기 연결" -- ":(literal)apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx" ":(literal)apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx"
git show --stat HEAD
```

Expected: 오류 0, 커밋에 위 두 파일만(둘 다 PR-5b 가 이미 추적 중이라 `git add` 불필요).

---

### Task 11: alpha 캡처·계산값 판정 스크립트 (읽기 전용)

alpha 에서 모바일/데스크톱 분기가 **값으로** 맞는지(라운드 탭이 보이는가, 구조 편집 버튼이 0개인가, 안내 문구가 있는가, 가로 넘침이 없는가) 읽고 390/768/1440 갤러리용 PNG 를 남긴다. 스크립트는 `scripts/` 안에 둔다(`/tmp` 는 모듈 해석에 실패한다). **클릭·입력·제출이 없는 읽기 전용**이라 사용자 승인 없이 돌릴 수 있고, 그 성질은 `alpha-probe-readonly.contract.spec.ts` 가 게이트로 지킨다.

**Files:**
- Modify: `apps/v1_api/test/config/alpha-probe-readonly.contract.spec.ts` (`READ_ONLY_SCRIPTS`, 현재 24~29행)
- Create: `scripts/capture-alpha-bracket-canvas.mjs`
- Modify: `scripts/README-alpha-verify.md` (스크립트 표에 한 줄)

**Interfaces:**
- Consumes: 환경변수 `ALPHA_SESSION_TOKEN`(어드민 세션 쿠키 값) 또는 `ALPHA_EMAIL`+`ALPHA_PASSWORD`, `TOURNAMENT_ID`(대진이 있는 대회), `LEAGUE_ID`(대진이 있는 정규 리그), 선택 `OUT_DIR`(기본 `docs/visual-qa/admin-bracket-canvas`)
- Produces: `<OUT_DIR>/<tournament|league>--<mobile|edge767|tablet|desktop>.png`, 콘솔 판정 표, 판정 실패 시 종료 코드 1

- [ ] **Step 1: 읽기 전용 게이트에 새 스크립트 등록 (먼저 — red)**

`alpha-probe-readonly.contract.spec.ts` 의 배열에 한 줄을 더한다:

```ts
const READ_ONLY_SCRIPTS = [
  'scripts/probe-alpha-league-subroutes.mjs',
  'scripts/capture-alpha-league-on-tournament-surface.mjs',
  'scripts/capture-alpha-competition-lists.mjs',
  'scripts/verify-alpha-unified-competition-list.mjs',
  'scripts/capture-alpha-bracket-canvas.mjs',
];
```

```bash
cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 --selectProjects runner-contract test/config/alpha-probe-readonly.contract.spec.ts
```

Expected: FAIL — `scripts/capture-alpha-bracket-canvas.mjs 가 실제로 존재한다` (`expect(existsSync(...)).toBe(true)` 가 false).

- [ ] **Step 2: 스크립트 작성**

`scripts/capture-alpha-bracket-canvas.mjs`:

```js
/**
 * [PR-6] 어드민 대진 화면(대회 /bracket · 정규 리그 상세)을 폭별로 찍고 **모바일/데스크톱 분기를 값으로 읽는다.**
 *
 * 768 미만은 라운드 탭 + 칸 목록 + "큰 화면에서 편집해요" 안내, 768 이상은 편집 캔버스다(스펙 D8).
 * 눈으로는 "비슷해 보이는" 두 뷰를 값으로 가른다 — 라운드 탭이 보이는 개수, 구조 편집 버튼 개수, 안내 문구,
 * 가로 넘침. 767 은 경계 확인용(갤러리에는 올리지 않는다).
 *
 * 전제: TOURNAMENT_ID·LEAGUE_ID 는 **대진이 이미 있는** 것이어야 한다(빈 대진은 모바일에서 빈 상태 화면이라 탭이 없다).
 * 세션은 쓰기 권한이 있는 플랫폼 어드민(owner·ops)이어야 한다(안내 문구는 canWrite 일 때만 나온다).
 *
 * ## 읽기만 한다
 * goto · evaluate(읽기) · screenshot 만 쓴다. 입력·제출·mutation 없음 — `alpha-probe-readonly.contract.spec.ts` 가 게이트로 지킨다.
 * alpha 는 과한 캡처에 403 을 건다 — 폭 4 × 화면 2 = 8장을 간격을 두고 찍는다.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'https://alpha.teameet.co.kr';
const API = `${BASE}/api/v1`;
const OUT = process.env.OUT_DIR ?? 'docs/visual-qa/admin-bracket-canvas';
const TOURNAMENT_ID = process.env.TOURNAMENT_ID;
const LEAGUE_ID = process.env.LEAGUE_ID;

const WIDTHS = [
  { key: 'mobile', width: 390, height: 844, narrow: true },
  { key: 'edge767', width: 767, height: 900, narrow: true },
  { key: 'tablet', width: 768, height: 1024, narrow: false },
  { key: 'desktop', width: 1440, height: 900, narrow: false },
];

const TARGETS = [
  TOURNAMENT_ID && { key: 'tournament', path: `/admin/tournaments/${TOURNAMENT_ID}/bracket`, hasToolbar: true },
  LEAGUE_ID && { key: 'league', path: `/admin/league-matches/${LEAGUE_ID}`, hasToolbar: false },
].filter(Boolean);

async function login() {
  const preset = process.env.ALPHA_SESSION_TOKEN;
  if (preset) return preset;
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.ALPHA_EMAIL, password: process.env.ALPHA_PASSWORD }),
  });
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const hit = raw.map((c) => /teameet_v1_session=([^;]+)/.exec(c)).find(Boolean);
  if (!hit) throw new Error(`로그인 실패 HTTP ${res.status}`);
  return hit[1];
}

/** 보이는 것만 센다 — 뷰 하나만 마운트되지만, 숨김 처리된 어드민 셸 노드가 섞이지 않게 한다. */
const READ = `(() => {
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const vis = (sel) => [...document.querySelectorAll(sel)].filter(seen);
  const text = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();

  const roundNav =
    vis('[role="tablist"][aria-label="라운드"]').length +
    vis('label').filter((el) => text(el) === '라운드').length;
  const notice = vis('[role="status"], [role="alert"]').filter((el) => text(el).includes('큰 화면에서 편집해요')).length;
  const structureButtons = vis('button').filter((el) => /템플릿으로 시작|경기 추가|무작위 채우기|대진표 공개/.test(text(el))).length;
  const roots = [document.documentElement, document.querySelector('.tm-scroll-area')].filter(Boolean);
  const overflowX = roots.some((el) => el.scrollWidth - el.clientWidth > 1);
  const smallTargets = vis('main button, main a, main select').filter((el) => {
    const r = el.getBoundingClientRect();
    return Math.min(r.width, r.height) < 44;
  }).length;
  return { roundNav, notice, structureButtons, overflowX, smallTargets };
})()`;

function judge(width, target, r) {
  const problems = [];
  if (width.narrow) {
    if (r.roundNav < 1) problems.push('라운드 탭/셀렉트가 없음');
    if (r.notice < 1) problems.push('큰 화면 안내가 없음');
    if (r.structureButtons !== 0) problems.push(`구조 편집 버튼 ${r.structureButtons}개 노출`);
  } else {
    if (r.roundNav !== 0) problems.push('큰 화면인데 모바일 라운드 탭이 보임');
    if (r.notice !== 0) problems.push('큰 화면인데 안내 문구가 보임');
    if (target.hasToolbar && r.structureButtons < 1) problems.push('구조 편집 툴바가 없음');
  }
  if (r.overflowX) problems.push('가로 넘침');
  return problems;
}

async function main() {
  if (TARGETS.length === 0) throw new Error('TOURNAMENT_ID 또는 LEAGUE_ID 가 필요해요');
  const session = await login();
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const rows = [];
  let failed = false;

  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: width.width, height: width.height },
      storageState: {
        cookies: [{ name: 'teameet_v1_session', value: session, domain: 'alpha.teameet.co.kr', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }],
        origins: [],
      },
    });
    const page = await context.newPage();
    try {
      for (const target of TARGETS) {
        const res = await page.goto(`${BASE}${target.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        const status = res?.status() ?? 0;
        if (status >= 400) {
          failed = true;
          rows.push({ 화면: target.key, 폭: width.key, HTTP: status, 판정: status === 403 ? '403 rate limit — 판정 불가, 잠시 뒤 다시' : `HTTP ${status}` });
          continue;
        }
        await page.waitForTimeout(4000);
        const r = await page.evaluate(READ);
        await page.screenshot({ path: `${OUT}/${target.key}--${width.key}.png` });
        const problems = judge(width, target, r);
        if (problems.length > 0) failed = true;
        rows.push({
          화면: target.key, 폭: width.key, HTTP: status,
          라운드탭: r.roundNav, 안내: r.notice, 구조버튼: r.structureButtons, 가로넘침: r.overflowX, '44px미만': r.smallTargets,
          판정: problems.length === 0 ? 'OK' : problems.join(' / '),
        });
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } finally {
      await context.close();
    }
  }
  await browser.close();
  console.table(rows);
  console.log(`캡처: ${OUT}/ (갤러리에는 mobile·tablet·desktop 만 올린다 — edge767 은 경계 확인용)`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\n실패: ${error.message}`);
  process.exit(1);
});
```

- [ ] **Step 3: 게이트 통과 확인**

```bash
cd apps/v1_api && ./node_modules/.bin/jest --maxWorkers=1 --selectProjects runner-contract test/config/alpha-probe-readonly.contract.spec.ts
```

Expected: PASS (새 스크립트에 대해 존재·변경 동작 0·쓰기 메서드는 로그인 POST 하나뿐). 실패하면 스크립트 **주석까지 포함해** 금지 토큰(`.click(` `.fill(` `.press(` `.type(` `.check(` 등)이 들어갔는지 먼저 본다.

- [ ] **Step 4: README 표에 한 줄 추가**

`scripts/README-alpha-verify.md` 의 스크립트 표(`capture-claim-my-record.mjs` 행 아래)에 추가:

```md
| `capture-alpha-bracket-canvas.mjs` | 어드민 대진 화면(대회 `/bracket` · 정규 리그 상세)의 모바일/데스크톱 분기 — 📱390/767/📲768/🖥1440 캡처 + **계산값 판정**(라운드 탭 개수·구조 편집 버튼 0개·"큰 화면에서 편집해요" 안내·가로 넘침·44px 미만 터치). `TOURNAMENT_ID`·`LEAGUE_ID`(대진이 있는 것) 필요, 읽기 전용 | 플랫폼 어드민(owner·ops) |
```

- [ ] **Step 5: 커밋**

```bash
git add -- scripts/capture-alpha-bracket-canvas.mjs
git commit -m "test(scripts): alpha 대진 모바일 분기 읽기 전용 캡처·판정 스크립트" -- scripts/capture-alpha-bracket-canvas.mjs scripts/README-alpha-verify.md apps/v1_api/test/config/alpha-probe-readonly.contract.spec.ts
git show --stat HEAD
```

Expected: 커밋에 세 파일. 스크립트 실행은 PR 머지 후 alpha 배포 확인(Task 13 Step 2) 뒤에 한다.

---

### Task 12: 마감 — changeset·태스크 문서·API 문서 확인

**Files:**
- Create: `.changeset/admin-bracket-canvas-mobile.md`
- Modify: `.github/tasks/20261057-admin-bracket-canvas.md` (3행 `Status:`, 383행 PR-6 체크박스)

**Interfaces:**
- Consumes: `scripts/release/check-changeset-policy.mjs --repo <경로> --changed-files-file <파일>` (CI `deploy.yml:135` 와 같은 검사)
- Produces: PR-6 changeset 1개

- [ ] **Step 1: changeset 작성**

`.changeset/admin-bracket-canvas-mobile.md` (PR-1~5 는 각자 changeset 을 갖고, 이 파일은 PR-6 몫이다. 웹 전용 PR 이라 `v1_web` 만 적는다 — `config.json` 의 `fixed` 그룹이라 `v1_api` 도 같은 릴리스로 올라가므로 `v1_api` 를 따로 적지 않는다):

```md
---
"v1_web": minor
---

어드민 대진 그림을 휴대폰 크기에서도 쓸 수 있어요. 768px 미만에서는 라운드 탭과 경기 목록으로 바뀌고, 경기를 누르면 아래에서 올라오는 창에서 팀을 넣고 점수를 입력하고 확인할 수 있어요. 정규 리그 일정 보드도 같은 방식으로 보여요. 대진 구조를 바꾸는 편집은 큰 화면에서만 할 수 있어요.
```

- [ ] **Step 2: changeset 정책 검사를 로컬에서 먼저 돌린다**

CI 는 `v1_web` 변경 PR 에 changeset 이 없으면 dev-push 에서 실패하고 alpha 배포가 막힌다.

```bash
set -e
git fetch origin dev -q
SP="<세션 scratchpad 절대경로>"   # 시스템 프롬프트의 Scratchpad directory 값을 그대로 넣는다(/tmp 금지)
mkdir -p "$SP"
git diff --name-only origin/dev...HEAD > "$SP/changed-files.txt"
test -s "$SP/changed-files.txt"   # 비어 있으면 정책 검사가 아무것도 못 보고 통과하므로 여기서 멈춘다
node scripts/release/check-changeset-policy.mjs --repo . --changed-files-file "$SP/changed-files.txt"
```

`SP` 는 반드시 실제 경로로 바꿔 넣는다(정의 없이 `$SP` 를 쓰면 `/changed-files.txt` 에 쓰려다 실패한다). Expected: 종료 코드 0, 오류 출력 없음. changeset 을 빼고 돌리면 정책 오류가 나는지(대조군) 한 번 확인해도 좋다.

- [ ] **Step 3: API 문서 갱신 대상이 없음을 확인**

이 PR 은 엔드포인트·응답 계약을 바꾸지 않는다(`docs/api/domains/tournaments.md`·`league-matches.md` 갱신 불필요). 다음으로 확인한다:

```bash
git diff --name-only origin/dev...HEAD | grep -E '^apps/v1_api/src/' || echo "api src 변경 없음"
```

Expected: `api src 변경 없음`. 값이 나오면 이 PR 에 섞인 백엔드 변경이므로 그 변경이 계약을 바꾸는지 보고 `docs/api/` 를 같은 PR 에서 고친다.

- [ ] **Step 4: 태스크 문서 Status 와 PR-6 체크박스 갱신**

`.github/tasks/20261057-admin-bracket-canvas.md`:

- 3행 `Status: Planning` → `Status: QA Pending — PR-1~6 dev 머지, alpha E2E(사용자 승인 후) 대기`
- 383행 `- [ ] 390 라운드 탭 + 바텀시트, 구조 편집 숨김. changeset. 태스크 문서 Status 갱신.` → `- [x] 390 라운드 탭 + 바텀시트, 구조 편집 숨김. changeset. 태스크 문서 Status 갱신.`

`Done` 계열 표기는 쓰지 않는다 — `.github/tasks/README.md` 가 그 표기로 archive 대상을 가르고, alpha E2E 가 끝나기 전에 완료 표기를 하면 태스크가 archive 로 밀려난다. Original Conditions·Acceptance Criteria 체크박스도 alpha 증거(Task 13)가 모이기 전에는 건드리지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add -- .changeset/admin-bracket-canvas-mobile.md
git commit -m "chore(admin): 대진 모바일 changeset과 태스크 상태 갱신" -- .changeset/admin-bracket-canvas-mobile.md .github/tasks/20261057-admin-bracket-canvas.md
git show --stat HEAD
```

Expected: 커밋에 두 파일.

- [ ] **Step 6: PR 전 최종 게이트 (이 PR 영향 범위만)**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas src/lib/bracket-canvas-mobile-model.test.ts "src/app/admin/tournaments/[id]/bracket" "src/app/admin/league-matches/[leagueId]" && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs
cd ../v1_api && ./node_modules/.bin/jest --maxWorkers=1 --selectProjects runner-contract test/config/alpha-probe-readonly.contract.spec.ts
```

Expected: 전부 PASS / 오류 0. 풀스위트는 돌리지 않는다(영향 범위 밖). 커밋본 기준 빌드 건강은 push 직전 `git status` 에 이 PR 파일의 미커밋 잔여가 없는지로 확인한다.

PR 은 base `dev` 로 올리고(`gh pr view <N> --json baseRefName --repo kim-song-jun/matchup-sports-platform` 로 확인), 제목·본문은 한국어, 본문에 "갤러리를 머지 후에 채우는 이유(로컬 next 서버로 렌더하지 않고 alpha 가 ground truth)"를 적는다. Copilot 리뷰는 `gh pr edit <N> --add-reviewer copilot-pull-request-reviewer --repo kim-song-jun/matchup-sports-platform` 로 요청하고 본문 지적(`generated no new comments` 아님)이 남지 않을 때까지 반복한다.

---

### Task 13: alpha QA 체크리스트 (ego-browser E2E 1~5 + 390/768/1440 갤러리)

코드 변경 없음. **alpha 에 새 대회·리그·경기 결과를 만드는 단계는 실행 전에 사용자의 직접 승인이 필요하다**(결과가 있는 경기와 만들어진 대진은 지울 수 없다 — `FIXTURE_NOT_DELETABLE` 409). 승인은 다른 에이전트나 이 계획 문서로 대신할 수 없다. 승인 전에 할 수 있는 것은 1단계(배포 확인)와 읽기 전용 캡처뿐이다.

- [ ] **Step 1: 사용자 승인 받기**

다음을 그대로 사용자에게 보여 주고 "alpha 에 새 테스트 대회 2개(토너먼트·조별+결선)와 새 정규 리그 1개를 만들고 결과를 확정해도 되는지"를 묻는다. 승인 전에는 Step 3 이후를 시작하지 않는다.

| 만드는 것 | 지워지는가 |
|---|---|
| 8강 토너먼트 대회 1 (시나리오 1·2·5) | 대진 생성 즉시 게임·감사기록이 붙어 삭제 409 — 영구히 남는다 |
| 2조×4팀 조별+결선 대회 1 (시나리오 3) | 위와 같음 |
| 4팀 2회전 정규 리그 1 (시나리오 4) | 위와 같음 |
| 확정 결과·알림·순위·전적 | 결과 있는 경기는 지울 수 없다 |

- [ ] **Step 2: 배포 창 피하기 — 측정 전에 반드시**

```bash
gh run list --workflow deploy-alpha.yml --branch dev --limit 1 --repo kim-song-jun/matchup-sports-platform --json headSha,status,conclusion --jq '.[0]'
curl -fsSI https://alpha.teameet.co.kr/landing | grep -i 'x-teameet-\(release\|commit\)'
curl -fsS https://alpha.teameet.co.kr/api/v1/health
git merge-base --is-ancestor <PR-6 머지 커밋> <x-teameet-commit 값> && echo "포함됨"
```

Expected: `conclusion: success`, `x-teameet-commit` 이 PR-6 머지 커밋 이후, health 의 `.data.checks.db === true`, "포함됨". 배포 중(`in_progress`)이거나 직전 run 이 `cancelled` 면 마지막 **성공** 배포 SHA 를 기준으로 판단한다. 502 구간에서 측정한 결과로 화면을 결함이라 단정하지 않는다.

- [ ] **Step 3: 준비**

- 계정·비밀번호는 저장소가 아니라 비공개 메모리 `alpha-e2e-test-accounts.md`(`~/.claude/projects/<이 저장소>/memory/`)에서 읽는다. 저장소·PR 코멘트·스크립트 어디에도 적지 않는다. 플랫폼 어드민(`adminRole=ops`)과 참가팀 확정에 쓸 팀장·선수 계정을 쓴다.
- `ego-browser` 스킬을 **먼저 읽고** 작업별 task space 하나를 만들어 재사용한다. 사용자 제어권 오류("user is controlling")가 나오면 재시도하지 말고 멈춰 사용자에게 계속/종료를 묻는다.
- 세션 쿠키는 `teameet_v1_session` 하나이며 `login` API 만 발급 경로다(alpha 는 헤더 dev 인증이 401). 자동화가 위험 버튼을 우발적으로 누르지 않게 클릭 헬퍼가 접근성 이름을 denylist(저장·생성·추가·삭제·초기화·무효·공개 전환 등)와 대조하도록 하고, **의도한 단계에서만** 해당 버튼을 허용 플래그로 누른다.
- 칸 상태 판정은 화면이 아니라 공개 API 를 ground truth 로 한다: `GET https://alpha.teameet.co.kr/api/v1/tournaments/<id>/matches/<fixtureId>` (비인증). 스타일은 computed 값으로 읽는다.

- [ ] **Step 4: 시나리오 1 — 8강 토너먼트를 처음부터 끝까지 (1440, 어드민)**

1. 대회 만들기 → 대진 관리 → [그림] → 템플릿으로 시작 → 토너먼트·8팀·3·4위전 넣기 → 만들기. **기대:** 경기 8·연결 8·ENTRY 자리 8.
2. 참가팀 8팀을 확정해 둔 상태에서 「빈 자리 무작위 채우기」. **기대:** 8강 4경기 사이드가 모두 팀으로 채워짐, 같은 팀이 두 자리에 없음.
3. 8강 칸마다 점수 → 결과 확정. 한 경기는 일부러 무승부로 넣어 승부차기 없이 확정을 시도. **기대:** 승부차기를 넣기 전에는 확정 불가(`TOURNAMENT_PENALTY_REQUIRED`), 넣으면 확정되고 승자가 4강 칸에 자동 진출.
4. 4강·3·4위전·결승도 같은 방식. **기대:** 모든 확정 칸에 "어드민 빠른 입력" 표시.
5. 공개 대진표·팀 전적·순위, 양 팀 결과 알림을 확인. **기대:** 공개 API 의 점수가 입력값과 같고 알림 1회.
- 증거: 단계별 스크린샷 `s1-1-template.png` … `s1-5-public.png`.

- [ ] **Step 5: 시나리오 2 — 결과를 잘못 넣었다 (1440)**

1. 시나리오 1 의 확정된 8강 칸 → 점수 고치기(사유 입력) → 새 점수 확정. 4강이 시작 전이면 **기대:** 4강 칸의 팀이 바뀜.
2. 다른 8강 칸 → 결과 무효(사유 입력). **기대:** 4강 칸이 비고 그 8강 경기에 다시 점수를 넣을 수 있음.
3. 4강을 이미 시작·확정한 뒤 앞 8강 경기를 고치거나 무효 시도. **기대:** "다음 경기가 이미 시작돼서 바꿀 수 없어요", 아무것도 바뀌지 않음.
4. (선택) 라이브 콘솔로 득점이 기록된 경기 칸. **기대:** 그림에서 고치기 대신 「결과 정정」 화면 링크.

- [ ] **Step 6: 시나리오 3 — 조별+결선 (1440)**

템플릿 조별+결선 · 2조×4팀 · 조 2팀 진출 → 조 자리 8·조별 12경기·4강 2·결승 1. 조 자리에 팀을 넣으면 그 팀의 조별 3경기에 모두 들어가는지, 조별 결과를 다 넣은 뒤 「순위대로 채우기」 미리보기에서 동률 자리를 직접 고르고 채우는지, 공개 대진표에 조별 진행 중엔 "A조 1위" 자리 라벨이, 채운 뒤엔 팀 이름이 나오는지 확인한다.

- [ ] **Step 7: 시나리오 4 — 정규 리그 일정을 팀보다 먼저 (1440, 어드민 + 공개)**

리그 어드민 → [일정 보드] → 템플릿 4팀·2회전·일정(첫 경기일·간격·시각·장소) → 빈 경기 12개. **기대:** 공개 리그 화면(비로그인)에는 아직 경기가 하나도 안 보임. 자리 1~4 에 참가팀을 넣으면 그 팀의 경기·팀 일정이 생기고 공개 일정에 나타나며, 마지막 자리가 채워지면 일괄 생성과 같은 진행 상태가 된다. 경기마다 점수 → 확정 → 순위 반영.

- [ ] **Step 8: 시나리오 5 — 모바일 현장 입력 (390, PR-6 의 핵심)**

ego-browser 뷰포트를 390×844 로 두고 시나리오 1 의 대회 대진 관리를 연다.

1. **기대:** 라운드 탭(8강·4강·결승)과 칸 목록이 보이고, 템플릿·경기 추가·무작위 채우기·공개 전환 버튼이 없으며 "큰 화면에서 편집해요" 안내가 보인다. 가로 스크롤 없음.
2. 시작 전 칸을 누른다. **기대:** 바텀시트가 열리고 팀·점수 입력이 보인다. 빈 사이드에는 「팀 고르기」, 고르면 해당 자리에 팀이 들어간다(후보에 이미 다른 자리에 있는 팀이 없다).
3. 두 팀이 찬 칸에서 점수 → 확정. **기대:** 시트가 닫히고 칸이 "확정"으로 바뀌며 "어드민 빠른 입력" 표시, 공개 API 점수 일치.
4. 시트를 연 채 **뒤로가기**. **기대:** 시트만 닫히고 대진 화면에 남음. 한 번 더 뒤로가기는 이전 화면으로 간다.
5. 확정 전 결과(콘솔로 제출한 경기)가 있으면 칸 → 확인 액션. 득점 기록이 있는 확정 경기는 「결과 정정 화면으로 가기」 링크만 보인다.
6. 라운드가 6개 이상인 화면(조 8개 + 결선 등)이 있으면 라운드 선택이 셀렉트로 바뀌는지 확인한다.
7. 읽기 전용 확인: support 어드민 계정으로 같은 화면. **기대:** 안내 문구·입력·고르기 버튼이 모두 없고 칸 보기만 된다.
- 증거: `s5-1-list.png`, `s5-2-sheet-score.png`, `s5-3-pick-team.png`, `s5-4-after-back.png`, `s5-5-readonly.png`.

- [ ] **Step 9: 390 / 768 / 1440 갤러리 (읽기 전용 스크립트)**

```bash
export ALPHA_SESSION_TOKEN='v1.<payload>.<HMAC>'   # 어드민 로그인 API 로 발급(저장소에 적지 않는다)
TOURNAMENT_ID=<시나리오 1 대회> LEAGUE_ID=<시나리오 4 리그> node scripts/capture-alpha-bracket-canvas.mjs
```

Expected: 판정 표의 모든 행이 `OK`(390·767 은 라운드 탭 ≥1·구조 버튼 0·안내 1·가로 넘침 없음 / 768·1440 은 라운드 탭 0·안내 0·툴바 있음). 767 행이 모바일, 768 행이 데스크톱으로 갈리는 것이 경계 증거다. 403 rate limit 이 한 번이라도 나오면 1분 이상 쉬었다가 다시 돌린다(41장 캡처를 통째로 날린 선례) — 반복해서 더 찍지 않는다. 시트가 열린 화면(Step 8 의 390 증거)은 스크립트가 아니라 ego-browser 스크린샷을 쓴다.

갤러리는 `docs/ops/pr-review-visual-workflow.md` §3.4 대로 게시한다: 📱390 / 📲768 / 🖥1440 을 화면별 3열, **SHA 고정 raw URL** 로 이미지를 걸고 raw URL 이 200 인지 확인한 뒤 PR-6 코멘트로 올린다. 변경 파일이 300개를 넘어 Copilot 리뷰가 거부되면 PNG 를 트리에서 `git rm` 한다(코멘트의 raw URL 은 SHA 고정이라 그대로 렌더된다).

- [ ] **Step 10: 정리와 마무리**

- ego-browser 워크스페이스를 별도 실행에서 `await task.finish({ keep: [] })` 로 완전히 닫는다. 이 작업이 만든 로컬 프로세스는 없다(로컬 next 서버를 쓰지 않았다).
- 결과를 사용자 메시지에 **직접** 싣는다: 시나리오 1~5 통과/실패 표, 핵심 스크린샷(특히 390 시트·뒤로가기 후), 판정 표, 만든 대회·리그 id. 파일 경로만 알리지 않는다.
- 전부 통과하고 사용자가 확인하면 태스크 문서를 닫는다: `Status:` 를 `Done` 으로, Original Conditions·Acceptance Criteria 의 증거가 모인 항목을 체크하고
  ```bash
  git mv .github/tasks/20261057-admin-bracket-canvas.md .github/tasks/archive/20261057-admin-bracket-canvas.md
  git commit -m "docs(tasks): 어드민 대진 그림 편집기 태스크 완료 처리" -- .github/tasks/20261057-admin-bracket-canvas.md .github/tasks/archive/20261057-admin-bracket-canvas.md
  ```
  실패한 시나리오가 있으면 `Done` 표기도 archive 이동도 하지 않고 원인 화면의 PR 을 새로 연다.
- 머지 후 메인 작업트리의 로컬 `dev` 동기화: `cd /Users/sungjun/Dev/projects/matchup-sports-platform && git fetch origin dev -q && git merge --ff-only origin/dev`. `dev → main` 승격은 사용자만 한다.

---

## Self-Review

스펙 항목과 이 계획의 태스크 대응.

| 스펙 항목 | 태스크 |
|---|---|
| S7 모바일(<768): 라운드 탭 + 칸 목록, 칸 → `BottomSheet` 에서 팀 넣기·점수·확인 | Task 5(탭·목록), Task 6(시트·점수·확인·정정), Task 7(팀 넣기) |
| S7 구조 편집 버튼 숨김 + "큰 화면에서 편집해요" 안내 | Task 5(안내·구조 버튼 0개 단언), Task 9·10(툴바가 `wide` 쪽에만 있음) |
| D8 (a) 모바일은 보기·팀 넣기·결과 입력, 구조 편집은 768 이상 | Task 1(767/768 경계 테스트), Task 11(767 대 768 값 판정) |
| 리그 일정 보드도 같은 모바일 처리 | Task 4(`buildLeagueMobileRounds` — PR-5b `buildLeagueBoard` 소비)·Task 2(리그 후보 어댑터), Task 10 |
| S7 권한 `canWrite=false` 읽기 전용 | Task 5(안내 없음), Task 6(폼·액션 없음), Task 7(고르기 버튼 없음), Task 9·10(`data-can-write=false` 전달) |
| S7 캐시 무효화·토스트·오류 메시지 | Task 7(`describeBracketCanvasError` 오류 토스트·입력 유지). 무효화는 PR-3 훅 몫(`useV1AssignTournamentSlot` 등) — 이 PR 은 호출만 한다 |
| S7 접근성: 44px·`aria-*`·모달 a11y·토큰·`transition-colors` | Task 5~7 마크업(`min-h-[44px]`·`aria-haspopup/expanded`·`BottomSheet`=`useModalA11y`), Task 11(44px 미만 터치 수 보고) |
| S5/D6 득점 기록 있는 경기는 정정 화면으로 | Task 6(`hasLiveRecords` → 링크, 액션 숨김) |
| S5 빠른 입력 표시("어드민 빠른 입력") | Task 3(`quickEntered` 도출), Task 5(카드 태그), Task 6(득점자 없음 안내) |
| S5 칸 상태(예정·진행 중·확정 전·확정·취소) 표시 | Task 3(상태 도출: PR-3 `fixtureNodeState` + 팀매치 취소), Task 5(PR-3 `bracketNodeStateChip` 으로 글자+아이콘) |
| S3 후보 규칙(ENTRY·BYE 교차, GROUP_RANK 제외) | Task 2(`pickableCandidates` 대조군 포함), Task 7(목록 단언) |
| S4 조 순위 자리는 순위대로 채우기로만 | Task 7(고르기 버튼 없음 + 안내) |
| Test Scenarios 웹: `<768` 구조 편집 버튼 숨김·안내 | Task 5, Task 9, Task 10, Task 11 |
| Test Scenarios 웹: 끌어 놓기 없이 누르기로 배정 | Task 7 |
| Scenario 5 모바일 현장 입력 | Task 13 Step 8 |
| 뒤로가기로 시트 닫기(확인 요청 사항) | Task 8(실제 오버레이 히스토리, 변이 확인 포함) |
| Scenario 1~4 alpha 통과, 390/768/1440 갤러리, 사용자 승인 후 데이터 쓰기 | Task 13 Step 1·4~9 |
| PR 마다 changeset(웹 전용은 `v1_web` 만) | Task 12 |
| 태스크 문서 Status 갱신 | Task 12 Step 4, Task 13 Step 10 |
| 정본 §6·API 문서·마이그레이션 | 해당 없음(이 PR 은 프론트 전용) — Task 12 Step 3 이 확인 |

공유 계약 중복 구현 점검(보충 계약 2026-10-09): 이 PR 은 아래를 **새로 만들지 않고** 생산자 것을 import 한다.

| 이름 | 생산 | 이 PR 의 사용처 |
|---|---|---|
| `bracketNodeStateChip` · `FixtureNodeState` · `fixtureNodeState` | PR-3 | Task 3(상태 도출)·Task 5(칩)·Task 6(시트 칩) — PR-6 자체 상태 맵 없음 |
| `fixtureSideLabel` · `buildSideLabelContext` | PR-3 | Task 2·4(사이드 라벨) — 자체 라벨 조합 없음 |
| `formatGameResultScoreWithPenalties` | 기존 `lib/game-result-score.ts` | Task 3(점수 글자) — 자체 `formatScoreText` 없음 |
| `buildLeagueBoard` | PR-5b | Task 4(리그 라운드 = 경기일 열)·Task 10 — 자체 날짜 묶음 없음 |
| `V1AdminLeagueTeam.registrationId: string \| null`(필수 필드) | PR-5b | Task 2(`candidatesFromLeagueTeams` — undefined 분기·누락 fixture 없음) |
| `describeBracketCanvasError` | PR-3 | Task 6·7 |
| `makeGroup`·`makeFixture`·`makeSlot`·`makeGame`·`makeRegistration`·`makeBracket` | PR-3 | Task 2~9 테스트 — 자체 빌더는 PR-3 빌더 위의 얇은 별칭만 |

**Task 2 분할 순서 메모:** 원래 한 Task 였던 순수 모델(614줄)은 의존 순서대로 세 Task 로 쪼갰다 — ① 타입·사이드·후보 빌더(Task 2) ② 칸 카드 상태 도출(Task 3) ③ 라운드 탭 묶기(Task 4). 라운드 묶기가 칸 카드 빌더를 부르므로 칸 카드 도출이 먼저다. 각 Task 는 자기 red/green/commit 을 가진다.

**남은 가정(실행 시 Task 1 Step 1 에서 대조):** PR-3 의 `fixtureNodeState`·`fixtureSideLabel` 매핑과 문구, `useV1AssignTournamentSlot` 의 인자 모양, `useV1QuickResult` 인자, `BracketQuickResultForm`(`onSubmit` 형)·`BracketResultActions`(자체 변이 형) props, 페이지 `BracketPageBody` 의 `view === 'canvas'` 분기 모양(Task 9 Step 8 찾을 블록), PR-5b 클라이언트의 `LeagueScheduleBoard` 요소 모양과 `canWrite`·`series`·`teamsData` 변수 이름(Task 10 Step 4 찾을 블록). 어긋나면 찾을 블록·호출부 JSX 만 맞추고, 그 밖의 차이는 `BLOCKED` 로 보고한다.
