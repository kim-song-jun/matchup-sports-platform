# L5 대진 관리 — 도구 메뉴 3개 + 패널 겹침 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대진 탭 도구를 `[그림|목록] · [팀 채우기 ▾] · [경기 ▾] · [시간·구장 ▾] · 공개 상태 + 「대진 공개」` 5개로 줄이고, 경기 패널은 그림 위에 겹쳐(그림 폭 불변) 기본 5칸만 보이게 하며, 폰은 같은 메뉴·패널을 시트로 써서 만들기·공개까지 한 보기에서 끝낸다.

**Architecture:** 도구 상태·대화상자는 `useBracketTools` 한 곳이 갖고 `BracketToolsBar`(C-1 `ActionMenu` 3개 + `BracketPublishControl`)가 그린다. 메뉴 항목은 순수 모델 `buildBracketToolMenus`가 형식·상태별로 정한다. 보기(그림·폰·목록)는 `BracketViewControls`(트레이 열림·시간 미정만 보기·경기 열기 요청)만 읽고, 빈 상태는 page 가 한 번 그린다. 경기 패널은 데스크톱 `BracketNodePanel`·폰 `MobileNodeSheetBody` 둘 다 `FixtureMetadataEditor`(기본 5칸 + 더 보기) 하나를 쓴다. 백엔드·API 변경 없음.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Vitest + Testing Library(+ `@/test/viewport`, `@/test/bracket-canvas-fixtures`).

**Spec:** `.github/tasks/20261140-admin-tournament-ux-renovation.md` (S5, Q6, 2차 M5-1~M5-3, 공통 용어, R-K3, C-1~C-4). Mockups: `~/.cache/teameet-admin-tournament-ux-20261127/mockups/s5-bracket/{A.html,notes.md}`, `m5-bracket/{index.html,notes.md}`.

Paths: `BC` = `apps/v1_web/src/components/admin/bracket-canvas`, `TID` = `apps/v1_web/src/app/admin/tournaments/[id]`.

## Global Constraints
- 용어(spec 표): 장소 / **구장**(필드·경기장·코트 금지) / **홈·원정**(어웨이 금지) / 신청 / **결과 확정·결과 고치기**(확인·정정·편집 금지) / 경기 시간(전·후반 / 단판, 피리어드 금지) / 자유 교체. UI 문구는 해요체, 도움말은 한 칸에 한 줄.
- **R-K3**: `border-left`·한쪽 두꺼운 색 테두리·`inset Npx 0 0` 그림자·`before:` 띠·`border: 2px solid var(--blue500)` 금지. 선택 = 옅은 배경 + 1px 테두리 색. 상태 = 글자 배지. 주황 안내 띠(M5-3)는 `AlertBanner tone="warning"`(폭 전체 상자)로, 한쪽 테두리 아님.
- 소비하는 L0 계약: `ActionMenu`(`@/components/v1-ui/action-menu`, props `label`·`actions: ActionSheetAction[]`·`trigger`·`align`), `SideSheet`(`@/components/v1-ui/side-sheet`, `open`·`title`·`onClose`·`children`·`footer`·`dirty`). C-3: 6강 방식 링크는 `/admin/tournaments/:id/info?edit=rules`(L3 계획이 6강 방식을 「경기 규칙」 섹션에 둔다). L3 의 `info-sections.ts` 가 머지돼 있으면 `infoEditHref(id, 'rules')` 를, 아니면 이 문자열 리터럴을 쓴다.
- 토큰만(하드코딩 색·크기 금지), 터치 44px, `aria-*`, `React.forwardRef` 금지, 오류는 `extractErrorMessage(err, '해요체 fallback')`, 새 주석은 코드가 못 말하는 제약만(≤3줄, 기존 파일의 주석 언어).
- 테스트 명령(`apps/v1_web`에서): `./node_modules/.bin/vitest run <경로>` · `./node_modules/.bin/tsc --noEmit -p tsconfig.json` · `node scripts/v1-pattern-check.mjs`. `prisma generate`·next dev 서버 금지(화면 검증은 머지 후 alpha).
- 커밋은 내가 만든 파일만 pathspec(`git commit -m … -- <경로>`) + `git show --stat HEAD` 확인. 새 `window.confirm`·`alert` 금지.

## Review Focus (각 줄의 테스트는 해당 Task 에 있음)
1. 읽기 전용 어드민(`canWrite=false`)은 모든 폭에서 메뉴·공개 버튼·저장·삭제가 없고 보기 전환과 공개 상태만 본다 → T9·T6.
2. 마지막 미배정 팀을 넣어도 트레이가 저절로 접히지 않는다(열림 기본값은 처음 한 번만 정함) → T7.
3. 날짜만 또는 시각만 넣고 저장하면 요청 없이 오류가 나고 입력은 남는다 → T5.
4. 「이긴 팀이 갈 경기」를 다른 경기로 바꾸면 옛 연결을 먼저 지우고, 둘째 호출이 실패하면 어디까지 저장됐는지 알린다 → T5.
5. 단계 관리(stagePlan) 대회·옛 `league_knockouts` 대회에서 메뉴가 형식별로 달라지고, 팀 자리·삭제는 단계 관리 경기에서 잠긴 채 남는다 → T4·T6.

## Action map — 지금 있는 모든 도구가 갈 곳
| 지금 | 새 위치 |
|---|---|
| 그림 \| 목록 전환 | 도구 줄 맨 앞(≥768만). 폰은 보기 하나(주소의 `view=list`는 폰에서 무시) |
| 대진 초기화(page 맨 위) | 경기 ▾ › 대진 초기화(빨강, 묶음 「되돌릴 수 없는 작업」). 빈 상태에선 숨김 |
| 시간 배정 / 구장 배정(작업 영역 버튼) | 시간·구장 ▾ › 시간 일괄 배정 / 구장 일괄 배정(같은 패널·시트) |
| 템플릿으로 다시 만들기, 목록의 「전체 대진 만들기」 | 경기 ▾ › 템플릿으로 다시 만들기. 빈 상태 버튼 「템플릿으로 대진 만들기」 |
| 경기 추가 · 경기 연결 | 경기 ▾ › 같은 이름(대화상자 그대로, 폰 포함). 폰의 칸별 연결은 시트 더 보기 「이긴 팀이 갈 경기」 |
| 빈 자리 무작위 채우기 · 목록의 「조별 빈 자리 무작위 배정」 | 팀 채우기 ▾ › 빈 자리 무작위 채우기 |
| 순위대로 채우기 | 팀 채우기 ▾ › 조 순위대로 채우기 |
| 결선 진출팀 배정(그림·목록·폰) | 팀 채우기 ▾ › 결선 진출팀 직접 정하기 |
| 참가팀 트레이(항상 펼침) | 팀 채우기 ▾ › 참가팀 목록 열기(미배정 0이면 처음부터 접힘). 폰은 팀 → 빈 자리 시트 |
| 단계·진출팀 관리(stagePlan) | 팀 채우기 ▾ 한 항목. 빈 상태 버튼 「단계대로 대진 만들기」 |
| 예선·토너먼트 대진 생성 / 배정 규칙 / 진출팀 배정(옛 league_knockouts) | 경기 ▾ › 예선·토너먼트 대진 생성 · 팀 채우기 ▾ › 토너먼트 배정 규칙·토너먼트별 진출팀 배정. 빈 상태 버튼 「예선·토너먼트 대진 생성」 |
| 공개 상태 배지 · 지금 전체 공개 · 예약 · 공개/예약 취소 · 목록의 공개 카드 | 공개 상태 + 「대진 공개」(공개 뒤 「공개 설정」) 한 곳, 확인은 시트 한 벌 |
| 안내 「이미 공개된 대진표예요」 · 비활성 이유 한 줄 | 도구 줄 아래 안내 그대로 · 메뉴 항목의 `disabledReason` |
| 칸 패널: 팀 자리·진출 연결·결과·경기 정보·경기 삭제 | 팀 자리(즉시 저장) · 시간·구장 5칸 + 더 보기(표시 문구·경기 방식·번호·구장 직접 입력·이긴 팀이 갈 경기) + 저장 · 결과(그대로) · 머리의 휴지통. 「진출 연결」 칸 구역은 「경기 ▾ › 경기 연결」과 더 보기 항목으로 대체 |
| 목록 보기의 조 카드·순위 재계산·조 만들기·12강 자동 배정·경기 수정창·조 수정창·6강 진출 관리·조별 팀 자리 편집 | 그대로(용어만 정리). 목록은 데스크톱에서 계속 쓴다(M5-2) |

