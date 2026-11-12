# Teameet 1.18.0 승격 준비 — 2026-11-13

판정: **버전·비교 자료 준비 완료, 운영 승격은 보류**. 로그인 기반 alpha QA 증거와 준비 PR의 최신 CI/리뷰를 확인한 뒤 사용자가 main 승격을 판단한다. 이 작업은 main PR 개설·머지·운영 배포를 실행하지 않는다.

## 고정한 비교 기준

| 구분 | SHA / 버전 | 확인 |
| --- | --- | --- |
| origin/main 및 실제 프로덕션 | `6d12d118ebf3fee7f7c970b7a7f18c72c9fe5edf` / 공개 헤더 `1.17.1` | `/landing` HTTP 200, main 배포 CI 43084502152 success |
| origin/dev 및 실제 alpha | `c339f1ee9901b6393c3aaa9d026d30ac4fe1043d` / `1.18.0-alpha.20261113.gc339f1ee9901` | `/landing` HTTP 200, CI 43246621638·배포 43246621387 success |
| API/Web 매니페스트 | main/dev 모두 `1.17.0` → 준비 브랜치 둘 다 `1.18.0` | 공식 Changesets로 4개 소비, 양쪽 CHANGELOG 갱신 |

공개 배포 버전과 package.json 버전의 차이는 릴리스 리졸버 계약 때문이다. `resolve-changeset-version.mjs`는 Changeset이 없으면 patch 증가를 기본으로 적용하고, production workflow도 그 `stableVersion`을 사용한다. 따라서 준비 PR 머지 후 새 alpha는 **1.18.1-alpha.…**, 이후 운영 버전 계산은 **1.18.1**이 될 예정이다. 매니페스트의 1.18.0과 구분하며 실제 배포 시 다시 확인한다.

## main 대비 포함되는 기능 — 4/4 PR

