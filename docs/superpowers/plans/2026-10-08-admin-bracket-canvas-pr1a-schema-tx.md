# 어드민 대진 그림 편집기 PR-1a — 정본 기록 · 스키마 · 트랜잭션 추출 · 응답 확장

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대진 자리(slot) 스키마를 깔고(같은 스키마 변경·같은 마이그레이션에 16강 단계 enum 값 `round16` 도 함께 넣는다 — 스펙 S1-b, 색인 "16강"), 대진 변경 서비스의 내장 트랜잭션을 `…InTx` 함수로 분리해(동작 보존) 이후 PR(자리 서비스·템플릿)이 한 트랜잭션에 여러 변경을 묶을 수 있게 하며, 어드민 대진 응답과 공개 경기 직렬화에 자리 정보를 싣는다.

**Architecture:** `V1TournamentSlot` 표와 `V1TeamMatch.homeSlotId/awaySlotId` 를 additive 마이그레이션으로 추가한다. `tournament-bracket.service.ts` 의 그룹 생성·경기 수정(사이드 배정)·경기 삭제·그룹 삭제 본문을 새 파일 `tournament-bracket-tx.ts` 의 함수로 옮기고 서비스는 그 함수를 호출만 한다. 어드민 `getBracket` 은 `slots[]`·경기별 `homeSlotId/awaySlotId/game` 을, 공개 상세는 `homeSlotLabel/awaySlotLabel` 을 추가로 내려준다. 이 PR 에는 새 엔드포인트가 없다.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL 16, Jest 30(ts-jest), `prisma migrate diff`(오프라인 스키마 비교).

**Spec:** `.github/tasks/20261057-admin-bracket-canvas.md` (S1·S2 의 추출 전제·S5 마지막 항목·S4 공개 라벨·PR-1 첫 두 항목) · 색인/공유 계약 `docs/superpowers/plans/2026-10-08-admin-bracket-canvas-index.md`

**사전 검증(계획 작성 시):** 이 계획의 `old_string`/`new_string`·코드·테스트를 `HEAD` 사본에 순서대로 그대로 적용해 확인했다 — 모든 편집이 한 번씩만 매치됨, 영향 스펙 6개 195 테스트 통과(대진 서비스 스펙은 Task 별로 95 → 98 → 104 → 107 → 115 → 120 → 123), 격리 `tsc` 0 오류, `v1-surface-check` 통과, 빈 Postgres 16 에서 마이그레이션 체인 재생 + `prisma migrate diff --exit-code` 드리프트 0, 통합 스펙 10개 통과. 본문의 기대 숫자가 다르면 어느 Task 에서 빠진 것인지 바로 알 수 있다.

## 계약 이탈

계약 이름·경로·시그니처는 그대로 쓴다. 코드 사정으로 **더해지는 것**만 적는다(기존 계약을 바꾸는 항목은 없다).

1. **`writeAdminActionLog` 신설(`apps/v1_api/src/common/admin-context.service.ts`).** 계약의 `createGroupInTx(tx, admin, …)`·`softDeleteTournamentFixtureInTx(tx, admin, …)`·`deleteTournamentGroupInTx(tx, admin, …)` 는 `deps` 가 없는데, 감사 로그는 인스턴스 메서드 `AdminContextService.logAdminAction`(`admin-context.service.ts:59`)뿐이라 `…InTx` 함수가 부를 수 없다. 메서드 본문을 `export async function writeAdminActionLog(client, admin, input)` 로 옮기고 메서드는 그것을 호출만 한다(Task 3). 시그니처 변화 없음, 기존 spec 의 `v1AdminActionLog.create` 단언도 그대로 통과한다.
2. **`assignTournamentFixtureSideInTx` 의 `deps` 인자.** 계약대로 `(tx, deps, admin, input)` 를 유지하지만 이 함수는 `deps` 를 쓰지 않는다(사이드 배정에 `GamesService` 가 필요 없음). `BracketTxDeps` 를 `createEmptyTournamentFixtureInTx` 와 공유하는 자리표시이며, 호출부 시그니처를 계약과 맞추려는 의도적 선택이다.
3. **계약 함수 외에 export 되는 보조 함수**(모두 `tournament-bracket-tx.ts`): `recalculateStandingsInTx`, `ensureGroupPhaseTeamsInTx`(서비스의 private 메서드를 옮김 — 사이드 배정이 쓰므로 필요), `updateTournamentFixtureInTx`(일정·장소·번호·두 사이드를 한 번에 바꾸는 일반형 — `updateFixture` 가 쓰고 `assignTournamentFixtureSideInTx` 는 그 얇은 래퍼), `assertSidesNotSlotLinked`(순수 가드).
4. **`createGroupInTx` 반환값.** 계약은 `Promise<{ id: string }>` 이지만 서비스가 응답 직렬화에 전체 행이 필요해 `Promise<V1TournamentGroup>` 를 돌려준다(`{ id }` 의 상위 집합이라 호출부 호환).
5. **새 에러 코드 `GROUP_HAS_SLOTS`(409).** 자리가 남은 조를 지우면 FK(Restrict)가 500 을 내므로 `deleteGroup` 이 미리 막는다(Task 10). 코드 표(색인)에 없는 추가분이다.
6. **`V1TournamentGroupPhase` 에 `round16` 값 추가(스펙 S1-b).** 스키마 변경은 PR-1a 에서 한 번만 하므로(색인 웨이브 표) 자리 스키마와 같은 `schema.prisma` 편집·같은 마이그레이션(`20261009090000_v1_tournament_slots`)에 넣는다. **enum 값만 추가한다 — 16강 업무 규칙(DTO `TOURNAMENT_GROUP_PHASES`, 인접 규칙, 라벨 `tournament-round-label.ts`, 템플릿, 웹)은 PR-1c 소관이라 이 PR 에서 건드리지 않는다.** 그래서 DB 는 `round16` 을 받지만 API DTO 는 아직 거부한다(1c 가 열 때까지 의도된 상태).

## 1a 가 export 하는 이름 (색인 보충 계약 — 1b·4·5a 는 import 만 한다)

| 이름 | 파일 | Task | 비고 |
|---|---|---|---|
| `writeAdminActionLog(client, admin, input)` | `common/admin-context.service.ts` | 3 | `logAdminAction` 은 이것에 위임 |
| `createGroupInTx(tx, admin, tournamentId, input)` → **`V1TournamentGroup` 전체 행** | `tournaments/tournament-bracket-tx.ts` | 6 | 색인 `{ id }` 의 상위 집합 |
| `recalculateStandingsInTx(tx, tournamentId)` · `ensureGroupPhaseTeamsInTx(tx, admin, tournamentId, groupId, groupPhase, registrationIds)` | 같은 파일 | 6 | 서비스 private 메서드를 옮김 — 1b·4 가 따로 추출하지 않는다 |
| `updateTournamentFixtureInTx(tx, admin, input)` · `assignTournamentFixtureSideInTx(tx, deps, admin, input)` | 같은 파일 | 7 | 후자는 전자의 얇은 래퍼 |
| `assertSidesNotSlotLinked(current, change)` (순수) | 같은 파일 | 8 | `updateFixture` 서비스 메서드에만 건다 — `assign…SideInTx` 는 타지 않는다 |
| `softDeleteTournamentFixtureInTx` · `deleteTournamentGroupInTx` · `createEmptyTournamentFixtureInTx` | 같은 파일 | 9 · 10 · 11 | |
| 에러 코드 `GROUP_HAS_SLOTS`(409) | `deleteTournamentGroupInTx` | 10 | 색인 에러 표에 등재됨 |
| `serializeAdminBracketSlot` · `serializeAdminBracketGame` · `adminBracketSlotInclude` | `tournaments/slots/admin-bracket-view.ts` | 12 | 5a 리그 어드민 응답도 이것을 import |
| 공개 상세 `fixtures[]` 와 공개 일정 `items[]`·`unscheduled[]`(웹 타입명 `PublicScheduleEntry`)의 `homeSlotLabel`/`awaySlotLabel: string \| null` | `tournament-detail.presenter.ts`, `games/public-records/public-tournament-records.service.ts` | 13 | 웹 소비는 PR-3 |

Task 14 Step 4 가 이 표의 export 가 실제 코드에 있는지 grep 으로 대조한다.

## Global Constraints

색인 `2026-10-08-admin-bracket-canvas-index.md` 의 **Global Constraints 와 공유 계약이 전부 적용된다.** 이 PR 에 특화된 것만 더한다.

- **로컬 Prisma 클라이언트에는 `V1TournamentSlot` 이 없다.** 공유 `node_modules` 의 클라이언트는 옛 스키마로 생성돼 있고 `prisma generate` 는 금지다. 그래서 새 타입·enum 을 쓰는 스펙은 **Task 2 에서 만드는 격리 하네스**(`$ISO/jest.iso.config.cjs`, `$ISO/tsconfig.isocheck.json`)로 돌린다. 하네스 없이 `jest` 를 바로 돌리면 ts-jest 진단이 `V1TournamentSlot…` 에서 깨진다 — 코드 결함이 아니다. Task 3 부터의 모든 `jest`/`tsc` 명령은 하네스 형태를 쓴다.
- **`V1TournamentSlotKind` 는 `type` import 와 문자열 리터럴(`'ENTRY'`)로만 쓴다.** enum 객체(값)를 import 하지 않는다 — 하네스 밖(공유 `node_modules` 의 옛 클라이언트)에서 모듈을 불러도 `undefined` 참조로 깨지지 않게 하려는 것이다.
- 감사(audit) action 문자열과 `v1AdminActionLog.create` 호출 모양은 옮기기 전과 **바이트 단위로 같아야 한다** — 기존 spec 이 `action: 'tournament.bracket.group.create'` 등을 단언한다.
- `v1_tournaments` raw SQL 은 `tournament-bracket.service.ts` 의 `deleteFixture` 한 곳에만 남긴다(`scripts/tournament-raw-sql-baseline.json` 이 이 파일 1곳을 허용). `…InTx` 파일에 `v1_tournaments` 를 raw 로 쓰지 않는다 — 쓰면 `node scripts/v1-surface-check.mjs` 가 빨갛다.
- 대진 변경 `…InTx` 함수는 **호출자가 `league-fixture-generation:{tournamentId}` advisory lock 을 이미 잡았다고 가정한다**(함수 안에서 잡지 않는다). 서비스 메서드가 락을 잡고 호출한다.
- **새 파일을 만드는 Task 의 커밋은 `git add <새 파일들>` 을 먼저 한다**(pathspec 커밋은 추적 중이 아닌 파일을 모른다). 디렉터리·`-A` 는 쓰지 않는다 — 워크트리의 `node_modules` 심링크가 딸려 들어간다.
- 이 PR 은 사용자에게 보이는 화면을 바꾸지 않는다(웹 변경 없음) — UI 3안 브레인스토밍·갤러리 대상 아님.

### 셸 변수 — 블록마다 첫 두 줄로 다시 정의한다

Bash 호출 사이에는 셸 상태(`export`·`cd`)가 이어지지 않는다. 그래서 `$WT`·`$ISO` 를 쓰는 **모든 bash 블록은 아래 두 줄로 시작한다**(이미 각 블록 맨 위에 있다 — 블록을 따로 떼어 실행해도 그대로 돈다). `ISO` 는 저장소 밖 고정 경로이고 Task 2 에서 채운다. 블록 안에서는 `cd` 도 그 블록 안에서만 유효하므로 각 블록이 필요한 `cd` 를 직접 한다.

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
```

## File Structure

| 파일 | 구분 | 책임 |
|---|---|---|
| `docs/design/competition-canonical-flow.md` | Modify | §6 결정 이력에 4행(자리·템플릿 / 리그 빈 경기 / 어드민 빠른 결과 / 킥 수 면제) |
| `apps/v1_api/prisma/schema.prisma` | Modify | `V1TournamentSlotKind`·`V1TournamentSlot`, `V1TeamMatch.homeSlotId/awaySlotId` + 역관계, `V1TournamentGroupPhase.round16` |
| `apps/v1_api/prisma/migrations/20261009090000_v1_tournament_slots/migration.sql` | Create | additive 마이그레이션(`ALTER TYPE … ADD VALUE 'round16'`·enum·표·nullable 컬럼 2·FK·인덱스) |
| `deploy/Dockerfile.v1-api` · `deploy/alpha-manifest-common.sh` · `scripts/release/create-alpha-release-manifest.sh` · `scripts/release/prepare-task168-final-steady-inputs.sh` · `apps/v1_api/test/fixtures/game-schema.fixture.ts` | Modify | 스키마 해시 5곳 재고정(alpha-manifest 는 허용 목록에 추가) |
| `apps/v1_api/src/common/admin-context.service.ts` (+`.spec.ts`) | Modify | `writeAdminActionLog` 함수 추출(메서드는 위임) |
| `apps/v1_api/src/tournaments/slots/tournament-slot-label.ts` (+`.spec.ts`) | Create | 자리 라벨 순수 함수 + 공개/어드민 공용 select 모양 |
| `apps/v1_api/src/tournament-operations/results/quick-result.constants.ts` (+`.spec.ts`) | Create | 빠른 결과 reason 마커와 리비전 입력 방식 판정 |
| `apps/v1_api/src/tournaments/tournament-bracket-tx.ts` | Create | 그룹 생성·경기 수정/사이드 배정·빈 경기 생성·경기 소프트 삭제·그룹 삭제의 `…InTx` 함수와 순위 재계산·조 편성 보조 |
| `apps/v1_api/src/tournaments/tournament-bracket.service.ts` (+`.spec.ts`) | Modify | 위 함수를 호출하도록 배선, `SLOT_LINKED` 가드, `getBracket` 확장 |
| `apps/v1_api/src/tournaments/tournament-match-creation.ts` | Modify | `homeSlotId`/`awaySlotId` 를 받아 `V1TeamMatch` 에 저장 |
| `apps/v1_api/src/tournaments/slots/admin-bracket-view.ts` (+`.spec.ts`) | Create | 어드민 응답의 `slots[]`·`game` 직렬화 |
| `apps/v1_api/src/tournaments/tournament-team-match-bracket.query.ts` | Modify | 어드민 대진 쿼리에 슬롯 id·게임 id/version/이벤트 수/최신 리비전 select |
| `apps/v1_api/src/tournaments/tournaments-read.query.ts` · `tournament-detail.presenter.ts` (+`.spec.ts`) | Modify | 공개 상세 경기에 `homeSlotLabel`/`awaySlotLabel` |
| `apps/v1_api/test/tournaments/tournament-bracket-tx.integration-spec.ts` | Create | DB 에서 합성 가능성·자리 연결 해제·조 삭제 가드·응답 확장 확인(CI) |
| `docs/api/domains/tournaments.md` · `.changeset/admin-bracket-canvas-foundation.md` | Modify/Create | 계약 문서와 릴리스 노트 |
| (파일 없음) 머지 후 읽기 전용 스모크 | — | Task 14 Step 7 — 배포 SHA 확인 + GET 3개, alpha 쓰기 없음 |

---

### Task 1: 정본 §6 결정 이력 4행 추가 (구현보다 먼저)

정본 §8 이 "이 문서를 바꾸는 PR 은 §6 에 한 줄을 더한다"고 요구하고, 스펙 PR-1 첫 항목이 "첫 커밋: 결정 이력 행 추가"다. 코드 변경이 없는 문서 태스크라 테스트는 없다(규칙 24).

**Files:**
- Modify: `docs/design/competition-canonical-flow.md` (§6 표의 마지막 행 `| 리그 대표 이미지 |` 바로 아래, `## 7. 태스크 매핑` 위)

**Interfaces:** Consumes: 없음. Produces: §6 표의 새 4행(이후 PR 의 구현이 이 행을 근거로 인용).

- [ ] **Step 1: 삽입 위치가 하나뿐인지 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && grep -c '늦은 쪽이 이긴다 |$' docs/design/competition-canonical-flow.md   # 기대: 1
grep -n '^## 7. 태스크 매핑' docs/design/competition-canonical-flow.md              # 기대: 한 줄
```

- [ ] **Step 2: Edit 도구로 4행을 추가한다**

`old_string`:

```
늦은 쪽이 이긴다 |

## 7. 태스크 매핑
```

`new_string`:

```
늦은 쪽이 이긴다 |
| 대진 자리(slot)와 템플릿 | 경기를 목록에 한 줄씩 추가하고 승자 연결을 경기마다 손으로 걸었다. 조별·리그 경기는 팀이 정해진 뒤에야 만들 수 있었다 | **대진의 뼈대를 먼저 만들고 팀은 나중에 넣는다.** 팀이 들어갈 칸 = 자리(`V1TournamentSlot`, `ENTRY`·`BYE`·`GROUP_RANK`)이고 경기는 `homeSlotId`·`awaySlotId` 로 자리를 가리킨다. 템플릿(토너먼트 4·8·12강 · 조별+결선 · 리그)이 자리·빈 경기·승자 연결을 한 트랜잭션으로 만든다. 자리에 팀을 넣으면 그 자리를 쓰는 경기 전부에 반영되고, 그 경기가 하나라도 시작됐으면 자리는 잠긴다. 자리에 연결된 사이드는 경기 수정으로 직접 못 바꾼다 (2026-10-08 사용자 확정 — 어드민 대진 그림 편집기 D1·D3·D4, Task 20261057) | 대진을 클릭 몇 번으로 만들고 팀이 확정되기 전에 구조·일정을 먼저 정할 수 있다. 같은 팀을 여러 경기에 일일이 넣지 않는다 | 팀이 들어갈 곳이 "경기의 사이드"와 "자리" 두 군데가 돼, 둘이 어긋나지 않게 자리 서비스가 경기를 같이 고쳐야 한다. 시작된 경기가 있는 자리는 못 바꾼다(409 `SLOT_LOCKED`). 시작·결과가 있는 대진은 템플릿으로 교체할 수 없다(409 `BRACKET_LOCKED`) |
| 정규 리그 빈 경기 | 리그 경기는 홈·원정 팀이 모두 정해진 뒤에만 만들었고, 공개 경로는 `hostTeamId === null` 을 500/409 로 던졌다 | **리그도 팀 없는 경기를 실제로 만든다**(정규 리그 템플릿, 일정 시각·장소는 필수). 자리에 연결됐는데 팀이 비어 있는 경기(한쪽만 찬 반쪽 경기 포함)는 공개 일정·순위·진행률·기록·`/team-matches`·마이 팀매치에서 제외하고, 팀이 다 차면 나타난다. 자리 없는 기존 경기의 동작은 바꾸지 않는다. 템플릿은 리그 `status` 를 바꾸지 않고, 자리를 쓰는 경기에 빈 사이드가 없어지는 순간에만(draft·open 일 때) 일괄 생성과 같은 진행 상태로 바꾼다 (2026-10-08 사용자 확정 — D2=b) | 일정을 팀보다 먼저 짜 두고, 팀이 들어오는 대로 공개된다 | 공개 경로마다 같은 제외 술어를 걸어야 하고 하나라도 빠지면 반쪽 경기가 샌다(공통 헬퍼와 경로별 대조군 테스트로 막는다). 빈 경기가 남으면 리그 완료 판정이 안 난다 — 운영자가 팀을 넣거나 경기를 취소해야 한다 |
| 어드민 빠른 결과 | 결과는 콘솔에서 시작 → 종료 → (고쳐서) 제출 → 확인을 거쳐야 했다(§4). 테스트 대회 하나에도 수십 번 클릭 | **어드민 입력 = 어드민 확인**(§4 "확인 한 단계"의 어드민 단축 경로). 플랫폼 어드민(owner·ops)이 점수만 넣으면 예정(또는 무효된) 경기가 곧바로 확정(OFFICIAL)된다. 득점 기록(게임 이벤트)이 0건인 경기에만 쓰고, 순위·팀 전적·진출·완료 알림은 일반 확정과 같은 경로를 탄다(검토 알림 없음). 득점자가 없으므로 개인 기록은 출전만 남는다. 상태 머신에 `ADMIN_QUICK` 흐름을 더하고 `CORRECTION` 으로 위장하지 않는다 (2026-10-08 사용자 확정 — D5=a·D6=a) | 대회를 새로 만들어 결승까지 한 바퀴 도는 일이 클릭만으로 된다. 확정 뒤 점수 고치기·무효는 기존 정정·무효 API 를 그대로 쓴다 | **득점자·어시스트 기록이 없다** — 테스트·비상용이고 실제 경기는 라이브 콘솔에서 넣는다. 양 팀 재확인 없이 어드민 단독으로 확정된다(감사 `QUICK_RESULT` 로만 추적) |
| 득점 기록 0건 경기의 승부차기 킥 수 | 정정 경로는 base 와 다른 승부차기를 넣을 때 킥 수를 요구한다(`requireKickCounts: !inheritedFromBase`) | **기록할 승부차기 이벤트가 없는 경기(득점 기록 0건)는 킥 수를 요구하지 않는다** — 확정 승격 게이트와 같은 `requireKickCounts: false`. 빠른 결과와 그 정정에 적용하고, 이벤트가 있는 경기는 지금처럼 요구한다 (2026-10-08, 스펙 검증 워크플로가 첫 서술의 오류를 잡아 확정) | 점수만 아는 빠른 입력 경기의 승부차기 점수를 정정할 수 있다 | 그런 경기엔 킥 수 데이터가 남지 않는다(대조할 이벤트가 없으므로 정합성 손실은 없다) |

## 7. 태스크 매핑
```

- [ ] **Step 3: 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && grep -c '^| 대진 자리(slot)와 템플릿 |\|^| 정규 리그 빈 경기 |\|^| 어드민 빠른 결과 |\|^| 득점 기록 0건 경기의 승부차기 킥 수 |' docs/design/competition-canonical-flow.md   # 기대: 4
awk -F'|' '/^\| (대진 자리|정규 리그 빈 경기|어드민 빠른 결과|득점 기록 0건)/ {print NF}' docs/design/competition-canonical-flow.md   # 기대: 모두 7 (앞뒤 빈 칸 + 5열)
```

- [ ] **Step 4: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git commit -m "docs(design): 정본 §6 결정 이력에 대진 자리·리그 빈 경기·빠른 결과·킥 수 면제 추가" -- docs/design/competition-canonical-flow.md && git show --stat HEAD
```

기대: 변경 파일이 `docs/design/competition-canonical-flow.md` 하나.

---

### Task 2: 스키마(자리 + `round16`) + 마이그레이션 + 스키마 해시 5곳 + 격리 검증 하네스

**Files:**
- Modify: `apps/v1_api/prisma/schema.prisma` (`V1TournamentGroupPhase` ≈:2546, `V1TeamMatch` ≈:1793-1860, `V1Tournament` ≈:2573-2710, `V1TournamentRegistration` ≈:2803-2850, `V1TournamentGroup` ≈:2913-2935, 파일 끝의 `V1TournamentByeSlot` ≈:4000 뒤)
- Create: `apps/v1_api/prisma/migrations/20261009090000_v1_tournament_slots/migration.sql`
- Modify: `apps/v1_api/test/fixtures/game-schema.fixture.ts:569-572`, `deploy/Dockerfile.v1-api:27-28`, `deploy/alpha-manifest-common.sh:123`, `scripts/release/create-alpha-release-manifest.sh:116,304`, `scripts/release/prepare-task168-final-steady-inputs.sh:29`
- Test: `apps/v1_api/src/games/game-schema-source-snapshot.spec.ts`(기존, 수정 없음)

**Interfaces:** Consumes: 색인 "공유 계약 > Prisma". Produces: Prisma 모델 `V1TournamentSlot`, enum `V1TournamentSlotKind`, enum 값 `V1TournamentGroupPhase.round16`(PR-1c 가 소비), `V1TeamMatch.homeSlotId/awaySlotId/homeSlot/awaySlot` — 이후 모든 Task 와 PR-1b~5a 가 소비한다.

- [ ] **Step 1: 마이그레이션 폴더 이름이 최신보다 뒤인지 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && ls prisma/migrations | grep -v migration_lock | tail -1
```

기대: `20261008120000_v1_group_team_backfill_for_fixtures` (다르면 더 뒤 번호를 보고 폴더 타임스탬프를 그 뒤로 정한다 — 이 계획은 `20261009090000` 을 쓴다).

- [ ] **Step 2: `schema.prisma` 를 고친다 (Edit 8번, 각각 `old_string` 이 파일에서 한 번만 나온다)**

(a) `V1TeamMatch` 컬럼 — `old_string`:

```
  fieldId                    String?           @map("field_id")

  hostTeam              V1Team?
```

`new_string`:

```
  fieldId                    String?           @map("field_id")
  /// 대진 편집기의 자리(V1TournamentSlot). 대회·정규 리그 경기가 같은 컬럼을 쓴다.
  homeSlotId                 String?           @map("home_slot_id")
  awaySlotId                 String?           @map("away_slot_id")

  hostTeam              V1Team?
```

(b) `V1TeamMatch` 관계 — `old_string`:

```
  tournamentDetails     V1TournamentMatchDetails?
  staffScopes            V1TournamentStaffFixtureScope[]
```

`new_string`:

```
  tournamentDetails     V1TournamentMatchDetails?
  homeSlot              V1TournamentSlot?           @relation("V1TeamMatchHomeSlot", fields: [homeSlotId], references: [id], onDelete: Restrict)
  awaySlot              V1TournamentSlot?           @relation("V1TeamMatchAwaySlot", fields: [awaySlotId], references: [id], onDelete: Restrict)
  staffScopes            V1TournamentStaffFixtureScope[]
```

(c) `V1TeamMatch` 인덱스 — `old_string`:

```
  @@index([fieldId], map: "v1_team_matches_field_id_idx")
```

`new_string`:

```
  @@index([fieldId], map: "v1_team_matches_field_id_idx")
  @@index([homeSlotId])
  @@index([awaySlotId])
```

(d) `V1Tournament` 역관계 — `old_string`:

```
  overallStandings     V1TournamentOverallStanding[]

  @@index([status, scheduledAt])
```

`new_string`:

```
  overallStandings     V1TournamentOverallStanding[]
  slots                V1TournamentSlot[]

  @@index([status, scheduledAt])
```

