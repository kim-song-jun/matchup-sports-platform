# 어드민 대진 그림 편집기 — PR-3 웹 캔버스(토너먼트) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 플랫폼 어드민이 대회 `대진 관리`에서 [그림 | 목록] 중 그림(기본)으로 템플릿 생성 → 자리에 팀 넣기(누르기·끌어 놓기·무작위) → 칸에서 점수 확정·고치기·무효까지 클릭만으로 처리하고, 공개 대진표는 빈 사이드에 자리 라벨을 보여 준다.

**Architecture:** 위치 계산은 순수 함수(`lib/bracket-canvas-layout.ts`)가 맡고, 캔버스는 그 결과를 절대 위치 칸 + SVG 연결선으로 그린다. 서버 호출은 `hooks/use-v1-bracket-canvas.ts` 한 파일에 모으고(템플릿·자리 배정·무작위·빠른 결과), 정정·무효·확정은 기존 `use-tournament-result-review` 훅을 그대로 쓴다. 선택·팀 고르기 상태는 `bracket-canvas-workspace.tsx` 가 들고 캔버스·트레이·패널은 props 로만 받는다.

**Tech Stack:** Next.js 16 App Router + React 19 + TanStack Query 5 + Tailwind v4 토큰 + Vitest + Testing Library (apps/v1_web). 서버 코드는 건드리지 않는다.

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md` (S5·S7·Test Scenarios 의 웹 항목) · 색인/공유 계약 `docs/superpowers/plans/2026-10-08-admin-bracket-canvas-index.md`

## 계약 이탈

없음. 계약의 이름·경로·시그니처를 그대로 쓴다. 계약이 열어 둔 부분만 이 PR 이 채운다.

- `buildCanvasLayout` 의 `mode: 'league'` 는 계약 시그니처에 있으므로 라운드별 열 배치(연결선 없음)까지만 구현한다. 자리 기반 리그 일정 보드는 PR-5b 가 확장한다.
- `V1TournamentFixture.homeSlotLabel/awaySlotLabel` 은 계약대로 필수(`string | null`)로 선언하고 모든 고정 데이터를 같은 변경에서 고친다.

## Global Constraints

색인의 Global Constraints 와 공유 계약이 전부 그대로 적용된다(커밋은 pathspec, `git stash`·`git add -A` 금지, 토큰만 사용, 44px 터치, 해요체, 주석 비율 1/3 이하, 로컬 next 서버로 화면 검증 금지). 이 PR 에만 해당하는 제약은 다음과 같다.

- 변경은 `apps/v1_web` 과 `.changeset/` 에만 한다. `apps/v1_api`·`docs/api/` 는 건드리지 않는다(서버 계약은 PR-1a/1b/2 가 만든다).
- `[id]` 같은 대괄호 경로는 git 이 글롭으로 읽을 수 있다. 대괄호 경로를 쓰는 모든 git 명령은 `GIT_LITERAL_PATHSPECS=1 git ...` 로 실행한다. 새 파일은 `git add <명시 경로>` 로 먼저 올린 뒤 `git commit -m "..." -- <같은 경로>` 로 커밋하고 직후 `git show --stat HEAD` 로 휩쓸린 파일이 없는지 본다.
- 이 저장소의 `v1-pattern-check.mjs` 가 막는 것: 합니다체, `text-[Npx]`/`text-sm` 류 글자 크기 하드코딩(`tm-text-*` 클래스나 `var(--font-size-*)` 사용), 4의 배수가 아닌 임의 간격(`p-[14px]`), px 반지름(`var(--radius-*)` 사용), 틴트 배경 위 `tm-on-tint` 누락. 각 컴포넌트 태스크의 마지막 검증에서 `node scripts/v1-pattern-check.mjs` 를 돌린다.
- 모든 vitest 명령은 `apps/v1_web` 안에서 `./node_modules/.bin/vitest run <경로>` 로, 타입 검사는 `./node_modules/.bin/tsc --noEmit -p tsconfig.json` 로 실행한다(저장소 루트에서 `--root` 로 돌리지 않는다).
- 화면 검증은 dev 머지 후 alpha 에서 ego-browser 로 한다(이 계획은 그 단계를 포함하지 않는다. 머지 후 PR 코멘트에 390/768/1440 갤러리를 게시).
- 칸 크기 상수: 폭 232, 머리 44, 줄 44×2, 꼬리 24 → 높이 156. 터치 영역 44px 를 지키기 위해 머리와 두 줄을 각각 44px 버튼으로 둔다.

## File Structure

### 새 파일

| 파일 | 책임 |
|---|---|
| `apps/v1_web/src/lib/bracket-canvas-layout.ts` | 순수 레이아웃: 열 구성·칸 y 위치·연결선 경로·`fixtureNodeState`·`isFixtureLocked`·`fixtureSideLabel` |
| `apps/v1_web/src/lib/bracket-canvas-layout.test.ts` | 위 함수의 계약 테스트(4팀·12팀·16팀 대진, 열 단계 순서, 리그 모드, 겹침 없음) |
| `apps/v1_web/src/lib/bracket-template-counts.ts` | 템플릿 입력 → 만들어질 그룹·자리·경기·연결 수(대화상자 미리보기, 240 상한) |
| `apps/v1_web/src/lib/bracket-template-counts.test.ts` | 스펙 Test Scenarios 의 개수 계약 |
| `apps/v1_web/src/lib/bracket-quick-score.ts` | 점수 입력 문자열 → 검증된 `{home,away,penalties?}`, 정정용 점수 병합, 정정 참가자 매핑 |
| `apps/v1_web/src/lib/bracket-quick-score.test.ts` | 검증·병합·매핑 테스트 |
| `apps/v1_web/src/lib/bracket-canvas-errors.ts` | 서버 에러 코드 → 해요체 안내(`describeBracketCanvasError`) |
| `apps/v1_web/src/lib/bracket-canvas-errors.test.ts` | 코드별 문구 테스트 |
| `apps/v1_web/src/lib/public-fixture-side-label.ts` | 공개 화면용 사이드 이름: 비공개 / 자리 라벨 / 미정 규칙 |
| `apps/v1_web/src/lib/public-fixture-side-label.test.ts` | 규칙 테스트 |
| `apps/v1_web/src/hooks/use-v1-bracket-canvas.ts` | 템플릿 적용·자리 배정·무작위 채우기·빠른 결과 훅 + 무효화 |
| `apps/v1_web/src/hooks/use-v1-bracket-canvas.test.tsx` | 요청 경로·본문·`Idempotency-Key`·무효화 키 테스트 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-dnd.ts` | 끌어 놓기 데이터 타입 상수(`REGISTRATION_DRAG_MIME`) |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.tsx` | 칸 하나: 머리(번호·상태 태그)·두 줄(자리/팀/점수)·꼬리("어드민 빠른 입력"·승부차기) |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.test.tsx` | 칸 표시·배정 동작 테스트 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx` | 열 머리 + 칸 + SVG 연결선 컨테이너 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.test.tsx` | 열 순서·연결선 개수·선택 전달 테스트 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-team-tray.tsx` | 확정 참가팀 목록(끌기·누르고 고르기) |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-team-tray.test.tsx` | 선택 토글·배정된 팀 비활성 테스트 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-quick-result-form.tsx` | 점수 입력 폼(결선 무승부일 때만 승부차기) |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-quick-result-form.test.tsx` | 승부차기 표시 조건·검증 메시지 테스트 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-result-actions.tsx` | 확정 / 점수 고치기(정정→확정) / 무효 + 필수 사유 모달 + 정정 화면 링크 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-result-actions.test.tsx` | 정정 두 단계 payload·무효·`NEXT_FIXTURE_CONFLICT` 안내 테스트 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-node-panel.tsx` | 칸 상세 패널: 자리 배정 선택·일정/장소·삭제·결과 구역 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-node-panel.test.tsx` | 배정·저장·삭제·결과 구역 분기 테스트 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.tsx` | 템플릿 대화상자(토너먼트 4/8/12/16+3·4위전, 리그 팀 수/회전) + 교체 확인 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.test.tsx` | 미리보기 수·교체 확인 흐름 테스트 |
| `apps/v1_web/src/lib/bracket-fixture-tools.ts` | 경기 추가용 라운드 이름·다음 번호, 진출 연결 후보(바로 앞 단계 예정 경기) |
| `apps/v1_web/src/lib/bracket-fixture-tools.test.ts` | 라운드 이름·번호·후보 규칙 테스트 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.tsx` | 경기 추가 / 진출 연결 대화상자(스펙 S7 툴바) |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.test.tsx` | 추가 payload·연결 payload·빈 상태 테스트 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx` | 툴바(템플릿·경기 추가·연결·무작위·공개 상태)·로딩/에러/빈 상태·선택 상태·세 구역 배치 |
| `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx` | 상태별 화면·읽기 전용·키보드 배정 테스트 |
| `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.test.tsx` | [그림 \| 목록] 전환·`?view=list` 테스트 |
| `.changeset/admin-bracket-canvas-ui.md` | 릴리스 노트 |

### 수정 파일

| 파일 | 변경 |
|---|---|
| `apps/v1_web/src/types/api.ts` | 슬롯·경기 game·템플릿·빠른 결과 타입, 공개 `homeSlotLabel/awaySlotLabel` |
| `apps/v1_web/src/hooks/use-v1-bracket-canvas.ts` | (Task 13b) `useV1SetBracketSources` 추가 |
| `apps/v1_web/src/lib/competition-status.ts` | (Task 7) `bracketNodeStateChip` — 칸 상태 칩 단일 정의 |
| `apps/v1_web/src/hooks/use-tournament-result-review.ts` | `resultReviewKeys` 를 export(캔버스 훅이 같은 키를 무효화) |
| `apps/v1_web/src/components/tournament-result-review/result-review-copy.ts` | `KNOWN_ERROR_MESSAGES` 를 export(캔버스 에러 문구가 같은 사전을 재사용) |
| `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx` | `SegmentedTabs` [그림 \| 목록], 기본 그림, `?view=list` |
| `apps/v1_web/src/components/tournaments/tournament-bracket.tsx` | 공개 대진표: `TBD` 대신 자리 라벨 |
| `apps/v1_web/src/components/public-game-records/types.ts` | `PublicScheduleEntry.homeSlotLabel/awaySlotLabel` |
| `apps/v1_web/src/components/public-game-records/schedule-content.tsx` | 공개 일정 탭 `sideLabel` 이 `publicFixtureSideLabel` 로 자리 라벨 우선 표시, 라벨이 있으면 "대진 확정 전" 으로 접지 않음 |
| `apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx` | 공개 `FixtureCard`: 자리 라벨 |
| 고정 데이터 약 14개 테스트 파일 | `V1AdminBracketFixture`/`V1AdminTournamentBracket`/`V1TournamentFixture` 새 필드 추가(Task 1 에 파일 목록) |
| 고정 데이터 테스트 파일 7개 | `PublicScheduleEntry` 새 필드 추가(Task 16 Files 에 파일 목록) |

---

### Task 1: 타입 추가와 고정 데이터 동기화

타입이 고정 데이터와 어긋나면 `tsc` 가 먼저 빨개진다. 이 태스크는 그 빨간 불(RED)을 확인하고 모든 고정 데이터를 같은 변경에서 고친다(색인 "Mock Data Discipline").

**Files:**
- Modify: `apps/v1_web/src/types/api.ts` (공개 `V1TournamentFixture` ~3750-3765, `V1AdminBracketFixture` 4133-4153, `V1AdminTournamentBracket` 4188-4192)
- Modify: `apps/v1_web/src/app/admin/tournaments/[id]/bracket-group-helpers.test.ts`, `tournament-statistics-tab.test.ts`, `tournament-detail-bracket-row-actions.test.tsx`, `bracket-tab.test.tsx`, `tournament-detail-bracket-publish.test.tsx`
- Modify: 공개 고정 데이터 `apps/v1_web/src/app/tournaments/[id]/{fixture-card-schedule,fixture-card-goals,tournament-public-qa,tournament-detail-page-client}.test.tsx`, `tournament-detail-client.test.ts`, `results/{group-stage-fixtures,results-page-client}.test.tsx`, `bracket/bracket-page-client.test.tsx`, `apps/v1_web/src/components/tournaments/{tournament-bracket.render.test.tsx,tournament-bracket.test.ts,tournament-progress-stepper.test.ts,tournament-standings-table.test.tsx}`

**Interfaces:**
- Produces(계약 그대로): `V1AdminBracketSlot`, `V1AdminBracketFixtureGame`, `V1AdminBracketFixture.homeSlotId/awaySlotId/game`, `V1AdminTournamentBracket.slots`, `V1TournamentFixture.homeSlotLabel/awaySlotLabel`, `BracketTemplateInput`
- Produces(훅이 쓰는 보조 타입): `V1AdminBracketRevisionSummary`, `V1ApplyBracketTemplatePayload`, `V1ApplyBracketTemplateResult`, `V1AssignSlotResult`, `V1RandomFillResult`, `V1QuickResultScore`, `V1QuickResultResult`

- [ ] **Step 1: 타입을 추가한다(고정 데이터는 아직 안 고침)**

`V1TournamentGroupPhase` 의 `'round16'`, `KNOCKOUT_PHASES`/`isKnockoutPhase`, `tournamentRoundLabel` 의 16강 라벨, `BRACKET_SOURCE_PHASES` 는 모두 PR-1c(Task 6·8) 소유다 — 이 PR 은 `types/api.ts` 의 이 유니온을 고치지 않는다. 같은 웨이브에서 병렬로 구현하더라도 **PR-1c 가 먼저 dev 에 머지된 뒤 이 PR 이 `origin/dev` 를 3-way merge 해 받는다**(Task 11 의 import 가 그 심볼에 의존). 머지 전 `grep -n "round16" apps/v1_web/src/types/api.ts` 와 `grep -n "BRACKET_SOURCE_PHASES" apps/v1_web/src/lib/tournament-bracket-rounds.ts` 로 둘 다 있는지 확인하고, 없으면 PR-1c 머지를 기다린다.

`apps/v1_web/src/types/api.ts` 에서 `V1AdminBracketFixture` 의 마지막 필드 `videos: V1TournamentFixtureVideo[];` 바로 아래(닫는 `};` 앞)에 세 줄을 넣는다.

```ts
  /** 이 사이드가 연결된 자리. 자리가 없는 경기(수동으로 만든 경기)는 null. */
  homeSlotId: string | null;
  awaySlotId: string | null;
  /** 경기(게임) 요약. 게임이 없는 옛 경기는 null. */
  game: V1AdminBracketFixtureGame | null;
```

같은 파일의 `V1AdminBracketStanding` 타입 정의 아래, `V1AdminTournamentBracket` 정의를 다음으로 교체하고 그 앞에 새 타입들을 둔다.

```ts
export type V1AdminBracketSlotKind = 'ENTRY' | 'BYE' | 'GROUP_RANK';

/** 팀이 들어갈 칸. 라벨("A조 1번", "부전승 1")은 서버가 계산해서 준다. */
export type V1AdminBracketSlot = {
  id: string;
  kind: V1AdminBracketSlotKind;
  groupId: string | null;
  sourceGroupId: string | null;
  position: number;
  label: string;
  registrationId: string | null;
  teamName: string | null;
};

export type V1AdminBracketRevisionSummary = {
  id: string;
  state: 'DRAFT' | 'SUBMITTED' | 'CHANGE_REQUESTED' | 'OFFICIAL' | 'VOID';
  score: { home: number; away: number; penalties?: { home: number; away: number } } | null;
  /** quick = 그림에서 점수만 넣어 확정, console = 라이브 콘솔, correction = 정정 */
  entryMethod: 'quick' | 'console' | 'correction';
};

export type V1AdminBracketFixtureGame = {
  id: string;
  state: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED' | 'CANCELLED';
  version: number;
  hasLiveRecords: boolean;
  latestRevision: V1AdminBracketRevisionSummary | null;
};

export type V1AdminTournamentBracket = {
  groups: V1AdminBracketGroup[];
  fixtures: V1AdminBracketFixture[];
  standings: V1AdminBracketStanding[];
  slots: V1AdminBracketSlot[];
};

/** 서버 `BracketTemplateInput` 과 같은 모양(knockout 16 의 서버 planner 확장은 PR-1c). group_knockout 은 PR-4 에서 화면이 열린다. */
export type BracketTemplateInput =
  | { kind: 'knockout'; size: 4 | 8 | 12 | 16; thirdPlace: boolean }
  | {
      kind: 'group_knockout';
      groupCount: number;
      teamsPerGroup: number;
      advancePerGroup: 1 | 2;
      legs: 1 | 2;
      thirdPlace: boolean;
    }
  | { kind: 'league'; teamCount: number; legs: 1 | 2 };

export type V1ApplyBracketTemplatePayload = BracketTemplateInput & { replaceExisting?: boolean };
export type V1ApplyBracketTemplateResult = { groups: number; slots: number; fixtures: number; edges: number };
export type V1AssignSlotResult = { slot: V1AdminBracketSlot; affectedTeamMatchIds: string[] };
export type V1RandomFillResult = { assignments: { slotId: string; registrationId: string }[] };

/** 빠른 결과·정정에 보내는 점수. 서버 `GameScoreDto` 와 같은 세 키만 쓴다. */
export type V1QuickResultScore = {
  home: number;
  away: number;
  penalties?: { home: number; away: number };
};
export type V1QuickResultResult = {
  gameId: string;
  revisionId: string;
  version: number;
  score: V1QuickResultScore;
};
```

공개 `V1TournamentFixture` 에는 `result: V1TournamentFixtureResult | null;` 줄 바로 위에 넣는다.

```ts
  /**
   * 팀이 아직 없고 자리가 있는 사이드의 라벨("A조 1위", "3번 자리"). 팀이 있거나 자리가 없으면 null.
   * `homeTeamName === 'TBD'` 일 때 연결선 설명("8강 1경기 승자")보다 먼저 보여 준다.
   */
  homeSlotLabel: string | null;
  awaySlotLabel: string | null;
```

- [ ] **Step 2: RED 확인 — 고정 데이터가 타입과 어긋난다**

Run (apps/v1_web): `./node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "error TS" | cut -d'(' -f1 | sort | uniq -c`
Expected: FAIL — `Property 'homeSlotId' is missing`, `Property 'slots' is missing`, `Property 'homeSlotLabel' is missing` 계열 오류가 아래 파일들에서 나온다(`bracket-group-helpers.test.ts`, `tournament-statistics-tab.test.ts`, `tournament-detail-bracket-publish.test.tsx`, 그리고 `V1TournamentFixture` 를 만드는 공개 테스트들).

- [ ] **Step 3: 어드민 고정 데이터를 고친다**

Run (apps/v1_web, 다섯 줄을 순서대로):

```bash
D='src/app/admin/tournaments/[id]'
perl -0pi -e 's/(    videos: \[\],\n)(    \.\.\.overrides,)/$1    homeSlotId: null,\n    awaySlotId: null,\n    game: null,\n$2/' "$D/bracket-group-helpers.test.ts"
perl -0pi -e 's/(    videos: \[\],\n)(    result: \{)/$1    homeSlotId: null,\n    awaySlotId: null,\n    game: null,\n$2/' "$D/tournament-statistics-tab.test.ts"
perl -0pi -e 's/result: null, videos: \[\], \.\.\.overrides,/result: null, videos: [], homeSlotId: null, awaySlotId: null, game: null, ...overrides,/' "$D/tournament-detail-bracket-row-actions.test.tsx"
perl -0pi -e 's/(    status: .scheduled.,\n    result: null,\n)/$1    homeSlotId: null,\n    awaySlotId: null,\n    game: null,\n/; s/(  standings: \[\],\n)(\} as unknown as V1AdminTournamentBracket;)/$1  slots: [],\n$2/' "$D/bracket-tab.test.tsx"
perl -0pi -e 's/\{ groups: \[\], fixtures: \[\], standings: \[\] \}/{ groups: [], fixtures: [], standings: [], slots: [] }/; s/(  fixtures: \[\],\n  standings: \[\],\n)(\} as unknown as V1AdminTournamentBracket;)/$1  slots: [],\n$2/' "$D/tournament-detail-bracket-publish.test.tsx"
```

Expected: 명령이 조용히 끝난다. `git diff --stat` 에 위 다섯 파일이 보인다.

- [ ] **Step 4: 공개 고정 데이터를 고친다**

Run (apps/v1_web):

```bash
for f in \
  'src/app/tournaments/[id]/fixture-card-schedule.test.tsx' \
  'src/app/tournaments/[id]/fixture-card-goals.test.tsx' \
  'src/app/tournaments/[id]/tournament-detail-page-client.test.tsx' \
  'src/app/tournaments/[id]/tournament-detail-client.test.ts' \
  'src/app/tournaments/[id]/results/group-stage-fixtures.test.tsx' \
  'src/app/tournaments/[id]/results/results-page-client.test.tsx' \
  'src/app/tournaments/[id]/bracket/bracket-page-client.test.tsx' \
  'src/components/tournaments/tournament-bracket.render.test.tsx' \
  'src/components/tournaments/tournament-bracket.test.ts' \
  'src/components/tournaments/tournament-progress-stepper.test.ts'; do
  perl -0pi -e 's/\n(\s*)awayTeamLogoUrl: null,\n/\n$1awayTeamLogoUrl: null,\n$1homeSlotLabel: null,\n$1awaySlotLabel: null,\n/g' "$f"
done
perl -0pi -e "s/(awayRegistrationId: 'registration-away',\n)/\$1          homeSlotLabel: null,\n          awaySlotLabel: null,\n/" 'src/app/tournaments/[id]/tournament-public-qa.test.tsx'
perl -0pi -e "s/awayTeamLogoUrl: null, status: 'completed'/awayTeamLogoUrl: null, homeSlotLabel: null, awaySlotLabel: null, status: 'completed'/" src/components/tournaments/tournament-standings-table.test.tsx
```

- [ ] **Step 5: GREEN 확인**

Run (apps/v1_web): `./node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: PASS(출력 없음). 아직 오류가 남으면 그 파일의 해당 객체에 같은 필드를 같은 방식으로 추가한다(오류 메시지가 파일·줄을 알려 준다). 다른 타입의 객체에 잘못 넣어 `Object literal may only specify known properties` 가 나면 그 파일의 추가분만 되돌린다.

Run (apps/v1_web): `./node_modules/.bin/vitest run 'src/app/admin/tournaments/[id]/bracket-tab.test.tsx' 'src/app/admin/tournaments/[id]/tournament-detail-bracket-publish.test.tsx' src/components/tournaments/tournament-bracket.render.test.tsx`
Expected: PASS(동작 변화 없음).

- [ ] **Step 6: Commit**

내가 고친 18개 파일(타입 1 + 어드민 고정 데이터 5 + 공개 고정 데이터 12)만 명시 경로로 커밋한다. 대괄호 경로가 글롭으로 풀리지 않도록 `GIT_LITERAL_PATHSPECS=1` 을 붙인다.

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
TASK1_FILES=(
  'apps/v1_web/src/types/api.ts' \
  'apps/v1_web/src/app/admin/tournaments/[id]/bracket-group-helpers.test.ts' \
  'apps/v1_web/src/app/admin/tournaments/[id]/tournament-statistics-tab.test.ts' \
  'apps/v1_web/src/app/admin/tournaments/[id]/tournament-detail-bracket-row-actions.test.tsx' \
  'apps/v1_web/src/app/admin/tournaments/[id]/bracket-tab.test.tsx' \
  'apps/v1_web/src/app/admin/tournaments/[id]/tournament-detail-bracket-publish.test.tsx' \
  'apps/v1_web/src/app/tournaments/[id]/fixture-card-schedule.test.tsx' \
  'apps/v1_web/src/app/tournaments/[id]/fixture-card-goals.test.tsx' \
  'apps/v1_web/src/app/tournaments/[id]/tournament-detail-page-client.test.tsx' \
  'apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.test.ts' \
  'apps/v1_web/src/app/tournaments/[id]/results/group-stage-fixtures.test.tsx' \
  'apps/v1_web/src/app/tournaments/[id]/results/results-page-client.test.tsx' \
  'apps/v1_web/src/app/tournaments/[id]/bracket/bracket-page-client.test.tsx' \
  'apps/v1_web/src/components/tournaments/tournament-bracket.render.test.tsx' \
  'apps/v1_web/src/components/tournaments/tournament-bracket.test.ts' \
  'apps/v1_web/src/components/tournaments/tournament-progress-stepper.test.ts' \
  'apps/v1_web/src/app/tournaments/[id]/tournament-public-qa.test.tsx' \
  'apps/v1_web/src/components/tournaments/tournament-standings-table.test.tsx'
)
git diff --name-only -- "${TASK1_FILES[@]}" | wc -l
GIT_LITERAL_PATHSPECS=1 git add -- "${TASK1_FILES[@]}"
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 대진 슬롯·game 요약·템플릿 타입과 고정 데이터 동기화" -- "${TASK1_FILES[@]}"
git show --stat HEAD | tail -1
```

Expected: 첫 줄 `18`(18개 파일이 모두 바뀌었다는 뜻 — 다르면 안 바뀐 파일을 Step 3·4 의 perl 패턴으로 다시 확인하고, 바뀔 이유가 없는 파일이면 배열과 위 Files 목록에서 함께 뺀다). 마지막 줄 `18 files changed`. 목록 밖 파일이 stat 에 보이면 안 된다.

### Task 2: 서버 에러 코드 → 해요체 안내

그림 편집기 전용 코드(`SLOT_*`·`BRACKET_*`·`QUICK_RESULT_*`)와 기존 결과 화면 코드(`NEXT_FIXTURE_CONFLICT`·`PROJECTION_PREVIEW_MISMATCH` …)를 한 함수로 안내한다. 색인 Review Focus 3번(다음 경기가 이미 시작된 뒤 정정·무효)의 문구가 여기서 정해진다.

**Files:**
- Modify: `apps/v1_web/src/components/tournament-result-review/result-review-copy.ts:11` (`const KNOWN_ERROR_MESSAGES` → `export const`)
- Create: `apps/v1_web/src/lib/bracket-canvas-errors.ts`
- Test: `apps/v1_web/src/lib/bracket-canvas-errors.test.ts`

**Interfaces:**
- Consumes: `extractErrorCode`, `extractErrorMessage` (`lib/error-message.ts:9,51`), `KNOWN_ERROR_MESSAGES` (`result-review-copy.ts`)
- Produces: `describeBracketCanvasError(err: unknown, fallback: string): string`

- [ ] **Step 1: Write the failing test**

`apps/v1_web/src/lib/bracket-canvas-errors.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { describeBracketCanvasError } from './bracket-canvas-errors';

function apiError(code: string, message = '서버 원문이에요.') {
  return new V1ApiError({
    statusCode: 409,
    code,
    message,
    details: null,
    requestId: 'req-1',
    timestamp: '2026-10-08T00:00:00.000Z',
  } as unknown as ConstructorParameters<typeof V1ApiError>[0]);
}

describe('describeBracketCanvasError', () => {
  it.each([
    ['NEXT_FIXTURE_CONFLICT', '다음 경기가 이미 시작돼서 바꿀 수 없어요.'],
    ['QUICK_RESULT_ROSTER_SYNCING', '명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.'],
    ['SLOT_LOCKED', '이미 시작했거나 결과가 있는 경기라 팀을 바꿀 수 없어요.'],
    ['SLOT_TEAM_ALREADY_PLACED', '이미 다른 자리에 들어간 팀이에요.'],
    ['BRACKET_LOCKED', '시작했거나 결과가 있는 경기가 있어 대진을 교체할 수 없어요.'],
    ['BRACKET_TEMPLATE_TOO_LARGE', '경기가 너무 많아 한 번에 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.'],
    ['GROUP_HAS_SLOTS', '자리가 남아 있는 조는 지울 수 없어요. 자리를 먼저 비워 주세요.'],
    ['IDEMPOTENCY_PAYLOAD_CONFLICT', '같은 요청이 다른 내용으로 이미 처리됐어요. 새로고침한 뒤 다시 시도해 주세요.'],
    ['LEAGUE_ON_HOLD', '보류 중인 리그라 대진을 바꿀 수 없어요.'],
  ])('%s 는 정해 둔 해요체 문구로 바꾼다', (code, expected) => {
    expect(describeBracketCanvasError(apiError(code), '실패했어요.')).toBe(expected);
  });

  it('결과 화면이 이미 가진 코드는 그 문구를 재사용한다', () => {
    expect(describeBracketCanvasError(apiError('PROJECTION_PREVIEW_MISMATCH'), '실패했어요.')).toBe(
      '결과 내용이 방금 바뀌었어요. 최신 내용을 다시 확인한 뒤 시도해 주세요.',
    );
  });

  it('모르는 코드는 서버가 준 문장을 그대로 보여 준다', () => {
    expect(describeBracketCanvasError(apiError('SOMETHING_NEW', '새 서버 문장이에요.'), '실패했어요.')).toBe('새 서버 문장이에요.');
  });

  it('에러 객체가 아니면 fallback 을 쓴다', () => {
    expect(describeBracketCanvasError(undefined, '실패했어요.')).toBe('실패했어요.');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/lib/bracket-canvas-errors.test.ts`
Expected: FAIL — `Failed to resolve import "./bracket-canvas-errors"`.

- [ ] **Step 3: Implement**

`result-review-copy.ts` 11번째 줄 `const KNOWN_ERROR_MESSAGES` 를 `export const KNOWN_ERROR_MESSAGES` 로 바꾼다(한 단어).

`apps/v1_web/src/lib/bracket-canvas-errors.ts`

```ts
import { KNOWN_ERROR_MESSAGES } from '@/components/tournament-result-review/result-review-copy';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';

/** 그림 편집기가 새로 만나는 코드. 결과 화면과 겹치는 코드(NEXT_FIXTURE_CONFLICT)는 여기 문구가 이긴다. */
const BRACKET_CANVAS_MESSAGES: Readonly<Record<string, string>> = {
  NEXT_FIXTURE_CONFLICT: '다음 경기가 이미 시작돼서 바꿀 수 없어요.',
  QUICK_RESULT_ROSTER_SYNCING: '명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.',
  QUICK_RESULT_NOT_AVAILABLE: '이 경기는 점수를 바로 넣을 수 없어요. 진행 중이거나 이미 결과가 있는지 확인해 주세요.',
  QUICK_RESULT_HAS_LIVE_RECORDS: '라이브로 기록한 경기예요. 결과 정정 화면에서 고쳐 주세요.',
  QUICK_RESULT_TEAMS_REQUIRED: '양쪽 팀이 정해진 뒤에 점수를 넣을 수 있어요.',
  QUICK_RESULT_FIXTURE_CANCELLED: '취소된 경기에는 점수를 넣을 수 없어요.',
  QUICK_RESULT_UNSUPPORTED: '이 경기에는 점수를 바로 넣을 수 없어요.',
  SLOT_LOCKED: '이미 시작했거나 결과가 있는 경기라 팀을 바꿀 수 없어요.',
  SLOT_TEAM_ALREADY_PLACED: '이미 다른 자리에 들어간 팀이에요.',
  SLOT_REGISTRATION_INVALID: '이 대회에서 확정된 팀만 자리에 넣을 수 있어요.',
  SLOT_LINKED: '자리에 연결된 팀은 자리에서 바꿔 주세요.',
  SLOT_NOT_FOUND: '자리를 찾지 못했어요. 화면을 새로고침해 주세요.',
  BRACKET_NOT_EMPTY: '이미 대진이 있어요. 템플릿으로 바꾸려면 기존 대진 교체를 선택해 주세요.',
  BRACKET_LOCKED: '시작했거나 결과가 있는 경기가 있어 대진을 교체할 수 없어요.',
  BRACKET_TEMPLATE_UNSUPPORTED: '선택한 구성은 만들 수 없어요. 팀 수와 방식을 확인해 주세요.',
  BRACKET_TEMPLATE_FORMAT_MISMATCH: '이 대회 방식과 맞지 않는 템플릿이에요.',
  BRACKET_TEMPLATE_TOO_LARGE: '경기가 너무 많아 한 번에 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.',
  GROUP_HAS_SLOTS: '자리가 남아 있는 조는 지울 수 없어요. 자리를 먼저 비워 주세요.',
  IDEMPOTENCY_PAYLOAD_CONFLICT: '같은 요청이 다른 내용으로 이미 처리됐어요. 새로고침한 뒤 다시 시도해 주세요.',
  SLOT_BYE_POSITION_INVALID: '부전승 자리 위치가 올바르지 않아요.',
  SLOT_CHANGE_DUPLICATED: '같은 자리를 한 번에 두 번 바꿀 수 없어요.',
  SLOT_CHANGE_CROSS_TOURNAMENT: '다른 대회의 자리는 함께 바꿀 수 없어요.',
  LEAGUE_ON_HOLD: '보류 중인 리그라 대진을 바꿀 수 없어요.',
};

export function describeBracketCanvasError(err: unknown, fallback: string): string {
  const code = extractErrorCode(err);
  if (code !== null) {
    const message = BRACKET_CANVAS_MESSAGES[code] ?? KNOWN_ERROR_MESSAGES[code];
    if (message !== undefined) return message;
  }
  return extractErrorMessage(err, fallback);
}
```

- [ ] **Step 4: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/lib/bracket-canvas-errors.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/lib/bracket-canvas-errors.ts apps/v1_web/src/lib/bracket-canvas-errors.test.ts
git commit -m "feat(web): 그림 편집기 서버 에러 코드 해요체 안내" -- apps/v1_web/src/lib/bracket-canvas-errors.ts apps/v1_web/src/lib/bracket-canvas-errors.test.ts apps/v1_web/src/components/tournament-result-review/result-review-copy.ts
git show --stat HEAD
```

### Task 3: 캔버스 훅(`use-v1-bracket-canvas.ts`)

**Files:**
- Modify: `apps/v1_web/src/hooks/use-tournament-result-review.ts:150-156` (`const resultReviewKeys` → `export const`)
- Create: `apps/v1_web/src/hooks/use-v1-bracket-canvas.ts`
- Test: `apps/v1_web/src/hooks/use-v1-bracket-canvas.test.tsx`

**Interfaces:**
- Consumes: `v1Post`, `v1Put` (`lib/api-client.ts:189,193`), `randomUuid` (`lib/uuid.ts:7`), `v1Keys.adminTournamentBracket/tournament/adminTournament/adminLeagueMatch` (`lib/query-keys.ts:137,149,162,179`), `resultReviewKeys.game/revisions`
- Produces(계약 이름 그대로):
  - `useV1ApplyBracketTemplate(tournamentId: string)` → `mutate(V1ApplyBracketTemplatePayload): V1ApplyBracketTemplateResult`
  - `useV1AssignTournamentSlot(competitionId: string, scope: 'tournament' | 'league')` → `mutate({ slotId: string; registrationId: string | null }): V1AssignSlotResult`
  - `useV1RandomFillSlots(competitionId: string, scope: 'tournament' | 'league')` → `mutate(void): V1RandomFillResult`
  - `useV1QuickResult(competitionId: string, scope: 'tournament' | 'league')` → `mutate({ gameId: string; expectedVersion: number; score: V1QuickResultScore }): V1QuickResultResult`

- [ ] **Step 1: Write the failing test**

`apps/v1_web/src/hooks/use-v1-bracket-canvas.test.tsx`

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Post: vi.fn(), v1Put: vi.fn() };
});

import { v1Post, v1Put } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { resultReviewKeys } from '@/hooks/use-tournament-result-review';
import {
  useV1ApplyBracketTemplate,
  useV1AssignTournamentSlot,
  useV1QuickResult,
  useV1RandomFillSlots,
} from './use-v1-bracket-canvas';

const postMock = vi.mocked(v1Post);
const putMock = vi.mocked(v1Put);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { wrapper, invalidate };
}

const invalidatedKeys = (spy: ReturnType<typeof setup>['invalidate']) => spy.mock.calls.map(([filters]) => filters?.queryKey);

beforeEach(() => {
  postMock.mockReset();
  putMock.mockReset();
});

