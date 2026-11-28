# 현장 운영(L6, S6 C+B) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 셸의 「운영 보드」를 구장 열 × 시간 줄 판(폰은 구장 칩 + 시간 목록)으로 바꾸고, 결과 검토·결과 정정을 「결과」 한 페이지로 합치며, 다리·런처·용어·한쪽 색 띠(L8)를 정리한다.

**Architecture:** 보드는 서버 페이지(limit 100, 커서)를 끝까지 읽어 날짜·구장·시간 나누기를 클라이언트에서 한다(백엔드 변경 없음 — D1). 판단 규칙은 순수 모듈 `ops-board-model.ts` 에 모으고 화면은 결과만 그린다. 셸은 따로 두고 다리·메뉴만 바꾼다. 결과 페이지는 기존 보드 안 `ExpandedResultPanel` 의 규칙(최근 리비전이 SUBMITTED 면 확정 패널, 아니면 고치기 패널)을 그대로 옮긴다.

**Tech Stack:** Next.js 16 App Router · React 19 · TanStack Query 5 · Tailwind v4 토큰 · Vitest + Testing Library + MSW(`setupServer`) · `@/test/viewport`(`installViewport`·`resizeViewport`)

**Spec:** `.github/tasks/20261140-admin-tournament-ux-renovation.md` (S6·Q1·Q2·Q8·2차 S6-1..5·M6-1·M6-2·L8·공통 용어). 목업: 로컬 목업 `mockups/s6-ops/CB.html`(저장소 밖)·`notes.md`(「CB 합친 안」), `m6-ops/index.html`·`notes.md`. 실행자는 spec 과 이 계획만 본다.

**Lane:** `git fetch origin dev` 후 `git worktree add .claude/worktrees/admin-ux-l6 -b feat/admin-ux-l6-ops origin/dev`, `node_modules` 심링크. L0(ActionMenu·SideSheet)·L1 에 의존하지 않는다(`BottomSheet`·`ConfirmModal` 등 기존 부품만). PR 은 `dev` 대상·한국어, 마지막에 `.changeset/*.md`. 커밋은 Task 마다 `git commit -m "<한국어>" -- <내 파일 경로>` + `git show --stat HEAD` 로 휩쓸린 파일 확인.

## Global Constraints

- 용어(spec 「공통 용어」): 장소/구장(필드·경기장·코트 금지) · 홈·원정(어웨이 금지) · 신청 · 결과 확정·결과 고치기(확인·고치고 확인·정정·편집 금지) · 경기 콘솔(운영 콘솔 금지) · 대회 운영자·구장 담당자(대회 디렉터·필드 담당자·현장 진행요원 금지) · 보드 이름 「운영 보드」(S6-1).
- 해요체, 도움말 한 줄, 에러는 `extractErrorMessage(err, '해요체 fallback')`, 상태·경고 라벨 단일 출처는 `components/tournament-ops/badges.tsx`.
- R-K3: `border-l-*`·한쪽만 두꺼운 색 테두리·`shadow-[inset …]`·`before:` 띠·`border-2 border-blue-500` 강조 금지. 상태 = 글자 배지(+아이콘) + 옅은 배경, 선택 = 옅은 배경 + 1px 테두리 색.
- 토큰만(하드코딩 색·글자 크기 금지), 터치 44px, `React.forwardRef` 금지, `window.confirm` 금지(`useConfirm`). 소유 파일의 `window.confirm` 은 현재 0건 — 새로 만들지 않는다.
- 주소 계약: `/admin/live/[id]/*`·`/tournament-ops/tournaments/[id]/*` 두 표면은 그대로(통합 안 함). 새 주소 `…/results?fixtureId=<id>`. 옛 `…/result-review`·`…/records/corrections` 는 쿼리를 보존해 `…/results` 로 서버 리다이렉트(L5·L7·어드민 대시보드가 옛 주소를 계속 쓴다).
- 권한 판정은 서버. 화면은 숨기기만 한다(구장 배정·결과 처리 = PLATFORM_OPS·TOURNAMENT_DIRECTOR, 지원은 보기만).
- 새 주석은 코드가 말 못하는 제약만, 이 영역의 기존 주석 언어(한국어), 한 곳 3줄 이하.

## Review Focus (각 줄의 테스트는 해당 Task 에 있다)

1. 자정 경계: KST 23:30·00:30 경기가 다른 날로 갈리고 UTC 로 자르면 하루 밀리지 않는다 → Task 2.
2. 같은 구장·같은 시각 경기 2개는 한 칸에 쌓이고 하나도 안 사라진다. 시간 미정·구장 미정 경기도 사라지지 않는다 → Task 2·3·6.
3. 경기 0건(대진 전)·날짜 하나뿐인 대회·필터 결과 0건 → 빈 상태 문구가 있고 날짜 넘기기는 안 보인다 → Task 6.
4. 리그 행(`round`·`fixtureNumber` null, `leagueFixtures` 제목)과 체험(demo) 응답에서 「null번」·「undefined」가 안 찍힌다 → Task 6.
5. 런처 자동 열기가 「다른 대회 고르기」로 돌아와도 다시 튕기지 않는다(`?pick=1`) → Task 9.

## 결정 기록 (spec 이 비워 둔 것 — plan decision)

