# Task 166 — 결과 흐름 단순화 · 이의 제거 · 롤링 교체 제거 · 전적 탭 4종

> **정본**: `docs/design/competition-canonical-flow.md` §3 · §4 · §5. 이 문서는 그 절을 코드로 옮기는 순서와 계약이다.
> 선행: Task 163(명단 = 출전자) · Task 165 BE-1(콘솔이 팀 매치 출처를 안다).

## Context

2026-09-02 사용자 확정:
- 결과는 **종료 → 결과 보내기 → 어드민 확인** 한 단계. 사용자 화면엔 "확정 전" 태그가 붙었다가 확인되면 사라지고 그때 순위·전적 반영.
- 팀의 **이의 제기 경로 삭제**.
- **교체 제거는 롤링 교체 종목만**(`lineup.substitutions === 'rolling'`). 제한 교체 종목은 유지.
- 팀 전적 탭 **전체 / 대회 / 리그 / 친선**, 개인 기록에도 리그 구분.

### 실측 (origin/dev `afeb35565`)

| 항목 | 지금 |
|---|---|
| 결과 상태 | `V1GameResultRevisionState = DRAFT · SUBMITTED · CHANGE_REQUESTED · SUPPLEMENT_REQUESTED · REJECTED · OFFICIAL · VOID` (`schema.prisma:435`) |
| 확정 API | `POST /games/:gameId/result-revisions/:revisionId/{review-decision, supersede-and-submit, officialize, void}` + `POST /games/:gameId/corrections` (`tournament-operations/results/tournament-result-review.controller.ts`) |
| 이의 | `v1_league_match_disputes` 테이블(`schema.prisma:2040`) · API 11 파일 · 웹 5 파일 · 알림 4종 · `league-match-dispute.service.ts` |
| 교체 | 설정 `lineup.substitutions: 'rolling' \| 'limited'` + `maxSubstitutions` (`competition-config.parse.ts:78-79`) · API 16 파일 · 웹 21 파일 |
| 팀 전적 탭 | ~~`'전체'`·`'대회'` 만~~ → **2026-09-03 재실측: 전체·대회·리그·친선 4탭이 이미 완비**(D4-a `team-record-category.ts` + `?type=` 필터 + `summary.byType`). BE-4 는 팀 전적 쪽 할 일이 없다 |
| 개인 기록 | ~~`matchType` 만~~ → **재실측: 아이템에 `type`(리그/대회/친선)이 이미 있다**(같은 분류 함수). 없던 것은 `?type=` **필터**와 `summary.byType`, 그리고 화면의 분류 탭이다 |

## Goal

행복 경로가 **SUBMITTED → OFFICIAL 한 클릭**이 되고, 이의 도메인이 코드·스키마에서 사라지며, 롤링 종목 콘솔에서 교체가 사라지고,
팀·개인 전적이 대회/리그/친선을 구분한다.

## Original Conditions

- [ ] 어드민 확인 = `officialize` 한 번. 검토 요청·보완 요청·거부 상태는 **행복 경로에서 빠진다**. 세 상태의 실제 소비처를 실측해 0 이면 enum 값까지 제거, 있으면 Ambiguity Log 1 로 올린다.
- [ ] 사용자 화면(경기 상세·일정·라이브 스코어)에 SUBMITTED 는 점수 + "확정 전" 태그, OFFICIAL 은 태그 없음. 순위·승점·전적은 OFFICIAL 만 집계(변이: SUBMITTED 를 세면 red).
- [ ] 이의 테이블·서비스·컨트롤러·화면·알림 4종 제거. drop 마이그레이션은 사용자 직접 승인.
- [ ] `lineup.substitutions === 'rolling'` 인 대회의 콘솔에서 교체 커맨드가 **노출되지 않고 서버도 거부**(422 `SUBSTITUTION_NOT_TRACKED` — 착수 시 400 으로 적었으나 형제 코드 4개와 맞춰 422 로 정정). `'limited'` 는 기존 동작·`maxSubstitutions` 검증 유지(회귀 스펙).
- [ ] 팀 전적 탭 전체/대회/리그/친선. 개인 기록 `matchType` 에 `league` 추가.
- [ ] 화면 변경(태그 · 탭 · 콘솔 교체 버튼 제거)은 **3안 → 사용자 선택** 뒤 구현.

