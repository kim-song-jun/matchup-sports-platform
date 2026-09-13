#!/usr/bin/env bash
set -Eeuo pipefail

# Contract tests for scripts/release/package-task168-final-source.sh, using
# scripts/release/prepare-task168-final-stage-inputs.sh to build its input.
# Synthetic git fixture only; no Docker, no DB, no network, no real repo scan.
#
# Deletion -> expected red (recorded here; the session that added this test
# ran each deletion against a scratch copy of the script and counted red):
#   git_mode() normalization reverted to raw `stat`         -> red on determinism test (1)
#   FINAL_SCHEMA_SHA/M11_SHA constants or their assertions  -> red on tamper-reject test (3)
#   source-migration-inventory check (source vs history)   -> red on drift test (4)
#   apps/v1_api/prisma/ allowlist check                     -> red on rogue-file test (5)
#   sidecar-first / rollback-on-archive-failure publish     -> red on mid-publish-failure test (7)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
PREPARE="$REPO_ROOT/scripts/release/prepare-task168-final-stage-inputs.sh"
PACKAGE="$REPO_ROOT/scripts/release/package-task168-final-source.sh"
FINAL_SCHEMA="$REPO_ROOT/deploy/task168-final-drop/schema.prisma"
M11_FILE="$REPO_ROOT/deploy/task168-final-drop/migrations/20260911090000_retire_tournament_fixture_tables/migration.sql"

[[ -x "$PREPARE" ]] || { echo "FAIL: missing $PREPARE" >&2; exit 1; }
[[ -x "$PACKAGE" ]] || { echo "FAIL: missing $PACKAGE" >&2; exit 1; }
[[ -f "$FINAL_SCHEMA" ]] || { echo "FAIL: missing $FINAL_SCHEMA" >&2; exit 1; }
[[ -f "$M11_FILE" ]] || { echo "FAIL: missing $M11_FILE" >&2; exit 1; }

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/task168-package-contract.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# ---- build a small synthetic source repository -----------------------------
REPO="$TMP/repo"
mkdir -p "$REPO"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.email test@example.com
git -C "$REPO" config user.name test

MIGRATIONS=(
  20260908130000_v1_team_match_tournament_expand
  20260908150000_v1_operation_audit_team_match_expand
  20260908160000_v1_official_fact_team_match_scope
  20260908170000_v1_lineup_invalidation
  20260908180000_v1_staff_scope_team_match
  20260909000000_v1_tournament_result_lineage
  20260909110000_v1_operation_audit_canonical_binding
  20260910010000_v1_official_fact_source_history
  20260910020000_v1_canonical_game_db_guards
  20260910160000_v1_outbox_cutover_claim_gate
)
mkdir -p "$REPO/apps/v1_api/prisma/migrations"
printf 'provider = "postgresql"\n' > "$REPO/apps/v1_api/prisma/migrations/migration_lock.toml"
# Two pre-Task168 migrations so the full history exceeds the preparer's own
# "did the archive really capture the whole tree, not just the ten curated
# names" sanity floor (fullMigrationHistory length > 11).
for m in 20260101000000_pre_history_one 20260102000000_pre_history_two; do
  mkdir -p "$REPO/apps/v1_api/prisma/migrations/$m"
  printf -- '-- pre-history migration %s\nSELECT 1;\n' "$m" > "$REPO/apps/v1_api/prisma/migrations/$m/migration.sql"
done
for m in "${MIGRATIONS[@]}"; do
  mkdir -p "$REPO/apps/v1_api/prisma/migrations/$m"
  printf -- '-- synthetic migration %s\nSELECT 1;\n' "$m" > "$REPO/apps/v1_api/prisma/migrations/$m/migration.sql"
done
printf 'generator client {\n  provider = "prisma-client-js"\n}\n' > "$REPO/apps/v1_api/prisma/schema.prisma"
printf 'export {};\n' > "$REPO/apps/v1_api/prisma/seed.ts"
mkdir -p "$REPO/apps/v1_api/prisma/data"
printf '{}\n' > "$REPO/apps/v1_api/prisma/data/terms.json"
printf 'generator client {\n  provider = "prisma-client-js"\n}\n' > "$REPO/apps/v1_api/prisma/schema.stage-a.prisma"
printf '# synthetic fixture repo\n' > "$REPO/README.md"
git -C "$REPO" add -A
git -C "$REPO" commit -q -m 'synthetic base'
BASE_SHA="$(git -C "$REPO" rev-parse HEAD)"

