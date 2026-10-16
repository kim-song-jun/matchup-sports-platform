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
- 추가 실제 이미지 시나리오: 완료 리그 `/tournaments/85a7c32f-17c7-485c-9d27-128406ebaa91`의 API는 coverImageUrl을 반환하지만 before 390/768/1440에서 coverVisible=false. 해당 리그를 이미지 after QA에 사용한다.

## 목록/상세 이미지 분리 후속 QA (2026-10-16)
- 관리자 owner/ops: 목록 A·상세 B 저장 후 새로고침해 독립 보존 확인. 한쪽 제거 시 다른 저장값은 유지하고 공개 화면은 남은 이미지를 공유. support는 변경 금지.
- 기존 이미지 보유 리그: migration 후 두 DB 필드가 기존 URL과 동일한지 확인. 일반 대회와 이미지 없는 리그는 영향 없음. 다음 시즌은 두 필드를 승계.
- 로컬 검증: API 85 / Web 10 단위 테스트, API/Web 타입·패턴 검사 PASS. 공개 상세 MSW fallback 보완.
- DB integration: Docker daemon 미실행으로 미검증. migration 파일을 임시 테이블에 실행하는 보존 회귀 테스트 포함, CI/DB 실행 필요.
- Alpha 390/768/1440: 0/3, 아직 feature branch 미배포. dev 머지 후 admin 편집·공개 목록/상세 클릭, screenshot·console/network·cleanup 증거 필요. 기존 상세 미디어 before 기록을 이번 두 이미지 편집의 after로 간주하지 않음.
- PR #1955 수정 검증(2026-10-16): 누락된 schema pin을 fixture/Docker/릴리스 binder/manifest에 동기화. API86/Web10, 양 앱 타입·패턴, 실제 source snapshot, release binding7 및 manifest self-test PASS. Docker 미가동으로 실DB 검증은 새 CI 대기이며 alpha 0/3 상태는 유지한다. #1957과 순차 머지 시 두 필드가 포함된 스키마 해시를 다시 계산한다.
- 후속 CI38907223065: API/Web SUCCESS, migration replay+drift 및 HTTP/DB 검사 SUCCESS. 남은 Gates의 이미지 복사 UPDATE 미등록을 실제 diff로 재현하고 정확한 파일/SQL 검토 근거를 등록했다. 실제 migration 승인·다른 파일/종류/목적 컬럼 거절 self-test와 PR diff gate PASS. Alpha 0/3은 미배포로 유지한다.
