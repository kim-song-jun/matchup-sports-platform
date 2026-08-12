# 팀 후기 작성 권한 개방 — 팀장 전용에서 참가팀 멤버 전원으로

작성일: 2026-08-12
대상: `apps/v1_api/src/reviews/` (team_match · tournament_fixture 후기)

## 배경 (기)

지금 팀 대상 후기는 **참가팀의 owner/manager만** 쓸 수 있다. 일반 멤버가 제출하면
`NOT_TEAM_REVIEW_MANAGER` 403이 돌아온다. 제한은 백엔드 두 곳에 복제돼 있다.

| 위치 | 담당 후기 |
|---|---|
| `reviews.service.ts:243, 536, 553` | 일반 팀 매치 (`team_match`) |
| `tournament-fixture-reviews.service.ts:191, 208, 260` | 대회 경기 (`tournament_fixture`) |

프론트엔드에는 이 권한을 반영한 게이팅이 없다 — `NOT_TEAM_REVIEW_MANAGER`를 참조하는 화면도,
"팀장만 후기를 쓸 수 있다"는 문구도 없다. 즉 일반 멤버는 후기 작성 화면까지 들어간 뒤
제출 시점에 403을 맞는다.

## 문제 (승)

경기에 실제로 뛴 사람은 팀 전체인데, 상대팀에 대한 평가는 팀장 한 명의 인상으로 결정된다.
표본이 1이라 개인 편향이 그대로 팀 신뢰도가 되고, 팀장이 후기를 안 쓰면 그 경기는 통째로
평가 공백이 된다.

## 결정 (전)

### 확정된 선택

| 항목 | 결정 |
|---|---|
| 작성 주체 | **팀 멤버 전원** (`V1TeamMembership.status = 'active'`, 역할 무관) |
| 리뷰 대상 | **상대팀만** 유지 (개인 평가로 넓히지 않음) |
| 적용 범위 | 대회 경기 + 일반 팀 매치 **둘 다** |
| 중복 방지 단위 | 각 소스의 기존 스코프 유지 (매치당 / 대회당), 주체만 팀 → 사람 |
| 신뢰도 집계 | **팀 평균을 1표로 환산** |
| 후기 건수(N) | **평가한 팀 수** |

### 검토한 대안과 버린 이유

**작성 주체를 "대회 로스터 등록 선수"로** — `V1TournamentPlayer`(removedAt=null) 기준이
"실제로 그 대회에 온 사람"에 더 정확하지만, 일반 팀 매치에는 로스터 개념이 없어 두 후기의
판정 기준이 갈린다. 멤버십 기준이면 두 소스에 같은 규칙을 쓸 수 있다. 대가로, 경기에 오지
않은 팀원도 상대팀을 평가할 수 있다 — 아래 집계 방식이 이 영향을 흡수한다.

**신뢰도를 원시 평균으로** — 구현은 가장 단순하지만 인원 많은 팀의 목소리가 커지고, 한 팀이
담합하면 상대 신뢰도를 즉시 떨어뜨릴 수 있다. 지금은 팀장 1명 = 1표라 한 팀이 미치는 영향이
1표로 묶여 있는데, 원시 평균은 그 상한을 없앤다.

**한 팀당 최대 N건만 산입** — 절충안이지만 N의 근거가 임의적이고 "내 후기가 반영됐나"를
사용자에게 설명할 수 없다.

## 변경 내용 (결)

### 1. 권한 — 역할 필터 제거

두 파일의 `resolveReviewerTeam` / `managedTeamIds`에서 `role: { in: TEAM_REVIEW_ROLES }`를
제거하고 `status: 'active'`만 남긴다. 함께 정리할 것:

- `TEAM_REVIEW_ROLES` 상수 삭제 (`reviews.service.ts:37`, `tournament-fixture-review-mappers.ts:5`)
- `reviewTeamRole()` 삭제 (`tournament-fixture-reviews.service.ts:260`) — owner/manager가 아니면
  던지는 함수라 존재 자체가 새 정책과 모순
- 반환 타입 `'owner' | 'manager'` → `V1TeamMembershipRole`
- 에러코드 `NOT_TEAM_REVIEW_MANAGER` → `NOT_TEAM_MEMBER`,
  메시지 "참가팀 소속만 후기를 쓸 수 있어요."
