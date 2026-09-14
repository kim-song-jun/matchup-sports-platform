#!/usr/bin/env bash
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
PREFLIGHT="$REPO_ROOT/scripts/release/task168-final-image-preflight.sh"
RELEASE_DIR="$REPO_ROOT/scripts/release"
[[ -x "$PREFLIGHT" ]] || { echo "FAIL: missing $PREFLIGHT" >&2; exit 1; }
[[ -f "$RELEASE_DIR/task168_canonical_tar.py" ]] || { echo "FAIL: missing $RELEASE_DIR/task168_canonical_tar.py" >&2; exit 1; }
[[ -f "$HERE/task168_test_fixtures.py" ]] || { echo "FAIL: missing $HERE/task168_test_fixtures.py" >&2; exit 1; }

# Builds a fixture archive through the same canonical serializer
# scripts/release/package-task168-final-source.sh uses (see
# task168_canonical_tar.py), instead of shelling out to `tar` or driving
# Python's own tarfile module. The preflight now proves an archive canonical
# by re-encoding what it parsed through that exact module and requiring a
# byte-for-byte match, so any fixture meant to clear that check has to be
# built by the same module -- tarfile's own PAX_FORMAT writer does not
# reproduce this module's byte layout (different devmajor/devminor and pax
# header conventions), and would make every "good" fixture below fail with
# 'not in canonical form' instead of exercising the check the test names.
write_clean_tar() {
  local workdir="$1" out="$2"; shift 2
  python3 - "$RELEASE_DIR" "$workdir" "$out" "$@" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, canonical_tar_bytes
from task168_test_fixtures import collect_members
workdir, out = sys.argv[2], sys.argv[3]
members = collect_members(workdir, sys.argv[4:])
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(canonical_tar_bytes(members)))
PY
}

# Contract tests for the T3 source-archive-attestation consumer logic added to
# scripts/release/task168-final-image-preflight.sh. Exercises only the static
# checks that run before any Docker resource is created (the first `docker`
# call in the script is well after everything tested here) — no Docker, no
# DB, no network. The pre-existing Stage A transition/backup-receipt (T2)
# block is exercised only as scaffolding to reach these checks; it is left
# unchanged (pending user decisions U4/U7) and is not the subject of this test.
#
# Deletion -> expected red (recorded here; counted by hand on a scratch copy):
#   sidecar archiveSha256/archiveBytes/sourceCommit assertion   -> red on (2)
#   archive-embedded-manifest-hash == sidecar.inputManifestSha256 -> red on (3)
#   input-snapshot bytes == archive-embedded manifest bytes     -> red on (4)
#   bundle/ prefix rejection                                    -> red on (5)
#   symlink member rejection                                    -> red on (6)
#   prisma unauthenticated-member rejection                     -> red on (7), (7b), (7c)
#   unsafe-path (../) member rejection                          -> red on (8)
#   per-file archive-content-vs-snapshot sha/bytes check         -> red on (9)
#   pinned FINAL_SCHEMA_SHA/M11_SHA/M11_NAME_PIN constants       -> red on golden path (1), since the
#                                                                    fixture uses the real reviewed bytes
#   files[] finalSchema entry == pinned schema sha               -> red on (G4)
#   files[] migration entries == fullMigrationHistory            -> red on (G1), (G2)
#   duplicate archive member rejection                           -> red on (DUP), (A_emptym11)
#   Task168-contract M11 hash pin (caller input vs reviewed sha) -> red on (F12)
#   snapshot .m11.sha256 pin                                     -> red on (F13)
#   Task168-contract "M11 must be last" order check               -> red on (F14)
#   full-history "must end at M11" order check                    -> red on (F15)
#   full-history-vs-migration-root-file checksum check             -> red on (F16)
#   migration-root-directories-vs-full-history set/order check     -> red on (F17)
#   snapshot fullMigrationHistory == --full-migrations-json check   -> red on (F20)
# (F12-F20 use a full 11-entry Task168 contract + a 12th pre-Task168
#  history entry -- the minimal 2-entry fixture used everywhere else in this
#  file never reaches those checks, since it always fails the earlier
#  11-entries-required gate first.)
#
# The canonical-form identity check and the walker's own consecutive-pax,
# control-byte, and path-less-pax rejections overlap on purpose (each of the
# latter three exists for a clearer, cause-specific message, not because it
# is the only thing standing between the archive and acceptance). Deleting
# them one at a time on a scratch copy: only the identity check itself
# produces red, on five cases with no header-level rule of their own --
# (END-MARKER-EXTRA), (SHORT_PAX_DECOY), (LONG_PAX_WRONG_USTAR),
# (LONE_ZERO_THEN_MEMBER) and (AFTER_EOA_MEMBER) -- and only against a
# single-gzip-member archive; deleting decompress_single_gzip_member's own
# trailing-data check instead reds
# (GZIP-TRAILING) and (GZIP-CONCAT). Deleting the consecutive-pax check alone
# still rejects (CHAINED_PAX) and (A_newmig) (via the identity check and the
# path-less-pax check respectively, just with a different message); deleting
# either control-byte check alone still rejects (B_nulm11) and
# (HEADER-NAME-NUL) via the identity check, because canonical_tar_bytes
# itself refuses to encode a control byte in a name; deleting the
# path-less-pax check alone still rejects (PAX-NOPATH) via the identity
# check, because a physical pax header block that contributes no member
# override can never be reproduced by re-encoding the member list.

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/task168-preflight-sidecar-contract.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
sha() { sha256sum "$1" | awk '{print $1}'; }

RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
STAGE_A_RELEASE=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
STAGE_A_SCHEMA_SHA="$(printf 'stage-a-schema' | sha256sum | awk '{print $1}')"
DB_IDENTITY='teameet_alpha|teameet|127.0.0.1|5432'
M11_NAME=20260911090000_retire_tournament_fixture_tables
M1_NAME=20260908130000_v1_team_match_tournament_expand
# The preflight pins FINAL_SCHEMA_SHA/M11_SHA to the actual reviewed bytes,
# so every fixture below must carry those exact bytes for schema.prisma and
# M11 (M1 and every other historical migration are not hash-pinned and stay
# synthetic).
REVIEWED_FINAL_SCHEMA="$REPO_ROOT/deploy/task168-final-drop/schema.prisma"
REVIEWED_M11_FILE="$REPO_ROOT/deploy/task168-final-drop/migrations/$M11_NAME/migration.sql"
[[ -f "$REVIEWED_FINAL_SCHEMA" && -f "$REVIEWED_M11_FILE" ]] || fail 'missing reviewed schema/M11 fixture source'

# ---- T2 scaffolding: a self-consistent Stage A transition + backup receipt,
# unrelated to this test's subject, needed only to reach the T3 checks. -----
build_stage_a_fixture() {
  local dir="$1"
  printf 'x' > "$dir/backup.gz"
  local backup_sha; backup_sha="$(sha "$dir/backup.gz")"
  jq -n --arg r "$STAGE_A_RELEASE" --arg db "$DB_IDENTITY" --arg p "$dir/backup.gz" --arg h "$backup_sha" \
    '{schemaVersion:1,status:"COMPLETED",stage:"stageAIntermediate",releaseSha:$r,databaseIdentity:$db,backupFormat:"plain-sql-gzip",backupPath:$p,backupSha256:$h,backupBytes:1}' \
    > "$dir/backup-receipt.json"
  local backup_receipt_sha; backup_receipt_sha="$(sha "$dir/backup-receipt.json")"
  jq -n --arg r "$STAGE_A_RELEASE" --arg s "$STAGE_A_SCHEMA_SHA" --arg db "$DB_IDENTITY" --arg p "$dir/backup-receipt.json" --arg ph "$backup_receipt_sha" --arg h "$backup_sha" \
    '{status:"COMPLETED",stage:"stageAIntermediate",releaseSha:$r,schemaSha256:$s,databaseIdentity:$db,backupReceipt:$p,backupReceiptSha256:$ph,backupSha256:$h}' \
    > "$dir/transition.json"
}
STAGE_A_DIR="$TMP/stage-a"
mkdir -p "$STAGE_A_DIR"
build_stage_a_fixture "$STAGE_A_DIR"

# ---- T3 subject: a small, well-formed source archive + sidecar -----------
build_archive_fixture() {
  local dir="$1"
  mkdir -p "$dir/stage/apps/v1_api/prisma/migrations/$M1_NAME"
  mkdir -p "$dir/stage/apps/v1_api/prisma/migrations/$M11_NAME"
  cp "$REVIEWED_FINAL_SCHEMA" "$dir/stage/apps/v1_api/prisma/schema.prisma"
  printf 'provider = "postgresql"\n' > "$dir/stage/apps/v1_api/prisma/migrations/migration_lock.toml"
  printf -- '-- m1\nSELECT 1;\n' > "$dir/stage/apps/v1_api/prisma/migrations/$M1_NAME/migration.sql"
  cp "$REVIEWED_M11_FILE" "$dir/stage/apps/v1_api/prisma/migrations/$M11_NAME/migration.sql"

  jq -n \
    --arg commit "$RELEASE_SHA" \
    --arg schemaSha "$(sha "$dir/stage/apps/v1_api/prisma/schema.prisma")" \
    --argjson schemaBytes "$(wc -c < "$dir/stage/apps/v1_api/prisma/schema.prisma" | tr -d ' ')" \
    --arg lockSha "$(sha "$dir/stage/apps/v1_api/prisma/migrations/migration_lock.toml")" \
    --argjson lockBytes "$(wc -c < "$dir/stage/apps/v1_api/prisma/migrations/migration_lock.toml" | tr -d ' ')" \
    --arg m1Sha "$(sha "$dir/stage/apps/v1_api/prisma/migrations/$M1_NAME/migration.sql")" \
    --argjson m1Bytes "$(wc -c < "$dir/stage/apps/v1_api/prisma/migrations/$M1_NAME/migration.sql" | tr -d ' ')" \
    --arg m11Sha "$(sha "$dir/stage/apps/v1_api/prisma/migrations/$M11_NAME/migration.sql")" \
    --argjson m11Bytes "$(wc -c < "$dir/stage/apps/v1_api/prisma/migrations/$M11_NAME/migration.sql" | tr -d ' ')" \
    --arg m1Name "$M1_NAME" --arg m11Name "$M11_NAME" \
    '{
      schemaVersion: 1, kind: "task168StageBFinalInputs", sourceCommit: $commit,
      finalSchema: {path: "apps/v1_api/prisma/schema.prisma", sha256: $schemaSha},
      migrationPolicy: "task168-stageBFinal",
      files: [
        {path: "apps/v1_api/prisma/schema.prisma", sha256: $schemaSha, bytes: $schemaBytes, mode: "644"},
        {path: ("apps/v1_api/prisma/migrations/" + $m1Name + "/migration.sql"), sha256: $m1Sha, bytes: $m1Bytes, mode: "644"},
        {path: ("apps/v1_api/prisma/migrations/" + $m11Name + "/migration.sql"), sha256: $m11Sha, bytes: $m11Bytes, mode: "644"},
        {path: "apps/v1_api/prisma/migrations/migration_lock.toml", sha256: $lockSha, bytes: $lockBytes, mode: "644"}
      ],
      fullMigrationHistory: [{name: $m1Name, sha256: $m1Sha}, {name: $m11Name, sha256: $m11Sha}],
      m11: {name: $m11Name, sha256: $m11Sha},
      archiveLayout: {root: "repository", pathPrefix: "", mapping: "archive member == files[].path"}
    }' > "$dir/stage/INPUT-MANIFEST.json"

  write_clean_tar "$dir/stage" "$dir/source.tar.gz" INPUT-MANIFEST.json apps
  local manifest_sha; manifest_sha="$(sha "$dir/stage/INPUT-MANIFEST.json")"
  local archive_sha; archive_sha="$(sha "$dir/source.tar.gz")"
  local archive_bytes; archive_bytes="$(wc -c < "$dir/source.tar.gz" | tr -d ' ')"
  jq -n --arg commit "$RELEASE_SHA" --arg p "$dir/source.tar.gz" --arg h "$archive_sha" --argjson b "$archive_bytes" --arg m "$manifest_sha" \
    '{schemaVersion:1,kind:"task168StageBSourceArchiveAttestation",sourceCommit:$commit,archivePath:$p,archiveSha256:$h,archiveBytes:$b,inputManifestPath:"INPUT-MANIFEST.json",inputManifestSha256:$m,inputSnapshotSha256:$m,archiveLayout:{root:"repository",pathPrefix:"",mapping:"archive member == files[].path"},createdAt:"2026-09-14T00:00:00Z"}' \
    > "$dir/source.tar.gz.attestation.json"
  cp "$dir/stage/INPUT-MANIFEST.json" "$dir/input-snapshot.json"
}

FIXTURE="$TMP/fixture"
mkdir -p "$FIXTURE"
build_archive_fixture "$FIXTURE"

full_history_json() { jq -c '.fullMigrationHistory' "$FIXTURE/stage/INPUT-MANIFEST.json"; }
full_history_json > "$FIXTURE/full-migrations.json"
echo '[]' > "$FIXTURE/resolved-attempts.json"
echo '[]' > "$FIXTURE/migrations.json"

common_args() {
  local schema_sha; schema_sha="$(jq -r '.finalSchema.sha256' "$FIXTURE/stage/INPUT-MANIFEST.json")"
  local source_sha; source_sha="$(sha "$FIXTURE/source.tar.gz")"
  local input_sha; input_sha="$(sha "$FIXTURE/input-snapshot.json")"
  ARGS=(
    --backup "$STAGE_A_DIR/backup.gz" --backup-sha256 "$(sha "$STAGE_A_DIR/backup.gz")" --backup-format plain-sql-gzip
    --stage-a-transition-receipt "$STAGE_A_DIR/transition.json" --stage-a-transition-receipt-sha256 "$(sha "$STAGE_A_DIR/transition.json")"
    --stage-a-backup-receipt "$STAGE_A_DIR/backup-receipt.json" --stage-a-backup-receipt-sha256 "$(sha "$STAGE_A_DIR/backup-receipt.json")"
    --stage-a-release-sha "$STAGE_A_RELEASE" --stage-a-schema-sha256 "$STAGE_A_SCHEMA_SHA" --database-identity "$DB_IDENTITY"
    --schema "$FIXTURE/stage/apps/v1_api/prisma/schema.prisma" --schema-sha256 "$schema_sha"
    --migration-root "$FIXTURE/stage/apps/v1_api/prisma/migrations"
    --migrations-json "$FIXTURE/migrations.json" --full-migrations-json "$FIXTURE/full-migrations.json"
    --resolved-migration-attempts-json "$FIXTURE/resolved-attempts.json"
    --source-archive "$FIXTURE/source.tar.gz" --source-sha256 "$source_sha"
    --source-archive-attestation "$FIXTURE/source.tar.gz.attestation.json"
    --input-snapshot "$FIXTURE/input-snapshot.json" --input-snapshot-sha256 "$input_sha"
    --postgres-image x@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    --api-image x@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    --api-client-schema-path /x --web-image x@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    --cutover-tool-image x@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    --api-workdir /x --api-prisma-bin /x --tool-workdir /x --tool-prisma-bin /x
    --release-sha "$RELEASE_SHA" --report "$TMP/report-$RANDOM.json" --receipt "$TMP/receipt-$RANDOM.json"
  )
}

run_expect_fail() {
  local expected="$1"; shift
  local out rc
  set +e
  out="$("$PREFLIGHT" "$@" 2>&1)"
  rc=$?
  set -e
  [[ $rc -ne 0 ]] || fail "expected failure but rc=0: $out"
  grep -Fq "$expected" <<<"$out" || fail "expected failure text missing ('$expected'): $out"
}

# ---- 1. golden path clears every T2 (scaffolding) and T3 (subject) gate --
# The fixture intentionally does not carry a full 11-entry Task168 migration
# contract (that pre-existing, unmodified part of the script is out of this
# test's scope) — reaching that later, unrelated check is itself the proof
# that every T3 sidecar/member check above it accepted a well-formed input.
common_args
run_expect_fail 'migration contract must contain exactly 11 hashed entries' "${ARGS[@]}"
pass 'a well-formed archive + sidecar + input snapshot clears the Stage A scaffolding and every new T3 sidecar/member check'

# ---- 2. sidecar does not authenticate this archive -------------------------
BAD_SIDECAR_HASH="$TMP/bad-sidecar-hash.json"
jq '.archiveSha256 = "0000000000000000000000000000000000000000000000000000000000000000"' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$BAD_SIDECAR_HASH"
common_args
for i in "${!ARGS[@]}"; do
  if [[ "${ARGS[$i]}" == "--source-archive-attestation" ]]; then ARGS[$((i+1))]="$BAD_SIDECAR_HASH"; fi
done
run_expect_fail 'source archive attestation does not authenticate this archive' "${ARGS[@]}"
pass 'rejects a sidecar whose archiveSha256 does not match the actual archive bytes'

# ---- 3. archive-embedded manifest does not match the attested hash --------
TAMPERED_ARCHIVE_DIR="$TMP/tampered-manifest"
mkdir -p "$TAMPERED_ARCHIVE_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$TAMPERED_ARCHIVE_DIR/stage/apps"
jq '.finalSchema.sha256 = "1111111111111111111111111111111111111111111111111111111111111111"' \
  "$FIXTURE/stage/INPUT-MANIFEST.json" > "$TAMPERED_ARCHIVE_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$TAMPERED_ARCHIVE_DIR/stage" "$TAMPERED_ARCHIVE_DIR/source.tar.gz" INPUT-MANIFEST.json apps
