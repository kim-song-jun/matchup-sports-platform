# 어드민 대진 그림 편집기 — 리그 방식 대회의 「경기 추가」(조 + 라운드 선택)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리그 방식 대회(`format === 'league'`, 라운드 × 조 격자)에서 툴바 「경기 추가」가 막다른 길(「경기를 추가할 수 있는 단계가 없어요…」)이 아니라 **조 + 라운드(기존 `N라운드` 또는 「새 라운드 (N+1라운드)」)** 를 고르는 대화상자를 열고, 고른 칸에 대진 미정 경기를 만든 뒤 「…경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.」를 알린다. 팀은 격자 카드를 눌러 직접 지정 경로(`PATCH /admin/fixtures/:id`)로 넣는다. 토너먼트·조별+결선 대화상자는 그대로다.

**Architecture:** 서버는 바꾸지 않는다 — `POST /admin/tournaments/:id/fixtures` 가 이미 조 소속 경기의 임의 `round` 문자열을 받는다. 순수 헬퍼(`lib/bracket-league-add-fixture.ts`: 조·라운드 선택지와 새 경기의 `round` 결정)가 로직을 갖고, 새 폼 컴포넌트(`bracket-league-add-fixture-form.tsx`)가 `BracketFixtureToolsDialog` 의 add 분기에서 `format === 'league'` 일 때만 그려진다. 새 경기에 팀을 넣는 경로(칸 패널 select·탭·드래그·모바일 선택창)는 **바꾸지 않는다**(아래 조사 4).

