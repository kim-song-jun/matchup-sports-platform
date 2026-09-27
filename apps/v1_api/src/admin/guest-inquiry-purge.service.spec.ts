import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  GuestInquiryPurgeService,
  isGuestInquiryPurgeCandidate,
  PURGED_INQUIRY_REPLY_TEXT,
  PURGED_INQUIRY_TEXT,
} from './guest-inquiry-purge.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2027-10-01T00:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
const opsAdmin = { id: 'admin-ops', userId: 'user-ops', adminRole: 'ops' as const, status: 'active' as const };

type Row = {
  id: string;
  userId: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  contact: string | null;
  category: string;
  title: string;
  body: string;
  status: string;
  closedAt: Date | null;
  updatedAt: Date;
  guestRetentionDays: number | null;
  purgedAt: Date | null;
  purgedByAdminUserId: string | null;
};
type Reply = { id?: string; inquiryId: string; body: string };
type EditLog = { id: string; action: string; targetType: string; targetId: string; beforeJson: unknown; afterJson: unknown };

function guestRow(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    userId: null,
    guestEmail: `${id}@example.test`,
    guestPhone: null,
    contact: null,
    category: 'tournament_hosting',
    title: `대회 개설 문의 · ${id} 연합`,
    body: `담당자: ${id} 담당\n--- 문의 내용 ---\n${id} 의 비밀 메시지`,
    status: 'closed',
    closedAt: daysAgo(400),
    updatedAt: daysAgo(400),
    guestRetentionDays: null,
    purgedAt: null,
    purgedByAdminUserId: null,
    ...overrides,
  };
}

/**
 * 판정은 서비스 코드가 하므로 가짜 DB 는 조건을 해석하지 않는다 — findMany 는 id 목록만 거르고,
 * updateMany 는 "이미 파기됨·회원" 행만 건너뛴다(서비스가 거는 COMPLETED_GUEST_WHERE 의 동시성 가드).
 */
function fakeDb(rows: Row[], replies: Reply[], retentionDays = 365, editLogs: EditLog[] = []) {
  const logs: unknown[] = [];
  const byIds = (where: { id?: { in: string[] } }) =>
    where.id ? rows.filter((row) => where.id!.in.includes(row.id)) : rows;
  const client = {
    v1SiteInfoSettings: { findUnique: jest.fn().mockResolvedValue({ guestInquiryRetentionDays: retentionDays }) },
    v1Inquiry: {
      findMany: jest.fn(async ({ where }: { where: { id?: { in: string[] } } }) => byIds(where).map((row) => ({ ...row }))),
      updateMany: jest.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Partial<Row> }) => {
        const hit = byIds(where).filter((row) => row.purgedAt === null && row.userId === null);
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      }),
    },
    v1InquiryReply: {
      updateMany: jest.fn(async ({ where, data }: { where: { inquiryId: { in: string[] } }; data: { body: string } }) => {
        replies.filter((reply) => where.inquiryId.in.includes(reply.inquiryId)).forEach((reply) => (reply.body = data.body));
      }),
      findMany: jest.fn(async ({ where }: { where: { inquiryId: { in: string[] } } }) =>
        replies.filter((reply) => reply.id && where.inquiryId.in.includes(reply.inquiryId)).map((reply) => ({ id: reply.id })),
      ),
    },
    v1AdminActionLog: {
      createMany: jest.fn(async ({ data }: { data: unknown[] }) => logs.push(...data)),
      findMany: jest.fn(async ({ where }: { where: { action: string; targetType: string; targetId: { in: string[] } } }) =>
        editLogs.filter(
          (log) => log.action === where.action && log.targetType === where.targetType && where.targetId.in.includes(log.targetId),
        ),
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<EditLog> }) =>
        Object.assign(editLogs.find((log) => log.id === where.id)!, data),
      ),
    },
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation((cb: (tx: typeof client) => unknown) => cb(client));
  const service = new GuestInquiryPurgeService(client as unknown as PrismaService);
  return { client, service, logs };
}

