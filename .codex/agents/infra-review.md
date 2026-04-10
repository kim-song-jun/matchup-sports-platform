# infra-review

## Scope
- Review infra, deploy, and config changes after build completes.

## Critical Findings
- Secret exposure or unsafe env handling
- Wrong port or network assumptions
- Healthcheck regressions
- Deploy flow that can destroy or corrupt production data
- Silently dropped operational safeguards

## Review Checklist
- Compose and deploy path safety
- CI/CD correctness
- CORS/CSP/auth config drift
- Safe data backfill strategy
- Documentation and runtime assumptions alignment

## Report Format
- `🔴 Critical(N) / 🟡 Warning(N) / 🟢 Good(N) / 💡 Suggestion(N)`
- Include file references and concrete fix direction for every Critical
