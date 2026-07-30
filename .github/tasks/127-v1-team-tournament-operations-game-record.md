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
  "planSHA": "dc4ecb2f76592799f8460135d9ea755a6e8fd768de17a29af7e61cf2b21508dd",
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
    {"todo":9,"inputs":"Todo-5/6/11 outputs","outputs":["apps/v1_api/src/games/projections","apps/v1_api/src/jobs/result-escalation","apps/v1_api/test/games/game-projection.integration-spec.ts","docs/api/domains/tournament-operations-escalations.md"],"forbidden":[".env*","apps/api/**","apps/web/**","docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html","unrelatedDirty.paths[*]","every ownership output not listed in the active todo row"]},
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

## Ambiguity log

- PDF artboards show tournament field operations under `/admin/**`; approved D-04 and the selected plan supersede only that route example with `/tournament-ops/**`. Existing global admin tournament management remains unchanged.
- `T-08` and `P-03` intentionally resolve to the same public team-record route. They are distinct product entry/context IDs with one implementation owner, not duplicate ownership.
- The v1 live-entry MVP is tournament-operations only. Tapping a player freezes that moment's server-synchronized game clock in an event draft; choosing `GOAL`, `YELLOW_CARD`, or `RED_CARD` submits the acknowledged event with that captured clock. `GOAL` requires the scorer and may include one optional assist. A generic `FOUL` event and an ordinary-team-match live console are deferred; team management uses the shared event/result contract through its post-match result workflow. Public live timelines render acknowledged events only.
