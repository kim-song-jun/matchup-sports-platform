import TournamentDetailClient from './tournament-detail-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminTournamentDetailPage({ params }: Props) {
  const { id } = await params;
  return <TournamentDetailClient id={id} />;
}
