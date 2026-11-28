# 어드민 대회 상세 셸(S2) + 사이드바 띠 제거(L8) Implementation Plan

> **상태:** 구현 완료 — PR #2582 로 dev 에 머지됐다. 아래 「Create」로 적힌 파일은 그 PR 이 만든 것이다. 레인 밖 마무리 수정(최종 리뷰·사용자 수정 요청)은 통합 PR #2589.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대회 상세의 머리를 한 줄(뒤로 · 대회명 · 상태 칩 메뉴 · 현장 운영 · 다음 단계 주 버튼 1개 · ⋯)로 줄이고, 세로 3그룹 내비를 가로 탭 5개 + 더보기로 바꾸고, 개요를 「요약 줄 · KPI 3 · 채워야 할 설정 · 참가자 화면」으로 다시 짠다. 같은 PR 에서 어드민 사이드바 선택 항목의 왼쪽 색 띠를 없앤다.

**Architecture:** 상태·탭·설정 판정은 순수 모델 파일(`tournament-status-model.ts`·`tournament-nav-model.ts`·`tournament-overview-model.ts`)에 두고 화면은 그 결과만 그린다. 메뉴·시트는 L0 의 `ActionMenu`(C-1)를 쓰고, 가로 탭은 새 `AdminTabNav` 로 만든다. 리그 어드민이 같이 쓰는 `AdminSectionNav`·`TournamentOpsQuickLinks`·`CompetitionVisibilityControl` 의 동작은 바꾸지 않는다.

**Tech Stack:** React 19, Next.js 16 App Router, TanStack Query(hooks mock), Tailwind v4 토큰, Vitest + Testing Library.

**Spec:** `.github/tasks/20261140-admin-tournament-ux-renovation.md` — 「S2」, 「레인 사이 계약」 C-1·C-5(대회 정보 섹션 계약 — `info-sections.ts`), Q7, 2차 결정 M1-1·M1-2·M3-1, L8, head 추가 지시(`?created=1`). 목업: 로컬 목업 `mockups/s2-shell/A.html`(저장소 밖)(데스크톱 + 폰 2프레임), `m1-create/index.html` 프레임 (e). 선행: **L0 PR(ActionMenu·`test/match-media.ts`·`info-sections.ts`)이 `origin/dev` 에 머지된 뒤** 착수한다.

## Global Constraints

- **한쪽 색 띠 금지(R-K3)**: 카드·목록 줄·메뉴 항목·사이드바 항목에 `border-left`/`border-l-N`/`inset Npx 0 0` 그림자/`before:` 띠 없음. 목업 CSS 의 `.s2-status .pub{border-left:…}` 를 그대로 옮기지 않는다(칩 안 구분은 글자 `·`). 선택 상태 = 옅은 배경(+글자색·굵기). 탭 활성 표시는 목업대로 아래쪽 2px 중립색(`--text-strong`) 밑줄만 쓴다(R-K3 측정 대상은 왼쪽·오른쪽 테두리·inset 그림자).
- 공통 용어: 장소(필드·경기장 금지), 구장, 신청(접수·등록 금지 — 상태 이름 「접수 중」·「접수 마감」·버튼 「접수 시작하기」 등 spec 이 정한 것은 예외), 현장 운영. UI 문구는 해요체, 결과 문장.
- 토큰만(하드코딩 색·px 폰트 금지), 터치 타겟 44px 이상(탭·칩·버튼·메뉴 행), 아이콘 버튼 `aria-label`, 장식 `aria-hidden="true"`, 색만으로 전달 금지(상태 칩 = 아이콘+글자).
- 오류는 `extractErrorMessage(err, '해요체 fallback')`, 상태 라벨은 기존 `AdminStatusPill`·`tournament-admin-shared.ts` 를 쓰고 새 한국어 상태 이름 표는 `tournament-status-model.ts` 한 곳에만 둔다. `React.forwardRef` 금지.
- 모든 상태 전환은 앱 확인 창: 앞으로 가기·접수 다시 열기는 `useConfirm`, 취소·되돌리기는 사유가 필요한 기존 `GateConfirmModal`(문구 그대로). 접수 시작 확인 창은 「필요」 항목이 남아도 **막지 않고 경고만** 한다(Q7). 서버 규칙(유료인데 계좌 없음 거절)은 그대로 서버가 막는다.
- 새 주석은 코드가 말하지 못하는 제약만, 한국어, 3줄 이하. 리그 어드민 동작·`admin-section-nav.tsx`·`competition-visibility-control.tsx`·`layout.tsx` 는 수정하지 않는다.

## Review Focus

1. **조회 전용 관리자**(`support`)·**스태프 면**(`staffSurface`)·**공개 샘플**(`navigation`): 상태 변경·취소 항목이 메뉴에 없고(주 버튼도 없음), 공개 스위치는 비활성+이유, 팝업·징계는 스태프 면에서 빠진다. → Task 6·7.
2. 접수 시작 확인 뒤 **서버가 거절**(409, 유료인데 계좌 없음): 서버 메시지가 토스트로 나가고 칩·버튼 상태는 그대로다. → Task 7.
3. 칩 메뉴에서 취소·되돌리기를 고르면 **메뉴가 닫힌 뒤** 사유 창이 열린다(폰 시트 위에 창이 겹치면 안 됨). → Task 7.
4. **리그 어드민**은 그대로: `league-admin-shell.test.tsx`·`tournament-ops-quick-links.test.tsx`·`admin-section-nav.test.tsx`·`competition-visibility-control.test.tsx` 가 수정 없이 통과. → Task 5·8.
5. `operationCounts` 가 없는 응답·0 건: 탭 숫자와 KPI 가 `undefined`/NaN 을 그리지 않고, 초안이 전부 0 이면 KPI 줄을 감춘다(대진·공지가 있으면 보인다). → Task 4·8.

## File Structure

| 파일 | 역할 |
|---|---|
| `components/admin/admin-shell.tsx` (수정) | 사이드바 선택 띠 제거(L8) |
| `app/admin/tournaments/[id]/tournament-overview-model.ts` (수정) | 체크리스트 → L0 `tournamentInfoNeeds`(C-5) + 대진·공지 항목을 합친 설정 항목 모델 |
| `app/admin/tournaments/[id]/tournament-status-model.ts` (신규) | 칩 이름·진행 단계·상태 동작·확인 창 문구 |
| `app/admin/tournaments/[id]/tournament-nav-model.ts` (신규) | 탭·더보기 구성(상태·면별) |
| `components/admin/admin-tab-nav.tsx` (신규) | 가로 탭 + 더보기(`ActionMenu`). `AdminSectionNav` 는 리그 전용으로 남는다 |
| `app/admin/tournaments/[id]/tournament-ops-quick-links.tsx` (수정) | 접근 판정을 `useTournamentOpsAccess` 로 분리(칩 줄은 리그용 그대로) |
| `components/admin/tournaments/tournament-visibility-control.tsx` (수정) | 공개 카드 삭제, 메뉴 항목 `tournamentVisibilityAction` 추가 |
| `app/admin/tournaments/[id]/tournament-status-menu.tsx` (신규) | 상태 칩 + 진행 막대 + 메뉴 |
| `app/admin/tournaments/[id]/tournament-detail-header.tsx` (신규) | 한 줄 머리 |
| `app/admin/tournaments/[id]/tournament-admin-shell.tsx` · `overview-section.tsx` (수정) | 조립 / 개요 |

