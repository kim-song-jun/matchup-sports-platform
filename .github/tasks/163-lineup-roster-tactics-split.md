# Task 163 — 명단 제출과 선발 결정을 분리한다 (명단 → 출석, 선발 → 전술보드/kickoff)

## Context

지금 **명단 제출 한 화면**에 세 가지가 섞여 있다: 누가 오나(출석) · 누가 선발이고 누가 후보인가 · 피치 위 어디에 서나.
사용자 의도(2026-09-02 확정)는 이 셋을 가르는 것이다:

```
명단 제출     "누가 오나" **만**. 선발/후보 없음. 피치 없음.
전술보드      선발 · 후보 · 포지션 · 좌표 · 포메이션 — **팀 내부용** (이미 /teams/:id/tactics/:gameId 에 있다)
경기 기록     V1GameParticipant.started 는 그대로 남는다 — 교체·결과·공개기록이 읽는다
```

즉 `started` 를 **없애는 게 아니라, "누가 언제 정하느냐"를 제출 시점에서 kickoff 시점으로 옮긴다.**

### 지금 코드가 하는 일 (2026-09-02 실측, `origin/dev` = `b1c264039`)

| 자리 | 하는 일 |
|---|---|
| `apps/v1_api/src/games/dto/game-lineup.dto.ts:67` | `started!: boolean` — 제출 DTO 필수 |
| `apps/v1_api/src/games/games.service.ts:2605-2628` | 대회 경기 라인업 **저장 시** 선발 인원 min~max + GK 정확히 1명 강제 (`LINEUP_SIZE_INVALID` · `LINEUP_GOALKEEPER_INVALID`) |
| `apps/v1_api/src/team-matches/team-match-lineup.service.ts:834-858` | 팀매치 라인업 **저장 시** 같은 두 검증 |
| `apps/v1_api/src/games/games.service.ts:1064, :2829` | 참가자 생성 — `started` 를 여기서 채운다. **`start` 커맨드(:1361)는 참가자를 안 만진다** |
| `apps/v1_api/src/games/core/substitution.ts:73,121` | `started` 로 "피치 위" 집합을 만든다 — 교체의 기준 |
| `apps/v1_api/src/team-lineups/team-tactics-board.service.ts:57` | `get(user, teamId, gameId)` — 전술보드 읽기. DTO 는 `started`·`goalkeeper`·`position`·`positionX/Y`·`formation` 전부 담는다 |
| `apps/v1_web/src/app/team-matches/[id]/lineup/lineup-client.tsx:130,734-770` | `activeView: 'roster' \| 'pitch'` 두 탭. 피치 탭이 `PitchFormationEditor` 를 그린다 |

### ⚠️ 이미 있는 부채 — 후보 표현이 **두 벌**이다

```
대회 경기   V1GameParticipant.started 컬럼
팀매치      position === 'BENCH' 센티널  (started 는 전부 true 로 들어간다)
            ← team-match-lineup.service.ts:24-32 주석. "Task 14 후속 스키마 요청" 으로 남아 있던 것
```
`TeamLineupHistoryService.list()` 가 소스에 따라 다른 분기를 탄다. **이 개편에서 `started` 하나로 통일한다** — 선발 결정이 kickoff 로 옮겨가면 저장 경로가 후보를 구분할 이유가 없어져 센티널이 자연히 죽는다.

## Goal

1. 명단 제출(팀매치·대회 경기 둘 다)에서 **선발/후보 입력을 받지 않는다.** 기존 클라이언트가 `started` 를 보내도 400 내지 않고 **무시**한다.
2. 선발은 **kickoff(`start` 커맨드) 시점**에 정한다:
   - 그 경기의 **전술보드가 있으면** 보드의 `started`·`goalkeeper`·`position` 을 참가자에 복사한다.
   - **없으면 명단 전원을 `started = true`** 로 둔다. 교체는 콘솔에서 한다.