## User Scenarios

1. **운영자.** 경기 종료 후 "결과 보내기". 대시보드에 "확정 전 1건" 이 뜬다. 점수를 훑고 **확인**. 끝. 틀렸으면 그 자리에서 고치고 확인(Task 165 FE-2).
2. **관전자.** 경기 카드에 3:2 와 "확정 전" 태그. 몇 분 뒤 태그가 사라지고 순위표가 바뀐다.
3. **팀장(문제 발견).** 이의 버튼은 없다. 운영자에게 연락한다(대회 상세의 운영자 연락처).
4. **풋살 운영자.** 콘솔에 교체 버튼이 없다. 득점자는 명단 전원 중에서 고른다.
5. **11인 축구 운영자.** 교체 버튼이 있고 3회 제한이 걸린다(지금과 같다).

## Test Scenarios

### Happy
- SUBMITTED 리비전에 `officialize` → OFFICIAL, 순위 재계산, `team_match_completed` 알림. 중간 상태 없음.
- 공개 API `GET /tournaments/:id/matches/:fixtureId` 가 SUBMITTED 에서 `resultStage: 'pending_confirmation'`(이름은 구현 시 확정), OFFICIAL 에서 `official`.
- 롤링 대회 게임에 교체 커맨드 → 400. 제한 대회 게임 → 기존 스펙 통과.
- 팀 전적 리그 탭 = 정규 리그 공식경기만. 친선 탭 = `leagueId=null` 이고 fixture 도 없는 팀 매치만.

### Edge
- OFFICIAL 뒤 운영자가 corrections 로 새 리비전 → 다시 SUBMITTED 를 거치지 않고 OFFICIAL(운영자 입력은 즉시 확정 — 08-24 E1 유지).
- 이의 테이블에 행이 남아 있는 alpha 에서 drop → 마이그레이션이 행 수를 로그로 남기고 진행(복구 불가 경고, 사전 pg_dump).

### Error
- 관전자·팀장이 `officialize` 호출 → 403(기존 가드 유지 스펙).
- `matchType` 에 `league` 가 빠진 소비처(프론트 필터·라벨)가 있으면 타입 오류로 잡히도록 유니온을 닫는다.

### Mock updates
- 이의 픽스처·MSW 핸들러 삭제. 결과 리비전 픽스처에서 CHANGE_REQUESTED 계열 제거(또는 Ambiguity 1 결과에 따라 유지).

## Parallel Work Breakdown

### BE (순차)
- **BE-1 상태 소비처 실측 + 행복 경로 단순화.** ✅ 실측 결과 **소비처 0 아님**(주석·타 도메인
  제외 51건/15파일 — 쓰기 2·게이트 2·공개 API 1·화면 8·인프라 3). 그래서 **expand / contract 로
  나눈다**(2026-09-03 확정):

  | | BE-1 (expand, 이 PR) | contract (후속 PR) |
  |---|---|---|
  | 쓰기 경로 | `standardSubmittedTargets` 에서 두 값 제거 → **더는 그 상태로 못 들어간다** | — |
  | HTTP | `review-decision` 서비스·라우트·DTO 삭제 | — |
  | 재제출 base | `SUBMITTED` **추가**, 레거시 두 상태 **유지** | 레거시 두 상태 제거 |
  | `TERMINAL_REVISION_STATES` | 두 값 **유지**(레거시 행 불변성) | 두 값 제거 |
  | `league-result-stage` 매핑 | 두 case **유지**(레거시 행 읽기) | 두 case 제거 |
  | 화면 | 반려/보완 버튼 제거 · SUBMITTED 카드에 "확인"+"고치고 확인" · 레거시 카드 유지 | 레거시 카드 제거 |
  | DB | — | 데이터 변환 마이그레이션 + enum 값 제거 (**사용자 승인**) |

  **레거시 두 상태를 지금 빼면 안 되는 이유**가 둘이다. ① `TERMINAL_REVISION_STATES` 에서
  빼면 이미 그 상태로 저장된 행이 **변경 가능**해져 확정 결과를 덮어쓸 수 있다(유닛 스펙이
  실제로 잡았다). ② 재제출 base 허용에서 빼면 이미 반려·보완 요청된 경기를 **영영 고칠 수
  없다**(다른 재작성 경로가 없다). `prisma generate` 는 모노레포 공유 클라이언트라 로컬에서
  돌리지 않는다 — contract PR 의 enum 제거는 CI 가 생성한다.

  `CHANGE_REQUESTED` 는 **남긴다.** 이름은 "요청" 이지만 실제 역할은 *운영자 재작성 허용
  상태*(팀 왕복이 아니다)이고, `createResultRevision` 이 새 DRAFT 를 만들 수 있는 유일한
  선행 상태다. enum rename 은 마이그레이션 비용 대비 가치가 없어 하지 않고 docblock 으로
  뜻을 고정했다.

  남은 BE-1 항목: 공개 API 의 `scoreStatus` 에 "확정 전" 값 추가(사용자 화면 태그 자체는
  **FE-2**, 3안 대상). 순위·전적이 OFFICIAL 만 세는 것은 통합 스펙으로 고정했다
  (`league-match-public.integration-spec.ts` — SUBMITTED 리비전만 있는 대진이 승점 0·pending 1).
