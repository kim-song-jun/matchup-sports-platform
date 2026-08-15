'use client';

import { useV1AdminBracket } from '@/hooks/use-v1-api';
import type { V1AdminBracketFixture } from '@/types/api';
import { AdminEmpty, AdminTableSkeleton } from '@/components/admin';

export type TournamentScorerStat = {
  key: string;
  playerName: string;
  teamName: string;
  goals: number;
};

export type TournamentTeamStat = {
  key: string;
  teamName: string;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
};

export type TournamentStatistics = {
  scorers: TournamentScorerStat[];
  leastConceded: TournamentTeamStat[];
  mostScored: TournamentTeamStat[];
  completedFixtures: number;
};

export function buildTournamentStatistics(
  fixtures: V1AdminBracketFixture[],
): TournamentStatistics {
  const scorers = new Map<string, TournamentScorerStat>();
  const teams = new Map<string, TournamentTeamStat>();
  let completedFixtures = 0;

  const ensureTeam = (registrationId: string | null, teamName: string) => {
    if (!registrationId) return null;
    const existing = teams.get(registrationId);
    if (existing) return existing;
    const created = {
      key: registrationId,
      teamName,
      played: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    };
    teams.set(registrationId, created);
    return created;
  };

  for (const fixture of fixtures) {
    if (!fixture.result) continue;
    completedFixtures += 1;

    const home = ensureTeam(fixture.homeRegistrationId, fixture.homeTeamName);
    const away = ensureTeam(fixture.awayRegistrationId, fixture.awayTeamName);
    if (home) {
      home.played += 1;
      home.goalsFor += fixture.result.homeScore;
      home.goalsAgainst += fixture.result.awayScore;
    }
    if (away) {
      away.played += 1;
      away.goalsFor += fixture.result.awayScore;
      away.goalsAgainst += fixture.result.homeScore;
    }

    for (const goal of fixture.result.goals) {
      const registrationId = goal.team === 'home'
        ? fixture.homeRegistrationId
        : fixture.awayRegistrationId;
      const teamName = goal.team === 'home'
        ? fixture.homeTeamName
        : fixture.awayTeamName;
      const key = goal.playerId
        ? `player:${goal.playerId}`
        : `named:${registrationId ?? teamName}:${goal.playerName.trim().toLocaleLowerCase('ko-KR')}`;
      const existing = scorers.get(key);
      if (existing) {
        existing.goals += 1;
      } else {
        scorers.set(key, {
          key,
          playerName: goal.playerName,
          teamName,
          goals: 1,
        });
      }
    }
  }

  const byName = (a: { teamName: string }, b: { teamName: string }) =>
    a.teamName.localeCompare(b.teamName, 'ko-KR');
  const teamRows = [...teams.values()];

  return {
    scorers: [...scorers.values()]
      .sort((a, b) => b.goals - a.goals || a.playerName.localeCompare(b.playerName, 'ko-KR') || byName(a, b))
      .slice(0, 10),
    leastConceded: [...teamRows]
      .sort((a, b) => a.goalsAgainst - b.goalsAgainst || b.played - a.played || b.goalsFor - a.goalsFor || byName(a, b)),
    mostScored: [...teamRows]
      .sort((a, b) => b.goalsFor - a.goalsFor || a.goalsAgainst - b.goalsAgainst || b.played - a.played || byName(a, b)),
    completedFixtures,
  };
}

function RankingTable({
  title,
  description,
  rows,
  valueLabel,
  value,
  showPlayed = true,
}: {
  title: string;
  description: string;
  rows: Array<{ key: string; name: string; sub: string; played: number; value: number }>;
  valueLabel: string;
  value: (row: { value: number }) => string;
  showPlayed?: boolean;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card-surface)] overflow-hidden">
      <div className="px-4 py-4 border-b border-[var(--border)]">
        <h3 className="text-[15px] font-bold text-[var(--text-strong)]">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{description}</p>
      </div>
      {rows.length === 0 ? (
        <div className="p-4"><AdminEmpty title="아직 집계할 기록이 없어요." /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-[13px]">
            <thead className="bg-[var(--surface-soft)] text-xs text-[var(--text-muted)]">
              <tr>
                <th scope="col" className="w-14 px-4 py-3 text-center font-semibold">순위</th>
                <th scope="col" className="px-3 py-3 text-left font-semibold">이름</th>
                {showPlayed && <th scope="col" className="w-16 px-3 py-3 text-center font-semibold">경기</th>}
                <th scope="col" className="w-20 px-4 py-3 text-right font-semibold">{valueLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((row, index) => (
                <tr key={row.key}>
                  <td className="px-4 py-3 text-center font-semibold tabular-nums text-[var(--text-muted)]">{index + 1}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-[var(--text-strong)]">{row.name}</div>
                    <div className="mt-0.5 text-xs text-[var(--text-muted)]">{row.sub}</div>
                  </td>
                  {showPlayed && <td className="px-3 py-3 text-center tabular-nums text-[var(--text-muted)]">{row.played}</td>}
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-[var(--text-strong)]">{value(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function TournamentStatisticsTab({ tournamentId }: { tournamentId: string }) {
  const { data, isPending, isError, error, refetch } = useV1AdminBracket(tournamentId);

  if (isPending) return <div className="p-4"><AdminTableSkeleton rows={6} cols={4} /></div>;
  if (isError || !data) {
    return (
      <div className="p-4">
        <AdminEmpty
          title="통계를 불러오지 못했어요."
          description={error instanceof Error ? error.message : undefined}
          action={<button type="button" onClick={() => void refetch()} className="min-h-[44px] px-4 rounded-lg border border-[var(--border)] font-semibold">다시 시도</button>}
        />
      </div>
    );
  }

  const stats = buildTournamentStatistics(data.fixtures);
  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-[15px] font-bold text-[var(--text-strong)]">대회 통계</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
          결과가 확정된 {stats.completedFixtures.toLocaleString('ko-KR')}경기를 기준으로 자동 집계해요.
        </p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <RankingTable
          title="득점자 TOP 10"
          description="경기 결과에 이름이 기록된 득점만 합산해요."
          rows={stats.scorers.map((row) => ({ key: row.key, name: row.playerName, sub: row.teamName, played: 0, value: row.goals }))}
          valueLabel="득점"
          value={(row) => `${row.value}골`}
          showPlayed={false}
        />
        <RankingTable
          title="최소 실점 팀"
          description="누적 실점이 적은 순서이며, 동률이면 경기 수가 많은 팀이 앞서요."
          rows={stats.leastConceded.map((row) => ({ key: row.key, name: row.teamName, sub: `${row.goalsFor}득점`, played: row.played, value: row.goalsAgainst }))}
          valueLabel="실점"
          value={(row) => `${row.value}골`}
        />
        <RankingTable
          title="최다 득점 팀"
          description="대회에서 기록한 누적 득점이 많은 순서예요."
          rows={stats.mostScored.map((row) => ({ key: row.key, name: row.teamName, sub: `${row.goalsAgainst}실점`, played: row.played, value: row.goalsFor }))}
          valueLabel="득점"
          value={(row) => `${row.value}골`}
        />
      </div>
    </div>
  );
}
