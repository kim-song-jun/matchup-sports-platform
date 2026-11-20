# 대회 취소 사유 필수 — 2026-11-20 구현 / 11-21 Alpha 확인

상태: dev 머지·Alpha 기능 확인 완료, 스크린샷 시각 검증 미완료.
Task: [20261137](../../.github/tasks/20261137-tournament-cancel-reason.md)
PR: [#2470](https://github.com/kim-song-jun/matchup-sports-platform/pull/2470)

## 계약과 시나리오

- 대회 초안/접수/마감/진행 중 취소는 공백이 아닌 사유 필수(최대 500자). API는 `400 TOURNAMENT_STATUS_REASON_REQUIRED`로 누락·빈값·공백을 거부하며 상태/감사 로그를 저장하지 않는다.
- 유효한 사유는 trim 후 기존 관리자·상태 변경 감사 로그 모두에 저장한다. 취소 상태 재요청은 기존 idempotent no-op을 유지한다. 참가 신청 취소/리그 계약은 변경하지 않는다.
- 공용 사유 모달 재사용(A안 사용자 선택). 빈 입력 제출 차단, 실패 시 입력 유지·오류 표시, 돌아가기 시 실행 없이 닫기. 기존 관리자/디렉터 권한은 유지한다.

## 자동 검증

- 로컬: 대회 서비스165/165·셸17/17, API/Web 타입 및 surface/pattern PASS. Node24.15.0이므로 요구22.23.5의 원격 CI도 확인했다.
- PR head `dbda083b3f4d6f029f8c6ddd11105ce408f711a5`: API/Web/Gates/security success. [CI44754168911](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/44754168911).
- 실제 API 로그: PostgreSQL214파일1633 PASS·기존3 SKIP, 단위565파일9425 PASS. 웹1010파일13094 PASS. 대회 서비스 및 셸 회귀의 실제 실행 확인.
- 머지 `b6156d24833bc6054817880ccda494338a3f272a`의 [CI44756733970](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/44756733970)도 API/Web/Gates success.

## Alpha 실제 확인

- [배포44756733843](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/44756733843) SSM·공개 identity 단계 success. 공개 commit `b6156d24833bc6054817880ccda494338a3f272a`, release `1.22.0-alpha.20261120.gb6156d24833b`, DB health true.
- 도구 ego-browser/ego-lite, 기존 관리자 로그인. 테스트 초안 대회 `/admin/tournaments/1fa13d46-ab8a-4760-9cdf-934fb48bc2aa/overview`의 취소하기를 실제 클릭했다. 실제 대회 취소/상태 변경은 실행하지 않았다.
- 변경 전 확인 모달은 사유 입력 없이 확인만 받았다. 변경 후 사유 필수 textarea 및 입력 전 disabled 버튼을 확인했다. 초점은 TEXTAREA로 진입한다.
- 390/768/1440 ×900 각각 가로 넘침 없음·모달 전체가 viewport 안에 들어옴·필수 표시·제출 disabled 확인(3/3 구조 측정). 공백 입력도 disabled다.
- 실제 상태 변경 요청만 CDP Network.setBlockedURLs로 차단하고 제출했다. 성공 응답을 mock하지 않았다. “대회 취소에 실패했어요.”가 표시되며 사유·모달 유지, 돌아가기로 종료했다. 차단은 finally에서 해제했다. 같은 실행의 network loadingFailed1건은 의도한 차단이며 Runtime 예외/console error 및 HTTP 4xx/5xx는 수집되지 않았다.
- 전후 실제 GET의 status는 draft → draft. 사유 필수/감사 저장의 서버 검증 근거는 위 CI이며, 실제 Alpha 취소·감사 저장 성공으로 대신 주장하지 않는다.

## 시각 증거 한계와 cleanup

- baseline 캡처 및 허용 재시도, 배포 후390 캡처 모두 Page.captureScreenshot timeout. 파일 증거 없음. DOM 구조 측정을 전후 스크린샷·완전한 시각 PASS로 간주하지 않는다. 전체 시각 QA3너비는 미완료다.
- 초기 space8이 종료된 것을 listTaskSpaces로 확인한 후 space9에서 같은 QA를 재개했다. 기존 사용자 space0·회원 조회 재로그인용 space7은 건드리지 않았다. QA space9는 종료한다.
- 로컬 Next/API 서버, seed/reset, 운영 main 승격을 실행하지 않았다. QA 보고 branch는 시각 검증 잔여분 때문에 보존한다.
