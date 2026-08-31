#!/usr/bin/env bash
# Proves that tapping a /callback/* link outside the app opens the app.
#
# Kakao sign-in leaves the shell for Safari by design, and only a universal link brings the
# redirect back. If it does not, the session is created in Safari and the app stays signed
# out — a silent failure that looks like "login is broken".
#
# The link must be tapped from a different origin, so this serves a one-line page locally and
# points Safari at it. `xcrun simctl openurl` cannot substitute: it hands the URL directly to
# Safari without consulting the association, and so reports failure for a working link.
#
# Usage: scripts/ios/verify-universal-link.sh [simulator-udid]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IOS_DIR="$REPO_ROOT/apps/v1_ios"
UDID="${1:-$(xcrun simctl list devices booted -j | /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin)["devices"]; print(next(x["udid"] for v in d.values() for x in v))')}"
ORIGIN="${TEAMEET_WEB_ORIGIN:-https://alpha.teameet.co.kr}"
PORT="${TEAMEET_LINK_PAGE_PORT:-8791}"

WORK="$(mktemp -d)"
cat > "$WORK/index.html" <<HTML
<!doctype html><meta charset="utf-8"><title>universal link probe</title>
<p><a id="open-callback" href="$ORIGIN/callback/kakao?code=probe">open-callback</a></p>
HTML

# Started here, so stopped here. A stray server holds the port and the next run silently
# serves the previous page.
/usr/bin/python3 -m http.server "$PORT" --directory "$WORK" >/dev/null 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT
sleep 1

( cd "$IOS_DIR" && xcodegen generate >/dev/null )

# Passed as a build setting, not a shell variable. The scheme maps $(SETTING) into the
# runner's environment; an exported shell variable never reaches the runner, and the test
# then skips itself while the run still reports success.
xcodebuild test \
  -project "$IOS_DIR/Teameet.xcodeproj" \
  -scheme TeameetAlphaUITests \
  -configuration 'Alpha Debug' \
  -destination "id=$UDID" \
  -only-testing:TeameetUITests/UniversalLinkUITests \
  TEAMEET_UITEST_LINK_PAGE="http://localhost:$PORT/"
