# 배정 대회 디렉터 전체 관리

Task: [20261122](../../.github/tasks/20261122-scoped-tournament-director-management.md)
Status: 로컬 계약 검증 PASS, alpha 미배포

## 범위
신규 관리 섹션 10개: overview, info, registrations, bracket, announcements, sponsors, campaign, reviews, awards, statistics.
목록 `/tournament-management`, 상세 `/tournament-management/tournaments/:id/:section`.
마이페이지 담당 대회 진입과 운영 콘솔의 관리 복귀도 포함한다.

## 실행 시나리오
1. 일반 계정 A를 대회 X의 디렉터로 배정한다. X와 다른 대회 Y에는 실제 참가팀/선수를 준비한다.
2. A의 마이페이지에서 담당 대회를 연다. X의 기존 관리 개요와 10개 섹션이 표시되어야 한다.
3. 전용 목록에는 A가 활성 디렉터인 대회만 보이고, Y·조회/현장 담당만 있는 대회·만료 배정은 보이지 않아야 한다.
4. X의 정보·공개 여부·상태·참가/입금·명단/선출·대진/자리·공지·협찬·캠페인·시상 변경을 저장하고 재조회한다. 기존 상태·시작 경기 보호를 통과한 변경만 반영되어야 한다.
5. 운영 보드와 스태프 화면을 열고 대회 관리로 돌아온다. X의 맥락과 전용 관리 경로가 유지되어야 한다.
6. Y의 대회 ID, 신청/선수/경기/조/자리/공지 ID를 직접 API로 보내 본다. `403 PERMISSION_DENIED`, 쓰기 0건이어야 한다.
7. 배정을 해제/만료시키거나 사용자 계정을 정지시킨다. 관리 API가 거부하고 UI가 권한/오류 상태를 보여야 한다.
8. 변경 감사에서 실제 사용자·대회·배정 ID/버전을 확인한다. 디렉터가 플랫폼 관리자 레코드로 생성되어서는 안 된다.
9. 결과 공식 확정·무효화는 기존 DIRECTOR_OFFICIALIZE 제한을 그대로 따른다. 거부 감사·takeover·명령 멱등성도 유지되어야 한다.
10. 플랫폼 ops/owner와 support의 기존 읽기/쓰기 권한을 회귀 검증한다. 디렉터에게 대회 생성·전역 팝업·회원 관리가 열려서는 안 된다.

## 로컬 증거
- API 관련 25개 suite의 수정 후 회귀 PASS. Web 8개 파일/63개 테스트 PASS.
- API/Web tsc 및 각 surface/pattern 검사 PASS. POSIX 검사 스크립트는 Windows 검증 프로세스에서 Git 유틸리티/Git Bash를 사용했다.
- 권한 헬퍼 테스트: 담당/타 대회와 7종 하위 리소스, 만료/해제/미시작/비활성 계정, 역할, 감사 신원 검증.
- 실제 목록 서비스 테스트: 행과 상태별 합계의 동일 스코프 및 무배정 상세 거부 검증.
- UI 테스트: 활성 디렉터 목록 필터, 관리 진입 차단, 기존 관리 탭/폼 재사용, 전역 팝업 제외, 운영 링크.
- 실행은 단일 worker/직렬. 검증용 web/API 서버와 브라우저를 띄우지 않았다.

## Alpha 수동 증거
미실행. 이 작업트리의 변경은 dev/alpha에 배포하지 않았다. 따라서 미배포 코드를 기존 alpha 화면으로 PASS 처리하지 않는다.
- 10개 관리 섹션: 0/10 수동 검증.
- 390/768/1440 viewport: 0/3 검증. before/after·console/network 증거 없음.
- DB integration/실제 로그인·저장 흐름: 미실행.
- 임시 실행 서버/브라우저: 없음. 정리할 소유 프로세스 없음.
