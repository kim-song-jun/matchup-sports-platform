#!/usr/bin/env bash
# Task 168 final-image rehearsal producer.
# This is deliberately caller-bound: it has no Alpha/SSM/compose discovery path.
set -Eeuo pipefail

usage() {
  cat >&2 <<'USAGE'
usage: task168-final-image-preflight.sh \
  --backup FILE --backup-sha256 HEX64 --backup-format plain-sql-gzip \
  --stage-a-transition-receipt FILE --stage-a-transition-receipt-sha256 HEX64 \
  --stage-a-backup-receipt FILE --stage-a-backup-receipt-sha256 HEX64 \
  --stage-a-release-sha HEX40 --stage-a-schema-sha256 HEX64 --database-identity TEXT \
  --source-archive FILE --source-sha256 HEX64 --source-archive-attestation FILE \
  --input-snapshot FILE --input-snapshot-sha256 HEX64 \
  --schema FILE --schema-sha256 HEX64 \
  --migration-root DIR --migrations-json FILE --full-migrations-json FILE \
  --resolved-migration-attempts-json FILE \
  --source-sha256 HEX64 --input-snapshot-sha256 HEX64 \
  --postgres-image IMAGE@sha256:HEX64 --api-image IMAGE@sha256:HEX64 \
  --api-client-schema-path FILE --web-image IMAGE@sha256:HEX64 \
  --cutover-tool-image IMAGE@sha256:HEX64 \
  --tool-workdir DIR --tool-prisma-bin FILE \
  --release-sha HEX40 --report FILE --receipt FILE

The caller must provide every source, image, and identity binding. No env files,
compose projects, SSM values, current databases, or mutable image tags are read.
USAGE
  exit 64
}

BACKUP= BACKUP_SHA= BACKUP_FORMAT= STAGE_A_TRANSITION= STAGE_A_TRANSITION_SHA= STAGE_A_BACKUP_RECEIPT= STAGE_A_BACKUP_RECEIPT_SHA= STAGE_A_RELEASE_SHA= STAGE_A_SCHEMA_SHA= DATABASE_IDENTITY=
SCHEMA=SCHEMA_SHA= MIGRATION_ROOT= MIGRATIONS_JSON= FULL_MIGRATIONS_JSON= RESOLVED_ATTEMPTS_JSON= SOURCE_ARCHIVE= SOURCE_SHA= SOURCE_ARCHIVE_ATTESTATION= INPUT_SNAPSHOT= INPUT_SNAPSHOT_SHA=
POSTGRES_IMAGE= API_IMAGE= API_CLIENT_SCHEMA_PATH= WEB_IMAGE= TOOL_IMAGE= API_WORKDIR= API_PRISMA_BIN= TOOL_WORKDIR= TOOL_PRISMA_BIN=
RELEASE_SHA= REPORT= RECEIPT=
while (($#)); do
  case "$1" in
    --backup) BACKUP=${2:-}; shift 2;;
    --backup-sha256) BACKUP_SHA=${2:-}; shift 2;;
    --backup-format) BACKUP_FORMAT=${2:-}; shift 2;;
    --stage-a-transition-receipt) STAGE_A_TRANSITION=${2:-}; shift 2;;
    --stage-a-transition-receipt-sha256) STAGE_A_TRANSITION_SHA=${2:-}; shift 2;;
    --stage-a-backup-receipt) STAGE_A_BACKUP_RECEIPT=${2:-}; shift 2;;
    --stage-a-backup-receipt-sha256) STAGE_A_BACKUP_RECEIPT_SHA=${2:-}; shift 2;;
    --stage-a-release-sha) STAGE_A_RELEASE_SHA=${2:-}; shift 2;;
    --stage-a-schema-sha256) STAGE_A_SCHEMA_SHA=${2:-}; shift 2;;
    --database-identity) DATABASE_IDENTITY=${2:-}; shift 2;;
    --schema) SCHEMA=${2:-}; shift 2;;
    --schema-sha256) SCHEMA_SHA=${2:-}; shift 2;;
    --migration-root) MIGRATION_ROOT=${2:-}; shift 2;;
    --migrations-json) MIGRATIONS_JSON=${2:-}; shift 2;;
    --full-migrations-json) FULL_MIGRATIONS_JSON=${2:-}; shift 2;;
    --resolved-migration-attempts-json) RESOLVED_ATTEMPTS_JSON=${2:-}; shift 2;;
    --source-archive) SOURCE_ARCHIVE=${2:-}; shift 2;;
    --source-sha256) SOURCE_SHA=${2:-}; shift 2;;
    --source-archive-attestation) SOURCE_ARCHIVE_ATTESTATION=${2:-}; shift 2;;
    --input-snapshot) INPUT_SNAPSHOT=${2:-}; shift 2;;
    --input-snapshot-sha256) INPUT_SNAPSHOT_SHA=${2:-}; shift 2;;
    --postgres-image) POSTGRES_IMAGE=${2:-}; shift 2;;
    --api-image) API_IMAGE=${2:-}; shift 2;;
    --api-client-schema-path) API_CLIENT_SCHEMA_PATH=${2:-}; shift 2;;
    --web-image) WEB_IMAGE=${2:-}; shift 2;;
    --cutover-tool-image) TOOL_IMAGE=${2:-}; shift 2;;
    --api-workdir) API_WORKDIR=${2:-}; shift 2;;
    --api-prisma-bin) API_PRISMA_BIN=${2:-}; shift 2;;
    --tool-workdir) TOOL_WORKDIR=${2:-}; shift 2;;
    --tool-prisma-bin) TOOL_PRISMA_BIN=${2:-}; shift 2;;
    --release-sha) RELEASE_SHA=${2:-}; shift 2;;
    --report) REPORT=${2:-}; shift 2;;
    --receipt) RECEIPT=${2:-}; shift 2;;
    *) usage;;
  esac
done

sha256() { sha256sum "$1" | awk '{print $1}'; }
fail() { echo "[task168-final-image-preflight] $*" >&2; exit 1; }

# Reviewed, pinned identities (same values package-task168-final-source.sh
# pins). The archive/manifest checks below prove internal self-consistency
# (files[] matches the tar bytes, fullMigrationHistory matches
# --migration-root); without also pinning these, a caller that supplies a
# wrong-but-internally-consistent schema or M11 (e.g. a stale or
# not-yet-reviewed draft) would still clear every check. Named *_PIN to
# avoid colliding with M11_NAME, which is later assigned (not readonly) from
# the caller-supplied Task 168 migration contract.
readonly FINAL_SCHEMA_SHA=e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46
readonly M11_SHA=08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323
readonly M11_NAME_PIN=20260911090000_retire_tournament_fixture_tables
for value in BACKUP BACKUP_SHA BACKUP_FORMAT STAGE_A_TRANSITION STAGE_A_TRANSITION_SHA STAGE_A_BACKUP_RECEIPT STAGE_A_BACKUP_RECEIPT_SHA STAGE_A_RELEASE_SHA STAGE_A_SCHEMA_SHA DATABASE_IDENTITY SCHEMA SCHEMA_SHA MIGRATION_ROOT MIGRATIONS_JSON FULL_MIGRATIONS_JSON RESOLVED_ATTEMPTS_JSON SOURCE_ARCHIVE SOURCE_SHA SOURCE_ARCHIVE_ATTESTATION INPUT_SNAPSHOT INPUT_SNAPSHOT_SHA POSTGRES_IMAGE API_IMAGE API_CLIENT_SCHEMA_PATH WEB_IMAGE TOOL_IMAGE API_WORKDIR API_PRISMA_BIN TOOL_WORKDIR TOOL_PRISMA_BIN RELEASE_SHA REPORT RECEIPT; do
  [[ -n "${!value}" ]] || fail "$value is required"
done
[[ -s "$BACKUP" && -s "$STAGE_A_TRANSITION" && -s "$STAGE_A_BACKUP_RECEIPT" && -s "$SOURCE_ARCHIVE" && -s "$SOURCE_ARCHIVE_ATTESTATION" && -s "$INPUT_SNAPSHOT" && -f "$SCHEMA" && -d "$MIGRATION_ROOT" && -s "$MIGRATIONS_JSON" && -s "$RESOLVED_ATTEMPTS_JSON" ]] || fail 'input artifact is missing or empty'
[[ -s "$MIGRATION_ROOT/migration_lock.toml" ]] || fail 'migration_lock.toml is required'
MIGRATION_LOCK_SHA="$(sha256 "$MIGRATION_ROOT/migration_lock.toml")"
[[ "$BACKUP_FORMAT" == plain-sql-gzip ]] || fail 'only explicit plain-sql-gzip backups are accepted'
[[ "$BACKUP_SHA" =~ ^[0-9a-f]{64}$ && "$(sha256 "$BACKUP")" == "$BACKUP_SHA" ]] || fail 'backup checksum mismatch'
[[ "$SCHEMA_SHA" =~ ^[0-9a-f]{64}$ && "$(sha256 "$SCHEMA")" == "$SCHEMA_SHA" ]] || fail 'schema checksum mismatch'
[[ "$SCHEMA_SHA" == "$FINAL_SCHEMA_SHA" ]] || fail 'pinned final schema sha256 does not match the reviewed checksum'
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{64}$ && "$(sha256 "$SOURCE_ARCHIVE")" == "$SOURCE_SHA" ]] || fail 'source archive checksum mismatch'
[[ "$INPUT_SNAPSHOT_SHA" =~ ^[0-9a-f]{64}$ && "$(sha256 "$INPUT_SNAPSHOT")" == "$INPUT_SNAPSHOT_SHA" ]] || fail 'input snapshot checksum mismatch'
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'release SHA must be 40 hex characters'