- `managedTeamIds` → `participatingTeamIds`로 개명 (더 이상 "관리하는" 팀이 아님)

`AMBIGUOUS_REVIEWER_TEAM` 409는 유지한다. 양 팀에 동시 소속인 사용자는 전원 개방 후 더 자주
나올 수 있지만, 어느 팀 입장으로 쓰는지를 서버가 임의로 정하면 안 된다.

### 2. 중복 방지 — unique 키의 팀을 사람으로 교체

| 후기 | 지금 | 변경 후 |
|---|---|---|
| `team_match` | `(reviewerTeamId, targetTeamId, sourceType, sourceId)` | `(reviewerUserId, targetTeamId, sourceType, sourceId)` |
| `tournament_fixture` | `(reviewerTeamId, targetTeamId, sourceType, sourceGroupId)` | `(reviewerUserId, targetTeamId, sourceType, sourceGroupId)` |

**기존 팀 기준 제약 2개는 반드시 드롭한다.** 남겨두면 같은 팀의 두 번째 멤버가 제출할 때
unique 위반으로 막혀, 권한만 열고 실제로는 여전히 1명만 쓸 수 있는 상태가 된다. 이 작업에서
빠뜨리면 안 되는 단일 항목.

`(reviewerUserId, targetUserId, sourceType, sourceId)` 제약(개인 후기용)은 그대로 둔다.
팀 후기는 `targetUserId`가 NULL이라 Postgres unique 제약에 걸리지 않으므로 충돌하지 않는다.

**마이그레이션 리스크**: 한 사람이 서로 다른 두 팀의 owner/manager이면서 그 두 팀이 같은
상대를 만난 경우, 기존엔 `reviewerTeamId`가 달라 2건이 허용됐지만 새 제약에서는 충돌한다.
마이그레이션에 사전 중복 검사를 넣고, 검출되면 **실패시켜 수동 판단하게 한다** — 자동으로
하나를 지우지 않는다.

### 3. 신뢰도 집계 — 팀 평균을 1표로

`recalculateTeamTrust`(`reviews.service.ts:595`)와
`recalculateTournamentFixtureTeamTrust`(`tournament-fixture-review-trust.ts:4`) 둘 다:

1. 대상 팀에 달린 후기를 `reviewerTeamId`로 묶는다
2. 팀별 평균 rating을 낸다
3. 그 평균들의 평균을 최종 점수로 쓴다
4. `reviewCount` = 평가에 참여한 **팀 수** (= 2번의 그룹 수)

`reviewCount`를 팀 수로 두면 `trustStateForReviewCount`의 기존 등급 기준이 그대로 유효하다.
작성자 수로 세면 한 대회만 뛰어도 등급이 최고치에 닿아 지표가 무력화된다.

`tournament_fixture` 쪽은 지금 Prisma `aggregate({_avg})` 한 방이라 groupBy 경유로 바꾼다.
`team_match` 쪽은 이미 `findMany` 후 앱에서 계산하므로 집계 단계만 교체한다.

**집계 경로는 두 개가 아니라 세 개다** (최초 설계에서 빠뜨렸던 항목 — 구현 후 리뷰에서 발견).
위 두 함수는 `V1TeamTrustScore` 테이블에 값을 쓰지만, 팀 목록·팀 상세·팀매치 화면은
`computeRevealedTeamTrustBatch`(`team-trust-aggregation.ts`)로 **live 재계산한 값이 그 컬럼을
덮어쓴다**(`teams.service.ts:136,538,1732`, `team-matches.service.ts:118,803,1238`,
`admin.service.ts:1066`). 이 배치 함수도 같은 "팀 평균 1표"로 바꾸지 않으면 DB와 화면이 갈리고,
상대 팀원 3명이 한 경기에서 쓰는 것만으로 `reviewCount`가 3이 되어 `verified`(인증팀)에 닿는다 —
권한 개방 전에는 팀당 1건이라 구조적으로 불가능했던 등급이다.

