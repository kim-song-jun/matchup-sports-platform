import type { PrismaService } from '../../prisma/prisma.service';
import { TournamentOperationsBoardService } from './tournament-operations-board.service';

const tournamentId = '00000000-0000-4000-8000-000000000001';

/** Prisma `select` 처럼 고른 키만 돌려준다 — 서비스가 select 에서 `group` 을 빠뜨리면 결과에서도 빠진다. */
function pick(select: Record<string, unknown>, value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(select)) {
    if (!(key in value)) continue;
    const field = value[key];
    const nested = typeof spec === 'object' && spec !== null && 'select' in spec
      ? (spec as { select: Record<string, unknown> }).select
      : null;
    out[key] = nested !== null && field !== null && typeof field === 'object' && !(field instanceof Date)
      ? pick(nested, field as Record<string, unknown>)
      : field;
  }
  return out;
}

type DetailsRow = { round: string; fixtureNumber: number; legNumber: number; group: { name: string } | null; displayTitle?: string | null };

function teamMatchRow(id: string, details: DetailsRow) {
  return {
    id,
    tournamentId,
    fieldId: 'field-1',
    startAt: null,
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    field: { name: '1구장', version: 0 },
    tournamentDetails: { ...details, homeRegistrationId: null, awayRegistrationId: null },
    game: null,
  };
}

function boardOver(rows: ReturnType<typeof teamMatchRow>[]) {
  const tx = {
    v1Tournament: { findFirst: jest.fn().mockResolvedValue({ kind: 'regular_tournament' }) },
    v1TeamMatch: {
      findMany: jest.fn(async ({ select }: { select: Record<string, unknown> }) => rows.map((row) => pick(select, row))),
    },
    v1TournamentStaffAssignment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) };
  return new TournamentOperationsBoardService(prisma as unknown as PrismaService);
}

const GROUP_FIXTURE = 'fx-group';
const KNOCKOUT_FIXTURE = 'fx-knockout';

function page(groupName: string | null, knockoutLeg = 1) {
  return boardOver([
    teamMatchRow(GROUP_FIXTURE, { round: 'league_r2', fixtureNumber: 3, legNumber: 1, group: groupName === null ? null : { name: groupName } }),
    teamMatchRow(KNOCKOUT_FIXTURE, { round: 'semi', fixtureNumber: 9, legNumber: knockoutLeg, group: null }),
  ]).list(tournamentId, { limit: 20 }, new Date('2026-10-02T00:00:00.000Z'));
}

function itemOf(snapshot: Awaited<ReturnType<typeof page>>, fixtureId: string) {
  const item = snapshot.items.find((candidate) => candidate.fixtureId === fixtureId);
  if (item === undefined) throw new Error(`${fixtureId} 가 보드에 없다`);
  return item;
}

describe('TournamentOperationsBoardService — 조 이름·차수', () => {
  it('조에 속한 경기는 조 이름을, 조 없는 결선 경기는 null 을 싣는다', async () => {
    const snapshot = await page('A조');

    expect(itemOf(snapshot, GROUP_FIXTURE)).toMatchObject({ round: 'league_r2', groupName: 'A조' });
    expect(itemOf(snapshot, KNOCKOUT_FIXTURE)).toMatchObject({ round: 'semi', groupName: null });
  });

  it('운영자가 정한 경기 제목(displayTitle)을 싣고, 없으면 null 이며, 제목만 바뀌어도 그 경기의 stableRevision 이 움직인다', async () => {
    const withTitle = (displayTitle: string | null) => boardOver([
      teamMatchRow(GROUP_FIXTURE, { round: 'league_r2', fixtureNumber: 3, legNumber: 1, group: { name: 'A조' }, displayTitle }),
      teamMatchRow(KNOCKOUT_FIXTURE, { round: 'semi', fixtureNumber: 9, legNumber: 1, group: null }),
    ]).list(tournamentId, { limit: 20 }, new Date('2026-10-02T00:00:00.000Z'));

    const untitled = await withTitle(null);
    const titled = await withTitle('풀리그 1라운드');

    expect(itemOf(untitled, GROUP_FIXTURE).displayTitle).toBeNull();
    expect(itemOf(titled, GROUP_FIXTURE).displayTitle).toBe('풀리그 1라운드');
    expect(itemOf(titled, KNOCKOUT_FIXTURE).displayTitle).toBeNull();
    expect(itemOf(titled, GROUP_FIXTURE).stableRevision).not.toBe(itemOf(untitled, GROUP_FIXTURE).stableRevision);
    expect(itemOf(titled, KNOCKOUT_FIXTURE).stableRevision).toBe(itemOf(untitled, KNOCKOUT_FIXTURE).stableRevision);
  });

  it('차수를 싣고, 차수만 바뀌어도 그 경기의 stableRevision 이 움직인다', async () => {
    const firstLeg = await page('A조', 1);
    const secondLeg = await page('A조', 2);

    expect(itemOf(firstLeg, KNOCKOUT_FIXTURE).legNumber).toBe(1);
    expect(itemOf(secondLeg, KNOCKOUT_FIXTURE).legNumber).toBe(2);
    expect(itemOf(secondLeg, KNOCKOUT_FIXTURE).stableRevision).not.toBe(itemOf(firstLeg, KNOCKOUT_FIXTURE).stableRevision);
    expect(itemOf(secondLeg, GROUP_FIXTURE).stableRevision).toBe(itemOf(firstLeg, GROUP_FIXTURE).stableRevision);
  });

  it('조 이름만 바뀌어도 그 경기의 stableRevision 과 watermark 가 움직인다', async () => {
    const before = await page('A조');
    const unchanged = await page('A조');
    const renamed = await page('B조');
    const ungrouped = await page(null);

    // 같은 입력이면 같은 해시 — 아래 차이가 무작위가 아니라 조 이름 때문임을 고정한다.
    expect(itemOf(unchanged, GROUP_FIXTURE).stableRevision).toBe(itemOf(before, GROUP_FIXTURE).stableRevision);
    expect(unchanged.watermark).toBe(before.watermark);

    expect(itemOf(renamed, GROUP_FIXTURE).stableRevision).not.toBe(itemOf(before, GROUP_FIXTURE).stableRevision);
    expect(itemOf(ungrouped, GROUP_FIXTURE).stableRevision).not.toBe(itemOf(before, GROUP_FIXTURE).stableRevision);
    expect(renamed.watermark).not.toBe(before.watermark);
    // 조와 무관한 경기의 키는 그대로다.
    expect(itemOf(renamed, KNOCKOUT_FIXTURE).stableRevision).toBe(itemOf(before, KNOCKOUT_FIXTURE).stableRevision);
  });
});

