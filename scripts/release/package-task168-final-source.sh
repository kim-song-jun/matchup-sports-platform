#!/usr/bin/env bash
set -Eeuo pipefail

# StageB-only source archive packager. Consumes the directory produced by
# prepare-task168-final-stage-inputs.sh and the pinned repository commit, and
# emits one deterministic gzip archive plus an external attestation sidecar.
# It never selects an image, database, or deployment target.
usage() {
  echo "usage: $0 --source-dir D --source-commit SHA --prepared-dir D --final-schema F --m11 F --output-archive F" >&2
  exit 64
}

SOURCE_DIR= SOURCE_COMMIT= PREPARED_DIR= FINAL_SCHEMA= M11_FILE= OUTPUT_ARCHIVE=
while (($#)); do
  case "$1" in
    --source-dir) SOURCE_DIR=${2:-}; shift 2;;
    --source-commit) SOURCE_COMMIT=${2:-}; shift 2;;
    --prepared-dir) PREPARED_DIR=${2:-}; shift 2;;
    --final-schema) FINAL_SCHEMA=${2:-}; shift 2;;
    --m11) M11_FILE=${2:-}; shift 2;;
    --output-archive) OUTPUT_ARCHIVE=${2:-}; shift 2;;
    *) usage;;
  esac
done

# Reviewed, pinned identities. These are the promotion contract: nobody can
# swap in a different final schema or M11 migration by editing only the
# self-reported INPUT-MANIFEST.json (BLOCK-3).
readonly FINAL_SCHEMA_SHA=e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46
readonly M11_SHA=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
readonly M11_NAME=20260911090000_retire_tournament_fixture_tables
# Files legitimately present under apps/v1_api/prisma/ that are not part of
# the reviewed migration/schema overlay (seed scripts, seed data fixtures,
# and the StageA reference copy of schema.prisma).
readonly PRISMA_EXTRA_ALLOW_REGEX='^apps/v1_api/prisma/([^/]+\.ts|data/[^/]+\.json|schema\.stage-a\.prisma)$'

