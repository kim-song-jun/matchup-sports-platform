# Codex 세션 이어받기

2026-09-14 02:40 KST 갱신. 이 파일은 **읽기 순서와 현재 위치를 안내하는 입구**다. 상세 진행·결정·검증 기록의 정본은 Task 168 하나로 유지한다.

## 먼저 읽을 문서

1. [Task 168 — 전체 진행 정본](.github/tasks/168-competition-phase3-full-flow-verification.md): 최상단 최신 판정·재개 커서부터 읽는다. Phase 3 구현, PR/Alpha 배포, 실패 원인, 후보 파일, 실제 검증과 미완 항목이 모여 있다. 아래쪽의 과거 ‘진행 중’ 문구보다 최신 기록을 우선한다.
2. [시나리오 허브](docs/scenarios/index.md): 관리자·팀장·팀원·첫 사용자·경기 운영자의 사용자 흐름과 QA 문서 연결. 전체 목표는 30개 흐름 + 12개 경계 상황이며, 일부 UI PASS를 42개 완료로 해석하지 않는다.
3. [Task 165 — 피리어드·인라인 결과 정정](.github/tasks/165-ops-console-league-inline-correction-periods.md): 사용자 선택 A/A와 기존 경기 보존·권한·오류 처리 계약.
4. [Task 166 — 결과·기록 흐름](.github/tasks/166-result-flow-simplify-dispute-removal-records.md): 결과 확인·정정 이후 공개 순위와 팀·개인 기록으로 이어지는 흐름.
5. [저장소 지침](AGENTS.md), [.codex 진입 규칙](.codex/AGENTS.md), [QA 규칙](.codex/qa-rules.md): v1 범위, 공유 작업트리 안전, Ego 시각 검증, 완료 조건.
6. [프론트엔드 규칙](.codex/frontend-rules.md), [디자인 규칙](.codex/design-rules.md), [디자인 정본](docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet%20Design.html): UI 작업 전에 확인한다.

## 현재 확인한 상태

- 원격 dev는 `3f47bbd9d`(#1187 게스트 팀 가입 수정 머지)이고 Alpha도 이 커밋을 서빙한다. 메인 작업트리 로컬 dev도 `--ff-only`로 같은 커밋까지 따라잡았다. 미커밋 작업은 그대로 보존한다.
- **#1187 완료:** 수정·독립 리뷰·CI·Copilot → dev 머지 → Alpha 실화면 BEFORE/AFTER 3폭 검증과 PR 갤러리 코멘트까지 끝났다. 승인 대기 취소 경계와 운영자 background refetch의 실화면은 가입 신청 쓰기가 필요해 검증하지 않았다(단위 테스트 증거만).
- **#1191 완료:** origin/main 전용 커밋을 dev로 흡수해 #735 충돌이 해소됐다.
- **Alpha 배포 결함 D-1:** Stage A 러너가 완료 상태에서 migrate 없이 끝나므로, 이후 dev에 migration이 머지되면 배포는 success인데 Alpha DB에는 적용되지 않는다. 현재 누락은 0이다. **migration을 추가하는 PR은 사용자 결정(U3) 전까지 dev에 머지하지 않는다.**
- **최종 M11 이관은 실행되지 않았다.** 실행 명세 v3(설계 + 적대 비평 2라운드)가 신규 결함 D-2~D-6과 PR 순서(PR-A1 → PR-A2 → 격리 리허설 → 비가역 실행 → post-live → PR-B → PR-C)를 정리했다. 사용자 결정 U1–U11을 기다리고, packager·러너의 기존 BLOCK은 독립 재검토 중이다. 로컬 AWS 세션이 만료돼 SSM 단계는 모두 대기다.
- 관리자·무소속 테스트 계정 로그인 401은 해소됐다(비공개 자격증명으로 201). 비밀번호나 토큰은 저장소에 기록하지 않는다.
- 재개 시 에이전트·세션 상태를 새로 조회한다. 과거 ‘백그라운드 진행 중’ 기록을 현재 실행 상태로 믿지 않는다.

## 상세 증거 위치

- 게스트 가입 BEFORE/AFTER 갤러리: PR #1187 코멘트 `#issuecomment-5654763586` (이미지는 `assets/pr1187-guest-join-gallery-20260914` 브랜치 `ed39de1a`에 SHA 고정).
- 과거 Alpha UI·읽기 검증과 후보 산출물은 로컬 전용 경로다(GitHub에는 없다): `output/ego/task168-ui-pr1184-20260913/`, `output/qa/task168/alpha-45104d5d-readback-result-20260913-r1.json`, `output/qa/task168/final-retirement-candidate-20260913/`.
- `output/` 아래 자료가 없는 컴퓨터에서 재개하면 Task 168에 기록된 원격 CI/PR 증거와 별도 전달받은 산출물을 확인한다.

## PR 정리와 승격 원칙

- 모든 구현 통합 대상은 dev. 필요한 PR은 수정 → 독립 리뷰·GitHub CI → dev 머지 → Alpha 검증까지 진행한다.
- main 대상 개별 PR이 이미 dev에 포함됐는지 코드·커밋으로 확인한 뒤 중복 PR만 닫고 이유를 남긴다. 브랜치는 보존한다.
- [#735 dev → main 승격 PR](https://github.com/kim-song-jun/matchup-sports-platform/pull/735)은 통합 승격 입구로 유지한다. 에이전트가 main에 머지하거나 프로덕션 승격을 실행하지 않는다.
- #735는 이제 `MERGEABLE`이지만 **머지하면 안 된다.** main에는 Task 168 M1–M10이 없고 프로덕션 배포는 plain `prisma migrate deploy`라서, 승격하면 cutover·백업 없이 프로덕션 DB에 적용된다. 본문 맨 위에 경고를 달았다. release changeset 게이트도 아직 실패한다.
- **닫음 확인:** [#1070](https://github.com/kim-song-jun/matchup-sports-platform/pull/1070)은 #1056/#1059/#1066, [#1069](https://github.com/kim-song-jun/matchup-sports-platform/pull/1069)는 #1055, [#585](https://github.com/kim-song-jun/matchup-sports-platform/pull/585)는 #583 및 후속 일반 팀원 후기 진입 개선에 포함돼 닫았다. 원격 브랜치는 삭제하지 않았다.

## 다음 세션에 바로 줄 지시

> readme_codex.md의 순서대로 Task 168 최신 커서와 시나리오 허브를 읽고, 현재 원격 dev·열린 PR·CI·Alpha·에이전트 상태를 새로 대조해 이어서 진행해줘. 구현과 독립 리뷰·Ego UI/UX·역할별 흐름 검증은 서로 다른 에이전트가 맡게 해줘. 공유 dev 작업트리와 다른 세션 변경을 보존하고, 필요한 변경은 PR CI 후 dev에 통합해 Alpha에서 확인해줘. #735 승격 PR은 유지하되 머지·main 승격은 실행하지 마. M11 StageB는 사용자 결정 U1–U11과 AWS 재인증 뒤에 진행하고, 비가역 실행은 사용자 직접 승인 없이는 하지 마. 상세 진행과 남은 작업은 Task 168 한 문서에 계속 기록하고, 42개 흐름·실제 API/DB·동시 정정·감사 실패 복구·Phase 3 최종 이관의 미검증을 완료로 표현하지 마.
