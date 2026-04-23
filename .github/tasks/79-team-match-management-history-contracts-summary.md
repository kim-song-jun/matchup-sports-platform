# Task 79 - Planning Update Summary

Date: 2026-04-23
Related task: [79-team-match-management-history-contracts.md](/D:/dev/projects/matchup-sports/matchup-sports-platform/.github/tasks/79-team-match-management-history-contracts.md)

## Purpose

이 문서는 Task 79 초안 작성 시점에 무엇을 새로 추가했고, 어떤 내용을 보강했는지 빠르게 확인하기 위한 변경 요약이다.

## Added

- 새 canonical task 문서 추가
  - `.github/tasks/79-team-match-management-history-contracts.md`
- 팀매칭 후속 구현 범위를 별도 task로 분리
  - 수정/취소 API 계약
  - 내 팀매칭/팀 경기기록 히스토리 조회
  - 상태 vocabulary 통일
  - 중복 신청/관리 mutation 에러 정규화
  - 문서/MSW/테스트 동기화

## Updated

- Task 79 본문에 `Feature Definition` 섹션 추가
- 이번 구현의 canonical feature name을 고정
  - `Team Match Management / History Contract Closure`
- 포함 범위와 제외 범위를 명시적으로 분리

## What This Task Intends To Change

- Backend
  - `PATCH /team-matches/:id` 추가
  - 수정/취소 권한 및 상태 gate 추가
  - duplicate-apply conflict 정규화
  - history 조회용 status query 확장
- Frontend
  - edit/cancel mutation을 실제 API 계약에 맞춤
  - `/my/team-matches`, `/teams/:id/matches` 조회 범위 수정
  - `matched` drift 제거 및 상태 badge/copy 통일
- Docs and Tests
  - `docs/api/domains/team-matches.md` sync
  - `docs/scenarios/05-team-match-flows.md` sync
  - `tests/ui-scenarios/scenarios/06-team-matches.md` sync
  - MSW / integration / browser smoke 범위 보강

## Files Created In This Planning Pass

- `.github/tasks/79-team-match-management-history-contracts.md`
- `.github/tasks/79-team-match-management-history-contracts-summary.md`

## Files Modified In This Planning Pass

- `.github/tasks/79-team-match-management-history-contracts.md`
  - 기능 정의 섹션 추가
  - 포함 범위 / 제외 범위 명시

