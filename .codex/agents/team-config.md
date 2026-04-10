# Codex Agent Team Configuration — MatchUp

## Canonical Policy

- 이 파일은 MatchUp의 Codex canonical team config다.
- `.codex/agents/`가 source of truth이고, `.claude/agents/prompts.md`는 built-in Codex skill compatibility entry만 담당한다.
- Codex roster는 **16 agents**로 운영한다. Claude의 19-agent 세분화는 builder 내부 ownership note로 흡수한다.

## Compression Mapping

| Codex builder | Claude agents folded in |
|---------------|-------------------------|
| `backend-dev` | `backend-api-dev`, `backend-data-dev` |
| `frontend-dev` | `frontend-ui-dev`, `frontend-data-dev` |
| `infra-dev` | `infra-devops-dev`, `infra-security-dev` |

## Team Structure (16 agents)

### Production Team — 3 builders
| Agent | Focus |
|-------|-------|
| `backend-dev` | NestJS HTTP layer, services, Prisma, permissions, fixtures, integration tests |
| `frontend-dev` | Next.js UI, hooks, stores, MSW, forms, state, mock assets |
| `infra-dev` | Docker/Compose, deploy, CI, runtime config, security hardening |

### Review Team — 3
| Agent | Focus |
|-------|-------|
| `backend-review` | Backend correctness, security, data consistency |
| `frontend-review` | Frontend regressions, a11y, async UX, design system |
| `infra-review` | Deployment safety, config drift, secrets handling |

### Design Team — 3
| Agent | Focus |
|-------|-------|
| `design-main` | Theme consistency, brand alignment, visual direction |
| `ux-manager` | Flow clarity, navigation, information architecture |
| `ui-manager` | Spacing, typography, responsive detail, shared components |

### Planning Team — 2
| Agent | Focus |
|-------|-------|
| `project-director` | Scope, priority, business value, acceptance criteria |
| `tech-planner` | Architecture, sequencing, security, test strategy |

### QA Team — 4
| Agent | Persona |
|-------|---------|
| `qa-beginner` | First-time user |
| `qa-regular` | Repeat user |
| `qa-power` | Admin / power user |
| `qa-uiux` | UI/UX specialist |

### Docs — 1
| Agent | Focus |
|-------|-------|
| `docs-writer` | AGENTS, agent docs, task docs, README, scenario docs |

## Model / Effort Guidance

| Team | Agents | Model | Effort |
|------|--------|-------|--------|
| Planning | `project-director`, `tech-planner` | `gpt-5.4-pro` | `high` |
| Review | `backend-review`, `frontend-review`, `infra-review` | `gpt-5.4-pro` | `high` |
| Production | `backend-dev`, `frontend-dev`, `infra-dev` | `gpt-5.3-instant` | `medium` |
| Design | `design-main`, `ux-manager`, `ui-manager` | `gpt-5.3-instant` | `medium` |
| QA | `qa-beginner`, `qa-regular`, `qa-power`, `qa-uiux` | `gpt-5.3-instant` | `medium` |
| Docs | `docs-writer` | `gpt-5.4-mini` | `low` |

## Command Mapping

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

## Ownership Matrix

| Agent | Owned surfaces | Must coordinate on |
|-------|----------------|--------------------|
| `backend-dev` | `apps/api/src/**`, `apps/api/prisma/**`, `apps/api/test/**` | frontend contract changes, realtime handshake, deploy-affecting runtime changes |
| `frontend-dev` | `apps/web/src/**`, `apps/web/public/mock/**`, `apps/web/messages/**` | API contract changes, auth flows, payments, E2E data setup |
| `infra-dev` | `docker-compose*`, `deploy/**`, `Makefile`, `.github/workflows/**`, `infra/**` | runtime port/auth changes, prod-safe data sync, CI assumptions |
| `docs-writer` | `AGENTS.md`, `.codex/agents/**`, `.claude/agents/prompts.md`, docs/task docs | final behavior and command truth |

## Execution Rules

1. Builders는 domain이 독립적이면 항상 병렬 실행한다.
2. DTO/query/schema 변경은 fixture, MSW, E2E data, inline mock sync 없이는 완료로 보지 않는다.
3. 리뷰는 build 완료 후 시작한다.
4. QA는 `Critical=0` and `Warning=0` 이후에만 시작한다.
5. ambiguity는 builders가 추측하지 않고 planners에게 되돌린다.
6. docs는 마지막에 실행하되, 새 gotcha가 생기면 같은 변경에서 즉시 반영한다.
7. Codex roster나 prompt 구조가 바뀌면 `.codex/agents/*`와 `.claude/agents/prompts.md` compatibility entry를 함께 갱신한다.

## Report Formats

### Build
- Backend: changed files + tests + live contract check 여부
- Frontend: changed files + tests + mock/MSW sync 여부
- Infra: changed files + validation + deploy/runtime impact

### Review
- `🔴 Critical(N) / 🟡 Warning(N) / 🟢 Good(N) / 💡 Suggestion(N)`

### QA
- `통과 N/M 시나리오, 실패: [목록], 개선: [목록]`

### Docs
- updated files + changed guidance summary + unresolved drift
