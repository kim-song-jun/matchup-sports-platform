# PR-4 조별리그 + 결선 (group_knockout) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민이 조별+결선 대회의 뼈대(조 편성 블록 · 조별 라운드로빈 · 교차 대진 결선)를 템플릿 한 번으로 만들고, 조별 결과가 다 들어오면 「순위대로 채우기」로 결선의 "A조 1위" 자리를 채운다(동률은 운영자가 직접 고른다).

**Architecture:** 서버는 PR-1b 의 순수 planner(`planBracketTemplate`)의 `group_knockout` 분기에 계획 함수를 꽂는 것으로 템플릿이 끝나고(executor 는 그대로), 순위 미리보기는 "조의 비취소 경기가 전부 OFFICIAL → 저장된 `V1TournamentStanding` 순위 → 정본 §5 동점 처리로 완전 동률 구간 감지"를 판정하는 순수 함수 + 로더로, 채우기는 PR-1b 의 `assignSlotsBatchInTx`(바뀔 자리를 먼저 모두 비운 뒤 넣는 배치) 위에 얹는다. 웹은 PR-3 의 `buildCanvasLayout` 에 "조 편성" 열(조 블록)과 `GROUP_RANK` 점선 연결선을 더하고, PR-3 의 템플릿 창·작업 영역에 조별+결선 입력과 순위 채우기 창을 끼운다.

**Tech Stack:** NestJS 11 + Prisma 6 + Jest 30 (apps/v1_api), Next.js 16 + React 19 + TanStack Query 5 + Vitest + Testing Library (apps/v1_web).

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md` (S2 group_knockout · S3 · S4 · S7 · Test Scenarios) · 색인과 공유 계약 `docs/superpowers/plans/2026-10-08-admin-bracket-canvas-index.md` · 선행 계획 `…-pr1b-slots-templates.md`(슬롯 서비스·플래너·executor)·`…-pr3-canvas-ui.md`(캔버스·템플릿 창·작업 영역). 충돌하면 스펙이 이긴다.

## 공유 계약 준수 메모 (계약 이탈 없음 · 선행 PR 비공개 심볼 의존 기록)

색인의 이름·경로·시그니처·라우트·응답 형태·에러 코드를 그대로 쓴다. 계약이 비워 둔 곳을 이 계획이 채운 것은 아래뿐이다(이탈 아님).

- **PR-3 의 비공개 심볼 의존.** `use-v1-bracket-canvas.ts` 의 모듈 비공개 `invalidateCompetitionViews`, `bracket-canvas-layout.ts` 의 모듈 비공개 `elbowPath`·`sideAnchorY`·`NODE_ANCHOR_Y` 는 PR-4 가 **같은 파일 안에서만** 쓴다(Task 10·12 가 그 파일에 Edit). 따라서 export 를 추가하지 않고 PR-3 의 선언을 바꿀 필요도 없다. 다른 파일이 소비하는 것은 PR-3 Produces 에 이미 export 로 적힌 `CANVAS_HEADER_HEIGHT`·`CANVAS_ROW_HEIGHT`·`CANVAS_NODE_WIDTH` 뿐이다. 테스트 빌더 `makeGroup`(PR-3 `test/bracket-canvas-fixtures.ts`)은 `advanceCount`·`groupTeams` 필드를 이미 가진다. Task 0 이 이 선언들을 grep 으로 다시 확인한다.
- 쿼리 키 `v1Keys.adminTournamentSlotStandings` 는 색인 "웹 이름" 표에 없는 PR-4 추가분이다(`adminTournamentBracket` 하위 키 — 계약 이름은 바뀌지 않는다).

- `standingsPreview`/`fillFromStandings` 는 계약대로 `TournamentSlotService` 메서드다. 본문은 `slots/group-rank-fill.ts`·`slots/load-group-rank-preview.ts` 의 자유 함수로 두고 서비스 메서드는 그것을 호출하는 얇은 껍데기로 만든다(서비스 생성자를 몰라도 단위 테스트가 가능하다).
- 새 라우트 두 개는 PR-1b 의 슬롯 컨트롤러가 아니라 새 컨트롤러 `TournamentSlotStandingsController` 에 둔다(1b 파일을 건드리지 않기 위해). 경로는 계약 그대로다.
- 웹 타입은 `types/bracket-standings-fill.ts` 에 둔다(PR-3 가 `types/api.ts` 에 넣는 타입과 겹치지 않는 PR-4 전용 응답 타입).
- `CanvasLayout` 에 `groupBlocks` 필드, `CanvasEdgeKind` 에 `'GROUP_RANK'` 를 더한다 — 색인이 말한 "연결선(… GROUP_RANK 점선) 계산"의 구현이다.

## 선행 PR 전제 (착수 전 확인)

작성 시점(base `origin/dev` = `c62b5ec08`)에 PR-1a/1b/2/3 는 **계획 문서만** 있고 코드는 없다. 이 계획은 그 계획 문서의 심볼(`assignSlotsBatchInTx`·`planBracketTemplate` 의 `build()` 분기·`buildCanvasLayout`·`BracketCanvas`·`BracketTemplateDialog`·`BracketCanvasWorkspace` 등)을 기준으로 쓰였다. **Task 0 의 확인 명령이 하나라도 비면 멈추고 `BLOCKED: <무엇이 없다>` 로 오케스트레이터에 보고한다**(추측해서 만들지 않는다). 선행 PR 의 구현이 계획과 달라졌다면 이 계획의 해당 Edit 만 실제 코드에 맞춰 옮긴다 — 동작 계약(테스트가 고정하는 것)은 바꾸지 않는다.

## Global Constraints

색인 `2026-10-08-admin-bracket-canvas-index.md` 의 Global Constraints 전부가 적용된다(worktree·pathspec 커밋·`prisma generate` 금지·테스트 명령·마이그레이션/해시 규칙·changeset·DTO 규칙·웹 토큰 규칙·주석 규칙). 이 PR 에만 해당하는 추가 제약:

- **로컬 서버 `jest`·`tsc` 는 격리 하네스로 돌린다.** 슬롯·플래너 코드는 `V1TournamentSlot`·슬롯 컬럼 타입을 쓰는데 공유 Prisma client 는 옛 스키마라(`prisma generate` 금지) 평범한 `jest` 는 ts-jest 진단에서 깨진다 — 코드 결함이 아니다. 아래 서버 `jest` 명령은 전부 PR-1a Task 2 가 만든 `$ISO/jest.iso.config.cjs` 형태(`export ISO=/Users/sungjun/.cache/bracket-canvas-iso`)다. 하네스가 없으면 진단을 끈 임시 jest 설정을 scratchpad 에만 만들어 `-c` 로 넘기고, 커밋 전에 색인 Global Constraints 의 격리 `tsc` 를 반드시 한 번 돈다. 통합 스펙은 로컬에서 못 돌고 CI 에서만 돈다.
- **새 마이그레이션·스키마 변경 없음.** 이 PR 은 PR-1a 가 만든 `V1TournamentSlot`(GROUP_RANK 포함)을 읽고 쓸 뿐이다. 스키마 해시 5곳은 건드리지 않는다.
- 새 파일 커밋은 `git add <명시 경로>` 후 `git commit -m "…" -- <같은 경로>`. 트레일러(Co-Authored-By 등)는 실행 세션의 attribution 지침을 따른다(아래 명령에서는 생략).
- 서버 테스트 파일은 새 Prisma enum 의 **런타임 값**(`V1TournamentSlotKind.ENTRY`)을 import 하지 않는다 — 문자열 리터럴(`'ENTRY'`)을 쓴다(PR-1b 와 같은 규칙: 공유 client 가 재생성되기 전에도 순수 함수 테스트가 돈다. 타입은 격리 생성 client 로 `tsc` 확인).
- 순위 판정에서 두 규칙이 공존한다: 저장된 `V1TournamentStanding.position` 은 대회 설정(`competition-standings.ts`)의 순서(승점 → 맞대결 → 득실 → 다득점 → 페어플레이 → 추첨), 동률 감지는 정본 §5(`league-tie-break.ts`: 승점 → 득실 → 다득점 → 맞대결 → 적은 실점)다. 둘이 어긋나면 임의로 한쪽을 믿지 않고 `tied` 로 운영자에게 넘긴다(Task 4).
- 채우기의 override 규칙은 스펙 S4 가 못 박았다(이 계획의 해석이 아니다): `tied` 자리는 **그 자리의 동률 팀(`tiedRegistrationIds`) 중에서만**, `ready` 자리는 **그 자리의 원천 조 소속 팀 중에서만** 받고, 그 밖(범위 밖 팀·`group_incomplete` 자리·같은 자리 중복 지정)은 모두 422 `SLOT_REGISTRATION_INVALID`. 이 대회의 순위 자리가 아닌 slotId 는 404 `SLOT_NOT_FOUND`(색인 에러 표). 저장 순위(`V1TournamentStanding.position` — 스펙의 `rank`)와 §5 결과가 어긋나면 그 자리는 `tied`(두 팀)로 돌려 운영자가 고른다. 서버 판정은 Task 4·6 이, 같은 규칙의 테스트는 두 태스크가 각각 고정한다.
- 웹: PR-3 의 파일을 고칠 때는 **Edit 단위(찾기 → 바꾸기)** 로만 고치고, 그 파일의 기존 테스트가 전부 그대로 통과해야 한다(회귀 0). 문구는 해요체, 색만으로 상태를 전하지 않는다(배지 = 색 + 텍스트, 연결선 = 모양).

## File Structure

**Backend (apps/v1_api)**

| 파일 | 책임 |
|---|---|
| `src/tournaments/templates/group-rank-pairings.ts` (새) | 스펙 S2 교차 대진 표 6종(8조 x 2팀 → 16강 포함) + 미지원 조합 422 + `MAX_GROUP_RANK_SLOTS` |
| `src/tournaments/templates/knockout-phase-labels.ts` (새) | PR-1b/1c 의 `GROUP_NAME`·`ROUND_LABEL`·`FIXTURES_IN_PHASE` 표와 `KnockoutPhase` 를 `bracket-template-plan.ts` 에서 그대로 옮겨 export — 라벨 소유는 이 파일 한 곳(순환 import 방지) |
| `src/tournaments/templates/group-knockout-plan.ts` (새) | `planGroupKnockoutTemplate` — 조·ENTRY·라운드로빈·GROUP_RANK·결선·연결선 계획(순수) |
| `src/tournaments/templates/bracket-template-plan.ts` (수정, PR-1b) | `build()` 의 `group_knockout` 분기가 새 함수를 호출 · 라벨 표 3벌과 `KnockoutPhase` 정의를 지우고 `knockout-phase-labels.ts` 에서 import |
| `src/tournaments/slots/group-rank-preview.ts` (새) | `resolveGroupRank` — 한 조·한 순위의 ready/tied/group_incomplete 판정(순수) |
| `src/tournaments/slots/load-group-rank-preview.ts` (새) | `loadGroupRankPreview` — GROUP_RANK 자리별 미리보기 행 로드 |
| `src/tournaments/slots/group-rank-fill.ts` (새) | `planFillFromStandings`(순수) · `previewGroupRankStandings`·`fillSlotsFromStandings`(서비스 본문) |
| `src/tournaments/slots/tournament-slot.service.ts` (수정, PR-1b) | `standingsPreview`·`fillFromStandings` 메서드 2개 |
| `src/tournaments/slots/dto/fill-from-standings.dto.ts` (새) | `FillFromStandingsDto` |
| `src/tournaments/slots/tournament-slot-standings.controller.ts` (새) | GET standings-preview · POST fill-from-standings |
| `src/tournaments/tournaments.module.ts` (수정) | 컨트롤러 등록 |
| 위 새 파일마다 `*.spec.ts` · `test/tournaments/bracket-template.integration-spec.ts` (수정, PR-1b) · `test/tournaments/group-rank-standings.integration-spec.ts` (새) | 단위·통합 테스트 |
| `docs/api/domains/tournaments.md` (수정) · `.changeset/admin-bracket-group-knockout.md` (새) | 계약 문서 · 버전 |

**Frontend (apps/v1_web/src)**

| 파일 | 책임 |
|---|---|
| `types/bracket-standings-fill.ts` (새) | 미리보기·채우기 응답 타입 |
| `lib/query-keys.ts` (수정) | `adminTournamentSlotStandings` 키 |
| `hooks/use-v1-bracket-canvas.ts` (수정, PR-3) · `hooks/use-v1-bracket-canvas.standings.test.tsx` (새) | `useV1SlotStandingsPreview` · `useV1FillSlotsFromStandings` |
| `lib/bracket-canvas-group-layout.ts` (새) · `.test.ts` | 조 블록 배치·순위 연결선 높이(순수) |
| `lib/bracket-canvas-layout.ts` (수정, PR-3) · `.test.ts` | "조 편성" 열 · `groupBlocks` · `GROUP_RANK` 연결선 |
| `components/admin/bracket-canvas/bracket-group-block.tsx` (새) · `.test.tsx` | 조 편성 블록(자리 표, 배정·끌어 놓기) |
| `components/admin/bracket-canvas/bracket-canvas.tsx` (수정, PR-3) · `.test.tsx` | 블록 렌더 · 순위선 모양 · 범례 · 잠긴 자리 |
| `lib/bracket-template-counts.ts` (수정, PR-3) · `.test.ts` | group_knockout 미리보기 개수 |
| `components/admin/bracket-canvas/bracket-group-knockout-fields.tsx` (새) · `.test.tsx` | 템플릿 창의 조별+결선 입력 |
| `components/admin/bracket-canvas/bracket-template-dialog.tsx` (수정, PR-3) · `.test.tsx` | group_knockout 분기 |
| `components/admin/bracket-canvas/bracket-standings-fill-dialog.tsx` (새) · `.test.tsx` | 순위 채우기 창 |
| `lib/bracket-standings-fill-message.ts` (새) · `.test.ts` | 채운 결과 토스트 문장 |
| `components/admin/bracket-canvas/bracket-standings-fill-button.tsx` (새) · `.test.tsx` | 툴바 버튼 + 창 소유 |
| `components/admin/bracket-canvas/bracket-canvas-workspace.tsx` (수정, PR-3) · `.test.tsx` | 버튼 연결 · 조별+결선 템플릿 시작 |

## Task 0: 선행 PR 확인 (코드 변경 없음)

색인 "PR 시작 체크리스트"(최신 `origin/dev` fetch 후 새 worktree · node_modules 심링크(`git add` 금지) · 격리 Prisma 하네스를 새 worktree 경로로 재생성)를 먼저 끝낸다. 직전 PR(1a·1b·3)이 `origin/dev` 에 머지됐는지도 거기서 확인한다.

- [ ] **Step 1: 계약 심볼이 실제로 있는지 확인**

```bash
cd /Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
git fetch origin dev -q && git log --oneline -1 origin/dev
for f in \
  apps/v1_api/src/tournaments/templates/bracket-template-plan.ts \
  apps/v1_api/src/tournaments/templates/bracket-template.service.ts \
  apps/v1_api/src/tournaments/slots/tournament-slot.service.ts \
  apps/v1_api/src/tournaments/slots/tournament-slot-label.ts \
  apps/v1_api/src/tournaments/tournament-bracket-tx.ts \
  apps/v1_api/src/tournaments/slots/competition-bracket-lock.ts \
  apps/v1_api/test/tournaments/bracket-template.integration-spec.ts \
  apps/v1_api/test/helpers/bracket-canvas-fixture.ts \
  apps/v1_web/src/lib/bracket-canvas-layout.ts \
  apps/v1_web/src/lib/bracket-template-counts.ts \
  apps/v1_web/src/hooks/use-v1-bracket-canvas.ts \
  apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx \
  apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-dnd.ts \
  apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.tsx \
  apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx \
  apps/v1_web/src/lib/bracket-canvas-errors.ts \
  apps/v1_web/src/test/bracket-canvas-fixtures.ts; do
  test -f "$f" && echo "OK  $f" || echo "MISSING  $f"; done
