import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { TeamCompetitionEntriesDto, TeamCompetitionEntryDto } from './dto/team-competition-entries.dto';
import { rosterBlockReason } from './roster-cleanup';

const ENDED_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled']);

/**
 * 팀 상세 "참가 중인 대회·리그"(Task 180 R-1 B) — 이 팀의 신청을 대회·리그 구분 없이 모은다.
 * 신청 상태·신청 id 는 팀 내부 정보라 활성 팀원에게만 준다(팀이 없으면 404, 팀원이 아니면 403).
 */
@Injectable()
export class TeamCompetitionEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: V1AuthUser, teamId: string, now: Date = new Date()): Promise<TeamCompetitionEntriesDto> {
    const team = await this.prisma.v1Team.findFirst({ where: { id: teamId, deletedAt: null }, select: { id: true } });
    if (team === null) {
      throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: '팀을 찾을 수 없어요.' });
    }
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: { teamId, userId: user.id, status: 'active' },
      select: { role: true },
    });
    if (membership === null) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '팀원만 이 팀의 대회·리그 참가 내역을 볼 수 있어요.',
      });
    }

    const rows = await this.prisma.v1TournamentRegistration.findMany({
      where: { teamId, tournament: { deletedAt: null } },
      select: {
        id: true,
        status: true,
        rosterLockedAt: true,
        rosterDeadlineOverrideAt: true,
        tournament: {
          select: {
            id: true,
            title: true,
            kind: true,
            status: true,
            scheduledAt: true,
            scheduledEndAt: true,
            rosterDeadlineAt: true,
          },
        },
      },
    });
    // 취소된 신청은 참가가 아니다 — 다시 신청할 수 있는 상태라 목록에서 뺀다.
    const registrations = rows.filter((row) => row.status !== 'cancelled');
    const counts = registrations.length
      ? await this.prisma.v1TournamentPlayer.groupBy({
          by: ['registrationId'],
          where: { registrationId: { in: registrations.map((row) => row.id) }, removedAt: null },
          _count: { registrationId: true },
        })
      : [];
    const playerCountById = new Map(counts.map((row) => [row.registrationId, row._count.registrationId]));

    const items = registrations.map((row): TeamCompetitionEntryDto => {
      const blockedBy = rosterBlockReason(row, row.tournament, {}, now);
      return {
        competitionId: row.tournament.id,
        competitionKind: row.tournament.kind,
        title: row.tournament.title,
        status: row.tournament.status,
        scheduledAt: row.tournament.scheduledAt,
        scheduledEndAt: row.tournament.scheduledEndAt,
        registrationId: row.id,
        registrationStatus: row.status,
        playerCount: playerCountById.get(row.id) ?? 0,
        rosterDeadlineAt: row.tournament.rosterDeadlineAt,
        rosterEditable: blockedBy === null,
        rosterBlockedBy: blockedBy,
      };
    });

    return {
      teamId,
      viewerCanManageRoster: membership.role === 'owner' || membership.role === 'manager',
      items: items.sort(compareEntries),
    };
  }
}

/** 진행 중·예정은 시작이 이른 순, 종료·취소는 그 뒤에 최근에 끝난 순. 날짜가 없으면 각 묶음의 끝. */
export function compareEntries(a: TeamCompetitionEntryDto, b: TeamCompetitionEntryDto): number {
  const aEnded = ENDED_STATUSES.has(a.status);
  const bEnded = ENDED_STATUSES.has(b.status);
  if (aEnded !== bEnded) return aEnded ? 1 : -1;
  const aTime = (aEnded ? a.scheduledEndAt : a.scheduledAt)?.getTime() ?? null;
  const bTime = (bEnded ? b.scheduledEndAt : b.scheduledAt)?.getTime() ?? null;
  if (aTime !== bTime) {
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return aEnded ? bTime - aTime : aTime - bTime;
  }
  return a.title.localeCompare(b.title, 'ko');
}