3. 저장 시 검증(min~max·GK)을 **제거한다.** kickoff 에서도 검증하지 않는다 — 보드가 규칙을 어겨도 경기는 시작되고 콘솔 교체로 조정한다 (사용자 확정 — 아래 Ambiguity Log 1·2).
4. `BENCH` 센티널을 폐기하고 `started` 컬럼으로 통일한다. 기존 행은 마이그레이션한다.
5. 라인업 화면에서 피치 탭을 제거한다 — **A안**: 탭 줄을 없애고 명단만 남기며, 팀장에게만 *"선발·배치는 전술보드에서 →"* 한 줄 링크를 상단에 둔다. `PitchFormationEditor` 의 라인업 쪽 소비처가 사라지면 dead 여부를 전수 grep 으로 확인한다(전술보드가 쓰면 살아 있다).

### 비목표
- 전술보드 UI 변경 없음. 전술보드는 이미 필요한 전부를 담는다.
- 결과 입력·결과 리뷰·공개 기록 변경 없음 — `started` 를 읽는 계약이 그대로다.
- 포지션 자동 추천 없음.

## Original Conditions

- [ ] `SaveGameLineupDto.participants[].started` 를 **optional** 로 바꾸고, 저장 경로는 값을 **무시**한다 (있어도 안 쓴다). 대회 경기·팀매치 둘 다.
- [ ] 참가자 생성(`:1064`, `:2829`, 팀매치 서비스)은 `started` 를 **채우지 않는다** — 스키마 기본값이 있으면 그 값, 없으면 `false`. kickoff 가 채운다.
- [ ] 저장 시 `LINEUP_SIZE_INVALID`·`LINEUP_GOALKEEPER_INVALID` 검증을 **두 서비스에서 제거**한다.
- [ ] `start` 커맨드(SCHEDULED→LIVE 전이 트랜잭션 안)에 **선발 해석**을 넣는다:
  - [ ] 홈/원정 각 side 의 보드를 **`sideId` 로 직접** 읽는다 — `TeamTacticsBoardService.loadBoard(side)`(185행)는 `findUnique({ where: { sideId } })` 라 팀 권한과 무관하다. 권한 검사(`assertTeamLineupMember`)는 `get()` **입구**(58행)에만 있다. 내부용 `loadBoardBySideId(sideId)` 한 줄이면 되고 컨트롤러 경로는 손대지 않는다. (**우회가 아니라 비경유** — 2026-09-02 피어 실측, 마스터 확인)
  - [ ] 보드가 있으면: 보드 엔트리 ↔ 참가자를 **`userId` 우선, 없으면 `displayName`** 으로 매칭해 `started`·`goalkeeper`·`position`·`positionX/Y` 복사. 보드에 없는 명단원은 `started = false`.
  - [ ] 보드가 없거나 **엔트리 0건**이면: 전원 `started = true`. 로그에 `LINEUP_FALLBACK_ALL_STARTED` 표식을 남기되 **`reason=no_board` / `reason=empty_board` 로 가른다** — 동작은 같아도 얼마나 자주 타는지 세는 게 목적이라 합치면 못 읽는다.
  - [ ] **어느 경로든 인원·GK 검증은 하지 않는다.** `LINEUP_SIZE_INVALID`·`LINEUP_GOALKEEPER_INVALID` **코드**는 두 저장 서비스에만 있어 dead 가 된다 → 삭제 (`competition-config.presets.ts:143` 의 주석 인용은 남겨도 된다 — grep 0 을 기대하지 마라). **`parseLineupLimits` 함수는 삭제하지 않는다** — 저장 경로 2곳의 호출만 제거한다. 전술보드(`team-tactics-board.service.ts:253`)·대회 관리자(`tournaments-admin.service.ts:231,570`)·config 파싱이 계속 쓴다(2026-09-02 전수 실측 6곳 중 4곳 생존).
- [ ] `BENCH` 센티널 폐기:
  - [ ] 마이그레이션: `position = 'BENCH'` 인 `V1GameParticipant` 행을 `started = false, position = NULL` 로. **idempotent**(`WHERE position = 'BENCH'`).
  - [ ] `team-match-lineup.service.ts` 의 `BENCH_MARKER` 쓰기 경로 제거.
  - [ ] `TeamLineupHistoryService.list()` 의 소스별 분기 제거 — `started` 하나로.
  - [ ] `BENCH_MARKER` export 를 **전수 grep** 해 소비처 0 확인 후 삭제 (테스트만 남으면 dead — [[test-only-consumer-hides-dead-code]]).
  - [ ] ⚠️ **`league-result-participants.ts:69` 의 `TEAM_MATCH_BENCH_POSITION = 'BENCH'` 복사본** — 리그 결과 입력이 이 관례로 후보를 가른다(주석: *"컬럼이 아니라 이 관례를 봐야 한다"*). 마이그레이션이 `position='BENCH'` 를 지우면 **이 판정이 근거를 잃어 전원 선발로 읽힌다.** `started` 컬럼을 읽도록 바꾸고 상수를 삭제한다. **이 파일은 작업 범위다.**
