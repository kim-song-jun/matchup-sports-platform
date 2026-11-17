# Teameet 1.19.0 승격 준비 — #2353 포함

Status: Prepared; dev 준비 PR 게시/CI 확인 단계. **main 승격과 운영 배포는 이번 요청 범위 밖이다.**

작성 관측 시각: 2026-11-13T03:06:40+00:00. 이후 CI 결과는 준비 PR의 최신 head 상태를 우선한다.

## 범위와 고정 근거

기존 [준비 PR #2352](https://github.com/kim-song-jun/matchup-sports-platform/pull/2352)는 dev 머지/Alpha 배포까지 완료됐다. 사용자가 정규 리그 시간 기능 #2353을 추가하도록 명시 승인했다. 이전 1.18.0 문서·잠금 파일·브랜치는 이력으로 보존한다. 이번 후보는 새 브랜치 `release/prepare-1.19.0-2353`에 고정하며 [scope lock](release-1.19.0-scope-lock.json) 외 추가 변경을 허용하지 않는다.

- 기능 source snapshot: `a5496263242ab72a51e1ca420b85bf6a8b351ed6` (현재 dev/Alpha).
- main 기준: `0a4a1b268f5c6612da6fd51fdeffc2e6d5179a1c` (성별 핫픽스 #2355 포함).
- 기존 승인 4개 + 추가 #2353 = **5/5 기능**. 별도 main 핫픽스 #2355는 그대로 보존한다.
- 향후 dev 커밋·후속 Changeset은 섞지 않는다. 고정 후보 전체 SHA 링크로 최종 비교한다.
- 이번 준비 PR의 dev 대비 차이는 metadata/docs뿐이다. 기능/API/Prisma/migration/dependency/deploy/workflow를 새로 수정하지 않는다.

## 포함 기능 및 QA

| PR | 포함 내용 | 확인된 증거 / 남은 조건 |
|---|---|---|
| #2347 | 홀수 참가팀 대진 생성 | CI·당시 배포 근거 있음. 로그인 후 홀수팀 생성·3폭 QA 미완료 기록 유지 |
| #2350 | 관리자 회원 상세의 조회 전용 대진표 | 단위·타입 근거 있음. 실제 권한·만료·에러·3폭 QA 미완료 기록 유지 |
| #2348 | 리그+N 토너먼트 시간·구장 독립 배정 | CI·배포 근거 있음. 기존 기능 시나리오와 after 3폭 QA 미완료 기록 유지 |
| #2351 | 순위표 반복 동점 규정 안내 제거 | 기존 공개 390/768/1440 before/after PASS 근거 유지 |
| [#2353](https://github.com/kim-song-jun/matchup-sports-platform/pull/2353) | 정규 리그 시간 등록·경기 시간 배정·수정 시 등록 시간 선택 | 최신 PR 본문: 전체 Web 986 files/12,502 tests·build, API/Gates/security PASS; Alpha SHA 0f1f93621788 확인; headed 1440/768/390 overflow/console/network 이상 없음; 저장·배정·수정·중복·400/401/404 계약 확인. 테스트 경기 시간 원복, 사용하지 않는 시간 선택지 1개가 기존 테스트 리그에 남았다는 기록 유지 |

#2353에는 실제 구장이 아닌 “장소 미정”을 구장 충돌로 경고하던 수정도 포함한다. 새 migration은 추가하지 않으며 #2348의 시간 테이블을 재사용한다. 위 근거는 원 PR의 기록을 교차 확인한 것으로, 이번 준비 세션에서 로그인 QA를 다시 수행했다고 표시하지 않는다.

성별 신청 제한 #2354는 main 핫픽스 [#2355](https://github.com/kim-song-jun/matchup-sports-platform/pull/2355)와 런타임 코드가 같다. main→준비 브랜치 이력 흡수와 1.17.1 CHANGELOG 보존으로 유지한다. 운영 신규 기능 5개에는 중복 집계하지 않는다. 미머지 #2340/#2349 및 다른 후속 변경은 포함하지 않는다.

## 버전 / Changesets

- main manifest 1.17.1, source dev manifest 1.18.0 → 후보 API/Web 모두 **1.19.0**.
- 소비 Changeset 2개: `league-schedule-time-picker.md` (minor), `clean-tournament-team-gender.md` (patch, main 선반영/동등 코드).
- 양쪽 CHANGELOG의 1.18.0과 main 1.17.1 절을 보존하고 1.19.0 절을 생성했다.
- 현재 resolver는 미소비 Changeset이 없으면 patch를 더하므로, 준비 PR 반영 후 예상 표시 버전은 **1.19.1-alpha.… / 운영 1.19.1**이다. manifest와 표시 버전을 구분하며 실제 승격 직전에 다시 계산한다.

## DB / 배포 영향

- main 대비 신규 additive migration은 기존 #2348의 `20261112000100_v1_tournament_schedule_times` **1개**다.
- 시간 선택지 테이블 생성·대회+시간 unique·대회 FK cascade. 기존 데이터 삭제/컬럼 제거/재시드 없음.
- #2353 자체의 신규 migration은 **0개**. schema/client pin·manifest 등은 승인된 기존 기능 diff 그대로 보존.
- Task168 Stage A/B 전환을 다시 실행할 근거가 아니다. 실제 배포 모드는 기존 운영 런북을 따른다. 이번 준비는 운영 DB·SSM·비밀값을 직접 수정하지 않는다.

## 관측한 배포 상태

- Alpha `/landing`: HTTP 200, SHA `a5496263242ab72a51e1ca420b85bf6a8b351ed6`, release `1.19.0-alpha.20261113.ga5496263242a`.
- 준비 시작 시 운영 `/api/v1/health`: HTTP 200, SHA `6d12d118ebf3fee7f7c970b7a7f18c72c9fe5edf`, 표시 `1.17.1`.
- main 저장소는 `0a4a1b268f5c6612da6fd51fdeffc2e6d5179a1c`이나 공개 운영 응답은 당시 이전 SHA였다. 핫픽스 workflow 43348370278은 API/Web/Gates/Build images 성공, Deploy 진행 중이었다. 코드 머지와 운영 반영 완료를 구분한다.

## 준비 검증과 다음 단계

완료: 공식 `--prepare-only`(Alpha SHA/version 대조 포함), 고정 API/Web 버전·Changeset 소비·main promotion gate, versioning 계약 **24/24 PASS**, source snapshot 대비 런타임 diff 0, package version 외 변경 0, diff/debt 검사.

남은 단계:
1. dev 대상 준비 PR 최신 CI·리뷰 확인. 이전 #2352 리뷰 예외와 #2355 1회 main 머지 예외를 새 승격에 자동 적용하지 않는다.
2. 준비 PR 반영 후 새 dev/Alpha SHA·버전·고정 범위 재검증.
3. #2347/#2350/#2348의 미완료 로그인 QA 근거 보완. #2353 QA 완료가 나머지 기능의 QA 완료를 뜻하지 않는다.
4. 사용자 최종 승격 판단 및 별도 main PR/production 승인. 이번에는 main PR을 만들거나 머지하지 않는다.

## main 대비 최종 후보 인벤토리

현재 working-tree 기준 **82/82 경로**. 분류: Docs/task 18, API 20, Web 40, Deploy/release 4. 최종 committed SHA에서 같은 목록과 scope lock을 다시 확인한다.

<details><summary>전체 경로</summary>

- `.github/tasks/20261110-flexible-tournament-bracket-planning.md`
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
- `apps/v1_api/src/tournaments/scheduling/schedule-times.controller.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.dto.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.service.spec.ts`
- `apps/v1_api/src/tournaments/scheduling/schedule-times.service.ts`
- `apps/v1_api/src/tournaments/templates/flexible-bracket-plan.spec.ts`
- `apps/v1_api/src/tournaments/templates/flexible-bracket-plan.ts`
- `apps/v1_api/src/tournaments/tournaments.module.ts`
- `apps/v1_api/test/fixtures/game-schema.fixture.ts`
- `apps/v1_api/test/tournaments/schedule-times.integration-spec.ts`
- `apps/v1_web/CHANGELOG.md`
- `apps/v1_web/package.json`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-fixture-schedule-modal.tsx`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.test.tsx`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-match-fixtures-client.tsx`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-mobile-editor.fixtures.ts`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-time-assignment.test.tsx`
- `apps/v1_web/src/app/admin/league-matches/[leagueId]/league-time-assignment.tsx`
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
- `apps/v1_web/src/components/admin/competition-field-picker.test.tsx`
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
- `docs/api/domains/league-matches.md`
- `docs/api/domains/tournaments.md`
- `docs/api/global-contract.md`
- `docs/design/competition-canonical-flow.md`
- `docs/ops/release-1.18.0-scope-lock.json`
- `docs/ops/release-1.19.0-scope-lock.json`
- `docs/ops/release-readiness-1.18.0-2026-11-13.md`
- `docs/ops/release-readiness-1.19.0-2026-11-13.md`
- `docs/scenarios/fixture-time-court-assignment.md`
- `docs/scenarios/index.md`
- `docs/scenarios/league-schedule-time-picker.md`
- `scripts/release/create-alpha-release-manifest.sh`
- `scripts/release/prepare-task168-final-steady-inputs.sh`

</details>