tampered_archive_sha="$(sha "$TAMPERED_ARCHIVE_DIR/source.tar.gz")"
tampered_archive_bytes="$(wc -c < "$TAMPERED_ARCHIVE_DIR/source.tar.gz" | tr -d ' ')"
# The sidecar still claims the *original* (untampered) manifest hash even
# though the archive now embeds a different one: only the archive's own
# bytes are re-signed here, simulating an attacker who swaps the manifest
# inside an already-attested archive without re-deriving the sidecar.
jq --arg h "$tampered_archive_sha" --argjson b "$tampered_archive_bytes" '.archiveSha256 = $h | .archiveBytes = $b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$TAMPERED_ARCHIVE_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$TAMPERED_ARCHIVE_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$tampered_archive_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$TAMPERED_ARCHIVE_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'archive-embedded INPUT-MANIFEST.json does not match the attested hash' "${ARGS[@]}"
pass 'rejects an archive whose embedded INPUT-MANIFEST.json does not match the sidecar-attested hash'

# ---- 4. supplied --input-snapshot is not the archive-embedded manifest ----
DIFFERENT_SNAPSHOT="$TMP/different-input-snapshot.json"
jq '.m11.name = "20260911090000_retire_tournament_fixture_tables_x"' \
  "$FIXTURE/stage/INPUT-MANIFEST.json" > "$DIFFERENT_SNAPSHOT"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --input-snapshot) ARGS[$((i+1))]="$DIFFERENT_SNAPSHOT" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$(sha "$DIFFERENT_SNAPSHOT")" ;;
  esac
done
run_expect_fail 'supplied input snapshot is not the manifest embedded in the attested archive' "${ARGS[@]}"
pass 'rejects a same-looking --input-snapshot whose bytes differ from what the attested archive actually carries'

# ---- 5. bundle/ prefix member is rejected ----------------------------------
BUNDLE_DIR="$TMP/bundle"
mkdir -p "$BUNDLE_DIR/stage/bundle"
cp "$FIXTURE/stage/INPUT-MANIFEST.json" "$BUNDLE_DIR/stage/INPUT-MANIFEST.json"
cp -R "$FIXTURE/stage/apps" "$BUNDLE_DIR/stage/bundle/apps"
write_clean_tar "$BUNDLE_DIR/stage" "$BUNDLE_DIR/source.tar.gz" INPUT-MANIFEST.json bundle
bundle_sha="$(sha "$BUNDLE_DIR/source.tar.gz")"
bundle_bytes="$(wc -c < "$BUNDLE_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$bundle_sha" --argjson b "$bundle_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$BUNDLE_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$BUNDLE_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$bundle_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$BUNDLE_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive uses a bundle/ prefix but declares pathPrefix=""' "${ARGS[@]}"
pass 'rejects an archive that uses a bundle/ prefix layout while pathPrefix is declared empty'

# ---- 6. symlink member is rejected -----------------------------------------
SYMLINK_DIR="$TMP/symlink"
mkdir -p "$SYMLINK_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$SYMLINK_DIR/stage/apps"
cp "$FIXTURE/stage/INPUT-MANIFEST.json" "$SYMLINK_DIR/stage/INPUT-MANIFEST.json"
ln -s schema.prisma "$SYMLINK_DIR/stage/apps/v1_api/prisma/schema-link"
# write_clean_tar's collect_members() rejects a symlink outright (it has no
# canonical byte representation to reproduce), so this builds the archive
# with plain tarfile instead -- a symlink member is rejected on its typeflag
# during the walk itself, before the canonical-form check would ever matter.
python3 - "$SYMLINK_DIR/stage" "$SYMLINK_DIR/source.tar.gz" "$HERE" <<'PY'
import os, sys, tarfile
sys.path.insert(0, sys.argv[3])
from task168_test_fixtures import add_tar_members
stage, out = sys.argv[1], sys.argv[2]
def clean(ti):
    ti.mtime = 0; ti.uid = 0; ti.gid = 0; ti.uname = ''; ti.gname = ''
    return ti
with tarfile.open(out, 'w:gz') as tar:
    tar.add(os.path.join(stage, 'INPUT-MANIFEST.json'), arcname='INPUT-MANIFEST.json', filter=clean)
    add_tar_members(tar, stage, 'apps', filter=clean)
PY
symlink_sha="$(sha "$SYMLINK_DIR/source.tar.gz")"
symlink_bytes="$(wc -c < "$SYMLINK_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$symlink_sha" --argjson b "$symlink_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$SYMLINK_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$SYMLINK_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$symlink_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$SYMLINK_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains an unauthorized typeflag' "${ARGS[@]}"
pass 'rejects an archive that carries a symlink member'

# ---- 7. prisma member set differs from the authenticated inventory -------
EXTRA_DIR="$TMP/extra-member"
mkdir -p "$EXTRA_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$EXTRA_DIR/stage/"
mkdir -p "$EXTRA_DIR/stage/apps/v1_api/prisma/migrations/20260912000000_extra"
printf -- '-- extra\nSELECT 1;\n' > "$EXTRA_DIR/stage/apps/v1_api/prisma/migrations/20260912000000_extra/migration.sql"
cp "$FIXTURE/stage/INPUT-MANIFEST.json" "$EXTRA_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$EXTRA_DIR/stage" "$EXTRA_DIR/source.tar.gz" INPUT-MANIFEST.json apps
extra_sha="$(sha "$EXTRA_DIR/source.tar.gz")"
extra_bytes="$(wc -c < "$EXTRA_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$extra_sha" --argjson b "$extra_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$EXTRA_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$EXTRA_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$extra_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$EXTRA_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains an unauthenticated member under apps/v1_api/prisma/' "${ARGS[@]}"
pass 'rejects an archive that carries an unlisted extra migration.sql not present in the authenticated inventory'

# ---- 7b. an extra migration directory whose name does NOT match the
#          [0-9]{14}_[a-z0-9_]+ shape must still be caught -- a check keyed
#          on that shape (as the old regex-based member-set check was) is
#          blind to a member outside it -------------------------------------
NONCONFORMING_DIR="$TMP/nonconforming-member"
mkdir -p "$NONCONFORMING_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$NONCONFORMING_DIR/stage/"
mkdir -p "$NONCONFORMING_DIR/stage/apps/v1_api/prisma/migrations/2026_evil"
printf -- '-- evil\nSELECT 1;\n' > "$NONCONFORMING_DIR/stage/apps/v1_api/prisma/migrations/2026_evil/migration.sql"
cp "$FIXTURE/stage/INPUT-MANIFEST.json" "$NONCONFORMING_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$NONCONFORMING_DIR/stage" "$NONCONFORMING_DIR/source.tar.gz" INPUT-MANIFEST.json apps
nonconforming_sha="$(sha "$NONCONFORMING_DIR/source.tar.gz")"
nonconforming_bytes="$(wc -c < "$NONCONFORMING_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$nonconforming_sha" --argjson b "$nonconforming_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$NONCONFORMING_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$NONCONFORMING_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$nonconforming_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$NONCONFORMING_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains an unauthenticated member under apps/v1_api/prisma/' "${ARGS[@]}"
pass 'rejects an extra migration directory whose name does not match the reviewed migration-name shape'

# ---- 7c. an extra file smuggled inside an already-declared migration
#          directory must still be caught, not just an extra directory ------
EXTRA_IN_DECLARED_DIR="$TMP/extra-in-declared-dir"
mkdir -p "$EXTRA_IN_DECLARED_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$EXTRA_IN_DECLARED_DIR/stage/"
printf -- '-- smuggled\nSELECT 1;\n' > "$EXTRA_IN_DECLARED_DIR/stage/apps/v1_api/prisma/migrations/$M11_NAME/extra.sql"
cp "$FIXTURE/stage/INPUT-MANIFEST.json" "$EXTRA_IN_DECLARED_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$EXTRA_IN_DECLARED_DIR/stage" "$EXTRA_IN_DECLARED_DIR/source.tar.gz" INPUT-MANIFEST.json apps
extra_in_dir_sha="$(sha "$EXTRA_IN_DECLARED_DIR/source.tar.gz")"
extra_in_dir_bytes="$(wc -c < "$EXTRA_IN_DECLARED_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$extra_in_dir_sha" --argjson b "$extra_in_dir_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$EXTRA_IN_DECLARED_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$EXTRA_IN_DECLARED_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$extra_in_dir_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$EXTRA_IN_DECLARED_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains an unauthenticated member under apps/v1_api/prisma/' "${ARGS[@]}"
pass 'rejects an extra file smuggled inside an already-declared migration directory'

# ---- EVILDIR. an extra, empty directory member sits under
#      apps/v1_api/prisma/migrations/ -- the prisma-extra allowlist above
#      only ever walks typeflag '0' members, so a directory member reaches
#      no check at all until ALLOWED_TYPEFLAGS rejects it by typeflag -------
EVILDIR_DIR="$TMP/evil-directory"
mkdir -p "$EVILDIR_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$EVILDIR_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, encode_member, end_of_archive_marker, header_block
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
trunk = b''.join(encode_member(*m) for m in collect_members(stage, ['INPUT-MANIFEST.json', 'apps']))
evil_dir_header = header_block(b'apps/v1_api/prisma/migrations/20990101000000_evil/', 0, 0o755, b'5')
full = trunk + evil_dir_header + end_of_archive_marker()
full += b'\x00' * ((-len(full)) % 10240)  # RECORDSIZE, matching canonical_tar_bytes's own padding
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(full))
PY
evildir_sha="$(sha "$EVILDIR_DIR/source.tar.gz")"
evildir_bytes="$(wc -c < "$EVILDIR_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$evildir_sha" --argjson b "$evildir_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$EVILDIR_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$EVILDIR_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$evildir_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$EVILDIR_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains an unauthorized typeflag' "${ARGS[@]}"
pass 'EVILDIR: rejects an extra, empty directory member under apps/v1_api/prisma/migrations/'

# ---- 8. a ../ traversal member is rejected ---------------------------------
# The unsafe-path check runs after the canonical-form identity check, so this
# extra member has to come from the same canonical serializer as the rest of
# the archive (see write_clean_tar's docstring) -- a plain `tar -c` refuses to
# create a member spelled with a leading `../` in the first place.
TRAVERSAL_DIR="$TMP/traversal"
mkdir -p "$TRAVERSAL_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$TRAVERSAL_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, canonical_tar_bytes
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
members = collect_members(stage, ['INPUT-MANIFEST.json', 'apps'])
members.append(('../evil.txt', b'0', 0o644, b'evil\n'))
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(canonical_tar_bytes(members)))
PY
traversal_sha="$(sha "$TRAVERSAL_DIR/source.tar.gz")"
traversal_bytes="$(wc -c < "$TRAVERSAL_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$traversal_sha" --argjson b "$traversal_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$TRAVERSAL_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$TRAVERSAL_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$traversal_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$TRAVERSAL_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains an unsafe path' "${ARGS[@]}"
pass 'rejects an archive that carries a ../ traversal member'

# ---- 9. an archive member's bytes differ from the authenticated files[]
#         entry while the manifest (and therefore the sidecar) still declares
#         the original, pre-tamper hash -------------------------------------
CONTENT_TAMPER_DIR="$TMP/content-tamper"
mkdir -p "$CONTENT_TAMPER_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$CONTENT_TAMPER_DIR/stage/apps"
cp "$FIXTURE/stage/INPUT-MANIFEST.json" "$CONTENT_TAMPER_DIR/stage/INPUT-MANIFEST.json"
printf -- '-- tampered archive member; manifest still declares the original bytes\nSELECT 2;\n' \
  > "$CONTENT_TAMPER_DIR/stage/apps/v1_api/prisma/migrations/$M1_NAME/migration.sql"
write_clean_tar "$CONTENT_TAMPER_DIR/stage" "$CONTENT_TAMPER_DIR/source.tar.gz" INPUT-MANIFEST.json apps
content_tamper_sha="$(sha "$CONTENT_TAMPER_DIR/source.tar.gz")"
content_tamper_bytes="$(wc -c < "$CONTENT_TAMPER_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$content_tamper_sha" --argjson b "$content_tamper_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$CONTENT_TAMPER_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$CONTENT_TAMPER_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$content_tamper_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$CONTENT_TAMPER_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive input differs from authenticated snapshot' "${ARGS[@]}"
pass 'rejects an archive whose M1 migration bytes differ from the authenticated files[] entry even though the manifest and sidecar are internally self-consistent'

# ---- SETUID. the M11 member's on-the-wire mode carries setuid/setgid/
#      world-write bits (06777) while files[].mode still declares "644"
#      and the content is untouched -- re-encoding through the same
#      canonical serializer reproduces this mode byte for byte, so only an
#      explicit mode allowlist (not the reencoding identity check) catches
#      it ------------------------------------------------------------------
SETUID_DIR="$TMP/setuid-m11"
mkdir -p "$SETUID_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$SETUID_DIR/source.tar.gz" "apps/v1_api/prisma/migrations/$M11_NAME/migration.sql" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, canonical_tar_bytes
from task168_test_fixtures import collect_members
stage, out, m11_path = sys.argv[2], sys.argv[3], sys.argv[4]
members = [
    (name, typeflag, (0o6777 if name == m11_path else mode), data)
    for name, typeflag, mode, data in collect_members(stage, ['INPUT-MANIFEST.json', 'apps'])
]
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(canonical_tar_bytes(members)))
PY
setuid_sha="$(sha "$SETUID_DIR/source.tar.gz")"
setuid_bytes="$(wc -c < "$SETUID_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$setuid_sha" --argjson b "$setuid_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$SETUID_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$SETUID_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$setuid_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$SETUID_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains a member with an unauthorized mode' "${ARGS[@]}"
pass 'SETUID: rejects an M11 member whose mode carries setuid/setgid/world-write bits even though its content is untouched'

# ---- MODE000. the M11 member's mode is 0 (no permission bits at all),
#      content untouched -----------------------------------------------
MODE000_DIR="$TMP/mode000-m11"
mkdir -p "$MODE000_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$MODE000_DIR/source.tar.gz" "apps/v1_api/prisma/migrations/$M11_NAME/migration.sql" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, canonical_tar_bytes
from task168_test_fixtures import collect_members
stage, out, m11_path = sys.argv[2], sys.argv[3], sys.argv[4]
members = [
    (name, typeflag, (0 if name == m11_path else mode), data)
    for name, typeflag, mode, data in collect_members(stage, ['INPUT-MANIFEST.json', 'apps'])
]
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(canonical_tar_bytes(members)))
PY
mode000_sha="$(sha "$MODE000_DIR/source.tar.gz")"
mode000_bytes="$(wc -c < "$MODE000_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$mode000_sha" --argjson b "$mode000_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$MODE000_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$MODE000_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$mode000_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$MODE000_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains a member with an unauthorized mode' "${ARGS[@]}"
pass 'MODE000: rejects an M11 member whose mode carries no permission bits at all'

# ---- MODE_MISMATCH. the M11 member's mode is 755 -- itself an allowed
#      value -- while files[].mode still declares "644". The blanket
#      {644,755} allowlist alone would accept this; only comparing each
#      declared file's authenticated mode against files[].mode catches it -
MODE_MISMATCH_DIR="$TMP/mode-mismatch-m11"
mkdir -p "$MODE_MISMATCH_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$MODE_MISMATCH_DIR/source.tar.gz" "apps/v1_api/prisma/migrations/$M11_NAME/migration.sql" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, canonical_tar_bytes
from task168_test_fixtures import collect_members
stage, out, m11_path = sys.argv[2], sys.argv[3], sys.argv[4]
members = [
    (name, typeflag, (0o755 if name == m11_path else mode), data)
    for name, typeflag, mode, data in collect_members(stage, ['INPUT-MANIFEST.json', 'apps'])
]
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(canonical_tar_bytes(members)))
PY
mode_mismatch_sha="$(sha "$MODE_MISMATCH_DIR/source.tar.gz")"
mode_mismatch_bytes="$(wc -c < "$MODE_MISMATCH_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$mode_mismatch_sha" --argjson b "$mode_mismatch_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$MODE_MISMATCH_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$MODE_MISMATCH_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$mode_mismatch_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$MODE_MISMATCH_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive input differs from authenticated snapshot' "${ARGS[@]}"
pass 'MODE_MISMATCH: rejects an M11 member whose mode (755, itself an allowed value) differs from its files[] entry (644)'

# ---- SETUID_EXTRA. a setuid member outside apps/v1_api/prisma/ entirely,
#      with no files[] entry to compare against -- isolates the blanket
#      {644,755} mode allowlist from the per-declared-file mode-equality
#      check above it, neither of which the other can substitute for -----
SETUID_EXTRA_DIR="$TMP/setuid-extra"
mkdir -p "$SETUID_EXTRA_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$SETUID_EXTRA_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, canonical_tar_bytes
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
members = collect_members(stage, ['INPUT-MANIFEST.json', 'apps'])
members.append(('docs/setuid-probe.txt', b'0', 0o6777, b'evil\n'))
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(canonical_tar_bytes(members)))
PY
setuid_extra_sha="$(sha "$SETUID_EXTRA_DIR/source.tar.gz")"
setuid_extra_bytes="$(wc -c < "$SETUID_EXTRA_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$setuid_extra_sha" --argjson b "$setuid_extra_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$SETUID_EXTRA_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$SETUID_EXTRA_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$setuid_extra_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$SETUID_EXTRA_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains a member with an unauthorized mode' "${ARGS[@]}"
pass 'SETUID_EXTRA: rejects a setuid member with no files[] entry, outside apps/v1_api/prisma/ entirely'

