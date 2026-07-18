---
"v1_web": patch
---

Wire the GA_ALPHA GitHub secret through the alpha deploy pipeline (SSM command parameter, never written to deploy/.env) so the v1_web build on alpha.teameet.co.kr can pick up NEXT_PUBLIC_GA_MEASUREMENT_ID.
