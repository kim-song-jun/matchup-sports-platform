# Task 165 — 경기 운영 콘솔에 리그 편입 · 대시보드 인라인 정정 · 대회별 전후반 설정

> **선행 문서**: [Task 164](./164-league-entry-schedule-manual-fixture-contract.md) (같은 원지시의 마감), `docs/design/league-competition-phase2-decisions.md` D6.
> 2026-09-02 사용자 지시 3건을 실측과 대조해 적는다. 결과 확정 계약은 **정본 `docs/design/competition-canonical-flow.md` §4**(확인 한 단계)를 따른다 — 이 태스크는 입구를 옮기고 화면을 더한다. "결과 검토" 는 그 확인 단계를 가리킨다.

## Context

### 사용자 지시 (2026-09-02, 요지)

- (a) 리그 각 경기의 **점수·골 입력을 경기 운영(대회 운영) 안으로** 넣는다.
- (b) 경기 운영의 **결과 검토 · 결과 정정**을 대시보드에서 **바로 수정**할 수 있게 한다.
- (c) **대회 자체에서 전후반을 선택**할 수 있게 한다(있을 수도, 없을 수도).

### 실측 (origin/dev `afeb35565`)

| 항목 | 지금 | 뿌리 |
|---|---|---|
| (a) 리그 결과 입력 | `components/admin/league-result-entry-modal.tsx` — 어드민 리그 대진 표(`admin/league-matches/[leagueId]`)에서만 열린다 | 경기 운영 모듈 `apps/v1_api/src/tournament-operations/` 는 `V1TournamentFixture` 를 4 파일에서 쓰고 `V1TeamMatch` 는 0, `regular_league` 언급 0. 결과 검토 서비스는 게임을 **`game.tournamentFixtureId`** 로 되찾는다(`results/tournament-result-review.service.ts:540,855`). 리그 게임은 팀 매치 기반이라 이 값이 `null` → 콘솔이 리그 경기를 **볼 수 없다** |
| (b) 결과 검토·정정 | `/admin/live/[id]/result-review` · `/admin/live/[id]/records/corrections` 두 화면. 서버 API 는 게임 단위 `POST /games/:gameId/result-revisions/:revisionId/{review-decision,officialize,void}` + `POST /games/:gameId/corrections` | 화면이 검토 전용 페이지로 분리돼 있어 대시보드에서 값을 고치려면 두 번 이동한다. 서버 계약은 그대로 쓸 수 있다 |
| (c) 전후반 | 서버는 이미 대회 설정 `periods` 배열(`{ durationMinutes, extraTime }[]`, 레거시 `{ count }`)로 피리어드 수를 정한다(`competition-config.parse.ts:parsePeriodDurations`, `games.service.ts:computePeriodCount`). 게임 생성 시 `V1GamePeriod` 행을 그 수만큼 만든다(`games.service.ts:1086-1088`) | 어드민 대회 설정 화면(`admin/tournaments/[id]/info-section.tsx`)에 `periods` 입력이 **0줄**. 즉 설정은 API 로만 바꿀 수 있다 |

(a) 의 뿌리는 Task 164 가 적은 **대진 표현 두 벌**(대회=`V1TournamentFixture`, 리그=`V1TeamMatch`)이다. 원지시의 수렴 목표는 팀 매치(Phase 3)지만, 그때까지 리그 경기가 콘솔 밖에 있는 것은 D6("두 경로 병행, 한 계약")에 어긋난다.

## Goal

리그 경기가 대회 경기와 **같은 경기 운영 콘솔**(라이브 콘솔 · 결과 검토 · 정정)에서 다뤄지고, 운영자가 대시보드에서 결과를 **한 화면에서** 고칠 수 있으며, 대회 설정 화면에서 **피리어드 수·길이**를 정할 수 있다.

## Original Conditions

- [ ] (a) 리그 거울 id 로 `/admin/live/:id/…` 에 들어가면 리그 경기 목록·라이브 콘솔·결과 검토·정정이 **대회와 같은 화면**으로 동작한다. 리그 전용 결과 입력 모달은 삭제한다(같은 변경에서 — 죽은 코드를 남기지 않는다).
- [ ] (b) 대시보드(`/admin/live/:id` 개요)에서 결과 검토·정정을 **페이지 이동 없이** 수행한다. 화면은 A·B·C 3안 → 사용자 선택 뒤 구현.
- [ ] (c) 대회 설정 화면에서 피리어드 수(1 = 단일, 2 = 전후반, 그 이상 허용)와 각 길이를 입력한다. 화면은 3안 → 선택 뒤 구현. **이미 생성된 게임의 `V1GamePeriod` 는 바꾸지 않는다** — 설정 변경은 새 설정 버전을 만들고 이후 생성되는 게임에만 적용된다(대회 설정은 `content_hash` 로 버전이 갈린다).
- [ ] 결과 보장 계약(즉시 확정 + 이의 7일, 리비전·officialize·void)은 그대로. 새 입구도 같은 API 를 부른다.

