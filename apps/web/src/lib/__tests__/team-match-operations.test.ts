import { describe, expect, it } from 'vitest';
import type { MyTeam, SportTeam, TeamMatch } from '@/types/api';
import {
  buildQuarterScoreMap,
  getGuestTeam,
  getMyParticipantTeams,
  getOutcome,
  getParticipantTeams,
  getQuarterKeys,
  getTeamMatchStatusMeta,
  isArrivalOpen,
  isScoreEditable,
} from '../team-match-operations';

function createTeam(id: string, name: string): SportTeam {
  return {
    id,
    name,
    sportType: 'futsal',
    description: null,
    city: '서울',
    district: null,
    memberCount: 10,
    level: 3,
    isRecruiting: true,
  };
}

function createMatch(): TeamMatch {
  const hostTeam = createTeam('team-host', '호스트');
  const guestTeam = createTeam('team-guest', '원정');

  return {
    id: 'tm-1',
    hostTeamId: hostTeam.id,
    sportType: 'futsal',
    title: '주말 팀 매치',
    matchDate: '2026-04-11',
    startTime: '18:00',
    endTime: '20:00',
    quarterCount: 4,
    venueName: 'A구장',
    venueAddress: '서울시',
    totalFee: 0,
    opponentFee: 0,
    status: 'scheduled',
    hostTeam,
    guestTeam,
  };
}

describe('team-match-operations helpers', () => {
  it('resolves guest team from approved applications when guestTeam is absent', () => {
    const hostTeam = createTeam('team-host', '호스트');
    const guestTeam = createTeam('team-guest', '원정');
    const match = {
      ...createMatch(),
      guestTeam: null,
      guestTeamId: guestTeam.id,
      hostTeam,
      applications: [
        {
          id: 'app-1',
          teamMatchId: 'tm-1',
          applicantTeamId: guestTeam.id,
          status: 'approved',
          message: null,
          applicantTeam: guestTeam,
        },
      ],
    } as TeamMatch;

    expect(getGuestTeam(match)?.id).toBe('team-guest');
  });

  it('returns participant teams and my participant teams consistently', () => {
    const match = createMatch();
    const myTeams = [
      {
        id: 'team-host',
        name: '호스트',
        sportType: 'futsal',
        description: null,
        city: '서울',
        district: null,
        memberCount: 10,
        level: 3,
        isRecruiting: true,
        role: 'manager',
      },
      {
        id: 'team-other',
        name: '기타',
        sportType: 'futsal',
        description: null,
        city: '서울',
        district: null,
        memberCount: 8,
        level: 2,
        isRecruiting: false,
        role: 'member',
      },
    ] as MyTeam[];

    expect(getParticipantTeams(match).map((team) => team.id)).toEqual(['team-host', 'team-guest']);
    expect(getMyParticipantTeams(match, myTeams).map((team) => team.id)).toEqual(['team-host']);
  });

  it('keeps arrival/score status gates aligned with operational contract', () => {
    expect(isArrivalOpen('scheduled')).toBe(true);
    expect(isArrivalOpen('checking_in')).toBe(true);
    expect(isArrivalOpen('in_progress')).toBe(true);
    expect(isArrivalOpen('completed')).toBe(false);

    expect(isScoreEditable('scheduled')).toBe(true);
    expect(isScoreEditable('checking_in')).toBe(true);
    expect(isScoreEditable('in_progress')).toBe(true);
    expect(isScoreEditable('completed')).toBe(false);

    expect(getTeamMatchStatusMeta('checking_in').label).toBe('도착확인중');
    expect(getTeamMatchStatusMeta('unknown').label).toBe('모집중');
  });

  it('builds quarter scores and outcome deterministically', () => {
    expect(getQuarterKeys(3)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(buildQuarterScoreMap(3, { Q1: 2 })).toEqual({ Q1: 2, Q2: 0, Q3: 0 });
    expect(getOutcome(6, 3)).toEqual({ home: 'win', away: 'lose' });
    expect(getOutcome(1, 4)).toEqual({ home: 'lose', away: 'win' });
    expect(getOutcome(2, 2)).toEqual({ home: 'draw', away: 'draw' });
  });
});
