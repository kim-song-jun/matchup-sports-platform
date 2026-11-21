import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../terms/managed-terms-runtime.service';
import { listActivityMissingItems } from '../auth/social-signup-access';
import { withdrawalGraceEndsAt } from '../users/withdrawal-grace';
import { signupStage } from './admin-user-filters';
import { isPhoneVerificationEnforced, isPhoneVerificationExemptActor } from '../verification/phone-verification-access';

type Entity = 'users' | 'teams';
type Section = 'history' | 'inquiries' | 'matches' | 'competitions' | 'appearances' | 'upcoming';
export type AdminOperationItem = {
  id: string; title: string; href: string | null; status: string; at: Date | null;
  description: string | null; actor?: string | null; fromStatus?: string | null; reason?: string | null;
};
const PAGE_SIZE = 10;
const competition = { id: true, title: true, status: true, kind: true, scheduledAt: true } as const;
const fixture = { id: true, title: true, status: true, startAt: true, hostTeamId: true, tournamentId: true, leagueId: true } as const;

function competitionHref(row: { id: string; kind: string | null }) {
  return `/admin/${row.kind === 'regular_league' ? 'league-matches' : 'tournaments'}/${encodeURIComponent(row.id)}`;
}
function fixtureHref(row: { id: string; tournamentId: string | null; leagueId: string | null }) {
  if (row.tournamentId) return `/admin/tournaments/${encodeURIComponent(row.tournamentId)}`;
  if (row.leagueId) return `/admin/league-matches/${encodeURIComponent(row.leagueId)}`;
  return `/admin/team-matches/${encodeURIComponent(row.id)}`;
}

