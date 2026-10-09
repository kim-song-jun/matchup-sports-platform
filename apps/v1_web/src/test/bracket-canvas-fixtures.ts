import type {
  V1AdminBracketFixture,
  V1AdminBracketFixtureGame,
  V1AdminBracketGroup,
  V1AdminBracketSlot,
  V1AdminBracketStanding,
  V1AdminTournamentBracket,
  V1AdminTournamentRegistration,
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
  return { id: 'game-1', state: 'SCHEDULED', version: 1, hasLiveRecords: false, hasOfficialResult: false, latestRevision: null, ...overrides };
}

export function makeBracket(overrides: Partial<V1AdminTournamentBracket> = {}): V1AdminTournamentBracket {
  return { groups: [], fixtures: [], standings: [], slots: [], ...overrides };
}

/** 어드민 등록 목록 항목 — 이 화면은 id·teamName·status 만 읽는다(기존 bracket-tab 테스트와 같은 방식으로 나머지는 단언). */
export function makeRegistration(
  overrides: Partial<V1AdminTournamentRegistration> & Pick<V1AdminTournamentRegistration, 'id' | 'teamName'>,
): V1AdminTournamentRegistration {
  return {
    tournamentId: 't-1',
    teamId: `team-${overrides.id}`,
    appliedByUserId: 'u-1',
    status: 'confirmed',
    confirmedAt: STAMP,
    confirmedByAdminUserId: 'admin-1',
    payment: null,
    ...overrides,
  } as unknown as V1AdminTournamentRegistration;
}

export function makeStanding(
  overrides: Partial<V1AdminBracketStanding> & Pick<V1AdminBracketStanding, 'groupId' | 'registrationId'>,
): V1AdminBracketStanding {
  return {
    id: `st-${overrides.registrationId}`,
    teamName: `팀 ${overrides.registrationId}`,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    position: 1,
    recalculatedAt: STAMP,
    ...overrides,
  };
}
