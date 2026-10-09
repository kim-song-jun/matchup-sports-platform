// apps/v1_api/src/tournaments/slots/tournament-slot-standings.controller.spec.ts
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { TournamentsModule } from '../tournaments.module';
import { TournamentSlotStandingsController } from './tournament-slot-standings.controller';

const names = (key: string) => {
  const list: unknown = Reflect.getMetadata(key, TournamentsModule);
  return Array.isArray(list) ? list.flatMap((entry) => (typeof entry === 'function' ? [entry.name] : [])) : [];
};

describe('TournamentSlotStandingsController', () => {
  it('모듈에 등록돼 있고 슬롯 서비스가 provider 에 있다', () => {
    expect(names(MODULE_METADATA.CONTROLLERS)).toContain('TournamentSlotStandingsController');
    expect(names(MODULE_METADATA.PROVIDERS)).toContain('TournamentSlotService');
  });

  it('V1AuthGuard 로 보호된다', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TournamentSlotStandingsController)).toContain(V1AuthGuard);
  });

  it.each([
    ['standingsPreview', 'admin/tournaments/:tournamentId/slots/standings-preview', RequestMethod.GET],
    ['fillFromStandings', 'admin/tournaments/:tournamentId/slots/fill-from-standings', RequestMethod.POST],
  ] as const)('%s 는 계약 경로·메서드로 노출된다', (methodName, path, method) => {
    const handler = TournamentSlotStandingsController.prototype[methodName];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
  });

  it('overrides 를 생략하면 빈 배열로 서비스에 넘기고, 있으면 그대로 넘긴다', () => {
    const service = { standingsPreview: jest.fn(), fillFromStandings: jest.fn().mockReturnValue('done') };
    const controller = new TournamentSlotStandingsController(service as never);
    const user = { id: 'user-1' } as never;
    const override = { slotId: 's1', registrationId: 'r1' };

    expect(controller.fillFromStandings(user, 'tournament-1', {})).toBe('done');
    expect(service.fillFromStandings).toHaveBeenLastCalledWith(user, 'tournament-1', []);
    controller.fillFromStandings(user, 'tournament-1', { overrides: [override] });
    expect(service.fillFromStandings).toHaveBeenLastCalledWith(user, 'tournament-1', [override]);
    controller.standingsPreview(user, 'tournament-1');
    expect(service.standingsPreview).toHaveBeenCalledWith(user, 'tournament-1');
  });
});
