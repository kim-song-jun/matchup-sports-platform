#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
cat > "$scratch/git" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$TEST_GIT_VERSION"
MOCK
chmod +x "$scratch/git"
passed=0
for version in 2.50.2 2.51.3 2.52.1 2.53.1 2.54.1 2.55.1 2.56.1 2.56.1.windows.1 2.57.0; do
  PATH="$scratch:$PATH" TEST_GIT_VERSION="git version $version" bash "$root/scripts/qa/check-git-security.sh" >/dev/null
  passed=$((passed+1))
done
for version in 2.49.9 2.50.1 2.51.2 2.52.0 2.53.0 2.54.0 2.55.0 2.56.0 2.56.1-rc1 garbage; do
  if PATH="$scratch:$PATH" TEST_GIT_VERSION="git version $version" bash "$root/scripts/qa/check-git-security.sh" >/dev/null 2>&1; then
    echo "Vulnerable/unverifiable Git accepted: $version" >&2
    exit 1
  fi
  passed=$((passed+1))
done
# Verified Amazon Linux backports must pass; old, modified and foreign
# packages must fail even when the upstream version string is identical.
cat > "$scratch/rpm" <<'MOCK'
#!/usr/bin/env bash
if [[ "$1" == -qf ]]; then printf '%s' "$TEST_RPM_PACKAGE"; exit 0; fi
if [[ "$1" == -V && "$2" == git-core ]]; then exit "$TEST_RPM_VERIFY"; fi
exit 1
MOCK
chmod +x "$scratch/rpm"
for release in 2 3; do
  PATH="$scratch:$PATH" TEST_GIT_VERSION='git version 2.50.1' \
    TEST_RPM_PACKAGE="git-core|2.50.1|1.amzn2023.0.$release|Amazon Linux" TEST_RPM_VERIFY=0 \
    bash "$root/scripts/qa/check-git-security.sh" >/dev/null
  passed=$((passed+1))
done
for package in 'git-core|2.50.1|1.amzn2023.0.1|Amazon Linux' 'git-core|2.50.1|1.amzn2023.0.2|Other Vendor' 'git|2.50.1|1.amzn2023.0.2|Amazon Linux'; do
  if PATH="$scratch:$PATH" TEST_GIT_VERSION='git version 2.50.1' \
      TEST_RPM_PACKAGE="$package" TEST_RPM_VERIFY=0 \
      bash "$root/scripts/qa/check-git-security.sh" >/dev/null 2>&1; then
    echo "Unverified backport accepted: $package" >&2; exit 1
  fi
  passed=$((passed+1))
done
if PATH="$scratch:$PATH" TEST_GIT_VERSION='git version 2.50.1' \
    TEST_RPM_PACKAGE='git-core|2.50.1|1.amzn2023.0.2|Amazon Linux' TEST_RPM_VERIFY=1 \
    bash "$root/scripts/qa/check-git-security.sh" >/dev/null 2>&1; then
  echo 'Modified RPM accepted' >&2; exit 1
fi
passed=$((passed+1))
# A missing or broken Git executable must fail, not report success.
printf '#!/usr/bin/env bash\nexit 127\n' > "$scratch/git"
if PATH="$scratch:$PATH" bash "$root/scripts/qa/check-git-security.sh" >/dev/null 2>&1; then
  echo 'Missing Git accepted' >&2; exit 1
fi
echo "Git security contracts PASS: $((passed+1)) cases"
