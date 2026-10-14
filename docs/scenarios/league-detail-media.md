# 리그 상세 이미지와 통합 순위 팀 마크

Task: [20261081](../../.github/tasks/archive/20261081-league-detail-media.md)

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
- After: dev/alpha 배포와 실제 6화면 검증 완료. 단위 테스트와 실제 Alpha 증거를 구분해 기록한다.
- 추가 실제 이미지 시나리오: 완료 리그 `/tournaments/85a7c32f-17c7-485c-9d27-128406ebaa91`의 API는 coverImageUrl을 반환하지만 before 390/768/1440에서 coverVisible=false. 해당 리그를 이미지 after QA에 사용한다.
- 배포 전 PR #1914 head f5e1d02bd 전체 CI Gates/Web/API SUCCESS. Copilot 결과가 없어 대기했고 사용자에게 이번 변경의 리뷰 예외 승인을 받았다. 이후 배포와 after 검증은 아래 최종 판정에 기록했다.

## 최종 판정 — PASS 6/6
- 사용자가 이번 PR의 Copilot 리뷰 예외와 dev 배포를 명시 승인. PR #1914의 merge SHA는 1220f8102이며 명단 정책 제안은 취소하여 적용하지 않았다.
- 별도 PR #1915가 이어서 머지된 최종 서비스 SHA `3e8007a2f89b649c0204224b6f007d26baba92b9`가 1220f8102를 포함함을 ancestry로 검증했다.
- CI run 38493462018 Gates/API/Web SUCCESS. Deploy Alpha 38493462223 SUCCESS. HTTP200 / release `1.9.0-alpha.20261014.g3e8007a2f89b` 확인.
- 진행 리그 3폭: 순위표 팀 로고3/3 모두 로드, 명단 펼치기 정상, 등록 선수 수6/6/5 유지.
- 저장 이미지가 있는 완료 리그 3폭: coverVisible/coverLoaded=true, 원본을 자르지 않는 미디어 영역 표시.
- 전체6폭 가로 넘침0, 업무 API/이미지 실패0, pageerror0. 비로그인 auth/me401과 그 console 로그만 있으며 회귀로 판단하지 않는다.
- screenshots: `docs/screenshots/league-detail-media/after/`. QA 브라우저 PID20864/27316 및 부모 QA PID24816/24448 정리 완료. 실제 데이터 저장/추가 없음.
