# autoqa scenarios index

| id | scope | personas | write | source |
|---|---|---|---|---|
| SC-LOGIN-SINARO | minimal | __bootstrap__ | no | apps/web/src/app/(auth)/login/page.tsx |
| SC-LOGIN-TEAM-OWNER | minimal | __bootstrap__ | no | apps/web/src/app/(auth)/login/page.tsx |
| SC-LOGIN-TEAM-MANAGER | minimal | __bootstrap__ | no | apps/web/src/app/(auth)/login/page.tsx |
| SC-LOGIN-TEAM-MEMBER | minimal | __bootstrap__ | no | apps/web/src/app/(auth)/login/page.tsx |
| SC-LOGIN-MERCENARY-HOST | minimal | __bootstrap__ | no | apps/web/src/app/(auth)/login/page.tsx |
| SC-LOGIN-SELLER | minimal | __bootstrap__ | no | apps/web/src/app/(auth)/login/page.tsx |
| SC-LOGIN-INSTRUCTOR | minimal | __bootstrap__ | no | apps/web/src/app/(auth)/login/page.tsx |
| SC-LOGIN-ADMIN | minimal | __bootstrap__ | no | apps/web/src/app/(auth)/login/page.tsx |
| SC-SMOKE-001 | minimal | guest | no | apps/web/src/app/landing/page.tsx |
| SC-SMOKE-002 | core | team-owner | no | apps/web/src/app/(main)/matches/matches-client.tsx |
| SC-SMOKE-003 | minimal | guest | no | apps/web/src/app/page.tsx |
| SC-AUTH-001 | core | guest | no | apps/web/src/app/(auth)/login/page.tsx |
| SC-HOME-001 | core | sinaro | no | apps/web/src/app/(main)/home/home-client.tsx |
| SC-MATCH-001 | core | sinaro | yes | apps/web/src/app/(main)/matches/new/page.tsx |
| SC-MATCH-002 | core | team-owner | no | apps/web/src/app/(main)/matches/matches-client.tsx |
| SC-TEAM-001 | core | team-owner | no | apps/web/src/app/(main)/teams/new/page.tsx |
| SC-TEAM-002 | core | team-member | yes | apps/web/src/app/(main)/teams/[id]/members/page.tsx |
| SC-TEAMMATCH-001 | core | team-owner | no | apps/web/src/app/(main)/team-matches/new/page.tsx |
| SC-MERC-001 | core | mercenary-host | no | apps/web/src/app/(main)/mercenary/new/page.tsx |
| SC-COMMS-001 | core | sinaro | yes | apps/web/src/app/(main)/notifications/page.tsx |
| SC-MARKET-001 | core | seller | no | apps/web/src/app/(main)/marketplace/new/page.tsx |
| SC-LESSON-001 | core | instructor | no | apps/web/src/app/(main)/lessons/new/page.tsx |
| SC-TRUST-001 | core | sinaro | no | apps/web/src/app/(main)/payments/page.tsx |
| SC-ACCOUNT-001 | core | sinaro | yes | apps/web/src/app/(main)/settings/notifications/page.tsx |
| SC-ADMIN-001 | core | admin | yes | apps/web/src/app/admin/dashboard/page.tsx |
| SC-HUB-001 | core | team-owner | yes | apps/web/src/app/(main)/tournaments/new/page.tsx |
| SC-ONBOARD-001 | core | sinaro | no | apps/web/src/app/(main)/onboarding/page.tsx |
| SC-CALLBACK-001 | core | guest | no | apps/web/src/app/(auth)/callback/kakao/page.tsx |
| SC-MY-001 | core | sinaro | yes | apps/web/src/app/(main)/my/disputes/[id]/page.tsx |

## Scope Freeze Snapshot

- route_count: 101
- task_doc_count: 54
- uncovered_route_count: 0
- uncovered_route: none

## Task Docs Included

- .github/tasks/07-refresh-mock-visual-assets.md
- .github/tasks/08-deepen-match-e2e-scenarios.md
- .github/tasks/16-verification-audit.md
- .github/tasks/26-qa-backlog-followups.md
- .github/tasks/29-ux-design-audit.md
- .github/tasks/32-web-audit-and-remediation.md
- .github/tasks/37-admin-real-data-and-audit-persistence.md
- .github/tasks/40-scenario-and-doc-truth-sync.md
- .github/tasks/46-isolated-playwright-runner-stacks.md
- .github/tasks/50-playwright-mcp-visual-audit-matrix.md
- .github/tasks/51-frontend-api-contract-audit-remediation.md
- .github/tasks/52-backend-api-contract-implementation-audit-plan.md
- .github/tasks/52-current-design-drift-audit-and-remediation-plan.md
- .github/tasks/53-visual-audit-operations-one-pager.md
- .github/tasks/54-unified-visual-audit-coverage-master.md
- .github/tasks/56-visual-audit-completion.md
- .github/tasks/58-design-system-audit.md
- .github/tasks/59-design-system-consistency-audit.md
- .github/tasks/60-ultraplan-ui-ux-audit-orchestration.md
- .github/tasks/61-chrome-mcp-interactive-scenario-capture.md
- .github/tasks/61a-scenarios-public-auth.md
- .github/tasks/61b-scenarios-match-team.md
- .github/tasks/61c-scenarios-lesson-market-mercenary-venue.md
- .github/tasks/61d-scenarios-profile-settings-chat-payment.md
- .github/tasks/61e-scenarios-admin-navigation.md
- .github/tasks/65-service-readiness-audit.md
- .github/tasks/66-e2e-screenshot-audit-remediation.md
- .github/tasks/67-baseline-audit.md
- .github/tasks/68-e2e-analyzer-monitor-agent-all.md
- .github/tasks/75-autoqa-operator-entrypoint.md
- .github/tasks/qa-feedback-execution-plan.md
- .github/tasks/qa-followup-completion-report.md
- .github/tasks/qa-followup-detailed.md
- .github/tasks/qa-followup-tech-design.md
- docs/PLAYWRIGHT_E2E_RUNBOOK.md
- docs/plans/2026-04-07-agent-all-qa-remediation-plan.md
- docs/plans/2026-04-07-qa-remediation-plan.md
- docs/plans/2026-04-07-real-flow-qa-scenarios.md
- docs/plans/2026-04-07-tech-planner-qa-remediation-report.md
- docs/plans/2026-04-10-web-audit-remediation-plan.md
- docs/plans/2026-04-11-backend-api-implementation-audit-remediation-plan.md
- docs/scenarios/01-auth-and-session.md
- docs/scenarios/02-home-and-discovery.md
- docs/scenarios/03-match-flows.md
- docs/scenarios/04-team-and-membership.md
- docs/scenarios/05-team-match-flows.md
- docs/scenarios/06-mercenary-flows.md
- docs/scenarios/07-chat-and-notifications.md
- docs/scenarios/08-marketplace-and-lessons.md
- docs/scenarios/09-payment-review-badge.md
- docs/scenarios/10-profile-settings-admin.md
- docs/scenarios/11-team-and-venue-hubs.md
- docs/scenarios/TEMPLATE.md
- docs/scenarios/index.md
