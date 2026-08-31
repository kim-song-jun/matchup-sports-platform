#!/usr/bin/env bash
# Runs the live half of the iOS push slice against the deployed web app.
#
# Two things here cannot be checked offline: whether the page can reach the native bridge
# and see its own push state, and whether tapping a notification opens what it is about.
# Both need a booted simulator, a real account and a real notification, so this is a
# deliberate run rather than part of the offline `xcodebuild test` scheme.
#
# Credentials are read from the environment. This repository is public; do not paste them
# into a file here.
#
# They do reach disk in one place: xcodebuild records the build settings it was given,
# so the result bundle and any captured build log under the output directory contain the
# password in clear text. That output goes to a temporary directory by default — keep it
# out of the repository and never attach it to a pull request. Screenshots and element
# trees are what the run is for, and those are exported separately.
#
#   TEAMEET_UITEST_EMAIL=…            an account on the target origin
#   TEAMEET_UITEST_PASSWORD=…
#   TEAMEET_UITEST_INQUIRY_ID=…       an inquiry that account can open
#   TEAMEET_UITEST_INQUIRY_TITLE=…    its title, which the test looks for on screen
#   TEAMEET_UITEST_EXPECT_SUBSCRIBED=1  only once the origin accepts iOS registrations
#   TEAMEET_UITEST_DEVICE=…           simulator UDID (default: the only booted one)
#   TEAMEET_UITEST_OUTPUT=…           where to write the result bundle and attachments
#
# Usage: scripts/ios/verify-push-slice.sh
set -euo pipefail

IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../apps/v1_ios" && pwd)"
BUNDLE_ID="kr.co.teameet.alpha"
SCHEME="TeameetAlphaUITests"
OUTPUT="${TEAMEET_UITEST_OUTPUT:-${TMPDIR:-/tmp}/teameet-push-slice}"

for required in TEAMEET_UITEST_EMAIL TEAMEET_UITEST_PASSWORD TEAMEET_UITEST_INQUIRY_ID TEAMEET_UITEST_INQUIRY_TITLE; do
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
xcrun simctl bootstatus "$DEVICE" -b >/dev/null

# Teameet.xcodeproj is generated from project.yml and is not in the repository, so a stale
# one is the normal state after any change to the file list. Regenerating here keeps the run
# from testing a project that still references a file that no longer exists.
( cd "$IOS_DIR" && xcodegen generate >/dev/null )

# Notification permission and the web session both live in the installed app, and both
# change what the first test should see. Removing the app makes each run start from the
# state a new reader is in. Scoped to this one app on this one device: other sessions boot
# their own simulators, and an all-device command would take theirs down too.
xcrun simctl uninstall "$DEVICE" "$BUNDLE_ID" >/dev/null 2>&1 || true

mkdir -p "$OUTPUT"
rm -rf "$OUTPUT/settings.xcresult" "$OUTPUT/tap.xcresult" "$OUTPUT/attachments"

# The scheme declares these three variables as $(BUILD_SETTING) references, so passing them
# as build settings on the command line is what puts them in the test runner's environment.
# The documented TEST_RUNNER_ prefix does not reach it — measured, not assumed — and a
# missing value expands to an empty string, which the tests treat as "skip".
run_test () {
  local name="$1" bundle="$2"
  xcodebuild test \
    -project "$IOS_DIR/Teameet.xcodeproj" -scheme "$SCHEME" \
    -destination "platform=iOS Simulator,id=$DEVICE" \
    -derivedDataPath "$OUTPUT/derived" -resultBundlePath "$OUTPUT/$bundle" \
    -only-testing:"TeameetUITests/PushSliceUITests/$name" \
    CODE_SIGNING_ALLOWED=NO \
    TEAMEET_UITEST_EMAIL="$TEAMEET_UITEST_EMAIL" \
    TEAMEET_UITEST_PASSWORD="$TEAMEET_UITEST_PASSWORD" \
    TEAMEET_UITEST_INQUIRY_ID="$TEAMEET_UITEST_INQUIRY_ID" \
    TEAMEET_UITEST_INQUIRY_TITLE="$TEAMEET_UITEST_INQUIRY_TITLE" \
    TEAMEET_UITEST_EXPECT_SUBSCRIBED="${TEAMEET_UITEST_EXPECT_SUBSCRIBED:-}"
}

echo "== 1/2  bridge state on the notification settings screen"
run_test testALoginAndNotificationSettingsReflectNativeState settings.xcresult

echo "== 2/2  notification tap opens the inquiry"
# The banner has to arrive while the test is already waiting for it, and a simulator that is
# busy launching the runner can drop the first one. Sending on a loop costs nothing: the test
# taps whichever banner it sees first and then stops looking.
PAYLOAD="$OUTPUT/push.json"
python3 - "$PAYLOAD" "$BUNDLE_ID" "$TEAMEET_UITEST_INQUIRY_ID" <<'PY'
import json, sys, uuid
path, bundle, inquiry = sys.argv[1:4]
json.dump({
    "Simulator Target Bundle": bundle,
    "aps": {
        "alert": {"title": "문의에 답변이 등록됐어요", "body": "확인하고 이어서 문의할 수 있어요."},
        "sound": "default",
    },
    "route": f"/my/inquiries/{inquiry}",
    "notificationId": str(uuid.uuid4()),
}, open(path, "w"), ensure_ascii=False)
PY

( sleep 45
  for _ in $(seq 1 14); do
    xcrun simctl push "$DEVICE" "$BUNDLE_ID" "$PAYLOAD" >/dev/null 2>&1 || true
    sleep 12
  done ) &
PUSH_LOOP=$!
# The loop is the only child this script starts; it is stopped whichever way the run ends.
trap 'kill "$PUSH_LOOP" 2>/dev/null || true' EXIT

run_test testBNotificationTapOpensThePushedRoute tap.xcresult

kill "$PUSH_LOOP" 2>/dev/null || true

mkdir -p "$OUTPUT/attachments"
for bundle in settings tap; do
  xcrun xcresulttool export attachments \
    --path "$OUTPUT/$bundle.xcresult" --output-path "$OUTPUT/attachments/$bundle" >/dev/null
done

echo
echo "screenshots and element trees: $OUTPUT/attachments"
