import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { assertTeamLineupManager } from './team-lineup-access';
import type {
  CreateTeamLineupPresetDto,
  TeamLineupPresetEntryDto,
  UpdateTeamLineupPresetDto,
} from './dto/team-lineup-preset.dto';

/** 팀당 프리셋 상한. 목록에서 눈으로 훑어 고르는 UI라 이보다 많아지면 고르는 일이
 * 저장하는 일보다 오래 걸린다. */
const MAX_PRESETS_PER_TEAM = 10;

/**
 * 팀이 이름을 붙여 저장해 두는 라인업 템플릿.
 *
 * 경기 스냅샷과 의도적으로 다르게 다룬다. 스냅샷은 "그날 이렇게 뛰었다"는 기록이라
 * 사후에 바뀌면 안 되지만, 프리셋은 팀이 계속 고쳐 쓰는 템플릿이라 불러올 때마다
 * **현재의** 이름·자격으로 다시 해석된다. 그래서 엔트리에 userId를 남기고, 표시 이름은
 * 그 사람이 팀을 떠났을 때를 위한 폴백으로만 보관한다.
 */
@Injectable()
export class TeamLineupPresetService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: V1AuthUser, teamId: string) {
    await assertTeamLineupManager(this.prisma, teamId, user.id);
    const presets = await this.prisma.v1TeamLineupPreset.findMany({
      where: { teamId },
      orderBy: { updatedAt: 'desc' },
      include: { entries: { orderBy: { sortOrder: 'asc' } } },
    });
    return { items: presets.map((preset) => this.serialize(preset)) };
  }

  async create(user: V1AuthUser, teamId: string, dto: CreateTeamLineupPresetDto) {
    await assertTeamLineupManager(this.prisma, teamId, user.id);

    const count = await this.prisma.v1TeamLineupPreset.count({ where: { teamId } });
    if (count >= MAX_PRESETS_PER_TEAM) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_PRESET_LIMIT_EXCEEDED',
        message: `라인업 프리셋은 팀당 ${MAX_PRESETS_PER_TEAM}개까지 저장할 수 있어요. 쓰지 않는 프리셋을 지우고 다시 시도해 주세요.`,
      });
    }

    const name = dto.name.trim();
    this.assertName(name);

    try {
      const preset = await this.prisma.v1TeamLineupPreset.create({
        data: {
          teamId,
          name,
          formation: dto.formation ?? null,
          sportName: dto.sportName ?? null,
          createdByUserId: user.id,
          entries: { create: this.toEntryRows(dto.entries) },
        },
        include: { entries: { orderBy: { sortOrder: 'asc' } } },
      });
      return this.serialize(preset);
    } catch (error) {
      throw this.translateNameConflict(error);
    }
  }

  async update(user: V1AuthUser, teamId: string, presetId: string, dto: UpdateTeamLineupPresetDto) {
    await assertTeamLineupManager(this.prisma, teamId, user.id);
    await this.getOwnedPreset(teamId, presetId);

    const name = dto.name?.trim();
    if (name !== undefined) this.assertName(name);

    try {
      const preset = await this.prisma.$transaction(async (tx) => {
        if (dto.entries !== undefined) {
          // 전체 교체 — 부분 병합을 하지 않는 이유는 DTO 주석 참고.
          await tx.v1TeamLineupPresetEntry.deleteMany({ where: { presetId } });
        }
        return tx.v1TeamLineupPreset.update({
          where: { id: presetId },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(dto.formation !== undefined ? { formation: dto.formation } : {}),
            ...(dto.sportName !== undefined ? { sportName: dto.sportName } : {}),
            ...(dto.entries !== undefined ? { entries: { create: this.toEntryRows(dto.entries) } } : {}),
          },
          include: { entries: { orderBy: { sortOrder: 'asc' } } },
        });
      });
      return this.serialize(preset);
    } catch (error) {
      throw this.translateNameConflict(error);
    }
  }

  async remove(user: V1AuthUser, teamId: string, presetId: string) {
    await assertTeamLineupManager(this.prisma, teamId, user.id);
    await this.getOwnedPreset(teamId, presetId);
    await this.prisma.v1TeamLineupPreset.delete({ where: { id: presetId } });
    return { deleted: true };
  }

  // ─── internals ───────────────────────────────────────────────────────────

  /** presetId만으로 조회하지 않고 반드시 teamId와 함께 좁힌다 — 권한은 팀 단위로
   * 검증했으므로, 다른 팀의 preset id를 끼워 넣어 남의 프리셋을 고치거나 지우는 경로가
   * 열려서는 안 된다. */
  private async getOwnedPreset(teamId: string, presetId: string) {
    const preset = await this.prisma.v1TeamLineupPreset.findFirst({
      where: { id: presetId, teamId },
      select: { id: true },
    });
    if (preset === null) {
      throw new NotFoundException({
        code: 'LINEUP_PRESET_NOT_FOUND',
        message: '라인업 프리셋을 찾을 수 없어요.',
      });
    }
    return preset;
  }

  private assertName(name: string) {
    if (name.length === 0) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_PRESET_NAME_REQUIRED',
        message: '프리셋 이름을 입력해 주세요.',
      });
    }
  }

  private toEntryRows(entries: TeamLineupPresetEntryDto[]) {
    return entries.map((entry, index) => ({
      userId: entry.userId ?? null,
      displayName: entry.displayName,
      jerseyNumber: entry.jerseyNumber ?? null,
      position: entry.position ?? null,
      positionX: entry.positionX ?? null,
      positionY: entry.positionY ?? null,
      started: entry.started,
      goalkeeper: entry.goalkeeper ?? false,
      sortOrder: index,
    }));
  }

  private translateNameConflict(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException({
        code: 'LINEUP_PRESET_NAME_TAKEN',
        message: '같은 이름의 프리셋이 이미 있어요.',
      });
    }
    return error;
  }

  private serialize(preset: {
    id: string;
    name: string;
    formation: string | null;
    sportName: string | null;
    updatedAt: Date;
    entries: Array<{
      userId: string | null;
      displayName: string;
      jerseyNumber: number | null;
      position: string | null;
      positionX: number | null;
      positionY: number | null;
      started: boolean;
      goalkeeper: boolean;
    }>;
  }) {
    return {
      presetId: preset.id,
      name: preset.name,
      formation: preset.formation,
      sportName: preset.sportName,
      updatedAt: preset.updatedAt,
      starterCount: preset.entries.filter((entry) => entry.started).length,
      benchCount: preset.entries.filter((entry) => !entry.started).length,
      entries: preset.entries.map((entry) => ({
        userId: entry.userId,
        displayName: entry.displayName,
        jerseyNumber: entry.jerseyNumber,
        position: entry.position,
        positionX: entry.positionX,
        positionY: entry.positionY,
        started: entry.started,
        goalkeeper: entry.goalkeeper,
      })),
    };
  }
}
