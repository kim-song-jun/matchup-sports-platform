#!/usr/bin/env bash
# Builds a TestFlight-ready archive and, optionally, uploads it.
#
# Runs as far as it can without signing credentials and stops with a clear message at the
# point where they become necessary — so the build configuration can be verified before the
# Apple Developer account is set up.
#
# Credentials are read from the environment and never written to disk by this script. The
# repository is public: do not paste a .p8 or a certificate anywhere in it. The App Store
# Connect API key is a DIFFERENT key from the APNs one — same file extension, different
# purpose, issued in a different section of the portal.
#
#   APP_STORE_CONNECT_KEY_ID=…        App Store Connect API key id
#   APP_STORE_CONNECT_ISSUER_ID=…     issuer id from the Keys page
#   APP_STORE_CONNECT_KEY_FILE=…      path to AuthKey_XXXXXXXX.p8, outside the repository
#
# Usage:
#   scripts/ios/archive-and-export.sh            # archive + export, no upload
#   scripts/ios/archive-and-export.sh --upload   # …and upload to App Store Connect
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="$REPO_ROOT/apps/v1_ios"
SCHEME="${TEAMEET_ARCHIVE_SCHEME:-TeameetAlpha}"
CONFIGURATION="${TEAMEET_ARCHIVE_CONFIGURATION:-Alpha Release}"
OUTPUT="${TEAMEET_ARCHIVE_OUTPUT:-${TMPDIR:-/tmp}/teameet-ios-archive}"
UPLOAD=false
TEAM_ID="${TEAMEET_TEAM_ID:-U9J95Q6XD3}"
SIGNING_IDENTITY="${TEAMEET_SIGNING_IDENTITY:-Apple Distribution}"
PROFILE_NAME="${TEAMEET_PROFILE_NAME:-Teameet Alpha App Store}"
[[ "${1:-}" == "--upload" ]] && UPLOAD=true

# --- build number ------------------------------------------------------------------------
# App Store Connect refuses a second upload with a build number it has already seen for the
# same marketing version. The number lives in version.properties, which is also what the
# generated xcconfig reads, so the check belongs here rather than in a person's memory.
PROPERTIES="$IOS_DIR/version.properties"
VERSION_NAME="$(sed -n 's/^versionName=//p' "$PROPERTIES")"
VERSION_CODE="$(sed -n 's/^versionCode=//p' "$PROPERTIES")"
MARKER="$OUTPUT/.uploaded-$VERSION_NAME-$VERSION_CODE"
echo "[archive] version $VERSION_NAME ($VERSION_CODE) from ${PROPERTIES#"$REPO_ROOT/"}"
if [[ -f "$MARKER" ]]; then
  echo "[archive] This machine already uploaded $VERSION_NAME ($VERSION_CODE)." >&2
  echo "[archive] Raise versionCode in version.properties before uploading again." >&2
  exit 2
fi

bash "$REPO_ROOT/scripts/release/generate-ios-version-xcconfig.sh"
( cd "$IOS_DIR" && xcodegen generate >/dev/null )

# --- archive -----------------------------------------------------------------------------
# Manual signing, deliberately. Automatic signing (`-allowProvisioningUpdates`) does not work
# for this project and the reason is not obvious: Xcode's archive action always asks for a
# *development* profile, and Apple refuses to issue one to a team with no registered devices —
# "Your team has no devices from which to generate a provisioning profile". Nobody here has an
# iPhone, and TestFlight does not need one, so that requirement can never be satisfied.
#
# The way out is not to register a device. A distribution profile contains no device list, so
# naming one directly skips the development profile entirely. `scripts/ios/asc-profile.mjs`
# creates it through the App Store Connect API — see docs/ops/ios-release.md.
#
# Do NOT "fix" a signing failure by turning signing off. An unsigned archive exports into a
# perfectly valid .ipa whose app carries none of its entitlements, and nothing fails — see the
# entitlement gate below, which exists because that already happened once.
ARCHIVE="$OUTPUT/Teameet-$VERSION_NAME-$VERSION_CODE.xcarchive"
mkdir -p "$OUTPUT"
echo "[archive] scheme=$SCHEME configuration=$CONFIGURATION"
xcodebuild archive \
  -project "$IOS_DIR/Teameet.xcodeproj" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_IDENTITY="$SIGNING_IDENTITY" \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE_NAME"

