import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { MercenaryApplicationStatus } from '@prisma/client';
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
        team: { select: { id: true, name: true, sportType: true } },
        author: { select: { id: true, nickname: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor
        ? { skip: 1, cursor: { id: filter.cursor } }
        : {}),
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { items: data, nextCursor };
  }

  /** Returns full post detail including applications with applicant user info. */
  async findOne(id: string, currentUserId?: string) {
    const post = await this.prisma.mercenaryPost.findUnique({
      where: { id },
      include: {
        team: { select: { id: true, name: true, sportType: true } },
        author: { select: { id: true, nickname: true } },
        applications: {
          include: {
            user: { select: { id: true, nickname: true, profileImageUrl: true } },
          },
          orderBy: { appliedAt: 'asc' },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
    }

    return post;
  }

  /** Creates a new mercenary post. Requires manager+ role in the team. */
  async create(userId: string, dto: CreateMercenaryPostDto) {
    await this.teamMembership.assertRole(dto.teamId, userId, 'manager');

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
        team: { select: { id: true, name: true, sportType: true } },
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
        team: { select: { id: true, name: true, sportType: true } },
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

    return this.prisma.mercenaryApplication.create({
      data: {
        postId,
        userId,
        message: dto.message ?? null,
      },
    });
  }

  /** Accepts an application. Requires manager+ role. Updates post status if count is filled. */
  async acceptApplication(postId: string, appId: string, userId: string) {
    const post = await this.prisma.mercenaryPost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
    }

    await this.teamMembership.assertRole(post.teamId, userId, 'manager');

    const app = await this.prisma.mercenaryApplication.findFirst({
      where: { id: appId, postId },
    });
    if (!app) {
      throw new NotFoundException('신청을 찾을 수 없습니다.');
    }

    const updatedApp = await this.prisma.mercenaryApplication.update({
      where: { id: appId },
      data: {
        status: 'accepted',
        decidedAt: new Date(),
        decidedBy: userId,
      },
    });

    // Count accepted applications and mark post as filled if needed
    const acceptedCount = await this.prisma.mercenaryApplication.count({
      where: { postId, status: 'accepted' },
    });
    if (acceptedCount >= post.count) {
      await this.prisma.mercenaryPost.update({
        where: { id: postId },
        data: { status: 'filled' },
      });
    }

    return updatedApp;
  }

  /** Rejects an application. Requires manager+ role. */
  async rejectApplication(postId: string, appId: string, userId: string) {
    const post = await this.prisma.mercenaryPost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
    }

    await this.teamMembership.assertRole(post.teamId, userId, 'manager');

    const app = await this.prisma.mercenaryApplication.findFirst({
      where: { id: appId, postId },
    });
    if (!app) {
      throw new NotFoundException('신청을 찾을 수 없습니다.');
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

  /** Returns all mercenary applications by the user, optionally filtered by status. */
  async findMyApplications(userId: string, status?: MercenaryApplicationStatus) {
    return this.prisma.mercenaryApplication.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      include: {
        post: {
          include: {
            team: { select: { id: true, name: true, sportType: true } },
          },
        },
      },
      orderBy: { appliedAt: 'desc' },
    });
  }
}
