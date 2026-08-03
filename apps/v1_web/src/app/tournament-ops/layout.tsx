import type { ReactNode } from 'react';
import { RequireAuth } from '@/components/auth/require-auth';

/**
 * Task 21 review finding: the live operations console
 * (`/tournament-ops/tournaments/:id/fixtures/:fixtureId/operate`) had no
 * route-level auth gating of its own -- an unauthenticated visitor could load
 * the page shell (though every real read/write it issues -- fixture lineup
 * lookup, `/games/:gameId`, event append, commands -- still 403s at the API
 * via `TournamentStaffAccessService`/`GamesService.resolveActor`, so no
 * tournament data actually leaks; the gap was UX-only: a generic "다시 시도"
 * error loop instead of a login redirect).
 *
 * This layout applies only the repo-wide, role-agnostic `RequireAuth` gate
 * every other authenticated route group uses (mirrors
 * `apps/v1_web/src/app/admin/layout.tsx`'s `<RequireAuth>` wrap) to the whole
 * `/tournament-ops/**` tree, closing that concrete gap.
 *
 * It deliberately does NOT add tournament/fixture-scoped role gating
 * (assignment-aware "is this user actually staffed on this tournament/field"
 * authorization, matching `admin/_gate.tsx`'s `AdminGate`) -- that belongs to
 * Task 19's scoped operations shell, whose assignment-aware navigation and
 * `/staff` + `/operations` routes carry the staff-assignment data source such
 * a gate needs. Task 19 and Task 21 both landed on the integration branch and
 * both produced this same bare `RequireAuth` layout, so the scoped gate is
 * still open work: it should nest a `TournamentOpsGate`-equivalent inside this
 * `RequireAuth`, exactly as `admin/layout.tsx` nests `AdminGate` inside it.
 */
export default function TournamentOpsLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
