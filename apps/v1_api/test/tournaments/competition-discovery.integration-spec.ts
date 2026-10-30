import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentsReadService } from '../../src/tournaments/tournaments-read.service';
import { kstDayRange } from '../../src/common/pagination/list-facets';
import type { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';

/** 실제 DB에서 공개 범위·정원 점유·페이지네이션 전 필터를 검증한다. */
describe('대회·리그 탐색 (real DB)', () => {
  const prisma = new PrismaService();
  const sportId = randomUUID();
  const regionId = randomUUID();
  const userId = randomUUID();
  const teamId = randomUUID();
  const ids = Object.fromEntries(['available', 'full', 'expired', 'hidden', 'cancelled', 'draftLeague', 'openLeague', 'closedLeague', 'activeLeague', 'finishedLeague', 'heldLeague', 'private', 'noDeadlineLeague', 'fullLeague'].map((key) => [key, randomUUID()]));
  const read = new TournamentsReadService(prisma, {} as TournamentStaffAccessService);
  const future = new Date('2099-11-20T00:00:00Z');
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.v1Sport.create({ data: { id: sportId, code: `discovery-${sportId}`, name: '필터 검증 종목' } });
    await prisma.v1Region.create({ data: { id: regionId, code: `discovery-${regionId}`, name: '필터 검증 지역', level: 1 } });
    await prisma.v1User.create({ data: { id: userId, email: `discovery-${userId}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
    await prisma.v1Team.create({ data: { id: teamId, ownerUserId: userId, sportId, regionId, name: '필터 검증 팀' } });
    const base = { sportId, teamCount: 1, genderCategory: 'mixed' as const, format: 'knockout' as const, scheduledAt: new Date('2099-10-01T00:00:00Z'), scheduledEndAt: new Date('2099-12-01T00:00:00Z'), registrationDeadlineAt: future };
    await prisma.v1Tournament.createMany({ data: [
      { ...base, id: ids.available, title: '접수 가능', kind: 'regular_tournament', status: 'open', entryFee: 0 },
      { ...base, id: ids.full, title: '입금 대기 정원 마감', kind: 'regular_tournament', status: 'open' },
      { ...base, id: ids.expired, title: '기한 마감', kind: 'regular_tournament', status: 'open', registrationDeadlineAt: new Date('2000-01-01') },
      { ...base, id: ids.hidden, title: '비공개', kind: 'regular_tournament', status: 'draft' },
      { ...base, id: ids.noDeadlineLeague, title: '접수 안 함', kind: 'regular_league', status: 'draft', registrationDeadlineAt: null },
      { ...base, id: ids.fullLeague, title: '리그 선택 정원 마감', kind: 'regular_league', status: 'in_progress', maxTeams: 1 },
      { ...base, id: ids.heldLeague, title: '보류', kind: 'regular_league', status: 'on_hold' },
      { ...base, id: ids.private, title: '비공개 설정', kind: 'regular_tournament', status: 'open', isPublic: false },
      { ...base, id: ids.cancelled, title: '취소', kind: 'regular_tournament', status: 'cancelled' },
      ...(['draft', 'open', 'closed', 'in_progress', 'completed'] as const).map((status, index) => ({ ...base, id: [ids.draftLeague, ids.openLeague, ids.closedLeague, ids.activeLeague, ids.finishedLeague][index], title: `리그 ${status}`, kind: 'regular_league' as const, status })),
    ] });
    for (const tournamentId of [ids.full, ids.fullLeague]) {
      await prisma.v1TournamentRegistration.create({ data: { tournamentId, teamId, appliedByUserId: userId, status: 'payment_checking' } });
    }
  });
  afterAll(async () => {
    await prisma.v1Tournament.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.v1Team.deleteMany({ where: { id: teamId } });
    await prisma.v1User.deleteMany({ where: { id: userId } });
    await prisma.v1Region.deleteMany({ where: { id: regionId } });
    await prisma.v1Sport.deleteMany({ where: { id: sportId } });
    await prisma.$disconnect();
  });
  it('대회의 마감·예약 정원을 전체 목록에 적용하고 초안·취소를 감춘다', async () => {
    const result = await read.list({ kind: 'tournament', sportId, registration: 'open', page: 1, limit: 1 });
    expect(result.items.map((item) => item.id)).toEqual([ids.available]);
    expect(result.pageInfo).toMatchObject({ total: 1, hasNext: false });
    expect(result.items[0].registrationOpen).toBe(true);
    const closed = await read.list({ kind: 'tournament', sportId, registration: 'closed' });
    expect(closed.items.map((item) => item.id).sort()).toEqual([ids.full, ids.expired].sort());
  });
  // 2026-10-27: 리그도 대회처럼 접수 중(open)일 때만 신청을 받는다 — 진행 중 리그는 받지 않는다.
  it('리그 준비는 draft/open/closed를 포함하고 신청은 접수 중 리그만 받는다', async () => {
    const upcoming = await read.list({ kind: 'league', sportId, phase: 'upcoming' });
    expect(upcoming.items.map((item) => item.id).sort()).toEqual([ids.draftLeague, ids.openLeague, ids.closedLeague, ids.noDeadlineLeague].sort());
    const accepting = await read.list({ kind: 'league', sportId, registration: 'open' });
    expect(accepting.items.map((item) => item.id)).toEqual([ids.openLeague]);
    expect(accepting.items[0].registrationOpen).toBe(true);
    const ongoing = await read.list({ kind: 'league', sportId, phase: 'ongoing', registration: 'open' });
    expect(ongoing.items).toEqual([]);
    const closed = await read.list({ kind: 'league', sportId, registration: 'closed' });
    expect(closed.items.map((item) => item.id).sort()).toEqual(
      [ids.draftLeague, ids.closedLeague, ids.activeLeague, ids.noDeadlineLeague, ids.fullLeague, ids.finishedLeague].sort(),
    );
    const impossible = await read.list({ kind: 'league', sportId, phase: 'completed', registration: 'open' });
    expect(impossible.items).toEqual([]);
  });
  it('시즌 시작일이 선택 기간보다 앞이어도 겹치는 시즌을 조회한다', async () => {
    const result = await read.list({ kind: 'league', sportId, dateFrom: '2099-11-01', dateTo: '2099-11-30', withTotal: 'true' });
    expect(result.items).toHaveLength(7);
    expect(result.pageInfo.total).toBe(7);
  });
  it('대회 부문·방식·무료 조건을 AND 적용한다', async () => {
    const result = await read.list({ kind: 'tournament', sportId, genderCategory: 'mixed', format: 'knockout', feeMax: 0, registration: 'open' });
    expect(result.items.map((item) => item.id)).toEqual([ids.available]);
  });
  it('개최 정렬은 일정이 끝난 대회를 빼되 진행 중·오늘 열리는 대회는 남기고 cursor가 중복·누락 없이 이어진다', async () => {
    // 진행 중 상태는 종료일이 지나도 남고, 종료 일시를 비운 하루 대회는 그날(KST) 내내 남는다. 끝난 일정과 종료 상태는 빠진다.
    await prisma.v1Tournament.update({ where: { id: ids.activeLeague }, data: { scheduledAt: new Date('2000-01-01') } });
    await prisma.v1Tournament.update({ where: { id: ids.fullLeague }, data: { scheduledAt: new Date('2000-01-02'), scheduledEndAt: new Date('2000-01-03') } });
    await prisma.v1Tournament.update({ where: { id: ids.openLeague }, data: { scheduledAt: kstDayRange(new Date()).gte, scheduledEndAt: null } });
    await prisma.v1Tournament.update({ where: { id: ids.closedLeague }, data: { scheduledAt: new Date('2000-01-01'), scheduledEndAt: null } });
    const first = await read.list({ kind: 'league', sportId, sort: 'scheduled', limit: 1, withTotal: 'true' });
    expect(first.items[0].id).toBe(ids.activeLeague);
    expect(first.pageInfo.total).toBe(5);
    const second = await read.list({ kind: 'league', sportId, sort: 'scheduled', limit: 10, cursor: first.pageInfo.nextCursor! });
    expect(second.items.map((item) => item.id)).toEqual([ids.fullLeague, ids.openLeague, ...[ids.draftLeague, ids.noDeadlineLeague].sort()]);
  });
  it('개최 정렬이어도 진행 상태 종료를 직접 고르면 끝난 대회를 보여 준다', async () => {
    const result = await read.list({ kind: 'league', sportId, sort: 'scheduled', phase: 'completed' });
    expect(result.items.map((item) => item.id)).toEqual([ids.finishedLeague]);
  });
});