---

### Task 1: 준비 확인 + `window.confirm` 2곳을 앱 확인 창으로
**Files:** Modify `BC/fixture-assignment-workspace.tsx:100`, `BC/fixture-metadata-editor.tsx:109`; Test `BC/fixture-assignment-workspace.test.tsx`, `BC/fixture-metadata-editor.test.tsx`.
**Interfaces:** Produces — 두 파일이 `useConfirm()`(`@/components/v1-ui/confirm-modal`)을 쓰고 `{ConfirmModal}`을 렌더. 리그 어드민(`app/admin/league-matches/[leagueId]/*`)의 같은 문구 3곳은 이 lane 소유가 아니다(「needs head」).
- [ ] **Step 1:** `ls apps/v1_web/src/components/v1-ui/{action-menu,side-sheet}.tsx` 가 둘 다 있어야 한다(없으면 L0 미머지 — 멈추고 보고). 최신 `origin/dev`(fetch 직후)에서 worktree·브랜치 `feat/admin-bracket-tools` 생성.
- [ ] **Step 2: 실패 테스트** — 두 테스트 파일에 각각:
```ts
it('시간·구장이 겹치면 window.confirm 이 아니라 앱 확인 창을 띄운다', async () => {
  const native = vi.spyOn(window, 'confirm');
  /* 겹치는 경기가 있는 상태에서 시각을 바꾸고 저장(배정 패널은 경기 선택) */
  expect(native).not.toHaveBeenCalled();
  expect(await screen.findByRole('dialog')).toHaveTextContent('시간·구장이 겹쳐요');
  /* 「취소」 → mutate 0회 · 「그대로 저장」(배정 패널은 「그대로 배정」) → mutate 1회 */
});
```
- [ ] **Step 3:** 두 곳에서 `const ok = await confirm({ title: '시간·구장이 겹쳐요', message: '<겹친 경기 이름>와 시간·구장이 겹쳐요. 그대로 저장할까요?', confirmLabel: '그대로 저장' })`(배정 쪽 문구는 기존 `…그대로 배정할까요?`, 라벨 「그대로 배정」). `if (!ok) return`. 기존 `window.confirm` 을 스텁하던 테스트는 위 방식으로 바꾼다.
- [ ] **Step 4:** `vitest run src/components/admin/bracket-canvas/fixture-assignment-workspace.test.tsx src/components/admin/bracket-canvas/fixture-metadata-editor.test.tsx` → PASS. **Step 5:** 커밋 `fix(web): 대진 겹침 확인을 앱 확인 창으로`.

### Task 2: 용어·R-K3 일괄 정리(이 lane 이 다시 쓰지 않는 파일)
**Files:** Modify `BC/{bracket-canvas-node,bracket-fixture-tools-dialog,bye-side-control,bye-slot-editor,bracket-template-dialog,bracket-group-knockout-fields,bracket-quick-result-form,bracket-result-actions,league-fixture-panel,finalist-assignment-dialog,six-team-template-dialog}.tsx`, `apps/v1_web/src/lib/bracket-quick-score.ts`, `TID/bracket-group-card.tsx`, 공유 부품 `components/admin/competition-field-picker.tsx`·`components/admin/period-override-field.tsx`; 각 파일의 `.test.tsx` 단언 문구. (`bracket-node-panel`·`fixture-metadata-editor`·`bracket-canvas-mobile-sheet`·`bracket-tab`은 해당 Task 가 같이 처리.)
**Interfaces:** Produces — 위 파일의 사용자 화면 문구에서 금지어 0. `BracketCanvasNode` 선택 상태 = `border: 1px solid var(--blue500)` + `background: var(--blue50)`.
- [ ] **Step 1:** 현황 목록 `git grep -nE "어웨이|경기장|필드|코트|피리어드|정정|롤링|편집" <위 파일>` (주석·식별자·API 경로는 제외, 화면에 나오는 문구와 `aria-label`만).
- [ ] **Step 2: 실패 테스트**(`bracket-canvas-node.test.tsx`): `it('선택한 칸은 2px 색 테두리 없이 1px 테두리 + 옅은 배경', …)` → `group.style.border` 가 `1px solid var(--blue500)`, `style.background` 가 `var(--blue50)`; `it('칸 줄 이름은 홈·원정', …)` → `getByRole('button',{name:/^원정 /})`. 나머지 파일은 기존 테스트의 기대 문구를 새 문구로 바꿔 먼저 FAIL 확인.
- [ ] **Step 3:** 치환 — 어웨이→원정(「홈·어웨이 리그」→「홈·원정 리그」, 「어웨이 점수」→「원정 점수」), 경기장·필드→구장(`CompetitionFieldPicker` 라벨 「등록된 구장」, 빈 값 라벨 「구장 미정」, 안내 문구도), 정정→고치기(「결과 정정 화면 열기」→「결과 고치기 화면 열기」, 「정정 사유」→「고치는 이유」, 「정정 확정」→「결과 고치기」, 「정정이 필요해요」→「결과를 고쳐야 해요」), 피리어드→「전·후반(단판은 한 번)」. 노드 선택 스타일 변경.
- [ ] **Step 4:** `vitest run` 위 파일들 + `src/components/admin` 의 `competition-field-picker`·`period-override-field` 테스트 → PASS. **Step 5:** 커밋 `refactor(web): 대진 화면 용어·선택 테두리 정리`.

