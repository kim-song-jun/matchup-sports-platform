import {
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import type {
  INestApplication,
  ValidationError,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request = require('supertest');

class IntegrationTestSetupError extends Error {}

describe('V1 API integration contract', () => {
  const originalWorkingDirectory = process.cwd();
  let app: INestApplication;
  let isolatedConfigDirectory: string | undefined;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl === undefined) {
      throw new IntegrationTestSetupError(
        'DATABASE_URL is required for V1 API integration tests.',
      );
    }

    let parsedDatabaseUrl: URL;
    try {
      parsedDatabaseUrl = new URL(databaseUrl);
    } catch (error) {
      if (error instanceof TypeError) {
        throw new IntegrationTestSetupError(
          'DATABASE_URL must identify an approved isolated database.',
        );
      }
      throw error;
    }

    let databaseName: string;
    try {
      databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
    } catch (error) {
      if (error instanceof URIError) {
        throw new IntegrationTestSetupError(
          'DATABASE_URL must identify an approved isolated database.',
        );
      }
      throw error;
    }

    const databaseHostname =
      parsedDatabaseUrl.hostname === '[::1]'
        ? '::1'
        : parsedDatabaseUrl.hostname;
    const isPostgresProtocol =
      parsedDatabaseUrl.protocol === 'postgresql:' ||
      parsedDatabaseUrl.protocol === 'postgres:';
    const isLocalDatabaseHost = [
      'localhost',
      '127.0.0.1',
      '::1',
    ].includes(databaseHostname);
    const isAllowedDatabase =
      databaseName === 'v1_migrate_check' ||
      databaseName.startsWith('ulw_v1_integration_');
    if (!isPostgresProtocol || !isLocalDatabaseHost || !isAllowedDatabase) {
      throw new IntegrationTestSetupError(
        'V1 API integration tests require an approved isolated database.',
      );
    }

    isolatedConfigDirectory = await mkdtemp(
      join(tmpdir(), 'teameet-v1-api-integration-'),
    );
    process.chdir(isolatedConfigDirectory);

    try {
      const [appModule, exceptionFilter, transformInterceptor] =
        await Promise.all([
          import('../../src/app.module'),
          import('../../src/common/filters/http-exception.filter'),
          import('../../src/common/interceptors/transform.interceptor'),
        ]);
      const moduleRef = await Test.createTestingModule({
        imports: [appModule.AppModule],
      }).compile();

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
              messages: error.constraints
                ? Object.values(error.constraints)
                : [],
            }));
            return new BadRequestException({
              code: 'VALIDATION_ERROR',
              message: '입력값을 다시 확인해 주세요.',
              details,
            });
          },
        }),
      );
      app.useGlobalFilters(new exceptionFilter.AllExceptionsFilter());
      app.useGlobalInterceptors(
        new transformInterceptor.TransformInterceptor(),
      );
      await app.init();
    } finally {
      process.chdir(originalWorkingDirectory);
    }
  });

  afterAll(async () => {
    try {
      if (app) {
        await app.close();
      }
    } finally {
      process.chdir(originalWorkingDirectory);
      if (isolatedConfigDirectory !== undefined) {
        await rm(isolatedConfigDirectory, { recursive: true });
      }
    }
  });

  it('returns the wrapped health contract when the real database is reachable', async () => {
    // Given: the real AppModule is connected to a freshly migrated database.

    // When: the public health endpoint is requested through Nest HTTP.
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    // Then: the production envelope reports the V1 service and DB check.
    expect(response.body).toEqual({
      status: 'success',
      data: {
        service: 'v1_api',
        checks: { db: true },
      },
      timestamp: expect.any(String),
    });
    expect(new Date(response.body.timestamp).toISOString()).toBe(
      response.body.timestamp,
    );
  });

  it('returns an empty wrapped tournament page when the migrated database is empty', async () => {
    // Given: the real AppModule is connected to a freshly migrated empty database.

    // When: the public tournament collection is requested through Nest HTTP.
    const response = await request(app.getHttpServer())
      .get('/api/v1/tournaments')
      .expect(200);

    // Then: the database-backed cursor page is empty and wrapped consistently.
    expect(response.body).toEqual({
      status: 'success',
      data: {
        items: [],
        pageInfo: {
          nextCursor: null,
          hasNext: false,
        },
      },
      timestamp: expect.any(String),
    });
  });
});
