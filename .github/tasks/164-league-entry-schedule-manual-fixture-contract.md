# Task 164 — 리그·대회 통합 Phase 2·3: 참가 신청 · 임의 일정 · 수동 대진 · contract

> **선행 문서**: [Task 152](./152-v1-league-flow-and-entrypoints.md) · [Task 153](./153-league-tier-promotion-relegation.md) ·
> [Task 163](./163-lineup-roster-tactics-split.md) · `docs/design/league-competition-phase2-decisions.md` (D1~D13).
> 이 문서는 2026-08-29 사용자 원지시("매치·대회·리그 통합 재설계")의 **미완 부분**을 마감한다.
> 새 결정을 내리는 문서가 아니다 — 이미 확정된 D1·D6·D7·D8·D9·D10 을 코드로 옮기는 순서와 계약을 적는다.

## Context

### 원지시 (2026-08-29, 사용자 원문 요지)

- 대회 하위에 **정규 리그 · 정규 대회**가 있고, 둘 다 기존 대회 포맷으로 생성되고 결과가 나온다.
- **모든 경기는 팀 대 팀 매치**다. 대회를 통하지 않으면 친선경기, 통하면 공식경기.
- 매치 결과는 **팀과 개인 양쪽에 종속**된다.
- 기존 리그 페이지·관리 포인트는 **대회 안으로 편입돼 하나로 합쳐진다.**
- 명단 등록 → 라인업. 선발/후보/포지션은 팀 내부(전술보드)에서만.

2026-09-02 사용자 추가 지시(같은 방향의 구체화):

1. 리그 대진 일정을 **주 1회 요일**이 아니라 **임의의 날짜(캘린더)** 로 지정할 수 있어야 한다.
2. 리그도 **대회처럼 참가팀 신청**을 받아야 한다.
3. 대진 팀을 **수동으로도** 넣을 수 있어야 한다 — 지금은 자동 생성뿐이다.
4. "대회 안의 리그(`format='league'`)"와 "그냥 리그(`kind='regular_league'`)"는 **같은 것이고 합쳐져야** 한다.
   → 사용자 선택: **A. 한 번에 흡수** (2026-09-02).

### 지금 상태 — 실측 (origin/dev `afeb35565`)

D8 순서 `expand → dual-write → backfill → read-swap → contract` 중 **read-swap 까지 끝났고 contract 가 남았다.**

| 단계 | 상태 | 근거 |
|---|---|---|
| expand | 완료 | #872 `V1Tournament.regionId` + 리그 표시 필드 |
| dual-write | 완료 | #874 리그 쓰기 9곳 + 거울 수 불변식 |
| backfill | **alpha 실행 완료** (시즌 88 · 참가팀 211, 2026-08-31) | #870 CLI, 메인 세션 승인 기록 |
| read-swap | 완료 | #898 `/tournaments/:id` 에서 리그 시즌 열림 · #943 리그 목록 → 통합 목록 |
| contract | **미착수** | `v1League.find*` 가 아직 12 파일에 남음 (`league-series-admin` 5 · `league-match-admin` 4 · `league-match-public` 3 …) |

사용자 요구 ①②③ 과 코드의 대조:

| 요구 | 정규 리그 (`V1League` 쓰기 경로) | 리그 방식 대회 (`format='league'`) |
|---|---|---|
| ① 임의 날짜 | ❌ `LeagueFixtureScheduleDto { dayOfWeek: 0~6, time }` 하나 — 주 1회 | ✅ `V1TournamentFixture.scheduledAt` 자유 + `PATCH admin/fixtures/:id` |
| ② 참가 신청 | ❌ 어드민 `POST :leagueId/teams` 만. 신청 API 0건 | ✅ `POST /tournaments/:id/registrations` → submit → 운영자 confirm → roster-lock |
| ③ 수동 대진 | ❌ generate / preview / regenerate / 단건 PATCH / cancel 뿐 | ✅ `POST admin/tournaments/:id/fixtures` 단건 생성 |
| 신청 게이트 | 거울 행 `status` 가 `'open'` 이 아니면 `TOURNAMENT_NOT_OPEN` (`tournament-registrations.service.ts:114`) | — |

