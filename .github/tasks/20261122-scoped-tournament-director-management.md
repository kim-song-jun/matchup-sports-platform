# Task 20261122: 배정 대회 디렉터 전체 관리

Status: In Progress — PR #2101 follow-up; local permission changes verified, Alpha QA pending
Owner: Codex (single agent)
Created: 2026-10-30

## Context
디렉터는 운영 콘솔에 접근할 수 있지만 대회 설정·참가·대진 관리는 플랫폼 관리자 전용이다.
작업 기준은 origin/dev d72b59a37이며 기존 공유 작업트리의 WIP는 변경하지 않는다.

## Goal
활성 디렉터가 배정된 대회만 조회하고 해당 대회의 전체 관리 흐름을 사용할 수 있게 한다.

## Original Conditions
- [x] 디렉터에게 배정된 대회만 관리 목록에 표시한다.
- [x] 해당 대회 전체를 관리할 수 있다(2026-11-04 사용자 후속 요청으로 결과 공식 확정·무효화 포함).
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
## 2026-11-04 사용자 후속 요청
Status: In Progress — 기존 PR 작업트리에서 후속 수정, 미배포
- 기존 A안(관리 화면 재사용)과 모바일 Drawer 연결은 유지한다. UI 구조 변경 없음.
- 최신 사용자 요청: 배정된 대회의 모든 수정·운영을 모바일 대회운영에서 허용. 이전 결과 확정·무효화 예외를 이번 요청으로 변경한다.
- 빠른 결과 API는 실제 게임 소속 대회의 활성 배정으로 권한 검사한다. 결과 확정·무효화도 배정된 대회는 플래그와 독립적으로 허용한다.
- 리그 권한, 플랫폼 전역 관리·디렉터 임명 권한, 버전/CAS/멱등·감사·결과 상태 가드는 유지한다.
- 다른 세션의 tournament-staff.service.spec.ts WIP는 수정하지 않는다.
- Alpha 신규 관리 화면 실측은 배포 전이므로 0/10 섹션, 0/3 viewport이며 완료로 판정하지 않는다.

### 후속 검증 기록
- API 변경 관련 4 suite 중 3 suite 83 tests PASS + 빠른 결과 1 suite 32 tests PASS(최종 수정 후). Web 4 files 42 tests PASS. API tsc PASS, diff check PASS.
- DB 통합 시나리오 3파일을 새 계약으로 동기화했으나 DB 환경 미확보로 실행하지 않음. Docker 상태 명령이 응답하지 않아 종료. 서버/DB 변경 없음.
- 사용자 요청으로 추가 수정을 같은 PR #2101에 커밋·push한다. dev 머지·배포는 수행하지 않는다.

- 추가 리그 플래그 회귀 포함 API 최종 116 tests PASS(4 suite 합산). 이번에 추가한 리그 거부·대회 무효화 61 tests suite 재확인 PASS.


## 2026-11-04 PR 재리뷰 · 사용자 요청 로컬 캡처
- 범위: frontend + docs, 기존 PR #2101에 수정·캡처 반영. 별도 중복 PR과 dev 머지/배포 없음.
- 격리 clone `/tmp/teameet-pr2101-review`에서 원본 공유 트리의 다른 WIP를 보존한다.
- P2: 공개 설정 카드가 플랫폼 관리자 capability만 확인하여 일반 디렉터의 버튼이 비활성화됨. 대회 셸에서 검증한 canWrite를 전달하며 공통 카드는 권한 조회를 하지 않는다. 리그 래퍼는 기존 플랫폼 권한을 전달한다.
- P2: 비공개 대회/리그 공개 상세 404 때 제목과 종류를 잃어 대회 전용 관리 메뉴로 잘못 안내할 수 있음. 자기 배정 응답의 제목/종류를 우선 사용한다. 공개 조회 자체 및 하위 운영 화면의 공개 데이터 의존은 남아 있으며 해결 완료로 표시하지 않는다.
- P3: 종류가 undefined인 조회 중 상태에서 리그 디렉터에게 대회 전용 관리 링크가 표시됨. 종류를 알기 전에는 노출하지 않는다.
- UI 구조·레이아웃은 기존 사용자 A안 유지. 신규 디자인 없음. 사용자 명시 요청으로 로컬 캡처를 수행한다(기본 alpha 전용 절차의 이번 요청 예외).
- RED: 셸/게이트 3건 실패, 공개 설정 3건 실패 확인. API 권한·감사·결과 4 suite/115 tests PASS. 최종 웹 회귀·타입 검사·캡처는 계속 진행 중.
- GitHub 최신 dev 4a22824a5와 기존 PR 충돌을 확인. 리뷰 수정 커밋 후 dev 병합으로 해소하고 최종 diff와 검증을 확인한다.
- 로컬 런타임: 설치된 Next 16.2.10, 선언된 16.3.8과 차이 있음. API는 명시적인 테스트 데이터이며 실제 로그인·DB 저장·서버 권한 검증의 증거가 아니다. Docker 연결 불가, 실시간 Socket.IO 연결 및 공개 비공개 상세 404는 로그에 그대로 기록한다.

