#!/bin/sh
set -eu

sync_dir() {
  src="$1"
  dest="$2"

  mkdir -p "$dest"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$src"/ "$dest"/
    return
  fi

  find "$dest" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  cp -a "$src"/. "$dest"/
}

echo "[deps] syncing root node_modules"
sync_dir /opt/deps/node_modules /app/node_modules

echo "[deps] syncing api node_modules"
sync_dir /opt/deps/apps/api/node_modules /app/apps/api/node_modules

echo "[deps] syncing web node_modules"
sync_dir /opt/deps/apps/web/node_modules /app/apps/web/node_modules

echo "[deps] bootstrap complete"