**Tech Stack:** Next.js 16 + React 19 + TanStack Query 5 + Vitest + Testing Library + MSW(`apps/v1_web`). API·DB 변경 없음.

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md`(S7 웹 캔버스, Ambiguity Log) · 선행 `docs/superpowers/plans/2026-10-09-admin-bracket-canvas-pr7-league-grid.md`(리그 격자) · 사용자 결정 2026-10-10 B(최종, 재질문 금지).

## 결정 기록 (ADR)

**Context.** 리그 방식 대회는 대진이 있어도(격자가 그려져도) 「경기 추가」 대화상자가 결선 단계 조(`knockoutRoundLabel(phase) !== null`)만 나열해서(`bracket-fixture-tools-dialog.tsx:34-37`, `lib/bracket-fixture-tools.ts:6-8`) 리그 조(`phase === 'group'`)는 하나도 안 나오고 빈 안내만 뜬다. 운영자가 빠진 경기를 하나 더 넣을 길이 없다.

**Decision (사용자 B).** 대화상자가 조 + 라운드를 고르게 한다. 라운드 = 이 대회에 이미 있는 `league_r{n}` 중 하나 또는 새 라운드 N+1(「새 라운드 (N라운드)」). 만든 경기가 순위에 바로 잡히는 것은 사용자가 알고 받아들였다. 토너먼트·조별+결선은 지금 동작 그대로, 모바일(<768)은 구조 편집 버튼을 계속 숨긴다(D8).

**사용자 결정 위에 더한 한 가지 — 확정된 예외로 명시한다 (재질문 아님, PR 본문·완료 보고에 그대로 적는다).** 옛 대진(라운드 번호가 하나도 없는 대회)에서는 라운드 선택을 숨기고 그 조의 옛 `round` 값을 이어 쓴다. 결정 B 는 「조 + 라운드 선택」인데, 이 경우만 라운드를 고를 수 없고 `league_r{n}` 이 아닌 옛 값이 전송되며 토스트에 라운드 이름이 없다(「B조 경기를 추가했어요…」). 이유: 격자 모델의 `numbered` 는 **대회 전체**에서 `league_r` 가 하나라도 있으면 켜져(`bracket-league-grid-model.ts:60`) 옛 경기가 조별 끊김 행에서 빠져 `o:조별 리그` 한 행으로 뭉치고 안내(`legacyChunking`)가 사라진다 — 되돌릴 수 없는 시각 회귀다(조사 1-⑤).
- **대안 (a) 를 채택하지 않은 이유**: 옛 경기를 번호 행과 섞어 끊김 행으로 유지하려면 모델이 「옛 리그 경기」와 「수동 추가 경기(`final` 등)」를 구분해야 하고, 「번호가 하나라도 있으면 끊기를 쓰지 않는다」를 고정한 PR7 의 기존 테스트(`bracket-league-grid-model.test.ts` 마지막 케이스)와 계약을 바꿔야 한다. 이미 머지된 격자 계약의 변경이라 이 PR 범위를 넘는다.
- **영향 범위**: 번호 있는 리그(템플릿·생성기로 만든 모든 대회)는 결정 B 그대로다. 영향은 번호 경기가 한 건도 없는 옛 대회뿐이다. alpha 에 그런 대회가 몇 개인지는 **검증하지 않았다**(Task 4 Step 4 가 읽기로 먼저 확인한다).

**Consequences.** 장점: 막다른 길이 사라지고, 새 라운드/빈 칸/기존 라운드 어디든 격자 한 칸에 정확히 떨어지며, 팀이 없는 빈 경기는 순위를 바꾸지 않는다. 단점: (a) 옛 대진은 「라운드 N 에 넣기」가 불가능하다(마지막 경기 뒤에 붙음). (b) 새 경기에 다른 조 팀을 넣으면 서버가 그 조에 조용히 추가 편성한다 — 생성기가 만든 기존 경기에도 이미 있는 공백이고 이 PR 은 건드리지 않는다(조사 4, Open Questions 1). (c) 만든 경기에 팀을 넣고 결과가 확정되면 순위가 바뀌므로 공개된 대진이면 즉시 보인다(사용자 수용). 되돌림: 폼 컴포넌트와 add 분기의 `format === 'league'` 조건 하나를 지우면 이전 동작.

## 조사 (코드 근거)

**1. 새 경기가 격자 어디에 떨어지나** — `lib/bracket-league-grid-model.ts`
- 행은 `league_r(\d+)` 의 **숫자**(`:10-14`)로 정렬하고 라벨은 `${n}라운드`(`:78`). 열은 `sortLeagueGroups`(`sortOrder` → 이름 → id, `:20`)의 조 순이며, 경기가 없는 조도 열로 남는다(`:44-49`, 테스트 「경기가 없는 조도 열로 남고」).
- `numbered = fixtures.some(league_r)`(`:60`)는 **대회 전체**에서 하나라도 번호가 있으면 true 다. true 면 번호 없는 경기는 `o:<round>` 행(정렬 `Infinity`, 번호 행 뒤)으로 가고(`:79`), false 면 조마다 `k = max(1, floor(팀수/2))` 경기씩 `c:<행>` 행으로 끊는다(`:70-76`).
- 따라서 착지 규칙: ① 번호 모드에서 `league_r{n}` 경기는 `r:n` 행·그 조 열 칸 맨 뒤(경기 번호 순). 새 경기 번호가 `max+1` 이라 칸의 마지막에 붙는다. ② `n` 이 처음이면 새 행이 번호 행들 끝에 생기고 다른 열은 「경기 없음」. ③ **빈 조**(`groupTeams` 0 · 경기 0)는 열은 있고 칸이 비어 있어 어느 기존 행에든 그대로 들어간다. ④ **혼합 데이터**(번호 있음 + 수동 추가 `final` 등)에서는 새 `league_r` 행이 `final` 행 앞에 온다(테스트 「번호 행 뒤에 그 이름으로 붙는다」가 이미 보장). ⑤ **옛 대진(번호 0개)에 `league_r{n}` 을 넣으면** `numbered` 가 켜져 그 대회의 옛 경기 전부가 `o:조별 리그` 한 행으로 합쳐지고 안내(`legacyChunking`)가 사라진다 — 되돌릴 수 없는 시각 회귀라 이 경우만 옛 `round` 값을 이어 쓴다(새 경기는 `fixtureNumber` 최대값이라 그 조 목록의 맨 뒤 → 마지막 끊김 행 또는 새 끊김 행에 떨어진다).

**2. 「리그 조」란** — 서버 `assertLeagueGroupShape`(`apps/v1_api/src/tournaments/tournament-bracket.service.ts:138-161`)가 리그 대회의 조를 `phase === 'group'` 으로만 허용한다(생성기도 `league_r{n}` 만 만든다, `league-fixture-generator.service.ts:282`). 대화상자는 `phase === 'group'` 조만 `sortLeagueGroups` 순서로 나열한다(결선 조는 리그에 없지만 방어적으로 거른다). 조가 0개(결선 조뿐이거나 조 없이 `조 미정` 경기만 있는 대진 포함)면 「조별 리그 조가 없어 경기를 추가할 수 없어요. 조 설정을 확인하거나 대진을 템플릿으로 다시 만들어 주세요.」 안내 + 버튼 비활성 — 템플릿을 먼저 만들라는 옛 문구는 대진이 이미 있는 이 화면과 모순이라 쓰지 않는다.

**3. 라운드 선택지** — 격자 행과 같은 **대회 전체** 라운드를 쓴다(조별로 자르지 않음): B조에 10라운드가 없어도 격자엔 10라운드 행이 있고 B조 칸이 비어 있으니 거기에 넣을 수 있어야 한다. 선택지 = 대회에 있는 서로 다른 `league_r` 번호(오름차순, 취소 경기 포함 — 취소 경기도 격자에 남는다) + 「새 라운드 (`N+1`라운드)」(`N` = 최댓값, 없으면 1). 라벨은 격자와 같은 함수 하나(`leagueRoundLabel`, 이 계획이 모델에서 내보낸다)를 쓴다. **기본 선택 = 가장 큰 기존 라운드**(가장 흔한 용도는 진행 중 라운드에 경기 하나 더 넣기이고, 실수로 빈 새 라운드를 만들지 않는다); 기존 라운드가 없으면 「새 라운드 (1라운드)」.

**4. 팀 지정 경로 — 변경 없음** — 새 경기는 `homeSlotId/awaySlotId` 가 없어 `classifyFixtureSide → 'direct'` 라 칸 패널 select(`bracket-node-panel.tsx`)·탭/드래그(`bracket-canvas-workspace.tsx` `handleAssignDirect`)가 `PATCH /admin/fixtures/:id`(`useV1UpdateFixture`)로 간다(#1725). 사용자 결정 B 는 이 기존 경로를 그대로 쓰는 것이라 **이 계획은 그 경로를 바꾸지 않는다.** 참고로 서버는 팀이 이 대회의 확정 신청인지와 홈≠어웨이만 보고 조 소속은 보지 않으며, `ensureGroupPhaseTeamsInTx`(`tournament-bracket-tx.ts:85-120`)는 `phase === 'group'` 조 경기에 들어간 팀이 그 조 편성에 없으면 다른 조 편성 여부와 무관하게 추가 편성한다. 이 공백은 생성기로 만든 경기에도 이미 있고, 막으려면 서버 + 데스크톱 + 모바일을 한 변경으로 같이 고쳐야 반쪽 가드가 되지 않는다 → Open Questions 1 의 후속 결정으로 둔다.

**5. `nextFixtureNumber` 유일성** — `nextFixtureNumber(bracket.fixtures)`(`lib/bracket-fixture-tools.ts:10`)는 대회 전체 최댓값 + 1 이라, 서버 멱등 키 `tournament-fixture:{대회}:{round}:{fixtureNumber}:{leg}`(`tournament-bracket.service.ts:500`)와 같은 좌표 조회(`:556`)에 이미 있는 경기와 절대 겹치지 않는다. 겹치는 경우는 다른 운영자가 동시에 같은 번호를 쓸 때뿐이고, 같은 `round`면 서버가 내용이 같을 때만 기존 경기를 돌려주고 다르면 409 `COMMAND_IDEMPOTENCY_PAYLOAD_REUSE` 로 거절한다 → 에러 토스트(`describeBracketCanvasError`)로 충분하다. 더블클릭은 버튼 비활성만으로 막히지 않는다 — TanStack `isPending` 은 클릭 핸들러가 반환된 뒤에야 true 라 같은 틱의 두 번째 클릭도 `mutate` 에 닿는다(`isPending` 가드만 둔 구현은 이 테스트에서 요청 2건을 보낸다). `useRef` 동기 잠금을 `mutate` 직전에 걸고 `onSettled` 에서 푼다(Task 2 Step 4-c).

**6. 캐시** — `useV1CreateFixture` 는 성공 시 `v1Keys.adminTournamentBracket(tournamentId)` 를 무효화한다(`hooks/use-v1-api.ts:5019-5021`). 격자·순위표·트레이가 모두 이 한 쿼리(`useV1AdminBracket`)의 `groups/fixtures/standings` 에서 오므로 추가 키가 필요 없다. 팀을 넣는 `useV1UpdateFixture` 는 같은 키 + `v1Keys.tournament` 를 무효화한다(`:5046-5047`; 서버가 조 편성·순위 행을 갱신해도 한 번에 반영).

**7. 읽기 전용(support)** — 툴바 블록 전체가 `{canWrite ? (…) : null}`(`bracket-canvas-workspace.tsx:247`) 안에 있어 「경기 추가」 버튼 자체가 없다. 서버도 `getMutationAdmin` 이 막는다(`tournament-bracket.service.ts:437`). 모바일(<768)은 `BracketCanvasWorkspace` 가 아니라 모바일 화면을 쓰고 거기엔 대화상자 진입점이 없다(D8 유지).

## Global Constraints

- 작업 위치: 이 worktree(`.claude/worktrees/bracket-league-add`, `feat/bracket-league-add-fixture`, origin/dev 기반). 메인 트리·로컬 `dev` 금지. `node_modules` 는 심링크된 것을 쓰고 디렉터리 pathspec 으로 `git add` 하지 않는다.
- 커밋: `git commit -m "..." -- <명시한 파일들>` + 직후 `git show --stat HEAD`. 메시지는 한국어 conventional(`feat:`/`test:`/`refactor:`), 본문 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `git add -A`·`git stash`·브랜치 전환 금지.
- 테스트: `cd apps/v1_web && ./node_modules/.bin/vitest run <파일>`. 타입: `./node_modules/.bin/tsc --noEmit`, 패턴: `node scripts/v1-pattern-check.mjs`. **로컬 next 서버 금지**, `prisma generate` 금지. API 변경이 없어 API 테스트는 돌리지 않는다.
- UI 규칙: 토큰만(`var(--…)`, `tm-text-*`, `text-[Npx]` 금지) · 터치 44px(`minHeight: 44`) · `<label htmlFor>` + `useId()` · 해요체 · 에러는 `describeBracketCanvasError` · `transition-all`·`React.forwardRef` 금지 · 컴포넌트는 `components/v1-ui/Button` 재사용.
- 테스트 품질: 요청 본문은 MSW 로 잡아 계약을 단언한다(훅 mock 의 호출 인자만으로 증명하지 않는다). 필터링 테스트는 양쪽 대조군(남는 것/빠지는 것)을 함께 둔다. 기존 한국어 주석 파일에는 한국어 주석, 주석은 추가 줄의 1/3 이하.
- v1_web 변경이라 `.changeset/*.md`(patch)가 필요하다 — 마지막 코드 Task 에 포함.

## Review Focus

1. **옛(번호 없는) 대진 + 혼합 데이터**: 옛 대진에서 `league_r` 가 새어 들어가 격자가 뭉치지 않는가, 혼합 데이터에서 새 경기가 `final` 같은 수동 행 앞의 번호 행에 떨어지는가.
2. **빈 조·새 라운드 칸**: 경기 0개인 조에 기존/새 라운드로 넣어도 행·열이 맞게 생기고 다른 열은 「경기 없음」인가. 선택지가 `league_r10` 을 `league_r2` 앞에 두지 않는가(숫자 정렬).
3. **더블클릭·진행 중**: 같은 틱의 두 클릭에도 요청이 정확히 1건인가(동기 잠금), 실패 시 대화상자가 열려 있고 서버 코드에 맞는 에러 토스트가 나오며 잠금이 풀려 재시도할 수 있는가.
4. **팀 지정 경로 불변**: 칸 패널·탭·드래그·모바일 선택창의 코드가 이 PR 에서 하나도 안 바뀌었는가(`git diff` 에 `bracket-node-panel.tsx`·`handleAssignDirect`·`bracket-canvas-mobile-sheet.tsx` 없음). 다른 조 팀 차단은 의도적으로 없다(Open Questions 1).
5. **회귀**: knockout / group_knockout 의 「경기 추가」·「경기 연결」 대화상자와 토스트가 한 글자도 안 바뀌었는가(결선 「경기 추가」가 공통 생성 함수·동기 잠금을 지나는 것만 달라진다), 읽기 전용에 버튼이 없는가. 옛 대진 예외가 ADR·PR 본문에 명시돼 있는가.

## File Structure

| 파일 | 역할 | 구분 |
|---|---|---|
| `apps/v1_web/src/lib/bracket-league-grid-model.ts` | `leagueRoundNumber`·`leagueRoundLabel` 내보내기(동작 불변) | 수정 |
| `apps/v1_web/src/lib/bracket-league-add-fixture.ts` | 조·라운드 선택지, 새 경기 `round` 결정(순수) | 신규 |
| `apps/v1_web/src/lib/bracket-league-add-fixture.test.ts` | 위 헬퍼 + 격자 착지 테스트 | 신규 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-league-add-fixture-form.tsx` | 조 + 라운드 선택 폼 | 신규 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.tsx` | `format` prop, add 분기, 생성 공통화 | 수정 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.test.tsx` | `format` prop 추가 + group_knockout 회귀 | 수정 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.league.test.tsx` | 리그 폼(MSW) | 신규 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx` | `format` 전달 한 줄 | 수정 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx` | 전달값·읽기 전용 테스트 | 수정 |
| `.changeset/admin-bracket-league-add-fixture.md` | patch | 신규 |
| `.github/tasks/20261057-admin-bracket-canvas.md` | Ambiguity Log 에 결정 B·옛 대진 예외 기록(docs 전용) | 수정 |

## Task 1 — 조·라운드 선택 헬퍼 + 격자 착지 증명

**Files:**
- Modify: `apps/v1_web/src/lib/bracket-league-grid-model.ts`
- Create: `apps/v1_web/src/lib/bracket-league-add-fixture.ts`
- Test: `apps/v1_web/src/lib/bracket-league-add-fixture.test.ts`

**Interfaces (정확한 이름):**
```ts
// bracket-league-grid-model.ts (기존 roundNumber 이름만 바꿔 내보냄, 라벨 두 곳을 함수 하나로)
export const leagueRoundNumber: (round: string) => number | null;
export const leagueRoundLabel: (n: number) => string; // `${n}라운드`

// bracket-league-add-fixture.ts
export type LeagueRoundChoice = { value: string; label: string; round: string; name: string };
export type LeagueRoundPlan = { choices: LeagueRoundChoice[]; defaultChoice: LeagueRoundChoice };
export type LeagueRoundResolution = { round: string; roundName: string | null };
export function leagueAddableGroups(groups: readonly V1AdminBracketGroup[]): V1AdminBracketGroup[];
export function isLegacyLeagueBracket(fixtures: readonly V1AdminBracketFixture[]): boolean;
export function leagueRoundPlan(fixtures: readonly V1AdminBracketFixture[]): LeagueRoundPlan;
export function resolveLeagueRound(input: {
  fixtures: readonly V1AdminBracketFixture[];
  groupId: string;
  choice: LeagueRoundChoice; // leagueRoundPlan(...).choices 의 한 원소 — 문자열 조회·기본값 되돌림 없음
}): LeagueRoundResolution;
```
`value` 는 `r{n}` / `new`, `round` 는 서버로 보낼 `league_r{n}`, `label` 은 select 표시(`새 라운드 (4라운드)`), `name` 은 토스트용(`4라운드`).

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `bracket-league-add-fixture.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import { buildLeagueGrid } from './bracket-league-grid-model';
import { nextFixtureNumber } from './bracket-fixture-tools';
import {
  isLegacyLeagueBracket,
  leagueAddableGroups,
  leagueRoundPlan,
  resolveLeagueRound,
} from './bracket-league-add-fixture';

const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0 });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
const fx = (id: string, groupId: string | null, n: number, round: string) =>
  makeFixture({ id, groupId, fixtureNumber: n, round });
const ids = (list: { id: string }[] | undefined) => (list ?? []).map((f) => f.id);

/** 대화상자가 하는 일 그대로 — 결정한 round 와 다음 경기 번호로 경기를 하나 붙인다. */
function addVia(fixtures: ReturnType<typeof fx>[], groupId: string, choiceValue: string) {
  const choice = leagueRoundPlan(fixtures).choices.find((candidate) => candidate.value === choiceValue);
  if (choice === undefined) throw new Error(`선택지에 ${choiceValue} 가 없어요`);
  const { round } = resolveLeagueRound({ fixtures, groupId, choice });
  return { round, fixtures: [...fixtures, fx('new', groupId, nextFixtureNumber(fixtures), round)] };
}

