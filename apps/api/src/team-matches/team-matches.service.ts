import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamMatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: { sportType?: string; city?: string; status?: string; cursor?: string }) {
    const limit = 20;
    const where: Record<string, unknown> = { status: filter.status || 'recruiting' };
    if (filter.sportType) where.sportType = filter.sportType;

    const items = await this.prisma.teamMatch.findMany({
      where,
      include: {
        hostTeam: {
          select: { id: true, name: true, sportType: true, city: true, district: true, level: true, memberCount: true },
        },
        _count: { select: { applications: true } },
      },
      orderBy: { matchDate: 'asc' },
      take: limit + 1,
      ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });

    const hasNext = items.length > limit;
    const result = hasNext ? items.slice(0, limit) : items;
    return { items: result, nextCursor: hasNext ? result[result.length - 1].id : null };
  }

  async findOne(id: string) {
    const match = await this.prisma.teamMatch.findUnique({
      where: { id },
      include: {
        hostTeam: {
          select: { id: true, name: true, sportType: true, city: true, district: true, level: true, memberCount: true, description: true, contactInfo: true },
        },
        applications: {
          include: {
            applicantTeam: {
              select: { id: true, name: true, level: true, city: true, memberCount: true },
            },
          },
        },
        arrivalChecks: true,
        evaluations: true,
      },
    });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');
    return match;
  }

  async create(data: Record<string, unknown>) {
    // 심판 자동 배정
    const quarterCount = (data.quarterCount as number) || 4;
    const refereeSchedule: Record<string, string> = {};
    for (let i = 1; i <= quarterCount; i++) {
      refereeSchedule[`Q${i}`] = i % 2 === 1 ? 'home' : 'away';
    }

    return this.prisma.teamMatch.create({
      data: {
        hostTeamId: data.hostTeamId as string,
        sportType: data.sportType as never,
        title: data.title as string,
        description: data.description as string | undefined,
        matchDate: new Date(data.matchDate as string),
        startTime: data.startTime as string,
        endTime: data.endTime as string,
        totalMinutes: (data.totalMinutes as number) || 120,
        quarterCount,
        venueName: data.venueName as string,
        venueAddress: data.venueAddress as string,
        venueInfo: data.venueInfo as never || undefined,
        totalFee: (data.totalFee as number) || 0,
        opponentFee: (data.opponentFee as number) || 0,
        paymentDeadline: data.paymentDeadline as string | undefined,
        cancellationPolicy: data.cancellationPolicy as string | undefined,
        requiredLevel: data.requiredLevel as number | undefined,
        hasProPlayers: (data.hasProPlayers as boolean) || false,
        allowMercenary: data.allowMercenary !== false,
        matchStyle: (data.matchStyle as never) || 'friendly',
        hasReferee: (data.hasReferee as boolean) || false,
        notes: data.notes as string | undefined,
        refereeSchedule: data.hasReferee ? undefined : refereeSchedule,
      },
    });
  }

  async apply(matchId: string, data: Record<string, unknown>) {
    const match = await this.prisma.teamMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');
    if (match.status !== 'recruiting') throw new BadRequestException('모집 중이 아닙니다');

    return this.prisma.teamMatchApplication.create({
      data: {
        teamMatchId: matchId,
        applicantTeamId: data.applicantTeamId as string,
        confirmedInfo: (data.confirmedInfo as boolean) || false,
        confirmedLevel: (data.confirmedLevel as boolean) || false,
        proPlayerCheck: data.proPlayerCheck as boolean | undefined,
        mercenaryCheck: data.mercenaryCheck as boolean | undefined,
        message: data.message as string | undefined,
        participationType: (data.participationType as never) || 'team',
      },
    });
  }

  async approveApplication(matchId: string, appId: string) {
    const app = await this.prisma.teamMatchApplication.update({
      where: { id: appId },
      data: { status: 'approved' },
    });

    await this.prisma.teamMatch.update({
      where: { id: matchId },
      data: { status: 'scheduled', guestTeamId: app.applicantTeamId },
    });

    // 다른 신청 자동 거절
    await this.prisma.teamMatchApplication.updateMany({
      where: { teamMatchId: matchId, id: { not: appId }, status: 'pending' },
      data: { status: 'rejected' },
    });

    return app;
  }

  async rejectApplication(_matchId: string, appId: string) {
    return this.prisma.teamMatchApplication.update({
      where: { id: appId },
      data: { status: 'rejected' },
    });
  }

  async checkIn(matchId: string, data: Record<string, unknown>) {
    return this.prisma.arrivalCheck.upsert({
      where: { teamMatchId_teamId: { teamMatchId: matchId, teamId: data.teamId as string } },
      create: {
        teamMatchId: matchId,
        teamId: data.teamId as string,
        isHome: (data.isHome as boolean) || false,
        arrivedAt: new Date(),
        lat: data.lat as number | undefined,
        lng: data.lng as number | undefined,
        photoUrl: data.photoUrl as string | undefined,
        opponentStatus: data.opponentStatus as string | undefined,
      },
      update: {
        arrivedAt: new Date(),
        lat: data.lat as number | undefined,
        lng: data.lng as number | undefined,
        photoUrl: data.photoUrl as string | undefined,
        opponentStatus: data.opponentStatus as string | undefined,
      },
    });
  }

  async submitResult(matchId: string, data: Record<string, unknown>) {
    return this.prisma.teamMatch.update({
      where: { id: matchId },
      data: {
        status: 'completed',
        scoreHome: data.scoreHome as never || undefined,
        scoreAway: data.scoreAway as never || undefined,
        resultHome: data.resultHome as string | undefined,
        resultAway: data.resultAway as string | undefined,
      },
    });
  }

  async evaluate(matchId: string, data: Record<string, unknown>) {
    const evaluation = await this.prisma.matchEvaluation.create({
      data: {
        teamMatchId: matchId,
        evaluatorTeamId: data.evaluatorTeamId as string,
        evaluatedTeamId: data.evaluatedTeamId as string,
        levelAccuracy: data.levelAccuracy as number,
        infoAccuracy: data.infoAccuracy as number,
        mannerRating: data.mannerRating as number,
        punctuality: data.punctuality as number,
        paymentClarity: data.paymentClarity as number,
        cooperation: data.cooperation as number,
        comment: data.comment as string | undefined,
      },
    });

    // 신뢰 점수 업데이트 (누적)
    await this.updateTrustScore(data.evaluatedTeamId as string);

    return evaluation;
  }

  async getRefereeSchedule(matchId: string) {
    const match = await this.prisma.teamMatch.findUnique({
      where: { id: matchId },
      select: { quarterCount: true, refereeSchedule: true, hasReferee: true },
    });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');
    return {
      hasReferee: match.hasReferee,
      quarterCount: match.quarterCount,
      schedule: match.refereeSchedule,
    };
  }

  private async updateTrustScore(teamId: string) {
    const evals = await this.prisma.matchEvaluation.findMany({
      where: { evaluatedTeamId: teamId },
    });

    if (evals.length === 0) return;

    const avg = (field: keyof typeof evals[0]) =>
      evals.reduce((sum, e) => sum + (e[field] as number), 0) / evals.length;

    await this.prisma.teamTrustScore.upsert({
      where: { teamId },
      create: {
        teamId,
        peerLevel: avg('levelAccuracy'),
        infoAccuracy: avg('infoAccuracy') * 20,
        mannerScore: avg('mannerRating'),
        totalMatches: evals.length,
      },
      update: {
        peerLevel: avg('levelAccuracy'),
        infoAccuracy: avg('infoAccuracy') * 20,
        mannerScore: avg('mannerRating'),
        totalMatches: evals.length,
      },
    });
  }
}
