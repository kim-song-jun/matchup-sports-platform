# 대회 만들기 한 화면 필수 폼 (L2 · S1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/tournaments/new` 를 5단계 마법사에서 「필수 6칸 + 성별」 한 화면 폼으로 바꾸고, 초안 생성 뒤 대회 개요로 보낸다.

**Architecture:** 마법사 상태 머신·초안 복원·4단계 입력을 걷어 내고, 순수 모델(`create-form-model.ts`: 상태·리듀서·검증·payload·문구 계산)과 얇은 화면(`create-tournament-form.tsx` + 작은 부품 2개)으로 나눈다. 서버가 기본값을 채우는 칸은 보내지 않는다. 「여러 단계」는 서버 계약상 생성 요청에 `stagePlan` 이 있어야 하므로, 팀 수에 맞춘 기본 예선 구성을 만들어 함께 보낸다.

**Tech Stack:** Next.js 16 App Router · React 19 · TanStack Query 5 · Vitest + Testing Library + MSW · Tailwind v4 토큰(`tm-card`·`tm-input`·`tm-text-*`).

**Spec:** `.github/tasks/20261140-admin-tournament-ux-renovation.md` (「S1」, Q5, Q6, A1, G2, 2차 M1-3) · 목업 `~/.cache/teameet-admin-tournament-ux-20261127/mockups/s1-create/A.html`·`notes.md`, `m1-create/index.html`·`notes.md`. 이 계획이 구현자에게 문서 전체를 대신하지 않는다 — 두 문서를 먼저 읽는다.

## Global Constraints

- **브랜치·워크트리:** `git fetch origin dev` 직후 `origin/dev` 에서 새 워크트리·브랜치(`feat/admin-tournament-create-one-screen-20261127`). PR base = `dev`(머지 직전 `gh pr view <N> --json baseRefName`). 커밋 메시지·PR 제목·본문은 한국어(`feat(web): …`). 로컬 next 서버 금지, `prisma generate` 금지, 시각 검증은 머지 뒤 alpha.
- **명령(모두 `apps/v1_web` 에서):** `./node_modules/.bin/vitest run <경로>` · `./node_modules/.bin/tsc --noEmit -p tsconfig.json` · `node scripts/v1-pattern-check.mjs`.
- **용어·문구:** 해요체. 진행 방식 이름은 정확히 「조별리그 → 토너먼트」「토너먼트만」「리그전」「여러 단계 (예선 → 결선 여러 개)」. 「신청 마감」(「접수 마감」 아님), 「대회 시작」, 「팀 수」. 금지어: 정규리그 + N개 토너먼트, 대회 리그전, 단계형, 피리어드, 롤링. 에러는 `extractErrorMessage(err, '해요체 fallback')`, 빈 catch 금지.
- **R-K3(Critical):** 카드·칩·행에 `border-l`/`border-r`(한쪽 색 띠)·`before:` 띠·`inset Npx 0 0 <색>` 그림자·`border-2` 색 테두리 금지. 선택 상태 = 옅은 배경 + 1px 테두리 색(`GenderCategoryField` 의 `border-blue-500 bg-[var(--blue50)]` 패턴).
- **토큰·접근성:** 하드코딩 색·`text-[Npx]`·`text-sm` 류 금지(`text-[length:var(--font-size-label)]`·`.tm-text-*`). 터치 44px, `<label htmlFor>`·`aria-invalid`·`aria-describedby`, 오류 문구는 `role="alert"` + `data-error-focus=<컨트롤 id>`. `React.forwardRef` 금지. 새 주석은 코드가 말 못 하는 제약만, 파일의 기존 언어(한국어), 3줄 이내.
- **서버 계약(코드로 확인함, 백엔드 변경 없음):** `CreateTournamentDto` 가 실제로 요구하는 건 `sportId`·`title`·**`teamCount`**(`@IsDefined`, 없으면 `TOURNAMENT_TEAM_COUNT_REQUIRED`)다. 생략하면 서버가 채운다 — `format` `group_knockout`, `minPlayers` 6, `maxPlayers` 10, `entryFee` 0, `genderCategory` null(혼성이 아니면 쿼터도 null), 출전 인원·교체는 `resolveLineupConfigVersionId` 의 종목 canonical 값(`tournaments-admin.service.ts` `create`, 증명 스펙 `tournaments-admin.service.spec.ts` 의 「lineupMaxPlayers omitted → canonical」), 경기 시간은 종목 기본 피리어드(전용 API 로 고칠 때만 따로 저장). **그래서 지금 마법사가 클라이언트에서 채우던 값 중 서버가 안 채워 주는 것은 없다 → 최소 payload 로 보낸다**(6칸 + 성별/쿼터). 서버 기본값 6/10 은 혼성 인원 검증에만 `SERVER_DEFAULT_MAX_PLAYERS = 10` 으로 쓴다.
- **「여러 단계」 계약(A1):** 서버는 `stagePlan` 없는 `league_knockouts` 를 옛 방식으로 만들고 나중에 단계형으로 바꾸지 않는다(`STAGE_PLAN_INVALID` 「기존 대회는 단계형으로 자동 변환하지 않아요」), 첫 단계 자리 합이 `teamCount` 와 같아야 한다(`validateStagePlan`). → 생성 화면에 단계 편집기를 두지 않고 생성 요청에 기본 구성을 싣는다. 단계 편집은 초안 뒤 대진 탭 「구성 수정」(`StageStructureEditor`, 대진 전)에서 한다 — 이미 있는 화면이다.
- **「moved to L3」(만들기에서 사라지지만 대회 정보에서 계속 고칠 수 있어야 함 — 조용히 드롭 금지):** 이미지(커버·목록·상세 표시) · 상금·시상 · 홍보 카드 2종 · 동점 순서 · 경고 누적·퇴장 · 팀 파울 기준(C7: 검증은 그 칸 아래에서) · 대회 규정 · 환불 정책 · 출전 인원 · 교체 방식/횟수 · 경기 시간(단계별 포함) · 참가비·정산 계좌 · 명단 제출 마감 · 대회 종료 · 장소 · 최소/최대 선수 수 · 6강 방식(`sixTeamMode`, Q5 조건부) · 리그 최소 경기 수(`minMatchesPerTeam`, Q5 조건부) · 혼성 인원(혼성일 때 만들기에도 남음, 이후엔 참가 섹션). 현재 dev 의 `[id]/info-section.tsx` 가 편집하는 것: 위 전부 **`minMatchesPerTeam` 만 제외**(0건 — 마법사에서만 입력 가능). → **머지 순서 가드:** L3(S3)가 `minMatchesPerTeam` 편집을 `dev` 에 넣기 전에는 이 PR 을 머지하지 않는다(Task 7 에서 `git grep` 으로 확인).
- **다른 레인과 겹치는 수정:** import 경로 이동·`TournamentDatetimeField` 의 `hintTone` 은 L0 가 한다(위 Task 1–2). 이 레인에 남는 것은 `components/admin/stages/stage-plan-editor.test.tsx` 의 마법사 의존 테스트 1개 삭제와 `scripts/*-baseline.json` 의 `new/page.tsx` 항목 삭제뿐.

