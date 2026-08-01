import config from '../../jest.config';

describe('v1_api Jest integration discovery contract', () => {
  it('includes the Task 9 game projection integration pattern', () => {
    const integrationProject = config.projects?.find((project) => {
      if (typeof project === 'string') {
        return false;
      }

      return project.displayName === 'integration';
    });

    expect(integrationProject).toBeDefined();

    if (!integrationProject || typeof integrationProject === 'string') {
      throw new Error('integration Jest project is missing');
    }

    expect(integrationProject.testMatch).toEqual(
      expect.arrayContaining([
        '<rootDir>/test/integration/**/*.e2e-spec.ts',
        '<rootDir>/test/tournaments/**/*.integration-spec.ts',
        '<rootDir>/test/games/**/*.integration-spec.ts',
      ]),
    );
  });
});