- 최신 dev 병합의 8개 충돌을 정리했다. 신규 다중 결선·결선별 시상·경기 시간 조회/파생 설정 버전 감사도 담당 대회 권한으로 통합하고, 생성 재시도는 관리자/디렉터 양쪽 이력을 확인한다. 기존 결선 경기 ID·일정 보존 및 리그 경기 복귀 동작을 유지했다.
- 최종 병합 트리: API 9 suite/148 tests PASS(신규 실제 AdminContextService 경유 21개 담당/타 대회/해제 회귀 포함), API/Web tsc PASS. 웹 수정 5 files/65 tests PASS, dev 병합 후 셸 25 tests PASS.
- Prisma 생성물이 최신 dev 스키마보다 오래되어 최초 타입 검사가 실패했다. 공유 node_modules를 수정하지 않고 격리 clone에만 최신 schema로 Prisma Client를 생성한 뒤 재검증했다. DB 스키마 변경·migration·seed 실행 없음.

- 최종 로컬 수동 증거: `docs/screenshots/pr2101-local/README.md`. before6 + after18 = 24장, 390/768/1440 3/3폭·관리 개요/정보 2/10 섹션 렌더. after pageerror0·document overflow0/18. 실제 복귀 링크 클릭과 공개 설정 fixture503 오류 노출 확인. Alpha0/10·0/3/실제DB 저장 미검증은 유지한다.
- API surface/Web pattern PASS. 최종 구현 커밋 5030fd8f9, 증거만 추가하는 후속 커밋으로 PR에 게시한다. 최신 Copilot 리뷰는 요청 후 도착 여부를 별도 확인한다.


## 2026-11-04 CI 확인 후속
- head7c7d076e9 CI: Gates PASS, Web은894파일/10,930 tests 중 `my-tournament-director-list.test.tsx` 1건 실패(893파일/10,929 tests PASS). API의 `V1 migration replay + drift gate` 단계에는 전체 DB integration 실행도 포함되며 마지막 확인 시 진행 중이다.
- 원인: 최신 dev의 `TournamentOpsDemoEntry` 링크2개가 목록에 추가되어 화면 전체 link 개수1을 기대한 기존 회귀와 충돌했다. 실제 담당 대회 필터는 정상이다.
- 수정: 관리 목적지 링크만1개인지 확인하고, 데모 링크2개·실제 담당 대회 목적지·FIELD_OPERATOR/SUPPORT_READONLY/만료 대회 제외를 함께 검사한다. 테스트를 skip하거나 비담당 제외 검증을 제거하지 않았다.
- 검증: CI RED를 근거로 수정 후 담당 목록 관련2파일/10 tests GREEN, diff check PASS. 앱 코드·레이아웃·API 변경은 없어 기존24장 캡처는 그대로 유효하다. 새 head CI 확인은 별도로 진행한다.


