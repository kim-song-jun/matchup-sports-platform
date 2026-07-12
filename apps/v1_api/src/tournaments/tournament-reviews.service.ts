import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ListTournamentReviewsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class SubmitTournamentReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  /** 이미 /uploads 로 업로드된 이미지 URL. 최대 3장. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  photoUrls?: string[];
}

/** 개인 어워드 항목 하나 — awardType: 'mvp' | 'top_scorer' | 'best_defense' | 'best_keeper' | 'best_rookie' | 'fair_play' | string */
export class TournamentAwardItemDto {
  @IsString()
  awardType!: string;

  @IsString()
  awardLabel!: string;

  @IsString()
  recipientName!: string;

  @IsOptional()
  @IsString()
  teamName?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class SetTournamentAwardsDto {
  /** 어워드 배열. awardType 중복 시 upsert 처리. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TournamentAwardItemDto)
  awards!: TournamentAwardItemDto[];
}

@Injectable()
export class TournamentReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 대회 리뷰 목록 (최신순, 페이지네이션 + 검색) */
  async listReviews(tournamentId: string, query: ListTournamentReviewsQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const search = query.search?.trim();

    const where: Prisma.V1TournamentReviewWhereInput = {
      tournamentId,
      ...(search
        ? {
            OR: [
              { teamName: { contains: search, mode: 'insensitive' } },
              { comment: { contains: search, mode: 'insensitive' } },
              { author: { profile: { nickname: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.v1TournamentReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          author: { select: { id: true, profile: { select: { nickname: true, profileImageUrl: true } } } },
        },
      }),
      this.prisma.v1TournamentReview.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        authorId: r.authorUserId,
        authorNickname: r.author.profile?.nickname ?? '익명',
        authorProfileImageUrl: r.author.profile?.profileImageUrl ?? null,
        teamName: r.teamName ?? null,
        rating: r.rating,
        comment: r.comment ?? null,
        photoUrls: r.photoUrls,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** 리뷰 작성 (참가 확정 팀의 대표만 가능, 대회 completed 상태) */
  async submitReview(
    tournamentId: string,
    user: V1AuthUser,
    dto: SubmitTournamentReviewDto,
  ) {
    // 1. 대회 존재 확인
    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    if (tournament.status !== 'completed') {
      throw new BadRequestException({ code: 'TOURNAMENT_NOT_COMPLETED', message: '대회가 종료된 후 리뷰를 작성할 수 있어요.' });
    }

    // 2. 참가팀 확인 (해당 유저가 appliedByUser인 confirmed 등록 존재)
    const registration = await this.prisma.v1TournamentRegistration.findFirst({
      where: {
        tournamentId,
        appliedByUserId: user.id,
        status: 'confirmed',
      },
      include: { team: { select: { id: true, name: true } } },
    });
    if (!registration) {
      throw new ForbiddenException({
        code: 'NOT_PARTICIPANT',
        message: '대회에 참가한 팀의 대표만 리뷰를 작성할 수 있어요.',
      });
    }

    // 3. 중복 리뷰 확인
    const existing = await this.prisma.v1TournamentReview.findUnique({
      where: { tournamentId_authorUserId: { tournamentId, authorUserId: user.id } },
    });
    if (existing) {
      throw new BadRequestException({ code: 'ALREADY_REVIEWED', message: '이미 리뷰를 작성했어요.' });
    }

    // 4. 저장
    const review = await this.prisma.v1TournamentReview.create({
      data: {
        tournamentId,
        authorUserId: user.id,
        teamName: registration.team.name,
        rating: dto.rating,
        comment: dto.comment ?? null,
        photoUrls: dto.photoUrls ?? [],
      },
      include: {
        author: { select: { id: true, profile: { select: { nickname: true, profileImageUrl: true } } } },
      },
    });

    return {
      id: review.id,
      authorId: review.authorUserId,
      authorNickname: review.author.profile?.nickname ?? '익명',
      authorProfileImageUrl: review.author.profile?.profileImageUrl ?? null,
      teamName: review.teamName ?? null,
      rating: review.rating,
      comment: review.comment ?? null,
      photoUrls: review.photoUrls,
      createdAt: review.createdAt.toISOString(),
    };
  }

  /** 내가 참가 확정한 대회 중 종료됐지만 아직 리뷰를 작성하지 않은 대회 목록 (최근 종료순) */
  async listMyPendingReviews(userId: string) {
    const registrations = await this.prisma.v1TournamentRegistration.findMany({
      where: {
        appliedByUserId: userId,
        status: 'confirmed',
        tournament: { status: 'completed', deletedAt: null },
      },
      select: {
        tournament: { select: { id: true, title: true, scheduledEndAt: true, updatedAt: true } },
      },
      distinct: ['tournamentId'],
    });
    if (registrations.length === 0) return [];

    const tournamentIds = registrations.map((r) => r.tournament.id);
    const reviewed = await this.prisma.v1TournamentReview.findMany({
      where: { authorUserId: userId, tournamentId: { in: tournamentIds } },
      select: { tournamentId: true },
    });
    const reviewedSet = new Set(reviewed.map((r) => r.tournamentId));

    // scheduledEndAt(예정 종료일) 우선 — updatedAt은 완료 후 커버이미지 등 무관한 수정에도 갱신되어 정렬 기준으로 부정확
    const completedAt = (t: { scheduledEndAt: Date | null; updatedAt: Date }) => t.scheduledEndAt ?? t.updatedAt;

    return registrations
      .map((r) => r.tournament)
      .filter((t) => !reviewedSet.has(t.id))
      .sort((a, b) => completedAt(b).getTime() - completedAt(a).getTime())
      .map((t) => ({
        tournamentId: t.id,
        tournamentTitle: t.title,
        completedAt: completedAt(t).toISOString(),
      }));
  }

  /** 내 리뷰 조회 (이미 작성했는지 확인) */
  async getMyReview(tournamentId: string, userId: string) {
    const review = await this.prisma.v1TournamentReview.findUnique({
      where: { tournamentId_authorUserId: { tournamentId, authorUserId: userId } },
    });
    if (!review) return null;
    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment ?? null,
      createdAt: review.createdAt.toISOString(),
    };
  }

  /** 참가 팀 대표인지 확인 */
  async isParticipant(tournamentId: string, userId: string): Promise<boolean> {
    const reg = await this.prisma.v1TournamentRegistration.findFirst({
      where: { tournamentId, appliedByUserId: userId, status: 'confirmed' },
    });
    return !!reg;
  }

  // ───────────────────── 어워드 ─────────────────────

  /** 어워드 목록 (tournamentDetail에 포함) */
  async listAwards(tournamentId: string) {
    const awards = await this.prisma.v1TournamentAward.findMany({
      where: { tournamentId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return awards.map((a) => ({
      id: a.id,
      awardType: a.awardType,
      awardLabel: a.awardLabel,
      recipientName: a.recipientName,
      teamName: a.teamName ?? null,
      note: a.note ?? null,
    }));
  }

  /** 어워드 설정 (어드민, 전체 replace) */
  async setAwards(tournamentId: string, dto: SetTournamentAwardsDto) {
    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    // 전체 삭제 후 재생성 (simple replace)
    await this.prisma.$transaction([
      this.prisma.v1TournamentAward.deleteMany({ where: { tournamentId } }),
      ...dto.awards.map((a, idx) =>
        this.prisma.v1TournamentAward.create({
          data: {
            tournamentId,
            awardType: a.awardType,
            awardLabel: a.awardLabel,
            recipientName: a.recipientName,
            teamName: a.teamName ?? null,
            note: a.note ?? null,
            sortOrder: a.sortOrder ?? idx,
          },
        }),
      ),
    ]);

    return this.listAwards(tournamentId);
  }
}
