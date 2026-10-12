#!/usr/bin/env bash
set -Eeuo pipefail

app="${1:?usage: audit-built-crypto.sh path/to/Teameet.app}"
[[ -d "${app}" ]] || { echo "App bundle is missing" >&2; exit 1; }
executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "${app}/Info.plist")
binary="${app}/${executable}"
[[ -f "${binary}" ]] || { echo "App executable is missing" >&2; exit 1; }

echo '=== Built app encryption declaration ==='
/usr/libexec/PlistBuddy -c 'Print :ITSAppUsesNonExemptEncryption' "${app}/Info.plist"
echo '=== Linked libraries ==='
xcrun otool -L "${binary}"
echo '=== Imported OS crypto symbols ==='
# No match is itself useful audit evidence, not a failed command hidden as success.
symbols=$(xcrun nm -u "${binary}")
printf '%s\n' "${symbols}" | awk '/CryptoKit|_CCCrypt|_CCKeyDerivation|_CC_SHA|_SecItem/ { print; found=1 } END { if (!found) print "No matching symbols; review linked libraries and source audit." }'
echo '=== Embedded frameworks ==='
if [[ -d "${app}/Frameworks" ]]; then
  find "${app}/Frameworks" -maxdepth 1 -mindepth 1 -type d -name '*.framework' -print
else
  echo 'No embedded Frameworks directory (SDKs may be statically linked).'
fi
