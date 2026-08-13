import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1TeamMembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
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
  /**
   * 후기를 남길 참가 팀. 대표를 맡은 참가 팀이 하나뿐이면 생략할 수 있고,
   * 두 팀 이상의 owner|manager 를 겸한 경우에만 필수다.
   */
  @IsOptional()
  @IsString()
  teamId?: string;

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

export class HideTournamentReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

type ReviewRowWithAuthor = Prisma.V1TournamentReviewGetPayload<{
  include: { author: { select: { id: true; profile: { select: { nickname: true; profileImageUrl: true } } } } };
}>;

/** 대회 후기를 팀 이름으로 남길 수 있는 역할 — 경기 리뷰(reviews 모듈)와 동일 기준 */
const TOURNAMENT_REVIEW_ROLES: V1TeamMembershipRole[] = ['owner', 'manager'];

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

@Injectable()
export class TournamentReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  private buildReviewWhere(
    tournamentId: string,
    search?: string,
    onlyVisible = true,
  ): Prisma.V1TournamentReviewWhereInput {
    return {
      tournamentId,
      ...(onlyVisible ? { hiddenAt: null } : {}),
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
  }

  private mapReviewRow(r: ReviewRowWithAuthor) {
    return {
      id: r.id,
      authorId: r.authorUserId,
      authorNickname: r.author.profile?.nickname ?? '익명',
      authorProfileImageUrl: r.author.profile?.profileImageUrl ?? null,
      teamName: r.teamName ?? null,
      rating: r.rating,
      comment: r.comment ?? null,
      photoUrls: r.photoUrls,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async queryReviews(
    tournamentId: string,
    query: ListTournamentReviewsQueryDto,
    onlyVisible: boolean,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const search = query.search?.trim();
    const where = this.buildReviewWhere(tournamentId, search, onlyVisible);

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

    return { rows, total, page, pageSize };
  }

  /** 대회 리뷰 목록 (공개, 최신순, 페이지네이션 + 검색). 숨김 처리된 리뷰는 제외. */
  async listReviews(tournamentId: string, query: ListTournamentReviewsQueryDto = {}) {
    const { rows, total, page, pageSize } = await this.queryReviews(tournamentId, query, true);
    return {
      items: rows.map((r) => this.mapReviewRow(r)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 내가 후기를 남길 수 있는 참가 팀 목록.
   *
   * 자격은 "대회에 신청서를 낸 계정"이 아니라 **참가 확정 팀의 현재 owner|manager** 다.
   * 신청은 매니저가 내고 후기는 팀장이 쓰는 흔한 운영 방식을 막지 않기 위함이며,
   * 반대로 팀을 떠난 신청자는 더 이상 팀 이름으로 후기를 남길 수 없다.
   */
  private async reviewableTeams(tournamentId: string, userId: string) {
    const registrations = await this.prisma.v1TournamentRegistration.findMany({
      where: {
        tournamentId,
        status: 'confirmed',
        team: {
          memberships: {
            some: { userId, status: 'active', role: { in: TOURNAMENT_REVIEW_ROLES } },
          },
        },
      },
      select: { team: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (registrations.length === 0) return [];

    const teamIds = registrations.map((r) => r.team.id);
    const written = await this.prisma.v1TournamentReview.findMany({
      where: { tournamentId, teamId: { in: teamIds } },
      select: { teamId: true },
    });
    const writtenTeamIds = new Set(written.map((r) => r.teamId));

    return registrations.map((r) => ({
      teamId: r.team.id,
      teamName: r.team.name,
      alreadyReviewed: writtenTeamIds.has(r.team.id),
    }));
  }

  /** 리뷰 작성 (참가 확정 팀의 팀장·매니저, 팀당 1건, 대회 completed 상태) */
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

    // 2. 작성 자격 팀 확인
    const teams = await this.reviewableTeams(tournamentId, user.id);
    if (teams.length === 0) {
      throw new ForbiddenException({
        code: 'NOT_TEAM_REVIEW_MANAGER',
        message: '대회에 참가한 팀의 팀장 또는 매니저만 후기를 작성할 수 있어요.',
      });
    }

    // 3. 어느 팀 이름으로 남길지 확정 — 겸직이면 호출자가 명시해야 한다
    let target: (typeof teams)[number];
    if (dto.teamId) {
      const picked = teams.find((t) => t.teamId === dto.teamId);
      if (!picked) {
        throw new ForbiddenException({
          code: 'NOT_TEAM_REVIEW_MANAGER',
          message: '선택한 팀의 팀장 또는 매니저가 아니에요.',
        });
      }
      target = picked;
    } else if (teams.length > 1) {
      throw new BadRequestException({
        code: 'REVIEWER_TEAM_REQUIRED',
        message: '후기를 남길 팀을 선택해 주세요.',
      });
    } else {
      target = teams[0];
    }

    // 4. 중복 리뷰 확인 (팀 단위)
    if (target.alreadyReviewed) {
      throw new BadRequestException({ code: 'ALREADY_REVIEWED', message: '이미 팀 후기가 등록됐어요.' });
    }

    // 5. 저장 — 동시 제출은 (tournament_id, team_id) unique 가 최종 방어선이다
    const review = await this.prisma.v1TournamentReview
      .create({
        data: {
          tournamentId,
          authorUserId: user.id,
          teamId: target.teamId,
          teamName: target.teamName,
          rating: dto.rating,
          comment: dto.comment ?? null,
          photoUrls: dto.photoUrls ?? [],
        },
        include: {
          author: { select: { id: true, profile: { select: { nickname: true, profileImageUrl: true } } } },
        },
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) {
          throw new BadRequestException({ code: 'ALREADY_REVIEWED', message: '이미 팀 후기가 등록됐어요.' });
        }
        throw error;
      });

    return this.mapReviewRow(review);
  }

  /**
   * 내가 대표를 맡은 팀이 참가 확정한 대회 중, 종료됐지만 아직 팀 후기가 없는 대회 목록.
   * 팀 단위로 판단하므로 신청은 매니저가 했더라도 팀장에게 동일하게 노출된다.
   */
  async listMyPendingReviews(userId: string) {
    const registrations = await this.prisma.v1TournamentRegistration.findMany({
      where: {
        status: 'confirmed',
        tournament: { status: 'completed', deletedAt: null },
        team: {
          memberships: {
            some: { userId, status: 'active', role: { in: TOURNAMENT_REVIEW_ROLES } },
          },
        },
      },
      select: {
        teamId: true,
        tournament: { select: { id: true, title: true, scheduledEndAt: true, updatedAt: true } },
      },
    });
    if (registrations.length === 0) return [];

    const tournamentIds = [...new Set(registrations.map((r) => r.tournament.id))];
    const reviewed = await this.prisma.v1TournamentReview.findMany({
      where: { tournamentId: { in: tournamentIds }, teamId: { not: null } },
      select: { tournamentId: true, teamId: true },
    });
    const reviewedKeys = new Set(reviewed.map((r) => `${r.tournamentId}:${r.teamId}`));

    // scheduledEndAt(예정 종료일) 우선 — updatedAt은 완료 후 커버이미지 등 무관한 수정에도 갱신되어 정렬 기준으로 부정확
    const completedAt = (t: { scheduledEndAt: Date | null; updatedAt: Date }) => t.scheduledEndAt ?? t.updatedAt;

    // 한 대회에 여러 팀의 대표를 겸할 수 있으므로, 대회 단위로 접어 카드가 중복되지 않게 한다.
    const pendingByTournament = new Map<string, (typeof registrations)[number]['tournament']>();
    for (const r of registrations) {
      if (reviewedKeys.has(`${r.tournament.id}:${r.teamId}`)) continue;
      if (!pendingByTournament.has(r.tournament.id)) pendingByTournament.set(r.tournament.id, r.tournament);
    }

    return [...pendingByTournament.values()]
      .sort((a, b) => completedAt(b).getTime() - completedAt(a).getTime())
      .map((t) => ({
        tournamentId: t.id,
        tournamentTitle: t.title,
        completedAt: completedAt(t).toISOString(),
      }));
  }

  /**
   * 후기 작성 자격 확인 — 참가 팀 여부와, 팀별 작성 완료 상태를 함께 돌려준다.
   * 프론트는 `reviewableTeams` 로 CTA 노출/팀 선택 여부를 결정한다.
   */
  async participantCheck(tournamentId: string, userId: string) {
    const teams = await this.reviewableTeams(tournamentId, userId);
    return {
      isParticipant: teams.length > 0,
      reviewableTeams: teams,
    };
  }

  // ───────────────────── 리뷰 숨김 모더레이션 (어드민 전용) ─────────────────────

  /** 어드민 리뷰 목록 — 숨김 포함 전체 조회. active admin이면 조회 가능 (읽기 전용). */
  async listReviewsAdmin(user: V1AuthUser, tournamentId: string, query: ListTournamentReviewsQueryDto = {}) {
    await this.adminContext.getActiveAdmin(user.id);
    const { rows, total, page, pageSize } = await this.queryReviews(tournamentId, query, false);
    return {
      items: rows.map((r) => ({
        ...this.mapReviewRow(r),
        hiddenAt: r.hiddenAt?.toISOString() ?? null,
        hiddenReason: r.hiddenReason ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** 리뷰 숨김 (멱등 — 이미 숨김이면 alreadyHidden: true) */
  async hideReview(user: V1AuthUser, tournamentId: string, reviewId: string, dto: HideTournamentReviewDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const review = await this.prisma.v1TournamentReview.findFirst({
      where: { id: reviewId, tournamentId },
    });
    if (!review) {
      throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: '리뷰를 찾을 수 없어요.' });
    }
    if (review.hiddenAt) {
      return { alreadyHidden: true };
    }

    const reason = dto.reason?.trim() || null;
    const hiddenAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.v1TournamentReview.update({
        where: { id: reviewId },
        data: { hiddenAt, hiddenReason: reason },
      });

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.review_hide',
          targetType: 'tournament_review',
          targetId: reviewId,
          reason,
          beforeJson: { hiddenAt: null, hiddenReason: null },
          afterJson: { hiddenAt: hiddenAt.toISOString(), hiddenReason: reason },
        },
        tx,
      );
    });

    return { alreadyHidden: false };
  }

  /** 리뷰 숨김 해제 (멱등 — 이미 노출 중이면 alreadyVisible: true) */
  async unhideReview(user: V1AuthUser, tournamentId: string, reviewId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const review = await this.prisma.v1TournamentReview.findFirst({
      where: { id: reviewId, tournamentId },
    });
    if (!review) {
      throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: '리뷰를 찾을 수 없어요.' });
    }
    const previouslyHiddenAt = review.hiddenAt;
    if (!previouslyHiddenAt) {
      return { alreadyVisible: true };
    }
    const previouslyHiddenReason = review.hiddenReason ?? null;

    await this.prisma.$transaction(async (tx) => {
      await tx.v1TournamentReview.update({
        where: { id: reviewId },
        data: { hiddenAt: null, hiddenReason: null },
      });

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.review_unhide',
          targetType: 'tournament_review',
          targetId: reviewId,
          beforeJson: { hiddenAt: previouslyHiddenAt.toISOString(), hiddenReason: previouslyHiddenReason },
          afterJson: { hiddenAt: null, hiddenReason: null },
        },
        tx,
      );
    });

    return { alreadyVisible: false };
  }

  // ───────────────────── 어워드 (어드민 전용) ─────────────────────

  /** 어워드 목록 조회 — 실제 DB 조회. 어드민 게이트를 거친 호출부에서만 사용. */
  private async listAwardsInternal(tournamentId: string) {
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

  /**
   * 어워드 목록 (어드민 전용 조회).
   * active admin이면 support 포함 조회 가능 (읽기 전용이므로 getMutationAdmin 불필요).
   */
  async listAwards(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.listAwardsInternal(tournamentId);
  }

  /** 어워드 설정 (어드민 전용, 전체 replace — support 등급은 mutation 불가) */
  async setAwards(user: V1AuthUser, tournamentId: string, dto: SetTournamentAwardsDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    // 검증과 저장이 같은 값을 쓰도록 선(先)정규화 — 공백 섞인 입력이 그대로 저장되는 것을 방지.
    const awards = dto.awards.map((a) => ({
      ...a,
      recipientName: a.recipientName.trim(),
      teamName: a.teamName?.trim() || null,
    }));

    // 로스터 전용 강제 — 수상자는 해당 대회 확정(confirmed) 등록 팀 명단의 선수여야 하고,
    // 팀명이 지정된 경우 확정 등록 팀명과 일치해야 한다 (자유 입력 차단).
    if (awards.length > 0) {
      const registrations = await this.prisma.v1TournamentRegistration.findMany({
        where: { tournamentId, status: 'confirmed' },
        select: {
          team: { select: { name: true } },
          players: { where: { removedAt: null }, select: { realName: true } },
        },
      });
      const rosterNames = new Set(
        registrations.flatMap((r) => r.players.map((p) => p.realName.trim())),
      );
      // 팀명 → 그 팀의 선수 집합 (팀명 지정 시 수상자-팀 소속 교차 검증용)
      const teamRosters = new Map<string, Set<string>>();
      for (const r of registrations) {
        const teamName = r.team.name.trim();
        const roster = teamRosters.get(teamName) ?? new Set<string>();
        for (const p of r.players) roster.add(p.realName.trim());
        teamRosters.set(teamName, roster);
      }

      for (const a of awards) {
        if (!rosterNames.has(a.recipientName)) {
          throw new BadRequestException({
            code: 'AWARD_RECIPIENT_NOT_IN_ROSTER',
            message: `'${a.recipientName}'은(는) 대회 참가 명단에 없어요. 명단에서 수상자를 선택해 주세요.`,
          });
        }
        if (a.teamName) {
          const teamRoster = teamRosters.get(a.teamName);
          if (!teamRoster) {
            throw new BadRequestException({
              code: 'AWARD_RECIPIENT_NOT_IN_ROSTER',
              message: `'${a.teamName}'은(는) 대회에 참가 확정된 팀이 아니에요. 참가 팀에서 선택해 주세요.`,
            });
          }
          if (!teamRoster.has(a.recipientName)) {
            throw new BadRequestException({
              code: 'AWARD_RECIPIENT_NOT_IN_ROSTER',
              message: `'${a.recipientName}'은(는) '${a.teamName}' 팀 명단에 없어요. 수상자와 팀을 다시 확인해 주세요.`,
            });
          }
        }
      }
    }

    // 스냅샷 → 전체 교체 → 감사 기록을 한 트랜잭션에서 원자적으로 수행
    // (감사 로그 실패 시 데이터 변경도 함께 롤백, before/after drift 방지 — 타 admin mutation과 동일 패턴)
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.v1TournamentAward.findMany({
        where: { tournamentId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });

      await tx.v1TournamentAward.deleteMany({ where: { tournamentId } });
      for (const [idx, a] of awards.entries()) {
        await tx.v1TournamentAward.create({
          data: {
            tournamentId,
            awardType: a.awardType,
            awardLabel: a.awardLabel,
            recipientName: a.recipientName,
            teamName: a.teamName,
            note: a.note ?? null,
            sortOrder: a.sortOrder ?? idx,
          },
        });
      }

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.awards_replace',
          targetType: 'tournament',
          targetId: tournamentId,
          beforeJson: {
            awards: before.map((a) => ({
              awardLabel: a.awardLabel,
              recipientName: a.recipientName,
              teamName: a.teamName ?? null,
            })),
          },
          afterJson: {
            awards: awards.map((a) => ({
              awardLabel: a.awardLabel,
              recipientName: a.recipientName,
              teamName: a.teamName,
            })),
          },
        },
        tx,
      );
    });

    return this.listAwardsInternal(tournamentId);
  }
}
