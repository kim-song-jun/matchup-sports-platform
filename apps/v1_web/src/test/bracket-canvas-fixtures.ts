import type {
  V1AdminBracketFixture,
  V1AdminBracketFixtureGame,
  V1AdminBracketGroup,
  V1AdminBracketSlot,
  V1AdminTournamentBracket,
} from '@/types/api';

const STAMP = '2026-10-08T00:00:00.000Z';

export function makeGroup(
  overrides: Partial<V1AdminBracketGroup> & Pick<V1AdminBracketGroup, 'id' | 'name' | 'phase'>,
): V1AdminBracketGroup {
  return {
    tournamentId: 't-1',
    sortOrder: 0,
    advanceCount: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    groupTeams: [],
    ...overrides,
  };
}

export function makeFixture(
  overrides: Partial<V1AdminBracketFixture> & Pick<V1AdminBracketFixture, 'id' | 'groupId' | 'fixtureNumber'>,
): V1AdminBracketFixture {
  return {
    tournamentId: 't-1',
    round: '8강',
    legNumber: 1,
    parentFixtureId: null,
    homeRegistrationId: null,
    homeTeamName: '홈 팀 미정',
    awayRegistrationId: null,
    awayTeamName: '어웨이 팀 미정',
    scheduledAt: null,
    venue: null,
    status: 'scheduled',
    createdAt: STAMP,
    updatedAt: STAMP,
    result: null,
    videos: [],
    homeSlotId: null,
    awaySlotId: null,
    game: null,
    ...overrides,
  };
}

export function makeSlot(overrides: Partial<V1AdminBracketSlot> & Pick<V1AdminBracketSlot, 'id'>): V1AdminBracketSlot {
  return {
    kind: 'ENTRY',
    groupId: null,
    sourceGroupId: null,
    position: 1,
    label: '1번 자리',
    registrationId: null,
    teamName: null,
    ...overrides,
  };
}

export function makeGame(overrides: Partial<V1AdminBracketFixtureGame> = {}): V1AdminBracketFixtureGame {
  return { id: 'game-1', state: 'SCHEDULED', version: 1, hasLiveRecords: false, latestRevision: null, ...overrides };
}

export function makeBracket(overrides: Partial<V1AdminTournamentBracket> = {}): V1AdminTournamentBracket {
  return { groups: [], fixtures: [], standings: [], slots: [], ...overrides };
}
