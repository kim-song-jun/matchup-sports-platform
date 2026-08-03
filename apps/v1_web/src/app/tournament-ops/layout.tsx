import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';

/**
 * Task 21 review finding: the live operations console
 * (`/tournament-ops/tournaments/:id/fixtures/:fixtureId/operate`) had no
 * route-level auth/role gating of its own -- an unauthenticated visitor could
 * load the page shell (though every real read/write it issues -- fixture
 * lineup lookup, `/games/:gameId`, event append, commands -- still 403s at
 * the API via `TournamentStaffAccessService`/`GamesService.resolveActor`, so
 * no tournament data actually leaks; the gap was UX-only: a generic
 * "다시 시도" error loop instead of a login redirect).
 *
 * This layout applies only the same repo-wide, role-agnostic `RequireAuth`
 * gate every other authenticated route group uses (mirrors
 * `apps/v1_web/src/app/admin/layout.tsx`'s `<RequireAuth>` wrap) to the whole
 * `/tournament-ops/**` tree, closing that concrete gap now.
 *
 * It deliberately does NOT add tournament/fixture-scoped role gating
 * (assignment-aware "is this user actually staffed on this tournament/field"
 * authorization, matching `admin/_gate.tsx`'s `AdminGate`) -- that is Task
 * 19's exclusive, plan-assigned deliverable ("Build the separate scoped
 * tournament-operations shell and board": assignment-aware navigation, the
 * `/staff` and `/operations` routes, and the route guard that must agree
 * with server permission -- see
 * `.omo/plans/teameet-team-tournament-operations-v1.md` Todo 19, which Todo
 * 21 itself lists as a blocking prerequisite). Task 19 is not present in this
 * worktree. Building that role-scoped gate here, ahead of and outside Task
 * 19's ownership, would duplicate work Task 19 must do anyway (it needs its
 * own staff-assignment data source for "assignment-aware navigation" across
 * `/operations` and `/staff`, not just this one fixture route) and would risk
 * encoding the wrong scope rule for Task 19 to then reconcile or discard.
 * Task 19 should nest its own `TournamentOpsGate`-equivalent inside this
 * `RequireAuth`, exactly as `admin/layout.tsx` nests `AdminGate` inside it.
 */
export default function TournamentOpsLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
