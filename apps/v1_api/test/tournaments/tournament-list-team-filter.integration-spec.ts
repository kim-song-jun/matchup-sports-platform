import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentsReadService } from '../../src/tournaments/tournaments-read.service';
import type { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';

/**
 * 공개 대회 목록의 `teamId` 필터(팀 상세 "참가 중인 경기 > 대회" 탭) — 실제 DB 로 잰다.
 * 그 팀이 **참가 확정(`confirmed`)** 된 대회만 고르고, 신청 중·대기·취소 신청은 담지 않는다. 공개 표면 조건
 * (비공개·초안·취소 숨김)은 필터와 무관하게 그대로다. 건수(`withTotal`)도 같은 조건으로 센다.
 */
describe('대회 공개 목록 teamId 필터 (real DB)', () => {
  const prisma = new PrismaService();
  const read = new TournamentsReadService(prisma, {} as TournamentStaffAccessService);
  const sportId = randomUUID();
  const regionId = randomUUID();
  const userId = randomUUID();
  const teamId = randomUUID();
  const otherTeamId = randomUUID();
  const ids = Object.fromEntries(
    ['confirmed', 'submitted', 'waitlisted', 'cancelled', 'otherTeam', 'privateConfirmed', 'cancelledTournament', 'league'].map((key) => [key, randomUUID()]),
  ) as Record<'confirmed' | 'submitted' | 'waitlisted' | 'cancelled' | 'otherTeam' | 'privateConfirmed' | 'cancelledTournament' | 'league', string>;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.v1Sport.create({ data: { id: sportId, code: `team-filter-${sportId}`, name: '팀 필터 검증 종목' } });
    await prisma.v1Region.create({ data: { id: regionId, code: `team-filter-${regionId}`, name: '팀 필터 검증 지역', level: 1 } });
    await prisma.v1User.create({ data: { id: userId, email: `team-filter-${userId}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
    await prisma.v1Team.createMany({ data: [
      { id: teamId, ownerUserId: userId, sportId, regionId, name: '팀 필터 검증 팀' },
      { id: otherTeamId, ownerUserId: userId, sportId, regionId, name: '팀 필터 다른 팀' },
    ] });
    const base = { sportId, teamCount: 8, scheduledAt: new Date('2099-10-01T00:00:00Z'), kind: 'regular_tournament' as const, status: 'open' as const };
    await prisma.v1Tournament.createMany({ data: [
      { ...base, id: ids.confirmed, title: '확정 참가' },
      { ...base, id: ids.submitted, title: '신청만 함' },
      { ...base, id: ids.waitlisted, title: '대기' },
      { ...base, id: ids.cancelled, title: '신청 취소' },
      { ...base, id: ids.otherTeam, title: '다른 팀 확정' },
      { ...base, id: ids.privateConfirmed, title: '비공개 대회 확정', isPublic: false },
      { ...base, id: ids.cancelledTournament, title: '취소된 대회 확정', status: 'cancelled' },
      { ...base, id: ids.league, title: '리그 확정', kind: 'regular_league', status: 'in_progress' },
    ] });
    const registration = (tournamentId: string, status: 'confirmed' | 'submitted' | 'waitlisted' | 'cancelled', team = teamId) =>
      ({ tournamentId, teamId: team, appliedByUserId: userId, status });
    await prisma.v1TournamentRegistration.createMany({ data: [
      registration(ids.confirmed, 'confirmed'),
      registration(ids.submitted, 'submitted'),
      registration(ids.waitlisted, 'waitlisted'),
      registration(ids.cancelled, 'cancelled'),
      registration(ids.otherTeam, 'confirmed', otherTeamId),
      registration(ids.privateConfirmed, 'confirmed'),
      registration(ids.cancelledTournament, 'confirmed'),
      registration(ids.league, 'confirmed'),
    ] });
  });

  afterAll(async () => {
    await prisma.v1TournamentRegistration.deleteMany({ where: { tournamentId: { in: Object.values(ids) } } });
    await prisma.v1Tournament.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.v1Team.deleteMany({ where: { id: { in: [teamId, otherTeamId] } } });
    await prisma.v1User.deleteMany({ where: { id: userId } });
    await prisma.v1Region.deleteMany({ where: { id: regionId } });
    await prisma.v1Sport.deleteMany({ where: { id: sportId } });
    await prisma.$disconnect();
  });

  it('그 팀이 참가 확정된 공개 대회만 — 신청 중·대기·취소 신청, 다른 팀, 비공개·취소된 대회는 빠진다', async () => {
    const result = await read.list({ kind: 'tournament', sportId, teamId, withTotal: 'true' });
    expect(result.items.map((item) => item.id)).toEqual([ids.confirmed]);
    // 건수도 같은 조건으로 센다.
    expect(result.pageInfo.total).toBe(1);
  });

  it('종류 필터와 함께 걸린다 — 리그 표면이면 확정 참가한 리그만', async () => {
    const leagues = await read.list({ kind: 'league', sportId, teamId });
    expect(leagues.items.map((item) => item.id)).toEqual([ids.league]);
    const all = await read.list({ kind: 'all', sportId, teamId });
    expect(all.items.map((item) => item.id).sort()).toEqual([ids.confirmed, ids.league].sort());
  });

  it('teamId 가 없으면 지금처럼 걸러 내지 않는다', async () => {
    const result = await read.list({ kind: 'tournament', sportId });
    expect(result.items.map((item) => item.id).sort()).toEqual(
      [ids.confirmed, ids.submitted, ids.waitlisted, ids.cancelled, ids.otherTeam].sort(),
    );
  });
});
