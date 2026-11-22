import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AdminService } from './admin.service';

const user = { id: 'admin-user', email: 'a@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

type MatchRow = { id: string; status: string; startAt: Date; deletedAt: Date | null };

function build(options: { role?: 'owner' | 'ops' | 'support'; match?: MatchRow | null; participants?: number; applications?: number; latestLogAction?: string | null }) {
  const match = options.match === undefined ? { id: 'm-1', status: 'recruiting', startAt: PAST, deletedAt: null } : options.match;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    v1Match: {
      findUnique: jest.fn().mockResolvedValue(match),
      update: jest.fn().mockResolvedValue({}),
    },
    v1MatchParticipant: { count: jest.fn().mockResolvedValue(options.participants ?? 0) },
    v1MatchApplication: { count: jest.fn().mockResolvedValue(options.applications ?? 0) },
    v1AdminActionLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      findFirst: jest.fn().mockResolvedValue(options.latestLogAction ? { action: options.latestLogAction, reason: null, adminUser: { user: { profile: null } } } : null),
    },
  };
  const prisma = {
    v1AdminUser: {
      findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', userId: user.id, adminRole: options.role ?? 'ops', status: 'active', user: { accountStatus: 'active' } }),
    },
    $transaction: jest.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  return { prisma, tx };
}

async function serviceFor(prisma: unknown) {
  const module = await Test.createTestingModule({
    providers: [
      AdminService,
      { provide: PrismaService, useValue: prisma },
      { provide: RealtimeGateway, useValue: { forceDisconnectUser: jest.fn() } },
      { provide: getLoggerToken(AdminService.name), useValue: { warn: jest.fn() } },
    ],
  }).compile();
  return module.get(AdminService);
}

