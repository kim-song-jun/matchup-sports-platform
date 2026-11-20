# Task 20261136: 회원·팀 운영 정보와 회원 대리 접속

## 2026-11-20 Alpha 실측 재개 — “너가 전부 확인해줘”

- 범위: 회원 목록/상세, 팀 목록/상세, 회원 조회 중 홈/채팅의 6개 화면 ×390/768/1440 =18개 화면·폭 조합. 배포 전 관리자4화면×3폭은 캡처했으며 변경 후 검증은 아직 0/18이다.
- PR #2447 최종 head `775cb4fd3`: API/Web/Gates/security PASS. API 로그에서 PostgreSQL212파일/1624 PASS(기존3 SKIP), 단위562파일/9391 PASS와 신규 알림 설정 무변경 통합 파일 PASS를 직접 확인했다.
- dev 머지 `f5f1a21fe`. 해당 Alpha workflow run44688579922는 success지만 후속 dev 머지 때문에 SSM 활성화와 공개 release 검증은 **skipped**다. workflow success를 실제 배포 완료로 해석하지 않는다.
- 후속 dev `caa0f5d82`(#2465), 현재 최신 dev `e8385cf331a2094ba0b93db15cf11ff824a791bd`(#2461)에 회원 조회 controller/service/export/global guard가 보존돼 있음을 확인했다. 최신 CI44692078486 및 Alpha44692078647 실행 중.
- 공개 `/landing`의 실제 `x-teameet-commit`은 아직 `f9bb65921ef72d90dbf6c3d27ac4efacd82b2631`, release `1.21.2-alpha.20261120.gf9bb65921ef7`이다. 현재 `/admin/member-access` 404는 신규 코드 미반영의 근거이며 기능 합격으로 처리하지 않는다.
- 현재 Alpha health200/db=true, 익명 개발 헤더의 관리자 접근401을 확인했다. Ego space3/page p1에서 실제 관리자 로그인은 유지 중이며 이메일 방식만 연결돼 있다. lastLoginAt `2026-11-19T13:59:55.694Z`; 새로운 조회 시작은 배포 후 실제 클릭 결과로 확인한다. 비밀번호 추측·시크릿/.env 조회·세션 위조·최근 로그인 우회는 하지 않는다.
- 기존 구현 검토 worktree/로컬 branch는 dev 병합 확인 후 정리했다. 새 QA 소유 worktree `_worktrees/pr2447-alpha-qa`, branch `qa/pr2447-alpha-evidence-20261120`에 증거와 결과를 기록한다. 다른 세션의 worktree 및 원 feature branch는 보존한다.
- [ ] 최신 release header/실제 신규 API/버튼을 확인하고 관리자4화면의 데이터·이동·필터·운영 섹션·3폭·console/network를 실측한다.
- [ ] 회원 조회 시작, 채팅 차단, 무변경, 만료·복귀와 다른 탭을 실제 가능한 인증 범위에서 검증한다. 인증이 실제로 막히면 해당 항목/개수와 에러를 기록한다.
- [ ] 결과/갤러리를 같은 PR에 연결하고 cleanup과 잔여 blocker를 기록한다.

## 2026-11-20 후속 구현 — 사용자 승인 범위

- 사용자 “그렇게 해보자”: 일반 채팅 유지, 회원 조회 중 채팅 접근 차단, 알림 설정 조회의 저장 제거로 확정.
- [x] Phase 1: 전역 guard의 채팅 API 차단(대소문자 포함), 실제 ChatController/ChatService HTTP 회귀와 일반 세션 보존.
- [x] Phase 2: 채팅 layout 상태 gate, 홈 채팅 제한 안내, 알림 GET의 저장 없는 기본값, 조회 중 컨택 요약의 lazy 쓰기 제거.
- [x] Phase 3: 최신 dev `f9bb65921` 통합, 시나리오 충돌 양쪽 보존. API RED→GREEN/웹 회귀 및 API/Web 타입·규칙 검증.
- [ ] Phase 4: PR #2447 새 head CI/PostgreSQL/리뷰 확인, dev 머지 및 Alpha 실측.
- [ ] Phase 5: Alpha 결과 문서와 소유 자원 정리. main 승격은 실행하지 않는다.
- 실제 채팅 GET→lazy contact 쓰기 경로를 연결한 RED 후 GREEN 확인. API 첫 2개 파일100/100, 컨택 추가 후 관련3개 파일84/84. 웹5개 파일16/16 및 홈 추가3/3. 중복 테스트 수는 합산하지 않는다.
- 현재 Windows Node24.15.0, 프로젝트 CI Node22.23.5. 로컬 타입 검사는 통과했으며 POSIX find/grep 부재로 실패한 규칙 검사만 Git usr/bin 경로로 재실행하여 API surface·웹 pattern PASS. PostgreSQL 추가 회귀는 CI에 등록했다.
- 관련 GET 추가 점검에서 `GET /me/team-contacts/summary`의 만료/채팅방 보관 쓰기도 발견: 회원 조회 컨텍스트에서만 저장을 생략하고 만료 시각으로 같은 요약을 계산한다. 일반 호출의 정리 동작은 유지한다.
- Owned: PR #2447 admin/auth/notifications/team-contacts 서비스·회귀, 채팅 layout/홈 조회 안내, 관련 계약/시나리오/작업 문서. 다른 세션 파일은 변경하지 않는다.

## 2026-11-20 배포 준비 재검토

- 사용자 요청: PR #2447 배포 준비와 즉시 진행 가능 여부 판단.
- 검토 head `8e6bf99ca`, 최신 fetch dev `a45642e4a`. GitHub Gates/API/Web/security check 성공을 직접 확인. Build images/Deploy는 skipped.
- **NO-GO**: GET 허용만으로 조회 전용을 보장하지 않는다. 실제 채팅 GET은 lazy 컨택 만료/방 보관, 참가·열람 경계 저장, 입장 system message 생성·전달을 실행할 수 있다. 알림 설정 GET도 upsert한다. 기존 probe HTTP 테스트가 이 실제 서비스 부작용을 검증하지 않는다.
- GitHub `mergeable=false/dirty`; merge-tree로 `docs/scenarios/index.md` 충돌 확인. 리뷰/리뷰 댓글은 API 기준 0건.
- 기존 Ego Lite 로그인으로 Alpha 회원 검색→테스트 회원 상세 클릭 확인, 390/768/1440 baseline 캡처. 변경 후 4화면 QA와 신원 전환은 여전히 0/4이며 새 기능 PASS를 주장하지 않는다.
- 상세 근거·수정 수용 조건·배포/QA 순서: `docs/ops/pr2447-deployment-readiness.md`.
- 현재 배포 보류. 기존 PR/branch 수정이나 dev/main 머지 없이 검토 branch에 문서만 기록한다. 원 작업 및 다른 세션 자원은 보존한다.

Status: Review
Owner: Codex (단일 세션)
Created: 2026-11-19

## Context
회원·팀 관리의 기본 조회는 있으나 상태 변경 이력, 관련 문의·신고, 참가 활동, 팀 검색 조건이 부족하다. 삭제 상태와 최종 삭제의 의미도 구분되지 않는다.

## Goal
회원·팀 상세에서 운영 판단에 필요한 실제 정보를 확인하고, 감사 가능한 회원 대리 접속을 제공한다.

## Original Conditions
- [x] 사용자 요청: 기존 검토에서 제시한 개선 항목 전체 진행.
- [x] 회원·팀 상태 변경 이력(사유·처리자·시간), 관련 문의·신고와 결과 연결.
- [x] 회원 가입 미완료 항목, 참가 경기·대회·리그 이력, 탈퇴 예정일.
- [x] 팀 지역 표시, 종목·지역 필터, 팀장 검색, 주최·참가 경기와 예정 경기.
- [x] 팀장 상태, 가입 신청 대기 인원, 실제 최근 활동일.
- [x] 삭제 상태와 최종 삭제 구분, 최종 삭제 버튼 조건 수정.
- [x] 팀 경기 링크와 신뢰 정보 한글·표본 설명.
- [x] 사용자 추가 요청: 해당 회원 계정으로 접근하는 관리자 기능.

## User Scenarios
1. 운영자가 회원 상세에서 가입이 막힌 원인과 처리 이력을 확인한다.
2. 운영자가 팀을 종목·지역·팀장으로 찾아 참가/주최 일정과 신고를 확인한다.
3. 운영자가 사유를 입력하고 회원으로 접속했다가 관리자 화면으로 돌아온다.

## Test Scenarios
- 권한 없는 사용자 및 허용하지 않은 관리자 등급 거부.
- 대상별 로그 격리, 문의 작성자/신고 대상의 구분, 실제 참가 자료와 주최 자료 구분.
- 팀 검색과 상태 facet, 안정적인 페이지 정렬.
- 삭제 상태만 바뀐 계정의 최종 삭제 가능, 최종 삭제된 계정 복구 불가.
- 대리 접속 서명·만료·권한 회수·계정 상태·세션 epoch 확인, 시작/종료 감사 기록 및 원계정 복귀.
- 선택된 대리 접속 범위에 따른 HTTP/Socket 차단 회귀.
- 관련 fixtures/MSW/API 문서와 UI 테스트 동기화.

## Parallel Work Breakdown
병렬 에이전트 사용 안 함. 순서: API → UI → 자체 리뷰·검증 → PR·dev → alpha.
Owned: v1 admin·auth 관련 구현, 회원/팀 화면 및 공유 구성요소, types/hooks/MSW, 관련 테스트·API 문서·changeset·시나리오.
Forbidden: 운영 승격, 실제 회원 데이터 변경, 비밀값 출력, 다른 세션 worktree 변경.

## Acceptance Criteria
- [x] UI A/B/C 비교 → 사용자 전체 구현 재지시 반영(A안) → 화면 구현.
- [ ] 모든 Original Conditions 충족, 데이터가 없거나 실패하면 정확한 상태 표시.
- [x] 권한·데이터·UI 회귀 테스트 및 변경 범위 타입 검사.
- [x] API 문서와 mocks 동기화, 신규 부채 없음.
- [ ] 최신 커밋 기준 자체 리뷰, Copilot/CI 확인 후 dev PR 머지.
- [ ] ego-lite alpha 390/768/1440 실측·console/network·전후 증거, PR 갤러리.
- [ ] 이번 작업 소유 자원 정리.

## Tech Debt Resolved
- 회원 탈퇴 요청 조회를 targetId로 제한해 행위자 관계와 대상 이력을 혼동하지 않도록 보강.
- 팀 목록에 id 보조 정렬을 추가해 생성 시각이 같은 행의 페이지 순서를 고정.
- 삭제 상태/최종 삭제 UI 구분, 신뢰 상태 한글 표시, 팀장·경기 관리자 이동 경로를 구현했다.
- 팀 상세의 중복 최근 경기 블록을 전체 이력으로 통합하고 font-size baseline을 14→11로 낮췄다.

## Security Notes
기존 AdminContextService·V1AuthGuard 계약 유지. 사용자가 추천안 제시 후 전체 구현과 PR 반영을 재지시하여 A안(기존 화면 확장), 조회 전용 대리 접속으로 진행한다. 대상 비밀번호를 조회하거나 일반 로그인 세션을 위조하지 않는다. 감사 로그를 필수로 남긴다.

## Risks & Dependencies
- ego-lite 도구/스킬이 현재 세션에 노출되지 않음. Alpha 실제 로그인 검증 경로 확보 필요.
- worktree는 도구로 생성 후 쓰기 허용된 /tmp/teameet-admin-member-team-operations로 이동.
- 의존성 설치와 GitHub 접근은 해결했다. 신규 실제 DB 통합과 원격 CI·Copilot 검토는 PR에서 확인한다.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-11-19 | UI 구성 | 3안·추천 제시 후 사용자 전체 진행 재지시: 추천 A안으로 구현 |
| 2026-11-19 | 계정으로 접근 의미와 범위 | 사용자 전체 구현 재지시를 반영해 권한을 넓히지 않는 조회 전용으로 진행 |

## Progress Snapshot
- base origin/dev 07e51596e, branch feat/admin-member-team-operations, PR #2447(dev). 최초 API 기반 커밋63928b739 및 범위 문서469f5b757 이후 전체 구현을 같은 PR에 추가한다. 현재 원격 dev의 추가 변경은 배포 보안/탐색 테스트 주석으로 담당 파일과 겹치지 않는다.
- Phase 1(API)·Phase 2(UI/조회 전용 대리 접속) 구현 완료. 팀·회원 목록/상세 4/4 화면과 전역 안내/복귀를 구현했다. 추천안을 제시한 후 사용자 “진행해서 pr 올려줘” 지시에 따라 A안·조회 전용으로 진행했으며 권한을 일반 쓰기까지 넓히지 않았다.
- Phase 3: 로컬 검증 완료 후 전체 변경을 PR에 push하고 CI·독립 리뷰 결과 확인. 이번 사용자 요청의 산출물은 PR이며 dev/main 머지를 실행하지 않는다.
- 최종 API 관련 355/355 및 API 타입 검사 통과. 웹 관련 12개 파일77/77 및 웹 타입/규칙 검사 통과. 웹 타입에서 링크 값을 허용하지 않던 AdminDetailRow를 ReactNode로 확장했다. API surface·웹 pattern PASS. 홈 Provider 테스트의 act 경고는 기록하며 브라우저 console 합격 근거로 쓰지 않는다.
- 실제 PostgreSQL 통합 3개를 test/admin-member-access.integration-spec.ts에 추가했다. 로컬 DB가 없어 미실행이다. 현재 CI의 일반 unit 성공만으로 이 PostgreSQL 통합 3개 실행을 주장하지 않으며, 별도 DB 실행 증거가 필요하다.
- Node22.23.1은 요구 >=22.23.5보다 낮아 경고 발생. 의존성은 기존 pnpm store에서 offline/frozen 설치했고 Prisma는 작업 전용 /tmp 캐시로 생성했다. proof-token 테스트는 명시적 테스트용 secret으로 실행했다(실제 .env/비밀값 조회 없음).
- Alpha 실제 브라우저 QA 0/4, viewport 0/3(390/768/1440): ego-lite 도구/스킬이 현재 세션에 없어 미실행. 로컬 next/다른 browser-use로 대체하지 않았다. PR에 미검증과 머지 후 갤러리 절차를 명시한다.
- API 문서 README/global-contract/admin-and-ops, Changeset, 타입/조회 훅/MSW와 시나리오 허브를 동기화했다. 새로운 schema/migration, 운영 데이터 변경, dev/main 머지 없음.
- 작업 소유 worktree /tmp/teameet-admin-member-team-operations는 미병합 변경이 있어 보존한다. 테스트 HTTP 앱은 종료 시 닫으며 임시 실행 서버를 남기지 않는다.

## 구현 세부
- 운영 상세는 기본 요약과 상태 이력/문의/예정/개인 참가/팀 경기/대회·리그 명단/공식 출전(회원만)의 독립 10개 페이지다. 실패/재시도와 기록 부재를 구분한다.
- 팀 필터는 local draft에 합쳐 URL·페이지 초기화·상세 왕복을 보존한다. 삭제 상태와 최종 삭제 버튼을 구분하고 팀장·경기 관리자 링크 및 신뢰 상태 설명을 제공한다.
- 대리 접속은 원래 관리자 쿠키를 유지한다. 10분 signed grant, append-only 시작/종료 감사, 원래 세션 결합·양쪽 epoch·현재 권한·종료 상태를 매 요청 검사한다. 전역 쓰기/운영 경로/인증 발급/Socket.IO를 차단한다.
- grant 만료 시 silent admin fallback을 막는 marker는 원래 세션 최대 수명7일 동안 유지한다. 상태 안내·원계정 복귀·개인화 캐시 정리·다른 탭 신원 동기화를 구현했다. 종료 감사 저장 실패를 성공으로 바꾸지 않는다.
- 별도 schema/migration 없이 기존 감사 로그의 start grant와 end 이벤트를 사용한다. 만료 유효 시각은 expiresAt이며 다음 확인 때 end 이벤트를 남긴다.


## 2026-11-19 리뷰 지적 3건 보완
- 기준 head: 4c4e38f4b. 사용자 “수정하고 올려줘”에 따라 같은 PR #2447에서 수정한다.
- [x] API CI 인증 회귀: headers가 없는 기존 요청 어댑터에서 새 쿠키 검사가 TypeError를 던졌다. cookie collection을 선택적으로 읽으며, 개발 헤더는 production에서 계속 거부한다.
- [x] 상태 모달: deleted/withdrawal_pending처럼 선택지에 없는 현재 상태 대신 실제 표시되는 첫 유효 선택값으로 초기화한다. 선택지가 없거나 유효하지 않으면 제출을 막는다.
- [x] 복귀 충돌: 직접 복귀가 진행 중이거나 성공한 경우 상태 감시/다른 탭 이벤트가 서버 returnPath를 덮지 않는다. 외부 종료 복귀도 한 번만 실행하고 오래된 hint를 정리한다.
- [x] 회귀 테스트: 쿠키 헤더 컬렉션 없는 요청 4개, 상태 모달 4개, 회원 조회 시작/정상 복귀/다른 탭 종료 성공 경로 3개를 보강했다.
- RED: 기존 API 인증 3개+신규 최소 요청 4개=7/42 실패, UI 상태/복귀 4/10 실패를 수정 전 확인했다. GREEN: 동일 API42/42와 UI10/10 통과.
- [x] 기존 HTTP 권한/쓰기 차단 9/9, API 인증/기존 대회 관리자42/42, 회원·팀 화면/신원 전환/모달54/54 통과. API·웹 타입 및 surface/pattern 검사 PASS. touched source의 TODO/FIXME/HACK/XXX 신규 marker 없음, diff check PASS.
- [ ] 수정 커밋 push 후 최신 head CI 결과 확인. 기존 head의 API CI3실패를 최신 head의 통과로 대체 확인해야 한다.
- 범위: API 내부 요청 해석과 기존 UI 로직만 수정. 새 route/payload·schema/migration·레이아웃 변경 없음. Alpha 실화면/ego-lite 미노출 한계는 유지한다.

- 최신 dev e966e27b3f를 PR 브랜치에 통합: 충돌은 docs/api/global-contract.md와 docs/scenarios/index.md의 추가 문단 두 곳으로, 양쪽 내용을 보존해 해결했다. dev/main 자체에는 merge하지 않았다.
