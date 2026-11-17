import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { ScheduleTimesService } from '../../src/tournaments/scheduling/schedule-times.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedSupportAdmin } from '../helpers/bracket-canvas-fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'schedule-time@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const service = new ScheduleTimesService(prisma, new AdminContextService(prisma));

describe('대진 시간 목록 (PostgreSQL)', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });
  it('동시 중복 등록을 1행·1감사로 저장하고 대회 격리와 support 쓰기 차단을 유지한다', async () => {
    const tournament = await prisma.v1Tournament.create({ data: { sportId: ids.soccerSportId, title: '시간 목록 검증', format: 'league_knockouts' } });
    const other = await prisma.v1Tournament.create({ data: { sportId: ids.soccerSportId, title: '다른 시간 목록 검증', format: 'league_knockouts' } });
    const [first, replay] = await Promise.all([
      service.create(user, tournament.id, { scheduledAt: '2026-11-21T10:00:00+09:00' }),
      service.create(user, tournament.id, { scheduledAt: '2026-11-21T01:00:00Z' }),
    ]);
    expect(first.item.id).toBe(replay.item.id);
    expect(await prisma.v1TournamentScheduleTime.count({ where: { tournamentId: tournament.id } })).toBe(1);
    expect(await prisma.v1AdminActionLog.count({ where: { targetId: tournament.id, action: 'tournament.schedule_time.create' } })).toBe(1);
    expect((await service.list(user, tournament.id)).items[0].scheduledAt.toISOString()).toBe('2026-11-21T01:00:00.000Z');
    expect((await service.list(user, other.id)).items).toEqual([]);
    const support = await seedSupportAdmin(prisma, 'schedule-time-support');
    expect((await service.list(support, tournament.id)).items).toHaveLength(1);
    await expect(service.create(support, tournament.id, { scheduledAt: '2026-11-21T02:00:00Z' })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(await prisma.v1TournamentScheduleTime.count({ where: { tournamentId: tournament.id } })).toBe(1);
    await prisma.v1Tournament.delete({ where: { id: tournament.id } });
    expect(await prisma.v1TournamentScheduleTime.count({ where: { tournamentId: tournament.id } })).toBe(0);
  });
});
