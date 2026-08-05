# Task 127 - V1 Team, Tournament Operations, and Game Record

Owner: root execution pipeline
Status: Task 1 containment baseline frozen; every source revision requires fresh immutable verification evidence
Target: v1 backend + v1 frontend + QA/docs
Canonical plan: `.omo/plans/teameet-team-tournament-operations-v1.md`

## Baseline contract

- Branch: `dev`
- Baseline commit: `71f67b0d24e272eecd216cebb31eefbd66c9ca02`
- Product PDF, preview, and committed design are immutable inputs whose digests are verified before dependent work.
- Task 79 is legacy-path evidence and is not current implementation truth.
- The unrelated dirty fingerprint below is frozen. Those paths remain forbidden to every delivery todo.
- Initial verification requires live `HEAD` to equal the baseline commit. Candidate replay requires a descriptor-verified receipt whose `baselineSHA` equals this baseline and whose `candidateSHA` equals live `HEAD`.

## Classification summary

- Keep: current v1 access and visual invariants that remain valid.
- Extend: current v1 task/scenario coverage that Task 127 builds upon.
- Supersede/stale: a named successor is mandatory and the old artifact is not implementation truth.

## Screen delivery summary

The machine ledger binds all 18 product screen IDs to one route, actor shell, backend contract, delivery wave, E2E scenario, and sole owning todo. Tournament field operations use the separate `/tournament-ops/**` shell; the PDF's `/admin/**` examples are product-intent references, not authorization routing truth.

## Canonical machine ledger