# ---- DUP. a second, empty copy of the already-hashed M11 member appended
#          after the real one is rejected -- `tar -xOf` concatenates both
#          copies (so a naive content check on the concatenated bytes could
#          pass) while real extraction keeps only the last (empty) one -----
DUP_DIR="$TMP/duplicate-member"
mkdir -p "$DUP_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$DUP_DIR/source.tar.gz" "apps/v1_api/prisma/migrations/$M11_NAME/migration.sql" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, canonical_tar_bytes
from task168_test_fixtures import collect_members
stage, out, dup_name = sys.argv[2], sys.argv[3], sys.argv[4]
members = collect_members(stage, ['INPUT-MANIFEST.json', 'apps'])
members.append((dup_name, b'0', 0o644, b''))
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(canonical_tar_bytes(members)))
PY
dup_sha="$(sha "$DUP_DIR/source.tar.gz")"
dup_bytes="$(wc -c < "$DUP_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$dup_sha" --argjson b "$dup_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$DUP_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$DUP_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$dup_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$DUP_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains a duplicate member' "${ARGS[@]}"
pass 'DUP: rejects an archive that carries a second, empty copy of an already-present member name'

# ---- DEVDUP. the same empty M11 duplicate as DUP, except its header's
#      devmajor field is patched to non-octal bytes with a recomputed
#      checksum -- the raw header walk validates devmajor/devminor as
#      strict octal on every member type, so it rejects this even though
#      tarfile itself, absent that check, would silently stop enumerating
#      here (InvalidHeaderError past the first member) ----------------------
DEVDUP_DIR="$TMP/devdup-member"
mkdir -p "$DEVDUP_DIR"
python3 - "$FIXTURE/stage" "$DEVDUP_DIR/source.tar.gz" "apps/v1_api/prisma/migrations/$M11_NAME/migration.sql" "$HERE" <<'PY'
import io, os, sys, tarfile, gzip
stage, out, dup_name = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, sys.argv[4])
from task168_test_fixtures import add_tar_members

def clean(ti):
    ti.mtime = 0; ti.uid = 0; ti.gid = 0; ti.uname = ''; ti.gname = ''
    return ti

def with_checksum(buf):
    buf = bytearray(buf)
    unsigned, _ = tarfile.calc_chksums(bytes(buf))
    buf[148:156] = ("%06o\0 " % unsigned).encode('ascii')
    return bytes(buf)

raw = io.BytesIO()
with tarfile.open(fileobj=raw, mode='w') as tar:
    tar.add(os.path.join(stage, 'INPUT-MANIFEST.json'), arcname='INPUT-MANIFEST.json', filter=clean)
    add_tar_members(tar, stage, 'apps', filter=clean)
    dup_offset = raw.tell()
    info = tarfile.TarInfo(name=dup_name)
    info.size = 0
    tar.addfile(info, io.BytesIO(b''))
data = bytearray(raw.getvalue())
header = bytearray(data[dup_offset:dup_offset + 512])
header[329:337] = b'ZZZZZZZ\0'
data[dup_offset:dup_offset + 512] = bytearray(with_checksum(bytes(header)))
with gzip.GzipFile(out, 'wb', mtime=0) as gz:
    gz.write(bytes(data))
PY
devdup_sha="$(sha "$DEVDUP_DIR/source.tar.gz")"
devdup_bytes="$(wc -c < "$DEVDUP_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$devdup_sha" --argjson b "$devdup_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$DEVDUP_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$DEVDUP_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$devdup_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$DEVDUP_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains a non-octal numeric header field' "${ARGS[@]}"
pass 'DEVDUP: rejects a duplicate M11 member whose devmajor field is non-octal bytes'

# ---- GLOBALPAX. a pax global header sets path=a decoy name, followed by a
#      per-member pax ('x') header that only sets an unrelated key (not
#      path) on an empty duplicate of the M11 member. CPython's tarfile
#      merges the still-active global pax dict into the per-member one and
#      renames the member to the decoy, outside apps/v1_api/prisma/, so a
#      count- or tarfile-name-only check draws no scrutiny; GNU tar applies
#      the same rename, while bsdtar keeps the true path -- either way the
#      raw header walk rejects the archive outright for carrying a typeflag
#      'g' header, before any renaming can matter ---------------------------
GLOBALPAX_DIR="$TMP/globalpax-member"
mkdir -p "$GLOBALPAX_DIR"
python3 - "$FIXTURE/stage" "$GLOBALPAX_DIR/source.tar.gz" "apps/v1_api/prisma/migrations/$M11_NAME/migration.sql" "apps/zz-decoy.txt" "$HERE" <<'PY'
import io, os, sys, tarfile, gzip
stage, out, dup_name, decoy_name = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
sys.path.insert(0, sys.argv[5])
from task168_test_fixtures import add_tar_members

def clean(ti):
    ti.mtime = 0; ti.uid = 0; ti.gid = 0; ti.uname = ''; ti.gname = ''
    return ti

raw = io.BytesIO()
tar = tarfile.open(fileobj=raw, mode='w')
tar.add(os.path.join(stage, 'INPUT-MANIFEST.json'), arcname='INPUT-MANIFEST.json', filter=clean)
add_tar_members(tar, stage, 'apps', filter=clean)
data = raw.getvalue()  # not closed -- omits tarfile's own end-of-archive trailer

data += tarfile.TarInfo.create_pax_global_header({'path': decoy_name})

member_buf = io.BytesIO()
member_tar = tarfile.open(fileobj=member_buf, mode='w')
info = tarfile.TarInfo(name=dup_name)
info.pax_headers = {'comment': 'unrelated-per-member-x-header'}
info.size = 0
member_tar.addfile(info, io.BytesIO(b''))
data += member_buf.getvalue()
data += b'\x00' * 1024  # single end-of-archive trailer

with gzip.GzipFile(out, 'wb', mtime=0) as gz:
    gz.write(data)
PY
globalpax_sha="$(sha "$GLOBALPAX_DIR/source.tar.gz")"
globalpax_bytes="$(wc -c < "$GLOBALPAX_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$globalpax_sha" --argjson b "$globalpax_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$GLOBALPAX_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$GLOBALPAX_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$globalpax_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$GLOBALPAX_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains a global pax extended header' "${ARGS[@]}"
pass 'GLOBALPAX: rejects an archive that carries a pax global header, platform-independent of whether the following rename would otherwise apply'

# ---- CHAINED_PAX. a second pax ('x') header directly follows the first,
#      each carrying its own valid path record -- merging the still-pending
#      first header's dict into the second (instead of rejecting the second
#      outright) let GNU tar/bsdtar extract the member under its raw ustar
#      name while a Python-side parser saw the merged decoy path -------------
CHAINED_PAX_DIR="$TMP/chained-pax"
mkdir -p "$CHAINED_PAX_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$CHAINED_PAX_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, encode_member, end_of_archive_marker, header_block, pax_header_block
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
trunk = b''.join(encode_member(*m) for m in collect_members(stage, ['INPUT-MANIFEST.json', 'apps']))
extra = pax_header_block(b'docs/a.txt') + pax_header_block(b'docs/b.txt') + header_block(b'docs/b.txt', 0, 0o644, b'0')
full = trunk + extra + end_of_archive_marker()
full += b'\x00' * ((-len(full)) % 10240)  # RECORDSIZE, matching canonical_tar_bytes's own padding
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(full))
PY
chained_pax_sha="$(sha "$CHAINED_PAX_DIR/source.tar.gz")"
chained_pax_bytes="$(wc -c < "$CHAINED_PAX_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$chained_pax_sha" --argjson b "$chained_pax_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$CHAINED_PAX_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$CHAINED_PAX_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$chained_pax_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$CHAINED_PAX_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains consecutive pax extended headers' "${ARGS[@]}"
pass 'CHAINED_PAX: rejects a second pax header that directly follows an unconsumed first one, even though both carry a valid path record'

# ---- PAX-NOPATH. a pax ('x') header carries zero records (no path at all) --
#      the packager never emits an empty extended header, and without a path
#      record the following regular header's raw ustar name is authoritative
#      only by accident of this walker's own fallback, not by contract -----
PAX_NOPATH_DIR="$TMP/pax-nopath"
mkdir -p "$PAX_NOPATH_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$PAX_NOPATH_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, encode_member, end_of_archive_marker, header_block
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
trunk = b''.join(encode_member(*m) for m in collect_members(stage, ['INPUT-MANIFEST.json', 'apps']))
empty_pax = header_block(b'pax_header', 0, 0o644, b'x')
extra = empty_pax + header_block(b'docs/somefile.txt', 0, 0o644, b'0')
full = trunk + extra + end_of_archive_marker()
full += b'\x00' * ((-len(full)) % 10240)  # RECORDSIZE, matching canonical_tar_bytes's own padding
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(full))
PY
pax_nopath_sha="$(sha "$PAX_NOPATH_DIR/source.tar.gz")"
pax_nopath_bytes="$(wc -c < "$PAX_NOPATH_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$pax_nopath_sha" --argjson b "$pax_nopath_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$PAX_NOPATH_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$PAX_NOPATH_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$pax_nopath_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$PAX_NOPATH_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains a pax extended header with no path record' "${ARGS[@]}"
pass 'PAX-NOPATH: rejects a pax header that sets no path record at all'

# ---- A_newmig. x{path=docs/decoy.txt}, then an empty x{} (no records)
#      immediately after it, then a regular header whose raw ustar name is a
#      brand-new migration outside apps/v1_api/prisma/. This is CHAINED_PAX's
#      consecutive-pax shape again, reproduced with a migration-hiding member
#      as the payload instead of a generic decoy -----------------------------
A_NEWMIG_DIR="$TMP/a-newmig"
mkdir -p "$A_NEWMIG_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$A_NEWMIG_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, encode_member, end_of_archive_marker, header_block, pax_header_block
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
trunk = b''.join(encode_member(*m) for m in collect_members(stage, ['INPUT-MANIFEST.json', 'apps']))
decoy = pax_header_block(b'docs/decoy.txt')
empty_x = header_block(b'pax_header', 0, 0o644, b'x')
data = b'DROP SCHEMA public CASCADE;\n'
reg = header_block(b'apps/v1_api/prisma/migrations/20990101000000_evil/migration.sql', len(data), 0o644, b'0')
pad = b'\x00' * ((-len(data)) % 512)
full = trunk + decoy + empty_x + reg + data + pad + end_of_archive_marker()
full += b'\x00' * ((-len(full)) % 10240)  # RECORDSIZE, matching canonical_tar_bytes's own padding
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(full))
PY
a_newmig_sha="$(sha "$A_NEWMIG_DIR/source.tar.gz")"
a_newmig_bytes="$(wc -c < "$A_NEWMIG_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$a_newmig_sha" --argjson b "$a_newmig_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$A_NEWMIG_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$A_NEWMIG_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$a_newmig_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$A_NEWMIG_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains consecutive pax extended headers' "${ARGS[@]}"
pass 'A_newmig: rejects a decoy pax path followed by an empty pax header followed by a raw-named migration outside apps/v1_api/prisma/'

# ---- A_emptym11. a second, empty M11 copy appended with no pax at all --
#      the same class of attack as DUP above; kept as its own case to
#      confirm the duplicate-member check still independently covers it
#      once the tarfile-based member listing is gone ------------------------
A_EMPTYM11_DIR="$TMP/a-emptym11"
mkdir -p "$A_EMPTYM11_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$A_EMPTYM11_DIR/source.tar.gz" "apps/v1_api/prisma/migrations/$M11_NAME/migration.sql" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, canonical_tar_bytes
from task168_test_fixtures import collect_members
stage, out, dup_name = sys.argv[2], sys.argv[3], sys.argv[4]
members = collect_members(stage, ['INPUT-MANIFEST.json', 'apps'])
members.append((dup_name, b'0', 0o644, b''))
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(canonical_tar_bytes(members)))
PY
a_emptym11_sha="$(sha "$A_EMPTYM11_DIR/source.tar.gz")"
a_emptym11_bytes="$(wc -c < "$A_EMPTYM11_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$a_emptym11_sha" --argjson b "$a_emptym11_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$A_EMPTYM11_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$A_EMPTYM11_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$a_emptym11_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$A_EMPTYM11_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains a duplicate member' "${ARGS[@]}"
pass 'A_emptym11: rejects a second, empty copy of the M11 member appended with no pax header at all'

# ---- B_nulm11. a pax path record containing a NUL byte followed by 'x' --
#      a Python-side parser that keeps the NUL in the decoded name would
#      treat this as distinct from the truncated name GNU tar/bsdtar
#      actually extract (both cut at the first NUL), letting a second
#      archive member hide behind the difference -----------------------
B_NULM11_DIR="$TMP/b-nulm11"
mkdir -p "$B_NULM11_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$B_NULM11_DIR/source.tar.gz" "apps/v1_api/prisma/migrations/$M11_NAME/migration.sql" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, encode_member, end_of_archive_marker, header_block, pax_header_block
from task168_test_fixtures import collect_members
stage, out, m11_path = sys.argv[2], sys.argv[3], sys.argv[4]
trunk = b''.join(encode_member(*m) for m in collect_members(stage, ['INPUT-MANIFEST.json', 'apps']))
nul_path = pax_header_block((m11_path + '\x00x').encode())
reg = header_block(b'irrelevant', 0, 0o644, b'0')
full = trunk + nul_path + reg + end_of_archive_marker()
full += b'\x00' * ((-len(full)) % 10240)  # RECORDSIZE, matching canonical_tar_bytes's own padding
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(full))
PY
b_nulm11_sha="$(sha "$B_NULM11_DIR/source.tar.gz")"
b_nulm11_bytes="$(wc -c < "$B_NULM11_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$b_nulm11_sha" --argjson b "$b_nulm11_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$B_NULM11_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$B_NULM11_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$b_nulm11_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$B_NULM11_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains a pax extended header record with a control byte' "${ARGS[@]}"
pass 'B_nulm11: rejects a pax path record with an embedded NUL byte'

# ---- HEADER-NAME-NUL. a regular header's raw ustar name field carries a NUL
#      byte followed by trailing garbage -- accepting only bytes before the
#      first NUL (the C-string convention every real tar implementation
#      uses) while keeping everything after it in the parsed name lets a
#      duplicate-detection check that compares full Python strings miss a
#      collision two tar implementations would both treat as the same name -
HEADER_NAME_NUL_DIR="$TMP/header-name-nul"
mkdir -p "$HEADER_NAME_NUL_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$HEADER_NAME_NUL_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, encode_member, end_of_archive_marker, header_block
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
trunk = b''.join(encode_member(*m) for m in collect_members(stage, ['INPUT-MANIFEST.json', 'apps']))
name_field = (b'apps/zz-nul.txt\x00JUNKDATA').ljust(100, b'\x00')[:100]
extra = header_block(name_field, 0, 0o644, b'0')
full = trunk + extra + end_of_archive_marker()
full += b'\x00' * ((-len(full)) % 10240)  # RECORDSIZE, matching canonical_tar_bytes's own padding
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(full))
PY
header_name_nul_sha="$(sha "$HEADER_NAME_NUL_DIR/source.tar.gz")"
header_name_nul_bytes="$(wc -c < "$HEADER_NAME_NUL_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$header_name_nul_sha" --argjson b "$header_name_nul_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$HEADER_NAME_NUL_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$HEADER_NAME_NUL_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$header_name_nul_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$HEADER_NAME_NUL_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains a header name with a control byte' "${ARGS[@]}"
pass 'HEADER-NAME-NUL: rejects a raw ustar name field carrying a NUL byte followed by trailing garbage'

# ---- INVALID-UTF8-NAME. a raw ustar name field carries an overlong-encoded
#      byte sequence that is not valid UTF-8 (no control byte, so it clears
#      the control-byte check) -- surrogateescape decoding still produces a
#      Python str for it, so this must be rejected by name, not left to
#      surface later as an encoding exception from some other consumer -----
INVALID_UTF8_NAME_DIR="$TMP/invalid-utf8-name"
mkdir -p "$INVALID_UTF8_NAME_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$INVALID_UTF8_NAME_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, encode_member, end_of_archive_marker, header_block
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
trunk = b''.join(encode_member(*m) for m in collect_members(stage, ['INPUT-MANIFEST.json', 'apps']))
name_field = (b'apps/zz-\xc0\xaf.txt').ljust(100, b'\x00')[:100]
extra = header_block(name_field, 0, 0o644, b'0')
full = trunk + extra + end_of_archive_marker()
full += b'\x00' * ((-len(full)) % 10240)  # RECORDSIZE, matching canonical_tar_bytes's own padding
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(full))
PY
invalid_utf8_name_sha="$(sha "$INVALID_UTF8_NAME_DIR/source.tar.gz")"
invalid_utf8_name_bytes="$(wc -c < "$INVALID_UTF8_NAME_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$invalid_utf8_name_sha" --argjson b "$invalid_utf8_name_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$INVALID_UTF8_NAME_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$INVALID_UTF8_NAME_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$invalid_utf8_name_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$INVALID_UTF8_NAME_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive member name is not valid UTF-8' "${ARGS[@]}"
pass 'INVALID-UTF8-NAME: rejects a raw ustar name field that is not valid UTF-8'

