# PR #1951 Alpha 배포 확인

- 배포 run: https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/38850258486 (SUCCESS)
- dev 머지/서비스 SHA: 200cd2ff41bdc6bf1b0d6713f8e8f23bf31e4748
- 서비스 release: 1.9.4-alpha.20261016.g200cd2ff41bd
- 2026-10-16 13:43 KST /landing HTTP200, API health success, db=true 확인.
- dev 로컬 작업트리 synced-dev-20261012를 merge --ff-only로 동기화.

## 실제 공개 사용자 흐름

headed Chrome, 응답 가로채기/인증 주입 없이 원래 제보 fixture URL을 열고 전체 순위표·일정 보기 클릭. 1440/768/390 모두 bracket?tab=standings&from=%2Fhome로 이동, 리그 순위 aria-selected=true 및 실제 순위표 렌더 확인. pageerror/console error/HTTP실패/가로 넘침 0. 이미지 직접 확인.

증거: docs/screenshots/pr1951-alpha-navigation/{1440,768,390}-standings.png 및 results.json.
초기 QA의 networkidle 대기는 지속 통신 때문에 timeout, 모바일의 숨겨진 h1 대기도 timeout. 실제 링크/탭/표 준비 기준으로 수정하여 최종 3/3 PASS. 이는 QA 대기 조건 수정이며 제품 코드 변경 없음.

## 참가팀 레이아웃

배포 Alpha 1440/768/390에서 기존 browser fixture로 참가 상태만 구성. desktop 오른쪽 참가 카드와 8개 안내 표시, 버튼 좌우 delta=0, tablet/mobile 본문 카드 유지. pageerror/가로 넘침 0. 실제 계정 인증 검증은 아님. settings 및 notifications 401은 fixture 한계로 보존.

증거: docs/screenshots/tournament-sidebar-local/fixture-member/alpha-deployed/ (디렉터리는 기존 도구 규약, 실제 URL은 결과 JSON의 alpha.teameet.co.kr).

## Cleanup / 제한

최종 navigation Node32956/Chrome44336, sidebar Node15428/Chrome26912. 각 도구 finally에서 생성 브라우저 종료. 기존 사용자 로컬 서버는 유지. Copilot 모델 세션 생성 실패는 기존 PR에 기록되어 있으며 독립 코드 리뷰를 Copilot clean으로 대체하지 않음.