## Review Focus

(각 줄의 테스트는 해당 Task 에 이미 들어 있음)
1. **형식을 바꿔 가며 입력** — 「여러 단계」를 골랐다가 「토너먼트만」으로 돌아오면 payload 에 `stagePlan` 이 남지 않고 `format` 이 바뀐다; 팀 수는 유지된다. (T3 payload 테스트, T4 화면 테스트 5)
2. **혼성 → 남성부 → 혼성** — 입력한 남녀 인원이 남성부 payload 로 새지 않고, 혼성으로 돌아오면 입력이 보존된다. (T3, T4 테스트 6)
3. **팀 수에 이상한 값** — 빈 칸·0·1·65·소수·붙여넣은 공백, 빈 칸에서 −/+ 를 눌렀을 때. 오류는 팀 수 칸 아래에 나오고 +/− 는 2~64 에서 멈춘다. (T3, T4 테스트 3)
4. **더블 클릭·서버 거절** — 「초안 만들기」를 연달아 눌러도 POST 는 1번, 서버가 400 을 주면 입력을 그대로 두고 다시 누를 수 있다. (T4 테스트 4·9)
5. **옛 주소** — `/admin/tournaments/new-staged`, 새로고침으로 남은 `?draftId=…` 가 막다른 화면이나 중복 생성으로 이어지지 않는다. (T4 테스트 11, T5)

---

### Task 1–2: (L0 로 옮김 — head 조율 2026-11-27)
경기 시간 보조 함수 5개의 `lib/tournament-period-phases.ts` 이동과 공용 부품 2개(`TournamentGenderChoiceField`·`GENDER_CHOICE_OPTIONS`·`GenderChoice`, `TournamentDatetimeField` 의 `hintTone`)는 **L0 가 만든다**(L0 Task 6·6b). L0 가 먼저 머지되므로 이 레인은 import 만 한다. 시작할 때 `git grep -n "TournamentGenderChoiceField\|tournament-period-phases" origin/dev -- apps/v1_web/src` 로 L0 머지를 확인하고, 없으면 멈추고 보고한다. 이 레인의 Task 번호는 3부터 그대로 쓴다.

### Task 3: 만들기 모델 `create-form-model.ts`

새 파일(옛 `tournament-create-model.ts` 는 Task 4 에서 삭제 — 같은 이름으로 모양이 달라지는 export 를 한 커밋에 섞지 않으려고 파일을 가른다). 순수 함수만. 옛 모델의 KST 해석·마감 자동 제안·과거 시각 검증 로직과 그 테스트(`tournament-create-model.test.ts` 의 「마감 일시 하한」「입력값은 KST 벽시계」 묶음)를 옮겨 와 새 시그니처로 고친다.

**Files:**
- Create: `apps/v1_web/src/app/admin/tournaments/new/create-form-model.ts`, `.../create-form-model.test.ts`

**Interfaces:**
- Consumes: `GenderChoice`(T2), `stagePlanCounts`(`@/lib/stage-plan`, 문장 계산)·`StagePlan`(`@/types/stage-plan`), `groupKnockoutShapes`·`planBracketTemplateCounts`·`recommendedKnockoutSize`(`@/lib/bracket-template-counts`), `kstDatetimeLocalToIso`·`toKstDateString`·`kstMidnightMs`·`DAY_MS`(`@/lib/kst-calendar`), `josa`(`@/lib/korean`).
- Produces:
  ```ts
  export type CreateFormatChoice = 'group_knockout' | 'knockout' | 'league' | 'staged';
  export const CREATE_FORMAT_OPTIONS: ReadonlyArray<{ value: CreateFormatChoice; label: string; description: string }>;
  // label/description: 목업 문구 그대로. 「조별리그 → 토너먼트」 조별로 겨룬 뒤 상위 팀끼리 토너먼트를 해요 / 「토너먼트만」 한 번 지면 탈락해요 / 「리그전」 모든 팀과 한 번씩 겨뤄 순위를 정해요 / 「여러 단계 (예선 → 결선 여러 개)」 예선 순위대로 상위·하위 결선을 따로 열어요
  export const DEFAULT_GENDER_CATEGORY: GenderChoice = 'none';  // G2 확정 전 목업 기본값. 바꾸려면 이 한 줄(+ 화면 「기본」 표시는 따라감)
  export const SERVER_DEFAULT_MAX_PLAYERS = 10; export const TEAM_COUNT_MIN = 2; export const TEAM_COUNT_MAX = 64;
  export type CreateFormState = { sportId: string; title: string; format: CreateFormatChoice; scheduledAt: string; registrationDeadlineAt: string;
    registrationDeadlineDirty: boolean; teamCount: string; genderCategory: GenderChoice;
    genderMinMale: string; genderMaxMale: string; genderMinFemale: string; genderMaxFemale: string };
  export function initialCreateFormState(format?: CreateFormatChoice): CreateFormState;   // 팀 수 '8', 성별 DEFAULT_GENDER_CATEGORY
  export type CreateFormAction =
    | { type: 'set-field'; field: 'sportId' | 'title' | 'teamCount' | 'genderMinMale' | 'genderMaxMale' | 'genderMinFemale' | 'genderMaxFemale'; value: string }
    | { type: 'set-format'; value: CreateFormatChoice } | { type: 'set-gender'; value: GenderChoice }
    | { type: 'set-scheduled-at'; value: string } | { type: 'set-registration-deadline'; value: string }
    | { type: 'step-team-count'; delta: 1 | -1 };
  export function createFormReducer(state: CreateFormState, action: CreateFormAction): CreateFormState;
  export type CreateErrorField = 'sportId' | 'title' | 'scheduledAt' | 'registrationDeadlineAt' | 'teamCount' | 'genderMinMale' | 'genderMaxMale' | 'genderMinFemale' | 'genderMaxFemale' | 'genderQuota';
  export type CreateFormErrors = Partial<Record<CreateErrorField, string>>;
  export function validateCreateForm(state: CreateFormState): CreateFormErrors;   // 이 화면에 그려지는 칸만 키로 가진다(C7)
  export function buildCreatePayload(state: CreateFormState): V1CreateTournamentPayload;
  export function stagePlanForTeamCount(teamCount: number): StagePlan;
  export function describeFormatOutcome(format: CreateFormatChoice, teamCount: number): string;
  export function registrationDeadlineHint(state: CreateFormState): { tone: 'info' | 'warning'; text: string } | null;
  export function isShortLeadTime(scheduledAt: string): boolean;               // 시작이 지금~3일 이내(과거는 false)
  export function remainingRequiredLabels(state: CreateFormState): string[];   // 순서: 종목, 대회명, 대회 시작, 신청 마감, 팀 수
  export type CreateBarStatus = { tone: 'todo' | 'ok' | 'error'; text: string; count?: number };
  export function summarizeBarStatus(state: CreateFormState, errors: CreateFormErrors): CreateBarStatus;
  ```