grep -n "case 'group_knockout'" apps/v1_api/src/tournaments/templates/bracket-template-plan.ts
grep -n "export async function assignSlotsBatchInTx\|export type SlotMutationContext\|private context(\|SLOT_TRANSACTION_OPTIONS" apps/v1_api/src/tournaments/slots/tournament-slot.service.ts
grep -n "sourceGroupKey" apps/v1_api/src/tournaments/templates/bracket-template.service.ts
grep -n "function invalidateCompetitionViews\|BracketCompetitionScope" apps/v1_web/src/hooks/use-v1-bracket-canvas.ts
grep -n "^function elbowPath\|^function sideAnchorY\|export const CANVAS_HEADER_HEIGHT\|export const CANVAS_ROW_HEIGHT" apps/v1_web/src/lib/bracket-canvas-layout.ts
grep -n "export function buildCanvasLayout\|CanvasEdgeKind" apps/v1_web/src/lib/bracket-canvas-layout.ts
grep -n "V1TournamentSlot " apps/v1_api/prisma/schema.prisma
grep -n "round16" apps/v1_api/prisma/schema.prisma apps/v1_api/src/tournaments/templates/bracket-template-plan.ts
grep -rn "'round16'" apps/v1_web/src/lib apps/v1_web/src/types | head -5
# 조 편성·순위 재계산 함수는 색인 보충 계약의 이름·파일만 쓴다 (PR-4 는 직접 부르지 않고 import 도 하지 않는다 — 아래 메모)
grep -n "export async function ensureGroupPhaseTeamsInTx\|export async function recalculateStandingsInTx\|export async function releaseUnusedGroupTeamsInTx" apps/v1_api/src/tournaments/tournament-bracket-tx.ts
grep -rn "group-phase-teams\|recalculateTournamentStandingsInTx" apps/v1_api/src apps/v1_api/test; echo "위 grep 은 출력이 비어 있어야 한다(옛 이름·옛 파일 0)"
grep -n "ensureGroupPhaseTeamsInTx\|releaseUnusedGroupTeamsInTx" apps/v1_api/src/tournaments/slots/tournament-slot.service.ts
```

Expected: 전부 `OK`, `case 'group_knockout'` 줄이 나오고(PR-1b 는 여기서 422 를 던진다), 스키마 enum 에 `round16` 이 있고(PR-1a) 웹 단계 타입·정렬에 `'round16'` 이 나오고(PR-1c — Task 2·12 의 16강 테스트가 이 값에 기대므로 PR-1c 가 먼저 머지돼 있어야 한다), `assignSlotsBatchInTx`·`SlotMutationContext`·`private context(`·`SLOT_TRANSACTION_OPTIONS` 가 나오고, executor 에서 `sourceGroupKey`(GROUP_RANK 자리의 `sourceGroupId` 를 그룹 키에서 푸는 줄)가 나오고, 웹 훅 파일에 `invalidateCompetitionViews` 가 나오고, 스키마에 모델이 있다.
`tournament-bracket-tx.ts` 에서 `ensureGroupPhaseTeamsInTx`·`recalculateStandingsInTx`(PR-1a) 와 `releaseUnusedGroupTeamsInTx`(PR-1b) 정의 3줄이 나오고, `group-phase-teams`·`recalculateTournamentStandingsInTx` 검색은 **0건**이며, 슬롯 서비스가 앞의 두 함수를 쓰는 줄이 나온다.
옛 이름 검색을 뺀 확인이 하나라도 비거나, 옛 이름 검색이 1건이라도 나오면 **멈추고** `BLOCKED: PR-1a/1b/3 미머지 또는 계획과 다름 — <빈 항목>` 을 보고한다. 옛 이름이 나오면 선행 PR 이 색인 보충 계약(2026-10-09)을 어긴 것이므로 이 PR 에서 사본을 만들거나 옛 파일을 import 하지 말고 그 PR 에 되돌린다.

**조 편성·순위 재계산 호출 지도(이 PR 은 새로 호출하지 않는다).** 조별 ENTRY 자리 배정·비우기는 `assignSlotsBatchInTx` 안에서 `ensureGroupPhaseTeamsInTx` → `recalculateStandingsInTx`, 이전 팀 해제는 `releaseUnusedGroupTeamsInTx` 가 맡는다(모두 `tournament-bracket-tx.ts`, PR-1a/1b). PR-4 의 템플릿은 조 편성을 만들지 않고(Task 3 통합 스펙이 `V1TournamentGroupTeam` 0건을 고정), 순위로 채우기는 **결선의 GROUP_RANK 자리**만 `assignSlotsBatchInTx` 로 바꾸므로 조 편성·순위표를 건드리지 않는다. 순위는 `V1TournamentStanding`(`position`)·`V1TournamentGroupTeam` 을 **읽기만** 한다(Task 5). 그래서 PR-4 코드에는 위 세 이름의 import 가 없어야 하고, 테스트가 조 편성이 필요하면 `slots.assignSlot` 으로 만든다(Task 9).

## Task 1: 교차 대진 표 `groupRankPairings`

**Files:**
- Create: `apps/v1_api/src/tournaments/templates/group-rank-pairings.ts`
- Test: `apps/v1_api/src/tournaments/templates/group-rank-pairings.spec.ts`

**Interfaces:**
- Produces: `type GroupRankRef = { group: number; rank: number }`(group 은 0부터 A=0, rank 는 1위=1), `groupRankPairings(groupCount: number, advancePerGroup: 1 | 2): Array<[GroupRankRef, GroupRankRef]>`, `MAX_GROUP_RANK_SLOTS: number`(= 16)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// apps/v1_api/src/tournaments/templates/group-rank-pairings.spec.ts
import { UnprocessableEntityException } from '@nestjs/common';
import { groupRankPairings, MAX_GROUP_RANK_SLOTS, type GroupRankRef } from './group-rank-pairings';

const label = (ref: GroupRankRef) => `${String.fromCharCode(65 + ref.group)}${ref.rank}`;
const labelsOf = (groupCount: number, advance: 1 | 2) =>
  groupRankPairings(groupCount, advance).map(([home, away]) => [label(home), label(away)]);

function codeOf(operation: () => unknown): { type: unknown; code: unknown } {
  try {
    operation();
  } catch (error) {
    const response = error instanceof UnprocessableEntityException ? (error.getResponse() as { code?: unknown }) : {};
    return { type: error instanceof UnprocessableEntityException, code: response.code };
  }
  throw new Error('예외가 나지 않았다');
}

describe('groupRankPairings — 스펙 S2 교차 대진 표', () => {
  it.each([
    ['2조 x 1팀 → 결승', 2, 1, [['A1', 'B1']]],
    ['2조 x 2팀 → 4강', 2, 2, [['A1', 'B2'], ['B1', 'A2']]],
    ['4조 x 1팀 → 4강', 4, 1, [['A1', 'D1'], ['B1', 'C1']]],
    ['4조 x 2팀 → 8강', 4, 2, [['A1', 'B2'], ['C1', 'D2'], ['B1', 'A2'], ['D1', 'C2']]],
    ['8조 x 1팀 → 8강', 8, 1, [['A1', 'H1'], ['D1', 'E1'], ['B1', 'G1'], ['C1', 'F1']]],
    [
      '8조 x 2팀 → 16강',
      8,
      2,
      [
        ['A1', 'B2'], ['C1', 'D2'], ['E1', 'F2'], ['G1', 'H2'],
        ['B1', 'A2'], ['D1', 'C2'], ['F1', 'E2'], ['H1', 'G2'],
      ],
    ],
  ] as const)('%s', (_name, groupCount, advance, expected) => {
    expect(labelsOf(groupCount, advance)).toEqual(expected);
  });

  it.each([
    [2, 1],
    [2, 2],
    [4, 1],
    [4, 2],
    [8, 1],
    [8, 2],
  ] as const)('%i조 x %i팀: 올라오는 모든 (조, 순위)가 정확히 한 번씩 나오고 같은 조끼리 붙지 않는다', (groupCount, advance) => {
    const refs = groupRankPairings(groupCount, advance).flat();
    expect(refs).toHaveLength(groupCount * advance);
    const seen = new Set(refs.map(label));
    expect(seen.size).toBe(groupCount * advance);
    for (let group = 0; group < groupCount; group += 1) {
      for (let rank = 1; rank <= advance; rank += 1) {
        expect(seen.has(`${String.fromCharCode(65 + group)}${rank}`)).toBe(true);
      }
    }
    for (const [home, away] of groupRankPairings(groupCount, advance)) expect(home.group).not.toBe(away.group);
  });

  it.each([
    [1, 1],
    [3, 1],
    [3, 2],
    [5, 1],
    [6, 1],
    [7, 1],
    [7, 2],
    [16, 1],
    [2.5, 1],
  ] as const)('지원하지 않는 %i조 x %i팀은 422 BRACKET_TEMPLATE_UNSUPPORTED', (groupCount, advance) => {
    expect(codeOf(() => groupRankPairings(groupCount, advance as 1 | 2))).toEqual({
      type: true,
      code: 'BRACKET_TEMPLATE_UNSUPPORTED',
    });
  });

  it('진출 팀 수가 1·2 가 아니면 422 (타입을 우회한 입력)', () => {
    expect(codeOf(() => groupRankPairings(4, 3 as unknown as 1))).toEqual({
      type: true,
      code: 'BRACKET_TEMPLATE_UNSUPPORTED',
    });
  });

  it('호출마다 새 배열을 준다 — 한 호출자가 바꿔도 다음 호출에 새지 않는다', () => {
    const first = groupRankPairings(2, 2);
    first[0][0].rank = 99;
    first.pop();
    expect(labelsOf(2, 2)).toEqual([['A1', 'B2'], ['B1', 'A2']]);
  });

  it('8조 x 2팀 16강: 8경기 모두 홈 1위·어웨이 2위이고, 앞 4경기는 A-B·C-D·E-F·G-H 조 쌍, 뒤 4경기는 같은 쌍의 반대 방향이다', () => {
    const pairs = groupRankPairings(8, 2);
    expect(pairs).toHaveLength(8);
    pairs.forEach(([home, away]) => expect([home.rank, away.rank]).toEqual([1, 2]));
    // 앞 4경기는 A-B·C-D·E-F·G-H 조 쌍, 뒤 4경기는 같은 쌍의 반대 방향
    expect(pairs.slice(0, 4).map(([h, a]) => [h.group, a.group])).toEqual([[0, 1], [2, 3], [4, 5], [6, 7]]);
    expect(pairs.slice(4).map(([h, a]) => [h.group, a.group])).toEqual([[1, 0], [3, 2], [5, 4], [7, 6]]);
  });

  it('MAX_GROUP_RANK_SLOTS 는 표에서 가장 큰 결선 크기(16)다', () => {
    expect(MAX_GROUP_RANK_SLOTS).toBe(16);
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/group-rank-pairings.spec.ts
```

Expected: FAIL — `Cannot find module './group-rank-pairings'`.

- [ ] **Step 3: 구현**

```ts
// apps/v1_api/src/tournaments/templates/group-rank-pairings.ts
import { UnprocessableEntityException } from '@nestjs/common';

/** group: 0부터(A=0), rank: 1부터(1위=1). */
export type GroupRankRef = { group: number; rank: number };

// 표기 "A1" = A조 1위. 스펙 S2 의 교차 대진 — 같은 조 두 팀이 결선 첫 경기에서 다시 만나지 않는다.
const PAIRINGS: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> = {
  '2x1': [['A1', 'B1']],
  '2x2': [['A1', 'B2'], ['B1', 'A2']],
  '4x1': [['A1', 'D1'], ['B1', 'C1']],
  '4x2': [['A1', 'B2'], ['C1', 'D2'], ['B1', 'A2'], ['D1', 'C2']],
  '8x1': [['A1', 'H1'], ['D1', 'E1'], ['B1', 'G1'], ['C1', 'F1']],
  '8x2': [
    ['A1', 'B2'], ['C1', 'D2'], ['E1', 'F2'], ['G1', 'H2'],
    ['B1', 'A2'], ['D1', 'C2'], ['F1', 'E2'], ['H1', 'G2'],
  ],
};

export const MAX_GROUP_RANK_SLOTS = Math.max(...Object.values(PAIRINGS).map((pairs) => pairs.length * 2));

function parseRef(text: string): GroupRankRef {
  return { group: text.charCodeAt(0) - 65, rank: Number(text.slice(1)) };
}

/** 결선 첫 라운드 경기 순서대로 [홈 자리, 어웨이 자리]. 표에 없는 조합(결선 크기 ∉ {2,4,8,16})은 422. */
export function groupRankPairings(
  groupCount: number,
  advancePerGroup: 1 | 2,
): Array<[GroupRankRef, GroupRankRef]> {
  const pairs = PAIRINGS[`${groupCount}x${advancePerGroup}`];
  if (pairs === undefined) {
    throw new UnprocessableEntityException({
      code: 'BRACKET_TEMPLATE_UNSUPPORTED',
      message: '결선은 2·4·8·16팀이 올라가는 조합만 만들 수 있어요. 조 수와 진출 팀 수를 다시 골라 주세요.',
    });
  }
  return pairs.map(([home, away]) => [parseRef(home), parseRef(away)]);
}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/group-rank-pairings.spec.ts
```

Expected: PASS (6 + 6 + 9 + 1 + 1 + 1 + 1 케이스).

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/tournaments/templates/group-rank-pairings.ts apps/v1_api/src/tournaments/templates/group-rank-pairings.spec.ts
git commit -m "feat(v1_api): 조별+결선 교차 대진 표 groupRankPairings" -- apps/v1_api/src/tournaments/templates/group-rank-pairings.ts apps/v1_api/src/tournaments/templates/group-rank-pairings.spec.ts
git show --stat HEAD
```

## Task 2: group_knockout 계획 함수 `planGroupKnockoutTemplate`

**Files:**
- Create: `apps/v1_api/src/tournaments/templates/knockout-phase-labels.ts`
- Modify: `apps/v1_api/src/tournaments/templates/bracket-template-plan.ts` (라벨 표 3벌·`KnockoutPhase` 정의를 지우고 위 파일에서 import — 값 변경 없는 이동)
- Create: `apps/v1_api/src/tournaments/templates/group-knockout-plan.ts`
- Test: `apps/v1_api/src/tournaments/templates/group-knockout-plan.spec.ts`

**Interfaces:**
- Consumes: `groupRankPairings`(Task 1) · `buildLeagueFixtureRows`(`apps/v1_api/src/tournaments/league-fixture-generator.service.ts:261`, 순수 — 자리 키 문자열을 `registrationIds` 자리에 그대로 넣는다) · `knockout-phase-labels.ts` 의 `GROUP_NAME`·`ROUND_LABEL`·`FIXTURES_IN_PHASE`·`KnockoutPhase`(Step 0 에서 PR-1b/1c 표를 이동 — 라벨 문자열의 유일한 소유처) · PR-1b 타입 `BracketTemplateInput`·`BracketTemplatePlan`·`PlanGroup`·`PlanSlot`·`PlanFixture`·`PlanEdge`(`bracket-template-plan.ts`, `import type` 만 — 값 import 를 하면 이 파일과 순환한다)
- Produces: `planGroupKnockoutTemplate(input: Extract<BracketTemplateInput, { kind: 'group_knockout' }>, ctx: { fixtureNumberOffset: number }): BracketTemplatePlan`

계획 규칙(스펙 S2): 조 `A조…`(phase `group`, `advanceCount` = advancePerGroup) · 조마다 ENTRY 자리 `teamsPerGroup`개 · 조별 라운드로빈 빈 경기(`league_r{n}`, legs) · 결선 크기 K = 조 수 × 진출 팀 수 ∈ {2,4,8,16} · 결선 첫 라운드의 사이드 = GROUP_RANK 자리(표는 Task 1) · 이후 라운드는 WINNER 연결 · 3·4위전은 4강 LOSER 연결. 경기 번호는 조별(A조부터)→결선(K=16 이면 16강→8강→4강→결승→3·4위전 — PR-1b/1c 의 `knockout` 템플릿과 같은 순서) 순으로 `ctx.fixtureNumberOffset` 뒤부터 연속.

- [ ] **Step 0: 라벨 표를 한 곳으로 옮긴다 (순수 이동, 값 변경 없음)** — PR-1b/1c 의 `bracket-template-plan.ts` 에는 `type KnockoutPhase`·`GROUP_NAME`·`ROUND_LABEL`·`FIXTURES_IN_PHASE` 가 모듈 내부 `const` 로 있다. PR-4 가 같은 표를 다시 쓰면 라벨이 두 벌이 되므로, 아래 명령으로 정의 위치를 찾아 **머지된 현재 내용(1c 의 `round16`·`round12` 포함) 그대로** 새 파일로 옮기고 `export` 를 붙인다. 손으로 다시 타이핑하지 않는다.

```bash
grep -nE "^type KnockoutPhase|^const (GROUP_NAME|ROUND_LABEL|FIXTURES_IN_PHASE)\b" apps/v1_api/src/tournaments/templates/bracket-template-plan.ts
```

```ts
// apps/v1_api/src/tournaments/templates/knockout-phase-labels.ts
import type { V1TournamentGroupPhase } from '@prisma/client';

export type KnockoutPhase = Exclude<V1TournamentGroupPhase, 'group'>;

// <bracket-template-plan.ts 에서 잘라낸 GROUP_NAME / ROUND_LABEL / FIXTURES_IN_PHASE 를 그대로 붙이고 앞에 export 만 추가>
export const GROUP_NAME: Record<KnockoutPhase, string> = { /* 이동한 값 */ };
export const ROUND_LABEL: Record<KnockoutPhase, string> = { /* 이동한 값 */ };
export const FIXTURES_IN_PHASE: Record<KnockoutPhase, number> = { /* 이동한 값 */ };
```

`bracket-template-plan.ts` 에는 원래 정의 4개를 지우고 `import { FIXTURES_IN_PHASE, GROUP_NAME, ROUND_LABEL, type KnockoutPhase } from './knockout-phase-labels';` 한 줄을 넣는다(`V1TournamentGroupPhase` import 가 다른 곳에서 안 쓰이면 함께 지운다). 이동만으로 기존 knockout·league 테스트가 그대로 통과해야 한다.

Run: `cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/bracket-template-plan.spec.ts` 후 `./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"`
Expected: PASS(이동 전과 같은 통과 수), tsc 0. 이 파일에서 `@prisma/client` 값 import 는 없다(타입만).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// apps/v1_api/src/tournaments/templates/group-knockout-plan.spec.ts
import { UnprocessableEntityException } from '@nestjs/common';
import type { BracketTemplatePlan } from './bracket-template-plan';
import { planGroupKnockoutTemplate, type GroupKnockoutTemplateInput } from './group-knockout-plan';

const base: GroupKnockoutTemplateInput = {
  kind: 'group_knockout',
  groupCount: 2,
  teamsPerGroup: 4,
  advancePerGroup: 2,
  legs: 1,
  thirdPlace: false,
};
const plan = (overrides: Partial<GroupKnockoutTemplateInput> = {}, offset = 0) =>
  planGroupKnockoutTemplate({ ...base, ...overrides }, { fixtureNumberOffset: offset });

const groupKeyByName = (p: BracketTemplatePlan, name: string) => p.groups.find((g) => g.name === name)!.key;
const knockoutFixtures = (p: BracketTemplatePlan, round: string) => p.fixtures.filter((f) => f.round === round);
const stageFixtures = (p: BracketTemplatePlan) => p.fixtures.filter((f) => f.round.startsWith('league_r'));
const rankLabel = (p: BracketTemplatePlan, key: string | null) => {
  const slot = p.slots.find((s) => s.key === key);
  if (!slot || slot.kind !== 'GROUP_RANK') return null;
  const source = p.groups.find((g) => g.key === slot.sourceGroupKey)!;
  return `${source.name.replace('조', '')}${slot.position}`;
};

describe('planGroupKnockoutTemplate — 개수 계약', () => {
  it('2조 x 4팀, 2팀 진출, 1회전: 조별 12 + 4강 2 + 결승 1 = 15경기, 연결 2, 자리 12(ENTRY 8 + GROUP_RANK 4)', () => {
    const p = plan();
    expect(stageFixtures(p)).toHaveLength(12);
    expect(p.fixtures).toHaveLength(15);
    expect(p.edges).toHaveLength(2);
    expect(p.groups).toHaveLength(4);
    expect(p.slots.filter((s) => s.kind === 'ENTRY')).toHaveLength(8);
    expect(p.slots.filter((s) => s.kind === 'GROUP_RANK')).toHaveLength(4);
    expect(p.byeSlots).toEqual([]);
  });

  it('3·4위전을 넣으면 경기 +1, 4강 패자 연결 +2, 3위 결정전 그룹 +1', () => {
    const p = plan({ thirdPlace: true });
    expect(p.fixtures).toHaveLength(16);
    expect(p.edges).toHaveLength(4);
    expect(p.groups).toHaveLength(5);
  });

  it.each([
    // 조, 팀, 진출, 회전, 3위전, 경기, 연결, 그룹, 자리
    [2, 3, 1, 1, false, 7, 0, 3, 8],
    [4, 4, 2, 2, true, 56, 8, 8, 24],
    [8, 3, 1, 1, false, 31, 6, 11, 32],
    [4, 5, 1, 2, false, 83, 2, 6, 24],
    // K=16: 16강 8 + 8강 4 + 4강 2 + 결승 1 (+ 3·4위전 1), 연결 8+4+2 (+2), 결선 그룹 4 (+1), GROUP_RANK 16
    [8, 4, 2, 1, false, 63, 14, 12, 48],
    [8, 4, 2, 1, true, 64, 16, 13, 48],
    [8, 5, 2, 2, true, 176, 16, 13, 56],
  ] as const)('%i조 x %i팀(진출 %i, %i회전, 3위전 %s) → 경기 %i · 연결 %i · 그룹 %i · 자리 %i', (groupCount, teamsPerGroup, advancePerGroup, legs, thirdPlace, fixtures, edges, groups, slots) => {
    const p = plan({ groupCount, teamsPerGroup, advancePerGroup, legs, thirdPlace });
    expect(p.fixtures).toHaveLength(fixtures);
    expect(p.edges).toHaveLength(edges);
    expect(p.groups).toHaveLength(groups);
    expect(p.slots).toHaveLength(slots);
  });
});

describe('planGroupKnockoutTemplate — 조별 라운드로빈', () => {
  it('조 이름·phase·진출 수와 ENTRY 자리 소속', () => {
    const p = plan({ groupCount: 4, advancePerGroup: 1 });
    expect(p.groups.slice(0, 4).map((g) => [g.name, g.phase, g.advanceCount])).toEqual([
      ['A조', 'group', 1],
      ['B조', 'group', 1],
      ['C조', 'group', 1],
      ['D조', 'group', 1],
    ]);
    const entry = p.slots.filter((s) => s.kind === 'ENTRY');
    expect(entry.every((s) => s.sourceGroupKey === null && s.groupKey !== null)).toBe(true);
    expect(entry.filter((s) => s.groupKey === groupKeyByName(p, 'B조')).map((s) => s.position)).toEqual([1, 2, 3, 4]);
  });

  it('각 ENTRY 자리는 자기 조 안에서 (팀 수-1) x 회전 경기를 치르고 다른 조 자리와는 붙지 않는다', () => {
    const p = plan({ legs: 2 });
    for (const entry of p.slots.filter((s) => s.kind === 'ENTRY')) {
      const games = stageFixtures(p).filter((f) => f.homeSlotKey === entry.key || f.awaySlotKey === entry.key);
      expect(games).toHaveLength((4 - 1) * 2);
      for (const game of games) expect(game.groupKey).toBe(entry.groupKey);
    }
    for (const game of stageFixtures(p)) {
      const sides = [game.homeSlotKey, game.awaySlotKey].map((key) => p.slots.find((s) => s.key === key)!);
      expect(sides[0].groupKey).toBe(sides[1].groupKey);
      expect(sides[0].key).not.toBe(sides[1].key);
    }
  });

  it('2회전은 같은 쌍을 홈/어웨이를 바꿔 한 번 더 붙인다', () => {
    const p = plan({ legs: 2, teamsPerGroup: 3, groupCount: 2 });
    const a = p.slots.filter((s) => s.kind === 'ENTRY' && s.groupKey === groupKeyByName(p, 'A조'));
    const [first, second] = [a[0].key, a[1].key];
    const meetings = stageFixtures(p).filter((f) => [f.homeSlotKey, f.awaySlotKey].includes(first) && [f.homeSlotKey, f.awaySlotKey].includes(second));
    expect(meetings.map((m) => m.legNumber).sort()).toEqual([1, 2]);
    const leg1 = meetings.find((m) => m.legNumber === 1)!;
    const leg2 = meetings.find((m) => m.legNumber === 2)!;
    expect(leg2.homeSlotKey).toBe(leg1.awaySlotKey);
  });

  it('경기 번호는 offset 다음부터 대회 전체에서 연속·유일하고 조별 → 결선 순이다', () => {
    const p = plan({ thirdPlace: true }, 10);
    const numbers = p.fixtures.map((f) => f.fixtureNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(Math.min(...numbers)).toBe(11);
    expect(Math.max(...numbers)).toBe(10 + p.fixtures.length);
    const lastStage = Math.max(...stageFixtures(p).map((f) => f.fixtureNumber));
    expect(Math.min(...knockoutFixtures(p, '4강').map((f) => f.fixtureNumber))).toBeGreaterThan(lastStage);
    // PR-1b/1c knockout 템플릿과 같은 순서: 결승 다음이 3·4위전
    expect(knockoutFixtures(p, '3·4위전')[0].fixtureNumber).toBe(knockoutFixtures(p, '결승')[0].fixtureNumber + 1);
  });

  it('(round, fixtureNumber, legNumber) 가 유일하다 — DB 유일 제약과 같은 조건', () => {
    const p = plan({ groupCount: 4, teamsPerGroup: 4, advancePerGroup: 2, legs: 2, thirdPlace: true });
    const triples = p.fixtures.map((f) => `${f.round}|${f.fixtureNumber}|${f.legNumber}`);
    expect(new Set(triples).size).toBe(triples.length);
  });
});

describe('planGroupKnockoutTemplate — 결선 자리와 연결', () => {
  it('2조 x 2팀: 4강 A1–B2, B1–A2 / 결승은 4강 승자끼리', () => {
    const p = plan();
    const semis = knockoutFixtures(p, '4강');
    expect(semis.map((f) => [rankLabel(p, f.homeSlotKey), rankLabel(p, f.awaySlotKey)])).toEqual([['A1', 'B2'], ['B1', 'A2']]);
    const [final] = knockoutFixtures(p, '결승');
    expect(final.homeSlotKey).toBeNull();
    expect(final.awaySlotKey).toBeNull();
    expect(p.edges).toEqual([
      { sourceFixtureKey: semis[0].key, outcome: 'WINNER', targetFixtureKey: final.key, targetSide: 'HOME' },
      { sourceFixtureKey: semis[1].key, outcome: 'WINNER', targetFixtureKey: final.key, targetSide: 'AWAY' },
    ]);
  });

  it('GROUP_RANK 자리: 결선 첫 그룹 소속, position = 순위, sourceGroupKey = 올라오는 조', () => {
    const p = plan();
    const rankSlots = p.slots.filter((s) => s.kind === 'GROUP_RANK');
    const semiGroup = groupKeyByName(p, '4강');
    expect(rankSlots.every((s) => s.groupKey === semiGroup)).toBe(true);
    expect(rankSlots.map((s) => [s.position, p.groups.find((g) => g.key === s.sourceGroupKey)!.name]).sort()).toEqual([
      [1, 'A조'],
      [1, 'B조'],
      [2, 'A조'],
      [2, 'B조'],
    ]);
  });

  it('4조 x 2팀: 8강 표 그대로, 8강 1·2경기 → 4강 1, 3·4경기 → 4강 2', () => {
    const p = plan({ groupCount: 4, advancePerGroup: 2 });
    const quarters = knockoutFixtures(p, '8강');
    expect(quarters.map((f) => [rankLabel(p, f.homeSlotKey), rankLabel(p, f.awaySlotKey)])).toEqual([
      ['A1', 'B2'], ['C1', 'D2'], ['B1', 'A2'], ['D1', 'C2'],
    ]);
    const semis = knockoutFixtures(p, '4강');
    const into = (target: string) => p.edges.filter((e) => e.targetFixtureKey === target).map((e) => [e.sourceFixtureKey, e.targetSide]);
    expect(into(semis[0].key)).toEqual([[quarters[0].key, 'HOME'], [quarters[1].key, 'AWAY']]);
    expect(into(semis[1].key)).toEqual([[quarters[2].key, 'HOME'], [quarters[3].key, 'AWAY']]);
  });

  it('결선 첫 라운드로 들어오는 연결선은 없다(자리가 대신한다) — 대조: 둘째 라운드부터는 양쪽 다 연결', () => {
    const p = plan({ groupCount: 4, advancePerGroup: 2 });
    const firstRoundKeys = new Set(knockoutFixtures(p, '8강').map((f) => f.key));
    expect(p.edges.some((e) => firstRoundKeys.has(e.targetFixtureKey))).toBe(false);
    for (const semi of knockoutFixtures(p, '4강')) {
      expect(p.edges.filter((e) => e.targetFixtureKey === semi.key).map((e) => e.targetSide).sort()).toEqual(['AWAY', 'HOME']);
    }
  });

  it('3·4위전: 별도 그룹(phase third_place)에 4강 LOSER 연결, 결승으로는 WINNER 만', () => {
    const p = plan({ thirdPlace: true });
    const third = p.groups.find((g) => g.phase === 'third_place')!;
    expect(third.name).toBe('3위 결정전');
    const [match] = knockoutFixtures(p, '3·4위전');
    expect(match.groupKey).toBe(third.key);
    const semis = knockoutFixtures(p, '4강');
    expect(p.edges.filter((e) => e.targetFixtureKey === match.key)).toEqual([
      { sourceFixtureKey: semis[0].key, outcome: 'LOSER', targetFixtureKey: match.key, targetSide: 'HOME' },
      { sourceFixtureKey: semis[1].key, outcome: 'LOSER', targetFixtureKey: match.key, targetSide: 'AWAY' },
    ]);
    const [final] = knockoutFixtures(p, '결승');
    expect(p.edges.filter((e) => e.targetFixtureKey === final.key).every((e) => e.outcome === 'WINNER')).toBe(true);
  });

  it('2조 x 1팀: 결선은 결승 한 경기, 연결 0, 결승 사이드가 곧 GROUP_RANK 자리', () => {
    const p = plan({ advancePerGroup: 1 });
    const [final] = knockoutFixtures(p, '결승');
    expect([rankLabel(p, final.homeSlotKey), rankLabel(p, final.awaySlotKey)]).toEqual(['A1', 'B1']);
    expect(p.edges).toEqual([]);
  });

  it('모든 경기·연결선이 계획 안의 자리·경기 키만 가리키고 키가 중복되지 않는다', () => {
    const p = plan({ groupCount: 4, advancePerGroup: 2, thirdPlace: true, legs: 2 });
    const slotKeys = new Set(p.slots.map((s) => s.key));
    const groupKeys = new Set(p.groups.map((g) => g.key));
    const fixtureKeys = new Set(p.fixtures.map((f) => f.key));
    expect(slotKeys.size).toBe(p.slots.length);
    expect(fixtureKeys.size).toBe(p.fixtures.length);
    expect(groupKeys.size).toBe(p.groups.length);
    for (const f of p.fixtures) {
      expect(groupKeys.has(f.groupKey)).toBe(true);
      for (const key of [f.homeSlotKey, f.awaySlotKey]) if (key !== null) expect(slotKeys.has(key)).toBe(true);
    }
    for (const e of p.edges) {
      expect(fixtureKeys.has(e.sourceFixtureKey)).toBe(true);
      expect(fixtureKeys.has(e.targetFixtureKey)).toBe(true);
    }
    for (const s of p.slots) {
      if (s.groupKey !== null) expect(groupKeys.has(s.groupKey)).toBe(true);
      if (s.sourceGroupKey !== null) expect(groupKeys.has(s.sourceGroupKey)).toBe(true);
    }
  });
});

describe('planGroupKnockoutTemplate — 16강 (8조 x 2팀, 스펙 S1-b·S2)', () => {
  const sixteen = (overrides: Partial<GroupKnockoutTemplateInput> = {}) =>
    plan({ groupCount: 8, teamsPerGroup: 4, advancePerGroup: 2, ...overrides });

  it('결선 그룹은 16강(phase round16) → 8강 → 4강 → 결승 → (thirdPlace 일 때만) 3위 결정전 순이고 sortOrder 는 0부터 그 순서다', () => {
    const p = sixteen({ thirdPlace: true });
    expect(p.groups.slice(8).map((g) => [g.name, g.phase])).toEqual([
      ['16강', 'round16'],
      ['8강', 'quarter'],
      ['4강', 'semi'],
      ['결승', 'final'],
      ['3위 결정전', 'third_place'],
    ]);
    expect(p.groups.slice(8).map((g) => g.sortOrder)).toEqual([0, 1, 2, 3, 4]);
    expect(sixteen().groups.slice(8).map((g) => g.phase)).toEqual(['round16', 'quarter', 'semi', 'final']);
  });

  it('라운드별 경기 수 8·4·2·1(+1)이고 조별 경기(8조 x 6) 뒤 번호로 이어진다', () => {
    const p = sixteen({ thirdPlace: true });
    expect(['16강', '8강', '4강', '결승', '3·4위전'].map((r) => knockoutFixtures(p, r).length)).toEqual([8, 4, 2, 1, 1]);
    expect(stageFixtures(p)).toHaveLength(48);
    const lastStage = Math.max(...stageFixtures(p).map((f) => f.fixtureNumber));
    expect(Math.min(...knockoutFixtures(p, '16강').map((f) => f.fixtureNumber))).toBe(lastStage + 1);
  });

  it('16강 8경기가 스펙 S2 표 그대로 GROUP_RANK 자리를 사이드로 쓴다(자리 16개)', () => {
    const p = sixteen();
    expect(p.slots.filter((s) => s.kind === 'GROUP_RANK')).toHaveLength(16);
    expect(knockoutFixtures(p, '16강').map((f) => [rankLabel(p, f.homeSlotKey), rankLabel(p, f.awaySlotKey)])).toEqual([
      ['A1', 'B2'], ['C1', 'D2'], ['E1', 'F2'], ['G1', 'H2'],
      ['B1', 'A2'], ['D1', 'C2'], ['F1', 'E2'], ['H1', 'G2'],
    ]);
    const firstGroup = groupKeyByName(p, '16강');
    expect(p.slots.filter((s) => s.kind === 'GROUP_RANK').every((s) => s.groupKey === firstGroup)).toBe(true);
  });

  it('16강 2i-1·2i 번 경기 승자 → 8강 i 번 경기 홈·어웨이, 8강→4강→결승도 같은 규칙이고 16강으로 들어오는 연결·부전승은 없다', () => {
    const p = sixteen();
    const r16 = knockoutFixtures(p, '16강');
    const quarters = knockoutFixtures(p, '8강');
    for (let i = 1; i <= 4; i += 1) {
      expect(p.edges.filter((e) => e.targetFixtureKey === quarters[i - 1].key)).toEqual([
        { sourceFixtureKey: r16[2 * i - 2].key, outcome: 'WINNER', targetFixtureKey: quarters[i - 1].key, targetSide: 'HOME' },
        { sourceFixtureKey: r16[2 * i - 1].key, outcome: 'WINNER', targetFixtureKey: quarters[i - 1].key, targetSide: 'AWAY' },
      ]);
    }
    expect(p.edges).toHaveLength(8 + 4 + 2);
    expect(p.edges.every((e) => e.outcome === 'WINNER')).toBe(true);
    expect(p.edges.some((e) => r16.some((f) => f.key === e.targetFixtureKey))).toBe(false);
    expect(p.byeSlots).toEqual([]);
    expect(quarters.every((f) => f.homeSlotKey === null && f.awaySlotKey === null)).toBe(true);
  });

  it('3·4위전은 4강 패자 연결만 받고(16강·8강 패자는 연결 없음) 연결 16개다', () => {
    const p = sixteen({ thirdPlace: true });
    const [match] = knockoutFixtures(p, '3·4위전');
    const semis = knockoutFixtures(p, '4강');
    expect(p.edges.filter((e) => e.outcome === 'LOSER')).toEqual([
      { sourceFixtureKey: semis[0].key, outcome: 'LOSER', targetFixtureKey: match.key, targetSide: 'HOME' },
      { sourceFixtureKey: semis[1].key, outcome: 'LOSER', targetFixtureKey: match.key, targetSide: 'AWAY' },
    ]);
    expect(p.edges).toHaveLength(16);
  });

  it('(round, fixtureNumber, legNumber) 유일 — 2회전 8조 x 5팀 포함', () => {
    const p = sixteen({ teamsPerGroup: 5, legs: 2, thirdPlace: true });
    const triples = p.fixtures.map((f) => `${f.round}|${f.fixtureNumber}|${f.legNumber}`);
    expect(new Set(triples).size).toBe(triples.length);
  });
});

describe('planGroupKnockoutTemplate — 거절', () => {
  const codeOf = (operation: () => unknown) => {
    try {
      operation();
    } catch (error) {
      if (!(error instanceof UnprocessableEntityException)) throw error;
      return (error.getResponse() as { code?: string }).code;
    }
    throw new Error('예외가 나지 않았다');
  };

  it.each([
    ['결선 크기 3 (3조 x 1)', { groupCount: 3, advancePerGroup: 1 as const }],
    ['결선 크기 7 (7조 x 1)', { groupCount: 7, advancePerGroup: 1 as const }],
    ['결선 크기 14 (7조 x 2)', { groupCount: 7, advancePerGroup: 2 as const }],
    ['결선 크기 6 (3조 x 2)', { groupCount: 3, advancePerGroup: 2 as const }],
    ['조 1개', { groupCount: 1 }],
    ['조 9개', { groupCount: 9 }],
    ['조당 2팀', { teamsPerGroup: 2 }],
    ['조당 7팀', { teamsPerGroup: 7 }],
    ['3회전', { legs: 3 as unknown as 1 }],
    ['진출 3팀', { advancePerGroup: 3 as unknown as 1 }],
  ])('%s → 422 BRACKET_TEMPLATE_UNSUPPORTED', (_name, overrides) => {
    expect(codeOf(() => plan(overrides))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });

  it('결선이 결승 한 경기뿐(2조 x 1)인데 3·4위전을 넣으면 422 — 3·4위전의 패자 원천은 4강뿐', () => {
    expect(codeOf(() => plan({ advancePerGroup: 1, thirdPlace: true }))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });

  it('결선 16(8조 x 2)은 거절하지 않는다 — 대조: 조 9개(결선 18)는 거절', () => {
    expect(() => plan({ groupCount: 8, advancePerGroup: 2 })).not.toThrow();
    expect(codeOf(() => plan({ groupCount: 9, advancePerGroup: 2 }))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/group-knockout-plan.spec.ts
```

Expected: FAIL — `Cannot find module './group-knockout-plan'`.

- [ ] **Step 3: 구현**

```ts
// apps/v1_api/src/tournaments/templates/group-knockout-plan.ts
import { UnprocessableEntityException } from '@nestjs/common';
import { buildLeagueFixtureRows } from '../league-fixture-generator.service';
import type {
  BracketTemplateInput,
  BracketTemplatePlan,
  PlanEdge,
  PlanFixture,
  PlanGroup,
  PlanSlot,
} from './bracket-template-plan';
import { FIXTURES_IN_PHASE, GROUP_NAME, ROUND_LABEL, type KnockoutPhase } from './knockout-phase-labels';
import { groupRankPairings } from './group-rank-pairings';

export type GroupKnockoutTemplateInput = Extract<BracketTemplateInput, { kind: 'group_knockout' }>;

type MainPhase = Extract<KnockoutPhase, 'round16' | 'quarter' | 'semi' | 'final'>;

const MAIN_CHAIN: readonly MainPhase[] = ['round16', 'quarter', 'semi', 'final'];
const FIRST_PHASE_BY_SIZE: Readonly<Record<number, MainPhase>> = { 16: 'round16', 8: 'quarter', 4: 'semi', 2: 'final' };

const stageGroupKey = (index: number) => `group:${index}`;
const entryKey = (group: number, position: number) => `entry:${group}:${position}`;
const rankKey = (group: number, rank: number) => `rank:${group}:${rank}`;
const knockoutGroupKey = (phase: KnockoutPhase) => `ko:${phase}`;
const knockoutFixtureKey = (phase: KnockoutPhase, index: number) => `fx:ko:${phase}:${index}`;

function unsupported(message: string): never {
  throw new UnprocessableEntityException({ code: 'BRACKET_TEMPLATE_UNSUPPORTED', message });
}

function assertSupported(input: GroupKnockoutTemplateInput): void {
  const { groupCount, teamsPerGroup, advancePerGroup, legs, thirdPlace } = input;
  const inRange = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
  if (
    !inRange(groupCount, 2, 8) ||
    !inRange(teamsPerGroup, 3, 6) ||
    (advancePerGroup !== 1 && advancePerGroup !== 2) ||
    (legs !== 1 && legs !== 2)
  ) {
    unsupported('조는 2~8개, 조당 팀은 3~6팀, 진출은 1~2팀, 회전은 1~2회로 입력해 주세요.');
  }
  groupRankPairings(groupCount, advancePerGroup); // 결선 크기가 2·4·8·16 이 아니면 여기서 422
  if (groupCount * advancePerGroup === 2 && thirdPlace) {
    unsupported('결선이 결승 한 경기뿐이면 3·4위전을 만들 수 없어요.');
  }
}

export function planGroupKnockoutTemplate(
  input: GroupKnockoutTemplateInput,
  ctx: { fixtureNumberOffset: number },
): BracketTemplatePlan {
  assertSupported(input);
  const { groupCount, teamsPerGroup, advancePerGroup, legs, thirdPlace } = input;
  const size = groupCount * advancePerGroup;
  const mainPhases = MAIN_CHAIN.slice(MAIN_CHAIN.indexOf(FIRST_PHASE_BY_SIZE[size]));
  // 결승 다음이 3·4위전 — PR-1b/1c knockout 템플릿과 같은 번호·그룹 순서
  const phases: KnockoutPhase[] = thirdPlace ? [...mainPhases, 'third_place'] : [...mainPhases];
  const firstPhase = phases[0];

  const groups: PlanGroup[] = [];
  const slots: PlanSlot[] = [];
  for (let g = 0; g < groupCount; g += 1) {
    groups.push({
      key: stageGroupKey(g),
      name: `${String.fromCharCode(65 + g)}조`,
      phase: 'group',
      sortOrder: g,
      advanceCount: advancePerGroup,
    });
    for (let position = 1; position <= teamsPerGroup; position += 1) {
      slots.push({ key: entryKey(g, position), kind: 'ENTRY', groupKey: stageGroupKey(g), position, sourceGroupKey: null });
    }
  }
  phases.forEach((phase, index) => {
    groups.push({ key: knockoutGroupKey(phase), name: GROUP_NAME[phase], phase, sortOrder: index, advanceCount: null });
  });
  for (let g = 0; g < groupCount; g += 1) {
    for (let rank = 1; rank <= advancePerGroup; rank += 1) {
      slots.push({ key: rankKey(g, rank), kind: 'GROUP_RANK', groupKey: knockoutGroupKey(firstPhase), position: rank, sourceGroupKey: stageGroupKey(g) });
    }
  }

  const fixtures: PlanFixture[] = [];
  let lastNumber = ctx.fixtureNumberOffset;
  for (let g = 0; g < groupCount; g += 1) {
    const rows = buildLeagueFixtureRows({
      groupId: stageGroupKey(g),
      registrationIds: Array.from({ length: teamsPerGroup }, (_, index) => entryKey(g, index + 1)),
      legs,
      balanceHome: true,
      schedule: null,
      fixtureNumberOffset: lastNumber,
    });
    for (const row of rows) {
      fixtures.push({
        key: `fx:${row.groupId}:${row.fixtureNumber}`,
        groupKey: row.groupId,
        round: row.round,
        fixtureNumber: row.fixtureNumber,
        legNumber: row.legNumber,
        homeSlotKey: row.homeRegistrationId,
        awaySlotKey: row.awayRegistrationId,
      });
    }
    lastNumber += rows.length;
  }

  const pairings = groupRankPairings(groupCount, advancePerGroup);
  for (const phase of phases) {
    for (let index = 1; index <= FIXTURES_IN_PHASE[phase]; index += 1) {
      lastNumber += 1;
      const pair = phase === firstPhase ? pairings[index - 1] : null;
      fixtures.push({
        key: knockoutFixtureKey(phase, index),
        groupKey: knockoutGroupKey(phase),
        round: ROUND_LABEL[phase],
        fixtureNumber: lastNumber,
        legNumber: 1,
        homeSlotKey: pair ? rankKey(pair[0].group, pair[0].rank) : null,
        awaySlotKey: pair ? rankKey(pair[1].group, pair[1].rank) : null,
      });
    }
  }

  const edges: PlanEdge[] = [];
  for (let i = 0; i < mainPhases.length - 1; i += 1) {
    const from = mainPhases[i];
    const to = mainPhases[i + 1];
    for (let j = 1; j <= FIXTURES_IN_PHASE[to]; j += 1) {
      edges.push({ sourceFixtureKey: knockoutFixtureKey(from, 2 * j - 1), outcome: 'WINNER', targetFixtureKey: knockoutFixtureKey(to, j), targetSide: 'HOME' });
      edges.push({ sourceFixtureKey: knockoutFixtureKey(from, 2 * j), outcome: 'WINNER', targetFixtureKey: knockoutFixtureKey(to, j), targetSide: 'AWAY' });
    }
  }
  if (thirdPlace) {
    edges.push({ sourceFixtureKey: knockoutFixtureKey('semi', 1), outcome: 'LOSER', targetFixtureKey: knockoutFixtureKey('third_place', 1), targetSide: 'HOME' });
    edges.push({ sourceFixtureKey: knockoutFixtureKey('semi', 2), outcome: 'LOSER', targetFixtureKey: knockoutFixtureKey('third_place', 1), targetSide: 'AWAY' });
  }

  return { groups, slots, fixtures, edges, byeSlots: [] };
}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/group-knockout-plan.spec.ts
```

Expected: PASS. `kind: 'ENTRY'` 같은 리터럴이 `PlanSlot['kind']`(Prisma enum 유니온)에 대입되는지는 격리 생성 client 로 `tsc` 확인한다(색인 Global Constraints).

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/tournaments/templates/knockout-phase-labels.ts apps/v1_api/src/tournaments/templates/group-knockout-plan.ts apps/v1_api/src/tournaments/templates/group-knockout-plan.spec.ts
git commit -m "feat(v1_api): 조별+결선 대진 계획 planGroupKnockoutTemplate" -- apps/v1_api/src/tournaments/templates/knockout-phase-labels.ts apps/v1_api/src/tournaments/templates/bracket-template-plan.ts apps/v1_api/src/tournaments/templates/group-knockout-plan.ts apps/v1_api/src/tournaments/templates/group-knockout-plan.spec.ts
git show --stat HEAD
```

## Task 3: `planBracketTemplate` 에 group_knockout 연결 + PR-1b 테스트 뒤집기

PR-1b 는 `group_knockout` 을 422 `BRACKET_TEMPLATE_UNSUPPORTED` 로 거절하고 그것을 단위·통합 테스트로 고정해 두었다. 이 태스크가 그 분기를 열면서 **그 두 테스트를 함께 뒤집는다**(안 뒤집으면 red).

**Files:**
- Modify: `apps/v1_api/src/tournaments/templates/bracket-template-plan.ts` (`build()` 의 `case 'group_knockout':` 한 줄 + import 한 줄)
- Modify: `apps/v1_api/src/tournaments/templates/bracket-template-plan.spec.ts` (미지원 표에서 한 행 삭제 + describe 추가)
- Modify: `apps/v1_api/test/tournaments/bracket-template.integration-spec.ts` (미지원 `it` 을 성공 `it` 으로 교체)

**Interfaces:**
- Consumes: `planGroupKnockoutTemplate`(Task 2) · 1b 스펙의 헬퍼 `plan(input, offset = 0)`·`codeOf(fn)` · 1b 통합 스펙의 헬퍼 `liveFixtures`·`counts`·`seedBracketTournament`
- Produces: `planBracketTemplate({ kind: 'group_knockout', … }, ctx)` 가 계획을 돌려준다. 경기 수 상한(240) 검사는 1b 의 `planBracketTemplate` 가 `build()` 뒤에서 모든 kind 에 대해 이미 한다(재구현 금지).

- [ ] **Step 1: 실패하는 테스트 작성** — `bracket-template-plan.spec.ts`

① `describe('planBracketTemplate — 거부'…)` 안 `it.each([...])('범위 밖·미지원 입력 %j …')` 표에서 이 한 행을 **삭제**한다(이제 지원하는 입력이다):

```ts
    [{ kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false }],
```

② 파일 끝에 추가한다(위 두 헬퍼를 그대로 쓴다). 240 상한은 조별 경기와 결선 경기를 **합쳐** 센다 — 16강이 들어가면 극단 조합의 한계가 8조 x 6팀 x 2회전(240 + 16 = 256)에서 이미 넘는다.

```ts
describe('planBracketTemplate — group_knockout', () => {
  const groupKnockout = {
    kind: 'group_knockout' as const,
    groupCount: 2,
    teamsPerGroup: 4,
    advancePerGroup: 2 as const,
    legs: 1 as const,
    thirdPlace: false,
  };

  it('2조 x 4팀(2팀 진출): 조별 12 + 4강 2 + 결승 1 = 15경기, GROUP_RANK 자리 4개', () => {
    const p = plan(groupKnockout);
    expect(p.fixtures).toHaveLength(15);
    expect(p.slots.filter((slot) => slot.kind === 'GROUP_RANK')).toHaveLength(4);
    expect(p.slots.filter((slot) => slot.kind === 'ENTRY')).toHaveLength(8);
  });

  it('3·4위전 포함 시 16경기', () => {
    expect(plan({ ...groupKnockout, thirdPlace: true }).fixtures).toHaveLength(16);
  });

  it('fixtureNumberOffset 이 첫 조별 경기 번호에 반영된다', () => {
    const numbers = plan(groupKnockout, 20).fixtures.map((f) => f.fixtureNumber);
    expect(Math.min(...numbers)).toBe(21);
    expect(Math.max(...numbers)).toBe(35);
  });

  it('상한: 8조 x 6팀 x 2회전은 247경기라 422 BRACKET_TEMPLATE_TOO_LARGE, 8조 x 5팀 x 2회전(167경기)은 통과', () => {
    const big = { ...groupKnockout, groupCount: 8, teamsPerGroup: 6, advancePerGroup: 1 as const, legs: 2 as const };
    expect(codeOf(() => plan(big))).toBe('BRACKET_TEMPLATE_TOO_LARGE');
    expect(plan({ ...big, teamsPerGroup: 5 }).fixtures).toHaveLength(167);
  });

  it('결선 크기 6 (3조 x 2팀)은 422 BRACKET_TEMPLATE_UNSUPPORTED', () => {
    expect(codeOf(() => plan({ ...groupKnockout, groupCount: 3 }))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });

  describe('16강 (8조 x 2팀)', () => {
    const sixteen = { ...groupKnockout, groupCount: 8, teamsPerGroup: 4 };

    it('현실적인 8조 x 4팀 x 1회전: 조별 48 + 16강 8 + 8강 4 + 4강 2 + 결승 1 = 63경기(3·4위전 포함 64), 16강 그룹 phase round16', () => {
      const p = plan(sixteen);
      expect(p.fixtures).toHaveLength(63);
      expect(plan({ ...sixteen, thirdPlace: true }).fixtures).toHaveLength(64);
      expect(p.groups.find((g) => g.name === '16강')?.phase).toBe('round16');
      expect(p.fixtures.filter((f) => f.round === '16강')).toHaveLength(8);
    });

    it('상한 경계: 8조 x 6팀 x 2회전은 조별 240 + 결선 16 = 256경기라 422 BRACKET_TEMPLATE_TOO_LARGE(3·4위전 유무와 무관), 8조 x 5팀 x 2회전(176경기)·8조 x 6팀 x 1회전(136경기)은 통과', () => {
      const extreme = { ...sixteen, teamsPerGroup: 6, legs: 2 as const };
      expect(codeOf(() => plan(extreme))).toBe('BRACKET_TEMPLATE_TOO_LARGE');
      expect(codeOf(() => plan({ ...extreme, thirdPlace: true }))).toBe('BRACKET_TEMPLATE_TOO_LARGE');
      expect(plan({ ...extreme, teamsPerGroup: 5 }).fixtures).toHaveLength(176);
      expect(plan({ ...extreme, legs: 1 }).fixtures).toHaveLength(136);
    });
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates/bracket-template-plan.spec.ts -t "group_knockout"
```

Expected: FAIL — 새 describe 의 첫 4건이 `BRACKET_TEMPLATE_UNSUPPORTED`(`조별+결선 템플릿은 아직 지원하지 않아요.`)로 던져진다.

- [ ] **Step 3: 연결** — `bracket-template-plan.ts`: 파일 상단 import 에 한 줄 추가하고, `build()` 안 이 분기를

```ts
    case 'group_knockout':
      return unsupported('조별+결선 템플릿은 아직 지원하지 않아요.');
```

다음으로 바꾼다(`build` 의 두 번째 인자 이름이 `offset` 이다).

파일 맨 위 import 묶음의 마지막 줄 바로 아래에 한 줄을 넣는다:

```ts
import { planGroupKnockoutTemplate } from './group-knockout-plan';
```

그리고 위에서 찾은 `case 'group_knockout':` 블록(두 줄: `case` 줄과 `return unsupported(...)` 줄)을 다음 두 줄로 바꾼다:

```ts
    case 'group_knockout':
      return planGroupKnockoutTemplate(input, { fixtureNumberOffset: offset });
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates
```

Expected: PASS (1b 의 knockout·league·DTO·교체 순서 스펙 회귀 없음 + Task 1·2 + 새 5건).

- [ ] **Step 5: 통합 스펙 뒤집기** — `test/tournaments/bracket-template.integration-spec.ts` 의 `it('조별+결선 템플릿은 이 PR 에서 422 BRACKET_TEMPLATE_UNSUPPORTED', …)` 블록 **전체**를 아래로 교체한다(같은 파일의 `liveFixtures`·`counts`·`seedBracketTournament`·`templates`·`user`·`prisma` 를 그대로 쓴다).

```ts
  it('조별+결선 2조 x 4팀(2팀 진출): 조 4 · 자리 12 · 경기 15 · 연결 2, 4강 사이드는 순위 자리 A1–B2 · B1–A2', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'gk', format: 'group_knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, {
      kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false,
    })).resolves.toEqual({ groups: 4, slots: 12, fixtures: 15, edges: 2 });
    expect(await counts(tournamentId)).toEqual({ fixtures: 15, groups: 4, slots: 12, edges: 2 });

    const fixtures = await liveFixtures(tournamentId);
    const rankLabel = async (slotId: string | null) => {
      const slot = await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slotId as string }, include: { sourceGroup: true } });
      return `${slot.kind}:${slot.sourceGroup?.name}${slot.position}`;
    };
    const semis = fixtures.filter((f) => f.round === '4강');
    expect(await Promise.all(semis.map(async (f) => [await rankLabel(f.teamMatch.homeSlotId), await rankLabel(f.teamMatch.awaySlotId)]))).toEqual([
      ['GROUP_RANK:A조1', 'GROUP_RANK:B조2'],
      ['GROUP_RANK:B조1', 'GROUP_RANK:A조2'],
    ]);

    // 조별 경기는 자기 조 ENTRY 자리만 쓰고, 팀이 들어오기 전에는 조 편성(GroupTeam)이 없다.
    const stage = fixtures.filter((f) => f.round.startsWith('league_r'));
    expect(stage).toHaveLength(12);
    for (const f of stage) {
      expect(f.teamMatch.homeSlot?.kind).toBe('ENTRY');
      expect(f.teamMatch.homeSlot?.groupId).toBe(f.groupId);
      expect(f.teamMatch.awaySlot?.groupId).toBe(f.groupId);
    }
    expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId } } })).toBe(0);
    const advance = await prisma.v1TournamentGroup.findMany({ where: { tournamentId, phase: 'group' }, select: { advanceCount: true } });
    expect(advance.map((g) => g.advanceCount)).toEqual([2, 2]);
  });

  it('결승 한 경기뿐인 조합(2조 x 1팀)에 3·4위전을 넣으면 422 이고 아무것도 만들지 않는다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'gk-final', format: 'group_knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, {
      kind: 'group_knockout', groupCount: 2, teamsPerGroup: 3, advancePerGroup: 1, legs: 1, thirdPlace: true,
    })).rejects.toMatchObject({ response: { code: 'BRACKET_TEMPLATE_UNSUPPORTED' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('조별+결선 8조 x 4팀(2팀 진출) + 3·4위전: 16강 phase round16 그룹 · 경기 64 · 연결 16 · 자리 48, 16강 사이드는 순위 자리 A1–B2 … H1–G2', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'gk16', format: 'group_knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, {
      kind: 'group_knockout', groupCount: 8, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true,
    })).resolves.toEqual({ groups: 13, slots: 48, fixtures: 64, edges: 16 });
    expect(await counts(tournamentId)).toEqual({ fixtures: 64, groups: 13, slots: 48, edges: 16 });

    const round16 = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId, phase: 'round16' } });
    expect(round16.name).toBe('16강');
    const fixtures = (await liveFixtures(tournamentId)).filter((f) => f.round === '16강');
    expect(fixtures).toHaveLength(8);
    const rankLabel = async (slotId: string | null) => {
      const slot = await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slotId as string }, include: { sourceGroup: true } });
      return `${slot.sourceGroup?.name}${slot.position}`;
    };
    expect(await Promise.all(fixtures.map(async (f) => [await rankLabel(f.teamMatch.homeSlotId), await rankLabel(f.teamMatch.awaySlotId)]))).toEqual([
      ['A조1', 'B조2'], ['C조1', 'D조2'], ['E조1', 'F조2'], ['G조1', 'H조2'],
      ['B조1', 'A조2'], ['D조1', 'C조2'], ['F조1', 'E조2'], ['H조1', 'G조2'],
    ]);
  });

  it('8조 x 6팀 x 2회전 + 16강(256경기)은 422 BRACKET_TEMPLATE_TOO_LARGE 이고 아무것도 만들지 않는다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'gk-large', format: 'group_knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, {
      kind: 'group_knockout', groupCount: 8, teamsPerGroup: 6, advancePerGroup: 2, legs: 2, thirdPlace: false,
    })).rejects.toMatchObject({ response: { code: 'BRACKET_TEMPLATE_TOO_LARGE' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });
```

실행(통합, CI 또는 로컬 DB): `cd apps/v1_api && ./node_modules/.bin/jest --selectProjects integration --runInBand test/tournaments/bracket-template.integration-spec.ts`
Expected: PASS. 이 스펙이 실제 executor 로 GROUP_RANK 자리의 `sourceGroupId` 와 사이드 연결이 DB 에 들어가는 것을 고정한다(플래너 단위 테스트가 못 보는 구간).

- [ ] **Step 6: 커밋**

```bash
git add apps/v1_api/src/tournaments/templates/group-knockout-plan.ts
git commit -m "feat(v1_api): 조별+결선 템플릿을 planBracketTemplate 에 연결" -- apps/v1_api/src/tournaments/templates/bracket-template-plan.ts apps/v1_api/src/tournaments/templates/bracket-template-plan.spec.ts apps/v1_api/test/tournaments/bracket-template.integration-spec.ts
git show --stat HEAD
```

(`group-knockout-plan.ts` 는 Task 2 에서 이미 커밋돼 있으면 위 `git add` 줄은 생략한다.)

## Task 4: 한 조·한 순위 판정 `resolveGroupRank` (순수)

**Files:**
- Create: `apps/v1_api/src/tournaments/slots/group-rank-preview.ts`
- Test: `apps/v1_api/src/tournaments/slots/group-rank-preview.spec.ts`

**Interfaces:**
- Consumes: `calculateLeagueStandingsWithTieBreakInfo`(`apps/v1_api/src/league-matches/league-standings.ts:154`, `tieGroups` = 5단계 기준을 다 쓰고도 갈리지 않은 완전 동률 묶음) · `LEAGUE_TIE_BREAK_ORDER`(`league-tie-break.ts:32`)
- Produces:
  - `type RankFixtureInput = { homeRegistrationId: string | null; awayRegistrationId: string | null; official: { homeScore: number; awayScore: number } | null }`
  - `type RankStandingInput = { registrationId: string; position: number | null; wins: number; draws: number; losses: number }`
  - `type GroupRankSource = { registrationIds: readonly string[]; fixtures: readonly RankFixtureInput[]; standings: readonly RankStandingInput[] }`
  - `type GroupRankResolution = { state: 'group_incomplete' } | { state: 'ready'; registrationId: string } | { state: 'tied'; tiedRegistrationIds: string[] }`
  - `resolveGroupRank(source: GroupRankSource, rank: number): GroupRankResolution`

판정 규칙(스펙 S4):
1. 조의 비취소 경기(호출자가 이미 걸러 넘긴다)가 하나도 없거나 하나라도 팀 미정·OFFICIAL 아님 → `group_incomplete`.
2. 저장된 `V1TournamentStanding` 이 낡았거나(모든 조 팀의 행이 없거나, 소화 경기 합 ≠ 2 × 확정 경기 수) 비어 있으면 `group_incomplete` — 순위 재계산은 결과 확정의 비동기 후속이라, 막 확정된 직후엔 표가 한 박자 늦다.
3. 정본 §5 순서(`LEAGUE_TIE_BREAK_ORDER`)로 다시 매겨 그 순위에 있는 팀이 `tieGroups` 한 묶음에 들면 `tied`(1·2위 동률이든 3팀 동률이든 같다).
4. (스펙 S4) 동률이 아니어도 저장된 순위(`V1TournamentStanding.position`)의 그 자리 팀이 §5 순위의 팀과 다르면(대회 설정 규칙과 §5 가 어긋나는 드문 경우) 임의로 한쪽을 믿지 않고 두 팀을 `tied` 로 넘긴다.

- [ ] **Step 1: 실패하는 테스트 작성** — 저장 순위는 모의값이 아니라 실제 `calculateCompetitionStandings` 로 만든다(두 규칙의 실제 어긋남을 재현하려면 필요하다).

```ts
// apps/v1_api/src/tournaments/slots/group-rank-preview.spec.ts
import { FOOTBALL_V1_CONFIG } from '../competition-config/competition-config';
import { calculateCompetitionStandings } from '../competition-config/competition-standings';
import { resolveGroupRank, type GroupRankSource } from './group-rank-preview';

type Result = readonly [home: string, away: string, homeScore: number, awayScore: number];

function sourceOf(
  ids: string[],
  results: Result[],
  options: { standingsFrom?: Result[]; dropStandingFor?: string; unofficialIndex?: number } = {},
): GroupRankSource {
  const standings = calculateCompetitionStandings({
    tournamentId: 'tournament-1',
    configVersionId: 'config-1',
    registrationIds: ids,
    fixtures: (options.standingsFrom ?? results).map(([home, away, homeScore, awayScore]) => ({
      homeRegistrationId: home,
      awayRegistrationId: away,
      homeScore,
      awayScore,
    })),
    config: FOOTBALL_V1_CONFIG,
  })
    .filter((row) => row.registrationId !== options.dropStandingFor)
    .map((row) => ({ registrationId: row.registrationId, position: row.position, wins: row.wins, draws: row.draws, losses: row.losses }));
  return {
    registrationIds: ids,
    standings,
    fixtures: results.map(([home, away, homeScore, awayScore], index) => ({
      homeRegistrationId: home,
      awayRegistrationId: away,
      official: index === options.unofficialIndex ? null : { homeScore, awayScore },
    })),
  };
}

const CLEAN: Result[] = [['A', 'B', 2, 0], ['A', 'C', 1, 0], ['B', 'C', 1, 0]];
const TIE_FIRST_SECOND: Result[] = [['A', 'B', 0, 0], ['A', 'C', 1, 0], ['B', 'C', 1, 0]];
const TIE_THREE: Result[] = [['A', 'B', 1, 0], ['B', 'C', 1, 0], ['C', 'A', 1, 0]];
const TIE_SECOND_THIRD: Result[] = [['A', 'B', 1, 0], ['A', 'C', 1, 0], ['B', 'C', 0, 0]];
// 저장 순위(설정: 승점 → 맞대결)는 B>A, §5(승점 → 득실)는 A>B 로 갈리는 4팀 조.
const RULES_DISAGREE: Result[] = [
  ['B', 'A', 1, 0], ['A', 'C', 4, 0], ['A', 'D', 0, 0], ['B', 'C', 0, 0], ['D', 'B', 1, 0], ['C', 'D', 0, 1],
];

describe('resolveGroupRank', () => {
  it('동률이 없으면 순위별로 ready — 1위 A, 2위 B, 3위 C', () => {
    const source = sourceOf(['A', 'B', 'C'], CLEAN);
    expect([1, 2, 3].map((rank) => resolveGroupRank(source, rank))).toEqual([
      { state: 'ready', registrationId: 'A' },
      { state: 'ready', registrationId: 'B' },
      { state: 'ready', registrationId: 'C' },
    ]);
  });

  it('1·2위 완전 동률: 두 자리 모두 tied(A,B), 구간 밖 3위는 ready 로 남는다(대조)', () => {
    const source = sourceOf(['A', 'B', 'C'], TIE_FIRST_SECOND);
    expect(resolveGroupRank(source, 1)).toEqual({ state: 'tied', tiedRegistrationIds: ['A', 'B'] });
    expect(resolveGroupRank(source, 2)).toEqual({ state: 'tied', tiedRegistrationIds: ['A', 'B'] });
    expect(resolveGroupRank(source, 3)).toEqual({ state: 'ready', registrationId: 'C' });
  });

  it('3팀 완전 동률: 세 순위 모두 tied(A,B,C)', () => {
    const source = sourceOf(['A', 'B', 'C'], TIE_THREE);
    for (const rank of [1, 2, 3]) {
      expect(resolveGroupRank(source, rank)).toEqual({ state: 'tied', tiedRegistrationIds: ['A', 'B', 'C'] });
    }
  });

  it('2·3위 동률: 1위는 ready, 2위·3위는 tied(B,C) — 진출선(2팀)에 걸친 동률도 자동 배정하지 않는다', () => {
    const source = sourceOf(['A', 'B', 'C'], TIE_SECOND_THIRD);
    expect(resolveGroupRank(source, 1)).toEqual({ state: 'ready', registrationId: 'A' });
    expect(resolveGroupRank(source, 2)).toEqual({ state: 'tied', tiedRegistrationIds: ['B', 'C'] });
    expect(resolveGroupRank(source, 3)).toEqual({ state: 'tied', tiedRegistrationIds: ['B', 'C'] });
  });

  it('저장 순위와 §5 순위가 어긋나면 임의로 믿지 않고 두 팀을 tied 로 넘긴다 — 어긋나지 않는 1·4위는 ready', () => {
    const source = sourceOf(['A', 'B', 'C', 'D'], RULES_DISAGREE);
    expect(resolveGroupRank(source, 1)).toEqual({ state: 'ready', registrationId: 'D' });
    expect(resolveGroupRank(source, 2)).toEqual({ state: 'tied', tiedRegistrationIds: ['A', 'B'] });
    expect(resolveGroupRank(source, 3)).toEqual({ state: 'tied', tiedRegistrationIds: ['A', 'B'] });
    expect(resolveGroupRank(source, 4)).toEqual({ state: 'ready', registrationId: 'C' });
  });

  it('경기가 하나라도 OFFICIAL 이 아니면 모든 순위가 group_incomplete — 전부 확정되면 ready(대조)', () => {
    const pending = sourceOf(['A', 'B', 'C'], CLEAN, { unofficialIndex: 2 });
    for (const rank of [1, 2, 3]) expect(resolveGroupRank(pending, rank)).toEqual({ state: 'group_incomplete' });
    expect(resolveGroupRank(sourceOf(['A', 'B', 'C'], CLEAN), 1)).toEqual({ state: 'ready', registrationId: 'A' });
  });

  it('경기가 하나도 없는 조는 group_incomplete', () => {
    expect(resolveGroupRank({ registrationIds: ['A', 'B'], fixtures: [], standings: [] }, 1)).toEqual({ state: 'group_incomplete' });
  });

  it('팀 미정 경기가 섞여 있으면 group_incomplete', () => {
    const source = sourceOf(['A', 'B', 'C'], CLEAN);
    const withHole: GroupRankSource = {
      ...source,
      fixtures: [...source.fixtures, { homeRegistrationId: null, awayRegistrationId: 'C', official: null }],
    };
    expect(resolveGroupRank(withHole, 1)).toEqual({ state: 'group_incomplete' });
  });

  it('저장된 순위표가 마지막 확정 결과를 아직 반영하지 못했으면(소화 경기 합이 모자람) group_incomplete', () => {
    const stale = sourceOf(['A', 'B', 'C'], CLEAN, { standingsFrom: CLEAN.slice(0, 2) });
    expect(resolveGroupRank(stale, 1)).toEqual({ state: 'group_incomplete' });
  });

  it('조 팀 중 순위 행이 없는 팀이 있으면 group_incomplete', () => {
    expect(resolveGroupRank(sourceOf(['A', 'B', 'C'], CLEAN, { dropStandingFor: 'C' }), 1)).toEqual({ state: 'group_incomplete' });
  });

  it('조 팀 수보다 큰 순위는 group_incomplete', () => {
    expect(resolveGroupRank(sourceOf(['A', 'B', 'C'], CLEAN), 4)).toEqual({ state: 'group_incomplete' });
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/group-rank-preview.spec.ts
```

Expected: FAIL — `Cannot find module './group-rank-preview'`.

- [ ] **Step 3: 구현**

```ts
// apps/v1_api/src/tournaments/slots/group-rank-preview.ts
import {
  calculateLeagueStandingsWithTieBreakInfo,
  type LeagueStandingFixture,
} from '../../league-matches/league-standings';
import { LEAGUE_TIE_BREAK_ORDER } from '../../league-matches/league-tie-break';

export type RankFixtureInput = {
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  official: { homeScore: number; awayScore: number } | null;
};
export type RankStandingInput = {
  registrationId: string;
  position: number | null;
  wins: number;
  draws: number;
  losses: number;
};
export type GroupRankSource = {
  registrationIds: readonly string[];
  fixtures: readonly RankFixtureInput[];
  standings: readonly RankStandingInput[];
};
export type GroupRankResolution =
  | { state: 'group_incomplete' }
  | { state: 'ready'; registrationId: string }
  | { state: 'tied'; tiedRegistrationIds: string[] };

const INCOMPLETE: GroupRankResolution = { state: 'group_incomplete' };

/** 확정된 결과만 모아 §5 계산 입력으로 바꾼다. 하나라도 덜 끝났거나 순위표가 낡았으면 null. */
function settledResults(source: GroupRankSource): LeagueStandingFixture[] | null {
  if (source.fixtures.length === 0) return null;
  const results: LeagueStandingFixture[] = [];
  for (const fixture of source.fixtures) {
    if (fixture.homeRegistrationId === null || fixture.awayRegistrationId === null || fixture.official === null) return null;
    results.push({
      homeTeamId: fixture.homeRegistrationId,
      awayTeamId: fixture.awayRegistrationId,
      homeScore: fixture.official.homeScore,
      awayScore: fixture.official.awayScore,
    });
  }
  const rowById = new Map(source.standings.map((row) => [row.registrationId, row]));
  let played = 0;
  for (const registrationId of source.registrationIds) {
    const row = rowById.get(registrationId);
    if (row === undefined || row.position === null) return null;
    played += row.wins + row.draws + row.losses;
  }
  // 순위 재계산은 결과 확정의 비동기 후속이다 — 확정 경기 수와 표의 소화 경기 수가 어긋나면 표가 낡은 것.
  return played === results.length * 2 ? results : null;
}

export function resolveGroupRank(source: GroupRankSource, rank: number): GroupRankResolution {
  const results = settledResults(source);
  if (results === null) return INCOMPLETE;
  const league = calculateLeagueStandingsWithTieBreakInfo({
    teamIds: source.registrationIds,
    fixtures: results,
    tieBreakOrder: LEAGUE_TIE_BREAK_ORDER,
  });
  const byRule = league.standings[rank - 1]?.teamId;
  if (byRule === undefined) return INCOMPLETE;
  const tie = league.tieGroups.find((group) => group.teamIds.includes(byRule));
  if (tie !== undefined) return { state: 'tied', tiedRegistrationIds: tie.teamIds };
  const stored = source.standings.find((row) => row.position === rank)?.registrationId;
  if (stored === undefined) return INCOMPLETE;
  // 저장 순위(대회 설정 규칙)와 §5 가 갈라지는 드문 경우 — 어느 쪽도 정답이라 못 박지 않고 운영자에게 넘긴다.
  if (stored !== byRule) return { state: 'tied', tiedRegistrationIds: [stored, byRule].sort() };
  return { state: 'ready', registrationId: stored };
}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/group-rank-preview.spec.ts
```

Expected: PASS (11 케이스).

- [ ] **Step 5: 변이 확인(자기 점검)** — 판정식이 실제로 테스트에 걸리는지 두 곳만 임시로 바꿔 red 개수를 센다. ① `tie !== undefined` 줄을 `false &&` 로 막으면 동률 3케이스(1·2위/3팀/2·3위)가 red. ② `played === results.length * 2` 를 `true` 로 바꾸면 "낡은 순위표" 케이스 1건이 red. 확인 후 **원복**하고 Step 4 를 다시 돌려 PASS 를 확인한다. 원복 안 된 변이를 커밋하지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add apps/v1_api/src/tournaments/slots/group-rank-preview.ts apps/v1_api/src/tournaments/slots/group-rank-preview.spec.ts
git commit -m "feat(v1_api): 조 순위 판정 resolveGroupRank (ready/tied/group_incomplete)" -- apps/v1_api/src/tournaments/slots/group-rank-preview.ts apps/v1_api/src/tournaments/slots/group-rank-preview.spec.ts
git show --stat HEAD
```

## Task 5: 순위 미리보기 로더 `loadGroupRankPreview`

**Files:**
- Create: `apps/v1_api/src/tournaments/slots/load-group-rank-preview.ts`
- Test: `apps/v1_api/src/tournaments/slots/load-group-rank-preview.spec.ts`

**Interfaces:**
- Consumes: `resolveGroupRank`(Task 4) · `tournamentSlotLabel`(PR-1a, `slots/tournament-slot-label.ts`) · `resolveTournamentFixtureOfficialScore`(`tournaments/tournament-fixture-official-result.ts:311`, OFFICIAL 리비전이 아니면 null)
- Produces:
  - `type GroupRankPreviewRow = { slotId: string; label: string; state: 'ready' | 'tied' | 'group_incomplete'; candidateRegistrationId: string | null; candidateTeamName: string | null; tiedRegistrationIds: string[]; currentRegistrationId: string | null }` — 계약 응답의 `slots[]` 한 행과 같다
  - `type GroupRankPreview = { rows: GroupRankPreviewRow[]; groupMembers: Map<string, ReadonlySet<string>> }` — `groupMembers` 는 slotId → 그 자리가 순위를 가져오는 조의 소속 팀(채우기의 override 검증용, 응답에는 싣지 않는다)
  - `loadGroupRankPreview(client: Prisma.TransactionClient, tournamentId: string): Promise<GroupRankPreview>` — `PrismaService` 도 받는다(읽기 전용 호출)

읽는 것: GROUP_RANK 자리 → 올라올 조(`sourceGroupId`)들의 조 팀·저장된 순위 행·**비삭제·비취소** 경기(`teamMatch.deletedAt = null AND status <> 'cancelled'`)의 현재 OFFICIAL 점수. 행 순서는 올라올 조의 `sortOrder` → 순위.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// apps/v1_api/src/tournaments/slots/load-group-rank-preview.spec.ts
import type { Prisma } from '@prisma/client';
import { FOOTBALL_V1_CONFIG } from '../competition-config/competition-config';
import { calculateCompetitionStandings } from '../competition-config/competition-standings';
import { loadGroupRankPreview } from './load-group-rank-preview';

type Result = readonly [home: string, away: string, homeScore: number, awayScore: number];

const CLEAN_A: Result[] = [['r-a', 'r-b', 2, 0], ['r-a', 'r-c', 1, 0], ['r-b', 'r-c', 1, 0]];
const TIED_A: Result[] = [['r-a', 'r-b', 0, 0], ['r-a', 'r-c', 1, 0], ['r-b', 'r-c', 1, 0]];
const GROUP_B: Result[] = [['r-d', 'r-e', 1, 0], ['r-d', 'r-f', 1, 0], ['r-e', 'r-f', 1, 0]];

function standingRows(groupId: string, ids: string[], results: Result[]) {
  return calculateCompetitionStandings({
    tournamentId: 'tournament-1',
    configVersionId: 'config-1',
    registrationIds: ids,
    fixtures: results.map(([home, away, homeScore, awayScore]) => ({ homeRegistrationId: home, awayRegistrationId: away, homeScore, awayScore })),
    config: FOOTBALL_V1_CONFIG,
  }).map((row) => ({ groupId, registrationId: row.registrationId, position: row.position, wins: row.wins, draws: row.draws, losses: row.losses }));
}

function detailRows(groupId: string, results: Result[], pendingIndex = -1) {
  return results.map(([home, away, homeScore, awayScore], index) => ({
    groupId,
    homeRegistrationId: home,
    awayRegistrationId: away,
    teamMatch: {
      game: {
        currentOfficialRevision: index === pendingIndex ? null : { state: 'OFFICIAL', score: { home: homeScore, away: awayScore } },
      },
    },
  }));
}

const slot = (id: string, position: number, sourceGroupId: string, sortOrder: number, groupName: string, registrationId: string | null = null) => ({
  id,
  position,
  registrationId,
  sourceGroupId,
  group: { name: '4강', phase: 'semi' },
  sourceGroup: { name: groupName, sortOrder },
});

function fakeClient(data: { slots: unknown[]; groupTeams: unknown[]; standings: unknown[]; details: unknown[] }) {
  const findSlots = jest.fn().mockResolvedValue(data.slots);
  const findTeams = jest.fn().mockResolvedValue(data.groupTeams);
  const findStandings = jest.fn().mockResolvedValue(data.standings);
  const findDetails = jest.fn().mockResolvedValue(data.details);
  const client = {
    v1TournamentSlot: { findMany: findSlots },
    v1TournamentGroupTeam: { findMany: findTeams },
    v1TournamentStanding: { findMany: findStandings },
    v1TournamentMatchDetails: { findMany: findDetails },
  } as unknown as Prisma.TransactionClient;
  return { client, findSlots, findTeams, findStandings, findDetails };
}

const team = (groupId: string, registrationId: string, name: string) => ({ groupId, registrationId, registration: { team: { name } } });
const TEAMS = [
  team('grp-a', 'r-a', '가FC'), team('grp-a', 'r-b', '나FC'), team('grp-a', 'r-c', '다FC'),
  team('grp-b', 'r-d', '라FC'), team('grp-b', 'r-e', '마FC'), team('grp-b', 'r-f', '바FC'),
];

describe('loadGroupRankPreview', () => {
  it('자리를 조 순서·순위 순으로 돌려주고, 끝난 조는 ready·덜 끝난 조는 group_incomplete 로 판정한다', async () => {
    const { client } = fakeClient({
      // 일부러 섞어서 준다 — 정렬은 로더 책임이다.
      slots: [slot('s-b1', 1, 'grp-b', 1, 'B조'), slot('s-a2', 2, 'grp-a', 0, 'A조', 'r-b'), slot('s-a1', 1, 'grp-a', 0, 'A조')],
      groupTeams: TEAMS,
      standings: [...standingRows('grp-a', ['r-a', 'r-b', 'r-c'], CLEAN_A), ...standingRows('grp-b', ['r-d', 'r-e', 'r-f'], GROUP_B)],
      details: [...detailRows('grp-a', CLEAN_A), ...detailRows('grp-b', GROUP_B, 2)],
    });

    const preview = await loadGroupRankPreview(client, 'tournament-1');

    expect(preview.rows).toEqual([
      { slotId: 's-a1', label: 'A조 1위', state: 'ready', candidateRegistrationId: 'r-a', candidateTeamName: '가FC', tiedRegistrationIds: [], currentRegistrationId: null },
      { slotId: 's-a2', label: 'A조 2위', state: 'ready', candidateRegistrationId: 'r-b', candidateTeamName: '나FC', tiedRegistrationIds: [], currentRegistrationId: 'r-b' },
      { slotId: 's-b1', label: 'B조 1위', state: 'group_incomplete', candidateRegistrationId: null, candidateTeamName: null, tiedRegistrationIds: [], currentRegistrationId: null },
    ]);
    expect([...(preview.groupMembers.get('s-a1') ?? [])].sort()).toEqual(['r-a', 'r-b', 'r-c']);
    expect([...(preview.groupMembers.get('s-b1') ?? [])].sort()).toEqual(['r-d', 'r-e', 'r-f']);
  });

  it('완전 동률 구간의 자리는 후보 없이 tied 로, 구간 밖 자리는 ready 로 돌려준다', async () => {
    const { client } = fakeClient({
      slots: [slot('s-a1', 1, 'grp-a', 0, 'A조'), slot('s-a2', 2, 'grp-a', 0, 'A조'), slot('s-a3', 3, 'grp-a', 0, 'A조')],
      groupTeams: TEAMS,
      standings: standingRows('grp-a', ['r-a', 'r-b', 'r-c'], TIED_A),
      details: detailRows('grp-a', TIED_A),
    });

    const { rows } = await loadGroupRankPreview(client, 'tournament-1');

    expect(rows.map((row) => [row.slotId, row.state, row.candidateRegistrationId, row.tiedRegistrationIds])).toEqual([
      ['s-a1', 'tied', null, ['r-a', 'r-b']],
      ['s-a2', 'tied', null, ['r-a', 'r-b']],
      ['s-a3', 'ready', 'r-c', []],
    ]);
  });

  it('취소·삭제된 경기를 읽지 않도록 조건을 건다 — 취소 경기가 남아 있어도 조가 영원히 미완료가 되지 않게', async () => {
    const { client, findDetails, findSlots } = fakeClient({
      slots: [slot('s-a1', 1, 'grp-a', 0, 'A조')],
      groupTeams: TEAMS,
      standings: standingRows('grp-a', ['r-a', 'r-b', 'r-c'], CLEAN_A),
      details: detailRows('grp-a', CLEAN_A),
    });

    await loadGroupRankPreview(client, 'tournament-1');

    expect(findSlots).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tournamentId: 'tournament-1', kind: 'GROUP_RANK' }) }));
    expect(findDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tournamentId: 'tournament-1',
          groupId: { in: ['grp-a'] },
          teamMatch: { is: { deletedAt: null, status: { not: 'cancelled' } } },
        }),
      }),
    );
  });

  it('GROUP_RANK 자리가 없는 대회(토너먼트 등)는 빈 결과를 돌려주고 다른 표를 읽지 않는다', async () => {
    const { client, findTeams, findStandings, findDetails } = fakeClient({ slots: [], groupTeams: [], standings: [], details: [] });

    const preview = await loadGroupRankPreview(client, 'tournament-1');

    expect(preview.rows).toEqual([]);
    expect(preview.groupMembers.size).toBe(0);
    expect(findTeams).not.toHaveBeenCalled();
    expect(findStandings).not.toHaveBeenCalled();
    expect(findDetails).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/load-group-rank-preview.spec.ts
```

Expected: FAIL — `Cannot find module './load-group-rank-preview'`.

- [ ] **Step 3: 구현**

```ts
// apps/v1_api/src/tournaments/slots/load-group-rank-preview.ts
import type { Prisma } from '@prisma/client';
import { resolveTournamentFixtureOfficialScore } from '../tournament-fixture-official-result';
import { resolveGroupRank, type GroupRankSource } from './group-rank-preview';
import { tournamentSlotLabel } from './tournament-slot-label';

export type GroupRankPreviewRow = {
  slotId: string;
  label: string;
  state: 'ready' | 'tied' | 'group_incomplete';
  candidateRegistrationId: string | null;
  candidateTeamName: string | null;
  tiedRegistrationIds: string[];
  currentRegistrationId: string | null;
};

export type GroupRankPreview = {
  rows: GroupRankPreviewRow[];
  /** slotId → 그 자리가 순위를 가져오는 조의 소속 팀. 채우기의 override 검증에만 쓴다. */
  groupMembers: Map<string, ReadonlySet<string>>;
};

export async function loadGroupRankPreview(
  client: Prisma.TransactionClient,
  tournamentId: string,
): Promise<GroupRankPreview> {
  const slots = await client.v1TournamentSlot.findMany({
    where: { tournamentId, kind: 'GROUP_RANK', sourceGroupId: { not: null } },
    select: {
      id: true,
      position: true,
      registrationId: true,
      sourceGroupId: true,
      group: { select: { name: true, phase: true } },
      sourceGroup: { select: { name: true, sortOrder: true } },
    },
  });
  // where 가 sourceGroupId 를 보장하지만 타입은 nullable 이라 좁혀 둔다.
  const rankSlots = slots.flatMap((slot) =>
    slot.sourceGroupId !== null && slot.sourceGroup !== null
      ? [{ ...slot, sourceGroupId: slot.sourceGroupId, sourceGroup: slot.sourceGroup }]
      : [],
  );
  if (rankSlots.length === 0) return { rows: [], groupMembers: new Map() };

  const sourceGroupIds = [...new Set(rankSlots.map((slot) => slot.sourceGroupId))];
  const groupTeams = await client.v1TournamentGroupTeam.findMany({
    where: { groupId: { in: sourceGroupIds }, isBye: false },
    select: { groupId: true, registrationId: true, registration: { select: { team: { select: { name: true } } } } },
  });
  const standings = await client.v1TournamentStanding.findMany({
    where: { groupId: { in: sourceGroupIds } },
    select: { groupId: true, registrationId: true, position: true, wins: true, draws: true, losses: true },
  });
  const details = await client.v1TournamentMatchDetails.findMany({
    where: {
      tournamentId,
      groupId: { in: sourceGroupIds },
      teamMatch: { is: { deletedAt: null, status: { not: 'cancelled' } } },
    },
    select: {
      groupId: true,
      homeRegistrationId: true,
      awayRegistrationId: true,
      teamMatch: { select: { game: { select: { currentOfficialRevision: { select: { state: true, score: true } } } } } },
    },
  });

  const teamNames = new Map(groupTeams.map((row) => [row.registrationId, row.registration.team.name]));
  const sourceByGroup = new Map<string, GroupRankSource>();
  for (const groupId of sourceGroupIds) {
    sourceByGroup.set(groupId, {
      registrationIds: groupTeams.filter((row) => row.groupId === groupId).map((row) => row.registrationId),
      standings: standings.filter((row) => row.groupId === groupId),
      fixtures: details
        .filter((row) => row.groupId === groupId)
        .map((row) => {
          const score = resolveTournamentFixtureOfficialScore(row.teamMatch.game);
          return {
            homeRegistrationId: row.homeRegistrationId,
            awayRegistrationId: row.awayRegistrationId,
            official: score === null ? null : { homeScore: score.homeScore, awayScore: score.awayScore },
          };
        }),
    });
  }

  const ordered = [...rankSlots].sort(
    (left, right) => left.sourceGroup.sortOrder - right.sourceGroup.sortOrder || left.position - right.position,
  );
  const groupMembers = new Map<string, ReadonlySet<string>>();
  const rows = ordered.map((slot): GroupRankPreviewRow => {
    const source = sourceByGroup.get(slot.sourceGroupId)!;
    groupMembers.set(slot.id, new Set(source.registrationIds));
    const resolution = resolveGroupRank(source, slot.position);
    const candidate = resolution.state === 'ready' ? resolution.registrationId : null;
    return {
      slotId: slot.id,
      label: tournamentSlotLabel({
        kind: 'GROUP_RANK',
        position: slot.position,
        groupName: slot.group?.name ?? null,
        groupPhase: slot.group?.phase ?? null,
        sourceGroupName: slot.sourceGroup.name,
      }),
      state: resolution.state,
      candidateRegistrationId: candidate,
      candidateTeamName: candidate === null ? null : (teamNames.get(candidate) ?? null),
      tiedRegistrationIds: resolution.state === 'tied' ? resolution.tiedRegistrationIds : [],
      currentRegistrationId: slot.registrationId,
    };
  });
  return { rows, groupMembers };
}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/load-group-rank-preview.spec.ts src/tournaments/slots/group-rank-preview.spec.ts
```

Expected: PASS. (`tournamentSlotLabel` 이 `GROUP_RANK` 를 "A조 1위" 로 만드는 것은 PR-1a 계약이다 — 라벨 테스트가 red 면 PR-1a 의 함수와 계약을 먼저 대조한다.)

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/tournaments/slots/load-group-rank-preview.ts apps/v1_api/src/tournaments/slots/load-group-rank-preview.spec.ts
git commit -m "feat(v1_api): GROUP_RANK 자리별 순위 미리보기 로더" -- apps/v1_api/src/tournaments/slots/load-group-rank-preview.ts apps/v1_api/src/tournaments/slots/load-group-rank-preview.spec.ts
git show --stat HEAD
```

## Task 6: 채우기 계획 `planFillFromStandings` (순수)

**Files:**
- Create: `apps/v1_api/src/tournaments/slots/group-rank-fill.ts`
- Test: `apps/v1_api/src/tournaments/slots/group-rank-fill.spec.ts`

**Interfaces:**
- Consumes: `GroupRankPreview`(Task 5)
- Produces:
  - `type FillOverride = { slotId: string; registrationId: string }`
  - `type FillPlan = { assignments: Array<{ slotId: string; registrationId: string }>; writes: Array<{ slotId: string; from: string | null; to: string }>; skipped: Array<{ slotId: string; reason: 'tied' | 'group_incomplete' }> }` — `assignments` = 이번 채우기가 만드는 최종 배정 전부(이미 맞게 들어 있는 자리 포함), `writes` = 그중 현재 값과 다른 것만, `skipped` = 건드리지 않는 자리
  - `planFillFromStandings(preview: GroupRankPreview, overrides: readonly FillOverride[]): FillPlan`

규칙: `ready` 자리는 후보로 자동 배정 · `tied` 자리는 override 가 있을 때만(없으면 skipped `tied`) · `group_incomplete` 는 skipped. override 허용 범위는 `tied` = `tiedRegistrationIds` 안의 팀, `ready` = 그 조 소속 팀, `group_incomplete` = 불가(422 `SLOT_REGISTRATION_INVALID`). 모르는 slotId = 404 `SLOT_NOT_FOUND`. 같은 팀이 두 자리에 배정되면 409 `SLOT_TEAM_ALREADY_PLACED`.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// apps/v1_api/src/tournaments/slots/group-rank-fill.spec.ts
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { GroupRankPreview, GroupRankPreviewRow } from './load-group-rank-preview';
import { planFillFromStandings } from './group-rank-fill';

const row = (slotId: string, state: GroupRankPreviewRow['state'], extra: Partial<GroupRankPreviewRow> = {}): GroupRankPreviewRow => ({
  slotId,
  label: `라벨-${slotId}`,
  state,
  candidateRegistrationId: null,
  candidateTeamName: null,
  tiedRegistrationIds: [],
  currentRegistrationId: null,
  ...extra,
});
const previewOf = (rows: GroupRankPreviewRow[], members: Record<string, string[]> = {}): GroupRankPreview => ({
  rows,
  groupMembers: new Map(rows.map((r) => [r.slotId, new Set(members[r.slotId] ?? ['X', 'Y', 'Z'])])),
});

function failure(operation: () => unknown): { type: string; code: string | undefined } {
  try {
    operation();
  } catch (error) {
    const type = (error as Error).constructor.name;
    const code = (error as { getResponse?: () => { code?: string } }).getResponse?.().code;
    return { type, code };
  }
  throw new Error('예외가 나지 않았다');
}

describe('planFillFromStandings', () => {
  it('ready 자리는 후보로 자동 배정하고 현재 값과 다른 것만 writes 에 담는다', () => {
    const plan = planFillFromStandings(
      previewOf([
        row('s1', 'ready', { candidateRegistrationId: 'X' }),
        row('s2', 'ready', { candidateRegistrationId: 'Y', currentRegistrationId: 'Z' }),
        row('s3', 'ready', { candidateRegistrationId: 'Z', currentRegistrationId: 'Z' }),
      ]),
      [],
    );
    expect(plan.assignments).toEqual([
      { slotId: 's1', registrationId: 'X' },
      { slotId: 's2', registrationId: 'Y' },
      { slotId: 's3', registrationId: 'Z' },
    ]);
    // s3 은 이미 맞게 들어 있다 — 쓰지 않는다(시작된 결선 경기에 걸린 자리를 괜히 건드리면 SLOT_LOCKED).
    expect(plan.writes).toEqual([
      { slotId: 's1', from: null, to: 'X' },
      { slotId: 's2', from: 'Z', to: 'Y' },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('override 없는 tied 자리와 group_incomplete 자리는 건너뛰고 이유를 남긴다 — ready 자리는 그대로 채운다', () => {
    const plan = planFillFromStandings(
      previewOf([
        row('s1', 'ready', { candidateRegistrationId: 'X' }),
        row('s2', 'tied', { tiedRegistrationIds: ['Y', 'Z'] }),
        row('s3', 'group_incomplete'),
      ]),
      [],
    );
    expect(plan.assignments).toEqual([{ slotId: 's1', registrationId: 'X' }]);
    expect(plan.skipped).toEqual([
      { slotId: 's2', reason: 'tied' },
      { slotId: 's3', reason: 'group_incomplete' },
    ]);
  });

  it('tied 자리는 override 로 고른 팀이 들어간다', () => {
    const plan = planFillFromStandings(
      previewOf([row('s1', 'tied', { tiedRegistrationIds: ['X', 'Y'] })]),
      [{ slotId: 's1', registrationId: 'Y' }],
    );
    expect(plan.writes).toEqual([{ slotId: 's1', from: null, to: 'Y' }]);
    expect(plan.skipped).toEqual([]);
  });

  it('1·2위 동률 맞바꾸기(A1 <-> A2): 두 자리 모두 writes 에 from/to 가 교차로 담긴다', () => {
    const plan = planFillFromStandings(
      previewOf([
        row('a1', 'tied', { tiedRegistrationIds: ['X', 'Y'], currentRegistrationId: 'X' }),
        row('a2', 'tied', { tiedRegistrationIds: ['X', 'Y'], currentRegistrationId: 'Y' }),
      ]),
      [{ slotId: 'a1', registrationId: 'Y' }, { slotId: 'a2', registrationId: 'X' }],
    );
    expect(plan.writes).toEqual([
      { slotId: 'a1', from: 'X', to: 'Y' },
      { slotId: 'a2', from: 'Y', to: 'X' },
    ]);
  });

  it('3팀 동률에서 1·2위 자리에 서로 다른 두 팀을 골라 넣을 수 있다 (세 번째 팀은 탈락)', () => {
    const tied = { tiedRegistrationIds: ['X', 'Y', 'Z'] };
    const plan = planFillFromStandings(
      previewOf([row('a1', 'tied', tied), row('a2', 'tied', tied)]),
      [{ slotId: 'a1', registrationId: 'Z' }, { slotId: 'a2', registrationId: 'X' }],
    );
    expect(plan.assignments).toEqual([
      { slotId: 'a1', registrationId: 'Z' },
      { slotId: 'a2', registrationId: 'X' },
    ]);
  });

  it('ready 자리에도 그 조 소속 팀이면 override 로 바꿀 수 있다', () => {
    const plan = planFillFromStandings(
      previewOf([row('s1', 'ready', { candidateRegistrationId: 'X' })], { s1: ['X', 'Y'] }),
      [{ slotId: 's1', registrationId: 'Y' }],
    );
    expect(plan.assignments).toEqual([{ slotId: 's1', registrationId: 'Y' }]);
  });

  // 허용 범위는 스펙 S4 그대로다 — tied 자리 = 그 동률 팀만, ready 자리 = 그 자리의 원천 조 팀만, 그 밖은 전부 422.
  // 조 소속(X·Y·Z)과 동률 팀(X·Y)을 일부러 다르게 둬서 "조 소속이면 통과" 같은 느슨한 구현이 red 가 되게 한다.
  const GROUP = ['X', 'Y', 'Z'];
  it.each([
    ['tied 자리에 같은 조지만 동률 밖인 팀', [row('s1', 'tied', { tiedRegistrationIds: ['X', 'Y'] })], 'Z'],
    ['tied 자리에 다른 조 팀', [row('s1', 'tied', { tiedRegistrationIds: ['X', 'Y'] })], 'OUTSIDER'],
    ['ready 자리에 다른 조 팀', [row('s1', 'ready', { candidateRegistrationId: 'X' })], 'OUTSIDER'],
    ['group_incomplete 자리에 그 조 팀', [row('s1', 'group_incomplete')], 'X'],
  ])('잘못된 override(%s)는 422 SLOT_REGISTRATION_INVALID', (_name, rows, registrationId) => {
    expect(failure(() => planFillFromStandings(previewOf(rows, { s1: GROUP }), [{ slotId: 's1', registrationId }]))).toEqual({
      type: UnprocessableEntityException.name,
      code: 'SLOT_REGISTRATION_INVALID',
    });
  });

  it('같은 자리를 두 번 지정하면 422, 이 대회 순위 자리가 아닌 slotId 는 404 SLOT_NOT_FOUND', () => {
    const preview = previewOf([row('s1', 'tied', { tiedRegistrationIds: ['X', 'Y'] })]);
    expect(
      failure(() => planFillFromStandings(preview, [{ slotId: 's1', registrationId: 'X' }, { slotId: 's1', registrationId: 'Y' }])),
    ).toEqual({ type: UnprocessableEntityException.name, code: 'SLOT_REGISTRATION_INVALID' });
    expect(failure(() => planFillFromStandings(preview, [{ slotId: 'ghost', registrationId: 'X' }]))).toEqual({
      type: NotFoundException.name,
      code: 'SLOT_NOT_FOUND',
    });
  });

  it('같은 팀이 두 자리에 배정되면 409 SLOT_TEAM_ALREADY_PLACED (ready 후보 X 와 override X)', () => {
    const preview = previewOf([
      row('s1', 'ready', { candidateRegistrationId: 'X' }),
      row('s2', 'tied', { tiedRegistrationIds: ['X', 'Y'] }),
    ]);
    expect(failure(() => planFillFromStandings(preview, [{ slotId: 's2', registrationId: 'X' }]))).toEqual({
      type: ConflictException.name,
      code: 'SLOT_TEAM_ALREADY_PLACED',
    });
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/group-rank-fill.spec.ts
```

Expected: FAIL — `Cannot find module './group-rank-fill'`.

- [ ] **Step 3: 구현**

```ts
// apps/v1_api/src/tournaments/slots/group-rank-fill.ts
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { GroupRankPreview } from './load-group-rank-preview';

export type FillOverride = { slotId: string; registrationId: string };
export type FillPlan = {
  assignments: Array<{ slotId: string; registrationId: string }>;
  writes: Array<{ slotId: string; from: string | null; to: string }>;
  skipped: Array<{ slotId: string; reason: 'tied' | 'group_incomplete' }>;
};

const invalidOverride = (message: string) =>
  new UnprocessableEntityException({ code: 'SLOT_REGISTRATION_INVALID', message });

export function planFillFromStandings(preview: GroupRankPreview, overrides: readonly FillOverride[]): FillPlan {
  const rowBySlot = new Map(preview.rows.map((row) => [row.slotId, row]));
  const overrideBySlot = new Map<string, string>();
  for (const override of overrides) {
    const row = rowBySlot.get(override.slotId);
    if (row === undefined) {
      throw new NotFoundException({ code: 'SLOT_NOT_FOUND', message: '순위로 채우는 자리를 찾을 수 없어요.' });
    }
    if (overrideBySlot.has(override.slotId)) throw invalidOverride('같은 자리를 두 번 고를 수 없어요.');
    if (row.state === 'group_incomplete') {
      throw invalidOverride(`${row.label}은 조별 경기가 아직 끝나지 않아 팀을 고를 수 없어요.`);
    }
    const allowed =
      row.state === 'tied' ? new Set(row.tiedRegistrationIds) : preview.groupMembers.get(override.slotId);
    if (allowed === undefined || !allowed.has(override.registrationId)) {
      throw invalidOverride(`${row.label}에 넣을 수 없는 팀이에요.`);
    }
    overrideBySlot.set(override.slotId, override.registrationId);
  }

  const assignments: FillPlan['assignments'] = [];
  const skipped: FillPlan['skipped'] = [];
  for (const row of preview.rows) {
    const picked = overrideBySlot.get(row.slotId) ?? (row.state === 'ready' ? row.candidateRegistrationId : null);
    if (picked !== null) {
      assignments.push({ slotId: row.slotId, registrationId: picked });
    } else {
      skipped.push({ slotId: row.slotId, reason: row.state === 'tied' ? 'tied' : 'group_incomplete' });
    }
  }

  const placed = new Set<string>();
  for (const assignment of assignments) {
    if (placed.has(assignment.registrationId)) {
      throw new ConflictException({ code: 'SLOT_TEAM_ALREADY_PLACED', message: '같은 팀을 두 자리에 넣을 수 없어요.' });
    }
    placed.add(assignment.registrationId);
  }

  const writes = assignments.flatMap((assignment) => {
    const from = rowBySlot.get(assignment.slotId)!.currentRegistrationId;
    return from === assignment.registrationId ? [] : [{ slotId: assignment.slotId, from, to: assignment.registrationId }];
  });
  return { assignments, writes, skipped };
}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/group-rank-fill.spec.ts
```

Expected: PASS (12 케이스: 일반 8 + 잘못된 override 4).

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_api/src/tournaments/slots/group-rank-fill.ts apps/v1_api/src/tournaments/slots/group-rank-fill.spec.ts
git commit -m "feat(v1_api): 순위대로 채우기 계획 planFillFromStandings" -- apps/v1_api/src/tournaments/slots/group-rank-fill.ts apps/v1_api/src/tournaments/slots/group-rank-fill.spec.ts
git show --stat HEAD
```

## Task 7: 서비스 본문 `previewGroupRankStandings`·`fillSlotsFromStandings` + `TournamentSlotService` 메서드

배치 자체("바뀔 자리 먼저 비우기")는 PR-1b 의 `assignSlotsBatchInTx` 가 한다 — 이 태스크는 그것을 **재사용**하고(재구현 금지) 권한·대상·잠금·읽기·감사 로그의 순서를 고정한다.

**Files:**
- Modify: `apps/v1_api/src/tournaments/slots/group-rank-fill.ts` (import 확장 + 함수 3개 추가)
- Modify: `apps/v1_api/src/tournaments/slots/group-rank-fill.spec.ts` (상단 import·mock + describe 추가)
- Modify: `apps/v1_api/src/tournaments/slots/tournament-slot.service.ts` (메서드 2개 + import)

**Interfaces:**
- Consumes: `loadGroupRankPreview`(Task 5) · `planFillFromStandings`(Task 6) · PR-1b `lockCompetitionForBracketMutationInTx(tx, competition: { id: string; kind: V1CompetitionKind }): Promise<void>` · `assignSlotsBatchInTx(tx, ctx, changes: readonly { slotId: string; registrationId: string | null }[]): Promise<string[]>` · 서비스의 `private context(admin): SlotMutationContext` 와 `SLOT_TRANSACTION_OPTIONS`(`{ timeout: 45_000, maxWait: 5_000 }`) · `AdminContextService.getActiveAdmin/getMutationAdmin/logAdminAction`(`common/admin-context.service.ts:24,47,59`)
- Produces:
  - `previewGroupRankStandings(deps: { prisma: PrismaService; adminContext: Pick<AdminContextService, 'getActiveAdmin'> }, user: V1AuthUser, tournamentId: string): Promise<{ slots: GroupRankPreviewRow[] }>`
  - `type FillDeps = { prisma: PrismaService; adminContext: Pick<AdminContextService, 'getMutationAdmin' | 'logAdminAction'>; lock: (tx: Prisma.TransactionClient, competition: { id: string; kind: V1CompetitionKind }) => Promise<void>; assignBatch: (tx: Prisma.TransactionClient, admin: V1ActiveAdmin, changes: readonly { slotId: string; registrationId: string | null }[]) => Promise<unknown>; transactionOptions: { timeout: number; maxWait: number } }`
  - `fillSlotsFromStandings(deps: FillDeps, user: V1AuthUser, tournamentId: string, overrides: readonly FillOverride[]): Promise<{ assignments: FillPlan['assignments']; skipped: FillPlan['skipped'] }>`
  - `TournamentSlotService.standingsPreview(user, tournamentId)` · `fillFromStandings(user, tournamentId, overrides?)` (계약 시그니처)

- [ ] **Step 1: 실패하는 테스트 작성** — 스펙 파일 맨 위 import 블록 바로 아래에 추가한다(기존 `import { planFillFromStandings } from './group-rank-fill';` 줄은 아래 import 로 흡수해 지운다).

```ts
import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AdminContextService } from '../../common/admin-context.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { kindAwareFindFirst } from '../../../test/helpers/kind-aware-find-first';
import { loadGroupRankPreview } from './load-group-rank-preview';
import { fillSlotsFromStandings, planFillFromStandings, previewGroupRankStandings } from './group-rank-fill';

jest.mock('./load-group-rank-preview', () => ({ loadGroupRankPreview: jest.fn() }));
const loadMock = loadGroupRankPreview as jest.MockedFunction<typeof loadGroupRankPreview>;
```

파일 맨 끝에 추가한다.

```ts
describe('서비스 본문 — 권한·대상·잠금 순서', () => {
  const user = { id: 'user-1', email: 'a@test.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
  const adminRow = (adminRole: 'owner' | 'ops' | 'support') => ({
    id: 'admin-1', userId: 'user-1', adminRole, status: 'active', user: { accountStatus: 'active' },
  });
  const swapPreview: GroupRankPreview = {
    rows: [
      row('a1', 'tied', { label: 'A조 1위', tiedRegistrationIds: ['X', 'Y'], currentRegistrationId: 'X' }),
      row('a2', 'tied', { label: 'A조 2위', tiedRegistrationIds: ['X', 'Y'], currentRegistrationId: 'Y' }),
    ],
    groupMembers: new Map([['a1', new Set(['X', 'Y', 'Z'])], ['a2', new Set(['X', 'Y', 'Z'])]]),
  };

  function setup(options: { role?: 'owner' | 'ops' | 'support' | null; kind?: string; preview?: GroupRankPreview } = {}) {
    const events: string[] = [];
    const prisma = {
      v1AdminUser: { findUnique: jest.fn().mockResolvedValue(options.role === null ? null : adminRow(options.role ?? 'ops')) },
      v1Tournament: { findFirst: kindAwareFindFirst({ id: 'tournament-1', kind: options.kind ?? 'regular_tournament' }) },
      v1AdminActionLog: { create: jest.fn(async () => { events.push('audit'); return { id: 'log-1' }; }) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => { events.push('tx'); return fn(prisma); }),
    };
    loadMock.mockReset();
    loadMock.mockImplementation(async () => { events.push('load'); return options.preview ?? swapPreview; });
    const deps = {
      prisma: prisma as unknown as PrismaService,
      adminContext: new AdminContextService(prisma as unknown as PrismaService),
      lock: jest.fn(async () => { events.push('lock'); }),
      assignBatch: jest.fn(async (_tx: Prisma.TransactionClient, _admin: unknown, changes: readonly { slotId: string; registrationId: string | null }[]) => {
        events.push(`batch:${changes.map((change) => `${change.slotId}=${change.registrationId}`).join(',')}`);
      }),
      transactionOptions: { timeout: 45_000, maxWait: 5_000 },
    };
    return { prisma, deps, events };
  }

  it('맞바꾸기: 트랜잭션 → 잠금 → 읽기 → 배치(바뀔 자리 전부 한 번에) → 감사 로그 순이고 트랜잭션 옵션을 그대로 쓴다', async () => {
    const { prisma, deps, events } = setup();
    const result = await fillSlotsFromStandings(deps, user, 'tournament-1', [
      { slotId: 'a1', registrationId: 'Y' },
      { slotId: 'a2', registrationId: 'X' },
    ]);
    expect(events).toEqual(['tx', 'lock', 'load', 'batch:a1=Y,a2=X', 'audit']);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), deps.transactionOptions);
    expect(deps.lock).toHaveBeenCalledWith(prisma, { id: 'tournament-1', kind: 'regular_tournament' });
    expect(result).toEqual({
      assignments: [{ slotId: 'a1', registrationId: 'Y' }, { slotId: 'a2', registrationId: 'X' }],
      skipped: [],
    });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: 'admin-1',
        action: 'tournament.slots.fill_from_standings',
        targetType: 'tournament',
        targetId: 'tournament-1',
        afterJson: expect.objectContaining({ assignments: result.assignments, overridden: ['a1', 'a2'] }),
      }),
    });
  });

  it('바꿀 자리가 없으면(이미 맞게 들어 있거나 전부 건너뜀) 배치를 부르지 않는다 — 시작된 결선 경기 자리를 건드리지 않게', async () => {
    const preview: GroupRankPreview = {
      rows: [row('a1', 'ready', { candidateRegistrationId: 'X', currentRegistrationId: 'X' }), row('b1', 'group_incomplete')],
      groupMembers: new Map([['a1', new Set(['X'])], ['b1', new Set(['Z'])]]),
    };
    const { deps, events } = setup({ preview });
    await expect(fillSlotsFromStandings(deps, user, 'tournament-1', [])).resolves.toEqual({
      assignments: [{ slotId: 'a1', registrationId: 'X' }],
      skipped: [{ slotId: 'b1', reason: 'group_incomplete' }],
    });
    expect(deps.assignBatch).not.toHaveBeenCalled();
    expect(events).toEqual(['tx', 'lock', 'load', 'audit']);
  });

  it('support 어드민은 403 — 트랜잭션도 읽기도 시작하지 않는다 (대조: ops 는 통과)', async () => {
    const denied = setup({ role: 'support' });
    await expect(fillSlotsFromStandings(denied.deps, user, 'tournament-1', [])).rejects.toBeInstanceOf(ForbiddenException);
    expect(denied.prisma.$transaction).not.toHaveBeenCalled();
    expect(loadMock).not.toHaveBeenCalled();
    const allowed = setup({ role: 'ops', preview: { rows: [], groupMembers: new Map() } });
    await expect(fillSlotsFromStandings(allowed.deps, user, 'tournament-1', [])).resolves.toEqual({ assignments: [], skipped: [] });
  });

  it('어드민이 아니면 403, 정규 리그 id 는 404 TOURNAMENT_NOT_FOUND (종류 조건이 실제로 걸린다)', async () => {
    const stranger = setup({ role: null });
    await expect(fillSlotsFromStandings(stranger.deps, user, 'tournament-1', [])).rejects.toBeInstanceOf(ForbiddenException);
    const league = setup({ kind: 'regular_league' });
    await expect(fillSlotsFromStandings(league.deps, user, 'tournament-1', [])).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_NOT_FOUND' },
    });
    expect(league.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('잘못된 override 는 잠금·읽기 뒤 배치·감사 로그 전에 거절한다 — 부분 적용 없음', async () => {
    const { deps, events } = setup();
    await expect(
      fillSlotsFromStandings(deps, user, 'tournament-1', [{ slotId: 'a1', registrationId: 'OUTSIDER' }]),
    ).rejects.toMatchObject({ response: { code: 'SLOT_REGISTRATION_INVALID' } });
    expect(events).toEqual(['tx', 'lock', 'load']);
  });

  it('미리보기는 support 도 볼 수 있고(getActiveAdmin) 행을 slots 로 감싸 돌려준다, 정규 리그 id 는 404', async () => {
    const support = setup({ role: 'support' });
    await expect(previewGroupRankStandings(support.deps, user, 'tournament-1')).resolves.toEqual({ slots: swapPreview.rows });
    const stranger = setup({ role: null });
    await expect(previewGroupRankStandings(stranger.deps, user, 'tournament-1')).rejects.toBeInstanceOf(ForbiddenException);
    const league = setup({ kind: 'regular_league' });
    await expect(previewGroupRankStandings(league.deps, user, 'tournament-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_NOT_FOUND' },
    });
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/group-rank-fill.spec.ts
```

Expected: FAIL — `fillSlotsFromStandings is not a function`(또는 import 에러).

- [ ] **Step 3: 구현** — `group-rank-fill.ts` 의 import 블록을 아래로 바꾸고(기존 두 줄을 포함한다), 파일 끝에 함수들을 추가한다.

```ts
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { V1CompetitionKind, type Prisma } from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import type { AdminContextService, V1ActiveAdmin } from '../../common/admin-context.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { loadGroupRankPreview, type GroupRankPreview } from './load-group-rank-preview';
```

```ts
async function requireTournament(prisma: PrismaService, tournamentId: string) {
  const tournament = await findTournamentOnSurface(prisma, TOURNAMENT_KINDS, {
    where: { id: tournamentId, deletedAt: null },
    select: { id: true, kind: true },
  });
  if (tournament === null) {
    throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
  }
  return tournament;
}

export async function previewGroupRankStandings(
  deps: { prisma: PrismaService; adminContext: Pick<AdminContextService, 'getActiveAdmin'> },
  user: V1AuthUser,
  tournamentId: string,
) {
  await deps.adminContext.getActiveAdmin(user.id);
  await requireTournament(deps.prisma, tournamentId);
  const { rows } = await loadGroupRankPreview(deps.prisma, tournamentId);
  return { slots: rows };
}

export type FillDeps = {
  prisma: PrismaService;
  adminContext: Pick<AdminContextService, 'getMutationAdmin' | 'logAdminAction'>;
  lock: (tx: Prisma.TransactionClient, competition: { id: string; kind: V1CompetitionKind }) => Promise<void>;
  /** 바뀔 자리를 먼저 모두 비운 뒤 넣는 배치 — PR-1b `assignSlotsBatchInTx`. */
  assignBatch: (
    tx: Prisma.TransactionClient,
    admin: V1ActiveAdmin,
    changes: readonly { slotId: string; registrationId: string | null }[],
  ) => Promise<unknown>;
  transactionOptions: { timeout: number; maxWait: number };
};

export async function fillSlotsFromStandings(
  deps: FillDeps,
  user: V1AuthUser,
  tournamentId: string,
  overrides: readonly FillOverride[],
) {
  const admin = await deps.adminContext.getMutationAdmin(user.id);
  const tournament = await requireTournament(deps.prisma, tournamentId);
  return deps.prisma.$transaction(async (tx) => {
    await deps.lock(tx, { id: tournament.id, kind: tournament.kind ?? V1CompetitionKind.regular_tournament });
    // 잠금 안에서 다시 읽는다 — 미리보기를 본 뒤 결과가 바뀌었을 수 있다.
    const preview = await loadGroupRankPreview(tx, tournamentId);
    const plan = planFillFromStandings(preview, overrides);
    if (plan.writes.length > 0) {
      await deps.assignBatch(tx, admin, plan.writes.map((write) => ({ slotId: write.slotId, registrationId: write.to })));
    }
    await deps.adminContext.logAdminAction(
      admin,
      {
        action: 'tournament.slots.fill_from_standings',
        targetType: 'tournament',
        targetId: tournamentId,
        afterJson: {
          assignments: plan.assignments,
          skipped: plan.skipped,
          overridden: overrides.map((override) => override.slotId),
        },
      },
      tx,
    );
    return { assignments: plan.assignments, skipped: plan.skipped };
  }, deps.transactionOptions);
}
```

`GroupRankPreview` import 는 `planFillFromStandings` 시그니처가 이미 쓰고 있다(중복 import 만 정리).

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/group-rank-fill.spec.ts
```

Expected: PASS (Task 6 의 11건 + 새 6건). 변이 점검: `if (plan.writes.length > 0)` 를 지우면 "바꿀 자리가 없으면 배치를 부르지 않는다" 1건이 red 여야 한다 — 확인 후 원복. (비우기→넣기 순서와 맞바꾸기의 유일 제약 회피는 PR-1b `assignSlotsBatchInTx` 의 통합 스펙이 고정한다 — 여기서 재검증하지 않는다.)

- [ ] **Step 5: `TournamentSlotService` 에 메서드 2개 추가** — `tournament-slot.service.ts` 상단 import 에 `previewGroupRankStandings`, `fillSlotsFromStandings`, `type FillOverride` (`./group-rank-fill`)를 더하고, 클래스 끝에 아래를 추가한다(`lockCompetitionForBracketMutationInTx`·`assignSlotsBatchInTx`·`SLOT_TRANSACTION_OPTIONS`·`this.context` 는 같은 파일에 이미 있다).

```ts
  /** GET /admin/tournaments/:tournamentId/slots/standings-preview */
  standingsPreview(user: V1AuthUser, tournamentId: string) {
    return previewGroupRankStandings(
      { prisma: this.prisma, adminContext: this.adminContext },
      user,
      tournamentId,
    );
  }

  /** POST /admin/tournaments/:tournamentId/slots/fill-from-standings */
  fillFromStandings(user: V1AuthUser, tournamentId: string, overrides: readonly FillOverride[] = []) {
    return fillSlotsFromStandings(
      {
        prisma: this.prisma,
        adminContext: this.adminContext,
        lock: lockCompetitionForBracketMutationInTx,
        assignBatch: (tx, admin, changes) => assignSlotsBatchInTx(tx, this.context(admin), changes),
        transactionOptions: SLOT_TRANSACTION_OPTIONS,
      },
      user,
      tournamentId,
      overrides,
    );
  }
```

- [ ] **Step 6: 타입·회귀 확인**

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p tsconfig.json   # 격리 생성 client 로 — 색인 Global Constraints
TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots
```

Expected: tsc 0 에러, `slots/` 아래 PR-1b 스펙 포함 전부 PASS.

- [ ] **Step 7: 커밋**

```bash
git commit -m "feat(v1_api): 순위대로 채우기 서비스(잠금·배치·감사 로그)와 슬롯 서비스 메서드" -- apps/v1_api/src/tournaments/slots/group-rank-fill.ts apps/v1_api/src/tournaments/slots/group-rank-fill.spec.ts apps/v1_api/src/tournaments/slots/tournament-slot.service.ts
git show --stat HEAD
```

## Task 8: DTO · 컨트롤러 · 모듈 등록 · API 문서 · changeset

**Files:**
- Create: `apps/v1_api/src/tournaments/slots/dto/fill-from-standings.dto.ts` · `fill-from-standings.dto.spec.ts`
- Create: `apps/v1_api/src/tournaments/slots/tournament-slot-standings.controller.ts` · `tournament-slot-standings.controller.spec.ts`
- Modify: `apps/v1_api/src/tournaments/tournaments.module.ts` (`controllers` 배열 + import 1줄)
- Modify: `docs/api/domains/tournaments.md` (끝에 절 추가)
- Create: `.changeset/admin-bracket-group-knockout.md`

**Interfaces:**
- Consumes: `TournamentSlotService.standingsPreview/fillFromStandings`(Task 7) · `MAX_GROUP_RANK_SLOTS`(Task 1) · `CurrentUser`·`V1AuthGuard`
- Produces: `GET /admin/tournaments/:tournamentId/slots/standings-preview`, `POST /admin/tournaments/:tournamentId/slots/fill-from-standings` (계약 표 그대로)

DTO 의 `@ArrayMaxSize` 는 정적 값이라 "그 대회 자리 수" 대신 가능한 최대치(결선 크기 상한 16)을 쓰고, 실제 자리 수 검증은 서비스가 한다(`planFillFromStandings` 가 자리가 아닌 slotId 를 404 로 거절).

- [ ] **Step 1: DTO 테스트 작성**

```ts
// apps/v1_api/src/tournaments/slots/dto/fill-from-standings.dto.spec.ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { FillFromStandingsDto } from './fill-from-standings.dto';

const UUID_A = '8b000000-0000-4000-8000-000000000001';
const UUID_B = '8b000000-0000-4000-8000-000000000002';
const OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

const paths = (errors: ValidationError[], prefix = ''): string[] =>
  errors.flatMap((error) => {
    const here = prefix === '' ? error.property : `${prefix}.${error.property}`;
    return [here, ...paths(error.children ?? [], here)];
  });
const check = (plain: unknown) => validate(plainToInstance(FillFromStandingsDto, plain), OPTIONS);

describe('FillFromStandingsDto', () => {
  it('overrides 는 생략·빈 배열·유효한 항목을 받는다', async () => {
    expect(await check({})).toHaveLength(0);
    expect(await check({ overrides: [] })).toHaveLength(0);
    expect(await check({ overrides: [{ slotId: UUID_A, registrationId: UUID_B }] })).toHaveLength(0);
  });

  it('16개까지 받고 17개부터 거절한다 (결선 크기 상한, 16강 포함)', async () => {
    const item = { slotId: UUID_A, registrationId: UUID_B };
    expect(await check({ overrides: Array.from({ length: 16 }, () => item) })).toHaveLength(0);
    expect(paths(await check({ overrides: Array.from({ length: 17 }, () => item) }))).toContain('overrides');
  });

  it.each([
    ['uuid 가 아닌 slotId', { overrides: [{ slotId: 'not-a-uuid', registrationId: UUID_B }] }, 'overrides.0.slotId'],
    ['uuid 가 아닌 registrationId', { overrides: [{ slotId: UUID_A, registrationId: 'x' }] }, 'overrides.0.registrationId'],
    ['registrationId 누락', { overrides: [{ slotId: UUID_A }] }, 'overrides.0.registrationId'],
    ['항목 안의 모르는 필드', { overrides: [{ slotId: UUID_A, registrationId: UUID_B, force: true }] }, 'overrides.0.force'],
    ['배열이 아닌 overrides', { overrides: 'x' }, 'overrides'],
    ['본문의 모르는 필드', { overrides: [], dryRun: true }, 'dryRun'],
  ])('%s 는 거절한다', async (_name, plain, expectedPath) => {
    expect(paths(await check(plain))).toContain(expectedPath);
  });
});
```

- [ ] **Step 2: 컨트롤러 테스트 작성**

```ts
// apps/v1_api/src/tournaments/slots/tournament-slot-standings.controller.spec.ts
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { TournamentsModule } from '../tournaments.module';
import { TournamentSlotStandingsController } from './tournament-slot-standings.controller';

const names = (key: string) => {
  const list: unknown = Reflect.getMetadata(key, TournamentsModule);
  return Array.isArray(list) ? list.flatMap((entry) => (typeof entry === 'function' ? [entry.name] : [])) : [];
};

describe('TournamentSlotStandingsController', () => {
  it('모듈에 등록돼 있고 슬롯 서비스가 provider 에 있다', () => {
    expect(names(MODULE_METADATA.CONTROLLERS)).toContain('TournamentSlotStandingsController');
    expect(names(MODULE_METADATA.PROVIDERS)).toContain('TournamentSlotService');
  });

  it('V1AuthGuard 로 보호된다', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TournamentSlotStandingsController)).toContain(V1AuthGuard);
  });

  it.each([
    ['standingsPreview', 'admin/tournaments/:tournamentId/slots/standings-preview', RequestMethod.GET],
    ['fillFromStandings', 'admin/tournaments/:tournamentId/slots/fill-from-standings', RequestMethod.POST],
  ] as const)('%s 는 계약 경로·메서드로 노출된다', (methodName, path, method) => {
    const handler = TournamentSlotStandingsController.prototype[methodName];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
  });

  it('overrides 를 생략하면 빈 배열로 서비스에 넘기고, 있으면 그대로 넘긴다', () => {
    const service = { standingsPreview: jest.fn(), fillFromStandings: jest.fn().mockReturnValue('done') };
    const controller = new TournamentSlotStandingsController(service as never);
    const user = { id: 'user-1' } as never;
    const override = { slotId: 's1', registrationId: 'r1' };

    expect(controller.fillFromStandings(user, 'tournament-1', {})).toBe('done');
    expect(service.fillFromStandings).toHaveBeenLastCalledWith(user, 'tournament-1', []);
    controller.fillFromStandings(user, 'tournament-1', { overrides: [override] });
    expect(service.fillFromStandings).toHaveBeenLastCalledWith(user, 'tournament-1', [override]);
    controller.standingsPreview(user, 'tournament-1');
    expect(service.standingsPreview).toHaveBeenCalledWith(user, 'tournament-1');
  });
});
```

- [ ] **Step 3: 실행 — 실패 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/dto/fill-from-standings.dto.spec.ts src/tournaments/slots/tournament-slot-standings.controller.spec.ts
```

Expected: FAIL — 두 파일 모두 `Cannot find module`.

- [ ] **Step 4: 구현**

```ts
// apps/v1_api/src/tournaments/slots/dto/fill-from-standings.dto.ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { MAX_GROUP_RANK_SLOTS } from '../../templates/group-rank-pairings';

export class SlotStandingsOverrideDto {
  @IsUUID()
  slotId!: string;

  @IsUUID()
  registrationId!: string;
}

export class FillFromStandingsDto {
  /** 동률 자리에서 운영자가 고른 팀. 자리 수 상한은 결선 크기 상한과 같다. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GROUP_RANK_SLOTS)
  @ValidateNested({ each: true })
  @Type(() => SlotStandingsOverrideDto)
  overrides?: SlotStandingsOverrideDto[];
}
```

```ts
// apps/v1_api/src/tournaments/slots/tournament-slot-standings.controller.ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { FillFromStandingsDto } from './dto/fill-from-standings.dto';
import { TournamentSlotService } from './tournament-slot.service';

/** 조 순위로 결선 GROUP_RANK 자리 채우기 — 어드민 전용(권한은 서비스의 getActiveAdmin/getMutationAdmin). */
@Controller()
@UseGuards(V1AuthGuard)
export class TournamentSlotStandingsController {
  constructor(private readonly slots: TournamentSlotService) {}

  @Get('admin/tournaments/:tournamentId/slots/standings-preview')
  standingsPreview(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.slots.standingsPreview(user, tournamentId);
  }

  @Post('admin/tournaments/:tournamentId/slots/fill-from-standings')
  fillFromStandings(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: FillFromStandingsDto,
  ) {
    return this.slots.fillFromStandings(user, tournamentId, dto.overrides ?? []);
  }
}
```

`tournaments.module.ts` — import 1줄과 `controllers` 배열의 `TournamentBracketController,` 바로 아래 한 줄:

import 묶음 끝에 한 줄:

```ts
import { TournamentSlotStandingsController } from './slots/tournament-slot-standings.controller';
```

`grep -n "    TournamentBracketController," src/tournaments/tournaments.module.ts` 가 `controllers` 배열 안 한 줄만 나오는지 확인하고, 그 줄 바로 아래에 다음 한 줄을 넣는다(들여쓰기 4칸):

```ts
    TournamentSlotStandingsController,
```

- [ ] **Step 5: 실행 — 통과 확인**

```bash
cd apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/dto/fill-from-standings.dto.spec.ts src/tournaments/slots/tournament-slot-standings.controller.spec.ts src/tournaments/tournament-campaigns.controller.spec.ts
```

Expected: PASS (마지막은 모듈 로드가 깨지지 않았다는 회귀 대조).

- [ ] **Step 6: API 문서** — `docs/api/domains/tournaments.md` 맨 끝에 추가한다.

```markdown

### 조별+결선 템플릿과 순위대로 채우기 (2026-10)

- `POST /admin/tournaments/:tournamentId/bracket/template` 에 `kind: 'group_knockout'` 이 추가됐다: `{ kind, groupCount: 2..8, teamsPerGroup: 3..6, advancePerGroup: 1|2, legs: 1|2, thirdPlace: boolean, replaceExisting? }`. 대회 `format` 이 `group_knockout` 이어야 한다(아니면 422 `BRACKET_TEMPLATE_FORMAT_MISMATCH`). 결선 크기 `groupCount × advancePerGroup` 는 2·4·8·16 만 가능하고(그 밖은 422 `BRACKET_TEMPLATE_UNSUPPORTED`) 결승 한 경기뿐(2조×1팀)이면 `thirdPlace` 를 켤 수 없다(422 같은 코드). 계획 경기 수가 240 을 넘으면 422 `BRACKET_TEMPLATE_TOO_LARGE`.
- 만들어지는 것: 조 `A조…`(`advanceCount` = advancePerGroup) · 조마다 ENTRY 자리와 라운드로빈 빈 경기(`league_r{n}`, 회전 `legs`) · 결선 그룹(16강/8강/4강/결승/3위 결정전 — 16강은 8조×2 일 때만, 결승 다음이 3위 결정전)과 빈 경기 · 결선 첫 라운드 사이드에 GROUP_RANK 자리(교차 대진: 2조×1 A1–B1 / 2조×2 A1–B2·B1–A2 / 4조×1 A1–D1·B1–C1 / 4조×2 A1–B2·C1–D2·B1–A2·D1–C2 / 8조×1 A1–H1·D1–E1·B1–G1·C1–F1 / 8조×2 16강 A1–B2·C1–D2·E1–F2·G1–H2·B1–A2·D1–C2·F1–E2·H1–G2) · 이후 라운드 WINNER 연결(3·4위전은 4강 LOSER).
- `GET /admin/tournaments/:tournamentId/slots/standings-preview`: 어드민(support 포함). 응답 `{ slots: [{ slotId, label, state: 'ready'|'tied'|'group_incomplete', candidateRegistrationId, candidateTeamName, tiedRegistrationIds, currentRegistrationId }] }`, 올라올 조 순서 → 순위 순. 조의 비삭제·비취소 경기가 전부 OFFICIAL 이고 조 순위표가 그 결과를 반영했을 때만 `ready`/`tied`. 정본 §5 동점 처리(승점 → 득실 → 다득점 → 맞대결 → 적은 실점)를 다 쓰고도 갈리지 않은 완전 동률 구간에 그 순위가 걸리면 `tied`(`tiedRegistrationIds` = 동률 팀 전체, 후보 없음). 대회 설정 규칙의 저장 순위와 §5 가 어긋나는 자리도 `tied`. 정규 리그 id 는 404 `TOURNAMENT_NOT_FOUND`.
- `POST /admin/tournaments/:tournamentId/slots/fill-from-standings` `{ overrides?: [{ slotId, registrationId }] }`(최대 8개, uuid): mutation admin. 응답 `{ assignments: [{ slotId, registrationId }], skipped: [{ slotId, reason: 'tied'|'group_incomplete' }] }`. `ready` 자리 + override 를 한 트랜잭션에서 배정한다 — 바뀔 자리를 먼저 모두 비운 뒤 넣어 A1↔A2 맞바꾸기가 유일 제약에 걸리지 않는다. override 허용 범위: `tied` 자리는 `tiedRegistrationIds` 안의 팀, `ready` 자리는 그 조 소속 팀, `group_incomplete` 자리는 불가(422 `SLOT_REGISTRATION_INVALID`). 같은 팀이 두 자리에 배정되면 409 `SLOT_TEAM_ALREADY_PLACED`, 결선 경기가 시작된 자리가 바뀌어야 하면 409 `SLOT_LOCKED`(이미 맞게 들어 있는 자리는 건드리지 않는다). 시작 전이면 다시 채울 수 있다. 감사 `tournament.slots.fill_from_standings`.
```

- [ ] **Step 7: changeset**

```bash
cat > .changeset/admin-bracket-group-knockout.md <<'MD'
---
"v1_api": minor
"v1_web": minor
---

어드민 대진 관리에서 조별리그+결선 대회의 뼈대를 템플릿으로 한 번에 만들 수 있어요. 조별 경기가 모두 끝나면 「순위대로 채우기」로 결선의 "A조 1위" 자리를 채우고, 동률인 자리는 직접 팀을 골라요.
MD
```

- [ ] **Step 8: 커밋**

```bash
git add apps/v1_api/src/tournaments/slots/dto/fill-from-standings.dto.ts apps/v1_api/src/tournaments/slots/dto/fill-from-standings.dto.spec.ts apps/v1_api/src/tournaments/slots/tournament-slot-standings.controller.ts apps/v1_api/src/tournaments/slots/tournament-slot-standings.controller.spec.ts .changeset/admin-bracket-group-knockout.md
git commit -m "feat(v1_api): 순위 미리보기·순위대로 채우기 API와 문서" -- apps/v1_api/src/tournaments/slots/dto/fill-from-standings.dto.ts apps/v1_api/src/tournaments/slots/dto/fill-from-standings.dto.spec.ts apps/v1_api/src/tournaments/slots/tournament-slot-standings.controller.ts apps/v1_api/src/tournaments/slots/tournament-slot-standings.controller.spec.ts apps/v1_api/src/tournaments/tournaments.module.ts docs/api/domains/tournaments.md .changeset/admin-bracket-group-knockout.md
git show --stat HEAD
```

## Task 9: 순위 미리보기·채우기 통합 스펙 (실제 DB 로 쿼리와 배선 확인)

Task 5 의 로더는 Prisma 모의 객체로 검증했다 — `select`·`where` 가 실제 스키마와 맞는지, 서비스·컨트롤러 배선과 권한이 실제로 이어지는지는 DB 가 있어야 보인다. 경기 결과(OFFICIAL)를 DB 에 손으로 심는 것은 불변식 트리거와 부딪히므로 이 스펙은 **결과가 하나도 없는 조** 기준으로 배선을 고정하고, `ready`/`tied` 판정은 Task 4·5 의 실제 순위 계산 단위 테스트와 alpha 확인(Task 18)이 맡는다.

**Files:**
- Create: `apps/v1_api/test/tournaments/group-rank-standings.integration-spec.ts`

**Interfaces:**
- Consumes: PR-1b 의 `seedBracketTournament`·`seedSupportAdmin`(`test/helpers/bracket-canvas-fixture.ts`) · `BracketTemplateService`·`TournamentSlotService`(생성자는 PR-1b 통합 스펙과 같다: `new TournamentSlotService(prisma, adminContext, games)`)

- [ ] **Step 1: 스펙 작성**

```ts
// apps/v1_api/test/tournaments/group-rank-standings.integration-spec.ts
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentSlotService } from '../../src/tournaments/slots/tournament-slot.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, seedSupportAdmin } from '../helpers/bracket-canvas-fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'group-rank@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const adminContext = new AdminContextService(prisma);
const templates = new BracketTemplateService(prisma, adminContext, games);
const slots = new TournamentSlotService(prisma, adminContext, games);

/** 2조 x 3팀, 조 1·2위 진출(결선 4강) 대진과 확정 등록 6팀을 만든다. */
async function seedGroupKnockout(label: string) {
  const seeded = await seedBracketTournament(prisma, { label, format: 'group_knockout', teamCount: 6 });
  await templates.apply(user, seeded.tournamentId, {
    kind: 'group_knockout', groupCount: 2, teamsPerGroup: 3, advancePerGroup: 2, legs: 1, thirdPlace: false,
  });
  return seeded;
}

describe('조 순위 미리보기·순위대로 채우기 (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('GROUP_RANK 자리마다 한 행 — 조 순서·순위 순, 경기가 끝나지 않았으니 전부 group_incomplete', async () => {
    const { tournamentId } = await seedGroupKnockout('gr-preview');
    const { slots: rows } = await slots.standingsPreview(user, tournamentId);
    expect(rows.map((r) => [r.label, r.state, r.candidateRegistrationId, r.tiedRegistrationIds, r.currentRegistrationId])).toEqual([
      ['A조 1위', 'group_incomplete', null, [], null],
      ['A조 2위', 'group_incomplete', null, [], null],
      ['B조 1위', 'group_incomplete', null, [], null],
      ['B조 2위', 'group_incomplete', null, [], null],
    ]);
  });

  it('조 자리에 팀을 넣어 조 편성이 생겨도 미리보기는 그대로 읽힌다 (조 편성 조회가 쿼리를 깨지 않는다)', async () => {
    const { tournamentId, registrationIds } = await seedGroupKnockout('gr-assigned');
    const entries = await prisma.v1TournamentSlot.findMany({
      where: { tournamentId, kind: 'ENTRY' },
      orderBy: [{ groupId: 'asc' }, { position: 'asc' }],
    });
    expect(entries).toHaveLength(6);
    for (const [index, slot] of entries.entries()) await slots.assignSlot(user, slot.id, registrationIds[index]);
    expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId } } })).toBe(6);
    const { slots: rows } = await slots.standingsPreview(user, tournamentId);
    expect(rows.map((r) => r.state)).toEqual(['group_incomplete', 'group_incomplete', 'group_incomplete', 'group_incomplete']);
  });

  it('채울 수 있는 자리가 없으면 아무것도 쓰지 않고 건너뛴 자리만 돌려준다', async () => {
    const { tournamentId } = await seedGroupKnockout('gr-fill-none');
    const result = await slots.fillFromStandings(user, tournamentId, []);
    expect(result.assignments).toEqual([]);
    expect(result.skipped.map((s) => s.reason)).toEqual(['group_incomplete', 'group_incomplete', 'group_incomplete', 'group_incomplete']);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'GROUP_RANK', registrationId: { not: null } } })).toBe(0);
  });

  it('경기가 끝나지 않은 조의 자리에 override 를 주면 422 SLOT_REGISTRATION_INVALID, 모르는 자리는 404 SLOT_NOT_FOUND — 아무것도 쓰지 않는다', async () => {
    const { tournamentId, registrationIds } = await seedGroupKnockout('gr-override');
    const rank = await prisma.v1TournamentSlot.findFirstOrThrow({ where: { tournamentId, kind: 'GROUP_RANK' }, orderBy: { id: 'asc' } });
    await expect(slots.fillFromStandings(user, tournamentId, [{ slotId: rank.id, registrationId: registrationIds[0] }]))
      .rejects.toMatchObject({ response: { code: 'SLOT_REGISTRATION_INVALID' } });
    await expect(slots.fillFromStandings(user, tournamentId, [{ slotId: '00000000-0000-4000-8000-00000000dead', registrationId: registrationIds[0] }]))
      .rejects.toMatchObject({ response: { code: 'SLOT_NOT_FOUND' } });
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'GROUP_RANK', registrationId: { not: null } } })).toBe(0);
  });

  it('support 어드민은 미리보기는 되지만 채우기는 403 이다', async () => {
    const { tournamentId } = await seedGroupKnockout('gr-support');
    const support = await seedSupportAdmin(prisma, 'group-rank-support');
    await expect(slots.standingsPreview(support, tournamentId)).resolves.toMatchObject({ slots: expect.any(Array) });
    await expect(slots.fillFromStandings(support, tournamentId, [])).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('GROUP_RANK 자리가 없는 대회(토너먼트)의 미리보기는 빈 목록이다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'gr-knockout', format: 'knockout', teamCount: 0 });
    await templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false });
    await expect(slots.standingsPreview(user, tournamentId)).resolves.toEqual({ slots: [] });
  });
});
```

- [ ] **Step 2: 실행 — 통과 확인** (Task 3·7·8 이 끝난 뒤라 구현은 이미 있다. 새 코드 없이 배선을 확인하는 스펙이므로 "먼저 실패" 대신 아래 변이로 감도를 확인한다)

```bash
cd apps/v1_api && ./node_modules/.bin/jest --selectProjects integration --runInBand test/tournaments/group-rank-standings.integration-spec.ts
```

Expected: PASS (6건). 변이 점검(로컬 DB 가 있을 때): `load-group-rank-preview.ts` 의 조 팀 조회 `select` 에서 `registrationId` 를 틀린 이름으로 바꾸면 첫 테스트가 Prisma 검증 오류로 red 여야 한다(모의 객체가 못 잡는 스키마와 쿼리의 실제 일치 확인). 확인 후 원복.

- [ ] **Step 3: 커밋**

```bash
git add apps/v1_api/test/tournaments/group-rank-standings.integration-spec.ts
git commit -m "test(v1_api): 조 순위 미리보기·채우기 통합 스펙" -- apps/v1_api/test/tournaments/group-rank-standings.integration-spec.ts
git show --stat HEAD
```

## Task 10: 웹 타입 · 쿼리 키 · 훅 (`useV1SlotStandingsPreview` · `useV1FillSlotsFromStandings`)

**Files:**
- Create: `apps/v1_web/src/types/bracket-standings-fill.ts`
- Modify: `apps/v1_web/src/lib/query-keys.ts` (키 1개, `adminTournamentBracket` 바로 아래)
- Modify: `apps/v1_web/src/hooks/use-v1-bracket-canvas.ts` (PR-3, import 병합 + 훅 2개)
- Test: `apps/v1_web/src/hooks/use-v1-bracket-canvas.standings.test.tsx`

**Interfaces:**
- Consumes: PR-3 훅 파일의 모듈 비공개 함수 `invalidateCompetitionViews(queryClient, competitionId, scope)`(대회 scope 는 `adminTournamentBracket` + 공개 `tournament` 키를 무효화한다)
- Produces:
  - 타입 `V1SlotStandingState`, `V1SlotStandingsPreviewRow`, `V1SlotStandingsPreview`, `V1FillSlotsFromStandingsInput`, `V1FillSlotsFromStandingsResult` (계약 응답과 같은 모양)
  - `v1Keys.adminTournamentSlotStandings(tournamentId)` — `adminTournamentBracket` 키의 하위라, 대진 키를 무효화하면 미리보기도 함께 다시 읽는다
  - `useV1SlotStandingsPreview(tournamentId: string, enabled: boolean)` · `useV1FillSlotsFromStandings(tournamentId: string)` (계약 시그니처)

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// apps/v1_web/src/hooks/use-v1-bracket-canvas.standings.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1SlotStandingsPreview } from '@/types/bracket-standings-fill';

const { v1Get, v1Post } = vi.hoisted(() => ({ v1Get: vi.fn(), v1Post: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Get, v1Post };
});

import { useV1FillSlotsFromStandings, useV1SlotStandingsPreview } from './use-v1-bracket-canvas';

const PREVIEW: V1SlotStandingsPreview = {
  slots: [
    { slotId: 's1', label: 'A조 1위', state: 'ready', candidateRegistrationId: 'r1', candidateTeamName: '가FC', tiedRegistrationIds: [], currentRegistrationId: null },
  ],
};

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

describe('useV1SlotStandingsPreview', () => {
  beforeEach(() => {
    v1Get.mockReset();
    v1Post.mockReset();
  });

  it('enabled=false 인 동안은 읽지 않고, true 가 되면 계약 경로로 읽는다', async () => {
    v1Get.mockResolvedValue(PREVIEW);
    const { wrapper } = makeWrapper();
    const { result, rerender } = renderHook(({ enabled }) => useV1SlotStandingsPreview('t1', enabled), {
      wrapper,
      initialProps: { enabled: false },
    });
    expect(v1Get).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toEqual(PREVIEW));
    expect(v1Get).toHaveBeenCalledWith('/admin/tournaments/t1/slots/standings-preview');
  });

  it('창을 다시 열 때마다 새로 읽는다 — 이전에 본 순위를 캐시로 보여 주지 않는다', async () => {
    v1Get.mockResolvedValue(PREVIEW);
    const { wrapper } = makeWrapper();
    const first = renderHook(() => useV1SlotStandingsPreview('t1', true), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    const second = renderHook(() => useV1SlotStandingsPreview('t1', true), { wrapper });
    await waitFor(() => expect(v1Get).toHaveBeenCalledTimes(2));
    second.unmount();
  });
});

describe('useV1FillSlotsFromStandings', () => {
  beforeEach(() => {
    v1Get.mockReset();
    v1Post.mockReset();
  });

  it('override 없이 부르면 빈 본문, 있으면 그대로 계약 경로로 보낸다', async () => {
    v1Post.mockResolvedValue({ assignments: [], skipped: [] });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useV1FillSlotsFromStandings('t1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({});
    });
    expect(v1Post).toHaveBeenLastCalledWith('/admin/tournaments/t1/slots/fill-from-standings', {});
    await act(async () => {
      await result.current.mutateAsync({ overrides: [{ slotId: 's2', registrationId: 'r2' }] });
    });
    expect(v1Post).toHaveBeenLastCalledWith('/admin/tournaments/t1/slots/fill-from-standings', {
      overrides: [{ slotId: 's2', registrationId: 'r2' }],
    });
  });

  it('성공하면 같은 화면의 순위 미리보기와 대진 캐시가 다시 읽힌다 (채운 자리가 currentRegistrationId 로 보이도록)', async () => {
    v1Get.mockResolvedValue(PREVIEW);
    v1Post.mockResolvedValue({ assignments: [{ slotId: 's1', registrationId: 'r1' }], skipped: [] });
    const { wrapper } = makeWrapper();
    const preview = renderHook(() => useV1SlotStandingsPreview('t1', true), { wrapper });
    await waitFor(() => expect(preview.result.current.isSuccess).toBe(true));
    const fill = renderHook(() => useV1FillSlotsFromStandings('t1'), { wrapper });
    await act(async () => {
      await fill.result.current.mutateAsync({});
    });
    await waitFor(() => expect(v1Get).toHaveBeenCalledTimes(2));
  });

  it('실패하면 캐시를 건드리지 않는다 (입력을 유지한 채 다시 시도할 수 있다)', async () => {
    v1Get.mockResolvedValue(PREVIEW);
    v1Post.mockRejectedValue(new Error('SLOT_LOCKED'));
    const { wrapper } = makeWrapper();
    const preview = renderHook(() => useV1SlotStandingsPreview('t1', true), { wrapper });
    await waitFor(() => expect(preview.result.current.isSuccess).toBe(true));
    const fill = renderHook(() => useV1FillSlotsFromStandings('t1'), { wrapper });
    await act(async () => {
      await expect(fill.result.current.mutateAsync({})).rejects.toThrow('SLOT_LOCKED');
    });
    expect(v1Get).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/hooks/use-v1-bracket-canvas.standings.test.tsx
```

Expected: FAIL — `@/types/bracket-standings-fill` 모듈 없음(그 뒤 훅 미정의).

- [ ] **Step 3: 구현** — 타입 파일:

```ts
// apps/v1_web/src/types/bracket-standings-fill.ts
export type V1SlotStandingState = 'ready' | 'tied' | 'group_incomplete';

export type V1SlotStandingsPreviewRow = {
  slotId: string;
  label: string;
  state: V1SlotStandingState;
  candidateRegistrationId: string | null;
  candidateTeamName: string | null;
  /** 동률(tied)일 때 그 구간의 팀 전부. 아니면 빈 배열. */
  tiedRegistrationIds: string[];
  currentRegistrationId: string | null;
};

export type V1SlotStandingsPreview = { slots: V1SlotStandingsPreviewRow[] };

export type V1FillSlotsFromStandingsInput = {
  overrides?: Array<{ slotId: string; registrationId: string }>;
};

export type V1FillSlotsFromStandingsResult = {
  assignments: Array<{ slotId: string; registrationId: string }>;
  skipped: Array<{ slotId: string; reason: 'tied' | 'group_incomplete' }>;
};
```

`lib/query-keys.ts` — `adminTournamentBracket` 정의 바로 뒤에 추가:

찾기:

```ts
  adminTournamentBracket: (tournamentId: string) =>
    [...v1Keys.all, 'admin', 'tournaments', tournamentId, 'bracket'] as const,
```

바꾸기:

```ts
  adminTournamentBracket: (tournamentId: string) =>
    [...v1Keys.all, 'admin', 'tournaments', tournamentId, 'bracket'] as const,
  // 대진 키의 하위라 대진 키를 무효화하면 순위 미리보기도 함께 다시 읽힌다.
  adminTournamentSlotStandings: (tournamentId: string) =>
    [...v1Keys.adminTournamentBracket(tournamentId), 'slot-standings'] as const,
```

`hooks/use-v1-bracket-canvas.ts` — import 세 곳을 바꾸고 파일 끝에 훅 2개를 붙인다.

찾기:

```ts
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
```

바꾸기:

```ts
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
```

찾기:

```ts
import { v1Post, v1Put } from '@/lib/api-client';
```

바꾸기:

```ts
import { v1Get, v1Post, v1Put } from '@/lib/api-client';
```

찾기:

```ts
export type BracketCompetitionScope
```

바꾸기:

```ts
import type {
  V1FillSlotsFromStandingsInput,
  V1FillSlotsFromStandingsResult,
  V1SlotStandingsPreview,
} from '@/types/bracket-standings-fill';

export type BracketCompetitionScope
```

파일 끝에 추가:

```ts
/** `GET /admin/tournaments/:id/slots/standings-preview` — 순위 채우기 창이 열려 있을 때만, 매번 새로 읽는다. */
export function useV1SlotStandingsPreview(tournamentId: string, enabled: boolean) {
  return useQuery({
    queryKey: v1Keys.adminTournamentSlotStandings(tournamentId),
    queryFn: () => v1Get<V1SlotStandingsPreview>(`/admin/tournaments/${tournamentId}/slots/standings-preview`),
    enabled,
    staleTime: 0,
  });
}

/** `POST /admin/tournaments/:id/slots/fill-from-standings` — 동률 자리는 overrides 로 고른 팀을 보낸다. */
export function useV1FillSlotsFromStandings(tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: V1FillSlotsFromStandingsInput) =>
      v1Post<V1FillSlotsFromStandingsResult>(`/admin/tournaments/${tournamentId}/slots/fill-from-standings`, input),
    // 순위 미리보기 키가 대진 키의 하위라 이 한 번으로 둘 다 다시 읽힌다.
    onSuccess: () => invalidateCompetitionViews(queryClient, tournamentId, 'tournament'),
  });
}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/hooks/use-v1-bracket-canvas
```

Expected: PASS (새 5건 + PR-3 훅 테스트 회귀 없음).

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_web/src/types/bracket-standings-fill.ts apps/v1_web/src/hooks/use-v1-bracket-canvas.standings.test.tsx
git commit -m "feat(v1_web): 순위 미리보기·순위대로 채우기 훅" -- apps/v1_web/src/types/bracket-standings-fill.ts apps/v1_web/src/lib/query-keys.ts apps/v1_web/src/hooks/use-v1-bracket-canvas.ts apps/v1_web/src/hooks/use-v1-bracket-canvas.standings.test.tsx
git show --stat HEAD
```


## Task 11: 조 블록 배치·순위 연결선 높이 (순수 함수)

PR-3 의 `buildCanvasLayout` 이 쓰는 도우미다. PR-3 의 레이아웃 상수(열 폭 232·머리 44·행 44·간격 24)는 인자로 받아 이 파일이 PR-3 파일을 import 하지 않게 한다(순환 방지).

**Files:**
- Create: `apps/v1_web/src/lib/bracket-canvas-group-layout.ts`
- Test: `apps/v1_web/src/lib/bracket-canvas-group-layout.test.ts`

**Interfaces:**
- Consumes: `V1AdminBracketGroup`·`V1AdminBracketSlot`(PR-3 가 `types/api.ts` 에 추가) · 테스트 빌더 `makeGroup`·`makeSlot`(`test/bracket-canvas-fixtures.ts`)
- Produces:
  - `type GroupBlockLayout = { groupId; name; advanceCount: number | null; rankCount: number; slots: GroupBlockSlotRow[]; x; y; width; height }`, `GroupBlockSlotRow = Pick<V1AdminBracketSlot, 'id' | 'position' | 'label' | 'registrationId' | 'teamName'>`
  - `groupBlockGroups(groups, slots): V1AdminBracketGroup[]` — 블록을 그릴 조(순위 자리가 있는 대진의, ENTRY 자리를 가진 조별 조, 조 순서)
  - `layoutGroupBlocks(input: { groups; slots; x; top; width; headerHeight; rowHeight; gap }): GroupBlockLayout[]`
  - `groupRankAnchorY(block, rank): number` — 블록 오른쪽 가장자리에서 순위 선이 나가는 높이(블록 높이를 진출 수 + 1 등분)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// apps/v1_web/src/lib/bracket-canvas-group-layout.test.ts
import { describe, expect, it } from 'vitest';
import { makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import { groupBlockGroups, groupRankAnchorY, layoutGroupBlocks } from './bracket-canvas-group-layout';

const geometry = { x: 632, top: 56, width: 232, headerHeight: 44, rowHeight: 44, gap: 24 };

const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0, advanceCount: 2 });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1, advanceCount: 2 });
const semi = makeGroup({ id: 'g-semi', name: '4강', phase: 'semi' });

const entries = (groupId: string, letter: string, count: number) =>
  Array.from({ length: count }, (_, i) =>
    makeSlot({ id: `e${letter}${i + 1}`, kind: 'ENTRY', groupId, position: i + 1, label: `${letter}조 ${i + 1}번` }),
  );
const rank = (letter: string, sourceGroupId: string, position: number) =>
  makeSlot({ id: `r${letter}${position}`, kind: 'GROUP_RANK', groupId: 'g-semi', sourceGroupId, position, label: `${letter}조 ${position}위` });

const slots = [...entries('gA', 'A', 4), ...entries('gB', 'B', 4), rank('A', 'gA', 1), rank('A', 'gA', 2), rank('B', 'gB', 1), rank('B', 'gB', 2)];

describe('groupBlockGroups', () => {
  it('순위 자리가 있는 대진에서 ENTRY 자리를 가진 조별 조만 조 순서대로 돌려준다', () => {
    expect(groupBlockGroups([gB, semi, gA], slots).map((g) => g.id)).toEqual(['gA', 'gB']);
  });

  it('순위 자리가 하나도 없으면(토너먼트·리그·수동 조) 블록이 없다 — 대조: 순위 자리를 더하면 생긴다', () => {
    const withoutRanks = slots.filter((slot) => slot.kind !== 'GROUP_RANK');
    expect(groupBlockGroups([gA, gB], withoutRanks)).toEqual([]);
    expect(groupBlockGroups([gA, gB], [...withoutRanks, rank('A', 'gA', 1)])).toHaveLength(2);
  });

  it('ENTRY 자리가 없는 조(수동으로 만든 조)는 건너뛴다', () => {
    const manual = makeGroup({ id: 'gC', name: 'C조', phase: 'group', sortOrder: 2 });
    expect(groupBlockGroups([gA, gB, manual], slots).map((g) => g.id)).toEqual(['gA', 'gB']);
  });
});

describe('layoutGroupBlocks', () => {
  it('높이 = 머리 44 + 자리 수 x 44 + 바닥 8, 다음 블록은 간격 24 를 두고 아래에 놓인다', () => {
    const [a, b] = layoutGroupBlocks({ ...geometry, groups: [gA, gB], slots });
    expect([a.x, a.y, a.width, a.height]).toEqual([632, 56, 232, 228]);
    expect(b.y).toBe(56 + 228 + 24);
  });

  it('자리는 순번 순이고 자기 조의 ENTRY 자리만 담는다 (섞어 넣어도)', () => {
    const shuffled = [...slots].reverse();
    const [a, b] = layoutGroupBlocks({ ...geometry, groups: [gA, gB], slots: shuffled });
    expect(a.slots.map((s) => s.id)).toEqual(['eA1', 'eA2', 'eA3', 'eA4']);
    expect(b.slots.map((s) => s.id)).toEqual(['eB1', 'eB2', 'eB3', 'eB4']);
  });

  it('올라오는 순위 자리 중 가장 큰 순위를 rankCount 로 기록한다', () => {
    const [a] = layoutGroupBlocks({ ...geometry, groups: [gA, gB], slots });
    expect(a.rankCount).toBe(2);
    const onlyFirst = layoutGroupBlocks({ ...geometry, groups: [gA, gB], slots: slots.filter((s) => s.id !== 'rA2') });
    expect(onlyFirst[0].rankCount).toBe(1);
  });
});

describe('groupRankAnchorY', () => {
  const [a] = layoutGroupBlocks({ ...geometry, groups: [gA, gB], slots });

  it('진출 2팀이면 블록 높이를 3등분한 지점 — 1위·2위 선이 서로 다른 높이다', () => {
    expect(groupRankAnchorY(a, 1)).toBe(56 + 76);
    expect(groupRankAnchorY(a, 2)).toBe(56 + 152);
  });

  it('진출 1팀이면 블록 가운데', () => {
    const one = { ...a, advanceCount: 1 };
    expect(groupRankAnchorY(one, 1)).toBe(56 + 114);
  });

  it('진출 수가 비어 있으면 rankCount 로 나눈다', () => {
    const unknown = { ...a, advanceCount: null };
    expect(groupRankAnchorY(unknown, 1)).toBe(56 + 76);
  });

  it('데이터가 어긋나 순위가 진출 수보다 커도 선은 블록 안에서 나간다', () => {
    const odd = { ...a, advanceCount: 1, rankCount: 1 };
    const y = groupRankAnchorY(odd, 2);
    expect(y).toBeGreaterThan(odd.y);
    expect(y).toBeLessThan(odd.y + odd.height);
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-canvas-group-layout.test.ts
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// apps/v1_web/src/lib/bracket-canvas-group-layout.ts
import type { V1AdminBracketGroup, V1AdminBracketSlot } from '@/types/api';

/** 블록 맨 아래 여백 */
export const GROUP_BLOCK_FOOTER_HEIGHT = 8;

export type GroupBlockSlotRow = Pick<V1AdminBracketSlot, 'id' | 'position' | 'label' | 'registrationId' | 'teamName'>;

export type GroupBlockLayout = {
  groupId: string;
  name: string;
  advanceCount: number | null;
  /** 이 조에서 올라오는 순위 자리 중 가장 큰 순위. 진출 수가 비어 있을 때 연결선 높이를 나누는 데 쓴다. */
  rankCount: number;
  slots: GroupBlockSlotRow[];
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GroupBlockGeometry = {
  x: number;
  top: number;
  width: number;
  headerHeight: number;
  rowHeight: number;
  gap: number;
};

/**
 * 조 편성 블록을 그릴 조들. 순위 자리(GROUP_RANK)가 하나도 없는 대진(토너먼트·리그·수동으로 만든 조)은
 * 블록이 필요 없다 — 그 화면은 기존 그대로다. ENTRY 자리가 없는 조도 건너뛴다.
 */
export function groupBlockGroups(
  groups: readonly V1AdminBracketGroup[],
  slots: readonly V1AdminBracketSlot[],
): V1AdminBracketGroup[] {
  if (!slots.some((slot) => slot.kind === 'GROUP_RANK')) return [];
  return groups
    .filter((group) => group.phase === 'group' && slots.some((slot) => slot.kind === 'ENTRY' && slot.groupId === group.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'));
}

export function layoutGroupBlocks(
  input: GroupBlockGeometry & { groups: readonly V1AdminBracketGroup[]; slots: readonly V1AdminBracketSlot[] },
): GroupBlockLayout[] {
  const blocks: GroupBlockLayout[] = [];
  let y = input.top;
  for (const group of groupBlockGroups(input.groups, input.slots)) {
    const rows = input.slots
      .filter((slot) => slot.kind === 'ENTRY' && slot.groupId === group.id)
      .sort((a, b) => a.position - b.position)
      .map(({ id, position, label, registrationId, teamName }) => ({ id, position, label, registrationId, teamName }));
    const rankCount = input.slots
      .filter((slot) => slot.kind === 'GROUP_RANK' && slot.sourceGroupId === group.id)
      .reduce((max, slot) => Math.max(max, slot.position), 0);
    const height = input.headerHeight + rows.length * input.rowHeight + GROUP_BLOCK_FOOTER_HEIGHT;
    blocks.push({
      groupId: group.id,
      name: group.name,
      advanceCount: group.advanceCount,
      rankCount,
      slots: rows,
      x: input.x,
      y,
      width: input.width,
      height,
    });
    y += height + input.gap;
  }
  return blocks;
}

/**
 * 순위 연결선이 블록 오른쪽 가장자리에서 나가는 높이. 진출 수가 N 이면 블록 높이를 N+1 등분한 지점이라
 * 같은 조의 1위·2위 선이 서로 다른 높이에서 나가 겹치지 않는다.
 */
export function groupRankAnchorY(block: GroupBlockLayout, rank: number): number {
  const advance = Math.max(block.advanceCount ?? block.rankCount, rank);
  return block.y + (block.height * rank) / (advance + 1);
}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-canvas-group-layout.test.ts
```

Expected: PASS (10건).

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_web/src/lib/bracket-canvas-group-layout.ts apps/v1_web/src/lib/bracket-canvas-group-layout.test.ts
git commit -m "feat(v1_web): 조 블록 배치와 순위 연결선 높이 계산" -- apps/v1_web/src/lib/bracket-canvas-group-layout.ts apps/v1_web/src/lib/bracket-canvas-group-layout.test.ts
git show --stat HEAD
```


## Task 12: `buildCanvasLayout` — 조 편성 열 · `groupBlocks` · `GROUP_RANK` 연결선

PR-3 의 `lib/bracket-canvas-layout.ts` 를 고친다. 순위 자리(GROUP_RANK)가 있는 조별+결선 대진에서만 마지막 조별 열과 결선 첫 열 **사이**에 「조 편성」 열을 끼운다(인접해야 긴 선이 다른 열을 가로지르지 않는다). 그 밖의 대진(토너먼트·리그·수동 조)의 계산은 한 줄도 달라지지 않는다.

**Files:**
- Modify: `apps/v1_web/src/lib/bracket-canvas-layout.ts`
- Modify: `apps/v1_web/src/lib/bracket-canvas-layout.test.ts`
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx` (연결선 모양 표에 한 줄 — 타입 오류 방지)

**Interfaces:**
- Consumes: `groupBlockGroups`·`layoutGroupBlocks`·`groupRankAnchorY`·`GroupBlockLayout`(Task 11) · PR-3 의 `elbowPath`·`sideAnchorY`·`CANVAS_*` 상수(같은 파일)
- Produces: `CanvasEdgeKind` 에 `'GROUP_RANK'`, `CanvasLayout.groupBlocks: GroupBlockLayout[]`, 연결선 id `rank:{fixtureId}:{side}`, 열 key `group-blocks`(라벨 「조 편성」)

- [ ] **Step 1: 실패하는 테스트 추가** — `bracket-canvas-layout.test.ts` 맨 끝에 붙인다(같은 파일의 `makeFixture`·`makeGame`·`makeGroup`·`makeSlot` import 와 앞에서 정의된 `semi`·`f1`·`f2` 를 그대로 쓴다). 숫자는 PR-3 상수(열 폭 232·간격 72·여백 24·첫 칸 y 56·칸 높이 156·행 높이 44·머리 44)에서 손으로 계산한 값이다: 열 x = 24 + 304 x 열 번호, 블록 높이 = 44 + 4 x 44 + 8 = 228, 블록 y = 56 / 308, 순위 선 시작 높이 = 블록 y + 228 x 순위 / 3.

```ts
describe('buildCanvasLayout — 조별+결선 조 편성 블록과 순위 연결선', () => {
  const stage = (id: string, name: string, sortOrder: number) =>
    makeGroup({ id, name, phase: 'group', sortOrder, advanceCount: 2 });
  const gA = stage('gA', 'A조', 0);
  const gB = stage('gB', 'B조', 1);
  const gSemi = makeGroup({ id: 'g-semi', name: '4강', phase: 'semi', sortOrder: 0 });
  const gFinal = makeGroup({ id: 'g-final', name: '결승', phase: 'final', sortOrder: 1 });
  const entry = (groupId: string, letter: string, position: number) =>
    makeSlot({ id: `e${letter}${position}`, kind: 'ENTRY', groupId, position, label: `${letter}조 ${position}번` });
  const rank = (letter: string, sourceGroupId: string, position: number) =>
    makeSlot({ id: `r${letter}${position}`, kind: 'GROUP_RANK', groupId: 'g-semi', sourceGroupId, position, label: `${letter}조 ${position}위` });
  const slots = [
    ...[1, 2, 3, 4].map((n) => entry('gA', 'A', n)),
    ...[1, 2, 3, 4].map((n) => entry('gB', 'B', n)),
    rank('A', 'gA', 1), rank('A', 'gA', 2), rank('B', 'gB', 1), rank('B', 'gB', 2),
  ];
  const fixtures = [
    makeFixture({ id: 'fa1', groupId: 'gA', fixtureNumber: 1, round: 'league_r1', homeSlotId: 'eA1', awaySlotId: 'eA2' }),
    makeFixture({ id: 'fb1', groupId: 'gB', fixtureNumber: 2, round: 'league_r1', homeSlotId: 'eB1', awaySlotId: 'eB2' }),
    makeFixture({ id: 'sf1', groupId: 'g-semi', fixtureNumber: 3, round: '4강', homeSlotId: 'rA1', awaySlotId: 'rB2' }),
    makeFixture({ id: 'sf2', groupId: 'g-semi', fixtureNumber: 4, round: '4강', homeSlotId: 'rB1', awaySlotId: 'rA2' }),
    makeFixture({
      id: 'fin',
      groupId: 'g-final',
      fixtureNumber: 5,
      round: '결승',
      bracketSources: [
        { fixtureId: 'sf1', outcome: 'WINNER', side: 'HOME' },
        { fixtureId: 'sf2', outcome: 'WINNER', side: 'AWAY' },
      ],
    }),
  ];
  const layout = buildCanvasLayout({ groups: [gFinal, gSemi, gB, gA], fixtures, slots, mode: 'bracket' });

  it('마지막 조별 열과 결선 첫 열 사이에 "조 편성" 열이 끼고, 다음 열들은 한 칸씩 밀린다', () => {
    expect(layout.columns.map((c) => [c.label, c.x])).toEqual([
      ['A조', 24], ['B조', 328], ['조 편성', 632], ['4강', 936], ['결승', 1240],
    ]);
    expect(layout.columns.find((c) => c.key === 'group-blocks')?.fixtureIds).toEqual([]);
    expect(layout.width).toBe(1496);
  });

  it('조 블록은 조 편성 열에 위에서부터 쌓이고 전체 높이에 반영된다', () => {
    expect(layout.groupBlocks.map((b) => [b.groupId, b.x, b.y, b.width, b.height])).toEqual([
      ['gA', 632, 56, 232, 228],
      ['gB', 632, 308, 232, 228],
    ]);
    // 블록 맨 아래 536 + 바깥 여백 24 — 칸이 가장 낮은 곳(392)보다 깊다.
    expect(layout.height).toBe(560);
  });

  it('순위 연결선: 블록 오른쪽 → 결선 칸 사이드, 4강 A1–B2 · B1–A2 교차', () => {
    const ranks = layout.edges.filter((e) => e.kind === 'GROUP_RANK');
    expect(ranks.map((e) => [e.id, e.fromFixtureId, e.toFixtureId, e.side, e.path])).toEqual([
      ['rank:sf1:HOME', null, 'sf1', 'HOME', 'M864 132 H900 V122 H936'],
      ['rank:sf1:AWAY', null, 'sf1', 'AWAY', 'M864 460 H900 V166 H936'],
      ['rank:sf2:HOME', null, 'sf2', 'HOME', 'M864 384 H900 V302 H936'],
      ['rank:sf2:AWAY', null, 'sf2', 'AWAY', 'M864 208 H900 V346 H936'],
    ]);
  });

  it('기존 승자 연결선은 그대로 — 결승으로 가는 2개, 조별 칸 사이드(ENTRY 자리)에는 선이 없다', () => {
    expect(layout.edges.filter((e) => e.kind === 'WINNER').map((e) => e.id)).toEqual(['sf1->fin:HOME', 'sf2->fin:AWAY']);
    expect(layout.edges.some((e) => e.toFixtureId === 'fa1' || e.toFixtureId === 'fb1')).toBe(false);
  });

  it('순위 자리가 없는 조별 대진(수동으로 만든 조·리그 방식 조)에는 블록 열도 블록도 없다 — 대조군', () => {
    const noRanks = slots.filter((slot) => slot.kind !== 'GROUP_RANK');
    const plain = buildCanvasLayout({ groups: [gA, gB, gSemi], fixtures: fixtures.slice(0, 4), slots: noRanks, mode: 'bracket' });
    expect(plain.groupBlocks).toEqual([]);
    expect(plain.columns.map((c) => c.label)).toEqual(['A조', 'B조', '4강']);
  });

  it('리그 모드는 순위 자리가 있어도 블록을 만들지 않는다', () => {
    const league = buildCanvasLayout({ groups: [gA, gB, gSemi], fixtures: fixtures.slice(0, 4), slots, mode: 'league' });
    expect(league.groupBlocks).toEqual([]);
    expect(league.columns.some((c) => c.key === 'group-blocks')).toBe(false);
  });

  it('블록이 없는 기존 대진의 결과에는 groupBlocks 가 빈 배열로 붙는다', () => {
    const knockout = buildCanvasLayout({ groups: [semi], fixtures: [f1, f2], slots: [], mode: 'bracket' });
    expect(knockout.groupBlocks).toEqual([]);
  });
});

// 스펙 S2 교차 대진 표 — 서버 group-rank-pairings.spec.ts 와 같은 표다.
const RANK_COMBOS: Array<[string, number, number, string[][], 'round16' | 'quarter' | 'semi' | 'final']> = [
  ['2조 x 1팀', 2, 1, [['A1', 'B1']], 'final'],
  ['2조 x 2팀', 2, 2, [['A1', 'B2'], ['B1', 'A2']], 'semi'],
  ['4조 x 1팀', 4, 1, [['A1', 'D1'], ['B1', 'C1']], 'semi'],
  ['4조 x 2팀', 4, 2, [['A1', 'B2'], ['C1', 'D2'], ['B1', 'A2'], ['D1', 'C2']], 'quarter'],
  ['8조 x 1팀', 8, 1, [['A1', 'H1'], ['D1', 'E1'], ['B1', 'G1'], ['C1', 'F1']], 'quarter'],
  [
    '8조 x 2팀(16강)',
    8,
    2,
    [
      ['A1', 'B2'], ['C1', 'D2'], ['E1', 'F2'], ['G1', 'H2'],
      ['B1', 'A2'], ['D1', 'C2'], ['F1', 'E2'], ['H1', 'G2'],
    ],
    'round16',
  ],
];

describe.each(RANK_COMBOS)('순위 연결선 — %s', (_name, groupCount, advance, pairs, firstPhase) => {
  const letters = Array.from({ length: groupCount }, (_, i) => String.fromCharCode(65 + i));
  const stageGroups = letters.map((letter, i) => makeGroup({ id: `g${letter}`, name: `${letter}조`, phase: 'group', sortOrder: i, advanceCount: advance }));
  const knockoutGroup = makeGroup({ id: 'ko', name: '결선', phase: firstPhase });
  const entrySlots = letters.flatMap((letter) =>
    [1, 2, 3, 4].map((p) => makeSlot({ id: `e${letter}${p}`, kind: 'ENTRY', groupId: `g${letter}`, position: p, label: `${letter}${p}` })),
  );
  const rankSlots = letters.flatMap((letter) =>
    Array.from({ length: advance }, (_, i) =>
      makeSlot({ id: `r${letter}${i + 1}`, kind: 'GROUP_RANK', groupId: 'ko', sourceGroupId: `g${letter}`, position: i + 1, label: `${letter}조 ${i + 1}위` }),
    ),
  );
  const knockout = pairs.map(([home, away], index) =>
    makeFixture({ id: `k${index}`, groupId: 'ko', fixtureNumber: index + 1, round: '결선', homeSlotId: `r${home}`, awaySlotId: `r${away}` }),
  );
  const layout = buildCanvasLayout({ groups: [...stageGroups, knockoutGroup], fixtures: knockout, slots: [...entrySlots, ...rankSlots], mode: 'bracket' });

  it('올라오는 자리마다 선 하나, 올바른 조 블록 높이에서 올바른 사이드로 이어진다', () => {
    const ranks = layout.edges.filter((e) => e.kind === 'GROUP_RANK');
    expect(ranks).toHaveLength(groupCount * advance);
    const blockX = 24 + groupCount * 304;
    const koX = 24 + (groupCount + 1) * 304;
    pairs.forEach(([home, away], index) => {
      const nodeY = 56 + index * 180;
      for (const [side, label] of [['HOME', home], ['AWAY', away]] as const) {
        const block = layout.groupBlocks.find((b) => b.groupId === `g${label[0]}`)!;
        const fromY = block.y + (228 * Number(label.slice(1))) / (advance + 1);
        const toY = nodeY + 44 + (side === 'HOME' ? 22 : 66);
        const edge = ranks.find((e) => e.id === `rank:k${index}:${side}`)!;
        expect(edge.path).toBe(`M${blockX + 232} ${fromY} H${koX - 36} V${toY} H${koX}`);
      }
    });
  });

  it('블록은 조 순서로 쌓이고(간격 24) 같은 조의 선은 서로 다른 높이에서 나간다', () => {
    expect(layout.groupBlocks.map((b) => b.groupId)).toEqual(letters.map((l) => `g${l}`));
    layout.groupBlocks.forEach((b, i) => expect(b.y).toBe(56 + i * (228 + 24)));
    const fromY = (path: string) => Number(path.split(' ')[1]);
    for (const block of layout.groupBlocks) {
      const ys = layout.edges
        .filter((e) => e.kind === 'GROUP_RANK' && fromY(e.path) > block.y && fromY(e.path) < block.y + block.height)
        .map((e) => fromY(e.path));
      expect(ys).toHaveLength(advance);
      expect(new Set(ys).size).toBe(advance);
    }
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-canvas-layout.test.ts
```

Expected: FAIL — 새 describe 가 `layout.groupBlocks` 가 없다는 이유로(PR-3 기존 27건은 그대로 PASS).

- [ ] **Step 3: 구현** — `bracket-canvas-layout.ts` 를 Edit 7곳으로 고친다.

① import — `} from '@/types/api';` 바로 다음 줄에 추가:

찾기:

```ts
} from '@/types/api';
```

바꾸기:

```ts
} from '@/types/api';
import { groupBlockGroups, groupRankAnchorY, layoutGroupBlocks, type GroupBlockLayout } from './bracket-canvas-group-layout';
```

② 연결선 종류:

찾기:

```ts
export type CanvasEdgeKind = 'WINNER' | 'LOSER' | 'BYE';
```

바꾸기:

```ts
export type CanvasEdgeKind = 'WINNER' | 'LOSER' | 'BYE' | 'GROUP_RANK';
```

③ `CanvasLayout` 타입에 필드 추가:

찾기:

```ts
  edges: CanvasEdgeLayout[];
};
```

바꾸기:

```ts
  edges: CanvasEdgeLayout[];
  /** 조별+결선 대진의 조 편성 블록. 순위 자리가 없는 대진은 빈 배열. */
  groupBlocks: GroupBlockLayout[];
};
```

④ `function compareFixtures(` 바로 앞에 열 끼우기 함수 추가:

찾기:

```ts
function compareFixtures(
```

바꾸기:

```ts
const GROUP_BLOCKS_COLUMN_KEY = 'group-blocks';

/** 순위 자리가 있는 조별+결선 대진은 마지막 조별 열과 결선 첫 열 사이에 조 편성 블록 열을 끼운다. */
function withGroupBlocksColumn(seeds: ColumnSeed[], input: CanvasLayoutInput): ColumnSeed[] {
  if (input.mode !== 'bracket' || groupBlockGroups(input.groups, input.slots).length === 0) return seeds;
  const phaseOf = new Map(input.groups.map((group) => [group.id, group.phase]));
  const lastGroupColumn = seeds.reduce(
    (last, seed, index) => (seed.groupId !== null && phaseOf.get(seed.groupId) === 'group' ? index : last),
    -1,
  );
  const column: ColumnSeed = { key: GROUP_BLOCKS_COLUMN_KEY, groupId: null, label: '조 편성', fixtures: [] };
  return [...seeds.slice(0, lastGroupColumn + 1), column, ...seeds.slice(lastGroupColumn + 1)];
}

function compareFixtures(
```

⑤ `buildCanvasLayout` 도입부 — 열 끼우기와 블록 배치:

찾기:

```ts
  const seeds = input.mode === 'league' ? leagueColumns(input.fixtures) : bracketColumns(input.groups, input.fixtures);
  const slotsById = new Map(input.slots.map((slot) => [slot.id, slot]));
  const placed = new Map<string, CanvasNodeLayout>();
  const columns: CanvasColumnLayout[] = [];

  seeds.forEach((seed, index) => {
    const x = CANVAS_PADDING + index * (CANVAS_NODE_WIDTH + CANVAS_COLUMN_GAP);
    let cursor = FIRST_NODE_Y;
```

바꾸기:

```ts
  const baseSeeds = input.mode === 'league' ? leagueColumns(input.fixtures) : bracketColumns(input.groups, input.fixtures);
  const seeds = withGroupBlocksColumn(baseSeeds, input);
  const slotsById = new Map(input.slots.map((slot) => [slot.id, slot]));
  const placed = new Map<string, CanvasNodeLayout>();
  const columns: CanvasColumnLayout[] = [];
  const groupBlocks: GroupBlockLayout[] = [];

  seeds.forEach((seed, index) => {
    const x = CANVAS_PADDING + index * (CANVAS_NODE_WIDTH + CANVAS_COLUMN_GAP);
    if (seed.key === GROUP_BLOCKS_COLUMN_KEY) {
      groupBlocks.push(
        ...layoutGroupBlocks({
          groups: input.groups,
          slots: input.slots,
          x,
          top: FIRST_NODE_Y,
          width: CANVAS_NODE_WIDTH,
          headerHeight: CANVAS_HEADER_HEIGHT,
          rowHeight: CANVAS_ROW_HEIGHT,
          gap: CANVAS_ROW_GAP,
        }),
      );
      columns.push({ key: seed.key, groupId: null, label: seed.label, x, width: CANVAS_NODE_WIDTH, fixtureIds: [] });
      return;
    }
    let cursor = FIRST_NODE_Y;
```

⑥ 연결선 계산 — 블록 조회 맵을 만들고, 사이드 루프에서 순위 연결선을 더한다:

찾기:

```ts
  const edges: CanvasEdgeLayout[] = [];
  for (const seed of seeds) {
```

바꾸기:

```ts
  const blockByGroup = new Map(groupBlocks.map((block) => [block.groupId, block]));
  const edges: CanvasEdgeLayout[] = [];
  for (const seed of seeds) {
```

찾기:

```ts
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
```

바꾸기:

```ts
        const slotId = side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId;
        const slot = slotId === null ? undefined : slotsById.get(slotId);
        if (slot?.kind === 'BYE') {
          edges.push({
            id: `bye:${fixture.id}:${side}`,
            kind: 'BYE',
            fromFixtureId: null,
            toFixtureId: fixture.id,
            side,
            path: `M${target.x - CANVAS_COLUMN_GAP / 2} ${sideAnchorY(target, side)} H${target.x}`,
          });
        }
        const block = slot?.kind === 'GROUP_RANK' && slot.sourceGroupId !== null ? blockByGroup.get(slot.sourceGroupId) : undefined;
        if (slot !== undefined && block !== undefined) {
          edges.push({
            id: `rank:${fixture.id}:${side}`,
            kind: 'GROUP_RANK',
            fromFixtureId: null,
            toFixtureId: fixture.id,
            side,
            path: elbowPath(block.x + block.width, groupRankAnchorY(block, slot.position), target.x, sideAnchorY(target, side)),
          });
        }
```

⑦ 전체 크기 — 블록 아래 끝도 높이에 넣고 `groupBlocks` 를 돌려준다:

찾기:

```ts
  const bottom = nodes.reduce((max, node) => Math.max(max, node.y + node.height), FIRST_NODE_Y);
  return { width, height: bottom + CANVAS_PADDING, columns, nodes, edges };
```

바꾸기:

```ts
  const nodesBottom = nodes.reduce((max, node) => Math.max(max, node.y + node.height), FIRST_NODE_Y);
  const bottom = groupBlocks.reduce((max, block) => Math.max(max, block.y + block.height), nodesBottom);
  return { width, height: bottom + CANVAS_PADDING, columns, nodes, edges, groupBlocks };
```

⑧ `components/admin/bracket-canvas/bracket-canvas.tsx` — `CanvasEdgeKind` 를 키로 쓰는 `EDGE_STYLE` 에 순위 연결선의 모양을 더한다(선·점 번갈아 — 승자 실선·패자 `6 4`·부전승 `2 3` 과 모양으로 구분):

찾기:

```ts
  BYE: { dash: '2 3' },
};
```

바꾸기:

```ts
  BYE: { dash: '2 3' },
  GROUP_RANK: { dash: '10 4 2 4' },
};
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-canvas-layout.test.ts src/lib/bracket-canvas-group-layout.test.ts src/components/admin/bracket-canvas/bracket-canvas.test.tsx && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

Expected: PASS (레이아웃 44건 = PR-3 27 + 새 17, 도우미 10건), tsc 0.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 캔버스 레이아웃에 조 편성 열과 순위 연결선" -- apps/v1_web/src/lib/bracket-canvas-layout.ts apps/v1_web/src/lib/bracket-canvas-layout.test.ts apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx
git show --stat HEAD
```


## Task 13: 조 편성 블록 컴포넌트 `BracketGroupBlock`

조별 열 옆에 놓이는 작은 표다. 조의 ENTRY 자리를 순번대로 보여 주고, **팀 넣기의 세 경로(고른 팀 누르기 · 끌어 놓기 · 자리 눌러 패널 열기)** 를 PR-3 의 칸(`BracketCanvasNode`)과 똑같이 낸다. 한 자리를 쓰는 조별 경기가 여럿(3~5개)이라, 칸마다 같은 자리를 따로 채우는 대신 여기서 한 번에 채운다.

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-group-block.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-group-block.test.tsx`

**Interfaces:**
- Consumes: `GroupBlockLayout`(Task 11) · `REGISTRATION_DRAG_MIME`(`bracket-canvas-dnd.ts`, PR-3) · `CANVAS_HEADER_HEIGHT`·`CANVAS_ROW_HEIGHT`(`lib/bracket-canvas-layout.ts`)
- Produces: `BracketGroupBlock(props: { block: GroupBlockLayout; canWrite: boolean; lockedSlotIds: ReadonlySet<string>; pendingRegistrationId: string | null; onPlace: (slotId: string, registrationId: string) => void; onOpenSlot: (slotId: string) => void })`

동작: 자리 행은 44px 버튼 · 접근성 이름 `"A조 1번, 서울FC"`/`"A조 1번, 빈 자리"`(+ 팀을 고른 상태면 `", 선택한 팀을 여기에 넣어요"`) · 팀을 고른 상태에서 `canWrite` 이고 잠기지 않은 자리를 누르면 `onPlace`(채워진 자리는 바꿔 넣기), 아니면 `onOpenSlot`(그 자리를 쓰는 경기의 패널) · 끌어 놓기는 같은 조건에서만 받는다 · 진출 수는 파란 배지 + 「상위 N팀 진출」 글자 · 채워짐/빈 자리는 글자로도 구분한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// apps/v1_web/src/components/admin/bracket-canvas/bracket-group-block.test.tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GroupBlockLayout } from '@/lib/bracket-canvas-group-layout';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';
import { BracketGroupBlock } from './bracket-group-block';

const block: GroupBlockLayout = {
  groupId: 'gA',
  name: 'A조',
  advanceCount: 2,
  rankCount: 2,
  x: 632,
  y: 56,
  width: 232,
  height: 140,
  slots: [
    { id: 'a1', position: 1, label: 'A조 1번', registrationId: 'reg-1', teamName: '서울FC' },
    { id: 'a2', position: 2, label: 'A조 2번', registrationId: null, teamName: null },
  ],
};

function renderBlock(overrides: Partial<React.ComponentProps<typeof BracketGroupBlock>> = {}) {
  const props = {
    block,
    canWrite: true,
    lockedSlotIds: new Set<string>(),
    pendingRegistrationId: null,
    onPlace: vi.fn(),
    onOpenSlot: vi.fn(),
    ...overrides,
  };
  render(<BracketGroupBlock {...props} />);
  return props;
}

const dropOn = (row: HTMLElement, registrationId: string) =>
  fireEvent.drop(row, { dataTransfer: { getData: (type: string) => (type === REGISTRATION_DRAG_MIME ? registrationId : '') } });

describe('BracketGroupBlock', () => {
  it('조 이름·진출 배지와 자리를 보여 준다 — 채워진 자리는 팀 이름, 빈 자리는 "빈 자리" 글자로 구분한다', () => {
    renderBlock();
    const group = screen.getByRole('group', { name: 'A조 조 편성' });
    expect(within(group).getByText('상위 2팀 진출')).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'A조 1번, 서울FC' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'A조 2번, 빈 자리' })).toBeInTheDocument();
  });

  it('진출 수가 없으면 배지를 그리지 않는다', () => {
    renderBlock({ block: { ...block, advanceCount: null } });
    expect(screen.queryByText(/팀 진출/)).not.toBeInTheDocument();
  });

  it('행 높이는 44px 터치 타겟이다', () => {
    renderBlock();
    expect(screen.getByRole('button', { name: 'A조 1번, 서울FC' }).closest('li')).toHaveStyle({ height: '44px' });
  });

  it('팀을 고르지 않고 자리를 누르면 그 자리의 패널을 연다 (읽기 전용에서도)', () => {
    const props = renderBlock({ canWrite: false });
    fireEvent.click(screen.getByRole('button', { name: 'A조 1번, 서울FC' }));
    expect(props.onOpenSlot).toHaveBeenCalledWith('a1');
    expect(props.onPlace).not.toHaveBeenCalled();
  });

  it('고른 팀이 있으면 자리를 눌러 그 팀을 넣는다 (채워진 자리는 바꿔 넣기)', () => {
    const props = renderBlock({ pendingRegistrationId: 'reg-9' });
    fireEvent.click(screen.getByRole('button', { name: 'A조 2번, 빈 자리, 선택한 팀을 여기에 넣어요' }));
    expect(props.onPlace).toHaveBeenCalledWith('a2', 'reg-9');
    fireEvent.click(screen.getByRole('button', { name: 'A조 1번, 서울FC, 선택한 팀을 여기에 넣어요' }));
    expect(props.onPlace).toHaveBeenLastCalledWith('a1', 'reg-9');
    expect(props.onOpenSlot).not.toHaveBeenCalled();
  });

  it('이미 시작한 경기가 쓰는 자리는 팀을 고른 상태에서도 넣을 수 없다 — 누르면 패널만 연다 (대조: 다른 자리는 넣는다)', () => {
    const props = renderBlock({ pendingRegistrationId: 'reg-9', lockedSlotIds: new Set(['a1']) });
    fireEvent.click(screen.getByRole('button', { name: 'A조 1번, 서울FC' }));
    expect(props.onOpenSlot).toHaveBeenCalledWith('a1');
    expect(props.onPlace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /A조 2번, 빈 자리, 선택한 팀을 여기에 넣어요/ }));
    expect(props.onPlace).toHaveBeenCalledWith('a2', 'reg-9');
  });

  it('읽기 전용에서는 팀을 고른 상태여도 넣을 수 없다', () => {
    const props = renderBlock({ canWrite: false, pendingRegistrationId: 'reg-9' });
    expect(screen.queryByRole('button', { name: /선택한 팀을 여기에 넣어요/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'A조 2번, 빈 자리' }));
    expect(props.onPlace).not.toHaveBeenCalled();
  });

  it('끌어 놓은 팀을 그 자리에 넣는다 — 잠긴 자리·읽기 전용은 놓을 수 없다', () => {
    const props = renderBlock({ lockedSlotIds: new Set(['a1']) });
    const open = screen.getByRole('button', { name: 'A조 2번, 빈 자리' }).closest('li')!;
    const locked = screen.getByRole('button', { name: 'A조 1번, 서울FC' }).closest('li')!;
    expect(fireEvent.dragOver(open)).toBe(false); // preventDefault 가 걸려 놓을 수 있는 곳
    expect(fireEvent.dragOver(locked)).toBe(true);
    dropOn(open, 'reg-7');
    expect(props.onPlace).toHaveBeenCalledWith('a2', 'reg-7');
    dropOn(locked, 'reg-8');
    expect(props.onPlace).toHaveBeenCalledTimes(1);
  });

  it('끌어 놓은 데이터에 팀이 없으면 아무것도 하지 않는다', () => {
    const props = renderBlock();
    dropOn(screen.getByRole('button', { name: 'A조 2번, 빈 자리' }).closest('li')!, '');
    expect(props.onPlace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-group-block.test.tsx
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```tsx
// apps/v1_web/src/components/admin/bracket-canvas/bracket-group-block.tsx
'use client';

import type { DragEvent } from 'react';
import type { GroupBlockLayout } from '@/lib/bracket-canvas-group-layout';
import { CANVAS_HEADER_HEIGHT, CANVAS_ROW_HEIGHT } from '@/lib/bracket-canvas-layout';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

export type BracketGroupBlockProps = {
  block: GroupBlockLayout;
  canWrite: boolean;
  /** 이 자리를 쓰는 경기 중 시작했거나 결과가 있는 경기가 있는 자리 — 서버 SLOT_LOCKED 와 같은 기준 */
  lockedSlotIds: ReadonlySet<string>;
  pendingRegistrationId: string | null;
  onPlace: (slotId: string, registrationId: string) => void;
  /** 팀을 고르지 않고 자리를 눌렀을 때 — 그 자리를 쓰는 경기의 패널을 연다 */
  onOpenSlot: (slotId: string) => void;
};

export function BracketGroupBlock({ block, canWrite, lockedSlotIds, pendingRegistrationId, onPlace, onOpenSlot }: BracketGroupBlockProps) {
  return (
    <section
      role="group"
      aria-label={`${block.name} 조 편성`}
      data-group-id={block.groupId}
      className="absolute overflow-hidden bg-[var(--card-surface)]"
      style={{
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
        borderRadius: 'var(--radius-container)',
        border: '1px solid var(--border-strong)',
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3" style={{ height: CANVAS_HEADER_HEIGHT }}>
        <span className="tm-text-label min-w-0 truncate font-semibold" style={{ color: 'var(--text-strong)' }}>
          {block.name}
        </span>
        {block.advanceCount ? (
          <span className="tm-badge tm-badge-sm tm-badge-blue shrink-0">상위 {block.advanceCount}팀 진출</span>
        ) : null}
      </div>
      <ul>
        {block.slots.map((slot) => {
          const filled = slot.registrationId !== null;
          const teamText = filled ? (slot.teamName ?? '') : '빈 자리';
          const assignable = canWrite && !lockedSlotIds.has(slot.id);
          const placing = assignable && pendingRegistrationId !== null;
          return (
            <li
              key={slot.id}
              className="border-t border-[var(--border)]"
              style={{ height: CANVAS_ROW_HEIGHT }}
              onDragOver={assignable ? (event: DragEvent) => event.preventDefault() : undefined}
              onDrop={
                assignable
                  ? (event: DragEvent) => {
                      event.preventDefault();
                      const registrationId = event.dataTransfer.getData(REGISTRATION_DRAG_MIME);
                      if (registrationId !== '') onPlace(slot.id, registrationId);
                    }
                  : undefined
              }
            >
              <button
                type="button"
                aria-label={`${slot.label}, ${teamText}${placing ? ', 선택한 팀을 여기에 넣어요' : ''}`}
                onClick={() => (placing ? onPlace(slot.id, pendingRegistrationId) : onOpenSlot(slot.id))}
                className={`flex h-full w-full items-center gap-2 px-3 text-left transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500${placing ? ' tm-on-tint bg-[var(--blue50)]' : ''}`}
              >
                <span aria-hidden="true" className="tab-num tm-text-caption w-5 shrink-0 text-center" style={{ color: 'var(--text-muted)' }}>
                  {slot.position}
                </span>
                <span
                  className={`tm-text-label min-w-0 flex-1 truncate${filled ? ' font-semibold' : ''}`}
                  style={{ color: filled || placing ? 'var(--text-strong)' : 'var(--text-muted)' }}
                >
                  {teamText}
                </span>
                {placing ? (
                  <span className="tm-text-caption-strong shrink-0" style={{ color: 'var(--blue700)' }}>
                    여기에 넣기
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-group-block.test.tsx && node scripts/v1-pattern-check.mjs
```

Expected: PASS (9건), 패턴 체크 0 위반. 변이 점검: `lockedSlotIds.has(slot.id)` 조건을 지우면 「잠긴 자리」·「끌어 놓기」 2건이 red 여야 한다 — 확인 후 원복.

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_web/src/components/admin/bracket-canvas/bracket-group-block.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-group-block.test.tsx
git commit -m "feat(v1_web): 조 편성 블록 컴포넌트" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-group-block.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-group-block.test.tsx
git show --stat HEAD
```


## Task 14: `BracketCanvas` 에 조 편성 블록 렌더 · 순위선 범례 · 잠긴 자리

PR-3 의 `bracket-canvas.tsx` 를 Edit 4곳으로 고친다(연결선 모양 표는 Task 12 ⑧ 에서 이미 했다). `BracketCanvas` 의 props 는 바뀌지 않는다 — 블록의 배정은 기존 `onAssignSlot`, 패널 열기는 기존 `onSelectFixture` 를 쓴다.

**Files:**
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx`
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.test.tsx`

**Interfaces:**
- Consumes: `layout.groupBlocks`(Task 12) · `BracketGroupBlock`(Task 13) · `isFixtureLocked`(`lib/bracket-canvas-layout.ts`, 이미 export)
- Produces: 순위 자리가 있는 대진에서 「조 편성」 열에 조 블록이 그려지고, 순위 연결선 설명 문구가 승자·패자선 설명과 따로 붙는다

- [ ] **Step 1: 실패하는 테스트 추가** — `bracket-canvas.test.tsx` 의 import 두 줄을 바꾸고 파일 끝에 describe 를 붙인다(기존 `renderCanvas` 헬퍼를 그대로 쓴다).

찾기:

```ts
import { makeFixture, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
```

바꾸기:

```ts
import { makeFixture, makeGame, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';
```

파일 끝에 추가:

```tsx
describe('BracketCanvas — 조별+결선 조 편성 블록', () => {
  const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0, advanceCount: 2 });
  const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1, advanceCount: 2 });
  const gSemi = makeGroup({ id: 'g-semi', name: '4강', phase: 'semi', sortOrder: 0 });
  const gFinal = makeGroup({ id: 'g-final', name: '결승', phase: 'final', sortOrder: 1 });
  const entry = (groupId: string, letter: string, position: number, team: string | null = null) =>
    makeSlot({
      id: `e${letter}${position}`, kind: 'ENTRY', groupId, position, label: `${letter}조 ${position}번`,
      registrationId: team === null ? null : `reg-${letter}${position}`, teamName: team,
    });
  const rank = (letter: string, sourceGroupId: string, position: number) =>
    makeSlot({ id: `r${letter}${position}`, kind: 'GROUP_RANK', groupId: 'g-semi', sourceGroupId, position, label: `${letter}조 ${position}위` });
  const rankSlots = [rank('A', 'gA', 1), rank('A', 'gA', 2), rank('B', 'gB', 1), rank('B', 'gB', 2)];
  const groupSlots = [
    entry('gA', 'A', 1, '서울FC'), entry('gA', 'A', 2), entry('gA', 'A', 3), entry('gA', 'A', 4),
    entry('gB', 'B', 1), entry('gB', 'B', 2), entry('gB', 'B', 3), entry('gB', 'B', 4),
  ];
  const groupFixtures = (aGame = makeGame()) => [
    // 일부러 번호가 큰 경기를 앞에 둔다 — 첫 경기 판정은 입력 순서가 아니라 번호 순이어야 한다.
    makeFixture({ id: 'fa2', groupId: 'gA', fixtureNumber: 6, round: 'league_r2', homeSlotId: 'eA1', awaySlotId: 'eA3' }),
    makeFixture({ id: 'fa1', groupId: 'gA', fixtureNumber: 1, round: 'league_r1', homeSlotId: 'eA1', awaySlotId: 'eA2', game: aGame }),
    makeFixture({ id: 'fb1', groupId: 'gB', fixtureNumber: 2, round: 'league_r1', homeSlotId: 'eB1', awaySlotId: 'eB2' }),
    makeFixture({ id: 'sf1', groupId: 'g-semi', fixtureNumber: 7, round: '4강', homeSlotId: 'rA1', awaySlotId: 'rB2' }),
    makeFixture({ id: 'sf2', groupId: 'g-semi', fixtureNumber: 8, round: '4강', homeSlotId: 'rB1', awaySlotId: 'rA2' }),
    makeFixture({
      id: 'fin', groupId: 'g-final', fixtureNumber: 9, round: '결승',
      bracketSources: [{ fixtureId: 'sf1', outcome: 'WINNER', side: 'HOME' }, { fixtureId: 'sf2', outcome: 'WINNER', side: 'AWAY' }],
    }),
  ];
  const stageProps = (aGame?: ReturnType<typeof makeGame>) => ({
    groups: [gFinal, gSemi, gB, gA],
    fixtures: groupFixtures(aGame),
    slots: [...groupSlots, ...rankSlots],
  });

  it('조마다 편성 블록을 그리고 열 이름 "조 편성" 이 4강 앞에 온다', () => {
    renderCanvas(stageProps());
    expect(screen.getByRole('group', { name: 'A조 조 편성' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'B조 조 편성' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['A조', 'B조', '조 편성', '4강', '결승']);
    expect(within(screen.getByRole('group', { name: 'A조 조 편성' })).getByRole('button', { name: 'A조 1번, 서울FC' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'A조 조 편성' })).getByRole('button', { name: 'A조 2번, 빈 자리' })).toBeInTheDocument();
  });

  it('조 순위 연결선 4개는 선·점 점선이고 설명 문구가 따로 붙는다 (승자선 설명과 구분)', () => {
    const { container } = renderCanvas(stageProps());
    expect(container.querySelectorAll('svg path[stroke-dasharray="10 4 2 4"]')).toHaveLength(4);
    expect(screen.getByText('선과 점이 번갈아 나오는 점선은 조 순위로 올라오는 곳이에요.')).toBeInTheDocument();
    expect(screen.getByText(/실선은 승자, 점선은 패자/)).toBeInTheDocument();
  });

  it('팀을 고른 상태에서 빈 조 자리를 누르면 그 자리에 배정한다', () => {
    const { props } = renderCanvas({ ...stageProps(), pendingRegistrationId: 'reg-9' });
    fireEvent.click(screen.getByRole('button', { name: 'A조 2번, 빈 자리, 선택한 팀을 여기에 넣어요' }));
    expect(props.onAssignSlot).toHaveBeenCalledWith('eA2', 'reg-9');
    expect(props.onSelectFixture).not.toHaveBeenCalled();
  });

  it('팀을 고르지 않고 자리를 누르면 그 자리를 쓰는 경기 중 번호가 가장 앞선 경기를 연다', () => {
    const { props } = renderCanvas(stageProps());
    fireEvent.click(screen.getByRole('button', { name: 'A조 1번, 서울FC' }));
    expect(props.onSelectFixture).toHaveBeenCalledWith('fa1'); // fa2(6번)도 eA1 을 쓰지만 1번 경기가 먼저
  });

  it('쓰는 경기가 하나라도 시작됐으면 그 자리는 팀을 고른 상태에서도 넣을 수 없다 — 시작 전 자리는 넣는다', () => {
    const { props } = renderCanvas({ ...stageProps(makeGame({ state: 'LIVE' })), pendingRegistrationId: 'reg-9' });
    // eA1·eA2 는 진행 중인 fa1 이 쓴다. eA3 은 시작 전 fa2 만 쓴다.
    const block = within(screen.getByRole('group', { name: 'A조 조 편성' }));
    expect(block.queryByRole('button', { name: /A조 1번.*선택한 팀을 여기에 넣어요/ })).not.toBeInTheDocument();
    fireEvent.click(block.getByRole('button', { name: 'A조 1번, 서울FC' }));
    expect(props.onAssignSlot).not.toHaveBeenCalled();
    expect(props.onSelectFixture).toHaveBeenCalledWith('fa1');
    fireEvent.click(block.getByRole('button', { name: 'A조 3번, 빈 자리, 선택한 팀을 여기에 넣어요' }));
    expect(props.onAssignSlot).toHaveBeenCalledWith('eA3', 'reg-9');
  });

  it('끌어 놓은 팀을 조 자리에 넣는다', () => {
    const { props } = renderCanvas(stageProps());
    const row = screen.getByRole('button', { name: 'B조 2번, 빈 자리' }).closest('li')!;
    fireEvent.drop(row, { dataTransfer: { getData: (type: string) => (type === REGISTRATION_DRAG_MIME ? 'reg-7' : '') } });
    expect(props.onAssignSlot).toHaveBeenCalledWith('eB2', 'reg-7');
  });

  it('읽기 전용에서는 고른 팀이 있어도 넣을 수 없다', () => {
    renderCanvas({ ...stageProps(), canWrite: false, pendingRegistrationId: 'reg-9' });
    expect(screen.queryByRole('button', { name: /A조 2번.*선택한 팀을 여기에 넣어요/ })).not.toBeInTheDocument();
  });

  it('순위 자리가 없는 대진(토너먼트)에는 조 편성 블록도 순위 연결 설명도 없다 — 대조군', () => {
    const { container } = renderCanvas();
    expect(screen.queryByRole('group', { name: /조 편성/ })).not.toBeInTheDocument();
    expect(container.querySelector('svg path[stroke-dasharray="10 4 2 4"]')).toBeNull();
    expect(screen.queryByText(/조 순위로 올라오는 곳/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas.test.tsx
```

Expected: FAIL — 새 describe 가 「A조 조 편성」 그룹을 못 찾는다(PR-3 기존 7건은 PASS).

- [ ] **Step 3: 구현** — `bracket-canvas.tsx`:

① import — 레이아웃 import 에 `isFixtureLocked` 추가, 컴포넌트 import 한 줄 추가:

찾기:

```ts
  fixtureSideLabel,
  type CanvasEdgeKind,
```

바꾸기:

```ts
  fixtureSideLabel,
  isFixtureLocked,
  type CanvasEdgeKind,
```

찾기:

```ts
import { BracketCanvasNode } from './bracket-canvas-node';
```

바꾸기:

```ts
import { BracketCanvasNode } from './bracket-canvas-node';
import { BracketGroupBlock } from './bracket-group-block';
```

② 파생 값 — `slotsById` 메모 바로 아래에 추가:

찾기:

```ts
  const slotsById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
```

바꾸기:

```ts
  const slotsById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  // 조 편성 블록의 자리: 쓰는 경기 중 하나라도 시작했으면 잠기고(서버 SLOT_LOCKED 와 같은 기준),
  // 팀 없이 누르면 그 자리를 쓰는 경기 중 번호가 가장 앞선 경기의 패널을 연다.
  const { lockedSlotIds, firstFixtureBySlot } = useMemo(() => {
    const locked = new Set<string>();
    const first = new Map<string, string>();
    for (const fixture of [...fixtures].sort((a, b) => a.fixtureNumber - b.fixtureNumber || a.legNumber - b.legNumber)) {
      for (const slotId of [fixture.homeSlotId, fixture.awaySlotId]) {
        if (slotId === null) continue;
        if (!first.has(slotId)) first.set(slotId, fixture.id);
        if (isFixtureLocked(fixture)) locked.add(slotId);
      }
    }
    return { lockedSlotIds: locked, firstFixtureBySlot: first };
  }, [fixtures]);
  const hasBracketEdges = layout.edges.some((edge) => edge.kind !== 'GROUP_RANK');
  const hasRankEdges = layout.edges.some((edge) => edge.kind === 'GROUP_RANK');
```

③ 블록 렌더 + 범례 — 칸 목록 `})}` 와 닫는 `</div>`, 그리고 기존 범례를 한 번에 교체:

찾기:

```ts
          );
        })}
      </div>
      {layout.edges.length > 0 ? (
        <p className="tm-text-caption px-4 pb-3" style={{ color: 'var(--text-muted)' }}>
          실선은 승자, 점선은 패자가 가는 곳이에요.
        </p>
      ) : null}
```

바꾸기:

```ts
          );
        })}
        {layout.groupBlocks.map((block) => (
          <BracketGroupBlock
            key={block.groupId}
            block={block}
            canWrite={canWrite}
            lockedSlotIds={lockedSlotIds}
            pendingRegistrationId={pendingRegistrationId}
            onPlace={onAssignSlot}
            onOpenSlot={(slotId) => {
              const fixtureId = firstFixtureBySlot.get(slotId);
              if (fixtureId !== undefined) onSelectFixture(fixtureId);
            }}
          />
        ))}
      </div>
      {hasBracketEdges ? (
        <p className="tm-text-caption px-4 pb-3" style={{ color: 'var(--text-muted)' }}>
          실선은 승자, 점선은 패자가 가는 곳이에요.
        </p>
      ) : null}
      {hasRankEdges ? (
        <p className="tm-text-caption px-4 pb-3" style={{ color: 'var(--text-muted)' }}>
          선과 점이 번갈아 나오는 점선은 조 순위로 올라오는 곳이에요.
        </p>
      ) : null}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas.test.tsx && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs
```

Expected: PASS (15건 = PR-3 7 + 새 8), tsc 0, 패턴 체크 0 위반.

알려진 한계(이 PR 범위 밖): PR-3 의 칸(`BracketCanvasNode`)은 잠금을 **경기 단위**(`isFixtureLocked(fixture)`)로 판정한다. 한 조별 자리를 쓰는 경기 중 하나만 시작됐을 때 나머지 시작 전 경기의 칸에서는 그 자리에 팀을 넣을 수 있는 것처럼 보이고, 서버가 409 `SLOT_LOCKED` 로 거절한다(해요체 토스트). 조 편성 블록은 위처럼 자리 단위로 판정해 막는다. 칸 쪽을 자리 단위로 고치는 것은 PR-3 의 몫이다.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 캔버스에 조 편성 블록과 순위 연결선 설명" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas.test.tsx
git show --stat HEAD
```


## Task 15: 템플릿 미리보기 개수에 조별+결선 추가 (`planBracketTemplateCounts`)

PR-3 의 `lib/bracket-template-counts.ts` 는 `group_knockout` 에 `null`(미리보기 없음)을 돌려주고 "PR-4 가 채운다"고 적어 두었다. 서버가 거절하는 조합(결선 크기 ∉ {2,4,8,16}, 결승만인데 3·4위전)도 `null` 이다 — 템플릿 창이 이 `null` 로 만들기 버튼을 막는다.

**Files:**
- Modify: `apps/v1_web/src/lib/bracket-template-counts.ts`
- Modify: `apps/v1_web/src/lib/bracket-template-counts.test.ts`

**Interfaces:**
- Consumes/Produces: `planBracketTemplateCounts(input)` (PR-3 시그니처 그대로) — `group_knockout` 이면 `{ groups: 조 수 + log2(결선 크기) + 3위전, slots: 조 수 x 조당 팀 + 결선 크기, fixtures: 조 수 x C(조당 팀, 2) x 회전 + (결선 크기 - 1) + 3위전, edges: (결선 크기 - 2) + 3위전 x 2 }`

(수식 근거: 결선 첫 라운드는 순위 자리가 대신해 연결선이 없고, 둘째 라운드부터 양쪽이 모두 연결되어 결선 크기 - 2 개, 3·4위전은 4강 패자 2개. 서버 `planGroupKnockoutTemplate` 의 개수 계약(Task 2)과 같은 숫자다.)

- [ ] **Step 1: 테스트 바꾸기** — `bracket-template-counts.test.ts`

찾기:

```ts
  it('조별+결선은 아직 미리보기를 계산하지 않는다(null)', () => {
    expect(
      planBracketTemplateCounts({ kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true }),
    ).toBeNull();
  });
```

바꾸기:

```ts
  it.each([
    ['2조 x 4팀 2팀 진출 1회전', { groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false }, { groups: 4, slots: 12, fixtures: 15, edges: 2 }],
    ['같은 조건 + 3·4위전', { groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true }, { groups: 5, slots: 12, fixtures: 16, edges: 4 }],
    ['4조 x 4팀 2팀 진출 2회전 + 3·4위전', { groupCount: 4, teamsPerGroup: 4, advancePerGroup: 2, legs: 2, thirdPlace: true }, { groups: 8, slots: 24, fixtures: 56, edges: 8 }],
    ['8조 x 3팀 1팀 진출', { groupCount: 8, teamsPerGroup: 3, advancePerGroup: 1, legs: 1, thirdPlace: false }, { groups: 11, slots: 32, fixtures: 31, edges: 6 }],
    ['2조 x 3팀 1팀 진출(결승만)', { groupCount: 2, teamsPerGroup: 3, advancePerGroup: 1, legs: 1, thirdPlace: false }, { groups: 3, slots: 8, fixtures: 7, edges: 0 }],
    ['4조 x 5팀 1팀 진출 2회전', { groupCount: 4, teamsPerGroup: 5, advancePerGroup: 1, legs: 2, thirdPlace: false }, { groups: 6, slots: 24, fixtures: 83, edges: 2 }],
    ['8조 x 4팀 2팀 진출(16강)', { groupCount: 8, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false }, { groups: 12, slots: 48, fixtures: 63, edges: 14 }],
    ['8조 x 4팀 2팀 진출(16강) + 3·4위전', { groupCount: 8, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true }, { groups: 13, slots: 48, fixtures: 64, edges: 16 }],
  ] as const)('조별+결선 %s', (_name, rest, expected) => {
    expect(planBracketTemplateCounts({ kind: 'group_knockout', ...rest })).toEqual(expected);
  });

  it.each([
    ['결선 크기 3 (3조 x 1팀)', { groupCount: 3, teamsPerGroup: 4, advancePerGroup: 1, legs: 1, thirdPlace: false }],
    ['결선 크기 6 (3조 x 2팀)', { groupCount: 3, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false }],
    ['결승만인데 3·4위전', { groupCount: 2, teamsPerGroup: 4, advancePerGroup: 1, legs: 1, thirdPlace: true }],
  ] as const)('서버가 거절하는 조별+결선 조합은 미리보기가 없다(null) — %s', (_name, rest) => {
    expect(planBracketTemplateCounts({ kind: 'group_knockout', ...rest })).toBeNull();
  });
```

상한 경계 테스트를 하나 더한다 — 같은 파일의 `it('경계: 16팀 2회전은 …` 바로 앞에:

찾기:

```ts
  it('경계: 16팀 2회전은 정확히 240경기라 허용, 17팀 2회전은 272경기라 초과', () => {
```

바꾸기:

```ts
  it('조별+결선은 8조 x 6팀 x 2회전(247경기)이 초과, 8조 x 5팀 x 2회전(167경기)은 허용', () => {
    const big = { kind: 'group_knockout', groupCount: 8, teamsPerGroup: 6, advancePerGroup: 1, legs: 2, thirdPlace: false } as const;
    expect(exceedsFixtureLimit(planBracketTemplateCounts(big)!)).toBe(true);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ ...big, teamsPerGroup: 5 })!)).toBe(false);
  });

  it('조별+결선 16강(8조 x 2팀)은 조별 경기와 결선 16경기를 합쳐 센다 — 8조 x 6팀 x 2회전은 256경기로 초과, 8조 x 5팀 x 2회전(176)·8조 x 6팀 x 1회전(136)·8조 x 4팀 x 1회전(64)은 허용', () => {
    const extreme = { kind: 'group_knockout', groupCount: 8, teamsPerGroup: 6, advancePerGroup: 2, legs: 2, thirdPlace: true } as const;
    expect(planBracketTemplateCounts(extreme)!.fixtures).toBe(257);
    expect(exceedsFixtureLimit(planBracketTemplateCounts(extreme)!)).toBe(true);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ ...extreme, thirdPlace: false })!)).toBe(true);
    expect(planBracketTemplateCounts({ ...extreme, teamsPerGroup: 5, thirdPlace: false })!.fixtures).toBe(176);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ ...extreme, teamsPerGroup: 5 })!)).toBe(false);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ ...extreme, legs: 1 })!)).toBe(false);
    expect(exceedsFixtureLimit(planBracketTemplateCounts({ ...extreme, teamsPerGroup: 4, legs: 1 })!)).toBe(false);
  });

  it('경계: 16팀 2회전은 정확히 240경기라 허용, 17팀 2회전은 272경기라 초과', () => {
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-template-counts.test.ts
```

Expected: FAIL — `group_knockout` 이 `null` 이라 새 `it.each` 8건과 경계 2건이 red.

- [ ] **Step 3: 구현** — `bracket-template-counts.ts` 의 마지막 `return null;` 을 교체:

찾기:

```ts
  if (input.kind === 'league') {
    return { groups: 1, slots: input.teamCount, fixtures: ((input.teamCount * (input.teamCount - 1)) / 2) * input.legs, edges: 0 };
  }
  return null;
```

바꾸기:

```ts
  if (input.kind === 'league') {
    return { groups: 1, slots: input.teamCount, fixtures: ((input.teamCount * (input.teamCount - 1)) / 2) * input.legs, edges: 0 };
  }
  // 결선 크기(조 수 x 진출 팀 수)가 2·4·8·16 이 아니거나 결승만인데 3·4위전이면 서버가 거절하는 조합 — 미리보기도 없다.
  const size = input.groupCount * input.advancePerGroup;
  if (![2, 4, 8, 16].includes(size) || (size === 2 && input.thirdPlace)) return null;
  const third = input.thirdPlace ? 1 : 0;
  const stageFixtures = input.groupCount * ((input.teamsPerGroup * (input.teamsPerGroup - 1)) / 2) * input.legs;
  return {
    groups: input.groupCount + Math.log2(size) + third,
    slots: input.groupCount * input.teamsPerGroup + size,
    fixtures: stageFixtures + (size - 1) + third,
    // 결선 첫 라운드는 순위 자리가 대신해 연결선이 없다 — 둘째 라운드부터 양쪽 연결(size - 2) + 3·4위전 패자 2.
    edges: size - 2 + third * 2,
  };
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-template-counts.test.ts && ./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

Expected: PASS (PR-3 8건 중 1건 교체 + 새 12건), tsc 0.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 조별+결선 템플릿 미리보기 개수" -- apps/v1_web/src/lib/bracket-template-counts.ts apps/v1_web/src/lib/bracket-template-counts.test.ts
git show --stat HEAD
```


## Task 16: 템플릿 창의 조별+결선 입력 (`GroupKnockoutFields`)

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-group-knockout-fields.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-group-knockout-fields.test.tsx`

**Interfaces:**
- Produces:
  - `type GroupKnockoutTemplateValue = { groupCount: number; teamsPerGroup: number; advancePerGroup: 1 | 2; legs: 1 | 2; thirdPlace: boolean }` · `DEFAULT_GROUP_KNOCKOUT_VALUE`(2조·4팀·2팀 진출·1회전·3위전 없음)
  - `groupKnockoutShapeIssue(value): string | null` — 서버가 422 `BRACKET_TEMPLATE_UNSUPPORTED` 로 거절할 조합(결선 크기 ∉ {2,4,8,16}, 결승만인데 3·4위전)을 보내기 전에 해요체로 알린다. 경기 수 상한(240)은 다루지 않는다 — 대화상자가 Task 15 의 `planBracketTemplateCounts`/`exceedsFixtureLimit` 로 막는다.
  - `applyGroupKnockoutChange(value, patch)` — 결선이 결승 한 경기뿐이 되면 `thirdPlace` 를 끈다
  - `GroupKnockoutFields(props: { value; onChange: (next) => void; disabled?: boolean })`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// apps/v1_web/src/components/admin/bracket-canvas/bracket-group-knockout-fields.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GROUP_KNOCKOUT_VALUE,
  GroupKnockoutFields,
  applyGroupKnockoutChange,
  groupKnockoutShapeIssue,
  type GroupKnockoutTemplateValue,
} from './bracket-group-knockout-fields';

const v = (patch: Partial<GroupKnockoutTemplateValue>): GroupKnockoutTemplateValue => ({ ...DEFAULT_GROUP_KNOCKOUT_VALUE, ...patch });

describe('groupKnockoutShapeIssue', () => {
  it('기본값과 지원하는 조합(2x1·2x2·4x1·4x2·8x1·8x2)은 문제없다', () => {
    for (const [groupCount, advancePerGroup] of [[2, 1], [2, 2], [4, 1], [4, 2], [8, 1], [8, 2]] as const) {
      expect(groupKnockoutShapeIssue(v({ groupCount, advancePerGroup }))).toBeNull();
    }
  });

  it.each([
    ['결선 크기 3', v({ groupCount: 3, advancePerGroup: 1 }), /2·4·8·16팀.*3팀/],
    ['결선 크기 6', v({ groupCount: 3, advancePerGroup: 2 }), /2·4·8·16팀.*6팀/],
    ['결선 크기 12', v({ groupCount: 6, advancePerGroup: 2 }), /2·4·8·16팀.*12팀/],
    ['결선 크기 7', v({ groupCount: 7, advancePerGroup: 1 }), /2·4·8·16팀.*7팀/],
    ['결승만인데 3·4위전', v({ advancePerGroup: 1, thirdPlace: true }), /3·4위전/],
  ])('%s → 안내 문장', (_name, value, pattern) => {
    expect(groupKnockoutShapeIssue(value)).toMatch(pattern);
  });
});

describe('applyGroupKnockoutChange', () => {
  it('결선이 결승 한 경기뿐이 되면 3·4위전을 끈다 — 대조: 4강이 있으면 유지', () => {
    expect(applyGroupKnockoutChange(v({ thirdPlace: true }), { advancePerGroup: 1 }).thirdPlace).toBe(false);
    expect(applyGroupKnockoutChange(v({ thirdPlace: true }), { teamsPerGroup: 5 }).thirdPlace).toBe(true);
  });
});

function Harness({ onChange }: { onChange?: (value: GroupKnockoutTemplateValue) => void }) {
  const [value, setValue] = useState(DEFAULT_GROUP_KNOCKOUT_VALUE);
  return (
    <GroupKnockoutFields
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('GroupKnockoutFields', () => {
  it('기본값을 보여 주고 문제가 없으면 알림이 없다', () => {
    render(<Harness />);
    expect(screen.getByLabelText('조 수')).toHaveValue('2');
    expect(screen.getByLabelText('조당 팀 수')).toHaveValue('4');
    expect(screen.getByLabelText('조별 진출 팀 수')).toHaveValue('2');
    expect(screen.getByLabelText('조별 회전')).toHaveValue('1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('지원하지 않는 조합이 되면 이유를 알림으로 보여 주고 바뀐 값은 그대로 전달한다', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('조 수'), { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ groupCount: 3, advancePerGroup: 2 }));
    expect(screen.getByRole('alert')).toHaveTextContent('2·4·8·16팀');
  });

  it('진출 팀을 1팀으로 줄여 결승만 남으면 3·4위전 체크가 꺼지고 비활성화되며 안내가 붙는다 (경고는 아니다)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    expect(screen.getByLabelText('3·4위전도 만들기')).toBeChecked();
    fireEvent.change(screen.getByLabelText('조별 진출 팀 수'), { target: { value: '1' } });
    expect(screen.getByLabelText('3·4위전도 만들기')).not.toBeChecked();
    expect(screen.getByLabelText('3·4위전도 만들기')).toBeDisabled();
    expect(screen.getByText(/결승 한 경기뿐/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('조별 회전 선택이 전달된다', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('조별 회전'), { target: { value: '2' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ legs: 2 }));
  });

  it('disabled 면 모든 입력이 잠긴다', () => {
    render(<GroupKnockoutFields value={DEFAULT_GROUP_KNOCKOUT_VALUE} onChange={() => {}} disabled />);
    for (const label of ['조 수', '조당 팀 수', '조별 진출 팀 수', '조별 회전', '3·4위전도 만들기']) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-group-knockout-fields.test.tsx
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```tsx
// apps/v1_web/src/components/admin/bracket-canvas/bracket-group-knockout-fields.tsx
'use client';

import { useId, type ChangeEvent } from 'react';

export type GroupKnockoutTemplateValue = {
  groupCount: number;
  teamsPerGroup: number;
  advancePerGroup: 1 | 2;
  legs: 1 | 2;
  thirdPlace: boolean;
};

export const DEFAULT_GROUP_KNOCKOUT_VALUE: GroupKnockoutTemplateValue = {
  groupCount: 2,
  teamsPerGroup: 4,
  advancePerGroup: 2,
  legs: 1,
  thirdPlace: false,
};

const SUPPORTED_KNOCKOUT_SIZES = [2, 4, 8, 16];

const knockoutSize = (value: GroupKnockoutTemplateValue) => value.groupCount * value.advancePerGroup;

/**
 * 서버가 422 `BRACKET_TEMPLATE_UNSUPPORTED` 로 거절할 조합을 보내기 전에 알린다.
 * 경기 수 상한(240)은 대화상자가 `planBracketTemplateCounts` 로 따로 막는다.
 */
export function groupKnockoutShapeIssue(value: GroupKnockoutTemplateValue): string | null {
  const size = knockoutSize(value);
  if (!SUPPORTED_KNOCKOUT_SIZES.includes(size)) {
    return `결선에 올라가는 팀은 2·4·8·16팀이어야 해요. 지금은 ${size}팀이에요.`;
  }
  if (size === 2 && value.thirdPlace) return '결선이 결승 한 경기뿐이면 3·4위전을 만들 수 없어요.';
  return null;
}

/** 결선이 결승 한 경기뿐이 되면 3·4위전을 끈다 — 4강이 있어야 패자 둘이 생긴다. */
export function applyGroupKnockoutChange(
  value: GroupKnockoutTemplateValue,
  patch: Partial<GroupKnockoutTemplateValue>,
): GroupKnockoutTemplateValue {
  const next = { ...value, ...patch };
  return knockoutSize(next) === 2 ? { ...next, thirdPlace: false } : next;
}

const SELECT_CLASS =
  'h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body)] ' +
  'text-[var(--text-strong)] transition-colors focus:outline-none focus:border-[var(--blue500)] disabled:opacity-50';
const LABEL_CLASS = 'tm-text-label font-semibold';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export function GroupKnockoutFields({
  value,
  onChange,
  disabled = false,
}: {
  value: GroupKnockoutTemplateValue;
  onChange: (next: GroupKnockoutTemplateValue) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const issue = groupKnockoutShapeIssue(value);
  const finalOnly = knockoutSize(value) === 2;
  const numberField = (key: 'groupCount' | 'teamsPerGroup', event: ChangeEvent<HTMLSelectElement>) =>
    onChange(applyGroupKnockoutChange(value, { [key]: Number(event.target.value) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-groups`} className={LABEL_CLASS} style={{ color: 'var(--text-strong)' }}>조 수</label>
          <select id={`${id}-groups`} className={SELECT_CLASS} value={value.groupCount} disabled={disabled} onChange={(e) => numberField('groupCount', e)}>
            {range(2, 8).map((n) => <option key={n} value={n}>{n}개 조</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-teams`} className={LABEL_CLASS} style={{ color: 'var(--text-strong)' }}>조당 팀 수</label>
          <select id={`${id}-teams`} className={SELECT_CLASS} value={value.teamsPerGroup} disabled={disabled} onChange={(e) => numberField('teamsPerGroup', e)}>
            {range(3, 6).map((n) => <option key={n} value={n}>{n}팀</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-advance`} className={LABEL_CLASS} style={{ color: 'var(--text-strong)' }}>조별 진출 팀 수</label>
          <select
            id={`${id}-advance`}
            className={SELECT_CLASS}
            value={value.advancePerGroup}
            disabled={disabled}
            onChange={(e) => onChange(applyGroupKnockoutChange(value, { advancePerGroup: Number(e.target.value) as 1 | 2 }))}
          >
            <option value={1}>조 1위만</option>
            <option value={2}>조 1·2위</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-legs`} className={LABEL_CLASS} style={{ color: 'var(--text-strong)' }}>조별 회전</label>
          <select
            id={`${id}-legs`}
            className={SELECT_CLASS}
            value={value.legs}
            disabled={disabled}
            onChange={(e) => onChange(applyGroupKnockoutChange(value, { legs: Number(e.target.value) as 1 | 2 }))}
          >
            <option value={1}>한 번씩</option>
            <option value={2}>홈·어웨이 두 번씩</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col">
        <label htmlFor={`${id}-third`} className="tm-text-label flex min-h-[44px] items-center gap-2" style={{ color: 'var(--text-strong)' }}>
          <input
            id={`${id}-third`}
            type="checkbox"
            className="size-5"
            checked={value.thirdPlace}
            disabled={disabled || finalOnly}
            onChange={(e) => onChange(applyGroupKnockoutChange(value, { thirdPlace: e.target.checked }))}
          />
          3·4위전도 만들기
        </label>
        {finalOnly ? (
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>결선이 결승 한 경기뿐이면 3·4위전을 만들 수 없어요.</p>
        ) : null}
      </div>

      {issue !== null ? (
        <p role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>{issue}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-group-knockout-fields.test.tsx && node scripts/v1-pattern-check.mjs
```

Expected: PASS (11건), 패턴 체크 0 위반.

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_web/src/components/admin/bracket-canvas/bracket-group-knockout-fields.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-group-knockout-fields.test.tsx
git commit -m "feat(v1_web): 템플릿 창 조별+결선 입력" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-group-knockout-fields.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-group-knockout-fields.test.tsx
git show --stat HEAD
```


## Task 17: `BracketTemplateDialog` 에 「조별+결선」 연결

**Files:**
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.tsx`
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.test.tsx`

**Interfaces:**
- Consumes: `GroupKnockoutFields`·`DEFAULT_GROUP_KNOCKOUT_VALUE`(Task 16) · `planBracketTemplateCounts`·`exceedsFixtureLimit`(Task 15, 대화상자가 이미 쓴다)
- Produces: `BracketTemplateDialogProps.format` 이 `'knockout' | 'league' | 'group_knockout'`; `group_knockout` 이면 입력 4종 + 3·4위전 체크가 나오고, 개수 미리보기·240 초과 차단은 기존 대화상자 로직이 그대로 한다

- [ ] **Step 1: 실패하는 테스트 추가** — `bracket-template-dialog.test.tsx` 맨 끝에 붙인다(같은 파일의 `renderDialog`·`create`·`mocks`·`fireEvent`·`screen`·`within`·`waitFor` 를 그대로 쓴다).

```tsx
describe('BracketTemplateDialog — 조별+결선', () => {
  const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('2조 x 4팀 2팀 진출이 기본이고 만들어질 개수를 미리 보여 준다', () => {
    renderDialog({ format: 'group_knockout' });
    expect(screen.getByLabelText('조 수')).toHaveValue('2');
    expect(screen.getByText('경기 15개 · 자리 12개 · 연결 2개')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    expect(screen.getByText('경기 16개 · 자리 12개 · 연결 4개')).toBeInTheDocument();
  });

  it('만들기는 계약 본문(group_knockout 평탄화)으로 보낸다', () => {
    renderDialog({ format: 'group_knockout' });
    change('조당 팀 수', '5');
    change('조별 회전', '2');
    create();
    expect(mocks.apply).toHaveBeenCalledWith(
      { kind: 'group_knockout', groupCount: 2, teamsPerGroup: 5, advancePerGroup: 2, legs: 2, thirdPlace: false },
      expect.any(Object),
    );
  });

  it('지원하지 않는 조합(3조 x 2팀 진출 = 6팀)은 만들 수 없고 이유를 보여 준다 — 개수 미리보기도 숨긴다', () => {
    renderDialog({ format: 'group_knockout' });
    change('조 수', '3');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('2·4·8·16팀');
    expect(screen.queryByText(/^경기 \d+개/)).not.toBeInTheDocument();
    change('조별 진출 팀 수', '1');
    change('조 수', '4');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeEnabled();
  });

  it('경기가 240개를 넘으면 만들 수 없다 (8조 x 6팀 x 2회전 = 247개, 5팀이면 167개로 가능)', () => {
    renderDialog({ format: 'group_knockout' });
    change('조 수', '8');
    change('조별 진출 팀 수', '1');
    change('조별 회전', '2');
    change('조당 팀 수', '5');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeEnabled();
    change('조당 팀 수', '6');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
    expect(screen.getByText('경기가 240개를 넘어서 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.')).toBeInTheDocument();
  });

  it('8조 x 4팀 2팀 진출은 16강을 만든다 — 개수 미리보기 63개(3·4위전 64개), 본문은 groupCount 8 · advancePerGroup 2', () => {
    renderDialog({ format: 'group_knockout' });
    change('조 수', '8');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('경기 63개 · 자리 48개 · 연결 14개')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('3·4위전도 만들기'));
    expect(screen.getByText('경기 64개 · 자리 48개 · 연결 16개')).toBeInTheDocument();
    create();
    expect(mocks.apply).toHaveBeenCalledWith(
      { kind: 'group_knockout', groupCount: 8, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true },
      expect.any(Object),
    );
  });

  it('16강 조합도 경기가 240개를 넘으면 막는다 (8조 x 6팀 x 2회전 + 16강 = 256개, 5팀이면 176개로 가능)', () => {
    renderDialog({ format: 'group_knockout' });
    change('조 수', '8');
    change('조별 회전', '2');
    change('조당 팀 수', '5');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeEnabled();
    change('조당 팀 수', '6');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeDisabled();
    expect(screen.getByText('경기가 240개를 넘어서 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.')).toBeInTheDocument();
    change('조별 회전', '1');
    expect(screen.getByRole('button', { name: '대진 만들기' })).toBeEnabled();
  });

  it('기존 대진이 있으면 확인을 거쳐 replaceExisting: true 로 보낸다', async () => {
    renderDialog({ format: 'group_knockout', hasExistingBracket: true });
    create();
    const confirmDialog = await screen.findByRole('dialog', { name: '기존 대진 교체' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '교체' }));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply).toHaveBeenCalledWith(
      { kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false, replaceExisting: true },
      expect.any(Object),
    );
  });

  it('토너먼트·리그 대회의 화면은 그대로다 — 조별 입력 칸이 없다 (대조군)', () => {
    renderDialog({ format: 'knockout' });
    expect(screen.queryByLabelText('조 수')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-template-dialog.test.tsx -t "조별\+결선"
```

Expected: FAIL — `format='group_knockout'` 에서 「조 수」 입력이 없다(리그 입력이 대신 그려진다).

- [ ] **Step 3: 구현** — `bracket-template-dialog.tsx` Edit 5곳.

① import:

찾기:

```ts
import type { BracketTemplateInput } from '@/types/api';
```

바꾸기:

```ts
import type { BracketTemplateInput } from '@/types/api';
import { DEFAULT_GROUP_KNOCKOUT_VALUE, GroupKnockoutFields, type GroupKnockoutTemplateValue } from './bracket-group-knockout-fields';
```

② props 타입:

찾기:

```ts
  format: 'knockout' | 'league';
```

바꾸기:

```ts
  format: 'knockout' | 'league' | 'group_knockout';
```

③ state:

찾기:

```ts
  const [legs, setLegs] = useState<1 | 2>(1);
```

바꾸기:

```ts
  const [legs, setLegs] = useState<1 | 2>(1);
  const [groupKnockout, setGroupKnockout] = useState<GroupKnockoutTemplateValue>(DEFAULT_GROUP_KNOCKOUT_VALUE);
```

④ 보낼 입력:

찾기:

```ts
    format === 'knockout'
      ? { kind: 'knockout', size, thirdPlace }
      : teamCountValid
        ? { kind: 'league', teamCount, legs }
        : null;
```

바꾸기:

```ts
    format === 'knockout'
      ? { kind: 'knockout', size, thirdPlace }
      : format === 'group_knockout'
        ? { kind: 'group_knockout', ...groupKnockout }
        : teamCountValid
          ? { kind: 'league', teamCount, legs }
          : null;
```

⑤ 화면 분기 — 리그 입력 앞에 조별+결선 분기를 끼운다:

찾기:

```tsx
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${idPrefix}-teams`}
```

바꾸기:

```tsx
            ) : format === 'group_knockout' ? (
              <GroupKnockoutFields value={groupKnockout} onChange={setGroupKnockout} disabled={apply.isPending} />
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${idPrefix}-teams`}
```

(서버가 거절할 조합이면 `planBracketTemplateCounts` 가 `null` 이라 기존 `canSubmit` 이 만들기 버튼을 막고 개수 줄도 숨긴다 — 별도 분기 불필요.)

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-template-dialog.test.tsx && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs
```

Expected: PASS (19건 = PR-3 13 + 새 6), tsc 0, 패턴 체크 0 위반.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 템플릿 창에 조별+결선 종류" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-template-dialog.test.tsx
git show --stat HEAD
```


## Task 18: 순위대로 채우기 창 (`BracketStandingsFillDialog`)

**Files:**
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-dialog.tsx`
- Test: `apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-dialog.test.tsx`

**Interfaces:**
- Consumes: `useV1SlotStandingsPreview`·`useV1FillSlotsFromStandings`(Task 10) · `useModalA11y`(`components/v1-ui/use-modal-a11y.ts`) · `ErrorState`(`components/v1-ui/primitives.tsx`) · `describeBracketCanvasError`(PR-3 `lib/bracket-canvas-errors.ts` — `SLOT_LOCKED`·`SLOT_TEAM_ALREADY_PLACED` 등을 해요체로 바꾼다)
- Produces: `BracketStandingsFillDialog(props: { open: boolean; tournamentId: string; teamNames: ReadonlyMap<string, string>; onClose: () => void; onFilled?: (result: V1FillSlotsFromStandingsResult) => void; onError?: (message: string) => void })` — `teamNames` 는 대진 응답 `groups[].groupTeams` 에서 만든 registrationId → 팀 이름(동률 후보·현재 배정 표시용)

동작 규칙(스펙 S4/D3):
- 창이 열릴 때 순위를 새로 읽는다. 행 = GROUP_RANK 자리 하나 · 상태 배지는 **아이콘 + 텍스트**(「순위 확정」/「동률」/「경기 진행 중」)로 색에 기대지 않는다.
- `ready`: 후보 팀을 보여 준다(현재 다른 팀이 들어 있으면 「채우면 바뀌어요」, 같으면 「이미 들어 있어요」).
- `tied`: 동률 팀 중에서 **반드시 직접 고른다**(고르기 전엔 버튼 비활성 + 이유 문장). 같은 팀을 두 자리에 고를 수 없게 이미 고른 팀은 다른 행에서 비활성(1·2위 맞바꾸기, 3팀 동률의 1·2위 선택 모두 이 규칙으로 성립).
- `group_incomplete`: 안내만, 건너뛴다.
- 바꿀 자리가 하나도 없으면 비활성(「바꿀 자리가 없어요」), 채울 수 있는 자리가 없으면 비활성.
- 전송은 동률 행의 선택만 `overrides` 로 보낸다(`ready` 는 서버가 순위로 채운다). 실패하면 해요체 안내를 창 안 알림으로 보이고(`onError` 로도 알림) **선택은 그대로 유지**한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-dialog.test.tsx
// apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-dialog.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1SlotStandingsPreview, V1SlotStandingsPreviewRow } from '@/types/bracket-standings-fill';

const { v1Get, v1Post } = vi.hoisted(() => ({ v1Get: vi.fn(), v1Post: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Get, v1Post };
});

import { V1ApiError } from '@/lib/api-client';
import { BracketStandingsFillDialog } from './bracket-standings-fill-dialog';

const row = (slotId: string, label: string, state: V1SlotStandingsPreviewRow['state'], extra: Partial<V1SlotStandingsPreviewRow> = {}): V1SlotStandingsPreviewRow => ({
  slotId, label, state, candidateRegistrationId: null, candidateTeamName: null, tiedRegistrationIds: [], currentRegistrationId: null, ...extra,
});
const ready = (slotId: string, label: string, regId: string, name: string, extra: Partial<V1SlotStandingsPreviewRow> = {}) =>
  row(slotId, label, 'ready', { candidateRegistrationId: regId, candidateTeamName: name, ...extra });
const tied = (slotId: string, label: string, ids: string[], extra: Partial<V1SlotStandingsPreviewRow> = {}) =>
  row(slotId, label, 'tied', { tiedRegistrationIds: ids, ...extra });

const TEAM_NAMES = new Map([['r-a', '가FC'], ['r-b', '나FC'], ['r-c', '다FC'], ['r-d', '라FC']]);
const MIXED: V1SlotStandingsPreview = {
  slots: [
    ready('s-a1', 'A조 1위', 'r-a', '가FC'),
    tied('s-a2', 'A조 2위', ['r-b', 'r-c']),
    row('s-b1', 'B조 1위', 'group_incomplete'),
  ],
};

function renderDialog(preview: V1SlotStandingsPreview | Error, props: { onClose?: () => void; onFilled?: () => void; onError?: (m: string) => void; open?: boolean } = {}) {
  if (preview instanceof Error) v1Get.mockRejectedValue(preview);
  else v1Get.mockResolvedValue(preview);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = props.onClose ?? vi.fn();
  render(
    <QueryClientProvider client={client}>
      <BracketStandingsFillDialog open={props.open ?? true} tournamentId="t1" teamNames={TEAM_NAMES} onClose={onClose} onFilled={props.onFilled} onError={props.onError} />
    </QueryClientProvider>,
  );
  return { onClose };
}
const submit = () => screen.getByRole('button', { name: '순위대로 채우기' });

describe('BracketStandingsFillDialog', () => {
  beforeEach(() => {
    v1Get.mockReset();
    v1Post.mockReset();
  });

  it('role=dialog 에 제목이 연결되고, 열릴 때 계약 경로로 순위를 읽는다', async () => {
    renderDialog(MIXED);
    const dialog = await screen.findByRole('dialog', { name: '순위대로 채우기' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await screen.findByText('A조 1위');
    expect(v1Get).toHaveBeenCalledWith('/admin/tournaments/t1/slots/standings-preview');
  });

  it('닫혀 있으면 아무것도 그리지 않고 순위도 읽지 않는다', () => {
    renderDialog(MIXED, { open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(v1Get).not.toHaveBeenCalled();
  });

  it('상태마다 다른 행: ready 는 후보, tied 는 직접 고르기, group_incomplete 는 안내 — 배지는 텍스트를 가진다', async () => {
    renderDialog(MIXED);
    const readyRow = (await screen.findByText('A조 1위')).closest('li')!;
    expect(within(readyRow).getByText('가FC')).toBeInTheDocument();
    expect(within(readyRow).getByText('순위 확정')).toBeInTheDocument();
    const tiedRow = screen.getByText('A조 2위').closest('li')!;
    expect(within(tiedRow).getByText('동률')).toBeInTheDocument();
    const select = within(tiedRow).getByLabelText('A조 2위 직접 고르기');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['팀 선택', '나FC', '다FC']);
    const pendingRow = screen.getByText('B조 1위').closest('li')!;
    expect(within(pendingRow).getByText('경기 진행 중')).toBeInTheDocument();
    expect(within(pendingRow).getByText(/조별 경기가 아직 안 끝났어요/)).toBeInTheDocument();
  });

  it('동률 자리를 고르기 전엔 채우기가 막히고 이유를 보여 준다 — 고르면 풀린다', async () => {
    renderDialog(MIXED);
    await screen.findByText('A조 1위');
    expect(submit()).toBeDisabled();
    expect(screen.getByText('동률인 자리는 팀을 골라야 채울 수 있어요.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('A조 2위 직접 고르기'), { target: { value: 'r-c' } });
    expect(submit()).toBeEnabled();
    expect(screen.queryByText('동률인 자리는 팀을 골라야 채울 수 있어요.')).not.toBeInTheDocument();
  });

  it('동률 행의 선택만 overrides 로 보내고, 성공하면 결과를 알리고 창을 닫는다', async () => {
    const result = { assignments: [{ slotId: 's-a1', registrationId: 'r-a' }, { slotId: 's-a2', registrationId: 'r-c' }], skipped: [{ slotId: 's-b1', reason: 'group_incomplete' }] };
    v1Post.mockResolvedValue(result);
    const onFilled = vi.fn();
    const { onClose } = renderDialog(MIXED, { onFilled });
    await screen.findByText('A조 1위');
    fireEvent.change(screen.getByLabelText('A조 2위 직접 고르기'), { target: { value: 'r-c' } });
    fireEvent.click(submit());
    await waitFor(() => expect(onFilled).toHaveBeenCalledWith(result));
    expect(v1Post).toHaveBeenCalledWith('/admin/tournaments/t1/slots/fill-from-standings', {
      overrides: [{ slotId: 's-a2', registrationId: 'r-c' }],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('동률이 없으면 빈 본문으로 보낸다 (ready 는 서버가 순위로 채운다)', async () => {
    v1Post.mockResolvedValue({ assignments: [], skipped: [] });
    renderDialog({ slots: [ready('s-a1', 'A조 1위', 'r-a', '가FC'), ready('s-b1', 'B조 1위', 'r-d', '라FC')] });
    await screen.findByText('A조 1위');
    fireEvent.click(submit());
    await waitFor(() => expect(v1Post).toHaveBeenCalled());
    expect(v1Post).toHaveBeenCalledWith('/admin/tournaments/t1/slots/fill-from-standings', {});
  });

  it('1·2위가 같은 동률이면 한 자리에서 고른 팀은 다른 자리에서 고를 수 없다 (맞바꾸기)', async () => {
    v1Post.mockResolvedValue({ assignments: [], skipped: [] });
    renderDialog({
      slots: [
        tied('s-a1', 'A조 1위', ['r-a', 'r-b'], { currentRegistrationId: 'r-a' }),
        tied('s-a2', 'A조 2위', ['r-a', 'r-b'], { currentRegistrationId: 'r-b' }),
      ],
    });
    await screen.findByText('A조 1위');
    const first = screen.getByLabelText('A조 1위 직접 고르기');
    const second = screen.getByLabelText('A조 2위 직접 고르기');
    fireEvent.change(first, { target: { value: 'r-b' } });
    expect(within(second).getByRole('option', { name: '나FC' })).toBeDisabled();
    expect(within(second).getByRole('option', { name: '가FC' })).toBeEnabled();
    fireEvent.change(second, { target: { value: 'r-a' } });
    fireEvent.click(submit());
    await waitFor(() => expect(v1Post).toHaveBeenCalled());
    expect(v1Post).toHaveBeenCalledWith('/admin/tournaments/t1/slots/fill-from-standings', {
      overrides: [{ slotId: 's-a1', registrationId: 'r-b' }, { slotId: 's-a2', registrationId: 'r-a' }],
    });
  });

  it('서버가 거절하면 해요체 안내를 창 안과 onError 로 알리고 창을 닫지 않으며 선택을 유지한다', async () => {
    v1Post.mockRejectedValue(new V1ApiError({ statusCode: 409, code: 'SLOT_LOCKED', message: '서버 원문이에요.' }));
    const onError = vi.fn();
    const { onClose } = renderDialog(MIXED, { onError });
    await screen.findByText('A조 1위');
    const select = screen.getByLabelText('A조 2위 직접 고르기');
    fireEvent.change(select, { target: { value: 'r-b' } });
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('이미 시작했거나 결과가 있는 경기라 팀을 바꿀 수 없어요.');
    expect(onError).toHaveBeenCalledWith('이미 시작했거나 결과가 있는 경기라 팀을 바꿀 수 없어요.');
    expect(onClose).not.toHaveBeenCalled();
    expect(select).toHaveValue('r-b');
    expect(submit()).toBeEnabled();
  });

  it('이미 순위대로 들어 있으면 채우기를 막는다 — 후보가 현재와 다르면 "채우면 바뀌어요"', async () => {
    renderDialog({ slots: [ready('s-a1', 'A조 1위', 'r-a', '가FC', { currentRegistrationId: 'r-a' })] });
    await screen.findByText('A조 1위');
    expect(screen.getByText('이미 들어 있어요')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    expect(screen.getByText('바꿀 자리가 없어요. 이미 순위대로 채워져 있어요.')).toBeInTheDocument();
  });

  it('후보가 현재 팀과 다르면 바뀐다는 안내와 함께 채울 수 있다', async () => {
    renderDialog({ slots: [ready('s-a1', 'A조 1위', 'r-a', '가FC', { currentRegistrationId: 'r-d' })] });
    await screen.findByText('A조 1위');
    expect(screen.getByText(/지금은 라FC.*채우면 바뀌어요/)).toBeInTheDocument();
    expect(submit()).toBeEnabled();
  });

  it('조별 경기가 하나도 안 끝났으면 채울 수 있는 자리가 없다고 알리고 막는다', async () => {
    renderDialog({ slots: [row('s-a1', 'A조 1위', 'group_incomplete'), row('s-b1', 'B조 1위', 'group_incomplete')] });
    await screen.findByText('A조 1위');
    expect(submit()).toBeDisabled();
    expect(screen.getByText('아직 채울 수 있는 자리가 없어요. 조별 경기가 모두 끝나야 해요.')).toBeInTheDocument();
  });

  it('순위를 못 읽으면 다시 시도 버튼이 있는 오류를 보이고, 다시 시도하면 행이 나타난다', async () => {
    renderDialog(new Error('network'));
    expect(await screen.findByText('순위를 불러오지 못했어요.')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    v1Get.mockResolvedValue(MIXED);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(await screen.findByText('A조 1위')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-standings-fill-dialog.test.tsx
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```tsx
// apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-dialog.tsx
// apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-dialog.tsx
'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock, X } from 'lucide-react';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1FillSlotsFromStandings, useV1SlotStandingsPreview } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import type { V1FillSlotsFromStandingsResult, V1SlotStandingsPreviewRow } from '@/types/bracket-standings-fill';

const BADGE = 'inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-soft)] px-2 py-1 text-[length:var(--font-size-caption)] font-semibold text-[var(--text-strong)]';

function StateBadge({ state }: { state: V1SlotStandingsPreviewRow['state'] }) {
  if (state === 'ready') return <span className={BADGE}><Check size={12} aria-hidden="true" />순위 확정</span>;
  if (state === 'tied') return <span className={BADGE}><AlertTriangle size={12} aria-hidden="true" />동률</span>;
  return <span className={BADGE}><Clock size={12} aria-hidden="true" />경기 진행 중</span>;
}

export function BracketStandingsFillDialog({
  open,
  tournamentId,
  teamNames,
  onClose,
  onFilled,
  onError,
}: {
  open: boolean;
  tournamentId: string;
  teamNames: ReadonlyMap<string, string>;
  onClose: () => void;
  onFilled?: (result: V1FillSlotsFromStandingsResult) => void;
  onError?: (message: string) => void;
}) {
  const titleId = useId();
  const preview = useV1SlotStandingsPreview(tournamentId, open);
  const fill = useV1FillSlotsFromStandings(tournamentId);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const pending = fill.isPending;
  const { dialogRef, onBackdropClick, mounted, closing } = useModalA11y({ open, onClose, pending });

  useEffect(() => {
    if (open) {
      setPicks({});
      setError(null);
    }
  }, [open]);

  const rows = useMemo(() => preview.data?.slots ?? [], [preview.data]);
  const tiedRows = rows.filter((r) => r.state === 'tied');
  const targetOf = (r: V1SlotStandingsPreviewRow) => picks[r.slotId] ?? (r.state === 'ready' ? r.candidateRegistrationId : null);
  const hasFillable = rows.some((r) => r.state !== 'group_incomplete');
  const unresolvedTied = tiedRows.some((r) => !picks[r.slotId]);
  const changes = rows.filter((r) => {
    const target = targetOf(r);
    return target !== null && target !== r.currentRegistrationId;
  });
  const nameOf = (registrationId: string) => teamNames.get(registrationId) ?? '이름을 알 수 없는 팀';

  let blockedReason: string | null = null;
  if (preview.isSuccess) {
    if (rows.length === 0) blockedReason = '채울 순위 자리가 없어요.';
    else if (!hasFillable) blockedReason = '아직 채울 수 있는 자리가 없어요. 조별 경기가 모두 끝나야 해요.';
    else if (unresolvedTied) blockedReason = '동률인 자리는 팀을 골라야 채울 수 있어요.';
    else if (changes.length === 0) blockedReason = '바꿀 자리가 없어요. 이미 순위대로 채워져 있어요.';
  }
  const canSubmit = preview.isSuccess && blockedReason === null && !pending;

  async function handleSubmit() {
    const overrides = tiedRows.map((r) => ({ slotId: r.slotId, registrationId: picks[r.slotId] }));
    try {
      const result = await fill.mutateAsync(overrides.length > 0 ? { overrides } : {});
      onFilled?.(result);
      onClose();
    } catch (err) {
      const message = describeBracketCanvasError(err, '순위대로 채우지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      setError(message);
      onError?.(message);
    }
  }

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 tm-modal-scrim${closing ? ' is-closing' : ''}`}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-[var(--card-surface)] tm-modal-panel${closing ? ' is-closing' : ''}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 id={titleId} className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">순위대로 채우기</h2>
          <button
            type="button"
            aria-label="닫기"
            disabled={pending}
            onClick={onClose}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {preview.isPending ? (
            <p role="status" className="text-[length:var(--font-size-body)] text-[var(--text-muted)]">순위를 불러오고 있어요…</p>
          ) : preview.isError ? (
            <ErrorState message="순위를 불러오지 못했어요." onRetry={() => void preview.refetch()} />
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((r) => {
                const selectId = `${titleId}-${r.slotId}`;
                const currentName = r.currentRegistrationId ? nameOf(r.currentRegistrationId) : null;
                return (
                  <li key={r.slotId} className="flex flex-col gap-2 rounded-xl border border-[var(--border)] px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">{r.label}</span>
                      <StateBadge state={r.state} />
                    </div>
                    {r.state === 'ready' ? (
                      <>
                        <p className="text-[length:var(--font-size-body)] text-[var(--text-strong)]">{r.candidateTeamName ?? (r.candidateRegistrationId ? nameOf(r.candidateRegistrationId) : '')}</p>
                        {r.currentRegistrationId === r.candidateRegistrationId ? (
                          <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">이미 들어 있어요</p>
                        ) : currentName ? (
                          <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">지금은 {currentName}이(가) 들어 있어요. 채우면 바뀌어요.</p>
                        ) : null}
                      </>
                    ) : null}
                    {r.state === 'tied' ? (
                      <div className="flex flex-col gap-2">
                        <label htmlFor={selectId} className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{r.label} 직접 고르기</label>
                        <select
                          id={selectId}
                          value={picks[r.slotId] ?? ''}
                          disabled={pending}
                          onChange={(e) => setPicks((prev) => {
                            const next = { ...prev };
                            if (e.target.value === '') delete next[r.slotId];
                            else next[r.slotId] = e.target.value;
                            return next;
                          })}
                          className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body)] text-[var(--text-strong)] transition-colors focus:border-[var(--blue500)] focus:outline-none disabled:opacity-50"
                        >
                          <option value="">팀 선택</option>
                          {r.tiedRegistrationIds.map((id) => (
                            <option key={id} value={id} disabled={Object.entries(picks).some(([slotId, picked]) => slotId !== r.slotId && picked === id)}>
                              {nameOf(id)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    {r.state === 'group_incomplete' ? (
                      <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">조별 경기가 아직 안 끝났어요. 모두 끝나면 채울 수 있어요.</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border)] px-5 py-4">
          {error ? (
            <p role="alert" className="rounded-xl bg-[var(--red50)] px-3 py-3 text-[length:var(--font-size-caption)] text-[var(--red700)]">{error}</p>
          ) : null}
          {blockedReason ? <p aria-live="polite" className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{blockedReason}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="h-[48px] flex-1 rounded-xl bg-[var(--surface-soft)] text-[length:var(--font-size-body)] font-semibold text-[var(--text-muted)] transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
              className={`h-[48px] flex-1 rounded-xl text-[length:var(--font-size-body)] font-semibold transition-colors ${
                canSubmit ? 'bg-blue-500 text-white hover:bg-blue-600' : 'cursor-not-allowed bg-[var(--grey100)] text-[var(--text-caption)]'
              }`}
            >
              {pending ? '채우는 중…' : '순위대로 채우기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-standings-fill-dialog.test.tsx && node scripts/v1-pattern-check.mjs
```

Expected: PASS (12건), 패턴 체크 0 위반. 변이 점검: 다른 행에서 고른 팀을 막는 `disabled={Object.entries(picks).some(…)}` 를 `false` 로 바꾸면 「맞바꾸기」 1건이, `unresolvedTied` 조건을 지우면 「고르기 전엔 막힌다」 1건이 red 여야 한다 — 확인 후 원복.

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-dialog.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-dialog.test.tsx
git commit -m "feat(v1_web): 순위대로 채우기 창 (동률은 직접 선택)" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-dialog.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-dialog.test.tsx
git show --stat HEAD
```

## Task 19: 채운 결과 문장 + 툴바 버튼 `BracketStandingsFillButton`

**Files:**
- Create: `apps/v1_web/src/lib/bracket-standings-fill-message.ts` · `apps/v1_web/src/lib/bracket-standings-fill-message.test.ts`
- Create: `apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-button.tsx` · `bracket-standings-fill-button.test.tsx`

**Interfaces:**
- Consumes: `BracketStandingsFillDialog`(Task 18)
- Produces:
  - `describeStandingsFill(result: V1FillSlotsFromStandingsResult): string` — 토스트 한 줄
  - `BracketStandingsFillButton(props: { tournamentId: string; slots: ReadonlyArray<{ kind: string }>; teamNames: ReadonlyMap<string, string>; canWrite: boolean; onFilled?: (result) => void; onError?: (message: string) => void })` — GROUP_RANK 자리가 있고 쓰기 권한이 있을 때만 그려지는 44px 버튼. `slots` 에는 어드민 대진 응답의 `slots[]` 를 그대로 넘긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// apps/v1_web/src/lib/bracket-standings-fill-message.test.ts
import { describe, expect, it } from 'vitest';
import { describeStandingsFill } from './bracket-standings-fill-message';

const assignment = (slotId: string) => ({ slotId, registrationId: `r-${slotId}` });

describe('describeStandingsFill', () => {
  it('건너뛴 자리가 없으면 채운 수만 알린다', () => {
    expect(describeStandingsFill({ assignments: [assignment('a'), assignment('b')], skipped: [] })).toBe('2개 자리를 순위대로 채웠어요.');
  });

  it('건너뛴 자리가 있으면 그 수를 덧붙인다 (동률·경기 진행 중 구분 없이 한 번에)', () => {
    expect(
      describeStandingsFill({
        assignments: [assignment('a')],
        skipped: [{ slotId: 'b', reason: 'tied' }, { slotId: 'c', reason: 'group_incomplete' }],
      }),
    ).toBe('1개 자리를 순위대로 채웠어요. 2개 자리는 건너뛰었어요.');
  });

  it('하나도 채우지 못했으면 그렇다고 알린다', () => {
    expect(describeStandingsFill({ assignments: [], skipped: [{ slotId: 'b', reason: 'tied' }] })).toBe('채울 수 있는 자리가 없었어요.');
  });
});
```

```tsx
// apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-button.test.tsx
// apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-button.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { v1Get, v1Post } = vi.hoisted(() => ({ v1Get: vi.fn(), v1Post: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Get, v1Post };
});

import { BracketStandingsFillButton } from './bracket-standings-fill-button';

function renderButton(props: { canWrite?: boolean; slots?: Array<{ kind: string }> }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BracketStandingsFillButton
        tournamentId="t1"
        slots={props.slots ?? [{ kind: 'ENTRY' }, { kind: 'GROUP_RANK' }]}
        teamNames={new Map()}
        canWrite={props.canWrite ?? true}
      />
    </QueryClientProvider>,
  );
}

describe('BracketStandingsFillButton', () => {
  beforeEach(() => {
    v1Get.mockReset();
    v1Post.mockReset();
    v1Get.mockResolvedValue({ slots: [] });
  });

  it('GROUP_RANK 자리가 있으면 보이고, 누르기 전에는 순위를 읽지 않는다', () => {
    renderButton({});
    expect(screen.getByRole('button', { name: '순위대로 채우기' })).toBeInTheDocument();
    expect(v1Get).not.toHaveBeenCalled();
  });

  it.each([
    ['GROUP_RANK 자리가 없는 대진(토너먼트·리그)', { slots: [{ kind: 'ENTRY' }, { kind: 'BYE' }] }],
    ['쓰기 권한이 없는 어드민', { canWrite: false }],
  ])('%s 에서는 그리지 않는다', (_name, props) => {
    renderButton(props);
    expect(screen.queryByRole('button', { name: '순위대로 채우기' })).not.toBeInTheDocument();
  });

  it('누르면 창이 열려 순위를 읽고, 취소하면 닫힌다', async () => {
    renderButton({});
    fireEvent.click(screen.getByRole('button', { name: '순위대로 채우기' }));
    expect(await screen.findByRole('dialog', { name: '순위대로 채우기' })).toBeInTheDocument();
    await waitFor(() => expect(v1Get).toHaveBeenCalledWith('/admin/tournaments/t1/slots/standings-preview'));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-standings-fill-message.test.ts src/components/admin/bracket-canvas/bracket-standings-fill-button.test.tsx
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// apps/v1_web/src/lib/bracket-standings-fill-message.ts
import type { V1FillSlotsFromStandingsResult } from '@/types/bracket-standings-fill';

/** 순위대로 채운 결과를 토스트 한 줄로. `assignments` 는 이미 맞게 들어 있던 자리까지 포함한 최종 배정이다. */
export function describeStandingsFill(result: V1FillSlotsFromStandingsResult): string {
  if (result.assignments.length === 0) return '채울 수 있는 자리가 없었어요.';
  const filled = `${result.assignments.length}개 자리를 순위대로 채웠어요.`;
  return result.skipped.length === 0 ? filled : `${filled} ${result.skipped.length}개 자리는 건너뛰었어요.`;
}
```

```tsx
// apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-button.tsx
// apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-button.tsx
'use client';

import { useState } from 'react';
import { ListOrdered } from 'lucide-react';
import type { V1FillSlotsFromStandingsResult } from '@/types/bracket-standings-fill';
import { BracketStandingsFillDialog } from './bracket-standings-fill-dialog';

export function BracketStandingsFillButton({
  tournamentId,
  slots,
  teamNames,
  canWrite,
  onFilled,
  onError,
}: {
  tournamentId: string;
  slots: ReadonlyArray<{ kind: string }>;
  teamNames: ReadonlyMap<string, string>;
  canWrite: boolean;
  onFilled?: (result: V1FillSlotsFromStandingsResult) => void;
  onError?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!canWrite || !slots.some((slot) => slot.kind === 'GROUP_RANK')) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-[44px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-4 text-[length:var(--font-size-body)] font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)]"
      >
        <ListOrdered size={16} aria-hidden="true" />
        순위대로 채우기
      </button>
      <BracketStandingsFillDialog
        open={open}
        tournamentId={tournamentId}
        teamNames={teamNames}
        onClose={() => setOpen(false)}
        onFilled={onFilled}
        onError={onError}
      />
    </>
  );
}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/lib/bracket-standings-fill-message.test.ts src/components/admin/bracket-canvas/bracket-standings-fill-button.test.tsx src/components/admin/bracket-canvas/bracket-standings-fill-dialog.test.tsx
```

Expected: PASS (문장 3 + 버튼 4 + 창 12).

- [ ] **Step 5: 커밋**

```bash
git add apps/v1_web/src/lib/bracket-standings-fill-message.ts apps/v1_web/src/lib/bracket-standings-fill-message.test.ts apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-button.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-button.test.tsx
git commit -m "feat(v1_web): 순위대로 채우기 툴바 버튼과 결과 문장" -- apps/v1_web/src/lib/bracket-standings-fill-message.ts apps/v1_web/src/lib/bracket-standings-fill-message.test.ts apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-button.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-standings-fill-button.test.tsx
git show --stat HEAD
```

## Task 20: 작업 영역(`BracketCanvasWorkspace`)에 연결 — 조별+결선 템플릿 시작 · 순위 채우기 버튼

PR-3 의 작업 영역은 조별+결선 대회를 "템플릿 대신 목록으로 안내"하도록 막아 두었다. 이 태스크가 그 막음을 풀고(테스트 한 건 뒤집기), 툴바에 순위 채우기 버튼을 단다.

**Files:**
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx`
- Modify: `apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx`

**Interfaces:**
- Consumes: `BracketStandingsFillButton`(Task 19) · `describeStandingsFill`(Task 19) · `BracketTemplateDialog` 의 `format: 'group_knockout'`(Task 17)
- Produces: `templateFormat` 이 `group_knockout` 도 받는다; 대진이 있으면(`!isEmpty`) 툴바에 「순위대로 채우기」(GROUP_RANK 자리가 있을 때만 보임); 채움 성공은 `describeStandingsFill` 문장, 실패는 서버 해요체 안내를 토스트로

- [ ] **Step 1: 테스트 바꾸기·추가** — `bracket-canvas-workspace.test.tsx`

① import 두 줄을 바꾼다:

찾기:

```ts
import { act, fireEvent, render, screen, within } from '@testing-library/react';
```

바꾸기:

```ts
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
```

찾기:

```ts
import type { V1AdminTournamentBracket } from '@/types/api';
```

바꾸기:

```ts
import type { V1AdminTournamentBracket } from '@/types/api';
import type { V1FillSlotsFromStandingsResult } from '@/types/bracket-standings-fill';
```

② 다른 `vi.mock` 들 옆에, `const group = makeGroup(` 바로 앞에 버튼 모의를 추가한다(버튼·창은 Task 18·19 에 각자 테스트가 있다 — 여기서는 넘겨 받는 값과 토스트 연결만 본다):

찾기:

```ts
const group = makeGroup(
```

바꾸기:

```ts
vi.mock('./bracket-standings-fill-button', () => ({
  BracketStandingsFillButton: (props: {
    tournamentId: string;
    canWrite: boolean;
    slots: unknown[];
    teamNames: ReadonlyMap<string, string>;
    onFilled: (result: V1FillSlotsFromStandingsResult) => void;
    onError: (message: string) => void;
  }) => (
    <div
      data-testid="fill-button"
      data-tournament={props.tournamentId}
      data-can-write={String(props.canWrite)}
      data-slots={props.slots.length}
      data-team-names={JSON.stringify([...props.teamNames])}
    >
      <button type="button" onClick={() => props.onFilled({ assignments: [{ slotId: 's1', registrationId: 'r1' }], skipped: [{ slotId: 's2', reason: 'tied' }] })}>
        채움 성공
      </button>
      <button type="button" onClick={() => props.onError('이미 시작했어요.')}>채움 실패</button>
    </div>
  ),
}));

const group = makeGroup(
```

③ 「조별+결선 방식 대회는 템플릿 대신 목록으로 안내한다」 `it` 한 건을 아래 두 건으로 교체한다:

찾기:

```ts
  it('조별+결선 방식 대회는 템플릿 대신 목록으로 안내한다(대화상자를 열지 않는다)', () => {
    setBracket(makeBracket());
    const props = renderWorkspace({ format: 'group_knockout' });
    expect(screen.queryByRole('button', { name: '템플릿으로 시작' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '목록으로 보기' }));
    expect(props.onShowList).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('template-dialog')).not.toBeInTheDocument();
  });
```

바꾸기:

```ts
  it('조별+결선 방식 대회도 템플릿으로 시작한다 — 대화상자가 group_knockout 형식으로 열린다', () => {
    setBracket(makeBracket());
    renderWorkspace({ format: 'group_knockout' });
    fireEvent.click(screen.getByRole('button', { name: '템플릿으로 시작' }));
    expect(screen.getByTestId('template-dialog')).toHaveAttribute('data-format', 'group_knockout');
  });

  it('형식을 알 수 없는 대회는 템플릿 대신 목록으로 안내한다(대화상자를 열지 않는다)', () => {
    setBracket(makeBracket());
    const props = renderWorkspace({ format: undefined });
    expect(screen.queryByRole('button', { name: '템플릿으로 시작' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '목록으로 보기' }));
    expect(props.onShowList).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('template-dialog')).not.toBeInTheDocument();
  });
```

④ 파일 끝에 추가:

```tsx
describe('BracketCanvasWorkspace — 조별+결선 순위 채우기', () => {
  const stageGroup = makeGroup({
    id: 'gA',
    name: 'A조',
    phase: 'group',
    groupTeams: [
      { id: 'gt1', groupId: 'gA', registrationId: 'r1', teamName: '서울FC', sortOrder: 0, createdAt: '2026-10-08T00:00:00.000Z' },
      // 부전승 자리는 팀 이름이 없다 — 이름 표에 들어가면 안 된다.
      { id: 'gt2', groupId: 'gA', registrationId: null, teamName: null, sortOrder: 1, createdAt: '2026-10-08T00:00:00.000Z', isBye: true },
    ],
  });
  const withRanks = makeBracket({
    groups: [stageGroup, group],
    slots: [...slots, makeSlot({ id: 'rank1', kind: 'GROUP_RANK', label: 'A조 1위', sourceGroupId: 'gA' })],
    fixtures: populated.fixtures,
  });

  it('순위 채우기 버튼에 대회·자리·권한·조 편성 팀 이름 표를 넘긴다', () => {
    setBracket(withRanks);
    renderWorkspace({ format: 'group_knockout' });
    const button = screen.getByTestId('fill-button');
    expect(button).toHaveAttribute('data-tournament', 't-1');
    expect(button).toHaveAttribute('data-can-write', 'true');
    expect(button).toHaveAttribute('data-slots', '5');
    expect(JSON.parse(button.getAttribute('data-team-names')!)).toEqual([['r1', '서울FC']]);
  });

  it('채우기가 끝나면 채운 수를, 실패하면 이유를 토스트로 알린다', () => {
    setBracket(withRanks);
    const props = renderWorkspace({ format: 'group_knockout' });
    fireEvent.click(screen.getByRole('button', { name: '채움 성공' }));
    expect(props.showToast).toHaveBeenCalledWith('1개 자리를 순위대로 채웠어요. 1개 자리는 건너뛰었어요.', 'success');
    fireEvent.click(screen.getByRole('button', { name: '채움 실패' }));
    expect(props.showToast).toHaveBeenCalledWith('이미 시작했어요.', 'error');
  });

  it('빈 대진과 읽기 전용 화면에는 순위 채우기 버튼을 두지 않는다', () => {
    setBracket(makeBracket());
    renderWorkspace({ format: 'group_knockout' });
    expect(screen.queryByTestId('fill-button')).not.toBeInTheDocument();
    cleanup();
    setBracket(withRanks);
    renderWorkspace({ format: 'group_knockout', canWrite: false });
    expect(screen.queryByTestId('fill-button')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실행 — 실패 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx
```

Expected: FAIL — 조별+결선이 아직 목록 안내로 막혀 있고 순위 채우기 버튼이 없다(PR-3 기존 케이스는 PASS).

- [ ] **Step 3: 구현** — `bracket-canvas-workspace.tsx` Edit 4곳.

① import:

찾기:

```ts
import { buildSideLabelContext, fixtureSideLabel } from '@/lib/bracket-canvas-layout';
```

바꾸기:

```ts
import { buildSideLabelContext, fixtureSideLabel } from '@/lib/bracket-canvas-layout';
import { describeStandingsFill } from '@/lib/bracket-standings-fill-message';
```

찾기:

```ts
import { BracketNodePanel } from './bracket-node-panel';
```

바꾸기:

```ts
import { BracketNodePanel } from './bracket-node-panel';
import { BracketStandingsFillButton } from './bracket-standings-fill-button';
```

② 조 편성 팀 이름 표 — 훅 호출 구역의 `labelContext` 메모 바로 아래(**조기 return 보다 위**)에 추가:

찾기:

```ts
    [bracket],
  );

  if (isPending) {
```

바꾸기:

```ts
    [bracket],
  );
  // 순위 채우기 창이 동률 후보 이름을 그리는 데 쓴다 — 동률 팀은 모두 그 조의 조 편성에 들어 있다.
  const teamNames = useMemo(
    () =>
      new Map(
        (bracket?.groups ?? []).flatMap((group) =>
          group.groupTeams.flatMap((team) => (team.registrationId && team.teamName ? [[team.registrationId, team.teamName] as const] : [])),
        ),
      ),
    [bracket],
  );

  if (isPending) {
```

③ 템플릿 형식:

찾기:

```ts
const templateFormat = format === 'knockout' || format === 'league' ? format : null;
```

바꾸기:

```ts
const templateFormat = format === 'knockout' || format === 'league' || format === 'group_knockout' ? format : null;
```

④ 툴바 — 「빈 자리 무작위 채우기」 버튼 블록 바로 아래:

찾기:

```tsx
                <Shuffle size={16} aria-hidden="true" />
                빈 자리 무작위 채우기
              </Button>
            ) : null}
```

바꾸기:

```tsx
                <Shuffle size={16} aria-hidden="true" />
                빈 자리 무작위 채우기
              </Button>
            ) : null}
            {!isEmpty ? (
              <BracketStandingsFillButton
                tournamentId={tournamentId}
                slots={bracket.slots}
                teamNames={teamNames}
                canWrite={canWrite}
                onFilled={(result) => showToast(describeStandingsFill(result), 'success')}
                onError={(message) => showToast(message, 'error')}
              />
            ) : null}
```

- [ ] **Step 4: 실행 — 통과 확인**

```bash
cd apps/v1_web && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs
```

Expected: `bracket-canvas/` 아래 전부 PASS (작업 영역 22건 = PR-3 18건 + 뒤집은 1건이 2건이 된 +1 + 새 3건), tsc 0, 패턴 체크 0 위반.

- [ ] **Step 5: 커밋**

```bash
git commit -m "feat(v1_web): 작업 영역에 조별+결선 템플릿 시작과 순위 채우기 버튼" -- apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.tsx apps/v1_web/src/components/admin/bracket-canvas/bracket-canvas-workspace.test.tsx
git show --stat HEAD
```


## Task 21: 마감 검증 · PR 본문 · alpha 확인

**Files:** 코드 변경 없음(검증과 PR 절차). 모든 실행은 PR 단위 최소 범위 — 풀스위트는 돌리지 않는다.

- [ ] **Step 1: 타입·린트·영향 테스트** (격리 생성 client 로 tsc — 색인 Global Constraints)

```bash
cd apps/v1_api && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-surface-check.mjs \
  && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/templates src/tournaments/slots src/tournaments/tournament-campaigns.controller.spec.ts
cd ../v1_web && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && node scripts/v1-pattern-check.mjs \
  && ./node_modules/.bin/vitest run src/components/admin/bracket-canvas src/lib/bracket-canvas-layout.test.ts src/lib/bracket-canvas-group-layout.test.ts src/lib/bracket-template-counts.test.ts src/lib/bracket-standings-fill-message.test.ts src/hooks/use-v1-bracket-canvas
```

Expected: 전부 0 에러·PASS. 통합 스펙(`test/tournaments/bracket-template.integration-spec.ts`·`group-rank-standings.integration-spec.ts`)은 `DATABASE_URL` 이 있는 CI 에서 돈다 — 로컬 DB 가 없으면 푸시 후 CI 결과로 확인한다.

- [ ] **Step 2: 커밋본 기준 점검** — 로컬 green 은 미커밋 트리를 본다. 커밋된 상태에서 새 파일이 전부 추적되는지 확인한다.

```bash
git status --porcelain | grep -E "group-rank|group-knockout|bracket-group|bracket-standings|load-group-rank|fill-from-standings|bracket-canvas-group-layout" ; echo "위 출력이 비어 있어야 한다(미추적·미커밋 없음)"
git diff --stat origin/dev...HEAD | tail -5
```

- [ ] **Step 3: PR 생성(한국어 본문)** — base 는 `dev`. 생성 직후 URL 에서 번호를 파싱해 `gh pr view <N> --repo kim-song-jun/matchup-sports-platform --json baseRefName` 이 `dev` 인지 확인한 뒤 Copilot 리뷰를 요청한다(`gh pr edit <N> --add-reviewer copilot-pull-request-reviewer --repo kim-song-jun/matchup-sports-platform`). 본문에 "UI 갤러리는 머지 후 alpha 에서 찍어 이 PR 에 게시한다" 이유를 남긴다. 머지는 dev 까지만 한다 — `main` 승격은 사용자만 한다.

- [ ] **Step 4: 머지 후 확인 — 배포 SHA 확인 (UI PR: 3·4·5b·6 에 해당)** — 머지는 `dev` 까지만 한다. 배포 창(502)에서 측정하면 멀쩡한 화면을 결함으로 오진하므로 측정 전에 아래를 먼저 본다.

```bash
M=<내 머지 커밋 SHA>   # gh pr view <N> --repo kim-song-jun/matchup-sports-platform --json mergeCommit
gh run list --workflow deploy-alpha.yml --branch dev --limit 1 --repo kim-song-jun/matchup-sports-platform --json headSha,status,conclusion --jq '.[0]'
curl -fsSI https://alpha.teameet.co.kr/landing | grep -i 'x-teameet-\(release\|commit\)'
curl -fsS https://alpha.teameet.co.kr/api/v1/health   # .data.checks.db === true
git merge-base --is-ancestor "$M" <x-teameet-commit 값> && echo "포함됨"
```

`x-teameet-commit` 이 내 머지 커밋 **이후**일 때만 내 변경을 보는 것이다(직전 배포 run 이 `cancelled` 면 서빙 SHA 는 마지막 성공 배포의 것). 배포 job 이 `in_progress` 인 동안은 측정하지 않는다.

- [ ] **Step 5: 읽기 전용 스모크 (승인 불필요)** — 로그인 쿠키는 저장소 밖 메모리의 alpha 계정으로 `login` API 에서 받는다(헤더 dev 인증은 alpha 에서 401). 기존 조별+결선 대회가 있으면 `GET /api/v1/admin/tournaments/<id>/slots/standings-preview` 가 계약 모양(`slots[].state ∈ ready|tied|group_incomplete`)으로 200 인지, 공개 대진표 응답에 `homeSlotLabel`·`awaySlotLabel` 이 있는지만 본다. 쓰기 없음.

- [ ] **Step 6: alpha 쓰기 E2E — 사용자 승인 후에만** — 새 테스트 대회·팀 배정·결과 입력은 alpha 데이터를 만들고 **결과가 있는 경기·대진은 지울 수 없다**(삭제 409). 시작하기 전에 "새 조별+결선 테스트 대회 하나와 그 안의 경기 결과가 alpha 에 영구히 남는다"를 사용자에게 알리고 **명시적 승인(승인은 위임·전달되지 않는다)** 을 받는다. 승인이 없으면 이 Step 에서 멈추고 Step 5 까지의 결과와 "쓰기 검증 대기" 를 PR 에 적는다.

승인 후 `ego-browser` 스킬로(Playwright 아님) **새 대회**(형식 = 조별+결선)를 만들어 다음을 밟고 단계별 스크린샷·console/network 를 남긴다. 클릭 헬퍼는 위험 버튼 denylist 를 쓰되 이 시나리오가 의도적으로 누르는 「템플릿 만들기」·「순위대로 채우기」·「채우기」·결과 입력 확정만 예외로 허용한다.
① 대진 관리 [그림] → 템플릿 「조별+결선」 2조 x 4팀(2팀 진출) 만들기 → 조별 열 2개 + 「조 편성」 열(블록 2개) + 4강/결승 + 점선 4개
② 참가팀 8개를 조 편성 블록 자리에 넣기(고른 팀 누르기·끌어 놓기 각각 한 번, 한 자리가 그 팀의 조별 3경기 칸에 모두 들어가는지)
③ 조별 결과를 빠른 입력(PR-2)으로 넣다가 중간에 「순위대로 채우기」 → 일부 「경기 진행 중」
④ 전부 입력한 뒤 「순위 확정」 행으로 채우기 → 4강 칸에 팀 이름
⑤ 1·2위 동률 점수를 만들어 「동률」 행에서 직접 선택 → 채우기(맞바꾸기 한 번 포함). 동률 팀 밖의 팀은 고를 수 없는지 확인
⑥ 4강 시작 전 다시 채우기 가능, 시작한 뒤엔 해요체 안내
⑦ 공개 대진표에 조별 진행 중 "A조 1위", 채운 뒤 팀 이름
끝나면 별도 헤레독에서 `await task.finish({ keep: [] })` 로 ego 워크스페이스를 닫는다(다른 세션의 ego 는 건드리지 않는다).

- [ ] **Step 7: 3폭 갤러리를 이 PR 에 게시** — 화면 변경 PR 은 예외 없이 📱390 / 📲768 / 🖥1440 갤러리가 필요하다. 로컬 next 로 렌더하지 않으므로 Step 6 의 alpha 화면에서 찍는다(캡처 스크립트가 필요하면 `scripts/` 안에, 한 번에 과하게 찍지 않는다 — alpha 가 과한 캡처에 403 을 건다). 대상: 조 편성 열 + 점선이 보이는 캔버스, 순위 채우기 창(ready·tied·group_incomplete 행), 템플릿 창의 조별+결선 입력. 갤러리 PNG 는 PR 트리에 커밋하지 않고(300 파일 한도), 별도 커밋 SHA 고정 raw URL(`raw.githubusercontent.com/kim-song-jun/matchup-sports-platform/<SHA>/...`)이 200 인지 확인한 뒤 페이지별 3열로 PR 코멘트에 게시한다. 이 저장소는 PUBLIC 이므로 코멘트에 프로덕션 식별자·계정·비밀번호·토큰을 쓰지 않는다. Step 6 이 승인 대기라면 갤러리도 그 뒤에 같은 PR 에 사후 게시한다(PR 본문의 "머지 후에 채우는 이유" 와 일치).

## Self-Review

스펙 항목 → 이 계획의 태스크.

| 스펙 / 테스트 시나리오 | 태스크 |
|---|---|
| S2 group_knockout 템플릿: 조 A.., ENTRY 자리, 라운드로빈 `league_r{n}` + legs, advanceCount | 2, 3 |
| S2 교차 대진 표 6종(2x1·2x2·4x1·4x2·8x1·8x2→16강) 전수, GROUP_RANK 자리 ↔ 결선 사이드 | 1, 2, 3(통합), 12(웹 연결선 6종) |
| S2 결선 크기 ∉ {2,4,8,16} → 422 `BRACKET_TEMPLATE_UNSUPPORTED`, K=2 + 3·4위전 → 422 | 1, 2, 3, 15(미리보기 null), 16(사전 안내) |
| S2 상한 240 → 422 `BRACKET_TEMPLATE_TOO_LARGE` (8조 x 6팀 x 2회전 + 16강 = 256 포함, 8조 x 4팀 x 1회전 = 63 통과) | 3(공개 진입점·통합), 15, 17(웹 차단) |
| S2 kind ↔ format 불일치 422 | PR-1b executor 확인(Task 0), 20(작업 영역이 대회 자기 형식만 넘김) |
| Test 개수 계약: 2x4·adv2·legs1 = 조별 12 + 4강 2 + 결승 1 (+3위 1), ENTRY 8, GROUP_RANK 4 | 2, 3(단위·통합), 15 |
| S2 결선 연결: WINNER 연결, 3·4위전 4강 LOSER | 2 |
| S4 미리보기 `ready`/`tied`/`group_incomplete`(비취소 경기 전부 OFFICIAL, `V1TournamentStanding`) | 4, 5, 9 |
| S4 완전 동률 구간 감지(정본 §5 `league-tie-break.ts`) — 1·2위 동률·3팀 동률 | 4 (대조: 구간 밖은 ready) |
| S4 override 범위: tied 자리 = 동률 팀만, ready 자리 = 원천 조 팀만, 그 밖(group_incomplete 포함) 422 `SLOT_REGISTRATION_INVALID`; 저장 순위 ≠ §5 → `tied` | 4(어긋남 → tied), 6(범위 4케이스 + 중복·404), 7(잘못된 override 는 쓰기 전 거절), 9 |
| S4 조 편성·순위 재계산 이름(`ensureGroupPhaseTeamsInTx`·`recalculateStandingsInTx`·`releaseUnusedGroupTeamsInTx`, `tournament-bracket-tx.ts`) | 0(존재·옛 이름 0건 확인; PR-4 는 읽기 전용이라 호출하지 않음), 9 |
| S4 채우기: override, 비우고 넣기(맞바꾸기 유일 제약), 시작 전 다시 채우기, tied+override 없으면 건너뜀 | 6, 7 (+ PR-1b `assignSlotsBatchInTx` 통합 스펙) |
| S4 `@ArrayMaxSize`(16), uuid 검증 | 8 |
| S3 규칙 재사용(`SLOT_LOCKED`·`SLOT_TEAM_ALREADY_PLACED` 등은 `assignSlotsBatchInTx` 가 던짐) + 레인 잠금 + 감사 로그 | 7 |
| 라우트 `GET …/slots/standings-preview`, `POST …/slots/fill-from-standings`, 권한(support 는 미리보기만) | 7, 8, 9 |
| Test: swap A1<->A2 에서 유일 제약 위반 없음 | 6(계획이 두 자리 모두 writes), 7(한 번의 배치로 전달), PR-1b 배치 통합 스펙, 18(UI 맞바꾸기) |
| Test: 완전 동률(1·2위, 3팀) → `tied` | 4 |
| docs/api + changeset | 8 |
| S7 캔버스 조 표(ENTRY 자리 블록) + 점선 GROUP_RANK 연결선 (`bracket-canvas-layout`) | 11, 12, 13, 14 |
| S7 템플릿 창 group_knockout 필드 | 15, 16, 17 |
| S7 `bracket-standings-fill-dialog.tsx`: ready/tied/group_incomplete 행, tied 는 선택 필수 | 18 |
| S7 훅 `useV1SlotStandingsPreview`·`useV1FillSlotsFromStandings` + 캐시 무효화 | 10 |
| S7 권한 `canWrite=false` 읽기 전용(채우기 버튼 숨김·조 자리 배정 불가) | 13, 14, 19, 20 |
| S7 접근성: 44px, aria-label, aria-pressed, 모달 a11y(`useModalA11y`), 색 + 텍스트/아이콘, 점선(모양) | 13, 14, 16, 18 |
| Scenario 3(조별리그 + 결선) 전체 흐름의 alpha 확인 — 머지 후 확인(배포 SHA → 읽기 스모크 → 승인 후 쓰기 E2E → 3폭 갤러리) | 21 |

스펙 S4(2026-10-09 확정)가 정한 것을 그대로 구현한 곳: override 허용 범위(Task 6 — tied 자리는 동률 팀만·ready 자리는 원천 조 팀만·그 밖 422), 저장 순위와 §5 가 어긋날 때 `tied`(Task 4). 이 계획이 정한 해석(스펙이 비워 둔 곳): 순위표가 낡았으면 `group_incomplete`(Task 4), 이 대회의 순위 자리가 아닌 slotId 는 404(Task 6), 조 편성 블록을 마지막 조별 열과 결선 첫 열 사이에 두는 배치(Task 12 — 긴 순위선이 다른 열을 가로지르지 않게). 결선 경기 번호·그룹 순서(…→4강→결승→3·4위전)와 라벨 표는 PR-1b/1c 가 정한 것을 그대로 쓴다(Task 2·3).

알려진 한계: PR-3 의 칸이 잠금을 경기 단위로 판정해 조별 자리 공유 경기에서는 서버 409 가 마지막 방어선이다(Task 14 끝). 순위 `ready`/`tied` 의 end-to-end(실제 OFFICIAL 결과 → 순위 → 채우기)는 DB 에 결과를 손으로 심을 수 없어 통합 스펙이 아니라 단위(실제 순위 계산) + alpha 확인(Task 21)이 맡는다.

미해결(착수 전 확인이 필요한 것): PR-1a/1b/2/3 코드가 작성 시점에 없어 Task 0 의 확인 명령이 계획 문서의 심볼을 대신 검증한다. 선행 구현이 계획과 달라졌으면 해당 Edit 의 찾기 문자열만 실제 코드에 맞춘다.
