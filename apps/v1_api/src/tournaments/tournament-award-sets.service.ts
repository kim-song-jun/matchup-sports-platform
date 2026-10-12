import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { V1TournamentBracketTrack } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from './tournament-surface-lookup';
import { lockCompetitionForSlotReleaseInTx } from './slots/competition-bracket-lock';

export class TournamentAwardSetDto {
  @IsIn([V1TournamentBracketTrack.upper, V1TournamentBracketTrack.lower])
  bracketTrack!: 'upper' | 'lower';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  prizePool?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prizeSummary?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  prizeBreakdown?: string | null;
}

export class SetTournamentAwardSetsDto {
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => TournamentAwardSetDto)
  awardSets!: TournamentAwardSetDto[];
}

@Injectable()
export class TournamentAwardSetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  private async findRegularTournament(tournamentId: string) {
    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId, deletedAt: null },
      select: { id: true, kind: true },
    });
    if (!tournament || tournament.kind !== 'regular_tournament') {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '정규대회를 찾을 수 없어요.' });
    }
    return tournament;
  }

  private async listAwardSetsInternal(tournamentId: string) {
    const rows = await this.prisma.v1TournamentAwardSet.findMany({
      where: {
        tournamentId,
        bracketTrack: { in: [V1TournamentBracketTrack.upper, V1TournamentBracketTrack.lower] },
      },
      orderBy: { bracketTrack: 'asc' },
      select: {
        id: true,
        bracketTrack: true,
        prizePool: true,
        prizeSummary: true,
        prizeBreakdown: true,
      },
    });
    return rows;
  }

  async listAwardSets(user: V1AuthUser, tournamentId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    await this.findRegularTournament(tournamentId);
    return this.listAwardSetsInternal(tournamentId);
  }

  async setAwardSets(user: V1AuthUser, tournamentId: string, dto: SetTournamentAwardSetsDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const tournament = await this.findRegularTournament(tournamentId);

    const tracks = dto.awardSets.map((entry) => entry.bracketTrack);
    if (new Set(tracks).size !== tracks.length) {
      throw new BadRequestException({
        code: 'DUPLICATE_AWARD_TRACK',
        message: '상위와 하위 시상 안내는 각각 한 번씩만 설정할 수 있어요.',
      });
    }

    const awardSets = dto.awardSets.map((entry) => ({
      bracketTrack: entry.bracketTrack,
      prizePool: entry.prizePool ?? null,
      prizeSummary: entry.prizeSummary ?? null,
      prizeBreakdown: entry.prizeBreakdown ?? null,
    }));

    await this.prisma.$transaction(async (tx) => {
      await lockCompetitionForSlotReleaseInTx(tx, tournament);
      const before = await tx.v1TournamentAwardSet.findMany({
        where: { tournamentId },
        orderBy: { bracketTrack: 'asc' },
      });
      await tx.v1TournamentAwardSet.deleteMany({ where: { tournamentId } });
      for (const awardSet of awardSets) {
        await tx.v1TournamentAwardSet.create({
          data: { tournamentId, ...awardSet },
        });
      }
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.award_sets_replace',
          targetType: 'tournament',
          targetId: tournamentId,
          beforeJson: {
            awardSets: before.map((row) => ({
              bracketTrack: row.bracketTrack,
              prizePool: row.prizePool,
              prizeSummary: row.prizeSummary,
              prizeBreakdown: row.prizeBreakdown,
            })),
          },
          afterJson: { awardSets },
        },
        tx,
      );
    });

    return this.listAwardSetsInternal(tournamentId);
  }
}
