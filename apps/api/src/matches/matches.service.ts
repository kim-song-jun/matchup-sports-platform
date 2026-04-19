import { createHash } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma, NotificationType, SportType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CancelMatchDto, ComposeTeamsDto, CreateMatchDto, MatchFilterDto, TeamConfigDto, UpdateMatchDto } from './dto/match.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationData } from '../notifications/notification-presentation';
import { MatchingEngineService, RecommendationReason } from './matching-engine.service';
import { BadgesService } from '../badges/badges.service';
import { TeamBalancingService, ParticipantWithElo, BalancedDistribution } from './team-balancing.service';

/**
 * Computes a deterministic SHA-256 hex digest of the confirmed participant list.
 * Sorts userIds before hashing so insertion order does not affect the result.
 * Used to detect participant churn between preview and compose (C1/C2).
 */
export function computeParticipantHash(participants: { userId: string }[]): string {
  const sorted = participants.map((p) => p.userId).sort();
  return createHash('sha256').update(sorted.join(',')).digest('hex');
}

const recommendedMatchSelect = {
  id: true,
  hostId: true,
  sportType: true,
  title: true,
  description: true,
  imageUrl: true,
  venueId: true,
  matchDate: true,
  startTime: true,
  endTime: true,
  maxPlayers: true,
  currentPlayers: true,
  fee: true,
  levelMin: true,
  levelMax: true,
  gender: true,
  status: true,
  teamConfig: true,
  createdAt: true,
  venue: {
    select: {
      id: true,
      name: true,
      city: true,
      district: true,
      imageUrls: true,
      lat: true,
      lng: true,
    },
  },
  host: {
    select: {
      id: true,
      nickname: true,
      profileImageUrl: true,
    },
  },
} satisfies Prisma.MatchSelect;

const matchListSelect = {
  id: true,
  hostId: true,
  sportType: true,
  title: true,
  description: true,
  imageUrl: true,
  venueId: true,
  matchDate: true,
  startTime: true,
  endTime: true,
  maxPlayers: true,
  currentPlayers: true,
  fee: true,
  levelMin: true,
  levelMax: true,
  gender: true,
  status: true,
  teamConfig: true,
  createdAt: true,
  venue: {
    select: {
      id: true,
      name: true,
      city: true,
      district: true,
      imageUrls: true,
    },
  },
  host: {
    select: {
      id: true,
      nickname: true,
      profileImageUrl: true,
    },
  },
} satisfies Prisma.MatchSelect;

const matchDetailSelect = {
  id: true,
  hostId: true,
  sportType: true,
  title: true,
  description: true,
  imageUrl: true,
  venueId: true,
  matchDate: true,
  startTime: true,
  endTime: true,
  maxPlayers: true,
  currentPlayers: true,
  fee: true,
  levelMin: true,
  levelMax: true,
  gender: true,
  status: true,
  teamConfig: true,
  createdAt: true,
  updatedAt: true,
  venue: true,
  host: {
    select: {
      id: true,
      nickname: true,
      profileImageUrl: true,
      mannerScore: true,
    },
  },
  participants: {
    include: {
      user: {
        select: {
          id: true,
          nickname: true,
          profileImageUrl: true,
        },
      },
    },
  },
  teams: true,
} satisfies Prisma.MatchSelect;