describe('isGuestInquiryPurgeCandidate', () => {
  const check = (overrides: Partial<Row>) => isGuestInquiryPurgeCandidate(guestRow('x', overrides), NOW, 365);

  it('closed: expires strictly after closedAt + retention days', () => {
    expect(check({ closedAt: daysAgo(366) })).toBe(true);
    expect(check({ closedAt: daysAgo(364) })).toBe(false);
    expect(check({ closedAt: daysAgo(365) })).toBe(false);
  });

  it('answered has no completion column, so its last state transition (updatedAt) counts', () => {
    expect(check({ status: 'answered', closedAt: null, updatedAt: daysAgo(366) })).toBe(true);
    expect(check({ status: 'answered', closedAt: null, updatedAt: daysAgo(364) })).toBe(false);
  });

  it('closed uses closedAt even when a later update touched the row', () => {
    expect(check({ closedAt: daysAgo(364), updatedAt: daysAgo(400) })).toBe(false);
    expect(check({ closedAt: null, updatedAt: daysAgo(366) })).toBe(true);
  });

  it.each(['received', 'reviewing'])('unfinished %s inquiries are kept however old', (status) => {
    expect(check({ status, closedAt: null, updatedAt: daysAgo(4000) })).toBe(false);
  });

  it('never keeps a row past the period its submitter agreed to, even after the setting grows', () => {
    // 365일에 동의받고 설정을 730일로 늘린 경우 — 동의한 365일이 기준이다.
    expect(isGuestInquiryPurgeCandidate(guestRow('x', { guestRetentionDays: 365, closedAt: daysAgo(366) }), NOW, 730)).toBe(true);
    expect(isGuestInquiryPurgeCandidate(guestRow('x', { guestRetentionDays: 365, closedAt: daysAgo(364) }), NOW, 730)).toBe(false);
    // 설정을 줄이면 이미 받은 문의에도 짧은 쪽이 적용된다.
    expect(isGuestInquiryPurgeCandidate(guestRow('x', { guestRetentionDays: 730, closedAt: daysAgo(31) }), NOW, 30)).toBe(true);
  });

  it('member inquiries and already purged rows are never candidates', () => {
    expect(check({ userId: 'member-1' })).toBe(false);
    expect(check({ purgedAt: daysAgo(1) })).toBe(false);
  });
});

