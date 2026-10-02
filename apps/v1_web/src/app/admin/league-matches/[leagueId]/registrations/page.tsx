import LeagueRegistrationsClient from './league-registrations-client';

interface Props {
  params: Promise<{ leagueId: string }>;
}

export default async function AdminLeagueRegistrationsPage({ params }: Props) {
  const { leagueId } = await params;
  return <LeagueRegistrationsClient leagueId={leagueId} />;
}
