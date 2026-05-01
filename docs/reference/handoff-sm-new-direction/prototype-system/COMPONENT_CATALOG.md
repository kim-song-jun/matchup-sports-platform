# Component Catalog

## Purpose

This catalog lists the design-system components that should remain visible in
the `handoff-sm-new-direction` candidate pack.

It is a planning catalog, not a production component API. Production extraction
still follows the existing component and token contracts under
`apps/web/src/components/**` and `apps/web/src/app/globals.css`.

## Component Entries

### NumberDisplay

Component: `NumberDisplay`

Purpose: Large numeric display for values that deserve emphasis.

Used in: payments, refunds, settlement, mercenary pay, lesson pass balance,
admin KPIs, profile stats.

Keep/Change: Keep.

Notes: Preserve tabular numbers. Use only where the domain needs numeric
emphasis.

### MoneyRow

Component: `MoneyRow`

Purpose: Label/value row for checkout, receipt, refund, payout, and order
breakdowns.

Used in: payments, marketplace orders, refunds, payouts, settlement, candidate
lesson/rental commerce flows.

Keep/Change: Keep.

Notes: Should support strong total rows and muted explanatory rows.

### MetricStat

Component: `MetricStat`

Purpose: Compact metric block for dashboard, profile, and operational summaries.

Used in: home summaries, profile reputation, admin dashboard, ops views,
mercenary urgency summaries.

Keep/Change: Keep.

Notes: Avoid using metric blocks as decorative hero filler.

### StatBar

Component: `StatBar`

Purpose: Quantitative comparison bar for trust, distribution, capacity, or
progress.

Used in: sports/skill/safety, admin analytics, team trust summaries, match fill
rate, profile/reputation.

Keep/Change: Keep.

Notes: Must be readable without color as the only signal.

### FilterChip

Component: `FilterChip`

Purpose: Compact selectable control for list filters, segments, and quick
scopes.

Used in: matches, teams, mercenary, community, admin filters, candidate lessons,
marketplace, venues, tournaments, and rental.

Keep/Change: Keep.

Notes: Active state should use blue interaction language. Avoid multi-accent
chip groups.

### KPI Card

Component: `KPI card`

Purpose: Operational summary card for desktop and admin surfaces.

Used in: desktop workspace, admin dashboard, ops, payouts, disputes, team-match
operations.

Keep/Change: Keep with restraint.

Notes: KPI cards should not become oversized marketing hero blocks.

### ListItem

Component: `ListItem`

Purpose: Standard row grammar for settings, activity, history, payment,
notification, and admin detail lists.

Used in: settings, notifications, chat activity, payment history, profile
activity, admin tools.

Keep/Change: Keep.

Notes: Prefer rows over decorative cards for dense utility surfaces.

### EmptyState

Component: `EmptyState`

Purpose: Explain an empty result or unavailable state with a clear next action.

Used in: all major list/detail/management flows.

Keep/Change: Keep.

Notes: Empty states should be truthful and route-specific, not generic filler.

### Skeleton

Component: `Skeleton`

Purpose: Loading placeholder that preserves layout and prevents jumpy surfaces.

Used in: lists, detail headers, payment summaries, admin tables, profile hubs.

Keep/Change: Keep.

Notes: Keep shimmer restrained and respect reduced-motion expectations in
production.

### Toast

Component: `Toast`

Purpose: Lightweight feedback for completed, failed, or pending actions.

Used in: form submit, read/unread actions, payment/refund actions, admin
operations, optimistic updates.

Keep/Change: Keep.

Notes: Transactional actions still need inline failure and retry states; toast
alone is not enough.

### BottomSheet

Component: `BottomSheet`

Purpose: Mobile action surface for filters, confirmation, contextual menus, and
join/apply flows.

Used in: match join, team join, mercenary apply, filters, more menu, candidate
booking/commerce flows.

Keep/Change: Keep.

Notes: Do not rely on a blurred fixed parent for viewport anchoring. Keep sheet
layering compatible with the mobile shell.

### StickyCTA

Component: `StickyCTA`

Purpose: Persistent primary action area for detail, checkout, booking, and
guided flows.

Used in: match detail, team match detail, mercenary detail, checkout, refunds,
candidate lesson/venue/rental flows.

Keep/Change: Keep.

Notes: CTA must be bound to real route/entity/order context before production
migration.

## Catalog Rules

- Components should inherit existing token and accessibility rules.
- Candidate modules may reference these components but should not force them
  into core priority.
- Transactional components must show pending, failure, retry, and unavailable
  states where applicable.
- Reputation, trust, review, and payment signals must distinguish verified,
  estimated, sample, mock, and unavailable states.