(e) `V1TournamentGroup` 역관계 — `old_string`:

```
  byeSlots   V1TournamentByeSlot[]
  standings  V1TournamentStanding[]
```

`new_string`:

```
  byeSlots   V1TournamentByeSlot[]
  standings  V1TournamentStanding[]
  slots      V1TournamentSlot[]     @relation("V1TournamentSlotGroup")
  rankSlots  V1TournamentSlot[]     @relation("V1TournamentSlotSourceGroup")
```

(f) `V1TournamentRegistration` 역관계 — `old_string`:

```
  overallStandings V1TournamentOverallStanding[]

  @@unique([tournamentId, teamId])
```

`new_string`:

```
  overallStandings V1TournamentOverallStanding[]
  slots            V1TournamentSlot[]

  @@unique([tournamentId, teamId])
```

(g) 새 enum·모델 — `V1TournamentByeSlot` 바로 뒤에 붙인다. `old_string`:

```
  @@unique([groupId, sortOrder], map: "v1_tournament_bye_slots_group_id_sort_order_key")
  @@map("v1_tournament_bye_slots")
}
```

`new_string`:

```
  @@unique([groupId, sortOrder], map: "v1_tournament_bye_slots_group_id_sort_order_key")
  @@map("v1_tournament_bye_slots")
}

enum V1TournamentSlotKind {
  ENTRY
  BYE
  GROUP_RANK
}

/// 팀이 들어갈 칸의 정본. 대회·정규 리그 공통(둘 다 V1Tournament). 라벨은 저장하지 않고 직렬화에서 계산한다.
model V1TournamentSlot {
  id             String               @id @default(uuid())
  tournamentId   String               @map("tournament_id")
  kind           V1TournamentSlotKind @default(ENTRY)
  groupId        String?              @map("group_id")
  position       Int
  sourceGroupId  String?              @map("source_group_id")
  registrationId String?              @map("registration_id")
  createdAt      DateTime             @default(now()) @map("created_at")
  updatedAt      DateTime             @updatedAt @map("updated_at")

  tournament      V1Tournament              @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  group           V1TournamentGroup?        @relation("V1TournamentSlotGroup", fields: [groupId], references: [id], onDelete: Restrict)
  sourceGroup     V1TournamentGroup?        @relation("V1TournamentSlotSourceGroup", fields: [sourceGroupId], references: [id], onDelete: Restrict)
  registration    V1TournamentRegistration? @relation(fields: [registrationId], references: [id], onDelete: SetNull)
  homeTeamMatches V1TeamMatch[]             @relation("V1TeamMatchHomeSlot")
  awayTeamMatches V1TeamMatch[]             @relation("V1TeamMatchAwaySlot")

  @@unique([tournamentId, kind, registrationId])
  @@index([tournamentId, groupId])
  @@map("v1_tournament_slots")
}
```

(h) 16강 단계 enum 값 — `round12` 앞에 둔다(단계 순서: group < round16 < round12 < quarter …). `old_string`:

```
enum V1TournamentGroupPhase {
  group
  round12
  quarter
```

`new_string`:

```
enum V1TournamentGroupPhase {
  group
  round16
  round12
  quarter
```

이 편집은 값 추가뿐이다. `@default` 나 다른 모델이 `round16` 을 참조하게 만들지 않는다(마이그레이션 트랜잭션 주의는 Step 4).

- [ ] **Step 3: 스키마가 유효한지 오프라인으로 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && DATABASE_URL=postgresql://x:x@localhost:5432/x ./node_modules/.bin/prisma validate 2>&1 | tail -2
```

기대: `The schema at … is valid`. (`prisma validate` 는 DB 에 접속하지 않고 클라이언트도 생성하지 않는다.)

- [ ] **Step 4: 마이그레이션 SQL 을 만든다**

`apps/v1_api/prisma/migrations/20261009090000_v1_tournament_slots/migration.sql` 을 Write 로 만든다. 본문은 `prisma migrate diff` 가 내는 SQL 과 같고(Step 5 에서 대조), 맨 위 주석과 `AlterEnum` 의 `IF NOT EXISTS … BEFORE 'round12'` 만 사람이 붙인다. `round12`/`quarter` 마이그레이션(`20261004110000_v1_tournament_round12_quarter`)이 같은 형태(`ADD VALUE IF NOT EXISTS … BEFORE …`)를 썼고, 값 순서는 스키마 enum 순서와 맞춘다:

```sql
-- Additive only: team slots for the admin bracket canvas plus the round16 group phase.
-- A new enum, the v1_tournament_slots table, two nullable v1_team_matches columns that point at it,
-- and their indexes and foreign keys. No existing row is read, written, or backfilled.
-- The round16 value is added and never referenced in this file: Postgres cannot use a new enum
-- value inside the transaction that added it.

-- AlterEnum
ALTER TYPE "V1TournamentGroupPhase" ADD VALUE IF NOT EXISTS 'round16' BEFORE 'round12';

-- CreateEnum
CREATE TYPE "V1TournamentSlotKind" AS ENUM ('ENTRY', 'BYE', 'GROUP_RANK');

-- AlterTable
ALTER TABLE "v1_team_matches" ADD COLUMN     "away_slot_id" TEXT,
ADD COLUMN     "home_slot_id" TEXT;

-- CreateTable
CREATE TABLE "v1_tournament_slots" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "kind" "V1TournamentSlotKind" NOT NULL DEFAULT 'ENTRY',
    "group_id" TEXT,
    "position" INTEGER NOT NULL,
    "source_group_id" TEXT,
    "registration_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_tournament_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "v1_tournament_slots_tournament_id_group_id_idx" ON "v1_tournament_slots"("tournament_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "v1_tournament_slots_tournament_id_kind_registration_id_key" ON "v1_tournament_slots"("tournament_id", "kind", "registration_id");

-- CreateIndex
CREATE INDEX "v1_team_matches_home_slot_id_idx" ON "v1_team_matches"("home_slot_id");

-- CreateIndex
CREATE INDEX "v1_team_matches_away_slot_id_idx" ON "v1_team_matches"("away_slot_id");

-- AddForeignKey
ALTER TABLE "v1_team_matches" ADD CONSTRAINT "v1_team_matches_home_slot_id_fkey" FOREIGN KEY ("home_slot_id") REFERENCES "v1_tournament_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_team_matches" ADD CONSTRAINT "v1_team_matches_away_slot_id_fkey" FOREIGN KEY ("away_slot_id") REFERENCES "v1_tournament_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_tournament_slots" ADD CONSTRAINT "v1_tournament_slots_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "v1_tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_tournament_slots" ADD CONSTRAINT "v1_tournament_slots_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "v1_tournament_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_tournament_slots" ADD CONSTRAINT "v1_tournament_slots_source_group_id_fkey" FOREIGN KEY ("source_group_id") REFERENCES "v1_tournament_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v1_tournament_slots" ADD CONSTRAINT "v1_tournament_slots_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "v1_tournament_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

**트랜잭션 주의(Postgres 12+ / Prisma):** `prisma migrate deploy` 는 마이그레이션 파일 하나를 한 번에 실행하므로 `ALTER TYPE … ADD VALUE` 는 같은 트랜잭션 안에서 실행된다. PG 12 이상(이 저장소는 16)은 이를 허용하지만, **그 트랜잭션이 커밋되기 전에는 새 값 `'round16'` 을 쓸 수 없다**(컬럼 `DEFAULT`·`INSERT`·부분 인덱스 조건·`CHECK` 에 쓰면 `unsafe use of new value`). 그래서 이 파일은 `round16` 을 값으로 참조하는 문장이 하나도 없어야 한다. `round16` 행을 만드는 코드(PR-1c 템플릿)는 마이그레이션이 이미 커밋된 뒤에 돈다. 아래로 확인한다:

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && grep -n "round16" prisma/migrations/20261009090000_v1_tournament_slots/migration.sql
```

기대: `ALTER TYPE` 한 줄과 주석 줄만 나온다(`DEFAULT`·`INSERT`·`WHERE` 문맥 없음).

- [ ] **Step 5: 마이그레이션이 스키마 변경분과 정확히 같은지 대조한다 (드리프트 0 의 로컬 근거)**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
(
  set -e
  mkdir -p "$ISO"
  cd $WT && git show "HEAD:apps/v1_api/prisma/schema.prisma" > "$ISO/old.prisma"
  test -s "$ISO/old.prisma"
  cd $WT/apps/v1_api
  DATABASE_URL=postgresql://x:x@localhost:5432/x ./node_modules/.bin/prisma migrate diff \
    --from-schema-datamodel "$ISO/old.prisma" --to-schema-datamodel prisma/schema.prisma --script > "$ISO/slots.diff.sql"
  test -s "$ISO/slots.diff.sql"   # diff 명령이 실패하거나 빈 출력이면 여기서 멈춘다 (stderr 를 숨기지 않는다)
  # Prisma emits a bare `ADD VALUE 'round16';`; the hand-written line adds IF NOT EXISTS / BEFORE, so strip those two before comparing.
  norm() { grep -v '^--' "$1" | sed -E "s/ADD VALUE IF NOT EXISTS/ADD VALUE/; s/ BEFORE '[a-z0-9_]+'//" | sed '/^$/d'; }
  grep -q "ADD VALUE 'round16'" "$ISO/slots.diff.sql"   # 스키마 편집 (h) 가 빠졌으면 여기서 멈춘다
  diff <(norm "$ISO/slots.diff.sql") <(norm prisma/migrations/20261009090000_v1_tournament_slots/migration.sql)
  echo "OK: migration == schema delta"
)
```

기대: `OK: migration == schema delta` — `round16` enum 값과 자리 스키마가 한 번에 대조된다(서브셸이라 `set -e` 가 호출 셸에 번지지 않는다). `prisma migrate diff` 가 실패하면 그 에러가 그대로 보이고 `test -s` 에서 멈춘다 — 빈 diff 를 "일치"로 읽지 않는다. 차이가 나면 Step 2 의 스키마 편집이 위 SQL 과 다른 것이다(컬럼 순서·`@map` 오타) — 스키마를 고친다. 마이그레이션을 스키마에 맞추려고 SQL 을 손으로 고치지 않는다. 드리프트 0 의 최종 근거는 CI 의 "V1 migration replay + drift gate"(빈 DB 에 체인 전체 재생 + `schema.prisma` 드리프트 0)이며, 위 대조는 그 로컬 근거다.

- [ ] **Step 6: 실패하는 테스트를 확인한다 — 스키마 바이트가 고정 해시와 달라졌다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest --maxWorkers=1 src/games/game-schema-source-snapshot.spec.ts 2>&1 | grep -E "✓|✕|Tests:|SOURCE_SNAPSHOT_DRIFT" | head
```

기대: `binds the committed schema and historical migration to their reviewed manifest` 가 **FAIL**(`SOURCE_SNAPSHOT_DRIFT: schema bytes differ from bound source snapshot`), 나머지 4개는 통과. 이 스펙이 해시 재고정이 빠지는 것을 잡는 게이트다.

- [ ] **Step 7: 해시 5곳을 재고정한다**

먼저 `game-schema.fixture.ts` 에 사유 주석을 넣는다(이전 해시가 아직 있는 상태에서). Edit — `old_string`:

```
  schema: 'f0a8ce6e02421b02b5e36772dec0f183121064a02e2a976e7f9ee8d9965c954a',
```

`new_string`:

```
  // 2026-10-09: additive V1TournamentSlot + V1TeamMatch.homeSlotId/awaySlotId + the round16
  // group phase value, all backed by 20261009090000_v1_tournament_slots. Game models and the bound historical
  // game-operations migration are unchanged; re-pin the schema bytes only.
  schema: 'f0a8ce6e02421b02b5e36772dec0f183121064a02e2a976e7f9ee8d9965c954a',
```

그다음 새 해시로 바꾼다 (4곳은 교체, `alpha-manifest-common.sh` 는 허용 목록에 **추가**):

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT
OLD=f0a8ce6e02421b02b5e36772dec0f183121064a02e2a976e7f9ee8d9965c954a
NEW=$(sha256sum apps/v1_api/prisma/schema.prisma | cut -d' ' -f1); echo "$NEW"
export OLD NEW
perl -pi -e 's/$ENV{OLD}/$ENV{NEW}/g' deploy/Dockerfile.v1-api scripts/release/create-alpha-release-manifest.sh \
  scripts/release/prepare-task168-final-steady-inputs.sh apps/v1_api/test/fixtures/game-schema.fixture.ts
perl -pi -e 's/(\.database\.task168\.schemaSha256 == "\Q$ENV{OLD}\E")\) and/$1 or\n       .database.task168.schemaSha256 == "$ENV{NEW}") and/' deploy/alpha-manifest-common.sh
```

(`NEW` 는 Step 2 의 편집 (a)~(h) 를 **전부** 적용한 뒤의 `schema.prisma` 해시여야 한다 — (h) `round16` 을 빼고 계산한 해시는 틀리다. 고정 기대값은 적지 않는다(자리 스키마만 반영한 이전 계획값 `3b93a336…` 는 `round16` 때문에 더 이상 맞지 않는다). Step 6 에서 FAIL, Step 9 에서 PASS 로 바뀌는지로 확인한다.)

- [ ] **Step 8: 5곳이 모두 바뀌었고 이전 해시가 허용 목록 말고는 남지 않았는지 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && for f in deploy/Dockerfile.v1-api scripts/release/create-alpha-release-manifest.sh scripts/release/prepare-task168-final-steady-inputs.sh apps/v1_api/test/fixtures/game-schema.fixture.ts deploy/alpha-manifest-common.sh; do
  echo "$f new=$(grep -c "$NEW" $f) old=$(grep -c "$OLD" $f)"; done
```

기대: Dockerfile `new=2 old=0` · create-alpha `new=2 old=0` · prepare-task168 `new=1 old=0` · fixture `new=1 old=0` · alpha-manifest-common `new=1 old=1`(이전 값은 허용 목록에 남는다).

- [ ] **Step 9: 스펙이 통과한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest --maxWorkers=1 src/games/game-schema-source-snapshot.spec.ts 2>&1 | grep -E "Tests:"
```

기대: `Tests: 5 passed, 5 total`.

- [ ] **Step 10: 격리 하네스를 만든다 (이후 모든 Task 의 jest/tsc 가 쓴다 — 저장소에는 아무 것도 남기지 않는다)**

공유 `node_modules` 의 Prisma 클라이언트는 건드리지 않는다. 스키마 사본을 **앱 디렉터리 안 임시 폴더**에 두고(밖에 두면 Prisma 가 auto-install 을 시도한다) 출력만 `$ISO` 로 돌린다.

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api
mkdir -p prisma-iso-tmp
perl -pe 's#provider = "prisma-client-js"#provider = "prisma-client-js"\n  output   = "$ENV{ISO}/prisma-client"#' prisma/schema.prisma > prisma-iso-tmp/schema.prisma
SHARED_DTS=$(node -e "console.log(require.resolve('.prisma/client/index.d.ts',{paths:[require.resolve('@prisma/client')]}))")
BEFORE=$(stat -f %m "$SHARED_DTS")
DATABASE_URL=postgresql://x:x@localhost:5432/x ./node_modules/.bin/prisma generate --schema prisma-iso-tmp/schema.prisma 2>&1 | tee "$ISO/generate.log" | grep -E "Generated|Error"
test "${pipestatus[1]}" -eq 0 && echo "generate exit 0"   # zsh. bash 라면 ${PIPESTATUS[0]}
rm -rf prisma-iso-tmp
test -f "$ISO/prisma-client/client.d.ts" && echo "isolated client ok"
test "$(stat -f %m "$SHARED_DTS")" = "$BEFORE" && echo "shared client untouched"
git -C $WT status --short | grep -v '^??'  # 기대: 스키마·마이그레이션·해시 파일만 (prisma-iso-tmp 없음)
```

기대: `Generated Prisma Client ... to <$ISO>/prisma-client` 줄, `generate exit 0`, `isolated client ok`, `shared client untouched` 네 줄이 모두 출력된다. 하나라도 빠지면 멈추고 `$ISO/generate.log` 를 본다(공유 client 가 바뀌었으면 즉시 사용자에게 보고).

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
python3 - <<'PY'
import json, os
iso, app = os.environ['ISO'], os.environ['WT'] + '/apps/v1_api'
json.dump({
  "extends": app + "/tsconfig.json",
  "compilerOptions": {
    "noEmit": True, "incremental": False, "baseUrl": app,
    "typeRoots": [app + "/node_modules/@types"], "types": ["jest", "node"],
    "paths": {"@/*": ["src/*"], "@prisma/client": [iso + "/prisma-client"]},
  },
  "include": [app + "/src/**/*", app + "/prisma/**/*", app + "/test/fixtures/**/*", app + "/test/helpers/**/*", app + "/test/tournaments/**/*"],
}, open(iso + '/tsconfig.isocheck.json', 'w'), indent=2)
open(iso + '/jest.iso.config.cjs', 'w').write(f"""module.exports = {{
  rootDir: '{app}',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {{ '^.+\\\\.(t|j)s$': ['ts-jest', {{ tsconfig: '{iso}/tsconfig.isocheck.json' }}] }},
  moduleNameMapper: {{ '^@prisma/client$': '{iso}/prisma-client', '^@/(.*)$': '<rootDir>/src/$1' }},
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
}};
""")
PY
```

이후 명령 형태 (이 문서에서 `HJEST` / `HTSC` 라 줄여 쓰지 않고 매번 풀어 쓴다):

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 <spec 경로>
cd $WT/apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"     # 전체 타입 검사(느리다: 부하에 따라 2~7분)
```

- [ ] **Step 11: 하네스가 새 타입을 보는지, 그리고 베이스라인이 깨끗한지 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"
```

기대: 출력 없음(타입 오류 0). 오류가 나면 이 Task 의 변경이 아니라 하네스 경로(`$ISO`·`$WT`)가 틀린 것부터 본다.

`round16` 이 새 enum 값으로 생겨도 `Record<V1TournamentGroupPhase, …>` 처럼 전 값을 강제하는 서버 코드가 없어 tsc 0 이 유지된다. 범위 가드 — 16강 업무 규칙이 이 PR 에 새지 않았는지 확인한다:

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git diff HEAD --name-only | grep -E '^apps/v1_(api/src|web)/' ; grep -rn "round16" apps/v1_api/src apps/v1_web/src | head -3
```

기대: 두 출력 모두 비어 있다(`round16` 은 `schema.prisma`·마이그레이션 SQL 에만 있다). DTO `TOURNAMENT_GROUP_PHASES`·`tournament-round-label.ts`·웹 타입은 PR-1c 가 바꾼다.

- [ ] **Step 12: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git add apps/v1_api/prisma/migrations/20261009090000_v1_tournament_slots/migration.sql && git commit -m "feat(v1-api): 대진 자리(V1TournamentSlot) 스키마와 마이그레이션 추가" -- \
  apps/v1_api/prisma/schema.prisma apps/v1_api/prisma/migrations/20261009090000_v1_tournament_slots/migration.sql \
  apps/v1_api/test/fixtures/game-schema.fixture.ts deploy/Dockerfile.v1-api deploy/alpha-manifest-common.sh \
  scripts/release/create-alpha-release-manifest.sh scripts/release/prepare-task168-final-steady-inputs.sh && git show --stat HEAD
```

기대: 위 7개 파일만(`prisma-iso-tmp`·`node_modules` 없음).

---

### Task 3: `writeAdminActionLog` — 서비스 인스턴스 없이 트랜잭션에 감사 로그를 남기는 함수

`…InTx` 함수(Task 6~11)는 `AdminContextService` 인스턴스가 없다. 메서드 본문을 함수로 옮기고 메서드는 위임한다.

**Files:**
- Modify: `apps/v1_api/src/common/admin-context.service.ts:55-104`
- Test: `apps/v1_api/src/common/admin-context.service.spec.ts` (끝에 `describe` 추가, 기존 `describe` 는 그대로)

