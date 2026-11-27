# L4 신청 관리 (S4 처리할 것 + 확정 팀 · L8 tone) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 신청 관리 탭을 상태 칩 8개 + 카드 5~6버튼에서 「처리할 것(다음 할 일 1개) · 확정 팀 · 접힌 대기·취소/작성 중」으로 바꾸고, 공용 목록의 한쪽 색 띠(tone)를 없앤다. 대회와 정규 리그 어드민이 같은 부품을 쓴다.

**Architecture:** `registrations-tab.tsx` 는 훅·핸들러·모달을 가진 컨테이너로 남고, 화면은 props 로만 도는 섹션 컴포넌트 셋(처리할 것·확정 팀·접힌 묶음)과 행 ⋯ 메뉴(`ActionMenu`, L0)로 쪼갠다. 묶음 판정은 순수 함수 `groupRegistrations`. 명단 잠금·마감 예외는 「명단 보기」 창 안으로 옮긴다. 폰(<768)은 같은 마크업에서 「취소 처리」가 아래 시트, 「골라서 처리」 모드, ⋯ 가 `ActionSheet` 로 갈린다.

**Tech Stack:** Next.js 16 / React 19 / Tailwind v4 tokens / TanStack Query(훅 mock) / Vitest + Testing Library / `@/test/viewport` `installViewport`.

**Spec:** `.github/tasks/20261140-admin-tournament-ux-renovation.md` (S4 · Q3 · Q8 · M4-1 · M4-2 · L8). 목업: `~/.cache/teameet-admin-tournament-ux-20261127/mockups/s4-registrations/C.html`+`notes.md`, `m4-registrations/index.html`+`notes.md`.

## Global Constraints