# Archive member set: reject traversal, symlink/hardlink members, and a
# bundle/ prefix layout (this archive is repository-root, pathPrefix "").
# A member is rejected unless its raw tar member name is already its own
# posixpath.normpath(): matching a fixed set of "obviously bad" shapes (a
# leading "./", a doubled "/", a "/./"/"/../" segment) is blind to any other
# spelling of the same target path, which still lands at the canonical path
# on extraction. Member metadata (type, name) is read directly with Python's
# tarfile module rather than parsed from `tar -tv` text columns, which
# silently truncates any member name containing whitespace via `awk '{print
# $NF}'`.
#
# This runs before any system `tar` touches the archive, including reading
# INPUT-MANIFEST.json below: a malformed member elsewhere in the stream can
# desync GNU tar's own sequential parse and fail an unrelated earlier read.
jq -e '.archiveLayout.pathPrefix==""' "$INPUT_SNAPSHOT" >/dev/null || fail 'input snapshot does not declare a repository-root (empty pathPrefix) archive layout'
ARCHIVE_REGULAR_MEMBERS="$(mktemp "${TMPDIR:-/tmp}/task168-preflight-members.XXXXXX")"
MANIFEST_SHA_FILE="$(mktemp "${TMPDIR:-/tmp}/task168-preflight-manifest-sha.XXXXXX")"
python3 - "$SOURCE_ARCHIVE" "$MANIFEST_SHA_FILE" > "$ARCHIVE_REGULAR_MEMBERS" <<'PY' || fail 'source archive member listing failed or contains a rejected path'
import hashlib, posixpath, sys, tarfile, gzip
archive, manifest_sha_path = sys.argv[1], sys.argv[2]
MANIFEST_NAME = 'INPUT-MANIFEST.json'

def fail(msg):
    sys.stderr.write(msg + '\n')
    sys.exit(1)

# Raw header walk: independently re-derives the member-name list straight
# from 512-byte tar headers -- no tarfile, no external `tar` -- and enforces
# the exact contract package-task168-final-source.sh's tarfile.PAX_FORMAT
# writer produces (valid checksum, strict-octal numeric fields, ustar magic,
# empty ustar prefix, and only the typeflags/pax keys that writer ever
# emits). Running this before tarfile ever opens the archive means a header
# tarfile would misparse or crash on (a forged devmajor, a pax 'size'
# override, a pax global header) is rejected here first instead of silently
# passing or raising uncaught. It also extracts INPUT-MANIFEST.json's bytes
# directly, so no external `tar` is ever handed the archive.
ALLOWED_TYPEFLAGS = {b'0', b'5', b'x'}
ALLOWED_PAX_KEYS = {'path'}
USTAR_MAGIC = b'ustar\x0000'

def parse_octal(field):
    if not field:
        return 0
    if field[0] & 0x80:
        return None  # GNU base-256 extension: no writer this repo uses emits it
    text = field.rstrip(b'\x00 ').lstrip(b' ')
    if not text:
        return 0
    for b in text:
        if b < 0x30 or b > 0x37:
            return None
    return int(text, 8)

def read_exact(fh, n):
    buf = bytearray()
    while len(buf) < n:
        chunk = fh.read(n - len(buf))
        if not chunk:
            break
        buf += chunk
    return bytes(buf)

def decode_name(raw):
    return raw.decode('utf-8', 'surrogateescape')