describe('useV1QuickResult', () => {
  it('clientCommandId 를 본문과 Idempotency-Key 헤더에 같은 값으로 보내고, 호출마다 새로 만든다', async () => {
    postMock.mockResolvedValue({ gameId: 'g1', revisionId: 'rev1', version: 4, score: { home: 2, away: 1 } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1QuickResult('t1', 'tournament'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ gameId: 'g1', expectedVersion: 3, score: { home: 2, away: 1 } });
      await result.current.mutateAsync({ gameId: 'g1', expectedVersion: 3, score: { home: 2, away: 1 } });
    });

    const [path, body, init] = postMock.mock.calls[0];
    expect(path).toBe('/admin/games/g1/quick-result');
    const sent = body as { clientCommandId: string; expectedVersion: number; score: unknown };
    expect(sent.clientCommandId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(sent).toMatchObject({ expectedVersion: 3, score: { home: 2, away: 1 } });
    expect((init as RequestInit).headers).toEqual({ 'Idempotency-Key': sent.clientCommandId });
    const second = postMock.mock.calls[1][1] as { clientCommandId: string };
    expect(second.clientCommandId).not.toBe(sent.clientCommandId);
  });

  it('성공하면 대진·공개 대회·그 경기의 결과 키를 모두 무효화한다', async () => {
    postMock.mockResolvedValue({ gameId: 'g1', revisionId: 'rev1', version: 4, score: { home: 1, away: 0 } });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useV1QuickResult('t1', 'tournament'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ gameId: 'g1', expectedVersion: 3, score: { home: 1, away: 0 } });
    });

    const keys = invalidatedKeys(invalidate);
    expect(keys).toContainEqual(v1Keys.adminTournamentBracket('t1'));
    expect(keys).toContainEqual(v1Keys.tournament('t1'));
    expect(keys).toContainEqual(resultReviewKeys.game('g1'));
    expect(keys).toContainEqual(resultReviewKeys.revisions('g1'));
  });

  it('리그 범위는 리그 상세 키만 무효화하고 대회 대진 키는 건드리지 않는다', async () => {
    postMock.mockResolvedValue({ gameId: 'g1', revisionId: 'rev1', version: 4, score: { home: 1, away: 0 } });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useV1QuickResult('l1', 'league'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ gameId: 'g1', expectedVersion: 3, score: { home: 1, away: 0 } });
    });

    const keys = invalidatedKeys(invalidate);
    expect(keys).toContainEqual(v1Keys.adminLeagueMatch('l1'));
    expect(keys).not.toContainEqual(v1Keys.adminTournamentBracket('l1'));
  });
});

describe('useV1AssignTournamentSlot', () => {
  it('PUT /admin/tournament-slots/:slotId/assignment 에 registrationId(비우기는 null)를 보낸다', async () => {
    putMock.mockResolvedValue({ slot: { id: 's1' }, affectedTeamMatchIds: [] });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useV1AssignTournamentSlot('t1', 'tournament'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ slotId: 's1', registrationId: 'reg1' });
      await result.current.mutateAsync({ slotId: 's1', registrationId: null });
    });

    expect(putMock).toHaveBeenNthCalledWith(1, '/admin/tournament-slots/s1/assignment', { registrationId: 'reg1' });
    expect(putMock).toHaveBeenNthCalledWith(2, '/admin/tournament-slots/s1/assignment', { registrationId: null });
    expect(invalidatedKeys(invalidate)).toContainEqual(v1Keys.adminTournamentBracket('t1'));
  });
});

describe('useV1RandomFillSlots · useV1ApplyBracketTemplate', () => {
  it('무작위 채우기는 본문 없이 POST 한다', async () => {
    postMock.mockResolvedValue({ assignments: [] });
    const { wrapper } = setup();
    const { result } = renderHook(() => useV1RandomFillSlots('t1', 'tournament'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(postMock).toHaveBeenCalledWith('/admin/tournaments/t1/slots/random-fill');
  });

  it('템플릿은 kind 별 필드를 평탄하게 보내고 replaceExisting 을 그대로 전달한다', async () => {
    postMock.mockResolvedValue({ groups: 3, slots: 8, fixtures: 7, edges: 6 });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useV1ApplyBracketTemplate('t1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ kind: 'knockout', size: 8, thirdPlace: false, replaceExisting: true });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postMock).toHaveBeenCalledWith('/admin/tournaments/t1/bracket/template', {
      kind: 'knockout',
      size: 8,
      thirdPlace: false,
      replaceExisting: true,
    });
    expect(invalidatedKeys(invalidate)).toContainEqual(v1Keys.adminTournamentBracket('t1'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/hooks/use-v1-bracket-canvas.test.tsx`
Expected: FAIL — `Failed to resolve import "./use-v1-bracket-canvas"`.

- [ ] **Step 3: Implement**

`use-tournament-result-review.ts` 에서 `const resultReviewKeys = {` 를 `export const resultReviewKeys = {` 로 바꾼다.

`apps/v1_web/src/hooks/use-v1-bracket-canvas.ts`

```ts
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { resultReviewKeys } from '@/hooks/use-tournament-result-review';
import { v1Post, v1Put } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import { randomUuid } from '@/lib/uuid';
import type {
  V1ApplyBracketTemplatePayload,
  V1ApplyBracketTemplateResult,
  V1AssignSlotResult,
  V1QuickResultResult,
  V1QuickResultScore,
  V1RandomFillResult,
} from '@/types/api';

export type BracketCompetitionScope = 'tournament' | 'league';

/** 대진이 바뀌면 어드민 화면과 공개 화면 캐시를 같이 털어야 한다. 리그는 상세 키 하나가 전부다. */
function invalidateCompetitionViews(queryClient: QueryClient, competitionId: string, scope: BracketCompetitionScope) {
  const keys =
    scope === 'league'
      ? [v1Keys.adminLeagueMatch(competitionId)]
      : [v1Keys.adminTournamentBracket(competitionId), v1Keys.tournament(competitionId)];
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** `POST /admin/tournaments/:id/bracket/template` — 평탄한 kind 별 필드 + `replaceExisting`. */
export function useV1ApplyBracketTemplate(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: V1ApplyBracketTemplatePayload) =>
      v1Post<V1ApplyBracketTemplateResult>(`/admin/tournaments/${tournamentId}/bracket/template`, payload),
    onSuccess: async () => {
      await Promise.all([
        invalidateCompetitionViews(queryClient, tournamentId, 'tournament'),
        queryClient.invalidateQueries({ queryKey: v1Keys.adminTournament(tournamentId) }),
      ]);
    },
  });
}

/** `PUT /admin/tournament-slots/:slotId/assignment` — registrationId null 이면 자리를 비운다. */
export function useV1AssignTournamentSlot(competitionId: string, scope: BracketCompetitionScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, registrationId }: { slotId: string; registrationId: string | null }) =>
      v1Put<V1AssignSlotResult>(`/admin/tournament-slots/${encodeURIComponent(slotId)}/assignment`, { registrationId }),
    onSuccess: () => invalidateCompetitionViews(queryClient, competitionId, scope),
  });
}

/** `POST /admin/tournaments/:id/slots/random-fill` — 리그도 같은 경로(id = 리그 id). */
export function useV1RandomFillSlots(competitionId: string, scope: BracketCompetitionScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => v1Post<V1RandomFillResult>(`/admin/tournaments/${competitionId}/slots/random-fill`),
    onSuccess: () => invalidateCompetitionViews(queryClient, competitionId, scope),
  });
}

/**
 * `POST /admin/games/:gameId/quick-result` — 점수만 넣어 바로 확정한다.
 * 서버가 `Idempotency-Key` 와 본문 `clientCommandId` 의 일치를 검사하므로 한 번 호출에 한 id 를 둘 다에 쓴다.
 */
export function useV1QuickResult(competitionId: string, scope: BracketCompetitionScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ gameId, expectedVersion, score }: { gameId: string; expectedVersion: number; score: V1QuickResultScore }) => {
      const clientCommandId = randomUuid();
      return v1Post<V1QuickResultResult>(
        `/admin/games/${encodeURIComponent(gameId)}/quick-result`,
        { clientCommandId, expectedVersion, score },
        { headers: { 'Idempotency-Key': clientCommandId } },
      );
    },
    onSuccess: async (_result, { gameId }) => {
      await Promise.all([
        invalidateCompetitionViews(queryClient, competitionId, scope),
        queryClient.invalidateQueries({ queryKey: resultReviewKeys.game(gameId) }),
        queryClient.invalidateQueries({ queryKey: resultReviewKeys.revisions(gameId) }),
      ]);
    },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/hooks/use-v1-bracket-canvas.test.tsx`
Expected: PASS (6 tests). 추가로 `./node_modules/.bin/tsc --noEmit -p tsconfig.json` 이 0 오류여야 한다.

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/hooks/use-v1-bracket-canvas.ts apps/v1_web/src/hooks/use-v1-bracket-canvas.test.tsx
git commit -m "feat(web): 대진 캔버스 훅(템플릿·자리 배정·무작위·빠른 결과)" -- apps/v1_web/src/hooks/use-v1-bracket-canvas.ts apps/v1_web/src/hooks/use-v1-bracket-canvas.test.tsx apps/v1_web/src/hooks/use-tournament-result-review.ts
git show --stat HEAD
```

### Task 4: 순수 레이아웃 함수와 공용 테스트 데이터

칸 위치·연결선·상태·라벨을 계산하는 순수 함수. 컴포넌트 태스크 전부가 이 함수와 아래 테스트 데이터 빌더에 기댄다.

**Files:**
- Create: `apps/v1_web/src/test/bracket-canvas-fixtures.ts` (테스트 전용 빌더, `.test.` 이름이 아니라 수집되지 않음)
- Create: `apps/v1_web/src/lib/bracket-canvas-layout.ts`
- Test: `apps/v1_web/src/lib/bracket-canvas-layout.test.ts`

**Interfaces:**
- Consumes: `V1AdminBracketGroup/Fixture/Slot/FixtureGame` (Task 1), `tournamentRoundLabel` (`lib/tournament-round-label.ts:16`)
- Produces(계약): `buildCanvasLayout(input: { groups; fixtures; slots; mode: 'bracket' | 'league' }): CanvasLayout`, `fixtureNodeState(game: V1AdminBracketFixtureGame | null): FixtureNodeState`
- Produces(보조): `isFixtureLocked(fixture)`, `isSlotAssignable(slot)`, `buildSideLabelContext(groups, fixtures, slots)`, `fixtureSideLabel(fixture, side, ctx)`, 상수 `CANVAS_NODE_WIDTH/HEIGHT/HEADER_HEIGHT/ROW_HEIGHT/FOOTER_HEIGHT`

- [ ] **Step 1: 테스트 데이터 빌더를 만든다**

`apps/v1_web/src/test/bracket-canvas-fixtures.ts`

```ts
import type {
  V1AdminBracketFixture,
  V1AdminBracketFixtureGame,
  V1AdminBracketGroup,
  V1AdminBracketSlot,
  V1AdminTournamentBracket,
} from '@/types/api';

const STAMP = '2026-10-08T00:00:00.000Z';

export function makeGroup(
  overrides: Partial<V1AdminBracketGroup> & Pick<V1AdminBracketGroup, 'id' | 'name' | 'phase'>,
): V1AdminBracketGroup {
  return {
    tournamentId: 't-1',
    sortOrder: 0,
    advanceCount: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    groupTeams: [],
    ...overrides,
  };
}

export function makeFixture(
  overrides: Partial<V1AdminBracketFixture> & Pick<V1AdminBracketFixture, 'id' | 'groupId' | 'fixtureNumber'>,
): V1AdminBracketFixture {
  return {
    tournamentId: 't-1',
    round: '8강',
    legNumber: 1,
    parentFixtureId: null,
    homeRegistrationId: null,
    homeTeamName: '홈 팀 미정',
    awayRegistrationId: null,
    awayTeamName: '어웨이 팀 미정',
    scheduledAt: null,
    venue: null,
    status: 'scheduled',
    createdAt: STAMP,
    updatedAt: STAMP,
    result: null,
    videos: [],
    homeSlotId: null,
    awaySlotId: null,
    game: null,
    ...overrides,
  };
}

export function makeSlot(overrides: Partial<V1AdminBracketSlot> & Pick<V1AdminBracketSlot, 'id'>): V1AdminBracketSlot {
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

export function makeGame(overrides: Partial<V1AdminBracketFixtureGame> = {}): V1AdminBracketFixtureGame {
  return { id: 'game-1', state: 'SCHEDULED', version: 1, hasLiveRecords: false, latestRevision: null, ...overrides };
}

export function makeBracket(overrides: Partial<V1AdminTournamentBracket> = {}): V1AdminTournamentBracket {
  return { groups: [], fixtures: [], standings: [], slots: [], ...overrides };
}
```

- [ ] **Step 2: Write the failing test**

`apps/v1_web/src/lib/bracket-canvas-layout.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { makeFixture, makeGame, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import {
  buildCanvasLayout,
  buildSideLabelContext,
  fixtureNodeState,
  fixtureSideLabel,
  isFixtureLocked,
  isSlotAssignable,
} from './bracket-canvas-layout';

// 칸 폭 232, 높이 156, 열 간격 72, 바깥 여백 24, 열 이름 32 → 첫 칸 y 56, 칸 사이 24.
const semi = makeGroup({ id: 'g-semi', name: '4강', phase: 'semi', sortOrder: 0 });
const final = makeGroup({ id: 'g-final', name: '결승', phase: 'final', sortOrder: 1 });
const third = makeGroup({ id: 'g-third', name: '3·4위전', phase: 'third_place', sortOrder: 2 });

const f1 = makeFixture({ id: 'f1', groupId: 'g-semi', fixtureNumber: 1, round: '4강' });
const f2 = makeFixture({ id: 'f2', groupId: 'g-semi', fixtureNumber: 2, round: '4강' });
const f3 = makeFixture({
  id: 'f3',
  groupId: 'g-final',
  fixtureNumber: 3,
  round: '결승',
  bracketSources: [
    { fixtureId: 'f1', outcome: 'WINNER', side: 'HOME' },
    { fixtureId: 'f2', outcome: 'WINNER', side: 'AWAY' },
  ],
});
const f4 = makeFixture({
  id: 'f4',
  groupId: 'g-third',
  fixtureNumber: 4,
  round: '3·4위전',
  bracketSources: [
    { fixtureId: 'f1', outcome: 'LOSER', side: 'HOME' },
    { fixtureId: 'f2', outcome: 'LOSER', side: 'AWAY' },
  ],
});

describe('buildCanvasLayout — 4팀 + 3·4위전', () => {
  // 입력 순서를 섞어도 열은 4강 > 결승 > 3·4위전이어야 한다.
  const layout = buildCanvasLayout({ groups: [third, final, semi], fixtures: [f4, f2, f3, f1], slots: [], mode: 'bracket' });
  const node = (id: string) => layout.nodes.find((n) => n.fixtureId === id)!;

  it('단계 순서로 열을 만들고 x 를 열 폭+간격으로 늘린다', () => {
    expect(layout.columns.map((c) => [c.label, c.x])).toEqual([
      ['4강', 24],
      ['결승', 328],
      ['3·4위전', 632],
    ]);
  });

  it('첫 열은 번호 순으로 쌓고, 다음 열은 원천 두 칸의 가운데에 놓는다', () => {
    expect([node('f1').y, node('f2').y]).toEqual([56, 236]);
    // 원천 연결 높이 144·324 의 평균 234 에서 칸 연결 높이 88 을 뺀다.
    expect(node('f3').y).toBe(146);
    expect(node('f4').y).toBe(146);
    expect(node('f3').x).toBe(328);
  });

  it('승자·패자 연결선을 칸 오른쪽 가운데에서 대상 사이드 줄까지 꺾어 그린다', () => {
    const edge = (id: string) => layout.edges.find((e) => e.id === id)!;
    expect(layout.edges).toHaveLength(4);
    expect(edge('f1->f3:HOME')).toMatchObject({ kind: 'WINNER', fromFixtureId: 'f1', toFixtureId: 'f3', side: 'HOME', path: 'M256 144 H292 V212 H328' });
    expect(edge('f2->f3:AWAY').path).toBe('M256 324 H292 V256 H328');
    expect(edge('f1->f4:HOME')).toMatchObject({ kind: 'LOSER', path: 'M256 144 H596 V212 H632' });
  });

  it('전체 크기는 마지막 열과 가장 아래 칸에 여백을 더한 값이다', () => {
    expect(layout.width).toBe(888);
    expect(layout.height).toBe(416);
  });
});

describe('buildCanvasLayout — 12강 부전승 대진', () => {
  const groups = [
    makeGroup({ id: 'g-r12', name: '12강', phase: 'round12', sortOrder: 0 }),
    makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter', sortOrder: 1 }),
    makeGroup({ id: 'g-sf', name: '4강', phase: 'semi', sortOrder: 2 }),
    makeGroup({ id: 'g-f', name: '결승', phase: 'final', sortOrder: 3 }),
    makeGroup({ id: 'g-t', name: '3·4위전', phase: 'third_place', sortOrder: 4 }),
  ];
  const slots = [1, 2, 3, 4].map((n) => makeSlot({ id: `bye-${n}`, kind: 'BYE', label: `부전승 ${n}`, position: n }));
  const r12 = [1, 2, 3, 4].map((n) => makeFixture({ id: `f${n}`, groupId: 'g-r12', fixtureNumber: n, round: '12강' }));
  const qf = [1, 2, 3, 4].map((n) =>
    makeFixture({
      id: `f${n + 4}`,
      groupId: 'g-qf',
      fixtureNumber: n + 4,
      homeSlotId: `bye-${n}`,
      bracketSources: [{ fixtureId: `f${n}`, outcome: 'WINNER', side: 'AWAY' }],
    }),
  );
  const rest = [
    makeFixture({ id: 'f9', groupId: 'g-sf', fixtureNumber: 9, bracketSources: [{ fixtureId: 'f5', outcome: 'WINNER', side: 'HOME' }, { fixtureId: 'f6', outcome: 'WINNER', side: 'AWAY' }] }),
    makeFixture({ id: 'f10', groupId: 'g-sf', fixtureNumber: 10, bracketSources: [{ fixtureId: 'f7', outcome: 'WINNER', side: 'HOME' }, { fixtureId: 'f8', outcome: 'WINNER', side: 'AWAY' }] }),
    makeFixture({ id: 'f11', groupId: 'g-f', fixtureNumber: 11, bracketSources: [{ fixtureId: 'f9', outcome: 'WINNER', side: 'HOME' }, { fixtureId: 'f10', outcome: 'WINNER', side: 'AWAY' }] }),
    makeFixture({ id: 'f12', groupId: 'g-t', fixtureNumber: 12, bracketSources: [{ fixtureId: 'f9', outcome: 'LOSER', side: 'HOME' }, { fixtureId: 'f10', outcome: 'LOSER', side: 'AWAY' }] }),
  ];
  const layout = buildCanvasLayout({ groups, fixtures: [...r12, ...qf, ...rest], slots, mode: 'bracket' });
  const y = (id: string) => layout.nodes.find((n) => n.fixtureId === id)!.y;

  it('8강은 12강 승자 칸과 같은 높이, 4강·결승은 원천 가운데에 놓는다', () => {
    expect([y('f1'), y('f2'), y('f3'), y('f4')]).toEqual([56, 236, 416, 596]);
    expect([y('f5'), y('f6'), y('f7'), y('f8')]).toEqual([56, 236, 416, 596]);
    expect([y('f9'), y('f10')]).toEqual([146, 506]);
    expect([y('f11'), y('f12')]).toEqual([326, 326]);
  });

  it('부전승 자리는 8강 홈 줄 앞에 짧은 BYE 연결선을 둔다', () => {
    const bye = layout.edges.filter((e) => e.kind === 'BYE');
    expect(bye).toHaveLength(4);
    expect(bye[0]).toMatchObject({ id: 'bye:f5:HOME', fromFixtureId: null, toFixtureId: 'f5', side: 'HOME', path: 'M292 122 H328' });
  });

  it('연결선 종류별 개수: 승자 10, 패자 2, 부전승 4', () => {
    const count = (kind: string) => layout.edges.filter((e) => e.kind === kind).length;
    expect([count('WINNER'), count('LOSER'), count('BYE')]).toEqual([10, 2, 4]);
  });

  it('같은 열의 칸은 어떤 경우에도 겹치지 않는다(칸 높이 156 + 간격 24)', () => {
    for (const column of layout.columns) {
      const ys = column.fixtureIds.map(y).sort((a, b) => a - b);
      ys.slice(1).forEach((value, index) => expect(value - ys[index]).toBeGreaterThanOrEqual(180));
    }
  });
});

describe('buildCanvasLayout — 16강 대진', () => {
  // 그룹을 일부러 섞어 넘겨도 열 순서는 sortOrder 가 아니라 단계(round16 > quarter > semi > final > third_place)를 따른다.
  const groups = [
    makeGroup({ id: 'g-t', name: '3·4위전', phase: 'third_place', sortOrder: 0 }),
    makeGroup({ id: 'g-f', name: '결승', phase: 'final', sortOrder: 1 }),
    makeGroup({ id: 'g-sf', name: '4강', phase: 'semi', sortOrder: 2 }),
    makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter', sortOrder: 3 }),
    makeGroup({ id: 'g-r16', name: '16강', phase: 'round16', sortOrder: 4 }),
  ];
  const r16 = Array.from({ length: 8 }, (_, i) => makeFixture({ id: `r${i + 1}`, groupId: 'g-r16', fixtureNumber: i + 1, round: '16강' }));
  const pair = (target: string, a: string, b: string, groupId: string, fixtureNumber: number) =>
    makeFixture({
      id: target,
      groupId,
      fixtureNumber,
      bracketSources: [
        { fixtureId: a, outcome: 'WINNER', side: 'HOME' },
        { fixtureId: b, outcome: 'WINNER', side: 'AWAY' },
      ],
    });
  const qf = [1, 2, 3, 4].map((n) => pair(`q${n}`, `r${2 * n - 1}`, `r${2 * n}`, 'g-qf', 8 + n));
  const sf = [pair('s1', 'q1', 'q2', 'g-sf', 13), pair('s2', 'q3', 'q4', 'g-sf', 14)];
  const fin = pair('fin', 's1', 's2', 'g-f', 15);
  const third = makeFixture({
    id: 'th',
    groupId: 'g-t',
    fixtureNumber: 16,
    bracketSources: [
      { fixtureId: 's1', outcome: 'LOSER', side: 'HOME' },
      { fixtureId: 's2', outcome: 'LOSER', side: 'AWAY' },
    ],
  });
  const layout = buildCanvasLayout({ groups, fixtures: [...r16, ...qf, ...sf, fin, third], slots: [], mode: 'bracket' });

  it('16강 열이 8강보다 앞에 오고 열 순서는 16강 > 8강 > 4강 > 결승 > 3·4위전이다', () => {
    expect(layout.columns.map((c) => c.label)).toEqual(['16강', '8강', '4강', '결승', '3·4위전']);
    const xs = layout.columns.map((c) => c.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('16강 8경기는 겹치지 않고, 8강은 원천 두 경기의 가운데에 놓인다', () => {
    const y = (id: string) => layout.nodes.find((n) => n.fixtureId === id)!.y;
    const ys = Array.from({ length: 8 }, (_, i) => y(`r${i + 1}`));
    ys.slice(1).forEach((value, index) => expect(value - ys[index]).toBeGreaterThanOrEqual(180));
    expect(y('q1')).toBe((y('r1') + y('r2')) / 2);
    expect(layout.edges.filter((e) => e.kind === 'WINNER')).toHaveLength(14);
    expect(layout.edges.filter((e) => e.kind === 'LOSER')).toHaveLength(2);
  });
});

describe('buildCanvasLayout — 예외 입력', () => {
  it('조에 속하지 않은 경기는 "조 미정" 열에 모아 잃지 않는다', () => {
    const orphan = makeFixture({ id: 'x1', groupId: null, fixtureNumber: 1 });
    const layout = buildCanvasLayout({ groups: [semi], fixtures: [f1, orphan], slots: [], mode: 'bracket' });
    expect(layout.columns.map((c) => c.label)).toEqual(['4강', '조 미정']);
    expect(layout.nodes).toHaveLength(2);
  });

  it('경기가 없으면 열 머리만 있는 최소 크기를 돌려준다', () => {
    const layout = buildCanvasLayout({ groups: [], fixtures: [], slots: [], mode: 'bracket' });
    expect(layout).toMatchObject({ columns: [], nodes: [], edges: [], width: 48, height: 80 });
  });

  it('리그 모드는 라운드별 열로 쌓고 연결선은 만들지 않는다', () => {
    const rounds = [
      makeFixture({ id: 'a', groupId: 'g', fixtureNumber: 1, round: 'league_r1' }),
      makeFixture({ id: 'b', groupId: 'g', fixtureNumber: 2, round: 'league_r1' }),
      makeFixture({ id: 'c', groupId: 'g', fixtureNumber: 3, round: 'league_r2' }),
    ];
    const layout = buildCanvasLayout({ groups: [makeGroup({ id: 'g', name: '리그', phase: 'group' })], fixtures: rounds, slots: [], mode: 'league' });
    expect(layout.columns.map((c) => [c.label, c.x])).toEqual([['조별리그 1라운드', 24], ['조별리그 2라운드', 328]]);
    expect(layout.nodes.map((n) => [n.fixtureId, n.y])).toEqual([['a', 56], ['b', 236], ['c', 56]]);
    expect(layout.edges).toEqual([]);
  });
});

describe('fixtureNodeState', () => {
  const revision = (state: 'DRAFT' | 'SUBMITTED' | 'CHANGE_REQUESTED' | 'OFFICIAL' | 'VOID') => ({
    id: 'rev', state, score: { home: 1, away: 0 }, entryMethod: 'quick' as const,
  });
  it.each([
    ['게임 없음', null, 'scheduled'],
    ['예정', makeGame(), 'scheduled'],
    ['진행 중', makeGame({ state: 'LIVE' }), 'live'],
    ['잠시 멈춤도 진행 중', makeGame({ state: 'PAUSED' }), 'live'],
    ['종료됐지만 결과 없음', makeGame({ state: 'ENDED' }), 'submitted'],
    ['확정 전(제출됨)', makeGame({ state: 'ENDED', latestRevision: revision('SUBMITTED') }), 'submitted'],
    ['확정 전(정정 초안)', makeGame({ state: 'ENDED', latestRevision: revision('DRAFT') }), 'submitted'],
    ['확정', makeGame({ state: 'ENDED', latestRevision: revision('OFFICIAL') }), 'official'],
    ['무효 뒤에는 다시 입력할 수 있는 예정', makeGame({ state: 'ENDED', latestRevision: revision('VOID') }), 'scheduled'],
    ['취소', makeGame({ state: 'CANCELLED' }), 'cancelled'],
  ] as const)('%s → %s', (_name, game, expected) => {
    expect(fixtureNodeState(game)).toBe(expected);
  });
});

describe('isFixtureLocked · isSlotAssignable', () => {
  it('예정이고 결과가 없는 경기만 열려 있다', () => {
    expect(isFixtureLocked(makeFixture({ id: 'a', groupId: 'g', fixtureNumber: 1 }))).toBe(false);
    expect(isFixtureLocked(makeFixture({ id: 'a', groupId: 'g', fixtureNumber: 1, game: makeGame() }))).toBe(false);
    expect(isFixtureLocked(makeFixture({ id: 'a', groupId: 'g', fixtureNumber: 1, game: makeGame({ state: 'LIVE' }) }))).toBe(true);
    expect(isFixtureLocked(makeFixture({ id: 'a', groupId: 'g', fixtureNumber: 1, game: makeGame({ state: 'ENDED' }) }))).toBe(true);
  });

  it('순위 자리는 끌어 놓기·선택 배정 대상이 아니다', () => {
    expect(isSlotAssignable(makeSlot({ id: 's', kind: 'ENTRY' }))).toBe(true);
    expect(isSlotAssignable(makeSlot({ id: 's', kind: 'BYE' }))).toBe(true);
    expect(isSlotAssignable(makeSlot({ id: 's', kind: 'GROUP_RANK' }))).toBe(false);
  });
});

describe('fixtureSideLabel — 팀 > 자리 > 연결 설명 > 미정', () => {
  const slot = makeSlot({ id: 's-rank', kind: 'GROUP_RANK', label: 'A조 1위' });
  const ctx = buildSideLabelContext([semi, final], [f1, f2, f3], [slot]);

  it('팀이 정해졌으면 팀 이름', () => {
    const fixture = makeFixture({ id: 'x', groupId: 'g-final', fixtureNumber: 9, homeRegistrationId: 'r1', homeTeamName: '서울FC', homeSlotId: 's-rank' });
    expect(fixtureSideLabel(fixture, 'HOME', ctx)).toBe('서울FC');
  });

  it('팀이 없고 자리가 있으면 자리 라벨', () => {
    const fixture = makeFixture({ id: 'x', groupId: 'g-final', fixtureNumber: 9, homeSlotId: 's-rank' });
    expect(fixtureSideLabel(fixture, 'HOME', ctx)).toBe('A조 1위');
  });

  it('자리가 없고 연결된 원천이 있으면 원천 경기 설명', () => {
    expect(fixtureSideLabel(f3, 'HOME', ctx)).toBe('4강 1번 경기 승자');
    expect(fixtureSideLabel(f4, 'AWAY', buildSideLabelContext([semi, third], [f1, f2, f4], []))).toBe('4강 2번 경기 패자');
  });

  it('아무것도 없으면 미정', () => {
    expect(fixtureSideLabel(f1, 'AWAY', ctx)).toBe('미정');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/lib/bracket-canvas-layout.test.ts`
Expected: FAIL — `Failed to resolve import "./bracket-canvas-layout"`.

- [ ] **Step 4: Implement**

`apps/v1_web/src/lib/bracket-canvas-layout.ts`

```ts
import { tournamentRoundLabel } from '@/lib/tournament-round-label';
import type {
  V1AdminBracketFixture,
  V1AdminBracketFixtureGame,
  V1AdminBracketGroup,
  V1AdminBracketSlot,
} from '@/types/api';

export const CANVAS_NODE_WIDTH = 232;
export const CANVAS_HEADER_HEIGHT = 44;
export const CANVAS_ROW_HEIGHT = 44;
export const CANVAS_FOOTER_HEIGHT = 24;
export const CANVAS_NODE_HEIGHT = CANVAS_HEADER_HEIGHT + CANVAS_ROW_HEIGHT * 2 + CANVAS_FOOTER_HEIGHT;
export const CANVAS_COLUMN_GAP = 72;
export const CANVAS_ROW_GAP = 24;
export const CANVAS_PADDING = 24;
export const CANVAS_COLUMN_LABEL_HEIGHT = 32;

const FIRST_NODE_Y = CANVAS_PADDING + CANVAS_COLUMN_LABEL_HEIGHT;
/** 연결선이 칸 양쪽 줄 사이(홈/어웨이 경계)에 닿는 칸 안쪽 높이 */
const NODE_ANCHOR_Y = CANVAS_HEADER_HEIGHT + CANVAS_ROW_HEIGHT;

export type SideKey = 'HOME' | 'AWAY';
export type CanvasMode = 'bracket' | 'league';
export type FixtureNodeState = 'scheduled' | 'live' | 'submitted' | 'official' | 'cancelled';

export type CanvasLayoutInput = {
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
  slots: readonly V1AdminBracketSlot[];
  mode: CanvasMode;
};
export type CanvasNodeLayout = { fixtureId: string; columnKey: string; x: number; y: number; width: number; height: number };
export type CanvasColumnLayout = { key: string; groupId: string | null; label: string; x: number; width: number; fixtureIds: string[] };
export type CanvasEdgeKind = 'WINNER' | 'LOSER' | 'BYE';
export type CanvasEdgeLayout = {
  id: string;
  kind: CanvasEdgeKind;
  fromFixtureId: string | null;
  toFixtureId: string;
  side: SideKey;
  path: string;
};
export type CanvasLayout = {
  width: number;
  height: number;
  columns: CanvasColumnLayout[];
  nodes: CanvasNodeLayout[];
  edges: CanvasEdgeLayout[];
};

// 조별리그(group)는 결선보다 앞 열이고, 결선은 round16 > round12 > quarter > semi > final > third_place 순이다(한 대회에 16강·12강이 함께 있지는 않다). 모르는 단계는 맨 뒤.
const PHASE_ORDER: Readonly<Record<string, number>> = { group: 0, round16: 1, round12: 2, quarter: 3, semi: 4, final: 5, third_place: 6 };

type ColumnSeed = { key: string; groupId: string | null; label: string; fixtures: V1AdminBracketFixture[] };

function compareFixtures(a: V1AdminBracketFixture, b: V1AdminBracketFixture): number {
  return a.fixtureNumber - b.fixtureNumber || a.legNumber - b.legNumber || a.id.localeCompare(b.id);
}

function bracketColumns(groups: readonly V1AdminBracketGroup[], fixtures: readonly V1AdminBracketFixture[]): ColumnSeed[] {
  const seeds: ColumnSeed[] = [...groups]
    .sort((a, b) => (PHASE_ORDER[a.phase] ?? 99) - (PHASE_ORDER[b.phase] ?? 99) || a.sortOrder - b.sortOrder)
    .map((group) => ({
      key: group.id,
      groupId: group.id,
      label: group.name,
      fixtures: fixtures.filter((fixture) => fixture.groupId === group.id).sort(compareFixtures),
    }));
  const known = new Set(groups.map((group) => group.id));
  const orphans = fixtures.filter((fixture) => fixture.groupId === null || !known.has(fixture.groupId)).sort(compareFixtures);
  return orphans.length > 0 ? [...seeds, { key: 'ungrouped', groupId: null, label: '조 미정', fixtures: orphans }] : seeds;
}

function leagueColumns(fixtures: readonly V1AdminBracketFixture[]): ColumnSeed[] {
  const byRound = new Map<string, V1AdminBracketFixture[]>();
  for (const fixture of [...fixtures].sort(compareFixtures)) {
    byRound.set(fixture.round, [...(byRound.get(fixture.round) ?? []), fixture]);
  }
  return [...byRound.entries()].map(([round, list]) => ({
    key: `round:${round}`,
    groupId: list[0].groupId,
    label: tournamentRoundLabel(round),
    fixtures: list,
  }));
}

function sideAnchorY(node: CanvasNodeLayout, side: SideKey): number {
  return node.y + CANVAS_HEADER_HEIGHT + (side === 'HOME' ? CANVAS_ROW_HEIGHT / 2 : CANVAS_ROW_HEIGHT * 1.5);
}

/** 원천 칸 오른쪽 가운데 → 대상 열 바로 앞 간격 가운데에서 꺾어 → 대상 사이드 줄. */
function elbowPath(fromX: number, fromY: number, toX: number, toY: number): string {
  return `M${fromX} ${fromY} H${toX - CANVAS_COLUMN_GAP / 2} V${toY} H${toX}`;
}

export function buildCanvasLayout(input: CanvasLayoutInput): CanvasLayout {
  const seeds = input.mode === 'league' ? leagueColumns(input.fixtures) : bracketColumns(input.groups, input.fixtures);
  const slotsById = new Map(input.slots.map((slot) => [slot.id, slot]));
  const placed = new Map<string, CanvasNodeLayout>();
  const columns: CanvasColumnLayout[] = [];

  seeds.forEach((seed, index) => {
    const x = CANVAS_PADDING + index * (CANVAS_NODE_WIDTH + CANVAS_COLUMN_GAP);
    let cursor = FIRST_NODE_Y;
    for (const fixture of seed.fixtures) {
      // 이미 놓인 원천 칸들의 연결 높이 평균에 맞추되, 위 칸과 겹치면 아래로 민다.
      const anchors =
        input.mode === 'bracket'
          ? (fixture.bracketSources ?? [])
              .map((source) => placed.get(source.fixtureId))
              .filter((node): node is CanvasNodeLayout => node !== undefined)
              .map((node) => node.y + NODE_ANCHOR_Y)
          : [];
      const desired = anchors.length > 0 ? Math.round(anchors.reduce((sum, value) => sum + value, 0) / anchors.length) - NODE_ANCHOR_Y : cursor;
      const y = Math.max(desired, cursor);
      placed.set(fixture.id, { fixtureId: fixture.id, columnKey: seed.key, x, y, width: CANVAS_NODE_WIDTH, height: CANVAS_NODE_HEIGHT });
      cursor = y + CANVAS_NODE_HEIGHT + CANVAS_ROW_GAP;
    }
    columns.push({ key: seed.key, groupId: seed.groupId, label: seed.label, x, width: CANVAS_NODE_WIDTH, fixtureIds: seed.fixtures.map((fixture) => fixture.id) });
  });

  const edges: CanvasEdgeLayout[] = [];
  for (const seed of seeds) {
    for (const fixture of seed.fixtures) {
      const target = placed.get(fixture.id);
      if (target === undefined) continue;
      for (const source of input.mode === 'bracket' ? fixture.bracketSources ?? [] : []) {
        const from = placed.get(source.fixtureId);
        if (from === undefined) continue;
        edges.push({
          id: `${source.fixtureId}->${fixture.id}:${source.side}`,
          kind: source.outcome,
          fromFixtureId: source.fixtureId,
          toFixtureId: fixture.id,
          side: source.side,
          path: elbowPath(from.x + CANVAS_NODE_WIDTH, from.y + NODE_ANCHOR_Y, target.x, sideAnchorY(target, source.side)),
        });
      }
      for (const side of ['HOME', 'AWAY'] as const) {
        const slotId = side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId;
        if (slotId !== null && slotsById.get(slotId)?.kind === 'BYE') {
          edges.push({
            id: `bye:${fixture.id}:${side}`,
            kind: 'BYE',
            fromFixtureId: null,
            toFixtureId: fixture.id,
            side,
            path: `M${target.x - CANVAS_COLUMN_GAP / 2} ${sideAnchorY(target, side)} H${target.x}`,
          });
        }
      }
    }
  }

  const nodes = [...placed.values()];
  const width = seeds.length === 0 ? CANVAS_PADDING * 2 : CANVAS_PADDING * 2 + seeds.length * CANVAS_NODE_WIDTH + (seeds.length - 1) * CANVAS_COLUMN_GAP;
  const bottom = nodes.reduce((max, node) => Math.max(max, node.y + node.height), FIRST_NODE_Y);
  return { width, height: bottom + CANVAS_PADDING, columns, nodes, edges };
}

/** 확정 전 결과(제출됨·정정 초안)도 `submitted` — 무효는 다시 입력할 수 있는 `scheduled` 로 돌아간다. */
export function fixtureNodeState(game: V1AdminBracketFixtureGame | null): FixtureNodeState {
  if (game === null) return 'scheduled';
  if (game.state === 'CANCELLED') return 'cancelled';
  if (game.state === 'LIVE' || game.state === 'PAUSED') return 'live';
  const revision = game.latestRevision;
  if (revision === null) return game.state === 'ENDED' ? 'submitted' : 'scheduled';
  if (revision.state === 'OFFICIAL') return 'official';
  if (revision.state === 'VOID') return 'scheduled';
  return 'submitted';
}

/** 서버 `SLOT_LOCKED` 와 같은 기준 — 게임이 예정이고 결과가 없을 때만 자리를 바꿀 수 있다. */
export function isFixtureLocked(fixture: V1AdminBracketFixture): boolean {
  const game = fixture.game;
  return game !== null && (game.state !== 'SCHEDULED' || game.latestRevision !== null);
}

export function isSlotAssignable(slot: V1AdminBracketSlot): boolean {
  return slot.kind !== 'GROUP_RANK';
}

export type SideLabelContext = {
  slotsById: ReadonlyMap<string, V1AdminBracketSlot>;
  fixturesById: ReadonlyMap<string, V1AdminBracketFixture>;
  groupsById: ReadonlyMap<string, V1AdminBracketGroup>;
};

export function buildSideLabelContext(
  groups: readonly V1AdminBracketGroup[],
  fixtures: readonly V1AdminBracketFixture[],
  slots: readonly V1AdminBracketSlot[],
): SideLabelContext {
  return {
    slotsById: new Map(slots.map((slot) => [slot.id, slot])),
    fixturesById: new Map(fixtures.map((fixture) => [fixture.id, fixture])),
    groupsById: new Map(groups.map((group) => [group.id, group])),
  };
}

export function fixtureSideLabel(fixture: V1AdminBracketFixture, side: SideKey, ctx: SideLabelContext): string {
  const registrationId = side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId;
  if (registrationId !== null) return side === 'HOME' ? fixture.homeTeamName : fixture.awayTeamName;
  const slotId = side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId;
  const slot = slotId === null ? undefined : ctx.slotsById.get(slotId);
  if (slot !== undefined) return slot.label;
  const source = fixture.bracketSources?.find((candidate) => candidate.side === side);
  const sourceFixture = source === undefined ? undefined : ctx.fixturesById.get(source.fixtureId);
  if (source !== undefined && sourceFixture !== undefined) {
    const groupName = sourceFixture.groupId === null ? undefined : ctx.groupsById.get(sourceFixture.groupId)?.name;
    return `${groupName ?? tournamentRoundLabel(sourceFixture.round)} ${sourceFixture.fixtureNumber}번 경기 ${source.outcome === 'LOSER' ? '패자' : '승자'}`;
  }
  return '미정';
}
```

