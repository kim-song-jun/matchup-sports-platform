import type { PrismaClient } from '@prisma/client';
import { runParticipantIdentityLinkBackfill } from './participant-identity-link-backfill';

describe('runParticipantIdentityLinkBackfill', () => {
  it('is dry-run by contract and reports candidates without writing', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'tournament-1' }])
        .mockResolvedValueOnce([
          { participant_id: 'participant-1', user_id: 'user-1' },
          { participant_id: 'participant-2', user_id: 'user-2' },
        ]),
      $transaction: jest.fn(),
    } as unknown as PrismaClient;

    await expect(
      runParticipantIdentityLinkBackfill(prisma, {
        tournamentId: 'tournament-1',
        mode: 'dry-run',
      }),
    ).resolves.toEqual({
      tournamentId: 'tournament-1',
      mode: 'dry-run',
      candidates: 2,
      linked: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes a system roster assertion and matching current link only in apply mode', async () => {
    const effectiveAt = new Date('2026-08-20T00:00:00.000Z');
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'tournament-1' }])
        .mockResolvedValueOnce([{ participant_id: 'participant-1', user_id: 'user-1' }]),
      v1ParticipantIdentityLinkEvent: {
        create: jest.fn().mockResolvedValue({
          linkId: 'generated-in-service',
          eventVersion: 1,
          effectiveAt,
        }),
      },
      v1ParticipantIdentityLinkCurrent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    } as unknown as PrismaClient;

    await expect(
      runParticipantIdentityLinkBackfill(prisma, {
        tournamentId: 'tournament-1',
        mode: 'apply',
      }),
    ).resolves.toEqual({
      tournamentId: 'tournament-1',
      mode: 'apply',
      candidates: 1,
      linked: 1,
    });
    expect(tx.v1ParticipantIdentityLinkEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        participantId: 'participant-1',
        userId: 'user-1',
        action: 'ROSTER_ASSERTED',
        actorType: 'SYSTEM',
        systemActor: 'GAME_BACKFILL',
        reason: 'tournament:tournament-1:source-participant-user-id',
      }),
    });
    const eventInput = tx.v1ParticipantIdentityLinkEvent.create.mock.calls[0][0].data;
    expect(tx.v1ParticipantIdentityLinkCurrent.create).toHaveBeenCalledWith({
      data: {
        participantId: 'participant-1',
        linkId: eventInput.linkId,
        userId: 'user-1',
        version: 1,
        effectiveFrom: effectiveAt,
      },
    });
  });

  it('fails closed when the exact tournament does not exist', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
    } as unknown as PrismaClient;

    await expect(
      runParticipantIdentityLinkBackfill(prisma, {
        tournamentId: 'missing-tournament',
        mode: 'dry-run',
      }),
    ).rejects.toThrow('Tournament not found: missing-tournament');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