# --- export ------------------------------------------------------------------------------
echo "[archive] exporting with $(basename "$IOS_DIR")/ExportOptions.plist"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$IOS_DIR/ExportOptions.plist" \
  -exportPath "$OUTPUT/export"

IPA="$(find "$OUTPUT/export" -name '*.ipa' -maxdepth 1 | head -1)"
[[ -n "$IPA" ]] || { echo "[archive] no .ipa was produced" >&2; exit 1; }
echo "[archive] built ${IPA#"$OUTPUT/"} ($(du -h "$IPA" | cut -f1))"

# --- entitlement gate ----------------------------------------------------------------------
# An archive built without signing exports into a perfectly valid, perfectly signed .ipa whose
# app carries none of the entitlements it needs: the profile grants `aps-environment` and
# `com.apple.developer.associated-domains`, but with CODE_SIGNING_ALLOWED=NO the entitlement
# step never runs and the binary ships without them. Nothing fails. The build installs, opens
# and looks correct — push never arrives and universal links open in Safari instead of the app.
#
# That is not a hypothetical: it is what this script produced on the first TestFlight attempt,
# and the only reason it was caught is that someone opened the built artifact and read it.
# Checking the shipped binary rather than the build settings is the point — the settings said
# the entitlements were there.
REQUIRED_ENTITLEMENTS=(
  "aps-environment"                             # APNs. Without it the device never gets a token.
  "com.apple.developer.associated-domains"      # Universal links, incl. the Kakao sign-in return.
)
GATE_DIR="$(mktemp -d)"
trap 'rm -rf "$GATE_DIR"' EXIT
unzip -q "$IPA" -d "$GATE_DIR"
GATE_APP="$(find "$GATE_DIR/Payload" -maxdepth 1 -name "*.app" | head -1)"
[[ -n "$GATE_APP" ]] || { echo "[archive] no .app inside the .ipa" >&2; exit 1; }
GATE_PLIST="$(codesign -d --entitlements :- "$GATE_APP" 2>/dev/null || true)"
MISSING=()
for key in "${REQUIRED_ENTITLEMENTS[@]}"; do
  grep -q "<key>$key</key>" <<<"$GATE_PLIST" || MISSING+=("$key")
done
if (( ${#MISSING[@]} > 0 )); then
  echo "[archive] The built app is missing entitlements it needs:" >&2
  printf '[archive]   - %s\n' "${MISSING[@]}" >&2
  echo "[archive] Uploading this build would ship an app where those features silently do" >&2
  echo "[archive] nothing. Usual cause: the archive was produced without signing." >&2
  exit 1
fi
echo "[archive] entitlements present: ${REQUIRED_ENTITLEMENTS[*]}"

if [[ "$UPLOAD" != true ]]; then
  echo
  echo "[archive] Stopping before upload. Re-run with --upload to send it to App Store Connect."
  exit 0
fi

# --- upload ------------------------------------------------------------------------------
# Deliberately behind a flag. An upload cannot be undone — a build that should not have gone
# up can only be expired, never deleted — and the first one is where the App Store Connect
# side (app record, agreements, export compliance) is proven to line up.
for required in APP_STORE_CONNECT_KEY_ID APP_STORE_CONNECT_ISSUER_ID APP_STORE_CONNECT_KEY_FILE; do
  if [[ -z "${!required:-}" ]]; then
    echo "[archive] $required is not set. See the header of this script." >&2
    exit 2
  fi
done
[[ -f "$APP_STORE_CONNECT_KEY_FILE" ]] || {
  echo "[archive] APP_STORE_CONNECT_KEY_FILE does not exist: $APP_STORE_CONNECT_KEY_FILE" >&2
  exit 2
}

# altool reads the key from ~/private_keys or a directory named by API_PRIVATE_KEYS_DIR; it
# does not take a file path. The directory is derived from the given file so the key can live
# wherever the operator keeps it.
export API_PRIVATE_KEYS_DIR="$(cd "$(dirname "$APP_STORE_CONNECT_KEY_FILE")" && pwd)"
xcrun altool --upload-app --type ios --file "$IPA" \
  --apiKey "$APP_STORE_CONNECT_KEY_ID" --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"

touch "$MARKER"
echo "[archive] uploaded. Processing takes a few minutes; App Store Connect sends an email."
