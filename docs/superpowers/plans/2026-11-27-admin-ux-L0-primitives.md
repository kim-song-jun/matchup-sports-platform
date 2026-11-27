# 어드민 공용 부품 L0 (ActionMenu · SideSheet · 정보 섹션 계약 · 이름 표) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 대회 개편의 모든 레인이 기대는 공용 계약을 먼저 머지한다 — `ActionMenu`(C-1), `SideSheet`(C-2), 대회 정보 섹션 키·딥링크·「채워야 할 설정」 판정(C-5 `info-sections.ts`), 대회 형식 이름 표(C-6), 경기 시간 단계 helper 이동. 화면 배치는 바꾸지 않는다 — 보이는 변화는 경기 시간 입력칸 이름 하나(정규 구간 3개 이상일 때 「n피리어드」 → 「n부」, 용어표)뿐이다.

**Architecture:** `ActionMenu` 는 768px 이상에서 포털로 띄운 `role="menu"` 팝오버, 미만에서는 기존 `ActionSheet` 를 쓴다. `SideSheet` 는 `useModalA11y` 위에 얹고 `dirty` 일 때 모든 닫기 경로를 `useConfirm` 으로 가로챈다. C-5·C-6·helper 이동은 React 없는 순수 모듈(`lib/`·`[id]/info-sections.ts`)이다.

**Tech Stack:** React 19, Next.js 16, Tailwind v4 토큰, Vitest + Testing Library(jsdom). 새 의존성 없음.

**Spec:** `.github/tasks/20261140-admin-tournament-ux-renovation.md` — 「레인 사이 계약」 C-1·C-2·C-3(→ C-5 로 소유 이동), 「화면 공통 규칙」 R-K3, 2차 결정 M3-3, Q7. head 추가 지시(C-1 `subtitle`, C-2 닫기 문구 export, C-5, C-6, 경기 시간 helper 이동, `InfoNeed.href`)를 이 계획이 담는다.

## Global Constraints

- 한쪽 색 띠 금지(R-K3): `border-left`·`border-l-N` 색 테두리, `inset Npx 0 0` 그림자, `before:` 띠 없음. 메뉴 묶음 사이는 1px 회색 선(`border-t border-[var(--border)]`), 위험 항목은 빨간 글자(`--red700`)만.
- 토큰만(하드코딩 색·px 폰트 금지): `var(--card-surface)`·`--border`·`--surface-soft`·`--text-strong`·`--text-muted`·`--red700`, 그림자 `var(--shadow-dropdown)`, 층 `var(--z-sheet)`(팝오버)·`var(--z-modal)`(시트), 글자 `text-[length:var(--font-size-body-sm)]` 류.
- 터치 타겟 44px 이상(메뉴 행 `min-h-[44px]`, 닫기 `h-11 w-11`), 아이콘 버튼 `aria-label`, 장식 `aria-hidden="true"`, 포커스 링 `focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2`.
- `React.forwardRef` 금지. `transition-all` 금지. 모달 접근성은 `useModalA11y`·`useTopmostEscape`·`useOverlayHistory` 를 쓰고 자체 focus-trap 을 새로 만들지 않는다(팝오버의 화살표 키 이동만 예외).
- UI 문구는 해요체, 공통 용어(장소·구장·신청 …). 새 주석은 코드가 말하지 못하는 제약만, 한국어, 3줄 이하.
- 테스트는 실제 동작만: 보이는 텍스트·role·호출 단언. 브라우저 API(`matchMedia`)만 stub 허용. 이동만 하는 helper 는 동작 변경 0 — 기존 호출부 시험을 고치지 않고 통과시킨다.

## Review Focus

1. 팝업이 `overflow-x-auto` 탭 줄·표 래퍼 안에서 잘리면 안 된다(`document.body` 포털 + fixed 위치). → Task 3.
2. 항목을 고르면 메뉴가 **먼저** 닫히고 그 뒤 `useConfirm` 창이 떠야 한다. 메뉴와 확인 창이 함께 보이거나 포커스가 `body` 로 떨어지면 안 된다. → Task 2·3.
3. 비활성 항목은 화살표 키가 건너뛰고, 눌러도 아무 일 없고, 이유가 보인다. → Task 3.
4. 바꾼 값이 있는 `SideSheet` 를 뒤로가기로 닫으려 하면 한 번만 묻고, 「계속 고치기」면 시트가 남고 **다음 뒤로가기도 다시 막아야** 한다. → Task 4.
5. `tournamentInfoNeeds` 가 끝난 대회·오래된 응답(`stagePlan`·`venue` 없음)에서 오지적하지 않고, 스태프 면·샘플처럼 `/admin` 이 아닌 기본 경로에서도 링크가 맞아야 한다(`basePath`). → Task 5.

## File Structure

| 파일 | 역할 |
|---|---|
| `apps/v1_web/src/components/v1-ui/action-sheet.tsx` (수정) | `header`·`checked` 추가, `ActionLabel` export |
| `apps/v1_web/src/components/v1-ui/action-menu.tsx` · `action-menu-popover.tsx` (신규) | 공개 `ActionMenu` / 데스크톱 팝오버 |
| `apps/v1_web/src/components/v1-ui/side-sheet.tsx` (신규) | 공개 `SideSheet` + `SIDE_SHEET_DISCARD_CONFIRM` |
| `apps/v1_web/src/app/admin/tournaments/[id]/info-sections.ts` (신규) | C-5 섹션 키·딥링크·설정 판정 |
| `apps/v1_web/src/lib/tournament-format-labels.ts` (신규) | C-6 형식 이름 표 |
| `apps/v1_web/src/lib/tournament-period-phases.ts` (신규) | 경기 시간 단계 helper 5개(이동) |
| `apps/v1_web/src/test/match-media.ts` (신규) | 폭을 가진 `matchMedia` stub — 이후 레인 시험도 쓴다 |
| 시험 | `action-sheet`·`action-menu`·`side-sheet` `.test.tsx`, `info-sections.test.ts`, `tournament-format-labels.test.ts`, `tournament-period-phases.test.ts` |