**Interfaces:** Consumes: 없음. Produces:
```ts
export type AdminActionLogInput = { action: string; targetType: string; targetId: string; reason?: string | null; beforeJson?: Prisma.InputJsonValue; afterJson?: Prisma.InputJsonValue; fromStatus?: string | null; toStatus?: string };
export type AdminActionLogResult = { actionLogId: string; statusChangeLogId: string | null };
export async function writeAdminActionLog(client: Prisma.TransactionClient | PrismaService, admin: V1ActiveAdmin, input: AdminActionLogInput): Promise<AdminActionLogResult>
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`admin-context.service.spec.ts` 맨 위 import 한 줄을 바꾸고(`import { AdminContextService } from './admin-context.service';` →),

```ts
import { AdminContextService, writeAdminActionLog, type V1ActiveAdmin } from './admin-context.service';
```

파일 끝에 추가한다.

```ts
describe('writeAdminActionLog', () => {
  const admin: V1ActiveAdmin = { id: 'admin-row-1', userId: 'user-1', adminRole: 'ops', status: 'active' };
  const makeClient = () => ({
    v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
    v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
  });

  it('감사 행에는 사용자 id 가 아니라 어드민 행 id 를 남기고, toStatus 가 없으면 상태 로그를 만들지 않는다', async () => {
    const client = makeClient();

    await expect(
      writeAdminActionLog(client as never, admin, { action: 'a.b', targetType: 't', targetId: 'x', afterJson: { n: 1 } }),
    ).resolves.toEqual({ actionLogId: 'action-log-1', statusChangeLogId: null });

    expect(client.v1AdminActionLog.create).toHaveBeenCalledWith({
      data: { adminUserId: 'admin-row-1', action: 'a.b', targetType: 't', targetId: 'x', reason: null, afterJson: { n: 1 } },
    });
    expect(client.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  it('toStatus 가 있으면 같은 client 로 상태 변경 로그도 남긴다', async () => {
    const client = makeClient();

    await expect(
      writeAdminActionLog(client as never, admin, {
        action: 'a.b', targetType: 't', targetId: 'x', reason: '사유', fromStatus: 'open', toStatus: 'closed',
      }),
    ).resolves.toEqual({ actionLogId: 'action-log-1', statusChangeLogId: 'status-log-1' });

    expect(client.v1StatusChangeLog.create).toHaveBeenCalledWith({
      data: { targetType: 't', targetId: 'x', fromStatus: 'open', toStatus: 'closed', actorType: 'admin', adminUserId: 'admin-row-1', reason: '사유' },
    });
  });
});

describe('AdminContextService.logAdminAction 위임', () => {
  const admin: V1ActiveAdmin = { id: 'admin-row-1', userId: 'user-1', adminRole: 'owner', status: 'active' };
  const makeClient = () => ({
    v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
    v1StatusChangeLog: { create: jest.fn() },
  });

  it('tx 를 주면 서비스가 들고 있는 prisma 가 아니라 tx 에 쓴다 (호출자 트랜잭션과 함께 롤백돼야 한다)', async () => {
    const own = makeClient();
    const tx = makeClient();
    const service = new AdminContextService(own as unknown as PrismaService);

    await service.logAdminAction(admin, { action: 'a', targetType: 't', targetId: 'x' }, tx as never);

    expect(tx.v1AdminActionLog.create).toHaveBeenCalledTimes(1);
    expect(own.v1AdminActionLog.create).not.toHaveBeenCalled();
  });

  it('tx 가 없으면 서비스의 prisma 에 쓴다', async () => {
    const own = makeClient();
    const service = new AdminContextService(own as unknown as PrismaService);

    await service.logAdminAction(admin, { action: 'a', targetType: 't', targetId: 'x' });

    expect(own.v1AdminActionLog.create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/common/admin-context.service.spec.ts 2>&1 | grep -E "TS2305|has no exported member|Tests:|Test Suites:"
```

기대: `Module '"./admin-context.service"' has no exported member 'writeAdminActionLog'`(TS2305) 로 스위트가 FAIL.

- [ ] **Step 3: 구현한다 — 메서드 전체를 Edit 한 번으로 교체**

`admin-context.service.ts` 의 `old_string` 은 54~104행(주석 포함 `logAdminAction` 메서드 전체와 클래스 닫는 `}`):

```ts
  /**
   * V1AdminActionLog 기록 + (toStatus 제공 시) V1StatusChangeLog 동시 기록.
   * tx를 넘기면 호출자 트랜잭션 안에서 원자적으로 기록한다.
   */
  async logAdminAction(
    admin: V1ActiveAdmin,
    input: {
      action: string;
      targetType: string;
      targetId: string;
      reason?: string | null;
      beforeJson?: Prisma.InputJsonValue;
      afterJson?: Prisma.InputJsonValue;
      fromStatus?: string | null;
      toStatus?: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{ actionLogId: string; statusChangeLogId: string | null }> {
    const client = tx ?? this.prisma;
    const actionLog = await client.v1AdminActionLog.create({
      data: {
        adminUserId: admin.id,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason ?? null,
        beforeJson: input.beforeJson,
        afterJson: input.afterJson,
      },
    });

    let statusChangeLogId: string | null = null;
    if (input.toStatus) {
      const statusLog = await client.v1StatusChangeLog.create({
        data: {
          targetType: input.targetType,
          targetId: input.targetId,
          fromStatus: input.fromStatus ?? null,
          toStatus: input.toStatus,
          actorType: 'admin',
          adminUserId: admin.id,
          reason: input.reason ?? null,
        },
      });
      statusChangeLogId = statusLog.id;
    }

    return { actionLogId: actionLog.id, statusChangeLogId };
  }
}
```

`new_string`:

```ts
  /**
   * V1AdminActionLog 기록 + (toStatus 제공 시) V1StatusChangeLog 동시 기록.
   * tx를 넘기면 호출자 트랜잭션 안에서 원자적으로 기록한다.
   */
  async logAdminAction(
    admin: V1ActiveAdmin,
    input: AdminActionLogInput,
    tx?: Prisma.TransactionClient,
  ): Promise<AdminActionLogResult> {
    return writeAdminActionLog(tx ?? this.prisma, admin, input);
  }
}

export type AdminActionLogInput = {
  action: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  beforeJson?: Prisma.InputJsonValue;
  afterJson?: Prisma.InputJsonValue;
  fromStatus?: string | null;
  toStatus?: string;
};

export type AdminActionLogResult = { actionLogId: string; statusChangeLogId: string | null };

/**
 * 서비스 인스턴스 없이 호출자 client(대개 트랜잭션)에 감사 로그를 남긴다. `…InTx` 함수가 쓰고,
 * `logAdminAction` 도 이 함수에 위임하므로 기록 모양은 하나다.
 */
export async function writeAdminActionLog(
  client: Prisma.TransactionClient | PrismaService,
  admin: V1ActiveAdmin,
  input: AdminActionLogInput,
): Promise<AdminActionLogResult> {
  const actionLog = await client.v1AdminActionLog.create({
    data: {
      adminUserId: admin.id,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason ?? null,
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
    },
  });

  let statusChangeLogId: string | null = null;
  if (input.toStatus) {
    const statusLog = await client.v1StatusChangeLog.create({
      data: {
        targetType: input.targetType,
        targetId: input.targetId,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus,
        actorType: 'admin',
        adminUserId: admin.id,
        reason: input.reason ?? null,
      },
    });
    statusChangeLogId = statusLog.id;
  }

  return { actionLogId: actionLog.id, statusChangeLogId };
}
```

- [ ] **Step 4: 통과를 확인한다 (새 테스트 + 감사 로그를 쓰는 기존 서비스 스펙)**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/common/admin-context.service.spec.ts src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "Tests:|Test Suites:"
```

기대: 두 스위트 PASS(`tournament-bracket.service.spec.ts` 93개 포함 — `v1AdminActionLog.create` 단언이 그대로 통과해야 한다).

- [ ] **Step 5: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git commit -m "refactor(v1-api): 감사 로그 기록을 인스턴스 없이 쓸 수 있는 writeAdminActionLog 로 추출" -- \
  apps/v1_api/src/common/admin-context.service.ts apps/v1_api/src/common/admin-context.service.spec.ts && git show --stat HEAD
```

---

### Task 4: 자리 라벨 순수 함수

**Files:**
- Create: `apps/v1_api/src/tournaments/slots/tournament-slot-label.ts`
- Test: `apps/v1_api/src/tournaments/slots/tournament-slot-label.spec.ts`

**Interfaces:** Consumes: Prisma 타입 `V1TournamentSlotKind`, `V1TournamentGroupPhase`(type import 만). Produces:
```ts
export function tournamentSlotLabel(input: { kind: V1TournamentSlotKind; position: number; groupName: string | null; groupPhase: V1TournamentGroupPhase | null; sourceGroupName: string | null }): string
export const SLOT_LABEL_SELECT   // { kind, position, group:{name,phase}, sourceGroup:{name} }  (Prisma select 모양)
export type SlotLabelRow
export function slotLabelFromRow(row: SlotLabelRow): string
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { slotLabelFromRow, tournamentSlotLabel } from './tournament-slot-label';

describe('tournamentSlotLabel', () => {
  const base = { groupName: null, groupPhase: null, sourceGroupName: null } as const;

  it.each([
    ['조별 그룹 ENTRY 는 조 이름과 번호', { ...base, kind: 'ENTRY', position: 1, groupName: 'A조', groupPhase: 'group' }, 'A조 1번'],
    ['결선 그룹 ENTRY 는 조 이름을 붙이지 않는다', { ...base, kind: 'ENTRY', position: 3, groupName: '8강', groupPhase: 'quarter' }, '3번 자리'],
    ['정규 리그 ENTRY(그룹 없음)', { ...base, kind: 'ENTRY', position: 2 }, '2번 자리'],
    ['조별 phase 라도 조 이름이 없으면 "null" 을 찍지 않는다', { ...base, kind: 'ENTRY', position: 1, groupPhase: 'group' }, '1번 자리'],
    ['BYE', { ...base, kind: 'BYE', position: 4, groupName: '12강', groupPhase: 'round12' }, '부전승 4'],
    ['GROUP_RANK 는 원천 조 이름과 순위', { ...base, kind: 'GROUP_RANK', position: 2, groupName: '4강', groupPhase: 'semi', sourceGroupName: 'B조' }, 'B조 2위'],
    ['원천 조가 비어 있으면 순위만', { ...base, kind: 'GROUP_RANK', position: 1, groupName: '4강', groupPhase: 'semi' }, '1위'],
  ] as const)('%s', (_name, input, expected) => {
    expect(tournamentSlotLabel(input)).toBe(expected);
  });
});

describe('slotLabelFromRow', () => {
  it('Prisma select 모양(중첩 group/sourceGroup)을 라벨 입력으로 펴 준다', () => {
    expect(
      slotLabelFromRow({ kind: 'GROUP_RANK', position: 1, group: { name: '4강', phase: 'semi' }, sourceGroup: { name: 'A조' } }),
    ).toBe('A조 1위');
    expect(
      slotLabelFromRow({ kind: 'ENTRY', position: 2, group: { name: 'A조', phase: 'group' }, sourceGroup: null }),
    ).toBe('A조 2번');
    expect(slotLabelFromRow({ kind: 'ENTRY', position: 5, group: null, sourceGroup: null })).toBe('5번 자리');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/tournament-slot-label.spec.ts 2>&1 | grep -E "Cannot find module|Tests:|Test Suites:"
```

기대: `Cannot find module './tournament-slot-label'` 로 FAIL.

- [ ] **Step 3: 구현한다**

```ts
import type { V1TournamentGroupPhase, V1TournamentSlotKind } from '@prisma/client';

export type TournamentSlotLabelInput = {
  kind: V1TournamentSlotKind;
  position: number;
  groupName: string | null;
  groupPhase: V1TournamentGroupPhase | null;
  sourceGroupName: string | null;
};

/**
 * 자리 라벨은 저장하지 않고 읽을 때 계산한다. 조별 그룹의 ENTRY 만 조 이름을 붙이는 이유: 결선 그룹 이름
 * ('8강' 등)은 "8강 3번" 처럼 읽혀 경기 번호와 헷갈리고, 정규 리그에는 그룹이 없다.
 */
export function tournamentSlotLabel(input: TournamentSlotLabelInput): string {
  switch (input.kind) {
    case 'BYE':
      return `부전승 ${input.position}`;
    case 'GROUP_RANK':
      return input.sourceGroupName === null ? `${input.position}위` : `${input.sourceGroupName} ${input.position}위`;
    case 'ENTRY':
      return input.groupPhase === 'group' && input.groupName !== null
        ? `${input.groupName} ${input.position}번`
        : `${input.position}번 자리`;
  }
}

/** Prisma select 조각 — 공개 상세·어드민 응답이 같은 모양으로 읽어 `slotLabelFromRow` 에 넘긴다. */
export const SLOT_LABEL_SELECT = {
  kind: true,
  position: true,
  group: { select: { name: true, phase: true } },
  sourceGroup: { select: { name: true } },
} as const;

export type SlotLabelRow = {
  kind: V1TournamentSlotKind;
  position: number;
  group: { name: string; phase: V1TournamentGroupPhase } | null;
  sourceGroup: { name: string } | null;
};

export function slotLabelFromRow(row: SlotLabelRow): string {
  return tournamentSlotLabel({
    kind: row.kind,
    position: row.position,
    groupName: row.group?.name ?? null,
    groupPhase: row.group?.phase ?? null,
    sourceGroupName: row.sourceGroup?.name ?? null,
  });
}
```

- [ ] **Step 4: 통과를 확인한다** (Step 2 의 명령) — 기대: `Tests: 8 passed`.

- [ ] **Step 5: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git add apps/v1_api/src/tournaments/slots/tournament-slot-label.ts apps/v1_api/src/tournaments/slots/tournament-slot-label.spec.ts && git commit -m "feat(v1-api): 대진 자리 라벨 순수 함수 추가" -- \
  apps/v1_api/src/tournaments/slots/tournament-slot-label.ts apps/v1_api/src/tournaments/slots/tournament-slot-label.spec.ts && git show --stat HEAD
```

---

### Task 5: 빠른 결과 reason 마커와 리비전 입력 방식 판정

PR-2 가 `[quick-result]` 마커를 쓰고 이 PR 의 어드민 응답(`entryMethod`)이 읽는다. 상수와 판정 함수만 먼저 둔다.

**Files:**
- Create: `apps/v1_api/src/tournament-operations/results/quick-result.constants.ts`
- Test: `apps/v1_api/src/tournament-operations/results/quick-result.constants.spec.ts`

**Interfaces:** Produces:
```ts
export const QUICK_RESULT_REASON_MARKER = '[quick-result]';
export type RevisionEntryMethod = 'quick' | 'console' | 'correction';
export function revisionEntryMethod(rev: { reason: string | null; supersedesId: string | null }): RevisionEntryMethod
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { QUICK_RESULT_REASON_MARKER, revisionEntryMethod } from './quick-result.constants';

describe('revisionEntryMethod', () => {
  it('reason 이 마커로 시작하면 quick — 무효 뒤 재입력(supersedesId 있음)도 quick 이다', () => {
    expect(revisionEntryMethod({ reason: QUICK_RESULT_REASON_MARKER, supersedesId: null })).toBe('quick');
    expect(revisionEntryMethod({ reason: `${QUICK_RESULT_REASON_MARKER} 재입력`, supersedesId: 'rev-void' })).toBe('quick');
  });

  it('마커가 맨 앞이 아니면 quick 이 아니다 — 운영자가 쓴 정정 사유에 우연히 들어간 경우', () => {
    expect(revisionEntryMethod({ reason: `정정 ${QUICK_RESULT_REASON_MARKER}`, supersedesId: 'rev-1' })).toBe('correction');
  });

  it('이전 리비전을 대체하면 correction, 아니면 console', () => {
    expect(revisionEntryMethod({ reason: '운영자 결과 정정', supersedesId: 'rev-1' })).toBe('correction');
    expect(revisionEntryMethod({ reason: null, supersedesId: 'rev-1' })).toBe('correction');
    expect(revisionEntryMethod({ reason: null, supersedesId: null })).toBe('console');
    expect(revisionEntryMethod({ reason: '경기 종료', supersedesId: null })).toBe('console');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournament-operations/results/quick-result.constants.spec.ts 2>&1 | grep -E "Cannot find module|Tests:"
```

기대: `Cannot find module './quick-result.constants'`.

- [ ] **Step 3: 구현한다**

```ts
/** 빠른 결과가 만든 리비전의 `reason` 맨 앞에 붙는 표식. 어드민 응답의 `entryMethod` 가 이것으로 갈린다. */
export const QUICK_RESULT_REASON_MARKER = '[quick-result]';

export type RevisionEntryMethod = 'quick' | 'console' | 'correction';

/**
 * 결과 리비전이 어떻게 들어왔는지. `supersedesId` 는 정정뿐 아니라 무효·보완 요청 뒤의 새 초안에도 붙어서,
 * 'correction' 은 "앞 리비전을 대체한 것" 이라는 뜻이다(콘솔 종료가 만든 첫 초안만 'console').
 */
export function revisionEntryMethod(rev: { reason: string | null; supersedesId: string | null }): RevisionEntryMethod {
  if (rev.reason?.startsWith(QUICK_RESULT_REASON_MARKER)) return 'quick';
  return rev.supersedesId === null ? 'console' : 'correction';
}
```

- [ ] **Step 4: 통과를 확인한다** (Step 2 명령) — 기대: `Tests: 3 passed`.

- [ ] **Step 5: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git add apps/v1_api/src/tournament-operations/results/quick-result.constants.ts apps/v1_api/src/tournament-operations/results/quick-result.constants.spec.ts && git commit -m "feat(v1-api): 빠른 결과 reason 마커와 리비전 입력 방식 판정 추가" -- \
  apps/v1_api/src/tournament-operations/results/quick-result.constants.ts apps/v1_api/src/tournament-operations/results/quick-result.constants.spec.ts && git show --stat HEAD
```

---

### Task 6: `tournament-bracket-tx.ts` 시작 — 조 생성·순위 재계산·조 편성 보조를 함수로 추출

`createGroup` 의 트랜잭션 본문과, 서비스의 private 메서드 `ensureGroupPhaseTeams`(`tournament-bracket.service.ts:437-492`)·`recalculateStandingsInTx`(`:1210-1249`)를 새 파일의 함수로 옮긴다. 동작은 그대로다 — 이후 Task 7 의 사이드 배정이 이 둘을 쓰기 때문에 서비스 밖으로 나와야 한다.

**Files:**
- Create: `apps/v1_api/src/tournaments/tournament-bracket-tx.ts`
- Modify: `apps/v1_api/src/tournaments/tournament-bracket.service.ts` (import 51-57, `createGroup` :237-266, 삭제 :437-492·:1210-1249, 호출부 :727·:966·:1254)
- Test: `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts` (파일 끝, 메인 `describe` 안), `apps/v1_api/test/tournaments/tournament-bracket-tx.integration-spec.ts`(신규)

**Interfaces:** Produces:
```ts
export async function createGroupInTx(tx: Prisma.TransactionClient, admin: V1ActiveAdmin, tournamentId: string,
  input: { name: string; phase: V1TournamentGroupPhase; sortOrder: number; advanceCount: number | null }): Promise<V1TournamentGroup>
export async function recalculateStandingsInTx(tx: Prisma.TransactionClient, tournamentId: string): Promise<{ groupCount: number; recalculatedAt: Date; competitionConfigVersionId: string; audit: Prisma.InputJsonObject }>
export async function ensureGroupPhaseTeamsInTx(tx: Prisma.TransactionClient, admin: V1ActiveAdmin, tournamentId: string, groupId: string,
  groupPhase: string, registrationIds: ReadonlyArray<string | null | undefined>): Promise<void>
```

- [ ] **Step 1: 실패하는 단위 테스트를 쓴다**

`tournament-bracket.service.spec.ts` 위쪽 import 에 한 줄 추가:

```ts
import { createGroupInTx } from './tournament-bracket-tx';
```

메인 `describe('TournamentBracketService', …)` 의 **맨 끝**을 바꾼다 — `old_string`(파일 끝):

```
    });
  });


});
```

`new_string`:

```
    });
  });

  // ─── 대진 …InTx 추출 함수 (tournament-bracket-tx.ts) ─────────────────────────

  const activeAdmin = { id: 'owner-admin-id', userId: 'owner-user-id', adminRole: 'owner' as const, status: 'active' as const };

  describe('createGroupInTx', () => {
    function makeTx(created: Record<string, unknown>) {
      return {
        v1TournamentGroup: { create: jest.fn().mockResolvedValue(created) },
        v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
        v1StatusChangeLog: { create: jest.fn() },
      };
    }

    it('입력을 빠짐없이 저장하고(결선 조의 advanceCount 포함) 감사 로그에 어드민 행 id 를 남긴다', async () => {
      const tx = makeTx(groupRow({ id: 'group-9', name: '조별 A', phase: 'group', sortOrder: 3, advanceCount: 2 }));

      const created = await createGroupInTx(tx as never, activeAdmin, 'tournament-1', {
        name: '조별 A', phase: 'group', sortOrder: 3, advanceCount: 2,
      });

      expect(created.id).toBe('group-9');
      expect(tx.v1TournamentGroup.create).toHaveBeenCalledWith({
        data: { tournamentId: 'tournament-1', name: '조별 A', phase: 'group', sortOrder: 3, advanceCount: 2 },
      });
      expect(tx.v1AdminActionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminUserId: 'owner-admin-id',
          action: 'tournament.bracket.group.create',
          targetType: 'tournament_group',
          targetId: 'group-9',
          afterJson: { tournamentId: 'tournament-1', name: '조별 A', phase: 'group' },
        }),
      });
    });

    it('advanceCount 가 null 이면 null 로 저장한다 (0 이나 undefined 로 바뀌지 않는다)', async () => {
      const tx = makeTx(groupRow({ id: 'group-10', name: '결승', phase: 'final', advanceCount: null }));

      await createGroupInTx(tx as never, activeAdmin, 'tournament-1', { name: '결승', phase: 'final', sortOrder: 0, advanceCount: null });

      expect(tx.v1TournamentGroup.create).toHaveBeenCalledWith({
        data: { tournamentId: 'tournament-1', name: '결승', phase: 'final', sortOrder: 0, advanceCount: null },
      });
    });
  });

  // ─── …InTx 추출 함수 끝 (새 describe 는 이 줄 위에 추가한다) ───

});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "Cannot find module|Tests:|Test Suites:"
```

기대: `Cannot find module './tournament-bracket-tx'` 로 스위트 FAIL.

- [ ] **Step 3: `tournament-bracket-tx.ts` 를 만든다**

```ts
import { NotFoundException } from '@nestjs/common';
import { Prisma, type V1TournamentGroup, type V1TournamentGroupPhase } from '@prisma/client';
import { writeAdminActionLog, type V1ActiveAdmin } from '../common/admin-context.service';
import {
  fairPlayByRegistrationFromGroups,
  recalculateAndUpsertGroupStandings,
} from './tournament-group-standings';
import { recalculateAndUpsertOverallStandings } from './tournament-overall-standings';
import { loadCanonicalStandingsSource } from './tournament-standings-source';

type Tx = Prisma.TransactionClient;

/**
 * 대진 변경 `…InTx` 함수 모음. 서비스 메서드는 권한 확인·락·응답 직렬화만 하고 변경 본문은 여기 있어서,
 * 템플릿·자리 서비스가 여러 변경을 한 트랜잭션에 묶을 수 있다. 대회 대진 변경은 호출자가
 * `league-fixture-generation:{tournamentId}` advisory lock 을 먼저 잡았다고 가정한다.
 */

export async function createGroupInTx(
  tx: Tx,
  admin: V1ActiveAdmin,
  tournamentId: string,
  input: { name: string; phase: V1TournamentGroupPhase; sortOrder: number; advanceCount: number | null },
): Promise<V1TournamentGroup> {
  const group = await tx.v1TournamentGroup.create({
    data: {
      tournamentId,
      name: input.name,
      phase: input.phase,
      sortOrder: input.sortOrder,
      advanceCount: input.advanceCount,
    },
  });
  await writeAdminActionLog(tx, admin, {
    action: 'tournament.bracket.group.create',
    targetType: 'tournament_group',
    targetId: group.id,
    afterJson: { tournamentId, name: group.name, phase: group.phase },
  });
  return group;
}

/** 조별·통합 순위 전체 재계산. 호출자 tx 안에서 돌고 감사 로그는 호출자가 남긴다. */
export async function recalculateStandingsInTx(tx: Tx, tournamentId: string) {
  const source = await loadCanonicalStandingsSource(tx, tournamentId);
  if (source === null) {
    throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
  }
  const { groups, config, configVersionId: competitionConfigVersionId, recalculatedAt: now } = source;
  // F5: 페어플레이 벌점 — 모든 조의 픽스처를 넘겨 한 번에 집계한 registrationId
  // → 벌점 Map을 그룹별 upsert와 통합 upsert 양쪽에 그대로 넘긴다(그룹 픽스처는
  // 조별로 분리돼 있으므로 그룹 하나만 넘겨 계산해도 값은 동일하다).
  const fairPlayByRegistration = fairPlayByRegistrationFromGroups(groups);
  for (const group of groups) {
    // Calculation + upsert extracted to tournament-group-standings.ts —
    // shared verbatim with the automatic per-result trigger
    // (GameResultStandingsProjectionService), which recalculates just
    // the one affected group instead of looping every group.
    await recalculateAndUpsertGroupStandings(
      tx,
      { tournamentId, configVersionId: competitionConfigVersionId, config, group, fairPlayByRegistration },
      now,
    );
  }

  // Invariant: every path that calls recalculateAndUpsertGroupStandings
  // must also call recalculateAndUpsertOverallStandings in the same tx,
  // so the group view and the overall (통합) view never drift. This
  // route already has every group-phase group loaded above, so it can
  // feed them straight in.
  await recalculateAndUpsertOverallStandings(
    tx,
    { tournamentId, configVersionId: competitionConfigVersionId, config, groups, fairPlayByRegistration },
    now,
  );
  return {
    groupCount: groups.length,
    recalculatedAt: now,
    competitionConfigVersionId,
    audit: { groupCount: groups.length, recalculatedAt: now.toISOString(), competitionConfigVersionId },
  };
}

/**
 * 조별 순위는 조 편성(V1TournamentGroupTeam) 기준으로 계산·표시된다. 조별리그(`group`) 조 안의
 * 경기에 들어가는 팀이 편성에 없으면 순위표에서 빠지므로, 경기를 넣는 같은 트랜잭션에서 편성한다.
 * 결선 단계 조는 편성이 대진 자리(부전승·정원)를 뜻해서 건드리지 않는다.
 */
