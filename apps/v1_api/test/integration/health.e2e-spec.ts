import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createV1IntegrationApp } from './integration-app';

describe('V1 API integration contract', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
  });

  afterAll(async () => {
    await cleanup?.();
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
