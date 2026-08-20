'use client';

import { useV1LeagueMatch, useV1LeagueMatchPlayerRecords, useV1LeagueMatchStandings } from '@/hooks/use-v1-api';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { extractErrorMessage } from '@/lib/error-message';

const TIE_BREAK_LABELS: Record<string, string> = {
  points: '승점',
  goalDifference: '골득실',
  goalsFor: '다득점',
  headToHead: '승자승',
};

export default function LeagueMatchStandingsClient({ leagueId }: { leagueId: string }) {
  const seriesQuery = useV1LeagueMatch(leagueId);
  const standingsQuery = useV1LeagueMatchStandings(leagueId);
  const recordsQuery = useV1LeagueMatchPlayerRecords(leagueId);
  const series = seriesQuery.data;
  const standings = standingsQuery.data;
  const records = recordsQuery.data;

  // 잘못된 leagueId 딥링크(404 등)는 빈 화면이 아니라 에러 안내 + 재시도로 처리한다.
  if (seriesQuery.isError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <ErrorState
          message={extractErrorMessage(seriesQuery.error, '리그 정보를 불러오지 못했어요.')}
          onRetry={() => void seriesQuery.refetch()}
        />
      </div>
    );
  }

  if (series === undefined) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <div className="tm-skeleton" style={{ height: 32, borderRadius: 10 }} />
        <div className="tm-skeleton" style={{ height: 180, borderRadius: 16 }} />
        <div className="tm-skeleton" style={{ height: 160, borderRadius: 12 }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-bold text-[var(--text-strong)]">{series.title}</h1>
      {standings !== undefined && (
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          순위 규칙: {standings.tieBreakOrder.map((c) => TIE_BREAK_LABELS[c] ?? c).join(' → ')}
        </p>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">순위표</h2>
        {standingsQuery.isError ? (
          <ErrorState
            message={extractErrorMessage(standingsQuery.error, '순위표를 불러오지 못했어요.')}
            onRetry={() => void standingsQuery.refetch()}
          />
        ) : standings === undefined ? (
          <div className="tm-skeleton" style={{ height: 160, borderRadius: 12 }} />
        ) : standings.standings.length === 0 ? (
          <EmptyState title="아직 확정된 결과가 없어요" sub="리그 경기 결과가 확정되면 순위표가 나타나요." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-muted)]">
                  <th className="py-2">순위</th>
                  <th>팀</th>
                  <th>경기</th>
                  <th>승점</th>
                  <th>득실</th>
                </tr>
              </thead>
              <tbody>
                {standings.standings.map((row) => (
                  <tr key={row.teamId} className="border-t border-[var(--border)]">
                    <td className="py-2 text-[var(--text-strong)]">{row.position}</td>
                    <td className="text-[var(--text-strong)]">
                      <span className="flex items-center gap-2">
                        <TeamAvatar seed={row.teamId} name={row.teamName} logoUrl={row.teamLogoUrl} size="sm" />
                        <span>{row.teamName}</span>
                      </span>
                    </td>
                    <td>{row.played}</td>
                    <td>{row.points}</td>
                    <td>{row.goalsFor}-{row.goalsAgainst}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {standings !== undefined && standings.pendingFixtures.length > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--surface-soft)] p-3 text-sm text-[var(--text-muted)]">
            <span aria-hidden="true">•</span>
            {/* "확인 중"을 별도 텍스트 노드로 둔다 — 뒤에 카운트 문구를 이어붙이면
                screen.getByText('확인 중')이 정확히 일치하는 텍스트 노드를 못 찾아
                테스트가 항상 실패한다(RTL 기본 매처는 exact match). */}
            <span className="font-medium text-[var(--text-strong)]">확인 중</span>
            <span>— {standings.pendingFixtures.length}경기가 아직 결과 확정 전이에요</span>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">득점 순위</h2>
        {recordsQuery.isError ? (
          <ErrorState
            message={extractErrorMessage(recordsQuery.error, '기록을 불러오지 못했어요.')}
            onRetry={() => void recordsQuery.refetch()}
          />
        ) : records === undefined ? (
          <div className="tm-skeleton" style={{ height: 80, borderRadius: 12 }} />
        ) : records.goals.length === 0 ? (
          <EmptyState title="아직 기록이 없어요" sub="확정된 경기 결과가 쌓이면 득점 순위가 나타나요." />
        ) : (
          <ol className="space-y-1">
            {records.goals.map((row, index) => (
              <li key={row.userId} className="flex justify-between text-sm text-[var(--text-strong)]">
                <span>{index + 1}. {row.nickname ?? '선수'}</span>
                <span>{row.goals}골</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">도움 순위</h2>
        {recordsQuery.isError ? (
          <ErrorState
            message={extractErrorMessage(recordsQuery.error, '기록을 불러오지 못했어요.')}
            onRetry={() => void recordsQuery.refetch()}
          />
        ) : records === undefined ? (
          <div className="tm-skeleton" style={{ height: 80, borderRadius: 12 }} />
        ) : records.assists.length === 0 ? (
          <EmptyState title="아직 기록이 없어요" sub="확정된 경기 결과가 쌓이면 도움 순위가 나타나요." />
        ) : (
          <ol className="space-y-1">
            {records.assists.map((row, index) => (
              <li key={row.userId} className="flex justify-between text-sm text-[var(--text-strong)]">
                <span>{index + 1}. {row.nickname ?? '선수'}</span>
                <span>{row.assists}도움</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
