import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { findTournamentOnSurface, LEAGUE_KINDS } from '../tournaments/tournament-surface-lookup';
import type { CloseLeagueRegistrationDto } from './dto/league-registration-close.dto';

/**
 * 리그 신청 즉시 마감(MD-QA #35). 신청 열림의 판정자는 `registrationDeadlineAt` 하나라서
 * 마감 시각을 지금으로 당긴다. 낸 신청·status 는 건드리지 않고, 재오픈은 기존 open-registration 이다.
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
      const now = new Date();
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
      if (league.status === 'completed' || league.status === 'cancelled') {
        throw new ConflictException({
          code: 'LEAGUE_REGISTRATION_NOT_ALLOWED',
          message: '끝났거나 취소된 리그는 신청을 마감할 수 없어요.',
        });
      }

      const deadline = league.registrationDeadlineAt;
      // 마감 미설정은 "이미 안 받는 중"이다 — now 로 새로 쓰면 없던 마감 기록을 만든다.
      if (deadline === null || deadline.getTime() < now.getTime()) {
        return {
          leagueId,
          registrationOpen: false as const,
          registrationDeadlineAt: deadline?.toISOString() ?? null,
          alreadyProcessed: true,
        };
      }

      // 읽은 마감값을 where 에 건 조건부 UPDATE 가 승자 판정이다(그 사이 재오픈·마감 변경이면 count 0).
      const written = await tx.v1Tournament.updateMany({
        where: { id: leagueId, kind: 'regular_league', deletedAt: null, registrationDeadlineAt: deadline },
        data: { registrationDeadlineAt: now },
      });
      if (written.count !== 1) {
        throw new ConflictException({
          code: 'LEAGUE_STATE_CHANGED',
          message: '신청 마감이 방금 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.',
        });
      }

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.close_registration',
          targetType: 'league_match',
          targetId: leagueId,
          reason,
          beforeJson: { registrationDeadlineAt: deadline.toISOString() },
          afterJson: { registrationDeadlineAt: now.toISOString() },
        },
        tx,
      );
      return {
        leagueId,
        registrationOpen: false as const,
        registrationDeadlineAt: now.toISOString(),
        alreadyProcessed: false,
      };
    });
  }
}
