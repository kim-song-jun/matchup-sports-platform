#!/usr/bin/env bash
set -Eeuo pipefail

# macOS bsdtar embeds AppleDouble ("._*") resource-fork sidecar members
# in every directory it archives unless this is set; bsdtar's own `-t`
# listing hides them again on read, but the new member-set check in
# task168-final-image-preflight.sh parses the raw archive with Python's
# tarfile module and correctly sees them, so left unset every fixture
# built below would trip 'unauthenticated member' on macOS only.
export COPYFILE_DISABLE=1

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
#   per-file archive-content-vs-snapshot sha/bytes check (:144-148) -> red on (9)
#   pinned FINAL_SCHEMA_SHA/M11_SHA/M11_NAME_PIN constants       -> red on golden path (1), since the
#                                                                    fixture uses the real reviewed bytes
#   files[] finalSchema entry == pinned schema sha (:182-184)    -> red on (G4)
#   files[] migration entries == fullMigrationHistory (:185-190) -> red on (G1), (G2)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
PREFLIGHT="$REPO_ROOT/scripts/release/task168-final-image-preflight.sh"
[[ -x "$PREFLIGHT" ]] || { echo "FAIL: missing $PREFLIGHT" >&2; exit 1; }

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

  ( cd "$dir/stage" && tar -czf "$dir/source.tar.gz" INPUT-MANIFEST.json apps )
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
( cd "$TAMPERED_ARCHIVE_DIR/stage" && tar -czf "$TAMPERED_ARCHIVE_DIR/source.tar.gz" INPUT-MANIFEST.json apps )
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
( cd "$BUNDLE_DIR/stage" && tar -czf "$BUNDLE_DIR/source.tar.gz" INPUT-MANIFEST.json bundle )
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
# Plain (non -h) tar stores a symlink as a symlink member rather than
# dereferencing it.
( cd "$SYMLINK_DIR/stage" && tar -czf "$SYMLINK_DIR/source.tar.gz" INPUT-MANIFEST.json apps )
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
run_expect_fail 'source archive contains a symlink or hardlink member' "${ARGS[@]}"
pass 'rejects an archive that carries a symlink member'

# ---- 7. prisma member set differs from the authenticated inventory -------
EXTRA_DIR="$TMP/extra-member"
mkdir -p "$EXTRA_DIR/stage"
cp -R "$FIXTURE/stage/apps" "$EXTRA_DIR/stage/"
mkdir -p "$EXTRA_DIR/stage/apps/v1_api/prisma/migrations/20260912000000_extra"
printf -- '-- extra\nSELECT 1;\n' > "$EXTRA_DIR/stage/apps/v1_api/prisma/migrations/20260912000000_extra/migration.sql"
cp "$FIXTURE/stage/INPUT-MANIFEST.json" "$EXTRA_DIR/stage/INPUT-MANIFEST.json"
( cd "$EXTRA_DIR/stage" && tar -czf "$EXTRA_DIR/source.tar.gz" INPUT-MANIFEST.json apps )
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
( cd "$NONCONFORMING_DIR/stage" && tar -czf "$NONCONFORMING_DIR/source.tar.gz" INPUT-MANIFEST.json apps )
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
( cd "$EXTRA_IN_DECLARED_DIR/stage" && tar -czf "$EXTRA_IN_DECLARED_DIR/source.tar.gz" INPUT-MANIFEST.json apps )
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

# ---- 8. a ../ traversal member is rejected ---------------------------------
# A plain `tar -c` refuses to create a member spelled with a leading `../`, so
# this uses Python's tarfile module directly (as the preparer/packager do) to
# inject the unsafe member the same way a hand-crafted malicious archive would.
TRAVERSAL_DIR="$TMP/traversal"
mkdir -p "$TRAVERSAL_DIR"
python3 - "$FIXTURE/stage" "$TRAVERSAL_DIR/source.tar.gz" <<'PY'
import io, os, sys, tarfile
stage, out = sys.argv[1], sys.argv[2]
with tarfile.open(out, 'w:gz') as tar:
    tar.add(os.path.join(stage, 'INPUT-MANIFEST.json'), arcname='INPUT-MANIFEST.json')
    tar.add(os.path.join(stage, 'apps'), arcname='apps')
    data = b'evil\n'
    info = tarfile.TarInfo(name='../evil.txt')
    info.size = len(data)
    tar.addfile(info, io.BytesIO(data))
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
( cd "$CONTENT_TAMPER_DIR/stage" && tar -czf "$CONTENT_TAMPER_DIR/source.tar.gz" INPUT-MANIFEST.json apps )
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
  python3 - "$NONCANON_DIR/stage" "$NONCANON_DIR/source.tar.gz" "$evil_name" <<'PY'
import io, os, sys, tarfile
stage, out, evil_name = sys.argv[1], sys.argv[2], sys.argv[3]
with tarfile.open(out, 'w:gz') as tar:
    tar.add(os.path.join(stage, 'INPUT-MANIFEST.json'), arcname='INPUT-MANIFEST.json')
    tar.add(os.path.join(stage, 'apps'), arcname='apps')
    data = b'-- evil\nSELECT 1;\n'
    info = tarfile.TarInfo(name=evil_name)
    info.size = len(data)
    tar.addfile(info, io.BytesIO(data))
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
python3 - "$FIXTURE/stage" "$SPACE_TRAVERSAL_DIR/source.tar.gz" <<'PY'
import io, os, sys, tarfile
stage, out = sys.argv[1], sys.argv[2]
with tarfile.open(out, 'w:gz') as tar:
    tar.add(os.path.join(stage, 'INPUT-MANIFEST.json'), arcname='INPUT-MANIFEST.json')
    tar.add(os.path.join(stage, 'apps'), arcname='apps')
    data = b'evil\n'
    info = tarfile.TarInfo(name='../evil with space.txt')
    info.size = len(data)
    tar.addfile(info, io.BytesIO(data))
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
( cd "$WRONG_EMBEDDED_COMMIT_DIR/stage" && tar -czf "$WRONG_EMBEDDED_COMMIT_DIR/source.tar.gz" INPUT-MANIFEST.json apps )
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
( cd "$NONEMPTY_PREFIX_DIR/stage" && tar -czf "$NONEMPTY_PREFIX_DIR/source.tar.gz" INPUT-MANIFEST.json apps )
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

# ---- G1/G2/G4 (independent adversarial review, T3 consumer binding) -------
# The checks exercised through (9) prove files[] is self-consistent with the
# archive's own bytes. They never compare that inventory against
# fullMigrationHistory/finalSchema -- the fields --migration-root and
# --schema (the actual rehearsal inputs, verified elsewhere in the script)
# are pinned to. These three probes tamper only the archive + its files[]
# entries (rehashed to match each other, so archive-vs-files[] alone stays
# green) while leaving fullMigrationHistory, finalSchema.sha256,
# --migration-root and --schema exactly as the good fixture built them --
# reproducing the reviewer's G1/G2/G4 bypass shapes verbatim.

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
( cd "$G1_DIR/stage" && tar -czf "$G1_DIR/source.tar.gz" INPUT-MANIFEST.json apps )
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
( cd "$G2_DIR/stage" && tar -czf "$G2_DIR/source.tar.gz" INPUT-MANIFEST.json apps )
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
( cd "$G4_DIR/stage" && tar -czf "$G4_DIR/source.tar.gz" INPUT-MANIFEST.json apps )
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

echo 'ALL PREFLIGHT SIDECAR CONTRACT TESTS PASSED'
