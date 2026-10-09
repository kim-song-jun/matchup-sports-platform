import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { TournamentSlotController } from './tournament-slot.controller';

describe('TournamentSlotController 라우트 계약', () => {
  it('PUT admin/tournament-slots/:slotId/assignment, 인증 가드 아래', () => {
    const handler = TournamentSlotController.prototype.assign;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('admin/tournament-slots/:slotId/assignment');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PUT);
    expect(Reflect.getMetadata(GUARDS_METADATA, TournamentSlotController)).toContain(V1AuthGuard);
  });

  it('POST admin/tournaments/:tournamentId/slots/random-fill', () => {
    const handler = TournamentSlotController.prototype.randomFill;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('admin/tournaments/:tournamentId/slots/random-fill');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
  });
});