# ---- GZIP-TRAILING / GZIP-CONCAT. bytes after the archive's own single gzip
#      member -- arbitrary garbage, or a second complete, independently-valid
#      gzip member -- are rejected identically and before the tar walk even
#      starts, since the packager only ever writes exactly one member -------
GZIP_TRAILING_DIR="$TMP/gzip-trailing"
mkdir -p "$GZIP_TRAILING_DIR"
cp "$FIXTURE/source.tar.gz" "$GZIP_TRAILING_DIR/source.tar.gz"
printf 'GARBAGE' >> "$GZIP_TRAILING_DIR/source.tar.gz"
gzip_trailing_sha="$(sha "$GZIP_TRAILING_DIR/source.tar.gz")"
gzip_trailing_bytes="$(wc -c < "$GZIP_TRAILING_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$gzip_trailing_sha" --argjson b "$gzip_trailing_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$GZIP_TRAILING_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$GZIP_TRAILING_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$gzip_trailing_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$GZIP_TRAILING_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains trailing bytes after the gzip stream' "${ARGS[@]}"
pass 'GZIP-TRAILING: rejects arbitrary garbage bytes appended after the archive'\''s single gzip member'

GZIP_CONCAT_DIR="$TMP/gzip-concat"
mkdir -p "$GZIP_CONCAT_DIR"
cat "$FIXTURE/source.tar.gz" "$FIXTURE/source.tar.gz" > "$GZIP_CONCAT_DIR/source.tar.gz"
gzip_concat_sha="$(sha "$GZIP_CONCAT_DIR/source.tar.gz")"
gzip_concat_bytes="$(wc -c < "$GZIP_CONCAT_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$gzip_concat_sha" --argjson b "$gzip_concat_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$GZIP_CONCAT_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$GZIP_CONCAT_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$gzip_concat_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$GZIP_CONCAT_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains trailing bytes after the gzip stream' "${ARGS[@]}"
pass 'GZIP-CONCAT: rejects a second, independently-valid gzip member concatenated after the first'

# ---- END-MARKER-EXTRA. a real member sits after the tar body's own
#      end-of-archive marker (two all-NUL blocks) -- every parser this
#      script was probed against (tarfile, GNU tar, bsdtar, the walker
#      itself) stops at the first such marker and never looks past it, so
#      only a check over the archive's *entire* decompressed length (not
#      just up to the marker the walk stopped at) can catch this -----------
END_MARKER_EXTRA_DIR="$TMP/end-marker-extra"
mkdir -p "$END_MARKER_EXTRA_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$END_MARKER_EXTRA_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, encode_member, end_of_archive_marker
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
trunk = b''.join(encode_member(*m) for m in collect_members(stage, ['INPUT-MANIFEST.json', 'apps']))
hidden = encode_member('apps/zz-hidden.txt', b'0', 0o644, b'evil\n')
full = trunk + end_of_archive_marker() + hidden + end_of_archive_marker()
full += b'\x00' * ((-len(full)) % 10240)  # RECORDSIZE, matching canonical_tar_bytes's own padding
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(full))
PY
end_marker_extra_sha="$(sha "$END_MARKER_EXTRA_DIR/source.tar.gz")"
end_marker_extra_bytes="$(wc -c < "$END_MARKER_EXTRA_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$end_marker_extra_sha" --argjson b "$end_marker_extra_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$END_MARKER_EXTRA_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$END_MARKER_EXTRA_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$end_marker_extra_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$END_MARKER_EXTRA_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive is not in canonical form' "${ARGS[@]}"
pass 'END-MARKER-EXTRA: rejects a real member placed after the tar body'\''s own end-of-archive marker'

# ---- SHORT_PAX_DECOY. a pax path record names a short, all-ASCII file that
#      would never need a pax header under canonical_tar_bytes' own rule
#      (needs_pax is name length/non-ASCII driven), while the header's raw
#      ustar name field carries a different short, all-ASCII name -- real
#      tar always prefers a pax path when one is present, so this and
#      END-MARKER-EXTRA are two independent shapes only the identity check
#      (not any header-level rule) can catch ------------------------------
SHORT_PAX_DECOY_DIR="$TMP/short-pax-decoy"
mkdir -p "$SHORT_PAX_DECOY_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$SHORT_PAX_DECOY_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, encode_member, end_of_archive_marker, header_block, pax_header_block
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
trunk = b''.join(encode_member(*m) for m in collect_members(stage, ['INPUT-MANIFEST.json', 'apps']))
data = b'decoy\n'
extra = pax_header_block(b'apps/zz-short-real.txt') + header_block(b'apps/zz-short-decoy.txt', len(data), 0o644, b'0') + data
extra += b'\x00' * ((-len(data)) % 512)
full = trunk + extra + end_of_archive_marker()
full += b'\x00' * ((-len(full)) % 10240)  # RECORDSIZE, matching canonical_tar_bytes's own padding
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(full))
PY
short_pax_decoy_sha="$(sha "$SHORT_PAX_DECOY_DIR/source.tar.gz")"
short_pax_decoy_bytes="$(wc -c < "$SHORT_PAX_DECOY_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$short_pax_decoy_sha" --argjson b "$short_pax_decoy_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$SHORT_PAX_DECOY_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$SHORT_PAX_DECOY_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$short_pax_decoy_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$SHORT_PAX_DECOY_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive is not in canonical form' "${ARGS[@]}"
pass 'SHORT_PAX_DECOY: rejects a pax path naming a short ASCII file while the raw ustar name field carries a different short ASCII name'

# ---- LONG_PAX_WRONG_USTAR. a name long enough to require a pax path record
#      (>100 bytes) carries the correct pax path, but the header's raw ustar
#      name field (ignored by real tar whenever a pax path is present) is a
#      different string instead of canonical_tar_bytes' own name_bytes[:100]
#      -------------------------------------------------------------------
LONG_PAX_WRONG_USTAR_DIR="$TMP/long-pax-wrong-ustar"
mkdir -p "$LONG_PAX_WRONG_USTAR_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$LONG_PAX_WRONG_USTAR_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, encode_member, end_of_archive_marker, header_block, pax_header_block
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
trunk = b''.join(encode_member(*m) for m in collect_members(stage, ['INPUT-MANIFEST.json', 'apps']))
real_name = ('apps/' + 'z' * 120 + '.txt').encode('ascii')
data = b'long name\n'
extra = pax_header_block(real_name) + header_block(b'apps/zz-wrong-ustar-field.txt', len(data), 0o644, b'0') + data
extra += b'\x00' * ((-len(data)) % 512)
full = trunk + extra + end_of_archive_marker()
full += b'\x00' * ((-len(full)) % 10240)  # RECORDSIZE, matching canonical_tar_bytes's own padding
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(full))
PY
long_pax_wrong_ustar_sha="$(sha "$LONG_PAX_WRONG_USTAR_DIR/source.tar.gz")"
long_pax_wrong_ustar_bytes="$(wc -c < "$LONG_PAX_WRONG_USTAR_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$long_pax_wrong_ustar_sha" --argjson b "$long_pax_wrong_ustar_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$LONG_PAX_WRONG_USTAR_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$LONG_PAX_WRONG_USTAR_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$long_pax_wrong_ustar_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$LONG_PAX_WRONG_USTAR_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive is not in canonical form' "${ARGS[@]}"
pass 'LONG_PAX_WRONG_USTAR: rejects a long pax-named member whose raw ustar name field is not canonical_tar_bytes'\''s own name_bytes[:100]'

# ---- LONE_ZERO_THEN_MEMBER. a single all-NUL 512-byte block (not the two
#      consecutive blocks canonical_tar_bytes' own end_of_archive_marker
#      always emits), followed by another real member and only then the
#      genuine end-of-archive marker -- POSIX tar requires two consecutive
#      zero blocks to mark end-of-archive, so GNU tar/bsdtar read past a
#      lone one and would extract the hidden member for real -------------
LONE_ZERO_THEN_MEMBER_DIR="$TMP/lone-zero-then-member"
mkdir -p "$LONE_ZERO_THEN_MEMBER_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$LONE_ZERO_THEN_MEMBER_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, encode_member, end_of_archive_marker
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
trunk = b''.join(encode_member(*m) for m in collect_members(stage, ['INPUT-MANIFEST.json', 'apps']))
lone_zero = b'\x00' * 512
hidden = encode_member('apps/zz-hidden-behind-lone-zero.txt', b'0', 0o644, b'evil\n')
full = trunk + lone_zero + hidden + end_of_archive_marker()
full += b'\x00' * ((-len(full)) % 10240)  # RECORDSIZE, matching canonical_tar_bytes's own padding
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(full))
PY
lone_zero_then_member_sha="$(sha "$LONE_ZERO_THEN_MEMBER_DIR/source.tar.gz")"
lone_zero_then_member_bytes="$(wc -c < "$LONE_ZERO_THEN_MEMBER_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$lone_zero_then_member_sha" --argjson b "$lone_zero_then_member_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$LONE_ZERO_THEN_MEMBER_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$LONE_ZERO_THEN_MEMBER_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$lone_zero_then_member_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$LONE_ZERO_THEN_MEMBER_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive is not in canonical form' "${ARGS[@]}"
pass 'LONE_ZERO_THEN_MEMBER: rejects a real member hidden behind a single (non-terminating) all-NUL block'

# ---- AFTER_EOA_MEMBER. a real member sits immediately after the genuine
#      end-of-archive marker with no second marker closing it off again --
#      END-MARKER-EXTRA above additionally re-closes the hidden member with
#      its own end marker; this is the plainer shape, one member appended
#      right where only RECORDSIZE zero padding should follow ------------
AFTER_EOA_MEMBER_DIR="$TMP/after-eoa-member"
mkdir -p "$AFTER_EOA_MEMBER_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$AFTER_EOA_MEMBER_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, encode_member, end_of_archive_marker
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
trunk = b''.join(encode_member(*m) for m in collect_members(stage, ['INPUT-MANIFEST.json', 'apps']))
hidden = encode_member('apps/zz-hidden-after-eoa.txt', b'0', 0o644, b'evil\n')
full = trunk + end_of_archive_marker() + hidden
full += b'\x00' * ((-len(full)) % 10240)  # RECORDSIZE, matching canonical_tar_bytes's own padding
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(full))
PY
after_eoa_member_sha="$(sha "$AFTER_EOA_MEMBER_DIR/source.tar.gz")"
after_eoa_member_bytes="$(wc -c < "$AFTER_EOA_MEMBER_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$after_eoa_member_sha" --argjson b "$after_eoa_member_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$AFTER_EOA_MEMBER_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$AFTER_EOA_MEMBER_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$after_eoa_member_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$AFTER_EOA_MEMBER_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive is not in canonical form' "${ARGS[@]}"
pass 'AFTER_EOA_MEMBER: rejects a real member appended right after the genuine end-of-archive marker'

# ---- 10. non-canonical spellings of an in-scope migration path bypass a
#          check keyed on fixed "obviously bad" shapes only if the check
#          does not first demand the member's own canonical form -----------
for spelling in dotslash dblslash dotmid; do
  case "$spelling" in
    dotslash) evil_name="./apps/v1_api/prisma/migrations/20260912000000_${spelling}/migration.sql" ;;
    dblslash) evil_name="apps//v1_api/prisma/migrations/20260912000000_${spelling}/migration.sql" ;;
    dotmid)   evil_name="apps/./v1_api/prisma/migrations/20260912000000_${spelling}/migration.sql" ;;
  esac
  NONCANON_DIR="$TMP/noncanon-$spelling"
  mkdir -p "$NONCANON_DIR/stage"
  cp -R "$FIXTURE/stage/apps" "$NONCANON_DIR/stage/apps"
  cp "$FIXTURE/stage/INPUT-MANIFEST.json" "$NONCANON_DIR/stage/INPUT-MANIFEST.json"
  python3 - "$RELEASE_DIR" "$NONCANON_DIR/stage" "$NONCANON_DIR/source.tar.gz" "$evil_name" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, canonical_tar_bytes
from task168_test_fixtures import collect_members
stage, out, evil_name = sys.argv[2], sys.argv[3], sys.argv[4]
members = collect_members(stage, ['INPUT-MANIFEST.json', 'apps'])
members.append((evil_name, b'0', 0o644, b'-- evil\nSELECT 1;\n'))
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(canonical_tar_bytes(members)))
PY
  noncanon_sha="$(sha "$NONCANON_DIR/source.tar.gz")"
  noncanon_bytes="$(wc -c < "$NONCANON_DIR/source.tar.gz" | tr -d ' ')"
  jq --arg h "$noncanon_sha" --argjson b "$noncanon_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
    "$FIXTURE/source.tar.gz.attestation.json" > "$NONCANON_DIR/source.tar.gz.attestation.json"
  common_args
  for i in "${!ARGS[@]}"; do
    case "${ARGS[$i]}" in
      --source-archive) ARGS[$((i+1))]="$NONCANON_DIR/source.tar.gz" ;;
      --source-sha256) ARGS[$((i+1))]="$noncanon_sha" ;;
      --source-archive-attestation) ARGS[$((i+1))]="$NONCANON_DIR/source.tar.gz.attestation.json" ;;
    esac
  done
  run_expect_fail 'source archive contains a non-canonical path' "${ARGS[@]}"
  pass "rejects a non-canonical ($spelling) spelling of an extra migration path that a fixed-shape check would miss"
done

# ---- 11. a traversal (../) member whose name contains a space is still
#          rejected -- a check that reads the member name via `awk '{print
#          $NF}'` on `tar -tv` text output keeps only the text after the
#          last space and silently drops the rest of the path ---------------
SPACE_TRAVERSAL_DIR="$TMP/space-traversal"
mkdir -p "$SPACE_TRAVERSAL_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$SPACE_TRAVERSAL_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, canonical_tar_bytes
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
members = collect_members(stage, ['INPUT-MANIFEST.json', 'apps'])
members.append(('../evil with space.txt', b'0', 0o644, b'evil\n'))
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(canonical_tar_bytes(members)))
PY
space_traversal_sha="$(sha "$SPACE_TRAVERSAL_DIR/source.tar.gz")"
space_traversal_bytes="$(wc -c < "$SPACE_TRAVERSAL_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$space_traversal_sha" --argjson b "$space_traversal_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$SPACE_TRAVERSAL_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$SPACE_TRAVERSAL_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$space_traversal_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$SPACE_TRAVERSAL_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains an unsafe path' "${ARGS[@]}"
pass 'rejects a ../ traversal member whose name contains a space'

# ---- CASEFOLD-DUP. two archive members whose full paths differ only by
#      case are rejected -- tarfile treats them as distinct, but they
#      collide on any case-insensitive extraction filesystem --------------
CASEFOLD_DUP_DIR="$TMP/casefold-dup"
mkdir -p "$CASEFOLD_DUP_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$CASEFOLD_DUP_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, canonical_tar_bytes
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
members = collect_members(stage, ['INPUT-MANIFEST.json', 'apps'])
# Both extra names only ever exist as strings in this members list -- never
# as actual files -- so they can't collide on a case-insensitive filesystem
# the way two real on-disk paths named this way would.
members.append(('docs/Foo.txt', b'0', 0o644, b'a\n'))
members.append(('docs/foo.txt', b'0', 0o644, b'b\n'))
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(canonical_tar_bytes(members)))
PY
casefold_dup_sha="$(sha "$CASEFOLD_DUP_DIR/source.tar.gz")"
casefold_dup_bytes="$(wc -c < "$CASEFOLD_DUP_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$casefold_dup_sha" --argjson b "$casefold_dup_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$CASEFOLD_DUP_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$CASEFOLD_DUP_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$casefold_dup_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$CASEFOLD_DUP_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains member names that collide only by case' "${ARGS[@]}"
pass 'CASEFOLD-DUP: rejects two archive members whose full paths differ only by case'

# ---- CASEFOLD-BOUNDARY. a member under Apps/v1_api/prisma/ (wrong case) is
#      rejected -- the prisma allowlist below matches apps/v1_api/prisma/
#      case-sensitively, so this would otherwise land inside it unreviewed
#      on a case-insensitive extraction filesystem --------------------------
CASEFOLD_BOUNDARY_DIR="$TMP/casefold-boundary"
mkdir -p "$CASEFOLD_BOUNDARY_DIR"
python3 - "$RELEASE_DIR" "$FIXTURE/stage" "$CASEFOLD_BOUNDARY_DIR/source.tar.gz" <<'PY'
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.join(os.path.dirname(sys.argv[1]), 'qa'))
from task168_canonical_tar import canonical_gzip_bytes, canonical_tar_bytes
from task168_test_fixtures import collect_members
stage, out = sys.argv[2], sys.argv[3]
members = collect_members(stage, ['INPUT-MANIFEST.json', 'apps'])
members.append(('Apps/v1_api/prisma/evil.sql', b'0', 0o644, b'-- evil\nSELECT 1;\n'))
with open(out, 'wb') as fh:
    fh.write(canonical_gzip_bytes(canonical_tar_bytes(members)))
PY
casefold_boundary_sha="$(sha "$CASEFOLD_BOUNDARY_DIR/source.tar.gz")"
casefold_boundary_bytes="$(wc -c < "$CASEFOLD_BOUNDARY_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$casefold_boundary_sha" --argjson b "$casefold_boundary_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$CASEFOLD_BOUNDARY_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$CASEFOLD_BOUNDARY_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$casefold_boundary_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$CASEFOLD_BOUNDARY_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains a member whose path collides only by case with apps/v1_api/prisma/' "${ARGS[@]}"
pass 'CASEFOLD-BOUNDARY: rejects a member under Apps/v1_api/prisma/ (wrong case) that would land inside the reviewed tree on a case-insensitive filesystem'

