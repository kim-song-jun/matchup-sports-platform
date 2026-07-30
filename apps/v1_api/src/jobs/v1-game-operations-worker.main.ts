import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { V1GameOperationsWorkerModule } from './v1-game-operations-worker.module';
import { V1GameOperationsWorkerService } from './v1-game-operations-worker.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(V1GameOperationsWorkerModule);
  const worker = app.get(V1GameOperationsWorkerService);
  worker.registerDurableAuditHandler('GAME_OPERATION_FLAG_CHANGED');
  worker.registerDurableAuditHandler('GAME_OPERATION_JOB_REQUEUED');

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  app.enableShutdownHooks();
  await app.listen(workerPort());

  try {
    await worker.run();
  } catch (error) {
    await worker.shutdown();
    await app.close();
    throw error;
  }
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`v1 game operations worker terminated: ${message}`);
  process.exitCode = 1;
});

function workerPort(): number {
  const value = process.env.WORKER_PORT;
  const port = value === undefined ? 8122 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('WORKER_PORT must be an integer between 1 and 65535');
  }
  return port;
}
