# Alpha QA 후속 실행 — 2026-10-02

정본 진행 상태: [Task 182](../../.github/tasks/182-alpha-qa-continuation.md).

## 이번 실행의 결과

2026-10-02 13:58–14:03 KST, `https://alpha.teameet.co.kr` 실제 API로 검증했다. 브라우저·실기기 검증은 포함하지 않는다.

| 항목 | 실제 관측 | 판정 |
|---|---|---|
| 릴리스 | landing HEAD 200, SHA `bf47852a26476a38ca538c07d7afb1d9f7654a15`, `1.1.1-alpha.20261002.gbf47852a2647` | PASS |
| API·DB | health 200, success envelope, `checks.db=true` | PASS |
| 공개 대회 | 목록 21개, 다음 커서 없음, 상세 21/21 | PASS |
| 공개 경기 | 위 대회 상세에서 노출한 fixture 44개를 실제 match API로 조회, 44/44 성공 | PASS |
| 대표 계정 | 로그인 201·세션 쿠키 발급·본인/팀/명단 GET 200, 4/4 | PASS |
| 팀 정보 저장 | 전용 QA 팀 생성 후 소개 PATCH, 새 GET의 소개·팀명 대조 | PASS |
| 등번호 저장 | 전용 팀의 팀장 등번호 PATCH 후 명단 GET에서 77 확인 | PASS |

공개 경기 검증은 fixture 발견 개수를 분모로 사용했고 실패를 생략하지 않았다. 이번에는 공개 대회 목록 기본 종류인 tournament가 대상이다. 리그·친선 팀매치 전수 검증을 의미하지 않는다.

대표 계정은 사용자가 제공한 네 팀의 첫 번째 선수다. 세 계정은 owner, 나머지는 member였다. 해당 팀 명단 6·6·6·7명을 확인했으며 모두 다음 페이지가 없었다. 첫 계정은 별도 1인 팀에도 owner로 가입되어 있었다. 계정 아이디와 개인 정보는 이 문서에 기록하지 않는다. 24명 전수 로그인·로그아웃은 이전 인계의 결과이며 이번에는 4명만 검증했다.

## 실행 경로

읽기: landing HEAD → health GET → tournaments 목록 → 각 대회 상세 → 노출 fixture의 공개 경기 상세.

인증: auth/login POST → auth/me GET → me/teams GET → 해당 팀 상세·members GET.

저장: 팀장 로그인 → teams POST(전용 팀) → 팀 상세 GET(version 확보) → teams/:teamId PATCH → 새 GET 값 비교 → team-memberships/:membershipId/jersey PATCH → members GET 값 비교.

HTTP 200뿐 아니라 success envelope를 검사했으며 저장은 새 GET의 실제 값으로 판정했다. 첫 실행의 명단 저장 증거는 팀 고정 등번호만 포함한다. 후속 관리자 경기 명단 검증은 아래에 별도 기록한다.

## 생성 대상과 cleanup

- 전용 팀: `Alpha QA 1002-050308`, closed 가입 정책, 팀장 1명. 소개와 등번호만 변경했다.
- 기존 팀·경기·공식 결과를 수정하지 않았다. 로그인에 따른 테스트 계정 lastLoginAt 갱신은 발생한다.
- QA 팀은 다음 검증용으로 유지했다. 삭제·탈퇴·원복은 실행하지 않았다.
- 세션 쿠키는 메모리에서 폐기했다. 브라우저 로그아웃 동작을 검증한 것은 아니다.
- 실행한 Python 프로세스는 모두 종료했다. 브라우저·앱·DB 프로세스는 시작하지 않았다.
- 저장소 밖 `/tmp/teameet-alpha-{continuation,actors,save}-result.json`에 로컬 실행 결과가 있다. 저장 결과에는 Alpha QA 대상 ID가 포함되며 비밀번호·쿠키는 없다. `/tmp`는 영구 보관 장소가 아니다.
- 이번 문서와 task는 로컬 미커밋 상태다. 이전 로컬 준비 보고서·QA 도구는 현재 조사 범위에서 찾지 못했다.

## 남은 실행 조건