| # | 결정 | 근거 |
|---|---|---|
| D1 | 보드 API 변경 없음. 서버 페이지를 `nextCursor` 가 null 일 때까지 읽는 훅을 쓴다. | 날짜 전환기는 「경기 있는 날 목록」을 알아야 해서 날짜 필터 하나로 부족하다. `useTournamentEndedFixtures` 가 이미 같은 방식(limit 100 반복)이다. 20팀 2회전 리그(380경기)도 4번 호출. |
| D2 | 「A조 · 조별리그 1라운드 1번 경기장」은 자동 생성된 구장이 아니라 `FixtureFieldCell` 의 화면 밖 라벨 `${rowLabelFor(item)} 경기장`(접근성 이름)이다. 로컬 시드엔 구장이 0개(선택지 「미배정」뿐). 라벨을 `${팀 vs 팀} 구장` 으로 고치고 선택지는 등록된 구장 이름 그대로. alpha 에서 선택지 한 번 더 확인. | `operations-board-client.tsx:191`, 서버에 구장 자동 생성 코드 없음. |
| D3 | 판의 줄 = 「서로 다른 시작 시각마다 한 줄」(시간 비례 아님). 「지금」 선은 첫 `시각 > 지금` 줄 앞, 선택한 날이 오늘일 때만. | 10:07 같은 불규칙 시각·빈 시간대에도 안 깨진다. |
| D4 | 카드의 「전반 12:31」·「10:02 시작」·「09:52 확정」은 만들지 않는다(보드 응답에 기간·시각이 없다). 배지 「진행 중」, 아랫줄은 라운드 이름. 서버 필드 추가 안 함. | 목업보다 줄인다. |
| D5 | 「구장 담당자가 없어요」는 클라이언트가 `max(지금, 경기 시각)` 에 활성 FIELD_OPERATOR(취소 안 됨, 구장 또는 경기 범위 일치, `expiresAt` 없음 또는 그 시각 이후)가 있는지로 판정한다(서버 `NO_STAFF_ASSIGNED` 는 「지금」 기준이라 14:00 만료를 14:30 경기에 못 건다). 대회에 구장 담당자 배정이 한 건도 없으면 카드마다 띄우지 않고 보드 위 한 줄 안내만(배정 가능한 역할일 때). | 운영자 혼자 돌리는 대회에서 모든 카드가 주황이 되는 걸 막는다. |
| D6 | 「확인할 것」 = 담당자 없음·득점자 미기재·라인업 미제출·검토 기한 초과. `NO_FIELD_ASSIGNED` 는 제외(해결 자리가 「구장 미정」 열). | CB notes: 결과 확정 대기는 겹쳐 세지 않는다. |
| D7 | 구장 담당자는 이 셸에 못 들어온다(게이트가 콘솔만 열어 줌). 「자기 구장 칩으로 시작」은 해당 없음 — 칩은 늘 「전체」로 시작. | `tournament-live-gate.tsx` |
| D8 | 지원(조회 전용)은 「결과」 메뉴가 지금처럼 잠기고 이유가 보인다(spec). 그래서 카드의 인라인 「결과 보기」는 사라진다 — 점수는 보이고 결과 버튼은 없다. | 이동이 아니라 의도된 축소, 테스트에서 단언. |
| D9 | 경기 정보 시트는 구장 바꾸기만(기존 API·권한). 시간 변경은 admin 전용 API 라 이 셸에 안 만들고 「시간은 대진 관리에서 바꿔요.」 한 줄만. 같은 구장·같은 시각 경기가 있으면 `useConfirm`. | 목업의 「구장·시간 바꾸기」 중 시간은 needs head. |
| D10 | 런처 「오늘 경기 있음」 = 기간(대회 `scheduledAt`~`scheduledEndAt`, 리그 `startsOn`~`endsOn`)이 오늘(KST)을 덮는 진행 가능 후보(최대 8개)의 보드를 읽어 실제 경기 시각이 오늘인 것. | 긴 시즌 리그가 매일 위 묶음에 뜨는 걸 막는다. |
| D11 | 끝난 경기 접기(M6-2)는 폰만. 접는 대상은 확정됨·취소됨, 「결과 확정 대기」 카드는 일이 남아 접지 않는다. 데스크톱 판은 다 보인다. | 확정 대기를 접으면 할 일이 숨는다. |

## File Structure

| 파일 | 역할 |
|---|---|
| `components/tournament-live/ops-board-model.ts` | 카드·날짜·열·시간 줄 계산(순수) |
| `components/tournament-live/use-operations-board-all.ts` | 전 페이지 읽기 훅 |
| `components/tournament-live/board-card.tsx` · `operations-timeline.tsx` · `operations-phone-list.tsx` · `field-chips.tsx` | 카드·데스크톱 판·폰 목록·구장 칩 |
| `components/tournament-live/match-info-sheet.tsx` · `operations-list-view.tsx` | 경기 정보 시트 · 「목록」 보기(기존 표를 옮겨 다듬음) |
| `components/tournament-live/operations-board-client.tsx` | 컨테이너 — 전면 재작성, props `{ tournamentId }` 유지(`app/tournament-ops-demo/[section]/page.tsx` 가 씀) |
| `components/tournament-live/results-page-client.tsx`·`result-fixture-list.tsx`·`result-panel.tsx` | 「결과」 한 페이지 |
| `components/tournament-ops/result-partition.ts` · `ops-bridge.ts` | 확정 대기 나누기 + 셸 숫자 훅 · 다리 목적지·문구 표 |
| 삭제 | `result-review-page-client.tsx`·`corrections-page-client.tsx`(+tests), `components/tournament-result-review/fixture-picker-list.tsx`(+test)·`result-review-grid-styles.tsx` — 다른 importer 0 확인 후 |

---

### Task 1: 용어·라벨 맞추기

**Files:** Modify `components/tournament-ops/badges.tsx`, `role-context.tsx`, `field-operator-console-frame.tsx`, `grant-staff-modal.tsx`, `components/tournament-live/staff-client.tsx`·`videos-page-client.tsx`, `components/tournament-result-review/result-review-copy.ts`(역할 라벨 두 줄), 각 `*.test.tsx`.

**Interfaces:** Produces — `STAFF_ROLE_LABELS`: PLATFORM_OPS 「플랫폼 운영자」 · TOURNAMENT_DIRECTOR 「대회 운영자」 · FIELD_OPERATOR 「구장 담당자」 · SUPPORT_READONLY 「지원(보기만)」. `WARNING_LABELS`: NO_FIELD_ASSIGNED 「구장 미배정」 · NO_STAFF_ASSIGNED 「구장 담당자 없음」 · LINEUP_NOT_SUBMITTED 「라인업 미제출」 · MISSING_SCORER 「득점자 미기재」 · RESULT_REVIEW_OVERDUE 「검토 기한 초과」. `GameStateBadge`: LIVE = blue 톤, ENDED 라벨 「끝남」. `staff-client` 제목 「스태프·구장」, 「경기장(필드)」 → 「구장」, 「경기장 추가」 → 「구장 추가」; `videos-page-client` 제목 「영상」.

- [ ] **Step 1:** 소유 폴더(`components/tournament-live components/tournament-ops app/tournament-ops app/admin/live app/admin/ops`)에서 `git grep -nE "필드|경기장|코트|어웨이|디렉터|현장 진행요원|조회 전용|운영 콘솔"` 로 **화면 문자열**만 목록화(주석·`FIELD_OPERATOR` 식별자는 제외). 이 Task 는 위 Files 만 고친다 — 보드·셸·결과·런처의 문자열은 각 Task 가 새로 쓰며 맞춘다.
- [ ] **Step 2:** Interfaces 대로 바꾼다. `grant-staff-modal`/`staff-client` 의 「경기장」·「필드」 → 「구장」, 「대회 디렉터」 → 「대회 운영자」, 「필드 담당자」 → 「구장 담당자」. `badges.tsx` 위 주석의 「fixture-picker-list 도 쓴다」는 Task 7 에서 그 파일이 지워지므로 지운다.
- [ ] **Step 3:** 실행 `./node_modules/.bin/vitest run src/components/tournament-ops src/components/tournament-live/staff-client.test.tsx src/components/tournament-live/videos-page-client.test.tsx src/components/my src/components/tournament-result-review` — 라벨 단언만 새 문구로 고쳐 전부 PASS(`components/my` 는 같은 라벨을 쓴다).
- [ ] **Step 4:** 커밋 `fix(web): 현장 운영 화면의 용어를 구장·구장 담당자·대회 운영자로 통일해요`.

> 결과 패널의 「정정」·「고치고 확인」 문구는 Task 7 에서 맞춘다. `console-result-card.tsx`·`operate/**` 는 L7 소유(Task 7 끝 「다른 레인에 넘길 것」).

---

### Task 2: 보드 데이터 훅 + 순수 모델

**Files:** Create `components/tournament-live/use-operations-board-all.ts`·`use-operations-board-all.test.tsx`·`ops-board-model.ts`·`ops-board-model.test.ts`.

