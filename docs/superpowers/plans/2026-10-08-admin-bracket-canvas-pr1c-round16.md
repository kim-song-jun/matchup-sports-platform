# 어드민 대진 그림 편집기 PR-1c — 16강 단계

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대진 단계 `round16`(16강)을 서버·웹 전체에서 정식 단계로 쓸 수 있게 한다. 서버는 DTO 단계 목록·연결 인접표(`quarter ← round12 | round16`)·라벨을 열고, 대진 템플릿 planner 가 토너먼트 16팀(+3·4위전)을 만든다. 웹은 타입·라벨·공개 대진표 열 순서·진행 단계·결과 화면·어드민 "+16강" 조 추가와 수동 경기 라운드를 16강까지 받는다. enum 값 자체는 PR-1a 마이그레이션이 이미 넣었다.

**Architecture:** 단계 규칙이 흩어진 곳(DTO 상수 · 서비스 안의 인접 맵 · 라벨 표 3벌 · 웹 라운드 표 여러 곳)을 `round16` 한 값으로 모두 연다. 인접 규칙은 서비스 안 인라인 맵에서 순수 모듈 `tournament-bracket-phases.ts` 로 뽑아 단위 테스트가 직접 고정한다. 16강엔 부전승이 없으므로 부전승 표(`limits`·`BYE_ROUNDS`)에는 **넣지 않는다** — 기존 `BYE_PHASE_INVALID` 가 그대로 막는지 테스트로만 고정한다. DB 정렬은 1a 가 `round16` 을 `round12` 앞에 넣어 enum 순서(`group < round16 < round12 < quarter …`)로 해결되며 통합 스펙이 확인한다.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16 (Jest 30), Next.js 16 + React 19 + Vitest + Testing Library.

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md` (S1-b · S2 · Test Scenarios 의 16강 줄 · PR-1c) · 색인 `docs/superpowers/plans/2026-10-08-admin-bracket-canvas-index.md`("병렬 실행 웨이브"·"PR 시작 체크리스트"·"16강"). 선행 PR-1a·PR-1b 가 머지된 `origin/dev` 위에서 실행한다(웨이브 3 — PR-3·PR-5a 와 같은 웨이브라 각자 worktree 에서 동시 진행, 머지는 순서대로).

## 계약 이탈

색인의 이름·시그니처를 그대로 쓴다. 새 이름은 아래 둘뿐이고 이 PR 안에서만 소비한다.

| 이름 | 파일 | 비고 |
|---|---|---|
| `BRACKET_SOURCE_PHASES`, `acceptsBracketSource(targetPhase, sourcePhase)` | `apps/v1_api/src/tournaments/tournament-bracket-phases.ts` | `updateBracketSources` 의 인라인 `sourcePhase` 맵(2곳에서 사용)을 순수 모듈로 추출. 다른 PR 이 가져다 쓰지 않는다 |
| `KNOCKOUT_PHASES`, `isKnockoutPhase(phase)` | `apps/v1_web/src/lib/tournament-round-label.ts` | 공개 대회 상세의 결선 단계 판정이 문자열 리터럴 배열을 따로 들고 있던 것을 한 곳으로 |

**다른 PR 계획과 맞물리는 지점 (이 계획이 먼저 확인한 사실)**

- **PR-1b 계획의 테스트 한 줄이 이 PR 과 충돌한다.** 1b `bracket-template-plan.spec.ts` 의 거부 표에 `{ kind: 'knockout', size: 16, thirdPlace: true }` 가 `BRACKET_TEMPLATE_UNSUPPORTED` 기대로 들어 있다(1b 계획 Task 2 의 `describe('… 거부')`). 16 을 열면 이 행이 거짓이 되므로 Task 3 이 그 행을 `size: 10`·`size: 20` 으로 **교체**한다(삭제가 아니라 범위 밖 대조군으로 바꾼다).
- **PR-3 계획은 이미 16강을 안다.** `bracket-canvas-layout.ts` 의 단계 순서(`round16 > round12 > quarter > semi > final > third_place`)·웹 `BracketTemplateInput`(`size: 4 | 8 | 12 | 16`)·`knockoutRoundLabel` 이 3 의 계획에 들어 있다. 따라서 이 PR 은 캔버스 단계 순서 상수를 **편집하지 않고 존재만 검증**한다(Task 9). PR-3 이 먼저 머지됐는데 `round16` 이 빠져 있으면 그때만 한 줄 추가한다.
- **PR-4 는 자체 `KNOCKOUT_META` 를 가진다**(`group-knockout-plan.ts`, `round16` 포함). 이 PR 의 knockout planner 표와 겹치지 않는다 — PR-4 가 이 파일의 표를 가져다 쓰지 않으므로 충돌도 없다.

## Global Constraints

색인 `Global Constraints` 전부(공유 worktree·pathspec 커밋·`prisma generate` 금지·테스트 명령·주석 비율·해요체·토큰 규칙)가 적용된다. 이 PR 에만 해당하는 것:

- **스키마·마이그레이션을 건드리지 않는다.** `round16` 은 PR-1a 마이그레이션이 이미 넣었다. 이 PR 에 `schema.prisma`·스키마 해시 5곳 변경이 보이면 범위 이탈이다(Task 0 이 확인).
- **새 enum 값은 타입으로만 의존한다.** 공유 `node_modules` 의 Prisma client 에는 `round16` 이 없을 수 있다(생성은 CI). API 의 타입 검사·ts-jest 는 PR-1a Task 2 Step 10 이 만든 격리 하네스로 돌린다: `export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/<이 PR worktree> ISO=/Users/sungjun/.cache/bracket-canvas-iso/pr1c-round16` — **ISO 는 worktree 마다 따로**이므로 이 PR 은 위 값으로 PR-1a Task 2 Step 10 의 생성 명령을 `WT` 만 바꿔 다시 실행한다. 실행 전후 공유 client 오염(`git status`·`ls node_modules/.prisma`) 확인, 내가 띄운 프로세스는 직접 종료.
- 모든 jest 명령은 `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 <파일>`, 격리 tsc 는 `./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"`. 웹은 `cd apps/v1_web && ./node_modules/.bin/vitest run <파일>` · `./node_modules/.bin/tsc --noEmit -p tsconfig.json` · `node scripts/v1-pattern-check.mjs`.
- **화면은 로컬 next 로 검증하지 않는다.** UI 변경 PR 이므로 머지 → alpha 배포 확인 → ego-browser → 390/768/1440 갤러리를 이 PR 코멘트에 게시(마지막 Task). alpha 데이터 쓰기는 사용자 승인 후.
- 16강엔 부전승이 없다 — `byeRound`·`limits`·`ROUND12_BYE_SORT_ORDERS` 에 `round16` 을 추가하지 않는다.
- 커밋 메시지 끝 attribution 은 실행 세션 지침을 따른다(예시 생략).

## File Structure

경로 접두 `apps/v1_api/` · `apps/v1_web/src/` 생략. **Create** / *Modify*.

| 파일 | 책임 |
|---|---|
| **api `src/tournaments/tournament-bracket-phases.ts`** · **`.spec.ts`** | 연결 인접표 순수 모듈 + 표 전수 테스트 |
| *api `src/tournaments/dto/admin-bracket.dto.ts`* · *`.spec.ts`* | `TOURNAMENT_GROUP_PHASES` 에 `round16` |
| *api `src/tournaments/tournament-bracket.service.ts`* · *`.spec.ts`* | 인라인 인접 맵 2곳 → 모듈 호출, 16강 부전승 거부 테스트 |
| *api `src/tournaments/tournament-round-label.ts`* · *`.spec.ts`* · *api `prisma/seed-tournament-round-label.ts`* | 라벨 표 `round16: '16강'` (서버·시드 사본, 시드 사본은 기존 스펙이 서버와 동일성을 단언) |
| *api `src/tournaments/templates/bracket-template-plan.ts`* · *`.spec.ts`* | knockout `size: 16` (1b 산출물 수정) |
| *api `src/tournaments/templates/dto/bracket-template.dto.ts`* · *`.spec.ts`* | size 캐스트에 16 (1b 산출물 수정) |
| **api `test/tournaments/bracket-round16.integration-spec.ts`** | 템플릿 16 · DB 정렬 · 수동 연결 · 부전승 거부 (CI) |
| *`../../docs/api/domains/tournaments.md`* | 단계 목록·인접·템플릿 size 갱신 |
| *web `types/api.ts`* | `V1TournamentGroupPhase` 에 `'round16'` |
| *web `lib/tournament-round-label.ts`* · *`.test.ts`* | 라벨 + `KNOCKOUT_PHASES` |
| *web `lib/tournament-bracket-rounds.ts`* | `BRACKET_SOURCE_PHASES`(서버 `tournament-bracket-phases.ts` 표와 같은 값, Task 8) |
| *web `components/tournaments/tournament-bracket.tsx`* · *`.test.ts`* | 공개 대진표 열 순서·라벨·정규화 |
| *web `components/tournaments/tournament-progress-stepper.tsx`* · *`.test.ts`* | 진행 단계 라벨·순서 |
| *web `components/public-game-records/schedule-grouping.test.ts`* | 공개 일정 16강 정렬 고정 (구현 변경 없음, Task 7) |
| *web `app/tournaments/[id]/results/results-page-client.tsx`* · *`.test.tsx`* | 결선 종류·라벨·정렬 |
| *web `app/tournaments/[id]/tournament-detail-client.tsx`* | 결선 단계 판정을 `KNOCKOUT_PHASES` 로, 안내 문구 |
| *web `app/admin/tournaments/[id]/bracket-group-helpers.ts`* · *`.test.ts`* | "+16강" 템플릿·이름 |
| *web `app/admin/tournaments/[id]/bracket-group-quick-add.tsx`* | 직접 입력 단계 select |
| *web `app/admin/tournaments/[id]/bracket-group-card.tsx`* · *`.test.tsx`* | 수동 경기 라운드 옵션, 부전승 비활성 |
| *web `app/admin/tournaments/[id]/bracket-tab.tsx`* · *`.test.tsx`* | 자동 생성 라벨·중복 가드·진출 연결 후보 |
| **web `lib/tournament-bracket-rounds.test.ts`** | 16강 부전승 없음 계약 |
| **`/.changeset/admin-bracket-canvas-round16.md`** | 릴리스 노트 |

---

### Task 0: 선행 심볼 확인 (코드 변경 없음, 커밋 없음)

하나라도 어긋나면 직접 만들지 말고 **BLOCKED** 로 멈춘다(두 벌 구현 금지).

- [ ] **Step 1: PR 시작 체크리스트** — 색인 "PR 시작 체크리스트" 1~3 을 실행한다: `git -C /Users/sungjun/Dev/projects/matchup-sports-platform fetch origin dev` → PR-1a·1b 가 `origin/dev` 에 있는지 → `git worktree add .claude/worktrees/round16 -b feat/admin-bracket-round16 origin/dev` → node_modules 심링크(**`git add` 금지**) → 위 Global Constraints 의 `ISO` 로 격리 하네스 재생성.

```bash
git -C /Users/sungjun/Dev/projects/matchup-sports-platform log origin/dev --oneline | head -20   # 1a·1b 머지 커밋이 보여야 한다
```

- [ ] **Step 2: PR-1a — enum 값과 순서** (`round16` 이 `round12` 앞, 이 PR 은 스키마 무변경)