### Task 3: 대진 공개 한 곳 — `BracketPublishControl`
**Files:** Create `BC/bracket-publish-control.tsx`, `BC/bracket-publish-control.test.tsx`.
**Interfaces:** Consumes `SideSheet`, `useConfirm`, `useV1PublishTournamentBracket`, `useV1UnpublishTournamentBracket`, `isBracketPublished`(`@/lib/bracket-visibility`), `kstDatetimeLocalToIso`, `formatAdminKstDateTime`(`@/lib/date-utils`). Produces:
```ts
export function isRegistrationClosed(status: V1TournamentStatus | undefined, deadlineAt: string | null | undefined, now?: number): boolean // 이전 deadlinePassed 와 같은 규칙
export function summarizeBracket(groups: readonly V1AdminBracketGroup[], fixtures: readonly V1AdminBracketFixture[]): string // '조별리그 2개 조 · 4강 · 결승, 15경기'
export interface BracketPublishControlProps { tournamentId: string; canWrite: boolean; layout: 'inline' | 'bar'; bracketPublishedAt; bracketPublishScheduledAt; registrationDeadlineAt; tournamentStatus?: V1TournamentStatus; hasGroups: boolean; summary: string; showToast }
export function BracketPublishControl(props): JSX.Element
```
- [ ] **Step 1: 실패 테스트**(기존 `TID/tournament-detail-bracket-publish.test.tsx` 사례를 새 UI 로 옮김):
```ts
it('비공개: 「비공개」 배지 + 「대진 공개」 하나. 누르면 시트에 요약·「지금 공개」·「시각 정해 공개」', …)
it('마감 전이면 주황 안내 「접수 마감 전이에요. 그래도 공개할까요?」(warning)와 일반 파란 「지금 공개」(danger 아님)', …)
it('마감 뒤·수동 마감(status closed 이후)이면 안내가 없다', …)
it('지금 공개 → publish.mutate(undefined), 성공 토스트 「대진표를 공개했어요.」', …)
it('시각 정해 공개: 입력 → 「예약하기」 → mutate({scheduledAt: KST 고정 ISO}); 과거 시각은 mutate 없이 「공개 예약 시각은 현재 시각 이후여야 해요.」', …)
it('조가 없으면 「대진 공개」가 비활성이고 이유 「조를 먼저 만들어야 공개할 수 있어요.」가 화면에 보인다', …)
it('공개됨: 「공개 중」 + 「공개 설정」, 시트의 「비공개로 되돌리기」→확인 창→unpublish.mutate', …)
it('예약됨: 「공개 예약됨 · <시각>」, 시트에서 「예약 취소」', …)
it('canWrite=false: 상태 배지만, 버튼 없음', …)
it('layout=bar(폰): 「참가자에게 아직 대진이 안 보여요」 + 같은 버튼', …)
it('summarizeBracket: 2개 조+4강+결승, 15경기', …)
```
- [ ] **Step 2:** 구현. 문구: 시트 제목 「대진을 공개할까요?」(공개·예약 뒤는 「공개 설정」), 라디오 「지금 공개 — 참가팀·방문자가 조·일정·대진을 바로 볼 수 있어요.」/「시각 정해 공개 — 정한 시각에 자동으로 공개돼요. 그 전까지는 계속 고칠 수 있어요.」(선택 시 `datetime-local`, 라벨 「공개 시각」), 맺음 「공개를 되돌릴 수는 있지만, 이미 본 참가자에게서 되돌릴 수는 없어요.」, 푸터 「닫기」+ 주 버튼 「지금 공개」/「예약하기」. 되돌리기 확인 문구·토스트는 `workspace`/`bracket-tab`의 기존 문자열 그대로. `layout='bar'` 는 `sticky bottom-[var(--v1-shell-safe-bottom,0px)]` 막대, 주 버튼은 한 개.
- [ ] **Step 3:** `vitest run src/components/admin/bracket-canvas/bracket-publish-control.test.tsx` → PASS. **Step 4:** 커밋 `feat(web): 대진 공개를 한 시트로`.

### Task 4: 메뉴 항목 모델 `buildBracketToolMenus`
**Files:** Create `BC/bracket-tool-menus.ts`, `BC/bracket-tool-menus.test.ts`.
**Interfaces:** Produces:
```ts
export type BracketToolKey = 'random-fill'|'standings-fill'|'finalists'|'team-tray'|'stage-teams'|'multi-finals-assign'|'multi-finals-rules'
  |'add-fixture'|'link-fixtures'|'template'|'multi-finals-create'|'reset'|'time-assign'|'court-assign'|'unscheduled-only';
export interface BracketToolItem { key: BracketToolKey; label: string; description: string; destructive?: boolean; groupLabel?: string; disabledReason?: string | null }
export interface BracketToolContext { format: V1TournamentFormat | undefined; hasStagePlan: boolean; isEmpty: boolean; canWrite: boolean; leagueGrid: boolean;
  hasGroupPhase: boolean; hasGroupRankSlots: boolean; randomFillBlockedReason: string | null; formatUnknownReason: string | null;
  unplacedTeamCount: number; unscheduledCount: number; unscheduledOnly: boolean }
export function buildBracketToolMenus(ctx): { teamFill: BracketToolItem[]; match: BracketToolItem[]; timeVenue: BracketToolItem[] }
export function bracketCreateAction(ctx: Pick<BracketToolContext,'format'|'hasStagePlan'|'canWrite'>): { key: 'template'|'stage'|'multi-finals-create'; label: string } | null
export function hasGroupRankSlots(slots: ReadonlyArray<{ kind: string; sourceGroupId?: string | null }>): boolean // 옛 순위 채우기 버튼의 표시 조건
```
- [ ] **Step 1: 실패 테스트**(표 형태 `it.each`로 키 배열을 단언):
```ts
it('knockout·내용 있음: teamFill [random-fill, team-tray] · match [add-fixture, link-fixtures, template, reset] · timeVenue [time-assign, court-assign, unscheduled-only]', …)
it('group_knockout + 순위 자리 있음: teamFill 에 standings-fill·finalists 가 추가된다', …)
it('league(leagueGrid): link-fixtures 만 빠진다', …)
it('stagePlan(league_knockouts): teamFill [stage-teams] · match [reset] · random-fill·add-fixture·template 없음', …)
it('옛 league_knockouts(단계 없음): teamFill [multi-finals-assign, multi-finals-rules] · match [multi-finals-create, reset]', …)
it('빈 대진·읽기 전용: 세 배열이 모두 빈다(메뉴 자체가 사라진다)', …)
it('reset 은 destructive 이고 groupLabel 「되돌릴 수 없는 작업」이 있다', …)
it('disabledReason 이 그대로 실린다: random-fill=randomFillBlockedReason, add·link=formatUnknownReason', …)
it('unscheduled-only: 0건이면 「모든 경기에 시간이 있어요.」로 비활성, 켜져 있으면 「모든 경기 보기」', …)
it('bracketCreateAction: 템플릿 형식 「템플릿으로 대진 만들기」 · stagePlan 「단계대로 대진 만들기」 · 옛 league_knockouts 「예선·토너먼트 대진 생성」 · 읽기 전용·형식 모름 null', …)
it('hasGroupRankSlots: sourceGroupId 가 있는 GROUP_RANK 가 하나라도 있을 때만 true', …)
```
- [ ] **Step 2:** 구현 + 항목 문구(라벨 — 설명): 빈 자리 무작위 채우기 — 「확정 팀을 비어 있는 자리에 골고루 넣어요」 · 조 순위대로 채우기 — 「조별리그가 끝나면 순위에 맞춰 결선 자리에 넣어요」 · 결선 진출팀 직접 정하기 — 「순위와 다르게 넣어야 할 때 써요」 · 참가팀 목록 열기 — 「팀을 골라 자리에 넣어요 · 자리 없는 팀 {n}」 · 단계·진출팀 관리 — 「단계별 참가팀과 진출 방식을 정해요」 · 토너먼트별 진출팀 배정 — 「예선 결과로 토너먼트마다 진출팀을 넣어요」 · 토너먼트 배정 규칙 — 「순위별로 어느 토너먼트에 가는지 정해요」 · 경기 추가 — 「조나 라운드에 경기를 하나 더 만들어요」 · 경기 연결 — 「이긴 팀이 다음 경기로 올라가게 이어요」 · 템플릿으로 다시 만들기 — 「조 수나 진출 방식을 바꿔 새로 짜요」 · 예선·토너먼트 대진 생성 — 「예선 조를 편성하고 토너먼트를 만들어요」 · 대진 초기화 — 「모든 경기와 팀 자리를 지워요」 · 시간 일괄 배정 — 「시간을 등록하고 경기를 골라 넣어요」 · 구장 일괄 배정 — 「구장을 고르고 경기를 골라 넣어요」 · 시간 미정 경기만 보기 — 「{n}경기가 아직 시간 미정이에요」.
- [ ] **Step 3:** `vitest run src/components/admin/bracket-canvas/bracket-tool-menus.test.ts` → PASS. **Step 4:** 커밋 `feat(web): 대진 도구 메뉴 항목 모델`.

