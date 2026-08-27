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
  /**
   * 몰수(FORFEIT)·중단(ABANDONED)으로 끝나 통계 집계에서 제외한 경기 수. 몰수 0:0은
   * "완주해서 무실점"과 같은 사실이 아니고, 중단된 경기의 스코어는 정규시간을 다 채운
   * 경기와 같은 무게로 비교할 수 없다 — 그래서 위 세 랭킹 어디에도 합산하지 않는다.
   * 완전히 화면에서 숨기면 운영자가 이 사실을 알 방법이 없으므로 헤더에 명시한다.
   */
  excludedFixtures: number;
};

/**
 * 서버가 참가자를 특정할 수 없는 골(운영 콘솔의 "익명 골로 기록" 또는 참가자 조회
 * 실패)에 채워 넣는 고정 플레이스홀더 문자열. `V1TournamentFixtureGoal` 타입에는
 * 이 상태를 나타내는 별도 플래그가 없어(익명 여부를 구분할 수단 자체가 없음) 서버가
 * 방출하는 이 리터럴로만 식별할 수 있다 (apps/v1_api/src/tournaments/
 * tournament-fixture-official-result.ts의 deriveTournamentFixtureOfficialGoals/
 * resolveTournamentFixtureOfficialResult). 진짜 근본 수정은 API
 * 계약에 `anonymous` 플래그를 실어 보내는 것이지만 그 변경은 이 파일의 소유 범위
 * 밖이라, 여기서는 알려진 플레이스홀더 값을 득점자 집계에서 제외해 "실재하지 않는
 * 득점자"가 TOP 10에 오르는 것만 막는다. 레거시 폴백 경로(playerId=null + 실제
 * 이름을 타이핑한 비회원/대타 득점자)는 이 리터럴과 다른 값이라 영향받지 않는다.
 */
const UNRESOLVED_GOAL_SCORER_PLACEHOLDER = '선수 정보 없음';

export function buildTournamentStatistics(
  fixtures: V1AdminBracketFixture[],
): TournamentStatistics {
  const scorers = new Map<string, TournamentScorerStat>();
  const teams = new Map<string, TournamentTeamStat>();
  let completedFixtures = 0;
  let excludedFixtures = 0;

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
    // 몰수·중단으로 끝난 경기는 정상 경기와 같은 무게로 집계하지 않는다 — 뛰지 않은
    // 경기의 몰수 0:0이 완주한 무실점 경기와 동률로 비교되면 안 되고, 중단된 경기의
    // 스코어도 정규시간을 다 채운 경기와 나란히 셀 수 없다.
    if (fixture.result.outcomeReason !== 'NORMAL') {
      excludedFixtures += 1;
      continue;
    }
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
      // 자책골은 경기 점수와 이벤트 타임라인에만 남고 개인 득점 순위에는 포함하지 않는다.
      if (goal.ownGoal) continue;
      // 참가자를 특정하지 못한 골(익명 골 등)은 실재하지 않는 "선수 정보 없음"
      // 득점자 행을 만들지 않도록 개인 득점 집계에서 제외한다.
      if (goal.playerName.trim() === UNRESOLVED_GOAL_SCORER_PLACEHOLDER) continue;
      const registrationId = goal.team === 'home'
        ? fixture.homeRegistrationId
        : fixture.awayRegistrationId;
      const teamName = goal.team === 'home'
        ? fixture.homeTeamName
        : fixture.awayTeamName;
      // `goal.playerId` is scoped to one game, so the same roster player gets a
      // different value in every fixture. `goal.playerUserId`(V1GameParticipant.userId)
      // is stable across the whole tournament, so prefer it when present — same
      // priority as the public individual-award ranking (public-tournament-records.
      // service.ts). Without it (non-member/substitute scorer, or legacy fallback
      // result), fall back to team+name — which still can't tell apart two players
      // with the same name on the same team, but that's the best signal available.
      const normalizedPlayerName = goal.playerName.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
      const normalizedTeamKey = registrationId
        ?? teamName.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
      const key = goal.playerUserId
        ? `user:${goal.playerUserId}`
        : `named:${normalizedTeamKey}:${normalizedPlayerName}`;
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
    excludedFixtures,
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
          {stats.excludedFixtures > 0 && (
            <>
              {' '}
              몰수·중단으로 끝난 {stats.excludedFixtures.toLocaleString('ko-KR')}경기는 제외했어요.
            </>
          )}
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