```bash
cd $WT/apps/v1_api
grep -n "enum V1TournamentGroupPhase" -A9 prisma/schema.prisma   # group, round16, round12, quarter, semi, final, third_place 순
grep -rn "ADD VALUE IF NOT EXISTS 'round16' BEFORE 'round12'" prisma/migrations
```
Expected: 스키마에 `round16` 이 `round12` 바로 위, 마이그레이션 1줄. 순서가 다르면 `orderBy: { phase: 'asc' }`(`tournaments-read.query.ts:54`·`tournament-bracket.service.ts:1290`)가 16강을 마지막에 정렬하므로 BLOCKED.

- [ ] **Step 3: PR-1b — planner·DTO·executor 존재**

```bash
cd $WT/apps/v1_api
grep -nE "^export function planBracketTemplate|FIXTURES_IN_PHASE|ROUND_LABEL|GROUP_NAME|size: 4 \| 8 \| 12;" src/tournaments/templates/bracket-template-plan.ts
grep -n "as 4 | 8 | 12" src/tournaments/templates/dto/bracket-template.dto.ts
grep -n "size: 16" src/tournaments/templates/bracket-template-plan.spec.ts
ls src/tournaments/templates/bracket-template.service.ts test/helpers/bracket-canvas-fixture.ts
```
Expected: 첫 grep 5줄 이상(`planBracketTemplate`·표 3개·유니온), 둘째 1줄, 셋째 1줄(UNSUPPORTED 거부 행 — Task 3 이 교체), 파일 2개 존재. 없으면 BLOCKED.

- [ ] **Step 4: 16강이 아직 어디에도 없음 + 스키마 무변경 확인**

```bash
cd $WT
grep -rn "round16" apps/v1_api/src apps/v1_web/src | grep -v "\.spec\.\|\.test\." | head   # 비어 있어야 한다(1a 는 스키마·마이그레이션·해시만)
git diff origin/dev --stat -- apps/v1_api/prisma deploy scripts/release   # 이 PR 시작 시점엔 비어 있어야 한다
```
Expected: 첫 출력 없음. `round16` 이 이미 보이면 다른 PR 이 일부를 했다는 뜻 — 중복 구현하지 말고 어디까지 되어 있는지 보고 후 해당 Step 을 건너뛴다.

- [ ] **Step 5: PR-3 단계 순서 상수 (있으면 검증만)**

```bash
cd $WT/apps/v1_web/src
ls lib/bracket-canvas-layout.ts 2>/dev/null && grep -n "PHASE_ORDER" lib/bracket-canvas-layout.ts
```
Expected: 파일이 있으면 `round16` 이 `round12` 보다 앞 숫자. 파일이 없으면(PR-3 미머지) 이 PR 은 건드리지 않는다 — Task 9 에서 다시 본다.

---

### Task 1: 서버 단계 규칙 — DTO 단계 목록 · 연결 인접표 · 16강 부전승 거부

**Files:**
- Create: `apps/v1_api/src/tournaments/tournament-bracket-phases.ts`, `tournament-bracket-phases.spec.ts`
- Modify: `apps/v1_api/src/tournaments/dto/admin-bracket.dto.ts:22`, `dto/admin-bracket.dto.spec.ts:49-53`
- Modify: `apps/v1_api/src/tournaments/tournament-bracket.service.ts` (import `:65` 근처 · `:851` · `:856` · `:876`), `tournament-bracket.service.spec.ts`

**Interfaces:**
- Produces: `BRACKET_SOURCE_PHASES: Readonly<Record<string, readonly string[]>>`, `acceptsBracketSource(targetPhase: string | null | undefined, sourcePhase: string | null | undefined): boolean`.
- 같은 원천 규칙을 `updateBracketSources` 의 사전 검증(`:856`)과 본 검증(`:876`)이 함께 쓴다 — 인라인 맵 두 곳이 갈라지지 않게 한다.

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/v1_api/src/tournaments/tournament-bracket-phases.spec.ts`

```ts
import { BRACKET_SOURCE_PHASES, acceptsBracketSource } from './tournament-bracket-phases';

describe('acceptsBracketSource — 바로 이전 단계만 연결할 수 있다', () => {
  it.each<[string, string]>([
    ['quarter', 'round16'],
    ['quarter', 'round12'],
    ['semi', 'quarter'],
    ['final', 'semi'],
    ['third_place', 'semi'],
  ])('%s 는 %s 의 경기를 원천으로 받는다', (target, source) => {
    expect(acceptsBracketSource(target, source)).toBe(true);
  });

  it.each<[string, string]>([
    ['semi', 'round16'], // 8강을 건너뛴 연결
    ['final', 'quarter'],
    ['third_place', 'quarter'],
    ['quarter', 'semi'], // 거꾸로
    ['quarter', 'quarter'],
    ['quarter', 'group'],
    ['round12', 'round16'], // 16강 → 12강은 인접이 아니다(둘 다 8강의 앞 단계)
    ['round16', 'round12'],
    ['round16', 'quarter'],
    ['round16', 'group'],
  ])('%s 가 %s 를 원천으로 받으면 거절한다', (target, source) => {
    expect(acceptsBracketSource(target, source)).toBe(false);
  });

  it('16강은 첫 결선 단계라 원천을 받는 표 항목이 없다', () => {
    expect(BRACKET_SOURCE_PHASES).not.toHaveProperty('round16');
    expect(BRACKET_SOURCE_PHASES).not.toHaveProperty('round12');
  });

  it.each([[null, 'semi'], ['final', null], [undefined, undefined], ['unknown', 'semi']])(
    '단계를 모르면(%s, %s) 거절한다',
    (target, source) => {
      expect(acceptsBracketSource(target, source)).toBe(false);
    },
  );
});
```

`dto/admin-bracket.dto.spec.ts:49-53` 의 기존 블록을 교체한다(`round16` 을 정식 단계로, 모르는 단계는 거절하는 대조군 추가):

```ts
describe('12강·16강·8강 입력 계약', () => {
  it.each(['round12', 'round16', 'quarter'])('%s를 정식 단계로 받는다', async (phase) => {
    expect(await validate(plainToInstance(CreateGroupDto, { name: '결선', phase }))).toHaveLength(0);
  });
  it('모르는 단계는 거절한다 (목록을 느슨하게 풀지 않았는지 대조)', async () => {
    const errors = await validate(plainToInstance(CreateGroupDto, { name: '결선', phase: 'round32' }));
    expect(errors.some((error) => error.property === 'phase')).toBe(true);
  });
  it('단계 목록은 조별 → 16강 → 12강 → 8강 → … 순서로 DB enum 순서와 같다', () => {
    expect(TOURNAMENT_GROUP_PHASES).toEqual(['group', 'round16', 'round12', 'quarter', 'semi', 'final', 'third_place']);
  });
  it('부전승은 boolean만 받는다', async () => {
    const errors = await validate(plainToInstance(CreateGroupTeamDto, { groupId: '00000000-0000-4000-8000-000000000001', registrationId: '00000000-0000-4000-8000-000000000002', isBye: 'true' }));
    expect(errors.some((error) => error.property === 'isBye')).toBe(true);
  });
});
```
같은 파일 import 에 `TOURNAMENT_GROUP_PHASES` 를 추가한다(`import { …, TOURNAMENT_GROUP_PHASES } from './admin-bracket.dto';`).

`tournament-bracket.service.spec.ts` — ① `'12강의 다섯 번째 부전승은 저장하지 않는다'` 테스트 바로 아래(`describe('라운드별 부전승 저장'` 위)에 추가:

```ts
  it('16강에는 부전승이 없다 — 조 팀 부전승 지정은 BYE_PHASE_INVALID 이고 아무것도 만들지 않는다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow({ phase: 'round16' }));
    await expect(service.createGroupTeam(ownerUser, 'tournament-1', { groupId: 'group-1', registrationId: 'reg-1', isBye: true }))
      .rejects.toMatchObject({ response: { code: 'BYE_PHASE_INVALID' } });
    expect(prisma.v1TournamentGroupTeam.create).not.toHaveBeenCalled();
  });
