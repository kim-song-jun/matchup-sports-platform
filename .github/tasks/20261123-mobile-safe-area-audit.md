# Task 20261123: 사용자 모바일 안전 영역 전면 검수

Status: In Progress
**Owner**: Codex main
**Created**: 2026-11-03

## Context
Android WebView 로그인, 작성 취소 모달, 대회 필터의 하단 가림 제보. iOS 앱과 모바일 웹의 동작도 함께 확인한다. 기준 Alpha `fbf6fb9b139e0be49955103be867a900a55b5879` (2026-11-03 조회).

## Goal
사용자용 모바일 경로와 관련 상태를 빠짐없이 기록하고 Android WebView, iOS WKWebView, 모바일 웹의 안전 영역·스크롤·키보드 가림을 검수해 확인된 결함을 수정하고 Alpha에 반영한다.

## Original Conditions
- [ ] 제보한 로그인·팀 생성 확인창·대회 필터를 재현하고 수정 전후 확인한다.
- [ ] 모든 사용자용 모바일 화면의 경로 및 상태를 정하고 누락 없이 검수한다.
- [ ] Android 앱, iOS 앱, 일반 모바일 웹 결과를 분리한다.
- [ ] 확인된 범위의 결함을 검증 후 dev PR·Alpha에 반영한다.

## User Scenarios
사용자가 각 모바일 경로에서 화면 끝까지 읽고 필드·버튼을 시스템 영역에 가려짐 없이 조작하며, 긴 시트와 키보드 열린 폼도 사용할 수 있다.

## Test Scenarios
- [ ] Android 3버튼·제스처, iOS 앱, Android Chrome·iOS Safari에서 각각 일반·스크롤 끝·시트·모달·입력 키보드 확인.
- [ ] 화면 높이가 작은 경우 및 확대된 글자에서 고정 CTA·마지막 항목 확인.
- [ ] 인증·역할·데이터 필요 경로는 정상 진입한 실제 상태를 확인하고 불가능한 항목은 미검증으로 기록.
- [ ] 회귀 테스트는 실제 가시·터치·스크롤 계약을 검증하며 부하 작업은 최소 worker로 직렬 실행.

## Parallel Work Breakdown
- Main only: 범위 산정·실제 Alpha 관찰·공통 화면 수정·검증·PR·Alpha. 사용자의 명시적 병렬 지시 없음.
- Owned: 이 task, 검수에 의해 원인이 확인된 `apps/v1_web` 및 필요 시 `apps/v1_android`, `apps/v1_ios`의 관련 파일과 테스트.
- Forbidden: 레거시 앱, 무관한 변경, 실제 사용자 데이터 변경, 다른 세션 작업.

## Acceptance Criteria
- [ ] 사용자·운영진용 156개 경로의 실제 경로/상태·플랫폼별 결과와 근거가 확정되고 미검증이 없다.
- [ ] 제보 및 발견된 가림/스크롤 결함이 각 플랫폼에서 해결되고 전후 증거와 console/network 확인이 있다.
- [ ] 최소 회귀 검증, 리뷰, PR 및 exact-head CI, Alpha serving SHA/health 확인.

## Tech Debt Resolved
- 진행 중.

## Security Notes
기존 계정과 운영 데이터를 수정하지 않는다. 인증정보는 정본 `CLAUDE.md`가 지정한 비공개 QA 자료에서만 읽고 공개 문서·로그에 기록하지 않는다. `.env`는 읽거나 기록하지 않는다.

## Risks & Dependencies
- 연결된 Android 기기 없음, 실행 중인 iOS 시뮬레이터 없음(첫 조사). 앱 실기기 증거는 브라우저 크기 재현으로 대체하지 않는다.
- 브라우저 화면과 앱 빌드·서빙 SHA가 다를 수 있다.
- 동적 route는 실제 객체와 적절한 역할이 필요하다.

## Ambiguity Log
| Date | Question | Resolution |
| --- | --- | --- |
| 2026-11-03 | `/admin-content-preview`, `/tournament-ops-demo`의 사용자용 여부 | 소스에서 전자는 관리자 권한 전용 미리보기라 제외, 후자는 공개 체험 페이지라 포함. |

