import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
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
export interface UploadedFile {
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

    // 1. Validate ALL files before moving any, so a later validation failure never
    //    leaves earlier files orphaned on disk. On failure, unlink every temp file.
    for (const file of files) {
      if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
        await this.unlinkTemps(files);
        throw new BadRequestException(
          `허용되지 않는 파일 형식이에요. (${file.mimetype}). jpeg, png, webp만 허용돼요.`,
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        await this.unlinkTemps(files);
        throw new BadRequestException(
          `파일 크기가 5MB를 초과했어요. (${file.originalname})`,
        );
      }
    }

    // 2. Move all validated files. If any move fails, clean up everything already
    //    moved (and remaining temps) so a partial failure leaves no orphan files.
    const urls: string[] = [];
    const movedPaths: string[] = [];
    try {
      for (const file of files) {
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
            throw err;
          }
        }

        movedPaths.push(destPath);
        urls.push(
          `${baseUrl}${UploadsService.SERVE_PREFIX}/${year}/${month}/${newFilename}`,
        );
      }
    } catch (err) {
      // Roll back: remove already-moved files + any remaining temps.
      await Promise.all(movedPaths.map((p) => this.safeUnlink(p)));
      await this.unlinkTemps(files);
      this.logger.error(
        `업로드 이동 실패 — 이동된 ${movedPaths.length}개 정리: ${err instanceof Error ? err.message : String(err)}`,
      );
      // 형식/크기 검증 실패는 위에서 400으로 끝났고, 여기 도달하는 건 디스크/권한/마운트
      // 등 서버 내부 오류 → 클라이언트 입력 문제가 아니므로 500으로 분리.
      throw new InternalServerErrorException('파일 저장에 실패했어요. 다시 시도해주세요.');
    }

    return { urls };
  }

  async removeStoredUrl(url: string): Promise<void> {
    if (!url.startsWith(`${UploadsService.SERVE_PREFIX}/`) || url.includes('\\')) {
      throw new BadRequestException('삭제할 업로드 경로가 올바르지 않아요.');
    }
    const relativePath = url.slice(UploadsService.SERVE_PREFIX.length + 1);
    const basePath = path.resolve(UploadsService.UPLOAD_BASE);
    const resolvedPath = path.resolve(basePath, relativePath);
    if (!resolvedPath.startsWith(`${basePath}${path.sep}`)) {
      throw new BadRequestException('삭제할 업로드 경로가 올바르지 않아요.');
    }
    await this.safeUnlink(resolvedPath);
  }

  /** Best-effort cleanup of all multer temp files (e.g. on a validation failure). */
  private async unlinkTemps(files: UploadedFile[]): Promise<void> {
    await Promise.all(files.map((f) => this.safeUnlink(f.path)));
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      // Already gone (e.g. moved by a successful rename) — not an error.
      if (
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'ENOENT'
      ) {
        return;
      }
      this.logger.warn(
        `임시 파일 삭제 실패 (${filePath}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
