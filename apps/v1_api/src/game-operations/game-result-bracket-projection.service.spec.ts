import { GameResultBracketProjectionService } from './game-result-bracket-projection.service';
import type { OfficialRevisionRow, OfficialScore } from './game-result-official-projection.types';

const SOURCE = 'team-match-source';
const TARGET = 'team-match-target';
const TOURNAMENT = 'tournament-1';
const HOME_REG = 'registration-home';
const AWAY_REG = 'registration-away';

function revisionRow(overrides: Partial<OfficialRevisionRow> = {}): OfficialRevisionRow {
  return {
    revisionId: 'revision-1', gameId: 'game-source', revision: 1,
    score: { home: 1, away: 1 }, sourceHash: 'hash-1', playedAt: new Date('2026-07-31T09:00:00Z'),
    officialAt: new Date('2026-08-01T00:00:00Z'), reason: null, sourceType: 'TEAM_MATCH',
    currentOfficialRevisionId: 'revision-1', tournamentId: TOURNAMENT,
    teamMatchId: SOURCE, tournamentTeamMatchId: SOURCE, teamMatchTournamentId: TOURNAMENT,
    leagueId: null, homeTeamId: 'team-home', awayTeamId: 'team-away', visibility: 'LIVE', ...overrides,
  };
}

function makeTx() {
  const queryRaw = jest.fn()
    // source lock: Game, Details, TeamMatch, sides
    .mockResolvedValueOnce([{ id: 'game-source', teamMatchId: SOURCE, gameState: 'ENDED' }])
    .mockResolvedValueOnce([{ teamMatchId: SOURCE, tournamentId: TOURNAMENT, homeRegistrationId: HOME_REG, awayRegistrationId: AWAY_REG }])
    .mockResolvedValueOnce([{ teamMatchId: SOURCE, tournamentId: TOURNAMENT, status: 'completed', hostTeamId: 'team-home', approvedApplicantTeamId: 'team-away', title: 'Source', startAt: null, endAt: null }])
    .mockResolvedValueOnce([{ id: 'home-side', gameId: 'game-source', sideKey: 'HOME', teamId: 'team-home', displayName: 'Home' }, { id: 'away-side', gameId: 'game-source', sideKey: 'AWAY', teamId: 'team-away', displayName: 'Away' }])
    // advancement edges
    .mockResolvedValueOnce([{ tournamentId: TOURNAMENT, sourceTeamMatchId: SOURCE, sourceOutcome: 'WINNER', targetTeamMatchId: TARGET, targetSide: 'HOME' }])
    // source registrations
    .mockResolvedValueOnce([{ id: HOME_REG, tournamentId: TOURNAMENT, status: 'confirmed', teamId: 'team-home', teamName: 'Home' }, { id: AWAY_REG, tournamentId: TOURNAMENT, status: 'confirmed', teamId: 'team-away', teamName: 'Away' }])
    // target lock: Game, Details, TeamMatch, sides
    .mockResolvedValueOnce([{ id: 'game-target', teamMatchId: TARGET, gameState: 'SCHEDULED' }])
    .mockResolvedValueOnce([{ teamMatchId: TARGET, tournamentId: TOURNAMENT, homeRegistrationId: null, awayRegistrationId: null }])
    .mockResolvedValueOnce([{ teamMatchId: TARGET, tournamentId: TOURNAMENT, status: 'matched', hostTeamId: null, approvedApplicantTeamId: null, title: 'Target', startAt: null, endAt: null }])
    .mockResolvedValueOnce([{ id: 'target-home-side', gameId: 'game-target', sideKey: 'HOME', teamId: null, displayName: null }, { id: 'target-away-side', gameId: 'game-target', sideKey: 'AWAY', teamId: null, displayName: null }])
    // target registration validation
    .mockResolvedValueOnce([{ id: HOME_REG, tournamentId: TOURNAMENT, status: 'confirmed', teamId: 'team-home', teamName: 'Home' }, { id: AWAY_REG, tournamentId: TOURNAMENT, status: 'confirmed', teamId: 'team-away', teamName: 'Away' }]);
  return {
    $queryRaw: queryRaw,
    v1TournamentMatchDetails: { update: jest.fn() },
    v1TeamMatch: { update: jest.fn() },
    v1GameLineup: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    v1TeamTacticsBoard: { deleteMany: jest.fn() },
    v1GameSide: { update: jest.fn() },
    v1GameRosterAdjustment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    v1Game: { update: jest.fn() },
    // 진출한 사이드의 명단 재계산 이벤트(outbox). 실제 계산은 통합 스펙.
    $executeRaw: jest.fn().mockResolvedValue(1),
  } as never;
}

