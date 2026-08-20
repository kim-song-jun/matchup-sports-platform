import { backfillTournamentAwardRecipients } from './tournament-award-recipient-backfill';

function award(overrides: Record<string, unknown> = {}) {
  return {
    id: 'award-1',
    recipientName: '김선수',
    teamName: '서울 FC',
    tournament: {
      registrations: [
        {
          team: { name: '서울 FC' },
          players: [{ userId: 'user-kim', realName: '김선수' }],
        },
      ],
    },
    ...overrides,
  };
}

function fakePrisma(rows: unknown[]) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  return {
    prisma: {
      v1TournamentAward: {
        findMany: jest.fn().mockResolvedValue(rows),
        updateMany,
      },
    } as never,
    updateMany,
  };
}

describe('backfillTournamentAwardRecipients', () => {
  it('links one confirmed roster user and remains race-safe through updateMany', async () => {
    const { prisma, updateMany } = fakePrisma([award()]);

    const result = await backfillTournamentAwardRecipients(prisma);

    expect(result).toEqual({ candidates: 1, linkable: 1, ambiguous: 0, updated: 1, dryRun: false });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'award-1', recipientUserId: null },
      data: { recipientUserId: 'user-kim' },
    });
  });

  it('does not guess when the same name maps to multiple users', async () => {
    const { prisma, updateMany } = fakePrisma([
      award({
        teamName: null,
        tournament: {
          registrations: [
            { team: { name: '서울 FC' }, players: [{ userId: 'user-a', realName: '김선수' }] },
            { team: { name: '부산 FC' }, players: [{ userId: 'user-b', realName: '김선수' }] },
          ],
        },
      }),
    ]);

    const result = await backfillTournamentAwardRecipients(prisma);

    expect(result).toEqual({ candidates: 1, linkable: 0, ambiguous: 1, updated: 0, dryRun: false });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('dry-run reports linkable rows without writing', async () => {
    const { prisma, updateMany } = fakePrisma([award()]);

    const result = await backfillTournamentAwardRecipients(prisma, { dryRun: true });

    expect(result).toEqual({ candidates: 1, linkable: 1, ambiguous: 0, updated: 0, dryRun: true });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