**Interfaces:**
- Consumes: `useV1DataSource().v1Get`, `v1Keys.tournamentOperationsBoardAll`, `OPERATIONS_BOARD_POLL_INTERVAL_MS`(`@/lib/operations-board-polling`), `toKstDateString`(`@/lib/kst-calendar`), `canManageTournamentResults`(`role-context`).
- Produces:
```ts
// use-operations-board-all.ts
export interface OperationsBoardAll { items: V1TournamentOperationsBoardItem[]; liveWarnings: V1TournamentOperationsLiveWarning[] }
export function fetchOperationsBoardAll(get: typeof v1Get, tournamentId: string): Promise<OperationsBoardAll>; // limit 100, 필터 없음, nextCursor null 까지
export function useOperationsBoardAll(tournamentId: string, options?: { enabled?: boolean }): UseQueryResult<OperationsBoardAll>; // key [...tournamentOperationsBoardAll(id),'all'] — 구장 배정 등 기존 무효화가 그대로 닿는다. 15초 폴링, keepPreviousData
// ops-board-model.ts
export const NO_FIELD_KEY = '__no_field__';
export type CardState = 'live' | 'result-pending' | 'result-done' | 'scheduled' | 'cancelled';
export type CardActionKind = 'console' | 'confirm-result' | 'fix-result' | 'assign-staff';
export interface CardAction { kind: CardActionKind; label: string; emphasis: 'primary' | 'secondary' | 'warning' }
export type CheckCode = Exclude<V1TournamentOperationsWarningCode, 'NO_FIELD_ASSIGNED'>;
export interface BoardCard { fixtureId: string; item: V1TournamentOperationsBoardItem; dayKey: string | null; timeLabel: string | null; fieldKey: string; fieldName: string | null; title: string; subtitle: string; state: CardState; action: CardAction | null; staffMissing: boolean; checks: readonly CheckCode[]; isFieldNext: boolean }
export interface BuildBoardCardsInput { items: readonly V1TournamentOperationsBoardItem[]; liveWarnings: ReadonlyMap<string, readonly V1TournamentOperationsWarningCode[]>; labelFor: (item: V1TournamentOperationsBoardItem) => { title: string; subtitle: string }; staff: readonly V1TournamentStaffAssignment[]; role: V1TournamentStaffRole; now: Date }
export function buildBoardCards(input: BuildBoardCardsInput): BoardCard[];
export function kstDayKey(iso: string): string;                        // 'YYYY-MM-DD' (KST)
export function listMatchDays(cards: readonly BoardCard[]): string[];  // 오름차순, 시간 미정 제외
export function pickBoardDay(days: readonly string[], todayKey: string): string | null;
export interface FieldColumn { key: string; name: string; staffLine: string; expiresLabel: string | null; count: number }
export function buildFieldColumns(cards: readonly BoardCard[], dayKey: string | null, fields: readonly V1TournamentField[], staff: readonly V1TournamentStaffAssignment[]): FieldColumn[];
export function groupByTime(cards: readonly BoardCard[]): { time: string; cards: BoardCard[] }[];
export function usesFieldStaff(staff: readonly V1TournamentStaffAssignment[]): boolean;
```
규칙. **액션(위에서부터 첫 일치):** `gameState` LIVE·PAUSED → `live`, `console` primary 「경기 콘솔 열기」 · ENDED 이고 (`revisionId===null` 또는 `currentRevisionState!=='OFFICIAL'` 또는 liveWarnings 에 `RESULT_REVIEW_OVERDUE`) → `result-pending`, `confirm-result` primary 「결과 확정」 · ENDED 공식 → `result-done`, `fix-result` secondary 「결과 고치기」 (두 결과 액션은 `canManageTournamentResults(role)` 일 때만, 아니면 null) · CANCELLED → `cancelled`, null · 그 밖(`gameState` null 포함) → `scheduled`: `staffMissing` 이면 PLATFORM_OPS·TOURNAMENT_DIRECTOR 에게만 `assign-staff` warning 「담당자 배정하기」(지원은 액션 null, `staffMissing` 만 참), 아니면 그 구장의 첫 미종료 경기(`isFieldNext`)에 `console` secondary, 나머지 null. **`staffMissing`(D5):** `usesFieldStaff(staff)` 이고 미종료 경기에서 기준 시각 `max(now, scheduledAt ?? now)` 에 덮는 배정이 없을 때. **`checks`(D6):** 서버 안정 경고 + liveWarnings 에서 `NO_FIELD_ASSIGNED`·서버 `NO_STAFF_ASSIGNED` 를 빼고 `staffMissing` 이면 `NO_STAFF_ASSIGNED` 를 넣는다. **`pickBoardDay`:** 오늘이 있으면 오늘, 없으면 거리(일) 최소, 같으면 앞날, 빈 배열 null. **`buildFieldColumns`:** 경기가 한 건이라도 있는 구장을 `sortOrder`·이름순, 그날 구장 미정 경기가 있으면 `NO_FIELD_KEY` 열(「구장 미정」)을 맨 끝에, `count` 는 그날 경기 수, `staffLine` 「구장 담당자 {이름들}」(없으면 「구장 담당자 없음」), `expiresLabel` 「{HH:mm}까지」(그날 안에 끝나는 배정이 있을 때).

- [ ] **Step 1: 실패하는 테스트** `ops-board-model.test.ts` (fixture 팩토리 `fx(id, fieldId, scheduledIso, over?)`, 담당 배정 팩토리 `op(fieldId, expiresIso|null, over?)`):
```ts
it('KST 23:30 과 00:30 은 다른 날이다', () => {
  expect(kstDayKey('2026-12-20T14:30:00Z')).toBe('2026-12-20');
  expect(kstDayKey('2026-12-20T15:30:00Z')).toBe('2026-12-21');
});
it.each([[['2026-12-19','2026-12-21'],'2026-12-20','2026-12-19'],[['2026-12-18','2026-12-22'],'2026-12-20','2026-12-18'],[['2026-12-20'],'2026-12-20','2026-12-20'],[[],'2026-12-20',null]])('pickBoardDay %j', (days, today, want) => expect(pickBoardDay(days, today)).toBe(want));
it('구장 담당자 만료(14:00)가 14:30 경기만 담당자 없음으로 만든다', () => {
  const cards = buildBoardCards({ ...base, items: [fx('a','f2','2026-12-20T00:30:00Z'), fx('b','f2','2026-12-20T05:30:00Z')], staff: [op('f2','2026-12-20T05:00:00Z')], now: new Date('2026-12-20T01:15:00Z'), role: 'PLATFORM_OPS' });
  expect(cards.map((c) => c.staffMissing)).toEqual([false, true]);
  expect(cards[1].action).toMatchObject({ kind: 'assign-staff', label: '담당자 배정하기' });
});
it('구장 담당자 배정이 한 건도 없으면 어떤 카드도 staffMissing 이 아니다', ...);
it('경기 범위(fixtureIds) 배정이 그 경기를 덮는다', ...);
it('지원: 결과 확정 대기 카드에 액션이 없고 staffMissing 카드도 버튼 없이 표시만', ...);
it('운영자: ENDED+revisionId null → 결과 확정(primary), ENDED+OFFICIAL → 결과 고치기(secondary)', ...);
it('확인할 것에 NO_FIELD_ASSIGNED 는 없고 MISSING_SCORER·담당자 없음은 있다', ...);
it('시간 미정 경기는 dayKey null, listMatchDays 에서 빠지고 groupByTime 은 시각 오름차순', ...);
it('같은 구장 같은 시각 두 경기는 groupByTime 한 줄에 둘 다 있다', ...);
it('구장 열: 경기 없는 구장은 빠지고 구장 미정 열은 그날 미정 경기가 있을 때만 마지막에', ...);
```
`use-operations-board-all.test.tsx`(`setupServer`+`QueryClientProvider`): 첫 페이지 `nextCursor:'c1'` → 두 번째 요청 쿼리에 `cursor=c1&limit=100` 이고 `items`·`liveWarnings` 가 이어진다 / 두 번째 페이지 500 이면 `isError`(첫 페이지만 보여 주지 않는다).
- [ ] **Step 2:** 실행 `./node_modules/.bin/vitest run src/components/tournament-live/ops-board-model.test.ts src/components/tournament-live/use-operations-board-all.test.tsx` → FAIL(모듈 없음).
- [ ] **Step 3:** 위 시그니처·규칙대로 구현(날짜는 `toKstDateString(new Date(iso))`, `now` 는 인자). **Step 4:** 같은 명령 PASS + `./node_modules/.bin/tsc --noEmit -p tsconfig.json` 0. **Step 5:** 커밋 `feat(web): 운영 보드가 쓸 전 페이지 읽기 훅과 카드 모델을 추가해요`.