### Task 5: 경기 편집 = 기본 5칸 + 더 보기, 「이긴 팀이 갈 경기」
**Files:** Create `BC/winner-target-link.ts`(+test), `BC/winner-target-field.tsx`(+test); Modify `BC/fixture-metadata-editor.tsx`(+test), `BC/fixture-time-picker.tsx`(라벨 「시각 고르기」, 보조 문구 삭제).
**Interfaces:** Consumes `bracketSourceCandidates`·`bracketExistingSource`·`isFixtureLinkable`(`@/lib/bracket-fixture-tools`), `useV1SetBracketSources`, `fixtureTitle`(`./bracket-canvas`). Produces:
```ts
export type LinkOutcome = 'WINNER' | 'LOSER';                       // 대상 경기가 third_place 면 LOSER
export interface WinnerTargetOption { value: string /* `${targetId}:${HOME|AWAY}` */; label: string }
export function winnerTargetOptions(i: { source: V1AdminBracketFixture; outcome: LinkOutcome; groups: readonly V1AdminBracketGroup[]; fixtures: readonly V1AdminBracketFixture[]; titleOf: (f: V1AdminBracketFixture) => string }): { options: WinnerTargetOption[]; current: string }  // 라벨 '<경기 제목> · 홈 자리|원정 자리', 이미 다른 경기가 차지한 자리는 제외, 현재 연결은 항상 포함
export function planWinnerTargetLink(i: { source; outcome: LinkOutcome; fixtures; nextValue: string }): Array<{ fixtureId: string; homeSourceFixtureId: string | null; awaySourceFixtureId: string | null }>  // 옛 연결 해제 → 새 연결 순서, 같은 대상이면 한 건으로 합침, 반대편 자리의 출처는 보존
export function WinnerTargetField(props: { tournamentId; fixture; groups; fixtures; canWrite: boolean; showToast }): JSX.Element | null  // 후보가 없고 현재 연결도 없으면 null
// fixture-metadata-editor.tsx 의 FixtureMetadataEditor 는 prop `showToast` 를 새로 받는다(그 외 prop 불변)
```
- [ ] **Step 1: 실패 테스트** `winner-target-link.test.ts`: 4강 1번 → 결승 홈 자리 선택 시 결승 대상 patch `{homeSourceFixtureId: '4강1', awaySourceFixtureId: <결승의 기존 원정 출처 보존>}` / 결승 홈→원정으로 옮기면 한 건(홈 null, 원정 4강1) / 결승→다른 경기로 바꾸면 `[옛 대상 해제, 새 대상 설정]` 순서 / `nextValue=''` 면 해제만 / third_place 대상은 `LOSER` 옵션으로만 나온다. `winner-target-field.test.tsx`: `it('4강 경기의 「이긴 팀이 갈 경기」에서 결승 홈 자리를 고르면 setSources 를 한 번 부르고 「이긴 팀이 갈 경기를 저장했어요.」 토스트', …)`, `it('둘째 호출이 실패하면 「이긴 팀이 갈 경기를 모두 바꾸지 못했어요. 앞선 변경은 저장됐어요: …」 토스트(extractErrorMessage)', …)`, `it('3·4위전이 있으면 「진 팀이 갈 경기」가 따로 나온다', …)`, `it('결승 경기에는 필드가 없다(null)', …)`, `it('canWrite=false 는 선택이 잠긴다', …)`.
- [ ] **Step 2: 실패 테스트** `fixture-metadata-editor.test.tsx`:
```ts
it('기본에는 날짜·시각·구장과 「더 보기」만 있고 경기 번호·표시 문구·경기 방식은 펼쳐야 보인다', …)  // queryByLabelText('경기 번호') null → 클릭 후 존재
it('접어 둔 더 보기 값도 저장된다: 펼쳐 번호를 7로 바꾸고 접은 뒤 「저장」 → payload fixtureNumber 7', …)
it('날짜만 넣고 저장하면 「날짜와 시각을 함께 정해 주세요.」 오류, mutate 0회, 입력 유지', …)  // 시각만 넣은 경우도
it('날짜 2026-12-20 + 시각 09:00 → scheduledAt 2026-12-20T00:00:00.000Z(KST 고정)', …)
it('「날짜·시각 비우기」가 scheduledAt: null 로 저장된다', …)
it('「자동 문구 복원」 버튼이 없고, 표시 문구를 지우면 흐린 자동 문구가 placeholder 로 남는다', …)
it('구장 선택(등록 구장)이 fieldId 로 저장되고, 「구장 직접 입력」은 더 보기 안에서만 보인다', …)
it('읽기 전용: 입력 비활성·「저장」 없음', …)
```
- [ ] **Step 3:** 구현. `FixtureMetadataEditor`: 상태 `date`·`clock`(저장 직전에만 `YYYY-MM-DDTHH:mm`으로 합쳐 `kstDatetimeLocalToIso`), 기본 구역 제목 「시간·구장」(날짜 `type=date`, 시각 `type=time`, `FixtureTimePicker`, 구장 `CompetitionFieldPicker allowEmpty emptyLabel="구장 미정"`, ghost 「날짜·시각 비우기」 44px). 「더 보기」 버튼은 `aria-expanded`·`aria-controls`, 설명 줄 「표시 문구 · 경기 방식 · 번호 · 이긴 팀이 갈 경기」. 더 보기 본문 = `FixtureLabelFields`(경기 제목·홈 표시 문구·원정 표시 문구, 복원 버튼·`자동 문구:` 힌트 문단 삭제 — `bracket-tab` 수정창도 같이 따라간다) · `PeriodOverrideField` · 「경기 번호」 · 「구장 직접 입력」(`PlacePicker`, 등록 구장을 안 골랐을 때만) + 「구장 비우기」 · `WinnerTargetField`. 맨 아래 「저장」(기존 「경기 정보 저장」). 충돌 확인·기간 저장 실패 문구는 기존 로직 유지(Task 1).
- [ ] **Step 4:** `vitest run src/components/admin/bracket-canvas/{winner-target-link,winner-target-field,fixture-metadata-editor}.test.*` → PASS. **Step 5:** 커밋 `feat(web): 경기 편집 기본 5칸과 이긴 팀이 갈 경기`.

### Task 6: 겹치는 칸 패널 `BracketNodePanel` + 붙는 쪽 규칙
**Files:** Modify `BC/bracket-node-panel.tsx`(+test); Create `BC/panel-dock-side.ts`(+test).
**Interfaces:** Consumes `FixtureMetadataEditor`(+`showToast`). Produces `export function panelDockSide(i: { nodeCenterX: number; containerWidth: number }): 'start' | 'end'` (중심이 폭의 절반을 넘으면 `start`, 아니면 `end`; 폭 0 은 `end`). `BracketNodePanelProps` 불변(`onClose` 포함).
- [ ] **Step 1: 실패 테스트** `panel-dock-side.test.ts`: `(100,1136)→'end'` · `(900,1136)→'start'` · `(568,1136)→'end'` · `(10,0)→'end'`. `bracket-node-panel.test.tsx` 갱신:
```ts
it('섹션은 팀 자리 · 시간·구장(5칸) · 결과 순이고, 별도 「진출 연결」 구역과 아래쪽 「경기 삭제」 글자 버튼은 없다', …)
it('머리의 휴지통(aria-label 「경기 삭제」)이 확인 창을 거쳐 deleteFixture 를 부르고, 후속 경기 수·결과 보호 문구가 메시지에 남는다', …)
it('단계 관리 경기(bracketTrack stage:)와 읽기 전용에는 휴지통이 없고, 팀 자리는 「진출팀은 「팀 채우기」 메뉴에서 정해요.」 안내만 보인다', …)
it('ESC 로 닫힌다', …)
```
기존 「진출 연결 저장」 시험은 삭제하고, 같은 계약(출처 두 칸 저장)은 `경기 ▾ › 경기 연결` 대화상자 시험(`bracket-fixture-tools-dialog.test.tsx`)이 이미 지킨다는 것을 확인(없으면 그쪽에 추가).
- [ ] **Step 2:** 구현 — 단계·결선 경기 팀 자리 안내를 「진출팀은 「팀 채우기」 메뉴에서 정해요.」로 바꾸고(옛 「페이지 위의 …」), `useV1SetBracketSources`·출처 state·`진출 연결` 구역 삭제, 휴지통 `Trash2` 44px 아이콘 버튼(머리, 닫기 X 왼쪽), `aside` 에 `box-shadow: var(--shadow-dropdown)`, `onKeyDown` ESC → `onClose`. 용어는 `SIDE_NAME` 원정 포함.
- [ ] **Step 3:** `vitest run src/components/admin/bracket-canvas/{panel-dock-side,bracket-node-panel}.test.*` → PASS. **Step 4:** 커밋 `feat(web): 칸 패널을 겹침용으로 정리`.