## User Scenarios

1. **운영자 — 리그 경기 결과.** 어드민 통합 목록에서 정규 리그를 열고 "경기 운영" 으로 들어간다. 대회와 같은 대진 목록이 보이고, 경기를 눌러 라이브 콘솔로 점수·골을 넣거나(스태프 배정 시) 사후 입력한다(미배정 시). 순위표에 즉시 반영된다.
2. **운영자 — 정정.** 대시보드 경기 카드의 점수를 눌러 새 값과 사유를 넣고 저장한다. 정정 이력은 기존 리비전으로 남는다.
3. **운영자 — 대회 설정.** 대회 만들기/설정에서 "피리어드: 1 · 2 · 직접 입력" 을 고르고 길이를 넣는다. 저장하면 설정 버전이 하나 늘고 이후 생성되는 경기가 그 수의 피리어드로 만들어진다.

## Test Scenarios

### Happy
- 리그 게임(`tournamentFixtureId=null`, `teamMatchId` 있음)에 `POST /games/:gameId/corrections` → 200, 리비전 생성, 순위 재계산.
- 리그 거울 id 로 콘솔 대진 목록 → 팀 매치 기반 경기 N건(공개 `/tournaments/:id/schedule` 와 같은 수).
- `periods=[{60}]` 설정 대회의 새 경기 → `V1GamePeriod` 1행. `[{25},{25}]` → 2행.

### Edge
- 리그 게임의 결과 검토에서 fixture 전용 필드(조·라운드 번호)는 **없음으로 렌더**, 에러 아님.
- 설정 변경 전 생성된 경기는 피리어드 수가 그대로(변이: 기존 행 재생성 코드가 끼면 red).
- 인라인 정정 저장 실패(409 stale revision) → 화면이 최신 리비전을 다시 읽고 안내.

### Error
- 팀 매치도 fixture 도 없는 게임 → 404 `GAME_SOURCE_NOT_FOUND`(새 코드). 기존 `TOURNAMENT_FIXTURE_NOT_FOUND` 와 구분.
- 피리어드 수 0 또는 길이 ≤ 0 → 400.

### Mock updates
- `tournament-operations` 스펙의 게임 픽스처에 `teamMatchId` 기반 케이스 추가. 기존 fixture 기반 케이스는 그대로 통과해야 한다.

## Parallel Work Breakdown

### BE (순차)

- **BE-1 게임 출처 해석기.** `tournament-operations/resolve-game-source.ts` 의
  `resolveGameSource(tx, game)` 이 두 출처를 해석한다 — fixture 는 `fixture.tournamentId`,
  리그 팀매치는 `teamMatch.leagueId`(= 거울 id), 친선 팀매치(leagueId null)는 `null`
  (대회 운영 권한 체계 밖이라 콘솔이 열면 안 된다).

  **재배선 대상은 "4 파일" 이 아니다** — 착수 시 실측한 결과 `tournamentFixtureId` 를 읽는
  9개 파일이 **주어로 세 갈래**로 갈렸다:

  | 주어 | 파일 | 재배선 |
  |---|---|---|
  | `game.tournamentFixtureId` | `tournament-result-review.service.ts` · `games.service.ts` | 일부만 |
  | `revision.tournamentFixtureId` | 브래킷·순위 투영, 대진 완료 알림, 공개 기록 | ❌ 결과 리비전 자기 컬럼 |
  | 백필 스크립트 | `team-record-facts-backfill.ts` | ❌ |

  그리고 첫 갈래의 대부분도 **대회 전용이 맞다**: 등록 명단 검증(리그엔 등록이 없다) ·
  징계(이미 `sourceType` 으로 early-return) · 녹아웃 승부차기 · 브래킷 잠금(리그엔 브래킷이
  없다). 그 자리들을 해석기로 바꾸면 없는 개념을 억지로 만든다.

  **실제 경계는 하나였다**: `withResultCommand` 안의 출처 판별 한 줄. 다섯 개 공개 명령
  (reviewDecision · supersedeAndSubmit · officializeResultRevision · voidResultRevision ·
  createResultCorrection)이 전부 이 함수를 지난다.

  ⚠️ **권한 리소스에서 `fixtureId` 는 키 자체를 빼야 한다.** `undefined` 를 담으면 정책
  파서(`tournament-staff-policy.ts` 의 `parseOptionalStableId`)가 `hasOwn` 으로 "있다" 고
  보고 stable id 가 아니라며 리소스 전체를 무효로 만들어, **플랫폼 관리자까지
  `STAFF_SCOPE_DENIED`** 가 된다(실측).

  변이: 경계를 직접 읽기로 되돌리면 3 red · 친선 팀매치 가드를 빼면 1 red.