**뿌리는 하나다.** 리그의 쓰기 경로가 아직 `V1League` 전용 서비스(`league-matches/*`)에 있고, 그 서비스가
대회 쪽에 이미 있는 기능(신청·임의 일정·단건 대진)을 **자기 방식으로 다시 갖고 있지 않기 때문**이다.
①②③ 을 `V1League` 쪽에 새로 만드는 것은 곧 죽을 테이블에 기능을 얹는 일이다.
그래서 이 태스크는 ①②③ 을 **통합된 쪽(대회 등록 · 팀 매치)** 에서 풀고, 마지막에 contract 로 `V1League` 를 지운다.

### 대진 표현 — 어느 쪽으로 수렴하나 (D1 "대진 표현도 하나로")

- 리그 대진 = `V1TeamMatch(leagueId)` → `V1Game`. 대회 대진 = `V1TournamentFixture` → `V1Game`.
- read-swap 은 **대회 읽기 서비스가 팀 매치를 읽는 방향**으로 이미 갔다
  (`tournaments-read.service.ts:202,365` 가 `v1TeamMatch.findMany`).
- 원지시 "모든 경기는 팀 대 팀 매치" 와 2026-08-18 "리그는 매치 기반" 에 따라 **수렴 목표는 `V1TeamMatch`** 다.
- **대회(`V1TournamentFixture`) 를 팀 매치로 옮기는 것은 이 태스크 범위 밖(Phase 3)** 이다. 이 태스크는 리그 쪽이
  팀 매치를 계속 쓰게 하고, 새로 만드는 ①③ 도 팀 매치로 만든다 — 방향에 역행하는 코드를 만들지 않는다.

## Goal

정규 리그가 **대회와 같은 입구(신청) · 같은 자유도(임의 일정 · 수동 대진)** 를 갖고,
`V1League` / `V1LeagueTeam` 이 코드와 스키마에서 사라진다. 리그 전용 서비스는 남되 **`V1Tournament(kind='regular_league')`
와 `V1TournamentRegistration` 만 읽고 쓴다.**

## Original Conditions

- [ ] ① 리그 대진 생성이 **날짜 목록**을 받는다. 요일 하나로도 만들 수 있지만 그것은 날짜 목록의 편의 입력일 뿐이다.
- [ ] ② 팀장이 **정규 리그에 참가 신청**할 수 있다. 경로는 대회와 **같은 API·같은 화면**이다(D7). 승강 승계팀은 자동 등록된다(D7). 정원 초과는 운영자가 사유와 함께 직접 조정한다(D9). 명단 미제출 팀은 시즌 시작 시각에 현재 멤버 전원으로 자동 확정되고 `autoConfirmed` 표식이 남는다(D10).
- [ ] ③ 운영자가 **대진 한 건을 수동으로** 만든다(홈팀·원정팀·일시·장소). 자동 생성과 섞여도 순위·일정·결과 경로가 같다.
- [ ] ④ `V1League` · `V1LeagueTeam` 을 읽는 코드 0건 → 두 테이블 drop 마이그레이션(contract). alpha 실행은 **사용자 직접 승인**.
- [ ] 결과 흐름은 **정본 §4**(결과 보내기 → 어드민 확인 한 단계, 이의 없음 — Task 166)를 따른다. 이 태스크의 검증 항목은 수동 대진·신청 팀의 경기도 **같은 경로**를 탄다는 것이다.
- [ ] 화면을 새로 만들거나 바꾸는 항목(①의 날짜 선택 UI · ②의 신청 화면 공존 · ③의 수동 대진 폼)은 **코드 전에 A·B·C 3안 + 추천안을 마스터가 제시하고 사용자 선택**을 받는다.

## User Scenarios