### Task 7: 작업 영역 — 패널 겹침·트레이 접기·보기 컨트롤
**Files:** Create `BC/use-bracket-view-controls.ts`, `BC/bracket-empty-state.tsx`, `BC/use-team-placement.ts`(+tests); Modify `BC/bracket-canvas-workspace.tsx`(+test), `BC/bracket-team-tray.tsx`(+test), `BC/bracket-canvas-node.tsx`(+test), `BC/bracket-canvas.tsx`·`BC/bracket-league-grid.tsx`(`dimmedFixtureIds` 전달).
**Interfaces:** Produces:
```ts
export interface BracketViewControls { trayOpen: boolean | null; setTrayOpen(open: boolean): void; unscheduledOnly: boolean; setUnscheduledOnly(on: boolean): void;
  focusRequest: { fixtureId: string; nonce: number } | null; requestFocus(fixtureId: string): void }
export function useBracketViewControls(): BracketViewControls
export function useTeamPlacement(tournamentId: string, bracket: V1AdminTournamentBracket, showToast, onPlaced?: () => void): { placeIntoSlot(slotId, registrationId): void; placeDirect(fixtureId, side: SideKey, registrationId): void; pending: boolean } // 워크스페이스의 handleAssign/handleAssignDirect 를 그대로 옮김(한 팀 한 조·결선 충돌 검사 포함, 성공하면 onPlaced)
export function BracketEmptyState(props: { canWrite: boolean; create: { key: 'template'|'stage'|'multi-finals-create'; label: string } | null; onCreate: () => void; sixTeamNotice: boolean; infoHref: string }): JSX.Element
// BracketTeamTray: 선택 prop `expanded?: boolean; onExpandedChange?: (v: boolean) => void`(collapsible 모드의 펼침을 부모가 쥘 수 있게; 없으면 지금처럼 내부 상태)
// BracketCanvasNode: 선택 prop `dimmed?: boolean` → data-dimmed + 낮은 불투명도 토큰(aria 는 그대로)
// BracketCanvasWorkspaceProps: onShowList·kind·bracketPublishedAt·bracketPublishScheduledAt 삭제, `controls: BracketViewControls` 추가
```
- [ ] **Step 1: 실패 테스트**(`bracket-canvas-workspace.test.tsx`, 1440):
```ts
it('칸을 열어도 그림 영역(data-testid=bracket-canvas-area)의 className·부모 그리드가 그대로고, 패널은 그 영역 안에 겹쳐 있다(옆 칸이 아니다)', …)
it('패널은 칸이 왼쪽 절반이면 end, 오른쪽 절반이면 start 에 붙는다(opener 의 getBoundingClientRect 를 스텁)', …)
it('미배정 팀이 있으면 트레이가 처음부터 열려 있고, 0 이면 접혀 있다; 마지막 팀을 넣어도 저절로 접히지 않는다', …)
it('controls.trayOpen=true 면 미배정 0 이어도 트레이가 열린다', …)
it('리그 격자(1440): 순위표 옆 열은 항상 있고 칸 패널이 그 위가 아니라 그림 위에 겹친다', …)
it('1023 이하: 패널은 시트(dialog)·트레이는 펼침 토글이 controls 를 따른다(기존 태블릿 시험 유지)', …)
it('controls.unscheduledOnly: 시간이 있는 칸에 data-dimmed, 시간 미정 칸은 그대로', …)
it('controls.focusRequest 가 오면 그 경기가 열리고, 없는 id 면 아무것도 열지 않는다', …)
it('읽기 전용: 칸 패널 저장·삭제가 없다(패널에 canWrite=false 전달)', …)
```
기존 시험 중 도구 모음·공개·빈 상태·순위 채우기 단언은 삭제(Task 3·4·9 로 이동). 트레이 `expanded` 제어 시험은 `bracket-team-tray.test.tsx`.
- [ ] **Step 2:** 구현. 워크스페이스는 도구 줄·공개 배지·템플릿/도구/순위 대화상자·빈 상태 분기를 걷어내고 `useTeamPlacement` 를 쓴다. 레이아웃: `flex gap-4` 안에 [트레이 240px(≥1024 & 열림일 때만)] + `relative min-w-0 flex-1` 그림 영역(`data-testid="bracket-canvas-area"`); 패널은 `pointer-events-none absolute inset-y-0 z-10 w-[360px] max-w-full` 래퍼(`start-0`/`end-0`, `data-dock`) 안의 `pointer-events-auto sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto`. 붙는 쪽은 `useLayoutEffect` 에서 `[data-fixture-opener]` 의 rect 와 영역 rect 로 `panelDockSide`(opener 가 없으면 `end`). 트레이 열림 = `controls.trayOpen ?? 처음 한 번 정한 값`(`useRef`, 참가팀·대진이 둘 다 불러와진 첫 렌더에서 `미배정>0` 으로 확정). 리그 격자는 `grid-cols-[minmax(0,1fr)_320px]` 순위표 열 고정(선택 여부와 무관), 「순위표 보기」 토글 삭제, <1440 의 「순위표」 시트 버튼은 유지.
- [ ] **Step 3:** `vitest run src/components/admin/bracket-canvas/{bracket-canvas-workspace,bracket-team-tray,bracket-canvas-node,bracket-empty-state}.test.*` → PASS. **Step 4:** 커밋 `feat(web): 칸 패널을 그림 위에 겹치고 트레이를 접는다`.
- 빈 상태 시험(`bracket-empty-state.test.tsx`): `it('제목 「아직 대진이 없어요」, 버튼은 create.label 하나뿐이고 시간·구장 배정·초기화·공개 문구가 없다')` · `it('create=null 이면 버튼이 없다(읽기 전용·형식 모름)')` · `it('sixTeamNotice 면 「6강 방식을 먼저 정해요」 링크가 infoHref+"?edit=rules" 를 가리킨다')` · `it('폰 문구 「큰 화면에서 해요」가 어디에도 없다')`. 문구: 템플릿 「템플릿을 고르면 조와 경기가 한 번에 만들어져요. 팀은 나중에 넣어도 돼요.」 / 단계 「단계 구성에 맞춰 조와 경기가 한 번에 만들어져요. 팀은 나중에 넣어도 돼요.」 / 옛 league_knockouts 「예선 조를 편성하면 토너먼트까지 한 번에 만들어져요.」 / 읽기 전용 「아직 만들어진 대진이 없어요.」.

