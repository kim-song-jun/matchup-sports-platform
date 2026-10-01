import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import express = require('express');
import request = require('supertest');
import { UploadsService } from './uploads.service';

/**
 * Task 181 ③ — 채팅 파일은 공개 `/uploads` 와 같은 볼륨의 `.private/` 에 있다. main.ts 가 쓰는 정적 서빙 옵션
 * 그대로 띄워, 일반 업로드는 열리고 `.private/` 는 URL 을 알아도 열리지 않는지 본다.
 */
describe('/uploads 정적 서빙 옵션', () => {
  let base: string;
  beforeAll(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'teameet-static-'));
    await fs.mkdir(path.join(base, '2026', '10'), { recursive: true });
    await fs.mkdir(path.join(base, UploadsService.PRIVATE_DIR, '2026', '10'), { recursive: true });
    await fs.writeFile(path.join(base, '2026', '10', 'photo.jpg'), 'jpeg');
    await fs.writeFile(path.join(base, UploadsService.PRIVATE_DIR, '2026', '10', 'secret.pdf'), '%PDF-');
  });
  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it('일반 업로드는 열리고, .private/ 의 채팅 파일은 URL 을 알아도 열리지 않는다', async () => {
    const app = express();
    app.use('/uploads', express.static(base, UploadsService.STATIC_OPTIONS));
    await request(app).get('/uploads/2026/10/photo.jpg').expect(200);
    // send 는 'deny' 를 403 으로 막지만 serve-static 기본 fallthrough 가 그 4xx 를 다음 미들웨어로 넘겨
    // 결국 404 가 된다(Nest 에서도 같다) — 파일이 있다는 사실조차 드러내지 않는다.
    await request(app).get(`/uploads/${UploadsService.PRIVATE_DIR}/2026/10/secret.pdf`).expect(404);
    await request(app).get(`/uploads/${encodeURIComponent(UploadsService.PRIVATE_DIR)}/2026/10/secret.pdf`).expect(404);
  });

  it('대조: 옵션을 allow 로 바꾸면 열린다 — 위 테스트가 옵션 덕분에 막힌다는 증거', async () => {
    const app = express();
    app.use('/uploads', express.static(base, { dotfiles: 'allow' }));
    await request(app).get(`/uploads/${UploadsService.PRIVATE_DIR}/2026/10/secret.pdf`).expect(200);
  });
});
