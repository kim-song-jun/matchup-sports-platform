#!/usr/bin/env bash
# Task 175 Task 6: runs deploy/prod-task168.sh's real Stage A -> Stage B
# pipeline against a REAL Postgres database, REAL `docker run` invocations of
# a freshly-built API image and the pinned cutover-tool image, and the REAL
# `prisma migrate deploy`/`prisma migrate diff` CLI -- not the docker/psql
# shim in scripts/qa/test-prod-task168.sh. That shim suite (44-50 scenarios)
# proves the runner's own control flow against a fake SQL evaluator; it
# cannot prove the runner's SQL is syntactically valid against a real
# Postgres, that the pinned cutover-tool binary actually converts real
# fixture rows, or that a real `prisma migrate deploy`/M11 DROP TABLE
# interacts correctly with the runner's own follow-up queries. This file is
# that proof.
#
# Requires (SKIPs cleanly, not a failure, when absent -- see the two guards
# right below): a reachable `docker`, and the `promo_test_pg` sidecar
# container (127.0.0.1:5499, user postgres/pw promo) this repo's local
# sessions already run for other Task168 real-DB checks (see
# scripts/qa/test-prod-task168.sh's own real_db_check()). Never touches
# `prod_pristine` -- only ever CREATEs/DROPs its own disposable database.
# Set REQUIRE_REAL_DB=1 to turn the SKIP guards into a hard failure instead
# (CI-style "this must actually run" mode).
#
# Contract this file proves for task168_stage_b()'s two resume branches
# (deploy/prod-task168.sh): once M11 has genuinely run, re-verifying the
# cutover uses prod_assert_legacy_tables_retired() (the post-M11 invariant --
# the 5 retired legacy tables and their 3 link triggers are gone), never
# prod_assert_cutover_seals() (the pre-M11 invariant, which casts to those
# same 5 tables and would hard-fail once M11 has dropped them). Scenario I2
# below calls task168_stage_b() a second time after a real M11 has already
# committed and asserts it resumes cleanly -- no migrate re-invocation, no
# ledger/receipt drift (fix round 1, M-1). Scenario M-2 goes one step
# further: it deletes migration-stage.json and reruns Stage B a THIRD time to
# exercise the sibling resume branch (prod-task168.sh:877, "ledger already
# shows the full M1..M11 set but the receipt is missing -- confirm via
# m11-entry.json instead").
set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly RUNNER_COMMON="${ROOT_DIR}/deploy/prod-task168-common.sh"
readonly RUNNER_SH="${ROOT_DIR}/deploy/prod-task168.sh"

failures=0
ok() { echo "OK: $1"; }
bad() { echo "FAILED: $1" >&2; failures=$((failures + 1)); }

REAL_DOCKER="$(command -v docker || true)"
if [[ -z "${REAL_DOCKER}" ]] || ! "${REAL_DOCKER}" ps >/dev/null 2>&1; then
  if [[ "${REQUIRE_REAL_DB:-}" == 1 ]]; then
    echo "FAILED: REQUIRE_REAL_DB=1 but docker is not reachable in this environment" >&2
    exit 1
  fi
  echo "SKIP: test-prod-task168-real-db (docker not reachable in this environment) -- this is a SKIP, not a pass; the pipeline this file proves is unverified in this environment"
  exit 0
fi
if ! "${REAL_DOCKER}" exec promo_test_pg psql -U postgres -At -c 'SELECT 1' >/dev/null 2>&1; then
  if [[ "${REQUIRE_REAL_DB:-}" == 1 ]]; then
    echo "FAILED: REQUIRE_REAL_DB=1 but the promo_test_pg sidecar container is not running" >&2
    exit 1
  fi
  echo "SKIP: test-prod-task168-real-db (promo_test_pg sidecar container not running) -- this is a SKIP, not a pass"
  exit 0
fi

readonly TEST_ROOT="$(mktemp -d)"
readonly SCRATCH_DB="task175_t6_realdb_$$"
readonly API_IMAGE="prod-task168-realdb-api:test"
TOOL_IMAGE="prod-task168-realdb-cutover-tool:test" # reassigned below if the controller-prepared image already exists
readonly RELEASE_SHA_A="1111111111111111111111111111111111111111"
readonly GAP_SIZE=10 # deliberately-unapplied pre-M1 migrations, mirrors real prod lag (Ruling R7/R9)

cleanup() {
  local rc=$?
  "${REAL_DOCKER}" exec promo_test_pg psql -U postgres -At -c "DROP DATABASE IF EXISTS ${SCRATCH_DB}" >/dev/null 2>&1 ||
    echo "WARN: failed to drop scratch db ${SCRATCH_DB} -- manual cleanup needed" >&2
  rm -rf "${TEST_ROOT}"
  exit "${rc}"
}
trap cleanup EXIT

