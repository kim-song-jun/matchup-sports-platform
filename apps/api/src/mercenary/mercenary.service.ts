import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  MercenaryApplicationStatus,
  Prisma,
  SportType,
  TeamRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamMembershipService } from '../teams/team-membership.service';
import { CreateMercenaryPostDto } from './dto/create-mercenary-post.dto';
import { UpdateMercenaryPostDto } from './dto/update-mercenary-post.dto';
import { ApplyMercenaryDto } from './dto/apply-mercenary.dto';
import { MercenaryQueryDto } from './dto/mercenary-query.dto';

@Injectable()
export class MercenaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamMembership: TeamMembershipService,
  ) {}

  /** Returns paginated list of mercenary posts with basic team and author info. */
  async findAll(filter: MercenaryQueryDto) {
    const limit = filter.limit ?? 20;

    const items = await this.prisma.mercenaryPost.findMany({
      where: {
        ...(filter.sportType ? { sportType: filter.sportType } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.teamId ? { teamId: filter.teamId } : {}),
      },
      include: {
        team: { select: { id: true, name: true, sportTypes: true } },
        author: { select: { id: true, nickname: true } },
        _count: {
          select: {
            applications: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor
        ? { skip: 1, cursor: { id: filter.cursor } }
        : {}),
    });

    const hasMore = items.length > limit;
    const data = (hasMore ? items.slice(0, limit) : items).map(({ _count, ...item }) => ({
      ...item,
      applicationCount: _count.applications,
    }));
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { items: data, nextCursor };
  }

  /** Returns full post detail including applications with applicant user info. */
  async findOne(id: string, currentUserId?: string) {
    const post = await this.prisma.mercenaryPost.findUnique({
      where: { id },
      include: {
        team: { select: { id: true, name: true, sportTypes: true } },
        author: { select: { id: true, nickname: true } },
        applications: {
          include: {
            user: { select: { id: true, nickname: true, profileImageUrl: true } },
          },
          orderBy: { appliedAt: 'asc' },
        },
        _count: {
          select: {
            applications: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
    }

    const isAuthenticated = Boolean(currentUserId);
    const isAuthor = isAuthenticated && post.authorId === currentUserId;
    const membership = currentUserId
      ? await this.teamMembership.getMembership(post.teamId, currentUserId)
      : null;
    const canManage = this.canManageWithRole(membership?.role);
    const canApplyAsMember = Boolean(isAuthenticated && !membership && !isAuthor && post.status === 'open');
    const myApplication = currentUserId
      ? post.applications.find((application) => application.userId === currentUserId) ?? null
      : null;
    const canApply = canApplyAsMember && !myApplication;

    let applyBlockReason: string | null = null;
    if (!isAuthenticated) {
      applyBlockReason = 'AUTH_REQUIRED';
    } else if (isAuthor || canManage) {
      applyBlockReason = 'TEAM_MANAGER_CANNOT_APPLY';
    } else if (membership) {
      applyBlockReason = 'TEAM_MEMBER_CANNOT_APPLY';
    } else if (post.status !== 'open') {
      applyBlockReason = 'POST_NOT_OPEN';
    } else if (myApplication) {
      applyBlockReason = 'ALREADY_APPLIED';
    }

    return {
      ...post,
      applications: canManage ? post.applications : [],
      applicationCount: post._count.applications,
      canManageApplications: canManage,
      canApply,
      applyBlockReason,
      viewerApplication: myApplication,
      viewer: {
        isAuthenticated,
        isAuthor,
        canManage,
        canApply,
        applyBlockReason,
        myApplicationStatus: myApplication?.status ?? null,
        myApplicationId: myApplication?.id ?? null,
      },
    };
  }

  /** Creates a new mercenary post. Requires manager+ role in the team. */
  async create(userId: string, dto: CreateMercenaryPostDto) {
    await this.teamMembership.assertRole(dto.teamId, userId, 'manager');
    await this.assertTeamSportType(dto.teamId, dto.sportType);

    return this.prisma.mercenaryPost.create({
      data: {
        teamId: dto.teamId,
        authorId: userId,
        sportType: dto.sportType,
        matchDate: new Date(dto.matchDate),
        venue: dto.venue,
        position: dto.position,
        count: dto.count ?? 1,
        level: dto.level ?? 3,
        fee: dto.fee ?? 0,
        notes: dto.notes ?? null,
      },
      include: {
        team: { select: { id: true, name: true, sportTypes: true } },
        author: { select: { id: true, nickname: true } },
      },
    });
  }

  /** Updates a mercenary post. Only the author or team manager+ may update. */
  async update(id: string, userId: string, dto: UpdateMercenaryPostDto) {
    const post = await this.prisma.mercenaryPost.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
    }

    const isAuthor = post.authorId === userId;
    if (!isAuthor) {
      await this.teamMembership.assertRole(post.teamId, userId, 'manager');
    }
    if (dto.sportType !== undefined) {
      await this.assertTeamSportType(post.teamId, dto.sportType);
    }

    return this.prisma.mercenaryPost.update({
      where: { id },
      data: {
        ...(dto.sportType !== undefined ? { sportType: dto.sportType } : {}),
        ...(dto.matchDate !== undefined ? { matchDate: new Date(dto.matchDate) } : {}),
        ...(dto.venue !== undefined ? { venue: dto.venue } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.count !== undefined ? { count: dto.count } : {}),
        ...(dto.level !== undefined ? { level: dto.level } : {}),
        ...(dto.fee !== undefined ? { fee: dto.fee } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: {
        team: { select: { id: true, name: true, sportTypes: true } },
        author: { select: { id: true, nickname: true } },
      },
    });
  }

  /** Deletes a mercenary post. Only the author or team manager+ may delete. */
  async remove(id: string, userId: string) {
    const post = await this.prisma.mercenaryPost.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
    }

    const isAuthor = post.authorId === userId;
    if (!isAuthor) {
      await this.teamMembership.assertRole(post.teamId, userId, 'manager');
    }

    await this.prisma.mercenaryPost.delete({ where: { id } });
    return { message: '모집글이 삭제되었습니다.' };
  }

  /** Submits an application to a mercenary post. */
  async apply(postId: string, userId: string, dto: ApplyMercenaryDto) {
    const post = await this.prisma.mercenaryPost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
    }
    if (post.status !== 'open') {
      throw new BadRequestException('모집이 마감된 글입니다.');
    }
    if (post.authorId === userId) {
      throw new BadRequestException('작성자는 자신의 모집글에 지원할 수 없습니다.');
    }

    // Block self-team apply: check if applicant is already a member of the host team
    const membership = await this.teamMembership.getMembership(post.teamId, userId);
    if (membership) {
      throw new BadRequestException('자신의 팀 모집글에는 지원할 수 없습니다.');
    }

    // Prevent duplicate pending application
    const existing = await this.prisma.mercenaryApplication.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      throw new ConflictException('이미 지원한 모집글입니다.');
    }

    try {
      return await this.prisma.mercenaryApplication.create({
        data: {
          postId,
          userId,
          message: dto.message ?? null,
        },
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException('이미 지원한 모집글입니다.');
      }
      throw error;
    }
  }

  /** Accepts an application. Requires manager+ role. Updates post status if count is filled. */
  async acceptApplication(postId: string, appId: string, userId: string) {
    const post = await this.prisma.mercenaryPost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
    }
    if (post.status !== 'open') {
      throw new BadRequestException('진행 중인 모집글에서만 신청을 승인할 수 있습니다.');
    }

    await this.teamMembership.assertRole(post.teamId, userId, 'manager');
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const currentPost = await tx.mercenaryPost.findUnique({
            where: { id: postId },
            select: { id: true, count: true, status: true },
          });
          if (!currentPost) {
            throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
          }
          if (currentPost.status !== 'open') {
            throw new BadRequestException('진행 중인 모집글에서만 신청을 승인할 수 있습니다.');
          }

          const app = await tx.mercenaryApplication.findFirst({
            where: { id: appId, postId },
          });
          if (!app) {
            throw new NotFoundException('신청을 찾을 수 없습니다.');
          }
          if (app.status !== 'pending') {
            throw new BadRequestException('대기 중인 신청만 승인할 수 있습니다.');
          }

          const acceptedBefore = await tx.mercenaryApplication.count({
            where: { postId, status: 'accepted' },
          });
          if (acceptedBefore >= currentPost.count) {
            await this.closeFilledPost(tx, postId, userId);
            throw new BadRequestException('모집 정원이 이미 찼습니다.');
          }

          const decidedAt = new Date();
          const accepted = await tx.mercenaryApplication.updateMany({
            where: { id: appId, postId, status: 'pending' },
            data: {
              status: 'accepted',
              decidedAt,
              decidedBy: userId,
            },
          });
          if (accepted.count === 0) {
            throw new ConflictException('신청 상태가 이미 변경되었습니다.');
          }

          const acceptedCount = await tx.mercenaryApplication.count({
            where: { postId, status: 'accepted' },
          });
          if (acceptedCount >= currentPost.count) {
            await this.closeFilledPost(tx, postId, userId, decidedAt);
          }

          const updatedApp = await tx.mercenaryApplication.findFirst({
            where: { id: appId, postId },
          });
          if (!updatedApp) {
            throw new NotFoundException('승인된 신청을 찾을 수 없습니다.');
          }

          return updatedApp;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (this.isPrismaError(error, 'P2034')) {
        throw new ConflictException('다른 승인 요청과 충돌했습니다. 다시 시도해주세요.');
      }
      throw error;
    }
  }

  /** Rejects an application. Requires manager+ role. */
  async rejectApplication(postId: string, appId: string, userId: string) {
    const post = await this.prisma.mercenaryPost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
    }
    if (post.status !== 'open') {
      throw new BadRequestException('진행 중인 모집글에서만 신청을 거절할 수 있습니다.');
    }

    await this.teamMembership.assertRole(post.teamId, userId, 'manager');

    const app = await this.prisma.mercenaryApplication.findFirst({
      where: { id: appId, postId },
    });
    if (!app) {
      throw new NotFoundException('신청을 찾을 수 없습니다.');
    }
    if (app.status !== 'pending') {
      throw new BadRequestException('대기 중인 신청만 거절할 수 있습니다.');
    }

    return this.prisma.mercenaryApplication.update({
      where: { id: appId },
      data: {
        status: 'rejected',
        decidedAt: new Date(),
        decidedBy: userId,
      },
    });
  }

  /** Withdraws the current user's own pending application. */
  async withdrawApplication(postId: string, userId: string) {
    const app = await this.prisma.mercenaryApplication.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (!app) {
      throw new NotFoundException('신청을 찾을 수 없습니다.');
    }
    if (app.status !== 'pending') {
      throw new BadRequestException('대기 중인 신청만 취소할 수 있습니다.');
    }

    return this.prisma.mercenaryApplication.update({
      where: { postId_userId: { postId, userId } },
      data: { status: 'withdrawn' },
    });
  }

  /** Returns paginated mercenary applications by the user, optionally filtered by status. */
  async findMyApplications(userId: string, status?: MercenaryApplicationStatus, cursor?: string, take = 30) {
    const items = await this.prisma.mercenaryApplication.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      include: {
        post: {
          include: {
            team: { select: { id: true, name: true, sportTypes: true } },
          },
        },
      },
      orderBy: { appliedAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > take;
    if (hasMore) items.pop();
    return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
  }

  private canManageWithRole(role?: TeamRole): boolean {
    return role === 'owner' || role === 'manager';
  }

  private async assertTeamSportType(teamId: string, sportType: SportType) {
    const team = await this.prisma.sportTeam.findUnique({
      where: { id: teamId },
      select: { sportTypes: true },
    });
    if (!team) {
      throw new NotFoundException('팀을 찾을 수 없습니다.');
    }
    if (!team.sportTypes.includes(sportType)) {
      throw new BadRequestException('팀 종목과 모집글 종목은 일치해야 합니다.');
    }
  }

  private async closeFilledPost(
    tx: Prisma.TransactionClient,
    postId: string,
    userId: string,
    decidedAt = new Date(),
  ) {
    await tx.mercenaryPost.update({
      where: { id: postId },
      data: { status: 'filled' },
    });
    await tx.mercenaryApplication.updateMany({
      where: { postId, status: 'pending' },
      data: {
        status: 'rejected',
        decidedAt,
        decidedBy: userId,
      },
    });
  }

  private isPrismaError(error: unknown, code: string): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }
}