1. **팀장 — 리그 참가 신청.** 통합 목록에서 정규 리그 카드(상태 "신청 접수 중")를 열고 대회와 같은 신청 버튼을 누른다. 명단 제출은 Task 163 이후의 출석 명단 그대로. 운영자 확정 알림을 받는다.
2. **승강 승계팀 팀장.** 다음 시즌이 생성되면 신청 없이 "자동 등록됨" 상태로 보인다. 신청 버튼은 없다.
3. **운영자 — 신청 관리.** 어드민 리그 상세의 참가팀 탭에서 신청 목록을 보고 확정·거부한다. 거부·티어 이동에는 사유가 필수다. 정원 초과여도 시스템은 아무것도 자동으로 하지 않는다.
4. **운영자 — 일정.** 대진 생성 모달에서 캘린더로 날짜를 여러 개 고른다(예: 9/6·9/13·9/27·10/4). 라운드 수보다 날짜가 적으면 생성이 거부되고 부족한 수를 알려준다.
5. **운영자 — 수동 대진.** "대진 추가" 로 홈·원정·일시·장소를 넣는다. 생성된 경기는 자동 생성 경기와 같은 카드·같은 결과 입력·같은 순위 반영이다.
6. **운영자 — 시즌 시작.** 시작 시각이 지나면 명단 미제출 팀의 명단이 멤버 전원으로 자동 확정되고, 그 팀 팀장에게 통보가 간다. 어드민 화면에 "자동 확정" 배지가 보인다.

## Test Scenarios

### Happy
- 신청 → 제출 → 운영자 confirm 시 `V1TournamentRegistration.status='confirmed'` 가 되고, contract 전까지는 `V1LeagueTeam` 도 같은 트랜잭션에서 생성된다(dual-write 역방향). 거울 수 불변식 통과.
- 날짜 3개 + 4팀(3라운드) 생성 → 라운드 r 의 모든 경기 `startAt` 이 r 번째 날짜. 순서는 입력 순이 아니라 **날짜 오름차순**.
- 수동 대진 1건 + 자동 대진 N건 → `/tournaments/:id/schedule` 과 순위표에 N+1 경기, 결과 입력 후 승점 반영.
- 시즌 시작 시각 경과 → 미제출 팀 명단이 멤버 전원으로 생성, `autoConfirmed=true`, 알림 1건.

### Edge
- 날짜 수 < **매치데이 수** → **422** `LEAGUE_SCHEDULE_SLOTS_INSUFFICIENT { required, provided }`. 생성 없음.
  - 두 군데를 실제와 맞춘 것이다: 상태코드는 400 이 아니라 **422**(`UnprocessableEntityException` —
    같은 파일의 다른 일정 검증도 전부 422 다), 비교 대상은 라운드 수가 아니라
    **`ceil(라운드 수 / timing.gamesPerTeamPerDay)`**. 팀당 하루 두 경기면 라운드 6 이 날짜 3 개다.
- 같은 날짜 중복 입력 → 중복 제거 후 계산(에러 아님). 과거 날짜 → **422** `LEAGUE_SCHEDULE_DATE_PAST`.
- **달력에 없는 날짜**(`2026-02-31` 등) → **422** `LEAGUE_SCHEDULE_DATE_INVALID`. DTO 정규식은
  통과시키고 `Date.UTC` 는 거부 대신 **다음 달로 굴린다**(실측 `2026-02-31 19:00 KST` → `2026-03-03`) —
  운영자가 없는 날을 골랐다는 말을 못 듣고 사흘 뒤 경기가 조용히 생긴다.
- 수동 대진에 같은 팀 두 번 → **422 `LEAGUE_TEAM_INVALID`**. 이 리그에 등록되지 않은 팀 →
  **같은 422 `LEAGUE_TEAM_INVALID`**.
  ⚠️ 문서가 적고 있던 `LEAGUE_FIXTURE_SAME_TEAM` 은 **존재하지 않는 코드**였다(실측 grep 0건).
  구분 코드를 새로 만들지 않는다 — 소비처가 없고, 화면은 메시지로 두 경우를 이미 가른다.