# ---- LINKNAME. a regular-file ('0') header carrying a non-empty linkname
#      is rejected -- a regular file has no legitimate use for it ----------
LINKNAME_DIR="$TMP/linkname-nonempty"
mkdir -p "$LINKNAME_DIR"
python3 - "$FIXTURE/stage" "$LINKNAME_DIR/source.tar.gz" "$HERE" <<'PY'
import io, os, sys, tarfile, gzip
stage, out = sys.argv[1], sys.argv[2]
sys.path.insert(0, sys.argv[3])
from task168_test_fixtures import add_tar_members
def clean(ti):
    ti.mtime = 0; ti.uid = 0; ti.gid = 0; ti.uname = ''; ti.gname = ''
    return ti
def with_checksum(buf):
    buf = bytearray(buf)
    unsigned, _ = tarfile.calc_chksums(bytes(buf))
    buf[148:156] = ("%06o\0 " % unsigned).encode('ascii')
    return bytes(buf)
raw = io.BytesIO()
with tarfile.open(fileobj=raw, mode='w') as tar:
    tar.add(os.path.join(stage, 'INPUT-MANIFEST.json'), arcname='INPUT-MANIFEST.json', filter=clean)
    add_tar_members(tar, stage, 'apps', filter=clean)
    offset = raw.tell()
    info = tarfile.TarInfo(name='apps/zz-linkname-probe.txt')
    info.size = 0
    tar.addfile(info, io.BytesIO(b''))
data = bytearray(raw.getvalue())
header = bytearray(data[offset:offset + 512])
header[157:200] = b'sneaky-linkname-on-a-regular-file'.ljust(43, b'\x00')
data[offset:offset + 512] = bytearray(with_checksum(bytes(header)))
with gzip.GzipFile(out, 'wb', mtime=0) as gz:
    gz.write(bytes(data))
PY
linkname_sha="$(sha "$LINKNAME_DIR/source.tar.gz")"
linkname_bytes="$(wc -c < "$LINKNAME_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$linkname_sha" --argjson b "$linkname_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$LINKNAME_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$LINKNAME_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$linkname_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$LINKNAME_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive regular file member has a non-empty linkname' "${ARGS[@]}"
pass 'LINKNAME: rejects a regular-file header carrying a non-empty linkname field'

# ---- PAX-SIZE / PAX-LINKPATH. a per-member pax record overriding a key
#      other than 'path' (the only key the real packager ever emits) is
#      rejected. The size probe uses 0, not a large value: an inflated pax
#      size makes the system `tar` used elsewhere in the script to extract
#      INPUT-MANIFEST.json overrun the archive, rejecting it for that
#      unrelated reason before this check ever runs -----------------------
for probe_key in size linkpath; do
  PAX_KEY_DIR="$TMP/pax-key-$probe_key"
  mkdir -p "$PAX_KEY_DIR"
  python3 - "$FIXTURE/stage" "$PAX_KEY_DIR/source.tar.gz" "$probe_key" "$HERE" <<'PY'
import io, os, sys, tarfile
stage, out, probe_key = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, sys.argv[4])
from task168_test_fixtures import add_tar_members
def clean(ti):
    ti.mtime = 0; ti.uid = 0; ti.gid = 0; ti.uname = ''; ti.gname = ''
    return ti
probe_value = '0' if probe_key == 'size' else '/etc/passwd'
with tarfile.open(out, 'w:gz') as tar:
    tar.add(os.path.join(stage, 'INPUT-MANIFEST.json'), arcname='INPUT-MANIFEST.json', filter=clean)
    add_tar_members(tar, stage, 'apps', filter=clean)
    data = b'evil\n'
    info = tarfile.TarInfo(name='apps/zz-pax-%s-probe.txt' % probe_key)
    info.size = len(data)
    info.pax_headers = {probe_key: probe_value}
    tar.addfile(info, io.BytesIO(data))
PY
  pax_key_sha="$(sha "$PAX_KEY_DIR/source.tar.gz")"
  pax_key_bytes="$(wc -c < "$PAX_KEY_DIR/source.tar.gz" | tr -d ' ')"
  jq --arg h "$pax_key_sha" --argjson b "$pax_key_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
    "$FIXTURE/source.tar.gz.attestation.json" > "$PAX_KEY_DIR/source.tar.gz.attestation.json"
  common_args
  for i in "${!ARGS[@]}"; do
    case "${ARGS[$i]}" in
      --source-archive) ARGS[$((i+1))]="$PAX_KEY_DIR/source.tar.gz" ;;
      --source-sha256) ARGS[$((i+1))]="$pax_key_sha" ;;
      --source-archive-attestation) ARGS[$((i+1))]="$PAX_KEY_DIR/source.tar.gz.attestation.json" ;;
    esac
  done
  run_expect_fail "source archive contains an unauthorized pax extended header key: $probe_key" "${ARGS[@]}"
  pass "PAX-$probe_key: rejects a per-member pax record overriding $probe_key, a key the real packager never emits"
done

# ---- LONGNAME. a GNU-format archive (which would carry a longname 'L'
#      header) is rejected on its GNU magic before 'L' is even reached --
#      the writer uses PAX_FORMAT's ustar magic and a pax 'path' record ----
LONGNAME_DIR="$TMP/longname"
mkdir -p "$LONGNAME_DIR"
python3 - "$FIXTURE/stage" "$LONGNAME_DIR/source.tar.gz" "$HERE" <<'PY'
import io, os, sys, tarfile
stage, out = sys.argv[1], sys.argv[2]
sys.path.insert(0, sys.argv[3])
from task168_test_fixtures import add_tar_members
def clean(ti):
    ti.mtime = 0; ti.uid = 0; ti.gid = 0; ti.uname = ''; ti.gname = ''
    return ti
with tarfile.open(out, 'w:gz', format=tarfile.GNU_FORMAT) as tar:
    tar.add(os.path.join(stage, 'INPUT-MANIFEST.json'), arcname='INPUT-MANIFEST.json', filter=clean)
    add_tar_members(tar, stage, 'apps', filter=clean)
    data = b'-- x\n'
    info = tarfile.TarInfo(name='apps/' + ('z' * 100) + '/probe.txt')
    info.size = len(data)
    clean(info)
    tar.addfile(info, io.BytesIO(data))
PY
longname_sha="$(sha "$LONGNAME_DIR/source.tar.gz")"
longname_bytes="$(wc -c < "$LONGNAME_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$longname_sha" --argjson b "$longname_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$LONGNAME_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$LONGNAME_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$longname_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$LONGNAME_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains a header with an unsupported magic value' "${ARGS[@]}"
pass 'LONGNAME: rejects a GNU-format archive carrying a longname (L) header'

# ---- SPARSE. a header whose typeflag byte is patched to 'S' (GNU sparse) is
#      rejected -- the real packager only ever writes regular-file '0' -----
SPARSE_DIR="$TMP/sparse-typeflag"
mkdir -p "$SPARSE_DIR"
python3 - "$FIXTURE/stage" "$SPARSE_DIR/source.tar.gz" "$HERE" <<'PY'
import io, os, sys, tarfile, gzip
stage, out = sys.argv[1], sys.argv[2]
sys.path.insert(0, sys.argv[3])
from task168_test_fixtures import add_tar_members
def clean(ti):
    ti.mtime = 0; ti.uid = 0; ti.gid = 0; ti.uname = ''; ti.gname = ''
    return ti
def with_checksum(buf):
    buf = bytearray(buf)
    unsigned, _ = tarfile.calc_chksums(bytes(buf))
    buf[148:156] = ("%06o\0 " % unsigned).encode('ascii')
    return bytes(buf)
raw = io.BytesIO()
with tarfile.open(fileobj=raw, mode='w') as tar:
    tar.add(os.path.join(stage, 'INPUT-MANIFEST.json'), arcname='INPUT-MANIFEST.json', filter=clean)
    add_tar_members(tar, stage, 'apps', filter=clean)
    offset = raw.tell()
    info = tarfile.TarInfo(name='apps/zz-sparse-probe.txt')
    info.size = 0
    tar.addfile(info, io.BytesIO(b''))
data = bytearray(raw.getvalue())
header = bytearray(data[offset:offset + 512])
header[156:157] = b'S'
data[offset:offset + 512] = bytearray(with_checksum(bytes(header)))
with gzip.GzipFile(out, 'wb', mtime=0) as gz:
    gz.write(bytes(data))
PY
sparse_sha="$(sha "$SPARSE_DIR/source.tar.gz")"
sparse_bytes="$(wc -c < "$SPARSE_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$sparse_sha" --argjson b "$sparse_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$SPARSE_DIR/source.tar.gz.attestation.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$SPARSE_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$sparse_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$SPARSE_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'source archive contains an unauthorized typeflag' "${ARGS[@]}"
pass 'SPARSE: rejects an archive that carries a GNU sparse (S) typeflag'

# ---- HEADER-PREFIX-{oldgnu,v7}. a header with a non-ustar magic (OLDGNU, or
#      none at all) plus a non-empty ustar prefix field, which some tar
#      implementations honor regardless of magic and others only for POSIX
#      ustar -- the writer never emits either, so both are rejected --------
for probe_magic in oldgnu v7; do
  PREFIX_DIR="$TMP/header-prefix-$probe_magic"
  mkdir -p "$PREFIX_DIR"
  python3 - "$FIXTURE/stage" "$PREFIX_DIR/source.tar.gz" "$probe_magic" "$HERE" <<'PY'
import io, os, sys, tarfile, gzip
stage, out, probe_magic = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, sys.argv[4])
from task168_test_fixtures import add_tar_members
def clean(ti):
    ti.mtime = 0; ti.uid = 0; ti.gid = 0; ti.uname = ''; ti.gname = ''
    return ti
def with_checksum(buf):
    buf = bytearray(buf)
    unsigned, _ = tarfile.calc_chksums(bytes(buf))
    buf[148:156] = ("%06o\0 " % unsigned).encode('ascii')
    return bytes(buf)
raw = io.BytesIO()
with tarfile.open(fileobj=raw, mode='w') as tar:
    tar.add(os.path.join(stage, 'INPUT-MANIFEST.json'), arcname='INPUT-MANIFEST.json', filter=clean)
    add_tar_members(tar, stage, 'apps', filter=clean)
    offset = raw.tell()
    data = b'DROP SCHEMA public CASCADE;\n'
    info = tarfile.TarInfo(name='migration.sql')
    info.size = len(data)
    clean(info)
    tar.addfile(info, io.BytesIO(data))
buf = bytearray(raw.getvalue())
header = bytearray(buf[offset:offset + 512])
magic = b'ustar  \x00' if probe_magic == 'oldgnu' else b'\x00' * 8
header[257:265] = magic
prefix = b'apps/v1_api/prisma/migrations/20990101000000_evil'
header[345:345 + len(prefix)] = prefix
header[345 + len(prefix):500] = b'\x00' * (155 - len(prefix))
buf[offset:offset + 512] = bytearray(with_checksum(bytes(header)))
with gzip.GzipFile(out, 'wb', mtime=0) as gz:
    gz.write(bytes(buf))
PY
  prefix_sha="$(sha "$PREFIX_DIR/source.tar.gz")"
  prefix_bytes="$(wc -c < "$PREFIX_DIR/source.tar.gz" | tr -d ' ')"
  jq --arg h "$prefix_sha" --argjson b "$prefix_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
    "$FIXTURE/source.tar.gz.attestation.json" > "$PREFIX_DIR/source.tar.gz.attestation.json"
  common_args
  for i in "${!ARGS[@]}"; do
    case "${ARGS[$i]}" in
      --source-archive) ARGS[$((i+1))]="$PREFIX_DIR/source.tar.gz" ;;
      --source-sha256) ARGS[$((i+1))]="$prefix_sha" ;;
      --source-archive-attestation) ARGS[$((i+1))]="$PREFIX_DIR/source.tar.gz.attestation.json" ;;
    esac
  done
  run_expect_fail 'source archive contains a header with an unsupported magic value' "${ARGS[@]}"
  pass "HEADER-PREFIX-$probe_magic: rejects a non-ustar-magic header carrying a non-empty ustar prefix field"
done

# ---- 12. sidecar sourceCommit differs from --release-sha -------------------
BAD_SIDECAR_COMMIT="$TMP/bad-sidecar-commit.json"
jq '.sourceCommit = "cccccccccccccccccccccccccccccccccccccccc"' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$BAD_SIDECAR_COMMIT"
common_args
for i in "${!ARGS[@]}"; do
  if [[ "${ARGS[$i]}" == "--source-archive-attestation" ]]; then ARGS[$((i+1))]="$BAD_SIDECAR_COMMIT"; fi
done
run_expect_fail 'source archive attestation does not authenticate this archive' "${ARGS[@]}"
pass 'rejects a sidecar whose sourceCommit does not match --release-sha'

# ---- 13. sidecar archiveBytes differs from the actual archive size --------
BAD_SIDECAR_BYTES="$TMP/bad-sidecar-bytes.json"
jq '.archiveBytes = (.archiveBytes + 1)' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$BAD_SIDECAR_BYTES"
common_args
for i in "${!ARGS[@]}"; do
  if [[ "${ARGS[$i]}" == "--source-archive-attestation" ]]; then ARGS[$((i+1))]="$BAD_SIDECAR_BYTES"; fi
done
run_expect_fail 'source archive attestation does not authenticate this archive' "${ARGS[@]}"
pass 'rejects a sidecar whose archiveBytes does not match the actual archive size'

# ---- 14. the archive-embedded manifest's own sourceCommit differs from
#          --release-sha, while the sidecar that vouches for that same
#          archive is (re-)signed correctly against --release-sha -- this
#          isolates the INPUT_SNAPSHOT-side binding from the sidecar-side
#          binding exercised in (12) ----------------------------------------
WRONG_EMBEDDED_COMMIT_DIR="$TMP/wrong-embedded-commit"
mkdir -p "$WRONG_EMBEDDED_COMMIT_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$WRONG_EMBEDDED_COMMIT_DIR/stage/apps"
jq '.sourceCommit = "dddddddddddddddddddddddddddddddddddddddd"' \
  "$FIXTURE/stage/INPUT-MANIFEST.json" > "$WRONG_EMBEDDED_COMMIT_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$WRONG_EMBEDDED_COMMIT_DIR/stage" "$WRONG_EMBEDDED_COMMIT_DIR/source.tar.gz" INPUT-MANIFEST.json apps
wrong_commit_manifest_sha="$(sha "$WRONG_EMBEDDED_COMMIT_DIR/stage/INPUT-MANIFEST.json")"
wrong_commit_archive_sha="$(sha "$WRONG_EMBEDDED_COMMIT_DIR/source.tar.gz")"
wrong_commit_archive_bytes="$(wc -c < "$WRONG_EMBEDDED_COMMIT_DIR/source.tar.gz" | tr -d ' ')"
jq --arg commit "$RELEASE_SHA" --arg h "$wrong_commit_archive_sha" --argjson b "$wrong_commit_archive_bytes" --arg m "$wrong_commit_manifest_sha" \
  '.sourceCommit=$commit | .archiveSha256=$h | .archiveBytes=$b | .inputManifestSha256=$m | .inputSnapshotSha256=$m' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$WRONG_EMBEDDED_COMMIT_DIR/source.tar.gz.attestation.json"
cp "$WRONG_EMBEDDED_COMMIT_DIR/stage/INPUT-MANIFEST.json" "$WRONG_EMBEDDED_COMMIT_DIR/input-snapshot.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$WRONG_EMBEDDED_COMMIT_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$wrong_commit_archive_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$WRONG_EMBEDDED_COMMIT_DIR/source.tar.gz.attestation.json" ;;
    --input-snapshot) ARGS[$((i+1))]="$WRONG_EMBEDDED_COMMIT_DIR/input-snapshot.json" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$wrong_commit_manifest_sha" ;;
  esac
done
run_expect_fail 'input snapshot does not authenticate the prepared Stage B source/archive contract' "${ARGS[@]}"
pass 'rejects an archive-embedded manifest whose own sourceCommit does not match --release-sha, even though its sidecar is correctly (re-)signed'

# ---- 15. archiveLayout.pathPrefix is not empty -----------------------------
NONEMPTY_PREFIX_DIR="$TMP/nonempty-prefix"
mkdir -p "$NONEMPTY_PREFIX_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$NONEMPTY_PREFIX_DIR/stage/apps"
jq '.archiveLayout.pathPrefix = "bundle/"' \
  "$FIXTURE/stage/INPUT-MANIFEST.json" > "$NONEMPTY_PREFIX_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$NONEMPTY_PREFIX_DIR/stage" "$NONEMPTY_PREFIX_DIR/source.tar.gz" INPUT-MANIFEST.json apps
nonempty_prefix_manifest_sha="$(sha "$NONEMPTY_PREFIX_DIR/stage/INPUT-MANIFEST.json")"
nonempty_prefix_archive_sha="$(sha "$NONEMPTY_PREFIX_DIR/source.tar.gz")"
nonempty_prefix_archive_bytes="$(wc -c < "$NONEMPTY_PREFIX_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$nonempty_prefix_archive_sha" --argjson b "$nonempty_prefix_archive_bytes" --arg m "$nonempty_prefix_manifest_sha" \
  '.archiveSha256=$h | .archiveBytes=$b | .inputManifestSha256=$m | .inputSnapshotSha256=$m' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$NONEMPTY_PREFIX_DIR/source.tar.gz.attestation.json"
cp "$NONEMPTY_PREFIX_DIR/stage/INPUT-MANIFEST.json" "$NONEMPTY_PREFIX_DIR/input-snapshot.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$NONEMPTY_PREFIX_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$nonempty_prefix_archive_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$NONEMPTY_PREFIX_DIR/source.tar.gz.attestation.json" ;;
    --input-snapshot) ARGS[$((i+1))]="$NONEMPTY_PREFIX_DIR/input-snapshot.json" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$nonempty_prefix_manifest_sha" ;;
  esac
