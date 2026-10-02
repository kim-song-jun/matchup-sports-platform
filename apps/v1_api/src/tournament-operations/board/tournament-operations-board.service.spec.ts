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

type DetailsRow = { round: string; fixtureNumber: number; group: { name: string } | null };

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

function page(groupName: string | null) {
  return boardOver([
    teamMatchRow(GROUP_FIXTURE, { round: 'league_r2', fixtureNumber: 3, group: groupName === null ? null : { name: groupName } }),
    teamMatchRow(KNOCKOUT_FIXTURE, { round: 'semi', fixtureNumber: 9, group: null }),
  ]).list(tournamentId, { limit: 20 }, new Date('2026-10-02T00:00:00.000Z'));
}

function itemOf(snapshot: Awaited<ReturnType<typeof page>>, fixtureId: string) {
  const item = snapshot.items.find((candidate) => candidate.fixtureId === fixtureId);
  if (item === undefined) throw new Error(`${fixtureId} 가 보드에 없다`);
  return item;
}

describe('TournamentOperationsBoardService — 조 이름', () => {
  it('조에 속한 경기는 조 이름을, 조 없는 결선 경기는 null 을 싣는다', async () => {
    const snapshot = await page('A조');

    expect(itemOf(snapshot, GROUP_FIXTURE)).toMatchObject({ round: 'league_r2', groupName: 'A조' });
    expect(itemOf(snapshot, KNOCKOUT_FIXTURE)).toMatchObject({ round: 'semi', groupName: null });
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