- 자동 등록(승계) 팀이 신청 API 를 부르면 409 `REGISTRATION_ALREADY_EXISTS` — 새 상태를 만들지 않는다.
- **리그에는 정원 개념이 없다** — 거울의 `teamCount`(기본값 8)를 정원으로 쓰지 않는다(Ambiguity 4).
  9번째·10번째 팀의 신청·제출·어드민 확정이 전부 통과해야 한다. 대회는 8팀에서 409
  `TOURNAMENT_CAPACITY_FULL` 그대로(회귀 대조군).

### Error
- 거부·티어 이동에 `reason` 없음 → 400. 기존 `admin/registrations/:id/cancel` 의 DTO 에 `reason` 필수화가 대회에도 적용되는지 — **대회는 선택 유지**, 리그 거울에만 필수(`kind` 로 분기). Ambiguity Log 1.
- contract 마이그레이션 실행 시 `V1League` 를 읽는 코드가 1건이라도 남아 있으면 CI 게이트가 막는다(아래 AC).

### Mock updates
- `V1LeagueTeam` 을 만드는 픽스처(`test/fixtures/*league*`)는 contract PR 에서 `V1TournamentRegistration(confirmed)` 생성으로 교체. 시드(`seed-alpha-league-qa.ts`)도 같은 PR.

## Parallel Work Breakdown

> 한 태스크 = PR 한 개. 순서는 의존 관계다. Task 163 BE-3 이 먼저 끝나야 한다(명단 모델을 공유).

### BE (순차)

- **BE-1 ③ 수동 대진.** `league-match-admin.service.ts:1156` 부근 생성 루프에서 한 경기 생성을 순수 함수 `createLeagueFixture(tx, league, home, away, startAt, round, placeName)` 로 뽑고, 자동 생성과 `POST /admin/league-matches/:leagueId/fixtures/manual` 이 **같은 함수**를 부른다. 자동 생성 경로의 스냅샷 테스트로 추출 전후 동일성을 증명한다.
- **BE-2 ① 날짜 목록.** `LeagueFixtureScheduleDto` 를 `{ dates: 'YYYY-MM-DD'[], time: 'HH:mm' }` 로
  바꾸고, 요일 입력은 **프론트에서 날짜 목록으로 전개**해 보낸다(서버는 요일을 모른다).
  preview·regenerate 도 같은 DTO.

  ⚠️ **"dayOfWeek 삭제" 가 아니라 "정규 리그 경로에서 제거" 다.** 착수 시 실측하니 요일
  템플릿을 쓰는 **살아 있는 경로가 둘**이었다:

  | 레인 | 엔드포인트 | 이번 범위 |
  |---|---|---|
  | ① 정규 리그 | `POST /admin/league-matches/:id/fixtures` | ✅ 날짜 목록으로 |
  | ② 리그 방식 대회 | `POST /admin/tournaments/:id/league/fixtures/generate` | ❌ 그대로 |

  둘이 `resolveFixtureStartAt` 을 공유한다. ②는 정본 §1 이 별도 kind 로 둔 레인이고 경기별
  `scheduledAt` 편집이 이미 있어 사용자 요구 ①이 막혀 있지 않다 — 지금 함께 바꾸면 Phase 3
  흡수 때 두 번 손댄다. `resolveFixtureStartAt` docblock 에 "정규 리그는 더 이상 안 쓴다" 를
  남긴다.

  **AC 의 식별자 0건 검사는 성립하지 않는다 — 정직하게 좁힌다.** `resolveFixtureStartAt` 이
  `league-matches/round-robin-schedule.ts` 에 살고 레인 ②가 그걸 import 하므로, 그 디렉터리
  전체에서 `dayOfWeek` 를 0으로 만들 수 없다. 실제 게이트:

  ```
  league-matches/dto/·league-match-admin.service.ts 에서 dayOfWeek 를 읽는 코드   0건
  남는 곳: round-robin-schedule.ts(+spec) — 레인 ② 전용, Phase 3 흡수 대상
  ```

  ⚠️ **필요한 날짜 수는 라운드 수가 아니라 매치데이 수다.** `timing` 이 팀당 하루 G경기를
  넣으면 라운드 G개가 하루에 들어간다 — 6라운드·G=3 이면 날짜 2개면 된다. 라운드 수로
  요구하면 멀쩡한 입력을 거부한다.