- **BE-2 콘솔 목록·권한.** 콘솔 대진 목록 API 가 `kind='regular_league'` 이면 팀 매치를 읽는다(`tournaments-read.service.ts:202` 가 이미 하는 방식 재사용 — 함수를 공유하고 복사하지 않는다). 스태프 권한 검사가 리그 거울에도 같은 규칙으로 걸리는지 통합 스펙 1건.
- **BE-3 리그 전용 결과 입력 경로 제거.**
  - **득점자는 합칠 게 없었다**(2026-09-03 실측). 콘솔의 `actualParticipants`(`GameResultParticipantDto`)가
    `goals`·`assists`·`fouls`·`minutesPlayed` 를 이미 받고, `goalEvents`(분·전후반·자책골)와
    `mvpParticipantId` 까지 있어 **리그보다 상위집합**이다.
  - **몰수만 진짜 갭이었다.** 콘솔은 `outcomeReason` 을 base 에서 **승계만** 했고 새로 정할 입력이
    없었다. `GameResultOutcomeDto { reason, note? }` 를 제출·정정에 더한다. **스코어는 건드리지
    않는다** — 리그 전용 경로의 `isForfeit` 도 표식만 세웠고, 1:0 강제는 몰수 *선언* 서비스
    (`league-match-forfeit.service.ts`)의 몫이며 그 서비스는 남는다.
  - **삭제는 둘로 나눈다.** `league-match-dispute.service.ts` 의 이의 수락이 `correctResult` 를
    부르는데, 정본이 **이의 자체를 Task 166 에서 제거**한다(§ "팀의 이의 제기 경로는 없다").
    166 이 통째로 지울 코드를 콘솔 정정으로 재배선하는 것은 버려질 작업이라 하지 않는다.
  - **AC 를 문자열 grep 으로 잡지 않는다.** `league-result-entry` 로 세면 **무관한
    `league-result-entry-reminder`**(경기 시작 +24h 리마인더, 2026-08-24 사용자 확정)까지 지워야
    한다 — 그 서비스는 이 엔드포인트를 소비하지 않고 자기 business key 문자열이 겹칠 뿐이다.