- [ ] 교체(`substitution.ts`)·결과·공개 기록은 **변경 없음**을 테스트로 고정한다 — kickoff 이후의 `started` 가 예전과 같은 의미다.
- [ ] 프론트 라인업 화면: 선발/후보 토글 UI 제거, `started` 를 보내지 않음, **피치 탭 줄 제거 + 팀장 전용 전술보드 링크 한 줄** (A안). `PitchFormationEditor` 라인업 쪽 소비처 제거 후 dead 여부 전수 grep.

## User Scenarios

1. **전술보드 있음 (정상)**: 팀장이 명단 제출(출석만) → 전술보드에서 선발 7명 + GK 지정 → 운영자 kickoff → 참가자 7명 `started`, GK 표시 → 콘솔 교체 정상.
2. **전술보드 없음 (fallback)**: 명단 9명 제출 → 보드 없음 → kickoff → 9명 전원 `started` → 콘솔에서 교체로 조정. 검증 안 함.
3. **보드에 없는 명단원**: 명단 10명, 보드엔 8명 → 8명 `started`, 2명 `false`(후보).
4. **보드 선발이 규칙 위반**: 풋살 max 5 인데 보드 선발 6명 → **kickoff 통과**, 6명 `started`. 콘솔에서 교체로 조정. (사용자 확정: 막지 않는다)
5. **옛 클라이언트**: `started: true/false` 를 보내도 200. 값은 무시된다.

## Test Scenarios

- **happy**: 시나리오 1 — kickoff 후 `started` 분포가 보드와 일치. 교체 1회 후 onPitch 집합이 옳다.
- **edge**: 시나리오 3 (부분 매칭) · `displayName` 만 있는 게스트 매칭 · 보드는 있는데 엔트리 0건(→ fallback 과 같이 취급하나? **Ambiguity 3**).
- **error**: 보드 조회가 **오류**로 실패하면(DB) kickoff 는 500 — **보드 없음(fallback)과 갈라야 한다.** 없음은 정상 경로, 실패는 오류다. (권한 오류는 이 경로에 없다 — `sideId` 직접 조회라 권한 검사를 안 지난다.)
- **mock updates**: `games.service.spec.ts` 의 라인업 저장 스펙에서 `started` 검증 단언 제거 → kickoff 스펙으로 이동. `team-match-lineup.service` 스펙의 `BENCH` 단언 제거. `TeamLineupHistoryService` 스펙의 소스별 분기 제거. **`started` 를 보내는 프론트 fixture 8곳** 갱신.
- **마이그레이션 replay**: 빈 DB 재생 + drift 0 (CI 게이트).

## Parallel Work Breakdown

```
Backend  ⟂  Frontend  ⟂  (Infra 없음)
  BE-1 DTO optional + 저장 검증 제거 + 참가자 started 미기입
  BE-2 kickoff 선발 해석 (보드 → 복사 / 없음 → 전원). 검증은 어느 경로에도 없다
  BE-3 BENCH 마이그레이션 + 센티널 폐기 + history 분기 제거
  FE-1 라인업 화면 선발/후보 토글 제거, started 미전송      ← BE-1 머지·배포 **후**
  FE-2 피치 탭 제거 → A안 (탭 줄 삭제 + 전술보드 링크 한 줄)     ← BE 배포 후, FE-1 과 한 PR 가능
순차: BE-1 → BE-2 → BE-3 은 한 PR 가능. FE-1 은 BE 배포 뒤.
```

## Acceptance Criteria

