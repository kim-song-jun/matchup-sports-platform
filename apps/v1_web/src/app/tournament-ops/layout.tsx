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
 * It deliberately does NOT add tournament/fixture-scoped role gating here.
 * That gate is no longer open work: `tournament-ops/tournaments/[id]/layout.tsx`
 * nests `TournamentLiveGate` (assignment-aware role check plus `AccessDenied`)
 * inside this `RequireAuth`, which is the same shape as `admin/layout.tsx`
 * nesting `AdminGate`. Scoped authorization belongs there because only the
 * `[id]` segment knows which tournament to check assignments against.
 */
export default function TournamentOpsLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
