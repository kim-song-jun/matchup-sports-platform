# Task 20261102: 대회 목록·상세 이미지와 상세 노출 설정
Status: Review
Owner: Codex (단독 순차 작업)
Created: 2026-10-22

## Context
사용자는 대회도 리그와 같은 목록·상세 2장 구성으로 변경하고 상세의 종목 기본 이미지까지 숨길 수 있기를 요청했다.
## Goal
등록/초안 재개/관리자 수정의 이미지 저장 계약과 공개 목록/상세 표시를 일치시키고 dev 대상 PR을 생성한다.
## Original Conditions
- [x] 대회 목록·상세 이미지 2장
- [x] 상세에서 업로드가 없으면 종목 기본 이미지 표시
- [x] 상세 이미지 표시 스위치를 끄면 기본 이미지와 영역/여백까지 제거
- [x] 구현 완료 후 dev 대상 PR 생성 (#2032)
- [x] 별도 #2031(main→dev 이력 동기화) dev 머지 및 alpha 배포 확인 완료
## User Scenarios
운영자는 목록/상세 사진을 각각 올리거나 하나를 공유한다. 상세 표시를 껐다 켜도 사진은 보존된다. 관람자는 숨김 대회에서 제목·정보를 바로 본다.
## Test Scenarios
- Happy: 이미지 2장 저장/재조회, 상세 기본값 true, false 저장·재개·복원
- Edge: 한 장/둘 다 없음, 깨진 원격 이미지 종목 fallback, 완료 대회 상세
- Error: 읽기 전용 관리자·CAS 충돌·업로드/저장 실패 실제 오류 유지
- Mock updates: 관련 admin/presenter 테스트와 MSW response 동기화
## Parallel Work Breakdown
병렬 에이전트 없음. Owned: v1 tournament DTO/service/presenters/schema/migration, web tournament create/info/detail/image helpers 및 관련 테스트/API문서/changeset. Forbidden: 기존 공유 작업트리 WIP, main 승격, seed/reset.
## Acceptance Criteria
- [x] UI A/B/C 제시 후 사용자 A안 승인(2026-10-22)
- [x] DTO→저장→응답→공개 UI 계약 일치
- [x] 관련 테스트/타입 검증 및 diff/debt 검사
- [x] dev PR 생성, CI 상태 기록 (#2032, 61840a809; CI/Copilot 진행)
- [ ] alpha 390/768/1440 실제 QA(배포 후 가능)
## Tech Debt Resolved
기존 커버 단일 업로더와 실제 상세 이미지 미표시 불일치 정리. 기존 홍보 이미지 데이터는 삭제하지 않으며 이전 홍보 커스터마이징 호환 유지.
## Security Notes
기존 관리자 쓰기 권한, expectedVersion CAS, 감사 기록을 재사용. 불리언은 DTO 검증, 이미지 URL 기존 문자열 계약 유지. 새 endpoint 없음.
## Risks & Dependencies
v1_tournaments/V1Tournament에 show_detail_image 기본 true 추가 migration 필요. list_image_url은 기존 컬럼 재사용. alpha 화면 QA는 이 PR 배포 이후 가능.
## Ambiguity Log
A안은 상세 노출 스위치로 확정. 두 장은 리그와 동일한 listImageUrl/coverImageUrl이며 업로드 없는 상세는 종목 그래픽으로 표시한다.
## Progress Snapshot
Base cd901fa68 (#2031 merge), worktree /tmp/teameet-tournament-images, branch feat/tournament-two-images.
Phase 1 contracts: completed. Phase 2 UI: completed. Phase 3 validation/docs completed, PR #2032 생성. #2031 alpha run39705838057 서버 반영·공개 배포 identity 검증 SUCCESS.

## Validation (2026-10-22)
- API unit 185 PASS (admin service, DTO, public detail presenter), schema snapshot 5 PASS.
- Web 4 suites/153 PASS (create→payload/draft hydration, admin CAS+readonly, public open/completed hide/default, two-image resolution).
- API/Web full TypeScript 검사 exit0. API surface 및 Web pattern PASS.
- 임시 PostgreSQL 18.4-beta, localhost:56442에 전체 migration 재생 PASS, Prisma diff No difference detected, 실제 DB integration 1 suite/2 PASS. 사진 두 장/DB default true/숨김·복원/공개 목록·상세/권한·CAS 검증. 생성한 클러스터 종료·제거 확인.
- 배포 binding 계약 7 PASS (현재+이전 manifest 허용, schema/M11/checksum/client mismatch 거절). 최초 jq 부재 실패는 테스트 성공으로 취급하지 않았고 /tmp의 공식 jq 고정 실행파일로 재검증.
- 격리 작업트리 전용 Prisma client 생성. 공유 client와 원본 shared WIP는 수정하지 않음.
- 신규 debt marker 없음, git diff --check PASS. 신규 import는 동일 PR의 tournament-images-field.tsx이며 외부 dependency 변경 없음.
- Phase 1 contracts completed; Phase 2 UI completed; Phase 3 validation/docs completed, PR/CI in_progress.
- Alpha UI QA pending 0/3 (390/768/1440): 신규 이미지 작업 미배포로 after/console/network 미검증. PR 요청 범위는 PR 생성이며 신규 PR dev 머지는 승인받지 않았음. 머지 후 alpha 갤러리 게시 필요. baseline은 아래 후속 증거 참고.

## PR / baseline handoff
- PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2032 (base dev, 최초 head 61840a809). 31파일 scoped commit, committed-tree diff/check PASS, 추적 WIP 없음. 원본 shared tree 보존.
- Copilot review 요청 완료. 최신 head 리뷰/CI 성공 여부는 최종 보고 시 확인하며 clean으로 선판정하지 않는다.
- before alpha: 비로그인 공개 방문자, `/tournaments/aa100000-0000-4000-8000-000000000004`, 390/768/1440 캡처 `/tmp/teameet-tournament-images-before/{390,768,1440}.png` 및 evidence.json. 세 폭 모두 overflow false. 각 폭에서 선재 React hydration error #418 1건과 비로그인 auth/me 401을 관찰. 신규 UI와 무관한 배포 전 기준이며 after PASS로 취급하지 않는다.
- headed Playwright 소유 node PID43405/browser PID43424(PPID43405), 종료 후 두 PID 부재 확인. 임시 캡처 스크립트 제거. local Next 서버/alpha 데이터 쓰기 없음.
- #2031 merge cd901fa688e7226cdcaaa74ea1cd543d5d9cb864, matching CI run39705838073 SUCCESS. Windows 실제 dev worktree synced-dev-20261012를 --ff-only로 동기화 완료. alpha run39705838057 서버 반영·공개 배포 identity 검증 SUCCESS.

- #2031 alpha 실측(2026-10-22T01:50:42Z): landing HTTP200, x-teameet-commit=cd901fa688e7226cdcaaa74ea1cd543d5d9cb864, x-teameet-release=1.11.5-alpha.20261022.gcd901fa688e7. /api/v1/health success, checks.db=true. 신규 이미지 PR #2032는 아직 dev 머지/배포하지 않았으므로 이미지 after QA는 계속 pending.
- PR #2032 최초 code head 61840a809의 Gates PASS, API/Web CI 진행 중. Copilot 요청은 완료했지만 제출된 리뷰가 없어 clean으로 판정하지 않음. 후속 커밋은 이 task의 PR/배포/기준 화면 증거 동기화만 포함한다.

## #2032 배포 요청 — 2026-10-22
- 사용자 dev/alpha 배포 승인 및 Copilot 외부 오류 예외 명시 승인. 최신 head95d0dd865의 Copilot run39708108350은 모델 claude-opus-5 unavailable로 검토 전 실패; clean으로 표시하지 않는다. 예외 PR comment6330899608.
- CI39708104473: Gates/Web PASS, API unit 6852 PASS/1 FAIL(451 suites 중1). read-service 기존 테스트가 regular_tournament에는 listImageUrl이 없어야 한다는 이전 계약을 유지하고 있었다. 구현의 새 응답은 요청한2장 계약대로 필드를 제공한다.
- read-service fixture의 listImageUrl/showDetailImage 기본값을 sync하고, 대회/리그 목록 fallback·대회 상세의 두 원본 URL·표시 true/false를 모두 검증하도록 수정한다. assertion을 제거하거나 오류를 성공 처리하지 않는다.
- after merge: alpha 배포 SHA/health/공개 상세3폭 확인 및 PR 갤러리. 관리자 인증 세션 미확보로 실제 관리자 저장 UI는 별도 제한을 명시한다.

- CI 실패를 RED 증거로 유지하고 read-service suite 재검증 52/52 PASS(단일 worker). git diff --check PASS, 신규 debt marker 없음. 기존 구현/DB/API 계약은 유지하고 읽기 응답 테스트와 fixture만 동기화했다.

## Progress Snapshot — 2026-10-23 후속 회귀 수정

- 원 PR #2032는 2026-10-22T03:07:25Z dev MERGED, head `705871b6b194d2d884e434c0ee08a32d81875442`, merge `c184cff233af2f77a4c2f6842e1d9905fbe10278`. 위의 미머지 기록은 당시 이력이며 현재 상태를 뜻하지 않는다.
- 최신 `origin/dev` `b3cbb4b63cfaa385d7daea1ea16a0258a311901b`에서 후속 작업을 분리했다. Worktree `C:/Users/kinso/.codex/worktrees/tournament-image-contract-followup/matchup-sports-platform`, branch `fix/tournament-image-contract-followup`. 기존 `pr2032-review-fixes` 작업트리의 로컬 회귀 테스트와 수정은 그대로 보존했다. 머지된 원 브랜치에는 push하지 않는다.
- 실제 결함 2건: 전역 HTTP pipe의 implicit Boolean conversion이 문자열 `"false"` 등을 true로 수용함 / 관리자 이미지 미리보기가 표시 이름 대신 영문 종목 코드를 전달해 공용 그래픽을 선택함. 권한 우회나 이미지 URL 비공개 보장 문제로 분류하지 않는다.
- Owned: 대회 DTO와 직접 회귀 spec, 관리자 info-section과 spec, 이 canonical task, API 계약 3문서, 후속 patch Changeset. Forbidden: 공유 계약/정책, main, 다른 작업트리 WIP, DB/seed, tracker 완료 처리. Root가 구현·검증·Git을 소유하며 별도 구현자 외 리뷰어가 immutable head를 검수한다.
- Acceptance: 생성/PATCH에서 JSON true/false와 생략/null을 보존하고 비boolean 값은 해당 필드의 400 검증 오류로 거절한다. 이미지 없는 풋살 대회의 목록·상세 미리보기는 풋살 그래픽을 선택한다. 기존 권한·CAS·업로드 오류와 화면 구조는 유지한다.
- RED: 최신 dev의 실제 HTTP pipe spec 32건 중 12 FAIL/20 PASS. 문자열/숫자/객체가 거절되지 않아 실패했다. 관리자 실제 caller spec은 1 FAIL/20 SKIP, 두 미리보기 모두 풋살 대신 landing-hero 선택으로 실패했다.
- GREEN: raw JSON Transform 2곳과 표시 이름 전달 1곳 수정 후 API 34/34 PASS(생략/null 및 URL 경계 포함), Web info-section 전체 21/21 PASS(단일 worker). 로컬 Next/DB 서버를 띄우지 않았다.
- 검증 로그: QA root의 git 제외 `tmp/qa/mdqa-assigned-monitor/2026-10-23-heartbeat-0442/{api-red,web-red,api-green,web-green}.log`. 앞선 중단된 API 실행은 결과 불명이며 RED/PASS에 합산하지 않았다.
- API/Web TypeScript 검사는 각각 1회 통과했다. 두 lint script의 뒤 단계는 Windows `find.exe` 충돌로 실패한 사실을 남겼다. 게이트 코드는 바꾸지 않고 API는 Git GNU find PATH, Web은 Git Bash ComSpec/PATH로 실제 surface/pattern 검사를 각각 재실행해 통과했다. API 708파일 surface 스캔 및 Web 전체 패턴 검사 통과. 신규 debt marker 없음, diff/check 통과, 신규 외부 import 없음.
- 이 Snapshot 시점에는 PR/독립 리뷰가 진행 중이다. 최신 immutable head 리뷰·후속 PR/CI/머지 및 tracker 상태는 QA root 정본 `tmp/qa/mdqa-assigned-monitor/state.json`의 `resume20261023`과 후속 PR에 기록한다. 전체 열린 dev PR 3/3을 끝까지 조회했으며 동일 후속 수정 PR은 없었다.
- Alpha 현재 서빙 SHA는 `b3cbb4b63cfaa385d7daea1ea16a0258a311901b`, landing HTTP200, 배포 run39768675591 SUCCESS. 이 후속 수정은 미배포다. IAB의 리포트 `/projects/1/`와 Alpha `/my` 모두 로그인 화면으로 이동했다. 신규 리포트 전체 census·상세·선점·댓글 및 관리자 이미지 실제 저장·3폭(390/768/1440) 스크린샷·console/network는 미검증이다. 코드 테스트/원 PR의 공개 QA를 관리자 실측 PASS로 대체하지 않는다.

## Progress Snapshot — PR #2045 명명 리뷰 후속

- 후속 PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2045 (base dev, 최초 head `cc13322e543ffbf6a4f2a1cb86d5310a4750f59f`). 최초 head의 독립 API 5/5·Web/task/Changeset 4/4 리뷰는 FindingsNone, Codex 코드·보안 리뷰도 지적 없이 완료했다. 이후 Copilot이 실제 표시 이름을 받는 `sportCode` prop에 optional/non-blocking 명명 지적을 남겼다: discussion `4356294050`.
- 실제 호출부를 대조했다. `CoverImageCard`와 `TournamentImagesField`는 한글 종목 표시 이름으로 그래픽을 고르며, 등록 화면도 이미 `fallback.sportName`을 전달한다. 두 호출부와 공유 이미지 필드의 내부 prop을 `sportName`으로 통일한다. 실제 종목 코드·API 계약·화면 구조·이미지 선택 동작은 변경하지 않는다.
- 단일 frontend 작업자가 공유 이미지 필드, 관리자 수정 info-section, 등록 new/page의 3파일만 소유한다. Root는 이 task·직렬 검증·Git/PR을 소유한다. 최초 커밋 대비 전체 PR 범위에 공유 이미지 필드와 등록 화면 2경로가 추가되어 총 11경로다. API 파일·공유 hooks/types/MSW·타인 WIP는 수정하지 않는다.
- 이 명명 지적은 별도 런타임 실패가 아니므로 이름 문자열만 검사하는 가짜 RED 테스트를 만들지 않는다. 최초 실제 HTTP/미리보기 RED→GREEN 근거를 보존하고, 등록·수정 실제 caller의 기존 회귀 테스트와 Web 타입/패턴 검사로 prop 변경 연결을 검증한다. 새 head의 검증·독립 재리뷰·CI·스레드 답변 및 resolve 결과는 같은 PR과 QA root SSOT에 이어 기록한다. 최초 head의 리뷰/CI를 새 head 성공으로 간주하지 않는다.
- 명명 수정 후 등록 화면 89건·수정 화면 21건, 총 2 suites/110 tests PASS(최소 worker 직렬). Web TypeScript exit0 및 Git Bash 환경의 기존 Web 패턴 검사 PASS. touched debt marker 없음, diff/check PASS. API와 해당 34건 spec의 blob은 최초 검증 head와 같아 불필요한 API 재실행은 하지 않았다. 로그는 QA root의 git 제외 `tmp/qa/mdqa-assigned-monitor/2026-10-23-heartbeat-0514/`에 보존한다. 이 snapshot 시점 새 커밋의 독립 재리뷰/원격 CI는 대기다.

## Progress Snapshot — 2026-10-24 dev 통합

- 외부 PR #2054가 dev에 머지되어 `origin/dev`가 `6de116392c13b9903321c0c5994cc88691c251cb`로 전진했고, 열린 후속 PR #2045의 GitHub mergeability가 DIRTY로 바뀌었다. 기존 전용 작업트리·브랜치에서 해당 dev를 통합한다. 새 작업·PR을 만들거나 원 PR #2032의 머지된 브랜치에 push하지 않는다.
- 실제 충돌은 `docs/api/README.md` 한 곳이다. 대회 이미지 boolean/종목 기본 이미지 안내와 결과 정정 카드 타임라인 안내를 모두 보존했다. `docs/api/global-contract.md`의 자동 통합도 확인했다. 이 통합에서 후속 수정의 API/화면/회귀 spec 소스는 이전 head `8d72c0bf70349d5e393ecf9cc80b76e5cb1d1c0b`와 동일하다. dev에서 들어온 변경은 해당 부모의 이력을 그대로 유지한다.
- Root 최소 worker 직렬 회귀: 기존 HTTP DTO 34/34, 등록·수정 실제 caller 2 suites/110 tests PASS. 최초 API 실행의 CLI 옵션 오류와 Jest의 Windows `.codex` 경로 glob 탐색 실패는 테스트 미실행이며 RED/PASS에 합산하지 않는다. 같은 matcher에서 경로 구분자 하나만 바꾸면 false→true가 됨을 독립 조사로 확인했고, 원래 `rootDir/src/**/*.spec.ts`를 forward absolute glob으로 실행 인자에 전달해 같은 unit 프로젝트·ts-jest·assertion을 실행했다. 설정·의존성·테스트는 변경하지 않았다.
- API/Web TypeScript 각각 1회 exit0. 전체 suite/build·로컬 Next·DB 서버는 실행하지 않았다. 전용 Task127 plan bundle이 필요한 API 문서 checker는 이번 목차 충돌의 범용 검증기로 사용하지 않는다. 인자 없는 실행 실패를 PASS로 처리하지 않고 양쪽 도메인 링크·본문과 실제 committed diff를 검수한다.
- 증거는 QA root의 git 제외 `tmp/qa/mdqa-assigned-monitor/2026-10-24-heartbeat-1200/`에 보존한다. 새 immutable head에 대한 독립 API/Web 리뷰, 원격 CI 및 Copilot 확인은 대기다. 이전 head의 OK를 이 통합의 OK로 재사용하지 않는다.
- dev 배포 run40091718692 SUCCESS와 공개 landing HTTP200/SHA `6de116392c13b9903321c0c5994cc88691c251cb`, API health success·DB true를 2026-10-24T12:15Z에 확인했다. 이는 외부 dev 배포의 공개 identity/health 근거이며, 아직 미머지인 #2045의 alpha 검증이 아니다. Tracker 프로젝트와 Alpha `/my`는 실제 IAB 로그인 화면으로 이동했다. 최신 리포트 census·상세·선점·진행 댓글 및 관리자 저장 흐름·3폭(390/768/1440) 스크린샷·console/network는 계속 미검증이다.

- 첫 통합 커밋 `6531a054f5e725feceffb24ac1b16a19ab9df091`의 독립 리뷰는 API 5/5·Web/task/Changeset 6/6 FindingsNone이다. 그러나 push 직전 재fetch에서 외부 PR #2053의 2026-10-24T12:23:22Z dev 머지(`a31de2c32df2c37018fe3c542712ec9828093458`, PR head `502d9146265441d9fbb58f3d6ad58c049427c5a0`)를 확인하여 해당 커밋은 아직 push하지 않고 새 dev를 같은 브랜치에 추가 통합한다.
- 두 번째 실제 충돌도 `docs/api/README.md` 한 곳이며 대회 이미지 안내, 종료 경기 명단 정정 안내, 카드 타임라인 안내를 모두 보존했다. 들어온 AGENTS/CLAUDE의 명단 정책 1줄과 canonical flow 결정 이력 변경을 읽었다. 이번 후속 PR의 구현·spec 소스는 계속 이전 `8d72`와 동일하고 공유 정책은 PR diff에 추가하지 않는다.
- 새 base `a31de2c` 기준 같은 API 34건·Web 110건을 최소 worker 직렬로 재검증해 각각 exit0, API/Web TypeScript도 각각 1회 exit0을 확인했다. 추가된 새로운 테스트 수로 중복 합산하지 않는다. 로그·명시 exit 결과는 같은 증거 폴더의 `second-*.log`, `second-validation-results.json`이다. 첫 통합 커밋의 API 표면·Web 패턴 검사도 통과했다. 새 통합 head는 별도 immutable 재리뷰와 원격 CI가 필요하다.
- 위 12:15Z 공개 identity/health는 이제 이전 dev `6de1163`의 역사적 근거다. 새 대상 `a31de2c`의 alpha 배포 run40093721285와 CI40093721309는 이 snapshot 시점 진행 중이며, 배포 완료·공개 SHA·실제 사용자 기능 PASS로 취급하지 않는다.