- [ ] alpha 에서 시나리오 1·2·3·4 를 **운영 API 로 직접 만들어** 확인 (`scripts/verify-alpha-period-break.mjs` 패턴 — takeover 토큰은 Socket.IO 로만).
- [ ] `git grep -n "'BENCH'" -- apps/v1_api/src apps/v1_web/src` → **0건** (주석 제외). ⚠️ 센티널 **이름**(`BENCH_MARKER`)이 아니라 **값**을 센다 — `league-result-participants.ts` 가 이름을 import 하지 않고 값을 복사해 갖고 있어서, 이름만 세면 0 인데 값이 살아 리그 결과가 조용히 틀린다(2026-09-02 실측).
- [ ] 저장 경로에 `started` 를 보내도/안 보내도 200.
- [ ] kickoff 후 `GET /tournaments/:id/matches/:fixtureId` 의 참가자 `started` 가 보드와 일치 (공개 API 가 ground truth).
- [ ] 마이그레이션 idempotent — 두 번 돌려도 같은 결과.

## Tech Debt Resolved

- `BENCH` 센티널 (Task 14 후속 요청으로 남아 있던 것) — `started` 컬럼으로 통일.
- 저장 시 검증이 두 서비스에 **복제**돼 있던 것 — 제거. 인원 규칙은 콘솔 교체가 담당한다.

## Security Notes

- kickoff 의 보드 조회는 **`sideId` 로 직접** 한다. 팀 소속 검사(`assertTeamLineupMember`)는 `get()` 의 입구에만 있고 보드 로드 자체는 side 만 안다 — kickoff 는 경기에서 side 를 이미 알므로 **user 도 teamId 도 필요 없다.** 권한을 우회하는 게 아니라 **그 경로를 지나가지 않는다.** 내부용 `loadBoardBySideId` 는 컨트롤러에 노출하지 않는다.
- 명단 제출에서 `started` 를 무시하므로 **클라이언트가 선발을 조작할 경로가 사라진다** — 오히려 좁아진다.

## Risks & Dependencies

- ⚠️ **통합 스펙은 tsc 범위 밖이다** — `tsconfig include` 가 `src·prisma·test/fixtures·test/helpers` 뿐이라 `test/**/*.integration-spec.ts` 의 타입 오류를 로컬 `tsc --noEmit` 이 못 잡는다(피어가 일부러 오류를 넣어 rc=0 확인). CI 의 ts-jest 가 유일한 게이트 — [[local-tsc-does-not-cover-test-dirs]].
- ⚠️ **`test/team-matches/team-match-lineup.integration-spec.ts` 는 `testPathIgnorePatterns` 에 있어 아예 안 돈다** (선재 결함으로 명시 제외). 제거한 검증을 단언하던 5개 스펙 중 **4개만 실제로 돈다** — [[tests-that-never-run]].

- **fallback(전원 선발)이 max 를 넘는다** — 사용자 수용. 다만 얼마나 자주 타는지 **표식 로그로 센다**.
- alpha 의 기존 `BENCH` 행 — 마이그레이션이 만진다. **alpha 데이터 변경은 사용자 직접 승인** ([[alpha-data-changes-need-direct-user-approval]]). 마이그레이션은 배포에 실려 자동 적용되므로 **머지 전에** 승인을 받는다.
- FE-1 이 BE 보다 먼저 배포되면 `started` 없이 보내서 400 — **순서 강제**.

## Ambiguity Log

| # | 질문 | 결정 | 근거 |
|---|---|---|---|
| 1 | 전술보드 없으면? | **명단 전원 선발, 교체는 콘솔, 검증 없음** | 사용자 확정 2026-09-02 |
| 2 | 보드 선발이 min~max 위반이면? | **막지 않는다** — kickoff 통과, 콘솔 교체로 조정 | 사용자 확정 2026-09-02 |
| 3 | 보드는 있는데 엔트리 0건이면? | **fallback 과 동일 취급**(전원 선발). 로그 표식만 `reason=empty_board` 로 갈라 센다 | 마스터·피어 합의 2026-09-02. 동작은 사용자 확정 1 과 동일 |
| 4 | 보드 매칭 키 | `userId` 우선, 없으면 `displayName` | 게스트는 userId 가 없다 |
| 5 | 피치 탭 제거 후 라인업 화면 | **A안 확정** — 탭 줄 제거, 명단만 남김, 상단에 팀장 전용 한 줄 링크 *"선발·배치는 전술보드에서 →"* (`/teams/:id/tactics/:gameId`). 기존 명단 컴포넌트 그대로. | 사용자 확정 2026-09-02 (3안 중 A). Task 164 로 분리하지 않고 FE-2 에 포함 |
