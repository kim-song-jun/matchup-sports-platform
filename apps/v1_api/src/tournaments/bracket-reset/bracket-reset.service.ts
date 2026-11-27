import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { lockCompetitionFixtureRows, lockTournamentForConfigChange, untouchedGameWhere } from '../competition-config/tournament-competition-config';
import { MultiFinalsService } from '../multi-finals/multi-finals.service';
import type { StoredStagePlan } from '../stages/stage-view';
import { orderFixturesForTeardown } from '../templates/bracket-teardown-order';
import { deleteTournamentGroupInTx, softDeleteTournamentFixtureInTx } from '../tournament-bracket-tx';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { ResetTournamentBracketDto } from './bracket-reset.dto';

type Tx = Prisma.TransactionClient;
const options = { timeout: 45_000, maxWait: 5_000 };

@Injectable()
export class BracketResetService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminContextService,
    private readonly finals: MultiFinalsService) {}

  private async snapshot(tx: Tx, id: string) {
    const tournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, { where: { id, deletedAt: null }, select: {
      id: true, kind: true, format: true, status: true, updatedAt: true, stagePlan: true, stagePlanRevision: true,
      multiFinals: true, multiFinalsRevision: true, bracketDraft: true, bracketDraftRevision: true,
      sixTeamMode: true, sixTeamBracket: true, bracketPublishedAt: true, bracketPublishScheduledAt: true,
    } });
    if (!tournament) throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    const fixtures = await tx.v1TournamentMatchDetails.findMany({ where: { tournamentId: id, teamMatch: { deletedAt: null } },
      orderBy: { teamMatchId: 'asc' }, include: { teamMatch: { select: { updatedAt: true, status: true, startAt: true,
        game: { select: { version: true, state: true, currentOfficialRevisionId: true } } } } } });
    const groups = await tx.v1TournamentGroup.findMany({ where: { tournamentId: id }, orderBy: { id: 'asc' } });
    const slots = await tx.v1TournamentSlot.findMany({ where: { tournamentId: id }, orderBy: { id: 'asc' } });
    const groupTeams = await tx.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId: id } }, orderBy: { id: 'asc' } });
    const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { tournamentId: id }, orderBy: { id: 'asc' },
      select: { id: true, sourceTeamMatchId: true, targetTeamMatchId: true, sourceOutcome: true, targetSide: true } });
    const unsafe = await tx.v1TeamMatch.findFirst({ where: { tournamentId: id, deletedAt: null, tournamentDetails: { isNot: null },
      OR: [{ status: { not: 'matched' } }, { game: { is: null } }, { game: { isNot: untouchedGameWhere(true) } }] }, select: { id: true } });
    const preservesPreliminaryGroups = !tournament.stagePlan && (tournament.format === 'league' || tournament.format === 'group_knockout'
      || tournament.format === 'league_knockouts' && Boolean(tournament.multiFinals));
    const blockedReason = !['draft', 'open', 'closed', 'in_progress'].includes(tournament.status)
      ? '종료·취소된 대회의 대진은 초기화할 수 없어요.'
      : unsafe ? '시작했거나 경기 기록·결과가 있는 경기가 있어 대진을 초기화할 수 없어요.'
        : fixtures.length + slots.length + groups.filter(group => !preservesPreliminaryGroups || group.phase !== 'group').length === 0
          ? '초기화할 대진이 없어요.' : null;
    const hash = createHash('sha256').update(JSON.stringify({ tournament, fixtures, groups, slots, groupTeams, edges })).digest('hex');
    return { tournament, fixtures, groups, slots, edges, hash, blockedReason, preservesPreliminaryGroups };
  }

  async preview(user: V1AuthUser, id: string) {
    return this.prisma.$transaction(async tx => {
      await this.admins.getTournamentAdmin(user.id, { tournamentId: id }, tx);
      const snapshot = await this.snapshot(tx, id);
      return { snapshot: snapshot.hash, fixtureCount: snapshot.fixtures.length, groupCount: snapshot.groups.length,
        canReset: snapshot.blockedReason === null, blockedReason: snapshot.blockedReason,
        stageBased: snapshot.tournament.stagePlan !== null, preservesPreliminaryGroups: snapshot.preservesPreliminaryGroups };
    }, { ...options, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async reset(user: V1AuthUser, id: string, dto: ResetTournamentBracketDto) {
    return this.prisma.$transaction(async tx => {
      const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id }, tx);
      const initial = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, { where: { id, deletedAt: null }, select: { id: true, kind: true } });
      if (!initial) throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
      await lockTournamentForConfigChange(tx, id);
      await lockCompetitionFixtureRows(tx, initial.kind, id);
      const snapshot = await this.snapshot(tx, id), tournament = snapshot.tournament;
      if (snapshot.blockedReason) throw new ConflictException({ code: 'BRACKET_RESET_BLOCKED', message: snapshot.blockedReason });
      if (snapshot.hash !== dto.expectedSnapshot) throw new ConflictException({ code: 'BRACKET_RESET_STALE', message: '확인하는 동안 대진이나 설정이 바뀌었어요. 최신 내용을 확인한 뒤 다시 초기화해 주세요.' });

      if (!tournament.stagePlan && tournament.multiFinals && tournament.format === 'league_knockouts') {
        await this.finals.resetInTx(tx, admin, id, { expectedRevision: tournament.multiFinalsRevision });
      } else {
        const dependencies = [...snapshot.edges, ...snapshot.fixtures.flatMap(fixture => fixture.parentTeamMatchId
          ? [{ sourceTeamMatchId: fixture.parentTeamMatchId, targetTeamMatchId: fixture.teamMatchId }] : [])];
        for (const fixtureId of orderFixturesForTeardown(snapshot.fixtures.map(fixture => fixture.teamMatchId), dependencies)) {
          await softDeleteTournamentFixtureInTx(tx, admin, fixtureId);
        }
        await tx.v1TournamentSlot.deleteMany({ where: { tournamentId: id } });
        await tx.v1TournamentStanding.deleteMany({ where: { group: { tournamentId: id } } });
        await tx.v1TournamentByeSlot.deleteMany({ where: { group: { tournamentId: id } } });
        // Non-stage preliminary groups and team choices remain available for the next generation.
        const removedGroups = snapshot.groups.filter(group => !snapshot.preservesPreliminaryGroups || group.phase !== 'group');
        await tx.v1TournamentGroupTeam.deleteMany({ where: { groupId: { in: removedGroups.map(group => group.id) } } });
        for (const group of removedGroups) await deleteTournamentGroupInTx(tx, admin, group.id);
      }
      await tx.v1TournamentOverallStanding.deleteMany({ where: { tournamentId: id } });
      const plan = tournament.stagePlan as unknown as StoredStagePlan | null;
      await tx.v1Tournament.update({ where: { id }, data: {
        bracketPublishedAt: null, bracketPublishScheduledAt: null, sixTeamBracket: Prisma.DbNull, sixTeamMode: false,
        bracketDraftRevision: { increment: 1 },
        ...(plan ? { stagePlan: JSON.parse(JSON.stringify({ ...plan, assignments: {}, removedFixtures: {}, sixTeamSelections: {} })),
          stagePlanRevision: { increment: 1 } } : {}),
      } });
      await this.admins.logAdminAction(admin, { action: 'tournament.bracket.reset', targetType: 'tournament', targetId: id,
        beforeJson: { snapshot: snapshot.hash, format: tournament.format, fixtureCount: snapshot.fixtures.length },
        afterJson: { archivedFixtureIds: snapshot.fixtures.map(fixture => fixture.teamMatchId), unpublished: true, settingsPreserved: true } }, tx);
      return { deletedFixtureCount: snapshot.fixtures.length };
    }, options);
  }
}