describe('leagueAddableGroups', () => {
  it('phase 가 group 인 조만 sortOrder 순으로 남기고 결선 조는 뺀다', () => {
    const semi = makeGroup({ id: 'gS', name: '4강', phase: 'semi', sortOrder: 0 });
    const late = makeGroup({ id: 'gC', name: 'C조', phase: 'group', sortOrder: 5 });
    expect(leagueAddableGroups([late, semi, gB, gA]).map((g) => g.id)).toEqual(['gA', 'gB', 'gC']);
  });
});

describe('leagueRoundPlan', () => {
  it('번호는 숫자 순서로(league_r10 이 league_r2 뒤) 나열하고 끝에 새 라운드를 붙이며, 기본은 마지막 기존 라운드다', () => {
    const plan = leagueRoundPlan([fx('a10', 'gA', 9, 'league_r10'), fx('a1', 'gA', 1, 'league_r1'), fx('b2', 'gB', 2, 'league_r2')]);
    expect(plan.choices.map((c) => [c.value, c.label, c.round])).toEqual([
      ['r1', '1라운드', 'league_r1'],
      ['r2', '2라운드', 'league_r2'],
      ['r10', '10라운드', 'league_r10'],
      ['new', '새 라운드 (11라운드)', 'league_r11'],
    ]);
    expect(plan.defaultChoice.value).toBe('r10');
    expect(plan.choices[plan.choices.length - 1].name).toBe('11라운드');
  });

  it('league_r 가 아닌 수동 추가 round 는 선택지에 넣지 않는다', () => {
    const plan = leagueRoundPlan([fx('a1', 'gA', 1, 'league_r1'), fx('m', 'gA', 2, 'final')]);
    expect(plan.choices.map((c) => c.value)).toEqual(['r1', 'new']);
  });

  it('경기가 하나도 없으면 「새 라운드 (1라운드)」 하나이고 그것이 기본이다', () => {
    const plan = leagueRoundPlan([]);
    expect(plan.choices.map((c) => c.label)).toEqual(['새 라운드 (1라운드)']);
    expect(plan.defaultChoice.round).toBe('league_r1');
  });
});

