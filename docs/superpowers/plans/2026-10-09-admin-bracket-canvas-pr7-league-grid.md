# 어드민 대진 그림 편집기 PR-7 — 리그 방식 대회의 「라운드 × 조 격자 + 조별 순위표」

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 대회 대진 그림에서 `format === 'league'` 인 대회는 768px 이상에서 자유 캔버스 대신 **행 = 라운드, 열 = 조** 격자를 보여 주고, 조별 순위표(순위·팀·경기·승·무·패·득실·승점)를 1024 이상에서는 오른쪽 sticky 열에, 768~1023 에서는 「순위표」 버튼이 여는 `BottomSheet` 에 둔다. 경기 카드(선택·팀 끌어 놓기·탭 배정·상태 칩·빠른 입력 표식)의 동작은 지금과 같고, 리그에서는 의미 없는 「경기 연결」 버튼만 숨긴다.

**Architecture:** 서버·API·DB 는 바꾸지 않는다 — `V1AdminTournamentBracket` 이 이미 `groups`(+`groupTeams`)·`fixtures`(+`round`)·`standings` 를 준다(서버 `getBracket` 이 `standings` 에 `teamName` 까지 붙여 보내고, 순위 행은 경기 확정(OFFICIAL)·무효 투영 때 서버가 갱신한다). 순수 모델 두 개(`lib/bracket-league-grid-model.ts`, `lib/bracket-league-standings-model.ts`)가 응답을 격자·순위표 모양으로 바꾸고, 새 컴포넌트 둘(`BracketLeagueGrid`, `BracketLeagueStandings`)이 그린다. 경기 카드는 새로 만들지 않고 `BracketCanvasNode` 에 **흐름 배치 변형**(`position` 생략 가능 + `fullTitle`)을 더해 재사용한다. `BracketCanvasWorkspace` 는 `format` 으로 격자/캔버스를 가르고, 리그 격자가 생기면 캔버스의 `mode: 'league'` 경로(`leagueColumns`)는 쓰는 곳이 없어지므로 **같은 PR 에서 삭제**한다. 768 미만은 PR-6 모바일 목록을 쓰되, 리그 대회는 라운드 탭이 `조별` 한 개로 뭉치므로 같은 격자 모델로 라운드 탭을 만든다.

**Tech Stack:** Next.js 16 + React 19 + TanStack Query 5 + Vitest + Testing Library(`apps/v1_web`), 읽기 전용 Playwright 캡처 스크립트(`scripts/`), Jest 계약 스펙(`apps/v1_api` 의 alpha-probe-readonly).

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md`(S7, D8) · 결정 페이지 `scratchpad/decisions/league-format/index.html` B안(2026-10-09 사용자 확정) · 색인 `docs/superpowers/plans/2026-10-08-admin-bracket-canvas-index.md` · 선행 `...-pr6-mobile-finish.md`(PR #1745)

## 결정 기록 (ADR)

**Context.** alpha 의 리그 방식 대회 둘을 1440 에서 보면 라운드마다 열이 하나라 10라운드가 가로로 길고, A·B조 경기가 한 열에 섞이며, 라운드 번호가 없는 옛 데이터는 「조별 리그」 열 하나에 세로로만 쌓인다. 순위표는 어느 화면에도 없다. 사용자가 3안 중 B(라운드 × 조 격자 + 옆 순위표)를 골랐다(2026-10-09). UI 착수 전 A·B·C 3안 제시 → 선택 규칙은 이 결정으로 충족됐다.

**Decision.**
1. 격자는 **리그 방식 대회 전용 컴포넌트**다. 토너먼트·조별+결선 캔버스, 정규 리그 일정 보드, 공개 페이지는 건드리지 않는다.
2. 순위는 서버가 준 `standings` 를 그대로 보여 준다(클라이언트가 승점·득실을 다시 계산하지 않는다 — 계산 규칙은 서버 대회 설정이 정본이라 복제하면 공개 순위 탭과 어긋난다). 정렬은 서버 `position`, 행이 아직 없는 팀은 조 편성 순서로 뒤에 0 으로 붙인다.
3. 라운드 번호가 없는 옛 데이터는 **경기 번호 순서로 조마다 k 경기씩 끊어** 행을 만든다: `k = max(1, floor(그 조 팀 수 / 2))`. 팀 수는 `group.groupTeams.length`, 조 편성이 비면 그 열 경기에 등장하는 서로 다른 팀 수. 이 행은 추정이므로 격자 위에 「라운드 정보가 없어 경기 번호 순서로 나눴어요.」 안내를 둔다.
4. 「순위표 보기」 토글: 1024 이상에서 경기 카드를 선택하면 오른쪽 열을 패널이 차지하고 순위표는 접힌다. 그때 격자 위 버튼 「순위표 보기」 를 누르면 **선택을 해제**해(패널 닫기) 순위표가 돌아온다. 네 번째 열이나 아코디언을 만들지 않는 이유: 옆 열이 이미 트레이 240 + 패널 320 이라 1440 에서 격자가 더 좁아진다.

**Consequences.** 장점: 가로 스크롤 없는 읽기 구조, 순위가 늘 옆에 있음, 옛 데이터도 읽힘. 단점: 그림판이 두 갈래(캔버스/격자)가 되어 관리 대상이 늘고, 패널과 순위표를 동시에 볼 수 없으며, 조가 3개 이상이면 1440 에서도 격자 컨테이너 안에서만 가로 스크롤이 생긴다(`minmax(176px, 1fr)`). 되돌림: 워크스페이스 한 분기를 지우면 이전 캔버스 경로로 돌아가지만, `mode: 'league'` 를 이 PR 에서 삭제하므로 되돌릴 땐 git revert 로 한다.

## Global Constraints

- 작업은 최신 `origin/dev` 에서 만든 새 worktree 에서만 한다(`git fetch origin dev` 직후). PR-6(#1745)이 dev 에 머지된 뒤 착수한다. 메인 트리·로컬 `dev` 를 쓰지 않는다. worktree 에는 `node_modules` 가 없다 — 메인 트리 것을 심링크하되(`gitignore-misses-node-modules-symlink`) 디렉터리 pathspec 으로 `git add` 하지 않는다.
- 커밋은 `git commit -m "..." -- <명시한 파일들>` + 직후 `git show --stat HEAD`. 메시지 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `git add -A`·`git stash`·브랜치 전환 금지.
- 테스트는 `apps/v1_web` 안에서 `./node_modules/.bin/vitest run <파일>`(worktree 루트 + `--root` 금지). 타입: `./node_modules/.bin/tsc --noEmit`. 패턴: `node scripts/v1-pattern-check.mjs`. **로컬 next 서버를 띄우지 않는다** — 시각 검증은 머지 뒤 alpha(마지막 Task).
- 색·간격·글자 크기는 토큰(`var(--…)`, `tm-text-*`)만. 터치 요소 44px 이상. 상태는 색 + 텍스트/아이콘 병행. UI 문구 해요체. `transition-all` 금지. `React.forwardRef` 금지.
- 주석은 코드가 말하지 못하는 제약·함정만, 추가 줄의 1/3 안팎. 저장소 주석 언어를 따른다.
- 서버 응답 타입을 바꾸지 않으므로 MSW 핸들러·`apps/v1_api/test/fixtures` 는 건드리지 않는다. 테스트 데이터는 `src/test/bracket-canvas-fixtures.ts` 의 `makeGroup/makeFixture/makeSlot/makeGame/makeBracket` 만 쓴다. 순위 행 빌더 `makeStanding` 을 이 PR 이 같은 파일에 **추가**한다(Task 3).
- 대조군 규칙: 필터·분류 테스트는 양쪽(조 2개 이상, 라운드 번호 있는 경기 + 없는 경기)을 fixture 에 넣고 「여전히 포함된다」 방향도 단언한다.

## Review Focus

1. 순위표 숫자가 서버 `standings` 와 한 글자도 다르지 않은가(재계산 금지), 다른 조 순위가 섞이지 않는가.
2. 격자가 라운드 키(`league_r{n}`)를 문자열이 아니라 **숫자**로 정렬하는가(`league_r10` 이 `league_r2` 앞에 오면 결함).
3. 취소된 경기가 사라지지 않고 제 칸에 남는가. 선택·배정 콜백이 캔버스와 같은 인자로 불리는가.
4. 1023/1024 경계에서 순위표 위치(시트 ↔ 옆 열)가 맞고, 패널이 열리면 순위표가 접히는가.
5. 「경기 연결」 은 리그에서만 숨고 토너먼트·조별+결선에서는 그대로인가.
6. `mode: 'league'`·`leagueColumns` 삭제로 남은 참조·죽은 테스트가 없는가.
7. 모바일(<768)에서 리그 대회 라운드 탭이 「N라운드」 이고 토너먼트 모바일 모델 출력은 그대로인가.
8. 접근성: 격자 칸의 aria-label 이 조·라운드를 포함(visible 제목은 짧아도), 표 `<th scope>`·caption, 44px.

## File Structure

| 파일 | 역할 | 구분 |
|---|---|---|
| `apps/v1_web/src/lib/bracket-league-grid-model.ts` | 응답 → 라운드 × 조 격자 모델(순수) | 신규 |
| `apps/v1_web/src/lib/bracket-league-grid-model.test.ts` | 위 모델 테스트(번호 파싱·레거시 끊기·빈 조·취소) | 신규 |
| `apps/v1_web/src/lib/bracket-league-standings-model.ts` | `standings` → 조별 순위 행(순수) | 신규 |
| `apps/v1_web/src/lib/bracket-league-standings-model.test.ts` | 위 모델 테스트 | 신규 |
| `apps/v1_web/src/test/bracket-canvas-fixtures.ts` | `makeStanding` 빌더 추가 | 수정 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.tsx` | `position` 선택화 + `fullTitle` | 수정 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.test.tsx` | 흐름 변형 테스트 추가 | 수정 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-league-standings.tsx` | 조별 순위표 카드들 | 신규 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-league-standings.test.tsx` | 위 컴포넌트 테스트 | 신규 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-league-grid.tsx` | 라운드 × 조 격자 | 신규 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-league-grid.test.tsx` | 위 컴포넌트 테스트 | 신규 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx` | format 분기·「경기 연결」 숨김·순위표 배치 | 수정 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx` | 분기·경계 테스트 추가 | 수정 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx` / `.test.tsx` | `mode` prop 삭제 | 수정 |
| `apps/v1_web/src/lib/bracket-canvas-layout.ts` / `.test.ts` | `CanvasMode`·`leagueColumns` 삭제 | 수정 |
| `apps/v1_web/src/lib/bracket-canvas-mobile-model.ts` / `.test.ts` | 리그 대회 모바일 라운드 | 수정 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.tsx` / `.test.tsx` | `format` prop·순위 접이식 | 수정 |
| `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx` | 모바일 화면에 `format` 전달 | 수정 |
| `.changeset/admin-bracket-league-grid.md` | `v1_web: minor` | 신규 |
| `.github/tasks/20261057-admin-bracket-canvas.md` · 색인 plan | Ambiguity Log·PR-7 행 | 수정 |
| `scripts/capture-alpha-bracket-canvas.mjs` | 리그 격자 판정 추가 | 수정 |

## Task 1: worktree와 선행 조건 대조

**Files:** (코드 변경 없음)

**Interfaces:**
- Consumes: PR-6(#1745) 머지된 `origin/dev`. `BracketCanvasWorkspace`·`BracketCanvasNode`·`BracketCanvas`·`buildCanvasLayout`(`mode`)·`bracket-canvas-mobile-model.ts`·`BracketCanvasMobileScreen`.
- Produces: 작업 worktree `feat/bracket-league-grid`.

- [ ] **Step 1: worktree 만들기** (메인 트리·로컬 dev 건드리지 않는다)

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform
git fetch origin dev -q
gh pr view 1745 --repo kim-song-jun/matchup-sports-platform --json state,baseRefName,mergedAt
git worktree add .claude/worktrees/bracket-league-grid -b feat/bracket-league-grid origin/dev
ln -s /Users/sungjun/Dev/projects/matchup-sports-platform/node_modules .claude/worktrees/bracket-league-grid/node_modules
ln -s /Users/sungjun/Dev/projects/matchup-sports-platform/apps/v1_web/node_modules .claude/worktrees/bracket-league-grid/apps/v1_web/node_modules
```
기대: PR-6 `state: MERGED`, `baseRefName: dev`. 아니면 중단하고 보고한다(미머지 상태에서 분기하지 않는다).