## 계약 확장 (기존 호출부·소비처 코드는 그대로 컴파일된다 — 전부 선택 필드)

- C-1 `ActionMenuProps.header?: ReactNode`, `ActionSheetProps.header?: ReactNode` — 제목 아래·항목 위 읽기 전용 영역(L1 상태 칩의 진행 막대).
- C-1 `ActionMenuProps.subtitle?: string` — 폰은 `ActionSheet` 의 `subtitle` 로 넘기고, 데스크톱은 팝오버 맨 위에 `label`(굵게) + 그 아래 `subtitle` 두 줄 머리를 그린다(없으면 머리 없음, `aria-label` 만). 팝오버 `aria-describedby` 가 `subtitle` 을 가리킨다. `groupLabel` 은 `ActionSheet` 규칙 그대로(앞 항목과 다르면 작은 제목) — 별도 구분선 API 는 없다.
- C-1 `ActionSheetAction`(onSelect 변형)`.checked?: boolean` — 있으면 행 오른쪽에 `.tm-toggle`(`.tm-toggle-on`); 팝오버 `role="menuitemcheckbox"`, 시트 `role="switch"`, 둘 다 `aria-checked`(L1 공개 스위치).
- C-2 `export const SIDE_SHEET_DISCARD_CONFIRM: ConfirmOptions`(L3 의 자체 「취소」 버튼이 재사용).
- C-5 `info-sections.ts` — C-3 의 소유가 L3 에서 여기로 옮겨졌다. C-6·helper 이동은 Task 6.

---

### Task 1: ActionSheet 에 `header`·`checked` 더하기 (+ worktree 준비)

**Files:** Modify `apps/v1_web/src/components/v1-ui/action-sheet.tsx` · Test `action-sheet.test.tsx`

**Interfaces — Produces:** `ActionSheetProps.header?: ReactNode`; `ActionSheetAction`(onSelect 변형)`.checked?: boolean`(다른 두 변형은 `checked?: undefined`); `export function ActionLabel({ action, children }: { action: ActionSheetAction; children: ReactNode })` — 이제 export, `checked !== undefined` 면 맨 끝에 `<span aria-hidden="true" className="tm-toggle ml-auto [tm-toggle-on]">`.

- [ ] **Step 1: 작업 공간.** `git fetch origin dev` 후 `git worktree add .claude/worktrees/admin-ux-l0 -b feat/admin-ux-l0-primitives origin/dev`. 새 worktree 의 루트와 `apps/v1_web` 에 메인 트리 `node_modules` 를 심링크한다(`ln -s ~/Dev/projects/matchup-sports-platform/node_modules node_modules`, `apps/v1_web/node_modules` 도 같게). 이후 명령은 `apps/v1_web` 에서 `./node_modules/.bin/…`(pnpm 은 PATH 에 없다).
- [ ] **Step 2: 실패하는 시험**(`action-sheet.test.tsx` 의 기존 `setup`):
  - `it('checked 항목은 switch 로 그려지고 켜짐 여부를 aria-checked 와 .tm-toggle-on 으로 말한다')` — `checked:true`/`false` 두 항목. `getByRole('switch', { name: /참가자에게 공개/ })` 의 `aria-checked` 가 `'true'`, 다른 하나 `'false'`; `.tm-toggle-on` 은 켜진 쪽 안에만. 누르면 `onSelect` 1회.
  - `it('checked 가 없는 항목은 switch 가 아니라 평범한 button 이다')`.
  - `it('비활성 checked 항목은 눌러도 동작하지 않고 이유를 보인다')` — `disabledReason:'권한이 없어요.'` 가 보이고 `onSelect` 0회.
  - `it('header 는 제목 아래·첫 항목 위에 그려진다')` — `compareDocumentPosition` 으로 순서 단언.
- [ ] **Step 3: 실패 확인** `./node_modules/.bin/vitest run src/components/v1-ui/action-sheet.test.tsx` → 새 4건 FAIL.
- [ ] **Step 4: 구현.** 타입은 Interfaces 대로. `onSelect` 행 `<button>` 에 `checked !== undefined` 일 때만 `role="switch" aria-checked={checked}`. `header` 는 `subtitle` 뒤·`<ul>` 앞에 렌더. 기존 동작·클래스는 건드리지 않는다.
- [ ] **Step 5: 통과 확인** 같은 명령 → 기존 시험 포함 PASS. **Step 6: Commit** `git add apps/v1_web/src/components/v1-ui/action-sheet.tsx apps/v1_web/src/components/v1-ui/action-sheet.test.tsx && git commit -m "feat(web): ActionSheet 에 header·checked 항목을 더한다"`

---

### Task 2: ActionMenu — 공통 계약 + 폰 시트

**Files:** Create `apps/v1_web/src/test/match-media.ts`, `components/v1-ui/action-menu.tsx` · Test `action-menu.test.tsx`

**Interfaces — Consumes:** Task 1 `ActionSheet`·`ActionSheetAction`; `useMediaQuery(query: string, serverFallback?: boolean): boolean`(`@/hooks/use-media-query`). **Produces:**
```ts
export const ACTION_MENU_DESKTOP_QUERY = '(min-width: 768px)';
export interface ActionMenuTriggerProps { readonly open: boolean; readonly onToggle: () => void; readonly 'aria-expanded': boolean; readonly 'aria-haspopup': 'menu' }
export interface ActionMenuProps { readonly label: string; readonly actions: readonly ActionSheetAction[]; readonly trigger: (props: ActionMenuTriggerProps) => ReactNode; readonly align?: 'start' | 'end'; readonly header?: ReactNode; readonly subtitle?: string }
export function ActionMenu(props: ActionMenuProps): JSX.Element
// 시험 도우미 — test/match-media.ts
export function installMatchMedia(initialWidth: number): { setWidth(width: number): void; restore(): void }
```
`installMatchMedia` 는 `window.matchMedia` 를 `(min-width: Npx)` 질의만 판정하는 stub 으로 바꾸고 `setWidth` 가 `change` 리스너에게 알린다(호출은 `act` 로 감싼다); `restore()` 가 `vitest.setup.ts` 의 기본 stub 으로 되돌린다.