- [ ] **Step 5: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/lib/bracket-canvas-layout.test.ts`
Expected: PASS (29 tests). `./node_modules/.bin/tsc --noEmit -p tsconfig.json` 0 오류.

- [ ] **Step 6: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/lib/bracket-canvas-layout.ts apps/v1_web/src/lib/bracket-canvas-layout.test.ts apps/v1_web/src/test/bracket-canvas-fixtures.ts
git commit -m "feat(web): 대진 캔버스 순수 레이아웃·상태·라벨 함수" -- apps/v1_web/src/lib/bracket-canvas-layout.ts apps/v1_web/src/lib/bracket-canvas-layout.test.ts apps/v1_web/src/test/bracket-canvas-fixtures.ts
git show --stat HEAD
```

### Task 5: 템플릿 미리보기 개수

대화상자가 "경기 N개 · 자리 M개 · 연결 K개"를 만들기 전에 보여 주고, 경기 수 상한(240)을 넘으면 만들기 버튼을 막기 위한 순수 함수. 숫자는 스펙 Test Scenarios 의 개수 계약과 같다(서버 planner 테스트가 같은 숫자를 고정한다).

**Files:**
- Create: `apps/v1_web/src/lib/bracket-template-counts.ts`
- Test: `apps/v1_web/src/lib/bracket-template-counts.test.ts`

**Interfaces:**
- Consumes: `BracketTemplateInput` (Task 1)
- Produces: `planBracketTemplateCounts(input: BracketTemplateInput): TemplatePlanCounts | null` (group_knockout 은 PR-4 가 채우므로 null), `exceedsFixtureLimit(counts): boolean`, `BRACKET_TEMPLATE_MAX_FIXTURES = 240`

- [ ] **Step 1: Write the failing test**

`apps/v1_web/src/lib/bracket-template-counts.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { BRACKET_TEMPLATE_MAX_FIXTURES, exceedsFixtureLimit, planBracketTemplateCounts } from './bracket-template-counts';

describe('planBracketTemplateCounts', () => {
  it.each([
    ['8팀 + 3·4위전', { kind: 'knockout', size: 8, thirdPlace: true }, { groups: 4, slots: 8, fixtures: 8, edges: 8 }],
    ['4팀 3·4위전 없음', { kind: 'knockout', size: 4, thirdPlace: false }, { groups: 2, slots: 4, fixtures: 3, edges: 2 }],
    // 12강: 12강 4 + 8강 4 + 4강 2 + 결승 1 + 3·4위전 1, 자리는 ENTRY 8 + 부전승 4
    ['12팀 + 3·4위전', { kind: 'knockout', size: 12, thirdPlace: true }, { groups: 5, slots: 12, fixtures: 12, edges: 12 }],
    ['12팀 3·4위전 없음', { kind: 'knockout', size: 12, thirdPlace: false }, { groups: 4, slots: 12, fixtures: 11, edges: 10 }],
    // 16강: 16강 8 + 8강 4 + 4강 2 + 결승 1 + 3·4위전 1, 부전승 없이 ENTRY 16
    ['16팀 + 3·4위전', { kind: 'knockout', size: 16, thirdPlace: true }, { groups: 5, slots: 16, fixtures: 16, edges: 16 }],
    ['16팀 3·4위전 없음', { kind: 'knockout', size: 16, thirdPlace: false }, { groups: 4, slots: 16, fixtures: 15, edges: 14 }],
    ['리그 6팀 2회전', { kind: 'league', teamCount: 6, legs: 2 }, { groups: 1, slots: 6, fixtures: 30, edges: 0 }],
    ['리그 4팀 1회전', { kind: 'league', teamCount: 4, legs: 1 }, { groups: 1, slots: 4, fixtures: 6, edges: 0 }],
  ] as const)('%s', (_name, input, expected) => {
    expect(planBracketTemplateCounts(input)).toEqual(expected);
  });

  it('조별+결선은 아직 미리보기를 계산하지 않는다(null)', () => {
    expect(
      planBracketTemplateCounts({ kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true }),
    ).toBeNull();
  });
});

describe('exceedsFixtureLimit', () => {
  it('경계: 16팀 2회전은 정확히 240경기라 허용, 17팀 2회전은 272경기라 초과', () => {
    expect(BRACKET_TEMPLATE_MAX_FIXTURES).toBe(240);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ kind: 'league', teamCount: 16, legs: 2 })!)).toBe(false);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ kind: 'league', teamCount: 17, legs: 2 })!)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/lib/bracket-template-counts.test.ts`
Expected: FAIL — `Failed to resolve import "./bracket-template-counts"`.

- [ ] **Step 3: Implement**

`apps/v1_web/src/lib/bracket-template-counts.ts`

```ts
import type { BracketTemplateInput } from '@/types/api';

/** 서버 `BRACKET_TEMPLATE_MAX_FIXTURES` 와 같은 값 — 넘으면 422 `BRACKET_TEMPLATE_TOO_LARGE`. */
export const BRACKET_TEMPLATE_MAX_FIXTURES = 240;

export type TemplatePlanCounts = { groups: number; slots: number; fixtures: number; edges: number };

// 첫 라운드부터 결승까지 경기 수.
const KNOCKOUT_ROUNDS: Readonly<Record<4 | 8 | 12 | 16, readonly number[]>> = {
  4: [2, 1],
  8: [4, 2, 1],
  12: [4, 4, 2, 1],
  16: [8, 4, 2, 1],
};

export function planBracketTemplateCounts(input: BracketTemplateInput): TemplatePlanCounts | null {
  if (input.kind === 'knockout') {
    const rounds = KNOCKOUT_ROUNDS[input.size];
    const third = input.thirdPlace ? 1 : 0;
    // 12강 → 8강은 8강 경기마다 12강 승자 한 명만 들어오고 나머지 한 자리는 부전승 자리라 연결이 경기 수와 같다.
    const edges = rounds.reduce((sum, count, index) => {
      if (index === 0) return sum;
      return sum + (input.size === 12 && index === 1 ? count : count * 2);
    }, 0);
    return {
      groups: rounds.length + third,
      slots: input.size,
      fixtures: rounds.reduce((sum, count) => sum + count, 0) + third,
      edges: edges + third * 2,
    };
  }
  if (input.kind === 'league') {
    return { groups: 1, slots: input.teamCount, fixtures: ((input.teamCount * (input.teamCount - 1)) / 2) * input.legs, edges: 0 };
  }
  return null;
}

export function exceedsFixtureLimit(counts: TemplatePlanCounts): boolean {
  return counts.fixtures > BRACKET_TEMPLATE_MAX_FIXTURES;
}
```

- [ ] **Step 4: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/lib/bracket-template-counts.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/lib/bracket-template-counts.ts apps/v1_web/src/lib/bracket-template-counts.test.ts
git commit -m "feat(web): 템플릿 만들 개수 미리보기 계산" -- apps/v1_web/src/lib/bracket-template-counts.ts apps/v1_web/src/lib/bracket-template-counts.test.ts
git show --stat HEAD
```

### Task 6: 점수 입력 검증·정정 payload 조립

폼은 문자열을 들고 있고, 이 순수 함수들이 "보낼 수 있는 점수인가"와 "정정 요청 본문을 어떻게 채우는가"를 정한다. 정정은 점수만 바꾸므로 기존 리비전의 참가자·선축 정보를 떨어뜨리지 않는 것이 핵심이다(`types/api.ts` `V1GameResultScoreInput` 주석의 사고 이력).

**Files:**
- Create: `apps/v1_web/src/lib/bracket-quick-score.ts`
- Test: `apps/v1_web/src/lib/bracket-quick-score.test.ts`

**Interfaces:**
- Consumes: `V1QuickResultScore` (Task 1), `V1GameResultScore`, `V1GameResultScoreInput`, `V1GameResultParticipantRow`, `V1GameResultParticipantInput` (`types/api.ts:1535,1624,1569`)
- Produces:
  - `type QuickScoreInputs = { home: string; away: string; penaltyHome: string; penaltyAway: string }`
  - `needsPenalties(inputs: QuickScoreInputs, isKnockout: boolean): boolean`
  - `parseQuickScore(inputs: QuickScoreInputs, isKnockout: boolean): { ok: true; score: V1QuickResultScore } | { ok: false; error: string }`
  - `mergeCorrectionScore(base: V1GameResultScore, next: V1QuickResultScore): V1GameResultScoreInput`
  - `toCorrectionParticipants(rows: V1GameResultParticipantRow[]): V1GameResultParticipantInput[]`

- [ ] **Step 1: Write the failing test**

`apps/v1_web/src/lib/bracket-quick-score.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { V1GameResultParticipantRow, V1GameResultScore } from '@/types/api';
import {
  mergeCorrectionScore,
  needsPenalties,
  parseQuickScore,
  toCorrectionParticipants,
  type QuickScoreInputs,
} from './bracket-quick-score';

const inputs = (overrides: Partial<QuickScoreInputs> = {}): QuickScoreInputs => ({
  home: '2',
  away: '1',
  penaltyHome: '',
  penaltyAway: '',
  ...overrides,
});

describe('needsPenalties', () => {
  it('결선(녹아웃)이고 두 점수가 같을 때만 승부차기가 필요하다', () => {
    expect(needsPenalties(inputs({ home: '1', away: '1' }), true)).toBe(true);
    expect(needsPenalties(inputs({ home: '1', away: '1' }), false)).toBe(false);
    expect(needsPenalties(inputs({ home: '2', away: '1' }), true)).toBe(false);
    expect(needsPenalties(inputs({ home: '', away: '' }), true)).toBe(false);
  });
});

describe('parseQuickScore', () => {
  it('이긴 경기는 승부차기 입력이 남아 있어도 보내지 않는다', () => {
    expect(parseQuickScore(inputs({ penaltyHome: '4', penaltyAway: '3' }), true)).toEqual({ ok: true, score: { home: 2, away: 1 } });
  });

  it('조별(결선 아님) 무승부는 승부차기 없이 그대로 보낸다', () => {
    expect(parseQuickScore(inputs({ home: '1', away: '1' }), false)).toEqual({ ok: true, score: { home: 1, away: 1 } });
  });

  it('결선 무승부는 승부차기를 함께 보낸다', () => {
    expect(parseQuickScore(inputs({ home: '1', away: '1', penaltyHome: '4', penaltyAway: '3' }), true)).toEqual({
      ok: true,
      score: { home: 1, away: 1, penalties: { home: 4, away: 3 } },
    });
  });

  it.each([
    ['빈 홈 점수', { home: '' }, '홈 점수를 0 이상의 정수로 입력해 주세요.'],
    ['음수', { away: '-1' }, '어웨이 점수를 0 이상의 정수로 입력해 주세요.'],
    ['소수', { home: '1.5' }, '홈 점수를 0 이상의 정수로 입력해 주세요.'],
    ['결선 무승부인데 승부차기 없음', { home: '0', away: '0' }, '결선 경기가 무승부면 승부차기 점수를 입력해 주세요.'],
    ['결선 무승부 승부차기가 같음', { home: '0', away: '0', penaltyHome: '3', penaltyAway: '3' }, '승부차기는 승자가 갈리도록 입력해 주세요.'],
  ])('%s → 거절', (_name, overrides, error) => {
    expect(parseQuickScore(inputs(overrides), true)).toEqual({ ok: false, error });
  });
});

describe('mergeCorrectionScore', () => {
  it('승부차기 선축은 보존하고 킥 수 같은 나머지는 떨어뜨린다', () => {
    const base: V1GameResultScore = {
      home: 1,
      away: 1,
      penalties: { home: 4, away: 3, firstKickSideKey: 'AWAY', takenHome: 5, takenAway: 5 },
    };
    expect(mergeCorrectionScore(base, { home: 2, away: 2, penalties: { home: 5, away: 4 } })).toEqual({
      home: 2,
      away: 2,
      penalties: { home: 5, away: 4, firstKickSideKey: 'AWAY' },
    });
  });

  it('새 점수에 승부차기가 없으면 penalties 키 자체를 보내지 않는다', () => {
    const base: V1GameResultScore = { home: 1, away: 1, penalties: { home: 4, away: 3 } };
    const merged = mergeCorrectionScore(base, { home: 2, away: 1 });
    expect(merged).toEqual({ home: 2, away: 1 });
    expect('penalties' in merged).toBe(false);
  });

  it('백필된 중첩 형태의 기존 점수여도 던지지 않는다', () => {
    const base: V1GameResultScore = { regulation: { home: 0, away: 0 }, penalty: null, goals: [], incomplete: false };
    expect(mergeCorrectionScore(base, { home: 1, away: 0 })).toEqual({ home: 1, away: 0 });
  });
});

