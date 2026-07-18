# Task 117 - V1 Review Anonymized Aggregates

## Summary

매치·팀매치 상호평가 리뷰(`V1PostEventReview`)를 개별 리뷰(누가 몇 점을 줬는지) 노출 없이, 종목별 × 기간별(전체/월 선택) **집계 수치**로만 대상자에게 보여주도록 재구성한다. 상대가 리뷰를 냈는지 모른 채 먼저 내가 리뷰를 내는 구조는 그대로 두되(현재도 그렇다), 서로 리뷰가 실제로 공개(집계 반영)되는 시점을 지연시켜 보복성 리뷰를 방지한다. 대회 후기(tournament reviews)는 이번 스코프 밖이며, 팀 신뢰점수 계산에서 팀매치 리뷰와 대회후기 리뷰가 섞이는 부분은 이번 기회에 분리한다.

## Context

사용자 원 요청: "리뷰는 상대가 나한테 어떤 리뷰를 했는지는 누가했는지 몰라야하니까 일정시간 뒤 적용/익명 적용/종목별(전체/월별)항목 수치만 보이게 해야하겠다." Task 109(2026-07-18) 진행 중 명시적으로 스코프에서 제외됐고("리뷰 작성은 추후니까"), 브레인스토밍을 거쳐 이번에 스펙을 확정한다.

현재 상태(origin/dev 기준 조사 완료, 2026-07-19):
- `V1PostEventReview`: `rating Int`(1~5) + `V1PostEventReviewTag`(사전정의 태그 N:1) 조합. **자유 텍스트 코멘트 없음.**
- 종목 구분 필드 없음 — `sourceId`로 매치/팀매치를 조인해야만 종목을 알 수 있음.
- 제출 즉시 `recalculateUserReputation`/`recalculateTeamTrust`가 같은 트랜잭션에서 실행 — **블라인드·지연 없이 즉시 반영**.
- `GET /reviews/received`(`/my/reviews/received`)가 작성자 닉네임·프로필·별점·태그를 그대로 노출.
- `V1TeamTrustScore.mannerScore`는 `team_match` 리뷰와 `tournament_fixture` 리뷰가 같은 aggregate에 섞여 계산됨(`recalculateTeamTrust`/`recalculateTournamentFixtureTeamTrust` 둘 다 `targetType:'team'` 전체를 대상으로 함, sourceType 필터 없음).

## Goal

- [ ] 개인매치·팀매치 리뷰 제출 후, 대상자는 **어떤 개별 리뷰도(작성자·별점·태그 조합) 볼 수 없다** — 신규 제출분부터.
- [ ] 대상자는 종목별 × (전체 / 특정 월 선택) **평균 별점 + 건수**, **태그 선택 빈도(%)**만 볼 수 있다.
- [ ] 리뷰 쌍(나→상대, 상대→나)이 **양쪽 다 제출되면 즉시** 집계에 반영된다.
- [ ] 한쪽만 제출한 경우 **제출 시점으로부터 72시간이 지나면** 상대 제출 여부와 무관하게 집계에 반영된다.
- [ ] 이 기능 출시 이전에 이미 제출된 리뷰는 소급 마스킹하지 않는다 — 기존 개별 리스트 UI를 "이전 리뷰" 섹션으로 보존하고, 새 집계 대시보드를 그 위에 추가한다.
- [ ] `V1TeamTrustScore`는 `team_match` 소스 리뷰만 집계하는 경로와, `tournament_fixture` 소스 리뷰만 집계하는 경로로 분리한다(대회후기 UI·동작은 변경하지 않음).
- [ ] 마이페이지·공개프로필·매치 신청자 목록 등 기존에 `mannerScore` 단일 누적값을 보여주던 곳들은 이번 변경으로 깨지지 않아야 한다(새 집계 방식과의 정합성 확인 — 예: 전체 종목 통합 평균이 필요한 화면은 종목별 집계를 합산해서 계산하거나 별도 유지).

## Ambiguity Log

- 72시간이라는 구체적 숫자는 사용자가 "예시"로 제시한 추천안을 승인한 것 — 정확히 72시간(3일)로 확정. 구현 중 변경이 필요하면(예: 상수화 위치) 재확인.
- "이전 리뷰" 섹션의 정확한 경계는 "이 기능이 실제로 배포된 시점"이다 — feature flag나 배포일 기준 컷오프 방식은 구현 계획 단계에서 확정(예: `V1PostEventReview`에 신규 컬럼을 추가해 그 컬럼이 존재하는 이후 row만 신규 규칙 적용, 마이그레이션 시점 이전 row는 자동으로 레거시로 분류).

