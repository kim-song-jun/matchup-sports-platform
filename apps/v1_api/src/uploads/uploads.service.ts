import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

/** MIME type → file extension mapping for allowed types */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const ALLOWED_MIMETYPES = new Set(Object.keys(MIME_TO_EXT));
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file

/** Discriminated-union subset of Express.Multer.File we rely on */
interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string; // temp random hex name set by multer diskStorage
  path: string;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  /** Absolute base directory for uploaded files (relative to app cwd) */
  static readonly UPLOAD_BASE = path.join(process.cwd(), 'uploads');
  /** URL path prefix used when serving files via express.static */
  static readonly SERVE_PREFIX = '/uploads';

  async storeFiles(
    files: UploadedFile[],
    baseUrl = '',
  ): Promise<{ urls: string[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('업로드할 파일을 선택해주세요.');
    }

    const urls: string[] = [];

    for (const file of files) {
      if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
        // Remove the temp file before throwing
        await this.safeUnlink(file.path);
        throw new BadRequestException(
          `허용되지 않는 파일 형식이에요. (${file.mimetype}). jpeg, png, webp만 허용돼요.`,
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        await this.safeUnlink(file.path);
        throw new BadRequestException(
          `파일 크기가 5MB를 초과했어요. (${file.originalname})`,
        );
      }

      const ext = MIME_TO_EXT[file.mimetype] ?? 'bin';
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = String(now.getMonth() + 1).padStart(2, '0');

      const destDir = path.join(UploadsService.UPLOAD_BASE, year, month);
      await fs.mkdir(destDir, { recursive: true });

      const newFilename = `${randomUUID()}.${ext}`;
      const destPath = path.join(destDir, newFilename);

      try {
        await fs.rename(file.path, destPath);
      } catch (err) {
        // Cross-device rename (e.g. tmpdir → uploads on different mount) → copy + unlink
        if (
          err !== null &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code?: string }).code === 'EXDEV'
        ) {
          await fs.copyFile(file.path, destPath);
          await this.safeUnlink(file.path);
        } else {
          await this.safeUnlink(file.path);
          this.logger.warn(
            `파일 이동 실패 (${file.originalname}): ${err instanceof Error ? err.message : String(err)}`,
          );
          throw new BadRequestException('파일 저장에 실패했어요. 다시 시도해주세요.');
        }
      }

      // Build the publicly accessible URL
      const relativePath = `${UploadsService.SERVE_PREFIX}/${year}/${month}/${newFilename}`;
      const url = `${baseUrl}${relativePath}`;
      urls.push(url);
    }

    return { urls };
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      this.logger.warn(
        `임시 파일 삭제 실패 (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