echo "--- building real images (cached after first run) ---"
"${REAL_DOCKER}" build --target runtime -q -t "${API_IMAGE}" -f "${ROOT_DIR}/deploy/Dockerfile.v1-api" "${ROOT_DIR}" >/dev/null
if "${REAL_DOCKER}" image inspect promo-task168-cutover-tool:local >/dev/null 2>&1; then
  TOOL_IMAGE="promo-task168-cutover-tool:local" # reuse the controller-prepared image (Task 6 brief)
else
  "${REAL_DOCKER}" build --target task168-cutover-tool -q -t "${TOOL_IMAGE}" -f "${ROOT_DIR}/deploy/Dockerfile.v1-api" "${ROOT_DIR}" >/dev/null
fi

echo "--- creating scratch database ${SCRATCH_DB} (never prod_pristine) ---"
"${REAL_DOCKER}" exec promo_test_pg psql -U postgres -At -c "DROP DATABASE IF EXISTS ${SCRATCH_DB}" >/dev/null 2>&1 || true
"${REAL_DOCKER}" exec promo_test_pg psql -U postgres -At -c "CREATE DATABASE ${SCRATCH_DB}"
PG_IP="$("${REAL_DOCKER}" inspect promo_test_pg --format '{{.NetworkSettings.Networks.bridge.IPAddress}}')"
[[ -n "${PG_IP}" ]] || { echo "fixture setup: could not resolve promo_test_pg's bridge IP -- refusing to build a DATABASE_URL with an empty host" >&2; exit 1; }
DATABASE_URL="postgresql://postgres:promo@${PG_IP}:5432/${SCRATCH_DB}"

# Named M1_NAMES, not PROD_TASK168_M1 -- the runner itself declares a
# `readonly PROD_TASK168_M1` array at deploy/prod-task168.sh's own top level.
# A subshell forked from THIS script (run_stage_a_prelude/run_stage_a_dispatch
# below) inherits every variable of the parent process, attributes included,
# so a same-named readonly array here would make the runner's own `source`
# of prod-task168.sh fail with "readonly variable" the moment it tried to
# declare its own -- reproduced and fixed in this session.
readonly M1_NAMES=(
  20260908130000_v1_team_match_tournament_expand
  20260908150000_v1_operation_audit_team_match_expand
  20260908160000_v1_official_fact_team_match_scope
  20260908170000_v1_lineup_invalidation
  20260908180000_v1_staff_scope_team_match
  20260909000000_v1_tournament_result_lineage
  20260909110000_v1_operation_audit_canonical_binding
)
readonly M8=20260910010000_v1_official_fact_source_history
readonly M9=20260910020000_v1_canonical_game_db_guards
readonly M10=20260910160000_v1_outbox_cutover_claim_gate
readonly M11=20260911090000_retire_tournament_fixture_tables
readonly M11_PINNED_SHA=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323

m11_actual_sha="$(sha256sum "${ROOT_DIR}/apps/v1_api/prisma/migrations/${M11}/migration.sql" | awk '{print $1}')"
[[ "${m11_actual_sha}" == "${M11_PINNED_SHA}" ]] || {
  echo "fixture setup: current tree's M11 migration.sql does not match the pinned checksum -- refusing to run against a source this test cannot trust" >&2
  exit 1
}

echo "--- building a deliberately-gapped pre-M1 migration tree (${GAP_SIZE}-migration gap) ---"
find "${ROOT_DIR}/apps/v1_api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -exec basename '{}' \; |
  LC_ALL=C sort | awk -v m1="${M1_NAMES[0]}" '$0 < m1' > "${TEST_ROOT}/pre-m1-all.txt"
pre_m1_total="$(wc -l < "${TEST_ROOT}/pre-m1-all.txt" | tr -d ' ')"
[[ "${pre_m1_total}" -gt "${GAP_SIZE}" ]] || { echo "fixture setup: not enough pre-M1 migrations to carve a gap" >&2; exit 1; }
head -n "$((pre_m1_total - GAP_SIZE))" "${TEST_ROOT}/pre-m1-all.txt" > "${TEST_ROOT}/pre-m1-prefix.txt"

gap_dir="${TEST_ROOT}/gap-migrations"
mkdir -p "${gap_dir}/migrations"
cp "${ROOT_DIR}/apps/v1_api/prisma/migrations/migration_lock.toml" "${gap_dir}/migrations/"
cp "${ROOT_DIR}/apps/v1_api/prisma/schema.prisma" "${gap_dir}/schema.prisma"
while IFS= read -r name; do
  cp -R "${ROOT_DIR}/apps/v1_api/prisma/migrations/${name}" "${gap_dir}/migrations/${name}"