| 시나리오 | 미완 사유 | 다음 실행 |
|---|---|---|
| 팀 저장·명단 브라우저 흐름 | 브라우저 QA 도구 없음 | Alpha 실제 로그인·클릭·저장·재진입, 390/768/1440 캡처·console/network 확인 |
| 경기 출전 명단 권한별 검증 | 관리자 제외·복원 API는 완료, 팀장·매니저·일반 팀원 미검증 | 참가팀의 해당 역할 계정으로 저장/거부 및 새 GET 비교 |
| 경기 운영 브라우저 흐름·전적 | 관리자 시작·득점·종료·결과 확정과 공개 경기 대조는 완료 | 실제 운영 콘솔 클릭, 팀/개인 전적 및 알림 대조 |
| Kakao OAuth | 실제 브라우저·Kakao 인증 경로 미확보 | 실제 Kakao 리다이렉트·콜백·로그인 상태 확인. 이메일 로그인으로 대신 판정하지 않음 |
| Android Alpha | adb·실기기 실행 환경 없음 | Alpha 앱에서 로그인·팀 접근·앱 복귀 및 기존 Android 시나리오 수행 |
| 최신 clean 리뷰 | gh 없음, 인계상 quota 오류 | 후속 실행에서 실제 리뷰 도착·finding 처리·최신 SHA 기준 재확인 |
| 이전 산출물 정리·dev 반영 | 보고서·도구 위치 미확보, 공유 트리 dirty | 기존 파일 위치 확인 후 범위를 검토하고 명시 pathspec으로 반영 |

## 배포 경계

Production `f49742f4` / 0.5.0, 승격 PR #1325 보류, CI 통과·changeset 소비·189개 migration 및 Stage A/B 테스트는 사용자의 이전 인계 기록이다. 이번 실행에서 재확인하지 않았다. main 승격, Production 승인·DB 변경, PR 수정, 유료 리소스 생성은 하지 않았다.

fetch한 dev와 이번 Alpha SHA는 일치하지만, 현재 checkout HEAD `f58fe862a`는 다르다. 따라서 위 PASS를 로컬 HEAD·향후 배포 후보의 검증으로 사용하지 않는다.

## 후속 관리자 전용 경기 QA — 14:15–14:19 KST

사용자가 관리자 계정과 전용 경기 생성·테스트를 명시적으로 허용했다. 비밀번호·세션은 비표시 입력과 프로세스 메모리로만 사용했다. 관리자 개인정보는 보고서에 기록하지 않는다.

Alpha 릴리스 헤더와 API·DB health를 재확인한 뒤, Alpha 전용 `POST /admin/mock-seed/tournaments`로 **새 대회 1개·2팀·1경기**를 만들었다. 결과 미생성 옵션을 명시했다. 생성 API는 전원이 테스트 도메인 계정인 팀만 선택하므로 실사용자 팀은 포함되지 않았다. 참가 명단과 예정 경기를 준비하는 용도로만 사용했고, 결과는 운영 API로 실제 생성·확정했다.