- [ ] **Step 1: `test/match-media.ts` 작성.**
- [ ] **Step 2: 실패하는 시험**(폰 `installMatchMedia(390)`, `next/navigation` 은 `action-sheet.test.tsx` 처럼 `usePathname` mock; 트리거 `({onToggle, ...aria}) => <button {...aria} onClick={onToggle}>상태</button>`):
  - `it('트리거는 aria-expanded 로 열림을 말하고 누를 때마다 토글한다')`(처음 `"false"`·`aria-haspopup="menu"` → `"true"` → `"false"`).
  - `it('폰에서는 label 이 제목인 dialog(기존 ActionSheet)로 열리고 같은 항목을 가진다')`.
  - `it('subtitle 은 시트 제목 아래에 보인다')`; `it('header 가 시트 안에 보인다')`.
  - `it('항목을 고르면 시트가 닫히고 onSelect 가 한 번 불린다')`.
  - `it('고른 동작이 useConfirm 창을 띄워도 시트와 확인 창이 함께 보이지 않는다')` — 하네스가 `onSelect` 에서 `confirm({title:'접수를 마감할까요?',…})`. 클릭 뒤 `await findByRole('dialog', {name:'접수를 마감할까요?'})` 이고 `queryByRole('dialog', {name:'대회 상태'})` null.
  - `it('href·externalHref·destructive 항목은 ActionSheet 규칙 그대로 그린다')`.
  - `it('열린 채 폭이 768 이상이 되면 시트를 닫는다')` — `setWidth(1024)` 뒤 `dialog` 없음(Task 3 에서 `menu` 도 없음을 같이 단언).
  - `it('항목이 하나도 없으면 토글해도 아무것도 열리지 않는다')`.
- [ ] **Step 3: 실패 확인** `./node_modules/.bin/vitest run src/components/v1-ui/action-menu.test.tsx` → FAIL(모듈 없음).
- [ ] **Step 4: 구현.** 상태 `open`. `trigger({ open, onToggle, 'aria-expanded': open, 'aria-haspopup': 'menu' })` 를 `<span ref={anchorRef} className="inline-flex">` 로 감싼다(팝오버 위치·포커스 복원 기준). `onToggle` 은 `actions.length === 0` 이면 no-op. `wrapActions(actions, close)` — `onSelect` 항목은 `() => { close(); action.onSelect(); }`(닫은 뒤 호출 → 뒤이은 `useConfirm` 창과 겹치지 않는다). `useMediaQuery(ACTION_MENU_DESKTOP_QUERY)` 가 바뀌면 `open=false`. 폰이면 `<ActionSheet open title={label} subtitle={subtitle} header={header} actions={wrapped} onClose={close}/>`; 데스크톱 분기는 Task 3(이 태스크에서는 `null`).
- [ ] **Step 5: 통과 확인. Step 6: Commit** `feat(web): ActionMenu 공용 계약과 폰 시트 분기를 더한다`(`git add` 는 위 세 파일).

---

### Task 3: ActionMenu — 데스크톱 팝오버

**Files:** Create `components/v1-ui/action-menu-popover.tsx` · Modify `action-menu.tsx` · Test `action-menu.test.tsx`

**Interfaces — Consumes:** Task 1 `ActionLabel`; `useTopmostEscape({ open, onEscape })`(`./use-topmost-escape`); `FOCUSABLE_SELECTOR`(`./use-modal-a11y`). **Produces:** `ActionMenuPopover({ label, subtitle, actions, header, align, anchorRef, onClose }): JSX.Element` — `ActionMenu` 전용, `wrapActions` 를 거친 `actions` 를 받는다.

- [ ] **Step 1: 실패하는 시험**(`installMatchMedia(1024)`; 새 `describe('ActionMenu 데스크톱')`):
  - `it('트리거 아래 role=menu 로 열리고 label 이 이름이며 항목은 menuitem 이다')`.
  - `it('팝오버는 document.body 직속 포털이라 overflow 조상 안에 갇히지 않는다')` — `overflowX:auto` 래퍼 안에 렌더, `container.contains(menu)` false.
  - `it('열면 첫 활성 항목에 포커스가 가고 ArrowDown/ArrowUp/Home/End 가 비활성 항목을 건너뛰며 돈다')`(가운데 항목 `disabled`, 마지막에서 ArrowDown → 첫 항목).
  - `it('ESC 는 메뉴만 닫고 포커스를 트리거로 돌린다')`, `it('Tab 은 메뉴를 닫고 포커스가 트리거에 있다')`.
  - `it('바깥을 누르면 닫히고 트리거를 다시 누르면 토글로 닫힌다(다시 열리지 않는다)')`.
  - `it('다른 곳을 스크롤하거나 창 크기가 바뀌면 닫히고 메뉴 안 스크롤은 닫지 않는다')`.
  - `it('항목을 고르면 메뉴가 닫히고 포커스가 트리거로 돌아간 뒤 onSelect 가 불린다')` + `it('고른 동작이 useConfirm 창을 띄워도 메뉴와 확인 창이 함께 보이지 않는다')`(확인 창을 닫은 뒤 포커스가 트리거).
  - `it('비활성 항목은 눌러도 onSelect 가 불리지 않고 disabledReason 이 보인다')`.
  - `it('groupLabel 이 바뀌는 곳마다 묶음 제목을 한 번만 그린다')`(`getAllByRole('group')` 이름 `['상태 바꾸기','공개']`).
  - `it('checked 항목은 menuitemcheckbox 이고 aria-checked 가 상태를 말한다')`; `it('header 가 항목 위에 보인다')`.
  - `it('subtitle 이 있으면 label 과 함께 머리에 보이고 menu 의 설명이 된다')`(`toHaveAccessibleDescription`), 없으면 머리 글자가 없다.
  - `it('align=end 는 오른쪽 기준, start 는 왼쪽 기준으로 놓는다')`(`menu.style.right`/`left` 설정 여부).
  - `it('href 항목은 menuitem 링크이고 누르면 메뉴가 닫힌다')`.
- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: `ActionMenuPopover` 구현.** `createPortal(…, document.body)`. 위치는 마운트 직후 `useLayoutEffect` 에서 `anchorRef.current.getBoundingClientRect()` 로 한 번: `position:fixed; top: rect.bottom + 8; (align==='end' ? right: innerWidth - rect.right : left: rect.left); maxHeight: max(160, innerHeight - rect.bottom - 16); zIndex: 'var(--z-sheet)'`. 패널 `role="menu" aria-label={label}`, `w-[360px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-2 shadow-[var(--shadow-dropdown)]`. 항목은 `ActionSheet` 행을 줄인 모양(`min-h-[44px] rounded-[10px] px-2.5 py-2 hover:bg-[var(--surface-soft)]`, 테두리 없음) + `ActionLabel`. `onSelect` 항목 `<button role="menuitem">`(checked 면 `menuitemcheckbox`+`aria-checked`, 비활성이면 `disabled`), `href` → `next/link` `role="menuitem"` `onClick={onClose}`, `externalHref` → `<a role="menuitem">`. 모든 항목 `tabIndex={-1}`. 묶음은 `ActionSheet` 와 같은 규칙으로 `<div role="group" aria-label={groupLabel}>` + 보이는 제목 `<p aria-hidden="true">`, 묶음 사이 `border-t border-[var(--border)]`. 열리면 첫 활성 항목 `focus()`. `onKeyDown`: ArrowDown/ArrowUp/Home/End 는 비활성을 건너뛰고(`preventDefault`), Tab 은 포커스를 트리거(`anchorRef.current.querySelector(FOCUSABLE_SELECTOR)`)로 옮기고 `onClose()` 만(기본 Tab 이동은 진행). `useTopmostEscape({ open: true, onEscape })` — 포커스를 트리거로 옮기고 닫는다. 문서 `pointerdown`(capture)은 메뉴·`anchorRef` 밖일 때만 닫고, `scroll`(capture)·`resize` 는 메뉴 안 스크롤이 아니면 닫는다. 항목 선택은 포커스를 트리거로 옮긴 뒤 `onSelect`(이미 닫기 포함).
- [ ] **Step 4: `ActionMenu` 연결**(`desktop && open` → `<ActionMenuPopover/>`, `align` 기본 `'start'`). **Step 5: 통과 확인** `vitest run src/components/v1-ui/action-menu.test.tsx src/components/v1-ui/action-sheet.test.tsx`. **Step 6: Commit** `feat(web): ActionMenu 데스크톱 팝오버(포털·키보드·바깥 클릭)를 더한다`.

---

### Task 4: SideSheet

**Files:** Create `components/v1-ui/side-sheet.tsx` · Test `side-sheet.test.tsx`

**Interfaces — Consumes:** `useModalA11y<HTMLElement, HTMLDivElement>({ open, onClose, closeOnBack, exitMs })`, `useOverlayHistory({ open, onClose })`, `useConfirm()`. **Produces:**
```ts
export interface SideSheetProps { readonly open: boolean; readonly title: string; readonly onClose: () => void; readonly children: ReactNode; readonly footer?: ReactNode; readonly dirty?: boolean }
export function SideSheet(props: SideSheetProps): JSX.Element
export const SIDE_SHEET_DISCARD_CONFIRM: ConfirmOptions // { title: '저장하지 않고 닫을까요?', message: '바꾼 내용이 저장되지 않아요.', confirmLabel: '닫기', cancelLabel: '계속 고치기', tone: 'danger' }
```

- [ ] **Step 1: 실패하는 시험**(뒤로가기 시험은 `use-overlay-history.test.tsx` 의 `beforeEach`/`back()` 설정 복사: `installNavigationHistory`, `window.history.pushState({}, '', '/admin/tournaments/t-1/info')`, `settleHistory`; 확인 창 조회는 `within(dialog)` — ✕ 「닫기」 와 확인 「닫기」 가 같은 이름이다):
  - `it('닫혀 있으면 아무것도 그리지 않고, 열리면 제목이 이름인 modal dialog 와 본문·footer 를 그린다')`.
  - `it('footer 는 스크롤되는 본문 밖에 있다')`(`data-testid="side-sheet-body"` 가 footer 를 포함하지 않음).
  - `it('dirty 가 아니면 ✕·ESC·바깥 클릭이 곧바로 onClose 를 부른다')`.
  - `it('dirty 면 ✕ 가 확인 창을 띄우고, 계속 고치기를 고르면 시트가 남고 onClose 는 불리지 않는다')`.
  - `it('dirty 에서 확인 창의 닫기를 고르면 onClose 가 한 번 불린다')`.
  - `it('dirty 시트의 ESC 는 확인 창만 닫고 시트·onClose 는 그대로다')`.
  - `it('SIDE_SHEET_DISCARD_CONFIRM 은 title·confirmLabel·cancelLabel 이 정해진 문구다')`(소비처가 재사용하는 계약).
  - `it('dirty 가 아닐 때 뒤로가기는 시트를 닫고 페이지는 그대로다')`(`onClose` 1회, `currentPath()` 불변).
  - `it('dirty 일 때 뒤로가기는 확인을 묻고, 계속 고치기면 시트가 남아 다음 뒤로가기도 다시 묻는다')`.
  - `it('열릴 때 포커스가 시트 안으로 가고 닫히면 연 버튼으로 돌아간다')`.
