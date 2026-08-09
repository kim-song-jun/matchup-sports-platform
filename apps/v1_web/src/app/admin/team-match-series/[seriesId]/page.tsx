import TeamMatchSeriesFixturesClient from './team-match-series-fixtures-client';

interface Props {
  params: Promise<{ seriesId: string }>;
}

export default async function AdminTeamMatchSeriesDetailPage({ params }: Props) {
  const { seriesId } = await params;
  return <TeamMatchSeriesFixturesClient seriesId={seriesId} />;
}
