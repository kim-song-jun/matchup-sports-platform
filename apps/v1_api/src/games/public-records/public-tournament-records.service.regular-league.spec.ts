import { NotFoundException } from '@nestjs/common';
import { PublicTournamentRecordsService } from './public-tournament-records.service';

const LEAGUE_ID = '780f05f1-7dd8-40cf-b3a8-d80cd59504ad';
const FIXTURE_ID = '3799be0f-d897-4c2e-bc83-80876e94df98';

function buildLeaguePrisma(options: {
  parent: 'visible' | 'deleted' | 'nonpublic';
  fixture: 'matching' | 'cross-league' | 'missing';
  hidden?: boolean;
  operationalFailure?: Error;
}) {
  const startAt = new Date('2026-09-19T09:00:00.000Z');
  let tournamentLookups = 0;
  let capturedLeagueId: string | undefined;
  const teamMatch = {
    id: FIXTURE_ID,
    leagueId: LEAGUE_ID,
    hostTeamId: 'team-home',
    approvedApplicantTeamId: 'team-away',
    startAt,
    placeName: 'Alpha field',
    status: 'matched',
    hostTeam: { id: 'team-home', name: 'Home' },
    approvedApplicantTeam: { id: 'team-away', name: 'Away' },
    videos: [],
    game: {
      id: 'game-3799', state: 'ENDED',
      visibilityPolicy: { mode: options.hidden ? 'HIDDEN' : 'OFFICIAL_ONLY', lineupAt: null },
      sides: [], lineups: [], participants: [], resultRevisions: [], currentOfficialRevision: null, periods: [],
    },
  };
  const database = {
    v1Tournament: {
      async findFirst(args: { where?: { AND?: unknown[] } }) {
        tournamentLookups += 1;
        if (tournamentLookups === 1) {
          const originalWhere = args.where?.AND?.find(
            (part): part is { id?: string; deletedAt?: Date | null; AND?: unknown[] } =>
              typeof part === 'object' && part !== null && 'id' in part,
          );
          // findTournamentOnSurface must preserve the caller's id, soft-delete,
          // and public-status predicates inside its composed AND expression.
          if (
            originalWhere?.id !== LEAGUE_ID ||
            originalWhere.deletedAt !== null ||
            !Array.isArray(originalWhere.AND) ||
            originalWhere.AND.length === 0
          ) return null;
          if (options.parent !== 'visible') return null;
        }
        return { id: LEAGUE_ID, title: 'Alpha league', kind: 'regular_league', status: 'closed', bracketPublishedAt: null, bracketPublishScheduledAt: null };
      },
    },
    v1TeamMatch: {
      async findFirst(args: { where?: { id?: string; leagueId?: string; deletedAt?: null } }) {
        if (options.operationalFailure) throw options.operationalFailure;
        capturedLeagueId = args.where?.leagueId;
        if (args.where?.id !== FIXTURE_ID || args.where?.leagueId !== LEAGUE_ID || args.where?.deletedAt !== null) return null;
        return options.fixture === 'matching' ? teamMatch : null;
      },
      async findMany() { return [{ startAt }]; },
    },
    v1GameOperationFlag: { async findUnique() { return { value: 'off' }; } },
    v1ParticipantIdentityLinkCurrent: { async findMany() { return []; } },
    v1ParticipantConsentSnapshot: { async findMany() { return []; } },
    v1UserRecordConsent: { async findMany() { return []; } },
    v1UserProfile: { async findMany() { return []; } },
    v1GameResultRevision: { async findMany() { return []; } },
  };
  return { prisma: database as never, getCapturedLeagueId: () => capturedLeagueId };
}

function expectPublicDetail404(error: unknown) {
  expect(error).toBeInstanceOf(NotFoundException);
  expect((error as NotFoundException).getResponse()).toEqual({
    code: 'TOURNAMENT_MATCH_NOT_FOUND', message: '경기 정보를 찾을 수 없어요.',
  });
}

describe('public tournament detail URL regular-league compatibility', () => {
  it('projects a real league TeamMatch through getMatch', async () => {
    const fixtureDb = buildLeaguePrisma({ parent: 'visible', fixture: 'matching' });
    const service = new PublicTournamentRecordsService(fixtureDb.prisma, {} as never);
    const result = await service.getMatch(LEAGUE_ID, FIXTURE_ID, undefined);
    expect(result).toMatchObject({
      tournamentId: LEAGUE_ID, fixtureId: FIXTURE_ID, tournamentTitle: 'Alpha league',
      home: { teamId: 'team-home' }, away: { teamId: 'team-away' },
    });
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('resultState');
    expect(result).toHaveProperty('scoreStatus');
    expect(result).toHaveProperty('lineup');
    expect(result).toHaveProperty('events');
    expect(fixtureDb.getCapturedLeagueId()).toBe(LEAGUE_ID);
  });

  it.each([
    ['cross-league fixture', { parent: 'visible', fixture: 'cross-league' }],
    ['missing fixture', { parent: 'visible', fixture: 'missing' }],
    ['hidden fixture', { parent: 'visible', fixture: 'matching', hidden: true }],
    ['deleted parent', { parent: 'deleted', fixture: 'matching' }],
    ['nonpublic parent', { parent: 'nonpublic', fixture: 'matching' }],
  ] as const)('%s remains a normalized public 404', async (_name, options) => {
    const service = new PublicTournamentRecordsService(buildLeaguePrisma(options).prisma, {} as never);
    try { await service.getMatch(LEAGUE_ID, FIXTURE_ID, undefined); throw new Error('expected NotFoundException'); }
    catch (error) { expectPublicDetail404(error); }
  });

  it('does not translate non-404 projection failures', async () => {
    const failure = new Error('database unavailable');
    const service = new PublicTournamentRecordsService(buildLeaguePrisma({ parent: 'visible', fixture: 'matching', operationalFailure: failure }).prisma, {} as never);
    await expect(service.getMatch(LEAGUE_ID, FIXTURE_ID, undefined)).rejects.toBe(failure);
  });
});
