import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  findTournamentOnSurface,
  TOURNAMENT_KINDS,
} from '../tournament-surface-lookup';
import {
  loadSixTeamResults,
  parseSixTeamState,
  rankSixTeamWinners,
  sixTeamSourceVersion,
  syncSixTeamBracket,
} from './six-team-state';
import type { SixTeamDecisionDto } from './six-team.controller';
import type { Prisma } from '@prisma/client';
@Injectable()
export class SixTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admins: AdminContextService
  ) {}
  private async load(tx: Prisma.TransactionClient, id: string) {
    const tournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
      where: { id, deletedAt: null },
      select: { sixTeamBracket: true, status: true },
    });
    const state = parseSixTeamState(tournament?.sixTeamBracket);
    if (!tournament || !state)
      throw new NotFoundException({
        code: 'SIX_TEAM_NOT_FOUND',
        message: '6강 전용 대진을 찾을 수 없어요.',
      });
    const results = await loadSixTeamResults(tx, id, state);
    const teams = await tx.v1TournamentRegistration.findMany({
      where: { tournamentId: id, status: 'confirmed' },
      select: { id: true, team: { select: { name: true } } },
    });
    return {
      state,
      status: tournament.status,
      results,
      teams,
      ...rankSixTeamWinners(results.slice(0, 3), state.winners),
      version: createHash('sha256')
        .update(JSON.stringify({ state, results }))
        .digest('hex'),
    };
  }
  async preview(user: V1AuthUser, id: string) {
    await this.admins.getTournamentAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction((tx) => this.load(tx, id), {
      isolationLevel: 'RepeatableRead',
    });
  }
  async decide(user: V1AuthUser, id: string, dto: SixTeamDecisionDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${id}`}, 0))`;
        const before = await this.load(tx, id);
        if (before.version !== dto.version)
          throw new ConflictException({
            code: 'SIX_TEAM_STALE',
            message: '결과나 배정이 바뀌었어요. 다시 불러와 주세요.',
          });
        if (
          !dto.reason.trim() ||
          !['draft', 'open', 'closed', 'in_progress'].includes(before.status)
        )
          throw new UnprocessableEntityException({
            code: 'SIX_TEAM_DECISION_INVALID',
            message: '진행 가능한 대회에서 변경 사유를 입력해 주세요.',
          });
        for (const [fixtureId, registrationId] of Object.entries(dto.winners)) {
          const row = before.results.find((row) => row.id === fixtureId);
          if (
            !row ||
            typeof registrationId !== 'string' ||
            !before.teams.some((team) => team.id === registrationId) ||
            ![row.homeRegistrationId, row.awayRegistrationId].includes(
              registrationId
            )
          ) {
            throw new UnprocessableEntityException({
              code: 'SIX_TEAM_WINNER_INVALID',
              message: '각 경기의 확정 참가팀 중에서 진출팀을 선택해 주세요.',
            });
          }
        }
        const state = {
          ...before.state,
          swapSemi: dto.swapSemi ?? before.state.swapSemi ?? false,
          swapFinal: dto.swapFinal ?? before.state.swapFinal ?? false,
          winners: dto.winners,
          manual: dto.manual,
          bye: dto.manual ? dto.bye ?? null : null,
          sourceVersion: sixTeamSourceVersion(before.results.slice(0, 3)),
          needsReview: false,
        };
        await tx.v1Tournament.update({
          where: { id },
          data: { sixTeamBracket: state },
        });
        await syncSixTeamBracket(tx, id);
        const after = await this.load(tx, id);
        await this.admins.logAdminAction(
          admin,
          {
            action: 'tournament.six_team.decide',
            targetType: 'tournament',
            targetId: id,
            beforeJson: JSON.parse(JSON.stringify(before.state)),
            afterJson: JSON.parse(
              JSON.stringify({ ...after.state, reason: dto.reason.trim() })
            ),
          },
          tx
        );
        return after;
      },
      { timeout: 45000 }
    );
  }
}
