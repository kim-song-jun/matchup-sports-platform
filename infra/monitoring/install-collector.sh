#!/usr/bin/env bash
# Installs the metrics collector on a server: three files + one env file, then enables the timer.
# Dry run unless --apply. Never touches containers, compose or nginx.
#   install-collector.sh --env prod            # print what would happen
#   sudo install-collector.sh --env prod --apply
#   sudo install-collector.sh --env prod --apply --uninstall
# --root <dir> writes under <dir> and skips systemctl (used by the tests).
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_name="" apply=0 uninstall=0 root=""
while [ $# -gt 0 ]; do
  case "$1" in
    --env) env_name="${2:-}"; shift 2 ;;
    --apply) apply=1; shift ;;
    --uninstall) uninstall=1; shift ;;
    --root) root="${2:-}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$env_name" in prod|alpha) ;; *) echo "--env must be prod or alpha" >&2; exit 2 ;; esac

lib_dir="${root}/usr/local/lib/teameet-ops"
unit_dir="${root}/etc/systemd/system"
conf_dir="${root}/etc/teameet-ops"
state_dir="${root}/var/lib/teameet-ops"
lib_files=(collect.mjs lib/thresholds.mjs lib/parse.mjs lib/metrics.mjs)

run() {
  if [ "$apply" -eq 1 ]; then "$@"; else printf '  would run:'; printf ' %q' "$@"; printf '\n'; fi
}
use_systemctl() { [ -z "$root" ]; }

if [ "$apply" -eq 0 ]; then echo "== dry run: nothing is changed (add --apply) =="; fi

if [ "$uninstall" -eq 1 ]; then
  if use_systemctl; then run systemctl disable --now teameet-ops-metrics.timer || true; fi
  run rm -f "$unit_dir/teameet-ops-metrics.service" "$unit_dir/teameet-ops-metrics.timer" "$conf_dir/collector.env"
  run rm -rf "$lib_dir" "$state_dir"
  if use_systemctl; then run systemctl daemon-reload; fi
  exit 0
fi

if [ "$apply" -eq 1 ] && use_systemctl; then
  [ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
  command -v docker >/dev/null || { echo "docker is not installed" >&2; exit 1; }
  command -v aws >/dev/null || { echo "aws cli is not installed" >&2; exit 1; }
fi
if [ "$apply" -eq 1 ]; then
  command -v node >/dev/null || { echo "node (>=20) is required on the host; see README 'Node on the server'" >&2; exit 1; }
  [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { echo "node >= 20 required" >&2; exit 1; }
fi

run install -d -m 0755 "$lib_dir/lib" "$conf_dir" "$unit_dir"
run install -d -m 0700 "$state_dir"
for f in "${lib_files[@]}"; do run install -m 0644 "$here/$f" "$lib_dir/$f"; done
run install -m 0644 "$here/systemd/teameet-ops-metrics.service" "$unit_dir/teameet-ops-metrics.service"
run install -m 0644 "$here/systemd/teameet-ops-metrics.timer" "$unit_dir/teameet-ops-metrics.timer"
if [ "$apply" -eq 1 ]; then printf 'TEAMEET_ENV=%s\n' "$env_name" > "$conf_dir/collector.env"; chmod 0644 "$conf_dir/collector.env"
else echo "  would write: $conf_dir/collector.env (TEAMEET_ENV=$env_name)"; fi
if use_systemctl; then
  run systemctl daemon-reload
  run systemctl enable --now teameet-ops-metrics.timer
fi
[ "$apply" -eq 1 ] && echo "installed. check: systemctl list-timers teameet-ops-metrics.timer" || true
