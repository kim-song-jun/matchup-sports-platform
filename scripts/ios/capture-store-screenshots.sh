#!/usr/bin/env bash
# Captures the App Store listing screenshots at the size Apple requires.
#
# 6.9" display, portrait. App Store Connect accepts either 1290x2796 or 1320x2868 at that
# size, and the iPhone 16 Pro Max simulator's screen is exactly the second one — so the
# frames are the real thing rather than something scaled. It takes 1 to 10 of them, PNG or
# JPEG, and **refuses any image with an alpha channel**, which is what the flatten step at
# the end is for: a simulator screenshot carries one, and the upload fails with a message
# that does not mention transparency.
#
# Credentials come from the environment. This repository is public; do not paste them here.
# xcodebuild records build settings, so the result bundle under the output directory contains
# the password in clear text — hence the umask.
#
#   TEAMEET_SHOT_EMAIL=…  TEAMEET_SHOT_PASSWORD=…     the account the shots are taken as
#   TEAMEET_SHOT_SCHEME=…                             default TeameetAlphaUITests
#   TEAMEET_SHOT_OUTPUT=…                             where the PNGs land
#
# Usage: scripts/ios/capture-store-screenshots.sh
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="$ROOT/apps/v1_ios"
SCHEME="${TEAMEET_SHOT_SCHEME:-TeameetAlphaUITests}"
OUTPUT="${TEAMEET_SHOT_OUTPUT:-${TMPDIR:-/tmp}/teameet-store-screenshots}"
DEVICE_TYPE="com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro-Max"
SIM_NAME="Teameet-store-shots"

for required in TEAMEET_SHOT_EMAIL TEAMEET_SHOT_PASSWORD; do
  if [ -z "${!required:-}" ]; then
    echo "$required is not set. See the header of this script." >&2
    exit 2
  fi
done

RUNTIME="$(xcrun simctl list runtimes -j \
  | python3 -c 'import json,sys; rs=[r["identifier"] for r in json.load(sys.stdin)["runtimes"] if r.get("isAvailable") and "iOS" in r["name"]]; print(rs[-1] if rs else "")')"
[ -n "$RUNTIME" ] || { echo "No available iOS simulator runtime." >&2; exit 1; }

# A dedicated simulator, created and destroyed here. Other sessions boot their own, and an
# all-device command would take theirs down with it.
DEVICE="$(xcrun simctl create "$SIM_NAME" "$DEVICE_TYPE" "$RUNTIME")"
cleanup() {
  xcrun simctl shutdown "$DEVICE" >/dev/null 2>&1 || true
  xcrun simctl delete "$DEVICE" >/dev/null 2>&1 || true
}
trap cleanup EXIT
xcrun simctl bootstatus "$DEVICE" -b >/dev/null

( cd "$IOS_DIR" && xcodegen generate >/dev/null )

mkdir -p "$OUTPUT"
rm -rf "$OUTPUT/shots.xcresult" "$OUTPUT/attachments" "$OUTPUT"/*.png

# Ad-hoc signed for the same reason as the push harness: an unsigned build has no
# aps-environment and stalls on the notification prompt path.
status=0
xcodebuild test \
  -project "$IOS_DIR/Teameet.xcodeproj" -scheme "$SCHEME" \
  -destination "platform=iOS Simulator,id=$DEVICE" \
  -derivedDataPath "$OUTPUT/derived" -resultBundlePath "$OUTPUT/shots.xcresult" \
  -only-testing:"TeameetUITests/StoreScreenshotUITests" \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=YES \
  TEAMEET_UITEST_EMAIL="$TEAMEET_SHOT_EMAIL" \
  TEAMEET_UITEST_PASSWORD="$TEAMEET_SHOT_PASSWORD" > "$OUTPUT/capture.log" 2>&1 || status=$?

mkdir -p "$OUTPUT/attachments"
if [ -d "$OUTPUT/shots.xcresult" ]; then
  xcrun xcresulttool export attachments \
    --path "$OUTPUT/shots.xcresult" --output-path "$OUTPUT/attachments" >/dev/null || true
fi

# The manifest is the only place an attachment's readable name survives; on disk they are
# UUIDs. Copy the named ones out, then flatten.
python3 - "$OUTPUT" <<'PY'
import json, os, shutil, subprocess, sys
output = sys.argv[1]
manifest = os.path.join(output, 'attachments', 'manifest.json')
if not os.path.exists(manifest):
    print('no attachments were produced — see capture.log', file=sys.stderr)
    raise SystemExit(0)

saved = []
for test in json.load(open(manifest)):
    for attachment in test.get('attachments', []):
        name = attachment.get('suggestedHumanReadableName', '')
        # Only the listing shots. The harness attaches its own debug screenshots on the way
        # through sign-in, and those must not end up on the store page.
        if not name.startswith('store-'):
            continue
        source = os.path.join(output, 'attachments', attachment['exportedFileName'])
        target = os.path.join(output, f"{name.split('_')[0].removeprefix('store-')}.png")
        shutil.copy(source, target)
        saved.append(target)

for path in sorted(set(saved)):
    # App Store Connect refuses images with an alpha channel, and a simulator screenshot has
    # one. `--matchTo` against a plain RGB profile drops it and leaves the pixels alone.
    subprocess.run(['sips', '-s', 'format', 'png', '--deleteColorManagementProperties', path],
                   check=False, capture_output=True)
    subprocess.run(['sips', '-s', 'formatOptions', 'best', path], check=False, capture_output=True)
    size = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path],
                          capture_output=True, text=True).stdout
    dims = ' '.join(line.split(':')[-1].strip() for line in size.splitlines() if ':' in line and 'pixel' in line)
    print(f'{os.path.basename(path)}  {dims}')
print(f'\n{len(set(saved))} screenshots in {output}')
PY

exit "$status"
