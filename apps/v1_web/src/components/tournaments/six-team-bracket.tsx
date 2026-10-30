'use client';
import type { V1SixTeamBracket, V1TournamentFixture } from '@/types/api';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { MatchCard } from './tournament-bracket';
import { SixTeamBracketLayout, SixTeamBye, type SixTeamStageKey } from './six-team-bracket-layout';

const STAGE_KEYS: Readonly<Record<string, SixTeamStageKey>> = {
  quarter: 'quarter', '6강': 'quarter', semi: 'semi', '준결승': 'semi', final: 'final', '결승': 'final',
};

export function SixTeamBracket({
  state,
  fixtures,
  selectedRoundKey,
  stageLabels = {},
}: {
  tournamentId: string;
  state: V1SixTeamBracket;
  fixtures: V1TournamentFixture[];
  selectedRoundKey?: string | null;
  stageLabels?: Partial<Record<'quarter' | 'semi' | 'final', string>>;
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
  const byeFixture = state.bye ? fixtures.find(row => row.homeRegistrationId === state.bye || row.awayRegistrationId === state.bye) : undefined;
  const byeHome = byeFixture?.homeRegistrationId === state.bye;
  const byePublic = byeFixture && (byeHome ? byeFixture.homeTeamName : byeFixture.awayTeamName) !== null;
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
  const renderLaterMatch = (index: 3 | 4) => {
    const row = rounds[index];
    if (!row) return <p role="alert">경기 정보를 불러오지 못했어요.</p>;
    const home = index === 3 ? '6강 승리팀 중 선정' : state.swapFinal ? '준결승 승리팀' : '결승 직행팀';
    const away = index === 3 ? '6강 승리팀 중 선정' : state.swapFinal ? '결승 직행팀' : '준결승 승리팀';
    return <SixTeamMatch fixture={{
      ...row,
      homeTeamName: row.homeTeamName === 'TBD' ? home : row.homeTeamName,
      awayTeamName: row.awayTeamName === 'TBD' ? away : row.awayTeamName,
    }} />;
  };
  return (
    <div className="space-y-6" aria-label="6강 전용 대진표">
      <p className="tm-text-label text-[var(--text-muted)]">
        6강 토너먼트 · 총 5경기
      </p>
      <SixTeamBracketLayout
        selectedStage={selectedRoundKey ? STAGE_KEYS[selectedRoundKey] : undefined}
        labels={stageLabels}
        swapFinal={state.swapFinal}
        first={<div className="flex flex-col gap-6">
          {rounds
            .slice(0, 3)
            .map((row, i) =>
              row ? (
                <SixTeamMatch
                  key={row.id}
                  fixture={row}
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
        </div>}
        semifinal={renderLaterMatch(3)}
        bye={<SixTeamBye name={teamName(state.bye)} pending={!state.bye}
          teamId={byePublic ? byeHome ? byeFixture.homeTeamId : byeFixture.awayTeamId : null}
          logoUrl={byePublic ? byeHome ? byeFixture.homeTeamLogoUrl : byeFixture.awayTeamLogoUrl : null} />}
        final={renderLaterMatch(4)}
      />
      {(!selectedRoundKey || ['quarter', '6강', 'semi', '준결승'].includes(selectedRoundKey)) && (
      <section
        aria-label="결승 직행 선정"
        className="space-y-3 border-y border-[var(--border)] py-4"
      >
        <div role="heading" aria-level={4}>
          <SectionTitle compact title={`결승 직행 · ${teamName(state.bye)}`} />
        </div>
        <p className="tm-text-label">준결승 부전승 1팀 · 6강 승리팀 중 선정</p>
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
      )}
      {(!selectedRoundKey || selectedRoundKey === 'final' || selectedRoundKey === '결승') && final?.status === 'completed' && (
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
  manualWinner,
}: {
  fixture: V1TournamentFixture;
  manualWinner?: string | null;
}) {
  return (
    <div className="space-y-1">
      <p className="tm-text-micro mb-1 text-[var(--text-caption)]">{fixture.fixtureNumber}번 경기</p>
      <MatchCard fixture={fixture} fluid />
      {manualWinner && (
        <p className="tm-text-caption">운영자 지정 진출팀 · {manualWinner}</p>
      )}
    </div>
  );
}