- **BE-3 ② 신청(D7).** 리그 거울 행에 `status='open'` + `registrationDeadlineAt` 을 놓는 운영자 액션 `POST /admin/league-matches/:leagueId/open-registration`. 신청·제출·확정은 **대회 서비스 그대로**(추가 코드 0 이 목표). confirm 훅에서 contract 전까지 `V1LeagueTeam` 역방향 dual-write. 승계팀 자동 등록은 `league-series-admin.service.ts` 의 다음 시즌 생성에서 `confirmed` 등록을 함께 만든다.
- **BE-4 ② 사유(D9) + 자동 확정(D10).** `reason` 필수(리그 거울만).
  - **"정원 초과 경고" 는 뺀다** — 기댈 정원 값이 없다(Ambiguity 4). D9 에서 살리는 것은
    "자동 규칙 없음 + 거부·티어 이동 사유 필수" 다.
  - **D10 크론은 대진 생성보다 먼저 돌아야 한다.** `generateFixtures`·`regenerateFixtures` 가
    거울 status 를 `in_progress` 로 옮기면 신청이 닫히므로, 그 뒤에 자동 확정이 돌면
    확정할 대상이 이미 없다.
  - **참가비 0원이면 입금 단계를 건너뛴다** (BE-3 에서 발견, 정본 §4 "스텝 최소"). 지금은
    `submit` 이 `entryFee` 와 무관하게 `awaiting_payment` 로 보내고 `ADMIN_CONFIRMABLE_STATUSES`
    에 그 상태가 없어서, **0원짜리 리그에도 운영자가 "입금 확인" 을 한 번 눌러야** 확정할 수
    있다. 무료 대회도 오늘 똑같으므로 대회·리그 한 흐름으로 함께 고친다.
    스펙: 유료는 그대로 `awaiting_payment`(회귀 대조군), 0원은 곧바로 확정 가능. 시즌 시작 시각 크론(`DISABLE_LEAGUE_ROSTER_AUTOCONFIRM_CRON=true` 로 끔 — 기존 cron 선례) 이 미제출 팀 명단을 멤버 전원으로 생성하고 `autoConfirmed` 를 남긴다. 사전 리마인더(시작 24h 전) 알림 1종 + 확정 통보 1종.
- **BE-5 ④ contract.** `v1League.*` / `v1LeagueTeam.*` 호출 12 파일 → `V1Tournament(kind='regular_league')` / `V1TournamentRegistration` 으로 재배선. 역방향 dual-write 제거. **`git grep -n -w -e v1League -e v1LeagueTeam -- apps/v1_api/src apps/v1_web/src | wc -l` → `0`** 이 된 뒤에만 drop 마이그레이션 PR 을 따로 연다. drop 은 idempotent(`DROP TABLE IF EXISTS`), alpha 실행 전 사용자 직접 승인.

### FE (BE 배포 뒤)

- **FE-1** 대진 생성 모달: 캘린더 다중 선택(3안 → 선택 후 구현). 요일 편의 입력은 선택된 기간 안의 해당 요일을 날짜로 전개해 목록에 넣는다.
- **FE-2** 수동 대진 폼(3안 → 선택 후 구현). 어드민 대진 표의 `result` 열·`status` 열 계약(D6 결정) 유지.
- **FE-3** 신청 화면 공존(D7 의 "3안이 갈릴 축": 자동 등록 팀과 신청 팀이 한 화면에) — 3안 → 선택 후 구현. 통합 목록 카드에 "신청 접수 중" 상태 칩(기존 대회 칩 재사용).
- **FE-4** 어드민 참가팀 탭: 신청 목록·사유 입력·`autoConfirmed` 배지.

