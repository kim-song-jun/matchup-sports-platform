---
'v1_api': patch
'v1_web': patch
---

Finish the SSH removal that the SSM transition missed. `resolve-prod-rollback-base.sh` still shelled out through the `ssh ec2` alias, but the workflow step that created that alias was deleted in the same transition — so the first production deploy died immediately with "ssh: Could not resolve hostname ec2" before it built anything. The script now reads release state over SSM like its alpha counterpart, and a guardrail walks every `scripts/release/*.sh` the workflow references so a leftover ssh/scp/rsync call can never again pass CI and only surface during a real deploy.
