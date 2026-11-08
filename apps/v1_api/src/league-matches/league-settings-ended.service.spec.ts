import { Test } from '@nestjs/testing';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { kindAwareFindFirst } from '../../test/helpers/kind-aware-find-first';
import { updateLeagueSettings } from './league-settings';

const user = { id: 'ended-admin', email: 'ended@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const base = {
  expectedUpdatedAt: '2026-10-15T00:00:00.000Z', title: '끝난 리그', rulesText: '기존 안내', regionId: 'district-a',
  startsOn: '2098-01-01T00:00:00.000Z', endsOn: '2098-12-31T00:00:00.000Z', registrationDeadlineAt: '2097-12-01T00:00:00.000Z',
};

async function setup(status: string) {
  let row = {
    id: 'league-1', kind: 'regular_league', title: base.title, rulesText: base.rulesText as string | null,
    regionId: base.regionId, scheduledAt: new Date(base.startsOn), scheduledEndAt: new Date(base.endsOn),
    registrationDeadlineAt: new Date(base.registrationDeadlineAt) as Date | null, plannedFixtureCount: 10 as number | null,
    maxTeams: 8 as number | null, genderCategory: 'mixed' as string | null,
    updatedAt: new Date(base.expectedUpdatedAt), status, sport: { name: '풋살' },
  };
  const db = {
    v1AdminUser: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', userId: user.id, status: 'active', adminRole: 'ops', user: { accountStatus: 'active' } }) },
    v1Tournament: {
      findFirst: jest.fn((args: { where?: Record<string, unknown> }) => kindAwareFindFirst(row)(args)),
      update: jest.fn(async ({ data }: { data: Partial<typeof row> }) => {
        row = { ...row, ...data, updatedAt: new Date('2026-10-15T00:01:00.000Z') };
        return row;
      }),
    },
    v1Region: { findFirst: jest.fn().mockResolvedValue({ id: 'district-b' }) },
    v1TournamentRegistration: { count: jest.fn().mockResolvedValue(3) },
    v1TeamMatch: { count: jest.fn().mockResolvedValue(0) },
    v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: row.id }]),
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((operation: (tx: typeof db) => Promise<unknown>) => operation(db));
  const module = await Test.createTestingModule({ providers: [AdminContextService, { provide: PrismaService, useValue: db }] }).compile();
  return { db, prisma: module.get(PrismaService), admins: module.get(AdminContextService), readRow: () => row };
}

describe.each(['completed', 'cancelled'])('끝난 리그(%s)의 기본 정보 수정', (status) => {
  it('이름·설명·지역은 저장하고 감사 로그에 before/after 를 남긴다', async () => {
    const h = await setup(status);
    const result = await updateLeagueSettings(h.prisma, h.admins, user, 'league-1',
      { ...base, title: '오타를 고친 리그', rulesText: '보강한 안내', regionId: 'district-b' });
    expect(result).toMatchObject({ title: '오타를 고친 리그', rulesText: '보강한 안내', regionId: 'district-b', status });
    expect(h.readRow()).toMatchObject({ title: '오타를 고친 리그', regionId: 'district-b', plannedFixtureCount: 10, maxTeams: 8 });
    expect(h.db.v1AdminActionLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      beforeJson: expect.objectContaining({ title: '끝난 리그', regionId: 'district-a' }),
      afterJson: expect.objectContaining({ title: '오타를 고친 리그', regionId: 'district-b' }),
    }) }));
  });

  it('바뀌지 않은 값을 그대로 보낸 저장은 잠긴 필드를 건드리지 않는다', async () => {
    const h = await setup(status);
    await updateLeagueSettings(h.prisma, h.admins, user, 'league-1',
      { ...base, title: '이름만 변경', plannedFixtureCount: 10, maxTeams: 8, genderCategory: 'mixed' as const });
    expect(h.readRow()).toMatchObject({ title: '이름만 변경', maxTeams: 8, plannedFixtureCount: 10, genderCategory: 'mixed' });
  });

  it.each([
    ['startsOn', { startsOn: '2098-02-01T00:00:00.000Z' }],
    ['endsOn', { endsOn: '2099-01-31T00:00:00.000Z' }],
    ['registrationDeadlineAt', { registrationDeadlineAt: '2098-06-01T00:00:00.000Z' }],
    ['registrationDeadlineAt', { registrationDeadlineAt: null }],
    ['plannedFixtureCount', { plannedFixtureCount: 12 }],
    ['plannedFixtureCount', { plannedFixtureCount: null }],
    ['maxTeams', { maxTeams: 16 }],
    ['maxTeams', { maxTeams: null }],
    ['genderCategory', { genderCategory: 'female' as const }],
  ])('%s 를 바꾼 저장은 LEAGUE_ENDED_FIELD_LOCKED 로 거절하고 아무것도 남기지 않는다', async (field, changes) => {
    const h = await setup(status);
    await expect(updateLeagueSettings(h.prisma, h.admins, user, 'league-1', { ...base, title: '저장되면 안 됨', ...changes }))
      .rejects.toMatchObject({ status: 409, response: { code: 'LEAGUE_ENDED_FIELD_LOCKED', details: { fields: [field] } } });
    expect(h.readRow().title).toBe('끝난 리그');
    expect(h.db.v1Tournament.update).not.toHaveBeenCalled();
    expect(h.db.v1AdminActionLog.create).not.toHaveBeenCalled();
  });

  it('이전 화면의 저장은 잠금 판정보다 먼저 LEAGUE_SETTINGS_STALE 로 거절한다', async () => {
    const h = await setup(status);
    await expect(updateLeagueSettings(h.prisma, h.admins, user, 'league-1', { ...base, expectedUpdatedAt: '2026-10-14T00:00:00.000Z' }))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_SETTINGS_STALE' } });
  });
});

describe('끝나지 않은 리그 대조군', () => {
  it('진행 중 리그는 기간·정원도 그대로 바꿀 수 있다', async () => {
    const h = await setup('active');
    await updateLeagueSettings(h.prisma, h.admins, user, 'league-1',
      { ...base, endsOn: '2099-01-31T00:00:00.000Z', registrationDeadlineAt: null, maxTeams: 16, plannedFixtureCount: 12 });
    expect(h.readRow()).toMatchObject({ maxTeams: 16, plannedFixtureCount: 12, registrationDeadlineAt: null });
  });
});
