# 대회 운영 콘솔 외부 체험

Task: [20261123](../../.github/tasks/20261123-tournament-ops-demo.md)
Status: PASS — dev merged / Alpha verified 2026-10-30

## 화면과 범위
- `/admin/ops/tournaments`, `/my/tournament-staff` 상단의 체험 CTA는 새 탭(noopener)으로 `/tournament-ops-demo`를 연다.
- 공개 체험 5단계: 대회 준비, 참가팀, 대진 구성, 경기 기록, 결과·시상.
- 역할 3개: 디렉터(전체 체험), 기록 담당자(샘플 4강 1경기), 참가자(확정 결과·시상만 표시).
- 모든 데이터는 명시된 샘플이다. 이 페이지는 실제 API 성공을 흉내 내는 fallback이 아니며, 운영 API를 호출하지 않는 별도 시뮬레이터다.
- 탭별 sessionStorage에 버전/명령 이력을 검증·저장한다. 새로고침은 복원, 공유 URL은 이력을 포함하지 않는다. 서버/다른 기기와 진행을 공유하지 않는다.

## 12개 기능 시나리오
| # | 시나리오 | 로컬 계약 | Alpha |
|---|---|---|---|
| 1 | 관리자·내 담당 목록 CTA / 로그인 없는 공개 진입 | CTA 경로·noopener PASS | PASS |
| 2 | 대회명·장소 저장 후 참가 단계 | UI 실제 저장 PASS | PASS |
| 3 | 4팀 확정 및 샘플 명단 | UI·모델 PASS | PASS |
| 4 | 4강2+결승1 생성, 조기/중복 생성 거부 | UI·모델 PASS | PASS |
| 5 | 기록 담당 범위·참가자 읽기 전용 | UI·모델 PASS | PASS |
| 6 | 양 팀 라인업 준비 후 시작, 진출팀 대기 보호 | UI·모델 PASS | PASS |
| 7 | 득점·경고·마지막 기록 취소·유효 선수/시각 | UI·모델 PASS | PASS |
| 8 | 종료 확인 / 디렉터만 검토·체험 결과 확정 | UI·모델 PASS | PASS |
| 9 | 검토 전 결승 미반영, 확정 후 반영 / 동점 승리팀 | 모델 PASS | PASS |
| 10 | 시상 저장과 참가자 확정 결과 표시 | UI PASS | PASS |
| 11 | 새로고침 복원·별도 세션·손상·저장 실패 | UI·모델 PASS | PASS |
| 12 | 공유 실패 직접 복사·자기 초기화만·API 쓰기 0 | UI PASS | 공유 성공·초기화·쓰기0 PASS; 복사 실패 unit |

## 검증 증거
- Vitest: 모델12, 데모 UI5, 기존 담당 목록9 = 총26 tests. 확인 모달 연결의 실제 렌더 실패를 테스트가 발견해 수정했다.
- API 호출을 spy해 전체 UI 진행 중 호출 0을 확인했다. 상태 변경/진출 반영/저장 복원은 실제 모델과 저장 이력으로 검증했다.
- tsc 및 Web pattern gate PASS(수정 후). 신규 토큰/간격/radius 오류는 기존 정본 토큰과 4px 격자로 수정했다.
- API·DB·권한 플래그·알림·seed/migration 변경 없음. PR #2101 변경을 포함하지 않는다.

## Alpha 계획
Headed Chrome을 사용해 기준 진입 화면과 변경 후 5단계/3개 관점, 390/768/1440을 캡처한다.
새 route는 baseline이 없으므로 기존 운영 목록을 before로 남긴다. 로그인·개인정보는 캡처에 포함하지 않는다.
스크립트 `scripts/qa/tournament-ops-demo-browser.cjs`: stdin 비에코, 토큰/세션 파일 없음, PID/PPID 기록, finally cleanup.
Alpha 완료: 5/5 단계, 3/3 역할, 3/3 폭, 기능 12/12. 세부 범위와 한계는 아래 실측 기록을 따른다.

