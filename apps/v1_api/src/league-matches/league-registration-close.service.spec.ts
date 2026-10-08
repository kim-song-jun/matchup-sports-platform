import { ForbiddenException } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { AdminContextService } from '../common/admin-context.service';
import type { PrismaService } from '../prisma/prisma.service';
import { LeagueRegistrationCloseService } from './league-registration-close.service';

type Row = {
  id: string;
  kind: string;
  status: string;
  deletedAt: Date | null;
  registrationDeadlineAt: Date | null;
};

const user = { id: 'admin-1' } as V1AuthUser;
const hours = (h: number) => new Date(Date.now() + h * 3_600_000);

function setup(initial: Partial<Row> = {}, raceBeforeWrite?: (row: Row) => void) {
  const row: Row = {
    id: 'league-1', kind: 'regular_league', status: 'in_progress', deletedAt: null,
    registrationDeadlineAt: hours(24), ...initial,
  };
  const logAdminAction = jest.fn();
  const getMutationAdmin = jest.fn(async () => ({ userId: 'admin-1' }));
  const tx = {
    v1Tournament: {
      findFirst: jest.fn(async () => {
        if (row.kind !== 'regular_league') return null;
        const snapshot = { ...row };
        raceBeforeWrite?.(row);
        return snapshot;
      }),
      // where 가 안 맞으면 count 0 — 실제 조건부 UPDATE 의미를 흉내낸다.
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const ok = Object.entries(where).every(([key, expected]) => {
          const actual = row[key as keyof Row];
          return expected instanceof Date
            ? (actual as Date | null)?.getTime() === expected.getTime()
            : actual === expected;
        });
        if (!ok) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  } as unknown as PrismaService;
  const service = new LeagueRegistrationCloseService(
    prisma,
    { getMutationAdmin, logAdminAction } as unknown as AdminContextService,
  );
  return { service, row, tx, logAdminAction, getMutationAdmin, prisma };
}

describe('LeagueRegistrationCloseService.close', () => {
  it('support·비어드민은 거부되고 DB 에 접근하지 않는다', async () => {
    const { service, getMutationAdmin, prisma } = setup();
    getMutationAdmin.mockRejectedValueOnce(new ForbiddenException({ code: 'PERMISSION_DENIED' }));
    await expect(service.close(user, 'league-1', {})).rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('열린 리그는 읽은 마감값을 조건으로 now 로 당기고 감사를 같은 트랜잭션에 남긴다', async () => {
    const before = hours(24);
    const { service, row, tx, logAdminAction } = setup({ registrationDeadlineAt: before });
    const result = await service.close(user, 'league-1', { reason: '정원 마감' });

    expect(tx.v1Tournament.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ registrationDeadlineAt: before }) }),
    );
    expect(result).toMatchObject({ leagueId: 'league-1', registrationOpen: false, alreadyProcessed: false });
    expect(result.registrationDeadlineAt).toBe(row.registrationDeadlineAt?.toISOString());
    expect(row.registrationDeadlineAt!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(row.status).toBe('in_progress');
    expect(logAdminAction).toHaveBeenCalledWith(
      { userId: 'admin-1' },
      {
        action: 'league_match.close_registration',
        targetType: 'league_match',
        targetId: 'league-1',
        reason: '정원 마감',
        beforeJson: { registrationDeadlineAt: before.toISOString() },
        afterJson: { registrationDeadlineAt: row.registrationDeadlineAt!.toISOString() },
      },
      tx,
    );
  });

  it('보류 중인 리그도 닫는다(대조: status 는 그대로)', async () => {
    const { service, row } = setup({ status: 'on_hold' });
    await expect(service.close(user, 'league-1', {})).resolves.toMatchObject({ alreadyProcessed: false });
    expect(row.status).toBe('on_hold');
  });

  it('사유가 없으면 감사 reason 은 null 이다', async () => {
    const { service, logAdminAction } = setup();
    await service.close(user, 'league-1', {});
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ reason: null }), expect.anything(),
    );
  });

  it.each([
    ['이미 지난 마감', hours(-1)],
    ['마감 미설정', null],
  ])('%s 은 쓰기·감사 없이 alreadyProcessed 로 답한다', async (_label, deadline) => {
    const { service, row, tx, logAdminAction } = setup({ registrationDeadlineAt: deadline });
    const result = await service.close(user, 'league-1', {});
    expect(result).toEqual({
      leagueId: 'league-1',
      registrationOpen: false,
      registrationDeadlineAt: deadline?.toISOString() ?? null,
      alreadyProcessed: true,
    });
    expect(row.registrationDeadlineAt).toBe(deadline);
    expect(tx.v1Tournament.updateMany).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('조회 뒤 마감이 바뀌면 409 LEAGUE_STATE_CHANGED 이고 감사는 없다', async () => {
    const racedTo = hours(72);
    const { service, row, logAdminAction } = setup({}, (r) => {
      r.registrationDeadlineAt = racedTo;
    });
    await expect(service.close(user, 'league-1', {})).rejects.toMatchObject({
      status: 409, response: { code: 'LEAGUE_STATE_CHANGED' },
    });
    expect(row.registrationDeadlineAt).toBe(racedTo);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it.each(['completed', 'cancelled'])('%s 리그는 409 LEAGUE_REGISTRATION_NOT_ALLOWED', async (status) => {
    const { service, tx } = setup({ status });
    await expect(service.close(user, 'league-1', {})).rejects.toMatchObject({
      status: 409, response: { code: 'LEAGUE_REGISTRATION_NOT_ALLOWED' },
    });
    expect(tx.v1Tournament.updateMany).not.toHaveBeenCalled();
  });

  it('대회 id 는 404 LEAGUE_NOT_FOUND, 소프트삭제는 409 LEAGUE_MIRROR_MISSING 으로 갈린다', async () => {
    await expect(setup({ kind: 'regular_tournament' }).service.close(user, 'x', {})).rejects.toMatchObject({
      status: 404, response: { code: 'LEAGUE_NOT_FOUND' },
    });
    await expect(setup({ deletedAt: new Date() }).service.close(user, 'x', {})).rejects.toMatchObject({
      status: 409, response: { code: 'LEAGUE_MIRROR_MISSING' },
    });
  });
});