근본 원인은 `trustStateForReviewCount` / `average` / `revealGroupKey`가 두 파일에 **복제**돼 있어
한쪽만 고쳐도 티가 나지 않았던 것이다. 세 함수를 `team-trust-aggregation.ts`의 단일 정의로 합치고
`reviews.service.ts`가 import한다(방향: 서비스 → 순수 헬퍼, 순환 없음). `decimalScore`만 예외로
양쪽에 남는다 — 한쪽은 Prisma 컬럼용 `Prisma.Decimal`, 다른 쪽은 API 응답용 `number`라 서로 다른
함수다.

또한 세 경로 모두 `reviewerTeamId: { not: null }`을 쿼리에 건다. 팀 후기는 항상 `reviewerTeamId`를
기록하지만 컬럼이 nullable이라, null 그룹이 "이름 없는 한 팀"으로 집계에 섞여 유령 1표를 만들 수 있다.

**reveal 게이트는 팀 단위 유지**: `team_match` 후기는 상대도 써야 공개되는데
(`isReviewRevealed`), 이 판정은 "상대팀에서 누구든 한 명이 썼는가"로 본다. 사람 단위로 바꾸면
상대팀 11명 중 나를 평가한 사람이 있어야만 내 후기가 공개되는 셈이 되어 사실상 영영 안 열린다.

### 4. pending 목록 — 사람 기준 판정

`existingReviewKeys`(대회) / `existingTeamReviewKeys`(팀 매치)가 지금 `reviewerTeamId`로
"이미 썼음"을 판정한다. 그대로 두면 **팀장이 쓴 순간 나머지 팀원 전원에게 완료로 표시**된다.
키를 `reviewerUserId` 기준으로 바꿔 각자 자기 몫이 남아 보이게 한다.
`teamReviewKey()` 헬퍼의 시그니처도 함께 바뀐다.

### 5. 테스트

기존 spec에는 "일반 멤버는 403" 케이스가 없어서, 정책 역전을 잡아낼 회귀 테스트를 새로 만든다.

- 일반 멤버(`role: 'member'`)가 상대팀 후기를 제출하면 성공한다 (기존 403 역전)
- 같은 팀 멤버 2명이 각각 제출하면 **둘 다 저장된다** (드롭 누락 시 여기서 실패)
- 같은 사람이 같은 대상에 두 번 제출하면 기존 후기가 반환된다 (`alreadySubmitted: true`)
- A팀 3명이 평균 2점, B팀 1명이 5점을 주면 대상 팀 점수는 `(2 + 5) / 2 = 3.5`이고
  `reviewCount`는 2다 (원시 평균이면 2.75가 나오므로 두 방식이 구분된다)
- 팀장이 이미 쓴 경기가 다른 팀원의 pending 목록에 여전히 남아 있다

### 6. 프론트엔드

작성 진입점에 권한 게이팅이 없으므로 화면 변경은 없다. 다만 팀 상세의 신뢰도 문구가
"후기 N건"을 어떤 단위로 읽히게 하는지 확인하고, 필요하면 "N개 팀 평가"로 문구만 맞춘다.

## 트레이드오프 정리

| | 지금 (팀장 1표) | 변경 후 (전원 참여 · 팀 평균 1표) |
|---|---|---|
| 장점 | 집계가 단순하고 담합에 강함. 작성 책임 소재가 명확 | 표본이 늘어 편향이 줄고, 팀장이 안 써도 평가가 남음 |
| 단점 | 표본 1의 개인 편향. 팀장 미작성 시 평가 공백 | 경기에 안 온 팀원도 평가 가능. 집계 단계가 한 겹 늘고, 팀 내 의견이 갈리면 평균에 묻힘 |
| 신뢰 등급 스케일 | 기존 기준 | 동일 유지 (건수를 팀 수로 세기 때문) |

경기에 안 온 팀원의 참여는 팀 평균 환산이 흡수한다 — 그 사람의 표는 팀 내부 평균에 섞일 뿐
대상 팀 점수에 별도 1표로 더해지지 않는다.

## 남은 작업 순서

1. Prisma 스키마 unique 제약 교체 + 사전 중복 검사를 포함한 마이그레이션 작성
2. `tournament-fixture-reviews.service.ts` 권한·키·집계 변경
3. `reviews.service.ts` 동일 변경 (reveal 게이트는 팀 단위 유지)
4. 두 신뢰도 집계 함수를 팀 평균 환산으로 교체
5. 회귀 테스트 5종 추가
6. 팀 상세 신뢰도 문구 확인
