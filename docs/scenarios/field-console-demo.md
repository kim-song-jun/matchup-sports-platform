# 필드 담당자 운영콘솔 안내·체험

Status: Local validation passed — alpha QA pending

작업: [20261108-field-console-demo](../../.github/tasks/20261108-field-console-demo.md)

## 사용자 여정
익명 사용자, 또는 대회 운영 메뉴를 연 사용자가 상단 ‘운영 콘솔 체험하기’를 누른다.

1. 새 탭 `/field-console-demo`에서 실제 현장 콘솔 위의 회색 반투명 안내를 본다.
2. 강조 영역과 화살표를 따라 팀·점수·시간, 시작, 이벤트 입력, 기록 확인, 종료를 확인한다.
3. 이전/다음으로 이동하거나 건너뛰기/Escape로 안내를 닫는다. 배경 조작은 안내 중 차단된다.
4. 시작 전 샘플에서 경기 시작을 확인하고 골·카드·교체를 팀/선수 선택 후 기록한다.
5. 점수/기록을 확인하고, 안내 다시 보기 후에도 기존 체험 기록이 유지되는지 확인한다.
6. 일시 중지/재개, 전반 종료/후반 시작/후반 종료/경기 종료를 확인한다.
7. 종료 후 수정 액션이 사라지고 실제 공식 기록과 구분된 체험 결과가 표시된다.
8. 체험 초기화는 확인 후 새 경기로 되돌린다. 새로고침도 기록을 초기화한다.

샘플은 5인제 축구, 팀별 교체 3회이며, 실제 API/소켓·회원 신원·공식 기록을 사용하지 않는다.
‘주요 기능 보기’는 기존 `/tournament-ops-demo#demo-guide`로 연결한다. 기존 대회 관리 체험과 기능 안내를 유지한다.

## 자동 검증
- 신규 모델/실제 콘솔 UI 6 tests PASS. 시작 전/중단 중 기록 및 오래된 명령 거절, 안내 전환/탈출, 득점/카드/교체/종료와 network 0을 검증했다.
- 기존 콘솔/대회 체험/진입 링크 포함 5 files / 119 tests PASS, 최종 변경에 대한 신규 6 tests 재검증 PASS.
- TypeScript 및 동일 패턴 gate(Git Bash shell) PASS. `git diff --check` PASS.

## Alpha 수동 QA — 미배포로 미실행
Persona: 비로그인 체험 사용자. Viewport: 390×844, 768×1024, 1440×900.

- [ ] 변경 전 대회 관리 진입 화면 baseline과 변경 후 필드 콘솔 화면 보존.
- [ ] 5개 안내 단계마다 대상이 선명하고 회색 덮개/화살표/설명 상자가 겹치지 않는지 확인.
- [ ] viewport resize, 이전/다음, 모바일 하단 고정 시작/종료, 키보드 focus trap/Escape 확인.
- [ ] 위 사용자 여정 실제 클릭, 초기화 확인/취소, console/network 점검.
- [ ] 샘플 GET 포함 계정/엔티티 API·소켓 호출 0 확인(공통 app health GET은 별도 기록).
- [ ] 소유 browser PID/PPID 및 cleanup 기록.

현재 after 0/3 viewport. 브라우저 시각/console/network evidence가 없으므로 전체 QA 완료가 아니다.