Interfaces 는 태스크 순서대로 쌓인다: 2(설정 항목) → 3(상태) → 4(탭) → 5(접근·공개) → 6(머리·칩) → 7(셸) → 8(개요).

---

### Task 1: 사이드바 선택 띠 제거 (L8)

**Files:** Modify `apps/v1_web/src/components/admin/admin-shell.tsx`(241·429 줄 근처 두 링크) · Test `admin-shell.test.tsx`

**Interfaces:** Produces 모듈 내부 `sidebarLinkClass(active: boolean): string` — 데스크톱 `SidebarLink` 와 모바일 `Drawer` 링크가 같이 쓴다.

- [ ] **Step 1: 작업 공간.** `git fetch origin dev` → `git worktree add .claude/worktrees/admin-ux-l1 -b feat/admin-ux-l1-shell origin/dev`; 루트와 `apps/v1_web` 에 메인 트리 `node_modules` 심링크. 명령은 `apps/v1_web` 에서 `./node_modules/.bin/…`.
- [ ] **Step 2: 실패하는 시험.** `describe('AdminShell 사이드바 선택 표시')` — `it('선택된 항목과 나머지 모두 왼쪽 색 띠 클래스가 없고, 선택은 aria-current 와 옅은 배경으로 표시한다')`: pathname mock `/admin`. `getAllByRole('link', { name: '대시보드' })`(사이드바 + 서랍은 「메뉴 열기」 클릭 후) 각각 `aria-current="page"`, `className` 이 `/\bborder-l|border-blue-500|border-transparent/` 에 안 걸리고 `bg-[var(--blue50)]` 를 가진다. 다른 링크(`모니터링`)는 `aria-current` 없음·같은 띠 클래스 없음.
- [ ] **Step 3: 실패 확인.** `./node_modules/.bin/vitest run src/components/admin/admin-shell.test.tsx` → 새 시험 FAIL(`border-l-2`).
- [ ] **Step 4: 구현.** `sidebarLinkClass` — 공통 `tm-admin-sidebar-link mx-2 flex min-h-[44px] items-center gap-3 rounded-lg px-2 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]`, 선택 `bg-[var(--blue50)] text-[var(--blue700)] font-semibold`, 비선택 `text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-strong)]`(`mx-2`+`px-2` 로 글자 시작 위치가 구획 제목 `px-4` 와 같다). 두 링크의 중복 클래스 문자열을 이 함수 호출로 교체하고 `border-l-2`·`border-blue-500`·`border-transparent`·`/60` 를 지운다.
- [ ] **Step 5: 통과 확인.** 같은 명령 PASS. **Step 6: Commit** `git add apps/v1_web/src/components/admin/admin-shell.tsx apps/v1_web/src/components/admin/admin-shell.test.tsx && git commit -m "fix(web): 어드민 사이드바 선택 항목의 왼쪽 색 띠를 배경 표시로 바꾼다"`

---

### Task 2: 「채워야 할 설정」 항목 모델 (C-5 + 다른 탭 항목)

**Files:** Modify `app/admin/tournaments/[id]/tournament-overview-model.ts`(`buildTournamentChecklist`·`TournamentOverviewCheck` 삭제 후 교체; `daysUntil`·`resolveNextMilestone` 유지) · Test `tournament-overview-model.test.ts`

**Interfaces — Consumes(L0 `./info-sections`):** `tournamentInfoNeeds(t, basePath?): InfoNeed[]`, `infoNeedHref(need, tournamentId, basePath?)`, `INFO_NEED_TIER_LABEL`, `InfoNeedKey`, `InfoNeedTier`. 판정·문구·단계는 C-5 가 정하고 이 모델은 다시 쓰지 않는다. **Produces:**
```ts
export interface TournamentSetupItem {
  key: InfoNeedKey | 'bracket' | 'announcements'; tier: InfoNeedTier;
  label: string; detail: string; href: string;      // 이동 주소(info 항목은 ?edit= 딥링크, 그 밖은 탭 경로)
  actionLabel: string;                               // 「필요」 첫 항목의 주 버튼 글자 / 그 밖의 이동 글자
}
export function buildTournamentSetupItems(t: V1Tournament, now: Date, basePath: string): TournamentSetupItem[]; // required → review → optional(안정 정렬)
export function requiredSetupLabels(items: readonly TournamentSetupItem[]): string[]; // tier==='required' 의 label
```
**이 모델이 덧붙이는 것:** (a) 다른 탭 항목 둘(`optional`, `completed`·`cancelled` 는 없음) — 경기 0 → key `bracket`·label `대진`·detail `대진 관리에서 조를 만들고 경기를 편성해요.`·`href=${basePath}/bracket`; 경기>0 이고 `!isBracketPublished(bracketPublishedAt, bracketPublishScheduledAt, now)` → key `bracket`·label `대진표 공개`·detail `공개 전에는 참가자에게 조와 경기가 보이지 않아요.`; 공지 0 → key `announcements`·label `공지`·detail `집합 시간·준비물 같은 안내를 공지로 남겨요.`·`href=${basePath}/announcements`. (b) `actionLabel`: venue `장소 정하기`, roster-deadline·registration-deadline `마감 정하기`, bank-account `계좌 입력하기`, scheduled-at `일정 정하기`, entry·rules·public-screen `대회 정보`, stage-plan·bracket `대진`, announcements `공지`.

- [ ] **Step 1: 실패하는 시험**(C-5 자체 판정 시험은 L0 에 있으니 여기서 반복하지 않는다. 기존 `tournament()` 픽스처에 `venue`·`minPlayers`·`maxPlayers` 를 더해 「지적 없음」 기준 유지; `buildTournamentChecklist` 시험 블록은 아래로 대체):
  - `it('다 채워진 접수 중 대회는 항목이 없다')`, `it('끝난 대회는 항목이 없다')`.
  - `it('info 항목은 ?edit= 딥링크로, 스태프 면 basePath 에서도 그 경로를 쓴다')` — 장소 없음 → `href` `/admin/tournaments/tournament-1/info?edit=schedule`; `basePath` `/tournament-management/tournaments/tournament-1` 이면 같은 경로 접두.
  - `it('경기가 없으면 편성부터, 있으면 공개 여부를 지적하고 예약 공개 시각이 지난 대진표는 미공개로 보지 않는다')`(기존 시험 이식), `it('공지가 없으면 공지 항목이 나온다')`.
  - `it('단계 순서는 필요 → 기본값 확인 → 선택이다')`(초안에서 venue 없음·entry/rules·bracket 이 같이 있을 때), `it('requiredSetupLabels 는 필요 항목의 label 만 같은 순서로 준다')`(`['장소','정산 계좌']`).
  - `it('actionLabel 은 키별로 정해진 글자다')`(table-driven 위 (b)).
  - `it('여러 단계 초안의 단계 구성 항목은 대진 탭으로 가고 actionLabel 은 대진이다')`.
