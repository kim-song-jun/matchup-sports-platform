import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentsReadService } from '../../src/tournaments/tournaments-read.service';
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
  it('대회의 마감·예약 정원을 상태 필터에 적용하고 초안·취소를 감춘다', async () => {
    const result = await read.list({ kind: 'tournament', sportId, stage: 'recruiting', page: 1, limit: 1 });
    expect(result.items.map((item) => item.id)).toEqual([ids.available]);
    expect(result.pageInfo).toMatchObject({ total: 1, hasNext: false });
    expect(result.items[0].registrationOpen).toBe(true);
    const closed = await read.list({ kind: 'tournament', sportId, stage: 'recruit_closed' });
    expect(closed.items.map((item) => item.id).sort()).toEqual([ids.full, ids.expired].sort());
    // 대회 초안은 운영자 준비 단계라 어떤 필터로도 나오지 않는다.
    expect((await read.list({ kind: 'tournament', sportId, stage: 'preparing' })).items).toEqual([]);
  });
  // 2026-10-27: 리그도 대회처럼 접수 중(open)일 때만 신청을 받는다 — 진행 중 리그는 받지 않는다.
  it('리그 상태 필터는 카드 배지와 같은 그룹만 고른다', async () => {
    const stage = async (value: 'preparing' | 'recruiting' | 'recruit_closed' | 'ongoing' | 'completed') =>
      (await read.list({ kind: 'league', sportId, stage: value })).items.map((item) => item.id).sort();
    expect(await stage('preparing')).toEqual([ids.draftLeague, ids.noDeadlineLeague].sort());
    expect(await stage('recruiting')).toEqual([ids.openLeague]);
    expect(await stage('recruit_closed')).toEqual([ids.closedLeague]);
    expect(await stage('ongoing')).toEqual([ids.activeLeague, ids.fullLeague].sort());
    expect(await stage('completed')).toEqual([ids.finishedLeague]);
    const accepting = await read.list({ kind: 'league', sportId, stage: 'recruiting' });
    expect(accepting.items[0].registrationOpen).toBe(true);
  });
  it('시즌 시작일이 선택 기간보다 앞이어도 겹치는 시즌을 조회한다', async () => {
    const result = await read.list({ kind: 'league', sportId, dateFrom: '2099-11-01', dateTo: '2099-11-30', withTotal: 'true' });
    expect(result.items).toHaveLength(7);
    expect(result.pageInfo.total).toBe(7);
  });
  it('대회 부문·방식·무료 조건을 AND 적용한다', async () => {
    const result = await read.list({ kind: 'tournament', sportId, genderCategory: 'mixed', format: 'knockout', feeMax: 0, stage: 'recruiting' });
    expect(result.items.map((item) => item.id)).toEqual([ids.available]);
  });
  it('기본 정렬은 진행 중 → 접수 중 → 준비 중 → 접수 마감 → 종료이고 그룹 안은 최근 등록순이며 cursor가 중복·누락 없이 이어진다', async () => {
    await prisma.v1Tournament.update({ where: { id: ids.fullLeague }, data: { createdAt: new Date('2099-01-02') } });
    await prisma.v1Tournament.update({ where: { id: ids.activeLeague }, data: { createdAt: new Date('2099-01-01') } });
    await prisma.v1Tournament.update({ where: { id: ids.draftLeague }, data: { createdAt: new Date('2099-01-02') } });
    await prisma.v1Tournament.update({ where: { id: ids.noDeadlineLeague }, data: { createdAt: new Date('2099-01-01') } });
    const first = await read.list({ kind: 'league', sportId, limit: 3, withTotal: 'true' });
    expect(first.items.map((item) => item.id)).toEqual([ids.fullLeague, ids.activeLeague, ids.openLeague]);
    expect(first.pageInfo.total).toBe(7);
    const second = await read.list({ kind: 'league', sportId, limit: 10, cursor: first.pageInfo.nextCursor! });
    expect(second.items.map((item) => item.id)).toEqual([ids.draftLeague, ids.noDeadlineLeague, ids.closedLeague, ids.finishedLeague]);
  });
  it('전체 탭도 대회와 리그를 같은 그룹 순서로 섞는다', async () => {
    const result = await read.list({ kind: 'all', sportId, limit: 20 });
    const order = result.items.map((item) => item.id);
    const position = (id: string) => order.indexOf(id);
    // 진행 중 < 접수 중 < 준비 중(리그만) < 접수 마감 < 종료
    expect(position(ids.activeLeague)).toBeLessThan(position(ids.available));
    expect(position(ids.available)).toBeLessThan(position(ids.draftLeague));
    expect(position(ids.draftLeague)).toBeLessThan(position(ids.full));
    expect(position(ids.expired)).toBeLessThan(position(ids.finishedLeague));
    expect(order).not.toContain(ids.hidden);
  });
});
