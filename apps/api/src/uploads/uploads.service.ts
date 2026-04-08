import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_MIMETYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_WIDTH = 1200;
const THUMB_WIDTH = 300;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Processes and persists one or more uploaded files for a given user.
   * Each file is resized to max 1200px width, converted to webp, and a
   * 300px thumbnail is generated alongside it.
   */
  async uploadFiles(
    userId: string,
    files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    for (const file of files) {
      if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
        throw new BadRequestException(
          `Unsupported file type: ${file.mimetype}. Allowed: jpeg, png, webp, gif`,
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new BadRequestException(
          `File ${file.originalname} exceeds 10MB limit`,
        );
      }
    }

    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const baseDir = path.join(process.cwd(), 'uploads', year, month);
    await fs.mkdir(baseDir, { recursive: true });

    const results = await Promise.all(
      files.map((file) => this.processSingleFile(userId, file, baseDir, year, month)),
    );

    return results;
  }

  private async processSingleFile(
    userId: string,
    file: Express.Multer.File,
    baseDir: string,
    year: string,
    month: string,
  ) {
    const cuid = randomUUID();
    const filename = `${cuid}.webp`;
    const thumbFilename = `${cuid}_thumb.webp`;

    const relativePath = `uploads/${year}/${month}/${filename}`;
    const relativeThumbPath = `uploads/${year}/${month}/${thumbFilename}`;

    const absolutePath = path.join(baseDir, filename);
    const absoluteThumbPath = path.join(baseDir, thumbFilename);

    const image = sharp(file.buffer);
    const metadata = await image.metadata();

    const shouldResize =
      metadata.width !== undefined && metadata.width > MAX_WIDTH;

    const processedImage = shouldResize
      ? image.resize({ width: MAX_WIDTH, withoutEnlargement: true })
      : image;

    const { data: mainData, info: mainInfo } = await processedImage
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });

    await fs.writeFile(absolutePath, mainData);

    const { data: thumbData } = await sharp(file.buffer)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer({ resolveWithObject: true });

    await fs.writeFile(absoluteThumbPath, thumbData);

    const record = await this.prisma.upload.create({
      data: {
        userId,
        filename,
        originalName: file.originalname,
        mimetype: 'image/webp',
        size: mainInfo.size,
        path: relativePath,
        width: mainInfo.width,
        height: mainInfo.height,
      },
      select: {
        id: true,
        userId: true,
        filename: true,
        originalName: true,
        mimetype: true,
        size: true,
        path: true,
        width: true,
        height: true,
        createdAt: true,
      },
    });

    return {
      ...record,
      thumbPath: relativeThumbPath,
    };
  }

  /**
   * Returns upload metadata by id. Throws 404 if not found.
   */
  async getUpload(id: string) {
    const upload = await this.prisma.upload.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        filename: true,
        originalName: true,
        mimetype: true,
        size: true,
        path: true,
        width: true,
        height: true,
        createdAt: true,
      },
    });

    if (!upload) {
      throw new NotFoundException('Upload not found');
    }

    return upload;
  }

  /**
   * Deletes an upload record and its associated files from disk.
   * Throws 403 if the requesting user does not own the upload.
   */
  async deleteUpload(id: string, userId: string) {
    const upload = await this.prisma.upload.findUnique({
      where: { id },
      select: { id: true, userId: true, path: true, filename: true },
    });

    if (!upload) {
      throw new NotFoundException('Upload not found');
    }

    if (upload.userId !== userId) {
      throw new ForbiddenException('You do not own this upload');
    }

    await this.prisma.upload.delete({ where: { id } });

    const mainAbsPath = path.join(process.cwd(), upload.path);
    const thumbAbsPath = mainAbsPath.replace('.webp', '_thumb.webp');

    await Promise.allSettled([
      fs.unlink(mainAbsPath),
      fs.unlink(thumbAbsPath),
    ]);

    return { deleted: true };
  }
}
