import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { findTournamentOnSurface, LEAGUE_KINDS } from '../tournaments/tournament-surface-lookup';
import { UpdateLeagueSettingsDto } from './dto/league-settings.dto';

const select = {
  id: true, title: true, rulesText: true, regionId: true, scheduledAt: true, scheduledEndAt: true,
  registrationDeadlineAt: true, updatedAt: true, status: true,
  sport: { select: { name: true } },
} satisfies Prisma.V1TournamentSelect;

async function load(db: Prisma.TransactionClient | PrismaService, leagueId: string) {
  const row = await findTournamentOnSurface(db, LEAGUE_KINDS, { where: { id: leagueId, deletedAt: null }, select });
  if (!row) throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
  return row;
}
function view(row: Awaited<ReturnType<typeof load>>) {
  return { leagueId: row.id, title: row.title, rulesText: row.rulesText ?? '', regionId: row.regionId,
    startsOn: row.scheduledAt?.toISOString() ?? null, endsOn: row.scheduledEndAt?.toISOString() ?? null,
    registrationDeadlineAt: row.registrationDeadlineAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(), status: row.status, sportName: row.sport.name };
}
export async function getLeagueSettings(prisma: PrismaService, admins: AdminContextService, user: V1AuthUser, id: string) {
  await admins.getActiveAdmin(user.id);
  return view(await load(prisma, id));
}
export async function updateLeagueSettings(prisma: PrismaService, admins: AdminContextService, user: V1AuthUser, id: string, dto: UpdateLeagueSettingsDto) {
  const admin = await admins.getMutationAdmin(user.id);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM v1_tournaments WHERE id = ${id} AND kind = 'regular_league' AND deleted_at IS NULL FOR UPDATE`;
    const current = await load(tx, id);
    if (current.updatedAt.toISOString() !== new Date(dto.expectedUpdatedAt).toISOString()) {
      throw new ConflictException({ code: 'LEAGUE_SETTINGS_STALE', message: '다른 운영 작업으로 리그 정보가 바뀌었어요. 최신 정보를 다시 불러와 주세요.' });
    }
    if (current.status === 'completed' || current.status === 'cancelled') {
      throw new ConflictException({ code: 'LEAGUE_ENDED', message: '끝났거나 취소된 리그는 기본 정보를 수정할 수 없어요.' });
    }
    const startsOn = new Date(dto.startsOn), endsOn = new Date(dto.endsOn);
    if (endsOn < startsOn) throw new UnprocessableEntityException({ code: 'LEAGUE_PERIOD_INVALID', message: '종료일은 시작일보다 빠를 수 없어요.' });
    if (dto.regionId !== current.regionId && !(await tx.v1Region.findFirst({ where: { id: dto.regionId, isActive: true, level: 2 }, select: { id: true } }))) {
      throw new UnprocessableEntityException({ code: 'LEAGUE_REGION_INVALID', message: '활성화된 시·군·구 지역을 선택해 주세요.' });
    }
    const periodChanged = startsOn.getTime() !== current.scheduledAt?.getTime() || endsOn.getTime() !== current.scheduledEndAt?.getTime();
    if (periodChanged && await tx.v1TeamMatch.count({ where: { leagueId: id, deletedAt: null, status: { not: 'cancelled' }, OR: [
      { startAt: { lt: startsOn } }, { startAt: { gt: endsOn } }, { endAt: { gt: endsOn } },
    ] } })) {
      throw new ConflictException({ code: 'LEAGUE_FIXTURES_OUTSIDE_PERIOD', message: '변경한 기간 밖에 기존 경기가 있어요. 경기 일정을 먼저 확인해 주세요.' });
    }
    const deadline = dto.registrationDeadlineAt === null ? null : new Date(dto.registrationDeadlineAt);
    if (deadline?.getTime() !== current.registrationDeadlineAt?.getTime() && deadline !== null && deadline.getTime() <= Date.now()) {
      throw new UnprocessableEntityException({ code: 'LEAGUE_REGISTRATION_DEADLINE_PAST', message: '새 신청 마감은 현재보다 뒤여야 해요. 신청을 닫으려면 마감을 비워 주세요.' });
    }
    const updated = await tx.v1Tournament.update({ where: { id }, data: {
      title: dto.title.trim(), rulesText: dto.rulesText.trim() || null, regionId: dto.regionId,
      scheduledAt: startsOn, scheduledEndAt: endsOn, registrationDeadlineAt: deadline,
    }, select });
    await admins.logAdminAction(admin, { action: 'league_match.update_settings', targetType: 'league_match', targetId: id,
      beforeJson: view(current), afterJson: view(updated) }, tx);
    return view(updated);
  });
}