## Progress Snapshot
- 2026-11-06 (Claude, Codex 한도 소진 후 인계): 같은 50조건 스크립트를 Alpha `fdd1e204`(#2166 포함)에서 다시 돌려 **50/50 통과**, 원래 카카오 세션 복귀 확인. 수정 전 같은 스크립트는 24건 실패였다. 증거는 비공개 `teameet-unified-auth-20261105/mobile-matched-after-claude-fdd1e20-*`.
- 2026-11-06 나머지 121개 경로 스윕(390·320, 하단 48px 모사, Chromium — 실기기 아님): 정상 90 · 결함 후보 8 · 목표 화면 아님 14(리다이렉트·권한 안내) · 건너뜀 7(진입만으로 쓰기 가능) · 데이터 없음 2. 후보: `/my/settings/login-methods`·`/my/teams` 320 가로 넘침, 리뷰 작성 마지막 줄 고정 CTA 12px 가림, 대회 운영(`operations`·`videos`)·체험 화면 하단 8~15px 시스템 영역 겹침, 특정 팀매치 상세 렌더 예외. `/landing` 장식 글로우는 가로 스크롤이 없어 제외. 필터 시트 4곳·하단 탭바·FAB 는 전부 안전 영역 안. 진입만으로 쓰기 요청이 나가는 화면(팀매치·팀 상세의 채팅방 자동 resolve, 초대 링크 발급, 채팅 읽음)이 있어 QA 계정으로 그 화면을 열 때 유의. 비공개 증거 `teameet-mobile-sweep-20261106/summary.md`.
- 2026-11-06 후보 수정 PR: #2175(`.tm-my-shell`·목록 grid 의 암묵 auto 열 → `minmax(0, 1fr)`, 리뷰 작성은 `useCreateCtaSpace` 로 고정 CTA 높이만큼 비움), #2174(대회 운영 셸·필드 콘솔 root 와 체험 화면에 `--v1-shell-safe-bottom`), #2177(팀매치 상세가 경기 설정의 `periods` 만 검증 — alpha 풋살 설정 한 버전의 `lineup.positions` 손상으로 상세 3건이 SSR 422 → 전역 오류 화면이던 것. 운영 공개 팀매치 24건은 전부 200). 손상된 alpha 설정 데이터 자체는 사용자 승인 전이라 그대로다. 같은 날 #2171 로 dev 머지 → alpha 반영이 40~70분에서 19분이 됐다.
- 2026-11-05 최신 체크포인트: PR #2166의 최종 head `74a3f7e32a5261f7896c493be61cb79d130b845e` exact-head CI 42023072760이 Web·API·Gates 모두 통과해 dev `0b7720cb7d068b05735039e3445ef4b374642ed7`에 머지했다. 새 dev 전체 CI 42030531109와 Alpha 배포 42030531284도 통과했다. 실제 Web/API SHA `0b7720cb`, release `1.13.1-alpha.20261105.g0b7720cb7d06`, DB health 정상을 확인했다. 다섯 수정의 배포본 화면 50조건 재검수는 아직이다.
- 2026-11-05 전후 조건 고정: 실제 기존 QA 스태프·팀장으로 카드 폭 5개, 시상 버튼 4개, 등번호 창 8개, 해체의 막힘/준비 상태 32개, 키보드 닫기 1개로 같은 50개 조건의 수정 전 증거를 확보했다. 기존 Alpha `982ca40b`에서 24개 실패 조건이 다섯 결함에 대응했다. 원래 카카오 계정 복귀를 확인했고 신청·등번호·해체·프로필 저장은 실행하지 않았다. 새 SHA를 확인한 뒤 같은 스크립트로 실제 배포본을 재검수해야 한다. E2E 파일의 세 회귀 계약은 수집만 했으며 실제 실행 PASS로 세지 않는다.
- 2026-11-05 23:25 KST 릴리스 준비 관찰: dev 대상 초안 PR #2167의 공개 head `26ad5c613ca02405cb6245fe008544e5c7e8f6f4` CI 42038344742가 API·Web·Gates 모두 통과했고 code scanning 42038352245도 통과했다. 버전·CHANGELOG·소비 Changeset·기존 task 2개, 총 9개 파일이며 앱 동작 코드는 Alpha `0b7720cb`와 같다. 정본 `--prepare-only` 게이트와 릴리스 계약 24/24 통과. 후보 매니페스트 `1.13.1`, 미소비 Changeset 0개, 계획 배포 버전 `1.13.2`다. PR은 draft이며 동일 50조건의 새 Alpha 화면 재검수, 릴리스 dev 반영/Alpha 재확인, 사용자 main 승격/운영 검수는 남는다.
- 2026-11-05 검수표: 현재 소스 156개 경로와 과거 144개 목록을 대조해 추가 12개가 담당 대회 관리 경로임을 확인했다. 이번 세션의 다중 화면 크기 관찰 묶음을 연결한 경로는 35/156이고, 과거 133개 진입 시도에는 권한 안내·리디렉션·로딩도 포함된다. 역할·상태·플랫폼 전체 완료는 계속 0/156이다. 비공개 `route-coverage-matrix.json`에 이 구분과 증거를 기록했다.
- 2026-11-05 남은 창 후보: 개인매치 신청, 팀 컨택 신고, 명단 저장/불러오기, 선수 선택, 어시스트 선택, 비정상 종료, 승부차기, 결과 사유/편집의 10개 inline viewport overlay를 좁혔다. 해당 파일에는 native bottom·visual viewport 변수를 직접 소비하는 코드가 없지만 실제 가림으로 확정하지 않았다. `remaining-overlay-candidates.json`의 실제 화면·역할·긴 본문·키보드 조건으로 재현해야 한다.
- 2026-11-05 조회 권한 선행 확인: 기존 QA 스태프의 실제 로그인 201·auth/me 200, 담당 대회 3개와 `FIELD_OPERATOR`/`TOURNAMENT_DIRECTOR` 배정, QA179 운영 보드 GET 200을 확인했다. 담당 경기 2개는 모두 `SCHEDULED`이고 QA179에는 경기가 없다. QA 팀장의 기존 경기 GET·operations-lineup GET은 200이며 상태는 `SCHEDULED`다. 모집 중 개인매치 첫 20개에는 QA 표시 후보가 없었다. 이 API 조회는 실제 운영창·진행 중 상태의 시각 검증을 대신하지 않는다.
- 2026-11-05 23:25 KST 브라우저 조건: 현재 연결에서 기존 TaskSpace 69 또는 이 목표의 작업공간 이름을 찾지 못했다. 같은 조건을 세 연속 goal turn에 확인했고 새 검수 공간 생성 답변은 아직 없다. 다른 사용자 공간은 보존했다. 실제 이메일 입력·실기기 보류도 유지하며 전체 목표는 미완료다. 독립적으로 수행할 수 있었던 릴리스 exact-head CI 확인과 운영 배포/마이그레이션 로그 대조는 마쳤다.
- 2026-11-05: 사용자가 모바일 UI/UX부터 통합 계정 로그인과 Alpha·main 실측까지 목표를 연결했다. 코드 기준으로 담당 대회 관리 12개 경로가 추가되어 인벤토리를 144→156개로 갱신한다. 기본 브라우저 표시 상태와 역할·키보드·네이티브 전체 상태를 구분하며 전 플랫폼 완전 검수는 아직 0/156이다.
- 2026-11-05: 비공개 자료의 기존 QA 스태프 계정으로 Alpha 이메일 로그인과 실제 디렉터 배정을 확인했다. QA 대회의 담당 대회 관리 12개 경로를 320/768/1440px 36개 표시 상태로 읽기 전용 관찰했다. 운영·대회 데이터 변경 없음. 캠페인 없음 404는 정상 빈 상태로 표시된다.
- 2026-11-05: 신청 관리 320px에서 카드 목록의 고정 최소 폭 360px 때문에 문서 폭이 376px로 늘어남을 확인했다. `AdminCardList`의 선호 최소 폭을 컨테이너 폭 이하로 제한해 좁은 화면은 한 열로 줄고 넓은 화면의 기존 자동 열 배치는 유지한다. 실제 Alpha DOM 임시 적용에서 문서 376→320px, 카드 360→288px 확인. 배포본 재검수는 별도로 진행한다.
- 2026-11-05: 수정 식의 실제 Alpha 임시 적용에서 320/360/390/768/1440px 모두 가로 넘침 0을 확인했고 신청 관리 기존 기능 테스트 40/40, Web 타입·패턴 검사를 통과했다. CSS 기하를 jsdom의 클래스 문자열 검사로 대체하지 않으며 배포 후 동일 QA 대회의 실제 화면으로 확인한다.
- 2026-11-05: 시상 관리의 `+ 항목 추가`가 설명 문구와 같은 flex 행에서 줄어들어 320px에서는 버튼 63×74px/텍스트 67px 높이, 390px에서는 텍스트 43px 높이로 줄바꿈되는 결함을 확인했다. 설명은 줄어들 수 있게 하고 버튼은 줄어들지 않는 한 줄·44px 터치 높이로 조정한다. 실제 Alpha 임시 적용은 320/390/768/1440px에서 버튼 약 99×44px/텍스트 19px, 문서 가로 넘침 0. 서버 저장 없이 전후 캡처했으며 배포 후 재검수는 별도로 진행한다.
- 2026-11-05: 기존 QA 팀장으로 실제 팀 멤버 관리 → 등번호 지정을 열었다. 320/390×640px, 48px 하단 영역에서 저장 버튼 끝 604px > 안전 경계 592px로 12px 가림을 재현했다. 화면 높이 360px에서 오류 문구가 나오면 패널 전체 높이도 가용 영역보다 커진다. 기존 확인창의 body portal·안전 여백·패널 스크롤 패턴을 적용하고 보이는 viewport 높이를 사용한다. 실제 Alpha DOM 임시 적용은 저장 버튼 604→556px, 320×360px 오류 상태는 패널 316px 콘텐츠를 280px 안에서 스크롤해 저장 버튼 276px < 안전 경계 312px 확인. 번호 저장·팀 데이터 변경 없음.
- 2026-11-05: 등번호 기존 동작 테스트 2/2와 최종 Web 타입·패턴 검사 PASS. 실제 내 팀 → 멤버 관리에서 입력창을 열고 늦은 0/34/48/64px 인셋 및 작은 높이의 오류 상태를 확인하는 E2E 계약을 추가했다. 테스트 수집은 확인했으며 이 계약의 실제 실행과 배포본 Alpha 재검수는 아직 남는다.
- 2026-11-05: 기존 QA 팀장의 팀 상세·멤버·수정·전적·일정·일정 생성·경기 명단·전술·컨택 설정·해체 11개 경로를 320/768/1440px, 초기/스크롤 끝으로 추가 관찰했다(33개 표시 상태). 가로 넘침·권한 거부·로드 에러·콘솔 오류·HTTP 실패 없음. 경기·팀 설정·명단 저장이나 해체·취소 버튼은 누르지 않았다. 페이지 기본 동작의 Socket.IO와 채팅방 resolve 요청은 별도로 기록했다.
- 2026-11-05: 위 팀 해체의 320px 막힘 화면에서는 마지막 안내문이 고정 CTA에 약 23px 가려졌다(0/34/48/64px 인셋 각각). 본문이 고정 148px + 안전 영역만 남기지만 버튼이 두 줄로 쌓이면 CTA가 더 높아지는 원인이다. Footer에 기존 `useCreateCtaSpace`를 붙이고 양쪽 해체 화면의 본문을 실측 높이 + 16px로 맞춘다. Alpha 임시 적용에서 320/390/768/1440px 모두 마지막 내용이 CTA보다 위에 남고 모바일·태블릿 여백은 약 16px로 확인했다. 기존 해체 동작 5/5 및 Web 타입·패턴 검사 PASS, 늦은 인셋의 E2E 계약 수집 확인. 배포본 실제 실행은 남는다.
- 2026-11-05 증거 보강: 브라우저 CLI 호출 사이에 window 오류 수집기가 유지되지 않아 이전 `errors: []`만으로 콘솔 무오류를 보장할 수 없음을 확인했다. 각 호출에서 Runtime/Log/Network를 켜고 의도한 console probe 수신을 확인한 뒤 실제 흐름을 수집했다. Alpha·운영 계정 찾기 24개와 프로필·대회 필터 16개 표시 상태에서 콘솔 오류·처리되지 않은 예외·HTTP/리소스 실패가 없었다. 탐색에 따른 요청 취소는 실패와 분리해 기록했다. 앞선 기하 측정과 화면 캡처는 유지한다.
- 2026-11-05: 기존 QA 팀 12개의 해체 전 GET 점검 중 8개가 해체 가능한 상태여서 실제 준비 화면도 확인했다. 320px에서 확인 입력란이 약 39px 가려졌고 같은 실측 여백 적용은 약 16px 간격을 확보한다. 이름 입력·해체 실행 없음. 키보드 영역을 제외한 320×360px 모사에서는 기존 Footer가 absolute 위치로 스크롤되어 사라질 수 있어, 공통 `tm-create-shell`의 키보드 중 일반 흐름 배치를 재사용한다.
- 2026-11-05: 실제 Alpha 프로필에서 키보드 모사 중 닉네임 안내로 CTA가 89→113px 커지면 예약 높이가 0px이 된다. 창 크기·CTA 크기 변화 없이 키보드 상태만 닫히면 fixed 위치로 복귀해도 0px이 남아 마지막 안내가 9px 겹친다. 루트의 native keyboard 속성과 browser keyboard 클래스를 관찰해 위치 전환 때도 재측정한다. 두 전환의 실제 DOM/CSS 계약 테스트 RED(0px, 기대 113px) → 4/4 GREEN. Alpha 임시 관찰 적용도 예약 113px·간격 16px, 저장 요청 없이 확인했다. 프로필 E2E 계약에 같은 키보드 닫기 전환을 추가했고 최종 Web 타입·패턴 검사와 세 E2E 계약 수집은 PASS, 배포본 실행은 남는다.
- 2026-11-05: 이메일 연결의 실제 보호 흐름도 확인했다. 기존 QA 세션의 요청은 403 `RECENT_LOGIN_REQUIRED`로 차단되고 재로그인 후 같은 계정이 원래 연결 화면과 복귀 경로로 돌아온다(auth/me 200). 이미 이메일 신원이 있는 계정의 요청은 409 `SOCIAL_LINK_PROVIDER_EXISTS`와 안내 화면으로 종료된다. 인증번호 발송·신원 추가·비밀번호 변경 없음. 이 두 HTTP 오류는 의도한 차단이며 콘솔 예외나 미처리 실패와 구분한다.
- 추가 검증 연결: 통합 계정 검증과 발견된 가입 보완 진입 결함은 [Task 20261125](./20261125-unified-account-email-login.md), PR #2165에서 추적한다. 실제 카카오 로그인은 Alpha·운영에서 확인했고 일회용 QA 계정으로 이메일 로그인·복구를 검증했다. 실사용자 이메일 추가의 인증번호·비밀번호 입력은 사용자 요청으로 보류 중이다.
- 2026-11-03: PR #2133·#2134 머지 후 Alpha `84ebe114ebea19973d2cc276b50691c05f8ac33f` 배포와 API DB health 정상 확인. 144개 route 중 133개는 진입 또는 캡처를 시도했으나 권한 거부·로딩·리디렉션도 포함하고 전 플랫폼 검증 PASS는 아니다. 상세 `/Users/sungjun/.codex/qa-evidence/teameet-mobile-20261103/route-attempts.json`.
- 변경 후 대회 필터는 390x844 Chromium 터치 스와이프에서 scrollTop 0→125; 로그인·약관 관련 10개 화면에서 360x640 및 하단 48px 모사 시 보이는 컨트롤의 안전 경계 침범 후보는 없었다. 화면별 고정 영역에 가려진 본문까지 이 수치로 보장하지 않는다.
- 배포 후 계정 충돌 화면에서 native inset이 렌더 이후 0→48px로 바뀌면 고정 CTA는 48px 커지지만 ResizeObserver의 기본 content-box 관찰은 padding 변화를 감지하지 않아 본문이 CTA 뒤에 48px 겹쳤다. 실제 Alpha E2E는 겹침 48px로 RED. CTA의 border-box 크기를 관찰하도록 보완하고 수정 후 재검증한다.
- iPhone 16 iOS 27.0 시뮬레이터의 Alpha 앱 팀매치 검색에서 소프트웨어 키보드가 열리면 입력칸은 보이고 하단 메뉴가 숨겨졌다. 해당 한 화면의 수정 전 결과이며 다른 입력 폼·실기기는 미검증.
- 대회 문의창은 360x640·하단 48px 모사에서 마지막 버튼이 안전 경계에 닿고 터치로 본문 끝까지 스크롤됐다. 프로필 사진 크롭은 테스트 이미지만 선택하고 취소했으며 업로드·저장은 하지 않았다. 운영 체험은 별도 탭의 샘플 데이터만 사용했다.
- 현재 계정으로 실제 대회 운영 6개 경로의 권한 안내까지만 확인했다. 경기 기록의 명단 연결은 `Actor scope is not permitted`로 목록을 열지 못했다. 정상 운영·팀장 권한 상태 및 Android 에뮬레이터는 미검증.
- 2026-11-03: 원격 dev/Alpha `fbf6fb9b139e0be49955103be867a900a55b5879`; Alpha API health DB true.
- 211개 page 파일 중 admin 66과 관리자 권한 전용 `/admin-content-preview` 1을 제외한 사용자 대상 144개. 대회 운영진이 쓰는 `tournament-ops` 6개와 공개 체험 `/tournament-ops-demo`도 포함한다. 상태별·플랫폼별 검수는 미완료.
- 일반 Chromium 모바일 크기 390x844, 로그인된 Alpha 팀 만들기에서 임시 텍스트 입력 후 뒤로가기 확인창을 열고 native bottom 48px을 CSS로 모사: 버튼 하단 y=804, 안전 경계 y=796으로 8px 겹침. 실제 Android/iOS 기기 재현 아님. 저장은 하지 않음.
- 대회 필터를 390x844 Chromium 터치 입력으로 재현: 시트 높이 619px, 콘텐츠 696px, 위 스와이프 후 scrollTop 0. 브라우저에서 `touch-action: pan-y`를 임시 적용하고 동일 스와이프 시 scrollTop 77. 공통 시트의 본문 drag 가드를 수정하고 관련 단위 테스트 RED 1/15 → GREEN 15/15. 실제 기기의 터치 검증은 아님.
- 확인창에 48px inset과 하단 padding을 임시 적용한 브라우저 실험: 버튼 하단 y=756, 안전 경계 y=796. 제품 코드 수정 후 Alpha 재검증은 아직 하지 않음.
- 390x844 Chromium 주요 경로 화면을 캡처했으나 일부가 인증 확인이나 데이터 skeleton 상태였으므로 전체 경로 검수 PASS로 세지 않는다.
- 로그인 없는 Chromium 자동 회귀 기준 Alpha: 390x640에서 native inset 48 모사 시 로그인 사업자 링크 하단 616 > 안전 경계 592 (RED). 대회 필터 touch swipe 후 scrollTop 0 (RED; 등장 transform 종료 대기 후도 재현). 수정본이 아직 Alpha에 없으므로 GREEN 미확인.
- `/my` 계열 19개 경로에서 390x844 Chromium 초기/스크롤 끝 캡처를 시도했다. `/my/reviews/received`는 `/my/reviews`로 이동, `/my/team-contacts`는 이동 중 화면을 캡처했다. 각 상태·상호작용·플랫폼을 완료한 증거는 아니며 144개 전면 검수 수치에 포함하지 않는다. 임시 결과 `/tmp/teameet-mobile-audit-20261103/my-captures.json`.
- 로컬 변경 단위 검증: BottomSheet 15/15, ConfirmModal 12/12, AuthFrame 10/10, globals 90/90. 범위별 사용자 화면 실제 검증 및 변경 후 Alpha는 아직 미실행.
- `pnpm --filter v1_web lint`: TypeScript 및 v1 pattern 검사 통과. E2E 세 시나리오 수집 성공. 수정 전 Alpha의 로그인·필터 두 시나리오는 의도한 레이아웃/스크롤 주장으로 실패했고 수정 후 Alpha GREEN은 미확인.
- 추가 실측: Alpha 팀매치 `/team-matches/469a1730-e96c-4982-ac27-75870a0f9b71`의 지도 선택 `ActionSheet`에서 390x844, 48px inset 모사 시 네이버 지도 항목 끝 y=824 > 안전 경계 y=796. padding 임시 적용 후 y=776. 390x640 자동 E2E는 620 > 592로 RED. 수정 후 Alpha 및 실제 기기 결과는 미확인. ActionSheet·PlaceCard 단위 테스트 27/27 통과(jsdom navigation 미구현 경고 출력).
- 액션 시트 후속 수정 뒤 `pnpm --filter v1_web lint` 통과. 사용자가 실기기 없이 시뮬레이션으로 진행하고 실기기는 추후 확인하기로 결정했다.
- 다음 조사 후보: `JerseyNumberDialog`, 개인매치 신청창, 팀 컨택 신고창은 하단 정렬 overlay에 안전 영역을 직접 반영하지 않는 코드가 보인다. 이 항목들은 아직 실제 화면에서 재현하지 않았고 결함으로 확정하지 않았다. 대회 문의 시트는 footer에 안전 영역 계산이 있다.
- 추가 코드 탐색 후보: 선수 선택·어시스트 선택·경기 비정상 종료·승부차기·라인업 불러오기/저장·대회 결과 편집/사유 모달의 하단 정렬 및 긴 콘텐츠/키보드 상태. 각 사용처의 실제 역할·화면 진입과 안전 영역 소비를 검증해야 한다.
- iOS 27.1 runtime은 iPhone Duo만 지원한다. iOS Alpha 앱 빌드·설치·실행은 성공했으나 직후 load 400 이상, swap 급증(약 1.8→3.4GB)으로 테스트를 중단하고 이 작업이 시작한 시뮬레이터를 shutdown, iOS 27.0 추가 다운로드를 취소했다. 화면 상호작용·스크린샷은 미실행. Node 43(시작 41), MCP 11(시작 11); 급증 원인은 미확정.
- Alpha Chromium 390x844에서 공개·생성 계열 27개 경로의 초기/스크롤 끝 캡처를 추가했다. `/league-matches`는 `/tournaments`로 이동했고 일부 생성 단계는 선행 데이터·로딩 확인이 필요하다. 캡처만으로 전 플랫폼 PASS는 아니다. 임시 결과 `/tmp/teameet-mobile-audit-20261103/public-captures.json`.
- iPhone 16 / iOS 27.0 시뮬레이터에서 Alpha iOS 앱을 빌드·실행했다. 비로그인 로그인 화면은 Apple 로그인 버튼을 포함하며 맨 아래로 스와이프 시 사업자 정보가 보였다. 앱 대회 필터는 본문을 두 곳에서 위로 스와이프해도 날짜 입력란이 고정 버튼 밑에 남았다. 같은 시뮬레이터의 Safari는 주소창으로 가용 높이가 더 짧고 본문 스와이프가 역시 움직이지 않았다. 전부 수정 전 Alpha 관찰이며 실제 iPhone은 미검증. 이미지 `/tmp/teameet-mobile-audit-20261103/ios-{app-login-bottom,app-filter,safari-filter}-before.jpg`.
- CI에서 팀매치 시트 사용처의 기존 본문 드래그 대조 테스트 1개가 바뀐 계약과 충돌했다. 손잡이 드래그·본문 스크롤 계약으로 갱신했고 해당 파일 8/8 통과; 새 PR head 기준 CI는 재진행 중이다. 테스트 중 기존 React `act` 경고 1건이 출력됐다.
- iOS 앱·Safari 확인 뒤 swap이 약 3.3→4.5GB로 다시 증가해 이번 작업의 iPhone 16 simulator를 shutdown했고 자동 로그 helper, DeviceHub 및 이번 작업이 시작한 adb 서버를 종료했다. load는 약 12.7로 내려갔으나 swap은 4.5GB로 남아 있으며 원인은 확정되지 않았다.
- 46개 기본 경로에서 Chromium 390x844·CSS native inset 48px 모사 후 화면 내 interactive 요소의 안전경계 침범을 기계적으로 탐색했고 후보 0개였다. 일부 hydration/리디렉션 경계 및 overlay·키보드·역할 상태는 탐색하지 못하므로 전면 검수 PASS가 아니다. 결과 `/tmp/teameet-mobile-audit-20261103/simulated-inset-route-scan.json`.
- 사용자는 실기기 연결 불가, 시뮬레이션으로 진행하고 실기기는 나중에 확인하기로 했다. Android 에뮬레이터와 iOS Simulator runtime 미설치 상태를 확인했고, iOS 27.1 simulator runtime 다운로드 진행 중. Android/iOS 실기기/OS/키보드는 미실행.

## Route inventory (0/156 fully audited; 67 admin-only exclusions at original inventory)
각 항목은 route 템플릿이며 객체·권한·상태·플랫폼별 검수는 따로 기록해야 한다. 체크는 전 플랫폼과 필요한 상태 검증이 끝난 경우에만 한다.

- [ ] `/tournament-management` — Alpha QA 디렉터 기본 표시 3개 viewport 관찰; 전체 상태·플랫폼 미검증
- [ ] `/tournament-management/tournaments/[id]` — Alpha QA 디렉터 기본 표시 3개 viewport 관찰; 전체 상태·플랫폼 미검증
- [ ] `/tournament-management/tournaments/[id]/announcements` — Alpha QA 디렉터 기본 표시 3개 viewport 관찰; 전체 상태·플랫폼 미검증
- [ ] `/tournament-management/tournaments/[id]/awards` — 모바일 항목 추가 버튼의 세로 줄바꿈 확인·수정 검증 진행; 전체 상태·플랫폼 미검증
- [ ] `/tournament-management/tournaments/[id]/bracket` — Alpha QA 디렉터 기본 표시 3개 viewport 관찰; 전체 상태·플랫폼 미검증
- [ ] `/tournament-management/tournaments/[id]/campaign` — Alpha QA 디렉터 캠페인 없음 상태 3개 viewport 관찰; 전체 상태·플랫폼 미검증
- [ ] `/tournament-management/tournaments/[id]/info` — Alpha QA 디렉터 기본 표시 3개 viewport 관찰; 전체 상태·플랫폼 미검증
- [ ] `/tournament-management/tournaments/[id]/overview` — Alpha QA 디렉터 기본 표시 3개 viewport 관찰; 전체 상태·플랫폼 미검증
- [ ] `/tournament-management/tournaments/[id]/registrations` — Alpha 320px 카드 가로 넘침 확인; 수정 검증 진행
- [ ] `/tournament-management/tournaments/[id]/reviews` — Alpha QA 디렉터 기본 표시 3개 viewport 관찰; 전체 상태·플랫폼 미검증
- [ ] `/tournament-management/tournaments/[id]/sponsors` — Alpha QA 디렉터 기본 표시 3개 viewport 관찰; 전체 상태·플랫폼 미검증
- [ ] `/tournament-management/tournaments/[id]/statistics` — Alpha QA 디렉터 기본 표시 3개 viewport 관찰; 전체 상태·플랫폼 미검증

- [ ] `/account-deletion` — 미검수
- `/admin-content-preview` — 범위 제외: 관리자 권한 전용 미리보기
- [ ] `/auth/account-conflict` — 미검수
- [ ] `/auth/blocked` — 미검수
- [ ] `/auth/find-account` — 미검수
- [ ] `/auth/location-denied` — 미검수
- [x] `/auth/password-reset` — 정리됨(페이지 삭제, 검수 대상 아님)
- [ ] `/auth/provider-denied` — 미검수
- [ ] `/auth/withdrawal-cancel` — 미검수
- [ ] `/callback/kakao` — 미검수
- [ ] `/chat/[id]` — 미검수
- [ ] `/chat` — 미검수
- [ ] `/contact` — 미검수
- [ ] `/events` — 미검수
- [ ] `/faq` — 미검수
- [ ] `/for/organizers` — 미검수
- [ ] `/for/players` — 미검수
- [ ] `/for/teams` — 미검수
- [ ] `/help/glossary` — 미검수
- [ ] `/help/guides/[slug]` — 미검수
- [ ] `/help` — 미검수
- [ ] `/home` — 미검수
- [ ] `/invite/[token]` — 미검수
- [ ] `/landing` — 미검수
- [ ] `/league-matches/[leagueId]/awards` — 미검수
- [ ] `/league-matches/[leagueId]/fixtures/[fixtureId]` — 미검수
- [ ] `/league-matches/[leagueId]` — 미검수
- [ ] `/league-matches` — 미검수
- [ ] `/login/email` — 미검수
- [ ] `/login/email/verify` — 미검수
- [ ] `/login` — 미검수
- [ ] `/matches/[id]/applications` — 미검수
- [ ] `/matches/[id]/edit` — 미검수
- [ ] `/matches/[id]` — 미검수
- [ ] `/matches/new/confirm` — 미검수
- [ ] `/matches/new` — 미검수
- [ ] `/matches/new/place-time` — 미검수
- [ ] `/matches/new/sport` — 미검수
- [ ] `/matches` — 미검수
- [ ] `/my/inquiries/[id]` — 미검수
- [ ] `/my/inquiries/new` — 미검수
- [ ] `/my/inquiries` — 미검수
- [ ] `/my/invitations` — 미검수
- [ ] `/my/join-applications` — 미검수
- [ ] `/my/leagues` — 미검수
- [ ] `/my/matches/created` — 미검수
- [ ] `/my/matches/joined` — 미검수
- [ ] `/my` — 미검수
- [ ] `/my/phone-verify` — 미검수
- [ ] `/my/profile/edit` — 미검수
- [ ] `/my/reviews/[sourceType]/[sourceId]` — 미검수
- [ ] `/my/reviews` — 미검수
- [ ] `/my/reviews/received` — 미검수
- [ ] `/my/schedule` — 미검수
- [ ] `/my/settings/legal` — 미검수
- [ ] `/my/settings/location` — 미검수
- [ ] `/my/settings/login-methods/email` — 미검수
- [ ] `/my/settings/login-methods` — 미검수
- [ ] `/my/settings/notifications` — 미검수
- [ ] `/my/settings` — 미검수
- [ ] `/my/settings/player-card` — 미검수
- [ ] `/my/settings/record-consent` — 미검수
- [ ] `/my/settings/sports` — 미검수
- [ ] `/my/settings/theme` — 미검수
- [ ] `/my/settings/tournament-real-name` — 미검수
- [ ] `/my/settings/withdrawal` — 미검수
- [ ] `/my/team-contacts/[contactId]` — 미검수
- [ ] `/my/team-contacts` — 미검수
- [ ] `/my/teams/[id]/members` — 미검수
- [ ] `/my/teams/[id]` — 미검수
- [ ] `/my/teams` — 미검수
- [ ] `/my/tournament-staff/[tournamentId]` — 미검수
- [ ] `/my/tournament-staff` — 미검수
- [ ] `/notices/[id]` — 미검수
- [ ] `/notices` — 미검수
- [ ] `/notifications` — 미검수
- [ ] `/onboarding/confirm` — 미검수
- [ ] `/onboarding/level` — 미검수
- [ ] `/onboarding/region` — 미검수
- [x] `/onboarding/resume` — 정리됨(페이지 삭제, 검수 대상 아님)
- [ ] `/onboarding/sport` — 미검수
- [ ] `/` — 미검수
- [ ] `/search/new` — 미검수
- [ ] `/search` — 미검수
- [ ] `/signup/complete` — 미검수
- [ ] `/signup` — 미검수
- [ ] `/signup/social` — 미검수
- [ ] `/team-matches/[id]/edit` — 미검수
- [ ] `/team-matches/[id]/edit/rules` — 미검수
- [ ] `/team-matches/[id]/lineup/opponent` — 미검수
- [ ] `/team-matches/[id]/lineup` — 미검수
- [ ] `/team-matches/[id]/operate` — 미검수
- [ ] `/team-matches/[id]` — 미검수
- [ ] `/team-matches/[id]/record` — 미검수
- [ ] `/team-matches/[id]/result/approval` — 미검수
- [ ] `/team-matches/[id]/result` — 미검수
- [ ] `/team-matches/new/condition` — 미검수
- [ ] `/team-matches/new/confirm` — 미검수
- [ ] `/team-matches/new/info` — 미검수
- [ ] `/team-matches/new` — 미검수
- [ ] `/team-matches/new/place-time` — 미검수
- [ ] `/team-matches/new/rules` — 미검수
- [ ] `/team-matches/new/sport` — 미검수
- [ ] `/team-matches/new/team` — 미검수
- [ ] `/team-matches` — 미검수
- [ ] `/teams/[id]/contact/new` — 미검수
- [ ] `/teams/[id]/contact/settings` — 미검수
- [ ] `/teams/[id]/dissolve` — 미검수
- [ ] `/teams/[id]/edit` — 미검수
- [ ] `/teams/[id]/game-rosters` — 미검수
- [ ] `/teams/[id]/games/[gameId]/roster` — 미검수
- [ ] `/teams/[id]/invite` — 미검수
- [ ] `/teams/[id]/members` — 미검수
- [ ] `/teams/[id]` — 미검수
- [ ] `/teams/[id]/records` — 미검수
- [ ] `/teams/[id]/schedules/[scheduleId]/edit` — 미검수
- [ ] `/teams/[id]/schedules/[scheduleId]` — 미검수
- [ ] `/teams/[id]/schedules/new` — 미검수
- [ ] `/teams/[id]/schedules` — 미검수
- [ ] `/teams/[id]/tactics/[gameId]` — 미검수
- [ ] `/teams/new` — 미검수
- [ ] `/teams` — 미검수
- [ ] `/terms` — 미검수
- [ ] `/tournament-ops-demo` — 미검수
- [ ] `/tournament-ops/tournaments/[id]/fixtures/[fixtureId]/operate` — 미검수
- [ ] `/tournament-ops/tournaments/[id]/operations` — 미검수
- [ ] `/tournament-ops/tournaments/[id]/records/corrections` — 미검수
- [ ] `/tournament-ops/tournaments/[id]/result-review` — 미검수
- [ ] `/tournament-ops/tournaments/[id]/staff` — 미검수
- [ ] `/tournament-ops/tournaments/[id]/videos` — 미검수
- [ ] `/tournaments/[id]/apply` — 미검수
- [ ] `/tournaments/[id]/awards` — 미검수
- [ ] `/tournaments/[id]/bracket` — 미검수
- [ ] `/tournaments/[id]/matches/[fixtureId]` — 미검수
- [ ] `/tournaments/[id]/my` — 미검수
- [ ] `/tournaments/[id]` — 미검수
- [ ] `/tournaments/[id]/registrations/[registrationId]/roster` — 미검수
- [ ] `/tournaments/[id]/results` — 미검수
- [ ] `/tournaments/[id]/reviews` — 미검수
- [ ] `/tournaments/[id]/schedule` — 미검수
- [ ] `/tournaments/campaigns/[slug]` — 미검수
- [ ] `/tournaments` — 미검수
- [ ] `/users/[id]/card` — 미검수
- [ ] `/users/[id]` — 미검수
- [ ] `/users/[id]/records` — 미검수

- 2026-11-03: Alpha 360×640, native 48px 가정에서 스크롤 끝 고정 CTA가 매치 입력란 2px, 빈 팀매치 안내 링크 35px, 팀 만들기 꾸미기 버튼 23px을 덮는 RED 확인. CTA 크기에 맞는 공간을 계산해 각 create 폼과 뒤늦은 inset 변화를 검증한다.

- 2026-11-04: 현재 계정 Alpha `98971bc4` 360×640에서 탈퇴 사유 입력란의 아래 끝이 고정 CTA와 6.5px 겹침(48px inset), 64px에서는 22.5px 겹침을 확인. 기존 본문 하단 124px과 안전 영역에 따라 커지는 CTA 높이의 불일치가 원인. 기존 CTA 높이 관찰 로직을 재사용하며 늦은 0/34/48/64px inset 변경 시 본문 마지막 필드가 CTA 위에 남는 E2E 계약을 추가한다. 탈퇴 요청·저장 실행 없음.
- 2026-11-04: 같은 Alpha 계정 위치 설정에서 마지막 상태 안내 카드 하단이 48px 인셋에서 CTA 뒤로 13px 가려짐을 재현. 동일한 고정 124px 여백이 원인이어서 CTA 실측을 적용하고 0/34/48/64px의 카드 전체 가시성을 E2E 계약으로 추가한다. 위치 요청·저장 실행 없음.
- 2026-11-04: 프로필 수정에서 닉네임을 임시 변경해 중복 확인 안내가 나오면 360×640/48px 가정 시 마지막 안내 카드가 CTA 뒤로 9px 겹침. CTA 측정 훅이 비동기 데이터 로딩 후에도 설치되도록 하고, 안내로 높아진 실제 CTA 높이에 맞춰 본문 여백을 보정한다. 저장·중복 확인 요청 없이 임시 입력 폐기. 비동기 mount 단위 테스트 RED→GREEN 및 브라우저 회귀 계약 추가.
- 2026-11-04: Alpha 517b1206 프로필 수정은 320px에서 스크롤 영역 내부 폭 343px로 입력란·카드 오른쪽이 잘림. grid 최소 콘텐츠 폭과 프로필 사진 설명 flex 최소 폭이 원인. 0으로 줄일 수 있는 grid/flex 최소 폭을 지정하고 사진 안내 문구가 줄바꿈되게 조정한다. 실제 320px 스크롤 콘텐츠와 안내문이 화면 폭을 넘지 않는 E2E 계약 추가. 실제 프로필 변경 저장 없음.
- 2026-11-04: 같은 Alpha의 QA 팀매치 기록에서 팀명·점수의 줄바꿈 금지로 320px 화면의 콘텐츠 폭이 330px까지 늘어나 상대 팀명이 잘림. 팀명은 줄바꿈하고 점수는 유지하도록 3열 배치로 조정한다. 실제 서브매치 기록이 있는 QA ID를 지정하는 경우에만 실행되는 E2E 계약을 추가한다. 경기 데이터 변경 없음.
