# L7 현장 경기 콘솔 (O4 · 큰 기록 버튼 격자 + 상태 한 줄) Implementation Plan

> **상태:** 구현 완료 — PR #2585 로 dev 에 머지됐다. 아래 「Create」로 적힌 파일은 그 PR 이 만든 것이다. 레인 밖 마무리 수정(최종 리뷰·사용자 수정 요청)은 통합 PR #2589.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폰 경기 콘솔의 첫 화면을 「작은 점수·시계 카드 + 상태 한 줄 + 엄지 닿는 2×3 기록 버튼 격자 + 하단 진행 바」로 바꾸고, 기록은 확인 창 없이 저장 + 5초 되돌리기, 진행 명령은 확인 유지로 만든다.

**Architecture:** `operate-console-core.tsx`(2,549줄)는 명령·낙관적 버전·takeover 로직(`handleRunCommand` 등)을 그대로 두고, 화면 조각만 새 파일로 뽑는다 — 상태 판정(`console-status.ts`, 순수 함수), 상태 줄·시트, 점수 카드, 기록 격자, 쉬는 시간 훅. 기록 확정 흐름(`handleCommit`)은 확인 창 대신 토스트 되돌리기(기존 `ops.reverseEvent`)로 바뀐다. 새 API 없음.

**Tech Stack:** React 19, Vitest + Testing Library(폭은 `@/test/viewport` 의 `installViewport`), 기존 `useConfirm`·`ActionSheet`·`BottomSheet`·`writeExpiringDraft`·`useMediaQuery`, Tailwind 토큰(`var(--…)`).

**Spec:** `.github/tasks/20261140-admin-tournament-ux-renovation.md` (L7 · O4 · 2차 결정 표 O4/O4-1/O4-2) · 목업 로컬 목업 `mockups/m7-console/{A,C}.html`(저장소 밖), `notes.md`

## Global Constraints
- 용어(공통 용어표): 홈 · 원정(「어웨이」 금지) / 구장(「필드·경기장·코트」 금지) / 「경기 시간」(전·후반 / 단판) — 사용자에게 보이는 글자에 「피리어드」 금지 / 쉬는 시간(「휴식 시간」 금지) / 결과 처리는 「결과 확정」·「결과 고치기」(「정정」 금지).
- 문구는 해요체, 오류는 `extractErrorMessage(err, '해요체 fallback')`, `window.confirm` 0, `React.forwardRef` 금지, 색·크기는 토큰만, 터치 영역 ≥44px, 아이콘 버튼 `aria-label`.
- **R-K3 한쪽 색 띠 금지**: `border-l*`·한쪽만 두꺼운 색 테두리·`inset Npx 0 0` 그림자·`before:` 띠·`border-2` 색 카드 강조 금지. 상태는 글자+아이콘, 선택은 옅은 배경+1px 테두리.
- **O4-1**: 기록(골·자책골·옐로·레드·파울·교체)은 확인 창 없이 저장 + 5초 「되돌리기」(≥44px). 확인을 남기는 예외는 셋뿐 — 이상한 시계 「기록 시각을 확인해주세요」, 퇴장한 선수 선택, 두 번째 옐로 뒤 「레드도 기록할까요?」.
- **진행 명령**(시작·일시 중지·재개·전반 종료·후반 시작·경기 종료·경기 시작 취소·몰수/중단·승부차기 시작/종료)은 앱 안 확인 유지. 확인 없는 명령은 기존 `revert-period` 하나뿐.
- **계약 불변**(CLAUDE.md 「Alpha 실측 검증 §3」): `handleRunCommand`·`commandGateRef`·`takeOverFromHolder` 의 요청 본문(`expectedVersion`·`clientCommandId`=`Idempotency-Key`·`takeoverToken`·`requestTakeover({force:true})`)은 문구 외 수정 금지. 「계약 시험」의 **요청 본문·토큰·재시도·idempotency 단언은 바꾸거나 약화하지 않는다**(바뀐 화면 문구·버튼 이름·「자세히」 열기만 시험에서 갱신). 계약 시험 = `operate-console-core.test.tsx` 의 「후반 진행 중 조작과 연결 끊김」 describe 전체 + 「경기 종료 확인」 describe 의 idempotency 시험 3개 + `operate-console.period-expiry.test.tsx`.
- 새 주석은 코드가 말 못 하는 제약만, 파일의 기존 언어(한국어), 지점당 ≤3줄. 로컬 next 서버 금지, `prisma generate` 금지, 공유 훅·API 변경 금지.
- 시험 명령(`apps/v1_web` 에서): `./node_modules/.bin/vitest run <경로>` · `./node_modules/.bin/tsc --noEmit -p tsconfig.json` · `node scripts/v1-pattern-check.mjs`.

## Review Focus
1. **되돌리기 경합**: 아직 서버에 확정되지 않은(queued/sending) 기록 · 전송 실패한 기록 · 이미 목록에서 취소했거나 결과가 OFFICIAL 이 된 기록 — 두 번 되돌리거나 거짓 「되돌렸어요」를 말하면 안 된다. (T8)
2. **작은 폰(360×640)**: 격자 마지막 줄이 고정 진행 바·토스트에 가려 닿지 못하면 안 된다(스크롤로 닿는다). (T9 하단 여백, T13 alpha 실측)
3. **연결이 끊긴 채 기록**하면 서버에 아직 없으므로 「기록했어요」+서버 되돌리기를 약속하지 않는다. `submitEvent` 가 null(권한·스냅샷 없음)이면 조용히 끝나지 않고 알린다. (T8)
4. **한 팀 명단 0명 / 초안뿐 / 14명 이상**: 「익명으로만」 모순 문구가 어디에도 없고, 선수 시트가 화면 높이 안에서 스크롤된다. (T6·T9)
5. **쉬는 시간**: 하프타임 중 새로고침해도 남은 시간이 이어지고 「끝내기」 한 구간은 다시 자동 시작하지 않으며, localStorage 가 막혀도(프라이빗 모드) 죽지 않는다. (T2·T10)

## File Structure
경로는 `apps/v1_web/src/` 기준.
| 파일 | 일 | 작업 |
|---|---|---|
| `shared/game-operations/console-status.ts` (+test) | 배너 15조건 → 우선순위 목록 + 한 줄 헤드라인(순수) | Create |
| `shared/game-operations/console-status-panel.tsx` (+test) | 상태 줄 + 「자세히」 시트 | Create |
| `shared/game-operations/console-score-card.tsx` (+test) | 점수·팀 파울·상태·시계 카드(옛 `<header>`+`TeamFoulCounterBar`) | Create |
| `shared/game-operations/record-grid.tsx` (+test) | 2×3 기록 버튼 | Create |
| `shared/game-operations/rest-timer.tsx` (+test) | `useRestTimer`·`RestTimerCard`·`RestTimerPresets`(옛 `RestTimer` 대체) | Rewrite |
| `shared/game-operations/event-toast.tsx`, `abnormal-end-dialog.tsx` (+tests) | 44px 버튼·설명 줄 / 화면 높이 안 | Modify |
| `shared/game-operations/lineup-grid.tsx`, `action-target-picker.tsx`, `recorded-event-list.tsx`, `confirm-copy.ts`, `period-label.ts`, `index.ts` (+tests) | 두 팀 한 시트·선수 모름·`maxRows`·토스트 문구·용어·export | Modify |
| `shared/game-operations/operate-console-core.tsx` (+test 2,897줄) | 조립·기록 흐름·더보기·takeover 문구 | Modify |
| `components/tournament-live/operate/operate-console.tsx`, `console-next-steps.tsx`, `penalty-shootout-panel.tsx` (+tests) | prop 정리·용어·주석 | Modify |
| `components/tournament-result-review/console-result-card.tsx`(+new test), `game-result-review-panel.test.tsx` console 블록 단언 3줄 | 결과 확정 카드 용어·경고 한 곳 | Modify (L6 패널 파일은 수정 금지) |
| `components/team-matches/team-match-operate-console.tsx`, `components/tournament-ops-demo/field-console-demo.tsx`, `field-console-guide.tsx` | `showEmptyRosterNotice` prop 한 줄 제거, 체험 안내 문구 | Modify (소유 밖 최소 수정) |
| `team-foul-counter-bar.tsx`, `matchup-title.tsx`(각 +test), `lib/find-recent-goal-event.ts`(+test), `lib/find-recent-substitution-event.ts`, `lib/match-progress-steps.ts` 의 `periodProgressSteps` | 쓰는 곳이 사라지면 같은 변경에서 삭제 | Delete |