[[ -d "$SOURCE_DIR" && -d "$PREPARED_DIR" && -f "$FINAL_SCHEMA" && -f "$M11_FILE" && -n "$OUTPUT_ARCHIVE" ]] || usage
[[ "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo 'source commit must be one pinned 40-hex commit' >&2; exit 1; }
OUTPUT_ATTESTATION="${OUTPUT_ARCHIVE}.attestation.json"

fail() { echo "[task168-source-package] $*" >&2; exit 1; }
sha() { sha256sum "$1" | awk '{print $1}'; }
bytes() { wc -c < "$1" | tr -d ' '; }
# Git only ever stores regular files as mode 100644 or 100755. Deriving mode
# from the executable bit (instead of raw `stat`) makes every member's mode
# in the archive independent of the extracting umask and of macOS/Linux
# `stat` format differences (BLOCK-1, missed-defect mode-format skew).
git_mode() { [[ -x "$1" ]] && printf '755' || printf '644'; }

[[ ! -e "$OUTPUT_ARCHIVE" && ! -e "$OUTPUT_ATTESTATION" ]] || fail 'refusing to overwrite an existing output'
git -C "$SOURCE_DIR" cat-file -e "$SOURCE_COMMIT^{commit}" 2>/dev/null || fail 'pinned source commit is not present'
[[ -s "$PREPARED_DIR/INPUT-MANIFEST.json" ]] || fail 'prepared INPUT-MANIFEST.json is missing'
[[ "$(sha "$FINAL_SCHEMA")" == "$FINAL_SCHEMA_SHA" ]] || fail 'supplied final schema does not match the reviewed checksum'
[[ "$(sha "$M11_FILE")" == "$M11_SHA" ]] || fail 'supplied M11 migration does not match the reviewed checksum'

manifest="$PREPARED_DIR/INPUT-MANIFEST.json"
jq -e --arg commit "$SOURCE_COMMIT" --arg schemaSha "$FINAL_SCHEMA_SHA" --arg m11Name "$M11_NAME" --arg m11Sha "$M11_SHA" '
  .schemaVersion == 1 and .kind == "task168StageBFinalInputs" and .sourceCommit == $commit and
  .migrationPolicy == "task168-stageBFinal" and (.finalSchema.path == "apps/v1_api/prisma/schema.prisma") and
  (.finalSchema.sha256 == $schemaSha) and (.m11.name == $m11Name) and (.m11.sha256 == $m11Sha) and
  (.files | type == "array" and length > 0 and (map(.path) | group_by(.) | all(length == 1)) and
    all(.[]; (.path | strings | startswith("apps/v1_api/prisma/")) and
      (.path | strings | test("^apps/v1_api/prisma/(schema\\.prisma|migrations/migration_lock\\.toml|migrations/[0-9]{14}_[a-z0-9_]+/migration\\.sql)$")) and
      (.sha256 | strings | test("^[0-9a-f]{64}$")) and (.bytes | numbers and . >= 0) and
      (.mode | strings | test("^(644|755)$")))) and
  (.fullMigrationHistory | type == "array" and length > 11 and
    (.[-1].name == $m11Name) and (.[-1].sha256 == $m11Sha) and
    (map(.name) | group_by(.) | all(length == 1)))
' "$manifest" >/dev/null || fail 'prepared manifest is not an authenticated, reviewed StageB input contract'

# The files inventory's migration entries must be exactly the reviewed full
# migration history — no migration missing, none extra, none reordered
# relative to it (BLOCK-3 remainingFix: files vs fullMigrationHistory).
jq -e '
  ([.files[] | select(.path | test("^apps/v1_api/prisma/migrations/[0-9]{14}_[a-z0-9_]+/migration\\.sql$"))
    | {name: (.path | capture("migrations/(?<n>[0-9]{14}_[a-z0-9_]+)/migration\\.sql").n), sha256}]
    | sort_by(.name)) ==
  (.fullMigrationHistory | map({name, sha256}) | sort_by(.name))
' "$manifest" >/dev/null || fail 'files inventory does not exactly match the declared full migration history'

m11_name="$(jq -er '.m11.name' "$manifest")"
prepared_schema="$PREPARED_DIR/$(jq -er '.finalSchema.path' "$manifest")"
prepared_m11="$PREPARED_DIR/apps/v1_api/prisma/migrations/$m11_name/migration.sql"
[[ -f "$prepared_schema" && -f "$prepared_m11" ]] || fail 'prepared reviewed schema or M11 file is missing'
schema_rel="$(jq -er '.finalSchema.path' "$manifest")"
schema_mode="$(git_mode "$FINAL_SCHEMA")"; schema_bytes="$(bytes "$FINAL_SCHEMA")"
jq -e --arg p "$schema_rel" --arg h "$FINAL_SCHEMA_SHA" --argjson b "$schema_bytes" --arg m "$schema_mode" \
  '(.files | map(select(.path == $p)) | length == 1 and .[0].sha256 == $h and .[0].bytes == $b and .[0].mode == $m)' "$manifest" >/dev/null || fail 'final schema metadata is not exactly represented in files inventory'
m11_rel="apps/v1_api/prisma/migrations/$m11_name/migration.sql"
m11_mode="$(git_mode "$M11_FILE")"; m11_bytes="$(bytes "$M11_FILE")"
jq -e --arg p "$m11_rel" --arg h "$M11_SHA" --argjson b "$m11_bytes" --arg m "$m11_mode" \
  '(.files | map(select(.path == $p)) | length == 1 and .[0].sha256 == $h and .[0].bytes == $b and .[0].mode == $m)' "$manifest" >/dev/null || fail 'M11 metadata is not exactly represented in files inventory'

tmp="$(mktemp -d "${TMPDIR:-/tmp}/task168-source-package.XXXXXX")"
archive_tmp= attestation_tmp=
cleanup() {
  [[ -z "$archive_tmp" ]] || rm -f -- "$archive_tmp"
  [[ -z "$attestation_tmp" ]] || rm -f -- "$attestation_tmp"
  rm -rf -- "$tmp"
}
trap cleanup EXIT
stage="$tmp/source"
mkdir -p "$stage"
git -C "$SOURCE_DIR" archive --format=tar "$SOURCE_COMMIT" > "$tmp/source.tar" || fail 'pinned source archive creation failed'
tar -tf "$tmp/source.tar" > "$tmp/source.members" || fail 'pinned source archive listing failed'
while IFS= read -r member; do
  case "$member" in
    /*|../*|*/../*|*/.. ) fail 'pinned source archive contains an unsafe path';;
  esac
done < "$tmp/source.members"
duplicates="$(LC_ALL=C sort "$tmp/source.members" | uniq -d)"
[[ -z "$duplicates" ]] || fail 'pinned source archive contains duplicate members'
tar -xf "$tmp/source.tar" -C "$stage" || fail 'pinned source archive extraction failed'
[[ -z "$(find "$stage" -type l -print -quit)" ]] || fail 'source archive contains a symlink'

# Reject drift between the reviewed history and what the pinned commit's tree
# actually holds under apps/v1_api/prisma/migrations: any migration directory
# there that is not part of the reviewed history (minus M11, which the
# repository does not carry yet) means the source moved out from under the
# review (BLOCK item: "manifest 밖 migration 디렉터리 거부").
mapfile -t source_migration_dirs < <(find "$stage/apps/v1_api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*_*' -exec basename {} \; | LC_ALL=C sort)
mapfile -t expected_source_migrations < <(jq -r --arg m11 "$M11_NAME" '.fullMigrationHistory | map(.name) | map(select(. != $m11)) | sort[]' "$manifest")
[[ "${source_migration_dirs[*]}" == "${expected_source_migrations[*]}" ]] || fail 'pinned source tree has a migration directory outside the reviewed full migration history'

mapfile -t declared < <(jq -er '.files[].path' "$manifest")
declare -A declared_set=()
for rel in "${declared[@]}"; do declared_set["$rel"]=1; done

# PREPARED_DIR is a caller-controlled path. Strip its prefix by length, not
# by shell/sed pattern, so trailing slashes or glob/regex metacharacters in
# the path cannot change which relative names come out the other end
# (missed-defect: PREPARED_DIR sed metachar/trailing-slash platform skew).
PREPARED_DIR="${PREPARED_DIR%/}"
prepared_dir_prefix_len=$((${#PREPARED_DIR} + 1))
mapfile -t actual_prepared < <(find "$PREPARED_DIR" -type f ! -name INPUT-MANIFEST.json -print | while IFS= read -r p; do printf '%s\n' "${p:$prepared_dir_prefix_len}"; done | LC_ALL=C sort)
mapfile -t sorted_declared < <(printf '%s\n' "${declared[@]}" | LC_ALL=C sort)
[[ "${actual_prepared[*]}" == "${sorted_declared[*]}" ]] || fail 'prepared directory has missing or unlisted files'

for rel in "${declared[@]}"; do
  [[ "$rel" != /* && "$rel" != *'..'* && "$rel" != *'//'* ]] || fail "unsafe prepared path: $rel"
  src="$PREPARED_DIR/$rel"; dst="$stage/$rel"
  [[ -f "$src" && ! -L "$src" ]] || fail "prepared file is not a regular file: $rel"
  mkdir -p "$(dirname "$dst")"
  install -m "$(git_mode "$src")" "$src" "$dst"
  expected_sha="$(jq -er --arg p "$rel" '.files[] | select(.path == $p) | .sha256' "$manifest")"
  expected_bytes="$(jq -er --arg p "$rel" '.files[] | select(.path == $p) | .bytes' "$manifest")"
  expected_mode="$(jq -er --arg p "$rel" '.files[] | select(.path == $p) | .mode' "$manifest")"
  [[ "$(sha "$dst")" == "$expected_sha" && "$(bytes "$dst")" == "$expected_bytes" && "$(git_mode "$dst")" == "$expected_mode" ]] || fail "prepared file drift: $rel"
done

# Anything left under apps/v1_api/prisma/ that is not one of the overlay
# files just installed must be an explicitly allowed non-reviewed file
# (seed scripts, seed data, the StageA schema reference copy). Anything else
# is unexpected drift in the pinned commit's prisma tree.
mapfile -t prisma_files < <(find "$stage/apps/v1_api/prisma" -type f -print | while IFS= read -r p; do printf '%s\n' "${p#$stage/}"; done | LC_ALL=C sort)
for rel in "${prisma_files[@]}"; do
  [[ -n "${declared_set[$rel]:-}" ]] && continue
  [[ "$rel" =~ $PRISMA_EXTRA_ALLOW_REGEX ]] || fail "unexpected file under apps/v1_api/prisma/: $rel"
done

# Normalize every member not already installed at an authenticated overlay
# mode (BLOCK-1): git only stores 644/755, so umask can never leak into the
# archive regardless of which directory the file lives under.
while IFS= read -r source_file; do
  source_rel="${source_file#$stage/}"
  [[ -n "${declared_set[$source_rel]:-}" ]] && continue
  chmod "$(git_mode "$source_file")" "$source_file"
done < <(find "$stage" -type f -print)

archive_manifest="$tmp/INPUT-MANIFEST.json"
jq '. + {archiveLayout:{root:"repository",pathPrefix:"",mapping:"archive member == files[].path"}}' "$manifest" > "$archive_manifest" || fail 'could not render archive manifest'
install -m 644 "$archive_manifest" "$stage/INPUT-MANIFEST.json"
manifest_sha="$(sha "$stage/INPUT-MANIFEST.json")"

file_list="$tmp/files.list"
find "$stage" -type f -exec touch -t 197001010000 {} +
find "$stage" -type f -print | sed "s#^$stage/##" | LC_ALL=C sort > "$file_list"
mkdir -p "$(dirname "$OUTPUT_ARCHIVE")"
archive_tmp="$(mktemp "${OUTPUT_ARCHIVE}.tmp.XXXXXX")"
attestation_tmp="$(mktemp "${OUTPUT_ATTESTATION}.tmp.XXXXXX")"
python3 - "$stage" "$file_list" "$archive_tmp" <<'PY' || fail 'deterministic archive creation failed'
import gzip, hashlib, os, stat, sys, tarfile
stage, file_list, output = sys.argv[1:]
with open(file_list, 'r', encoding='utf-8') as fh:
    names = [line.rstrip('\n') for line in fh]
with open(output, 'wb') as raw:
    with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as gz:
        with tarfile.open(fileobj=gz, mode='w|', format=tarfile.PAX_FORMAT) as archive:
            for name in names:
                path = os.path.join(stage, name)
                info = os.lstat(path)
                if not stat.S_ISREG(info.st_mode):
                    raise SystemExit(f'non-regular archive member: {name}')
                member = tarfile.TarInfo(name)
                member.size = info.st_size
                member.mode = stat.S_IMODE(info.st_mode)
                member.mtime = 0
                member.uid = 0
                member.gid = 0
                member.uname = ''
                member.gname = ''
                with open(path, 'rb') as source:
                    archive.addfile(member, source)
PY
archive_sha="$(sha "$archive_tmp")"; archive_bytes="$(bytes "$archive_tmp")"
jq -n --arg sourceCommit "$SOURCE_COMMIT" --arg archivePath "$OUTPUT_ARCHIVE" --arg archiveSha "$archive_sha" --argjson archiveBytes "$archive_bytes" --arg manifestSha "$manifest_sha" \
  '{schemaVersion:1,kind:"task168StageBSourceArchiveAttestation",sourceCommit:$sourceCommit,archivePath:$archivePath,archiveSha256:$archiveSha,archiveBytes:$archiveBytes,inputManifestPath:"INPUT-MANIFEST.json",inputManifestSha256:$manifestSha,inputSnapshotSha256:$manifestSha,archiveLayout:{root:"repository",pathPrefix:"",mapping:"archive member == files[].path"},createdAt:(now | strftime("%Y-%m-%dT%H:%M:%SZ"))}' > "$attestation_tmp"
jq -e --arg h "$archive_sha" --argjson b "$archive_bytes" '.schemaVersion == 1 and .kind == "task168StageBSourceArchiveAttestation" and .archiveSha256 == $h and .archiveBytes == $b and .inputManifestPath == "INPUT-MANIFEST.json" and (.inputManifestSha256 | strings | test("^[0-9a-f]{64}$")) and .inputManifestSha256 == .inputSnapshotSha256' "$attestation_tmp" >/dev/null || fail 'sidecar validation failed'
chmod 644 "$archive_tmp" "$attestation_tmp"

# Publish sidecar first, archive last, both via hard-link (a single atomic
# no-clobber syscall, unlike check-then-mv). A sidecar published without its
# archive is inert on its own — nothing can act on an attestation whose
# archive never landed — so this ordering never leaves a *misleading*
# artifact behind (BLOCK-2). No test-only environment hook exists in this
# operational script.
ln "$attestation_tmp" "$OUTPUT_ATTESTATION" || fail 'attestation publication failed (destination exists or output directory is not on the same filesystem)'
rm -f -- "$attestation_tmp"; attestation_tmp=
if ! ln "$archive_tmp" "$OUTPUT_ARCHIVE"; then
  rm -f -- "$OUTPUT_ATTESTATION"
  fail 'archive publication failed; the just-published attestation was removed so no orphaned sidecar remains'
fi
rm -f -- "$archive_tmp"; archive_tmp=
printf '%s\n' "$OUTPUT_ARCHIVE"