- [ ] **Step 1: 실패하는 테스트** (`create-form-model.test.ts`, 시각은 `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime('2026-11-27T00:00:00+09:00')`; 테스트 환경 TZ 는 UTC 임에 유의):
  1. **마감 자동값** — `set-scheduled-at '2026-12-20T09:00'` → `registrationDeadlineAt === '2026-12-17T23:59'`; 이어서 `set-registration-deadline '2026-12-10T18:00'` 뒤 `set-scheduled-at '2026-12-25T09:00'` 하면 마감은 `'2026-12-10T18:00'` 그대로; 마감을 `''` 로 지워도 시작을 바꿔도 다시 채우지 않는다.
  2. **임박한 시작** — 시작 `'2026-11-29T09:00'` → 마감 `''`, `registrationDeadlineHint` = `{ tone:'warning', text:'대회가 곧 시작해서 미리 채우지 않았어요. 직접 정해 주세요.' }`, `isShortLeadTime` true; 시작이 과거면 false.
  3. **안내 문구** — 시작 비었음 → info `'대회 시작을 고르면 3일 전 밤으로 미리 채워요.'`; 자동으로 채워진 상태 → info `'시작 3일 전 밤으로 미리 채웠어요. 바꿔도 돼요.'`; 직접 고친 뒤(`registrationDeadlineDirty`) → `null`.
  4. **검증(빈 폼)** — 키가 정확히 `sportId`·`title`·`scheduledAt`·`registrationDeadlineAt`, 메시지 `'종목을 선택해 주세요.'`·`'대회명을 입력해 주세요.'`·`'대회 시작 일시를 선택해 주세요.'`·`'신청 마감 일시를 선택해 주세요.'`(팀 수 '8' 은 통과).
  5. **일정 검증** — 시작이 과거면 `scheduledAt` = `'대회 시작 일시는 지금 이후여야 해요.'` 이고 `registrationDeadlineAt` 에는 「시작 전」 오류가 안 붙는다; 마감 ≥ 시작 → `'신청 마감은 대회 시작 전이어야 해요.'`; 마감이 과거 → `'신청 마감은 지금 이후여야 해요.'`.
  6. **팀 수** — `''`·`'1'`·`'65'`·`'8.5'`·`'abc'` 는 `teamCount: '참가 팀 수는 2~64개여야 해요.'`, `'2'`·`'64'` 통과. `step-team-count` 는 2~64 에서 멈추고, `''` 에서 +1 → `'2'`, −1 → `'2'`.
  7. **혼성 인원** — 혼성일 때만 검사: 최대 > 10 → `genderQuota` `'성별 최대 인원은 대회 최대 선수 수를 넘을 수 없어요.'`, 최소 합 > 10 → `genderQuota` `'성별 최소 인원 합이 최대 선수 수를 넘을 수 없어요.'`, `'-1'`·`'1.5'` → 해당 칸 `'남성 최소 인원은 0~50명 사이의 정수여야 해요.'` 형식(칸 이름만 바뀜), 최소 > 최대 → `genderMaxMale` `'남성 최대 인원은 최소 인원보다 작을 수 없어요.'`; 성별이 남성부면 같은 값이 있어도 오류 없음.
  8. **payload = 최소 필드** — 종목 `s1`·제목 `'  겨울컵 '`·시작 `'2026-12-20T09:00'`·마감 `'2026-12-17T23:59'`·팀 8 일 때 형식 3종 각각 `toEqual({ sportId:'s1', title:'겨울컵', format, scheduledAt:'2026-12-20T00:00:00.000Z', registrationDeadlineAt:'2026-12-17T14:59:00.000Z', teamCount:8 })` — **다른 키가 하나도 없다**(성별 `none` 포함; 서버 기본값을 덮지 않는다는 증명).
  9. **성별 payload** — `male` → `genderCategory:'male'`, 쿼터 키 없음(입력해 둬도); `mixed` + 남성 최소 `'2'` 만 → `genderMinMale:2` 만 추가(빈 칸은 키 없음); 혼성→남성부→혼성 으로 돌아오면 입력값이 상태에 남아 있다.
  10. **여러 단계** — `format:'staged'` → `format:'league_knockouts'` + `stagePlan`, `stagePlanCounts(stagePlan).teams === teamCount`; `stagePlanForTeamCount(n)` 은 n=2..64 전부 `stagePlanError === null`·팀 수 n; n=8 → 풀리그 1개 「예선 리그」, n=24 → 「A조」… 3개(조당 8팀 이하, 합 24); 다른 형식으로 `set-format` 하면 payload 에 `stagePlan` 이 없다.
  11. **결과 문장** — `describeFormatOutcome('group_knockout', 8)` = `'A·B조 4팀씩 → 4강 → 결승, 경기 15개로 치러요.'`; `('group_knockout', 7)` = `'조 편성은 신청이 끝난 뒤 대진을 만들 때 정해요.'`; `('knockout', 8)` = `'8강 → 4강 → 결승, 경기 7개로 치러요.'`; `('knockout', 10)` = `'대진은 신청이 끝난 뒤 만들 때 정해요.'`; `('league', 6)` = `'모든 팀이 한 번씩 겨뤄 경기 15개로 치러요.'`; `('staged', 8)` = `'예선 8팀 리그(경기 28개)로 시작해요. 결선은 대진에서 이어서 짜요.'`, `('staged', 24)` = `'예선 3개 조(경기 84개)로 시작해요. 결선은 대진에서 이어서 짜요.'`.
  12. **하단 바** — 빈 폼 → `{ tone:'todo', count:4, text:'종목 외 3가지가 남았어요' }`; 종목·대회명만 채움 → `'대회 시작과 신청 마감이 남았어요'`; 종목·대회명·임박한 시작(마감이 비어 있음)까지 채움 → `'신청 마감이 남았어요'`; 다 채움·오류 없음 → `{ tone:'ok', text:'필수 정보를 모두 채웠어요' }`; 다 채움 + `errors.registrationDeadlineAt` → `{ tone:'error', text:'신청 마감을 고쳐 주세요' }`.
