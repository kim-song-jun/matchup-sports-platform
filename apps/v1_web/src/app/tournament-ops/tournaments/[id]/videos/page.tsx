import { VideosPageClient } from '@/components/tournament-live/videos-page-client';

export default async function TournamentOpsVideosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VideosPageClient tournamentId={id} />;
}
