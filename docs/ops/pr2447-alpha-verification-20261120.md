# PR #2447 Alpha 검증 — 2026-11-20

## 현재 판정

dev 머지·Alpha 배포 완료. 운영(main) 승격은 실행하지 않았다. 전체 수동 QA 완료 판정은 보류한다.

- PR 최종 head: `775cb4fd332895f53a616fcee5b7d7ec414515be`, dev merge: `f5f1a21feff9c386c8346828ad03bf0709b067ae`.
- 최종 head의 Gates/API/Web/security 성공. 실제 API 로그에서 PostgreSQL 212파일 1624 PASS(기존 3 SKIP), 단위 562파일 9391 PASS 및 회원 접근 통합 테스트 실행을 확인했다.
- 실제 Alpha 배포: [44693865003](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/44693865003), SSM 배포 및 공개 identity 확인 단계 성공.
- 공개 응답 commit `1e33edbcdc962b5c5f06a500629af2e9e6e00009`, release `1.22.0-alpha.20261120.g1e33edbcdc96`. 이 dev에는 #2447이 포함된다. health 200·DB true, member-access 상태 API 200을 확인했다.
- 앞선 배포 run의 success는 최신 dev 보호로 SSM 단계가 skip된 결과였다. 그 결과를 배포 증거로 사용하지 않는다.

## 수정된 배포 차단 사항

- 회원 조회 중 모든 chat 하위 API를 403으로 막는다. 일반 회원의 채팅은 유지한다.
- 알림 설정 GET의 upsert를 제거하고 미저장 기본값을 반환한다.
- 팀 컨택 요약 GET은 신뢰된 회원 조회 컨텍스트에서 만료·보관 저장을 생략한다.
- 홈 채팅 요약·채팅 레이아웃은 조회 제한을 명시하며, 상태 확인 전에 채팅 하위 화면을 마운트하지 않는다.
- 실제 HTTP 가드·ChatService 회귀 및 PostgreSQL 설정 행 생성/updatedAt 불변 회귀를 추가했다. SSR 첫 렌더의 localStorage 접근도 effect로 이동했다.

## 실제 Alpha 수동 결과

도구: ego-browser(ego-lite), 기존 관리자 로그인, 테스트 전용 회원·팀. 데이터 변경/상태 변경/제재는 실행하지 않았다.

| 화면 | 실제 확인 | 결과 |
|---|---|---|
| 회원 목록 | 검색, 이메일 제공자 필터, 상세 왕복 시 `q`·`providers=email` 유지 | 통과 |
| 회원 상세 | 운영 정보, 이력 섹션, 대회 명단 2건, 공식 출전 14건의 1→2→1 페이지 이동 | 통과 |
| 팀 목록 | 팀장 이메일 검색, 풋살, 서울→종로구 연속 필터, 결과 1팀 | 통과 |
| 팀 상세 | 운영 이력 0/0/0·경기 14·대회 명단 2건, 팀장 회원 링크 및 소속 팀 복귀, 목록 필터 유지 | 통과 |
| 회원 조회 홈 | 실제 조회 시작 POST가 403 `RECENT_LOGIN_REQUIRED` | 진행 차단 |
| 회원 조회 채팅 | grant를 발급받지 못해 활성 조회 상태 진입 불가 | 진행 차단 |

기능 화면 4/6 확인, 2/6 차단. 어드민 4화면 × 390/768/1440의 12/18 조합에서 DOM scrollWidth 가로 넘침 없음. 이 수치는 완전한 시각 합격을 뜻하지 않는다. 팀장 왕복 구간의 수집된 console exception/error 및 HTTP 4xx/5xx 이벤트는 0건이다.

조회 시작 모달에서 사유를 입력하고 실제 시작 버튼을 눌렀다. 화면에 “회원 조회를 시작하려면 관리자 계정으로 다시 로그인해 주세요.”가 표시됐다. 이후 active=false, 원래 관리자 신원 유지, grant 생성 없음을 확인했다. 최근 로그인 게이트를 우회하거나 세션을 위조하지 않았다.

## 남은 검증과 캡처 한계

- 관리자 재로그인 뒤 활성 조회 홈/채팅, 조회 제한, 종료·복귀, 다른 탭·만료의 실제 Alpha 흐름을 이어가야 한다. CI의 HTTP/DB 검증을 해당 수동 PASS로 대체하지 않는다.
- baseline 4화면 × 3너비는 로컬 `tmp/pr2447-review/before-*.png`에 있다. 변경 후 회원 상세 full-page 캡처는 아래 evidence 폴더에 보존했으나 fixed chrome 위치에 캡처 아티팩트가 있어 전체 시각 PASS 증거로 사용하지 않는다.
- 이후 ego screenshot이 `Page.captureScreenshot` timeout을 반복했다. 문서와 클릭은 동작하며 기본 viewport에서도 캡처 실패를 확인했다. 허용된 재시도 후 중단했다. 12/18 구조 측정과 스크린샷 시각 검증을 구분한다.
- 새 버그로 단정할 근거가 없는 브라우저 캡처 문제 때문에 모든 너비의 전후 시각·focus/sticky 검증은 미완료다.

## 자원과 재개

구현 worktree/검토 branch는 merged ancestor·잔여 변경 확인 후 제거했다. 다른 세션 자원은 보존했다. QA 문서 branch `qa/pr2447-alpha-evidence-20261120`와 evidence는 후속 검증을 위해 보존한다. 로컬 Next/API 서버, seed/reset, 운영 승격은 실행하지 않았다.
