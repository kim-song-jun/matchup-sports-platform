'use client';

import { useV1TeamMatchSeries, useV1TeamMatchSeriesPlayerRecords, useV1TeamMatchSeriesStandings } from '@/hooks/use-v1-api';
import { EmptyState } from '@/components/v1-ui/primitives';

const TIE_BREAK_LABELS: Record<string, string> = {
  points: '승점',
  goalDifference: '골득실',
  goalsFor: '다득점',
  headToHead: '승자승',
};

export default function TeamMatchSeriesStandingsClient({ seriesId }: { seriesId: string }) {
  const { data: series } = useV1TeamMatchSeries(seriesId);
  const { data: standings } = useV1TeamMatchSeriesStandings(seriesId);
  const { data: records } = useV1TeamMatchSeriesPlayerRecords(seriesId);

  if (series === undefined) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">{series.title}</h1>
      {standings !== undefined && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          순위 규칙: {standings.tieBreakOrder.map((c) => TIE_BREAK_LABELS[c] ?? c).join(' → ')}
        </p>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">순위표</h2>
        {standings === undefined || standings.standings.length === 0 ? (
          <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
            아직 확정된 결과가 없어요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2">순위</th>
                  <th>팀</th>
                  <th>경기</th>
                  <th>승점</th>
                  <th>득실</th>
                </tr>
              </thead>
              <tbody>
                {standings.standings.map((row) => (
                  <tr key={row.teamId} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-2 text-gray-900 dark:text-white">{row.position}</td>
                    <td className="text-gray-900 dark:text-white">{row.teamName}</td>
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
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            <span aria-hidden="true">•</span>
            {/* "확인 중"을 별도 텍스트 노드로 둔다 — 뒤에 카운트 문구를 이어붙이면
                screen.getByText('확인 중')이 정확히 일치하는 텍스트 노드를 못 찾아
                테스트가 항상 실패한다(RTL 기본 매처는 exact match). */}
            <span className="font-medium text-gray-900 dark:text-white">확인 중</span>
            <span>— {standings.pendingFixtures.length}경기가 아직 결과 확정 전이에요</span>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">득점 순위</h2>
        {records === undefined || records.goals.length === 0 ? (
          <EmptyState title="아직 기록이 없어요" sub="확정된 경기 결과가 쌓이면 득점 순위가 나타나요." />
        ) : (
          <ol className="space-y-1">
            {records.goals.map((row, index) => (
              <li key={row.userId} className="flex justify-between text-sm text-gray-900 dark:text-white">
                <span>{index + 1}. {row.nickname ?? '선수'}</span>
                <span>{row.goals}골</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">도움 순위</h2>
        {records === undefined || records.assists.length === 0 ? (
          <EmptyState title="아직 기록이 없어요" sub="확정된 경기 결과가 쌓이면 도움 순위가 나타나요." />
        ) : (
          <ol className="space-y-1">
            {records.assists.map((row, index) => (
              <li key={row.userId} className="flex justify-between text-sm text-gray-900 dark:text-white">
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
