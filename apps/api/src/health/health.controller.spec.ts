import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const prismaMock = {
  $queryRaw: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaMock }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── health endpoint ─────────────────────────────────────────────────────────

  describe('health', () => {
    it('returns status ok with database ok when DB responds', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await controller.health();

      expect(result.status).toBe('ok');
      expect(result.services.database).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });

    it('returns status ok with database error when DB is unreachable', async () => {
      prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));

      const result = await controller.health();

      // Overall API still responds with ok status (degraded mode)
      expect(result.status).toBe('ok');
      expect(result.services.database).toBe('error');
    });
  });
});
