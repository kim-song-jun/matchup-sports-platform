import type { Prisma } from '@prisma/client';

/** Stateful scoped catalogue for tests that exercise real competition fixture creation. */
export function competitionFieldDelegate() {
  const rows: Array<{ id: string; tournamentId: string; name: string; scopeKey: string; active: boolean; placeSnapshot: Prisma.JsonValue | null }> = [];
  return {
    findMany: jest.fn(async ({ where }: { where: { tournamentId: string } }) => rows.filter((row) => row.tournamentId === where.tournamentId)),
    findFirst: jest.fn(async ({ where }: { where: { tournamentId: string; id: string } }) => rows.find((row) => row.tournamentId === where.tournamentId && row.id === where.id) ?? null),
    create: jest.fn(async ({ data }: { data: { tournamentId: string; name: string; scopeKey: string; placeSnapshot?: Prisma.JsonValue } }) => {
      const row = { ...data, id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, '0')}`, active: true, placeSnapshot: data.placeSnapshot ?? null };
      rows.push(row);
      return row;
    }),
  };
}
