import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  /**
   * 여러 팀의 팀장·운영진을 겸하는 사용자가, 그 여러 팀이 모두 같은 대회에 참가 확정된
   * 경우에만 필요. 자격 팀이 1개면 생략 가능(자동 선택). 자격 팀이 여러 개인데 생략하면
   * 400 TEAM_SELECTION_REQUIRED.
   */
  @IsOptional()
  @IsString()
  teamId?: string;
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

  // ───────────────────── 팀 권한 게이트 (팀장·운영진 manager+) ─────────────────────
  // 대회 후기는 "대회 신청 버튼을 누른 본인"이 아니라 "참가 확정 팀의 팀장·운영진"이면
  // 누구나 쓸 수 있다. registration.teamId ↔ 그 팀의 active owner/manager 멤버십으로 판정한다.

  private eligibleTeamWhere(userId: string): Prisma.V1TeamWhereInput {
    return {
      // 팀 자체가 살아 있어야 한다. 대회 도메인의 다른 팀 권한 게이트
      // (tournament-registrations.service.ts:57, tournament-players.service.ts:39 등)가
      // 모두 같은 조건을 쓴다 — 이게 빠지면 해체·비활성된 팀의 운영진이 계속 후기를
      // 쓰거나 isParticipant=true 로 잡힌다.
      status: 'active',
      deletedAt: null,
      memberships: {
        some: { userId, status: 'active', role: { in: ['owner', 'manager'] } },
      },
    };
  }

  /** 이 대회에 confirmed 등록이 있고, 내가 owner/manager인 팀 목록 (팀 여러 개면 다건). */
  private async findEligibleTeams(tournamentId: string, userId: string) {
    const registrations = await this.prisma.v1TournamentRegistration.findMany({
      where: { tournamentId, status: 'confirmed', team: this.eligibleTeamWhere(userId) },
      select: { teamId: true, team: { select: { name: true } } },
    });
    return registrations.map((r) => ({ teamId: r.teamId, teamName: r.team.name }));
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

  /** 리뷰 작성 (참가 확정 팀의 팀장·운영진 manager+ 누구나 가능, 대회 completed 상태) */
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

    // 2. 참가팀 확인 — 내가 owner/manager인 팀 중 이 대회에 confirmed 등록이 있는 팀
    const eligibleTeams = await this.findEligibleTeams(tournamentId, user.id);
    if (eligibleTeams.length === 0) {
      throw new ForbiddenException({
        code: 'NOT_PARTICIPANT',
        message: '대회에 참가한 팀의 팀장·운영진만 리뷰를 작성할 수 있어요.',
      });
    }

    // 여러 팀의 팀장·운영진을 겸하고 그 팀들이 모두 이 대회에 참가 확정된 경우에만 선택이
    // 필요하다 — 흔한 단일 팀 케이스는 자동 선택으로 기존 UX를 그대로 유지한다.
    let targetTeam: { teamId: string; teamName: string };
    if (eligibleTeams.length === 1) {
      targetTeam = eligibleTeams[0];
    } else if (!dto.teamId) {
      // AllExceptionsFilter(common/filters/http-exception.filter.ts)는 예외 응답 바디에서
      // code/message/details 만 클라이언트로 전달하고 그 외 top-level 필드는 버린다 —
      // teams 를 details 밖에 두면 프론트는 이 케이스를 영원히 복구할 수 없다(팀 목록 자체를
      // 못 받으므로). 다른 도메인의 구조화 에러 페이로드(예: PROFILE_COMPLETION_REQUIRED)와
      // 동일하게 details 안에 담는다.
      throw new BadRequestException({
        code: 'TEAM_SELECTION_REQUIRED',
        message: '여러 팀을 운영하고 계셔서 리뷰를 남길 팀을 먼저 선택해야 해요.',
        details: { teams: eligibleTeams },
      });
    } else {
      const match = eligibleTeams.find((t) => t.teamId === dto.teamId);
      if (!match) {
        throw new ForbiddenException({
          code: 'NOT_PARTICIPANT',
          message: '대회에 참가한 팀의 팀장·운영진만 리뷰를 작성할 수 있어요.',
        });
      }
      targetTeam = match;
    }

    // 3. 중복 리뷰 확인 — (a) 나는 대회당 1건만(authorUserId 유일 제약과 동일 정책),
    //    (b) 같은 팀도 대회당 1건만(다른 운영진이 이미 썼어도 막는다).
    const existing = await this.prisma.v1TournamentReview.findFirst({
      where: {
        tournamentId,
        OR: [{ authorUserId: user.id }, { teamId: targetTeam.teamId }],
      },
    });
    if (existing) {
      throw new BadRequestException({ code: 'ALREADY_REVIEWED', message: '이미 리뷰를 작성했어요.' });
    }

    // 4. 저장
    const review = await this.prisma.v1TournamentReview.create({
      data: {
        tournamentId,
        authorUserId: user.id,
        teamId: targetTeam.teamId,
        teamName: targetTeam.teamName,
        rating: dto.rating,
        comment: dto.comment ?? null,
        photoUrls: dto.photoUrls ?? [],
      },
      include: {
        author: { select: { id: true, profile: { select: { nickname: true, profileImageUrl: true } } } },
      },
    });

    return this.mapReviewRow(review);
  }

  /**
   * 내가 팀장·운영진인 팀이 참가 확정한 대회 중 종료됐지만 아직 리뷰가 없는 대회 목록
   * (최근 종료순). "리뷰가 없다"는 authorUserId(나) 또는 내 자격 팀 어느 쪽 기준으로도
   * 없어야 한다 — 다른 운영진이 이미 우리 팀 리뷰를 썼으면 더는 pending이 아니다(대회당
   * 인당 1건 제약이라 어차피 내가 또 쓸 수 없다).
   */
  async listMyPendingReviews(userId: string) {
    const registrations = await this.prisma.v1TournamentRegistration.findMany({
      where: {
        status: 'confirmed',
        team: this.eligibleTeamWhere(userId),
        tournament: { status: 'completed', deletedAt: null },
      },
      select: {
        teamId: true,
        tournament: { select: { id: true, title: true, scheduledEndAt: true, updatedAt: true } },
      },
    });
    if (registrations.length === 0) return [];

    const uniqueTournaments = new Map<
      string,
      { id: string; title: string; scheduledEndAt: Date | null; updatedAt: Date }
    >();
    const teamIds = new Set<string>();
    for (const r of registrations) {
      if (!uniqueTournaments.has(r.tournament.id)) uniqueTournaments.set(r.tournament.id, r.tournament);
      teamIds.add(r.teamId);
    }

    const reviewed = await this.prisma.v1TournamentReview.findMany({
      where: {
        tournamentId: { in: [...uniqueTournaments.keys()] },
        OR: [{ authorUserId: userId }, { teamId: { in: [...teamIds] } }],
      },
      select: { tournamentId: true },
    });
    const reviewedSet = new Set(reviewed.map((r) => r.tournamentId));

    // scheduledEndAt(예정 종료일) 우선 — updatedAt은 완료 후 커버이미지 등 무관한 수정에도 갱신되어 정렬 기준으로 부정확
    const completedAt = (t: { scheduledEndAt: Date | null; updatedAt: Date }) => t.scheduledEndAt ?? t.updatedAt;

    return [...uniqueTournaments.values()]
      .filter((t) => !reviewedSet.has(t.id))
      .sort((a, b) => completedAt(b).getTime() - completedAt(a).getTime())
      .map((t) => ({
        tournamentId: t.id,
        tournamentTitle: t.title,
        completedAt: completedAt(t).toISOString(),
      }));
  }

  /**
   * 내 리뷰 조회. "내"의 기준은 (a) 내가 직접 작성한 리뷰(authorUserId) 또는 (b) 내가
   * 팀장·운영진인 팀 몫으로 다른 운영진이 작성한 리뷰 — 둘 중 하나라도 있으면 반환한다.
   * (a)만으로는 팀장이 쓴 리뷰를 매니저가 "이미 작성됨"으로 못 봐서 재작성을 시도하다
   * ALREADY_REVIEWED로 막히는 UX가 생긴다.
   */
  async getMyReview(tournamentId: string, userId: string) {
    const eligibleTeams = await this.findEligibleTeams(tournamentId, userId);
    const review = await this.prisma.v1TournamentReview.findFirst({
      where: {
        tournamentId,
        OR: [
          { authorUserId: userId },
          ...(eligibleTeams.length > 0
            ? [{ teamId: { in: eligibleTeams.map((t) => t.teamId) } }]
            : []),
        ],
      },
    });
    if (!review) return null;
    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment ?? null,
      createdAt: review.createdAt.toISOString(),
    };
  }

  /** 참가 확정 팀의 팀장·운영진인지 확인 */
  async isParticipant(tournamentId: string, userId: string): Promise<boolean> {
    const reg = await this.prisma.v1TournamentRegistration.findFirst({
      where: { tournamentId, status: 'confirmed', team: this.eligibleTeamWhere(userId) },
      select: { id: true },
    });
    return !!reg;
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
