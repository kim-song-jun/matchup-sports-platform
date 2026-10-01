import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createChatSafetyFixture, chatSafetyIds as ids } from '../fixtures/chat-safety';

/**
 * Task 181 ① 사진 메시지 — 새 enum 값(`image`)·새 FK(`attachment_asset_id` → `v1_upload_assets`, SET NULL)가
 * 실제 PostgreSQL 에서 목록·미리보기·읽지 않은 수·신고·업로드 삭제까지 이어지는지 본다.
 */
describe('chat image messages with PostgreSQL', () => {
  let app: INestApplication;
  let cleanup: () => Promise<void>;
  let prisma: PrismaService;
  const base = `/api/v1/chat/rooms/${ids.room}/messages`;
  const bUrl = '/uploads/2026/10/qa-b-photo.jpg';
  const cUrl = '/uploads/2026/10/qa-c-photo.jpg';

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await createChatSafetyFixture(prisma);
    for (const [owner, url] of [[ids.b, bUrl], [ids.c, cUrl]] as const) {
      await prisma.v1UploadAsset.create({
        data: { ownerUserId: owner, kind: 'image', mimeType: 'image/jpeg', byteSize: BigInt(1024), url, storagePath: url.replace('/uploads/', '') },
      });
    }
  });
  afterAll(async () => { await cleanup?.(); });

  it('자기 업로드만 사진으로 보낼 수 있다 — 남의 업로드·content 동시 전송은 400', async () => {
    await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.b).send({ imageUrl: cUrl }).expect(400);
    await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.b).send({ imageUrl: bUrl, content: '같이' }).expect(400);
    const sent = await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.b).send({ imageUrl: bUrl }).expect(201);
    expect(sent.body.data).toMatchObject({ messageType: 'image', content: '사진', imageUrl: bUrl });
  });

  it('목록엔 imageUrl · 채팅 목록 미리보기는 "사진" · 읽지 않은 수에 들어간다', async () => {
    const list = await request(app.getHttpServer()).get(base).set('x-v1-user-id', ids.a).expect(200);
    const photo = list.body.data.items.find((m: { messageType: string }) => m.messageType === 'image');
    expect(photo).toMatchObject({ content: '사진', imageUrl: bUrl, unreadCount: 2 });
    const rooms = await request(app.getHttpServer()).get('/api/v1/chat/rooms').set('x-v1-user-id', ids.c).expect(200);
    expect(rooms.body.data.items[0].lastMessage).toMatchObject({ contentPreview: '사진' });
    // 픽스처의 텍스트 1건 + 사진 1건
    expect(rooms.body.data.items[0].unreadCount).toBe(2);
  });

  it('사진 메시지도 신고할 수 있고 신고 스냅샷에 사진 경로가 남는다', async () => {
    const list = await request(app.getHttpServer()).get(base).set('x-v1-user-id', ids.a).expect(200);
    const photo = list.body.data.items.find((m: { messageType: string }) => m.messageType === 'image');
    const report = await request(app.getHttpServer()).post(`${base}/${photo.messageId}/report`).set('x-v1-user-id', ids.a).send({ reason: 'inappropriate' }).expect(201);
    const inquiry = await prisma.v1Inquiry.findUniqueOrThrow({ where: { id: report.body.data.inquiryId } });
    expect(inquiry.body).toContain(bUrl);
  });

  it('업로드가 지워지면 메시지는 남고 사진만 사라진다(SET NULL)', async () => {
    await prisma.v1UploadAsset.delete({ where: { url: bUrl } });
    const list = await request(app.getHttpServer()).get(base).set('x-v1-user-id', ids.a).expect(200);
    const photo = list.body.data.items.find((m: { messageType: string }) => m.messageType === 'image');
    expect(photo).toMatchObject({ content: '사진', imageUrl: null });
  });
});
