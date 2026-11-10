import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { CanActivate, ConflictException, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminContextService } from '../../common/admin-context.service';
@Injectable()
export class StageLegacyMutationGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminContextService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ method: string; route?: { path: string }; params: Record<string, string>; body?: Record<string, unknown>; v1User?: { id: string } }>();
    if (req.method === 'GET') return true;
    const path = req.route?.path ?? '';
    if (path.endsWith('/result') || path.endsWith('/standings/recalculate') || path.includes('competition-config')) return true;
    // Schedule/place edits remain in the ordinary fixture editor; roster and topology edits do not.
    if (req.method === 'PATCH' && path.endsWith('/fixtures/:fixtureId') && Object.keys(req.body ?? {}).every(k => ['scheduledAt', 'venue', 'venueAddress', 'venueLatitude', 'venueLongitude', 'venueProvider', 'venueProviderId', 'fieldId', 'expectedVersion'].includes(k))) return true;
    let id = req.params.tournamentId;
    if (!id && req.params.fixtureId) id = (await this.prisma.v1TournamentMatchDetails.findUnique({ where: { teamMatchId: req.params.fixtureId }, select: { tournamentId: true } }))?.tournamentId ?? '';
    if (!id && req.params.groupId) id = (await this.prisma.v1TournamentGroup.findUnique({ where: { id: req.params.groupId }, select: { tournamentId: true } }))?.tournamentId ?? '';
    if (!id && req.params.slotId) id = (await this.prisma.v1TournamentSlot.findUnique({ where: { id: req.params.slotId }, select: { tournamentId: true } }))?.tournamentId ?? '';
    if (!id && req.params.groupTeamId) id = (await this.prisma.v1TournamentGroupTeam.findUnique({ where: { id: req.params.groupTeamId }, select: { group: { select: { tournamentId: true } } } }))?.group.tournamentId ?? '';
    if (!id) return true;
    const t = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, { where: { id }, select: { stagePlan: true } });
    if (t?.stagePlan) {
      await this.admins.getTournamentMutationAdmin(req.v1User?.id ?? '', { tournamentId: id });
      throw new ConflictException({ code: 'STAGE_MANAGEMENT_REQUIRED', message: '단계형 대회의 편성과 참가팀은 단계별 대진 관리에서 변경해 주세요.' });
    }
    return true;
  }
}
