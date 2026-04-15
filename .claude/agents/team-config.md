# Agent Team Configuration — Teameet

## Team Structure (19 agents)

### Production Team — 6 builders (subdivided)
| Agent | Layer | Focus |
|-------|-------|-------|
| `backend-api-dev` | API / HTTP | Controllers, DTOs, guards, interceptors, filters, modules |
| `backend-data-dev` | Persistence | Services, Prisma schema/migrations, seed, fixtures, queries |
| `frontend-ui-dev` | UI & design | Pages, components, styling, design tokens, forms, i18n |
| `frontend-data-dev` | Data & state | Hooks, stores, types, API client, MSW handlers, providers |
| `infra-devops-dev` | DevOps | Docker, Compose, deploy scripts, Makefile, CI/CD, healthchecks |
| `infra-security-dev` | Security | Secrets policy, auth config, CORS/CSP, rate limiting, CVE audit |

### Review Team — 3 (generalist per domain)
| Agent | Scope |
|-------|-------|
| `backend-review` | All backend changes (api + data layers) |
| `frontend-review` | All frontend changes (ui + data layers) |
| `infra-review` | All infra changes (devops + security) |

### Design Team — 3
| Agent | Role | Focus |
|-------|------|-------|
| `design-main` | Design director | Theme consistency, brand alignment, design system adherence |
| `ux-manager` | UX manager | User flows, navigation, information architecture, onboarding |
| `ui-manager` | UI manager | Pixel-level review: spacing, typography, color tokens, responsive |

### Planning Team — 2
| Agent | Role | Focus |
|-------|------|-------|
| `project-director` | Project director | Direction, priorities, schedule, risk, scope preservation |
| `tech-planner` | Tech planner | Architecture, tech debt strategy, parallel decomposition, security |

### QA Team — 4 personas
| Agent | Persona | Focus |
|-------|---------|-------|
| `qa-beginner` | First-time user | Onboarding, intuitiveness, first impression |
| `qa-regular` | Regular user (6mo) | Daily workflow efficiency, feature completeness |
| `qa-power` | Power user / admin | Advanced features, bulk data, admin tools, edge cases |
| `qa-uiux` | UI/UX specialist | Loading/error/empty states, animations, responsive, dark mode, a11y |

### Docs — 1
| Agent | Role | Focus |
|-------|------|-------|
| `docs-writer` | Documentation | AGENTS.md, README.md, docs/, task reports, agent config sync |

## Model Allocation
| Team | Agents | Model | Rationale |
|------|--------|-------|-----------|
| Planning | project-director, tech-planner | opus | Judgment — scope, architecture |
| Review | backend/frontend/infra-review | opus | Judgment — cross-file issues |
| Production | all `*-dev` agents | sonnet | Execution — code writing |
| Design | design-main, ux-manager, ui-manager | sonnet | Execution — design audit |
| QA | qa-beginner/regular/power/uiux | sonnet | Execution — scenario testing |
| Docs | docs-writer | sonnet | Execution — documentation |

## Dropped Agents (not applicable to this project)
| Agent | Reason |
|-------|--------|
| `frontend-viz-dev` | No Plotly/D3/Chart.js in this project |
| `backend-integration-dev` | No BullMQ/Celery/background job system |

## Command Aliases
- `@build` / `@제작` → `backend-api-dev` + `backend-data-dev` + `frontend-ui-dev` + `frontend-data-dev` + `infra-devops-dev` + `infra-security-dev`
- `@backend` → `backend-api-dev` + `backend-data-dev`
- `@frontend` → `frontend-ui-dev` + `frontend-data-dev`
- `@infra` → `infra-devops-dev` + `infra-security-dev`
- `@review` / `@리뷰` → `backend-review` + `frontend-review` + `infra-review`
- `@design` / `@디자인` → `design-main` + `ux-manager` + `ui-manager`
- `@plan` / `@기획` → `project-director` + `tech-planner`
- `@QA` / `@test` → `qa-beginner` + `qa-regular` + `qa-power` + `qa-uiux`
- `@docs` / `@문서` → `docs-writer`
- `@all` / `@전체` → `@plan` → `@build` → `@review`/fix loop → `@design` → `@QA` → `@docs`

## Workspace Separation (Parallel Safety)

