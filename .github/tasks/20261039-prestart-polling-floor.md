# Task 20261039: 시작 전 공개 경기 폴링 하한 보존

Status: Review
**Owner**: Codex PR #1646 직접 리뷰
**Created**: 2026-10-07

## Context
PR #1646 원본 2e190efa의 창 직전 countdown이 1~9,999ms를 반환해 문서의 10초 하한을 우회한다.

## Goal
시작 전 자동 갱신을 유지하면서 공개 조회의 최소 10초 간격을 모든 소비 훅에 적용한다.

## Original Conditions (must all be satisfied)
- [x] 예정·진행 경기 자동 갱신과 종료/취소/시간 미정 중단 계약 유지.
- [x] 창 직전 1ms/1초/9,999ms도 하한 보존.

## User Scenarios
킥오프 전에 연 경기 상세·리그 기록·대진표가 상태 전환을 스스로 발견한다.

## Test Scenarios
- [x] 창 직전 helper/여러 경기 경계 RED → GREEN.
- [x] 실제 QueryClient와 3개 훅이 올바른 API 경로로 10초 후 예정 → 진행을 갱신.
- [x] 원본 명단/API 단위 105건·웹 23건 통과 확인.

## Parallel Work Breakdown
단일 순차 실행. Owned: public-live-polling.ts/test, prestart-polling-hooks.test.tsx,
docs/api/domains/public-records.md, 이 task. Forbidden: 타인 WIP, self PR #1643, main.

## Acceptance Criteria
- [x] 모든 양의 폴링 간격은 10초 이상·idle 재확인은 15분 이하.
- [ ] 정식 재리뷰·새 head CI·dev 머지·alpha 실제 QA를 각각 확인.

## Tech Debt Resolved
공유 주기의 하한을 countdown에도 적용하고 실제 소비 훅 회귀를 보강한다.

## Security Notes
공개 조회 부하 모델 유지. roster 권한·개인정보값 노출·프로필 인증 계약 변경 없음.

## Risks & Dependencies
가짜 시계의 훅 검증은 alpha 실제 시각/상태 전환 QA를 대신하지 않는다.
갤러리 업로드의 기존 접근 대기는 유지하며 완료로 표시하지 않는다.

## Ambiguity Log
폴링 창 시작 직전에는 하한 보존으로 첫 재확인이 창 시작보다 최대 10초 늦어질 수 있다.

## Progress Snapshot
- [x] 11/11 committed diff·v1 계약 직접 리뷰, 수정 요청 5440571952 게시.
- [x] 최신 origin/dev e9686069를 일반 merge 7577cb945로 반영, 공유 훅/API 문서 의미 검토.
- [x] 정확한 committed 원본 helper에서 경계 3 fail/8 pass → 수정 웹 29 pass, Web TypeScript 통과.
- [x] 최신 dev 스키마의 별도 Prisma client로 API 선수 서비스 105 pass 재확인(공유 생성물 변경 없음).
- [ ] 경계 수정·committed 검증·일반 push·새 SHA 재리뷰.
- [ ] CI/dev/alpha/QA/갤러리.