describe('GuestInquiryPurgeService', () => {
  const mixed = () => [
    guestRow('expired-closed', { closedAt: daysAgo(366) }),
    guestRow('expired-answered', { status: 'answered', closedAt: null, updatedAt: daysAgo(500) }),
    guestRow('fresh', { closedAt: daysAgo(364) }),
    guestRow('open', { status: 'received', closedAt: null }),
    guestRow('member', { userId: 'member-1' }),
    guestRow('done', { purgedAt: daysAgo(10), title: PURGED_INQUIRY_TEXT, guestEmail: null }),
  ];

  it('lists only candidates, oldest completion first, without any personal fields', async () => {
    const { service } = fakeDb(mixed(), []);
    const result = await service.listCandidates(NOW);
    expect(result).toEqual({
      retentionDays: 365,
      total: 2,
      items: [
        {
          inquiryId: 'expired-answered',
          category: 'tournament_hosting',
          completedAt: daysAgo(500).toISOString(),
          retentionExpiredAt: daysAgo(135).toISOString(),
        },
        {
          inquiryId: 'expired-closed',
          category: 'tournament_hosting',
          completedAt: daysAgo(366).toISOString(),
          retentionExpiredAt: daysAgo(1).toISOString(),
        },
      ],
    });
  });

  it('reads the admin-set retention days', async () => {
    const { service } = fakeDb(mixed(), [], 30);
    expect((await service.listCandidates(NOW)).total).toBe(3); // fresh(364일 전 종결)도 30일 기준으로는 만료
  });

  it('selected: re-checks every id on the server and purges only real candidates', async () => {
    const rows = mixed();
    const replies = [
      { inquiryId: 'expired-closed', body: 'expired-closed 담당님, 안내드려요' },
      { inquiryId: 'fresh', body: 'fresh 담당님 답변' },
    ];
    const { service, client, logs } = fakeDb(rows, replies);
    const ids = ['expired-closed', 'fresh', 'open', 'member', 'done', '00000000-0000-4000-8000-000000000000'];
    const result = await service.purge(opsAdmin, { scope: 'selected', inquiryIds: ids }, NOW);

    expect(result).toEqual({ purgedCount: 1, skippedCount: 5, inquiryIds: ['expired-closed'] });
    expect(client.v1Inquiry.updateMany.mock.calls[0][0].where.id).toEqual({ in: ['expired-closed'] });
    const purged = rows.find((row) => row.id === 'expired-closed')!;
    expect(purged).toMatchObject({
      guestEmail: null,
      guestPhone: null,
      contact: null,
      title: PURGED_INQUIRY_TEXT,
      body: PURGED_INQUIRY_TEXT,
      purgedAt: NOW,
      purgedByAdminUserId: 'admin-ops',
    });
    expect(JSON.stringify([purged, replies[0]])).not.toMatch(/expired-closed(@| 연합| 담당| 의)/);
    expect(replies).toEqual([
      { inquiryId: 'expired-closed', body: PURGED_INQUIRY_REPLY_TEXT },
      { inquiryId: 'fresh', body: 'fresh 담당님 답변' },
    ]);
    expect(rows.find((row) => row.id === 'fresh')!.guestEmail).toBe('fresh@example.test');
    expect(logs).toEqual([
      expect.objectContaining({ adminUserId: 'admin-ops', action: 'inquiry.guest_purge', targetType: 'inquiry', targetId: 'expired-closed' }),
    ]);
  });

  it('all: purges every current candidate and nothing else', async () => {
    const rows = mixed();
    const { service } = fakeDb(rows, []);
    const result = await service.purge(opsAdmin, { scope: 'all' }, NOW);
    expect(result.inquiryIds.sort()).toEqual(['expired-answered', 'expired-closed']);
    expect(rows.filter((row) => row.purgedAt === NOW).map((row) => row.id).sort()).toEqual(['expired-answered', 'expired-closed']);
    expect(rows.find((row) => row.id === 'member')!.guestEmail).toBe('member@example.test');
  });

  it('is idempotent — a second run finds nothing and writes nothing', async () => {
    const { service, client } = fakeDb(mixed(), []);
    await service.purge(opsAdmin, { scope: 'all' }, NOW);
    client.v1Inquiry.updateMany.mockClear();
    const again = await service.purge(opsAdmin, { scope: 'all' }, NOW);
    expect(again).toEqual({ purgedCount: 0, skippedCount: 0, inquiryIds: [] });
    expect(client.v1Inquiry.updateMany).not.toHaveBeenCalled();
  });

  it('reports only rows this call purged when a concurrent purge won some of them', async () => {
    const rows = mixed();
    const { service, client, logs } = fakeDb(rows, []);
    client.v1Inquiry.updateMany.mockImplementationOnce(async ({ data }: { data: Partial<Row> }) => {
      Object.assign(rows[1], { purgedAt: daysAgo(0), purgedByAdminUserId: 'someone-else' });
      Object.assign(rows[0], data);
      return { count: 1 };
    });
    client.v1Inquiry.findMany
      .mockImplementationOnce(async () => rows.map((row) => ({ ...row })))
      .mockImplementationOnce(async () => [{ ...rows[0] }]);
    const result = await service.purge(opsAdmin, { scope: 'all' }, NOW);
    expect(result.inquiryIds).toEqual(['expired-closed']);
    expect(client.v1Inquiry.findMany.mock.calls[1][0].where).toMatchObject({ purgedAt: NOW, purgedByAdminUserId: 'admin-ops' });
    expect(logs).toHaveLength(1);
  });

  it('lists the expiry each row actually has when its agreed period is shorter than the setting', async () => {
    const { service } = fakeDb([guestRow('short', { guestRetentionDays: 30, closedAt: daysAgo(40) })], [], 365);
    const result = await service.listCandidates(NOW);
    expect(result.items).toEqual([expect.objectContaining({ inquiryId: 'short', retentionExpiredAt: daysAgo(10).toISOString() })]);
  });

  it('also blanks the reply-edit audit previews, which copy the reply body', async () => {
    const replies = [{ id: 'r1', inquiryId: 'expired-closed', body: '홍길동 담당님께 안내드려요' }];
    const editLogs = [
      { id: 'l1', action: 'inquiry.reply.update', targetType: 'inquiry_reply', targetId: 'r1', beforeJson: { inquiryId: 'expired-closed', replyId: 'r1', bodyPreview: '홍길동 담당님' }, afterJson: { inquiryId: 'expired-closed', replyId: 'r1', bodyPreview: '홍길동 담당님께 안내드려요' } },
      { id: 'l2', action: 'inquiry.reply.update', targetType: 'inquiry_reply', targetId: 'r-fresh', beforeJson: { bodyPreview: '다른 문의' }, afterJson: { bodyPreview: '다른 문의 수정' } },
    ];
    const { service } = fakeDb(mixed(), replies, 365, editLogs);
    await service.purge(opsAdmin, { scope: 'selected', inquiryIds: ['expired-closed'] }, NOW);
    expect(JSON.stringify(editLogs[0])).not.toContain('홍길동');
    expect(editLogs[0].afterJson).toEqual({ inquiryId: 'expired-closed', replyId: 'r1', bodyPreview: PURGED_INQUIRY_REPLY_TEXT });
    expect(editLogs[1].afterJson).toEqual({ bodyPreview: '다른 문의 수정' });
  });

  it('rejects scope=all combined with explicit ids', async () => {
    const { service } = fakeDb(mixed(), []);
    await expect(service.purge(opsAdmin, { scope: 'all', inquiryIds: ['x'] }, NOW)).rejects.toBeInstanceOf(BadRequestException);
  });
});