// 운영 보드는 경기 번호 → 차수(1차전 → 2차전) 순이다. 라운드 이름은 문자열이라(`4강` < `league_r1` < `결승`) 번호와 어긋나 11·12번이 맨 위에 나왔다.
describe('TournamentOperationsBoardService — 경기 번호 순 정렬·커서', () => {
  function capture(rows: ReturnType<typeof teamMatchRow>[]) {
    const findMany = jest.fn(async ({ select }: { select: Record<string, unknown> }) => rows.map((row) => pick(select, row)));
    const tx = {
      v1Tournament: { findFirst: jest.fn().mockResolvedValue({ kind: 'regular_tournament' }) },
      v1TeamMatch: { findMany },
      v1TournamentStaffAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) };
    return { service: new TournamentOperationsBoardService(prisma as unknown as PrismaService), findMany };
  }

  const now = new Date('2026-10-02T00:00:00.000Z');
  // DB 가 (경기 번호, id) 순으로 준 행을 흉내 낸다 — 라운드 이름 순이었다면 `semi` 가 먼저였다. mock 은 orderBy 를 적용하지 않으므로 순서를 직접 맞춘다.
  const twoRows = () => [
    teamMatchRow('fx-b', { round: 'league_r1', fixtureNumber: 2, legNumber: 1, group: null }),
    teamMatchRow('fx-a', { round: 'semi', fixtureNumber: 11, legNumber: 1, group: null }),
  ];
  const decode = (cursor: string | null) => JSON.parse(Buffer.from(cursor ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;

  it('경기 번호, 차수, id 순으로 정렬하고 라운드 이름으로는 정렬하지 않는다', async () => {
    const { service, findMany } = capture(twoRows());

    await service.list(tournamentId, { limit: 20 }, now);

    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { tournamentDetails: { fixtureNumber: 'asc' } },
      { tournamentDetails: { legNumber: 'asc' } },
      { id: 'asc' },
    ]);
  });

  it('다음 페이지 커서는 (경기 번호, 차수, id)만 싣는다 — 라운드는 싣지 않는다', async () => {
    const { service } = capture(twoRows());

    const page = await service.list(tournamentId, { limit: 1 }, now);

    expect(decode(page.nextCursor)).toEqual({ kind: 'fixture', tournamentId, fixtureNumber: 2, legNumber: 1, id: 'fx-b' });
  });

  it('커서 다음 페이지는 번호가 더 큰 경기, 같은 번호의 더 큰 차수, 같은 번호·차수의 더 큰 id 만 찾는다', async () => {
    const { service, findMany } = capture(twoRows());
    const cursor = Buffer.from(JSON.stringify({ kind: 'fixture', tournamentId, fixtureNumber: 5, legNumber: 1, id: 'fx-5' }), 'utf8').toString('base64url');

    await service.list(tournamentId, { limit: 20, cursor }, now);

    expect(findMany.mock.calls[0][0].where).toMatchObject({
      OR: [
        { tournamentDetails: { is: { fixtureNumber: { gt: 5 } } } },
        { tournamentDetails: { is: { fixtureNumber: 5, legNumber: { gt: 1 } } } },
        { tournamentDetails: { is: { fixtureNumber: 5, legNumber: 1 } }, id: { gt: 'fx-5' } },
      ],
    });
  });

  it('옛 커서(round 를 싣고 차수가 없음)도 빈 페이지가 되지 않고 (경기 번호, id)로 이어진다', async () => {
    const { service, findMany } = capture(twoRows());
    const legacy = Buffer.from(JSON.stringify({ kind: 'fixture', tournamentId, round: 'league_r2', fixtureNumber: 7, id: 'fx-7' }), 'utf8').toString('base64url');

    const page = await service.list(tournamentId, { limit: 20, cursor: legacy }, now);

    expect(page.items.length).toBeGreaterThan(0);
    const where = JSON.stringify(findMany.mock.calls[0][0].where);
    expect(where).toContain('"fixtureNumber":{"gt":7}');
    expect(where).not.toContain('league_r2');
  });
});
