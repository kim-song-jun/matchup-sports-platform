import { findPublicTournamentOnSurface, TOURNAMENT_KINDS } from '../tournaments/tournament-surface-lookup';
import { PUBLIC_TOURNAMENT_STATUSES } from '../tournaments/tournaments-read.query';
import { isBracketPublished } from '../tournaments/tournament-detail.presenter';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { GamesService } from '../games/games.service';
import { TeamsService } from '../teams/teams.service';
import type { StartMemberBracketPreviewDto } from './dto/member-bracket-preview.dto';

export const MEMBER_BRACKET_PREVIEW_ACTION = 'user.bracket_preview';
export const MEMBER_BRACKET_PREVIEW_TTL_MS = 10 * 60_000;

@Injectable()
export class MemberBracketPreviewService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminContextService,
    private readonly games: GamesService, private readonly teams: TeamsService) {}

  private async target(userId: string) {
    const target = await this.prisma.v1User.findUnique({ where: { id: userId },
      select: { id: true, profile: { select: { nickname: true, displayName: true } }, accountStatus: true, onboardingStatus: true } });
    if (!target) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: '회원을 찾을 수 없어요.' });
    if (target.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'MEMBER_PREVIEW_UNAVAILABLE', message: '활성 회원만 확인할 수 있어요.' });
    }
    return target;
  }

  private async publicTournament(tournamentId: string) {
    const tournament = await findPublicTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, { where: { id: tournamentId },
      select: { id: true, bracketPublishedAt: true, bracketPublishScheduledAt: true, kind: true, isPublic: true, deletedAt: true, status: true } });
    if (!tournament || !tournament.isPublic || tournament.deletedAt || !(PUBLIC_TOURNAMENT_STATUSES as readonly string[]).includes(tournament.status) || !isBracketPublished(tournament.bracketPublishedAt, tournament.bracketPublishScheduledAt) || tournament.kind === 'regular_league') {
      throw new NotFoundException({ code: 'BRACKET_NOT_FOUND', message: '공개된 대회 대진표를 선택해 주세요.' });
    }
    return tournament;
  }

  async start(adminUserId: string, userId: string, dto: StartMemberBracketPreviewDto) {
    const admin = await this.admins.getMutationAdmin(adminUserId);
    await this.target(userId);
    const reason = dto.reason.trim();
    if (reason.length < 5) throw new BadRequestException({ code: 'PREVIEW_REASON_REQUIRED', message: '확인 사유를 5자 이상 입력해 주세요.' });
    const tournament = await this.publicTournament(dto.tournamentId);
    const log = await this.prisma.v1AdminActionLog.create({ data: {
      adminUserId: admin.id, action: MEMBER_BRACKET_PREVIEW_ACTION, targetType: 'user', targetId: userId,
      reason, afterJson: { tournamentId: tournament.id, readOnly: true },
    }, select: { id: true, createdAt: true } });
    return { previewId: log.id, tournamentId: tournament.id,
      expiresAt: new Date(log.createdAt.getTime() + MEMBER_BRACKET_PREVIEW_TTL_MS).toISOString() };
  }

  async read(adminUserId: string, userId: string, previewId: string) {
    const admin = await this.admins.getMutationAdmin(adminUserId);
    const log = await this.prisma.v1AdminActionLog.findFirst({ where: {
      id: previewId, adminUserId: admin.id, action: MEMBER_BRACKET_PREVIEW_ACTION, targetType: 'user', targetId: userId,
    }, select: { afterJson: true, createdAt: true } });
    if (!log || log.createdAt.getTime() + MEMBER_BRACKET_PREVIEW_TTL_MS <= Date.now()) {
      throw new ForbiddenException({ code: 'MEMBER_PREVIEW_EXPIRED', message: '조회 시간이 끝났어요. 회원 상세에서 다시 열어 주세요.' });
    }
    const payload = log.afterJson;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.tournamentId !== 'string' || payload.readOnly !== true) {
      throw new ForbiddenException({ code: 'MEMBER_PREVIEW_INVALID', message: '유효한 대진표 조회가 아니에요.' });
    }
    await this.publicTournament(payload.tournamentId);
    const target = await this.target(userId);
    // These are the same read services used by /me/teams and /my-fixtures. No member auth is minted.
    const actor = { id: target.id, email: null, accountStatus: target.accountStatus, onboardingStatus: target.onboardingStatus };
    const [teams, myFixtures] = await Promise.all([
      this.teams.myTeams(actor, {}), this.games.listMyTournamentFixtures(actor, payload.tournamentId),
    ]);
    return { tournamentId: payload.tournamentId, member: { id: target.id, name: target.profile?.nickname ?? target.profile?.displayName ?? null },
      expiresAt: new Date(log.createdAt.getTime() + MEMBER_BRACKET_PREVIEW_TTL_MS).toISOString(),
      teamIds: teams.items.map(team => team.teamId), myFixtures };
  }
}