export async function ensureGroupPhaseTeamsInTx(
  tx: Tx,
  admin: V1ActiveAdmin,
  tournamentId: string,
  groupId: string,
  groupPhase: string,
  registrationIds: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  if (groupPhase !== 'group') return;
  const ids = [...new Set(registrationIds.filter((id): id is string => typeof id === 'string'))];
  if (ids.length === 0) return;
  const assigned = await tx.v1TournamentGroupTeam.findMany({
    where: { groupId },
    select: { registrationId: true, sortOrder: true },
  });
  const assignedIds = new Set(assigned.map((team) => team.registrationId));
  let nextSortOrder = assigned.length === 0 ? 0 : Math.max(...assigned.map((team) => team.sortOrder)) + 1;
  // 순위 행이 하나라도 있는 조는 행만 보여 줘서, 새 편성 팀은 재계산 전까지 표에서 빠진다.
  const groupHasStandings = (await tx.v1TournamentStanding.count({ where: { groupId } })) > 0;
  const createdTeamIds: string[] = [];
  for (const registrationId of ids) {
    if (assignedIds.has(registrationId)) continue;
    const created = await tx.v1TournamentGroupTeam.create({
      data: { groupId, registrationId, isBye: false, sortOrder: nextSortOrder++ },
    });
    await writeAdminActionLog(tx, admin, {
      action: 'tournament.bracket.group_team.create',
      targetType: 'tournament_group_team',
      targetId: created.id,
      afterJson: { groupId, registrationId, isBye: false, auto: 'fixture', standingsRecalculated: groupHasStandings },
    });
    createdTeamIds.push(created.id);
  }
  if (createdTeamIds.length > 0 && groupHasStandings) {
    const recalculated = await recalculateStandingsInTx(tx, tournamentId);
    await writeAdminActionLog(tx, admin, {
      action: 'tournament.bracket.standings.recalculate_auto',
      targetType: 'tournament',
      targetId: tournamentId,
      afterJson: { trigger: 'fixture_group_team_enroll', groupId, ...recalculated.audit },
    });
  }
}
```

- [ ] **Step 4: 서비스를 배선한다**

(a) import 정리 — `tournament-bracket.service.ts` 의 `old_string`:

```ts
import {
  fairPlayByRegistrationFromGroups,
  recalculateAndUpsertGroupStandings,
} from './tournament-group-standings';
import { recalculateAndUpsertOverallStandings } from './tournament-overall-standings';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from './tournament-surface-lookup';
import { loadCanonicalStandingsSource } from './tournament-standings-source';
```

`new_string`:

```ts
import { findTournamentOnSurface, TOURNAMENT_KINDS } from './tournament-surface-lookup';
import { createGroupInTx, ensureGroupPhaseTeamsInTx, recalculateStandingsInTx } from './tournament-bracket-tx';
```

(b) `createGroup` 본문 — `old_string`(`:242-263`):

```ts
    const created = await this.prisma.$transaction(async (tx) => {
      const group = await tx.v1TournamentGroup.create({
        data: {
          tournamentId,
          name: dto.name,
          phase: dto.phase ?? 'group',
          sortOrder: dto.sortOrder ?? 0,
          advanceCount: dto.advanceCount ?? null,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.bracket.group.create',
          targetType: 'tournament_group',
          targetId: group.id,
          afterJson: { tournamentId, name: group.name, phase: group.phase },
        },
        tx,
      );
      return group;
    });
```

`new_string`:

```ts
    const created = await this.prisma.$transaction((tx) =>
      createGroupInTx(tx, admin, tournamentId, {
        name: dto.name,
        phase: dto.phase ?? 'group',
        sortOrder: dto.sortOrder ?? 0,
        advanceCount: dto.advanceCount ?? null,
      }),
    );
```

(c) 두 private 메서드를 지운다 (구간 삭제 — 시작·끝 표식으로 찾으므로 줄 번호가 밀려도 안전하다):

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && python3 - <<'PY'
p = 'src/tournaments/tournament-bracket.service.ts'
s = open(p, encoding='utf-8').read()
a = s.index('  /**\n   * 조별 순위는 조 편성(V1TournamentGroupTeam) 기준으로')
b = s.index('  async createFixture(')
s = s[:a] + s[b:]
a = s.index('  /** 조별·통합 순위 전체 재계산. 호출자 tx 안에서 돌고 감사 로그는 호출자가 남긴다. */')
b = s.index('  async recalculateStandings(user: V1AuthUser, tournamentId: string) {')
s = s[:a] + s[b:]
open(p, 'w', encoding='utf-8').write(s)
PY
git diff --stat -- src/tournaments/tournament-bracket.service.ts
```

(d) 호출부 3곳을 함수 호출로 바꾼다 (`sed` 로 정확히 세 줄):

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && perl -pi -e 's/await this\.ensureGroupPhaseTeams\(tx, admin,/await ensureGroupPhaseTeamsInTx(tx, admin,/; s/await this\.recalculateStandingsInTx\(tx, /await recalculateStandingsInTx(tx, /' src/tournaments/tournament-bracket.service.ts
grep -n "this.ensureGroupPhaseTeams\|this.recalculateStandingsInTx" src/tournaments/tournament-bracket.service.ts   # 기대: 출력 없음
grep -n "ensureGroupPhaseTeamsInTx\|recalculateStandingsInTx" src/tournaments/tournament-bracket.service.ts          # 기대: import 1 + 호출 3
```

(e) 더 이상 쓰지 않는 import 를 지운다. `V1ActiveAdmin` 이 서비스에서 안 남았으면 import 에서 뺀다:

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && grep -n "V1ActiveAdmin" src/tournaments/tournament-bracket.service.ts
```

import 줄만 남아 있으면 `import { AdminContextService, type V1ActiveAdmin } from '../common/admin-context.service';` 를 `import { AdminContextService } from '../common/admin-context.service';` 로 바꾼다.

- [ ] **Step 5: 통과를 확인한다 — 새 테스트 + 옮긴 코드가 걸려 있는 기존 테스트**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "Tests:|Test Suites:|✕"
```

기대: `Tests: 95 passed, 95 total`(기존 93 + 2). 특히 `조 편성 정합`(`ensureGroupPhaseTeamsInTx`)·`recalculateStandings:` 계열·`createGroup:` 계열이 그대로 통과해야 한다 — 하나라도 깨지면 옮기면서 동작이 달라진 것이다.

- [ ] **Step 6: 타입과 래칫 게이트를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json" && node scripts/v1-surface-check.mjs; echo "exit=$?"
```

기대: `exit=0` (tsc 출력 없음, surface-check 위반 없음 — 서비스의 `v1_tournaments` raw SQL 은 `deleteFixture` 1곳 그대로).

- [ ] **Step 7: DB 통합 스펙을 만든다 (CI 에서 돈다 — 로컬은 타입만 확인)**

`apps/v1_api/test/tournaments/tournament-bracket-tx.integration-spec.ts` 를 만든다. 이후 Task 에서 `describe` 를 이어 붙이므로 마지막 줄의 표식을 유지한다.

```ts
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { createGroupInTx } from '../../src/tournaments/tournament-bracket-tx';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'bracket-tx@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const adminContext = new AdminContextService(prisma);
const bracket = new TournamentBracketService(prisma, adminContext, games);
let admin: Awaited<ReturnType<AdminContextService['getMutationAdmin']>>;

const groupAuditCount = (name: string) =>
  prisma.v1AdminActionLog.count({ where: { action: 'tournament.bracket.group.create', afterJson: { path: ['name'], equals: name } } });

describe('대진 …InTx 함수 (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
    admin = await adminContext.getMutationAdmin(user.id);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  describe('createGroupInTx', () => {
    it('바깥 트랜잭션이 롤백되면 그룹과 감사 로그가 함께 사라진다 (여러 변경을 한 트랜잭션에 묶을 수 있다)', async () => {
      await expect(prisma.$transaction(async (tx) => {
        await createGroupInTx(tx, admin, ids.tournamentId, { name: 'tx-rollback', phase: 'group', sortOrder: 9, advanceCount: null });
        throw new Error('rollback');
      })).rejects.toThrow('rollback');

      expect(await prisma.v1TournamentGroup.count({ where: { tournamentId: ids.tournamentId, name: 'tx-rollback' } })).toBe(0);
      expect(await groupAuditCount('tx-rollback')).toBe(0);
    });

    it('커밋되면 둘 다 남는다 (대조군) — 서비스 createGroup 도 같은 함수를 탄다', async () => {
      const viaService = await bracket.createGroup(user, ids.tournamentId, { name: 'tx-commit', phase: 'group' });

      expect(await prisma.v1TournamentGroup.count({ where: { id: viaService.id } })).toBe(1);
      expect(await groupAuditCount('tx-commit')).toBe(1);
    });
  });

  // ─── 통합 스펙 끝 (새 describe 는 이 줄 위에 추가한다) ───
});
```

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"; echo "exit=$?"   # 타입만 확인. 실행은 CI(DATABASE_URL 있는 환경)
```

- [ ] **Step 8: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git add apps/v1_api/src/tournaments/tournament-bracket-tx.ts apps/v1_api/test/tournaments/tournament-bracket-tx.integration-spec.ts && git commit -m "refactor(v1-api): 조 생성·순위 재계산·조 편성 보조를 tournament-bracket-tx 함수로 추출" -- \
  apps/v1_api/src/tournaments/tournament-bracket-tx.ts apps/v1_api/src/tournaments/tournament-bracket.service.ts \
  apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts apps/v1_api/test/tournaments/tournament-bracket-tx.integration-spec.ts && git show --stat HEAD
```

---

### Task 7: 경기 수정의 트랜잭션 본문을 `updateTournamentFixtureInTx` 로 추출하고 `assignTournamentFixtureSideInTx` 를 얹는다

`updateFixture` 의 tx 안 로직(부전승 가드 · 조 편성 · `updateTournamentMatchInTx` · 감사)을 함수로 옮긴다. `updateFixture` 는 일정·장소·번호·두 사이드를 **한 번에** 바꾸므로(기존 spec 이 `updateTournamentMatchInTx` 를 한 번 호출하는 raw 순서에 의존) 일반형 `updateTournamentFixtureInTx` 를 두고, 계약의 `assignTournamentFixtureSideInTx` 는 한 사이드만 바꾸는 얇은 래퍼로 만든다. 선검증(확정 등록·같은 팀·결과·부전승)은 `updateFixture` 의 tx 밖 가드와 `updateTournamentMatchInTx` 안 가드가 이미 나눠 갖고 있어 그대로 둔다.

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournament-bracket-tx.ts` (함수·타입 추가)
- Modify: `apps/v1_api/src/tournaments/tournament-bracket.service.ts` (`updateFixture` :955-997 의 `$transaction` 블록, import :62)
- Test: `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts` (`…InTx 추출 함수 끝` 표식 위)

**Interfaces:** Consumes: `ensureGroupPhaseTeamsInTx`(Task 6), `updateTournamentMatchInTx`(`tournament-match-update.ts:28`), `writeAdminActionLog`(Task 3). Produces:
```ts
export type BracketTxDeps = { games: GamesService };
export type TournamentFixtureUpdateInput = { fixtureId: string; tournamentId: string; groupId: string | null; fixtureNumber?: number;
  scheduledAt?: Date | null; venue?: string; homeRegistrationId?: string | null; awayRegistrationId?: string | null };
export async function updateTournamentFixtureInTx(tx: Prisma.TransactionClient, admin: V1ActiveAdmin, input: TournamentFixtureUpdateInput):
  Promise<Awaited<ReturnType<typeof updateTournamentMatchInTx>>>
export async function assignTournamentFixtureSideInTx(tx: Prisma.TransactionClient, deps: BracketTxDeps, admin: V1ActiveAdmin,
  input: { fixtureId: string; side: 'HOME' | 'AWAY'; registrationId: string | null }): Promise<void>
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tournament-bracket.service.spec.ts` import 에 추가:

```ts
import { assignTournamentFixtureSideInTx } from './tournament-bracket-tx';
```

(기존 `import { createGroupInTx } from './tournament-bracket-tx';` 는 하나로 합쳐 `import { assignTournamentFixtureSideInTx, createGroupInTx } from './tournament-bracket-tx';` 로 만든다.)

`      // ─── …InTx 추출 함수 끝` 표식 줄(`  // ─── …InTx 추출 함수 끝 (새 describe 는 이 줄 위에 추가한다) ───`) **바로 위**에 추가한다.

```ts
  describe('assignTournamentFixtureSideInTx', () => {
    const resultRow = { id: 'fixture-1', tournamentId: 'tournament-1', title: '테스트 경기', startAt: null, placeName: null, status: 'matched', createdAt: new Date('2026-06-14T00:00:00Z'), updatedAt: new Date('2026-06-14T00:00:00Z') };
    const arrange = () => {
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue({ tournamentId: 'tournament-1', groupId: 'group-1' });
      queueFixtureUpdateRaw(prisma.$queryRaw, { id: 'game-1', state: 'SCHEDULED', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: null }, { id: 'fixture-1', deletedAt: null });
      prisma.v1TeamMatch.update.mockResolvedValue(resultRow);
    };

    it('어웨이를 null 로 비우면 어웨이 사이드만 "미정" 으로 돌아가고 홈은 건드리지 않는다', async () => {
      arrange();
      prisma.v1TournamentRegistration.findMany.mockResolvedValue([{ id: 'reg-1', teamId: 'team-old', team: { name: '홈' } }]);

      await assignTournamentFixtureSideInTx(prisma as never, { games } as never, activeAdmin, { fixtureId: 'fixture-1', side: 'AWAY', registrationId: null });

      expect(prisma.v1TournamentMatchDetails.update).toHaveBeenCalledWith({
        where: { teamMatchId: 'fixture-1' },
        data: { homeRegistrationId: 'reg-1', awayRegistrationId: null },
      });
      expect(prisma.v1GameSide.update).toHaveBeenCalledTimes(1);
      expect(prisma.v1GameSide.update).toHaveBeenCalledWith({
        where: { id: 'side-away' },
        data: { teamId: null, displayNameSnapshot: '어웨이 팀 미정' },
      });
      expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ adminUserId: 'owner-admin-id', action: 'tournament.bracket.fixture.update', targetId: 'fixture-1' }),
      });
    });

    it('홈에 팀을 넣으면 홈 사이드만 바뀌고 어웨이 배정은 그대로다 (대조군)', async () => {
      arrange();
      prisma.v1TournamentRegistration.findMany.mockResolvedValue([
        { id: 'reg-3', teamId: 'team-new', team: { name: '새 팀' } },
        { id: 'reg-2', teamId: 'team-away', team: { name: '어웨이 팀' } },
      ]);

      await assignTournamentFixtureSideInTx(prisma as never, { games } as never, activeAdmin, { fixtureId: 'fixture-1', side: 'HOME', registrationId: 'reg-3' });

      expect(prisma.v1TournamentMatchDetails.update).toHaveBeenCalledWith({
        where: { teamMatchId: 'fixture-1' },
        data: { homeRegistrationId: 'reg-3', awayRegistrationId: 'reg-2' },
      });
      expect(prisma.v1GameSide.update).toHaveBeenCalledTimes(1);
      expect(prisma.v1GameSide.update).toHaveBeenCalledWith({ where: { id: 'side-home' }, data: expect.objectContaining({ teamId: 'team-new' }) });
    });

    it('없는 경기는 404 이고 아무것도 쓰지 않는다', async () => {
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(null);

      await expect(
        assignTournamentFixtureSideInTx(prisma as never, { games } as never, activeAdmin, { fixtureId: 'ghost', side: 'HOME', registrationId: 'reg-1' }),
      ).rejects.toMatchObject({ response: { code: 'FIXTURE_NOT_FOUND' } });
      expect(prisma.v1TournamentMatchDetails.update).not.toHaveBeenCalled();
      expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: 실패를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "TS2305|has no exported member|Tests:|Test Suites:"
```

기대: `Module '"./tournament-bracket-tx"' has no exported member 'assignTournamentFixtureSideInTx'` 로 FAIL.

- [ ] **Step 3: 구현한다 — `tournament-bracket-tx.ts` 에 추가**

파일 위쪽 import 를 다음처럼 늘린다 (기존 줄 위에 이어 붙임):

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { GamesService } from '../games/games.service';
import { updateTournamentMatchInTx } from './tournament-match-update';
```

(`NotFoundException` 은 이미 import 돼 있으므로 `import { ConflictException, NotFoundException } from '@nestjs/common';` 한 줄로 합친다.)

파일 끝에 추가:

```ts
/** `createEmptyTournamentFixtureInTx` 와 같은 자리에 쓰는 외부 의존. 사이드 배정은 이 중 아무것도 쓰지 않는다. */
export type BracketTxDeps = { games: GamesService };

export type TournamentFixtureUpdateInput = {
  fixtureId: string;
  tournamentId: string;
  groupId: string | null;
  fixtureNumber?: number;
  scheduledAt?: Date | null;
  venue?: string;
  homeRegistrationId?: string | null;
  awayRegistrationId?: string | null;
};

/**
 * 일정·장소·번호·두 사이드를 한 번에 바꾼다(`PATCH /admin/fixtures/:id` 의 tx 본문). 팀을 바꾸는 요청이면
 * 부전승 팀을 거절하고 조별리그 조에 편성한 뒤, 사이드·팀 일정·명단 재계산 이벤트는 `updateTournamentMatchInTx` 가 맡는다.
 * undefined 인 필드는 건드리지 않고 null 은 "미정으로 비움" 이다.
 */
export async function updateTournamentFixtureInTx(tx: Tx, admin: V1ActiveAdmin, input: TournamentFixtureUpdateInput) {
  const changesTeams = input.homeRegistrationId !== undefined || input.awayRegistrationId !== undefined;
  if (input.groupId && changesTeams) {
    const byeTeam = await tx.v1TournamentGroupTeam.findFirst({ where: {
      groupId: input.groupId, isBye: true,
      registrationId: { in: [input.homeRegistrationId, input.awayRegistrationId].filter((id): id is string => typeof id === 'string') },
    } });
    if (byeTeam) throw new ConflictException({ code: 'BYE_TEAM_HAS_MATCH', message: '부전승팀은 해당 라운드의 경기에 넣을 수 없어요. 다음 라운드에 직접 배정해 주세요.' });
    const group = await tx.v1TournamentGroup.findFirst({ where: { id: input.groupId }, select: { phase: true } });
    if (group) await ensureGroupPhaseTeamsInTx(tx, admin, input.tournamentId, input.groupId, group.phase, [input.homeRegistrationId, input.awayRegistrationId]);
  }
  const previousNumber = input.fixtureNumber === undefined ? undefined : (await tx.v1TournamentMatchDetails.findUniqueOrThrow({
    where: { teamMatchId: input.fixtureId }, select: { fixtureNumber: true },
  })).fixtureNumber;
  const row = await updateTournamentMatchInTx(tx, {
    teamMatchId: input.fixtureId,
    fixtureNumber: input.fixtureNumber,
    scheduledAt: input.scheduledAt,
    venue: input.venue,
    homeRegistrationId: input.homeRegistrationId,
    awayRegistrationId: input.awayRegistrationId,
  });
  await writeAdminActionLog(tx, admin, {
    action: 'tournament.bracket.fixture.update',
    targetType: 'team_match',
    targetId: input.fixtureId,
    ...(previousNumber === undefined ? {} : { beforeJson: { fixtureNumber: previousNumber } }),
    afterJson: {
      fixtureNumber: row.fixtureNumber,
      scheduledAt: row.startAt?.toISOString() ?? null,
      venue: row.placeName,
      homeRegistrationId: row.homeRegistrationId,
      awayRegistrationId: row.awayRegistrationId,
    },
  });
  return row;
}

/**
 * 한 경기의 한쪽 사이드에 팀을 넣거나(null 이면 비운다) 반대쪽은 그대로 둔다. 자리 서비스(PR-1b)가 자리에 연결된
 * 경기마다 부른다. 호출자가 대회 advisory lock 을 잡고 있어야 한다. `deps` 는 계약 시그니처를 맞추는 자리로,
 * 사이드 배정 자체는 `GamesService` 를 쓰지 않는다.
 */
export async function assignTournamentFixtureSideInTx(
  tx: Tx,
  _deps: BracketTxDeps,
  admin: V1ActiveAdmin,
  input: { fixtureId: string; side: 'HOME' | 'AWAY'; registrationId: string | null },
): Promise<void> {
  const details = await tx.v1TournamentMatchDetails.findUnique({
    where: { teamMatchId: input.fixtureId },
    select: { tournamentId: true, groupId: true },
  });
  if (details === null) throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
  await updateTournamentFixtureInTx(tx, admin, {
    fixtureId: input.fixtureId,
    tournamentId: details.tournamentId,
    groupId: details.groupId,
    ...(input.side === 'HOME' ? { homeRegistrationId: input.registrationId } : { awayRegistrationId: input.registrationId }),
  });
}
```

- [ ] **Step 4: `updateFixture` 가 새 함수를 호출하게 한다**

`tournament-bracket.service.ts` Edit — `old_string`(`:955-997`, `$transaction` 블록 전체):

```ts
      const updated = await this.prisma.$transaction(async (tx) => {
        // Same lock as assignment/creation: a concurrent bye designation cannot
        // race between the participant check and the canonical match update.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${canonical.tournamentId}`}, 0))`;
        if (canonical.groupId && changesTeams) {
          const byeTeam = await tx.v1TournamentGroupTeam.findFirst({ where: {
            groupId: canonical.groupId, isBye: true,
            registrationId: { in: [dto.homeRegistrationId, dto.awayRegistrationId].filter((id): id is string => typeof id === 'string') },
          } });
          if (byeTeam) throw new ConflictException({ code: 'BYE_TEAM_HAS_MATCH', message: '부전승팀은 해당 라운드의 경기에 넣을 수 없어요. 다음 라운드에 직접 배정해 주세요.' });
          const group = await tx.v1TournamentGroup.findFirst({ where: { id: canonical.groupId }, select: { phase: true } });
          if (group) await ensureGroupPhaseTeamsInTx(tx, admin, canonical.tournamentId, canonical.groupId, group.phase, [dto.homeRegistrationId, dto.awayRegistrationId]);
        }
        const previousNumber = dto.fixtureNumber === undefined ? undefined : (await tx.v1TournamentMatchDetails.findUniqueOrThrow({
          where: { teamMatchId: fixtureId }, select: { fixtureNumber: true },
        })).fixtureNumber;
        const row = await updateTournamentMatchInTx(tx, {
          teamMatchId: fixtureId,
          fixtureNumber: dto.fixtureNumber,
          scheduledAt: dto.scheduledAt !== undefined ? new Date(dto.scheduledAt) : undefined,
          venue: dto.venue,
          homeRegistrationId: dto.homeRegistrationId,
          awayRegistrationId: dto.awayRegistrationId,
        });
        await this.adminContext.logAdminAction(
          admin,
          {
            action: 'tournament.bracket.fixture.update',
            targetType: 'team_match',
            targetId: fixtureId,
            ...(previousNumber === undefined ? {} : { beforeJson: { fixtureNumber: previousNumber } }),
            afterJson: {
              fixtureNumber: row.fixtureNumber,
              scheduledAt: row.startAt?.toISOString() ?? null,
              venue: row.placeName,
              homeRegistrationId: row.homeRegistrationId,
              awayRegistrationId: row.awayRegistrationId,
            },
          },
          tx,
        );
        return row;
      });
```

`new_string`:

```ts
      const updated = await this.prisma.$transaction(async (tx) => {
        // Same lock as assignment/creation: a concurrent bye designation cannot
        // race between the participant check and the canonical match update.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${canonical.tournamentId}`}, 0))`;
        return updateTournamentFixtureInTx(tx, admin, {
          fixtureId,
          tournamentId: canonical.tournamentId,
          groupId: canonical.groupId,
          fixtureNumber: dto.fixtureNumber,
          scheduledAt: dto.scheduledAt !== undefined ? new Date(dto.scheduledAt) : undefined,
          venue: dto.venue,
          homeRegistrationId: dto.homeRegistrationId,
          awayRegistrationId: dto.awayRegistrationId,
        });
      });
```

import 정리 — `old_string`:

```ts
import { updateTournamentMatchInTx } from './tournament-match-update';
```

를 **삭제**(빈 줄 남기지 않음)하고, Task 6 에서 만든 tx import 줄을 늘린다:

```ts
import { createGroupInTx, ensureGroupPhaseTeamsInTx, recalculateStandingsInTx, updateTournamentFixtureInTx } from './tournament-bracket-tx';
```

그다음 서비스에 남은 `ensureGroupPhaseTeamsInTx` 사용처를 확인한다(`createFixture` 한 곳이어야 한다):

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && grep -n "ensureGroupPhaseTeamsInTx\|updateTournamentMatchInTx\|changesTeams" src/tournaments/tournament-bracket.service.ts
```

기대: `ensureGroupPhaseTeamsInTx` 는 import 와 `createFixture` 호출 2줄, `updateTournamentMatchInTx` 는 없음, `changesTeams` 는 `updateFixture` 선검증에서만(`const changesTeams` 와 `if (changesTeams && …)`).

- [ ] **Step 5: 통과를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "Tests:|Test Suites:|✕"
```

기대: `Tests: 98 passed, 98 total`(95 + 3). 기존 `updateFixture:` 8개·`조 편성 정합` 의 `조별 경기의 팀을 바꾸면 새 팀이 그 조에 편성된다`·`OFFICIAL 경기의 번호만 수정하고 변경 전·후 번호를 감사에 남긴다` 가 그대로 통과해야 한다(추출 전후 동작 보존의 근거).

- [ ] **Step 6: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git commit -m "refactor(v1-api): 경기 수정 본문을 updateTournamentFixtureInTx 로 추출하고 사이드 배정 함수 추가" -- \
  apps/v1_api/src/tournaments/tournament-bracket-tx.ts apps/v1_api/src/tournaments/tournament-bracket.service.ts \
  apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts && git show --stat HEAD
```

---

### Task 8: 자리에 연결된 사이드는 `PATCH /admin/fixtures/:id` 로 못 바꾼다 (`SLOT_LINKED`)

자리 서비스(PR-1b)만 자리 연결 사이드를 바꿀 수 있다 — `assignTournamentFixtureSideInTx` 는 이 가드를 타지 않고, 가드는 `updateFixture` 서비스 메서드에만 있다. 기존 `BRACKET_SOURCE_SLOT_LINKED`(진출 연결 사이드, `tournament-match-update.ts`)와 같은 원칙이다.

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournament-bracket-tx.ts` (순수 가드 추가)
- Modify: `apps/v1_api/src/tournaments/tournament-bracket.service.ts` (`updateFixture` 선검증 :893-921)
- Test: `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts` (`canonicalDetailsRow` :147-185 의 `teamMatch` 에 슬롯 id 두 개 추가 + 새 `describe`)

**Interfaces:** Produces:
```ts
export function assertSidesNotSlotLinked(
  current: { homeSlotId: string | null; awaySlotId: string | null; homeRegistrationId: string | null; awayRegistrationId: string | null },
  change: { homeRegistrationId?: string | null; awayRegistrationId?: string | null },
): void   // 위반 시 ConflictException { code: 'SLOT_LINKED' }
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

(a) 목 데이터를 스키마에 맞춘다 — `canonicalDetailsRow()` 의 `teamMatch` 에 두 필드를 넣는다. `old_string`:

```ts
      status: 'matched',
      createdAt: new Date('2026-06-14T00:00:00Z'),
      updatedAt: new Date('2026-06-14T00:00:00Z'),
      _count: { operationAudits: 0 },
```

`new_string`:

```ts
      status: 'matched',
      homeSlotId: null,
      awaySlotId: null,
      createdAt: new Date('2026-06-14T00:00:00Z'),
      updatedAt: new Date('2026-06-14T00:00:00Z'),
      _count: { operationAudits: 0 },
```

(b) import 를 `import { assertSidesNotSlotLinked, assignTournamentFixtureSideInTx, createGroupInTx } from './tournament-bracket-tx';` 로 늘리고, `…InTx 추출 함수 끝` 표식 위에 추가한다.

```ts
  describe('assertSidesNotSlotLinked', () => {
    const current = { homeSlotId: 'slot-h', awaySlotId: null, homeRegistrationId: 'reg-1', awayRegistrationId: 'reg-2' };

    it('자리에 연결된 사이드를 다른 팀으로 바꾸거나 비우려 하면 SLOT_LINKED', () => {
      expect(() => assertSidesNotSlotLinked(current, { homeRegistrationId: 'reg-3' })).toThrow(
        expect.objectContaining({ response: expect.objectContaining({ code: 'SLOT_LINKED' }) }),
      );
      expect(() => assertSidesNotSlotLinked(current, { homeRegistrationId: null })).toThrow(
        expect.objectContaining({ response: expect.objectContaining({ code: 'SLOT_LINKED' }) }),
      );
    });

    it('자리에 연결되지 않은 반대쪽 사이드는 자유롭게 바꾼다 (대조군)', () => {
      expect(() => assertSidesNotSlotLinked(current, { awayRegistrationId: 'reg-3' })).not.toThrow();
      expect(() => assertSidesNotSlotLinked(current, { awayRegistrationId: null })).not.toThrow();
    });

    it('연결된 사이드라도 현재와 같은 값이거나 보내지 않았으면 통과한다 (일정·장소만 고치는 요청)', () => {
      expect(() => assertSidesNotSlotLinked(current, { homeRegistrationId: 'reg-1' })).not.toThrow();
      expect(() => assertSidesNotSlotLinked(current, {})).not.toThrow();
    });

    it('원정 쪽만 연결돼 있으면 원정만 막는다', () => {
      const awayLinked = { ...current, homeSlotId: null, awaySlotId: 'slot-a' };
      expect(() => assertSidesNotSlotLinked(awayLinked, { awayRegistrationId: 'reg-9' })).toThrow(
        expect.objectContaining({ response: expect.objectContaining({ code: 'SLOT_LINKED' }) }),
      );
      expect(() => assertSidesNotSlotLinked(awayLinked, { homeRegistrationId: 'reg-9' })).not.toThrow();
    });
  });

  describe('updateFixture 의 SLOT_LINKED 배선', () => {
    const linkedRow = (slots: { homeSlotId: string | null; awaySlotId: string | null }, official = false) => canonicalDetailsRow({
      teamMatch: {
        ...canonicalDetailsRow().teamMatch,
        ...slots,
        game: { ...canonicalDetailsRow().teamMatch.game, ...(official ? { currentOfficialRevisionId: 'revision-1', currentOfficialRevision: { state: 'OFFICIAL' } } : {}) },
      },
    });

    it('홈이 자리에 연결된 경기의 홈을 PATCH 로 바꾸면 409 SLOT_LINKED 이고 트랜잭션도 열지 않는다', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(linkedRow({ homeSlotId: 'slot-h', awaySlotId: null }));

      await expect(service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' })).rejects.toMatchObject({
        response: { code: 'SLOT_LINKED' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('연결되지 않은 홈을 바꾸는 요청은 SLOT_LINKED 를 거치지 않고 다음 가드(결과 잠금)까지 간다 (대조군)', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(linkedRow({ homeSlotId: null, awaySlotId: 'slot-a' }, true));

      await expect(service.updateFixture(ownerUser, 'fixture-1', { homeRegistrationId: 'reg-3' })).rejects.toMatchObject({
        response: { code: 'FIXTURE_HAS_RESULT' },
      });
    });
  });
```

- [ ] **Step 2: 실패를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "TS2305|has no exported member|Tests:"
```

기대: `has no exported member 'assertSidesNotSlotLinked'` 로 FAIL.

- [ ] **Step 3: 순수 가드를 구현한다 — `tournament-bracket-tx.ts` 끝에 추가**

```ts
/**
 * 자리(slot)에 연결된 사이드의 팀은 자리 서비스만 바꾼다. 경기 수정 API 가 직접 바꾸면 자리와 경기가 어긋난다.
 * 현재 값과 같은 값이거나 보내지 않은 쪽은 허용한다(일정·장소만 고치는 요청이 막히면 안 된다).
 */
export function assertSidesNotSlotLinked(
  current: { homeSlotId: string | null; awaySlotId: string | null; homeRegistrationId: string | null; awayRegistrationId: string | null },
  change: { homeRegistrationId?: string | null; awayRegistrationId?: string | null },
): void {
  const homeChanged = change.homeRegistrationId !== undefined && change.homeRegistrationId !== current.homeRegistrationId;
  const awayChanged = change.awayRegistrationId !== undefined && change.awayRegistrationId !== current.awayRegistrationId;
  if ((current.homeSlotId !== null && homeChanged) || (current.awaySlotId !== null && awayChanged)) {
    throw new ConflictException({
      code: 'SLOT_LINKED',
      message: '대진 자리에 연결된 팀은 경기에서 직접 바꿀 수 없어요. 자리에서 팀을 바꿔 주세요.',
    });
  }
}
```

- [ ] **Step 4: `updateFixture` 선검증에 건다**

`tournament-bracket.service.ts` Edit 두 번.

(a) 조회 select — `old_string`:

```ts
        teamMatch: {
          select: {
            deletedAt: true,
            game: { select: { id: true, sourceType: true, state: true, currentOfficialRevision: { select: { state: true } } } },
          },
        },
```

`new_string`:

```ts
        teamMatch: {
          select: {
            deletedAt: true,
            homeSlotId: true,
            awaySlotId: true,
            game: { select: { id: true, sourceType: true, state: true, currentOfficialRevision: { select: { state: true } } } },
          },
        },
```

(b) 가드 호출 — `old_string`:

```ts
      const changesTeams = dto.homeRegistrationId !== undefined || dto.awayRegistrationId !== undefined;
```

`new_string`:

```ts
      assertSidesNotSlotLinked(
        {
          homeSlotId: canonical.teamMatch.homeSlotId,
          awaySlotId: canonical.teamMatch.awaySlotId,
          homeRegistrationId: canonical.homeRegistrationId,
          awayRegistrationId: canonical.awayRegistrationId,
        },
        { homeRegistrationId: dto.homeRegistrationId, awayRegistrationId: dto.awayRegistrationId },
      );
      const changesTeams = dto.homeRegistrationId !== undefined || dto.awayRegistrationId !== undefined;
```

import 줄에 `assertSidesNotSlotLinked` 를 더한다:
`import { assertSidesNotSlotLinked, createGroupInTx, ensureGroupPhaseTeamsInTx, recalculateStandingsInTx, updateTournamentFixtureInTx } from './tournament-bracket-tx';`

- [ ] **Step 5: 통과를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "Tests:|Test Suites:|✕"
```

기대: `Tests: 104 passed, 104 total`(98 + 6).

- [ ] **Step 6: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git commit -m "feat(v1-api): 자리에 연결된 사이드는 경기 수정으로 직접 바꿀 수 없게 막는다 (SLOT_LINKED)" -- \
  apps/v1_api/src/tournaments/tournament-bracket-tx.ts apps/v1_api/src/tournaments/tournament-bracket.service.ts \
  apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts && git show --stat HEAD
```

---

### Task 9: 경기 소프트 삭제를 `softDeleteTournamentFixtureInTx` 로 추출하고 자리 연결을 같이 푼다

`deleteFixture` 의 락 이후 본문(경기 잠금 → 가드 → Game 취소 → TeamMatch archived)을 함수로 옮기고, `V1TeamMatch.update` 에 `homeSlotId: null, awaySlotId: null` 을 같은 update 로 더한다. 경기가 빠지는데 자리 연결이 남으면 자리 삭제가 FK(Restrict)로 막힌다. **대회 행 `FOR UPDATE` + 대회 종류 재검증(`findTournamentOnSurface`)은 서비스에 남긴다** — `v1_tournaments` raw SQL baseline 이 `tournament-bracket.service.ts` 1곳이고, 템플릿 교체(PR-1b)는 이미 자기 락을 잡은 채 이 함수를 여러 번 부르기 때문이다.

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournament-bracket-tx.ts`
- Modify: `apps/v1_api/src/tournaments/tournament-bracket.service.ts` (`deleteFixture` :1004-1044, import :50)
- Test: `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts` (기존 단언 1개 수정 + 새 `describe`)

**Interfaces:** Produces:
```ts
export async function softDeleteTournamentFixtureInTx(tx: Prisma.TransactionClient, admin: V1ActiveAdmin, fixtureId: string): Promise<void>
// 전제: 호출자가 league-fixture-generation advisory lock 과 대회 행 잠금을 이미 잡았다. 자기 경기의 Game→TeamMatch 행 잠금만 잡는다.
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

(a) 기존 단언을 새 계약으로 바꾼다 — `deleteFixture: pre-start scheduled match is removed …` 안의 `old_string`:

```ts
    expect(prisma.v1TeamMatch.update).toHaveBeenCalledWith({ where: { id: 'fixture-1' }, data: { status: 'archived', deletedAt: expect.any(Date) } });
```

`new_string`:

```ts
    expect(prisma.v1TeamMatch.update).toHaveBeenCalledWith({ where: { id: 'fixture-1' }, data: { status: 'archived', deletedAt: expect.any(Date), homeSlotId: null, awaySlotId: null } });
```

(b) import 를 `import { assertSidesNotSlotLinked, assignTournamentFixtureSideInTx, createGroupInTx, softDeleteTournamentFixtureInTx } from './tournament-bracket-tx';` 로 늘리고, 표식 위에 추가한다.

```ts
  describe('softDeleteTournamentFixtureInTx', () => {
    const linkedRow = (overrides: { gameState?: string } = {}) => canonicalDetailsRow({
      teamMatch: {
        ...canonicalDetailsRow().teamMatch,
        homeSlotId: 'slot-h',
        awaySlotId: 'slot-a',
        game: { ...canonicalDetailsRow().teamMatch.game, state: overrides.gameState ?? 'SCHEDULED' },
      },
    });

    it('자리에 연결된 경기를 지우면 두 자리 연결이 같은 update 로 풀린다 (자리 삭제가 FK 로 막히지 않게)', async () => {
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(linkedRow());

      await softDeleteTournamentFixtureInTx(prisma as never, activeAdmin, 'fixture-1');

      expect(prisma.v1TeamMatch.update).toHaveBeenCalledTimes(1);
      expect(prisma.v1TeamMatch.update).toHaveBeenCalledWith({
        where: { id: 'fixture-1' },
        data: { status: 'archived', deletedAt: expect.any(Date), homeSlotId: null, awaySlotId: null },
      });
      expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ targetId: 'fixture-1', toStatus: 'archived', actorType: 'admin', actorUserId: 'owner-user-id' }),
      });
    });

    it('시작된 경기는 지우지 못하고 자리 연결도 그대로 둔다', async () => {
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(linkedRow({ gameState: 'LIVE' }));

      await expect(softDeleteTournamentFixtureInTx(prisma as never, activeAdmin, 'fixture-1')).rejects.toMatchObject({
        response: { code: 'FIXTURE_ALREADY_STARTED' },
      });
      expect(prisma.v1TeamMatch.update).not.toHaveBeenCalled();
    });

    it('대회 행 잠금은 호출자의 몫이다 — 이 함수는 v1_tournaments 를 raw 로 건드리지 않는다', async () => {
      prisma.v1TournamentMatchDetails.findUnique.mockResolvedValue(linkedRow());

      await softDeleteTournamentFixtureInTx(prisma as never, activeAdmin, 'fixture-1');

      const sql = prisma.$queryRaw.mock.calls.map((call) => Array.from(call[0] as readonly string[]).join('?'));
      expect(sql.length).toBeGreaterThan(0);
      expect(sql.some((text) => /\bv1_tournaments\b/.test(text))).toBe(false);
      expect(sql.some((text) => text.includes('v1_games'))).toBe(true);
    });
  });