- [ ] **Step 2:** 실행 → FAIL(파일 없음).
- [ ] **Step 3: 구현** (시그니처는 위, 본문은 구현자). 접을 곳만 못 박는다: ① 마감 제안·`isShortLeadTime`·검증의 시각 규칙은 옛 `tournament-create-model.ts` 의 `suggestDeadline`·`isShortLeadTime`·`validateTournamentCreateStep(step 1)` 을 그대로 옮긴다(KST 벽시계, 지난 시각은 제안하지 않음). ② `stagePlanForTeamCount`: 조 수 `k = ceil(n/8)`, 조 크기는 n 을 k 로 고르게 나눈 값(큰 조 먼저), 단계 하나 「예선」(키 `preliminary`), 조 키는 `preliminary-1…k`(서버가 중복 키를 거절하므로 유일하게), 조는 `format:'league'`·`legs:1`·`sources:[]`·`capacity`=조 크기, `k===1` 이면 조 이름 「예선 리그」, 아니면 「A조」「B조」…(`initialStagePlan()` 의 모양을 따르되 재사용하지 않는다). ③ `describeFormatOutcome` 은 `groupKnockoutShapes(n)[0]` 의 `groupCount`·`teamsPerGroup`·`advancePerGroup`(결선 크기 = 조 수 × 진출 수: 2 결승 / 4 4강 → 결승 / 8 8강 → … / 16 16강 → …)과 `planBracketTemplateCounts` 의 `fixtures`(3·4위전 없음, `legs:1`)로 문장을 만들고, 조 이름은 2개면 「A·B조」, 3개 이상이면 「A~C조」. 토너먼트는 `recommendedKnockoutSize` 가 있을 때만 경기 수를 말한다. 리그는 n(n−1)/2. ④ `buildCreatePayload` 는 위 8번 모양 그대로 — 빈 쿼터 칸은 키를 만들지 않는다.
- [ ] **Step 4:** `vitest run src/app/admin/tournaments/new/create-form-model.test.ts` PASS, `tsc` 0.
- [ ] **Step 5: Commit** `feat(web): 대회 만들기 한 화면 폼의 모델을 만든다`

### Task 4: 한 화면 폼 화면과 옛 마법사 삭제

**Files:**
- Create: `apps/v1_web/src/app/admin/tournaments/new/create-tournament-form.tsx`, `create-team-count-field.tsx`, `create-bottom-bar.tsx`
- Rewrite: `apps/v1_web/src/app/admin/tournaments/new/page.tsx`, `page.test.tsx`
- Delete: `new/tournament-create-model.ts`, `new/tournament-create-model.test.ts`, `new/wizard-stage-viewport.ts`, `new/wizard-stage-viewport.test.ts`
- Modify: `apps/v1_web/src/components/admin/stages/stage-plan-editor.test.tsx`(「대회 저장 payload와 초안 복원에 단계 구성을 보존하고 변경을 감지한다」 테스트 1개와 그 import 줄 삭제 — 초안 복원 자체가 없어졌다. 단계 구성 payload 는 T3 가 증명한다.)

**Interfaces:**
- Consumes: T2 부품, T3 모델 전부, `useV1MasterSports`·`useV1CreateTournament`(`@/hooks/use-v1-api`), `AdminPageHeader`(`back` prop)·`AdminToasts`·`useAdminToast`(`@/components/admin`), `Button`(`@/components/v1-ui/button`, `loading`), `onlyDigits`(`@/lib/number-format`), `extractErrorMessage`.
- Produces:
  ```ts
  // page.tsx  — default export. useSearchParams 로 initialFormat(format=staged → 'staged', 그 외 'group_knockout') 와 옛 draftId 를 읽는다.
  export function CreateTournamentForm(props: { initialFormat: CreateFormatChoice }): JSX.Element;  // create-tournament-form.tsx
  export function CreateTeamCountField(props: { value: string; format: CreateFormatChoice; error?: string; disabled?: boolean;
    onStep: (delta: 1 | -1) => void; onChange: (value: string) => void }): JSX.Element;               // create-team-count-field.tsx
  export function CreateBottomBar(props: { status: CreateBarStatus; pending: boolean; cancelHref: string }): JSX.Element; // create-bottom-bar.tsx
  ```

