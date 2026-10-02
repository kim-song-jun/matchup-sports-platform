import { ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import type { V1TeamInviteLink } from '@prisma/client';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  TEAM_INVITE_LINK_TTL_MS,
  deriveInviteLinkToken,
  displayableInviteLinkToken,
  hashInviteLinkToken,
  isWellFormedInviteLinkToken,
  newInviteLinkSalt,
} from './team-invite-link-token';
import { TeamsService, formatRegionDisplayName } from './teams.service';

export type TeamInviteLinkView = {
  teamId: string;
  /** none: 링크가 없거나(또는 서버 시크릿이 바뀌어) 보여 줄 수 없다 — 새로 만들면 된다. */
  status: 'active' | 'expired' | 'none';
  token: string | null;
  expiresAt: Date | null;
  createdAt: Date | null;
};

/** 재발급으로 밀려난 링크(만료 전에 revokedAt)와 시간이 지난 링크를 가른다 — 안내 문구가 다르다. */
export function inviteLinkStatus(link: Pick<V1TeamInviteLink, 'expiresAt' | 'revokedAt'>, now: Date) {
  if (link.revokedAt !== null && link.revokedAt < link.expiresAt) return 'revoked' as const;
  return link.expiresAt <= now ? ('expired' as const) : ('active' as const);
}

@Injectable()
export class TeamInviteLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teams: TeamsService,
  ) {}

  async current(user: V1AuthUser, teamId: string): Promise<TeamInviteLinkView> {
    await this.teams.assertManagerOrOwner(user, teamId);
    const link = await this.prisma.v1TeamInviteLink.findFirst({ where: { teamId, revokedAt: null } });
    return presentLink(teamId, link, new Date());
  }

  /** 살아 있는 링크가 있으면 그대로 돌려주고, 없거나 만료됐으면 새로 만든다. */
  issue(user: V1AuthUser, teamId: string) {
    return this.writeLink(user, teamId, 'issue');
  }

  /** 지금 링크를 무효로 하고 새 링크를 만든다. */
  reissue(user: V1AuthUser, teamId: string) {
    return this.writeLink(user, teamId, 'reissue');
  }

  async preview(user: V1AuthUser | null, token: string) {
    const link = await this.resolve(token);
    const { team } = link;
    const eligibility = user === null ? null : await this.teams.joinEligibility(user, team.id);
    return {
      team: {
        id: team.id,
        name: team.name,
        sportName: team.sport.name,
        regionName: formatRegionDisplayName(team.region),
        logoUrl: team.profile?.logoUrl ?? null,
      },
      expiresAt: link.expiresAt,
      viewer:
        eligibility === null
          ? null
          : {
              joinState: eligibility.joinState,
              eligible: eligibility.eligible,
              reasonCode: eligibility.reasonCode,
              message: eligibility.message,
            },
    };
  }

  async join(user: V1AuthUser, token: string) {
    const link = await this.resolve(token);
    return this.teams.submitJoinApplication(user, link.teamId, { message: null, via: 'invite_link' });
  }

  private async writeLink(user: V1AuthUser, teamId: string, mode: 'issue' | 'reissue') {
    const team = await this.teams.assertCanInvite(user, teamId);
    if (team.joinPolicy === 'closed') {
      throw new ConflictException({
        code: 'JOIN_CLOSED',
        message: "가입을 닫아 둔 팀은 초대 링크를 만들 수 없어요. 팀 정보에서 '가입 가능'으로 바꿔 주세요.",
      });
    }
    const tokenSalt = newInviteLinkSalt();
    const token = deriveInviteLinkToken(tokenSalt);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // 두 매니저가 동시에 눌러도 살아 있는 링크는 하나다(부분 unique 인덱스가 최종 방어선).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`team-invite-link:${teamId}`}, 0))`;
      const live = await tx.v1TeamInviteLink.findFirst({ where: { teamId, revokedAt: null } });
      if (mode === 'issue' && live !== null) {
        const view = presentLink(teamId, live, now);
        if (view.status === 'active') return { ...view, created: false };
      }
      if (live !== null) {
        await tx.v1TeamInviteLink.update({ where: { id: live.id }, data: { revokedAt: now, revokedByUserId: user.id } });
      }
      const created = await tx.v1TeamInviteLink.create({
        data: {
          teamId,
          createdByUserId: user.id,
          tokenSalt,
          tokenHash: hashInviteLinkToken(token),
          expiresAt: new Date(now.getTime() + TEAM_INVITE_LINK_TTL_MS),
        },
      });
      return { ...presentLink(teamId, created, now), created: true };
    });
  }

  private async resolve(token: string) {
    const notFound = new NotFoundException({
      code: 'TEAM_INVITE_LINK_NOT_FOUND',
      message: '초대 링크를 찾을 수 없어요. 링크 주소를 다시 확인해 주세요.',
    });
    if (!isWellFormedInviteLinkToken(token)) throw notFound;
    const link = await this.prisma.v1TeamInviteLink.findUnique({
      where: { tokenHash: hashInviteLinkToken(token) },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            status: true,
            deletedAt: true,
            sport: { select: { name: true } },
            region: { select: { name: true, parent: { select: { name: true } } } },
            profile: { select: { logoUrl: true } },
          },
        },
      },
    });
    if (link === null) throw notFound;
    // 해체된 팀이 먼저다 — 해체가 링크도 무효로 만들지만 "새 링크가 만들어졌다"는 안내는 틀린 말이다.
    if (link.team.status !== 'active' || link.team.deletedAt !== null) {
      throw new GoneException({ code: 'TEAM_NOT_ACTIVE', message: '지금은 가입할 수 없는 팀이에요.' });
    }
    const status = inviteLinkStatus(link, new Date());
    if (status === 'revoked') {
      throw new GoneException({
        code: 'TEAM_INVITE_LINK_REVOKED',
        message: '새 링크가 만들어져서 이 링크는 더 이상 쓸 수 없어요. 팀장·매니저에게 새 링크를 받아 주세요.',
      });
    }
    if (status === 'expired') {
      throw new GoneException({
        code: 'TEAM_INVITE_LINK_EXPIRED',
        message: '초대 링크가 만료됐어요. 팀장·매니저에게 새 링크를 받아 주세요.',
      });
    }
    return link;
  }
}

function presentLink(teamId: string, link: V1TeamInviteLink | null, now: Date): TeamInviteLinkView {
  const none: TeamInviteLinkView = { teamId, status: 'none', token: null, expiresAt: null, createdAt: null };
  if (link === null) return none;
  if (inviteLinkStatus(link, now) !== 'active') {
    return { teamId, status: 'expired', token: null, expiresAt: link.expiresAt, createdAt: link.createdAt };
  }
  const token = displayableInviteLinkToken(link);
  if (token === null) return none;
  return { teamId, status: 'active', token, expiresAt: link.expiresAt, createdAt: link.createdAt };
}
