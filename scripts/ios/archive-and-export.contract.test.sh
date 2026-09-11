#!/usr/bin/env bash
set -euo pipefail

# Stubbed contract harness. It never archives, signs, uploads, or contacts Apple.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_SCRIPT="$ROOT_DIR/scripts/ios/archive-and-export.sh"
[[ -f "$SOURCE_SCRIPT" ]] || { echo "missing source script: $SOURCE_SCRIPT" >&2; exit 1; }

WORK="$(mktemp -d)"
cleanup() {
  local status=$?
  if [[ "$status" -ne 0 ]]; then
    for output in "$WORK"/*.out; do [[ -f "$output" ]] && { echo "--- ${output##*/}" >&2; cat "$output" >&2; }; done
    [[ -f "$WORK/xcodebuild.log" ]] && { echo '--- xcodebuild.log' >&2; cat "$WORK/xcodebuild.log" >&2; }
  fi
  rm -rf "$WORK"
  exit "$status"
}
trap cleanup EXIT
mkdir -p "$WORK/repo/scripts/ios" "$WORK/repo/scripts/release" "$WORK/repo/apps/v1_ios" "$WORK/bin"
cp "$SOURCE_SCRIPT" "$WORK/repo/scripts/ios/archive-and-export.sh"
chmod +x "$WORK/repo/scripts/ios/archive-and-export.sh"
printf 'versionName=0.0.0-contract\nversionCode=1\n' > "$WORK/repo/apps/v1_ios/version.properties"
printf '#!/usr/bin/env bash\nset -euo pipefail\n' > "$WORK/repo/scripts/release/generate-ios-version-xcconfig.sh"
chmod +x "$WORK/repo/scripts/release/generate-ios-version-xcconfig.sh"

cat > "$WORK/bin/xcodegen" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
EOF
cat > "$WORK/bin/xcodebuild" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${CONTRACT_XCODEBUILD_LOG:?}"
if [[ "$*" == *"-exportArchive"* ]]; then
  export_path=''
  previous=''
  for argument in "$@"; do
    if [[ "$previous" == '-exportPath' ]]; then export_path="$argument"; fi
    previous="$argument"
  done
  mkdir -p "$export_path"
  fake="$(mktemp -d)"
  mkdir -p "$fake/Payload/Wrong.app"
  cat > "$fake/Payload/Wrong.app/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${CONTRACT_BUNDLE_ID:-kr.co.wrong}</string></dict></plist>
PLIST
  (cd "$fake" && zip -qr "$export_path/wrong.ipa" Payload)
  rm -rf "$fake"
fi
EOF
cat > "$WORK/bin/codesign" <<'EOF'
#!/usr/bin/env bash
cat <<'PLIST'
<plist><dict>
<key>aps-environment</key><string>production</string>
<key>com.apple.developer.associated-domains</key><array/>
<key>com.apple.developer.applesignin</key><array/>
</dict></plist>
PLIST
EOF
cat > "$WORK/bin/xcrun" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >"${CONTRACT_ALTOOL_SENTINEL:?}"
exit 99
EOF
chmod +x "$WORK/bin/xcodegen" "$WORK/bin/xcodebuild" "$WORK/bin/codesign" "$WORK/bin/xcrun"

run_rejected_override() {
  local label="$1" variable="$2" value="$3"
  : > "$WORK/xcodebuild.log"
  if env PATH="$WORK/bin:$PATH" CONTRACT_XCODEBUILD_LOG="$WORK/xcodebuild.log" \
    TEAMEET_ARCHIVE_SCHEME=TeameetProduction "$variable=$value" \
    "$WORK/repo/scripts/ios/archive-and-export.sh" --upload >"$WORK/$label.out" 2>&1; then
    echo "$label unexpectedly succeeded" >&2
    exit 1
  fi
  grep -q 'do not match scheme TeameetProduction' "$WORK/$label.out"
  [[ ! -s "$WORK/xcodebuild.log" ]]
}

run_rejected_override wrong_configuration TEAMEET_ARCHIVE_CONFIGURATION 'Alpha Release'
run_rejected_override wrong_profile TEAMEET_PROFILE_NAME 'Teameet Alpha App Store'

run_correct_mapping() {
  local scheme="$1" configuration="$2" profile="$3" expected_bundle_id="$4"
  : > "$WORK/xcodebuild.log"
  set +e
  env PATH="$WORK/bin:$PATH" CONTRACT_XCODEBUILD_LOG="$WORK/xcodebuild.log" \
    CONTRACT_BUNDLE_ID="$expected_bundle_id" TEAMEET_ARCHIVE_SCHEME="$scheme" TEAMEET_ARCHIVE_OUTPUT="$WORK/$scheme" \
    "$WORK/repo/scripts/ios/archive-and-export.sh" >"$WORK/$scheme.out" 2>&1
  local status=$?
  set -e
  [[ "$status" -eq 0 ]]
  grep -q -- "-scheme $scheme" "$WORK/xcodebuild.log"
  grep -q -- "-configuration $configuration" "$WORK/xcodebuild.log"
  grep -q -- "PROVISIONING_PROFILE_SPECIFIER=$profile" "$WORK/xcodebuild.log"
}

run_correct_mapping TeameetAlpha 'Alpha Release' 'Teameet Alpha App Store' 'kr.co.teameet.alpha'
run_correct_mapping TeameetProduction 'Production Release' 'Teameet Production App Store' 'kr.co.teameet'

: > "$WORK/alttool.sentinel"
: > "$WORK/fake-key.p8"
if env PATH="$WORK/bin:$PATH" CONTRACT_XCODEBUILD_LOG="$WORK/xcodebuild.log" \
  CONTRACT_ALTOOL_SENTINEL="$WORK/alttool.sentinel" CONTRACT_BUNDLE_ID=kr.co.wrong \
  TEAMEET_ARCHIVE_SCHEME=TeameetProduction TEAMEET_ARCHIVE_OUTPUT="$WORK/wrong-export" APP_STORE_CONNECT_KEY_ID=fake \
  APP_STORE_CONNECT_ISSUER_ID=fake APP_STORE_CONNECT_KEY_FILE="$WORK/fake-key.p8" \
  "$WORK/repo/scripts/ios/archive-and-export.sh" --upload >"$WORK/wrong-export.out" 2>&1; then
  echo 'wrong exported bundle unexpectedly succeeded' >&2
  exit 1
fi
grep -q 'exported bundle id' "$WORK/wrong-export.out"
[[ ! -s "$WORK/alttool.sentinel" ]]

# Positive upload control: all gates pass and only the stubbed altool is reached.
set +e
env PATH="$WORK/bin:$PATH" CONTRACT_XCODEBUILD_LOG="$WORK/xcodebuild.log" \
  CONTRACT_ALTOOL_SENTINEL="$WORK/alttool.sentinel" CONTRACT_BUNDLE_ID=kr.co.teameet \
  TEAMEET_ARCHIVE_SCHEME=TeameetProduction TEAMEET_ARCHIVE_OUTPUT="$WORK/correct-upload" \
  APP_STORE_CONNECT_KEY_ID=fake APP_STORE_CONNECT_ISSUER_ID=fake \
  APP_STORE_CONNECT_KEY_FILE="$WORK/fake-key.p8" \
  "$WORK/repo/scripts/ios/archive-and-export.sh" --upload >"$WORK/correct-upload.out" 2>&1
status=$?
set -e
[[ "$status" -eq 99 ]]
grep -q -- 'altool --upload-app' "$WORK/alttool.sentinel"

echo 'archive-and-export contract checks passed'
