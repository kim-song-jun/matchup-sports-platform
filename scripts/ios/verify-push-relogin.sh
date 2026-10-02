#!/usr/bin/env bash
# Proves that signing out and back in leaves the device registered and reachable: the app
# opts in, signs out (which revokes the server row), signs in again, and the settings row
# has to show ON with nothing tapped — then a server send has to arrive. This is the
# regression measured on TestFlight 0.1.4 (7), where the logout revocation also dropped the
# in-app opt-in and the next account received nothing.
#
# Same shape as verify-push-delivery.sh: a simulator on Apple silicon holds a real sandbox
# token and receives real APNs deliveries.
#
# Credentials are read from the environment. This repository is public; do not paste them
# into a file here. xcodebuild records build settings, so the result bundle under the output
# directory contains the password in clear text — keep it out of the repository.
#
#   TEAMEET_UITEST_EMAIL=…      the account the device signs in with (the recipient)
#   TEAMEET_UITEST_PASSWORD=…
#   TEAMEET_ADMIN_EMAIL=…       an account with adminRole=ops, which sends the notification
#   TEAMEET_ADMIN_PASSWORD=…
#   TEAMEET_UITEST_DEVICE=…     simulator UDID (default: the only booted one)
#   TEAMEET_UITEST_OUTPUT=…     where to write the result bundle and attachments
#
# Usage: scripts/ios/verify-push-relogin.sh
set -euo pipefail
# Everything written below — derived data, the result bundle, exported attachments — can
# carry the password in clear text, so nothing here is created readable by other users.
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="$ROOT/apps/v1_ios"
BUNDLE_ID="kr.co.teameet.alpha"
SCHEME="TeameetAlphaUITests"
OUTPUT="${TEAMEET_UITEST_OUTPUT:-${TMPDIR:-/tmp}/teameet-push-relogin}"

for required in TEAMEET_UITEST_EMAIL TEAMEET_UITEST_PASSWORD TEAMEET_ADMIN_EMAIL TEAMEET_ADMIN_PASSWORD; do
  if [ -z "${!required:-}" ]; then
    echo "$required is not set. See the header of this script." >&2
    exit 2
  fi
done

DEVICE="${TEAMEET_UITEST_DEVICE:-$(xcrun simctl list devices booted -j \
  | python3 -c 'import json,sys; d=json.load(sys.stdin)["devices"]; ids=[x["udid"] for v in d.values() for x in v]; print(ids[0] if len(ids)==1 else "")')}"
if [ -z "$DEVICE" ]; then
  echo "Set TEAMEET_UITEST_DEVICE to a simulator UDID (none booted, or more than one)." >&2
  echo "Never use an all-device command here: other sessions boot their own simulators." >&2
  exit 2
fi

( cd "$IOS_DIR" && xcodegen generate >/dev/null )

# Fresh reader, same reasoning as verify-push-slice.sh: the explainer the test answers only
# appears while the system status is notDetermined, and the cookie jar survives an uninstall.
# `erase` is scoped to this one simulator.
xcrun simctl shutdown "$DEVICE" >/dev/null 2>&1 || true
xcrun simctl erase "$DEVICE"
xcrun simctl bootstatus "$DEVICE" -b >/dev/null

mkdir -p "$OUTPUT"
rm -rf "$OUTPUT/delivery.xcresult" "$OUTPUT/attachments"
READY="$OUTPUT/device-registered"
rm -f "$READY"
TITLE="재로그인 확인 $(date +%H%M%S)"

# The test writes the ready file once the settings row shows the device registered again
# after signing back in; the simulator shares the host's file system. Three sends, in case
# SpringBoard drops the first banner while the runner is still settling.
( for _ in $(seq 1 180); do [ -f "$READY" ] && break; sleep 5; done
  [ -f "$READY" ] || { echo "[push-relogin] the device never reported itself re-registered; nothing was sent" >&2; exit 0; }
  for i in 1 2 3; do
    node "$ROOT/scripts/ios/send-admin-push.mjs" "$TITLE" "로그아웃 → 재로그인 뒤에도 도착하는지 확인 #$i" /notifications || true
    sleep 15
  done ) &
SENDER=$!
trap 'kill "$SENDER" 2>/dev/null || true' EXIT

# Ad-hoc signed so the simulator build carries aps-environment; see verify-push-slice.sh.
# The exit code is kept rather than letting `set -e` stop here: a failed run is exactly the
# one whose attachments are needed, so the export below always happens.
status=0
xcodebuild test \
  -project "$IOS_DIR/Teameet.xcodeproj" -scheme "$SCHEME" \
  -destination "platform=iOS Simulator,id=$DEVICE" \
  -derivedDataPath "$OUTPUT/derived" -resultBundlePath "$OUTPUT/delivery.xcresult" \
  -only-testing:"TeameetUITests/PushSliceUITests/testFSigningOutAndBackInKeepsTheDeviceRegistered" \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=YES \
  TEAMEET_UITEST_EMAIL="$TEAMEET_UITEST_EMAIL" \
  TEAMEET_UITEST_PASSWORD="$TEAMEET_UITEST_PASSWORD" \
  TEAMEET_UITEST_BANNER_TITLE="$TITLE" \
  TEAMEET_UITEST_READY_FILE="$READY" || status=$?

kill "$SENDER" 2>/dev/null || true
mkdir -p "$OUTPUT/attachments"
if [ -d "$OUTPUT/delivery.xcresult" ]; then
  xcrun xcresulttool export attachments \
    --path "$OUTPUT/delivery.xcresult" --output-path "$OUTPUT/attachments" >/dev/null || true
fi
echo
echo "screenshots (16-registered-before-sign-out, 17-signed-out, 18-registered-after-sign-in, 19-banner-after-relogin): $OUTPUT/attachments"
exit "$status"