**화면 명세(목업 A·m1 그대로, 구현자가 놓치기 쉬운 것만):**
- `AdminPageHeader`: `back={{ fallbackHref: '/admin/tournaments', label: '대회 목록으로' }}`(폰·데스크톱 모두 `‹` 한 개 — 목업 데스크톱의 글자 링크 대신 폰 목업과 같은 모양, **plan decision**), 제목 「새 대회 만들기」, 설명 「꼭 필요한 6가지만 정하면 초안이 만들어져요. 나머지는 초안에서 채워요.」, eyebrow 없음. 바로 아래 진행 줄 `<ol aria-label="대회 만들기 진행">`: 「필수 정보」(`aria-current="step"`) · 「초안에서 나머지 채우기」 · 「접수 시작」.
- 카드(`tm-card`) 안 순서: 종목(`radiogroup`, 마스터 종목 전부를 라디오 칩으로, 첫 라디오 id `create-sport`, 기본 선택 없음 — 종목 목록 조회 실패 시 「종목을 불러오지 못했어요.」+ 「다시 불러오기」 버튼) · 대회명(`id="create-title"`, maxLength 120, placeholder 「예: 2026 서울 풋살 오픈」) · 진행 방식(`CREATE_FORMAT_OPTIONS` 라디오 4줄, 선택 칸은 옅은 배경 + 1px 파란 테두리) · 대회 시작·신청 마감(`TournamentDatetimeField`, id `create-scheduled-at`·`create-registration-deadline-at`, 마감 hint = `registrationDeadlineHint`, warning 이면 `hintTone="warning"`) · 팀 수(`CreateTeamCountField` = 「−」「+」 버튼(`aria-label` 「한 팀 줄이기」「한 팀 늘리기」, 2·64 에서 비활성) + 숫자 입력(`id="create-team-count"`, `inputMode="numeric"`, `onChange` 에서 `onlyDigits`) + 접미 「팀」, 그 아래 `describeFormatOutcome` 한 줄 `aria-live="polite"`) · 성별(`TournamentGenderChoiceField`, `defaultValue={DEFAULT_GENDER_CATEGORY}`, 혼성이 아니면 hint 「혼성을 고르면 남녀 인원 조건을 함께 정할 수 있어요.」, 혼성이면 children 으로 그룹 「팀당 남녀 인원」 + 「선택, 비워 두면 조건 없이 받아요」 + 입력 4칸 `aria-label` 남성 최소/남성 최대/여성 최소/여성 최대, 접미 「명」).
- 카드 밖 한 줄: 「장소·참가비·경기 규칙·이미지는 초안을 만든 뒤 「대회 정보」에서 채워요.」
- 하단 고정 바(`fixed inset-x-0 bottom-0`, `lg:pl-[var(--admin-sidebar-width,0px)]`): 왼쪽 `role="status"` 상태 줄(todo = 남은 개수 숫자 원 · ok = 체크 아이콘 · error = `!` 아이콘, 모두 글자 병행), 오른쪽 「취소」(링크, `hidden sm:inline-flex` — CSS 전용 차이라 matchMedia 분기 없음) + 「초안 만들기」(`Button variant="primary" size="lg"`, 항상 누를 수 있음 — M1-3, 진행 중 「만드는 중…」 `loading`). 폼 하단 여백 `pb-28`, 컨트롤에 `scroll-mb-28`(옛 `wizard-stage-viewport` 대체 — 고정 바가 포커스한 칸을 덮지 않게, **alpha 폰 실측 대상**).
- 제출: `preventDefault` → `validateCreateForm` → 오류가 있으면 `setErrors` 후(옛 효과와 같은 방식으로) DOM 순서상 첫 `[role="alert"][data-error-focus]` 의 컨트롤로 스크롤·포커스, 요청 안 보냄 → 없으면 `useV1CreateTournament().mutate(buildCreatePayload(state))`; 성공 `router.push(`/admin/tournaments/${id}/overview`)`(성공 뒤에도 버튼은 이동할 때까지 비활성 — 이중 생성 방지), 실패 `showToast(extractErrorMessage(error, '대회를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.'), 'error')` + 입력 유지. 칸을 고치면 그 칸 오류만 지운다.
- `page.tsx`: `draftId` 쿼리가 있으면(옛 마법사가 초안 생성 뒤 남기던 주소) 폼 대신 「대회 화면으로 이동하고 있어요.」를 보이고 `router.replace(`/admin/tournaments/${encodeURIComponent(draftId)}/overview`)`.

- [ ] **Step 1: 실패하는 테스트** `page.test.tsx`(전부 교체). 구조: `vi.mock('next/navigation')`(`useRouter` push/replace 스파이, `useSearchParams` 가변), `QueryClientProvider`(retry 끔), `beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))`·`afterEach(server.resetHandlers)`·`afterAll(server.close)`(`@/test/msw/server`), 종목은 기본 핸들러(`/master/sports` 4종), 생성은 테스트마다 `server.use(http.post('*/api/v1/admin/tournaments', …))` 로 요청 본문을 잡고 `{ status:'success', data:{ id:'t-1', … }, timestamp }` 로 응답, 시각은 T3 와 같이 `Date` 만 고정. 날짜 입력은 `fireEvent.change(getByLabelText(/대회 시작/), { target:{ value:'2026-12-20T09:00' } })`. MSW 전역 핸들러(`src/test/msw/`)는 바꾸지 않는다.
  1. **한 화면 + 사라진 것** — 종목 라디오 4개·대회명·진행 방식 라디오 4개(이름 정확히 위 4개)·대회 시작·신청 마감·팀 수·성별 라디오 4개·「초안 만들기」가 한 번에 있다. 반대로 없다: 「STEP」·「단계 중」 글자, 「다음」「이전」 버튼, 라벨 참가비/은행명/경기 시간/출전 인원/교체/장소/대회 종료/명단 제출 마감, 글자 「정규리그 + N개 토너먼트」·「대회 리그전」, 링크 「정규 리그 만들기」(목록 화면으로 갔다), `role="alert"` 없음(처음엔 오류 없음). 「대회 정보」 안내 문장이 있다.
  2. **마감 자동값** — 시작 입력 → 마감 입력 값이 `2026-12-17T23:59`, 문구 「시작 3일 전 밤으로 미리 채웠어요. 바꿔도 돼요.」; 마감을 `2026-12-10T18:00` 으로 고치면 그 문구가 사라지고, 시작을 바꿔도 마감 유지.
  3. **팀 수** — 처음 `8`, 문장 「A·B조 4팀씩 → 4강 → 결승, 경기 15개로 치러요.」; 「한 팀 늘리기」 → `9` 와 「조 편성은 신청이 끝난 뒤 대진을 만들 때 정해요.」; 입력칸에 `'1a2'` 를 쳐도 `12` 만 남는다; `2` 에서 「한 팀 줄이기」가 비활성, `64` 에서 「한 팀 늘리기」가 비활성; 형식을 「리그전」으로 바꾸면 문장이 바뀐다.
  4. **만들기(성공)** — 종목 풋살·대회명·시작을 채우고 「초안 만들기」 → POST 본문이 T3 의 8번과 같은 최소 모양(`toEqual`)이고 `router.push` 가 `/admin/tournaments/t-1/overview`; 연달아 두 번 클릭해도 POST 는 1번; 응답 전 버튼은 `aria-busy`.
  5. **여러 단계** — 「여러 단계…」 선택 후 만들면 본문 `format:'league_knockouts'` + `stagePlan`(팀 수와 합이 같음); 그 뒤 「토너먼트만」으로 바꿔 만들면 `stagePlan` 키가 없다. `useSearchParams` 가 `format=staged` 이면 처음부터 그 라디오가 `checked`.
  6. **성별** — 처음 선택 칸이 `DEFAULT_GENDER_CATEGORY` 에 해당하는 칸이고 「기본」 글자가 그 칸에 있다(상수를 import 해서 비교 — 값이 바뀌어도 테스트가 깨지지 않게); 「혼성」을 고르면 인원 4칸이 보이고 「남성부」를 고르면 사라진다; 혼성에서 남성 최소 `2` 입력 → 남성부 → 혼성 으로 돌아오면 `2` 가 남아 있고, 남성부 상태에서 만든 POST 에는 쿼터 키가 없으며 혼성 상태에서는 `genderMinMale:2` 만 있다.
  7. **검증과 포커스** — 빈 폼에서 「초안 만들기」: 요청 없음(핸들러 호출 0), 버튼은 누를 수 있었다, 「종목을 선택해 주세요.」 등 오류 4개가 칸 바로 아래에 `role="alert"`, 포커스가 첫 오류(종목 첫 라디오)로 간다. **모든 alert 의 `data-error-focus` 가 문서 안의 실제 요소 id 를 가리킨다**(C7: 오류가 안 보이는 곳으로 튕기지 않음). 종목을 고르면 종목 오류만 사라진다. 혼성 인원 오류(최소 합 > 10)의 alert 는 남성 최소 입력을 가리킨다.
  8. **하단 바 문구** — 처음 「종목 외 3가지가 남았어요」, 종목·대회명·시작을 입력하면(마감은 자동으로 채워짐) 「필수 정보를 모두 채웠어요」, 마감을 시작보다 늦게 고치고 누르면 「신청 마감을 고쳐 주세요」 + 마감 칸 아래 「신청 마감은 대회 시작 전이어야 해요.」.
  9. **서버 거절** — POST 가 400 `{ code:'TOURNAMENT_TEAM_COUNT_INVALID', message:'이 진행 방식은 최대 64팀까지 설정할 수 있어요.' }` 이면 그 문장이 토스트로 보이고, 입력값이 그대로이며 `router.push` 는 안 불렸고, 다시 눌러 두 번째 POST 가 나간다.
  10. **종목 조회 실패** — `/master/sports` 500 → 「종목을 불러오지 못했어요.」 와 「다시 불러오기」, 누르면 재조회.
  11. **옛 링크** — `useSearchParams` 에 `draftId=abc` → 폼이 그려지지 않고 `router.replace('/admin/tournaments/abc/overview')`.
  12. **이동 링크** — 「대회 목록으로」(이름 가진 링크, `/admin/tournaments`)와 「취소」 링크가 있다.