```

- [ ] **Step 2: 실패를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "has no exported member|Tests:|✕"
```

기대: `no exported member 'softDeleteTournamentFixtureInTx'` 로 FAIL.

- [ ] **Step 3: 구현한다 — `tournament-bracket-tx.ts`**

import 를 보강한다 (`@prisma/client` 줄은 값 import `V1GameSourceType` 를 더해 `import { Prisma, V1GameSourceType, type V1TournamentGroup, type V1TournamentGroupPhase } from '@prisma/client';`).

```ts
import { cascadeCancelTeamMatchSchedulesInTx } from '../team-schedules/team-schedules.service';
```

파일 끝에 추가:

```ts
/**
 * 시작 전 경기를 숨긴다(Game·감사 이력은 지우지 않는다). 자리 연결(`homeSlotId`·`awaySlotId`)도 같은 update 로 푼다.
 * 경기 한 건의 Game→TeamMatch 행만 잠그며 대회 행·advisory lock 은 호출자가 잡는다.
 */
export async function softDeleteTournamentFixtureInTx(tx: Tx, admin: V1ActiveAdmin, fixtureId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM v1_games WHERE team_match_id = ${fixtureId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM v1_team_matches WHERE id = ${fixtureId} FOR UPDATE`;
  const canonical = await tx.v1TournamentMatchDetails.findUnique({ where: { teamMatchId: fixtureId },
    include: { tournament: true, teamMatch: { include: { game: true } } } });
  if (!canonical || canonical.teamMatch.deletedAt !== null) throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
  const game = canonical.teamMatch.game;
  if (!game || game.sourceType !== V1GameSourceType.TEAM_MATCH) throw new ConflictException({ code: 'TOURNAMENT_MATCH_GAME_MISSING', message: '대회 경기의 정본 TeamMatch 게임을 찾을 수 없어요.' });
  if (game.currentOfficialRevisionId !== null) throw new ConflictException({ code: 'FIXTURE_HAS_RESULT', message: '결과가 기록된 경기는 삭제할 수 없어요.' });
  if (!['draft', 'open', 'closed'].includes(canonical.tournament.status) || game.state !== 'SCHEDULED' || canonical.teamMatch.status !== 'matched') {
    throw new ConflictException({ code: 'FIXTURE_ALREADY_STARTED', message: '대회 시작 전의 아직 시작하지 않은 경기만 삭제할 수 있어요.' });
  }
  await tx.$queryRaw`SELECT g.id FROM v1_games g JOIN v1_tournament_match_advancement_edges e ON g.team_match_id = e.target_team_match_id WHERE e.source_team_match_id = ${fixtureId} ORDER BY g.id FOR UPDATE OF g`;
  const linked = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { sourceTeamMatchId: fixtureId }, include: { target: { include: { teamMatch: { include: { game: true } } } } } });
  if (linked.some((edge) => edge.target.homeRegistrationId !== null || edge.target.awayRegistrationId !== null || edge.target.teamMatch.game?.state !== 'SCHEDULED' || edge.target.teamMatch.game.currentOfficialRevisionId !== null)) {
    throw new ConflictException({ code: 'FIXTURE_DOWNSTREAM_ASSIGNED', message: '연결된 다음 경기의 팀 배정을 먼저 해제해 주세요. 시작된 다음 경기가 있으면 삭제할 수 없어요.' });
  }
  const children = await tx.v1TournamentMatchDetails.findMany({ where: { parentTeamMatchId: fixtureId, teamMatch: { deletedAt: null } }, select: { teamMatchId: true } });
  if (children.length) throw new ConflictException({ code: 'FIXTURE_HAS_CHILDREN', message: '연결된 하위 경기를 먼저 삭제해 주세요.' });
  await cascadeCancelTeamMatchSchedulesInTx(tx, fixtureId, 'admin_bracket_deleted_before_start');
  await tx.v1Game.update({ where: { id: game.id }, data: { state: 'CANCELLED', version: { increment: 1 } } });
  await tx.v1GameVisibilityPolicy.update({ where: { gameId: game.id }, data: { mode: 'STATUS_ONLY', lineupAt: null, version: { increment: 1 } } });
  await tx.v1TeamMatch.update({ where: { id: fixtureId }, data: { status: 'archived', deletedAt: new Date(), homeSlotId: null, awaySlotId: null } });
  await tx.v1TournamentMatchAdvancementEdge.deleteMany({ where: { OR: [{ sourceTeamMatchId: fixtureId }, { targetTeamMatchId: fixtureId }] } });
  // Free the original round/number unique key; the original identity is retained in the audit below.
  await tx.v1TournamentMatchDetails.update({ where: { teamMatchId: fixtureId }, data: { groupId: null, parentTeamMatchId: null, round: canonical.round + ':deleted:' + fixtureId } });
  await tx.v1StatusChangeLog.create({ data: { targetType: 'team_match', targetId: fixtureId, fromStatus: canonical.teamMatch.status, toStatus: 'archived', actorType: 'admin', actorUserId: admin.userId, reason: 'admin_bracket_deleted_before_start' } });
  await writeAdminActionLog(tx, admin, { action: 'tournament.bracket.fixture.delete', targetType: 'team_match', targetId: fixtureId,
    beforeJson: { tournamentId: canonical.tournamentId, groupId: canonical.groupId, round: canonical.round, fixtureNumber: canonical.fixtureNumber, legNumber: canonical.legNumber },
    afterJson: { deleted: true, gameId: game.id, state: 'CANCELLED' } });
}
```

- [ ] **Step 4: `deleteFixture` 가 호출하게 한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && python3 - <<'PY'
p = 'src/tournaments/tournament-bracket.service.ts'
s = open(p, encoding='utf-8').read()
a = s.index('  async deleteFixture(')
start = s.index("      await tx.$queryRaw`SELECT id FROM v1_games WHERE team_match_id = ${fixtureId} FOR UPDATE`;", a)
end = s.index('      return { deleted: true };', start)
s = s[:start] + '      await softDeleteTournamentFixtureInTx(tx, admin, fixtureId);\n' + s[end:]
open(p, 'w', encoding='utf-8').write(s)
PY
sed -n '/async deleteFixture(/,/^  }$/p' src/tournaments/tournament-bracket.service.ts
```

기대 출력(이대로여야 한다):

```ts
  async deleteFixture(user: V1AuthUser, fixtureId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const initial = await this.prisma.v1TournamentMatchDetails.findUnique({ where: { teamMatchId: fixtureId } });
    if (!initial) throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${initial.tournamentId}`}, 0))`;
      await tx.$queryRaw`SELECT id FROM v1_tournaments WHERE id = ${initial.tournamentId} FOR UPDATE`;
      const tournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, { where: { id: initial.tournamentId, deletedAt: null } });
      if (!tournament) throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
      await softDeleteTournamentFixtureInTx(tx, admin, fixtureId);
      return { deleted: true };
    });
  }
```

import 를 고친다 — `import { cascadeCancelTeamMatchSchedulesInTx } from '../team-schedules/team-schedules.service';` 줄을 **삭제**하고, tx import 줄에 `softDeleteTournamentFixtureInTx` 를 더한다. 그리고 확인:

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && grep -n "cascadeCancelTeamMatchSchedulesInTx" src/tournaments/tournament-bracket.service.ts   # 기대: 출력 없음
```

- [ ] **Step 5: 통과를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "Tests:|Test Suites:|✕"
cd $WT/apps/v1_api && node scripts/v1-surface-check.mjs; echo "exit=$?"
```

기대: `Tests: 107 passed, 107 total`(104 + 3), `exit=0`. 기존 `deleteFixture:` 계열 9개가 그대로 통과해야 한다 — 특히 `unassigned next fixture survives …` 는 `v1TeamMatch.update` 가 정확히 1번 불린다는 단언이라, 슬롯 해제를 별도 update 로 넣었다면 여기서 깨진다.

- [ ] **Step 6: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git commit -m "refactor(v1-api): 경기 소프트 삭제를 softDeleteTournamentFixtureInTx 로 추출하고 자리 연결을 같이 푼다" -- \
  apps/v1_api/src/tournaments/tournament-bracket-tx.ts apps/v1_api/src/tournaments/tournament-bracket.service.ts \
  apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts && git show --stat HEAD
```

---

### Task 10: 조 삭제를 `deleteTournamentGroupInTx` 로 추출하고 남은 자리가 있으면 막는다 (`GROUP_HAS_SLOTS`)

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournament-bracket-tx.ts`
- Modify: `apps/v1_api/src/tournaments/tournament-bracket.service.ts` (`deleteGroup` :1094-1144)
- Test: `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts` (mock 에 `findUnique`·`delete` 추가 + 새 `describe`), `apps/v1_api/test/tournaments/tournament-bracket-tx.integration-spec.ts`

**Interfaces:** Produces:
```ts
export async function deleteTournamentGroupInTx(tx: Prisma.TransactionClient, admin: V1ActiveAdmin, groupId: string): Promise<void>
// 409 GROUP_HAS_TEAMS(편성 팀·미정 부전승) → GROUP_HAS_FIXTURES(경기) → GROUP_HAS_SLOTS(이 조의 자리 또는 이 조를 원천으로 삼는 순위 자리) 순으로 검사. 호출자가 advisory lock 을 잡는다.
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

(a) 목에 메서드를 더한다 — `old_string`(타입 선언):

```ts
    v1TournamentGroup: { findFirst: jest.Mock; create: jest.Mock; findMany: jest.Mock };
```

`new_string`:

```ts
    v1TournamentGroup: { findFirst: jest.Mock; create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
```

`old_string`(`beforeEach` 초기화):

```ts
      v1TournamentGroup: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
```

`new_string`:

```ts
      v1TournamentGroup: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
```

(b) 표식 위에 추가한다.

```ts
  describe('deleteGroup (deleteTournamentGroupInTx)', () => {
    const arrange = (count: Partial<Record<'groupTeams' | 'byeSlots' | 'tournamentMatchDetails' | 'slots' | 'rankSlots', number>> = {}) => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1TournamentGroup.findUnique.mockResolvedValue({
        ...groupRow(),
        _count: { groupTeams: 0, byeSlots: 0, tournamentMatchDetails: 0, slots: 0, rankSlots: 0, ...count },
      });
    };

    it.each([
      { name: '조 편성 팀', count: { groupTeams: 1 }, code: 'GROUP_HAS_TEAMS' },
      { name: '미정 부전승 자리', count: { byeSlots: 1 }, code: 'GROUP_HAS_TEAMS' },
      { name: '경기', count: { tournamentMatchDetails: 2 }, code: 'GROUP_HAS_FIXTURES' },
      { name: '이 조에 속한 자리', count: { slots: 3 }, code: 'GROUP_HAS_SLOTS' },
      { name: '다른 조의 순위 자리가 이 조를 원천으로 삼는 경우', count: { rankSlots: 1 }, code: 'GROUP_HAS_SLOTS' },
      { name: '팀과 자리가 함께 있으면 팀이 먼저 (기존 우선순위 유지)', count: { groupTeams: 1, slots: 1 }, code: 'GROUP_HAS_TEAMS' },
    ])('$name → 409 $code 이고 조를 지우지 않는다', async ({ count, code }) => {
      arrange(count);

      await expect(service.deleteGroup(ownerUser, 'group-1')).rejects.toMatchObject({ response: { code } });
      expect(prisma.v1TournamentGroup.delete).not.toHaveBeenCalled();
      expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
    });

    it('아무것도 매달려 있지 않으면 지우고 감사 로그에 이전 이름·단계를 남긴다 (대조군)', async () => {
      arrange();

      await expect(service.deleteGroup(ownerUser, 'group-1')).resolves.toEqual({ deleted: true });

      expect(prisma.v1TournamentGroup.delete).toHaveBeenCalledWith({ where: { id: 'group-1' } });
      expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'tournament.bracket.group.delete', targetId: 'group-1', beforeJson: { name: 'A조', phase: 'group' } }),
      });
    });

    it('없는 조는 404 이고 트랜잭션을 열지 않는다', async () => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1TournamentGroup.findUnique.mockResolvedValue(null);

      await expect(service.deleteGroup(ownerUser, 'ghost')).rejects.toMatchObject({ response: { code: 'GROUP_NOT_FOUND' } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: 실패를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "Tests:|✕" | head
```

기대: `GROUP_HAS_SLOTS` 2건 FAIL(현재 코드는 `_count.slots` 를 읽지 않아 지워 버린다), 나머지는 통과 또는 mock 형태 때문에 일부 FAIL — 핵심은 슬롯 케이스가 빨갛다는 것.

- [ ] **Step 3: 구현한다 — `tournament-bracket-tx.ts` 끝에 추가**

```ts
/**
 * 조 삭제. 편성 팀·경기·자리가 남아 있으면 실수 방지를 위해 409 로 막는다. 자리는 FK(Restrict)가 500 을 내기 전에 여기서
 * 막는다 — 템플릿 교체(PR-1b)는 자리를 먼저 지운 뒤 이 함수를 부른다. 호출자가 advisory lock 을 잡는다.
 */
export async function deleteTournamentGroupInTx(tx: Tx, admin: V1ActiveAdmin, groupId: string): Promise<void> {
  const group = await tx.v1TournamentGroup.findUnique({
    where: { id: groupId },
    include: { _count: { select: { groupTeams: true, byeSlots: true, tournamentMatchDetails: true, slots: true, rankSlots: true } } },
  });
  if (!group) throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '조를 찾을 수 없어요.' });
  if (group._count.groupTeams > 0 || group._count.byeSlots > 0) {
    throw new ConflictException({ code: 'GROUP_HAS_TEAMS', message: '조에 배정된 팀이 있어요. 팀 배정을 먼저 해제해 주세요.' });
  }
  if (group._count.tournamentMatchDetails > 0) {
    throw new ConflictException({ code: 'GROUP_HAS_FIXTURES', message: '조에 연결된 경기가 있어요. 경기를 먼저 삭제해 주세요.' });
  }
  if (group._count.slots > 0 || group._count.rankSlots > 0) {
    throw new ConflictException({ code: 'GROUP_HAS_SLOTS', message: '조에 대진 자리가 남아 있어요. 대진 템플릿을 교체하거나 자리를 먼저 지워 주세요.' });
  }
  await tx.v1TournamentGroup.delete({ where: { id: groupId } });
  await writeAdminActionLog(tx, admin, {
    action: 'tournament.bracket.group.delete',
    targetType: 'tournament_group',
    targetId: groupId,
    beforeJson: { name: group.name, phase: group.phase },
  });
}
```

- [ ] **Step 4: 서비스 `deleteGroup` 을 얇게 만든다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && python3 - <<'PY'
p = 'src/tournaments/tournament-bracket.service.ts'
s = open(p, encoding='utf-8').read()
a = s.index('  /** 조 삭제. 팀 배정·경기가 남아 있으면 실수 방지를 위해 409로 막는다. */')
b = s.index('  /** 조 팀 배정 해제 — 해당 팀의 조 순위 행도 함께 정리한다. */')
new = '''  /** 조 삭제. 팀 배정·경기·자리가 남아 있으면 실수 방지를 위해 409로 막는다. */
  async deleteGroup(user: V1AuthUser, groupId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const group = await this.prisma.v1TournamentGroup.findUnique({ where: { id: groupId }, select: { tournamentId: true } });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '조를 찾을 수 없어요.' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${group.tournamentId}`}, 0))`;
      await deleteTournamentGroupInTx(tx, admin, groupId);
    });
    return { deleted: true };
  }

'''
s = s[:a] + new + s[b:]
open(p, 'w', encoding='utf-8').write(s)
PY
```

기대: 파일에서 `deleteGroup` 본문이 위 새 메서드 하나뿐이고, 옛 `_count` 사전 검사 두 벌은 없다. tx import 줄에 `deleteTournamentGroupInTx` 를 더한다(알파벳 순이면 `assertSidesNotSlotLinked, createGroupInTx, deleteTournamentGroupInTx, ensureGroupPhaseTeamsInTx, recalculateStandingsInTx, softDeleteTournamentFixtureInTx, updateTournamentFixtureInTx`).

- [ ] **Step 5: 통과를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "Tests:|Test Suites:|✕"
```

기대: `Tests: 115 passed, 115 total`(107 + 8: `it.each` 6 + 대조군 1 + 404 1).

- [ ] **Step 6: DB 통합 스펙에 추가한다** — `tournament-bracket-tx.integration-spec.ts` 의 `// ─── 통합 스펙 끝` 표식 위에:

