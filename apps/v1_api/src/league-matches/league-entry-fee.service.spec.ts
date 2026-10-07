import { ForbiddenException } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import type { AdminContextService } from '../common/admin-context.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { UpdateLeagueEntryFeeDto } from './dto/league-entry-fee.dto';
import { LeagueEntryFeeService } from './league-entry-fee.service';

type Row = {
  id: string;
  kind: string;
  status: string;
  deletedAt: Date | null;
  entryFee: number;
  entryFeeConfiguredAt: Date | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
};

const BANK = { bankName: '국민은행', bankAccount: '123-456-789012', bankHolder: '팀밋' };
const user = { id: 'admin-1' } as V1AuthUser;
const dto = (value: Partial<UpdateLeagueEntryFeeDto> & { entryFee: number }) => value as UpdateLeagueEntryFeeDto;

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key as keyof Row];
    if (expected !== null && typeof expected === 'object' && 'notIn' in (expected as object)) {
      return !((expected as { notIn: unknown[] }).notIn).includes(actual);
    }
    if (expected instanceof Date || actual instanceof Date) {
      return (expected as Date | null)?.getTime() === (actual as Date | null)?.getTime();
    }
    return actual === expected;
  });
}

function setup(initial: Partial<Row> = {}, activeRegistrations = 0, raceBeforeWrite?: (row: Row) => void) {
  const row: Row = {
    id: 'league-1', kind: 'regular_league', status: 'in_progress', deletedAt: null,
    entryFee: 0, entryFeeConfiguredAt: null, bankName: null, bankAccount: null, bankHolder: null,
    ...initial,
  };
  // 롤백은 이 트랜잭션이 쓴 것만 되돌린다 — 그 사이 다른 관리자가 커밋한 값은 남는다.
  let beforeOwnWrite: Row | null = null;
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
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        if (!matches(row, where)) return { count: 0 };
        beforeOwnWrite = { ...row };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    v1TournamentRegistration: { count: jest.fn(async () => activeRegistrations) },
  };
  const prisma = {
    // 던지면 트랜잭션째 롤백되는 것을 흉내낸다.
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<unknown>) => {
      try {
        return await run(tx);
      } catch (error) {
        if (beforeOwnWrite !== null) Object.assign(row, beforeOwnWrite);
        throw error;
      }
    }),
  } as unknown as PrismaService;
  const service = new LeagueEntryFeeService(prisma, { getMutationAdmin, logAdminAction } as unknown as AdminContextService);
  return { service, row, tx, logAdminAction, getMutationAdmin, prisma };
}

