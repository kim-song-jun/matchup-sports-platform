# Task 20261123: 실제 어드민을 재사용하는 대회 운영 체험

Status: Done
Owner: Codex (single agent)
Created: 2026-10-30
Updated: 2026-11-06

## Context
외부 대회 운영사에 로그인 없는 체험 링크를 제공한다. 기존 독립 5단계 시뮬레이터는 현재
어드민과 메뉴·화면·조작이 달랐다. 2026-11-05 사용자가 A안(실제 어드민 재사용, 데이터만
체험용으로 분리)을 선택했다. 기존 B안의 별도 단계형 UI·역할별 모사 화면 계획은 superseded다.

## Goal
실제 대회 관리 컴포넌트에서 설정·참가 확정·대진 편성·점수 확정을 체험하고, 실제 계정·대회·알림에 영향을 주지 않는다.

## Original Conditions
- [x] 사용자 A안 승인: 실제 메뉴·화면·조작 컴포넌트 재사용.
- [x] 로그인 없는 기존 공유 URL `/tournament-ops-demo` 유지.
- [x] 탭별 독립 저장·새로고침 복원·자기 체험 초기화.
- [x] 실제 API 호출이나 인증 권한 부여 없이 명시적 체험 상태 변경.
- [x] dev PR·CI·머지·Alpha 390/768/1440 검증. Copilot은 사용자 승인 예외를 적용했다.

## User Scenarios
1. 공유 링크로 개요를 열고 실제 어드민과 동일한 11개 섹션을 탐색한다.
2. 대회 정보 편집 모달에서 대회명을 저장한다. 공통 헤더와 재진입 화면에 반영된다.
3. 실제 신청 카드의 확인 모달로 4팀을 확정한다. 대기는 확정과 다른 상태로 저장한다.
4. 실제 대진 마법사에서 4팀 토너먼트(3·4위전 없음)를 미리 보고 생성·배정한다.
5. 실제 칸 상세의 점수 입력·확인 모달로 결과를 확정한다. 결승 연결·통계에 반영된다.
6. 스태프 배정과 운영 보드도 실제 컴포넌트를 사용한다. 실제 회원 초대·알림은 보내지 않는다.

## Test Scenarios
- 실제 11개 관리 섹션 + 현장 화면 2개를 렌더하고 실제 fetch 호출 0 확인.
- 실제 정보 편집, 신청 확정·확인 모달·재마운트 복원, 점수 입력·확인 모달·결승 반영.
- 저장 실패 시 점수·명령 이력을 바꾸지 않고 오류를 표시한다.
- 저장 손상·버전 불일치·알 수 없는 경로·실제 엔티티 ID는 거부한다.
- 공유 실패 시 직접 복사 주소를 제공하고, 초기화는 다른 sessionStorage 키를 보존한다.
- 모델의 대기→확정, 대진 생성·배정·결과·복원과 기존 실제 어드민 훅·셸 회귀를 검증한다.

## Parallel Work Breakdown
서브에이전트 없이 순차 작업.
- [x] Phase 1: 최신 origin/dev `0b7720cb7` 기준 격리 worktree와 실제 화면 의존성 확인.
- [x] Phase 2: 실제 관리 셸·11개 섹션·현장 2개 화면 재사용, 명시적 scoped data source.
- [x] Phase 3: PR·CI·Alpha after 증거와 결과 정리. Copilot clean으로 표기하지 않는다.
- Owned: demo routes/model/provider/tests, 실제 셸의 경로 주입, 해당 화면의 데이터 의존성 주입, QA runner/evidence/changeset.
- Forbidden: 실제 API·DB·인가 변경, 다른 worktree WIP, main 승격.

## Acceptance Criteria
- [x] 실제 컴포넌트를 import해 사용한다. 독립 UI로 외형을 복제하지 않는다.
- [x] 별도 QueryClient와 로컬 source로 실제 로그인 캐시와 분리한다.
- [x] 기본 source는 기존 실제 API다. source 교체는 공개 체험 React subtree 안에서만 일어난다.
- [x] 전역 fetch/MSW interception, 오류 시 실제 API fallback, 실패한 저장의 성공 표시는 없다.
- [x] 저장된 응답 객체를 신뢰하지 않고 검증된 명령 이력을 재생해 복원한다.
- [x] 실제 ID가 포함된 미지원 동작은 오류로 거부한다.
- [x] 최신 head CI 통과, dev 머지, 배포 SHA 확인 및 Alpha after QA. Copilot은 2026-11-06 사용자 승인 예외이며 clean으로 표기하지 않는다.

