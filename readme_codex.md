# Codex 세션 이어받기

2026-09-15 KST 갱신. 이 파일은 **읽기 순서와 현재 위치를 안내하는 입구**다. 상세 진행·결정·검증 기록의 정본은 Task 168 하나로 유지한다.

## 먼저 읽을 문서

1. [Task 168 — 전체 진행 정본](.github/tasks/168-competition-phase3-full-flow-verification.md): 최상단 최신 판정·재개 커서부터 읽는다. Phase 3 구현, PR/Alpha 배포, 실패 원인, 후보 파일, 실제 검증과 미완 항목이 모여 있다. 아래쪽의 과거 ‘진행 중’ 문구보다 최신 기록을 우선한다.
2. [시나리오 허브](docs/scenarios/index.md): 관리자·팀장·팀원·첫 사용자·경기 운영자의 사용자 흐름과 QA 문서 연결. 전체 목표는 30개 흐름 + 12개 경계 상황이며, 일부 UI PASS를 42개 완료로 해석하지 않는다.
3. [Task 165 — 피리어드·인라인 결과 정정](.github/tasks/165-ops-console-league-inline-correction-periods.md): 사용자 선택 A/A와 기존 경기 보존·권한·오류 처리 계약.
4. [Task 166 — 결과·기록 흐름](.github/tasks/166-result-flow-simplify-dispute-removal-records.md): 결과 확인·정정 이후 공개 순위와 팀·개인 기록으로 이어지는 흐름.
5. [저장소 지침](AGENTS.md), [.codex 진입 규칙](.codex/AGENTS.md), [QA 규칙](.codex/qa-rules.md): v1 범위, 공유 작업트리 안전, Ego 시각 검증, 완료 조건.
6. [프론트엔드 규칙](.codex/frontend-rules.md), [디자인 규칙](.codex/design-rules.md), [디자인 정본](docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet%20Design.html): UI 작업 전에 확인한다.

## 현재 확인한 상태