describe('LeagueEntryFeeService.update', () => {
  it('support·비어드민은 거부되고 DB 에 접근하지 않는다', async () => {
    const { service, tx, prisma, getMutationAdmin } = setup();
    getMutationAdmin.mockRejectedValueOnce(new ForbiddenException({ code: 'PERMISSION_DENIED' }));
    await expect(service.update(user, 'league-1', dto({ entryFee: 0 }))).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.v1Tournament.findFirst).not.toHaveBeenCalled();
  });

  it('대회 id 로 부르면 404', async () => {
    const { service } = setup({ kind: 'regular_tournament' });
    await expect(service.update(user, 'league-1', dto({ entryFee: 0 }))).rejects.toMatchObject({ response: { code: 'LEAGUE_NOT_FOUND' } });
  });

  it('소프트삭제는 409 LEAGUE_MIRROR_MISSING, 끝난·취소 리그는 409 LEAGUE_ENTRY_FEE_NOT_ALLOWED', async () => {
    await expect(setup({ deletedAt: new Date() }).service.update(user, 'league-1', dto({ entryFee: 0 })))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_MIRROR_MISSING' } });
    for (const status of ['completed', 'cancelled']) {
      const { service, row } = setup({ status });
      await expect(service.update(user, 'league-1', dto({ entryFee: 1000, ...BANK })))
        .rejects.toMatchObject({ response: { code: 'LEAGUE_ENTRY_FEE_NOT_ALLOWED' } });
      expect(row.entryFee).toBe(0);
    }
  });

  it('유료 + 계좌 누락(요청에도 현재 값에도 없음)은 422 이고 쓰지 않는다', async () => {
    const { service, row, logAdminAction } = setup({ bankName: '국민은행' });
    await expect(service.update(user, 'league-1', dto({ entryFee: 70000, bankAccount: '123' })))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_PAYMENT_INSTRUCTIONS_REQUIRED' } });
    expect(row.entryFeeConfiguredAt).toBeNull();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('유료 + 계좌는 현재 값을 이어 쓸 수 있다(보낸 필드만 바뀐다)', async () => {
    const { service, row } = setup({ entryFee: 50000, entryFeeConfiguredAt: new Date('2026-10-01'), ...BANK });
    const result = await service.update(user, 'league-1', dto({ entryFee: 60000 }));
    expect(result).toMatchObject({ entryFee: 60000, alreadyProcessed: false, ...BANK });
    expect(row).toMatchObject({ entryFee: 60000, ...BANK });
  });

  it('0원 + 계좌 없음은 통과하고 설정 시각을 찍는다(무료 확정)', async () => {
    const { service, row, logAdminAction } = setup();
    const result = await service.update(user, 'league-1', dto({ entryFee: 0 }));
    expect(result).toMatchObject({ entryFee: 0, alreadyProcessed: false, bankName: null });
    expect(row.entryFeeConfiguredAt).toBeInstanceOf(Date);
    expect(logAdminAction).toHaveBeenCalledTimes(1);
  });

  it('값이 같고 이미 설정됐으면 멱등이다 — 쓰기·감사 없음', async () => {
    const configuredAt = new Date('2026-10-01T00:00:00.000Z');
    const { service, tx, logAdminAction } = setup({ entryFee: 70000, entryFeeConfiguredAt: configuredAt, ...BANK });
    const result = await service.update(user, 'league-1', dto({ entryFee: 70000, ...BANK }));
    expect(result).toMatchObject({ alreadyProcessed: true, entryFeeConfiguredAt: configuredAt.toISOString() });
    expect(tx.v1Tournament.updateMany).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('값이 같아도 미설정이면 쓴다(이어받은 설정 확인)', async () => {
    const { service, row, tx } = setup({ entryFee: 70000, ...BANK });
    const result = await service.update(user, 'league-1', dto({ entryFee: 70000 }));
    expect(result.alreadyProcessed).toBe(false);
    expect(tx.v1Tournament.updateMany).toHaveBeenCalledTimes(1);
    expect(row.entryFeeConfiguredAt).toBeInstanceOf(Date);
  });

  it('조회와 쓰기 사이에 다른 관리자가 바꿨으면 409 이고 덮어쓰지 않는다', async () => {
    const { service, row, logAdminAction } = setup({ entryFee: 1000, entryFeeConfiguredAt: new Date('2026-10-01'), ...BANK },
      0, (r) => { r.entryFee = 99000; });
    await expect(service.update(user, 'league-1', dto({ entryFee: 2000 })))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_STATE_CHANGED' } });
    expect(row.entryFee).toBe(99000);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('조회와 쓰기 사이에 리그가 끝나도 쓰지 않는다', async () => {
    const { service, row } = setup({}, 0, (r) => { r.status = 'completed'; });
    await expect(service.update(user, 'league-1', dto({ entryFee: 0 })))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_STATE_CHANGED' } });
    expect(row.entryFeeConfiguredAt).toBeNull();
  });

  describe('활성 신청이 있을 때의 사유', () => {
    const configured = { entryFee: 70000, entryFeeConfiguredAt: new Date('2026-10-01'), ...BANK };

    it('금액 변경 + 사유 없음 → 422 이고 UPDATE 가 롤백된다', async () => {
      const { service, row, logAdminAction } = setup(configured, 2);
      await expect(service.update(user, 'league-1', dto({ entryFee: 80000 })))
        .rejects.toMatchObject({ response: { code: 'LEAGUE_ENTRY_FEE_REASON_REQUIRED' } });
      expect(row).toMatchObject(configured);
      expect(logAdminAction).not.toHaveBeenCalled();
    });

    it('계좌만 바뀌어도 사유가 필요하다', async () => {
      const { service, row } = setup(configured, 1);
      await expect(service.update(user, 'league-1', dto({ entryFee: 70000, bankAccount: '999-999' })))
        .rejects.toMatchObject({ response: { code: 'LEAGUE_ENTRY_FEE_REASON_REQUIRED' } });
      expect(row.bankAccount).toBe(BANK.bankAccount);
    });

    it('공백만 사유는 사유 없음과 같다', async () => {
      const { service } = setup(configured, 1);
      await expect(service.update(user, 'league-1', dto({ entryFee: 80000, reason: '   ' })))
        .rejects.toMatchObject({ response: { code: 'LEAGUE_ENTRY_FEE_REASON_REQUIRED' } });
    });

    it('사유가 있으면 통과하고 감사에 사유가 남는다', async () => {
      const { service, row, logAdminAction } = setup(configured, 2);
      await service.update(user, 'league-1', dto({ entryFee: 80000, reason: '  물가 인상 ' }));
      expect(row.entryFee).toBe(80000);
      expect(logAdminAction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'league_match.entry_fee_updated',
          reason: '물가 인상',
          beforeJson: expect.objectContaining({ entryFee: 70000, entryFeeConfigured: true }),
          afterJson: expect.objectContaining({ entryFee: 80000, entryFeeConfigured: true }),
        }),
        expect.anything(),
      );
    });

    it('값 동일 + 미설정 확인은 사유 없이 통과한다(대조: 금액이 바뀌면 422)', async () => {
      const inherited = { entryFee: 70000, ...BANK };
      const ok = setup(inherited, 2);
      await expect(ok.service.update(user, 'league-1', dto({ entryFee: 70000 }))).resolves.toMatchObject({ alreadyProcessed: false });
      const changed = setup(inherited, 2);
      await expect(changed.service.update(user, 'league-1', dto({ entryFee: 75000 })))
        .rejects.toMatchObject({ response: { code: 'LEAGUE_ENTRY_FEE_REASON_REQUIRED' } });
    });

    it('활성 신청 0 이면 금액이 바뀌어도 사유 없이 통과한다', async () => {
      const { service, row } = setup(configured, 0);
      await service.update(user, 'league-1', dto({ entryFee: 80000 }));
      expect(row.entryFee).toBe(80000);
    });
  });

  it('감사 로그에 계좌번호·예금주 평문을 싣지 않는다', async () => {
    const { service, logAdminAction } = setup();
    await service.update(user, 'league-1', dto({ entryFee: 70000, ...BANK }));
    const logged = JSON.stringify(logAdminAction.mock.calls[0][1]);
    expect(logged).not.toContain(BANK.bankAccount);
    expect(logged).not.toContain(BANK.bankHolder);
    expect(logAdminAction.mock.calls[0][1].afterJson).toMatchObject({ bankAccountChanged: true, hasBankAccount: true });
  });
});
