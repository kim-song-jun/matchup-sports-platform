'use client';

import { useParams } from 'next/navigation';
import { TeamMatchSharedRecord } from '@/components/team-matches/team-match-shared-record';

export default function AdminTeamMatchRecordPage() {
  const { id } = useParams<{ id: string }>();
  return <TeamMatchSharedRecord teamMatchId={id} admin />;
}
