import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  async onModuleInit() {
    await this.$connect();
  }

  // Nest destroys the @Global module first (onModuleDestroy runs by descending module distance), and only
  // then closes the HTTP server. Disconnecting there would cut in-flight requests and the worker's drain.
  // onApplicationShutdown runs after both.
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
