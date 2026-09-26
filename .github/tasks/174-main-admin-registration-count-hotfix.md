# Task 174 — Main Admin Registration Count Hotfix

## Context

운영 공개 목록은 전체 신청에서 확정 14팀·입금 대기 3팀을 집계하지만, 관리자 신청 탭은 최신 20건만 받아 확정 13팀·입금 대기 3팀으로 표시한다.

## Goal

관리자 대회 화면의 신청 목록과 상태별 카운트를 전체 신청 기준으로 맞춘다.

## Original Conditions

- [x] 공개 API의 전체 DB 집계는 유지한다.
- [x] 관리자 신청 API의 cursor pagination을 끝까지 소비한다.
- [x] 안전 상한에 도달하면 조용히 전체처럼 표시하지 않는다.
- [x] `main`의 다른 핫픽스와 `dev`의 대규모 변경을 섞지 않는다.

## User Scenarios

- 운영자가 신청이 20건을 넘는 대회의 신청 탭을 열면 모든 페이지의 신청과 정확한 상태별 카운트를 본다.
- 신청이 안전 상한을 넘으면 일부만 조회됐다는 경고를 본다.

## Test Scenarios

- 한 페이지 응답은 1회 요청으로 완료한다.
- `hasNext`가 있으면 마지막 cursor까지 이어 붙인다.
- 20페이지 안전 상한에서는 `truncated=true`를 반환한다.

## Parallel Work Breakdown

- Frontend only: admin registration query aggregation, warning, regression test.
- Backend/DB/infra: 변경 없음.

## Acceptance Criteria

- 관리자 상태 카운트가 21번째 이후 신청도 포함한다.
- 관련 단위 테스트와 v1_web typecheck가 통과한다.
- 변경은 핫픽스 관련 파일로 제한한다.

## Tech Debt Resolved

- cursor 기반 API를 첫 페이지만 소비하던 부분 조회를 제거한다.

## Security Notes

- 기존 관리자 인증 API만 사용하며 권한과 응답 필드는 변경하지 않는다.

## Risks & Dependencies

- 최대 20회 순차 요청이 가능하지만 대회 정원상 일반적으로 1회이며, 최대 1,000건에서 중단한다.

## Ambiguity Log

- `dev`와 `main`이 크게 분기되어 전체 승격 대신 `origin/main`에 최소 이식한다.
