import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMatchDto, MatchFilterDto } from './dto/match.dto';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: MatchFilterDto) {
    const limit = filter.limit || 20;

    const where: Record<string, unknown> = {
      status: { in: ['recruiting', 'full'] },
    };

    if (filter.sportType) where.sportType = filter.sportType;
    if (filter.city) where.venue = { city: filter.city };
    if (filter.date) where.matchDate = new Date(filter.date);
    if (filter.levelMin || filter.levelMax) {
      where.levelMin = { gte: filter.levelMin || 1 };
      where.levelMax = { lte: filter.levelMax || 5 };
    }

    const matches = await this.prisma.match.findMany({
      where,
      include: {
        venue: { select: { id: true, name: true, city: true, district: true } },
        host: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
      },
      orderBy: { matchDate: 'asc' },
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

  async getRecommended(userId: string) {
    // TODO: AI 매칭 엔진 연동
    // 현재는 최신 recruiting 매치 반환
    return this.prisma.match.findMany({
      where: { status: 'recruiting' },
      include: {
        venue: { select: { id: true, name: true, city: true } },
        host: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async findOne(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
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
      },
    });

    if (!match) {
      throw new NotFoundException('매치를 찾을 수 없습니다.');
    }

    return match;
  }

  async create(hostId: string, dto: CreateMatchDto) {
    const match = await this.prisma.match.create({
      data: {
        hostId,
        title: dto.title,
        description: dto.description,
        sportType: dto.sportType as never,
        venueId: dto.venueId,
        matchDate: new Date(dto.matchDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        maxPlayers: dto.maxPlayers,
        fee: dto.fee ?? 0,
        levelMin: dto.levelMin ?? 1,
        levelMax: dto.levelMax ?? 5,
        gender: dto.gender ?? 'any',
        teamConfig: dto.teamConfig as never ?? undefined,
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

    return match;
  }

  async join(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
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
      data: {
        currentPlayers: newCount,
        status: newCount >= match.maxPlayers ? 'full' : 'recruiting',
      },
    });

    return participant;
  }

  async leave(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) throw new NotFoundException('매치를 찾을 수 없습니다.');
    if (match.hostId === userId)
      throw new ForbiddenException('호스트는 매치를 떠날 수 없습니다.');

    await this.prisma.matchParticipant.delete({
      where: { matchId_userId: { matchId, userId } },
    });

    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        currentPlayers: { decrement: 1 },
        status: 'recruiting',
      },
    });

    return { message: '매치에서 탈퇴했습니다.' };
  }

  async generateTeams(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { participants: { where: { status: 'confirmed' } } },
    });

    if (!match) throw new NotFoundException('매치를 찾을 수 없습니다.');
    if (match.hostId !== userId)
      throw new ForbiddenException('호스트만 팀을 구성할 수 있습니다.');

    // TODO: AI 기반 팀 밸런싱 로직 구현
    // 현재는 단순 랜덤 배분

    const teamCount = (match.teamConfig as { teamCount?: number })?.teamCount || 2;
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];
    const teamNames = ['A팀', 'B팀', 'C팀', 'D팀'];

    const teams = await Promise.all(
      Array.from({ length: teamCount }, (_, i) =>
        this.prisma.team.create({
          data: {
            matchId,
            name: teamNames[i],
            color: colors[i],
          },
        }),
      ),
    );

    // 참가자를 팀에 배분
    const participants = match.participants;
    for (let i = 0; i < participants.length; i++) {
      const teamIndex = i % teamCount;
      await this.prisma.matchParticipant.update({
        where: { id: participants[i].id },
        data: { teamId: teams[teamIndex].id },
      });
    }

    return teams;
  }

  async complete(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) throw new NotFoundException('매치를 찾을 수 없습니다.');
    if (match.hostId !== userId)
      throw new ForbiddenException('호스트만 매치를 완료할 수 있습니다.');

    return this.prisma.match.update({
      where: { id: matchId },
      data: { status: 'completed' },
    });
  }
}