- [ ] **Step 2: 실패 확인** `./node_modules/.bin/vitest run "src/app/admin/tournaments/[id]/tournament-overview-model.test.ts"` → FAIL. **Step 3: 구현**(C-5 결과를 `TournamentSetupItem` 으로 옮기고 (a)(b) 를 덧붙인 뒤 단계 순으로 안정 정렬). **Step 4: PASS 확인.** `overview-section.tsx` 는 Task 8 까지 컴파일이 깨지므로 이 커밋에서는 `tsc` 를 돌리지 않는다.
- [ ] **Step 5: Commit** `git add "apps/v1_web/src/app/admin/tournaments/[id]/tournament-overview-model.ts" "apps/v1_web/src/app/admin/tournaments/[id]/tournament-overview-model.test.ts" && git commit -m "feat(web): 개요의 채워야 할 설정을 대회 정보 섹션 계약 기반 항목 모델로 바꾼다"`

---

### Task 3: 상태 모델 (칩 이름·진행 단계·동작·확인 창)

**Files:** Create `app/admin/tournaments/[id]/tournament-status-model.ts` · Test `tournament-status-model.test.ts`

**Interfaces — Consumes:** `allowedNextStatuses`·`revertTargetStatus`·`REVERT_COPY`(`./tournament-admin-shared`), `ConfirmOptions`(`@/components/v1-ui/confirm-modal`). **Produces:**
```ts
export const TOURNAMENT_STAGES = ['draft','open','closed','in_progress','completed'] as const;
export const TOURNAMENT_STAGE_LABEL: Record<(typeof TOURNAMENT_STAGES)[number], string>; // 초안 · 접수 중 · 접수 마감 · 진행 중 · 완료
export const TOURNAMENT_CHIP_LABEL: Record<V1TournamentStatus, string>; // 위 + cancelled: 취소됨
export function stageIndex(status: V1TournamentStatus): number | null; // cancelled → null
export type StatusActionKind = 'forward' | 'reopen' | 'revert' | 'cancel';
export interface StatusAction { key: string; kind: StatusActionKind; target: V1TournamentStatus; label: string; description: string }
export function statusActions(status: V1TournamentStatus, ctx: { canRevertStart: boolean }): StatusAction[]; // forward, reopen, revert, cancel 순
export function primaryStatusAction(status, ctx): StatusAction | null; // forward 하나뿐(completed·cancelled 는 null)
export function statusConfirmOptions(action: StatusAction, ctx: { isPublic: boolean; requiredLabels: readonly string[] }): ConfirmOptions | null; // cancel·revert 는 null(사유 창을 쓴다)
```
**동작 표(label · description):** draft→open `접수 시작하기`·`신청을 받기 시작해요.` / open→closed `접수 마감하기`·`새 신청을 더 받지 않아요. 필요하면 다시 열 수 있어요.` / closed→in_progress `대회 시작하기`·`대진표와 경기 일정을 먼저 확인해 주세요.` / closed→open(reopen) `접수 다시 열기`·`새 신청을 다시 받아요.` / in_progress→completed `대회 완료하기`·`시상과 후기가 열리고 참가팀에 후기 요청 알림이 가요.` / revert 는 `REVERT_COPY[status].button` 과 `description` 첫 문장(in_progress+`canRevertStart`·completed·cancelled 만) / cancel(draft·open·closed·in_progress) `대회 취소하기`·`취소 사유를 남겨요. 나중에 초안으로 복구할 수 있어요.`
**확인 창:** closed·in_progress·completed 는 셸의 기존 `STATUS_CHANGE_CONFIRM` 문구를 글자 그대로 옮긴다(삭제는 Task 7). 새 것 — reopen: `{title:'접수를 다시 열까요?', message:'새 참가 신청을 다시 받아요.', confirmLabel:'접수 다시 열기'}`. draft→open: `title '접수를 시작할까요?'`, `confirmLabel '접수 시작하기'`, `message` = (`isPublic` ? `신청을 받기 시작하고 참가자에게 대회가 공개돼요.` : `신청을 받기 시작해요. 비공개 설정이라 일반 화면에는 계속 보이지 않아요.`) + (`requiredLabels` 가 있으면 ` 아직 채우지 않은 설정이 있어요: {labels.join(', ')}. 접수를 시작한 뒤에도 대회 정보에서 채울 수 있어요.`).

- [ ] **Step 1: 실패하는 시험:** `it.each` 로 상태별 `statusActions` 의 `(kind,target,label)` 열(draft: forward open·cancel / open: closed·cancel / closed: in_progress·reopen·cancel / in_progress: completed·cancel, `canRevertStart` 일 때만 revert closed 가 cancel 앞에 / completed: revert in_progress 만 / cancelled: revert draft 만); `primaryStatusAction` 은 draft→`접수 시작하기`·open→`접수 마감하기`·closed→`대회 시작하기`(「접수 다시 열기」 아님)·in_progress→`대회 완료하기`·completed·cancelled→null; `stageIndex` 0~4 와 cancelled null; `statusConfirmOptions`: cancel/revert null, draft→open 의 message 가 필요 항목 없음/있음(`장소, 정산 계좌` 포함)/비공개 세 갈래, **`requiredLabels` 가 있어도 반환값이 null 이 아니다**(막지 않는다). **Step 2** 실패 확인 `vitest run "…/tournament-status-model.test.ts"`. **Step 3** 구현. **Step 4** PASS. **Step 5** Commit `feat(web): 대회 상태 동작·확인 창 문구를 한 모델로 모은다`.

---

### Task 4: 탭 모델 + AdminTabNav

**Files:** Create `app/admin/tournaments/[id]/tournament-nav-model.ts`, `components/admin/admin-tab-nav.tsx` · Test `tournament-nav-model.test.ts`, `admin-tab-nav.test.tsx`

