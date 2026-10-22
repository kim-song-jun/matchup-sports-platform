# PR2035·2036 alpha 배포 증거

2026-10-22, 배포 대상 alpha.teameet.co.kr. 최종 커밋 `0b0ac9a39333cc90d4556d437ab923575f34eaa4`, release `1.11.5-alpha.20261022.g0b0ac9a39333`.

- PR2035 merge: `d56cc04ed940c55663df93fa3038c039cc5945fc`.
- PR2036 merge: `0b0ac9a39333cc90d4556d437ab923575f34eaa4`.
- [dev CI Gates/API/Web PASS](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/39751993655).
- [Deploy Alpha SUCCESS](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/39751993510).
- Copilot은 양쪽 PR에서 `Model "claude-opus-5" is not available`로 검토 시작 전 실패. 사용자가 두 PR의 외부 오류 예외를 승인했고 각 PR에 기록했다. clean 리뷰로 취급하지 않았다.

## 시나리오와 판정

비로그인 공개 방문자, headed Playwright Chromium, alpha 실제 페이지. 로컬 Next 서버·DB 쓰기 없음.

| 너비 | 목록 배치 | 필터·정렬 | 자책골 |
|---|---|---|---|
|320|한 줄·44px·overflow 없음 PASS|마감순→접수조건, 필터 초기화·적용·Escape PASS|추가 검증 범위 아님|
|390|한 줄·44px·overflow 없음 PASS|동일 PASS|득점 홈 영역 이동, 선수명·OG 유지 PASS|
|768|한 줄·44px·overflow 없음 PASS|동일 PASS|동일 PASS|
|1440|기존 PC 토글/필터/정렬 배치 PASS|select 개최순 URL 변경 PASS|동일 PASS|

자책골 실제 경기: `/tournaments/bd55b6a5-ecab-4406-8d25-cc1c2ff07139/matches/5c824264-af8c-5b49-8623-3461357fd781`.
배포 전 알파05팀4번 OG가 원정 영역, 배포 후 홈 득점 영역에 위치. 점수 3:1 유지.
공개 일정 API의 기존 자책골 두 건에서 side 전환, 선수명·점수 보존을 비교했다(`own-goal-api.json`).

`before/`는 이전 배포 bf41ad5c7, `after/`는 최종 배포에서 캡처. 목록은320/390/768/1440, 자책골은390/768/1440. 시트는 애니메이션 완료 후 캡처.

## 콘솔·네트워크와 검증 한계

`session.json`에 viewport별 실제 pageerror/console/HTTP/실패 요청을 기록했다. pageerror 0. 비로그인 `/api/v1/auth/me`401은 예상 인증 확인 응답이다. 라우트 변경·context 종료 중 prefetch/analytics/일부 health 요청에 ERR_ABORTED가 기록됐다. 실패 요청 0이라고 주장하지 않는다. 실행된 클릭 흐름은 모두 완료했다.
로그인한 사용자·운영자의 데이터 수정/저장 흐름과 모든 대회의 자책골은 수동 검증하지 않았다. 서버 전체 계약은 CI로 보완한다.

## 실행·정리

임시 `scripts/qa/pr2035-2036-alpha-session.cjs`로 headed Chromium launchServer/connect, 각 viewport 새 context, 실제 URL 방문·클릭·캡처 후 context/browser/server close. 임시 실행 파일 삭제. PID/PPID는 session.json, 종료 후 해당 PID 부재 확인. 기존 세션 프로세스는 종료하지 않았다.

배포 신원 및 API health는 `deployment.json`. 증거는 별도 docs 브랜치에 보관해 추가 런타임 배포를 발생시키지 않는다.
