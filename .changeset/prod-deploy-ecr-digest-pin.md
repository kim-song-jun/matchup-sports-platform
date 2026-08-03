---
'v1_api': patch
'v1_web': patch
---

Bring the production deploy path up to parity with alpha: images are now built and pushed as immutable ECR digests from the GitHub Actions runner instead of `docker build` on the EC2 host, `:latest` tags are gone, and the source tree is versioned per release-sha with an atomic symlink swap (mirroring alpha's candidate→promote state machine). The `environment: production` approval gate still separates the build (runner-only, no service impact) from activation (symlink swap + migration + container replacement). A new `Rollback Prod` workflow lets an operator revert to the previous release at any time without a rebuild, using a compare-and-swap guard on the currently active commit SHA; database migrations are never rolled back, matching alpha's expand-contract policy. `restart-containers.sh` and its ad-hoc `prune_stale_release_tags` docker-tag cleanup are removed — both were solving a local-image-tag-accumulation problem that no longer exists once EC2 only pulls digest-pinned images.