- 원격 dev는 `6cb09059b`(#1207 BlockedAction 컴포넌트 머지)다. 메인 작업트리 로컬 dev는 `--ff-only`로만 따라잡고 미커밋 작업은 그대로 보존한다 — 현재 타 세션 미커밋 파일 6개(교집합 기준: `tournament-roster-client.tsx`·`my-registration-client.tsx`·`tournaments/page.tsx`·`deploy/alpha-release-common.sh`·`deploy/alpha-source-common.sh`·`deploy/prod-release-common.sh`, 전체 미커밋은 528개)가 FF를 막고 있어 `ca988fb3b`에 105커밋 뒤처진 채 멈춰 있다. 그중 `tournament-roster-client.tsx`는 다른 세션이 M-T 결함(아래 참조)을 실제로 고치는 중인 diff라 되돌리면 그 작업을 지운다 — **되돌리기는 사용자 승인 전까지 하지 않는다.**
- **#1187 완료:** 수정·독립 리뷰·CI·Copilot → dev 머지 → Alpha 실화면 BEFORE/AFTER 3폭 검증과 PR 갤러리 코멘트까지 끝났다. 승인 대기 취소 경계와 운영자 background refetch의 실화면은 가입 신청 쓰기가 필요해 검증하지 않았다(단위 테스트 증거만).
- **#1191 완료:** origin/main 전용 커밋을 dev로 흡수해 #735 충돌이 해소됐다.
- **Alpha 배포 결함 D-1:** Stage A 러너가 완료 상태에서 migrate 없이 끝나므로, 이후 dev에 migration이 머지되면 배포는 success인데 Alpha DB에는 적용되지 않는다. 현재 누락은 0이다. **migration을 추가하는 PR은 머지 후 Alpha 원장에 실제로 적용됐는지 직접 확인한다**(M11은 StageB로 적용 완료).
- **최종 M11 이관은 2026-09-15 KST에 실행·커밋됐다(run 34879688639, 릴리스 `7f5c7a735`, 예정자 `72405a2d`).** 호스트 실측: 공개 테이블 118, 레거시 픽스처 테이블 0, 마이그레이션 원장 168 적용/0 미해결, M11 체크섬 `08eac734…`, 대상 enum 2종 제거, 영수증 `MIGRATION_COMMITTED / stageBFinal` + 런타임 검증 + 매니페스트 사본. 보존 대상은 그대로다 — 사용자 396, 팀 86, 팀 멤버십 418. 디스패치는 8차에서 통과했고 3~7차의 원인과 수정은 Task 168 문서에 있다. 마지막 관문이던 7차는 코드 결함이 아니라 프로토콜 전제였다(러너가 'Stage A 이후 무배포'를 요구) — PR #1205가 대조 대상을 이 릴리스 자신의 Stage A 빌드로 교정했고, PR-B #1199 머지(`dd70b6e88`) 뒤 **M11 이후 첫 StageA 배포가 성공**해 배포 경로도 정상화됐다.
- **[PR-A1 #1193](https://github.com/kim-song-jun/matchup-sports-platform/pull/1193)(StageB 도구, draft):** 정규형 동일성 설계로 적대 검증 blocking 0, Copilot 5회 반영 뒤 dev 머지(`4e7c47494`). 사용자가 Alpha에서 백업 결정 없이 M11을 실행하라고 직접 지시했다.
- **[PR-A2 #1194](https://github.com/kim-song-jun/matchup-sports-platform/pull/1194)(StageB 배선):** 적대 검증 라운드와 Copilot 지적(입력 스냅샷 해시 출처, `.source.key` 접두 검사, post-live의 과대 `LIKE` 범위, 재사용된 낡은 매니페스트, post-live 11건 미강제, 실패 실행에 살아남는 낡은 runtime 영수증)을 모두 반영해 dev 머지(`89f6eaaaa`). 영수증 계약(`migration-stage.json` / `runtime-verification.json`)의 소유자이고, U2(자동 계속)까지 배선돼 있다.
- **M11 디스패치 2회 실패 → 원인 규명·수정:** 두 번 모두 "Resolve Task168 StageA predecessor transition" 스텝에서 죽었다. 호스트에서 직접 실행해 원인을 확정했다 — 그 스텝이 SSM으로 맨 셸에서 돌리는 `scripts/release/read-task168-stage-a-predecessor.sh`가 ① DB 계정을 컴파일된 기본값으로 접속했고(운영 env가 그 셸에 없다) ② 컨테이너를 `docker compose`로 찾았다(alpha compose 파일이 `deploy-alpha.sh`만 내보내는 이미지 변수를 요구해 보간 실패). 둘 다 fail-closed라 **DB는 변경되지 않았고 M11은 실행된 적이 없다**. [PR #1200](https://github.com/kim-song-jun/matchup-sports-platform/pull/1200)이 컨테이너 라벨 조회 + 컨테이너 환경에서 역할·DB 파생으로 고쳤고(덤으로 `docker exec -i`가 스크립트 자신의 stdin을 먹던 잠재 결함 제거), 고친 바이트를 실제 Alpha 호스트에서 읽기 전용 실행해 StageA 영수증의 DB 신원과 일치함을 확인했다.
- **M11 이후 대회 재생성·전 구간 E2E 1회 통과(2026-09-15):** 사용자 지시로 팀·사람은 보존, 대회 데이터만 처음부터 재생성(정규 대회 1·정규 리그 1, "(테스트)" 접두). 신청→명단→조 편성("직접 입력"의 "N팀 배정" 버튼이 실제 커밋임을 DB로 확인)→대진 생성→경기 진행→결과 확정→공개 반영, 리그 라운드로빈까지 실화면+DB 대조로 통과. 레시피는 메모리 `alpha-competition-rebuild-recipe`. **이건 42흐름 전수 검증이 아니다** — 핵심 경로 1회 증명일 뿐이다.
- **벤치마크 P0 중 사용자 선택 1건 구현·머지:** [PR #1207](https://github.com/kim-song-jun/matchup-sports-platform/pull/1207) `BlockedAction` 공용 컴포넌트(비활성 CTA 사유를 `aria-describedby`로 연결, WCAG 2.5.3 위반이던 `aria-label` 과적 패턴 제거) + [PR #1206](https://github.com/kim-song-jun/matchup-sports-platform/pull/1206) 이벤트 허브·리그 일정 문구 정정. Alpha `6cb09059b` 실화면에서 신규 문구 확인, `BlockedAction`은 alpha에 재현 가능한 신청 마감 대회가 없어 단위 테스트로만 검증(픽스처 영구 잔존 부담으로 강행 안 함).
- **기준선 UI 감사 critical 3건, 다른 세션이 진행 중:** 팀 신청 명단 member 권한에 수정 CRUD 노출(M-T)·시상 화면 프로필 링크 0건(M-A)·팀 일정 상세 상대팀 정보 누락(M-M). M-T는 메인 작업트리에 다른 세션의 실제 수정 diff(`canManageRoster` owner/manager 게이트)가 미커밋으로 이미 존재함을 확인했다 — **중복 작업 금지, 그 파일들은 건드리지 않는다.** 42흐름 전수 재검증은 이 3건이 dev에 들어온 뒤로 미룬다.
- **main 승격 PR #735 갱신:** M11이 dev에 들어와 승격 위험이 "M1–M10 없음"에서 "M1–M11(DROP 포함) 없음"으로 넓어졌음을 반영해 경고·현재 상태·남은 작업을 갱신했다. 여전히 머지 금지, 사용자 전용.
- 관리자·무소속 테스트 계정 로그인 401은 해소됐다(비공개 자격증명으로 201). 비밀번호나 토큰은 저장소에 기록하지 않는다.
- 재개 시 에이전트·세션 상태를 새로 조회한다. 과거 ‘백그라운드 진행 중’ 기록을 현재 실행 상태로 믿지 않는다.

## 상세 증거 위치

- 게스트 가입 BEFORE/AFTER 갤러리: [PR #1187 코멘트](https://github.com/kim-song-jun/matchup-sports-platform/pull/1187#issuecomment-5654763586) (이미지는 `assets/pr1187-guest-join-gallery-20260914` 브랜치 `ed39de1a`에 SHA 고정).
- 과거 Alpha UI·읽기 검증과 후보 산출물은 로컬 전용 경로다(GitHub에는 없다): `output/ego/task168-ui-pr1184-20260913/`, `output/qa/task168/alpha-45104d5d-readback-result-20260913-r1.json`, `output/qa/task168/final-retirement-candidate-20260913/`.
- `output/` 아래 자료가 없는 컴퓨터에서 재개하면 Task 168에 기록된 원격 CI/PR 증거와 별도 전달받은 산출물을 확인한다.

## PR 정리와 승격 원칙

- 모든 구현 통합 대상은 dev. 필요한 PR은 수정 → 독립 리뷰·GitHub CI → dev 머지 → Alpha 검증까지 진행한다.
- main 대상 개별 PR이 이미 dev에 포함됐는지 코드·커밋으로 확인한 뒤 중복 PR만 닫고 이유를 남긴다. 브랜치는 보존한다.
- [#735 dev → main 승격 PR](https://github.com/kim-song-jun/matchup-sports-platform/pull/735)은 통합 승격 입구로 유지한다. 에이전트가 main에 머지하거나 프로덕션 승격을 실행하지 않는다.
- #735는 이제 `MERGEABLE`이지만 **머지하면 안 된다.** main에는 Task 168 M1–M11(레거시 fixture DROP 포함)이 없고 프로덕션 배포는 plain `prisma migrate deploy`라서, 승격하면 cutover·백업 없이 프로덕션 DB에 M1–M11이 한 번에 적용된다. 본문 맨 위에 경고를 달았다(2026-09-15 M11 반영 갱신). release changeset 게이트도 아직 실패한다.
- **닫음 확인:** [#1070](https://github.com/kim-song-jun/matchup-sports-platform/pull/1070)은 #1056/#1059/#1066, [#1069](https://github.com/kim-song-jun/matchup-sports-platform/pull/1069)는 #1055, [#585](https://github.com/kim-song-jun/matchup-sports-platform/pull/585)는 #583 및 후속 일반 팀원 후기 진입 개선에 포함돼 닫았다. 원격 브랜치는 삭제하지 않았다.

## 다음 세션에 바로 줄 지시

> readme_codex.md의 순서대로 Task 168 최신 커서와 시나리오 허브를 읽고, 현재 원격 dev·열린 PR·CI·Alpha·에이전트 상태를 새로 대조해 이어서 진행해줘. **M11 최종 이관은 이미 완료됐다** — 다시 실행하지 말고, 대신 아래 세 가지를 확인해줘.
> 1. 기준선 critical 결함 3건(M-T 명단 권한·M-A 시상 프로필 링크·M-M 팀 일정 상대팀 정보)을 고치는 다른 세션의 PR이 dev에 들어왔는지 확인하고, 들어왔다면 42개 역할별 흐름 + 12개 경계 상황 전수 재검증을 재개해줘. 아직이면 그 파일들(roster-client·awards-page-client·teams schedules 계열)은 건드리지 말고 다른 항목을 진행해줘.
> 2. 메인 작업트리(`/Users/sungjun/Dev/projects/matchup-sports-platform`)의 로컬 dev가 105커밋+ 뒤처진 채 멈춰 있다. FF를 막는 파일들이 다른 세션의 진행 중 작업인지 다시 확인하고, 되돌려도 되는지는 여전히 사용자에게 직접 물어봐 줘(자동으로 되돌리지 마).
> 3. #735 승격 PR은 유지하되 머지·main 승격은 절대 실행하지 마.
> 구현과 독립 리뷰·Ego UI/UX·역할별 흐름 검증은 서로 다른 에이전트가 맡게 해줘. 공유 dev 작업트리와 다른 세션 변경을 보존하고, 필요한 변경은 PR CI 후 dev에 통합해 Alpha에서 확인해줘. 상세 진행과 남은 작업은 Task 168 한 문서에 계속 기록하고, 42개 흐름·실제 API/DB·동시 정정·감사 실패 복구의 미검증을 완료로 표현하지 마.
