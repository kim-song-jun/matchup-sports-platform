# MatchUp Design Document Map

이 문서는 MatchUp 디자인 문서의 읽는 순서와 역할을 고정하는 navigation hub다.
규칙을 정의하거나 바꾸는 문서는 아니며, canonical source of truth는 항상 `DESIGN.md`다.

## 1. Read Order

1. `DESIGN.md`
   - 유일한 디자인 규칙 문서
   - shadow, border, layout, glass 원칙은 여기서만 정의한다
2. `.impeccable.md`
   - 브랜드 성격과 aesthetic summary를 담는 compatibility memo
3. `apps/web/src/app/globals.css`
   - 실제 token truth
4. `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`
   - 현재 코드베이스 디자인 개선의 active execution contract

## 2. Current Active Documents

- `DESIGN.md`
  - current visual rules
- `docs/DESIGN_SYSTEM_REFERENCE.md`
  - agent-consumable single reference for current design system state: tokens, components, assets, compliance scores, anti-pattern evidence, remediation priorities
- `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`
  - current design remediation work contract
- `.github/tasks/54-unified-visual-audit-coverage-master.md`
  - unified visual coverage, interaction, component, and asset capture contract
- `docs/DESIGN_CONSISTENCY_REPORT.md`
  - audit snapshot and point-in-time findings summary
- `docs/PROJECT_OVERVIEW.md`
  - product-facing summary with high-level design system section

## 3. Historical Task Documents

- `.github/tasks/29-ux-design-audit.md`
  - initial design/UX audit record
- `.github/tasks/33-brand-and-public-shell-alignment.md`
  - public shell and brand alignment rollout history
- `.github/tasks/39-mobile-glass-chrome-system.md`
  - reopened mobile chrome redesign planning history
- `.github/tasks/40-mobile-glass-chrome-system.md`
  - restrained mobile chrome implementation history
- `.github/tasks/41-mobile-glass-chrome-system.md`
  - mobile glass chrome implementation history
- `.github/tasks/45-design-system-consolidation.md`
  - design system consolidation rollout history
- `.github/tasks/50-playwright-mcp-visual-audit-matrix.md`
  - visual audit infrastructure history

이 문서들은 모두 유지 가치가 있지만, 새로운 디자인 규칙의 source of truth는 아니다.

## 4. Historical Planning Notes

- `docs/plans/2026-04-08-design-page-inventory.md`
- `docs/plans/2026-04-08-design-remediation-priority.md`
- `docs/plans/2026-04-08-design-review-batch-a.md`
- `docs/plans/2026-04-08-design-review-batch-b.md`
- `docs/plans/2026-04-08-design-review-batch-c.md`
- `docs/plans/2026-04-08-design-review-batch-d.md`
- `docs/plans/2026-04-08-design-review-batch-e.md`
- `docs/plans/2026-04-08-design-review-batch-f.md`
- `docs/plans/2026-04-08-design-review-batch-g.md`
- `docs/plans/2026-04-10-web-audit-remediation-plan.md`

이 문서들은 당시 계획과 리뷰의 스냅샷이다.
현재 규칙이나 active contract를 판단할 때 우선권을 갖지 않는다.

## 5. Usage Rules

- task, plan, report 문서에서 새 시각 규칙을 정의하지 않는다.
- task 문서와 `DESIGN.md`가 충돌하면 항상 `DESIGN.md`가 우선한다.
- 현재 코드 개선 작업을 시작할 때는 `DESIGN.md`를 먼저 읽고, 현재 상태 파악은 `docs/DESIGN_SYSTEM_REFERENCE.md`, 디자인 remediation은 `Task 52`, visual coverage completeness는 `Task 54`를 함께 본다.
- historical 문서는 근거, 히스토리, 당시 판단 맥락을 확인할 때만 사용한다.
