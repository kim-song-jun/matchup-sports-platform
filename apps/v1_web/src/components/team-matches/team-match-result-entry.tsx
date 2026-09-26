'use client';
import { TeamMatchResultPageClient, TeamMatchResultApprovalPageClient } from './team-match-result-client';
import { TeamMatchSharedRecord } from './team-match-shared-record';
import { useTeamMatchRecord } from '@/hooks/use-team-match-record';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { Button } from '@/components/v1-ui/button';
import { extractErrorMessage } from '@/lib/error-message';

export function TeamMatchResultEntry({ teamMatchId, approval = false }: { teamMatchId: string; approval?: boolean }) {
  const query = useTeamMatchRecord(teamMatchId);
  if (!query.data) return query.isError ? <div role="alert">{extractErrorMessage(query.error, '경기 기록을 불러오지 못했어요.')}<Button onClick={() => void query.refetch()}>다시 시도</Button></div> : <PageSkeleton />;
  if (query.data.phase === 'legacy' || query.data.phase === 'managed') return approval ? <TeamMatchResultApprovalPageClient teamMatchId={teamMatchId} /> : <TeamMatchResultPageClient teamMatchId={teamMatchId} />;
  return <TeamMatchSharedRecord teamMatchId={teamMatchId} />;
}