done < "${TEST_ROOT}/pre-m1-prefix.txt"

echo "--- applying the ${pre_m1_total}-${GAP_SIZE}=$((pre_m1_total - GAP_SIZE)) pre-M1 prefix via real prisma migrate deploy ---"
"${REAL_DOCKER}" run --rm --network bridge --user "$(id -u):$(id -g)" \
  --env-file /dev/stdin -v "${gap_dir}:/tmp/task168" "${API_IMAGE}" \
  sh -c 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate deploy --schema /tmp/task168/schema.prisma' \
  < <(printf 'DATABASE_URL=%s\n' "${DATABASE_URL}") >"${TEST_ROOT}/pre-migrate.log" 2>&1 || {
  cat "${TEST_ROOT}/pre-migrate.log" >&2
  echo "fixture setup: gapped pre-M1 migrate failed" >&2
  exit 1
}
applied_prefix="$("${REAL_DOCKER}" exec promo_test_pg psql -U postgres -d "${SCRATCH_DB}" -At -c \
  "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")"
[[ "${applied_prefix}" == "$((pre_m1_total - GAP_SIZE))" ]] &&
  ok "fixture setup: gapped pre-M1 prefix applied (${applied_prefix}/${pre_m1_total}, ${GAP_SIZE} deliberately left for Stage A's own pre-migrate phase)" ||
  bad "fixture setup: expected ${applied_prefix} == $((pre_m1_total - GAP_SIZE)) applied pre-M1 rows"

fake_compose="${TEST_ROOT}/fake-compose.sh"
cat > "${fake_compose}" <<'EOF'
#!/usr/bin/env bash
echo "$(date -u +%FT%TZ) $*" >> "${COMPOSE_LOG:?}"
exit 0
EOF
chmod +x "${fake_compose}"
# exported -- `"${compose[@]}"` execs a genuinely separate `bash` process
# (fork+exec of fake_compose.sh), which only inherits EXPORTED variables, not
# plain shell assignments, even from a `()`-subshell caller (reproduced once
# in this session: a plain COMPOSE_LOG left fake_compose.sh's own
# `${COMPOSE_LOG:?}` unset, exiting nonzero and masking the real quiesce
# result behind a confusing downstream "receipt does not exist" failure).
export COMPOSE_LOG="${TEST_ROOT}/compose.log"
: > "${COMPOSE_LOG}"

migrations_json() {
  local n sha entries=()
  for n in "${M1_NAMES[@]}" "${M8}" "${M9}" "${M10}" "${M11}"; do
    sha="$(sha256sum "${ROOT_DIR}/apps/v1_api/prisma/migrations/${n}/migration.sql" | awk '{print $1}')"
    entries+=("$(jq -nc --arg n "${n}" --arg s "${sha}" '{name:$n,sha256:$s}')")
  done
  printf '%s\n' "${entries[@]}" | jq -sc .
}
make_manifest() {
  local stage="$1" out="$2"
  jq -n --arg sha "${RELEASE_SHA_A}" --argjson migrations "$(migrations_json)" \
    --arg api "${API_IMAGE}" --arg tool "${TOOL_IMAGE}" --arg stage "${stage}" '
  { release: {sha:$sha},
    images: {api:{uri:$api}, cutoverTool:{uri:$tool}},
    database: {task168: {stage:$stage, migrations:$migrations, rehearsal:{evidence:"task175 task6 real-db integration test"}}}
  }' > "${out}"
}
manifest_a="${TEST_ROOT}/manifest-stagea.json"
manifest_b="${TEST_ROOT}/manifest-stageb.json"
make_manifest stageA "${manifest_a}"
make_manifest stageB "${manifest_b}"

echo "--- Stage A: real quiesce + real pg_dump/pg_restore backup + real pre-migrate (own functions, direct call) ---"
run_stage_a_prelude() (
  set -Eeuo pipefail
  PROD_TASK168_DATABASE_URL="${DATABASE_URL}"
  PROD_TASK168_DOCKER="docker"
  PROD_TASK168_DB_NETWORK="bridge"
  PROD_TASK168_STATE_ROOT="${TEST_ROOT}/state/task168"
  PROD_SOURCE_DIR="${ROOT_DIR}"
  PROD_MANIFEST_FILE="${manifest_a}"
  compose=(bash "${fake_compose}")
  source "${RUNNER_COMMON}"
  source "${RUNNER_SH}"
  db_id="$(prod_db_identity)"
  state_dir="${PROD_TASK168_STATE_ROOT}/${RELEASE_SHA_A}"
  install -d -m 700 "${state_dir}" "${state_dir}/report"
  _stage_a_quiesce "${RELEASE_SHA_A}" "${API_IMAGE}" "${db_id}" "${state_dir}/quiesce.json"
  _stage_a_backup "${RELEASE_SHA_A}" "${API_IMAGE}" "${db_id}" "${state_dir}/backup.dump" "${state_dir}/backup.json"
  _stage_a_run_migrations pre "${API_IMAGE}"
)
if run_stage_a_prelude >"${TEST_ROOT}/prelude.log" 2>&1; then
  ok "Stage A prelude: real quiesce + real pg_dump/pg_restore + real pre-migrate (M1/M8/M10 + gap) all succeeded"
