import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as supertest from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';

export interface TestApp {
  app: INestApplication;
  request: supertest.Agent;
  close: () => Promise<void>;
}

/**
 * Bootstraps the full NestJS application for integration tests.
 * Mirrors the global configuration from main.ts so filter, interceptor,
 * and validation behaviour is identical to production.
 */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.setGlobalPrefix('api/v1');
  await app.init();

  const httpServer = app.getHttpServer();
  const request = supertest.agent(httpServer);

  return {
    app,
    request,
    close: () => app.close(),
  };
}