---

### Task 3: 카드 + 데스크톱 구장 열 판

**Files:** Create `components/tournament-live/board-card.tsx`·`operations-timeline.tsx`·`operations-timeline.test.tsx`; Modify `lib/tournament-live-routes.ts`(`resultsHref` 추가).

**Interfaces:**
- Consumes: `BoardCard`·`FieldColumn`·`groupByTime`(Task 2), `readGameResultScore`·`formatPenaltyShootout`(기존 `FixtureResultCell` 규칙: 공식 결과가 있을 때만 점수, 없으면 `—` 가 아니라 점수 줄 생략).
- Produces:
```ts
export function resultsHref(base: string, fixtureId?: string): string; // `${base}/results` (+ `?fixtureId=…`)
export function BoardCardView(props: { card: BoardCard; liveBase: string; consoleQuery: string; showField?: boolean; onOpenInfo: (card: BoardCard) => void }): JSX.Element;
export function OperationsTimeline(props: { columns: readonly FieldColumn[]; cards: readonly BoardCard[]; nowTimeLabel: string | null; renderCard: (card: BoardCard) => ReactNode }): JSX.Element;
```
카드 = `<article>`: 윗줄 `{HH:mm} · {번호·라운드}` + 상태 배지(글자+아이콘: 「예정·진행 중·결과 확정 대기·결과 확정됨·취소됨」), 팀 줄(+공식 점수), 아랫줄 왼쪽 글(`staffMissing` ? 「구장 담당자가 없어요」 : `isFieldNext` ? 「{구장} 다음 경기」 : `subtitle`)·오른쪽 할 일 하나. 제목 영역 = `aria-label="{title} 경기 정보"` 버튼. 할 일 링크: `console` → `${liveBase}/fixtures/${id}/operate${consoleQuery}`, `confirm-result`·`fix-result` → `resultsHref(liveBase, id)`, `assign-staff` → `${liveBase}/staff`. 배경 = 상태 토큰(진행 중 `--blue50`, 확정 대기 `--tint-orange`, 확정됨 `--surface-soft`), 테두리는 늘 1px 전체. 열 머리 = 구장 이름 + `staffLine · 경기 {n}`(+`expiresLabel`). 같은 칸 카드는 세로로 쌓는다. 판 = `grid-template-columns: 56px repeat(n, minmax(0,1fr))`.

- [ ] **Step 1: 실패하는 테스트**(`buildBoardCards` 로 만든 카드를 렌더):
  - 열 2개 + 구장 미정 열 → `columnheader` 이름 「구장 1」「구장 2」「구장 미정」 포함, 같은 시각 2경기를 가진 칸에 카드 2장.
  - **좁힘:** 카드마다 `link` ≤ 1 이고 이름에 「운영 콘솔」·「더보기」가 있는 컨트롤이 하나도 없다. **이동:** 결과 확정 카드 링크 `href` = `/admin/live/t-1/results?fixtureId=f7`, 경기 콘솔 링크 = `/admin/live/t-1/fixtures/f2/operate`(어드민은 쿼리 없음), 스태프 표면(`liveBase` `/tournament-ops/tournaments/t-1`, `consoleQuery` `?from=board`)은 `…/operate?from=board`.
  - `nowTimeLabel="10:15"` → `role="separator"` 「지금 10:15」 가 09:30 줄과 10:30 줄 사이.
  - 렌더 결과 어떤 요소의 `className` 에도 `border-l`·`inset` 이 없다(R-K3 정적 가드).
- [ ] **Step 2:** 실행 → FAIL. **Step 3:** 구현. **Step 4:** PASS + tsc. **Step 5:** 커밋 `feat(web): 운영 보드 데스크톱 구장별 시간 판을 추가해요`.

---

### Task 4: 폰 시간 목록 + 구장 칩 + 끝난 경기 접기

**Files:** Create `components/tournament-live/operations-phone-list.tsx`·`field-chips.tsx`·`operations-phone-list.test.tsx`.

**Interfaces:**
```tsx
export function FieldChips(props: { columns: readonly FieldColumn[]; mode: 'single' | 'multi'; selected: readonly string[]; maxSelected?: number; onChange: (keys: string[]) => void; ariaLabel: string }): JSX.Element;
// single: 「전체」 + 열마다 칩(aria-pressed), 전체 선택 = []. multi: 「전체」 없음, maxSelected 도달 시 선택 안 된 칩 disabled + title 「최대 3곳까지 고를 수 있어요」
export function OperationsPhoneList(props: { cards: readonly BoardCard[]; showField: boolean; nowTimeLabel: string | null; renderCard: (card: BoardCard) => ReactNode }): JSX.Element;
```
`OperationsPhoneList` = 시간순 한 줄 목록(「전체」일 땐 카드 첫 줄에 구장 이름), `result-done`·`cancelled`(D11)는 「끝난 경기 {n}」 토글(`aria-expanded`, 기본 접힘 — 접을 것이 없으면 줄 없음, 보일 카드가 하나도 없고 접을 것만 있으면 기본 펼침) 안에, 나머지는 시간순 + 「지금 {HH:mm}」 구분선. 칩 줄은 줄바꿈(가로 스크롤 없음).

- [ ] **Step 1: 실패하는 테스트:** 확정됨 2·확정 대기 1·예정 3 → 처음엔 확정됨 카드 DOM 없음, 「끝난 경기 2」 버튼이 있고 누르면 `aria-expanded=true` + 두 카드 등장, 확정 대기 카드는 접힌 채도 보인다. / 전부 확정됨이면 기본 펼침. / `FieldChips` single: 「구장 2」 클릭 → `onChange(['f2'])`, 「전체」 → `[]` / multi(4곳, max 3): 셋 선택 후 넷째 칩 `disabled`, 하나를 끄면 켤 수 있다.
- [ ] **Step 2–4:** FAIL → 구현 → PASS + tsc. **Step 5:** 커밋 `feat(web): 운영 보드 폰 시간 목록과 구장 칩을 추가해요`.

