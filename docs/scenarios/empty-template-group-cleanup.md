# 경기 전체 삭제 뒤 빈 템플릿 조 정리

Task: [20261100](../../.github/tasks/archive/20261100-empty-template-group-cleanup.md) · Fix PR: [2019](https://github.com/kim-song-jun/matchup-sports-platform/pull/2019)
Status: PASS — dev/main 및 alpha/production 배포 완료

## 조건과 흐름
1. 관리자(owner/ops)가 템플릿으로 조별리그+결선 대진을 만들고 확정 참가팀을 조별 ENTRY에 배정한다.
2. 시작 전 경기를 결선 하류부터 모두 삭제한다.
3. 대진 관리의 목록 → 조별 팀 자리 편집에서 각 자리를 팀 미정으로 바꾼다. 연결 경기0개여도 조 편성과 순위에서 빠져야 한다.
4. 해당 조를 삭제한다. 어느 경기에서도 쓰지 않는 미정 자리(조 소속 및 이 조를 원천으로 삼는 순위 자리)는 같은 트랜잭션에서 정리되어야 한다.
5. 기존 버그로 자리는 이미 미정인데 편성만 남은 조도 삭제할 수 있어야 한다. 이때 조별·통합 순위의 고아 팀도 정리한다.
6. 다른 조의 배정과 참가 신청·확정 상태/선수 명단은 유지한다.

## 보호와 오류
- 실제 ENTRY 팀 배정, 수동 편성, 부전승 행: GROUP_HAS_TEAMS.
- 조의 경기 잔존: GROUP_HAS_FIXTURES.
- 다른 경기에서 쓰는 순위 자리 또는 등록이 남은 자리: GROUP_HAS_SLOTS. 취소/보관 참조도 보호한다.
- support403. 대회 레인 잠금 및 단일 트랜잭션. 삭제 도중 DB 오류를 주입하면 조·편성·순위·자리 모두 롤백한다.
- 경기0인 조의 자리 교환에서도 최종 자리와 조 편성이 일치한다.

## 증거
- 사용자 지정 production 대회를 실제 관리자 로그인으로 조회: 경기0/조5/자리24/편성14, A/B조 자리 미정/편성7팀 잔존. 수동 데이터 변경 없음.
- 기존 코드 실제 DB RED2건, 수정 후 신규/인접 DB67 PASS. 추가 순위/교환/롤백 포함 신규5 PASS. 기존 대진 Tx 갱신 후 DB17 PASS. 관련 단위223 PASS, API 전체 tsc PASS.
- 첫 CI의 이전 계약 기대값2건은 실제 경기 참조 보호 시나리오로 수정. 최신 CI/실제 배포 증거는 task의 최종 snapshot 참고.
- 임시 PostgreSQL/트리거/clone 및 owned headed 브라우저 정리 완료. UI/layout 변경 없음. 운영 데이터 수동 삭제/신청 상태 변경은 수행하지 않음.

## 배포 완료
- Fix PR2019, main 승격 PR2020 merge71411e304. 사용자가 이번 hotfix 한정 직접 main 승격·production 승인을 명시 허용. Copilot 모델 unavailable 리뷰 예외만 적용, CI/CodeQL/이미지 보안 게이트 모두 통과.
- Production run39565276994 success(2026-10-21 17:22 KST). 실제 운영 release1.11.3/SHA71411e304/DB=true; migrations214/pending0, worker healthy 및 public health gate 통과.
- Alpha final run39565560228 success, dev CI39565560194 success. serving1.11.3-alpha.20261021.g71411e3047c8/DB=true.
- 10월22일 운영 관리자 실제 로그인/대진 GET 및 headed1440/768/390 정상; 주요5경로200, pageerror/실패 응답 없음. 현재 지정 대회는 경기32/조8/자리0로 초기 진단 상태와 다름. 실제 대회 mutation 없이 조회만 확인. 변경된 조 비우기/삭제 경로는 격리 PostgreSQL RED→GREEN/회귀 증거로 검증.
- owned headed 브라우저 종료. 관리자 화면 캡처는 로컬 QA 증거로만 보관. 자세한 시간·run·한계는 위 archive task 최종 snapshot 참고.
