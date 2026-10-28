import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, V1CompetitionKind, V1TournamentGroupPhase } from '@prisma/client';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService, type V1ActiveAdmin } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { competitionConfigContentHash, validateCompetitionConfig } from './competition-config';
import { isReusableCompetitionPeriodConfig, normalizeCompetitionPeriods as normalizeTournamentPeriods } from './competition-config-periods';
import { UpdateTournamentPeriodSettingsDto } from './tournament-period-settings.dto';
import { ALL_COMPETITION_KINDS, findTournamentOnSurface } from '../tournament-surface-lookup';
import {
  lockCompetitionFixtureRows, lockTournamentForConfigChange, repointUntouchedFixtures, teamMatchOwnershipWhere, untouchedGameWhere,
} from './tournament-competition-config';
import { competitionStagePhase } from '../tournament-stage-rank';
import { materializePeriodConfigVersion } from './materialize-period-config-version';

type StoredPeriod = { code: string; label: string; durationMinutes: number; extraTime: boolean };
type PeriodRead = { periods: StoredPeriod[] | null; legacyPeriodCount: number | null };
type ConfigContent = { periods: Prisma.JsonValue; events: Prisma.JsonValue; lineup: Prisma.JsonValue; result: Prisma.JsonValue; tieBreak: Prisma.JsonValue; visibility: Prisma.JsonValue };
const PERIOD_SETTINGS_INCLUDE = {
  competitionConfig: true,
  stagePeriodSettings: { include: { competitionConfig: true }, orderBy: { phase: 'asc' as const } },
} satisfies Prisma.V1TournamentInclude;
type PeriodSettingsTournament = Prisma.V1TournamentGetPayload<{ include: typeof PERIOD_SETTINGS_INCLUDE }>;