PREPARED="$TMP/prepared"
"$PREPARE" --source-dir "$REPO" --source-commit "$BASE_SHA" \
  --final-schema "$FINAL_SCHEMA" --m11 "$M11_FILE" --output-dir "$PREPARED" >/dev/null \
  || fail 'baseline preparer run should succeed against the synthetic fixture'
pass 'preparer materializes StageB inputs from the synthetic fixture'

run_expect_fail() {
  local expected="$1"; shift
  local out rc
  set +e
  out="$("$@" 2>&1)"
  rc=$?
  set -e
  [[ $rc -ne 0 ]] || fail "expected failure but rc=0: $* -- output: $out"
  grep -Fq "$expected" <<<"$out" || fail "expected failure text missing ('$expected'): $out"
}

# ---- 1. determinism: golden sha across umask x3 and TZ x3 (BLOCK-1) --------
GOLDEN=
for um in 022 077 002; do
  out="$TMP/pkg-umask-$um.tar.gz"
  (umask "$um"; "$PACKAGE" --source-dir "$REPO" --source-commit "$BASE_SHA" \
    --prepared-dir "$PREPARED" --final-schema "$FINAL_SCHEMA" --m11 "$M11_FILE" \
    --output-archive "$out") >/dev/null
  sha="$(sha256sum "$out" | awk '{print $1}')"
  [[ -n "$GOLDEN" ]] || GOLDEN="$sha"
  [[ "$sha" == "$GOLDEN" ]] || fail "umask $um produced a different archive sha ($sha != $GOLDEN)"
done
pass "archive sha is umask-independent (022/077/002 all -> $GOLDEN)"

for tz in UTC America/New_York Pacific/Apia; do
  out="$TMP/pkg-tz-$(tr '/' '_' <<<"$tz").tar.gz"
  TZ="$tz" "$PACKAGE" --source-dir "$REPO" --source-commit "$BASE_SHA" \
    --prepared-dir "$PREPARED" --final-schema "$FINAL_SCHEMA" --m11 "$M11_FILE" \
    --output-archive "$out" >/dev/null
  sha="$(sha256sum "$out" | awk '{print $1}')"
  [[ "$sha" == "$GOLDEN" ]] || fail "TZ=$tz produced a different archive sha ($sha != $GOLDEN)"
done
pass "archive sha is TZ-independent (UTC/America/New_York/Pacific/Apia all -> $GOLDEN)"
[[ -s "$TMP/pkg-umask-022.tar.gz.attestation.json" ]] || fail 'sidecar was not published alongside the golden archive'
jq -e --arg h "$GOLDEN" '.archiveSha256 == $h' "$TMP/pkg-umask-022.tar.gz.attestation.json" >/dev/null \
  || fail 'sidecar archiveSha256 does not match the published archive'
pass 'sidecar is published at ${OUTPUT_ARCHIVE}.attestation.json and authenticates the archive bytes'

# ---- 2. existing output is refused, no side effects (BLOCK-2) -------------
out="$TMP/pkg-exists.tar.gz"
: > "$out"
run_expect_fail 'refusing to overwrite an existing output' \
  "$PACKAGE" --source-dir "$REPO" --source-commit "$BASE_SHA" \
  --prepared-dir "$PREPARED" --final-schema "$FINAL_SCHEMA" --m11 "$M11_FILE" \
  --output-archive "$out"
[[ ! -s "$out" ]] || fail 'pre-existing empty output must be left untouched, not grown'
[[ ! -e "$out.attestation.json" ]] || fail 'a sidecar must not appear for a refused publish'
pass 'refuses to overwrite an existing output archive'

