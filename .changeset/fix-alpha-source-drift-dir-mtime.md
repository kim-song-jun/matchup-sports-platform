---
'v1_api': patch
'v1_web': patch
---

Stop the alpha immutable-source drift guard from rejecting an unchanged source tree because of directory timestamps it wrote itself, which made same-commit redeploys fail and flaked the release-state CI gate.
