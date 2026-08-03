---
'v1_api': patch
'v1_web': patch
---

Resolve the Compose invocation at runtime instead of hardcoding the v2 plugin form. The production deploy and rollback scripts both called `docker compose`, but the production instance has no Compose CLI plugin at all — `cli-plugins` holds only `docker-buildx`, and Compose lives at `/usr/local/bin/docker-compose` as a standalone binary. Docker therefore never recognised `compose` as a subcommand, parsed `--project-name` as a global docker flag, and the first real production deploy died with `unknown flag: --project-name`. The legacy restore path shared the same array and failed the same way, which is why the run ended on `CRITICAL: legacy runtime restore failed`; nothing had actually been torn down, because the command never got past argument parsing.

The alpha instance does have the plugin, so no amount of alpha verification could have surfaced this — the difference between the two hosts is the defect. `deploy/setup-ec2.sh` already branched on exactly this, so the decision moves into `resolve_compose_binary()` in `deploy/prod-release-common.sh` where both scripts share it. It probes in the same form the scripts actually run (`sudo` included, since plugins can be installed per-user) and fails loudly before any container is touched when neither form works.

The deploy security guard now rejects a hardcoded Compose form in either script and requires both to go through the resolver. The first version of that check used a single-line regex that could not match the multi-line `compose=( … )` array and silently passed; it reads the array as a block instead.