---

### Task 5: 경기 정보 시트(구장 바꾸기)

**Files:** Create `components/tournament-live/match-info-sheet.tsx`·`match-info-sheet.test.tsx`.

**Interfaces:**
- Consumes: `BoardCard`, `useV1AssignFixtureField`·`useV1ClearFixtureField`, `useConfirm`, `BottomSheet`(`onClose` 형), `extractErrorMessage`.
- Produces: `MatchInfoSheet(props: { card: BoardCard | null; allCards: readonly BoardCard[]; fields: readonly V1TournamentField[]; canAssignField: boolean; liveBase: string; consoleQuery: string; onClose: () => void })`.

시트: 제목 `{title} 경기 정보`, 시간(글자)·상태 배지·구장(`canAssignField` 면 select — 첫 옵션 「구장 미정」 value `''`, 라벨 `{title} 구장`(D2) — 아니면 글자)·확인할 것 배지(`WarningBadge`), 「경기 콘솔 열기」 링크(원래 모든 행에 있던 입구 — 판에서 버튼이 사라진 경기도 여기서 닿는다), 한 줄 「시간은 대진 관리에서 바꿔요.」. 구장 바꾸기(D9): 대상 구장에 같은 `scheduledAt` 의 다른 미취소 경기가 있으면 `confirm({ title: '시간·구장이 겹쳐요', message: `${겹치는 경기 제목} 경기와 시간·구장이 겹쳐요. 그대로 저장할까요?`, confirmLabel: '그대로 저장' })`, 거절하면 호출 없음. 실패는 시트 안 `role="alert"`, `extractErrorMessage(err, '구장을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.')`, 선택값은 서버 값으로 되돌린다.

- [ ] **Step 1: 실패하는 테스트**(MSW `PATCH …/fixtures/:id/field`·`DELETE`): 겹치는 구장 선택 → 확인 창 등장, 「취소」 → PATCH 0번, 「그대로 저장」 → PATCH 1번 body `{ fieldId }` / 겹치지 않으면 확인 창 없이 PATCH / 「구장 미정」 선택 → DELETE / PATCH 500 → 시트 안 오류 문구 / `canAssignField=false` → select 없이 구장 이름 글자 / 「경기 콘솔 열기」 href `/admin/live/t-1/fixtures/f9/operate`.
- [ ] **Step 2–4:** FAIL → 구현 → PASS + tsc. **Step 5:** 커밋 `feat(web): 운영 보드 경기 정보 시트에서 구장을 바꿀 수 있게 해요`.

---

### Task 6: 운영 보드 컨테이너 + 「목록」 보기

**Files:** Rewrite `components/tournament-live/operations-board-client.tsx`·`operations-board-client.test.tsx`; Create `operations-list-view.tsx`.

**Interfaces:** Consumes Task 2~5, `useV1Tournament`, `useV1TournamentFields`, `useV1TournamentStaffAssignments`, `useTournamentOpsRole`, `useMediaQuery(DESKTOP_LIST_MEDIA_QUERY)`, `OpsPageHeader`, `SegmentedTabs`, `buildLeagueFixtureTitles`, `publicFixtureSideLabel`. Produces: 같은 이름·props 의 `OperationsBoardClient({ tournamentId })`.

구성: 머리(`OpsPageHeader`: eyebrow `{대회명} · {날짜}`, 제목 「운영 보드」, 설명 「끝남 n · 진행 중 n · 남은 경기 n · {HH:mm} 기준 · 15초마다 새로 고쳐요」(선택한 날 기준), 오른쪽 「새로고침」 글자 버튼(받는 중 스피너)·「참가자 화면 보기」 링크) → 컨트롤 줄(구장 칩 · 「확인할 것 n」 토글(`aria-pressed`) · 「시간표 | 목록」 `SegmentedTabs`(ariaLabel 「보기 방식」) · 날짜가 둘 이상일 때만 「이전 경기일」「12. 20.(일)」「다음 경기일」「오늘」(오늘 경기가 있고 다른 날을 보고 있을 때만)) → 본문. 칩: 구장 ≤3 단일, ≥4 + 데스크톱 → `multi` 기본 앞 3곳, 폰 단일. 본문은 선택한 날 카드만, 「시간 미정 {n}」 묶음은 항상 맨 아래. `lg+` = `OperationsTimeline`, 미만 = `OperationsPhoneList`, 「목록」 = 기존 표(열 경기·시간·구장·상태·결과·확인할 것·다음 할 일, 헤더 「구장」, 행 할 일 = 카드 액션 없으면 「경기 콘솔 열기」). D5 안내 줄(「구장 담당자가 아직 없어요. 스태프·구장에서 배정해요.」, 배정 가능한 역할만, 링크 `${liveBase}/staff`). `labelFor`: 팀 이름은 공개 상세 `fixtures` 에서, 팀이 안 정해진 쪽(`homeRegistrationId===null`)은 `homeSlotLabel ?? '팀 미정'`, 리그는 `leagueFixtures` 제목. 현재 시각은 30초마다 갱신하는 로컬 `now`. 필터·날짜·보기는 로컬 상태(옛 `?status=…` 딥링크 사용처 0건). 제거: `ExpandedResultPanel`·`ActionSheet`·`TournamentProgressStepper`·상태/필드/경고 select 3개·「더 보기」(전 페이지를 읽는다)·구장 select 라벨 `경기장`(D2). 빈 상태: 경기 0건 「아직 대진이 없어요」+「대진을 만들면 여기에서 경기를 운영해요.」, 필터 0건 「조건에 맞는 경기가 없어요」.

- [ ] **Step 1: 실패하는 테스트**(MSW: `…/operations` 두 페이지·`/fields`·`/staff`·`/tournaments/t-1`, `installViewport(1280)`/`resizeViewport(390)`, `vi.useFakeTimers({ toFake: ['Date'] })` 로 2026-12-20 10:15 KST 고정, 역할은 `TournamentOpsRoleProvider`):
  1. **데스크톱:** 열 머리 「구장 1」「구장 2」, 「시간 미정 2」 묶음이 판 아래. **좁힘:** `전체 상태`·`전체 필드`·`전체 경고` select 와 「운영 콘솔」 링크가 없다.
  2. **날짜:** 하루짜리 대회엔 「다음 경기일」이 없다. 12-19·12-21 두 날, 오늘(12-20) 경기 없음 → 12-19 가 열리고 「다음 경기일」→12-21, 「오늘」 버튼 없음; 오늘 경기가 있으면 오늘이 열린다.
  3. **구장 4곳(데스크톱):** 칩 4개 중 3개 선택 → 열 3개, 넷째 `disabled`, 하나 끄면 켤 수 있다.
  4. **폰:** 칩 「전체 | 구장 1 | 구장 2」, 「구장 2」 → 구장 1 카드 사라지고 칩 아래 구장 2 열 머리 줄, 「끝난 경기 1」 접힘.
  5. **확인할 것:** 켜면 담당자 없음 카드만, 개수 = 그 수(결과 확정 대기는 세지 않는다).
  6. **목록:** 「목록」 → `columnheader` 「구장」(「필드」 아님), 행마다 할 일 컨트롤 1개.
  7. **이동:** 먼 예정 경기 제목 → 시트에 「경기 콘솔 열기」.
  8. **지원 역할(D8):** 결과 확정·고치기·담당자 배정 버튼 없음, 점수는 보임.
  9. **빈·특수:** 경기 0건 → 위 문구. 리그 응답(`round`·`fixtureNumber` null + `leagueFixtures` 제목)과 체험 모양 응답(`gameState` 없음, `legNumber:1`)에서 `container.textContent` 에 「null」·「undefined」 없음.
  10. 구장 담당자 배정 0건 + 운영자 → 안내 한 줄 1개, 카드에 「담당자 배정하기」 없음.
