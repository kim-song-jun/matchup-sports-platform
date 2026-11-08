import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Stateful stand-in for the tables ad campaigns touch, for specs. It keeps real rows, evaluates the `where`
 * operators the ads services use (equality, not, in, lt/lte/gt/gte, contains, OR) against them, enforces the
 * (campaignId, channel, statDate) unique index, serialises transactions that take the same advisory lock, and
 * undoes the writes of a failed transaction — so a spec asserts on the resulting rows rather than on which
 * Prisma calls were made. An operator the fake does not know throws instead of silently matching nothing.
 */
export type FakeCampaign = {
  id: string;
  advertiserName: string;
  title: string;
  status: 'draft' | 'published' | 'stopped';
  version: number;
  bannerImageUrl: string | null;
  bannerAltText: string | null;
  bannerLinkUrl: string | null;
  bannerStartAt: Date | null;
  bannerEndAt: Date | null;
  popupImageUrl: string | null;
  popupAltText: string | null;
  popupLinkUrl: string | null;
  popupStartAt: Date | null;
  popupEndAt: Date | null;
  publishedAt: Date | null;
  stoppedAt: Date | null;
  createdByAdminUserId: string;
  updatedByAdminUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type FakeStat = {
  id: string;
  campaignId: string;
  channel: 'banner' | 'popup';
  statDate: Date;
  impressions: number;
  clicks: number;
  createdAt: Date;
  updatedAt: Date;
};

export type FakeAsset = {
  id: string;
  url: string;
  status: 'temporary' | 'attached';
  uploadedByAdminUserId: string;
  noticeId: string | null;
  popupId: string | null;
  adCampaignId: string | null;
  attachedAt: Date | null;
};

export type FakeAdmin = {
  id: string;
  userId: string;
  adminRole: 'owner' | 'ops' | 'support';
  status: 'active' | 'revoked' | 'suspended';
  nickname: string;
};

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const ordinal = (value: unknown) => (value instanceof Date ? value.getTime() : value);

function matchValue(actual: unknown, condition: unknown): boolean {
  if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
    return Object.entries(condition as Row).every(([operator, expected]) => {
      switch (operator) {
        case 'not':
          return !matchValue(actual, expected);
        case 'in':
          return (expected as unknown[]).some((candidate) => ordinal(candidate) === ordinal(actual));
        case 'lt':
          return actual != null && (ordinal(actual) as number) < (ordinal(expected) as number);
        case 'lte':
          return actual != null && (ordinal(actual) as number) <= (ordinal(expected) as number);
        case 'gt':
          return actual != null && (ordinal(actual) as number) > (ordinal(expected) as number);
        case 'gte':
          return actual != null && (ordinal(actual) as number) >= (ordinal(expected) as number);
        case 'contains':
          return typeof actual === 'string' && actual.toLowerCase().includes(String(expected).toLowerCase());
        case 'mode':
          return true;
        default:
          throw new Error(`ad-campaign-fake-prisma: unsupported operator "${operator}"`);
      }
    });
  }
  return ordinal(actual) === ordinal(condition);
}

function matchRow(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === 'OR') return (condition as Where[]).some((branch) => matchRow(row, branch));
    if (!(key in row)) throw new Error(`ad-campaign-fake-prisma: unknown column "${key}"`);
    return matchValue(row[key], condition);
  });
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === 'object' && !(value instanceof Date) && 'increment' in value) {
      row[key] = (row[key] as number) + (value as { increment: number }).increment;
    } else {
      row[key] = value;
    }
  }
}

function sortRows<T extends Row>(rows: T[], orderBy: Array<Record<string, 'asc' | 'desc'>> | undefined): T[] {
  if (!orderBy?.length) return [...rows];
  return [...rows].sort((a, b) => {
    for (const clause of orderBy) {
      const [[column, direction]] = Object.entries(clause);
      const left = ordinal(a[column]) as number | string;
      const right = ordinal(b[column]) as number | string;
      if (left === right) continue;
      if (left == null) return direction === 'asc' ? 1 : -1;
      if (right == null) return direction === 'asc' ? -1 : 1;
      return (left < right ? -1 : 1) * (direction === 'asc' ? 1 : -1);
    }
    return 0;
  });
}

