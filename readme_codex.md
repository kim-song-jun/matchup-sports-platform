# Codex 세션 이어받기

2026-09-14 갱신. 이 파일은 **읽기 순서와 현재 위치를 안내하는 입구**다. 상세 진행·결정·검증 기록의 정본은 Task 168 하나로 유지한다.

## 먼저 읽을 문서

1. [Task 168 — 전체 진행 정본](.github/tasks/168-competition-phase3-full-flow-verification.md): 최상단 최신 판정·재개 커서부터 읽는다. Phase 3 구현, PR/Alpha 배포, 실패 원인, 후보 파일, 실제 검증과 미완 항목이 모여 있다. 아래쪽의 과거 ‘진행 중’ 문구보다 최신 기록을 우선한다.
2. [시나리오 허브](docs/scenarios/index.md): 관리자·팀장·팀원·첫 사용자·경기 운영자의 사용자 흐름과 QA 문서 연결. 전체 목표는 30개 흐름 + 12개 경계 상황이며, 일부 UI PASS를 42개 완료로 해석하지 않는다.
3. [Task 165 — 피리어드·인라인 결과 정정](.github/tasks/165-ops-console-league-inline-correction-periods.md): 사용자 선택 A/A와 기존 경기 보존·권한·오류 처리 계약.
4. [Task 166 — 결과·기록 흐름](.github/tasks/166-result-flow-simplify-dispute-removal-records.md): 결과 확인·정정 이후 공개 순위와 팀·개인 기록으로 이어지는 흐름.
5. [저장소 지침](AGENTS.md), [.codex 진입 규칙](.codex/AGENTS.md), [QA 규칙](.codex/qa-rules.md): v1 범위, 공유 작업트리 안전, Ego 시각 검증, 완료 조건.
6. [프론트엔드 규칙](.codex/frontend-rules.md), [디자인 규칙](.codex/design-rules.md), [디자인 정본](docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet%20Design.html): UI 작업 전에 확인한다.

## 현재 확인한 상태

