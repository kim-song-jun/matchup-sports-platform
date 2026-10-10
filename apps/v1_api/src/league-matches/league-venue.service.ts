import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { resolvePlaceSnapshot, type PlaceSnapshot, type PlaceView } from '../places/place-snapshot';
import { TOURNAMENT_VENUE_SELECT, tournamentVenueSnapshot } from '../places/tournament-venue';
import { PrismaService } from '../prisma/prisma.service';
import { findTournamentOnSurface, LEAGUE_KINDS } from '../tournaments/tournament-surface-lookup';
import type { UpdateLeagueVenueDto } from './dto/league-venue.dto';

function asJson(place: PlaceSnapshot | null): Prisma.InputJsonValue | null {
  return place === null ? null : { ...place };
}

/**
 * 리그 기본 장소 교체·제거. 새로 만드는 대진만 이 값을 이어받고 이미 있는 대진은 건드리지 않는다.
 * 마지막 저장이 이긴다.
 */
@Injectable()
export class LeagueVenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async update(
    user: V1AuthUser,
    leagueId: string,
    dto: UpdateLeagueVenueDto,
  ): Promise<{ leagueId: string; defaultPlace: PlaceView | null }> {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const snapshot = resolvePlaceSnapshot({
      name: dto.venue,
      address: dto.venueAddress,
      latitude: dto.venueLatitude,
      longitude: dto.venueLongitude,
      provider: dto.venueProvider,
      providerPlaceId: dto.venueProviderId,
    });
    return this.prisma.$transaction(async (tx) => {
      const current = await findTournamentOnSurface(tx, LEAGUE_KINDS, {
        where: { id: leagueId },
        select: { deletedAt: true, ...TOURNAMENT_VENUE_SELECT },
      });
      if (current === null) {
        throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
      }
      if (current.deletedAt !== null) {
        throw new ConflictException({ code: 'LEAGUE_MIRROR_MISSING', message: '삭제된 리그예요.' });
      }

      await tx.v1Tournament.update({
        where: { id: leagueId },
        data: {
          venue: snapshot?.name ?? null,
          venueAddress: snapshot?.address ?? null,
          latitude: snapshot?.latitude ?? null,
          longitude: snapshot?.longitude ?? null,
          venueProvider: snapshot?.provider ?? null,
          venueProviderId: snapshot?.providerPlaceId ?? null,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'league_match.venue_updated',
          targetType: 'league_match',
          targetId: leagueId,
          reason: null,
          beforeJson: { defaultPlace: asJson(tournamentVenueSnapshot(current)) },
          afterJson: { defaultPlace: asJson(snapshot) },
        },
        tx,
      );
      return { leagueId, defaultPlace: snapshot };
    });
  }
}
