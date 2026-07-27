---
'v1_web': patch
---

Reject upload video paths that escape the `/uploads/` prefix via traversal (including percent-encoded forms), and fall back to `crypto.getRandomValues` when a WebView lacks `crypto.randomUUID`, so search session ids and roster draft rows keep working on older Android WebViews.
