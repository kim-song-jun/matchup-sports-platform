# Task 20261122: 배정 대회 디렉터 전체 관리

Status: PR #2101 OPEN — user requested PR + before screenshots only; new Alpha QA deferred
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
alpha는 dev 배포 이후에만 변경 검증 가능하다. 사용자가 스크린샷과 PR 게시를 요청했다. PR #2101에서 CI·Copilot 게이트 후 dev 반영과 alpha 검증을 진행한다.

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

## PR / Alpha Flow Follow-up
- PR #2101, head 7fd185dd5. 사용자 제공 Alpha 계정은 메모/로그/증거에 저장하지 않는다.
- 관리자 로그인 → 테스트 전용 대회 → 일반 선수 디렉터 배정 → 마이페이지 담당 목록 → 10개 관리 섹션 → 타 대회/전역 관리 거부 → 배정 해제를 검증한다.
- 배정 안내는 디렉터 관리 화면으로 연결한다. 다른 세션의 배정·해제를 창 복귀와 15초 폴링으로 갱신한다. 추가 web 2파일/20 tests와 web tsc PASS.
- Headed Chrome은 stdin 비에코, 세션 파일 저장 없음. 브라우저 PID/부모 PID를 기록하며 종료 시 소유한 context/browser만 닫는다.
- 새 화면은 미배포 상태이며 alpha 0/10, viewport 0/3. 기존 alpha 관리자 로그인 성공.
## Final Scope — 2026-10-30
- 사용자 선택: **현재는 PR과 변경 전 캡처까지만 정리**. dev 머지/배포 및 신규 관리 화면 QA를 수행하지 않는다.
- PR https://github.com/kim-song-jun/matchup-sports-platform/pull/2101 (base dev). 변경 전 갤러리 코멘트 6516343796.
- 실제 Alpha에서 관리자 → 신규 테스트 4팀 대회 → 첫 디렉터 배정 → 담당 목록 → 운영 보드 → 지원 배정/해제 → 관리자에 의한 디렉터 해제까지 확인했다. 일반 선수·지원 계정 모두 실제 로그인했다.
- 해제 후 지원/디렉터 운영 접근은 403, 디렉터 담당 목록은 items=[]다. 플랫폼 회원 관리도 차단됐다.
- 기준 화면 3/3 폭, 신규 관리 화면은 여전히 0/10 섹션·0/3 폭. 기존 화면을 신규 구현 PASS로 표시하지 않는다.
- 테스트 배정 2건 모두 해제, 신규 테스트 대회 비공개. 파괴적 seed/reset·기존 대회 수정 없음.
- Headed Chrome 2816/Node 26076: context/browser close 후 stdin Node도 종료. 로컬 web/API 서버 없음.
- 비공개 전환 후 기존 운영 화면의 공개 상세 API 404와 일반 제목 fallback을 관측했다. 배포 후 비공개 대회 관리/운영 왕복 QA에서 해결 여부를 확인해야 한다.
- Copilot 공식 요청 REST 201이나 review/run 생성 없음. 최신 head clean 미충족이며 우회하지 않았다. 공통 Gates PASS, API/Web CI는 마지막 관측 시 실행 중.
## Review fixes — 2026-10-30
- 사용자 직접 리뷰 대체 요청 후 자체 리뷰 d5af8d26c에서 P2(수상 추천 API 403), P3(모바일 대회 관리 메뉴 누락)를 확인했고 수정 요청을 받았다.
- P2: 선수 기록 controller를 실제 담당 대회 권한 경로로 연결. 관리자 계정 없는 디렉터 허용과 타 대회 거부를 실제 AdminContextService 사용 테스트로 확인했다.
- P3: 데스크톱에서 구성한 navItems를 모바일 Drawer에도 전달. 메뉴 실제 열기/닫기와 대회 디렉터/리그 디렉터/조회 지원의 링크 범위를 검증했다.
- RED: 담당 대회 기록 조회가 ForbiddenException으로 실패, 모바일 메뉴의 대회 관리 링크 없음. GREEN: API 2 suite/22 tests, Web 1 file/22 tests PASS.
- API/Web tsc PASS. 결과 공식 확정 제한은 수정하지 않는다. 머지/배포 없이 같은 PR에 반영한다.
- 기존 비공개 운영 제목/공개 API 404 문제는 이 두 리뷰 수정의 범위 밖이며 배포 후 QA 잔여 항목이다.