- [ ] **Step 2: 실패 확인.** `./node_modules/.bin/vitest run src/components/v1-ui/side-sheet.test.tsx`.
- [ ] **Step 3: 구현.** 포털(`document.body`, `typeof document === 'undefined'` 가드)로 `fixed inset-0` 덮개(`color-mix(in srgb, var(--static-ink) 45%, transparent)`, `zIndex: 'var(--z-modal)'`, 클릭 시 `requestClose`) + 패널 `role="dialog" aria-modal="true" aria-labelledby`. 레이아웃은 JS 분기 없이 클래스: 컨테이너 `flex items-end justify-center lg:items-stretch lg:justify-end`, 패널 `flex h-[90vh] w-full flex-col rounded-t-2xl bg-[var(--card-surface)] lg:h-full lg:w-[480px] lg:rounded-none lg:rounded-l-2xl`; 폰에서만 위쪽 손잡이 막대(`aria-hidden`, 끌어서 닫기는 만들지 않는다). 머리(제목 `<h2>` + `h-11 w-11` 「닫기」) · 본문(`data-testid="side-sheet-body"`, `flex-1 overflow-y-auto`) · `footer`(있을 때만 아래 고정, `paddingBottom: 'calc(16px + var(--v1-shell-safe-bottom, 0px))'`). 입장 애니메이션 없음, 닫히면 바로 언마운트(`exitMs: 0`).
  닫기: `requestClose = async () => { if (!dirty || await confirm(SIDE_SHEET_DISCARD_CONFIRM)) onClose(); }`(✕·덮개·`useModalA11y` 의 ESC, `closeOnBack: false`). 뒤로가기는 시트 안의 비-DOM 컴포넌트 `SideSheetHistory({ open, onClose })`(`useOverlayHistory` 만 호출, `key={epoch}`)에 맡긴다. 그 `onClose` 는 `closeFromHistory` — dirty 가 아니면 `onClose()`, dirty 면 `confirm` 후 승인 시 `onClose()`, 거절 시 `setEpoch(e => e + 1)`(히스토리 표식이 이미 걷혔으므로 컴포넌트만 다시 마운트해 표식을 새로 쌓는다; `children` 은 `key` 밖이라 입력이 유지된다). `ConfirmModal` 은 패널 옆에 렌더.
- [ ] **Step 4: 통과 확인. Step 5: Commit** `feat(web): 오른쪽 수정 시트 SideSheet 를 더한다`.

---

### Task 5: C-5 대회 정보 섹션 계약 (`info-sections.ts`)

**Files:** Create `apps/v1_web/src/app/admin/tournaments/[id]/info-sections.ts` · Test `info-sections.test.ts`

**Interfaces — Produces** (head 계약 + `basePath`·`InfoNeedKey`·`infoNeedHref` 확장):
```ts
export const TOURNAMENT_INFO_SECTIONS = ['basic', 'schedule', 'entry', 'rules', 'public', 'promo'] as const;
export type TournamentInfoSectionKey = (typeof TOURNAMENT_INFO_SECTIONS)[number];
export function tournamentInfoHref(tournamentId: string, section: TournamentInfoSectionKey, basePath?: string): string; // `${basePath ?? `/admin/tournaments/${id}`}/info?edit=${section}`
export type InfoNeedTier = 'required' | 'review' | 'optional';
export const INFO_NEED_TIER_LABEL: Record<InfoNeedTier, string>; // 필요 · 기본값 확인 · 선택
export type InfoNeedKey = 'venue' | 'roster-deadline' | 'bank-account' | 'registration-deadline' | 'scheduled-at' | 'entry' | 'rules' | 'stage-plan' | 'public-screen';
export interface InfoNeed { readonly key: InfoNeedKey; readonly section: TournamentInfoSectionKey; readonly tier: InfoNeedTier; readonly label: string; readonly detail: string; readonly href?: string /* 있으면 tournamentInfoHref 대신 */ }
export function tournamentInfoNeeds(t: V1Tournament, basePath?: string): InfoNeed[]; // required → review → optional, 같은 단계는 아래 표 순서
export function infoNeedHref(need: InfoNeed, tournamentId: string, basePath?: string): string; // need.href ?? tournamentInfoHref(...)
```
**표(문구 그대로; 기존 개요 체크리스트의 신호를 이어받는다 — 접수 마감·명단 마감·계좌·일정·커버 이미지·상금 판정은 `buildTournamentChecklist` 와 같고 「장소」·참가 조건·경기 규칙·단계 구성만 새 신호):**

| key · tier · 조건 | section | label | detail |
|---|---|---|---|
| venue · required · `!venue?.trim()` | schedule | 장소 | 정하지 않으면 참가자에게 「장소 미정」으로 보여요. |
| roster-deadline · required · `!rosterDeadlineAt` | schedule | 명단 제출 마감 | 마감이 없으면 경기 직전까지 선수단이 바뀔 수 있어요. |
| bank-account · required · `entryFee>0 && !bankAccount?.trim()` | entry | 정산 계좌 | 참가비를 받는데 정산 계좌가 없으면 신청 팀이 입금할 곳을 알 수 없어요. |
| registration-deadline · required · `!registrationDeadlineAt` | schedule | 신청 마감 | 마감이 없으면 신청이 언제까지 열려 있는지 알 수 없어요. |
| scheduled-at · required · `!scheduledAt` | schedule | 대회 시작 | 대회 날짜가 없으면 목록과 상세에 일정이 보이지 않아요. |
| entry · review · draft | entry | 참가 조건 | `종목 기본값이에요. 팀당 선수 {min}~{max}명, 참가비 {무료\|N원}.` (`maxPlayers` null → `{min}명 이상`, N 은 `toLocaleString('ko-KR')`) |
| rules · review · draft | rules | 경기 규칙 | `종목 기본값이에요. 출전 {n}명, {자유 교체\|교체 {k}회 제한\|교체 횟수 제한}.` (없는 조각은 뺀다, 둘 다 없으면 `종목 기본값이에요.`) |
| stage-plan · review · draft 이고 `format==='league_knockouts' && stagePlan` | basic · `href` = `${basePath}/bracket` | 단계 구성 | 예선과 결선 구성을 기본값으로 만들어 뒀어요. 대진 관리에서 확인해 주세요. |
| public-screen · optional · `!coverImageUrl \|\| 상금 정보 없음`(기존 `hasPrizeInfo`: `prizePool>0 \|\| prizeSummary \|\| prizeBreakdown`) | public | 공개 화면 | 둘 다: `커버 이미지와 상금·시상 안내가 비어 있어요.` / 이미지만: `커버 이미지가 없으면 목록과 상세 상단이 비어 보여요.` / 상금만: `상금과 시상 정보는 참가 결정에 큰 영향을 줘요.` |

