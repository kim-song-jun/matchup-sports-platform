# 6강 상세 부전승 안내 누락

- 대상: `/tournaments/a90df6d5-47e9-40f9-93ef-f679ce8da858?from=%2Ftournaments` (alpha).
- Persona: 비로그인 관전자. 390/768/1440 × 1000, 설치된 Chrome headed.
- Before: 일반 TournamentBracket만 표시되어 부전승 선정 영역과 기준이 누락됨. 3폭 모두 재현. 캡처 이미지는 상세 대진표 영역.
- API: sixTeamMode=true, 3경기 모두 scheduled/result=null, sixTeamBracket.bye=null. 부전승 팀의 미선정 상태는 정상이며 데이터 변경 불필요.
- Network/console: 기존 비로그인 `/api/v1/auth/me` 401 및 해당 리소스 console 오류가 3폭 모두 발생. pageerror와 문서 가로 넘침은 없음. 스크립트는 이 기존 오류를 숨기지 않고 exit 1로 기록한다.
- Cleanup: browser PID 65220 / parent PID 51764. contexts/browser/server 종료, 소유 프로세스 종료 확인.
- 실행: `node scripts/qa/six-team-bye-detail-capture.cjs before`.
- After: dev 머지 및 alpha 배포 뒤 동일 스크립트 `after`로 확인 예정. 현재 새 UI의 alpha 검증 결과는 없음.

변경은 이미 승인된 6강 전용 A안 컴포넌트를 빠진 상세 경로에 연결하는 복구다. 새로운 부전승 가상 경기·스코어·진출팀을 생성하지 않는다.
