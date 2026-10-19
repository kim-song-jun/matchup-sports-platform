# 신규 리그 명시적 시작

Task: [20261090](../../.github/tasks/20261090-league-explicit-start.md)
Status: PR 호환성 보강 — API192/Web38·양쪽 타입·표면/패턴·DB68 assertion PASS, alpha 배포 전

## 관리자 흐름
1. 쓰기 가능한 관리자 계정으로 새 리그를 만든다. 모집 마감 표시를 확인한다.
2. 참가팀 등록·대진 생성/재생성·슬롯 배정 후 모집 마감이 유지되는지 확인한다.
3. 리그 시작 전 운영 콘솔의 경기 시작은 LEAGUE_NOT_STARTED와 실제 안내를 표시해야 한다.
4. 리그 시작하기 → 취소는 상태를 유지한다. 다시 열어 확인하면 진행 중으로 바뀌어야 한다.
5. 경기 시작은 기존 운영 권한·버전·양 팀 확정 조건으로 진행된다.
6. 조회 전용 관리자는 시작 버튼이 없고 직접 API 호출도 거절된다.
7. 기존 진행 중/준비 중/종료 리그의 저장 상태가 변경되지 않았는지 확인한다.

## Alpha evidence
390/768/1440 각 0/3. 현재 변경 미배포로 화면·console/network·실제 로그인 흐름 미검증.
로컬 Next 서버는 실행하지 않는다. 생성한 QA 데이터와 프로세스 cleanup을 기록한다.

## CLI evidence
모드 분리 후 API192 고유 unit 및 DB68 assertion 통과. migration 단독 DB 회귀는 exit 0으로 통과했다. 상세 명령·재실행 사유는 task Progress Snapshot에 기록했다. Docker CLI의 WSL 오류는 전용 컨테이너의 Unix socket API로 우회했다. 전체 DB suite는 assertion 통과 후 runner 종료 대기가 있어 소유 프로세스만 정리했고, CI 정상 종료 확인은 후속이다. 신규 서버·브라우저·QA 데이터 없음, 테스트 프로세스 종료.

## 기존 데이터 호환성 추가 검증
- 기존 draft/open/closed/in_progress/completed/on_hold/cancelled 행은 전체 저장 값이 유지되고 추가 필드는 false여야 한다.
- 기존 closed 리그도 경기 시작·대진 배정 후 자동 진행이 유지된다. 신규 모드만 수동 시작을 요구한다.
- 롤링 배포 중 구버전의 INSERT(새 컬럼 생략)도 false 기본값을 받는다.

전용 PostgreSQL 컨테이너·익명 볼륨 정리 완료. 미추적 runtime 의존성 없음. 전체 DB runner 종료 대기/수동 정리는 task에 기록했고 CI 정상 종료와 alpha 0/3은 후속 검증이다.
