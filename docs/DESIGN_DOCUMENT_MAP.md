# Teameet Design Document Map

이 문서는 Teameet 디자인 문서의 읽는 순서와 역할을 고정하는 navigation hub다.
규칙을 정의하거나 바꾸는 문서는 아니며, canonical source of truth는 항상 `DESIGN.md`다.

## 1. Read Order

1. `DESIGN.md`
   - 유일한 디자인 규칙 문서
   - shadow, border, layout, glass 원칙은 여기서만 정의한다
2. `.impeccable.md`
   - 브랜드 성격과 aesthetic summary를 담는 compatibility memo
3. `docs/reference/handoff-2026-04-25/INDEX.md`
   - 업로드된 design handoff bundle을 읽을 때의 reference hub
   - handoff는 coverage/reference pack이지 canonical rule source는 아님
4. `docs/reference/handoff-2026-04-25/SOURCE_PROTOTYPE_PARITY.md`
   - source/prototype 용어와 route parity 기준
   - 실제 `apps/web` 구현 기능을 prototype에 반영할 때의 coverage map
5. `docs/reference/handoff-2026-04-25/prototype-system/README.md`
   - rendered prototype의 module map, common flow, state/interaction, Tailwind token, QA 문서 허브
6. `apps/web/src/app/globals.css`
   - 실제 token truth
7. `.github/tasks/79-teameet-design-handoff-unification.md`
   - handoff prototype parity, future service prototype, topic grouping 작업의 active execution contract
8. `.github/tasks/52-current-design-drift-audit-and-remediation-plan.md`
   - 현재 코드베이스 디자인 개선의 active execution contract

## 2. Current Active Documents

- `DESIGN.md`
  - current visual rules
- `docs/DESIGN_SYSTEM_REFERENCE.md`
  - agent-consumable single reference for current design system state: tokens, components, assets, compliance scores, anti-pattern evidence, remediation priorities
- `docs/reference/handoff-2026-04-25/INDEX.md`
  - 2026-04-25 handoff bundle read order, verification, and reference usage rules
- `docs/reference/handoff-2026-04-25/SOURCE_PROTOTYPE_PARITY.md`
  - 실제 source route와 prototype coverage를 맞추기 위한 parity 기준
- `docs/reference/handoff-2026-04-25/prototype-system/README.md`
  - 현재 `fix26` prototype system 문서 허브
- `docs/reference/handoff-2026-04-25/prototype-system/DESIGN_SYSTEM_FOUNDATION_FIX24.md`
  - 타이포, 버튼, 컨트롤, 모션, 반응형 storyboard, Tailwind class 계약
- `docs/reference/handoff-2026-04-25/prototype-system/TAILWIND_TOKEN_SYSTEM_FIX24.md`
  - light-only prototype, breakpoint, spacing, type, motion, Admin sidebar 예외 token 기준
- `docs/reference/handoff-2026-04-25/prototype-system/PRODUCTION_HANDOFF_FIX26.md`
  - 실제 개발 이행을 위한 token, component, page wave, QA gate 기준
- `docs/reference/handoff-2026-04-25/prototype-system/DESIGN_QA_FIX26.md`
  - `fix26` 기준 개발 핸드오프 보드와 전체 prototype QA 결과
- `.github/tasks/79-teameet-design-handoff-unification.md`
  - uploaded handoff bundle 기반 `00 -> 01~24` 통합 재정비 execution contract
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
- handoff bundle은 `docs/reference/handoff-YYYY-MM-DD/` 아래에 reference pack으로 보관하고, 채팅 transcript와 index를 먼저 읽는다.
- handoff pack은 coverage / intent / strongest-pattern reference일 뿐, canonical visual rule source가 아니다.
- 현재 코드 개선 작업을 시작할 때는 `DESIGN.md`를 먼저 읽고, 현재 상태 파악은 `docs/DESIGN_SYSTEM_REFERENCE.md`, 디자인 remediation은 `Task 52`, visual coverage completeness는 `Task 54`를 함께 본다.
- historical 문서는 근거, 히스토리, 당시 판단 맥락을 확인할 때만 사용한다.
