import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceCron } from './marketplace.cron';
import { PrismaService } from '../prisma/prisma.service';
import { MarketplaceService } from './marketplace.service';
import { OrderStatus, DisputeStatus } from '@prisma/client';

const prismaMock = {
  marketplaceOrder: {
    findMany: jest.fn(),
  },
};

const marketplaceServiceMock = {
  autoRelease: jest.fn(),
};

describe('MarketplaceCron', () => {
  let cron: MarketplaceCron;

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.DISABLE_MARKETPLACE_CRON;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceCron,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MarketplaceService, useValue: marketplaceServiceMock },
      ],
    }).compile();

    cron = module.get<MarketplaceCron>(MarketplaceCron);
  });

  it('should be defined', () => {
    expect(cron).toBeDefined();
  });

  describe('autoReleaseEscrow', () => {
    it('calls autoRelease for each eligible order', async () => {
      prismaMock.marketplaceOrder.findMany.mockResolvedValue([
        { id: 'order-1', orderId: 'MU-MKT-001' },
        { id: 'order-2', orderId: 'MU-MKT-002' },
      ]);
      marketplaceServiceMock.autoRelease.mockResolvedValue(undefined);

      await cron.autoReleaseEscrow();

      expect(marketplaceServiceMock.autoRelease).toHaveBeenCalledTimes(2);
      expect(marketplaceServiceMock.autoRelease).toHaveBeenCalledWith('order-1');
      expect(marketplaceServiceMock.autoRelease).toHaveBeenCalledWith('order-2');
    });

    it('does nothing when there are no eligible orders', async () => {
      prismaMock.marketplaceOrder.findMany.mockResolvedValue([]);

      await cron.autoReleaseEscrow();

      expect(marketplaceServiceMock.autoRelease).not.toHaveBeenCalled();
    });

    it('queries only escrow_held/shipped/delivered orders past autoReleaseAt', async () => {
      prismaMock.marketplaceOrder.findMany.mockResolvedValue([]);

      await cron.autoReleaseEscrow();

      expect(prismaMock.marketplaceOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: expect.arrayContaining([
                OrderStatus.escrow_held,
                OrderStatus.shipped,
                OrderStatus.delivered,
              ]),
            },
            autoReleaseAt: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('excludes orders with open disputes', async () => {
      prismaMock.marketplaceOrder.findMany.mockResolvedValue([]);

      await cron.autoReleaseEscrow();

      const whereClause = prismaMock.marketplaceOrder.findMany.mock.calls[0][0].where;
      expect(whereClause.disputes).toEqual({
        none: {
          status: {
            notIn: expect.arrayContaining([
              DisputeStatus.resolved_refund,
              DisputeStatus.resolved_release,
            ]),
          },
        },
      });
    });

    it('skips execution when DISABLE_MARKETPLACE_CRON is true', async () => {
      process.env.DISABLE_MARKETPLACE_CRON = 'true';

      await cron.autoReleaseEscrow();

      expect(prismaMock.marketplaceOrder.findMany).not.toHaveBeenCalled();
      expect(marketplaceServiceMock.autoRelease).not.toHaveBeenCalled();
    });

    it('continues processing remaining orders when one autoRelease fails', async () => {
      prismaMock.marketplaceOrder.findMany.mockResolvedValue([
        { id: 'order-fail', orderId: 'MU-MKT-FAIL' },
        { id: 'order-ok', orderId: 'MU-MKT-OK' },
      ]);
      marketplaceServiceMock.autoRelease
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(undefined);

      // Should not throw despite first failure
      await expect(cron.autoReleaseEscrow()).resolves.toBeUndefined();

      expect(marketplaceServiceMock.autoRelease).toHaveBeenCalledTimes(2);
    });
  });
});
