# 신규 리그 명시적 시작

Task: [20261090](../../.github/tasks/20261090-league-explicit-start.md)
Status: PR #2065의 2026-10-27 신청 정책 반영 — 변경 후 alpha 미검증. 아래 CLI evidence는 기존 명시적 시작 구현의 과거 검증이다.

현재 정본: [대회·리그 플로우 §6](../design/competition-canonical-flow.md#6-결정-이력--무엇이-바뀌었나-무엇을-얻고-잃나), [리그 API](../api/domains/league-matches.md#open-registration-접수-시작하기).
새 리그는 `draft`(초안)로 생성한다. 과거의 모집 마감 생성·마감 시각만으로 신청 열기 규칙은 #2065가 대체한다.

## 관리자 흐름
1. 쓰기 가능한 관리자 계정으로 팀 없이 새 리그를 만든다. 관리자에서는 초안, 공개하면 사용자 화면에서는 준비 중이며 아직 신청할 수 없어야 한다. 독립 생성·시리즈 신규 시즌·승계 시즌 모두 `draft`인지 확인한다.
2. 참가팀 등록·대진 생성/재생성·슬롯 배정만으로 신규 리그가 시작되거나 접수가 열리지 않아야 한다. 접수 시작하기로 `open`으로 바꾸고, 미래 마감 또는 마감 없음에서만 신청이 가능해야 한다. 마감 시각과 같은 순간은 허용하고 그 이후는 거절한다.
3. 리그 시작 전 운영 콘솔의 경기 시작은 LEAGUE_NOT_STARTED와 실제 안내를 표시해야 한다.
4. 접수 마감하기는 `open → closed`이며 마감 시각·기존 신청은 유지한다. 시작 전 다시 접수를 열 수 있다. 리그 시작 확인을 취소하면 상태를 유지하고, 확인하면 `in_progress`가 되어 새 신청과 접수 재오픈을 막아야 한다. 시즌 중 팀 합류는 운영자 직접 등록으로 확인한다.
5. 경기 시작은 기존 운영 권한·버전·양 팀 확정 조건으로 진행된다.
6. 조회 전용 관리자는 시작 버튼이 없고 직접 API 호출도 거절된다.
7. 보류 중에는 신청을 받지 않으며, 접수를 열려고 하면 `409 LEAGUE_ON_HOLD`를 반환해야 한다. 보류 해제 후에도 복원 상태·마감·정원을 함께 적용한다.
8. 공개 목록 카드·접수 중 필터·상세·신청 제출이 같은 상태·마감·정원 판정을 사용하는지 확인한다. 진행 중+접수 중 필터는 빈 결과여야 한다.

## Alpha evidence
390/768/1440 각 0/3. 현재 변경 미배포로 화면·console/network·실제 로그인 흐름 미검증.
로컬 Next 서버는 실행하지 않는다. 생성한 QA 데이터와 프로세스 cleanup을 기록한다.

## CLI evidence
모드 분리 후 API192 고유 unit 및 DB68 assertion 통과. migration 단독 DB 회귀는 exit 0으로 통과했다. 상세 명령·재실행 사유는 task Progress Snapshot에 기록했다. Docker CLI의 WSL 오류는 전용 컨테이너의 Unix socket API로 우회했다. 전체 DB suite는 assertion 통과 후 runner 종료 대기가 있어 소유 프로세스만 정리했고, CI 정상 종료 확인은 후속이다. 신규 서버·브라우저·QA 데이터 없음, 테스트 프로세스 종료.

## 기존 데이터 호환성 추가 검증
- 과거 명시적 시작 migration은 기존 상태를 보존했다. #2065의 `20261027120000_league_registration_status`는 신청 가능 여부를 맞추기 위해 상태를 의도적으로 변환하므로, 이제 모든 저장 값이 같아야 한다고 판정하지 않는다.
- 삭제되지 않은 시작 전 `draft/closed` + 미래 마감은 `open`으로, `open` + 마감 없음은 `closed`로 옮긴다. `on_hold`의 복원 상태도 같은 규칙으로 옮긴다. `in_progress/completed/cancelled` 및 삭제된 리그는 이 migration의 상태 변환 대상이 아니다.
- `requiresExplicitStart` 값·기존 신청·참가팀·경기 기록을 보존한다. migration 전체 체인과 실제 신청 허용/거절을 함께 검사한다: `test/league-matches/league-registration-status-migration.integration-spec.ts`.
- 기존 closed 리그도 경기 시작·대진 배정 후 자동 진행이 유지된다. 신규 모드만 수동 시작을 요구한다.
- 롤링 배포 중 구버전의 INSERT(새 컬럼 생략)도 false 기본값을 받는다.

전용 PostgreSQL 컨테이너·익명 볼륨 정리 완료. 미추적 runtime 의존성 없음. 전체 DB runner 종료 대기/수동 정리는 task에 기록했고 CI 정상 종료와 alpha 0/3은 후속 검증이다.
