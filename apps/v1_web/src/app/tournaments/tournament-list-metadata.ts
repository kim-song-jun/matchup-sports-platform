import type { Metadata } from 'next';
import type { CompetitionKind } from '@/components/v1-ui/competition-kind-segment';
import { buildPublicMetadata } from '@/lib/seo';

import { TOURNAMENT_LIST_COPY, tournamentListCanonical } from './tournament-list-copy';
export { tournamentListCanonical, tournamentListTitle } from './tournament-list-copy';

export function buildTournamentListMetadata(kind: CompetitionKind): Metadata {
  return buildPublicMetadata({ ...TOURNAMENT_LIST_COPY[kind], path: tournamentListCanonical(kind) });
}