**Interfaces — Consumes:** `AdminSectionNavItem`(`@/components/admin/admin-section-nav` 타입만), `ActionMenu`·`ActionSheetAction`(L0), `installMatchMedia`(`@/test/match-media`). **Produces:**
```ts
export interface TournamentNavInput { id: string; status: V1TournamentStatus; staffSurface: boolean; restricted: boolean /* navigation 이 있는 공개 샘플 */; localPopups: boolean; counts?: { registrations?: number; fixtures?: number; announcements?: number } }
export interface TournamentNavModel { tabs: AdminSectionNavItem[]; more: { label: string; items: AdminSectionNavItem[] }[] }
export function buildTournamentNav(input: TournamentNavInput): TournamentNavModel;
export interface AdminTabNavProps { ariaLabel: string; tabs: readonly AdminSectionNavItem[]; more?: { label: string; groups: readonly { label: string; items: readonly AdminSectionNavItem[] }[] }; basePath: string; pathname: string; query?: string }
export function AdminTabNav(props: AdminTabNavProps): JSX.Element;
```
**모델 규칙:** 탭 이름 `개요`(overview)·`신청`(registrations, 건수)·`대진`(bracket, 건수)·`공지`(announcements, 건수) 뒤에, `status` 가 `in_progress`·`completed` 면 `시상`(awards)·`리뷰 관리`(reviews)·`통계`(statistics), 아니면(취소 포함) `대회 정보`(info). 건수는 `> 0` 일 때만 `count`. 더보기 묶음 순서: `홍보`[협찬(sponsors)·팝업(popups)·캠페인(campaign)] → `운영`[(진행 중·완료일 때만 앞에) 대회 정보(info)·징계 현황(discipline)] → `대회 후`[리뷰 관리·시상·통계 — 진행 중·완료가 아닐 때만]. 팝업은 `externalHref = /admin/content?tab=popups&targetPath=<encode('/tournaments/'+id)>`·`externalNote: '전역 팝업 화면으로 이동해요'`; `staffSurface` 면 팝업 없음, `localPopups` 면 externalHref 없이 일반 슬러그; 징계 현황은 `staffSurface || restricted` 면 없음; 빈 묶음은 버린다.

- [ ] **Step 1: 실패하는 시험.** 모델: `it('접수 전·접수 중·마감은 탭 [개요,신청,대진,공지,대회 정보] 이고 시상·리뷰·통계는 더보기「대회 후」에 있다')`; `it('진행 중·완료는 탭 [개요,신청,대진,공지,시상,리뷰 관리,통계] 이고 대회 정보가 더보기「운영」으로 간다(양방향)')`; `it('스태프 면은 팝업·징계 현황이 없고 공개 샘플은 징계가 없고 팝업이 샘플 경로 슬러그다')`; `it('건수는 0 이거나 없으면 count 가 없다')`. 컴포넌트(`installMatchMedia(1024)`, next/navigation mock): `it('탭은 링크이고 현재 경로와 같은 탭만 aria-current=page 이며 이름에 건수가 붙는다')`(`신청 3`); `it('모든 탭 링크는 min-h-[44px]·min-w-[44px] 이다')`(클래스 단언 — 실제 측정은 Task 9); `it('현재 탭이 바뀌면 그 탭이 화면 안으로 스크롤된다')` — `Element.prototype.scrollIntoView = vi.fn()` 후 `rerender` 로 pathname 변경, `mock.contexts` 의 마지막이 `신청` 링크이고 인자가 `{ inline: 'center', block: 'nearest' }`; `it('더보기를 열면 묶음 제목과 항목이 보이고 팝업은 외부 주소 링크다')`; `it('현재 경로가 더보기 항목이면 더보기 버튼이 aria-current=true 를 가진다')`; `it('query 는 슬러그 링크에만 붙는다')`; 폰 폭(`installMatchMedia(390)`)에서 같은 더보기가 dialog 시트로 열린다.
- [ ] **Step 2** 실패 확인. **Step 3: 구현.** `AdminTabNav` — `<nav aria-label>`; 폰에서 탭 줄이 상단바(52px) 아래에 붙는다(`sticky top-[52px] z-10 bg-[var(--bg)] lg:static`, 배경이 페이지 좌우 여백까지 덮도록 `-mx-4 px-4 md:-mx-6 md:px-6 lg:mx-0 lg:px-0`). 안쪽은 `flex`: 탭 스크롤 영역(`min-w-0 flex-1 overflow-x-auto`) + 오른쪽에 붙은 `더보기` 트리거(`shrink-0`, 항상 보임). 탭 링크 `inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 border-b-2 px-3.5 text-[length:var(--font-size-body-sm)]` — 활성 `border-[var(--text-strong)] font-bold text-[var(--text-strong)]`, 비활성 `border-transparent text-[var(--text-muted)]`, 건수 `text-[var(--blue700)] font-bold`. 활성 판정은 `pathname === href || pathname.startsWith(href + '/')`. `useEffect([pathname])` 에서 활성 요소 `scrollIntoView?.({ inline: 'center', block: 'nearest' })`(jsdom 에는 없으므로 옵셔널 호출). 더보기는 `ActionMenu`(`label=more.label`, `align="end"`): 항목은 `{ key: slug, label, href: externalHref ?? basePath/slug+query, groupLabel, description: externalNote, icon: externalHref ? <ExternalLink size={14} aria-hidden="true" /> : undefined }`. **Step 4** PASS. **Step 5** Commit `feat(web): 대회 상세용 가로 탭(AdminTabNav)과 탭 구성 모델을 더한다`.

---

### Task 5: 현장 운영 접근 판정 분리 + 공개 스위치 메뉴 항목

**Files:** Modify `app/admin/tournaments/[id]/tournament-ops-quick-links.tsx`, `components/admin/tournaments/tournament-visibility-control.tsx` · Test `tournament-ops-quick-links.test.tsx`(수정 없이 통과해야 함), `tournament-visibility-control.test.tsx`(교체)

**Interfaces — Produces:**
```ts
export function useTournamentOpsAccess(p: { tournamentId: string; staffSurface?: boolean; basePath?: string }): { base: string; reasonLabel: string | undefined };
export function tournamentVisibilityAction(i: { isPublic: boolean; status: V1TournamentStatus; canWrite: boolean; pending: boolean; onToggle: (next: boolean) => void }): ActionSheetAction | null;
```
`tournamentVisibilityHiddenReason` 은 그대로 export(목록 행 동작이 쓴다). `TournamentVisibilityControl` 카드와 그 시험은 삭제한다(셸이 더는 쓰지 않는다 — dead code 금지).

- [ ] **Step 1: 실패하는 시험**(`tournament-visibility-control.test.tsx` 를 교체): `it('취소된 대회는 항목이 없다(노출 안 됨 사유 export 는 유지)')`; `it.each` 설명 문구 — 공개+초안 `접수를 시작하면 공개돼요.` / 비공개+초안 `접수를 시작해도 비공개로 유지돼요.` / 공개 `공개 대회 목록과 검색, 홈 화면에 보여요.` / 비공개 `일반 사용자에게 숨겨져요. 관리자 운영과 참가·대진 정보는 유지돼요.`; `it('label 은 「참가자에게 공개」, checked 는 isPublic, groupLabel 은 「공개」, 누르면 onToggle 에 !isPublic 을 넘긴다')`; `it('canWrite=false 면 비활성이고 이유는 「현재 계정은 공개 상태를 변경할 권한이 없어요.」, pending 이면 「저장 중이에요.」')`. 기존 `tournament-ops-quick-links.test.tsx` 는 건드리지 않고 그대로 돌려 회귀 가드로 쓴다.
- [ ] **Step 2** 실패 확인 `vitest run "…/tournament-visibility-control.test.tsx"`. **Step 3: 구현** — `useTournamentOpsAccess` 는 지금 컴포넌트 안의 조회·판정(`useV1TournamentStaffAssignments`·`classifyTournamentStaffAccessError`·라벨 3종)과 `base` 계산을 그대로 옮기고, `TournamentOpsQuickLinks` 는 그 훅을 불러 출력이 이전과 같다. **Step 4** 아래 세 파일 PASS: visibility-control·`tournament-ops-quick-links`·`src/components/admin/competition-visibility-row-action.test.tsx`. **Step 5** Commit `refactor(web): 현장 운영 접근 판정과 공개 스위치 항목을 셸 밖에서 쓸 수 있게 분리한다`.

