import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { UploadedFile, UploadsService } from './uploads.service';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  rename: jest.fn(),
  copyFile: jest.fn(),
  unlink: jest.fn(),
}));

const mockedFs = fs as jest.Mocked<typeof fs>;

function makeFile(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    fieldname: 'files',
    originalname: 'content.webp',
    encoding: '7bit',
    mimetype: 'image/webp',
    size: 1024,
    destination: 'uploads',
    filename: 'temporary-file',
    path: path.join(process.cwd(), 'uploads', 'temporary-file'),
    ...overrides,
  };
}

describe('UploadsService managed content images', () => {
  let service: UploadsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.rename.mockResolvedValue(undefined);
    mockedFs.copyFile.mockResolvedValue(undefined);
    mockedFs.unlink.mockResolvedValue(undefined);
    service = new UploadsService();
  });

  it('requires an uploaded file', async () => {
    await expect(service.storeFiles([])).rejects.toThrow(BadRequestException);
    expect(mockedFs.rename).not.toHaveBeenCalled();
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('stores %s with a managed %s URL', async (mimetype, extension) => {
    const result = await service.storeFiles([makeFile({ mimetype })]);

    expect(result.urls).toHaveLength(1);
    expect(result.urls[0]).toMatch(new RegExp(`^/uploads/\\d{4}/\\d{2}/[0-9a-f-]+\\.${extension}$`));
    expect(mockedFs.mkdir).toHaveBeenCalledWith(expect.stringContaining(path.join('uploads')), { recursive: true });
    expect(mockedFs.rename).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported MIME types and removes the multer temp file', async () => {
    const file = makeFile({ mimetype: 'image/gif', originalname: 'content.gif' });

    await expect(service.storeFiles([file])).rejects.toThrow(BadRequestException);

    expect(mockedFs.unlink).toHaveBeenCalledWith(file.path);
    expect(mockedFs.rename).not.toHaveBeenCalled();
  });

  it('rejects files over 5MB and removes the multer temp file', async () => {
    const file = makeFile({ size: 5 * 1024 * 1024 + 1 });

    await expect(service.storeFiles([file])).rejects.toThrow(BadRequestException);

    expect(mockedFs.unlink).toHaveBeenCalledWith(file.path);
    expect(mockedFs.rename).not.toHaveBeenCalled();
  });

  it('falls back to copy and unlink for cross-device moves', async () => {
    const file = makeFile();
    mockedFs.rename.mockRejectedValueOnce(Object.assign(new Error('cross device'), { code: 'EXDEV' }));

    const result = await service.storeFiles([file]);
    expect(result.urls).toHaveLength(1);
    expect(result.urls[0]).toMatch(/^\/uploads\//);
    expect(result.urls[0]).toMatch(/\.webp$/);

    expect(mockedFs.copyFile).toHaveBeenCalledWith(file.path, expect.stringMatching(/.webp$/));
    expect(mockedFs.unlink).toHaveBeenCalledWith(file.path);
  });

  it('rolls back temp and moved files when storage fails', async () => {
    const first = makeFile({ path: path.join(process.cwd(), 'uploads', 'first-temp') });
    const second = makeFile({ path: path.join(process.cwd(), 'uploads', 'second-temp') });
    mockedFs.rename
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('disk failed'));

    await expect(service.storeFiles([first, second])).rejects.toThrow(InternalServerErrorException);

    expect(mockedFs.unlink).toHaveBeenCalledWith(first.path);
    expect(mockedFs.unlink).toHaveBeenCalledWith(second.path);
    expect(mockedFs.unlink).toHaveBeenCalledWith(expect.stringMatching(/.webp$/));
  });

  it('rejects unsafe stored URLs without touching the filesystem', async () => {
    await expect(service.removeStoredUrl('/uploads/../secret.txt')).rejects.toThrow(BadRequestException);
    await expect(service.removeStoredUrl('https://example.com/image.webp')).rejects.toThrow(BadRequestException);
    await expect(service.removeStoredUrl('/uploads\escape.webp')).rejects.toThrow(BadRequestException);

    expect(mockedFs.unlink).not.toHaveBeenCalled();
  });

  it('removes a valid managed URL and treats an already-missing file as cleaned', async () => {
    await service.removeStoredUrl('/uploads/2026/07/image.webp');
    expect(mockedFs.unlink).toHaveBeenCalledWith(
      path.join(UploadsService.UPLOAD_BASE, '2026', '07', 'image.webp'),
    );

    mockedFs.unlink.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    await expect(service.removeStoredUrl('/uploads/2026/07/missing.webp')).resolves.toBeUndefined();
  });
});