전용 대상: [(목업) 1002-0515 전용 경기 QA](https://alpha.teameet.co.kr/tournaments/95a12047-c2f9-4c30-aab2-ba978d0c6653). [검증한 경기](https://alpha.teameet.co.kr/tournaments/95a12047-c2f9-4c30-aab2-ba978d0c6653/matches/e3402527-ecab-414b-be86-2bea2b87eb59).

| 순서 | 실제 API와 판정 | 결과 |
|---|---|---|
| 1. 명단 제외 | 홈팀 출전자 3명 중 1명을 INJURY로 제외, 새 roster GET에서 출전자 2명·제외 사유 확인 | PASS |
| 2. 중복 제외 | 동일 선수 제외 재요청에서 `alreadyApplied=true`, 중복 처리 안 됨 | PASS |
| 3. 명단 복원 | revoke 후 새 roster GET에서 출전자 3명 복원, 변경 이력 2건 확인 | PASS |
| 4. 운영권 | 인증된 `/game-operations` Socket.IO로 takeover 발급 | PASS |
| 5. 경기 시작 | start 후 Game LIVE/version 1 | PASS |
| 6. 명단 잠금 | 시작 후 제외 요청 409 `LINEUP_DEADLINE_PASSED`, 전후 roster 응답 hash 불변 | PASS |
| 7. 득점 | 홈 선수 GOAL 이벤트 저장, sequence 1/version 2 | PASS |
| 8. 재전송 | 같은 Idempotency-Key/clientEventId와 본문 재전송, sequence/version 동일 | PASS |
| 9. 전반 종료 | end-period 후 1피리어드 ENDED·2피리어드 HALFTIME. Game 전체 state는 LIVE 유지 | PASS |
| 10. 후반 | start-period 후 2피리어드 LIVE, end-period 후 모든 피리어드 ENDED | PASS |
| 11. 경기 종료 | end 후 Game ENDED/version 6. SUBMITTED 리비전 1:0과 resultParticipants 11건 확인 | PASS |
| 12. 공식 확정 | 서버 계약대로 preview hash를 계산해 officialize, OFFICIAL 리비전과 Game 공식 리비전 포인터 재조회 | PASS |
| 13. 공개 결과 | 비인증 경기 GET에서 `ended`, `resultState=official`, `scoreStatus=official`, **홈 1:0 원정** | PASS |

명단 복원은 테스트 대상의 정상 사용자 API 흐름으로 수행했다. 기존 대회·경기 명단이나 결과를 변경하지 않았다. 테스트 팀에는 이 새 대회 참가와 공식 경기 기록이 추가된다. 생성한 대회·경기는 종료·확정 상태로 유지하고 삭제하지 않았다.

### 실행 중 발견한 하네스 문제와 검증 한계

- 최초 생성 후 admin 대회 상세에 fixtures가 있다고 가정한 하네스가 실패했다. 공개 대회 상세로 조회 경로를 수정하고 **같은 대회**에서 재개했다.
- 최초 websocket-only 연결은 실패했다. 브라우저 클라이언트와 같은 polling 시작·websocket upgrade 지원 설정 및 Origin 헤더를 적용한 Socket.IO 연결로 takeover가 성공했다. 원인 변수 둘을 독립적으로 분리하지 않았고 최종 transport를 기록하지 않아 **websocket-only 정상 판정은 하지 않는다**.
- 최초 전반 종료 판정은 Game 전체 state를 HALFTIME으로 기대해 실패했다. 계약상 HALFTIME은 피리어드 상태이므로 각 period의 상태를 검사하도록 수정했다. 실제 커맨드 실패는 아니었으며 같은 경기의 후반부터 재개했다.
- API가 선택한 홈팀이 제공된 세 테스트 팀장 계정의 팀과 일치하지 않았다. 팀장·매니저·일반 팀원 명단 권한 검증은 실행하지 않았다. 관리자 검증으로 대신 통과 처리하지 않는다.
- 브라우저 클릭·스크린샷·viewport·console 검증, 실제 Kakao OAuth와 Android 확인은 미실행이다. API 흐름 통과와 구분한다.

실행 하네스와 체크포인트는 저장소 밖 `/tmp/teameet-alpha-game-qa.mjs`, `/tmp/teameet-alpha-game-qa-launch.py`, `/tmp/teameet-alpha-game-qa-result.json`에 있다. 결과 파일에는 위 실패 기록과 재개 이후 PASS를 함께 보존했다. 비밀번호·쿠키·takeoverToken은 파일로 저장하지 않았다. Python/Node 실행은 종료했고 소켓을 닫고 메모리 세션을 폐기했다. main·Production·PR #1325 변경, 유료 리소스 생성은 없다. 이 문서는 여전히 로컬 미커밋이다.


## 후속 headed 브라우저 QA 및 저장 오류

WSLg와 Playwright 캐시의 Chromium을 사용했다. 시스템에 누락된 공유 라이브러리는 공식 Ubuntu 패키지를 `/tmp`에만 풀어 사용했다. 시스템 패키지와 프로젝트 의존성은 변경하지 않았다. 최신 브라우저 PID 59510, 부모 Node PID 59441은 종료했다. 이전 실패 실행의 브라우저도 각 실행의 finally에서 닫았다.

| 화면·행동 | 390 / 768 / 1440 | 판정 |
|---|---|---|
| 전용 팀 상세·편집·저장 오류 표시 | 각 3장, 가로 넘침 0 | 화면 확인, 저장 FAIL |
| 관리자 종료 경기 운영 화면 | 각 1장, 가로 넘침 0 | 공식 1:0·득점 이벤트·실시간 연결 확인 |
| 비인증 공개 경기 기록 | 각 1장, 가로 넘침 0 | 공식 1:0·확정 이력 확인 |
| 팀장·관리자 UI 로그인/로그아웃 | 실제 클릭 및 세션 쿠키 삭제 | PASS |
| 카카오 시작 | accounts.kakao.com/login/ 도착 | 리다이렉트 PASS, 실제 OAuth 미완 |

최종 관리자·공개 실행에는 pageerror가 없었다. console/network 진단 4건은 비인증 auth/me 401 두 번 및 해당 리소스 오류 두 건이다. 공개 조회는 성공했다. 화면 스크린샷은 실제 확인했고 결과·액션을 읽을 수 있었다.

### 재현한 제품 오류

팀장 1명인 QA 팀에서 소개만 수정하고 저장하면 HTTP 400 `VALIDATION_ERROR`가 발생한다. 화면 정원은 2명으로 표시되지만 요청의 `memberGoalCount`는 1이다. API DTO는 최소 2를 요구한다. 팀 편집 초깃값은 현재 인원과 목표 정원의 최댓값만 적용하고, 정원 select는 별도로 최소 2를 표시해 값이 어긋났다. 실패 상태에서 소개는 변경되지 않았다. 정상 저장으로 판정하지 않는다.

분리한 작업트리 `/tmp/teameet182-capacity-fix`는 fetch한 dev `bf47852a2` 기반이다. 수정·회귀 테스트 결과는 아래 진행 기록으로 남기며 Alpha 재배포 전 해결 완료로 판정하지 않는다.

### 하네스 보정과 잔여 검증

초기 UI 로그인에서 빈 email/password 제출 400이 두 차례 발생했다. DOMContentLoaded 직후 SSR 입력창에 채운 값이 hydration 중 초기화된 것으로 추정한다. 페이지 load와 안정화 대기 후 관리자 실제 UI 로그인은 통과했다. 제품 로그인 장애로 확정하지 않는다.

브라우저 증거: `/tmp/teameet182-browser-attempt3`(팀 저장 실패 및 원본 요청), `/tmp/teameet182-browser-evidence`(관리자·공개·Kakao, report.json). 계정·비밀번호·쿠키는 저장하지 않았다. 실제 Kakao 사용자 인증/콜백 및 Android 앱 확인, 팀장/매니저/팀원 경기 명단 권한 검증은 여전히 미완이다.


### 정원 수정안 검증 결과

- 브랜치: `fix/alpha-team-capacity-minimum-20261002`, 기준 dev `bf47852a2`.
- 수정: 편집 hydration의 capacity를 `Math.max(2, 목표 정원, 현재 인원)`으로 계산. UI와 API 최소값을 일치시킨다. API·DB 계약이나 레이아웃은 변경하지 않았다.
- 회귀: 목표 정원 null/1, 현재 인원 1의 두 조건에서 수정 전 요청 값 1로 RED 2/2. 수정 후 form model 값과 제출 정원 2 확인, 기존 팀 폼 테스트 포함 GREEN **31/31**.
- 실행: v1_web에서 `vitest run src/components/teams/teams-form-client.test.tsx --maxWorkers=1 --minWorkers=1`. 수정 전 116.40초, 수정 후 127.72초. 공유 마운트 의존성 읽기가 대부분의 시간을 사용했다. 고부하 전체 suite·build는 실행하지 않았다.
- `.changeset/alpha-team-capacity-minimum.md` 포함. 소스 2파일, Changeset 1파일, 이번 task/증거 문서만 분리 작업트리에 보존.
- 변경 diff 자체 검토·diff --check·추가 debt marker 검사 완료. 최신 Copilot/AI clean 리뷰, committed-tree 검증, dev 반영 및 수정 후보 Alpha 브라우저 재검증은 미완이다. 기존 Alpha에서 관측한 저장 FAIL은 해결 완료로 바꾸지 않는다.
- 테스트용 node_modules 링크 두 개는 실행 종료 후 제거했다. 원래 의존성 디렉터리는 변경하지 않았다. 이번 테스트와 브라우저 프로세스 종료 확인.


### dev 반영 전 후보 검증

독립 작업트리에 frozen lockfile로 v1_web 의존성을 설치했다. 기존 공유 의존성은 React Query 5.91이고 후보 lockfile은 5.102.8이어서 첫 타입 검사가 실패했지만 lockfile 환경에서는 통과했다. v1 패턴 검사는 sandbox spawnSync EPERM을 기록한 뒤 동일 후보에서 해당 검사만 재실행해 통과했다. Changeset 정책 검사 통과. 코드 자체 검토에서 정원 UI 최소값 2와 API DTO Min(2), 기존 인원 하한 보존을 확인했다. 외부 Copilot/AI 리뷰는 PR 기준으로 별도 확인하며 이 자체 검토를 외부 clean 리뷰로 기록하지 않는다.