### Infra / QA

- contract 전용 CI 게이트: `scripts/qa/check-league-model-contract.mjs` — `v1League`/`v1LeagueTeam` 식별자 수를 세고(주석 제외 — 이 저장소 주석이 식별자를 그대로 인용해 3배 부푼 전례가 있다), 마이그레이션 디렉터리에 drop 파일이 있으면 그 수가 0 이어야 통과.
- alpha 검증 하네스: 신청 → 확정 → 수동 대진 → 결과 입력 → 순위 반영을 **공개 API 로 판정**(`scripts/verify-alpha-league-*.mjs` 계열, 403/429 는 ⚠️ 로 분리).

## Acceptance Criteria

- [ ] `POST /tournaments/:leagueId/registrations` 가 정규 리그 거울에서 201 을 준다(`status='open'` 일 때). 대회 코드 변경 없이.
- [ ] 자동 생성이 날짜 목록을 받고, 라운드 수 초과 시 400 + 부족 수. `dayOfWeek` 식별자가 `apps/` 아래 0건.
- [ ] `POST /admin/league-matches/:leagueId/fixtures/manual` → 생성 경기가 `/tournaments/:id/schedule` 공개 API 에 나타나고, 결과 입력 후 `standings` 에 반영된다(alpha 실측).
- [ ] 거부·티어 이동 `reason` 없이 400(리그 거울만). 대회는 기존 계약 유지 테스트.
- [ ] 시즌 시작 크론이 미제출 팀에만 명단을 만들고 `autoConfirmed=true`; 제출 팀은 건드리지 않는다(변이: 조건 제거 시 red).
- [ ] `git grep -n -w -e v1League -e v1LeagueTeam -- apps/v1_api/src apps/v1_web/src | wc -l` → `0`, 그 뒤 drop 마이그레이션. 마이그레이션 replay + drift 게이트 green.
- [ ] Task 163 과의 접점: 자동 확정 명단은 **출석 명단**(선발 정보 없음)이며, 전술보드가 없으면 킥오프 시 전원 선발(163 의 fallback 계약) — 통합 스펙 1건.
- [ ] UI 항목(FE-1~3)은 각각 "3안 제시 → 사용자 선택" 기록이 PR 본문에 있다.

## Tech Debt Resolved

- 같은 기능 두 벌(리그 전용 참가·일정·대진)이 생기기 전에 막는다 — ①②③ 을 통합 쪽에서만 구현.
- `V1League` · `V1LeagueTeam` 과 역방향 dual-write 코드 삭제 = D8 의 마지막 단계.
- 12 파일의 `v1League.find*` 잔존 읽기 제거.
- Task 152 D-2("참가팀은 운영자 지정") 는 **D7 로 대체**된다 — 152 문서에 각주를 단다.

## Security Notes

- 신청·확정 권한은 대회와 동일(`JwtAuthGuard` + 팀장 검증 + 어드민 `AdminGuard`). 리그 거울이라고 완화하지 않는다.
- `open-registration` 은 어드민 전용. 거울 `status` 를 팀장이 바꿀 경로가 생기면 안 된다.
- 수동 대진 DTO 의 팀 id 는 **해당 리그의 confirmed 등록**에 속하는지 서버에서 검증(클라이언트 목록을 믿지 않는다).
- drop 마이그레이션은 되돌릴 수 없다 — 실행 전 백업(`prod-daily-backup` 은 엉뚱한 DB 를 덤프하므로 쓸 수 없다: 별도 `pg_dump` 를 alpha 에서 먼저 뜬다).

## Risks & Dependencies