- [ ] **Step 2: 계약 대조** — 아래가 모두 있어야 이 계획의 코드가 맞는다.

```bash
cd .claude/worktrees/bracket-league-grid/apps/v1_web
git grep -n "export function BracketCanvasMobileScreen\|export function BracketCanvasResponsive" -- src
git grep -n "mode: CanvasMode\|function leagueColumns" -- src/lib src/components
git grep -n "standings: V1AdminBracketStanding\[\]" -- src/types/api.ts
git grep -n "teamName: s.registration.team.name" -- ../v1_api/src/tournaments/tournament-bracket.service.ts
```
기대: 각 1건 이상. `V1AdminBracketStanding.teamName` 이 서버에서 채워지는 것(마지막 줄)이 순위표가 이름을 조 편성 조회 없이 읽는 근거다. 없으면 Task 3 의 팀 이름 출처를 `groupTeams` 조회로 바꾸고 BLOCKED 보고.

- [ ] **Step 3: 기준선** — 뒤 Task 의 회귀를 가르기 위해 영향 파일의 현재 상태를 한 번 돌린다.

```bash
./node_modules/.bin/vitest run src/components/admin/bracket-canvas src/lib/bracket-canvas-layout.test.ts src/lib/bracket-canvas-mobile-model.test.ts
./node_modules/.bin/tsc --noEmit
```
기대: 전부 통과. 실패가 있으면 내 변경이 아니므로 기록만 하고 진행 전 오케스트레이터에 알린다. 커밋 없음.

---

## Task 2: 격자 모델 — 라운드 번호 파싱 · 조 열 · 레거시 끊기

**Files:**
- Create: `apps/v1_web/src/lib/bracket-league-grid-model.ts`
- Test: `apps/v1_web/src/lib/bracket-league-grid-model.test.ts`

**Interfaces:**
- Consumes: `V1AdminBracketGroup`·`V1AdminBracketFixture`(`types/api.ts`), `tournamentRoundLabel`(`lib/tournament-round-label.ts`).
- Produces:
  ```ts
  export const LEAGUE_UNGROUPED_COLUMN_KEY = 'ungrouped';
  export type LeagueGridColumn = { key: string; groupId: string | null; label: string; fixtureCount: number };
  export type LeagueGridRow = { key: string; label: string; cells: Record<string, V1AdminBracketFixture[]> };
  export type LeagueGridModel = { columns: LeagueGridColumn[]; rows: LeagueGridRow[]; legacyChunking: boolean };
  export function sortLeagueGroups(groups: readonly V1AdminBracketGroup[]): V1AdminBracketGroup[];
  export function buildLeagueGrid(input: { groups: readonly V1AdminBracketGroup[]; fixtures: readonly V1AdminBracketFixture[] }): LeagueGridModel;
  ```
  규칙: `cells[column.key]` 는 모든 열에 대해 항상 존재(없으면 `[]`). 행 순서 = 번호 행(숫자 오름차순) → 그 밖 round 값 행(첫 등장 순). 취소된 경기도 제 칸에 남는다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it } from 'vitest';
import { makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import { buildLeagueGrid, LEAGUE_UNGROUPED_COLUMN_KEY } from './bracket-league-grid-model';

const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0 });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
const fx = (id: string, groupId: string | null, n: number, round: string, extra = {}) =>
  makeFixture({ id, groupId, fixtureNumber: n, round, ...extra });
const ids = (list: { id: string }[] | undefined) => (list ?? []).map((f) => f.id);

describe('buildLeagueGrid — 번호가 있는 라운드', () => {
  const fixtures = [
    fx('a10', 'gA', 30, 'league_r10'),
    fx('a2', 'gA', 3, 'league_r2'),
    fx('a1', 'gA', 1, 'league_r1'),
    fx('b1', 'gB', 2, 'league_r1'),
    fx('b2', 'gB', 4, 'league_r2'),
  ];

  it('행은 라운드 번호의 숫자 순서이고 league_r10 이 league_r2 뒤에 온다', () => {
    const grid = buildLeagueGrid({ groups: [gB, gA], fixtures });
    expect(grid.rows.map((row) => row.label)).toEqual(['1라운드', '2라운드', '10라운드']);
    expect(grid.legacyChunking).toBe(false);
  });

  it('열은 조의 sortOrder 순이고 각 칸에는 그 조의 그 라운드 경기만 들어간다', () => {
    const grid = buildLeagueGrid({ groups: [gB, gA], fixtures });
    expect(grid.columns.map((column) => column.label)).toEqual(['A조', 'B조']);
    expect(ids(grid.rows[0].cells.gA)).toEqual(['a1']);
    expect(ids(grid.rows[0].cells.gB)).toEqual(['b1']);
    // 대조: B조는 10라운드가 없다 — 빈 칸이지 누락이 아니다
    expect(ids(grid.rows[2].cells.gB)).toEqual([]);
    expect(ids(grid.rows[2].cells.gA)).toEqual(['a10']);
  });

  it('같은 조·같은 라운드의 여러 경기는 경기 번호 순으로 쌓인다', () => {
    const grid = buildLeagueGrid({
      groups: [gA],
      fixtures: [fx('x2', 'gA', 6, 'league_r1'), fx('x1', 'gA', 5, 'league_r1')],
    });
    expect(ids(grid.rows[0].cells.gA)).toEqual(['x1', 'x2']);
  });

  it('취소된 경기도 제 라운드·조 칸에 남는다', () => {
    const cancelled = fx('c1', 'gA', 1, 'league_r1', { status: 'cancelled' });
    const grid = buildLeagueGrid({ groups: [gA], fixtures: [cancelled, fx('a2', 'gA', 2, 'league_r2')] });
    expect(ids(grid.rows[0].cells.gA)).toEqual(['c1']);
    expect(grid.columns[0].fixtureCount).toBe(2);
  });

  it('league_r 형식이 아닌 round 값은 번호 행 뒤에 그 이름으로 붙는다(수동 추가 경기)', () => {
    const grid = buildLeagueGrid({ groups: [gA], fixtures: [fx('m', 'gA', 9, 'final'), fx('a1', 'gA', 1, 'league_r1')] });
    expect(grid.rows.map((row) => row.label)).toEqual(['1라운드', '결승']);
    expect(grid.legacyChunking).toBe(false);
  });
});

describe('buildLeagueGrid — 열', () => {
  it('경기가 없는 조도 열로 남고 fixtureCount 는 0 이다', () => {
    const grid = buildLeagueGrid({ groups: [gA, gB], fixtures: [fx('a1', 'gA', 1, 'league_r1')] });
    expect(grid.columns.map((c) => [c.label, c.fixtureCount])).toEqual([['A조', 1], ['B조', 0]]);
    expect(grid.rows[0].cells.gB).toEqual([]);
  });

  it('조가 하나도 없으면 「전체 경기」 열 하나', () => {
    const grid = buildLeagueGrid({ groups: [], fixtures: [fx('f1', null, 1, 'league_r1')] });
    expect(grid.columns).toEqual([{ key: LEAGUE_UNGROUPED_COLUMN_KEY, groupId: null, label: '전체 경기', fixtureCount: 1 }]);
  });

  it('조가 있을 때 조 없는 경기는 「조 미정」 열로 가고, 없으면 그 열이 생기지 않는다', () => {
    const withOrphan = buildLeagueGrid({ groups: [gA], fixtures: [fx('o', null, 2, 'league_r1'), fx('a1', 'gA', 1, 'league_r1')] });
    expect(withOrphan.columns.map((c) => c.label)).toEqual(['A조', '조 미정']);
    expect(buildLeagueGrid({ groups: [gA], fixtures: [fx('a1', 'gA', 1, 'league_r1')] }).columns).toHaveLength(1);
  });

  it('조도 경기도 없으면 열도 행도 없다', () => {
    expect(buildLeagueGrid({ groups: [], fixtures: [] })).toEqual({ columns: [], rows: [], legacyChunking: false });
  });
});

