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
# The first step that cannot run without the Apple Developer account. `-allowProvisioningUpdates`
# lets Xcode create the missing profile itself once the machine is signed in to an account with
# the right role; without it the archive stops at "No profiles for '<bundle id>' were found".
#
# The failure is left to Xcode rather than pre-empted by a check here — its message names
# exactly what is missing, and that changes as the account setup progresses.
ARCHIVE="$OUTPUT/Teameet-$VERSION_NAME-$VERSION_CODE.xcarchive"
mkdir -p "$OUTPUT"
echo "[archive] scheme=$SCHEME configuration=$CONFIGURATION"
xcodebuild archive \
  -project "$IOS_DIR/Teameet.xcodeproj" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates

# --- export ------------------------------------------------------------------------------
echo "[archive] exporting with $(basename "$IOS_DIR")/ExportOptions.plist"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$IOS_DIR/ExportOptions.plist" \
  -exportPath "$OUTPUT/export"

IPA="$(find "$OUTPUT/export" -name '*.ipa' -maxdepth 1 | head -1)"
[[ -n "$IPA" ]] || { echo "[archive] no .ipa was produced" >&2; exit 1; }
echo "[archive] built ${IPA#"$OUTPUT/"} ($(du -h "$IPA" | cut -f1))"

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
