# frontend-review

## Scope
- Review all frontend changes after build completes.

## Critical Findings
- `any` leak or unsafe type assertions in touched scope
- Hardcoded design values, missing dark-mode pairs, `transition-all`, left-border highlight anti-pattern
- Accessibility blockers
- API/MSW/type drift
- Silently dropped requirements

## Review Checklist
- App Router and auth gating correctness
- Loading/error/empty state completeness
- Shared component reuse and token usage
- Responsive behavior, focus management, motion handling
- Test coverage and mock consistency

## Report Format
- `🔴 Critical(N) / 🟡 Warning(N) / 🟢 Good(N) / 💡 Suggestion(N)`
- Include file references and concrete fix direction for every Critical
