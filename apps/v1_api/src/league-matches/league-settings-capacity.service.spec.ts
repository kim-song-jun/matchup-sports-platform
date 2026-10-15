import { Test } from '@nestjs/testing';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { kindAwareFindFirst } from '../../test/helpers/kind-aware-find-first';
import { getLeagueSettings, updateLeagueSettings } from './league-settings';

const user = { id: 'capacity-admin', email: 'capacity@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const payload = {
  expectedUpdatedAt: '2026-10-15T00:00:00.000Z', title: '참가팀 정원 리그', rulesText: '', regionId: 'district',
  startsOn: '2098-01-01T00:00:00.000Z', endsOn: '2098-12-31T00:00:00.000Z',
  registrationDeadlineAt: null,
};

describe('MD-QA #145 — 실제 리그 설정 함수의 참가팀 정원', () => {
  async function setup() {
    let row = {
      id: 'league-1', kind: 'regular_league', title: payload.title, rulesText: null as string | null,
      regionId: payload.regionId, scheduledAt: new Date(payload.startsOn), scheduledEndAt: new Date(payload.endsOn),
      registrationDeadlineAt: null as Date | null, plannedFixtureCount: null as number | null,
      maxTeams: 4 as number | null, minPlayers: 1, maxPlayers: 20,
      updatedAt: new Date(payload.expectedUpdatedAt), status: 'draft', sport: { name: '풋살' },
    };
    const transaction = jest.fn();
    const db = {
      v1AdminUser: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', userId: user.id, status: 'active', adminRole: 'ops', user: { accountStatus: 'active' } }) },
      v1Tournament: {
        findFirst: jest.fn((args: { where?: Record<string, unknown> }) => kindAwareFindFirst(row)(args)),
        update: jest.fn(async ({ data }: { data: Partial<typeof row> }) => {
          row = { ...row, ...data, updatedAt: new Date('2026-10-15T00:01:00.000Z') };
          return row;
        }),
      },
      v1TournamentRegistration: { count: jest.fn().mockResolvedValue(3) },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      $queryRaw: jest.fn().mockResolvedValue([{ id: row.id }]),
      $transaction: transaction,
    };
    transaction.mockImplementation((operation: (tx: typeof db) => Promise<unknown>) => operation(db));
    const module = await Test.createTestingModule({ providers: [
      AdminContextService, { provide: PrismaService, useValue: db },
    ] }).compile();
    return { db, prisma: module.get(PrismaService), admins: module.get(AdminContextService), readRow: () => row };
  }

  it('GET은 저장된 참가팀 상한을 내려주고 선수 상한은 보존한다', async () => {
    // Given: independent team and player caps.
    const h = await setup();
    // When: the actual settings function reads this league.
    const result = await getLeagueSettings(h.prisma, h.admins, user, 'league-1');
    // Then: the client can hydrate the configured team cap.
    expect(result).toMatchObject({ maxTeams: 4 });
    expect(h.readRow().maxPlayers).toBe(20);
  });

  it('PATCH는 팀 정원과 감사 before/after를 저장하며 선수 정원을 바꾸지 않는다', async () => {
    // Given: three occupied places under a four-team limit.
    const h = await setup();
    const dto = { ...payload, maxTeams: 5 };
    // When: the real settings mutation raises the cap.
    const result = await updateLeagueSettings(h.prisma, h.admins, user, 'league-1', dto);
    // Then: persisted state, response and audit agree on the change.
    expect(h.readRow()).toMatchObject({ maxTeams: 5, minPlayers: 1, maxPlayers: 20 });
    expect(result).toMatchObject({ maxTeams: 5 });
    expect(h.db.v1AdminActionLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      beforeJson: expect.objectContaining({ maxTeams: 4 }), afterJson: expect.objectContaining({ maxTeams: 5 }),
    }) }));
  });

  it('현재 점유보다 낮은 팀 정원은 실제 오류이며 저장과 감사 로그를 남기지 않는다', async () => {
    // Given: three existing capacity reservations.
    const h = await setup();
    const dto = { ...payload, maxTeams: 2 };
    // When / Then: reducing below occupancy must reject atomically.
    await expect(updateLeagueSettings(h.prisma, h.admins, user, 'league-1', dto)).rejects.toMatchObject({ status: 409 });
    expect(h.readRow().maxTeams).toBe(4);
    expect(h.db.v1Tournament.update).not.toHaveBeenCalled();
    expect(h.db.v1AdminActionLog.create).not.toHaveBeenCalled();
  });

  it('null은 무제한으로 저장하고 응답과 감사에도 null을 남긴다', async () => {
    // Given: a finite team cap and an independent player limit.
    const h = await setup();
    const dto = { ...payload, maxTeams: null };
    // When: an operator explicitly removes the team cap.
    const result = await updateLeagueSettings(h.prisma, h.admins, user, 'league-1', dto);
    // Then: null is not converted to an old cap or a hidden default.
    expect(h.readRow()).toMatchObject({ maxTeams: null, maxPlayers: 20 });
    expect(result).toMatchObject({ maxTeams: null });
    expect(h.db.v1AdminActionLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      afterJson: expect.objectContaining({ maxTeams: null }),
    }) }));
  });

  it('이전 클라이언트가 maxTeams를 생략하면 기존 정원을 보존한다', async () => {
    // Given: an older settings client sends no capacity field.
    const h = await setup();
    // When: it changes an unrelated title through the actual mutation.
    await updateLeagueSettings(h.prisma, h.admins, user, 'league-1', { ...payload, title: '이름만 변경' });
    // Then: omission never removes the configured cap.
    expect(h.readRow()).toMatchObject({ title: '이름만 변경', maxTeams: 4, maxPlayers: 20 });
  });
});