**배너 19조건 → 처리표**(스펙은 18 이라 적었으나 코드 `operate-console-core.tsx:2045-2173` 에는 19). 번호 = 우선순위(작을수록 먼저). 상태 줄에는 가장 앞선 항목의 제목 + (2개 이상이면) ` 외 N개`.
| # | key | 원래 조건 | tone | 비고 |
|---|---|---|---|---|
|1|`takeover-handoff`|다른 기기가 기록 중(`TAKEOVER_HELD`/`SUPERSEDED`)|warning|버튼 「이 기기에서 기록하기」|
|2|`takeover-denied`|그 밖의 takeover 거부 코드|danger||
|3|`read-only`|`leaseRequired && !takeoverEnabled`|info||
|4|`command-error`|`commandError`|danger||
|5|`command-retry`|`pendingCommandRetry`|danger|버튼 「같은 요청 재시도」|
|6|`banner-message`|`ops.bannerMessage`|danger||
|7|`expiry-error`|`periodRefreshNeeded && periodExpiryError`|danger|버튼 「종료 상태 다시 확인」|
|8|`disconnected`|끊김 2조건(lease/비lease) 합침|warning|본문 4변형, 보낼 기록이 있으면 제목에 ` · 기록 N개 보낼 차례`|
|9|`queue`|(신규) `hasUnsettledQueueItems` — 연결 중일 때만 따로|실패 있으면 danger 아니면 info|시트 본문에 기존 `QueueStatusPanel`|
|10|`takeover-expired`|`status==='expired'`|warning||
|11|`takeover-pending`|`none/requesting`|info||
|12|`period-expired`|`periodExpired`|warning||
|13|`start-blocked-teams`|`SCHEDULED && startBlockedByTeams`|warning||
|14|`sync-gap`|`sync.status==='gap'`|info||
|15|`behind`|`gameDetailBehind`|info||
|이동|하프타임 안내 · 정규 시간 종료 안내(승부차기/결과 제출 링크/경기 종료 3변형) · 「경기를 시작해 주세요」|점수 카드의 **단계 문구**로 — 상태 줄에 넣지 않는다||
|삭제|「출전 명단이 없어 익명으로만 기록」|명단 단일 출처(T6·T9) — 시트의 「출전 명단」 줄과 선수 시트의 「선수 모름」으로만 드러난다||

## Task 1: 토스트 — 44px 버튼 · 설명 줄
**Files:** Modify `shared/game-operations/event-toast.tsx` · Test `event-toast.test.tsx`
**Interfaces:** Produces `showToast(message: string, opts?: { action?: EventToastAction; description?: string }): void`. 액션 버튼 `min-h-[44px] min-w-[44px]`, 설명은 메시지 아래 `text-[length:var(--font-size-caption)]` 한 줄. 자동 닫힘 5초·`aboveBottomBar` 위치 유지.
- [ ] **Step 1: 실패 시험** — `'액션 버튼은 44px 이상 터치 영역이다'`(`toHaveClass('min-h-[44px]','min-w-[44px]')`), `'description 이 있으면 메시지 아래에 함께 보인다'`, `'5초 뒤 사라지고 그 뒤에는 액션 버튼이 없다'`(fake timers 5000+150). 기존 2개 시험 유지.
- [ ] **Step 2:** `vitest run src/shared/game-operations/event-toast.test.tsx` → FAIL. **Step 3:** 구현. **Step 4:** PASS. **Step 5:** 커밋 `feat: 콘솔 토스트 버튼을 44px로 키우고 설명 줄을 더한다`.

## Task 2: 쉬는 시간 — 훅·하프타임 카드·프리셋
**Files:** Rewrite `shared/game-operations/rest-timer.tsx` · Test `rest-timer.test.tsx` · Modify `index.ts`(`RestTimer` export → 아래 셋)
**Interfaces:**
```ts
export type RestTimerState = { kind: 'idle' } | { kind: 'running'; totalMs: number; endAtMs: number } | { kind: 'finished' };
export interface RestTimerApi { state: RestTimerState; remainingMs: number; lastMinutes: number;
  start(minutes: number, scope: string): void; addMinute(): void; end(): void }
export function useRestTimer(opts: { storageKey: string | null; autoStart: { scope: string } | null }): RestTimerApi;
export function RestTimerCard({ api }: { api: RestTimerApi }): JSX.Element;       // 하프타임 큰 카드
export function RestTimerPresets({ api, onStarted }: { api: RestTimerApi; onStarted?: () => void }): JSX.Element; // 1·2·5·10·15·20분 칩
```
- 저장: `writeExpiringDraft(storageKey, { scope, totalMs, endAtMs, dismissed })`, 마지막 길이는 키 `teameet.v1.restTimer.lastMinutes`(기본 10분).
- `autoStart.scope` 가 새로 생기고 같은 scope 기록이 없으면 `lastMinutes` 로 시작. scope 가 `null` 이 되면 `halftime:` 기록을 지운다. `end()` 는 `dismissed:true` 로 남겨 같은 scope 를 다시 시작하지 않는다. 끝나면(`finished`) `role="alert"` 「쉬는 시간이 끝났어요」+「확인」, 테두리 1px(옛 `border-2` 색 테두리 제거).
- 카드 문구: `쉬는 시간 {n}분`(누르면 길이 칩 펼침) · `{mm:ss} 남았어요` · 「1분 추가」「쉬는 시간 끝내기」. 「화면을 새로고침하면 초기화돼요」는 삭제(저장되므로).
- [ ] **Step 1: 실패 시험**(`renderHook`+fake timers) — `'autoStart 범위가 생기면 입력 없이 10분으로 시작한다'` · `'마지막에 고른 길이(5분)를 다음 자동 시작에 쓴다'` · `'재마운트해도 같은 범위는 남은 시간을 이어 가고, 끝내기 한 범위는 다시 시작하지 않는다'` · `'범위가 null 이 되면 하프타임 기록을 지운다'` · `'addMinute 은 정확히 60초를 더한다'` · `'Storage.setItem 이 throw 해도 타이머는 메모리로 돈다'`(브라우저 API 스텁은 허용). 컴포넌트: `'카드에 「1분 추가」「쉬는 시간 끝내기」가 있고 새로고침 안내 문구는 없다'` · `'프리셋은 1·2·5·10·15·20분 여섯 개'` · `'끝나면 alert 가 확인 전까지 남는다'`.
- [ ] **Step 2–4:** FAIL → 구현(옛 컴포넌트의 250ms 틱·`formatCountdown` 재사용) → PASS. **Step 5:** 커밋 `feat: 쉬는 시간을 훅으로 뽑고 새로고침해도 이어지게 한다`.