## Alpha 실측 — 2026-10-30
- 대상: https://alpha.teameet.co.kr/tournament-ops-demo, 응답 commit `2708c614993e277978e535afd00ff058bbf22dac` 확인. 관리자 로그인 후 운영 목록과 담당 대회 CTA, 비로그인 별도 context에서 공개 체험을 검증했다.
- 기능 12/12 처리. 대회명 저장→4팀 확정→4강2/결승1 생성→기록 담당자(4강1만 선택 가능)→라인업 없는 시작 거부→라인업 준비→득점/경고/undo(1:0, 득점1건)→종료 확인→참가자 미확정 결과 비노출→디렉터 확정→MVP 저장→참가자 표시.
- 4강2는 0:0 종료 후 승부차기 미선택 확정 거부를 확인하고 그린 FC를 선택했다. 결승 블루/그린 반영, 결승1:0 확정 및 샘플 우승 표시까지 진행했다.
- 새로고침 후 대회명·4팀·3경기·확정3경기 복원. 별도 context는 기본0팀으로 시작. 다른 context를 다른 업체명으로 저장한 뒤 원래 context 초기화에도 유지됐다. 초기화 취소는 기존 기록을 유지했다.
- 실제 공유 링크 복사 클릭. clipboard 실패 시 수동 주소 복사 경로와 무관한 sessionStorage 키 보존은 로컬 UI 테스트에서 검증했으며 Alpha에서 clipboard 거부를 강제하지는 않았다.
- 저장 손상/차단은 QA harness로 이 demo 키만 손상시키거나 setItem만 거부하는 명시적 fault injection을 사용했다. 오류 표시와 저장 버튼 비활성, 손상 초기화 복구를 확인했다. 임의 선수/분 입력 및 중복 명령 방어의 세부 경계값은 모델 테스트 범위다.
- 공개 체험 전체 진행의 network 관찰은 `/api/v1/health` GET만 있었다. 실제 대회·결과·알림 쓰기 요청0. 공개 체험 console/page/network errors0.
- 배포 전환 중 기존 관리자 탭에서 socket.io/client-error 503이 발생했다. 전환 후 재진입·오류 수집 초기화·재촬영에서 오류0. 기존 baseline 로그인 첫 hydration400과 함께 제품 회귀로 숨기거나 PASS 로그에 섞지 않았다.
- 실제 CTA 클릭으로 새 탭이 열렸고 준비 화면/0팀을 확인했다. 첫 popup URL 관찰이 navigation 전 실행되어 harness `Invalid URL`이 발생했고, 해당 탭 h1을 기다린 후 정상 경로를 확인했다. 두 wait selector의 strict-match 오류도 정확한 selector로 재확인했다. 제품 오류는 아니며 성공으로 가장하지 않았다.

## Viewport verdict
| 폭 | 체험 본문/역할 | 진입 화면 | 결과 |
|---|---|---|---|
| 390×1000 | 5단계·3역할, 세로 적층, 단계 nav 내부 가로 스크롤 | 관리자/담당 대회 | PASS, 문서 가로 넘침0 |
| 768×1000 | 본문1열·하단 안내2열 | 관리자/담당 대회 | PASS, 문서 가로 넘침0 |
| 1440×1000 | 본문/우측 현황2열 | 관리자/담당 대회 | PASS, 문서 가로 넘침0 |
- Light/Dark 3폭과 80자 ASCII 대회명 모바일도 확인. 준비/경기 기록/참가자 화면의 진단에서 44px 미만 상호작용 target0. 대표 PNG의 줄바꿈·밀도·버튼 대비를 시각 점검했다.
- PNG45장: before6, after39. [전체 갤러리](../screenshots/tournament-ops-demo/README.md). 신규 공개 route는 이전 배포에 없으므로 해당 route before는 없다. 기존 진입 화면2개는 각3폭 before/after가 있다.

## CI / 배포 / Cleanup
- PR #2103 자체 리뷰(사용자의 Copilot 대체 요청 적용), PR CI41027786054 PASS. dev merge `2708c6149`; 병합 직후 clean `synced-dev-20261012`를 fetch/ff-only 동기화했다.
- dev CI41033901135 PASS. Deploy Alpha41033900947 attempt1은 CI 대기35분 초과; CI 통과 후 failed job 재실행 attempt2 PASS. 정책/권한/검증 우회 없음. main 승격 없음.
- Headed Chrome PID32296 / parent Node62088. 마지막 close로 context/browser/server를 닫았고 두 PID 부재 확인. 로그인 세션/토큰 파일 없음. 실제 운영 DB·대회·선수·알림 데이터 생성/수정 없음. 샘플 sessionStorage는 context 종료로 정리됐다.