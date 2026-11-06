'use client';

import type { ReactNode } from 'react';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminTournamentRegistration, V1SixTeamBracket } from '@/types/api';
import { SixTeamBracketLayout, SixTeamBye } from '@/components/tournaments/six-team-bracket-layout';
import { useV1Team } from '@/hooks/use-v1-api';

function AssignedBye({ teamId, name }: { teamId: string; name: string }) {
  const team = useV1Team(teamId);
  return <SixTeamBye name={name} pending={false} teamId={teamId} logoUrl={team.data?.logoUrl} />;
}

/** The persisted six-team state also covers tournaments created before this view existed. */
export function SixTeamAdminBracket({ state, fixtures, groups, registrations = [], renderFixture }: {
  state: V1SixTeamBracket;
  fixtures: V1AdminBracketFixture[];
  groups: V1AdminBracketGroup[];
  registrations?: readonly V1AdminTournamentRegistration[];
  renderFixture: (fixture: V1AdminBracketFixture, labels?: { HOME: string; AWAY: string }) => ReactNode;
}) {
  const rows = state.rounds.map(id => fixtures.find(row => row.id === id));
  const render = (index: number) => {
    const row = rows[index];
    if (!row) return <p role="alert">경기 정보를 불러오지 못했어요.</p>;
    if (index < 3) return renderFixture(row);
    const home = index === 3 ? '6강 승리팀 중 선정' : state.swapFinal ? '준결승 승리팀' : '결승 직행팀';
    const away = index === 3 ? '6강 승리팀 중 선정' : state.swapFinal ? '결승 직행팀' : '준결승 승리팀';
    return renderFixture(row, {
      HOME: row.homeRegistrationId ? row.homeTeamName : row.homeDisplayLabel || home,
      AWAY: row.awayRegistrationId ? row.awayTeamName : row.awayDisplayLabel || away,
    });
  };
  const source = state.bye ? fixtures.find(row => row.homeRegistrationId === state.bye || row.awayRegistrationId === state.bye) : undefined;
  const name = source ? (source.homeRegistrationId === state.bye ? source.homeTeamName : source.awayTeamName) : state.bye ? '비공개' : '선정 대기';
  const byeTeamId = registrations.find(row => row.id === state.bye)?.teamId;
  const label = (index: number) => groups.find(group => group.id === rows[index]?.groupId)?.name;
  return <SixTeamBracketLayout
    surface="admin"
    labels={{ quarter: label(0), semi: label(3), final: label(4) }}
    swapFinal={state.swapFinal}
    first={<div className="flex flex-col gap-6">{rows.slice(0, 3).map((_, index) => <div key={state.rounds[index]}>{render(index)}</div>)}</div>}
    semifinal={render(3)}
    bye={byeTeamId ? <AssignedBye teamId={byeTeamId} name={name} /> : <SixTeamBye name={name} pending={!state.bye} />}
    final={render(4)}
  />;
}
