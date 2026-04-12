import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import { UploadsService } from './uploads.service';
import { PrismaService } from '../prisma/prisma.service';

// Mock only fs/promises to avoid breaking Prisma's use of synchronous fs methods
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('sharp', () => {
  const sharpInstance = {
    metadata: jest.fn().mockResolvedValue({ width: 2000, height: 1500 }),
    resize: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue({
      data: Buffer.from('fake-image-data'),
      info: { width: 1200, height: 900, size: 102400 },
    }),
  };
  const sharpFn = jest.fn().mockReturnValue(sharpInstance);
  return sharpFn;
});

const mockUploadRecord = {
  id: 'upload-1',
  userId: 'user-1',
  filename: 'some-uuid.webp',
  originalName: 'photo.jpg',
  mimetype: 'image/webp',
  size: 102400,
  path: 'uploads/2026/04/some-uuid.webp',
  width: 1200,
  height: 900,
  createdAt: new Date('2026-04-09T00:00:00Z'),
};

const mockPrisma = {
  upload: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
};

describe('UploadsService', () => {
  let service: UploadsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UploadsService>(UploadsService);
    jest.clearAllMocks();
  });

  const makeFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File =>
    ({
      fieldname: 'files',
      originalname: 'photo.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('fake'),
      size: 1024,
      ...overrides,
    } as Express.Multer.File);

  // ─── uploadFiles ──────────────────────────────────────

  describe('uploadFiles', () => {
    it('throws BadRequestException when no files provided', async () => {
      await expect(service.uploadFiles('user-1', [])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for unsupported MIME type', async () => {
      const file = makeFile({ mimetype: 'application/pdf' });
      await expect(service.uploadFiles('user-1', [file])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when file exceeds 10MB', async () => {
      const file = makeFile({ size: 11 * 1024 * 1024 });
      await expect(service.uploadFiles('user-1', [file])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('processes valid files, writes to disk, and persists DB records', async () => {
      mockPrisma.upload.create.mockResolvedValue(mockUploadRecord);

      const file = makeFile();
      const results = await service.uploadFiles('user-1', [file]);

      expect(results).toHaveLength(1);
      expect(mockPrisma.upload.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.upload.create.mock.calls[0][0];
      expect(createCall.data.userId).toBe('user-1');
      expect(createCall.data.mimetype).toBe('image/webp');
    });

    it('processes multiple files and returns records for each', async () => {
      mockPrisma.upload.create.mockResolvedValue(mockUploadRecord);

      const files = [makeFile(), makeFile({ originalname: 'photo2.png', mimetype: 'image/png' })];
      const results = await service.uploadFiles('user-1', files);

      expect(results).toHaveLength(2);
      expect(mockPrisma.upload.create).toHaveBeenCalledTimes(2);
    });

    it('returns thumbPath alongside the upload record', async () => {
      mockPrisma.upload.create.mockResolvedValue(mockUploadRecord);

      const [result] = await service.uploadFiles('user-1', [makeFile()]);

      expect(result).toHaveProperty('thumbPath');
      expect(result.thumbPath).toMatch(/_thumb\.webp$/);
    });
  });

  // ─── getUpload ────────────────────────────────────────

  describe('getUpload', () => {
    it('returns upload when found', async () => {
      mockPrisma.upload.findUnique.mockResolvedValue(mockUploadRecord);

      const result = await service.getUpload('upload-1');

      expect(result).toEqual(mockUploadRecord);
      expect(mockPrisma.upload.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'upload-1' } }),
      );
    });

    it('throws NotFoundException when upload does not exist', async () => {
      mockPrisma.upload.findUnique.mockResolvedValue(null);

      await expect(service.getUpload('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── deleteUpload ─────────────────────────────────────

  describe('deleteUpload', () => {
    it('deletes upload and returns { deleted: true } when owner requests', async () => {
      mockPrisma.upload.findUnique.mockResolvedValue({
        id: 'upload-1',
        userId: 'user-1',
        path: 'uploads/2026/04/some-uuid.webp',
        filename: 'some-uuid.webp',
      });
      mockPrisma.upload.delete.mockResolvedValue(undefined);

      const result = await service.deleteUpload('upload-1', 'user-1');

      expect(result).toEqual({ deleted: true });
      expect(mockPrisma.upload.delete).toHaveBeenCalledWith({
        where: { id: 'upload-1' },
      });
    });

    it('throws when file deletion fails with a non-ENOENT error and keeps the DB record', async () => {
      mockPrisma.upload.findUnique.mockResolvedValue({
        id: 'upload-1',
        userId: 'user-1',
        path: 'uploads/2026/04/some-uuid.webp',
        filename: 'some-uuid.webp',
      });
      jest.mocked(fs.unlink).mockRejectedValueOnce(Object.assign(new Error('disk locked'), { code: 'EACCES' }));

      await expect(service.deleteUpload('upload-1', 'user-1')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockPrisma.upload.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when upload does not exist', async () => {
      mockPrisma.upload.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteUpload('nonexistent', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when requester is not the owner', async () => {
      mockPrisma.upload.findUnique.mockResolvedValue({
        id: 'upload-1',
        userId: 'other-user',
        path: 'uploads/2026/04/some-uuid.webp',
        filename: 'some-uuid.webp',
      });

      await expect(
        service.deleteUpload('upload-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.upload.delete).not.toHaveBeenCalled();
    });
  });
});