### Task 8: 대화상자 소유자를 메뉴가 열 수 있게 바꾼다
**Files:** Rename `BC/bracket-reset-button.tsx`→`BC/use-bracket-reset-flow.tsx`(+test); Modify `BC/fixture-assignment-workspace.tsx`(+test), `components/admin/stages/stage-plan-toolbar.tsx`→`stage-plan-dialog.tsx`(+`stage-plan-manager.test.tsx` 참조); Delete `BC/finalist-assignment-button.tsx`, `BC/bracket-standings-fill-button.tsx`(+test).
**Interfaces:** Produces:
```ts
export function useBracketResetFlow(tournamentId: string, canWrite: boolean, showToast): { start(): void; busy: boolean; error: string | null; ConfirmModal: ReactNode }
// FixtureAssignmentWorkspace props: { tournamentId; canWrite; canManageFields; showToast; mode: 'time'|'court'|null; onModeChange(next: 'time'|'court'|null): void; children }  — toolbar prop·내부 「시간 배정」「구장 배정」 버튼 삭제
export function StagePlanDialog(props: { open: boolean; onClose: () => void; tournamentId: string; canWrite: boolean; canOverride: boolean; tournamentStatus?: string }): JSX.Element
```
- [ ] **Step 1: 실패 테스트** — reset: 기존 `bracket-reset-button.test.tsx` 사례를 훅으로(`start()` → preview → 확인 창(confirmationText 「초기화한다」) → reset; preview 거절 시 `error` 에 이유; 쓰기 권한 없으면 `start` 가 아무 것도 안 함). 배정 패널: `render(<FixtureAssignmentWorkspace mode="time" …>)` 가 시간 배정 패널을 열고 `mode="court"` 가 구장 패널, `null` 이면 닫힘, 패널의 「닫기」가 `onModeChange(null)`; 내부 「시간 배정」 버튼이 더는 없다. 단계 대화상자: `open` 이 true 일 때만 dialog, 저장 안 한 입력이 있으면 닫기 전 확인(기존 시험 유지).
- [ ] **Step 2:** 구현·이름 바꾸기. `git mv`(reset·stage-plan), 순위 채우기·결선 진출팀 버튼은 다이얼로그(`BracketStandingsFillDialog`·`FinalistAssignmentDialog`)를 Task 9 가 직접 쓰므로 버튼 파일 삭제. `finalist` 의 `supportsRound12` 계산(`조별 조 5개 + round12 조 존재`)은 Task 9 로 옮김.
- [ ] **Step 3:** `vitest run src/components/admin/bracket-canvas/{use-bracket-reset-flow,fixture-assignment-workspace}.test.tsx src/components/admin/stages` → PASS. **Step 4:** 커밋 `refactor(web): 대진 도구 대화상자를 메뉴가 열 수 있게`.

### Task 9: `useBracketTools` + `BracketToolsBar`
**Files:** Create `BC/use-bracket-tools.tsx`, `BC/bracket-tools-bar.tsx`(+tests).
**Interfaces:** Consumes Task 3·4·7·8 산출물, `ActionMenu`, `BracketTemplateDialog`(`allowSplitBracket={kind==='regular_tournament'}`), `BracketFixtureToolsDialog`, `BracketStandingsFillDialog`, `FinalistAssignmentDialog`, `StagePlanDialog`, `MultiFinalsWizard`. Produces:
```ts
export interface UseBracketToolsInput { tournamentId: string; tournament: V1Tournament | undefined; registrations: V1AdminTournamentRegistration[]; registrationsState: RegistrationsLoadState; canWrite: boolean; role: string; showToast; controls: BracketViewControls; assignmentMode: 'time'|'court'|null; onAssignmentModeChange(m: 'time'|'court'|null): void }
export interface BracketTools { loading: boolean; isEmpty: boolean; hasGroups: boolean; summary: string; unscheduledCount: number; menus: { teamFill: ActionSheetAction[]; match: ActionSheetAction[]; timeVenue: ActionSheetAction[] };
  create: { key: 'template'|'stage'|'multi-finals-create'; label: string } | null; openCreate(): void; resetError: string | null; dialogs: ReactNode }
export function useBracketTools(input: UseBracketToolsInput): BracketTools
export function BracketToolsBar(props: { tools: BracketTools; tournament: V1Tournament | undefined; tournamentId: string; canWrite: boolean; view: 'canvas'|'list'; onViewChange(v): void; controls: BracketViewControls; showToast }): JSX.Element | null
```
`menus` 는 `buildBracketToolMenus` 결과를 `{ key, label, description, destructive, groupLabel, disabledReason, onSelect }` 로 바꾼 것. 항목→동작: random-fill=`useV1RandomFillSlots`(결과 토스트 기존 문구) · standings-fill/finalists/add/link/template/stage/multi-finals=각 대화상자 열기 · team-tray=`controls.setTrayOpen(true)` · reset=`useBracketResetFlow.start` · time/court=`onAssignmentModeChange` · unscheduled-only=`controls.setUnscheduledOnly(!on)`. 템플릿 적용 뒤·경기 추가 뒤에는 `controls.requestFocus(첫 경기/새 경기 id)`.
- [ ] **Step 1: 실패 테스트**(`bracket-tools-bar.test.tsx`, hooks 는 형제 시험처럼 mock):
```ts
it('1440·내용 있음: 보이는 조작은 보기 전환 · 팀 채우기 · 경기 · 시간·구장 · 공개, 합쳐 5개 이하', …)
it('「경기」를 열면 경기 추가 · 경기 연결 · 템플릿으로 다시 만들기 · 대진 초기화(빨강)가 설명과 함께 보이고, 「경기 추가」는 대화상자를 add 모드로, 「경기 연결」은 link 모드로 연다', …)
it('「빈 자리 무작위 채우기」가 randomFill.mutate 를 부르고 채운 수를 토스트로 알린다; 막힌 이유는 항목 아래에 보이고 누를 수 없다', …)
it('「참가팀 목록 열기」가 controls.setTrayOpen(true)', …)  it('「시간 일괄 배정」·「구장 일괄 배정」이 onAssignmentModeChange 를 time·court 로 부른다', …)
it('「시간 미정 경기만 보기」를 켜면 줄 아래 「시간 미정 N경기만 보는 중 · 모두 보기」 칩이 생기고 칩으로 끈다', …)
it('「대진 초기화」는 확인 창에서 「초기화한다」 입력 뒤에만 reset 을 부른다', …)
it('format group_knockout: 「결선 진출팀 직접 정하기」가 다이얼로그를 연다 / stagePlan: 「단계·진출팀 관리」 / 옛 league_knockouts: 토너먼트 항목 3개', …)
it('빈 대진이면 도구 줄이 통째로 없다(null)', …)  it('읽기 전용: 보기 전환·공개 상태만', …)
it('공개된 대진 + 쓰기 권한: 「이미 공개된 대진표예요. 바꾸는 즉시 참가팀에게 보여요.」 안내', …)
it('폰(390): 메뉴 3개가 한 줄이고 보기 전환이 없으며 공개 막대가 sticky 로 따로 있다', …)
it('초기화 실패 이유가 role=alert 로 줄 아래에 보인다', …)
```
항목 접근: ≥768 `getByRole('menuitem',{name:/경기 추가/})`, 미만은 열린 dialog 안의 button.
- [ ] **Step 2:** 구현(`useBracketTools` 는 `useV1AdminBracket` 로 `isEmpty`·`hasGroupRankSlots`·`unplacedTeamCount`·`unscheduledCount`·`randomFillBlockedReason`·`formatUnknownReason` 를 계산 — 문자열은 기존 워크스페이스 값을 그대로 옮김; `StagePlanDialog` 는 `role==='PLATFORM_OPS'` 일 때 `canOverride`). 트리거는 `Button variant="outline" size="md"` + 뒤쪽 `ChevronDown`, `ActionMenu label="팀 채우기|경기|시간·구장"`. 데스크톱 한 줄·폰은 `grid-cols-3` 44px.
- [ ] **Step 3:** `vitest run src/components/admin/bracket-canvas/{use-bracket-tools,bracket-tools-bar}.test.tsx` → PASS. **Step 4:** 커밋 `feat(web): 대진 도구 줄 메뉴 3개`.

