# L3 대회 정보 (S3 섹션 요약 카드 + 수정 시트) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/tournaments/:id/info` shows six read-only summary cards; every edit happens in one `SideSheet` per section (deep link `?edit=<key>`), replacing the 30-field modal and the four other edit patterns.

**Architecture:** `info-section.tsx` shrinks to an orchestrator (cards + URL-driven sheet). Each section is one file in `info-forms/` exporting an `InfoSectionDefinition` (summary rows + a form that builds `SaveStep[]`). One sheet component runs the steps through `runSaveSteps` (sequential, stop at first failure, retry only the rest). The old per-card saves (period editor, prize, images, promo) are folded into the same sheet.

**Tech Stack:** Next.js 16 client components, React 19 (`ref` as prop), TanStack Query 5, Vitest + Testing Library + MSW (real hooks), Tailwind v4 tokens.

**Spec:** `.github/tasks/20261140-admin-tournament-ux-renovation.md` (S3, C-2, C-3, Q5, Q7, Q9, 2차 M3-1~3). Mockups: 로컬 목업 `mockups/s3-info/{A.html,notes.md}`(저장소 밖), `m3-info/{index.html,notes.md}`.

## Global Constraints
- Worktree from `git fetch origin dev` → `origin/dev`; PR base `dev`. **Precondition:** L0 merged (`apps/v1_web/src/components/v1-ui/side-sheet.tsx` exports `SideSheet`, props per spec C-2: `open,title,onClose,children,footer?,dirty?`). If the file is missing, stop and report `BLOCKED`.
- Paths below are relative to `apps/v1_web/src` unless prefixed; `[id]` = `app/admin/tournaments/[id]`. Do not edit the shell/header/tabs (L1), `registrations-tab`/`tournament-detail-shared.tsx` (L4; sole exception: T10 step 4), `components/admin/bracket-canvas/**` (L5; `SixTeamModeField` is consumed as-is), `app/admin/tournaments/new/**` (L2). Import `TOURNAMENT_PERIOD_PHASES`, `tournamentPeriodPhaseLabel`, `tournamentPeriodPhaseShortLabel`, `switchPeriodCount` from `lib/tournament-period-phases` (L0 Task 6 moved them there; that is the single import path after L0 merges).
- Server rules stay: partial PATCH (`UpdateTournamentDto`, every field optional), `expectedVersion` on every PATCH, format lock (`formatChangeBlockedReason`, `stagePlan`, started tournaments), lineup/substitution lock when `in_progress|completed`, `tieBreakOrderBlockedReason`, `sixTeamDirectFinalOrderBlockedReason`, `sixTeamBracket` lock. No new API, no backend change.
- Server calls only through hooks that use `useV1DataSource()` — `/tournament-ops-demo` renders this screen on a local data source and its test asserts `fetch` is never called.
- Copy: Korean 해요체; terms: 장소/구장, 신청, 경기 시간(전·후반/단판), 자유 교체/횟수 제한, 진행 방식, 순위 정하는 순서, 정산 계좌. Banned in changed UI strings: 피리어드, 롤링, 접수(except status 「접수 중」), 정정, 어웨이, and sentences that name another screen (「"대회 정보" 탭에서…」).
- R-K3 (Critical): no `border-l/r-*` color accents, no `shadow-[inset …px 0 0 …]`, no `before:` bands, no `border-2 border-blue-*` emphasis. Selected = light bg + 1px border-color change. The 「채워야 할 것」 strip is a full box with a 1px border.
- Tokens only (`globals.css`/`tokens.css`), 44px targets, no `forwardRef`, no `transition-all`, no `text-[Npx]`, no `window.confirm`, no empty `catch`. Errors: `extractErrorMessage(err, '해요체 fallback')`. Comments: only constraints code cannot say, ≤3 lines, repo's comment language.
- Commits: pathspec (`git commit -m "…" -- <paths>`) then `git show --stat HEAD`; Korean conventional subject (`feat(web): …`). Never `git add -A`.
- Test commands (from `apps/v1_web`; filter by file basename — bracket paths break vitest's regex filter): `./node_modules/.bin/vitest run <basename>`, `./node_modules/.bin/tsc --noEmit -p tsconfig.json`, `node scripts/v1-pattern-check.mjs`.

## Review Focus
1. Retry after a partial failure must send only the unfinished calls (never re-send a finished one) — T1, T7.
2. A stale-version 409 must keep every typed value, say so in the sheet, and the next 「저장」 must succeed — T3.
3. `?edit=` with an unknown value, or opened by a read-only role, must render no sheet and not crash — T10.
4. Started (`in_progress`) tournament: 출전 인원·교체 locked with the reason, but 팀 파울 기준 stays editable — T7.
5. A cleared optional text/number must be sent as an explicit `null` (not omitted, not `''`), and fields of other sections must never appear in the PATCH body — T3–T9.

## File Structure
| File | Responsibility |
|---|---|
| `lib/sequential-save.ts` | `SaveStep`, `runSaveSteps`, `partialSaveMessage` (pure) |
| `[id]/info-sections.ts` | **C-3 owner**: `TOURNAMENT_INFO_SECTIONS`, meta, `parseInfoEditParam`, `infoEditHref`, `tournamentInfoNeeds` (진행 방식 이름은 L0 C-6 의 `TOURNAMENT_FORMAT_NAMES` 를 `lib/tournament-format-labels` 에서 import — 여기서 다시 만들지 않는다) |
| `[id]/use-info-edit-param.ts` | URL ↔ open section (`replace`, keeps other params) |
| `hooks/use-tournament-save-context.ts`, `hooks/use-tournament-period-settings.ts` (+`usePatchPeriods`) | `SaveContext`: fresh-version PATCHes |
| `[id]/info-forms/types.ts` | `InfoSectionDefinition`, form props/handle, summary row/context types |
| `[id]/info-summary-card.tsx`, `[id]/info-section-sheet.tsx` | card + sheet/footer/save wiring |
| `[id]/info-forms/{basic,schedule,entry,rules,public,promo}-section.tsx` | one section each (+ `.test.tsx`) |
| `components/admin/tournament-period-settings-editor.tsx` | `usePeriodSettingsDraft`, `PeriodSettingsFields`; league card kept (now opens a sheet) |
| `components/admin/tournaments/{prize-breakdown-editor,tie-break-preset-picker,tournament-images-field,tournament-datetime-field,promo-card-fields}.tsx` | copy/behavior adjustments |
| `test/msw/tournament-info-handlers.ts` | stateful fake of the endpoints the sheet calls |
| `[id]/info-section.tsx` | orchestrator; old modal/PrizeCard/CoverImageCard/inline promo deleted |

### Task 1: Sequential save runner
**Files:** Create `lib/sequential-save.ts`, `lib/sequential-save.test.ts`
**Interfaces:** Produces (used by T3–T9):
```ts
export interface SaveStep { readonly key: string; readonly label: string; readonly run: () => Promise<void> }
export type SaveOutcome =
  | { status: 'saved'; done: readonly string[] }
  | { status: 'failed'; done: readonly string[]; failedKey: string; message: string };
export function runSaveSteps(steps: readonly SaveStep[], completed: ReadonlySet<string>,
  toReason: (error: unknown, step: SaveStep) => string): Promise<SaveOutcome>;
export function partialSaveMessage(doneLabels: readonly string[], failedLabel: string, reason: string): string;
```
- [ ] **Step 1: Failing tests** — `runs steps in order` (done = all keys); `stops at the first failure and never calls later steps` (3 steps, 2nd throws → `failed`, `failedKey` = 2nd, 3rd `run` not called); `skips keys in completed and still lists them in done`; `partialSaveMessage(['경기 시간'],'경기 규칙','사유')` = `경기 시간은 저장됐고, 경기 규칙 저장에 실패했어요. 사유`; labels deduped and joined with `·` (`['출전 인원','교체']` → `출전 인원·교체는`, use `josa` from `lib/korean`); nothing done → returns `reason` unchanged; `toReason` receives `(error, failedStep)`.
- [ ] **Step 2:** `vitest run sequential-save` → FAIL (module missing).
- [ ] **Step 3:** Implement. A step whose key is in `completed` is skipped; a thrown error ends the run with `message = partialSaveMessage(labelsOf(done), step.label, toReason(error, step))`; `done` = completed keys + keys finished this run, in step order.
- [ ] **Step 4:** run → PASS. **Step 5:** commit `feat(web): 섹션 저장을 순서대로 실행하고 어디까지 됐는지 알려 주는 실행기`.

### Task 2: Section keys, needs, edit param (C-3)
**Files:** Create `[id]/info-sections.ts`, `[id]/info-sections.test.ts`, `[id]/use-info-edit-param.ts`, `[id]/use-info-edit-param.test.tsx`
**Interfaces:** Produces:
```ts
export const TOURNAMENT_INFO_SECTIONS = ['basic','schedule','entry','rules','public','promo'] as const;
export type TournamentInfoSectionKey = (typeof TOURNAMENT_INFO_SECTIONS)[number];
export const TOURNAMENT_INFO_SECTION_META: Record<TournamentInfoSectionKey, { title: string; description: string }>;
// 기본「대회를 알아보는 정보예요.」 일정·장소「신청과 경기가 열리는 때와 곳이에요.」 참가「몇 팀이, 몇 명으로, 얼마에 참가하는지예요.」
// 경기 규칙「모든 경기에 똑같이 적용돼요.」 공개 화면「참가자가 대회 페이지에서 보는 내용이에요.」 홍보「켜면 대회 정보로 카드 문구를 채워요.」
export function parseInfoEditParam(raw: string | null): TournamentInfoSectionKey | null;   // exact lowercase keys only
export function infoEditHref(basePath: string, key: TournamentInfoSectionKey): string;    // `${basePath}/info?edit=${key}`
export type InfoNeedField = 'venue' | 'rosterDeadlineAt' | 'bankAccount';
export interface InfoNeed { section: TournamentInfoSectionKey; field: InfoNeedField; label: string }
export function tournamentInfoNeeds(t: V1Tournament): InfoNeed[];
export const infoFieldId: (field: string) => string;                                      // `info-${field}`
import { TOURNAMENT_FORMAT_NAMES } from '@/lib/tournament-format-labels'; // L0 C-6 소유 — 재정의하지 않는다
// group_knockout '조별리그 → 토너먼트' · knockout '토너먼트만' · league '리그전' · league_knockouts '여러 단계'
export function useInfoEditParam(): { section: TournamentInfoSectionKey | null; open(key): void; close(): void };
```
Needs follow Q7 (not the mockup, which shows 대회 규정 as needed): 장소 (`venue` blank → section `schedule`), 명단 제출 마감 (`rosterDeadlineAt` null → `schedule`), 정산 계좌 (`entryFee>0 && !bankAccount?.trim()` → `entry`); `completed|cancelled` → `[]`.
- [ ] **Step 1: Failing tests** — `parseInfoEditParam` accepts the six keys, rejects `null`, `''`, `'foo'`, `'BASIC'`; `infoEditHref('/admin/tournaments/t1','rules')` = `/admin/tournaments/t1/info?edit=rules`; needs: free + blank venue/roster → `[venue, rosterDeadlineAt]` in that order; paid without account adds `bankAccount`; paid with account → none; whitespace-only venue counts as blank; completed → `[]`. Hook (mock `next/navigation`: `useSearchParams` over a mutable `URLSearchParams`, `usePathname`, `useRouter().replace` spy): `section` follows `?edit=`; `open('entry')` calls `replace('<path>?from=x&edit=entry', { scroll: false })` keeping other params; `close()` replaces with `edit` removed and other params kept (no trailing `?` when none left).
- [ ] **Step 2:** `vitest run info-sections use-info-edit-param` → FAIL. **Step 3:** Implement (pure constants file has no `'use client'`, no `next/*` import; hook file is `'use client'`). **Step 4:** PASS. **Step 5:** commit `feat(web): 대회 정보 섹션 키와 ?edit= 딥링크 계약`.

### Task 3: Sheet shell, summary card, MSW harness, 「기본」 section
**Files:** Create `hooks/use-tournament-save-context.ts`, `[id]/info-forms/types.ts`, `[id]/info-summary-card.tsx`, `[id]/info-section-sheet.tsx`, `[id]/info-forms/basic-section.tsx`, `[id]/info-forms/basic-section.test.tsx`, `test/msw/tournament-info-handlers.ts`; Modify `hooks/use-tournament-period-settings.ts` (add `usePatchPeriods`)
**Interfaces:** Consumes T1, T2, `SideSheet` (C-2). Produces:
```ts
// hooks/use-tournament-period-settings.ts
export function usePatchPeriods(tournamentId: string): (change: Omit<UpdateTournamentPeriodSettingsPayload,'expectedVersion'>) => Promise<void>; // refetch GET /periods, use its expectedVersion (null → throw '현재 설정 버전을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'), then PATCH
// hooks/use-tournament-save-context.ts
export interface SaveContext { patchTournament(fields: Omit<V1UpdateTournamentPayload,'expectedVersion'>): Promise<void>; patchPeriods: ReturnType<typeof usePatchPeriods> }
export function useTournamentSaveContext(tournamentId: string): SaveContext; // patchTournament: refetch useV1AdminTournament, send latest.updatedAt, via useV1UpdateTournament.mutateAsync
// info-forms/types.ts
export type BuildResult = { ok: true; steps: SaveStep[] } | { ok: false; message: string; fieldId: string };
export interface InfoSectionFormHandle { buildSteps(ctx: SaveContext): BuildResult }
export interface InfoSectionFormProps { base: V1Tournament; disabled: boolean; ref: Ref<InfoSectionFormHandle>; onDirtyChange(dirty: boolean): void; onBusyChange(busy: boolean): void }
export interface InfoSummaryRow { key: string; label: string; value: string; note?: string; badge?: { tone: 'needed'|'default'|'optional'|'off'; text: string } }
export interface InfoSummaryContext { tournament: V1Tournament; sportName?: string; lineupOptions?: V1LineupSizeOptions; periods?: TournamentPeriodSettingsResponse }
export interface InfoSectionDefinition { key: TournamentInfoSectionKey; rows(ctx: InfoSummaryContext): InfoSummaryRow[]; Form(props: InfoSectionFormProps): JSX.Element }
// info-summary-card.tsx
export function InfoSummaryCard(p: { definition: InfoSectionDefinition; context: InfoSummaryContext; canWrite: boolean; onEdit(key: TournamentInfoSectionKey): void }): JSX.Element; // <section> h2 title + description + <dl> rows + one 「수정」 button (aria-label `${title} 수정`, 44px) only when canWrite
// info-section-sheet.tsx
export function InfoSectionSheet(p: { definition: InfoSectionDefinition; initialTournament: V1Tournament; focusField?: string; onClose(): void; onSaved(message: string): void }): JSX.Element;
```
Badge texts: needed 「채워야 해요」(orange tint), default 「기본값」/「종목 기본값」, optional 「선택」, off 「꺼짐」 (grey) — always text, never color alone.
Sheet behavior: `base` = `useState(() => initialTournament)` (mounted per open, so a re-open re-snapshots); body = description line + `<definition.Form>`; footer = 「취소」 + 「저장」(`Button`, 「저장 중…」 while running) + one `role="alert"` line for the last message; `dirty` prop = form dirty or saving. Save = `handle.buildSteps(ctx)`; invalid → show message, `revealAndFocus(document.getElementById(fieldId))`; `steps.length===0` → `onClose()` + `onSaved('변경된 내용이 없어요.')`; else `runSaveSteps(steps, completedRef.current, toReason)` where `toReason` maps `TOURNAMENT_VERSION_CONFLICT` to 「다른 곳에서 먼저 저장돼서 이번 저장은 반영되지 않았어요. 입력한 내용은 그대로 두었어요. 다시 저장해 주세요.」 and others to `extractErrorMessage(error, `${step.label} 저장에 실패했어요.`)`; finished keys go into `completedRef` so a re-click runs only the rest; all saved → `onSaved(`${title} 설정을 저장했어요.`)` + `onClose()`. 「취소」 on a dirty form asks `useConfirm` with the exact options L0's `SideSheet` uses (`title '저장하지 않고 닫을까요?'`, `message '바꾼 내용이 저장되지 않아요.'`, `confirmLabel '저장하지 않고 닫기'`, `cancelLabel '계속 작성'`, danger) because C-2 has no `requestClose` (**needs head:** ask L0 to export those options so they are not duplicated). On open, focus `document.getElementById(infoFieldId(focusField))`.
Harness `createTournamentInfoServer(initial?: Partial<V1Tournament>)` → `{ handlers, state: { tournament, periods, patches: Record<string,unknown>[], periodPatches: Record<string,unknown>[] , failNext(target: 'tournament'|'periods', status: number, body?: {code?: string; message?: string}) } }`; handlers: GET/PATCH `*/api/v1/admin/tournaments/:id` (PATCH checks `expectedVersion === tournament.updatedAt` else 409 `TOURNAMENT_VERSION_CONFLICT`; merges body minus `expectedVersion`; bumps `updatedAt`), GET/PATCH `…/:id/periods` (same CAS; `expectedVersion` = tournament `updatedAt`), GET `…/:id/bracket`, GET `*/admin/competition-configs/lineup-size-options`, GET `*/master/sports`; plus `createTournamentInfoFixture(overrides)` (open, futsal, group_knockout, 8 teams, 6~10 players, free, venue/roster blank). Tests use a local `setupServer(...handlers)` + `QueryClientProvider` + `TournamentAdminProvider` (pattern: `league-settings-client.test.tsx`) and partially mock `@/hooks/use-v1-api` only for `useV1PlaceSearch`/`useV1PublicKakaoMapsKey`.
「기본」 section: fields 종목 (`select` over master sports → `sportId`), 대회명 (`title`, required, maxLength 100, trimmed), 진행 방식 (`select` of `TOURNAMENT_FORMAT_NAMES` → `format`; disabled with reason `stagePlan ? '여러 단계 대회는 진행 방식을 바꿀 수 없어요.' : formatChangeBlockedReason ?? (in_progress|completed ? '대회가 시작된 뒤에는 진행 방식을 바꿀 수 없어요.' : null)`; free hint 「조나 대진을 만들기 전까지 바꿀 수 있어요.」), 성별 (`GenderCategoryField`, saved `null` shows as unselected → `genderCategory`). Payload = changed keys only. Rows: 종목 · 대회명 · 진행 방식 (note = lock reason) · 성별 (`null` → 「성별 구분 없음 (기존)」).
- [ ] **Step 1: Failing tests** (`basic-section.test.tsx`, real `SideSheet`): `채워진 채로 열린다` (4 fields show saved values); `대회명만 바꾸면 PATCH 본문 키는 title 과 expectedVersion 뿐이다` (`Object.keys(state.patches[0]).sort()`; `onSaved('기본 설정을 저장했어요.')`; `onClose` called); `종목만 바꾸면 sportId 만 보낸다`; `바꾼 게 없으면 요청 없이 닫고 「변경된 내용이 없어요.」`; `대회명을 비우면 칸 아래 「대회명을 입력해 주세요.」, 요청 없음, 초점이 칸으로 간다`; `대진이 있어 잠긴 형식은 select 가 꺼지고 서버 사유가 보인다(요약 줄에도)`; `다른 곳에서 먼저 저장(409)되면 시트 안에 메시지, 입력 유지, 다시 저장하면 성공` (use `state.failNext('tournament',409,{code:'TOURNAMENT_VERSION_CONFLICT'})`); `값을 바꾼 뒤 ✕ 를 누르면 「저장하지 않고 닫을까요?」, 계속 작성하면 onClose 안 불림, 안 바꾼 채 닫으면 묻지 않는다`; card test: `수정 버튼은 canWrite 일 때만, 값이 비면 「채워야 해요」 배지`.
- [ ] **Step 2:** `vitest run basic-section` → FAIL. **Step 3:** Implement the files above (form: local draft state initialised from `base`; `onDirtyChange` effect; `useImperativeHandle(ref, …)`). **Step 4:** PASS + `tsc --noEmit`. **Step 5:** commit `feat(web): 대회 정보 수정 시트와 기본 섹션`.

### Task 4: 「일정·장소」 section
**Files:** Create `[id]/info-forms/schedule-section.tsx`, `…/schedule-section.test.tsx` (uses `TournamentDatetimeField` as is — it already takes `error` and `min`)
Fields (labels exact): 대회 시작 (`scheduledAt`), 대회 종료 (`scheduledEndAt`, `min`=start), 신청 마감 (`registrationDeadlineAt`), 명단 제출 마감 (`rosterDeadlineAt`), 장소 (`PlacePicker`, `maxLength=PLACE_NAME_MAX_LENGTH.tournament`), 주차 안내 (`parkingInfo`, textarea 500). Convert with `isoToKstDatetimeLocal`/`kstDatetimeLocalToIso`; one-line hints only. Rows: 대회 기간 (`formatDateRange`) · 신청 마감 · 명단 제출 마감 (past → 「… · 지남 — 팀이 명단을 낼 수 없어요」; blank → needed badge 「채워야 해요」) · 장소 (blank → needed) · 주차 안내 (blank → 「비어 있음」 + 「선택」). Field ids `infoFieldId('venue')`, `infoFieldId('rosterDeadlineAt')` for deep-link focus.
- [ ] **Step 1: Failing tests** — port from `[id]/info-section.test.tsx` (`명단 제출 마감은 신청 마감과 같거나 그 뒤`, `장소 스냅샷`) and add: `종료가 시작보다 빠르면 「대회 종료가 시작보다 빠를 수 없어요.」 칸 아래, 요청 없음`; `명단 마감이 신청 마감보다 앞서면 「명단 제출 마감은 신청 마감과 같거나 그 뒤여야 해요.」`; `순서가 어긋난 채 만들어진 대회도 마감을 안 건드린 수정은 막지 않는다`; `장소를 안 건드리면 venue 계열 키를 하나도 안 보낸다`; `장소 이름을 바꾸면 toVenuePayload 결과를 보낸다`; `장소를 비우면 venue:null`; `주차 안내를 비우면 parkingInfo:null`; `시작 시각만 바꾸면 PATCH 키는 scheduledAt 과 expectedVersion 뿐이고 값은 KST→ISO 변환`; rows: past roster deadline note, needed badges on blank venue/roster.
- [ ] **Step 2–5:** run FAIL → implement → PASS (`vitest run schedule-section`) → commit `feat(web): 대회 정보 일정·장소 섹션`.

### Task 5: 「참가」 section
**Files:** Create `[id]/info-forms/entry-section.tsx`, `…/entry-section.test.tsx`
Fields: 팀 수 (`teamCount`, 2~64, `league_knockouts` no upper limit; disabled for `stagePlan` with 「단계 편성의 정원 합계라 여기서는 바꿀 수 없어요.」, no link); 팀당 최소 경기 수 (`minMatchesPerTeam`, **only when `base.format==='league'`**, 1~50, blank → `null`, hint 「비우면 따로 확인하지 않아요.」) — plan decision (Q5); 명단 인원 최소/최대 (`minPlayers`,`maxPlayers`, 1~50, min≤max); 참가비 (`entryFee`, integer 0~100,000,000, comma-formatted, 「원」); 정산 계좌 은행명/계좌번호/예금주 (`bankName/bankAccount/bankHolder`, enabled only when fee>0, values kept when disabled, cleared → `null`); 혼성 쿼터 (**only when `base.genderCategory==='mixed'`**): switch + 남성 최소/최대·여성 최소/최대 (`genderMinMale/MaxMale/MinFemale/MaxFemale`, 0~50, blank → `null`; switch off with previous values sends four `null`s; invalid → 「혼성 명단의 최소·최대 인원 조건을 다시 확인해 주세요.」 using the old checks incl. `min+min > maxPlayers`). Rows: 팀 수 (`8팀`, note 「지금 신청 N팀」) · [league] 팀당 최소 경기 수 · 명단 인원 (「최소 6명 · 최대 10명」, `maxPlayers null` → 「최대 제한 없음」) · 참가비 (`formatEntryFee` from `lib/date-utils`; 0 → 「무료」) · 정산 계좌 (free → 「무료 대회라 필요 없어요」; paid+account → 「은행 계좌 (예금주)」; paid without → 「없음」 + needed) · [mixed] 혼성 쿼터 (none → 「제한 없음」 + 「기본값」). Field id `infoFieldId('bankAccount')`. Server rejection (paid without account) shows the server message in the sheet.
- [ ] **Step 1: Failing tests** — `팀 수 1·65 는 칸 아래 오류, 64 는 통과(league_knockouts 는 100 도 통과)`; `단계형은 팀 수 칸이 꺼진다`; `리그전에서만 팀당 최소 경기 수 칸이 있고 비우면 minMatchesPerTeam:null`, `조별리그+토너먼트에는 칸이 없다` (both directions); `명단 최소가 최대보다 크면 오류`; `무료일 때 계좌 칸이 꺼지고 유료로 바꾸면 열린다`, `무료로 바꿔 저장하면 bank 키를 보내지 않는다`; `계좌를 비우면 세 칸 모두 null`; `서버가 유료인데 계좌 없음을 거절하면(400) 그 메시지가 시트에 보이고 입력이 남는다` (`failNext('tournament',400,{message})`); `혼성이 아니면 쿼터 칸 없음 / 혼성이면 스위치, 끄면 null 네 개`; `쿼터 합이 최대 인원을 넘으면 오류`; `참가비만 바꾸면 PATCH 키는 entryFee 와 expectedVersion 뿐`; rows both wordings (무료 / 유료+계좌 / 유료+계좌 없음 → 「채워야 해요」).
- [ ] **Step 2–5:** FAIL → implement → PASS (`vitest run entry-section`) → commit `feat(web): 대회 정보 참가 섹션`.

### Task 6: Period settings draft + fields (also the league card)
**Files:** Modify `components/admin/tournament-period-settings-editor.tsx`; Create `components/admin/tournament-period-settings-editor.test.tsx`
**Interfaces:** Consumes `usePatchPeriods`, `SaveStep`, `SideSheet`. Produces:
```ts
export interface PeriodSettingsDraft {
  dirty: boolean;
  invalid: { fieldId: string; message: string } | null;   // 「경기 시간은 1분 이상으로 입력해 주세요.」
  buildSteps(patchPeriods: SaveContext['patchPeriods']): SaveStep[];  // [] when unchanged
}
export function usePeriodSettingsDraft(a: { tournamentId: string; stagePhases: readonly TournamentPeriodPhase[]; enabled?: boolean }): PeriodSettingsDraft & { query: UseQueryResult<TournamentPeriodSettingsResponse> };
export function PeriodSettingsFields(p: { draft: ReturnType<typeof usePeriodSettingsDraft>; disabled: boolean; stagePlan?: StagePlan | null }): JSX.Element;
export function TournamentPeriodSettingsEditor(p: { tournamentId: string; canWrite: boolean; showToast: …; stagePlan?: StagePlan | null }): JSX.Element; // unchanged props (league-rules-section.tsx)
```
`PeriodSettingsFields`: 「경기 시간」 with 「전·후반 | 단판」 buttons (`aria-pressed`, `switchPeriodCount`; hidden when the saved count is not 1 or 2), one minutes input per period (labels 전반/후반/단판, else `N번째`; unit 「분」), line 「한 경기 N분 · 연장은 빼고 정해요」; 「단계마다 다르게」 rows only for `stagePhases ∪ existing stageOverrides` (no 9-way select): each row shows `tournamentPeriodPhaseLabel` + 「위 시간 그대로」 or its minutes + 「바꾸기」 (44px, expands inline inputs + 「위 시간 그대로 쓰기」); hint 「시작 전 경기에만 적용돼요.」 Keep the existing read-only notes for `requiresDurationInput`, `groupOverrides`/`matchOverrideCount`, `compositionOverrides` (+ its bracket link) with 경기 시간 wording. Steps: default periods → `patchPeriods({ periods })` key `periods:default`; each changed stage → `patchPeriods({ phase, periods })` or `{ phase, inheritDefault: true }` key `periods:<phase>`; all labelled 「경기 시간」. The version-retry logic of the old editor is deleted (each call reads the fresh version). League card: summary + 「수정」 → `SideSheet` containing `PeriodSettingsFields`, footer 취소/저장, saves with `runSaveSteps`.
- [ ] **Step 1: Failing tests** (MSW harness; render a tiny host that mounts the hook + fields + a Save button): `바꾸지 않으면 steps 가 비어 있다`; `전반만 바꾸면 PATCH 본문은 expectedVersion 과 periods 두 칸뿐`; `단판으로 바꾸면 periods 길이 1`; `단계 「바꾸기」 → {phase:'final', periods}`, `「위 시간 그대로 쓰기」 → {phase, inheritDefault:true}`; `대진 단계(group, semi, final)만 줄이 나오고 단계 select 는 없다`; `0 이나 빈 값은 invalid 이고 steps 를 만들지 않는다`; `화면 어디에도 「피리어드」 가 없다`; league card regression: 수정 → 시트 → 저장 후 요약 갱신, 읽기 전용이면 수정 버튼 없음.
- [ ] **Step 2–5:** FAIL → implement → PASS (`vitest run tournament-period-settings-editor`; also run `league-rules` tests if present) → commit `refactor(web): 경기 시간 편집을 시트용 입력과 저장 단계로 나눠요`.

### Task 7: 「경기 규칙」 section
**Files:** Create `[id]/info-forms/rules-section.tsx`, `…/rules-section.test.tsx`; Modify `components/admin/tournaments/tie-break-preset-picker.tsx` + its test (heading/hint 「동점일 때 순서」→「순위 정하는 순서」)
Fields (order): 출전 인원 (option buttons from `useV1LineupSizeOptions(base.sportId)` → `lineupMaxPlayers`; branches: locked / loading / failed / unsupported as in the old modal, reworded without screen names, keep `LINEUP_LOCK_ESCAPE_HINT` text), 경기 시간 (`PeriodSettingsFields`, stage phases = unique `useV1AdminBracket` group phases, regular tournaments only), 교체 (「자유 교체」=`rolling` / 「횟수 제한」=`limited` + 「허용 교체 횟수」 0~50; switching to 횟수 제한 pre-fills `defaultMaxSubstitutions` when empty; rolling sends no count), 순위 정하는 순서 (`TieBreakPresetPicker` when `base.format!=='knockout'`, `tieBreakOrder`; default order → `null`; `StageTieBreakSettings` below it for `stageTieBreak` tournaments with hint 「단계마다 고르면 바로 저장돼요.」 — it keeps saving on select), 6강 방식 (`SixTeamModeField` eligible = `base.format==='knockout' && base.teamCount===6`, disabled when `sixTeamBracket`; `SixTeamOrderEditor` when on) — plan decision: placed here, next to the other ordering rule, since Q5 only fixes the condition, 징계: 경고 누적 출전정지 (장, `yellowAccumulationLimit`), 퇴장 출전정지 (경기, `redCardSuspensionMatches`) 1~20 → 「출전정지 기준은 1~20 사이의 정수로 적어 주세요.」, 팀 파울 기준 (개, `teamFoulThreshold`, `parseTeamFoulThresholdInput`, `TEAM_FOUL_THRESHOLD_ERROR`, cleared → explicit `null`). Steps in this order: periods steps, then one `rules` step (label 「경기 규칙」) with every changed main-PATCH key. Rows: 출전 인원 (「6명」+ 「종목 기본값」 when equal to `defaultMaxPlayers`) · 경기 시간 (「전·후반 20분 / 20분」+ 「종목 기본값」 when equal to `defaultPeriods`; note 「모든 단계가 같은 시간이에요.」 or 「조별리그만 다른 시간이에요」) · 교체 (「자유 교체」/「횟수 제한 N회」 + default badge) · 순위 정하는 순서 (preset name + rule; hidden for knockout) · [6강] 6강 방식 · 징계 (「팀 파울 5개」 + 「기본값」; 「경고 누적·퇴장 출전정지는 정하지 않았어요.」).
- [ ] **Step 1: Failing tests** — port from `info-section.test.tsx` (`6강 방식 수정 payload`, `동점일 때 순서 수정`, `6강 결승 직행 순서 수정`, `단계별 동점 순서 카드`, `팀 파울 기준`); add: `Q9: 경기 시간(1단계)은 저장되고 경기 규칙(2단계)이 실패하면 「경기 시간은 저장됐고, 경기 규칙 저장에 실패했어요. …」, 다시 저장하면 periods PATCH 는 늘지 않고 main PATCH 만 한 번 더`; `각 호출은 직전 호출이 올린 최신 버전으로 간다`(두 번째 PATCH 의 expectedVersion = 첫 PATCH 뒤 updatedAt); `진행 중 대회: 출전 인원·교체는 사유와 함께 잠기고 팀 파울 기준은 저장된다`; `교체 자유→제한 전환 시 횟수 기본값이 채워지고 rolling 은 횟수를 보내지 않는다`; `팀 파울 칸을 비우면 teamFoulThreshold:null, 안 건드리면 키가 없다`; `knockout 에는 순위 칸이 없고 6팀 토너먼트에만 6강 칸이 있다`; `출전정지 21 → 오류`; rows default badges both directions (기본값과 다르면 배지 없음).
- [ ] **Step 2–5:** FAIL → implement → PASS (`vitest run rules-section tie-break-preset-picker`) → commit `feat(web): 대회 정보 경기 규칙 섹션`.

### Task 8: 「공개 화면」 section
**Files:** Create `[id]/info-forms/public-section.tsx`, `…/public-section.test.tsx`; Modify `components/admin/tournaments/prize-breakdown-editor.tsx` + `.test.tsx`, `tournament-images-field.tsx`/`.test.tsx` (draft-only: no immediate save), `[id]/awards-tab.tsx` only if its test breaks
Fields: 이미지 (`TournamentImagesField`: `coverImageUrl`,`listImageUrl`,`showDetailImage`; uploads go through `useV1UploadImages` at pick time, PATCH only on 저장; `onUploadingChange` → `onBusyChange` disables 저장), 상금과 시상 (`PrizeBreakdownEditor` + textarea 「상금과 시상 요약」 → `prizePool`,`prizeBreakdown`,`prizeSummary`; if any of the three differs from the normalized base, send all three; empty → `null`s; invalid 총상금 → 「총상금은 0 이상의 숫자로 입력해 주세요.」), 대회 규정 (`rulesText`, textarea, max 10,000, cleared → `null`), 환불 정책 (`refundPolicyText`, cleared → `null`). `PrizeBreakdownEditor`: the three 「팀 시상 추가/개인 시상 추가/기타 추가」 buttons become one 「+ 시상 추가」 (disabled at 12 rows) and each row gets a category `select` (aria-label `상금 항목 N 구분`, default 팀 시상); `rows`/`onChange` API unchanged (also used by `awards-tab.tsx`). Rows: 이미지 (「목록·상세 모두 종목 기본 이미지」+ 「기본값」 or 「직접 올린 이미지」) · 상금과 시상 (summary or 「비어 있음」+「선택」) · 대회 규정 (first line or 「비어 있음」+「선택」) · 환불 정책 (same).
- [ ] **Step 1: Failing tests** — `이미지 숨김 스위치만 바꾸면 PATCH 키는 showDetailImage 와 expectedVersion 뿐(사진 URL 키 없음)`; `목록 이미지를 지우면 listImageUrl:null`; `업로드 중에는 저장이 꺼진다`; `업로드 실패 메시지가 시트에 보인다`; port `상금 행 …`, `시상 항목을 모두 삭제해 저장하면 null` (→ `prizePool/prizeSummary/prizeBreakdown` 모두 null); `바뀐 게 없으면 요청 없음`; `대회 규정을 비우면 rulesText:null 이고 다른 키 없음`; editor: `「+ 시상 추가」 한 개뿐이고 「팀 시상 추가」는 없다`, `행 구분을 개인 시상으로 바꾸면 직렬화가 개인 구역`, `12행에서 추가 버튼 꺼짐`; `awards-tab.test.tsx` still passes.
- [ ] **Step 2–5:** FAIL → implement → PASS (`vitest run public-section prize-breakdown-editor tournament-images-field awards-tab`) → commit `feat(web): 대회 정보 공개 화면 섹션과 시상 추가 버튼 통합`.

### Task 9: 「홍보」 section
**Files:** Create `[id]/info-forms/promo-section.tsx`, `…/promo-section.test.tsx`; Modify `components/admin/tournaments/promo-card-fields.tsx` only for copy/term fixes (keep its API; `collapsible` is used here)
Fields: two `PromoCardFields` (`home` 「홈 오늘의 추천」, `list` 「대회 목록 상단」, `collapsible`) mapped to the 20 `promoHome*/promoList*` keys; priority `Number` (non-numeric → `priorityError` 「우선순위는 숫자로 입력해 주세요.」, no save); image pick keeps the old guards (`image/*` only → 「이미지 파일만 첨부할 수 있어요.」, ≤5MB → 「이미지는 5MB 이하로 첨부해 주세요.」, missing URL → 「업로드된 이미지 URL을 받지 못했어요.」) via `useV1UploadImages`; texts trimmed, cleared text sent as `''` (DTO is non-nullable); **only changed keys are sent**. `defaultImageUrl` from `resolveTournamentImage` as in the old modal. Rows: 홈 오늘의 추천 / 대회 목록 상단: 「켜짐 · 제목(없으면 대회명 사용)」 + off badge 「꺼짐」.
- [ ] **Step 1: Failing tests** — `홈 카드를 켜기만 하면 PATCH 키는 promoHomeEnabled 와 expectedVersion 뿐`; `제목을 바꾸면 그 키만`; `바꾼 게 없으면 요청 없음`; `우선순위에 글자를 넣으면 칸 아래 오류, 요청 없음`; `6MB 이미지는 메시지만 나오고 업로드 호출 없음`; `업로드 성공 뒤 저장해야 PATCH 가 나간다`; rows `꺼짐` badge / `켜짐 · …`.
- [ ] **Step 2–5:** FAIL → implement → PASS (`vitest run promo-section promo-card-fields`) → commit `feat(web): 대회 정보 홍보 섹션`.

### Task 10: Switch the page, delete the old modal, fix consumers
**Files:** Modify `[id]/info-section.tsx` (rewrite, keep export `TournamentInfoSection`), `[id]/info-section.test.tsx` (rewrite), `[id]/tournament-detail-campaign-tab.test.tsx`, `components/tournament-ops-demo/tournament-ops-demo.test.tsx`, `[id]/tournament-detail-shared.tsx` (`substitutionPolicyLabel` only: 「자유 교체」 / 「횟수 제한 N회」 / 「횟수 제한 (횟수 미설정)」) + its test; repo-root `scripts/qa/capture-tournament-admin-demo.cjs`, `docs/scenarios/tournament-ops-demo.md`; Create `[id]/info-forms/registry.ts` (`INFO_SECTIONS: readonly InfoSectionDefinition[]` in `TOURNAMENT_INFO_SECTIONS` order)
Page: reads `useV1AdminTournament`, `useV1MasterSports`, `useV1LineupSizeOptions(sportId)`, `useTournamentPeriodSettings(id)`; renders (1) a 「채워야 할 것 N」 strip when `tournamentInfoNeeds` is non-empty — full 1px box, text 「{labels}가 비어 있어요.」 (josa), one button per distinct section 「{labels} 입력하기」 → `useInfoEditParam().open(section)`; (2) six `InfoSummaryCard`s (`grid-cols-1 xl:grid-cols-2`); (3) `{section && canWrite ? <InfoSectionSheet key={section} … focusField={first need field of that section} onClose={close} onSaved={(m)=>showToast(m,'success')} /> : null}`. No section-jump row, no inputs at rest. Delete: edit modal, `PrizeCard`, `CoverImageCard`, inline promo card, `GenderQuotaInput`, `TOURNAMENT_FORMAT_LABEL`, the second period card, the standalone `StageTieBreakSettings` card; remove now-unused imports.
- [ ] **Step 1: Failing page tests** (`info-section.test.tsx`; MSW harness + `next/navigation` mock as in T2): `카드 6장이 정해진 순서(기본 / 일정·장소 / 참가 / 경기 규칙 / 공개 화면 / 홍보)로 나오고 각 카드에 「수정」 한 개`; `쉬는 화면에 입력칸이 0개`; `읽기 전용 역할은 수정 버튼도 시트도 없다(?edit=rules 로 들어와도)`; `?edit=foo 는 시트 없음·오류 없음`; `?edit=schedule 로 들어오면 「일정·장소」 시트가 열리고 첫 빈칸(장소)에 초점`; `닫으면 replace 로 edit 만 지워진다`; `주황 상자의 「장소·명단 제출 마감 입력하기」가 일정·장소 시트를 연다`; `섹션 바로가기 줄이 없다(role=navigation 없음, M3-2)`; `사라진 것: 「대회 정보 수정」·「홍보 카드 수정」·「상금 정보 저장」 버튼, 「피리어드 설정」 카드가 없다`; **moved-thing table**: for each `[section, label]` of the old modal fields (종목, 진행 방식, 대회명, 대회 시작, 대회 종료, 신청 마감, 명단 제출 마감, 장소, 주차 안내, 참가비, 팀 수, 명단 인원, 출전 인원, 교체, 순위 정하는 순서, 성별, 은행명, 계좌번호, 예금주, 대회 규정, 환불 정책, 경고 누적 출전정지, 퇴장 출전정지, 팀 파울 기준, 목록 이미지, 상금과 시상 요약, 홈 오늘의 추천) open that section's sheet and find the field (`test.each`); `저장 성공 → 시트가 닫히고 카드 요약이 새 값으로 바뀐다`; `format 잠금은 기본 시트에서도 유지`. Update the demo test to open the 「기본」 sheet and edit 대회명 (still asserting no `fetch`), and delete the null-clearing case from `tournament-detail-campaign-tab.test.tsx` after confirming T4/T5/T8 cover `venue/parkingInfo/bank*/rulesText/refundPolicyText = null`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; update the QA script/doc to click 「기본」 → 「수정」 → sheet. **Step 4:** `vitest run info-section.test tournament-detail-campaign-tab tournament-ops-demo tournament-detail-shared info-forms` → PASS; `git grep -nE "피리어드|롤링|대회 정보 수정|홍보 카드 수정" -- apps/v1_web/src/app/admin/tournaments apps/v1_web/src/components/admin` shows no UI string. **Step 5:** commit `feat(web): 대회 정보 탭을 섹션 요약 카드와 수정 시트로 바꿔요`.

### Task 11: Checks, R-K3, changeset, PR
- [ ] **Step 1:** from `apps/v1_web`: `./node_modules/.bin/tsc --noEmit -p tsconfig.json` (0 errors), `node scripts/v1-pattern-check.mjs` (pass), `./node_modules/.bin/vitest run sequential-save info-sections use-info-edit-param info-forms info-section tournament-period-settings-editor prize-breakdown-editor tie-break tournament-images promo-card league-rules awards-tab tournament-ops-demo tournament-detail` (all green).
- [ ] **Step 2: R-K3 static gate:** `git diff origin/dev...HEAD -U0 -- apps/v1_web/src | grep -nE "border-(l|r)-|inset [0-9]+px 0 0|before:|border-2 border-blue"` → 0 hits in added lines; also `git grep -n "forwardRef\|window.confirm\|transition-all" -- <changed files>` → 0.
- [ ] **Step 3:** `.changeset/admin-tournament-info-sections.md` (`"v1_web": minor`, Korean body: 대회 정보 탭이 섹션 요약 카드와 수정 시트로 바뀌었고, 섹션마다 따로 저장하며 `?edit=` 로 바로 열 수 있어요).
- [ ] **Step 4:** Commit; `gh pr create --repo kim-song-jun/matchup-sports-platform --base dev` (title/body Korean; body notes: UI gallery is posted after merge on alpha, and the measurements in Step 5; mark 「needs head」 items). Verify `gh pr view <N> --repo … --json baseRefName` = `dev`; request Copilot with `gh pr edit <N> --repo … --add-reviewer "@copilot"`; loop until clean.
- [ ] **Step 5 (after dev merge, alpha, ego-browser, one task space, closed with `finish({ keep: [] })`):** on `/admin/tournaments/<id>/info` at 390/768/1440 plus with each sheet open, count elements with `border-left-width ≥ 2px` and a non-grey colour, or `box-shadow` starting `inset … 0 0` → must be 0 (write the number in the PR); check 390: tab row stays pinned while scrolling this tab (M3-1 is L1's shell — report to head if it does not), sheet ≈ 90% height with fixed footer, no horizontal page scroll; deep links `?edit=<each key>`; gallery comment per CLAUDE.md.

## Self-Review
- Spec coverage: six sections + exact fields (T3–T9), C-2 consumer (T3), C-3 owner (T2, T10), Q5 (T5 minMatches, T7 6강), Q7 needs (T2), Q9 sequential save + partial message + fresh version + remaining-only retry (T1, T3, T7), M3-1 (verification only, shell is L1), M3-2 (T10 test), M3-3 (T3 test via `dirty`), old modal + 5 edit patterns removed (T10), format/field locks (T3, T7), PATCH-only-sent-fields assertions (every section task).
- Plan decisions: 6강 방식 lives in 「경기 규칙」; 팀당 최소 경기 수 lives in 「참가」; needs follow Q7 over the mockup; stage rows come from bracket groups (a draft without bracket shows no stage rows, so per-stage times can only be set after the bracket exists); 「취소」 re-implements the dirty confirm; format names defined in `info-sections.ts`.
- **needs head:** (1) L0 `requestClose`/confirm export; (2) L1 sticky tab row (M3-1) and `buildTournamentChecklist` should reuse `tournamentInfoNeeds` so 개요 and 정보 agree; (3) L2 must keep the four period helpers, and both L2 and L3 import `TOURNAMENT_FORMAT_NAMES` from `lib/tournament-format-labels` (L0 C-6); (4) L4 also edits `tournament-detail-shared.tsx` (filters/`ActionButton`); T10 touches only `substitutionPolicyLabel`, a different region.
