import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, V1CompetitionKind } from '@prisma/client';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { competitionConfigContentHash, validateCompetitionConfig } from './competition-config';
import { UpdateTournamentPeriodSettingsDto } from './tournament-period-settings.dto';
import { ALL_COMPETITION_KINDS, findTournamentOnSurface } from '../tournament-surface-lookup';

type StoredPeriod = { code: string; label: string; durationMinutes: number; extraTime: boolean };
type PeriodRead = { periods: StoredPeriod[] | null; legacyPeriodCount: number | null };

export function normalizeTournamentPeriods(
  current: readonly StoredPeriod[],
  requested: readonly { durationMinutes: number }[],
): StoredPeriod[] {
  if (requested.length === 0) {
    throw new UnprocessableEntityException({ code: 'TOURNAMENT_PERIODS_REQUIRED', message: '피리어드는 하나 이상 필요해요.' });
  }
  const usedCodes = new Set(current.map((period) => period.code));
  if (usedCodes.size !== current.length) {
    throw new UnprocessableEntityException({
      code: 'COMPETITION_PERIODS_UNAVAILABLE',
      message: '현재 대회의 피리어드 코드가 중복돼 있어요. 먼저 유효한 경기 설정 버전을 연결해 주세요.',
    });
  }
  const shrinkingStandardHalves = requested.length === 1 && current.length >= 2 && current[0]?.code === 'FIRST_HALF' && current[1]?.code === 'SECOND_HALF';
  return requested.map((period, index) => {
    const previous = current[index];
    let code = previous?.code;
    if (!code) {
      let suffix = index + 1;
      code = `PERIOD_${suffix}`;
      while (usedCodes.has(code)) code = `PERIOD_${++suffix}`;
      usedCodes.add(code);
    }
    return {
      code: shrinkingStandardHalves ? 'SINGLE_PERIOD' : code,
      label: shrinkingStandardHalves ? '단일' : (previous?.label ?? `${index + 1}피리어드`),
      durationMinutes: period.durationMinutes,
      extraTime: previous?.extraTime ?? false,
    };
  });
}