---

### Task 6: 상태 칩 메뉴와 한 줄 머리

**Files:** Create `app/admin/tournaments/[id]/tournament-status-menu.tsx`, `tournament-detail-header.tsx` · Test `tournament-detail-header.test.tsx`

**Interfaces — Consumes:** Task 3·5, `ActionMenu`(L0, `header` 확장 포함), `AdminStatusPill`. **Produces:**
```ts
export interface TournamentStatusMenuProps { status: V1TournamentStatus; isPublic: boolean; canWrite: boolean; canRevertStart: boolean; visibilityPending: boolean; onStatusAction: (a: StatusAction) => void; onToggleVisibility: (next: boolean) => void }
export function TournamentStatusMenu(p: TournamentStatusMenuProps): JSX.Element;
export interface TournamentDetailHeaderProps {
  title: string; meta: string; listHref: string; statusMenu: ReactNode;
  primaryAction?: { label: string; emphasis: 'primary' | 'secondary'; busy: boolean; onClick: () => void };
  liveOps?: { href: string; reasonLabel?: string };      // 머리에 둘 때만
  moreActions: readonly ActionSheetAction[];
}
export function TournamentDetailHeader(p: TournamentDetailHeaderProps): JSX.Element;
```
**칩:** 트리거 = 44px 테두리 버튼, 안에 `AdminStatusPill`(`label={TOURNAMENT_CHIP_LABEL[status]}`) + 글자 ` · 공개|비공개` + 아래 화살표(취소됨이면 공개 부분 없음). 접근 이름 = 보이는 글자(예 `접수 중 · 공개`). **메뉴:** `ActionMenu label="대회 상태"`, `header` = 진행 막대(`<ol aria-label="진행 단계">` 5칸, 현재까지 `done`, 현재 칸 `aria-current="step"`, 칸 이름은 `TOURNAMENT_STAGE_LABEL`, 맨 앞 글자 `지금: {칩 이름}`; 취소됨이면 막대 없이 `지금: 취소됨`), `actions` = [`canWrite` 일 때 forward·reopen·revert 를 `groupLabel '상태 바꾸기'` + `description` 포함] + [`tournamentVisibilityAction`(없으면 생략)] + [`canWrite` 일 때 cancel 을 `destructive: true`, `groupLabel '되돌리기 어려운 동작'`]; 항목 선택은 `onStatusAction(action)`/`onToggleVisibility`. **머리 배치:** 뒤로 링크(`aria-label="대회 목록으로"`, 44px, `href=listHref`) · `<h1>` 대회명(한 줄 말줄임) · 칩 · 아래 `meta` 한 줄; 오른쪽(폰에서는 둘째 줄)에 `현장 운영`(링크 `href`, `reasonLabel` 이 있으면 비활성 버튼 + 사유 글자가 같이 보임) · 주 버튼(`emphasis` 에 따라 `tm-btn tm-btn-md tm-btn-primary` / `tm-btn-outline`, `busy` 면 비활성) · `moreActions` 가 있으면 ⋯(`ActionMenu label="대회 더 보기" align="end"`, 아이콘 버튼 `aria-label="대회 더 보기"`). 칩·주 버튼은 DOM 에 한 번만 두고 폰/데스크톱 위치는 CSS 로만 옮긴다.

- [ ] **Step 1: 실패하는 시험**(`installMatchMedia(1024)` 기본, 필요한 곳만 390): `it('칩은 상태와 공개 여부를 글자로 말하고 누르면 메뉴가 열린다')`(`접수 중 · 공개`, menu 이름 `대회 상태`); `it('메뉴 맨 위에 현재 단계가 진행 막대로 보인다')`(`진행 단계` 리스트의 항목 5개, 두 번째가 `aria-current=step`); `it('취소됨 칩은 공개 여부 글자와 진행 막대가 없다')`; `it('canWrite=false 면 상태 바꾸기·대회 취소 항목이 없고 공개 스위치는 비활성이다')`; `it('항목을 고르면 onStatusAction 에 그 동작이 전달된다')`; 머리: `it('현장 운영은 liveOps 가 있을 때만 머리에 있고, reasonLabel 이 있으면 비활성이며 사유가 보인다')`, `it('주 버튼은 emphasis 에 따라 primary/outline 클래스를 가지고 없으면 그리지 않는다')`, `it('moreActions 가 비면 ⋯ 가 없고 있으면 메뉴 항목이 열린다')`. **Step 2** 실패 확인. **Step 3** 구현. **Step 4** PASS. **Step 5** Commit `feat(web): 대회 상세 한 줄 머리와 상태 칩 메뉴를 더한다`.

---

### Task 7: 셸 조립

**Files:** Modify `app/admin/tournaments/[id]/tournament-admin-shell.tsx`(`SECTION_GROUPS`·`SectionItem`·`STATUS_CHANGE_CONFIRM`·`AdminPageHeader`·상태 버튼 줄·되돌리기 줄·`TournamentVisibilityControl`·`TournamentOpsQuickLinks`·`AdminSectionNav` 사용 삭제) · Test `tournament-admin-shell.test.tsx`(전면 재작성)와 영향받는 시험 3개

**Interfaces — Consumes:** Task 2~6. `TournamentManagementContent` 의 props(`id, role, staffSurface, navigation, children`)·`TournamentAdminProvider` 값·`GateConfirmModal`(취소·되돌리기) 은 그대로.