- **BE-2 이의 제거.** ✅ 실측으로 갱신(2026-09-03):
  - **알림은 4종이 아니라 5종**(`league_result_dispute_filed` + `league_match_dispute_{received,
    corrected,voided,rejected}`). 전부 TS 유니온이라 마이그레이션 불필요.
  - **`league-result-dispute-eligibility.ts` 는 이의 전용이 아니었다** — `team-matches.service.ts`
    가 그것으로 팀매치 상세에 `disputeDeadline`·`disputeBlockedReason`·`openDisputeExists` 를
    싣고, 웹이 그 값으로 "이의 D-day 카드"(U3, 08-24 A안)를 그렸다. 이의가 사라지므로 **셋 다
    삭제**(2026-09-03 사용자 결정 A). 완료 알림 문구의 "N일 안에 이의…" 도 제거.
  - **목록 밖 소비처 둘을 새로 찾았다**: ① 승강 확정의 "열린 이의 있으면 불가" 가드
    (409 `LEAGUE_RESULT_DISPUTE_OPEN`) — 이의 쪽 가드와 쌍이라 함께 제거(그 쌍이 만들던
    409 교착도 사라진다) ② `games.service.ts` 의 `assertTeamResultDisputeFileAuthority`
    + `team_result_dispute_file` 액션 — 이의 서비스 전용 래퍼라 호출부 0.
  - **`LeagueMatchResultEntryService` 동반 삭제**: 165 BE-3 이 HTTP 표면을 이미 지웠고 남은
    유일한 호출부가 이의 수락의 `correctResult` 였다(모듈 주석이 이미 예고).
  - **유지**: `LEAGUE_RESULT_AUTO_APPROVE_DELAY_MS`(24h 자동 승인 — 별개 기능. 파일만
    `league-result-auto-approve.constants.ts` 로 옮기고 죽은 7일 창 상수 제거),
    `revertCompletionInTx`(공개 엔드포인트가 계속 쓴다).
  - AC: `git grep -i -w dispute -- apps/v1_api/src/league-matches apps/v1_api/src/tournament-operations`
    → **0**. drop 마이그레이션(`v1_league_match_disputes` + enum 2)은 **별도 contract PR**
    (사용자 승인).
  - **`LeagueMatchResultEntryService` 를 같은 PR 에서 함께 삭제한다.** Task 165 BE-3 이 그 HTTP
    표면(컨트롤러·DTO·프론트 모달)을 이미 지웠고, **남은 호출부가 이의 수락(`correctResult`) 하나**다.
    그 호출부가 사라지는 순간 서비스 전체가 도달 불가가 되므로 여기서 같이 지운다 —
    `league-match-result-entry.service.ts` · 그 spec 파일 부재, 식별자 0건.
  - 지우지 않는 것: `league-result-entry-reminder`(경기 시작 +24h 리마인더, 별개 기능).