- [ ] **Step 2:** `vitest run src/app/admin/tournaments/new/page.test.tsx` → FAIL.
- [ ] **Step 3: 구현** — 위 명세대로. 옛 파일 4개 삭제, `stage-plan-editor.test.tsx` 정리. `page.tsx` 에서 쓰던 `useV1AdminTournaments`·`useV1ChangeTournamentStatus`·`useV1UploadImages`·`useV1LineupSizeOptions`·`useTournamentPeriodSettings` 호출은 모두 사라진다.
- [ ] **Step 4:** `vitest run src/app/admin/tournaments/new src/components/admin/stages` PASS, `tsc --noEmit` 0.
- [ ] **Step 5: Commit** `feat(web): 대회 만들기를 한 화면 필수 폼으로 바꾼다`

### Task 5: 옛 주소 이동과 목록 버튼

**Files:**
- Rewrite: `apps/v1_web/src/app/admin/tournaments/new-staged/page.tsx`; Create: `new-staged/page.test.tsx`
- Modify: `apps/v1_web/src/app/admin/tournaments/page.tsx`(버튼 영역); Create: `apps/v1_web/src/app/admin/tournaments/page.create-entry.test.tsx`

**Interfaces:**
- Produces: `new-staged/page.tsx` 는 서버 컴포넌트로 `redirect('/admin/tournaments/new?format=staged')` 만 한다(`'use client'` 없음).

- [ ] **Step 1: 실패하는 테스트.** (a) `new-staged/page.test.tsx`: `vi.mock('next/navigation', () => ({ redirect: vi.fn() }))` 로 기본 export 를 호출하면 `redirect` 가 `'/admin/tournaments/new?format=staged'` 로 불린다. (b) `page.create-entry.test.tsx`(`page.visibility.test.tsx` 와 같은 `use-v1-api` 모킹 + `useV1AdminMe` 가 `['status:write']` 를 주는 경우/`[]` 인 경우): 쓰기 권한이 있으면 링크 「새 대회 만들기」(이름 = 기존 aria-label, 화면 글자 「대회 만들기」)가 `/admin/tournaments/new`, 링크 「정규 리그 만들기」가 `/admin/league-matches/new` 로 가고, 「단계형 대회 만들기」는 **없다**; 권한이 없으면 둘 다 없다.
- [ ] **Step 2:** 실행 → FAIL.
- [ ] **Step 3: 구현.** `new-staged/page.tsx` 교체. 목록 `page.tsx` 의 `<Link href="/admin/tournaments/new-staged">` 를 `<Link href="/admin/league-matches/new" className="tm-btn tm-btn-md tm-btn-neutral">정규 리그 만들기</Link>` 로 바꾼다(주 버튼은 그대로).
- [ ] **Step 4:** `vitest run src/app/admin/tournaments/new-staged src/app/admin/tournaments/page` PASS(기존 `page.test.tsx`·`page.visibility.test.tsx` 포함).
- [ ] **Step 5: Commit** `feat(web): 옛 단계형 주소를 새 만들기로 보내고 목록에 정규 리그 만들기를 둔다`

### Task 6: 죽은 코드 청소·기준선·문서

**Files:** 아래 확인 결과에 따라 삭제/수정. 모두 이 PR 에서 끝낸다(이연 금지).

