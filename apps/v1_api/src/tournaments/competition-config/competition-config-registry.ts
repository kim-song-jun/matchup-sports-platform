import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService } from '../../common/admin-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CompetitionConfig,
  competitionConfigContentHash,
  normalizeCompetitionSportCode,
  validateCompetitionConfig,
} from './competition-config';
import {
  CompetitionConfigListQueryDto,
  CreateCompetitionConfigDto,
  CreateCompetitionConfigVersionDto,
} from './competition-config.dto';

type CompetitionConfigRow = {
  id: string;
  sportCode: string;
  name: string;
  version: number;
  status: string;
  periods: Prisma.JsonValue;
  events: Prisma.JsonValue;
  lineup: Prisma.JsonValue;
  result: Prisma.JsonValue;
  tieBreak: Prisma.JsonValue;
  visibility: Prisma.JsonValue;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
};

export class CompetitionConfigRegistry {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  private configFromRow(row: CompetitionConfigRow): CompetitionConfig {
    return validateCompetitionConfig({
      periods: row.periods,
      events: row.events,
      lineup: row.lineup,
      result: row.result,
      tieBreak: row.tieBreak,
      visibility: row.visibility,
    });
  }

  private configWriteData(config: CompetitionConfig) {
    return {
      periods: config.periods as Prisma.InputJsonValue,
      events: config.events as Prisma.InputJsonValue,
      lineup: config.lineup as Prisma.InputJsonValue,
      result: config.result as Prisma.InputJsonValue,
      tieBreak: config.tieBreak as Prisma.InputJsonValue,
      visibility: config.visibility as Prisma.InputJsonValue,
      contentHash: competitionConfigContentHash(config),
    };
  }

  private serialize(row: CompetitionConfigRow) {
    return {
      id: row.id,
      sportCode: row.sportCode,
      name: row.name,
      version: row.version,
      status: row.status,
      config: this.configFromRow(row),
      contentHash: row.contentHash,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(user: V1AuthUser, query: CompetitionConfigListQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    const sportCode = query.sportCode
      ? normalizeCompetitionSportCode(query.sportCode)
      : undefined;
    const rows = await this.prisma.v1CompetitionConfigVersion.findMany({
      where: { sportCode, version: query.version },
      orderBy: [{ sportCode: 'asc' }, { name: 'asc' }, { version: 'desc' }],
    });
    return { items: rows.map((row) => this.serialize(row)) };
  }

  async listVersions(user: V1AuthUser, configId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    const source = await this.prisma.v1CompetitionConfigVersion.findUnique({
      where: { id: configId },
    });
    if (!source) {
      throw new NotFoundException({
        code: 'COMPETITION_CONFIG_NOT_FOUND',
        message: '경기 설정을 찾을 수 없어요.',
      });
    }
    const rows = await this.prisma.v1CompetitionConfigVersion.findMany({
      where: { sportCode: source.sportCode, name: source.name },
      orderBy: { version: 'desc' },
    });
    return { items: rows.map((row) => this.serialize(row)) };
  }

  async create(user: V1AuthUser, dto: CreateCompetitionConfigDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const sportCode = normalizeCompetitionSportCode(dto.sportCode);
    const config = validateCompetitionConfig(dto.config);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.v1CompetitionConfigVersion.create({
        data: {
          sportCode,
          name: dto.name.trim(),
          version: 1,
          createdByUserId: user.id,
          ...this.configWriteData(config),
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'competition_config.create',
          targetType: 'competition_config',
          targetId: row.id,
          afterJson: {
            sportCode,
            name: row.name,
            version: row.version,
            contentHash: row.contentHash,
          },
        },
        tx,
      );
      return row;
    });
    return this.serialize(created);
  }

  async createVersion(
    user: V1AuthUser,
    configId: string,
    dto: CreateCompetitionConfigVersionDto,
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const config = validateCompetitionConfig(dto.config);
    const created = await this.prisma.$transaction(async (tx) => {
      const source = await tx.v1CompetitionConfigVersion.findUnique({
        where: { id: configId },
      });
      if (!source) {
        throw new NotFoundException({
          code: 'COMPETITION_CONFIG_NOT_FOUND',
          message: '경기 설정을 찾을 수 없어요.',
        });
      }
      const latest = await tx.v1CompetitionConfigVersion.findFirst({
        where: { sportCode: source.sportCode, name: source.name },
        orderBy: { version: 'desc' },
      });
      const row = await tx.v1CompetitionConfigVersion.create({
        data: {
          sportCode: source.sportCode,
          name: source.name,
          version: (latest?.version ?? 0) + 1,
          createdByUserId: user.id,
          ...this.configWriteData(config),
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'competition_config.version.create',
          targetType: 'competition_config',
          targetId: row.id,
          beforeJson: { sourceVersionId: source.id, sourceVersion: source.version },
          afterJson: { version: row.version, contentHash: row.contentHash },
        },
        tx,
      );
      return row;
    });
    return this.serialize(created);
  }
}
