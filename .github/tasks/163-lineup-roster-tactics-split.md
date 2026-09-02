# Task 163 — 명단 = 출전자 (선발/후보 개념 제거, 전술보드는 팀 내부 도구)

> **정본**: `docs/design/competition-canonical-flow.md` §3 (PR #974 로 추가되는 문서 — **#974 를 먼저 머지한다**).
> 이 문서는 그 절을 코드로 옮기는 순서와 계약이다. 정본과 충돌하면 정본이 이긴다.
>
> **이력**: 이 문서의 첫 판(2026-09-02 오전)은 "선발 결정을 제출 시점에서 kickoff 시점으로 옮기고 전술보드에서 해석" 하는
> 설계였다. 같은 날 사용자가 정본을 확정하며 **선후발 구분 자체를 없앴다.** 그 설계(BE-2)는 폐기됐고 코드도 되감았다
> (피어 실측: kickoff 해석 흔적 grep 0). 아래는 정본 기준으로 다시 쓴 것이다.

## Context

명단 제출 한 화면에 세 가지가 섞여 있었다: 누가 오나(출석) · 누가 선발이고 누가 후보인가 · 피치 위 어디에 서나.
정본 §3 의 답:

```
명단 제출     "누가 오나" 만. 등번호 + 이름. 선발/후보 없음. 피치 없음.   → 명단 = 출전자
전술보드      선발 · 포지션 · 좌표 · 포메이션 — 팀 내부 도구. 대회·kickoff·결과와 연결 없음
경기 기록     V1GameParticipant.started 컬럼은 남되 값은 항상 true
```

### 지금 코드가 하는 일 (2026-09-02 실측, `origin/dev` = `b1c264039`)

| 자리 | 하는 일 |
|---|---|
| `apps/v1_api/src/games/dto/game-lineup.dto.ts:67` | `started!: boolean` — 제출 DTO 필수 |
| `apps/v1_api/src/games/games.service.ts:2605-2628` | 대회 라인업 저장 시 선발 인원 min~max + GK 1명 강제 (`LINEUP_SIZE_INVALID` · `LINEUP_GOALKEEPER_INVALID`) |
| `apps/v1_api/src/team-matches/team-match-lineup.service.ts:834-858` | 팀매치 라인업 저장 시 같은 두 검증 |
| `games.service.ts:2826,2840` | 대회 라인업 참가자 생성 — DTO 의 `started` 를 **그대로 저장**(false 도 저장된다) |
| `games.service.ts:3687,4090,6425` | 결과 리비전 참가자(`V1GameResultParticipant`) 쓰기 — DTO 의 `started` 그대로 |
| `team-match-lineup.service.ts:160-185,395-420` | 팀매치 참가자 생성·정정요청 복사 — `started` 를 싣지 않는다(기본값 true 의존) |
| `team-match-lineup.service.ts:24-32` | 후보를 `position='BENCH'` 센티널로 기록 |
| `league-result-participants.ts:69` | `TEAM_MATCH_BENCH_POSITION='BENCH'` 값 복사본으로 후보를 가른다 |
| `games/core/substitution.ts:73,121` | `started` 로 "피치 위" 집합을 만든다(교체 엔진) |
| `apps/v1_web/src/app/team-matches/[id]/lineup/lineup-client.tsx:130,734-770` | <code>activeView: 'roster' &#124; 'pitch'</code> 두 탭 + 선발 토글 |
| `apps/v1_web/src/components/admin/result-edit-modal.tsx:822-823` | 어드민 결과 정정의 선발 체크박스 |

### ⚠️ 후보 표현이 두 벌이고 `started` 컬럼은 세 테이블에 있다

```
팀 매치 라인업    position='BENCH'  (started 는 기본값 true 로 남음)
대회 라인업       started=false     (DTO 값 그대로)  ← alpha 에 이런 행이 실재한다 (2026-09-02 마스터 실측)
```

| 컬럼 | 기본값 | 정본 §3 처분 |
|---|---|---|
| `V1GameParticipant.started` | `true` | 컬럼 유지, 값 `true` 고정. 읽는 자리(교체 엔진·결과 프로젝션·개인 기록)는 손대지 않는다 |
| `V1GameResultParticipant.started` | `false` | 앞으로의 쓰기는 출전자 전원 `true`. **기존 행은 마이그레이션하지 않는다**(공식 기록 이력 보존, 이 값은 더 이상 화면에 안 보인다) |
| `V1TeamLineupPresetEntry` · `V1TeamTacticsBoardEntry.started` | `true` | 팀 내부 도구. 건드리지 않는다 |

## Goal

1. 명단 제출(팀매치·대회 둘 다)에서 **선발/후보 입력을 받지 않는다.** 옛 클라이언트가 `started` 를 보내도 400 내지 않고 무시한다.
2. 저장 시 인원·GK 검증을 **제거**한다. 명단 = 출전자이므로 검증할 "선발" 이 없다.
3. `BENCH` 센티널과 `started=false` 라인업 행을 **마이그레이션으로 정리**하고, 앞으로의 모든 쓰기는 `started=true`.
4. 라인업 화면에서 선발 토글과 피치 탭을 제거한다 — **A안**: 탭 줄 삭제, 명단만, 팀장 전용 한 줄 링크 *"선발·배치는 전술보드에서 →"*.
5. 어드민 결과 정정의 선발 체크박스 제거.

### 비목표
- 전술보드 UI·서비스 변경 없음(팀 내부 도구로 유지 — 사용자 확정). kickoff 이 전술보드를 읽는 코드는 **만들지 않는다.**
- 교체 엔진 변경 없음(롤링 종목 교체 제거는 Task 166).

## Original Conditions

### BE-1 — 검증 제거 · DTO (커밋 `1a9c79f0d`, 통합 4 suites·14 tests 로컬 DB 통과)
- [x] `SaveGameLineupDto.participants[].started` optional, 저장 경로는 무시.
- [x] `LINEUP_SIZE_INVALID`·`LINEUP_GOALKEEPER_INVALID` 저장 검증을 두 서비스에서 제거. 두 코드는 dead → 삭제. **`parseLineupLimits` 는 삭제하지 않는다** — 전술보드(`team-tactics-board.service.ts:253`)·대회 관리자(`tournaments-admin.service.ts:231,570`)가 계속 쓴다.

### BE-3 — 후보 개념 제거 (한 PR)
- [ ] **마이그레이션(넓은 범위, 마스터 승인 2026-09-02)**:
  ```sql
  UPDATE "v1_game_participants"
  SET "started" = true,
      "position" = CASE WHEN "position" = 'BENCH' THEN NULL ELSE "position" END
  WHERE "started" = false OR "position" = 'BENCH';
  ```
  idempotent(2회차 0행). UPDATE 전에 `position='BENCH'` 행 수와 `started=false` 행 수를 각각 `RAISE NOTICE` 로 찍는다 — 사용자 승인에 "무엇을 몇 행" 이 필요하다. 로컬 2회 실행 출력을 PR 본문에.
  `V1GameResultParticipant` 는 대상이 아니다(위 표).
- [ ] `team-match-lineup.service.ts` 의 `BENCH_MARKER` 쓰기 경로·`isStarterPosition`·`TEAM_MATCH_BENCH_POSITION` 삭제. `TEAM_MATCH_GOALKEEPER_POSITION('GK')` 은 유지 — GK 판정은 `position` 만 본다(`games.service.ts:6433,6877`).
- [ ] `league-result-participants.ts:69` 의 값 복사본 삭제, `started` 컬럼을 읽는다. **이 파일은 작업 범위다.**
- [ ] `TeamLineupHistoryService.list()` 의 소스별 분기 제거 — 선발/후보 구분 없이 하나로.
- [ ] 결과 리비전 쓰기 `games.service.ts:3687,4090,6425` + 리그 결과 조립 4곳: `started: true` 고정. `game-result.dto.ts:131` 의 `started` 는 받되 무시(deprecated optional).
- [ ] 팀매치 참가자 생성(`:160-185`)·정정요청 복사(`:395-420`)에 `started: true` 명시 — 기본값 의존을 없앤다. 복사 경로가 `started` 를 싣지 않던 결함은 스펙으로 박는다.
- [ ] 라인업 DTO 의 `starters`/`bench` 두 배열을 `participants` 하나로. 옛 두 필드는 deprecated optional 로 받아 합친다(FE 가 따라올 때까지).
- [ ] 마이그레이션이 `schema.prisma` 주석을 건드리면 SOURCE_SNAPSHOT_DRIFT 게이트 — 해시 재핀 + 근거 주석.

### FE (BE 머지·alpha 배포 뒤, 한 PR)
- [ ] `lineup-client.tsx`: 선발/후보 토글 제거, `started` 미전송, 피치 탭 줄 제거, 팀장 전용 링크 한 줄(`/teams/:id/tactics/:gameId`). `PitchFormationEditor` 의 라인업 쪽 소비처 제거 후 dead 여부 전수 grep(전술보드가 쓰면 살아 있다).
- [ ] `result-edit-modal.tsx:822-823` 선발 체크박스 제거.
- [ ] 화면 변경이므로 📱390/📲768/🖥1440 갤러리 — 로컬 next 금지 규칙 때문에 **머지 후 alpha 에서 찍어 그 PR 에 사후 게시**.

## User Scenarios

1. **팀장 — 명단 제출**: 등번호·이름으로 출석 명단만 제출. 선발/후보 토글이 없다. 제출 = 끝.
2. **팀장 — 전술**: 상단 링크로 전술보드에 가서 팀 내부용 배치를 그린다. 대회 쪽은 이것을 읽지 않는다.
3. **운영자 — kickoff**: 명단 전원이 출전자로 시작한다. 교체는 종목 설정에 따라(Task 166).
4. **옛 클라이언트**: `started: false` 를 보내도 200, 저장값은 true.
5. **상대팀 정정 요청**: 원본 리비전을 복사한 초안에서도 전원 `started=true` — 복사가 값을 싣는다.
6. **운영자 — 결과 정정**: 선발 체크박스가 없다. 출전자 전원이 기록에 남는다.

## Test Scenarios

- **happy**: 라인업 저장(`started` 있음/없음/false) → 저장된 참가자 전원 `started=true`. 팀매치·대회 둘 다.
- **happy**: 정정요청 복사 → 새 초안 참가자 전원 `started=true`(변이: 복사 데이터에서 `started` 제거 → 기본값 의존 단언이 red).
- **happy**: 결과 리비전 쓰기 3경로 → `V1GameResultParticipant.started=true`(변이: 셋 중 하나라도 DTO 값을 다시 실으면 red).
- **edge**: 마이그레이션 2회 실행 — 1회차 N행(NOTICE 두 줄), 2회차 0행.
- **edge**: 마이그레이션 전후 결과 프로젝션의 `goalkeeper` 가 안 바뀐다(position 만 본다는 계약).
- **edge**: `league-result-participants` 가 BENCH 없이도 명단 전원을 출전자로 조립한다.
- **mock updates**: `games.service.spec.ts` 라인업 저장 스펙의 `started` 단언 → 전원 true 로. `team-match-lineup.service` 스펙의 `BENCH` 단언 제거. `TeamLineupHistoryService` 스펙 분기 제거. 프론트 fixture 의 `started` 8곳 갱신.
- **마이그레이션 replay**: 빈 DB 재생 + drift 0(CI 게이트).

## Parallel Work Breakdown

```
Backend  ⟂  Frontend
  BE-1 검증 제거 + DTO optional                                   ✅ 커밋 1a9c79f0d
  BE-2 (폐기 — kickoff 전술보드 해석. 코드 되감음, 흔적 0)
  BE-3 마이그레이션(넓은 범위) + 센티널·분기 제거 + started 고정 쓰기   ← 한 PR, 머지 전 사용자 승인
  FE   선발 토글·피치 탭 제거 + 전술보드 링크 + 결과 정정 체크박스 제거   ← BE 배포 뒤
```

## Acceptance Criteria

- [ ] `git grep -n "'BENCH'" -- apps/v1_api/src apps/v1_web/src | wc -l` → `0`(주석 제외). 센티널 **이름**이 아니라 **값**을 센다 — `league-result-participants.ts` 가 값을 복사해 갖고 있어 이름만 세면 놓친다.
- [ ] 저장 경로에 `started` 를 보내도/안 보내도/false 로 보내도 200, 저장값 true(통합 스펙).
- [ ] 마이그레이션 idempotent + NOTICE 두 줄 출력이 PR 본문에.
- [ ] alpha 에서 `GET /tournaments/:id/matches/:fixtureId` 의 참가자 `started` 가 전원 true(공개 API 가 ground truth).
- [ ] FE PR 에 갤러리(머지 후 alpha 캡처) + "3안 중 A안 사용자 확정" 기록.

## Tech Debt Resolved

- `BENCH` 센티널(Task 14 후속 요청으로 남아 있던 것) 제거 — 후보 표현 두 벌 → 없음.
- 저장 검증이 두 서비스에 복제돼 있던 것 제거.
- 복사·생성 경로의 기본값 의존 제거(`started` 명시).
- kickoff-전술보드 결합(첫 판 설계) — 만들지 않았고 되감았다.

## Security Notes

- 명단 제출에서 `started` 를 무시하므로 클라이언트가 선발을 조작할 경로가 사라진다.
- 마이그레이션은 alpha 데이터 변경 — 머지 전 사용자 직접 승인(저장소 내 같은 규칙: `apps/v1_api/test/config/alpha-probe-readonly.contract.spec.ts:4-21`). 실행하는 세션(머지하는 마스터)이 직접 받는다.

## Risks & Dependencies

- ⚠️ **통합 스펙은 tsc 범위 밖이다** — `tsconfig include` 가 `src·prisma·test/fixtures·test/helpers` 뿐이라 `test/**/*.integration-spec.ts` 의 타입 오류를 로컬 `tsc --noEmit` 이 못 잡는다. CI 의 ts-jest 가 게이트다. 로컬 DB 에서 실제로 돌려 red→green 을 본다(피어가 로컬 컨테이너 `teameet_v1_pg_task163` 로 수행 중).
- ⚠️ `test/team-matches/team-match-lineup.integration-spec.ts` 는 `testPathIgnorePatterns` 에 있어 안 돈다. "스펙 파일이 있다" 와 "스펙이 돈다" 는 다르다.
- alpha 의 `started=false` 대회 라인업 행 + `BENCH` 팀매치 행 — 둘 다 마이그레이션이 만진다. 행 수는 NOTICE 로 확인해 승인 요청에 붙인다.
- FE 가 BE 보다 먼저 배포되면 `participants` 단일 배열을 서버가 모른다 — **순서 강제**(BE 먼저).

## Ambiguity Log

| # | 질문 | 결정 | 근거 |
|---|---|---|---|
| 1 | 전술보드 없으면? | 질문이 사라짐 — 명단 전원 출전자 | 정본 §3 (사용자 확정 2026-09-02) |
| 2 | 보드 선발이 규칙 위반이면? | 질문이 사라짐 — 보드는 대회와 무관 | 정본 §3 |
| 3 | 마이그레이션 범위 | **`started=false` 행까지 넓게** — BENCH 만 고치면 대회 라인업 후보가 false 로 남아 공식 기록이 저장 경로에 따라 갈린다 | 피어 발견·마스터 실측 승인 2026-09-02 |
| 4 | `V1GameResultParticipant` 기존 행 | **건드리지 않는다** — 공식 기록 이력, 값은 화면에서 사라짐 | 마스터 결정 2026-09-02 |
| 5 | 피치 탭 제거 후 라인업 화면 | **A안** — 탭 줄 제거, 명단만, 팀장 전용 전술보드 링크 한 줄 | 사용자 확정 2026-09-02 (3안 중 A) |
| 6 | `starters`/`bench` DTO | `participants` 하나로, 옛 필드는 deprecated optional | 정본이 선후발을 없앴으므로 "FE-1 뒤에" 라는 순서 제약 소멸 |
