import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { seedCompetitionConfigVersions } from '../../src/tournaments/competition-config/competition-config-backfill';
import { createV1IntegrationApp } from '../integration/integration-app';

// 경기 시간은 대회 기본값 → 단계 → 조 → 경기 순서로 좁아진다. 좁은 설정은 넓은 설정을 바꿔도 남고,
// 어느 설정을 바꿔도 대회 기본값은 그대로여야 한다(사용자 요청: "전체 설정은 절대 건드리지 않는다").
const ownerId = '14430000-0000-4000-8000-000000000001';

describe('조·경기별 경기 시간 재정의', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.create({ data: { id: ownerId, email: 'period-overrides@integration.test', onboardingStatus: 'completed' } });
    await prisma.v1AdminUser.create({ data: { userId: ownerId, adminRole: 'owner', status: 'active' } });
    const terms = app.get(ManagedTermsRuntimeService);
    const current = await terms.currentSignupTerms();
    await terms.acceptSignupTerms(ownerId, current.items.filter((item) => item.requirement === 'required').map((item) => item.documentId));
    sportId = (await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } })).id;
    await seedCompetitionConfigVersions(prisma);
  });

  afterAll(async () => cleanup?.());

  const api = () => request(app.getHttpServer());
  const as = <T extends request.Test>(test: T) => test.set('x-v1-user-id', ownerId);

  async function settings(id: string) {
    return (await as(api().get(`/api/v1/admin/tournaments/${id}/periods`)).expect(200)).body.data;
  }

  async function save(id: string, body: Record<string, unknown>, status = 200) {
    const { expectedVersion } = await settings(id);
    const response = await as(api().patch(`/api/v1/admin/tournaments/${id}/periods`)).send({ expectedVersion, ...body });
    expect({ status: response.status, body: response.body }).toMatchObject({ status });
    return response.body.data ?? response.body;
  }

  const minutes = (periods: Array<{ durationMinutes: number }>) => periods.map((period) => period.durationMinutes);

  /** 경기가 실제로 쓰는 값 — 규칙 버전의 피리어드 길이와 운영 보드가 그릴 피리어드 행 수. */
  async function fixtureMinutes(teamMatchId: string) {
    const match = await prisma.v1TeamMatch.findUniqueOrThrow({
      where: { id: teamMatchId },
      select: { periodOverride: true, competitionConfig: { select: { id: true, periods: true } }, game: { select: { competitionConfigVersionId: true, periods: { select: { number: true } } } } },
    });
    expect(match.game?.competitionConfigVersionId).toBe(match.competitionConfig?.id);
    const periods = minutes(match.competitionConfig!.periods as Array<{ durationMinutes: number }>);
    expect(match.game?.periods).toHaveLength(periods.length);
    return periods;
  }

  async function createTournament() {
    const created = await as(api().post('/api/v1/admin/tournaments'))
      .send({ sportId, title: '조·경기별 시간', format: 'group_knockout', teamCount: 8, lineupMaxPlayers: 5 }).expect(201);
    const id: string = created.body.data.id;
    await save(id, { periods: [{ durationMinutes: 20 }, { durationMinutes: 20 }] });
    const group = async (name: string, phase: string) =>
      (await as(api().post(`/api/v1/admin/tournaments/${id}/groups`)).send({ name, phase }).expect(201)).body.data.id as string;
    const fixture = async (groupId: string, round: string, fixtureNumber: number) =>
      (await as(api().post(`/api/v1/admin/tournaments/${id}/fixtures`)).send({ groupId, round, fixtureNumber }).expect(201)).body.data.id as string;
    const groupA = await group('A조', 'group');
    const groupB = await group('B조', 'group');
    const final = await group('결승', 'final');
    return {
      id, groupA, groupB, final, fixture,
      a1: await fixture(groupA, 'A조', 1),
      a2: await fixture(groupA, 'A조', 2),
      b1: await fixture(groupB, 'B조', 3),
      f1: await fixture(final, '결승', 4),
    };
  }

  it('조·경기 설정은 넓은 설정이 바뀌어도 남고, 대회 기본값은 어느 저장에서도 그대로다', async () => {
    const t = await createTournament();
    const defaultPin = (await settings(t.id)).competitionConfigVersionId;

    await save(t.id, { phase: 'group', periods: [{ durationMinutes: 15 }] });
    await save(t.id, { groupId: t.groupB, periods: [{ durationMinutes: 10 }, { durationMinutes: 10 }] });
    const before = await settings(t.id);
    const match = await save(t.id, { teamMatchId: t.a2, periods: [{ durationMinutes: 12 }] });
    // 경기 하나만 바꾸면 대회 버전도 그대로다 — 이어서 다른 경기를 고치는 운영자가 충돌로 막히지 않는다.
    expect(match.expectedVersion).toBe(before.expectedVersion);

    expect(await fixtureMinutes(t.a1)).toEqual([15]);
    expect(await fixtureMinutes(t.a2)).toEqual([12]);
    expect(await fixtureMinutes(t.b1)).toEqual([10, 10]);
    expect(await fixtureMinutes(t.f1)).toEqual([20, 20]);
    const read = await settings(t.id);
    expect(read.competitionConfigVersionId).toBe(defaultPin);
    expect(minutes(read.periods)).toEqual([20, 20]);
    expect(read.groupOverrides).toEqual([expect.objectContaining({ groupId: t.groupB, name: 'B조', periods: [expect.objectContaining({ label: '전반', durationMinutes: 10 }), expect.objectContaining({ label: '후반', durationMinutes: 10 })] })]);

    const a2 = (await as(api().get(`/api/v1/admin/tournaments/${t.id}/periods/matches/${t.a2}`)).expect(200)).body.data;
    expect(a2).toMatchObject({ overridden: true, editable: true, inherited: { source: 'stage', phase: 'group', groupName: 'A조' } });
    expect(minutes(a2.periods)).toEqual([12]);
    expect(minutes(a2.inherited.periods)).toEqual([15]);
    const b1 = (await as(api().get(`/api/v1/admin/tournaments/${t.id}/periods/matches/${t.b1}`)).expect(200)).body.data;
    expect(b1).toMatchObject({ overridden: false, inherited: { source: 'group', groupName: 'B조' } });

    // 넓은 설정을 바꾼다 — 그 설정을 따르는 경기만 움직인다.
    await save(t.id, { periods: [{ durationMinutes: 30 }] });
    expect(await fixtureMinutes(t.f1)).toEqual([30]);
    expect(await fixtureMinutes(t.a1)).toEqual([15]);
    await save(t.id, { phase: 'group', periods: [{ durationMinutes: 25 }] });
    expect(await fixtureMinutes(t.a1)).toEqual([25]);
    expect(await fixtureMinutes(t.a2)).toEqual([12]);
    expect(await fixtureMinutes(t.b1)).toEqual([10, 10]);

    // 조 설정이 있는 조에 새 경기를 만들면 그 조 설정으로 생긴다.
    const b2 = await t.fixture(t.groupB, 'B조', 5);
    expect(await fixtureMinutes(b2)).toEqual([10, 10]);

    // 위 설정 따르기로 돌리면 바로 위 설정을 다시 따른다.
    await save(t.id, { groupId: t.groupB, inheritDefault: true });
    expect(await fixtureMinutes(t.b1)).toEqual([25]);
    expect(await fixtureMinutes(b2)).toEqual([25]);
    await save(t.id, { teamMatchId: t.a2, inheritDefault: true });
    expect(await fixtureMinutes(t.a2)).toEqual([25]);
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: t.a2 } })).periodOverride).toBe(false);
    expect((await settings(t.id)).groupOverrides).toEqual([]);
  });

  it('대회 규칙(출전 인원)이 바뀌면 조 설정은 피리어드를 지킨 채 새 규칙 위에 다시 만들어진다', async () => {
    const created = await as(api().post('/api/v1/admin/tournaments'))
      .send({ sportId, title: '조 설정 규칙 변경', format: 'group_knockout', teamCount: 8, lineupMaxPlayers: 5 }).expect(201);
    const id: string = created.body.data.id;
    const groupB = (await as(api().post(`/api/v1/admin/tournaments/${id}/groups`)).send({ name: 'B조', phase: 'group' }).expect(201)).body.data.id as string;
    await save(id, { groupId: groupB, periods: [{ durationMinutes: 10 }] });
    const before = await prisma.v1TournamentGroup.findUniqueOrThrow({ where: { id: groupB }, include: { competitionConfig: true } });

    // 대진이 생기기 전이라 출전 인원을 바꿀 수 있다 — 대회 기본 규칙이 새 버전으로 바뀐다.
    await as(api().patch(`/api/v1/admin/tournaments/${id}`)).send({ expectedVersion: (await settings(id)).expectedVersion, lineupMaxPlayers: 6 }).expect(200);

    const tournament = await prisma.v1Tournament.findUniqueOrThrow({ where: { id }, include: { competitionConfig: true } });
    const after = await prisma.v1TournamentGroup.findUniqueOrThrow({ where: { id: groupB }, include: { competitionConfig: true } });
    expect(after.competitionConfigVersionId).not.toBe(before.competitionConfigVersionId);
    expect(after.competitionConfig?.lineup).toEqual(tournament.competitionConfig?.lineup);
    expect(minutes(after.competitionConfig!.periods as Array<{ durationMinutes: number }>)).toEqual([10]);
    const fixture = (await as(api().post(`/api/v1/admin/tournaments/${id}/fixtures`)).send({ groupId: groupB, round: 'B조', fixtureNumber: 1 }).expect(201)).body.data.id as string;
    expect(await fixtureMinutes(fixture)).toEqual([10]);
  });

  it('강 단계 조와 시작한 경기는 바꿀 수 없고, 범위는 하나만 고른다', async () => {
    const t = await createTournament();
    const knockout = await save(t.id, { groupId: t.final, periods: [{ durationMinutes: 15 }] }, 400);
    expect(knockout.code).toBe('TOURNAMENT_GROUP_PERIODS_UNSUPPORTED');
    const both = await save(t.id, { phase: 'group', groupId: t.groupA, periods: [{ durationMinutes: 15 }] }, 400);
    expect(both.code).toBe('TOURNAMENT_PERIOD_SCOPE_CONFLICT');

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: t.a1 } });
    await prisma.v1GamePeriod.updateMany({ where: { gameId: game.id, number: 1 }, data: { state: 'LIVE', startedAt: new Date() } });
    const locked = await save(t.id, { teamMatchId: t.a1, periods: [{ durationMinutes: 12 }] }, 409);
    expect(locked.code).toBe('TEAM_MATCH_PERIODS_LOCKED');
    const read = (await as(api().get(`/api/v1/admin/tournaments/${t.id}/periods/matches/${t.a1}`)).expect(200)).body.data;
    expect(read).toMatchObject({ overridden: false, editable: false });
    expect(await fixtureMinutes(t.a1)).toEqual([20, 20]);
  });
});
