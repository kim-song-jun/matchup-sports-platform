import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { TournamentStaffAccessService } from './staff/tournament-staff-access.service';
import { presentTournamentCard } from './tournament-card.presenter';
import { presentTournamentDetail } from './tournament-detail.presenter';
import { TournamentListQueryDto } from './dto/tournament-read.dto';
import {
  PUBLIC_TOURNAMENT_STATUS_FILTER,
  TOURNAMENT_DETAIL_INCLUDE,
  TOURNAMENT_LIST_INCLUDE,
} from './tournaments-read.query';

@Injectable()
export class TournamentsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffAccess: TournamentStaffAccessService,
  ) {}

  /**
   * 공개 대회 목록.
   * - deletedAt=null + status in (open/closed/in_progress/completed)
   * - 각 카드에 confirmedCount(status=confirmed registration 수) 포함
   * - cursor 페이지네이션(createdAt desc → id 기준)
   */
  async list(query: TournamentListQueryDto) {
    const limit = query.limit ?? 20;

    const where: Prisma.V1TournamentWhereInput = {
      deletedAt: null,
      status: query.status ? query.status : PUBLIC_TOURNAMENT_STATUS_FILTER,
      ...(query.sportId ? { sportId: query.sportId } : {}),
    };

    const rows = await this.prisma.v1Tournament.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: TOURNAMENT_LIST_INCLUDE,
    });

    const hasNext = rows.length > limit;
    const pageItems = hasNext ? rows.slice(0, limit) : rows;

    return {
      items: pageItems.map(presentTournamentCard),
      pageInfo: {
        nextCursor: hasNext ? (pageItems.at(-1)?.id ?? null) : null,
        hasNext,
      },
    };
  }

  /**
   * 공개 대회 상세.
   * - draft/cancelled는 404(소비자에게 노출 안 함).
   * - groups(+groupTeams 팀명), fixtures(+home/away 팀명, result), standings(position 정렬), announcements(publishedAt!=null) 포함.
   * - `user`가 이 대회의 운영자·스태프(TournamentStaffAccessService)면 모집 중에도
   *   참가팀 식별 정보(팀명·로고)를 그대로 본다 — PR #389(issue #377)가 공개 경기
   *   기록에 스태프 우회를 넣은 것과 동일한 선례.
   */
  async get(tournamentId: string, user?: V1AuthUser) {
    const row = await this.prisma.v1Tournament.findFirst({
      where: {
        id: tournamentId,
        deletedAt: null,
        status: PUBLIC_TOURNAMENT_STATUS_FILTER,
      },
      include: TOURNAMENT_DETAIL_INCLUDE,
    });

    if (!row) {
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: '대회를 찾을 수 없어요.',
      });
    }

    const [popup, staffBypass] = await Promise.all([
      this.getActivePopup(tournamentId),
      this.resolveStaffBypass(user, tournamentId),
    ]);

    return { ...presentTournamentDetail(row, new Date(), staffBypass), popup };
  }

  /**
   * 이 대회에 배정된 운영자·스태프(플랫폼 어드민 포함)인지 판정한다 — 대회 전체
   * 단위(`{ tournamentId }`, fixtureId/fieldId 미지정) 읽기 권한으로 확인한다. 이
   * 엔드포인트는 특정 경기 하나가 아니라 대회 전체의 조/픽스처를 한 번에 내려주므로,
   * 특정 fixture/field로 좁게 배정된 FIELD_OPERATOR는(대회 전체를 볼 권한은 아니므로)
   * 자연히 우회 대상에서 제외된다 — decideTournamentStaffAccess의 기존 정책을 그대로
   * 따르는 결과이지 별도로 발명한 로직이 아니다.
   *
   * `assertAccess`는 boolean을 반환하지 않고 허용 시 principal을, 거부 시
   * ForbiddenException(STAFF_SCOPE_DENIED)만 던진다. 이 조회는 익명 방문자에게도
   * 열려 있어야 하므로(OptionalV1AuthGuard) 그 거부를 절대 그대로 전파하지 않고
   * false로 낮춰 masked 응답으로 떨어뜨린다 — 그 외 예외(DB 장애 등)는 "스태프
   * 아님"으로 조용히 재해석하지 않고 그대로 전파한다.
   */
  private async resolveStaffBypass(user: V1AuthUser | undefined, tournamentId: string): Promise<boolean> {
    if (user === undefined) return false;
    try {
      await this.staffAccess.assertAccess({ userId: user.id, action: 'read', resource: { tournamentId } });
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  /**
   * 대회 상세용 활성 팝업 1건.
   * - status=published + displayStartAt~displayEndAt 범위 내(둘 다 null이면 상시 노출)
   * - 여러 건이면 최신순(createdAt desc) 1건만 노출
   */
  private async getActivePopup(tournamentId: string) {
    const now = new Date();
    const popup = await this.prisma.v1TournamentPopup.findFirst({
      where: {
        tournamentId,
        status: 'published',
        AND: [
          { OR: [{ displayStartAt: null }, { displayStartAt: { lte: now } }] },
          { OR: [{ displayEndAt: null }, { displayEndAt: { gt: now } }] },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      select: { id: true, title: true, body: true, imageUrl: true },
    });

    return popup
      ? {
          popupId: popup.id,
          title: popup.title,
          body: popup.body,
          imageUrl: popup.imageUrl,
        }
      : null;
  }
}