## 2026-11-04 API CI 확인 후속
- head1154f643e CI: Gates/Web PASS. API는 마이그레이션 재생·드리프트0 및 DB integration193 suite/1419 tests PASS(기존3 skipped) 후 단위 테스트에서1 suite/3 tests 실패(500 suite/7768 tests PASS).
- 원인: `tournament-sponsors-mutations.service.spec.ts`의 권한 mock이 이전 `getMutationAdmin` 이름을 유지했다. 런타임은 담당 대회 범위의 `getTournamentMutationAdmin`을 사용한다.
- 수정: mock 메서드 이름1줄을 현재 계약으로 동기화. 수정/비활성화의 저장값·감사 기록·타 대회 협찬 거부 assertion은 그대로 유지한다. 런타임 권한 검사·API·화면 변경 없음.
- 검증: 로컬 RED3 확인 후 협찬 관련2 suite/6 tests GREEN, diff check PASS, 새 debt marker0. 기존24장 캡처는 유효하다. 최신 head CI는 push 후 재실행하며 직전 head 결과를 최신 통과로 표시하지 않는다.


## 2026-11-05 최신 dev 충돌 정리 및 초기화 권한 통합
- 사용자 요청: 앞서 설명한 충돌4개·reset 디렉터 권한·회귀 검증·PR/CI 모니터링을 모두 진행한다. 후속 사용자 명시 승인으로 검증 통과 후 리뷰 대기 없이 dev 머지·Alpha 배포까지 수행한다.
- 기준: PR head30443eeb9, 최신 dev0eed744874(#2151). 격리 clone에서 순차 수행한다. 원본 공유 WIP와 다른 작업은 수정하지 않는다.
- Owned: multi-finals 서비스/관련 reset·권한 회귀, API 계약 문서3개 및 scenarios 허브, 기존 task/시나리오, changeset. Forbidden: 전역 관리자 권한 완화, 시작·이벤트·결과 경기 초기화 보호 제거, 실제 사용자 대회 초기화·DB seed/reset, main 승격·프로덕션 배포.
- [x] Phase1: 충돌4개를 양쪽 기능 보존으로 해소. setup editing 인자와 scoped 권한 동시 유지.
- [x] Phase2: 새 reset도 scoped 권한·실제 사용자 감사로 연결. 담당 성공/타 대회·해제·만료·조회 역할 거부 및 초기화 보호 회귀.
- [x] Phase3 로컬 검증: API4 suite/66 tests, API/Web tsc, API surface/Web pattern, 충돌 marker·diff·debt 확인 PASS. 같은 PR에 merge commit을 push한다.
- [ ] Phase4: 최신 head CI 확인 후 dev 머지·Alpha 배포 및 실제 서비스 SHA/health 확인. 사용자 명시 승인으로 Copilot 리뷰 대기를 생략한다. 통과 전 head의 결과를 최신 결과로 대체하지 않는다.
- 범위 내 데이터 변경은 기존 V1Tournament/MatchDetails/Slot/Group/StaffAssignment/OperationAudit 사용이며 새 schema/migration은 필요 없다. 기존 초기화의 잠금·revision·감사·원자성 계약을 유지한다.

- Phase1/2 검증: 실제 권한·감사 헬퍼를 사용하는 reset 테스트에서 RED2 확인(담당 디렉터403 및 scoped gate 미사용). reset을 scoped gate로 연결한 뒤 관련4 suite/66 tests GREEN. 기존 예선/자리 순서·초기화 보호와 관리자 동작을 함께 검증했다.
- 실제 DB 시나리오 추가: 일반 디렉터의 초기화·예선 수정 저장/재조회·실제 사용자/배정 감사, 타 대회·해제 배정 쓰기0, 공식 결과 있는 경기 초기화 차단. 로컬 Docker 접근 불가로 실제 DB 실행은 CI에 맡긴다.
- API/Web tsc 및 surface/pattern PASS. 새 schema/migration·실제 대회 데이터 변경 없음.
- Ambiguity Log: “확인되면 리뷰 없어도 pr alpha에 배포해줘”를 최신 승인으로 적용한다. 이전 미배포 범위를 대체하며 dev 머지→자동 Alpha 배포만 수행한다. main/프로덕션 승격은 금지한다.
- Progress Snapshot: 충돌4개 해소, reset 권한 통합, 로컬 검증 완료. 최신 merge commit CI와 Alpha 배포 증거는 PR 댓글로 남긴다.
