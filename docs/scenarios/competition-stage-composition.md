# 단계형 대회 구성

Status: In Progress — 운영 동등성 및 기존 대회 디자인 통일, Alpha before21/21; after 배포·시각 검증 진행

## 2026-11-16 — 기존 대회 화면과 디자인 통일

사용자가 기존 대회 디자인과 일치하도록 수정하고 모바일까지 Alpha 검증을 완료하도록 범위를 확장했다. 기존 A안과 공유 컴포넌트를 유지한다. CUA browser host/Windows 승인 연결은 실패했고, 사용자가 별도 **headed Playwright** 실행을 명시 승인했다. WSLg에서 전용 Chromium을 사용하며 기존 Chrome 창·프로필은 변경하지 않는다.

- 관리자 대진: 기존 그림/목록·시간/구장 작업공간의 도구 버튼에서 단계 관리 패널을 연다. 참가팀/경기 설정/구성 수정 탭, 입력 유지, 포커스 복원, 저장 중 닫기 방지, 미저장 입력 확인을 적용한다. 완료 대회의 구조·배정 변경은 잠그고 이름·최종 순위 구간은 실제 표시 API로 저장한다.
- 생성: 공유 입력 스타일과 편성별 요약/펼치기로 20팀9편성 폼의 모바일 여백·스크롤을 정리한다.
- 공개 대진: 기존 페이지 제목·진행 단계·칩 필터·일정/순위 탭·공유 경기 카드·하단 이동을 사용한다. 경기 상세 복귀 시 선택한 단계/편성/팀/보기 URL을 유지한다.
- 공개 결과: 기존 우승/공동 우승·대회 요약·영상 탭을 사용하고 마지막 본선 편성부터 표시한다. 정정 검토 중인 편성은 우승으로 확정 표시하지 않는다. 시상 화면과 같은 편성 이름을 사용한다.

검증 대상은 관리자 생성(`/admin/tournaments/new-staged`)·대진·시상, 공개 상세·대진·결과·시상7개 route ×390/768/1440 = **21 route/viewport**다. 변경 전 실제 Alpha 21/21 캡처(상·하단42PNG), document 가로 넘침0. 모바일 대진 캡처에서 다른 대회 경기 URL의 프리패치404 2건을 관찰했으며 after에서도 재확인한다. 이를 console/network PASS로 표기하지 않는다. [원본 측정](./evidence/stage-design-before-20261116.json), 캡처 `docs/screenshots/stage-parity-20261116/before/`.

로컬 회귀: 기존 대진68·결과22 + 단계 관리7·생성4·공개3 =104개 고유 사례 PASS. 접힌 details의 내부 컨트롤을 Testing Library가 숨김으로 분류하지 않은 단언은 실제 open 상태와 선택된 출처 값 검증으로 수정했다. 최종 실제 브라우저에서도 펼침·조작을 확인한다. API 전체 CI의209/210 통과 뒤 남았던 worker health의 핸들러 수 fixture를 기본12/추가 등록13으로 동기화해 실제 DB 대상1건 PASS. TypeScript 선택자 옵션의 타입 오류도 수정 후 최종 Web 타입·패턴 PASS.

현재 after는 미배포0/21이다. 최신 head CI/리뷰 및 dev 머지·Alpha 배포를 확인한 뒤 동일21개 화면, 기존 대회 비교, 관리 패널·편성/팀 선택·경기 상세 복귀·20팀 템플릿을 실제로 검증하고 결과를 갱신한다. 비밀번호·쿠키는 증거에 저장하지 않으며 브라우저 PID/PPID·종료 여부를 JSON에 기록한다.
Task: [20261130](../../.github/tasks/20261130-competition-stage-composition.md)

## 범위와 진입
플랫폼 운영자: 기존 `/admin/tournaments/new` 유지. 새 버튼 `/admin/tournaments/new-staged`에서 기본 정보·단계/편성·일정·참가조건·공개 확인을 거쳐 실제 초안을 저장한다.
관리자는 대진 관리에서 미정 대진을 생성하고 편성별 참가팀을 확정하며, 경기 운영은 기존 보드/콘솔을 쓴다.
공개 사용자는 같은 대회의 대진/결과에서 단계를 골라 독립 순위를 확인한다.

## 필수 시나리오
1. 예선 없이 본선 풀리그/토너먼트: 단계 하나로 생성·초안 재조회·참가팀 배정·경기 운영.
2. 20팀: 4팀×5개 예선(30경기) → 같은 순위끼리 5팀×4개 본선(40경기), 총70경기. 각 팀7경기·본선 승점0 시작.
3. 3단계 혼합: 2팀×2개 예선리그 → 상위리그+하위토너먼트 → 두 우승팀의 최종토너먼트. 실제팀 반복 참가·총5경기.
4. 공식 결과 미비/동률/중복 출처/같은 단계 중복 팀/타 대회 팀/낡은 버전의 거절과 실제 오류 표시.
5. 결과 정정 → stale 경고 → 시작 전 편성 재확정. 시작한 편성의 참가팀은 고정하며, 사유 필수 정정 확인으로 참가팀을 유지하고 운영을 재개한다. 무관한 다른 편성은 독립 확정.
6. 전체 단계 미완료 상태에서 대회 종료 거부. 마지막 단계의 편성별 순위와 시상만 표시.
7. 이전 생성·기존 대회·경기 ID/일정/결과·권한 유지. 기존 대회 자동 전환 거부.
8. 관리자/담당 디렉터/조회 스태프/비로그인 권한 확인, 화면390/768/1440 및 console/network 점검.

