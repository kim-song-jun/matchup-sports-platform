import type { Prisma } from '@prisma/client';
import { fillLeagueTeamRoster, notifyLeagueRosterFillOutcomes } from './league-roster-autofill';

const MEMBERSHIPS = [
  { id: 'ms-2', userId: 'u2' },
  { id: 'ms-1', userId: 'u1' },
];
const eligibleUser = (seq: number) => ({
  phone: `0101176000${seq}`,
  phoneVerifiedAt: new Date('2026-08-01T00:00:00Z'),
  profile: { realName: `선수${seq}`, birthDate: '1995-01-01', gender: 'male' },
});

/** 잠금(`$queryRaw`)과 읽기·쓰기 순서를 기록하는 fake. */
function fakeTx(options: { stillEmpty: boolean; activeAfterLock?: readonly string[] }) {
  const calls: string[] = [];
  let membershipReads = 0;
  const tx = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const table = /FROM (v1_\w+)/.exec(strings.join('?'))?.[1];
      // `Prisma.join(ids)` 는 값 목록을 가진 Sql 조각으로 온다.
      const flat = values.flatMap((value) => (value instanceof Object && 'values' in value ? (value as { values: unknown[] }).values : [value]));
      calls.push(`lock:${table}:${flat.join(',')}`);
      return [];
    }),
    $executeRaw: jest.fn(async () => 1),
    v1TournamentRegistration: {
      findFirst: jest.fn(async () => {
        calls.push('recheck');
        return options.stillEmpty ? { id: 'reg-1' } : null;
      }),
    },
    v1Tournament: {
      findFirst: jest.fn(async () => ({ maxPlayers: 20, genderCategory: null, status: 'in_progress' })),
    },
    v1TeamMembership: {
      findMany: jest.fn(async ({ where }: { where: { id?: { in: string[] } } }) => {
        membershipReads += 1;
        calls.push(`members:${membershipReads}`);
        if (where.id === undefined) return MEMBERSHIPS;
        // 잠근 뒤 새 문장은 그 사이 커밋된 추방을 본다.
        const active = new Set(options.activeAfterLock ?? MEMBERSHIPS.map((row) => row.userId));
        return MEMBERSHIPS.filter((row) => where.id!.in.includes(row.id) && active.has(row.userId)).map((row, index) => ({
          userId: row.userId,
          user: eligibleUser(index + 1),
        }));
      }),
    },
    v1TournamentPlayer: {
      findMany: jest.fn(async () => []),
      createMany: jest.fn(async ({ data }: { data: unknown[] }) => {
        calls.push('insert');
        return { count: data.length };
      }),
    },
    v1Notification: { createMany: jest.fn() },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, calls, raw: tx };
}

describe('fillLeagueTeamRoster — 신청 → 계정 → 멤버십 순으로 잠근 뒤 채운다', () => {
  it('잠근 멤버십 중 잠근 뒤에도 활성인 사람만 넣는다 — 그 사이 추방된 사람은 명단에 남지 않는다', async () => {
    const { tx, calls, raw } = fakeTx({ stillEmpty: true, activeAfterLock: ['u1'] });
    const outcome = await fillLeagueTeamRoster(tx, 'league-1', { id: 'reg-1', teamId: 'team-A' });

    expect(calls).toEqual([
      'lock:v1_tournament_registrations:reg-1',
      'recheck',
      'members:1',
      'lock:v1_users:u2,u1',
      'lock:v1_team_memberships:ms-2,ms-1',
      'members:2',
      'insert',
    ]);
    expect(raw.v1TeamMembership.findMany.mock.calls[1][0]).toMatchObject({
      where: { teamId: 'team-A', status: 'active', id: { in: ['ms-2', 'ms-1'] } },
    });
    expect(raw.v1TournamentPlayer.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ registrationId: 'reg-1', userId: 'u1' }),
    ]);
    expect(outcome).toMatchObject({ kind: 'filled', added: 1 });
  });

  it('잠근 뒤 보니 행이 생겼으면(팀장이 먼저 첫 선수를 올림) 멤버십을 읽지도 넣지도 않고, 팀장에게 알리지 않는다', async () => {
    const { tx, calls, raw } = fakeTx({ stillEmpty: false });
    const outcome = await fillLeagueTeamRoster(tx, 'league-1', { id: 'reg-1', teamId: 'team-A' });

    expect(calls).toEqual(['lock:v1_tournament_registrations:reg-1', 'recheck']);
    expect(outcome).toMatchObject({ kind: 'skipped_not_empty', added: 0 });
    await notifyLeagueRosterFillOutcomes(tx, { id: 'league-1', title: '가을 리그' }, [outcome]);
    expect(raw.v1Notification.createMany).not.toHaveBeenCalled();
  });
});