## Task 3: 몰수·중단 창 — 화면 높이 안
**Files:** Modify `shared/game-operations/abnormal-end-dialog.tsx` · Test `abnormal-end-dialog.test.tsx`
**Interfaces:** props 불변. 패널 `style={{ maxHeight: 'calc(100dvh - 48px)' }}` + `flex flex-col`: 제목 고정 / 본문(종료 종류·기권 팀·사유) `min-h-0 overflow-y-auto` / 버튼 줄 고정. 제목 「몰수·중단으로 끝내기」, 확정 버튼 「이대로 끝내기」(기존 「종료」→「끝내기」).
- [ ] **Step 1: 실패 시험** — `'패널 최대 높이는 100dvh − 48px 이다'`(`dialog.style.maxHeight`), `'사유 입력칸은 스크롤 영역 안, 취소·이대로 끝내기 버튼은 스크롤 영역 밖이다'`(`textarea.closest('[class*="overflow-y-auto"]')` 가 두 버튼을 포함하지 않음). 기존 시험의 「이대로 종료」→「이대로 끝내기」.
- [ ] **Step 2–5:** FAIL → 구현 → PASS → 커밋 `fix: 몰수·중단 창이 화면 높이를 넘지 않게 한다`. (실제 390×560 확인은 T13 alpha.)

## Task 4: 상태 판정 + 상태 줄·「자세히」 시트
**Files:** Create `shared/game-operations/console-status.ts`, `console-status-panel.tsx` · Test `console-status.test.ts`, `console-status-panel.test.tsx`
**Interfaces:**
```ts
export type ConsoleStatusKey = 'takeover-handoff'|'takeover-denied'|'read-only'|'command-error'|'command-retry'|'banner-message'|'expiry-error'|'disconnected'|'queue'|'takeover-expired'|'takeover-pending'|'period-expired'|'start-blocked-teams'|'sync-gap'|'behind';
export interface ConsoleStatusItem { key: ConsoleStatusKey; tone: 'info'|'warning'|'danger'; title: string; body: string;
  action?: { kind: 'takeover'|'retry-command'|'retry-expiry'; label: string } }
export interface ConsoleStatus { tone: 'ok'|'info'|'warning'|'danger'; headline: string; items: readonly ConsoleStatusItem[] }
export interface ConsoleStatusInput { gameState: GameState|null; leaseRequired: boolean; takeoverEnabled: boolean; sampleMode: boolean;
  takeover: TakeoverState; handoff: { code: string; holderName?: string|null } | null; connection: 'connecting'|'connected'|'disconnected';
  offlineCommandAllowed: boolean; canOperate: boolean; syncGap: boolean; behind: boolean; periodExpired: boolean; expiryError: string|null;
  startBlockedByTeams: boolean; commandError: string|null; bannerMessage: string|null; retryLabel: string|null;
  queue: { waiting: number; failed: number }; endPeriodLabel: string; gameOperationsErrorMessage: (code: string) => string }
export function deriveConsoleStatus(input: ConsoleStatusInput): ConsoleStatus;
export interface RosterRow { sideId: string; label: string; count: number }   // label = 「홈 · 팀명」
export function ConsoleStatusPanel(props: { status: ConsoleStatus; roster: readonly RosterRow[] | null;
  queue: { items: readonly QueuedGameEvent[]; onRetry(id: string): void; disabled: boolean; isRetryableError(code: string, reason?: string|null): boolean };
  actions: { takeover(): void; retryCommand(): void; retryExpiry(): void }; actionsDisabled: boolean }): JSX.Element;
```
**정상 줄 문구:** `연결됨`, 앞에 lease 보유+`SCHEDULED` → `이 기기에서 기록할 수 있어요 · ` / lease 보유+`LIVE`·`PAUSED` → `이 기기에서 기록 중 · `. `sampleMode` 는 `체험 중 · 서버 연결 없음`.
**항목 문구(제목 / 본문)** — 기존 문구에서 「운영 권한」→「기록 권한」, 「피리어드」→「경기 시간」:
- handoff: `다른 기기에서 기록하고 있어요` / `{이름}님이 이 경기를 기록하고 있어요. 이 기기는 보기만 할 수 있어요.`(이름 없으면 `다른 기기에서 기록하고 있어요. …`, `SUPERSEDED` 는 `{이름}님이 기록 권한을 가져갔어요. 이 기기는 보기만 할 수 있어요.`)
- denied: `이 기기에서 기록할 수 없어요` / `{gameOperationsErrorMessage(code)} ({code})` · read-only: `보기만 할 수 있어요` / `지원 담당자는 이 경기의 기록을 볼 수만 있어요.`
- command-error: `요청을 처리하지 못했어요` / 메시지 · command-retry: `{label} 요청의 응답을 받지 못했어요` / `같은 요청을 다시 보낼 수 있어요.` · banner-message: `기록을 확인해 주세요` / 메시지 · expiry-error: `경기 진행 상태를 확인하지 못했어요` / 메시지
- disconnected: `연결이 끊겼어요`(+` · 기록 N개 보낼 차례`) / 비lease `실시간 연결이 끊겼어요. 진행 요청은 서버에 직접 보내고, 기록은 다시 연결되면 전송돼요.` · lease 이고 `!offlineCommandAllowed` `다시 연결하는 중이에요. 연결될 때까지 재개·종료 같은 진행 버튼은 잠겨요. 그동안 적는 기록은 이 기기에 모아 두었다가 보내요.` · lease+offline 허용+`canOperate` `다시 연결하는 중이에요. 진행 버튼은 그대로 쓸 수 있고, 보낸 명령은 서버 기준으로 반영돼요.` · lease+offline 허용+`!canOperate` `연결이 끊긴 사이 기록 권한이 만료돼 진행 명령을 보낼 수 없어요. 다시 연결되면 권한을 새로 받아요.`
- queue: `기록 N개 보내는 중이에요` / 실패 `기록 N개를 보내지 못했어요` · expired: `기록 권한을 다시 가져오는 중이에요…` · pending: `이 기기에서 기록할 준비를 하는 중이에요…`
- period-expired: `설정된 시간이 끝났어요` / `서버의 시간 종료 처리를 확인하고 있어요. 처리가 늦어지면 ‘{endPeriodLabel}’를 눌러 주세요.` · start-blocked: `팀을 먼저 정해 주세요` / `대진표에서 서로 다른 두 팀을 배정한 뒤 경기를 시작해 주세요.` · sync-gap: `기록을 다시 불러오는 중이에요…` · behind: `최신 경기 상태를 확인하고 있어요`
**시트:** 제목 `경기 상태`, 소제목 `지금 확인할 것 {N}개`, 고정 줄 `연결` · `기록하는 기기`(`이 기기`/`다른 기기`) · `출전 명단`(`홈 7명 · 원정 7명`, 0명 팀은 `{팀} 0명 · 선수 모름으로만 기록할 수 있어요`; `roster===null`(킥오프 전)이면 줄을 그리지 않는다 — 그때는 킥오프 준비 패널이 명단이다). 「자세히」 ≥44px, 줄 `role="status"`(danger 는 `alert`), 한쪽 색 띠 없는 전폭 둥근 상자. **1번 항목에 `action` 이 있으면 그 버튼을 줄 안 둘째 줄(「자세히」 옆)에 직접 둔다** — 시트를 열게 하지 않는다(목업 C 의 약점 보완).
- [ ] **Step 1: 실패 시험(순수)** — `it.each` 15행: 조건 하나만 켜면 `items[0].key` 가 처리표의 key, tone·제목이 위 문구. `'여러 조건이 겹치면 번호가 작은 항목이 제목이고 ` 외 N개`가 붙는다'`(behind+disconnected+command-error → `command-error` 제목 + ` 외 2개`) · `'끊김+보낼 기록 2개면 제목이 「연결이 끊겼어요 · 기록 2개 보낼 차례」이고 queue 항목은 따로 세지 않는다'` · `'끊김 본문 4변형'` · `'조건이 없으면 tone ok 와 정상 줄 문구 4종'`.
- [ ] **Step 2: 실패 시험(컴포넌트)** — `'자세히를 누르면 시트에 항목 전부와 고정 줄이 보인다'` · `'1번 항목의 action 버튼은 시트를 열지 않고도 줄 안에서 해당 콜백을 부른다'`(3종) · `'queue 항목 시트에 전송 실패 줄과 「다시 시도」'` · `'roster 가 null 이면 출전 명단 줄이 없고, 0명 팀 문구가 보인다'` · `'정상일 때도 자세히가 열린다'`.
- [ ] **Step 3–5:** FAIL → 구현(시트는 `BottomSheet` `onClose` 형, 내부 스크롤) → PASS → 커밋 `feat: 콘솔 안내 배너를 상태 한 줄과 자세히 시트로 모은다`.

