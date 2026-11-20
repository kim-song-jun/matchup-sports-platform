# Teameet 1.20.0 승격 준비 — #2364 포함

Status: 운영 적용 완료 — 2026-11-13T09:56:17Z, teameet.co.kr 1.20.1. 아래 준비 기록은 당시 고정 후보 이력이다.

## 실제 운영 적용 결과

- [main 승격 PR #2367](https://github.com/kim-song-jun/matchup-sports-platform/pull/2367) MERGED. Main SHA **17ae2d713db40a2b50dfa1266941a4ddc3afd950**, 고정 후보3a0ee067f15b와 tree diff0.
- [운영 CI·이미지·배포](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43402189039) 및 [CodeQL](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43402187212) 모두 SUCCESS. 기존 production reviewer 승인 게이트로 배포했다.
- 적용 로그에서 `20261112000100_v1_tournament_schedule_times`와 `All migrations have been successfully applied` 확인. 운영에 새 시간 테이블이 적용됐다.
- **운영 표시1.20.1 / manifest1.20.0**. 2026-11-13T09:56:17.885Z(한국18:56) 점검 결과:

| 운영 점검 | 실제 결과 |
|---|---|
| 웹 /landing | HTTP200, SHA17ae2d713db4, release1.20.1 |
| API /api/v1/health | HTTP200, 같은 SHA·release, checks.db=true |
| 공개 대회 목록 | HTTP200, 정상 items 응답 |
| 시간 PATCH 비인증 | HTTP401 |
| 구장 PATCH 비인증 | HTTP401 |

서버 교체 중502 응답을 한 번 관측했으며 다음 점검에서 새 SHA의200/DBtrue로 회복했다. 최종 배포·점검은 정상이다. 운영 smoke는 공개 GET과 존재하지 않는 UUID의 비인증 거절만 수행했고, 실제 수정 기능은 아래 Alpha 테스트 데이터로 검증했다.

main→dev 이력 흡수는 runtime tree diff0의 별도 문서 PR로 전달한다. 포함 기능은 승인된6개로 유지하며, main 이후 열린 다른 dev 기능은 이번 운영 범위에 자동 추가하지 않았다. 작업 소유의 기능/준비/승격 worktree·브랜치와 QA Chrome/helper는 정리했고 결과 기록 자원은 문서 PR 반영 후 정리한다.
## 승인과 고정 범위

2026-11-13 사용자가 “해당 내용까지 main 승격에 포함해줘”로 #2364를 추가했고, “전체 main 운영적용까지 바로 해줘 급해서 계속 승인 못해줘”로 이번 6개 기능의 main PR 생성·머지·production 배포 승인과 결과 확인까지 위임했다. Copilot 422 ACTOR_INELIGIBLE은 이번 승격에 한해 사용자 예외를 적용한다. 보호 규칙·CI·실제 QA·릴리스 검사는 유지한다.

- Source snapshot: `7c288bd0985bd58beb68f7f72155107c0c58d377` (dev merge #2364).
- Main baseline: `6675a8a00ec80b54af0674ebf366bfd7865c0d33`.
- Preparation branch: `release/prepare-1.20.0-2364`.
- Scope lock: [release-1.20.0-scope-lock.json](./release-1.20.0-scope-lock.json). 이후 무관한 dev 변경은 포함하지 않는다.
- 기존 1.19.0/표시 1.19.1 문서·scope lock·후보는 이력으로 보존하며 새 후보 완료 근거로 덮어쓰지 않는다.

| PR | 운영 반영 기능 | QA 근거 |
|---|---|---|
| #2347 | 홀수 참가팀 대진 생성 | 기존 고정 후보의 실제 Alpha 9팀 생성·3폭 검증 |
| #2350 | 관리자 회원 상세의 조회 전용 대진표 | 기존 고정 후보의 로그인·조회·만료·실패·3폭 검증 |
| #2348 | 리그+N 토너먼트 시간·구장 독립 등록·배정 | 기존 고정 후보의 실제 배정·보존·3폭 검증 |
| #2351 | 순위표 반복 동점 규정 안내 제거 | 원 PR의 공개 화면 before/after 3폭 검증 |
| #2353 | 정규 리그 시간 등록·배정 및 수정 시 등록 시간 선택 | 원 PR의 전체 CI·Alpha 실제 저장·3폭 검증 |
| #2364 | 등록 시간·구장 이름 인라인 수정과 배정 경기 동기화 | 아래 새 Alpha QA 및 실제 PostgreSQL 통합 회귀 |

기존 3개 핵심 흐름의 근거는 [#2356 갤러리](https://github.com/kim-song-jun/matchup-sports-platform/pull/2356#issuecomment-6845422443)와 [고정 QA 보고서](https://github.com/kim-song-jun/matchup-sports-platform/blob/822c424fbabbd3a88d3ac7de9cb786bb0e534af4/docs/ops/release-readiness-1.19.0-2026-11-13.md)를 따른다. 당시 세부 권한 CI 근거 승인은 그 후보에 한정한다. 새 #2364의 실제 화면 검증을 이전 캡처로 대체하지 않았다.

main 성별 핫픽스 #2355와 타 팀 신청 핫픽스 #2362를 보존한다. 동등한 dev #2354/#2361은 운영 신규 기능으로 중복 집계하지 않는다. main baseline은 source snapshot의 ancestor다. 이전 후보 974ac541b7a2 이후 merge는 #2361/#2362/#2363(핫픽스·동기화)와 #2364뿐이며, 미머지 #2340/#2349 등 다른 기능을 추가하지 않았다.

## 버전·DB 영향

- 공식 `CONFIRMATION=PROMOTE bash scripts/release/promote-main.sh --prepare-only` PASS. 실행 전 source snapshot과 Alpha 웹/API SHA·버전 일치 확인.
- API/Web manifest는 모두 **1.20.0**. 소비 Changeset: `edit-assignment-time-court.md`(minor), `other-team-application-entry.md`(patch, main 선반영 코드).
- 양쪽 CHANGELOG에 1.20.0을 추가하고 기존 1.19.0·1.17.2 핫픽스 이력을 유지했다. package.json은 version 외 변경하지 않는다.
- 기존 resolver의 no-changeset patch 계약상 준비 반영 후 예상 표시는 **1.20.1-alpha.… / 운영 1.20.1**이다. 실제 최종 후보에서 다시 계산·대조한다.
- main 대비 신규 additive migration은 `20261112000100_v1_tournament_schedule_times` 1개다. #2364 자체의 schema/migration은 0개이며 reset/seed/데이터 삭제는 없다. Task168 Stage A/B 재실행을 뜻하지 않는다.
- 준비 후 런타임/API/Prisma/의존성/배포 코드는 source snapshot과 같아야 한다. 허용 metadata/docs 30개 경로만 검증하며 새 기능 코드를 추가하지 않는다.

## #2364 CI·Alpha 검증

- [기능 PR CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43390758504), [dev CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43392588398), [Alpha 배포](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43392588395) 모두 SUCCESS.
- API 실제 PostgreSQL integration **207 suites / 1,564 PASS, 3 skip**. API unit **549 suites / 9,061 PASS**. Web 전체 테스트·빌드, Gates/security PASS.
- Alpha 웹·API HTTP200, SHA `7c288bd0985bd58beb68f7f72155107c0c58d377`, release `1.20.0-alpha.20261113.g7c288bd0985b`에서 실제 로그인 QA.
- 별도 headed Chrome/Playwright 1.58.2. 브라우저 host 장애 및 격리 네트워크 차단 후 사용자가 구체적인 별도 Chrome 실행을 승인했다. 기존 사용자 브라우저·계정/권한 설정은 변경하지 않았다.

| 시나리오 | 결과 |
|---|---|
| 시간 10:00→10:30 저장·새로고침 | 2개 경기 모두 이동, fixture/preset ID·구장 보존 |
| 구장 QA A구장→QA 메인 구장 저장·새로고침 | 2개 경기 표시 동기화, field ID·시각 보존, version 0→1, B구장 유지 |
| 각 편집 취소/Escape | PATCH 없이 닫힘 |
| 수정 중 접기→다시 수정 | 입력 유지·포커스 복원 |
| 중복 시각·구장 이름 | 실제 HTTP409, 입력 유지, 저장 데이터 불변 |
| 이전 시각·구장 버전 | 실제 HTTP409, 저장 데이터 불변 |
| 비인증 시간/구장 PATCH·개발 신원 헤더 | 실제 HTTP401 |
| 비공개 테스트 대회 공개 상세 | 실제 HTTP404 |
| 시간/구장 × 390·768·1440 before/after | **6/6 PASS**, 페이지 너비=viewport, 저장/취소·sheet scroll 확인 |

Alpha 테스트는 참가팀 없는 4자리/2경기 대진이다. 실제 팀 일정·경기 길이·좌표/출처 핀 보존, 시작 경기 전체 거부, 감사 실패 rollback은 CI의 실제 PostgreSQL spec으로 검증했다. 지원 역할·비활성 필드 등 모든 조합을 Alpha에서 재실행했다고 표시하지 않는다.

application exception 0, 예상하지 않은 HTTP 실패 0. 중복 테스트에서 의도한 409 두 건과 대응 resource error 두 건을 기록했다. Next의 unused CSS preload warning도 관측했으며 화면 스타일·기능은 정상이다. 원시 판정은 [before.json](../screenshots/assignment-edit-2364-20261113/before.json), [after.json](../screenshots/assignment-edit-2364-20261113/after.json)에 있다.

| 폭 | 시간 before / after | 구장 before / after |
|---|---|---|
| 390 | [before](../screenshots/assignment-edit-2364-20261113/before-time-390.png) / [after](../screenshots/assignment-edit-2364-20261113/after-time-390.png) | [before](../screenshots/assignment-edit-2364-20261113/before-court-390.png) / [after](../screenshots/assignment-edit-2364-20261113/after-court-390.png) |
| 768 | [before](../screenshots/assignment-edit-2364-20261113/before-time-768.png) / [after](../screenshots/assignment-edit-2364-20261113/after-time-768.png) | [before](../screenshots/assignment-edit-2364-20261113/before-court-768.png) / [after](../screenshots/assignment-edit-2364-20261113/after-court-768.png) |
| 1440 | [before](../screenshots/assignment-edit-2364-20261113/before-time-1440.png) / [after](../screenshots/assignment-edit-2364-20261113/after-time-1440.png) | [before](../screenshots/assignment-edit-2364-20261113/before-court-1440.png) / [after](../screenshots/assignment-edit-2364-20261113/after-court-1440.png) |

추가: [중복 시간](../screenshots/assignment-edit-2364-20261113/time-duplicate-390.png), [중복 구장](../screenshots/assignment-edit-2364-20261113/court-duplicate-390.png), [저장 후](../screenshots/assignment-edit-2364-20261113/after-saved-1440.png), [정리](../screenshots/assignment-edit-2364-20261113/cleanup-cancelled-private.png).

## 정리와 운영 절차 — 준비 당시 이력

테스트 대회 `e8a86b72-1694-49cb-806e-2039c20e9e67`는 cancelled/isPublic=false, 실제 참가팀 등록 0이다. 경기·감사 기록은 승인된 범위로 남는다. QA Chrome PID38408/helper PID51176 종료 확인, 인증 state 파일 없음. 이전 #2356 테스트/타 세션 WIP는 변경하지 않았다.

1. 버전 준비 PR의 최신 CI와 dev 반영, 정확한 새 Alpha SHA/표시 버전 및 source 대비 런타임 동일성 확인.
2. 위임받은 main PR은 검증된 최종 SHA에 고정하고 이후 dev 변경을 자동 포함하지 않는다.
3. main PR CI 통과 후 정상 PR 머지·production 승인 게이트를 통해 배포한다. 보호 규칙 우회·직접 main push는 하지 않는다.
4. 운영 workflow 성공과 API/Web 실제 SHA·버전·health/public/protected smoke를 대조한 뒤 운영 적용 완료로 보고한다.

## main 대비 최종 준비 트리 인벤토리

총 111/111 경로. source snapshot 이후 허용 30/30 경로, 범위 이탈 0. package version 외 변경 0, main 1.17.2 변경 이력 보존.

- `.github/tasks/20261110-flexible-tournament-bracket-planning.md`
- `.github/tasks/20261130-other-team-application-entry.md`
- `.github/tasks/20261132-admin-member-bracket-preview.md`
- `.github/tasks/20261132-fixture-time-court-assignment.md`
- `.github/tasks/20261133-league-schedule-time-picker.md`
- `.github/tasks/20261133-production-release-1.18.0.md`
- `apps/v1_api/CHANGELOG.md`
- `apps/v1_api/package.json`
- `apps/v1_api/prisma/migrations/20261112000100_v1_tournament_schedule_times/migration.sql`
- `apps/v1_api/prisma/schema.prisma`
- `apps/v1_api/src/admin/admin.module.ts`
- `apps/v1_api/src/admin/dto/member-bracket-preview.dto.ts`
- `apps/v1_api/src/admin/member-bracket-preview.controller.spec.ts`
- `apps/v1_api/src/admin/member-bracket-preview.controller.ts`
- `apps/v1_api/src/admin/member-bracket-preview.service.spec.ts`
- `apps/v1_api/src/admin/member-bracket-preview.service.ts`
- `apps/v1_api/src/teams/teams.module.ts`
- `apps/v1_api/src/tournament-operations/fields/dto/tournament-operations-field.dto.ts`
- `apps/v1_api/src/tournament-operations/fields/tournament-operations-fields.service.spec.ts`
- `apps/v1_api/src/tournament-operations/fields/tournament-operations-fields.service.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.controller.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.dto.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.service.spec.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.service.ts`
- `apps/v1_api/src/tournaments/templates/flexible-bracket-plan.spec.ts`
- `apps/v1_api/src/tournaments/templates/flexible-bracket-plan.ts`
- `apps/v1_api/src/tournaments/tournaments.module.ts`
- `apps/v1_api/src/tournaments/tournament-schedule-order.spec.ts`
- `apps/v1_api/src/tournaments/tournament-schedule-order.ts`
- `apps/v1_api/test/fixtures/game-schema.fixture.ts`
- `apps/v1_api/test/tournaments/assignment-option-edit.integration-spec.ts`
- `apps/v1_api/test/tournaments/schedule-times.integration-spec.ts`
- `apps/v1_web/CHANGELOG.md`
- `apps/v1_web/package.json`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-fixture-schedule-modal.tsx`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-mobile-editor.fixtures.ts`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-time-assignment.test.tsx`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-time-assignment.tsx`
- `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx`
- `apps/v1_web/src/app/admin/tournaments/[id]/bracket-tab.tsx`
- `apps/v1_web/src/app/admin/users/[id]/bracket-preview/[previewId]/page.test.tsx`
- `apps/v1_web/src/app/admin/users/[id]/bracket-preview/[previewId]/page.tsx`
- `apps/v1_web/src/app/admin/users/[id]/page.tsx`
- `apps/v1_web/src/app/tournaments/[id]/bracket/bracket-page-client.tsx`
- `apps/v1_web/src/app/tournaments/[id]/bracket/bracket-schedule-permissions.test.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/fixture-assignment-context.ts`
- `apps/v1_web/src/components/admin/bracket-canvas/fixture-assignment-workspace.test.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/fixture-assignment-workspace.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/fixture-metadata-editor.test.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/fixture-metadata-editor.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/fixture-time-picker.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/flexible-bracket-wizard.test.tsx`
- `apps/v1_web/src/components/admin/bracket-canvas/flexible-bracket-wizard.tsx`
- `apps/v1_web/src/components/admin/competition-field-picker.test.tsx`
- `apps/v1_web/src/components/admin/member-bracket-preview-button.test.tsx`
- `apps/v1_web/src/components/admin/member-bracket-preview-button.tsx`
- `apps/v1_web/src/components/tournaments/member-bracket-identity.tsx`
- `apps/v1_web/src/components/tournaments/stages/stage-public-view.test.tsx`
- `apps/v1_web/src/components/tournaments/stages/stage-public-view.tsx`
- `apps/v1_web/src/components/tournaments/tournament-standings-table.test.tsx`
- `apps/v1_web/src/components/tournaments/tournament-standings-table.tsx`
- `apps/v1_web/src/hooks/use-fixture-schedule-times.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/lib/admin-labels.ts`
- `apps/v1_web/src/lib/fixture-assignment.test.ts`
- `apps/v1_web/src/lib/fixture-assignment.ts`
- `apps/v1_web/src/lib/member-bracket-public-source.test.ts`
- `apps/v1_web/src/lib/member-bracket-public-source.ts`
- `apps/v1_web/src/test/msw/handlers.ts`
- `apps/v1_web/src/test/msw/member-bracket-preview-handlers.ts`
- `apps/v1_web/src/test/msw/schedule-time-handlers.ts`
- `deploy/alpha-manifest-common.sh`
- `deploy/Dockerfile.v1-api`
- `docs/api/domains/admin-and-ops.md`
- `docs/api/domains/league-matches.md`
- `docs/api/domains/tournament-operations.md`
- `docs/api/domains/tournaments.md`
- `docs/api/global-contract.md`
- `docs/api/README.md`
- `docs/design/competition-canonical-flow.md`
- `docs/ops/release-1.18.0-scope-lock.json`
- `docs/ops/release-1.19.0-scope-lock.json`
- `docs/ops/release-1.20.0-scope-lock.json`
- `docs/ops/release-readiness-1.18.0-2026-11-13.md`
- `docs/ops/release-readiness-1.19.0-2026-11-13.md`
- `docs/ops/release-readiness-1.20.0-2026-11-13.md`
- `docs/scenarios/fixture-time-court-assignment.md`
- `docs/scenarios/index.md`
- `docs/scenarios/league-schedule-time-picker.md`
- `docs/screenshots/assignment-edit-2364-20261113/after.json`
- `docs/screenshots/assignment-edit-2364-20261113/after-court-1440.png`
- `docs/screenshots/assignment-edit-2364-20261113/after-court-390.png`
- `docs/screenshots/assignment-edit-2364-20261113/after-court-768.png`
- `docs/screenshots/assignment-edit-2364-20261113/after-saved-1440.png`
- `docs/screenshots/assignment-edit-2364-20261113/after-time-1440.png`
- `docs/screenshots/assignment-edit-2364-20261113/after-time-390.png`
- `docs/screenshots/assignment-edit-2364-20261113/after-time-768.png`
- `docs/screenshots/assignment-edit-2364-20261113/before.json`
- `docs/screenshots/assignment-edit-2364-20261113/before-court-1440.png`
- `docs/screenshots/assignment-edit-2364-20261113/before-court-390.png`
- `docs/screenshots/assignment-edit-2364-20261113/before-court-768.png`
- `docs/screenshots/assignment-edit-2364-20261113/before-time-1440.png`
- `docs/screenshots/assignment-edit-2364-20261113/before-time-390.png`
- `docs/screenshots/assignment-edit-2364-20261113/before-time-768.png`
- `docs/screenshots/assignment-edit-2364-20261113/cleanup-cancelled-private.png`
- `docs/screenshots/assignment-edit-2364-20261113/court-duplicate-390.png`
- `docs/screenshots/assignment-edit-2364-20261113/time-duplicate-390.png`
- `scripts/release/create-alpha-release-manifest.sh`
- `scripts/release/prepare-task168-final-steady-inputs.sh`
