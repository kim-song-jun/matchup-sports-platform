'use client';
import Link from 'next/link';
import type { V1SixTeamBracket, V1TournamentFixture } from '@/types/api';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { MatchCard } from './tournament-bracket';

export function SixTeamBracket({
  state,
  fixtures,
  tournamentId,
}: {
  tournamentId: string;
  state: V1SixTeamBracket;
  fixtures: V1TournamentFixture[];
}) {
  const rounds = state.rounds.map((id) =>
    fixtures.find((row) => row.id === id)
  );
  const teamName = (id: string | null) => {
    if (!id) return '선정 대기';
    for (const row of fixtures) {
      if (row.homeRegistrationId === id)
        return row.homeTeamName === null ? '비공개' : row.homeTeamName;
      if (row.awayRegistrationId === id)
        return row.awayTeamName === null ? '비공개' : row.awayTeamName;
    }
    return '비공개';
  };
  const final = rounds[4];
  const championId =
    state.winners[state.rounds[4]] ??
    (final?.result
      ? final.result.homeScore > final.result.awayScore
        ? final.homeRegistrationId
        : final.result.homeScore < final.result.awayScore
        ? final.awayRegistrationId
        : final.result.hasPenalty &&
          final.result.homePenaltyScore !== null &&
          final.result.awayPenaltyScore !== null &&
          final.result.homePenaltyScore !== final.result.awayPenaltyScore
        ? final.result.homePenaltyScore > final.result.awayPenaltyScore
          ? final.homeRegistrationId
          : final.awayRegistrationId
        : null
      : null);
  return (
    <div className="space-y-6" aria-label="6강 전용 대진표">
      <p className="tm-text-label text-[var(--text-muted)]">
        6강 토너먼트 · 총 5경기
      </p>
      <section aria-label="6강" className="space-y-3">
        <div role="heading" aria-level={4}>
          <SectionTitle title="6강 · 3경기" />
        </div>
        <div className="grid gap-3 xl:grid-cols-3">
          {rounds
            .slice(0, 3)
            .map((row, i) =>
              row ? (
                <SixTeamMatch
                  key={row.id}
                  fixture={row}
                  tournamentId={tournamentId}
                  manualWinner={
                    state.winners[row.id]
                      ? teamName(state.winners[row.id])
                      : undefined
                  }
                />
              ) : (
                <p key={i}>경기 정보를 불러오지 못했어요.</p>
              )
            )}
        </div>
      </section>
      <section
        aria-label="결승 직행 선정"
        className="space-y-3 border-y border-[var(--border)] py-4"
      >
        <div role="heading" aria-level={4}>
          <SectionTitle title={`결승 직행 · ${teamName(state.bye)}`} />
        </div>
        <p className="tm-text-caption text-[var(--text-muted)]">
          {state.needsReview
            ? '결과가 정정되어 운영자가 진출팀을 다시 확인하고 있어요.'
            : state.manual
            ? '운영자 지정'
            : state.bye
            ? '6강 공식 결과의 성적 기준으로 선정했어요.'
            : '6강 승리팀 3팀이 정해지면 결승 직행팀을 선정해요. 완전 동률이면 운영자가 선택해요.'}
        </p>
        <details>
          <summary className="min-h-11 cursor-pointer tm-text-label">
            선정 기준과 기록 보기
          </summary>
          <p className="tm-text-caption mb-3">
            최다 득점 → 최대 득실차 → 최소 실점 순이에요. 승부차기 득점은
            제외해요.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left tm-text-caption">
              <caption className="sr-only">6강 진출팀 기록 비교</caption>
              <thead>
                <tr>
                  {['팀', '득점', '득실차', '실점', '진출'].map((label) => (
                    <th key={label} className="p-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rounds.slice(0, 3).map((row) => {
                  if (!row) return null;
                  const score = row.result;
                  const winner =
                    state.winners[row.id] ??
                    (score
                      ? score.homeScore > score.awayScore
                        ? row.homeRegistrationId
                        : score.homeScore < score.awayScore
                        ? row.awayRegistrationId
                        : score.hasPenalty &&
                          score.homePenaltyScore !== null &&
                          score.awayPenaltyScore !== null &&
                          score.homePenaltyScore !== score.awayPenaltyScore
                        ? score.homePenaltyScore > score.awayPenaltyScore
                          ? row.homeRegistrationId
                          : row.awayRegistrationId
                        : null
                      : null);
                  if (!winner) return null;
                  const home = winner === row.homeRegistrationId;
                  const gf = score
                    ? home
                      ? score.homeScore
                      : score.awayScore
                    : null;
                  const ga = score
                    ? home
                      ? score.awayScore
                      : score.homeScore
                    : null;
                  return (
                    <tr key={row.id}>
                      <td className="p-2">
                        {teamName(winner)}
                        {state.winners[row.id] && ' · 운영자 지정'}
                      </td>
                      <td className="p-2">{gf ?? '—'}</td>
                      <td className="p-2">
                        {gf !== null && ga !== null ? gf - ga : '—'}
                      </td>
                      <td className="p-2">{ga ?? '—'}</td>
                      <td className="p-2">
                        {!state.bye
                          ? '선정 대기'
                          : winner === state.bye
                          ? '결승 직행'
                          : '준결승'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        {[
          {
            index: 3,
            label: '준결승',
            home: '6강 승리팀 중 선정',
            away: '6강 승리팀 중 선정',
          },
          {
            index: 4,
            label: '결승',
            home: '결승 직행팀',
            away: '준결승 승리팀',
          },
        ].map((stage) => {
          const row = rounds[stage.index];
          return (
            <section
              key={stage.index}
              aria-label={stage.label}
              className="space-y-3"
            >
              <div role="heading" aria-level={4}>
                <SectionTitle title={`${stage.label} · 1경기`} />
              </div>
              {stage.index === 4 && (
                <p className="tm-text-caption text-[var(--text-muted)]">
                  결승 직행팀 대 준결승 승리팀
                </p>
              )}
              {row ? (
                <SixTeamMatch
                  tournamentId={tournamentId}
                  fixture={{
                    ...row,
                    homeTeamName:
                      row.homeTeamName === 'TBD'
                        ? stage.index === 4 && state.swapFinal
                          ? stage.away
                          : stage.home
                        : row.homeTeamName,
                    awayTeamName:
                      row.awayTeamName === 'TBD'
                        ? stage.index === 4 && state.swapFinal
                          ? stage.home
                          : stage.away
                        : row.awayTeamName,
                  }}
                />
              ) : (
                <p>경기 정보를 불러오지 못했어요.</p>
              )}
            </section>
          );
        })}
      </div>
      {final?.status === 'completed' && (
        <p className="tm-text-body-lg font-bold">
          우승 · {championId ? teamName(championId) : '공식 결과 확인 대기'}
          {state.winners[state.rounds[4]] && ' · 운영자 지정'}
        </p>
      )}
    </div>
  );
}

function SixTeamMatch({
  fixture,
  tournamentId,
  manualWinner,
}: {
  fixture: V1TournamentFixture;
  tournamentId: string;
  manualWinner?: string | null;
}) {
  return (
    <div className="space-y-1">
      <MatchCard fixture={fixture} fluid />
      {manualWinner && (
        <p className="tm-text-caption">운영자 지정 진출팀 · {manualWinner}</p>
      )}
      <Link
        className="inline-flex min-h-11 items-center tm-text-label text-[var(--blue600)]"
        href={`/tournaments/${encodeURIComponent(
          tournamentId
        )}/matches/${encodeURIComponent(fixture.id)}`}
      >
        경기 상세
      </Link>
    </div>
  );
}