done
run_expect_fail 'input snapshot does not declare a repository-root (empty pathPrefix) archive layout' "${ARGS[@]}"
pass 'rejects an input snapshot that declares a non-empty archiveLayout.pathPrefix'


# ---- 16-20. RESOLVED_ATTEMPTS_JSON canonical-rolled-back-row validation ---
# Synthetic fixtures only (no alpha/production ledger data): each case
# supplies one malformed resolved-migration-attempt row and expects the
# static (pre-Docker) canonical-row check to reject it before any other
# check further down the script can mask the failure.
RESOLVED_GOOD_ROW='{"migration_name":"20260908130000_m1","checksum":"'"$(printf x | sha256sum | awk '{print $1}')"'","finished_at":null,"rolled_back_at":"2026-09-01T00:00:00Z"}'

run_resolved_case() {
  local desc="$1" row="$2"
  local f="$TMP/resolved-bad-$RANDOM.json"
  printf '[%s]\n' "$row" > "$f"
  common_args
  for i in "${!ARGS[@]}"; do
    if [[ "${ARGS[$i]}" == "--resolved-migration-attempts-json" ]]; then ARGS[$((i+1))]="$f"; fi
  done
  run_expect_fail 'resolved migration attempt snapshot must contain canonical rolled-back rows' "${ARGS[@]}"
  pass "$desc"
}

# 16. malformed migration_name (not <14-digit>_<slug>)
run_resolved_case 'rejects a resolved-attempt row with a malformed migration_name' \
  '{"migration_name":"not-a-migration","checksum":"'"$(printf x | sha256sum | awk '{print $1}')"'","finished_at":null,"rolled_back_at":"2026-09-01T00:00:00Z"}'

# 17. malformed checksum (not 64 lowercase hex)
run_resolved_case 'rejects a resolved-attempt row with a malformed checksum' \
  '{"migration_name":"20260908130000_m1","checksum":"nothex","finished_at":null,"rolled_back_at":"2026-09-01T00:00:00Z"}'

# 18. finished_at is not null (not actually an unresolved/rolled-back-only row)
run_resolved_case 'rejects a resolved-attempt row whose finished_at is not null' \
  '{"migration_name":"20260908130000_m1","checksum":"'"$(printf x | sha256sum | awk '{print $1}')"'","finished_at":"2026-09-01T00:00:00Z","rolled_back_at":"2026-09-01T00:00:00Z"}'

# 19. rolled_back_at is null (not actually a resolved row)
run_resolved_case 'rejects a resolved-attempt row whose rolled_back_at is null' \
  '{"migration_name":"20260908130000_m1","checksum":"'"$(printf x | sha256sum | awk '{print $1}')"'","finished_at":null,"rolled_back_at":null}'

# 20. two rows differing only in ordering must still canonicalize the same
#     way regardless of input order (sanity: the sort_by comparison itself
#     is exercised, not just single-row shape) -- supplying them already
#     out of sort order must still be accepted (canonicalization, not order
#     rejection) so this is a positive case guarding against an
#     over-eager order check that would reject valid unsorted input.
UNSORTED_ROWS='[{"migration_name":"20260911090000_retire_tournament_fixture_tables","checksum":"'"$(printf y | sha256sum | awk '{print $1}')"'","finished_at":null,"rolled_back_at":"2026-09-02T00:00:00Z"},'"$RESOLVED_GOOD_ROW"']'
f="$TMP/resolved-unsorted.json"
printf '%s\n' "$UNSORTED_ROWS" > "$f"
common_args
for i in "${!ARGS[@]}"; do
  if [[ "${ARGS[$i]}" == "--resolved-migration-attempts-json" ]]; then ARGS[$((i+1))]="$f"; fi
done
run_expect_fail 'migration contract must contain exactly 11 hashed entries' "${ARGS[@]}"
pass 'accepts two well-formed resolved-attempt rows supplied out of sort order (canonicalized before validation)'


# ---- 21. MIGRATIONS_JSON entry with a null sha256 must not silently drop
#          out of an array-filter check ([x|strings|test(...)]|all treats a
#          non-string element as absent rather than failing) --------------
NULL_SHA_MIGRATIONS="$TMP/null-sha-migrations.json"
# Must be a full 11-entry array: a shorter array would already fail the
# preceding length==11 check for an unrelated reason, making the null-sha256
# case vacuous (proving nothing about the sha256 type check being tested).
python3 -c "
import json, hashlib
names = ['20260908%02d0000_m%d' % (n, n) for n in range(1, 11)] + ['20260911090000_retire_tournament_fixture_tables']
rows = [{'name': n, 'sha256': hashlib.sha256(n.encode()).hexdigest()} for n in names]
rows[3]['sha256'] = None
print(json.dumps(rows))
" > "$NULL_SHA_MIGRATIONS"
common_args
for i in "${!ARGS[@]}"; do
  if [[ "${ARGS[$i]}" == "--migrations-json" ]]; then ARGS[$((i+1))]="$NULL_SHA_MIGRATIONS"; fi
done
run_expect_fail 'migration contract must contain exactly 11 hashed entries' "${ARGS[@]}"
pass 'rejects a Task 168 migration contract entry whose sha256 is null'

# ---- G1/G2/G4. archive-vs-files[] self-consistency is not the same binding
#      as files[]-vs-fullMigrationHistory/finalSchema -------------------------
# The checks exercised through (9) prove files[] is self-consistent with the
# archive's own bytes. They never compare that inventory against
# fullMigrationHistory/finalSchema -- the fields --migration-root and
# --schema (the actual rehearsal inputs, verified elsewhere in the script)
# are pinned to. These three probes tamper only the archive + its files[]
# entries (rehashed to match each other, so archive-vs-files[] alone stays
# green) while leaving fullMigrationHistory, finalSchema.sha256,
# --migration-root and --schema exactly as the good fixture built them.

# G1: archive's M1 content + files[] M1 entry are tampered together
# (rehashed to match each other); fullMigrationHistory (and --migration-root,
# left untouched) still declares the original M1 hash.
G1_DIR="$TMP/g1-files-vs-history-tamper"
mkdir -p "$G1_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$G1_DIR/stage/apps"
printf -- '-- m1 EVIL\nSELECT 1;\n' > "$G1_DIR/stage/apps/v1_api/prisma/migrations/$M1_NAME/migration.sql"
g1_m1_sha="$(sha "$G1_DIR/stage/apps/v1_api/prisma/migrations/$M1_NAME/migration.sql")"
g1_m1_bytes="$(wc -c < "$G1_DIR/stage/apps/v1_api/prisma/migrations/$M1_NAME/migration.sql" | tr -d ' ')"
jq --arg p "apps/v1_api/prisma/migrations/$M1_NAME/migration.sql" --arg h "$g1_m1_sha" --argjson b "$g1_m1_bytes" \
  '.files |= map(if .path == $p then .sha256 = $h | .bytes = $b else . end)' \
  "$FIXTURE/stage/INPUT-MANIFEST.json" > "$G1_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$G1_DIR/stage" "$G1_DIR/source.tar.gz" INPUT-MANIFEST.json apps
g1_manifest_sha="$(sha "$G1_DIR/stage/INPUT-MANIFEST.json")"
g1_archive_sha="$(sha "$G1_DIR/source.tar.gz")"
g1_archive_bytes="$(wc -c < "$G1_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$g1_archive_sha" --argjson b "$g1_archive_bytes" --arg m "$g1_manifest_sha" \
  '.archiveSha256=$h | .archiveBytes=$b | .inputManifestSha256=$m | .inputSnapshotSha256=$m' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$G1_DIR/source.tar.gz.attestation.json"
cp "$G1_DIR/stage/INPUT-MANIFEST.json" "$G1_DIR/input-snapshot.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$G1_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$g1_archive_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$G1_DIR/source.tar.gz.attestation.json" ;;
    --input-snapshot) ARGS[$((i+1))]="$G1_DIR/input-snapshot.json" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$g1_manifest_sha" ;;
  esac
done
run_expect_fail 'archive files inventory does not exactly match the declared full migration history' "${ARGS[@]}"
pass 'G1: rejects an archive whose M1 content + files[] entry are tampered together while fullMigrationHistory/--migration-root still declare the original hash'

# G2: archive drops the M1 member entirely and files[] drops its M1 entry to
# match (self-consistent with the archive); fullMigrationHistory (and
# --migration-root, left untouched) still requires M1.
G2_DIR="$TMP/g2-missing-archive-member"
mkdir -p "$G2_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$G2_DIR/stage/apps"
rm -rf "$G2_DIR/stage/apps/v1_api/prisma/migrations/$M1_NAME"
jq --arg p "apps/v1_api/prisma/migrations/$M1_NAME/migration.sql" \
  '.files |= map(select(.path != $p))' \
  "$FIXTURE/stage/INPUT-MANIFEST.json" > "$G2_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$G2_DIR/stage" "$G2_DIR/source.tar.gz" INPUT-MANIFEST.json apps
g2_manifest_sha="$(sha "$G2_DIR/stage/INPUT-MANIFEST.json")"
g2_archive_sha="$(sha "$G2_DIR/source.tar.gz")"
g2_archive_bytes="$(wc -c < "$G2_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$g2_archive_sha" --argjson b "$g2_archive_bytes" --arg m "$g2_manifest_sha" \
  '.archiveSha256=$h | .archiveBytes=$b | .inputManifestSha256=$m | .inputSnapshotSha256=$m' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$G2_DIR/source.tar.gz.attestation.json"
cp "$G2_DIR/stage/INPUT-MANIFEST.json" "$G2_DIR/input-snapshot.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$G2_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$g2_archive_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$G2_DIR/source.tar.gz.attestation.json" ;;
    --input-snapshot) ARGS[$((i+1))]="$G2_DIR/input-snapshot.json" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$g2_manifest_sha" ;;
  esac
done
run_expect_fail 'archive files inventory does not exactly match the declared full migration history' "${ARGS[@]}"
pass 'G2: rejects an archive with no M1 member at all (files[] dropped to match) while fullMigrationHistory/--migration-root still require it'

# G4: archive's schema.prisma content + files[] schema entry are tampered
# together; finalSchema.sha256 (and --schema/--schema-sha256, the actual
# rehearsal input, left untouched) still declares the original hash.
G4_DIR="$TMP/g4-schema-tamper"
mkdir -p "$G4_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$G4_DIR/stage/apps"
printf '// evil schema\n' >> "$G4_DIR/stage/apps/v1_api/prisma/schema.prisma"
g4_schema_sha="$(sha "$G4_DIR/stage/apps/v1_api/prisma/schema.prisma")"
g4_schema_bytes="$(wc -c < "$G4_DIR/stage/apps/v1_api/prisma/schema.prisma" | tr -d ' ')"
jq --arg p 'apps/v1_api/prisma/schema.prisma' --arg h "$g4_schema_sha" --argjson b "$g4_schema_bytes" \
  '.files |= map(if .path == $p then .sha256 = $h | .bytes = $b else . end)' \
  "$FIXTURE/stage/INPUT-MANIFEST.json" > "$G4_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$G4_DIR/stage" "$G4_DIR/source.tar.gz" INPUT-MANIFEST.json apps
g4_manifest_sha="$(sha "$G4_DIR/stage/INPUT-MANIFEST.json")"
g4_archive_sha="$(sha "$G4_DIR/source.tar.gz")"
g4_archive_bytes="$(wc -c < "$G4_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$g4_archive_sha" --argjson b "$g4_archive_bytes" --arg m "$g4_manifest_sha" \
  '.archiveSha256=$h | .archiveBytes=$b | .inputManifestSha256=$m | .inputSnapshotSha256=$m' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$G4_DIR/source.tar.gz.attestation.json"
cp "$G4_DIR/stage/INPUT-MANIFEST.json" "$G4_DIR/input-snapshot.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$G4_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$g4_archive_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$G4_DIR/source.tar.gz.attestation.json" ;;
    --input-snapshot) ARGS[$((i+1))]="$G4_DIR/input-snapshot.json" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$g4_manifest_sha" ;;
  esac
done
run_expect_fail 'archive files inventory does not authenticate the pinned final schema' "${ARGS[@]}"
pass 'G4: rejects an archive whose schema.prisma content + files[] entry are tampered together while finalSchema.sha256/--schema still declare the original hash'

# ---- PIN-1: a fully self-consistent but non-reviewed schema is rejected ---
# G4 tampers the archive against an unchanged --schema/--schema-sha256, so it
# never exercises the absolute FINAL_SCHEMA_SHA pin on its own. This probe
# changes schema.prisma content and rehashes *every* dependent field
# (files[] entry, finalSchema.sha256, --schema, --schema-sha256) to match
# each other -- every relative cross-check above stays green -- so only the
# hardcoded pin can catch a caller that is wrong but internally consistent
# (e.g. accidentally pointed at an unreviewed draft schema).
PIN1_DIR="$TMP/pin1-self-consistent-wrong-schema"
mkdir -p "$PIN1_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$PIN1_DIR/stage/apps"
printf '// not the reviewed schema\n' >> "$PIN1_DIR/stage/apps/v1_api/prisma/schema.prisma"
pin1_schema_sha="$(sha "$PIN1_DIR/stage/apps/v1_api/prisma/schema.prisma")"
pin1_schema_bytes="$(wc -c < "$PIN1_DIR/stage/apps/v1_api/prisma/schema.prisma" | tr -d ' ')"
jq --arg p 'apps/v1_api/prisma/schema.prisma' --arg h "$pin1_schema_sha" --argjson b "$pin1_schema_bytes" \
  '.finalSchema.sha256 = $h | .files |= map(if .path == $p then .sha256 = $h | .bytes = $b else . end)' \
  "$FIXTURE/stage/INPUT-MANIFEST.json" > "$PIN1_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$PIN1_DIR/stage" "$PIN1_DIR/source.tar.gz" INPUT-MANIFEST.json apps
pin1_manifest_sha="$(sha "$PIN1_DIR/stage/INPUT-MANIFEST.json")"
pin1_archive_sha="$(sha "$PIN1_DIR/source.tar.gz")"
pin1_archive_bytes="$(wc -c < "$PIN1_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$pin1_archive_sha" --argjson b "$pin1_archive_bytes" --arg m "$pin1_manifest_sha" \
  '.archiveSha256=$h | .archiveBytes=$b | .inputManifestSha256=$m | .inputSnapshotSha256=$m' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$PIN1_DIR/source.tar.gz.attestation.json"
cp "$PIN1_DIR/stage/INPUT-MANIFEST.json" "$PIN1_DIR/input-snapshot.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$PIN1_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$pin1_archive_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$PIN1_DIR/source.tar.gz.attestation.json" ;;
    --input-snapshot) ARGS[$((i+1))]="$PIN1_DIR/input-snapshot.json" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$pin1_manifest_sha" ;;
    --schema) ARGS[$((i+1))]="$PIN1_DIR/stage/apps/v1_api/prisma/schema.prisma" ;;
    --schema-sha256) ARGS[$((i+1))]="$pin1_schema_sha" ;;
  esac
done
run_expect_fail 'pinned final schema sha256 does not match the reviewed checksum' "${ARGS[@]}"
pass 'PIN-1: rejects a fully self-consistent schema (archive/files[]/finalSchema/--schema all agree with each other) that is not the reviewed FINAL_SCHEMA_SHA'

# ---- PIN-2: rehearsal --schema/finalSchema.sha256 diverge from what the
#             archive's files[] entry (and actual bytes) declare -----------
# PIN-1 changes files[]/finalSchema/--schema together, so it happens to also
# trip the files[]-vs-FINAL_SCHEMA_SHA check (b) -- it does not, on its own,
# prove the separate SCHEMA_SHA==FINAL_SCHEMA_SHA pin is load-bearing. This
# probe leaves the archive and its files[] entry exactly as the good
# (reviewed) fixture built them (so check (b) stays green: files[]'s
# schema.prisma entry is still, and actually is, FINAL_SCHEMA_SHA), and only
# moves finalSchema.sha256 + --schema/--schema-sha256 together to a
# different, self-consistent, dummy value (so the input-snapshot's own
# finalSchema.sha256==--schema-sha256 binding stays green too). Only the
# SCHEMA_SHA==FINAL_SCHEMA_SHA pin can catch a rehearsal input that both
# check (b) and that binding miss this way.
PIN2_DIR="$TMP/pin2-rehearsal-schema-diverges"
mkdir -p "$PIN2_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$PIN2_DIR/stage/apps"
printf 'generator client {\n  provider = "prisma-client-js"\n}\n// not the reviewed schema\n' > "$PIN2_DIR/schema.prisma"
pin2_schema_sha="$(sha "$PIN2_DIR/schema.prisma")"
# files[] is left untouched -- it still declares the real, reviewed
# FINAL_SCHEMA_SHA for schema.prisma, matching the archive's actual
# (unmodified) bytes. Only finalSchema.sha256 (the field the input-snapshot
# binding and --schema are checked against) is moved to the dummy value.
jq --arg h "$pin2_schema_sha" '.finalSchema.sha256 = $h' \
  "$FIXTURE/stage/INPUT-MANIFEST.json" > "$PIN2_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$PIN2_DIR/stage" "$PIN2_DIR/source.tar.gz" INPUT-MANIFEST.json apps
pin2_manifest_sha="$(sha "$PIN2_DIR/stage/INPUT-MANIFEST.json")"
pin2_archive_sha="$(sha "$PIN2_DIR/source.tar.gz")"
pin2_archive_bytes="$(wc -c < "$PIN2_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$pin2_archive_sha" --argjson b "$pin2_archive_bytes" --arg m "$pin2_manifest_sha" \
  '.archiveSha256=$h | .archiveBytes=$b | .inputManifestSha256=$m | .inputSnapshotSha256=$m' \
  "$FIXTURE/source.tar.gz.attestation.json" > "$PIN2_DIR/source.tar.gz.attestation.json"