## Task 5: 점수 카드
**Files:** Create `shared/game-operations/console-score-card.tsx` · Test `console-score-card.test.tsx` · Delete `team-foul-counter-bar.tsx`+test(단언은 카드 시험으로 이전), `matchup-title.tsx`+test(팀 열이 대신함) · Modify `index.ts`
**Interfaces:**
```ts
export function ConsoleScoreCard(props: { sides: readonly GameSide[]; scoreBySideId: ReadonlyMap<string, number>; foulCounts: Record<string, number>;
  foulThreshold: number; foulPeriodLabel: string; foulResetNote: string | null; stateLabel: string; clock: ReactNode; penaltyChip: ReactNode | null;
  caption: ReactNode | null; footer: ReactNode | null; stickyClass: string }): JSX.Element;
```
- 옛 `<header data-console-guide="overview">`의 점수 블록을 **그대로 옮긴다**: 한 텍스트 노드 `2 : 1`, `aria-label="스코어 …"`, 팀 색 점은 양옆 바깥.
- 팀 열 = `홈`/`원정` 글자 + 팀명 + `팀 파울 N`(임계값 이상이면 경고 아이콘+글자 「다음부터 10m 프리킥」). 아래 한 줄 = 상태 칩 + 시계(+승부차기 칩). `foulResetNote`(「후반에는 0부터 다시 세요」)는 `caption`. `footer` = 비lease 호스트의 「결과 보내기」 링크. `stickyClass` = 기존 `headerTopClass` 로 `sticky z-10` 유지.
- 진행 단계 스트립은 LIVE/PAUSED 에서 그리지 않는다(상태 칩이 대신함).
- [ ] **Step 1: 실패 시험** — `'점수는 한 텍스트 노드 「2 : 1」이고 aria-label 에 팀별 점수가 있다'` · `'팀 열에 홈·원정 글자와 팀 파울이 있다'` · `'파울이 기준에 이르면 아이콘+「다음부터 10m 프리킥」, 미만이면 없다'`(양방향) · 옛 막대 시험 이전: `'단판이면 「경기 팀 파울」'`·`'다음 경기 시간이 있으면 재시작 안내'` · `'연결 상태 글자는 카드에 없다'`.
- [ ] **Step 2–5:** FAIL → 구현 → PASS → 커밋 `feat: 콘솔 머리를 점수 카드 하나로 합친다`.

## Task 6: 선수 시트 — 두 팀 한 화면 · 선수 모름 · 명단 단일 출처
**Files:** Modify `shared/game-operations/lineup-grid.tsx`, `action-target-picker.tsx`, `operate-console-core.tsx`(`teammatesForSide` 만) · Test `lineup-grid.test.tsx`, `action-target-picker.test.tsx`, `operate-console-teammates-for-side.test.ts`
**Interfaces:**
```ts
export function rosterForSide(lineups: readonly GameLineup[], sideId: string): readonly GameLineupParticipant[]; // = latestLineupForDisplay(...)?.participants ?? []
LineupGridProps += { layout?: 'tabs' | 'columns'; renderSideFooter?: (side: GameSide) => ReactNode }  // 기본 'tabs'(교체 단계 등 기존 동작 불변)
```
- **단일 출처 규칙:** 「기록할 수 있는 사람」 = `rosterForSide`. `LineupGrid`·`teammatesForSide`·상태 시트 `RosterRow.count`(T9)가 모두 이 함수만 쓴다 — 이벤트가 붙는 `participantId` 는 라인업 참가자 id 뿐이고, 대회·리그 라인업은 서버가 참가 명단(Task 179)에서 동기화한 제출본이다. 킥오프 전에는 킥오프 패널(경기 명단 조정)이 명단이므로 상태 시트에 명단 줄을 두지 않는다.
- `columns`: 탭 없이 `grid-cols-2`, 팀 제목 `홈 · {팀명}`/`원정 · {팀명}`, 줄 `min-h-12`(번호 배지+이름 한 줄 말줄임), 검색칸은 어느 한 팀이 8명 초과일 때만.
- 피커는 비교체 액션에 `columns` 를 쓰고 팀 열 끝에 「선수 모름」(`allowTeamOnly` 인 GOAL·FOUL; `aria-label="{팀명} · 선수 모름"`; OWN_GOAL 은 기존 `… 자책골 · {상대} 득점으로 기록` 유지)을 `renderSideFooter` 로 넣는다.
- 제목: `골 · 누가 넣었나요?` / `자책골 · 누구의 자책골인가요?` / `옐로카드·레드카드 · 누가 받았나요?` / `파울 · 누가 했나요?`(교체는 기존). 캡션 `{전반 }12:31로 기록돼요 · 누르면 바로 저장돼요`(교체 1단계는 앞부분만). 시트 `max-h-[calc(100dvh-48px)]` 안에서 본문 스크롤.
- [ ] **Step 1: 실패 시험** — `rosterForSide`: 제출본 우선·초안만 있으면 초안·`invalidatedAt` 있는 명단 무시·사이드 없음 `[]`. 그리드: `'columns 는 탭 없이 두 팀 제목과 선수를 한 화면에 그린다'` · `'검색칸은 한 팀이 9명일 때만'` · `'renderSideFooter 가 팀마다 호출된다'`. 피커: `'GOAL 은 선수를 누르면 확인 없이 onCommit 한 번'` · `'선수 모름은 payload.anonymous=true'` · `'CARD 에는 선수 모름이 없다'` · `'퇴장한 선수는 여전히 확인 패널이 먼저'` · 제목·캡션 문구.
- [ ] **Step 2–5:** FAIL → 구현 → PASS → 커밋 `feat: 선수 시트에 두 팀을 나란히 놓고 명단 출처를 하나로 모은다`.

