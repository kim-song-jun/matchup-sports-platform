#!/usr/bin/env bash
set -Eeuo pipefail

# Task 168 M11 converged (post-StageB): binds the release manifest to the
# final post-retirement schema and the M11 migration file, exactly the way
# prepare-task168-stage-manifest-inputs.sh bound the StageA release to the
# r5 schema and v7 archive. Unlike that script this one does not freeze a
# fixed migration list — deploy/task168-final-steady-migrate.sh reads the
# candidate source tree directly against the live DB ledger at deploy time
# (see its L1-L4 check), so migrations after M11 do not require touching
# this binder.

# Task 172 adds shared match record/history tables; M11 remains immutable.
schema=apps/v1_api/prisma/schema.prisma
m11=apps/v1_api/prisma/migrations/20260911090000_retire_tournament_fixture_tables/migration.sql
[[ -f "$schema" && -f "$m11" ]] || { echo 'Task168 final-policy source inputs missing' >&2; exit 1; }

schema_sha="$(sha256sum "$schema" | awk '{print $1}')"
m11_sha="$(sha256sum "$m11" | awk '{print $1}')"
[[ "$schema_sha" == 8f732248e1e0bf1882184dd35cec3d5a48a65ce5556c250de486c7e5955ebade \
  && "$m11_sha" == 08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323 ]] \
  || { echo 'Task168 final-policy schema/M11 digest mismatch' >&2; exit 1; }

printf 'TASK168_SCHEMA_SHA256=%s\nTASK168_M11_SHA256=%s\n' "$schema_sha" "$m11_sha" >> "$GITHUB_ENV"
