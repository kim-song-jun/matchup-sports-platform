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
    {
      "id": "T-01",
      "route": "/teams/:teamId",
      "actorShell": "authenticated team shell; team_owner|team_manager operations block",
      "backendContract": "GET /api/v1/teams/:teamId/operations-summary plus team schedule/game projections",
      "wave": 2,
      "scenario": "E2E-TEAM-01",
      "ownerTodo": 13
    },
    {
      "id": "T-02",
      "route": "/teams/:teamId/schedules",
      "actorShell": "authenticated team shell; member read, team_owner|team_manager manage",
      "backendContract": "GET|POST /api/v1/teams/:teamId/schedules",
      "wave": 2,
      "scenario": "E2E-TEAM-01",
      "ownerTodo": 13
    },
    {
      "id": "T-03",
      "route": "/teams/:teamId/schedules/new and /teams/:teamId/schedules/:scheduleId/edit",
      "actorShell": "authenticated team shell; team_owner|team_manager",
      "backendContract": "POST /api/v1/teams/:teamId/schedules; PATCH /api/v1/teams/:teamId/schedules/:scheduleId",
      "wave": 2,
      "scenario": "E2E-TEAM-01",
      "ownerTodo": 13
    },
    {
      "id": "T-04",
      "route": "/teams/:teamId/schedules/:scheduleId",
      "actorShell": "authenticated team shell; member|team_owner|team_manager",
      "backendContract": "GET|PATCH schedule; PUT attendance/me; POST reminders; guest-recruitment contracts",
      "wave": 2,
      "scenario": "E2E-TEAM-01",
      "ownerTodo": 13
    },
    {
      "id": "T-05",
      "route": "/team-matches/:teamMatchId/lineup",
      "actorShell": "authenticated team-match shell; team_owner|team_manager",
      "backendContract": "GET|PUT /api/v1/team-matches/:teamMatchId/lineup; POST .../submit|change-request",
      "wave": 3,
      "scenario": "E2E-TEAM-01",
      "ownerTodo": 15
    },
    {
      "id": "T-06",
      "route": "/team-matches/:teamMatchId/result",
      "actorShell": "authenticated team-match shell; host team_owner|team_manager",
      "backendContract": "GET|POST /api/v1/games/:gameId/result-revisions; POST .../:revisionId/submit",
      "wave": 3,
      "scenario": "E2E-TEAM-01|E2E-TEAM-02",
      "ownerTodo": 17
    },
    {
      "id": "T-07",
      "route": "/team-matches/:teamMatchId/result/approval",
      "actorShell": "authenticated team-match shell; opponent_manager",
      "backendContract": "POST /api/v1/games/:gameId/result-revisions/:revisionId/decision",
      "wave": 3,
      "scenario": "E2E-TEAM-01|E2E-TEAM-02",
      "ownerTodo": 17
    },
    {
      "id": "T-08",
      "route": "/teams/:teamId/records",
      "actorShell": "public team profile shell with scoped team management context",
      "backendContract": "GET /api/v1/teams/:teamId/records",
      "wave": 5,
      "scenario": "E2E-TEAM-01|E2E-CORR-01",
      "ownerTodo": 24
    },
    {
      "id": "T-09",
      "route": "/my/schedule",
      "actorShell": "authenticated member shell",
      "backendContract": "GET /api/v1/me/schedule; PUT schedule attendance/me",
      "wave": 2,
      "scenario": "E2E-TEAM-01",
      "ownerTodo": 13
    },
    {
      "id": "A-01",
      "route": "/tournament-ops/tournaments/:tournamentId/operations",
      "actorShell": "scoped tournament-operations shell; assigned staff",
      "backendContract": "GET /api/v1/tournament-ops/tournaments/:tournamentId/operations",
      "wave": 4,
      "scenario": "E2E-TOUR-01|E2E-TOUR-02",
      "ownerTodo": 19
    },
    {
      "id": "A-02",
      "route": "/tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/operate",
      "actorShell": "scoped tournament-operations shell; assigned field_operator|tournament_director",
      "backendContract": "game commands/events/realtime takeover and backfill contracts",
      "wave": 4,
      "scenario": "E2E-TOUR-01|E2E-TOUR-02|E2E-AUTH-01",
      "ownerTodo": 21
    },
    {
      "id": "A-03",
      "route": "/tournament-ops/tournaments/:tournamentId/result-review",
      "actorShell": "scoped tournament-operations shell; tournament_director read/review, platform_ops officialize",
      "backendContract": "review-decision, supersede-and-submit, officialize, projection preview",
      "wave": 4,
      "scenario": "E2E-TOUR-01|E2E-CORR-01",
      "ownerTodo": 23
    },
    {
      "id": "A-04",
      "route": "/tournament-ops/tournaments/:tournamentId/records/corrections",
      "actorShell": "scoped tournament-operations shell; tournament_director|platform_ops",
      "backendContract": "POST /api/v1/games/:gameId/corrections and flag-gated void",
      "wave": 5,
      "scenario": "E2E-CORR-01",
      "ownerTodo": 23
    },
    {
      "id": "A-05",
      "route": "/tournament-ops/tournaments/:tournamentId/staff",
      "actorShell": "scoped tournament-operations shell; tournament_director|platform_ops",
      "backendContract": "GET|POST staff; POST staff/:assignmentId/revoke",
      "wave": 4,
      "scenario": "E2E-AUTH-01",
      "ownerTodo": 19
    },
    {
      "id": "P-01",
      "route": "/tournaments/:tournamentId/schedule",
      "actorShell": "public tournament shell",
      "backendContract": "GET /api/v1/tournaments/:tournamentId/schedule",
      "wave": 5,
      "scenario": "E2E-TOUR-01|E2E-PUBLIC-01",
      "ownerTodo": 24
    },
    {
      "id": "P-02",
      "route": "/tournaments/:tournamentId/matches/:fixtureId",
      "actorShell": "public tournament shell",
      "backendContract": "GET /api/v1/tournaments/:tournamentId/matches/:fixtureId",
      "wave": 5,
      "scenario": "E2E-TOUR-01|E2E-PUBLIC-01|E2E-CORR-01",
      "ownerTodo": 24
    },
    {
      "id": "P-03",
      "route": "/teams/:teamId/records",
      "actorShell": "public team profile shell",
      "backendContract": "GET /api/v1/teams/:teamId/records",
      "wave": 5,
      "scenario": "E2E-TEAM-01|E2E-PUBLIC-01|E2E-CORR-01",
      "ownerTodo": 24
    },
    {
      "id": "P-04",
      "route": "/users/:userId/records",
      "actorShell": "public nickname-only user profile shell",
      "backendContract": "GET /api/v1/users/:userId/records",
      "wave": 5,
      "scenario": "E2E-TEAM-01|E2E-PUBLIC-01|E2E-CORR-01",
      "ownerTodo": 24
    }
  ],
  "classifications": [
    {
      "path": ".github/tasks/79-team-match-management-history-contracts.md",
      "classification": "stale",
      "reason": "Its verified evidence and owned paths are legacy apps/api and apps/web, so it cannot define v1 Game/Record behavior.",
      "supersededBy": ".github/tasks/127-v1-team-tournament-operations-game-record.md"
    },
    {
      "path": ".github/tasks/109-v1-tournament-team-ops-batch.md",
      "classification": "extend",
      "reason": "Keep verified v1 tournament/team capabilities and extend only the Game/Record and field-operations gaps.",
      "supersededBy": null
    },
    {
      "path": ".github/tasks/119-v1-admin-bracket-layout.md",
      "classification": "keep",
      "reason": "The existing admin bracket layout remains valid; field operations are added in a separate scoped shell.",
      "supersededBy": null
    },
    {
      "path": ".github/tasks/123-admin-owner-access-invariant.md",
      "classification": "keep",
      "reason": "The platform admin owner invariant remains authoritative and does not grant field staff global admin access.",
      "supersededBy": null
    },
    {
      "path": "docs/scenarios/index.md",
      "classification": "extend",
      "reason": "Extend the scenario hub with the seven Task 127 E2E journeys in Todo 26.",
      "supersededBy": null
    },
    {
      "path": "docs/scenarios/04-team-and-membership.md",
      "classification": "extend",
      "reason": "Preserve membership contracts and add schedule/lineup actor coverage.",
      "supersededBy": null
    },
    {
      "path": "docs/scenarios/05-team-match-flows.md",
      "classification": "extend",
      "reason": "Preserve current v1 team-match lifecycle coverage and replace mutable result behavior with append-only revisions.",
      "supersededBy": null
    },
    {
      "path": "docs/scenarios/11-team-and-venue-hubs.md",
      "classification": "extend",
      "reason": "Preserve public tournament/team hub coverage and add official record projections.",
      "supersededBy": null
    },
    {
      "path": "docs/scenarios/17-tournament-gender-wizard.md",
      "classification": "keep",
      "reason": "Competition roster and gender rules remain prerequisites for lineup eligibility.",
      "supersededBy": null
    }
  ],
  "ownership": [
    {
      "todo": 1,
      "inputs": "bound PDF/preview/design hashes; named task/scenario docs; root Node/pnpm contract; existing v1 Docker/deploy patterns",
      "outputs": [
        ".github/tasks/127-v1-team-tournament-operations-game-record.md",
        "scripts/qa/validate-team-tournament-ledger.mjs",
        "scripts/qa/run-v1-task-verification.mjs",
        "scripts/qa/run-v1-task-verification.contract.test.mjs",
        "scripts/qa/verify-team-tournament-bound-sources.mjs",
        "deploy/Dockerfile.v1-verification"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 2,
      "inputs": "Todo-1 ledger; named v1 auth/schema/admin-shell files",
      "outputs": [
        ".github/tasks/127-v1-team-tournament-operations-game-record.md",
        "scripts/qa/validate-game-record-adrs.mjs"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 3,
      "inputs": "named baseline API indexes/contracts",
      "outputs": [
        "docs/api/README.md",
        "docs/api/global-contract.md",
        "docs/api/domains/games.md",
        "docs/api/domains/team-schedules.md",
        "docs/api/domains/tournament-operations.md",
        "docs/api/domains/tournament-operations-auth.md",
        "docs/api/domains/tournament-operations-escalations.md",
        "docs/api/domains/game-realtime.md",
        "docs/api/domains/game-migration.md",
        "docs/api/domains/public-records.md",
        "docs/api/domains/tournaments.md",
        "docs/api/v1/domains/tournaments.md",
        "docs/api/v1/domains/deferred-boundaries.md",
        "docs/api/v1/domains/admin-audit.md",
        "scripts/docs/check-api-contract-tree.mjs"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 4,
      "inputs": "`apps/v1_api/prisma/schema.prisma`; named baseline migrations",
      "outputs": [
        "apps/v1_api/prisma/schema.prisma",
        "apps/v1_api/prisma/migrations/20260729000100_v1_game_operations",
        "apps/v1_api/test/games/game-schema.integration-spec.ts",
        "apps/v1_api/test/fixtures/game-schema.fixture.ts"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 5,
      "inputs": "Todo-4 schema; named realtime/deploy files",
      "outputs": [
        "apps/v1_api/src/jobs/v1-game-operations-worker.module.ts",
        "apps/v1_api/src/jobs/v1-game-operations-worker.service.ts",
        "apps/v1_api/src/jobs/v1-game-operations-worker.controller.ts",
        "apps/v1_api/src/jobs/v1-game-operations-worker.service.spec.ts",
        "apps/v1_api/src/jobs/v1-game-operations-worker.main.ts",
        "apps/v1_api/src/config/game-operation-flags.ts",
        "apps/v1_api/src/config/game-operation-flags.controller.ts",
        "apps/v1_api/test/jobs/game-operations-control.integration-spec.ts",
        "deploy/v1-game-operations-worker.Dockerfile",
        "deploy/docker-compose.alpha.yml"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 6,
      "inputs": "Todo-3 contracts; Todo-4 schema; Todo-11 preset/pinning receipt",
      "outputs": [
        "apps/v1_api/src/games/core",
        "apps/v1_api/src/games/games.module.ts",
        "apps/v1_api/src/games/games.controller.ts",
        "apps/v1_api/src/games/games.service.ts",
        "apps/v1_api/src/games/games.service.spec.ts",
        "apps/v1_api/test/games/game-lifecycle.integration-spec.ts",
        "apps/v1_api/src/team-matches/team-matches.service.ts",
        "apps/v1_api/src/tournaments/tournament-bracket.service.ts",
        "docs/api/domains/games.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 7,
      "inputs": "canonical actor matrix; named admin context",
      "outputs": [
        "apps/v1_api/src/games/auth",
        "apps/v1_api/test/games/tournament-staff-auth.integration-spec.ts",
        "docs/api/domains/tournament-operations-auth.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 8,
      "inputs": "frozen realtime contract; Todo-5/7 outputs",
      "outputs": [
        "apps/v1_api/src/games/realtime",
        "apps/v1_api/test/games/game-realtime.integration-spec.ts",
        "docs/api/domains/game-realtime.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 9,
      "inputs": "Todo-5/6/7/11 outputs; approved Task-9 tuple `records=A, escalation=A, bracket=A, identity=A`",
      "outputs": [
        "apps/v1_api/prisma/schema.prisma",
        "apps/v1_api/prisma/migrations/20260802000100_v1_game_projections_escalations",
        "apps/v1_api/prisma/migrations/20260802000200_v1_team_record_facts",
        "apps/v1_api/src/game-operations",
        "apps/v1_api/src/games/projections",
        "apps/v1_api/src/jobs/result-escalation",
        "apps/v1_api/src/jobs/v1-game-operations-worker.module.ts",
        "apps/v1_api/src/jobs/v1-game-operations-worker.service.ts",
        "apps/v1_api/src/jobs/v1-game-operations-worker.main.ts",
        "apps/v1_api/src/games/games.service.ts",
        "apps/v1_api/src/notifications/notifications.module.ts",
        "apps/v1_api/src/notifications/notifications.service.ts",
        "apps/v1_api/src/tournaments/tournament-bracket.service.ts",
        "apps/v1_api/test/games/game-projection.integration-spec.ts",
        "docs/api/domains/games.md",
        "docs/api/domains/tournaments.md",
        "docs/api/domains/tournament-operations-escalations.md",
        "apps/v1_api/prisma/migrations/20260802000300_v1_result_escalation_lifecycle",
        "docs/api/global-contract.md",
        "docs/api/domains/tournament-operations-auth.md",
        "apps/v1_api/prisma/migrations/20260802000400_v1_public_official_result_cache",
        "apps/v1_api/test/games/game-lifecycle.integration-spec.ts",
        "apps/v1_api/test/games/game-schema.integration-spec.ts",
        "apps/v1_api/test/integration/tournament-campaign.e2e-spec.ts",
        "apps/v1_api/test/fixtures/game-schema.fixture.ts",
        "apps/v1_api/src/jobs/v1-game-operations-worker.service.spec.ts",
        "apps/v1_api/test/jobs/v1-game-operations-worker.integration-spec.ts",
        "apps/v1_api/src/tournaments/tournament-bracket.service.spec.ts",
        "apps/v1_api/src/admin/admin-terms.service.spec.ts",
        "apps/v1_api/jest.config.ts",
        "apps/v1_api/src/config/game-operation-flags.ts",
        "apps/v1_api/src/config/game-operation-flags.spec.ts",
        "apps/v1_api/test/jobs/game-operations-control.integration-spec.ts"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 10,
      "inputs": "named current result services/migrations; Todo-11 source pin receipt",
      "outputs": [
        "apps/v1_api/src/games/migration",
        "apps/v1_api/test/games/game-backfill.integration-spec.ts",
        "apps/v1_api/test/fixtures/game-backfill.fixture.ts",
        "scripts/qa/verify-game-result-cutover.mjs",
        "docs/api/domains/game-migration.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 11,
      "inputs": "Todo-4 schema; baseline standings service; D-07–D-09 table",
      "outputs": [
        "apps/v1_api/prisma/schema.prisma",
        "apps/v1_api/src/tournaments/competition-config",
        "apps/v1_api/src/tournaments/tournament-bracket.service.ts",
        "apps/v1_api/src/tournaments/tournament-bracket.controller.ts",
        "apps/v1_api/prisma/migrations/20260729000200_v1_competition_config",
        "apps/v1_api/test/tournaments/competition-config.integration-spec.ts",
        "apps/v1_api/test/fixtures/competition-config.fixture.ts",
        "docs/api/domains/tournaments.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 12,
      "inputs": "named team/team-match modules",
      "outputs": [
        "apps/v1_api/src/team-schedules",
        "apps/v1_api/test/teams/team-schedules.integration-spec.ts",
        "docs/api/domains/team-schedules.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 13,
      "inputs": "canonical design; named team components/hooks",
      "outputs": [
        "apps/v1_web/src/app/teams/[id]/schedules",
        "apps/v1_web/src/app/my/schedule",
        "apps/v1_web/src/components/team-schedules",
        "apps/v1_web/src/hooks/use-team-schedules.ts",
        "apps/v1_web/src/types/team-schedules.ts"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 14,
      "inputs": "named membership/player services; consent table",
      "outputs": [
        "apps/v1_api/src/games/lineups",
        "apps/v1_api/test/games/game-lineups.integration-spec.ts",
        "docs/api/domains/games.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 15,
      "inputs": "Todo-14 contract; canonical design",
      "outputs": [
        "apps/v1_web/src/app/team-matches/[id]/lineup",
        "apps/v1_web/src/components/game-lineup",
        "apps/v1_web/src/hooks/use-game-lineup.ts"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 16,
      "inputs": "Todo-6/9/12/14 outputs; named team-match service",
      "outputs": [
        "apps/v1_api/src/games/team-results",
        "apps/v1_api/src/team-matches/team-matches.service.ts",
        "apps/v1_api/src/team-matches/team-matches.controller.ts",
        "apps/v1_api/test/games/team-result-approval.integration-spec.ts",
        "docs/api/domains/games.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 17,
      "inputs": "Todo-16 contract; canonical design",
      "outputs": [
        "apps/v1_web/src/app/team-matches/[id]/result",
        "apps/v1_web/src/app/team-matches/[id]/result/approval",
        "apps/v1_web/src/components/game-results",
        "apps/v1_web/src/hooks/use-game-results.ts"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 18,
      "inputs": "Todo-7/8/9/11 outputs; named tournament module",
      "outputs": [
        "apps/v1_api/src/tournament-operations/board",
        "apps/v1_api/src/tournament-operations/staff",
        "apps/v1_api/src/tournament-operations/fields",
        "apps/v1_api/src/tournament-operations/lineups",
        "apps/v1_api/test/tournaments/tournament-operations-board.integration-spec.ts",
        "docs/api/domains/tournament-operations.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 19,
      "inputs": "Todo-18 API; baseline admin-shell files; canonical design",
      "outputs": [
        "apps/v1_web/src/app/tournament-ops/tournaments/[id]/operations",
        "apps/v1_web/src/app/tournament-ops/tournaments/[id]/staff",
        "apps/v1_web/src/app/tournament-ops/layout.tsx",
        "apps/v1_web/src/components/tournament-operations",
        "apps/v1_web/src/hooks/use-tournament-operations.ts",
        "apps/v1_web/src/app/tournament-ops/tournament-ops-shell.test.tsx"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 20,
      "inputs": "Todo-8/11/18 outputs",
      "outputs": [
        "apps/v1_api/src/games/live-commands",
        "apps/v1_api/test/games/live-game-commands.integration-spec.ts",
        "docs/api/domains/game-realtime.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 21,
      "inputs": "Todo-19/20 outputs; canonical design",
      "outputs": [
        "apps/v1_web/src/app/tournament-ops/tournaments/[id]/fixtures/[fixtureId]/operate",
        "apps/v1_web/src/components/game-live-console",
        "apps/v1_web/src/hooks/use-game-live-console.ts",
        "apps/v1_web/src/app/tournament-ops/live-console.test.tsx"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 22,
      "inputs": "Todo-9/11/18/20 outputs; named bracket service",
      "outputs": [
        "apps/v1_api/src/tournament-operations/results",
        "apps/v1_api/src/tournaments/tournament-bracket.service.ts",
        "apps/v1_api/src/tournaments/tournament-bracket.controller.ts",
        "apps/v1_api/test/tournaments/tournament-officialize.integration-spec.ts",
        "docs/api/domains/tournament-operations.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 23,
      "inputs": "Todo-19/22 outputs; canonical design",
      "outputs": [
        "apps/v1_web/src/app/tournament-ops/tournaments/[id]/result-review",
        "apps/v1_web/src/app/tournament-ops/tournaments/[id]/records/corrections",
        "apps/v1_web/src/components/tournament-result-review",
        "apps/v1_web/src/hooks/use-tournament-result-review.ts",
        "apps/v1_web/src/app/tournament-ops/result-review.test.tsx"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 24,
      "inputs": "Todo-9/11/14/16/22 outputs; baseline public routes",
      "outputs": [
        "apps/v1_api/src/games/public-records",
        "apps/v1_api/test/games/public-records-privacy.integration-spec.ts",
        "apps/v1_web/src/app/tournaments/[id]/schedule",
        "apps/v1_web/src/app/tournaments/[id]/matches/[fixtureId]",
        "apps/v1_web/src/app/teams/[id]/records",
        "apps/v1_web/src/app/users/[id]/records",
        "apps/v1_web/src/components/public-game-records",
        "apps/v1_web/src/app/public-game-records.test.tsx",
        "docs/api/domains/public-records.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 25,
      "inputs": "Todo-1 caller ledger; Todo-6/16 callers",
      "outputs": [
        "apps/v1_api/src/games/adapters",
        "apps/v1_api/test/games/game-cutover.integration-spec.ts",
        "apps/v1_api/src/tournaments/tournament-bracket.service.ts",
        "apps/v1_api/src/tournaments/tournament-bracket.controller.ts",
        "apps/v1_api/src/team-matches/team-matches.service.ts",
        "apps/v1_api/src/team-matches/team-matches.controller.ts",
        "apps/v1_web/src/hooks/use-v1-api.ts",
        "apps/v1_web/src/types/api.ts",
        "apps/v1_web/src/test/msw/handlers.ts",
        "scripts/qa/verify-game-result-cutover.mjs",
        "docs/api/domains/game-migration.md"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 26,
      "inputs": "baseline scenarios/fixtures; prior contracts",
      "outputs": [
        "apps/v1_api/src/app.module.ts",
        "docs/scenarios/04-team-and-membership.md",
        "docs/scenarios/05-team-match-flows.md",
        "docs/scenarios/11-team-and-venue-hubs.md",
        "docs/scenarios/17-tournament-gender-wizard.md",
        "docs/scenarios/18-team-tournament-operations.md",
        "docs/scenarios/index.md",
        "e2e/v1-tests/team-tournament-operations.spec.ts",
        "e2e/fixtures/team-tournament-operations.ts",
        "e2e/fixtures/runtime.ts",
        "e2e/fixtures/sessions.ts",
        "e2e/fixtures/api-helpers.ts",
        "apps/v1_api/test/fixtures/team-tournament-operations.ts",
        "apps/v1_api/prisma/seed.ts",
        "apps/v1_web/src/test/msw/team-tournament-operations.ts",
        "apps/v1_web/src/test/msw/handlers.ts",
        "apps/v1_web/src/types/api.ts",
        "apps/v1_web/src/hooks/use-v1-api.ts"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    },
    {
      "todo": 27,
      "inputs": "Todo-25/26 candidate; baseline load/deploy inputs",
      "outputs": [
        "infra/load/v1-game-operations.js",
        "infra/load/fixtures/v1-game-operations.json",
        "scripts/qa/run-v1-game-operations-load.mjs",
        "scripts/qa/run-v1-release-candidate.mjs",
        "scripts/qa/run-v1-final-gate.mjs",
        "scripts/qa/run-v1-alpha-cutover.mjs",
        "deploy/runbooks/v1-game-operations-alpha.md",
        "deploy/runbooks/v1-game-operations-compatibility-removal.json",
        "deploy/runbooks/v1-game-operations-r3-registry.json"
      ],
      "forbidden": [
        ".env*",
        "apps/api/**",
        "apps/web/**",
        "docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html",
        "unrelatedDirty.paths[*]",
        "every ownership output not listed in the active todo row"
      ]
    }
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
      {
        "path": ".claude/agents/AGENTS.md",
        "index": {
          "state": "present",
          "entries": [
            {
              "mode": "100644",
              "blob": "8de5b09f8141db229849d67b57288f650ed0ad1b",
              "stage": 0,
              "path": ".claude/agents/AGENTS.md"
            }
          ]
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 2539,
          "sha256": "553706186cf93532a1717965c25fdc2d0edc3541f5c0375ae4ece763bef6429f"
        }
      },
      {
        "path": ".github/tasks/15-bootstrap-codex-agent-config.md",
        "index": {
          "state": "present",
          "entries": [
            {
              "mode": "100644",
              "blob": "bda941f56efacaf2ec3b5ae8a8ef66b0205f876b",
              "stage": 0,
              "path": ".github/tasks/15-bootstrap-codex-agent-config.md"
            }
          ]
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 5468,
          "sha256": "860666caf77de5e4d32bac004cb7b83fc3214bdad54b323c19b29bae5c8f6b2a"
        }
      },
      {
        "path": "AGENTS.md",
        "index": {
          "state": "present",
          "entries": [
            {
              "mode": "100644",
              "blob": "58f8b04625acd66436f414ce26301bdbd88aa27c",
              "stage": 0,
              "path": "AGENTS.md"
            }
          ]
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 43899,
          "sha256": "1071cc5f9b8a340292dba7fc80d4e0f995578799c4985c7ceb9be16d794b5fbf"
        }
      },
      {
        "path": "apps/v1_api/AGENTS.md",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 3090,
          "sha256": "a0e32acf1e840bae5c8de66c23e28b1189bfa30d174cb7a6ddabc83ae1e017d6"
        }
      },
      {
        "path": "apps/v1_api/prisma/AGENTS.md",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 4184,
          "sha256": "fc7ad4dae06f6bcdab2c10338ff7f2304bc179fc3c28e61a4cb6d14b571e79bd"
        }
      },
      {
        "path": "apps/v1_api/src/AGENTS.md",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 4652,
          "sha256": "3df97552673576770e0a0ac36c5c21fd7f381095ef544ffa4998ed5ccb14d2a8"
        }
      },
      {
        "path": "apps/v1_web/AGENTS.md",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 3465,
          "sha256": "f32f686603bc5efe8f3f9e781b4f436276d8138002977528ac682f57553a7b7a"
        }
      },
      {
        "path": "apps/v1_web/src/AGENTS.md",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 4375,
          "sha256": "ed3b5deb07ad0f6fb05894b86e6486a2235072edab680e4dd8232fd6a63666b1"
        }
      },
      {
        "path": "desktop-top.png",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 137920,
          "sha256": "fafd0158917643d3eb1b9097d8836c6bd53c5fec43d1139125df7bd38c575cb8"
        }
      },
      {
        "path": "e2e/AGENTS.md",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 4186,
          "sha256": "a06ccff3a77f4cf337f6ee99a1974836ee5669f6366e4fe9385b4173aa98c1fa"
        }
      },
      {
        "path": "screenshots/admin-roster-modal-local/roster-modal_desktop1440.png",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 141520,
          "sha256": "582092ade921539c995a03b1123dce2a7b8c89c4fd9778895a2119110306cdd5"
        }
      },
      {
        "path": "screenshots/admin-roster-modal-local/roster-modal_mobile390.png",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 58817,
          "sha256": "5a5f10963774c2cc3d4571b465625aada7c3c86be1f84ee01eaa06aabd6910fc"
        }
      },
      {
        "path": "screenshots/admin-roster-modal-local/roster-modal_tablet768.png",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 105149,
          "sha256": "5ffd803c6c1f6858350374421ebe540ba2adddb2192bd2e27d2880e5e1360715"
        }
      },
      {
        "path": "scripts/capture_admin_roster_modal.js",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 3757,
          "sha256": "2d80b810ff902a74c1937fe138ebc120aba57b5f40acdcb265fac670ecbda1f8"
        }
      },
      {
        "path": "scripts/capture_admin_roster_modal_local.js",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 3893,
          "sha256": "fd1075c985a38954dbf0a9f57fa10b642172493eb8f40f3b1107fcad7f19b6b3"
        }
      },
      {
        "path": "scripts/qa/AGENTS.md",
        "index": {
          "state": "absent"
        },
        "worktree": {
          "state": "present",
          "type": "regular",
          "mode": "0644",
          "size": 4748,
          "sha256": "a43d9170c70b1bf888b9c851c9953b1859210694fe2033390f95228b3a29490a"
        }
      }
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

### `unrelatedDirty` re-freeze — 2026-08-04

`unrelatedDirty` was re-captured against the live working tree on 2026-08-04, growing from 10 paths
to 16. **This is a deliberate, disclosed weakening of one evidence binding. Read what it costs
before relying on F1-F4 output.**

Why it was unavoidable. The original freeze recorded `AGENTS.md` as an *uncommitted* modification
(`sha256 09175f55…`). A concurrent session edited that file again afterwards. An uncommitted state
is stored nowhere in git, so the frozen bytes were searched for and not found in any of the 24
commits touching `AGENTS.md`, nor in any of the 4 stash entries. `verifyTaskOneDirty()` compares the
recorded `sha256` byte-for-byte and is called inside `verifyCandidate()`, which every `--final-gate`
run reaches — so F1-F4 had become permanently unsatisfiable, and no amount of working-tree cleanup
could restore them.

What the re-freeze does NOT do: it does not recover the Todo-1 binding. Nothing can. The chain from
this plan's start to its final gates is broken and stays broken.

What F1-F4 therefore prove, and only this: that nothing drifted between candidate-receipt creation
and gate execution — which is what the plan's own F4 text compares against ("the normalized
unrelated-dirty status/index/worktree fingerprint **to the receipt**"). They do NOT prove that
nothing unrelated changed since Todo 1.

The 6 added paths are another session's artifacts, not this plan's outputs, and remain excluded from
every ownership row:

```
desktop-top.png
screenshots/admin-roster-modal-local/roster-modal_{desktop1440,mobile390,tablet768}.png
scripts/capture_admin_roster_modal.js
scripts/capture_admin_roster_modal_local.js
```

Because the re-freeze pins those foreign paths by content hash, a later edit to any of them breaks
the fingerprint again. F1-F4 must run against the same working tree that produced this record.

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