- [ ] **Step 2:** 실행 `./node_modules/.bin/vitest run src/components/tournament-live/operations-board-client.test.tsx` → FAIL. **Step 3:** 구현. **Step 4:** `./node_modules/.bin/vitest run src/components/tournament-live` + tsc + `node scripts/v1-pattern-check.mjs` PASS. **Step 5:** 커밋 `feat(web): 운영 보드를 구장별 시간 판과 목록 보기로 바꿔요`.

---

### Task 7: 「결과」 한 페이지 + 옛 주소 리다이렉트

**Files:** Create `components/tournament-ops/result-partition.ts`, `components/tournament-live/results-page-client.tsx`·`result-fixture-list.tsx`·`result-panel.tsx`(+tests), `app/admin/live/[id]/results/page.tsx`·`loading.tsx`, `app/tournament-ops/tournaments/[id]/results/page.tsx`, `app/admin/live/[id]/results-redirect.test.ts`; Modify `lib/tournament-live-routes.ts`, 옛 4개 `page.tsx`(→ 리다이렉트), `components/tournament-result-review/game-result-review-panel.tsx`·`game-result-correction-panel.tsx`·`result-edit-modal.tsx`(+tests: 화면에 보이는 「정정」·「고치고 확인」·「정정 확정/제출/사유/시작」·「공식 결과를 정정해요」·「정정 화면으로 이동」); Delete 옛 두 클라이언트(+tests)·`fixture-picker-list.tsx`(+test)·`result-review-grid-styles.tsx`(삭제 전 `git grep` 으로 다른 importer 0 재확인).

**Interfaces:**
```ts
export function partitionResultFixtures<T extends { fixtureId: string; gameId: string | null; revisionId: string | null }>(items: readonly T[], overdueFixtureIds: ReadonlySet<string>): { pending: (T & { gameId: string })[]; confirmed: (T & { gameId: string })[] }; // pending = revisionId null 또는 기한 초과; confirmed = 나머지 중 revisionId 있음; gameId null 제외; 한 경기는 한 묶음에만
export function usePendingResultCount(tournamentId: string, enabled: boolean): number; // useTournamentEndedFixtures 기반
export function legacyResultsRedirectHref(base: string, searchParams: Record<string, string | string[] | undefined>): string; // 쿼리 전부 보존
export function ResultPanel(props: { gameId: string; tournamentId: string; isRegularLeague: boolean; autoOpenFix: boolean; onSaved: () => void; onOfficialized?: () => void }): JSX.Element; // 기존 ExpandedResultPanel 이동: 최근 리비전 SUBMITTED → GameResultReviewPanel, 아니면 GameResultCorrectionPanel(autoOpen = autoOpenFix)
export function ResultsPageClient(props: { tournamentId: string }): JSX.Element;
```
화면: 머리 「결과」(설명 「끝난 경기의 결과를 확정하거나 고쳐요.」, 오른쪽 「끝난 경기 {n}」). `lg+` 왼쪽 목록 + 오른쪽 패널. 목록 두 묶음 「확정 대기 {n}」「확정됨 {n}」(보기 전환 칸 없음), 행 = 팀 이름 · 구장·시각·번호 · 배지(「확정 대기」 주황 톤 / 「확정됨」 녹색+체크), 점수는 확정됨 행에만(보드엔 공식 점수만 있다 — 대기 행의 점수는 패널에서), 선택 = 옅은 배경 + 1px 테두리 색(2px 파란 테두리 금지). 첫 선택 = 딥링크 `fixtureId` ?? 첫 확정 대기 ?? 없음. 폰(<lg) = 목록 → 행 누르면 패널만 + 「목록으로」. `autoOpenFix` 는 딥링크로 열린 경기만 true. 딥링크 경기가 목록에 없으면 「전달받은 경기는 지금 목록에 없어요. 아직 끝나지 않았거나 이미 처리됐을 수 있어요.」(`role="status"`). 빈 상태: 확정 대기 0 → 「지금 확정할 결과가 없어요」+「운영 보드로 가기」, 끝난 경기 0 → 「아직 끝난 경기가 없어요」. 확정 뒤 「공식 결과로 확정했어요.」. 패널엔 `correctionsHref` 를 넘기지 않는다. 패널 문구(CB·notes): 결과 고치기 시작 버튼 「결과 고치기」, 제출 「고친 결과로 확정」, 확정 버튼 「{점수}로 결과 확정」, 사유 라벨 「고친 이유」.

- [ ] **Step 1: 실패하는 테스트:**
  - `partitionResultFixtures`: revisionId null → pending / revisionId 있음 + overdue → pending / revisionId 있음 → confirmed / gameId null → 양쪽 모두 없음.
  - `ResultsPageClient`(MSW: ENDED 보드 2페이지 101건 — 101번째 경기도 목록에 있다; `/games/:id/result-revisions`): 묶음 제목 「확정 대기 1」「확정됨 1」; `?fixtureId=` 가 확정됨 경기면 고치기 폼이 바로 열리고, 목록에서 직접 누르면 열리지 않는다; 폰(`installViewport(390)`)은 목록 → 행 → 「목록으로」; `container.textContent` 에 「정정」·「결과 검토」·「고치고 확인」 없음; 지원 역할도 목록·패널이 보인다(패널이 읽기 전용 안내).
  - 리다이렉트(`next/navigation` 의 `redirect` 를 던지는 모의로, 각 옛 `page` 를 `await Page({ params: Promise.resolve({ id: 't-1' }), searchParams: Promise.resolve({ fixtureId: 'f1', from: 'admin' }) })`): `/admin/live/t-1/results?fixtureId=f1&from=admin`, `/tournament-ops/tournaments/t-1/results?fixtureId=f1&from=admin` (result-review·records/corrections 4개 전부).
  - 패널 테스트: 위 새 문구 단언으로 교체.
- [ ] **Step 2:** FAIL. **Step 3:** 구현(`result-review-page-client` 의 딥링크·officialized·overdue 처리를 옮기되 경합 서사 주석은 가져오지 않는다; `RequireAuth` 래핑은 상위 레이아웃이 이미 하므로 뺀다). **Step 4:** `./node_modules/.bin/vitest run src/components/tournament-live src/components/tournament-result-review src/app/admin/live src/app/tournament-ops src/hooks/use-tournament-result-review` + tsc PASS. **Step 5:** 커밋 `feat(web): 결과 검토와 결과 정정을 「결과」 한 페이지로 합쳐요`.

