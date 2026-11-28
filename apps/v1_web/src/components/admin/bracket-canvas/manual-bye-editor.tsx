'use client';

import { useState } from 'react';
import { useV1CreateBracketBye } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { byeRound } from '@/lib/tournament-bracket-rounds';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketGroupTeam } from '@/types/api';

type Props = {
  tournamentId: string;
  group: V1AdminBracketGroup;
  bye: V1AdminBracketGroupTeam;
  fixtures: readonly V1AdminBracketFixture[];
  groups: readonly V1AdminBracketGroup[];
  teams: readonly { id: string; teamName?: string | null; teamId: string }[];
  canWrite: boolean;
  onSaved: () => void;
};

export function ManualByeEditor({ tournamentId, group, bye, teams, fixtures, groups, canWrite, onSaved }: Props) {
  const save = useV1CreateBracketBye(tournamentId);

  const [team, setTeam] = useState(bye.registrationId ?? '');
  const [position, setPosition] = useState(bye.sortOrder);
  const range = byeRound(group.phase);
  const [target, setTarget] = useState('');
  if (!range) return null;
  const choices = fixtures.filter(f => groups.some(g => g.id === f.groupId && g.phase === range.next &&
    (g.bracketTrack ?? 'overall') === (group.bracketTrack ?? 'overall'))).flatMap(f => (['HOME', 'AWAY'] as const).flatMap(side => {
    const team = side === 'HOME' ? f.homeRegistrationId : f.awayRegistrationId;
    return (side === 'HOME' ? f.homeSlotId : f.awaySlotId) || f.bracketSources?.some(s => s.side === side) || (team && team !== bye.registrationId)
      ? [] : [{ id: f.id + side, fixture: f, side }];
  }));
  return <div className="flex flex-col gap-2">
    <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
      event.preventDefault();
      const dest = choices.find(choice => choice.id === target) ?? choices.find(choice => bye.registrationId &&
        (choice.side === 'HOME' ? choice.fixture.homeRegistrationId : choice.fixture.awayRegistrationId) === bye.registrationId);
      save.mutate({ ...(dest && { targetFixtureId: dest.fixture.id, targetSide: dest.side }), groupId: group.id, byeId: bye.id, registrationId: team || null, sortOrder: position }, { onSuccess: onSaved });
    }}>
      <label>배정팀<select disabled={!canWrite || save.isPending} className="tm-input" value={team} onChange={event => setTeam(event.target.value)}>
        <option value="">미정</option>{teams.map(row => <option key={row.id} value={row.id}>{row.teamName ?? row.teamId}</option>)}
      </select></label>
      <label>대진표 위치<select disabled={!canWrite || save.isPending} className="tm-input" value={position} onChange={event => setPosition(Number(event.target.value))}>
        {Array.from({length: range.positions}, (_, index) => <option key={index} value={index}
          disabled={group.groupTeams.some(other => other.isBye && other.id !== bye.id && other.sortOrder === index)}>{index + 1}번</option>)}
      </select></label>
      <label>직행 경기<select disabled={!canWrite || save.isPending} className="tm-input" value={target} onChange={event => setTarget(event.target.value)}>
        <option value="">기존 연결 유지</option>{choices.map(choice => <option key={choice.id} value={choice.id}>
          {choice.fixture.fixtureNumber}번 경기 · {choice.side === 'HOME' ? '홈' : '원정'}
        </option>)}
      </select></label>
      <button className="tm-btn tm-btn-md tm-btn-primary" disabled={!canWrite || save.isPending}>부전승 저장</button>
      {save.isError && <p role="alert">{extractErrorMessage(save.error, '부전승을 저장하지 못했어요.')}</p>}
    </form>
  </div>;
}