@Injectable()
export class AdminEntityOperationsService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminContextService) {}

  private async authorize(actorId: string, entity: Entity, id: string) {
    await this.admins.getActiveAdmin(actorId);
    const row = entity === 'users'
      ? await this.prisma.v1User.findUnique({ where: { id }, select: { id: true } })
      : await this.prisma.v1Team.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: '대상을 찾을 수 없어요.' });
  }

  async context(actorId: string, entity: Entity, id: string) {
    await this.authorize(actorId, entity, id);
    if (entity === 'teams') {
      const [team, pendingJoinCount, latestCompletedMatch] = await Promise.all([
        this.prisma.v1Team.findUniqueOrThrow({ where: { id }, select: {
          ownerUser: { select: { id: true, accountStatus: true, lastLoginAt: true } },
        } }),
        this.prisma.v1TeamJoinApplication.count({ where: { teamId: id, status: 'requested' } }),
        // A future fixture or a cancelled match must never make a team look recently active.
        this.prisma.v1TeamMatch.findFirst({ where: { deletedAt: null, status: 'completed',
          OR: [{ hostTeamId: id }, { approvedApplicantTeamId: id }], startAt: { lte: new Date() } },
          orderBy: [{ startAt: 'desc' }, { id: 'desc' }], select: { startAt: true } }),
      ]);
      return { kind: 'team' as const, ownerAccountStatus: team.ownerUser.accountStatus,
        ownerLastLoginAt: team.ownerUser.lastLoginAt, pendingJoinCount,
        lastPlayedAt: latestCompletedMatch?.startAt ?? null };
    }
    const [user, compliance, request] = await Promise.all([
      this.prisma.v1User.findUniqueOrThrow({ where: { id }, select: {
        onboardingStatus: true, accountStatus: true, deletedAt: true, phoneVerifiedAt: true,
        adminUser: { select: { status: true } },
        profile: { select: { nickname: true } }, termsConsents: { take: 1, select: { id: true } },
        authIdentities: { where: { status: 'active' }, select: { provider: true } },
        _count: { select: { sportPreferences: true } },
      } }),
      new ManagedTermsRuntimeService(this.prisma).signupCompliance(id),
      this.prisma.v1StatusChangeLog.findFirst({ where: { targetType: 'user', targetId: id, toStatus: 'withdrawal_pending' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { createdAt: true } }),
    ]);
    const stage = signupStage(user);
    const missing = new Set<string>();
    if (stage === 'terms_required' || !compliance.compliant) missing.add('terms');
    if (stage === 'profile_required' || stage === 'profile_deferred') missing.add('basicProfile');
    const providers = user.authIdentities.map((identity) => identity.provider);
    for (const item of listActivityMissingItems({ onboardingStatus: user.onboardingStatus,
      phoneVerified: Boolean(user.phoneVerifiedAt), hasInterestSport: user._count.sportPreferences > 0,
      hasSocialIdentity: providers.some((p) => p === 'kakao' || p === 'apple') && !providers.includes('email') })) missing.add(item);
    if (!user.phoneVerifiedAt && isPhoneVerificationEnforced() && !isPhoneVerificationExemptActor(user)) missing.add('phone');
    return { kind: 'user' as const, signupStage: stage, missingItems: [...missing],
      pendingRequiredDocumentIds: compliance.pendingRequiredDocumentIds,
      deletionFinalized: user.deletedAt !== null,
      withdrawalScheduledAt: user.accountStatus === 'withdrawal_pending' && request ? withdrawalGraceEndsAt(request.createdAt) : null };
  }

  async list(actorId: string, entity: Entity, id: string, section: Section, page: number) {
    await this.authorize(actorId, entity, id);
    if (entity === 'teams' && section === 'appearances') {
      throw new BadRequestException({ code: 'INVALID_SECTION', message: '출전자 기록은 회원 상세에서 확인해 주세요.' });
    }
    const args = { take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE };
    let items: AdminOperationItem[];
    let total: number;
    if (section === 'history') {
      const where = { targetType: entity === 'users' ? 'user' : 'team', targetId: id };
      const [rows, count] = await Promise.all([
        this.prisma.v1StatusChangeLog.findMany({ where, ...args, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: { adminUser: { select: { userId: true, user: { select: { profile: { select: { nickname: true } } } } } },
            actorUser: { select: { id: true, profile: { select: { nickname: true } } } } } }),
        this.prisma.v1StatusChangeLog.count({ where }),
      ]);
      items = rows.map((row) => ({ id: row.id, title: '상태 변경', href: null, status: row.toStatus,
        fromStatus: row.fromStatus, at: row.createdAt, reason: row.reason, description: null,
        actor: row.adminUser?.user.profile?.nickname ?? row.actorUser?.profile?.nickname ?? row.adminUser?.userId ?? row.actorUserId ?? row.actorType }));
      total = count;
    } else if (section === 'inquiries') {
      const where: Prisma.V1InquiryWhereInput = entity === 'users'
        ? { OR: [{ userId: id }, { relatedType: 'user', relatedId: id }] }
        : { OR: [{ reportedTeamId: id }, { relatedType: 'team', relatedId: id }] };
      const [rows, count] = await Promise.all([
        this.prisma.v1Inquiry.findMany({ where, ...args, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, title: true, userId: true, status: true, category: true, createdAt: true, closedAt: true } }),
        this.prisma.v1Inquiry.count({ where }),
      ]);
      items = rows.map((row) => ({ id: row.id, title: row.title, href: `/admin/inquiries/${encodeURIComponent(row.id)}`,
        status: row.status, at: row.createdAt, description: `${entity === 'users' && row.userId === id ? '본인 작성' : '대상 관련'}${row.closedAt ? ' · 처리 완료' : ''}` }));
      total = count;
    } else if (section === 'appearances') {
      const links = entity === 'users' ? await this.prisma.v1ParticipantIdentityLinkCurrent.findMany({
        where: { userId: id }, select: { participantId: true },
      }) : [];
      const where: Prisma.V1GameResultParticipantWhereInput = {
        ...(entity === 'users' ? { participantId: { in: links.map((link) => link.participantId) } } : {}),
        resultRevision: {
          officialAt: { not: null }, currentGames: { some: {} },
          game: { sourceType: 'TEAM_MATCH', teamMatch: { is: {
            deletedAt: null,
            ...(entity === 'teams' ? { OR: [{ hostTeamId: id }, { approvedApplicantTeamId: id }] } : {}),
          } } },
        },
      };
      const [rows, count] = await Promise.all([
        this.prisma.v1GameResultParticipant.findMany({ where, ...args,
          orderBy: [{ resultRevision: { officialAt: 'desc' } }, { id: 'desc' }],
          select: { id: true, resultRevision: { select: { officialAt: true, game: { select: { teamMatch: { select: fixture } } } } } } }),
        this.prisma.v1GameResultParticipant.count({ where }),
      ]);
      items = rows.flatMap((row) => {
        const match = row.resultRevision.game.teamMatch;
        return match ? [{ id: row.id, title: match.title, href: fixtureHref(match), status: match.status,
          at: match.startAt, description: '현재 공식 결과의 출전자 기록' }] : [];
      });
      total = count;
    } else if (section === 'competitions') {
      const where: Prisma.V1TournamentRegistrationWhereInput = entity === 'teams' ? { teamId: id }
        : { players: { some: { userId: id } } };
      const [rows, count] = await Promise.all([
        this.prisma.v1TournamentRegistration.findMany({ where, ...args, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, status: true, createdAt: true, tournament: { select: competition }, team: { select: { name: true } },
            ...(entity === 'users' ? { players: { where: { userId: id }, select: { removedAt: true } } } : {}) } }),
        this.prisma.v1TournamentRegistration.count({ where }),
      ]);
      items = rows.map((row) => ({ id: row.id, title: row.tournament.title, href: competitionHref(row.tournament),
        status: row.status, at: row.tournament.scheduledAt ?? row.createdAt,
        description: `${row.team.name} · ${row.tournament.kind === 'regular_league' ? '리그' : '대회'} 참가 명단 (실제 출전과 별도)${row.players?.some((player) => player.removedAt) ? ' · 명단에서 제외됨' : ''}` }));
      total = count;
    } else if (entity === 'teams') {
      const where: Prisma.V1TeamMatchWhereInput = { deletedAt: null,
        OR: [{ hostTeamId: id }, { approvedApplicantTeamId: id }],
        ...(section === 'upcoming' ? { startAt: { gte: new Date() }, status: { in: ['recruiting', 'closed', 'matched'] } } : {}) };
      const [rows, count] = await Promise.all([
        this.prisma.v1TeamMatch.findMany({ where, ...args, orderBy: [{ startAt: { sort: section === 'upcoming' ? 'asc' : 'desc', nulls: 'last' } }, { id: 'desc' }], select: fixture }),
        this.prisma.v1TeamMatch.count({ where }),
      ]);
      items = rows.map((row) => ({ id: row.id, title: row.title, href: fixtureHref(row), status: row.status, at: row.startAt,
        description: row.hostTeamId === id ? '주최 / 홈' : '참가 / 원정' }));
      total = count;
    } else {
      const where: Prisma.V1MatchParticipantWhereInput = { userId: id,
        ...(section === 'upcoming' ? { status: 'active', match: { startAt: { gte: new Date() }, status: { in: ['recruiting', 'closed'] } } } : {}) };
      const [rows, count] = await Promise.all([
        this.prisma.v1MatchParticipant.findMany({ where, ...args, orderBy: [{ match: { startAt: section === 'upcoming' ? 'asc' : 'desc' } }, { id: 'desc' }],
          select: { id: true, status: true, role: true, match: { select: { id: true, title: true, startAt: true } } } }),
        this.prisma.v1MatchParticipant.count({ where }),
      ]);
      items = rows.map((row) => ({ id: row.id, title: row.match.title, href: `/admin/matches/${encodeURIComponent(row.match.id)}`,
        status: row.status, at: row.match.startAt, description: row.role === 'host' ? '주최자 참가' : '개인 매치 참가' }));
      total = count;
    }
    return { items, pageInfo: { page, pageSize: PAGE_SIZE, total, hasNext: page * PAGE_SIZE < total } };
  }
}