function periodsEqual(left: readonly StoredPeriod[], right: readonly StoredPeriod[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

@Injectable()
export class TournamentPeriodSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async get(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    const row = await findTournamentOnSurface(this.prisma, ALL_COMPETITION_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      include: { competitionConfig: true },
    });
    if (!row) throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    this.assertSupportedKind(row.kind);
    if (!row.competitionConfig) {
      throw new UnprocessableEntityException({
        code: 'COMPETITION_PERIODS_UNAVAILABLE',
        message: '현재 대회에 연결된 경기 설정 버전이 없어요. 먼저 유효한 경기 설정 버전을 연결해 주세요.',
      });
    }
    return this.serialize(row);
  }

  async update(user: V1AuthUser, tournamentId: string, dto: UpdateTournamentPeriodSettingsDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
      const row = await findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
        where: { id: tournamentId, deletedAt: null },
        include: { competitionConfig: true },
      });
      if (!row) throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
      this.assertSupportedKind(row.kind);
      if (row.updatedAt.toISOString() !== dto.expectedVersion) {
        throw new ConflictException({ code: 'TOURNAMENT_VERSION_CONFLICT', message: '대회 설정이 다른 요청에서 변경됐어요. 다시 확인해 주세요.' });
      }
      if (!row.competitionConfig) {
        throw new UnprocessableEntityException({
          code: 'COMPETITION_PERIODS_UNAVAILABLE',
          message: '현재 대회에 연결된 경기 설정 버전이 없어요. 먼저 유효한 경기 설정 버전을 연결해 주세요.',
        });
      }

      const currentRead = this.readPeriods(row.competitionConfig.periods);
      const currentPeriods = currentRead.periods ?? [];
      const nextPeriods = normalizeTournamentPeriods(currentPeriods, dto.periods);
      if (currentRead.periods && periodsEqual(currentPeriods, nextPeriods)) {
        return { changed: false, ...this.serialize(row) };
      }

      const config = validateCompetitionConfig({
        periods: nextPeriods,
        events: row.competitionConfig.events,
        lineup: row.competitionConfig.lineup,
        result: row.competitionConfig.result,
        tieBreak: row.competitionConfig.tieBreak,
        visibility: row.competitionConfig.visibility,
      });
      const contentHash = competitionConfigContentHash(config);
      const existingVersion = await tx.v1CompetitionConfigVersion.findUnique({ where: { contentHash } });
      if (
        existingVersion &&
        (existingVersion.sportCode !== row.competitionConfig.sportCode ||
          existingVersion.name !== row.competitionConfig.name)
      ) {
        throw new ConflictException({
          code: 'COMPETITION_CONFIG_CONTENT_HASH_COLLISION',
          message: '동일한 설정 내용이 다른 종목 계열에 있어 재사용할 수 없어요.',
        });
      }
      const version = existingVersion ?? await this.createVersion(tx, row.competitionConfig, config, user.id, admin.id, row.id);
      const updated = await tx.v1Tournament.updateMany({
        where: { id: row.id, updatedAt: row.updatedAt },
        data: { competitionConfigVersionId: version.id },
      });
      if (updated.count !== 1) {
        throw new ConflictException({ code: 'TOURNAMENT_VERSION_CONFLICT', message: '대회 설정이 다른 요청에서 변경됐어요. 다시 확인해 주세요.' });
      }
      const committedKinds = row.kind === V1CompetitionKind.regular_league
        ? [V1CompetitionKind.regular_league]
        : [V1CompetitionKind.regular_tournament];
      const committed = await findTournamentOnSurface(tx, committedKinds, {
        where: { id: row.id, deletedAt: null },
        select: { updatedAt: true },
      });
      await this.adminContext.logAdminAction(admin, {
        action: 'tournament.period_settings.change',
        targetType: 'tournament',
        targetId: row.id,
        beforeJson: { competitionConfigVersionId: row.competitionConfigVersionId, periods: row.competitionConfig.periods },
        afterJson: { competitionConfigVersionId: version.id, periods: nextPeriods },
      }, tx);
      return {
        changed: true,
        tournamentId: row.id,
        competitionConfigVersionId: version.id,
        expectedVersion: committed?.updatedAt.toISOString() ?? dto.expectedVersion,
        periods: nextPeriods,
      };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034');
        if (retryable && attempt < 2) continue;
        if (retryable) {
          throw new ConflictException({
            code: 'TOURNAMENT_PERIOD_SETTINGS_RETRYABLE',
            message: '동시에 다른 대회 설정이 저장됐어요. 잠시 후 최신 설정으로 다시 시도해 주세요.',
          });
        }
        throw error;
      }
    }
    throw new ConflictException({ code: 'TOURNAMENT_PERIOD_SETTINGS_RETRYABLE', message: '대회 설정 저장을 다시 시도해 주세요.' });
  }

  private readPeriods(value: Prisma.JsonValue): PeriodRead {
    if (!Array.isArray(value)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const count = (value as Record<string, unknown>).count;
        if (Number.isInteger(count) && Number(count) > 0) return { periods: null, legacyPeriodCount: Number(count) };
      }
      throw new UnprocessableEntityException({
        code: 'COMPETITION_PERIODS_UNAVAILABLE',
        message: '현재 대회의 피리어드 설정이 손상됐어요. 먼저 유효한 경기 설정 버전을 연결해 주세요.',
      });
    }
    return { periods: value.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new UnprocessableEntityException({
          code: 'COMPETITION_PERIODS_UNAVAILABLE',
          message: '현재 대회의 피리어드 설정을 읽을 수 없어요. 먼저 유효한 경기 설정 버전을 연결해 주세요.',
        });
      }
      const raw = item as Record<string, unknown>;
      if (typeof raw.code !== 'string' || typeof raw.label !== 'string' || typeof raw.durationMinutes !== 'number' || typeof raw.extraTime !== 'boolean') {
        throw new UnprocessableEntityException({
          code: 'COMPETITION_PERIODS_UNAVAILABLE',
          message: '현재 대회의 피리어드 설정을 읽을 수 없어요. 먼저 유효한 경기 설정 버전을 연결해 주세요.',
        });
      }
      if (raw.code.length === 0) {
        throw new UnprocessableEntityException({
          code: 'COMPETITION_PERIODS_UNAVAILABLE',
          message: '현재 대회의 피리어드 코드가 비어 있어요. 먼저 유효한 경기 설정 버전을 연결해 주세요.',
        });
      }
      return { code: raw.code, label: raw.label, durationMinutes: raw.durationMinutes, extraTime: raw.extraTime };
    }), legacyPeriodCount: null };
  }

  private assertSupportedKind(kind: string | null): asserts kind is 'regular_tournament' | 'regular_league' {
    if (kind !== null && kind !== 'regular_tournament' && kind !== 'regular_league') {
      throw new UnprocessableEntityException({
        code: 'TOURNAMENT_PERIOD_SETTINGS_KIND_UNSUPPORTED',
        message: '정규 대회 또는 정규 리그에서만 피리어드 설정을 바꿀 수 있어요.',
      });
    }
  }

  private async createVersion(
    tx: Prisma.TransactionClient,
    source: { id: string; sportCode: string; name: string; version: number },
    config: ReturnType<typeof validateCompetitionConfig>,
    userId: string,
    adminUserId: string,
    tournamentId: string,
  ) {
    const latest = await tx.v1CompetitionConfigVersion.findFirst({
      where: { sportCode: source.sportCode, name: source.name },
      orderBy: { version: 'desc' },
    });
    const row = await tx.v1CompetitionConfigVersion.create({
      data: {
        sportCode: source.sportCode,
        name: source.name,
        version: (latest?.version ?? source.version) + 1,
        createdByUserId: userId,
        periods: config.periods as Prisma.InputJsonValue,
        events: config.events as Prisma.InputJsonValue,
        lineup: config.lineup as Prisma.InputJsonValue,
        result: config.result as Prisma.InputJsonValue,
        tieBreak: config.tieBreak as Prisma.InputJsonValue,
        visibility: config.visibility as Prisma.InputJsonValue,
        contentHash: competitionConfigContentHash(config),
      },
    });
    await tx.v1AdminActionLog.create({
      data: {
        adminUserId,
        action: 'competition_config.version.create',
        targetType: 'competition_config',
        targetId: row.id,
        beforeJson: { sourceVersionId: source.id, sourceVersion: source.version },
        afterJson: { version: row.version, contentHash: row.contentHash, tournamentId },
      },
    });
    return row;
  }

  private serialize(row: { id: string; updatedAt: Date; competitionConfigVersionId: string | null; competitionConfig: { periods: Prisma.JsonValue } | null }) {
    return {
      tournamentId: row.id,
      competitionConfigVersionId: row.competitionConfigVersionId,
      expectedVersion: row.updatedAt.toISOString(),
      ...(row.competitionConfig ? this.readPeriods(row.competitionConfig.periods) : { periods: null, legacyPeriodCount: null }),
      requiresDurationInput: row.competitionConfig ? this.readPeriods(row.competitionConfig.periods).periods === null : true,
    };
  }
}
