import type { PrismaService } from '../../prisma/prisma.service';
import { PublicTeamRecordsService } from './public-team-records.service';

describe('PublicTeamRecordsService', () => {
  it('orders, filters, and presents team records by the match date instead of correction time', async () => {
    const playedAt = new Date('2026-08-09T02:00:00.000Z');
    const officialAt = new Date('2026-08-20T11:00:00.000Z');
    const factFindMany = jest.fn().mockResolvedValue([
      {
        id: 'fact-1',
        revisionId: 'revision-2',
        gameId: 'game-1',
        opponentTeamId: 'team-2',
        tournamentId: 'tournament-1',
        result: 'WON',
        goalsFor: 2,
        goalsAgainst: 1,
        playedAt,
        resultRevision: {
          score: { home: 2, away: 1 },
          goalEvents: null,
          game: {
            currentOfficialRevisionId: 'revision-2',
            teamMatchId: null,
            sides: [
              { id: 'side-home', sideKey: 'HOME', teamId: 'team-1' },
              { id: 'side-away', sideKey: 'AWAY', teamId: 'team-2' },
            ],
            participants: [],
          },
        },
        officialAt,
      },
    ]);
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'fact-1', playedAt }])
      .mockResolvedValueOnce([
        { played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1 },
      ]);
    const prisma = {
      v1Team: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'team-1',
          name: '서울 유나이티드',
          profile: { logoUrl: '/team-1.png' },
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'team-2', name: '부산 FC', profile: { logoUrl: '/team-2.png' } },
        ]),
      },
      v1TeamRecordFact: { findMany: factFindMany },
      v1Tournament: {
        findMany: jest.fn().mockResolvedValue([{ id: 'tournament-1', title: '주말 리그' }]),
      },
      v1GameEvent: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: queryRaw,
    } as unknown as PrismaService;

    const result = await new PublicTeamRecordsService(prisma).getRecords('team-1', {
      season: '2026',
    });

    expect(factFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['fact-1'] } },
      }),
    );
    const pageQuery = queryRaw.mock.calls[0]?.[0] as { strings?: readonly string[] };
    expect(pageQuery.strings?.join(' ')).toContain('ORDER BY trf.played_at DESC, trf.id DESC');
    expect(pageQuery.strings?.join(' ')).toContain('trf.played_at >=');
    expect(result.items[0]).toEqual(
      expect.objectContaining({ playedAt: playedAt.toISOString() }),
    );
    expect(result.items[0]).not.toHaveProperty('officialAt');
  });
});