- [ ] **Step 1: `CompetitionTemplateCard` 의 `link` 모드** — `git grep -n 'CompetitionTemplateCard' -- apps/v1_web/src` 로 `mode="link"` 의 운영 코드 호출이 **없음**을 확인(옛 마법사가 유일한 호출이었다; `bracket-fixture-tools-dialog.test.tsx` 의 `mode="link"` 는 다른 컴포넌트다). 없으면 `shared/ui/competition-template-card/competition-template-card.tsx` 의 `LinkCardProps`·링크 렌더 분기·`onClick`/`href`/`linkLabel` 처리를 지우고 `.test.tsx` 의 링크 테스트를 지운다(`mode: 'radio'` 는 호출부 안정을 위해 남김).
- [ ] **Step 2: 남기는 것 확인** — `components/admin/wizard-stepper.tsx`(리그 생성 마법사가 씀)·`gender-category-field.tsx`(리그 생성·설정이 씀)·`tournament-images-field`·`tie-break-preset-picker`·`prize-breakdown-editor`·`promo-card-fields`·`six-team-mode-field`(전부 `info-section.tsx` 가 씀)·`tournament-flow-section`(공개 상세가 씀)은 **삭제하지 않는다**. `lib/tournament-promo-defaults.ts`(+test)는 이제 운영 코드 사용처가 없지만 홍보 시트(L3)의 입력일 수 있어 이 PR 에서 지우지 않고 PR 본문에 「L3 가 안 쓰면 L3 PR 에서 삭제」라고 적는다(**needs head**).
- [ ] **Step 3: 기준선** — `node scripts/v1-pattern-check.mjs` 를 돌려 「baseline 갱신 필요」로 나오는 `src/app/admin/tournaments/new/page.tsx`(글자 크기 39 등)·삭제된 파일 항목을 `scripts/font-size-baseline.json`·`radius-baseline.json`·`tint-marker-baseline.json` 에서 **지운다**(숫자를 올리거나 새 항목을 넣지 않는다). 새 파일이 위반으로 나오면 토큰으로 고친다.
- [ ] **Step 4: 문서** — `docs/api/domains/tournaments.md` 「단계형 대회 구성」의 `새 /admin/tournaments/new-staged 진입에서만 stagePlan을 추가해 생성한다` 를 「`/admin/tournaments/new` 에서 진행 방식 「여러 단계」를 고른 경우에만 `stagePlan`(팀 수에 맞춘 기본 예선 구성)을 함께 보낸다. 옛 `/new-staged` 는 `/new?format=staged` 로 이동한다. 단계 구성은 초안 뒤 대진 탭에서 바꾼다.」 로, `docs/scenarios/17-tournament-gender-wizard.md` 의 `TOURN-030-A~D` 를 한 화면 폼 동작(6칸 + 성별, 마감 D-3 만 제안·명단 마감 제안 없음, 팀 수 기본 8, 혼성일 때만 인원 4칸, 최소 payload)으로, `TOURN-030-E~F` 를 「이미지·상금·홍보는 대회 정보 섹션 시트에서 편집한다」 한 줄로 고친다. `docs/scenarios/15-focused-full-flow-test-matrix.md` 의 TOURN-017 행에서 「참가비」 검증을 빼고 「생성 후 개요로 이동」으로 고친다.
- [ ] **Step 5:** `vitest run src/shared/ui/competition-template-card`, `node scripts/v1-pattern-check.mjs` 통과.
- [ ] **Step 6: Commit** `chore(web): 마법사가 남긴 죽은 코드·기준선·문서를 정리한다`

### Task 7: 최종 점검·changeset·PR

**Files:** Create `.changeset/admin-create-one-screen.md`

- [ ] **Step 1: 머지 순서 가드** — `git fetch origin dev && git grep -n minMatchesPerTeam origin/dev -- 'apps/v1_web/src/app/admin/tournaments/[id]'` 가 비어 있으면(L3 가 아직 편집 화면을 안 넣음) **PR 을 열되 머지하지 말고** head 에 보고(리그 최소 경기 수를 고칠 곳이 사라진다). 같은 방식으로 「moved to L3」 목록의 각 칸이 `info-section` 계열에서 아직 편집 가능한지 한 번 더 훑는다(L3 가 먼저 머지됐다면 새 파일 이름으로).
- [ ] **Step 2: 전체 점검** — `./node_modules/.bin/tsc --noEmit -p tsconfig.json`(0), `node scripts/v1-pattern-check.mjs`(0), `vitest run src/app/admin/tournaments src/components/admin src/lib src/shared/ui`(green), `git grep -n "tournament-create-model\|wizard-stage-viewport" -- apps` 결과 0. 새·바뀐 파일에 `git grep -nE "border-l|border-r|before:|border-2|inset [0-9]+px 0|text-\\[[0-9]+px\\]|text-(xs|sm|base|lg)\\b"` 결과 0, 금지어(위 Global Constraints) grep 0. 주석 비율: `git diff origin/dev | grep -cE "^\\+\\s*(//|\\*)"` 가 추가 줄의 1/3 안팎.
- [ ] **Step 3: R-K3 측정 계획** — 로컬 렌더 금지라 **머지·alpha 배포(`x-teameet-commit` 확인) 뒤** ego-browser 로 `/admin/tournaments/new`(390·768·1440, 빈 폼·혼성 펼침·오류 상태)와 목록 화면에서 `[...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); return (parseFloat(s.borderLeftWidth) >= 2 && s.borderLeftStyle !== 'none' && parseFloat(s.borderLeftWidth) > parseFloat(s.borderRightWidth)) || /inset\\s+-?\\d+px\\s+0px\\s+0px/.test(s.boxShadow); }).length` = **0** 을 기록하고, 하단 바가 포커스한 칸을 덮지 않는지(390, 키보드 Tab)와 첫 화면 입력 ≤7칸·「초안 만들기」 첫 화면 노출을 확인해 PR 에 게시한다. PR 본문에 「갤러리·측정은 머지 후 alpha 에서」 이유를 적고 정적 grep 0 을 먼저 적는다.
- [ ] **Step 4: changeset** — `"v1_web": minor`, 본문(한국어): 대회 만들기를 종목·대회명·진행 방식·대회 시작·신청 마감·팀 수(+성별) 한 화면 폼으로 바꿨고, 나머지는 초안 뒤 대회 정보에서 채운다; 「여러 단계」 방식과 정규 리그 만들기 입구를 정리했다.
- [ ] **Step 5: PR** — base `dev`(`baseRefName` 확인), 제목·본문 한국어, 본문에 「moved to L3」 목록·머지 순서 가드·needs head 항목(`DEFAULT_GENDER_CATEGORY` G2, 개요 도착 안내 띠 계약, `promo-defaults` 처리)·한 줄 수정한 타 레인 파일 목록을 적는다. Copilot 리뷰 요청은 `gh pr edit <N> --add-reviewer "@copilot"`(`--repo kim-song-jun/matchup-sports-platform` 명시).
- [ ] **Step 6: Commit** `chore(web): 대회 만들기 changeset`