raw_names = []
pending_pax = None
manifest_sha256 = None
with gzip.open(archive, 'rb') as fh:
    while True:
        header = read_exact(fh, 512)
        if len(header) < 512:
            fail('source archive is truncated or malformed')
        if header == b'\x00' * 512:
            break
        chksum = parse_octal(header[148:156])
        computed = sum(header[:148]) + 8 * 0x20 + sum(header[156:])
        if chksum is None or chksum != computed:
            fail('source archive header checksum mismatch')
        if header[257:265] != USTAR_MAGIC:
            fail('source archive contains a header with an unsupported magic value')
        if header[345:500] != b'\x00' * 155:
            fail('source archive contains a non-empty ustar prefix field')
        for lo, hi in ((100, 108), (108, 116), (116, 124), (124, 136), (136, 148), (329, 337), (337, 345)):
            if parse_octal(header[lo:hi]) is None:
                fail('source archive contains a non-octal numeric header field')
        size = parse_octal(header[124:136])
        typeflag = header[156:157]
        if typeflag == b'g':
            fail('source archive contains a global pax extended header')
        if typeflag not in ALLOWED_TYPEFLAGS:
            fail('source archive contains an unauthorized typeflag: %r' % typeflag)
        payload_blocks = ((size + 511) // 512) * 512 if size else 0
        if typeflag == b'x':
            # Per-member pax extended header: its records override fields of
            # the single header that immediately follows.
            payload = read_exact(fh, payload_blocks)
            if len(payload) < payload_blocks:
                fail('source archive is truncated or malformed')
            records, pos = payload[:size], 0
            overrides = dict(pending_pax) if pending_pax else {}
            while pos < len(records):
                sp = records.find(b' ', pos)
                if sp == -1 or not records[pos:sp].isdigit():
                    fail('source archive contains a malformed pax extended header record')
                reclen = int(records[pos:sp])
                if reclen <= 0 or pos + reclen > len(records) or records[pos + reclen - 1:pos + reclen] != b'\n':
                    fail('source archive contains a malformed pax extended header record')
                content = records[sp + 1:pos + reclen - 1]
                eq = content.find(b'=')
                if eq == -1:
                    fail('source archive contains a malformed pax extended header record')
                key = decode_name(content[:eq])
                if key not in ALLOWED_PAX_KEYS:
                    fail('source archive contains an unauthorized pax extended header key: %s' % key)
                overrides[key] = decode_name(content[eq + 1:])
                pos += reclen
            pending_pax = overrides
            continue
        if typeflag == b'0' and header[157:257] != b'\x00' * 100:
            fail('source archive regular file member has a non-empty linkname')
        # Prefix is required empty above, so a long name only ever arrives
        # via a pax 'path' override, never a prefix+name join -- real tar
        # only honors that join for POSIX-magic headers.
        if pending_pax and 'path' in pending_pax:
            name = pending_pax['path']
        else:
            name = decode_name(header[0:100].rstrip(b'\x00'))
        pending_pax = None
        if typeflag == b'5' and name.endswith('/'):
            name = name[:-1]
        raw_names.append(name)
        payload = b''
        if payload_blocks:
            payload = read_exact(fh, payload_blocks)
            if len(payload) < payload_blocks:
                fail('source archive is truncated or malformed')
        if typeflag == b'0' and name == MANIFEST_NAME:
            manifest_sha256 = hashlib.sha256(payload[:size]).hexdigest()

if manifest_sha256 is None:
    fail('source archive does not contain INPUT-MANIFEST.json')

# tarfile's own parse, for the member-classification checks (unsafe path,
# canonical form, bundle/ prefix, duplicate name) that reuse its higher-level
# member typing rather than reimplementing it. A symlink/hardlink member
# never reaches here: ALLOWED_TYPEFLAGS above already rejected typeflag '1'
# or '2' during the raw header walk.
seen = set()
python_names = []
with tarfile.open(archive, 'r:*') as tar:
    for member in tar.getmembers():
        name = member.name
        check_name = name[:-1] if member.isdir() and name.endswith('/') else name
        python_names.append(check_name)
        unsafe = (
            check_name.startswith('/') or check_name in ('.', '..')
            or check_name.startswith('../') or '/../' in check_name or check_name.endswith('/..')
        )
        if unsafe:
            fail('source archive contains an unsafe path: %s' % name)
        if posixpath.normpath(check_name) != check_name:
            fail('source archive contains a non-canonical path: %s' % name)
        if check_name == 'bundle' or check_name.startswith('bundle/'):
            fail('source archive uses a bundle/ prefix but declares pathPrefix="": %s' % name)
        # `tar -xOf` (used below for the per-file content check) concatenates
        # every copy of a repeated member name; real extraction keeps only
        # the last one. A second, differently-sized copy of an already-hashed
        # member would otherwise clear that content check on the
        # concatenated bytes while extracting to something else entirely.
        if check_name in seen:
            fail('source archive contains a duplicate member: %s' % name)
        seen.add(check_name)
        if member.isdir():
            continue
        sys.stdout.buffer.write(check_name.encode('utf-8', 'surrogateescape') + b'\0')

if raw_names != python_names:
    fail('source archive member listing disagrees between tarfile and a raw header walk')

# Reject a member name that collides with another only by case, and a member
# outside apps/v1_api/prisma/ whose casefolded name would land inside it --
# the prisma allowlist below matches case-sensitively, so a case-insensitive
# extraction filesystem could otherwise be steered into overwriting a
# reviewed path with an unreviewed one.
lower_seen = {}
for n in raw_names:
    key = n.casefold()
    if key in lower_seen:
        fail('source archive contains member names that collide only by case: %s' % n)
    lower_seen[key] = n
    if key.startswith('apps/v1_api/prisma/') and not n.startswith('apps/v1_api/prisma/'):
        fail('source archive contains a member whose path collides only by case with apps/v1_api/prisma/: %s' % n)

# Only written once every check above has passed, so a caller can never read
# a manifest hash for an archive this walker rejected.
with open(manifest_sha_path, 'w') as sha_fh:
    sha_fh.write(manifest_sha256)
PY
# Every member the archive carries under apps/v1_api/prisma/ must be either a
# declared overlay file (files[]) or one of the same non-reviewed extras
# package-task168-final-source.sh allows there (seed scripts, seed data, the
# StageA schema reference copy). This walks the whole subtree rather than
# matching a fixed migration.sql/schema.prisma/migration_lock.toml regex: a
# regex keyed on the expected shape is invisible to a member whose path falls
# outside that shape (a non-conforming migration directory name, or an extra
# file placed inside an otherwise-declared migration directory), so such a
# member would previously reach here unexamined. Declared-file presence is
# verified independently by the per-file archive-content loop below, so this
# only needs to reject extras — it is not also required to prove nothing is
# missing.
readonly PRISMA_EXTRA_ALLOW_REGEX='^apps/v1_api/prisma/([^/]+\.ts|data/[^/]+\.json|schema\.stage-a\.prisma)$'
declare -A DECLARED_PRISMA_PATH_SET=()
while IFS= read -r declared_path; do
  [[ -n "$declared_path" ]] && DECLARED_PRISMA_PATH_SET["$declared_path"]=1
done < <(jq -r '.files[].path' "$INPUT_SNAPSHOT")
# ARCHIVE_REGULAR_MEMBERS already holds only canonical, non-symlink regular
# file paths (directories filtered out above), NUL-separated so a member
# path containing a literal newline cannot forge an extra line.
while IFS= read -r -d '' member_path; do
  case "$member_path" in apps/v1_api/prisma/*) ;; *) continue;; esac
  [[ -n "${DECLARED_PRISMA_PATH_SET[$member_path]:-}" ]] && continue
  [[ "$member_path" =~ $PRISMA_EXTRA_ALLOW_REGEX ]] || fail "source archive contains an unauthenticated member under apps/v1_api/prisma/: $member_path"
done < "$ARCHIVE_REGULAR_MEMBERS"
rm -f "$ARCHIVE_REGULAR_MEMBERS"

# External sidecar attestation binds the archive to the exact INPUT-MANIFEST.json
# it carries, without embedding the archive's own hash inside itself (that would
# be self-hash recursion, which is why the archive's manifest has no
# sourceArchive.sha256 field for us to compare against below). The manifest
# hash itself now comes from the raw header walk above, not a second,
# external-tar-mediated extraction of the same bytes.
jq -e --arg h "$SOURCE_SHA" --argjson b "$(wc -c < "$SOURCE_ARCHIVE" | tr -d ' ')" --arg commit "$RELEASE_SHA" \
  '.schemaVersion==1 and .kind=="task168StageBSourceArchiveAttestation" and .sourceCommit==$commit and .archiveSha256==$h and .archiveBytes==$b and .inputManifestPath=="INPUT-MANIFEST.json" and (.inputManifestSha256|strings|test("^[0-9a-f]{64}$")) and .inputManifestSha256==.inputSnapshotSha256' \
  "$SOURCE_ARCHIVE_ATTESTATION" >/dev/null || fail 'source archive attestation does not authenticate this archive'
EXTRACTED_MANIFEST_SHA="$(cat "$MANIFEST_SHA_FILE")"
rm -f "$MANIFEST_SHA_FILE"
ATTESTED_MANIFEST_SHA="$(jq -er '.inputManifestSha256' "$SOURCE_ARCHIVE_ATTESTATION")"
[[ "$EXTRACTED_MANIFEST_SHA" == "$ATTESTED_MANIFEST_SHA" ]] || fail 'archive-embedded INPUT-MANIFEST.json does not match the attested hash'
# Do not trust a separately staged --input-snapshot merely because its path
# looks right: require its bytes to be exactly what the archive itself carries.
[[ "$INPUT_SNAPSHOT_SHA" == "$ATTESTED_MANIFEST_SHA" ]] || fail 'supplied input snapshot is not the manifest embedded in the attested archive'
[[ "$STAGE_A_RELEASE_SHA" =~ ^[0-9a-f]{40}$ && "$STAGE_A_SCHEMA_SHA" =~ ^[0-9a-f]{64}$ && -n "$DATABASE_IDENTITY" ]] || fail 'Stage A origin identity is malformed'
[[ "$STAGE_A_TRANSITION_SHA" =~ ^[0-9a-f]{64}$ && "$(sha256 "$STAGE_A_TRANSITION")" == "$STAGE_A_TRANSITION_SHA" ]] || fail 'Stage A transition receipt checksum mismatch'
[[ "$STAGE_A_BACKUP_RECEIPT_SHA" =~ ^[0-9a-f]{64}$ && "$(sha256 "$STAGE_A_BACKUP_RECEIPT")" == "$STAGE_A_BACKUP_RECEIPT_SHA" ]] || fail 'Stage A backup receipt checksum mismatch'
BACKUP_BYTES="$(wc -c < "$BACKUP" | tr -d ' ')"
jq -e --arg release "$STAGE_A_RELEASE_SHA" --arg schema "$STAGE_A_SCHEMA_SHA" --arg db "$DATABASE_IDENTITY" --arg backupReceipt "$STAGE_A_BACKUP_RECEIPT" --arg backupReceiptSha "$STAGE_A_BACKUP_RECEIPT_SHA" --arg backupSha "$BACKUP_SHA" '.status=="COMPLETED" and .stage=="stageAIntermediate" and .releaseSha==$release and .schemaSha256==$schema and .databaseIdentity==$db and .backupReceipt==$backupReceipt and .backupReceiptSha256==$backupReceiptSha and .backupSha256==$backupSha' "$STAGE_A_TRANSITION" >/dev/null || fail 'Stage A transition does not authenticate the supplied backup and origin'
jq -e --arg release "$STAGE_A_RELEASE_SHA" --arg db "$DATABASE_IDENTITY" --arg backup "$BACKUP" --arg backupSha "$BACKUP_SHA" --argjson bytes "$BACKUP_BYTES" '.schemaVersion==1 and .status=="COMPLETED" and .stage=="stageAIntermediate" and .releaseSha==$release and .databaseIdentity==$db and .backupFormat=="plain-sql-gzip" and .backupPath==$backup and .backupSha256==$backupSha and .backupBytes==$bytes' "$STAGE_A_BACKUP_RECEIPT" >/dev/null || fail 'Stage A backup receipt does not authenticate format, path, bytes, hash, release, and database identity'
# No .sourceArchive.sha256 field is asserted here: that would be self-hash
# recursion inside the archive's own embedded manifest (see the sidecar
# attestation binding above, which authenticates the archive independently).
jq -e --arg commit "$RELEASE_SHA" --arg schema "$SCHEMA_SHA" --arg m11name "$M11_NAME_PIN" --arg m11sha "$M11_SHA" --argjson history "$(cat "$FULL_MIGRATIONS_JSON")" '.schemaVersion==1 and .kind=="task168StageBFinalInputs" and .sourceCommit==$commit and .finalSchema.sha256==$schema and .migrationPolicy=="task168-stageBFinal" and .fullMigrationHistory==$history and .m11.name==$m11name and .m11.sha256==$m11sha' "$INPUT_SNAPSHOT" >/dev/null || fail 'input snapshot does not authenticate the prepared Stage B source/archive contract'
jq -e '.files | type=="array" and length>0 and (all(.[]; ((.path|type)=="string" and (.path|test("^apps/v1_api/prisma/(schema\\.prisma|migrations/[0-9]{14}_[a-z0-9_]+/migration\\.sql|migrations/migration_lock\\.toml)$"))) and ((.sha256|type)=="string" and (.sha256|test("^[0-9a-f]{64}$"))) and ((.bytes|type)=="number" and (.bytes>=0)) and ((.mode|type)=="string" and (.mode|test("^(644|755)$"))))) and ((map(.path)|unique|length)==length)' "$INPUT_SNAPSHOT" >/dev/null || fail 'input snapshot file inventory is malformed'
while IFS=$'\t' read -r path expected bytes; do
  archive_sha="$(tar -xOf "$SOURCE_ARCHIVE" "$path" | sha256sum | awk '{print $1}')" || fail "source archive is missing prepared input: $path"
  archive_bytes="$(tar -xOf "$SOURCE_ARCHIVE" "$path" | wc -c | tr -d ' ')" || fail "source archive input size is unreadable: $path"
  [[ "$archive_sha" == "$expected" && "$archive_bytes" == "$bytes" ]] || fail "source archive input differs from authenticated snapshot: $path"
done < <(jq -r '.files | sort_by(.path)[] | [.path,.sha256,(.bytes|tostring)] | @tsv' "$INPUT_SNAPSHOT")
# The checks above prove files[] is self-consistent with the archive's own
# tar bytes, but nothing
# yet ties that inventory to the migration ledger the rehearsal actually
# replays (fullMigrationHistory / --migration-root, cross-checked further
# below) or to the pinned final schema. Without this, an archive whose
# files[] entries are internally consistent with its own bytes could still
# ship a migration.sql or schema.prisma the rehearsal never exercised, as
# long as fullMigrationHistory/--migration-root/--schema (supplied
# separately) still describe the untampered originals.
jq -e --arg p 'apps/v1_api/prisma/schema.prisma' --arg h "$FINAL_SCHEMA_SHA" \
  '.finalSchema.path == $p and ([.files[] | select(.path == $p)] | length == 1 and .[0].sha256 == $h)' \
  "$INPUT_SNAPSHOT" >/dev/null || fail 'archive files inventory does not authenticate the pinned final schema'
jq -e '
  ([.files[] | select(.path | test("^apps/v1_api/prisma/migrations/[0-9]{14}_[a-z0-9_]+/migration\\.sql$"))
    | {name: (.path | capture("migrations/(?<n>[0-9]{14}_[a-z0-9_]+)/migration\\.sql").n), sha256}]
    | sort_by(.name)) ==
  (.fullMigrationHistory | map({name, sha256}) | sort_by(.name))
' "$INPUT_SNAPSHOT" >/dev/null || fail 'archive files inventory does not exactly match the declared full migration history'
RESOLVED_ATTEMPTS_CANONICAL="$(jq -c 'sort_by([.migration_name,(.rolled_back_at // ""),.checksum,(.finished_at // "")])' "$RESOLVED_ATTEMPTS_JSON")" || fail 'resolved migration attempt snapshot is invalid JSON'
jq -e 'type == "array" and (all(.[]; ((.migration_name|type)=="string" and (.migration_name|test("^[0-9]{14}_[a-z0-9_]+$"))) and ((.checksum|type)=="string" and (.checksum|test("^[0-9a-f]{64}$"))) and (.finished_at == null) and ((.rolled_back_at|type)=="string" and (.rolled_back_at|length > 0)))) and (sort_by([.migration_name,(.rolled_back_at // ""),.checksum,(.finished_at // "")]) == .)' <<<"$RESOLVED_ATTEMPTS_CANONICAL" >/dev/null || fail 'resolved migration attempt snapshot must contain canonical rolled-back rows'
RESOLVED_ATTEMPTS_EXPECTED_COUNT="$(jq 'length' <<<"$RESOLVED_ATTEMPTS_CANONICAL")"
resolved_attempts_pipe() {
  jq -r 'map([.migration_name,.checksum,(.finished_at // ""),(.rolled_back_at // "")] | join("|")) | join("\n")'
}
RESOLVED_ATTEMPTS_PIPE="$(resolved_attempts_pipe <<<"$RESOLVED_ATTEMPTS_CANONICAL")"
RESOLVED_ATTEMPTS_SHA="$(printf '%s' "$RESOLVED_ATTEMPTS_PIPE" | sha256sum | awk '{print $1}')"
for image in POSTGRES_IMAGE API_IMAGE WEB_IMAGE TOOL_IMAGE; do
  [[ "${!image}" =~ ^.+@sha256:[0-9a-f]{64}$ ]] || fail "$image must be an immutable digest reference"
done
jq -e 'type == "array" and length == 11 and ([.[].name] | length == 11) and (all(.[]; (.name|type)=="string" and (.sha256|type)=="string" and (.sha256|test("^[0-9a-f]{64}$"))))' "$MIGRATIONS_JSON" >/dev/null || fail 'migration contract must contain exactly 11 hashed entries'
mapfile -t MIGRATION_NAMES < <(jq -er '.[].name' "$MIGRATIONS_JSON")
[[ "${MIGRATION_NAMES[10]}" == "$M11_NAME_PIN" ]] || fail 'M11 must be the final migration entry'
M11_SHA_EXPECTED="$(jq -er '.[10].sha256' "$MIGRATIONS_JSON")"
[[ "$M11_SHA_EXPECTED" == "$M11_SHA" ]] || fail 'M11 migration hash in the Task 168 contract does not match the reviewed checksum'
[[ -s "$FULL_MIGRATIONS_JSON" ]] || fail 'full migration history JSON is missing or empty'
jq -e 'type == "array" and length >= 11 and (all(.[]; (.name|type)=="string")) and (([.[].name] as $names | (($names | unique | length) == ($names | length)))) and (all(.[]; (.sha256|type)=="string" and (.sha256|test("^[0-9a-f]{64}$"))))' "$FULL_MIGRATIONS_JSON" >/dev/null || fail 'full migration history must be an ordered unique hashed array'
FULL_HISTORY_SHA="$(sha256 "$FULL_MIGRATIONS_JSON")"
mapfile -t MIGRATION_NAMES_FULL < <(jq -er '.[].name' "$FULL_MIGRATIONS_JSON")
[[ "${MIGRATION_NAMES_FULL[${#MIGRATION_NAMES_FULL[@]}-1]}" == "$M11_NAME_PIN" ]] || fail 'full migration history must end at M11'
for name in "${MIGRATION_NAMES[@]}"; do
  task_hash="$(jq -er --arg n "$name" '.[] | select(.name == $n) | .sha256' "$MIGRATIONS_JSON")"
  jq -e --arg n "$name" --arg h "$task_hash" 'any(.[]; .name == $n and .sha256 == $h)' "$FULL_MIGRATIONS_JSON" >/dev/null || fail "Task 168 migration missing or hash-different in full history: $name"
done
for name in "${MIGRATION_NAMES_FULL[@]}"; do
  [[ "$name" =~ ^[0-9]{14}_[a-z0-9_]+$ ]] || fail "invalid migration name: $name"
  sql="$MIGRATION_ROOT/$name/migration.sql"
  [[ -s "$sql" ]] || fail "migration SQL missing: $name"
  expected="$(jq -er --arg n "$name" '.[] | select(.name == $n) | .sha256' "$FULL_MIGRATIONS_JSON")"
  [[ "$(sha256 "$sql")" == "$expected" ]] || fail "full-history migration checksum mismatch: $name"
done
source_names_json="$(find "$MIGRATION_ROOT" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*_*' -exec basename {} \; | sort | jq -Rsc 'split("\n") | map(select(length > 0))')"
jq -e --argjson source "$source_names_json" '[.[].name] == $source' "$FULL_MIGRATIONS_JSON" >/dev/null || fail 'migration-root directories or order differ from authenticated full history'

RUN_ID="${RELEASE_SHA}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
NETWORK="task168-final-preflight-net-${RUN_ID}"
VOLUME="task168-final-preflight-vol-${RUN_ID}"
DB="task168-final-preflight-db-${RUN_ID}"
TOOL_CONTAINER="task168-final-preflight-tool-${RUN_ID}"
API_CONTAINER="task168-final-preflight-api-${RUN_ID}"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/task168-final-preflight.XXXXXX")"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/task168-final-preflight-logs.XXXXXX")"
DB_USER=task168_rehearsal DB_NAME=teameet_rehearsal
DB_PASSWORD="$(openssl rand -hex 24)"
EVIDENCE_DIR="${REPORT%.json}.evidence"
EVIDENCE_TMP="${EVIDENCE_DIR}.tmp.${RUN_ID}"
CLEANUP_RECORD="${RECEIPT}.cleanup.json"
FAILURE_DIR="${RECEIPT}.failure.evidence"
for output in "$REPORT" "$RECEIPT" "$CLEANUP_RECORD" "$EVIDENCE_DIR" "$EVIDENCE_TMP" "$FAILURE_DIR"; do
  [[ ! -e "$output" ]] || fail "output already exists: $output"
done
# GNU `realpath -m` canonicalizes a path that does not exist yet; BSD/macOS
# realpath has no -m. python3's os.path.realpath does the same normalization
# on both platforms without requiring the path to exist, and this script
# already depends on python3 for the archive member listing above.
abspath() { python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1"; }
OUTPUT_PATHS=("$(abspath "$REPORT")" "$(abspath "$RECEIPT")" "$(abspath "$CLEANUP_RECORD")" "$(abspath "$EVIDENCE_DIR")" "$(abspath "$EVIDENCE_TMP")" "$(abspath "$FAILURE_DIR")")
for ((i=0; i<${#OUTPUT_PATHS[@]}; i++)); do for ((j=i+1; j<${#OUTPUT_PATHS[@]}; j++)); do
  [[ "${OUTPUT_PATHS[i]}" != "${OUTPUT_PATHS[j]}" ]] || fail 'output paths must be pairwise distinct'
done; done
for resource in "$NETWORK" "$VOLUME" "$DB" "$TOOL_CONTAINER" "$API_CONTAINER"; do
  ! docker ps -a --format '{{.Names}}' | grep -Fxq "$resource" || fail "container name already exists: $resource"
  ! docker network ls --format '{{.Name}}' | grep -Fxq "$resource" || fail "network name already exists: $resource"
  ! docker volume ls --format '{{.Name}}' | grep -Fxq "$resource" || fail "volume name already exists: $resource"
done
CLEANED=0
cleanup_owned() {
  [[ "$(docker inspect --format '{{index .Config.Labels "com.teameet.task168.run"}}' "$DB" 2>/dev/null || true)" != "$RUN_ID" ]] || docker rm -f "$DB" >/dev/null 2>&1 || true
  [[ "$(docker inspect --format '{{index .Config.Labels "com.teameet.task168.run"}}' "$TOOL_CONTAINER" 2>/dev/null || true)" != "$RUN_ID" ]] || docker rm -f "$TOOL_CONTAINER" >/dev/null 2>&1 || true
  [[ "$(docker inspect --format '{{index .Config.Labels "com.teameet.task168.run"}}' "$API_CONTAINER" 2>/dev/null || true)" != "$RUN_ID" ]] || docker rm -f "$API_CONTAINER" >/dev/null 2>&1 || true
  [[ "$(docker network inspect --format '{{index .Labels "com.teameet.task168.run"}}' "$NETWORK" 2>/dev/null || true)" != "$RUN_ID" ]] || docker network rm "$NETWORK" >/dev/null 2>&1 || true
  [[ "$(docker volume inspect --format '{{index .Labels "com.teameet.task168.run"}}' "$VOLUME" 2>/dev/null || true)" != "$RUN_ID" ]] || docker volume rm "$VOLUME" >/dev/null 2>&1 || true
  rm -rf "$STAGE" "$LOG_DIR"
  if docker ps -a --format '{{.Names}}' | grep -Fxq "$DB"; then return 1; fi
  if docker ps -a --format '{{.Names}}' | grep -Fxq "$TOOL_CONTAINER"; then return 1; fi
  if docker ps -a --format '{{.Names}}' | grep -Fxq "$API_CONTAINER"; then return 1; fi
  if docker network ls --format '{{.Name}}' | grep -Fxq "$NETWORK"; then return 1; fi
  if docker volume ls --format '{{.Name}}' | grep -Fxq "$VOLUME"; then return 1; fi
  [[ ! -e "$STAGE" && ! -e "$LOG_DIR" ]] || return 1
  CLEANED=1
}
on_exit() {
  local status=$?
  if (( status != 0 )) && [[ ! -e "$FAILURE_DIR" ]]; then
    mkdir -m 700 -p "$FAILURE_DIR"
    cp -R "$LOG_DIR"/. "$FAILURE_DIR"/ 2>/dev/null || true
    chmod -R go-rwx "$FAILURE_DIR" 2>/dev/null || true
  fi
  if (( CLEANED == 0 )); then cleanup_owned || true; fi
  exit "$status"
}
trap on_exit EXIT

docker image inspect "$POSTGRES_IMAGE" >/dev/null || fail 'pinned PostgreSQL image is unavailable locally'
docker image inspect "$API_IMAGE" >/dev/null || fail 'pinned API image is unavailable locally'
docker image inspect "$WEB_IMAGE" >/dev/null || fail 'pinned web image is unavailable locally'
docker image inspect "$TOOL_IMAGE" >/dev/null || fail 'pinned cutover tool image is unavailable locally'
POSTGRES_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$POSTGRES_IMAGE")"
API_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$API_IMAGE")"
API_REPO_DIGESTS="$(docker image inspect --format '{{json .RepoDigests}}' "$API_IMAGE")"
WEB_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$WEB_IMAGE")"
WEB_REPO_DIGESTS="$(docker image inspect --format '{{json .RepoDigests}}' "$WEB_IMAGE")"
TOOL_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$TOOL_IMAGE")"
docker run --rm --name "$API_CONTAINER" --label "com.teameet.task168.run=$RUN_ID" --entrypoint /bin/sh "$API_IMAGE" -ceu 'sha256sum "$1"' sh "$API_CLIENT_SCHEMA_PATH" >"$LOG_DIR/api-image-schema-attestation.stdout" 2>"$LOG_DIR/api-image-schema-attestation.stderr" || fail 'API image built-client schema attestation failed'
API_BUILT_SCHEMA_SHA="$(awk 'NF >= 1 {print $1; exit}' "$LOG_DIR/api-image-schema-attestation.stdout")"
[[ "$API_BUILT_SCHEMA_SHA" == "$SCHEMA_SHA" ]] || fail 'API image built-client schema hash differs from pinned final schema'
jq -n --arg postgres "$POSTGRES_IMAGE" --arg postgresId "$POSTGRES_IMAGE_ID" --arg api "$API_IMAGE" --arg apiId "$API_IMAGE_ID" --arg apiDigests "$API_REPO_DIGESTS" --arg apiSchemaPath "$API_CLIENT_SCHEMA_PATH" --arg apiSchemaSha "$API_BUILT_SCHEMA_SHA" --arg web "$WEB_IMAGE" --arg webId "$WEB_IMAGE_ID" --arg webDigests "$WEB_REPO_DIGESTS" --arg tool "$TOOL_IMAGE" --arg toolId "$TOOL_IMAGE_ID" '{postgres:{reference:$postgres,imageId:$postgresId},api:{reference:$api,imageId:$apiId,repoDigests:($apiDigests|fromjson),builtSchemaPath:$apiSchemaPath,builtSchemaSha256:$apiSchemaSha},web:{reference:$web,imageId:$webId,repoDigests:($webDigests|fromjson)},cutoverTool:{reference:$tool,imageId:$toolId}}' > "$LOG_DIR/image-attestation.json"
docker network create --internal --label "com.teameet.task168.run=$RUN_ID" "$NETWORK" >/dev/null
docker volume create --label "com.teameet.task168.run=$RUN_ID" "$VOLUME" >/dev/null
docker run -d --name "$DB" --label "com.teameet.task168.run=$RUN_ID" --network "$NETWORK" --network-alias postgres --mount "type=volume,src=$VOLUME,dst=/var/lib/postgresql/data" -e POSTGRES_USER="$DB_USER" -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB="$DB_NAME" "$POSTGRES_IMAGE" >/dev/null
for attempt in {1..60}; do
  if docker exec "$DB" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then break; fi
  [[ "$attempt" == 60 ]] && fail 'isolated PostgreSQL did not become ready'
  sleep 1
done

# The pinned backup contract is plain SQL gzip; restore is intentionally explicit.
gzip -dc "$BACKUP" | docker exec -i "$DB" psql -X -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" >"$LOG_DIR/restore.stdout" 2>"$LOG_DIR/restore.stderr" || fail 'backup restore failed'
mkdir -p "$STAGE/prisma/migrations"
cp "$SCHEMA" "$STAGE/prisma/schema.prisma"
cp "$MIGRATION_ROOT/migration_lock.toml" "$STAGE/prisma/migrations/"
TASK_NAMES_SQL="$(printf "'%s'," "${MIGRATION_NAMES[@]:0:10}" | sed 's/,$//')"
M11_NAME="${MIGRATION_NAMES[10]}"
# `.[:-1]` (all but the last element), not `[:-1]` -- the bare form is a jq
# syntax error and, under `set -e`, kills the script at this assignment
# before any real rehearsal step runs. The result is JSON *text*, not a file
# path, so callers below must pass it through directly rather than `cat` it.
PRE_HISTORY_JSON="$(jq -c '.[:-1]' "$FULL_MIGRATIONS_JSON")"
ledger_query="SELECT migration_name || '|' || COALESCE(checksum,'') || '|applied' FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name"
task_ledger_query="SELECT migration_name || '|' || COALESCE(checksum,'') || '|applied' FROM \"_prisma_migrations\" WHERE migration_name IN ($TASK_NAMES_SQL,'$M11_NAME') AND finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name"
ledger_classification_query="SELECT count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) || E'\t' || count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NOT NULL) || E'\t' || count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NOT NULL) || E'\t' || count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) FROM \"_prisma_migrations\""
resolved_attempts_query="SELECT migration_name || E'\t' || COALESCE(checksum,'') || E'\t' || COALESCE(finished_at::text,'') || E'\t' || COALESCE(rolled_back_at::text,'') FROM \"_prisma_migrations\" WHERE finished_at IS NULL AND rolled_back_at IS NOT NULL ORDER BY migration_name, rolled_back_at, checksum, id"
resolved_attempts_json() {
  jq -Rsc 'split("\n") | map(select(length > 0) | split("\t") | {migration_name:.[0],checksum:.[1],finished_at:(if .[2] == "" then null else .[2] end),rolled_back_at:(if .[3] == "" then null else .[3] end)}) | sort_by([.migration_name,(.rolled_back_at // ""),.checksum,(.finished_at // "")])'
}
ledger_before="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -U "$DB_USER" -d "$DB_NAME" -c "$ledger_query")" || fail 'pre-replay full ledger query failed'
task_before="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -U "$DB_USER" -d "$DB_NAME" -c "$task_ledger_query")" || fail 'pre-replay Task 168 ledger query failed'
classification_before="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -U "$DB_USER" -d "$DB_NAME" -c "$ledger_classification_query")" || fail 'pre-replay migration classification query failed'
resolved_before_raw="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -F $'\t' -U "$DB_USER" -d "$DB_NAME" -c "$resolved_attempts_query")" || fail 'pre-replay resolved migration attempt query failed'
resolved_before_json="$(resolved_attempts_json <<<"$resolved_before_raw")"
resolved_before_pipe="$(resolved_attempts_pipe <<<"$resolved_before_json")"
[[ "$resolved_before_pipe" == "$RESOLVED_ATTEMPTS_PIPE" && "$(printf '%s' "$resolved_before_pipe" | sha256sum | awk '{print $1}')" == "$RESOLVED_ATTEMPTS_SHA" ]] || fail 'pre-replay resolved migration attempt snapshot differs from authenticated input'
IFS=$'\t' read -r unresolved_before unclassified_before resolved_before active_before <<<"$classification_before"
[[ "$unresolved_before" == 0 && "$unclassified_before" == 0 && "$resolved_before" == "$RESOLVED_ATTEMPTS_EXPECTED_COUNT" ]] || fail 'pre-replay migration ledger contains unresolved, unclassified, or unexpected resolved rows'
printf '%s\n' "$ledger_before" > "$LOG_DIR/ledger-before.txt"
printf '%s\n' "$task_before" > "$LOG_DIR/task-ledger-before.txt"
printf '%s\n' "$classification_before" > "$LOG_DIR/ledger-classification-before.txt"
printf '%s\n' "$resolved_before_json" > "$LOG_DIR/resolved-migration-attempts-before.json"
total_before="$(grep -c '|' "$LOG_DIR/ledger-before.txt" || true)"
[[ "$total_before" =~ ^[1-9][0-9]*$ ]] || fail 'pre-replay full migration ledger is empty'
[[ "$(grep -c '|applied$' <<<"$task_before")" == 10 ]] || fail 'pre-replay Task 168 subset is not exactly ten applied migrations'
! grep -q "^$M11_NAME|" <<<"$task_before" || fail 'M11 is already present before rehearsal'
# Preserve every historical migration directory. Only the explicit M11 directory is withheld
# until the ten-row Task 168 subset has been authenticated and replayed idempotently.
while IFS= read -r -d '' dir; do
  name="$(basename "$dir")"
  [[ "$name" == "$M11_NAME" ]] && continue
  cp -R "$dir" "$STAGE/prisma/migrations/$name"
done < <(find "$MIGRATION_ROOT" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*_*' -print0 | sort -z)
historical_migration_count="$(find "$STAGE/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*_*' | wc -l | tr -d ' ')"
[[ "$historical_migration_count" -ge 10 ]] || fail 'full historical migration set was not materialized'
{
  while IFS= read -r -d '' dir; do
    name="$(basename "$dir")"
    jq -n --arg name "$name" --arg sha "$(sha256 "$dir/migration.sql")" '{name:$name,sha256:$sha}'
  done < <(find "$STAGE/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*_*' -print0 | sort -z)
} | jq -s 'sort_by(.name)' > "$LOG_DIR/historical-migrations.json"
[[ "$(jq 'length' "$LOG_DIR/historical-migrations.json")" == "$historical_migration_count" ]] || fail 'historical migration inventory is incomplete'
while IFS='|' read -r migration_name migration_checksum migration_status; do
  [[ -z "$migration_name" ]] && continue
  [[ -d "$STAGE/prisma/migrations/$migration_name" ]] || fail "restored applied migration has no materialized SQL directory: $migration_name"
done < "$LOG_DIR/ledger-before.txt"

ledger_matches_history() {
  local actual_file="$1" expected_json="$2" actual_json
  actual_json="$(awk -F'|' 'NF == 3 {printf "{\"name\":\"%s\",\"checksum\":\"%s\",\"status\":\"%s\"}\n",$1,$2,$3}' "$actual_file" | jq -s '.')" || return 1
  jq -e --argjson expected "$expected_json" --argjson actual "$actual_json" '
    ($actual | length) == ($expected | length) and
    ($actual | all(. as $row | (($expected | map(select(.name == $row.name))) | length) == 1)) and
    ($expected | all(. as $expectedRow | (($actual | map(select(.name == $expectedRow.name and .checksum == $expectedRow.sha256 and .status == "applied"))) | length) == 1))
  ' >/dev/null
}
ledger_matches_history "$LOG_DIR/ledger-before.txt" "$PRE_HISTORY_JSON" || fail 'pre-replay complete ledger does not exactly match full history minus M11'

run_tool() {
  local command="$1"
  docker run --rm --name "$TOOL_CONTAINER" --network "$NETWORK" \
    --label "com.teameet.task168.run=$RUN_ID" \
    --mount "type=bind,src=$STAGE,dst=/task168,readonly" \
    -e "DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}?schema=public" \
    --entrypoint /bin/sh "$TOOL_IMAGE" -ceu "cd $(printf '%q' "$TOOL_WORKDIR") && exec $(printf '%q' "$TOOL_PRISMA_BIN") $command" 2>"$LOG_DIR/tool.stderr"
}
run_api_client_validation() {
  docker run --rm --name "$API_CONTAINER" --network "$NETWORK" \
    --label "com.teameet.task168.run=$RUN_ID" \
    --mount "type=bind,src=$STAGE,dst=/task168,readonly" \
    -e "DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}?schema=public" \
    --entrypoint /bin/sh "$API_IMAGE" -ceu "cd $(printf '%q' "$API_WORKDIR") && exec $(printf '%q' "$API_PRISMA_BIN") validate --schema /task168/prisma/schema.prisma" 2>"$LOG_DIR/api.stderr"
}
# The pinned tool receives the full historical migration tree. Prisma must leave the
# already-applied history untouched; the Task 168 subset is checked separately.
run_api_client_validation >"$LOG_DIR/api-client-validate.stdout" || fail 'final API image rejected the pinned client schema'
run_tool "migrate deploy --schema /task168/prisma/schema.prisma" >"$LOG_DIR/m1-m10.stdout" || fail 'historical/M1-M10 migration replay failed'
ledger_after_pre_m11="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -U "$DB_USER" -d "$DB_NAME" -c "$ledger_query")" || fail 'post-replay full ledger query failed'
task_after_pre_m11="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -U "$DB_USER" -d "$DB_NAME" -c "$task_ledger_query")" || fail 'post-replay Task 168 ledger query failed'
classification_after_pre_m11="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -U "$DB_USER" -d "$DB_NAME" -c "$ledger_classification_query")" || fail 'post-replay migration classification query failed'
resolved_after_pre_m11_raw="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -F $'\t' -U "$DB_USER" -d "$DB_NAME" -c "$resolved_attempts_query")" || fail 'post-replay resolved migration attempt query failed'
resolved_after_pre_m11_json="$(resolved_attempts_json <<<"$resolved_after_pre_m11_raw")"
resolved_after_pre_m11_pipe="$(resolved_attempts_pipe <<<"$resolved_after_pre_m11_json")"
[[ "$resolved_after_pre_m11_pipe" == "$RESOLVED_ATTEMPTS_PIPE" && "$(printf '%s' "$resolved_after_pre_m11_pipe" | sha256sum | awk '{print $1}')" == "$RESOLVED_ATTEMPTS_SHA" ]] || fail 'pre-M11 replay changed resolved migration attempt snapshot'
IFS=$'\t' read -r unresolved_after_pre_m11 unclassified_after_pre_m11 resolved_after_pre_m11 active_after_pre_m11 <<<"$classification_after_pre_m11"
[[ "$unresolved_after_pre_m11" == 0 && "$unclassified_after_pre_m11" == 0 && "$resolved_after_pre_m11" == "$RESOLVED_ATTEMPTS_EXPECTED_COUNT" ]] || fail 'pre-M11 replay changed migration attempt classification'
printf '%s\n' "$ledger_after_pre_m11" > "$LOG_DIR/ledger-after-pre-m11.txt"
printf '%s\n' "$task_after_pre_m11" > "$LOG_DIR/task-ledger-after-pre-m11.txt"
printf '%s\n' "$classification_after_pre_m11" > "$LOG_DIR/ledger-classification-after-pre-m11.txt"
printf '%s\n' "$resolved_after_pre_m11_json" > "$LOG_DIR/resolved-migration-attempts-after-pre-m11.json"
[[ "$(grep -c '|' <<<"$ledger_after_pre_m11")" == "$total_before" ]] || fail 'pre-M11 replay changed the complete historical ledger'
ledger_matches_history "$LOG_DIR/ledger-after-pre-m11.txt" "$PRE_HISTORY_JSON" || fail 'pre-M11 replay changed the complete ledger contents'
[[ "$(grep -c '|applied$' <<<"$task_after_pre_m11")" == 10 ]] || fail 'pre-M11 replay changed the authenticated Task 168 subset'
! grep -q "^$M11_NAME|" <<<"$task_after_pre_m11" || fail 'M11 appeared before the explicit M11 step'
cp -R "$MIGRATION_ROOT/$M11_NAME" "$STAGE/prisma/migrations/$M11_NAME"
run_tool "migrate deploy --schema /task168/prisma/schema.prisma" >"$LOG_DIR/m11.stdout" || fail 'M11 migration failed'
run_tool "migrate status --schema /task168/prisma/schema.prisma" >"$LOG_DIR/status.stdout" || fail 'post-M11 migration status failed'
ledger_after="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -U "$DB_USER" -d "$DB_NAME" -c "$ledger_query")" || fail 'post-M11 full ledger query failed'
task_after="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -U "$DB_USER" -d "$DB_NAME" -c "$task_ledger_query")" || fail 'post-M11 Task 168 ledger query failed'
classification_after="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -U "$DB_USER" -d "$DB_NAME" -c "$ledger_classification_query")" || fail 'post-M11 migration classification query failed'
resolved_after_raw="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -F $'\t' -U "$DB_USER" -d "$DB_NAME" -c "$resolved_attempts_query")" || fail 'post-M11 resolved migration attempt query failed'
resolved_after_json="$(resolved_attempts_json <<<"$resolved_after_raw")"
resolved_after_pipe="$(resolved_attempts_pipe <<<"$resolved_after_json")"
[[ "$resolved_after_pipe" == "$RESOLVED_ATTEMPTS_PIPE" && "$(printf '%s' "$resolved_after_pipe" | sha256sum | awk '{print $1}')" == "$RESOLVED_ATTEMPTS_SHA" ]] || fail 'M11 changed resolved migration attempt snapshot'
IFS=$'\t' read -r unresolved_after unclassified_after resolved_after active_after <<<"$classification_after"
[[ "$unresolved_after" == 0 && "$unclassified_after" == 0 && "$resolved_after" == "$RESOLVED_ATTEMPTS_EXPECTED_COUNT" ]] || fail 'M11 changed migration attempt classification'
printf '%s\n' "$ledger_after" > "$LOG_DIR/ledger-after.txt"
printf '%s\n' "$task_after" > "$LOG_DIR/task-ledger-after.txt"
printf '%s\n' "$classification_after" > "$LOG_DIR/ledger-classification-after.txt"
printf '%s\n' "$resolved_after_json" > "$LOG_DIR/resolved-migration-attempts-after.json"
[[ "$(grep -c '|' <<<"$ledger_after")" == "$((total_before + 1))" ]] || fail 'M11 did not add exactly one complete-ledger row'
ledger_matches_history "$LOG_DIR/ledger-after.txt" "$(cat "$FULL_MIGRATIONS_JSON")" || fail 'post-M11 complete ledger does not exactly match full history'
[[ "$(grep -c '|applied$' <<<"$task_after")" == 11 ]] || fail 'post-M11 Task 168 subset is not exactly eleven applied migrations'
[[ "$(grep -c "^${M11_NAME}|${M11_SHA_EXPECTED}|applied$" <<<"$task_after")" == 1 ]] || fail 'M11 checksum/status is not authenticated'

catalog_sql="SELECT json_build_object('legacyTables',(SELECT count(*) FROM (VALUES ('v1_tournament_fixtures'),('v1_tournament_fixture_results'),('v1_tournament_fixture_goals'),('v1_tournament_fixture_videos'),('v1_tournament_fixture_advancement_edges')) x(name) WHERE to_regclass(x.name) IS NOT NULL),'legacyLinkColumns',(SELECT count(*) FROM information_schema.columns WHERE (table_name,column_name) IN (('v1_games','tournament_fixture_id'),('v1_tournament_staff_fixture_scopes','fixture_id'),('v1_operation_audits','fixture_id'))),'retirementTriggers',(SELECT count(*) FROM pg_trigger WHERE tgname IN ('v1_tournament_fixture_retired_write','v1_tournament_fixture_retired_row_write','v1_000_tournament_fixture_retired_link') AND NOT tgisinternal),'retirementFunctions',(SELECT count(*) FROM pg_proc WHERE proname IN ('v1_reject_retired_tournament_fixture_write','v1_reject_retired_tournament_fixture_link')));"
catalog_after="$(docker exec "$DB" psql -X -v ON_ERROR_STOP=1 -At -U "$DB_USER" -d "$DB_NAME" -c "$catalog_sql")" || fail 'post-M11 catalog query failed'
printf '%s\n' "$catalog_after" > "$LOG_DIR/catalog-after.json"
jq -e '(.legacyTables==0 and .legacyLinkColumns==0 and .retirementTriggers==0 and .retirementFunctions==0)' <<<"$catalog_after" >/dev/null || fail 'post-M11 catalog still contains retired objects'

mkdir -p "$(dirname "$REPORT")" "$(dirname "$RECEIPT")"
mkdir -m 700 "$EVIDENCE_TMP"
for evidence in historical-migrations.json ledger-before.txt task-ledger-before.txt ledger-classification-before.txt resolved-migration-attempts-before.json ledger-after-pre-m11.txt task-ledger-after-pre-m11.txt ledger-classification-after-pre-m11.txt resolved-migration-attempts-after-pre-m11.json ledger-after.txt task-ledger-after.txt ledger-classification-after.txt resolved-migration-attempts-after.json catalog-after.json api-client-validate.stdout api-image-schema-attestation.stdout image-attestation.json m11.stdout status.stdout; do
  cp "$LOG_DIR/$evidence" "$EVIDENCE_TMP/$evidence"
done
cp "$MIGRATION_ROOT/migration_lock.toml" "$EVIDENCE_TMP/migration_lock.toml"
cp "$INPUT_SNAPSHOT" "$EVIDENCE_TMP/input-snapshot.json"
cp "$STAGE_A_TRANSITION" "$EVIDENCE_TMP/stage-a-transition.json"
cp "$STAGE_A_BACKUP_RECEIPT" "$EVIDENCE_TMP/stage-a-backup-receipt.json"
chmod -R go-rwx "$EVIDENCE_TMP"
cleanup_owned || fail 'owned rehearsal resources were not fully cleaned up'
cleanup_tmp="${CLEANUP_RECORD}.tmp.${RUN_ID}"
jq -n --arg network "$NETWORK" --arg volume "$VOLUME" --arg database "$DB" --arg status COMPLETED --arg completedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{schemaVersion:1,status:$status,network:$network,volume:$volume,databaseContainer:$database,completedAt:$completedAt}' > "$cleanup_tmp"
chmod 600 "$cleanup_tmp"; mv "$cleanup_tmp" "$CLEANUP_RECORD"
cleanup_sha="$(sha256 "$CLEANUP_RECORD")"
mv "$EVIDENCE_TMP" "$EVIDENCE_DIR"
report_evidence_json="$(jq -n \
  --arg dir "$EVIDENCE_DIR" \
  --arg migrationLock "${EVIDENCE_DIR}/migration_lock.toml" --arg migrationLockSha "$(sha256 "$EVIDENCE_DIR/migration_lock.toml")" \
  --arg resolvedAttempts "${EVIDENCE_DIR}/resolved-migration-attempts-before.json" --arg resolvedAttemptsSha "$RESOLVED_ATTEMPTS_SHA" \
  --arg history "${EVIDENCE_DIR}/historical-migrations.json" --arg historySha "$(sha256 "$EVIDENCE_DIR/historical-migrations.json")" \
  --arg ledgerBefore "${EVIDENCE_DIR}/ledger-before.txt" --arg ledgerBeforeSha "$(sha256 "$EVIDENCE_DIR/ledger-before.txt")" \
  --arg taskBefore "${EVIDENCE_DIR}/task-ledger-before.txt" --arg taskBeforeSha "$(sha256 "$EVIDENCE_DIR/task-ledger-before.txt")" \
  --arg ledgerAfterPreM11 "${EVIDENCE_DIR}/ledger-after-pre-m11.txt" --arg ledgerAfterPreM11Sha "$(sha256 "$EVIDENCE_DIR/ledger-after-pre-m11.txt")" \
  --arg taskAfterPreM11 "${EVIDENCE_DIR}/task-ledger-after-pre-m11.txt" --arg taskAfterPreM11Sha "$(sha256 "$EVIDENCE_DIR/task-ledger-after-pre-m11.txt")" \
  --arg ledgerAfter "${EVIDENCE_DIR}/ledger-after.txt" --arg ledgerAfterSha "$(sha256 "$EVIDENCE_DIR/ledger-after.txt")" \
  --arg taskAfter "${EVIDENCE_DIR}/task-ledger-after.txt" --arg taskAfterSha "$(sha256 "$EVIDENCE_DIR/task-ledger-after.txt")" \
  --arg catalog "${EVIDENCE_DIR}/catalog-after.json" --arg catalogSha "$(sha256 "$EVIDENCE_DIR/catalog-after.json")" \
  --arg apiClient "${EVIDENCE_DIR}/api-client-validate.stdout" --arg apiClientSha "$(sha256 "$EVIDENCE_DIR/api-client-validate.stdout")" \
  --arg apiAttestation "${EVIDENCE_DIR}/image-attestation.json" --arg apiAttestationSha "$(sha256 "$EVIDENCE_DIR/image-attestation.json")" \
  --arg m11 "${EVIDENCE_DIR}/m11.stdout" --arg m11Sha "$(sha256 "$EVIDENCE_DIR/m11.stdout")" \
  --arg status "${EVIDENCE_DIR}/status.stdout" --arg statusSha "$(sha256 "$EVIDENCE_DIR/status.stdout")" \
  '{directory:$dir,migrationLock:{path:$migrationLock,sha256:$migrationLockSha},resolvedMigrationAttempts:{path:$resolvedAttempts,sha256:$resolvedAttemptsSha},historicalMigrationInventory:{path:$history,sha256:$historySha},ledger:{before:{path:$ledgerBefore,sha256:$ledgerBeforeSha},taskBefore:{path:$taskBefore,sha256:$taskBeforeSha},afterPreM11:{path:$ledgerAfterPreM11,sha256:$ledgerAfterPreM11Sha},taskAfterPreM11:{path:$taskAfterPreM11,sha256:$taskAfterPreM11Sha},after:{path:$ledgerAfter,sha256:$ledgerAfterSha},taskAfter:{path:$taskAfter,sha256:$taskAfterSha}},catalog:{path:$catalog,sha256:$catalogSha},apiClientValidation:{path:$apiClient,sha256:$apiClientSha},apiImageAttestation:{path:$apiAttestation,sha256:$apiAttestationSha},m11Stdout:{path:$m11,sha256:$m11Sha},migrationStatusStdout:{path:$status,sha256:$statusSha}}')"

report_tmp="${REPORT}.tmp.${RUN_ID}"
jq -n \
  --arg sourceSha "$SOURCE_SHA" --arg schemaSha "$SCHEMA_SHA" --arg lockSha "$MIGRATION_LOCK_SHA" \
  --arg api "$API_IMAGE" --arg web "$WEB_IMAGE" --arg tool "$TOOL_IMAGE" \
  --arg inputSnapshot "$INPUT_SNAPSHOT_SHA" --arg fullHistorySha "$FULL_HISTORY_SHA" --arg resolvedAttemptsSha "$RESOLVED_ATTEMPTS_SHA" \
  --arg report "$REPORT" --argjson migrations "$(cat "$MIGRATIONS_JSON")" --argjson fullHistory "$(cat "$FULL_MIGRATIONS_JSON")" --argjson resolvedAttempts "$RESOLVED_ATTEMPTS_CANONICAL" \
  --argjson evidence "$report_evidence_json" --arg cleanup "$CLEANUP_RECORD" --arg cleanupSha "$cleanup_sha" \
  '{schemaVersion:1,kind:"task168FinalImagePreflight",status:"COMPLETED",sourceSha256:$sourceSha,schemaSha256:$schemaSha,apiImage:$api,webImage:$web,cutoverToolImage:$tool,inputSnapshot:{kind:"task168-stageB-inputs",sha256:$inputSnapshot},harness:{sourceSha256:$sourceSha,schemaSha256:$schemaSha,migrationLockSha256:$lockSha,resolvedMigrationAttemptsSha256:$resolvedAttemptsSha,resolvedMigrationAttempts:$resolvedAttempts,migrationHashes:($migrations|map({name,sha256})),fullMigrationHistory:$fullHistory},migrations:($migrations|map({name,sha256})),fullMigrationHistory:$fullHistory,fullMigrationHistorySha256:$fullHistorySha,resolvedMigrationAttemptsSha256:$resolvedAttemptsSha,status:"COMPLETED",catalog:{legacyTables:0,legacyLinkColumns:0,retirementTriggers:0,retirementFunctions:0,evidence:$evidence.catalog},ledger:{count:11,m11OnlyNew:true,applied:($migrations|map(.name)),evidence:$evidence.ledger},execution:{status:"COMPLETED",cleanupStatus:"COMPLETED",imageAttestation:$evidence.apiImageAttestation},rehearsal:{status:"COMPLETED",postM11:true,report:$report,reportSha256:null,catalog:{legacyTables:0,legacyLinkColumns:0,retirementTriggers:0,retirementFunctions:0},ledger:{count:11,m11OnlyNew:true},fullLedger:{applied:($fullHistory|map(.name))}},cleanup:{status:"COMPLETED",record:$cleanup,recordSha256:$cleanupSha}}' > "$report_tmp"
chmod 600 "$report_tmp"; mv "$report_tmp" "$REPORT"
report_sha="$(sha256 "$REPORT")"

receipt_tmp="${RECEIPT}.tmp.${RUN_ID}"
jq -n \
  --arg release "$RELEASE_SHA" --arg sourceSha "$SOURCE_SHA" --arg schemaSha "$SCHEMA_SHA" --arg lockSha "$MIGRATION_LOCK_SHA" \
  --arg inputSnapshot "$INPUT_SNAPSHOT_SHA" --arg fullHistorySha "$FULL_HISTORY_SHA" --arg resolvedAttemptsSha "$RESOLVED_ATTEMPTS_SHA" \
  --arg backupSha "$BACKUP_SHA" --arg api "$API_IMAGE" --arg web "$WEB_IMAGE" --arg tool "$TOOL_IMAGE" \
  --argjson backupBytes "$BACKUP_BYTES" --arg stageARelease "$STAGE_A_RELEASE_SHA" --arg stageASchema "$STAGE_A_SCHEMA_SHA" --arg databaseIdentity "$DATABASE_IDENTITY" --arg transitionSha "$STAGE_A_TRANSITION_SHA" --arg backupReceiptSha "$STAGE_A_BACKUP_RECEIPT_SHA" \
  --arg report "$REPORT" --arg reportSha "$report_sha" --arg cleanup "$CLEANUP_RECORD" --arg cleanupSha "$cleanup_sha" \
  --argjson migrations "$(cat "$MIGRATIONS_JSON")" --argjson fullHistory "$(cat "$FULL_MIGRATIONS_JSON")" --argjson resolvedAttempts "$RESOLVED_ATTEMPTS_CANONICAL" \
  --argjson evidence "$report_evidence_json" \
  '{schemaVersion:1,kind:"task168FinalImagePreflight",status:"COMPLETED",releaseSha:$release,sourceSha256:$sourceSha,schemaSha256:$schemaSha,apiImage:$api,webImage:$web,cutoverToolImage:$tool,backup:{format:"plain-sql-gzip",sha256:$backupSha,bytes:$backupBytes,stageAReleaseSha:$stageARelease,stageASchemaSha256:$stageASchema,databaseIdentity:$databaseIdentity,transitionReceiptSha256:$transitionSha,backupReceiptSha256:$backupReceiptSha},backupSha256:$backupSha,inputSnapshot:{kind:"task168-stageB-inputs",sha256:$inputSnapshot},harness:{sourceSha256:$sourceSha,schemaSha256:$schemaSha,migrationLockSha256:$lockSha,resolvedMigrationAttemptsSha256:$resolvedAttemptsSha,resolvedMigrationAttempts:$resolvedAttempts,migrationHashes:($migrations|map({name,sha256})),fullMigrationHistory:$fullHistory},fullMigrationHistory:$fullHistory,fullMigrationHistorySha256:$fullHistorySha,resolvedMigrationAttemptsSha256:$resolvedAttemptsSha,execution:{status:"COMPLETED",cleanupStatus:"COMPLETED",imageAttestation:$evidence.apiImageAttestation},rehearsal:{status:"COMPLETED",postM11:true,report:$report,reportSha256:$reportSha,catalog:{legacyTables:0,legacyLinkColumns:0,retirementTriggers:0,retirementFunctions:0},ledger:{count:11,m11OnlyNew:true,applied:($migrations|map(.name))},fullLedger:{applied:($fullHistory|map(.name))}},cleanup:{status:"COMPLETED",record:$cleanup,recordSha256:$cleanupSha}}' > "$receipt_tmp"
chmod 600 "$receipt_tmp"; mv "$receipt_tmp" "$RECEIPT"
printf '%s\n' "[task168-final-image-preflight] completed report=$REPORT receipt=$RECEIPT"
