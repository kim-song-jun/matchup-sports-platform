# 실제 어드민을 사용하는 대회 운영 체험

Task: [20261123](../../.github/tasks/20261123-tournament-ops-demo.md) · PR #2168
Status: initial Alpha flows PASS; preview iframe isolation FAIL, follow-up fix in progress

2026-11-05 사용자 A안 선택으로 기존 5단계·3개 역할의 별도 시뮬레이터 계획을 대체한다.
기존 `/admin/ops/tournaments`, `/my/tournament-staff`의 새 탭 진입과 로그인 없는 공유 URL은 유지한다.

## 화면과 범위
- `/tournament-ops-demo`: 실제 관리 셸과 개요.
- 하위 11개 관리 섹션: overview, info, registrations, bracket, announcements, sponsors, popups, campaign, reviews, awards, statistics.
- 현장 화면 2개: staff, operations. 실제 기존 컴포넌트를 재사용한다.
- 모든 엔티티와 역할은 명시된 샘플이다. 실제 인증·권한·DB·알림을 만들지 않는다.
- 전용 QueryClient와 명시적 로컬 source를 사용한다. 미지원 경로도 실제 API로 넘기지 않는다.
- 실제 서비스로 가는 샘플 링크는 비활성 사유를 표시하고 anchor를 만들지 않아 Next prefetch도 막는다.
- 관리자 전용 팝업 미리보기 iframe에도 같은 경계를 적용한다. 체험에서는 프레임·화면 크기 버튼 대신 제한 사유를 표시하며 실제 `/admin-content-preview` 문서를 열지 않는다.
- v2 명령 이력을 검증·재생해 새로고침을 복원한다. 공유 링크에는 이력·개인 정보를 담지 않는다.
- 4팀 풋살 토너먼트를 지원한다. 실제 파일 업로드·회원 초대·외부 캠페인 발행·경기별 출전 명단 조정은 미지원이며 오류를 표시한다.

## 실행 시나리오
| # | 실제 사용자 흐름 | 로컬 검증 | Alpha after |
|---|---|---|---|
| 1 | 비로그인 진입과 실제 11개 관리 메뉴·현장 2개 화면 | 실제 컴포넌트 13/13 PASS | pending |
| 2 | 대회 정보 수정 모달 → 저장 → 헤더 반영 | 실제 UI PASS | pending |
| 3 | 팀 카드 → 확인 모달 → 4팀 참가 확정, 대기는 별도 상태 | 실제 UI·모델 PASS | pending |
| 4 | 실제 대진 마법사 → 4팀 미리보기 → 생성·팀 배정 | 실제 모델 PASS | pending |
| 5 | 실제 칸 상세 → 점수 입력 → 확인 → 결승·통계 반영 | 실제 UI·모델 PASS | pending |
| 6 | 새로고침 복원과 정상/손상 세션의 자기 체험 초기화 | 실제 UI·모델 PASS | pending |
| 7 | 저장 실패 시 오류·점수 미반영, 변조·실제 ID 요청 거부 | 실제 UI·모델 PASS | 미실행 |
| 8 | 공유 실패 직접 복사와 다른 저장 키 보존 | 실제 UI PASS | 미실행 |
| 9 | 실제 데이터 요청·체험 밖 링크 prefetch 없이 3개 viewport 탐색 | UI fetch 0·링크 계약 PASS | pending |

## 증거
- 2026-11-06 첫 Alpha 실측 SHA `408b665a685eba127fda127167954a04b418085e`, 배포 run `42139280720` SUCCESS.
  실제 편집·4팀 확정·대진 생성/배정·점수 확정·새로고침·정상/손상 초기화·공유 실패 안내 PASS, 39/39 viewport overflow 없음.
  팝업 미리보기의 별도 관리자 iframe에서 `/api/v1/admin/me` 401이 3회 발생해 전체 QA는 FAIL이다.
  `initial-alpha-report.json`과 `initial-alpha-popups-{390,768,1440}.png`에 초기 실패를 보존했고 iframe 경계 수정 후 재배포·재검증한다.
- UI 19 + 모델 5 + navigation scope 2 + 기존 어드민 회귀 41 + 운영 보드 30 = 97개 관련 테스트 PASS.
- tsc PASS, pattern gate PASS. 패턴 검사의 POSIX find는 WSL에서 실행했다.
- Alpha before SHA `0b7720cb7`, 390/768/1440 3/3 캡처, console/page errors 0, 가로 overflow 0.
- Alpha after: 0/13개 화면·0/3폭. 미배포 코드를 기존 Alpha로 PASS 처리하지 않는다.
- [캡처 디렉터리](../screenshots/tournament-admin-demo-20261105/)와 before-report.json에 PID/PPID·cleanup·API 경로를 기록했다.
- `scripts/qa/capture-tournament-admin-demo.cjs`는 Alpha 전용 headed Chrome에서 실제 클릭으로 실행한다. 토큰·세션·로그인 정보는 쓰지 않는다.
- 앱 공통 `/api/v1/health` 조회와 체험 엔티티 API 요청을 구분한다. 샘플 ID를 포함한 실제 API 요청은 0이어야 한다.
