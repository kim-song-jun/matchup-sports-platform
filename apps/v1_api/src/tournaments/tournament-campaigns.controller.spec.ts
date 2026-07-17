import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import {
  TournamentCampaignsAdminController,
  TournamentCampaignsPublicController,
} from './tournament-campaigns.controller';
import { TournamentsModule } from './tournaments.module';

describe('Tournament campaign controller registration', () => {
  it('registers static campaign routes before tournament id routes', () => {
    const controllers: unknown = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, TournamentsModule);

    expect(Array.isArray(controllers)).toBe(true);
    if (!Array.isArray(controllers)) return;
    const names = controllers.flatMap((controller) =>
      typeof controller === 'function' ? [controller.name] : [],
    );

    expect(names).toContain('TournamentCampaignsPublicController');
    expect(names).toContain('TournamentCampaignsAdminController');
    expect(names.indexOf('TournamentCampaignsPublicController')).toBeLessThan(
      names.indexOf('TournamentsReadController'),
    );
    expect(names.indexOf('TournamentCampaignsAdminController')).toBeLessThan(
      names.indexOf('TournamentsAdminController'),
    );
  });

  it('registers dedicated public-read and admin-mutation services', () => {
    const providers: unknown = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, TournamentsModule);

    expect(Array.isArray(providers)).toBe(true);
    if (!Array.isArray(providers)) return;
    const names = providers.flatMap((provider) =>
      typeof provider === 'function' ? [provider.name] : [],
    );
    expect(names).toEqual(
      expect.arrayContaining([
        'TournamentCampaignReadService',
        'TournamentCampaignAdminService',
        'TournamentCampaignStatusService',
      ]),
    );
  });

  it.each([
    {
      controller: TournamentCampaignsPublicController,
      methodName: 'checkPublishedAvailability',
      path: ':slug/availability',
      requestMethod: RequestMethod.HEAD,
    },
    {
      controller: TournamentCampaignsPublicController,
      methodName: 'getPublished',
      path: ':slug',
      requestMethod: RequestMethod.GET,
    },
    {
      controller: TournamentCampaignsAdminController,
      methodName: 'get',
      path: ':tournamentId/campaign',
      requestMethod: RequestMethod.GET,
    },
    {
      controller: TournamentCampaignsAdminController,
      methodName: 'preview',
      path: ':tournamentId/campaign/preview',
      requestMethod: RequestMethod.GET,
    },
    {
      controller: TournamentCampaignsAdminController,
      methodName: 'create',
      path: ':tournamentId/campaign',
      requestMethod: RequestMethod.POST,
    },
    {
      controller: TournamentCampaignsAdminController,
      methodName: 'update',
      path: ':tournamentId/campaign',
      requestMethod: RequestMethod.PATCH,
    },
    {
      controller: TournamentCampaignsAdminController,
      methodName: 'changeStatus',
      path: ':tournamentId/campaign/status',
      requestMethod: RequestMethod.POST,
    },
  ])('registers $methodName on the expected route', ({ controller, methodName, path, requestMethod }) => {
    const method = Reflect.get(controller.prototype, methodName);

    expect(method).toBeInstanceOf(Function);
    if (typeof method !== 'function') return;
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(requestMethod);
  });

  it('requires V1 auth for every admin campaign route', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, TournamentCampaignsAdminController) ?? [];

    expect(guards).toContain(V1AuthGuard);
  });
});
