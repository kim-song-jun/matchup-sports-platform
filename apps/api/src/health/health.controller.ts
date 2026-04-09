import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';

@ApiTags('시스템')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get('health')
  @ApiOperation({ summary: '헬스체크' })
  async health() {
    const dbOk = await this.prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false);

    const redisOk = await this.redis
      .ping()
      .then(() => true)
      .catch(() => false);

    return {
      status: dbOk && redisOk ? 'ok' : 'degraded',
      checks: { db: dbOk, redis: redisOk },
      timestamp: new Date().toISOString(),
    };
  }
}
