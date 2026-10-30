# 6강 연결형 대진표 검증

- Task20261118, branch `fix/six-team-connected`, base `b71a5d031`.
- 구현: 6강3경기·준결승1경기+부전승1자리·결승1경기를 한 가로 캔버스에 배치. 후속 두 경로만 연결. 부전승은 Game/점수/통계에 추가하지 않는다.
- Alpha before: 익명 관전자, 지정 대회 `a90df6d5-47e9-40f9-93ef-f679ce8da858` 상세. 390/768/1440×1000, HTTP200, 배포 SHA `4790452af6f22c2a8c2e7b3bde54400ced7fe5d9`.
- 세 폭 모두 기존 연결선0, 문서 overflow0, pageerror0. 기존 익명 `/auth/me`401 및 console resource error를 보존해 capture exit1. 오류를 숨기거나 PASS로 처리하지 않음.
- `before-{390,768,1440}.png`, `before-observations.json` 참조. 브라우저 PID756/parent27076, context/browser/server 종료 및 프로세스 부재 확인.
- 실행: `node scripts/qa/capture-six-team-connected.cjs before`. 브라우저는 headed Chrome, 실제 alpha 읽기 전용. 로컬 웹 서버 없음, 원격 데이터 변경0.
- After: 미배포로 0/3. 배포 후 같은 스크립트 `after`로 실제 연결2·단계/부전승 위치·내부 가로 스크롤·focus·dark 및 console/network 확인 필요. 관리자 실제 편집/생성 검증은 인증 세션 필요.
- 코드 검증: 공개/관리자/상세/템플릿 관련211 PASS. 전체 frontend tsc·패턴 검사 PASS. alpha after나 관리자 실제 저장 PASS를 의미하지 않는다.
- Windows 기존 pnpm 링크를 읽을 수 없어 root `tmp/six-team-qa`에 별도 npm 검증 의존성 준비. TypeScript5.9.3/React19.2.5/타입19.2.14 등 저장소 버전 사용, 프로덕션 manifest/lockfile 변경 없음.
