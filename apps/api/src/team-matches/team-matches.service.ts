import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamMembershipService } from '../teams/team-membership.service';
import { CreateTeamMatchDto } from './dto/create-team-match.dto';
import { ApplyTeamMatchDto } from './dto/apply-team-match.dto';
import { CheckInTeamMatchDto } from './dto/check-in-team-match.dto';
import { SubmitResultDto } from './dto/submit-result.dto';
import { EvaluateTeamMatchDto } from './dto/evaluate-team-match.dto';
import { TeamMatchQueryDto } from './dto/team-match-query.dto';

@Injectable()
export class TeamMatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamMembershipService: TeamMembershipService,
  ) {}

  async findAll(filter: TeamMatchQueryDto) {
    const limit = filter.limit ?? 20;
    const where: Record<string, unknown> = { status: filter.status || 'recruiting' };
    if (filter.sportType) where.sportType = filter.sportType;
    if (filter.city) where.hostTeam = { city: filter.city };

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

  async create(userId: string, data: CreateTeamMatchDto) {
    const team = await this.prisma.sportTeam.findUnique({ where: { id: data.hostTeamId } });
    if (!team) throw new NotFoundException('팀을 찾을 수 없습니다');

    // Require manager+ to create a team match
    await this.teamMembershipService.assertRole(data.hostTeamId, userId, 'manager');

    const quarterCount = data.quarterCount ?? 4;
    const hasExternalReferee = Boolean(data.hasReferee);
    const refereeSchedule: Record<string, string> = {};
    for (let i = 1; i <= quarterCount; i++) {
      refereeSchedule[`Q${i}`] = i % 2 === 1 ? 'home' : 'away';
    }

    return this.prisma.teamMatch.create({
      data: {
        hostTeamId: data.hostTeamId,
        sportType: data.sportType,
        title: data.title,
        description: data.description,
        matchDate: new Date(data.matchDate),
        startTime: data.startTime,
        endTime: data.endTime,
        totalMinutes: data.totalMinutes ?? 120,
        quarterCount,
        venueName: data.venueName,
        venueAddress: data.venueAddress,
        venueInfo: (data.venueInfo as never) ?? undefined,
        totalFee: data.totalFee ?? 0,
        opponentFee: data.opponentFee ?? 0,
        paymentDeadline: data.paymentDeadline,
        cancellationPolicy: data.cancellationPolicy,
        requiredLevel: data.requiredLevel,
        hasProPlayers: data.hasProPlayers ?? false,
        allowMercenary: data.allowMercenary !== false,
        matchStyle: (data.matchStyle as never) ?? 'friendly',
        hasReferee: hasExternalReferee,
        notes: data.notes,
        refereeSchedule: hasExternalReferee ? undefined : refereeSchedule,
      },
    });
  }

  async apply(matchId: string, userId: string, data: ApplyTeamMatchDto) {
    const match = await this.prisma.teamMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');
    if (match.status !== 'recruiting') throw new BadRequestException('모집 중이 아닙니다');

    const applicantTeamId = data.applicantTeamId;
    if (!applicantTeamId) throw new BadRequestException('팀 ID가 필요합니다');

    const team = await this.prisma.sportTeam.findUnique({ where: { id: applicantTeamId } });
    if (!team) throw new NotFoundException('팀을 찾을 수 없습니다');

    // Require manager+ to apply on behalf of a team
    await this.teamMembershipService.assertRole(applicantTeamId, userId, 'manager');

    return this.prisma.teamMatchApplication.create({
      data: {
        teamMatchId: matchId,
        applicantTeamId,
        confirmedInfo: data.confirmedInfo ?? false,
        confirmedLevel: data.confirmedLevel ?? false,
        proPlayerCheck: data.proPlayerCheck,
        mercenaryCheck: data.mercenaryCheck,
        message: data.message,
        participationType: 'team',
      },
    });
  }

  async approveApplication(matchId: string, appId: string, userId: string) {
    const match = await this.prisma.teamMatch.findUnique({
      where: { id: matchId },
      select: { status: true, hostTeamId: true },
    });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');
    if (match.status !== 'recruiting') throw new BadRequestException('이미 매칭이 완료된 경기입니다');

    // Require manager+ on host team
    await this.teamMembershipService.assertRole(match.hostTeamId, userId, 'manager');

    return this.prisma.$transaction(async (tx) => {
      const app = await tx.teamMatchApplication.update({
        where: { id: appId },
        data: { status: 'approved' },
      });

      await tx.teamMatch.update({
        where: { id: matchId },
        data: { status: 'scheduled', guestTeamId: app.applicantTeamId },
      });

      await tx.teamMatchApplication.updateMany({
        where: { teamMatchId: matchId, id: { not: appId }, status: 'pending' },
        data: { status: 'rejected' },
      });

      return app;
    });
  }

  async rejectApplication(matchId: string, appId: string, userId: string) {
    const match = await this.prisma.teamMatch.findUnique({
      where: { id: matchId },
      select: { hostTeamId: true },
    });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');

    // Require manager+ on host team
    await this.teamMembershipService.assertRole(match.hostTeamId, userId, 'manager');

    return this.prisma.teamMatchApplication.update({
      where: { id: appId },
      data: { status: 'rejected' },
    });
  }

  async getApplications(matchId: string, userId: string) {
    const match = await this.prisma.teamMatch.findUnique({
      where: { id: matchId },
      select: { hostTeamId: true },
    });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');

    // Require manager+ on host team
    await this.teamMembershipService.assertRole(match.hostTeamId, userId, 'manager');

    return this.prisma.teamMatchApplication.findMany({
      where: { teamMatchId: matchId },
      include: {
        applicantTeam: {
          select: { id: true, name: true, level: true, city: true, district: true, memberCount: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getMyApplications(userId: string) {
    const memberships = await this.teamMembershipService.listUserTeams(userId);
    const teamIds = memberships.map((m) => m.teamId);

    if (teamIds.length === 0) return [];

    return this.prisma.teamMatchApplication.findMany({
      where: { applicantTeamId: { in: teamIds } },
      include: {
        teamMatch: {
          select: {
            id: true,
            title: true,
            sportType: true,
            matchDate: true,
            startTime: true,
            endTime: true,
            venueName: true,
            status: true,
            hostTeam: {
              select: { id: true, name: true, level: true, city: true },
            },
          },
        },
        applicantTeam: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async checkIn(matchId: string, userId: string, data: CheckInTeamMatchDto) {
    const team = await this.prisma.sportTeam.findUnique({ where: { id: data.teamId }, select: { id: true } });
    if (!team) throw new NotFoundException('팀을 찾을 수 없습니다');

    // Require member+ to check in (any team member can check in)
    await this.teamMembershipService.assertRole(data.teamId, userId, 'member');

    return this.prisma.arrivalCheck.upsert({
      where: { teamMatchId_teamId: { teamMatchId: matchId, teamId: data.teamId } },
      create: {
        teamMatchId: matchId,
        teamId: data.teamId,
        isHome: false,
        arrivedAt: new Date(),
        lat: data.lat,
        lng: data.lng,
        photoUrl: data.photoUrl,
      },
      update: {
        arrivedAt: new Date(),
        lat: data.lat,
        lng: data.lng,
        photoUrl: data.photoUrl,
      },
    });
  }

  async submitResult(matchId: string, userId: string, data: SubmitResultDto) {
    const match = await this.prisma.teamMatch.findUnique({
      where: { id: matchId },
      select: { status: true, hostTeamId: true, guestTeamId: true },
    });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');
    if (['recruiting', 'completed', 'cancelled'].includes(match.status)) {
      throw new BadRequestException('결과를 입력할 수 없는 경기 상태입니다');
    }

    // User must be manager+ in either participating team
    let authorized = false;
    try {
      await this.teamMembershipService.assertRole(match.hostTeamId, userId, 'manager');
      authorized = true;
    } catch {
      // Not host manager, check guest team
    }

    if (!authorized && match.guestTeamId) {
      await this.teamMembershipService.assertRole(match.guestTeamId, userId, 'manager');
      authorized = true;
    }

    if (!authorized) {
      throw new BadRequestException('참여 팀의 매니저 이상만 결과를 입력할 수 있습니다');
    }

    return this.prisma.teamMatch.update({
      where: { id: matchId },
      data: {
        status: 'completed',
        scoreHome: (data.scoreHome as never) ?? undefined,
        scoreAway: (data.scoreAway as never) ?? undefined,
        resultHome: data.resultHome,
        resultAway: data.resultAway,
      },
    });
  }

  async evaluate(matchId: string, userId: string, data: EvaluateTeamMatchDto) {
    const match = await this.prisma.teamMatch.findUnique({
      where: { id: matchId },
      select: { hostTeamId: true, guestTeamId: true },
    });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');

    // User must be member+ in either participating team
    let authorized = false;
    try {
      await this.teamMembershipService.assertRole(match.hostTeamId, userId, 'member');
      authorized = true;
    } catch {
      // Not host member, check guest team
    }

    if (!authorized && match.guestTeamId) {
      await this.teamMembershipService.assertRole(match.guestTeamId, userId, 'member');
      authorized = true;
    }

    if (!authorized) {
      throw new BadRequestException('참여 팀의 멤버만 평가할 수 있습니다');
    }

    const existing = await this.prisma.matchEvaluation.findUnique({
      where: { teamMatchId_evaluatorTeamId: { teamMatchId: matchId, evaluatorTeamId: data.evaluatorTeamId } },
    });
    if (existing) throw new BadRequestException('이미 평가를 완료했습니다');

    const evaluation = await this.prisma.matchEvaluation.create({
      data: {
        teamMatchId: matchId,
        evaluatorTeamId: data.evaluatorTeamId,
        evaluatedTeamId: data.evaluatedTeamId,
        levelAccuracy: data.levelAccuracy,
        infoAccuracy: data.infoAccuracy,
        mannerRating: data.mannerRating,
        punctuality: data.punctuality,
        paymentClarity: data.paymentClarity,
        cooperation: data.cooperation,
        comment: data.comment,
      },
    });

    await this.updateTrustScore(data.evaluatedTeamId).catch(() => {/* trust score update optional */});

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
      evals.reduce((sum: number, e: Record<string, unknown>) => sum + (e[field as string] as number), 0) / evals.length;

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
