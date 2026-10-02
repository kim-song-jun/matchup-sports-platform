#!/usr/bin/env bash
# Proves the real remote path end to end: the deployed API signs a provider token, talks to
# Apple's gateway, and a banner shows up on the simulator. Everything else in the live bundle
# stops at the registration (test A) or injects the payload locally (test B); this is the
# only check that says whether the server can reach a device — the question that matters
# when "notifications don't arrive".
#
# Works on a simulator: on Apple silicon with macOS 13+ the simulator holds a real sandbox
# device token and receives real APNs deliveries. Measured 2026-09-02 against alpha.
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
# Usage: scripts/ios/verify-push-delivery.sh
set -euo pipefail
# Everything written below — derived data, the result bundle, exported attachments — can
# carry the password in clear text, so nothing here is created readable by other users.
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="$ROOT/apps/v1_ios"
BUNDLE_ID="kr.co.teameet.alpha"
SCHEME="TeameetAlphaUITests"
OUTPUT="${TEAMEET_UITEST_OUTPUT:-${TMPDIR:-/tmp}/teameet-push-delivery}"

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
rm -f "$READY" "$READY.terminated"
TITLE="배달 확인 $(date +%H%M%S)"
TERMINATED_TITLE="종료 상태 확인 $(date +%H%M%S)"

# The test writes the ready file once the settings screen shows the device registered; the
# simulator shares the host's file system, so this is how it says "send now" rather than
# leaving the sender to guess how long sign-in took. Three sends, in case SpringBoard drops
# the first banner while the runner is still settling.
( for _ in $(seq 1 120); do [ -f "$READY" ] && break; sleep 5; done
  [ -f "$READY" ] || { echo "[push-delivery] the device never reported itself registered; nothing was sent" >&2; exit 0; }
  for i in 1 2 3; do
    node "$ROOT/scripts/ios/send-admin-push.mjs" "$TITLE" "alpha API → APNs → 이 기기 경로 확인 #$i" /notifications || true
    sleep 15
  done
  # Second phase: the test has killed the app and says so with a second marker. The same
  # send, under a second title, has to reach a device with none of our code running.
  for _ in $(seq 1 60); do [ -f "$READY.terminated" ] && break; sleep 5; done
  [ -f "$READY.terminated" ] || { echo "[push-delivery] the test never reached the terminated phase; nothing more was sent" >&2; exit 0; }
  for i in 1 2 3; do
    node "$ROOT/scripts/ios/send-admin-push.mjs" "$TERMINATED_TITLE" "앱을 완전히 종료한 상태로 받는 알림 #$i" /notifications || true
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
  -only-testing:"TeameetUITests/PushSliceUITests/testEAServerSentNotificationReachesThisDevice" \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=YES \
  TEAMEET_UITEST_EMAIL="$TEAMEET_UITEST_EMAIL" \
  TEAMEET_UITEST_PASSWORD="$TEAMEET_UITEST_PASSWORD" \
  TEAMEET_UITEST_BANNER_TITLE="$TITLE" \
  TEAMEET_UITEST_TERMINATED_BANNER_TITLE="$TERMINATED_TITLE" \
  TEAMEET_UITEST_READY_FILE="$READY" || status=$?

kill "$SENDER" 2>/dev/null || true
mkdir -p "$OUTPUT/attachments"
if [ -d "$OUTPUT/delivery.xcresult" ]; then
  xcrun xcresulttool export attachments \
    --path "$OUTPUT/delivery.xcresult" --output-path "$OUTPUT/attachments" >/dev/null || true
fi
echo
echo "screenshots (13-settings-after-opt-in, 14-banner, 15-banner-terminated) and trees: $OUTPUT/attachments"
exit "$status"