## 실행 증거
- 2026-11-16 재개: 사용자 지정 S2 전 구간 실측(아래 7단계) 준비. Alpha 응답 `X-Teameet-Commit=1acdeb40a0cbffb1e55423ba916fbb71e50d7fa4`, release `1.20.4-alpha.20261115.g1acdeb40a0cb`, `/api/v1/health`의 DB=true 확인. 따라서 위의 과거 'Alpha 미배포'는 이번 기준 현황이 아니다. 기능 통과는 아직 선언하지 않는다.
- 인증 blocker: 관리자 목록 API 비인증 HTTP 401. 현재 PC에 규칙의 비공개 계정 메모 경로 및 Alpha 인증 환경변수가 없으며 사용자에게 비공개 계정 파일 경로를 요청했다. 계정 값·세션은 기록하지 않는다. 원격 쓰기 0건, 기능 0/7, 결과 입력 0/70, 화면 0/3폭.
- 임시 PostgreSQL18.6에서 전체 migration replay PASS. 실제 사용자 DB에는 접속하지 않았다.
- API planner+기존 대진·슬롯·일정·순위 projection 5 suites /271 tests PASS.
- 실제 DB 단계 통합5 cases PASS: 20팀70경기, 3단계 혼합, 단일5팀 리그/토너먼트, 생성·구조 편집/종료 제약.
- 웹 기존 생성/모델·새 editor 131 tests PASS. manager 실제 payload/서버 오류3 tests PASS.
- 공개 분리순위·기존 상세/시상/스테퍼 등264 tests PASS, 추가 새 route 테스트는 helper의 모호한 버튼 선택 수정 후1건 PASS.
- API/Web typecheck, Web patterns 및 API surface PASS. 단계형 일정 순서 회귀3건 포함13건 PASS.
- rollback runtime epoch 3: 실제 git/manifest 9 cases PASS, release manifest self-test 및 migration gate/self-test PASS. 이전 epoch 2는 rollback·실패 후보 복구 대상에서 제외.
- CI API 통합: 201/202 suites PASS, 1544 tests PASS; 남은 source snapshot hash 갱신 후 해당1건 PASS. 현재/과거 schema binding9건 PASS. 최종 head CI 재확인 필요.
- PR [#2285](https://github.com/kim-song-jun/matchup-sports-platform/pull/2285): CI·Copilot 리뷰 진행 중.
- Alpha 기능0/8·viewport0/3: 아직 배포하지 않았다. 로컬 웹 서버는 실행하지 않았다.
- cleanup: 임시 DB/브라우저 등 이번 작업 소유 자원만 검증 종료 시 정리한다.

- 추가 정정 복구: 실제 DB5 cases와 배정 UI4 cases PASS(사유 없는 확인/팀 교체 거부, 고정 참가팀 유지, stale 해소 후 경기 운영 가능). 이전 head Web CI PASS.

## 2026-11-16 사용자 지정 20팀 전체 풀리그 실측

API 실행으로 준비·반복 입력을 검증하고, 화면 판정은 실제 Alpha 브라우저 확인으로 별도 기록한다. 기존 임시 DB 직접 기록 테스트는 이번 실제 신청/운영/종료 흐름을 대신하지 않는다.

1. 대회 생성: `(테스트)` 이름의 이번 QA 소유 대회 하나. 1회전 풀리그만 사용. 예선 4팀씩 A~E 5개 편성, 본선 각 순위별 5팀씩 4개 편성. 대회 ID와 생성 전후 응답을 기록.
2. 신청/접수: 승인된 테스트 팀장 신원으로 서로 다른 20팀을 실제 신청·제출하고 운영자 접수 확정. 관리자 직접 등록/seed로 대체하지 않음. 신청 명단과 확정 20팀 일치 확인. 실제 결제는 하지 않음.
3. 대진: 30+40=70개 미정 경기 생성, 예선 5개 편성에 각 4팀 확정. 팀 중복/누락 0, 한 편성 상대별 1경기, 본선 미정 상태, fixture ID를 baseline으로 기록.
4. 대회 시작/예선: 정식 상태 전이 후 예선 30경기를 Game 종료·결과 리비전·공식 확정 계약으로 입력. 폐기된 fixture result API(TOURNAMENT_RESULT_DERIVED_ONLY)나 DB 직접 수정은 쓰지 않음. 동률 없는 결정적 점수로 조별 1~4위 및 각 팀 3경기 확인.
5. 본선 진출: 예선 마지막 결과 확정 직후 배정 상태를 먼저 관찰. 자동 배정 여부와 자동 후보 추천을 구분한다. 현행 코드에는 편성별 assignment 확정이 필요하므로 완전 자동 진출 PASS로 기록하지 않음. 각 본선에 A~E 동일 순위 5팀씩 추천·확정, 승점0·중복0·기존 fixture ID/일정 보존 확인.
6. 본선/종료: 본선 40경기를 동일 공식 경로로 진행. 5팀 편성마다 10경기/팀당4경기, 전체 팀당7경기 및 예선/본선 승점 분리 확인. 미완료 종료 거절과 70경기 완료 후 종료를 구분.
7. 결과/시상: `/tournaments/{id}/results`, `/tournaments/{id}/awards`에서 본선 4편성별 순위·상위3팀·시상 범위 일치 확인. 지원하지 않는 전체1~20위 환산이나 개인상을 성공으로 꾸미지 않음. 비로그인/운영자, 390/768/1440, HTTP/console/network 증거와 미검증 항목 기록.

자원: `qa/ranked-leagues-20261116`, `_worktrees/qa-ranked-leagues-20261116`는 이 실행 소유. 대회·팀·계정 식별자는 인증 이후 실제 생성/조회 성공 시에만 기록한다. 다른 세션 데이터·프로세스는 수정하지 않는다.

### 2026-11-16 실제 Alpha 실행 cursor

- 관리자 로그인 성공. 비밀번호·세션은 파일에 저장하지 않음. 앞선 인증 blocker는 해소.
- 사용자 추가 조건: 새 sm 계정, 20팀 × 팀당7명 = 140명(팀장 포함). 기존 팀·계정 재사용 없음.
- 생성 대회: `ee1675e5-264e-43ec-9a36-bd2f0a3099d9`, `(테스트) sm 20teams ranked leagues 20261116`, status=draft. 풋살, 등록7명/출전6명, 참가비0. 관리 URL `/admin/tournaments/ee1675e5-264e-43ec-9a36-bd2f0a3099d9`.
- 실제 stages generate 성공, revision=2. 예선 pre0~pre4 각각6경기=30, 본선 main0~main3 각각10경기=40. 관리자 bracket 재조회 fixtures=70, 고유ID=70. 모든 편성 참가팀 미정/미시작, 등록팀0.
- 첫 sm 계정 가입 POST는 HTTP400/PASSWORD_TOO_COMMON. 계정 생성0/140, 팀 생성0/20, 신청0/20, 결과 입력0/70. 대체 비밀번호를 요청했으며 비밀번호 검증 규칙을 완화하지 않음.
- 7단계 상태: 1 생성 완료, 2 신청 대기, 3 대진70개 생성 완료/팀배정 대기, 4~7 대기. 완전 완료1/7. 예선 전 본선 배정·종료·공개를 성공으로 처리하지 않음.
- 다음 실행은 같은 대회 ID를 재사용한다. 계정 생성 후 가입·온보딩·팀 가입/명단·신청의 실제 조건을 순차 검증하고 실패 원인을 기록한다. 신규 대회 중복 생성 금지.

### 2026-11-16 최신 실행 결과 (앞선 대기 cursor 대체)

실측 배포: `1acdeb40a0cbffb1e55423ba916fbb71e50d7fa4`. [비밀값 없는 API 증거](./evidence/sm-ranked-leagues-20261116.json).

| 요청 단계 | 결과 |
|---|---|
| 1 대회 생성 | 완료. 동일 소유 대회 ID 유지, 풋살·등록7명·출전6명·참가비0 |
| 2 팀 신청/접수 | 완료. 새 가상140계정/20팀 준비 후 팀장20명 실제 로그인, 7명 명단 추가, 신청 제출, 관리자 확정20/20 |
| 3 대진 구성 | 완료. 예선5×6/본선4×10=70경기, 5개 예선 편성 각각4팀 배정 |
| 4 예선 운영 | 완료. Game 시작→득점→종료→공식 리비전 확정30/30, 조별 순위9/6/3/0점 |
| 5 자동 본선 진출 | 부분 충족. 공식 후보는 정확하나 예선 종료 직후 본선4편성 모두 assigned=false. 운영자 확정4회가 필요. 확정 후 전원0점, 경기ID70개 보존 |
| 6 본선 종료 | 완료. 공식 결과40/40, 전체70/70·팀당7경기, 대회completed. 미완료 종료는 STAGE_RESULTS_INCOMPLETE로 거절됨 |
| 7 결과/시상 | 공개 API 및 서버 HTML 확인. 두 페이지HTTP200, 리그별1~3위 시상 HTML과 공개 순위 일치. 브라우저 접근 host unavailable 및 native app approval timeout으로 클릭·스크린샷·console/network·3폭은 미검증 |

본선별 최종 순위(왼쪽부터1~5위; 승점12/9/6/3/0):

- 1위 리그: sm01 / sm05 / sm09 / sm13 / sm17.
- 2위 리그: sm02 / sm06 / sm10 / sm14 / sm18.
- 3위 리그: sm03 / sm07 / sm11 / sm15 / sm19.
- 4위 리그: sm04 / sm08 / sm12 / sm16 / sm20.

계정 규칙: `sm20261116.tTT.pPP@teameet.test` (TT=01~20, PP=01~07), p01=팀장. 비밀번호·세션은 문서/스크립트/증거에 저장하지 않음. 사용자가 지정한 비밀번호로 팀장20명 로그인을 실제 확인.

일반 가입은 PHONE_NOT_VERIFIED로 차단돼, 기존 Alpha QA 스쿼드 방식에 맞춘 전용 추가 시드로 **이번 소유 가상 계정·팀만** 생성했다. 회원가입/본인인증 통과 테스트로 주장하지 않는다. DB host/name·대회 ID/title·결정적 user/team ID 및 이메일을 검증하며 기존 행·인증 설정을 변경하지 않았다. 신규 계정의 누락된 공개 기록 기본값은 recordSignupConsent(undefined)의 정책 표식 `v1-public-record-default-2`와 같은 방식으로 초기화했다(명시적 사용자 동의 아님, 기존 설정 보존). 이후 공개 득점자19명·70골·hiddenByEligibility=false 확인. MVP 등 개인 수상자는 별도 지정하지 않음.

실행 중 nginx300r/min 제한으로 HTTP503 1회 발생해 중단했고,260ms 직렬 요청 간격으로 제한 내에서 재개했다. 이미 공식 확정한 경기/기록은 재입력하지 않았다. Socket.IO는 브라우저와 같은 기본 transport/Origin으로 연결했다. 실패를 성공으로 처리한 fallback 없음.

결과 화면은 완료 상태에서도 최초 선택이 예선(`stages[0]`)인 것을 서버 HTML/코드로 확인했다. 본선 결과를 보려면 단계 선택이 필요하므로 최종 결과 첫 진입 UX의 후속 검토 항목이다. 실제 브라우저 verdict와 혼동하지 않는다.

Cleanup: 이번 임시 SecureString 삭제(ParameterNotFound 확인), Alpha 컨테이너 임시 시드 파일 제거(SSM Success). 대회·20팀·140계정은 사용자 재검토용으로 보존. 기존 사용자/팀/대회/운영 main 변경0. QA 전용 worktree의 미커밋 증거는 시각 QA 후속을 위해 유지; PR-ready/전체 QA PASS로 표시하지 않음.

## 2026-11-16 기존 대회 대비 동등성 감사

범위: v1 `group_knockout`, 기존 `league_knockouts`/multi-finals, 신규 stagePlan의 생성→신청→명단→대진→진출→경기→결과→시상 및 공통 운영. 비교 계약40개/정적 검토40개. 분류는 유지16, 격차19, 신규 확장1, 미검증4다. 유지가 모두 Alpha 실측 PASS라는 뜻은 아니다. API happy path와 코드 근거를 구분한다. 레거시 v0는 참조하지 않았다.

추가 실측: 기존 값을 그대로 보내는 PATCH3건(제목·사이드 라벨·조 이름)이 모두 HTTP409/STAGE_MANAGEMENT_REQUIRED. [증거](./evidence/sm-ranked-leagues-parity-20261116.json). 변경 없이 공식결과70건·9편성complete=true/stale=false 보존을 재조회했다.

| # | 계약 | 분류/우선순위 | 판단과 근거 |
|---|---|---|---|
| 01 | 단계·편성 생성과20팀템플릿 | 유지 | editor/plan 엔진 및 실제20팀 구성 round-trip |
| 02 | 팀장 신청·무료 결제 상태·참가 확정 | 유지 | 실제20팀 submit/confirm. 유료 PG 거래는 미실행 |
| 03 | 선수7명·등번호·골키퍼·명단 | 유지 | 명단 API140명, 경기 정본/자동 명단 연계 |
| 04 | 팀 종목·성별·정원·팀장 권한 | 유지 | 기존 registration service 재사용. 미설정 성별409도 관측 |
| 05 | 예선30+본선40 생성·ID보존 | 유지 | 고유fixture70, 진출확정 전후 같은ID |
| 06 | 같은 단계 중복/잘못된 출처 방지 | 유지 | validateStagePlan/assign의 서버 검증; 모든 실패분기 실측은 아님 |
| 07 | 다른 단계 동일팀 재참가 | 유지 |20팀 모두 예선+본선, 팀당7경기 |
| 08 | 편성별 승점·순위 분리 | 유지 | 본선0점 시작, 예선9/6/3/0·본선12/9/6/3/0 |
| 09 | 대회 누적 개인 기록 | 유지 | 일반가입 기본값 보완 후 공개19득점자70골·중복0 |
| 10 | Game/명단/실시간takeover/득점/공식결과 | 유지 | 실제 canonical 운영 경로70/70. 모든 카드·교체·연장 분기 실측은 아님 |
| 11 | 미완료 종료 차단/완료 종료 | 유지 | STAGE_RESULTS_INCOMPLETE 및70경기후completed |
| 12 | 결과 정정stale·재확정·시작후 유지확인 | 유지 | stage-view/service 및 기존 integration-spec. 이번 대회 정정 실측은 안함 |
| 13 | 개별 경기 시간·장소·구장API | 유지 | StageLegacyMutationGuard allowlist. 새 화면에서는 시간만 노출되므로15와 구분 |
| 14 | 대진 공개/예약/취소 UI | 격차 P1 | admin bracket/page의 stagePlan early return으로 기존 두 publish hook consumer(BracketTab/CanvasWorkspace)를 모두 건너뜀. StagePlanManager에는 공개 제어가 없음. API는 있고 이번 테스트도API로 공개 |
| 15 | 기존 관리자 대진 작업공간 | 격차 P1 | 그림/목록/모바일편집·시간구장배정 workspace·빠른결과 도구 대신 StagePlanManager(편성select/배정/시간목록)로 대체. 경기 운영 보드 링크는 존재하므로 결과입력API 부재로 해석하지 않음 |
| 16 | 최초 팀 무작위/일괄 배정 | 격차 P2 | 기존 random-fill guard차단, 단계형 첫단계는 자리별수동선택·편성별확정.20팀자동조편성 버튼 없음 |
| 17 | 미정 자리 유지·부분 배정 | 격차 P2 | StageAssignDto/service가 capacity 전원을 원자적으로 요구. 확정 전 일부 출처만 먼저 저장 불가 |
| 18 | 생성후 단계/편성명·진출규칙 수정 | 격차 P1 | stagePlan 변경은 그룹생성후BRACKET_LOCKED. 기존 조 이름수정도guard409. 구조와무관한 오타수정까지 같은잠금 |
| 19 | 경기 제목·홈/원정표시명·번호 편집 | 격차 P1 | 기존 UpdateFixtureDto 지원 필드가 stage guard allowlist에 없음. 제목/사이드label은 실제409재현, 번호는 코드차단 |
| 20 | 경기 추가·삭제·조 팀 배정해제 | 격차 P1 | 기존 topology mutation guard차단. 신규 stages API는get/generate/assignment/tie-break뿐. 미시작경기 안전수정 대체경로 없음 |
| 21 | 연결선/부전승/6강·교차12강 수동편집 | 격차 P2 | 슬롯·template·six-team guard차단, 새엔진에 동등한 편집계약 없음. 이번 전체풀리그에는 직접 필요없음 |
| 22 | 3·4위전/토너먼트3위이하 출처 | 격차 P2 | planCompetitionStages가thirdPlace:false, 출처rank>2 거절. 기존N개결선에는3위전옵션 있음. 이번풀리그에는 비해당 |
| 23 | 같은조회피·1위부전승·교차시드자동화 | 격차 P2 | 기존multi-finals-seeding 전용정책이새sources[]배정에는연결되지않음. 직접자리설정으로만대응 |
| 24 | 조간비교/와일드카드 진출 | 격차 P2 | 출처DTO가poolKey+rank만표현. 기존round12/조간비교전용진출을새구성에서호출불가 |
| 25 | 완전자동진출/예외수동진출 | 격차 P1 | 실측본선4편성assigned=false/후보정확/4회확정필요. 기존N개결선의순위밖참가팀직접선택과달리새assign은공식후보만허용 |
| 26 | 본선진출알림 | 격차 P1 | multi-finals.service는tournament_finals_advanced를businessKey와함께emit. StagePlanService.assign에는NotificationsService/동등발행없음. 수신함종단검증은미실행 |
| 27 | 새단계/편성별 경기시간 상속 | 격차 P1 | period source/scope는phase기준이고stageKey/poolKey를읽지않음. 예선리그와본선리그가모두group. 조별/개별재정의는가능하나새단계전체일괄설정없음 |
| 28 | 단계별동점순서 | 유지 | StageTieBreakOrder endpoint와InfoSection이연결됨. 운영owner/ops전용·공식결과후잠금. 없다고분류하지않음 |
| 29 | 독립편성 의존관계 기반 일정 | 격차 P1 | tournament-schedule-order는모든타단계경기를stageIndex로비교. 무관한이전편성의늦은시각도후속일정을막을수있음. 이번대회는미정일정으로진행해재현아님 |
| 30 | 최종결과기본단계/단계·편성·라운드탐색 | 격차 P2 | StagePublicView가항상stages[0]초기선택. 완료대회결과HTML도예선. 편성/팀/라운드필터·URL선택유지없음 |
| 31 | 순위표진출강조/공개배정상태안내 | 격차 P2 | advancingKeys=null, 공개응답은구조정의만. 운영view의assigned/stale/candidates표시와연결없음 |
| 32 | 전체1~20위 산출 | 격차 P2 | staged overall standings는빈값. 편성별순위구간매핑정의없음. 무조건승점합산을요구하는뜻아님 |
| 33 | 상세페이지편성별우승요약 | 격차 P2 | tournament-detail-client의getCompletedChampionName/getCompletedTrackChampions가stagePlan이면null/[]반환. 기존N결선과달리우승요약없음 |
| 34 | 팀시상·개인수상자·편성별시상설정 | 유지 | 시상서버HTML4개본선podium확인. admin AwardsTab도stagePlan/finalTracks지원. MVP는지정하지않았으며자동선정PASS아님. 관리자는모든단계track선택가능/공개podium은마지막단계이므로예선시상정책은정리필요 |
| 35 | 단계/편성별개인기록필터 | 신규확장 P2 | 현재공개기록은대회누적단위. 단계누적을별도비교하려면추가계약필요. 기존기능회귀라고하지않음 |
| 36 | 취소·무효·기권후재경기/완료복구 | 미검증 P1 | stage-view완료조건은예정경기수와모든completed+공식결과를요구, topology수정차단. 경기취소·결과void별복구시나리오가필요. 정상몰수공식결과까지불가하다고단정하지않음 |
| 37 | 누적카드/출전정지의단계순서 | 미검증 P1 | discipline/team-game-order는phase/round만보고stageKey를모름. 리그→리그는모두group, KO→리그는기존phase순서와새단계순서충돌가능. 새단계간정지소진및초기화정책실측필요 |
| 38 | 디렉터/조회스태프/일반선수권한과경쟁 | 미검증 P1 | 기존권한서비스재사용은확인. 이번실측은관리자+팀장뿐. 디렉터403경계·조회전용·CAS동시확정·결과정정경쟁은미실행 |
| 39 | 모바일/태블릿/데스크톱·focus·console/network | 미검증 P1 | 브라우저host불가/앱승인timeout. 390/768/1440각0회. HTML/API200으로시각PASS처리하지않음 |
| 40 | 영상·공지·후기·스태프·신청취소등공통부가기능 | 유지(코드) | 독립controller/service와canonical경기ID/대회ID를재사용,stageguard전체차단대상이아님. 각하위action의실제클릭/운영회귀검증은별도미실행 |

코드근거: `components/admin/stages/*`, `components/tournaments/stages/stage-public-view.tsx`, `app/admin/tournaments/[id]/bracket/page.tsx`, 기존`bracket-canvas/*`/`bracket-tab.tsx`, `tournaments/stages/*`, `multi-finals/*`, `slots/*`, `templates/*`, `competition-config/tournament-stage-period-config.ts`, `tournament-schedule-order.ts`, `discipline/team-game-order.ts`, `tournament-overall-standings.ts`, 공개상세/시상클라이언트. 신규앱코드수정/배포/기존결과수정없음.

우선수정순서:14공개제어→19표시정보편집→15대진작업공간연결→25진출정책/26알림→27시간범위/29의존일정→18·20안전한미시작편집→30·31·33공개결과경험.36~39는실제예외/권한/화면QA게이트로별도진행. 전체풀리그출시에21~24토너먼트특수기능을필수로끼워넣지않고,동등성백로그로유지한다.

## 2026-11-16 동등성 전체 수정 — 최신 cursor

사용자의 “싹 다 수정해서 PR” 요청으로 위 감사40항목 전체를 후속 범위로 고정했다. 위의 “21~24는 백로그 유지”는 이 요청으로 대체됐다. 기존 Alpha 대회 ee1675e5-264e-43ec-9a36-bd2f0a3099d9와70개 공식 결과는 그대로 두고, 수정 구현은 최신 origin/dev 1acdeb40a 기반 격리 브랜치 fix/stage-competition-parity-20261116에서 수행한다. main은 변경하지 않는다.

감사 처리40/40: 기존 유지16 + 수정/확장22 + 권한·경쟁 검증1 + 시각 QA 차단1. “수정/확장”은 코드 반영 상태이며 모든 조합의 Alpha 실측 통과를 뜻하지 않는다.

| 번호 | 수정·검증 연결 |
|---|---|
| 01~13,28,34,40 | 기존16계약 유지. 원래 Alpha70경기 증거, 기존 대진/기록/시상 회귀와 단계 실제DB 시나리오를 함께 사용. 부가 기능의 모든 하위 클릭을 실행했다고 주장하지 않는다. |
| 14 | stagePlan early return 제거. 기존 공개/예약/공개취소 consumer를 다시 연결. CanvasWorkspace 회귀 포함. |
| 15 | 그림/목록/모바일·시간/구장 workspace 복원. 참가팀은 단계 전용 관리로 편집하고 경기 정보·결과·진출 연결은 기존 도구 재사용. |
| 16 | 첫 단계 전체 무작위 배정. 전체 확정 정원·중복·시작 잠금·CAS·경기ID 보존 검증 추가. |
| 17 | null 미정 자리 포함 draft 저장. 확정과 구분하고 미확정 경기는 시작 거절. UI payload와 실제DB 검증. |
| 18 | 이름 수정과 구조 수정 분리. 변경한 미시작 편성만 교체, 다른 편성 경기/일정/기록 보존. 결과 있는 후속 편성 보호. |
| 19 | 표시 제목/사이드명/번호/조 이름 PATCH 허용. 팀 교체를 섞는 우회는 계속 차단. guard RED4→GREEN 확인. |
| 20 | 미시작 예정 경기 삭제·복원, 참가팀 미정 초안 해제. 마지막 경기 삭제 후에도 복원 진입 보존. 임의 초과 경기를 만들지 않고 풀리그/KO 예정 경기 수를 지켜야 완료 가능. |
| 21 | 일반 KO의 같은 편성 진출 연결 편집 재연결. 시드는 편성 배정 순서로 변경. 6강 전용 결승 직행/수동 결정과12강 교차 시드 추가. 자동 정책의 고정 연결은 보호. |
| 22 | 3·4위전 및 LOSER 연결, KO3·4위 공식 출처 지원. planner 회귀 추가. |
| 23 | 4개 조1~3위→12팀 교차 시드, 조1위 부전승·같은 조 최초 대결 회피. 기존 seeding 계산 재사용. |
| 24 | 같은 이전 단계의 조간 비교 와일드카드. 경기당 성적 비교, 동률 후보 반환, 직접 출처 중복 예약 차단. 순수 계산·실제DB 검증. |
| 25 | 공식 순위→durable outbox→별도 tournament worker 자동 진출. 기존 배정/초안/stale/동률은 보존·대기. 플랫폼 전용 사유 필수 예외 배정 추가. 실제20팀70경기 자동 본선·최종1~20위·종료 검증. |
| 26 | 확정 진출팀 owner/manager 알림과 businessKey 중복 방지. 커밋 후 기존 best-effort 발행 계약. Alpha 실제 수신함 전달은 미검증. |
| 27 | stageKey/poolKey 시간 설정·상속 복원, 대회 규칙 변경 시 피리어드 유지 재기반. 예선/본선이 모두group여도 별개, 시작한 경기는 보호. 실제DB·scope 회귀. |
| 29 | 실제 source의 전이 의존관계만 일정 제약에 사용. 무관한 편성의 늦은 일정으로 차단하지 않는다. |
| 30 | 완료 대회는 마지막 단계 기본. 단계·편성·팀·라운드 선택과 URL 유지. 변경한 범위에서 유효하지 않은 하위 필터를 정리. |
| 31 | 진출 순위 강조, 공개 assigned/stale/complete 및6강 안내. 내부 사유·권한 주체·시간 버전은 비공개. |
| 32 | 마지막 편성의 명시적 순위 구간, 중복/정원 범위 검증. 예선 승점 합산 없이 공식 최종 순위 매핑·공동순위 유지. |
| 33 | 마지막 편성별 우승/공동우승 요약. 정정 검토·미완료 편성은 우승 확정으로 표시하지 않는다. |
| 35 | 공개/관리 선수 기록 stageKey/poolKey 교집합 필터와 개별 query cache. 공개 자격 게이트 및 관리자 추천의 권한·비게이팅 계약 유지. |
| 36 | 취소/VOID 재경기는 옛 Game·이벤트·리비전을 보존하고 새 경기 생성. 미완료 VOID projection이 있으면409로 대기. 취소 복구 실제DB PASS; 모든 VOID·기권 조합 종단 실측은 아직 아니다. |
| 37 | 징계 경기 정렬을 구성 단계→기존 라운드→시각으로 보완. KO 뒤 리그도 원래 phase순서로 뒤집히지 않는다. 기존 누적 정책은 변경하지 않음. |
| 38 | 실제DB 동시 같은revision 한 요청만 성공. 담당 디렉터·조회전용·현장운영자·일반 사용자·타 대회·권한 회수 경계 검증 추가. 필드 운영자는 실제 field scope로 구성. |
| 39 | 브라우저 연결 재시도: Browsers: Error: The browser access host is unavailable. 390/768/1440 현재0/3. 로컬 Next로 대체하지 않았고 screenshots/console/network/focus PASS가 아니다. |

검증 환경은 이번 작업 소유 PostgreSQL16 컨테이너와 suite별 격리 clone이다. 전체241 migration을 Git과 같은 LF 사본으로 재생했다. 첫 Windows CRLF 재생은 약관 본문 해시 검사에서 실패했고 원본 migration 변경 없이 새 빈 LF DB에서 성공했다. 기존/운영 DB reset·seed는 하지 않았다. 공유 node_modules는 보존하고 현재 스키마 Prisma 클라이언트와 누락된 lockfile 의존성만 작업트리 안에 격리했다.

이미 확인한 결과: 단계 실제DB12건(20팀 자동 진출/70경기/전체순위/종료, 초안/CAS, 부분교체, 경기복구,6강,와일드카드,시간상속) PASS. 운영 UI125건 및 editor/public7건 PASS. 추가 권한·마지막 경기 복원·무작위 배정 및 실제 worker outbox 재처리 검증과 최종 타입/surface는 아래 최종 검증 기록으로 갱신한다. 테스트 준비 과정의 fixture 오류(worker timeout·현장 운영자 scope·종료 hook)는 제품 성공으로 가리지 않고 수정 후 해당 경로를 재검증한다.

사용자 요청은 dev 대상 PR까지다. Alpha3폭 갤러리는 저장소 규칙상 dev 머지·Alpha 배포 뒤 해당 PR에 추가해야 하며, 현재 브라우저 host 차단도 해소돼야 한다. 이 문서는 전체 QA 완료나 운영 main 승격을 선언하지 않는다.

### 최종 검증 기록 — 동등성 수정 PR

- 재리뷰 P1: 읽기 전용 stage-view가 교차 시드 계산을 통해 decorated LeagueFixtureGeneratorService까지 불러와 GamesService constructor metadata를 undefined로 고정했다. API CI에서 반복된 공통 Nest 초기화 실패를 냉시작 테스트로 재현(RED1), 순수 multi-finals-definition 분리 후 Nest 주입·기존 대진 계산34건 PASS. 실제 DB/HTTP는 health2·단계15·worker1 및 운영 보드58건 PASS. 운영 보드 첫 실행은 CI 선행 절차인 경기 규칙 프리셋 초기화를 빠뜨려58건 실패했으며, 공식 backfill CLI를 이 작업 소유 DB에 실행한 뒤 해당58건 전부 PASS. 제품 실패를 환경 성공으로 대체하지 않았다. 변경하지 않은 Web/Gates는 기존 head CI PASS이고 API 전체 CI는 수정 head에서 다시 확인한다.
- dev PR [#2419](https://github.com/kim-song-jun/matchup-sports-platform/pull/2419), 구현2e3e6e793. CI·Copilot 확인 중, Alpha 시각0/3 차단. 검증 전용 PostgreSQL 컨테이너·볼륨과 공유 의존성 링크 정리 완료; 미병합 worktree와 Alpha 원본 테스트 데이터 보존.
- 6강 완료 후 첫 경기 성적 정정으로 직행팀이 달라지는 실제DB 회귀: 수정 전 complete=true 오판 RED1 → 최신 실제 준결승·결승 배정 일치를 완료 조건에 추가 → 같은 경로 GREEN1. 마지막 boolean 조건 변경은 해당 실제DB/TypeScript 컴파일 경로로 재검증했다.
- 격리 PostgreSQL16/LF241 migration 재생 PASS. `stage-plan.integration-spec.ts` 15/15 PASS: 20팀 자동 본선 진출·70경기·1~20위·종료, 혼합3단계, 예선 없는 리그/KO, 초안/CAS, 부분교체, 시간 상속, 경기 복원/취소 재경기,6강·와일드카드, 권한, 마지막 경기 복원, 무작위 배정. 취소 표시로 유효한 공식 결과를 재경기 처리하는 우회도 거부하는지 검증했다.
- `stage-auto-worker.integration-spec.ts` 1/1 PASS. 실제 공식 순위 projection을 두 번 실행해 outbox가 하나인지 검사하고 실제 worker가 본선을 배정한 뒤 재처리해도 revision을 바꾸지 않는지 검증했다.
- API `tsc -p tsconfig.spec.json --noEmit`, `v1-surface-check.mjs` PASS(원시 대회 단건 조회0). worker DI/기존 bracket2 suites238건, 단계·시간·개인기록 관련9 suites56건,6강 비교 순서/후속 배정2건 PASS. 서로 겹치는 실행의 건수를 합산하지 않는다.
- Web 기존 workspace/node-panel/awards/manager4 suites125건, editor/public7건 PASS. 최종 변경 후 Web `tsc --noEmit`·`v1-pattern-check.mjs` PASS, workspace/manager/editor/public4 suites65/65 PASS(이전 실행과 중복되므로 합산하지 않는다).
- 소유 변경76개 경로만 스테이징 검토, `git diff --check` PASS. 비밀 literal 검사0건, touched 단계/QA 도구의 TODO/FIXME/HACK/XXX0건. `.env*`를 읽거나 출력하지 않았다. 테스트 계정 비밀번호·로그인 쿠키는 증거·PR에서 제외했다.
- Alpha 시각 검증0/3 차단. 기존 완료 대회70경기와140명·20팀은 보존하며 새로운 코드의 Alpha UI 성공으로 대체 표시하지 않는다.
