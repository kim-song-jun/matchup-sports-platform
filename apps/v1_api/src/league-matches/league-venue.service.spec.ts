import type { Prisma } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { AdminContextService } from '../common/admin-context.service';
import type { PrismaService } from '../prisma/prisma.service';
import { LeagueVenueService } from './league-venue.service';

const user = { id: 'admin-1' } as V1AuthUser;
type Row = {
  id: string; kind: string; deletedAt: Date | null; venue: string | null; venueAddress: string | null;
  latitude: number | null; longitude: number | null; venueProvider: string | null; venueProviderId: string | null;
};

function row(over: Partial<Row> & { id: string }): Row {
  return {
    kind: 'regular_league', deletedAt: null, venue: null, venueAddress: null, latitude: null, longitude: null,
    venueProvider: null, venueProviderId: null, ...over,
  };
}

function setup(rows: Row[]) {
  const logAdminAction = jest.fn();
  const getMutationAdmin = jest.fn(async () => ({ userId: 'admin-1' }));
  const tx = {
    v1Tournament: {
      // findTournamentOnSurface 가 `{ AND: [종류 조건, { id }] }` 로 감싸 보낸다 — 종류·id 를 그 안에서 읽는다.
      findFirst: jest.fn(async ({ where }: { where: Prisma.V1TournamentWhereInput }) => {
        const text = JSON.stringify(where);
        const found = rows.find((r) => text.includes(`"id":"${r.id}"`) && text.includes(`"kind":"${r.kind}"`));
        return found === undefined ? null : { ...found };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        Object.assign(rows.find((r) => r.id === where.id)!, data);
      }),
    },
    v1TeamMatch: { update: jest.fn(), updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  } as unknown as PrismaService;
  const service = new LeagueVenueService(prisma, { getMutationAdmin, logAdminAction } as unknown as AdminContextService);
  return { service, tx, rows, logAdminAction, getMutationAdmin, prisma };
}

const PICKED = {
  venue: '탄천 풋살장', venueAddress: '경기 성남시', venueLatitude: 37.4, venueLongitude: 127.1,
  venueProvider: 'kakao', venueProviderId: '12345',
};

describe('LeagueVenueService.update', () => {
  it('비어드민은 거부되고 DB 에 접근하지 않는다', async () => {
    const { service, getMutationAdmin, prisma } = setup([]);
    getMutationAdmin.mockRejectedValueOnce(new ForbiddenException({ code: 'PERMISSION_DENIED' }));
    await expect(service.update(user, 'l1', PICKED)).rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('고른 장소를 여섯 칸에 저장하고 before/after 를 감사에 남기며 대진은 건드리지 않는다', async () => {
    const { service, rows, tx, logAdminAction } = setup([row({ id: 'l1' }), row({ id: 'l2', venue: '다른 곳' })]);
    await expect(service.update(user, 'l1', PICKED)).resolves.toEqual({
      leagueId: 'l1',
      defaultPlace: {
        name: '탄천 풋살장', address: '경기 성남시', latitude: 37.4, longitude: 127.1,
        provider: 'kakao', providerPlaceId: '12345',
      },
    });
    expect(rows[0]).toMatchObject({
      venue: '탄천 풋살장', venueAddress: '경기 성남시', latitude: 37.4, longitude: 127.1,
      venueProvider: 'kakao', venueProviderId: '12345',
    });
    expect(rows[1].venue).toBe('다른 곳');
    expect(tx.v1TeamMatch.update).not.toHaveBeenCalled();
    expect(tx.v1TeamMatch.updateMany).not.toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalledWith(
      { userId: 'admin-1' },
      expect.objectContaining({
        action: 'league_match.venue_updated', targetId: 'l1', beforeJson: { defaultPlace: null },
        afterJson: { defaultPlace: expect.objectContaining({ name: '탄천 풋살장' }) },
      }),
      tx,
    );
  });

  it('직접 입력(이름만)은 핀 칸을 null 로 덮는다', async () => {
    const { service, rows } = setup([
      row({ id: 'l1', venue: '탄천', latitude: 37, longitude: 127, venueProvider: 'kakao', venueProviderId: '1' }),
    ]);
    await service.update(user, 'l1', { venue: '동네 운동장' });
    expect(rows[0]).toMatchObject({
      venue: '동네 운동장', venueAddress: null, latitude: null, longitude: null, venueProvider: null, venueProviderId: null,
    });
  });

  it.each([[null], ['   ']])('venue=%j 은 장소 전체를 비운다', async (venue) => {
    const { service, rows } = setup([
      row({ id: 'l1', venue: '탄천', venueAddress: '주소', latitude: 37, longitude: 127, venueProvider: 'kakao', venueProviderId: '1' }),
    ]);
    await expect(service.update(user, 'l1', { venue })).resolves.toEqual({ leagueId: 'l1', defaultPlace: null });
    expect(rows[0]).toMatchObject({
      venue: null, venueAddress: null, latitude: null, longitude: null, venueProvider: null, venueProviderId: null,
    });
  });

  it('핀이 일부만 오면 400 PLACE_SNAPSHOT_INCOMPLETE 이고 저장하지 않는다', async () => {
    const { service, tx } = setup([row({ id: 'l1' })]);
    await expect(service.update(user, 'l1', { venue: '탄천', venueLatitude: 37.4, venueLongitude: 127.1 }))
      .rejects.toMatchObject({ status: 400, response: { code: 'PLACE_SNAPSHOT_INCOMPLETE' } });
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('리그가 아닌 대회·없는 id 는 404 LEAGUE_NOT_FOUND', async () => {
    const { service } = setup([row({ id: 't1', kind: 'regular_tournament' })]);
    await expect(service.update(user, 't1', PICKED)).rejects.toMatchObject({ status: 404, response: { code: 'LEAGUE_NOT_FOUND' } });
    await expect(service.update(user, 'nope', PICKED)).rejects.toMatchObject({ status: 404 });
  });

  it('삭제된 리그는 409 LEAGUE_MIRROR_MISSING', async () => {
    const { service, tx } = setup([row({ id: 'l1', deletedAt: new Date() })]);
    await expect(service.update(user, 'l1', PICKED)).rejects.toMatchObject({ status: 409, response: { code: 'LEAGUE_MIRROR_MISSING' } });
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
  });
});