`completed`·`cancelled` 는 `[]`. review 는 `draft` 에서만. `basePath` 기본값은 `/admin/tournaments/${t.id}`. `promo` 섹션은 판정 신호가 없어 항목이 없다. 대진·공지 같은 다른 탭 항목은 이 모듈에 넣지 않는다(L1 개요가 덧붙인다).

- [ ] **Step 1: 실패하는 시험**(`info-sections.test.ts`; 「아무것도 지적 없음」 픽스처 `tournament()` — `venue:'서울 풋살장'`, 마감 3종, `entryFee:0`, `coverImageUrl`, `prizePool:1000000`, `minPlayers:6`, `maxPlayers:10`, `lineupMaxPlayers:6`, `substitutionMode:'rolling'`):
  - `it('섹션 키는 C-3 값 6개 그대로다')` — `TOURNAMENT_INFO_SECTIONS` 가 `['basic','schedule','entry','rules','public','promo']`.
  - `it('tournamentInfoHref 는 ?edit= 딥링크를 만들고 basePath 가 있으면 그 경로를 쓴다')`(`/admin/tournaments/t-1/info?edit=rules`, `/tournament-management/tournaments/t-1/info?edit=schedule`).
  - `it('다 채워진 접수 중 대회는 항목이 없다')`, `it('끝난 대회(completed·cancelled)는 항목이 없다')`.
  - `it('필요 항목은 장소·명단 제출 마감·유료 정산 계좌·신청 마감·대회 시작 순으로 비어 있을 때만 나온다')` — 필드별로 비운 5건, 순서 단언; `entryFee: 0` 이면 계좌 항목 없음·`20000`+계좌 없음이면 있음(양방향); 공백뿐인 `venue` 도 비어 있는 것으로.
  - `it('기본값 확인은 초안에서만 나오고 접수 중에는 없다')`.
  - `it('참가 조건 detail 은 인원 범위·참가비를 사실대로 말한다')`(`종목 기본값이에요. 팀당 선수 6~10명, 참가비 무료.` / `maxPlayers:null, entryFee:20000` → `…6명 이상, 참가비 20,000원.`), `it('경기 규칙 detail')`(rolling → `…출전 6명, 자유 교체.`, limited+3 → `…교체 3회 제한.`, 모두 null → `종목 기본값이에요.`).
  - `it('여러 단계(league_knockouts + stagePlan) 초안만 단계 구성 항목이 있고 대진 탭으로 보낸다')` — `href` 가 `/admin/tournaments/t-1/bracket`(basePath 지정 시 그 경로), `league_knockouts` 이지만 `stagePlan` 이 없거나 `format:'knockout'` 이면 항목 없음(양방향), 접수 중이면 없음. `infoNeedHref` 가 `href` 있는 항목은 그 값을, 없는 항목은 `tournamentInfoHref` 를 돌려준다.
  - `it('공개 화면은 이미지·상금 중 비어 있는 쪽만 말한다')` 세 갈래.
  - `it('단계 순서는 필요 → 기본값 확인 → 선택이고 key 는 겹치지 않는다')`.
- [ ] **Step 2: 실패 확인** `./node_modules/.bin/vitest run "src/app/admin/tournaments/[id]/info-sections.test.ts"`. **Step 3: 구현**(표·시험이 정한다). **Step 4: 통과 확인.** **Step 5: Commit** `git add "apps/v1_web/src/app/admin/tournaments/[id]/info-sections.ts" "apps/v1_web/src/app/admin/tournaments/[id]/info-sections.test.ts" && git commit -m "feat(web): 대회 정보 섹션 키·딥링크·채워야 할 설정 판정을 한 모듈로 둔다"`

---

### Task 6: C-6 형식 이름 표 + 경기 시간 단계 helper 이동

**Files:** Create `lib/tournament-format-labels.ts`·`.test.ts`, `lib/tournament-period-phases.ts`·`.test.ts` · Modify `app/admin/tournaments/new/tournament-create-model.ts`(아래 5개 삭제), 가져오는 곳 3개: `app/admin/tournaments/new/page.tsx`, `components/admin/period-override-field.tsx`, `app/admin/league-matches/league-create-wizard.tsx`

**기존 형식 이름 조사(이 계획이 확인한 결과):** `lib/admin-labels.ts`·`lib/v1-status-labels.ts` 에는 대회 형식 이름 표가 **없다** → 새 파일을 만든다. 지금 형식 이름을 정하는 곳(L0 는 아무것도 바꾸지 않는다): ① `lib/competition-kind.ts` `competitionFormatLabel`/`competitionFormatSearchLabel` — 공개 화면 단일 소스, 사용처 `app/admin/tournaments/[id]/info-section.tsx`(형식 행)·`app/tournaments/[id]/bracket/bracket-page-client.tsx`·`app/tournaments/[id]/tournament-detail-client.tsx`·`lib/landing/landing-v4-data.ts`·`lib/seo.ts`(공개 문구는 Q8 후속) ② `info-section.tsx` 지역 `TOURNAMENT_FORMAT_LABEL`(L3 가 교체) ③ `new/page.tsx` 인라인 제목(L2 가 교체) ④ `components/v1-ui/competition-discovery-controls.tsx` `FORMAT_LABELS`(공개 필터)·`components/admin/tournaments/mock-seed-panel.tsx`(QA 도구) — 유지.

