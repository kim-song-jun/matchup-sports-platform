---
"v1_api": patch
"v1_web": patch
---

Retry ECR scan-findings lookup until the scan is registered before calling `aws ecr wait image-scan-complete`, which treats ScanNotFoundException as terminal instead of retrying. Fixes alpha deploys failing right after a fresh image push.
