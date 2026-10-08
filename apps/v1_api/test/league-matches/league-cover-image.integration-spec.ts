import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const suiteId = randomUUID().slice(0, 8);
const adminUserId = `cover-admin-${suiteId}`;
const supportUserId = `cover-support-${suiteId}`;

/**
 * 리그 대표 이미지(MD-QA #37) — 설정·교체·제거가 그 리그에만 반영되고, 업로드 경로 밖의 값은 거부된다.
 */
describe('리그 대표 이미지 HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let leagueA: string;
  let leagueB: string;
  let tournamentId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    const ids = [adminUserId, supportUserId];
    await prisma.v1User.createMany({
      data: ids.map((id) => ({
        id, email: `${id}@integration.test`, onboardingStatus: 'completed', phoneVerifiedAt: new Date(), accountStatus: 'active',
      })),
    });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await Promise.all(ids.map((id) => terms.acceptSignupTerms(id, required)));
    await prisma.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'owner' } });
    await prisma.v1AdminUser.create({ data: { userId: supportUserId, adminRole: 'support' } });
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
    const region = await prisma.v1Region.create({ data: { code: `%(p)s-region-${suiteId}`, name: '테스트 지역', level: 2 } });
    const makeTeam = async (suffix: string, ownerUserId: string) => {
      const team = await prisma.v1Team.create({ data: { ownerUserId, sportId: sport.id, regionId: region.id, name: `%(p)s-${suffix}-${suiteId}` } });
      await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: ownerUserId, role: 'owner', status: 'active' } });
      return team.id;
    };
    const seedTeams = [await makeTeam('s1', adminUserId), await makeTeam('s2', supportUserId)];
    const createLeague = async (title: string, open: boolean) => {
      const created = await http().post('/api/v1/admin/league-matches').set('x-v1-user-id', adminUserId).send({
        title: `${title} ${suiteId}`, sportId: sport.id, regionId: region.id,
        startsOn: new Date(Date.now() + 5 * 86_400_000).toISOString(), endsOn: new Date(Date.now() + 60 * 86_400_000).toISOString(),
        teamIds: seedTeams,
      }).expect(201);
      const id = created.body.data.leagueId as string;
      if (open) {
        await http().post(`/api/v1/admin/league-matches/${id}/open-registration`).set('x-v1-user-id', adminUserId)
          .send({ registrationDeadlineAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }).expect(200);
      }
      return id;
    };
    leagueA = await createLeague('대상 리그', true);
    leagueB = await createLeague('대조 리그', true);
    tournamentId = (await prisma.v1Tournament.create({
      data: { title: `대회 ${suiteId}`, sportId: sport.id, regionId: region.id, kind: 'regular_tournament', status: 'open', scheduledAt: new Date(Date.now() + 30 * 86_400_000) },
    })).id;
  });
  afterAll(async () => cleanup?.());

  const coverUrl = (id: string) => `/api/v1/admin/league-matches/${id}/cover-image`;
  const patchCover = (id: string, body: object, user = adminUserId) =>
    http().patch(coverUrl(id)).set('x-v1-user-id', user).send(body);
  const adminCover = async (id: string) =>
    (await http().get(`/api/v1/admin/league-matches/${id}`).set('x-v1-user-id', adminUserId).expect(200)).body.data.coverImageUrl;
  const publicCover = async (id: string) => (await http().get(`/api/v1/league-matches/${id}`).expect(200)).body.data.coverImageUrl;
  const listCover = async (id: string) => {
    const res = await http().get('/api/v1/tournaments?kind=league').expect(200);
    const items = res.body.data.items as Array<{ id: string; coverImageUrl: string | null }>;
    return items.find((item) => item.id === id)?.coverImageUrl;
  };
  const IMG_1 = `/uploads/cover-${suiteId}-1.webp`;
  const IMG_2 = `/uploads/cover-${suiteId}-2.webp`;

  it('권한: support 는 403, 대회 id 는 404, 잘못된 id 는 400', async () => {
    await patchCover(leagueA, { coverImageUrl: IMG_1 }, supportUserId).expect(403);
    expect((await patchCover(tournamentId, { coverImageUrl: IMG_1 }).expect(404)).body.code).toBe('LEAGUE_NOT_FOUND');
    await patchCover('not-a-uuid', { coverImageUrl: IMG_1 }).expect(400);
    expect(await adminCover(leagueA)).toBeNull();
  });

  it.each([
    ['키 누락', {}],
    ['빈 문자열', { coverImageUrl: '' }],
    ['외부 URL', { coverImageUrl: 'https://cdn.example.com/a.png' }],
    ['javascript:', { coverImageUrl: 'javascript:alert(1)' }],
    ['.private 경로', { coverImageUrl: '/uploads/.private/x.png' }],
    ['.. 세그먼트', { coverImageUrl: '/uploads/../x.png' }],
  ])('검증: %s 는 400 이고 저장되지 않는다', async (_label, body) => {
    await patchCover(leagueA, body).expect(400);
    expect(await adminCover(leagueA)).toBeNull();
  });

  it('설정하면 어드민·공개 상세·통합 목록에 그 리그만 바뀌고 다른 리그는 null 이다', async () => {
    const res = await patchCover(leagueA, { coverImageUrl: IMG_1 }).expect(200);
    expect(res.body.data).toEqual({ leagueId: leagueA, coverImageUrl: IMG_1, alreadyProcessed: false });
    expect(await adminCover(leagueA)).toBe(IMG_1);
    expect(await publicCover(leagueA)).toBe(IMG_1);
    expect(await listCover(leagueA)).toBe(IMG_1);
    expect(await adminCover(leagueB)).toBeNull();
    expect(await publicCover(leagueB)).toBeNull();
    expect(await listCover(leagueB)).toBeNull();
  });

  it('같은 값은 alreadyProcessed 이고 감사 행이 늘지 않는다', async () => {
    const count = () => prisma.v1AdminActionLog.count({ where: { targetId: leagueA, action: 'league_match.cover_image_updated' } });
    const before = await count();
    expect((await patchCover(leagueA, { coverImageUrl: IMG_1 }).expect(200)).body.data.alreadyProcessed).toBe(true);
    expect(await count()).toBe(before);
  });

  it('교체는 before·after 를 감사에 남기고, null 은 제거한다', async () => {
    await patchCover(leagueA, { coverImageUrl: IMG_2 }).expect(200);
    const audit = await prisma.v1AdminActionLog.findFirstOrThrow({
      where: { targetId: leagueA, action: 'league_match.cover_image_updated', afterJson: { equals: { coverImageUrl: IMG_2 } } },
    });
    expect(audit.beforeJson).toEqual({ coverImageUrl: IMG_1 });

    await patchCover(leagueA, { coverImageUrl: null }).expect(200);
    expect(await adminCover(leagueA)).toBeNull();
    expect(await publicCover(leagueA)).toBeNull();
  });

  it('끝난 리그도 대표 이미지를 바꿀 수 있다', async () => {
    await prisma.v1Tournament.update({ where: { id: leagueB }, data: { status: 'completed' } });
    await patchCover(leagueB, { coverImageUrl: IMG_1 }).expect(200);
    expect(await adminCover(leagueB)).toBe(IMG_1);
  });
});