## Task 7: 기록 격자 + 최근 기록 줄 수 제한
**Files:** Create `shared/game-operations/record-grid.tsx` · Modify `recorded-event-list.tsx`(`maxRows`) · Test `record-grid.test.tsx`, `recorded-event-list.test.tsx`
**Interfaces:**
```ts
export type RecordCellKey = 'GOAL'|'OWN_GOAL'|'YELLOW'|'RED'|'FOUL'|'SUBSTITUTION'|'MORE';
export function RecordGrid(props: { cells: readonly { key: RecordCellKey; label: string; disabled?: boolean }[]; onSelect: (key: RecordCellKey) => void }): JSX.Element;
RecordedEventList props += { maxRows?: number }   // newest-first 일 때 위에서 N줄(합친 경고 누적 퇴장 줄은 1줄로 센다)
```
격자 `role="group" aria-label="기록하기"`, `data-console-guide="events"`, `grid-cols-2 sm:grid-cols-6 gap-2`, 칸 `h-[68px]`·1px 테두리·아이콘(골·자책골 `Goal`, 파울 `AlertTriangle`, 교체 `ArrowLeftRight`, 카드 색 견본, 더보기 `Ellipsis`)+글자.
- [ ] **Step 1: 실패 시험** — `'칸마다 이름 있는 버튼이고 누르면 key 로 onSelect'` · `'disabled 칸은 눌리지 않고 나머지는 눌린다'` · 목록: `'maxRows=4 이면 최신 4줄만, 생략하면 전부'` · `'합친 경고 누적 퇴장 줄은 한 줄로 센다'`.
- [ ] **Step 2–5:** FAIL → 구현 → PASS → 커밋 `feat: 큰 기록 버튼 격자를 만든다`.

## Task 8: 기록 흐름 — 확인 없이 저장 + 5초 되돌리기
**Files:** Modify `operate-console-core.tsx`(`handleCommit` 주변), `confirm-copy.ts`, `penalty-shootout-panel.tsx`(주석) · Test `operate-console-core.test.tsx`, `confirm-copy.test.ts` · Delete `lib/find-recent-goal-event.ts`+test, `lib/find-recent-substitution-event.ts`(쓰는 곳 없음 — 삭제 전 `git grep` 확인)
**Interfaces:**
```ts
// confirm-copy.ts — commitActionConfirmCopy 는 시계 경고 분기만 남으므로 이름을 바꾼다
export function clockCheckConfirmCopy(input, sides, lineups, clockWarningPeriodMinutes: number, periodCount?: number | null): ConfirmCopy; // 문구 유지, 「이 피리어드는」→「이 경기 시간은」
export function recordedToastCopy(input, sides, lineups): { message: string };   // `{골} · {팀} · {선수} 기록했어요`, 팀만이면 `… (선수 모름) 기록했어요`
```
`handleCommit(input)` 순서:
1. 선택 시트를 닫는다.
2. 시계가 수상하면 `clockCheckConfirmCopy` 확인(취소하면 제출 안 함).
3. `submitEvent` — 반환이 `null` 이면 `setCommandError('기록을 저장하지 못했어요. 연결과 기록 권한을 확인한 뒤 다시 눌러 주세요.')` 후 종료.
4. 두 번째 옐로면 기존 `secondYellowConfirmCopy` 확인 → 「레드도 기록」이면 옐로 확정 대기(`waitForEventSettled`) 후 레드 제출.
5. 토스트 — 연결 중: `showToast(message, { description: '잘못 눌렀으면 5초 안에 되돌려요', action: { label: '되돌리기', onClick: () => void undoRecord(ids, noun) } })`. 끊김: 액션 없이 `{골} · … 이 기기에 기록해 뒀어요` + 설명 `연결되면 보내요`. 「어시스트 추가」 토스트 액션은 삭제(기록 줄의 「어시스트」 버튼이 대신한다).

`undoRecord(clientEventIds: readonly string[], noun: string): Promise<void>` — **뒤에서부터** 하나씩:
- `liveEventsRef` 에서 `clientEventId` 로 서버 이벤트를 찾는다. 없으면 큐 항목 상태를 본다: queued/sending → 기존 대기 장치로 확정까지 기다린 뒤 `liveEvents` 반영까지 최대 3초, failed/없음 → 중단.
- 찾으면 기존 되돌리기 명령 `ops.reverseEvent({ eventId, reason: '{noun} 기록 되돌리기' })`(POST `/games/:gameId/events/:eventId/reverse`, 새 API 아님). 확인 창 없음.
- 실패(권한·`RESULT_ALREADY_OFFICIAL` 등)는 `setCommandError(extractErrorMessage(err, '기록을 되돌리지 못했어요. 기록 목록의 「수정·취소」에서 취소해 주세요.'))`, 성공은 `showToast('되돌렸어요')`.

**주석 수정(전부):** core ~420·~1028·~1288·~1528 + `confirm-copy.ts` 머리말(4–12)·211·286 + `penalty-shootout-panel.tsx` ~306 의 「예외 없이 전부/모든 액션에 확인」 서술을 한 문장으로 교체 — 「기록은 확인 없이 저장하고 5초 되돌리기로 복구한다(2026-11 사용자 결정이 2026-08 「예외 없이 전부」를 대체). 진행 명령·승부차기 시작·종료는 확인을 거친다.」
- [ ] **Step 1: 실패 시험**(기존 확인 클릭 시험을 이것으로 교체) — `'골: 선수를 고르면 확인 창 없이 submitEvent 가 한 번 불리고 되돌리기 토스트가 뜬다'`(dialog 없음, 되돌리기 버튼 `min-h-[44px]`) · `'되돌리기는 서버 이벤트 id 로 reverseEvent 를 확인 없이 부른다'`(`submitEvent`→`'c1'`, liveEvents 에 `{id:'e9', clientEventId:'c1'}`) · `'아직 큐에 있는 기록은 확정을 기다렸다가 되돌린다'` · `'전송 실패한 기록은 reverseEvent 를 부르지 않고 이유를 알린다'` · `'reverseEvent 가 거절되면 오류를 알리고 「되돌렸어요」는 없다'` · `'5초 뒤 토스트가 사라진다'` · `'끊긴 연결이면 되돌리기 없이 「이 기기에 기록해 뒀어요」'` · `'submitEvent 가 null 이면 오류를 알린다'` · `'선수 모름 골은 anonymous 로 저장되고 토스트에 선수 모름'` · `'두 번째 옐로: 옐로는 바로 저장, 레드 확인만 뜨고, 레드까지 기록하면 되돌리기는 레드 → 옐로 순서'` · `'시계가 수상하면 확인을 거치고 취소하면 제출 안 됨'`(기존 유지) · `'하프타임 기록은 전반 끝 시각(20:00)'`(기존 유지) · `'교체도 확인 없이 저장'`. `confirm-copy.test.ts`: 일반 분기 시험 삭제, `recordedToastCopy` 시험.
- [ ] **Step 2–4:** FAIL → 구현 → `vitest run src/shared/game-operations` PASS(계약 시험 단언 불변). **Step 5:** 커밋 `feat: 콘솔 기록은 확인 없이 저장하고 5초 되돌리기를 준다`.