describe('resolveLeagueRound — 격자 착지', () => {
  const base = [
    fx('a1', 'gA', 1, 'league_r1'),
    fx('b1', 'gB', 2, 'league_r1'),
    fx('a2', 'gA', 3, 'league_r2'),
  ];

  it('빈 조(경기 0)에 기존 라운드로 넣으면 행은 늘지 않고 그 조 칸에만 들어간다', () => {
    const empty = makeGroup({ id: 'gE', name: 'E조', phase: 'group', sortOrder: 2 });
    const { round, fixtures } = addVia(base, 'gE', 'r2');
    expect(round).toBe('league_r2');
    const grid = buildLeagueGrid({ groups: [gA, gB, empty], fixtures });
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드']);
    expect(ids(grid.rows[1].cells.gE)).toEqual(['new']);
    // 대조: 같은 행의 다른 조 칸은 그대로
    expect(ids(grid.rows[1].cells.gA)).toEqual(['a2']);
    expect(ids(grid.rows[1].cells.gB)).toEqual([]);
  });

  it('새 라운드를 고르면 번호 행이 하나 늘고 고른 조 칸에만 경기가 있다', () => {
    const { round, fixtures } = addVia(base, 'gB', 'new');
    expect(round).toBe('league_r3');
    const grid = buildLeagueGrid({ groups: [gA, gB], fixtures });
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드', '3라운드']);
    expect(ids(grid.rows[2].cells.gB)).toEqual(['new']);
    expect(ids(grid.rows[2].cells.gA)).toEqual([]);
  });

  it('기존 라운드 칸에 넣으면 그 칸의 맨 뒤(경기 번호 순)에 쌓인다', () => {
    const { fixtures } = addVia(base, 'gA', 'r1');
    expect(ids(buildLeagueGrid({ groups: [gA, gB], fixtures }).rows[0].cells.gA)).toEqual(['a1', 'new']);
  });

  it('혼합 데이터(번호 + 수동 final)에서 새 라운드 행은 final 행 앞에 온다', () => {
    const mixed = [...base, fx('m', 'gA', 9, 'final')];
    const { fixtures } = addVia(mixed, 'gA', 'new');
    const grid = buildLeagueGrid({ groups: [gA, gB], fixtures });
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드', '3라운드', '결승']);
    expect(grid.legacyChunking).toBe(false);
  });
});