describe('AdminService.hideMatch', () => {
  it('support 역할은 트랜잭션을 열기 전에 막힌다', async () => {
    const { prisma } = build({ role: 'support' });
    const service = await serviceFor(prisma);
    await expect(service.hideMatch(user, 'm-1', { reason: '시험 경기' })).rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('owner 와 ops 는 숨길 수 있고 상태는 그대로 두며 사유·이전 상태를 감사 기록에 남긴다', async () => {
    for (const role of ['owner', 'ops'] as const) {
      const { prisma, tx } = build({ role });
      const service = await serviceFor(prisma);
      const result = await service.hideMatch(user, 'm-1', { reason: '운영 시험용' });
      expect(result).toMatchObject({ matchId: 'm-1', hidden: true, actionLogId: 'log-1' });
      expect(tx.v1Match.update).toHaveBeenCalledWith({ where: { id: 'm-1' }, data: { deletedAt: expect.any(Date) } });
      expect(tx.v1AdminActionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'match.hide', targetType: 'match', targetId: 'm-1', reason: '운영 시험용',
          beforeJson: expect.objectContaining({ status: 'recruiting', deletedAt: null }),
        }),
      });
    }
  });

  it('시작 전인데 신청자나 확정 참가자가 있으면 MATCH_HIDE_HAS_PARTICIPANTS 로 막고 아무것도 쓰지 않는다', async () => {
    for (const counts of [{ participants: 1, applications: 0 }, { participants: 0, applications: 1 }]) {
      const { prisma, tx } = build({ match: { id: 'm-1', status: 'recruiting', startAt: FUTURE, deletedAt: null }, ...counts });
      const service = await serviceFor(prisma);
      await expect(service.hideMatch(user, 'm-1', { reason: '정리' })).rejects.toMatchObject({
        status: 409,
        response: { code: 'MATCH_HIDE_HAS_PARTICIPANTS' },
      });
      expect(tx.v1Match.update).not.toHaveBeenCalled();
      expect(tx.v1AdminActionLog.create).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['이미 시작 시각이 지난 매치', { id: 'm-1', status: 'recruiting', startAt: PAST, deletedAt: null }],
    ['취소된 매치', { id: 'm-1', status: 'cancelled', startAt: FUTURE, deletedAt: null }],
  ])('%s 는 참가자가 있어도 숨길 수 있다', async (_label, match) => {
    const { prisma, tx } = build({ match, participants: 2, applications: 1 });
    const service = await serviceFor(prisma);
    await expect(service.hideMatch(user, 'm-1', { reason: '정리' })).resolves.toMatchObject({ hidden: true });
    expect(tx.v1Match.update).toHaveBeenCalled();
  });

  it('참가자 없는 예정 매치는 숨길 수 있다', async () => {
    const { prisma } = build({ match: { id: 'm-1', status: 'closed', startAt: FUTURE, deletedAt: null } });
    const service = await serviceFor(prisma);
    await expect(service.hideMatch(user, 'm-1', { reason: '정리' })).resolves.toMatchObject({ hidden: true });
  });

  it('이미 숨긴 매치는 MATCH_ALREADY_HIDDEN, 없는 매치는 404', async () => {
    const hidden = build({ match: { id: 'm-1', status: 'recruiting', startAt: PAST, deletedAt: new Date() } });
    await expect((await serviceFor(hidden.prisma)).hideMatch(user, 'm-1', { reason: '정리' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'MATCH_ALREADY_HIDDEN' },
    });
    const missing = build({ match: null });
    await expect((await serviceFor(missing.prisma)).hideMatch(user, 'x', { reason: '정리' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('AdminService.unhideMatch', () => {
  const hiddenRow = { id: 'm-1', status: 'recruiting', startAt: PAST, deletedAt: new Date('2026-11-22T00:00:00Z') };

  it('support 역할은 막힌다', async () => {
    const { prisma } = build({ role: 'support', match: hiddenRow, latestLogAction: 'match.hide' });
    await expect((await serviceFor(prisma)).unhideMatch(user, 'm-1', { reason: '복원' })).rejects.toMatchObject({ status: 403 });
  });

  it('어드민이 숨긴 매치는 deletedAt 만 비우고 감사 기록을 남긴다', async () => {
    const { prisma, tx } = build({ match: hiddenRow, latestLogAction: 'match.hide' });
    await expect((await serviceFor(prisma)).unhideMatch(user, 'm-1', { reason: '잘못 숨김' })).resolves.toMatchObject({ hidden: false, hiddenAt: null });
    expect(tx.v1Match.update).toHaveBeenCalledWith({ where: { id: 'm-1' }, data: { deletedAt: null } });
    expect(tx.v1AdminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'match.unhide', reason: '잘못 숨김' }),
    });
  });

  it('주최자가 직접 삭제한 매치(어드민 숨김 기록 없음)는 되살리지 않는다', async () => {
    const { prisma, tx } = build({ match: { ...hiddenRow, status: 'archived' }, latestLogAction: null });
    await expect((await serviceFor(prisma)).unhideMatch(user, 'm-1', { reason: '복원' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'MATCH_DELETED_BY_HOST' },
    });
    expect(tx.v1Match.update).not.toHaveBeenCalled();
  });

  it('복원한 뒤 주최자가 지운 매치는, 가장 최근 기록이 복원이라 어드민 복원 대상이 아니다', async () => {
    const { prisma } = build({ match: hiddenRow, latestLogAction: 'match.unhide' });
    await expect((await serviceFor(prisma)).unhideMatch(user, 'm-1', { reason: '복원' })).rejects.toMatchObject({
      response: { code: 'MATCH_DELETED_BY_HOST' },
    });
  });

  it('숨기지 않은 매치는 MATCH_NOT_HIDDEN', async () => {
    const { prisma } = build({ match: { ...hiddenRow, deletedAt: null } });
    await expect((await serviceFor(prisma)).unhideMatch(user, 'm-1', { reason: '복원' })).rejects.toMatchObject({
      response: { code: 'MATCH_NOT_HIDDEN' },
    });
  });
});

describe('AdminService.changeMatchStatus — 숨긴 매치', () => {
  it('숨긴 매치의 상태 변경은 MATCH_HIDDEN 으로 막고 쓰지 않는다', async () => {
    const { prisma, tx } = build({ match: { id: 'm-1', status: 'recruiting', startAt: PAST, deletedAt: new Date() } });
    const service = await serviceFor(prisma);
    await expect(service.changeMatchStatus(user, 'm-1', { status: 'closed', reason: '마감' })).rejects.toMatchObject({
      status: 409,
      response: { code: 'MATCH_HIDDEN' },
    });
    expect(tx.v1Match.update).not.toHaveBeenCalled();
  });
});

describe('AdminService.listMatches / getMatch — 숨김 표시', () => {
  function listPrisma(rows: unknown[]) {
    return {
      v1AdminUser: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', userId: user.id, adminRole: 'support', status: 'active', user: { accountStatus: 'active' } }) },
      v1Match: { findMany: jest.fn().mockResolvedValue(rows), groupBy: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      v1AdminActionLog: { findFirst: jest.fn() },
    };
  }
  const baseRow = {
    id: 'm-1', title: '매치', placeName: '구장', startAt: PAST, status: 'recruiting', deletedAt: null, maxParticipants: 4,
    createdAt: PAST, hostUserId: 'h', sport: { name: '풋살', code: 'futsal' }, hostUser: { profile: { nickname: '호스트' } }, _count: { participants: 1 },
  };

  it.each([
    [undefined, {}],
    ['public', { deletedAt: null }],
    ['hidden', { deletedAt: { not: null } }],
  ] as const)('visibility=%s 는 목록과 상태 칩 집계 모두에 같은 조건을 건다', async (visibility, expected) => {
    const prisma = listPrisma([]);
    await (await serviceFor(prisma)).listMatches(user, { visibility });
    const listWhere = prisma.v1Match.findMany.mock.calls[0][0].where;
    const facetWhere = prisma.v1Match.groupBy.mock.calls[0][0].where;
    expect(listWhere).toMatchObject(expected);
    expect(facetWhere).toMatchObject(expected);
    if (visibility === undefined) {
      expect(listWhere).not.toHaveProperty('deletedAt');
    }
  });

  it('목록 행에 숨긴 시각을 싣는다(숨기지 않은 행은 null)', async () => {
    const hiddenAt = new Date('2026-11-22T01:00:00Z');
    const prisma = listPrisma([baseRow, { ...baseRow, id: 'm-2', deletedAt: hiddenAt }]);
    const result = await (await serviceFor(prisma)).listMatches(user, {});
    expect(result.items.map((item) => item.hiddenAt)).toEqual([null, hiddenAt]);
  });

  it('상세는 어드민 숨김이면 사유·처리자·복원 가능 여부를, 주최자 삭제면 복원 불가를 돌려준다', async () => {
    const detailRow = { ...baseRow, description: null, deadlineAt: null, region: null, _count: { participants: 1, applications: 0 }, deletedAt: new Date('2026-11-22T01:00:00Z') };
    const byAdmin = listPrisma([]);
    byAdmin.v1Match.findUnique.mockResolvedValue(detailRow);
    byAdmin.v1AdminActionLog.findFirst.mockResolvedValue({ action: 'match.hide', reason: '운영 시험용', adminUser: { user: { profile: { nickname: '운영자' } } } });
    await expect((await serviceFor(byAdmin)).getMatch(user, 'm-1')).resolves.toMatchObject({
      hiddenBy: 'admin', hiddenReason: '운영 시험용', hiddenByName: '운영자', canUnhide: true,
    });

    const byHost = listPrisma([]);
    byHost.v1Match.findUnique.mockResolvedValue(detailRow);
    byHost.v1AdminActionLog.findFirst.mockResolvedValue(null);
    await expect((await serviceFor(byHost)).getMatch(user, 'm-1')).resolves.toMatchObject({
      hiddenBy: 'host', hiddenReason: null, canUnhide: false,
    });

    const visible = listPrisma([]);
    visible.v1Match.findUnique.mockResolvedValue({ ...detailRow, deletedAt: null });
    await expect((await serviceFor(visible)).getMatch(user, 'm-1')).resolves.toMatchObject({ hiddenAt: null, hiddenBy: null, canUnhide: false });
    expect(visible.v1AdminActionLog.findFirst).not.toHaveBeenCalled();
  });
});