- 로컬 공유 브랜치는 dev, HEAD는 `dd4d0733a`다. 미커밋 작업을 보존하며 브랜치 전환·stash·reset·일괄 staging을 하지 않는다.
- 2026-09-14 원격 조회: dev `7efd1322f03e7773df84d5b2729d35f1b89a9b08`, main `c11e04d2b5bc689d82e02e20fc23be1152bef91e`. 직전 Task 168 증거의 dev `45104d5d`보다 원격이 앞섰으므로 새 커밋과 배포 상태를 다시 대조해야 한다.
- 추가 확인: #1188 팀 목록 초기 데이터, #1189 정규 리그 통합 순위, #1190 전적 컬럼 수정이 dev에 합쳐졌다. 7efd의 CI `34763630297` 및 Alpha 배포 `34763630295`는 성공했다. 실제 화면 검증 범위는 다음 항목과 같다. 별도 보안 workflow `34763633312`는 모델 미지원(CAPI 400)으로 실패했으며 보안 검사 통과로 세지 않는다.
- 후속 실제 화면 확인: [7efd Ego 기록](output/ego/task168-ui-pr1184-20260913/after-7efd/alpha-flow-receipt.md)에서 최종 순위·팀 목록(390/768/1440)과 순위→팀 전적→공식 경기→선수 프로필→개인 기록(390) PASS를 확인했다. 첫 프레임 성능·전체42개 재검증은 포함하지 않는다. Task 168의 41/42는 2026-09-12 과거 집계다.
- 직전 검증된 Alpha 45104: release/DB 등 읽기 검증 16/16, 390·768·1440 팀 기본정보/주요멤버 간격 24px·제목 정렬·가로 넘침 없음, 공개 리그 경기 2개 정상, 멤버 비공개 전환 후 원상 복구 확인. 이는 최신 원격 배포나 전체 E2E 완료 증거가 아니다.
- 열린 dev PR은 [#1187](https://github.com/kim-song-jun/matchup-sports-platform/pull/1187). a0f90deb의 GitHub CI34767313327은 API/Web/Gates PASS다. Copilot의 background refetch UI 깜빡임 지적을 보완한 source7e99451d/testa1f1fb3c 후보는31개 테스트를 통과했다. 게스트 로그인 복귀·세션 만료·재시도·캐시된 비공개 정보와 보호 동작을 보완한다. 마지막 수정이 반영된 현재 PR head의 독립 리뷰·CI/Copilot → dev 머지 → Alpha Ego 결과는 재개 시 다시 확인한다. 로컬 후보 PASS를 배포 완료로 해석하지 않는다.
- 최종 M11 이관은 실행되지 않았다. 최종 이미지·입력 archive 바인딩·실제 격리 리허설·배포 연결·배포 후 검증이 남았다. 후보 스크립트 존재나 문법 검사만으로 실행 준비 완료라고 판단하지 않는다.
- 관리자·무소속 테스트 계정의 로그인 401로 해당 실화면 검증이 남았다. 팀장 계정은 이전 검증에서 정상 로그인했다. 비밀번호나 토큰을 이 문서에 기록하지 않는다.
- 재개 시 에이전트 상태를 새로 조회한다. 2026-09-14 조회에서는 root만 실행 중이었다. 과거 ‘백그라운드 진행 중’ 기록을 현재 실행 상태로 믿지 않는다.

## 상세 증거 위치

- [Alpha 45104 UI 판정](output/ego/task168-ui-pr1184-20260913/after-45104/narrow-verdict.json), [모바일 주요멤버 화면](output/ego/task168-ui-pr1184-20260913/after-45104/team-basic-members-frame-390.png), [데스크톱 화면](output/ego/task168-ui-pr1184-20260913/after-45104/team-basic-members-frame-1440.png).
- [Alpha 45104 읽기 검증](output/qa/task168/alpha-45104d5d-readback-result-20260913-r1.json).
- [게스트 가입 수정 후보](output/qa/task168/team-guest-join-fix-20260913/candidate/): 실제 PR head와 다를 수 있으므로 diff·파일 hash부터 확인한다.
- [최종 이관 후보](output/qa/task168/final-retirement-candidate-20260913/): 미배포 후보와 검토 자료. 실행 승인·실제 리허설 증거를 대체하지 않는다.
- output 아래 자료는 로컬 증거다. 다른 컴퓨터에서 재개할 때 파일이 없으면 Task 168에 기록된 원격 CI/PR 증거와 별도 전달받은 산출물을 확인한다.

## PR 정리와 승격 원칙

- 모든 구현 통합 대상은 dev. 필요한 PR은 수정 → 독립 리뷰·GitHub CI → dev 머지 → Alpha 검증까지 진행한다.
- main 대상 개별 PR이 이미 dev에 포함됐는지 코드·커밋으로 확인한 뒤 중복 PR만 닫고 이유를 남긴다. 브랜치는 보존한다. 결함이 수정 가능하다는 이유만으로 필요한 PR을 폐기하지 않는다.
- [#735 dev → main 승격 PR](https://github.com/kim-song-jun/matchup-sports-platform/pull/735)은 통합 승격 입구로 유지한다. 에이전트가 main에 직접 머지하거나 프로덕션 승격을 실행하지 않는다.
- #735는 조회 당시 `CONFLICTING / DIRTY`다. 과거의 전체 검증 완료 설명을 현재 CI·Alpha 성공 범위와 미완 항목으로 갱신했다. 충돌 해소와 승격 검증이 남았으며 지금 머지 가능한 상태라고 보고하지 않는다.
- **닫음 확인:** [#1070](https://github.com/kim-song-jun/matchup-sports-platform/pull/1070)은 원본 dev PR #1056/#1059/#1066, [#1069](https://github.com/kim-song-jun/matchup-sports-platform/pull/1069)는 #1055, [#585](https://github.com/kim-song-jun/matchup-sports-platform/pull/585)는 #583 및 후속 일반 팀원 후기 진입 개선에 포함됐다. Sol이 7efd의 실제 API·UI·커밋을 대조한 뒤 root가 이유를 기록하고 세 PR을 닫았다. 원격 브랜치는 삭제하지 않았다.

## 다음 세션에 바로 줄 지시

> readme_codex.md의 순서대로 Task 168 최신 커서와 시나리오 허브를 읽고, 현재 원격 dev·열린 PR·CI·Alpha·에이전트 상태를 새로 대조해 이어서 진행해줘. Luna는 독립 구현, Sol은 리뷰와 Ego UI/UX·역할별 흐름 검증을 맡겨줘. 공유 dev 작업트리와 다른 세션 변경을 보존하고, 필요한 변경은 PR CI 후 dev에 통합해 Alpha에서 확인해줘. main 대상 중복 PR은 포함 근거를 확인해 닫되 #735 승격 PR을 유지하고 main 승격 자체는 실행하지 마. 상세 진행과 남은 작업은 Task 168 한 문서에 계속 기록하고, 42개 흐름·실제 API/DB·동시 정정·감사 실패 복구·Phase 3 최종 이관의 미검증을 완료로 표현하지 마.
