# Task 20261038: 리그 보류 공개 복원과 대진 상태 보호

Status: Review
**Owner**: Codex PR #1645 직접 리뷰
**Created**: 2026-10-07

## Context
PR #1645의 보류가 동시 비공개 전환값을 잃거나 기존 대진 생성으로 덮어써진다.
원본 head b43aa3b3692bb3e6aaab38326dc15c5c68f9e64b, 검토 dev 090eddd1352e35274946d07e752f3ce7b4a1b5c3.

## Goal
사용자가 확정한 보류·해제와 공개 설정 복원을 최소 수정으로 보존하고 dev/alpha에서 검증한다.

## Original Conditions (must all be satisfied)
- [ ] 보류 시 리그·경기 공개 숨김, 대진·결과·참가 보존.
- [ ] 해제는 직전 상태·공개 여부 복원, 동시 변경 덮어쓰기 금지.
- [ ] 보류 중 대진 생성·재생성은 명시적 해제 전 상태를 변경하지 않는다.

## User Scenarios
1. 다른 운영자가 비공개로 바꾸는 동안 보류를 요청하면 충돌을 알리고 최신 설정을 보존한다.
2. 보류된 리그의 대진 생성·재생성은 보류 해제를 안내하는 409로 거부한다.

## Test Scenarios
- [x] 실제 서비스 + 상태를 비교하는 저장소 목으로 공개 변경 경쟁 RED → GREEN.
- [x] 생성/재생성 및 계획 중 보류 경쟁에서 대진·상태 쓰기 0.
- [ ] 관련 기존 서비스 회귀, 새 head 일반 CI/DB 통합.
- [ ] alpha 배포 SHA와 로그인 390/768/1440 화면·console/network.

## Parallel Work Breakdown
단일 순차 실행. Owned: 리그 관리자 서비스, 해당 단위 스펙, league-hold.service.spec.ts,
league-hold.integration-spec.ts, docs/api/domains/league-matches.md, 이 task.
Forbidden: 타인 WIP, self PR #1643, main, 무관한 UI 재설계.

## Acceptance Criteria
- [x] 공개 변경 경쟁은 LEAGUE_STATE_CHANGED, 최신 비공개 값 유지.
- [x] 행 잠금 뒤 재조회하여 on_hold이면 LEAGUE_ON_HOLD, fixture 생성/취소 없음.
- [ ] 정식 재리뷰·일반 CI·dev 머지·alpha QA 증거를 별도로 확인.

## Tech Debt Resolved
새 상태 추가 시 기존 대진 생성 쓰기 경로에서 보류가 소실되는 계약 누락을 해소한다.

## Security Notes
공개 복원값 CAS에 isPublic을 포함한다. 인증/관리 권한/파라미터 SQL/감사 기록을 유지한다.

## Risks & Dependencies
로컬 Docker daemon이 없어 실제 PostgreSQL 통합은 새 head CI에서 확인한다.
공유 Prisma client는 수정하지 않고 정확한 head 스키마의 별도 생성물을 검증에 사용한다.
GitHub 이미지 업로드 접근은 기존 대기 상태를 유지하며 갤러리 완료로 표시하지 않는다.

## Ambiguity Log
이미 예약된 리그 알림은 원 PR이 명시한 현행 동작이다. 보류 요청 자체의 대진 비취소 계약과 구분한다.
참가 신청 마감 변경은 수명주기를 바꾸지 않으므로 이 수정에서 정책을 확대하지 않는다.

## Progress Snapshot
- [x] 원본 32/32 committed diff·v1 계약 직접 검토, 정식 수정 요청 리뷰 5440275234 게시.
- [x] 원본 서비스에서 비공개 경쟁/대진 생성 성공 RED 확인(저장소 목, 실제 DB 검증 아님).
- [x] 정확한 원본 스키마 별도 Prisma client + 엄격 타입 설정: 원본 4 fail/45 pass → 수정 49 pass.
- [x] API TypeScript noEmit 통과. 기존 의존성·공유 Prisma 생성물은 변경하지 않음.
- [x] 최신 dev 090eddd를 일반 merge로 반영, 자동 병합된 service/hooks 의미 검토.
- [ ] 최소 수정·committed 검증·일반 push·새 head 재리뷰.
- [ ] CI/dev/alpha/QA/갤러리.