cp "$PIN2_DIR/stage/INPUT-MANIFEST.json" "$PIN2_DIR/input-snapshot.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$PIN2_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$pin2_archive_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$PIN2_DIR/source.tar.gz.attestation.json" ;;
    --input-snapshot) ARGS[$((i+1))]="$PIN2_DIR/input-snapshot.json" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$pin2_manifest_sha" ;;
    --schema) ARGS[$((i+1))]="$PIN2_DIR/schema.prisma" ;;
    --schema-sha256) ARGS[$((i+1))]="$pin2_schema_sha" ;;
  esac
done
# Every pre-existing check and both new relative cross-checks (a)/(b) stay
# green here: finalSchema.sha256==SCHEMA_SHA (the input-snapshot binding,
# both dummy), and files[]'s
# schema.prisma entry is untouched and still equals FINAL_SCHEMA_SHA,
# matching the archive's real, unmodified bytes (check (b) and the per-file
# archive-content loop). Only the absolute SCHEMA_SHA==FINAL_SCHEMA_SHA pin
# catches that the rehearsal would run against a schema the archive does not
# actually ship.
run_expect_fail 'pinned final schema sha256 does not match the reviewed checksum' "${ARGS[@]}"
pass 'PIN-2: rejects a rehearsal --schema/finalSchema.sha256 that diverge from the archive while files[] (and the archive'"'"'s actual bytes) still declare the reviewed schema'


# ============================================================================
# GOLDEN: a full 11-entry Task168 migration contract, backed by a 12-entry
# full migration history (1 pre-Task168 legacy migration + the 10 synthetic
# Task168 migrations + the real reviewed M11), reaches every static check in
# the script -- including the ones after the 11-entries gate that every
# fixture above this point (--migrations-json='[]') never reaches. docker is
# stubbed via PATH so the golden path can be proven to arrive at the first
# real docker call without Docker/DB/network.
# ============================================================================
DOCKER_STUB_DIR="$TMP/docker-stub-bin"
mkdir -p "$DOCKER_STUB_DIR"
DOCKER_STUB_LOG="$TMP/docker-stub.log"
: > "$DOCKER_STUB_LOG"
cat > "$DOCKER_STUB_DIR/docker" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$DOCKER_STUB_LOG"
exit 1
STUB
chmod +x "$DOCKER_STUB_DIR/docker"
export PATH="$DOCKER_STUB_DIR:$PATH"

LEGACY_NAME=20260801000000_legacy_pre_task168
SYNTH_NAMES=()
for n in $(seq -w 1 10); do SYNTH_NAMES+=("202609081300${n}_synth_m${n}"); done
GOLDEN_ALL_NAMES=("$LEGACY_NAME" "${SYNTH_NAMES[@]}" "$M11_NAME")
GOLDEN_TASK_NAMES=("${SYNTH_NAMES[@]}" "$M11_NAME")

# Builds a full 12-entry Task168 golden fixture (1 pre-Task168 legacy
# migration + 10 synthetic Task168 migrations + the real reviewed M11) at
# $1, with a matching 11-entry --migrations-json (legacy excluded).
build_golden_fixture() {
  local dir="$1" prisma="$1/stage/apps/v1_api/prisma"
  mkdir -p "$prisma/migrations"
  cp "$REVIEWED_FINAL_SCHEMA" "$prisma/schema.prisma"
  printf 'provider = "postgresql"\n' > "$prisma/migrations/migration_lock.toml"
  mkdir -p "$prisma/migrations/$LEGACY_NAME"
  printf -- '-- legacy pre-task168\nSELECT 1;\n' > "$prisma/migrations/$LEGACY_NAME/migration.sql"
  for n in "${SYNTH_NAMES[@]}"; do
    mkdir -p "$prisma/migrations/$n"
    printf -- '-- synthetic %s\nSELECT 1;\n' "$n" > "$prisma/migrations/$n/migration.sql"
  done
  mkdir -p "$prisma/migrations/$M11_NAME"
  cp "$REVIEWED_M11_FILE" "$prisma/migrations/$M11_NAME/migration.sql"

  local full='[]'
  for n in "${GOLDEN_ALL_NAMES[@]}"; do
    local sql="$prisma/migrations/$n/migration.sql" h b
    h="$(sha "$sql")"; b="$(wc -c < "$sql" | tr -d ' ')"
    full="$(jq -cn --argjson arr "$full" --arg n "$n" --arg h "$h" '$arr + [{name:$n,sha256:$h}]')"
  done
  printf '%s' "$full" > "$dir/full-migrations.json"
  jq -c --arg legacy "$LEGACY_NAME" '[.[] | select(.name != $legacy)]' "$dir/full-migrations.json" > "$dir/migrations.json"
  echo '[]' > "$dir/resolved-attempts.json"

  local lock="$prisma/migrations/migration_lock.toml" lock_sha lock_bytes schema_sha schema_bytes
  lock_sha="$(sha "$lock")"; lock_bytes="$(wc -c < "$lock" | tr -d ' ')"
  schema_sha="$(sha "$prisma/schema.prisma")"; schema_bytes="$(wc -c < "$prisma/schema.prisma" | tr -d ' ')"
  local files
  files="$(jq -n --arg lockSha "$lock_sha" --argjson lockBytes "$lock_bytes" --arg schemaSha "$schema_sha" --argjson schemaBytes "$schema_bytes" \
    '[{path:"apps/v1_api/prisma/schema.prisma",sha256:$schemaSha,bytes:$schemaBytes,mode:"644"},{path:"apps/v1_api/prisma/migrations/migration_lock.toml",sha256:$lockSha,bytes:$lockBytes,mode:"644"}]')"
  for n in "${GOLDEN_ALL_NAMES[@]}"; do
    local sql="$prisma/migrations/$n/migration.sql" h b
    h="$(sha "$sql")"; b="$(wc -c < "$sql" | tr -d ' ')"
    files="$(jq -c --argjson arr "$files" --arg p "apps/v1_api/prisma/migrations/$n/migration.sql" --arg h "$h" --argjson b "$b" '$arr + [{path:$p,sha256:$h,bytes:$b,mode:"644"}]' <<<null)"
  done
  jq -n \
    --arg commit "$RELEASE_SHA" --arg schemaSha "$schema_sha" \
    --argjson files "$files" --argjson fullHistory "$(cat "$dir/full-migrations.json")" \
    --arg m11Name "$M11_NAME" --arg m11Sha "$(sha "$prisma/migrations/$M11_NAME/migration.sql")" \
    '{schemaVersion:1,kind:"task168StageBFinalInputs",sourceCommit:$commit,
      finalSchema:{path:"apps/v1_api/prisma/schema.prisma",sha256:$schemaSha},
      migrationPolicy:"task168-stageBFinal",files:$files,fullMigrationHistory:$fullHistory,
      m11:{name:$m11Name,sha256:$m11Sha},
      archiveLayout:{root:"repository",pathPrefix:"",mapping:"archive member == files[].path"}}' \
    > "$dir/stage/INPUT-MANIFEST.json"

  write_clean_tar "$dir/stage" "$dir/source.tar.gz" INPUT-MANIFEST.json apps
  local manifest_sha archive_sha archive_bytes
  manifest_sha="$(sha "$dir/stage/INPUT-MANIFEST.json")"
  archive_sha="$(sha "$dir/source.tar.gz")"
  archive_bytes="$(wc -c < "$dir/source.tar.gz" | tr -d ' ')"
  jq -n --arg commit "$RELEASE_SHA" --arg p "$dir/source.tar.gz" --arg h "$archive_sha" --argjson b "$archive_bytes" --arg m "$manifest_sha" \
    '{schemaVersion:1,kind:"task168StageBSourceArchiveAttestation",sourceCommit:$commit,archivePath:$p,archiveSha256:$h,archiveBytes:$b,inputManifestPath:"INPUT-MANIFEST.json",inputManifestSha256:$m,inputSnapshotSha256:$m,archiveLayout:{root:"repository",pathPrefix:"",mapping:"archive member == files[].path"},createdAt:"2026-09-14T00:00:00Z"}' \
    > "$dir/source.tar.gz.attestation.json"
  cp "$dir/stage/INPUT-MANIFEST.json" "$dir/input-snapshot.json"
}

GOLDEN="$TMP/golden"
mkdir -p "$GOLDEN"
build_golden_fixture "$GOLDEN"

common_args_golden() {
  local schema_sha; schema_sha="$(jq -r '.finalSchema.sha256' "$GOLDEN/stage/INPUT-MANIFEST.json")"
  local source_sha; source_sha="$(sha "$GOLDEN/source.tar.gz")"
  local input_sha; input_sha="$(sha "$GOLDEN/input-snapshot.json")"
  ARGS=(
    --backup "$STAGE_A_DIR/backup.gz" --backup-sha256 "$(sha "$STAGE_A_DIR/backup.gz")" --backup-format plain-sql-gzip
    --stage-a-transition-receipt "$STAGE_A_DIR/transition.json" --stage-a-transition-receipt-sha256 "$(sha "$STAGE_A_DIR/transition.json")"
    --stage-a-backup-receipt "$STAGE_A_DIR/backup-receipt.json" --stage-a-backup-receipt-sha256 "$(sha "$STAGE_A_DIR/backup-receipt.json")"
    --stage-a-release-sha "$STAGE_A_RELEASE" --stage-a-schema-sha256 "$STAGE_A_SCHEMA_SHA" --database-identity "$DB_IDENTITY"
    --schema "$GOLDEN/stage/apps/v1_api/prisma/schema.prisma" --schema-sha256 "$schema_sha"
    --migration-root "$GOLDEN/stage/apps/v1_api/prisma/migrations"
    --migrations-json "$GOLDEN/migrations.json" --full-migrations-json "$GOLDEN/full-migrations.json"
    --resolved-migration-attempts-json "$GOLDEN/resolved-attempts.json"
    --source-archive "$GOLDEN/source.tar.gz" --source-sha256 "$source_sha"
    --source-archive-attestation "$GOLDEN/source.tar.gz.attestation.json"
    --input-snapshot "$GOLDEN/input-snapshot.json" --input-snapshot-sha256 "$input_sha"
    --postgres-image postgres@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    --api-image x@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    --api-client-schema-path /x --web-image x@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    --cutover-tool-image x@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    --api-workdir /x --api-prisma-bin /x --tool-workdir /x --tool-prisma-bin /x
    --release-sha "$RELEASE_SHA" --report "$TMP/golden-report-$RANDOM.json" --receipt "$TMP/golden-receipt-$RANDOM.json"
  )
}

# ---- GOLDEN. the full 11-entry contract clears every static check (through
#              the migration-root/full-history directory match) and reaches
#              the first real docker call -----------------------------------
common_args_golden
run_expect_fail 'pinned PostgreSQL image is unavailable locally' "${ARGS[@]}"
grep -q 'image inspect' "$DOCKER_STUB_LOG" || fail 'docker stub was not invoked -- golden fixture did not reach the docker image checks'
pass 'GOLDEN: a full 11-entry Task168 contract + matching 12-entry full history clears every static check and reaches the stubbed docker image-inspect call'

# ---- GOLDEN-NONASCII. the golden archive plus a non-ASCII (Korean) name and
#      a name containing a backslash, both outside apps/v1_api/prisma/, still
#      clear every static check -- these are exactly the two byte shapes an
#      external `tar -t` listing would reformat (NFD, octal-escaped, doubled
#      backslash), which the raw header walk above never runs -------------
NONASCII_DIR="$TMP/golden-nonascii"
mkdir -p "$NONASCII_DIR/stage/docs"
cp -R "$GOLDEN/stage/apps" "$NONASCII_DIR/stage/apps"
cp "$GOLDEN/stage/INPUT-MANIFEST.json" "$NONASCII_DIR/stage/INPUT-MANIFEST.json"
printf 'hi\n' > "$NONASCII_DIR/stage/docs/한글.md"
printf 'hi\n' > "$NONASCII_DIR/stage/docs/a b\\c.md"
write_clean_tar "$NONASCII_DIR/stage" "$NONASCII_DIR/source.tar.gz" INPUT-MANIFEST.json apps docs
nonascii_sha="$(sha "$NONASCII_DIR/source.tar.gz")"
nonascii_bytes="$(wc -c < "$NONASCII_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$nonascii_sha" --argjson b "$nonascii_bytes" '.archiveSha256=$h | .archiveBytes=$b' \
  "$GOLDEN/source.tar.gz.attestation.json" > "$NONASCII_DIR/source.tar.gz.attestation.json"
common_args_golden
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$NONASCII_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$nonascii_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$NONASCII_DIR/source.tar.gz.attestation.json" ;;
  esac
done
run_expect_fail 'pinned PostgreSQL image is unavailable locally' "${ARGS[@]}"
grep -q 'image inspect' "$DOCKER_STUB_LOG" || fail 'docker stub was not invoked -- the non-ASCII/backslash golden fixture did not reach the docker image checks'
pass 'GOLDEN-NONASCII: a golden archive carrying a non-ASCII name and a backslash-containing name outside apps/v1_api/prisma/ still clears every static check'

# ---- REALPKG. an archive built by the real package-task168-final-source.sh
#      (via the real prepare-task168-final-stage-inputs.sh), not by this
#      suite's own write_clean_tar/collect_members, still clears the
#      walker's canonical-form and prisma-inventory checks and reaches the
#      same stubbed docker image-inspect call as GOLDEN. The synthetic
#      source commit carries a Korean-named file, a >100-byte-path file, and
#      a 755 file outside apps/v1_api/prisma/, so this also proves the real
#      packager's own pax/mode encoding round-trips through the preflight,
#      not only through write_clean_tar's -----------------------------------
REALPKG_DIR="$TMP/real-package"
REALPKG_REPO="$REALPKG_DIR/repo"
mkdir -p "$REALPKG_REPO"
git -C "$REALPKG_REPO" init -q -b main
git -C "$REALPKG_REPO" config user.email test@example.com
git -C "$REALPKG_REPO" config user.name test
git -C "$REALPKG_REPO" config commit.gpgsign false
git -C "$REALPKG_REPO" config tag.gpgsign false
(
  export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com GIT_AUTHOR_DATE='2026-01-01T00:00:00+00:00'
  export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com GIT_COMMITTER_DATE='2026-01-01T00:00:00+00:00'
  # prepare-task168-final-stage-inputs.sh hardcodes these exact 10 names and
  # requires each to already be a directory in the pinned commit -- M11
  # itself is never committed here (prepare/package both materialize it
  # fresh from --m11, mirroring that the real repository does not carry it
  # yet either).
  REALPKG_MIGRATIONS=(
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
  mkdir -p "$REALPKG_REPO/apps/v1_api/prisma/migrations/$LEGACY_NAME"
  printf 'provider = "postgresql"\n' > "$REALPKG_REPO/apps/v1_api/prisma/migrations/migration_lock.toml"
  printf -- '-- legacy pre-task168\nSELECT 1;\n' > "$REALPKG_REPO/apps/v1_api/prisma/migrations/$LEGACY_NAME/migration.sql"
  for m in "${REALPKG_MIGRATIONS[@]}"; do
    mkdir -p "$REALPKG_REPO/apps/v1_api/prisma/migrations/$m"
    printf -- '-- synthetic migration %s\nSELECT 1;\n' "$m" > "$REALPKG_REPO/apps/v1_api/prisma/migrations/$m/migration.sql"
  done
  cp "$REVIEWED_FINAL_SCHEMA" "$REALPKG_REPO/apps/v1_api/prisma/schema.prisma"
  mkdir -p "$REALPKG_REPO/docs"
  printf '# korean-named fixture doc\n' > "$REALPKG_REPO/docs/한글이름-파일.md"
  REALPKG_LONG_NAME="$(printf 'a%.0s' $(seq 1 100)).md"
  printf '#!/bin/sh\necho long-path fixture\n' > "$REALPKG_REPO/docs/$REALPKG_LONG_NAME"
  chmod 755 "$REALPKG_REPO/docs/$REALPKG_LONG_NAME"
  printf '# real-packager preflight fixture\n' > "$REALPKG_REPO/README.md"
  git -C "$REALPKG_REPO" add -A
  git -C "$REALPKG_REPO" commit -q -m 'real packager preflight fixture'
)
REALPKG_COMMIT="$(git -C "$REALPKG_REPO" rev-parse HEAD)"
"$RELEASE_DIR/prepare-task168-final-stage-inputs.sh" --source-dir "$REALPKG_REPO" --source-commit "$REALPKG_COMMIT" \
  --final-schema "$REVIEWED_FINAL_SCHEMA" --m11 "$REVIEWED_M11_FILE" --output-dir "$REALPKG_DIR/prepared" >/dev/null \
  || fail 'REALPKG: preparer run against the synthetic fixture should succeed'
"$RELEASE_DIR/package-task168-final-source.sh" --source-dir "$REALPKG_REPO" --source-commit "$REALPKG_COMMIT" \
  --prepared-dir "$REALPKG_DIR/prepared" --final-schema "$REVIEWED_FINAL_SCHEMA" --m11 "$REVIEWED_M11_FILE" \
  --output-archive "$REALPKG_DIR/source.tar.gz" >/dev/null \
  || fail 'REALPKG: real packager run against the synthetic fixture should succeed'
# The archive-embedded INPUT-MANIFEST.json is exactly this transform of the
# prepared manifest (package-task168-final-source.sh's own archive_manifest
# step) -- reproducing it here is how a caller obtains --input-snapshot.
jq '. + {archiveLayout:{root:"repository",pathPrefix:"",mapping:"archive member == files[].path"}}' \
  "$REALPKG_DIR/prepared/INPUT-MANIFEST.json" > "$REALPKG_DIR/input-snapshot.json"
jq -c --arg legacy "$LEGACY_NAME" '[.fullMigrationHistory[] | select(.name != $legacy)]' \
  "$REALPKG_DIR/prepared/INPUT-MANIFEST.json" > "$REALPKG_DIR/migrations.json"
jq -c '.fullMigrationHistory' "$REALPKG_DIR/prepared/INPUT-MANIFEST.json" > "$REALPKG_DIR/full-migrations.json"
echo '[]' > "$REALPKG_DIR/resolved-attempts.json"
common_args
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --schema) ARGS[$((i+1))]="$REALPKG_DIR/prepared/apps/v1_api/prisma/schema.prisma" ;;
    --schema-sha256) ARGS[$((i+1))]="$(sha "$REVIEWED_FINAL_SCHEMA")" ;;
    --migration-root) ARGS[$((i+1))]="$REALPKG_DIR/prepared/apps/v1_api/prisma/migrations" ;;
    --migrations-json) ARGS[$((i+1))]="$REALPKG_DIR/migrations.json" ;;
    --full-migrations-json) ARGS[$((i+1))]="$REALPKG_DIR/full-migrations.json" ;;
    --resolved-migration-attempts-json) ARGS[$((i+1))]="$REALPKG_DIR/resolved-attempts.json" ;;
    --source-archive) ARGS[$((i+1))]="$REALPKG_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$(sha "$REALPKG_DIR/source.tar.gz")" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$REALPKG_DIR/source.tar.gz.attestation.json" ;;
    --input-snapshot) ARGS[$((i+1))]="$REALPKG_DIR/input-snapshot.json" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$(sha "$REALPKG_DIR/input-snapshot.json")" ;;
    --release-sha) ARGS[$((i+1))]="$REALPKG_COMMIT" ;;
  esac