- **BE-3 롤링 교체 차단.** ✅ 구현(2026-09-03). 가드는 `games/core/substitution.ts` 의
  `validateSubstitution` **맨 앞**에 둔다 — 그 함수가 이미 `substitutionMode` 를 받고 있고
  모든 호출부가 지나는 단일 지점이다(설정 조회 경로는 `games.service.ts` 가 이미 갖고 있어
  복사하지 않았다). 롤링에서는 뒤따르는 검사(같은 팀인가·피치 위인가)가 묻는 질문 자체가
  의미 없으므로 그것들보다 **먼저** 던진다 — 순서가 뒤집히면 운영자가 "선수를 잘못 골랐다"
  로 읽고 다른 조합을 계속 시도한다.
  - **실측**: 친선 팀매치도 설정을 받는다(`team-matches.service.ts` 가 생성 시
    `competitionConfigVersionId` 를 채운다). 프리셋은 **축구 `limited`(cap 5) / 풋살
    `rolling`** 이므로, **풋살 친선 팀매치도 이 가드에 걸린다** — 정본 §3("롤링 종목은 교체
    기록 없음")이 대회/친선을 가르지 않으므로 의도된 동작이다. 설정이 아예 없는 경기
    (`competitionConfigVersionId = null`)는 기존 fail-closed 경로대로 `'limited'` 로 읽혀
    **현행 유지**다.
  - **이미 기록된 SUBSTITUTION 이벤트는 그대로 읽힌다**(`deriveOnPitchParticipantIds`) —
    이 가드는 새 기록만 막는다.
  - 에러 코드 `SUBSTITUTION_NOT_TRACKED` 는 **422** 다(2026-09-03 정정 — 조건 원문의 400 을
    코드에 맞춰 고쳤다). 형제 4개(`SUBSTITUTION_INVALID`·`OUT_NOT_ON_PITCH`·
    `IN_ALREADY_ON_PITCH`·`LIMIT_REACHED`)가 전부 422 인데 교체 실패 하나만 갈리면
    클라이언트가 두 매핑을 갖게 된다 — 뜻의 차이("이 요청 내용이 틀렸다" vs "이 경기엔 그
    명령이 없다")는 `code` 필드가 드러낸다.
  - 콘솔 UI 의 교체 버튼 숨김은 **같은 PR 에서 처리**(3안 대상 아님 — 제거). 착수 시엔
    별도 PR 로 적었는데, 분리의 이유가 "버튼이 422 를 내는 창을 최소화" 였고 **같은 PR 이면
    그 창이 0** 이라 합쳤다(2026-09-03 확정). 롤링 전용이던 "빠른 교체 모드" 패널도 도달
    불가가 되어 함께 삭제했다.
- **BE-4 전적 구분.** ✅ 구현(2026-09-03). 실측이 착수 전제와 달랐다:
  - **팀 전적은 이미 완비**돼 있었다(4탭·필터·`byType`). 할 일 없음.
  - 개인 기록도 아이템 `type` 은 이미 있었다. **없던 것은 `?type=` 필터·`summary.byType`·화면 탭** —
    그래서 이 태스크는 "BE 할 일 없음" 이 아니라 그 셋을 만드는 일이었다(내 첫 조사 정정).
  - `matchType` 은 **값을 더하지 않는다.** 그건 게임 *소스 타입* 이분법의 구 별칭이고
    (`type` 이 정본 분류다), 소비처 실측이 **0**이다(`apps/v1_ios` 0 · `apps/v1_android` 0 ·
    웹 화면 0 · 테스트만 3). `@deprecated` 로 두고 **다음 정리 스윕에서 삭제**한다(아래 후속).
  - `UserRecordsQueryDto` 를 **서브클래스로만** 넓혔다 — 공유 `PublicRecordsQueryDto` 는 여전히
    frozen 이고, `type` 없이 부르면 응답 모양·내용이 그대로다(회귀 스펙).
  - 화면 어휘(탭·라벨·빈 상태)는 `record-category-tabs.ts` 로 **끌어올려 두 화면이 공유**한다
    — 서버가 같은 분류 함수를 쓰는데 화면 어휘만 갈리면 같은 경기가 다른 이름으로 불린다.

#### 확정된 것 (2026-09-03)
- **집계 SQL 의 `deletedAt` 미필터는 현행 유지.** 소프트 삭제된 팀매치도 조인돼 `leagueId` 를
  주는데, 과거 기록 보존이 맞다고 판단했다.
- **`V1GameSourceType` 의 `COMPETITION_FIXTURE`·`FRIENDLY_MATCH`(R1 expand)는 분류와 무관하다** —
  분류 함수와 SQL 은 sourceType 을 보지 않고 `tournamentId`/`leagueId` 컬럼만 본다. R3 승격 때
  `tournamentId` 채움 규칙이 바뀌면 그때 함께 본다.

#### 후속 (이 태스크 범위 밖)
- **`matchType` 별칭 삭제** — 소비처 0(위 실측). 다음 정리 스윕에서 제거한다.

### FE (BE 배포 뒤, 3안 선택 뒤)
- **FE-1** "확정 전" 태그(경기 카드·상세·라이브 스코어) + 어드민 "확정 전 N건" 큐.
- **FE-2** 이의 화면·버튼·알림 착지 삭제. 대회 상세에 운영자 연락 경로가 있는지 확인(없으면 3안).
- **FE-3** 롤링 대회 콘솔의 교체 UI 숨김(설정 기반, 하드코딩 금지).
- **FE-4** 팀 전적 탭 4종 · 개인 기록 필터.

### Infra / QA
- alpha 하네스: 종료 → 결과 보내기 → 공개 API "확정 전" → officialize → 공개 API official + 순위 변화. 403/429 는 ⚠️.

## Acceptance Criteria

- [ ] 행복 경로 API 호출 2회(제출·확인)로 OFFICIAL 도달(통합 스펙).
- [ ] `git grep -n -i -w -e dispute -- apps/v1_api/src/league-matches apps/v1_api/src/tournament-operations ':(glob)apps/v1_web/src/**/*league*' ':(glob)apps/v1_web/src/**/*dispute*' | wc -l` → `0`(장터 분쟁은 별개 도메인 — web 은 리그·이의 파일명으로 좁힌다; 장터 `disputes/` 라우트는 대상 밖).
- [ ] 롤링/제한 두 대회에서 교체 커맨드 결과가 갈리는 통합 스펙 2건.
- [ ] 팀 전적 4탭 · 개인 기록 리그 구분이 alpha 공개 API 로 확인.
- [ ] FE 항목마다 "3안 제시 → 선택" 기록.

## Tech Debt Resolved

- 결과 상태 7개 → 실제 쓰이는 것만. 이의 도메인 전체 삭제. 리그/대회 두 결과 입력 경로 → 하나(165 와 함께).

## Security Notes

- `officialize` 권한은 운영자·어드민만(기존 가드). 확인 단계가 하나뿐이므로 권한 오류가 곧 결과 조작 — 통합 스펙에 403 케이스 필수.
- drop 마이그레이션 2건(이의 테이블 · 필요 시 enum 값)은 사용자 직접 승인 + 사전 pg_dump.

## Risks & Dependencies

- Task 163 이 먼저 "명단 = 출전자" 를 끝내야 롤링 교체 제거가 명단과 모순되지 않는다.
- Task 165 BE-1 이 먼저 있어야 리그 게임의 SUBMITTED → OFFICIAL 이 콘솔에서 보인다.
- 이의 삭제는 되돌릴 수 없다 — 08-24 D2/E4 의 "이의 수락 시 정정·무효" 흐름이 통째로 사라진다. 정본 §6 에 "잃는 것" 으로 기록됨.

## Ambiguity Log

1. **CHANGE_REQUESTED · SUPPLEMENT_REQUESTED · REJECTED 의 운명.** 소비처 실측 후 결정. 0 이면 삭제, 있으면 [ASK].
2. **"확정 전" 의 API 값 이름.** `resultStage` 기존 값 체계에 맞춰 BE-1 에서 정한다.
3. **친선경기의 정의.** `leagueId=null` 이고 fixture 연결도 없는 팀 매치. 용병 매치·개인 매치(`V1Match`)는 D2 로 밖.
