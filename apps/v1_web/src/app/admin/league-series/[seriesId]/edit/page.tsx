import LeagueSeriesEditClient from './league-series-edit-client';

interface Props {
  params: Promise<{ seriesId: string }>;
}

export default async function AdminLeagueSeriesEditPage({ params }: Props) {
  const { seriesId } = await params;
  return <LeagueSeriesEditClient seriesId={seriesId} />;
}