<!-- TASK127_LEDGER_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "branch": "dev",
  "baselineSHA": "71f67b0d24e272eecd216cebb31eefbd66c9ca02",
  "planPath": ".omo/plans/teameet-team-tournament-operations-v1.md",
  "planSHA": "108a6cf1e8a5bbacef86928d28be8f7867525460e0af91d5882d72723ca72b84",
  "cleanRestartAuthority": {
    "approvalReceipt": {
      "path": ".omo/evidence/approved-task-1-clean-restart-v0-dc4ecb2f.json",
      "sha256": "d30d3688ef97b0cefabfad3e6deb8343bb9e8b8f017bae0ff91572be901527ae"
    },
    "rollbackReceipt": {
      "path": ".omo/evidence/task-1-rollback-a-recovered.json",
      "sha256": "087a173e40dbe889eee8d5b1e2f177d8ec690f2635ace8f7610dad551ef31979",
      "authority": "clean-predecessor-evidence-only"
    },
    "cursorReceipt": {
      "path": ".omo/evidence/task-1-task127-clean-restart-cursor-dc4ecb2f.json",
      "sha256": "0946bd0170f9034fdc4c5d99803e2b0ecf7afb46344988e9903933bcee55d9a7"
    },
    "overrideReceipt": {
      "path": ".omo/evidence/task-1-host-pressure-override-dc4ecb2f-r2.json",
      "sha256": "84ab59119f5f83bcffed1478faa50b185b0c02bbb3ca5ecc37822a3c49e92748"
    },
    "consumptionReceipt": {
      "path": ".omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json",
      "sha256": "6cfd41dcbb56bbb07fe3dfb5eb208f2449b8dbb90cef6742618b75481d8ecac4"
    },
    "hostSupervisorReceipt": {
      "path": ".omo/evidence/task-1-host-supervisor-receipt-dc4ecb2f-r6.json",
      "sha256": "d041831fa37ea9e12301a1e934be855e6094f88beac109ed7735ed456fb6f698"
    },
    "restartHeadSHA": "a4823d2f575d9396323421024a81a63dacf0cf67",
    "predecessorChain": [
      "71f67b0d24e272eecd216cebb31eefbd66c9ca02",
      "a84a6e5277c4d29f9281140dca6a630fb5a2ca15",
      "d444649adaf1ba88c3dddd755f6728135d8476b4",
      "a4823d2f575d9396323421024a81a63dacf0cf67"
    ]
  },
  "sources": {
    "pdf": "1558110dc711d421f7c4eea5cd98accc528180e625e1980578f92e1256806d50",
    "preview": "7d8e101ad27a6a227f1a525a729888aa4286845b5a6819aaa034b57cc55ba9f1",
    "designCommit": "71f67b0d24e272eecd216cebb31eefbd66c9ca02",
    "design": "3ee8aedd03c507a7b7540bc9134e52abf49e8210a30d338bca2a899beca0f8a2"
  },
  "ownedPathBaselineState": {
    ".github/tasks/127-v1-team-tournament-operations-game-record.md": "absent",
    "scripts/qa/validate-team-tournament-ledger.mjs": "absent",
    "scripts/qa/run-v1-task-verification.mjs": "absent",
    "scripts/qa/verify-team-tournament-bound-sources.mjs": "absent",
    "scripts/qa/run-v1-task-verification.contract.test.mjs": "absent",
    "deploy/Dockerfile.v1-verification": "absent"
  },
  "globalForbidden": [
    ".env*",
    "apps/api/**",
    "apps/web/**",
    "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
    "unrelatedDirty.paths[*]",
    "every ownership output not listed in the active todo row"
  ],
  "screens": [
    {"id":"T-01","route":"/teams/:teamId","actorShell":"authenticated team shell; team_owner|team_manager operations block","backendContract":"GET /api/v1/teams/:teamId/operations-summary plus team schedule/game projections","wave":2,"scenario":"E2E-TEAM-01","ownerTodo":13},
    {"id":"T-02","route":"/teams/:teamId/schedules","actorShell":"authenticated team shell; member read, team_owner|team_manager manage","backendContract":"GET|POST /api/v1/teams/:teamId/schedules","wave":2,"scenario":"E2E-TEAM-01","ownerTodo":13},
    {"id":"T-03","route":"/teams/:teamId/schedules/new and /teams/:teamId/schedules/:scheduleId/edit","actorShell":"authenticated team shell; team_owner|team_manager","backendContract":"POST /api/v1/teams/:teamId/schedules; PATCH /api/v1/teams/:teamId/schedules/:scheduleId","wave":2,"scenario":"E2E-TEAM-01","ownerTodo":13},
    {"id":"T-04","route":"/teams/:teamId/schedules/:scheduleId","actorShell":"authenticated team shell; member|team_owner|team_manager","backendContract":"GET|PATCH schedule; PUT attendance/me; POST reminders; guest-recruitment contracts","wave":2,"scenario":"E2E-TEAM-01","ownerTodo":13},
    {"id":"T-05","route":"/team-matches/:teamMatchId/lineup","actorShell":"authenticated team-match shell; team_owner|team_manager","backendContract":"GET|PUT /api/v1/team-matches/:teamMatchId/lineup; POST .../submit|change-request","wave":3,"scenario":"E2E-TEAM-01","ownerTodo":15},
    {"id":"T-06","route":"/team-matches/:teamMatchId/result","actorShell":"authenticated team-match shell; host team_owner|team_manager","backendContract":"GET|POST /api/v1/games/:gameId/result-revisions; POST .../:revisionId/submit","wave":3,"scenario":"E2E-TEAM-01|E2E-TEAM-02","ownerTodo":17},
    {"id":"T-07","route":"/team-matches/:teamMatchId/result/approval","actorShell":"authenticated team-match shell; opponent_manager","backendContract":"POST /api/v1/games/:gameId/result-revisions/:revisionId/decision","wave":3,"scenario":"E2E-TEAM-01|E2E-TEAM-02","ownerTodo":17},
    {"id":"T-08","route":"/teams/:teamId/records","actorShell":"public team profile shell with scoped team management context","backendContract":"GET /api/v1/teams/:teamId/records","wave":5,"scenario":"E2E-TEAM-01|E2E-CORR-01","ownerTodo":24},
    {"id":"T-09","route":"/my/schedule","actorShell":"authenticated member shell","backendContract":"GET /api/v1/me/schedule; PUT schedule attendance/me","wave":2,"scenario":"E2E-TEAM-01","ownerTodo":13},
    {"id":"A-01","route":"/tournament-ops/tournaments/:tournamentId/operations","actorShell":"scoped tournament-operations shell; assigned staff","backendContract":"GET /api/v1/tournament-ops/tournaments/:tournamentId/operations","wave":4,"scenario":"E2E-TOUR-01|E2E-TOUR-02","ownerTodo":19},
    {"id":"A-02","route":"/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/operate","actorShell":"scoped tournament-operations shell; assigned field_operator|tournament_director","backendContract":"game commands/events/realtime takeover and backfill contracts","wave":4,"scenario":"E2E-TOUR-01|E2E-TOUR-02|E2E-AUTH-01","ownerTodo":21},
    {"id":"A-03","route":"/tournament-ops/tournaments/:tournamentId/result-review","actorShell":"scoped tournament-operations shell; tournament_director read/review, platform_ops officialize","backendContract":"review-decision, supersede-and-submit, officialize, projection preview","wave":4,"scenario":"E2E-TOUR-01|E2E-CORR-01","ownerTodo":23},
    {"id":"A-04","route":"/tournament-ops/tournaments/:tournamentId/records/corrections","actorShell":"scoped tournament-operations shell; tournament_director|platform_ops","backendContract":"POST /api/v1/games/:gameId/corrections and flag-gated void","wave":5,"scenario":"E2E-CORR-01","ownerTodo":23},
    {"id":"A-05","route":"/tournament-ops/tournaments/:tournamentId/staff","actorShell":"scoped tournament-operations shell; tournament_director|platform_ops","backendContract":"GET|POST staff; POST staff/:assignmentId/revoke","wave":4,"scenario":"E2E-AUTH-01","ownerTodo":19},
    {"id":"P-01","route":"/tournaments/:tournamentId/schedule","actorShell":"public tournament shell","backendContract":"GET /api/v1/tournaments/:tournamentId/schedule","wave":5,"scenario":"E2E-TOUR-01|E2E-PUBLIC-01","ownerTodo":24},
    {"id":"P-02","route":"/tournaments/:tournamentId/matches/:fixtureId","actorShell":"public tournament shell","backendContract":"GET /api/v1/tournaments/:tournamentId/matches/:fixtureId","wave":5,"scenario":"E2E-TOUR-01|E2E-PUBLIC-01|E2E-CORR-01","ownerTodo":24},
    {"id":"P-03","route":"/teams/:teamId/records","actorShell":"public team profile shell","backendContract":"GET /api/v1/teams/:teamId/records","wave":5,"scenario":"E2E-TEAM-01|E2E-PUBLIC-01|E2E-CORR-01","ownerTodo":24},
    {"id":"P-04","route":"/users/:userId/records","actorShell":"public nickname-only user profile shell","backendContract":"GET /api/v1/users/:userId/records","wave":5,"scenario":"E2E-TEAM-01|E2E-PUBLIC-01|E2E-CORR-01","ownerTodo":24}
  ],
  "classifications": [
    {"path":".github/tasks/79-team-match-management-history-contracts.md","classification":"stale","reason":"Its verified evidence and owned paths are legacy apps/api and apps/web, so it cannot define v1 Game/Record behavior.","supersededBy":".github/tasks/127-v1-team-tournament-operations-game-record.md"},
    {"path":".github/tasks/109-v1-tournament-team-ops-batch.md","classification":"extend","reason":"Keep verified v1 tournament/team capabilities and extend only the Game/Record and field-operations gaps.","supersededBy":null},
    {"path":".github/tasks/119-v1-admin-bracket-layout.md","classification":"keep","reason":"The existing admin bracket layout remains valid; field operations are added in a separate scoped shell.","supersededBy":null},
    {"path":".github/tasks/123-admin-owner-access-invariant.md","classification":"keep","reason":"The platform admin owner invariant remains authoritative and does not grant field staff global admin access.","supersededBy":null},
    {"path":"docs/scenarios/index.md","classification":"extend","reason":"Extend the scenario hub with the seven Task 127 E2E journeys in Todo 26.","supersededBy":null},
    {"path":"docs/scenarios/04-team-and-membership.md","classification":"extend","reason":"Preserve membership contracts and add schedule/lineup actor coverage.","supersededBy":null},
    {"path":"docs/scenarios/05-team-match-flows.md","classification":"extend","reason":"Preserve current v1 team-match lifecycle coverage and replace mutable result behavior with append-only revisions.","supersededBy":null},
    {"path":"docs/scenarios/11-team-and-venue-hubs.md","classification":"extend","reason":"Preserve public tournament/team hub coverage and add official record projections.","supersededBy":null},
    {"path":"docs/scenarios/17-tournament-gender-wizard.md","classification":"keep","reason":"Competition roster and gender rules remain prerequisites for lineup eligibility.","supersededBy":null}
  ],
  "ownership": [
    {"todo":1,"inputs":"bound PDF/preview/design hashes; named task/scenario docs; root Node/pnpm contract; existing v1 Docker/deploy patterns","outputs":[".github/tasks/127-v1-team-tournament-operations-game-record.md","scripts/qa/validate-team-tournament-ledger.mjs","scripts/qa/run-v1-task-verification.mjs","scripts/qa/run-v1-task-verification.contract.test.mjs","scripts/qa/verify-team-tournament-bound-sources.mjs","deploy/Dockerfile.v1-verification"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":2,"inputs":"Todo-1 ledger; named v1 auth/schema/admin-shell files","outputs":[".github/tasks/127-v1-team-tournament-operations-game-record.md","scripts/qa/validate-game-record-adrs.mjs"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":3,"inputs":"named baseline API indexes/contracts","outputs":["docs/api/README.md","docs/api/global-contract.md","docs/api/domains/games.md","docs/api/domains/team-schedules.md","docs/api/domains/tournament-operations.md","docs/api/domains/tournament-operations-auth.md","docs/api/domains/tournament-operations-escalations.md","docs/api/domains/game-realtime.md","docs/api/domains/game-migration.md","docs/api/domains/public-records.md","docs/api/domains/tournaments.md","docs/api/v1/domains/tournaments.md","docs/api/v1/domains/deferred-boundaries.md","docs/api/v1/domains/admin-audit.md","scripts/docs/check-api-contract-tree.mjs"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":4,"inputs":"`apps/v1_api/prisma/schema.prisma`; named baseline migrations","outputs":["apps/v1_api/prisma/schema.prisma","apps/v1_api/prisma/migrations/20260729000100_v1_game_operations","apps/v1_api/test/games/game-schema.integration-spec.ts","apps/v1_api/test/fixtures/game-schema.fixture.ts"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":5,"inputs":"Todo-4 schema; named realtime/deploy files","outputs":["apps/v1_api/src/jobs/v1-game-operations-worker.module.ts","apps/v1_api/src/jobs/v1-game-operations-worker.service.ts","apps/v1_api/src/jobs/v1-game-operations-worker.controller.ts","apps/v1_api/src/jobs/v1-game-operations-worker.service.spec.ts","apps/v1_api/src/jobs/v1-game-operations-worker.main.ts","apps/v1_api/src/config/game-operation-flags.ts","apps/v1_api/src/config/game-operation-flags.controller.ts","apps/v1_api/test/jobs/game-operations-control.integration-spec.ts","deploy/v1-game-operations-worker.Dockerfile","deploy/docker-compose.alpha.yml"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":6,"inputs":"Todo-3 contracts; Todo-4 schema; Todo-11 preset/pinning receipt","outputs":["apps/v1_api/src/games/core","apps/v1_api/src/games/games.module.ts","apps/v1_api/src/games/games.controller.ts","apps/v1_api/src/games/games.service.ts","apps/v1_api/src/games/games.service.spec.ts","apps/v1_api/test/games/game-lifecycle.integration-spec.ts","apps/v1_api/src/team-matches/team-matches.service.ts","apps/v1_api/src/tournaments/tournament-bracket.service.ts","docs/api/domains/games.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":7,"inputs":"canonical actor matrix; named admin context","outputs":["apps/v1_api/src/games/auth","apps/v1_api/test/games/tournament-staff-auth.integration-spec.ts","docs/api/domains/tournament-operations-auth.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":8,"inputs":"frozen realtime contract; Todo-5/7 outputs","outputs":["apps/v1_api/src/games/realtime","apps/v1_api/test/games/game-realtime.integration-spec.ts","docs/api/domains/game-realtime.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":9,"inputs":"Todo-5/6/7/11 outputs; approved Task-9 tuple `records=A, escalation=A, bracket=A, identity=A`","outputs":["apps/v1_api/prisma/schema.prisma","apps/v1_api/prisma/migrations/20260802000100_v1_game_projections_escalations","apps/v1_api/prisma/migrations/20260802000200_v1_team_record_facts","apps/v1_api/src/game-operations","apps/v1_api/src/games/projections","apps/v1_api/src/jobs/result-escalation","apps/v1_api/src/jobs/v1-game-operations-worker.module.ts","apps/v1_api/src/jobs/v1-game-operations-worker.service.ts","apps/v1_api/src/jobs/v1-game-operations-worker.main.ts","apps/v1_api/src/games/games.service.ts","apps/v1_api/src/notifications/notifications.module.ts","apps/v1_api/src/notifications/notifications.service.ts","apps/v1_api/src/tournaments/tournament-bracket.service.ts","apps/v1_api/test/games/game-projection.integration-spec.ts","docs/api/domains/games.md","docs/api/domains/tournaments.md","docs/api/domains/tournament-operations-escalations.md","apps/v1_api/prisma/migrations/20260802000300_v1_result_escalation_lifecycle","docs/api/global-contract.md","docs/api/domains/tournament-operations-auth.md","apps/v1_api/prisma/migrations/20260802000400_v1_public_official_result_cache","apps/v1_api/test/games/game-lifecycle.integration-spec.ts","apps/v1_api/test/games/game-schema.integration-spec.ts","apps/v1_api/test/integration/tournament-campaign.e2e-spec.ts","apps/v1_api/test/fixtures/game-schema.fixture.ts","apps/v1_api/src/jobs/v1-game-operations-worker.service.spec.ts","apps/v1_api/test/jobs/v1-game-operations-worker.integration-spec.ts","apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts","apps/v1_api/src/admin/admin-terms.service.spec.ts","apps/v1_api/jest.config.ts","apps/v1_api/src/config/game-operation-flags.ts","apps/v1_api/src/config/game-operation-flags.spec.ts","apps/v1_api/test/jobs/game-operations-control.integration-spec.ts"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":10,"inputs":"named current result services/migrations; Todo-11 source pin receipt","outputs":["apps/v1_api/src/games/migration","apps/v1_api/test/games/game-backfill.integration-spec.ts","apps/v1_api/test/fixtures/game-backfill.fixture.ts","scripts/qa/verify-game-result-cutover.mjs","docs/api/domains/game-migration.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":11,"inputs":"Todo-4 schema; baseline standings service; D-07–D-09 table","outputs":["apps/v1_api/prisma/schema.prisma","apps/v1_api/src/tournaments/competition-config","apps/v1_api/src/tournaments/tournament-bracket.service.ts","apps/v1_api/src/tournaments/tournament-bracket.controller.ts","apps/v1_api/prisma/migrations/20260729000200_v1_competition_config","apps/v1_api/test/tournaments/competition-config.integration-spec.ts","apps/v1_api/test/fixtures/competition-config.fixture.ts","docs/api/domains/tournaments.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":12,"inputs":"named team/team-match modules","outputs":["apps/v1_api/src/team-schedules","apps/v1_api/test/teams/team-schedules.integration-spec.ts","docs/api/domains/team-schedules.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":13,"inputs":"canonical design; named team components/hooks","outputs":["apps/v1_web/src/app/teams/[id]/schedules","apps/v1_web/src/app/my/schedule","apps/v1_web/src/components/team-schedules","apps/v1_web/src/hooks/use-team-schedules.ts","apps/v1_web/src/types/team-schedules.ts"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":14,"inputs":"named membership/player services; consent table","outputs":["apps/v1_api/src/games/lineups","apps/v1_api/test/games/game-lineups.integration-spec.ts","docs/api/domains/games.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":15,"inputs":"Todo-14 contract; canonical design","outputs":["apps/v1_web/src/app/team-matches/[id]/lineup","apps/v1_web/src/components/game-lineup","apps/v1_web/src/hooks/use-game-lineup.ts"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":16,"inputs":"Todo-6/9/12/14 outputs; named team-match service","outputs":["apps/v1_api/src/games/team-results","apps/v1_api/src/team-matches/team-matches.service.ts","apps/v1_api/src/team-matches/team-matches.controller.ts","apps/v1_api/test/games/team-result-approval.integration-spec.ts","docs/api/domains/games.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":17,"inputs":"Todo-16 contract; canonical design","outputs":["apps/v1_web/src/app/team-matches/[id]/result","apps/v1_web/src/app/team-matches/[id]/result/approval","apps/v1_web/src/components/game-results","apps/v1_web/src/hooks/use-game-results.ts"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":18,"inputs":"Todo-7/8/9/11 outputs; named tournament module","outputs":["apps/v1_api/src/tournament-operations/board","apps/v1_api/src/tournament-operations/staff","apps/v1_api/src/tournament-operations/fields","apps/v1_api/src/tournament-operations/lineups","apps/v1_api/test/tournaments/tournament-operations-board.integration-spec.ts","docs/api/domains/tournament-operations.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":19,"inputs":"Todo-18 API; baseline admin-shell files; canonical design","outputs":["apps/v1_web/src/app/tournament-ops/tournaments/[id]/operations","apps/v1_web/src/app/tournament-ops/tournaments/[id]/staff","apps/v1_web/src/app/tournament-ops/layout.tsx","apps/v1_web/src/components/tournament-operations","apps/v1_web/src/hooks/use-tournament-operations.ts","apps/v1_web/src/app/tournament-ops/tournament-ops-shell.test.tsx"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":20,"inputs":"Todo-8/11/18 outputs","outputs":["apps/v1_api/src/games/live-commands","apps/v1_api/test/games/live-game-commands.integration-spec.ts","docs/api/domains/game-realtime.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":21,"inputs":"Todo-19/20 outputs; canonical design","outputs":["apps/v1_web/src/app/tournament-ops/tournaments/[id]/fixtures/[fixtureId]/operate","apps/v1_web/src/components/game-live-console","apps/v1_web/src/hooks/use-game-live-console.ts","apps/v1_web/src/app/tournament-ops/live-console.test.tsx"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":22,"inputs":"Todo-9/11/18/20 outputs; named bracket service","outputs":["apps/v1_api/src/tournament-operations/results","apps/v1_api/src/tournaments/tournament-bracket.service.ts","apps/v1_api/src/tournaments/tournament-bracket.controller.ts","apps/v1_api/test/tournaments/tournament-officialize.integration-spec.ts","docs/api/domains/tournament-operations.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":23,"inputs":"Todo-19/22 outputs; canonical design","outputs":["apps/v1_web/src/app/tournament-ops/tournaments/[id]/result-review","apps/v1_web/src/app/tournament-ops/tournaments/[id]/records/corrections","apps/v1_web/src/components/tournament-result-review","apps/v1_web/src/hooks/use-tournament-result-review.ts","apps/v1_web/src/app/tournament-ops/result-review.test.tsx"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":24,"inputs":"Todo-9/11/14/16/22 outputs; baseline public routes","outputs":["apps/v1_api/src/games/public-records","apps/v1_api/test/games/public-records-privacy.integration-spec.ts","apps/v1_web/src/app/tournaments/[id]/schedule","apps/v1_web/src/app/tournaments/[id]/matches/[fixtureId]","apps/v1_web/src/app/teams/[id]/records","apps/v1_web/src/app/users/[id]/records","apps/v1_web/src/components/public-game-records","apps/v1_web/src/app/public-game-records.test.tsx","docs/api/domains/public-records.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":25,"inputs":"Todo-1 caller ledger; Todo-6/16 callers","outputs":["apps/v1_api/src/games/adapters","apps/v1_api/test/games/game-cutover.integration-spec.ts","apps/v1_api/src/tournaments/tournament-bracket.service.ts","apps/v1_api/src/tournaments/tournament-bracket.controller.ts","apps/v1_api/src/team-matches/team-matches.service.ts","apps/v1_api/src/team-matches/team-matches.controller.ts","apps/v1_web/src/hooks/use-v1-api.ts","apps/v1_web/src/types/api.ts","apps/v1_web/src/test/msw/handlers.ts","scripts/qa/verify-game-result-cutover.mjs","docs/api/domains/game-migration.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":26,"inputs":"baseline scenarios/fixtures; prior contracts","outputs":["apps/v1_api/src/app.module.ts","docs/scenarios/04-team-and-membership.md","docs/scenarios/05-team-match-flows.md","docs/scenarios/11-team-and-venue-hubs.md","docs/scenarios/17-tournament-gender-wizard.md","docs/scenarios/18-team-tournament-operations.md","docs/scenarios/index.md","e2e/v1-tests/team-tournament-operations.spec.ts","e2e/fixtures/team-tournament-operations.ts","e2e/fixtures/runtime.ts","e2e/fixtures/sessions.ts","e2e/fixtures/api-helpers.ts","apps/v1_api/test/fixtures/team-tournament-operations.ts","apps/v1_api/prisma/seed.ts","apps/v1_web/src/test/msw/team-tournament-operations.ts","apps/v1_web/src/test/msw/handlers.ts","apps/v1_web/src/types/api.ts","apps/v1_web/src/hooks/use-v1-api.ts"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
    {"todo":27,"inputs":"Todo-25/26 candidate; baseline load/deploy inputs","outputs":["infra/load/v1-game-operations.js","infra/load/fixtures/v1-game-operations.json","scripts/qa/run-v1-game-operations-load.mjs","scripts/qa/run-v1-release-candidate.mjs","scripts/qa/run-v1-final-gate.mjs","scripts/qa/run-v1-alpha-cutover.mjs","deploy/runbooks/v1-game-operations-alpha.md","deploy/runbooks/v1-game-operations-compatibility-removal.json","deploy/runbooks/v1-game-operations-r3-registry.json"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]}
  ],
  "unrelatedDirty": {
    "schemaVersion": 1,
    "baselineSHA": "71f67b0d24e272eecd216cebb31eefbd66c9ca02",
    "records": [
      "1 .M N... 100644 100644 100644 8de5b09f8141db229849d67b57288f650ed0ad1b 8de5b09f8141db229849d67b57288f650ed0ad1b .claude/agents/AGENTS.md",
      "1 .M N... 100644 100644 100644 bda941f56efacaf2ec3b5ae8a8ef66b0205f876b bda941f56efacaf2ec3b5ae8a8ef66b0205f876b .github/tasks/15-bootstrap-codex-agent-config.md",
      "1 .M N... 100644 100644 100644 237f89f9928dda4fd3932ab4400cc8e5ceed97ef 237f89f9928dda4fd3932ab4400cc8e5ceed97ef AGENTS.md",
      "? apps/v1_api/AGENTS.md",
      "? apps/v1_api/prisma/AGENTS.md",
      "? apps/v1_api/src/AGENTS.md",
      "? apps/v1_web/AGENTS.md",
      "? apps/v1_web/src/AGENTS.md",
      "? e2e/AGENTS.md",
      "? scripts/qa/AGENTS.md"
    ],
    "paths": [
      {"path":".claude/agents/AGENTS.md","index":{"state":"present","entries":[{"mode":"100644","blob":"8de5b09f8141db229849d67b57288f650ed0ad1b","stage":0,"path":".claude/agents/AGENTS.md"}]},"worktree":{"state":"present","type":"regular","mode":"0644","size":2539,"sha256":"553706186cf93532a1717965c25fdc2d0edc3541f5c0375ae4ece763bef6429f"}},
      {"path":".github/tasks/15-bootstrap-codex-agent-config.md","index":{"state":"present","entries":[{"mode":"100644","blob":"bda941f56efacaf2ec3b5ae8a8ef66b0205f876b","stage":0,"path":".github/tasks/15-bootstrap-codex-agent-config.md"}]},"worktree":{"state":"present","type":"regular","mode":"0644","size":5468,"sha256":"860666caf77de5e4d32bac004cb7b83fc3214bdad54b323c19b29bae5c8f6b2a"}},
      {"path":"AGENTS.md","index":{"state":"present","entries":[{"mode":"100644","blob":"237f89f9928dda4fd3932ab4400cc8e5ceed97ef","stage":0,"path":"AGENTS.md"}]},"worktree":{"state":"present","type":"regular","mode":"0644","size":42733,"sha256":"09175f55bf08e97a1e503de1ffd4033ff0e3f544f62883c1374f818ca7bfb8bc"}},
      {"path":"apps/v1_api/AGENTS.md","index":{"state":"absent","entries":[]},"worktree":{"state":"present","type":"regular","mode":"0644","size":3090,"sha256":"a0e32acf1e840bae5c8de66c23e28b1189bfa30d174cb7a6ddabc83ae1e017d6"}},
      {"path":"apps/v1_api/prisma/AGENTS.md","index":{"state":"absent","entries":[]},"worktree":{"state":"present","type":"regular","mode":"0644","size":4184,"sha256":"fc7ad4dae06f6bcdab2c10338ff7f2304bc179fc3c28e61a4cb6d14b571e79bd"}},
      {"path":"apps/v1_api/src/AGENTS.md","index":{"state":"absent","entries":[]},"worktree":{"state":"present","type":"regular","mode":"0644","size":4652,"sha256":"3df97552673576770e0a0ac36c5c21fd7f381095ef544ffa4998ed5ccb14d2a8"}},
      {"path":"apps/v1_web/AGENTS.md","index":{"state":"absent","entries":[]},"worktree":{"state":"present","type":"regular","mode":"0644","size":3465,"sha256":"f32f686603bc5efe8f3f9e781b4f436276d8138002977528ac682f57553a7b7a"}},
      {"path":"apps/v1_web/src/AGENTS.md","index":{"state":"absent","entries":[]},"worktree":{"state":"present","type":"regular","mode":"0644","size":4375,"sha256":"ed3b5deb07ad0f6fb05894b86e6486a2235072edab680e4dd8232fd6a63666b1"}},
      {"path":"e2e/AGENTS.md","index":{"state":"absent","entries":[]},"worktree":{"state":"present","type":"regular","mode":"0644","size":4186,"sha256":"a06ccff3a77f4cf337f6ee99a1974836ee5669f6366e4fe9385b4173aa98c1fa"}},
      {"path":"scripts/qa/AGENTS.md","index":{"state":"absent","entries":[]},"worktree":{"state":"present","type":"regular","mode":"0644","size":4748,"sha256":"a43d9170c70b1bf888b9c851c9953b1859210694fe2033390f95228b3a29490a"}}
    ],
    "fingerprintSHA256": "02f9e070b8a68419ff620af3943bfc638a8ab4a896c24d977384beacb77b81c7"
  }
}
```
<!-- TASK127_LEDGER_JSON_END -->

## Progress snapshot

- Task 9 R5 SERIAL transfer: Todo 3 predecessor commit `df17197a4c46a8b29a54f156db062b16fe5f5de3` is fixed; Task 9 is the sole current owner of `docs/api/global-contract.md` solely to sync the contract fix, with no document content edit. The R4 18-path prefix is unchanged and `docs/api/global-contract.md` is its ordered nineteenth output.

- Task 9 R6 SERIAL transfer: Todo 7 predecessor commit `5591222e65ed40bf1b7220f4f350d3260b9c9eb1` is fixed and includes `docs/api/domains/tournament-operations-auth.md`; no active writer owns that document. Task 9 is the sole current owner of that path solely to bind the approved reviewer/director acknowledgement contract, with no auth-document content edit. The exact R5 19-path prefix is unchanged and `docs/api/domains/tournament-operations-auth.md` is its ordered twentieth output.

- Task 9 R7 SERIAL transfer: the exact R6 ordered 20-path prefix remains unchanged. Task 9 gains only `apps/v1_api/prisma/migrations/20260802000400_v1_public_official_result_cache` as its ordered twenty-first output so the immutable public-cache migration is included in the authoritative source snapshot. R6 remains immutable 20-path predecessor evidence and is stale for public-cache verification only because that terminal migration path was absent.

- Task 17 R1 SERIAL transfer: Todo 10's `apps/v1_api/test/fixtures/game-backfill.fixture.ts` is complete and merged into the integration branch, so no active writer owns it. Task 17 is the sole current owner of that single path solely to add `gameId: null` to `expected.completedTeamMatchDetail`, matching the `gameId` field Task 17 added to the team-match detail response. No other key, row, or file in Todo 10's output set is touched, and the pinned legacy semantics are unchanged (the fixture row has no V1Game, so null is the correct pinned value).

- Task 9 R8 SERIAL transfer: the exact R7 ordered 21-path prefix remains immutable. Remote R5 run `30760020262` revealed stale fixture inputs against frozen canonical sport/actor contracts; this transfer authorizes fixture-only corrections and never trigger/policy weakening. Task 9 gains only ordered outputs 22 `apps/v1_api/test/games/game-lifecycle.integration-spec.ts` (predecessor/last-touch commit `5591222e65ed40bf1b7220f4f350d3260b9c9eb1`), 23 `apps/v1_api/test/games/game-schema.integration-spec.ts` (predecessor commit `0a273c0705bb4232d648ba165eb0f260382c5527`), and 24 `apps/v1_api/test/integration/tournament-campaign.e2e-spec.ts` (explicit unowned-baseline predecessor: committed blob `a65e427f3756b7e3e909b8e4d3df76175af46341`, last-touch commit `69a05c74ef80e908c503aee2ddcaa564970e4493`). R5-R7 receipts remain immutable predecessor evidence; R8 authorizes no source change, CI trigger, or policy/trigger weakening.

- Task 9 R9 SERIAL transfer: the exact R8 ordered 24-path prefix remains immutable. Remote R7 run `30762300729` and its independent review prove only the `game-schema.fixture.ts` source snapshot hash is stale and the remaining negative fixture must remain valid; Task 9 gains only ordered output 25 `apps/v1_api/test/fixtures/game-schema.fixture.ts` (Task 4 predecessor/last-touch commit `0a273c0705bb4232d648ba165eb0f260382c5527`, current committed blob `f4bba311150ad2a3cebd6206e0503cb217dcc09b`). This transfer authorizes an exact-SHA schema-hash rebind and valid negative fixture only; it never authorizes schema, migration, or trigger weakening. R5-R8 receipts remain immutable predecessor evidence.

- Task 9 R10 SERIAL transfer: the exact R9 ordered 25-path prefix remains immutable. Remote R8 run `30763309754` revealed final overall-CI test-harness repairs only: reclassify the real-Postgres worker contract from unit discovery into its existing integration seam without deleting assertions, update the stale seeded-draw expectation, and freeze the admin-terms clock. Task 9 gains only outputs 26 `apps/v1_api/src/jobs/v1-game-operations-worker.service.spec.ts` (blob `9ea47c02a8c0ac62472a78aa8dc2d5beefe7edb1`, last-touch `7e25c4ce1d979cdc8206a720f796b9d6ff9f8d4b`), 27 `apps/v1_api/test/jobs/v1-game-operations-worker.integration-spec.ts` (new destination authorized to derive byte-for-byte from output 26), 28 `apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts` (blob `afcede66ad3e89fcc3f4a968c8ab43db47c03751`, last-touch `9cafca75b5196fd3a3e05eaf0de7c8e77d580d9b`), and 29 `apps/v1_api/src/admin/admin-terms.service.spec.ts` (blob `f30123ef9f4b231885d9fde5a8c003b9d7da80c3`, last-touch `e1c4ae2f0bb31fc6293bfc48caaa0a5ad422e228`). R10 authorizes no production behavior change or test weakening; R5-R9 receipts remain immutable predecessor evidence.

- Task 9 R11 SERIAL transfer: the exact R10 ordered 29-path prefix remains immutable. The confirmed R10 review (`b528449875e28c309213ca84418da5929c47b9b9ef624dd0d153c6770ae34462`) and bounded RED discovery proof show that the integration project excludes `test/jobs/**/*.integration-spec.ts`, leaving both the existing `game-operations-control.integration-spec.ts` and R10's relocated worker contract undiscovered. Task 9 gains only output 30 `apps/v1_api/jest.config.ts` (HEAD `dde576131b500890c2fcaa47f52714c042e60ecb` blob `5ab1558652d0fe831c467e4f8caad292900d3726`, last-touch commit `0dee6e5ddcaa0fcf70ac6feae3711ee18155d6a0`) to add the jobs integration-discovery pattern. R11 authorizes neither a unit-suite skip nor suite deletion; it changes no production behavior and leaves runtime CI pending. R5-R10 receipts remain immutable predecessor evidence.

- Task 9 R12 SERIAL transfer: the exact R11 ordered 30-path prefix remains immutable. The Task 9 R9 remote review (`3d29b92658e70584c92632d8bed008829fa2244c1f6fb88c038435e9bb192778`) at HEAD `4966fa69860f41b3c85c632f03d128be2db69a43` identifies a portable evidence-root repair: replace hard-coded `/private/tmp` only with a shared configured or OS-`tmpdir()` absolute root while retaining descendant containment, descriptor, and hash verification, and prove it through a focused unit contract. Task 9 gains only outputs 31 `apps/v1_api/src/config/game-operation-flags.ts` (HEAD blob `4fcdaf1331ba5447f7068b59583c253905f9156a`, last-touch `91eaa9c482368391eea777ccdb20f473345a7fab`), 32 `apps/v1_api/src/config/game-operation-flags.spec.ts` (new, HEAD-absent unit contract derived from output 31's public root resolver), and 33 `apps/v1_api/test/jobs/game-operations-control.integration-spec.ts` (HEAD blob `c548d6c18155a665de6ba0d867bc371a8a33379e`, last-touch `7e25c4ce1d979cdc8206a720f796b9d6ff9f8d4b`). R12 never duplicates R10 output 27, weakens containment/hash safety, skips unit coverage, deletes suites, changes production behavior outside this portable-root repair, or claims runtime CI; R5-R11 receipts remain immutable predecessor evidence.

- Todo 22 R1 SERIAL transfer: Task 9 remains the sole declared owner of `apps/v1_api/src/game-operations` and `apps/v1_api/src/jobs/v1-game-operations-worker.service.ts`, and its R5-R12 authoritative source snapshot above is unchanged by this entry. This transfer grants Todo 22 authority over exactly two paths within Task 9's outputs, for this round only: (1) `apps/v1_api/src/game-operations/game-result-void-projection.service.ts` — a new `GameOperationHandler`, colocated with and structurally mirroring the existing Task 9 siblings `GameResultOfficialProjectionService`/`GameResultBracketProjectionService` in the same directory, registered to run the async `GAME_RESULT_VOIDED` compensation (hide the stale public-result-cache row, best-effort-reverse any bracket advancement the voided official result already produced, and write projection watermarks) that Todo 22's own synchronous void command emits via the outbox; and (2) `apps/v1_api/src/jobs/v1-game-operations-worker.service.ts` — three additive bindings only (`registerHandler('GAME_RESULT_VOIDED', ...)`, `registerDurableAuditHandler('GAME_RESULT_REJECTED')`, `registerDurableAuditHandler('GAME_RESULT_SUPPLEMENT_REQUESTED')`), using Task 9's own pre-existing registration methods, with no other worker-internal logic edited. The primary synchronous void/reject/supersede-and-submit commands, their `NEXT_FIXTURE_CONFLICT`/`REVISION_MUST_BE_SUPERSEDED` gates, and the `v1_outbox_events` writes that trigger these handlers remain entirely in Todo 22's own declared output `apps/v1_api/src/tournament-operations/results/tournament-result-review.service.ts`. This transfer authorizes no other file in Task 9's `game-operations` or `jobs` outputs and no change to Task 9's own ordered-output bookkeeping.

- Todo 22 R2 SERIAL transfer: the R1 grant above is unchanged and remains in force. R1's three additive bindings in `apps/v1_api/src/jobs/v1-game-operations-worker.service.ts` raised the constructor's built-in `registeredHandlers` count from 4 to 7 (and from 5 to 8 once a caller adds one more via `registerDurableAuditHandler`), which is exactly what CI run `30840145862` reported stale in Task 9's own test `apps/v1_api/test/jobs/v1-game-operations-worker.integration-spec.ts` (HEAD blob `54836cc184069c0da6492f983f1e5112d5a5486f`, last-touch commit `27aa845fc0366f0cc386a757ba876535ea75b0d5`), whose `'reports built-in handler readiness and poisoned queue health without leaking owner identity'` case still hard-coded the pre-R1 counts. This transfer grants Todo 22 authority over exactly that one test file, for this round only, to rebind those two exact-count literals (4→7, 5→8) to match R1's already-authorized bindings; no other assertion, handler, or fixture in the file is touched, no assertion is loosened to a range/contains check, and no other Task 9 test or source file is touched under this grant.

- [x] Bound source hashes frozen.
- [x] Baseline SHA and unrelated dirty fingerprint frozen before owned-path writes.
- [x] Relevant task/scenario references classified.
- [x] Screen ledger mapped 18/18.
- [x] Ownership manifest mapped 27/27.
- [x] V0 execution authority consumed exactly once before expiry.
- [x] Clean-restart bound-source PIN passed before production edits.
- [x] Trusted host supervisor contract passed with zero labeled Docker residue.
- [x] V1 clean-restart precommit verification passed before the root commit.
- [x] Root pathspec commits contain exactly the Task 1 ownership outputs.
- [x] Historical immutable candidate receipt bound the prior committed six-path tree before the relative-growth continuation.
- [x] Historical independent candidate V1 accepted that prior committed tree with zero residual resources; it is stale after any subsequent source-byte change and cannot be reused.

## Task 1 containment evidence

- V0 execution consumption: `.omo/evidence/task-1-v0-execution-consumption-dc4ecb2f.json` (`6cfd41dcbb56bbb07fe3dfb5eb208f2449b8dbb90cef6742618b75481d8ecac4`).
- Trusted host supervisor: `.omo/evidence/task-1-host-supervisor-receipt-dc4ecb2f-r6.json` (`d041831fa37ea9e12301a1e934be855e6094f88beac109ed7735ed456fb6f698`), including canonical-byte receipt validation, nonroot isolation, denied Docker control and hostile environment access, read-only source, timeout/nonzero rejection, signal cleanup, and zero residual resources.
- The immutable relative-growth continuation receipt is `.omo/evidence/task-1-relative-growth-override-dc4ecb2f.json` (`2a1b41aedcece05f389e53fc639d732d6e01c2b886a9762286f3c0a66de7ca36`). It supersedes the Node/MCP-only receipt for Task 1 preflight relative-growth checks only; load, Docker, ports, browser absolute cap, in-run growth, source/candidate identity, and cleanup gates remain hard failures.
- PIN/RED/GREEN, source-manifest, clean-restart, candidate-receipt, and terminal V1 artifacts are bound by exact path and SHA in the durable start-work ledger outside this tracked document. Evidence from a prior source revision is historical and must not be reused for changed bytes.
- Terminal V1 paths and SHAs are intentionally not embedded here because changing this file creates a new source blob; the immutable ledger binding is the non-self-referential authority.

<!-- TASK127_GAME_RECORD_ADR_METADATA_BEGIN -->
```json
{
  "schemaVersion": 1,
  "planPath": ".omo/plans/teameet-team-tournament-operations-v1.md",
  "planSHA256": "b361dc016454d37c41f8fd424d9a2696d1e51d7252b2013358367c7e7434caf9",
  "bundleSectionStart": "# teameet-team-tournament-operations-v1 - Work Plan",
  "bundleSectionEnd": "## Execution strategy"
}
```
<!-- TASK127_GAME_RECORD_ADR_METADATA_END -->

<!-- TASK127_GAME_RECORD_ADR_BUNDLE_BEGIN -->
# teameet-team-tournament-operations-v1 - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** A complete team and tournament operations system: schedules and attendance, lineups, match recording and approval, live tournament control, immutable official results, and consistent public team/player/tournament records.

**Why this approach:** The shared game and record foundation lands before screens, so one verified result can safely update every downstream view. Existing working team and tournament features are extended instead of rebuilt.

**What it will NOT do:** It will not grant global administrator access to field staff, silently accept conflicting data, mutate official records in place, or treat mock/offline behavior as successful server work.

**Effort:** XL
**Risk:** High - additive schema migration, live/offline event ordering, immutable-result cutover, and several permission domains must change together without breaking existing tournament operations.
**Decisions locked:** Field staff use a separate operations shell; schedules associate to matches but do not own games; public player identity is nickname-only and consent-gated; compatibility readers remain in the local alpha-ready candidate and are removed only by a separately authorized post-alpha rollout after measured zero-mismatch evidence.

After this plan passes its required dual high-accuracy review, execution starts only in a separate worker session. Full execution detail follows below.

---

> TL;DR (machine): XL/high-risk additive v1 delivery of Game/Revision/Event/Projection core plus team schedules, lineups, results, tournament live operations, public records, migration, and full agent-executed QA.

### Bound sources
- Product specification: `/Users/sungjun/Downloads/Teameet_app_v1_팀관리_대회운영_상세기획서_2026-07-28.pdf`, SHA-256 `1558110dc711d421f7c4eea5cd98accc528180e625e1980578f92e1256806d50`, 47 pages. This is product intent, not a code snapshot.
- Visual companion: `/Users/sungjun/Downloads/preview.html`, SHA-256 `7d8e101ad27a6a227f1a525a729888aa4286845b5a6819aaa034b57cc55ba9f1`, lines 97-314 contain the ten artboards. Its sample dates/counts/scores are non-authoritative.
- Canonical repository design: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html` at baseline commit `71f67b0d24e272eecd216cebb31eefbd66c9ca02`, SHA-256 `3ee8aedd03c507a7b7540bc9134e52abf49e8210a30d338bca2a899beca0f8a2`.
- Approved decisions, reproduced for executor independence: D-01 no auto-approval, 24h reminder/48h escalation; D-02 lineup public at start-minus-60m; D-03 linked guests accrue personal records, unlinked guests only team/name snapshot; D-04 scoped staff, never global Admin; D-05 corrections are append-only revisions; D-06 default live with per-tournament `status_only`; D-07 scorer requirement is tournament-configurable and team matches warn; D-08 optional 0-1 MVP; D-09 versioned tie-break config; D-10 only event input queues offline; D-11 nickname-only public identity/operations-only real name; D-12 measured compatibility projection then legacy removal.
- Approved Task-1 verification-containment choice: Option A, Docker/Linux-cgroup-contained payload execution, restarted from the independently confirmed clean `a4823d2f575d9396323421024a81a63dacf0cf67` state. After the host reclaimed the original external temporary evidence root, the clean state was independently reverified from live Git objects and sealed as `.omo/evidence/task-1-rollback-a-recovered.json`, SHA-256 `087a173e40dbe889eee8d5b1e2f177d8ec690f2635ace8f7610dad551ef31979`; it is predecessor evidence only, never an instruction to repeat deletion/restoration. Every review/report/approval for plan SHA `0f15522b47d8d9411bc5d0cf8de6175e014584b54f361a5eb839597ed619e960` or any pre-recovery plan SHA is invalid; execution requires two fresh canonical reviews and a fresh approval receipt bound to this final live plan SHA.
## Scope
### Must have
- The entire PDF target state: T-01–T-09, A-01–A-05, and P-01–P-04, not only the ten preview artboards.
- All approved decisions: D-01 A, D-02 A, D-03 A, D-06 A, D-07 A, D-08 A, D-10 A, D-12 A, plus mandatory D-04/D-05/D-09/D-11.
- Additive `V1Game`/side/period/lineup/participant/event/result-revision/approval/visibility/outbox domain with exactly one source and explicit provenance.
- DB-leased worker, transactional outbox, projection/reconciliation, delayed reminder/escalation jobs, feature flags, metrics, and rollback-safe deployment.
- Separate scoped tournament-operations authorization and shell; actor-neutral audit with immediate revocation.
- Version-pinned sport/competition configuration, stable field/court authorization keys, consent-safe participant identity, and public nickname-only identity.
- Canonical v1 REST/realtime contracts, fixtures/MSW/docs/scenarios, responsive and accessible UI states, load/soak/rehearsal evidence, and a pre-cleanup committed-tree release candidate.
- Product KPI instrumentation and an executable real-operator rehearsal protocol. Actual real-operator median results occur only after a separately authorized alpha deployment and are not falsely claimed by this agent-only implementation plan.
- Every untrusted V1–V27/F1–F4 test/build/load/service payload executes inside an attempt-labeled Docker container and Linux cgroup; DB-backed tasks use one separately owned sibling PostgreSQL container. Visible headed V26/F3 browser/manual QA remains host-owned under an exact PID/port lifecycle and is never misrepresented as cgroup-contained.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No legacy `apps/api`, `apps/web`, legacy Prisma, or old design as implementation evidence.
- No `/teams/:id/manage` route and no field operations embedded into the existing giant admin tournament detail.
- No global Admin grant for `field_operator`; no free-text venue comparison for permission checks.
- No hard update/delete of official revisions; no new writes to legacy result tables after the write cutover.
- No silent dual-read fallback, invented historical participants/events, fake offline success, auto-approval, or public roster real names.
- No rebuilding already verified campaigns, multi-team registration, roster access, bracket, or base membership unless an adapter contract requires a scoped change.
- No `main` deployment/promotion and no shared-tree-wide git operation (`stash`, branch switch, `add -A`, broad restore/clean/reset).
- No `dev` push, alpha deployment, real-operator recruitment, deployed full-population cutover claim, or compatibility-reader deletion inside this plan; those are a separate explicitly authorized rollout run against the final approved pre-cleanup SHA.
- No host-native process scanning as the containment boundary; no privileged container, host PID/network/IPC namespace, Docker socket, broad host/workspace or host `node_modules` mount, inherited host environment, `.env*` read/mount, broad Docker prune/down, fixed host port by default, or cross-attempt mutable cache.

## Verification strategy
> Zero human intervention - all local-plan verification is agent-executed. User authorization is required only for the separate future `dev` push/alpha rollout, never to complete this plan.
- **V0-approval** runs before any new tracked, database, Docker, service, browser, build, test, or other workload write. The approved review handoff supplies only `OMO_REVIEW_RECEIPT_PATH`, `OMO_REVIEW_RECEIPT_SHA`, `OMO_REVIEW_DECISION_ID`, `OMO_REVIEW_DECISION_CHOICE`, `OMO_REVIEW_COUNTED_REVIEWER_1`, `OMO_REVIEW_COUNTED_REVIEWER_2`, and the expected live plan SHA. The immutable receipt path plus SHA is the approval-round identity; reviewer launch/session/model/reasoning variables are neither required nor trusted. The receipt is RFC-8785 UTF-8 JSON with exact required schema `{schemaVersion:1,plan,planSha256,decision:{id,choice,value},verdict:"APPROVED",approvedAt,countedReviews:[{reviewer,verdict:"OKAY",source,sourceSha256,observables?},{reviewer,verdict:"OKAY",source,sourceSha256,observables?}],confirmedRepairs:[string,...],cleanup:{processesStarted,containersStarted,browsersStarted,portsOpened},nonCountedReviews?:[...]}`, where optional summary observables must equal `27/27/27/4` but are non-authoritative. Decision is exactly `{id:"task-1-process-containment",choice:"A",value:"Docker/cgroup-contained payload execution"}`. Each counted entry has a distinct reviewer, distinct absolute regular-file JSON `source`, and distinct mandatory lowercase 64-hex `sourceSha256`; each source is the authoritative report with exact schema `{schemaVersion:1,planPath,planSHA256,reviewer,verdict:"OKAY",observables:{numberedTodos:27,verificationRegistryEntries:27,ownershipRows:27,finalGates:4},cleanup:{processesStarted:0,containersStarted:0,browsersStarted:0,portsOpened:0},recommendation:"APPROVE",reviewedAt}`. Non-file provenance is allowed only in `nonCountedReviews` and never counts. V0-approval descriptor-reads receipt, plan, PDF, preview, design, and both source reports using `O_DIRECTORY|O_NOFOLLOW` parent traversal, `O_NOFOLLOW` leaves, pre/post identity, exact byte count, and SHA; it rejects duplicate keys, trailing/non-RFC-8785 bytes, aliases, schema extras, summary-only quorum, stale plan identity, nonzero cleanup, or mismatched report fields/hashes. It separately requires the fixed PDF/preview/design hashes below. Success exports only the seven approval identities `OMO_REVIEW_RECEIPT_PATH`, `OMO_REVIEW_RECEIPT_SHA`, `OMO_REVIEW_DECISION_ID`, `OMO_REVIEW_DECISION_CHOICE`, `OMO_REVIEW_COUNTED_REVIEWER_1`, `OMO_REVIEW_COUNTED_REVIEWER_2`, and `OMO_SELECTED_PLAN_SHA`; it performs no tracked mutation or runtime work. Failure exits 78 as `REVIEW_RECEIPT_OR_SOURCE_DIGEST_MISMATCH`.
- **Canonical normalized file-identity contract:** access time is never identity. `atimeNs` may be retained inside `worktreeLstat` as informational provenance but every descriptor pre/post check, cursor owned-path comparison, six-state comparison, source-manifest check, candidate check, and unrelated-dirty fingerprint must exclude it before equality or drift decisions. Cross-receipt/cross-phase byte identity is the normalized tuple `{path,presenceOrAbsent,indexMode,indexBlobSHA,worktreeType,worktreeMode,worktreeSize,worktreeSHA256OrAbsent}`; content SHA-256 and index blob are authoritative, with type/mode/size and explicit absence guarding shape. `dev`/`ino` are authoritative only inside one descriptor-open operation to prove the same leaf object before/after hashing and may be evidence across phases without becoming a historical equality gate. `mtimeNs`/`ctimeNs` are authoritative only as same-operation pre/post mutation guards when obtained without changing the leaf; historical receipts retain them as informational evidence rather than cross-run byte identity. `blksize`, `blocks`, `gid`, `uid`, `nlink`, `rdev`, and all other raw lstat fields are informational unless another explicit security policy independently requires them. Consumers project `worktreeLstat` to this normalized contract before comparison; raw-lstat or access-time equality is forbidden. “Exact identity,” “path identity,” “stable-lstat,” “six-state equality,” and “unrelated-dirty fingerprint equality” everywhere in this plan mean this normalized contract. This audited normalization invalidates every review/report/approval for plan SHA `da6ea3c958dcb27655a59cecbb336461eecbc616e3b229419f520a84fe9cabcc`; artifacts for unauthorized repair SHA `36b8207be7fb56334674c1aa5c9da5a4b3fd3c516cef3a0d2f0ae641c08329c0` are non-authorizing audit evidence only and cannot approve the final live SHA.
- **Clean-restart authority and order:** required order is two fresh canonical JSON review reports for the final live plan SHA → fresh approval receipt → V0-approval → descriptor-verify the immutable rollback receipt and exact clean six-path state → initial Task127 cursor rebase bound to the final live plan → immutable clean-restart cursor receipt → fresh approval+cursor-bound Task-1 host-pressure override → V0-execution and immutable single-use consumption → PIN → RED before any production/harness edit → smallest GREEN implementation → trusted host-supervisor gate → V1 `clean-restart` precommit verification → exact row-1 pathspec commit → fresh candidate capture → independent V1 `candidate` verification. No implementation or candidate may be pre-minted against an earlier plan SHA.
- **Clean six-path gate:** V0-approval descriptor/hash/schema-verifies recovered rollback receipt `.omo/evidence/task-1-rollback-a-recovered.json` SHA `087a173e40dbe889eee8d5b1e2f177d8ec690f2635ace8f7610dad551ef31979`, then independently proves branch `dev`, `HEAD=a4823d2f575d9396323421024a81a63dacf0cf67`, ledger `baselineSHA=71f67b0d24e272eecd216cebb31eefbd66c9ca02`, direct first-parent Task-1 chain `71f67b0d24e272eecd216cebb31eefbd66c9ca02 → a84a6e5277c4d29f9281140dca6a630fb5a2ca15 → d444649adaf1ba88c3dddd755f6728135d8476b4 → a4823d2f575d9396323421024a81a63dacf0cf67`, and exact clean normalized identities: Task127 `100644/697c18cb094f91b6b131d73e32ddefc64bb9ebaa`, 30,226 bytes, SHA-256 `1868bf1a5038e2b7c5be96ce767c2490d4f6b3653aee56d4c59fb4889a6e826b`; validator `100644/8d258c679879a331f253bf23909e8ea3fe0a5240`, 11,736 bytes, SHA-256 `d340c5add8ce06db03e13fb281a690e9eb035d67a48abd9f4b4917b8ae918921`; wrapper `100644/da7ef72924872555deade1bae7e199c17d5c1341`, 61,999 bytes, SHA-256 `fd7b2a50d3c989d4296ae54d709e5a710f5acd8adc5f546e18550220b5f57a9b`; bound-source verifier `100644/a218eed3b7bd9ce1170d878ad8c4f6b486cea978`, 10,715 bytes, SHA-256 `0a137e0fdcfd5299ef75d50225fb628fa69b0d995fc7368dc053debf48540aa2`; contract test absent from index/worktree; verification Dockerfile absent from index/worktree. Exact six-path status is empty and the unrelated status-set fingerprint is `65051bf57a83e1bf287a654fdb121e7361bd9136e673bac0a9a149ecf11c4923`. The receipt prose never substitutes for these live descriptor checks; raw lstat and `atimeNs` remain non-authoritative.
- **Initial Task127 cursor rebase:** after V0-approval, update only `.github/tasks/127-v1-team-tournament-operations-game-record.md` from the exact `a482` document whose status is `Baseline frozen; Task 1 complete pending independent verification`. Bind the final live `planSHA`, set status to `Task 1 containment clean-restart; final-plan review bound; host-supervisor gate pending`, and add the two row-1 containment paths required by the ownership ledger; preserve baselineSHA, 18 screen mappings, ownership outputs, and all product decisions. The other five paths, shared index, unrelated WIP, database, Docker, services, browsers, and processes remain unchanged. Atomically create immutable RFC-8785 JSON `{schemaVersion:1,receiptType:"task-1-task127-clean-restart-cursor",mode:"clean-restart-initial",planPath,planSHA256,approvalReceipt:{path,sha256},rollbackReceipt:{path,sha256,authority:"clean-predecessor-evidence-only"},baselineSHA,restartHeadSHA,predecessorChain,taskPath,statusBefore,statusAfter,task127PreSHA256:"1868bf1a5038e2b7c5be96ce767c2490d4f6b3653aee56d4c59fb4889a6e826b",task127PostSHA256,ownedPathStatesBefore,ownedPathStatesAfter,unrelatedDirtyFingerprintBefore,unrelatedDirtyFingerprintAfter,createdAt}` using `O_CREAT|O_EXCL`, fsync, `0444`, and path+SHA transport. Only Task127 may differ before/after; all other five normalized identities and the unrelated fingerprint remain exact.
- **Task-1 pressure override:** all default stop gates remain: 1-minute load >2× logical cores; swap growth ≥2,147,483,648 bytes; Node/MCP growth ≥50 from invocation baseline; browser count >200 or growth ≥20; unhealthy or mismatched Docker daemon/server/VM/target service; foreign fixed-port ownership; or incomplete cleanup. For Task 1 only, one fresh approval+clean-restart-cursor-bound immutable receipt may waive exactly the stable absolute swap-used gate >17,179,869,184 bytes and stable absolute Node/MCP-count gate >900; this narrow dual waiver is necessary because the approved host's stable absolute Node/MCP count already exceeds 900, otherwise the required RED proof cannot start. Exact schema is `{schemaVersion:1,planPath,planSHA256,approvalReceipt:{path,sha256,approvedAt},cursorReceipt:{path,sha256},taskId:1,allowedTasks:[1],workloadId:"task-1-host-supervisor-v1",sessionId,scope:"stable-absolute-swap-and-node-mcp-count-only",userAuthorization:{text:"block 무시하고 진행해도돼 이 프로젝트는 사용자 지침이야 바로 나머지 이어서 진행해 /goal resume",sha256:"5555a5b17838c59238a9f4786aa7cb19b08829691d34de8560e7d87f497c2a71"},serialExecution:true,maxConcurrency:1,resourceLimits:{cpus:1,memoryBytes:4294967296,pidsLimit:256},waivedAbsoluteGates:{swapUsedBytesGreaterThan:17179869184,nodeMcpCountGreaterThan:900},hardGrowthGates:{swapGrowthBytesAtLeast:2147483648,nodeMcpGrowthAtLeast:50},metrics:{invocationBaseline,current},noOtherSessionTermination:true,cleanup:{containers:0,networks:0,volumes:0,overlays:0,publishedPorts:0,hostBrowserPids:0,tempRoots:0},createdAt}`. It is created after approval and cursor, expires after 900 seconds, is consumed once, and cannot waive load, growth, browser, Docker/server/service, port, exit, timeout, interruption, or cleanup gates. Generic bypass flags, wrong task/session/text/hash, env-only claims, missing path/SHA halves, preminting, reuse, or nonzero cleanup fail before workload.
- **V0-execution:** re-run every V0-approval descriptor/hash/schema check; reverify approval, rollback receipt, clean-restart cursor, its exact Task127 pre/post and unchanged five-path/unrelated identities, and the fresh pressure override; then atomically create and descriptor-reverify the immutable single-use consumption record. Export only `OMO_EXECUTION_PLAN_SHA`, approval path/SHA, cursor path/SHA, override path/SHA, and consumption path/SHA. Before implementation, any mixed/stale identity, six-path drift outside the cursor-authorized Task127 state, atime/raw-lstat authority, second consumption, or unapproved write fails as `V0_EXECUTION_CHAIN_INVALID`.
- **Clean-restart V1 and candidate handoff:** V1 `clean-restart` records `baselineSHA=71f67b0d24e272eecd216cebb31eefbd66c9ca02`, `restartHeadSHA=a4823d2f575d9396323421024a81a63dacf0cf67`, the direct predecessor chain, final plan/approval/cursor/override/consumption identities, `candidateSHA:null`, and the private-index `sourceTreeSHA`/source manifest for the implemented row-1 files. No dirty precommit candidate exists before new implementation. After GREEN, the root pathspec-commits exact ownership row 1 and verifies byte-identical modes/blobs to that source manifest, then creates a fresh immutable candidate receipt `{schemaVersion:1,phase:"candidate",baselineSHA,restartHeadSHA,candidateSHA,sourceTreeSHA,sourceManifestPath,sourceManifestSHA,planSHA,approvalReceipt:{path,sha256},task127CursorReceipt:{path,sha256},overrideReceipt:{path,sha256},consumptionReceipt:{path,sha256},ownedPathBlobs:[{path,mode,blobSHA}],createdAt}`. Independent V1 `candidate` requires live `HEAD=candidateSHA`, the same baseline/restart head/plan/source/receipt chain, clean row-1 index/worktree, and no unrelated-fingerprint drift.
- Test decision: TDD for state machines, authorization, idempotency, concurrency, projection, migration, and public privacy contracts using Jest/Prisma integration; tests-after for React presentation using Vitest; Playwright v1 manual/E2E for real flows.
- Todo 1 first runs the trusted host-supervisor contract-test command defined below **outside** the wrapper under test. That command alone may call the real Docker API and owns daemon identity/health/failure-recovery probes plus exact create/start/interrupt/inspect/stop/remove/residual queries for its task-owned fixtures; it must never stop/restart the shared host daemon or touch foreign resources. It writes an immutable host-supervisor gate receipt only after its own exact resources and fault-injection proxy are clean. V1 is a separate hostile payload executed through the wrapper under test and cannot start until it descriptor-verifies that receipt. After this pre-gate, every untrusted test/build/load/service/final-gate payload, including V1, V27, and F1–F4, runs through the host-owned `node scripts/qa/run-v1-task-verification.mjs` wrapper inside the attempt's unprivileged payload container/cgroup. Before any payload, the wrapper writes a baseline JSON, enforces the numeric host gates below, validates Docker Engine/Desktop identity and daemon health, verifies the pinned image/source identities, then creates only exact attempt-labeled resources. Every attempt gets its exact-name internal user-defined network; DB-backed standalone tasks add one sibling PostgreSQL container on it, while non-DB tasks create no DB container or DB volume. A terminal success receipt is framed only after the real payload exit code is zero, stdout/stderr/exit are separately captured, every exact container/network/volume/port is removed, and residual-resource queries return zero. Success-shaped output never overrides a nonzero exit.
- Runtime attempt evidence is always external and guaranteed untracked: `/private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1/`. Authority receipts whose loss would invalidate the execution chain are additionally sealed under ignored `.omo/evidence/` and referenced by exact path+SHA; runtime evidence never treats that durable mirror as payload output. A standalone V1–V26 verification without a candidate receipt creates a fresh UUID `attemptId`. A V27/F1–F4 invocation must instead pass `--adopt-candidate-attempt` plus the immutable candidate receipt path/hash; the harness descriptor-verifies it before load, adopts its exact `attemptId/candidateSHA/baselineSHA/planSHA`, and is forbidden to allocate a different attempt. Registry children inherit that adopted identity from the V27 lifecycle receipt. Before a wave commit, `<attemptDir>` expands to `tree-sha256/<sourceTreeSHA>/attempt-<attemptId>/`; after Todo 27 captures the committed candidate, it expands to `commit-sha256/<candidateSHA>/attempt-<attemptId>/`. The harness creates `sourceTreeSHA` without touching the shared index: it sets a private temporary `GIT_INDEX_FILE`, reads candidate `HEAD`, adds only the todo's owned worktree paths to that private index, writes the tree, exports the exact tree with `git archive`, and writes an immutable source-manifest receipt containing ordered path/blob/mode/hash entries. V4/V11 apply migrations and run root preparation only from that exported tree. The root's later pathspec commit must contain byte-identical blobs/modes for every owned path or `SOURCE_SNAPSHOT_COMMIT_DRIFT` aborts successor work. V27 reruns V1–V26 into one exact final-attempt directory, and F1 rejects provisional/missing/mixed-attempt evidence. Unchanged-SHA reruns create a new candidate capture/attempt directory and never overwrite prior evidence.
- Every V receipt is canonical immutable JSON and contains `{schemaVersion,gateId,phase,commandId,commandHash,attemptId,baselineSHA,restartHeadSHA?,candidateSHA?,sourceTreeSHA,sourceManifestPath,sourceManifestSHA,planSHA,task127CursorReceiptPath?,task127CursorReceiptSHA?,hostSupervisorReceiptPath?,hostSupervisorReceiptSHA?,containerRuntime,verificationImage,payloadContainer,dbContainer?,network,volumes,publishedPorts,sourceMount,cache,stdoutPath,stderrPath,payloadExitCode,cleanup,dbLifecycleReceiptPath?,dbLifecycleReceiptSHA?,hostBrowserLifecycleReceiptPath?,hostBrowserLifecycleReceiptSHA?,verdict,createdAt}`. Producers and consumers descriptor-verify every referenced receipt and require exact gate, phase, command, attempt, baseline, restart head, candidate, source, plan, clean-restart cursor, image/toolchain, lifecycle, exit, and cleanup identity. V1 additionally requires the exact clean-restart cursor and trusted host-supervisor receipt pairs; missing, malformed, cross-attempt, replaced, or stale identities fail before payload.
- Every Todo N executes standalone command VN below; files named by a command are created and owned by that same todo before the command runs. The wrapper supplies a minimal constructed environment only: controlled `CI`, `TZ`, `LANG`, container-local `HOME`/`PNPM_HOME`, exact `OMO_*`/`V1_*` receipt and attempt identities declared by the registry, and the wrapper-generated per-attempt `DATABASE_URL` for DB tasks. That ephemeral DB credential is not inherited, mounted, logged, or persisted; receipts redact it. The wrapper rejects every undeclared key and any host-provided secret-shaped key, never reads or mounts `.env*`, and does not pass host credentials, tokens, SSH agents, cloud metadata, or Docker control into payloads. Integration commands use package-relative Jest/Vitest paths because the in-container supervisor changes into the selected package. V13/V15/V17/V19/V21/V23/V24 are task-local Vitest or API gates only; all headed Playwright persona/viewport evidence promised by those todos is created exclusively by Todo 26/V26 after every UI/API prerequisite exists.
- V27 uses a distinct receipt-bound registry-child protocol rather than recursively executing standalone wrapper strings. Its host outer wrapper creates the sole attempt-labeled payload container, shared network, task-owned volumes/tmpfs, sibling PostgreSQL container, fixture, and API/web services, and writes immutable Docker plus DB lifecycle receipts. The registry canonicalizes each VN into the payload after `--` plus declared package/root-prepare/browser requirements, then invokes an in-container child supervisor with `--registry-child --parent-attempt "$attemptId" --parent-lifecycle-receipt "$V1_TASK_LIFECYCLE_RECEIPT_PATH" --parent-lifecycle-receipt-sha "$V1_TASK_LIFECYCLE_RECEIPT_SHA" --candidate-receipt ...`. Child mode descriptor-verifies parent/candidate receipts, inherits DB/attempt/candidate/plan/source/image/network identities, and has neither Docker socket/control nor permission to create/drop DBs, attempts, containers, networks, volumes, services, or `lifecycle-owner outer`. V26 child requests the outer API/web mappings but delegates visible headed Playwright to the host wrapper via `--host-browser-owner`; the host browser is the only process outside the payload cgroup, owns only its recorded PID tree and loopback mappings, and must close before V26 returns. The V27 outer removes shared Docker resources exactly once after every child/load/build gate and host-browser cleanup, even on failure, timeout, or interruption.

### Frozen Docker/cgroup verification-containment contract
- Canonical tracked verification image definition is `deploy/Dockerfile.v1-verification`, matching the repository's `deploy/Dockerfile.v1-api` naming convention. It uses Node 22 on `node:22-bookworm-slim` pinned by an actual `@sha256:<64-lowercase-hex>` digest (tag-only or placeholder digest is invalid), activates exactly root `packageManager` `pnpm@9.15.4`, and verifies root/app `engines.node >=22`. The receipt binds Dockerfile bytes, resolved manifest digest, `linux/<architecture>`, Node/pnpm versions, and `pnpm-lock.yaml` SHA. Dependency install is `pnpm install --frozen-lockfile`; Linux native dependencies are built in-image for the bound architecture and host `node_modules` is never mounted.
- The private-index `git archive` plus source manifest is the only build/runtime source. It excludes unrelated dirty worktree bytes, is descriptor/hash-verified on the host, is mounted read-only at `/verification/source`, and is verified again before payload. The runtime root filesystem and source mount are read-only. Dependency/cache seeds are immutable, content-addressed image layers keyed `seedKey=sha256(imageDigest|platform|nodeVersion|pnpmVersion|lockfileSHA|purpose)`, hash-verified before use, and mounted read-only; the receipt declares that these exact digest-pinned image-layer seeds persist under normal image-retention policy and are never counted as per-attempt mutable resources. Every writable package output, pnpm store, Turbo/build cache, evidence staging, `/tmp`, and service-state mount is a bounded tmpfs or per-attempt overlay named `teameet-v1-verify-<attemptId>-cache-<purpose>` with `overlayKey=sha256(seedKey|attemptId|purpose)`. Overlays are never shared across attempts or concurrent tasks, contain no source/evidence reusable state, and are deleted in exact-name+label cleanup. Cleanup receipts list all deleted overlays and the retained immutable seed digest/persistence decision; concurrent-isolation proof must show distinct overlay keys/names and zero cross-attempt writes.
- Resource names are derived only after strict UUID `attemptId` validation: payload `teameet-v1-verify-<attemptId>-payload`, DB `teameet-v1-verify-<attemptId>-db`, network `teameet-v1-verify-<attemptId>-net`, non-cache volume `teameet-v1-verify-<attemptId>-<purpose>`, and writable cache overlay `teameet-v1-verify-<attemptId>-cache-<purpose>`. Every resource carries immutable labels `com.teameet.verification=1`, `com.teameet.attempt=<attemptId>`, `com.teameet.plan-sha=<planSHA>`, `com.teameet.source-tree=<sourceTreeSHA>`, and `com.teameet.owner=outer`. Container/network create returns an exact ID; named volumes and overlays bind by exact name+labels. The wrapper must re-match those identities before start, stop, or removal. Foreign/missing/mixed labels, IDs, or names abort with no broad cleanup.
- Payloads run as a fixed non-root UID/GID with `--cap-drop=ALL`, `no-new-privileges`, read-only rootfs, private PID/IPC/network namespaces, bounded CPU/memory/PID limits, and no privileged mode, `--pid=host`, `--network=host`, Docker socket/API, device, host home, SSH agent, cloud credentials, or broad bind mount. Twenty immediate marker-clearing double-`setsid` descendants remain in the payload namespace/cgroup and are killed by stop/force-remove; session/PGID/environment changes never alter membership.
- No host port is published by default. DB users address the sibling by the attempt-network alias; the DB is never exposed to a non-loopback interface. V26/F3 allocate only required API/web mappings on `127.0.0.1` with daemon-selected ephemeral ports and bind the host-browser receipt to them. Under `--host-browser-owner`, the host wrapper launches a fresh visible Chromium with a task-owned temporary profile, captures its exact PID/PPID/start identity, and gives the in-container Playwright runner only a generated loopback WebSocket endpoint through the declared `V1_HOST_BROWSER_WS_ENDPOINT`; the runner must connect to that browser and is forbidden to launch another. The profile, endpoint, browser tree, and mappings are removed before Docker cleanup. Fixed ports are test-only explicit inputs; occupied ports reject without touching the owner. A task that does not declare `--db isolated` still uses the exact attempt network for namespace isolation but creates no DB container or DB volume.
- The host wrapper captures payload stdout and stderr to separate attempt files and records the actual container wait/inspect exit code. Timeout or SIGINT/SIGTERM stops the host browser first, sends bounded container stop, force-removes exact container IDs, then exact DB, volumes, and network; a second interruption cannot bypass the cleanup critical section. A durable external cleanup journal supports idempotent `--cleanup-attempt <attemptId>` resume after wrapper crash or daemon recovery. No accepted receipt exists until exact label+ID queries prove zero attempt containers/networks/volumes, published mappings are absent, task temp roots are gone, and host-browser PID/ports returned to baseline.
- Docker unavailable, wrong context/server identity, unhealthy daemon/VM, image digest/platform mismatch, delayed removal, or any Docker API error fails closed before payload or terminal acceptance. Recovery may remove only journaled exact IDs whose labels match; a stale old-plan-SHA resource or receipt is rejected and requires cleanup plus a fresh amended-plan review/attempt. Prompt text/stdout is data only and cannot select Docker arguments, environment, mounts, identities, or cleanup targets.
- Existing harness behavior changes use `PIN → RED → GREEN → SURFACE`: pin the current false-acceptance behavior and old reviewed plan SHA, capture RED against the uncontained/current or first container implementation, implement the smallest containment correction, capture GREEN with the same fixture, then surface receipt/diff/risk evidence. The trusted host-supervisor suite—not V1's hostile payload—owns mandatory real-Docker pairs for create/start/inspect/interrupt/stop/remove/residual handling, daemon identity/unavailable/recovery through its task-owned fault-injection endpoint, delayed cleanup, and stale exact-labeled resources. Its additional pairs cover double-`setsid`×20, misleading success with nonzero exit, hung timeout, cancel/resume and repeated interruption at create/start/migration/payload/browser/receipt-finalize, occupied ports, sibling DB lifecycle, read-only source mutation/archive substitution/native mismatch, immutable-seed/per-attempt-overlay cache isolation, V27 nested registry reuse/forbidden child Docker control, and zero residual resources. Only after that suite emits `APPROVE` may V1 run the contained ledger validator and hostile no-Docker-control probes. The host-headed browser contract separately proves visible V26/F3 route interaction, screenshot/console/network capture, exact PID/port cleanup, and that its PIDs are never claimed as cgroup-contained.


### Exact verification command registry
Task-1 trusted host-supervisor pre-gate runs outside the wrapper under test: `node --test --test-concurrency=1 --test-name-pattern="trusted host supervisor contract" scripts/qa/run-v1-task-verification.contract.test.mjs`. It accepts only the exact V0-execution plan/approval/clean-restart-cursor/override/consumption exports, independently descriptor-verifies the rollback receipt and clean state chain, owns all real Docker lifecycle/fault probes, and emits immutable `V1_HOST_SUPERVISOR_RECEIPT_PATH`/`V1_HOST_SUPERVISOR_RECEIPT_SHA` with `APPROVE` and zero residuals before V1. The narrow Task-1 waiver skips only the two stable absolute gates; the supervisor still aborts on swap growth ≥2 GiB, Node/MCP growth ≥50, load >2× cores, browser, Docker/server/service, foreign-port, misleading-success, timeout/interruption, or cleanup failures.

| ID | Command |
|---|---|
| V1 | Precommit clean restart: `node scripts/qa/run-v1-task-verification.mjs --task 1 --phase clean-restart --plan-sha "$OMO_SELECTED_PLAN_SHA" --baseline-sha 71f67b0d24e272eecd216cebb31eefbd66c9ca02 --restart-head-sha a4823d2f575d9396323421024a81a63dacf0cf67 --predecessor-chain 71f67b0d24e272eecd216cebb31eefbd66c9ca02,a84a6e5277c4d29f9281140dca6a630fb5a2ca15,d444649adaf1ba88c3dddd755f6728135d8476b4,a4823d2f575d9396323421024a81a63dacf0cf67 --candidate-sha null --require-task127-cursor-mode clean-restart-initial --require-task127-cursor-receipt "$V1_TASK127_CURSOR_RECEIPT_PATH" --require-task127-cursor-receipt-sha "$V1_TASK127_CURSOR_RECEIPT_SHA" --require-host-supervisor-receipt "$V1_HOST_SUPERVISOR_RECEIPT_PATH" --require-host-supervisor-receipt-sha "$V1_HOST_SUPERVISOR_RECEIPT_SHA" --hostile-no-docker-control -- node scripts/qa/validate-team-tournament-ledger.mjs .github/tasks/127-v1-team-tournament-operations-game-record.md --verify-clean-restart-cursor-chain --verify-rollback-clean-state --verify-source-manifest --pdf-sha 1558110dc711d421f7c4eea5cd98accc528180e625e1980578f92e1256806d50 --preview-sha 7d8e101ad27a6a227f1a525a729888aa4286845b5a6819aaa034b57cc55ba9f1 --design-commit 71f67b0d24e272eecd216cebb31eefbd66c9ca02 --design-sha 3ee8aedd03c507a7b7540bc9134e52abf49e8210a30d338bca2a899beca0f8a2`. Postcommit independent candidate: `node scripts/qa/run-v1-task-verification.mjs --task 1 --phase candidate --plan-sha "$OMO_SELECTED_PLAN_SHA" --candidate-receipt "$V1_TASK1_CANDIDATE_RECEIPT_PATH" --candidate-receipt-sha "$V1_TASK1_CANDIDATE_RECEIPT_SHA" --require-task127-cursor-mode clean-restart-initial --require-task127-cursor-receipt "$V1_TASK127_CURSOR_RECEIPT_PATH" --require-task127-cursor-receipt-sha "$V1_TASK127_CURSOR_RECEIPT_SHA" --verify-committed-row 1 -- node scripts/qa/validate-team-tournament-ledger.mjs .github/tasks/127-v1-team-tournament-operations-game-record.md --verify-clean-restart-cursor-chain --verify-rollback-clean-state --verify-source-manifest` |
| V2 | `node scripts/qa/run-v1-task-verification.mjs --task 2 -- node scripts/qa/validate-game-record-adrs.mjs .github/tasks/127-v1-team-tournament-operations-game-record.md --strict` |
| V3 | `node scripts/qa/run-v1-task-verification.mjs --task 3 -- node scripts/docs/check-api-contract-tree.mjs docs/api --strict` |
| V4 | `node scripts/qa/run-v1-task-verification.mjs --task 4 --snapshot-owned --package v1_api --db isolated --root-prepare "pnpm v1:db:generate" -- pnpm exec jest --runTestsByPath test/games/game-schema.integration-spec.ts --runInBand` |
| V5 | `node scripts/qa/run-v1-task-verification.mjs --task 5 --package v1_api --db isolated -- pnpm exec jest --runTestsByPath src/jobs/v1-game-operations-worker.service.spec.ts test/jobs/game-operations-control.integration-spec.ts --runInBand` |
| V6 | `node scripts/qa/run-v1-task-verification.mjs --task 6 --package v1_api --db isolated -- pnpm exec jest --runTestsByPath src/games/games.service.spec.ts test/games/game-lifecycle.integration-spec.ts --runInBand` |
| V7 | `node scripts/qa/run-v1-task-verification.mjs --task 7 --package v1_api --db isolated -- pnpm exec jest --runTestsByPath test/games/tournament-staff-auth.integration-spec.ts --runInBand` |
| V8 | `node scripts/qa/run-v1-task-verification.mjs --task 8 --package v1_api --db isolated -- pnpm exec jest --runTestsByPath test/games/game-realtime.integration-spec.ts --runInBand` |
| V9 | `node scripts/qa/run-v1-task-verification.mjs --task 9 --package v1_api --db isolated -- pnpm exec jest --runTestsByPath test/games/game-projection.integration-spec.ts --runInBand` |
| V10 | `node scripts/qa/run-v1-task-verification.mjs --task 10 --package v1_api --db isolated -- pnpm exec jest --runTestsByPath test/games/game-backfill.integration-spec.ts --runInBand` |
| V11 | `node scripts/qa/run-v1-task-verification.mjs --task 11 --snapshot-owned --package v1_api --db isolated --root-prepare "pnpm v1:db:generate" -- pnpm exec jest --runTestsByPath test/tournaments/competition-config.integration-spec.ts --runInBand` |
| V12 | `node scripts/qa/run-v1-task-verification.mjs --task 12 --package v1_api --db isolated -- pnpm exec jest --runTestsByPath test/teams/team-schedules.integration-spec.ts --runInBand` |
| V13 | `node scripts/qa/run-v1-task-verification.mjs --task 13 --package v1_web -- pnpm exec vitest run 'src/app/teams/[id]/schedules/team-schedules.test.tsx' src/app/my/schedule/my-schedule.test.tsx --maxWorkers=1` |
| V14 | `node scripts/qa/run-v1-task-verification.mjs --task 14 --package v1_api --db isolated -- pnpm exec jest --runTestsByPath test/games/game-lineups.integration-spec.ts --runInBand` |
| V15 | `node scripts/qa/run-v1-task-verification.mjs --task 15 --package v1_web -- pnpm exec vitest run 'src/app/team-matches/[id]/lineup/lineup.test.tsx' --maxWorkers=1` |
| V16 | `node scripts/qa/run-v1-task-verification.mjs --task 16 --package v1_api --db isolated -- pnpm exec jest --runTestsByPath test/games/team-result-approval.integration-spec.ts --runInBand` |
| V17 | `node scripts/qa/run-v1-task-verification.mjs --task 17 --package v1_web -- pnpm exec vitest run 'src/app/team-matches/[id]/result/result-flow.test.tsx' --maxWorkers=1` |
| V18 | `node scripts/qa/run-v1-task-verification.mjs --task 18 --package v1_api --db isolated -- pnpm exec jest --runTestsByPath test/tournaments/tournament-operations-board.integration-spec.ts --runInBand` |
| V19 | `node scripts/qa/run-v1-task-verification.mjs --task 19 --package v1_web -- pnpm exec vitest run src/app/tournament-ops/tournament-ops-shell.test.tsx --maxWorkers=1` |
| V20 | `node scripts/qa/run-v1-task-verification.mjs --task 20 --package v1_api --db isolated -- pnpm exec jest --runTestsByPath test/games/live-game-commands.integration-spec.ts --runInBand` |
| V21 | `node scripts/qa/run-v1-task-verification.mjs --task 21 --package v1_web -- pnpm exec vitest run src/app/tournament-ops/live-console.test.tsx --maxWorkers=1` |
| V22 | `node scripts/qa/run-v1-task-verification.mjs --task 22 --package v1_api --db isolated -- pnpm exec jest --runTestsByPath test/tournaments/tournament-officialize.integration-spec.ts --runInBand` |
| V23 | `node scripts/qa/run-v1-task-verification.mjs --task 23 --package v1_web -- pnpm exec vitest run src/app/tournament-ops/result-review.test.tsx --maxWorkers=1` |
| V24 | `node scripts/qa/run-v1-task-verification.mjs --task 24 --db isolated --sequence "pnpm --filter v1_api exec jest --runTestsByPath test/games/public-records-privacy.integration-spec.ts --runInBand" "pnpm --filter v1_web exec vitest run src/app/public-game-records.test.tsx --maxWorkers=1"` |
| V25 | `node scripts/qa/run-v1-task-verification.mjs --task 25 --package v1_api --db isolated --sequence "pnpm exec jest --runTestsByPath test/games/game-cutover.integration-spec.ts --runInBand" "node ../../scripts/qa/verify-game-result-cutover.mjs --phase local-precleanup --assert-injected-mismatch-blocks-and-recovers"` |
| V26 | `node scripts/qa/run-v1-task-verification.mjs --task 26 --db isolated --browser headed --host-browser-owner --lifecycle-owner outer -- pnpm exec playwright test --config=e2e/v1.config.ts e2e/v1-tests/team-tournament-operations.spec.ts --workers=1` |
| V27 | `node scripts/qa/run-v1-task-verification.mjs --task 27 --adopt-candidate-attempt --db isolated --lifecycle-owner outer --candidate-receipt "$V1_CANDIDATE_RECEIPT_PATH" --candidate-receipt-sha "$V1_CANDIDATE_RECEIPT_SHA" -- node scripts/qa/run-v1-release-candidate.mjs --phase local-precleanup --registry V1-V26 --registry-mode inherited-child --fixtures 100 --games 20 --event-rate 2 --duration 15m --disconnect 5m --inject-failure-cases --builds v1_api,v1_web` |
### Frozen operational decision table
| Decision | Literal behavior | Edge/failure contract |
|---|---|---|
| D-01 | SLA starts at `submittedAt` of each host result revision; at +24h UTC enqueue one `RESULT_REVIEW_REMINDER`; at +48h enqueue one `RESULT_REVIEW_ESCALATION` to the durable platform-operations queue. | A superseding host revision cancels prior pending jobs and starts a new SLA; approve/change-request/cancel closes both jobs. Idempotency key is `resultRevisionId:eventType`; no automatic approval. |
| D-02 | `publicLineupAt = scheduledKickoffAt - 60m`; public payload omits participant identity before that instant. | Reschedule before publication recomputes the instant; once published it is never re-hidden solely because kickoff moved later; cancellation hides the lineup; server UTC is authoritative. |
| D-03 | Linked user + valid consent contributes to team and personal projections; unlinked guest contributes only team aggregates plus immutable display snapshot. | Later linking never retroactively creates personal history before the link effective time; unlinking stops future personal projection and follows the consent table below. |
| D-04 | Canonical actor enum is `public`, `authenticated_user`, `member`, `team_manager`, `team_owner`, `opponent_manager`, `platform_ops` (existing Admin OWNER/OPS mapped at the boundary), `tournament_director`, `field_operator`, `support_readonly`; tournament staff are scoped assignments, never global Admin. | `authenticated_user` is a signed-in non-member and may submit one guest application as self, but gains no team/staff authority. Missing, expired, revoked, cross-tournament, cross-field, or cross-fixture assignment returns `403 STAFF_SCOPE_DENIED`; revoke evicts realtime subscription immediately. |
| D-05 | Starting a correction creates a new content-immutable superseding `DRAFT` with reason, actor, and before/after reference; later correction officialization atomically moves that revision to `OFFICIAL`, swaps the current pointer, and writes outbox in one transaction. | The prior official remains authoritative until successful officialization. Update/delete of an official or other terminal revision returns `409 OFFICIAL_REVISION_IMMUTABLE`; correction conflict returns `409 REVISION_VERSION_CONFLICT`. |
| D-06 | Visibility is one enum, not composable flags: `hidden`, `status_only`, `live`, `official_only`. Default tournament value is `live`; public-live rollout flag can only demote `live` to `status_only`. | Precedence is `hidden` absolute deny; `official_only` exposes only official results; `status_only` exposes lifecycle/score status without lineup/events; `live` exposes policy-eligible lineup/score/events. |
| D-07 | Tournament config sets `scorerPolicy=required|optional`; ordinary team matches default `optional_with_warning`. | `required` blocks event append, result submit, and officialize with `422 SCORER_REQUIRED`; `optional_with_warning` permits submit/officialize and persists `missingScorer=true`. |
| D-08 | MVP cardinality is 0 or 1 per official revision and the participant must belong to that game. | More than one or foreign participant returns `422 MVP_INVALID`; correction supersedes the prior MVP without mutating history. |
| D-09 | Football/futsal preset v1 order is points → goal difference → goals for → head-to-head points → head-to-head goal difference → fair-play points → deterministic seeded draw. Tournament stores `competitionConfigVersionId`. | Used versions are immutable; a requested change creates a new version, previews affected standings/fixtures, and takes effect only after explicit `platform_ops` confirmation; otherwise `409 CONFIG_VERSION_IN_USE`. |
| D-10 | Only `append_event` commands may enter the offline queue; start/pause/resume/end/officialize require online server acknowledgement. | Queued event keeps `clientEventId`, expected sequence/version, captured server-offset estimate, and payload hash; unsupported offline action returns `409 ONLINE_ACK_REQUIRED`. |
| D-11 | Public identity is consent-eligible `displayName` snapshot only; roster `realName`, birth data, gender, and phone remain operations-only. | Public DTO/HTML/metadata/log containing restricted fields fails privacy validation; support sees display snapshot, not roster PII. |
| D-12 | This plan ships new writes plus measured local comparator and retains compatibility readers. A separate authorized rollout deploys the exact pre-cleanup SHA, collects 7 R1 + 7 R2 full-population zero-mismatch receipts, then removes readers in a new no-schema/no-data-contraction R3 cleanup commit. | This plan never claims deployed evidence or deletes compatibility readers. Any deployed mismatch blocks cleanup; post-alpha cleanup is reverified from scratch and may be reverted as a code-only commit. |

### Frozen REST and idempotency contract
All responses use `{status,data,timestamp}`. Collection reads use `limit` (default 20, max 100), opaque `cursor`, and `{items,nextCursor}`. All authenticated mutations carry `Idempotency-Key`; all versioned mutations carry `expectedVersion`. Canonical scope is `(actorUserId, action, resourceType, resourceId, idempotencyKey)`, retained 30 days. Same key + same SHA-256 payload replays the original status/body; same key + different payload returns `409 IDEMPOTENCY_PAYLOAD_CONFLICT`. For game commands, `clientCommandId` is required to equal the normalized `Idempotency-Key`; the same value is persisted atomically in `V1IdempotencyRecord`, so changing only the header or only the body returns `422 COMMAND_IDEMPOTENCY_KEY_MISMATCH`, and reusing the value with a different payload returns the canonical 409. Stale version returns `409 VERSION_CONFLICT`; validation `422`; missing resource `404`; unauthenticated `401`; authorization `403`.

| Method/path | Request → response fields | Authorized actor/action |
|---|---|---|
| `GET/POST /api/v1/teams/:teamId/schedules` | filters or `{title,type,startAt,endAt,timezone,capacity,rsvpDeadlineAt,visibility,teamMatchId?,version}` → schedule summary/detail | member read; team_manager/team_owner create |
| `GET/PATCH /api/v1/teams/:teamId/schedules/:scheduleId` | read or `{expectedVersion,title?,startAt?,endAt?,capacity?,rsvpDeadlineAt?,visibility?}` → versioned schedule/history | member read; team_manager/team_owner mutate |
| `POST /api/v1/teams/:teamId/schedules/:scheduleId/cancel` | `{expectedVersion,cancelReason}` → `{state:"cancelled",version,cancelledAt}` | team_manager/team_owner; closes reminders/recruitment, never deletes |
| `PUT /api/v1/teams/:teamId/schedules/:scheduleId/attendance/me` | `{status:attending|not_attending|undecided,expectedVersion}` → attendance counts/waitlist position | member self |
| `POST /api/v1/teams/:teamId/schedules/:scheduleId/reminders` | `{kind}` → durable job ID/status | team_manager/team_owner |
| `GET/POST/PATCH /api/v1/teams/:teamId/schedules/:scheduleId/guest-recruitment` | read; create/update `{expectedVersion,slots,closesAt,note,visibility,state:open|closed}` → recruitment/version/applicant count | member read if permitted; team_manager/team_owner mutate |
| `POST /api/v1/teams/:teamId/schedules/:scheduleId/guest-recruitment/applications` | `{displayName,note}` → application ID/state with `userId` derived only from the authenticated actor | authenticated user; caller-supplied userId is forbidden by DTO whitelist; duplicate returns idempotent original |
| `GET /api/v1/me/schedule` | `{cursor,from,to,status}` → permitted schedule summaries | authenticated member |
| `GET /api/v1/team-matches/:teamMatchId/lineup` | no body → lineup/version/state/publicLineupAt | scoped team actors read |
| `PUT /api/v1/team-matches/:teamMatchId/lineup` | `{expectedVersion,formation,starters,bench}` → saved draft/version | team_manager/team_owner |
| `POST /api/v1/team-matches/:teamMatchId/lineup/submit` | `{expectedVersion}` → submitted lineup/version/publicLineupAt | team_manager/team_owner |
| `POST /api/v1/team-matches/:teamMatchId/lineup/change-request` | `{expectedVersion,reason}` → change-requested lineup/version | opponent_manager before lock; audited |
| `GET /api/v1/games/:gameId` | no body → game, sides, periods, lifecycle, currentVersion, lastSequence, current official/draft refs | resource-scoped actor |
| `POST /api/v1/games/:gameId/commands/:command` | `{expectedVersion,clientCommandId,takeoverToken,occurredAt,payload}` where command is `start|pause|resume|end` and `clientCommandId` must equal `Idempotency-Key` → committed version/state | tournament fixtures: assigned field_operator, assigned tournament_director, or platform_ops with a valid exclusive token; team matches: no generic command surface, because validated team result submission owns the end transition |
| `POST /api/v1/games/:gameId/cancel` | `{expectedVersion,reason}` → cancelled game/version and hidden public projection | team_owner/team_manager for team match; tournament_director/platform_ops for tournament; cancels lineup publication, result SLA, and pending fixture jobs |
| `GET/POST /api/v1/games/:gameId/events` | `afterSequence` or `{expectedVersion,clientEventId,takeoverToken,type,sideId,participantId?,period,clockMs,occurredAt,payload}` → ordered events/ack sequence | scoped reader; assigned field_operator, assigned tournament_director, or platform_ops append with valid token |
| `POST /api/v1/games/:gameId/events/:eventId/reverse` | `{expectedVersion,clientEventId,takeoverToken,reason}` → one append-only compensating event `{reversalSequence,version}` | assigned tournament_director/platform_ops; a corrected replacement is a separate normal append with its own clientEventId/payloadHash/ack |
| `GET/POST /api/v1/games/:gameId/result-revisions` | GET reads history; POST `{expectedVersion,score,actualParticipants,eventsHash,mvpParticipantId?,reason?}` creates a content-immutable team-match draft only | scoped actors read; team_manager/team_owner POST for team match; tournament POST returns `409 TOURNAMENT_RESULT_DERIVED_ONLY` because normal `end` derives+submits, zero-revision drift uses recovery, and corrections use `/corrections` |
| `POST /api/v1/games/:gameId/result-revisions/:revisionId/submit` | `{expectedVersion}` → submitted revision/SLA timestamps; for a team-match source only, the same transaction validates authority/result and moves `SCHEDULED|LIVE|PAUSED→ENDED` before submission | owning team_manager/team_owner |
| `POST /api/v1/games/:gameId/result-recovery/derive-and-submit` | `{expectedVersion,takeoverToken,eventsHash,reason}` → atomically derived submitted revision/review timestamps | assigned tournament_director or platform_ops; only when game is `ENDED` and has no result revision, otherwise `409 RESULT_RECOVERY_NOT_REQUIRED` |
| `POST /api/v1/games/:gameId/result-revisions/:revisionId/decision` | `{expectedVersion,decision:approve|change_request,reason?}` → official/pending state | opponent_manager for team match |
| `POST /api/v1/games/:gameId/result-revisions/:revisionId/review-decision` | `{expectedVersion,decision:reject|request_supplement,reason}` → rejected/supplement-requested state and audit | tournament_director/platform_ops; closes or restarts the applicable review SLA |
| `POST /api/v1/games/:gameId/result-revisions/:revisionId/supersede-and-submit` | `{expectedVersion,score,actualParticipants,eventsHash,mvpParticipantId?,reason}` → atomically creates a content-immutable superseding revision, moves it `DRAFT→SUBMITTED`, and starts a fresh review SLA | tournament_director/platform_ops; base must be `REJECTED|SUPPLEMENT_REQUESTED`, otherwise `409 RESULT_RESUBMISSION_NOT_ALLOWED` |
| `POST /api/v1/games/:gameId/result-revisions/:revisionId/officialize` | `{expectedVersion,projectionPreviewHash}` → official revision/outbox watermark | platform_ops; tournament_director only when audited flag enabled |
| `POST /api/v1/games/:gameId/result-revisions/:revisionId/void` | `{expectedVersion,reason}` → append-only void revision/current pointer/outbox watermark | platform_ops; audited tournament_director only when flag enabled |
| `POST /api/v1/games/:gameId/corrections` | `{expectedVersion,baseRevisionId,reason,changes}` → superseding draft revision | platform_ops/tournament_director |
| `POST /api/v1/games/:gameId/participants/:participantId/identity-link-requests` | `{expectedVersion}` → `{requestId,state:"pending_attestation",version,effectiveAt,expiresAt}` | authenticated user is server-derived; database transaction time is `effectiveAt`, expiry is database `effectiveAt+24h`; caller identity/time fields are forbidden |
| `POST /api/v1/games/:gameId/participants/:participantId/identity-link-requests/:requestId/attest` | `{expectedVersion,decision:approve|reject,reason}` → append-only attestation event and active/rejected link state | owning team_owner or platform_ops; cannot self-attest; expired/race-lost request returns `409 IDENTITY_LINK_REQUEST_EXPIRED` |
| `POST /api/v1/games/:gameId/participants/:participantId/identity-links/:linkId/revoke` | `{expectedVersion,reason}` → append-only revoke event/version with database-derived `effectiveAt` and ≤5s public purge watermark | linked user or platform_ops |
| `POST /api/v1/games/:gameId/participants/:participantId/consents/grant` | `{expectedVersion,linkId,policyHash}` → append-only granted consent version with database-derived `effectiveAt` | actively linked user only |
| `POST /api/v1/games/:gameId/participants/:participantId/consents/revoke` | `{expectedVersion,reason}` → append-only revoked consent version with database-derived `effectiveAt` and ≤5s purge watermark | linked user or platform_ops for legal removal |
| `GET/POST /api/v1/tournament-ops/tournaments/:tournamentId/staff` | list or `{userId,role,fieldId?,fixtureIds?,expiresAt}` → assignment/version/audit | platform_ops; tournament_director may manage field_operator/support_readonly |
| `POST /api/v1/tournament-ops/tournaments/:tournamentId/staff/:assignmentId/revoke` | `{expectedVersion,reason}` → revoked assignment/version/audit/realtime eviction | platform_ops; owning tournament_director for subordinate roles |
| `GET/POST /api/v1/tournament-ops/tournaments/:tournamentId/fields` and `PATCH /api/v1/tournament-ops/tournaments/:tournamentId/fields/:fieldId` | list or `{scopeKey,name,sortOrder}` / `{expectedVersion,name?,sortOrder?,active?}` → stable field/version | platform_ops; tournament_director read |
| `GET/PUT /api/v1/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/lineup` and `POST .../lineup/submit` | read; `{expectedVersion,sideId,formation,starters,bench}`; `{expectedVersion,takeoverToken}` → fixture lineup/version/state | assigned tournament_director save/submit; assigned field_operator may capture actual participants after start |
| `POST /api/v1/tournament-ops/jobs/:jobId/requeue` | `{expectedVersion,reason}` → `{status:"RETRY",attempts:0,retryGeneration,availableAt,version}` | platform_ops only; atomically requires `POISONED`, increments retryGeneration/version, resets attempts to 0, clears lease/lastError, audits `JOB_REQUEUED`; otherwise `409 JOB_NOT_POISONED` |
| `GET/PATCH /api/v1/tournament-ops/operation-flags/:key` | read or `{expectedVersion,value,gateBundlePath,gateBundleHash,reason}` → flag/value/version/audit | platform_ops; descriptor-verifies the attempt-bound bundle then applies frozen CAS transition |
| `POST /api/v1/tournament-ops/operation-flags/tuple-transition` | `{expectedVersions:{GAME_WRITE,GAME_READ,PUBLIC_LIVE?,DIRECTOR_OFFICIALIZE?},transitions:[{key,from,to}],gateBundlePath,gateBundleHash,reason}` → atomically updated tuple with each changed flag version incremented once | platform_ops only; locks keys in lexical order plus `V1GameCutoverEpoch`, descriptor-verifies one tuple gate, and rolls back all flag/audit/outbox writes if any expected value/version or latch check fails |
| `GET/POST /api/v1/tournament-ops/competition-configs` and `GET/POST /api/v1/tournament-ops/competition-configs/:id/versions` | filters or `{sportCode,name,periods,events,lineup,result,tieBreak,visibility}` → immutable version/contentHash | platform_ops read/create; tournament_director read |
| `POST /api/v1/tournament-ops/tournaments/:id/competition-config` | `{expectedVersion,competitionConfigVersionId,previewHash,confirmRecalculation}` → pinned version/impact | platform_ops; returns `409 CONFIG_RECALCULATION_CONFIRMATION_REQUIRED` without matching preview confirmation |
| `GET /api/v1/tournament-ops/tournaments/:tournamentId/operations` | `{cursor,status,fieldId,warning}` → incremental fixture snapshot + watermark | assigned tournament staff |
| `GET /api/v1/tournament-ops/tournaments/:tournamentId/escalations`; `GET .../:escalationId`; `POST .../:escalationId/ack`; `POST .../:escalationId/resolve` | `status` filter; detail; `{expectedVersion,reason}` → durable queue state/audit | current `support_readonly`/`tournament_director` reviewers list/detail/ack only due `REMINDER`; `platform_ops` list/detail/ack/resolve only due `ESCALATION`; wrong tournament, queue kind, future-due row, or ID is `404 RESULT_ESCALATION_NOT_FOUND` |
| `GET /api/v1/tournaments/:id/schedule` and `GET /api/v1/tournaments/:id/matches/:fixtureId` | cursor/filter → visibility-filtered public projection | public |
| `GET /api/v1/teams/:id/records` and `GET /api/v1/users/:id/records` | cursor/season → official, consent-filtered records | public |

State transitions are literal: schedule `scheduled→cancelled|completed` only; lineup `draft→submitted→locked`, `submitted→change_requested→draft`, and any new submission supersedes rather than mutates; tournament-fixture game commands permit exactly `SCHEDULED→LIVE`, `LIVE→PAUSED`, `PAUSED→LIVE`, `LIVE|PAUSED→ENDED`, and `SCHEDULED|LIVE|PAUSED→CANCELLED`; team-match result submission alone additionally permits `SCHEDULED|LIVE|PAUSED→ENDED` in the same transaction as the validated submission; no transition leaves `ENDED|CANCELLED`. Team result revision state is `draft→submitted→official|change_requested`, `change_requested→superseding draft`; tournament review is `draft→submitted→rejected|supplement_requested|official`, and `rejected|supplement_requested→atomically created superseding draft→submitted`; official correction is `official→superseding correction draft→official|void`. Cancellation/void/reject/supplement/reverse always require reason, expected version, idempotency key, actor audit, transactional outbox, and named visibility/SLA cleanup. Invalid transitions return `409 INVALID_STATE_TRANSITION`. Team-match result submit is team_owner/team_manager, decision is opponent_manager, and tournament officialize/void is platform_ops or audited flag-enabled tournament_director.

Review and compensation effects are exact:
- Tournament `end` atomically commits the ended state, derives one draft from the event stream, immediately moves it to `submitted`, and writes `game:<gameId>:revision:<revision>:submitted`; failure rolls back all three, so normal operation never leaves a draft-only result. The game-level `result-recovery/derive-and-submit` route exists only for pre-existing or manually repaired `ENDED` data with zero revision rows; it derives and submits in one transaction and never accepts a nonexistent revision ID.
- `reject` is terminal `REJECTED`: cancel all pending reminder/escalation jobs for that revision, expose no public numeric result, leave `currentOfficialRevisionId` unchanged/null, and write business key `game:<gameId>:revision:<revision>:rejected`. A new result is possible only through `supersede-and-submit`, which creates a new draft and submits it atomically so no unreachable draft remains.
- `request_supplement` enters terminal `SUPPLEMENT_REQUESTED`: cancel current review jobs; `supersede-and-submit` creates and submits the successor atomically with a fresh `submittedAt` and new 24h/48h jobs; write `game:<gameId>:revision:<revision>:supplement-requested`.
- `void` creates an immutable `VOID` superseding revision and makes it the current official pointer. Its outbox key `game:<gameId>:revision:<voidRevision>:voided` transactionally removes the prior numeric score/events/participant records from public output, compensates team/player/standings aggregates, and recalculates affected next fixtures; a locked downstream fixture returns `409 NEXT_FIXTURE_CONFLICT` before pointer swap.
- Event reversal appends exactly one event whose unique non-null `reversesEventId` points to the target and whose business key is `game:<gameId>:event:<reversalSequence>`; a target may be reversed once. Any replacement is a separate append and therefore receives a separate sequence/ack.

### Public visibility output matrix
| Mode | Bracket/status | Lineup | Score | Events | Records |
|---|---|---|---|---|---|
| `hidden` | hidden | hidden | hidden | hidden | hidden |
| `status_only` | lifecycle only | hidden | status without numeric score | hidden | official historical records only |
| `live` | visible | after authoritative `lineupAt` | live numeric | live consent-filtered | official records plus pending-projection marker |
| `official_only` | visible | official snapshot only | official numeric only | official event summary only | official records only |

### Frozen realtime contract
- Namespace `/game-operations`; authenticated handshake includes access token, stable `clientInstanceId`, and authorization-subject version. Client events: `game.subscribe {gameId,afterSequence}`, `game.unsubscribe {gameId}`, `game.event.append {gameId,expectedVersion,clientEventId,takeoverToken,payloadHash,event}`, and `game.event.retry {gameId,rebasedExpectedVersion,clientEventId,takeoverToken,payloadHash,event}`. Retry requires byte-identical `clientEventId`, `payloadHash`, and event payload, but the authorization token/version may be freshly reacquired.
- Server events: `game.snapshot {gameId,version,lastSequence,state,sides,period,currentScore,events}`, `game.event.ack {clientEventId,sequence,version,status}`, `game.event.committed {gameId,sequence,version,event}`, `game.gap {expectedSequence,availableFrom}`, `game.permission.revoked {gameId,assignmentVersion}`, and `game.error {code,clientEventId?,expectedVersion?,lastSequence?}`.
- Time synchronization uses client `game.time.ping {clientSentAt}` and server `game.time.pong {clientSentAt,serverReceivedAt,serverSentAt}`; UI uses median offset of the latest five samples and server rejects `occurredAt` drift over 30s with `422 CLOCK_DRIFT`.
- Takeover uses `game.takeover.request {gameId,authorizationSubjectVersion,clientInstanceId,lastSequence}` and server `game.takeover.granted {gameId,takeoverToken,version,lastSequence,expiresAt}`. The authorization subject is exactly `assignment:<assignmentId>@<assignmentVersion>` for scoped staff or `platform_ops:<userId>@<adminGrantVersion>` for direct platform operations. A token is an opaque 256-bit value bound to `(gameId,authorizationSubject,clientInstanceId)`, lasts 90 seconds, and may be renewed at most every 30 seconds by `game.takeover.renew {gameId,takeoverToken,clientInstanceId}` while that subject remains valid. Grant/renew atomically expires the prior token; every exclusive REST command and socket append/retry carries one. Expired, replaced, wrong-client, wrong-subject, or revoked tokens return `403 TAKEOVER_TOKEN_EXPIRED`.
- After an offline period or token expiry, the client first backfills, reacquires a token, and sends `game.event.retry` with the original clientEventId/payload hash plus `rebasedExpectedVersion=backfill.version`. The server replays an existing identical ID; for an unseen ID it appends only if the immutable event still passes period/clock/participant rules at the rebased version, otherwise returns `409 OFFLINE_EVENT_REBASE_CONFLICT` without mutation. Token bytes are excluded from the idempotency payload hash.
- Sequence is a database-assigned monotonic integer per game; `occurredAt` is domain time, `receivedAt` is authoritative server time. Backfill `GET /api/v1/games/:gameId/events?afterSequence=N` returns ascending committed events and `lastSequence`. A reconnect first backfills, then subscribes from returned `lastSequence`; duplicate client IDs replay the ack; conflicting payload hash returns `409 IDEMPOTENCY_PAYLOAD_CONFLICT`.

### Canonical actor-action matrix
| Actor | Team schedule/lineup/result | Tournament operate | Officialize/correct | Staff/escalation | Public |
|---|---|---|---|---|---|
| `public` | permitted public reads only | none | none | none | visibility-filtered read |
| `authenticated_user` | self guest application only; no member read | none | none | none | read |
| `member` | own RSVP and permitted reads | none | none | none | read |
| `team_manager`/`team_owner` | manage own schedule/lineup/result submission | none unless separate staff assignment | none | none | read |
| `opponent_manager` | request opponent lineup change before lock; approve/change-request opponent result | none | approve/change-request team result only | none | read |
| `field_operator` | none | assigned fixture/field commands and event input | none | own warnings read | read |
| `support_readonly` | none | assigned board read | none | list/detail/ack due `REMINDER`, never resolve | read |
| `tournament_director` | none | assigned tournament/field operations | correction plus flag-gated officialize/void | manage subordinate staff; list/detail/ack due `REMINDER`, never resolve | read |
| `platform_ops` | audit/read | all tournaments | officialize/correct/void | bootstrap director/revoke; list/detail/ack/resolve due `ESCALATION` | read |

### Frozen additive schema ledger
Every new table uses UUID `id`, `createdAt`, `updatedAt` unless declared append-only; timestamps are UTC `DateTime(3)`. Foreign keys use `Restrict` for immutable history and `Cascade` only for non-official drafts/jobs.

| Model | Required fields, relations, constraints/indexes |
|---|---|
| `V1Game` | `sourceType TEAM_MATCH|TOURNAMENT_FIXTURE`, nullable unique `teamMatchId`/`tournamentFixtureId`, `state SCHEDULED|LIVE|PAUSED|ENDED|CANCELLED`, `version Int @default(0)`, `lastSequence Int @default(0)`, `currentOfficialRevisionId?`, required `competitionConfigVersionId`; `V1GameVisibilityPolicy.gameId` is the sole one-to-one FK. Raw migration adds `CHECK ((source_type='TEAM_MATCH' AND team_match_id IS NOT NULL AND tournament_fixture_id IS NULL) OR (source_type='TOURNAMENT_FIXTURE' AND tournament_fixture_id IS NOT NULL AND team_match_id IS NULL))`, unique `(id,currentOfficialRevisionId)` support, and a composite/deferred FK from `(id,currentOfficialRevisionId)` to revision `(gameId,id)`, so a cross-game current pointer cannot commit; indexes `(state,updatedAt)` and `(sourceType,createdAt)`. Todo 11 adds/backfills required immutable `competitionConfigVersionId` pins on both existing/new `V1Tournament` and `V1TeamMatch`; Game copies its source pin at creation. TeamMatch preset selection is persisted from its sportCode (`FOOTBALL→football-v1`, `FUTSAL→futsal-v1`) and unsupported/missing sport returns `409 COMPETITION_CONFIG_REQUIRED`. |
| `V1GameSide` | `gameId`, `sideKey HOME|AWAY`, `teamId?`, immutable `displayNameSnapshot`; unique `(gameId,sideKey)`. |
| `V1GamePeriod` | `gameId`, `number`, `state`, `startedAt?`, `endedAt?`; unique `(gameId,number)`. |
| `V1GameLineup` | `gameId`, `sideId`, `revision Int`, `state`, `version`, `submittedAt?`, `supersedesId?`; unique `(gameId,sideId,revision)`. Public time is derived only from `V1GameVisibilityPolicy.lineupAt`. |
| `V1GameParticipant` | `gameId`, `sideId`, `lineupId`, `displayNameSnapshot`, `jerseyNumber?`, `position?`; immutable after first official revision; index `(gameId,sideId)`. It never changes identity linkage in place. |
| `V1ParticipantIdentityLinkEvent` | append-only `participantId`, `linkId`, `eventVersion`, `requestId`, `action REQUESTED|ATTESTED|REJECTED|EXPIRED|REVOKED`, `userId`, database-derived `effectiveAt`, `actorType USER|SYSTEM`, `actorUserId?`, `systemActor?`, `reason?`; exact actor correlation check; allowed system actor is `IDENTITY_LINK_EXPIRY`; unique `(participantId,eventVersion)`, `(requestId,action,COALESCE(actorUserId,systemActor))`, one terminal `REJECTED|EXPIRED` per request, and one `REVOKED` per linkId. A serializable trigger/state function permits ATTESTED only after a different user's pending, unexpired request, permits one active link per participant, and permits a new request after reject/expire/revoke. REQUESTED/REVOKED use transaction `database_now()`; a due job appends EXPIRED at the stored request time +24h; attestation/expiry lock the request and exactly one wins. No row is updated to close an interval and caller time is never trusted. |
| `V1ParticipantIdentityLinkCurrent` | derived mutable authority `participantId @unique`, `linkId @unique`, `userId`, `version`, `effectiveFrom`; updated in the same transaction as ATTESTED/REVOKED events and deleted on revoke. Public projection derives intervals from event order; it never mutates history. |
| `V1ParticipantConsentSnapshot` | append-only `participantId`, `linkId`, `consentVersion`, `state GRANTED|REVOKED`, database-derived `effectiveAt`, `policyHash`, `actorUserId`; unique `(participantId,consentVersion)`, index `(participantId,effectiveAt)`; DB trigger requires `linkId` to be active for the same user at grant time and assigns transaction `database_now()`, rejecting any caller-supplied timestamp. |
| `V1GameEvent` | append-only `gameId`, `sequence`, `clientEventId`, `payloadHash`, `type`, `sideId?`, `participantId?`, `period`, `clockMs`, `occurredAt`, `receivedAt`, `actorUserId`, `reversesEventId? @unique`, JSON `payload`; unique `(gameId,sequence)` and `(gameId,clientEventId)`; check prevents self-reversal and trigger requires same game. |
| `V1GameResultRevision` | content-append-only `gameId`, `revision`, `state DRAFT|SUBMITTED|CHANGE_REQUESTED|SUPPLEMENT_REQUESTED|REJECTED|OFFICIAL|VOID`, JSON `score`, `eventsHash`, `missingScorer Boolean`, sole MVP authority `mvpParticipantId?`, `reason?`, `createdByActorType USER|SYSTEM`, `createdByUserId?`, `createdBySystemActor?`, `supersedesId?`, `submittedAt?`, `officialAt?`; unique `(gameId,revision)` and `(gameId,id)`; composite/deferred FK `(gameId,supersedesId)→(gameId,id)` forbids cross-game supersession; exact actor correlation check mirrors `V1OperationAudit`; allowed system actors are `GAME_END_DERIVER`, `GAME_BACKFILL`, and `PROJECTION_REPAIR`; FK/trigger requires MVP participant to belong to the same game and revision participant set. Only `state/submittedAt/officialAt` may update, `DRAFT→SUBMITTED` freezes all content, and terminal `CHANGE_REQUESTED|SUPPLEMENT_REQUESTED|REJECTED|OFFICIAL|VOID` rows reject every UPDATE/DELETE. |
| `V1GameResultParticipant` | `resultRevisionId`, `participantId`, `sideId`, `started`, `minutesPlayed?`, `goals`, `cards`, `goalkeeper`; unique `(resultRevisionId,participantId)`; INSERT/UPDATE/DELETE is allowed only while the locked parent is `DRAFT`, and every row becomes immutable when the parent first enters `SUBMITTED` or any terminal state; no duplicate MVP field. |
| `V1GameResultDecision` | append-only `revisionId`, `decision`, `reason?`, `actorType`, `actorUserId`, `createdAt`; unique `(revisionId,actorUserId,decision)`. |
| `V1GameVisibilityPolicy` | `gameId @unique`, `mode`, `lineupAt?`, `version`; no per-game public-live boolean. `PUBLIC_LIVE` is the sole rollout authority and may only demote policy `live` output to `status_only`. |
| `V1OutboxEvent` | `businessKey` non-null, `aggregateType`, `aggregateId`, `revisionId?`, `type`, JSON `payload`, `availableAt`, `leaseOwner?`, `leaseUntil?`, `attempts`, `retryGeneration @default(0)`, `version @default(0)`, `status`, `lastError?`; unique `(businessKey)`, indexes `(status,availableAt)` and `(leaseUntil)`; every claim/renew/complete/poison/requeue is an owner+expectedVersion CAS that increments version. |
| `V1IdempotencyRecord` | `actorUserId`, `action`, `resourceType`, `resourceId`, `idempotencyKey`, `payloadHash`, `responseStatus`, JSON `responseBody`, `expiresAt`; unique `(actorUserId,action,resourceType,resourceId,idempotencyKey)`, index `(expiresAt)`; immutable until expiry cleanup. |
| `V1ProjectionWatermark` | `projection`, `entityType`, `entityId`, `revisionId`, `sourceHash`, `projectedAt`, `status`; unique `(projection,entityType,entityId)`. |
| `V1TeamSchedule` | `teamId`, `teamMatchId?`, `title`, `type`, `startAt`, `endAt`, `timezone`, `capacity?`, `rsvpDeadlineAt?`, `visibility`, `state`, `version`, `cancelReason?`; indexes `(teamId,startAt)` and `(teamMatchId)`. |
| `V1ScheduleAttendance` | `scheduleId`, `userId`, `status`, `waitlistPosition?`, `version`; unique `(scheduleId,userId)`. |
| `V1ScheduleGuestRecruitment` | `scheduleId @unique`, `slots`, `closesAt`, `note?`, `visibility`, `state`, `version`; applications are authenticated-only `V1ScheduleGuestApplication(recruitmentId,userId NOT NULL,displayNameSnapshot,note?,state)` with unique `(recruitmentId,userId)`. Anonymous/unlinked submission paths do not exist; “unlinked guest” elsewhere means a game participant not linked to a Teameet identity, not a recruitment applicant. |
| `V1TournamentField` | `tournamentId`, immutable `scopeKey`, `name`, `sortOrder`, `active`, `version @default(0)`; unique `(tournamentId,scopeKey)` and `(tournamentId,id)`; PATCH CAS increments version. |
| `V1TournamentStaffAssignment` | `tournamentId`, `userId`, `role`, `fieldId?`, `version`, `expiresAt?`, `revokedAt?`, `grantedByUserId`; composite FK `(tournamentId,fieldId)→V1TournamentField(tournamentId,id)` forbids cross-tournament fields; DB check requires director/support scope to have null `fieldId`; indexes `(userId,revokedAt,expiresAt)` and `(tournamentId,role)`. Fixture scope is normalized, never mutable JSON. |
| `V1TournamentStaffFixtureScope` | `assignmentId`, `fixtureId`; unique `(assignmentId,fixtureId)` with deferred FKs. Paired `DEFERRABLE INITIALLY DEFERRED` constraint triggers fire on assignment INSERT/UPDATE/DELETE and scope INSERT/UPDATE/DELETE: they lock the affected assignment plus scope rows, require fixture tournament = assignment tournament, and require every live field_operator to have either same-tournament `fieldId` or at least one scope row at commit. Thus parent-first creation is allowed inside one transaction, while deleting/moving the last child or changing role/field/tournament cannot commit incomplete. |
| `V1CompetitionConfigVersion` | `sportCode`, `name`, `version`, JSON `periods/events/lineup/result/tieBreak/visibility`, `contentHash`, `createdByUserId`; unique `(sportCode,name,version)` and `contentHash`; immutable after reference. |
| `V1ResultEscalation` | `resultRevisionId`, `kind`, `dueAt`, `status`, `ackByUserId?`, `resolvedByUserId?`, `reason?`; unique `(resultRevisionId,kind)`, index `(status,dueAt)`. |
| `V1GameOperationFlag` | `key`, string `value`, `version`, `ownerActor`, `updatedByUserId`, `rollbackValue`, `updatedAt`; unique `(key)`, audit every change. Exact values/defaults: `GAME_WRITE=legacy|new` default `legacy`; `GAME_READ=legacy|compare|new` default `legacy`; `PUBLIC_LIVE=off|on` default `off`; `DIRECTOR_OFFICIALIZE=off|on` default `off`. |
| `V1GameCutoverEpoch` | singleton `id="game-cutover"`, `version`, `writeMode`, `firstNewWriteAt?`, `firstNewWriteResourceId?`, `updatedAt`; every `GAME_WRITE` CAS, `GAME_READ` rollback CAS, and new-authority business write locks this row `FOR UPDATE`. The first successful new write sets the latch in the same transaction as the business mutation; it is never cleared. |
| `V1OperationAudit` | append-only `actorType USER|SYSTEM`, nullable `actorUserId`, nullable `systemActor`, `action`, `resourceType`, `resourceId`, `requestId`, masked `sourceIp`, JSON `before/after`, `reason?`, `createdAt`; check is exact correlation: `(actorType='USER' AND actorUserId IS NOT NULL AND systemActor IS NULL) OR (actorType='SYSTEM' AND actorUserId IS NULL AND systemActor IS NOT NULL)`; indexes `(resourceType,resourceId,createdAt)` and `(actorUserId,createdAt)`. |

Raw migration triggers `v1_guard_result_revision_transition`, `v1_block_terminal_revision_mutation`, `v1_guard_result_participant_mutation`, and `v1_block_used_config_mutation` enforce the content-freeze/terminal rules above, reject UPDATE/DELETE of terminal revisions, reject participant INSERT/UPDATE/DELETE unless the locked parent is `DRAFT`, and reject referenced config changes. Composite/deferred constraints enforce same-game current/supersession pointers and same-tournament field/fixture scope. The deterministic final tie-break seed is `SHA-256(tournamentId || ":" || competitionConfigVersionId || ":" || sortedTeamIds)` ascending lexical bytes; no random runtime draw is allowed.

### Frozen worker lease and retry policy
- Claim uses one database transaction with `FOR UPDATE SKIP LOCKED`, changes only `PENDING|RETRY` rows whose `availableAt<=now` and whose lease is absent/expired, writes a random `leaseOwner`, `leaseUntil=database_now()+30s`, increments `attempts`, and commits before handling. A worker heartbeats every 10s and renews to `database_now()+30s` only when the same owner still holds the lease.
- Retry delays are exactly `1s, 5s, 30s, 2m, 10m`; attempt 6 moves the item atomically to `POISONED`, clears the lease, records a bounded error, increments version, emits the degraded-health metric, and requires an audited `platform_ops` requeue. Requeue CAS increments `retryGeneration` and version, resets `attempts=0`, clears lease/lastError, and schedules RETRY at database-now; the unchanged business key prevents a second committed effect.
- Graceful shutdown stops claiming, gives active handlers 20s, then transactionally releases only leases owned by that worker to `RETRY` with the next delay. Crash recovery permits another replica to claim only after `leaseUntil`; late completion by the expired owner fails the owner/version compare-and-swap and cannot commit. V5 starts two replicas and covers claim races, renewal, crash before/after effect transaction, expiry takeover, poison/requeue, and 20s shutdown.

### Consent truth table
| Transition/state | Public career/history | Team aggregates | Cache and immutable snapshot |
|---|---|---|---|
| Unlinked guest | never creates a career page | included under pseudonymous participant ID | name snapshot retained operations/audit only |
| Two-party link attested at T1 without consent | pre/post-T1 hidden | retained | immutable link events record requestor and distinct attestor; null consent version |
| Consent vN granted at T2 | events at/after T2 become eligible; no pre-T2 backfill | retained | future snapshots capture vN; rebuild starts at T2 |
| Consent vN revoked at T3 | all identity-linked career rows, including pre-T3 rows, hide immediately; no future projection | retained and never publicly relinked | public cache purge ≤5s; snapshots/audit retain pseudonymous ID, vN, grant/revoke times |
| Regrant vN+1 at T4 | only events at/after T4 become eligible; hidden older rows stay hidden | retained | future snapshots capture vN+1; no automatic historical relink |
| Linked user later unlinked | public career rows hide immediately and future projection stops | retained | same as revoke; immutable operations snapshot remains pseudonymous |

### Frozen contract files before service parallelism
- Todo 3 creates and validates: `docs/api/domains/games.md`, `team-schedules.md`, `tournament-operations.md`, `tournament-operations-auth.md`, `tournament-operations-escalations.md`, `game-realtime.md`, `game-migration.md`, and `public-records.md`.
- These files freeze endpoint paths, DTO fields, socket event names, per-game sequence/version/time semantics, idempotency-key scope, error codes, visibility precedence, actor matrix, consent lifecycle, cutover flags, and rollback behavior. Todo 6 cannot start until V3 passes.

### Consent lifecycle and retroactivity
- Consent is versioned per participant snapshot. Grant permits future public player projection; no consent keeps only team aggregates and operations-only identity.
- Revocation immediately hides player-identifying public DTO/HTML/metadata, purges public cache within the 5-second projection SLO, and removes all identity-linked career rows including pre-revocation history; regrant restores eligibility only for events at or after the new grant time.
- Historical team score/event aggregates and an internal pseudonymous participant snapshot remain for integrity and audit; they can never relink publicly. Audit retention preserves consent version, actor, timestamp, and policy basis.

### Literal migration/cutover phases
Only `platform_ops` may mutate flags through a compare-and-swap transaction carrying expected version(s), idempotency key, reason, and the named gate-bundle path/hash; each changed flag writes `V1OperationAudit` plus outbox. Single-key changes use PATCH; any read/write authority rollback uses the tuple-transition endpoint with exact expected values/versions. `GAME_READ=compare` returns the legacy response while synchronously recording a legacy/new comparator result; it never falls back on an error. `GAME_READ=new` returns only the new projection. Permitted transitions are `GAME_READ legacy→compare→new`, `GAME_WRITE legacy→new`, `PUBLIC_LIVE off→on`, and `DIRECTOR_OFFICIALIZE off→on`; boolean rollback is `on→off` with a new audit/version. Phase C transition order is frozen: validate compare gate → CAS `GAME_WRITE legacy→new` while locking `V1GameCutoverEpoch` → CAS `GAME_READ compare→new` → public/director gates. Every new-authority business write and every read/write rollback tuple-CAS locks the singleton cutover row and flag rows in lexical order `FOR UPDATE`; the first successful new write sets `firstNewWriteAt/resourceId` in the same transaction, while rollback requires the latch still null. Therefore write-versus-rollback races serialize with exactly one legal winner. `GAME_READ new→compare|legacy` and `GAME_WRITE new→legacy` are forbidden once the latch is set; a pre-latch rollback atomically restores both authorities to the approved prior values and increments each changed flag version exactly once. `PUBLIC_LIVE` requires V24 privacy/visibility plus V26 PUBLIC-01 receipts; `DIRECTOR_OFFICIALIZE` requires V7 auth plus V22 API and V23 UI audit receipts. Local toggle tests use isolated DBs; V27/F4 require the final tuple/version below after cleanup.

The flag gate is an immutable phase-specific attempt-bound bundle, not an ad hoc list. During V27, after the current attempt's prerequisite V receipts exist, `run-v1-release-candidate.mjs` canonicalizes `/private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1/flag-gate-<attemptId>-<phase>-<transition>.json` with exactly `{schemaVersion:1,phase,attemptId,baselineSHA,candidateSHA,planSHA,transition,key?,tupleKeys?,from:{value,version}?,to:{value,version}?,fromTuple?,toTuple?,prerequisites:[{gateId,phase,commandId,path,sha256,verdict}],priorPhaseReceipt?:{path,sha256},deploymentManifest?:{path,sha256},publicProof?:{path,sha256},createdAt}`. A single-key bundle requires `key/from/to` and forbids tuple fields; a tuple rollback bundle requires lexically ordered `tupleKeys/fromTuple/toTuple` and forbids single-key fields. The producer and flag service descriptor-verify every prerequisite and recursively require its internal gate/phase/command/attempt/baseline/candidate/plan/lifecycle identities to match the bundle; separately typed prior/deployment/public receipts are verified against their own exact schemas, signatures, candidate/deployment/phase identities, and path hashes rather than being forced into the V-receipt schema. Stale, mixed-attempt, cross-gate, wrong-command, wrong-phase, or cross-deployment receipts fail before CAS. Local Phase B compare uses exactly V10. Local Phase C GAME_WRITE and GAME_READ each use V10+V25; PUBLIC_LIVE uses V24+V26:PUBLIC-01; DIRECTOR_OFFICIALIZE uses V7+V22+V23. R2 never reuses local receipts: its GAME_WRITE/READ bundles require `{path,sha256}` for the signed R1 terminal receipt plus the R2 run's own comparator V receipt, while public-live additionally requires typed `{path,sha256}` deploymentManifest and publicProof. `prerequisites` is lexically ordered by gateId/commandId. The producer writes canonical JSON with `O_CREAT|O_EXCL`/fsync/0444 and returns path+SHA-256; Flag PATCH/tuple-transition consumes that hash in the CAS/audit. No transition occurs before its semantically valid bundle exists.

| Phase | Flags/read-write authority | Required gate | Failure action |
|---|---|---|---|
| A Expand | start/end tuple `(GAME_WRITE=legacy@v0,GAME_READ=legacy@v0,PUBLIC_LIVE=off@v0,DIRECTOR_OFFICIALIZE=off@v0)`; additive schema dark | V4/V5 green and backfill dry-run counts/hash recorded | disable worker; tuple remains A |
| B Local shadow proof | start A; end `(legacy@v0,compare@v1,off@v0,off@v0)`; legacy response authority, comparison only | deterministic full-fixture comparator runs include every eligible seeded record, mismatch injection blocks V10/V25, recovery zero; transition receipt hash supplied to flag CAS | stop local gate, quarantine mismatch, repair/rebuild; CAS `compare@v1→legacy@v2` only before new write |
| C Pre-cleanup candidate | start B; end `(new@v1,new@v2,on@v1,off@v0)` in the isolated candidate DB; compatibility readers remain and legacy writes reject | `GAME_WRITE` receipt requires V10/V25 zero mismatch; `GAME_READ` requires same; `PUBLIC_LIVE` requires V24+V26; V27/F4 prove exact final tuple/versions | forward-fix on a new isolated attempt and restart affected V commands plus F1–F4; do not remove compatibility |
| R1 Authorized alpha shadow (separate rollout) | require values `(legacy,legacy,off,off)` at arbitrary current versions `(w,r,p,d)` read into the signed deployment manifest; transition/end `(legacy@w,compare@r+1,off@p,off@d)` and remain there for all 7 runs | explicit authorization plus signed deployment manifest and 7 scheduled 24h-separated signed full-population zero-mismatch receipts | CAS read back to `legacy@r+2`, disable worker, open fix/reverification cycle; a later authorized retry starts from that actual version, never assumes v0 |
| R2 Authorized alpha new-write (separate rollout) | start at the signed R1 terminal tuple `(legacy@w,compare@r+1,off@p,off@d)`; transition/end `(new@w+1,new@r+2,on@p+1,off@d)`; compatibility comparator remains | valid R1 chain; write/read CAS use the exact R1 terminal values/versions; public-live CAS binds the signed deployment manifest plus deployed R1 public-proof receipt; 7 further signed zero-mismatch runs | after first new-only write, forward-fix or maintenance error; no legacy rollback; public-live may CAS `on@p+1→off@p+2`, and any later re-enable uses the then-current version |
| R3 Post-alpha cleanup (separate rollout) | start/end at the exact signed R2 terminal values and versions, whatever their monotonic numbers; remove compatibility readers only in a new code-only commit and use phase-aware `R3-V1..R3-V27`/`R3-F1..R3-F4` registry | bind signed R1/R2 chain, pre-cleanup candidate SHA, cleanup parent/SHA, actual terminal flag tuple/versions, removal-manifest hash, and phase-registry hash | revert only cleanup commit or forward-fix, then rerun all cleanup-mode gates; flag tuple is unchanged |
- Local eligible population is every valid fixture in the deterministic migration dataset. Deployed eligible population is every non-deleted TeamMatch/TournamentFixture with a legacy result or new Game adapter at each signed watermark. Equivalence compares source ID, lifecycle, sides, regulation/penalty scores, ordered reconstructable goals, official timestamp, visibility, and completeness/provenance flags. Any difference is critical except non-reconstructable participant/event fields carrying the explicit `incomplete` marker.
- After an explicitly authorized push of the exact candidate, each rollout or retry first generates a fresh UUID `deploymentAttemptId` and executes `node scripts/qa/run-v1-alpha-cutover.mjs --phase deploy-bind --deployment-attempt "$deploymentAttemptId" --candidate-receipt "$V1_CANDIDATE_RECEIPT_PATH" --candidate-receipt-sha "$V1_CANDIDATE_RECEIPT_SHA" --environment alpha --deployment-url https://alpha.teameet.co.kr --output-dir /private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1`. It descriptor-verifies the candidate, proves the deployed build reports that candidate SHA, reads the current flag values/versions, and atomically writes `alpha-deployment-<candidateSHA>-<deploymentAttemptId>.json` plus SHA with exactly `{schemaVersion:1,deploymentAttemptId,environment:"alpha",candidateSHA,candidateReceiptSHA,deployedBuildSHA,deploymentUrl,apiUrl,flagTuple,workflowRunId,deployedAt,actor,signingKeyId,signature}`. `O_CREAT|O_EXCL` prevents overwrite; a retry against the same candidate gets a new attempt/path and binds the then-current monotonic flag versions. The Ed25519 signature covers canonical JSON excluding `signature`; the committed verification key/key ID is in the runbook.
- The separate runbook then runs R1 with `--deployment-manifest "$ALPHA_DEPLOYMENT_MANIFEST_PATH" --deployment-manifest-sha "$ALPHA_DEPLOYMENT_MANIFEST_SHA"`. After the seventh zero-mismatch run it executes `node scripts/qa/run-v1-alpha-cutover.mjs --phase R1-public-proof --deployment-manifest "$ALPHA_DEPLOYMENT_MANIFEST_PATH" --deployment-manifest-sha "$ALPHA_DEPLOYMENT_MANIFEST_SHA" --require-signed R1:7 --journey PUBLIC-01 --privacy-gates V24,V26:PUBLIC-01`; this runs the deployed public/anonymous privacy journey and writes immutable signed `alpha-public-proof-<candidateSHA>-<deploymentAttemptId>-<r1TerminalHash>.json` plus SHA with exactly `{schemaVersion:1,phase:"R1-public-proof",deploymentAttemptId,candidateSHA,deploymentManifestSHA,r1TerminalReceiptSHA,routeSetHash,privacyGateIds,persona:"public",verdict,observedAt,actor,signingKeyId,signature}`. R2 is exact: `node scripts/qa/run-v1-alpha-cutover.mjs --candidate-receipt "$V1_CANDIDATE_RECEIPT_PATH" --candidate-receipt-sha "$V1_CANDIDATE_RECEIPT_SHA" --phase R2 --runs 7 --interval 24h --population full --require-signed R1:7 --deployment-manifest "$ALPHA_DEPLOYMENT_MANIFEST_PATH" --deployment-manifest-sha "$ALPHA_DEPLOYMENT_MANIFEST_SHA" --public-proof "$R1_PUBLIC_PROOF_PATH" --public-proof-sha "$R1_PUBLIC_PROOF_SHA"`. Every R1/R2 receipt contains deploymentAttemptId, candidateSHA, candidateReceiptSHA, deploymentManifestSHA, phase/run, exact before/after flag values/versions, watermark, count/hash, UTC timestamp, previousReceiptHash, actor, signingKeyId, and signature. R2 refuses any invalid/missing/cross-attempt/cross-candidate manifest, proof, or R1 chain.
- Authorized R3 is exact: `node scripts/qa/run-v1-alpha-cutover.mjs --candidate-receipt "$V1_CANDIDATE_RECEIPT_PATH" --candidate-receipt-sha "$V1_CANDIDATE_RECEIPT_SHA" --phase R3-apply --require-signed R1:7,R2:7 --removal-manifest deploy/runbooks/v1-game-operations-compatibility-removal.json --phase-registry deploy/runbooks/v1-game-operations-r3-registry.json`; it verifies the signed chain and writes an apply receipt binding pre-cleanup SHA, flag tuple, removal-manifest hash, and registry hash. It may change only compatibility-reader paths named in the manifest and performs no schema/data contraction. Root pathspec-commits those paths, then `node scripts/qa/run-v1-release-candidate.mjs --phase cleanup --parent-receipt "$R3_APPLY_RECEIPT" --receipt-dir /private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1 --registry R3-V1-R3-V27 --builds v1_api,v1_web`; capture its printed `R3_CLEANUP_RECEIPT_PATH`/`R3_CLEANUP_RECEIPT_SHA`, then run `R3-F1..R3-F4` with that pair. Cleanup V25/V27/F1/F4 require exact absence of every manifest reader and presence/validity of the R1/R2 chain; pre-cleanup V25/V27/F1/F4 continue to require reader presence. If authorized rollback is required, read the cleanup candidate SHA from the descriptor-verified cleanup receipt, run the separate rollback gate, then `git revert` that exact SHA and rerun R3 verification. These commands are specified but never executed by the current plan.
<!-- TASK127_GAME_RECORD_ADR_BUNDLE_END -->


<!-- TASK127_GAME_RECORD_ADR_BINDING_BEGIN -->
- [ ] 2. Ratify the Game/Record, permission, visibility, identity, and migration ADR bundle
  What to do / Must NOT do: Copy the plan's frozen D-01–D-12, REST/idempotency, realtime, actor-action, schema, consent, and cutover tables into `.github/tasks/127-v1-team-tournament-operations-game-record.md` without semantic change; bind independent execution/lineup/revision/publication axes; exactly-one source; schedules as associations; soft-delete/snapshot survival; `/tournament-ops/**` scoped shell; immutable fixture/court scope; and forward-only recovery. Do not reopen decisions, invent contract fields, or allow free-text venue authorization.
  Parallelization: Wave 0 | Blocked by: 1 | Blocks: 4-6 | Can run with: 3
  References: bound product specification pp. 8-12, 28-35, 38-46; the frozen operational/contract tables in this approved plan artifact; `apps/v1_web/src/app/admin/layout.tsx`; `apps/v1_web/src/app/admin/_gate.tsx`; `apps/v1_api/src/common/admin-context.service.ts`; `apps/v1_api/prisma/schema.prisma` models `V1TeamMatch`, `V1TournamentFixture`, `V1AdminActionLog`.
  Acceptance criteria: V2 proves the copied tables are byte-normalized semantic matches to this plan; every endpoint/model/event/actor/action/decision/error and rollback boundary is present; the literal XOR rejects zero/multiple source; deletion, consent, revoke, flag, and last rollback-safe point are explicit.
  QA scenarios: V2 happy fixture validates all D IDs, endpoint/model/event fields, actor matrix, state axes, and rollback gates; negative fixtures remove D-10, change one DTO field, or weaken the XOR and must fail with `ADR_CONTRACT_DRIFT`. Evidence `<attemptDir>/task-2-teameet-team-tournament-operations-v1.txt`.
  Commit: N | Root agent later pathspec-commits ADR paths with Wave 0.
<!-- TASK127_GAME_RECORD_ADR_BINDING_END -->

## Ambiguity log

- PDF artboards show tournament field operations under `/admin/**`; approved D-04 and the selected plan supersede only that route example with `/tournament-ops/**`. Existing global admin tournament management remains unchanged.
- `T-08` and `P-03` intentionally resolve to the same public team-record route. They are distinct product entry/context IDs with one implementation owner, not duplicate ownership.
- The v1 live-entry MVP is tournament-operations only. Tapping a player freezes that moment's server-synchronized game clock in an event draft; choosing `GOAL`, `YELLOW_CARD`, or `RED_CARD` submits the acknowledged event with that captured clock. `GOAL` requires the scorer and may include one optional assist. A generic `FOUL` event and an ordinary-team-match live console are deferred; team management uses the shared event/result contract through its post-match result workflow. Public live timelines render acknowledged events only.

## 정정한 오판 5건째 (2026-08-04): 태스크 22·23 은 "미구현" 이 아니라 이미 구현돼 있었다

이전 세션이 E2E-CORR-01 을 "태스크 22·23 미구현" 으로 결론 낸 것 자체가 오판이었다. `.omo/plans/teameet-team-tournament-operations-v1.md` 의 `[ ] 22.`/`[ ] 23.` 체크박스만 갱신이 안 됐을 뿐, 코드는 실제로 존재하고 배선돼 있었다.

### 실측으로 확인한 것

- **백엔드**: `apps/v1_api/src/tournament-operations/results/tournament-result-review.{controller,service,dto}.ts` — 스펙이 요구한 5개 엔드포인트(`review-decision`/`supersede-and-submit`/`officialize`/`void`/`corrections`) 전부 존재, `tournaments.module.ts` 에 정상 등록. 구현 커밋 `8f9b2ee7`(+후속 fix 3건)은 이미 현재 HEAD 의 조상(`git merge-base --is-ancestor` 로 확인).
- **백엔드 테스트**: `apps/v1_api/test/tournaments/tournament-officialize.integration-spec.ts`(629줄, 9개 테스트)를 신규 격리 DB(`ulw_v1_integration_task27`, `teameet_v1_pg_flow:5442` 에 생성 후 `prisma migrate deploy`)에서 직접 실행 — **9/9 통과**. reject/supersede/stale-hash 거부/officialize+중복거부/correction+포인터 스왑/stale correction 거부/void+중복거부/`NEXT_FIXTURE_CONFLICT`/`DIRECTOR_OFFICIALIZE` 라이브 게이팅까지 실제로 검증됨.
- **프론트엔드**: `apps/v1_web/src/app/tournament-ops/tournaments/[id]/result-review/`, `.../records/corrections/` 가 이미 존재(커밋 `b40a0efb` "add tournament result review and correction console (Task 23)"). `src/app/tournament-ops/result-review.test.tsx`(579줄, 22개 테스트) 전부 통과.
- **라이브 화면 검증**(Read 로 직접 스크린샷 확인, `/private/tmp/teameet-ulw-evidence/task22-23-live-verify/`): `admin@teameet.v1`(대회 디렉터, tournament `2c493cbb…`)로 `/tournament-ops/tournaments/:id/records/corrections` 접속 → 실제 시드 경기("강남 풋살 클럽 vs 성수 풋살 클럽 3:1", 리비전 #1 공식 확정 이력) 렌더 확인 → "정정 시작" 클릭 → 참가자별 득점/경고/퇴장/선발/골키퍼 입력 폼이 실제 6명 선수 ID로 렌더, 사유 미입력 상태에서 "정정 제출" 버튼 비활성(유닛테스트 계약과 일치) 확인. 실제 제출은 하지 않음(다른 QA 상태 보존).

### 그럼에도 진짜로 남은 gap — `tech-planner` 대조 검증 결과

Task 22 원 스펙의 Acceptance Criteria 9개 중 **6개 완전충족 · 2개 부분 gap · 1개 설계충족·테스트미비**:

| 항목 | 상태 | 내용 |
|---|---|---|
| AC-7 (standings/next-fixture 충돌) | **부분 gap** | next-fixture 쪽은 `NEXT_FIXTURE_CONFLICT` 로 충족. **standings/tie-break 충돌 감지는 구현 자체가 없음** — `STANDINGS_CONFLICT` 계열 식별자 전역 0건 |
| AC-8 (director flag 감사) | **부분 gap** | 플래그 라이브 재조회·성공 감사는 있음. **403 거부 경로는 감사 레코드를 남기지 않고, 감사에 플래그 값/버전 스냅샷이 없음** |
| AC-4 (원자 롤백) | 설계충족·테스트미비 | 단일 `$transaction` 이라 설계상 충족이나 실패 주입 테스트가 없음 |

QA scenarios 21개 중 **12개 커버 / 9개 미커버**(supplement 재제출, atomic rollback 주입, supplement/change-request 터미널 거부, cross-game 손상, projection failure, director void 거부/성공, tie-break 충돌). 스키마 마이그레이션은 불필요(기존 트리거·복합 FK 가 불변식을 이미 강제). 상세 대조표는 `.github/tasks/22-tournament-result-review-officialize.md`.

### F3 상태 재평가

E2E-CORR-01 의 핵심 경로(리뷰→officialize→correction 생성→correction officialize 로 포인터 스왑)는 백엔드 통합테스트 9/9 + 라이브 화면 검증으로 **동작이 실증됐다**. 다만:
- 이번 턴에서 브라우저로 정정을 실제 제출·확정까지 밀어붙이지는 않았다(폼 렌더·비활성 상태 확인까지).
- standings/tie-break 충돌 감지 gap 은 E2E-CORR-01 시나리오 자체가 요구하는 범위인지 원 스펙 QA scenario 목록 재확인이 아직 필요하다.

따라서 F3 를 이 턴에서 7/7 로 승격하지 않는다 — **6/7 유지**, 단 "태스크 22·23 미구현" 이라는 차단 사유는 폐기한다. 다음 세션 진입점: (1) 정정 제출→officialize 까지 실제로 완주해 DB 레벨 포인터 스왑을 실측하고, (2) standings 충돌 감지 gap 이 E2E-CORR-01 통과에 필요한지 스펙 대조, (3) 필요하면 `game-operation-flags.ts`/`prisma/**` 를 건드리지 않는 범위에서 gap 2건(AC-7 standings, AC-8 감사) 을 별도 태스크로 구현.

### E2E-CORR-01 완주 — 정정 제출→officialize→포인터 스왑을 DB 레벨로 실측 (2026-08-04, 같은 턴 후속)

위에서 "다음 세션 진입점 (1)"로 미뤄뒀던 것을 같은 턴에서 마저 완료했다. `admin@teameet.v1`(대회 디렉터, tournament `2c493cbb…`)로 `/tournament-ops/tournaments/:id/records/corrections`에서 실제 시드 경기("강남 풋살 클럽 vs 성수 풋살 클럽", 기존 공식 결과 3:1 · 리비전 #1)를 대상으로:

1. "정정 시작" → 홈 점수 3→4, 참가자 c42670 득점 0→1, 사유 입력 → "정정 제출" (초기엔 비활성, 사유 입력 후 활성화 — 유닛테스트 계약과 일치)
2. 정정 초안 생성 확인: "정정 초안이 대기 중이에요", diff "이전 3:1 → 4:1" 표시, **기존 공식 결과(리비전 #1)는 여전히 "공식 확정"으로 authoritative 유지**(AC-2 실증)
3. "정정 확정" → 확인 다이얼로그("4:1로 공식 결과를 정정해요") → 최종 확정
4. UI 즉시 4:1로 갱신 확인(좌측 목록 + 상세 패널)

DB 실측(`docker exec teameet_v1_pg_flow psql`):
- `v1_game_result_revisions`: 리비전 #1(`111ff82c…`, score `{home:3,away:1}`) 과 #2(`44676f14…`, score `{home:4,away:1}`, `supersedes_id=111ff82c…`, `reason="심판 확인 결과…"`) 모두 `state=OFFICIAL`, `official_at` 각각 09:54:42 / 13:39:57 — 이 스키마는 리비전을 append-only 불변 원장으로 두고 "현재" 포인터를 별도 필드로 관리하는 설계였다(초반에 "리비전 상태가 안 바뀐다"고 오판할 뻔함).
- **결정적 증거**: `v1_games.current_official_revision_id` 가 `111ff82c…`(#1) → `44676f14…`(#2) 로 정확히 스왑됨, `updated_at=13:39:57.442`(정정 확정 클릭 시각과 일치). 이 컬럼은 `v1_guard_game_revision_pointer()` **Postgres 트리거** + 복합 FK `(id, current_official_revision_id) → (game_id, id)` 로 가드된다 — 트리거를 우회하지 않고 애플리케이션 API 경로로만 통과시켰다.

**E2E-CORR-01 의 핵심 경로(correction 생성 → 기존 포인터 authoritative 유지 → correction officialize → 원자적 포인터 스왑)는 이제 DB 레벨로 완전히 실증됐다.** 다만 이 턴에서 F3 영수증을 재발급하고 게이트를 재실행하지는 않았다 — `V1_CANDIDATE_RECEIPT_SHA`/candidate receipt 경로가 이번 턴에 새로 만든 커밋(`321fa7d2`)에 결속된 것인지 문서에 정확히 기록돼 있지 않아, 무리하게 추측한 값으로 게이트를 돌리면 잘못된 영수증을 만들 위험이 있었다. **다음 세션 진입점(갱신)**: (a) 현재 HEAD에 결속된 유효한 candidate receipt 확보(필요하면 V27 후보 재생성), (b) `f3-review-receipt-v7.json`(journeys 7개 전부 pass, 이번 E2E-CORR-01 실측을 근거로) 0444 발급, (c) `--qa-review-receipt`/`--qa-review-receipt-sha` 로 F3 게이트 재실행해 7/7 APPROVE 확인.

### `planSHA` 재결속 — 2026-08-04

이 원장의 `planSHA` 는 `dc4ecb2f7659…` 였고, 살아 있는 플랜의 체크박스 정규화 SHA 는
`108a6cf1e8a5…` 다. F4 의 `plan-sha-declared` 검사가 이 불일치를 `FINAL_SCOPE_DRIFT` 로
잡아냈고(실행 관측), 앞선 두 건의 독립 리뷰도 같은 지점을 지적했다. 살아 있는 플랜에 맞춰
재결속한다.

**무엇이 바뀌었나.** 플랜 본문(체크박스가 아닌 서술)이 어느 시점에 바뀌면서 정규화 SHA 가
`dc4ecb2f` → `108a6cf1` 로 이동했다. `dc4ecb2f` 시점의 플랜 텍스트는 어디에도 남아 있지
않다 — 플랜 파일이 `.git/info/exclude` 로 untracked 라 git 이력이 0건이고, 저장소·워크트리·
증거 디렉터리 전수 스캔에서 그 SHA 로 해시되는 사본을 찾지 못했다.

**이 갱신이 주장하지 않는 것.** 이미 완료 처리된 todo 들이 `108a6cf1` 텍스트 기준으로
검증됐다고 주장하지 않는다. 실제로는 각자 완료 시점의 플랜 텍스트 기준으로 검증됐고, 그중
일부는 `dc4ecb2f` 시점이었다. 확인 가능한 범위는 이렇다 — `.omo/evidence/task-9-r8` 이후
남아 있는 `CanonicalPlanSnapshot.md` 5개는 전부 `108a6cf1` 로 정규화되므로, r8(2026-08-03)
이후 완료된 todo 들은 현재 텍스트 기준으로 검증됐다. 그 이전 것들은 대체된 텍스트 기준이며
그 사실을 여기 남긴다.

**같은 사유로 재발급된 것.** Task-1 권한 체인 4종(cursor / override / consumption /
host-supervisor)도 사용자 명시 승인으로 `108a6cf1` 에 재결속해 재발급했다. 각 재발급본은
자체 `reissue` 블록에 대체 대상·승인 시각·어떤 값이 과거 관측치를 그대로 옮긴 것인지를
명시한다. 원본 `dc4ecb2f` 영수증들은 삭제하지 않고 그대로 남아 있다.

### F1~F4 실행 결과 — 2026-08-04

게이트를 실제로 돌린 결과를 관측된 그대로 남긴다.

**F1 — APPROVE.** 10개 검사 전부 pass: 화면 ID 18개(필드 완비), E2E 시나리오 ID 7개,
D-01~D-12 결정표, `globalForbidden` 6 + ownership 27행, 플랜 SHA 일치, 수용 항목 27개,
후보 영수증·소스 매니페스트 해시 결속. 증거: `<attemptDir>/final/F1.json`.

**F2 — REJECT.** `debt-marker-scan` 은 오탐(mktemp `XXXXXX`, 규칙 정의 문서)을 제거한 뒤
pass 로 전환됐다("206 touched files clean"). 남은 두 검사는 이 게이트가 스스로 수행할 수 없는
판단이라 리뷰 영수증으로 넘겨받도록 입력 경로를 열었다 — 다만 불리언 플래그가 아니라 이 실행의
후보 영수증 해시에 결속된 내용 주소화 영수증만 받는다. 부정 대조군으로 확인했다:
미제공 → BLOCKED, 해시 불일치 → FAIL, 미결속 영수증 → FAIL, 후보에 결속 → PASS.

**F3 — REJECT (정직한 거부).** 격리 DB 생성 + 마이그레이션 88개 적용까지 도달했고 cleanup
누수는 0이었다. `gate-identity` / `lifecycle-receipt-bound` / `qa-evidence-provided` 통과.
`qa-evidence-content-reviewed` 와 `manual-qa-journeys-performed` 는
`verdict must be APPROVE, found REJECT` 로 실패했는데, 이는 게이트가 옳게 동작한 것이다 —
발급한 리뷰 영수증이 7개 여정 중 3개만 실제로 수행됐다고 사실대로 기록했기 때문이다.

| 여정 | 판정 | 사유 |
|---|---|---|
| E2E-TEAM-01 | pass | 팀장 8단계 전부 200, 라인업 11명·포지션·득점 타임라인 실렌더 확인 |
| E2E-AUTH-01 | pass | 스태프 배정 REST 201, `_gate` 의 `deriveRole` 경로 통과 |
| E2E-PUBLIC-01 | pass | 공개 4화면 3폭 200, 비로그인 데이터 렌더 |
| E2E-TEAM-02 | fail | 승인 화면 렌더까지만. 승인/정정요청 액션 미수행 |
| E2E-TOUR-01 | fail | 검토할 SUBMITTED 리비전 미도달 — 라인업 submit 이 WS takeover 토큰 요구 |
| E2E-TOUR-02 | fail | 라이브 상태·takeover 미확보로 커맨드/이벤트 기록 미수행 |
| E2E-CORR-01 | fail | `DIRECTOR_OFFICIALIZE` 전환이 CI 전용 생성기의 게이트 번들 요구 |

`live-surface-reachable` 은 F3 가 3013/8121 을 자기 lifecycle 로 요구해 로컬 스택을 내린
상태로 돌린 탓에 BLOCKED 였다 — F3 자신의 스택을 올린 실행은 아직 하지 않았다.

**F4 — REJECT, dev 머지 종속.** 9개 검사 pass, 3개 fail. 실패 3건이 모두 같은 원인이다:
후보가 `dev` HEAD 인데 그 브랜치에 이 플랜의 27개 태스크가 아직 없다.

| 검사 | 상태 | 해소 조건 |
|---|---|---|
| `plan-sha-declared` | 수정됨 | 이 원장의 planSHA 를 살아 있는 리비전으로 재결속(위 절 참고) |
| `docs-exist` | fail | `docs/api/v1/domains/tournaments.md` 등이 통합 브랜치에만 존재 → PR #249 머지 시 해소 |
| `diff-within-ownership` | fail | `.changeset/*` 등이 머지 시 소유 경로로 편입 |
| `unrelated-dirty-untouched` | fail | `AGENTS.md` 를 다른 세션이 수정 중 — 공유 워크트리 특성 |

즉 F4 는 이 브랜치에서 고칠 수 있는 항목이 아니라 **`dev` 머지 이후에만 재평가 가능**하다.
`dev → main` 승격과 마찬가지로 PR 머지는 사용자 권한이므로 여기서 멈춘다.

### 배포 전 차단 항목 — `20260729000200` 마이그레이션이 alpha 배포를 중단시킬 수 있다

**증상.** `apps/v1_api/prisma/migrations/20260729000200_v1_competition_config/migration.sql:128-155`
의 DO 블록이 축구·풋살(soccer/football/futsal) 이 아닌 종목을 쓰는 기존
`v1_tournaments` / `v1_team_matches` 행을 하나라도 발견하면
`RAISE EXCEPTION 'COMPETITION_CONFIG_SOURCE_UNSUPPORTED'` 로 마이그레이션 전체를 중단한다.
`dev` push 는 `deploy-alpha.sh` 의 `prisma migrate deploy` 로 **라이브 alpha DB** 에 즉시
적용되므로, 그런 행이 있으면 배포가 중단된다.

**재현으로 확인한 것(추정 아님).**
- `v1_sports` 에 `running` · `swimming` 이 존재하고 **둘 다 `is_active=true`** 다(로컬 시드 실측).
- 팀 매치 생성 경로의 `validateMasterRefs`(`team-matches.service.ts:1457-1461`)는 종목이
  **존재하고 활성인지만** 검사한다. 축구/풋살 제한은 `1226-1229` 의 Game 생성 경로에만 있다.
  즉 러닝·수영 팀 매치 생성이 계약상 허용된다.
- 비축구 행이 0건인 현재 DB 에서 위 가드 블록을 그대로 실행하면 통과한다(기준선 확인).
  행이 하나라도 생기면 같은 블록이 `23514` 로 중단시킨다.

**왜 CI 가 못 잡는가.** `.github/workflows/deploy.yml` 의 "V1 migration replay + drift gate" 는
**빈 DB** 에 체인을 재생한다. 빈 DB 에는 비축구 행이 없으므로 이 분기는 절대 실행되지 않는다.
CI green 과 alpha 실배포 성공이 별개라는 뜻이다 — 이 저장소가 2026-07-12 에 겪은 사고
(마이그레이션 누락으로 prod `migrate deploy` 중단)와 같은 계열이다.

**여기서 고치지 않은 이유.** 해소하려면 셋 중 하나를 골라야 하는데 전부 제품 결정이다.
(a) 팀 매치 생성을 축구·풋살로 제한한다 — 기존 러닝/수영 팀 매치의 처리 방침이 필요하다.
(b) 미지원 종목 행에 competition config 를 부여한다 — 어떤 설정을 줄지 정의가 없다.
(c) `competition_config_version_id` 를 nullable 로 두고 축구/풋살 경로에서만 강제한다 —
    같은 마이그레이션의 `SET NOT NULL`(178-180행)과 트리거 설계를 바꿔야 한다.
게이트를 통과시키려고 가드를 완화하는 것은 이 항목의 해결이 아니다.

**배포 전 반드시 확인할 것.** alpha DB 에서 아래를 실행해 0 이 아니면 위 결정을 먼저 내려야 한다.

```sql
SELECT count(*) FROM v1_team_matches m
LEFT JOIN v1_sports s ON s.id = m.sport_id
WHERE s.code IS NULL OR lower(s.code) NOT IN ('soccer','football','futsal');
```

### 라인업 포메이션 · 라이브 득점 기록 — 현재 지원 범위와 남은 일

실측으로 확인한 현재 상태다. "된다/안 된다" 를 코드와 스키마에서 직접 확인해 적는다.

**포지션은 이미 저장·표시된다.** `v1_game_participants.position` 컬럼이 존재하고 서버가
라인업 응답에 실어 보낸다. 다만 화면이 그 값을 그리지 않아 전원이 "GK" 로 보이던 결함이
있었고(수화 단계에서 position 을 버림) 이번에 고쳤다 — 이제 `박서준 DF`, `임재혁 FW` 처럼
표시된다. 골키퍼는 position 이 아니라 별도 `goalkeeper` 플래그로 오므로 GK 행의 position 이
비어 있는 것은 정상이다.

**대형(포메이션)은 저장할 곳이 없다.** `formation` 이라는 컬럼이 스키마 어디에도 없다
(전체 컬럼 검색 0건). `lineup.view-model.ts` 상단 주석이 이유를 남겨두었다 — 저장되지 않는데
입력만 받는 "눈속임 필드" 를 만들지 않으려고 DTO·타입·UI 에서 의도적으로 제거했고,
되살리려면 `V1GameLineup.formation` 컬럼을 추가하는 마이그레이션이 선행돼야 한다.

**득점 기록 모델은 이미 있다.** `V1GameEventType` 이 `GOAL, CARD, SUBSTITUTION,
PERIOD_START, PERIOD_END, PAUSE, RESUME, CORRECTION` 8종이고, `v1_game_events` 가 선수
(`participant_id`)·시각(`clock_ms`, `occurred_at`)·측(`side_id`)을 함께 보관한다.
확정 결과의 득점 타임라인도 이번에 화면에 붙였다(분 · 득점자 · 팀).

**라이브 운영에 남은 것 두 가지.**
1. 라인업 submit 과 라이브 커맨드가 **배타적 takeover 토큰**을 요구하는데, 그 토큰은
   `/game-operations` Socket.IO 핸드셰이크로만 발급되고 서명된 세션 쿠키를 요구한다.
   이번에 `/auth/dev-session` 을 추가해 세션을 얻을 수 있게 했으나, E2E 하네스가 그 쿠키를
   쓰도록 전환하는 작업은 남아 있다.
2. 팀 매치 결과 입력 경로는 아직 무승부(0:0)만 받는다 —
   `team-match-result-client.tsx` 의 `SCORE_EVENT_MISMATCH` 안내가 "득점·카드 기록 기능은 곧
   추가될 예정" 이라고 명시한다. 대회(TOURNAMENT_FIXTURE) 경로와 달리 팀 매치 경로에는
   득점자 지정 UI 가 아직 연결되지 않았다.

#### 풋살 포메이션 기준 (제품 요구사항으로 확정)

기본은 5대5다. 코트가 좁고 공수 전환이 빨라 고정 자리보다 유기적 움직임이 중요하므로,
대형은 "시작 배치" 로 다루고 경기 중 변화는 이벤트(교체·이동)로 기록한다.

| 대형 | 구조 | 성격 |
|---|---|---|
| 1-2-1 (다이아몬드) | 피보 1 · 아라 2 · 픽소 1 | 공수 균형이 가장 안정적인 정석. 시야·패스 길 확보에 유리 |
| 2-2 (박스) | 수비 2 · 공격 2 | 역할 분담이 명확. 수비 간격 유지가 쉬워 초보 팀에 적합 |
| 3-1 | 픽소 1 · 중간 2 · 피보 1 | 타겟 스트라이커(피보)를 세워 전방에서 공을 지키는 공격적 운영 |

포지션 정의:

| 포지션 | 역할 |
|---|---|
| 골레이로 (Golheiro) | 골문을 지키며 발로 패스를 전개해 빌드업의 시작점이 된다 |
| 픽소 (Fixo) | 최후방에서 빌드업을 조율하고 상대 공격을 차단하는 수비 핵심 |
| 아라 (Ala) | 좌우 측면을 빠르게 왕복하며 공격·수비를 모두 지원하는 엔진 |
| 피보 (Pivo) | 최전방에서 등지고 공을 받아 슈팅·연계로 마무리 |

6대6은 위 대형에서 한 명을 더 배치하는 변형으로 다룬다(예: 1-2-1 → 1-2-2 또는 1-3-1).
따라서 포메이션은 문자열 상수 목록이 아니라 **인원 수 × 라인 배분** 으로 표현해야 확장된다.

#### 다음 태스크로 필요한 것

1. `V1GameLineup.formation` 컬럼 마이그레이션 — 값은 `"1-2-1"` 같은 라인 배분 문자열로 두고
   인원 합이 그 경기의 로스터 정원과 일치하는지 검증한다(5대5·6대6 모두 같은 규칙으로 처리).
2. 라인업 편집기에 대형 선택 + 각 슬롯에 이름 배치 UI. 슬롯의 포지션 라벨은 위 표를 쓴다.
3. 팀 매치 결과 입력에 득점자 지정 연결 — 대회 경로에는 이미 있으므로 그 계약을 재사용한다.
4. E2E 하네스를 `/auth/dev-session` 쿠키 인증으로 전환해 라이브 커맨드(takeover·이벤트 기록)를
   실제로 검증 가능하게 만든다.

#### 범위 정정 — 풋살 **대회** 우선

위 절은 팀 매치와 대회를 나란히 다뤘는데, 우선순위는 **풋살 대회**다. 그 기준으로 다시 보면
남은 결손이 훨씬 적다 — 풋살 규칙이 이미 시스템에 들어 있기 때문이다.

`v1_competition_config_versions` 에 `sport_code='futsal'` 버전이 존재하고 내용이 실제
풋살 규격이다(실측):

| 항목 | 저장된 값 |
|---|---|
| 라인업 | `maxPlayers: 5`, `minPlayers: 3`, `substitutions: "rolling"`, `maxSubstitutions: null` |
| 경기 시간 | 전반 20분 · 후반 20분, `extraTime: false` |
| 이벤트 | `GOAL, OWN_GOAL, YELLOW_CARD, RED_CARD, SUBSTITUTION, TEAM_FOUL` |

5대5 정원도, 롤링 교체(횟수 무제한)도, 팀 파울도 이미 규칙으로 박혀 있다. 대회마다 이 config
버전이 결속되므로 종목별 규칙이 자연히 갈린다.

풋살 대회 한정 현황:

| 항목 | 상태 |
|---|---|
| 5대5 정원 · 롤링 교체 | 있음 (config) |
| 득점자 지정 | 있음 — **대회 경로에는 이미 연결돼 있다**. 0:0 제한은 팀 매치 경로만의 문제다 |
| 전·후반 타임라인 | 있음 (`PERIOD_START/END`, `PAUSE/RESUME`) |
| 포지션 저장·표시 | 있음 (이번에 화면 표시 복구) |
| 대형(1-2-1 / 2-2 / 3-1) | **없음** — `formation` 컬럼 부재 |
| 라이브 기록 실검증 | **없음** — takeover 토큰이 서명 세션 요구 |

**즉 풋살 대회 기준의 핵심 결손은 "대형 저장" 하나다.** 앞 절에 적은 팀 매치 0:0 제한은
대회 우선 기준에서는 후순위로 내린다.

`maxPlayers` 가 config 에 있으므로 **포메이션은 config 에 묶는 것이 자연스럽다** — 대형의
라인 배분 합이 그 config 의 `maxPlayers` 와 일치하는지 한 곳에서 검증할 수 있다. 6대6 은
`maxPlayers: 6` 인 별도 config 버전으로 표현되고, 같은 검증 규칙이 그대로 적용된다
(1-2-1 → 1-2-2 / 1-3-1). 대회 생성 시 종목·규격을 고르는 기존 흐름을 그대로 쓰면 되고
새 개념을 만들 필요가 없다.

다음 태스크 우선순위도 이 기준으로 다시 매긴다:
1. **(풋살 대회)** 포메이션을 competition config 에 추가 — 라인 배분 합 = `maxPlayers` 검증
2. **(풋살 대회)** 라인업 편집기에 대형 선택 + 슬롯 배치 UI (슬롯 라벨 = 골레이로/픽소/아라/피보)
3. **(풋살 대회)** E2E 하네스를 `/auth/dev-session` 쿠키 인증으로 전환 — 라이브 커맨드 검증
4. (후순위) 팀 매치 결과 입력의 득점자 지정 연결 — 대회 경로 계약 재사용

---

## 페르소나 여정 18건 검수 판정 (2026-08-04)

워크플로 verify 단계가 세션 한도로 실패해 판정이 비어 있던 18건을, 스크린샷을 직접 열어
하나씩 확정했다. 판정 근거는 이미지 또는 코드/실측이며, 추정으로 통과시킨 것은 없다.

### real — 이번 라운드에 수정 (5건)

| 지적 | 실제 원인 | 커밋 |
|---|---|---|
| 대회 디렉터가 경기를 운영하지 못함 (TAKEOVER_UNAVAILABLE) | **서버는 `granted` 를 주는데** 클라이언트 ack 콜백이 `result.token` 을 읽음. 서버 필드명은 `takeoverToken`. socket.io ack 은 타입 강제가 없어 tsc 미검출 | `26c227c1` |
| 팀·선수 공개 기록 헤더에 신원 없음 | 응답에 `teamName`/`nickname` 이 있고 `page.tsx` metadata 는 이미 사용 중이었는데 화면 헤더만 제네릭 | `4ee577ba` |
| 선수 공개 기록 데스크톱 헤더 통째 부재 | `desktopHead` 누락 (≥1024px 에서 `.tm-topbar` 숨김) | `4ee577ba` |
| 공개 기록 2화면의 셸 불일치 | 한쪽만 `bottomNav={false}` | `4ee577ba` |
| 팀 상세 사이드바가 소속 멤버에게 비멤버 문구 | 사이드바 분기에 `mode === 'mine'` 이 없었음 (본문에는 있었음) | `4ee577ba` |

### 이미 수정돼 있었고 이미지로 확인 (6건)

데스크톱 페이지 헤더 회귀 4건(일정 만들기·일정 수정·일정 상세·팀 전적), 운영 사이드바
결과 검토/결과 정정 노출, 일정 취소 어포던스. 사용자가 본 스크린샷이 수정 커밋보다
**52분 앞선 캡처**였다 — 재캡처로 전부 해소 확인.

### 오탐 (4건) — 근거

| 지적 | 근거 |
|---|---|
| 좌하단 플로팅 버튼이 왼쪽에 잘림 | Next.js dev 인디케이터. 캡처에서 숨기니 사라짐. 해당 화면은 멤버 권한이라 FAB 자체가 없음. 운영 사이드바의 "스로 돌아가기" 잘림도 동일 원인 |
| 스태프 표 "작업" 열 비어 있음 | `canRevoke()` 가 디렉터→디렉터 해제를 의도적으로 차단 |
| 라인업 "수정 마감" | QA 픽스처가 종료된 팀매치를 지목. 픽스처 교체로 해소 |
| 대진명 `Task 10 Home/Away` | QA 시드 이름, 프로덕션 경로 무관 |

### 하네스 결함 (3건) — 수정

증거 기본 출력이 `scripts/qa/persona-flows`(레포 트리 안)라 다른 세션 정리에 통째로
사라져 리뷰어가 8장만 보고 중단했다. 기본 경로를 트리 밖으로 옮기고, 수정 1건 확인에
41단계를 다시 걷지 않도록 `FLOW_ONLY` 페르소나 필터를 추가했다(오타 시 즉시 실패).
재캡처 123장, 실패 단계 0.

## F3 여정 상태 변화 — takeover 수정의 파급

`f3-review-receipt.json`(REJECT, 3/7)의 실패 사유 중 둘이 **"takeover 를 확보하지 못해"**
였다. 그 원인이 위 필드명 불일치였음이 확인됐고, 수정 후 실제로 뚫렸다:

- **E2E-TOUR-02**: 콘솔에서 `경기 시작` 실행 → `v1_games.state = LIVE`, `version = 1` 로
  전이(DB 실측). 화면도 `진행 중` 배지 + `일시 중지`/`경기 종료` 커맨드로 전환. 수정 전에는
  버튼이 비활성이라 시도 자체가 불가능했다.
- **E2E-TOUR-01**: 라인업 submit 이 요구하던 배타 토큰 경로가 함께 열렸다. 다만 해당
  픽스처에 제출된 선발 명단이 없어 SUBMITTED 리비전 도달은 별도 시드가 필요하다.
- **E2E-CORR-01**: 여전히 막혀 있다 — tuple-transition 이 요구하는 게이트 증거 번들
  생성기가 GitHub Actions 컨텍스트에 묶여 있어 로컬에서 만들 수 없다.
- **E2E-TEAM-02**: 화면 도달만 했고 승인 액션을 수행하지 않았다(하네스 한계).

즉 F3 는 3/7 → **5/7 이 가능한 상태**로 바뀌었으나 아직 7/7 이 아니므로 영수증 verdict 는
REJECT 를 유지한다. 통과시키려면 (a) 선발 명단 시드, (b) 승인 액션 실행,
(c) 증거 번들 생성기의 로컬 실행 경로가 필요하다.

## 범위 밖으로 기록한 것

- **스태프 표가 담당자를 UUID 앞 8자로 표시**: `V1TournamentStaffAssignment` 에 이름
  필드가 없어 백엔드 변경 필요.
- **`apps/v1_web/src/components/teams/team-detail-sections.tsx` 고아 파일**: 레포 전체
  참조 0(270줄·4 export). 타 세션 체크포인트 커밋 `8ea9177c` 에서 들어온 파일이라
  공유 트리 규칙에 따라 삭제하지 않고 보고만 한다.
- **편집 가능한 라인업 상태 커버리지 없음**: game 이 연결된 팀매치 4건이 전부
  `completed`/`ENDED` 다.

## 풋살 대회 실데이터 QA (2026-08-04, 추가)

빈 화면을 찍어 두는 것은 검증이 아니다. 풋살 5대5 명단을 DB에 넣고 콘솔에서 실제로
경기를 진행시켜 득점을 기록한 뒤 캡처했다.

- 시드: 양 팀 8명씩 `v1_game_participants` 16행(골레이로/픽소/아라/피보/교체),
  라인업 `SUBMITTED`, 팀명은 플레이스홀더 `Task 10 Home/Away` → `강남/성수 풋살 클럽`.
- 여정: `경기 시작` → `state=LIVE` → 골 4건 → **강남 3 : 1 성수**
  (2P 0' 정우진 / 6' 이준호 / 11' 조현우 / 17' 박서준). 웹소켓 ack + DB 실측.
- **신규 결함(수정함)**: 콘솔의 "기록한 이벤트" 가 서버 로그가 아니라 로컬 전송 큐를
  그리고 있어, 골 4건이 기록된 경기도 새로고침하면 "기록된 이벤트가 아직 없어요" 로
  보였다. 훅은 이미 `liveEvents` 로 확정 이벤트를 노출하고 있었고 콘솔이 렌더하지
  않았을 뿐이다. 서버 로그를 먼저 보여주고 큐는 "전송 상태" 로 분리했다.
- 정상 동작으로 확인한 것: 1피리어드 시각 골은 `EVENT_LATE` 로 거부(이미 2피리어드),
  공개 뷰의 득점자 이름 비공개(`isParticipantPubliclyEligible` 가 계정 연동 + 공개
  동의를 요구 — 시드 선수는 동의 이력 없음).
- 플래그 조작: `PUBLIC_LIVE` off → on (DB 데이터. 소유 코드 파일
  `game-operation-flags.ts` 는 건드리지 않음), `v1_game_visibility_policies.lineup_at` 설정.

## F3 재실행 결과 (2026-08-04, 갱신)

takeover 수정 이후 막혀 있던 여정을 실제로 밟아 **3/7 → 5/7** 로 올렸다.

| 여정 | 이전 | 현재 | 근거 |
|---|---|---|---|
| E2E-AUTH-01 | pass | pass | 스태프 배정 201, 화면 렌더 |
| E2E-TEAM-01 | pass | pass | 8단계 200, 결과 3:1 + 득점 타임라인 렌더 |
| E2E-TEAM-02 | fail | **fail** | 시드 팀매치 리비전 3건이 전부 OFFICIAL → 승인 대기 없음. 대기 상태를 만들려면 정정 경로(DIRECTOR_OFFICIALIZE 차단) 또는 terminal 불변식 우회가 필요해 수행 안 함 |
| E2E-TOUR-01 | fail | **pass** | 경기 종료 → rev1 SUBMITTED 자동 생성 → 결과 검토에서 승인 → DB `OFFICIAL` 확인, 큐 비워짐 |
| E2E-TOUR-02 | fail | **pass** | `경기 시작` → LIVE → 골 4건 ack → `경기 종료` → ENDED v6 |
| E2E-CORR-01 | fail | fail | DIRECTOR_OFFICIALIZE 게이트 증거 번들 생성기가 GitHub Actions 컨텍스트 종속. 플래그를 DB로 직접 바꾸면 게이트 자체를 우회하므로 안 함 |
| E2E-PUBLIC-01 | pass | pass | 공개 4화면 3폭 200, PUBLIC_LIVE on 에서 골 4건 노출 |

영수증 `f3-review-receipt-v3.json`(0444, sha256 `d34e0c6b…`)을 이번 라운드 증거
zip(`f3-qa-evidence-v2.zip`, 176 files, sha256 `ce7d4e1b…`)에 묶어 재발급.
게이트 실행 결과 `qa-evidence-provided` 는 **PASS 로 전환**됐고, 나머지 두 FAIL 은
5/7 이라는 정직한 verdict(REJECT)에서 나온 것이다.

### 게이트 설계 결함 #4 — F3 `live-surface-reachable` 는 현재 도달 불가

- 게이트는 3013/8121 을 **수동 probe** 만 한다("this gate never starts these services itself").
- 래퍼는 `--lifecycle-owner outer` 일 때 **포트가 비어 있을 것을 강제**한다
  (`FOREIGN_PORT_OWNER`, line 1277).
- 그런데 래퍼에는 web/api 를 기동하는 코드가 없다 — `pnpm` spawn 0건, `dockerRequired`
  11건으로 Docker/DB 만 관리한다.
- 결과: 포트를 비우면 probe 가 down, 스택을 띄우면 래퍼가 FOREIGN_PORT_OWNER 로 거부.
  **어느 쪽이든 `live-surface-reachable` 은 통과할 수 없다.**
- 앞서 "게이트는 포트 free 를 요구하고 캡처는 스택을 요구한다" 고 적었던 것은 F2 기준의
  부분적 서술이었다. F3 에서는 래퍼가 서비스를 띄워야 하는데 그 구현이 없는 것이 정확한 진단이다.
- 수정 방향: `--lifecycle-owner outer` 이고 finalGate==='F3' 일 때 래퍼가 포트 확인 직후
  web/api 를 기동하고 종료 시 정리하며, 그 사실을 lifecycle 영수증에 남긴다. 이번 세션에서는
  컨텍스트 여유가 없어 착수하지 않고 진단만 박제한다 — 절반만 고쳐 하네스를 깨뜨리는 것보다 낫다.

### 게이트 설계 결함 #4 — 해결 (2026-08-04)

위에 진단만 박제했던 `live-surface-reachable` 도달 불가를 래퍼에서 해결했다.
lifecycle 을 소유한 래퍼가 페이로드 직전에 web/api 를 기동하고 finally 로 내린다.

구현 중 실제로 부딪힌 두 가지:
- `pnpm` 에만 SIGTERM 을 보내면 `next-server` 손자가 살아남아 포트를 계속 물었다.
  다음 실행이 `FOREIGN_PORT_OWNER` 로 막히는 것으로 발견 — `detached: true` 로
  프로세스 그룹을 만들고 음수 pid 로 그룹째 종료, 포트가 풀릴 때까지 대기.
- 메인 레포 `node_modules` 에 Prisma 클라이언트가 생성돼 있지 않아 API 가
  `MODULE_NOT_FOUND: @prisma/client` 로 부팅 실패했고, 겉으로는 `8121:down` 만 남았다.
  기동 전에 `prisma generate` 를 한 번 실행한다.

실측 전후:

| | live-surface-reachable |
|---|---|
| 수정 전 | BLOCKED `3013:up 8121:down` |
| 수정 후 | **PASS** `3013:up 8121:up` (실행 종료 후 두 포트 자동 해제) |

F3 의 인프라 체크 4개(gate-identity / lifecycle-receipt-bound / live-surface-reachable /
qa-evidence-provided)가 모두 PASS 가 됐고, 남은 두 FAIL 은 5/7 이라는 **정직한 verdict**
에서만 나온다. 즉 이제 F3 는 "여정을 실제로 다 통과시키면 통과하는" 게이트다.

APPROVE 까지 남은 것: ① 팀매치 승인 대기 리비전을 정식 경로로 생성(E2E-TEAM-02)
② DIRECTOR_OFFICIALIZE 게이트 증거 번들의 로컬 생성 경로(E2E-CORR-01).

### E2E-TEAM-02 — 차단 사유 확정 (2026-08-04)

"승인 대기 상태가 없다" 는 추정이었는데, 정식 API 로 만들어 보면서 확정했다.
`POST /games/:id/result-revisions` 에 호스트(owner@teameet.v1) 자격으로 요청하자 도메인
불변식 세 개가 순서대로 방어했다.

| 시도 | 응답 | 의미 |
|---|---|---|
| 임의 스코어 3:2 | 422 `SCORE_EVENT_MISMATCH` — "Score does not match active goal events" | 스코어는 기록된 골 이벤트와 일치해야 한다 |
| 이벤트 기준 3:1, 카드 0 | 422 `SCORE_EVENT_MISMATCH` — "Participant card totals do not match active card events" | 카드 합계도 이벤트와 일치해야 한다(CARD 이벤트 1건, payload `{"card":"YELLOW"}`) |
| 골·카드 모두 이벤트에서 재집계 | 409 `RESULT_REVISION_ALREADY_EXISTS` — "A new draft requires a change-requested predecessor" | **새 초안은 직전 리비전이 보완 요청 상태여야만 만들 수 있다** |

시드 팀매치(0304)의 리비전 3건이 전부 OFFICIAL 이므로 승인 대기를 만들 정식 경로가 없다.
우회하려면 terminal 리비전을 직접 건드려야 해서 하지 않았다.

**이 여정을 통과시키려면** 게임이 아직 ENDED 되지 않은 팀매치 픽스처가 필요하다 —
대회 경기에서 확인했듯 `end` 커맨드가 SUBMITTED 리비전을 자동 생성하므로, 그 상태에서
상대팀이 승인하면 된다. 현재 game 이 연결된 팀매치 4건은 모두 이미 ENDED 다.

부수 소득: 결과 파이프라인의 무결성 규칙 3종이 실제로 작동함을 실행으로 확인했다.

### E2E-TEAM-02 — 통과 (2026-08-04). F3 5/7 → 6/7

앞 절에서 "시드 픽스처로는 불가" 로 확정했던 여정을, **정식 경로로 픽스처를 새로 만들어**
처음부터 끝까지 밟았다. 기존 팀매치를 건드리거나 terminal 리비전을 우회하지 않았다.

1. `POST /team-matches` — 팀매치 생성 시 game 이 함께 생성된다(`createFromSourceInTransaction`).
   → teamMatch `3a014d13-…`, game `a83b4514-…`, status `recruiting`, game `SCHEDULED v0`
2. 상대팀(0102, owner=host@teameet.v1) `POST /team-matches/:id/applications` → `requested`
3. 호스트 `POST /team-match-applications/:id/approve` → `approved`, teamMatch `matched`
4. 호스트 `POST /games/:id/result-revisions` → `DRAFT rev1`
5. 호스트 `POST /games/:id/result-revisions/:rev/submit` → **`SUBMITTED rev1`** (승인 대기)
6. 상대팀 `POST /games/:id/result-revisions/:rev/decision {decision:'approve'}`
   → **`OFFICIAL rev1`**, `current_official_revision_id` 포인터 설정(DB 실측)

도중에 확인한 사실:
- 팀매치 게임은 `game.takeover.request` 로 잡을 수 없다 — owner 도 admin(platform_ops) 도
  `STAFF_SCOPE_DENIED`. takeover 는 `resolveActor(..., 'tournament_command')` 를 쓰므로
  **대회 경기 전용 경로**이고, 팀매치는 호스트가 결과 리비전을 직접 올리는 별도 경로다.
- `regionId` 는 UUID 여야 한다. 시드의 `region-seoul-gangnam` 같은 슬러그 id 는 거부된다.
- 결과 결정 라우트는 `/decision` 이다(`/decide` 아님).

F3 영수증 v5(0444, sha256 `60d88f39…`) 로 갱신. **6/7**, verdict 는 여전히 REJECT —
남은 E2E-CORR-01 이 게이트 증거 번들 부재로 막혀 있기 때문이다.
게이트 재실행 결과 인프라 4체크 PASS 유지, 실행 후 포트 자동 정리 확인.

### E2E-TEAM-02 승인 화면 캡처 (2026-08-04, 갭 해소)

앞 절에서 "승인 직후 OFFICIAL 로 넘어가 대기 화면을 못 찍었다" 고 남긴 갭을 닫았다.
팀매치를 하나 더 만들어 SUBMITTED 에서 멈춘 상태로 3폭 캡처하고, 상대팀 계정으로
UI 의 "승인하기" 를 실제로 눌러 after 를 찍었다.

- Before: `제출된 결과예요. 확인 후 승인해 주세요` + `승인하기`/`정정 요청`, 이력 배지 `상대팀 승인 대기`
- After: `공식 결과로 확정됐어요` + `공식 확정` 배지 + 제출·확정 시각 병기, 승인 CTA 소멸
- DB: `SUBMITTED rev1` -> `OFFICIAL rev1` (UI 클릭으로 전이)
- teamMatch `84890168-…`, game `43c4f3d7-…`

이 매치는 골 이벤트가 없어 스코어가 `기록 없음` 으로 나온다 — 풋살 매치(강남 3:1 성수,
득점자·시각 포함)가 FULL 상태이고 이쪽이 같은 화면의 **EMPTY 상태**다.

도중에 확인한 계약: `POST /team-matches/:id/applications` 와 `/approve` 는 body 에
`clientCommandId` 를 넣으면 거부된다(Idempotency-Key 헤더만 사용). 이걸 모르고 넣었더니
신청이 조용히 실패했고, 이후 초안 생성이 `409 TEAM_MATCH_NOT_MATCHED` 로 막혀 원인을
한 단계 늦게 알았다 — 가드 자체는 정상 동작이다.

### E2E-CORR-01 — 차단 사유 정정 (2026-08-04)

앞서 두 번 "DIRECTOR_OFFICIALIZE 게이트 증거 번들 생성기가 GitHub Actions 컨텍스트에
묶여 로컬에서 만들 수 없다" 고 적었다. **코드를 읽어보니 틀렸다.** 정정한다.

`apps/v1_api/src/config/game-operation-flags.ts` 실측:

- `verifyRolloutReferences()` 는 `identity.phase !== 'R2'` 이면 `priorPhaseReceipt` /
  `deploymentManifest` / `publicProof` 가 있으면 오히려 실패시킨다
  ("Local gate bundle cannot mix rollout receipts"). 배포 매니페스트·public proof 는
  **R2 + PUBLIC_LIVE 전용** 요건이었다.
- 단일 키 전환은 `assertGatePhase()` 상 **phase 'C'** 를 요구한다. C 는 R2 가 아니므로
  로컬 번들 자체는 구성 가능하다.

**실제 차단 사유**는 `requiredGatesFor()` 다:

```
} else if (key === 'DIRECTOR_OFFICIALIZE') {
  add('V7',  'V7');
  add('V22', 'V22');
  add('V23', 'V23');
}
```

즉 이 전환은 선행 게이트 **V7 / V22 / V23** 의 영수증을 요구하고, 각각
`phase` 일치 · `verdict === 'accepted'` · mode 0444 · sha256 고정 · 정규 증거 루트 경로를
만족해야 한다(`readImmutableJson(..., requireGateRoot)` + `assertReceiptIdentity` +
`verifyLifecycleReferences`). 증거 루트
`/private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1` 를 실사한 결과
**V7/V22/V23 영수증이 하나도 없다.**

따라서 유일한 정식 경로는 그 세 게이트를 실제로 통과시키는 것이다. 번들을 손으로 만들어도
prerequisites 검증에서 막히고, 플래그 값을 DB 로 직접 바꾸면 전환 게이트 자체를 우회한다.

영수증 v6(0444, sha256 `c058c973…`) 에 이 정정을 반영했다. F3 는 여전히 6/7 · REJECT.

## F2 재실행 — domain-serial-reviews 통과 (2026-08-04)

미수행이던 **backend 도메인 리뷰를 실제로 수행**하고 migration 판정을 정정해 영수증 v2
(0444, sha256 `b1a43722…`)를 발급했다. 게이트 결과 `domain-serial-reviews` 가
**FAIL → PASS**, blocking 코드가 2개에서 1개로 줄었다.

### backend 리뷰 (수행함)

결과 파이프라인 무결성 3종을 정식 API 호출로 실행 검증:
`SCORE_EVENT_MISMATCH`(스코어↔골 이벤트), `SCORE_EVENT_MISMATCH`(카드 합계↔카드 이벤트),
`RESULT_REVISION_ALREADY_EXISTS`(새 초안은 change-requested 선행 리비전 필요).
권한 경계: `game.takeover` 는 `resolveActor(...,'tournament_command')` 이므로 팀매치 게임에는
팀 owner·platform_ops 모두 접근 불가 — 팀매치는 호스트 결과 리비전 경로로 분리돼 있다.
상대팀 승인 여정을 정식 API 로 완주(OFFICIAL + 포인터 확인).

발견 1건 — **GATEWAY-APPEND-ERROR-CORRELATION(minor)**: `appendGameEvent` 의 파싱 실패
경로가 `emitProtocolError(client, {code:'VALIDATION_ERROR'})` 로 `clientEventId`/
`expectedVersion` 없이 응답한다. 성공·도메인 실패 경로(`protocolError`)는 항상 넣으므로
클라이언트가 어떤 큐 항목이 실패했는지 상관지을 수 없다.

### migration 판정 정정

앞선 영수증의 "비축구 종목 행 때문에 alpha 배포가 무조건 중단된다" 는 **과장이었다**.
가드(DO 블록)가 기존 행을 스캔해 RAISE 하는 것은 사실이나, **API 계층이 같은 제약을 이미
강제한다** — running 종목 팀매치 생성을 실제로 시도하니 `409 COMPETITION_CONFIG_REQUIRED`
로 차단됐고(실측), 대회도 `competitionConfigVersionId` 핀을 요구한다. 새 위반 행은 생길 수
없고 dev DB 위반 행 수는 0. 남는 위험은 가드 도입 이전 레거시 행뿐이며 대상 환경에서만
확인 가능하므로 **배포 전 점검 항목**으로 남겼다(finding MIGRATION-LEGACY-ROW-PREDEPLOY-CHECK,
쿼리 포함).

### 게이트 설계 결함 #5 — legacy-writer-scan 은 통과 불가

`run-v1-final-gate.mjs:549` 의 `legacy-writer-scan` 은 **입력 경로 없이 하드코딩
`'blocked'`** 다("Left unchecked rather than faked"). 주석은 도메인 리뷰에서
"`apps/v1_api/src/games/adapters` 가 유일한 legacy/new 쓰기 스위치임을 확인하라" 고 하지만,
그 확인 결과를 게이트에 전달할 방법이 없다.

주석이 요구한 추적을 실제로 수행한 결과:

| 플래그 | 런타임 소비처 |
|---|---|
| `PUBLIC_LIVE` | `games.service.ts:550`, `public-tournament-records.service.ts:304` |
| `DIRECTOR_OFFICIALIZE` | `tournament-result-review.service.ts:834` |
| **`GAME_WRITE`** | **`games/migration/game-result-backfill.cli.ts` 뿐** — 요청 처리 경로 없음 |
| `apps/v1_api/src/games/adapters` | **존재하지 않음** |

즉 요청 경로에 GAME_WRITE 로 분기하는 쓰기 경로가 아예 없어 게이트가 상정한 "우회" 가
성립하지 않는다. 주석이 지목한 스위치 디렉터리도 만들어진 적이 없다.

수정 방향(미착수): grep 은 판단은 못 해도 **후보 열거**는 할 수 있다. `--legacy-writer-attestation`
입력을 받되 게이트가 "touched files 중 legacy 쓰기 심볼을 참조하는 파일 목록"을 grep 으로
뽑아 **첨부된 진술이 그 목록을 빠짐없이 덮는지** 대조하면, 사람이 각 지점을 판단하되 누락은
기계가 막는다. 단순 boolean 첨부(러버스탬프)와 다르다. 이번 세션에서는 컨텍스트가 부족해
설계만 남긴다.

## F2 통과 (2026-08-04) — 게이트 설계 결함 #5 해결

`legacy-writer-scan` 을 통과 가능한 검사로 바꾸고 진술서를 발급해 **F2 verdict APPROVE,
blocking 0** 을 받았다.

### 무엇이 문제였나

이 체크는 입력 경로 없이 하드코딩 `'blocked'` 이었다. 주석의 이유("grep 은 판단을 못 하니
가짜로 통과시키느니 막아두겠다")는 옳지만, 도메인 리뷰 결과를 게이트에 되돌릴 방법이 없어
**어떤 경우에도 통과할 수 없었다** — `live-surface-reachable`(결함 #4)과 같은 형태다.

### 해법 — 역할 분리

grep 은 판단은 못 해도 **후보 열거**는 신뢰할 수 있다. 게이트가 touched 파일에서 결과 테이블
writer 후보를 Prisma 모델 mutation + 원시 SQL 로 열거하고, 첨부 진술서가 그 후보를 **빠짐없이**
덮는지 대조한다. 각 지점 판단은 사람이, 누락은 기계가 막는다. 진술서는 리뷰 영수증과 같은
불변성 계약(0444 + sha256 고정)을 지고 항목마다 disposition + 실질 rationale 을 요구한다.

### 실측 (부정 대조군 포함)

| 입력 | 결과 |
|---|---|
| 진술서 없음 | BLOCKED, 후보 **35개** 열거 |
| **1개 누락 진술서** | **FAIL** — `attestation omits 1 enumerated call site(s): apps/v1_api/test/team-matches/team-match-game-adapter.integration-spec.ts:511` |
| 완전한 진술서(35개) | **PASS** — `35 enumerated call site(s) all attested` |

누락본이 통과했다면 이 검사는 무의미했다. 정확히 그 한 곳을 지목하며 막았다.

### 판정 결과 — new-path-canonical 11 / not-a-writer 24

프로덕션 writer 11곳(`games.service.ts` 8, `game-result-public-cache.service.ts` 2,
`game-result-official-facts.service.ts` 1)은 전부 신규 `v1_game_*` 테이블을 쓰며
`withNewWriteAuthority` 호출 0회다. **이는 우회가 아니라 대상이 아니기 때문** — GAME_WRITE 는
`game-result-backfill.cli.ts` 의 legacy/new 이중쓰기 전환만 지배한다. 나머지 24곳은 통합 테스트
픽스처다.

분류 어휘에 `new-path-canonical` 을 추가했다. 기존 3종(`gated`/`legacy-intentional`/
`not-a-writer`)으로는 위 사실을 표현할 수 없어 억지 라벨링을 강요했고, 그 강요가 곧
러버스탬프다. 후보 목록 절단(slice 30)도 제거했다 — 리뷰어가 볼 수 없는 지점이 있으면 완전한
진술서를 쓸 수 없다.

### F2 최종

```
PASS  gate-identity / ledger-parses / touched-files-diff / debt-marker-scan
PASS  domain-serial-reviews
PASS  legacy-writer-scan
verdict APPROVE | blocking []
```

## E2E-CORR-01 — 최종 결론 (2026-08-04): 미구현 기능이라 통과 불가

이 여정의 차단 사유를 세 번에 걸쳐 좁혔고, 이번에 확정했다.

1. (오류) "게이트 증거 번들 생성기가 GitHub Actions 에 묶여 있다" — `verifyRolloutReferences`
   실측 결과 그 제약은 **R2 + PUBLIC_LIVE 전용**이었고 단일 키 전환(phase C)은 로컬 번들이 가능하다.
2. (부분) "선행 게이트 V7/V22/V23 의 accepted 영수증이 없다" — 증거 루트 재귀 전수로 0건 확인.
   하지만 *왜* 없는지가 빠져 있었다.
3. **(확정)** `--task N` 이 gateId `V{N}` 을 만든다(`run-v1-task-verification.mjs:319`).
   계획서 체크박스 실측:

   ```
   [x]  7. Implement scoped staff authorization, stable field/court scope, and actor-neutral audit
   [ ] 22. Implement tournament result review, officialization, corrections, and next-fixture safety
   [ ] 23. Build tournament result review and correction interfaces
   ```

   즉 **태스크 22·23 은 아직 구현되지 않았다.** 그 둘이 만드는 것이 바로 "대회 결과 검토·
   officialization·정정" 이고, E2E-CORR-01 이 검증하려는 기능이다.

따라서 `DIRECTOR_OFFICIALIZE` 전환 게이트가 V22/V23 영수증을 요구하는 것은 **시스템이 미구현
기능의 활성화를 정확히 거부하고 있는 것**이다. 게이트 결함이 아니라 의도된 안전장치다.

E2E-CORR-01 은 해당 기능이 구현되고 그 태스크 게이트가 통과한 뒤에야 수행할 수 있다. 이 세션에서
통과시키는 유일한 방법은 플래그를 DB 로 직접 켜는 것뿐이고, 그건 게이트 자체의 무력화다.

부수 관찰: 태스크 7 은 `[x]` 인데 증거 루트에 V7 영수증이 없다. 완료 표시와 바인딩된 영수증이
어긋나 있으므로, DIRECTOR_OFFICIALIZE 를 켜려면 V7 도 다시 확보해야 한다.

### F3 최종

```
PASS  gate-identity / lifecycle-receipt-bound / live-surface-reachable / qa-evidence-provided
FAIL  qa-evidence-content-reviewed / manual-qa-journeys-performed   (6/7)
```

인프라 4체크는 모두 통과한다. 남은 1 여정은 **미구현 기능 대기**이므로 6/7 · REJECT 가 이 시점의
정직한 최종 상태다.

## GATEWAY-APPEND-ERROR-CORRELATION 해소 (2026-08-04)

F2 backend 도메인 리뷰에서 찾아 `open` 으로 남겼던 finding 을 닫았다. 찾아만 놓고 두는 것은
기술부채라, 같은 라운드에서 해결한다.

`appendGameEvent` 의 파싱 실패 경로만 `{code:'VALIDATION_ERROR'}` 를 그대로 반환해
`clientEventId`/`expectedVersion` 이 빠져 있었다. 성공 경로와 도메인 실패 경로(`protocolError`)는
항상 둘을 싣기 때문에, 클라이언트 큐는 **파싱 실패한 항목만** 어떤 것이 실패했는지 알 수 없어
재시도·실패 표시를 붙이지 못한다. 이 세션에서 실제로 원인 추적이 한 단계 늦어졌다.

검증을 통과하지 못한 입력이므로 의미는 신뢰하지 않는다 — 타입이 맞는 경우에만 그대로 되돌리고,
어긋나면 싣지 않는다. 잘못된 큐 항목을 실패로 표시하게 만드는 것보다 안 싣는 편이 낫다.

실측(웹소켓 ack 3케이스):

| 입력 | ack |
|---|---|
| 상관관계 필드 온전 | `{"code":"VALIDATION_ERROR","clientEventId":"80d66af3…","expectedVersion":3}` |
| `clientEventId` 가 숫자 | `{"code":"VALIDATION_ERROR","expectedVersion":3}` |
| payload 가 객체 아님 | `{"code":"VALIDATION_ERROR"}` |

커밋 후 F2 재실행 결과 **APPROVE 유지, blocking 0** — 새 커밋이 결과 테이블 writer 를 추가하지
않아 legacy-writer 후보 35개와 진술서가 그대로 맞는다. 게이트가 커밋을 따라가면서도 통과한다는
것을 확인한 셈이다.

## 스태프 표 담당자 신원 표시 (2026-08-04) — 미룬 판단의 정정

F2 도메인 리뷰에서 "표가 담당자를 `userId` 앞 8자로만 보여줘 누가 누구인지 알 수 없다" 를
찾아 두고 **"백엔드에 이름 필드가 없어 불가"** 로 미뤄 뒀었다. 그 판단이 틀렸다.

- `v1_user_profiles.nickname` 이 이미 존재한다
- `V1TournamentStaffAssignment.user` → `V1User.profile` 관계도 스키마에 이미 있다
- 따라서 **`prisma/` 를 건드리지 않고** 이을 수 있었다 (그 디렉터리는 이 작업의 금지 대상)

제약을 확인하지 않고 "불가" 로 단정한 것이 원인이다. 미룬 finding 은 다시 열어 확인해야 한다.

### 변경

- 조회 select 에 `user.profile.nickname` 을 더하고 결과에 `nickname` 을 싣는다 —
  grant/revoke 경로(`TournamentStaffService`)와 목록 경로
  (`TournamentOperationsStaffService`) **양쪽**
- 닉네임이 있으면 이름을, 없으면 종전 식별자 조각을 보여준다. 공개 신원으로 쓸 수 있는 값은
  닉네임뿐이므로(D-03/D-11) 다른 값으로 대체하지 않는다
- 해제 확인 모달도 누구를 해제하는지 이름으로 밝힌다

### 테스트가 내 누락을 잡았다

계약 테스트를 먼저 붙였더니 **첫 수정이 데스크톱 표만 덮고 모바일 카드를 빠뜨린 것**이
드러났다 — 같은 행을 두 경로가 그리는데 한쪽만 고쳤다. 라이브 확인만 했다면 데스크톱
스크린샷만 보고 완료로 넘겼을 누락이다.

| 검증 | 결과 |
|---|---|
| 부정 대조군(데스크톱 표만 되돌림) | 1 failed / 6 passed |
| 복원 | 7 passed |
| 백엔드 staff 스펙 | 6 suites / 41 tests |
| 웹 전체 스위트 | 157 files / 980 tests |
| tsc (api / web) | 0 / 0 |
| 라이브 화면 | `61ad91f7…` → **운영자** (3폭 캡처, PR 게시) |

### F2 회귀 없음

이 변경 뒤 F2 를 다시 돌려 **APPROVE / blocking 0** 유지를 확인했다. legacy-writer 후보가
35개 그대로여서 기존 진술서가 계속 유효하다 — 결과 테이블 writer 를 추가하지 않았기 때문이다.
게이트가 커밋을 따라가면서도 통과한다는 것을 두 번째로 확인한 셈이다.

## 세션 종료 시점 상태 (2026-08-04)

| 게이트 | 결과 | 남은 조건 |
|---|---|---|
| F1 | **APPROVE** (10/10) | — (게이트 스크립트 2회 수정 후 회귀 없음 재확인) |
| F2 | **APPROVE** (blocking 0) | — (커밋 추가 후 2회 재확인, legacy-writer 후보 35개 유지) |
| F3 | REJECT (여정 6/7) | 태스크 22·23 구현 후 V22/V23 게이트 통과 |
| F4 | 미실행 | `dev` 머지 — 사용자만 수행하는 승격 |

CI: `codex/teameet-task9-ci` head `a571d96d` 에서 run 30906890972 **success**
(API / Gates / Web 3 job). 스태프 닉네임 기능까지 포함된 상태다.

### 이 세션이 해결한 게이트 설계 결함 2건

| # | 증상 | 해결 |
|---|---|---|
| #4 | F3 `live-surface-reachable` 이 구조적으로 통과 불가 | 래퍼가 페이로드 직전 서비스 기동 → finally 정리. 프로세스 그룹 종료 + prisma generate 선행. 연속 2회 재현 |
| #5 | F2 `legacy-writer-scan` 이 하드코딩 blocked | grep 이 후보 열거, 진술서가 완전성 충족을 증명. 부정 대조군(1개 누락 → FAIL)으로 검증 |

두 결함 모두 "판단할 수 없으니 막아둔다" 는 옳은 의도가, **판단 결과를 게이트에 되돌릴 경로가
없어** 영구 차단이 된 경우였다. 역할을 나눠(기계=열거·완전성, 사람=판단) 통과 가능하게 만들었다.

### 정정한 오판 4건

진행 중 틀리게 보고했다가 코드·실측으로 바로잡은 것들이다. 판단을 미루거나 단정하기 전에
확인해야 한다는 교훈이 각각 붙는다.

1. "좌하단 플로팅 버튼 잘림" → Next.js dev 인디케이터. 앱 UI 가 아니었다.
2. "migration 이 alpha 배포를 무조건 중단시킨다" → API 가 같은 제약을 이미 강제한다
   (running 팀매치 생성 시 `409 COMPETITION_CONFIG_REQUIRED` 실측). 남는 위험은 레거시 행뿐.
3. "DIRECTOR_OFFICIALIZE 증거 번들이 GitHub Actions 종속" → R2 + PUBLIC_LIVE 전용 제약이었다.
   실제 차단은 태스크 22·23 미구현.
4. "스태프 이름 표시는 백엔드 필드가 없어 불가" → `v1_user_profiles.nickname` 과 관계가
   이미 있었고 금지 대상(`prisma/`)을 건드리지 않고 가능했다.

### 테스트 격차 정리

세션 시작 시 내가 만든 변경 중 전용 테스트가 없는 파일이 9개였고, 6개를 닫았다. 남은 3개는
`use-v1-game-operations-console.ts`(공유 타입 파생이 컴파일 타임 가드)와 `scripts/qa/*.mjs`
3개(부정 대조군 실행으로 검증)다. 모든 신규 테스트는 부정 대조군으로 "되돌리면 깨지는지" 를
확인했다 — 구현을 되읊는 테스트를 넣지 않기 위해서다.

## Task 23 경량 감사 (2026-08-05) — 호스트 swap 압박으로 가벼운 방식 선택

Task 22 전체 gap 해소 후, 같은 세션 초반에 "Task 23도 유사하게 이미 존재하나 별도 검증
중"으로 남겨뒀던 것을 스팟체크했다. 이 시점 호스트 swap이 11.7GB/12.3GB(여유 599MB)까지
찬 상태였고 내 세션이 만든 잔존 프로세스·DB는 없어(다른 세션들의 부하로 추정) 격리 DB를
새로 만드는 무거운 서브에이전트 디스패치 대신 **직접 읽기 전용으로** 점검했다.

- `apps/v1_web/src/components/tournament-result-review/*`(8개 컴포넌트) 중 전용 단위 테스트
  파일은 0개지만, `apps/v1_web/src/app/tournament-ops/result-review.test.tsx`(579줄, 22
  테스트, 이전 턴에 22/22 통과 실측)가 페이지 레벨 통합 테스트로 이 컴포넌트들을 실제
  사용자 흐름 그대로 묶어서 검증한다.
- 스펙 QA scenario(플랫폼운영자/디렉터/운영자 visibility, approve/reject/correction,
  director void hidden/disabled↔visible+confirmed 플래그 게이팅, permission revoke)는
  22개 테스트와 거의 1:1로 대응 — 파일:설명 대조는 이전 턴 grep 결과 참조.
- **미확인 2건**: ① "projection failure remains pending/retryable"의 정확한 시나리오 매칭
  여부(유사한 "VERSION_CONFLICT retryable" 테스트는 있으나 이름이 다름), ② "tablet/desktop
  focus and sticky context"는 Vitest(jsdom)로는 원천적으로 검증 불가능한 반응형/시각 항목 —
  원 스펙상 별도 V26 게이트(헤디드 768×1024/1440×900) 소관이라 이 세션 범위 밖으로 남긴다.
- 결론: Task 23는 실측 기준으로 **실질적으로 완성**돼 있고 명백한 gap은 없다. 위 2건은
  깊은 결함이라기보다 검증 방식의 한계이므로, 필요하면 후속 세션에서 라이브 스크린샷으로
  마저 확인하면 된다.

## PR #249 — dev 머지 충돌 해소 + 자기 정정 기록 (2026-08-05)

Task 22·23 검증 완료 후 PR #249 상태를 재확인하다 `mergeable: CONFLICTING`을 발견했다.
`dev`가 이 브랜치(`codex/teameet-task9-ci`)의 merge-base 대비 1커밋(`47c39098 fix(v1/matches):
harden create and edit contracts`) 앞서 있었고, `apps/v1_api/src/team-matches/team-matches.service.ts`
에서 실제 비즈니스 로직이 텍스트 충돌했다.

### 해소한 진짜 충돌
dev의 신규 검증("sportId는 host team의 실제 sport와 일치해야 함", create+update 양쪽)과
이 브랜치의 기존 불변식("Game 경쟁설정이 pin된 이후 sportId 변경 자체 금지",
`COMPETITION_CONFIG_IMMUTABLE`)이 `update()`에서 충돌했다. 단순히 순서를 정하는 문제가
아니라 dev가 새로 추가한 테스트("host team 종목과 다른 종목으로 변경할 수 없다")가 어느
체크가 먼저 발화해야 하는지 실제로 명시하고 있었다 — **host-team 일치 체크를 먼저**, pin
불변식을 그 뒤에 두도록 정했다. 기존 pin 불변식 테스트는 `hostTeam` mock이 아예 없어
재정렬 즉시 `TypeError`로 깨졌던 것을 발견해 mock을 보정했다(`hostTeam.sportId`를 시도하는
`dto.sportId`와 일치시켜 host-team 체크를 조용히 통과시키고 순수하게 pin 규칙만 검증).

검증: 격리 임시 worktree(`/tmp`, 기존 worktree 어디도 건드리지 않음)에서 정확히 이 병합
트리를 체크아웃해 `tsc --noEmit` clean, `apps/v1_api` 유닛 테스트 전체 **1499/1499 통과**
(129 스위트) 확인. `git merge-base`/private index(`GIT_INDEX_FILE`)로 실제 워킹트리·인덱스는
전혀 건드리지 않고 처리했다. 병합 커밋 `bdec5b90`(부모: task9-ci tip + dev tip) →
`codex/teameet-task9-ci`에 직접 push, PR #249 `mergeable: MERGEABLE`로 복구 확인.

### 자기 정정 — cwd 드리프트로 인한 오판 (교훈)
충돌 조사 중 "`complete()` 팀매치 완료 메서드 전체가 오늘 회귀로 사라졌고 프론트는 여전히
호출 중이라 지금 깨져 있다"고 잘못 결론 내리고 **사용자에게 복구 승인까지 받았다.** 이후
`git show <ref>:<path>`(cwd 무관, 항상 정확)로 재검증하자 실제로는 정반대였다 — 프론트
코드(`team-matches-client.tsx`)에 `// Task 16 removed the standalone "complete" mutation —
completion is now an atomic side effect of the host submitting a validated result revision`
라는 명시적 주석이 있었다. **Task 16이 의도적으로 재설계**한 것이었고 프론트는 이미 새
설계를 따르고 있어 아무것도 깨져 있지 않았다.

원인: 셸 cwd가 어느 시점에 `task-27` 워크트리에서 **메인 체크아웃 루트**로 흘러갔고
(이 저장소는 태스크마다 별도 워크트리 30여 개를 쓰는 구조), 그 이후 `git status`/
`git log`(ref 미지정, `HEAD` 암묵 참조)/상대경로 `grep` 같은 **cwd-종속 명령**이 task-27이
아니라 메인 체크아웃의 다른 브랜치를 가리켜 "task-27 vs task9-ci 비교"가 실제로는
"[메인 체크아웃의 현재 브랜치] vs task9-ci 비교"로 뒤바뀌었다. `git show ref:path`처럼
**ref를 명시하는 명령은 cwd와 무관해 전 과정에서 정확**했다 — 그래서 dev-merge-conflict
본 조사(전부 `git show`/`git diff <ref1> <ref2>` 기반)는 오염되지 않았고, complete() 관련
지엽 조사(순수 `grep`/`git status`/`HEAD` 암묵 참조)만 오염됐다.

**교훈**: 30여 개 worktree가 공존하는 이 저장소에서는 상대경로·`HEAD` 암묵 참조·
`git status`처럼 **cwd에 의존하는 명령을 쓰기 전 반드시 `pwd`로 위치를 확인**한다. 사실관계
확인이 필요하면 `git show <구체적 ref>:<path>` 형태를 기본으로 쓴다. 오판을 발견한 즉시
사용자에게 승인 자체가 잘못된 전제에 기반했음을 정정하고, 실행하지 않았다(전역 규칙: 사용자
승인이 있어도 그 전제가 무너지면 재확인 없이 진행하지 않는다).

## 페르소나 여정 1차 검수 18건 재검수 (2026-08-05) — verify 단계 세션 한도 미완료분 대체 수행

1차 여정 검수 워크플로(`wf_ec5745c6-7bb`)가 owner(7)/platform_ops·tournament_director(5)/
visitor·host(5)/manager(1) = 18건의 finding을 냈다. 오탐 제거를 맡은 verify 에이전트가
세션 한도로 `result` 없이 중단됐다(`journal.jsonl`에 `started`만 있고 `result` 없음).
직접 Read/라이브 재현으로 18건 전건을 재검수했다.

### 확정된 실결함 — 1건 수정, 1건 문서화

- **visitor-03(공개 대회 경기 일정 페이지, desktop)** — `AppChrome`에 `desktopHead`가
  빠져 있어 대회명을 포함한 `title`(h1)이 데스크톱에서 아예 렌더되지 않고, 화면엔 콘텐츠
  내부의 "경기 일정" 섹션 라벨(제네릭, 대회명 없음)만 보였다. 공유 링크로 바로 들어온
  방문자가 화면만 보고는 어느 대회인지 알 수 없었다. **수정 완료**
  (`apps/v1_web/src/app/tournaments/[id]/schedule/schedule-page-client.tsx`,
  로딩/에러/성공 3개 분기 모두에 `desktopHead` 추가, 라이브 스크린샷으로 대회명 표시 확인,
  `public-game-records.test.tsx` 23/23 통과, tsc 0).
- **(신규 발견, 문서화만)** 대회 운영 보드(`/tournament-ops/tournaments/:id/operations`)의
  경기 행이 클릭 불가능하다 — 실제 경기 운영 콘솔(`/fixtures/:fixtureId/operate`)로 가는
  진입 경로가 UI 어디에도 없고 직접 URL 입력만 가능하다. tournament_director-02를
  재현하려다 발견. 라우팅/온보딩 설계 판단이 필요해 이번 세션에서는 고치지 않고 기록만 남긴다.

### 오탐(재현 안 됨) — 10건

- **owner-03/05/06/07(major, header 없음 주장 4건)** — 일정 만들기·수정·팀 전적·라인업
  desktop 스크린샷 전부에서 "← 타이틀" 헤더가 명확히 존재. 라이브 재현 시도 결과
  4건 모두 오탐(원 검수가 참조한 캡처가 손상/오염됐을 가능성 — 아래 환경 이슈 참고).
- **tournament_director-02(TAKEOVER_UNAVAILABLE)** — 원 finding이 지목한 "Task 10
  Home vs Task 10 Away" 경기와 별도의 종료된 경기 콘솔 2곳 모두에서 재현 안 됨(둘 다
  "종료"+"실시간 연결됨" 정상 표시, 에러 배너 없음). medium confidence였고 재현 실패.
- **platform_ops-03/04(결과 검토·결과 정정 = 고아 라우트 주장)** — 사이드바에 "결과 검토"
  "결과 정정" 링크가 실제로 존재(`/result-review`, `/records/corrections`). 오탐.
- **platform_ops-01(하단 아바타가 "서비스로 돌아가기" 텍스트를 가림)** — `document.querySelector`로
  실제 DOM 검사 결과 그 링크는 아이콘(chevron-left)+텍스트만 있고 아바타 요소가 없다.
  겹쳐 보인 원형 "N" 아바타는 **캡처에 쓰인 브라우저 자동화 도구 자체의 오버레이**이지
  제품 UI가 아니다 — 이 세션 전체에서 찍은 모든 스크린샷에 동일 위치·동일 문자로
  나타나 페르소나·페이지와 무관함을 확인.
- **visitor-06(팀 전적/선수 기록 모바일 셸 불일치)** — 두 페이지 모두 동일한 셸
  (뒤로가기+제목+벨 아이콘 헤더, 하단 플로팅 탭바)을 사용. 라이브 재캡처로 불일치 없음 확인.
- **manager-01("신청 전..." 배너가 이미 활성 매니저에게 노출)** — 현재는
  "이미 이 팀의 멤버예요. 운영 메뉴에서 팀을 관리해요." + "팀 채팅" CTA로 역할 인지형
  문구가 정상 노출됨. 재현 안 됨.

### 정상 설계로 확인(결함 아님) — 2건

- **owner-07(minor, 라인업 편집 불가)** — "경기가 시작되어 라인업이 잠겼어요" +
  "잠김" 배지 재현됨. 원 finding도 이미 low confidence로 "QA 픽스처가 이미 종료된
  매치를 대상으로 잡았을 가능성"을 자체 표시했고, 실제로 이미 시작된 경기의 라인업을
  잠그는 것은 의도된 동작이다.
- **visitor-04(경기 상세 스코어보드에 "Task 10 Home"/"Task 10 Away" 영어 이름)** —
  tournament_director-02 재현 과정에서 동일 이름이 실제로 나타나는 걸 확인. Task 10
  백필 시드 데이터의 fixture 아티팩트이며 원 finding도 low confidence로 이 가능성을
  자체 표시했다. 프로덕션 버그 아님.

### 환경 이슈로 미검증 — 3건(그대로 유지)

- **host-01(host 페르소나 0/4, 3개 뷰포트 전부)**, **visitor-01(tablet 전체 + mobile
  일부)**, **owner-08(경기 결과 입력)** — 세 건 모두 검수 도중 공유 워크트리에서
  `scripts/qa/persona-flows` 디렉터리 전체가 사라졌다는 동일 원인(다른 세션의 캡처
  스크립트 재실행 추정). 이번 세션에서 그 디렉터리를 재확인했으나 여전히 없음
  (`No such file or directory`) — 재캡처 없이는 검증 불가능한 순수 도구/환경 이슈이며
  UI 결함이 아니다. 재캡처 후 재검수 필요.

### owner-04 — 최초 "확정" 판단을 스크린샷 오독으로 재정정

`computeStyle`로 실제 DOM 검사 전에는 "일정 취소" 버튼에 테두리가 없다고 오판했다.
`getComputedStyle` 결과 `border: 1px solid rgb(229, 232, 235)`(연한 회색)가 실제로
적용돼 있었고, 코드에도 이미 이 배색 선택 이유를 설명하는 주석이 있었다(danger 색을
꽉 채우지 않고 outline만 주는 의도적 절제). 압축된 스크린샷에서 연한 회색 테두리가
거의 안 보여 "테두리 없음"으로 오독한 것 — **코드 변경 없음**. computed style 확인
없이 스크린샷만으로 "결함 확정" 판단하지 않는다는 교훈.

## 환경 이슈로 미검증이었던 3건 재검수 + owner-08 실결함 추가 발견 (2026-08-05)

18건 재검수 완료 보고 이후, `run-v1-persona-flows.mjs`의 기본 출력 경로가 이미
`/private/tmp/teameet-ulw-evidence/persona-flows`(레포 밖, 공유 워크트리 정리에도
안전)로 바뀌어 있고 그 경로에 8/4 캡처본이 온전히 남아있는 것을 발견했다. 이걸로
직접 Read해서 host-01~04, visitor 전체 tablet, owner-08 미검증 3건을 마저 검수했다.

**host-01~04**: 전부 정상(FULL 상태, 헤더·데이터 정상 렌더). 결함 없음.

**visitor tablet 전체(01~06)**: 전부 정상. visitor-03(대회 일정) tablet은 원래도
헤더가 정상이었다 — 이번에 고친 desktop 전용 결함이었음을 재확인. visitor-06(하단
탭 불일치 주장)도 tablet에서 재확인 결과 오탐 그대로.

**owner-08(경기 결과 입력) — 실결함 추가 발견**: `flow-observations.json`의
`bodyText`를 뷰포트별로 비교하니 mobile/tablet엔 "경기 결과 입력" 타이틀 텍스트가
포함되는데 desktop bodyText엔 아예 없었다. 라이브 재현(`/team-matches/304/result`)
으로 확인 — desktop에서 뒤로가기+제목 헤더가 렌더되지 않고 nav바 바로 아래 콘텐츠가
시작됨. 원인은 `team-match-result-client.tsx`의 `AppChrome` 호출 9개(입력 5분기 +
승인 4분기) 전부에 `desktopHead`가 빠져 있던 것 — visitor-03과 동일 패턴. 9개 전부
수정, `team-match-result-client.test.tsx` 17/17 통과, tsc 0, 라이브 스크린샷으로
헤더 표시 확인, PR #249에 갤러리 게시.

**부수 발견(코드 결함 아님, 문서화만)**: 팀매치 목록 필터 탭에 "Football"(영문,
미번역)이 섞여 있다. 원인: `game-result-backfill.cli.ts:153`이 **격리된 DB**에서
쓰라고 `code: 'football', name: 'Football'`을 하드코딩하는데, 이 CLI가 공유 dev
DB(`teameet_v1_pg_flow`)에 실행되면서 그 시드 행이 실사용자 화면에 노출됐다. 실제
팀 2개·팀매치 2개·대회 1개가 이 sport row를 참조 중이라 삭제하면 FK가 깨진다 — DB
조작 금지 원칙에 따라 데이터는 건드리지 않고 원인만 기록한다. 프로덕션/격리된
seed에서는 재현되지 않는 dev-DB 오염이다.

## `AppChrome desktopHead` 누락 패턴 — 3번째 재현 + 전역 스캔 (2026-08-05)

owner-08을 고친 직후, 같은 저장소의 다른 F3 하네스(`run-v1-f3-manual-qa.mjs`)가 만든
`public_records-*` 캡처(18건 목록 밖, 화면 단위 증거)도 겸사겸사 열어보다가 세 번째
재현을 찾았다: **public_records-02(공개 대회 경기 상세)** — `flow-observations.json`
bodyText가 mobile/tablet엔 "경기 기록" 타이틀을 포함하는데 desktop만 없었다. 라이브
재현 후 `match-page-client.tsx`의 `AppChrome` 3개 분기 전부에 `desktopHead`가 빠진
것을 확인, 추가·검증(`public-game-records.test.tsx` 23/23, tsc 0, 라이브 스크린샷)·
커밋·머지·갤러리 게시까지 완료.

같은 패턴이 3번(visitor-03, owner-08, public_records-02) 나온 시점에 전역 스캔을
돌렸다: `<AppChrome` 호출 대비 `desktopHead` 개수가 다른 파일이 **37개** 더 있다
(`grep -c` 파일 단위 비교, `.github/tasks` 아님 — 정확한 목록은 이 세션의 스캔
로그 참고). 다만 이 37개를 전부 "동일 결함"으로 단정하지 않았다 — `home/loading.tsx`,
`not-found.tsx`처럼 애초에 데스크톱 h1 타이틀이 필요 없는 페이지도 섞여 있고,
어떤 페이지가 "공유 링크로 바로 들어왔을 때 대상 식별이 안 되는" 진짜 결함인지는
페이지별 UX 판단이 필요하다. **이번 세션 범위(18건 재검수 + 사용자가 지목한 화면)를
벗어나는 별도 스코프**로 판단해 지금 전부 고치지 않았다 — 전역 규칙 13(scope 자율
확장 금지)에 따라 사용자 확인 후 진행할지 결정한다. 다음 세션/사용자 지시 시 참고할
후보 파일 37개는 이 세션 로그에 grep 명령으로 재생성 가능:
`grep -rln "<AppChrome" apps/v1_web/src --include="*.tsx" | grep -v "\.test\."` 후
파일별 `<AppChrome` 개수와 `desktopHead` 개수를 비교.

### 37개 후보 1차 분류 (코드 변경 없이 조사만, 2026-08-05)

각 파일의 `AppChrome title="..."` 값을 뽑아 세 그룹으로 나눴다. 아직 하나도 라이브
재현하지 않았다 — 이건 우선순위 후보일 뿐, 확정된 결함이 아니다.

**A그룹 — 목록/로딩/404류, desktopHead 불필요 가능성 높음(nav 탭 자체가 컨텍스트)**:
`home/loading.tsx`, `not-found.tsx`, `matches/loading.tsx`, `team-matches/loading.tsx`,
`teams/loading.tsx`, `tournaments/loading.tsx`, `tournaments/page.tsx`,
`tournaments/[id]/loading.tsx`, `home-page.tsx`, `matches-page.tsx`,
`team-matches-page.tsx`, `teams-page.tsx`, `notices-page.tsx`, `community-page.tsx`
— title이 전부 고정 제네릭 텍스트("매치"/"팀"/"공지사항" 등)이고 그 자체가 목록
페이지의 정체성이라 대상 식별 문제가 원천적으로 없을 가능성이 높다.

**B그룹 — 공유 링크로 들어올 수 있는 개체 상세/기록형, 결함 가능성 높음(우선 확인 대상)**:
- `tournaments/[id]/tournament-detail-client.tsx` — title이 "대회 상세"로 고정된
  제네릭 문자열이다. visitor-03/owner-08/public_records-02와 정확히 같은 패턴
  (대회 상세 페이지인데 대회명이 title에 없음)일 가능성이 가장 높다 — 1순위 확인
  대상.
- `public-profile-client.tsx` — title이 "프로필"로 고정. 특정 사용자의 공개
  프로필인데 닉네임이 title에 없다 — 2순위 확인 대상.
- `matches/[id]/applications/client.tsx`("신청자 관리"), `tournaments/[id]/apply/...`
  ("참가 팀 선택"), `.../my/my-registration-client.tsx`("선수 명단"),
  `.../awards/awards-page-client.tsx`("시상·리뷰"),
  `.../registrations/[registrationId]/roster/...`("선수 명단"),
  `.../bracket/bracket-page-client.tsx`("순위·브래킷"),
  `.../reviews/reviews-page-client.tsx`("참가팀 후기"),
  `.../results/results-page-client.tsx` — 전부 특정 대회/매치에 종속된 하위
  페이지라 상위 tournament-detail과 같은 원인(대회명 누락)을 공유할 가능성이 있다.

**C그룹 — 본인 전용(my/설정) 페이지, 낮은 우선순위**: `my-page.tsx`,
`my-inquiries-client.tsx`, `my-api-clients.tsx`, `search-experience.tsx`,
`phone-verify-page-client.tsx`, `reviews-page.tsx`, `events/page.tsx` — 본인만
보는 화면이라 "공유 링크로 들어온 제3자가 대상을 모른다"는 문제가 상대적으로
약하다.

**다음 세션 제안 순서**: B그룹부터, 특히 `tournament-detail-client.tsx`를 라이브
재현한 뒤 실제 결함이면 나머지 B그룹 하위 페이지들이 같은 원인을 공유하는지
함께 확인 — 이번 3건과 동일하게 개별 커밋·테스트·라이브 검증·갤러리 게시로
진행.

**`tournament-detail-client.tsx` 라이브 재현 결과(2026-08-05) — 1순위에서 강등**:
데스크톱에서 실제로 재현해보니 `desktopHead` 부재로 topbar 타이틀은 여전히
제네릭 "대회 상세"이지만, 그 바로 아래 카드에 대회 로고+이름("플로우 QA 대회")이
이미 크게 렌더돼 있어(성공 분기의 `title={data.title}` h1과는 별개로, 콘텐츠 자체가
대회 아이덴티티를 보여줌) owner-03/visitor-03처럼 "어느 대회인지 화면만으로 알 수
없다"는 실사용 문제가 없다. **코드 변경 안 함** — B그룹에서 낮은 우선순위로
재분류. 나머지 B그룹 하위 페이지(신청자 관리·선수 명단·시상·순위 등)도 각각
콘텐츠 자체에 컨텍스트가 있는지부터 확인 후 우선순위를 다시 매겨야 한다 —
`AppChrome desktopHead` 부재 = 자동으로 결함이 아니라는 것이 이번 재현으로
재확인됐다(owner-04 스크린샷 오독 교훈과 같은 계열: 정적 신호만으로 결함을
단정하지 말 것).