```ts
  describe('deleteGroup + 자리', () => {
    const makeSlot = (data: { groupId: string | null; position: number; kind?: 'ENTRY' | 'GROUP_RANK'; sourceGroupId?: string }) =>
      prisma.v1TournamentSlot.create({
        data: { tournamentId: ids.tournamentId, kind: data.kind ?? 'ENTRY', groupId: data.groupId, position: data.position, sourceGroupId: data.sourceGroupId ?? null },
      });

    it('자리가 남은 조는 409 GROUP_HAS_SLOTS 로 막히고(500 이 아니다), 자리를 지우면 지워진다', async () => {
      const group = await bracket.createGroup(user, ids.tournamentId, { name: 'slot-group', phase: 'group' });
      const slot = await makeSlot({ groupId: group.id, position: 1 });

      await expect(bracket.deleteGroup(user, group.id)).rejects.toMatchObject({ response: { code: 'GROUP_HAS_SLOTS' } });
      expect(await prisma.v1TournamentGroup.count({ where: { id: group.id } })).toBe(1);

      await prisma.v1TournamentSlot.delete({ where: { id: slot.id } });
      await expect(bracket.deleteGroup(user, group.id)).resolves.toEqual({ deleted: true });
    });

    it('다른 조의 순위 자리가 원천으로 삼는 조도 막힌다', async () => {
      const source = await bracket.createGroup(user, ids.tournamentId, { name: 'rank-source', phase: 'group' });
      const finals = await bracket.createGroup(user, ids.tournamentId, { name: 'rank-finals', phase: 'semi' });
      const rank = await makeSlot({ kind: 'GROUP_RANK', groupId: finals.id, position: 1, sourceGroupId: source.id });

      await expect(bracket.deleteGroup(user, source.id)).rejects.toMatchObject({ response: { code: 'GROUP_HAS_SLOTS' } });

      await prisma.v1TournamentSlot.delete({ where: { id: rank.id } });
      await expect(bracket.deleteGroup(user, source.id)).resolves.toEqual({ deleted: true });
      await expect(bracket.deleteGroup(user, finals.id)).resolves.toEqual({ deleted: true });
    });

    it('자리가 없는 빈 조는 기존대로 지워진다 (대조군)', async () => {
      const group = await bracket.createGroup(user, ids.tournamentId, { name: 'plain-group', phase: 'group' });
      await expect(bracket.deleteGroup(user, group.id)).resolves.toEqual({ deleted: true });
      expect(await prisma.v1TournamentGroup.count({ where: { id: group.id } })).toBe(0);
    });
  });
```

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"; echo "exit=$?"
```

기대: `exit=0`. (실행은 CI. 로컬에서 Postgres 가 있으면 `migrate deploy` → `competition-config-backfill.cli` → 이 스펙 순서로 돌린다.)

- [ ] **Step 7: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git commit -m "refactor(v1-api): 조 삭제를 deleteTournamentGroupInTx 로 추출하고 남은 자리가 있으면 409 로 막는다" -- \
  apps/v1_api/src/tournaments/tournament-bracket-tx.ts apps/v1_api/src/tournaments/tournament-bracket.service.ts \
  apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts apps/v1_api/test/tournaments/tournament-bracket-tx.integration-spec.ts && git show --stat HEAD
```

---

### Task 11: 빈 경기 생성 `createEmptyTournamentFixtureInTx` (자리 id 를 받는 `createTournamentMatchInTx`)

템플릿이 쓰는 "팀 없는 경기 하나" 생성 함수. `createFixture` 의 팀 없는 경로와 같은 멱등 키 규칙(`tournament-fixture:{대회}:{round}:{번호}:{차수}` + 소프트 삭제 이력 수 반영)을 따라, 같은 좌표를 지웠다 다시 만들어도 옛 경기와 충돌하지 않는다.

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournament-match-creation.ts:21-47`(입력 타입), `:219-220`(`v1TeamMatch.create` data)
- Modify: `apps/v1_api/src/tournaments/tournament-bracket-tx.ts`
- Test: `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts`, `apps/v1_api/test/tournaments/tournament-bracket-tx.integration-spec.ts`

**Interfaces:** Produces:
```ts
// tournament-match-creation.ts: TournamentMatchCreationInput 에 추가
//   homeSlotId?: string | null; awaySlotId?: string | null;
export async function createEmptyTournamentFixtureInTx(
  tx: Prisma.TransactionClient, deps: BracketTxDeps, admin: V1ActiveAdmin,
  input: {
    tournament: { id: string; sportId: string; regionId: string | null; venue: string | null; competitionConfigVersionId: string; title: string };
    groupId: string; round: string; fixtureNumber: number; legNumber: number; homeSlotId: string | null; awaySlotId: string | null;
  },
): Promise<{ id: string }>
// 전제: 호출자가 league-fixture-generation advisory lock 을 잡았다(좌표별 락은 따로 잡지 않는다).
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

import 에 `createEmptyTournamentFixtureInTx` 를 더하고, 표식 위에 추가한다.

```ts
  describe('createEmptyTournamentFixtureInTx', () => {
    const tournament = {
      id: 'tournament-1', sportId: 'sport-1', regionId: null, venue: '서울 경기장', title: '테스트 대회',
      competitionConfigVersionId: '11111111-1111-4111-8111-111111111111',
    };
    const input = { tournament, groupId: 'group-1', round: 'league_r1', fixtureNumber: 1, legNumber: 1, homeSlotId: 'slot-h', awaySlotId: 'slot-a' };
    const arrange = () => { prisma.v1TournamentGroup.findFirst.mockResolvedValue({ name: 'A조' }); };

    it('팀 없이 자리 두 개에 연결된 경기를 만들고 Game 사이드는 "미정" 이름으로 시작한다', async () => {
      arrange();

      await expect(createEmptyTournamentFixtureInTx(prisma as never, { games } as never, activeAdmin, input)).resolves.toEqual({ id: 'fixture-1' });

      expect(prisma.v1TeamMatch.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          tournamentId: 'tournament-1', hostTeamId: null, approvedApplicantTeamId: null,
          homeSlotId: 'slot-h', awaySlotId: 'slot-a', status: 'matched', placeName: '서울 경기장',
          title: '테스트 대회 · A조 · 조별리그 1라운드 1',
        }),
      }));
      expect(prisma.v1TournamentMatchDetails.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ groupId: 'group-1', round: 'league_r1', fixtureNumber: 1, legNumber: 1, homeRegistrationId: null, awayRegistrationId: null }),
      }));
      expect(games.createFromSourceInTransaction).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ sides: [
          { sideKey: 'HOME', teamId: null, displayNameSnapshot: '홈 팀 미정' },
          { sideKey: 'AWAY', teamId: null, displayNameSnapshot: '어웨이 팀 미정' },
        ] }),
        expect.objectContaining({ durableCommandId: 'tournament-fixture:tournament-1:league_r1:1:1' }),
      );
      expect(prisma.v1TeamSchedule.create).not.toHaveBeenCalled();
      expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'tournament.bracket.fixture.create', targetId: 'fixture-1' }),
      });
    });

    it('자리가 없는 경기(null)는 슬롯 컬럼을 null 로 만든다 (대조군)', async () => {
      arrange();

      await createEmptyTournamentFixtureInTx(prisma as never, { games } as never, activeAdmin, { ...input, homeSlotId: null, awaySlotId: null });

      expect(prisma.v1TeamMatch.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ homeSlotId: null, awaySlotId: null }),
      }));
    });

    it('같은 좌표를 지웠다 다시 만들면 소프트 삭제 이력 수를 반영한 새 멱등 키를 쓴다', async () => {
      arrange();
      prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([{ teamMatchId: 'old-1' }]);

      await createEmptyTournamentFixtureInTx(prisma as never, { games } as never, activeAdmin, input);

      expect(games.createFromSourceInTransaction).toHaveBeenCalledWith(
        prisma,
        expect.anything(),
        expect.objectContaining({ durableCommandId: 'tournament-fixture:tournament-1:league_r1:1:1:revision:1' }),
      );
    });

    it('이미 쓰는 좌표는 409 FIXTURE_NUMBER_CONFLICT 이고 아무것도 만들지 않는다', async () => {
      arrange();
      prisma.v1TournamentMatchDetails.findFirst.mockResolvedValue({ teamMatchId: 'existing' });

      await expect(createEmptyTournamentFixtureInTx(prisma as never, { games } as never, activeAdmin, input)).rejects.toMatchObject({
        response: { code: 'FIXTURE_NUMBER_CONFLICT' },
      });
      expect(prisma.v1TeamMatch.create).not.toHaveBeenCalled();
    });

    it('이 대회에 없는 조는 404 GROUP_NOT_FOUND', async () => {
      prisma.v1TournamentGroup.findFirst.mockResolvedValue(null);

      await expect(createEmptyTournamentFixtureInTx(prisma as never, { games } as never, activeAdmin, input)).rejects.toMatchObject({
        response: { code: 'GROUP_NOT_FOUND' },
      });
      expect(prisma.v1TeamMatch.create).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: 실패를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "has no exported member|Tests:"
```

기대: `no exported member 'createEmptyTournamentFixtureInTx'`.

- [ ] **Step 3: `createTournamentMatchInTx` 가 자리 id 를 받게 한다**

`tournament-match-creation.ts` Edit 두 번.

`old_string`:

```ts
  fieldId?: string | null;
  status?: V1TeamMatchStatus;
```

`new_string`:

```ts
  fieldId?: string | null;
  homeSlotId?: string | null;
  awaySlotId?: string | null;
  status?: V1TeamMatchStatus;
```

`old_string`:

```ts
      fieldId: input.fieldId ?? null,
      hostTeamId: input.home.id,
```

`new_string`:

```ts
      fieldId: input.fieldId ?? null,
      homeSlotId: input.homeSlotId ?? null,
      awaySlotId: input.awaySlotId ?? null,
      hostTeamId: input.home.id,
```

- [ ] **Step 4: `createEmptyTournamentFixtureInTx` 를 구현한다 — `tournament-bracket-tx.ts`**

import 에 추가:

```ts
import { canonicalGameCommandPayloadHash } from '../games/games.service';
import { createTournamentMatchInTx } from './tournament-match-creation';
import { nextFixtureCreationCommandId } from './tournament-fixture-generation';
import { competitionMatchLabel } from './tournament-round-label';
```

(`GamesService` 는 `import type` 로 이미 있다 — `canonicalGameCommandPayloadHash` 는 값 import 이므로 `import { canonicalGameCommandPayloadHash, type GamesService } from '../games/games.service';` 한 줄로 합친다.)

파일 끝에 추가:

```ts
/**
 * 팀 없는 경기 하나를 만든다(템플릿용). 멱등 키는 `createFixture` 와 같은 규칙이라, 같은 좌표(라운드·번호·차수)를
 * 소프트 삭제했다 다시 만들어도 옛 경기의 기록과 충돌하지 않는다. 자리 id 는 멱등 payload 에 넣지 않는다 —
 * 자리는 템플릿을 적용할 때마다 새로 만들어지므로 키의 정체성이 아니다.
 */
export async function createEmptyTournamentFixtureInTx(
  tx: Tx,
  deps: BracketTxDeps,
  admin: V1ActiveAdmin,
  input: {
    tournament: { id: string; sportId: string; regionId: string | null; venue: string | null; competitionConfigVersionId: string; title: string };
    groupId: string;
    round: string;
    fixtureNumber: number;
    legNumber: number;
    homeSlotId: string | null;
    awaySlotId: string | null;
  },
): Promise<{ id: string }> {
  const { tournament } = input;
  const group = await tx.v1TournamentGroup.findFirst({ where: { id: input.groupId, tournamentId: tournament.id }, select: { name: true } });
  if (!group) throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '해당 대회의 조를 찾을 수 없어요.' });
  const taken = await tx.v1TournamentMatchDetails.findFirst({
    where: { tournamentId: tournament.id, round: input.round, fixtureNumber: input.fixtureNumber, legNumber: input.legNumber },
    select: { teamMatchId: true },
  });
  if (taken) throw new ConflictException({ code: 'FIXTURE_NUMBER_CONFLICT', message: '같은 라운드·차수에서 이미 사용 중인 대진 번호예요.' });

  const baseCommandId = `tournament-fixture:${tournament.id}:${input.round}:${input.fixtureNumber}:${input.legNumber}`;
  const archived = await tx.v1TournamentMatchDetails.findMany({
    where: {
      tournamentId: tournament.id, round: { startsWith: input.round + ':deleted:' },
      fixtureNumber: input.fixtureNumber, legNumber: input.legNumber, teamMatch: { deletedAt: { not: null } },
    },
    select: { teamMatchId: true },
  });
  const durableCommandId = await nextFixtureCreationCommandId(tx, baseCommandId, tournament.id, archived.length, admin.userId);
  const commandPayload = {
    tournamentId: tournament.id, groupId: input.groupId, round: input.round, fixtureNumber: input.fixtureNumber, legNumber: input.legNumber,
    parentFixtureId: null, homeRegistrationId: null, awayRegistrationId: null, scheduledAt: null, venue: tournament.venue,
  };
  const creation = await createTournamentMatchInTx(tx, deps.games, {
    tournamentId: tournament.id,
    groupId: input.groupId,
    round: input.round,
    fixtureNumber: input.fixtureNumber,
    legNumber: input.legNumber,
    parentTeamMatchId: null,
    homeRegistrationId: null,
    awayRegistrationId: null,
    homeSlotId: input.homeSlotId,
    awaySlotId: input.awaySlotId,
    sportId: tournament.sportId,
    regionId: tournament.regionId,
    title: `${tournament.title} · ${competitionMatchLabel({ groupName: group.name, round: input.round, legNumber: input.legNumber })} ${input.fixtureNumber}`,
    placeName: tournament.venue,
    startAt: null,
    createdByUserId: admin.userId,
    competitionConfigVersionId: tournament.competitionConfigVersionId,
    home: { id: null, name: '홈 팀 미정' },
    away: { id: null, name: '어웨이 팀 미정' },
    actor: { actorType: 'USER', actorUserId: admin.userId, role: 'platform_ops', tournamentId: tournament.id },
    durableCommandId,
    payloadHash: canonicalGameCommandPayloadHash(commandPayload),
  });
  await writeAdminActionLog(tx, admin, {
    action: 'tournament.bracket.fixture.create',
    targetType: 'team_match',
    targetId: creation.teamMatchId,
    afterJson: { tournamentId: tournament.id, round: input.round, fixtureNumber: input.fixtureNumber, status: 'matched' },
  });
  return { id: creation.teamMatchId };
}
```

- [ ] **Step 5: 통과를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts src/tournaments/league-fixture-generator.service.spec.ts 2>&1 | grep -E "Tests:|Test Suites:|✕"
```

기대: `Test Suites: 2 passed`, `✕` 없음 (bracket 스펙은 `120` = 115 + 5). `league-fixture-generator` 도 `createTournamentMatchInTx` 를 쓰므로, 입력에 선택 필드를 더한 변경이 그쪽을 깨지 않았는지 같이 본다.

- [ ] **Step 6: DB 통합 스펙에 추가한다** — 표식 위에:

```ts
  describe('빈 경기 · 자리 연결 · 소프트 삭제', () => {
    const lock = (tx: Prisma.TransactionClient) =>
      tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${ids.tournamentId}`}, 0))`;
    let groupId: string;
    let tournamentInfo: Parameters<typeof createEmptyTournamentFixtureInTx>[3]['tournament'];
    const slotOf = (position: number) =>
      prisma.v1TournamentSlot.create({ data: { tournamentId: ids.tournamentId, kind: 'ENTRY', groupId, position } });
    const emptyFixture = (fixtureNumber: number, homeSlotId: string | null, awaySlotId: string | null) =>
      prisma.$transaction(async (tx) => {
        await lock(tx);
        return createEmptyTournamentFixtureInTx(tx, { games }, admin, {
          tournament: tournamentInfo, groupId, round: 'league_r9', fixtureNumber, legNumber: 1, homeSlotId, awaySlotId,
        });
      });

    beforeAll(async () => {
      // 경기는 시작 전 대회(draft·open·closed)에서만 지울 수 있다 — 시드 대회는 in_progress 다.
      await prisma.v1Tournament.update({ where: { id: ids.tournamentId }, data: { status: 'closed' } });
      groupId = (await bracket.createGroup(user, ids.tournamentId, { name: 'empty-fixtures', phase: 'group' })).id;
      const row = await findTournamentOnSurface(prisma, TOURNAMENT_KINDS, {
        where: { id: ids.tournamentId },
        select: { id: true, sportId: true, regionId: true, venue: true, title: true, competitionConfigVersionId: true },
      });
      if (!row?.competitionConfigVersionId) throw new Error('fixture tournament has no competition config');
      tournamentInfo = { ...row, competitionConfigVersionId: row.competitionConfigVersionId };
    });
    afterAll(async () => {
      await prisma.v1Tournament.update({ where: { id: ids.tournamentId }, data: { status: 'in_progress' } });
    });

    it('빈 경기는 팀 없이 자리 둘에 연결되고 Game 사이드는 "미정" 이다', async () => {
      const [home, away] = [await slotOf(1), await slotOf(2)];
      const { id } = await emptyFixture(7001, home.id, away.id);

      const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id }, include: { game: { include: { sides: true } } } });
      expect(teamMatch).toMatchObject({ hostTeamId: null, approvedApplicantTeamId: null, homeSlotId: home.id, awaySlotId: away.id, status: 'matched' });
      expect(teamMatch.game?.sides.map((side) => [side.sideKey, side.teamId, side.displayNameSnapshot]).sort()).toEqual([
        ['AWAY', null, '어웨이 팀 미정'], ['HOME', null, '홈 팀 미정'],
      ]);
    });

    it('경기를 지우면 두 자리 연결이 풀려 자리를 지울 수 있다 — 다른 경기의 연결은 그대로다', async () => {
      const [homeA, awayA, homeB] = [await slotOf(11), await slotOf(12), await slotOf(13)];
      const target = await emptyFixture(7011, homeA.id, awayA.id);
      const bystander = await emptyFixture(7012, homeB.id, null);

      await expect(prisma.v1TournamentSlot.delete({ where: { id: homeA.id } })).rejects.toThrow();   // 연결이 남아 있으면 FK 가 막는다
      await bracket.deleteFixture(user, target.id);

      const after = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: target.id } });
      expect(after).toMatchObject({ homeSlotId: null, awaySlotId: null, status: 'archived' });
      await prisma.v1TournamentSlot.delete({ where: { id: homeA.id } });
      await prisma.v1TournamentSlot.delete({ where: { id: awayA.id } });
      expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: bystander.id } })).homeSlotId).toBe(homeB.id);
    });

    it('지운 좌표에 다시 만들면 새 경기가 생기고 멱등 키는 revision 접미사를 단다', async () => {
      const first = await emptyFixture(7021, null, null);
      await bracket.deleteFixture(user, first.id);

      const second = await emptyFixture(7021, null, null);

      expect(second.id).not.toBe(first.id);
      expect(await prisma.v1IdempotencyRecord.count({
        where: { idempotencyKey: `tournament-fixture:${ids.tournamentId}:league_r9:7021:1:revision:1` },
      })).toBe(1);
    });

    it('자리에 연결된 홈은 PATCH 로 못 바꾸고(SLOT_LINKED), 연결되지 않은 어웨이는 바꾼다', async () => {
      const home = await slotOf(21);
      const { id } = await emptyFixture(7031, home.id, null);

      await expect(bracket.updateFixture(user, id, { homeRegistrationId: reg0 })).rejects.toMatchObject({ response: { code: 'SLOT_LINKED' } });
      expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id } })).hostTeamId).toBeNull();

      await bracket.updateFixture(user, id, { awayRegistrationId: reg1 });
      expect((await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: id } })).awayRegistrationId).toBe(reg1);
    });
  });
```

이 블록이 쓰는 import 를 파일 위쪽에 더한다.

```ts
import { createEmptyTournamentFixtureInTx } from '../../src/tournaments/tournament-bracket-tx';   // 기존 createGroupInTx import 줄에 합친다
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../../src/tournaments/tournament-surface-lookup';
import type { Prisma } from '@prisma/client';
```

그리고 `const [reg0, reg1] = ids.registrationIds;` 를 `admin` 선언 옆에 둔다.

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"; echo "exit=$?"
```

기대: `exit=0`.

- [ ] **Step 7: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git commit -m "feat(v1-api): 자리 id 를 받는 빈 경기 생성 createEmptyTournamentFixtureInTx 추가" -- \
  apps/v1_api/src/tournaments/tournament-match-creation.ts apps/v1_api/src/tournaments/tournament-bracket-tx.ts \
  apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts apps/v1_api/test/tournaments/tournament-bracket-tx.integration-spec.ts && git show --stat HEAD
```

---

### Task 12: 어드민 대진 응답 확장 — `slots[]` · 경기별 `homeSlotId/awaySlotId` · `game` 블록

`GET /admin/tournaments/:id/bracket`(`TournamentBracketService.getBracket`)에 최상위 `slots[]`, 경기마다 `homeSlotId`·`awaySlotId`·`game{ id, state, version, hasLiveRecords, latestRevision{ id, state, score, entryMethod } | null }` 를 더한다. 리비전 상세(참가자·eventsHash·goalEvents)는 싣지 않는다(S5 마지막 문단).

**Files:**
- Create: `apps/v1_api/src/tournaments/slots/admin-bracket-view.ts`, `apps/v1_api/src/tournaments/slots/admin-bracket-view.spec.ts`
- Modify: `apps/v1_api/src/tournaments/tournament-team-match-bracket.query.ts:1-82`
- Modify: `apps/v1_api/src/tournaments/tournament-bracket.service.ts` (`getBracket` :1273-1380)
- Test: `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts`(mock·목 데이터 갱신 + 새 `describe`), `apps/v1_api/test/tournaments/tournament-bracket-tx.integration-spec.ts`

**Interfaces:** Consumes: `slotLabelFromRow`(Task 4), `revisionEntryMethod`(Task 5), `parseTournamentFixtureOfficialScore`(`tournament-fixture-official-result.ts:20`). Produces:
```ts
export const adminBracketSlotInclude   // { group:{select:{name,phase}}, sourceGroup:{select:{name}}, registration:{select:{team:{select:{name}}}} }
export type AdminBracketSlot = { id: string; kind: 'ENTRY'|'BYE'|'GROUP_RANK'; groupId: string|null; sourceGroupId: string|null; position: number; label: string; registrationId: string|null; teamName: string|null }
export function serializeAdminBracketSlot(row: AdminBracketSlotRow): AdminBracketSlot
export type AdminBracketGame = { id: string; state: V1GameState; version: number; hasLiveRecords: boolean;
  latestRevision: { id: string; state: V1GameResultRevisionState; score: { home: number; away: number; penalties?: { home: number; away: number } } | null; entryMethod: RevisionEntryMethod } | null }
export function serializeAdminBracketGame(game: AdminBracketGameInput): AdminBracketGame
```

- [ ] **Step 1: 실패하는 순수 테스트를 쓴다** — `slots/admin-bracket-view.spec.ts`

```ts
import { serializeAdminBracketGame, serializeAdminBracketSlot } from './admin-bracket-view';

describe('serializeAdminBracketSlot', () => {
  const row = (overrides: Record<string, unknown>) => ({
    id: 'slot-1', tournamentId: 't-1', kind: 'ENTRY', groupId: 'g-a', position: 2, sourceGroupId: null, registrationId: null,
    createdAt: new Date(), updatedAt: new Date(),
    group: { name: 'A조', phase: 'group' }, sourceGroup: null, registration: null, ...overrides,
  }) as never;

  it('배정된 자리는 팀 이름과 등록 id 를, 빈 자리는 둘 다 null 을 낸다', () => {
    expect(serializeAdminBracketSlot(row({ registrationId: 'reg-1', registration: { team: { name: '서울 FC' } } }))).toEqual({
      id: 'slot-1', kind: 'ENTRY', groupId: 'g-a', sourceGroupId: null, position: 2, label: 'A조 2번', registrationId: 'reg-1', teamName: '서울 FC',
    });
    expect(serializeAdminBracketSlot(row({}))).toMatchObject({ registrationId: null, teamName: null });
  });

  it('순위 자리는 원천 조 이름으로 라벨을 만든다', () => {
    expect(
      serializeAdminBracketSlot(row({ kind: 'GROUP_RANK', groupId: 'g-f', sourceGroupId: 'g-a', position: 1, group: { name: '4강', phase: 'semi' }, sourceGroup: { name: 'A조' } })),
    ).toMatchObject({ kind: 'GROUP_RANK', sourceGroupId: 'g-a', label: 'A조 1위' });
  });
});

