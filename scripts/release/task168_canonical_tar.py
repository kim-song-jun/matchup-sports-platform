"""Deterministic ustar/PAX tar (+gzip) serializer shared by the Task 168
source packager and its preflight self-check. One implementation removes the
gap a Python-version-specific `tarfile` internal (pax header layout, field
padding) could otherwise open between "what the packager wrote" and "what a
second parser thinks it wrote".

Every header field this module writes is fixed: mtime/uid/gid=0, uname/gname
empty, devmajor/devminor all-NUL, ustar magic, empty ustar prefix. The only
per-member inputs are name, typeflag ('0' regular file or '5' directory),
mode, and (for files) content. A name that is not pure ASCII or does not fit
the 100-byte ustar name field gets exactly one preceding pax ('x') header
carrying a single `path` record -- the same trigger condition CPython's own
PAX_FORMAT writer uses, reimplemented here so nothing depends on tarfile.
"""
import gzip
import io
import os
import zlib

BLOCKSIZE = 512
RECORDSIZE = BLOCKSIZE * 20
USTAR_MAGIC = b"ustar\x0000"


def _octal_field(value, width):
    digits = width - 1
    text = ("%0*o" % (digits, value)).encode("ascii")
    if len(text) > digits:
        raise ValueError("value %d does not fit an octal field of width %d" % (value, width))
    return text + b"\x00"


def header_block(name_bytes, size, mode, typeflag):
    header = bytearray(BLOCKSIZE)
    header[0:min(100, len(name_bytes))] = name_bytes[:100]
    header[100:108] = _octal_field(mode, 8)
    header[108:116] = _octal_field(0, 8)  # uid
    header[116:124] = _octal_field(0, 8)  # gid
    header[124:136] = _octal_field(size, 12)
    header[136:148] = _octal_field(0, 12)  # mtime
    header[148:156] = b" " * 8  # chksum placeholder for the checksum pass
    header[156:157] = typeflag
    header[257:265] = USTAR_MAGIC
    # linkname (157:257), uname (265:297), gname (297:329),
    # devmajor (329:337), devminor (337:345), prefix (345:500) all stay NUL.
    checksum = sum(header)
    header[148:156] = ("%06o" % checksum).encode("ascii") + b"\x00 "
    return bytes(header)


def _pax_record(key, value_bytes):
    payload = key.encode("ascii") + b"=" + value_bytes + b"\n"
    length = len(payload) + 2
    while True:
        candidate = len(str(length)) + 1 + len(payload)
        if candidate == length:
            break
        length = candidate
    return ("%d " % length).encode("ascii") + payload


def pax_header_block(name_bytes):
    """One complete pax ('x') extended-header member carrying a single
    `path` record for name_bytes. Exposed (not just used internally by
    canonical_tar_bytes) because building an intentionally non-canonical
    fixture -- e.g. two of these back to back -- needs the same exact bytes
    canonical_tar_bytes would emit for one, with no well-formed public API
    that produces a malformed sequence on purpose."""
    record = _pax_record("path", name_bytes)
    block = header_block(b"pax_header", len(record), 0o644, b"x")
    pad = (-len(record)) % BLOCKSIZE
    return block + record + b"\x00" * pad


