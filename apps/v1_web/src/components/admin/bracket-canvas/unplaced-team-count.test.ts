import { describe, expect, it } from 'vitest';
import { makeFixture, makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import { unplacedTeamCount } from './unplaced-team-count';

const registrations = [
  makeRegistration({ id: 'r1', teamName: '서울FC' }),
  makeRegistration({ id: 'r2', teamName: '부산FC' }),
  makeRegistration({ id: 'r3', teamName: '대구FC' }),
  makeRegistration({ id: 'r4', teamName: '신청중FC', status: 'pending' }),
];

describe('unplacedTeamCount', () => {
  it('확정된 팀만 세고, 자리에 들어간 팀·순위 자리의 팀은 구분한다', () => {
    const slots = [
      makeSlot({ id: 's1', registrationId: 'r1' }),
      makeSlot({ id: 'rank', kind: 'GROUP_RANK', registrationId: 'r2' }),
    ];
    expect(unplacedTeamCount(registrations, { fixtures: [], slots })).toBe(2);
  });

  it('경기에 직접 들어간 팀은 세지 않는다', () => {
    const fixture = makeFixture({ id: 'f1', groupId: null, fixtureNumber: 1, homeRegistrationId: 'r3', homeTeamName: '대구FC' });
    expect(unplacedTeamCount(registrations, { fixtures: [fixture], slots: [] })).toBe(2);
  });

  it('모두 들어가면 0', () => {
    const slots = ['r1', 'r2', 'r3'].map((id) => makeSlot({ id: `s-${id}`, registrationId: id }));
    expect(unplacedTeamCount(registrations, { fixtures: [], slots })).toBe(0);
  });
});
