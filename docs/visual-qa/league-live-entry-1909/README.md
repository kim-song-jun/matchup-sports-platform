# 진행 중인 정규 리그 상단 진입 — PR #1909

- 기능 PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/1909
- 머지 커밋: `792042b7d359c5552f9dba7f8cb45dab3e19699b`
- 변경: 기존 ‘LIVE · 진행 중인 리그 보기’를 모든 화면 폭과 참가 상태에서 표시한다.
- 화면: `/tournaments/aef0d98f-17eb-4590-b27d-a2d8bab765e6?from=%2Ftournaments%3Fkind%3Dleague`
- 참가 상태 테스트: 미신청·확정·초안·취소 및 일반 대회/종료·취소 대조군, 상세 consumer 81/81 PASS. Web 전체 타입 검사·패턴 검사 PASS.
- 사용자 승인으로 이번 PR의 Copilot 리뷰 조건에 한해 예외 처리했다. PR 코멘트에 승인 및 CI·코드 검토 근거를 기록했다.

## 배포 전

비로그인 방문자에서 390/768/1440px 모두 상단 진입 링크가 없었다. 가로 넘침은 없었다. 기존 `/bracket`에는 경기 일정·리그 순위 탭이 구현돼 있었다. 비로그인 `/api/v1/auth/me`의 정상 401 외 API 실패와 pageerror는 없었다. 근거는 `before-evidence.json`과 `before-*.png`다.

## 배포 후

배포 성공 및 서빙 SHA 포함성 확인 후 headed Chromium에서 같은 비로그인 방문자로 검증한다. 로그인 자격증명은 사용하지 않는다. 실제 참가자 로그인 검증은 포함하지 않으며 참가 상태별 노출은 실제 상세 컴포넌트 회귀 테스트가 검증한다.

검증 항목: 상단 진입 표시·44px 터치 영역·화면 안 배치·가로 넘침·링크의 목적지와 from 체인·실제 클릭·경기 일정/리그 순위 탭 전환·뒤로가기의 목록 필터 유지·console/network.


## 실측 결과

390/768/1440px 모두 PASS. 버튼 높이는57.5px이며 가로 넘침이나 본문 겹침이 없다. 실제 버튼 클릭·경기 일정/리그 순위 탭 전환·상세 복귀가 성공했고 목록 필터 `from` 체인을 유지했다. 각 화면 폭에서 경기 링크11개를 확인했다. JavaScript pageerror는0건이다. Network/console에는 비로그인 `/api/v1/auth/me`의401만 있었으며 기능 API 실패는 없었다. `evidence.json`, `after-*.png`, `destination-*.png`를 참조한다.

서빙 release는 `1.9.0-alpha.20261014.g792042b7d359`, commit은 이번 머지 SHA와 동일하다. DB health=true를 확인했다. 기능의 실제 alpha 반영을 검증한 결과이며 Actions 성공 결과와 구분한다.

자동화 기록: dev CI 성공. Alpha run38475457320 attempt1은 취소, attempt2는 기존 릴리스 manifest 재사용 검증에서 실패했다. Steps API의 빈값/Set up job 표시를 초기화 정지로 오판한 사실은 후속 로그로 정정했다. Manifest 원문/SSM receipt는 수집하지 않았으므로 실패한 비교 필드와 서버 activation 출처는 확정하지 않는다. 향후 자동화 재시도 문제는 런타임 PASS로 숨기지 않는다. `deployment-evidence.json`에 최소 기록을 남겼다.

Owned node18522→Chrome18534. 검증 종료 시 Browser.close 및 해당 PID 잔류 없음 확인. 로그인 세션이나 자격증명은 생성/기록하지 않았다.
