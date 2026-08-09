---
"v1_api": patch
---

expand-contract 마이그레이션 게이트에 **검토된 non-additive statement**를 위한 감사 가능한
escape hatch 를 추가하고, alpha 배포를 막던 팀일정 unique index 를 등록한다.

## 무엇이 막고 있었나

#296(매치↔팀일정 연동)이 추가한
`CREATE UNIQUE INDEX "v1_team_schedules_team_match_unique" ON "v1_team_schedules"("team_id", "team_match_id")`
는 **기존 테이블의 기존 컬럼**에 unique 를 거는 non-additive 변경이라, 배포 pre-step
"Resolve rollback compatibility base"(`check-expand-contract-migrations.mjs`)가 정당하게 막았다 —
2026-08-09 alpha 배포가 시드 데드락 해소(#297) 뒤에도 이 게이트에서 계속 실패했다.

## 왜 override 인가

게이트의 additive 규칙은 **statement 가 additive 임을 증명**할 수만 있고, 진짜 non-additive 이지만
이 코드베이스의 데이터·앱 현실에서 롤백 안전한 경우까지 판정하진 못한다(구조적 한계). 그
마지막 판단은 사람 몫이고, 이번 변경이 그걸 **감사 가능하게 기록**하는 자리다:

- `REVIEWED_NON_ADDITIVE` 리스트에 (file, statement, reason) 로 등록된 statement 만, **정확히
  그 한 쌍만** 통과시킨다(정규화된 일치 — 공백 차이 무시). 나머지 non-additive 는 전부 그대로 막힌다.
- 통과 시 배포 로그에 `reviewed non-additive accepted ... <reason>` 을 남긴다(조용한 우회 아님).

## 이 index 가 안전한 근거 (등록 사유)

- `team_match_id` 가 NULL 인 일반 TRAINING/EVENT 스케줄은 Postgres 가 NULL 을 충돌로 안 봐서
  제약 대상이 아니다 — MATCH 스케줄만 constrained.
- (team, match) 중복 스케줄은 앱 레벨 idempotency(팀 단위 lock + 트랜잭션 불변식,
  `team-schedules.service.ts`)가 이미 막는다. 이 index 는 저자의 마지막 방어선이지, 옛 writer 가
  위반할 새 형태가 아니다.
- alpha 실측: `v1_team_schedules` 에 non-NULL `team_match_id` 행 0건, 중복 0건.

## 검증

`--self-test` 에 3케이스 추가: 등록된 statement 통과(공백 무시), 미등록 non-additive 는 여전히
거부, 같은 statement 라도 다른 file 이면 거부. 실제 range(d6176d50 → dev)를 게이트에 태워
`accepted → passed` 를 실측 확인(배포 pre-step 재현).
