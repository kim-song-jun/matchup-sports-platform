import * as fs from 'fs/promises';
import * as path from 'path';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { UploadsService } from '../../src/uploads/uploads.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createChatSafetyFixture, chatSafetyIds as ids } from '../fixtures/chat-safety';

/**
 * Task 181 ③ 채팅 파일 — 업로드(비공개 폴더) → 전송 → 목록 → **참여자만** 받기까지 실제 PostgreSQL·HTTP 로 본다.
 * 한글 파일 이름이 업로드(multer defParamCharset)와 다운로드(Content-Disposition filename*) 양쪽에서 살아남는지도.
 */
describe('chat file messages with PostgreSQL', () => {
  let app: INestApplication;
  let cleanup: () => Promise<void>;
  let prisma: PrismaService;
  const base = `/api/v1/chat/rooms/${ids.room}/messages`;
  const pdf = Buffer.from('%PDF-1.7\nQA 일정표 내용\n%%EOF');
  let fileId = '';
  let messageId = '';

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await createChatSafetyFixture(prisma);
  });
  afterAll(async () => {
    // 테스트가 만든 비공개 파일을 지운다(uploads/ 는 gitignore 지만 디스크에 남기지 않는다).
    const assets = await prisma.v1UploadAsset.findMany({ where: { kind: 'file' }, select: { storagePath: true } });
    for (const asset of assets) {
      const filePath = path.join(UploadsService.UPLOAD_BASE, asset.storagePath);
      await fs.rm(filePath, { force: true });
      // 비게 된 YYYY/MM 폴더도 거슬러 올라가며 지운다 — 비어 있지 않으면 rmdir 이 실패하고 거기서 멈춘다
      // (다른 파일은 건드리지 않는다). `.private/` 자체는 multer 임시 폴더라 앱이 만들어 두므로 남긴다.
      const privateRoot = path.join(UploadsService.UPLOAD_BASE, UploadsService.PRIVATE_DIR);
      let dir = path.dirname(filePath);
      while (dir.startsWith(`${privateRoot}${path.sep}`)) {
        try {
          await fs.rmdir(dir);
        } catch {
          break;
        }
        dir = path.dirname(dir);
      }
    }
    await cleanup?.();
  });

  it('문서를 올리면 공개 URL 없이 fileId 를 주고, 한글 이름이 깨지지 않는다 · 실행 파일은 400', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/v1/uploads/files')
      .set('x-v1-user-id', ids.b)
      .attach('file', pdf, { filename: 'QA 일정표.pdf', contentType: 'application/pdf' })
      .expect(201);
    expect(uploaded.body.data).toMatchObject({ name: 'QA 일정표.pdf', size: pdf.length, mimeType: 'application/pdf' });
    expect(uploaded.body.data).not.toHaveProperty('url');
    fileId = uploaded.body.data.fileId;

    await request(app.getHttpServer())
      .post('/api/v1/uploads/files')
      .set('x-v1-user-id', ids.b)
      .attach('file', Buffer.from('MZ\x90\x00'), { filename: 'setup.exe', contentType: 'application/octet-stream' })
      .expect(400);
  });

  it('자기 파일만 보낼 수 있고, 목록엔 이름·크기만(저장 경로는 내보내지 않음)', async () => {
    await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.a).send({ fileId }).expect(400);
    const sent = await request(app.getHttpServer()).post(base).set('x-v1-user-id', ids.b).send({ fileId }).expect(201);
    expect(sent.body.data).toMatchObject({ messageType: 'file', content: '[파일] QA 일정표.pdf', imageUrl: null, file: { name: 'QA 일정표.pdf', size: pdf.length } });
    messageId = sent.body.data.messageId;

    const list = await request(app.getHttpServer()).get(base).set('x-v1-user-id', ids.c).expect(200);
    const row = list.body.data.items.find((m: { messageId: string }) => m.messageId === messageId);
    expect(row).toMatchObject({ messageType: 'file', imageUrl: null, file: { name: 'QA 일정표.pdf', mimeType: 'application/pdf' } });
    expect(JSON.stringify(row)).not.toContain('.private');
  });

  it('참여자는 내려받고(attachment · nosniff · no-store · UTF-8 이름), 방 밖 사람은 못 받는다', async () => {
    const res = await request(app.getHttpServer())
      .get(`${base}/${messageId}/file`)
      .set('x-v1-user-id', ids.c)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(res.body as Buffer, pdf)).toBe(0);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent('QA 일정표.pdf')}`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toContain('no-store');

    await request(app.getHttpServer()).get(`${base}/${messageId}/file`).set('x-v1-user-id', ids.outsider).expect(403);
    await request(app.getHttpServer()).get(`${base}/${ids.message}/file`).set('x-v1-user-id', ids.c).expect(404);
  });
});
