import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { findTournamentOnSurface, LEAGUE_KINDS } from '../tournaments/tournament-surface-lookup';
import type { CloseLeagueRegistrationDto } from './dto/league-registration-close.dto';

/**
 * '접수 마감하기'(MD-QA #35) — 대회와 같이 status 를 `open` → `closed` 로 바꾼다(2026-10-27).
 * 마감 시각·낸 신청은 건드리지 않고, 다시 열기는 open-registration 이다. 접수 중이 아니면 할 일이 없다.
 */
@Injectable()
export class LeagueRegistrationCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async close(user: V1AuthUser, leagueId: string, dto: CloseLeagueRegistrationDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const reason = dto.reason?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const league = await findTournamentOnSurface(tx, LEAGUE_KINDS, {
        where: { id: leagueId },
        select: { id: true, status: true, deletedAt: true, registrationDeadlineAt: true },
      });
      if (league === null) {
        throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
      }
      if (league.deletedAt !== null) {
        throw new ConflictException({ code: 'LEAGUE_MIRROR_MISSING', message: '삭제된 리그예요.' });
      }
      const registrationDeadlineAt = league.registrationDeadlineAt?.toISOString() ?? null;
      if (league.status !== 'open') {
        return { leagueId, lifecycleStatus: league.status, registrationOpen: false as const, registrationDeadlineAt, alreadyProcessed: true };
      }

      const written = await tx.v1Tournament.updateMany({
        where: { id: leagueId, kind: 'regular_league', deletedAt: null, status: 'open' },
        data: { status: 'closed' },
      });
      if (written.count !== 1) {
        throw new ConflictException({
          code: 'LEAGUE_STATE_CHANGED',
          message: '리그 상태가 방금 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.',
        });
      }

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.close_registration',
          targetType: 'league_match',
          targetId: leagueId,
          reason,
          fromStatus: 'open',
          toStatus: 'closed',
        },
        tx,
      );
      return { leagueId, lifecycleStatus: 'closed' as const, registrationOpen: false as const, registrationDeadlineAt, alreadyProcessed: false };
    });
  }
}