describe('GameResultBracketProjectionService canonical TeamMatch projection', () => {
  const service = new GameResultBracketProjectionService();

  it('uses the canonical advancement path and applies a regulation winner', async () => {
    const tx = makeTx();
    await service.project(tx, revisionRow(), { home: 2, away: 1 });
    expect((tx as any).v1TournamentMatchDetails.update).toHaveBeenCalledWith(expect.objectContaining({ where: { teamMatchId: TARGET }, data: { homeRegistrationId: HOME_REG } }));
    expect((tx as any).v1TeamMatch.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: TARGET }, data: { hostTeamId: 'team-home' } }));
    // 진출한 경기의 명단 재계산 이벤트를 남긴다 — 운영 콘솔 저장이 막혀 있어 이것이 유일한 채움 경로다.
    // 이 트랜잭션은 원천 경기를 먼저 쥐고 있어 대상 경기 명단을 여기서 계산하지 않는다(교착 방지).
    const events = (tx as any).$executeRaw.mock.calls.map((call: unknown[]) => JSON.parse(String(call[6])));
    expect(events).toEqual([{ scope: 'game', gameId: 'game-target' }]);
    // 진출 팀이 아닌 옛 조정은 닫는다 — 같은 팀이 다시 배정돼도 옛 빼기가 되살아나지 않는다.
    expect((tx as any).v1GameRosterAdjustment.updateMany).toHaveBeenCalledWith({
      where: { gameId: 'game-target', sideId: 'target-home-side', revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedByUserId: null, revokedByRole: 'SYSTEM' },
    });
  });

  it.each<OfficialScore>([
    { home: 1, away: 1 },
    { home: 1, away: 1, penalties: { home: 4, away: 4 } },
  ])('rejects an unresolved draw before assigning the target', async (score) => {
    const tx = makeTx();
    await expect(service.project(tx, revisionRow(), score)).rejects.toThrow('BRACKET_RESULT_DRAW_UNSUPPORTED');
    expect((tx as any).v1TournamentMatchDetails.update).not.toHaveBeenCalled();
  });

  it('uses the penalty winner for a tied canonical knockout match', async () => {
    const tx = makeTx();
    await service.project(tx, revisionRow(), { home: 1, away: 1, penalties: { home: 5, away: 4 } });
    expect((tx as any).v1TournamentMatchDetails.update).toHaveBeenCalledWith(expect.objectContaining({ data: { homeRegistrationId: HOME_REG } }));
  });

  it('fails closed for a noncanonical source', async () => {
    const tx = makeTx();
    await expect(service.project(tx, revisionRow({ sourceType: 'TOURNAMENT_FIXTURE' }), { home: 2, away: 1 })).rejects.toThrow('BRACKET_CANONICAL_SOURCE_REQUIRED');
  });

  it('does not project regular league TeamMatches without bracket Details', async () => {
    const tx = makeTx();
    await service.project(tx, revisionRow({ tournamentTeamMatchId: null, tournamentId: null, teamMatchTournamentId: TOURNAMENT, leagueId: TOURNAMENT }), { home: 2, away: 1 });
    expect((tx as any).$queryRaw).not.toHaveBeenCalled();
  });
});