### Ownership matrix
| Agent | Owned files | Do NOT touch |
|-------|------------|--------------|
| backend-api-dev | `*.controller.ts`, `*.dto.ts`, `*.module.ts`, `*.guard.ts` | `*.service.ts`, `prisma/**`, fixtures |
| backend-data-dev | `*.service.ts`, `*.spec.ts`, `prisma/**`, `test/fixtures/**` | `*.controller.ts`, `*.dto.ts` |
| frontend-ui-dev | `app/**/*.tsx`, `components/**`, `globals.css`, `messages/` | `hooks/**`, `stores/**`, `types/**`, `msw/**` |
| frontend-data-dev | `hooks/**`, `stores/**`, `types/**`, `lib/api.ts`, `msw/**` | `app/**/page.tsx`, `components/**` |
| infra-devops-dev | `docker-compose*`, `deploy/`, `Makefile`, `.github/workflows/` | `.env*` policy, auth config |
| infra-security-dev | `.env*` policy, auth config, CORS/CSP | `docker-compose*`, `deploy/`, `Makefile` |

### Parallel execution rules
1. Builders with non-overlapping owned files run in parallel
2. Shared files (config, types) → single agent handles sequentially first
3. After parallel completion: `git diff --stat` + `tsc --noEmit` to verify no integration loss

## Handoff Rules
1. Builders run in parallel when ownership is independent
2. Review starts only after build output is complete
3. QA starts only after review passes with `Critical=0` and `Warning=0`
4. Docs start last, after implementation and QA results are stable
5. Ambiguity returns to planning; builders do not guess
6. Non-trivial work must be anchored in `.github/tasks/`

---
<!-- codex-init:delta version=1 timestamp=20260410_175045 -->

## Injected by codex-init

The sections below fill project-specific gaps while preserving curated content above.

### Codex Normalized Roster Overlay

- Codex orchestration 기준 roster는 16 agents다.
- builder 압축 매핑:
  - `backend-dev` = `backend-api-dev` + `backend-data-dev`
  - `frontend-dev` = `frontend-ui-dev` + `frontend-data-dev`
  - `infra-dev` = `infra-devops-dev` + `infra-security-dev`
- `.codex/agents/*`를 Codex canonical policy로 보고, 위의 19-agent 상세 ownership은 local execution detail로 유지한다.

### Codex Model / Effort Guidance

| Team | Agents | Model | Effort |
|------|--------|-------|--------|
| Planning | `project-director`, `tech-planner` | `gpt-5.4-pro` | `high` |
| Review | `backend-review`, `frontend-review`, `infra-review` | `gpt-5.4-pro` | `high` |
| Production | `backend-dev`, `frontend-dev`, `infra-dev` | `gpt-5.3-instant` | `medium` |
| Design | `design-main`, `ux-manager`, `ui-manager` | `gpt-5.3-instant` | `medium` |
| QA | `qa-beginner`, `qa-regular`, `qa-power`, `qa-uiux` | `gpt-5.3-instant` | `medium` |
| Docs | `docs-writer` | `gpt-5.4-mini` | `low` |

### Codex Command Alias Overlay

- `@build` / `@제작` → `backend-dev` + `frontend-dev` + `infra-dev`
- `@backend` → `backend-dev`
- `@frontend` → `frontend-dev`
- `@infra` → `infra-dev`
- `@review` / `@리뷰` → `backend-review` + `frontend-review` + `infra-review`
- `@design` / `@디자인` → `design-main` + `ux-manager` + `ui-manager`
- `@plan` / `@기획` → `project-director` + `tech-planner`
- `@QA` / `@test` → `qa-beginner` + `qa-regular` + `qa-power` + `qa-uiux`
- `@docs` / `@문서` → `docs-writer`
- `@all` / `@전체` → `@plan` → `@build` → `@review`/fix loop → `@design` → `@QA` → `@docs`

### Report Formats

#### Build
- Backend: changed files + tests + live contract check 여부
- Frontend: changed files + tests/typecheck + mock/MSW sync 여부
- Infra: changed files + validation + deploy/runtime impact

#### Review
- `🔴 Critical(N) / 🟡 Warning(N) / 🟢 Good(N) / 💡 Suggestion(N)`

#### QA
- `통과 N/M 시나리오, 실패: [목록], 개선: [목록]`

#### Docs
- updated files + changed guidance summary + unresolved drift

### Sync Rule

- Codex roster, alias, report shape가 바뀌면 `.codex/agents/team-config.md`와 `.claude/agents/prompts.md` compatibility entry를 같은 변경에서 sync한다.

<!-- /codex-init:delta -->
