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
