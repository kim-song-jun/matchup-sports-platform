# Task 20261122: 배정 대회 디렉터 전체 관리

Status: Review — local checks passed; alpha verification pending
Owner: Codex (single agent)
Created: 2026-10-30

## Context
디렉터는 운영 콘솔에 접근할 수 있지만 대회 설정·참가·대진 관리는 플랫폼 관리자 전용이다.
작업 기준은 origin/dev d72b59a37이며 기존 공유 작업트리의 WIP는 변경하지 않는다.

## Goal
활성 디렉터가 배정된 대회만 조회하고 해당 대회의 전체 관리 흐름을 사용할 수 있게 한다.

## Original Conditions
- [x] 디렉터에게 배정된 대회만 관리 목록에 표시한다.
- [x] 해당 대회 전체를 관리할 수 있다(결과 공식 확정·무효화는 사용자 선택으로 기존 제한 유지).
- [x] 다른 대회와 플랫폼 전역 관리 권한을 부여하지 않는다.

## User Scenarios
1. 디렉터가 담당 대회를 열어 설정·참가팀·선수·대진·공지·결과·스태프를 관리한다.
2. 타 대회 ID나 그 대회의 하위 리소스 ID로 접근하면 서버가 거부한다.
3. 해제·만료된 배정은 관리 권한을 잃는다.

## Test Scenarios
- [x] 활성 디렉터의 담당 대회 조회·변경(단위 계약 검증).
- [x] 타 대회, 만료, 해제, 비활성 계정, 다른 스태프 역할 거부.
- [x] 관리자 기존 권한과 support 읽기 전용 유지.
- [x] 디렉터 조작의 사용자·대회·배정 감사 추적.
- [ ] 담당 목록 → 관리 → 운영 이동 및 오류 흐름.
- Mock data: 관련 서비스와 화면 테스트의 계약 동기화. 스키마 변경이 필요하면 migration 동반.

## Parallel Work Breakdown
서브에이전트 없이 순차 수행한다.
- Phase 1 (completed): 권한·감사·범위 API 계약 구현.
- Phase 2 (completed): 사용자 A안 선택 후 기존 10개 섹션 재사용 및 진입 연결.
- Phase 3 (in_progress): 좁은 회귀 검증, 리뷰, 문서·changeset 동기화, alpha 검증 가능 여부 기록.
Owned: v1 대회 관리 권한·관련 화면 및 해당 API 문서/테스트.
Forbidden: 다른 세션 WIP, main 승격, 운영 DB 직접 변경.

## Acceptance Criteria
- [ ] 원본 조건과 위 시나리오 충족.
- [x] API는 하위 리소스의 실제 대회를 확인한다.
- [x] 기능·권한 회귀 테스트 및 diff check 통과.
- [x] UI 3안 제시 → 사용자 선택 → 구현 순서를 따른다.
- [x] alpha 수동 검증 결과 또는 정확한 blocker를 기록한다.
- [ ] Critical/Warning 발견 사항 해결.

## Tech Debt Resolved
- 대회 운영 권한과 관리자 대회 관리 권한의 단절을 해소했다.
- 디렉터 감사 로그를 대진 요청 재시도·결선 배정·선출 심사 이력과 함께 읽어 기존 상태·멱등성 보호를 유지했다.
- 대진 초안 저장도 변경과 감사 기록을 같은 트랜잭션에 남긴다.

## Security Notes
일반 관리자 계정을 만들거나 전역 관리자 게이트를 완화하지 않는다. 디렉터의 실제 배정과 대회 소유권을 확인한다.

## Risks & Dependencies
관리자 전용 감사 로그는 admin FK를 요구하므로 디렉터는 실제 사용자 신원으로 별도 운영 감사에 기록해야 한다.
alpha는 dev 배포 이후에만 변경 검증 가능하다. 현재 커밋·push·머지는 요청되지 않았다.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-10-30 | 전체 대회만 표시의 범위 | 관리 화면의 목록·권한 범위이며 일반 사용자 공개 대회 탐색은 유지 |
| 2026-10-30 | 관리 UI 구조 | 사용자 A안(기존 대회 상세 재사용) 선택 |
| 2026-10-30 | 결과 공식 확정·무효화의 별도 플래그 | 자동 승인 검토가 제한 제거를 거부. 사용자 명시 선택: 기존 제한 유지. 해당 보안 게이트와 거부 감사 코드는 변경하지 않음 |
| 2026-10-30 | 전역 팝업 편집 | 대회별 UI 링크지만 실제 권한/저장 API는 플랫폼 전역이므로 디렉터 메뉴에서 제외. 전역 관리자 권한을 부여하지 않음 |

## Progress Snapshot
- Phase 3 로컬 검증 종료, alpha 수동 QA 대기. 최신 dev 작업트리 `_worktrees/scoped-tournament-director`, branch `feat/scoped-tournament-director`.
- 기본 sandbox exec 초기화 실패. 승인된 require_escalated 읽기 명령으로 진행 가능.
- 프론트 관련 8개 파일/63개 테스트 PASS. API 관련 25개 suite를 순차 검증하고 발견한 계약/fixture 회귀를 모두 수정했다. 목록 서비스 RED는 실제 scope 누락을 잡았으며 필터 수정 후 GREEN을 확인했다.
- API/Web tsc PASS. API surface check PASS, Web pattern check PASS. Windows 기본 find/cmd의 POSIX 호환 오류는 검증 프로세스에만 Git 유틸리티/Git Bash를 지정해 해결했다. 저장소/사용자 셸 설정은 변경하지 않았다.
- 변경 파일 Tech-Debt marker 0. `git diff --check` PASS. 새 import/route 의존성은 같은 작업트리에 포함했다. 커밋·push·PR·배포는 수행하지 않아 committed-tree/PR-ready 판정은 하지 않는다.
- 시나리오 허브: `docs/scenarios/scoped-tournament-director-management.md`. 미배포이므로 alpha 0/10 섹션, 0/3 viewport.