describe('toCorrectionParticipants', () => {
  const row = (overrides: Partial<V1GameResultParticipantRow>): V1GameResultParticipantRow => ({
    id: 'row-1',
    resultRevisionId: 'rev-1',
    participantId: 'p-1',
    sideId: 'side-home',
    started: true,
    minutesPlayed: null,
    goals: 0,
    assists: 0,
    fouls: 0,
    cards: { yellow: 0, red: 0 },
    goalkeeper: false,
    displayName: '김선수',
    jerseyNumber: 7,
    ...overrides,
  });

  it('서버 DTO 가 받는 키만 남기고 표시용 필드(id·이름·등번호)는 뺀다', () => {
    expect(toCorrectionParticipants([row({})])).toEqual([
      { participantId: 'p-1', sideId: 'side-home', started: true, goals: 0, assists: 0, fouls: 0, cards: { yellow: 0, red: 0 }, goalkeeper: false },
    ]);
  });

  it('출전 시간이 null 이면 키를 빼고, 값이 있으면 보낸다', () => {
    const [nullMinutes, withMinutes] = toCorrectionParticipants([row({}), row({ participantId: 'p-2', minutesPlayed: 90 })]);
    expect('minutesPlayed' in nullMinutes).toBe(false);
    expect(withMinutes.minutesPlayed).toBe(90);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/lib/bracket-quick-score.test.ts`
Expected: FAIL — `Failed to resolve import "./bracket-quick-score"`.

- [ ] **Step 3: Implement**

`apps/v1_web/src/lib/bracket-quick-score.ts`

```ts
import type {
  V1GameResultParticipantInput,
  V1GameResultParticipantRow,
  V1GameResultScore,
  V1GameResultScoreInput,
  V1QuickResultScore,
} from '@/types/api';

export type QuickScoreInputs = { home: string; away: string; penaltyHome: string; penaltyAway: string };
export type QuickScoreParseResult = { ok: true; score: V1QuickResultScore } | { ok: false; error: string };

const SCORE_PATTERN = /^\d{1,3}$/;

function toScore(value: string): number | null {
  return SCORE_PATTERN.test(value.trim()) ? Number(value.trim()) : null;
}

export function needsPenalties(inputs: QuickScoreInputs, isKnockout: boolean): boolean {
  const home = toScore(inputs.home);
  const away = toScore(inputs.away);
  return isKnockout && home !== null && away !== null && home === away;
}

export function parseQuickScore(inputs: QuickScoreInputs, isKnockout: boolean): QuickScoreParseResult {
  const home = toScore(inputs.home);
  const away = toScore(inputs.away);
  if (home === null) return { ok: false, error: '홈 점수를 0 이상의 정수로 입력해 주세요.' };
  if (away === null) return { ok: false, error: '어웨이 점수를 0 이상의 정수로 입력해 주세요.' };
  if (!needsPenalties(inputs, isKnockout)) return { ok: true, score: { home, away } };

  const penaltyHome = toScore(inputs.penaltyHome);
  const penaltyAway = toScore(inputs.penaltyAway);
  if (penaltyHome === null || penaltyAway === null) {
    return { ok: false, error: '결선 경기가 무승부면 승부차기 점수를 입력해 주세요.' };
  }
  if (penaltyHome === penaltyAway) return { ok: false, error: '승부차기는 승자가 갈리도록 입력해 주세요.' };
  return { ok: true, score: { home, away, penalties: { home: penaltyHome, away: penaltyAway } } };
}

/**
 * 정정 본문의 점수. 서버 `GameScoreDto` 가 받는 키(home/away/penalties)만 쓰되, 선축(firstKickSideKey)은
 * 폼에 입력란이 없어 한 번 떨어뜨리면 되살릴 수 없으므로 기존 값을 이어 받는다.
 */
export function mergeCorrectionScore(base: V1GameResultScore, next: V1QuickResultScore): V1GameResultScoreInput {
  if (next.penalties === undefined) return { home: next.home, away: next.away };
  const firstKick = 'penalties' in base ? base.penalties?.firstKickSideKey : undefined;
  return {
    home: next.home,
    away: next.away,
    penalties: { ...next.penalties, ...(firstKick === undefined ? {} : { firstKickSideKey: firstKick }) },
  };
}

/** 기존 리비전의 참가자 행 → 정정 DTO. 표시용 필드와 null 출전 시간은 보내지 않는다(`forbidNonWhitelisted`). */
export function toCorrectionParticipants(rows: V1GameResultParticipantRow[]): V1GameResultParticipantInput[] {
  return rows.map((row) => ({
    participantId: row.participantId,
    sideId: row.sideId,
    started: row.started,
    ...(row.minutesPlayed === null ? {} : { minutesPlayed: row.minutesPlayed }),
    goals: row.goals,
    assists: row.assists,
    fouls: row.fouls,
    cards: row.cards,
    goalkeeper: row.goalkeeper,
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/lib/bracket-quick-score.test.ts`
Expected: PASS (14 tests). `./node_modules/.bin/tsc --noEmit -p tsconfig.json` 0 오류.

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/lib/bracket-quick-score.ts apps/v1_web/src/lib/bracket-quick-score.test.ts
git commit -m "feat(web): 빠른 점수 검증과 정정 payload 조립 함수" -- apps/v1_web/src/lib/bracket-quick-score.ts apps/v1_web/src/lib/bracket-quick-score.test.ts
git show --stat HEAD
```

### Task 7: 칸 컴포넌트(`BracketCanvasNode`)

칸 하나는 머리(번호 + 상태 태그) · 홈/어웨이 두 줄 · 꼬리(어드민 빠른 입력·승부차기)로 이뤄진다. 머리와 두 줄이 각각 44px 버튼이다. 상태는 색 + 아이콘 + 글자를 함께 쓴다(색만으로 전달 금지).

**Files:**
- Modify: `apps/v1_web/src/lib/competition-status.ts` (끝에 `bracketNodeStateChip` 추가 — 칸 상태 칩의 단일 정의)
- Modify: `apps/v1_web/src/lib/competition-status.test.ts`
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-dnd.ts`
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.test.tsx`

**Interfaces:**
- Consumes: `fixtureNodeState`, `isFixtureLocked`, `isSlotAssignable`, `CANVAS_*`, `CanvasNodeLayout`, `SideKey` (Task 4)
- Produces:
  - `bracketNodeStateChip(state: FixtureNodeState): StatusChipModel` (`lib/competition-status.ts`) — scheduled `예정`(grey/clock) · live `진행 중`(blue/live) · submitted `확정 전`(orange/hourglass) · official `확정`(green/check) · cancelled `취소`(red/cancel). PR-5b·PR-6 은 이 함수를 import 하고 자기 상태 맵을 새로 만들지 않는다.
  - `REGISTRATION_DRAG_MIME = 'application/x-teameet-registration'`
  - `BracketCanvasNode(props: { fixture: V1AdminBracketFixture; position: CanvasNodeLayout; title: string; sideLabels: Record<SideKey, string>; slots: { HOME: V1AdminBracketSlot | null; AWAY: V1AdminBracketSlot | null }; selected: boolean; canWrite: boolean; pendingRegistrationId: string | null; onSelect: (fixtureId: string) => void; onAssign: (slotId: string, registrationId: string) => void })`

- [ ] **Step 1: Write the failing test**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.test.tsx`

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGame, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixture, V1AdminBracketSlot } from '@/types/api';
import { BracketCanvasNode } from './bracket-canvas-node';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

const POSITION = { fixtureId: 'f1', columnKey: 'g', x: 24, y: 56, width: 232, height: 156 };
const entry = (id: string) => makeSlot({ id, kind: 'ENTRY', label: `${id} 자리` });

function renderNode(
  fixture: V1AdminBracketFixture,
  overrides: Partial<React.ComponentProps<typeof BracketCanvasNode>> = {},
) {
  const props = {
    fixture,
    position: POSITION,
    title: '8강 1번 경기',
    sideLabels: { HOME: '1번 자리', AWAY: '2번 자리' },
    slots: { HOME: entry('s-home') as V1AdminBracketSlot | null, AWAY: entry('s-away') as V1AdminBracketSlot | null },
    selected: false,
    canWrite: true,
    pendingRegistrationId: null,
    onSelect: vi.fn(),
    onAssign: vi.fn(),
    ...overrides,
  };
  render(<BracketCanvasNode {...props} />);
  return props;
}

const base = makeFixture({ id: 'f1', groupId: 'g', fixtureNumber: 1, homeSlotId: 's-home', awaySlotId: 's-away' });
const officialQuick = (entryMethod: 'quick' | 'console' | 'correction', penalties?: { home: number; away: number }) =>
  makeFixture({
    ...base,
    homeRegistrationId: 'r1',
    homeTeamName: '서울FC',
    awayRegistrationId: 'r2',
    awayTeamName: '부산FC',
    game: makeGame({
      state: 'ENDED',
      latestRevision: { id: 'rev', state: 'OFFICIAL', entryMethod, score: { home: 1, away: 1, ...(penalties ? { penalties } : {}) } },
    }),
  });

describe('BracketCanvasNode — 표시', () => {
  it('예정 칸: 제목·상태 태그·사이드 라벨을 보여 주고 점수는 없다', () => {
    renderNode(base);
    expect(screen.getByRole('group', { name: '8강 1번 경기, 예정' })).toBeInTheDocument();
    expect(screen.getByText('예정')).toBeInTheDocument();
    expect(screen.getByText('1번 자리')).toBeInTheDocument();
    expect(screen.queryByText('어드민 빠른 입력')).not.toBeInTheDocument();
  });

  it('빠른 입력으로 확정된 칸만 "어드민 빠른 입력"과 점수를 보여 준다(대조: 콘솔 입력은 표시 없음)', () => {
    renderNode(officialQuick('quick'));
    expect(screen.getByText('확정')).toBeInTheDocument();
    expect(screen.getByText('어드민 빠른 입력')).toBeInTheDocument();
  });

  it('라이브 콘솔로 확정된 칸에는 빠른 입력 표시가 없다', () => {
    renderNode(officialQuick('console'));
    expect(screen.getByText('확정')).toBeInTheDocument();
    expect(screen.queryByText('어드민 빠른 입력')).not.toBeInTheDocument();
  });

  it('승부차기 점수를 꼬리에 보여 준다', () => {
    renderNode(officialQuick('quick', { home: 4, away: 3 }));
    expect(screen.getByText(/승부차기 4:3/)).toBeInTheDocument();
  });

  it('무효 처리된 칸은 점수를 숨기고 "무효 처리됨"을 보여 준다', () => {
    renderNode(
      makeFixture({
        ...base,
        game: makeGame({ state: 'ENDED', latestRevision: { id: 'rev', state: 'VOID', entryMethod: 'quick', score: { home: 3, away: 0 } } }),
      }),
    );
    expect(screen.getByText('무효 처리됨')).toBeInTheDocument();
    expect(screen.queryByText('어드민 빠른 입력')).not.toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('머리 버튼은 선택 상태를 aria-pressed 로 알린다', () => {
    renderNode(base, { selected: true });
    expect(screen.getByRole('button', { name: '8강 1번 경기 열기' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('BracketCanvasNode — 눌러서 배정', () => {
  it('고른 팀이 없으면 줄을 눌러도 배정하지 않고 칸을 연다', () => {
    const props = renderNode(base);
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리' }));
    expect(props.onSelect).toHaveBeenCalledWith('f1');
    expect(props.onAssign).not.toHaveBeenCalled();
  });

  it('고른 팀이 있으면 누른 줄의 자리에 배정한다', () => {
    const props = renderNode(base, { pendingRegistrationId: 'reg-9' });
    fireEvent.click(screen.getByRole('button', { name: '어웨이 2번 자리, 선택한 팀을 여기에 넣어요' }));
    expect(props.onAssign).toHaveBeenCalledWith('s-away', 'reg-9');
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it.each([
    ['경기가 시작된 칸', makeFixture({ ...base, game: makeGame({ state: 'LIVE' }) }), {}],
    ['읽기 전용 화면', base, { canWrite: false }],
    ['순위 자리', base, { slots: { HOME: makeSlot({ id: 's-rank', kind: 'GROUP_RANK', label: 'A조 1위' }), AWAY: null } }],
    ['자리가 없는 줄(연결선으로 채워지는 줄)', base, { slots: { HOME: null, AWAY: null } }],
  ] as const)('%s 에서는 고른 팀이 있어도 배정하지 않고 칸을 연다', (_name, fixture, overrides) => {
    const props = renderNode(fixture, { pendingRegistrationId: 'reg-9', ...overrides });
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리' }));
    expect(props.onAssign).not.toHaveBeenCalled();
    expect(props.onSelect).toHaveBeenCalledWith('f1');
  });
});

describe('BracketCanvasNode — 끌어 놓기', () => {
  const dropOn = (side: 'HOME' | 'AWAY', registrationId: string) => {
    const row = document.querySelector(`[data-side="${side}"]`)!;
    fireEvent.drop(row, { dataTransfer: { getData: (type: string) => (type === REGISTRATION_DRAG_MIME ? registrationId : '') } });
  };

  it('배정 가능한 줄에 놓으면 그 자리에 배정한다', () => {
    const props = renderNode(base);
    dropOn('HOME', 'reg-7');
    expect(props.onAssign).toHaveBeenCalledWith('s-home', 'reg-7');
  });

  it('시작된 칸에서는 놓아도 배정하지 않는다', () => {
    const live = renderNode(makeFixture({ ...base, game: makeGame({ state: 'LIVE' }) }));
    dropOn('HOME', 'reg-7');
    expect(live.onAssign).not.toHaveBeenCalled();
  });

  it('우리 앱이 심은 데이터가 아니면(다른 곳에서 끌어온 것) 무시한다', () => {
    const props = renderNode(base);
    const row = document.querySelector('[data-side="HOME"]')!;
    fireEvent.drop(row, { dataTransfer: { getData: () => '' } });
    expect(props.onAssign).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-node.test.tsx`
Expected: FAIL — `Failed to resolve import "./bracket-canvas-node"`.

- [ ] **Step 3: Implement**

`apps/v1_web/src/lib/competition-status.test.ts` 끝에 추가(이미 `describe` 밖 import 블록이 있으면 `bracketNodeStateChip` 만 기존 import 에 합친다).

```ts
describe('bracketNodeStateChip', () => {
  it.each([
    ['scheduled', '예정', 'grey', 'clock'],
    ['live', '진행 중', 'blue', 'live'],
    ['submitted', '확정 전', 'orange', 'hourglass'],
    ['official', '확정', 'green', 'check'],
    ['cancelled', '취소', 'red', 'cancel'],
  ] as const)('%s → 글자 %s · 톤 %s · 아이콘 %s (색만으로 전달하지 않는다)', (state, label, tone, icon) => {
    expect(bracketNodeStateChip(state)).toEqual({ label, tone, icon });
  });
});
```

`apps/v1_web/src/lib/competition-status.ts` 의 import 에 `import type { FixtureNodeState } from '@/lib/bracket-canvas-layout';` 를 추가하고 파일 끝에 붙인다.

```ts
/** 어드민 대진 칸 상태 칩 — 데스크톱 캔버스·리그 보드·모바일이 같은 글자·아이콘·톤을 쓰는 단일 정의. */
const BRACKET_NODE_CHIP: Record<FixtureNodeState, StatusChipModel> = {
  scheduled: { label: '예정', tone: 'grey', icon: 'clock' },
  live: { label: '진행 중', tone: 'blue', icon: 'live' },
  submitted: { label: '확정 전', tone: 'orange', icon: 'hourglass' },
  official: { label: '확정', tone: 'green', icon: 'check' },
  cancelled: { label: '취소', tone: 'red', icon: 'cancel' },
};

export function bracketNodeStateChip(state: FixtureNodeState): StatusChipModel {
  return BRACKET_NODE_CHIP[state];
}
```

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-dnd.ts`

```ts
/** 참가팀 트레이가 끌기 시작할 때 심고, 칸이 놓일 때 읽는 데이터 타입 — 값은 registrationId. */
export const REGISTRATION_DRAG_MIME = 'application/x-teameet-registration';
```

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.tsx`

```tsx
'use client';

import { Zap } from 'lucide-react';
import type { DragEvent } from 'react';
import { StatusChip } from '@/components/v1-ui/status-chip';
import { bracketNodeStateChip } from '@/lib/competition-status';
import {
  CANVAS_FOOTER_HEIGHT,
  CANVAS_HEADER_HEIGHT,
  CANVAS_ROW_HEIGHT,
  fixtureNodeState,
  isFixtureLocked,
  isSlotAssignable,
  type CanvasNodeLayout,
  type SideKey,
} from '@/lib/bracket-canvas-layout';
import type { V1AdminBracketFixture, V1AdminBracketSlot } from '@/types/api';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

const SIDE_NAME: Record<SideKey, string> = { HOME: '홈', AWAY: '어웨이' };

export type BracketCanvasNodeProps = {
  fixture: V1AdminBracketFixture;
  position: CanvasNodeLayout;
  title: string;
  sideLabels: Record<SideKey, string>;
  slots: { HOME: V1AdminBracketSlot | null; AWAY: V1AdminBracketSlot | null };
  selected: boolean;
  canWrite: boolean;
  pendingRegistrationId: string | null;
  onSelect: (fixtureId: string) => void;
  onAssign: (slotId: string, registrationId: string) => void;
};

export function BracketCanvasNode({
  fixture,
  position,
  title,
  sideLabels,
  slots,
  selected,
  canWrite,
  pendingRegistrationId,
  onSelect,
  onAssign,
}: BracketCanvasNodeProps) {
  const state = fixtureNodeState(fixture.game);
  const chip = bracketNodeStateChip(state);
  const locked = isFixtureLocked(fixture);
  const revision = fixture.game?.latestRevision ?? null;
  const voided = revision?.state === 'VOID';
  const score = voided ? null : (revision?.score ?? null);
  const quick = !voided && revision?.entryMethod === 'quick';
  const penalty = score?.penalties ? `승부차기 ${score.penalties.home}:${score.penalties.away}` : null;
  const footer = [voided ? '무효 처리됨' : quick ? '어드민 빠른 입력' : null, penalty].filter((part): part is string => part !== null);

  const renderSide = (side: SideKey) => {
    const slot = slots[side];
    const assignable = canWrite && !locked && slot !== null && isSlotAssignable(slot);
    const placing = assignable && pendingRegistrationId !== null;
    const filled = (side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId) !== null;
    const sideScore = score === null ? null : side === 'HOME' ? score.home : score.away;
    return (
      <div
        key={side}
        data-side={side}
        className="border-t border-[var(--border)]"
        style={{ height: CANVAS_ROW_HEIGHT }}
        onDragOver={assignable ? (event: DragEvent) => event.preventDefault() : undefined}
        onDrop={
          assignable && slot !== null
            ? (event: DragEvent) => {
                event.preventDefault();
                const registrationId = event.dataTransfer.getData(REGISTRATION_DRAG_MIME);
                if (registrationId !== '') onAssign(slot.id, registrationId);
              }
            : undefined
        }
      >
        <button
          type="button"
          aria-label={`${SIDE_NAME[side]} ${sideLabels[side]}${placing ? ', 선택한 팀을 여기에 넣어요' : ''}`}
          onClick={() => (placing && slot !== null ? onAssign(slot.id, pendingRegistrationId) : onSelect(fixture.id))}
          className={`flex h-full w-full items-center justify-between gap-2 px-3 text-left transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500${placing ? ' tm-on-tint bg-[var(--blue50)]' : ''}`}
        >
          <span
            className={`tm-text-label min-w-0 flex-1 truncate${filled ? ' font-semibold' : ''}`}
            style={{ color: filled || placing ? 'var(--text-strong)' : 'var(--text-muted)' }}
          >
            {sideLabels[side]}
          </span>
          {placing ? (
            <span className="tm-text-caption-strong shrink-0" style={{ color: 'var(--blue700)' }}>
              여기에 넣기
            </span>
          ) : sideScore !== null ? (
            <span className="tab-num tm-text-body-lg shrink-0 font-bold" style={{ color: 'var(--text-strong)' }}>
              {sideScore}
            </span>
          ) : null}
        </button>
      </div>
    );
  };

  return (
    <div
      role="group"
      aria-label={`${title}, ${chip.label}`}
      data-fixture-id={fixture.id}
      data-state={state}
      className="absolute overflow-hidden bg-[var(--card-surface)]"
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
        borderRadius: 'var(--radius-container)',
        border: `1px solid ${selected ? 'var(--blue500)' : 'var(--border-strong)'}`,
      }}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${title} 열기`}
        onClick={() => onSelect(fixture.id)}
        className="flex w-full items-center justify-between gap-2 px-3 text-left transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500"
        style={{ height: CANVAS_HEADER_HEIGHT }}
      >
        <span className="tm-text-label min-w-0 truncate font-semibold" style={{ color: 'var(--text-strong)' }}>
          {title}
        </span>
        <StatusChip chip={chip} />
      </button>
      {renderSide('HOME')}
      {renderSide('AWAY')}
      <div
        className="tm-text-caption flex items-center gap-1 border-t border-[var(--border)] px-3"
        style={{ height: CANVAS_FOOTER_HEIGHT, color: 'var(--text-muted)' }}
      >
        {quick ? <Zap size={12} aria-hidden="true" /> : null}
        <span className="truncate">{footer.join(' · ')}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-node.test.tsx`
Expected: PASS (15 tests).

Run (apps/v1_web): `./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs`
Expected: tsc 0 오류, 패턴 검사 `✓ v1 패턴 검사 통과`.

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/lib/competition-status.ts apps/v1_web/src/lib/competition-status.test.ts apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-dnd.ts apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.test.tsx
git commit -m "feat(web): 대진 캔버스 칸 컴포넌트와 칸 상태 칩" -- apps/v1_web/src/lib/competition-status.ts apps/v1_web/src/lib/competition-status.test.ts apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-dnd.ts apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-node.test.tsx
git show --stat HEAD
```

### Task 8: 캔버스 컨테이너(`BracketCanvas`)

열 이름 + 칸(절대 위치) + SVG 연결선. 위치는 전부 Task 4 의 `buildCanvasLayout` 결과이고, 연결선 종류는 선 모양(실선/점선)으로도 구분한다.

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.test.tsx`

**Interfaces:**
- Consumes: `buildCanvasLayout`, `buildSideLabelContext`, `fixtureSideLabel`, `CANVAS_PADDING` (Task 4), `BracketCanvasNode` (Task 7), `competitionMatchLabel` (`lib/tournament-round-label.ts:39`)
- Produces:
  - `BracketCanvas(props: { groups: V1AdminBracketGroup[]; fixtures: V1AdminBracketFixture[]; slots: V1AdminBracketSlot[]; mode: CanvasMode; selectedFixtureId: string | null; pendingRegistrationId: string | null; canWrite: boolean; onSelectFixture: (fixtureId: string) => void; onAssignSlot: (slotId: string, registrationId: string) => void })`
  - `fixtureTitle(fixture: V1AdminBracketFixture, groups: readonly V1AdminBracketGroup[]): string` — "8강 1번 경기" (패널이 같은 제목을 쓴다)

- [ ] **Step 1: Write the failing test**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.test.tsx`

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import { BracketCanvas, fixtureTitle } from './bracket-canvas';

const semi = makeGroup({ id: 'g-semi', name: '4강', phase: 'semi', sortOrder: 0 });
const final = makeGroup({ id: 'g-final', name: '결승', phase: 'final', sortOrder: 1 });
const third = makeGroup({ id: 'g-third', name: '3·4위전', phase: 'third_place', sortOrder: 2 });
const slots = [
  makeSlot({ id: 's1', label: '1번 자리' }),
  makeSlot({ id: 's2', label: '2번 자리' }),
  makeSlot({ id: 's3', label: '3번 자리' }),
  makeSlot({ id: 's4', label: '4번 자리' }),
];
const fixtures = [
  makeFixture({ id: 'f1', groupId: 'g-semi', fixtureNumber: 1, round: '4강', homeSlotId: 's1', awaySlotId: 's2' }),
  makeFixture({ id: 'f2', groupId: 'g-semi', fixtureNumber: 2, round: '4강', homeSlotId: 's3', awaySlotId: 's4' }),
  makeFixture({
    id: 'f3',
    groupId: 'g-final',
    fixtureNumber: 3,
    round: '결승',
    bracketSources: [
      { fixtureId: 'f1', outcome: 'WINNER', side: 'HOME' },
      { fixtureId: 'f2', outcome: 'WINNER', side: 'AWAY' },
    ],
  }),
  makeFixture({
    id: 'f4',
    groupId: 'g-third',
    fixtureNumber: 4,
    round: '3·4위전',
    bracketSources: [
      { fixtureId: 'f1', outcome: 'LOSER', side: 'HOME' },
      { fixtureId: 'f2', outcome: 'LOSER', side: 'AWAY' },
    ],
  }),
];

function renderCanvas(overrides: Partial<React.ComponentProps<typeof BracketCanvas>> = {}) {
  const props = {
    groups: [third, final, semi],
    fixtures,
    slots,
    mode: 'bracket' as const,
    selectedFixtureId: null,
    pendingRegistrationId: null,
    canWrite: true,
    onSelectFixture: vi.fn(),
    onAssignSlot: vi.fn(),
    ...overrides,
  };
  const view = render(<BracketCanvas {...props} />);
  return { ...view, props };
}

describe('fixtureTitle', () => {
  it('결선은 단계 이름 + 번호, 조별은 조 이름까지 붙인다', () => {
    expect(fixtureTitle(fixtures[0], [semi])).toBe('4강 1번 경기');
    const groupFixture = makeFixture({ id: 'x', groupId: 'g-a', fixtureNumber: 5, round: 'league_r2' });
    expect(fixtureTitle(groupFixture, [makeGroup({ id: 'g-a', name: 'A조', phase: 'group' })])).toBe('A조 · 조별리그 2라운드 5번 경기');
  });
});

describe('BracketCanvas', () => {
  it('열 이름을 단계 순서(4강 > 결승 > 3·4위전)로 보여 준다', () => {
    renderCanvas();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['4강', '결승', '3·4위전']);
  });

  it('칸마다 제목과 자리 라벨을 그리고, 연결선은 승자 2 + 패자 2 개를 SVG 로 그린다', () => {
    const { container } = renderCanvas();
    expect(screen.getAllByRole('group')).toHaveLength(4);
    expect(screen.getByRole('button', { name: '홈 1번 자리' })).toBeInTheDocument();
    expect(container.querySelectorAll('svg path')).toHaveLength(4);
  });

  it('패자 연결선만 점선이라 색 없이도 승자선과 구분된다', () => {
    const { container } = renderCanvas();
    const dashed = [...container.querySelectorAll('svg path')].filter((path) => path.hasAttribute('stroke-dasharray'));
    expect(dashed).toHaveLength(2);
    expect(screen.getByText(/실선은 승자, 점선은 패자/)).toBeInTheDocument();
  });

  it('선택한 칸의 머리 버튼이 눌린 상태이고, 칸을 누르면 선택을 알린다', () => {
    const { props } = renderCanvas({ selectedFixtureId: 'f2' });
    expect(screen.getByRole('button', { name: '4강 2번 경기 열기' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '4강 1번 경기 열기' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: '4강 1번 경기 열기' }));
    expect(props.onSelectFixture).toHaveBeenCalledWith('f1');
  });

  it('고른 팀이 있으면 빈 자리 줄을 눌러 그 자리에 배정한다(키보드 경로)', () => {
    const { props } = renderCanvas({ pendingRegistrationId: 'reg-1' });
    const nodeOne = screen.getByRole('group', { name: '4강 1번 경기, 예정' });
    fireEvent.click(within(nodeOne).getByRole('button', { name: '어웨이 2번 자리, 선택한 팀을 여기에 넣어요' }));
    expect(props.onAssignSlot).toHaveBeenCalledWith('s2', 'reg-1');
    expect(props.onSelectFixture).not.toHaveBeenCalled();
  });

  it('연결선이 없는 대진(리그 모드)에는 선 설명을 숨긴다', () => {
    renderCanvas({
      mode: 'league',
      groups: [makeGroup({ id: 'g-semi', name: '리그', phase: 'group' })],
      fixtures: [fixtures[0]],
    });
    expect(screen.queryByText(/실선은 승자/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas.test.tsx`
Expected: FAIL — `Failed to resolve import "./bracket-canvas"`.

- [ ] **Step 3: Implement**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx`

```tsx
'use client';

import { useMemo } from 'react';
import {
  CANVAS_PADDING,
  buildCanvasLayout,
  buildSideLabelContext,
  fixtureSideLabel,
  type CanvasEdgeKind,
  type CanvasMode,
} from '@/lib/bracket-canvas-layout';
import { competitionMatchLabel } from '@/lib/tournament-round-label';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketSlot } from '@/types/api';
import { BracketCanvasNode } from './bracket-canvas-node';

export type BracketCanvasProps = {
  groups: V1AdminBracketGroup[];
  fixtures: V1AdminBracketFixture[];
  slots: V1AdminBracketSlot[];
  mode: CanvasMode;
  selectedFixtureId: string | null;
  pendingRegistrationId: string | null;
  canWrite: boolean;
  onSelectFixture: (fixtureId: string) => void;
  onAssignSlot: (slotId: string, registrationId: string) => void;
};

export function fixtureTitle(fixture: V1AdminBracketFixture, groups: readonly V1AdminBracketGroup[]): string {
  const groupName = groups.find((group) => group.id === fixture.groupId)?.name ?? null;
  return `${competitionMatchLabel({ groupName, round: fixture.round, legNumber: fixture.legNumber })} ${fixture.fixtureNumber}번 경기`;
}

// 선 모양으로도 종류를 구분한다 — 색만으로 전달하지 않는다.
const EDGE_STYLE: Record<CanvasEdgeKind, { dash: string | undefined }> = {
  WINNER: { dash: undefined },
  LOSER: { dash: '6 4' },
  BYE: { dash: '2 3' },
};

export function BracketCanvas({
  groups,
  fixtures,
  slots,
  mode,
  selectedFixtureId,
  pendingRegistrationId,
  canWrite,
  onSelectFixture,
  onAssignSlot,
}: BracketCanvasProps) {
  const layout = useMemo(() => buildCanvasLayout({ groups, fixtures, slots, mode }), [groups, fixtures, slots, mode]);
  const labelContext = useMemo(() => buildSideLabelContext(groups, fixtures, slots), [groups, fixtures, slots]);
  const fixturesById = useMemo(() => new Map(fixtures.map((fixture) => [fixture.id, fixture])), [fixtures]);
  const slotsById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);

  return (
    <div
      role="region"
      aria-label="대진 그림"
      className="overflow-auto"
      style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface-muted)' }}
    >
      <div style={{ position: 'relative', width: layout.width, height: layout.height }}>
        {layout.columns.map((column) => (
          <h3
            key={column.key}
            className="tm-text-caption-strong absolute"
            style={{ left: column.x, top: CANVAS_PADDING, width: column.width }}
          >
            {column.label}
          </h3>
        ))}
        <svg aria-hidden="true" width={layout.width} height={layout.height} className="pointer-events-none absolute left-0 top-0">
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.path}
              fill="none"
              stroke="var(--grey500)"
              strokeWidth={2}
              strokeDasharray={EDGE_STYLE[edge.kind].dash}
            />
          ))}
        </svg>
        {layout.nodes.map((position) => {
          const fixture = fixturesById.get(position.fixtureId);
          if (fixture === undefined) return null;
          return (
            <BracketCanvasNode
              key={fixture.id}
              fixture={fixture}
              position={position}
              title={fixtureTitle(fixture, groups)}
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
            />
          );
        })}
      </div>
      {layout.edges.length > 0 ? (
        <p className="tm-text-caption px-4 pb-3" style={{ color: 'var(--text-muted)' }}>
          실선은 승자, 점선은 패자가 가는 곳이에요.
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas.test.tsx`
Expected: PASS (7 tests).

Run (apps/v1_web): `./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs`
Expected: 0 오류 / 통과. (`border: '1px solid ...'`·`borderRadius: 'var(--radius-container)'` 는 토큰이라 통과.)

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.test.tsx
git commit -m "feat(web): 대진 캔버스 컨테이너(열·칸·SVG 연결선)" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.test.tsx
git show --stat HEAD
```

### Task 9: 참가팀 트레이(`BracketTeamTray`)

확정된 참가팀을 나열한다. 마우스는 끌어 놓기, 키보드·터치는 "팀 누르기 → 칸의 빈 줄 누르기" 두 번 누르기로 같은 일을 한다. 이미 어느 자리(ENTRY·BYE)에 들어간 팀은 서버가 `SLOT_TEAM_ALREADY_PLACED` 로 거절하므로 미리 비활성으로 보여 준다.

**Files:**
- Modify: `apps/v1_web/src/test/bracket-canvas-fixtures.ts` (`makeRegistration` 추가)
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-team-tray.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-team-tray.test.tsx`

**Interfaces:**
- Consumes: `REGISTRATION_DRAG_MIME` (Task 7), `V1AdminTournamentRegistration` (`types/api.ts:4021`), `V1AdminBracketSlot`
- Produces: `BracketTeamTray(props: { registrations: V1AdminTournamentRegistration[]; slots: V1AdminBracketSlot[]; pendingRegistrationId: string | null; canWrite: boolean; onPick: (registrationId: string | null) => void })`, 테스트 빌더 `makeRegistration`

- [ ] **Step 1: 테스트 빌더에 등록 팀을 추가한다**

`apps/v1_web/src/test/bracket-canvas-fixtures.ts` 맨 위 import 에 `V1AdminTournamentRegistration` 을 추가하고 파일 끝에 붙인다.

```ts
/** 어드민 등록 목록 항목 — 이 화면은 id·teamName·status 만 읽는다(기존 bracket-tab 테스트와 같은 방식으로 나머지는 단언). */
export function makeRegistration(
  overrides: Partial<V1AdminTournamentRegistration> & Pick<V1AdminTournamentRegistration, 'id' | 'teamName'>,
): V1AdminTournamentRegistration {
  return {
    tournamentId: 't-1',
    teamId: `team-${overrides.id}`,
    appliedByUserId: 'u-1',
    status: 'confirmed',
    confirmedAt: STAMP,
    confirmedByAdminUserId: 'admin-1',
    payment: null,
    ...overrides,
  } as unknown as V1AdminTournamentRegistration;
}
```

- [ ] **Step 2: Write the failing test**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-team-tray.test.tsx`

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import { BracketTeamTray } from './bracket-team-tray';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

const registrations = [
  makeRegistration({ id: 'r1', teamName: '서울FC' }),
  makeRegistration({ id: 'r2', teamName: '부산FC' }),
  makeRegistration({ id: 'r3', teamName: '대구FC' }),
  makeRegistration({ id: 'r4', teamName: '입금 대기 팀', status: 'awaiting_payment' }),
];

function renderTray(overrides: Partial<React.ComponentProps<typeof BracketTeamTray>> = {}) {
  const props = {
    registrations,
    slots: [],
    pendingRegistrationId: null,
    canWrite: true,
    onPick: vi.fn(),
    ...overrides,
  };
  render(<BracketTeamTray {...props} />);
  return props;
}

describe('BracketTeamTray', () => {
  it('확정된 팀만 이름순으로 나열하고 미배정 수를 보여 준다', () => {
    renderTray();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['대구FC', '부산FC', '서울FC']);
    expect(screen.queryByText('입금 대기 팀')).not.toBeInTheDocument();
    expect(screen.getByText('미배정 3 / 전체 3')).toBeInTheDocument();
  });

  it('ENTRY·BYE 자리에 들어간 팀은 비활성이고 "배정됨"으로 표시한다(순위 자리는 배정으로 세지 않는다)', () => {
    renderTray({
      slots: [
        makeSlot({ id: 's1', kind: 'ENTRY', registrationId: 'r1' }),
        makeSlot({ id: 's2', kind: 'BYE', registrationId: 'r2' }),
        makeSlot({ id: 's3', kind: 'GROUP_RANK', registrationId: 'r3' }),
      ],
    });
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /부산FC/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /대구FC/ })).toBeEnabled();
    expect(screen.getAllByText('배정됨')).toHaveLength(2);
    expect(screen.getByText('미배정 1 / 전체 3')).toBeInTheDocument();
  });

  it('팀을 누르면 그 팀을 선택한다', () => {
    const props = renderTray();
    fireEvent.click(screen.getByRole('button', { name: /서울FC/ }));
    expect(props.onPick).toHaveBeenCalledWith('r1');
  });

  it('선택된 팀은 aria-pressed 와 "선택됨" 글자로 알리고, 다시 누르면 null 을 보낸다', () => {
    const props = renderTray({ pendingRegistrationId: 'r1' });
    const selected = screen.getByRole('button', { name: /서울FC/ });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('선택됨')).toBeInTheDocument();
    fireEvent.click(selected);
    expect(props.onPick).toHaveBeenCalledWith(null);
  });

  it('끌기를 시작하면 registrationId 를 전달 데이터에 심는다', () => {
    renderTray();
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByRole('button', { name: /서울FC/ }), { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith(REGISTRATION_DRAG_MIME, 'r1');
  });

  it('읽기 전용이면 모든 팀이 비활성이고 안내만 보인다', () => {
    renderTray({ canWrite: false });
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByText('읽기 전용이라 팀을 넣을 수 없어요.')).toBeInTheDocument();
  });

  it('확정된 팀이 없으면 빈 안내를 보여 준다', () => {
    renderTray({ registrations: [registrations[3]] });
    expect(screen.getByText('확정된 참가팀이 아직 없어요.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-team-tray.test.tsx`
Expected: FAIL — `Failed to resolve import "./bracket-team-tray"`.

- [ ] **Step 4: Implement**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-team-tray.tsx`

```tsx
'use client';

import { useMemo, type DragEvent } from 'react';
import { CheckCircle2, GripVertical } from 'lucide-react';
import type { V1AdminBracketSlot, V1AdminTournamentRegistration } from '@/types/api';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

export type BracketTeamTrayProps = {
  registrations: V1AdminTournamentRegistration[];
  slots: V1AdminBracketSlot[];
  pendingRegistrationId: string | null;
  canWrite: boolean;
  onPick: (registrationId: string | null) => void;
};

export function BracketTeamTray({ registrations, slots, pendingRegistrationId, canWrite, onPick }: BracketTeamTrayProps) {
  const teams = useMemo(
    () =>
      registrations
        .filter((registration) => registration.status === 'confirmed')
        .map((registration) => ({ id: registration.id, name: registration.teamName ?? registration.teamId }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [registrations],
  );
  // 서버의 SLOT_TEAM_ALREADY_PLACED 는 ENTRY·BYE 사이에서 판정한다. 순위 자리는 결과로 채워지는 칸이라 세지 않는다.
  const placedIds = useMemo(
    () => new Set(slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map((slot) => slot.registrationId)),
    [slots],
  );
  const unplacedCount = teams.filter((team) => !placedIds.has(team.id)).length;

  return (
    <section aria-label="참가팀" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>
          참가팀
        </h3>
        <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
          {`미배정 ${unplacedCount} / 전체 ${teams.length}`}
        </span>
      </div>
      <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
        {canWrite ? '팀을 고른 뒤 비어 있는 자리를 누르거나, 팀을 끌어서 자리에 놓으세요.' : '읽기 전용이라 팀을 넣을 수 없어요.'}
      </p>
      {teams.length === 0 ? (
        <p className="tm-text-label" style={{ color: 'var(--text-muted)' }}>
          확정된 참가팀이 아직 없어요.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {teams.map((team) => {
            const placed = placedIds.has(team.id);
            const selected = pendingRegistrationId === team.id;
            return (
              <li key={team.id}>
                <button
                  type="button"
                  draggable={canWrite && !placed}
                  disabled={!canWrite || placed}
                  aria-pressed={selected}
                  onClick={() => onPick(selected ? null : team.id)}
                  onDragStart={(event: DragEvent) => {
                    event.dataTransfer.setData(REGISTRATION_DRAG_MIME, team.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  className={`tm-on-tint flex min-h-[44px] w-full items-center gap-2 border px-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-60 ${
                    selected ? 'bg-[var(--blue50)] border-[var(--blue500)]' : 'bg-[var(--card-surface)] border-[var(--border)] hover:bg-[var(--surface-soft)]'
                  }`}
                  style={{ borderRadius: 'var(--radius-control)' }}
                >
                  <GripVertical size={16} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
                  <span className="tm-text-label min-w-0 flex-1 truncate" style={{ color: 'var(--text-strong)' }}>
                    {team.name}
                  </span>
                  {placed ? (
                    <span className="tm-text-caption-strong inline-flex items-center gap-1">
                      <CheckCircle2 size={12} aria-hidden="true" />
                      배정됨
                    </span>
                  ) : selected ? (
                    <span className="tm-text-caption-strong" style={{ color: 'var(--blue700)' }}>
                      선택됨
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-team-tray.test.tsx`
Expected: PASS (7 tests). 이어서 `./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs` 통과.

- [ ] **Step 6: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/components/admin/bracket-canvas/bracket-team-tray.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-team-tray.test.tsx
git commit -m "feat(web): 대진 캔버스 참가팀 트레이" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-team-tray.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-team-tray.test.tsx apps/v1_web/src/test/bracket-canvas-fixtures.ts
git show --stat HEAD
```

### Task 10: 점수 입력 폼(`BracketQuickResultForm`)

빠른 결과와 "점수 고치기"가 함께 쓰는 폼. 승부차기 입력란은 결선 경기에서 두 점수가 같을 때만 나타난다(조별 무승부에는 서버가 `TOURNAMENT_PENALTY_NOT_ALLOWED` 로 거절하므로 입력란 자체를 주지 않는다). 검증은 Task 6 의 `parseQuickScore` 가 한다.

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-quick-result-form.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-quick-result-form.test.tsx`

**Interfaces:**
- Consumes: `parseQuickScore`, `needsPenalties`, `QuickScoreInputs` (Task 6), `Button` (`components/v1-ui/button.tsx:72`)
- Produces: `BracketQuickResultForm(props: { homeLabel: string; awayLabel: string; isKnockout: boolean; initial?: V1QuickResultScore; submitLabel: string; pending: boolean; errorMessage?: string | null; onSubmit: (score: V1QuickResultScore) => void; onCancel?: () => void })`

- [ ] **Step 1: Write the failing test**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-quick-result-form.test.tsx`

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BracketQuickResultForm } from './bracket-quick-result-form';

function renderForm(overrides: Partial<React.ComponentProps<typeof BracketQuickResultForm>> = {}) {
  const props = {
    homeLabel: '서울FC',
    awayLabel: '부산FC',
    isKnockout: true,
    submitLabel: '점수 확정',
    pending: false,
    onSubmit: vi.fn(),
    ...overrides,
  };
  render(<BracketQuickResultForm {...props} />);
  return props;
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: /점수 확정|정정 제출/ }));

describe('BracketQuickResultForm — 승부차기 입력란 표시 조건', () => {
  it('결선에서 두 점수가 같을 때만 승부차기 입력란이 나타난다', () => {
    renderForm();
    expect(screen.queryByLabelText('서울FC 승부차기')).not.toBeInTheDocument();
    type('서울FC 점수', '1');
    type('부산FC 점수', '1');
    expect(screen.getByLabelText('서울FC 승부차기')).toBeInTheDocument();
    expect(screen.getByLabelText('부산FC 승부차기')).toBeInTheDocument();
    type('부산FC 점수', '0');
    expect(screen.queryByLabelText('서울FC 승부차기')).not.toBeInTheDocument();
  });

  it('조별(결선 아님) 무승부에는 입력란을 주지 않고 점수만 그대로 보낸다', () => {
    const props = renderForm({ isKnockout: false });
    type('서울FC 점수', '1');
    type('부산FC 점수', '1');
    expect(screen.queryByLabelText('서울FC 승부차기')).not.toBeInTheDocument();
    submit();
    expect(props.onSubmit).toHaveBeenCalledWith({ home: 1, away: 1 });
  });
});

describe('BracketQuickResultForm — 제출', () => {
  it('이긴 경기는 점수만 보낸다', () => {
    const props = renderForm();
    type('서울FC 점수', '3');
    type('부산FC 점수', '1');
    submit();
    expect(props.onSubmit).toHaveBeenCalledWith({ home: 3, away: 1 });
  });

  it('결선 무승부는 승부차기까지 보낸다', () => {
    const props = renderForm();
    type('서울FC 점수', '2');
    type('부산FC 점수', '2');
    type('서울FC 승부차기', '5');
    type('부산FC 승부차기', '4');
    submit();
    expect(props.onSubmit).toHaveBeenCalledWith({ home: 2, away: 2, penalties: { home: 5, away: 4 } });
  });

  it('결선 무승부인데 승부차기를 비우면 요청 없이 안내하고 입력을 유지한다', () => {
    const props = renderForm();
    type('서울FC 점수', '0');
    type('부산FC 점수', '0');
    submit();
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('결선 경기가 무승부면 승부차기 점수를 입력해 주세요.');
    expect(screen.getByLabelText('서울FC 점수')).toHaveValue('0');
  });

  it('점수를 비우면 어느 쪽이 비었는지 안내한다', () => {
    const props = renderForm();
    type('서울FC 점수', '2');
    submit();
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('어웨이 점수를 0 이상의 정수로 입력해 주세요.');
  });

  it('정정 모드는 현재 점수를 채워 두고 제출 버튼 이름을 바꾼다', () => {
    const props = renderForm({ initial: { home: 2, away: 2, penalties: { home: 4, away: 3 } }, submitLabel: '정정 제출' });
    expect(screen.getByLabelText('서울FC 점수')).toHaveValue('2');
    expect(screen.getByLabelText('서울FC 승부차기')).toHaveValue('4');
    type('부산FC 승부차기', '5');
    submit();
    expect(props.onSubmit).toHaveBeenCalledWith({ home: 2, away: 2, penalties: { home: 4, away: 5 } });
  });
});

describe('BracketQuickResultForm — 상태', () => {
  it('요청 중에는 제출 버튼이 잠긴다', () => {
    renderForm({ pending: true });
    expect(screen.getByRole('button', { name: /점수 확정/ })).toBeDisabled();
  });

  it('서버가 거절한 이유를 입력을 지우지 않고 그대로 보여 준다', () => {
    renderForm({ errorMessage: '명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.', initial: { home: 1, away: 0 } });
    expect(screen.getByRole('alert')).toHaveTextContent('명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.');
    expect(screen.getByLabelText('서울FC 점수')).toHaveValue('1');
  });

  it('취소 버튼은 onCancel 이 있을 때만 보인다', () => {
    const onCancel = vi.fn();
    renderForm({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-quick-result-form.test.tsx`
Expected: FAIL — `Failed to resolve import "./bracket-quick-result-form"`.

- [ ] **Step 3: Implement**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-quick-result-form.tsx`

```tsx
'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/v1-ui/button';
import { needsPenalties, parseQuickScore, type QuickScoreInputs } from '@/lib/bracket-quick-score';
import type { V1QuickResultScore } from '@/types/api';

export type BracketQuickResultFormProps = {
  homeLabel: string;
  awayLabel: string;
  isKnockout: boolean;
  initial?: V1QuickResultScore;
  submitLabel: string;
  pending: boolean;
  errorMessage?: string | null;
  onSubmit: (score: V1QuickResultScore) => void;
  onCancel?: () => void;
};

function toInputs(initial: V1QuickResultScore | undefined): QuickScoreInputs {
  return {
    home: initial === undefined ? '' : String(initial.home),
    away: initial === undefined ? '' : String(initial.away),
    penaltyHome: initial?.penalties === undefined ? '' : String(initial.penalties.home),
    penaltyAway: initial?.penalties === undefined ? '' : String(initial.penalties.away),
  };
}

export function BracketQuickResultForm({
  homeLabel,
  awayLabel,
  isKnockout,
  initial,
  submitLabel,
  pending,
  errorMessage,
  onSubmit,
  onCancel,
}: BracketQuickResultFormProps) {
  const idPrefix = useId();
  const [inputs, setInputs] = useState<QuickScoreInputs>(() => toInputs(initial));
  const [validationError, setValidationError] = useState<string | null>(null);
  const showPenalties = needsPenalties(inputs, isKnockout);
  const shownError = validationError ?? errorMessage ?? null;

  const change = (key: keyof QuickScoreInputs) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null);
    setInputs((current) => ({ ...current, [key]: event.target.value }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseQuickScore(inputs, isKnockout);
    if (!parsed.ok) {
      setValidationError(parsed.error);
      return;
    }
    onSubmit(parsed.score);
  };

  const field = (key: keyof QuickScoreInputs, label: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${idPrefix}-${key}`} className="tm-text-caption truncate" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <input
        id={`${idPrefix}-${key}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={inputs[key]}
        onChange={change(key)}
        disabled={pending}
        className="tm-input tab-num"
        style={{ minHeight: 44 }}
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <div className="grid grid-cols-2 gap-3">
        {field('home', `${homeLabel} 점수`)}
        {field('away', `${awayLabel} 점수`)}
      </div>
      {showPenalties ? (
        <div className="flex flex-col gap-2">
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            정규시간이 무승부라 승부차기 점수가 필요해요.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {field('penaltyHome', `${homeLabel} 승부차기`)}
            {field('penaltyAway', `${awayLabel} 승부차기`)}
          </div>
        </div>
      ) : null}
      {shownError !== null ? (
        <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>
          {shownError}
        </p>
      ) : null}
      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="neutral" size="md" className="flex-1" onClick={onCancel} disabled={pending}>
            취소
          </Button>
        ) : null}
        <Button type="submit" variant="primary" size="md" className="flex-1" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-quick-result-form.test.tsx`
Expected: PASS (10 tests).

Run (apps/v1_web): `./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs` — 통과해야 한다.

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/components/admin/bracket-canvas/bracket-quick-result-form.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-quick-result-form.test.tsx
git commit -m "feat(web): 대진 캔버스 점수 입력 폼" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-quick-result-form.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-quick-result-form.test.tsx
git show --stat HEAD
```

### Task 11: 결과 확정·정정·무효(`BracketResultActions`)

확정된 결과(또는 확정 전 결과)가 있는 칸의 동작. **서버 API 는 전부 기존 훅**이다 — 확정 `useOfficializeResultRevision`, 정정 `useCreateResultCorrection` → 이어서 `useOfficializeResultRevision`(두 단계), 무효 `useVoidResultRevision`. 라이브 득점 기록이 있는 경기는 그림에서 고치지 않고 기존 정정 화면으로 보낸다(D6). 정정·무효는 필수 사유 모달(`tournament-result-review/reason-modal.tsx`)을 거친다.

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-result-actions.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-result-actions.test.tsx`

**Interfaces:**
- Consumes: `useGameResultRevisions`, `useCreateResultCorrection`, `useOfficializeResultRevision`, `useVoidResultRevision` (`hooks/use-tournament-result-review.ts`), `ReasonModal` (`components/tournament-result-review/reason-modal.tsx:27`), `REVISION_STATE_LABELS` (`result-review-copy.ts:68`), `useConfirm` (`components/v1-ui/confirm-modal.tsx`), `mergeCorrectionScore`/`toCorrectionParticipants` (Task 6), `describeBracketCanvasError` (Task 2), `BracketQuickResultForm` (Task 10), `formatGameResultScoreWithPenalties` (`lib/game-result-score.ts:80`)
- Produces: `BracketResultActions(props: { tournamentId: string; fixtureId: string; game: V1AdminBracketFixtureGame; isKnockout: boolean; homeLabel: string; awayLabel: string; canWrite: boolean; showToast: (message: string, variant?: 'success' | 'error') => void })` — `game.latestRevision` 이 null 이면 아무것도 그리지 않는다(빠른 입력은 패널이 맡는다)

- [ ] **Step 1: Write the failing test**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-result-actions.test.tsx`

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { makeGame } from '@/test/bracket-canvas-fixtures';
import { BracketResultActions } from './bracket-result-actions';

const mocks = vi.hoisted(() => ({
  revisions: { data: undefined as unknown, isPending: false, refetch: vi.fn() },
  createCorrection: vi.fn(),
  officialize: vi.fn(),
  voidRevision: vi.fn(),
}));

vi.mock('@/hooks/use-tournament-result-review', () => ({
  useGameResultRevisions: () => mocks.revisions,
  useCreateResultCorrection: () => ({ mutateAsync: mocks.createCorrection, isPending: false }),
  useOfficializeResultRevision: () => ({ mutateAsync: mocks.officialize, isPending: false }),
  useVoidResultRevision: () => ({ mutateAsync: mocks.voidRevision, isPending: false }),
}));

const STAMP = '2026-10-08T00:00:00.000Z';
const revision = (overrides: Record<string, unknown>) => ({
  id: 'rev-1',
  gameId: 'game-1',
  revision: 1,
  state: 'OFFICIAL',
  score: { home: 2, away: 1 },
  goalEvents: null,
  eventsHash: 'hash-empty',
  missingScorer: false,
  mvpParticipantId: null,
  reason: '[quick-result]',
  outcomeReason: 'NORMAL',
  outcomeNote: null,
  createdByActorType: 'USER',
  createdByUserId: 'admin-1',
  createdBySystemActor: null,
  supersedesId: null,
  submittedAt: STAMP,
  officialAt: STAMP,
  createdAt: STAMP,
  updatedAt: STAMP,
  resultParticipants: [
    {
      id: 'row-1',
      resultRevisionId: 'rev-1',
      participantId: 'p-1',
      sideId: 'side-home',
      started: true,
      minutesPlayed: null,
      goals: 0,
      assists: 0,
      fouls: 0,
      cards: { yellow: 0, red: 0 },
      goalkeeper: false,
      displayName: '김선수',
      jerseyNumber: 7,
    },
  ],
  ...overrides,
});

const officialGame = (overrides = {}) =>
  makeGame({
    id: 'game-1',
    state: 'ENDED',
    version: 5,
    latestRevision: { id: 'rev-1', state: 'OFFICIAL', entryMethod: 'quick', score: { home: 2, away: 1 } },
    ...overrides,
  });

function renderActions(overrides: Partial<React.ComponentProps<typeof BracketResultActions>> = {}) {
  const props = {
    tournamentId: 't-1',
    fixtureId: 'f-1',
    game: officialGame(),
    isKnockout: true,
    homeLabel: '서울FC',
    awayLabel: '부산FC',
    canWrite: true,
    showToast: vi.fn(),
    ...overrides,
  };
  render(<BracketResultActions {...props} />);
  return props;
}

function apiError(code: string) {
  return new V1ApiError({
    statusCode: 409,
    code,
    message: '서버 원문이에요.',
    details: null,
    requestId: 'req',
    timestamp: STAMP,
  } as unknown as ConstructorParameters<typeof V1ApiError>[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.revisions.data = [revision({})];
  mocks.revisions.isPending = false;
  mocks.revisions.refetch.mockResolvedValue({ data: [revision({})] });
  mocks.createCorrection.mockResolvedValue({ revisionId: 'rev-2', version: 6 });
  mocks.officialize.mockResolvedValue({});
  mocks.voidRevision.mockResolvedValue({});
});

describe('BracketResultActions — 분기', () => {
  it('확정된 결과: 현재 상태·점수와 "점수 고치기"·"결과 무효"를 보여 준다', () => {
    renderActions();
    expect(screen.getByText(/공식 확정 · 2:1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '점수 고치기' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '결과 무효' })).toBeEnabled();
  });

  it('읽기 전용 화면에는 쓰기 버튼이 없다', () => {
    renderActions({ canWrite: false });
    expect(screen.getByText(/공식 확정 · 2:1/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '점수 고치기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '결과 무효' })).not.toBeInTheDocument();
  });

  it('라이브 득점 기록이 있는 경기는 고치기·무효 대신 정정 화면 링크만 준다', () => {
    renderActions({ game: officialGame({ hasLiveRecords: true }) });
    expect(screen.getByRole('link', { name: '결과 정정 화면 열기' })).toHaveAttribute(
      'href',
      '/admin/live/t-1/records/corrections?fixtureId=f-1',
    );
    expect(screen.queryByRole('button', { name: '점수 고치기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '결과 무효' })).not.toBeInTheDocument();
  });

  it('결과를 아직 못 불러왔으면 고치기 버튼을 잠근다', () => {
    mocks.revisions.isPending = true;
    mocks.revisions.data = undefined;
    renderActions();
    expect(screen.getByRole('button', { name: '점수 고치기' })).toBeDisabled();
  });
});

describe('BracketResultActions — 점수 고치기(정정 → 확정)', () => {
  async function startCorrection(home = '3', away = '1') {
    fireEvent.click(screen.getByRole('button', { name: '점수 고치기' }));
    fireEvent.change(screen.getByLabelText('서울FC 점수'), { target: { value: home } });
    fireEvent.change(screen.getByLabelText('부산FC 점수'), { target: { value: away } });
    fireEvent.click(screen.getByRole('button', { name: '고칠 점수 확인' }));
    return screen.findByRole('dialog');
  }

  it('사유를 입력하면 정정을 만들고, 그 초안을 서버가 준 값 그대로 이어서 확정한다', async () => {
    mocks.revisions.refetch.mockResolvedValue({
      data: [revision({}), revision({ id: 'rev-2', revision: 2, state: 'DRAFT', score: { home: 3, away: 1 }, supersedesId: 'rev-1' })],
    });
    const props = renderActions();
    const dialog = await startCorrection();
    fireEvent.change(within(dialog).getByLabelText('정정 사유'), { target: { value: '점수를 잘못 넣었어요' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '정정 확정' }));

    await waitFor(() => expect(mocks.officialize).toHaveBeenCalledTimes(1));
    expect(mocks.createCorrection).toHaveBeenCalledWith({
      expectedVersion: 5,
      baseRevisionId: 'rev-1',
      reason: '점수를 잘못 넣었어요',
      changes: {
        score: { home: 3, away: 1 },
        actualParticipants: [
          { participantId: 'p-1', sideId: 'side-home', started: true, goals: 0, assists: 0, fouls: 0, cards: { yellow: 0, red: 0 }, goalkeeper: false },
        ],
        eventsHash: 'hash-empty',
      },
    });
    // 확정 요청은 정정 응답의 새 version 과, 다시 읽은 초안의 점수·해시를 쓴다.
    expect(mocks.officialize).toHaveBeenCalledWith({
      revisionId: 'rev-2',
      expectedVersion: 6,
      score: { home: 3, away: 1 },
      goalEvents: null,
      eventsHash: 'hash-empty',
      mvpParticipantId: null,
    });
    expect(mocks.createCorrection.mock.invocationCallOrder[0]).toBeLessThan(mocks.officialize.mock.invocationCallOrder[0]);
    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith('점수를 고쳤어요.', 'success'));
  });

  it('사유가 비어 있으면 정정 확정 버튼이 눌리지 않는다', async () => {
    renderActions();
    const dialog = await startCorrection();
    expect(within(dialog).getByRole('button', { name: '정정 확정' })).toBeDisabled();
    expect(mocks.createCorrection).not.toHaveBeenCalled();
  });

  it('다음 경기가 이미 시작돼 확정이 막히면 이유와 "정정 초안이 남아 있어요"를 모달 안에 보여 주고 닫지 않는다', async () => {
    mocks.revisions.refetch.mockResolvedValue({
      data: [revision({}), revision({ id: 'rev-2', revision: 2, state: 'DRAFT', score: { home: 3, away: 1 } })],
    });
    mocks.officialize.mockRejectedValue(apiError('NEXT_FIXTURE_CONFLICT'));
    const props = renderActions();
    const dialog = await startCorrection();
    fireEvent.change(within(dialog).getByLabelText('정정 사유'), { target: { value: '오입력' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '정정 확정' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('다음 경기가 이미 시작돼서 바꿀 수 없어요.');
    expect(alert).toHaveTextContent('정정 초안은 남아 있어요');
    expect(props.showToast).not.toHaveBeenCalledWith('점수를 고쳤어요.', 'success');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('정정 생성 단계에서 막히면 초안 안내 없이 서버 이유만 보여 준다', async () => {
    mocks.createCorrection.mockRejectedValue(apiError('VERSION_CONFLICT'));
    renderActions();
    const dialog = await startCorrection();
    fireEvent.change(within(dialog).getByLabelText('정정 사유'), { target: { value: '오입력' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '정정 확정' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('경기 정보가 그 사이 바뀌었어요. 화면을 새로고침해 주세요.');
    expect(alert).not.toHaveTextContent('정정 초안');
    expect(mocks.officialize).not.toHaveBeenCalled();
  });
});

describe('BracketResultActions — 결과 무효', () => {
  it('사유를 받아 현재 확정 리비전을 무효로 처리한다', async () => {
    const props = renderActions();
    fireEvent.click(screen.getByRole('button', { name: '결과 무효' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('무효 사유'), { target: { value: '다른 경기 결과였어요' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '무효로 처리' }));
    await waitFor(() =>
      expect(mocks.voidRevision).toHaveBeenCalledWith({ revisionId: 'rev-1', expectedVersion: 5, reason: '다른 경기 결과였어요' }),
    );
    await waitFor(() => expect(props.showToast).toHaveBeenCalledWith('결과를 무효로 처리했어요.', 'success'));
  });

  it('다음 경기가 이미 시작됐으면 무효가 거절되고 이유를 모달에 보여 준다', async () => {
    mocks.voidRevision.mockRejectedValue(apiError('NEXT_FIXTURE_CONFLICT'));
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: '결과 무효' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('무효 사유'), { target: { value: '사유' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '무효로 처리' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('다음 경기가 이미 시작돼서 바꿀 수 없어요.');
  });
});

describe('BracketResultActions — 확정 전 결과 확정', () => {
  const pendingGame = () =>
    makeGame({
      id: 'game-1',
      state: 'ENDED',
      version: 5,
      latestRevision: { id: 'rev-3', state: 'DRAFT', entryMethod: 'correction', score: { home: 0, away: 0 } },
    });

  it('최신 값을 다시 읽어 확인 문구와 확정 요청에 같은 값을 쓴다', async () => {
    // 화면 캐시는 0:0 이지만 서버의 최신은 4:2 — 되돌릴 수 없는 확정에서 낡은 값을 보여 주면 안 된다.
    mocks.revisions.data = [revision({ id: 'rev-3', state: 'DRAFT', score: { home: 0, away: 0 } })];
    mocks.revisions.refetch.mockResolvedValue({ data: [revision({ id: 'rev-3', state: 'DRAFT', score: { home: 4, away: 2 } })] });
    renderActions({ game: pendingGame() });
    expect(screen.queryByRole('button', { name: '점수 고치기' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '결과 확정' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('4:2 결과를 공식 결과로 확정해요');
    fireEvent.click(within(dialog).getByRole('button', { name: '확정' }));

    await waitFor(() => expect(mocks.officialize).toHaveBeenCalledTimes(1));
    expect(mocks.officialize).toHaveBeenCalledWith({
      revisionId: 'rev-3',
      expectedVersion: 5,
      score: { home: 4, away: 2 },
      goalEvents: null,
      eventsHash: 'hash-empty',
      mvpParticipantId: null,
    });
  });

  it('확인 모달에서 취소하면 확정 요청을 보내지 않는다', async () => {
    mocks.revisions.refetch.mockResolvedValue({ data: [revision({ id: 'rev-3', state: 'DRAFT' })] });
    renderActions({ game: pendingGame() });
    fireEvent.click(screen.getByRole('button', { name: '결과 확정' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.officialize).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-result-actions.test.tsx`
Expected: FAIL — `Failed to resolve import "./bracket-result-actions"`.

- [ ] **Step 3: Implement**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-result-actions.tsx`

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { ReasonModal } from '@/components/tournament-result-review/reason-modal';
import { REVISION_STATE_LABELS } from '@/components/tournament-result-review/result-review-copy';
import {
  useCreateResultCorrection,
  useGameResultRevisions,
  useOfficializeResultRevision,
  useVoidResultRevision,
} from '@/hooks/use-tournament-result-review';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { mergeCorrectionScore, toCorrectionParticipants } from '@/lib/bracket-quick-score';
import { formatGameResultScoreWithPenalties } from '@/lib/game-result-score';
import type { V1AdminBracketFixtureGame, V1QuickResultScore } from '@/types/api';
import { BracketQuickResultForm } from './bracket-quick-result-form';

export type BracketResultActionsProps = {
  tournamentId: string;
  fixtureId: string;
  game: V1AdminBracketFixtureGame;
  isKnockout: boolean;
  homeLabel: string;
  awayLabel: string;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
};

type Step = 'idle' | 'form' | 'reason' | 'void';

export function BracketResultActions({
  tournamentId,
  fixtureId,
  game,
  isKnockout,
  homeLabel,
  awayLabel,
  canWrite,
  showToast,
}: BracketResultActionsProps) {
  const revisionsQuery = useGameResultRevisions(game.id);
  const createCorrection = useCreateResultCorrection(game.id, tournamentId);
  const officialize = useOfficializeResultRevision(game.id, tournamentId);
  const voidRevision = useVoidResultRevision(game.id, tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const [step, setStep] = useState<Step>('idle');
  const [draftScore, setDraftScore] = useState<V1QuickResultScore | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const latest = game.latestRevision;
  if (latest === null) return null;

  const correctionsHref = `/admin/live/${encodeURIComponent(tournamentId)}/records/corrections?fixtureId=${encodeURIComponent(fixtureId)}`;
  const isOfficial = latest.state === 'OFFICIAL';
  const summary = `${REVISION_STATE_LABELS[latest.state]} · ${formatGameResultScoreWithPenalties(latest.score)}`;

  const runCorrection = async (score: V1QuickResultScore, reason: string) => {
    const base = revisionsQuery.data?.find((candidate) => candidate.id === latest.id);
    if (base === undefined) {
      setModalError('결과 정보를 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.');
      return;
    }
    setBusy(true);
    setModalError(null);
    let created: Awaited<ReturnType<typeof createCorrection.mutateAsync>>;
    try {
      created = await createCorrection.mutateAsync({
        expectedVersion: game.version,
        baseRevisionId: base.id,
        reason,
        changes: {
          score: mergeCorrectionScore(base.score, score),
          actualParticipants: toCorrectionParticipants(base.resultParticipants),
          eventsHash: base.eventsHash,
          ...(base.mvpParticipantId === null ? {} : { mvpParticipantId: base.mvpParticipantId }),
        },
      });
    } catch (error) {
      setModalError(describeBracketCanvasError(error, '점수를 고치지 못했어요.'));
      setBusy(false);
      return;
    }
    try {
      // 확정 해시는 서버가 저장한 초안 그대로여야 한다 — 방금 입력한 값이 아니라 다시 읽은 값을 쓴다.
      const fresh = await revisionsQuery.refetch();
      const draft = fresh.data?.find((candidate) => candidate.id === created.revisionId);
      if (draft === undefined) throw new Error('draft revision missing');
      await officialize.mutateAsync({
        revisionId: draft.id,
        expectedVersion: created.version,
        score: draft.score,
        goalEvents: draft.goalEvents,
        eventsHash: draft.eventsHash,
        mvpParticipantId: draft.mvpParticipantId,
      });
      setStep('idle');
      showToast('점수를 고쳤어요.', 'success');
    } catch (error) {
      setModalError(`${describeBracketCanvasError(error, '정정을 확정하지 못했어요.')} 정정 초안은 남아 있어요. 칸의 "결과 확정"이나 결과 정정 화면에서 이어서 처리해 주세요.`);
    } finally {
      setBusy(false);
    }
  };

  const runVoid = async (reason: string) => {
    setBusy(true);
    setModalError(null);
    try {
      await voidRevision.mutateAsync({ revisionId: latest.id, expectedVersion: game.version, reason });
      setStep('idle');
      showToast('결과를 무효로 처리했어요.', 'success');
    } catch (error) {
      setModalError(describeBracketCanvasError(error, '결과를 무효로 처리하지 못했어요.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmPending = async () => {
    // 되돌릴 수 없는 확정이라 캐시를 믿지 않고 다시 읽은 값을 확인 문구와 요청에 함께 쓴다.
    const fresh = await revisionsQuery.refetch();
    const revision = fresh.data?.find((candidate) => candidate.id === latest.id);
    if (revision === undefined) {
      showToast('결과 정보를 찾지 못했어요. 화면을 새로고침해 주세요.', 'error');
      return;
    }
    const ok = await confirm({
      title: '결과를 확정할까요?',
      message: `${formatGameResultScoreWithPenalties(revision.score)} 결과를 공식 결과로 확정해요. 확정 후에는 정정 절차로만 바꿀 수 있어요.`,
      confirmLabel: '확정',
    });
    if (!ok) return;
    try {
      await officialize.mutateAsync({
        revisionId: revision.id,
        expectedVersion: game.version,
        score: revision.score,
        goalEvents: revision.goalEvents,
        eventsHash: revision.eventsHash,
        mvpParticipantId: revision.mvpParticipantId,
      });
      showToast('결과를 확정했어요.', 'success');
    } catch (error) {
      showToast(describeBracketCanvasError(error, '결과를 확정하지 못했어요.'), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>
        {summary}
      </p>

      {game.hasLiveRecords ? (
        <>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            라이브로 득점이 기록된 경기예요. 결과 정정 화면에서 고쳐 주세요.
          </p>
          <Link href={correctionsHref} className="tm-btn tm-btn-sm tm-btn-outline self-start">
            결과 정정 화면 열기
          </Link>
        </>
      ) : null}

      {!game.hasLiveRecords && canWrite && step === 'idle' ? (
        isOfficial ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="md" disabled={revisionsQuery.isPending} onClick={() => setStep('form')}>
              점수 고치기
            </Button>
            <Button variant="outline" size="md" style={{ color: 'var(--red700)' }} onClick={() => { setModalError(null); setStep('void'); }}>
              결과 무효
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <Button variant="primary" size="md" loading={officialize.isPending} onClick={() => void confirmPending()}>
              결과 확정
            </Button>
            <Link href={correctionsHref} className="tm-text-caption underline" style={{ color: 'var(--text-muted)' }}>
              결과 정정 화면에서 정리하기
            </Link>
          </div>
        )
      ) : null}

      {canWrite && (step === 'form' || step === 'reason') ? (
        <BracketQuickResultForm
          homeLabel={homeLabel}
          awayLabel={awayLabel}
          isKnockout={isKnockout}
          initial={latest.score ?? undefined}
          submitLabel="고칠 점수 확인"
          pending={false}
          onSubmit={(score) => {
            setDraftScore(score);
            setModalError(null);
            setStep('reason');
          }}
          onCancel={() => setStep('idle')}
        />
      ) : null}

      <ReasonModal
        open={step === 'reason'}
        title="점수를 고칠까요?"
        message={`${draftScore === null ? '' : formatGameResultScoreWithPenalties(draftScore)}로 고쳐요. 사유를 남겨 주세요.`}
        reasonLabel="정정 사유"
        confirmLabel="정정 확정"
        submitting={busy}
        errorMessage={modalError}
        onCancel={() => setStep('form')}
        onConfirm={(reason) => draftScore !== null && void runCorrection(draftScore, reason)}
      />
      <ReasonModal
        open={step === 'void'}
        title="결과를 무효로 처리할까요?"
        message="무효로 처리하면 이 경기의 공식 점수와 기록이 취소돼요. 사유를 남겨 주세요."
        reasonLabel="무효 사유"
        confirmLabel="무효로 처리"
        tone="danger"
        submitting={busy}
        errorMessage={modalError}
        onCancel={() => setStep('idle')}
        onConfirm={(reason) => void runVoid(reason)}
      />
      {ConfirmModal}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-result-actions.test.tsx`
Expected: PASS (12 tests).

Run (apps/v1_web): `./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs` — 통과해야 한다.
(`formatGameResultScoreWithPenalties(draftScore)` 의 인자 타입 오류가 나면 `draftScore` 를 `V1GameResultScore` 로 넘기는 자리에서 평평한 형태와 맞는지 확인한다 — `V1QuickResultScore` 는 평평한 형태의 부분집합이라 통과한다.)

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/components/admin/bracket-canvas/bracket-result-actions.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-result-actions.test.tsx
git commit -m "feat(web): 대진 캔버스 결과 확정·정정·무효 동작" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-result-actions.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-result-actions.test.tsx
git show --stat HEAD
```

### Task 12: 칸 상세 패널(`BracketNodePanel`)

칸을 누르면 열리는 패널. 자리 배정 선택(키보드·화면 낭독 경로), 일정/장소 수정(기존 `useV1UpdateFixture`), 삭제(기존 `useV1DeleteFixture`), 결과 구역(빠른 입력 폼 또는 Task 11 동작)을 담는다. 결과 구역의 분기는 서버 입장 조건(S5)을 화면에서 미리 안내하는 것이고, 최종 판정은 서버가 한다.

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-node-panel.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-node-panel.test.tsx`

**Interfaces:**
- Consumes: `useV1AssignTournamentSlot`, `useV1QuickResult` (Task 3), `useV1UpdateFixture`, `useV1DeleteFixture` (`hooks/use-v1-api.ts:4991,5009`), `fixtureTitle` (Task 8), `isFixtureLocked`, `isSlotAssignable`, `fixtureNodeState` (Task 4), `BracketResultActions` (Task 11), `BracketQuickResultForm` (Task 10), `kstDatetimeLocalToIso`/`isoToKstDatetimeLocal` (`lib/kst-calendar.ts:36,44`), `describeBracketCanvasError` (Task 2)
- Produces: `BracketNodePanel(props: { tournamentId: string; fixture: V1AdminBracketFixture; groups: V1AdminBracketGroup[]; slots: V1AdminBracketSlot[]; registrations: V1AdminTournamentRegistration[]; sideLabels: Record<SideKey, string>; canWrite: boolean; showToast: (message: string, variant?: 'success' | 'error') => void; onClose: () => void })` — 부모는 `key={fixture.id}` 로 칸이 바뀔 때 입력 상태를 비운다.

- [ ] **Step 1: Write the failing test**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-node-panel.test.tsx`

```tsx
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { makeFixture, makeGame, makeGroup, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixture } from '@/types/api';
import { BracketNodePanel } from './bracket-node-panel';

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  quick: vi.fn(),
  updateFixture: vi.fn(),
  deleteFixture: vi.fn(),
}));

vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutate: mocks.assign, isPending: false }),
  useV1QuickResult: () => ({ mutate: mocks.quick, isPending: false }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1UpdateFixture: () => ({ mutate: mocks.updateFixture, isPending: false }),
  useV1DeleteFixture: () => ({ mutate: mocks.deleteFixture, isPending: false }),
}));
// 정정·무효·확정은 Task 11 이 따로 검증한다 — 여기서는 어떤 게임으로 불리는지만 본다.
vi.mock('./bracket-result-actions', () => ({
  BracketResultActions: (props: { game: { id: string } }) => <div data-testid="result-actions">{props.game.id}</div>,
}));

const knockout = makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' });
const groupStage = makeGroup({ id: 'g-a', name: 'A조', phase: 'group' });
const slots = [
  makeSlot({ id: 's-home', label: '1번 자리', registrationId: 'r1', teamName: '서울FC' }),
  makeSlot({ id: 's-away', label: '2번 자리' }),
  makeSlot({ id: 's-other', label: '3번 자리', registrationId: 'r2', teamName: '부산FC' }),
];
const registrations = [
  makeRegistration({ id: 'r1', teamName: '서울FC' }),
  makeRegistration({ id: 'r2', teamName: '부산FC' }),
  makeRegistration({ id: 'r3', teamName: '대구FC' }),
];

const fixtureOf = (overrides: Partial<V1AdminBracketFixture> = {}) =>
  makeFixture({
    id: 'f1',
    groupId: 'g-qf',
    fixtureNumber: 1,
    round: '8강',
    homeSlotId: 's-home',
    awaySlotId: 's-away',
    homeRegistrationId: 'r1',
    homeTeamName: '서울FC',
    game: makeGame({ id: 'game-1', version: 3 }),
    ...overrides,
  });

function renderPanel(fixture = fixtureOf(), overrides: Partial<React.ComponentProps<typeof BracketNodePanel>> = {}) {
  const props = {
    tournamentId: 't-1',
    fixture,
    groups: [knockout, groupStage],
    slots,
    registrations,
    sideLabels: {
      HOME: fixture.homeRegistrationId === null ? '1번 자리' : fixture.homeTeamName,
      AWAY: fixture.awayRegistrationId === null ? '2번 자리' : fixture.awayTeamName,
    },
    canWrite: true,
    showToast: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<BracketNodePanel {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BracketNodePanel — 자리 배정', () => {
  it('다른 자리에 이미 들어간 팀은 고르지 못하고, 현재 자리의 팀과 비워 두기는 고를 수 있다', () => {
    renderPanel();
    const homeSelect = screen.getByLabelText('홈 팀 선택');
    expect(within(homeSelect).getAllByRole('option').map((option) => option.textContent)).toEqual(['비워 두기', '서울FC', '대구FC']);
    expect(homeSelect).toHaveValue('r1');
    // 어웨이 자리는 비어 있으니 서울FC(홈)·부산FC(3번 자리)는 빠지고 대구FC 만 남는다.
    expect(within(screen.getByLabelText('어웨이 팀 선택')).getAllByRole('option').map((option) => option.textContent)).toEqual(['비워 두기', '대구FC']);
  });

  it('팀을 고르면 그 자리에 배정하고, 비워 두기는 null 로 보낸다', () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText('어웨이 팀 선택'), { target: { value: 'r3' } });
    expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's-away', registrationId: 'r3' }, expect.any(Object));
    fireEvent.change(screen.getByLabelText('홈 팀 선택'), { target: { value: '' } });
    expect(mocks.assign).toHaveBeenLastCalledWith({ slotId: 's-home', registrationId: null }, expect.any(Object));

    mocks.assign.mock.calls[0][1].onSuccess();
    expect(props.showToast).toHaveBeenCalledWith('팀을 넣었어요.', 'success');
    mocks.assign.mock.calls[1][1].onSuccess();
    expect(props.showToast).toHaveBeenCalledWith('자리를 비웠어요.', 'success');
  });

  it('서버가 거절하면 해요체 안내를 토스트로 보여 준다', () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText('어웨이 팀 선택'), { target: { value: 'r3' } });
    mocks.assign.mock.calls[0][1].onError(
      new V1ApiError({ statusCode: 409, code: 'SLOT_TEAM_ALREADY_PLACED', message: 'x', details: null, requestId: 'r', timestamp: 't' } as unknown as ConstructorParameters<typeof V1ApiError>[0]),
    );
    expect(props.showToast).toHaveBeenCalledWith('이미 다른 자리에 들어간 팀이에요.', 'error');
  });

  it('시작된 칸은 선택창 대신 이유를 보여 준다', () => {
    renderPanel(fixtureOf({ game: makeGame({ state: 'LIVE' }) }));
    expect(screen.queryByLabelText('홈 팀 선택')).not.toBeInTheDocument();
    expect(screen.getAllByText('경기가 시작됐거나 결과가 있어 팀을 바꿀 수 없어요.')).toHaveLength(2);
  });

  it('자리가 없는 줄은 연결 결과로 채워진다고 알린다', () => {
    renderPanel(fixtureOf({ awaySlotId: null }));
    expect(screen.queryByLabelText('어웨이 팀 선택')).not.toBeInTheDocument();
    expect(screen.getByText('이전 경기 결과로 채워져요.')).toBeInTheDocument();
  });

  it('읽기 전용이면 선택창·저장·삭제·점수 입력이 모두 없다', () => {
    renderPanel(fixtureOf({ awayRegistrationId: 'r3', awayTeamName: '대구FC' }), { canWrite: false });
    expect(screen.queryByLabelText('홈 팀 선택')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '일정 저장' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '경기 삭제' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '점수 확정' })).not.toBeInTheDocument();
  });
});

describe('BracketNodePanel — 일정·삭제', () => {
  it('KST 로 입력한 시각을 UTC ISO 로 바꿔 저장한다', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('경기 시각'), { target: { value: '2026-10-10T14:00' } });
    fireEvent.change(screen.getByLabelText('장소'), { target: { value: ' 상암 보조구장 ' } });
    fireEvent.click(screen.getByRole('button', { name: '일정 저장' }));
    expect(mocks.updateFixture).toHaveBeenCalledWith(
      { fixtureId: 'f1', scheduledAt: '2026-10-10T05:00:00.000Z', venue: '상암 보조구장' },
      expect.any(Object),
    );
  });

  it('삭제는 확인을 거치고, 성공하면 패널을 닫는다', async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '경기 삭제' }));
    const dialog = await screen.findByRole('dialog');
    expect(mocks.deleteFixture).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    await vi.waitFor(() => expect(mocks.deleteFixture).toHaveBeenCalledWith('f1', expect.any(Object)));
    mocks.deleteFixture.mock.calls[0][1].onSuccess();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('닫기 버튼은 onClose 를 부른다', () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '패널 닫기' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('BracketNodePanel — 결과 구역', () => {
  const readyFixture = (overrides: Partial<V1AdminBracketFixture> = {}) =>
    fixtureOf({ awayRegistrationId: 'r3', awayTeamName: '대구FC', ...overrides });

  it('양쪽 팀이 정해진 예정 경기는 점수 입력 폼을 보여 주고 빠른 결과로 보낸다', () => {
    renderPanel(readyFixture());
    fireEvent.change(screen.getByLabelText('서울FC 점수'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('대구FC 점수'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '점수 확정' }));
    expect(mocks.quick).toHaveBeenCalledWith({ gameId: 'game-1', expectedVersion: 3, score: { home: 2, away: 1 } }, expect.any(Object));
  });

  it('서버가 명단 동기화 중이라고 하면 입력을 둔 채 안내를 폼 안에 보여 준다', () => {
    renderPanel(readyFixture());
    fireEvent.change(screen.getByLabelText('서울FC 점수'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('대구FC 점수'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '점수 확정' }));
    act(() => {
      mocks.quick.mock.calls[0][1].onError(
        new V1ApiError({ statusCode: 409, code: 'QUICK_RESULT_ROSTER_SYNCING', message: 'x', details: null, requestId: 'r', timestamp: 't' } as unknown as ConstructorParameters<typeof V1ApiError>[0]),
      );
    });
    expect(screen.getByRole('alert')).toHaveTextContent('명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.');
    expect(screen.getByLabelText('서울FC 점수')).toHaveValue('2');
  });

  it('결선 경기 무승부에는 승부차기 입력란이 나온다', () => {
    renderPanel(readyFixture());
    fireEvent.change(screen.getByLabelText('서울FC 점수'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('대구FC 점수'), { target: { value: '1' } });
    expect(screen.getByLabelText('서울FC 승부차기')).toBeInTheDocument();
  });

  it('조별 경기는 무승부여도 승부차기 입력란이 없다', () => {
    renderPanel(readyFixture({ groupId: 'g-a' }));
    fireEvent.change(screen.getByLabelText('서울FC 점수'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('대구FC 점수'), { target: { value: '1' } });
    expect(screen.queryByLabelText('서울FC 승부차기')).not.toBeInTheDocument();
  });

  it('한쪽 팀이 비어 있으면 폼 대신 이유를 보여 준다', () => {
    renderPanel(fixtureOf());
    expect(screen.getByText('양쪽 팀이 정해지면 점수를 넣을 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '점수 확정' })).not.toBeInTheDocument();
  });

  it('진행 중인 경기는 라이브 콘솔에서 입력하라고 안내한다', () => {
    renderPanel(readyFixture({ game: makeGame({ state: 'LIVE' }) }));
    expect(screen.getByText('진행 중인 경기는 라이브 콘솔에서 입력해요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '점수 확정' })).not.toBeInTheDocument();
  });

  it('라이브 득점 기록이 있고 결과가 없으면 정정 화면 링크를 준다', () => {
    renderPanel(readyFixture({ game: makeGame({ id: 'game-1', state: 'ENDED', hasLiveRecords: true }) }));
    expect(screen.getByRole('link', { name: '결과 정정 화면 열기' })).toHaveAttribute('href', '/admin/live/t-1/records/corrections?fixtureId=f1');
    expect(screen.queryByRole('button', { name: '점수 확정' })).not.toBeInTheDocument();
  });

  it('결과가 있으면 폼 대신 확정·정정·무효 동작을 보여 준다', () => {
    renderPanel(
      readyFixture({
        game: makeGame({ id: 'game-1', state: 'ENDED', latestRevision: { id: 'rev', state: 'OFFICIAL', entryMethod: 'quick', score: { home: 1, away: 0 } } }),
      }),
    );
    expect(screen.getByTestId('result-actions')).toHaveTextContent('game-1');
    expect(screen.queryByRole('button', { name: '점수 확정' })).not.toBeInTheDocument();
  });

  it('무효 처리된 결과는 다시 입력할 수 있게 폼을 연다', () => {
    renderPanel(
      readyFixture({
        game: makeGame({ id: 'game-1', state: 'ENDED', latestRevision: { id: 'rev', state: 'VOID', entryMethod: 'quick', score: { home: 1, away: 0 } } }),
      }),
    );
    expect(screen.getByText('무효 처리된 결과예요. 점수를 다시 넣을 수 있어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '점수 확정' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-node-panel.test.tsx`
Expected: FAIL — `Failed to resolve import "./bracket-node-panel"`.

- [ ] **Step 3: Implement**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-node-panel.tsx`

```tsx
'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useV1DeleteFixture, useV1UpdateFixture } from '@/hooks/use-v1-api';
import { useV1AssignTournamentSlot, useV1QuickResult } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { isFixtureLocked, isSlotAssignable, type SideKey } from '@/lib/bracket-canvas-layout';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import type {
  V1AdminBracketFixture,
  V1AdminBracketGroup,
  V1AdminBracketSlot,
  V1AdminTournamentRegistration,
} from '@/types/api';
import { fixtureTitle } from './bracket-canvas';
import { BracketQuickResultForm } from './bracket-quick-result-form';
import { BracketResultActions } from './bracket-result-actions';

export type BracketNodePanelProps = {
  tournamentId: string;
  fixture: V1AdminBracketFixture;
  groups: V1AdminBracketGroup[];
  slots: V1AdminBracketSlot[];
  registrations: V1AdminTournamentRegistration[];
  sideLabels: Record<SideKey, string>;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onClose: () => void;
};

const SIDE_NAME: Record<SideKey, string> = { HOME: '홈', AWAY: '어웨이' };

export function BracketNodePanel({
  tournamentId,
  fixture,
  groups,
  slots,
  registrations,
  sideLabels,
  canWrite,
  showToast,
  onClose,
}: BracketNodePanelProps) {
  const assignSlot = useV1AssignTournamentSlot(tournamentId, 'tournament');
  const quickResult = useV1QuickResult(tournamentId, 'tournament');
  const updateFixture = useV1UpdateFixture(tournamentId);
  const deleteFixture = useV1DeleteFixture(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const [scheduledAt, setScheduledAt] = useState(() => isoToKstDatetimeLocal(fixture.scheduledAt));
  const [venue, setVenue] = useState(fixture.venue ?? '');
  const [quickError, setQuickError] = useState<string | null>(null);

  const title = fixtureTitle(fixture, groups);
  const locked = isFixtureLocked(fixture);
  const group = groups.find((candidate) => candidate.id === fixture.groupId);
  const isKnockout = group !== undefined && group.phase !== 'group';
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const confirmed = registrations.filter((registration) => registration.status === 'confirmed');
  const placedIds = new Set(slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map((slot) => slot.registrationId));
  const game = fixture.game;

  const handleAssign = (slot: V1AdminBracketSlot, registrationId: string) => {
    assignSlot.mutate(
      { slotId: slot.id, registrationId: registrationId === '' ? null : registrationId },
      {
        onSuccess: () => showToast(registrationId === '' ? '자리를 비웠어요.' : '팀을 넣었어요.', 'success'),
        onError: (error) => showToast(describeBracketCanvasError(error, '팀을 넣지 못했어요.'), 'error'),
      },
    );
  };

  const renderSide = (side: SideKey) => {
    const slotId = side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId;
    const slot = slotId === null ? undefined : slotsById.get(slotId);
    let body: React.ReactNode;
    if (slot === undefined) {
      body = <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>이전 경기 결과로 채워져요.</p>;
    } else if (!isSlotAssignable(slot)) {
      body = <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>조 순위가 나오면 채워져요.</p>;
    } else if (locked) {
      body = <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>경기가 시작됐거나 결과가 있어 팀을 바꿀 수 없어요.</p>;
    } else if (!canWrite) {
      body = null;
    } else {
      const options = confirmed.filter((registration) => !placedIds.has(registration.id) || registration.id === slot.registrationId);
      body = (
        <select
          aria-label={`${SIDE_NAME[side]} 팀 선택`}
          value={slot.registrationId ?? ''}
          disabled={assignSlot.isPending}
          onChange={(event) => handleAssign(slot, event.target.value)}
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
      <div key={side} className="flex flex-col gap-1">
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{`${SIDE_NAME[side]} · ${sideLabels[side]}`}</p>
        {body}
      </div>
    );
  };

  const handleSaveSchedule = (event: FormEvent) => {
    event.preventDefault();
    const iso = scheduledAt === '' ? null : kstDatetimeLocalToIso(scheduledAt);
    if (scheduledAt !== '' && iso === null) {
      showToast('경기 시각을 다시 확인해 주세요.', 'error');
      return;
    }
    updateFixture.mutate(
      { fixtureId: fixture.id, ...(iso === null ? {} : { scheduledAt: iso }), venue: venue.trim() },
      {
        onSuccess: () => showToast('일정을 저장했어요.', 'success'),
        onError: (error) => showToast(describeBracketCanvasError(error, '일정을 저장하지 못했어요.'), 'error'),
      },
    );
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: '경기 삭제',
      message: `${title}를 삭제할까요? 되돌릴 수 없어요.`,
      confirmLabel: '삭제',
      tone: 'danger',
    });
    if (!ok) return;
    deleteFixture.mutate(fixture.id, {
      onSuccess: () => {
        showToast('경기를 삭제했어요.', 'success');
        onClose();
      },
      onError: (error) => showToast(describeBracketCanvasError(error, '경기를 삭제하지 못했어요.'), 'error'),
    });
  };

  const correctionsHref = `/admin/live/${encodeURIComponent(tournamentId)}/records/corrections?fixtureId=${encodeURIComponent(fixture.id)}`;

  const renderResult = () => {
    if (game === null) return <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>경기 정보가 아직 준비되지 않았어요.</p>;
    if (game.state === 'CANCELLED') return <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>취소된 경기예요.</p>;
    if (game.state === 'LIVE' || game.state === 'PAUSED') {
      return <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>진행 중인 경기는 라이브 콘솔에서 입력해요.</p>;
    }
    const revision = game.latestRevision;
    if (revision !== null && revision.state !== 'VOID') {
      return (
        <BracketResultActions
          tournamentId={tournamentId}
          fixtureId={fixture.id}
          game={game}
          isKnockout={isKnockout}
          homeLabel={sideLabels.HOME}
          awayLabel={sideLabels.AWAY}
          canWrite={canWrite}
          showToast={showToast}
        />
      );
    }
    if (game.hasLiveRecords) {
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>라이브로 득점이 기록된 경기예요. 결과 정정 화면에서 처리해 주세요.</p>
          <Link href={correctionsHref} className="tm-btn tm-btn-sm tm-btn-outline">결과 정정 화면 열기</Link>
        </div>
      );
    }
    if (fixture.homeRegistrationId === null || fixture.awayRegistrationId === null) {
      return <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>양쪽 팀이 정해지면 점수를 넣을 수 있어요.</p>;
    }
    if (!canWrite) return null;
    return (
      <div className="flex flex-col gap-2">
        {revision !== null ? (
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>무효 처리된 결과예요. 점수를 다시 넣을 수 있어요.</p>
        ) : null}
        <BracketQuickResultForm
          homeLabel={sideLabels.HOME}
          awayLabel={sideLabels.AWAY}
          isKnockout={isKnockout}
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
      aria-label="칸 상세"
      className="flex flex-col gap-5 p-4"
      style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="tm-text-body-lg min-w-0 truncate font-bold" style={{ color: 'var(--text-strong)' }}>{title}</h2>
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
        {renderSide('HOME')}
        {renderSide('AWAY')}
      </section>

      <section aria-label="결과" className="flex flex-col gap-3">
        <h3 className={sectionTitle} style={{ color: 'var(--text-strong)' }}>결과</h3>
        {renderResult()}
      </section>

      <section aria-label="일정과 장소" className="flex flex-col gap-3">
        <h3 className={sectionTitle} style={{ color: 'var(--text-strong)' }}>일정과 장소</h3>
        {canWrite ? (
          <form onSubmit={handleSaveSchedule} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${fixture.id}-scheduled`} className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>경기 시각</label>
              <input id={`${fixture.id}-scheduled`} type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="tm-input" style={{ minHeight: 44 }} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${fixture.id}-venue`} className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>장소</label>
              <input id={`${fixture.id}-venue`} type="text" value={venue} onChange={(event) => setVenue(event.target.value)} className="tm-input" style={{ minHeight: 44 }} />
            </div>
            <Button type="submit" variant="outline" size="md" loading={updateFixture.isPending}>일정 저장</Button>
          </form>
        ) : (
          <p className="tm-text-label" style={{ color: 'var(--text-body)' }}>
            {`${fixture.scheduledAt === null ? '시간 미정' : isoToKstDatetimeLocal(fixture.scheduledAt).replace('T', ' ')} · ${fixture.venue ?? '장소 미정'}`}
          </p>
        )}
      </section>

      {canWrite ? (
        <Button type="button" variant="outline" size="md" className="self-start" style={{ color: 'var(--red700)' }} onClick={() => void handleDelete()}>
          경기 삭제
        </Button>
      ) : null}
      {ConfirmModal}
    </aside>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-node-panel.test.tsx`
Expected: PASS (18 tests).

Run (apps/v1_web): `./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs` — 통과해야 한다.

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/components/admin/bracket-canvas/bracket-node-panel.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-node-panel.test.tsx
git commit -m "feat(web): 대진 캔버스 칸 상세 패널" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-node-panel.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-node-panel.test.tsx
git show --stat HEAD
```

### Task 13: 템플릿 대화상자(`BracketTemplateDialog`)

토너먼트(4/8/12/16팀 + 3·4위전)와 리그 방식 대회(팀 수 3~20 + 회전 수)의 뼈대를 한 번에 만든다. 만들기 전에 경기·자리·연결 수를 미리 보여 주고, 240경기를 넘으면 막는다. 이미 대진이 있으면 `replaceExisting` 을 보내기 전에 `useConfirm` 으로 한 번 더 묻는다. 조별+결선(`group_knockout`)은 PR-4 가 이 대화상자를 확장하므로 이 PR 의 `format` prop 은 `'knockout' | 'league'` 만 받고, 워크스페이스(Task 15)가 조별+결선에서는 이 대화상자를 열지 않는다.

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.test.tsx`

**Interfaces:**
- Consumes: `useV1ApplyBracketTemplate` (Task 3), `planBracketTemplateCounts`/`exceedsFixtureLimit`/`BRACKET_TEMPLATE_MAX_FIXTURES` (Task 5), `describeBracketCanvasError` (Task 2), `useModalA11y` (`components/v1-ui/use-modal-a11y.ts`), `useConfirm`
- Produces: `BracketTemplateDialog(props: { open: boolean; tournamentId: string; format: 'knockout' | 'league'; hasExistingBracket: boolean; onClose: () => void; showToast: (message: string, variant?: 'success' | 'error') => void })`

- [ ] **Step 1: Write the failing test**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.test.tsx`

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { BracketTemplateDialog } from './bracket-template-dialog';

const mocks = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1ApplyBracketTemplate: () => ({ mutate: mocks.apply, isPending: false }),
}));

function renderDialog(overrides: Partial<React.ComponentProps<typeof BracketTemplateDialog>> = {}) {
  const props = {
    open: true,
    tournamentId: 't-1',
    format: 'knockout' as const,
    hasExistingBracket: false,
    onClose: vi.fn(),
    showToast: vi.fn(),
    ...overrides,
  };
  render(<BracketTemplateDialog {...props} />);
  return props;
}

const create = () => fireEvent.click(screen.getByRole('button', { name: '대진 만들기' }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BracketTemplateDialog — 토너먼트', () => {
  it('8팀 + 3·4위전이 기본이고 만들어질 개수를 미리 보여 준다', () => {
    renderDialog();
    expect(screen.getByLabelText('8팀')).toBeChecked();
    expect(screen.getByLabelText('3·4위전도 만들기')).toBeChecked();
    expect(screen.getByText('경기 8개 · 자리 8개 · 연결 8개')).toBeInTheDocument();
  });

  it('팀 수와 3·4위전 선택에 따라 미리보기가 바뀐다', () => {
    renderDialog();
    fireEvent.click(screen.getByLabelText('12팀'));
    expect(screen.getByText('경기 12개 · 자리 12개 · 연결 12개')).toBeInTheDocument();
    expect(screen.getByText(/4팀은 부전승으로 8강에 올라가요/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    expect(screen.getByText('경기 11개 · 자리 12개 · 연결 10개')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('4팀'));
    expect(screen.getByText('경기 3개 · 자리 4개 · 연결 2개')).toBeInTheDocument();
  });

  it('16팀은 부전승 안내 없이 경기 16개(3·4위전 없으면 15개)를 미리 보여 준다', () => {
    renderDialog();
    fireEvent.click(screen.getByLabelText('16팀'));
    expect(screen.getByText('경기 16개 · 자리 16개 · 연결 16개')).toBeInTheDocument();
    expect(screen.queryByText(/부전승/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    expect(screen.getByText('경기 15개 · 자리 16개 · 연결 14개')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    create();
    expect(mocks.apply).toHaveBeenCalledWith({ kind: 'knockout', size: 16, thirdPlace: true }, expect.any(Object));
  });

  it('대진이 비어 있으면 replaceExisting 없이 만들고, 성공하면 개수를 알리고 닫는다', () => {
    const props = renderDialog();
    create();
    expect(mocks.apply).toHaveBeenCalledWith({ kind: 'knockout', size: 8, thirdPlace: true }, expect.any(Object));
    mocks.apply.mock.calls[0][1].onSuccess({ groups: 4, slots: 8, fixtures: 8, edges: 8 });
    expect(props.showToast).toHaveBeenCalledWith('경기 8개와 자리 8개를 만들었어요.', 'success');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('서버가 거절하면 이유를 토스트로 알리고 대화상자는 닫지 않는다', () => {
    const props = renderDialog();
    create();
    mocks.apply.mock.calls[0][1].onError(
      new V1ApiError({ statusCode: 409, code: 'BRACKET_LOCKED', message: 'x', details: null, requestId: 'r', timestamp: 't' } as unknown as ConstructorParameters<typeof V1ApiError>[0]),
    );
    expect(props.showToast).toHaveBeenCalledWith('시작했거나 결과가 있는 경기가 있어 대진을 교체할 수 없어요.', 'error');
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe('BracketTemplateDialog — 기존 대진 교체', () => {
  it('확인에서 교체를 누르면 replaceExisting: true 로 만든다', async () => {
    renderDialog({ hasExistingBracket: true });
    expect(screen.getByText(/기존 대진이 모두 지워지고 새로 만들어져요/)).toBeInTheDocument();
    create();
    const confirmDialog = await screen.findByRole('dialog', { name: '기존 대진 교체' });
    expect(mocks.apply).not.toHaveBeenCalled();
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '교체' }));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply).toHaveBeenCalledWith({ kind: 'knockout', size: 8, thirdPlace: true, replaceExisting: true }, expect.any(Object));
  });

  it('확인에서 취소하면 아무것도 보내지 않는다', async () => {
    renderDialog({ hasExistingBracket: true });
    create();
    const confirmDialog = await screen.findByRole('dialog', { name: '기존 대진 교체' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '기존 대진 교체' })).not.toBeInTheDocument());
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});

describe('BracketTemplateDialog — 리그 방식 대회', () => {
  const typeTeams = (value: string) => fireEvent.change(screen.getByLabelText('팀 수'), { target: { value } });

  it('팀 수와 회전 수로 경기 수를 미리 보여 주고 league 본문으로 보낸다', () => {
    renderDialog({ format: 'league' });
    typeTeams('6');
    fireEvent.click(screen.getByLabelText('2회전'));
    expect(screen.getByText('경기 30개 · 자리 6개')).toBeInTheDocument();
    create();
    expect(mocks.apply).toHaveBeenCalledWith({ kind: 'league', teamCount: 6, legs: 2 }, expect.any(Object));
  });

  it.each([['2'], ['21'], [''], ['4.5']])('팀 수 %s 는 3~20 범위 밖이라 만들 수 없다', (value) => {
    renderDialog({ format: 'league' });
    typeTeams(value);
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
    expect(screen.getByText('팀 수는 3팀부터 20팀까지 정할 수 있어요.')).toBeInTheDocument();
  });

  it('경기가 240개를 넘으면 만들 수 없다(경계: 16팀 2회전 240개는 가능, 17팀은 불가)', () => {
    renderDialog({ format: 'league' });
    fireEvent.click(screen.getByLabelText('2회전'));
    typeTeams('16');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeEnabled();
    typeTeams('17');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
    expect(screen.getByText('경기가 240개를 넘어서 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.')).toBeInTheDocument();
  });
});

describe('BracketTemplateDialog — 열림', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-template-dialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./bracket-template-dialog"`.

- [ ] **Step 3: Implement**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.tsx`

```tsx
'use client';

import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1ApplyBracketTemplate } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import {
  BRACKET_TEMPLATE_MAX_FIXTURES,
  exceedsFixtureLimit,
  planBracketTemplateCounts,
} from '@/lib/bracket-template-counts';
import type { BracketTemplateInput } from '@/types/api';

export type BracketTemplateDialogProps = {
  open: boolean;
  tournamentId: string;
  format: 'knockout' | 'league';
  hasExistingBracket: boolean;
  onClose: () => void;
  showToast: (message: string, variant?: 'success' | 'error') => void;
};

const TEAM_COUNT_PATTERN = /^\d{1,2}$/;
const KNOCKOUT_SIZES = [4, 8, 12, 16] as const;

function radioRow(id: string, name: string, label: string, checked: boolean, onChange: () => void) {
  return (
    <label key={id} htmlFor={id} className="tm-text-label flex min-h-[44px] items-center gap-2" style={{ color: 'var(--text-strong)' }}>
      <input id={id} type="radio" name={name} checked={checked} onChange={onChange} className="size-5" />
      {label}
    </label>
  );
}

export function BracketTemplateDialog({ open, tournamentId, format, hasExistingBracket, onClose, showToast }: BracketTemplateDialogProps) {
  const idPrefix = useId();
  const apply = useV1ApplyBracketTemplate(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const { dialogRef, onBackdropClick, mounted, closing } = useModalA11y({ open, onClose, pending: apply.isPending });
  const [size, setSize] = useState<4 | 8 | 12 | 16>(8);
  const [thirdPlace, setThirdPlace] = useState(true);
  const [teamCountText, setTeamCountText] = useState('6');
  const [legs, setLegs] = useState<1 | 2>(1);

  const teamCount = TEAM_COUNT_PATTERN.test(teamCountText) ? Number(teamCountText) : null;
  const teamCountValid = teamCount !== null && teamCount >= 3 && teamCount <= 20;
  const input: BracketTemplateInput | null =
    format === 'knockout'
      ? { kind: 'knockout', size, thirdPlace }
      : teamCountValid
        ? { kind: 'league', teamCount, legs }
        : null;
  const counts = input === null ? null : planBracketTemplateCounts(input);
  const tooLarge = counts !== null && exceedsFixtureLimit(counts);
  const canSubmit = input !== null && counts !== null && !tooLarge;

  const handleSubmit = async () => {
    if (input === null || !canSubmit) return;
    if (hasExistingBracket) {
      const ok = await confirm({
        title: '기존 대진 교체',
        message: '기존 대진이 모두 삭제되고 새로 만들어져요. 이미 시작했거나 결과가 있는 경기가 있으면 교체할 수 없어요. 계속할까요?',
        confirmLabel: '교체',
        tone: 'danger',
      });
      if (!ok) return;
    }
    apply.mutate(hasExistingBracket ? { ...input, replaceExisting: true } : input, {
      onSuccess: (result) => {
        showToast(`경기 ${result.fixtures}개와 자리 ${result.slots}개를 만들었어요.`, 'success');
        onClose();
      },
      onError: (error) => showToast(describeBracketCanvasError(error, '대진을 만들지 못했어요.'), 'error'),
    });
  };

  if (!mounted) return ConfirmModal;
  const titleId = `${idPrefix}-title`;

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px] tm-modal-scrim${closing ? ' is-closing' : ''}`}
        onClick={onBackdropClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`tm-modal-panel w-full max-w-[440px] overflow-hidden bg-[var(--card-surface)] shadow-[var(--shadow-dropdown)]${closing ? ' is-closing' : ''}`}
          style={{ borderRadius: 'var(--radius-hero)' }}
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <h2 id={titleId} className="tm-text-body-lg font-bold" style={{ color: 'var(--text-strong)' }}>
              템플릿으로 대진 만들기
            </h2>
            <button
              type="button"
              aria-label="모달 닫기"
              onClick={() => !apply.isPending && onClose()}
              disabled={apply.isPending}
              className="flex size-11 items-center justify-center transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40"
              style={{ borderRadius: 'var(--radius-control)', color: 'var(--text-muted)' }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-4 px-5 py-5">
            {hasExistingBracket ? (
              <p className="tm-text-caption" style={{ color: 'var(--orange700)' }}>
                이미 대진이 있어요. 만들면 기존 대진이 모두 지워지고 새로 만들어져요.
              </p>
            ) : null}

            {format === 'knockout' ? (
              <>
                <fieldset className="flex flex-col">
                  <legend className="tm-text-label mb-1 font-semibold" style={{ color: 'var(--text-strong)' }}>팀 수</legend>
                  {KNOCKOUT_SIZES.map((value) => radioRow(`${idPrefix}-size-${value}`, `${idPrefix}-size`, `${value}팀`, size === value, () => setSize(value)))}
                  {size === 12 ? (
                    <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                      12강은 8팀이 12강을 치르고, 4팀은 부전승으로 8강에 올라가요.
                    </p>
                  ) : null}
                </fieldset>
                <label htmlFor={`${idPrefix}-third`} className="tm-text-label flex min-h-[44px] items-center gap-2" style={{ color: 'var(--text-strong)' }}>
                  <input id={`${idPrefix}-third`} type="checkbox" checked={thirdPlace} onChange={(event) => setThirdPlace(event.target.checked)} className="size-5" />
                  3·4위전도 만들기
                </label>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${idPrefix}-teams`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>팀 수</label>
                  <input
                    id={`${idPrefix}-teams`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={teamCountText}
                    onChange={(event) => setTeamCountText(event.target.value)}
                    className="tm-input"
                    style={{ minHeight: 44 }}
                  />
                  {!teamCountValid ? (
                    <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>팀 수는 3팀부터 20팀까지 정할 수 있어요.</p>
                  ) : null}
                </div>
                <fieldset className="flex flex-col">
                  <legend className="tm-text-label mb-1 font-semibold" style={{ color: 'var(--text-strong)' }}>회전 수</legend>
                  {radioRow(`${idPrefix}-legs-1`, `${idPrefix}-legs`, '1회전', legs === 1, () => setLegs(1))}
                  {radioRow(`${idPrefix}-legs-2`, `${idPrefix}-legs`, '2회전', legs === 2, () => setLegs(2))}
                </fieldset>
              </>
            )}

            {counts !== null ? (
              <p className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>
                {counts.edges > 0 ? `경기 ${counts.fixtures}개 · 자리 ${counts.slots}개 · 연결 ${counts.edges}개` : `경기 ${counts.fixtures}개 · 자리 ${counts.slots}개`}
              </p>
            ) : null}
            {tooLarge ? (
              <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>
                {`경기가 ${BRACKET_TEMPLATE_MAX_FIXTURES}개를 넘어서 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.`}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2 px-5 pb-5">
            <Button type="button" variant="neutral" size="md" className="flex-1" onClick={onClose} disabled={apply.isPending}>
              취소
            </Button>
            <Button type="button" variant="primary" size="md" className="flex-1" disabled={!canSubmit} loading={apply.isPending} onClick={() => void handleSubmit()}>
              대진 만들기
            </Button>
          </div>
        </div>
      </div>
      {ConfirmModal}
    </>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-template-dialog.test.tsx`
Expected: PASS (12 tests).

Run (apps/v1_web): `./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs` — 통과해야 한다. (`useModalA11y` 의 `initialFocusRef` 는 쓰지 않아 패널 안 첫 포커스 가능한 요소로 포커스가 간다.)

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.test.tsx
git commit -m "feat(web): 대진 템플릿 대화상자(토너먼트·리그, 교체 확인)" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.test.tsx
git show --stat HEAD
```

### Task 13b: 경기 추가·연결 대화상자(`BracketFixtureToolsDialog`)

스펙 S7 툴바의 「경기 추가」와 「연결(기존 bracket-sources)」을 캔버스 안에서 처리한다. 경기 추가는 기존 `useV1CreateFixture` 로 선택한 단계(그룹)에 대진 미정 경기 하나를 만든다(목록 화면의 "대진 미정 경기 추가" 경로와 같은 payload). 연결은 기존 `PATCH /admin/fixtures/:id/bracket-sources` 를 훅으로 감싸 같은 후보 규칙(바로 앞 단계의 예정 경기)으로 보여 준다. 목록 화면(`BracketTab`)은 한 줄도 바꾸지 않는다.

**Files:**
- Create: `apps/v1_web/src/lib/bracket-fixture-tools.ts`
- Create: `apps/v1_web/src/lib/bracket-fixture-tools.test.ts`
- Modify: `apps/v1_web/src/hooks/use-v1-bracket-canvas.ts` (끝에 `useV1SetBracketSources` 추가)
- Modify: `apps/v1_web/src/hooks/use-v1-bracket-canvas.test.tsx` (끝에 테스트 추가)
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.test.tsx`

**Interfaces:**
- Consumes: `useV1CreateFixture(tournamentId)` (`hooks/use-v1-api.ts:4969`, 본문 `V1CreateFixturePayload`), `describeBracketCanvasError` (Task 2), `useModalA11y`, `Button`, 테스트 데이터 빌더(Task 4)
- Produces:
  - `knockoutRoundLabel(phase: string): string | null` — PR-1c 의 `isKnockoutPhase`·`tournamentRoundLabel`(`lib/tournament-round-label.ts`) 위의 얇은 래퍼: 결선 단계면 그 라벨(round16 `16강` … third_place `3·4위전`), 그 밖(`group`)은 null. 라벨 표를 새로 들지 않는다
  - `nextFixtureNumber(fixtures: readonly Pick<V1AdminBracketFixture, 'fixtureNumber'>[]): number` — 최대값 + 1(없으면 1)
  - `bracketSourceCandidates(input: { target: V1AdminBracketFixture; groups: readonly V1AdminBracketGroup[]; fixtures: readonly V1AdminBracketFixture[] }): V1AdminBracketFixture[]` — 대상 경기 그룹의 바로 앞 단계(PR-1c 의 `BRACKET_SOURCE_PHASES` — quarter←round16|round12, semi←quarter, final·third_place←semi)에서 1회전·부모 없음·`scheduled`·결과 없는 경기
  - `useV1SetBracketSources(tournamentId: string)` → `mutate({ fixtureId: string; homeSourceFixtureId: string | null; awaySourceFixtureId: string | null })`
  - `BracketFixtureToolsDialog(props: { open: boolean; mode: 'add' | 'link'; tournamentId: string; bracket: V1AdminTournamentBracket; onClose: () => void; showToast: (message: string, variant?: 'success' | 'error') => void })`

- [ ] **Step 1: Write the failing tests (순수 함수)**

`apps/v1_web/src/lib/bracket-fixture-tools.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { makeFixture, makeGame, makeGroup } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketResult } from '@/types/api';
import { bracketSourceCandidates, knockoutRoundLabel, nextFixtureNumber } from './bracket-fixture-tools';

describe('knockoutRoundLabel', () => {
  it.each([
    ['round16', '16강'],
    ['round12', '12강'],
    ['quarter', '8강'],
    ['semi', '4강'],
    ['final', '결승'],
    ['third_place', '3·4위전'],
  ])('%s → %s', (phase, label) => {
    expect(knockoutRoundLabel(phase)).toBe(label);
  });

  it('조별리그 단계는 null — 캔버스에서 경기를 추가하지 않는다', () => {
    expect(knockoutRoundLabel('group')).toBeNull();
  });
});

describe('nextFixtureNumber', () => {
  it('가장 큰 번호 다음 번호를 돌려준다(번호가 비어 있어도 최대값 기준)', () => {
    expect(nextFixtureNumber([{ fixtureNumber: 1 }, { fixtureNumber: 7 }, { fixtureNumber: 3 }])).toBe(8);
  });

  it('경기가 없으면 1', () => {
    expect(nextFixtureNumber([])).toBe(1);
  });
});

describe('bracketSourceCandidates', () => {
  const qf = makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' });
  const sf = makeGroup({ id: 'g-sf', name: '4강', phase: 'semi' });
  const fin = makeGroup({ id: 'g-fin', name: '결승', phase: 'final' });
  const q1 = makeFixture({ id: 'q1', groupId: 'g-qf', fixtureNumber: 1 });
  const q2 = makeFixture({ id: 'q2', groupId: 'g-qf', fixtureNumber: 2 });
  const s1 = makeFixture({ id: 's1', groupId: 'g-sf', fixtureNumber: 5 });
  const f1 = makeFixture({ id: 'f1', groupId: 'g-fin', fixtureNumber: 7 });
  const groups = [qf, sf, fin];

  it('바로 앞 단계 경기만 후보다 — 4강 경기의 후보는 8강, 결승의 후보는 4강', () => {
    const fixtures = [q1, q2, s1, f1];
    expect(bracketSourceCandidates({ target: s1, groups, fixtures }).map((f) => f.id)).toEqual(['q1', 'q2']);
    expect(bracketSourceCandidates({ target: f1, groups, fixtures }).map((f) => f.id)).toEqual(['s1']);
  });

  it('이미 시작했거나 결과가 있거나 2회전·하위 경기인 앞 단계 경기는 뺀다', () => {
    const started = makeFixture({ id: 'q3', groupId: 'g-qf', fixtureNumber: 3, status: 'in_progress' });
    const withGame = makeFixture({ id: 'q4', groupId: 'g-qf', fixtureNumber: 4, game: makeGame({ state: 'LIVE' }) });
    const withResult = makeFixture({
      id: 'q7',
      groupId: 'g-qf',
      fixtureNumber: 7,
      result: { id: 'r', fixtureId: 'q7', homeScore: 1, awayScore: 0, hasPenalty: false } as V1AdminBracketResult,
    });
    const leg2 = makeFixture({ id: 'q5', groupId: 'g-qf', fixtureNumber: 5, legNumber: 2 });
    const child = makeFixture({ id: 'q6', groupId: 'g-qf', fixtureNumber: 6, parentFixtureId: 'q1' });
    const candidates = bracketSourceCandidates({ target: s1, groups, fixtures: [q1, started, withGame, withResult, leg2, child, s1] });
    expect(candidates.map((f) => f.id)).toEqual(['q1']);
  });

  it('8강 경기의 후보는 16강 경기다(quarter ← round16)', () => {
    const r16 = makeGroup({ id: 'g-r16', name: '16강', phase: 'round16' });
    const r1 = makeFixture({ id: 'r1', groupId: 'g-r16', fixtureNumber: 1 });
    const r2 = makeFixture({ id: 'r2', groupId: 'g-r16', fixtureNumber: 2 });
    expect(bracketSourceCandidates({ target: q1, groups: [r16, qf], fixtures: [r1, r2, q1] }).map((f) => f.id)).toEqual(['r1', 'r2']);
  });

  it('앞 단계가 없는 8강 경기(12강·16강 없는 대진)나 조별리그 경기는 후보가 없다', () => {
    expect(bracketSourceCandidates({ target: q1, groups, fixtures: [q1, q2] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/lib/bracket-fixture-tools.test.ts`
Expected: FAIL — `Failed to resolve import "./bracket-fixture-tools"`.

- [ ] **Step 3: Implement**

`apps/v1_web/src/lib/bracket-fixture-tools.ts`

```ts
import { BRACKET_SOURCE_PHASES } from '@/lib/tournament-bracket-rounds';
import { isKnockoutPhase, tournamentRoundLabel } from '@/lib/tournament-round-label';
import type { V1AdminBracketFixture, V1AdminBracketGroup } from '@/types/api';

export function knockoutRoundLabel(phase: string): string | null {
  return isKnockoutPhase(phase) ? tournamentRoundLabel(phase) : null;
}

export function nextFixtureNumber(fixtures: readonly Pick<V1AdminBracketFixture, 'fixtureNumber'>[]): number {
  return fixtures.reduce((max, fixture) => Math.max(max, fixture.fixtureNumber), 0) + 1;
}

export function bracketSourceCandidates(input: {
  target: V1AdminBracketFixture;
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
}): V1AdminBracketFixture[] {
  const { target, groups, fixtures } = input;
  const phaseByGroup = new Map(groups.map((group) => [group.id, group.phase]));
  const targetPhase = phaseByGroup.get(target.groupId ?? '') ?? '';
  const previousPhases = BRACKET_SOURCE_PHASES[targetPhase];
  if (previousPhases === undefined) return [];
  return fixtures.filter(
    (fixture) =>
      previousPhases.includes(phaseByGroup.get(fixture.groupId ?? '') ?? '') &&
      fixture.legNumber === 1 &&
      !fixture.parentFixtureId &&
      fixture.status === 'scheduled' &&
      fixture.result === null &&
      fixture.game === null,
  );
}
```

Run (apps/v1_web): `./node_modules/.bin/vitest run src/lib/bracket-fixture-tools.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 4: 훅 테스트 (RED)**

`apps/v1_web/src/hooks/use-v1-bracket-canvas.test.tsx` 의 `vi.mock('@/lib/api-client', ...)` 반환값을 `{ ...actual, v1Post: vi.fn(), v1Put: vi.fn(), v1Patch: vi.fn() }` 로, import 를 `import { v1Patch, v1Post, v1Put } from '@/lib/api-client';` 로, `./use-v1-bracket-canvas` import 목록에 `useV1SetBracketSources` 를 더하고, `const putMock = vi.mocked(v1Put);` 아래에 `const patchMock = vi.mocked(v1Patch);` 를, `beforeEach` 안에 `patchMock.mockReset();` 을 추가한다. 파일 끝에 붙인다.

```tsx
describe('useV1SetBracketSources', () => {
  it('경기별 bracket-sources 로 홈·어웨이 원천을 보내고 대진 캐시를 무효화한다', async () => {
    patchMock.mockResolvedValue({});
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useV1SetBracketSources('t1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ fixtureId: 'f9', homeSourceFixtureId: 'q1', awaySourceFixtureId: null });
    });

    expect(patchMock).toHaveBeenCalledWith('/admin/fixtures/f9/bracket-sources', {
      homeSourceFixtureId: 'q1',
      awaySourceFixtureId: null,
    });
    expect(invalidatedKeys(invalidate)).toContainEqual(v1Keys.adminTournamentBracket('t1'));
  });
});
```

Run (apps/v1_web): `./node_modules/.bin/vitest run src/hooks/use-v1-bracket-canvas.test.tsx`
Expected: FAIL — `useV1SetBracketSources is not a function`(또는 import 오류).

`apps/v1_web/src/hooks/use-v1-bracket-canvas.ts` 의 `import { v1Post, v1Put } from '@/lib/api-client';` 를 `import { v1Patch, v1Post, v1Put } from '@/lib/api-client';` 로 바꾸고 파일 끝에 추가한다.

```ts
/** `PATCH /admin/fixtures/:id/bracket-sources` — 둘 다 null 이면 연결을 모두 해제한다. */
export function useV1SetBracketSources(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      fixtureId,
      homeSourceFixtureId,
      awaySourceFixtureId,
    }: {
      fixtureId: string;
      homeSourceFixtureId: string | null;
      awaySourceFixtureId: string | null;
    }) => v1Patch(`/admin/fixtures/${encodeURIComponent(fixtureId)}/bracket-sources`, { homeSourceFixtureId, awaySourceFixtureId }),
    onSuccess: () => invalidateCompetitionViews(queryClient, tournamentId, 'tournament'),
  });
}
```

Run (apps/v1_web): `./node_modules/.bin/vitest run src/hooks/use-v1-bracket-canvas.test.tsx`
Expected: PASS(기존 테스트 + 1).

- [ ] **Step 5: 대화상자 테스트 (RED)**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.test.tsx`

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBracket, makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import { BracketFixtureToolsDialog } from './bracket-fixture-tools-dialog';

const mocks = vi.hoisted(() => ({ create: vi.fn(), setSources: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1CreateFixture: () => ({ mutate: mocks.create, isPending: false }),
}));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1SetBracketSources: () => ({ mutate: mocks.setSources, isPending: false }),
}));

const bracket = makeBracket({
  groups: [
    makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter', sortOrder: 0 }),
    makeGroup({ id: 'g-sf', name: '4강', phase: 'semi', sortOrder: 1 }),
  ],
  fixtures: [
    makeFixture({ id: 'q1', groupId: 'g-qf', fixtureNumber: 1 }),
    makeFixture({ id: 'q2', groupId: 'g-qf', fixtureNumber: 2 }),
    makeFixture({ id: 's1', groupId: 'g-sf', fixtureNumber: 3, bracketSources: [{ fixtureId: 'q1', outcome: 'WINNER', side: 'HOME' }] }),
  ],
});

function renderDialog(mode: 'add' | 'link') {
  const props = { open: true, mode, tournamentId: 't-1', bracket, onClose: vi.fn(), showToast: vi.fn() };
  render(<BracketFixtureToolsDialog {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BracketFixtureToolsDialog — 경기 추가', () => {
  it('고른 단계에 대진 미정 경기를 다음 번호로 만들고, 성공하면 알리고 닫는다', () => {
    const props = renderDialog('add');
    fireEvent.change(screen.getByLabelText('추가할 단계'), { target: { value: 'g-sf' } });
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    expect(mocks.create).toHaveBeenCalledWith({ groupId: 'g-sf', round: '4강', fixtureNumber: 4 }, expect.any(Object));
    mocks.create.mock.calls[0][1].onSuccess();
    expect(props.showToast).toHaveBeenCalledWith('4강 경기를 추가했어요. 팀은 자리에서 정해 주세요.', 'success');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('실패하면 해요체 안내를 보여 주고 닫지 않는다', () => {
    const props = renderDialog('add');
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    mocks.create.mock.calls[0][1].onError(undefined);
    expect(props.showToast).toHaveBeenCalledWith('경기를 추가하지 못했어요.', 'error');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('조별리그 단계만 있는 대진은 추가할 단계가 없다고 안내하고 버튼을 막는다', () => {
    render(
      <BracketFixtureToolsDialog
        open
        mode="add"
        tournamentId="t-1"
        bracket={makeBracket({ groups: [makeGroup({ id: 'g', name: 'A조', phase: 'group' })], fixtures: [] })}
        onClose={vi.fn()}
        showToast={vi.fn()}
      />,
    );
    expect(screen.getByText('경기를 추가할 수 있는 단계가 없어요. 템플릿으로 대진을 먼저 만들어 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '경기 추가' })).toBeDisabled();
  });
});

describe('BracketFixtureToolsDialog — 경기 연결', () => {
  it('앞 단계 경기만 후보로 보여 주고, 현재 연결을 미리 고른다', () => {
    renderDialog('link');
    fireEvent.change(screen.getByLabelText('연결할 경기'), { target: { value: 's1' } });
    const home = screen.getByLabelText('홈 자리') as HTMLSelectElement;
    expect(home.value).toBe('q1');
    expect(Array.from(home.options).map((option) => option.textContent)).toEqual([
      '연결 없음 · 직접 배정',
      '8강 1번 경기 승자',
      '8강 2번 경기 승자',
    ]);
    expect((screen.getByLabelText('어웨이 자리') as HTMLSelectElement).value).toBe('');
  });

  it('고른 원천을 보내고, 비운 쪽은 null 로 보낸다', () => {
    const props = renderDialog('link');
    fireEvent.change(screen.getByLabelText('연결할 경기'), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText('어웨이 자리'), { target: { value: 'q2' } });
    fireEvent.change(screen.getByLabelText('홈 자리'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '연결 저장' }));
    expect(mocks.setSources).toHaveBeenCalledWith(
      { fixtureId: 's1', homeSourceFixtureId: null, awaySourceFixtureId: 'q2' },
      expect.any(Object),
    );
    mocks.setSources.mock.calls[0][1].onSuccess();
    expect(props.showToast).toHaveBeenCalledWith('진출 연결을 저장했어요.', 'success');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('연결할 수 있는 경기(앞 단계가 있는 경기)가 없으면 안내하고 저장을 막는다', () => {
    render(
      <BracketFixtureToolsDialog
        open
        mode="link"
        tournamentId="t-1"
        bracket={makeBracket({
          groups: [makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' })],
          fixtures: [makeFixture({ id: 'q1', groupId: 'g-qf', fixtureNumber: 1 })],
        })}
        onClose={vi.fn()}
        showToast={vi.fn()}
      />,
    );
    expect(screen.getByText('이전 단계 경기를 이어 줄 수 있는 경기가 없어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '연결 저장' })).toBeDisabled();
  });
});
```

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./bracket-fixture-tools-dialog"`.

- [ ] **Step 6: 대화상자 구현 (GREEN)**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.tsx`

```tsx
'use client';

import { X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1CreateFixture } from '@/hooks/use-v1-api';
import { useV1SetBracketSources } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { bracketSourceCandidates, knockoutRoundLabel, nextFixtureNumber } from '@/lib/bracket-fixture-tools';
import type { V1AdminBracketFixture, V1AdminTournamentBracket } from '@/types/api';

export type BracketFixtureToolsDialogProps = {
  open: boolean;
  mode: 'add' | 'link';
  tournamentId: string;
  bracket: V1AdminTournamentBracket;
  onClose: () => void;
  showToast: (message: string, variant?: 'success' | 'error') => void;
};

const SELECT_CLASS = 'tm-input';

export function BracketFixtureToolsDialog({ open, mode, tournamentId, bracket, onClose, showToast }: BracketFixtureToolsDialogProps) {
  const idPrefix = useId();
  const createFixture = useV1CreateFixture(tournamentId);
  const setSources = useV1SetBracketSources(tournamentId);
  const pending = createFixture.isPending || setSources.isPending;
  const { dialogRef, onBackdropClick, mounted, closing } = useModalA11y({ open, onClose, pending });

  const addableGroups = useMemo(
    () => [...bracket.groups].filter((group) => knockoutRoundLabel(group.phase) !== null).sort((a, b) => a.sortOrder - b.sortOrder),
    [bracket.groups],
  );
  const linkable = useMemo(
    () =>
      bracket.fixtures
        .filter((fixture) => bracketSourceCandidates({ target: fixture, groups: bracket.groups, fixtures: bracket.fixtures }).length > 0)
        .sort((a, b) => a.fixtureNumber - b.fixtureNumber),
    [bracket.fixtures, bracket.groups],
  );
  const groupName = (fixture: V1AdminBracketFixture) => bracket.groups.find((group) => group.id === fixture.groupId)?.name ?? fixture.round;
  const fixtureTitle = (fixture: V1AdminBracketFixture) => `${groupName(fixture)} ${fixture.fixtureNumber}번 경기`;

  const [groupId, setGroupId] = useState(addableGroups[0]?.id ?? '');
  const [targetId, setTargetId] = useState(linkable[0]?.id ?? '');
  const sourceOf = (fixture: V1AdminBracketFixture | undefined, side: 'HOME' | 'AWAY') =>
    fixture?.bracketSources?.find((source) => source.side === side)?.fixtureId ?? '';
  const [homeSource, setHomeSource] = useState(() => sourceOf(linkable[0], 'HOME'));
  const [awaySource, setAwaySource] = useState(() => sourceOf(linkable[0], 'AWAY'));

  const target = linkable.find((fixture) => fixture.id === targetId) ?? null;
  const candidates = target === null ? [] : bracketSourceCandidates({ target, groups: bracket.groups, fixtures: bracket.fixtures });
  const targetPhase = target === null ? '' : (bracket.groups.find((group) => group.id === target.groupId)?.phase ?? '');
  const outcomeLabel = targetPhase === 'third_place' ? '패자' : '승자';

  const selectTarget = (fixtureId: string) => {
    setTargetId(fixtureId);
    const next = linkable.find((fixture) => fixture.id === fixtureId);
    setHomeSource(sourceOf(next, 'HOME'));
    setAwaySource(sourceOf(next, 'AWAY'));
  };

  const group = addableGroups.find((candidate) => candidate.id === groupId) ?? null;
  const addDisabled = group === null || pending;
  const linkDisabled = target === null || pending;

  const handleAdd = () => {
    if (group === null) return;
    const round = knockoutRoundLabel(group.phase);
    if (round === null) return;
    createFixture.mutate(
      { groupId: group.id, round, fixtureNumber: nextFixtureNumber(bracket.fixtures) },
      {
        onSuccess: () => {
          showToast(`${round} 경기를 추가했어요. 팀은 자리에서 정해 주세요.`, 'success');
          onClose();
        },
        onError: (error) => showToast(describeBracketCanvasError(error, '경기를 추가하지 못했어요.'), 'error'),
      },
    );
  };

  const handleLink = () => {
    if (target === null) return;
    setSources.mutate(
      { fixtureId: target.id, homeSourceFixtureId: homeSource === '' ? null : homeSource, awaySourceFixtureId: awaySource === '' ? null : awaySource },
      {
        onSuccess: () => {
          showToast('진출 연결을 저장했어요.', 'success');
          onClose();
        },
        onError: (error) => showToast(describeBracketCanvasError(error, '진출 연결을 저장하지 못했어요.'), 'error'),
      },
    );
  };

  if (!mounted) return null;
  const titleId = `${idPrefix}-title`;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px] tm-modal-scrim${closing ? ' is-closing' : ''}`}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`tm-modal-panel w-full max-w-[440px] overflow-hidden bg-[var(--card-surface)] shadow-[var(--shadow-dropdown)]${closing ? ' is-closing' : ''}`}
        style={{ borderRadius: 'var(--radius-hero)' }}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 id={titleId} className="tm-text-body-lg font-bold" style={{ color: 'var(--text-strong)' }}>
            {mode === 'add' ? '경기 추가' : '진출 경기 연결'}
          </h2>
          <button
            type="button"
            aria-label="모달 닫기"
            onClick={() => !pending && onClose()}
            disabled={pending}
            className="flex size-11 items-center justify-center transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-40"
            style={{ borderRadius: 'var(--radius-control)', color: 'var(--text-muted)' }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {mode === 'add' ? (
          <div className="flex flex-col gap-4 px-5 py-5">
            {addableGroups.length === 0 ? (
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                경기를 추가할 수 있는 단계가 없어요. 템플릿으로 대진을 먼저 만들어 주세요.
              </p>
            ) : (
              <>
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                  고른 단계에 대진 미정 경기를 하나 만들어요. 팀은 만든 뒤 자리에서 정해요.
                </p>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${idPrefix}-group`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>추가할 단계</label>
                  <select id={`${idPrefix}-group`} className={SELECT_CLASS} style={{ minHeight: 44 }} value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                    {addableGroups.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <Button variant="primary" size="md" disabled={addDisabled} loading={createFixture.isPending} onClick={handleAdd}>
              경기 추가
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5 py-5">
            {linkable.length === 0 ? (
              <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>이전 단계 경기를 이어 줄 수 있는 경기가 없어요.</p>
            ) : (
              <>
                <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
                  미정인 자리에 이전 경기의 {outcomeLabel}를 연결해요. 결과가 확정되면 기존 진출 처리로 팀이 들어가요.
                </p>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${idPrefix}-target`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>연결할 경기</label>
                  <select id={`${idPrefix}-target`} className={SELECT_CLASS} style={{ minHeight: 44 }} value={targetId} onChange={(event) => selectTarget(event.target.value)}>
                    {linkable.map((fixture) => (
                      <option key={fixture.id} value={fixture.id}>{fixtureTitle(fixture)}</option>
                    ))}
                  </select>
                </div>
                {(['HOME', 'AWAY'] as const).map((side) => (
                  <div key={side} className="flex flex-col gap-1">
                    <label htmlFor={`${idPrefix}-${side}`} className="tm-text-label font-semibold" style={{ color: 'var(--text-strong)' }}>
                      {side === 'HOME' ? '홈 자리' : '어웨이 자리'}
                    </label>
                    <select
                      id={`${idPrefix}-${side}`}
                      className={SELECT_CLASS}
                      style={{ minHeight: 44 }}
                      value={side === 'HOME' ? homeSource : awaySource}
                      onChange={(event) => (side === 'HOME' ? setHomeSource(event.target.value) : setAwaySource(event.target.value))}
                    >
                      <option value="">연결 없음 · 직접 배정</option>
                      {candidates.map((fixture) => (
                        <option key={fixture.id} value={fixture.id}>{`${fixtureTitle(fixture)} ${outcomeLabel}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </>
            )}
            <Button variant="primary" size="md" disabled={linkDisabled} loading={setSources.isPending} onClick={handleLink}>
              연결 저장
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.test.tsx src/lib/bracket-fixture-tools.test.ts src/hooks/use-v1-bracket-canvas.test.tsx`
Expected: PASS(대화상자 6 + 순수 함수 11 + 훅 전체).

Run (apps/v1_web): `./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs` — 통과해야 한다.

- [ ] **Step 8: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/lib/bracket-fixture-tools.ts apps/v1_web/src/lib/bracket-fixture-tools.test.ts apps/v1_web/src/hooks/use-v1-bracket-canvas.ts apps/v1_web/src/hooks/use-v1-bracket-canvas.test.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.test.tsx
git commit -m "feat(web): 대진 캔버스 경기 추가·진출 연결 대화상자" -- apps/v1_web/src/lib/bracket-fixture-tools.ts apps/v1_web/src/lib/bracket-fixture-tools.test.ts apps/v1_web/src/hooks/use-v1-bracket-canvas.ts apps/v1_web/src/hooks/use-v1-bracket-canvas.test.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-fixture-tools-dialog.test.tsx
git show --stat HEAD
```

### Task 14: 작업 영역(`BracketCanvasWorkspace`)

툴바(템플릿·경기 추가·연결·무작위·공개 상태) + 참가팀 트레이 + 캔버스 + 칸 패널을 묶고, 선택 상태(선택한 칸·고른 팀)와 로딩/에러/빈 상태/읽기 전용을 정한다. 데이터는 기존 `useV1AdminBracket` 한 쿼리다.

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx`

**Interfaces:**
- Consumes: `useV1AdminBracket`, `useV1PublishTournamentBracket`, `useV1UnpublishTournamentBracket` (`hooks/use-v1-api.ts:4665,4682,5068`), `useV1AssignTournamentSlot`, `useV1RandomFillSlots` (Task 3), `BracketCanvas`(8)·`BracketTeamTray`(9)·`BracketNodePanel`(12)·`BracketTemplateDialog`(13), `BracketFixtureToolsDialog`(13b), `buildSideLabelContext`/`fixtureSideLabel` (4), `isBracketPublished` (`lib/bracket-visibility.ts:9`), `AdminListSkeleton`, `EmptyState`/`ErrorState`/`AlertBanner` (`components/v1-ui/primitives.tsx`)
- Produces: `BracketCanvasWorkspace(props: { tournamentId: string; format: V1TournamentFormat | undefined; registrations: V1AdminTournamentRegistration[]; bracketPublishedAt: string | null | undefined; bracketPublishScheduledAt: string | null | undefined; canWrite: boolean; showToast: (message: string, variant?: 'success' | 'error') => void; onShowList: () => void })`

- [ ] **Step 1: Write the failing test**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx`

```tsx
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBracket, makeFixture, makeGroup, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminTournamentBracket } from '@/types/api';
import { BracketCanvasWorkspace } from './bracket-canvas-workspace';

const mocks = vi.hoisted(() => ({
  bracket: { data: undefined as unknown, isPending: false, isError: false, error: null as unknown, refetch: vi.fn() },
  assign: vi.fn(),
  randomFill: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminBracket: () => mocks.bracket,
  useV1PublishTournamentBracket: () => ({ mutate: mocks.publish, isPending: false }),
  useV1UnpublishTournamentBracket: () => ({ mutate: mocks.unpublish, isPending: false }),
}));
vi.mock('@/hooks/use-v1-bracket-canvas', () => ({
  useV1AssignTournamentSlot: () => ({ mutate: mocks.assign, isPending: false }),
  useV1RandomFillSlots: () => ({ mutate: mocks.randomFill, isPending: false }),
}));
// 패널·대화상자는 각자의 테스트가 있다 — 여기서는 열림/닫힘과 넘겨 받는 값만 본다.
vi.mock('./bracket-node-panel', () => ({
  BracketNodePanel: (props: { fixture: { id: string }; canWrite: boolean; onClose: () => void }) => (
    <aside data-testid="panel" data-can-write={String(props.canWrite)}>
      {props.fixture.id}
      <button type="button" onClick={props.onClose}>패널 닫기</button>
    </aside>
  ),
}));
vi.mock('./bracket-fixture-tools-dialog', () => ({
  BracketFixtureToolsDialog: (props: { open: boolean; mode: string }) =>
    props.open ? <div data-testid="tools-dialog" data-mode={props.mode} /> : null,
}));
vi.mock('./bracket-template-dialog', () => ({
  BracketTemplateDialog: (props: { open: boolean; hasExistingBracket: boolean; format: string }) =>
    props.open ? <div data-testid="template-dialog" data-existing={String(props.hasExistingBracket)} data-format={props.format} /> : null,
}));

const group = makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter' });
const slots = [1, 2, 3, 4].map((n) => makeSlot({ id: `s${n}`, label: `${n}번 자리`, position: n }));
const populated = makeBracket({
  groups: [group],
  slots,
  fixtures: [
    makeFixture({ id: 'f1', groupId: 'g-qf', fixtureNumber: 1, homeSlotId: 's1', awaySlotId: 's2' }),
    makeFixture({ id: 'f2', groupId: 'g-qf', fixtureNumber: 2, homeSlotId: 's3', awaySlotId: 's4' }),
  ],
});
const registrations = [
  makeRegistration({ id: 'r1', teamName: '서울FC' }),
  makeRegistration({ id: 'r2', teamName: '부산FC' }),
  makeRegistration({ id: 'r3', teamName: '대구FC' }),
];

function setBracket(data: V1AdminTournamentBracket | undefined, state: Partial<typeof mocks.bracket> = {}) {
  Object.assign(mocks.bracket, { data, isPending: false, isError: false, error: null, ...state });
}

function renderWorkspace(overrides: Partial<React.ComponentProps<typeof BracketCanvasWorkspace>> = {}) {
  const props = {
    tournamentId: 't-1',
    format: 'knockout' as const,
    registrations,
    bracketPublishedAt: null,
    bracketPublishScheduledAt: null,
    canWrite: true,
    showToast: vi.fn(),
    onShowList: vi.fn(),
    ...overrides,
  };
  render(<BracketCanvasWorkspace {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  setBracket(populated);
});

describe('BracketCanvasWorkspace — 로딩·에러·빈 상태', () => {
  it('불러오는 동안 스켈레톤만 보이고 도구 모음은 없다', () => {
    setBracket(undefined, { isPending: true });
    renderWorkspace();
    expect(screen.getByRole('status', { name: '대진을 불러오는 중이에요' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: /템플릿/ })).not.toBeInTheDocument();
  });

  it('실패하면 다시 시도 버튼을 주고 템플릿 버튼은 숨긴다', () => {
    setBracket(undefined, { isError: true, error: new Error('network') });
    renderWorkspace();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /템플릿/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(mocks.bracket.refetch).toHaveBeenCalledTimes(1);
  });

  it('대진이 비어 있으면 "템플릿으로 시작"을 유도하고, 누르면 대화상자가 새 대진 모드로 열린다', () => {
    setBracket(makeBracket());
    renderWorkspace();
    expect(screen.getByText('아직 대진이 없어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 시작' }));
    expect(screen.getByTestId('template-dialog')).toHaveAttribute('data-existing', 'false');
  });

  it('조별+결선 방식 대회는 템플릿 대신 목록으로 안내한다(대화상자를 열지 않는다)', () => {
    setBracket(makeBracket());
    const props = renderWorkspace({ format: 'group_knockout' });
    expect(screen.queryByRole('button', { name: '템플릿으로 시작' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '목록으로 보기' }));
    expect(props.onShowList).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('template-dialog')).not.toBeInTheDocument();
  });

  it('읽기 전용 화면의 빈 대진에는 행동 버튼이 없다', () => {
    setBracket(makeBracket());
    renderWorkspace({ canWrite: false });
    expect(screen.getByText('아직 대진이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '템플릿으로 시작' })).not.toBeInTheDocument();
  });
});

describe('BracketCanvasWorkspace — 팀 배정(키보드 경로)', () => {
  it('팀을 고른 뒤 칸의 빈 줄을 누르면 그 자리에 배정하고 고른 팀을 푼다', () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /서울FC/ }));
    expect(screen.getByRole('button', { name: /서울FC/ })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리, 선택한 팀을 여기에 넣어요' }));
    expect(mocks.assign).toHaveBeenCalledWith({ slotId: 's1', registrationId: 'r1' }, expect.any(Object));

    act(() => mocks.assign.mock.calls[0][1].onSuccess());
    expect(screen.getByRole('button', { name: /서울FC/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('배정이 거절되면 고른 팀을 유지해 다른 자리를 바로 시도할 수 있다', () => {
    const props = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /서울FC/ }));
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리, 선택한 팀을 여기에 넣어요' }));
    mocks.assign.mock.calls[0][1].onError(new Error('x'));
    expect(props.showToast).toHaveBeenCalledWith('x', 'error');
    expect(screen.getByRole('button', { name: /서울FC/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('읽기 전용에서는 팀을 고를 수 없다', () => {
    renderWorkspace({ canWrite: false });
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '빈 자리 무작위 채우기' })).not.toBeInTheDocument();
  });
});

describe('BracketCanvasWorkspace — 칸 패널', () => {
  it('칸을 열면 패널이 그 칸으로 열리고, 닫으면 사라진다', () => {
    renderWorkspace();
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '8강 2번 경기 열기' }));
    expect(screen.getByTestId('panel')).toHaveTextContent('f2');
    fireEvent.click(within(screen.getByTestId('panel')).getByRole('button', { name: '패널 닫기' }));
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('패널에 쓰기 권한을 그대로 넘긴다', () => {
    renderWorkspace({ canWrite: false });
    fireEvent.click(screen.getByRole('button', { name: '8강 1번 경기 열기' }));
    expect(screen.getByTestId('panel')).toHaveAttribute('data-can-write', 'false');
  });
});

describe('BracketCanvasWorkspace — 도구 모음', () => {
  it('대진이 있으면 "템플릿으로 다시 만들기"가 교체 모드로 대화상자를 연다', () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 다시 만들기' }));
    expect(screen.getByTestId('template-dialog')).toHaveAttribute('data-existing', 'true');
    expect(screen.getByTestId('template-dialog')).toHaveAttribute('data-format', 'knockout');
  });

  it('빈 자리 무작위 채우기: 채운 수를 알리고, 자리나 팀이 없으면 이유와 함께 막는다', () => {
    const props = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: '빈 자리 무작위 채우기' }));
    expect(mocks.randomFill).toHaveBeenCalledTimes(1);
    act(() =>
      mocks.randomFill.mock.calls[0][1].onSuccess({ assignments: [{ slotId: 's1', registrationId: 'r1' }, { slotId: 's2', registrationId: 'r2' }] }),
    );
    expect(props.showToast).toHaveBeenCalledWith('2개 자리를 채웠어요.', 'success');
  });

  it('모든 자리가 찼으면 무작위 채우기를 막는다', () => {
    setBracket({
      ...populated,
      slots: slots.map((slot, index) => ({ ...slot, registrationId: `r${index + 1}`, teamName: `팀${index + 1}` })),
    });
    renderWorkspace();
    expect(screen.getByRole('button', { name: '빈 자리 무작위 채우기' })).toBeDisabled();
  });

  it('배정할 팀이 하나도 없으면 무작위 채우기를 막는다', () => {
    renderWorkspace({ registrations: [] });
    expect(screen.getByRole('button', { name: '빈 자리 무작위 채우기' })).toBeDisabled();
  });

  it('"경기 추가"와 "경기 연결"은 각각 대화상자를 add·link 모드로 연다', () => {
    renderWorkspace();
    expect(screen.queryByTestId('tools-dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    expect(screen.getByTestId('tools-dialog')).toHaveAttribute('data-mode', 'add');
    fireEvent.click(screen.getByRole('button', { name: '경기 연결' }));
    expect(screen.getByTestId('tools-dialog')).toHaveAttribute('data-mode', 'link');
  });

  it('읽기 전용에서는 경기 추가·연결 버튼이 없다', () => {
    renderWorkspace({ canWrite: false });
    expect(screen.queryByRole('button', { name: '경기 추가' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '경기 연결' })).not.toBeInTheDocument();
  });
});

describe('BracketCanvasWorkspace — 공개 상태', () => {
  it('비공개 대진은 확인을 거쳐 공개한다', async () => {
    renderWorkspace();
    expect(screen.getByText('비공개')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '지금 전체 공개' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '전체 공개' }));
    await vi.waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1));
  });

  it('이미 공개된 대진을 편집하면 "바꾸는 즉시 보여요" 안내와 공개 취소를 보여 준다', async () => {
    renderWorkspace({ bracketPublishedAt: '2026-10-01T00:00:00.000Z' });
    expect(screen.getByText('공개 중')).toBeInTheDocument();
    expect(screen.getByText('이미 공개된 대진표예요. 바꾸는 즉시 참가팀에게 보여요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '지금 전체 공개' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '공개 취소' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '비공개로 되돌리기' }));
    await vi.waitFor(() => expect(mocks.unpublish).toHaveBeenCalledTimes(1));
  });

  it('읽기 전용에는 공개 상태만 보이고 버튼과 경고는 없다', () => {
    renderWorkspace({ canWrite: false, bracketPublishedAt: '2026-10-01T00:00:00.000Z' });
    expect(screen.getByText('공개 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '공개 취소' })).not.toBeInTheDocument();
    expect(screen.queryByText(/바꾸는 즉시/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx`
Expected: FAIL — `Failed to resolve import "./bracket-canvas-workspace"`.

- [ ] **Step 3: Implement**

`apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx`

```tsx
'use client';

import { Globe, LayoutTemplate, Link2, Plus, Shuffle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { AlertBanner, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import {
  useV1AdminBracket,
  useV1PublishTournamentBracket,
  useV1UnpublishTournamentBracket,
} from '@/hooks/use-v1-api';
import { useV1AssignTournamentSlot, useV1RandomFillSlots } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { buildSideLabelContext, fixtureSideLabel } from '@/lib/bracket-canvas-layout';
import { isBracketPublished } from '@/lib/bracket-visibility';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminTournamentRegistration, V1TournamentFormat } from '@/types/api';
import { BracketCanvas } from './bracket-canvas';
import { BracketNodePanel } from './bracket-node-panel';
import { BracketTeamTray } from './bracket-team-tray';
import { BracketFixtureToolsDialog } from './bracket-fixture-tools-dialog';
import { BracketTemplateDialog } from './bracket-template-dialog';

export type BracketCanvasWorkspaceProps = {
  tournamentId: string;
  format: V1TournamentFormat | undefined;
  registrations: V1AdminTournamentRegistration[];
  bracketPublishedAt: string | null | undefined;
  bracketPublishScheduledAt: string | null | undefined;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onShowList: () => void;
};

export function BracketCanvasWorkspace({
  tournamentId,
  format,
  registrations,
  bracketPublishedAt,
  bracketPublishScheduledAt,
  canWrite,
  showToast,
  onShowList,
}: BracketCanvasWorkspaceProps) {
  const { data: bracket, isPending, isError, error, refetch } = useV1AdminBracket(tournamentId);
  const assignSlot = useV1AssignTournamentSlot(tournamentId, 'tournament');
  const randomFill = useV1RandomFillSlots(tournamentId, 'tournament');
  const publishBracket = useV1PublishTournamentBracket(tournamentId);
  const unpublishBracket = useV1UnpublishTournamentBracket(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [pendingRegistrationId, setPendingRegistrationId] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [toolsMode, setToolsMode] = useState<'add' | 'link' | null>(null);
  const labelContext = useMemo(
    () => (bracket === undefined ? null : buildSideLabelContext(bracket.groups, bracket.fixtures, bracket.slots)),
    [bracket],
  );

  if (isPending) {
    return (
      <div role="status" aria-busy="true" aria-label="대진을 불러오는 중이에요">
        <AdminListSkeleton rows={4} />
      </div>
    );
  }
  if (isError || bracket === undefined || labelContext === null) {
    return (
      <ErrorState
        title="대진을 불러오지 못했어요"
        message={extractErrorMessage(error, '잠시 뒤 다시 시도해 주세요.')}
        onRetry={() => void refetch()}
      />
    );
  }

  const isEmpty = bracket.groups.length === 0 && bracket.fixtures.length === 0;
  const templateFormat = format === 'knockout' || format === 'league' ? format : null;
  const confirmedTeams = registrations.filter((registration) => registration.status === 'confirmed');
  const placedIds = new Set(bracket.slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map((slot) => slot.registrationId));
  const emptySlotCount = bracket.slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId === null).length;
  const unplacedTeamCount = confirmedTeams.filter((registration) => !placedIds.has(registration.id)).length;
  const randomFillBlockedReason =
    emptySlotCount === 0 ? '비어 있는 자리가 없어요.' : unplacedTeamCount === 0 ? '배정할 수 있는 팀이 없어요.' : null;
  const published = isBracketPublished(bracketPublishedAt, bracketPublishScheduledAt);
  const hasPendingSchedule = !!bracketPublishScheduledAt && !published;
  const selectedFixture = bracket.fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? null;

  const handleAssign = (slotId: string, registrationId: string) => {
    assignSlot.mutate(
      { slotId, registrationId },
      {
        onSuccess: () => {
          setPendingRegistrationId(null);
          showToast('팀을 넣었어요.', 'success');
        },
        onError: (err) => showToast(describeBracketCanvasError(err, '팀을 넣지 못했어요.'), 'error'),
      },
    );
  };

  const handleRandomFill = () => {
    randomFill.mutate(undefined, {
      onSuccess: (result) => {
        setPendingRegistrationId(null);
        showToast(result.assignments.length === 0 ? '채울 수 있는 자리가 없어요.' : `${result.assignments.length}개 자리를 채웠어요.`, 'success');
      },
      onError: (err) => showToast(describeBracketCanvasError(err, '자리를 채우지 못했어요.'), 'error'),
    });
  };

  const handlePublish = async () => {
    const ok = await confirm({
      title: '대진표 전체 공개',
      message: '공개하면 참가팀과 방문자가 조, 일정, 대진표를 볼 수 있어요. 공개한 뒤에 대진을 바꾸면 바로 보여요.',
      confirmLabel: '전체 공개',
    });
    if (!ok) return;
    publishBracket.mutate(undefined, {
      onSuccess: (result) => showToast(result.alreadyPublished ? '이미 공개된 대진표예요.' : '대진표를 공개했어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '대진표 공개에 실패했어요.'), 'error'),
    });
  };

  const handleUnpublish = async () => {
    const ok = await confirm({
      title: published ? '대진표 공개 취소' : '공개 예약 취소',
      message: published
        ? '대진표를 다시 비공개로 되돌려요. 이미 대진표를 본 참가자의 기억까지 되돌릴 수는 없어요.'
        : '예약된 공개를 취소해요. 대진표는 계속 비공개로 남아요.',
      confirmLabel: published ? '비공개로 되돌리기' : '예약 취소',
      tone: 'danger',
    });
    if (!ok) return;
    unpublishBracket.mutate(undefined, {
      onSuccess: (result) => showToast(result.alreadyUnpublished ? '이미 비공개 상태예요.' : '대진표를 비공개로 되돌렸어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '공개 취소에 실패했어요.'), 'error'),
    });
  };

  const selectedLabels =
    selectedFixture === null
      ? null
      : {
          HOME: fixtureSideLabel(selectedFixture, 'HOME', labelContext),
          AWAY: fixtureSideLabel(selectedFixture, 'AWAY', labelContext),
        };

  return (
    <div className="flex flex-col gap-4">
      {ConfirmModal}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`tm-badge tm-badge-sm ${published ? 'tm-badge-green' : 'tm-badge-grey'}`} style={{ gap: 4 }}>
          <Globe size={12} strokeWidth={2.2} aria-hidden="true" />
          {published ? '공개 중' : hasPendingSchedule ? '공개 예약됨' : '비공개'}
        </span>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            {!isEmpty && templateFormat !== null ? (
              <Button variant="outline" size="md" onClick={() => setTemplateOpen(true)}>
                <LayoutTemplate size={16} aria-hidden="true" />
                템플릿으로 다시 만들기
              </Button>
            ) : null}
            {!isEmpty ? (
              <Button
                variant="outline"
                size="md"
                disabled={randomFillBlockedReason !== null}
                title={randomFillBlockedReason ?? undefined}
                loading={randomFill.isPending}
                onClick={handleRandomFill}
              >
                <Shuffle size={16} aria-hidden="true" />
                빈 자리 무작위 채우기
              </Button>
            ) : null}
            {!isEmpty ? (
              <>
                <Button variant="outline" size="md" onClick={() => setToolsMode('add')}>
                  <Plus size={16} aria-hidden="true" />
                  경기 추가
                </Button>
                <Button variant="outline" size="md" onClick={() => setToolsMode('link')}>
                  <Link2 size={16} aria-hidden="true" />
                  경기 연결
                </Button>
              </>
            ) : null}
            {!published ? (
              <Button variant="primary" size="md" disabled={isEmpty} title={isEmpty ? '대진을 먼저 만들어야 공개할 수 있어요.' : undefined} onClick={() => void handlePublish()}>
                지금 전체 공개
              </Button>
            ) : null}
            {published || hasPendingSchedule ? (
              <Button variant="outline" size="md" style={{ color: 'var(--red700)' }} onClick={() => void handleUnpublish()}>
                {published ? '공개 취소' : '예약 취소'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {published && canWrite ? <AlertBanner tone="warning" message="이미 공개된 대진표예요. 바꾸는 즉시 참가팀에게 보여요." /> : null}

      {isEmpty ? (
        <EmptyState
          title="아직 대진이 없어요"
          sub={
            templateFormat === null
              ? '조별+결선 방식은 목록 보기에서 조를 만들어 시작해 주세요.'
              : '템플릿으로 시작하면 경기와 팀 자리가 한 번에 만들어져요. 팀은 나중에 넣어도 돼요.'
          }
          cta={!canWrite ? undefined : templateFormat === null ? '목록으로 보기' : '템플릿으로 시작'}
          onCta={templateFormat === null ? onShowList : () => setTemplateOpen(true)}
        />
      ) : (
        <div className={`grid gap-4 ${selectedFixture === null ? 'lg:grid-cols-[240px_minmax(0,1fr)]' : 'lg:grid-cols-[240px_minmax(0,1fr)_320px]'}`}>
          <BracketTeamTray
            registrations={registrations}
            slots={bracket.slots}
            pendingRegistrationId={pendingRegistrationId}
            canWrite={canWrite}
            onPick={setPendingRegistrationId}
          />
          <BracketCanvas
            groups={bracket.groups}
            fixtures={bracket.fixtures}
            slots={bracket.slots}
            mode={format === 'league' ? 'league' : 'bracket'}
            selectedFixtureId={selectedFixture?.id ?? null}
            pendingRegistrationId={canWrite ? pendingRegistrationId : null}
            canWrite={canWrite}
            onSelectFixture={setSelectedFixtureId}
            onAssignSlot={handleAssign}
          />
          {selectedFixture !== null && selectedLabels !== null ? (
            <BracketNodePanel
              key={selectedFixture.id}
              tournamentId={tournamentId}
              fixture={selectedFixture}
              groups={bracket.groups}
              slots={bracket.slots}
              registrations={registrations}
              sideLabels={selectedLabels}
              canWrite={canWrite}
              showToast={showToast}
              onClose={() => setSelectedFixtureId(null)}
            />
          ) : null}
        </div>
      )}

      <BracketFixtureToolsDialog
        key={toolsMode ?? 'closed'}
        open={toolsMode !== null}
        mode={toolsMode ?? 'add'}
        tournamentId={tournamentId}
        bracket={bracket}
        onClose={() => setToolsMode(null)}
        showToast={showToast}
      />

      {templateFormat !== null ? (
        <BracketTemplateDialog
          open={templateOpen}
          tournamentId={tournamentId}
          format={templateFormat}
          hasExistingBracket={!isEmpty}
          onClose={() => setTemplateOpen(false)}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx`
Expected: PASS (19 tests).

Run (apps/v1_web): `./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs` — 통과해야 한다.

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx
git commit -m "feat(web): 대진 캔버스 작업 영역(툴바·트레이·캔버스·패널·공개 상태)" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx
git show --stat HEAD
```

### Task 15: `bracket/page.tsx` — [그림 | 목록] 전환

기본은 그림이고, `?view=list` 면 기존 `BracketTab` 을 그대로 보여 준다(목록 화면은 한 줄도 바꾸지 않는다). 전환은 URL 이 정본이라 새로고침·뒤로가기에서도 유지된다. `useSearchParams` 를 쓰므로 `Suspense` 로 감싼다(`app/admin/settings/page.tsx` 와 같은 방식).

**Files:**
- Modify: `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx` (현재 24줄 전체 교체)
- Test: `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.test.tsx`

**Interfaces:**
- Consumes: `SegmentedTabs` (`components/v1-ui/segmented-tabs.tsx:76`), `BracketCanvasWorkspace` (Task 14), `BracketTab` (`../bracket-tab`), `useTournamentAdmin` (`../tournament-admin-context.tsx`), `useV1AdminTournament`, `useV1AdminTournamentRegistrations`
- Produces: 기본 export `AdminTournamentBracketPage` (라우트 컴포넌트)

- [ ] **Step 1: Write the failing test**

`apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.test.tsx`

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminTournamentBracketPage from './page';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  tournament: { data: undefined as unknown },
  registrations: { data: undefined as unknown },
  admin: { tournamentId: 't-1', canWrite: true, showToast: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/tournaments/t-1/bracket',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock('../tournament-admin-context', () => ({ useTournamentAdmin: () => mocks.admin }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournament: () => mocks.tournament,
  useV1AdminTournamentRegistrations: () => mocks.registrations,
}));
vi.mock('@/components/admin/bracket-canvas/bracket-canvas-workspace', () => ({
  BracketCanvasWorkspace: (props: { tournamentId: string; format: string | undefined; canWrite: boolean; registrations: unknown[]; onShowList: () => void }) => (
    <div data-testid="workspace" data-format={props.format ?? ''} data-can-write={String(props.canWrite)} data-registrations={props.registrations.length}>
      <button type="button" onClick={props.onShowList}>목록으로 이동</button>
    </div>
  ),
}));
vi.mock('../bracket-tab', () => ({
  BracketTab: (props: { tournamentId: string; canWrite: boolean; bracketPublishedAt: string | null | undefined }) => (
    <div data-testid="list" data-published={props.bracketPublishedAt ?? ''}>{props.tournamentId}</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchParams = new URLSearchParams();
  mocks.tournament.data = { format: 'knockout', registrationDeadlineAt: null, bracketPublishedAt: '2026-10-01T00:00:00.000Z', bracketPublishScheduledAt: null };
  mocks.registrations.data = { items: [{ id: 'r1' }, { id: 'r2' }], truncated: false };
});

describe('AdminTournamentBracketPage — [그림 | 목록]', () => {
  it('기본은 그림이다: 작업 영역에 대회 방식·쓰기 권한·참가팀을 넘기고 목록은 그리지 않는다', () => {
    render(<AdminTournamentBracketPage />);
    expect(screen.getByRole('tab', { name: '그림' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '목록' })).toHaveAttribute('aria-selected', 'false');
    const workspace = screen.getByTestId('workspace');
    expect(workspace).toHaveAttribute('data-format', 'knockout');
    expect(workspace).toHaveAttribute('data-can-write', 'true');
    expect(workspace).toHaveAttribute('data-registrations', '2');
    expect(screen.queryByTestId('list')).not.toBeInTheDocument();
  });

  it('?view=list 이면 기존 목록 화면(BracketTab)을 그대로 보여 준다', () => {
    mocks.searchParams = new URLSearchParams('view=list');
    render(<AdminTournamentBracketPage />);
    expect(screen.getByRole('tab', { name: '목록' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('list')).toHaveTextContent('t-1');
    expect(screen.getByTestId('list')).toHaveAttribute('data-published', '2026-10-01T00:00:00.000Z');
    expect(screen.queryByTestId('workspace')).not.toBeInTheDocument();
  });

  it('알 수 없는 view 값은 그림으로 본다', () => {
    mocks.searchParams = new URLSearchParams('view=foo');
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('workspace')).toBeInTheDocument();
  });

  it('목록 탭을 누르면 주소에 view=list 를 남기고, 그림 탭은 view 만 지운다(다른 쿼리는 유지)', () => {
    const first = render(<AdminTournamentBracketPage />);
    fireEvent.click(screen.getByRole('tab', { name: '목록' }));
    expect(mocks.replace).toHaveBeenLastCalledWith('/admin/tournaments/t-1/bracket?view=list', { scroll: false });
    first.unmount();

    mocks.searchParams = new URLSearchParams('view=list&highlight=f1');
    render(<AdminTournamentBracketPage />);
    fireEvent.click(screen.getByRole('tab', { name: '그림' }));
    expect(mocks.replace).toHaveBeenLastCalledWith('/admin/tournaments/t-1/bracket?highlight=f1', { scroll: false });
  });

  it('그림에서 쿼리가 비면 경로만 남긴다', () => {
    mocks.searchParams = new URLSearchParams('view=list');
    render(<AdminTournamentBracketPage />);
    fireEvent.click(screen.getByRole('tab', { name: '그림' }));
    expect(mocks.replace).toHaveBeenLastCalledWith('/admin/tournaments/t-1/bracket', { scroll: false });
  });

  it('작업 영역의 목록 보기 요청도 같은 방식으로 목록으로 넘긴다', () => {
    render(<AdminTournamentBracketPage />);
    fireEvent.click(screen.getByRole('button', { name: '목록으로 이동' }));
    expect(mocks.replace).toHaveBeenLastCalledWith('/admin/tournaments/t-1/bracket?view=list', { scroll: false });
  });

  it('대회 정보를 아직 못 받았으면 방식을 모른 채로 넘기고 참가팀은 빈 목록이다', () => {
    mocks.tournament.data = undefined;
    mocks.registrations.data = undefined;
    render(<AdminTournamentBracketPage />);
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-format', '');
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-registrations', '0');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (apps/v1_web): `./node_modules/.bin/vitest run 'src/app/admin/tournaments/[id]/bracket/page.test.tsx'`
Expected: FAIL — 현재 page 는 탭 없이 `BracketTab` 만 그려서 `getByRole('tab', { name: '그림' })` 이 없다.

- [ ] **Step 3: Implement**

`apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx` 전체를 다음으로 교체한다.

```tsx
'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BracketCanvasWorkspace } from '@/components/admin/bracket-canvas/bracket-canvas-workspace';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { useV1AdminTournament, useV1AdminTournamentRegistrations } from '@/hooks/use-v1-api';
import { BracketTab } from '../bracket-tab';
import { useTournamentAdmin } from '../tournament-admin-context';

type BracketView = 'canvas' | 'list';

const VIEW_ITEMS = [
  { id: 'canvas', label: '그림' },
  { id: 'list', label: '목록' },
];

export default function AdminTournamentBracketPage() {
  return (
    <Suspense fallback={null}>
      <BracketPageBody />
    </Suspense>
  );
}

function BracketPageBody() {
  const { tournamentId, canWrite, showToast } = useTournamentAdmin();
  const { data: tournament } = useV1AdminTournament(tournamentId);
  // 확정 팀 목록은 대진 편성에 필요하다. 셸이 아니라 이 섹션에서만 구독한다.
  const { data: regData } = useV1AdminTournamentRegistrations(tournamentId);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view: BracketView = searchParams.get('view') === 'list' ? 'list' : 'canvas';
  const registrations = regData?.items ?? [];

  // 주소가 보기 방식의 정본이다 — 새로고침·뒤로가기에서도 유지되고, 다른 쿼리는 건드리지 않는다.
  const changeView = (next: BracketView) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'list') params.set('view', 'list');
    else params.delete('view');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <SegmentedTabs
        ariaLabel="대진 보기 방식"
        role="tablist"
        items={VIEW_ITEMS}
        activeId={view}
        onSelect={(id) => changeView(id === 'list' ? 'list' : 'canvas')}
      />
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
        <BracketTab
          tournamentId={tournamentId}
          showToast={showToast}
          registrations={registrations}
          registrationDeadlineAt={tournament?.registrationDeadlineAt}
          bracketPublishedAt={tournament?.bracketPublishedAt}
          bracketPublishScheduledAt={tournament?.bracketPublishScheduledAt}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run (apps/v1_web): `./node_modules/.bin/vitest run 'src/app/admin/tournaments/[id]/bracket/page.test.tsx'`
Expected: PASS (7 tests).

Run (apps/v1_web): `./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs`
Expected: 통과. 기존 목록 회귀 확인: `./node_modules/.bin/vitest run 'src/app/admin/tournaments/[id]/bracket-tab.test.tsx' 'src/app/admin/tournaments/[id]/tournament-detail-bracket-publish.test.tsx' 'src/app/admin/tournaments/[id]/tournament-detail-bracket-row-actions.test.tsx'` — PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
GIT_LITERAL_PATHSPECS=1 git add 'apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.test.tsx'
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 대진 관리 [그림|목록] 전환(기본 그림, ?view=list)" -- 'apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx' 'apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.test.tsx'
git show --stat HEAD
```

### Task 16: 공개 화면 — 빈 사이드에 자리 라벨

공개 경기 직렬화(PR-1a)가 팀이 없고 자리가 있는 사이드에 `homeSlotLabel/awaySlotLabel`("A조 1위", "3번 자리")을 준다. 공개 일정 응답(`PublicScheduleEntry`, `items[]`·`unscheduled[]`)에도 같은 두 필드가 실린다. 공개 화면 중 사이드 이름을 그리는 세 곳이 이 값을 `'TBD'`/`'미정'` 보다 먼저 보여 준다: 공개 대진표(`tournament-bracket.tsx`), 대회 상세의 일정 카드(`FixtureCard`), 공개 일정 탭(`schedule-content.tsx` 의 `sideLabel`). 세 곳 모두 **같은 헬퍼 `publicFixtureSideLabel` 하나**를 쓰고 규칙을 따로 만들지 않는다. 완료된 경기만 다루는 `tournament-venue-retention-sections.tsx`·결과 화면은 팀이 항상 정해진 경기라 대상이 아니다.

**Files:**
- Create: `apps/v1_web/src/lib/public-fixture-side-label.ts`
- Test: `apps/v1_web/src/lib/public-fixture-side-label.test.ts`
- Modify: `apps/v1_web/src/components/tournaments/tournament-bracket.tsx:47-58, 447, 454`
- Modify: `apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx:2200-2201` (+ import)
- Modify: `apps/v1_web/src/components/public-game-records/types.ts` (`PublicScheduleEntry` 에 `homeSlotLabel/awaySlotLabel`)
- Modify: `apps/v1_web/src/components/public-game-records/schedule-content.tsx:49-52, 59-61, 437, 454` (+ import)
- Modify(고정 데이터, 필수 필드라 tsc 가 알려 준다): `PublicScheduleEntry` 를 만드는 테스트 빌더 — `components/public-game-records/schedule-content.test.tsx`·`schedule-filter-return.test.tsx`·`schedule-grouping.test.ts`, `components/my/my-staff-fixtures-client.test.tsx`, `app/public-game-records.test.tsx`, `app/tournaments/[id]/bracket/bracket-page-client.test.tsx`·`bracket-schedule-permissions.test.tsx` 에 `homeSlotLabel: null, awaySlotLabel: null` 추가
- Test: `apps/v1_web/src/components/tournaments/tournament-bracket.render.test.tsx` (추가), `apps/v1_web/src/app/tournaments/[id]/fixture-card-slot-label.test.tsx` (신규), `apps/v1_web/src/components/public-game-records/schedule-content.test.tsx` (추가)

**Interfaces:**
- Consumes: `V1TournamentFixture.homeSlotLabel/awaySlotLabel` (Task 1), 서버가 주는 `PublicScheduleEntry.homeSlotLabel/awaySlotLabel: string | null` (PR-1a 생산 — 이 태스크는 웹 타입만 추가하고 서버 직렬화는 만들지 않는다)
- Produces: `publicFixtureSideLabel(name: string | null, slotLabel: string | null | undefined): string`

- [ ] **Step 1: Write the failing tests**

`apps/v1_web/src/lib/public-fixture-side-label.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { publicFixtureSideLabel } from './public-fixture-side-label';

describe('publicFixtureSideLabel', () => {
  it.each([
    ['배정됐지만 모집 중이라 가려진 팀은 자리 라벨이 있어도 비공개', null, 'A조 1위', '비공개'],
    ['TBD 이고 자리 라벨이 있으면 자리 라벨', 'TBD', 'A조 1위', 'A조 1위'],
    ['빈 이름이고 자리 라벨이 있으면 자리 라벨', '', '3번 자리', '3번 자리'],
    ['TBD 이고 자리 라벨이 없으면 미정', 'TBD', null, '미정'],
    ['빈 이름이고 자리 라벨 필드 자체가 없으면 미정', '', undefined, '미정'],
    ['실명이면 자리 라벨이 있어도 실명', '서울FC', 'A조 1위', '서울FC'],
  ] as const)('%s', (_name, name, slotLabel, expected) => {
    expect(publicFixtureSideLabel(name, slotLabel)).toBe(expected);
  });
});
```

`apps/v1_web/src/app/tournaments/[id]/fixture-card-slot-label.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentFixture } from '@/types/api';
import { FixtureCard } from './tournament-detail-client';

function fixtureWith(overrides: Partial<V1TournamentFixture>): V1TournamentFixture {
  return {
    id: 'fx-1',
    groupId: null,
    round: '4강',
    fixtureNumber: 1,
    legNumber: 1,
    scheduledAt: null,
    venue: null,
    status: 'scheduled',
    liveStatus: 'scheduled',
    homeRegistrationId: null,
    homeTeamId: null,
    homeTeamName: 'TBD',
    homeTeamLogoUrl: null,
    awayRegistrationId: null,
    awayTeamId: null,
    awayTeamName: 'TBD',
    awayTeamLogoUrl: null,
    homeSlotLabel: null,
    awaySlotLabel: null,
    result: null,
    videos: [],
    ...overrides,
  };
}

describe('FixtureCard — 빈 사이드의 자리 라벨', () => {
  it('팀이 없고 자리가 있는 사이드는 TBD 대신 자리 라벨을 보여 준다', () => {
    render(<FixtureCard fixture={fixtureWith({ homeSlotLabel: 'A조 1위', awaySlotLabel: 'B조 2위' })} />);
    expect(screen.getByText('A조 1위')).toBeInTheDocument();
    expect(screen.getByText('B조 2위')).toBeInTheDocument();
    expect(screen.queryByText('TBD')).not.toBeInTheDocument();
  });

  it('대조군: 자리 라벨이 없는 사이드는 미정, 가려진 팀은 비공개로 그대로 구분한다', () => {
    render(<FixtureCard fixture={fixtureWith({ homeSlotLabel: 'A조 1위', awayTeamName: null, awayRegistrationId: 'reg-away' })} />);
    expect(screen.getByText('A조 1위')).toBeInTheDocument();
    expect(screen.getByText('비공개')).toBeInTheDocument();
    render(<FixtureCard fixture={fixtureWith({})} />);
    expect(screen.getAllByText('미정').length).toBeGreaterThanOrEqual(2);
  });

  it('팀이 정해진 사이드는 라벨이 와도 팀 이름을 보여 준다', () => {
    render(<FixtureCard fixture={fixtureWith({ homeTeamName: '서울FC', homeRegistrationId: 'reg-home', homeSlotLabel: 'A조 1위' })} />);
    expect(screen.getByText('서울FC')).toBeInTheDocument();
    expect(screen.queryByText('A조 1위')).not.toBeInTheDocument();
  });
});
```

`apps/v1_web/src/components/tournaments/tournament-bracket.render.test.tsx` 의 `3·4위전의 미정 두 자리에 저장된 4강 패자 출처를 표시한다` 테스트 바로 아래에 추가한다(같은 파일의 `makeFixture`·`render`·`screen`·`within` 사용).

```tsx
describe('공개 대진표 — 자리 라벨', () => {
  it('TBD 사이드에 자리 라벨이 있으면 라벨을 보여 주고 대기 모양으로 그린다', () => {
    render(<TournamentBracket groups={[]} fixtures={[
      makeFixture({ id: 'rank-one', round: 'semi', fixtureNumber: 1, homeTeamName: 'TBD', homeSlotLabel: 'A조 1위', awayTeamName: 'TBD', awaySlotLabel: 'B조 2위' }),
    ]} />);
    const card = screen.getByRole('group', { name: 'A조 1위 대 B조 2위' });
    const label = within(card).getByText('A조 1위');
    expect(label).toBeVisible();
    // 아직 정해지지 않은 자리라 이긴 팀 모양(진한 글자)이 아니라 대기 색을 쓴다.
    expect(label.getAttribute('style')).toContain('var(--text-caption)');
    expect(within(card).getByText('B조 2위')).toBeVisible();
  });

  it('대조군: 라벨도 연결선도 없는 TBD 는 미정, 팀이 있는 사이드는 라벨이 와도 팀 이름', () => {
    render(<TournamentBracket groups={[]} fixtures={[
      makeFixture({ id: 'mixed', round: 'semi', fixtureNumber: 1, homeTeamName: '서울FC', homeSlotLabel: 'A조 1위', awayTeamName: 'TBD' }),
    ]} />);
    const card = screen.getByRole('group', { name: '서울FC 대 미정' });
    expect(within(card).queryByText('A조 1위')).not.toBeInTheDocument();
  });

  it('대조군: 연결선 출처가 있는 TBD 는 지금처럼 이전 경기 설명을 보여 준다', () => {
    render(<TournamentBracket groups={[]} fixtures={[
      makeFixture({ id: 'q-source', round: 'quarter', fixtureNumber: 3 }),
      makeFixture({ id: 's-target', round: 'semi', fixtureNumber: 1, homeTeamName: 'TBD', homeSlotLabel: null, bracketSources: [{ fixtureId: 'q-source', side: 'HOME', outcome: 'WINNER' }] }),
    ]} />);
    expect(screen.getByText('8강 3경기 승자')).toBeVisible();
  });
});
```

`apps/v1_web/src/components/public-game-records/schedule-content.test.tsx` 의 `양쪽 팀이 다 미정이면 …` / `한쪽 팀만 미정이면 …` 테스트가 있는 `describe` 안, `한쪽 팀만 미정이면` 테스트 바로 아래에 추가한다(같은 파일의 `makeData`·`fixtureEntry`·`render`·`screen` 사용).

```tsx
  it('팀이 없고 자리가 있는 사이드는 "미정" 대신 자리 라벨을 보여 주고 "대진 확정 전" 한 줄로 접지 않는다', () => {
    const data = makeData({
      unscheduled: [
        fixtureEntry({
          fixtureId: 'u-slot', scheduledAt: null, groupName: null, round: '4강',
          home: null, away: null, homeSlotLabel: 'A조 1위', awaySlotLabel: 'B조 2위',
          score: null, scoreStatus: 'unavailable', status: 'scheduled', resultState: 'pending',
        }),
      ],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByText('A조 1위')).toBeInTheDocument();
    expect(screen.getByText('B조 2위')).toBeInTheDocument();
    expect(screen.queryByText('대진 확정 전')).not.toBeInTheDocument();
    expect(screen.queryByText('미정')).not.toBeInTheDocument();
  });

  it('items[] 의 경기도 같다: 라벨이 없는 사이드는 미정, 팀이 있는 사이드는 라벨이 와도 팀 이름, 가려진 팀은 비공개', () => {
    const data = makeData({
      items: [
        fixtureEntry({
          fixtureId: 'i-mixed', round: '4강',
          home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '홈팀' }, homeSlotLabel: 'A조 1위',
          away: null, awaySlotLabel: null,
          score: null, scoreStatus: 'unavailable', status: 'scheduled', resultState: 'pending',
        }),
        fixtureEntry({
          fixtureId: 'i-masked', round: '4강', fixtureNumber: 2,
          home: { registrationId: 'reg-x', teamId: null, teamName: null }, homeSlotLabel: 'B조 1위',
          away: null, awaySlotLabel: '3번 자리',
          score: null, scoreStatus: 'unavailable', status: 'scheduled', resultState: 'pending',
        }),
      ],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByText('홈팀')).toBeInTheDocument();
    expect(screen.queryByText('A조 1위')).not.toBeInTheDocument();
    expect(screen.getByText('미정')).toBeInTheDocument();
    expect(screen.getByText('비공개')).toBeInTheDocument();
    expect(screen.queryByText('B조 1위')).not.toBeInTheDocument();
    expect(screen.getByText('3번 자리')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/lib/public-fixture-side-label.test.ts 'src/app/tournaments/[id]/fixture-card-slot-label.test.tsx' src/components/tournaments/tournament-bracket.render.test.tsx src/components/public-game-records/schedule-content.test.tsx`
Expected: FAIL — 헬퍼 import 실패, `FixtureCard` 가 `TBD` 를 그대로 그림, 공개 대진표가 `A조 1위` 대신 `미정` 을 그림, 일정 탭이 자리 라벨 대신 `대진 확정 전`/`미정` 을 그림(타입 오류도 함께 난다).

- [ ] **Step 3: Implement**

`apps/v1_web/src/lib/public-fixture-side-label.ts`

```ts
/**
 * 공개 화면의 사이드 이름. `null`(배정은 됐지만 모집 중이라 가려짐)과 `'TBD'`/빈 값(아직 팀 없음)은
 * 다른 상태라 "비공개"와 "미정"을 섞지 않는다. 팀이 없는 사이드에 자리 라벨("A조 1위")이 있으면
 * "미정"보다 그 라벨을 먼저 보여 준다.
 */
export function publicFixtureSideLabel(name: string | null, slotLabel: string | null | undefined): string {
  if (name === null) return '비공개';
  if (name === '' || name === 'TBD') return slotLabel || '미정';
  return name;
}
```

`apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx` — 파일 상단 import 묶음에 `import { publicFixtureSideLabel } from '@/lib/public-fixture-side-label';` 를 추가하고, 2200~2201줄을 교체한다.

```tsx
  const homeLabel = publicFixtureSideLabel(fixture.homeTeamName, fixture.homeSlotLabel);
  const awayLabel = publicFixtureSideLabel(fixture.awayTeamName, fixture.awaySlotLabel);
```
(바로 위 주석 3줄의 "`|| '미정'`은 둘 다 …" 문장은 이 헬퍼가 두 상태를 가른다는 설명으로 `// 비공개(null)·미정(TBD)·자리 라벨은 publicFixtureSideLabel 이 가른다.` 한 줄로 줄인다.)

`apps/v1_web/src/components/tournaments/tournament-bracket.tsx`

1) 55~56줄의 반환 객체를 교체한다.

```ts
  // 자리 라벨("A조 1위")이 있으면 연결선 설명보다 먼저 쓴다 — 자리가 있는 사이드는 연결선 출처가 없다.
  const placeholderName = (side: 'HOME' | 'AWAY') => (side === 'HOME' ? fixture.homeSlotLabel : fixture.awaySlotLabel) ?? sourceLabel(side);
  return { ...fixture,
    homeTeamName: fixture.homeTeamName === 'TBD' ? placeholderName('HOME') : fixture.homeTeamName,
    awayTeamName: fixture.awayTeamName === 'TBD' ? placeholderName('AWAY') : fixture.awayTeamName,
  };
```

2) 447·454줄의 `isPending` 을 라벨도 대기로 보도록 바꾼다(대기 색·점수 칸 없음).

```tsx
        isPending={fixture.homeRegistrationId === null && (fixture.bracketSources?.some((source) => source.side === 'HOME') || fixture.homeSlotLabel !== null)}
```
```tsx
        isPending={fixture.awayRegistrationId === null && (fixture.bracketSources?.some((source) => source.side === 'AWAY') || fixture.awaySlotLabel !== null)}
```

공개 일정 탭 — `apps/v1_web/src/components/public-game-records/types.ts` 의 `PublicScheduleEntry` 에서 `home`/`away` 바로 아래에 두 필드를 추가한다(서버가 항상 내려 주므로 필수, 값만 nullable).

```ts
  readonly home: PublicSideSummary | null;
  readonly away: PublicSideSummary | null;
  /** 팀이 없고 자리가 있는 사이드에만 값("A조 1위"·"3번 자리"). 서버 직렬화가 정한다. */
  readonly homeSlotLabel: string | null;
  readonly awaySlotLabel: string | null;
```

`apps/v1_web/src/components/public-game-records/schedule-content.tsx` — `import { publicFixtureSideLabel } from '@/lib/public-fixture-side-label';` 를 추가하고, `sideLabel` 과 `matchupUndecided` 를 교체한다. 두 호출부(437·454줄)는 `sideLabel(entry.home, entry.homeSlotLabel)` / `sideLabel(entry.away, entry.awaySlotLabel)` 로 바꾼다. 위쪽 JSDoc(참가팀 공개 정책 통일 설명)은 그대로 두고 규칙 구현만 헬퍼로 옮긴다.

```ts
function sideLabel(side: PublicScheduleEntry['home'], slotLabel: string | null): string {
  // side 가 null 이면 팀이 아직 없는 것(헬퍼의 빈 이름), teamName 이 null 이면 모집 중이라 가려진 것이다.
  return publicFixtureSideLabel(side === null ? '' : side.teamName, slotLabel);
}

function matchupUndecided(entry: PublicScheduleEntry): boolean {
  return entry.home === null && entry.away === null
    && entry.homeSlotLabel === null && entry.awaySlotLabel === null
    && entry.score === null;
}
```

`PublicScheduleEntry` 를 직접 만드는 테스트 빌더 7곳(Files 의 고정 데이터 목록)에 `homeSlotLabel: null, awaySlotLabel: null` 을 더한다. 어디가 빠졌는지는 `./node_modules/.bin/tsc --noEmit -p tsconfig.json` 이 알려 준다(`schedule-grouping.test.ts` 는 `as PublicScheduleEntry` 단언이라 tsc 가 못 잡으므로 직접 추가한다).

- [ ] **Step 4: Run to verify they pass**

Run (apps/v1_web): `./node_modules/.bin/vitest run src/lib/public-fixture-side-label.test.ts 'src/app/tournaments/[id]/fixture-card-slot-label.test.tsx' src/components/tournaments/tournament-bracket.render.test.tsx src/components/tournaments/tournament-bracket.test.ts src/components/public-game-records 'src/app/tournaments/[id]/fixture-card-schedule.test.tsx' 'src/app/tournaments/[id]/fixture-card-goals.test.tsx' 'src/app/tournaments/[id]/bracket/bracket-page-client.test.tsx' 'src/app/tournaments/[id]/tournament-detail-client.test.ts'`
Expected: PASS (신규 + 기존 공개 화면 회귀 — `src/components/public-game-records` 전체에 일정 탭·그룹핑·필터 복귀 테스트가 들어 있다).

Run (apps/v1_web): `./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs` — 통과해야 한다.

- [ ] **Step 5: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
GIT_LITERAL_PATHSPECS=1 git add apps/v1_web/src/lib/public-fixture-side-label.ts apps/v1_web/src/lib/public-fixture-side-label.test.ts 'apps/v1_web/src/app/tournaments/[id]/fixture-card-slot-label.test.tsx'  # 신규 파일만 add, 수정 파일은 pathspec 커밋이 잡는다
GIT_LITERAL_PATHSPECS=1 git commit -m "feat(web): 공개 대진표·일정 카드·일정 탭에서 빈 사이드에 자리 라벨 표시" -- apps/v1_web/src/lib/public-fixture-side-label.ts apps/v1_web/src/lib/public-fixture-side-label.test.ts 'apps/v1_web/src/app/tournaments/[id]/fixture-card-slot-label.test.tsx' 'apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx' apps/v1_web/src/components/tournaments/tournament-bracket.tsx apps/v1_web/src/components/tournaments/tournament-bracket.render.test.tsx apps/v1_web/src/components/public-game-records/types.ts apps/v1_web/src/components/public-game-records/schedule-content.tsx apps/v1_web/src/components/public-game-records/schedule-content.test.tsx apps/v1_web/src/components/public-game-records/schedule-filter-return.test.tsx apps/v1_web/src/components/public-game-records/schedule-grouping.test.ts apps/v1_web/src/components/my/my-staff-fixtures-client.test.tsx apps/v1_web/src/app/public-game-records.test.tsx 'apps/v1_web/src/app/tournaments/[id]/bracket/bracket-page-client.test.tsx' 'apps/v1_web/src/app/tournaments/[id]/bracket/bracket-schedule-permissions.test.tsx'
git show --stat HEAD
```

### Task 17: 릴리스 노트와 최종 검증

**Files:**
- Create: `.changeset/admin-bracket-canvas-ui.md`

- [ ] **Step 1: 변경 노트를 쓴다**

`.changeset/admin-bracket-canvas-ui.md` (두 패키지가 `fixed` 묶음이라 색인 규칙대로 함께 올린다)

```md
---
"v1_api": minor
"v1_web": minor
---

어드민 대진 관리에서 대진을 그림으로 만들고 고칠 수 있어요. 템플릿으로 토너먼트(4·8·12·16팀)와 리그 방식 대회의 경기와 팀 자리를 한 번에 만든 뒤, 참가팀을 눌러서 또는 끌어서 자리에 넣고, 빈 자리는 무작위로 채울 수 있어요. 칸에서 점수만 넣어 바로 확정하고, 확정한 점수는 사유를 남겨 고치거나 무효로 되돌릴 수 있어요. 기존 카드 화면은 [목록] 보기로 그대로 쓸 수 있어요. 공개 대진표·일정 카드·일정 탭에서는 아직 팀이 없는 칸에 "A조 1위" 같은 자리 이름이 보여요.
```

- [ ] **Step 2: PR-3 전체를 한 번에 검증한다(이 PR 의 통합 게이트 — 태스크마다 풀스위트를 돌리지 않는다)**

Run (apps/v1_web):
```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
node scripts/v1-pattern-check.mjs
./node_modules/.bin/vitest run src/lib/bracket-canvas-layout.test.ts src/lib/bracket-template-counts.test.ts src/lib/bracket-quick-score.test.ts src/lib/bracket-canvas-errors.test.ts src/lib/bracket-fixture-tools.test.ts src/lib/competition-status.test.ts src/lib/public-fixture-side-label.test.ts src/hooks/use-v1-bracket-canvas.test.tsx src/components/admin/bracket-canvas 'src/app/admin/tournaments/[id]' src/components/tournaments src/components/tournament-result-review src/components/public-game-records src/components/my src/app/public-game-records.test.tsx 'src/app/tournaments/[id]'
```
Expected: tsc 0 오류 · 패턴 검사 통과 · 위 범위 전부 PASS. 어드민 대회 폴더와 공개 대회 폴더를 포함하는 이유는 Task 1 의 고정 데이터 변경과 Task 15·16 의 수정 파일이 그 폴더의 기존 테스트에 닿기 때문이다. `src/components/public-game-records`·`src/components/my`·`src/app/public-game-records.test.tsx` 는 Task 16 의 `PublicScheduleEntry` 필드 추가 때문에 함께 돌린다.

- [ ] **Step 3: 변경 범위를 확인한다**

Run (저장소 루트): `git diff --stat origin/dev...HEAD -- . ':!docs' ':!.github'`
Expected: `apps/v1_web/` 와 `.changeset/` 만 보인다. `apps/v1_api/` 가 보이면 이 PR 의 범위 밖이다.

- [ ] **Step 4: Commit**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git add .changeset/admin-bracket-canvas-ui.md
git commit -m "chore(changeset): 어드민 대진 그림 편집기(토너먼트) 웹" -- .changeset/admin-bracket-canvas-ui.md
git show --stat HEAD
```

### Task 18: 머지 후 alpha 검증과 갤러리 (마지막 태스크 — 색인 "머지 후 확인")

코드 변경 없음. UI 가 바뀐 PR 이라 갤러리가 면제되지 않는다. 로컬 next 서버는 쓰지 않는다(CLAUDE.md 운영 워크플로 7).

- [ ] **Step 1: 배포가 내 머지를 포함하는지 확인한다(배포 창 중엔 측정하지 않는다)**

```bash
gh run list --workflow deploy-alpha.yml --branch dev --limit 1 --repo kim-song-jun/matchup-sports-platform --json headSha,status,conclusion --jq '.[0]'
curl -fsSI https://alpha.teameet.co.kr/landing | grep -i 'x-teameet-commit'
git merge-base --is-ancestor <내 머지 커밋> <x-teameet-commit 값> && echo "포함됨"
```
Expected: 배포 `success`, 헤더 SHA 가 내 머지 커밋을 포함("포함됨"). 아니면 기다렸다 다시 확인한다.

- [ ] **Step 2: ego-browser 로 사용자 흐름을 밟는다**

`ego-browser` 스킬을 먼저 읽고, alpha 어드민 계정으로 **새 테스트 대회**에서 스펙 시나리오 1·2 를 화면에서 밟는다: 8강 템플릿 → 무작위 채우기 → 점수 확정 → 결승까지, 점수 고치기·무효·`NEXT_FIXTURE_CONFLICT` 안내, [그림 | 목록] 전환(`?view=list`), 경기 추가·진출 연결. 공개 쪽은 비로그인으로 `/tournaments/:id/bracket` 대진표·일정 탭과 대회 상세 일정 카드에서 빈 사이드가 "A조 1위"/"3번 자리" 로 보이는지 본다. 계정은 저장소 밖 메모리의 alpha E2E 계정만 쓰고 어디에도 적지 않는다. **새 대회·결과를 만드는 alpha 쓰기는 실행 전에 사용자 승인을 받는다**(승인은 다른 에이전트가 대신할 수 없다). 생성한 대진은 지워지지 않으므로(`FIXTURE_NOT_DELETABLE`) 테스트 대회로만 한다. 판정은 화면과 공개 API(`GET /tournaments/:id/matches/:fixtureId`) computed 값으로 하고, console/network 오류를 같이 본다. 끝나면 `await task.finish({ keep: [] })` 로 워크스페이스를 닫는다.

- [ ] **Step 3: 390 / 768 / 1440 갤러리를 이 PR 에 게시한다**

캡처 스크립트는 `scripts/` 안에 둔다. 어드민 캔버스(그림·목록)와 공개 대진표·일정 탭을 각각 📱390 / 📲768 / 🖥1440 3열로 찍고(과한 캡처는 403 이므로 장수를 줄이고 간격을 둔다), raw URL 이 200 인지 확인한 뒤 같은 PR 코멘트로 게시한다. PR 본문에 "갤러리를 머지 후에 채우는 이유"가 있는지 확인한다. 390 화면은 PR-6 전이라 캔버스가 가로 스크롤되는 것이 정상이다. 결과(PASS/FAIL 판정·스크린샷)는 사용자 메시지에 inline 으로 싣는다.

- [ ] **Step 4: 사용자 메시지에 보고한다**

배포 SHA, 시나리오별 판정, 갤러리 코멘트 링크, 발견한 결함을 적는다. `dev → main` 승격은 사용자만 한다.

---

## Self-Review

### 스펙 항목 → 태스크 대응

| 스펙 항목 | 태스크 |
|---|---|
| S5 어드민 대진 응답 확장(`slots`, 경기 `homeSlotId/awaySlotId/game`) 웹 타입 + 고정 데이터 | 1 |
| S5 빠른 결과 요청(`Idempotency-Key` = `clientCommandId`, `expectedVersion`) | 3 (헤더·본문 일치 테스트), 12 (폼 → 훅 연결) |
| S5 점수 고치기 = `corrections` → 같은 흐름에서 `officialize`(2단계), `baseRevisionId`·참가자 그대로·`eventsHash`·`goalEvents` 생략 | 6 (payload 조립), 11 (2단계 + 서버 값 재조회) |
| S5 무효·확인은 기존 훅 재사용, 득점 기록 있는 경기는 정정 화면으로 | 11 (링크 `/admin/live/:id/records/corrections?fixtureId=`), 12 |
| S5 `QUICK_RESULT_ROSTER_SYNCING` 안내 문구 | 2, 12 (폼 안 인라인 안내) |
| S7 [그림 \| 목록] `SegmentedTabs`, 기본 그림, `?view=list`, 목록 = 기존 `BracketTab` 그대로 | 15 |
| S7 캔버스(열 + 칸 + SVG 연결선, 위치는 순수 함수) | 4, 8 |
| S7 칸(선택·드롭 대상·상태 태그 예정/진행 중/확정 전/확정·"어드민 빠른 입력") | 7 |
| S7 참가팀 트레이(끌어 놓기 + 누르고 고르기, 키보드 경로) | 9, 14 (통합 테스트) |
| S7 상세 패널(자리 배정·일정/장소·삭제·결과) | 12 |
| S7 점수 입력(무승부 결선은 승부차기) | 6, 10 |
| S7 템플릿 창(토너먼트 4/8/12/16 + 3·4위전, 리그 팀 수/회전, 개수 미리보기, `replaceExisting` 확인) | 5, 13 |
| S7 툴바(템플릿·경기 추가·연결(`bracket-sources`)·무작위 채우기·공개 상태, 이미 공개된 대회 편집 안내) | 13b, 14 |
| S7 상태(로딩 스켈레톤, 에러 `ErrorState` + 템플릿 버튼 숨김, 빈 대진 `EmptyState`) | 14 |
| S7 `canWrite=false` 읽기 전용(툴바·끌어 놓기·패널 쓰기·점수 입력 숨김) | 7, 9, 11, 12, 14 |
| S7 필수 사유 모달 재사용 | 11 (`ReasonModal`) |
| S7 캐시 무효화(대진·공개 대회·결과 훅 키) | 3 |
| S7 공개 대진표·일정 카드·일정 탭 `homeSlotLabel/awaySlotLabel` 우선(공개 일정은 PR-1a 가 필드 생산) | 16 |
| Test: 웹 레이아웃 순수 함수(열 순서·y·WINNER/LOSER/BYE 연결선) | 4 |
| Test: 웹 기본 view·`?view=list`·읽기 전용·로딩/에러/빈 상태·키보드 배정 | 14, 15 |
| Test: 각 409/422 를 해요체로, 입력 유지 | 2, 10, 11, 12 |
| Test: 결선 무승부 + 승부차기 입력 조건 | 6, 10, 12 |
| Test: 템플릿 개수 계약(웹 미리보기 숫자) | 5 |
| Mock 갱신: `V1AdminTournamentBracket` 등 고정 데이터, `bracket-tab.test.tsx` 의 `vi.mock` 데이터, 공개 대진 타입 | 1 |
| Review Focus 3: 다음 경기가 이미 시작된 뒤 정정·무효 → 해요체 안내(화면 테스트) | 2, 11 |
| 색인 웹 이름(타입·훅·`buildCanvasLayout`·`fixtureNodeState`·컴포넌트 파일명) | 1, 3, 4, 7~14 (계약 이름 그대로) |
| 변경 노트 | 17 |
| 색인 "머지 후 확인"(배포 SHA 확인·ego-browser·390/768/1440 갤러리·alpha 쓰기는 사용자 승인) | 18 (마지막) |
| 색인 웹 이름 `bracketNodeStateChip`(`competition-status.ts` + 테스트)·`useV1SetBracketSources`·`lib/bracket-fixture-tools.ts` | 7 · 13b |

### 이 PR 이 하지 않는 것(다른 PR 또는 열려 있는 항목)

- 조별+결선 템플릿·`GROUP_RANK` 점선·순위대로 채우기 창: PR-4. 이 PR 의 템플릿 대화상자 `format` 은 `'knockout' | 'league'` 만 받고, 조별+결선 대회는 빈 대진에서 "목록으로 보기"로 안내한다.
- 정규 리그 일정 보드·리그 어드민 화면: PR-5b (`buildCanvasLayout` 의 `mode: 'league'` 는 라운드별 열까지만).
- 390 라운드 탭 + 바텀시트와 구조 편집 숨김: PR-6 (이 PR 의 캔버스는 좁은 화면에서 가로 스크롤).
