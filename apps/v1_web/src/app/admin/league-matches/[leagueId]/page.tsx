import LeagueMatchFixturesClient from './league-match-fixtures-client';
import { sanitizeRedirectPath } from '@/lib/session-storage';

interface Props {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ from?: string | string[]; view?: string | string[] }>;
}

export default async function AdminLeagueMatchDetailPage({ params, searchParams }: Props) {
  const { leagueId } = await params;
  const { from, view } = await searchParams;
  const returnHref = sanitizeRedirectPath(typeof from === 'string' ? from : null)
    ?? '/admin/league-matches';
  return (
    <LeagueMatchFixturesClient
      leagueId={leagueId}
      returnHref={returnHref}
      initialView={view === 'list' ? 'list' : 'board'}
    />
  );
}