- [ ] **Step 1: 실패하는 시험.** `tournament-admin-shell.test.tsx` 를 아래 계약으로 다시 쓴다(기존 mock 모듈 골격 유지, `useV1AdminTournament` 가 `isPublic`·`venue`·`teamCount`·`entryFee`·`operationCounts` 를 돌려주게 하고 상태·필드는 hoisted 변수로 바꾼다; 기본 폭은 `installMatchMedia(390)`, 데스크톱 시험만 1440):
  - 머리: `it('대회 목록으로 링크가 listHref(스태프 면은 /tournament-management)를 가리키고 대회명이 h1 이다')`, `it.each(상태→주 버튼)` — draft `접수 시작하기`·open `접수 마감하기`·closed `대회 시작하기`·in_progress `대회 완료하기`; 주 버튼은 머리에 **한 번만** 있다(`getAllByRole('button', {name})` 길이 1); completed·cancelled 는 주 버튼 없음.
  - 제거 + 도달 가능(양방향): `it('공개 설정 카드·스태프 배정 콘솔·운영 보드 칩·되돌리기 버튼 줄이 없고, 같은 기능은 칩 메뉴·⋯ 메뉴에서 닿는다')`.
  - 확인 창: `it.each` 전환 5종(draft→open, open→closed, closed→in_progress, closed→open 은 칩 메뉴의 `접수 다시 열기`, in_progress→completed) — 누르면 해당 `dialog`(`접수를 시작할까요?` …)가 뜨고 그 전에는 `statusMutate` 0 회, 확인하면 `{ status }` 로 1 회; 취소 `취소`/`돌아가기` 면 호출 0.
  - Q7: `it('필요 항목(장소·정산 계좌)이 남아도 접수 시작을 막지 않고 확인 창에 항목을 경고한다')` — 확인 창 message 에 `장소, 정산 계좌`, 확인하면 mutate 호출됨; `it('필요 항목이 없으면 경고 문장이 없다')`.
  - M1-1: `it('초안에서 필요 항목이 남으면 접수 시작하기가 outline, 0 이면 primary 버튼이다')`(클래스 `tm-btn-outline`/`tm-btn-primary`), `it('초안이 아닌 상태의 주 버튼은 항상 primary 다')`.
  - M1-2: `it('경기가 있으면 머리에 현장 운영 링크(/admin/live/tournament-1/operations, 스태프 면은 /tournament-ops/tournaments/tournament-1/operations)가 있고 ⋯ 안에는 스태프 배정만 있다')`, `it('경기가 없으면 현장 운영이 머리에서 빠지고 ⋯ 메뉴 안에 있다(양방향)')`, `it('스태프 배정 조회가 403 이면 현장 운영 항목이 비활성이고 사유 글자가 보인다')`(`useV1TournamentStaffAssignments` mock).
  - 탭: `it('탭은 개요·신청·대진·공지·대회 정보 + 더보기이고 링크는 대회 경로를 가리킨다')`, `it('진행 중은 시상·리뷰 관리·통계가 탭이고 대회 정보는 더보기에 있다')`, `it('스태프 면 더보기에는 팝업·징계 현황이 없고, 플랫폼 어드민 더보기에는 팝업(전역 팝업 링크)·징계 현황이 있다')`, `it('공개 샘플(navigation)은 징계가 없고 팝업이 샘플 경로 슬러그다')`.
  - 권한: `it('조회 전용 관리자는 주 버튼·상태 바꾸기·대회 취소가 없고 공개 스위치는 비활성이다')`.
  - 공개: `it('공개 스위치를 누르면 isPublic=false 로 저장하고 성공·실패가 토스트로 나온다')`(실패는 `Object.assign(new Error('x'), { response: { data: { message: '공개 상태를 저장하지 못했어요.' } } })`).
  - 사유 창: 기존 시험 이식 — `it.each(['draft','open','closed','in_progress'])` 취소(칩 메뉴 `대회 취소하기` → `alertdialog`, 공백 사유 막힘·trim 전송·실패 시 입력 보존), completed→진행 중·cancelled→초안 되돌리기, `canRevertStart` 접수 마감 복귀, 조회 전용엔 복귀 항목 없음. `it('메뉴 항목을 고르면 메뉴가 닫힌 뒤 사유 창이 열린다')`(폰·데스크톱 둘 다 `menu`/`대회 상태 dialog` 가 사라져 있음).
  - Review Focus 2: `it('접수 시작을 확인한 뒤 서버가 거절하면 서버 메시지를 토스트로 보이고 상태 표시는 그대로다')` — `statusMutate.mock.calls[0][1].onError(apiError)` 후 토스트 문구.
  - `it('operationCounts 가 없어도 탭이 깨지지 않는다')`.
- [ ] **Step 2** 실패 확인 `./node_modules/.bin/vitest run "src/app/admin/tournaments/[id]/tournament-admin-shell.test.tsx"`.
- [ ] **Step 3: 구현.** 훅(`useV1UpdateTournamentVisibility(id)`·`useTournamentOpsAccess`)은 `isPending` 조기 반환 **위**에서 부른다. `requiredLabels = requiredSetupLabels(buildTournamentSetupItems(tournament, new Date()))`. `onStatusAction` — `cancel` → `setCancelOpen(true)`, `revert` → `setRevertOpen(true)`, 그 밖은 `statusConfirmOptions` 로 `confirmStatusChange` 후 기존 mutate(성공·실패 토스트 문구 유지). 주 버튼 `emphasis` = `draft && requiredLabels.length > 0 ? 'secondary' : 'primary'`. `liveOps` 는 `counts?.fixtures > 0` 일 때만 `{ href: `${base}/operations`, reasonLabel }`; 아니면 `moreActions` 에 `현장 운영`(`reasonLabel` 있으면 `disabled`+`disabledReason`)을 넣고, 항상 `스태프 배정`(`${base}/staff`)을 넣는다. 머리 meta = `[venue ?? '장소 미정', scheduledAt ? formatDateRange(...) : '일정 미정', `${teamCount}팀`].join(' · ')`. 본문은 `<TournamentDetailHeader/>` → `<AdminTabNav ariaLabel="대회 관리 섹션" …/>` → `<div className="mt-6 min-w-0">{children}</div>`(세로 내비 열 삭제). `aria-label` 은 기존 `대회 관리 섹션` 을 유지한다. 사유 창 2종·토스트는 그대로.
- [ ] **Step 4: 영향 시험 갱신.** `tournament-detail-campaign-tab.test.tsx`(링크 조회 `신청 관리`→`신청`, `대진 관리`→`대진`, `캠페인`·`통계` 는 `더보기` 를 먼저 연 뒤 조회; 마지막 `queryByRole('tab')` null 은 유지), `components/tournament-ops-demo/tournament-ops-demo.test.tsx`(`대회 관리 섹션` nav 의 탭 링크 5개 + 더보기를 연 항목 6개 = 11 곳 전부 `/tournament-ops-demo/…`, `신청 4`), `components/tournaments/tournament-director-management.test.tsx`·`tournament-roster-parent-lifecycle.test.tsx` 는 실행해 깨진 질의만 고친다.
- [ ] **Step 5: 통과 확인.** `./node_modules/.bin/vitest run "src/app/admin/tournaments/[id]" src/components/tournament-ops-demo src/components/tournaments/tournament-director-management.test.tsx "src/app/admin/league-matches/[leagueId]/league-admin-shell.test.tsx" src/components/admin` → 전부 PASS(리그 시험은 수정 없이). **Step 6** Commit `feat(web): 대회 상세 셸을 한 줄 머리·가로 탭·상태 칩 메뉴로 바꾼다`.

---

### Task 8: 개요 화면

**Files:** Modify `app/admin/tournaments/[id]/overview-section.tsx` · Test `overview-section.test.tsx`

**Interfaces — Consumes:** Task 2(`buildTournamentSetupItems`·`TournamentSetupItem`), L0 `INFO_NEED_TIER_LABEL`(`./info-sections`), `AdminKpiCard`, `tournamentVisibilityHiddenReason`; `useSearchParams`·`usePathname`·`useRouter`(`next/navigation`).

