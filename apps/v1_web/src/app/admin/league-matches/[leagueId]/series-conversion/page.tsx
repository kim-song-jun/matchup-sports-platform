import { LeagueConversionForm } from './series-conversion-form';
export default async function Page({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  return <LeagueConversionForm leagueId={leagueId} />;
}
