import * as fs from 'fs/promises';
import * as path from 'path';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { V1AuthGuard } from '../auth/v1-auth.guard';

/**
 * Boots the real HTTP pipeline (multer 2.2.0 via `@nestjs/platform-express`'s
 * FilesInterceptor) with `UploadsService` mocked out, so these tests prove
 * multer's own runtime behavior (diskStorage write + `limits` enforcement +
 * cleanup-on-rejection) survived the security bump — not `UploadsService`'s
 * logic, which is already covered by `uploads.service.spec.ts` with
 * hand-built file objects. `V1AuthGuard` is stubbed to avoid a DB dependency.
 *
 * `UploadsService.UPLOAD_BASE` is baked into `@UseInterceptors(FilesInterceptor(...))`
 * at module-import time (decorator evaluation), so unlike `uploads.service.spec.ts`
 * it cannot be swapped via `Object.defineProperty` after import — these tests
 * use (and clean up after themselves in) the real configured upload directory.
 */
describe('UploadsController real multer pipeline', () => {
  let app: INestApplication;
  const uploadBase = UploadsService.UPLOAD_BASE;
  // 채팅 파일 라우트의 multer 임시 폴더 — 앱 시작 때 multer 가 만든다(Task 181 ③).
  const privateTemp = path.join(uploadBase, UploadsService.PRIVATE_DIR);
  const storeFiles = jest.fn();
  const storeChatFile = jest.fn();

  beforeAll(async () => {
    await fs.mkdir(uploadBase, { recursive: true });

    const stubAuthGuard: CanActivate = {
      canActivate: (context: ExecutionContext) => {
        const httpRequest = context.switchToHttp().getRequest();
        httpRequest.v1User = {
          id: 'multer-test-user',
          email: 'multer-test@teameet.test',
          accountStatus: 'active',
          onboardingStatus: 'completed',
        };
        return true;
      },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: UploadsService, useValue: { storeFiles, storeChatFile } }],
    })
      .overrideGuard(V1AuthGuard)
      .useValue(stubAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    storeFiles.mockReset();
    storeChatFile.mockReset();
    // Best-effort sweep of the temp files multer wrote this test (flat files only — `.private/` stays).
    for (const dir of [uploadBase, privateTemp]) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      await Promise.all(entries.filter((e) => e.isFile()).map((e) => fs.rm(path.join(dir, e.name), { force: true })));
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('parses a real multipart request through multer diskStorage and hands a real temp file to the service', async () => {
    storeFiles.mockImplementation(async (files: Array<{ path: string }>) => ({
      urls: files.map(() => '/uploads/stub.png'),
    }));
    const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

    const response = await request(app.getHttpServer())
      .post('/uploads')
      .attach('files', pngBytes, { filename: 'photo.png', contentType: 'image/png' })
      .expect(201);

    expect(response.body).toEqual({ urls: ['/uploads/stub.png'] });
    expect(storeFiles).toHaveBeenCalledTimes(1);
    const [receivedFiles] = storeFiles.mock.calls[0] as [
      Array<{ fieldname: string; mimetype: string; originalname: string; destination: string; path: string }>,
    ];
    expect(receivedFiles).toHaveLength(1);
    const [file] = receivedFiles;
    expect(file.fieldname).toBe('files');
    expect(file.mimetype).toBe('image/png');
    expect(file.originalname).toBe('photo.png');
    expect(file.destination).toBe(uploadBase);
    expect(path.dirname(file.path)).toBe(uploadBase);
    // multer already streamed the bytes to disk (diskStorage) before the interceptor
    // handed control to the controller — confirm the temp file genuinely exists.
    await expect(fs.stat(file.path)).resolves.toMatchObject({ size: pngBytes.length });
  });

  it('rejects an image above the 10MB multer hard cap before the request reaches UploadsService, with no orphaned temp file left behind', async () => {
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 1);

    const response = await request(app.getHttpServer())
      .post('/uploads')
      .attach('files', oversized, { filename: 'huge.png', contentType: 'image/png' });

    // multer's own `limits.fileSize` still rejects before UploadsService.storeFiles runs.
    // @nestjs/platform-express maps MulterError LIMIT_FILE_SIZE -> 413 PayloadTooLargeException.
    expect(response.status).toBe(413);
    expect(storeFiles).not.toHaveBeenCalled();
    // GHSA-3p4h-7m6x-2hcm ("incomplete cleanup of aborted uploads") was fixed in multer 2.2.0 —
    // an over-limit stream must not leave a partial temp file behind.
    expect((await fs.readdir(uploadBase)).filter((entry) => entry !== UploadsService.PRIVATE_DIR)).toEqual([]);
  });

  it('rejects a 6th file in one request before the request reaches UploadsService', async () => {
    const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    let req = request(app.getHttpServer()).post('/uploads');
    for (let i = 0; i < 6; i += 1) {
      req = req.attach('files', pngBytes, { filename: `photo-${i}.png`, contentType: 'image/png' });
    }

    const response = await req;

    // multer's `limits.files: 5` still rejects the 6th file (LIMIT_FILE_COUNT -> 400 BadRequestException).
    expect(response.status).toBe(400);
    expect(storeFiles).not.toHaveBeenCalled();
  });

  it('writes chat-file temp uploads under the non-served .private dir, never the public upload root (Task 181 ③)', async () => {
    storeChatFile.mockImplementation(async (file: { path: string }) => ({ tempDir: path.dirname(file.path) }));

    const response = await request(app.getHttpServer())
      .post('/uploads/files')
      .attach('file', Buffer.from('%PDF-1.7'), { filename: 'schedule.pdf', contentType: 'application/pdf' })
      .expect(201);

    expect(response.body).toEqual({ tempDir: privateTemp });
  });
});