done
run_expect_fail 'pinned PostgreSQL image is unavailable locally' "${ARGS[@]}"
grep -q 'image inspect' "$DOCKER_STUB_LOG" || fail 'REALPKG: docker stub was not invoked -- the real packager archive did not reach the docker image checks'
pass 'REALPKG: a real package-task168-final-source.sh archive (Korean name, >100-byte path, 755 file) clears the walker and reaches the stubbed docker image-inspect call'

# ---- F13. snapshot .m11.sha256 disagrees with the reviewed M11_SHA pin,
#           while fullMigrationHistory/files[]/archive/migration-root/
#           --migrations-json all still agree with each other and with the
#           real (untampered) M11 bytes ------------------------------------
F13_DIR="$TMP/f13-snapshot-m11-pin"
mkdir -p "$F13_DIR/stage"
cp -R "$GOLDEN/stage/apps" "$F13_DIR/stage/apps"
jq '.m11.sha256 = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"' \
  "$GOLDEN/stage/INPUT-MANIFEST.json" > "$F13_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$F13_DIR/stage" "$F13_DIR/source.tar.gz" INPUT-MANIFEST.json apps
f13_manifest_sha="$(sha "$F13_DIR/stage/INPUT-MANIFEST.json")"
f13_archive_sha="$(sha "$F13_DIR/source.tar.gz")"
f13_archive_bytes="$(wc -c < "$F13_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$f13_archive_sha" --argjson b "$f13_archive_bytes" --arg m "$f13_manifest_sha" \
  '.archiveSha256=$h | .archiveBytes=$b | .inputManifestSha256=$m | .inputSnapshotSha256=$m' \
  "$GOLDEN/source.tar.gz.attestation.json" > "$F13_DIR/source.tar.gz.attestation.json"
common_args_golden
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$F13_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$f13_archive_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$F13_DIR/source.tar.gz.attestation.json" ;;
    --input-snapshot) ARGS[$((i+1))]="$F13_DIR/stage/INPUT-MANIFEST.json" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$f13_manifest_sha" ;;
  esac
done
run_expect_fail 'input snapshot does not authenticate the prepared Stage B source/archive contract' "${ARGS[@]}"
pass 'F13: rejects a snapshot .m11.sha256 that disagrees with the reviewed M11 pin while fullMigrationHistory/files[]/archive/migration-root/migrations-json all agree with the real bytes'

# ---- F20. --full-migrations-json disagrees with the snapshot's embedded
#           fullMigrationHistory, while the snapshot itself stays internally
#           self-consistent (files[] still matches its own fullMigrationHistory,
#           and .m11 still matches the reviewed pin) -----------------------
F20_BAD_HISTORY="$TMP/f20-bad-history.json"
jq '.[1].sha256 = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"' \
  "$GOLDEN/full-migrations.json" > "$F20_BAD_HISTORY"
common_args_golden
for i in "${!ARGS[@]}"; do
  if [[ "${ARGS[$i]}" == "--full-migrations-json" ]]; then ARGS[$((i+1))]="$F20_BAD_HISTORY"; fi
done
run_expect_fail 'input snapshot does not authenticate the prepared Stage B source/archive contract' "${ARGS[@]}"
pass 'F20: rejects a --full-migrations-json that disagrees with the snapshot-embedded fullMigrationHistory even though the snapshot itself is internally self-consistent'

# ---- F21. a non-M11 --migrations-json entry's hash disagrees with
#           --full-migrations-json, while the archive/files[]/snapshot/
#           --migration-root/M11 pin all still agree with each other and
#           with the real bytes -- isolates the per-entry
#           Task168-contract-in-full-history loop from the M11-only pin
#           check (F12) and the snapshot-vs-caller-history check (F20) -----
F21_MIGRATIONS="$TMP/f21-migrations.json"
jq '(.[0].sha256) = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"' \
  "$GOLDEN/migrations.json" > "$F21_MIGRATIONS"
common_args_golden
for i in "${!ARGS[@]}"; do
  if [[ "${ARGS[$i]}" == "--migrations-json" ]]; then ARGS[$((i+1))]="$F21_MIGRATIONS"; fi
done
run_expect_fail 'Task 168 migration missing or hash-different in full history' "${ARGS[@]}"
pass 'F21: rejects a --migrations-json entry (not M11) whose hash disagrees with --full-migrations-json even though every other input still agrees'

# ---- F14. the Task168 contract (--migrations-json) still has all 11
#           correct entries, only reordered so M11 is not last ------------
F14_MIGRATIONS="$TMP/f14-migrations.json"
jq -c '[.[-1]] + .[0:-1]' "$GOLDEN/migrations.json" > "$F14_MIGRATIONS"
common_args_golden
for i in "${!ARGS[@]}"; do
  if [[ "${ARGS[$i]}" == "--migrations-json" ]]; then ARGS[$((i+1))]="$F14_MIGRATIONS"; fi
done
run_expect_fail 'M11 must be the final migration entry' "${ARGS[@]}"
pass 'F14: rejects a Task168 contract carrying the correct 11 entries reordered so M11 is not last'

# ---- F15. --full-migrations-json and the snapshot-embedded fullMigrationHistory
#           are reordered together (so the files[]-vs-fullMigrationHistory
#           cross-check still passes) so M11 is not the last entry of either --
F15_DIR="$TMP/f15-full-history-order"
mkdir -p "$F15_DIR/stage"
cp -R "$GOLDEN/stage/apps" "$F15_DIR/stage/apps"
jq -c '[.[-1]] + .[0:-1]' "$GOLDEN/full-migrations.json" > "$F15_DIR/full-migrations.json"
jq --slurpfile h "$F15_DIR/full-migrations.json" '.fullMigrationHistory = $h[0]' \
  "$GOLDEN/stage/INPUT-MANIFEST.json" > "$F15_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$F15_DIR/stage" "$F15_DIR/source.tar.gz" INPUT-MANIFEST.json apps
f15_manifest_sha="$(sha "$F15_DIR/stage/INPUT-MANIFEST.json")"
f15_archive_sha="$(sha "$F15_DIR/source.tar.gz")"
f15_archive_bytes="$(wc -c < "$F15_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$f15_archive_sha" --argjson b "$f15_archive_bytes" --arg m "$f15_manifest_sha" \
  '.archiveSha256=$h | .archiveBytes=$b | .inputManifestSha256=$m | .inputSnapshotSha256=$m' \
  "$GOLDEN/source.tar.gz.attestation.json" > "$F15_DIR/source.tar.gz.attestation.json"
common_args_golden
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$F15_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$f15_archive_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$F15_DIR/source.tar.gz.attestation.json" ;;
    --input-snapshot) ARGS[$((i+1))]="$F15_DIR/stage/INPUT-MANIFEST.json" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$f15_manifest_sha" ;;
    --full-migrations-json) ARGS[$((i+1))]="$F15_DIR/full-migrations.json" ;;
  esac
done
run_expect_fail 'full migration history must end at M11' "${ARGS[@]}"
pass 'F15: rejects a --full-migrations-json (and matching snapshot fullMigrationHistory) carrying the correct 12 entries reordered so M11 is not last'

# ---- F16. the archive's legacy-migration content, files[] and
#           fullMigrationHistory (and therefore --full-migrations-json,
#           rebuilt to match so files[]-vs-fullMigrationHistory stays green)
#           are all consistently tampered together; only --migration-root
#           (left as the golden, untampered directory) disagrees with the
#           new hash -- the legacy entry is not part of the Task168 subset,
#           so the --migrations-json-vs-full-history loop (which only
#           cross-checks the 11 Task168 names) never catches it first
F16_DIR="$TMP/f16-legacy-checksum"
mkdir -p "$F16_DIR/stage"
cp -R "$GOLDEN/stage/apps" "$F16_DIR/stage/apps"
printf -- '-- legacy pre-task168 (tampered)\nSELECT 2;\n' > "$F16_DIR/stage/apps/v1_api/prisma/migrations/$LEGACY_NAME/migration.sql"
f16_legacy_sha="$(sha "$F16_DIR/stage/apps/v1_api/prisma/migrations/$LEGACY_NAME/migration.sql")"
f16_legacy_bytes="$(wc -c < "$F16_DIR/stage/apps/v1_api/prisma/migrations/$LEGACY_NAME/migration.sql" | tr -d ' ')"
jq --arg p "apps/v1_api/prisma/migrations/$LEGACY_NAME/migration.sql" --arg h "$f16_legacy_sha" --argjson b "$f16_legacy_bytes" --arg legacy "$LEGACY_NAME" \
  '.files |= map(if .path == $p then .sha256 = $h | .bytes = $b else . end) | .fullMigrationHistory |= map(if .name == $legacy then .sha256 = $h else . end)' \
  "$GOLDEN/stage/INPUT-MANIFEST.json" > "$F16_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$F16_DIR/stage" "$F16_DIR/source.tar.gz" INPUT-MANIFEST.json apps
f16_manifest_sha="$(sha "$F16_DIR/stage/INPUT-MANIFEST.json")"
f16_archive_sha="$(sha "$F16_DIR/source.tar.gz")"
f16_archive_bytes="$(wc -c < "$F16_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$f16_archive_sha" --argjson b "$f16_archive_bytes" --arg m "$f16_manifest_sha" \
  '.archiveSha256=$h | .archiveBytes=$b | .inputManifestSha256=$m | .inputSnapshotSha256=$m' \
  "$GOLDEN/source.tar.gz.attestation.json" > "$F16_DIR/source.tar.gz.attestation.json"
F16_FULL="$TMP/f16-full-migrations.json"
jq '.fullMigrationHistory' "$F16_DIR/stage/INPUT-MANIFEST.json" > "$F16_FULL"
common_args_golden
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$F16_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$f16_archive_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$F16_DIR/source.tar.gz.attestation.json" ;;
    --input-snapshot) ARGS[$((i+1))]="$F16_DIR/stage/INPUT-MANIFEST.json" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$f16_manifest_sha" ;;
    --full-migrations-json) ARGS[$((i+1))]="$F16_FULL" ;;
  esac
done
run_expect_fail 'full-history migration checksum mismatch' "${ARGS[@]}"
pass 'F16: rejects a --full-migrations-json (matching archive/files[]/snapshot) legacy-migration hash that disagrees with the real --migration-root file'

# ---- F17. an extra, unlisted migration directory sits in --migration-root
#           alongside every directory --full-migrations-json actually lists
#           -----------------------------------------------------------------
F17_ROOT="$TMP/f17-migration-root"
cp -R "$GOLDEN/stage/apps/v1_api/prisma/migrations" "$F17_ROOT"
mkdir -p "$F17_ROOT/20260801000001_stray_dir"
printf -- '-- stray\nSELECT 1;\n' > "$F17_ROOT/20260801000001_stray_dir/migration.sql"
common_args_golden
for i in "${!ARGS[@]}"; do
  if [[ "${ARGS[$i]}" == "--migration-root" ]]; then ARGS[$((i+1))]="$F17_ROOT"; fi
done
run_expect_fail 'migration-root directories or order differ from authenticated full history' "${ARGS[@]}"
pass 'F17: rejects a --migration-root that carries a stray directory not present in --full-migrations-json'

# ---- F12. the Task168 contract's (--migrations-json) M11 hash, the actual
#           on-disk M11 bytes, files[], the archive, and --full-migrations-
#           json are all consistently tampered together; only the snapshot's
#           .m11.sha256 (left at the real, reviewed value) and the hardcoded
#           M11_SHA pin in the script disagree with them ------------------
F12_DIR="$TMP/f12-m11-pin"
mkdir -p "$F12_DIR/stage"
cp -R "$GOLDEN/stage/apps" "$F12_DIR/stage/apps"
printf -- 'DROP SCHEMA public CASCADE;\n' > "$F12_DIR/stage/apps/v1_api/prisma/migrations/$M11_NAME/migration.sql"
f12_m11_sha="$(sha "$F12_DIR/stage/apps/v1_api/prisma/migrations/$M11_NAME/migration.sql")"
f12_m11_bytes="$(wc -c < "$F12_DIR/stage/apps/v1_api/prisma/migrations/$M11_NAME/migration.sql" | tr -d ' ')"
jq --arg p "apps/v1_api/prisma/migrations/$M11_NAME/migration.sql" --arg h "$f12_m11_sha" --argjson b "$f12_m11_bytes" \
  '.files |= map(if .path == $p then .sha256 = $h | .bytes = $b else . end) | .fullMigrationHistory |= map(if .name == "'"$M11_NAME"'" then .sha256 = $h else . end)' \
  "$GOLDEN/stage/INPUT-MANIFEST.json" > "$F12_DIR/stage/INPUT-MANIFEST.json"
write_clean_tar "$F12_DIR/stage" "$F12_DIR/source.tar.gz" INPUT-MANIFEST.json apps
f12_manifest_sha="$(sha "$F12_DIR/stage/INPUT-MANIFEST.json")"
f12_archive_sha="$(sha "$F12_DIR/source.tar.gz")"
f12_archive_bytes="$(wc -c < "$F12_DIR/source.tar.gz" | tr -d ' ')"
jq --arg h "$f12_archive_sha" --argjson b "$f12_archive_bytes" --arg m "$f12_manifest_sha" \
  '.archiveSha256=$h | .archiveBytes=$b | .inputManifestSha256=$m | .inputSnapshotSha256=$m' \
  "$GOLDEN/source.tar.gz.attestation.json" > "$F12_DIR/source.tar.gz.attestation.json"
cp "$F12_DIR/stage/INPUT-MANIFEST.json" "$F12_DIR/input-snapshot.json"
F12_MIGRATIONS="$TMP/f12-migrations.json"
jq --arg h "$f12_m11_sha" '(.[-1].sha256) = $h' "$GOLDEN/migrations.json" > "$F12_MIGRATIONS"
F12_FULL="$TMP/f12-full-migrations.json"
jq --arg h "$f12_m11_sha" '(.[-1].sha256) = $h' "$GOLDEN/full-migrations.json" > "$F12_FULL"
F12_ROOT="$TMP/f12-migration-root"
cp -R "$GOLDEN/stage/apps/v1_api/prisma/migrations" "$F12_ROOT"
cp "$F12_DIR/stage/apps/v1_api/prisma/migrations/$M11_NAME/migration.sql" "$F12_ROOT/$M11_NAME/migration.sql"
common_args_golden
for i in "${!ARGS[@]}"; do
  case "${ARGS[$i]}" in
    --source-archive) ARGS[$((i+1))]="$F12_DIR/source.tar.gz" ;;
    --source-sha256) ARGS[$((i+1))]="$f12_archive_sha" ;;
    --source-archive-attestation) ARGS[$((i+1))]="$F12_DIR/source.tar.gz.attestation.json" ;;
    --input-snapshot) ARGS[$((i+1))]="$F12_DIR/input-snapshot.json" ;;
    --input-snapshot-sha256) ARGS[$((i+1))]="$f12_manifest_sha" ;;
    --migrations-json) ARGS[$((i+1))]="$F12_MIGRATIONS" ;;
    --full-migrations-json) ARGS[$((i+1))]="$F12_FULL" ;;
    --migration-root) ARGS[$((i+1))]="$F12_ROOT" ;;
  esac
done
run_expect_fail 'M11 migration hash in the Task 168 contract does not match the reviewed checksum' "${ARGS[@]}"
pass 'F12: rejects a Task168 contract whose M11 hash (and every consistently-tampered consumer of it) diverges from the reviewed M11_SHA pin'

echo 'ALL PREFLIGHT SIDECAR CONTRACT TESTS PASSED'
