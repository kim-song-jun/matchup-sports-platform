#!/usr/bin/env bash
# Exercise real config generation without touching the checkout's generated secrets.
set -Eeuo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/scripts/release" "$work/apps/v1_ios/Config"
cp "$root/scripts/release/generate-ios-secrets-xcconfig.sh" "$work/scripts/release/"
generated="$work/apps/v1_ios/Config/Secrets.generated.xcconfig"
generator="$work/scripts/release/generate-ios-secrets-xcconfig.sh"
alpha=11111111111111111111111111111111
production=22222222222222222222222222222222
TEAMEET_KAKAO_ALPHA_NATIVE_APP_KEY="$alpha" TEAMEET_KAKAO_PRODUCTION_NATIVE_APP_KEY="$production" bash "$generator" >/dev/null
grep -qx "TEAMEET_KAKAO_ALPHA_NATIVE_APP_KEY = $alpha" "$generated"
grep -qx "TEAMEET_KAKAO_PRODUCTION_NATIVE_APP_KEY = $production" "$generated"
grep -Fqx 'TEAMEET_KAKAO_NATIVE_APP_KEY = $(TEAMEET_KAKAO_ALPHA_NATIVE_APP_KEY)' "$root/apps/v1_ios/Config/Alpha.xcconfig"
grep -Fqx 'TEAMEET_KAKAO_NATIVE_APP_KEY = $(TEAMEET_KAKAO_PRODUCTION_NATIVE_APP_KEY)' "$root/apps/v1_ios/Config/Production.xcconfig"
cp "$generated" "$work/before"
for name in TEAMEET_KAKAO_ALPHA_NATIVE_APP_KEY TEAMEET_KAKAO_PRODUCTION_NATIVE_APP_KEY; do
  if env "$name=not-a-valid-key" bash "$generator" >"$work/invalid.out" 2>&1; then
    echo "invalid $name was accepted" >&2
    exit 1
  fi
  grep -q "$name must contain" "$work/invalid.out"
  cmp "$work/before" "$generated"
done
TEAMEET_KAKAO_ALPHA_NATIVE_APP_KEY= TEAMEET_KAKAO_PRODUCTION_NATIVE_APP_KEY= bash "$generator" >/dev/null
grep -qx 'TEAMEET_KAKAO_ALPHA_NATIVE_APP_KEY = ' "$generated"
grep -qx 'TEAMEET_KAKAO_PRODUCTION_NATIVE_APP_KEY = ' "$generated"
echo 'Kakao environment key config contracts passed'
