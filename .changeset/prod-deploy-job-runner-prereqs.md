---
'v1_api': patch
'v1_web': patch
---

Give the production `deploy` job the runner prerequisites it needs to run at all. The SSH → SSM transition removed the "Setup SSH" step and took `actions/checkout` with it, and the AWS credentials step was only ever added to `build-images` — so the first approved production deploy started on a runner with neither the repository nor any credentials and died immediately on `sync-prod-runtime-env.sh: No such file or directory` (exit 127), before touching the instance. The job now checks out the repo, assumes the prod deploy role through OIDC, and requests `id-token: write` at the job level.

The guard that was supposed to catch this looked for `id-token: write` and `role-to-assume` anywhere in the workflow file, so `build-images` having them made the whole file look compliant — the same file-wide-grep weakness that previously let an `ssh ec2` remnant reach production. `check-production-deploy-security.mjs` now splits the workflow into jobs and checks each one on its own terms: a job that runs a repo script needs its own checkout, and a job that calls the `aws` CLI needs its own credentials step plus an OIDC token (inherited workflow-level `permissions` count, which is how `deploy-alpha.yml` satisfies it). The accompanying test fixes the contract in both directions — it fails against the pre-fix workflow and does not fire on jobs that legitimately need nothing.