export function createAdCampaignFakePrisma(seed: { admins: FakeAdmin[]; assets?: FakeAsset[]; campaigns?: FakeCampaign[] }) {
  const state = {
    admins: seed.admins,
    campaigns: seed.campaigns ?? ([] as FakeCampaign[]),
    stats: [] as FakeStat[],
    assets: seed.assets ?? ([] as FakeAsset[]),
    actionLogs: [] as Row[],
    statusLogs: [] as Row[],
  };
  let nextId = 1;
  const locks = new Map<string, Promise<void>>();
  const undoLog = new AsyncLocalStorage<Array<() => void>>();
  const recordUndo = (undo: () => void) => undoLog.getStore()?.push(undo);
  const snapshot = <T extends object>(rows: T[]) => {
    const before = rows.map((row) => ({ row, copy: { ...row } }));
    recordUndo(() => before.forEach(({ row, copy }) => Object.assign(row, copy)));
  };
  const tick = () => Promise.resolve();

  const withCreator = (row: FakeCampaign) => {
    const admin = state.admins.find((candidate) => candidate.id === row.createdByAdminUserId);
    return {
      ...row,
      createdByAdminUser: { id: row.createdByAdminUserId, user: { profile: { nickname: admin?.nickname ?? 'unknown', displayName: null } } },
    };
  };

  const v1AdCampaign = {
    create: jest.fn(async ({ data }: { data: Partial<FakeCampaign> }) => {
      await tick();
      const now = new Date();
      const row = {
        id: randomUUID(),
        status: 'draft',
        version: 1,
        bannerImageUrl: null, bannerAltText: null, bannerLinkUrl: null, bannerStartAt: null, bannerEndAt: null,
        popupImageUrl: null, popupAltText: null, popupLinkUrl: null, popupStartAt: null, popupEndAt: null,
        publishedAt: null, stoppedAt: null,
        createdAt: now, updatedAt: now,
        ...data,
      } as FakeCampaign;
      state.campaigns.push(row);
      recordUndo(() => state.campaigns.splice(state.campaigns.indexOf(row), 1));
      return withCreator(row);
    }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      await tick();
      const row = state.campaigns.find((candidate) => candidate.id === where.id);
      return row ? withCreator(row) : null;
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
      await tick();
      const row = state.campaigns.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error('ad-campaign-fake-prisma: findUniqueOrThrow found nothing');
      return withCreator(row);
    }),
    findFirst: jest.fn(async ({ where, orderBy }: { where?: Where; orderBy?: Array<Record<string, 'asc' | 'desc'>> }) => {
      await tick();
      const rows = sortRows(state.campaigns.filter((row) => matchRow(row, where)), orderBy);
      return rows[0] ? { ...rows[0] } : null;
    }),
    findMany: jest.fn(
      async ({ where, orderBy, take, skip, cursor }: {
        where?: Where; orderBy?: Array<Record<string, 'asc' | 'desc'>>; take?: number; skip?: number; cursor?: { id: string };
      }) => {
        await tick();
        let rows = sortRows(state.campaigns.filter((row) => matchRow(row, where)), orderBy);
        if (cursor) rows = rows.slice(rows.findIndex((row) => row.id === cursor.id));
        rows = rows.slice(skip ?? 0);
        if (take !== undefined) rows = rows.slice(0, take);
        return rows.map(withCreator);
      },
    ),
    updateMany: jest.fn(async ({ where, data }: { where: Where; data: Row }) => {
      await tick();
      const rows = state.campaigns.filter((row) => matchRow(row, where));
      snapshot(rows);
      rows.forEach((row) => {
        applyData(row, data);
        row.updatedAt = new Date();
      });
      return { count: rows.length };
    }),
    groupBy: jest.fn(async ({ where }: { by: string[]; where?: Where }) => {
      await tick();
      const counts = new Map<string, number>();
      state.campaigns.filter((row) => matchRow(row, where)).forEach((row) => counts.set(row.status, (counts.get(row.status) ?? 0) + 1));
      return [...counts].map(([status, count]) => ({ status, _count: { _all: count } }));
    }),
  };

  const statKey = (campaignId: string, channel: string, statDate: Date) => `${campaignId}|${channel}|${statDate.getTime()}`;
  const v1AdCampaignDailyStat = {
    upsert: jest.fn(
      async ({ where, create, update }: {
        where: { campaignId_channel_statDate: { campaignId: string; channel: 'banner' | 'popup'; statDate: Date } };
        create: Partial<FakeStat>; update: Row;
      }) => {
        await tick();
        const key = where.campaignId_channel_statDate;
        const existing = state.stats.find((row) => statKey(row.campaignId, row.channel, row.statDate) === statKey(key.campaignId, key.channel, key.statDate));
        if (existing) {
          snapshot([existing]);
          applyData(existing, update);
          existing.updatedAt = new Date();
          return { ...existing };
        }
        const now = new Date();
        const row = { id: `stat-${nextId++}`, impressions: 0, clicks: 0, createdAt: now, updatedAt: now, ...create } as FakeStat;
        state.stats.push(row);
        recordUndo(() => state.stats.splice(state.stats.indexOf(row), 1));
        return { ...row };
      },
    ),
    findMany: jest.fn(async ({ where, orderBy }: { where?: Where; orderBy?: Array<Record<string, 'asc' | 'desc'>> }) => {
      await tick();
      return sortRows(state.stats.filter((row) => matchRow(row, where)), orderBy).map((row) => ({ ...row }));
    }),
    groupBy: jest.fn(async ({ where }: { by: string[]; where?: Where }) => {
      await tick();
      const sums = new Map<string, { campaignId: string; channel: string; impressions: number; clicks: number }>();
      state.stats.filter((row) => matchRow(row, where)).forEach((row) => {
        const key = `${row.campaignId}|${row.channel}`;
        const sum = sums.get(key) ?? { campaignId: row.campaignId, channel: row.channel, impressions: 0, clicks: 0 };
        sum.impressions += row.impressions;
        sum.clicks += row.clicks;
        sums.set(key, sum);
      });
      return [...sums.values()].map((sum) => ({
        campaignId: sum.campaignId, channel: sum.channel, _sum: { impressions: sum.impressions, clicks: sum.clicks },
      }));
    }),
  };

  const v1ContentAsset = {
    findMany: jest.fn(async ({ where }: { where?: Where }) => {
      await tick();
      return state.assets.filter((row) => matchRow(row, where)).map((row) => ({ ...row }));
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Where; data: Row }) => {
      await tick();
      const rows = state.assets.filter((row) => matchRow(row, where));
      snapshot(rows);
      rows.forEach((row) => applyData(row, data));
      return { count: rows.length };
    }),
    deleteMany: jest.fn(async ({ where }: { where: Where }) => {
      await tick();
      const rows = state.assets.filter((row) => matchRow(row, where));
      rows.forEach((row) => state.assets.splice(state.assets.indexOf(row), 1));
      recordUndo(() => state.assets.push(...rows));
      return { count: rows.length };
    }),
  };

  const v1AdminUser = {
    findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => {
      await tick();
      const admin = state.admins.find((row) => row.userId === where.userId);
      return admin
        ? { id: admin.id, userId: admin.userId, adminRole: admin.adminRole, status: admin.status, user: { accountStatus: 'active' } }
        : null;
    }),
  };

  const v1AdminActionLog = {
    create: jest.fn(async ({ data }: { data: Row }) => {
      await tick();
      const row = { id: `action-${nextId++}`, ...data };
      state.actionLogs.push(row);
      recordUndo(() => state.actionLogs.splice(state.actionLogs.indexOf(row), 1));
      return row;
    }),
  };
  const v1StatusChangeLog = {
    create: jest.fn(async ({ data }: { data: Row }) => {
      await tick();
      const row = { id: `status-${nextId++}`, ...data };
      state.statusLogs.push(row);
      recordUndo(() => state.statusLogs.splice(state.statusLogs.indexOf(row), 1));
      return row;
    }),
  };

  const client = { v1AdCampaign, v1AdCampaignDailyStat, v1ContentAsset, v1AdminUser, v1AdminActionLog, v1StatusChangeLog };

  async function acquire(scope: string, held: Array<() => void>) {
    const previous = locks.get(scope) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => (release = resolve));
    locks.set(scope, previous.then(() => mine));
    held.push(release);
    await previous;
  }

  const prisma = {
    ...client,
    $transaction: jest.fn(async (run: ((tx: unknown) => Promise<unknown>) | Array<Promise<unknown>>) => {
      if (Array.isArray(run)) return Promise.all(run);
      const held: Array<() => void> = [];
      const undo: Array<() => void> = [];
      const tx = {
        ...client,
        $executeRaw: jest.fn(async (_strings: TemplateStringsArray, scope: string) => {
          await acquire(scope, held);
          return 1;
        }),
      };
      try {
        return await undoLog.run(undo, () => run(tx));
      } catch (error) {
        undo.reverse().forEach((revert) => revert());
        throw error;
      } finally {
        held.forEach((release) => release());
      }
    }),
  };

  return { prisma, state };
}