**화면 계약:** ① 방금 만든 초안 안내 — 주소에 `?created=1` 이 있으면(L2 가 빠른 만들기 뒤 `/admin/tournaments/:id/overview?created=1` 로 보낸다) 맨 위에 `role="status"` 안내 `초안을 만들었어요. 접수를 시작하기 전까지 참가자에게 보이지 않아요.` 를 한 번 보인다. 처음 렌더에서 `useState(() => searchParams.get('created') === '1')` 로 잡아 두고, `useEffect` 에서 `created` 만 뺀 나머지 쿼리로 `router.replace(url, { scroll: false })`(히스토리 항목을 쌓지 않는다). 안내는 상태로 남아 같은 화면에 있는 동안 보이고 새로 고침·다시 들어오면 없다. 파라미터가 없으면 초안이어도 안내가 없다(상시 초안 안내는 만들지 않는다 — 상태 칩이 말한다). 훅은 `isPending` 조기 반환보다 위에서 부른다. ② 「대회 진행 상태」 밴드 — `AdminStatusPill` 은 빼고(칩이 맡는다) 요약 줄(`milestone.headline`, 마감 초과면 기존대로 주황 배경 + `확인 필요`)과 사실 3칸 `경기 일정`·`신청 마감`·`명단 제출 마감`(값 없으면 `아직 없어요`, 흐린 글자). ③ KPI 3(`신청 팀`·`경기`·`공지`, 기존 링크·`ariaLabel` 유지, 보조 줄 `정원 {teamCount}팀` / `대진표 공개`·`대진표 아직 비공개`(경기 0 이면 `아직 없어요`) / `아직 없어요`(0 건)) — `draft` 이고 세 건수가 모두 0 이면 줄 자체를 그리지 않는다. ④ 「채워야 할 설정」 `region`: 머리 `채워야 할 설정 {전체 항목 수}건`(초안이면 아래 한 줄 `접수를 시작하기 전에 확인해 주세요.`), 행마다 `label` + 단계 배지(글자는 `INFO_NEED_TIER_LABEL[tier]` — `필요`=`tm-badge tm-badge-orange`, 나머지 `tm-badge tm-badge-grey`) + `detail` + 오른쪽 이동: **「필요」 첫 항목 하나만** 주 버튼 모양 링크(`actionLabel`, `tm-btn tm-btn-md tm-btn-primary`), 나머지는 `{도착 탭 이름} →` 글자 링크(44px). 이동 주소는 `item.href`(Task 2 가 `basePath` 를 넣어 만든다). 항목이 없으면 기존 `비어 있는 설정이 없어요.` ⑤ 「참가자 화면」 카드(`region`): 배지(`공개 중`/`비공개`/취소된 대회 `노출 안 됨` — 아이콘+글자), 한 줄 설명(공개 대회 목록과 검색, 홈 화면에 보여요. / 일반 사용자에게 숨겨져요. / 숨김 사유), 기존 `참가자에게 보이는 화면 열기` 링크. 넓은 화면(`lg`)에서 ④⑤ 는 `grid lg:grid-cols-[minmax(0,1fr)_340px]`, 폰은 세로.

- [ ] **Step 1: 실패하는 시험**(기존 `renderWith` 유지, 기본 픽스처에 `venue`·`minPlayers: 6`·`maxPlayers: 10` 추가): `it('필요 항목은 해당 섹션 시트 딥링크로 보낸다')` — 장소 없음 → `장소 정하기` 링크 `href` `/admin/tournaments/tournament-1/info?edit=schedule`, 정산 계좌 → `info?edit=entry`, 경기 0 → `/bracket`, 공지 0 → `/announcements`; `it('주 버튼은 필요 첫 항목 하나뿐이다')`(필요 2건일 때 `tm-btn-primary` 링크 1개); `it('초안은 기본값 확인 항목과 안내 한 줄을 보이고 접수 중에는 기본값 확인이 없다')`(배지 `기본값 확인`·`필요`·`선택` 글자); `it('머리 건수는 모든 단계의 항목 수다')`; `it('다 채워졌으면 확인 메시지를 보인다')`; `it('초안 + 모든 건수 0 이면 KPI 줄이 없고, 공지가 1건이라도 있으면 보인다')`; `it('규모 숫자는 해당 탭 링크다')`(기존 이식) + 보조 줄 문구; `it('상태 알약은 밴드에 중복해서 그리지 않는다')`(`queryByText('접수 중')` null); `it('명단 제출 마감이 없으면 아직 없어요로 보인다')`; `it('마감이 지났는데 접수 중이면 확인 필요')`(기존 이식); `it('참가자 화면 카드는 공개 중·비공개·취소 사유를 글자로 말하고 참가자 화면 링크를 가진다')`; `it('created=1 이면 초안 안내를 보이고 쿼리에서 created 만 뺀 주소로 replace 한다')`(`useSearchParams` 를 `new URLSearchParams('created=1&x=2')` 로 mock → `router.replace` 가 `/admin/tournaments/tournament-1/overview?x=2` + `{ scroll: false }` 로 1회, 안내는 계속 보임); `it('created 가 없으면 초안이어도 안내가 없고 replace 도 부르지 않는다')`; `it('여러 단계 초안의 단계 구성 항목은 대진 탭 링크다')`. (`next/navigation` 은 `useRouter`·`usePathname`·`useSearchParams` 셋 다 mock 한다.)
- [ ] **Step 2** 실패 확인 `vitest run "…/overview-section.test.tsx"`. **Step 3** 구현. **Step 4** PASS + `components/tournament-ops-demo` 시험 PASS(개요를 샘플 경로로도 렌더). **Step 5** Commit `feat(web): 대회 개요를 요약·KPI·3단계 설정·참가자 화면 카드로 다시 짠다`. (`tournament-ops-demo` 시험은 `next/navigation` mock 에 이미 `useSearchParams`·`useRouter.replace` 가 있다.)

---

### Task 9: 검사 · changeset · PR · (머지 뒤) alpha 측정

**Files:** Create `.changeset/admin-ux-l1-shell.md`