- **선행 조건:** L0 가 머지돼 `apps/v1_web/src/components/v1-ui/action-menu.tsx`(`ActionMenu`, C-1)가 있어야 한다. 없으면 Task 1 도 시작하지 말고 중단·보고.
- UI 문구는 해요체, 한 줄 도움말. 용어: 신청(접수·등록 금지, 상태 이름 「접수 중」만 예외) · 홈·원정. 상태 한글화는 `AdminStatusPill`/`lib/v1-status-labels.ts` 경유(화면에서 삼항으로 새로 한글화하지 않는다).
- **무료/유료 문구(PR #2560)**: `registrations-tab.tsx` 의 `const confirmNoun = isFreeEntry ? '신청 확인' : '입금 확인'` 를 그대로 유지하고 섹션에 prop 으로 내려 쓴다. 무료 대회 화면 어디에도 「입금」이 나오지 않고, 유료 대회 화면 어디에도 「신청 확인」이 나오지 않는다(상태 라벨 포함).
- **R-K3 한쪽 색 띠 금지**: `border-left`/`border-l-*`·`inset Npx 0 0` 그림자·`before:` 띠·`border-2` 파랑 강조 금지. 상태는 글자 배지, 선택은 옅은 배경(`--blue50`) + 1px `--blue500` 테두리까지.
- 토큰만(하드코딩 색·px 금지), 터치 44px(`Button size="sm"` 는 44px), `aria-*` 는 CLAUDE.md 기준, `React.forwardRef` 금지, 오류는 `extractErrorMessage(err, '해요체 fallback')`.
- 폰/데스크톱 경계는 768px 하나: `REGISTRATIONS_WIDE_MEDIA_QUERY = '(min-width: 768px)'`(`ActionMenu` 와 같은 값). jsdom 기본 `matchMedia` 는 항상 false(=폰)이므로 데스크톱 테스트는 `beforeEach(() => { restore = installViewport(1280) })` / `afterEach(() => restore())`, 폰은 `installViewport(390)`.
- 새 주석은 코드가 말하지 못하는 제약만, 이 파일들의 주석 언어(한국어)로 3줄 이하. 커밋은 내 파일만 pathspec(`git add <경로> && git commit -m "…" -- <경로>`) 후 `git show --stat HEAD` 로 확인. 서버·API·MSW 응답 모양은 바뀌지 않는다(백엔드 변경 없음).
- 테스트 실행은 `apps/v1_web` 에서 `./node_modules/.bin/vitest run <파일명 일부>`, 타입 `./node_modules/.bin/tsc --noEmit -p tsconfig.json`, `node scripts/v1-pattern-check.mjs`. next dev 서버 금지, `prisma generate` 금지.

## Review Focus

1. 신청이 9개 상태 전부 있을 때 어느 행도 사라지지 않고 정확히 한 묶음에만 들어간다(draft·submitted 포함) → Task 1·6.
2. 조회 전용(`canWrite=false`, 스태프 면): 확정·입금 확인·취소 처리·골라서 처리·대기로 두기·신청 거부·명단 잠금이 하나도 없고, 명단 보기·CSV·경기별 명단은 남는다 → Task 3·4·5.
3. 일괄 선택 뒤 새로고침으로 상태가 바뀐 행(더는 선택 불가)은 막대의 「N팀」과 실제 처리 대상에서 빠진다 → Task 4.
4. 「명단 보기」 창이 열린 채 목록이 갱신되면(잠금 직후) 창이 낡은 신청을 들고 있지 않고, 그 신청이 사라지면 창이 닫힌다 → Task 6.
5. 리그(정원 숫자·명단 마감 없음)와 정원 초과(확정 9 / 정원 8): 막대는 100% 에서 멈추고 「정원이 다 찼어요」는 정원을 알 때만, 리그는 「확정 팀 N팀」 + 마감 예외 버튼 없음 → Task 5·6.

## 확인된 사실 (코드 근거)

- 어드민 목록 API 는 **draft 를 내려준다** — `apps/v1_api/src/tournaments/admin-registrations.service.ts` `list()` 는 선택 `status` 외에 거르지 않는다. 지금 화면은 칩이 없어 「전체」에서만 보였다.
- 신청 `submitted` 를 쓰는 서버 경로는 현재 없고(Prisma enum 에만 있음), 어드민 전이(`confirmPayment`=awaiting_payment, `confirm`=payment_checking·paid·waitlisted, `cancel`=ADMIN_CANCELLABLE)도 받지 않는다.
- 무료 대회 제출은 `payment_checking` 으로 바로 간다(`tournament-registrations.service.ts`). `awaiting_payment` 의 일괄 선택은 서버가 그 상태만 받아서 그대로 유지.
- `ActionButton`(tournament-detail-shared) 의 유일한 사용처가 이 탭이라 Task 6 에서 삭제. `AdminCardList.tone` 의 유일한 사용처도 이 탭(Task 7 에서 삭제).

## File Structure (모두 `apps/v1_web/src/app/admin/tournaments/[id]/` 아래, 달리 적지 않으면)

| 파일 | 책임 |
|---|---|
| `registrations-model.ts`(+test) | 묶음·라벨·한 줄 설명·주 버튼 판정, 공유 타입(`ShowToast`·`RegistrationHandlers`·`RegistrationViewContext`) |
| `registration-csv.tsx` | `runCsvExport`(BOM 저장) · `ExportAllCsvButton` |
| `registration-roster-modal.tsx` | `RosterModal` 이동(+`footer` 슬롯) |
| `registration-roster-lock-controls.tsx`(+test) | 명단 잠금·마감 예외(훅 내장) |
| `registration-row-menu.tsx`(+test) | 행 ⋯ 메뉴(`ActionMenu`, 행별 CSV 훅) |
| `registrations-cancel-request.tsx`(+test) | 「취소 처리」 인라인 선택 · 폰 시트 |
| `registrations-todo-section.tsx`(+test) | 처리할 것 + 일괄 선택 |
| `registrations-confirmed-section.tsx`, `registrations-collapsed-sections.tsx`(+test) | 확정 팀 · 대기·취소 · 작성 중 |
| `registrations-tab.tsx`(+기존 4 테스트 파일) | 컨테이너(필터·배너·카드 목록 삭제) |
| `tournament-detail-shared.tsx` | `REGISTRATION_STATUS_FILTERS`·`ActionButton` 삭제 |
| `components/admin/admin-card-list.tsx`, `admin-data-table.tsx`(+test) | L8 tone |

---

### Task 1: 묶음·라벨 모델 + CSV 도우미

**Files:**
- Create: `registrations-model.ts`, `registrations-model.test.ts`, `registration-csv.tsx`
- Modify: none (기존 CSV 코드는 Task 6 에서 지운다)

**Interfaces:**
- Produces (`registrations-model.ts`, 이후 모든 태스크가 이 이름을 쓴다):
```ts
type Registration = V1AdminTournamentRegistration;
export type ShowToast = (message: string, variant?: 'success' | 'error') => void;
export const REGISTRATIONS_WIDE_MEDIA_QUERY = '(min-width: 768px)';
export interface RegistrationGroups { todo: Registration[]; confirmed: Registration[]; waitlisted: Registration[]; cancelled: Registration[]; drafts: Registration[] }
export function groupRegistrations(items: readonly Registration[]): RegistrationGroups; // 입력 순서 유지, Record<Status,GroupKey> satisfies 로 새 enum 값이 컴파일을 깬다
export type PrimaryAction = 'confirm-payment' | 'confirm' | 'handle-cancel' | 'view-roster';
export function registrationPrimaryAction(status: V1TournamentRegistrationStatus): PrimaryAction;
export function isBulkSelectable(reg: Registration): boolean; // status === 'awaiting_payment'
export function registrationStatusLabel(reg: Registration, isFreeEntry: boolean): string | undefined; // undefined = AdminStatusPill 기본
export function registrationTodoHint(reg: Registration, isFreeEntry: boolean): string;
export interface RegistrationViewContext { readonly canWrite: boolean; readonly isFreeEntry: boolean; readonly confirmNoun: string; readonly admissionsBlockedReason: string | null; readonly busy: boolean; readonly showToast: ShowToast }
export type RegistrationHandlers = Readonly<Record<'onViewRoster' | 'onConfirmPayment' | 'onConfirm' | 'onWaitlist' | 'onApproveCancel' | 'onKeepRegistration' | 'onOpenCancelSheet' | 'onReject' | 'onToggleGameRosters', (reg: Registration) => void>>;
```
- Produces (`registration-csv.tsx`): `runCsvExport(exportCsv: ReturnType<typeof useV1ExportRosterCsv>, fallbackFilename: string, showToast: ShowToast): void` (기존 `CsvExportButton.handleClick` 본문 그대로 — BOM·토스트 문구 불변), `ExportAllCsvButton({ tournamentId, showToast })`(`Button variant="outline" size="sm"` + Download 아이콘, 라벨 「전체 명단 CSV」, 진행 중 「…」).

**Copy (정확히 이 문구):**

| 상태 | 무료 | 유료 |
|---|---|---|
| submitted | 신청 내용을 확인해 주세요 | 신청 내용을 확인해 주세요 |
| awaiting_payment | 신청 내용을 보고 확인해 주세요 | 입금 내용을 보고 확인해 주세요 |
| payment_checking | 신청을 받았어요. 명단을 보고 확정해 주세요 | 입금을 확인했어요. 명단을 보고 확정해 주세요 |
| paid | 신청을 받았어요. 명단을 보고 확정해 주세요 | 결제가 끝났어요. 명단을 보고 확정해 주세요 |
| cancel_requested | 팀이 참가 취소를 요청했어요 | 팀이 참가 취소를 요청했어요 |

`registrationStatusLabel`: 무료 대회의 awaiting_payment/payment_checking/paid → 「신청 작성 중」/「신청 확인 중」/「신청 완료」(현 `registrationStatusFilters` 매핑), `cancelled`+`cancelOutcome` → `registrationCancelOutcomeLabel`, `draft` → 「임시저장」(`AdminStatusPill` 기본 「초안」은 대회 초안 말이라 신청에 안 맞는다), 나머지 undefined. `registrationPrimaryAction`: awaiting_payment→confirm-payment · payment_checking·paid·waitlisted→confirm · cancel_requested→handle-cancel · 나머지(submitted·confirmed·cancelled·draft)→view-roster.

- [ ] **Step 1: 실패하는 테스트 작성** (`registrations-model.test.ts`)
```ts
const STATUSES = ['submitted','awaiting_payment','payment_checking','paid','cancel_requested','confirmed','waitlisted','cancelled','draft'] as const;
it('9개 상태가 정확히 한 묶음에만 들어가고 입력 순서를 지킨다', () => {
  const g = groupRegistrations(STATUSES.map((status, i) => reg({ id: `r${i}`, status })));
  expect(g.todo.map((r) => r.status)).toEqual(['submitted','awaiting_payment','payment_checking','paid','cancel_requested']);
  expect(g.confirmed.map((r) => r.status)).toEqual(['confirmed']);
  expect([g.waitlisted, g.cancelled, g.drafts].map((x) => x[0].status)).toEqual(['waitlisted','cancelled','draft']);
  expect(Object.values(g).flat()).toHaveLength(9);
});
it('무료 대회 문구에는 입금이 없고 유료 문구에는 신청 확인이 없다', () => {
  for (const status of ['submitted','awaiting_payment','payment_checking','paid','cancel_requested'] as const) {
    const text = [registrationTodoHint(reg({ status }), true), registrationStatusLabel(reg({ status }), true) ?? ''].join(' ');
    expect(text).not.toContain('입금');
    expect([registrationTodoHint(reg({ status }), false), registrationStatusLabel(reg({ status }), false) ?? ''].join(' ')).not.toContain('신청 확인');
  }
  expect(registrationStatusLabel(reg({ status: 'awaiting_payment' }), true)).toBe('신청 작성 중');
  expect(registrationStatusLabel(reg({ status: 'cancelled', cancelOutcome: 'approved' }), false)).toBe('취소 승인됨');
  expect(registrationStatusLabel(reg({ status: 'draft' }), false)).toBe('임시저장');
});
it('주 버튼 판정과 일괄 선택 대상', () => {
  expect(STATUSES.map(registrationPrimaryAction)).toEqual(
    ['view-roster','confirm-payment','confirm','confirm','handle-cancel','view-roster','confirm','view-roster','view-roster']);
  expect(STATUSES.filter((status) => isBulkSelectable(reg({ status })))).toEqual(['awaiting_payment']);
});
```
- [ ] **Step 2:** `./node_modules/.bin/vitest run registrations-model` → FAIL(모듈 없음).
- [ ] **Step 3:** 위 시그니처대로 `registrations-model.ts` 구현, `registration-csv.tsx` 작성(기존 `registrations-tab.tsx:403-485` 의 BOM Blob 저장 로직을 함수로 옮기되 `registrations-tab.tsx` 는 아직 건드리지 않는다).
- [ ] **Step 4:** 같은 명령 → PASS, `tsc --noEmit` 0.
- [ ] **Step 5: Commit** `feat(web): 신청 묶음·라벨 모델과 CSV 도우미를 만든다` (경로: 위 3개 파일).

---

### Task 2: 명단 보기 창 이동 + 명단 잠금 컨트롤

**Files:**
- Create: `registration-roster-modal.tsx`(= `registrations-tab.tsx:45-399` 의 `RosterModal` 이동), `registration-roster-lock-controls.tsx`, `registration-roster-lock-controls.test.tsx`
- Modify: `registrations-tab.tsx`(RosterModal 정의 삭제 + import 만), `tournament-roster-modal.test.tsx`·`tournament-roster-identity.test.tsx` 의 import 경로

**Interfaces:**
- Consumes: Task 1 `ShowToast`.
- Produces: `RosterModal(props)` — 기존 props + `footer?: ReactNode`(JoinKFA 안내 위, 선수 추가 블록 아래에 그림). 창 제목 「명단 검토 — 팀」·내부 동작 불변(재노출 shim 두지 않는다).
  `RosterLockControls({ registration, canWrite, rosterDeadlineAt, showToast }: { registration: V1AdminTournamentRegistration; canWrite: boolean; rosterDeadlineAt: string | null; showToast: ShowToast }): JSX.Element | null` — 훅(`useV1RosterLock/Unlock/DeadlineOverrideGrant/Revoke`)을 안에서 부른다. 버튼 이름·토스트 문구·가시 규칙은 지금과 **같다**: `명단 잠금`(canWrite·미잠금·confirmed) / `잠금 해제`(canWrite·잠금·confirmed|cancel_requested) / `마감 예외 허용`(confirmed·예외 없음·`rosterDeadlineAt !== null`) / `예외 해제`(confirmed·예외 있음). 보여 줄 게 없거나 `canWrite=false` 면 null. 잠금 상태는 글자로도 한 줄(「명단이 잠겨 있어요」/「명단이 아직 잠기지 않았어요」). 성별 쿼터 거절(`TOURNAMENT_GENDER_QUOTA_NOT_MET`)은 `formatGenderQuotaError` 로 지금과 같이.

- [ ] **Step 1: 테스트** (`registration-roster-lock-controls.test.tsx`, 훅 mock 방식은 `tournament-detail-registrations-tab.test.tsx:262-445`) — 그 describe 의 5개(grant·grant 잠금 토스트·revoke·리그에서 grant 숨김·cancelled/cancel_requested 의 잠금 해제 규칙)를 컴포넌트 단위로 옮기고(원본 삭제는 Task 6), 아래를 더한다:
  - `confirmed·미잠금` → `명단 잠금` 클릭 → `lockMutate({ registrationId: 'reg-1' }, {onSuccess,onError})`, 토스트 「명단을 잠갔어요.」.
  - `마감 예외 허용` → `grantMutate('reg-1', …)`(잠긴 신청이면 토스트가 「…잠금 해제도 함께 해야 해요.」로 끝남) · `예외 해제` → `revokeMutate('reg-1', …)`, 토스트 「예외를 해제했어요.」.
  - `rosterDeadlineAt={null}`(리그) → `마감 예외 허용` 없음, 이미 예외 받은 신청의 `예외 해제` 는 있음.
  - 잠긴 `cancelled` → 아무것도 안 그림(`container` 비어 있음), 잠긴 `cancel_requested` → `잠금 해제` 하나.
  - `canWrite={false}` → 버튼 0개.
- [ ] **Step 2:** `vitest run registration-roster-lock` → FAIL.
- [ ] **Step 3:** 컴포넌트 구현 + `RosterModal` 파일 이동(import 정리, `footer` 슬롯). 두 roster 테스트의 `from './registrations-tab'` → `'./registration-roster-modal'`.
- [ ] **Step 4:** `vitest run registration-roster tournament-roster` → PASS, `tsc` 0.
- [ ] **Step 5: Commit** `refactor(web): 명단 검토 창을 분리하고 명단 잠금 컨트롤을 만든다`.

---

### Task 3: 행 ⋯ 메뉴 + 취소 처리(인라인·폰 시트)

**Files:**
- Create: `registration-row-menu.tsx`(+`.test.tsx`), `registrations-cancel-request.tsx`(+`.test.tsx`)

**Interfaces:**
- Consumes: Task 1 타입, L0 `ActionMenu`/`ActionSheetAction`, `ADMIN_CANCELLABLE`(tournament-detail-shared), `useV1ExportRosterCsv`.
- Produces:
```ts
export function RegistrationRowMenu(props: { registration: Registration; ctx: RegistrationViewContext; handlers: RegistrationHandlers }): JSX.Element;
export function CancelRequestChoice(props: { id: string; busy: boolean; onApprove: () => void; onKeep: () => void }): JSX.Element;       // 데스크톱 인라인
export function CancelRequestSheet(props: { open: boolean; registration: Registration | null; reason: string; error: string | null; busy: boolean; onReasonChange: (v: string) => void; onApprove: () => void; onKeep: () => void; onClose: () => void }): JSX.Element; // 폰
```
- `RegistrationRowMenu`: 트리거 `aria-label="{팀} 더보기"`(44×44, lucide `Ellipsis`), `label={팀이름}`. 행마다 `useV1ExportRosterCsv(reg.id)` 하나(「명단 CSV 받기」 → `runCsvExport(exportCsv, \`roster_${id}.csv\`, showToast)`). 항목 표(위→아래, 대괄호는 `canWrite && ADMIN_CANCELLABLE.has(status) && status !== 'cancel_requested'`일 때만, destructive·`groupLabel: '되돌릴 수 없는 동작'`·description 「되돌릴 수 없어요」, 선택 → `handlers.onReject`). 「명단 보기」 항목은 그 행의 주 버튼이 「명단 보기」가 아닐 때만 넣는다(조회 전용이면 모든 주 버튼이 「명단 보기」라 빠진다):

| 상태 | 항목 |
|---|---|
| awaiting_payment · waitlisted | 명단 보기 · 명단 CSV 받기 · [신청 거부] |
| payment_checking · paid | 대기로 두기(canWrite 만, `admissionsBlockedReason` 이면 disabled + `disabledReason`) · 명단 보기 · 명단 CSV 받기 · [신청 거부] |
| confirmed | 경기별 명단(description 「경기마다 출전 선수를 정해요」, canWrite 무관) · 명단 CSV 받기 · [신청 거부] |
| cancel_requested | 명단 보기 · 명단 CSV 받기 |
| submitted · cancelled · draft | 명단 CSV 받기 (주 버튼이 이미 명단 보기) |

- `CancelRequestChoice`: 옵션 버튼 둘 — 접근 이름은 `aria-label` 로 「취소 승인」「참가 유지」만, 설명은 `aria-describedby`: 「신청이 취소되고 되돌릴 수 없어요. 사유를 남길 수 있어요.」 / 「취소 요청을 거절하고 이전 상태로 돌려요. 팀이 남긴 사유는 기록에 남아요.」. 질문 줄 「취소 요청을 어떻게 처리할까요?」. 위험 옵션은 빨간 글자(띠 금지).
- `CancelRequestSheet`: `BottomSheet`(`onClose`, `ariaLabel`) 안에 헤더(「{팀} 취소 요청」+ 요청 시각 한 줄), `role=radiogroup` 두 옵션(위와 같은 문구), 팀 사유가 있으면 「팀이 남긴 취소 사유: “…”」, 「취소 승인」을 고른 때만 「운영진 사유 (선택)」 textarea(`reason`), 하단 「닫기」 + 확정 버튼(「취소 승인하기」 danger / 「참가 유지하기」 primary). **plan decision:** 선택은 비어 시작하고 고르기 전엔 확정 버튼 disabled(목업은 취소 승인이 미리 골라져 있으나 되돌릴 수 없는 동작이라 한 번 탭으로 승인되지 않게 함).

- [ ] **Step 1: 테스트** (`@/hooks/use-v1-api` 는 `useV1ExportRosterCsv` 만 mock, 데스크톱 `installViewport(1280)`):
```tsx
it.each(MENU_TABLE)('$status · canWrite=$canWrite 의 메뉴 항목', async ({ status, canWrite, present, absent }) => {
  render(<RegistrationRowMenu registration={reg({ status, teamName: '성수' })} ctx={ctx({ canWrite })} handlers={handlers} />);
  fireEvent.click(screen.getByRole('button', { name: '성수 더보기' }));
  const menu = screen.getByRole('menu', { name: '성수' });
  for (const l of present) expect(within(menu).getByRole('menuitem', { name: new RegExp(`^${l}`) })).toBeInTheDocument();
  for (const l of absent) expect(within(menu).queryByRole('menuitem', { name: new RegExp(`^${l}`) })).toBeNull();
});
```
  `MENU_TABLE` 은 위 표 전체 + 조회 전용 행(confirmed·canWrite=false → 경기별 명단·명단 CSV 받기 있음, 신청 거부 없음; payment_checking·canWrite=false → 대기로 두기 없음).
  - 「신청 거부」 선택 → `handlers.onReject` 가 해당 신청으로 1회, 메뉴는 닫힘. 「명단 CSV 받기」 선택 → 훅 mutate 1회.
  - `admissionsBlockedReason` 이 있으면 「대기로 두기」 가 비활성이고 눌러도 `onWaitlist` 호출 0.
  - 폰(`installViewport(390)`): 트리거 클릭 → `role=dialog` 시트에 같은 항목이 버튼으로 있다.
  - `CancelRequestChoice`: 두 버튼 클릭이 각각 `onApprove`/`onKeep` 1회, `busy` 면 둘 다 disabled.
  - `CancelRequestSheet`: 처음엔 확정 버튼 disabled → 「취소 승인」 선택 시 textarea 와 「취소 승인하기」 나타남 → `onReasonChange` 로 글이 올라가고 클릭 시 `onApprove`; 「참가 유지」 선택 시 textarea 사라지고 「참가 유지하기」 → `onKeep`; `error` 는 `role=alert`.
- [ ] **Step 2:** `vitest run registration-row-menu registrations-cancel-request` → FAIL.
- [ ] **Step 3:** 구현. 위험 항목에 빨강 글자 외 장식 금지.
- [ ] **Step 4:** 같은 명령 → PASS.
- [ ] **Step 5: Commit** `feat(web): 신청 행 ⋯ 메뉴와 취소 처리 선택을 만든다`.

---

### Task 4: 처리할 것 섹션 + 일괄 선택 (M4-1)

**Files:** Create `registrations-todo-section.tsx`, `registrations-todo-section.test.tsx`

**Interfaces:**
- Consumes: Tasks 1·3, `useMediaQuery`(`@/hooks/use-media-query`), `AdminStatusPill`, `Button`, `formatDate`(`./tournament-admin-shared`), `formatRegistrationPaymentSubtitle`.
- Produces:
```ts
export function RegistrationsTodoSection(props: {
  rows: readonly Registration[]; ctx: RegistrationViewContext; handlers: RegistrationHandlers;
  selectedIds: ReadonlySet<string>; onToggleSelected: (id: string) => void; onClearSelected: () => void; onBatchConfirm: () => void;
}): JSX.Element;
```
행(`li`, 카드: 1px `--border` 테두리·`--card-surface`, 선택되면 `--blue50` + 1px `--blue500`): 팀 이름 + 배지(`AdminStatusPill status label={registrationStatusLabel}`), `registrationTodoHint` 한 줄, 메타 한 줄(명단 N명|명단 미등록 · 자동 확정 {날짜} · 입금자 {이름} · 신청 {날짜} · 취소 요청 {날짜} · 결제 요약(`payment.amount > 0` 일 때만 `formatRegistrationPaymentSubtitle`) — 문구는 지금 카드 메타와 같다), 취소 요청이면 `팀 취소 사유: …`/`운영진 사유: …` 줄, 주 버튼 하나(`Button size="sm"`) + `RegistrationRowMenu`. 주 버튼: confirm-payment→`ctx.confirmNoun`(primary, `busy` 면 disabled) · confirm→「확정」(primary, `busy || admissionsBlockedReason` 이면 disabled) · handle-cancel→「취소 처리」(outline, 데스크톱 `aria-expanded`+`aria-controls` 로 `CancelRequestChoice` 펼침, 폰은 `handlers.onOpenCancelSheet`) · view-roster 또는 `!canWrite`→「명단 보기」(outline, `onViewRoster`). 머리: 「처리할 것」 + 주황 배지 「{n}건」(`tm-badge-orange`), 0건이면 배지는 중립색 「0건」 + 한 줄 「지금 처리할 신청이 없어요」(M4-2). 일괄 선택: 체크 칸은 카드 왼쪽 52px 전체(`<label>`, 접근 이름 `{팀} 일괄 선택`), 대상은 `isBulkSelectable` 행만. **선택 막대** `role=region aria-label="선택한 신청 한꺼번에 처리"`: 「{n}팀 선택했어요」 + 「선택 해제」 + 「선택한 {n}팀 {ctx.confirmNoun}」(`onBatchConfirm`). `n` 은 `selectedIds` ∩ 현재 선택 가능 행(Review Focus 3). **폰(`!useMediaQuery(WIDE)`)**: 체크 칸·막대 대신 머리의 「골라서 처리」(선택 가능 행이 1개 이상이고 `canWrite` 일 때만) → 고르기 모드: 버튼이 「그만 고르기」(누르면 `onClearSelected`), 카드의 주 버튼·⋯ 숨김, 선택 불가 행은 회색 바탕 + 「한꺼번에 처리할 수 없어요. 고르기를 끝내고 따로 처리해요.」, 안내 줄 「체크할 수 있는 팀만 한꺼번에 처리해요 · {n}팀 선택했어요」(`aria-live=polite`), 선택 막대는 화면 아래 고정(`fixed inset-x-0 bottom-0`, 안전영역 패딩, 목록 아래에 같은 높이 여백).

- [ ] **Step 1: 테스트** (`installViewport(1280)` 기본, 훅 mock 은 `useV1ExportRosterCsv` 만):
  - 입금 대기 한 줄 → 그 행의 버튼 이름 목록이 `['입금 확인', '{팀} 더보기']`; 무료(`isFreeEntry`) 면 `['신청 확인', …]` 이고 행 텍스트에 「입금」 없음. 클릭 → `onConfirmPayment(reg)`.
  - `payment_checking`·`paid` → 주 버튼 「확정」(`onConfirm`), `admissionsBlockedReason` 이 있으면 disabled, 눌러도 호출 0.
  - `cancel_requested` → 「취소 처리」 `aria-expanded=false` → 클릭하면 true 이고 「취소 승인」「참가 유지」 둘이 나타남 → 각각 `onApproveCancel`/`onKeepRegistration`. 폰에서는 같은 버튼이 `onOpenCancelSheet` 만 부르고 펼침이 생기지 않음.
  - `canWrite=false` → 모든 행의 주 버튼이 「명단 보기」, 체크박스·「골라서 처리」·`확정` 없음.
  - 데스크톱 체크박스는 입금 대기 행에만(`getAllByRole('checkbox')` 길이 1, 이름 `{팀} 일괄 선택`), 체크 시 `onToggleSelected(id)`; `selectedIds={new Set(['a'])}` 면 막대에 「1팀 선택했어요」·「선택한 1팀 입금 확인」, 클릭 → `onBatchConfirm`, 「선택 해제」 → `onClearSelected`.
  - **낡은 선택**: `selectedIds` 에 이미 `payment_checking` 으로 바뀐 행 id 만 있으면 막대가 안 나온다.
  - 0건 → 「지금 처리할 신청이 없어요」 + 「0건」, 행 0.
  - 폰: 처음엔 체크박스·막대 없음 → 「골라서 처리」 클릭 → 체크박스(선택 가능 행만)·안내 줄·주 버튼 숨김·「한꺼번에 처리할 수 없어요」(취소 요청 행) → 「그만 고르기」 → `onClearSelected` 호출, 체크박스 사라짐.
- [ ] **Step 2:** `vitest run registrations-todo-section` → FAIL.
- [ ] **Step 3:** 구현(마크업은 `s4-registrations/C.html`·`m4-registrations/index.html` (a)(d) 를 따른다. 목업의 `.ibx.attn/.danger` 변형은 만들지 않는다 — 배지가 상태를 말한다).
- [ ] **Step 4:** 같은 명령 → PASS.
- [ ] **Step 5: Commit** `feat(web): 신청 관리에 처리할 것 섹션과 골라서 처리를 만든다`.

---

### Task 5: 확정 팀 · 대기·취소 · 작성 중 섹션

**Files:** Create `registrations-confirmed-section.tsx`, `registrations-collapsed-sections.tsx`, `registrations-confirmed-section.test.tsx`(두 파일 테스트를 함께)

**Interfaces:**
- Consumes: Tasks 1·3·`AdminRegistrationGameRosters`(`@/components/game-roster/admin-registration-game-rosters`, props 지금과 동일).
- Produces:
```ts
export function RegistrationsConfirmedSection(props: {
  rows: readonly Registration[]; teamCapacity: number | undefined; tournamentId: string;
  ctx: RegistrationViewContext; handlers: RegistrationHandlers;
  expandedGameRostersId: string | null; onGameRostersDirtyChange: (dirty: boolean) => void;
}): JSX.Element;
export function RegistrationsWaitlistCancelledSection(props: { rows: readonly Registration[]; ctx; handlers }): JSX.Element;
export function RegistrationsDraftSection(props: { rows: readonly Registration[]; ctx; handlers }): JSX.Element | null; // 0건이면 null
```
- 확정: 머리 「확정 팀」 + 배지 `{n} / {정원}팀`(정원 모르면 `{n}팀`), 정원을 알고 `n >= 정원` 이면 「정원이 다 찼어요」, 정원을 알 때만 막대(`role=img aria-label="정원 {정원}팀 중 {n}팀 확정"`, 폭 `min(100, n/정원*100)%`, `--green500`), 오른쪽 `ExportAllCsvButton`(disabled 없음 — 신청 0건이면 이 섹션 자체가 안 나온다). 0팀이면 「아직 확정된 팀이 없어요」. 행: 팀 이름 / `명단 N명`(+자동 확정·결제 요약 조건은 Task 4 와 같은 문구) + 잠금 배지(`rosterLockedAt` ? 「잠김」 `tm-badge-blue` : 「잠금 전」 `tm-badge-grey`) / 「명단 보기」(outline) / `RegistrationRowMenu`. `lg` 이상 2열, 미만 1열, 행 최소 높이 60px. `expandedGameRostersId === reg.id` 면 그 `li` 가 `col-span-full` 로 행 아래에 `AdminRegistrationGameRosters`(`correctionHref` `/admin/live/${encodeURIComponent(tournamentId)}/records/corrections`, `onDirtyChange`)를 그린다(지금 `renderExpanded` 와 같은 동작).
- 대기·취소: 머리 「대기·취소」 + 개수. 0건 → 「대기하거나 취소된 신청이 없어요.」(토글 없음). 1건 이상 → 기본 접힘 토글 버튼(`aria-expanded`), 펼치면 행: 팀 이름 + 배지(`registrationStatusLabel` ?? 기본) + 신청 시각, 취소 행은 `팀 취소 사유: …`/`운영진 사유: …` 줄(지금 카드와 같은 문구), 주 버튼 = waitlisted 면 「확정」(primary, `onConfirm`) 아니면 「명단 보기」, `RegistrationRowMenu`.
- 작성 중: 1건 이상일 때만 「작성 중 {n}」 접힘 토글(기본 접힘) + 펼치면 한 줄 설명 「팀이 아직 제출하지 않은 신청이에요」 + 행(이름·「임시저장」 배지·신청 시각·「명단 보기」).

- [ ] **Step 1: 테스트**:
  - 확정 8·정원 8 → 「8 / 8팀」·「정원이 다 찼어요」·`getByRole('img', { name: '정원 8팀 중 8팀 확정' })`; 9·정원 8(초과) → 같은 문구 + 막대 폭 style `100%`; 정원 `undefined`(리그) → 「8팀」, `queryByRole('img')` 없음, 「정원이 다 찼어요」 없음.
  - 확정 행: `잠금 전`/`잠김`(rosterLockedAt 있을 때), 버튼 「명단 보기」 → `onViewRoster`; ⋯ 메뉴에 「경기별 명단」 → `onToggleGameRosters`; `canWrite=false` 면 ⋯ 에 경기별 명단·명단 CSV 받기만(신청 거부 없음).
  - `expandedGameRostersId='reg-1'` → `data-testid` mock 패널이 그 행 아래에 하나(다른 행엔 없음).
  - 대기·취소 0건 → 문구 + 토글 없음. 2건(waitlisted 1·cancelled 1) → 처음엔 팀 이름이 안 보임 → 토글 클릭 후 보임, waitlisted 행 「확정」 → `onConfirm`, cancelled 행(`cancelOutcome:'approved'`, `cancelReason`, `adminCancelReason`) 에 「취소 승인됨」·「팀 취소 사유: …」·「운영진 사유: …」.
  - 작성 중 0건 → 렌더 없음(`container` 비어 있음), 1건 → 접힘, 펼치면 「임시저장」 + 「명단 보기」 만.
- [ ] **Step 2:** `vitest run registrations-confirmed-section` → FAIL.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(web): 신청 관리에 확정 팀과 접힌 묶음을 만든다`.

---

### Task 6: 컨테이너 연결 · 낡은 코드 삭제 · 기존 테스트 이전

**Files:**
- Modify: `registrations-tab.tsx`, `tournament-detail-shared.tsx`, `tournament-detail-registrations-tab.test.tsx`, `tournament-roster-identity.test.tsx`·`tournament-roster-parent-lifecycle.test.tsx`(둘 다 실제 `RegistrationsTab`/대회 셸을 MSW 로 렌더 — 행의 버튼 질의 `'명단 검토'` 를 `'명단 보기'` 로, 창 제목 「명단 검토 — 팀」 질의는 그대로)
- Check(수정 불필요 확인): `registrations/page.tsx`, `app/admin/league-matches/[leagueId]/registrations/league-registrations-client.tsx`(props 계약 불변 — `tsc` 로 확인)

**Interfaces:** `RegistrationsTab` props 불변(`tournamentId, showToast, tournamentTeamCount?, canWrite, admissionsBlockedReason?, requireCancelReason?, isFreeEntry?, rosterDeadlineAt?`).

- [ ] **Step 1: 테스트 이전/추가** — `tournament-detail-registrations-tab.test.tsx` 파일 맨 위에 `installViewport(1280)`(beforeEach/afterEach) 추가하고 describe 별로:
  - 「상태 필터의 빈 결과」 → 「묶음과 상태」 로 교체. 새 테스트: ① 9개 상태 신청 → `처리할 것` 「5건」, 확정 팀 1, 「대기·취소」 2건(접힘), 「작성 중 1」; 합 9행이 어느 것도 사라지지 않음(토글을 펴고 팀 이름 9개 모두 `getByText`) ② `queryByRole('group', { name: '신청 상태 필터' })` 없음, `queryByText(/처리 대기 중인 신청이/)` 없음 ③ 종료·취소된 대회: 「확정」 disabled, ⋯ 의 「대기로 두기」 disabled, `role=status` 에 사유 ④ 신청 0건 → 「신청이 없어요」·「아직 신청한 팀이 없어요.」, 「전체 명단 CSV」 버튼 없음 ⑤ 로딩 `aria-busy`, 오류 + 「다시 시도하기」 → `refetch`, `truncated` 경고가 묶음과 함께 보임(기존 4개 이전, `AdminListSkeleton`/오류 박스는 `AdminCardList` 와 같은 모양으로 컨테이너에서 직접).
  - 「마감 예외 토글」: 그 describe 의 grant·grant 토스트·revoke·리그 숨김·잠금 해제 규칙 5개는 Task 2 로 옮겼으니 여기서 삭제. 남기는 것: 조회 전용(Review Focus 2) = 모든 변경 버튼 없음 + 「명단 보기」·「명단 CSV 받기」·경기별 명단 있음; 정원 초과 확정 → 「대기로 처리」(그대로, 행 버튼은 「확정」); **새 통합**: 「명단 보기」 클릭 → `dialog` 안에 `명단 잠금` 이 보이고 클릭하면 lock mutate 가 불리며, 목록이 잠긴 신청으로 다시 오면(`rerender`) 같은 창에 `잠금 해제` 가 보인다(Review Focus 4: 창은 id 로 신청을 찾는다); 신청이 목록에서 사라지면 `dialog` 가 닫힌다.
  - 「거부 사유…」: 「거부」 버튼 → ⋯ 「신청 거부」 → 창의 제출 버튼 「거부」(이름 그대로). 리그 사유 필수·payload 테스트 유지. 「팀의 취소 요청 처리」: 「취소 처리」 → 「취소 승인」(인라인 옵션) → 창(기존 단언 유지), 「참가 유지」 → 확인 창 「참가 유지하기」 → `rejectCancel` mutate. 폰(`installViewport(390)`) 한 테스트: 「취소 처리」 → 시트에서 「취소 승인」 선택 + 사유 입력 + 「취소 승인하기」 → `cancel` mutate 가 `{ registrationId, reason }`.
  - 「경기별 명단 펼침」·「전체 명단 CSV」·「팀별 금액」·`describe.each` 무료/유료: 진입 조작만 새 UI 에 맞춘다(경기별 명단 = ⋯ 메뉴, 행별 CSV = ⋯ 메뉴, 일괄 버튼 이름은 `선택한 1팀 ${noun}`, 금액 행 단언은 `getAllByRole('listitem')` 대신 팀 이름으로 `closest('li')`). `describe.each` 의 `document.body.textContent` 무입금/무신청확인 단언은 **그대로** 둔다.
  - 리그 계약(새): `tournamentId="league-1" canWrite requireCancelReason`(정원·마감 없음) → 「확정 팀」 배지 `1팀`, 막대 없음, 명단 창에 `마감 예외 허용` 없음.
- [ ] **Step 2:** `vitest run tournament-detail-registrations-tab` → FAIL(새 테스트 + 이전한 테스트).
- [ ] **Step 3: 구현** — `registrations-tab.tsx`: 훅·핸들러(`handleConfirmPayment/Confirm/ConfirmClick/Cancel/submitCancel/RejectCancel/BatchConfirm`)는 유지하되 `statusFilter`·`changeStatusFilter`·`registrationStatusFilters`·`pendingReviewCount`·상태 칩·주황 배너·`AdminCardList` 호출·`ExportCsvButton`·`ExportAllCsvButton`·잠금/예외 핸들러(Task 2 로 이동)를 지우고, `groupRegistrations(registrations)` 결과를 Task 4·5 섹션에 연결. 이동·변경점: ① `rosterRegistration` state → `rosterRegistrationId`(문자열)로 바꿔 `registrations.find` 로 창에 넘긴다(없으면 닫힘) ② 취소 처리 표면 `cancelSurface: 'modal' | 'sheet'` 추가 — `handleCancel(reg, surface = 'modal')`, `SimpleModal` 은 `modal` 일 때만 열고 `CancelRequestSheet` 는 `sheet` 일 때 같은 `cancelReason/cancelError/submitCancel` 를 쓴다(「참가 유지하기」는 확인 창 없이 `rejectCancelRequest.mutate`) ③ `handleRejectCancel` 확인 창 문구를 참가 유지 말로: title 「참가 유지」, message 「취소 요청을 거절하고 이전 상태로 돌릴까요? 팀이 남긴 취소 사유는 기록에 남아요.」, confirmLabel 「참가 유지하기」 ④ `RosterModal` 의 `footer` 에 `RosterLockControls`(`rosterDeadlineAt` 전달) ⑤ `handlers`/`ctx` 객체를 만들어 섹션에 전달, `busy` = 네 mutation 의 `isPending` OR ⑥ 일괄 처리 결과 후 `setSelectedIds(new Set())` 유지. `tournament-detail-shared.tsx` 에서 `REGISTRATION_STATUS_FILTERS`·`ActionButton` 삭제(삭제 전 `git grep` 으로 사용처 0 재확인; `ADMIN_CANCELLABLE` 은 남김). 쓰지 않게 된 import(lucide 아이콘·`AdminCardList` 등) 정리.
- [ ] **Step 4:** `vitest run tournament-detail-registrations-tab tournament-roster tournament-detail-shared registrations league-registrations` → PASS, `tsc --noEmit` 0.
- [ ] **Step 5: Commit** `feat(web): 신청 관리 탭을 처리할 것·확정 팀 묶음으로 바꾼다`.

---

### Task 7: L8 — 공용 목록의 한쪽 색 띠 제거

**Files:** Modify `components/admin/admin-data-table.tsx`, `components/admin/admin-card-list.tsx`, `components/admin/admin-data-table.test.tsx`(+`components/admin/index.ts` 는 `AdminCardModel` 타입 export 그대로)

**소비처 점검(이미 확인, 실행 때 코드로 다시 본다)** — `rowTone` 쓰는 표 10곳은 모두 상태를 글자로 이미 그린다: `admins/page.tsx`(상태 열 「활성/회수됨/정지」) · `content/notices-view.tsx`·`inquiries/page.tsx`·`matches/page.tsx`·`team-matches/page.tsx`·`teams/page.tsx`·`tournaments/page.tsx`·`users/page.tsx`(`AdminStatusPill` 열) · `monitoring/audit-log-view.tsx`(`toStatus` 알약) · `league-matches/[leagueId]/league-match-fixtures-client.tsx`(취소 행 「취소됨」 글자 + `AdminMatchPhasePill`). `AdminCardList.tone` 은 신청 탭만 썼고 Task 6 으로 쓰는 곳이 0.

- [ ] **Step 1: 테스트** (`admin-data-table.test.tsx` 에 추가):
```tsx
it.each(['danger', 'warning'] as const)('rowTone=%s 는 배경 틴트만 쓰고 한쪽 색 띠를 만들지 않는다 — 상태는 글자로 남는다', (tone) => {
  const { container } = render(<AdminDataTable<{id:string;name:string;status:string}> columns={[{key:'n',header:'이름',render:(r)=>r.name},{key:'s',header:'상태',render:(r)=>r.status}]}
    rows={[{id:'a',name:'가',status:'취소됨'}]} keyExtractor={(r)=>r.id} rowTone={()=>tone} />);
  expect(screen.getAllByText('취소됨').length).toBeGreaterThan(0);
  for (const el of container.querySelectorAll('tr, td, li')) expect(el.className).not.toMatch(/border-l-/);
  expect(container.querySelector('tr')!.className).toContain(tone === 'danger' ? 'bg-[var(--red50)]/40' : 'bg-[var(--tint-orange)]');
});
```
- [ ] **Step 2:** `vitest run admin-data-table` → FAIL(첫 td·모바일 `li` 에 `border-l-2 border-l-…`).
- [ ] **Step 3:** `admin-data-table.tsx`: `ROW_TONE_ACCENT` 와 두 적용 자리(데스크톱 첫 `td`, 모바일 `li`)·그 설명 주석·`rowTone` JSDoc 의 「left accent bar」 삭제(틴트 `ROW_TONE_TR` 만 유지; `stickyActions` 의 1px 회색 `border-l` 구분선은 띠가 아니므로 그대로). `admin-card-list.tsx`: `AdminCardModel.tone`·`TONE_CARD`·`li` 의 tone 클래스 삭제(`git grep -n "tone" -- components/admin/admin-card-list.tsx` 0, 다른 소비처가 새로 생겼으면 중단 보고).
- [ ] **Step 4:** `vitest run admin-data-table` PASS, `tsc` 0.
- [ ] **Step 5: Commit** `refactor(web): 어드민 공용 목록의 한쪽 색 띠를 없앤다`.

---

### Task 8: 점검 · changeset · PR

- [ ] **Step 1: 한꺼번에 점검** (`apps/v1_web`): `./node_modules/.bin/tsc --noEmit -p tsconfig.json` 0 · `node scripts/v1-pattern-check.mjs` 통과 · `./node_modules/.bin/vitest run registration registrations tournament-detail-registrations tournament-roster tournament-detail-shared admin-data-table league-registrations` 전부 PASS.
- [ ] **Step 2: 기계 검사** — **추가된 줄만**(`git diff -U0 origin/dev -- apps/v1_web | grep '^+'`) 에서 0 이어야 한다: `border-l-|border-left|inset [0-9]+px 0|before:|forwardRef|접수|어웨이|window\.confirm`(「접수 중」 상태 이름만 예외) · 하드코딩 색 `#[0-9a-fA-F]{3,6}` · `text-\[[0-9]+px\]`. 주석 줄(`^\+\s*(//|\*)`)이 추가 줄의 1/3 안팎인지 센다.
- [ ] **Step 3: changeset** `.changeset/admin-registrations-inbox.md`:
```
---
"v1_web": patch
---
대회·리그 어드민 신청 관리를 「처리할 것」과 「확정 팀」으로 나눴어요. …(바뀐 점 2~3문장, 해요체: 상태 칩·처리 대기 배너 제거, 신청마다 다음 할 일 버튼 하나와 ⋯ 메뉴, 폰의 골라서 처리·취소 처리 시트, 명단 잠금·마감 예외는 명단 보기 창 안으로, 목록의 한쪽 색 띠 제거)
```
- [ ] **Step 4: Commit** — changeset 을 `chore(web): 신청 관리 개편 changeset` 으로 커밋.
- [ ] **Step 5: 푸시·PR** — `git fetch origin dev` 후 base 가 최신 dev 인지 확인, 한국어 제목·본문(바뀐 점 · 되돌릴 수 없는 동작 위치 · 「갤러리는 머지 후 alpha 에서 채워요」 · R-K3 측정은 머지 후), `gh pr create --base dev --repo kim-song-jun/matchup-sports-platform`, 직후 `gh pr view <N> --json baseRefName` 이 `dev` 인지 확인, `gh pr edit <N> --add-reviewer "@copilot"`. **머지하지 않는다**(head 가 한다).

### Task 9: 머지 후 alpha 검증 (head 가 「배포 반영」 알림을 준 뒤)

- [ ] `x-teameet-commit` 이 머지 커밋 이후인지 확인 후 `ego-browser`(스킬 먼저 읽기)로 alpha 의 대회 `/admin/tournaments/<id>/registrations` 를 390·768·1440, 리그 `/admin/league-matches/<id>/registrations` 를 390·1440 으로 캡처(24팀 대회에서도 한 번). 처리할 것이 0건·1건 이상 모두 보이게 신청 상태가 섞인 시험 대회를 쓰고, alpha 데이터 쓰기는 사용자 승인 없이 하지 않는다(가능한 기존 데이터만).
- [ ] **R-K3 측정**: 위 화면과 `rowTone` 이 걸리는 표 하나(예: `/admin/tournaments` 취소 대회 행)에서 `[...document.querySelectorAll('*')]` 중 계산된 `border-left-width ≥ 2px 이고 border-right-width 보다 큼`, 또는 `box-shadow` 가 `inset` 이고 x 오프셋만 0 이 아님 → 개수 **0** 을 PR 에 적는다. 390 폭 신청 10팀 페이지 높이(스펙 기준 3,162px → 절반 이하)도 숫자로 적는다.
- [ ] 3폭 갤러리를 raw URL 200 확인 후 PR 코멘트로 게시. 끝나면 ego task space 를 `finish({ keep: [] })` 로 닫는다. 조작 흐름 확인: 입금/신청 확인 → 확정, 취소 요청 → 취소 승인/참가 유지, 명단 보기 → 명단 잠금·잠금 해제·마감 예외, ⋯ → 경기별 명단·신청 거부.

## Self-Review

- **Spec coverage:** S4 처리할 것(행당 주 버튼 1개·취소 처리 인라인/시트)=T3·4 · 확정 팀(명단 보기·잠금 표시·잠금 해제 창 안)=T2·5 · ⋯ 메뉴 3종=T3 · 대기·취소 접힘·작성 중 접힘·칩 8개/배너 삭제=T5·6 · M4-1 골라서 처리=T4 · M4-2 0건 한 줄=T4 · 선택 영역 44px=T4 · 전체 명단 CSV 머리=T5 · Q3 묶음=T1 · Q8 리그=T6(리그 계약 테스트) · L8=T7 · 무료/유료 문구=Global+T1·T6.
- **Names:** `RegistrationViewContext.confirmNoun`·`RegistrationHandlers.onOpenCancelSheet`·`registrationPrimaryAction`·`REGISTRATIONS_WIDE_MEDIA_QUERY` 가 T1 정의 → T3~T6 에서 같은 철자.
- **Proportion:** 새 컴포넌트 본문은 적지 않았고 서명·문구·테스트만 적음.

## 결정·확인 필요

- **plan decision:** ① `submitted` 는 Q3 대로 「처리할 것」에 세되 서버 전이가 없어 주 버튼이 「명단 보기」뿐 ② 작성 중 묶음의 행 배지는 「임시저장」(묶음 이름만 「작성 중」 — 무료 대회의 「신청 작성 중」 배지와 글자가 겹쳐 보일 수 있음) ③ 폰 취소 시트는 선택을 비워 시작 ④ 신청 거부 항목에 `groupLabel: '되돌릴 수 없는 동작'` 을 줘 L0 가 구분선과 함께 소제목을 그리면 그대로 둔다(목업은 소제목 없는 구분선) ⑤ 무료 대회 행에는 「무료 참가」 결제 줄을 내지 않는다(금액 > 0 일 때만) ⑥ 처리할 것 순서는 API 순서(신청 시각 최신순) ⑦ 일괄 체크박스 이름은 기존 `{팀} 일괄 선택` 유지 ⑧ 일괄 선택 막대는 목업대로 데스크톱=처리할 것 머리 줄, 폰=화면 아래 고정(스펙 S4 의 「하단 바」는 폰에서 충족) ⑨ 창 제목은 「명단 검토 — 팀」 그대로(버튼은 「명단 보기」, 목업 notes 가 같은 창이라고 밝힘).
- **needs head:** 폰 ⋯ 시트 머리의 부제(「확정 · 명단 7명 · 잠금 전」, 목업 (c))는 C-1 `ActionMenuProps` 에 `subtitle` 이 없어 생략 — L0 에 선택 prop `subtitle?: string` 을 넣을지 결정 필요(넣으면 팀 이름 아래 상태 한 줄을 이 레인이 채움).