def encode_member(name, typeflag, mode, data):
    """The exact bytes canonical_tar_bytes emits for one member: an optional
    preceding pax header plus its ustar header and (padded) payload. Exposed
    on its own so a caller can concatenate a run of clean members with
    hand-crafted malformed bytes to build a fixture that is deliberately
    *not* canonical form.

    typeflag is b'0' (regular file; data is its exact content) or b'5'
    (directory; data must be empty). A directory's on-the-wire name always
    carries exactly one trailing '/', appended here if the caller omitted it,
    so callers can pass the same stripped name they use for path-policy
    checks elsewhere.
    """
    if typeflag not in (b"0", b"5"):
        raise ValueError("unsupported typeflag %r for member %s" % (typeflag, name))
    if typeflag == b"5":
        if data:
            raise ValueError("directory member must carry no data: %s" % name)
        wire_name = name if name.endswith("/") else name + "/"
    else:
        wire_name = name
    name_bytes = wire_name.encode("utf-8", "surrogateescape")
    if any(b < 0x20 for b in name_bytes):
        # A control byte (NUL included) never has a legitimate use in a real
        # path, and without this a name short and ASCII enough to skip the
        # pax path below would otherwise round-trip through this function
        # unchanged -- making the canonical-form identity check an
        # accidental backstop for this shape rather than a guaranteed one.
        raise ValueError("member name contains a control byte: %r" % name)
    needs_pax = len(name_bytes) > 100 or any(b > 0x7F for b in name_bytes)
    out = pax_header_block(name_bytes) if needs_pax else b""
    out += header_block(name_bytes[:100], len(data), mode, typeflag)
    out += data
    out += b"\x00" * ((-len(data)) % BLOCKSIZE)
    return out


def end_of_archive_marker():
    """The two all-NUL blocks that terminate a tar body, before RECORDSIZE
    padding. Exposed so a fixture built from encode_member() calls (or
    otherwise deliberately not canonical) can be closed out the same way
    canonical_tar_bytes closes a well-formed one."""
    return b"\x00" * (2 * BLOCKSIZE)


def canonical_tar_bytes(members):
    """members: ordered iterable of (name: str, typeflag: bytes, mode: int, data: bytes).
    See encode_member() for the per-member contract."""
    out = bytearray()
    for member in members:
        out += encode_member(*member)
    out += end_of_archive_marker()
    out += b"\x00" * ((-len(out)) % RECORDSIZE)
    return bytes(out)


def canonical_gzip_bytes(tar_bytes, compresslevel=9):
    """Deterministic gzip wrapper: no filename, mtime=0, fixed compression
    level, so the only source of byte variance left is zlib itself."""
    buf = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buf, mtime=0, compresslevel=compresslevel) as gz:
        gz.write(tar_bytes)
    return buf.getvalue()


def decompress_single_gzip_member(data):
    """Decompress exactly one gzip member and return its payload. zlib's
    auto-header decompressor validates the member's own CRC32/ISIZE trailer
    as part of reaching eof, so anything left in `unused_data` is genuinely
    outside that member -- a second concatenated member and arbitrary
    trailing garbage are rejected identically, since the packager never
    emits more than one member."""
    decompressor = zlib.decompressobj(zlib.MAX_WBITS | 16)
    try:
        payload = decompressor.decompress(data)
    except zlib.error as exc:
        raise ValueError("is not a valid gzip stream: %s" % exc) from exc
    if not decompressor.eof:
        raise ValueError("is truncated or malformed")
    if decompressor.unused_data:
        raise ValueError("contains trailing bytes after the gzip stream")
    return payload


def collect_members(base_dir, names):
    """Recursively walk each of `names` (a file or directory, relative to
    base_dir) into an ordered canonical_tar_bytes members list. Rejects a
    symlink or anything else that is neither a regular file nor a directory
    -- a caller that needs one of those for a fixture builds it by hand
    instead of asking this walker to invent a byte representation for it."""
    members = []

    def add(rel):
        path = os.path.join(base_dir, rel)
        if os.path.islink(path):
            raise ValueError("collect_members does not support symlinks: %s" % rel)
        if os.path.isdir(path):
            members.append((rel, b"5", 0o755, b""))
            for child in sorted(os.listdir(path)):
                add(rel + "/" + child)
        elif os.path.isfile(path):
            with open(path, "rb") as fh:
                data = fh.read()
            mode = 0o755 if (os.stat(path).st_mode & 0o111) else 0o644
            members.append((rel, b"0", mode, data))
        else:
            raise ValueError("collect_members does not support this member type: %s" % rel)

    for name in names:
        add(name)
    return members
