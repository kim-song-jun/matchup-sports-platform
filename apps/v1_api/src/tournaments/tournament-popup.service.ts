import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateTournamentPopupDto, UpdateTournamentPopupDto } from './dto/tournament-popup.dto';

type TournamentPopupRow = {
  id: string;
  tournamentId: string;
  title: string;
  body: string;
  imageUrl: string | null;
  status: string;
  displayStartAt: Date | null;
  displayEndAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class TournamentPopupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async listByTournament(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    await this.assertTournamentExists(tournamentId, false);

    const rows = await this.prisma.v1TournamentPopup.findMany({
      where: { tournamentId },
      orderBy: [{ createdAt: 'desc' }],
    });

    return { items: rows.map((row) => this.serialize(row)) };
  }

  async create(user: V1AuthUser, tournamentId: string, dto: CreateTournamentPopupDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.assertTournamentExists(tournamentId, true);
    const { displayStartAt, displayEndAt } = this.parseDisplayWindow(dto);

    const popup = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1TournamentPopup.create({
        data: {
          tournamentId,
          title: dto.title.trim(),
          body: dto.body.trim(),
          imageUrl: cleanOptionalText(dto.imageUrl),
          status: dto.status,
          displayStartAt,
          displayEndAt,
        },
      });

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament_popup.create',
          targetType: 'tournament_popup',
          targetId: created.id,
          afterJson: this.auditSnapshot(created),
        },
        tx,
      );

      return created;
    });

    return this.serialize(popup);
  }

  async update(user: V1AuthUser, input: TournamentPopupIdentity & { dto: UpdateTournamentPopupDto }) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.assertTournamentExists(input.tournamentId, true);
    const existing = await this.findPopup(input.tournamentId, input.popupId);
    const { displayStartAt, displayEndAt } = this.parseDisplayWindow(input.dto);

    const popup = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TournamentPopup.update({
        where: { id: existing.id },
        data: {
          title: input.dto.title.trim(),
          body: input.dto.body.trim(),
          imageUrl: cleanOptionalText(input.dto.imageUrl),
          status: input.dto.status,
          displayStartAt,
          displayEndAt,
        },
      });

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament_popup.update',
          targetType: 'tournament_popup',
          targetId: updated.id,
          beforeJson: this.auditSnapshot(existing),
          afterJson: this.auditSnapshot(updated),
        },
        tx,
      );

      return updated;
    });

    return this.serialize(popup);
  }

  async delete(user: V1AuthUser, input: TournamentPopupIdentity) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.assertTournamentExists(input.tournamentId, true);
    const existing = await this.findPopup(input.tournamentId, input.popupId);

    await this.prisma.$transaction(async (tx) => {
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament_popup.delete',
          targetType: 'tournament_popup',
          targetId: existing.id,
          beforeJson: this.auditSnapshot(existing),
        },
        tx,
      );
      await tx.v1TournamentPopup.delete({ where: { id: existing.id } });
    });

    return { popupId: existing.id, deleted: true };
  }

  private async assertTournamentExists(tournamentId: string, requireLive: boolean) {
    const tournament = await this.prisma.v1Tournament.findFirst({
      where: requireLive ? { id: tournamentId, deletedAt: null } : { id: tournamentId },
    });

    if (!tournament) {
      throw new NotFoundException({
        code: 'TOURNAMENT_NOT_FOUND',
        message: '대회를 찾을 수 없어요.',
      });
    }
  }

  private async findPopup(tournamentId: string, popupId: string) {
    const popup = await this.prisma.v1TournamentPopup.findFirst({
      where: { id: popupId, tournamentId },
    });
    if (!popup) {
      throw new NotFoundException({
        code: 'TOURNAMENT_POPUP_NOT_FOUND',
        message: '팝업을 찾을 수 없어요.',
      });
    }
    return popup;
  }

  private parseDisplayWindow(dto: CreateTournamentPopupDto | UpdateTournamentPopupDto) {
    const displayStartAt = dto.displayStartAt ? new Date(dto.displayStartAt) : null;
    const displayEndAt = dto.displayEndAt ? new Date(dto.displayEndAt) : null;
    if (displayStartAt && displayEndAt && displayEndAt <= displayStartAt) {
      throw new BadRequestException({
        code: 'INVALID_DISPLAY_WINDOW',
        message: '팝업 노출 종료 시각은 시작 시각보다 늦어야 해요.',
      });
    }
    return { displayStartAt, displayEndAt };
  }

  private serialize(row: TournamentPopupRow) {
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      title: row.title,
      body: row.body,
      imageUrl: row.imageUrl,
      status: row.status,
      displayStartAt: row.displayStartAt?.toISOString() ?? null,
      displayEndAt: row.displayEndAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private auditSnapshot(row: TournamentPopupRow) {
    return {
      tournamentId: row.tournamentId,
      title: row.title,
      status: row.status,
      displayStartAt: row.displayStartAt?.toISOString() ?? null,
      displayEndAt: row.displayEndAt?.toISOString() ?? null,
    };
  }
}

function cleanOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

type TournamentPopupIdentity = {
  readonly tournamentId: string;
  readonly popupId: string;
};
