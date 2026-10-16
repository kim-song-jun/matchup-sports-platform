import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateLeagueCoverImageDto } from './dto/league-cover-image.dto';

/**
 * 리그 대표 이미지 교체·제거(MD-QA #37). 마지막 저장이 이긴다.
 * 같은 URL 을 이어받은 다음 시즌이 있을 수 있어 옛 파일은 지우지 않는다.
 */
@Injectable()
export class LeagueCoverImageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async update(user: V1AuthUser, leagueId: string, dto: UpdateLeagueCoverImageDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    return this.prisma.$transaction(async (tx) => {
      // 행 잠금 뒤에 읽어야 감사 before 가 실제 직전 값이다. 소프트삭제는 필터가 아니라 값으로 읽는다.
      const locked = await tx.$queryRaw<
        Array<{ id: string; coverImageUrl: string | null; listImageUrl: string | null; deletedAt: Date | null }>
      >`
        SELECT "id", "cover_image_url" AS "coverImageUrl", "list_image_url" AS "listImageUrl", "deleted_at" AS "deletedAt"
        FROM "v1_tournaments"
        WHERE "id" = ${leagueId} AND "kind" = 'regular_league'
        FOR UPDATE
      `;
      const current = locked[0];
      if (current === undefined) {
        throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
      }
      if (current.deletedAt !== null) {
        throw new ConflictException({ code: 'LEAGUE_MIRROR_MISSING', message: '삭제된 리그예요.' });
      }
      const before = { coverImageUrl: current.coverImageUrl, listImageUrl: current.listImageUrl };
      const after = {
        coverImageUrl: dto.coverImageUrl === undefined ? current.coverImageUrl : dto.coverImageUrl,
        listImageUrl: dto.listImageUrl === undefined ? current.listImageUrl : dto.listImageUrl,
      };
      if (before.coverImageUrl === after.coverImageUrl && before.listImageUrl === after.listImageUrl) {
        return { leagueId, ...after, alreadyProcessed: true };
      }

      await tx.v1Tournament.update({ where: { id: leagueId }, data: after });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.cover_image_updated',
          targetType: 'league_match',
          targetId: leagueId,
          reason: null,
          beforeJson: before,
          afterJson: after,
        },
        tx,
      );
      return { leagueId, ...after, alreadyProcessed: false };
    });
  }
}
