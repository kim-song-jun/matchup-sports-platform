import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { UploadsService } from './uploads.service';

describe('UploadsService file signature validation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'teameet-upload-signature-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('rejects a text payload that only claims to be a PNG and removes the temp file', async () => {
    const filePath = path.join(tempDir, 'spoofed-upload');
    await fs.writeFile(filePath, '<script>alert(1)</script>');

    const service = new UploadsService();
    await expect(service.storeFiles([uploadedFile(filePath, 'image/png')])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('accepts a file with a valid PNG signature and assigns a server-generated png name', async () => {
    const filePath = path.join(tempDir, 'valid-upload');
    await fs.writeFile(filePath, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));

    const service = new UploadsService();
    const result = await service.storeFiles([uploadedFile(filePath, 'image/png')]);
    const relativePath = result.urls[0]?.replace(/^\/uploads\//, '');

    expect(relativePath).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]+\.png$/);
    if (relativePath) {
      await fs.rm(path.join(UploadsService.UPLOAD_BASE, relativePath), { force: true });
    }
  });
});

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
