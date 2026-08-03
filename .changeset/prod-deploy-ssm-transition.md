---
'v1_api': patch
'v1_web': patch
---

Move the production deploy off SSH and onto SSM. The runner now uploads the release tarball and manifest to a versioned S3 bucket, then drives the EC2 host with `aws ssm send-command` using short-lived OIDC credentials — `deploy.yml` and `rollback-prod.yml` contain zero SSH references, and the long-lived `EC2_SSH_KEY` is no longer part of the production path. Runtime secrets travel through Parameter Store as SecureStrings because SSM command parameters are recorded in CloudTrail, so nothing sensitive appears in a command string. The deploy security guardrails were rewritten from SSH-era invariants (pinned known_hosts, secrets streamed over stdin, rsync excludes) to their SSM equivalents (pinned instance id, OIDC-only credentials, Parameter Store delivery, `--expected-bucket-owner` on every artifact fetch), and the health checks now compare the public `X-Teameet-Commit` header against the deployed SHA so an old container answering cannot pass for a successful deploy.
