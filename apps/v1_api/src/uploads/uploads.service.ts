import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

/** 업로드 종류별 허용 MIME → 확장자, 크기 한도 */
export type UploadKind = 'image' | 'video';

const KIND_RULES: Record<
  UploadKind,
  { mimeToExt: Record<string, string>; maxBytes: number; limitLabel: string; typeLabel: string }
> = {
  image: {
    mimeToExt: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
    maxBytes: 5 * 1024 * 1024,
    limitLabel: '5MB',
    typeLabel: 'jpeg, png, webp',
  },
  video: {
    mimeToExt: { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' },
    maxBytes: 200 * 1024 * 1024,
    limitLabel: '200MB',
    typeLabel: 'mp4, webm, mov',
  },
};

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
    kind: UploadKind = 'image',
    /** userId is used for audit logging only; full per-user quota requires an
     *  uploads ownership table (schema change tracked as follow-up). */
    userId?: string,
  ): Promise<{ urls: string[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException({
        code: 'UPLOAD_FILE_REQUIRED',
        message: '업로드할 파일을 선택해주세요.',
      });
    }

    const rules = KIND_RULES[kind];

    // 1. Validate ALL files before moving any, so a later validation failure never
    //    leaves earlier files orphaned on disk. On failure, unlink every temp file.
    for (const file of files) {
      if (!(file.mimetype in rules.mimeToExt)) {
        await this.unlinkTemps(files);
        throw new BadRequestException({
          code: 'UPLOAD_FILE_TYPE_INVALID',
          message: `허용되지 않는 파일 형식이에요. (${file.mimetype}). ${rules.typeLabel}만 허용돼요.`,
        });
      }
      if (file.size > rules.maxBytes) {
        await this.unlinkTemps(files);
        throw new BadRequestException({
          code: 'UPLOAD_FILE_TOO_LARGE',
          message: `파일 크기가 ${rules.limitLabel}를 초과했어요. (${file.originalname})`,
        });
      }

      let signatureValid: boolean;
      try {
        signatureValid = await hasExpectedFileSignature(file.path, file.mimetype);
      } catch (err) {
        await this.unlinkTemps(files);
        this.logger.error(
          `업로드 파일 시그니처 확인 실패 (${file.originalname}): ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new InternalServerErrorException('파일을 확인하지 못했어요. 다시 시도해주세요.');
      }
      if (!signatureValid) {
        await this.unlinkTemps(files);
        throw new BadRequestException({
          code: 'UPLOAD_FILE_TYPE_INVALID',
          message: `파일 내용과 형식이 일치하지 않아요. (${file.originalname})`,
        });
      }
    }

    // 2. Move all validated files. If any move fails, clean up everything already
    //    moved (and remaining temps) so a partial failure leaves no orphan files.
    const urls: string[] = [];
    const movedPaths: string[] = [];
    try {
      for (const file of files) {
        const ext = rules.mimeToExt[file.mimetype] ?? 'bin';
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

    this.logger.log(
      `Stored ${urls.length} ${kind} file(s)${userId ? ` for user ${userId}` : ''}: ${urls.join(', ')}`,
    );
    return { urls };
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

async function hasExpectedFileSignature(filePath: string, mimetype: string): Promise<boolean> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);

    switch (mimetype) {
      case 'image/jpeg':
        return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
      case 'image/png':
        return header.length >= 8 && header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
      case 'image/webp':
        return header.length >= 12
          && header.subarray(0, 4).toString('ascii') === 'RIFF'
          && header.subarray(8, 12).toString('ascii') === 'WEBP';
      case 'video/webm':
        return header.length >= 4 && header.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'));
      case 'video/mp4':
      case 'video/quicktime':
        return header.length >= 12 && header.subarray(4, 8).toString('ascii') === 'ftyp';
      default:
        return false;
    }
  } finally {
    await handle.close();
  }
}
