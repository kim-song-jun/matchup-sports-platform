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

  // close() runs onModuleDestroy hooks, then dispose() (closes the HTTP server and waits for in-flight
  // requests), then onApplicationShutdown. Disconnecting in onModuleDestroy would cut those requests.
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
