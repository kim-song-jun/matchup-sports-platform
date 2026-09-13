#!/usr/bin/env bash
set -Eeuo pipefail

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
#   prisma member-set == files[] inventory equality             -> red on (7)
#   unsafe-path (../) member rejection                          -> red on (8)
#   per-file archive-content-vs-snapshot sha/bytes check (:144-148) -> red on (9)

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
  printf 'generator client {\n  provider = "prisma-client-js"\n}\n' > "$dir/stage/apps/v1_api/prisma/schema.prisma"
  printf 'provider = "postgresql"\n' > "$dir/stage/apps/v1_api/prisma/migrations/migration_lock.toml"
  printf -- '-- m1\nSELECT 1;\n' > "$dir/stage/apps/v1_api/prisma/migrations/$M1_NAME/migration.sql"
  printf -- '-- m11\nSELECT 1;\n' > "$dir/stage/apps/v1_api/prisma/migrations/$M11_NAME/migration.sql"

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
run_expect_fail 'source archive contains a symlink member' "${ARGS[@]}"
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
run_expect_fail 'archive prisma-overlay member set does not exactly match the authenticated files inventory' "${ARGS[@]}"
pass 'rejects an archive that carries an unlisted extra migration.sql not present in the authenticated inventory'

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

echo 'ALL PREFLIGHT SIDECAR CONTRACT TESTS PASSED'
