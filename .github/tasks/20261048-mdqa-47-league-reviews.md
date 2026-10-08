# Task 20261048: QA #47 종료 리그 후기 조회 실패

Status: In Progress
**Owner**: root → backend data worker → root integration/review/Git
**Created**: 2026-10-08

## Context
[기존 리포트 #47](https://teameet.jmandu.kr/issues/47/)은 종료된 (테스트)1002 f36132ca-1f1e-4331-951f-4c71208ea17c 상세·시상·결과는 정상인데 후기 목록은 대회를 찾을 수 없어요 404가 재시도/새로고침에도 반복됨을 보고했다. 기존 #34는 복귀 문제로 별개. Root가 전체 미완료/접수, 열린 dev PR4건·task·활성 작업 대조 후 새 미선점건을 김성준 담당·확인 중으로 선점하여 실제 표시·toast 확인.

## Goal
현재 v1 실제 리그/대회 surface 계약과 후기 저장/권한 계약을 대조하여 존재하는 공개 리그의 후기를 올바르게 조회하고 쓰기/관리/공개 권한을 유지한다. 미지원 계약이면 현재 지원 범위를 정확히 노출하고 false-not-found를 없앤다.

## Original Conditions
- [x] 선점 저장 확인과 중복 확인
- [ ] 실제 원인 및 가장 작은 올바른 수정
- [ ] 좁은 실제 RED→GREEN 및 API 계약 문서 sync
- [ ] 독립 리뷰·committed검증·base dev PR·같은 리포트 댓글

## User Scenarios
E2E 관리자/1188×760에서 /tournaments/f36132ca-1f1e-4331-951f-4c71208ea17c → 대회 후기 → 정상 조회/정상 빈 상태. 재시도/뒤로가기 정상. 후기 제출·실제데이터변경은 하지 않는다.

## Test Scenarios
- [ ] 현재 regular_league/public 존재 조회·public tournament 기존조회·hidden/deleted/unknown failclosed
- [ ] 실제 Prisma 조건 필터를 적용하는 mock로 RED(그냥항상행반환fake금지)
- [ ] 후기쓰기, 참가manager, moderation 보호 기존테스트 유지
- [ ] 최신 head API타입/린트 및 committed narrow
- [ ] actualalphaBefore/배포SHA일치After 분리

## Parallel Work Breakdown
Phase A root 선점·freshorigin/dev·task·실제 브라우저.
Phase B backend-data worker Owned: apps/v1_api/src/tournaments/tournament-reviews.service.ts + .spec.ts, docs/api/domains/tournaments.md만. 필요 시 다른 shared lookup/DTO/schema/frontend 계약 변경은 root exactscope 선행승인. Forbidden controller/DTO/schema/migrations/seed/sharedhooks/types/MSW/frontend/otherWT/task/Git/.env. 혼자가 아니므로 타인 변경을 보존하고 selfcommit금지.
Phase C root 직렬검증·Changeset·independentreview·commit/push/devPR/댓글.

## Acceptance Criteria
- [ ] 실제 support/privacy/auth contract 정합, 빈 후기와 404구분
- [ ] RED→GREEN·schema/API 문서/fixture 정합·Critical0/Warning0
- [ ] 새 부채와 untracked dependency 없음
- [ ] alpha 실제해결/머지前완료로 표시하지 않음

## Tech Debt Resolved
조사 중. 공개 상세 lookup과 리뷰의 TOURNAMENT_KINDS scope 차이 존재.

## Security Notes
공개존재조건 isPublic/deletedAt/allowedkinds 유지. 쓰기 참가자·manager/이미지소유권·중복/모더레이션 우회 금지.

## Risks & Dependencies
지원종류 현재코드의 단일 V1Tournament 모델과 TOURNAMENT_SURFACE_KIND를 근거로 결정. 추측으로 legacy/V1League설계를 참조하지 않음. 최소1worker serialslotroot승인 후만 검증.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-08 | root | 존재하나404원인? | listReviews 공개surface가 TOURNAMENT_KINDS로 제한; 현재상세/쓰기계약 추가대조 필요 |

## Progress Snapshot
- Absolute WT C:/Users/kinso/.codex/worktrees/mdqa-47-league-reviews/matchup-sports-platform; feature fix/mdqa-47-league-reviews; latestorigin/dev1e4da237.
- Originalcheckout own ignored evidence 2026-10-08-heartbeat-0550/report47-before.txt + report47-claimed.txt/png.
- Root actual alpha before: 공개 익명 UI가 표시된 실제 persona, 1280×760. 공개 종료 리그 상세에서 후기 링크 클릭 후 제목은 존재하지만 API404 TOURNAMENT_NOT_FOUND / 대회를 찾을 수 없어요. 실제 재시도 후도 동일. request response와 screenshot은 0550/report47-alpha-*. serving SHA는 UI/허용된 header에서 노출되지 않아 미확인. 로그인 prompt를 E2E 관리자 인증 증거로 사용하지 않음. 데이터 수정 없음.
- Current v1 contract: 상세 및 awards의 후기 작성 입구는 regular_tournament/regular_league를 지원하고 V1TournamentReview FK·confirmed registration이 공통. 과거 거울 draft 봉쇄 주석은 현재 unified schema/route와 불일치. 후기 공개 조회/제출/미작성 목록 3곳만 ALL_COMPETITION_KINDS로 정렬. 공개/삭제/완료/active 팀/owner-manager/duplicate/upload/moderation gates와 awards kind 범위는 유지.
- Actual RED16 FAIL/56 PASS → GREEN72/72, Jest unit inBand, 11.755/10.775s. 첫 Windows discovery 실패는 RED로 계산하지 않으며 tmp/qa/mdqa-47/red.txt 보존, 실제 RED는 red-behavior.txt, GREEN green.txt. DB/runtime 생성 없음.
- Root ratchet baseline은 실제 3개 허용 조회에만 allowed=3와 원인/유지 gate를 명시. 게이트 비활성화/skip 없음. API 문서는 같은 변경으로 동기화.
- Phase: code GREEN / committed type/surface verification and independent backend review pending. PR없음. alpha afterpending. root는 dev/main merge나 Done을 실행하지 않음.