# ---- 3. BLOCK-3: reviewed-hash tamper is rejected even after rehash -------
TAMPER_DIR="$TMP/prepared-tampered"
cp -R "$PREPARED" "$TAMPER_DIR"
printf '\n// tampered\n' >> "$TAMPER_DIR/apps/v1_api/prisma/schema.prisma"
tampered_sha="$(sha256sum "$TAMPER_DIR/apps/v1_api/prisma/schema.prisma" | awk '{print $1}')"
tampered_bytes="$(wc -c < "$TAMPER_DIR/apps/v1_api/prisma/schema.prisma" | tr -d ' ')"
jq --arg h "$tampered_sha" --argjson b "$tampered_bytes" \
  '.finalSchema.sha256 = $h | .files = (.files | map(if .path == "apps/v1_api/prisma/schema.prisma" then (.sha256 = $h | .bytes = $b) else . end))' \
  "$PREPARED/INPUT-MANIFEST.json" > "$TAMPER_DIR/INPUT-MANIFEST.json"
run_expect_fail 'does not match the reviewed checksum' \
  "$PACKAGE" --source-dir "$REPO" --source-commit "$BASE_SHA" \
  --prepared-dir "$TAMPER_DIR" --final-schema "$TAMPER_DIR/apps/v1_api/prisma/schema.prisma" --m11 "$M11_FILE" \
  --output-archive "$TMP/pkg-tamper.tar.gz"
[[ ! -e "$TMP/pkg-tamper.tar.gz" ]] || fail 'tampered packaging must not publish an archive'
pass 'a 1-byte tamper of the reviewed schema is rejected even after the manifest is rehashed to match'

# ---- 4. reviewed history is missing a migration the pinned commit really
#         has (an attacker who edits fullMigrationHistory + files[] + deletes
#         the materialized directory together, consistently, still cannot
#         hide a real migration from the packager's own independent re-scan
#         of the pinned commit) ------------------------------------------
DRIFT_DIR="$TMP/prepared-drift"
cp -R "$PREPARED" "$DRIFT_DIR"
HIDDEN=20260909000000_v1_tournament_result_lineage
rm -rf "${DRIFT_DIR:?}/apps/v1_api/prisma/migrations/$HIDDEN"
jq --arg hidden "apps/v1_api/prisma/migrations/$HIDDEN/migration.sql" --arg hiddenName "$HIDDEN" \
  '.files = (.files | map(select(.path != $hidden))) | .fullMigrationHistory = (.fullMigrationHistory | map(select(.name != $hiddenName)))' \
  "$PREPARED/INPUT-MANIFEST.json" > "$DRIFT_DIR/INPUT-MANIFEST.json"
run_expect_fail 'migration directory outside the reviewed full migration history' \
  "$PACKAGE" --source-dir "$REPO" --source-commit "$BASE_SHA" \
  --prepared-dir "$DRIFT_DIR" --final-schema "$FINAL_SCHEMA" --m11 "$M11_FILE" \
  --output-archive "$TMP/pkg-drift.tar.gz"
pass 'rejects a reviewed history that consistently omits a migration the pinned source commit actually contains'

# ---- 5. rogue file under apps/v1_api/prisma/ is rejected -------------------
# A new commit needs its own freshly prepared inputs: the packager requires
# --source-commit to equal the prepared manifest's own sourceCommit, so the
# rogue file must live in the very commit the reused-preparer run points at.
git -C "$REPO" checkout -q -b rogue
printf 'print("rogue")\n' > "$REPO/apps/v1_api/prisma/rogue.py"
git -C "$REPO" add -A
git -C "$REPO" commit -q -m 'unexpected file under prisma'
ROGUE_SHA="$(git -C "$REPO" rev-parse HEAD)"
ROGUE_PREPARED="$TMP/prepared-rogue"
"$PREPARE" --source-dir "$REPO" --source-commit "$ROGUE_SHA" \
  --final-schema "$FINAL_SCHEMA" --m11 "$M11_FILE" --output-dir "$ROGUE_PREPARED" >/dev/null \
  || fail 'preparer run for the rogue-file fixture should succeed (rogue.py is outside migrations/)'
