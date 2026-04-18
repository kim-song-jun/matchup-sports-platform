import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as supertest from 'supertest';
import { createTestApp } from '../helpers/nest-app';
import { getPrismaTestClient, disconnectPrismaTestClient } from '../helpers/prisma-test-client';
import { truncateAll } from '../helpers/db-cleanup';
import { devLoginToken } from '../helpers/auth-token';

// ---------------------------------------------------------------------------
// Integration tests: team match approve → chat room auto-creation
// ---------------------------------------------------------------------------

describe('Team Match Approval + Chat Room Auto-Create (e2e)', () => {
  let app: INestApplication;
  let request: supertest.Agent;
  let prisma: PrismaClient;
  let closeApp: () => Promise<void>;

  beforeAll(async () => {
    prisma = getPrismaTestClient();
    const testApp = await createTestApp();
    app = testApp.app;
    request = testApp.request;
    closeApp = testApp.close;
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await closeApp();
    await disconnectPrismaTestClient();
  });

  async function createTeam(token: string, name: string): Promise<string> {
    const res = await request
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name,
        sportTypes: ['futsal'],
        city: '서울',
        district: '마포구',
        level: 3,
        isRecruiting: true,
      });
    expect(res.status).toBe(201);
    return (res.body.data as { id: string }).id;
  }

  async function createTeamMatch(token: string, teamId: string): Promise<string> {
    const res = await request
      .post('/api/v1/team-matches')
      .set('Authorization', `Bearer ${token}`)
      .send({
        hostTeamId: teamId,
        sportType: 'futsal',
        title: 'Chat Room Test Match',
        matchDate: '2026-06-01',
        startTime: '14:00',
        endTime: '16:00',
        venueName: 'Test Venue',
        venueAddress: '서울시 테스트구',
      });
    expect(res.status).toBe(201);
    return (res.body.data as { id: string }).id;
  }

  describe('POST approve → GET /api/v1/chat/rooms includes new team_match room', () => {
    it('approving a team match application auto-creates a chat room for both team leaders', async () => {
      const hostToken = await devLoginToken(request, 'tm_chat_host');
      const guestToken = await devLoginToken(request, 'tm_chat_guest');

      const hostTeamId = await createTeam(hostToken, 'Chat Host FC');
      const guestTeamId = await createTeam(guestToken, 'Chat Guest FC');

      const matchId = await createTeamMatch(hostToken, hostTeamId);

      // Guest applies
      const applyRes = await request
        .post(`/api/v1/team-matches/${matchId}/apply`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ applicantTeamId: guestTeamId, confirmedInfo: true, confirmedLevel: true });
      expect(applyRes.status).toBe(201);
      const appId = (applyRes.body.data as { id: string }).id;

      // Host approves
      const approveRes = await request
        .patch(`/api/v1/team-matches/${matchId}/applications/${appId}/approve`)
        .set('Authorization', `Bearer ${hostToken}`);
      expect(approveRes.status).toBe(200);

      // Allow async fire-and-forget chat room creation to settle
      await new Promise((r) => setTimeout(r, 300));

      // Verify chat room was created for this teamMatchId
      const chatRoom = await prisma.chatRoom.findUnique({
        where: { teamMatchId: matchId },
        include: { participants: true, messages: true },
      });
      expect(chatRoom).not.toBeNull();
      expect(chatRoom?.type).toBe('team_match');
      expect(chatRoom?.participants.length).toBeGreaterThan(0);

      // Verify system message was injected
      const systemMessage = chatRoom?.messages.find((m) => m.type === 'system');
      expect(systemMessage).not.toBeNull();
      expect(systemMessage?.content).toBe('매칭이 확정되었습니다');
      expect(systemMessage?.senderId).toBeNull();

      // Host should see the room in GET /chat/rooms
      const chatRoomsRes = await request
        .get('/api/v1/chat/rooms')
        .set('Authorization', `Bearer ${hostToken}`);
      expect(chatRoomsRes.status).toBe(200);
      const rooms = (chatRoomsRes.body.data as { data: Array<{ id: string }> }).data;
      const found = rooms.find((r) => r.id === chatRoom?.id);
      expect(found).not.toBeUndefined();
    });

    it('approving the same match twice does not duplicate the chat room (idempotent)', async () => {
      const hostToken = await devLoginToken(request, 'tm_idem_host');
      const guestToken = await devLoginToken(request, 'tm_idem_guest');

      const hostTeamId = await createTeam(hostToken, 'Idem Host FC');
      const guestTeamId = await createTeam(guestToken, 'Idem Guest FC');

      const matchId = await createTeamMatch(hostToken, hostTeamId);

      const applyRes = await request
        .post(`/api/v1/team-matches/${matchId}/apply`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ applicantTeamId: guestTeamId, confirmedInfo: true, confirmedLevel: true });
      const appId = (applyRes.body.data as { id: string }).id;

      // Approve once
      await request
        .patch(`/api/v1/team-matches/${matchId}/applications/${appId}/approve`)
        .set('Authorization', `Bearer ${hostToken}`);

      await new Promise((r) => setTimeout(r, 300));

      const roomsBefore = await prisma.chatRoom.count({ where: { teamMatchId: matchId } });

      // Attempt to approve again (should fail at service level — "이미 매칭이 완료된 경기" — but room shouldn't duplicate)
      await request
        .patch(`/api/v1/team-matches/${matchId}/applications/${appId}/approve`)
        .set('Authorization', `Bearer ${hostToken}`);

      await new Promise((r) => setTimeout(r, 100));

      const roomsAfter = await prisma.chatRoom.count({ where: { teamMatchId: matchId } });
      expect(roomsAfter).toBe(roomsBefore); // exactly 1
    });
  });
});
