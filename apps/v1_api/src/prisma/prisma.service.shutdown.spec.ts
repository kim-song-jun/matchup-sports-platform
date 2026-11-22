import { Controller, Get, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

const events: string[] = [];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Controller('slow')
class SlowController {
  @Get()
  async slow() {
    await sleep(150);
    events.push('request-finished');
    return { ok: true };
  }
}

@Injectable()
class DrainingConsumer implements OnModuleDestroy {
  async onModuleDestroy() {
    await sleep(100);
    events.push('consumer-drained');
  }
}

@Module({ imports: [PrismaModule], controllers: [SlowController], providers: [DrainingConsumer] })
class ConsumerModule {}

function get(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    request({ port, path: '/slow', agent: false }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    })
      .on('error', reject)
      .end();
  });
}

describe('PrismaService shutdown order', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    events.length = 0;
  });

  it('disconnects only after in-flight requests and module destroy hooks have finished', async () => {
    jest.spyOn(PrismaService.prototype, '$connect').mockResolvedValue(undefined);
    jest.spyOn(PrismaService.prototype, '$disconnect').mockImplementation(async () => {
      events.push('prisma-disconnected');
    });
    const moduleRef = await Test.createTestingModule({ imports: [ConsumerModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.listen(0);
    const port = (app.getHttpServer().address() as AddressInfo).port;

    const inFlight = get(port);
    await sleep(30);
    await app.close();

    expect(await inFlight).toBe(200);
    expect(events.at(-1)).toBe('prisma-disconnected');
    expect(events).toEqual(expect.arrayContaining(['request-finished', 'consumer-drained']));
    expect(events.filter((event) => event === 'prisma-disconnected')).toHaveLength(1);
  });
});
