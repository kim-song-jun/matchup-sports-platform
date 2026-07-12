import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateTournamentSponsorDto, UpdateTournamentSponsorDto } from './dto/tournament-sponsor.dto';

type TournamentSponsorRow = {
  id: string;
  tournamentId: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  benefitText: string | null;
  boothText: string | null;
  eventTitle: string | null;
  eventDescription: string | null;
  eventResultText: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class TournamentSponsorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async listByTournament(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    await this.assertTournamentExists(tournamentId, false);

    const rows = await this.prisma.v1TournamentSponsor.findMany({
      where: { tournamentId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return { items: rows.map((row) => this.serialize(row)) };
  }

  async create(
    user: V1AuthUser,
    tournamentId: string,
    dto: CreateTournamentSponsorDto,
  ) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.assertTournamentExists(tournamentId, true);

    const sponsor = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1TournamentSponsor.create({
        data: {
          tournamentId,
          name: dto.name.trim(),
          description: cleanOptionalText(dto.description),
          logoUrl: cleanOptionalText(dto.logoUrl),
          websiteUrl: cleanOptionalText(dto.websiteUrl),
          instagramUrl: cleanOptionalText(dto.instagramUrl),
          benefitText: cleanOptionalText(dto.benefitText),
          boothText: cleanOptionalText(dto.boothText),
          eventTitle: cleanOptionalText(dto.eventTitle),
          eventDescription: cleanOptionalText(dto.eventDescription),
          eventResultText: cleanOptionalText(dto.eventResultText),
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
        },
      });

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament_sponsor.create',
          targetType: 'tournament_sponsor',
          targetId: created.id,
          afterJson: {
            tournamentId,
            name: created.name,
            isActive: created.isActive,
            sortOrder: created.sortOrder,
          },
        },
        tx,
      );

      return created;
    });

    return this.serialize(sponsor);
  }

  async update(user: V1AuthUser, input: UpdateTournamentSponsorInput) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.assertTournamentExists(input.tournamentId, true);
    const existing = await this.findSponsor(input.tournamentId, input.sponsorId);

    const sponsor = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TournamentSponsor.update({
        where: { id: existing.id },
        data: updateData(input.dto),
      });

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament_sponsor.update',
          targetType: 'tournament_sponsor',
          targetId: updated.id,
          beforeJson: this.auditSnapshot(existing),
          afterJson: this.auditSnapshot(updated),
        },
        tx,
      );

      return updated;
    });

    return this.serialize(sponsor);
  }

  async deactivate(user: V1AuthUser, input: TournamentSponsorIdentity) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.assertTournamentExists(input.tournamentId, true);
    const existing = await this.findSponsor(input.tournamentId, input.sponsorId);

    const sponsor = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TournamentSponsor.update({
        where: { id: existing.id },
        data: { isActive: false },
      });

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament_sponsor.deactivate',
          targetType: 'tournament_sponsor',
          targetId: updated.id,
          beforeJson: this.auditSnapshot(existing),
          afterJson: this.auditSnapshot(updated),
        },
        tx,
      );

      return updated;
    });

    return this.serialize(sponsor);
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

  private async findSponsor(tournamentId: string, sponsorId: string) {
    const sponsor = await this.prisma.v1TournamentSponsor.findFirst({
      where: { id: sponsorId, tournamentId },
    });
    if (!sponsor) {
      throw new NotFoundException({
        code: 'TOURNAMENT_SPONSOR_NOT_FOUND',
        message: '협찬 정보를 찾을 수 없어요.',
      });
    }
    return sponsor;
  }

  private serialize(row: TournamentSponsorRow) {
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      name: row.name,
      description: row.description,
      logoUrl: row.logoUrl,
      websiteUrl: row.websiteUrl,
      instagramUrl: row.instagramUrl,
      benefitText: row.benefitText,
      boothText: row.boothText,
      eventTitle: row.eventTitle,
      eventDescription: row.eventDescription,
      eventResultText: row.eventResultText,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private auditSnapshot(row: TournamentSponsorRow) {
    return {
      tournamentId: row.tournamentId,
      name: row.name,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    };
  }
}

function cleanOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function updateData(dto: UpdateTournamentSponsorDto) {
  return {
    name: dto.name === undefined ? undefined : dto.name.trim(),
    description: cleanPatchText(dto.description),
    logoUrl: cleanPatchText(dto.logoUrl),
    websiteUrl: cleanPatchText(dto.websiteUrl),
    instagramUrl: cleanPatchText(dto.instagramUrl),
    benefitText: cleanPatchText(dto.benefitText),
    boothText: cleanPatchText(dto.boothText),
    eventTitle: cleanPatchText(dto.eventTitle),
    eventDescription: cleanPatchText(dto.eventDescription),
    eventResultText: cleanPatchText(dto.eventResultText),
    sortOrder: dto.sortOrder,
    isActive: dto.isActive,
  };
}

function cleanPatchText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return cleanOptionalText(value);
}

type TournamentSponsorIdentity = {
  readonly tournamentId: string;
  readonly sponsorId: string;
};

type UpdateTournamentSponsorInput = TournamentSponsorIdentity & {
  readonly dto: UpdateTournamentSponsorDto;
};