run_expect_fail 'unexpected file under apps/v1_api/prisma/' \
  "$PACKAGE" --source-dir "$REPO" --source-commit "$ROGUE_SHA" \
  --prepared-dir "$ROGUE_PREPARED" --final-schema "$FINAL_SCHEMA" --m11 "$M11_FILE" \
  --output-archive "$TMP/pkg-rogue.tar.gz"
pass 'rejects an unlisted file under apps/v1_api/prisma/ that is not on the extra-files allowlist'
git -C "$REPO" checkout -q main

# ---- 6. symlink in source tree is rejected ---------------------------------
git -C "$REPO" checkout -q -b symlinked
ln -s apps/v1_api/prisma/schema.prisma "$REPO/schema-link"
git -C "$REPO" add -A
git -C "$REPO" commit -q -m 'introduce a symlink'
SYMLINK_SHA="$(git -C "$REPO" rev-parse HEAD)"
SYMLINK_PREPARED="$TMP/prepared-symlink"
"$PREPARE" --source-dir "$REPO" --source-commit "$SYMLINK_SHA" \
  --final-schema "$FINAL_SCHEMA" --m11 "$M11_FILE" --output-dir "$SYMLINK_PREPARED" >/dev/null \
  || fail 'preparer run for the symlink fixture should succeed (the symlink is outside migrations/)'
run_expect_fail 'source archive contains a symlink' \
  "$PACKAGE" --source-dir "$REPO" --source-commit "$SYMLINK_SHA" \
  --prepared-dir "$SYMLINK_PREPARED" --final-schema "$FINAL_SCHEMA" --m11 "$M11_FILE" \
  --output-archive "$TMP/pkg-symlink.tar.gz"
pass 'rejects a source tree that contains a symlink'
git -C "$REPO" checkout -q main

# ---- 7. mid-publish failure leaves no unpaired residue (BLOCK-2) ----------
# Deterministically fail only the archive-publish hard-link call (the second
# `ln`) via PATH shadowing, so this does not depend on winning a wall-clock
# race against the script: a fake `ln` ahead of the real one on PATH passes
# sidecar publishes straight through to the real /bin/ln (destination ends in
# .attestation.json) and refuses everything else.
OUT_DIR="$TMP/midfail"
mkdir -p "$OUT_DIR"
ARCHIVE_OUT="$OUT_DIR/final.tar.gz"
ATTESTATION_OUT="${ARCHIVE_OUT}.attestation.json"
SHIM_DIR="$TMP/ln-shim"
mkdir -p "$SHIM_DIR"
cat > "$SHIM_DIR/ln" <<'SHIM'
#!/usr/bin/env bash
last="${@: -1}"
case "$last" in
  *.attestation.json) exec /bin/ln "$@" ;;
  *) exit 1 ;;
esac
SHIM
chmod +x "$SHIM_DIR/ln"
set +e
PATH="$SHIM_DIR:$PATH" "$PACKAGE" --source-dir "$REPO" --source-commit "$BASE_SHA" \
  --prepared-dir "$PREPARED" --final-schema "$FINAL_SCHEMA" --m11 "$M11_FILE" \
  --output-archive "$ARCHIVE_OUT" >"$OUT_DIR/stdout.log" 2>"$OUT_DIR/stderr.log"
rc=$?
set -e
[[ "$rc" != "0" ]] || fail 'archive publish should have failed under the ln shim'
grep -Fq 'the just-published attestation was removed' "$OUT_DIR/stderr.log" \
  || fail "expected orphan-removal diagnostic missing: $(cat "$OUT_DIR/stderr.log")"
[[ ! -e "$ATTESTATION_OUT" ]] || fail 'a sidecar must not survive when its archive publish failed'
[[ ! -e "$ARCHIVE_OUT" ]] || fail 'no archive should exist when its publish failed'
leftovers="$(find "$OUT_DIR" -maxdepth 1 -name '*.tmp.*' -print)"
[[ -z "$leftovers" ]] || fail "temp files were left behind after a mid-publish failure: $leftovers"
pass 'a failure between sidecar and archive publish removes the orphaned sidecar and leaves no temp residue'

echo 'ALL PACKAGE CONTRACT TESTS PASSED'