export { normalizeCompetitionPeriods as normalizeTournamentPeriods } from './competition-config-periods';

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
      include: PERIOD_SETTINGS_INCLUDE,
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
      // 경기 생성·설정 변경과 같은 잠금 순서(대회 → Game → TeamMatch). 시작 전 경기를 옮기는 동안 새 경기가 옛 설정으로 생기지 않게 한다.
      await lockTournamentForConfigChange(tx, tournamentId);
      const row = await findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
        where: { id: tournamentId, deletedAt: null },
        include: PERIOD_SETTINGS_INCLUDE,
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

      await lockCompetitionFixtureRows(tx, row.kind, row.id);

      if (dto.phase !== undefined) {
        return this.updateStage(tx, user.id, admin, row, { ...dto, phase: dto.phase });
      }
      if (dto.inheritDefault === true) {
        throw new BadRequestException({
          code: 'TOURNAMENT_PERIOD_DEFAULT_REQUIRED',
          message: '대회 기본 경기 시간은 삭제할 수 없어요.',
        });
      }
      if (!dto.periods) {
        throw new BadRequestException({ code: 'TOURNAMENT_PERIODS_REQUIRED', message: '피리어드 시간을 입력해 주세요.' });
      }

      const currentRead = this.readPeriods(row.competitionConfig.periods);
      const currentPeriods = currentRead.periods ?? [];
      const nextPeriods = normalizeTournamentPeriods(currentPeriods, dto.periods);
      const defaultOwnership = await this.periodOwnership(tx, row, null);
      if (currentRead.periods && periodsEqual(currentPeriods, nextPeriods)) {
        // 같은 값을 다시 저장하면 예전 설정에 남은 시작 전 경기만 지금 설정으로 맞춘다.
        const fixturesRepointed = await this.followPeriods(tx, row, row.competitionConfig, nextPeriods, defaultOwnership);
        if (fixturesRepointed > 0) {
          await this.adminContext.logAdminAction(admin, {
            action: 'tournament.period_settings.apply_pending',
            targetType: 'tournament',
            targetId: row.id,
            afterJson: { competitionConfigVersionId: row.competitionConfigVersionId, fixturesRepointed },
          }, tx);
        }
        return { changed: false, fixturesRepointed, ...this.serialize(row) };
      }

      const config = validateCompetitionConfig({
        periods: nextPeriods,
        events: row.competitionConfig.events,
        lineup: row.competitionConfig.lineup,
        result: row.competitionConfig.result,
        tieBreak: row.competitionConfig.tieBreak,
        visibility: row.competitionConfig.visibility,
      }, { preserveMissingCatalogKeys: true });
      const contentHash = competitionConfigContentHash(config);
      const existingVersion = await tx.v1CompetitionConfigVersion.findUnique({ where: { contentHash } });
      if (existingVersion && !isReusableCompetitionPeriodConfig(existingVersion, row.competitionConfig.sportCode, config)) {
        throw new ConflictException({
          code: 'COMPETITION_CONFIG_CONTENT_HASH_COLLISION',
          message: '동일한 해시의 설정이 다른 종목·비활성 버전이거나 실제 내용이 달라 재사용할 수 없어요.',
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
      const fixturesRepointed = await this.followPeriods(tx, row, version, nextPeriods, defaultOwnership);
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
        afterJson: { competitionConfigVersionId: version.id, periods: nextPeriods, fixturesRepointed },
      }, tx);
      return {
        changed: true,
        ...this.serialize({
          ...row,
          updatedAt: committed?.updatedAt ?? row.updatedAt,
          competitionConfigVersionId: version.id,
          competitionConfig: version,
        }),
        fixturesRepointed,
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

  private async updateStage(
    tx: Prisma.TransactionClient,
    userId: string,
    admin: V1ActiveAdmin,
    row: PeriodSettingsTournament,
    dto: UpdateTournamentPeriodSettingsDto & { phase: V1TournamentGroupPhase },
  ) {
    if (row.kind === V1CompetitionKind.regular_league) {
      throw new BadRequestException({
        code: 'TOURNAMENT_STAGE_PERIODS_UNSUPPORTED',
        message: '단계별 경기 시간은 정규 대회에서만 설정할 수 있어요.',
      });
    }
    if (!row.competitionConfig) {
      throw new UnprocessableEntityException({ code: 'COMPETITION_PERIODS_UNAVAILABLE', message: '대회 기본 경기 설정이 없어요.' });
    }
    const existing = row.stagePeriodSettings.find((setting) => setting.phase === dto.phase);
    const ownership = await this.periodOwnership(tx, row, dto.phase);

    if (dto.inheritDefault === true) {
      if (!existing) return { changed: false, fixturesRepointed: 0, ...this.serialize(row) };
      await tx.v1TournamentStagePeriodSetting.delete({ where: { id: existing.id } });
      const bumped = await this.bumpTournamentVersion(tx, row);
      const defaultPeriods = this.readPeriods(row.competitionConfig.periods).periods;
      if (!defaultPeriods) throw new UnprocessableEntityException({ code: 'COMPETITION_PERIODS_UNAVAILABLE', message: '대회 기본 경기 시간을 읽을 수 없어요.' });
      const fixturesRepointed = await this.followPeriods(tx, row, row.competitionConfig, defaultPeriods, ownership);
      await this.adminContext.logAdminAction(admin, {
        action: 'tournament.stage_period_settings.inherit', targetType: 'tournament', targetId: row.id,
        beforeJson: { phase: dto.phase, competitionConfigVersionId: existing.competitionConfigVersionId, periods: existing.periods },
        afterJson: { phase: dto.phase, competitionConfigVersionId: row.competitionConfigVersionId, fixturesRepointed },
      }, tx);
      return {
        changed: true,
        ...this.serialize({ ...row, updatedAt: bumped, stagePeriodSettings: row.stagePeriodSettings.filter((setting) => setting.id !== existing.id) }),
        fixturesRepointed,
      };
    }
    if (!dto.periods) throw new BadRequestException({ code: 'TOURNAMENT_PERIODS_REQUIRED', message: '단계별 경기 시간을 입력해 주세요.' });

    const source = existing?.competitionConfig ?? row.competitionConfig;
    const currentRead = this.readPeriods(existing?.periods ?? source.periods);
    const currentPeriods = currentRead.periods ?? [];
    const nextPeriods = normalizeTournamentPeriods(currentPeriods, dto.periods);
    if (existing && currentRead.periods && periodsEqual(currentPeriods, nextPeriods)) {
      const fixturesRepointed = await this.followPeriods(tx, row, existing.competitionConfig, nextPeriods, ownership);
      return { changed: false, fixturesRepointed, ...this.serialize(row) };
    }

    // 단계 설정은 피리어드만 소유한다. 다른 규칙은 항상 현재 대회 기본 설정을 복제해 단계 설정이
    // 라인업·결과 정책을 과거 버전에 얼려 두지 않게 한다.
    const materialized = await materializePeriodConfigVersion(tx, {
      source: row.competitionConfig,
      periods: nextPeriods as unknown as Prisma.JsonValue,
      createdByUserId: userId,
    });
    const saved = await tx.v1TournamentStagePeriodSetting.upsert({
      where: { tournamentId_phase: { tournamentId: row.id, phase: dto.phase } },
      create: {
        tournamentId: row.id,
        phase: dto.phase,
        periods: nextPeriods as unknown as Prisma.InputJsonValue,
        competitionConfigVersionId: materialized.version.id,
      },
      update: {
        periods: nextPeriods as unknown as Prisma.InputJsonValue,
        competitionConfigVersionId: materialized.version.id,
      },
      include: { competitionConfig: true },
    });
    const bumped = await this.bumpTournamentVersion(tx, row);
    const fixturesRepointed = await this.followPeriods(tx, row, materialized.version, nextPeriods, ownership);
    if (materialized.created) {
      await tx.v1AdminActionLog.create({ data: {
        adminUserId: admin.id, action: 'competition_config.version.create', targetType: 'competition_config', targetId: materialized.version.id,
        beforeJson: { sourceVersionId: row.competitionConfig.id, sourceVersion: row.competitionConfig.version },
        afterJson: { version: materialized.version.version, contentHash: materialized.version.contentHash, tournamentId: row.id, phase: dto.phase },
      } });
    }
    await this.adminContext.logAdminAction(admin, {
      action: 'tournament.stage_period_settings.change', targetType: 'tournament', targetId: row.id,
      beforeJson: existing ? { phase: dto.phase, competitionConfigVersionId: existing.competitionConfigVersionId, periods: existing.periods } : undefined,
      afterJson: { phase: dto.phase, competitionConfigVersionId: materialized.version.id, periods: nextPeriods, fixturesRepointed },
    }, tx);
    const stagePeriodSettings = [...row.stagePeriodSettings.filter((setting) => setting.phase !== dto.phase), saved]
      .sort((left, right) => left.phase.localeCompare(right.phase));
    return {
      changed: true,
      ...this.serialize({ ...row, updatedAt: bumped, stagePeriodSettings }),
      fixturesRepointed,
    };
  }

  private async bumpTournamentVersion(tx: Prisma.TransactionClient, row: PeriodSettingsTournament) {
    // updatedAt이 CAS 토큰이라 같은 밀리초 안의 연속 저장도 반드시 새 버전을 받아야 한다.
    const updatedAt = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
    const result = await tx.v1Tournament.updateMany({ where: { id: row.id, updatedAt: row.updatedAt }, data: { updatedAt } });
    if (result.count !== 1) {
      throw new ConflictException({ code: 'TOURNAMENT_VERSION_CONFLICT', message: '대회 설정이 다른 요청에서 변경됐어요. 다시 확인해 주세요.' });
    }
    return updatedAt;
  }

  private async periodOwnership(
    tx: Prisma.TransactionClient,
    row: Pick<PeriodSettingsTournament, 'id' | 'kind' | 'stagePeriodSettings'>,
    phase: V1TournamentGroupPhase | null,
  ): Promise<Prisma.V1TeamMatchWhereInput> {
    const base = teamMatchOwnershipWhere(row.kind, row.id);
    if (row.kind === V1CompetitionKind.regular_league) return base;
    const details = await tx.v1TournamentMatchDetails.findMany({
      where: { tournamentId: row.id, teamMatch: { deletedAt: null } },
      select: { teamMatchId: true, round: true, group: { select: { phase: true } } },
    });
    const overridden = new Set(row.stagePeriodSettings.map((setting) => setting.phase));
    const teamMatchIds = details.filter((detail) => {
      const fixturePhase = competitionStagePhase({ phase: detail.group?.phase, round: detail.round });
      return phase === null ? fixturePhase === null || !overridden.has(fixturePhase) : fixturePhase === phase;
    }).map((detail) => detail.teamMatchId);
    return { ...base, id: { in: teamMatchIds } };
  }

  /**
   * 시작 전 경기(라인업만 낸 경기 포함)를 새 피리어드 버전으로 옮긴다. 피리어드 말고는 지금 설정과 같은 버전을 따르던
   * 경기만 옮긴다 — 라인업·결과 규칙이 다른 버전으로 남겨 둔 경기를 피리어드 저장이 바꾸면 안 된다.
   * 예전에 피리어드만 바꿔 옛 버전에 남은 경기도 이 조건에 들어 함께 따라온다.
   */
  private async followPeriods(
    tx: Prisma.TransactionClient,
    row: { id: string; kind: V1CompetitionKind | null },
    target: { id: string; contentHash: string; periods: Prisma.JsonValue },
    nextPeriods: StoredPeriod[],
    ownership = teamMatchOwnershipWhere(row.kind, row.id),
  ) {
    const pinned = await tx.v1TeamMatch.findMany({
      where: { ...ownership, status: { not: 'completed' }, competitionConfigVersionId: { not: target.id }, OR: [{ game: null }, { game: { is: untouchedGameWhere(true) } }] },
      select: { competitionConfigVersionId: true },
      distinct: ['competitionConfigVersionId'],
    });
    const pinnedIds = pinned.flatMap((match) => match.competitionConfigVersionId ?? []);
    const candidates: (ConfigContent & { id: string })[] = pinnedIds.length === 0 ? [] : await tx.v1CompetitionConfigVersion.findMany({
      where: { id: { in: pinnedIds } },
      select: { id: true, periods: true, events: true, lineup: true, result: true, tieBreak: true, visibility: true },
    });
    const fromVersionIds = candidates.filter((candidate) => this.sameExceptPeriods(candidate, nextPeriods, target.contentHash)).map((candidate) => candidate.id);
    if (fromVersionIds.length === 0) return 0;
    return repointUntouchedFixtures(tx, ownership, target, { fromVersionIds, allowSubmittedLineups: true });
  }

  private sameExceptPeriods(candidate: ConfigContent, periods: StoredPeriod[], targetHash: string) {
    try {
      const { events, lineup, result, tieBreak, visibility } = candidate;
      return competitionConfigContentHash(validateCompetitionConfig({ periods, events, lineup, result, tieBreak, visibility }, { preserveMissingCatalogKeys: true })) === targetHash;
    } catch {
      return false;
    }
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

  private serialize(row: Pick<PeriodSettingsTournament, 'id' | 'kind' | 'updatedAt' | 'competitionConfigVersionId' | 'competitionConfig' | 'stagePeriodSettings'>) {
    return {
      tournamentId: row.id,
      kind: row.kind ?? V1CompetitionKind.regular_tournament,
      competitionConfigVersionId: row.competitionConfigVersionId,
      expectedVersion: row.updatedAt.toISOString(),
      ...(row.competitionConfig ? this.readPeriods(row.competitionConfig.periods) : { periods: null, legacyPeriodCount: null }),
      requiresDurationInput: row.competitionConfig ? this.readPeriods(row.competitionConfig.periods).periods === null : true,
      stageOverrides: row.stagePeriodSettings.map((setting) => ({
        phase: setting.phase,
        competitionConfigVersionId: setting.competitionConfigVersionId,
        ...this.readPeriods(setting.periods),
      })),
    };
  }
}