- **BE-4 라이브 콘솔.** 165 의 (a) 조건 중 마지막 — 목록(#985)·결과 검토(#982)·정정(BE-3)은
  됐고 **라이브 콘솔**이 남아 있었다. 보드가 리그 행을 보여주는데 그 행의 "운영" 링크
  (`/fixtures/:id/operate`)가 **빈 화면**이었다.
  - **막힌 곳은 한 자리였다** — `tournament-fixture-lineup.service.ts` 의
    `authorizeAndResolveGameId` 가 `V1TournamentFixture` 만 본다. 리그 경기의 id 는 팀매치
    id 라 그 행이 없어 404 로 끝났다. **인가 뒤에** 팀매치를 리그 스코프로 찾아 게임을
    되돌려준다(권한 판정이 존재 여부에 영향받지 않는 기존 불변식 유지).
  - **`resolveGameSource` 를 쓰지 않는다.** 그 함수는 *게임 → 출처* 방향이고 여기는 그
    반대인 *출처 → 게임* 이다 — 방향이 달라 재사용이 성립하지 않는다.
  - **FE 분기는 필요 없다(실측으로 접었다).** operate 콘솔은 라인업을 **읽기만** 한다
    (`operate/` 전체에 저장 훅 0건). 그 읽기는 `GamesService.listLineups(gameId)` 로 게임
    축이고, 팀매치 라인업도 **같은 `V1GameLineup` 테이블**에 저장된다 — 실제 DB 로
    "팀매치로 저장 → 콘솔 경로로 읽기" 가 같은 명단을 주는 것을 확인했다. 따라서
    `TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN`(라인업 **저장** 가드)에 닿지 않는다.
    **그 가드는 절대 열지 않는다** — 163 이 세운 로스터·자격·마감 불변식이 그 뒤에 있다.
  - **없음 렌더**: 필드·스태프 스코프·조·라운드는 리그에 없는 개념이라 `null`(#985 선례).

### 확정된 것 (재조사 불필요)

- **소켓·takeover 는 이미 팀매치를 지원한다.** `use-v1-game-operations-console.ts` 가
  `tournamentId: string | null` 이고 *"팀매치는 tournamentId/스태프 배정 개념이 없다"* 를
  명시한다. takeover 도 `gameId` 기반이라 대진 id 를 전제하지 않는다 — BE-4 범위 밖.
- **콘솔은 라인업을 저장하지 않는다.** 읽기 전용이라 라인업 편집 UI 를 리그용으로 만들
  필요가 없다.


### FE (BE 배포 뒤, 각 3안 선택 뒤)

- **FE-1** 어드민 리그 상세의 "결과 입력" 버튼 → 콘솔 딥링크. 리그 대진 표의 `result`/`status` 열(D6 결정) 유지.
- **FE-2** 대시보드 인라인 정정(3안: 카드 내 편집 / 슬라이드 패널 / 검토 페이지 요약 임베드 — 마스터가 제시).
- **FE-3** 대회 설정 피리어드 입력(3안: 프리셋 라디오 / 표 편집 / 종목 기본값+수정 — 마스터가 제시).

### Infra / QA

- alpha 하네스: 리그 거울 id 로 콘솔 진입 → 사후 입력 → 공개 `standings` 반영을 공개 API 로 판정(403/429 는 ⚠️).

## Acceptance Criteria

- [ ] `tournament-operations` 에서 `tournamentFixtureId` 직접 읽기 0건(주석 제외). 팀 매치 기반 게임의 review/officialize/void/corrections 통합 스펙 통과.
- [ ] 리그 거울 id 의 `/admin/live/:id/result-review` 가 alpha 에서 리그 경기를 목록에 보인다(실측 스크린샷 3폭 + 공개 API 대조).
- [ ] **이번 PR**: `LeagueMatchResultEntryController` · `RecordLeagueResultDto` 식별자 **0건**,
      `league-match-result-entry.controller.ts` · `dto/league-match-result-entry.dto.ts` **파일 부재**,
      `components/admin/league-result-entry-modal.tsx` 와 그 테스트 삭제(FE 는 별도 PR).
      콘솔이 몰수를 **지정**할 수 있다는 스펙(승계·입력 양쪽).
- [ ] **Task 166**: `LeagueMatchResultEntryService` 식별자 **0건** + `league-match-result-entry.service.ts`
      파일 부재 — 이의 제거와 **같은 PR**에서(그 호출부가 사라지는 순간 이 서비스도 도달 불가가 된다).
- [ ] **건드리지 않는 것**: `league-result-entry-reminder`(별개 기능) · `game-result-league-auto-approve` ·
      `identity-link-expiry` · `v1-game-operations-worker` · `league-fixture-creation.ts` 의 리마인더 예약.
- [ ] 대회 설정 화면에서 피리어드를 바꾸면 설정 버전이 늘고 이후 게임에만 적용(통합 스펙).
- [ ] FE-2·FE-3 은 PR 본문에 "3안 제시 → 사용자 선택" 기록.

## Tech Debt Resolved

- 리그 결과 입력 두 벌(리그 모달 vs 콘솔 사후 입력) → 한 벌.
- `tournamentFixtureId` 를 직접 읽는 4 파일 → 출처 해석기 하나. Phase 3(대회 fixture → 팀 매치)에서 이 함수의 `fixture` 분기만 지우면 된다.

## Security Notes

- 콘솔 권한(운영자·배정 스태프)은 리그 거울에도 대회와 동일하게. 팀장이 콘솔 API 로 결과를 넣을 수 있는 길이 생기면 안 된다(리그는 D1 결정으로 운영자가 기본 입력자).
- 정정은 사유 필수 유지. 인라인이어도 리비전을 건너뛰는 직접 UPDATE 경로를 만들지 않는다.

## Risks & Dependencies

- Task 164 BE-1(수동 대진)이 만드는 경기도 팀 매치 기반 — BE-1 해석기가 먼저 있어야 콘솔에서 보인다. **165 BE-1 은 164 BE-1 과 병행 가능**(파일이 겹치지 않는다: `tournament-operations/` vs `league-matches/`).
- 리그 경기는 스태프 배정이 없는 것이 보통 → 사후 입력 경로가 주 경로. 라이브 콘솔은 열리되 "배정 없음" 상태를 명확히.
- 피리어드 설정 변경이 진행 중 대회에 적용되는 것으로 오해될 수 있다 — 화면 문구로 "이후 생성되는 경기부터" 를 명시(문구는 3안에 포함).

## Ambiguity Log

1. **"대시보드"가 어느 화면인가.** `/admin/live/:id` 개요로 본다(결과 검토 링크가 거기 있다). `/admin` 홈이 아니다. 다르면 3안 제시 때 사용자에게 확인.
2. **피리어드 수 상한.** 서버에 상한이 없다. 화면은 1·2 프리셋 + 직접 입력(최대 4)으로 잡되 서버는 그대로 둔다 — 아이스하키 3피리어드가 실제 종목이다.
3. **리그 전용 모달의 "몰수" 가 콘솔 사후 입력에 없을 때.** 콘솔 DTO 에 옮긴다(BE-3). 기능을 떨어뜨리지 않는다.