```
② `describe('라운드별 부전승 저장'` 안, `'결승 부전승을 거절한다'` 바로 아래에 추가:

```ts
    it('16강 부전승 자리 저장을 거절한다 (12강 전용 부전승이 16강으로 번지지 않는다)', async () => {
      prisma.v1TournamentGroup.findFirst.mockResolvedValue(groupRow({ phase: 'round16' }));
      await expect(service.createBye(ownerUser, 'tournament-1', dto)).rejects.toMatchObject({ response: { code: 'BYE_PHASE_INVALID' } });
      expect(prisma.v1TournamentByeSlot.create).not.toHaveBeenCalled();
      expect(prisma.v1TournamentGroupTeam.create).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: 실행 — 실패 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket-phases.spec.ts src/tournaments/dto/admin-bracket.dto.spec.ts src/tournaments/tournament-bracket.service.spec.ts -t "acceptsBracketSource|16강|정식 단계|단계 목록|모르는 단계"`
Expected: `tournament-bracket-phases` FAIL(`Cannot find module`), DTO 스펙의 `round16` 정식 단계·목록 FAIL, 서비스 스펙의 16강 2건은 이미 PASS 일 수 있다 — 기존 코드가 `round12` 아닌 단계를 `BYE_PHASE_INVALID` 로 막기 때문이다. 이 둘은 **16강 부전승이 열리지 않았음을 고정하는 회귀 가드**이지 새 동작이 아니다(Step 4 이후에도 PASS 유지가 기대).

- [ ] **Step 3: 구현** — 모듈 신설

`apps/v1_api/src/tournaments/tournament-bracket-phases.ts`:

```ts
/**
 * `updateBracketSources` 가 대상 단계별로 받을 수 있는 바로 이전 단계들.
 * 16강과 12강은 둘 다 8강의 앞 단계이고 한 대회에 함께 쓰지는 않는다. 16강은 첫 결선 단계라 키가 없다.
 * 3·4위전은 4강의 패자만 받는다(승자/패자 구분은 호출부가 대상 단계로 정한다).
 */
export const BRACKET_SOURCE_PHASES: Readonly<Record<string, readonly string[]>> = {
  quarter: ['round16', 'round12'],
  semi: ['quarter'],
  final: ['semi'],
  third_place: ['semi'],
};

export function acceptsBracketSource(
  targetPhase: string | null | undefined,
  sourcePhase: string | null | undefined,
): boolean {
  if (!targetPhase || !sourcePhase) return false;
  return BRACKET_SOURCE_PHASES[targetPhase]?.includes(sourcePhase) ?? false;
}
```

`dto/admin-bracket.dto.ts:22`:

```ts
export const TOURNAMENT_GROUP_PHASES = ['group', 'round16', 'round12', 'quarter', 'semi', 'final', 'third_place'] as const;
```

`tournament-bracket.service.ts` — import 한 줄(`import { competitionMatchLabel } from './tournament-round-label';` 아래)과 세 군데 교체:

```ts
import { acceptsBracketSource } from './tournament-bracket-phases';
```
- `:851` 의 `const sourcePhase: Record<string, string> = { quarter: 'round12', semi: 'quarter', final: 'semi', third_place: 'semi' };` 줄을 **삭제**한다.
- `:856` `return !targetPhase || !phase || phase !== sourcePhase[targetPhase];` → `return !acceptsBracketSource(targetPhase, phase);`
- `:876` `if (!target.group || sourceMatch.group?.phase !== sourcePhase[target.group.phase]) throw` → `if (!target.group || !acceptsBracketSource(target.group.phase, sourceMatch.group?.phase)) throw`

`sourcePhase` 가 더 남아 있지 않은지 확인: `grep -n "sourcePhase\b" src/tournaments/tournament-bracket.service.ts` → `sourcePhase` 라는 이름은 `sourceMatch.group?.phase` 같은 속성 접근만 있고 맵 선언·인덱싱(`sourcePhase[`)은 0건.

- [ ] **Step 4: 실행 — 통과 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket-phases.spec.ts src/tournaments/dto/admin-bracket.dto.spec.ts src/tournaments/tournament-bracket.service.spec.ts`
Expected: PASS (전체). 이어서 `./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"` → 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/tournaments/tournament-bracket-phases.ts apps/v1_api/src/tournaments/tournament-bracket-phases.spec.ts
git commit -m "feat(bracket): 16강 단계 서버 규칙 — DTO 단계·연결 인접표(8강 ← 12강|16강)" -- apps/v1_api/src/tournaments/tournament-bracket-phases.ts apps/v1_api/src/tournaments/tournament-bracket-phases.spec.ts apps/v1_api/src/tournaments/dto/admin-bracket.dto.ts apps/v1_api/src/tournaments/dto/admin-bracket.dto.spec.ts apps/v1_api/src/tournaments/tournament-bracket.service.ts apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts
git show --stat HEAD
```
Expected: 위 6개 파일만.

---

### Task 2: 라벨 표 3벌 — 서버 · 시드 사본 · (웹은 Task 6)

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournament-round-label.ts:2-10`, `tournament-round-label.spec.ts`
- Modify: `apps/v1_api/prisma/seed-tournament-round-label.ts:4-12`

`round16` 은 `tournamentRoundLabel` 의 `TOURNAMENT_PHASE_LABEL` 에서 '16강' 으로 풀린다. `isKnockoutRound` 의 `/^(\d+강|…)$/` 는 이미 `16강` 을 결선으로 본다(조 이름을 붙이지 않는다) — 코드 변경 없이 표 행만 필요하다. 시드 사본은 `seed-alpha-tournament-qa.spec.ts:138` 이 서버 표와 `toEqual` 로 같음을 단언하므로 **한쪽만 고치면 그 기존 스펙이 red** 다.

- [ ] **Step 1: 실패하는 테스트** — `tournament-round-label.spec.ts` 의 두 표에 행 추가

`tournamentRoundLabel` 의 `it.each([...])` 에 `['round16', '16강'],`·`['16강', '16강'],` 를 `['semi', '4강']` 위에 넣고, `competitionMatchLabel` 표(`it.each<[string, CompetitionMatchLabelInput, string]>`)에 한 행 추가:

```ts
    ['16강은 결선이라 조 이름을 붙이지 않는다', { groupName: '16강', round: 'round16' }, '16강'],
    ['16강 2차전은 차수만 붙는다', { groupName: '16강', round: '16강', legNumber: 2 }, '16강 2차'],
```

- [ ] **Step 2: 실행 — 실패 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-round-label.spec.ts`
Expected: `round16 → 16강` 행 FAIL(`'round16'` 그대로 반환), `'16강'` 행들은 이미 PASS(모르는 값은 그대로 두는 규칙) — 그래서 red 의 실체는 `round16` 행 하나다.

- [ ] **Step 3: 구현** — 두 표에 같은 한 줄

`tournament-round-label.ts` 와 `prisma/seed-tournament-round-label.ts` 의 표에서 `round12: '12강',` 위에:

```ts
  round16: '16강',
```

- [ ] **Step 4: 실행 — 통과 확인 (시드 사본 동일성 포함)**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-round-label.spec.ts src/tournaments/seed-alpha-tournament-qa.spec.ts`
Expected: PASS. (시드 파일만 빼먹으면 `seed-alpha-tournament-qa.spec.ts:138` 의 `toEqual` 이 red — 이 단언이 두 사본 동기화를 지킨다.)

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(bracket): 16강 라운드 라벨(서버·시드 사본)" -- apps/v1_api/src/tournaments/tournament-round-label.ts apps/v1_api/src/tournaments/tournament-round-label.spec.ts apps/v1_api/prisma/seed-tournament-round-label.ts
git show --stat HEAD
```

---

### Task 3: 템플릿 planner — 토너먼트 16팀 (+3·4위전)

**Files:**
- Modify: `apps/v1_api/src/tournaments/templates/bracket-template-plan.ts` (PR-1b 산출물)
- Modify: `apps/v1_api/src/tournaments/templates/dto/bracket-template.dto.ts` (size 캐스트)
- Test: `apps/v1_api/src/tournaments/templates/bracket-template-plan.spec.ts`, `dto/bracket-template.dto.spec.ts`

**Interfaces:**
- Consumes: 1b 의 `planBracketTemplate`, 표 `GROUP_NAME`·`ROUND_LABEL`·`FIXTURES_IN_PHASE`(`Record<KnockoutPhase, …>` — `KnockoutPhase = Exclude<V1TournamentGroupPhase, 'group'>` 라 격리 client 에 `round16` 이 있으면 **세 표에 키가 없을 때 tsc 가 red** 가 된다. 이것이 표 누락을 잡는 컴파일 가드다).
- Produces: `BracketTemplateInput` knockout `size: 4 | 8 | 12 | 16`. 16 = 그룹 5개(16강·8강·4강·결승·3위 결정전), 경기 16+(3·4위전 없으면 15), 연결 16(없으면 14), ENTRY 16, BYE 0, ByeSlot 0. 연결: 16강 `2i-1`·`2i` 번 WINNER → 8강 `i` 번 HOME·AWAY.

- [ ] **Step 1: 실패하는 테스트 작성** — `bracket-template-plan.spec.ts`

① `describe('planBracketTemplate — 개수 계약…')` 안, `'knockout 12 + 3·4위전 …'` 테스트 아래에 추가:

```ts
  it('knockout 16 + 3·4위전 = 경기 16(8+4+2+1+1) · 연결 16(8강←16강 8, 4강←8강 4, 결승←4강 2, 3위←4강 2) · ENTRY 16 · BYE 0', () => {
    const p = plan({ kind: 'knockout', size: 16, thirdPlace: true });
    expect(sizes(p)).toEqual({ groups: 5, fixtures: 16, edges: 16, entry: 16, bye: 0, byeSlots: 0 });
    expect(p.groups.map((g) => [g.name, g.phase])).toEqual([
      ['16강', 'round16'], ['8강', 'quarter'], ['4강', 'semi'], ['결승', 'final'], ['3위 결정전', 'third_place'],
    ]);
    const perRound = new Map<string, number>();
    for (const f of p.fixtures) perRound.set(f.round, (perRound.get(f.round) ?? 0) + 1);
    expect([...perRound]).toEqual([['16강', 8], ['8강', 4], ['4강', 2], ['결승', 1], ['3·4위전', 1]]);
  });

  it('knockout 16 (3·4위전 없음) = 경기 15 · 연결 14 · 조 4개', () => {
    const p = plan({ kind: 'knockout', size: 16, thirdPlace: false });
    expect(sizes(p)).toEqual({ groups: 4, fixtures: 15, edges: 14, entry: 16, bye: 0, byeSlots: 0 });
    expect(p.groups.map((g) => g.phase)).toEqual(['round16', 'quarter', 'semi', 'final']);
  });
```

② 새 `describe` 를 `'12강 배선'` 블록 아래에 추가:

```ts
describe('planBracketTemplate — 16강 배선(스펙 S2)', () => {
  const p = plan({ kind: 'knockout', size: 16, thirdPlace: true });
  const incoming = (key: string) => p.edges.filter((e) => e.targetFixtureKey === key);

  it('16강 2i-1·2i 번 경기 승자 → 8강 i 번 경기 홈·어웨이', () => {
    for (const i of [1, 2, 3, 4]) {
      expect(incoming(`quarter-${i}`).map((e) => [e.sourceFixtureKey, e.outcome, e.targetSide]).sort()).toEqual([
        [`round16-${2 * i - 1}`, 'WINNER', 'HOME'],
        [`round16-${2 * i}`, 'WINNER', 'AWAY'],
      ]);
    }
  });

  it('16강 ENTRY 자리는 1~16 이 경기 i 번 홈=2i-1 · 어웨이=2i 번에 쓰이고 8강 이후 경기는 자리를 쓰지 않는다', () => {
    const slotOf = (key: string | null) => p.slots.find((s) => s.key === key)?.position ?? null;
    for (const f of p.fixtures.filter((x) => x.groupKey === 'round16')) {
      const n = Number(f.key.split('-')[1]);
      expect([slotOf(f.homeSlotKey), slotOf(f.awaySlotKey)]).toEqual([2 * n - 1, 2 * n]);
    }
    for (const f of p.fixtures.filter((x) => x.groupKey !== 'round16')) expect([f.homeSlotKey, f.awaySlotKey]).toEqual([null, null]);
  });

  it('16강엔 부전승이 없다 — BYE 자리·ByeSlot 이 없고 LOSER 연결은 4강 → 3·4위전 둘뿐이다', () => {
    expect(p.slots.some((s) => s.kind === 'BYE')).toBe(false);
    expect(p.byeSlots).toEqual([]);
    expect(p.edges.filter((e) => e.outcome === 'LOSER').map((e) => e.sourceFixtureKey).sort()).toEqual(['semi-1', 'semi-2']);
  });

  it('경기 번호는 16강 1~8 → 8강 9~12 → 4강 13~14 → 결승 15 → 3·4위전 16 (offset 반영)', () => {
    const shifted = plan({ kind: 'knockout', size: 16, thirdPlace: true }, 10);
    expect(shifted.fixtures.map((f) => [f.round, f.fixtureNumber])).toEqual([
      ...[11, 12, 13, 14, 15, 16, 17, 18].map((n) => ['16강', n]),
      ...[19, 20, 21, 22].map((n) => ['8강', n]),
      ['4강', 23], ['4강', 24], ['결승', 25], ['3·4위전', 26],
    ]);
  });
});
```

③ 기존 두 곳을 고친다.
- `'모든 템플릿이 지켜야 할 DB 불변식'` 의 `inputs` 에 `{ kind: 'knockout', size: 16, thirdPlace: false },` `{ kind: 'knockout', size: 16, thirdPlace: true },` 를 12 행 아래에 추가(참조 무결성·유일 제약·번호 연속이 16 에도 적용).
- `'… 거부'` 의 `it.each([...])` 에서 `[{ kind: 'knockout', size: 16, thirdPlace: true }],` 행을 아래 두 행으로 **교체**한다(16 은 이제 정식 크기 — 범위 밖 대조군은 10·20):

```ts
    [{ kind: 'knockout', size: 10, thirdPlace: false }],
    [{ kind: 'knockout', size: 20, thirdPlace: true }],
```

`dto/bracket-template.dto.spec.ts` 의 `'토너먼트 본문을 입력으로 바꾼다'` 테스트에 한 줄 추가:

```ts
    expect(toBracketTemplateInput(await run({ kind: 'knockout', size: 16, thirdPlace: true }))).toEqual({ kind: 'knockout', size: 16, thirdPlace: true });
```

- [ ] **Step 2: 실행 — 실패 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/bracket-template-plan.spec.ts src/tournaments/templates/dto/bracket-template.dto.spec.ts`
Expected: 16 관련 테스트 FAIL — `BRACKET_TEMPLATE_UNSUPPORTED`(`토너먼트는 4강·8강·12강으로만 …`), 범위 밖 `size: 10`·`20` 행은 PASS(대조군).

- [ ] **Step 3: 구현** — `bracket-template-plan.ts` 를 다섯 군데 고친다(1b 구현이 줄 단위로 다르면 같은 의미로 적용).

(a) 입력 유니온:
```ts
  | { kind: 'knockout'; size: 4 | 8 | 12 | 16; thirdPlace: boolean }
```
(b) 세 표에 `round16` 키(`round12` 행 위):
```ts
const GROUP_NAME: Record<KnockoutPhase, string> = {
  round16: '16강', round12: '12강', quarter: '8강', semi: '4강', final: '결승', third_place: '3위 결정전',
};
const ROUND_LABEL: Record<KnockoutPhase, string> = {
  round16: '16강', round12: '12강', quarter: '8강', semi: '4강', final: '결승', third_place: '3·4위전',
};
const FIXTURES_IN_PHASE: Record<KnockoutPhase, number> = { round16: 8, round12: 4, quarter: 4, semi: 2, final: 1, third_place: 1 };
```
(c) `planKnockout` 의 단계 목록 — `if (input.size === 12) phases.push('round12');` 바로 위에:
```ts
  if (input.size === 16) phases.push('round16');
```
(d) 연결선 — `if (input.size === 12) for (const n of range(4)) link(\`round12-${n}\`, …)` 줄 아래에:
```ts
  // 16강 2i-1·2i 번 승자 → 8강 i 번 홈·어웨이. 16강엔 부전승 자리가 없다.
  if (input.size === 16) {
    for (const n of range(8)) link(`round16-${n}`, 'WINNER', `quarter-${Math.ceil(n / 2)}`, n % 2 === 1 ? 'HOME' : 'AWAY');
  }
```
(e) 입력 검증 — `build()` 의 `case 'knockout'`:
```ts
      if (!([4, 8, 12, 16] as readonly number[]).includes(input.size)) unsupported('토너먼트는 4강·8강·12강·16강으로만 만들 수 있어요.');
```
(`input.size >= 8` 인 8강→4강 연결 블록과 첫 단계 ENTRY 자리 생성 루프는 단계 이름에 의존하지 않아 16 에서도 그대로 맞다 — `firstPhase` 가 `round16` 이 되어 ENTRY 16개가 생긴다.)

`dto/bracket-template.dto.ts` 의 `as 4 | 8 | 12` → `as 4 | 8 | 12 | 16`.

- [ ] **Step 4: 실행 — 통과 확인**

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates` 후 `./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"`
Expected: PASS(전체 templates 디렉터리 — 12강·리그 기존 테스트 회귀 포함), tsc 0.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(bracket): 대진 템플릿 토너먼트 16팀(16강 시작) 지원" -- apps/v1_api/src/tournaments/templates/bracket-template-plan.ts apps/v1_api/src/tournaments/templates/bracket-template-plan.spec.ts apps/v1_api/src/tournaments/templates/dto/bracket-template.dto.ts apps/v1_api/src/tournaments/templates/dto/bracket-template.dto.spec.ts
git show --stat HEAD
```

---

### Task 4: 통합 스펙 — 템플릿 16 · DB 정렬 · 수동 연결 · 부전승 거부 (PostgreSQL)

단위 테스트가 못 보는 세 가지를 실제 DB 로 고정한다. ① 1a 의 `BEFORE 'round12'` 덕에 `orderBy: { phase: 'asc' }` 가 16강을 맨 앞(조별 다음)에 정렬하는지 ② 템플릿이 만든 연결과 수동 `updateBracketSources` 가 같은 인접 규칙을 따르는지 ③ 16강 조에 부전승 자리가 DB 에 생기지 않는지.

**Files:**
- Create: `apps/v1_api/test/tournaments/bracket-round16.integration-spec.ts`

**Interfaces:**
- Consumes: `BracketTemplateService`(1b) · `TournamentBracketService.createGroup/createFixture/createBye/updateBracketSources/getBracket` · `seedBracketTournament`(1b `test/helpers/bracket-canvas-fixture.ts`) · `TOURNAMENT_DETAIL_INCLUDE`(`tournaments-read.query.ts`).

- [ ] **Step 1: 스펙 작성** — `apps/v1_api/test/tournaments/bracket-round16.integration-spec.ts`

```ts
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService } from '../../src/games/games.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { TOURNAMENT_DETAIL_INCLUDE } from '../../src/tournaments/tournaments-read.query';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament } from '../helpers/bracket-canvas-fixture';

const prisma = new PrismaService();
const adminContext = new AdminContextService(prisma);
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const templates = new BracketTemplateService(prisma, adminContext, games);
const bracket = new TournamentBracketService(prisma, adminContext, games);
const user = { id: ids.adminUserId, email: 'round16-admin@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

const liveFixtures = (tournamentId: string) => prisma.v1TournamentMatchDetails.findMany({
  where: { tournamentId, teamMatch: { deletedAt: null } },
  orderBy: { fixtureNumber: 'asc' },
});

describe('16강 단계 (PostgreSQL)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for isolated round16 verification');
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('템플릿 knockout 16 + 3·4위전: 조 5 · 자리 16 · 경기 16 · 연결 16, 16강 2i-1·2i → 8강 i 번 홈·어웨이', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko16', format: 'knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 16, thirdPlace: true }))
      .resolves.toEqual({ groups: 5, slots: 16, fixtures: 16, edges: 16 });

    const fixtures = await liveFixtures(tournamentId);
    expect(fixtures.map((f) => f.round)).toEqual([
      ...Array(8).fill('16강'), ...Array(4).fill('8강'), '4강', '4강', '결승', '3·4위전',
    ]);
    const round16 = fixtures.slice(0, 8);
    const quarters = fixtures.slice(8, 12);
    for (const [index, quarter] of quarters.entries()) {
      const incoming = await prisma.v1TournamentMatchAdvancementEdge.findMany({ where: { targetTeamMatchId: quarter.teamMatchId } });
      expect(incoming.every((e) => e.sourceOutcome === 'WINNER')).toBe(true);
      expect(Object.fromEntries(incoming.map((e) => [e.targetSide, e.sourceTeamMatchId]))).toEqual({
        HOME: round16[2 * index].teamMatchId,
        AWAY: round16[2 * index + 1].teamMatchId,
      });
    }
    expect(await prisma.v1TournamentByeSlot.count({ where: { group: { tournamentId } } })).toBe(0);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'BYE' } })).toBe(0);
  });

  it('조는 16강이 조별 다음 첫 결선으로 정렬된다 — 어드민 대진 조회와 공개 상세 조회 둘 다 (enum 순서 = BEFORE round12)', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko16-order', format: 'knockout', teamCount: 0 });
    await templates.apply(user, tournamentId, { kind: 'knockout', size: 16, thirdPlace: true });

    const admin = await bracket.getBracket(user, tournamentId);
    expect(admin.groups.map((g) => g.phase)).toEqual(['round16', 'quarter', 'semi', 'final', 'third_place']);

    const row = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId }, include: TOURNAMENT_DETAIL_INCLUDE });
    expect(row.groups.map((g) => g.phase)).toEqual(['round16', 'quarter', 'semi', 'final', 'third_place']);
  });

  it('수동 연결: 8강은 16강 경기를 원천으로 받고, 단계를 건너뛰거나 거꾸로 연결하면 BRACKET_SOURCE_PHASE_INVALID', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko16-manual', format: 'knockout', teamCount: 0 });
    const g16 = await bracket.createGroup(user, tournamentId, { name: '16강', phase: 'round16' });
    const gq = await bracket.createGroup(user, tournamentId, { name: '8강', phase: 'quarter' });
    const gs = await bracket.createGroup(user, tournamentId, { name: '4강', phase: 'semi' });
    const r1 = await bracket.createFixture(user, tournamentId, { groupId: g16.id, round: '16강', fixtureNumber: 1 });
    const r2 = await bracket.createFixture(user, tournamentId, { groupId: g16.id, round: '16강', fixtureNumber: 2 });
    const q1 = await bracket.createFixture(user, tournamentId, { groupId: gq.id, round: '8강', fixtureNumber: 1 });
    const s1 = await bracket.createFixture(user, tournamentId, { groupId: gs.id, round: '4강', fixtureNumber: 1 });

    await bracket.updateBracketSources(user, q1.id, { homeSourceFixtureId: r1.id, awaySourceFixtureId: r2.id });
    const linked = await bracket.getBracket(user, tournamentId);
    expect(linked.fixtures.find((f) => f.id === q1.id)?.bracketSources).toEqual(expect.arrayContaining([
      { fixtureId: r1.id, side: 'HOME', outcome: 'WINNER' },
      { fixtureId: r2.id, side: 'AWAY', outcome: 'WINNER' },
    ]));

    await expect(bracket.updateBracketSources(user, s1.id, { homeSourceFixtureId: r1.id }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_SOURCE_PHASE_INVALID' } });
    await expect(bracket.updateBracketSources(user, r2.id, { homeSourceFixtureId: q1.id }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_SOURCE_PHASE_INVALID' } });
    expect(await prisma.v1TournamentMatchAdvancementEdge.count({ where: { tournamentId } })).toBe(2);
  });

  it('16강 조에는 부전승 자리가 생기지 않는다 (12강 전용 규칙이 번지지 않았다는 대조군)', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko16-bye', format: 'knockout', teamCount: 0 });
    const g16 = await bracket.createGroup(user, tournamentId, { name: '16강', phase: 'round16' });
    await expect(bracket.createBye(user, tournamentId, { groupId: g16.id, sortOrder: 0 }))
      .rejects.toMatchObject({ response: { code: 'BYE_PHASE_INVALID' } });
    expect(await prisma.v1TournamentByeSlot.count({ where: { groupId: g16.id } })).toBe(0);
    expect(await prisma.v1TournamentGroupTeam.count({ where: { groupId: g16.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: 실행**

통합 스펙은 `DATABASE_URL` 이 있는 환경에서만 돈다. 로컬 DB 가 있으면(색인 Global Constraints: `migrate deploy` → `competition-config-backfill.cli` 후):

`cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --runInBand --testEnvironment "<rootDir>/test/helpers/isolated-integration-environment.cjs" --testMatch "<rootDir>/test/tournaments/bracket-round16.integration-spec.ts"`

Expected: PASS(4건). 로컬 DB 가 없으면 푸시 후 CI 의 `v1_api` integration 결과로 확인한다. 이 스펙은 Task 1·3 이 없으면 red(템플릿 16 거부·`createGroup` 의 `round16` 400)이므로 **구현 전에 CI 에서 한 번 red 를 본 뒤** 초록으로 바뀌는지 본다 — 로컬 DB 가 없고 구현 후에만 푸시한다면 "red → green" 확인은 단위 스펙(Task 1·3)이 맡는다는 점을 PR 본문에 적는다.

- [ ] **Step 3: 커밋**

```bash
git add apps/v1_api/test/tournaments/bracket-round16.integration-spec.ts
git commit -m "test(bracket): 16강 통합 스펙 — 템플릿 연결·DB 정렬·수동 연결·부전승 거부" -- apps/v1_api/test/tournaments/bracket-round16.integration-spec.ts
git show --stat HEAD
```

---

### Task 5: API 문서

**Files:**
- Modify: `docs/api/domains/tournaments.md` (`:389` · `:399` · `:417` 근처 · 1b 가 추가한 "대진 템플릿과 자리 배정" 절)

- [ ] **Step 1: 문서 갱신** — 줄 번호는 1a·1b 머지로 밀릴 수 있으므로 `grep -n` 으로 찾아 고친다.

```bash
grep -n "CreateGroupDto.phase\|round12→quarter→semi→final\|12강 정원 12팀\|size. 4·8·12\|12강은 ENTRY 자리 8" docs/api/domains/tournaments.md
```
- `CreateGroupDto.phase`: `group | round12 | quarter | semi | final | third_place` → `group | round16 | round12 | quarter | semi | final | third_place`
- `source는 같은 대회의 바로 이전 group.phase: round12→quarter→semi→final.` → `source는 같은 대회의 바로 이전 group.phase: round16 또는 round12 → quarter → semi → final(16강과 12강은 둘 다 8강의 앞 단계, 한 대회에 함께 쓰지 않는다).` 3·4위전 문장은 그대로.
- 부전승 정원 줄(`12강 정원 12팀/부전승 4팀, 8강 …`)에 이어: `16강은 부전승이 없어 `400 BYE_PHASE_INVALID`(group/final/third_place 와 같다).`
- 템플릿 절의 `knockout`: `size` 4·8·12 → `size` 4·8·12·16, 줄 끝에 한 줄 추가: `- 16강은 ENTRY 자리 16(16강 8경기, 2i-1·2i 번 승자 → 8강 i 번 홈·어웨이), BYE 자리·ByeSlot 없음. 조 이름·round 는 '16강'(phase round16).`
- 같은 절의 오류 줄 `BRACKET_TEMPLATE_UNSUPPORTED(범위 밖 …)` 은 그대로(16 은 범위 안).
- 정렬: `GET /admin/tournaments/:id/bracket`·공개 상세의 `groups[]` 는 `phase` enum 순서(조별 → 16강 → 12강 → 8강 → 4강 → 결승 → 3·4위전)로 나온다고 한 줄 명시.

- [ ] **Step 2: 커밋 (changeset 은 Task 10 에서 한 번에)**

```bash
git commit -m "docs(api): 16강 단계 계약(단계 목록·연결 인접·템플릿 크기·정렬)" -- docs/api/domains/tournaments.md
git show --stat HEAD
```

---

### Task 6: 웹 단계 타입 · 라벨 · 결선 단계 판정 한 곳

**Files:**
- Modify: `apps/v1_web/src/types/api.ts:3456`
- Modify: `apps/v1_web/src/lib/tournament-round-label.ts:7-15`, `tournament-round-label.test.ts`
- Create: `apps/v1_web/src/lib/tournament-bracket-rounds.test.ts`

**Interfaces:**
- Produces: `V1TournamentGroupPhase` 에 `'round16'`, `KNOCKOUT_PHASES`(`['round16','round12','quarter','semi','final','third_place']`), `isKnockoutPhase(phase: string): boolean`.
- `BYE_ROUNDS`(`lib/tournament-bracket-rounds.ts`)에는 **`round16` 을 넣지 않는다** — 16강엔 부전승이 없고, 이 표가 없으면 `byeRound('round16')` 이 `undefined` 라서 그래프·카드·부전승 UI 가 16강을 부전승 가능 단계로 보지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/tournament-round-label.test.ts` — import 를 `import { KNOCKOUT_PHASES, competitionMatchLabel, isKnockoutPhase, tournamentRoundLabel, type CompetitionMatchLabelInput } from './tournament-round-label';` 로 바꾸고 `import type { V1TournamentGroupPhase } from '@/types/api';` 추가. 첫 `it.each` 표에 `['round16', '16강'],` 를 `['quarter', '8강'],` 위에, `competitionMatchLabel` 표(서버와 같은 표 — Task 2 의 두 행)에 같은 두 행을 추가한 뒤 파일 끝에:

```ts
describe('KNOCKOUT_PHASES', () => {
  // V1TournamentGroupPhase 에 값이 늘면 이 Record 가 컴파일 오류로 먼저 알려 준다(결선 단계 누락 = 공개 대진표에서 경기 소실).
  const everyKnockoutPhase: Record<Exclude<V1TournamentGroupPhase, 'group'>, true> = {
    round16: true, round12: true, quarter: true, semi: true, final: true, third_place: true,
  };

  it('조별을 뺀 모든 단계를 큰 단계부터 담는다', () => {
    expect([...KNOCKOUT_PHASES].sort()).toEqual(Object.keys(everyKnockoutPhase).sort());
    expect(KNOCKOUT_PHASES.map(tournamentRoundLabel)).toEqual(['16강', '12강', '8강', '4강', '결승', '3·4위전']);
  });

  it('isKnockoutPhase — 결선 단계만 참이다', () => {
    expect(KNOCKOUT_PHASES.every((phase) => isKnockoutPhase(phase))).toBe(true);
    expect(['group', '', 'league_r1', 'round32'].some((phase) => isKnockoutPhase(phase))).toBe(false);
  });
});
```

`lib/tournament-bracket-rounds.test.ts` (신규):

```ts
import { describe, expect, it } from 'vitest';
import { byeRound } from './tournament-bracket-rounds';

describe('byeRound — 부전승이 가능한 단계', () => {
  it('12강·8강·4강만 부전승 단계이고 다음 단계가 이어진다', () => {
    expect(byeRound('round12')).toMatchObject({ label: '12강', next: 'quarter' });
    expect(byeRound('quarter')).toMatchObject({ label: '8강', next: 'semi' });
    expect(byeRound('semi')).toMatchObject({ label: '4강', next: 'final' });
  });

  it('16강은 부전승이 없다 (12강 전용 부전승이 16강으로 번지지 않는다)', () => {
    expect(byeRound('round16')).toBeUndefined();
    expect(byeRound('final')).toBeUndefined();
    expect(byeRound('group')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

Run: `cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/tournament-round-label.test.ts src/lib/tournament-bracket-rounds.test.ts`
Expected: `round16 → 16강` FAIL, `KNOCKOUT_PHASES` import 오류로 라벨 테스트 파일 FAIL, `tournament-bracket-rounds.test.ts` 는 PASS(현행 표 그대로를 고정하는 회귀 가드 — 기대된 PASS).

- [ ] **Step 3: 구현**

`types/api.ts:3456`:
```ts
export type V1TournamentGroupPhase = 'group' | 'round16' | 'round12' | 'quarter' | 'semi' | 'final' | 'third_place';
```
`lib/tournament-round-label.ts` — `PHASE_LABEL` 에 `round16: '16강',`(`round12` 위)를 넣고, 파일의 `tournamentRoundLabel` 아래에 추가:

```ts
/** 결선 단계 코드, 큰 단계부터. 공개 대진표가 "결선 경기인가"를 판정할 때 쓴다. */
export const KNOCKOUT_PHASES = ['round16', 'round12', 'quarter', 'semi', 'final', 'third_place'] as const;

export function isKnockoutPhase(phase: string): boolean {
  return (KNOCKOUT_PHASES as readonly string[]).includes(phase);
}
```

- [ ] **Step 4: 타입이 잡아 주는 누락 수정 후 통과**

Run: `cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: `bracket-group-helpers.ts` 의 `KNOCKOUT_PHASE_BASE_NAME: Record<Exclude<V1TournamentGroupPhase, 'group'>, string>` 가 `round16` 키 누락으로 red — 유니온을 넓힌 결과를 타입이 잡은 것이다. 같은 커밋에서 그 표에 `round16: '16강',` 한 줄을 추가한다(나머지 어드민 변경은 Task 8).

Run: `cd apps/v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && ./node_modules/.bin/vitest run src/lib/tournament-round-label.test.ts src/lib/tournament-bracket-rounds.test.ts`
Expected: tsc 0, PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_web/src/lib/tournament-bracket-rounds.test.ts
git commit -m "feat(bracket): 웹 16강 단계 타입·라벨과 결선 단계 판정 상수" -- apps/v1_web/src/types/api.ts apps/v1_web/src/lib/tournament-round-label.ts apps/v1_web/src/lib/tournament-round-label.test.ts apps/v1_web/src/lib/tournament-bracket-rounds.test.ts "apps/v1_web/src/app/admin/tournaments/[id]/bracket-group-helpers.ts"
git show --stat HEAD
```

---

### Task 7: 공개 화면 — 대진표 열 순서 · 진행 단계 · 결과 · 대회 상세

16강 경기가 **조용히 사라지거나 8강 뒤로 밀리지 않게** 4곳을 연다. 각각 "알려진 단계만 인정"하는 구조라 `round16` 을 빼면 경기가 그냥 빠진다(결과 화면 `knockoutKind` null → 목록 제외, 대회 상세 `knockoutRoundLabels` 미매칭 → 결선 대진 제외).

**Files:**
- Modify: `apps/v1_web/src/components/tournaments/tournament-bracket.tsx:29-70`, `tournament-bracket.test.ts`
- Modify: `apps/v1_web/src/components/tournaments/tournament-progress-stepper.tsx:139-146`, `tournament-progress-stepper.test.ts`
- Modify: `apps/v1_web/src/app/tournaments/[id]/results/results-page-client.tsx` (`:398-404` · `:441-444` · `:820-830`), `results-page-client.test.tsx`
- Modify: `apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx` (import `:24` · `:1660` · `:2031` · `:2043`), `tournament-detail-client.test.ts`
- Modify (테스트만): `apps/v1_web/src/components/public-game-records/schedule-grouping.test.ts` — 공개 일정 정렬은 `compareTournamentRounds` 의 `\d+강` 정규식에 의존하므로 구현 변경 없이 16강 케이스만 고정한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tournament-bracket.test.ts` 의 `describe('12강·8강 결선 정렬'` 아래에 추가(`makeFixture`·`makeGroup` 는 파일 상단 팩토리):

```ts
describe('16강 결선 정렬', () => {
  it('한글 라운드와 정식 단계를 같은 순서로 묶는다 (16강 → 8강 → 4강 → 결승 → 3·4위전)', () => {
    const groups = [makeGroup({ id: 'r16', phase: 'round16' }), makeGroup({ id: 'q', phase: 'quarter' })];
    const rounds = groupFixturesByRound([
      makeFixture({ id: 'third', fixtureNumber: 1, round: '3·4위전' }),
      makeFixture({ id: 'f', fixtureNumber: 1, round: '결승' }),
      makeFixture({ id: 's', fixtureNumber: 1, round: '4강' }),
      makeFixture({ id: 'q', fixtureNumber: 3, round: '8강', groupId: 'q' }),
      makeFixture({ id: 'r', fixtureNumber: 1, round: '16강', groupId: 'r16' }),
    ], groups);
    expect(rounds.map((round) => round.label)).toEqual(['16강', '8강', '4강', '결승', '3·4위전']);
  });

  it('영문 단계 코드(round16)와 한글 라운드(16강)는 한 열로 합쳐진다', () => {
    const rounds = groupFixturesByRound([
      makeFixture({ id: 'a', fixtureNumber: 2, round: 'round16' }),
      makeFixture({ id: 'b', fixtureNumber: 1, round: '16강' }),
    ], []);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].label).toBe('16강');
    expect(rounds[0].fixtures.map((f) => f.id)).toEqual(['b', 'a']);
  });

  it('운영자가 라운드 이름을 임의로 적어도 16강 조에 속하면 16강 열이 된다', () => {
    const rounds = groupFixturesByRound([makeFixture({ id: 'x', fixtureNumber: 1, round: 'A매치', groupId: 'r16' })], [makeGroup({ id: 'r16', phase: 'round16' })]);
    expect(rounds.map((round) => round.label)).toEqual(['16강']);
  });
});
```

`tournament-progress-stepper.test.ts` 의 `describe('buildTournamentStages — 한국어 라운드 라벨'` 안, `'각 라운드의 경기 번호가 1이어도 …'` 아래:

```ts
  it.each([
    ['group', 'semi', 'quarter', 'round16', 'final'],
    ['조별리그', '4강', '8강', '16강', '결승'],
  ])('16강이 있으면 16강 → 8강 → 4강 → 결승 순으로 세운다 (%s)', (...rounds) => {
    const stages = buildTournamentStages(tournament({
      format: 'group_knockout',
      status: 'in_progress',
      fixtures: rounds.map((round) => fixture({ round })),
    }));
    expect(stages.map((stage) => stage.label)).toEqual(['조별리그', '16강', '8강', '4강', '결승']);
  });
```

`results-page-client.test.tsx` 파일 끝에 추가(`baseTournament`·`leagueFixtureWithVideo`·`leagueGroup` 는 파일 상단 팩토리):

```ts
describe('ResultsPageContent — 16강 결선 결과', () => {
  it('라운드 이름이 16강인 완료 경기는 결선 결과에 남는다 (알려진 단계가 아니면 조용히 빠지던 자리)', () => {
    const tournament = baseTournament({
      format: 'knockout',
      fixtures: [{ ...leagueFixtureWithVideo(), id: 'fx-r16', round: '16강', videos: [] }],
    });
    render(<ResultsPageContent tournament={tournament} />);
    expect(screen.getByRole('link', { name: /성수 FC 3 대 1 한강 유나이티드/ })).toBeInTheDocument();
    expect(screen.getAllByText('16강').length).toBeGreaterThan(0);
  });

  it('phase=round16 조에 속한 경기는 round 문자열과 무관하게 16강으로 보인다', () => {
    const tournament = baseTournament({
      format: 'group_knockout',
      groups: [{ ...leagueGroup({ id: 'g-r16', name: '16강', standings: [] }), phase: 'round16' }],
      fixtures: [{ ...leagueFixtureWithVideo(), id: 'fx-r16-g', groupId: 'g-r16', round: 'A매치', videos: [] }],
    });
    render(<ResultsPageContent tournament={tournament} />);
    expect(screen.getByRole('link', { name: /성수 FC 3 대 1 한강 유나이티드/ })).toBeInTheDocument();
    expect(screen.getAllByText('16강').length).toBeGreaterThan(0);
  });
});
```

`tournament-detail-client.test.ts` 의 `describe('partitionTournamentSections'` 안, `describe('knockout format'` 위에:

```ts
  describe('group_knockout format — 16강', () => {
    it('phase=round16 조의 경기는 조별 일정이 아니라 결선 대진으로 간다', () => {
      const groupA = makeGroup({ id: 'gA', phase: 'group' });
      const group16 = makeGroup({ id: 'g16', phase: 'round16' });
      const result = partitionTournamentSections(
        'group_knockout',
        [makeFixture({ id: 'fA', groupId: 'gA' }), makeFixture({ id: 'f16', groupId: 'g16' })],
        [groupA, group16],
      );
      expect(result.groupFixtures.map((f) => f.id)).toEqual(['fA']);
      expect(result.knockoutFixtures.map((f) => f.id)).toEqual(['f16']);
    });

    it('조 없는 경기도 라운드가 16강·round16 이면 결선 대진에 들어가고, 조별 라운드는 들어가지 않는다', () => {
      const result = partitionTournamentSections('group_knockout', [
        makeFixture({ id: 'ko', groupId: null, round: '16강' }),
        makeFixture({ id: 'ko-code', groupId: null, round: 'round16' }),
        makeFixture({ id: 'grp', groupId: null, round: '조별 1라운드' }),
      ], []);
      expect(result.knockoutFixtures.map((f) => f.id).sort()).toEqual(['ko', 'ko-code']);
    });
  });
```

`components/public-game-records/schedule-grouping.test.ts` 의 `describe('groupScheduleEntries'` 안, 12강 정렬 케이스 아래(구현 변경 없는 회귀 가드 — 공개 일정 정렬이 `compareTournamentRounds` 의 `\d+강` 크기에 기대므로 라벨이 깨지면 여기서 잡힌다):

```ts
  it('16강이 있으면 조별 다음 16강 → 8강 → 결승 순으로 정렬한다 (영문 코드·한글 라운드 혼재)', () => {
    const entries = [
      entry({ fixtureId: 'final', round: '결승', fixtureNumber: 1 }),
      entry({ fixtureId: 'quarter', round: '8강', fixtureNumber: 1 }),
      entry({ fixtureId: 'r16', round: '16강', fixtureNumber: 9 }),
      entry({ fixtureId: 'r16-code', round: 'round16', fixtureNumber: 8 }),
      entry({ fixtureId: 'a', round: 'group', groupName: 'A조', fixtureNumber: 1 }),
    ];
    expect(groupScheduleEntries(entries).flatMap(phase => phase.groups.map(group => group.label)))
      .toEqual(['A조', '16강', '8강', '결승']);
    expect(groupUnscheduledEntries(entries).map(group => group.label))
      .toEqual(['A조', '16강', '8강', '결승']);
  });
```

- [ ] **Step 2: 실행 — 실패 확인**

Run: `cd apps/v1_web && ./node_modules/.bin/vitest run src/components/tournaments/tournament-bracket.test.ts src/components/tournaments/tournament-progress-stepper.test.ts src/components/public-game-records/schedule-grouping.test.ts "src/app/tournaments/[id]/results/results-page-client.test.tsx" "src/app/tournaments/[id]/tournament-detail-client.test.ts" -t "16강"`
Expected: 새 테스트 전부 FAIL (열 순서가 `round16` 을 100 으로 보내 뒤로 밀림 / 결과 목록에서 소실 / 결선 대진에서 제외) 단 `schedule-grouping.test.ts` 16강 케이스는 구현 변경 없는 회귀 가드라 `tournamentRoundLabel`(Task 6) 이 이미 들어간 상태에서는 PASS 가 기대값이다 (아직 FAIL 이면 Task 6 선행 확인).

- [ ] **Step 3: 구현**

`tournament-bracket.tsx` — `PHASE_ORDER`·`PHASE_LABEL`·`getFixturePhase`:

```ts
const PHASE_ORDER: Record<string, number> = {
  round16: 0,
  round12: 1,
  quarter: 2,
  semi: 3,
  final: 4,
  third_place: 5,
};

const PHASE_LABEL: Record<string, string> = {
  round16: '16강',
  round12: '12강',
  // …나머지 그대로
};
```
`getFixturePhase` 의 `round12` 줄 위에 `if (normalized === 'round16' || normalized === '16강') return 'round16';` 를 추가한다.

`tournament-progress-stepper.tsx` 의 `ROUND_LABEL` 에 `round16: '16강',`(`round12` 위). 정렬은 `compareTournamentRounds` 가 라벨의 `\d+강` 크기로 정하므로 `tournamentRoundLabel('round16')`(Task 6) 이 '16강' 을 주면 추가 변경 없이 큰 단계(-16)가 먼저다.

`results-page-client.tsx`:
- `ROUND_LABEL_MAP` 에 `round16: '16강', '16강': '16강',`(`round12` 위).
- `switch (kindOf(f))` 의 `case 'round12':` 위에 `case 'round16':` 한 줄(같은 `earlierFixtures.push(f)` 분기).
- `export type KnockoutKind = 'final' | 'semi' | 'quarter' | 'round16' | 'round12' | 'third_place';`
- `KNOCKOUT_KIND_ORDER = { final: 0, semi: 1, quarter: 2, round12: 3, round16: 4, third_place: 5 }` (12강·16강은 한 대회에 함께 없으므로 상대 순서는 무관, 3·4위전만 맨 뒤를 유지).
- `KNOCKOUT_KIND_BY_LABEL` 에 `round16: 'round16', '16강': 'round16',`.
- 주석 `(결승 → 4강 → 3·4위전)` 의 열거는 건드리지 않는다.

`tournament-detail-client.tsx`:
- import `:24` → `import { KNOCKOUT_PHASES, competitionMatchLabel, tournamentRoundLabel } from '@/lib/tournament-round-label';`
- `const knockoutPhases = new Set(['round12', 'quarter', 'semi', 'final', 'third_place']);` → `const knockoutPhases = new Set<string>(KNOCKOUT_PHASES);`
- `const knockoutRoundLabels = ['round12', …, '3·4위전'];` → `const knockoutRoundLabels = [...KNOCKOUT_PHASES, ...KNOCKOUT_PHASES.map(tournamentRoundLabel)];` (영문 코드 6 + 한글 라벨 6, 이전 목록과 같은 집합에 16강 추가)
- `:1660` 안내 문구 `편성된 12강·8강·4강을 거쳐 …` → `편성된 16강·12강·8강·4강 중 해당하는 단계를 거쳐 결승에서 우승팀을 가려요. 부전승 팀은 경기 없이 다음 단계로 올라가요.` (이 문구를 단언하는 테스트가 있으면 같이 고친다: `grep -rn "편성된 12강" apps/v1_web/src` → 0건이어야 한다)

- [ ] **Step 4: 실행 — 통과 확인 (기존 12강 테스트 회귀 포함)**

Run: `cd apps/v1_web && ./node_modules/.bin/vitest run src/components/tournaments src/lib/tournament-round-label.test.ts "src/app/tournaments/[id]/results" "src/app/tournaments/[id]/tournament-detail-client.test.ts" "src/app/tournaments/[id]/bracket" src/components/public-game-records/schedule-grouping.test.ts && ./node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: PASS, tsc 0.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(bracket): 공개 대진표·진행 단계·결과·대회 상세에 16강 열 추가" -- apps/v1_web/src/components/tournaments/tournament-bracket.tsx apps/v1_web/src/components/tournaments/tournament-bracket.test.ts apps/v1_web/src/components/tournaments/tournament-progress-stepper.tsx apps/v1_web/src/components/tournaments/tournament-progress-stepper.test.ts "apps/v1_web/src/app/tournaments/[id]/results/results-page-client.tsx" "apps/v1_web/src/app/tournaments/[id]/results/results-page-client.test.tsx" "apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx" "apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.test.ts" apps/v1_web/src/components/public-game-records/schedule-grouping.test.ts
git show --stat HEAD
```

---

### Task 8: 어드민 — "+16강" 조 추가 · 직접 입력 단계 · 수동 경기 라운드 · 자동 생성 · 진출 연결 후보

**Files:**
- Modify: `apps/v1_web/src/app/admin/tournaments/[id]/bracket-group-helpers.ts` (`GROUP_PHASE_TEMPLATES`; `KNOCKOUT_PHASE_BASE_NAME` 은 Task 6 에서 처리됨), `bracket-group-helpers.test.ts`
- Modify: `bracket-group-quick-add.tsx` (단계 select), `bracket-group-card.tsx` (`roundOptions`), `bracket-tab.tsx` (`roundLabel` 삼항 · 중복 가드 · 진출 연결 후보 맵), 각 `.test.tsx`

**Interfaces:**
- 진출 연결 후보 맵이 `bracket-tab.tsx:848` 에 서버와 같은 인라인 표(`previous`)로 복제돼 있다. 서버 `acceptsBracketSource` 와 어긋나면 "후보가 없다"로 보이므로 **웹도 단일 표로 승격**한다: `lib/tournament-bracket-rounds.ts` 에 `BRACKET_SOURCE_PHASES`(서버와 같은 값) 추가 후 `bracket-tab.tsx` 가 이를 쓴다.
- 직접 입력의 단계 select 는 `<option>` 이 하드코딩이라 `GROUP_PHASE_TEMPLATES` 와 따로 놀 수 있다 — 같은 상수에서 map 으로 그린다(옵션 라벨은 기존 문구 유지: 조별/…/준결승/결승/3위 결정전).

- [ ] **Step 1: 실패하는 테스트 작성**

`bracket-group-helpers.test.ts` 의 `templateFor` describe 에 추가(파일 상단 `group()` 팩토리 사용):

```ts
  it('16강 템플릿: 단계 round16, 이름 "16강", 겹치면 번호를 붙인다', () => {
    expect(templateFor('round16', [])).toEqual({ name: '16강', phase: 'round16' });
    expect(templateFor('round16', [group({ name: '16강', phase: 'round16' })])).toEqual({ name: '16강 2', phase: 'round16' });
  });
```
같은 파일에 새 describe:

```ts
describe('GROUP_PHASE_TEMPLATES', () => {
  it('큰 단계부터 조별 → 16강 → 12강 → 8강 → 준결승 → 결승 → 3위 결정전 순서로 "+16강" 을 포함한다', () => {
    expect(GROUP_PHASE_TEMPLATES.map((t) => [t.phase, t.label])).toEqual([
      ['group', '조별'], ['round16', '16강'], ['round12', '12강'], ['quarter', '8강'],
      ['semi', '준결승'], ['final', '결승'], ['third_place', '3위 결정전'],
    ]);
  });
});
```
(import 에 `GROUP_PHASE_TEMPLATES` 추가.)

`lib/tournament-bracket-rounds.test.ts`(Task 6 신규)에 추가:

```ts
import { BRACKET_SOURCE_PHASES } from './tournament-bracket-rounds';

describe('BRACKET_SOURCE_PHASES — 서버 tournament-bracket-phases.ts 와 같은 표', () => {
  it('8강은 16강·12강을, 4강은 8강을, 결승·3·4위전은 4강을 원천으로 받는다', () => {
    expect(BRACKET_SOURCE_PHASES).toEqual({
      quarter: ['round16', 'round12'], semi: ['quarter'], final: ['semi'], third_place: ['semi'],
    });
  });
});
```

`bracket-tab.test.tsx` — `setKnockoutGroup` 시그니처를 `'round16' | 'round12' | 'quarter'` 로 넓히고(`count`: round16 16, round12 12, quarter 8 / 이름: `'16강'`·`'12강'`·`'8강'`), 기존 `it.each(['round12','quarter'])` 를 `['round16', 'round12', 'quarter']` 로 확장하되 기대값을 단계별로 분기:

```ts
  const ROUND_META = {
    round16: { label: '16강', fixtures: 8, participants: 16, byes: 0 },
    round12: { label: '12강', fixtures: 4, participants: 8, byes: 4 },
    quarter: { label: '8강', fixtures: 4, participants: 8, byes: 0 },
  } as const;
  it.each(['round16', 'round12', 'quarter'] as const)('%s 조는 리그 회전수 모달 없이 일반 경기만 생성해 화면에 표시한다', async (phase) => {
    const meta = ROUND_META[phase];
    setKnockoutGroup(phase, meta.byes);
    const showToast = renderTab();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '대진 자동 생성' })); });
    expect(screen.queryByRole('dialog', { name: '조별리그 대진 자동 생성' })).not.toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith(`${meta.label} 경기 일정 ${meta.fixtures}개를 자동으로 만들었어요.`, 'success');
    expect(bracketFixtures).toHaveLength(meta.fixtures);
    expect(bracketFixtures.every((f) => f.groupId === 'knockout' && f.round === meta.label)).toBe(true);
    const participants = bracketFixtures.flatMap((f) => [f.homeRegistrationId, f.awayRegistrationId]);
    expect(new Set(participants).size).toBe(meta.participants);
    expect(bracketGroups[0].groupTeams.filter((t) => t.isBye)).toHaveLength(meta.byes);
  });
```
(기존 단언 중 `대진 4경기` 텍스트·`4번 경기 수정` 버튼은 `meta.fixtures` 로 바꾼다. 이 테스트는 `knockoutSeedPairs(sorted)` 가 16팀을 8쌍으로 1vsN 페어링하는지도 실증한다.)

`bracket-group-card.test.tsx` 에 추가(`semiGroup`·`noopMutation` 사용, 기존 12강 테스트와 같은 렌더 헬퍼):

```ts
  it('16강 조의 수동 경기 라운드 선택지에 16강이 있고 부전승 유형은 쓸 수 없다', () => {
    const group = { ...semiGroup, id: 'r16', name: '16강', phase: 'round16' as const };
    const createBye = { mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof import('@/hooks/use-v1-api').useV1CreateBracketBye>;
    render(<BracketGroupCard group={group} allGroups={[group]} allStandings={[]} fixtures={[]}
      confirmedTeamItems={[{ id: 'reg-1', label: '강남FC' }]} assignGroupTeam={noopMutation() as unknown as ReturnType<typeof import('@/hooks/use-v1-api').useV1AssignGroupTeam>}
      createFixture={noopMutation()} createBye={createBye} isAutoGenerating={false} onAutoGenerate={vi.fn()} onEditGroup={vi.fn()}
      onDeleteGroup={vi.fn()} onRemoveGroupTeam={vi.fn()} autoFocus={false} showToast={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /직접 입력/ }));
    expect(within(screen.getByLabelText('라운드')).getAllByRole('option').map((o) => o.textContent)).toEqual(['라운드 선택', '16강', '12강', '8강', '4강', '결승', '3·4위전']);
    fireEvent.change(screen.getByLabelText('라운드'), { target: { value: '16강' } });
    expect(screen.getByLabelText('부전승')).toBeDisabled();
  });
```
(`within` 을 testing-library import 에 추가.)

조 추가 단계 select 는 `bracket-group-quick-add` 전용 테스트가 없으면 `bracket-tab.test.tsx` 의 기존 "+ 조" 버튼 테스트 인접에 추가: `'+16강' 버튼 클릭이 createGroup.mutate({name:'16강',phase:'round16'}) 를 호출한다`(기존 템플릿 버튼 테스트의 단언 형태를 복제 — `grep -n "GROUP_PHASE_TEMPLATES\|조 유형 템플릿" bracket-tab.test.tsx` 로 위치 확인).

- [ ] **Step 2: 실행 — 실패 확인**

Run: `cd apps/v1_web && ./node_modules/.bin/vitest run "src/app/admin/tournaments/[id]/bracket-group-helpers.test.ts" "src/app/admin/tournaments/[id]/bracket-group-card.test.tsx" "src/app/admin/tournaments/[id]/bracket-tab.test.tsx" src/lib/tournament-bracket-rounds.test.ts`
Expected: 16강 관련 FAIL (템플릿 표 미포함 · 라운드 옵션 없음 · 자동 생성이 `roundLabel` 삼항에서 16강을 '3·4위전' 으로 fallthrough · `BRACKET_SOURCE_PHASES` import 오류).

- [ ] **Step 3: 구현**

`bracket-group-helpers.ts`:
```ts
export const GROUP_PHASE_TEMPLATES: { phase: V1TournamentGroupPhase; label: string }[] = [
  { phase: 'group', label: '조별' },
  { phase: 'round16', label: '16강' },
  { phase: 'round12', label: '12강' },
  { phase: 'quarter', label: '8강' },
  { phase: 'semi', label: '준결승' },
  { phase: 'final', label: '결승' },
  { phase: 'third_place', label: '3위 결정전' },
];
```
(주석 "원클릭 템플릿 4종" 의 숫자는 지운다 — 개수를 적지 않는다.)

`bracket-group-quick-add.tsx` — 하드코딩 `<option>` 6개를 교체:
```tsx
              {GROUP_PHASE_TEMPLATES.map(({ phase, label }) => (
                <option key={phase} value={phase}>{label}</option>
              ))}
```

`lib/tournament-bracket-rounds.ts` 에 추가(서버 표와 동일 값, 주석 한 줄 "서버 tournament-bracket-phases.ts 와 같은 표 — 바꾸면 둘 다"):
```ts
export const BRACKET_SOURCE_PHASES: Readonly<Record<string, readonly string[]>> = {
  quarter: ['round16', 'round12'],
  semi: ['quarter'],
  final: ['semi'],
  third_place: ['semi'],
};
```
`BYE_ROUNDS` 는 **그대로**(16강 없음).

`bracket-group-card.tsx`: `['12강', '8강', '4강', '결승', '3·4위전']` → `['16강', '12강', '8강', '4강', '결승', '3·4위전']`. `byeRound('round16')` 이 undefined 라 `byeGroup` 이 없고 부전승 라디오는 기존 `!byeGroup` 조건으로 이미 disabled — 안내 문구 `부전승은 생성된 12강·8강·4강 조를 선택해 주세요.` 는 그대로 정확하다(16강 제외).

`bracket-tab.tsx`:
- `roundLabel` 삼항 체인(`:343-353`)을 `tournamentRoundLabel(group.phase)` 한 호출로 교체(import `tournamentRoundLabel` from `@/lib/tournament-round-label`). 기존 체인의 마지막 `: '3·4위전'` fallthrough 가 새 단계에서 잘못 라벨링하던 구조를 없앤다. `third_place`→'3·4위전', `semi`→'4강' 등 기존 결과는 표가 동일해 불변.
- 중복 가드(`:318`) `(group.phase === 'round12' || group.phase === 'quarter')` → `['round16', 'round12', 'quarter'].includes(group.phase)`.
- 진출 연결 후보(`:848` 의 `previous` 인라인 맵과 그 사용) → `BRACKET_SOURCE_PHASES[targetPhase]?.includes(phaseOf(fixture))` 로 교체, 인라인 맵 삭제. 연결 버튼 노출 조건(`:779` `['quarter','semi','final','third_place'].includes(…)`) → `Object.keys(BRACKET_SOURCE_PHASES).includes(…)`.

- [ ] **Step 4: 실행 — 통과 확인**

Run: `cd apps/v1_web && ./node_modules/.bin/vitest run "src/app/admin/tournaments/[id]" src/lib && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs`
Expected: PASS, tsc 0, 패턴 체크 통과.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(bracket): 어드민 +16강 조 추가·수동 경기 라운드·자동 생성·진출 연결 후보" -- "apps/v1_web/src/app/admin/tournaments/[id]/bracket-group-helpers.ts" "apps/v1_web/src/app/admin/tournaments/[id]/bracket-group-helpers.test.ts" "apps/v1_web/src/app/admin/tournaments/[id]/bracket-group-quick-add.tsx" "apps/v1_web/src/app/admin/tournaments/[id]/bracket-group-card.tsx" "apps/v1_web/src/app/admin/tournaments/[id]/bracket-group-card.test.tsx" "apps/v1_web/src/app/admin/tournaments/[id]/bracket-tab.tsx" "apps/v1_web/src/app/admin/tournaments/[id]/bracket-tab.test.tsx" apps/v1_web/src/lib/tournament-bracket-rounds.ts apps/v1_web/src/lib/tournament-bracket-rounds.test.ts
git show --stat HEAD
```

---

### Task 9: PR-3 캔버스 단계 순서 상수 — 검증만 (조건부)

PR-3 계획은 `lib/bracket-canvas-layout.ts` 에서 단계 순서 `PHASE_ORDER` 에 `round16` 을 이미 둔다(`group < round16 < round12 < quarter < semi < final < third_place`). 이 PR 은 그 상수를 **편집하지 않고** 존재만 확인한다. 공개 `tournament-bracket.tsx` 의 `PHASE_ORDER`(Task 7)와 숫자는 달라도 **상대 순서**가 같아야 한다.

- [ ] **Step 1: 확인**

```bash
cd $WT/apps/v1_web/src
test -e lib/bracket-canvas-layout.ts && grep -n "round16" lib/bracket-canvas-layout.ts lib/bracket-canvas-layout.test.ts || echo "PR-3 미머지: 건너뜀"
```
- PR-3 머지됨 + `round16` 있음 → 아무것도 하지 않는다. 이 Step 결과를 PR 본문에 적는다.
- PR-3 머지됨 + `round16` 없음 → `PHASE_ORDER` 에 `round16` 을 `round12` 앞 숫자로 넣고(나머지 숫자를 하나씩 민다) `bracket-canvas-layout.test.ts` 에 "16강 열이 8강 열보다 왼쪽" 테스트 1건을 추가해 별도 커밋 `fix(bracket): 캔버스 단계 순서에 16강`.
- PR-3 미머지 → 건너뛴다(PR-3 가 `round16` 을 포함해 머지됨; 이 PR 이 더 늦게 머지되면 위 두 분기로 재확인).

---

### Task 10: changeset · 최종 검증

**Files:**
- Create: `.changeset/admin-bracket-canvas-round16.md`

- [ ] **Step 1: changeset** (API 와 웹 모두 바뀜 — `v1_api`·`v1_web` 은 fixed 그룹이라 둘 다 적어도 함께 올라간다)

```md
---
"v1_api": minor
"v1_web": minor
---

대회 대진에 16강 단계를 추가합니다.

어드민이 조 추가에서 "16강"을 만들 수 있고, 대진 템플릿에서 토너먼트 16팀(3·4위전 선택)을 한 번에 만들 수 있어요. 16강 경기의 승자는 8강으로 이어지며, 공개 대진표·진행 단계·결과 화면에도 16강이 맨 앞 단계로 보여요. 16강에는 부전승이 없어요.
```

- [ ] **Step 2: 타깃 검증 (풀스위트 아님)**

```bash
cd apps/v1_api
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket-phases.spec.ts src/tournaments/dto src/tournaments/templates src/tournaments/tournament-round-label.spec.ts src/tournaments/seed-alpha-tournament-qa.spec.ts src/tournaments/tournament-bracket.service.spec.ts
./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" && node scripts/v1-surface-check.mjs
cd ../v1_web
./node_modules/.bin/vitest run src/lib src/components/tournaments "src/app/tournaments/[id]" "src/app/admin/tournaments/[id]"
./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs
```
Expected: 전부 PASS/0. 그 밖:
- **범위 가드(스키마 무변경)**: `git diff origin/dev --stat -- apps/v1_api/prisma/schema.prisma apps/v1_api/prisma/migrations deploy scripts/release` → 출력 없음. (`prisma/seed-tournament-round-label.ts` 는 prisma 폴더지만 스키마·마이그레이션이 아니라 위 경로에 걸리지 않는다.)
- **누락 전수**: `grep -rn "round12" apps/v1_api/src apps/v1_web/src | grep -v "\.spec\.\|\.test\." ` 의 각 줄에 대해 짝이 되는 `round16` 이 필요한 자리인지(단계 열거) 아닌지(12강 부전승 전용: `createBye`·`ROUND12_*`·`round12Pairs`·`bracket-tab.tsx` 12팀 검증·그래프의 `[0,3,4,7]`)를 한 줄씩 확인한다. 12강 전용으로 남겨야 하는 곳이 `round16` 을 받으면 오류다.
- 주석 비율: `git diff origin/dev | grep -cE "^\+\s*(//|\*)"` 가 추가 줄의 1/3 안팎.
- 내가 띄운 프로세스(하네스 postgres 등) 직접 종료 후 `git status --short` 에 `prisma-iso-tmp`·`node_modules` 가 없음.

- [ ] **Step 3: 커밋**

```bash
git add .changeset/admin-bracket-canvas-round16.md
git commit -m "chore(bracket): 16강 단계 changeset" -- .changeset/admin-bracket-canvas-round16.md
git show --stat HEAD
```

- [ ] **Step 4: PR 올리기** — PR base 는 `dev`(`gh pr view <N> --json baseRefName --repo kim-song-jun/matchup-sports-platform` 로 머지 직전 확인), 제목·본문 한국어. 본문에 ① 범위(스키마 무변경, 16강엔 부전승 없음) ② UI 변경 PR 이라 갤러리를 머지 후 alpha 에서 찍어 게시한다는 이유 ③ 통합 스펙은 CI 로 확인함을 적는다. PR 번호는 `gh pr create` 출력 URL 에서 파싱한다(추측 금지). Copilot 리뷰·`codex-direct-review` 본문을 둘 다 확인하고 미처리 지적이 없을 때 머지한다(`gh pr merge <N> --merge --repo kim-song-jun/matchup-sports-platform`, squash 금지). 머지 후 메인 트리 `git fetch origin dev -q && git merge --ff-only origin/dev`.

---

### Task 11: 머지 후 확인 — UI PR (ego-browser + 390/768/1440 갤러리)

UI 가 바뀐 PR 이므로 면제 없음. 로컬 next 로 보지 않는다.

- [ ] **Step 1: 배포 창 회피** — 색인 "머지 후 확인" 의 명령으로 `deploy-alpha.yml` 최신 run 이 success 이고 `x-teameet-commit` 이 내 머지 커밋 이후인지 확인한다(`git merge-base --is-ancestor <머지 커밋> <배포 SHA>`). 배포 중(502)엔 측정하지 않는다.

- [ ] **Step 2: 읽기 전용 API 스모크 (쓰기 없음)** — 기존 alpha 대회 하나의 `GET /api/v1/tournaments/:id` 가 200 이고 `groups[].phase` 에 기존 값이 그대로 나오는지(회귀) 확인한다. 응답에 `round16` 이 없는 것은 정상(아직 16강 대회가 없다).

- [ ] **Step 3: 사용자 승인 요청 (alpha 쓰기 게이트)** — 새 테스트 대회를 만드는 단계(Step 4)는 alpha 데이터 쓰기다. **실행 전 사용자에게 직접 승인을 받는다**(승인은 전달 불가; 계획·서브에이전트가 대신 승인할 수 없다). 승인 요청에는 만들 것(테스트 대회 1개, `(테스트)` 접두, 대진은 만들면 못 지우므로 영구히 남음)을 적는다. 승인 전에는 Step 4 를 건너뛰고 Step 2 결과와 "미검증" 을 보고한다.

- [ ] **Step 4: ego-browser 시나리오 (승인 후)** — `ego-browser` 스킬을 먼저 읽고 작업 task space 하나를 재사용한다. 계정은 비공개 메모리의 alpha 관리자 계정(저장소에 적지 않는다).
  1. 새 knockout 테스트 대회 생성 → 어드민 대진 탭 → "조 추가" 에 **"+16강"** 버튼이 있고 클릭하면 "16강" 카드가 생긴다. 직접 입력의 단계 select 에도 "16강" 이 있다.
  2. (PR-1b 템플릿 UI 는 PR-3 이므로) 템플릿 API 는 화면이 없다 — 수동 경로: 16강 카드 → 수동 경기 라운드 select 에 "16강" → 16강 경기 2개 + 8강 조·경기 1개 → 8강 경기의 "진출 연결" 후보에 16강 경기가 나온다 → 저장되면 연결 표시.
  3. 16강 카드의 부전승 유형 라디오가 비활성이고, 12강·8강·4강만 안내된다.
  4. 공개 대진표(`/tournaments/:id/bracket`, 대진 공개 후)에서 16강 열이 8강보다 왼쪽에 있고, 진행 단계 스테퍼 첫 단계가 "16강", 결과 화면에서 완료된 16강 경기가 사라지지 않는다.
  5. console 에러·실패 network 요청 0 확인. 판정은 화면으로 한다(API 는 보조).

- [ ] **Step 5: 갤러리** — 위 4개 화면(어드민 조 추가 · 16강 카드 · 공개 대진표 · 진행 스테퍼)을 📱390 / 📲768 / 🖥1440 으로 `scripts/` 내부의 캡처 스크립트(또는 ego 스크린샷)로 찍는다. 캡처는 과하게 몰아 찍지 않는다(alpha 가 전면 403 을 건다 — 화면당 3장, 간격을 둔다). 스크린샷은 SHA 고정 raw URL 로 올리고 200 확인 후 **이 PR 에 코멘트로 게시**한다(페이지별 3열). 라이브/computed 값이 필요한 비교(열 순서의 x 좌표 등)는 육안이 아니라 `getBoundingClientRect` 로 읽는다.

- [ ] **Step 6: 정리** — `await task.finish({ keep: [] })` 로 ego task space 를 닫고, 내가 띄운 프로세스가 기준선으로 돌아왔는지 확인한다. 완료 보고에는 수행 모델·증거(스크린샷 inline)·미검증 범위(승인 못 받은 alpha 쓰기 단계)를 남긴다.

---

## Self-Review

스펙 → Task 대응 (S# = `.github/tasks/20261057-admin-bracket-canvas.md`).

| 스펙 항목 | Task |
|---|---|
| S1-b `round16` DTO 단계 목록 | 1 |
| S1-b 인접표 `quarter ← round12 \| round16` | 1 (서버), 8 (웹 후보 표) |
| S1-b 라벨 '16강' · 단계 라벨 표 | 2 (서버·시드), 6 (웹) |
| S1-b 공개 대진표 라운드 순서 · 진행 단계 표시 | 7 |
| S1-b 어드민 조 추가 "+16강" | 8 |
| S1-b 16강엔 부전승 없음 (`createBye` 거부) | 1 (단위), 4 (통합), 6·8 (웹 `byeRound`·라디오 비활성) |
| S2 knockout 16 (+3·4위전) 템플릿, 16강 2i-1·2i → 8강 i | 3 (planner), 4 (DB) |
| Test Scenarios: 16+3·4위전 = 경기 16 · 연결 16 · ENTRY 16 | 3 |
| Test Scenarios: 16강→8강 연결 인접 허용 / 16강 부전승 거부 | 1, 4 |
| 대진 정렬(enum 순서) | 4 |
| API 문서 · changeset | 5, 10 |
| 머지 후 확인(UI PR: ego + 3폭 갤러리, alpha 쓰기 승인) | 11 |
| 캔버스 단계 순서(PR-3 소관) | 9 (검증만) |

비범위로 확인한 것: `group_knockout` 의 8조×2팀 → 16강 교차 대진(`groupRankPairings(8,2)`)은 PR-4 소관이고 이 PR 의 planner 는 `group_knockout` 을 계속 422 로 거부한다. 순위 투영(`game-result-standings-projection`)·페널티 판정(`isKnockoutFixture` = `phase !== 'group'`)은 `round16` 을 자동으로 결선으로 본다 — 코드 변경 없음(통합 스펙 Task 4 가 DB 정렬만 고정).

타입·이름 일관성: `acceptsBracketSource`(서버)·`BRACKET_SOURCE_PHASES`(서버·웹 두 벌 — 같은 값, 각 테스트가 값을 직접 고정), `KNOCKOUT_PHASES`·`isKnockoutPhase`(웹), planner 키 `round16-{n}`/`quarter-{n}` 은 Task 3 구현·테스트·Task 4 통합이 같은 규칙(`{phase}-{n}`)을 쓴다.