## Tech Debt Resolved
기존 별도 단계형 UI·스타일·모델·모델 테스트를 제거하고 실제 화면과 현재 체험 계약으로 대체했다.
관리 셸에는 경로만 주입한다. hooks/직접 조회 컴포넌트는 scoped data source를 사용하며 실제 화면의 기본 경로와 인가는 유지한다.
비훅 페이지 추가 조회와 결과 명령 helper도 data source를 명시적으로 전달받는다.
Alpha에서 발견한 팝업 미리보기 iframe의 실제 관리자 조회도 같은 탐색 경계로 차단했다.

## Security Notes
PLATFORM_OPS는 체험 전용 UI의 역할 값이다. 실제 세션·관리자 배정·서버 인증을 만들지 않는다.
로컬 source는 알 수 없는 경로도 실제 서버로 넘기지 않는다. 샘플 명령은 저장에 성공한 뒤에만 메모리에 반영한다.
공유 URL에는 개인 정보·체험 이력을 넣지 않는다. 체험 엔티티의 실제 서비스 링크는 ScopedLink에서 anchor 자체를 만들지 않아
Next prefetch·새 탭 열기까지 막고 비활성 사유를 표시한다. 정책 provider 밖의 실제 화면은 원래 NextLink로 동작한다.

## Risks & Dependencies
체험은 4팀 풋살 토너먼트 범위다. 파일 업로드, 외부 캠페인 발행, 실제 회원 초대, 경기별 출전 명단 조정은 지원하지 않으며 오류로 표시한다.
관리자 전용 팝업 iframe 미리보기는 체험에서 로드하지 않고 제한 사유를 표시한다. 실제 관리자 화면에서는 유지한다.
같은 컴포넌트의 모든 실제 API 기능을 로컬에서 재현하는 것이 아니다. 실제 회원·운영 데이터에는 요청하지 않는다.
기존 v1 단계형 체험 기록은 새 v2 체험으로 이전하지 않는다. 새로고침은 v2 기록을 유지한다.
브라우저 QA는 Alpha에서만 실행한다. 로컬 Next 서버는 시작하지 않았다.

## Ambiguity Log
- 사용자 A안 선택으로 기존 단계별 UI와 역할 모사 계획을 대체했다. 로그인 없는 독립 탭 체험은 유지한다.
- 실제 전역 팝업 관리 본문을 체험의 팝업 섹션에서 재사용해 실서비스 관리 경로로 나가지 않게 한다.
- 실제 어드민의 4팀 대진 마법사·빠른 점수 확정을 사용한다. 별도 라이브 기록 시뮬레이터는 남기지 않는다.

## Progress Snapshot
- Final 2026-11-06: PR #2168·#2170 dev 머지 완료. 최종 Alpha SHA `a8cb59951c4b5d9c0c5f8c661698bd6a81e62867`,
  release `1.13.1-alpha.20261106.ga8cb59951c4b`, deployment run `42153052022` SUCCESS, CI run `42153052017` SUCCESS.
- 익명 headed Chromium에서 실제 정보 수정 → 4팀 확정 → 대진 마법사·배정 → 새로고침 → 점수 확정,
  정상 초기화·손상 기록 차단/복구·다른 저장 키 보존·클립보드 실패 직접 복사 안내 PASS.
- 13/13 화면 × 390/768/1440 = 39/39 viewport PASS, 가로 overflow 0. 추가 점수 확정 캡처를 포함해 after PNG 40장.
- 최종 page/console/network errors 0, 실제 계정·엔티티 API 요청 0. 공통 GET `/api/v1/health` 42회만 관측.
- 실제 미리보기 iframe 없음과 제한 안내를 3폭에서 확인. 소유 Chromium PID 9880 / parent 3528 종료 확인, report cleanup=true.
- Evidence: `docs/screenshots/tournament-admin-demo-20261105/after-report.json`과 `after-*.png`.
- iframe 회귀 RED → GREEN(관리자 미리보기 2 + 링크 2 PASS), WSL 패턴 게이트 PASS.
  넓은 로컬 체험 UI 실행은 기존 설치의 persister 누락으로 수집 실패해 PASS로 계산하지 않았다.
  이후 PR #2170 최신 head `c1aa3f112`의 Gates/API/Web 및 머지 커밋의 전체 CI가 모두 통과했다.