- [ ] **Step 1: 정적 게이트.** `apps/v1_web`: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` → 0 오류 / `node scripts/v1-pattern-check.mjs` → 통과 / 용어 점검 `git diff origin/dev -U0 -- apps/v1_web/src | grep -nE "^\+.*(필드|경기장|어웨이|접수 관리|대회 디렉터)"` → 새 줄 0 / R-K3 정적 점검 `git diff origin/dev -U0 -- apps/v1_web/src | grep -nE "^\+.*(border-l|border-left|inset [0-9]+px 0|before:)"` → 새 줄 0.
- [ ] **Step 2: 영향 시험 한 번에.** Task 7 Step 5 의 명령 + `src/components/admin/competition-visibility-control.test.tsx` → PASS(풀 스위트는 돌리지 않는다).
- [ ] **Step 3: changeset.** `.changeset/admin-ux-l1-shell.md`(`"v1_web": patch`): `대회 상세 화면의 머리를 한 줄로 줄이고 상태 칩에서 진행 단계·공개·취소를 한 곳에서 다루게 했어요. 세로 메뉴는 가로 탭 5개와 「더보기」로 바뀌었고, 개요에는 「채워야 할 설정」이 필요·기본값 확인·선택으로 나뉘어 해당 설정 화면으로 바로 이동해요. 어드민 사이드바의 선택 항목은 왼쪽 색 띠 대신 배경으로 표시해요.`
- [ ] **Step 4: PR.** push 후 `gh pr create --base dev --repo <origin 의 owner/name>`, 제목·본문 한국어(본문에 「갤러리·계산 스타일 측정은 머지 후 alpha 에서 채워요」 사유, 의존 L0 PR 번호, C-5 `?edit=` 는 L3 머지 전에는 대회 정보 탭만 열린다는 점, `?created=1` 은 L2 가 보내는 신호라는 점). `gh pr edit <N> --add-reviewer "@copilot"`, 머지 직전 `gh pr view <N> --json baseRefName` 이 `dev` 인지 확인.
- [ ] **Step 5: (머지·alpha 배포 확인 뒤) R-K3·크기 측정.** `ego-browser` 스킬로 alpha 에 로그인(계정은 저장소 밖 비공개 메모리의 alpha E2E 계정 — 어디에도 적지 않는다)하고 기존 대회 3종(초안/접수 중/진행 중 중 있는 것) 의 `/admin/tournaments/<id>/overview`·`/info` 를 390·768·1440 으로 연다. **상태 변경·확인 창 확정은 하지 않는다**(메뉴만 열고 닫는다). 페이지에서 평가:
  ```js
  const bad = [...document.querySelectorAll('*')].filter((el) => { const s = getComputedStyle(el);
    const l = parseFloat(s.borderLeftWidth), r = parseFloat(s.borderRightWidth);
    return (s.borderLeftStyle !== 'none' && l >= 2 && l > r && s.borderLeftColor !== 'rgba(0, 0, 0, 0)') || /inset\s+-?\d+px\s+0px\s+0px/.test(s.boxShadow); });
  ```
  기대 `bad.length === 0`(사이드바 선택 항목 포함); `nav[aria-label="대회 관리 섹션"]` 의 모든 `a,button` 크기 ≥ 44×44; 390 에서 탭 줄 아래(`getBoundingClientRect().bottom`)가 **≤ 280px**(spec 목표 ≈260); 탭 줄이 스크롤 뒤에도 상단 바 아래에 붙는지(스크롤 후 `top ≈ 52`)와 `진행 중` 대회에서 활성 탭이 화면 안인지. 수치·스크린샷을 `docs/ops/pr-review-visual-workflow.md` 절차대로 PR 에 3폭 갤러리 코멘트로 게시하고, 끝나면 `await task.finish({ keep: [] })` 로 ego 작업 공간을 닫는다.

## Self-Review

- **Spec coverage:** 머리 한 줄·칩 메뉴(진행 막대·상태 바꾸기·공개 스위치·취소)→T3·T6; 상태당 주 버튼 1개·전 전환 확인 창(접수 시작 포함)→T3·T7; 탭 5+더보기·진행 중 재배치·고른 탭 스크롤·44px→T4; 공개 카드·콘솔 칩 제거→T5·T7; 「현장 운영」 M1-2·M1-1→T7; 개요 요약·KPI·채워야 할 설정(Q7 3단계, C-5 딥링크)·참가자 화면·`?created=1` 안내→T2·T8; L8 사이드바→T1; staffSurface·샘플→T4·T7; 측정 R-K3·≤280px→T9.
- **Type consistency:** `StatusAction`(T3)을 T6 `TournamentStatusMenuProps.onStatusAction`·T7 이 같은 이름으로 쓴다. `TournamentSetupItem`·`requiredSetupLabels`(T2)는 T7(확인 창)·T8(개요)이 쓴다. `useTournamentOpsAccess`·`tournamentVisibilityAction`(T5)은 T7·T6 이 쓴다.
- **Proportion:** 새 파일 5(모델 3·컴포넌트 3 중 모델은 판정만), 본문 코드는 표·시험이 정하지 않는 것만 적었다.
- **plan decision:** ① `AdminSectionNav`·`layout.tsx` 는 수정하지 않고 새 `AdminTabNav` 로 대회 셸만 바꾼다(리그 허브 영향 0; Q8 은 용어·공용 판정에 한정해 읽음 — 리그도 탭으로 바꿀지는 head 확인). ② C-1 확장(`header`·`checked`)은 L0 계획에 있음. ③ 칩 이름 `접수 마감`(기존 `TOURNAMENT_STATUS_LABEL.closed` 는 `마감` 그대로 — 통일은 후속). ④ 기본값 확인 항목은 초안에서만, 대진 항목은 「선택」, 신청 마감·대회 시작 누락도 「필요」로 유지(spec 3단계 표에 없음). ⑤ KPI 의 `확정 N팀`·요약의 `정원이 모두 확정됐어요` 는 목록 API 가 필요해 뺐다(L4 영역). ⑥ 취소·되돌리기는 `useConfirm` 이 아닌 기존 사유 창(`GateConfirmModal`) 유지. ⑦ 폰 탭 줄 고정(M3-1)은 head 지시대로 셸 전체 탭에 적용(대회 정보 포함) — `sticky top-[52px]` 가 `AdminShell` 스크롤 조상에서 실제로 붙는지는 alpha 측정(Task 9)으로 확인하고 안 붙으면 조상 `overflow` 를 찾아 고친다. ⑧ 방금 만든 초안 안내는 `?created=1` 일 때 한 번만(상시 초안 안내는 두지 않는다). ⑩ 설정 항목의 판정·문구·단계는 L0 C-5 가 정하고(`정산 계좌` 이름 포함) 이 레인은 대진·공지 두 항목과 `actionLabel` 만 덧붙인다. ⑨ `eyebrow`(`플랫폼 · 대회`·`담당 대회 관리`)는 머리에서 뺐다(목업에 없음).
- **needs head:** 리그 어드민 탭 모양을 같이 바꿀지(Q8 해석 — 이 계획은 대회 셸만 바꾼다).

## Head 조율 결정 (2026-11-27, 실행자는 이 절을 우선한다)
- **Q8 = 리그 어드민도 같이:** 대회 셸 다음 작업으로 정규 리그 어드민 상세(`app/admin/league-matches/[leagueId]/` 의 `AdminSectionNav` 사용처)도 새 `AdminTabNav` 로 바꾼다 — **탭 모양만**(자주 쓰는 탭 + 더보기, 고른 탭 화면 안으로, 폰 고정, 44px). 리그 머리 재설계는 이번 범위가 아니다(목업 없음). 리그 탭 목록·순서는 지금 그대로 두되 5개를 넘으면 뒤쪽을 더보기로. 시험: 리그 상세에서 각 탭이 여전히 열린다(대조군 2개 이상). `AdminSectionNav` 를 쓰는 곳이 0 이 되면 그 파일과 시험을 지운다(기술부채 0).
- C-1 에 `header`·`checked` 확장은 승인(L0 Task 1). C-5 `basePath`·`InfoNeedKey` 승인.
- 머지 순서: L0 → (L1, L3, L4, L5, L6, L7 병렬) → L2(L3 뒤). L1 이 먼저 머지되면 L3·L4·L5 는 머리를 셸에 맡긴다.