**다른 레인에 넘길 것(이 PR 에서 안 고침):** L7 — `operate/console-next-steps.tsx` 의 「결과 정정」→「결과 고치기」·링크를 `resultsHref` 로, `components/tournament-result-review/console-result-card.tsx` 의 「고치고 확인」·「결과 정정에서만」(소유는 **needs head**). L5 — `bracket-canvas/*`·`bracket-tab.tsx` 의 `records/corrections?fixtureId=` 는 리다이렉트로 계속 동작(급하지 않음). `app/admin/page.tsx:189` 도 같다.

---

### Task 8: 운영 셸 — 메뉴 4개 · 늘 보이는 다리 · 폰 아래 시트 · 한쪽 띠 제거(L8)

**Files:** Modify `components/tournament-ops/tournament-ops-shell.tsx`·`tournament-ops-shell.test.tsx`(재작성); Create `components/tournament-ops/ops-bridge.ts`·`ops-bridge.test.ts`.

**Interfaces:**
```ts
export interface OpsBridge { href: string; label: string }
export function resolveOpsBridge(input: { origin: TournamentOpsOrigin; role: V1TournamentStaffRole; kind: V1CompetitionKind | null | undefined; tournamentId: string; basePath: string; isConsole: boolean }): OpsBridge | null; // null = kind 조회 중(undefined), 자리는 남긴다
```
표(첫 일치): ① TOURNAMENT_DIRECTOR·kind≠league·콘솔 아님 → 「대회 관리로 돌아가기」 `/tournament-management/tournaments/{id}/overview` ② 콘솔 && (origin≠staff 또는 지원) → 「운영 보드로 돌아가기」 `{basePath}/operations` ③ origin staff → 「담당 경기 목록으로 돌아가기」(지원 `/my/tournament-staff`, 그 외 `/my/tournament-staff/{id}`) ④ kind undefined → null ⑤ origin admin·home·board: league → 「리그 관리로 돌아가기」 `/admin/league-matches/{id}`, PLATFORM_OPS → 「대회 관리로 돌아가기」 `/admin/tournaments/{id}`, 나머지 역할 → ③과 같음. 「서비스로 돌아가기」·「경기 목록으로 돌아가기」는 사라진다(plan decision: ⑤의 home·board 가 예전엔 `/home`).

메뉴: 운영 보드(`/operations`) · 결과(`/results`, `usePendingResultCount` 숫자 배지 `aria-label="확정 대기 {n}"`, `canManageTournamentResults` 아니면 잠김 + 이유 「결과 확정·고치기는 대회 운영자·플랫폼 운영자만 할 수 있어요.」) · 스태프·구장(`/staff`) · 영상(`/videos`). 「대회 관리」 항목은 뺀다(다리와 같은 곳). PLATFORM_OPS 의 어드민 표면에만 맨 아래 「다른 대회 고르기」 → `/admin/ops/tournaments?pick=1`. 배치: 데스크톱 = 고정 사이드바 맨 위에 다리 줄 → 대회 이름·역할 배지(`staffRoleLabel`) → 메뉴. 폰 = 상단 막대(☰·화면 이름) 아래 **고정 44px 다리 줄**(M6-1, `--tournament-ops-mobile-header-offset` 52px→96px), ☰ 는 **아래에서 올라오는 시트**(막대·다리는 안 덮음, 열리면 ☰→✕, 이름 `role=dialog` 「대회 운영 메뉴」 유지, 포커스 가두기·ESC·뒤로가기 닫기 기존 훅 재사용). 본문 위 옛 복귀 링크 블록은 삭제(중복). 선택 메뉴 = `bg-[var(--blue50)]` + 파란 글자, `border-l-2` 3곳(`:169,363,454`) 전부 삭제.

- [ ] **Step 1: 실패하는 테스트:** `ops-bridge.test.ts` — 표 행마다 `it.each`(역할·출처·종류·콘솔 조합 ≥ 12행, 문구·href 정확히), `kind undefined` → null, 어느 조합에도 「서비스로」가 없다. 셸(`QueryClientProvider` 로 감싸고 ENDED 보드만 MSW 로 응답 — 숫자 배지 때문): 메뉴 링크 이름이 정확히 `운영 보드·결과·스태프·구장·영상`(「다른 대회 고르기」는 PLATFORM_OPS 어드민 표면만) / 「결과 검토」「결과 정정」「경기 영상」「대회 관리」 링크 없음 / 지원의 「결과」는 `disabled` 이고 이유가 `title` 에 / 폰 폭에서 ☰ 를 안 눌러도 다리 링크가 보이고 ☰ → 시트 안에 메뉴 4개 / R-K3 정적 가드: 어떤 요소의 `className` 에도 `border-l`·`border-r-2`·`inset` 이 없다.
- [ ] **Step 2–4:** FAIL → 구현 → `./node_modules/.bin/vitest run src/components/tournament-ops src/components/tournament-live/tournament-live-gate.test.tsx` + tsc PASS. **Step 5:** 커밋 `feat(web): 운영 셸 메뉴를 4개로 줄이고 돌아가기 줄을 늘 보이게 해요`.

---

### Task 9: 대회·리그 현장 운영 런처

**Files:** Modify `app/admin/ops/tournaments/tournament-ops-picker-client.tsx`(+test 재작성), `page.tsx`(설명 문구 「대회나 리그를 골라 운영 보드로 들어가요.」, 클라이언트를 `<Suspense>` 로 감싼다 — `useSearchParams`), `components/tournament-ops-demo/demo-entry.tsx`·`demo.module.css`(한 줄 카드; 이 두 파일은 다른 레인 소유 목록에 없어 L6 이 가져간다 — needs head 확인).

**Interfaces:** Consumes `fetchOperationsBoardAll`(Task 2), `kstDayKey`, `useV1AdminTournaments`, `useV1AdminLeagueMatchList`. Produces: 같은 `TournamentOpsPickerClient`, 순수 `export function coversToday(startIso: string | null, endIso: string | null, todayKey: string): boolean`(끝이 없으면 시작 하루).

화면: 「오늘 경기 있는 대회·리그 {n}」(+오늘 날짜) → 비면 「오늘 경기가 있는 대회·리그가 없어요.」, 아래 「전체 {n}」(상태 칩 3개 삭제, 검색칸 「대회·리그 이름으로 찾기」), 표 열 상태·대회·리그·첫 경기·다음 할 일, 버튼 「운영 보드 열기」(`aria-label="{이름} 운영 보드 열기"`, `/admin/live/{id}/operations`), 맨 아래 체험 안내 한 줄(「경기 콘솔을 로그인 없이 5분 동안 연습해 볼 수 있어요. 실제 대회에는 영향이 없어요.」+「경기 콘솔 연습하기」), 맨 위 큰 체험 카드 삭제. 오늘 후보(D10) = 기간이 오늘을 덮고 상태가 초안·종료·취소가 아닌 것 최대 8개, 각각 `fetchOperationsBoardAll` 로 읽어 경기 시각이 오늘(KST)인 것만; 후보 하나의 읽기 실패는 그 행을 「전체」에만 두고 화면 오류로 올리지 않는다. S6-4: 판정이 끝났을 때 「오늘 경기 있음」이 정확히 1개이고 `pick=1` 이 아니면 `router.replace` 로 그 보드를 연다.

