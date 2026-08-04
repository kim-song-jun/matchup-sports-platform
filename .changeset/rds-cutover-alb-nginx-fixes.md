---
'v1_api': patch
'v1_web': patch
---

Fix the RDS cutover script's maintenance-window handling.

Triggered the production container-Postgres-to-RDS cutover for real on 2026-08-04 and hit three distinct bugs across four attempts, none of which static review had caught:

1. `aws elbv2 modify-rule` cannot target a listener's default rule (`OperationNotPermitted`). Switched to `modify-listener --default-actions` for both `maintenance_on`/`maintenance_off`, and updated the instance role's IAM policy to scope `ModifyListener` to the listener ARN instead of `ModifyRule` on the rule ARN.
2. `modify-listener` returns success well before the change actually propagates across the ALB fleet — measured up to ~37 seconds in this account/region. A single immediate curl check couldn't tell a slow-but-successful toggle from an actual failure, which meant a fully successful migration could be rolled back purely because the final public-URL check ran too soon. Replaced every single-shot check with a shared `wait_for_public_status()` helper that polls for up to 90 seconds.
3. When the app containers are recreated with `docker compose up -d --no-deps`, they get new internal IPs, but nginx isn't restarted and keeps routing to the old (now-gone) IP, producing a real "Host is unreachable" 502 until nginx is reloaded. Added an `nginx -s reload` right after every app-container recreation, on both the rollback path and the success path.

No application behavior changes; this only affects the operator-run cutover script and its guard.
