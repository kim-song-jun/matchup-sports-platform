import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const prismaMock = {
  $queryRaw: jest.fn(),
};

const redisMock = {
  ping: jest.fn(),
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
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── health endpoint ─────────────────────────────────────────────────────────

  describe('health', () => {
    it('returns status ok when both DB and Redis respond', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisMock.ping.mockResolvedValue('PONG');

      const result = await controller.health();

      expect(result.status).toBe('ok');
      expect(result.checks.db).toBe(true);
      expect(result.checks.redis).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it('returns status degraded when DB is unreachable', async () => {
      prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));
      redisMock.ping.mockResolvedValue('PONG');

      const result = await controller.health();

      expect(result.status).toBe('degraded');
      expect(result.checks.db).toBe(false);
      expect(result.checks.redis).toBe(true);
    });

    it('returns status degraded when Redis is unreachable', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisMock.ping.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await controller.health();

      expect(result.status).toBe('degraded');
      expect(result.checks.db).toBe(true);
      expect(result.checks.redis).toBe(false);
    });

    it('returns status degraded when both DB and Redis are unreachable', async () => {
      prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));
      redisMock.ping.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await controller.health();

      expect(result.status).toBe('degraded');
      expect(result.checks.db).toBe(false);
      expect(result.checks.redis).toBe(false);
    });
  });
});
