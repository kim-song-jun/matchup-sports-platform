describe('stage runtime import boundary', () => {
  it('boots league generation when GamesService is the first runtime import', async () => {
    await jest.isolateModulesAsync(async () => {
      const { GamesService } = await import('../../games/games.service');
      const { LeagueFixtureGeneratorService } = await import('../league-fixture-generator.service');
      const { PrismaService } = await import('../../prisma/prisma.service');
      const { AdminContextService } = await import('../../common/admin-context.service');
      const { Test } = await import('@nestjs/testing');
      const module = await Test.createTestingModule({ providers: [
        LeagueFixtureGeneratorService,
        { provide: PrismaService, useValue: {} },
        { provide: AdminContextService, useValue: {} },
        { provide: GamesService, useValue: {} },
      ] }).compile();
      expect(module.get(LeagueFixtureGeneratorService)).toBeInstanceOf(LeagueFixtureGeneratorService);
      await module.close();
    });
  });
});
