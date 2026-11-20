#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
cat > "$scratch/curl" <<'MOCK'
#!/usr/bin/env bash
while (( $# )); do
  if [[ "$1" == --output ]]; then
    printf 'echo compromised\n' > "$2"
    exit 0
  fi
  shift
done
exit 1
MOCK
cat > "$scratch/sudo" <<'MOCK'
#!/usr/bin/env bash
touch "$TEST_EXECUTION_MARKER"
MOCK
chmod +x "$scratch/curl" "$scratch/sudo"
if PATH="$scratch:$PATH" TEST_EXECUTION_MARKER="$scratch/executed" \
    bash "$root/deploy/configure-nodesource-22.sh" > "$scratch/result" 2>&1; then
  echo 'Untrusted installer unexpectedly accepted' >&2; exit 1
fi
if [[ -e "$scratch/executed" ]]; then
  echo 'Untrusted installer executed with sudo' >&2; exit 1
fi
grep -q 'FAILED' "$scratch/result"
echo 'NodeSource integrity PASS: modified payload rejected before sudo'