## Task 9: 코어 조립 — 점수 카드·상태 줄·격자·진행 바·더보기
**Files:** Modify `operate-console-core.tsx`, `operate-console.tsx`, `team-match-operate-console.tsx`, `field-console-demo.tsx` · Test `operate-console-core.test.tsx`, `operate-console.period-expiry.test.tsx`, `operate-console-penalty-integration.test.tsx`(문구·버튼 이름·「자세히」 열기 갱신만), `team-match-operate-console-*.test.tsx`, `field-console-demo.test.tsx`
**Interfaces:** `OperateConsoleCoreProps` 에서 `showEmptyRosterNotice` 삭제(세 호스트·시험 하네스에서 한 줄씩). 나머지 prop 불변. `data-console-guide` 4개(`overview`·`commands`·`events`·`history`)는 새 요소에 그대로 붙인다(체험 안내가 쓴다).

**DOM 순서(= 폰 순서):**
1. 점수 카드(sticky) → `RedCardPenaltyBanner` → `ConsoleStatusPanel`
2. 단계 문구는 카드 `caption`(하프타임 · 정규 시간 종료 3변형 · `경기를 시작해 주세요.`). 하프타임에는 `RestTimerCard`(T10)
3. 최근 기록: 진행 중에만 `maxRows=4` + 「기록 N개 전체 보기」, `useMediaQuery('(min-width: 1024px)')` 이거나 ENDED 면 전부(오른쪽 열). 목록 렌더를 `renderEventList(maxRows?)` 하나로 뽑아 전체 보기 시트와 공유
4. `RecordGrid`(진행 중에만, `mt-auto`; 여섯째 「더보기」 칸은 기록 게이트에 걸리지 않고 진행 중이면 늘 눌린다)
5. 킥오프 패널(SCHEDULED) → 결과 확정 카드(ENDED)
- 본문 아래 여백 = 진행 바 높이 + 12px. lg 의 2열 grid·`contents` 구조 유지(최근 기록은 `lg:col-start-2`).
- 삭제: 「전송 대기·실패」 섹션 · `TeamFoulCounterBar` · 헤더 안 진행 바. 진행 단계 스트립은 ENDED 에서만 `resultProgressSteps` 로 카드 `caption` 자리에 남기고 `periodProgressSteps`(와 시험)는 삭제.

**진행 바(<sm 고정 하단, sm+ 정적):** LIVE `일시 중지`+`{전반} 종료` / PAUSED `재개` / 하프타임 `후반 시작` / 정규 시간 종료 `경기 종료`(동점 결선 `승부차기 시작`) / SCHEDULED `경기 시작`. 비교체 종목은 `⋯` 없음. **교체 추적 종목은 격자 여섯째 칸이 「교체」이고 진행 바 오른쪽에 `⋯`(aria-label 「더보기」, 44px)**, 격자 여섯째 칸 「더보기」는 비교체 종목만.

**더보기 시트(`ActionSheet` 제목 「더보기」):**
- `쉬는 시간 재기` — `부상·작전 시간처럼 잠깐 멈출 때`(진행 중, 하프타임 제외; T10)
- `기록 전체 보기·고치기` — `시각 고치기, 기록 취소`(전체 기록 `BottomSheet`)
- `{전반} 종료 되돌리기`(하프타임, 확인 없음 — 기존 `revert-period`)
- 묶음 「되돌리기 어려운 동작」(`destructive`): `경기 일찍 끝내기` — `정규 시간 전에 마쳐요 · 되돌릴 수 없어요` · `몰수·중단으로 끝내기` — `사유를 남기고 마쳐요` · `경기 시작 취소` — `적은 기록을 지우고 시작 전으로`(`leaseRequired && canOperate && matchInPlay && !sampleMode`; 확인은 T10). 항목별 `disabled`/`disabledReason` 규칙은 기존 그대로.

**takeover 문구(요청 본문 불변):** 버튼 `이 기기에서 기록하기`; 확인 `title: '이 기기에서 기록할까요?'`, `message: '{이름님의|다른} 기기는 보기만 할 수 있게 돼요. 같은 경기를 두 곳에서 기록하지 않도록 먼저 확인해 주세요.'`, `confirmLabel: '이 기기에서 기록하기'`. 안내·오류 문구의 「운영 권한」은 「기록 권한」(`commandGateFailureMessage` 3곳 포함, 로직 불변).

**명단 단일 출처:** `sidesWithoutCurrentPlayers`·`hasEmptyRoster` 삭제. `RosterRow[]` = `sides.map(side => rosterForSide(lineups, side.id).length)`, 킥오프 전(`gameState==='SCHEDULED'`)은 `null`.
- [ ] **Step 1: 실패 시험**(기존 배너 시험을 이것으로 교체)
  - 진행 명령: `it.each(['start','pause','resume','end-period','start-period','end'])` `'{명령}은 확인 창을 거치고, 확인 전에는 sendCommand 가 0회'`(확인하면 1회).
  - 첫 화면: `'기록 격자는 골·자책골·옐로카드·레드카드·파울·더보기 여섯 개(풋살)'` · `'교체 추적 종목은 격자에 교체가 있고 더보기는 진행 바 ⋯ 로 간다'` · `'진행 바: LIVE 는 일시 중지·전반 종료 둘뿐, PAUSED 재개, 하프타임 후반 시작, 단판은 정규 시간 종료'` · `'진행 중 첫 화면에 쉬는 시간 칩·프리셋이 없다'` · `'더보기 시트 항목과 위험 묶음, 시작 취소는 sampleMode·읽기 전용에서 없음'`(없어진 것 + 닿는 것 양방향) · `'최근 기록 4줄과 전체 보기, 1280 폭에서는 전부'`(`installViewport`) · `'DOM 순서: 최근 기록 → 기록 격자'`.
  - 상태: `'조건 셋이 겹쳐도 상태 요소는 하나이고 자세히에 셋이 모두 있다'` · `'takeover: 「이 기기에서 기록하기」→ 확인 → requestTakeover({force:true}), 「운영 권한」 글자는 화면 어디에도 없다'`.
  - 명단: `'홈 3명·원정 0명이면 시트에 「홈 3명 · 원정 0명…」, 골 시트에는 홈 3줄과 두 팀의 선수 모름만, 「익명으로만」은 어디에도 없다'` · `'SCHEDULED 에는 시트에 출전 명단 줄이 없다'`.
  - 단계 문구 4종(비lease 호스트는 「결과 제출 화면 열기」 링크).
  - 기존 시험 문구 갱신: 연결 상태(`실시간 연결됨`→정상 줄), takeover 문구, 시트 「경기 종료」→「경기 일찍 끝내기」, 진행 단계 스트립 describe(LIVE 삭제·ENDED 유지).
- [ ] **Step 2–4:** FAIL → 구현 → 코어·팀매치 어댑터·체험 시험 PASS. **Step 5:** 커밋 `feat: 경기 콘솔 첫 화면을 점수 카드와 큰 기록 버튼으로 바꾼다`.

