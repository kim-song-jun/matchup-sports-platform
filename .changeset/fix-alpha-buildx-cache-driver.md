---
"v1_api": patch
"v1_web": patch
---

Add docker/setup-buildx-action before the alpha image build steps so the buildx builder uses the docker-container driver, which is required for the GHA cache backend (cache-to: type=gha). The default docker driver rejects cache export with "Cache export is not supported for the docker driver."
