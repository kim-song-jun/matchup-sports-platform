'use client';

import { Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { GameRosterPlayerRow } from '@/components/game-roster/game-roster-player-row';
import { useV1TeamMatchOpponentLineup } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { formatPublicationTime } from '@/app/team-matches/[id]/lineup/lineup.view-model';

/** 상대 참석명단 — 공개 뒤 읽기 전용, 번호와 이름만(H5 D-2). 공개 전·미제출은 서버가 403·404 로 답한다. */
export function TeamMatchOpponentLineupPageClient({ teamMatchId }: { teamMatchId: string }) {
  const query = useV1TeamMatchOpponentLineup(teamMatchId);
  const backHref = `/team-matches/${teamMatchId}`;

  if (query.isLoading) return <PageSkeleton variant="detail" />;

  if (query.isError || !query.data) {
    const code = query.error instanceof V1ApiError ? query.error.code : null;
    const closed = code === 'OPPONENT_LINEUP_NOT_PUBLIC' || code === 'OPPONENT_LINEUP_NOT_SUBMITTED';
    return (
      <div style={{ padding: '40px 20px' }}>
        {closed ? (
          <EmptyState
            title={code === 'OPPONENT_LINEUP_NOT_PUBLIC' ? '상대 참석명단은 아직 공개 전이에요' : '상대 팀이 아직 참석명단을 내지 않았어요'}
            sub="공개되면 팀매치 상세의 참석명단 카드에서 볼 수 있어요."
            cta="경기 상세로"
            ctaHref={backHref}
          />
        ) : (
          <ErrorState
            message={extractErrorMessage(query.error, '상대 참석명단을 불러오지 못했어요.')}
            onRetry={code === 'PERMISSION_DENIED' ? undefined : () => void query.refetch()}
          />
        )}
      </div>
    );
  }

  const lineup = query.data;
  const time = formatPublicationTime(lineup.publicLineupAt, Date.now());
  return (
    <div style={{ padding: '16px 20px 40px' }}>
      <Card pad={16} style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h2 className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>{lineup.teamName ?? '상대 팀'}</h2>
          <span className="tm-badge tm-badge-blue">공개됨</span>
        </div>
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.6 }}>
          {time === null ? '' : `${time}에 공개됐어요 · `}
          {lineup.participants.length}명 · 등번호와 이름만 보여요.
        </p>
      </Card>
      {lineup.participants.length === 0 ? (
        <EmptyState title="명단이 비어 있어요" sub="상대 팀이 명단을 다시 내면 여기에 보여요." />
      ) : (
        <Card pad={0}>
          <ul aria-label={`${lineup.teamName ?? '상대 팀'} 참석명단`} style={{ listStyle: 'none', margin: 0, padding: '0 12px' }}>
            {lineup.participants.map((row, index) => (
              <li
                key={`${row.jerseyNumber ?? 'none'}-${row.displayName}-${index}`}
                style={index < lineup.participants.length - 1 ? { borderBottom: '1px solid var(--border)' } : undefined}
              >
                <GameRosterPlayerRow jerseyNumber={row.jerseyNumber} displayName={row.displayName} accountLinked />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: '12px 0 0', lineHeight: 1.6 }}>
        경기 시작 전에 상대 명단이 바뀌면 이 화면을 다시 열 때 반영돼요. 우리 명단은 ‘참석명단’에서 관리해요.
      </p>
    </div>
  );
}