- 저장 공간 실패·변조/실제 ID 거부는 자동화 UI/모델 테스트 증거이며 이번 Alpha에서는 강제 재현하지 않았다.
- Copilot 리뷰 0건, 이번 대회 체험 작업의 기존 사용자 승인 예외를 적용했다. Copilot clean 주장은 하지 않는다.

## Historical verification
- 2026-11-06 Alpha 첫 실측: #2168을 포함한 `408b665a685eba127fda127167954a04b418085e`, 배포 run `42139280720` SUCCESS,
  API DB health=true. 실제 정보 편집·4팀 확정·대진 생성/배정·점수 확정·새로고침·정상/손상 초기화·공유 실패 안내 PASS.
  13개 화면 × 3폭=39/39 overflow 없음. 다만 팝업 미리보기 iframe이 `/admin-content-preview`를 열어 실제 `/admin/me`를 3회 조회했고
  401/console errors 6건으로 QA FAIL. `initial-alpha-report.json`과 `initial-alpha-popups-{390,768,1440}.png`에 실패 증거를 보존한다.
  PR #2170에서 iframe에도 navigation scope를 적용해 실제 관리자 문서 로드를 차단하고 제한 사유를 표시했다.
  회귀 RED: `admin-content-preview.test.tsx`에서 실제 관리자 iframe이 남는 것을 확인(1 failed, 1 passed).
- 2026-11-06: 사용자 요청으로 PR #2168을 dev에 머지했다. Merge SHA `29e256c14ca95ee8f33662a65bf3f9771df72887`.
  PR head `9afd13a30`의 Gates/API/Web CI는 모두 PASS. Copilot 리뷰 0건, 기존 사용자 승인 예외를 적용했다.
  당시 CI는 후속 dev 머지로 취소됐고 Alpha run `42137997922`는 선행 CI 취소로 종료됐다. 최신 dev 배포로 이어갔다.
- Worktree: `_worktrees/tournament-demo-admin-parity`, branch `fix/tournament-demo-admin-parity-20261105`.
- Actual UI tests 19 PASS, model tests 5 PASS, navigation scope tests 2 PASS. 기존 셸·빠른 대진·신청·결과 invalidation 회귀 41 PASS, 운영 보드 회귀 30 PASS(총97).
- tsc PASS. Windows의 POSIX find 호환 문제로 패턴 게이트는 동일 source를 WSL에서 실행해 PASS.
- Alpha before: `0b7720cb7`, 390/768/1440 3/3, page/console errors 0, 가로 overflow 0.
- 최초 구현 시점에는 Alpha after 0/13·0/3이었으며 최종 판정은 위 Progress Snapshot을 따른다.
- Evidence: `docs/screenshots/tournament-admin-demo-20261105/`, runner `scripts/qa/capture-tournament-admin-demo.cjs`.
- QA는 별도 headed Chrome을 사용했고 소유 PID/PPID 및 종료를 JSON report에 기록했다.
- PR #2168: base dev, runtime head `b9c945630`. CI 전체 Web 10,975개 중 운영 보드 테스트 1개가 새 loader 인자(4번째 인자) 계약 미동기화로 실패했다.
  기존 목록 유지·추가 페이지 반영 검증을 유지하며 실제 기본 v1Get 인자를 확인하도록 수정했고 해당30개 PASS. CI 재검증과 Copilot 리뷰 대기.
- 2026-11-06 추가 확인: 샘플 결과가 확정되면 canRevertStart=false로 실제 관리 셸의 역전이 버튼을 잠그고,
  명령 재생 계층에서도 시작 전 되돌리기를 거부한다. 모델5 tests 재검증 PASS. 최종 head CI·Copilot·Alpha 대기.
