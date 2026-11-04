# 대회 운영 콘솔 외부 체험

Task: [20261123](../../.github/tasks/20261123-tournament-ops-demo.md)
Status: local checks PASS; Alpha after pending

## 화면과 범위
- `/admin/ops/tournaments`, `/my/tournament-staff` 상단의 체험 CTA는 새 탭(noopener)으로 `/tournament-ops-demo`를 연다.
- 공개 체험 5단계: 대회 준비, 참가팀, 대진 구성, 경기 기록, 결과·시상.
- 역할 3개: 디렉터(전체 체험), 기록 담당자(샘플 4강 1경기), 참가자(확정 결과·시상만 표시).
- 모든 데이터는 명시된 샘플이다. 이 페이지는 실제 API 성공을 흉내 내는 fallback이 아니며, 운영 API를 호출하지 않는 별도 시뮬레이터다.
- 탭별 sessionStorage에 버전/명령 이력을 검증·저장한다. 새로고침은 복원, 공유 URL은 이력을 포함하지 않는다. 서버/다른 기기와 진행을 공유하지 않는다.

## 12개 기능 시나리오
| # | 시나리오 | 로컬 계약 | Alpha |
|---|---|---|---|
| 1 | 관리자·내 담당 목록 CTA / 로그인 없는 공개 진입 | CTA 경로·noopener PASS | pending |
| 2 | 대회명·장소 저장 후 참가 단계 | UI 실제 저장 PASS | pending |
| 3 | 4팀 확정 및 샘플 명단 | UI·모델 PASS | pending |
| 4 | 4강2+결승1 생성, 조기/중복 생성 거부 | UI·모델 PASS | pending |
| 5 | 기록 담당 범위·참가자 읽기 전용 | UI·모델 PASS | pending |
| 6 | 양 팀 라인업 준비 후 시작, 진출팀 대기 보호 | UI·모델 PASS | pending |
| 7 | 득점·경고·마지막 기록 취소·유효 선수/시각 | UI·모델 PASS | pending |
| 8 | 종료 확인 / 디렉터만 검토·체험 결과 확정 | UI·모델 PASS | pending |
| 9 | 검토 전 결승 미반영, 확정 후 반영 / 동점 승리팀 | 모델 PASS | pending |
| 10 | 시상 저장과 참가자 확정 결과 표시 | UI PASS | pending |
| 11 | 새로고침 복원·별도 세션·손상·저장 실패 | UI·모델 PASS | pending |
| 12 | 공유 실패 직접 복사·자기 초기화만·API 쓰기 0 | UI PASS | pending |

## 검증 증거
- Vitest: 모델12, 데모 UI5, 기존 담당 목록9 = 총26 tests. 확인 모달 연결의 실제 렌더 실패를 테스트가 발견해 수정했다.
- API 호출을 spy해 전체 UI 진행 중 호출 0을 확인했다. 상태 변경/진출 반영/저장 복원은 실제 모델과 저장 이력으로 검증했다.
- tsc 및 Web pattern gate PASS(수정 후). 신규 토큰/간격/radius 오류는 기존 정본 토큰과 4px 격자로 수정했다.
- API·DB·권한 플래그·알림·seed/migration 변경 없음. PR #2101 변경을 포함하지 않는다.

## Alpha 계획
Headed Chrome을 사용해 기준 진입 화면과 변경 후 5단계/3개 관점, 390/768/1440을 캡처한다.
새 route는 baseline이 없으므로 기존 운영 목록을 before로 남긴다. 로그인·개인정보는 캡처에 포함하지 않는다.
스크립트 `scripts/qa/tournament-ops-demo-browser.cjs`: stdin 비에코, 토큰/세션 파일 없음, PID/PPID 기록, finally cleanup.
현재 신규 Alpha 0/5 단계, 0/3 폭, 기능 0/12. 미배포 코드를 기존 Alpha로 PASS 처리하지 않는다.
