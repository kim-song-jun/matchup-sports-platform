# 리그 상세 이미지와 통합 순위 팀 마크

Task: [20261081](../../.github/tasks/20261081-league-detail-media.md)

## 시나리오
1. 공개 리그 상세의 저장된 대표 이미지를 확인한다. 이미지가 없으면 미디어 공간을 만들지 않는다.
2. 통합 순위의 팀 이름 옆 마크를 확인한다. 미등록/실패 로고는 공용 팀 아이콘이다.
3. 참가팀 명단을 펼친다. 표시 대상은 참가 등록의 삭제되지 않은 선수 명단이며 팀원 전체나 경기별 조정 명단이 아니다.

## 검증 기록
- 대상: `/tournaments/aef0d98f-17eb-4590-b27d-a2d8bab765e6?from=%2Ftournaments%3Fkind%3Dleague`.
- Persona: 공개 비로그인 방문자. Viewports: 390/768/1440.
- Before: 실제 alpha SHA 792042b7d, 순위 로고 0개, 명단 클릭 정상, overflow 0. 명단 등록수 6/6/5.
- 공개 상세와 리그 전용 API 모두 저장 coverImageUrl=null이므로 해당 리그에서 저장 이미지 미리보기는 검증할 수 없다.
- 실행: `node scripts/qa/capture-league-detail-media.cjs before|after`. headed Chrome만 사용하고 finally에서 owned 브라우저를 닫는다. 쿠키가 필요하면 ALPHA_SESSION_TOKEN을 환경으로만 받는다.
- 비로그인 auth/me401은 예상 인증 조회이며 업무 API 실패와 구분한다.
- Web 49/API 40 회귀 통과, 양쪽 타입·패턴 검사 통과.
- After: dev 배포 후 실제 3폭 검증 대기. 단위 테스트를 alpha 화면 PASS로 표현하지 않는다.
