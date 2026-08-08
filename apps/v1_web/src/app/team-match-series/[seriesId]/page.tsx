import TeamMatchSeriesStandingsClient from './team-match-series-standings-client';

interface Props {
  params: Promise<{ seriesId: string }>;
}

export default async function TeamMatchSeriesPage({ params }: Props) {
  const { seriesId } = await params;
  return <TeamMatchSeriesStandingsClient seriesId={seriesId} />;
}
