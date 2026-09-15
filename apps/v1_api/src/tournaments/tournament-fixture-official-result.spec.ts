import type { Prisma } from '@prisma/client';
import {
  hasTournamentFixtureOfficialResult,
  parseTournamentFixtureOfficialScore,
  resolveTournamentFixtureOfficialResult,
  resolveTournamentFixtureOfficialScore,
  resolveTournamentFixtureOfficialTimestamp,
  type TournamentFixtureGameForResult,
} from './tournament-fixture-official-result';

function officialGame(overrides: Record<string, unknown> = {}): TournamentFixtureGameForResult {
  return {
    sides: [
      { id: 'side-home', sideKey: 'HOME' },
      { id: 'side-away', sideKey: 'AWAY' },
    ],
    participants: [{ id: 'player-1', displayNameSnapshot: '등록 선수', userId: 'user-1' }],
    events: [
      { id: 'event-1', type: 'GOAL', sideId: 'side-home', participantId: 'player-1', clockMs: 60000, reversesEventId: null, payload: null },
    ],
    currentOfficialRevision: {
      id: 'revision-1',
      state: 'OFFICIAL',
      score: { home: 2, away: 1 } satisfies Prisma.JsonObject,
      officialAt: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    ...overrides,
  } as TournamentFixtureGameForResult;
}

describe('canonical official result resolver', () => {
  it('reads score only from an OFFICIAL canonical revision', () => {
    expect(resolveTournamentFixtureOfficialScore(officialGame())).toEqual({
      homeScore: 2,
      awayScore: 1,
      hasPenalty: false,
      homePenaltyScore: null,
      awayPenaltyScore: null,
    });
  });

  it('returns null for missing, VOID, and malformed revisions', () => {
    expect(resolveTournamentFixtureOfficialScore(null)).toBeNull();
    expect(resolveTournamentFixtureOfficialScore({ currentOfficialRevision: { state: 'VOID', score: { home: 2, away: 1 } } })).toBeNull();
    expect(resolveTournamentFixtureOfficialScore({ currentOfficialRevision: { state: 'OFFICIAL', score: { invalid: true } } })).toBeNull();
  });

  it('preserves flat and backfilled penalty score shapes', () => {
    expect(parseTournamentFixtureOfficialScore({ home: 1, away: 1, penalties: { home: 5, away: 4 } })).toEqual({
      homeScore: 1,
      awayScore: 1,
      hasPenalty: true,
      homePenaltyScore: 5,
      awayPenaltyScore: 4,
    });
    expect(parseTournamentFixtureOfficialScore({ regulation: { home: 1, away: 1 }, penalty: { home: 5, away: 4 } })).toEqual({
      homeScore: 1,
      awayScore: 1,
      hasPenalty: true,
      homePenaltyScore: 5,
      awayPenaltyScore: 4,
    });
  });

  it('projects canonical score, lineage note, outcome, and participant identity', () => {
    const result = resolveTournamentFixtureOfficialResult(officialGame({
      currentOfficialRevision: {
        id: 'revision-2',
        state: 'OFFICIAL',
        score: { home: 0, away: 0 } satisfies Prisma.JsonObject,
        outcomeReason: 'FORFEIT',
        tournamentResultLineages: [{ note: '이관 근거' }],
        officialAt: new Date('2026-08-02T00:00:00.000Z'),
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
        updatedAt: new Date('2026-08-02T00:00:00.000Z'),
      },
    }));
    expect(result).toMatchObject({ revisionId: 'revision-2', note: '이관 근거', outcomeReason: 'FORFEIT' });
    expect(result?.goals).toEqual([
      { id: 'event-1', team: 'home', playerId: 'player-1', playerUserId: 'user-1', playerName: '등록 선수', minute: 1 },
    ]);
  });

  it('fails closed for missing, VOID, and conflicting canonical revisions', () => {
    expect(resolveTournamentFixtureOfficialResult(null)).toBeNull();
    expect(resolveTournamentFixtureOfficialResult(officialGame({
      currentOfficialRevision: { id: 'void-1', state: 'VOID', score: { home: 2, away: 1 }, officialAt: null, createdAt: new Date(), updatedAt: new Date() },
    }))).toBeNull();
    expect(resolveTournamentFixtureOfficialResult(officialGame({
      currentOfficialRevision: {
        id: 'revision-conflict', state: 'OFFICIAL', score: { home: 2, away: 1 },
        tournamentResultLineages: [{ note: 'A' }, { note: 'B' }], createdAt: new Date(), updatedAt: new Date(), officialAt: new Date(),
      },
    }))?.note).toBeNull();
  });
});

describe('canonical official guards', () => {
  it('requires an OFFICIAL canonical revision', () => {
    expect(hasTournamentFixtureOfficialResult(null)).toBe(false);
    expect(hasTournamentFixtureOfficialResult({ currentOfficialRevision: { state: 'VOID' } })).toBe(false);
    expect(hasTournamentFixtureOfficialResult({ currentOfficialRevision: { state: 'OFFICIAL' } })).toBe(true);
  });

  it('uses only canonical officialAt', () => {
    const officialAt = new Date('2026-08-01T00:00:00.000Z');
    expect(resolveTournamentFixtureOfficialTimestamp({ currentOfficialRevision: { state: 'OFFICIAL', officialAt } })).toEqual(officialAt);
    expect(resolveTournamentFixtureOfficialTimestamp(null)).toBeNull();
    expect(resolveTournamentFixtureOfficialTimestamp({ currentOfficialRevision: { state: 'VOID', officialAt: null } })).toBeNull();
  });
});
