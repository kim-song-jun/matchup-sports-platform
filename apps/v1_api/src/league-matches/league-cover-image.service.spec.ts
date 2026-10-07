import { ForbiddenException } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { AdminContextService } from '../common/admin-context.service';
import type { PrismaService } from '../prisma/prisma.service';
import { LeagueCoverImageService } from './league-cover-image.service';

const user = { id: 'admin-1' } as V1AuthUser;
type Row = { id: string; coverImageUrl: string | null; deletedAt: Date | null };

function setup(rows: Row[]) {
  const logAdminAction = jest.fn();
  const getMutationAdmin = jest.fn(async () => ({ userId: 'admin-1' }));
  const tx = {
    // kind 필터는 SQL 쪽 — 대회 id 는 행이 없는 것으로 흉내낸다.
    $queryRaw: jest.fn(async (_strings: TemplateStringsArray, id: string) => rows.filter((r) => r.id === id).map((r) => ({ ...r }))),
    v1Tournament: {
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { coverImageUrl: string | null } }) => {
        const row = rows.find((r) => r.id === where.id)!;
        row.coverImageUrl = data.coverImageUrl;
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  } as unknown as PrismaService;
  const service = new LeagueCoverImageService(
    prisma,
    { getMutationAdmin, logAdminAction } as unknown as AdminContextService,
  );
  return { service, tx, logAdminAction, getMutationAdmin, prisma, rows };
}

const A = '/uploads/a.webp';
const B = '/uploads/b.webp';

describe('LeagueCoverImageService.update', () => {
  it('support·비어드민은 거부되고 DB 에 접근하지 않는다', async () => {
    const { service, getMutationAdmin, prisma } = setup([]);
    getMutationAdmin.mockRejectedValueOnce(new ForbiddenException({ code: 'PERMISSION_DENIED' }));
    await expect(service.update(user, 'l1', { coverImageUrl: A })).rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('교체는 그 리그만 바꾸고 before/after 를 감사에 남긴다(다른 리그는 그대로)', async () => {
    const { service, rows, tx, logAdminAction } = setup([
      { id: 'l1', coverImageUrl: A, deletedAt: null },
      { id: 'l2', coverImageUrl: A, deletedAt: null },
    ]);
    await expect(service.update(user, 'l1', { coverImageUrl: B })).resolves.toEqual({
      leagueId: 'l1', coverImageUrl: B, alreadyProcessed: false,
    });
    expect(rows.map((r) => r.coverImageUrl)).toEqual([B, A]);
    expect(logAdminAction).toHaveBeenCalledWith(
      { userId: 'admin-1' },
      {
        action: 'league_match.cover_image_updated', targetType: 'league_match', targetId: 'l1',
        reason: null, beforeJson: { coverImageUrl: A }, afterJson: { coverImageUrl: B },
      },
      tx,
    );
  });

  it('null 은 제거이고, 처음 설정(null → URL)도 쓴다', async () => {
    const { service, rows } = setup([{ id: 'l1', coverImageUrl: A, deletedAt: null }]);
    await service.update(user, 'l1', { coverImageUrl: null });
    expect(rows[0].coverImageUrl).toBeNull();
    await service.update(user, 'l1', { coverImageUrl: B });
    expect(rows[0].coverImageUrl).toBe(B);
  });

  it.each([A, null])('같은 값(%p)은 쓰기·감사 없이 alreadyProcessed 다', async (value) => {
    const { service, tx, logAdminAction } = setup([{ id: 'l1', coverImageUrl: value, deletedAt: null }]);
    await expect(service.update(user, 'l1', { coverImageUrl: value })).resolves.toEqual({
      leagueId: 'l1', coverImageUrl: value, alreadyProcessed: true,
    });
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('행이 없으면(대회 id 포함) 404, 소프트삭제는 409 LEAGUE_MIRROR_MISSING', async () => {
    const { service } = setup([{ id: 'gone', coverImageUrl: null, deletedAt: new Date() }]);
    await expect(service.update(user, 'nope', { coverImageUrl: A })).rejects.toMatchObject({
      status: 404, response: { code: 'LEAGUE_NOT_FOUND' },
    });
    await expect(service.update(user, 'gone', { coverImageUrl: A })).rejects.toMatchObject({
      status: 409, response: { code: 'LEAGUE_MIRROR_MISSING' },
    });
  });
});
