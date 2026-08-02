---
'v1_api': patch
'v1_web': patch
---

Stop the production image guard from breaking alpha deploys. `docker-compose.prod.yml` is loaded by alpha as a base file, and Compose interpolates every file before merging overrides — so a `${V1_API_IMAGE:?...}` guard in the shared base fires even though the alpha overlay replaces that value, which took alpha's deploy down with "error while interpolating services.v1_uploads_init.image". The guard now lives in `load_prod_release_manifest()`, where it only runs on the production path and additionally validates that the value is a real ECR digest URI rather than merely non-empty. A guardrail check keeps the shared base free of `:?` on those variables so this cannot recur.
