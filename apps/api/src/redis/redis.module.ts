import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const url = config.get<string>('redis.url') ?? 'redis://localhost:6379/0';
        return new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 1 });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