### Task 10: 폰 — 한 보기에서 만들기·공개·팀 채우기·시트 편집
**Files:** Modify `BC/bracket-canvas-mobile-sheet.tsx`(+test), `BC/bracket-canvas-mobile.tsx`(+test), `BC/bracket-canvas-mobile-screen.tsx`(+test); Create `BC/team-fill-targets.ts`, `BC/mobile-team-fill-sheet.tsx`(+tests).
**Interfaces:** Produces:
```ts
export interface TeamFillTarget { key: string; label: string /* 'A조 1번 경기 · 홈' */; fixtureId: string; side: 'HOME'|'AWAY'; slotId: string | null }
export function teamFillTargets(i: { fixtures; slots; groups; registrationId: string }): TeamFillTarget[]  // 팀이 비어 있고 잠기지 않은(isFixtureLocked 아님·단계 경기 아님) 자리, 한 팀 한 조(`registrationIdsBlockedForGroup`)·결선 충돌 규칙을 통과하는 것만
export function MobileTeamFillSheet(props: { open: boolean; onClose(): void; tournamentId: string; bracket: V1AdminTournamentBracket; registrations; registrationsState; showToast }): JSX.Element  // 1단계 미배정 팀 목록 → 2단계 「넣을 자리」 목록, 고르면 useTeamPlacement 로 저장
// BracketCanvasMobileProps: 선택 prop `hint?: string | null`(null 이면 안내 줄 숨김, 생략=지금 문구 → 리그 화면 불변)
// BracketCanvasMobileScreenProps: `controls: BracketViewControls` 추가, 빈 상태·`FinalistAssignmentButton` 삭제(빈 상태는 page 가 그림)
```
- [ ] **Step 1: 실패 테스트**:
```ts
it('시트(tournament): 팀 자리 · 시간·구장 기본 5칸 · 「더 보기」 · 저장이 있고 「이긴 팀이 갈 경기」는 더 보기 안에 있다', …)
it('시트 머리의 휴지통이 확인 창을 거쳐 경기를 삭제하고 시트를 닫는다; 읽기 전용·단계 경기엔 없다', …)
it('league 시트는 그대로: 「구장 저장」 한 칸(MobileFieldSetting)·휴지통 없음(대조군)', …)
it('screen: 「대진 구조는 큰 화면에서 편집해요」 안내가 없다', …)  it('screen: 시간 미정만 보기를 켜면 시간 있는 카드가 사라지고 0건이면 「시간 미정 경기가 없어요」 + 「모든 경기 보기」', …)
it('screen: controls.focusRequest 의 경기 시트가 열린다', …)  it('screen: controls.trayOpen=true 면 MobileTeamFillSheet 가 열리고 닫으면 setTrayOpen(false)', …)
it('teamFillTargets: 다른 조 팀은 그 조 자리에 안 나오고, 잠긴 경기·이미 팀이 있는 자리·단계 경기는 빠진다(대조군: 같은 조 팀은 나온다)', …)  // 조 둘·팀 둘 이상으로 좁힘 양쪽 단언
it('team fill sheet: 팀을 고르면 「넣을 자리」가 나오고, 자리를 누르면 슬롯 자리는 assign.mutate(slotId), 직접 자리는 updateFixture.mutate(homeRegistrationId) 를 부르고 「팀을 넣었어요.」', …)
it('team fill sheet: 미배정 팀이 없으면 「자리 없는 팀이 없어요」', …)
```
- [ ] **Step 2:** 구현 — 시트(tournament 경로)는 `SideRow` 팀 행(그대로, 「원정」; 순위 자리 안내는 「조 순위가 정해지면 「팀 채우기」 메뉴에서 순위대로 채워요.」) → `FixtureMetadataEditor`(기본 5칸+더 보기+저장) → `ResultSection`(그대로) 순, 머리 오른쪽에 44px 휴지통(`useV1DeleteFixture`, 확인 창 문구는 `bracket-node-panel` 과 같음, 삭제 뒤 `onDone`). `MobileFieldSetting` 은 league 전용으로 남기되 문구 「구장」. 화면: 라운드 칩(그대로)·카드·시트 + `controls` 연결, 시간 미정 필터는 `rounds` 의 `sections[].nodes` 를 `scheduledAt === null` 로 거르고 빈 구역 제거.
- [ ] **Step 3:** `vitest run src/components/admin/bracket-canvas/{bracket-canvas-mobile,bracket-canvas-mobile-sheet,bracket-canvas-mobile-screen,team-fill-targets,mobile-team-fill-sheet}.test.tsx src/app/admin/league-matches` → PASS(리그 화면 시험이 같이 도는지 확인). **Step 4:** 커밋 `feat(web): 폰 대진 보기에서 만들기·공개·시트 편집`.

### Task 11: page 연결 + 목록 보기 정리
**Files:** Modify `TID/bracket/page.tsx`(+3 tests), `TID/bracket-tab.tsx`(+`bracket-tab.test.tsx`), `BC/bracket-list-template-tools.tsx`→`BC/bracket-list-slot-tools.tsx`; Delete `TID/tournament-detail-bracket-publish.test.tsx`(Task 3 시험으로 이전됨).
**Interfaces:** `BracketTab` props = `{ tournamentId; showToast; registrations; canWrite; tournamentFormat; unscheduledOnly: boolean }`(공개·마감·확정팀 수 props 삭제). 옛 league_knockouts 빈 목록 문구는 「경기 메뉴의 예선·토너먼트 대진 생성에서 예선 조를 편성해 주세요.」로 바꾼다. `BracketListSlotTools({ tournamentId, groups, slots, registrations, canWrite, showToast })` = `SixTeamDecisionPanel` + 「조별 팀 자리 편집」 `details` 만.
- [ ] **Step 1: 실패 테스트**(page 3개 파일 + bracket-tab):
```ts
it('도구 줄(보기 전환 포함)이 보기 위에 한 번만 나오고, 대진이 비면 보기 대신 빈 상태가 나온다(?view=list 는 목록을 그대로)', …)
it('1280: [그림|목록] 이 보이고 목록으로 가면 BracketTab 이 주소 view=list 로 열린다; 390: 전환이 없고 view=list 여도 폰 보기를 그린다', …)
it('FixtureAssignmentWorkspace 에 mode 를 제어로 넘기고 시간·구장 메뉴가 그 mode 를 바꾼다', …)
it('6팀 토너먼트(teamCount 6, knockout, sixTeamMode 아님) + 빈 대진이면 빈 상태에 「6강 방식을 먼저 정해요」 링크, 7팀이거나 이미 6강 방식이면 없다', …)
it('BracketTab 에는 공개 카드·「지금 전체 공개」가 없고 대진 일정 전체보기 표만 unscheduledOnly 로 시간 미정 경기만 남긴다', …)
it('BracketTab 의 표 머리·수정창이 「원정」·「구장」을 쓴다(어웨이·경기장 0)', …)
it('목록 도구: 「전체 대진 만들기」·「결선 진출팀 배정」·「조별 빈 자리 무작위 배정」 버튼은 목록에 없고(도구 줄 메뉴로 이동), 조별 팀 자리 편집과 6강 진출 관리는 남는다', …)
```
- [ ] **Step 2:** 구현. page: `useBracketViewControls`, `assignmentMode` state, `useBracketTools({…})`, `<FixtureAssignmentWorkspace mode onModeChange>` 안에 `{tools.dialogs}` · `BracketToolsBar` · (캔버스 보기의 단계/편성 선택 그대로) · 본문. 본문: `view==='canvas'`(<768 은 항상) 이고 `tools.isEmpty` 면 `BracketEmptyState`(`create=tools.create`, `sixTeamNotice = format==='knockout' && teamCount===6 && !sixTeamMode`, `infoHref = /admin/tournaments/${id}/info`, 링크는 `?edit=rules`), 아니면 기존 반응형 보기. `SegmentedTabs` 는 바에 있다. `BracketTab`: 공개 카드·예약·취소 핸들러·`deadlinePassed` 삭제, 용어(홈/원정·구장·「결과 고치기 화면 열기」) 정리, 목록에서 `window.confirm` 이라는 주석 문구 정리.
- [ ] **Step 3:** `vitest run 'src/app/admin/tournaments/[id]'` → PASS. **Step 4:** 커밋 `feat(web): 대진 탭에 도구 줄·빈 상태 연결, 목록 정리`.