**Interfaces — Produces:**
```ts
// lib/tournament-format-labels.ts
export const TOURNAMENT_FORMAT_NAMES: Record<V1TournamentFormat, string>;
// group_knockout '조별리그 → 토너먼트' · knockout '토너먼트만' · league '리그전' · league_knockouts '여러 단계(예선 → 결선 여러 개)'
// lib/tournament-period-phases.ts — 이름·시그니처·본문 그대로 이동. 동작 변경은 하나: periodLabels(n≥3) 라벨을 「n피리어드」 → 「n부」(용어표: 피리어드 금지, head 결정)
export const TOURNAMENT_PERIOD_PHASES: ReadonlyArray<{ value: TournamentPeriodPhase; label: string; shortLabel: string }>;
export function tournamentPeriodPhaseLabel(phase: TournamentPeriodPhase): string;
export function tournamentPeriodPhaseShortLabel(phase: TournamentPeriodPhase): string;
export function periodLabels(count: number): string[];
export function switchPeriodCount(periodMinutes: readonly string[], count: 1 | 2): string[];
```
`hasValidPeriodDurations` 는 이미 `lib/tournament-periods.ts` 에 있어 옮기지 않는다(생성 모델·`stage-period-settings`·`tournament-period-settings-editor` 가 import 중). 이동 대상은 위 5개이고 `TournamentPeriodPhase` 타입은 `@/hooks/use-tournament-period-settings` 에 그대로 둔다.

- [ ] **Step 1: 실패하는 시험.** `tournament-format-labels.test.ts`: `it('형식 4종의 이름은 공통 용어표 그대로다')` — 위 4문구 정확히 일치, `Object.keys` 가 4개. `tournament-period-phases.test.ts`: `it('경기 시간 입력칸 이름 — 1개 단판, 2개 전반·후반, 3개 이상은 1부·2부·3부(피리어드 금지)')`; `it('전·후반 ↔ 단판 전환은 합계를 지킨다')`(`['20','20']`→1 → `['40']`, `['41']`→2 → `['21','20']`, 비숫자는 0 으로 셈); `it('단계 이름은 목록용 label 과 문장용 shortLabel 이 다르다')`(`round16`: `16강 · 12팀 결선의 12강` / `16강`, 모르는 값은 그 값 그대로).
- [ ] **Step 2: 실패 확인** `vitest run src/lib/tournament-format-labels.test.ts src/lib/tournament-period-phases.test.ts`. **Step 3: 구현.** 두 `lib` 파일을 만들고, 생성 모델에서 5개와 그 주석을 지우고(이동한 주석은 파일 머리로), 세 importer 의 `import` 경로를 `@/lib/tournament-period-phases` 로 바꾼다(`new/page.tsx` 는 `./tournament-create-model` import 에서 해당 이름만 빼 따로 import).
- [ ] **Step 4: 회귀 확인(동작 변경은 periodLabels n≥3 라벨 하나뿐 — 그 기대값을 쓰던 기존 시험은 새 라벨로 고친다).** `./node_modules/.bin/vitest run src/app/admin/tournaments/new src/components/admin/period-override-field.test.tsx src/components/admin/tournament-period-settings-editor.test.tsx src/app/admin/league-matches/league-create-wizard.test.tsx` — 기존 시험을 고치지 않고 PASS. `tsc` 0 오류.
- [ ] **Step 5: Commit** `git add apps/v1_web/src/lib/tournament-format-labels.ts apps/v1_web/src/lib/tournament-format-labels.test.ts apps/v1_web/src/lib/tournament-period-phases.ts apps/v1_web/src/lib/tournament-period-phases.test.ts apps/v1_web/src/app/admin/tournaments/new apps/v1_web/src/components/admin/period-override-field.tsx apps/v1_web/src/app/admin/league-matches/league-create-wizard.tsx && git commit -m "refactor(web): 경기 시간 단계 helper 를 lib 로 옮기고 대회 형식 이름 표를 더한다"`

---

### Task 6b: 공용 부품 — 성별 4칸 선택, 날짜 칸의 주의 안내 (L2 계획에서 옮김)

L2(만들기)와 L3(대회 정보 시트)가 둘 다 쓰므로 `components/admin/tournaments/` 에 둔다. 기존 `GenderCategoryField`(리그 생성·설정이 씀, 「구분 없음」 없음)는 건드리지 않는다.

**Files:**
- Create: `apps/v1_web/src/components/admin/tournaments/tournament-gender-choice-field.tsx` + `.test.tsx`
- Modify: `apps/v1_web/src/components/admin/tournaments/tournament-datetime-field.tsx` + 같은 폴더에 `tournament-datetime-field.test.tsx`(없으면 생성)

**Interfaces:**
- Produces:
  ```ts
  export type GenderChoice = V1TournamentGenderCategory | 'none';          // 'none' = 구분 없음(서버엔 생략)
  export const GENDER_CHOICE_OPTIONS: ReadonlyArray<readonly [GenderChoice, string]>; // 순서: none 구분 없음, male 남성부, female 여성부, mixed 혼성
  export function TournamentGenderChoiceField(props: {
    value: GenderChoice; onChange: (value: GenderChoice) => void;
    defaultValue: GenderChoice;           // 이 칸에 「기본」 표시
    disabled?: boolean; hint?: ReactNode; children?: ReactNode; // children = 혼성일 때 펼칠 인원 칸(호출부가 그림)
  }): JSX.Element;
  // TournamentDatetimeField: 선택 prop 추가  hintTone?: 'default' | 'warning'
  ```