| PR | 사용자에게 달라지는 점 | 계약 / 데이터 영향 | 실제 alpha QA 증거 |
| --- | --- | --- | --- |
| [2347](https://github.com/kim-song-jun/matchup-sports-platform/pull/2347) | 전체 대진 설정에서 4~64팀을 1팀 단위로 입력, 홀수 팀 리그·조별리그 및 기존 부전승 연결 지원 | 짝수 제한 제거, DB 변경 없음 | 배포·DB health 확인 기록 있음. 로그인 후 홀수팀 생성 및 3폭 화면 QA 미실행 |
| [2350](https://github.com/kim-song-jun/matchup-sports-platform/pull/2350) | owner/ops가 회원 상세에서 조사 사유를 남기고 회원 팀 맥락의 대진표를 10분간 조회 | admin preview API·감사 기록. 회원 세션 발급/변경 없음, DB migration 없음 | 단위·타입 근거 있음. 실제 권한/만료/에러·3폭 UI 증거 없음. task/PR의 미머지 표기는 현행 dev와 불일치하는 과거 기록 |
| [2348](https://github.com/kim-song-jun/matchup-sports-platform/pull/2348) | 리그+N개 토너먼트에서 시간·구장을 따로 배정, 항목 접기/펼치기, 미배정 시간 저장 | 시간 목록 GET/POST, 기존 경기 PATCH 재사용, 신규 테이블 1개. Docker/client/schema/manifest 증명 동기화 | 배포 전 관리자 로그인/3폭 기준 화면만 기록. 시나리오 기능 0/8·배포 후 화면 0/3이 현재 기록이며 완료로 간주하지 않음 |
| [2351](https://github.com/kim-song-jun/matchup-sports-platform/pull/2351) | 순위표에 반복되던 동점 규정 안내 삭제 | 표시만 변경, 순위 계산/설정 유지 | [배포 전후 갤러리](https://github.com/kim-song-jun/matchup-sports-platform/pull/2351#issuecomment-6828163040): 공개 방문자 390/768/1440 모두 PASS, 순위/전적/승점/득실 동일, 펼침 정상, 오류/가로 넘침 없음 |

미머지 PR #2349(RSC 보안 분석·패치 계획 문서)·#2340(JoinKFA 메뉴 안내)은 이번 배포 비교 범위에 포함되지 않는다. 보안 계획 문서가 배포됐거나 패치가 적용됐다고 표시하지 않는다.

## DB / 배포 영향

- 신규 migration: `20261112000100_v1_tournament_schedule_times`.
- `v1_tournament_schedule_times` 생성: id, tournament_id, scheduled_at, created_at. 대회+시간 unique, 대회 FK `ON DELETE CASCADE`·`ON UPDATE CASCADE`.
- 기존 테이블 DROP/열 삭제/데이터 삭제·재시드 없음. 운영 배포에서는 미적용 migration 1개를 정상 배포 경로로 적용해야 한다.
- API Docker client schema pin, alpha manifest writer/validator, final-steady source binder가 새 schema SHA `5c1f131cad5acefe13408405bdd222141cfaffdcf53de6a1599ed6a7008baf7d`를 허용한다. 이전 허용값은 유지됐다.
- 이번 diff는 새 additive migration이며 과거 Task168 Stage A/B 전환을 다시 실행할 근거가 아니다. 승인된 main 배포의 실제 모드·상태·migration base는 기존 운영 런북을 따라 확인한다. 이 준비 작업은 SSM/운영 DB/비밀값에 접근하지 않는다.
- main에만 있던 커밋은 과거 승격 merge 3개이며, 런타임 tree의 추가 변경은 없었다. 준비 브랜치에 `origin/main`을 merge해 main→dev 방향으로만 이력을 흡수했다. net dev 대상 PR에는 기능 구현을 다시 넣지 않는다.

## 검증 및 남은 게이트

완료:
- alpha SHA == 비교 dev SHA, 프로덕션 SHA == origin/main 확인.
- 전체 67개 변경 경로 분류, feature PR 4개·task/scenario·migration·source 교차 확인.
- 공식 `CONFIRMATION=PROMOTE bash scripts/release/promote-main.sh --prepare-only` PASS: 버전·CHANGELOG 생성 및 main release promotion gate 통과.
- 준비 작업의 runtime/API/DB 코드는 변경하지 않음. 기존 dev CI는 API/Web/Gates 모두 PASS이며, DB replay/integration 검증 근거와 수동 alpha QA를 구분한다.

승격 전 필수:
1. 이 준비 PR의 최신 head에서 CI/정책 검사와 리뷰 상태 확인. 기존 PR의 Copilot 예외 승인은 이 새 PR에 자동 적용하지 않는다.
2. 위 3개 기능의 로그인 기반 alpha 시나리오·권한·만료/에러·390/768/1440 화면 검증 증거 보완. 이 세션에는 인증정보가 없어 수행한 것으로 표시하지 않는다. 공유 대회/경기는 QA 용도로 수정하지 않는다.
3. dev 대상 버전 PR 머지 후 **새 dev SHA의 CI와 alpha 서빙 SHA/버전** 재확인. 그때의 릴리스 리졸버와 main promotion gate를 다시 실행한다. 새 Changeset이 추가됐다면 재소비해야 한다.
4. 최종 dev/main diff와 위 증거를 확인한 사용자가 직접 main 승격 PR을 개설·머지하고 production 승인을 처리한다. 에이전트가 main 승격을 대신하지 않는다.

## 변경 경로 인벤토리

기능 배포 비교(origin/main → 현재 alpha/dev)만 집계하며 준비 PR의 버전·보고서 변경은 아래 67개에 포함하지 않는다.

| 분류 | 파일 수 |
| --- | ---: |
| API | 18 |
| Changeset | 4 |
| Web | 31 |
| 문서/시나리오 | 10 |
| 배포/릴리스 | 4 |

<details>
<summary>전체 변경 경로 67/67</summary>

- `.changeset/admin-member-bracket-preview.md`
- `.changeset/fixture-time-court-assignment.md`
- `.changeset/hide-standing-team-rule.md`
- `.changeset/odd-participant-teams.md`
- `.github/tasks/20261110-flexible-tournament-bracket-planning.md`
- `.github/tasks/20261132-admin-member-bracket-preview.md`
- `.github/tasks/20261132-fixture-time-court-assignment.md`
- `apps/v1_api/prisma/migrations/20261112000100_v1_tournament_schedule_times/migration.sql`
- `apps/v1_api/prisma/schema.prisma`
- `apps/v1_api/src/admin/admin.module.ts`
- `apps/v1_api/src/admin/dto/member-bracket-preview.dto.ts`
- `apps/v1_api/src/admin/member-bracket-preview.controller.spec.ts`
- `apps/v1_api/src/admin/member-bracket-preview.controller.ts`
- `apps/v1_api/src/admin/member-bracket-preview.service.spec.ts`
- `apps/v1_api/src/admin/member-bracket-preview.service.ts`
- `apps/v1_api/src/teams/teams.module.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.controller.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.dto.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.service.spec.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.service.ts`
- `apps/v1_api/src/tournaments/templates/flexible-bracket-plan.spec.ts`
- `apps/v1_api/src/tournaments/templates/flexible-bracket-plan.ts`
- `apps/v1_api/src/tournaments/tournaments.module.ts`
- `apps/v1_api/test/fixtures/game-schema.fixture.ts`
- `apps/v1_api/test/tournaments/schedule-times.integration-spec.ts`
- `apps/v1_web/src/app/admin/tournaments/[id]/bracket-tab.tsx`
- `apps/v1_web/src/app/admin/tournaments/[id]/bracket/page.tsx`
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
- `apps/v1_web/src/components/admin/member-bracket-preview-button.test.tsx`
- `apps/v1_web/src/components/admin/member-bracket-preview-button.tsx`
- `apps/v1_web/src/components/tournaments/member-bracket-identity.tsx`
- `apps/v1_web/src/components/tournaments/stages/stage-public-view.test.tsx`
- `apps/v1_web/src/components/tournaments/stages/stage-public-view.tsx`
- `apps/v1_web/src/components/tournaments/tournament-standings-table.test.tsx`
- `apps/v1_web/src/components/tournaments/tournament-standings-table.tsx`
- `apps/v1_web/src/hooks/use-fixture-schedule-times.ts`
- `apps/v1_web/src/lib/admin-labels.ts`
- `apps/v1_web/src/lib/fixture-assignment.test.ts`
- `apps/v1_web/src/lib/fixture-assignment.ts`
- `apps/v1_web/src/lib/member-bracket-public-source.test.ts`
- `apps/v1_web/src/lib/member-bracket-public-source.ts`
- `apps/v1_web/src/test/msw/handlers.ts`
- `apps/v1_web/src/test/msw/member-bracket-preview-handlers.ts`
- `apps/v1_web/src/test/msw/schedule-time-handlers.ts`
- `deploy/Dockerfile.v1-api`
- `deploy/alpha-manifest-common.sh`
- `docs/api/README.md`
- `docs/api/domains/admin-and-ops.md`
- `docs/api/domains/tournaments.md`
- `docs/api/global-contract.md`
- `docs/design/competition-canonical-flow.md`
- `docs/scenarios/fixture-time-court-assignment.md`
- `docs/scenarios/index.md`
- `scripts/release/create-alpha-release-manifest.sh`
- `scripts/release/prepare-task168-final-steady-inputs.sh`

</details>
