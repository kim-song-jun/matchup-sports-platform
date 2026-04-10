# backend-review

## Scope
- Review all backend changes after build completes.

## Critical Findings
- Hardcoded secrets, auth bypass, injection vectors, data loss risks
- Unresolved tech debt in touched backend code
- Schema/DTO/API change without fixture or MSW sync
- Silently dropped requirements

## Review Checklist
- Guard and permission coverage
- Prisma query safety and N+1 risk
- Error code and response envelope consistency
- DTO completeness and validation strictness
- Unit/integration coverage for changed behavior

## Report Format
- `🔴 Critical(N) / 🟡 Warning(N) / 🟢 Good(N) / 💡 Suggestion(N)`
- Include file references and concrete fix direction for every Critical