describe('resolveLeagueRound — 옛(번호 없는) 대진', () => {
  const team = (id: string, n: number) => ({ id: `gt-${id}`, groupId: 'gA', registrationId: id, teamName: id, sortOrder: n, createdAt: '' });
  const four = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0, groupTeams: ['r1', 'r2', 'r3', 'r4'].map((id, i) => team(id, i)) });
  const six = [1, 2, 3, 4, 5, 6].map((n) => fx(`f${n}`, 'gA', n, '조별 리그'));

  it('옛 대진이면 옛 round 값을 이어 쓰고 roundName 은 없다', () => {
    expect(isLegacyLeagueBracket(six)).toBe(true);
    const choice = leagueRoundPlan(six).defaultChoice; // 옛 대진에는 번호가 없어 「새 라운드 (1라운드)」 하나뿐이다
    expect(resolveLeagueRound({ fixtures: six, groupId: 'gA', choice })).toEqual({ round: '조별 리그', roundName: null });
  });

  it('옛 round 값을 이어 쓰면 끊김 모드가 유지되고 새 경기는 그 조의 마지막 행에 떨어진다', () => {
    const { fixtures } = addVia(six, 'gA', 'new');
    const grid = buildLeagueGrid({ groups: [four], fixtures });
    expect(grid.legacyChunking).toBe(true);
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드', '3라운드', '4라운드']);
    expect(ids(grid.rows[3].cells.gA)).toEqual(['new']);
  });

  it('근거: 옛 대진에 league_r 를 섞으면 끊김이 꺼지고 옛 경기가 한 행으로 뭉친다 — 그래서 이어 쓴다', () => {
    const grid = buildLeagueGrid({ groups: [four], fixtures: [...six, fx('new', 'gA', 7, 'league_r1')] });
    expect(grid.legacyChunking).toBe(false);
    expect(grid.rows).toHaveLength(2);
    expect(ids(grid.rows[1].cells.gA)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
  });

  it('경기가 없는 조에 넣을 때는 대회에서 가장 최근 경기의 round 를 쓴다', () => {
    const b = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
    expect(resolveLeagueRound({ fixtures: six, groupId: b.id, choice: leagueRoundPlan(six).defaultChoice }).round).toBe('조별 리그');
  });

  it('번호 있는 경기가 하나라도 있으면 옛 대진이 아니고, 경기가 0개여도 아니다', () => {
    expect(isLegacyLeagueBracket([...six, fx('n', 'gA', 7, 'league_r1')])).toBe(false);
    expect(isLegacyLeagueBracket([])).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-league-add-fixture.test.ts`
Expected: FAIL — `Failed to resolve import "./bracket-league-add-fixture"`.

- [ ] **Step 3: 모델에서 번호 파서·라벨을 내보낸다** — `bracket-league-grid-model.ts`

`const roundNumber = (round: string): number | null => {` 를 아래로 바꾸고, 파일 안의 `roundNumber(` 호출 두 곳(`numbered` 계산, `const n = roundNumber(fixture.round)`)을 `leagueRoundNumber(` 로, 라벨 두 곳(`` `${row + 1}라운드` ``, `` `${n}라운드` ``)을 `leagueRoundLabel(row + 1)` / `leagueRoundLabel(n)` 으로 바꾼다.

```ts
export const leagueRoundNumber = (round: string): number | null => {
  const hit = LEAGUE_ROUND.exec(round.trim());
  return hit === null ? null : Number(hit[1]);
};

export const leagueRoundLabel = (n: number): string => `${n}라운드`;
```
(함수 본문은 기존과 같다 — 이름과 `export` 만 바뀐다.)

- [ ] **Step 4: 헬퍼를 구현한다** — `bracket-league-add-fixture.ts`

```ts
import { leagueRoundLabel, leagueRoundNumber, sortLeagueGroups } from '@/lib/bracket-league-grid-model';
import type { V1AdminBracketFixture, V1AdminBracketGroup } from '@/types/api';

const NEW_LEAGUE_ROUND = 'new';

export type LeagueRoundChoice = { value: string; label: string; round: string; name: string };
export type LeagueRoundPlan = { choices: LeagueRoundChoice[]; defaultChoice: LeagueRoundChoice };
export type LeagueRoundResolution = { round: string; roundName: string | null };

/** 서버가 리그 대회 조를 phase 'group' 으로만 허용한다 — 방어적으로 한 번 더 거른다. */
export function leagueAddableGroups(groups: readonly V1AdminBracketGroup[]): V1AdminBracketGroup[] {
  return sortLeagueGroups(groups.filter((group) => group.phase === 'group'));
}

/**
 * 번호(league_r{n}) 경기가 하나도 없는 대진. 격자 모델은 대회 전체에 번호가 하나라도 생기면 옛 경기를
 * 조별 끊김 행에서 빼 한 행으로 뭉치므로, 이 경우 새 경기는 옛 round 값을 이어 써야 한다.
 */
export function isLegacyLeagueBracket(fixtures: readonly V1AdminBracketFixture[]): boolean {
  return fixtures.length > 0 && fixtures.every((fixture) => leagueRoundNumber(fixture.round) === null);
}

const choiceOf = (n: number, isNew: boolean): LeagueRoundChoice => ({
  value: isNew ? NEW_LEAGUE_ROUND : `r${n}`,
  label: isNew ? `새 라운드 (${leagueRoundLabel(n)})` : leagueRoundLabel(n),
  round: `league_r${n}`,
  name: leagueRoundLabel(n),
});

export function leagueRoundPlan(fixtures: readonly V1AdminBracketFixture[]): LeagueRoundPlan {
  const numbers = [...new Set(fixtures.flatMap((fixture) => {
    const n = leagueRoundNumber(fixture.round);
    return n === null ? [] : [n];
  }))].sort((a, b) => a - b);
  const latest = numbers.length === 0 ? 0 : numbers[numbers.length - 1];
  const created = choiceOf(latest + 1, true);
  const existing = numbers.map((n) => choiceOf(n, false));
  return { choices: [...existing, created], defaultChoice: existing.length === 0 ? created : existing[existing.length - 1] };
}

const newest = (list: readonly V1AdminBracketFixture[]) =>
  list.reduce<V1AdminBracketFixture | null>((best, fixture) => (best === null || fixture.fixtureNumber > best.fixtureNumber ? fixture : best), null);

export function resolveLeagueRound(input: {
  fixtures: readonly V1AdminBracketFixture[];
  groupId: string;
  choice: LeagueRoundChoice;
}): LeagueRoundResolution {
  const { fixtures, groupId, choice } = input;
  if (isLegacyLeagueBracket(fixtures)) {
    const reuse = newest(fixtures.filter((fixture) => fixture.groupId === groupId)) ?? newest(fixtures);
    if (reuse !== null) return { round: reuse.round, roundName: null };
  }
  return { round: choice.round, roundName: choice.name };
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-league-add-fixture.test.ts src/lib/bracket-league-grid-model.test.ts && ./node_modules/.bin/tsc --noEmit`
Expected: 두 파일 모두 PASS(기존 모델 테스트는 이름 변경에 영향 없음), tsc 0 error. (이 시점 tsc 는 `leagueRoundNumber` 이름 변경이 모델 안 호출부와 함께 끝나 있어야 통과한다.)

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat: 리그 경기 추가용 조·라운드 선택 헬퍼

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/v1_web/src/lib/bracket-league-grid-model.ts apps/v1_web/src/lib/bracket-league-add-fixture.ts apps/v1_web/src/lib/bracket-league-add-fixture.test.ts
git show --stat HEAD
```
(새 파일은 먼저 `git add <두 새 파일>` 후 pathspec 커밋.)

## Task 2 — 리그 경기 추가 폼 + 대화상자 분기

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-league-add-fixture-form.tsx`
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.tsx`
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.test.tsx`
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.league.test.tsx`

**Interfaces:**
```ts
// bracket-fixture-tools-dialog.tsx — props 에 추가(필수)
format: V1TournamentFormat | undefined;

// bracket-league-add-fixture-form.tsx
export type LeagueAddSubmit = { groupId: string; groupName: string; round: string; roundName: string | null };
export type BracketLeagueAddFixtureFormProps = {
  bracket: V1AdminTournamentBracket;
  pending: boolean;
  onSubmit: (input: LeagueAddSubmit) => void;
};
export function BracketLeagueAddFixtureForm(props: BracketLeagueAddFixtureFormProps): JSX.Element;
```
`format` 이 `'league'` 일 때만 add 분기가 폼을 그린다. `knockout`·`group_knockout`·`undefined` 는 지금 코드 그대로(회귀).

- [ ] **Step 1: 실패하는 테스트 — 리그 폼** (`bracket-fixture-tools-dialog.league.test.tsx`, 실제 `useV1CreateFixture` + MSW)

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { v1Keys } from '@/lib/query-keys';
import { makeBracket, makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import type { V1AdminTournamentBracket } from '@/types/api';
import { BracketFixtureToolsDialog } from './bracket-fixture-tools-dialog';

const bodies: unknown[] = [];
let failNext = false;
const server = setupServer(
  http.post('*/api/v1/admin/tournaments/:id/fixtures', async ({ request }) => {
    bodies.push(await request.json());
    await delay(30);
    if (failNext) {
      return HttpResponse.json({ status: 'error', statusCode: 409, code: 'LEAGUE_ON_HOLD', message: 'on hold' }, { status: 409 });
    }
    return HttpResponse.json({ status: 'success', data: { id: 'new-1' }, timestamp: '2026-10-10T00:00:00Z' });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  bodies.length = 0;
  failNext = false;
});
afterAll(() => server.close());

const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0 });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 }); // 경기 0개인 빈 조
const gSemi = makeGroup({ id: 'gS', name: '4강', phase: 'semi', sortOrder: 2 });
const numbered = makeBracket({
  groups: [gA, gB, gSemi],
  fixtures: [
    makeFixture({ id: 'a1', groupId: 'gA', fixtureNumber: 1, round: 'league_r1' }),
    makeFixture({ id: 'a2', groupId: 'gA', fixtureNumber: 2, round: 'league_r2' }),
    makeFixture({ id: 'a10', groupId: 'gA', fixtureNumber: 9, round: 'league_r10' }),
  ],
});
const NO_GROUP_NOTICE = '조별 리그 조가 없어 경기를 추가할 수 없어요. 조 설정을 확인하거나 대진을 템플릿으로 다시 만들어 주세요.';

function renderLeagueDialog(bracket: V1AdminTournamentBracket = numbered) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const props = { open: true, mode: 'add' as const, format: 'league' as const, tournamentId: 't-1', bracket, onClose: vi.fn(), showToast: vi.fn() };
  render(
    <QueryClientProvider client={client}>
      <BracketFixtureToolsDialog {...props} />
    </QueryClientProvider>,
  );
  return { props, client };
}

const optionTexts = (select: HTMLElement) => within(select).getAllByRole('option').map((option) => option.textContent);

describe('BracketFixtureToolsDialog — 리그 경기 추가', () => {
  it('리그 조만 sortOrder 순으로, 라운드는 숫자 순서 + 새 라운드로 보여 주고 기본은 마지막 기존 라운드다', () => {
    renderLeagueDialog();
    expect(optionTexts(screen.getByLabelText('조'))).toEqual(['A조', 'B조']);
    const round = screen.getByLabelText('라운드') as HTMLSelectElement;
    expect(optionTexts(round)).toEqual(['1라운드', '2라운드', '10라운드', '새 라운드 (11라운드)']);
    expect(round.selectedOptions[0].textContent).toBe('10라운드');
    expect(screen.queryByText('경기를 추가할 수 있는 단계가 없어요. 템플릿으로 대진을 먼저 만들어 주세요.')).not.toBeInTheDocument();
  });

  it('새 라운드를 고르면 groupId·league_r{N+1}·다음 경기 번호를 보내고, 알린 뒤 닫고, 대진 캐시를 무효화한다', async () => {
    const { props, client } = renderLeagueDialog();
    const key = v1Keys.adminTournamentBracket('t-1');
    client.setQueryData(key, numbered);
    fireEvent.change(screen.getByLabelText('라운드'), { target: { value: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ groupId: 'gA', round: 'league_r11', fixtureNumber: 10 }]);
    expect(props.showToast).toHaveBeenCalledWith('11라운드 A조 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.', 'success');
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('빈 조에 기존 라운드로 넣는다', async () => {
    const { props } = renderLeagueDialog();
    fireEvent.change(screen.getByLabelText('조'), { target: { value: 'gB' } });
    fireEvent.change(screen.getByLabelText('라운드'), { target: { value: 'r2' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ groupId: 'gB', round: 'league_r2', fixtureNumber: 10 }]);
    expect(props.showToast).toHaveBeenCalledWith('2라운드 B조 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.', 'success');
  });

  it('템플릿으로 만든 리그(조 `리그` 하나, 자리 연결 경기)에도 기존·새 라운드로 추가되고 토스트에 조 이름이 들어간다', async () => {
    const league = makeGroup({ id: 'gL', name: '리그', phase: 'group', sortOrder: 0 });
    const slotted = makeBracket({
      groups: [league],
      fixtures: [1, 2, 3].map((n) =>
        makeFixture({ id: `s${n}`, groupId: 'gL', fixtureNumber: n, round: `league_r${n}`, homeSlotId: `h${n}`, awaySlotId: `a${n}` }),
      ),
    });
    const { props } = renderLeagueDialog(slotted);
    expect(optionTexts(screen.getByLabelText('조'))).toEqual(['리그']);
    fireEvent.change(screen.getByLabelText('라운드'), { target: { value: 'r1' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(bodies).toEqual([{ groupId: 'gL', round: 'league_r1', fixtureNumber: 4 }]);
    expect(props.showToast).toHaveBeenCalledWith('1라운드 리그 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.', 'success');
  });

  it('연속으로 두 번 눌러도 요청은 한 건이다', async () => {
    const { props } = renderLeagueDialog();
    const button = screen.getByRole('button', { name: '경기 추가' });
    fireEvent.click(button);
    fireEvent.click(button); // isPending 은 핸들러가 끝난 뒤에야 true 라 두 번째 클릭도 핸들러까지 온다 — 동기 잠금이 막아야 한다
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(1);
  });

  it('실패하면 서버 코드에 맞는 에러 토스트를 보이고 닫지 않으며 다시 누를 수 있다', async () => {
    failNext = true;
    const { props } = renderLeagueDialog();
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith('보류 중인 리그라 대진을 바꿀 수 없어요.', 'error'));
    expect(props.onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: '경기 추가' })).toBeEnabled());
    failNext = false;
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(bodies).toHaveLength(2); // 실패 뒤 잠금이 풀려 재시도 요청이 나간다
  });

  it('번호가 없는 옛 대진은 라운드 선택 없이 옛 round 값을 이어 쓴다', async () => {
    const legacy = makeBracket({
      groups: [gA, gB],
      fixtures: [1, 2, 3].map((n) => makeFixture({ id: `f${n}`, groupId: 'gA', fixtureNumber: n, round: '조별 리그' })),
    });
    const { props } = renderLeagueDialog(legacy);
    expect(screen.queryByLabelText('라운드')).not.toBeInTheDocument();
    expect(screen.getByText('라운드 정보가 없는 대진이라 이 조의 마지막 경기 뒤에 붙어요.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('조'), { target: { value: 'gB' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ groupId: 'gB', round: '조별 리그', fixtureNumber: 4 }]);
    expect(props.showToast).toHaveBeenCalledWith('B조 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.', 'success');
  });

  it.each([
    ['결선 단계 조뿐인 대진', makeBracket({ groups: [gSemi], fixtures: [] })],
    ['조 없이 경기만 있는 대진(조 미정 열)', makeBracket({ groups: [], fixtures: [makeFixture({ id: 'u1', groupId: null, fixtureNumber: 1, round: 'league_r1' })] })],
  ])('리그 조가 하나도 없으면(%s) 안내하고 버튼을 막는다', (_name, bracket) => {
    renderLeagueDialog(bracket);
    expect(screen.getByText(NO_GROUP_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '경기 추가' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.league.test.tsx`
Expected: 옛 대화상자는 `format` 을 무시하고 결선 조 목록을 그리므로 `getByLabelText('조')` 를 쓰는 테스트들이 FAIL 이다. **실제로 실패한 테스트 이름을 기록하고, 처음부터 통과하는 테스트가 있으면 회귀 가드(Red-first 가 아님)로 구분해 적는다** — 구현 전에는 모두 FAIL 이라고 가정하지 않는다.

- [ ] **Step 3: 폼 컴포넌트를 쓴다** — `bracket-league-add-fixture-form.tsx`

```tsx
'use client';

import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import {
  isLegacyLeagueBracket,
  leagueAddableGroups,
  leagueRoundPlan,
  resolveLeagueRound,
} from '@/lib/bracket-league-add-fixture';
import type { V1AdminTournamentBracket } from '@/types/api';

export type LeagueAddSubmit = { groupId: string; groupName: string; round: string; roundName: string | null };

export type BracketLeagueAddFixtureFormProps = {
  bracket: V1AdminTournamentBracket;
  pending: boolean;
  onSubmit: (input: LeagueAddSubmit) => void;
};

const SELECT_CLASS = 'tm-input';

export function BracketLeagueAddFixtureForm({ bracket, pending, onSubmit }: BracketLeagueAddFixtureFormProps) {
  const idPrefix = useId();
  const groups = useMemo(() => leagueAddableGroups(bracket.groups), [bracket.groups]);
  const plan = useMemo(() => leagueRoundPlan(bracket.fixtures), [bracket.fixtures]);
  const legacy = isLegacyLeagueBracket(bracket.fixtures);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [roundValue, setRoundValue] = useState(plan.defaultChoice.value);

  const group = groups.find((candidate) => candidate.id === groupId) ?? groups[0] ?? null;
  // 대진이 새로고침되어 고른 라운드가 사라졌으면 화면에서 기본 선택으로 되돌려 보여 준다.
  const choice = plan.choices.find((candidate) => candidate.value === roundValue) ?? plan.defaultChoice;

  const handleSubmit = () => {
    if (group === null || pending) return;
    const resolved = resolveLeagueRound({ fixtures: bracket.fixtures, groupId: group.id, choice });
    onSubmit({ groupId: group.id, groupName: group.name, round: resolved.round, roundName: resolved.roundName });
  };

  return (
    <div className="flex flex-col gap-4 px-5 py-5">
      {group === null ? (
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          조별 리그 조가 없어 경기를 추가할 수 없어요. 조 설정을 확인하거나 대진을 템플릿으로 다시 만들어 주세요.
        </p>
      ) : (
        <>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            고른 조와 라운드에 대진 미정 경기를 하나 만들어요. 팀은 만든 뒤 칸에서 넣고, 결과가 확정되면 순위표에 바로 반영돼요.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-group`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>조</label>
            <select id={`${idPrefix}-group`} className={SELECT_CLASS} style={{ minHeight: 44 }} value={group.id} onChange={(event) => setGroupId(event.target.value)}>
              {groups.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
          </div>
          {legacy ? (
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>라운드 정보가 없는 대진이라 이 조의 마지막 경기 뒤에 붙어요.</p>
          ) : (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-round`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>라운드</label>
              <select id={`${idPrefix}-round`} className={SELECT_CLASS} style={{ minHeight: 44 }} value={choice.value} onChange={(event) => setRoundValue(event.target.value)}>
                {plan.choices.map((candidate) => (
                  <option key={candidate.value} value={candidate.value}>{candidate.label}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      <Button variant="primary" size="md" disabled={group === null || pending} loading={pending} onClick={handleSubmit}>
        경기 추가
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: 대화상자를 고친다** — `bracket-fixture-tools-dialog.tsx`

(a) import 추가: `import { useRef } from 'react'`(기존 react import 에 합친다), `import type { V1AdminBracketFixture, V1AdminTournamentBracket, V1TournamentFormat } from '@/types/api';` 와
`import { BracketLeagueAddFixtureForm, type LeagueAddSubmit } from './bracket-league-add-fixture-form';`

(b) props 타입에 `format: V1TournamentFormat | undefined;` 추가, 함수 인자 구조분해에 `format` 추가.

(c) `handleAdd` 를 생성 공통 함수 + 두 호출자로 바꾼다. 성공 토스트 문구는 `${라벨} 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.` 하나로 맞춘다 — 기존 결선 문구와 글자 하나까지 같다. 중복 제출은 `isPending` 이 아니라 **동기 잠금**으로 막는다: TanStack `isPending` 은 클릭 핸들러가 반환된 뒤에야 true 라 같은 틱의 두 번째 클릭이 `mutate` 까지 온다. 버튼 비활성(`pending`)은 화면 표시용으로 남긴다.

```tsx
  const submitting = useRef(false);

  const createFixtureAt = (target: { groupId: string; round: string; toastLabel: string }) => {
    if (submitting.current) return;
    submitting.current = true;
    createFixture.mutate(
      { groupId: target.groupId, round: target.round, fixtureNumber: nextFixtureNumber(bracket.fixtures) },
      {
        onSuccess: () => {
          showToast(`${target.toastLabel} 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.`, 'success');
          onClose();
        },
        onError: (error) => showToast(describeBracketCanvasError(error, '경기를 추가하지 못했어요.'), 'error'),
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };

  const handleAdd = () => {
    if (group === null) return;
    const round = knockoutRoundLabel(group.phase);
    if (round === null) return;
    createFixtureAt({ groupId: group.id, round, toastLabel: round });
  };

  const handleAddLeague = (input: LeagueAddSubmit) =>
    createFixtureAt({
      groupId: input.groupId,
      round: input.round,
      toastLabel: [input.roundName, input.groupName].filter((part): part is string => part !== null).join(' '),
    });
```
(결선 「경기 추가」도 같은 공통 함수를 지나 같은 잠금을 받는다 — 화면에서 보이는 동작·문구는 그대로이고 중복 제출만 막힌다.)

(d) add 분기의 바깥을 가른다. 기존 `mode === 'add' ? (<div …>…</div>) : (<link div>)` 에서 add 분기를 아래처럼 바꾼다:

```tsx
        {mode === 'add' ? (
          format === 'league' ? (
            <BracketLeagueAddFixtureForm bracket={bracket} pending={createFixture.isPending} onSubmit={handleAddLeague} />
          ) : (
            <div className="flex flex-col gap-4 px-5 py-5">
              {/* 기존 결선 단계 마크업 그대로 */}
            </div>
          )
        ) : (
```
기존 add 마크업(`addableGroups.length === 0 ? … : …` 과 「경기 추가」 `Button`)은 한 글자도 바꾸지 않고 안쪽으로 옮기기만 한다.

(e) 기존 `bracket-fixture-tools-dialog.test.tsx`(`it` 8건)의 `renderDialog` props 와 인라인 `render(<BracketFixtureToolsDialog …/>)` 4곳에 `format="knockout"` 을 넣는다(필수 prop). 그리고 회귀 테스트를 `describe('… — 경기 추가')` 안에 추가한다:

```tsx
  it('group_knockout 은 리그 폼이 아니라 결선 단계 목록 그대로이고, 조별 단계는 나열하지 않는다', () => {
    render(
      <BracketFixtureToolsDialog
        open
        mode="add"
        format="group_knockout"
        tournamentId="t-1"
        bracket={makeBracket({
          groups: [makeGroup({ id: 'g-a', name: 'A조', phase: 'group', sortOrder: 0 }), makeGroup({ id: 'g-sf', name: '4강', phase: 'semi', sortOrder: 1 })],
          fixtures: [makeFixture({ id: 'a1', groupId: 'g-a', fixtureNumber: 1, round: 'league_r1' })],
        })}
        onClose={vi.fn()}
        showToast={vi.fn()}
      />,
    );
    const select = screen.getByLabelText('추가할 단계') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['4강']);
    expect(screen.queryByLabelText('라운드')).not.toBeInTheDocument();
  });
```

(f) `bracket-canvas-workspace.tsx` 의 `<BracketFixtureToolsDialog …>` 에 `format={format}` 한 줄을 더한다(필수 prop 이라 이 변경과 같은 커밋이어야 tsc 가 깨지지 않는다). 워크스페이스 테스트의 대화상자 mock 은 이미 `props.mode` 만 읽으므로 이 Task 에서는 수정이 없다 — 전달값 단언은 Task 3.

- [ ] **Step 5: 통과 확인**

Run: `cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.league.test.tsx src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.test.tsx src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx && ./node_modules/.bin/tsc --noEmit`
Expected: league 9건(it.each 2건 포함) + 기존 8건 + 회귀 1건 + 워크스페이스 기존 테스트 전부 PASS, tsc 0 error.

- [ ] **Step 6: 커밋**

```bash
git add apps/v1_web/src/components/admin/bracket-canvas/bracket-league-add-fixture-form.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.league.test.tsx
git commit -m "feat: 리그 방식 대회 경기 추가 대화상자(조·라운드 선택)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-league-add-fixture-form.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.test.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.league.test.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx
git show --stat HEAD
```

## Task 3 — 워크스페이스 전달 확인 + changeset + 스펙 기록

**Files:**
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx`
- Create: `.changeset/admin-bracket-league-add-fixture.md`
- Modify(docs 전용): `.github/tasks/20261057-admin-bracket-canvas.md`

`format={format}` 전달은 Task 2 Step 4(f)에서 이미 넣었다. 팀 지정 경로(칸 패널 select·탭·드래그·`handleAssignDirect`)는 **이 변경에서 한 글자도 바꾸지 않는다**(Open Questions 1).

- [ ] **Step 1: 실패하는 테스트** — `bracket-canvas-workspace.test.tsx`

(a) 파일 위쪽 대화상자 mock 이 `format` 도 노출하게 확장한다(현재 `props.mode` 만 읽는 mock):
```tsx
vi.mock('./bracket-fixture-tools-dialog', () => ({
  BracketFixtureToolsDialog: (props: { open: boolean; mode: string; format?: string }) =>
    props.open ? <div data-testid="tools-dialog" data-mode={props.mode} data-format={props.format ?? ''} /> : null,
}));
```

(b) 파일 끝에 describe 를 추가한다(`leagueProps`·`setBracket`·`makeBracket`·`makeFixture`·`makeGroup` 은 이 파일에 이미 있는 헬퍼다 — 없으면 같은 파일의 기존 리그 테스트가 쓰는 것을 따른다):
```tsx
describe('BracketCanvasWorkspace — 리그 「경기 추가」', () => {
  const leagueBracket = makeBracket({
    groups: [makeGroup({ id: 'lgA', name: 'A조', phase: 'group', sortOrder: 0 })],
    fixtures: [makeFixture({ id: 'l1', groupId: 'lgA', fixtureNumber: 1, round: 'league_r1' })],
  });

  it('「경기 추가」 대화상자가 대회 방식(format)을 받는다 — 리그는 league, 토너먼트는 knockout', () => {
    setBracket(leagueBracket);
    const { unmount } = render(<BracketCanvasWorkspace {...leagueProps('league')} />);
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    expect(screen.getByTestId('tools-dialog')).toHaveAttribute('data-format', 'league');
    unmount();

    render(<BracketCanvasWorkspace {...leagueProps('knockout')} />);
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    expect(screen.getByTestId('tools-dialog')).toHaveAttribute('data-format', 'knockout');
  });

  it('읽기 전용 리그 화면에는 「경기 추가」 버튼이 없다', () => {
    setBracket(leagueBracket);
    render(<BracketCanvasWorkspace {...leagueProps('league')} canWrite={false} />);
    expect(screen.queryByRole('button', { name: '경기 추가' })).not.toBeInTheDocument();
  });
});
```
(`leagueProps` 가 `canWrite: true` 를 고정으로 주므로 뒤에 오는 `canWrite={false}` 가 덮어쓴다.)

- [ ] **Step 2: 확인** — Run: `cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx`
Expected: Task 2 에서 `format` 전달을 이미 넣었으므로 PASS(이 테스트는 그 전달이 빠지는 회귀를 잡는 가드다 — Red-first 가 아니다. 의심되면 `format={format}` 한 줄을 잠시 지워 FAIL 을 확인한 뒤 되돌린다).

- [ ] **Step 3: changeset + 영향 범위 검증** — `.changeset/admin-bracket-league-add-fixture.md`

```md
---
"v1_web": patch
---

리그 방식 대회의 대진 그림에서 「경기 추가」로 조와 라운드를 골라 경기를 만들 수 있어요.
```

Run:
```bash
cd apps/v1_web && ./node_modules/.bin/tsc --noEmit && node scripts/v1-pattern-check.mjs && ./node_modules/.bin/vitest run \
  src/lib/bracket-league-add-fixture.test.ts src/lib/bracket-league-grid-model.test.ts \
  src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.test.tsx src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.league.test.tsx \
  src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx src/components/admin/bracket-canvas/bracket-league-grid.test.tsx
```
Expected: tsc 0, 패턴 검사 통과, 6개 파일 전부 PASS. 풀스위트는 돌리지 않는다.

- [ ] **Step 4: 코드 커밋**

```bash
git add .changeset/admin-bracket-league-add-fixture.md
git commit -m "test: 리그 경기 추가 대화상자 방식 전달 확인과 changeset

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx .changeset/admin-bracket-league-add-fixture.md
git show --stat HEAD
```
(`git show --stat` 에 위 2개 외 파일이 있으면 즉시 `git reset --soft HEAD~1` 이 아니라 사용자에게 보고한다 — 공유 트리 규칙.)

- [ ] **Step 5: 스펙 Ambiguity Log 기록 (docs 전용, changeset 불필요)** — `.github/tasks/20261057-admin-bracket-canvas.md` 의 Ambiguity Log 표 마지막 줄 뒤에 한 행을 덧붙인다:

```md
| 2026-10-10 | 사용자 | 리그 방식 대회의 「경기 추가」 | **B** — 대화상자에서 **조 + 라운드**(기존 `league_r{n}` 또는 새 라운드 N+1)를 골라 `POST /admin/tournaments/:id/fixtures`(`{groupId, round: 'league_r{n}', fixtureNumber}`)로 대진 미정 경기를 만든다. 팀은 격자 카드를 눌러 기존 직접 지정 경로(`PATCH /admin/fixtures/:id`)로 넣고, 만든 경기가 순위에 바로 잡히는 것은 수용. 토너먼트·조별+결선 대화상자·모바일 구조 편집 숨김(D8) 불변, 서버 무변경. **예외(구현 중 확정)**: 라운드 번호가 하나도 없는 옛 대진은 격자 모델이 `league_r` 한 건에 대회 전체를 번호 모드로 바꿔 옛 경기가 한 행으로 뭉치므로, 라운드 선택 없이 그 조의 옛 `round` 값을 이어 쓴다. 다른 조 팀 교차 편성 차단은 이 결정에 없어 후속 후보로만 남김 |
```
```bash
git commit -m "docs: 리그 경기 추가 결정(B)을 스펙 Ambiguity Log 에 기록

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -- .github/tasks/20261057-admin-bracket-canvas.md
git show --stat HEAD
```

## Task 4 — PR · dev 머지 · alpha 실측(코드 변경 없음)

**Files:** 없음(검증·보고 단계). 스크립트가 필요하면 `scripts/` 안에 두고 커밋하지 않는다.

- [ ] **Step 1: 머지 전 게이트** — Task 3 Step 3 의 명령을 한 번 더(커밋본 기준) 돌린다. `git diff --stat origin/dev...HEAD` 에 `apps/v1_api` 가 없는지 확인한다(서버 무변경 계약).
- [ ] **Step 2: PR + 리뷰 루프** — `git fetch origin dev` 후 `gh pr create --base dev --repo kim-song-jun/matchup-sports-platform`, 제목·본문 한국어. 본문에 ① 사용자 결정 B ② **옛(번호 없는) 대진 예외**(ADR 「사용자 결정 위에 더한 한 가지」)와 그 영향 ③ 다른 조 팀 차단은 범위 밖이라는 한 줄(Open Questions 1) ④ 「갤러리는 머지 후 alpha 에서 찍어 이 PR 에 게시하는 이유(로컬 next 서버 금지)」. `gh pr create` 가 출력한 URL 에서 번호를 파싱한다(추측 금지).
  - Copilot 리뷰: `gh pr edit <N> --repo kim-song-jun/matchup-sports-platform --add-reviewer copilot-pull-request-reviewer` → 폴링 → finding 은 적대적 검증으로 real 만 수정 → 스레드 답변·resolve → `generated no new comments` 까지 반복. "encountered an error" 리뷰는 리뷰로 세지 않는다.
  - 머지 직전 재확인: 리뷰 **본문**과 `codex-direct-review` 코멘트의 `[P1]`/`[P2]`/HOLD 표식이 답 없이 남지 않았는지 다시 읽는다(스레드 게이트를 통과한다).
  - 머지 직전 `gh pr view <N> --repo kim-song-jun/matchup-sports-platform --json baseRefName` 이 `dev` 인지 확인하고, 머지는 `--merge`(squash 금지, 규칙 10-b). dev 머지는 사전 승인, **main 승격은 사용자만**.
- [ ] **Step 3: 머지 뒤 동기화·배포 확인** — 메인 트리에서 `git fetch origin dev -q && git merge --ff-only origin/dev`. alpha 는 `gh run list --workflow deploy-alpha.yml --branch dev --limit 1` 완료 + `curl -fsSI https://alpha.teameet.co.kr/landing | grep -i x-teameet-commit` 이 내 머지 커밋 이후일 때만 측정한다(배포 창 502 오진 방지).
- [ ] **Step 4: alpha E2E (ego-browser 스킬, 격리 task space)** — 자격증명은 비공개 메모리의 alpha 계정(저장소 금지). **대상 대회 선정 전에 alpha 의 리그 대회 목록을 읽기로만 확인한다**(어느 대회가 번호 있음/옛 대진인지 미검증 상태다). 기본은 **새 리그 대회를 직접 만들어 그 대회에서만 쓴다**(시드가 건드리지 않고, 만든 경기는 시작 전이면 보관 삭제 가능). 기존 대회에 쓰는 단계와 alpha 데이터 변경은 사용자 승인 후에만(`alpha-data-writes-need-user-approval`; Open Questions 2 에서 B 가 이미 정했으면 그에 따른다). 판정은 화면이 하고 API 는 보조다:
  1. **번호 있는 리그 대회(어드민)**: 툴바 「경기 추가」 → 조 목록이 리그 조뿐, 라운드 목록이 숫자 순 + 「새 라운드 (N라운드)」이고 기본은 마지막 라운드. 「새 라운드」로 추가 → 토스트 「N라운드 X조 경기를 추가했어요. 칸을 눌러 팀을 넣어 주세요.」 + 격자에 새 행이 생기고 그 조 칸에만 카드, 다른 열은 「경기 없음」, 순위표 숫자 불변.
  2. **템플릿 리그(조 `리그` 하나)**: 조 select 옵션이 `리그` 하나, 기존 라운드와 새 라운드 양쪽에 추가해 토스트가 「N라운드 리그 경기를 추가했어요…」인지.
  3. 새 카드를 눌러 패널 → 홈/어웨이에 팀을 넣어 칸에 팀명이 보이는지(기존 직접 지정 경로, `PATCH /admin/fixtures/:id`가 나가는지 `read_network_requests`).
  4. **빈 조·기존 라운드**: 경기 없는 조가 있으면 그 조로 기존 라운드에 추가해 같은 행의 그 칸에 들어가는지.
  5. **번호 없는 옛 리그 대회가 실제로 있으면**(읽기 확인): 라운드 선택이 없고 안내 문구가 보이며 추가 뒤에도 「라운드 정보가 없어 경기 번호 순서로 나눴어요.」 안내와 끊김 행이 유지된다. 없으면 이 시나리오는 단위 테스트로만 근거를 남기고 보고서에 「미실측」으로 적는다.
  6. **회귀**: 토너먼트·조별+결선 대회의 「경기 추가」·「경기 연결」 대화상자가 이전과 같다.
  7. **권한·모바일**: 읽기 전용(support) 계정엔 「경기 추가」 버튼이 없고, 390 폭에는 구조 편집 버튼(경기 추가·템플릿 등)이 없다.
  - 증거: 1440 / 768 / 390 before·after 스크린샷, 대화상자 옵션 텍스트, POST 본문(`{groupId, round: 'league_r{n}', fixtureNumber}`), console 에러 0. 3폭 갤러리는 raw URL 200 확인 후 PR 코멘트에 게시. 완료 보고에는 스크린샷을 사용자 메시지에 inline 으로 싣는다.
- [ ] **Step 5: 정리** — QA 로 만든 시작 전 경기는 칸 패널 「경기 삭제」로 보관 삭제할 수 있다(시작·결과가 있는 경기는 409) — 지울지는 사용자에게 묻는다. ego 는 별도 호출에서 `await task.finish({ keep: [] })` 로 닫고, 띄운 프로세스가 없는지 확인한다.

## Open Questions

사용자 결정(B)이 이미 정한 것은 다시 묻지 않는다. 아래는 이 PR 의 **범위 밖**이라 코드에 넣지 않은 후속 후보와 확인 필요 사항이다.

1. **(후속 결정 후보, 이 PR 에서 구현하지 않음) 다른 조 팀 교차 편성 차단.** 서버 `ensureGroupPhaseTeamsInTx`(`tournament-bracket-tx.ts:85-120`)는 `phase === 'group'` 조의 경기에 들어간 팀이 그 조 편성에 없으면 다른 조 편성 여부를 보지 않고 추가 편성한다 — 생성기가 만든 기존 경기에도 이미 있는 공백이다. 사용자는 팀 지정을 기존 직접 지정 경로로 하기로 했고 서버 무변경을 우선했으므로 이 PR 은 건드리지 않는다. 막으려면 서버 409(`TEAM_IN_OTHER_GROUP`) + 데스크톱 칸 패널·탭/드래그·모바일 `DirectTeamPicker` 후보 필터를 **한 변경으로 같이** 해야 반쪽 가드가 되지 않고, 조별+결선 대회에도 영향이 가므로 사용자 확인 뒤 별도 작업으로 한다. 템플릿으로 만든 리그는 조가 `리그` 하나라 실효가 작다(spec `.github/tasks/20261057-admin-bracket-canvas.md` 132행). PR 본문과 완료 보고에 이 한 줄을 남긴다.
2. **(확인 필요) 「alpha E2E: B」의 구체 범위.** 이 계획을 고치는 시점의 작업 지시문에는 B 의 내용이 없다. Task 4 Step 4 는 「새 리그 대회를 직접 만들어 그 대회에서만 쓰기」를 기본으로 쓰고, 기존 alpha 대회(옛 리그 포함)는 읽기 전용으로만 쓴다. B 가 범위나 쓰기 승인을 이미 정하고 있으면 컨트롤러가 Step 4 의 승인 문구와 시나리오를 그에 맞춘다.