const matchMutationSelect = {
  id: true,
  hostId: true,
  sportType: true,
  title: true,
  description: true,
  imageUrl: true,
  venueId: true,
  matchDate: true,
  startTime: true,
  endTime: true,
  maxPlayers: true,
  currentPlayers: true,
  fee: true,
  levelMin: true,
  levelMax: true,
  gender: true,
  status: true,
  teamConfig: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MatchSelect;

type MatchStatus = 'recruiting' | 'full' | 'in_progress' | 'cancelled' | 'completed';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly matchingEngine: MatchingEngineService,
    private readonly badgesService: BadgesService,
    private readonly teamBalancing: TeamBalancingService,
  ) {}

  async findAll(filter: MatchFilterDto) {
    const limit = filter.limit ?? 20;
    const where: Prisma.MatchWhereInput = {
      status: filter.availableOnly ? 'recruiting' : { in: ['recruiting', 'full'] },
    };

    if (filter.sportType) where.sportType = filter.sportType as SportType;
    if (filter.q) {
      where.OR = [
        { title: { contains: filter.q, mode: 'insensitive' } },
        { description: { contains: filter.q, mode: 'insensitive' } },
        {
          venue: {
            is: {
              name: { contains: filter.q, mode: 'insensitive' },
            },
          },
        },
        {
          venue: {
            is: {
              city: { contains: filter.q, mode: 'insensitive' },
            },
          },
        },
        {
          venue: {
            is: {
              district: { contains: filter.q, mode: 'insensitive' },
            },
          },
        },
      ];
    }
    if (filter.city || filter.district) {
      where.venue = {
        is: {
          ...(filter.city ? { city: { contains: filter.city, mode: 'insensitive' } } : {}),
          ...(filter.district ? { district: { contains: filter.district, mode: 'insensitive' } } : {}),
        },
      };
    }
    if (filter.date) where.matchDate = new Date(filter.date);
    if (typeof filter.maxFee === 'number' && !Number.isNaN(filter.maxFee)) {
      where.fee = { lte: filter.maxFee };
    }
    if (filter.freeOnly) {
      where.fee = 0;
    }
    const levelMinFilter: Prisma.IntFilter = {};
    const levelMaxFilter: Prisma.IntFilter = {};

    if (filter.levelMin) {
      levelMaxFilter.gte = filter.levelMin;
    }
    if (filter.levelMax) {
      levelMinFilter.lte = filter.levelMax;
    }
    if (filter.beginnerFriendly) {
      levelMaxFilter.lte = 2;
    }
    if (Object.keys(levelMinFilter).length > 0) {
      where.levelMin = levelMinFilter;
    }
    if (Object.keys(levelMaxFilter).length > 0) {
      where.levelMax = levelMaxFilter;
    }

    const orderBy: Prisma.MatchOrderByWithRelationInput[] =
      filter.sort === 'latest'
        ? [{ createdAt: 'desc' }]
        : filter.sort === 'deadline'
          ? [{ currentPlayers: 'desc' }, { maxPlayers: 'asc' }, { matchDate: 'asc' }, { startTime: 'asc' }]
          : [{ matchDate: 'asc' }, { startTime: 'asc' }];

    const matches = await this.prisma.match.findMany({
      where,
      select: matchListSelect,
      orderBy,
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });

    const hasNext = matches.length > limit;
    const items = hasNext ? matches.slice(0, limit) : matches;

    return {
      items,
      nextCursor: hasNext ? items[items.length - 1].id : null,
    };
  }

  async getRecommended(userId: string | null) {
    const candidates = await this.prisma.match.findMany({
      where: { status: { in: ['recruiting', 'full'] } },
      select: recommendedMatchSelect,
      orderBy: [{ currentPlayers: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });

    if (!userId) {
      // Unauthenticated: return top 10 sorted by urgency + freshness
      return candidates
        .sort((a, b) => {
          const fillA = a.maxPlayers > 0 ? a.currentPlayers / a.maxPlayers : 0;
          const fillB = b.maxPlayers > 0 ? b.currentPlayers / b.maxPlayers : 0;
          return fillB - fillA || b.createdAt.getTime() - a.createdAt.getTime();
        })
        .slice(0, 10);
    }

    const [user, sportProfiles] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          locationLat: true,
          locationLng: true,
          locationCity: true,
          locationDistrict: true,
          sportTypes: true,
        },
      }),
      this.prisma.userSportProfile.findMany({
        where: { userId },
        select: { sportType: true, level: true },
      }),
    ]);

    if (!user) {
      return candidates.slice(0, 10);
    }

    const profileBySport = new Map(
      sportProfiles.map((p) => [p.sportType as string, p]),
    );

    const scored = candidates.map((match) => {
      const profile = profileBySport.get(match.sportType as string) ?? null;
      const score = this.matchingEngine.calculateMatchScore(user, match, profile);
      const reasons = this.matchingEngine.calculateReasons(user, match, score);
      return { ...match, score, reasons };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  async findOne(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      select: matchDetailSelect,
    });

    if (!match) {
      throw new NotFoundException('매치를 찾을 수 없습니다.');
    }

    return match;
  }

  async create(hostId: string, dto: CreateMatchDto) {
    const match = await this.prisma.match.create({
      select: matchMutationSelect,
      data: {
        hostId,
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        sportType: dto.sportType as SportType,
        venueId: dto.venueId,
        matchDate: new Date(dto.matchDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        maxPlayers: dto.maxPlayers,
        fee: dto.fee ?? 0,
        levelMin: dto.levelMin ?? 1,
        levelMax: dto.levelMax ?? 5,
        gender: dto.gender ?? 'any',
        teamConfig: dto.teamConfig !== undefined ? (dto.teamConfig as Prisma.InputJsonValue) : undefined,
        currentPlayers: 1,
      },
    });

    // 호스트를 참가자로 자동 추가
    await this.prisma.matchParticipant.create({
      data: {
        matchId: match.id,
        userId: hostId,
        status: 'confirmed',
        paymentStatus: 'completed', // 호스트는 결제 불필요
      },
    });

    await this.notificationsService.create({
      userId: hostId,
      type: NotificationType.match_created,
      title: '매치 등록 완료',
      body: `"${match.title}" 매치를 등록했어요.`,
      data: {
        matchId: match.id,
        sportType: match.sportType,
      },
    });

    return match;
  }

  private resolveRecruitingStatus(
    currentPlayers: number,
    maxPlayers: number,
    currentStatus: MatchStatus,
  ): MatchStatus {
    if (currentStatus === 'recruiting' || currentStatus === 'full') {
      return currentPlayers >= maxPlayers ? 'full' : 'recruiting';
    }
    return currentStatus;
  }

  async update(matchId: string, userId: string, dto: UpdateMatchDto) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        hostId: true,
        title: true,
        status: true,
        currentPlayers: true,
        maxPlayers: true,
      },
    });

    if (!match) throw new NotFoundException('매치를 찾을 수 없습니다.');
    if (match.hostId !== userId) {
      throw new ForbiddenException('호스트만 매치를 수정할 수 있습니다.');
    }

    if (match.status === 'cancelled' || match.status === 'completed') {
      throw new BadRequestException('종료된 매치는 수정할 수 없습니다.');
    }

    if (match.status === 'in_progress') {
      throw new BadRequestException('진행 중인 매치는 수정할 수 없습니다.');
    }

    const nextMaxPlayers = dto.maxPlayers ?? match.maxPlayers;
    if (nextMaxPlayers < match.currentPlayers) {
      throw new BadRequestException(
        '현재 참가 인원보다 최대 인원을 낮출 수 없습니다.',
      );
    }

    const nextStatus = this.resolveRecruitingStatus(
      match.currentPlayers,
      nextMaxPlayers,
      match.status as MatchStatus,
    );

    const updatedMatch = await this.prisma.match.update({
      where: { id: matchId },
      select: matchMutationSelect,
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl ?? null } : {}),
        ...(dto.sportType !== undefined ? { sportType: dto.sportType as SportType } : {}),
        ...(dto.venueId !== undefined ? { venueId: dto.venueId } : {}),
        ...(dto.matchDate !== undefined ? { matchDate: new Date(dto.matchDate) } : {}),
        ...(dto.startTime !== undefined ? { startTime: dto.startTime } : {}),
        ...(dto.endTime !== undefined ? { endTime: dto.endTime } : {}),
        ...(dto.maxPlayers !== undefined ? { maxPlayers: dto.maxPlayers } : {}),
        ...(dto.fee !== undefined ? { fee: dto.fee } : {}),
        ...(dto.levelMin !== undefined ? { levelMin: dto.levelMin } : {}),
        ...(dto.levelMax !== undefined ? { levelMax: dto.levelMax } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.teamConfig !== undefined
          ? { teamConfig: dto.teamConfig as Prisma.InputJsonValue }
          : {}),
        status: nextStatus,
      },
    });

    await this.notifyParticipants(matchId, match.hostId, {
      type: NotificationType.match_updated,
      title: '매치 정보가 수정되었어요',
      body: `"${updatedMatch.title}" 매치 정보가 변경되었습니다.`,
      data: {
        matchId: updatedMatch.id,
      },
    });

    return updatedMatch;
  }

  async cancelMatch(matchId: string, userId: string, dto?: CancelMatchDto) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        hostId: true,
        title: true,
        status: true,
      },
    });

    if (!match) throw new NotFoundException('매치를 찾을 수 없습니다.');
    if (match.hostId !== userId) {
      throw new ForbiddenException('호스트만 매치를 취소할 수 있습니다.');
    }

    // Idempotency guard: already cancelled → return 200 with flag, no re-notify
    if (match.status === 'cancelled') {
      const current = await this.prisma.match.findUnique({
        where: { id: matchId },
        select: matchMutationSelect,
      });
      return { ...current!, alreadyCancelled: true };
    }
    if (match.status === 'completed') {
      throw new BadRequestException('이미 완료된 매치는 취소할 수 없습니다.');
    }

    const cancelled = await this.prisma.match.update({
      where: { id: matchId },
      select: matchMutationSelect,
      data: { status: 'cancelled' },
    });

    await this.notifyParticipants(matchId, userId, {
      type: NotificationType.match_cancelled,
      title: '매치가 취소되었어요',
      body: dto?.reason
        ? `"${match.title}" 매치가 취소되었습니다. 사유: ${dto.reason}`
        : `"${match.title}" 매치가 취소되었습니다.`,
      data: {
        matchId,
        status: 'cancelled',
        ...(dto?.reason ? { reason: dto.reason } : {}),
      },
    });

    return { ...cancelled, alreadyCancelled: false };
  }

  async closeMatch(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        hostId: true,
        title: true,
        status: true,
      },
    });

    if (!match) throw new NotFoundException('매치를 찾을 수 없습니다.');
    if (match.hostId !== userId) {
      throw new ForbiddenException('호스트만 모집을 마감할 수 있습니다.');
    }

    // Idempotency guard: already closed (confirmed or full) → return 200 with flag
    if (match.status === 'confirmed' || match.status === 'full') {
      const current = await this.prisma.match.findUnique({
        where: { id: matchId },
        select: matchMutationSelect,
      });
      return { ...current!, alreadyClosed: true };
    }
    if (match.status !== 'recruiting') {
      throw new BadRequestException('모집 중인 매치만 마감할 수 있습니다.');
    }

    const closed = await this.prisma.match.update({
      where: { id: matchId },
      select: matchMutationSelect,
      data: { status: 'confirmed' },
    });
    return { ...closed, alreadyClosed: false };
  }

  async join(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        hostId: true,
        title: true,
        status: true,
        currentPlayers: true,
        maxPlayers: true,
        fee: true,
      },
    });

    if (!match) throw new NotFoundException('매치를 찾을 수 없습니다.');
    if (match.status !== 'recruiting')
      throw new BadRequestException('모집 중인 매치가 아닙니다.');
    if (match.currentPlayers >= match.maxPlayers)
      throw new BadRequestException('정원이 가득 찼습니다.');

    const existing = await this.prisma.matchParticipant.findUnique({
      where: { matchId_userId: { matchId, userId } },
    });
    if (existing) throw new BadRequestException('이미 참가한 매치입니다.');

    const participant = await this.prisma.matchParticipant.create({
      data: {
        matchId,
        userId,
        status: 'pending',
        paymentStatus: match.fee > 0 ? 'pending' : 'completed',
      },
    });

    // 인원 수 업데이트
    const newCount = match.currentPlayers + 1;
    await this.prisma.match.update({
      where: { id: matchId },
      select: { id: true },
      data: {
        currentPlayers: newCount,
        status: newCount >= match.maxPlayers ? 'full' : 'recruiting',
      },
    });

    await this.notificationsService.create({
      userId: match.hostId,
      type: NotificationType.player_joined,
      title: '새 참가 신청',
      body: `"${match.title}" 매치에 새로운 참가 신청이 도착했어요.`,
      data: {
        matchId: match.id,
        participantId: participant.id,
      },
    });

    return participant;
  }

  async leave(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        hostId: true,
        title: true,
        status: true,
        currentPlayers: true,
        maxPlayers: true,
      },
    });
    if (!match) throw new NotFoundException('매치를 찾을 수 없습니다.');
    if (match.hostId === userId)
      throw new ForbiddenException('호스트는 매치를 떠날 수 없습니다.');
    if (match.status === 'in_progress') {
      throw new BadRequestException('진행 중인 매치에서는 탈퇴할 수 없습니다.');
    }
    if (match.status === 'cancelled' || match.status === 'completed') {
      throw new BadRequestException('종료된 매치에서는 탈퇴할 수 없습니다.');
    }

    const participant = await this.prisma.matchParticipant.findUnique({
      where: {
        matchId_userId: { matchId, userId },
      },
      select: {
        id: true,
      },
    });

    if (!participant) {
      throw new BadRequestException('참가 중인 매치가 아닙니다.');
    }

    await this.prisma.matchParticipant.delete({
      where: { matchId_userId: { matchId, userId } },
    });

    const nextPlayers = Math.max(match.currentPlayers - 1, 0);

    await this.prisma.match.update({
      where: { id: matchId },
      select: { id: true },
      data: {
        currentPlayers: nextPlayers,
        status:
          match.status === 'recruiting'
            ? nextPlayers >= match.maxPlayers
              ? 'full'
              : 'recruiting'
            : match.status,
      },
    });

    await this.notificationsService.create({
      userId: match.hostId,
      type: NotificationType.player_left,
      title: '참가자가 나갔어요',
      body: `"${match.title}" 매치에서 참가 취소가 발생했어요.`,
      data: {
        matchId,
      },
    });

    return { message: '매치에서 탈퇴했습니다.' };
  }

  /**
   * Loads confirmed participants and resolves their ELO ratings for the given sport.
   * Participants without a UserSportProfile for the match's sportType receive eloRating=1000
   * and hasProfile=false (cold-start). PII fields (email, phone, oauthId) are excluded.
   */
  private async buildParticipantsWithElo(
    matchId: string,
    sportType: SportType,
  ): Promise<ParticipantWithElo[]> {
    const participants = await this.prisma.matchParticipant.findMany({
      where: { matchId, status: 'confirmed' },
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            id: true,
            nickname: true,
            profileImageUrl: true,
          },
        },
      },
    });

    if (participants.length === 0) {
      return [];
    }

    const userIds = participants.map((p) => p.userId);
    const sportProfiles = await this.prisma.userSportProfile.findMany({
      where: { userId: { in: userIds }, sportType },
      select: { userId: true, eloRating: true },
    });

    const eloByUser = new Map(sportProfiles.map((p) => [p.userId, p.eloRating]));

    const coldStartCount = userIds.filter((id) => !eloByUser.has(id)).length;
    if (coldStartCount > 0) {
      this.logger.debug(
        `buildParticipantsWithElo: matchId=${matchId} sportType=${sportType} coldStartCount=${coldStartCount}/${participants.length}`,
      );
    }

    return participants.map((p) => {
      const elo = eloByUser.get(p.userId);
      return {
        participantId: p.id,
        userId: p.userId,
        nickname: p.user.nickname,
        profileImageUrl: p.user.profileImageUrl,
        eloRating: elo ?? 1000,
        hasProfile: elo !== undefined,
      };
    });
  }

  /**
   * Validates host ownership and match status for team assignment.
   * Returns match with teamConfig and sportType for downstream use.
   */
  private async assertTeamAssignmentEligible(
    matchId: string,
    userId: string,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        hostId: true,
        sportType: true,
        status: true,
        teamConfig: true,
      },
    });

    if (!match) {
      throw new NotFoundException('MATCH_NOT_FOUND');
    }
    if (match.hostId !== userId) {
      throw new ForbiddenException('MATCH_NOT_HOST');
    }
    if (match.status !== 'recruiting' && match.status !== 'full') {
      throw new ConflictException('MATCH_NOT_OPEN_FOR_TEAM_ASSIGNMENT');
    }

    return match;
  }

  /**
   * Preview team composition without persisting. Returns the same
   * BalancedDistribution shape as generateTeams plus a participantHash.
   * No DB writes are performed.
   */
  async previewTeams(matchId: string, userId: string, dto: ComposeTeamsDto) {
    const match = await this.assertTeamAssignmentEligible(matchId, userId);

    const teamCount = dto.teamCount ?? (match.teamConfig as TeamConfigDto | null)?.teamCount ?? 2;
    const participants = await this.buildParticipantsWithElo(matchId, match.sportType as SportType);

    // TeamBalancingService validates NO_PARTICIPANTS / TEAM_COUNT_INVALID / TEAM_COUNT_EXCEEDS_PARTICIPANTS
    const distribution = this.teamBalancing.balance(participants, teamCount, dto.seed);

    return {
      ...distribution,
      participantHash: computeParticipantHash(participants),
    };
  }

  /**
   * Composes teams with ELO-aware snake-draft and persists the result atomically.
   * Existing Team records for the match are deleted and re-created within a single
   * $transaction to prevent orphaned rows on re-roll.
   *
   * If dto.participantHash is provided and does not match the freshly computed hash,
   * a 409 PARTICIPANTS_CHANGED is thrown so the client can re-preview with the current
   * participant list. If dto.participantHash is absent (legacy client), the check is
   * skipped with a warning log (back-compat per task doc R2).
   *
   * Strategy 'random' and 'balanced' both use the same snake-draft algorithm in v1.
   * The seed provides differentiated distributions for perceived re-roll behavior.
   */
  async generateTeams(matchId: string, userId: string, dto: ComposeTeamsDto = {}) {
    const match = await this.assertTeamAssignmentEligible(matchId, userId);

    const teamCount = dto.teamCount ?? (match.teamConfig as TeamConfigDto | null)?.teamCount ?? 2;
    const participants = await this.buildParticipantsWithElo(matchId, match.sportType as SportType);

    // Stale participant-hash check (C2)
    if (dto.participantHash !== undefined) {
      const currentHash = computeParticipantHash(participants);
      if (dto.participantHash !== currentHash) {
        throw new ConflictException({
          code: 'PARTICIPANTS_CHANGED',
          message: '참가자가 변경되었어요',
        });
      }
    } else {
      this.logger.warn('generateTeams called without participantHash (legacy client)', { matchId });
    }

    // TeamBalancingService validates NO_PARTICIPANTS / TEAM_COUNT_INVALID / TEAM_COUNT_EXCEEDS_PARTICIPANTS
    const distribution: BalancedDistribution = this.teamBalancing.balance(
      participants,
      teamCount,
      dto.seed,
    );

    // Persist atomically: reset → delete prior teams → create new teams → assign participants
    const persistedTeams = await this.prisma.$transaction(async (tx) => {
      // 1. Reset all participant teamIds for this match
      await tx.matchParticipant.updateMany({
        where: { matchId },
        data: { teamId: null },
      });

      // 2. Delete prior Team records for this match
      await tx.team.deleteMany({ where: { matchId } });

      // 3. Create new Team records in order
      const createdTeams = await Promise.all(
        distribution.teams.map((t) =>
          tx.team.create({
            data: { matchId, name: t.name, color: t.color },
          }),
        ),
      );

      // 4. Assign participants to their teams
      await Promise.all(
        distribution.teams.map((assignment, idx) => {
          const participantIds = assignment.members.map((m) => m.participantId);
          if (participantIds.length === 0) return Promise.resolve();
          return tx.matchParticipant.updateMany({
            where: { id: { in: participantIds } },
            data: { teamId: createdTeams[idx].id },
          });
        }),
      );

      return createdTeams;
    });

    // Build response with persisted team IDs merged into the distribution shape
    const teamsWithIds = distribution.teams.map((assignment, idx) => ({
      ...assignment,
      id: persistedTeams[idx].id,
    }));

    return {
      teams: teamsWithIds,
      metrics: distribution.metrics,
      seed: distribution.seed,
    };
  }

  async complete(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        hostId: true,
        title: true,
        status: true,
      },
    });

    if (!match) throw new NotFoundException('매치를 찾을 수 없습니다.');
    if (match.hostId !== userId) {
      throw new ForbiddenException('호스트만 매치를 완료 처리할 수 있습니다.');
    }

    // Idempotency guard: already completed → return 200 with flag, skip notifications + badges
    if (match.status === 'completed') {
      const current = await this.prisma.match.findUnique({
        where: { id: matchId },
        select: matchMutationSelect,
      });
      return { ...current!, alreadyCompleted: true };
    }
    if (match.status === 'cancelled') {
      throw new BadRequestException('취소된 매치는 완료 처리할 수 없습니다.');
    }

    const completed = await this.prisma.match.update({
      where: { id: matchId },
      select: matchMutationSelect,
      data: { status: 'completed' },
    });

    await this.notifyParticipants(matchId, userId, {
      type: NotificationType.match_completed,
      title: '매치가 종료되었어요',
      body: `"${match.title}" 매치가 종료되었습니다.`,
      data: {
        matchId,
        status: 'completed',
      },
    });

    // Immediately follow up with review_pending to encourage review submissions
    await this.notifyParticipants(matchId, userId, {
      type: NotificationType.review_pending,
      title: '상대방을 평가해주세요',
      body: '경기가 끝났어요. 리뷰를 남기면 신뢰 점수가 올라가요.',
      data: {
        matchId,
        action: 'review',
      },
    });

    // Award badges synchronously to make completion side-effects observable and idempotent
    const participants = await this.prisma.matchParticipant.findMany({
      where: { matchId },
      select: { userId: true },
    });
    await Promise.all(
      participants.map((p) =>
        this.badgesService.awardIfEligible(p.userId, 'first_match_completed', {
          name: '첫 매치 완료',
          description: '플랫폼에서 첫 번째 매치를 완료한 플레이어',
        }).catch(() => { /* badge award failure is non-critical */ }),
      ),
    );

    return { ...completed, alreadyCompleted: false };
  }

  async arrive(
    matchId: string,
    userId: string,
    dto: { lat: number; lng: number; photoUrl: string },
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        matchDate: true,
        startTime: true,
        endTime: true,
        status: true,
        venue: {
          select: { lat: true, lng: true },
        },
      },
    });

    if (!match) throw new NotFoundException('매치를 찾을 수 없습니다.');

    // Verify participant
    const participant = await this.prisma.matchParticipant.findUnique({
      where: { matchId_userId: { matchId, userId } },
      select: { id: true, arrivedAt: true },
    });
    if (!participant) throw new ForbiddenException('참가 중인 매치가 아닙니다.');
    if (participant.arrivedAt) throw new BadRequestException('이미 도착 인증을 완료했습니다.');

    // Time window check: 30 minutes before start ~ 30 minutes after end
    const matchDateStr = match.matchDate instanceof Date
      ? match.matchDate.toISOString().split('T')[0]
      : String(match.matchDate).split('T')[0];
    const [sh, sm] = match.startTime.split(':').map(Number);
    const [eh, em] = match.endTime.split(':').map(Number);
    const startMs = new Date(`${matchDateStr}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`).getTime() - 30 * 60 * 1000;
    const endMs = new Date(`${matchDateStr}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`).getTime() + 30 * 60 * 1000;
    const now = Date.now();
    if (now < startMs || now > endMs) {
      throw new BadRequestException('도착 인증은 매치 시작 30분 전부터 종료 30분 후까지만 가능합니다.');
    }

    // Distance check (Haversine) — 200m radius
    if (match.venue?.lat != null && match.venue?.lng != null) {
      const R = 6371000; // Earth radius in metres
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const dLat = toRad(dto.lat - match.venue.lat);
      const dLng = toRad(dto.lng - match.venue.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(match.venue.lat)) * Math.cos(toRad(dto.lat)) * Math.sin(dLng / 2) ** 2;
      const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (distance > 200) {
        throw new BadRequestException('구장에서 너무 멀어요. 200m 이내에서만 인증할 수 있어요.');
      }
    }

    const updated = await this.prisma.matchParticipant.update({
      where: { id: participant.id },
      data: {
        arrivedAt: new Date(),
        arrivalPhotoUrl: dto.photoUrl,
        arrivalLat: dto.lat,
        arrivalLng: dto.lng,
      },
      select: { id: true, arrivedAt: true },
    });

    return { arrivedAt: updated.arrivedAt };
  }

  private async notifyParticipants(
    matchId: string,
    hostId: string,
    notification: {
      type: NotificationType;
      title: string;
      body: string;
      /** Free-form notification payload stored as Prisma JsonValue. Not a REST input DTO. */
      data: NotificationData;
    },
  ) {
    const participants = await this.prisma.matchParticipant.findMany({
      where: {
        matchId,
        userId: { not: hostId },
      },
      select: {
        userId: true,
      },
    });

    await Promise.all(
      participants.map((participant) =>
        this.notificationsService.create({
          userId: participant.userId,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          data: notification.data,
        }),
      ),
    );
  }
}