---

## Self-Review

**1. Spec 커버리지:** S1 한 화면(T3·T4) · 4줄 진행 방식 매핑·「여러 단계」=`league_knockouts`+`stagePlan`(T3-8·10, A1 결정 = Global Constraints) · 신청 마감 자동·유지(T3-1·3) · 팀 수 스테퍼 + 경기 수 문장(T3-11, T4-3) · 성별 4칸 + `DEFAULT_GENDER_CATEGORY`(T2·T3, G2) · 하단 바(T4, M1-3: 항상 눌림·첫 빈칸 이동) · 초안 뒤 개요 이동(T4-4) · `/new-staged` → `/new?format=staged`(T5) · 목록 버튼(T5) · 서버 기본값 확인(Global Constraints, T3-8 이 증명) · 사라진 입력의 행방(Global Constraints, T7-1) · Q5(`sixTeamMode`·`minMatchesPerTeam` 만들기에서 제외, L3 로 — 머지 가드) · Q6(만들기 쪽은 `stagePlan` 이 있어야 단계형으로 만들어짐 — 대진 빈 상태 분기는 L5) · C7(오류는 그 칸 아래, T4-7) · 초안 복원(아래 plan decision).

**2. Step 점검:** 시그니처·테스트 값·정확한 문구가 모든 Task 에 있고, 본문은 구현자에게 남겼다(T3 Step 3 은 옛 로직 이동 지점만 지정).

**3. 타입 일관성:** `CreateFormatChoice`·`GenderChoice`·`CreateFormState`·`CreateFormErrors`·`CreateBarStatus` 는 T3 가 정의하고 T4 가 그대로 소비한다. `TournamentGenderChoiceField.defaultValue` ↔ `DEFAULT_GENDER_CATEGORY`. 옛 모델에서 다른 파일이 쓰던 export 는 T1 로 이사했고, `stage-plan-editor.test.tsx` 의 의존은 T4 에서 정리한다(`git grep -n tournament-create-model` 0 이어야 함 — T7 Step 2 에 포함해 확인할 것).

**4. Review Focus:** 5줄 모두 테스트가 T3/T4/T5 에 있다.

**5. 분량:** 스펙의 S1 절 대비 계획은 구현 단위(모델 1 + 부품 3 + 화면 1)로 쪼갰고 본문 코드는 없다.

**plan decision (head 가 뒤집을 수 있음):**
- **A1** 「여러 단계」 단계 편집기는 생성 화면에 두지 않고 초안 뒤 대진 탭 「구성 수정」에 맡긴다. 생성 요청에는 팀 수에 맞춘 기본 예선 구성(조당 ≤8팀, 8팀 이하면 「예선 리그」 하나)을 싣는다 — 서버가 나중 변환을 거절하고 첫 단계 자리 합이 팀 수여야 해서 단일 큰 리그로는 23팀 이상이 만들어지지 않기 때문(퀸즈컵류 24팀 대응).
- 초안 복원(`?draftId=`)은 한 화면 폼에서 필요 없어 삭제하고, 옛 링크만 개요로 보내는 한 줄을 남겼다(앱이 직접 만들던 주소라서).
- 팀 수는 ± 스텝퍼 + 직접 입력(24팀 대회에서 16번 누르지 않게). 종목 칩은 마스터 종목 전부(목업의 2칸은 로컬 데이터 기준으로 보여 필터를 지어내지 않음), 기본 선택 없음.
- 뒤로가기는 `AdminPageHeader back` 의 `‹` 하나(데스크톱 목업의 글자 링크 대신), 「취소」는 `sm` 이상에서만 보임(CSS).
- 공용으로 새로 만든 것: `components/admin/tournaments/tournament-gender-choice-field.tsx`·`lib/tournament-period-phases.ts`, `TournamentDatetimeField` 의 `hintTone`. L3 가 자체 구현하지 않고 이것을 쓰도록 조율 필요.
- 옛 `tournament-create-model.ts` 를 제자리 재작성하지 않고 `create-form-model.ts` 로 새로 만든 뒤 삭제 — 커밋마다 tsc 가 초록이도록.

**needs head:**
1. **G2** 성별 기본값 — `DEFAULT_GENDER_CATEGORY` 현재 `'none'`(목업). 운영 집계 뒤 한 줄로 바꾼다.
2. **개요 도착 띠** — 목업 (e) 의 「초안을 만들었어요. 접수를 시작하기 전까지…」 띠를 개요(L1)가 그리려면 도착 주소 신호가 필요하다. 이 계획은 브리프대로 `/overview` 로만 보낸다. 승인되면 `?created=1`(T4 의 한 줄 + T4-4 단언 한 줄)과 L1 의 소비를 함께 추가.
3. **`minMatchesPerTeam`** 편집이 현재 만들기에만 있다 → L3 가 먼저(또는 함께) 넣어야 이 PR 을 머지할 수 있다(T7-1).
4. **「여러 단계」 후속 입구** — 개요 「채워야 할 설정」의 「단계 구성」 항목(→ 대진 탭 「구성 수정」)은 L1 몫이다. 이 PR 은 만들기만 바꾼다.
5. `lib/tournament-promo-defaults.ts` 처리(L3 가 쓰면 유지, 아니면 L3 에서 삭제).
6. **L3 와 경기 시간 보조 함수 경로** — L3 계획은 「L2 가 4개 함수를 남겨야 한다」고 했다. 이 계획은 남기되 `lib/tournament-period-phases.ts` 로 옮긴다(T1). L3 의 `tournament-period-settings-editor.tsx` 가 옛 경로를 계속 import 하면 나중에 머지되는 쪽이 import 한 줄을 고친다(tsc 가 잡음).
7. **진행 방식 이름 이중 정의** — L3 의 `TOURNAMENT_FORMAT_NAMES`(`info-sections.ts`)와 이 PR 의 `CREATE_FORMAT_OPTIONS` 라벨이 같은 말을 따로 가진다. 둘 다 머지된 뒤 한 곳으로 모은다(만들기 라벨 = 이름 + 「여러 단계」 뒤 설명).
