import { VideosPageClient } from '@/components/tournament-live/videos-page-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminTournamentVideosPage({ params }: Props) {
  const { id } = await params;
  return <VideosPageClient tournamentId={id} />;
}
