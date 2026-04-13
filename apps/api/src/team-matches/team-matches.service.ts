import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    // Build AND conditions separately so that city and teamId OR do not cross-contaminate.
    // Without AND wrapping, Prisma merges { hostTeam: { city } } and { OR: [...] } at the same
    // where level, causing the city constraint to bleed into the applicant-team OR branch.
    const andConditions: Prisma.TeamMatchWhereInput[] = [];
    if (filter.city) andConditions.push({ hostTeam: { city: filter.city } });
    if (filter.teamId) {
      andConditions.push({
        OR: [
          { hostTeamId: filter.teamId },
          { applications: { some: { applicantTeamId: filter.teamId } } },
        ],
      });
    }

    const where: Prisma.TeamMatchWhereInput = {
      status: (filter.status || 'recruiting') as Prisma.EnumTeamMatchStatusFilter,
      ...(filter.sportType && { sportType: filter.sportType as Prisma.EnumSportTypeFilter }),
      ...(andConditions.length > 0 && { AND: andConditions }),
    };

    const items = await this.prisma.teamMatch.findMany({
      where,
      include: {
        hostTeam: {
          select: { id: true, name: true, sportTypes: true, city: true, district: true, level: true, memberCount: true },
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
          select: {
            id: true,
            name: true,
            sportTypes: true,
            city: true,
            district: true,
            level: true,
            memberCount: true,
            description: true,
            contactInfo: true,
            logoUrl: true,
            isRecruiting: true,
          },
        },
        applications: {
          include: {
            applicantTeam: {
              select: {
                id: true,
                name: true,
                sportTypes: true,
                description: true,
                city: true,
                district: true,
                memberCount: true,
                level: true,
                contactInfo: true,
                logoUrl: true,
                isRecruiting: true,
              },
            },
          },
        },
        arrivalChecks: true,
        evaluations: true,
      },
    });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');

    const guestTeam =
      match.applications.find((application) =>
        application.applicantTeamId === match.guestTeamId || application.status === 'approved')?.applicantTeam ?? null;

    return {
      ...match,
      guestTeam,
    };
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
        skillGrade: data.skillGrade ?? null,
        gameFormat: data.gameFormat ?? null,
        matchType: data.matchType ?? null,
        proPlayerCount: data.proPlayerCount ?? 0,
        uniformColor: data.uniformColor ?? null,
        isFreeInvitation: data.isFreeInvitation ?? false,
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
    const match = await this.prisma.teamMatch.findUnique({
      where: { id: matchId },
      select: {
        status: true,
        hostTeamId: true,
        guestTeamId: true,
        applications: {
          where: { status: 'approved' },
          select: { applicantTeamId: true, status: true },
        },
      },
    });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');

    const team = await this.prisma.sportTeam.findUnique({ where: { id: data.teamId }, select: { id: true } });
    if (!team) throw new NotFoundException('팀을 찾을 수 없습니다');
    const guestTeamId = this.resolveGuestTeamId(match);
    if (!guestTeamId) throw new BadRequestException('상대 팀이 확정된 경기만 도착 인증할 수 있습니다');

    const checkInAllowedStatuses = ['scheduled', 'checking_in', 'in_progress'];
    if (!checkInAllowedStatuses.includes(match.status)) {
      throw new BadRequestException('도착 인증을 진행할 수 없는 경기 상태입니다');
    }

    if (data.teamId !== match.hostTeamId && data.teamId !== guestTeamId) {
      throw new BadRequestException('참여 팀만 도착 인증할 수 있습니다');
    }

    // Require member+ to check in (any team member can check in)
    await this.teamMembershipService.assertRole(data.teamId, userId, 'member');

    return this.prisma.$transaction(async (tx) => {
      const existingArrival = await tx.arrivalCheck.findUnique({
        where: { teamMatchId_teamId: { teamMatchId: matchId, teamId: data.teamId } },
        select: { id: true },
      });
      if (existingArrival) {
        throw new BadRequestException('이미 도착 인증을 완료했습니다');
      }

      if (match.status === 'scheduled') {
        await tx.teamMatch.update({
          where: { id: matchId },
          data: { status: 'checking_in' },
        });
      }

      return tx.arrivalCheck.create({
        data: {
          teamMatchId: matchId,
          teamId: data.teamId,
          isHome: data.teamId === match.hostTeamId,
          arrivedAt: new Date(),
          lat: data.lat,
          lng: data.lng,
          photoUrl: data.photoUrl,
        },
      });
    });
  }

  async submitResult(matchId: string, userId: string, data: SubmitResultDto) {
    const match = await this.prisma.teamMatch.findUnique({
      where: { id: matchId },
      select: {
        status: true,
        hostTeamId: true,
        guestTeamId: true,
        quarterCount: true,
        applications: {
          where: { status: 'approved' },
          select: { applicantTeamId: true, status: true },
        },
      },
    });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');
    const guestTeamId = this.resolveGuestTeamId(match);
    if (!guestTeamId) {
      throw new BadRequestException('상대 팀이 확정된 경기만 결과를 입력할 수 있습니다');
    }

    const resultAllowedStatuses = ['scheduled', 'checking_in', 'in_progress'];
    if (!resultAllowedStatuses.includes(match.status)) {
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

    if (!authorized) {
      await this.teamMembershipService.assertRole(guestTeamId, userId, 'manager');
      authorized = true;
    }

    if (!authorized) {
      throw new BadRequestException('참여 팀의 매니저 이상만 결과를 입력할 수 있습니다');
    }

    const scoreHome = this.normalizeQuarterScores(data.scoreHome, match.quarterCount, '홈팀');
    const scoreAway = this.normalizeQuarterScores(data.scoreAway, match.quarterCount, '원정팀');
    this.assertResultPair(data.resultHome, data.resultAway);
    this.assertResultMatchesScores(scoreHome, scoreAway, data.resultHome, data.resultAway);

    return this.prisma.teamMatch.update({
      where: { id: matchId },
      data: {
        status: 'completed',
        scoreHome: scoreHome as never,
        scoreAway: scoreAway as never,
        resultHome: data.resultHome,
        resultAway: data.resultAway,
      },
    });
  }

  async evaluate(matchId: string, userId: string, data: EvaluateTeamMatchDto) {
    const match = await this.prisma.teamMatch.findUnique({
      where: { id: matchId },
      select: {
        status: true,
        hostTeamId: true,
        guestTeamId: true,
        applications: {
          where: { status: 'approved' },
          select: { applicantTeamId: true, status: true },
        },
      },
    });
    if (!match) throw new NotFoundException('경기를 찾을 수 없습니다');
    if (match.status !== 'completed') {
      throw new BadRequestException('경기 종료 후에만 평가할 수 있습니다');
    }
    const guestTeamId = this.resolveGuestTeamId(match);
    if (!guestTeamId) {
      throw new BadRequestException('상대 팀이 확정된 경기만 평가할 수 있습니다');
    }
    if (data.evaluatorTeamId === data.evaluatedTeamId) {
      throw new BadRequestException('자기 팀을 평가할 수 없습니다');
    }

    const participantTeamIds = [match.hostTeamId, guestTeamId];
    if (!participantTeamIds.includes(data.evaluatorTeamId) || !participantTeamIds.includes(data.evaluatedTeamId)) {
      throw new BadRequestException('실제 참여 팀 조합으로만 평가할 수 있습니다');
    }

    // User must be member+ in the evaluator team
    await this.teamMembershipService.assertRole(data.evaluatorTeamId, userId, 'member');

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

  private normalizeQuarterScores(scoreMap: Record<string, unknown>, quarterCount: number, label: '홈팀' | '원정팀'): Record<string, number> {
    if (!scoreMap || typeof scoreMap !== 'object' || Array.isArray(scoreMap)) {
      throw new BadRequestException(`${label} 점수 형식이 올바르지 않습니다`);
    }

    const expectedKeys = Array.from({ length: quarterCount }, (_, i) => `Q${i + 1}`);
    const scoreEntries = Object.entries(scoreMap);
    if (scoreEntries.length !== quarterCount) {
      throw new BadRequestException(`${label} 점수는 쿼터 수와 동일해야 합니다`);
    }

    const normalized: Record<string, number> = {};
    for (const key of expectedKeys) {
      if (!Object.prototype.hasOwnProperty.call(scoreMap, key)) {
        throw new BadRequestException(`${label} 점수는 Q1~Q${quarterCount} 형식이어야 합니다`);
      }

      const raw = scoreMap[key];
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
        throw new BadRequestException(`${label} 점수는 0 이상의 정수여야 합니다`);
      }

      normalized[key] = raw;
    }

    return normalized;
  }

  private assertResultPair(resultHome: SubmitResultDto['resultHome'], resultAway: SubmitResultDto['resultAway']) {
    const validPairs = [
      ['win', 'lose'],
      ['lose', 'win'],
      ['draw', 'draw'],
    ] as const;

    if (!validPairs.some(([home, away]) => home === resultHome && away === resultAway)) {
      throw new BadRequestException('승무패 조합이 올바르지 않습니다');
    }
  }

  private assertResultMatchesScores(
    scoreHome: Record<string, number>,
    scoreAway: Record<string, number>,
    resultHome: SubmitResultDto['resultHome'],
    resultAway: SubmitResultDto['resultAway'],
  ) {
    const homeTotal = Object.values(scoreHome).reduce((sum, score) => sum + score, 0);
    const awayTotal = Object.values(scoreAway).reduce((sum, score) => sum + score, 0);

    if (homeTotal === awayTotal && (resultHome !== 'draw' || resultAway !== 'draw')) {
      throw new BadRequestException('동점 경기의 결과는 무승부여야 합니다');
    }
    if (homeTotal > awayTotal && (resultHome !== 'win' || resultAway !== 'lose')) {
      throw new BadRequestException('점수와 승무패 결과가 일치하지 않습니다');
    }
    if (homeTotal < awayTotal && (resultHome !== 'lose' || resultAway !== 'win')) {
      throw new BadRequestException('점수와 승무패 결과가 일치하지 않습니다');
    }
  }

  private resolveGuestTeamId(match: {
    guestTeamId: string | null;
    applications?: Array<{ applicantTeamId: string; status?: string }>;
  }) {
    return match.guestTeamId
      ?? match.applications?.find((application) => application.status === 'approved')?.applicantTeamId
      ?? null;
  }
}
