import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { INestApplication, ValidationError } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

class IntegrationTestSetupError extends Error {}

export async function createV1IntegrationApp(): Promise<{
  app: INestApplication;
  cleanup: () => Promise<void>;
}> {
  assertApprovedIntegrationDatabase(process.env.DATABASE_URL);
  const originalWorkingDirectory = process.cwd();
  const isolatedConfigDirectory = await mkdtemp(join(tmpdir(), 'teameet-v1-api-integration-'));
  process.chdir(isolatedConfigDirectory);

  let app: INestApplication | undefined;
  let setupFailure: { readonly error: unknown } | undefined;
  try {
    const [appModule, transformInterceptor] = await Promise.all([
      import('../../src/app.module'),
      import('../../src/common/interceptors/transform.interceptor'),
    ]);
    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        exceptionFactory: (errors: ValidationError[]) => {
          const details = errors.map((error) => ({
            field: error.property,
            messages: error.constraints ? Object.values(error.constraints) : [],
          }));
          return new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: '입력값을 다시 확인해 주세요.',
            details,
          });
        },
      }),
    );
    // AllExceptionsFilter is registered globally via AppModule's APP_FILTER provider
    // (needed for its PinoLogger DI) — no manual useGlobalFilters() call here.
    app.useGlobalInterceptors(new transformInterceptor.TransformInterceptor());
    await app.init();
  } catch (error) {
    setupFailure = { error };
  } finally {
    process.chdir(originalWorkingDirectory);
  }

  if (setupFailure) {
    const cleanupErrors: unknown[] = [];
    try {
      await app?.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await rm(isolatedConfigDirectory, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [setupFailure.error, ...cleanupErrors],
        'V1 integration app setup and cleanup both failed.',
      );
    }
    throw setupFailure.error;
  }

  if (!app) {
    await rm(isolatedConfigDirectory, { recursive: true, force: true });
    throw new IntegrationTestSetupError('V1 integration app failed to initialize.');
  }
  const initializedApp = app;
  return {
    app: initializedApp,
    cleanup: async () => {
      try {
        await initializedApp.close();
      } finally {
        process.chdir(originalWorkingDirectory);
        await rm(isolatedConfigDirectory, { recursive: true });
      }
    },
  };
}

function assertApprovedIntegrationDatabase(databaseUrl: string | undefined): void {
  if (databaseUrl === undefined) {
    throw new IntegrationTestSetupError('DATABASE_URL is required for V1 API integration tests.');
  }

  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new IntegrationTestSetupError('DATABASE_URL must identify an approved isolated database.');
    }
    throw error;
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
  } catch (error) {
    if (error instanceof URIError) {
      throw new IntegrationTestSetupError('DATABASE_URL must identify an approved isolated database.');
    }
    throw error;
  }

  const hostname = parsedDatabaseUrl.hostname === '[::1]' ? '::1' : parsedDatabaseUrl.hostname;
  const isPostgres = ['postgresql:', 'postgres:'].includes(parsedDatabaseUrl.protocol);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  const isAllowed =
    databaseName === 'v1_migrate_check' || databaseName.startsWith('ulw_v1_integration_');
  if (!isPostgres || !isLocal || !isAllowed) {
    throw new IntegrationTestSetupError(
      'V1 API integration tests require an approved isolated database.',
    );
  }
}
