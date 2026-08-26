import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

// 이 파일이 jest.config.ts 의 integration testMatch 에 등록되지 않으면
// 디스크에 있어도 CI 가 절대 실행하지 않는다. 같은 실수가 이 레포에서 4회 반복됐다
// (team-schedules/team-match-series/team-lineups/team-matches — jest.config.ts 주석 참고).
//
// 실 DB(격리된 클론) 로 발신 → 중복 거부 → 수락 → 멱등 재수락 → 채팅방 resolve → resolve
// 멱등 → 비참여자 거부까지 한 번에 왕복한다. TeamContactsController/Module 이 실제로
// V1AuthGuard·ValidationPipe·TransformInterceptor·AllExceptionsFilter 전 파이프라인을
// 통과하는지, 그리고 Task 7 의 채팅방 team_contact 연동이 accept 이후 실제로 열리는지를
// 유닛 스펙(mock Prisma) 은 증명하지 못한다.

const ids = {
  ownerA: '68880000-0000-4000-8000-000000000001',
  ownerB: '68880000-0000-4000-8000-000000000002',
  outsider: '68880000-0000-4000-8000-000000000003',
  region: '68880000-0000-4000-8000-000000000011',
  teamA: '68880000-0000-4000-8000-000000000020',
  teamB: '68880000-0000-4000-8000-000000000021',
} as const;

describe('팀 컨택 전체 흐름', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);

    await prisma.v1User.createMany({
      data: [ids.ownerA, ids.ownerB, ids.outsider].map((id) => ({
        id,
        email: `${id}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        // V1AuthGuard 의 휴대폰 인증 전역 게이트(쓰기 요청 차단)를 피한다 — 이 스펙은
        // POST/PATCH 로 실 HTTP 파이프라인을 태우므로 서비스 유닛 스펙과 달리 필요하다.
        phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      })),
    });

    // V1AuthGuard 의 약관 재동의 게이트(TERMS_RECONSENT_REQUIRED) — DB 시드 유저는
    // v1ManagedTermsConsentEvent 가 0건이라 기본값으로는 모든 write 가 막힌다.
    const termsService = app.get(ManagedTermsRuntimeService);
    const currentSignupTerms = await termsService.currentSignupTerms();
    const requiredDocumentIds = currentSignupTerms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await Promise.all(
      [ids.ownerA, ids.ownerB, ids.outsider].map((id) =>
        termsService.acceptSignupTerms(id, requiredDocumentIds),
      ),
    );

    const sport = await prisma.v1Sport.upsert({
      where: { code: 'task8-team-contact-football' },
      update: {},
      create: { code: 'task8-team-contact-football', name: 'Task 8 team contact football' },
      select: { id: true },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK8_TEAM_CONTACT_REGION', name: 'Task 8 team contact region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.teamA, ownerUserId: ids.ownerA, sportId: sport.id, regionId: ids.region, name: 'Task 8 team A' },
        { id: ids.teamB, ownerUserId: ids.ownerB, sportId: sport.id, regionId: ids.region, name: 'Task 8 team B' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.teamA, userId: ids.ownerA, role: 'owner', status: 'active' },
        { teamId: ids.teamB, userId: ids.ownerB, role: 'owner', status: 'active' },
      ],
    });
  });

  afterAll(async () => cleanupApp?.());

  let contactId: string;
  let firstRespondedAt: string;
  let roomId: string;

  it('1) A owner 가 B 로 컨택을 발신하면 requested 로 생성된다', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamB}/contacts`)
      .set('x-v1-user-id', ids.ownerA)
      .send({ fromTeamId: ids.teamA, message: '주말 경기 가능하실까요?' })
      .expect(201);

    expect(res.body.data).toMatchObject({
      fromTeamId: ids.teamA,
      toTeamId: ids.teamB,
      status: 'requested',
    });
    contactId = res.body.data.id;
    expect(typeof contactId).toBe('string');

    const row = await prisma.v1TeamContact.findUniqueOrThrow({ where: { id: contactId } });
    expect(row.status).toBe('requested');
  });

  it('2) 같은 팀쌍에 다시 발신하면 409 TEAM_CONTACT_ALREADY_ACTIVE', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/teams/${ids.teamB}/contacts`)
      .set('x-v1-user-id', ids.ownerA)
      .send({ fromTeamId: ids.teamA, message: '한 번 더 보내볼게요' })
      .expect(409);

    expect(res.body.code).toBe('TEAM_CONTACT_ALREADY_ACTIVE');
    expect(res.body.details).toMatchObject({ existingContactId: contactId });

    // 새 row 가 만들어지지 않았는지 DB 로 직접 확인한다
    const count = await prisma.v1TeamContact.count({
      where: { fromTeamId: ids.teamA, toTeamId: ids.teamB },
    });
    expect(count).toBe(1);
  });

  it('3) B owner 가 수락하면 accepted 로 바뀐다', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/team-contacts/${contactId}/accept`)
      .set('x-v1-user-id', ids.ownerB)
      .expect(200);

    expect(res.body.data.alreadyProcessed).toBe(false);
    expect(res.body.data.contact.status).toBe('accepted');
    expect(res.body.data.contact.respondedByUserId).toBe(ids.ownerB);
    firstRespondedAt = res.body.data.contact.respondedAt;
    expect(firstRespondedAt).toBeTruthy();

    const row = await prisma.v1TeamContact.findUniqueOrThrow({ where: { id: contactId } });
    expect(row.status).toBe('accepted');
  });

  it('4) B owner 가 다시 수락하면 alreadyProcessed=true 이고 respondedAt 이 바뀌지 않는다', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/team-contacts/${contactId}/accept`)
      .set('x-v1-user-id', ids.ownerB)
      .expect(200);

    expect(res.body.data.alreadyProcessed).toBe(true);
    expect(res.body.data.contact.status).toBe('accepted');
    expect(res.body.data.contact.respondedAt).toBe(firstRespondedAt);
  });

  it('5) A owner 가 /chat/rooms/resolve 로 team_contact 채팅방 roomId 를 얻는다', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/chat/rooms/resolve')
      .set('x-v1-user-id', ids.ownerA)
      .send({ targetType: 'team_contact', targetId: contactId })
      .expect(201);

    expect(res.body.data.created).toBe(true);
    expect(typeof res.body.data.roomId).toBe('string');
    roomId = res.body.data.roomId;

    const room = await prisma.v1ChatRoom.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.teamContactId).toBe(contactId);
  });

  it('6) 같은 호출을 반복해도 같은 roomId — 방이 파편화되지 않는다', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/chat/rooms/resolve')
      .set('x-v1-user-id', ids.ownerA)
      .send({ targetType: 'team_contact', targetId: contactId })
      .expect(201);

    expect(res.body.data.created).toBe(false);
    expect(res.body.data.roomId).toBe(roomId);

    const rooms = await prisma.v1ChatRoom.findMany({ where: { teamContactId: contactId } });
    expect(rooms).toHaveLength(1);
  });

  it('7) 두 팀 어디에도 속하지 않은 사용자가 resolve 하면 403 PERMISSION_DENIED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/chat/rooms/resolve')
      .set('x-v1-user-id', ids.outsider)
      .send({ targetType: 'team_contact', targetId: contactId })
      .expect(403);

    expect(res.body.code).toBe('PERMISSION_DENIED');

    // 비참여자 시도로 새 방이 생기지 않았는지도 확인한다
    const rooms = await prisma.v1ChatRoom.findMany({ where: { teamContactId: contactId } });
    expect(rooms).toHaveLength(1);
  });
});
