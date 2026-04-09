import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchStatus, LessonStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLessonAdminDto } from './dto/create-lesson-admin.dto';
import { CreateTeamAdminDto } from './dto/create-team-admin.dto';
import { CreateVenueAdminDto, UpdateVenueAdminDto } from './dto/create-venue-admin.dto';

export interface AdminAuditEntry {
  id: string;
  action: string;
  actor: string;
  note: string | null;
  createdAt: Date;
}

interface UserModerationState {
  status: 'active' | 'suspended';
  suspensionReason: string | null;
}

@Injectable()
export class AdminService {
  private readonly userAuditLog = new Map<string, AdminAuditEntry[]>();
  private readonly userModerationState = new Map<string, UserModerationState>();

  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats() {
    const [userCount, matchCount, lessonCount, teamCount, venueCount, listingCount] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.match.count(),
      this.prisma.lesson.count(),
      this.prisma.sportTeam.count(),
      this.prisma.venue.count(),
      this.prisma.marketplaceListing.count({ where: { status: 'active' } }),
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayMatches, todayUsers] = await Promise.all([
      this.prisma.match.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart }, deletedAt: null } }),
    ]);

    return {
      totalUsers: userCount,
      totalMatches: matchCount,
      totalLessons: lessonCount,
      totalTeams: teamCount,
      totalVenues: venueCount,
      activeListings: listingCount,
      todayMatches,
      todayNewUsers: todayUsers,
    };
  }

  async getUsers(filter: { search?: string; cursor?: string }) {
    const limit = 20;
    const where: { deletedAt: null; nickname?: { contains: string; mode: 'insensitive' } } = {
      deletedAt: null,
    };
    if (filter.search) {
      where.nickname = { contains: filter.search, mode: 'insensitive' };
    }

    const items = await this.prisma.user.findMany({
      where,
      select: {
        id: true, nickname: true, email: true, gender: true,
        mannerScore: true, totalMatches: true, sportTypes: true,
        locationCity: true, oauthProvider: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });

    const hasNext = items.length > limit;
    const result = hasNext ? items.slice(0, limit) : items;
    return { items: result, nextCursor: hasNext ? result[result.length - 1].id : null };
  }

  async getUserDetail(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        nickname: true,
        email: true,
        profileImageUrl: true,
        gender: true,
        bio: true,
        mannerScore: true,
        totalMatches: true,
        locationCity: true,
        locationDistrict: true,
        createdAt: true,
        sportTypes: true,
        sportProfiles: true,
        oauthProvider: true,
      },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    const moderationState = this.userModerationState.get(id) ?? {
      status: 'active' as const,
      suspensionReason: null,
    };
    const auditLog = [...(this.userAuditLog.get(id) ?? [])].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    return {
      ...user,
      provider: user.oauthProvider,
      adminStatus: moderationState.status,
      warningCount: auditLog.filter((entry) => entry.action === 'warn').length,
      suspensionReason: moderationState.suspensionReason,
      adminAuditLog: auditLog,
    };
  }

  async warnUser(id: string, payload: { actor: string; note?: string }) {
    await this.ensureUserExists(id);
    const entry = this.appendUserAudit(id, {
      action: 'warn',
      actor: payload.actor,
      note: payload.note ?? null,
    });

    return {
      userId: id,
      action: 'warn',
      warningCount: (this.userAuditLog.get(id) ?? []).filter((item) => item.action === 'warn').length,
      auditEntry: entry,
    };
  }

  async updateUserStatus(
    id: string,
    payload: { actor: string; status: 'active' | 'suspended'; note?: string },
  ) {
    await this.ensureUserExists(id);

    this.userModerationState.set(id, {
      status: payload.status,
      suspensionReason: payload.status === 'suspended' ? payload.note ?? null : null,
    });

    const entry = this.appendUserAudit(id, {
      action: payload.status === 'suspended' ? 'suspend' : 'reactivate',
      actor: payload.actor,
      note: payload.note ?? null,
    });

    return {
      userId: id,
      status: payload.status,
      suspensionReason: payload.status === 'suspended' ? payload.note ?? null : null,
      auditEntry: entry,
    };
  }

  async getMatches(filter: { status?: string; cursor?: string }) {
    const limit = 20;
    const where: { status?: MatchStatus } = {};
    if (filter.status) where.status = filter.status as MatchStatus;

    const items = await this.prisma.match.findMany({
      where,
      include: {
        host: { select: { id: true, nickname: true } },
        venue: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });

    const hasNext = items.length > limit;
    const result = hasNext ? items.slice(0, limit) : items;
    return { items: result, nextCursor: hasNext ? result[result.length - 1].id : null };
  }

  async updateMatchStatus(id: string, status: MatchStatus) {
    return this.prisma.match.update({
      where: { id },
      data: { status },
    });
  }

  async getLessons() {
    return this.prisma.lesson.findMany({
      include: { host: { select: { id: true, nickname: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getTeams() {
    return this.prisma.sportTeam.findMany({
      include: { owner: { select: { id: true, nickname: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async createLesson(data: CreateLessonAdminDto) {
    return this.prisma.lesson.create({
      data: {
        hostId: data.hostId,
        sportType: data.sportType,
        type: data.type,
        title: data.title,
        description: data.description,
        venueName: data.venueName,
        venueId: data.venueId,
        lessonDate: new Date(data.lessonDate),
        startTime: data.startTime,
        endTime: data.endTime,
        maxParticipants: data.maxParticipants,
        fee: data.fee ?? 0,
        levelMin: data.levelMin ?? 1,
        levelMax: data.levelMax ?? 5,
        coachName: data.coachName,
        coachBio: data.coachBio,
        coachImageUrl: data.coachImageUrl,
        imageUrls: data.imageUrls ?? [],
        isRecurring: data.isRecurring ?? false,
        recurringDays: data.recurringDays ?? [],
        recurringUntil: data.recurringUntil ? new Date(data.recurringUntil) : undefined,
      },
    });
  }

  async updateLessonStatus(id: string, status: LessonStatus) {
    return this.prisma.lesson.update({
      where: { id },
      data: { status },
    });
  }

  async createTeam(data: CreateTeamAdminDto) {
    // task 19 fix: admin-created teams must also get an owner TeamMembership row,
    // otherwise every TeamMembershipService.assertRole check fails on the team.
    // Mirrors TeamsService.create transactional behavior.
    return this.prisma.$transaction(async (tx) => {
      const team = await tx.sportTeam.create({
        data: {
          ownerId: data.ownerId,
          name: data.name,
          sportType: data.sportType,
          description: data.description,
          logoUrl: data.logoUrl,
          coverImageUrl: data.coverImageUrl,
          photos: data.photos ?? [],
          city: data.city,
          district: data.district,
          memberCount: data.memberCount ?? 1,
          level: data.level ?? 3,
          isRecruiting: data.isRecruiting ?? true,
          contactInfo: data.contactInfo,
          instagramUrl: data.instagramUrl,
          youtubeUrl: data.youtubeUrl,
          shortsUrl: data.shortsUrl,
          kakaoOpenChat: data.kakaoOpenChat,
          websiteUrl: data.websiteUrl,
        },
      });

      await tx.teamMembership.create({
        data: {
          teamId: team.id,
          userId: data.ownerId,
          role: 'owner',
          status: 'active',
        },
      });

      return team;
    });
  }

  async getVenues() {
    return this.prisma.venue.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createVenue(data: CreateVenueAdminDto) {
    return this.prisma.venue.create({
      data: {
        name: data.name,
        type: data.type,
        sportTypes: data.sportTypes,
        address: data.address,
        addressDetail: data.addressDetail,
        lat: data.lat,
        lng: data.lng,
        city: data.city,
        district: data.district,
        phone: data.phone,
        description: data.description,
        imageUrls: data.imageUrls ?? [],
        facilities: data.facilities ?? [],
        operatingHours: data.operatingHours ?? {},
        pricePerHour: data.pricePerHour,
        rinkSubType: data.rinkSubType,
      },
    });
  }

  async updateVenue(id: string, data: UpdateVenueAdminDto) {
    return this.prisma.venue.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.sportTypes !== undefined && { sportTypes: data.sportTypes }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.addressDetail !== undefined && { addressDetail: data.addressDetail }),
        ...(data.lat !== undefined && { lat: data.lat }),
        ...(data.lng !== undefined && { lng: data.lng }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.district !== undefined && { district: data.district }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.imageUrls !== undefined && { imageUrls: data.imageUrls }),
        ...(data.facilities !== undefined && { facilities: data.facilities }),
        ...(data.operatingHours !== undefined && { operatingHours: data.operatingHours }),
        ...(data.pricePerHour !== undefined && { pricePerHour: data.pricePerHour }),
        ...(data.rinkSubType !== undefined && { rinkSubType: data.rinkSubType }),
      },
    });
  }

  async getPayments() {
    return this.prisma.payment.findMany({
      include: {
        user: { select: { id: true, nickname: true } },
        participant: {
          include: {
            match: {
              include: {
                venue: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async ensureUserExists(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
  }

  private appendUserAudit(
    userId: string,
    entry: Omit<AdminAuditEntry, 'id' | 'createdAt'>,
  ) {
    const auditEntry: AdminAuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
      ...entry,
    };
    const current = this.userAuditLog.get(userId) ?? [];
    current.push(auditEntry);
    this.userAuditLog.set(userId, current);
    return auditEntry;
  }
}
