import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UploadsService } from './uploads.service';
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
