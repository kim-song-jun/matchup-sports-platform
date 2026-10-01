import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CHAT_FILE_MAX_BYTES, sanitizeChatFileName, UploadsService } from './uploads.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UploadsService file signature validation', () => {
  const originalUploadBase = UploadsService.UPLOAD_BASE;
  let tempDir: string;
  let service: UploadsService;
  const tx = {
    $queryRaw: jest.fn(),
    v1UploadAsset: {
      aggregate: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'teameet-upload-signature-'));
    Object.defineProperty(UploadsService, 'UPLOAD_BASE', {
      configurable: true,
      value: path.join(tempDir, 'stored'),
    });
    tx.v1UploadAsset.aggregate.mockResolvedValue({ _sum: { byteSize: 0n } });
    tx.v1UploadAsset.createMany.mockResolvedValue({ count: 1 });
    const module = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UploadsService);
  });

  afterEach(async () => {
    Object.defineProperty(UploadsService, 'UPLOAD_BASE', {
      configurable: true,
      value: originalUploadBase,
    });
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('rejects a text payload that only claims to be a PNG and removes the temp file', async () => {
    const filePath = path.join(tempDir, 'spoofed-upload');
    await fs.writeFile(filePath, '<script>alert(1)</script>');

    await expect(service.storeFiles([uploadedFile(filePath, 'image/png')], 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('accepts a file with a valid PNG signature and assigns a server-generated png name', async () => {
    const filePath = path.join(tempDir, 'valid-upload');
    await fs.writeFile(filePath, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));

    const result = await service.storeFiles([uploadedFile(filePath, 'image/png')], 'user-1');
    const relativePath = result.urls[0]?.replace(/^\/uploads\//, '');

    expect(relativePath).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]+\.png$/);
    if (relativePath) {
      await fs.rm(path.join(UploadsService.UPLOAD_BASE, relativePath), { force: true });
    }
    expect(tx.v1UploadAsset.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          ownerUserId: 'user-1',
          kind: 'image',
          mimeType: 'image/png',
          byteSize: 16n,
          url: expect.stringMatching(/^\/uploads\/\d{4}\/\d{2}\/[0-9a-f-]+\.png$/),
        }),
      ],
    });
  });

  it('rejects a request above the rolling daily quota and removes the temp file', async () => {
    const filePath = path.join(tempDir, 'daily-quota-upload');
    await fs.writeFile(filePath, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
    tx.v1UploadAsset.aggregate
      .mockResolvedValueOnce({ _sum: { byteSize: 0n } })
      .mockResolvedValueOnce({
        _sum: { byteSize: BigInt(UploadsService.DAILY_QUOTA_BYTES.image) },
      });

    await expect(
      service.storeFiles([uploadedFile(filePath, 'image/png')], 'user-1'),
    ).rejects.toMatchObject({
      response: {
        code: 'UPLOAD_STORAGE_QUOTA_EXCEEDED',
        details: { scope: 'daily', kind: 'image' },
      },
    });
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(tx.v1UploadAsset.createMany).not.toHaveBeenCalled();
  });

  it('rejects a request above the retained quota even when the daily quota is available', async () => {
    const filePath = path.join(tempDir, 'retained-quota-upload');
    await fs.writeFile(filePath, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
    tx.v1UploadAsset.aggregate
      .mockResolvedValueOnce({
        _sum: { byteSize: BigInt(UploadsService.RETAINED_QUOTA_BYTES) },
      })
      .mockResolvedValueOnce({ _sum: { byteSize: 0n } });

    await expect(
      service.storeFiles([uploadedFile(filePath, 'image/png')], 'user-1'),
    ).rejects.toMatchObject({
      response: {
        code: 'UPLOAD_STORAGE_QUOTA_EXCEEDED',
        details: { scope: 'retained', kind: 'image' },
      },
    });
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(tx.v1UploadAsset.createMany).not.toHaveBeenCalled();
  });

  it('removes moved files when the asset ledger write fails', async () => {
    const filePath = path.join(tempDir, 'ledger-failure-upload');
    await fs.writeFile(filePath, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
    tx.v1UploadAsset.createMany.mockRejectedValueOnce(new Error('ledger unavailable'));

    await expect(
      service.storeFiles([uploadedFile(filePath, 'image/png')], 'user-1'),
    ).rejects.toMatchObject({ status: 500 });

    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    const storedFiles = await listFiles(path.join(tempDir, 'stored'));
    expect(storedFiles).toEqual([]);
  });
});

async function listFiles(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const child = path.join(directory, entry.name);
        return entry.isDirectory() ? listFiles(child) : [child];
      }),
    );
    return nested.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function uploadedFile(filePath: string, mimetype: string) {
  return {
    fieldname: 'files',
    originalname: path.basename(filePath),
    encoding: '7bit',
    mimetype,
    size: 32,
    destination: path.dirname(filePath),
    filename: path.basename(filePath),
    path: filePath,
  };
}

