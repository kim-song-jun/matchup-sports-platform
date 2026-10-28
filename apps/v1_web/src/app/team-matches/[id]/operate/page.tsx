import { TeamMatchOperateEntry } from '@/components/team-matches/team-match-operate-entry';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TeamMatchOperatePage({ params }: Props) {
  const { id } = await params;
  return <TeamMatchOperateEntry teamMatchId={id} />;
}
