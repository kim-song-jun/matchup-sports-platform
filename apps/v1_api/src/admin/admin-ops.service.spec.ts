import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOpsService } from './admin-ops.service';
import { createHash } from 'node:crypto';

describe('AdminOpsService', () => {
  let service: AdminOpsService;
  const prisma = {
    v1WebPushFailureLog: { findMany: jest.fn(), updateMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AdminOpsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AdminOpsService);
  });

  it('masks the userId as a sha256 8-char hash and keeps only the last 6 chars of the endpoint suffix', async () => {
    prisma.v1WebPushFailureLog.findMany.mockResolvedValue([
      {
        id: 'fail-1',
        userId: 'user-1',
        endpointSuffix: 'abcdefghijkl',
        statusCode: 500,
        occurredAt: new Date('2026-07-19T00:00:00Z'),
        acknowledgedAt: null,
      },
    ]);

    const result = await service.recentPushFailures(20);

    const expectedHash = createHash('sha256').update('user-1').digest('hex').slice(0, 8);
    expect(result[0].userIdHash).toBe(expectedHash);
    expect(result[0].endpointSuffix).toBe('ghijkl');
    expect(result[0]).not.toHaveProperty('userId');
  });

  it('ack records acknowledgedAt and acknowledgedBy for every id in one bulk update', async () => {
    await service.acknowledgeFailures(['fail-1', 'fail-2'], 'admin-user-1');

    expect(prisma.v1WebPushFailureLog.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['fail-1', 'fail-2'] } },
      data: expect.objectContaining({ acknowledgedBy: 'admin-user-1' }),
    });
  });
});