## Data Model Draft

`V1PostEventReview`에 추가:
- `sportId String` (또는 `sport String` — 기존 스키마의 종목 식별 컨벤션에 맞춰 구현 단계에서 확정) — 제출 시점에 `sourceId`가 가리키는 매치/팀매치의 종목을 스냅샷으로 기록(조인 비용 제거 + 매치 삭제/변경과 무관하게 안정적인 집계).

신규 집계 API 응답 형태(초안):
```
GET /reviews/received/summary?targetType=user&period=all|YYYY-MM
{
  bySport: [
    {
      sportId, sportName,
      ratingAvg: number, ratingCount: number,
      tagRates: [{ tagCode, label, rate: number /* 0~1 */, count: number }]
    }
  ],
  availableMonths: string[] // YYYY-MM, 드롭다운 채우기용
}
```

reveal(집계 반영) 판정은 별도 상태 컬럼 없이 **조회 시점 계산**으로 처리(cron 불필요):
- 리뷰 A(나→상대)가 집계에 포함되는 조건 = 같은 `sourceId`+반대 방향 리뷰(상대→나)가 `submitted` 상태로 존재 **OR** `now() - A.submittedAt >= 72h`.

## Parallel Work Breakdown

**Backend** (`apps/v1_api/src/reviews/*`, `apps/v1_api/prisma/schema.prisma`)
- `sportId` 컬럼 추가 + 멱등 migration + 기존 row 백필(가능한 범위에서 `sourceId` 역추적, 실패분은 null 허용)
- 집계 API 신규(위 draft), reveal 조건을 쿼리 레벨에서 처리
- `recalculateTeamTrust`를 `sourceType` 필터링해서 분리(team_match 전용) / `recalculateTournamentFixtureTeamTrust`는 대회후기 전용으로 유지, 최종 `V1TeamTrustScore` 노출값을 어떻게 합성할지(둘을 각각 어디에 보여줄지)는 프론트와 함께 확정
- 기존 `GET /reviews/received`는 "이전 리뷰"용으로 유지하되, 이 기능 배포 이후 제출된 리뷰는 이 엔드포인트 응답에서 제외(개별 노출 금지 원칙 유지)

**Frontend** (`apps/v1_web/src/app/my/reviews/received`, `hooks/use-v1-api.ts`)
- 집계 대시보드 신규 컴포넌트(종목 탭 또는 셀렉트 + 전체/월 드롭다운 + 별점평균/건수 + 태그 빈도 바)
- 기존 개별 리스트를 "이전 리뷰" 섹션으로 재배치, 신규 리뷰는 이 리스트에 나타나지 않음을 보장
- 마이페이지/공개프로필의 매너점수 표시부 정합성 점검

**순차**: sportId 백필 마이그레이션 → 집계 API → 프론트 대시보드. 팀신뢰점수 분리는 백엔드 내에서 독립적으로 병행 가능.

## Test Scenarios

- happy: 양쪽 제출 → 즉시 집계 반영, 종목/월 필터 정확
- edge: 한쪽만 제출 + 71시간 경과(반영 안 됨) vs 72시간 경과(반영됨)
- edge: 같은 상대와 여러 종목으로 여러 번 매치 → 종목별로 정확히 분리 집계
- error: sportId 백필 실패한 과거 row가 신규 집계 쿼리에서 에러 없이 스킵되는지
- mock 갱신: reviews 관련 fixture에 sportId 필드 반영

## Acceptance Criteria

- 신규 제출 리뷰는 어떤 API 응답에서도 대상자에게 작성자 식별 정보 없이 집계 수치로만 노출된다.
- 대회후기 UI/집계는 이번 변경으로 동작이 바뀌지 않는다(회귀 없음).
- 기존 리뷰 관련 테스트 + 신규 테스트 모두 pass, migration은 CI의 replay+drift gate 통과.

## Out of Scope

- 대회 후기(tournament reviews) 익명화 — 별도 요청 시 재기획.
- 자유 텍스트 코멘트 도입 — 현재 태그+별점 구조 유지, 새 입력 필드 추가 안 함.
