import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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
   */
  async get(tournamentId: string) {
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

    return presentTournamentDetail(row);
  }
}
