import { GameResultStandingsProjectionService } from './game-result-standings-projection.service';
import { GameResultVoidProjectionService } from './game-result-void-projection.service';
import * as canonicalAdvancement from './tournament-team-match-advancement';
import type { GameOperationClaim } from '../jobs/v1-game-operations-worker.service';

const REVISION_ID = 'revision-void-1';
const GAME_ID = 'game-1';
const TOURNAMENT_ID = 'tournament-1';
const MATCH_ID = 'match-1';

function canonicalRow(overrides: Record<string, unknown> = {}) {
  return {
    revisionId: REVISION_ID, gameId: GAME_ID, revision: 2, state: 'VOID',
    score: { home: 1, away: 0 }, sourceHash: 'hash-void-1',
    playedAt: new Date('2026-07-31T09:00:00Z'), officialAt: new Date('2026-08-01T00:00:00Z'),
    reason: 'ADMIN_VOID', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: REVISION_ID,
    teamMatchId: MATCH_ID, tournamentTeamMatchId: MATCH_ID,
    leagueId: null, teamMatchTournamentId: TOURNAMENT_ID, detailsTournamentId: TOURNAMENT_ID,
    homeTeamId: 'team-home', awayTeamId: 'team-away', visibility: 'LIVE', ...overrides,
  };
}

function claim(): GameOperationClaim {
  return {
    id: 'claim-1', businessKey: `game_result_voided:${REVISION_ID}`, aggregateType: 'GAME', aggregateId: GAME_ID,
    revisionId: REVISION_ID, type: 'GAME_RESULT_VOIDED', payload: { revisionId: REVISION_ID }, attempts: 0,
    retryGeneration: 0, version: 1, leaseOwner: 'test-worker', leaseUntil: new Date('2026-01-01T00:10:00.000Z'),
  };
}

function txFor(row: Record<string, unknown>, supersedesId: string | null = null) {
  const queryRaw = jest.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
  const executeRaw = jest.fn().mockResolvedValue(1);
  const findUnique = jest.fn()
    .mockResolvedValueOnce({ supersedesId })
    .mockResolvedValueOnce({ deletedAt: null });
  const findUniqueOrThrow = jest.fn().mockResolvedValue({ gameId: GAME_ID, score: { home: 1, away: 0 } });
  const tx = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    v1GameResultRevision: { findUnique, findUniqueOrThrow },
    v1TeamMatch: { findUnique },
  } as any;
  return { tx, executeRaw, findUnique, findUniqueOrThrow };
}

describe('GameResultVoidProjectionService canonical source', () => {
  afterEach(() => jest.restoreAllMocks());

  it('leaves cache and aggregates untouched when a VOID job is stale', async () => {
    const { tx, executeRaw } = txFor(canonicalRow({ currentOfficialRevisionId: 'newer-official' }));
    await new GameResultVoidProjectionService().handler(claim(), tx);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('uses canonical Details for advancement reversal and standings in the same handler', async () => {
    const { tx } = txFor(canonicalRow(), 'revision-official-1');
    const reverseSpy = jest.spyOn(canonicalAdvancement, 'reverseCanonicalAdvancement').mockResolvedValue(undefined);
    const projectSpy = jest.spyOn(GameResultStandingsProjectionService.prototype, 'project').mockResolvedValue(undefined);
    await new GameResultVoidProjectionService().handler(claim(), tx);
    expect(reverseSpy).toHaveBeenCalledWith(tx, expect.objectContaining({
      tournamentTeamMatchId: MATCH_ID,
    }), { home: 1, away: 0 });
    expect(projectSpy).toHaveBeenCalledWith(tx, expect.objectContaining({ tournamentTeamMatchId: MATCH_ID }));
    expect(tx.$executeRaw).toHaveBeenCalledTimes(5);
  });

  it('fails closed before writes when a canonical VOID has no superseded revision', async () => {
    const { tx, executeRaw } = txFor(canonicalRow());
    await expect(new GameResultVoidProjectionService().handler(claim(), tx)).rejects.toThrow('GAME_RESULT_VOIDED_SUPERSEDES_REQUIRED');
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it.each([
    ['legacy source', { sourceType: 'TOURNAMENT_FIXTURE', teamMatchId: null, tournamentTeamMatchId: null, teamMatchTournamentId: null, detailsTournamentId: null }],
    ['mixed ownership', { leagueId: 'other-league' }],
  ])('rejects %s instead of reviving legacy advancement', async (_label, override) => {
    const { tx, executeRaw } = txFor(canonicalRow(override));
    await expect(new GameResultVoidProjectionService().handler(claim(), tx)).rejects.toThrow();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('rejects a deleted canonical TeamMatch before hiding the public cache', async () => {
    const { tx, executeRaw, findUnique } = txFor(canonicalRow(), 'revision-official-1');
    findUnique.mockReset().mockResolvedValueOnce({ supersedesId: null }).mockResolvedValueOnce({ deletedAt: new Date() });
    await expect(new GameResultVoidProjectionService().handler(claim(), tx)).rejects.toThrow('CANONICAL_MATCH_REQUIRED');
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
