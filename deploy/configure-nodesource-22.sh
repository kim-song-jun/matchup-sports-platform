#!/usr/bin/env bash
set -euo pipefail

# Reviewed upstream installer. Never execute the mutable setup_22.x endpoint.
installer="$(mktemp)"
trap 'rm -f "$installer"' EXIT
curl --fail --silent --show-error --location \
  'https://raw.githubusercontent.com/nodesource/distributions/9b431d8ae0f10df272598585855c6eca6c0e1bd2/scripts/rpm/setup_22.x' \
  --output "$installer"
printf '%s  %s\n' \
  'b0ed2b9b66002e7ee802e8777cf3a92b25f1ecc0129812dc6f59a43a536810cc' \
  "$installer" | sha256sum --check -
sudo bash "$installer"
