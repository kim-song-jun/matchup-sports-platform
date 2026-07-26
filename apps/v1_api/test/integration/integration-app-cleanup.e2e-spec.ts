import { access } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import { createV1IntegrationApp } from './integration-app';

describe('V1 integration app setup cleanup', () => {
  it('restores cwd and removes the temporary config directory when setup fails', async () => {
    const originalWorkingDirectory = process.cwd();
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const setupError = new Error('forced integration setup failure');
    let isolatedConfigDirectory = '';
    process.env.DATABASE_URL =
      'postgresql://integration:integration@127.0.0.1:5432/ulw_v1_integration_cleanup';
    const createTestingModule = jest.spyOn(Test, 'createTestingModule').mockImplementation(() => {
      isolatedConfigDirectory = process.cwd();
      throw setupError;
    });

    try {
      await expect(createV1IntegrationApp()).rejects.toBe(setupError);
      expect(process.cwd()).toBe(originalWorkingDirectory);
      expect(isolatedConfigDirectory).toContain('teameet-v1-api-integration-');
      await expect(access(isolatedConfigDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      createTestingModule.mockRestore();
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });
});
