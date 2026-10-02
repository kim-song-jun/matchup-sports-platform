import LeagueSeriesDetailClient from './league-series-detail-client';

interface Props {
  params: Promise<{ seriesId: string }>;
}

export default async function AdminLeagueSeriesDetailPage({ params }: Props) {
  const { seriesId } = await params;
  return <LeagueSeriesDetailClient seriesId={seriesId} />;
}