else
  cat "${TEST_ROOT}/prelude.log" >&2
  bad "Stage A prelude failed"
fi

# Seeded only NOW (after the pre-migrate phase above has applied M1) --
# the fixture below creates v1_team_matches/v1_tournament_match_details rows
# with M1-added columns (e.g. v1_team_matches.tournament_id); seeding any
# earlier hits a real "column does not exist" error (reproduced once in this
# session while building this file, before this ordering was fixed).
echo "--- seeding real legacy tournament-fixture rows (adapted from the pinned archive's own scripts/qa/task168-seed-cutover-fullrun.ts) ---"
seed_file="${TEST_ROOT}/task168-seed-cutover-fullrun.ts"
cat > "${seed_file}" <<TSEOF
import { PrismaService } from '../../apps/v1_api/src/prisma/prisma.service';
import { FOOTBALL_V1_CONFIG } from '../../apps/v1_api/src/tournaments/competition-config/competition-config';
const id = (suffix: string) => \`68168000-0000-4000-8000-\${suffix.padStart(12, '0')}\`;
const ids = {
  sport: id('700'), config: id('701'), tournament: id('702'), owner: id('703'), homeUser: id('704'), awayUser: id('705'),
  region: id('706'), homeTeam: id('707'), awayTeam: id('708'), homeRegistration: id('709'), awayRegistration: id('710'),
  homePlayer: id('711'), awayPlayer: id('712'), completedFixture: id('713'), targetFixture: id('714'), scheduledFixture: id('715'),
  cancelledFixture: id('716'), completedGame: id('717'), completedRevision: id('718'), completedResult: id('719'), completedGoal: id('720'),
  completedHomeSide: id('721'), completedAwaySide: id('722'), legacyVideo: id('723'), advancement: id('724'),
  staffAssignment: id('725'), staffScope: id('726'), audit: id('727'),
} as const;
async function main() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  if (databaseUrl.pathname.replace(/^\\//, '') !== '${SCRATCH_DB}') {
    throw new Error('this seed is scoped to the disposable ${SCRATCH_DB} database only');
  }
  const prisma = new PrismaService();
  try {
    const result = await prisma.\$transaction(async (tx) => {
      await tx.v1Sport.create({ data: { id: ids.sport, code: \`task168-full-\${ids.sport.slice(-6)}\`, name: 'Task 168 full-run sport', sortOrder: 1 } });
      await tx.v1CompetitionConfigVersion.create({ data: { id: ids.config, sportCode: 'football', name: 'Task 168 full-run config', version: 1, periods: FOOTBALL_V1_CONFIG.periods, events: FOOTBALL_V1_CONFIG.events, lineup: FOOTBALL_V1_CONFIG.lineup, result: FOOTBALL_V1_CONFIG.result, tieBreak: FOOTBALL_V1_CONFIG.tieBreak, visibility: FOOTBALL_V1_CONFIG.visibility, contentHash: \`task168-full-\${ids.config}\` } });
      await tx.v1Tournament.create({ data: { id: ids.tournament, sportId: ids.sport, title: 'Task 168 full-run source', status: 'in_progress', kind: 'regular_tournament', competitionConfigVersionId: ids.config } });
      await tx.v1User.createMany({ data: [
        { id: ids.owner, email: \`\${ids.owner}@task168-full.example.test\`, accountStatus: 'active', onboardingStatus: 'completed' },
        { id: ids.homeUser, email: \`\${ids.homeUser}@task168-full.example.test\`, accountStatus: 'active', onboardingStatus: 'completed' },
        { id: ids.awayUser, email: \`\${ids.awayUser}@task168-full.example.test\`, accountStatus: 'active', onboardingStatus: 'completed' },
      ] });
      await tx.v1Region.create({ data: { id: ids.region, code: \`task168-full-\${ids.region.slice(-6)}\`, name: 'Task 168 full-run region', level: 1 } });
      await tx.v1Team.createMany({ data: [
        { id: ids.homeTeam, ownerUserId: ids.owner, sportId: ids.sport, regionId: ids.region, name: 'Task 168 Home' },
        { id: ids.awayTeam, ownerUserId: ids.owner, sportId: ids.sport, regionId: ids.region, name: 'Task 168 Away' },
      ] });
      await tx.v1TournamentRegistration.createMany({ data: [
        { id: ids.homeRegistration, tournamentId: ids.tournament, teamId: ids.homeTeam, appliedByUserId: ids.owner, status: 'confirmed', confirmedAt: new Date('2026-08-01T00:00:00.000Z') },
        { id: ids.awayRegistration, tournamentId: ids.tournament, teamId: ids.awayTeam, appliedByUserId: ids.owner, status: 'confirmed', confirmedAt: new Date('2026-08-01T00:00:00.000Z') },
      ] });
      await tx.v1TournamentPlayer.createMany({ data: [
        { id: ids.homePlayer, registrationId: ids.homeRegistration, userId: ids.homeUser, realName: 'Task 168 Home Player', addedAt: new Date('2026-08-01T00:00:00.000Z') },
        { id: ids.awayPlayer, registrationId: ids.awayRegistration, userId: ids.awayUser, realName: 'Task 168 Away Player', addedAt: new Date('2026-08-01T00:00:00.000Z') },
      ] });
      await tx.v1TournamentFixture.createMany({ data: [
        { id: ids.completedFixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, status: 'completed', competitionConfigVersionId: ids.config, homeRegistrationId: ids.homeRegistration, awayRegistrationId: ids.awayRegistration, scheduledAt: new Date('2026-08-02T09:00:00.000Z') },
        { id: ids.targetFixture, tournamentId: ids.tournament, round: 'final', fixtureNumber: 2, status: 'scheduled', competitionConfigVersionId: ids.config },
        { id: ids.scheduledFixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 3, status: 'scheduled', competitionConfigVersionId: ids.config },
        { id: ids.cancelledFixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 4, status: 'cancelled', competitionConfigVersionId: ids.config },
      ] });
      await tx.v1Game.create({ data: { id: ids.completedGame, sourceType: 'TOURNAMENT_FIXTURE', tournamentFixtureId: ids.completedFixture, competitionConfigVersionId: ids.config, state: 'ENDED' } });
      await tx.v1GameSide.createMany({ data: [
        { id: ids.completedHomeSide, gameId: ids.completedGame, sideKey: 'HOME', teamId: ids.homeTeam, displayNameSnapshot: 'Task 168 Home' },
        { id: ids.completedAwaySide, gameId: ids.completedGame, sideKey: 'AWAY', teamId: ids.awayTeam, displayNameSnapshot: 'Task 168 Away' },
      ] });
      const officialRevision = await tx.v1GameResultRevision.create({ data: { id: ids.completedRevision, gameId: ids.completedGame, revision: 1, state: 'OFFICIAL', officialAt: new Date('2026-08-02T11:00:00.000Z'), score: { regulation: { home: 1, away: 0 }, penalty: null, provenance: 'TOURNAMENT_FIXTURE_RESULT', goals: [{ team: 'home', playerId: ids.homePlayer, playerName: 'Task 168 Home Player', minute: 17 }] }, goalEvents: null, eventsHash: 'task168-fullrun-official', createdByActorType: 'SYSTEM', createdBySystemActor: 'GAME_BACKFILL' } });
      await tx.v1Game.update({ where: { id: ids.completedGame }, data: { currentOfficialRevisionId: officialRevision.id } });
      await tx.v1TournamentFixtureResult.create({ data: { id: ids.completedResult, fixtureId: ids.completedFixture, homeScore: 1, awayScore: 0, hasPenalty: false, recordedAt: new Date('2026-08-02T11:00:00.000Z') } });
      await tx.v1TournamentFixtureGoal.create({ data: { id: ids.completedGoal, fixtureResultId: ids.completedResult, team: 'home', playerId: ids.homePlayer, playerName: 'Task 168 Home Player', minute: 17 } });
      await tx.v1TournamentFixtureVideo.create({ data: { id: ids.legacyVideo, fixtureId: ids.completedFixture, title: 'Task 168 legacy video', url: 'https://example.test/task168-video', sortOrder: 1 } });
      await tx.v1TournamentFixtureAdvancementEdge.create({ data: { id: ids.advancement, tournamentId: ids.tournament, sourceFixtureId: ids.completedFixture, sourceOutcome: 'WINNER', targetFixtureId: ids.targetFixture, targetSide: 'HOME' } });
      await tx.v1TeamMatch.create({ data: { id: ids.completedFixture, tournamentId: ids.tournament, sportId: ids.sport, title: 'Task 168 mixed canonical match', competitionConfigVersionId: ids.config, status: 'completed', hostTeamId: ids.homeTeam, approvedApplicantTeamId: ids.awayTeam, startAt: new Date('2026-08-02T09:00:00.000Z') } });
      await tx.v1TournamentMatchDetails.create({ data: { teamMatchId: ids.completedFixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, homeRegistrationId: ids.homeRegistration, awayRegistrationId: ids.awayRegistration } });
      await tx.v1TournamentStaffAssignment.create({ data: { id: ids.staffAssignment, tournamentId: ids.tournament, userId: ids.owner, role: 'FIELD_OPERATOR', grantedByUserId: ids.owner } });
      await tx.v1TournamentStaffFixtureScope.create({ data: { id: ids.staffScope, assignmentId: ids.staffAssignment, fixtureId: ids.completedFixture, tournamentId: ids.tournament } });
      await tx.v1OperationAudit.create({ data: { id: ids.audit, actorType: 'USER', actorUserId: ids.owner, action: 'SOURCE_CUTOVER_FIXTURE_EDIT', resourceType: 'TOURNAMENT_FIXTURE', resourceId: ids.completedFixture, requestId: id('728'), before: { status: 'scheduled' }, after: { status: 'completed' }, reason: 'Task 168 full-run seed', tournamentId: ids.tournament, fixtureId: ids.completedFixture } });
      return { tournamentId: ids.tournament, completedFixtureId: ids.completedFixture };
    });
    process.stdout.write(\`\${JSON.stringify(result)}\n\`);
  } finally {
    await prisma.\$disconnect();
  }
}
main().catch((error) => {
  process.stderr.write(\`\${error instanceof Error ? error.stack ?? error.message : String(error)}\n\`);
  process.exitCode = 1;
});
TSEOF

"${REAL_DOCKER}" run --rm --network bridge --env-file /dev/stdin \
  -v "${seed_file}:/opt/task168/release/bundle/scripts/qa/task168-seed-cutover-fullrun.ts:ro" \
  --entrypoint node "${TOOL_IMAGE}" -r ts-node/register/transpile-only \
  /opt/task168/release/bundle/scripts/qa/task168-seed-cutover-fullrun.ts \
  < <(printf 'DATABASE_URL=%s\n' "${DATABASE_URL}") >"${TEST_ROOT}/seed.log" 2>&1 && seed_rc=0 || seed_rc=$?
if [[ "${seed_rc}" -eq 0 ]]; then
  ok "fixture setup: legacy tournament fixture rows seeded (1 sport/tournament/2 teams/4 fixtures/1 legacy game)"
else
  cat "${TEST_ROOT}/seed.log" >&2
  bad "fixture setup: legacy fixture seed failed (rc=${seed_rc})"
fi

echo "--- Stage A dispatcher: judges 'precutover' (quiesce/backup receipts exist, ledger matches, seals still 0|0|0) and runs its OWN _stage_a_run_cutover_tool() for real ---"
# Fix round 1, Important 1: this used to run the cutover tool via a standalone
# `docker run ... ${TOOL_IMAGE}` call BEFORE calling the dispatcher -- which
# meant _stage_a_run_cutover_tool() itself (the --network/--user/report-mount
# wiring, its rc==0 report-verification branch, its rc!=0 seal-based
# fallback) never actually ran against a real database in this file. Now the
# dispatcher is the ONLY thing that invokes the tool: with quiesce.json/
# backup.json already on disk (run_stage_a_prelude above) and the ledger
# matching the precutover set with seals still 0|0|0, task168_stage_a_state()
# judges "precutover", and task168_stage_a()'s precutover branch re-quiesces
# then calls _stage_a_run_cutover_tool() itself.
run_stage_a_dispatch() (
  set -Eeuo pipefail
  PROD_TASK168_DATABASE_URL="${DATABASE_URL}"
  PROD_TASK168_DOCKER="docker"
  PROD_TASK168_DB_NETWORK="bridge"
  PROD_TASK168_STATE_ROOT="${TEST_ROOT}/state/task168"
  PROD_SOURCE_DIR="${ROOT_DIR}"
  PROD_MANIFEST_FILE="${1}"
  compose=(bash "${fake_compose}")
  source "${RUNNER_COMMON}"
  source "${RUNNER_SH}"
  prod_task168_main "${2}"
)
if run_stage_a_dispatch "${manifest_a}" stageA >"${TEST_ROOT}/stagea.log" 2>&1; then
  ok "Stage A dispatcher: completed (precutover -> runner's own cutover tool call -> post-migrate -> transition.json)"
else
  cat "${TEST_ROOT}/stagea.log" >&2
  bad "Stage A dispatcher failed"
fi
# The report the RUNNER wrote via its own _stage_a_run_cutover_tool() --
# never a report this test wrote itself.
report_path="${TEST_ROOT}/state/task168/${RELEASE_SHA_A}/report/cutover-report.json"
if jq -e '.status=="COMPLETED" and .result.verification.remainingLegacyGameLinks==0 and .result.verification.remainingLegacyStaffScopes==0 and .result.verification.remainingLegacyAuditScopes==0 and .result.verification.fixtureCount>=1' "${report_path}" >/dev/null 2>&1; then
  ok "cutover tool (invoked by the runner's own _stage_a_run_cutover_tool()): COMPLETED, zero remaining legacy links, fixtureCount=$(jq '.result.verification.fixtureCount' "${report_path}" 2>/dev/null)"
else
  bad "the runner's own cutover-report.json is missing or not a clean COMPLETED result: $(cat "${report_path}" 2>&1)"
fi
transition_path="${TEST_ROOT}/state/task168/${RELEASE_SHA_A}/transition.json"
if jq -e '.schemaVersion==1 and .kind=="transition" and .status=="COMPLETED" and .stage=="stageA" and (.cutoverReportSha256|length==64)' "${transition_path}" >/dev/null 2>&1; then
  ok "transition.json: real, well-formed COMPLETED receipt with a bound real cutover report checksum"
else
  bad "transition.json missing or malformed: $(cat "${transition_path}" 2>&1)"
fi

echo "--- Stage B: real M11 migrate deploy (and everything after M11 in the current tree) + real backfill CLI ---"
if run_stage_a_dispatch "${manifest_b}" stageB >"${TEST_ROOT}/stageb.log" 2>&1; then
  ok "Stage B dispatcher: completed (M11 migrate -> migration-stage.json -> backfill CLI)"
else
  cat "${TEST_ROOT}/stageb.log" >&2
  bad "Stage B dispatcher failed"
fi
stage_receipt="${TEST_ROOT}/state/task168/${RELEASE_SHA_A}/migration-stage.json"
if jq -e '.schemaVersion==1 and .kind=="migrationStage" and .status=="MIGRATION_COMMITTED" and .appliedCount==11' "${stage_receipt}" >/dev/null 2>&1; then
  ok "migration-stage.json: real MIGRATION_COMMITTED receipt, appliedCount=11 (M1..M11)"
else
  bad "migration-stage.json missing or malformed: $(cat "${stage_receipt}" 2>&1)"
fi

echo "--- unresolved (genuinely stuck/self-contradictory) ledger rows must be 0 after Stage B ---"
# Not "NOT (finished AND not-rolled-back)" -- that naive form also counts a
# CLEANLY rolled-back row (finished_at NULL, rolled_back_at SET) as
# "unresolved", which is normal Prisma history, not a defect (the rehearsal
# against a real prod_pristine copy has exactly 2 such rows, both resolved
# long ago -- see task-6-report.md). This matches the runner's own
# _assert_pre_m1_name_set anomalous-row definition: still-pending (neither
# finished nor rolled back) OR self-contradictory (both set).
unresolved="$("${REAL_DOCKER}" exec promo_test_pg psql -U postgres -d "${SCRATCH_DB}" -At -c \
  "SELECT count(*) FROM _prisma_migrations WHERE (finished_at IS NULL AND rolled_back_at IS NULL) OR (finished_at IS NOT NULL AND rolled_back_at IS NOT NULL)")"
[[ "${unresolved}" == 0 ]] && ok "ledger: 0 unresolved (stuck/self-contradictory) rows after Stage B" || bad "ledger has ${unresolved} unresolved row(s) after Stage B"

echo "--- schema drift check: real 'prisma migrate diff' against the current tree's schema.prisma ---"
"${REAL_DOCKER}" run --rm --network bridge --env-file /dev/stdin "${API_IMAGE}" \
  sh -c 'cd /app/apps/v1_api && ./node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code' \
  < <(printf 'DATABASE_URL=%s\n' "${DATABASE_URL}") >"${TEST_ROOT}/drift.log" 2>&1 && drift_rc=0 || drift_rc=$?
[[ "${drift_rc}" -eq 0 ]] && ok "drift check: real prisma migrate diff reports no difference (rc=0)" ||
  { cat "${TEST_ROOT}/drift.log" >&2; bad "drift check: prisma migrate diff found drift or failed (rc=${drift_rc})"; }

echo "--- I1: Stage A rerun after Stage B must be safely refused (idempotent-safe, not a crash or a repeat) ---"
if run_stage_a_dispatch "${manifest_a}" stageA >"${TEST_ROOT}/stagea-rerun.log" 2>&1; then
  bad "Stage A rerun after Stage B was wrongly ACCEPTED -- must refuse once M11 exists"
else
  if grep -q 'not a recognized Stage A state' "${TEST_ROOT}/stagea-rerun.log"; then
    ok "Stage A rerun after Stage B: safely refused with a clean message (never touched the DB again)"
  else
    bad "Stage A rerun after Stage B was refused, but not with the expected clean message: $(cat "${TEST_ROOT}/stagea-rerun.log")"
  fi
fi

echo "--- I2: Stage B rerun after success is idempotent (post-M11 invariant: prod_assert_legacy_tables_retired) ---"
# task168_stage_b()'s "migration-stage.json already committed" resume branch
# calls prod_assert_legacy_tables_retired() (not prod_assert_cutover_seals())
# precisely because this branch is always post-M11 by construction -- fix
# round 4 (deploy/prod-task168.sh commit 96fb1d167). Assert not just rc==0
# but that NOTHING changed: no migrate re-invocation (ledger's full
# name|finished_at snapshot identical before/after -- Prisma never re-stamps
# an already-applied row, so this is strong evidence the migrate CLI was
# never even invoked, not just that it would have been a no-op) and
# migration-stage.json byte-identical (fix round 1, M-1).
ledger_snapshot() {
  "${REAL_DOCKER}" exec promo_test_pg psql -U postgres -d "${SCRATCH_DB}" -At -c \
    "SELECT migration_name || '|' || finished_at FROM _prisma_migrations ORDER BY migration_name"
}
before_ledger="$(ledger_snapshot)"
before_stage_sha="$(sha256sum "${stage_receipt}" | awk '{print $1}')"
if run_stage_a_dispatch "${manifest_b}" stageB >"${TEST_ROOT}/stageb-rerun.log" 2>&1; then
  ok "Stage B rerun after success: idempotent (rc=0)"
else
  bad "Stage B rerun after success failed: $(tail -3 "${TEST_ROOT}/stageb-rerun.log")"
fi
after_ledger="$(ledger_snapshot)"
after_stage_sha="$(sha256sum "${stage_receipt}" | awk '{print $1}')"
[[ "${before_ledger}" == "${after_ledger}" ]] &&
  ok "I2 (M-1): ledger snapshot (migration_name|finished_at, all rows) byte-identical before/after -- migrate deploy was never re-invoked" ||
  bad "I2 (M-1): ledger snapshot changed across the rerun -- something re-touched the migration history"
[[ "${before_stage_sha}" == "${after_stage_sha}" ]] &&
  ok "I2 (M-1): migration-stage.json sha256 unchanged across the rerun (receipt not rewritten)" ||
  bad "I2 (M-1): migration-stage.json sha256 changed across the rerun (${before_stage_sha} -> ${after_stage_sha})"

echo "--- M-2: delete migration-stage.json, rerun Stage B a 3rd time -> exercises the SIBLING resume branch (prod-task168.sh:877, ledger already full M1..M11 but receipt missing, confirmed via m11-entry.json instead) ---"
rm -f "${stage_receipt}"
if run_stage_a_dispatch "${manifest_b}" stageB >"${TEST_ROOT}/stageb-rerun2.log" 2>&1; then
  ok "Stage B rerun after deleting migration-stage.json: resumed via m11-entry.json (rc=0)"
else
  cat "${TEST_ROOT}/stageb-rerun2.log" >&2
  bad "Stage B rerun after deleting migration-stage.json failed"
fi
if grep -q 'm11-entry.json confirms this Stage B run' "${TEST_ROOT}/stageb-rerun2.log"; then
  ok "M-2: the runner's own log confirms it took the m11-entry.json resume branch, not a fresh M11 migrate"
else
  bad "M-2: expected the m11-entry.json resume branch's own log line, got: $(cat "${TEST_ROOT}/stageb-rerun2.log")"
fi
if jq -e '.schemaVersion==1 and .kind=="migrationStage" and .status=="MIGRATION_COMMITTED" and .appliedCount==11' "${stage_receipt}" >/dev/null 2>&1; then
  ok "M-2: migration-stage.json rewritten fresh by the m11-entry.json resume branch, still a valid MIGRATION_COMMITTED receipt"
else
  bad "M-2: migration-stage.json missing or malformed after the m11-entry.json resume: $(cat "${stage_receipt}" 2>&1)"
fi

echo
echo "=== summary: ${failures} failing assertion(s) ==="
if [[ "${failures}" -gt 0 ]]; then
  echo "[test-prod-task168-real-db] ${failures} assertion(s) failed -- see task-6-report.md" >&2
fi
exit "${failures}"