- **Task 163 선행.** 명단 모델(출석만·전술보드 분리)이 먼저 자리 잡아야 D10 자동 확정이 "출석 명단"을 만든다.
- **alpha 리그 88시즌은 실 데이터 사본.** contract drop 은 사용자 직접 승인 + 사전 pg_dump. 신청 open 도 실 팀장에게 알림이 나가므로 alpha 에서는 `(테스트)` 리그로만 연다.
- **대회 → 팀 매치 수렴(Phase 3)** 은 이 태스크 밖. 여기서 대회 fixture 를 건드리지 않는다.
- `format='league'` 인 대회 7건(2026-08-23 기준)은 **이미 대회**라 이 태스크로 바뀌지 않는다. 사용자의 ④ 는 "정규 리그를 대회로 흡수"로 충족되고, 명칭은 "정규 리그 / 리그 방식 대회"(2026-08-23 확정) 유지.

## Ambiguity Log

1. **거부 사유 필수를 대회에도 확장할지.** 원지시 D9 는 리그만 말한다 → 리그 거울만 필수, 대회는 선택 유지. (결정: 마스터, 2026-09-02)
2. **요일 입력을 서버가 아는지.** 서버는 날짜 목록만 안다. 요일→날짜 전개는 프론트. 이유: 서버에 두 입력 형태를 두면 생성 규칙이 둘이 된다. (결정: 마스터)
3. **수동 대진의 라운드 번호.** **받지 않는다.** `round` 는 저장되지 않는 값이다(`V1TeamMatch` 에 컬럼 없음, `league-standings.ts` 참조 0건 — 2026-09-02 피어·마스터 실측). 생성 시점에 제목(`N주차`)과 `startAt` 계산에만 쓰이는데 수동 대진은 일시를 직접 받으므로 필요 없다. 대신 `title` 을 선택 입력으로 두고, 없으면 자동 생성과 같은 규칙으로 짓는다. 화면의 "주차" 라벨은 `startAt` 순서에서 파생된다(`league-fixture-videos.service.ts:80`).
4. **정원(capacity) 필드 — 해소됨 (2026-09-03 BE-3 실측).** `maxTeams`·`capacity` 라는 **이름은
   없지만 역할은 `V1Tournament.teamCount` 가 이미 하고 있었다.** 등록 스택 다섯 자리가
   `reservedCount >= teamCount` 로 409 `TOURNAMENT_CAPACITY_FULL` 을 던진다
   (`tournament-registrations.service.ts` 의 `assertCapacityAvailable` 호출 2곳 + 인라인 2곳,
   `admin-registrations.service.ts` 인라인 2곳).
   - 리그 거울은 `leagueMirrorCreateData` 가 `teamCount` 를 안 넣어 **스키마 기본값 8** 이 박힌다 —
     운영자가 정한 값이 아니다(alpha 실측: 거울 89개 전부 `team_count=8`, 8팀 초과 1개·최대 10팀).
     그대로 재사용하면 9번째 팀부터 신청이 막히고 이미 8팀을 넘긴 리그는 **어드민 확정까지** 막힌다.
   - **BE-3 결정: 리그에서는 정원을 끈다.** `registration-capacity.ts` 의 `capacityLimitOf` 가
     `regular_league` 면 `null` 을 돌려주고 다섯 자리가 전부 그 함수를 지난다. 분기를 다섯 번
     복사하면 빠뜨린 한 경로만 조용히 409 가 되기 때문이다.
   - **진짜 리그 정원은 별도 태스크**다 — 전용 컬럼(expand) + 어드민 입력 + 화면이 한 덩어리이고,
     화면이 붙으므로 A·B·C 3안 대상이다. 그때 `capacityLimitOf` 가 그 컬럼을 읽는 자리가 된다
     (지금 `null` 을 주는 자리에 값이 생기는 것뿐이라 호출부 다섯 곳은 그대로 남는다).
5. **대회 fixture 의 팀 매치 수렴 시점.** 방향은 확정(원지시), 시점은 미정 → Phase 3 문서로 분리.
