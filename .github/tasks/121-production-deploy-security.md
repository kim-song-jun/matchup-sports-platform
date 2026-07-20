# Task 121 — production deploy transport security

## Finding

- `.github/workflows/deploy.yml` disabled SSH host verification with `StrictHostKeyChecking no`.
- Base64-encoded OAuth, host-admin, and analytics values were interpolated into the remote `ssh` process argument list.
- The workflow relied on implicit GitHub token permissions and referenced the absent `GA_MEASUREMENT_ID` secret while the repository has `GA_PROD`.

## Security Contract

- Production SSH accepts only the operator-pinned `EC2_KNOWN_HOSTS` entry for `EC2_HOST` and fails before network mutation when the pin is absent or mismatched.
- Secret values travel only in the SSH encrypted stdin stream and never in process arguments or a remote temporary file.
- CI token scope is explicit `contents: read`.
- Production GA remains optional and reads the registered `GA_PROD` secret.

## Acceptance Criteria

- [x] `StrictHostKeyChecking no` is absent and `yes` is enforced through the `ec2` alias used by every SSH/rsync step.
- [x] encoded secret assignments and the deploy script are one stdin stream to remote `bash -se`.
- [x] a narrow guardrail fails on disabled host verification, SSH argv secret interpolation, implicit permissions, or the stale GA secret name.
- [x] `EC2_KNOWN_HOSTS` is registered after the existing trusted local ED25519 record matched the live production EC2 scan fingerprint; only the public known_hosts line was uploaded.
- [x] dev CI passes the guardrail and existing sequential pipeline on committed SHA `6d9d4dec1f9e50570789c92115c60b3d37edf778`.

## Local Verification

- `node scripts/qa/check-production-deploy-security.mjs`: PASS.
- Negative controls: host verification disabled, permissions misspelled, stale GA secret, and secret-like SSH argv interpolation were each rejected.
- Ruby YAML AST parse: PASS.
- Extracted `Build and deploy` shell block `bash -n`: PASS.
- `git diff --check`: PASS.
- [CI / Deploy #29656131450](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/29656131450): PASS in 3m22s, including the new guardrail, type/lint, migration+integration, unit, and build stages.
- [Deploy Alpha #29656131436](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/29656131436): PASS in 11m17s. Release `0.1.0-alpha.20260719.g6d9d4dec1f9e`, commit header `6d9d4dec1f9e50570789c92115c60b3d37edf778`, DB health true.

## Remaining Risk

- Production still builds mutable local `:latest` image names and does not yet record a release SHA image/rollback manifest. This is a separate provenance/rollback change.
- No production deploy is executed in this task.