- [ ] **Step 1: 실패하는 테스트**(MSW, 날짜 고정): `coversToday` 표(시작=끝=오늘 / 기간 안 / 어제 끝 / 끝 null·시작이 어제) · 오늘 경기 1곳 → `replace('/admin/live/t1/operations')` 한 번 · 2곳 → 호출 없음 · `?pick=1` 이면 1곳이어도 호출 없음 · 기간은 덮지만 보드에 오늘 경기가 없으면 위 묶음엔 없고 전체에만 · 후보 보드 500 → 오류 화면 아님 · **좁힘:** 상태 칩(「진행 중」「접수 중」)이 없고 **이동:** 접수 중이며 오늘 경기 없는 대회가 「전체」에 보인다 · 이름 검색이 두 묶음을 거른다 · 리그 행도 같은 링크 모양.
- [ ] **Step 2–4:** FAIL → 구현 → `./node_modules/.bin/vitest run src/app/admin/ops src/components/tournament-ops-demo` + tsc PASS. **Step 5:** 커밋 `feat(web): 현장 운영 고르기 화면이 오늘 경기 있는 대회·리그를 먼저 보여줘요`.

---

### Task 10: 마무리 — 점검 · 용어 훑기 · 한쪽 띠 0 · 변경 기록 · PR

- [ ] **Step 1: 점검**(`apps/v1_web`): `./node_modules/.bin/tsc --noEmit -p tsconfig.json` 0 · `node scripts/v1-pattern-check.mjs` 통과 · `./node_modules/.bin/vitest run src/components/tournament-live src/components/tournament-ops src/components/tournament-result-review src/components/tournament-ops-demo src/components/my src/app/admin/live src/app/admin/ops src/app/tournament-ops src/hooks/use-tournament-result-review` 전부 PASS(영향 밖 풀스위트는 돌리지 않는다).
- [ ] **Step 2: 용어 훑기:** `git grep -nE "필드|경기장|코트|어웨이|디렉터|현장 진행요원|조회 전용|운영 콘솔|결과 검토|결과 정정|고치고 확인|서비스로 돌아가기|피리어드" -- components/tournament-live components/tournament-ops components/tournament-result-review app/tournament-ops app/admin/live app/admin/ops ':!*.test.*'` 에서 주석·식별자(`FIELD_OPERATOR`·`TOURNAMENT_DIRECTOR`)·L7 소유 파일을 뺀 **화면 문자열 0건**. 서버가 내려주는 「홈 팀 미정」·「어웨이 팀 미정」은 Q8 후속 목록 — PR 본문에 적는다.
- [ ] **Step 3: R-K3 정적 점검:** `git diff origin/dev -- <변경 파일> | grep -nE "^\+.*(border-l|border-r-[2-9]|shadow-\[inset|before:|border-2 border-blue)"` 0줄.
- [ ] **Step 4: 변경 기록** `.changeset/admin-ux-l6-field-ops.md`: `"v1_web": patch` + 한국어 두세 줄(운영 보드가 구장별 시간 판으로·결과 한 페이지·돌아가기 줄 고정·구장 담당자/대회 운영자 용어·한쪽 색 띠 제거).
- [ ] **Step 5: PR**(`dev` 대상, 한국어. `gh pr view <N> --json baseRefName` 이 `dev` 인지 확인 후 머지 요청). 본문: ① 바뀐 화면·옛 주소 리다이렉트 ② D1~D11 ③ 「머지 후 alpha 확인」 목록 — 구장 이름 선택지(D2)·24팀 구장 3곳 폰 높이·구장 4곳 열 3개·오늘/가장 가까운 날 기본값·런처 자동 열기와 「다른 대회 고르기」·지원 계정의 결과 메뉴 잠금·리그 운영 보드 ④ **R-K3 측정(머지 후 ego-browser, 390·1440 의 운영 보드·결과·런처·셸)** — 개수 0 기록:
  `[...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);const l=parseFloat(s.borderLeftWidth),r=parseFloat(s.borderRightWidth);return (l>=2&&l>r&&s.borderLeftStyle!=='none')||/inset \S+ 0px 0px 0px/.test(s.boxShadow)}).length`. 전후 비교 HTML·사용자 승인은 head 가 한다.

## Self-Review

- **Spec 대조:** S6 별도 셸·다리·메뉴 4개(T8)·구장 열 보드(T3·6)·결과 한 곳(T7)·런처 기본 필터(T9) · Q1 이동(T3 링크·T7) · Q2 날짜(T2·6)·구장 미정(T2·3)·시간 미정(T6)·목록 보기(T6)·리그(T6) · Q8 런처·셸·보드 공용 + 서버 문구는 PR 후속 목록(T10) · S6-1..5(T6 이름·T8 문구·T2·6 날짜·T9 자동 열기·T4·6 칩) · M6-1(T8)·M6-2(T4, 폰 한정 D11) · L8(T8 셸 3곳 + T7 새 목록 선택 표시) · O5(소유 파일 `window.confirm` 0 확인 + 겹침 확인 T5; `grant-staff-modal` 은 이미 `max-h-[calc(100dvh-32px)]` 라 변경 없음) · 용어(T1·각 Task·T10) · 구장 이름 조사(D2) · 백엔드(D1: 불필요) · 폰 구장 칩·시간 목록(T4·6).
- **이름 일관성:** `BoardCard`·`FieldColumn`·`NO_FIELD_KEY`·`resultsHref`·`fetchOperationsBoardAll`·`usePendingResultCount` 가 T2→T3~T9 에서 같은 철자. 기존 `useTournamentEndedFixtures`·`resultReviewKeys` 는 그대로 써서 죽은 코드가 안 생긴다(T7).
- **needs head:** (a) D9 시트에서 시간 변경 불가 (b) D8 지원의 카드 「결과 보기」 제거 (c) `console-result-card.tsx` 문구 소유(L6 vs L7) (d) `demo-entry.tsx` 소유 (e) D10 런처가 후보 보드를 읽는 비용(최대 8번 호출)이 과하면 기간만으로 줄이는 대안 (f) 보드의 「전반 12:31」·「시작/확정 시각」 표시(D4)는 서버 필드가 필요해 이번엔 뺌.

## Head 조율 결정 (2026-11-27, 실행자는 이 절을 우선한다)
- 보드에서 시간 바꾸기 제외 승인(시간은 대진 탭에서). 런처 후보 보드 읽기는 **기간이 오늘을 포함하는 대회만** 먼저 거른 뒤 최대 8개 — 승인.
- `demo-entry.tsx` 는 이 레인 소유 승인.
- `recorded-event-list` 의 「수정·취소」→「고치기」 는 L7 이 바꾼다(콘솔 부품). 결과 화면은 같은 부품을 써서 저절로 맞는다 — 이 레인은 그 문구를 따로 고치지 않는다.
- `game-result-review-panel.test.tsx` 는 L6·L7 둘 다 고친다 → **머지 순서 L6 먼저, L7 이 뒤에 그 파일을 rebase 대신 3-way merge 로 맞춘다.**
- 「경기 콘솔 맥락 줄(‹ 운영 보드로 돌아가기 · 구장 1 · 3번 경기)」은 이 레인(`tournament-ops-shell.tsx`) 몫 — S6-2 문구.
