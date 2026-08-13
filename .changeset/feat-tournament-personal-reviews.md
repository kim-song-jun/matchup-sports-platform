---
"v1_api": minor
---

대회 경기에서 **개인 간(사용자↔사용자) 후기**를 열었다. 지금까지 개인 대상 후기는 개인 매치(`match`)에서만 가능했고, 대회(`tournament_fixture`)·팀 매치(`team_match`)는 서버가 `targetType=user`를 400으로 명시 거부했다.

**대상 명단은 상대팀 대회 로스터(`V1TournamentPlayer`, `removedAt=null`) 기준.** 대회 경기 라인업(`V1GameParticipant`)에는 `userId` 컬럼이 없어 "그 경기에 누가 뛰었는지"를 사용자 단위로 알 수 없기 때문에, 대회 등록 로스터를 근거로 삼는다. 명단을 **상대팀 등록에서만** 뽑으므로 같은 팀 동료는 구조적으로 대상에서 빠진다(팀 내부 담합 방지). 작성 주체는 팀 후기와 같은 정책 — 참가팀 `active` 멤버 전원. 실명(`realName`)은 응답에 싣지 않고 닉네임만 노출한다.

**팀 매치로는 넓히지 않았다.** 팀 매치는 신청·승인이 팀 단위라 참가 선수 명단을 담는 모델이 없어 "그 경기의 상대 선수"를 특정할 근거가 없다.

**중복 방지 스코프는 대회 단위.** 기존 개인 후기 제약 `(reviewer_user_id, target_user_id, source_type, source_id)`의 `source_id`는 픽스처라서, 같은 상대를 예선·8강·결승에서 세 번 평가할 수 있었다. 팀 후기가 쓰던 `source_group_id`(=대회) 스코프를 개인 대상에도 똑같이 적용하는 unique 인덱스를 추가한다(`match` 후기는 `source_group_id`가 NULL이라 영향 없음).

**평판은 소스별로 분리한다.** `V1UserReputationSummary`에 `tournament_trust_state` / `tournament_manner_score` / `tournament_review_count` / `tournament_source_label`을 추가하고, 대회 개인 후기는 이 컬럼에만 쌓는다. 한 대회에 나가면 상대팀 로스터 전원에게 며칠 만에 수십 건을 받을 수 있어, 개인 매치 평점과 같은 컬럼에 합산하면 그동안 쌓아온 점수가 대회 한 번에 통째로 덮인다(`V1TeamTrustScore`의 `team_match` ↔ `tournament_fixture` 컬럼 분리와 같은 선례). 집계 단위도 팀 후기와 같은 "대회 × 평가한 팀 1표"다 — 상대팀 15명이 한 사람에게 몰아쓰는 것은 15개의 독립된 의견이 아니라 한 팀의 의견이기 때문이다.

**상호 공개(reveal) 짝 맞추기 단위도 대회로 접었다.** 대회 후기는 중복 방지 스코프가 대회 단위라 내가 예선에서 평가하고 상대가 결승에서 평가하면 두 행의 `source_id`가 다르다 — 픽스처 기준으로 맞추면 짝이 영영 성립하지 않아 상호 공개 경로가 죽고 72시간 폴백만 남았다. 팀 대상 대회 후기에도 같은 함정이 있었고 함께 고쳤다.
