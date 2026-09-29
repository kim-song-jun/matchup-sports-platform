import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type V1TeamMemberUnavailability } from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateMemberUnavailabilityDto } from './dto/team-game-roster.dto';
import { unavailabilityCoveringWhere } from './game-roster-loader';
import { enqueueRosterResync } from './roster-resync-events';
import { loadDisplayNames } from './game-roster.service';
import { resolveTeamRosterAccess, type TeamRosterAccess } from './team-roster-access';

type Tx = Prisma.TransactionClient;

export interface MemberUnavailabilityView {
  readonly id: string;
  readonly teamId: string;
  readonly userId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly reason: string | null;
  readonly actor: { userId: string; displayName: string; role: string };
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

function toView(row: V1TeamMemberUnavailability, names: ReadonlyMap<string, string>): MemberUnavailabilityView {
  return {
    id: row.id,
    teamId: row.teamId,
    userId: row.userId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    reason: row.reason,
    actor: { userId: row.actorUserId, displayName: names.get(row.actorUserId) ?? '알 수 없음', role: row.actorRole },
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}

/**
 * Task 178 팀 C — 팀원 결장 기간. 기간 안에 시작하는 대회·리그 경기에서 자동으로 빠진다(친선 제외).
 * 등록·취소는 팀 owner·manager 와 플랫폼 운영자만, 본인 것은 등록하지 않는다(D6).
 */
@Injectable()
export class MemberUnavailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: V1AuthUser, teamId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, teamId, user.id, 'read');
      const rows = await tx.v1TeamMemberUnavailability.findMany({
        where: { teamId, userId },
        orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      });
      const names = await loadDisplayNames(tx, rows.map((row) => row.actorUserId));
      return { teamId, userId, items: rows.map((row) => toView(row, names)) };
    });
  }

  /**
   * 그 시각(없으면 지금)을 덮는 활동 팀원의 결장 기간 — 친선 참석명단의 "결장 중" 표시용.
   * 한 사람이 겹치는 기간을 여러 개 가지면 경기 명단 계산처럼 먼저 시작한 기간이 앞선다.
   */
  listActive(user: V1AuthUser, teamId: string, activeAt?: string) {
    const at = activeAt === undefined ? new Date() : new Date(activeAt);
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, teamId, user.id, 'read');
      const members = await tx.v1TeamMembership.findMany({
        where: { teamId, status: 'active' },
        select: { userId: true },
      });
      const items = await tx.v1TeamMemberUnavailability.findMany({
        where: { ...unavailabilityCoveringWhere(teamId, at), userId: { in: members.map((member) => member.userId) } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: { id: true, userId: true, reason: true, startsAt: true, endsAt: true, actorRole: true },
      });
      return { items };
    });
  }

  create(user: V1AuthUser, teamId: string, userId: string, dto: CreateMemberUnavailabilityDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (!(startsAt.getTime() < endsAt.getTime())) {
      throw new BadRequestException({
        code: 'UNAVAILABILITY_INVALID_PERIOD',
        message: '결장 끝 시각은 시작 시각보다 뒤여야 해요.',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const access = await this.authorize(tx, teamId, user.id, 'write', userId);
      const membership = await tx.v1TeamMembership.findUnique({
        where: { teamId_userId: { teamId, userId } },
        select: { status: true },
      });
      if (membership?.status !== 'active') {
        throw new NotFoundException({ code: 'TEAM_MEMBER_NOT_FOUND', message: '이 팀의 활동 중인 팀원이 아니에요.' });
      }
      const created = await tx.v1TeamMemberUnavailability.create({
        data: {
          teamId,
          userId,
          startsAt,
          endsAt,
          reason: dto.reason ?? null,
          actorUserId: user.id,
          actorRole: access.writeRole!,
        },
      });
      await enqueuePeriodResync(tx, created);
      const names = await loadDisplayNames(tx, [created.actorUserId]);
      return { unavailability: toView(created, names) };
    });
  }

  revoke(user: V1AuthUser, teamId: string, userId: string, unavailabilityId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, teamId, user.id, 'write', userId);
      const row = await tx.v1TeamMemberUnavailability.findFirst({ where: { id: unavailabilityId, teamId, userId } });
      if (row === null) {
        throw new NotFoundException({ code: 'UNAVAILABILITY_NOT_FOUND', message: '결장 기간을 찾을 수 없어요.' });
      }
      if (row.revokedAt !== null) {
        const names = await loadDisplayNames(tx, [row.actorUserId]);
        return { alreadyApplied: true, unavailability: toView(row, names) };
      }
      const updated = await tx.v1TeamMemberUnavailability.update({
        where: { id: row.id },
        data: { revokedAt: new Date(), revokedByUserId: user.id },
      });
      await enqueuePeriodResync(tx, updated);
      const names = await loadDisplayNames(tx, [updated.actorUserId]);
      return { alreadyApplied: false, unavailability: toView(updated, names) };
    });
  }

  private async authorize(
    tx: Tx,
    teamId: string,
    actorUserId: string,
    mode: 'read' | 'write',
    targetUserId?: string,
  ): Promise<TeamRosterAccess> {
    const access = await resolveTeamRosterAccess(tx, teamId, actorUserId);
    if (access === null || (mode === 'write' && access.writeRole === null)) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: mode === 'read' ? '팀원만 볼 수 있어요.' : '팀장·매니저만 결장 기간을 등록할 수 있어요.',
      });
    }
    if (mode === 'write' && targetUserId === actorUserId) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '내 결장 기간은 다른 팀장·매니저가 등록해요.',
      });
    }
    return access;
  }
}

/** 기간 안 경기 명단 재계산은 후속 이벤트로 — 이 트랜잭션은 결장 기간 행을 쥐고 있다. */
function enqueuePeriodResync(tx: Tx, row: { teamId: string; startsAt: Date; endsAt: Date }): Promise<void> {
  return enqueueRosterResync(tx, [
    { scope: 'teamPeriod', teamId: row.teamId, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() },
  ]);
}
