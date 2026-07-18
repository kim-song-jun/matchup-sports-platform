---
"v1_web": patch
---

Fix a flaky "window is not defined" crash in the tournament results champion banner replay animation — the requestAnimationFrame/setTimeout chain scheduled by clicking replay was never cancelled on unmount, so it could fire after the page/test environment was torn down.
