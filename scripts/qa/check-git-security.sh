#!/usr/bin/env bash
set -euo pipefail

# ICTIS SMR261116 / upstream Git 2.56.1 release notes.
# Check the executed binary; an installed-but-unused package is not evidence.
version="$(git --version)"
if [[ ! "$version" =~ ^git\ version\ ([0-9]+)\.([0-9]+)\.([0-9]+)(\.windows\.[0-9]+)?$ ]]; then
  echo "Cannot verify Git version: $version. Use a stable patched Git build." >&2
  exit 1
fi
major=$((10#${BASH_REMATCH[1]}))
minor=$((10#${BASH_REMATCH[2]}))
patch=$((10#${BASH_REMATCH[3]}))
minimum=1
case "$major.$minor" in
  2.50) minimum=2 ;;
  2.51) minimum=3 ;;
  2.52|2.53|2.54|2.55|2.56) minimum=1 ;;
  *)
    if (( major > 2 || (major == 2 && minor > 56) )); then minimum=0;
    else
      echo "Unsupported Git release line: $version. Install a stable patched Git 2.50.2 or newer maintained line." >&2
      exit 1
    fi ;;
esac
if (( patch < minimum )); then
  echo "Git security FAIL: $version. Install 2.56.1+ or patched 2.50.2/2.51.3/2.52.1/2.53.1/2.54.1/2.55.1 (CVE-2026-111760, CVE-2026-105437)." >&2
  echo "For distro backports, retain the vendor advisory and package evidence for operator review; this gate does not silently accept an unverified backport." >&2
  exit 1
fi
echo "Git security PASS: $version"