## Task 10: 쉬는 시간 배선 · 경기 시작 취소를 앱 확인으로
**Files:** Modify `operate-console-core.tsx`, `components/tournament-ops-demo/field-console-guide.tsx`(안내 문구) · Test `operate-console-core.test.tsx`
**Interfaces:**
- 코어: `const rest = useRestTimer({ storageKey: gameId ? \`teameet.v1.restTimer:${gameId}\` : null, autoStart: halftimePeriod !== null && gameState === 'LIVE' ? { scope: \`halftime:${halftimePeriod.id}\` } : null })`.
- 하프타임: `RestTimerCard`. 진행 중: **더보기 안에서만** — `쉬는 시간 재기` → `BottomSheet`(실행 중이면 `RestTimerCard`, 아니면 `RestTimerPresets`), 실행 중 항목 설명은 `{mm:ss} 남았어요`. 진행 중 타이머가 끝났는데 시트가 닫혀 있으면 `showToast('쉬는 시간이 끝났어요')`.
- `startRevert` 인라인 폼 삭제 → `confirm({ title: '경기 시작을 취소할까요?', message: '무효 처리할 경기 기록: {요약}. 경기 시계를 초기화하고 시작 전으로 돌아가요.', confirmLabel: '경기 시작 취소', tone: 'danger', confirmationText: '취소한다' })` 확인 뒤 `handleRunCommand('revert-start', { confirmation: '취소한다' })`. 확인 전에 캡처한 `gameVersionRef` 와 확인 뒤 값이 다르면 보내지 않고 `commandError` 「경기 기록이 바뀌었어요. 취소할 기록을 다시 확인해 주세요.」(기존 로직 이전).
- 체험 안내 `field-console-guide.tsx` STEPS[2] 「기록 버튼 → 팀·선수 선택 → 확인」→「기록 버튼 → 선수 선택 → 바로 저장(5초 안에 되돌리기)」.
- [ ] **Step 1: 실패 시험** — `'하프타임이 되면 입력 없이 쉬는 시간 10분이 시작되고 1분 추가·쉬는 시간 끝내기가 있다'`(fake timers) · `'새로고침(재마운트)해도 남은 시간이 이어지고 끝내기한 뒤엔 다시 시작하지 않는다'` · `'후반 시작하면 카드가 사라진다'` · `'진행 중에는 쉬는 시간 UI 가 없고 더보기 → 쉬는 시간 재기 → 5분으로 닿는다'` · `'진행 중 끝나면 토스트'` · `'경기 시작 취소는 ‘취소한다’ 를 정확히 입력해야 확인 버튼이 켜지고 revert-start 에 confirmation 이 실린다'` · `'확인 사이 버전이 바뀌면 보내지 않는다'`. 계약 시험 단언 불변.
- [ ] **Step 2–5:** FAIL → 구현 → PASS → 커밋 `feat: 하프타임 쉬는 시간을 자동으로 시작하고 시작 취소 확인을 앱 창으로 옮긴다`.

## Task 11: 결과 확정 카드 — 용어 두 말 · 경고 한 곳
**Files:** Modify `components/tournament-result-review/console-result-card.tsx` · Create `console-result-card.test.tsx` · Modify(문구 3곳만) `game-result-review-panel.test.tsx` 의 `describe('… 콘솔 확정 카드(variant="console")')` 안 「고치고 확인」 단언 3개(460·482·523줄 근처)
**경계(코디네이터 확정):** 이 카드는 L7 소유. 결과 검토 패널·결과 고치기 패널·`ResultEditModal` 과 확정 확인 창 문구(`game-result-review-panel.tsx` ~167 「확정 후에는 정정 절차로만 바꿀 수 있어요」)는 L6 소유 — 수정하지 않는다. 위 시험 파일은 console 블록의 단언 3줄만 고치고 나머지는 건드리지 않는다.
**Interfaces:** props 불변. 문구:
- 버튼 「고치고 확인」 → 「결과 고치기」. 확정 버튼 `{스코어} 결과 확정`·구역 이름 「결과 확정」·「확정 전」 배지는 그대로.
- 카드 하단 안내의 둘째 문장 「그 뒤에는 결과 정정에서만 고칠 수 있어요.」 삭제 — 같은 경고는 확정 확인 창 한 곳에만 둔다. 첫 문장 「확정하면 순위표와 전적에 반영돼요.」 는 확인 창에 없는 정보라 남긴다(plan decision).
- 콘솔이 `confirmedFooter` 로 붙이는 `ConsoleNextSteps` 의 「결과 정정」은 T12 에서 「결과 고치기」로 바꾼다.
- [ ] **Step 1: 실패 시험**(`console-result-card.test.tsx`, 카드 직접 렌더) — `'확정 대기 카드에는 「2 : 1 결과 확정」과 「결과 고치기」 두 버튼이 있고 「고치고 확인」은 없다'` · `'결과 고치기는 onResubmit, 확정은 onOfficialize 를 부른다'` · `'카드에 「정정」 글자가 없고 「확정하면 순위표와 전적에 반영돼요.」는 있다'` · `'officializeVisible=false 면 확정 버튼은 없고 결과 고치기는 남는다'`(양방향) · `'readOnly 면 두 버튼 없이 제출 안내만'` · `'OFFICIAL 이면 확정 완료 문구와 confirmedFooter'`. 패널 시험 console 블록의 「고치고 확인」 3곳을 「결과 고치기」로.
- [ ] **Step 2–5:** `vitest run src/components/tournament-result-review/console-result-card.test.tsx src/components/tournament-result-review/game-result-review-panel.test.tsx` FAIL → 구현 → PASS → 커밋 `fix: 콘솔 결과 확정 카드의 용어를 결과 확정·결과 고치기로 맞춘다`.

## Task 12: 용어·잔여 정리
**Files:** Modify `period-label.ts`(+test), `confirm-copy.ts`, `queue-status-panel.tsx`, `event-time-correction-sheet.tsx`, `operate-console-core.tsx`, `console-next-steps.tsx`(+test) · 해당 시험
**교체표(사용자에게 보이는 글자만):**
- `피리어드` → `경기 시간`/`전반·후반`: `confirm-copy.ts` 143·263·270, core 993(「남은 경기 시간을 마친 뒤」), core ~1504 `PERIOD_START: '경기 시간 시작'`·`PERIOD_END: '경기 시간 종료'`.
- `period-label.ts` 3번째부터 `${n}피리어드` → `연장 전반`(3)·`연장 후반`(4)·그 밖 `${n}번째 경기 시간`.
- `정정` → `고치기`: `event-time-correction-sheet.tsx` 150·194(`시각 고치기`)·274·303·374, core 2415, `queue-status-panel.tsx` 53. `console-next-steps.tsx` 「결과 정정」→「결과 고치기」. 남은 `운영 권한` → `기록 권한`.
- **바꾸지 않는다:** `recorded-event-list.tsx` 의 「수정」「수정·취소」「정정됨」(결과 검토 화면과 공유 — needs head).
- [ ] **Step 1:** 시험 기대 문구 갱신 + `period-label.test.ts` 에 3·4번째 라벨 추가.
- [ ] **Step 2 (게이트):** `git grep -nE "피리어드|운영 권한|휴식 시간|어웨이|필드|경기장|코트|window\.confirm" -- apps/v1_web/src/shared/game-operations apps/v1_web/src/components/tournament-live/operate ':!*.test.*'` → **주석이 아닌 문자열 0**. `git grep -n "예외 없이 전부" -- apps/v1_web/src` → 0.
- [ ] **Step 3 (죽은 코드):** `git grep -n "findRecentGoalEvent\|findRecentSubstitutionEvent\|periodProgressSteps\|TeamFoulCounterBar\|MatchupTitle\|showEmptyRosterNotice" apps/v1_web/src` → 0.
- [ ] **Step 4:** `vitest run src/shared/game-operations src/components/tournament-live/operate src/lib/match-progress-steps.test.ts` PASS. **Step 5:** 커밋 `chore: 콘솔 용어를 정리하고 쓰지 않는 코드를 지운다`.