describe('serializeAdminBracketGame', () => {
  const game = (overrides: Record<string, unknown> = {}) => ({
    id: 'game-1', state: 'SCHEDULED', version: 3, _count: { events: 0 }, resultRevisions: [], ...overrides,
  }) as never;
  const revision = (overrides: Record<string, unknown> = {}) => ({
    id: 'rev-1', state: 'OFFICIAL', score: { home: 2, away: 1 }, reason: null, supersedesId: null, ...overrides,
  });

  it('리비전이 없으면 latestRevision 이 null 이고 이벤트가 없으면 hasLiveRecords 는 false', () => {
    expect(serializeAdminBracketGame(game())).toEqual({ id: 'game-1', state: 'SCHEDULED', version: 3, hasLiveRecords: false, latestRevision: null });
  });

  it('게임 이벤트가 하나라도 있으면 hasLiveRecords (빠른 결과가 막히는 조건과 같은 기준)', () => {
    expect(serializeAdminBracketGame(game({ _count: { events: 1 } })).hasLiveRecords).toBe(true);
  });

  it('입력 방식: quick 마커 / 대체한 리비전 / 콘솔 첫 초안', () => {
    const entry = (rev: Record<string, unknown>) => serializeAdminBracketGame(game({ resultRevisions: [revision(rev)] })).latestRevision?.entryMethod;
    expect(entry({ reason: '[quick-result]' })).toBe('quick');
    expect(entry({ reason: '운영자 결과 정정', supersedesId: 'rev-0' })).toBe('correction');
    expect(entry({})).toBe('console');
  });

  it('승부차기 점수를 penalties 로 내고, 읽을 수 없는 score 는 null 로 둔다', () => {
    const score = (value: unknown) => serializeAdminBracketGame(game({ resultRevisions: [revision({ state: 'DRAFT', score: value })] })).latestRevision?.score;
    expect(score({ home: 1, away: 1, penalties: { home: 4, away: 3 } })).toEqual({ home: 1, away: 1, penalties: { home: 4, away: 3 } });
    expect(score({ home: 2, away: 0 })).toEqual({ home: 2, away: 0 });
    expect(score({ garbage: true })).toBeNull();
  });

  it('최신 리비전(첫 원소)의 상태를 그대로 싣는다 — 무효된 결과는 VOID 로 보인다', () => {
    expect(serializeAdminBracketGame(game({ state: 'ENDED', resultRevisions: [revision({ state: 'VOID' })] })).latestRevision).toMatchObject({ id: 'rev-1', state: 'VOID' });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/slots/admin-bracket-view.spec.ts 2>&1 | grep -E "Cannot find module|Tests:"
```

기대: `Cannot find module './admin-bracket-view'`.

- [ ] **Step 3: 구현한다** — `slots/admin-bracket-view.ts`

```ts
import type { Prisma, V1GameResultRevisionState, V1GameState, V1TournamentSlotKind } from '@prisma/client';
import { revisionEntryMethod, type RevisionEntryMethod } from '../../tournament-operations/results/quick-result.constants';
import { parseTournamentFixtureOfficialScore } from '../tournament-fixture-official-result';
import { slotLabelFromRow } from './tournament-slot-label';

export const adminBracketSlotInclude = {
  group: { select: { name: true, phase: true } },
  sourceGroup: { select: { name: true } },
  registration: { select: { team: { select: { name: true } } } },
} satisfies Prisma.V1TournamentSlotInclude;

export type AdminBracketSlotRow = Prisma.V1TournamentSlotGetPayload<{ include: typeof adminBracketSlotInclude }>;

export type AdminBracketSlot = {
  id: string;
  kind: V1TournamentSlotKind;
  groupId: string | null;
  sourceGroupId: string | null;
  position: number;
  label: string;
  registrationId: string | null;
  teamName: string | null;
};

export function serializeAdminBracketSlot(row: AdminBracketSlotRow): AdminBracketSlot {
  return {
    id: row.id,
    kind: row.kind,
    groupId: row.groupId,
    sourceGroupId: row.sourceGroupId,
    position: row.position,
    label: slotLabelFromRow(row),
    registrationId: row.registrationId,
    teamName: row.registration?.team.name ?? null,
  };
}

/** `tournamentTeamMatchBracketInclude` 가 게임에서 읽는 필드 중 이 직렬화가 쓰는 것. `resultRevisions` 는 revision 내림차순 1건이다. */
export type AdminBracketGameInput = {
  id: string;
  state: V1GameState;
  version: number;
  _count: { events: number };
  resultRevisions: ReadonlyArray<{
    id: string;
    state: V1GameResultRevisionState;
    score: Prisma.JsonValue;
    reason: string | null;
    supersedesId: string | null;
  }>;
};

export type AdminBracketGame = {
  id: string;
  state: V1GameState;
  version: number;
  hasLiveRecords: boolean;
  latestRevision: {
    id: string;
    state: V1GameResultRevisionState;
    score: { home: number; away: number; penalties?: { home: number; away: number } } | null;
    entryMethod: RevisionEntryMethod;
  } | null;
};

function revisionScore(score: Prisma.JsonValue): NonNullable<AdminBracketGame['latestRevision']>['score'] {
  const parsed = parseTournamentFixtureOfficialScore(score);
  if (parsed === null) return null;
  return {
    home: parsed.homeScore,
    away: parsed.awayScore,
    ...(parsed.homePenaltyScore !== null && parsed.awayPenaltyScore !== null
      ? { penalties: { home: parsed.homePenaltyScore, away: parsed.awayPenaltyScore } }
      : {}),
  };
}

export function serializeAdminBracketGame(game: AdminBracketGameInput): AdminBracketGame {
  const latest = game.resultRevisions[0];
  return {
    id: game.id,
    state: game.state,
    version: game.version,
    hasLiveRecords: game._count.events > 0,
    latestRevision: latest === undefined
      ? null
      : { id: latest.id, state: latest.state, score: revisionScore(latest.score), entryMethod: revisionEntryMethod(latest) },
  };
}
```

- [ ] **Step 4: 통과를 확인한다** (Step 2 명령) — 기대: `Tests: 7 passed`.

- [ ] **Step 5: 쿼리와 직렬화에 연결한다** — `tournament-team-match-bracket.query.ts` Edit 네 번.

(a) `old_string`: `import { Prisma } from '@prisma/client';` → `new_string`:

```ts
import { Prisma } from '@prisma/client';
import { serializeAdminBracketGame } from './slots/admin-bracket-view';
```

(b) 팀 매치 select — `old_string`:

```ts
      updatedAt: true,
      videos: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, url: true, sortOrder: true } },
      game: {
        select: {
          sourceType: true,
```

`new_string`:

```ts
      updatedAt: true,
      homeSlotId: true,
      awaySlotId: true,
      videos: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, url: true, sortOrder: true } },
      game: {
        select: {
          id: true,
          version: true,
          // 어드민 칸이 "라이브 기록이 있어 빠른 입력을 못 쓴다" 를 알리는 근거 — 이벤트 수만 센다(필터된 events 와 별개).
          _count: { select: { events: true } },
          resultRevisions: {
            orderBy: { revision: 'desc' },
            take: 1,
            select: { id: true, state: true, score: true, reason: true, supersedesId: true },
          },
          sourceType: true,
```

(c) 직렬화 — `old_string`:

```ts
    awayRegistrationId: row.awayRegistrationId,
    scheduledAt: match.startAt?.toISOString() ?? null,
```

`new_string`:

```ts
    awayRegistrationId: row.awayRegistrationId,
    homeSlotId: match.homeSlotId,
    awaySlotId: match.awaySlotId,
    scheduledAt: match.startAt?.toISOString() ?? null,
```

(d) `old_string`:

```ts
    awayTeamName: row.awayRegistration?.team.name ?? 'TBD',
  };
```

`new_string`:

```ts
    awayTeamName: row.awayRegistration?.team.name ?? 'TBD',
    game: match.game === null ? null : serializeAdminBracketGame(match.game),
  };
```

- [ ] **Step 6: 실패하는 서비스 테스트를 쓴다**

(a) 목 데이터를 스키마에 맞춘다 — `tournament-bracket.service.spec.ts`:

- 타입 선언에 `v1TournamentSlot: { findMany: jest.Mock };` 한 줄을 `v1TournamentGroup:` 선언 아래에 더한다.
- `beforeEach` 의 `prisma = {` 안 `v1TournamentGroup: …` 아래에 `v1TournamentSlot: { findMany: jest.fn().mockResolvedValue([]) },` 를 더한다.
- `canonicalDetailsRow()` 의 `game:` 객체 — `old_string`:

```ts
        currentOfficialRevisionId: null,
        currentOfficialRevision: null,
        sides: [
          { id: 'side-home', sideKey: 'HOME', teamId: 'team-old' },
```

`new_string`:

```ts
        currentOfficialRevisionId: null,
        currentOfficialRevision: null,
        version: 3,
        _count: { events: 0 },
        resultRevisions: [],
        sides: [
          { id: 'side-home', sideKey: 'HOME', teamId: 'team-old' },
```

- `gameOfficialResultRow()` — `old_string`:

```ts
    teamMatchId: 'fixture-1',
    sides: [
      { id: 'side-home', sideKey: 'HOME' },
      { id: 'side-away', sideKey: 'AWAY' },
    ],
    participants: [],
```

`new_string`:

```ts
    teamMatchId: 'fixture-1',
    version: 3,
    _count: { events: 0 },
    resultRevisions: [],
    sides: [
      { id: 'side-home', sideKey: 'HOME' },
      { id: 'side-away', sideKey: 'AWAY' },
    ],
    participants: [],
```

(b) 표식 위에 새 `describe` 를 추가한다.

```ts
  describe('getBracket — 자리·게임 블록', () => {
    const slotRow = (overrides: Record<string, unknown>) => ({
      id: 'slot-x', tournamentId: 'tournament-1', kind: 'ENTRY', groupId: null, position: 1, sourceGroupId: null, registrationId: null,
      createdAt: new Date('2026-06-14T00:00:00Z'), updatedAt: new Date('2026-06-14T00:00:00Z'),
      group: null, sourceGroup: null, registration: null, ...overrides,
    });
    const arrange = (fixtures: unknown[], slots: unknown[] = []) => {
      prisma.v1AdminUser.findUnique.mockResolvedValue(ownerAdmin);
      prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
      prisma.v1TournamentGroup.findMany.mockResolvedValue([]);
      prisma.v1TournamentMatchDetails.findMany.mockResolvedValue(fixtures);
      prisma.v1TournamentStanding.findMany.mockResolvedValue([]);
      prisma.v1TournamentSlot.findMany.mockResolvedValue(slots);
    };

    it('최상위 slots[] 에 라벨·팀 이름·등록 id 를 싣고, 이 대회 자리만 읽는다', async () => {
      arrange([], [
        slotRow({ id: 'slot-1', groupId: 'group-1', position: 1, group: { name: 'A조', phase: 'group' }, registrationId: 'reg-1', registration: { team: { name: '서울 FC' } } }),
        slotRow({ id: 'slot-2', kind: 'GROUP_RANK', groupId: 'group-f', sourceGroupId: 'group-1', position: 1, group: { name: '4강', phase: 'semi' }, sourceGroup: { name: 'A조' } }),
      ]);

      const result = await service.getBracket(ownerUser, 'tournament-1');

      expect(result.slots).toEqual([
        { id: 'slot-1', kind: 'ENTRY', groupId: 'group-1', sourceGroupId: null, position: 1, label: 'A조 1번', registrationId: 'reg-1', teamName: '서울 FC' },
        { id: 'slot-2', kind: 'GROUP_RANK', groupId: 'group-f', sourceGroupId: 'group-1', position: 1, label: 'A조 1위', registrationId: null, teamName: null },
      ]);
      expect(prisma.v1TournamentSlot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tournamentId: 'tournament-1' } }));
    });

    it('경기마다 homeSlotId/awaySlotId 와 game 블록(버전·라이브 기록·최신 리비전)을 싣는다', async () => {
      const base = canonicalBracketRow();
      arrange([{
        ...base,
        teamMatch: {
          ...base.teamMatch,
          homeSlotId: 'slot-1',
          awaySlotId: null,
          game: {
            ...base.teamMatch.game,
            version: 5,
            _count: { events: 2 },
            resultRevisions: [{ id: 'rev-2', state: 'DRAFT', score: { home: 1, away: 1, penalties: { home: 4, away: 3 } }, reason: '[quick-result]', supersedesId: 'rev-void' }],
          },
        },
      }]);

      const result = await service.getBracket(ownerUser, 'tournament-1');

      expect(result.fixtures[0]).toMatchObject({
        homeSlotId: 'slot-1',
        awaySlotId: null,
        game: {
          id: 'game-1', state: 'SCHEDULED', version: 5, hasLiveRecords: true,
          latestRevision: { id: 'rev-2', state: 'DRAFT', score: { home: 1, away: 1, penalties: { home: 4, away: 3 } }, entryMethod: 'quick' },
        },
      });
    });

    it('자리도 리비전도 없는 경기는 null/빈 값을 그대로 낸다 (대조군 — 기존 경기 응답이 깨지지 않는다)', async () => {
      arrange([canonicalBracketRow()]);

      const result = await service.getBracket(ownerUser, 'tournament-1');

      expect(result.slots).toEqual([]);
      expect(result.fixtures[0]).toMatchObject({
        homeSlotId: null, awaySlotId: null,
        game: { version: 3, hasLiveRecords: false, latestRevision: null },
      });
    });
  });
```

- [ ] **Step 7: 실패를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts 2>&1 | grep -E "Tests:|✕"
```

기대: 새 `describe` 3개 FAIL(`result.slots` 가 undefined, `homeSlotId` 없음) — 기존 테스트는 목 데이터에 필드를 더했을 뿐이라 PASS.

- [ ] **Step 8: `getBracket` 을 확장한다** — `tournament-bracket.service.ts`

import 에 추가: `import { adminBracketSlotInclude, serializeAdminBracketSlot } from './slots/admin-bracket-view';`

(a) `old_string`:

```ts
    const [groups, standings, canonicalMatches, canonicalTeamMatchCandidates] = await Promise.all([
```

`new_string`:

```ts
    const [groups, standings, canonicalMatches, canonicalTeamMatchCandidates, slots] = await Promise.all([
```

(b) `old_string`:

```ts
          where: { tournamentId, leagueId: null, deletedAt: null },
          select: { id: true },
        })
        : Promise.resolve([]),
    ]);
```

`new_string`:

```ts
          where: { tournamentId, leagueId: null, deletedAt: null },
          select: { id: true },
        })
        : Promise.resolve([]),
      this.prisma.v1TournamentSlot.findMany({
        where: { tournamentId },
        include: adminBracketSlotInclude,
        orderBy: [{ kind: 'asc' }, { position: 'asc' }, { id: 'asc' }],
      }),
    ]);
```

(c) 반환 — `old_string`:

```ts
      standings: standings.map((s) => ({
        ...this.serializeStanding(s),
        teamName: s.registration.team.name,
      })),
    };
```

`new_string`:

```ts
      standings: standings.map((s) => ({
        ...this.serializeStanding(s),
        teamName: s.registration.team.name,
      })),
      slots: slots.map(serializeAdminBracketSlot),
    };
```

- [ ] **Step 9: 통과를 확인한다 + 타입**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-bracket.service.spec.ts src/tournaments/slots 2>&1 | grep -E "Tests:|Test Suites:|✕"
cd $WT/apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"; echo "exit=$?"
```

기대: `Tests: 138 passed` (bracket 스펙 123 = 120 + 3, slots 스펙 15 = label 8 + view 7), `exit=0`. 기존 `getBracket:` 테스트들이 그대로 통과해야 한다 — 목 데이터에 `version`·`_count`·`resultRevisions` 가 없었다면 `serializeAdminBracketGame` 이 `_count` 에서 TypeError 를 낸다(그래서 Step 6(a)).

- [ ] **Step 10: DB 통합 스펙에 추가한다** — Task 11 의 `describe('빈 경기 · 자리 연결 · 소프트 삭제'` 안, 마지막 `it` 뒤(그 describe 의 닫는 `});` 앞)에:

```ts
    it('getBracket 은 자리 목록과 경기별 슬롯 id·game 블록을 실DB 에서 내고, 확정 결과 경기의 최신 리비전은 OFFICIAL 이다', async () => {
      const slot = await slotOf(31);
      const { id } = await emptyFixture(7041, slot.id, null);

      const view = await bracket.getBracket(user, ids.tournamentId);

      expect(view.slots.find((candidate) => candidate.id === slot.id)).toEqual({
        id: slot.id, kind: 'ENTRY', groupId, sourceGroupId: null, position: 31, label: 'empty-fixtures 31번', registrationId: null, teamName: null,
      });
      expect(view.fixtures.find((fixture) => fixture.id === id)).toMatchObject({
        homeSlotId: slot.id, awaySlotId: null,
        game: { state: 'SCHEDULED', hasLiveRecords: false, latestRevision: null },
      });
      const decided = view.fixtures.filter((fixture) => fixture.result !== null);
      expect(decided.length).toBeGreaterThan(0);
      expect(decided.every((fixture) => fixture.game?.latestRevision?.state === 'OFFICIAL')).toBe(true);
    });
```

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"; echo "exit=$?"
```

- [ ] **Step 11: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git add apps/v1_api/src/tournaments/slots/admin-bracket-view.ts apps/v1_api/src/tournaments/slots/admin-bracket-view.spec.ts && git commit -m "feat(v1-api): 어드민 대진 응답에 자리 목록과 경기별 자리·게임 블록 추가" -- \
  apps/v1_api/src/tournaments/slots/admin-bracket-view.ts apps/v1_api/src/tournaments/slots/admin-bracket-view.spec.ts \
  apps/v1_api/src/tournaments/tournament-team-match-bracket.query.ts apps/v1_api/src/tournaments/tournament-bracket.service.ts \
  apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts apps/v1_api/test/tournaments/tournament-bracket-tx.integration-spec.ts && git show --stat HEAD
```

---

### Task 13: 공개 상세 경기 직렬화와 공개 일정 응답에 `homeSlotLabel` / `awaySlotLabel`

공개 대진표는 팀이 없는 사이드에 'TBD' 대신 자리 이름("A조 1위")을 보여 줘야 한다(S4 마지막 항목). 이 PR 은 서버 응답만 더한다 — **공개 대회 상세 `fixtures[]` 와 공개 일정 `GET /tournaments/:id/schedule` 의 `items[]`/`unscheduled[]` 두 곳 모두**(스펙 S7 이 공개 일정 화면까지 전수 적용을 요구한다). 웹이 라벨을 우선해 그리는 것은 PR-3 Task 16 이다(대진표·일정 카드·허브 일정 탭 세 곳). 라벨은 **팀이 없고 자리가 있을 때만** 값이 있다.

**Files:**
- Modify: `apps/v1_api/src/tournaments/tournaments-read.query.ts:51-` (`tournamentMatchDetails.include.teamMatch.select`)
- Modify: `apps/v1_api/src/tournaments/tournament-detail.presenter.ts` (`PresentedFixture` :144-167, `presentCanonicalFixture` :172-208, 응답 `fixtures` :461-505)
- Test: `apps/v1_api/src/tournaments/tournament-detail.presenter.spec.ts`
- Modify: `apps/v1_api/src/games/public-records/public-tournament-records.service.ts` (`CANONICAL_SCHEDULE_SELECT` :151, `FixtureScheduleRow` :183, `presentCanonicalSchedule` :202, `toLeagueScheduleRow` ~:2200, `presentScheduleEntry` :2275, import)
- Test: `apps/v1_api/src/games/public-records/public-tournament-records.schedule-scorers.spec.ts` (일정 응답 라벨 — 이 파일이 `getSchedule` 을 fake Prisma 로 돌리는 유일한 스펙이다)

**Interfaces:** Consumes: `SLOT_LABEL_SELECT`, `slotLabelFromRow`(Task 4). Produces: 공개 `fixtures[].homeSlotLabel/awaySlotLabel: string | null` **와** 공개 일정 `items[]/unscheduled[]` 항목의 `homeSlotLabel/awaySlotLabel: string | null`(PR-3 Task 16 이 `PublicScheduleEntry` 에 같은 이름으로 받는다). 리그 경기를 일정에 싣는 어댑터(`toLeagueScheduleRow`)는 항상 `null`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

(a) 목 행에 슬롯을 실어 보낼 수 있게 한다 — `FixtureSeed` 타입 `old_string`:

```ts
    competitionConfigVersionId?: string | null;
    result?: null;
```

`new_string`:

```ts
    competitionConfigVersionId?: string | null;
    homeSlot?: Record<string, unknown> | null;
    awaySlot?: Record<string, unknown> | null;
    result?: null;
```

`baseRow` 의 `teamMatch` — `old_string`:

```ts
        competitionConfigVersionId: fixture.competitionConfigVersionId ?? 'config-1',
```

`new_string`:

```ts
        competitionConfigVersionId: fixture.competitionConfigVersionId ?? 'config-1',
        homeSlot: fixture.homeSlot ?? null,
        awaySlot: fixture.awaySlot ?? null,
```

(b) 첫 번째 `it` 앞에 새 `describe` 를 넣는다 — `old_string`:

```ts
  it('OFFICIAL 리비전(신규 경로)에서 homeScore/awayScore/goals가 채워진다', () => {
```

`new_string`:

```ts
  describe('자리 라벨 (homeSlotLabel / awaySlotLabel)', () => {
    const game = { state: 'SCHEDULED', sides: [], participants: [], events: [], currentOfficialRevision: null };
    const groupRank = { kind: 'GROUP_RANK', position: 1, group: { name: '4강', phase: 'semi' }, sourceGroup: { name: 'A조' } };
    const entry = { kind: 'ENTRY', position: 2, group: { name: 'A조', phase: 'group' }, sourceGroup: null };
    const present = (seed: Record<string, unknown>) =>
      presentTournamentDetail(baseRow({ detailSeeds: [{ ...fixtureRow(game, 'scheduled'), ...seed }] } as never), true).fixtures[0];
    const empty = { homeRegistrationId: null, homeRegistration: null, awayRegistrationId: null, awayRegistration: null };

    it('팀이 없고 자리가 있으면 사이드마다 자리 라벨을 낸다 (팀 이름은 기존대로 TBD)', () => {
      expect(present({ ...empty, homeSlot: groupRank, awaySlot: entry })).toMatchObject({
        homeSlotLabel: 'A조 1위', awaySlotLabel: 'A조 2번', homeTeamName: 'TBD', awayTeamName: 'TBD',
      });
    });

    it('팀이 있으면 자리가 연결돼 있어도 라벨은 null 이다 — 팀 이름이 나온다 (대조군)', () => {
      expect(present({ homeSlot: entry, awaySlot: groupRank })).toMatchObject({
        homeSlotLabel: null, awaySlotLabel: null, homeTeamName: '서울 FC', awayTeamName: '부산 SC',
      });
    });

    it('한쪽만 비어 있으면 빈 쪽에만 라벨이 붙는다', () => {
      expect(present({ awayRegistrationId: null, awayRegistration: null, homeSlot: entry, awaySlot: groupRank })).toMatchObject({
        homeSlotLabel: null, awaySlotLabel: 'A조 1위', homeTeamName: '서울 FC', awayTeamName: 'TBD',
      });
    });

    it('자리에 연결되지 않은 기존 빈 경기는 라벨이 null 이고 TBD 그대로다', () => {
      expect(present({ ...empty })).toMatchObject({ homeSlotLabel: null, awaySlotLabel: null, homeTeamName: 'TBD', awayTeamName: 'TBD' });
    });
  });

  it('OFFICIAL 리비전(신규 경로)에서 homeScore/awayScore/goals가 채워진다', () => {
```

- [ ] **Step 1b: 공개 일정 응답의 실패하는 테스트를 쓴다**

`public-tournament-records.schedule-scorers.spec.ts` — fake 타입을 사이드 비어 있음·슬롯을 실을 수 있게 넓힌다. `FakeCanonicalScheduleRow` `old_string`:

```ts
  homeRegistrationId: string;
  awayRegistrationId: string;
  group: null;
  homeRegistration: { team: { id: string; name: string } };
  awayRegistration: { team: { id: string; name: string } };
  teamMatch: {
    startAt: Date;
```

`new_string`:

```ts
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  group: null;
  homeRegistration: { team: { id: string; name: string } } | null;
  awayRegistration: { team: { id: string; name: string } } | null;
  teamMatch: {
    homeSlot?: Record<string, unknown> | null;
    awaySlot?: Record<string, unknown> | null;
    startAt: Date;
```

파일 맨 끝(마지막 `describe` 뒤)에 추가한다:

```ts
describe('PublicTournamentRecordsService.getSchedule -- 자리 라벨 (homeSlotLabel / awaySlotLabel)', () => {
  const groupRank = { kind: 'GROUP_RANK', position: 1, group: { name: '4강', phase: 'semi' }, sourceGroup: { name: 'A조' } };
  const entry = { kind: 'ENTRY', position: 2, group: { name: 'A조', phase: 'group' }, sourceGroup: null };

  async function scheduleWith(seed: Partial<FakeCanonicalScheduleRow>, slots: Pick<FakeCanonicalScheduleRow['teamMatch'], 'homeSlot' | 'awaySlot'>) {
    const base = makeFixture({});
    const row: FakeCanonicalScheduleRow = {
      teamMatchId: base.id, tournamentId: TOURNAMENT_ID, groupId: null, round: base.round,
      fixtureNumber: 1, legNumber: 1,
      homeRegistrationId: base.homeRegistrationId, awayRegistrationId: base.awayRegistrationId,
      group: null, homeRegistration: base.homeRegistration, awayRegistration: base.awayRegistration,
      teamMatch: { startAt: base.scheduledAt, placeName: null, status: 'scheduled', fieldId: null, field: null, videos: [], game: base.game, ...slots },
      ...seed,
    };
    const prisma = buildFakePrisma({ fixtures: [base], canonicalRows: [row], consentLinks: [], consentSnapshots: [], goalEvents: [] });
    return new PublicTournamentRecordsService(prisma, UNUSED_ACCESS_SERVICE).getSchedule(TOURNAMENT_ID, {});
  }

  it('팀이 없고 자리가 있는 사이드는 자리 라벨을 낸다 (home/away 는 null 그대로)', async () => {
    const result = await scheduleWith(
      { homeRegistrationId: null, homeRegistration: null, awayRegistrationId: null, awayRegistration: null },
      { homeSlot: groupRank, awaySlot: entry },
    );
    expect(result.items[0]).toMatchObject({ home: null, away: null, homeSlotLabel: 'A조 1위', awaySlotLabel: 'A조 2번' });
  });

  it('팀이 있으면 자리가 연결돼 있어도 라벨은 null 이다 — 한쪽만 비어 있으면 빈 쪽에만 붙는다 (대조군)', async () => {
    const result = await scheduleWith(
      { awayRegistrationId: null, awayRegistration: null },
      { homeSlot: entry, awaySlot: groupRank },
    );
    expect(result.items[0]).toMatchObject({ homeSlotLabel: null, awaySlotLabel: 'A조 1위' });
    expect(result.items[0].home).toMatchObject({ teamName: '홈팀' });
  });

  it('자리에 연결되지 않은 기존 빈 경기는 라벨이 null 이다', async () => {
    const result = await scheduleWith(
      { homeRegistrationId: null, homeRegistration: null, awayRegistrationId: null, awayRegistration: null },
      { homeSlot: null, awaySlot: null },
    );
    expect(result.items[0]).toMatchObject({ homeSlotLabel: null, awaySlotLabel: null });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-detail.presenter.spec.ts 2>&1 | grep -E "Tests:|✕|homeSlotLabel" | head
```

기대(1단계 프레젠터 스펙): 라벨을 기대하는 3건 FAIL(`homeSlotLabel` undefined) — "팀이 있으면 null" 대조군은 `toMatchObject({ homeSlotLabel: null })` 이 undefined 와 달라 이것도 FAIL 이다. 4건 모두 빨갛다. 일정 스펙(Step 1b)도 같은 방식으로 확인한다:

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/games/public-records/public-tournament-records.schedule-scorers.spec.ts -t "자리 라벨" 2>&1 | grep -E "Tests:|✕"
```

기대: 첫 `it` 과 두 번째 `it` 이 FAIL(`homeSlotLabel` undefined), 세 번째 `it`(둘 다 `null`)은 undefined≠null 이라 역시 FAIL — 3건 모두 빨갛다.

- [ ] **Step 3: 구현한다**

(a) `tournaments-read.query.ts` — 파일 위 import 에 한 줄 추가:

```ts
import { SLOT_LABEL_SELECT } from './slots/tournament-slot-label';
```

`old_string`:

```ts
          fieldId: true,
          placeName: true,
          status: true,
          competitionConfigVersionId: true,
          game: {
            select: {
              state: true,
              visibilityPolicy: { select: { mode: true } },
```

`new_string`:

```ts
          fieldId: true,
          placeName: true,
          status: true,
          competitionConfigVersionId: true,
          homeSlot: { select: SLOT_LABEL_SELECT },
          awaySlot: { select: SLOT_LABEL_SELECT },
          game: {
            select: {
              state: true,
              visibilityPolicy: { select: { mode: true } },
```

(b) `tournament-detail.presenter.ts` — import 한 줄:

```ts
import { slotLabelFromRow } from './slots/tournament-slot-label';
```

`PresentedFixture` — `old_string`:

```ts
  scheduledAt: Date | null;
  fieldId: string | null;
  venue: string | null;
  status: PublicFixtureStatus;
```

`new_string`:

```ts
  scheduledAt: Date | null;
  fieldId: string | null;
  venue: string | null;
  homeSlotLabel: string | null;
  awaySlotLabel: string | null;
  status: PublicFixtureStatus;
```

`presentCanonicalFixture` — `old_string`:

```ts
    venue: match.placeName,
    status: fixtureStatusFromTeamMatch(match.status),
    homeRegistration: details.homeRegistration,
```

`new_string`:

```ts
    venue: match.placeName,
    // 라벨은 "팀이 없을 때 TBD 대신 보여 줄 이름" 이라 팀이 있으면 낸다 해도 쓰이지 않는다 — 처음부터 null 로 둔다.
    homeSlotLabel: details.homeRegistration === null && match.homeSlot ? slotLabelFromRow(match.homeSlot) : null,
    awaySlotLabel: details.awayRegistration === null && match.awaySlot ? slotLabelFromRow(match.awaySlot) : null,
    status: fixtureStatusFromTeamMatch(match.status),
    homeRegistration: details.homeRegistration,
```

응답 매핑 — `old_string`:

```ts
      homeTeamLogoUrl: hideIdentity ? null : (fixture.homeRegistration?.team.profile?.logoUrl ?? null),
```

`new_string`:

```ts
      homeTeamLogoUrl: hideIdentity ? null : (fixture.homeRegistration?.team.profile?.logoUrl ?? null),
      homeSlotLabel: fixture.homeSlotLabel,
```

`old_string`:

```ts
      awayTeamLogoUrl: hideIdentity ? null : (fixture.awayRegistration?.team.profile?.logoUrl ?? null),
```

`new_string`:

```ts
      awayTeamLogoUrl: hideIdentity ? null : (fixture.awayRegistration?.team.profile?.logoUrl ?? null),
      awaySlotLabel: fixture.awaySlotLabel,
```

- [ ] **Step 3b: 공개 일정 응답을 구현한다**

`public-tournament-records.service.ts` — import 한 줄(다른 import 들 옆):

```ts
import { SLOT_LABEL_SELECT, slotLabelFromRow } from '../../tournaments/slots/tournament-slot-label';
```

`CANONICAL_SCHEDULE_SELECT` 의 `teamMatch.select` — `old_string`:

```ts
      fieldId: true,
      field: { select: { id: true, name: true } },
      videos: { select: { id: true } },
```

`new_string`:

```ts
      fieldId: true,
      homeSlot: { select: SLOT_LABEL_SELECT },
      awaySlot: { select: SLOT_LABEL_SELECT },
      field: { select: { id: true, name: true } },
      videos: { select: { id: true } },
```

`FixtureScheduleRow` — `old_string`(이 파일에서 한 번만 나온다):

```ts
  videos: CanonicalScheduleRow['teamMatch']['videos'];
  game: CanonicalScheduleRow['teamMatch']['game'];
};
```

`new_string`:

```ts
  homeSlot: CanonicalScheduleRow['teamMatch']['homeSlot'];
  awaySlot: CanonicalScheduleRow['teamMatch']['awaySlot'];
  videos: CanonicalScheduleRow['teamMatch']['videos'];
  game: CanonicalScheduleRow['teamMatch']['game'];
};
```

`presentCanonicalSchedule` 의 반환 — `old_string`(`getMatch` 용 `presentCanonicalMatch` 는 `group` 다음이 `fieldId:` 라 겹치지 않는다):

```ts
    group: row.group,
    field: row.teamMatch.field,
```

`new_string`:

```ts
    group: row.group,
    field: row.teamMatch.field,
    homeSlot: row.teamMatch.homeSlot,
    awaySlot: row.teamMatch.awaySlot,
```

리그 어댑터 `toLeagueScheduleRow` — `old_string`:

```ts
    group: null,
    field: null,
    videos: fixture.videos,
```

`new_string`:

```ts
    group: null,
    field: null,
    homeSlot: null,
    awaySlot: null,
    videos: fixture.videos,
```

`presentScheduleEntry` 의 반환 — `old_string`(`visibilityMode: mode as EffectiveMode,` 는 이 파일에 한 번뿐이다):

```ts
    home: presentSide(fixture.homeRegistrationId, fixture.homeRegistration, hideIdentity),
    away: presentSide(fixture.awayRegistrationId, fixture.awayRegistration, hideIdentity),
    visibilityMode: mode as EffectiveMode,
```

`new_string`:

```ts
    home: presentSide(fixture.homeRegistrationId, fixture.homeRegistration, hideIdentity),
    away: presentSide(fixture.awayRegistrationId, fixture.awayRegistration, hideIdentity),
    // 라벨은 side 가 null(팀 미정)일 때 "미정" 대신 보여 줄 이름이다. 팀이 있으면 쓰이지 않으므로 null.
    homeSlotLabel: fixture.homeRegistration === null && fixture.homeSlot ? slotLabelFromRow(fixture.homeSlot) : null,
    awaySlotLabel: fixture.awayRegistration === null && fixture.awaySlot ? slotLabelFromRow(fixture.awaySlot) : null,
    visibilityMode: mode as EffectiveMode,
```


- [ ] **Step 4: 통과를 확인한다 + 이 select 를 쓰는 다른 스펙**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 src/tournaments/tournament-detail.presenter.spec.ts src/tournaments/tournaments-read.service.spec.ts src/games/public-records 2>&1 | grep -E "Tests:|Test Suites:|✕"
cd $WT/apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"; echo "exit=$?"
```

기대: 위 스위트와 `public-records` 아래 기존 스펙 전부 PASS, `exit=0`. (`tournaments-read.service.spec.ts` 는 행을 `as never` 로 만들어 새 select 와 무관해야 한다.)

- [ ] **Step 5: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git commit -m "feat(v1-api): 공개 대진·일정 경기에 팀이 없을 때 쓸 자리 라벨 homeSlotLabel/awaySlotLabel 추가" -- \
  apps/v1_api/src/tournaments/tournaments-read.query.ts apps/v1_api/src/tournaments/tournament-detail.presenter.ts \
  apps/v1_api/src/tournaments/tournament-detail.presenter.spec.ts \
  apps/v1_api/src/games/public-records/public-tournament-records.service.ts \
  apps/v1_api/src/games/public-records/public-tournament-records.schedule-scorers.spec.ts && git show --stat HEAD
```

---

### Task 14: API 문서 · 체인지셋 · 마감 검증

**Files:**
- Modify: `docs/api/domains/tournaments.md` (파일 끝에 섹션 추가)
- Create: `.changeset/admin-bracket-canvas-foundation.md`

- [ ] **Step 1: API 문서를 추가한다** — `docs/api/domains/tournaments.md` 맨 끝에 붙인다.

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && cat >> docs/api/domains/tournaments.md <<'EOF'

### 대진 자리(slot) 응답 (2026-10-09, 어드민 대진 그림 편집기 PR-1a)

- 새 표 `v1_tournament_slots`(`V1TournamentSlot`)는 팀이 들어갈 칸의 정본이다. 대회·정규 리그가 같은 표를 쓴다(`kind`: `ENTRY`·`BYE`·`GROUP_RANK`). `V1TeamMatch.homeSlotId`·`awaySlotId` 가 경기와 자리를 잇는다. 이 PR 은 스키마와 응답만 더하고 자리를 만드는 엔드포인트는 후속 PR 이다.
- `GET /admin/tournaments/:tournamentId/bracket` 최상위에 `slots[]` 가 추가된다: `{ id, kind, groupId, sourceGroupId, position, label, registrationId, teamName }`. `label` 은 저장하지 않고 읽을 때 계산한다 — 조별 그룹의 `ENTRY` "A조 1번", 결선 그룹·정규 리그의 `ENTRY` "1번 자리", `BYE` "부전승 1", `GROUP_RANK` "A조 1위". 빈 자리는 `registrationId`·`teamName` 이 null.
- 같은 응답의 `fixtures[]` 에 `homeSlotId`·`awaySlotId`(자리 없는 기존 경기는 null)와 `game` 이 추가된다: `{ id, state, version, hasLiveRecords, latestRevision: { id, state, score, entryMethod } | null }`. `hasLiveRecords` 는 게임 이벤트가 1건 이상이다(빠른 결과를 못 쓰는 조건과 같다). `latestRevision` 은 상태와 무관한 가장 최근 리비전(DRAFT·SUBMITTED·CHANGE_REQUESTED·OFFICIAL·VOID)이고 `score` 는 `{ home, away, penalties? }`, 읽을 수 없는 값이면 null. `entryMethod` 는 `reason` 이 `[quick-result]` 로 시작하면 `quick`, 앞 리비전을 대체한 것이면 `correction`, 그 밖은 `console` 이다. 정정·무효에 필요한 리비전 상세(참가자·eventsHash·goalEvents)는 싣지 않는다 — 결과 리비전 API 로 읽는다.
- 공개 상세 `fixtures[]` 에 `homeSlotLabel`·`awaySlotLabel` 이 추가된다. **그 사이드에 팀이 없고 자리가 연결돼 있을 때만** 값이 있고 그 밖에는 null 이다(팀이 있으면 팀 이름이 나온다). `homeTeamName`·`awayTeamName` 의 `'TBD'` 규칙은 바뀌지 않는다. 공개 일정 `GET /tournaments/:id/schedule` 의 `items[]`·`unscheduled[]` 항목에도 같은 두 필드가 같은 규칙으로 추가된다(리그 경기는 항상 null). 경기 단건 상세(`/matches/:fixtureId`)에는 라벨이 없다.
- `PATCH /admin/fixtures/:fixtureId` 는 자리에 연결된 사이드의 팀을 현재 값과 다르게 바꾸거나 비우려 하면 `409 SLOT_LINKED` 를 돌려준다. 같은 값을 보내거나 보내지 않은 쪽, 자리에 연결되지 않은 쪽은 그대로 바꿀 수 있다.
- `DELETE /admin/fixtures/:fixtureId` 는 경기를 숨기면서 `homeSlotId`·`awaySlotId` 도 같이 비운다. `DELETE /admin/groups/:groupId` 는 조에 속한 자리(`slots`)나 그 조를 원천으로 삼는 순위 자리(`rankSlots`)가 남아 있으면 `409 GROUP_HAS_SLOTS` 로 막는다(검사 순서: `GROUP_HAS_TEAMS` → `GROUP_HAS_FIXTURES` → `GROUP_HAS_SLOTS`).
EOF
tail -3 docs/api/domains/tournaments.md | cut -c1-80
```

- [ ] **Step 2: 체인지셋을 만든다** — `.changeset/admin-bracket-canvas-foundation.md`

```markdown
---
"v1_api": minor
"v1_web": minor
---

어드민 대진에 팀이 들어갈 "자리" 기반을 더했어요. 대진 응답에 자리 목록과 경기별 자리·게임 상태가 담기고, 자리에 연결된 칸은 경기 수정으로 직접 바꿀 수 없어요. 팀이 아직 없는 공개 대진 칸에는 자리 이름(예: "A조 1위")이 함께 내려가요.
```

- [ ] **Step 3: 영향 범위 스펙을 한 번에 돌린다 (풀스위트는 돌리지 않는다)**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && TZ=UTC ./node_modules/.bin/jest -c "$ISO/jest.iso.config.cjs" --maxWorkers=1 \
  src/common/admin-context.service.spec.ts src/games/game-schema-source-snapshot.spec.ts \
  src/tournaments/tournament-bracket.service.spec.ts src/tournaments/tournament-detail.presenter.spec.ts \
  src/tournaments/tournaments-read.service.spec.ts src/tournaments/league-fixture-generator.service.spec.ts \
  src/tournaments/slots src/tournament-operations/results/quick-result.constants.spec.ts 2>&1 | grep -E "Tests:|Test Suites:|✕"
```

기대: 모든 스위트 PASS, `✕` 없음.

- [ ] **Step 4: 타입·래칫을 마지막으로 확인한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && ./node_modules/.bin/tsc --noEmit -p "$ISO/tsconfig.isocheck.json"; echo "tsc=$?"
cd $WT/apps/v1_api && node scripts/v1-surface-check.mjs; echo "surface=$?"
cd $WT && git status --short | grep -v '^??'          # 기대: 커밋 안 한 변경(tracked) 없음
cd $WT && git status --short | grep -E 'prisma-iso-tmp|tsconfig.isocheck|jest.iso|slots-probe'   # 기대: 출력 없음
```

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT/apps/v1_api && for n in createGroupInTx recalculateStandingsInTx ensureGroupPhaseTeamsInTx updateTournamentFixtureInTx assignTournamentFixtureSideInTx assertSidesNotSlotLinked softDeleteTournamentFixtureInTx deleteTournamentGroupInTx createEmptyTournamentFixtureInTx; do
  printf '%s ' "$n"; grep -cE "^export (async )?function $n\b" src/tournaments/tournament-bracket-tx.ts; done
grep -cE "^export async function writeAdminActionLog\b" src/common/admin-context.service.ts
grep -cE "^export function (serializeAdminBracketSlot|serializeAdminBracketGame)\b" src/tournaments/slots/admin-bracket-view.ts
grep -c "GROUP_HAS_SLOTS" src/tournaments/tournament-bracket-tx.ts
grep -c "homeSlotLabel" src/tournaments/tournament-detail.presenter.ts src/games/public-records/public-tournament-records.service.ts
```

기대: 함수별 `1` 이 전부(0 이 하나라도 있으면 그 Task 의 export 가 빠진 것), `writeAdminActionLog` 1, serialize 2, `GROUP_HAS_SLOTS` 1 이상, 두 파일 모두 `homeSlotLabel` 1 이상.

기대(타입·래칫): `tsc=0`, `surface=0`, 임시 파일 흔적 없음. 공유 Prisma 클라이언트가 그대로인지는 `ls -la --time-style=full-iso <공유 .prisma/client/index.d.ts>` 의 시각이 작업 전과 같으면 된다(`grep -c V1TournamentSlot` 이 0).

- [ ] **Step 5: 커밋한다**

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
cd $WT && git add .changeset/admin-bracket-canvas-foundation.md && git commit -m "docs(v1-api): 대진 자리 응답 계약 문서와 체인지셋 추가" -- \
  docs/api/domains/tournaments.md .changeset/admin-bracket-canvas-foundation.md && git show --stat HEAD
```

(새 파일은 `git add` 가 필요해 체인지셋 한 파일만 명시적으로 add 한다 — 디렉터리·`-A` 금지.)

- [ ] **Step 6: PR 전 확인 (이 계획 밖 절차 — 색인 참조)** — `git fetch origin dev` 후 base 가 움직였으면 마이그레이션 타임스탬프(최신 + 1)와 스키마 해시를 다시 맞춘다. PR base 는 `dev`. 통합 스펙은 CI 에서 확인한다. 이 PR 은 UI 변경이 없어 갤러리 대상이 아니다.

- [ ] **Step 7: 머지 후 확인 (색인 "머지 후 확인" — UI 없는 PR: 갤러리 면제, 읽기 전용 스모크만, alpha 쓰기 없음)**

dev 머지 = 즉시 alpha 배포다. 배포 창(502)에서 측정하면 멀쩡한 응답을 결함으로 오진하므로 먼저 배포 SHA 를 확인한다. 이 Step 은 **GET 만** 쓴다 — 대회·조·경기·결과를 만드는 alpha 쓰기는 하지 않는다(필요해지면 실행 전 사용자 승인).

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
set -e
MERGE_SHA=<dev 에 머지된 커밋 SHA>   # gh pr view <N> --repo kim-song-jun/matchup-sports-platform --json mergeCommit --jq .mergeCommit.oid 로 얻는다 (PR 번호는 gh pr create 가 준 URL 에서 파싱)
gh run list --workflow deploy-alpha.yml --branch dev --limit 1 --repo kim-song-jun/matchup-sports-platform --json headSha,status,conclusion --jq '.[0]'
DEPLOYED=$(curl -fsSI https://alpha.teameet.co.kr/landing | grep -i '^x-teameet-commit' | tr -d '\r' | awk '{print $2}'); echo "deployed=$DEPLOYED"
test -n "$DEPLOYED"
git -C $WT fetch origin dev -q
git -C $WT merge-base --is-ancestor "$MERGE_SHA" "$DEPLOYED" && echo "포함됨"
curl -fsS https://alpha.teameet.co.kr/api/v1/health | jq -e '.data.checks.db == true'
```

기대: 마지막 배포 run 이 `completed/success`, `포함됨`, health `true`. 하나라도 아니면 배포 창이거나 직전 run 이 `cancelled` 인 것이니 측정하지 말고 기다렸다 다시 본다.

공개 응답 스모크(비인증 GET) — 새 필드가 **키로 존재**하는지만 본다. 자리가 없는 기존 대회라 값은 전부 `null` 이 정상이다.

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
set -e
API=https://alpha.teameet.co.kr/api/v1
TID="${TID:?경기가 있는 alpha 대회 id 를 먼저 export TID=... 로 넣어 주세요(새로 만들지 않는다)}"
curl -fsS "$API/tournaments/$TID" | jq -e '[.data.fixtures[]? | has("homeSlotLabel") and has("awaySlotLabel")] | length == 0 or all'
curl -fsS "$API/tournaments/$TID/schedule" | jq -e '[(.data.items[]?, .data.unscheduled[]?) | has("homeSlotLabel") and has("awaySlotLabel")] | length == 0 or all'
```

기대: 두 명령 모두 `true`(경기가 없어 배열이 비면 `length == 0` 로 통과하니, 경기가 있는 대회를 골라 `jq '.data.fixtures | length'` 가 1 이상인지 한 번 확인한다).

어드민 응답 스모크 — 어드민 세션 쿠키가 필요하다. 세션은 `login` API 로만 발급되고 계정·비밀번호는 저장소 밖 비공개 메모리(`alpha-e2e-test-accounts.md`)에 있다. 쿠키는 환경변수로만 넘기고 출력·커밋하지 않는다.

```bash
export WT=/Users/sungjun/Dev/projects/matchup-sports-platform/.claude/worktrees/admin-bracket-canvas
export ISO=/Users/sungjun/.cache/bracket-canvas-iso
set -e
API=https://alpha.teameet.co.kr/api/v1
TID="${TID:?위 블록과 같은 대회 id 를 export TID=... 로 넣어 주세요}"
# ALPHA_SESSION_TOKEN 은 login 응답의 set-cookie teameet_v1_session 값 (alpha 는 헤더 dev 인증이 401)
curl -fsS -H "cookie: teameet_v1_session=$ALPHA_SESSION_TOKEN" "$API/admin/tournaments/$TID/bracket" \
  | jq -e '(.data.slots | type == "array") and ([.data.fixtures[] | has("homeSlotId") and has("awaySlotId") and has("game")] | all)'
curl -fsS -H "cookie: teameet_v1_session=$ALPHA_SESSION_TOKEN" "$API/admin/tournaments/$TID/bracket" \
  | jq '{slots: (.data.slots | length), withGame: ([.data.fixtures[] | select(.game != null)] | length), sampleGame: ([.data.fixtures[] | select(.game != null)][0].game)}'
```

기대: 첫 명령 `true`(`slots[]` 가 배열이고 모든 경기에 `homeSlotId`·`awaySlotId`·`game` 키가 있다), 두 번째에서 `game` 이 있는 경기의 `{ id, state, version, hasLiveRecords, latestRevision }` 모양을 확인한다. 자리가 아직 없는 대회라 `slots` 는 `0` 이 정상이다 — 자리 생성은 PR-1b 이후다. 이 PR 은 화면이 없으므로 ego-browser 시나리오·3폭 갤러리는 건너뛴다.

---

## Self-Review

### 스펙 항목 → Task 매핑

| 스펙 항목 | Task |
|---|---|
| PR-1 첫 bullet — 정본 §6 결정 이력 4행(자리·템플릿 / 리그 빈 경기·공개 제외 / 어드민 빠른 결과 / 킥 수 면제) | 1 |
| S1 — `V1TournamentSlot`·`V1TeamMatch.homeSlotId/awaySlotId`·유일 제약·additive 마이그레이션·백필 없음 | 2 |
| PR-1 두 번째 bullet — 스키마 해시 5곳(`alpha-manifest-common.sh` 는 추가) | 2 |
| 공유 계약 — 격리 생성 + 격리 tsc 절차, 공유 클라이언트 오염 확인 | 2 (Step 10-11), 14 (Step 4) |
| 감사 로그를 `…InTx` 에서 쓰기 위한 전제 (`writeAdminActionLog`) | 3 |
| S1 라벨 규칙("A조 1번"·"1번 자리"·"부전승 1"·"A조 1위") / S4 공개 라벨의 계산 | 4 |
| 계약 `QUICK_RESULT_REASON_MARKER`·`revisionEntryMethod` (entryMethod 직렬화 전제) | 5 |
| 계약 `createGroupInTx` · S3 의 `ensureGroupPhaseTeams`(조 편성)·순위 재계산 이관 | 6 |
| 계약 `assignTournamentFixtureSideInTx`(updateFixture 가드 전부 + `ensureGroupPhaseTeams` + `enqueueRosterResync` + 감사 보존) | 7 |
| S3 — 자리 연결 사이드는 `PATCH /admin/fixtures/:id` 로 못 바꾼다(409 `SLOT_LINKED`) / Test: 엣지 `SLOT_LINKED` | 8 (+ 통합 11) |
| 계약 `softDeleteTournamentFixtureInTx` + S1 "경기가 빠지는 모든 경로는 자리 연결을 같이 푼다"(대회 `deleteFixture`) | 9 (+ 통합 11) |
| 계약 `deleteTournamentGroupInTx` + 자리가 남은 조 삭제의 FK 500 방지(`GROUP_HAS_SLOTS`) | 10 |
| 계약 `createEmptyTournamentFixtureInTx`(자리 id · 멱등 키 · 소프트 삭제 이력 반영) | 11 |
| S5 마지막 항목 — 어드민 대진 응답 `slots[]`·`homeSlotId/awaySlotId`·`game{… latestRevision … entryMethod}` | 12 |
| S4·S7 — 공개 경기 직렬화(대회 상세 `fixtures[]` + 공개 일정 `items[]/unscheduled[]`) `homeSlotLabel/awaySlotLabel`(팀 없을 때만) / Test: 공개 경기·일정 직렬화 라벨 | 13 |
| PR-1 공통 — `docs/api/domains/tournaments.md` 갱신 · changeset | 14 |
| 보충 계약 export 전수(`writeAdminActionLog` · `createGroupInTx` 전체 행 · `recalculateStandingsInTx` · `ensureGroupPhaseTeamsInTx` · `updateTournamentFixtureInTx` · `assertSidesNotSlotLinked` · `serializeAdminBracketSlot/Game` · `GROUP_HAS_SLOTS` · 공개 일정 라벨) — 상단 "1a 가 export 하는 이름" 표 + Task 14 Step 4 grep 대조 | 3·6·7·8·10·12·13·14 |
| 색인 "머지 후 확인"(UI 없는 PR) — 배포 SHA 확인 + 읽기 전용 API 스모크, alpha 쓰기 없음 | 14 (Step 7) |
| Mock data updates — 스키마 해시 · 대진 서비스 spec 의 Prisma mock 에 `homeSlotId`/`awaySlotId`/`v1TournamentSlot` | 2, 6~12 |

### 이 PR 의 테스트가 겨냥하는 실제 결함

- 해시 재고정 누락 → `game-schema-source-snapshot` (Task 2), 마이그레이션이 스키마와 어긋남 → `migrate diff` 대조 (Task 2).
- 추출 중 동작 변화 → 기존 `tournament-bracket.service.spec.ts` 93개를 매 Task 에서 재실행 (`조 편성 정합`·`updateFixture:`·`deleteFixture:`·`recalculateStandings:`).
- 한 사이드만 바꿔야 하는데 두 사이드를 건드림 / 반대쪽 보존 (Task 7 양방향), 연결된 사이드만 막고 반대쪽은 허용하는 양쪽 대조군 (Task 8), 지운 경기만 슬롯이 풀리고 다른 경기는 그대로 (Task 9 통합), 조 삭제 가드의 우선순위와 대조군 (Task 10).

### 미해결·후속으로 넘기는 것 (스펙 위반 아님)

- **공개 경기 단건 상세(`getMatch`, `/tournaments/:id/matches/:fixtureId`)에는 라벨을 싣지 않는다** — 단건 화면은 대진표 허브가 아니라 경기 결과·기록 화면이고 `PublicMatchDetail` 에 자리 개념이 없다. 대회 상세 `fixtures[]`(대진표)와 `getSchedule`(일정 탭) 두 곳은 Task 13 이 맡고, 웹 소비는 PR-3 Task 16 이 맡는다(상호 이월 없음).
- 웹 타입(`V1AdminBracketSlot` 등)·MSW·`bracket-tab.test.tsx` 목 데이터는 PR-3 소관(색인). 이 PR 은 서버 응답 필드를 **추가만** 하므로 기존 웹 타입 검사는 깨지지 않는다.
- 자리 서비스·템플릿·`lockCompetitionForBracketMutationInTx` 는 PR-1b.
