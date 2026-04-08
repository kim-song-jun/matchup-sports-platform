# Agent Team Configuration

## Team Structure

### Production Team
| Agent | Role | Focus |
|-------|------|-------|
| `backend-dev` | Backend developer | API, DB schema, services, permissions |
| `frontend-dev` | Frontend developer | Components, pages, styling, state |
| `infra-dev` | Infra developer | Docker, CI/CD, reverse proxy, scripts |

### Review Team
| Agent | Role | Focus |
|-------|------|-------|
| `backend-review` | Backend reviewer | API design, security, performance, error handling |
| `frontend-review` | Frontend reviewer | Code quality, accessibility, bundle size, type safety |
| `infra-review` | Infra reviewer | Security, port conflicts, volumes, networking, secrets |
| `design-main` | Design director | Overall theme consistency, design system adherence |
| `ux-manager` | UX manager | User flows, navigation, information architecture, accessibility |
| `ui-manager` | UI manager | Component quality, spacing, color, typography, responsive |

### Planning Team
| Agent | Role | Focus |
|-------|------|-------|
| `project-director` | Project director | Direction, priorities, schedule, risk |
| `tech-planner` | Tech planner | Architecture decisions, tech debt, scalability |

### QA Team
| Agent | Role | Focus |
|-------|------|-------|
| `qa-beginner` | First-time user persona | Onboarding, intuitiveness, help, first impression |
| `qa-regular` | Regular user persona | Daily workflow, efficiency, repetitive tasks |
| `qa-power` | Power user persona | Advanced features, shortcuts, bulk data, edge cases |
| `qa-uiux` | UI/UX QA | Loading states, animations, filters, responsive, dark mode |

---

## Workflow: Production → Review → Fix Cycle

### Stage 1: Planning (large changes only)
```
project-director → scope + priority decision
tech-planner     → technical approach + risk identification
```

### Stage 2: Production
```
backend-dev  → API/model/service implementation (parallel)
frontend-dev → Page/component implementation (parallel)
infra-dev    → Infrastructure changes (parallel)
```

### Stage 3: Code Review
```
backend-review  → API review (security, performance, patterns)
frontend-review → Frontend review (types, accessibility, bundle)
infra-review    → Infra review (security, ports, secrets)
```

### Stage 4: Design Review
```
design-main → Theme consistency check
ux-manager  → User flow verification
ui-manager  → Visual quality verification
```

### Stage 5: QA
```
qa-beginner → "Can a new user figure this out?"
qa-regular  → "Is the daily workflow efficient?"
qa-power    → "Does it handle edge cases and scale?"
qa-uiux     → "Are all UI states handled correctly?"
```

### Stage 6: Fix
```
Review/QA results → production team fixes → re-review
```

---
<!-- codex-init:delta version=1 timestamp=20260407_130704 -->

## Injected by codex-init

The sections below fill project-specific gaps while preserving curated content above.

## Missing Team Coverage

| Agent | Team | Role | Focus |
|-------|------|------|-------|
| `docs-writer` | Docs | Documentation writer | `AGENTS.md`, `.claude/agents/*`, `README.md`, `docs/*.md`, task/result doc sync |

## Recommended Models / Effort

| Team | Agents | Model | Effort |
|------|--------|-------|--------|
| Planning | `project-director`, `tech-planner` | `gpt-5.4-pro` | `high` |
| Production | `backend-dev`, `frontend-dev`, `infra-dev` | `gpt-5.3-instant` | `medium` |
| Review | `backend-review`, `frontend-review`, `infra-review` | `gpt-5.4-pro` | `high` |
| Design | `design-main`, `ux-manager`, `ui-manager` | `gpt-5.3-instant` | `medium` |
| QA | `qa-beginner`, `qa-regular`, `qa-power`, `qa-uiux` | `gpt-5.3-instant` | `medium` |
| Docs | `docs-writer` | `gpt-5.4-mini` | `low` |

## Command Aliases

- `@build`: `backend-dev` + `frontend-dev` + `infra-dev`
- `@review`: `backend-review` + `frontend-review` + `infra-review`
- `@design`: `design-main` + `ux-manager` + `ui-manager`
- `@plan`: `project-director` + `tech-planner`
- `@test`: `qa-beginner` + `qa-regular` + `qa-power` + `qa-uiux`
- `@docs`: `docs-writer`
- `@all`: `@plan -> @build -> @review/fix loop -> @design -> @test -> @docs`

## Handoff Rules

1. Builders run in parallel when ownership is independent.
2. Review starts only after build output is complete.
3. QA starts only after review passes with `Critical=0` and `Warning=0`.
4. Docs start last, after implementation and QA results are stable.
5. Ambiguity returns to planning; builders do not guess.
6. Non-trivial work should be anchored in `.github/tasks/`.

## Report Formats

### Build

- Changed files grouped by Backend / Frontend / Infra
- Tests run and outcomes
- Any tech debt resolved in scope

### Review

- `Critical(N) / Warning(N) / Good(N) / Suggestion(N)`
- Every Critical includes exact file reference and fix direction

### QA

- Passed scenarios count
- Failed scenarios with reproduction steps
- Improvement list

### Docs

- Updated files list
- Summary of instruction/doc changes
- Remaining drift or follow-up items

<!-- /codex-init:delta -->