## Task 13: 검증 · R-K3 · changeset · PR
**Files:** Create `.changeset/console-record-grid-undo.md` (`"v1_web": minor`, 해요체 한 문단 — 사용자에게 보이는 콘솔 변경)
- [ ] **Step 1: 영향 시험** `./node_modules/.bin/vitest run src/shared/game-operations src/components/tournament-live/operate src/components/team-matches/team-match-operate-console-adapter.test.tsx src/components/team-matches/team-match-operate-console-live-lineup.integration.test.tsx src/components/tournament-ops-demo src/components/tournament-result-review/console-result-card.test.tsx src/components/tournament-result-review/game-result-review-panel.test.tsx src/lib/match-progress-steps.test.ts` → 전부 PASS.
- [ ] **Step 2:** `./node_modules/.bin/tsc --noEmit -p tsconfig.json` 0 오류 · `node scripts/v1-pattern-check.mjs` 통과.
- [ ] **Step 3: R-K3 정적** — 변경 파일에서 `git grep -nE "border-l(-|\[)|inset [0-9]+px 0 0|before:(absolute|w-)"` 0, 새 `border-2` 색 카드 0.
- [ ] **Step 4: 머지 후 alpha 측정(로컬 next 금지)** — `ego-browser` 로 alpha 에서 라이브 경기를 운영 API 로 만들고(CLAUDE.md 「Alpha 실측 검증 §3」: takeover 는 Socket.IO `game.takeover.request`, `Idempotency-Key`=`clientCommandId`) 390·768·1440 와 360×640 으로 시작 전·진행 중·기록 직후 토스트·하프타임·더보기·몰수 창(390×560)·ENDED(결과 확정 카드 포함)를 찍는다. 각 화면 모든 요소의 계산 스타일로 `borderLeftWidth ≥ 2 && borderLeftWidth > borderRightWidth`(색 있음)와 `boxShadow` 의 `inset … 0 0` 수를 세어 0 을 PR 에 적는다. 확인: 기록 격자가 첫 화면(844) 안 · 토스트 버튼 높이 ≥44 · 몰수 창 버튼이 보임 · 쉬는 시간 새로고침 유지 · 360×640 에서 격자 끝줄에 스크롤로 닿음. ego 작업 공간은 끝나면 닫는다(`finish({ keep: [] })`).
- [ ] **Step 5:** PR(base `dev`, 한국어 제목·본문, 갤러리는 머지 후 같은 PR 에 코멘트) — 본문에 「O4-1 이 2026-08 「예외 없이 전부」를 대체」 명시.

## Self-Review
- **스펙 커버리지:** 첫 화면 작은 카드+2×3 격자(T5·T7·T9) · 진행 바(T9) · 기록 저장+5초 44px 되돌리기(T1·T8) · 주석 4곳+연관 4곳(T8) · 진행 명령 확인 유지(T9 `it.each`·T10) · 하프타임 자동 쉬는 시간+진행 중 더보기 안(T2·T10) · 상태 한 줄+자세히+우선순위표(T4·표) · 명단 단일 출처(T6·T9) · 몰수 창 높이(T3) · `window.confirm` 0(T12 게이트) · 결과 확정 카드 용어 「결과 확정」/「결과 고치기」·경고 한 곳(T11) · 「이 기기에서 기록하기」(T9) · 홈·원정/구장/경기 시간(T11) · 되돌리기 = 기존 `ops.reverseEvent`(T8) · idempotency·takeover 계약(Global·계약 시험).
- **plan decision:** ①배너는 19개(처리표) ②진행 단계 스트립은 LIVE 에서 제거·ENDED 만 유지, 점수 카드가 `MatchupTitle` 대체 ③격자는 ≥sm 6열, 교체 종목은 여섯째 칸=교체·`⋯` 는 진행 바 ④연결 끊김·미확정 기록은 서버 되돌리기를 약속하지 않음 ⑤진행 중 타이머 종료는 토스트 ⑥`showEmptyRosterNotice` 삭제·`headerTopClass` 유지(카드 sticky) ⑦경기 시간 3·4번째 라벨 「연장 전반·후반」 ⑧「전반 종료 되돌리기」는 더보기로 ⑨1번 항목 action 은 상태 줄 안에 직접 ⑩기록 시각/임계 외에 새 확인 창 없음.
- **needs head:** ⓪결과 확정 확인 창(`game-result-review-panel.tsx` ~167)의 「정정 절차로만」 → 「결과 고치기」 문구와 같은 파일 시험의 나머지 「고치고 확인」은 L6 몫 — L7 은 console 블록 단언 3줄만 수정(같은 파일 두 PR 충돌 가능, 머지 순서 조율) ①`recorded-event-list` 버튼 「수정·취소」→「고치기」(결과 검토와 공유, L6 와 합의) ②목업 ④의 종료 확인 요약(점수·골·카드·몰수 링크)은 만들지 않음 — 필요하면 별도 ③「‹ 경기 진행 · 구장 1 · 3번 경기」 맥락 줄·돌아가기 링크는 `tournament-ops-shell.tsx`(L6) 몫 ④alpha 에서 라인업(서버 동기화본)이 킥오프 직후 참가 명단과 같은지 재확인(스펙 Risks — 어긋나면 서버/시드 문제) ⑤토스트가 5초간 하단 격자 둘째 줄을 덮음(목업 동일) — alpha 에서 연속 기록이 막히면 위치 조정.

## Head 조율 결정 (2026-11-27, 실행자는 이 절을 우선한다)
- `recorded-event-list` 문구 「고치기」 통일은 이 레인 소유(결과 화면도 같은 부품을 씀).
- `game-result-review-panel.test.tsx` 는 L6 이 먼저 머지된다 — 이 레인은 그 뒤 `origin/dev` 를 3-way merge 해 콘솔 블록 단언 3줄만 맞춘다.
- 「확정 확인 창」의 「정정 절차로만」 문구와 결과 패널 3개 파일은 L6 몫 — 건드리지 않는다.
- 경기 종료 확인 요약(점수·기록 수)은 이번에 만들지 않음 승인. 토스트가 격자를 덮는 문제는 alpha 실측 뒤 조정.
- 경기 시간 3번째 이후 라벨은 콘솔에서 「연장 전반·후반」(이 계획 결정) 그대로. 설정 화면의 정규 3구간 이상은 L0 가 「1부·2부·3부」로 바꾼다 — 서로 다른 맥락이라 둘 다 유지.