### Task 12: 게이트·R-K3·변경 기록·PR
**Files:** Create `.changeset/admin-bracket-tools.md`.
- [ ] **Step 1:** 정적 점검 0건 확인 — `git grep -nE "어웨이|경기장|필드|코트|피리어드|window\.confirm" <이 lane 의 .tsx 비테스트 파일>`(화면 문구·호출만; 외부 파일 `app/admin/league-matches/**` 의 `window.confirm` 3곳은 「needs head」로 보고), `git grep -nE "border-l|borderLeft|inset [0-9]+px 0 0|before:|2px solid var\(--blue" <같은 파일>`, `git grep -nE "큰 화면에서|페이지 위" components/admin/bracket-canvas app/admin/tournaments`(남아도 되는 것은 리그가 쓰는 `bracket-canvas-mobile.tsx` 의 기본 문구뿐).
- [ ] **Step 2:** `./node_modules/.bin/tsc --noEmit -p tsconfig.json` · `node scripts/v1-pattern-check.mjs` · `vitest run src/components/admin/bracket-canvas 'src/app/admin/tournaments/[id]' src/app/admin/league-matches src/components/admin/stages` → 모두 통과(풀스위트는 CI).
- [ ] **Step 3:** `.changeset/admin-bracket-tools.md`: `"v1_web": patch` + 해요체 한 단락(「대진 관리 도구를 팀 채우기·경기·시간·구장 메뉴 3개로 묶고 …」).
- [ ] **Step 4:** PR 본문(한국어) — base `dev` 확인(`gh pr view <N> --json baseRefName`), Copilot 리뷰 루프 후 머지, `git fetch origin dev` 뒤 로컬 dev 동기화.
- [ ] **Step 5(머지·alpha 배포 확인 뒤, ego-browser):** 1440·390 에서 (a) 빈 대진 화면 버튼 1개, (b) 칸을 열기 전·후 `[data-testid=bracket-canvas-area]` 폭 동일, (c) 메뉴 3개 항목과 공개 시트, (d) 폰 시트의 5칸+더 보기를 찍고, 변경 화면 전체에서 「`borderLeftWidth ≥ 2px` 이면서 `borderRightWidth` 보다 큰 요소」와 「`boxShadow` 에 `inset Npx 0 0`」 개수를 계산 스타일로 세어 0 을 PR 에 적는다. ego 작업 공간은 `finish({ keep: [] })` 로 닫는다.

---
## Self-Review (작성자 점검)
- **Spec coverage:** 빈 상태(T7·T11, B1·Q5·Q6) · 도구 줄 5개(T4·T9) · 패널 겹침·기본 5칸·더 보기·저장·삭제(T5·T6·T7) · 폰 한 보기·시트·공개(T3·T9·T10, M5-1·M5-2·A2) · 신청 마감 전 주황 띠(T3, M5-3) · `window.confirm`(T1) · 용어·R-K3(T2·T12). 현재 모든 도구의 도착지는 Action map 이 보인다.
- **Plan decisions:** ① 메뉴 「시간 일괄 배정·구장 일괄 배정」은 기존 시간·구장 배정 패널을 연다(목업 설명의 「첫 경기 시각+간격으로 자동 채우기」는 새 기능이라 이번에 만들지 않고 문구는 지금 동작대로). ② 팀 자리(홈·원정)는 지금처럼 고르는 즉시 저장, 「저장」은 시간·구장·더 보기 값. ③ 「조 순위대로 채우기」(목업의 「4강 채우기」 대신 — 모든 순위 자리를 채우므로). ④ 시간 미정만 보기는 그림에서 흐리게, 폰·목록에서는 걸러 낸다. ⑤ 6강 링크는 6팀 일반 토너먼트·빈 대진일 때만 보인다(`sixTeamMode` 가 boolean 이라 「아직 안 정함」을 가를 수 없음). ⑥ 폰 「참가팀 목록 열기」는 팀 → 빈 자리 시트. ⑦ 리그 격자의 순위표 열은 선택과 무관하게 고정. ⑧ 목록 보기의 경기 수정창 구조는 그대로(용어·표시 문구 복원 버튼 삭제만).
- **needs head:** (a) `app/admin/league-matches/[leagueId]/{league-fixture-schedule-modal,league-time-assignment}.tsx` 의 `window.confirm` 3곳(스펙은 5곳이라 했으나 이 lane 파일엔 2곳) — 소유 lane 지정 필요. (b) `competition-field-picker.tsx`·`period-override-field.tsx`·`stage-plan-toolbar.tsx` 는 이 lane 목록 밖의 공유 파일인데 T2·T8 이 만진다(리그·다른 lane 과 충돌 시 조율). (c) 6강 방식 입력은 L3 계획이 「경기 규칙」(`edit=rules`)에 둔다 — L3 가 위치를 바꾸면 링크의 `edit=` 값만 바꾼다. (d) 대진이 비어 있으면 목록 보기(조 직접 만들기)로 가는 길이 URL `?view=list` 뿐이다 — 스펙대로 숨겼으니 필요하면 빈 상태에 보조 링크 한 줄 추가 결정.
- **Type consistency:** `BracketViewControls`(T7)=T9·T10·T11 소비 동일 · `BracketToolKey`(T4)=T9 핸들러 키 · `BracketPublishControlProps`(T3)=T9 바 소비 · `FixtureMetadataEditor.showToast`(T5)=T6·T10 전달.

## Head 조율 결정 (2026-11-27, 실행자는 이 절을 우선한다)
- **`window.confirm` 3곳 추가:** `app/admin/league-matches/[leagueId]/league-fixture-schedule-modal.tsx`·`league-time-assignment.tsx` 의 3곳도 이 레인이 `useConfirm` 으로 바꾼다(Q8: 리그 어드민도 같이). 시험: 확인 창 문구가 보이고 취소하면 요청이 나가지 않는다.
- **빈 상태에 「직접 조 만들기」 링크:** 도구 줄을 숨겨도 목록 보기의 수동 조 만들기로 가는 길을 남긴다(작은 글자 링크, `?view=list`). 시험: 빈 상태에서 링크가 보이고 누르면 목록 보기.
- `competition-field-picker.tsx`·`period-override-field.tsx`·`stage-plan-toolbar.tsx` 는 이 레인이 고친다(다른 레인 계획에 없음 — 확인함). `period-override-field.tsx` 는 L0 가 import 경로만 먼저 바꾸므로 L0 머지 뒤 시작.
- 6강 링크는 `?edit=rules`(L3 결정) 그대로.
