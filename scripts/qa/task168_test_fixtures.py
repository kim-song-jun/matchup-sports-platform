"""Test-only fixture builder for the Task 168 StageB preflight sidecar
contract tests. Not imported by any operational release script -- the real
packager (scripts/release/package-task168-final-source.sh) builds its own
member list against files.list rather than a directory walk.
"""
import os


def collect_members(base_dir, names):
    """Recursively walk each of `names` (a file or directory, relative to
    base_dir) into an ordered canonical_tar_bytes members list of regular
    files only. Emits no directory member: the real packager's member list
    comes from `find -type f`, so a directory the packager can never produce
    would let a "golden" fixture built here diverge from what the walker it
    exercises actually authorizes. Rejects a symlink or anything else that
    is neither a regular file nor a directory -- a caller that needs one of
    those for a fixture builds it by hand instead of asking this walker to
    invent a byte representation for it."""
    members = []

    def add(rel):
        path = os.path.join(base_dir, rel)
        if os.path.islink(path):
            raise ValueError("collect_members does not support symlinks: %s" % rel)
        if os.path.isdir(path):
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


def add_tar_members(tar, base_dir, rel, filter=None):
    """Add every regular file under `rel` (relative to base_dir) to an open
    tarfile.TarFile, recursively and in sorted order, without ever calling
    tar.add() on a directory itself -- tarfile.TarFile.add() emits a
    directory member by default, which the real packager never produces.
    `filter` is the same per-member callback TarFile.add() accepts."""
    path = os.path.join(base_dir, rel)
    if os.path.isdir(path):
        for child in sorted(os.listdir(path)):
            add_tar_members(tar, base_dir, rel + "/" + child, filter=filter)
    else:
        tar.add(path, arcname=rel, filter=filter, recursive=False)