describe('buildLeagueGrid — 라운드 번호가 없는 옛 데이터', () => {
  const team = (id: string, n: number) => ({ id: `gt-${id}`, groupId: 'gA', registrationId: id, teamName: id, sortOrder: n, createdAt: '' });
  const four = makeGroup({ id: 'gA', name: 'A조', phase: 'group', groupTeams: ['r1', 'r2', 'r3', 'r4'].map((id, i) => team(id, i)) });
  const six = [1, 2, 3, 4, 5, 6].map((n) => fx(`f${n}`, 'gA', n, '조별 리그'));

  it('4팀 조는 k=2 라 경기 번호 순으로 2경기씩 3행이 된다', () => {
    const grid = buildLeagueGrid({ groups: [four], fixtures: [...six].reverse() });
    expect(grid.legacyChunking).toBe(true);
    expect(grid.rows.map((row) => row.label)).toEqual(['1라운드', '2라운드', '3라운드']);
    expect(grid.rows.map((row) => ids(row.cells.gA))).toEqual([['f1', 'f2'], ['f3', 'f4'], ['f5', 'f6']]);
  });

  it('팀이 2명 이하이거나 조 편성이 비면 k 는 1 이다', () => {
    const lone = makeGroup({ id: 'gA', name: 'A조', phase: 'group', groupTeams: [team('r1', 0)] });
    expect(buildLeagueGrid({ groups: [lone], fixtures: six }).rows).toHaveLength(6);
  });

  it('조 편성이 비면 그 조 경기에 등장하는 서로 다른 팀 수로 k 를 정한다', () => {
    const bare = makeGroup({ id: 'gA', name: 'A조', phase: 'group' });
    const withTeams = [
      fx('f1', 'gA', 1, '조별 리그', { homeRegistrationId: 'r1', awayRegistrationId: 'r2' }),
      fx('f2', 'gA', 2, '조별 리그', { homeRegistrationId: 'r3', awayRegistrationId: 'r4' }),
      fx('f3', 'gA', 3, '조별 리그', { homeRegistrationId: 'r1', awayRegistrationId: 'r3' }),
    ];
    // 팀 4 → k=2: [f1,f2] [f3]
    expect(buildLeagueGrid({ groups: [bare], fixtures: withTeams }).rows.map((r) => ids(r.cells.gA))).toEqual([['f1', 'f2'], ['f3']]);
  });

  it('조마다 따로 끊고 행 수는 가장 긴 조에 맞춘다', () => {
    const b = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
    const grid = buildLeagueGrid({ groups: [four, b], fixtures: [...six, fx('g1', 'gB', 7, '조별 리그')] });
    expect(grid.rows).toHaveLength(3);
    expect(ids(grid.rows[0].cells.gB)).toEqual(['g1']);
    expect(ids(grid.rows[1].cells.gB)).toEqual([]);
  });

  it('번호가 있는 경기가 하나라도 있으면 끊기를 쓰지 않는다', () => {
    const grid = buildLeagueGrid({ groups: [four], fixtures: [...six.slice(0, 2), fx('n', 'gA', 7, 'league_r1')] });
    expect(grid.legacyChunking).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-league-grid-model.test.ts`
Expected: FAIL — `Failed to resolve import "./bracket-league-grid-model"`.

- [ ] **Step 3: 최소 구현**

```ts
import type { V1AdminBracketFixture, V1AdminBracketGroup } from '@/types/api';
import { tournamentRoundLabel } from '@/lib/tournament-round-label';

export const LEAGUE_UNGROUPED_COLUMN_KEY = 'ungrouped';

export type LeagueGridColumn = { key: string; groupId: string | null; label: string; fixtureCount: number };
export type LeagueGridRow = { key: string; label: string; cells: Record<string, V1AdminBracketFixture[]> };
export type LeagueGridModel = { columns: LeagueGridColumn[]; rows: LeagueGridRow[]; legacyChunking: boolean };

const LEAGUE_ROUND = /^league_r(\d+)$/;

const roundNumber = (round: string): number | null => {
  const hit = LEAGUE_ROUND.exec(round.trim());
  return hit === null ? null : Number(hit[1]);
};

const byFixtureOrder = (a: V1AdminBracketFixture, b: V1AdminBracketFixture) =>
  a.fixtureNumber - b.fixtureNumber || a.legNumber - b.legNumber || a.id.localeCompare(b.id);

export function sortLeagueGroups(groups: readonly V1AdminBracketGroup[]): V1AdminBracketGroup[] {
  return [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id));
}

/** 팀 수 → 한 라운드에 한 조가 치르는 경기 수. 조 편성이 비면 그 열 경기에 나온 서로 다른 팀으로 센다. */
function gamesPerRound(group: V1AdminBracketGroup | undefined, fixtures: readonly V1AdminBracketFixture[]): number {
  const teamCount =
    group !== undefined && group.groupTeams.length > 0
      ? group.groupTeams.length
      : new Set(fixtures.flatMap((f) => [f.homeRegistrationId, f.awayRegistrationId]).filter((id): id is string => id !== null)).size;
  return Math.max(1, Math.floor(teamCount / 2));
}

type RowDraft = { key: string; label: string; sort: number; order: number; cells: Map<string, V1AdminBracketFixture[]> };

export function buildLeagueGrid(input: {
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
}): LeagueGridModel {
  const groups = sortLeagueGroups(input.groups);
  const known = new Set(groups.map((group) => group.id));
  const fixtures = [...input.fixtures].sort(byFixtureOrder);
  const columnKeyOf = (f: V1AdminBracketFixture) => (f.groupId !== null && known.has(f.groupId) ? f.groupId : LEAGUE_UNGROUPED_COLUMN_KEY);

  const byColumn = new Map<string, V1AdminBracketFixture[]>(groups.map((group) => [group.id, []]));
  for (const fixture of fixtures) {
    const key = columnKeyOf(fixture);
    byColumn.set(key, [...(byColumn.get(key) ?? []), fixture]);
  }
  const columns: LeagueGridColumn[] = groups.map((group) => ({
    key: group.id,
    groupId: group.id,
    label: group.name,
    fixtureCount: byColumn.get(group.id)?.length ?? 0,
  }));
  const orphans = byColumn.get(LEAGUE_UNGROUPED_COLUMN_KEY);
  if (orphans !== undefined && orphans.length > 0) {
    columns.push({ key: LEAGUE_UNGROUPED_COLUMN_KEY, groupId: null, label: groups.length === 0 ? '전체 경기' : '조 미정', fixtureCount: orphans.length });
  }

  const numbered = fixtures.some((f) => roundNumber(f.round) !== null);
  const drafts = new Map<string, RowDraft>();
  const place = (columnKey: string, fixture: V1AdminBracketFixture, key: string, label: string, sort: number) => {
    const draft = drafts.get(key) ?? { key, label, sort, order: drafts.size, cells: new Map() };
    draft.cells.set(columnKey, [...(draft.cells.get(columnKey) ?? []), fixture]);
    drafts.set(key, draft);
  };

  for (const column of columns) {
    const list = byColumn.get(column.key) ?? [];
    const chunk = gamesPerRound(groups.find((group) => group.id === column.groupId), list);
    list.forEach((fixture, index) => {
      if (!numbered) {
        const row = Math.floor(index / chunk);
        place(column.key, fixture, `c:${row}`, `${row + 1}라운드`, row);
        return;
      }
      const n = roundNumber(fixture.round);
      if (n !== null) place(column.key, fixture, `r:${n}`, `${n}라운드`, n);
      else place(column.key, fixture, `o:${fixture.round.trim()}`, tournamentRoundLabel(fixture.round), Number.POSITIVE_INFINITY);
    });
  }

  const rows = [...drafts.values()]
    .sort((a, b) => a.sort - b.sort || a.order - b.order)
    .map((draft) => ({
      key: draft.key,
      label: draft.label,
      cells: Object.fromEntries(columns.map((column) => [column.key, draft.cells.get(column.key) ?? []])),
    }));
  return { columns, rows, legacyChunking: !numbered && fixtures.length > 0 };
}
```

- [ ] **Step 4: 통과 확인**

Run: `./node_modules/.bin/vitest run src/lib/bracket-league-grid-model.test.ts && ./node_modules/.bin/tsc --noEmit`
Expected: PASS, tsc 0. (`o:` 행의 `order` 는 fixture 번호 순 첫 등장 순서 — 번호 행이 `Infinity` 보다 앞이라 뒤로 간다.)

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 리그 대회 대진 격자 모델 — 라운드 번호 파싱과 옛 데이터 경기 번호 끊기

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/v1_web/src/lib/bracket-league-grid-model.ts apps/v1_web/src/lib/bracket-league-grid-model.test.ts
git show --stat HEAD
```

---

## Task 3: 순위표 모델 — `standings` → 조별 순위 행

**Files:**
- Modify: `apps/v1_web/src/test/bracket-canvas-fixtures.ts` (`makeStanding` 추가)
- Create: `apps/v1_web/src/lib/bracket-league-standings-model.ts`
- Test: `apps/v1_web/src/lib/bracket-league-standings-model.test.ts`

**Interfaces:**
- Consumes: `sortLeagueGroups`(Task 2), `V1AdminBracketGroup`·`V1AdminBracketStanding`.
- Produces:
  ```ts
  export type LeagueStandingRow = {
    registrationId: string; teamName: string; rank: number;
    played: number; wins: number; draws: number; losses: number; goalDifference: number; points: number;
  };
  export type LeagueStandingsGroup = { groupId: string; name: string; rows: LeagueStandingRow[] };
  export function buildLeagueStandings(input: { groups: readonly V1AdminBracketGroup[]; standings: readonly V1AdminBracketStanding[] }): LeagueStandingsGroup[];
  export function makeStanding(overrides: Partial<V1AdminBracketStanding> & Pick<V1AdminBracketStanding, 'groupId' | 'registrationId'>): V1AdminBracketStanding; // 테스트 빌더
  ```
  규칙: 순위는 계산하지 않는다 — `played = wins+draws+losses`, `goalDifference` 는 서버 값 그대로, 정렬은 서버 `position` 오름차순(같으면 입력 순서), 순위 행이 없는 편성 팀은 `sortOrder` 순으로 0 값 행을 뒤에 붙인다. 팀이 하나도 없는 조는 결과에서 뺀다.

- [ ] **Step 1: 빌더와 실패하는 테스트**

`bracket-canvas-fixtures.ts` 맨 위 import 에 `V1AdminBracketStanding` 을 더하고 파일 끝에 추가:

```ts
export function makeStanding(
  overrides: Partial<V1AdminBracketStanding> & Pick<V1AdminBracketStanding, 'groupId' | 'registrationId'>,
): V1AdminBracketStanding {
  return {
    id: `st-${overrides.registrationId}`,
    teamName: `팀 ${overrides.registrationId}`,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    position: 1,
    recalculatedAt: STAMP,
    ...overrides,
  };
}
```

`bracket-league-standings-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeGroup, makeStanding } from '@/test/bracket-canvas-fixtures';
import { buildLeagueStandings } from './bracket-league-standings-model';

const team = (groupId: string, registrationId: string, teamName: string, sortOrder: number) => ({
  id: `gt-${registrationId}`, groupId, registrationId, teamName, sortOrder, createdAt: '',
});
const gA = makeGroup({
  id: 'gA', name: 'A조', phase: 'group', sortOrder: 0,
  groupTeams: [team('gA', 'r1', '송파', 0), team('gA', 'r2', '마포', 1), team('gA', 'r3', '한강', 2)],
});
const gB = makeGroup({
  id: 'gB', name: 'B조', phase: 'group', sortOrder: 1,
  groupTeams: [team('gB', 'r4', '알파8', 0), team('gB', 'r5', '알파7', 1)],
});

describe('buildLeagueStandings', () => {
  const standings = [
    makeStanding({ groupId: 'gA', registrationId: 'r2', teamName: '마포', position: 2, wins: 1, losses: 1, goalsFor: 2, goalsAgainst: 2, goalDifference: 0, points: 3 }),
    makeStanding({ groupId: 'gA', registrationId: 'r1', teamName: '송파', position: 1, wins: 2, goalsFor: 3, goalsAgainst: 0, goalDifference: 3, points: 6 }),
    makeStanding({ groupId: 'gB', registrationId: 'r4', teamName: '알파8', position: 1, wins: 1, draws: 1, goalsFor: 2, goalsAgainst: 1, goalDifference: 1, points: 4 }),
  ];

  it('서버 값을 그대로 옮기고 경기 수만 승무패 합으로 만든다', () => {
    const [a] = buildLeagueStandings({ groups: [gA, gB], standings });
    expect(a.rows[0]).toEqual({
      registrationId: 'r1', teamName: '송파', rank: 1, played: 2, wins: 2, draws: 0, losses: 0, goalDifference: 3, points: 6,
    });
  });

  it('position 순으로 정렬하고 다른 조 순위가 섞이지 않는다', () => {
    const result = buildLeagueStandings({ groups: [gA, gB], standings });
    expect(result.map((g) => g.name)).toEqual(['A조', 'B조']);
    expect(result[0].rows.slice(0, 2).map((r) => r.registrationId)).toEqual(['r1', 'r2']);
    expect(result[1].rows.map((r) => r.registrationId)).toEqual(['r4', 'r5']);
  });

  it('순위 행이 아직 없는 편성 팀은 0 으로 뒤에 붙는다(여전히 포함된다)', () => {
    const [a, b] = buildLeagueStandings({ groups: [gA, gB], standings });
    expect(a.rows.map((r) => [r.registrationId, r.rank, r.played, r.points])).toEqual([['r1', 1, 2, 6], ['r2', 2, 2, 3], ['r3', 3, 0, 0]]);
    expect(b.rows[1]).toMatchObject({ registrationId: 'r5', teamName: '알파7', rank: 2, played: 0, points: 0 });
  });

  it('standings 가 통째로 비어도 편성 팀 순서대로 0 표가 나온다', () => {
    const [a] = buildLeagueStandings({ groups: [gA], standings: [] });
    expect(a.rows.map((r) => [r.teamName, r.rank, r.points])).toEqual([['송파', 1, 0], ['마포', 2, 0], ['한강', 3, 0]]);
  });

  it('팀이 하나도 없는 조는 빠지고, 팀 이름이 없는 편성 행(registrationId null)은 건너뛴다', () => {
    const empty = makeGroup({ id: 'gE', name: 'C조', phase: 'group', sortOrder: 2 });
    const unnamed = makeGroup({
      id: 'gU', name: 'D조', phase: 'group', sortOrder: 3,
      groupTeams: [{ id: 'gt-x', groupId: 'gU', registrationId: null, teamName: null, sortOrder: 0, createdAt: '' }],
    });
    expect(buildLeagueStandings({ groups: [gA, empty, unnamed], standings: [] }).map((g) => g.name)).toEqual(['A조']);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-league-standings-model.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현** — `bracket-league-standings-model.ts`

```ts
import type { V1AdminBracketGroup, V1AdminBracketStanding } from '@/types/api';
import { sortLeagueGroups } from './bracket-league-grid-model';

export type LeagueStandingRow = {
  registrationId: string;
  teamName: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  points: number;
};
export type LeagueStandingsGroup = { groupId: string; name: string; rows: LeagueStandingRow[] };

/** 승점·득실은 서버 대회 설정이 정본이라 여기서 다시 계산하지 않는다 — 공개 순위 탭과 같은 숫자를 보여 주기 위해서다. */
export function buildLeagueStandings(input: {
  groups: readonly V1AdminBracketGroup[];
  standings: readonly V1AdminBracketStanding[];
}): LeagueStandingsGroup[] {
  return sortLeagueGroups(input.groups).flatMap((group) => {
    const recorded = input.standings.filter((s) => s.groupId === group.id).sort((a, b) => a.position - b.position);
    const recordedIds = new Set(recorded.map((s) => s.registrationId));
    const pending = [...group.groupTeams]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((t): t is typeof t & { registrationId: string; teamName: string } =>
        t.registrationId !== null && t.teamName !== null && !recordedIds.has(t.registrationId));
    const rows: LeagueStandingRow[] = [
      ...recorded.map((s) => ({
        registrationId: s.registrationId, teamName: s.teamName, played: s.wins + s.draws + s.losses,
        wins: s.wins, draws: s.draws, losses: s.losses, goalDifference: s.goalDifference, points: s.points,
      })),
      ...pending.map((t) => ({
        registrationId: t.registrationId, teamName: t.teamName, played: 0, wins: 0, draws: 0, losses: 0, goalDifference: 0, points: 0,
      })),
    ].map((row, index) => ({ ...row, rank: index + 1 }));
    return rows.length === 0 ? [] : [{ groupId: group.id, name: group.name, rows }];
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `./node_modules/.bin/vitest run src/lib/bracket-league-standings-model.test.ts && ./node_modules/.bin/tsc --noEmit`
Expected: PASS, tsc 0.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 리그 대회 조별 순위표 모델과 테스트 빌더

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/v1_web/src/lib/bracket-league-standings-model.ts apps/v1_web/src/lib/bracket-league-standings-model.test.ts apps/v1_web/src/test/bracket-canvas-fixtures.ts
git show --stat HEAD
```

---

## Task 4: 경기 카드 흐름 변형 — `position` 선택화 + `fullTitle`

**Files:**
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.test.tsx` (describe 추가)

**Interfaces:**
- Consumes: 기존 `BracketCanvasNodeProps`.
- Produces: `position?: CanvasNodeLayout`(없으면 부모 격자 칸을 채우는 `relative`, 폭 100%, 높이 `CANVAS_NODE_HEIGHT`) · `fullTitle?: string`(있으면 모든 aria-label 이 이것을 쓰고 보이는 `title` 은 짧게 둔다). 콜백 시그니처는 그대로.

- [ ] **Step 1: 실패하는 테스트** — 기존 파일의 렌더 헬퍼/픽스처 이름을 먼저 확인하고(`sed -n 1,50p`) 같은 방식으로 맞춰 아래를 추가한다.

```tsx
describe('BracketCanvasNode — 흐름 배치(position 없음)', () => {
  const flowFixture = makeFixture({ id: 'f1', groupId: 'gA', fixtureNumber: 3, round: 'league_r1' });
  const base = {
    fixture: flowFixture,
    title: '3번 경기',
    fullTitle: 'A조 · 조별리그 1라운드 3번 경기',
    sideLabels: { HOME: '송파', AWAY: '마포' },
    slots: { HOME: null, AWAY: null },
    selected: false,
    canWrite: true,
    pendingRegistrationId: null,
    onSelect: vi.fn(),
    onAssign: vi.fn(),
    onAssignDirect: vi.fn(),
  };

  it('좌표 없이 부모 칸을 채우고 보이는 제목은 짧지만 접근 이름은 조·라운드를 포함한다', () => {
    render(<BracketCanvasNode {...base} />);
    const group = screen.getByRole('group', { name: 'A조 · 조별리그 1라운드 3번 경기, 예정' });
    expect(group.style.position).not.toBe('absolute');
    expect(group.style.left).toBe('');
    expect(group.style.width).toBe('100%');
    expect(within(group).getByText('3번 경기')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A조 · 조별리그 1라운드 3번 경기 열기' })).toBeInTheDocument();
  });

  it('선택·직접 배정 콜백은 캔버스 칸과 같은 인자로 불린다', () => {
    const onSelect = vi.fn();
    const onAssignDirect = vi.fn();
    render(<BracketCanvasNode {...base} pendingRegistrationId="r9" onSelect={onSelect} onAssignDirect={onAssignDirect} />);
    fireEvent.click(screen.getByRole('button', { name: /^홈 송파, 선택한 팀을 여기에 넣어요/ }));
    expect(onAssignDirect).toHaveBeenCalledWith('f1', 'HOME', 'r9');
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'A조 · 조별리그 1라운드 3번 경기 열기' }));
    expect(onSelect).toHaveBeenCalledWith('f1');
  });
});
```

- [ ] **Step 2: 실패 확인** — `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-node.test.tsx`
Expected: FAIL — `position` 이 필수라 타입은 vitest 에서 통과하지만 `position.x` 접근에서 TypeError.

- [ ] **Step 3: 최소 구현** — `bracket-canvas-node.tsx`

props 타입: `position?: CanvasNodeLayout;` + `/** 접근 이름용 전체 제목. 보이는 title 이 칸 위치(행·열)로 이미 설명되는 격자에서 쓴다. */ fullTitle?: string;`. 함수 안에서 `const accessibleTitle = fullTitle ?? title;` 를 만들고 루트의 `aria-label={`${accessibleTitle}, ${chip.label}`}`, 헤더 버튼의 `aria-label={`${accessibleTitle} 열기`}` 로 바꾼다(보이는 `{title}` 텍스트는 그대로). 루트 style 은:

```tsx
const placement =
  position === undefined
    ? { position: 'relative' as const, width: '100%', height: CANVAS_NODE_HEIGHT }
    : { left: position.x, top: position.y, width: position.width, height: position.height };
// className 의 'absolute' 는 position 이 있을 때만:
className={`${position === undefined ? '' : 'absolute '}overflow-hidden bg-[var(--card-surface)]`}
style={{ ...placement, borderRadius: 'var(--radius-container)', border: selected ? '2px solid var(--blue500)' : '1px solid var(--border-strong)' }}
```
`CANVAS_NODE_HEIGHT` 를 `@/lib/bracket-canvas-layout` import 목록에 추가한다(이미 export 됨).

- [ ] **Step 4: 통과 확인** — 노드 테스트 전체 + `bracket-canvas.test.tsx`(캔버스 회귀) + tsc.
Run: `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-node.test.tsx src/components/admin/bracket-canvas/bracket-canvas.test.tsx && ./node_modules/.bin/tsc --noEmit`
Expected: PASS(기존 absolute 좌표 단언 포함 전부).

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 대진 경기 카드를 격자 칸에 놓을 수 있게 흐름 배치와 접근 이름을 추가

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.test.tsx
git show --stat HEAD
```

---

## Task 5: 조별 순위표 컴포넌트

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-league-standings.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-league-standings.test.tsx`

**Interfaces:**
- Consumes: `LeagueStandingsGroup`(Task 3).
- Produces: `export function BracketLeagueStandings(props: { groups: LeagueStandingsGroup[] }): JSX.Element` — 조마다 `<section aria-label="{조} 순위">` 안에 `<table>`(caption `{조} 순위표`, `<th scope="col">` 8개: 순위·팀·경기·승·무·패·득실·승점). 사이드 열(약 288~320px)에 들어가야 하므로 팀 열만 `truncate`, 숫자 열은 고정 폭 `tab-num`. 카드 재질은 `Card` 프리미티브 대신 솔리드 보더(`var(--border)`, `var(--card-surface)`) — 표 안에 들어가는 내부 여백을 직접 쓰기 위해서다. 득실은 `+3`/`0`/`-2` 로 부호를 붙인다(색만으로 전달하지 않는다).

- [ ] **Step 1: 실패하는 테스트**

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LeagueStandingsGroup } from '@/lib/bracket-league-standings-model';
import { BracketLeagueStandings } from './bracket-league-standings';

const row = (registrationId: string, teamName: string, rank: number, extra: Partial<LeagueStandingsGroup['rows'][number]> = {}) => ({
  registrationId, teamName, rank, played: 0, wins: 0, draws: 0, losses: 0, goalDifference: 0, points: 0, ...extra,
});
const groups: LeagueStandingsGroup[] = [
  { groupId: 'gA', name: 'A조', rows: [row('r1', '송파 유나이티드', 1, { played: 2, wins: 2, goalDifference: 3, points: 6 }), row('r2', '마포 레인저스', 2, { played: 2, losses: 2, goalDifference: -3 })] },
  { groupId: 'gB', name: 'B조', rows: [row('r4', '알파 6인 8팀', 1, { played: 1, wins: 1, goalDifference: 1, points: 3 })] },
];

describe('BracketLeagueStandings', () => {
  it('조마다 표를 따로 그리고 열 머리글 8개를 scope=col 로 둔다', () => {
    render(<BracketLeagueStandings groups={groups} />);
    const table = screen.getByRole('table', { name: 'A조 순위표' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['순위', '팀', '경기', '승', '무', '패', '득실', '승점']);
    expect(screen.getByRole('table', { name: 'B조 순위표' })).toBeInTheDocument();
  });

  it('행은 순위·팀·경기·승·무·패·득실·승점 순이고 득실에는 부호가 붙는다', () => {
    render(<BracketLeagueStandings groups={groups} />);
    const rows = within(screen.getByRole('table', { name: 'A조 순위표' })).getAllByRole('row').slice(1);
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['1', '송파 유나이티드', '2', '2', '0', '0', '+3', '6']);
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2', '마포 레인저스', '2', '0', '0', '2', '-3', '0']);
  });

  it('다른 조 팀이 섞이지 않는다', () => {
    render(<BracketLeagueStandings groups={groups} />);
    expect(within(screen.getByRole('table', { name: 'B조 순위표' })).queryByText('송파 유나이티드')).not.toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'B조 순위표' })).getByText('알파 6인 8팀')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인** — `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-league-standings.test.tsx` → FAIL(모듈 없음).

- [ ] **Step 3: 최소 구현**

```tsx
import type { LeagueStandingsGroup } from '@/lib/bracket-league-standings-model';

const HEADERS = ['순위', '팀', '경기', '승', '무', '패', '득실', '승점'] as const;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function BracketLeagueStandings({ groups }: { groups: LeagueStandingsGroup[] }) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section
          key={group.groupId}
          aria-label={`${group.name} 순위`}
          className="overflow-hidden"
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface)' }}
        >
          <h3 className="tm-text-caption-strong px-3 pt-3">{group.name} 순위</h3>
          <table className="w-full table-fixed">
            <caption className="sr-only">{group.name} 순위표</caption>
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                {HEADERS.map((header, index) => (
                  <th key={header} scope="col" className={`tm-text-caption px-1 py-2 font-medium ${index === 1 ? 'text-left' : 'text-center'}`} style={{ width: index === 1 ? undefined : index === 0 ? 36 : 32 }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.registrationId} className="border-t border-[var(--border)]">
                  <td className="tab-num tm-text-caption px-1 py-2 text-center">{row.rank}</td>
                  <td className="tm-text-label truncate px-1 py-2 font-semibold" title={row.teamName}>{row.teamName}</td>
                  {[row.played, row.wins, row.draws, row.losses].map((value, index) => (
                    <td key={index} className="tab-num tm-text-caption px-1 py-2 text-center">{value}</td>
                  ))}
                  <td className="tab-num tm-text-caption px-1 py-2 text-center">{signed(row.goalDifference)}</td>
                  <td className="tab-num tm-text-label px-1 py-2 text-center font-bold">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
```
`title` 속성은 잘린 팀 이름의 마우스 보조이고 접근 이름은 셀 텍스트가 이미 갖는다.

- [ ] **Step 4: 통과 확인** — vitest(위 파일) + `tsc --noEmit` + `node scripts/v1-pattern-check.mjs` → PASS / 0 / 위반 없음.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 리그 대진 조별 순위표 컴포넌트

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-league-standings.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-league-standings.test.tsx
git show --stat HEAD
```

---

## Task 6: 라운드 × 조 격자 컴포넌트

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-league-grid.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-league-grid.test.tsx`

**Interfaces:**
- Consumes: `buildLeagueGrid`(Task 2), `BracketCanvasNode` 흐름 변형(Task 4), `buildSideLabelContext`·`fixtureSideLabel`·`SideKey`(`lib/bracket-canvas-layout`), `fixtureTitle`(`./bracket-canvas`).
- Produces: `BracketLeagueGrid` — props 는 `BracketCanvasProps` 에서 `mode` 만 뺀 것과 같다:
  `{ groups; fixtures; slots; selectedFixtureId: string|null; pendingRegistrationId: string|null; canWrite: boolean; onSelectFixture(fixtureId); onAssignSlot(slotId, registrationId); onAssignDirect(fixtureId, side, registrationId) }`.
  루트는 `role="region" aria-label="대진 그림" data-league-grid`(가로 넘침 판정·캡처가 쓰는 표식). 열 폭 `minmax(176px, 1fr)` + 행 머리글 72px. 칸 제목은 「N번 경기」, 접근 이름은 `fixtureTitle` 전체. 빈 칸은 「경기 없음」 점선 칸. 옛 데이터 끊기면 위에 「라운드 정보가 없어 경기 번호 순서로 나눴어요.」.

- [ ] **Step 1: 실패하는 테스트**

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGame, makeGroup } from '@/test/bracket-canvas-fixtures';
import { BracketLeagueGrid } from './bracket-league-grid';

const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0 });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
const fixtures = [
  makeFixture({ id: 'a1', groupId: 'gA', fixtureNumber: 1, round: 'league_r1', homeTeamName: '송파', homeRegistrationId: 'r1', awayTeamName: '마포', awayRegistrationId: 'r2' }),
  makeFixture({ id: 'b1', groupId: 'gB', fixtureNumber: 2, round: 'league_r1' }),
  makeFixture({ id: 'a2', groupId: 'gA', fixtureNumber: 3, round: 'league_r2', status: 'cancelled', game: makeGame({ state: 'CANCELLED' }) }),
];

function renderGrid(overrides: Partial<React.ComponentProps<typeof BracketLeagueGrid>> = {}) {
  const props = {
    groups: [gA, gB], fixtures, slots: [], selectedFixtureId: null, pendingRegistrationId: null, canWrite: true,
    onSelectFixture: vi.fn(), onAssignSlot: vi.fn(), onAssignDirect: vi.fn(), ...overrides,
  };
  render(<BracketLeagueGrid {...props} />);
  return props;
}

describe('BracketLeagueGrid', () => {
  it('열은 조, 행은 라운드이고 경기는 제 칸에 들어간다', () => {
    renderGrid();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['A조', 'B조']);
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['1라운드', '2라운드']);
    const cell = screen.getByRole('group', { name: '1라운드 A조' });
    expect(within(cell).getByRole('group', { name: 'A조 · 조별리그 1라운드 1번 경기, 예정' })).toBeInTheDocument();
    expect(within(cell).queryByText('2번 경기')).not.toBeInTheDocument();
  });

  it('칸의 보이는 제목은 짧고 취소된 경기도 제 칸에 취소 칩으로 남는다', () => {
    renderGrid();
    const cancelled = within(screen.getByRole('group', { name: '2라운드 A조' })).getByRole('group', { name: /3번 경기, 취소/ });
    expect(within(cancelled).getByText('3번 경기')).toBeInTheDocument();
  });

  it('경기가 없는 칸은 「경기 없음」 으로 남는다', () => {
    renderGrid();
    expect(within(screen.getByRole('group', { name: '2라운드 B조' })).getByText('경기 없음')).toBeInTheDocument();
  });

  it('칸을 누르면 선택 콜백이 fixtureId 로 불리고 선택된 칸은 aria-pressed 다', () => {
    const props = renderGrid({ selectedFixtureId: 'b1' });
    expect(screen.getByRole('button', { name: 'B조 · 조별리그 1라운드 2번 경기 열기' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'A조 · 조별리그 1라운드 1번 경기 열기' }));
    expect(props.onSelectFixture).toHaveBeenCalledWith('a1');
  });

  it('고른 팀을 비어 있는 직접 지정 칸에 넣으면 onAssignDirect 가 불린다', () => {
    const props = renderGrid({ pendingRegistrationId: 'r9' });
    const cell = screen.getByRole('group', { name: '1라운드 B조' });
    fireEvent.click(within(cell).getByRole('button', { name: /^홈 .*선택한 팀을 여기에 넣어요/ }));
    expect(props.onAssignDirect).toHaveBeenCalledWith('b1', 'HOME', 'r9');
  });

  it('옛 데이터는 경기 번호 순서로 나눴다는 안내를 보이고, 번호가 있으면 보이지 않는다', () => {
    const legacy = fixtures.map((f) => ({ ...f, round: '조별 리그' }));
    const { unmount } = render(<BracketLeagueGrid {...{ groups: [gA, gB], fixtures: legacy, slots: [], selectedFixtureId: null, pendingRegistrationId: null, canWrite: true, onSelectFixture: vi.fn(), onAssignSlot: vi.fn(), onAssignDirect: vi.fn() }} />);
    expect(screen.getByText('라운드 정보가 없어 경기 번호 순서로 나눴어요.')).toBeInTheDocument();
    unmount();
    renderGrid();
    expect(screen.queryByText(/경기 번호 순서로 나눴어요/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인** — vitest(위 파일) → FAIL(모듈 없음).

- [ ] **Step 3: 최소 구현**

```tsx
'use client';

import { Fragment, useMemo } from 'react';
import { buildLeagueGrid } from '@/lib/bracket-league-grid-model';
import { buildSideLabelContext, fixtureSideLabel, type SideKey } from '@/lib/bracket-canvas-layout';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketSlot } from '@/types/api';
import { fixtureTitle } from './bracket-canvas';
import { BracketCanvasNode } from './bracket-canvas-node';

const ROW_LABEL_WIDTH = 72;
// 1440 에서 트레이(240)+패널(320)을 빼고도 조 2개가 가로 스크롤 없이 들어가는 최소 폭. 조가 3개 이상이면 컨테이너 안에서만 스크롤한다.
const COLUMN_MIN_WIDTH = 176;

export type BracketLeagueGridProps = {
  groups: V1AdminBracketGroup[];
  fixtures: V1AdminBracketFixture[];
  slots: V1AdminBracketSlot[];
  selectedFixtureId: string | null;
  pendingRegistrationId: string | null;
  canWrite: boolean;
  onSelectFixture: (fixtureId: string) => void;
  onAssignSlot: (slotId: string, registrationId: string) => void;
  onAssignDirect: (fixtureId: string, side: SideKey, registrationId: string) => void;
};

export function BracketLeagueGrid({
  groups, fixtures, slots, selectedFixtureId, pendingRegistrationId, canWrite, onSelectFixture, onAssignSlot, onAssignDirect,
}: BracketLeagueGridProps) {
  const grid = useMemo(() => buildLeagueGrid({ groups, fixtures }), [groups, fixtures]);
  const labelContext = useMemo(() => buildSideLabelContext(groups, fixtures, slots), [groups, fixtures, slots]);
  const slotsById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);

  return (
    <div
      role="region"
      aria-label="대진 그림"
      data-league-grid=""
      className="overflow-x-auto"
      style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface-muted)' }}
    >
      {grid.legacyChunking ? (
        <p className="tm-text-caption px-4 pt-3" style={{ color: 'var(--text-muted)' }}>
          라운드 정보가 없어 경기 번호 순서로 나눴어요.
        </p>
      ) : null}
      <div
        className="grid gap-3 p-4"
        style={{ gridTemplateColumns: `${ROW_LABEL_WIDTH}px repeat(${grid.columns.length}, minmax(${COLUMN_MIN_WIDTH}px, 1fr))` }}
      >
        <div aria-hidden="true" />
        {grid.columns.map((column) => (
          <h3 key={column.key} className="tm-text-caption-strong truncate">{column.label}</h3>
        ))}
        {grid.rows.map((row) => (
          <Fragment key={row.key}>
            <h4 className="tm-text-caption-strong pt-3">{row.label}</h4>
            {grid.columns.map((column) => {
              const cell = row.cells[column.key] ?? [];
              return (
                <div key={column.key} role="group" aria-label={`${row.label} ${column.label}`} className="flex min-w-0 flex-col gap-3">
                  {cell.length === 0 ? (
                    <p
                      className="tm-text-caption px-3 py-3 text-center"
                      style={{ color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-container)' }}
                    >
                      경기 없음
                    </p>
                  ) : (
                    cell.map((fixture) => (
                      <BracketCanvasNode
                        key={fixture.id}
                        fixture={fixture}
                        title={`${fixture.fixtureNumber}번 경기`}
                        fullTitle={fixtureTitle(fixture, groups)}
                        sideLabels={{ HOME: fixtureSideLabel(fixture, 'HOME', labelContext), AWAY: fixtureSideLabel(fixture, 'AWAY', labelContext) }}
                        slots={{
                          HOME: fixture.homeSlotId === null ? null : (slotsById.get(fixture.homeSlotId) ?? null),
                          AWAY: fixture.awaySlotId === null ? null : (slotsById.get(fixture.awaySlotId) ?? null),
                        }}
                        selected={fixture.id === selectedFixtureId}
                        canWrite={canWrite}
                        pendingRegistrationId={pendingRegistrationId}
                        onSelect={onSelectFixture}
                        onAssign={onAssignSlot}
                        onAssignDirect={onAssignDirect}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
```
`ROW_LABEL_WIDTH` 의 72px 는 「10라운드」(해요체 11px 캡션) 한 줄 폭이다.

- [ ] **Step 4: 통과 확인** — vitest(위 파일 + `bracket-canvas-node.test.tsx`) + `tsc --noEmit` + `node scripts/v1-pattern-check.mjs`.
Expected: PASS / 0 / 위반 없음. 직접 지정 테스트에서 `b1` 의 홈 사이드 라벨이 「미정」 이므로 정규식이 `홈 미정, 선택한 팀을…` 에 맞는다.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 리그 대진 라운드×조 격자 컴포넌트

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-league-grid.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-league-grid.test.tsx
git show --stat HEAD
```

---

## Task 7: 워크스페이스 분기 — 리그는 격자, 「경기 연결」 숨김, 죽은 `mode: 'league'` 삭제

**Files:**
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx`
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx`, `bracket-canvas.test.tsx`
- Modify: `apps/v1_web/src/lib/bracket-canvas-layout.ts`, `bracket-canvas-layout.test.ts`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx` (describe 추가)

**Interfaces:**
- Consumes: `BracketLeagueGrid`(Task 6), 워크스페이스의 `handleAssign`·`handleAssignDirect`·`setSelectedFixtureId`·`pendingRegistrationId`.
- Produces: `format === 'league'` → `BracketLeagueGrid`, 그 밖 → `BracketCanvas`(이제 `mode` prop 없음, 항상 토너먼트/결선 배치). 툴바 「경기 연결」 은 `format !== 'league'` 일 때만. `CanvasMode`·`CanvasLayoutInput.mode`·`leagueColumns` 는 삭제.

- [ ] **Step 1: 실패하는 테스트** — 기존 `bracket-canvas-workspace.test.tsx` 하단에 추가(상단 모킹·`renderWorkspace`·`setBracket`·`populated` 재사용).

```tsx
const lgA = makeGroup({ id: 'lgA', name: 'A조', phase: 'group', sortOrder: 0 });
const lgB = makeGroup({ id: 'lgB', name: 'B조', phase: 'group', sortOrder: 1 });
const leagueBracket = makeBracket({
  groups: [lgA, lgB],
  fixtures: [
    makeFixture({ id: 'l1', groupId: 'lgA', fixtureNumber: 1, round: 'league_r1' }),
    makeFixture({ id: 'l2', groupId: 'lgB', fixtureNumber: 2, round: 'league_r1' }),
    makeFixture({ id: 'l3', groupId: 'lgA', fixtureNumber: 3, round: 'league_r2' }),
  ],
});

describe('BracketCanvasWorkspace — 리그 방식 대회', () => {
  it('format 이 league 면 라운드×조 격자를 그리고 knockout 이면 캔버스를 그린다', () => {
    setBracket(leagueBracket);
    const { unmount } = render(<BracketCanvasWorkspace {...baseProps({ format: 'league' })} />);
    expect(screen.getByRole('region', { name: '대진 그림' })).toHaveAttribute('data-league-grid');
    expect(screen.getByRole('heading', { level: 4, name: '2라운드' })).toBeInTheDocument();
    unmount();
    setBracket(populated);
    render(<BracketCanvasWorkspace {...baseProps({ format: 'knockout' })} />);
    expect(screen.getByRole('region', { name: '대진 그림' })).not.toHaveAttribute('data-league-grid');
  });

  it('「경기 연결」 은 리그에서만 숨고 경기 추가·무작위 채우기·공개는 남는다', () => {
    setBracket(leagueBracket);
    const { unmount } = render(<BracketCanvasWorkspace {...baseProps({ format: 'league' })} />);
    expect(screen.queryByRole('button', { name: '경기 연결' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '경기 추가' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '빈 자리 무작위 채우기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지금 전체 공개' })).toBeInTheDocument();
    unmount();
    setBracket(populated);
    render(<BracketCanvasWorkspace {...baseProps({ format: 'knockout' })} />);
    expect(screen.getByRole('button', { name: '경기 연결' })).toBeInTheDocument();
  });

  it('격자 칸을 누르면 캔버스와 같은 칸 패널이 그 경기로 열린다', () => {
    setBracket(leagueBracket);
    render(<BracketCanvasWorkspace {...baseProps({ format: 'league' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'A조 · 조별리그 1라운드 1번 경기 열기' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('l1');
  });
});
```
`baseProps(overrides)` 는 기존 `renderWorkspace` 가 만드는 props 객체를 같은 파일 안에서 함수로 뽑아 둔 것이다(`renderWorkspace` 가 `baseProps` 를 호출하도록 리팩터 — 중복 정의 금지). 팀 고르기→직접 지정 콜백은 Task 6 의 격자 테스트가 보증하고, 워크스페이스의 `handleAssign*` 는 이 PR 이 건드리지 않은 기존 코드(기존 테스트가 보증)라 여기서는 패널 열림만 본다.

- [ ] **Step 2: 실패 확인** — `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx`
Expected: 새 3건 FAIL(캔버스가 그려지고 `data-league-grid` 없음, 「경기 연결」 존재).

- [ ] **Step 3: 구현**

1. `bracket-canvas-workspace.tsx`: `const leagueGrid = format === 'league';` 를 `isEmpty` 근처에 추가. 툴바의 「경기 연결」 `Button` 을 `{!leagueGrid ? (…) : null}` 로 감싼다(「경기 추가」 는 그대로). `Link2` import 는 유지. `<BracketCanvas …/>` 자리를:
```tsx
{leagueGrid ? (
  <BracketLeagueGrid
    groups={bracket.groups}
    fixtures={bracket.fixtures}
    slots={bracket.slots}
    selectedFixtureId={selectedFixture?.id ?? null}
    pendingRegistrationId={canWrite ? pendingRegistrationId : null}
    canWrite={canWrite}
    onSelectFixture={setSelectedFixtureId}
    onAssignSlot={handleAssign}
    onAssignDirect={handleAssignDirect}
  />
) : (
  <BracketCanvas … mode 줄만 빼고 그대로 … />
)}
```
2. 죽은 코드 삭제(같은 커밋): `bracket-canvas.tsx` 에서 `mode` prop·`CanvasMode` import 제거하고 `buildCanvasLayout({ groups, fixtures, slots })`. `bracket-canvas-layout.ts` 에서 `export type CanvasMode`, `CanvasLayoutInput.mode`, `function leagueColumns`, `buildCanvasLayout` 의 `input.mode === 'league' ? … :` 삼항(→ `bracketColumns(input.groups, input.fixtures)`), `withGroupBlocksColumn` 의 `input.mode !== 'bracket' ||` 조건을 지운다. `tournamentRoundLabel` import 가 `fixtureSideLabel` 에서 계속 쓰이는지 확인한다(쓰이면 유지).
3. 테스트 정리: `git grep -n "mode:" -- src/lib/bracket-canvas-layout.test.ts src/components/admin/bracket-canvas/bracket-canvas.test.tsx` 로 나온 `mode: 'bracket'` 인자를 전부 삭제하고, `mode: 'league'` 를 쓰던 케이스(layout 테스트의 「league」 열 묶음 2건 근처 `:199`·`:369`, canvas 테스트 `:106`)는 **리그 열 배치를 검증하던 것이라 삭제**한다(대체 검증은 Task 2 의 격자 모델 테스트). 삭제로 `makeGroup phase:'group'` 만 쓰는 조별 테스트가 모드 없이도 같은 결과인지 확인한다.

- [ ] **Step 4: 통과 확인 + 죽은 참조 0**

```bash
./node_modules/.bin/vitest run src/components/admin/bracket-canvas src/lib/bracket-canvas-layout.test.ts src/lib/bracket-league-grid-model.test.ts
./node_modules/.bin/tsc --noEmit
node scripts/v1-pattern-check.mjs
git grep -n "CanvasMode\|leagueColumns\|mode: 'league'\|mode=\"league\"" -- src
```
Expected: 전부 PASS, tsc 0, 마지막 grep 0건.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 리그 방식 대회 대진 그림을 격자로 바꾸고 경기 연결 버튼을 숨겨요

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.test.tsx apps/v1_web/src/lib/bracket-canvas-layout.ts apps/v1_web/src/lib/bracket-canvas-layout.test.ts
git show --stat HEAD
```

---

## Task 8: 순위표 배치 — 1024 이상 sticky 옆 열 · 패널이 열리면 접힘 · 768~1023 시트

**Files:**
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx` (describe 추가)

**Interfaces:**
- Consumes: `buildLeagueStandings`(Task 3), `BracketLeagueStandings`(Task 5), 기존 `sidePanel`(= `(min-width: 1024px)`), `BottomSheet`(`onClose` 모드).
- Produces (화면 계약):
  - `sidePanel` 이고 리그이며 순위 행이 있고 선택된 경기가 없으면 오른쪽 열에 `<aside aria-label="조별 순위" class="sticky top-4 self-start">`.
  - 경기를 선택하면 그 열은 칸 패널이 차지하고 순위표는 사라지며, 격자 위 오른쪽 정렬 버튼 「순위표 보기」 가 나타난다. 누르면 선택이 해제되어 순위표가 돌아온다.
  - `!sidePanel`(768~1023)이면 같은 자리에 「순위표」 버튼, 누르면 `BottomSheet title="조별 순위"`.
  - 리그가 아니거나 순위 행(편성 팀)이 하나도 없으면 aside·버튼 모두 없다.

- [ ] **Step 1: 실패하는 테스트**

```tsx
import { makeStanding } from '@/test/bracket-canvas-fixtures';

const gt = (groupId: string, registrationId: string, teamName: string, sortOrder: number) => ({
  id: `gt-${registrationId}`, groupId, registrationId, teamName, sortOrder, createdAt: '',
});
const standingGroupA = makeGroup({ id: 'lgA', name: 'A조', phase: 'group', sortOrder: 0, groupTeams: [gt('lgA', 'r1', '송파', 0), gt('lgA', 'r2', '마포', 1)] });
const standingGroupB = makeGroup({ id: 'lgB', name: 'B조', phase: 'group', sortOrder: 1, groupTeams: [gt('lgB', 'r4', '알파8', 0)] });
const withStandings = makeBracket({
  ...leagueBracket,
  groups: [standingGroupA, standingGroupB],
  standings: [
    makeStanding({ groupId: 'lgA', registrationId: 'r1', teamName: '송파', position: 1, wins: 1, goalDifference: 2, points: 3 }),
    makeStanding({ groupId: 'lgB', registrationId: 'r4', teamName: '알파8', position: 1 }),
  ],
});

describe('BracketCanvasWorkspace — 리그 순위표 배치', () => {
  it('1024 이상: 선택이 없으면 옆 열에 조별 순위가 있고, 경기를 고르면 패널로 바뀌며 「순위표 보기」 로 돌아온다', () => {
    setBracket(withStandings);
    render(<BracketCanvasWorkspace {...baseProps({ format: 'league' })} />);
    const aside = screen.getByRole('complementary', { name: '조별 순위' });
    expect(within(aside).getByRole('table', { name: 'A조 순위표' })).toBeInTheDocument();
    expect(within(aside).getByRole('table', { name: 'B조 순위표' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '순위표 보기' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'A조 · 조별리그 1라운드 1번 경기 열기' }));
    expect(screen.getByTestId('panel')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '조별 순위' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '순위표 보기' }));
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '조별 순위' })).toBeInTheDocument();
  });

  it('1024 와 1023 경계: 1024 는 옆 열, 1023 은 옆 열 없이 「순위표」 시트 버튼', () => {
    setBracket(withStandings);
    render(<BracketCanvasWorkspace {...baseProps({ format: 'league' })} />);
    resizeViewport(1024);
    expect(screen.getByRole('complementary', { name: '조별 순위' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '순위표' })).not.toBeInTheDocument();

    resizeViewport(1023);
    expect(screen.queryByRole('complementary', { name: '조별 순위' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '순위표' }));
    const dialog = screen.getByRole('dialog', { name: '조별 순위' });
    expect(within(dialog).getByRole('table', { name: 'A조 순위표' })).toBeInTheDocument();
  });

  it('리그가 아니거나 편성 팀이 없으면 순위표도 버튼도 없다', () => {
    setBracket(withStandings);
    const { unmount } = render(<BracketCanvasWorkspace {...baseProps({ format: 'group_knockout' })} />);
    expect(screen.queryByRole('complementary', { name: '조별 순위' })).not.toBeInTheDocument();
    unmount();
    setBracket(leagueBracket); // 조 편성 없음 + standings 없음
    render(<BracketCanvasWorkspace {...baseProps({ format: 'league' })} />);
    expect(screen.queryByRole('complementary', { name: '조별 순위' })).not.toBeInTheDocument();
    resizeViewport(900);
    expect(screen.queryByRole('button', { name: '순위표' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인** — `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx` → 새 3건 FAIL(aside·버튼 없음).

- [ ] **Step 3: 구현** — `bracket-canvas-workspace.tsx`

1. import: `buildLeagueStandings` (`@/lib/bracket-league-standings-model`), `BracketLeagueStandings`.
2. 훅 영역(조기 return 위, `teamNames` useMemo 아래)에:
```tsx
const [standingsSheetOpen, setStandingsSheetOpen] = useState(false);
const standingsGroups = useMemo(
  () => (bracket === undefined ? [] : buildLeagueStandings({ groups: bracket.groups, standings: bracket.standings })),
  [bracket],
);
```
3. 조기 return 뒤: `const showStandings = leagueGrid && standingsGroups.length > 0;` 와 `const rightColumn = sidePanel && (selectedFixture !== null || showStandings);`
4. 그리드 클래스의 조건을 `selectedFixture === null || !sidePanel` → `!rightColumn` 으로.
5. 리그 분기를 감싼다:
```tsx
<div className="flex min-w-0 flex-col gap-3">
  {showStandings && (sidePanel ? selectedFixture !== null : true) ? (
    <div className="flex justify-end">
      {sidePanel ? (
        <Button variant="outline" size="md" onClick={() => setSelectedFixtureId(null)}>순위표 보기</Button>
      ) : (
        <Button variant="outline" size="md" onClick={() => setStandingsSheetOpen(true)}>순위표</Button>
      )}
    </div>
  ) : null}
  <BracketLeagueGrid … />
</div>
```
6. 오른쪽 열: `{panel !== null && sidePanel ? panel : null}` →
```tsx
{rightColumn ? (
  panel !== null ? panel : (
    <aside aria-label="조별 순위" className="sticky top-4 self-start">
      <BracketLeagueStandings groups={standingsGroups} />
    </aside>
  )
) : null}
```
7. 시트(기존 칸 패널 시트 옆):
```tsx
{showStandings && !sidePanel && standingsSheetOpen ? (
  <BottomSheet open onClose={() => setStandingsSheetOpen(false)} title="조별 순위">
    <BracketLeagueStandings groups={standingsGroups} />
  </BottomSheet>
) : null}
```
`sticky` 는 스크롤러(`.tm-scroll-area`)와 사이에 `overflow` 조상이 없어야 먹는다 — 워크스페이스 래퍼에는 없다. Task 11 의 alpha 캡처에서 스크롤 후에도 aside 가 따라오는지 값으로 확인한다.

- [ ] **Step 4: 통과 확인** — 위 파일 vitest + 기존 워크스페이스 전체 + `tsc --noEmit` + `node scripts/v1-pattern-check.mjs`. Expected: 전부 PASS(기존 태블릿 시트 describe 포함).

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 리그 대진 순위표를 옆 열·시트로 보여 줘요

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx
git show --stat HEAD
```

---

## Task 9: 모바일(<768) — 리그 대회 라운드 탭을 「N라운드」 로 + 순위 접이식

**Context (검증 결과).** 지금 모바일은 `buildBracketMobileRounds` 가 조(group) 단위로만 묶는다 — 리그 대회의 조는 모두 `phase: 'group'` 이라 탭이 `조별`(조가 하나면 조 이름) **한 개**로 뭉치고, 라운드 번호는 어디에도 나오지 않는다. 라벨이 틀린 건 아니지만 10라운드 리그에서 한 탭 안에 경기가 전부 세로로 쌓이므로, PR-7 격자 모델의 행을 그대로 탭으로 쓴다(토너먼트·조별+결선 모델은 그대로).

**Files:**
- Modify: `apps/v1_web/src/lib/bracket-canvas-mobile-model.ts`, `bracket-canvas-mobile-model.test.ts`
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.tsx`, `bracket-canvas-mobile-screen.test.tsx`
- Modify: `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx` (모바일 화면에 `format` 전달)

**Interfaces:**
- Consumes: `buildLeagueGrid`(Task 2), `buildLeagueStandings`·`BracketLeagueStandings`(Task 3·5), 기존 `bracketMobileNode`·`MobileRound`·`buildSideLabelContext`.
- Produces:
  ```ts
  export function buildLeagueTournamentMobileRounds(input: {
    groups: V1AdminBracketGroup[]; fixtures: V1AdminBracketFixture[]; slots: V1AdminBracketSlot[];
  }): MobileRound[];   // 행 = 라운드 탭, 섹션 = 그 라운드의 조(경기가 있는 조만), 조가 하나뿐이면 heading null
  // BracketCanvasMobileScreenProps 에 format?: V1TournamentFormat 추가
  ```

- [ ] **Step 1: 실패하는 테스트**

모델(`bracket-canvas-mobile-model.test.ts`):
```ts
describe('buildLeagueTournamentMobileRounds', () => {
  const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0 });
  const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
  const fixtures = [
    makeFixture({ id: 'a10', groupId: 'gA', fixtureNumber: 5, round: 'league_r10' }),
    makeFixture({ id: 'a1', groupId: 'gA', fixtureNumber: 1, round: 'league_r1' }),
    makeFixture({ id: 'b1', groupId: 'gB', fixtureNumber: 2, round: 'league_r1' }),
    makeFixture({ id: 'a2', groupId: 'gA', fixtureNumber: 3, round: 'league_r2' }),
  ];

  it('라운드 번호 순서의 탭이 되고 섹션은 그 라운드에 경기가 있는 조만 가진다', () => {
    const rounds = buildLeagueTournamentMobileRounds({ groups: [gB, gA], fixtures, slots: [] });
    expect(rounds.map((r) => r.label)).toEqual(['1라운드', '2라운드', '10라운드']);
    expect(rounds[0].sections.map((s) => [s.heading, s.nodes.map((n) => n.fixtureId)])).toEqual([['A조', ['a1']], ['B조', ['b1']]]);
    expect(rounds[1].sections.map((s) => s.heading)).toEqual(['A조']); // B조는 2라운드 경기 없음 — 섹션이 없는 것이지 A조가 사라진 게 아니다
  });

  it('조가 하나면 섹션 제목이 없고 칸 제목은 번호만이다', () => {
    const [round] = buildLeagueTournamentMobileRounds({ groups: [gA], fixtures: [fixtures[1]], slots: [] });
    expect(round.sections[0].heading).toBeNull();
    expect(round.sections[0].nodes[0].title).toBe('1번 경기');
  });

  it('여러 조면 칸 제목에 조 이름이 붙는다', () => {
    const [round] = buildLeagueTournamentMobileRounds({ groups: [gA, gB], fixtures, slots: [] });
    expect(round.sections[1].nodes[0].title).toBe('B조 · 2번 경기');
  });
});
```
화면(`bracket-canvas-mobile-screen.test.tsx`): 기존 파일의 `useV1AdminBracket` 모킹 방식을 그대로 따라 아래 두 건을 추가한다(`format: 'league'` 와 standings 가 있는 응답).
```tsx
it('리그 대회는 라운드 탭이 「N라운드」 이고 조별 순위 접이식이 맨 위에 있다', () => {
  setBracket(leagueWithStandings);
  render(<BracketCanvasMobileScreen {...baseProps} format="league" />);
  expect(screen.getByRole('tab', { name: '1라운드' })).toBeInTheDocument();
  expect(screen.getByText('조별 순위')).toBeInTheDocument(); // <summary>
  expect(screen.getByRole('table', { name: 'A조 순위표', hidden: true })).toBeInTheDocument();
});

it('토너먼트는 순위 접이식 없이 지금 탭 그대로다', () => {
  setBracket(knockoutBracket);
  render(<BracketCanvasMobileScreen {...baseProps} format="knockout" />);
  expect(screen.queryByText('조별 순위')).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: /라운드$/ })).not.toBeInTheDocument();
});
```
(`tab` role 이름은 PR-6 의 라운드 탭 구현에 맞춘다 — 5개 초과면 셀렉트라 테스트 데이터는 라운드 2~3개로 둔다.)

- [ ] **Step 2: 실패 확인** — 두 파일 vitest → FAIL(함수·prop 없음).

- [ ] **Step 3: 구현**

`bracket-canvas-mobile-model.ts` 에 `import { buildLeagueGrid } from '@/lib/bracket-league-grid-model';` 를 더하고 `buildBracketMobileRounds` 아래에:
```ts
export function buildLeagueTournamentMobileRounds(input: {
  groups: V1AdminBracketGroup[];
  fixtures: V1AdminBracketFixture[];
  slots: V1AdminBracketSlot[];
}): MobileRound[] {
  const labels = buildSideLabelContext(input.groups, input.fixtures, input.slots);
  const grid = buildLeagueGrid({ groups: input.groups, fixtures: input.fixtures });
  const multi = grid.columns.length > 1;
  return grid.rows.map((row) => ({
    key: row.key,
    label: row.label,
    sections: grid.columns.flatMap((column) => {
      const list = row.cells[column.key] ?? [];
      if (list.length === 0) return [];
      const groupName = multi ? column.label : null;
      return [{ key: column.key, heading: groupName, nodes: list.map((f) => bracketMobileNode(f, groupName, false, labels)) }];
    }),
  }));
}
```
`bracket-canvas-mobile-screen.tsx`: props 에 `format?: V1TournamentFormat`; `rounds` useMemo 를 `format === 'league' ? buildLeagueTournamentMobileRounds(…) : buildBracketMobileRounds(…)`(deps 에 `format`). `standingsGroups` useMemo(조기 return 위) 를 두고, 반환을 fragment 로 바꿔 `BracketCanvasMobile` 위에:
```tsx
{format === 'league' && standingsGroups.length > 0 ? (
  <details className="mb-3" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface)' }}>
    <summary className="tm-text-label flex min-h-[44px] cursor-pointer items-center px-4 font-semibold">조별 순위</summary>
    <div className="px-3 pb-3"><BracketLeagueStandings groups={standingsGroups} /></div>
  </details>
) : null}
```
`page.tsx` 의 `<BracketCanvasMobileScreen … />` 에 `format={tournament?.format}`.

- [ ] **Step 4: 통과 확인** — `./node_modules/.bin/vitest run src/lib/bracket-canvas-mobile-model.test.ts src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.test.tsx src/components/admin/bracket-canvas/bracket-canvas-mobile.test.tsx` + `tsc --noEmit` + `node scripts/v1-pattern-check.mjs`. Expected: PASS(기존 토너먼트 모바일 테스트 포함 전부).

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 모바일 리그 대진을 N라운드 탭과 조별 순위 접이식으로 보여 줘요

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/v1_web/src/lib/bracket-canvas-mobile-model.ts apps/v1_web/src/lib/bracket-canvas-mobile-model.test.ts apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-mobile-screen.test.tsx "apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx"
git show --stat HEAD
```

---

## Task 10: changeset · 스펙 Ambiguity Log · 색인 행

**Files:**
- Create: `.changeset/admin-bracket-league-grid.md`
- Modify: `.github/tasks/20261057-admin-bracket-canvas.md` (Ambiguity Log 행 + 수용 기준 한 줄)
- Modify: `docs/superpowers/plans/2026-10-08-admin-bracket-canvas-index.md` (PR-7 행)

**Interfaces:**
- Consumes: Task 2~9 결과. `scripts/release/check-changeset-policy.mjs` — `apps/v1_web/` 변경이 있으면 changeset 필수, `.github/tasks/`·`docs/` 는 제외.
- Produces: dev-push CI 가 요구하는 changeset, 결정 이력.

- [ ] **Step 1: 정책 게이트가 지금 빨간지 확인(실패 먼저)**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/bracket-league-grid
node scripts/release/check-changeset-policy.mjs --help 2>/dev/null | head -3; git fetch origin dev -q
node scripts/release/check-changeset-policy.mjs
```
Expected: `apps/v1_web` 변경은 있는데 신규 changeset 이 없어 실패(스크립트 인자 규약은 파일 상단 주석을 따른다 — 기본 base 가 `origin/dev` 가 아니면 해당 인자를 준다).

- [ ] **Step 2: changeset 작성** — `.changeset/admin-bracket-league-grid.md`

```md
---
"v1_web": minor
---

리그 방식 대회의 어드민 대진 그림이 라운드는 아래로, 조는 옆으로 놓인 표 모양으로 바뀌어요. 가로로 길게 밀지 않아도 몇 라운드에 어느 조가 누구와 붙는지 한눈에 보이고, 조별 순위표(경기·승·무·패·득실·승점)가 옆에 함께 나와요. 경기를 누르면 순위표가 접히고 경기 상세가 열려요. 태블릿에서는 「순위표」 버튼으로 아래에서 올라오는 창에 순위를 보여 줘요. 리그에는 의미 없는 「경기 연결」 버튼은 숨겨요. 폰에서는 라운드 탭이 「1라운드, 2라운드…」로 나오고 맨 위에서 조별 순위를 펼쳐 볼 수 있어요. 라운드 번호가 없는 옛 대회는 경기 번호 순서대로 나눠서 보여 줘요.
```

- [ ] **Step 3: 스펙 문서 갱신** — Ambiguity Log 표(문서 끝, `| 2026-10-08 | main | 리그 빈 경기의 시각·장소 | … |` 아래)에 행을 더한다.

```md
| 2026-10-09 | main | 리그 방식 대회(`format=league`)의 대진 그림은 토너먼트 캔버스에 라운드 열로 올리면 열이 라운드 수만큼 늘고 순위가 없다. 어떻게 보여 줄까? | **2026-10-09 사용자 확정: B안.** 라운드(행) × 조(열) 격자 + 조별 순위표(1024 이상 sticky 옆 열 · 패널 열리면 접힘 · 768~1023 시트). 「경기 연결」 숨김. 옛 데이터(라운드 번호 없음)는 경기 번호 순서로 조마다 `max(1, floor(팀수/2))` 경기씩 끊음. 서버 변경 없음, 토너먼트·조별+결선 캔버스·정규 리그 보드·공개 페이지 불변. 모바일 라운드 탭은 같은 모델 재사용(PR-7) |
```
수용 기준(Acceptance Criteria) 의 S7 항목 근처에 한 줄: `- [ ] 리그 방식 대회 대진 그림: 라운드×조 격자 + 조별 순위표, 1440 가로 스크롤 없음, 순위 숫자 = 공개 순위 탭, 「경기 연결」 없음 (PR-7, 2026-10-09 B안)`. 해당 섹션 번호/표기는 파일을 읽고 기존 체크박스 문체를 따른다.

색인 표의 PR-6 행 아래에 한 줄: `| PR-7 | \`2026-10-09-admin-bracket-canvas-pr7-league-grid.md\` | 리그 방식 대회 라운드×조 격자 + 조별 순위표 · 모바일 라운드 탭 · 죽은 \`mode: 'league'\` 삭제 |` (표의 열 구성은 파일을 보고 맞춘다). 계획서 자체도 `docs/superpowers/plans/2026-10-09-admin-bracket-canvas-pr7-league-grid.md` 로 복사해 함께 커밋한다.

- [ ] **Step 4: 통과 확인** — `node scripts/release/check-changeset-policy.mjs` → 통과.

- [ ] **Step 5: 커밋**

```bash
git commit -m "docs: 리그 대진 격자(PR-7) changeset과 결정 이력

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- .changeset/admin-bracket-league-grid.md .github/tasks/20261057-admin-bracket-canvas.md docs/superpowers/plans/2026-10-08-admin-bracket-canvas-index.md docs/superpowers/plans/2026-10-09-admin-bracket-canvas-pr7-league-grid.md
git show --stat HEAD
```

---

## Task 11: alpha 읽기 전용 캡처 판정 추가 + 머지 후 검증 절차

**Files:**
- Modify: `scripts/capture-alpha-bracket-canvas.mjs`

**Interfaces:**
- Consumes: 스크립트의 `TARGETS`·`READ`·`judge` 구조(환경변수로 대상 지정 — 구조상 추가 가능). Task 6·8·9 가 심은 표식: `[data-league-grid]`, `aside[aria-label="조별 순위"]`, 캡션이 `…순위표` 인 `table`, 버튼 「순위표」, `summary` 「조별 순위」, 「경기 연결」 버튼.
- Produces: `LEAGUE_TOURNAMENT_IDS`(쉼표 구분) 환경변수 → 대상 `league-grid-1..n`(`/admin/tournaments/{id}/bracket`). 읽기만 한다(goto·evaluate·screenshot) — `alpha-probe-readonly` 계약 스펙이 게이트.

- [ ] **Step 1: 읽기 전용 계약 기준선(변경 전 통과 확인)**

```bash
cd apps/v1_api && SPEC=$(git ls-files | grep -m1 'alpha-probe-readonly'); echo "$SPEC"; [ -n "$SPEC" ] || exit 1
pnpm --filter v1_api exec jest "${SPEC#apps/v1_api/}" 2>&1 | tail -8
```
기대: 통과(`git ls-files` 가 비면 스펙 경로를 `git grep -l alpha-probe-readonly` 로 다시 찾는다).

- [ ] **Step 2: 스크립트 수정**

1. 상단 설명 주석에 한 줄: `- 리그 방식 대회(LEAGUE_TOURNAMENT_IDS): 768 이상 라운드×조 격자(data-league-grid)·「경기 연결」 없음·순위표(1024+ 옆 열 / 768~1023 「순위표」 버튼), 모바일은 「조별 순위」 접이식. 1440 격자 가로 넘침 없음`.
2. 환경변수·대상:
```js
const LEAGUE_TOURNAMENT_IDS = (process.env.LEAGUE_TOURNAMENT_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
const TARGETS = [
  TOURNAMENT_ID && { key: 'tournament', path: `/admin/tournaments/${TOURNAMENT_ID}/bracket`, hasToolbar: true },
  LEAGUE_ID && { key: 'league', path: `/admin/league-matches/${LEAGUE_ID}`, hasToolbar: false },
  ...LEAGUE_TOURNAMENT_IDS.map((id, index) => ({ key: `league-grid-${index + 1}`, path: `/admin/tournaments/${id}/bracket`, hasToolbar: true, leagueGrid: true })),
].filter(Boolean);
```
`main()` 의 `TARGETS.length === 0` 오류 문구에 `LEAGUE_TOURNAMENT_IDS` 를 더한다.
3. `READ` 의 반환 직전에 추가하고 반환 객체에 포함:
```js
const gridEl = document.querySelector('[data-league-grid]');
const leagueGrid = vis('[data-league-grid]').length;
const gridScrollX = gridEl ? gridEl.scrollWidth - gridEl.clientWidth > 1 : false;
const linkButtons = vis('button').filter((el) => text(el) === '경기 연결').length;
const standingsAside = vis('aside[aria-label="조별 순위"]').length;
const standingsTables = vis('table').filter((el) => /순위표$/.test(el.querySelector('caption')?.textContent ?? '')).length;
const standingsButton = vis('button').filter((el) => text(el) === '순위표').length;
const standingsDisclosure = vis('summary').filter((el) => text(el) === '조별 순위').length;
```
4. `judge` 끝(`if (r.overflowX)` 앞)에:
```js
if (target.leagueGrid) {
  if (r.linkButtons !== 0) problems.push('리그인데 「경기 연결」 이 보임');
  if (width.mode === 'mobile') {
    if (r.leagueGrid !== 0) problems.push('모바일인데 격자가 보임');
    if (r.standingsDisclosure < 1) problems.push('모바일 순위 접이식이 없음');
  } else {
    if (r.leagueGrid < 1) problems.push('리그 격자가 없음');
    if (width.key === 'desktop' && r.gridScrollX) problems.push('1440 격자 가로 넘침');
    if (width.mode === 'tablet' && r.standingsButton < 1) problems.push('태블릿 「순위표」 버튼이 없음');
    if (width.mode === 'desktop' && (r.standingsAside < 1 || r.standingsTables < 1)) problems.push('데스크톱 옆 순위표가 없음');
  }
}
```
`rows.push` 객체에 `격자: r.leagueGrid, 순위표: r.standingsTables, 연결버튼: r.linkButtons, 격자넘침: r.gridScrollX` 열을 더한다. 판정은 위 그대로 엄격하게 둔다. alpha 의 옛 4팀 대회에 조 편성(`groupTeams`)이 없어 순위표가 의도적으로 비는 경우가 Step 5 에서 확인되면 판정을 완화하지 말고 `BLOCKED: 옛 대회에 편성 팀이 없어 순위 판정 불가` 로 보고한다(그 대회의 순위 판정은 사용자 결정 사항).

- [ ] **Step 3: 읽기 전용 게이트 + 문법**

```bash
node --check scripts/capture-alpha-bracket-canvas.mjs
cd apps/v1_api && pnpm --filter v1_api exec jest "${SPEC#apps/v1_api/}" 2>&1 | tail -8
```
기대: 둘 다 통과(고정 문자열 `page.click`·`fill`·`.press(` 등을 쓰지 않았으니 계약 스펙이 그대로 통과해야 한다).

- [ ] **Step 4: 커밋** (코드 변경 PR 에 포함)

```bash
git commit -m "chore(scripts): alpha 대진 캡처에 리그 격자 판정을 추가해요

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- scripts/capture-alpha-bracket-canvas.mjs
git show --stat HEAD
```

- [ ] **Step 5: 머지 후 alpha 검증(로컬 next 서버 금지 — 이 저장소 규칙 7)**

PR 은 base `dev` 확인(`gh pr view <N> --repo kim-song-jun/matchup-sports-platform --json baseRefName`) 후 Copilot 리뷰 루프·미해결 스레드 0·CI green 으로 3-way 머지(`--merge`, squash 금지). 머지 후:
1. 배포 창 확인: `gh run list --workflow deploy-alpha.yml --branch dev --limit 1 --json headSha,status,conclusion`, `curl -fsSI https://alpha.teameet.co.kr/landing | grep -i x-teameet-commit` 가 내 머지 커밋 이후, `git merge-base --is-ancestor`.
2. 관리자 세션(`ALPHA_SESSION_TOKEN`, 비공개 메모리의 계정 사용 — 저장소에 적지 않는다)으로 읽기 전용 캡처:
```bash
LEAGUE_TOURNAMENT_IDS=6504ad45-dedf-4c48-899b-fef2de7ae707,9d167fba-1e19-4c2f-8084-8b8bd866fef2 \
  OUT_DIR=docs/visual-qa/admin-bracket-canvas-pr7 node scripts/capture-alpha-bracket-canvas.mjs
```
기대: `판정 OK` 전부(10장 = 폭 5 × 대회 2, 403 이면 잠시 뒤 재시도).
3. `ego-browser` 로 두 대회를 1440/1024/768/390 에서 열어 실제 흐름 확인(단계별 스크린샷): 카드 클릭 → 패널 → 「순위표 보기」, 스크롤해도 순위표 sticky, 팀 선택 후 빈 칸 탭 배정(쓰기는 alpha 데이터 변경이므로 **읽기만** — 쓰기 시험은 사용자 승인 없이 하지 않는다), 라운드 10개 정렬(10라운드가 2라운드 뒤), 옛 4팀 대회의 「경기 번호 순서로 나눴어요」 안내, 터치 타깃 44px 실측값.
4. 순위 숫자 대조: 같은 대회의 공개 「순위·대진표」 탭 숫자와 admin 순위표를 조별로 비교(다르면 완료라 하지 않고 원인 추적 — 서버 `standings` 투영이 정본).
5. 3폭 갤러리(📱390/📲768/🖥1440)를 SHA 고정 raw URL 로 그 PR 에 사후 코멘트(파일 300개 한도 때문에 스크린샷은 트리에서 `git rm`). 프로덕션 식별자는 올리지 않는다. 끝나면 ego task space 를 `task.finish({ keep: [] })` 로 닫고, 메인 트리 로컬 `dev` 를 `git fetch origin dev -q && git merge --ff-only origin/dev` 로 따라잡는다.

---

## Self-Review (원 요청 대조)

| 요구 | 반영 위치 |
|---|---|
| format=league, ≥768 격자(행 라운드, 열 조, `league_r{n}`→「N라운드」, 조 정렬, 조 없음→한 열) | Task 2(모델)·6(컴포넌트)·7(분기) |
| 칸 = 기존 노드 카드 재사용, 탭/끌기/선택/칩/빠른입력 유지, 칸 제목 「N번 경기」 | Task 4(흐름 변형 — 칩·빠른입력·드래그 코드 공유)·6 |
| 옛 데이터 k=floor(팀수/2) 최소 1, 규칙 문서화·테스트 | ADR 3항 + Task 2 테스트 4건 |
| 순위표(순위·팀·경기·승·무·패·득실·승점), 1024+ sticky 옆 열, 선택 시 패널이 열 차지 + 토글 | Task 3·5·8 (토글 = 「순위표 보기」, ADR 4) |
| 768~1023 격자 전폭 + 「순위표」 시트, 패널은 PR-6 시트 | Task 8 (패널 시트는 기존 `!sidePanel` 경로 그대로) |
| <768 PR-6 목록 검증·필요 시 조정, 순위 접이식(선택) | Task 9 — 검증 결과 라운드 탭이 `조별` 하나로 뭉쳐 조정 |
| 툴바: 「경기 연결」 리그만 숨김, 템플릿·무작위·추가·공개 유지 | Task 7 |
| 토너먼트·조별+결선 캔버스·정규 리그 보드·공개 페이지 불변 | 분기가 `format==='league'` 한 곳, `mode` 삭제는 리그 전용 코드만(Task 7 grep 0건), 기존 테스트 회귀 실행 |
| 테스트: 모델(번호·레거시·조·빈 조·취소)/순위 매핑/format 분기/1023·1024/연결 숨김/콜백 | Task 2·3·6·7·8·4 |
| changeset(minor)·Ambiguity Log·alpha 캡처 | Task 10·11 |
| 서버 변경 없음 — `standings` 로 충분한지 검증 | 상단 Architecture + Task 1 Step 2 (`teamName` 서버 부착 확인, 투영은 OFFICIAL/VOID 서비스) |
| 기술부채 | 죽은 `mode:'league'`/`leagueColumns` 삭제(Task 7). 이연 없음 |

**실측으로 정정된 지점:** (1) 원 요청은 노드 제목을 「N번 경기」 로 하라 했으나 같은 제목이 조마다 겹치면 스크린리더가 구분 못 하므로 보이는 제목만 짧게 하고 접근 이름은 전체 제목(`fullTitle`)을 쓴다. (2) 결정 페이지 목업의 「쉬는 조」 는 행에 따라 거짓이 될 수 있어(수동 추가 경기 행) 「경기 없음」 으로 통일했다. (3) 순위 `rank` 는 서버 `position` 정렬 후 순번이며 서버 `position` 이 0 으로 동률인 경우 입력 순서를 유지한다.

**남은 위험:** 조 3개 이상은 1440 에서 격자 컨테이너 내부 가로 스크롤(문서화됨). alpha 옛 4팀 대회에 조 편성이 없으면 순위표가 의도적으로 비어 캡처 판정 일부가 실패로 읽힐 수 있어 Step 5 에서 눈으로 확정한다.