// removeStoredUrl() (managed content-image cleanup, e.g. AdminService's stale
// asset cleanup) has no Prisma dependency itself, but the service constructor
// does — reuse the same real-tempdir convention as the suite above instead of
// a jest.mock('fs/promises') double, since storeFiles' real signature
// validation elsewhere in this file relies on real file bytes and a
// module-level fs mock would break it if it ever shared this file.
describe('UploadsService.removeStoredUrl', () => {
  const originalUploadBase = UploadsService.UPLOAD_BASE;
  let tempDir: string;
  let service: UploadsService;
  const prisma = { $transaction: jest.fn() };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'teameet-upload-remove-'));
    Object.defineProperty(UploadsService, 'UPLOAD_BASE', {
      configurable: true,
      value: path.join(tempDir, 'stored'),
    });
    const module = await Test.createTestingModule({
      providers: [UploadsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UploadsService);
  });

  afterEach(async () => {
    Object.defineProperty(UploadsService, 'UPLOAD_BASE', {
      configurable: true,
      value: originalUploadBase,
    });
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('rejects unsafe stored URLs without touching the filesystem', async () => {
    await expect(service.removeStoredUrl('/uploads/../secret.txt')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.removeStoredUrl('https://example.com/image.webp')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.removeStoredUrl('/uploads\\escape.webp')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes a valid managed URL and treats an already-missing file as cleaned', async () => {
    const relativePath = path.join('2026', '07', 'image.webp');
    const absolutePath = path.join(UploadsService.UPLOAD_BASE, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, 'content');

    await service.removeStoredUrl(`/uploads/${relativePath.split(path.sep).join('/')}`);
    await expect(fs.stat(absolutePath)).rejects.toMatchObject({ code: 'ENOENT' });

    // Already-missing file must resolve cleanly, not throw.
    await expect(
      service.removeStoredUrl(`/uploads/${relativePath.split(path.sep).join('/')}`),
    ).resolves.toBeUndefined();
  });
});

describe('UploadsService.storeChatFile (Task 181 ③)', () => {
  const originalUploadBase = UploadsService.UPLOAD_BASE;
  let tempDir: string;
  let service: UploadsService;
  const tx = {
    $queryRaw: jest.fn(),
    v1UploadAsset: { aggregate: jest.fn(), create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'teameet-chat-file-'));
    Object.defineProperty(UploadsService, 'UPLOAD_BASE', { configurable: true, value: path.join(tempDir, 'stored') });
    tx.v1UploadAsset.aggregate.mockResolvedValue({ _sum: { byteSize: 0n } });
    tx.v1UploadAsset.create.mockResolvedValue({ id: 'asset-file-1' });
    const module = await Test.createTestingModule({
      providers: [UploadsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(UploadsService);
  });

  afterEach(async () => {
    Object.defineProperty(UploadsService, 'UPLOAD_BASE', { configurable: true, value: originalUploadBase });
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function tempUpload(originalname: string, content: Buffer | string) {
    const filePath = path.join(tempDir, `tmp-${Math.random().toString(16).slice(2)}`);
    await fs.writeFile(filePath, content);
    return { ...uploadedFile(filePath, 'application/octet-stream'), fieldname: 'file', originalname };
  }

  it('PDF 는 공개 서빙 밖(.private/)에 저장하고 정리한 원래 이름·표의 MIME 으로 기록한다 — 공개 URL 은 주지 않는다', async () => {
    const file = await tempUpload('경기 일정표.pdf', '%PDF-1.7\n...');

    const result = await service.storeChatFile(file, 'user-1');

    expect(result).toEqual({ fileId: 'asset-file-1', name: '경기 일정표.pdf', size: 12, mimeType: 'application/pdf' });
    const data = tx.v1UploadAsset.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ ownerUserId: 'user-1', kind: 'file', mimeType: 'application/pdf', originalName: '경기 일정표.pdf' });
    expect(data.storagePath).toMatch(/^\.private\/\d{4}\/\d{2}\/[0-9a-f-]+\.pdf$/);
    await expect(fs.stat(path.join(UploadsService.UPLOAD_BASE, data.storagePath))).resolves.toBeTruthy();
    await expect(fs.stat(file.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('OOXML(zip)·HWP(OLE)·텍스트도 내용 시그니처로 받는다', async () => {
    await expect(service.storeChatFile(await tempUpload('명단.xlsx', Buffer.from('504b0304140000', 'hex')), 'user-1')).resolves.toMatchObject({ name: '명단.xlsx' });
    await expect(service.storeChatFile(await tempUpload('공문.hwp', Buffer.from('d0cf11e0a1b11ae10000', 'hex')), 'user-1')).resolves.toMatchObject({ mimeType: 'application/x-hwp' });
    await expect(service.storeChatFile(await tempUpload('메모.txt', '안녕하세요'), 'user-1')).resolves.toMatchObject({ mimeType: 'text/plain; charset=utf-8' });
  });

  it('경로를 포함한 요청 이름도 고정 확장자로 비공개 저장하고 prototype 키는 거부한다', async () => {
    await service.storeChatFile(await tempUpload('../../outside.PDF', '%PDF-1.7'), 'user-1');
    const data = tx.v1UploadAsset.create.mock.calls[0][0].data;
    expect(data.originalName).toBe('outside.PDF');
    expect(data.storagePath).toMatch(/^\.private\/\d{4}\/\d{2}\/[0-9a-f-]+\.pdf$/);
    await expect(fs.readFile(path.join(UploadsService.UPLOAD_BASE, data.storagePath), 'utf8')).resolves.toBe('%PDF-1.7');
    for (const extension of ['constructor', '__proto__', 'toString']) {
      const file = await tempUpload(`payload.${extension}`, '%PDF-1.7');
      await expect(service.storeChatFile(file, 'user-1')).rejects.toMatchObject({ response: { code: 'UPLOAD_FILE_TYPE_INVALID' } });
      await expect(fs.stat(file.path)).rejects.toMatchObject({ code: 'ENOENT' });
    }
    expect(tx.v1UploadAsset.create).toHaveBeenCalledTimes(1);
  });

  it('실행 파일·HTML 같은 형식은 받지 않고 임시 파일을 지운다', async () => {
    const exe = await tempUpload('setup.exe', 'MZ...');
    await expect(service.storeChatFile(exe, 'user-1')).rejects.toMatchObject({ response: { code: 'UPLOAD_FILE_TYPE_INVALID' } });
    await expect(fs.stat(exe.path)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(service.storeChatFile(await tempUpload('page.html', '<script>'), 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.v1UploadAsset.create).not.toHaveBeenCalled();
  });

  it('확장자만 PDF 인 다른 내용·NUL 이 든 텍스트·빈 파일은 400', async () => {
    await expect(service.storeChatFile(await tempUpload('fake.pdf', '<html>'), 'user-1')).rejects.toMatchObject({ response: { code: 'UPLOAD_FILE_TYPE_INVALID' } });
    await expect(service.storeChatFile(await tempUpload('bin.txt', Buffer.from([0x41, 0x00, 0x42])), 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.storeChatFile(await tempUpload('empty.pdf', ''), 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.v1UploadAsset.create).not.toHaveBeenCalled();
  });

  it('10MB 를 넘으면 400 · 파일이 없으면 400', async () => {
    const big = await tempUpload('big.pdf', Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(CHAT_FILE_MAX_BYTES)]));
    await expect(service.storeChatFile(big, 'user-1')).rejects.toMatchObject({ response: { code: 'UPLOAD_FILE_TOO_LARGE' } });
    await expect(service.storeChatFile(undefined, 'user-1')).rejects.toMatchObject({ response: { code: 'UPLOAD_FILE_REQUIRED' } });
  });

  it('하루 한도(file)를 넘으면 400 이고 저장하지 않는다', async () => {
    tx.v1UploadAsset.aggregate
      .mockResolvedValueOnce({ _sum: { byteSize: 0n } })
      .mockResolvedValueOnce({ _sum: { byteSize: BigInt(UploadsService.DAILY_QUOTA_BYTES.file) } });
    await expect(service.storeChatFile(await tempUpload('a.pdf', '%PDF-1.7'), 'user-1')).rejects.toMatchObject({
      response: { code: 'UPLOAD_STORAGE_QUOTA_EXCEEDED', details: { scope: 'daily', kind: 'file' } },
    });
    expect(tx.v1UploadAsset.create).not.toHaveBeenCalled();
  });
});

describe('sanitizeChatFileName', () => {
  it('경로 조각·제어 문자·앞쪽 점을 지우고 NFD 한글을 NFC 로 맞춘다', () => {
    expect(sanitizeChatFileName('../../etc/passwd.txt')).toBe('passwd.txt');
    expect(sanitizeChatFileName('C:\\Users\\me\\보고서.pdf')).toBe('보고서.pdf');
    expect(sanitizeChatFileName('.env.txt')).toBe('env.txt');
    expect(sanitizeChatFileName('a\u0000b\u001fc.pdf')).toBe('abc.pdf');
    expect(sanitizeChatFileName('일정표.pdf'.normalize('NFD'))).toBe('일정표.pdf');
    expect(sanitizeChatFileName('...')).toBe('file');
  });

  it('긴 이름은 확장자를 살려 120자로 줄인다', () => {
    const name = sanitizeChatFileName(`${'가'.repeat(200)}.docx`);
    expect(name).toHaveLength(120);
    expect(name.endsWith('.docx')).toBe(true);
  });
});