- [ ] **Step 1: 실패하는 테스트** (성별 칸): ① `radio` 4개가 위 순서로 있고 `defaultValue='none'` 이면 「구분 없음」 칸 안에만 「기본」 글자가 있다(`defaultValue='male'` 로 다시 그리면 「남성부」 칸으로 옮겨간다) ② 칸을 누르면 `onChange` 가 `'male'` 등으로 불리고 `value` 가 가리키는 라디오만 `checked` ③ `disabled` 면 라디오가 전부 disabled ④ `children` 이 그려진다. (날짜 칸): `hintTone='warning'` + `hint` 이면 그 문구가 `role="status"` 로 읽히고, 기본이면 `role` 없는 문단이며, `error` 가 있으면 `role="alert"` 가 우선한다.
- [ ] **Step 2:** 실행 → FAIL.
- [ ] **Step 3: 구현.** 성별 칸은 `GenderCategoryField` 와 같은 sr-only 라디오 + 라벨 칩 구조, 칩 그리드 `grid-cols-2 sm:grid-cols-4`, 칩 높이 44px 이상, 범례 「성별」, 기본 hint 는 호출부가 준다. 날짜 칸은 warning 일 때만 `role="status"` 와 `text-[var(--orange700)]`(글자로 전달, 색만 쓰지 않음).
- [ ] **Step 4:** 위 테스트 + `vitest run src/components/admin/tournaments src/app/admin/tournaments` PASS (날짜 칸을 쓰는 기존 화면 회귀 확인).
- [ ] **Step 5: Commit** `feat(web): 성별 4칸 선택과 날짜 칸 주의 안내 부품을 더한다`

### Task 7: 검사 · changeset · PR

**Files:** Create `.changeset/admin-ux-l0-primitives.md`

- [ ] **Step 1: 타입·패턴.** `apps/v1_web`: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` → 0 오류, `node scripts/v1-pattern-check.mjs` → 통과.
- [ ] **Step 2: 영향 시험.** `./node_modules/.bin/vitest run src/components/v1-ui "src/app/admin/tournaments/[id]/info-sections.test.ts" src/lib/tournament-format-labels.test.ts src/lib/tournament-period-phases.test.ts src/app/admin/tournaments/new "src/app/admin/league-matches"` → 전부 PASS(풀 스위트는 돌리지 않는다).
- [ ] **Step 3: R-K3 정적 점검.** `git diff origin/dev -U0 -- apps/v1_web/src | grep -nE "^\+.*(border-l|border-left|inset [0-9]+px 0|before:)"` → 0. 이 PR 은 어느 화면에도 쓰이지 않으므로 계산 스타일 측정은 소비처 PR(L1·L3)이 alpha 에서 한다고 PR 본문에 적는다.
- [ ] **Step 4: changeset** `.changeset/admin-ux-l0-primitives.md`:
  ```
  ---
  "v1_web": patch
  ---

  어드민에서 쓸 ⋯ 메뉴(ActionMenu)와 오른쪽 수정 시트(SideSheet), 대회 정보 섹션 이동 규칙, 대회 형식 이름 표를 공용 부품으로 추가했어요. 아직 어느 화면에도 쓰이지 않아 보이는 변화는 없어요.
  ```
- [ ] **Step 5: PR.** 커밋 후 `git push -u origin feat/admin-ux-l0-primitives`, `gh pr create --base dev --repo <git remote get-url origin 의 owner/name>` — 제목·본문 한국어, 본문에 「계약 확장」 표·소비처가 쓰는 시그니처·「helper 이동은 동작 변경 0」을 적고 `gh pr edit <N> --add-reviewer "@copilot"`. 머지 전 `gh pr view <N> --json baseRefName` 이 `dev` 인지 확인.

## Self-Review

- **Spec coverage:** C-1(트리거 props·768 분기·화살표/ESC/바깥 클릭/포커스 복원·고르면 먼저 닫힘·`destructive`·`subtitle`) → Task 2·3; C-2(1024 분기·`useModalA11y`·뒤로가기·`dirty` 확인·문구 export) → Task 4; C-5(섹션 키·딥링크·Q7 3단계·`href`·여러 단계 항목) → Task 5; C-6·helper 이동 → Task 6; R-K3·44px·토큰 → Global Constraints·Task 7. `ActionSheetAction` 필드 전부 팝오버에서 처리.
- **Type consistency:** `ActionMenuTriggerProps`·`ActionMenuProps` 는 C-1 과 글자 그대로(+`header?`·`subtitle?`). `ActionMenuPopover` 는 `wrapActions` 를 거친 항목만 받는다. `InfoNeed.section` 은 `TournamentInfoSectionKey`, `href` 는 L1 이 `infoNeedHref` 로만 읽는다.
- **Proportion:** 시험 외 파일은 모듈 6개; 본문은 계약이 정하지 않는 알고리즘(팝오버 위치·`SideSheetHistory` 재마운트)만 서술했다.
- **plan decision:** ① C-1 에 `header`·`checked` 추가(L1 소비처 요구; head 가 거절하면 L1 은 진행 막대를 글자 한 줄, 공개 스위치를 일반 항목으로 대체). ② 팝오버를 포털 + fixed 위치(탭 줄 가로 스크롤 조상에 안 갇히게). ③ `SideSheet` 레이아웃은 `lg:` 클래스만(폭별 모양은 소비처 PR 의 alpha 3폭 갤러리). ④ `test/match-media.ts` 를 L0 가 만든다. ⑤ C-5 확장 — `tournamentInfoHref`·`tournamentInfoNeeds` 에 선택 `basePath`(스태프 면 `/tournament-management/...`·샘플 경로), `key` 를 `InfoNeedKey` 유니온으로, `infoNeedHref` 추가; 「입금 계좌」 대신 spec S3 이름 「정산 계좌」. ⑥ 이동 대상 helper 는 네 개가 아니라 **다섯 개**(`TOURNAMENT_PERIOD_PHASES`·`tournamentPeriodPhaseLabel`·`tournamentPeriodPhaseShortLabel`·`periodLabels`·`switchPeriodCount`); `hasValidPeriodDurations` 는 이미 `lib/tournament-periods.ts`. ⑦ 형식 이름 표는 `admin-labels`/`v1-status-labels` 에 없어 새 파일; 공개 `competitionFormatLabel` 은 건드리지 않음(Q8 후속).
