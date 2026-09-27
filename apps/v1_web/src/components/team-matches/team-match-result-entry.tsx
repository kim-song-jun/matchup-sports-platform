'use client';
import Link from 'next/link';
import { TeamMatchResultPageClient, TeamMatchResultApprovalPageClient } from './team-match-result-client';
import { TeamMatchSharedRecord } from './team-match-shared-record';
import { useTeamMatchRecord } from '@/hooks/use-team-match-record';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { Button } from '@/components/v1-ui/button';
import { extractErrorMessage } from '@/lib/error-message';

export function TeamMatchResultEntry({ teamMatchId, approval = false }: { teamMatchId: string; approval?: boolean }) {
  const query = useTeamMatchRecord(teamMatchId);
  if (!query.data) return query.isError ? <div role="alert">{extractErrorMessage(query.error, '경기 기록을 불러오지 못했어요.')}<Button onClick={() => void query.refetch()}>다시 시도</Button></div> : <PageSkeleton />;
  if (!query.data.lineupReady && query.data.phase !== 'official' && query.data.phase !== 'cancelled') {
    const ownTeamMissing = query.data.missingSides.some((side) => side.sideId === query.data?.ownSideId);
    return (
      <main className="tm-page-shell">
        <section role="alertdialog" aria-labelledby="result-lineup-gate-title" className="tm-card" style={{ maxWidth: 520, margin: '32px auto', padding: 24 }}>
          <h1 id="result-lineup-gate-title" className="tm-text-title">참석명단 등록이 필요해요</h1>
          <p className="tm-text-body" style={{ marginTop: 12 }}>
            양 팀의 참석명단이 모두 제출되어야 경기 결과를 입력할 수 있어요.
          </p>
          <ul style={{ margin: '16px 0 0', paddingLeft: 20 }}>
            {query.data.missingSides.map((side) => <li key={side.sideId}>{side.teamName} · 미제출</li>)}
          </ul>
          {ownTeamMissing ? (
            <Link className="tm-btn tm-btn-primary tm-btn-lg tm-btn-block" style={{ marginTop: 20 }} href={`/team-matches/${teamMatchId}/lineup`}>
              참석명단 등록하기
            </Link>
          ) : (
            <p className="tm-text-caption" style={{ marginTop: 20 }}>상대 팀의 참석명단 제출을 기다려 주세요.</p>
          )}
        </section>
      </main>
    );
  }
  if (query.data.phase === 'legacy' || query.data.phase === 'managed') return approval ? <TeamMatchResultApprovalPageClient teamMatchId={teamMatchId} /> : <TeamMatchResultPageClient teamMatchId={teamMatchId} />;
  return <TeamMatchSharedRecord teamMatchId={teamMatchId} />;
}
