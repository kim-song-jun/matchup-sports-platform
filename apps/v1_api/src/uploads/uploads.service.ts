import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** 업로드 종류별 허용 MIME → 확장자, 크기 한도 */
export type UploadKind = 'image' | 'video';
/** 하루 한도를 세는 종류 — 채팅 파일(`storeChatFile`)은 MIME 규칙 대신 확장자 표로 검사한다. */
type QuotaKind = UploadKind | 'file';

/** 채팅 파일 한도(Task 181 ③). multer 하드캡은 이보다 조금 커서 넘치는 파일도 한국어 400 을 받는다. */
export const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * 채팅으로 보낼 수 있는 문서 — **확장자로 고르고 내용 시그니처로 확인**한다. 브라우저가 보내는 MIME 은
 * 기기마다 달라(한글 .hwp 는 octet-stream 등) 믿지 않고, 저장·다운로드 MIME 은 이 표의 값을 쓴다.
 * 실행 파일·HTML·SVG 처럼 열면 실행되거나 렌더되는 형식은 받지 않는다.
 */
export const CHAT_FILE_TYPES: Record<string, { mime: string; signature: 'pdf' | 'zip' | 'ole' | 'text' }> = {
  pdf: { mime: 'application/pdf', signature: 'pdf' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signature: 'zip' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signature: 'zip' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', signature: 'zip' },
  hwpx: { mime: 'application/hwp+zip', signature: 'zip' },
  zip: { mime: 'application/zip', signature: 'zip' },
  doc: { mime: 'application/msword', signature: 'ole' },
  xls: { mime: 'application/vnd.ms-excel', signature: 'ole' },
  ppt: { mime: 'application/vnd.ms-powerpoint', signature: 'ole' },
  hwp: { mime: 'application/x-hwp', signature: 'ole' },
  txt: { mime: 'text/plain; charset=utf-8', signature: 'text' },
  csv: { mime: 'text/csv; charset=utf-8', signature: 'text' },
};
const CHAT_FILE_TYPE_LABEL = 'PDF·워드·엑셀·파워포인트·한글·텍스트·CSV·ZIP';

/**
 * 다운로드 이름으로 쓸 파일 이름 정리 — 경로 조각·제어 문자·앞쪽 점을 지우고(숨김 파일·경로 조작 방지),
 * macOS 가 보내는 NFD 한글을 NFC 로 맞추고, 확장자를 살려 120자로 줄인다.
 */
export function sanitizeChatFileName(raw: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? '').normalize('NFC');
  // eslint-disable-next-line no-control-regex -- 제어 문자를 지우는 것이 목적이다.
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+/, '').trim();
  if (cleaned.length <= 120) return cleaned || 'file';
  const ext = path.extname(cleaned);
  return `${cleaned.slice(0, 120 - ext.length)}${ext}`;
}

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

  constructor(private readonly prisma: PrismaService) {}

  /** Absolute base directory for uploaded files (relative to app cwd) */
  static readonly UPLOAD_BASE = path.join(process.cwd(), 'uploads');
  /** URL path prefix used when serving files via express.static */
  static readonly SERVE_PREFIX = '/uploads';
  static readonly RETAINED_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;
  static readonly DAILY_QUOTA_BYTES: Record<QuotaKind, number> = {
    image: 50 * 1024 * 1024,
    video: 500 * 1024 * 1024,
    file: 50 * 1024 * 1024,
  };
  /**
   * 채팅 파일을 두는 하위 폴더. 같은 영구 볼륨(`uploads/`) 안이지만 **점으로 시작해 공개 정적 서빙이 거부**한다
   * (`main.ts` 의 `dotfiles: 'deny'`) — 방 참여자만 `GET /chat/rooms/:id/messages/:id/file` 로 받는다.
   * 새 볼륨을 만들면 배포 설정까지 바꿔야 해서 같은 볼륨 안에 둔다.
   */
  static readonly PRIVATE_DIR = '.private';
  /** `/uploads` 공개 정적 서빙 옵션 — 점으로 시작하는 경로(`.private/`)를 403 으로 거부한다. main.ts 와 테스트가 같은 값을 쓴다. */
  static readonly STATIC_OPTIONS = { dotfiles: 'deny' } as const;

  async storeFiles(
    files: UploadedFile[],
    userId: string,
    baseUrl = '',
    kind: UploadKind = 'image',
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
    const validatedFiles: Array<{ file: UploadedFile; byteSize: number }> = [];
    for (const file of files) {
      if (!(file.mimetype in rules.mimeToExt)) {
        await this.unlinkTemps(files);
        throw new BadRequestException({
          code: 'UPLOAD_FILE_TYPE_INVALID',
          message: `허용되지 않는 파일 형식이에요. (${file.mimetype}). ${rules.typeLabel}만 허용돼요.`,
        });
      }
      let byteSize: number;
      try {
        byteSize = (await fs.stat(file.path)).size;
      } catch (err) {
        await this.unlinkTemps(files);
        this.logger.error(
          `업로드 파일 크기 확인 실패 (${file.originalname}): ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new InternalServerErrorException('파일을 확인하지 못했어요. 다시 시도해주세요.');
      }
      if (byteSize > rules.maxBytes) {
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
      validatedFiles.push({ file, byteSize });
    }

    // 2. Move all validated files. If any move fails, clean up everything already
    //    moved (and remaining temps) so a partial failure leaves no orphan files.
    const urls: string[] = [];
    const movedPaths: string[] = [];
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM "v1_users"
          WHERE id = ${userId}
          FOR UPDATE
        `;

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const retained = await tx.v1UploadAsset.aggregate({
          where: { ownerUserId: userId },
          _sum: { byteSize: true },
        });
        const daily = await tx.v1UploadAsset.aggregate({
          where: { ownerUserId: userId, kind, createdAt: { gte: since } },
          _sum: { byteSize: true },
        });
        const incomingBytes = validatedFiles.reduce((sum, item) => sum + item.byteSize, 0);
        this.assertQuota(
          kind,
          Number(retained._sum.byteSize ?? 0n),
          Number(daily._sum.byteSize ?? 0n),
          incomingBytes,
        );

        const assets: Array<{
          ownerUserId: string;
          kind: UploadKind;
          mimeType: string;
          byteSize: bigint;
          url: string;
          storagePath: string;
        }> = [];
        for (const { file, byteSize } of validatedFiles) {
          const ext = rules.mimeToExt[file.mimetype] ?? 'bin';
          const now = new Date();
          const year = now.getFullYear().toString();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const storagePath = path.posix.join(year, month, `${randomUUID()}.${ext}`);
          const destPath = path.join(UploadsService.UPLOAD_BASE, storagePath);
          const rootRelativeUrl = `${UploadsService.SERVE_PREFIX}/${storagePath}`;

          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await this.moveFile(file.path, destPath);
          movedPaths.push(destPath);
          urls.push(`${baseUrl}${rootRelativeUrl}`);
          assets.push({
            ownerUserId: userId,
            kind,
            mimeType: file.mimetype,
            byteSize: BigInt(byteSize),
            url: rootRelativeUrl,
            storagePath,
          });
        }

        await tx.v1UploadAsset.createMany({ data: assets });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err) {
      // Roll back: remove already-moved files + any remaining temps.
      await Promise.all(movedPaths.map((p) => this.safeUnlink(p)));
      await this.unlinkTemps(files);
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`업로드 저장 실패 — 이동된 ${movedPaths.length}개 정리: ${err instanceof Error ? err.message : String(err)}`);
      // 형식/크기 검증 실패는 위에서 400으로 끝났고, 여기 도달하는 건 디스크/권한/마운트
      // 등 서버 내부 오류 → 클라이언트 입력 문제가 아니므로 500으로 분리.
      throw new InternalServerErrorException('파일 저장에 실패했어요. 다시 시도해주세요.');
    }

    this.logger.log(
      `Stored ${urls.length} ${kind} file(s)${userId ? ` for user ${userId}` : ''}: ${urls.join(', ')}`,
    );
    return { urls };
  }

  /**
   * 채팅 파일 한 개를 비공개 폴더에 저장한다(Task 181 ③). 형식(확장자 표)·내용 시그니처·10MB·하루/보관 한도를
   * 확인하고, 실패하면 임시 파일을 지운다. 돌려주는 `fileId` 로 채팅 메시지를 보낸다 — 공개 URL 은 주지 않는다.
   */
  async storeChatFile(
    file: UploadedFile | undefined,
    userId: string,
  ): Promise<{ fileId: string; name: string; size: number; mimeType: string }> {
    if (!file) {
      throw new BadRequestException({ code: 'UPLOAD_FILE_REQUIRED', message: '보낼 파일을 선택해주세요.' });
    }
    const name = sanitizeChatFileName(file.originalname);
    const ext = path.extname(name).slice(1).toLowerCase();
    const type = CHAT_FILE_TYPES[ext];
    if (!type) {
      await this.unlinkTemps([file]);
      throw new BadRequestException({
        code: 'UPLOAD_FILE_TYPE_INVALID',
        message: `보낼 수 없는 파일 형식이에요. ${CHAT_FILE_TYPE_LABEL} 파일만 보낼 수 있어요.`,
      });
    }
    let byteSize: number;
    let signatureValid: boolean;
    try {
      byteSize = (await fs.stat(file.path)).size;
      signatureValid = byteSize > 0 && (await hasChatFileSignature(file.path, type.signature));
    } catch (err) {
      await this.unlinkTemps([file]);
      this.logger.error(`채팅 파일 확인 실패 (${name}): ${err instanceof Error ? err.message : String(err)}`);
      throw new InternalServerErrorException('파일을 확인하지 못했어요. 다시 시도해주세요.');
    }
    if (byteSize > CHAT_FILE_MAX_BYTES) {
      await this.unlinkTemps([file]);
      throw new BadRequestException({ code: 'UPLOAD_FILE_TOO_LARGE', message: `파일 크기가 10MB를 초과했어요. (${name})` });
    }
    if (!signatureValid) {
      await this.unlinkTemps([file]);
      throw new BadRequestException({ code: 'UPLOAD_FILE_TYPE_INVALID', message: `파일 내용과 형식이 일치하지 않아요. (${name})` });
    }

    const now = new Date();
    const storagePath = path.posix.join(
      UploadsService.PRIVATE_DIR,
      now.getFullYear().toString(),
      String(now.getMonth() + 1).padStart(2, '0'),
      `${randomUUID()}.${ext}`,
    );
    const destPath = path.join(UploadsService.UPLOAD_BASE, storagePath);
    let moved = false;
    try {
      const asset = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "v1_users" WHERE id = ${userId} FOR UPDATE`;
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const retained = await tx.v1UploadAsset.aggregate({ where: { ownerUserId: userId }, _sum: { byteSize: true } });
        const daily = await tx.v1UploadAsset.aggregate({
          where: { ownerUserId: userId, kind: 'file', createdAt: { gte: since } },
          _sum: { byteSize: true },
        });
        this.assertQuota('file', Number(retained._sum.byteSize ?? 0n), Number(daily._sum.byteSize ?? 0n), byteSize);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await this.moveFile(file.path, destPath);
        moved = true;
        return tx.v1UploadAsset.create({
          data: {
            ownerUserId: userId,
            kind: 'file',
            mimeType: type.mime,
            byteSize: BigInt(byteSize),
            // 공개 경로 모양이지만 `.private` 라 정적 서빙이 거부한다 — 유일성 칸을 채우는 식별자일 뿐이다.
            url: `${UploadsService.SERVE_PREFIX}/${storagePath}`,
            storagePath,
            originalName: name,
          },
          select: { id: true },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { fileId: asset.id, name, size: byteSize, mimeType: type.mime };
    } catch (err) {
      if (moved) await this.safeUnlink(destPath);
      await this.unlinkTemps([file]);
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`채팅 파일 저장 실패: ${err instanceof Error ? err.message : String(err)}`);
      throw new InternalServerErrorException('파일 저장에 실패했어요. 다시 시도해주세요.');
    }
  }

  private assertQuota(
    kind: QuotaKind,
    retainedBytes: number,
    dailyBytes: number,
    incomingBytes: number,
  ) {
    const dailyLimit = UploadsService.DAILY_QUOTA_BYTES[kind];
    const retainedLimit = UploadsService.RETAINED_QUOTA_BYTES;
    const scope =
      dailyBytes + incomingBytes > dailyLimit
        ? 'daily'
        : retainedBytes + incomingBytes > retainedLimit
          ? 'retained'
          : null;
    if (!scope) return;

    const usedBytes = scope === 'daily' ? dailyBytes : retainedBytes;
    const limitBytes = scope === 'daily' ? dailyLimit : retainedLimit;
    throw new BadRequestException({
      code: 'UPLOAD_STORAGE_QUOTA_EXCEEDED',
      message: '업로드 저장 한도를 초과했어요. 잠시 후 다시 시도하거나 운영팀에 문의해주세요.',
      details: { scope, kind, usedBytes, incomingBytes, limitBytes },
    });
  }

  private async moveFile(sourcePath: string, destinationPath: string) {
    try {
      await fs.rename(sourcePath, destinationPath);
    } catch (err) {
      if (
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'EXDEV'
      ) {
        await fs.copyFile(sourcePath, destinationPath);
        await this.safeUnlink(sourcePath);
        return;
      }
      throw err;
    }
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
    await this.strictUnlink(resolvedPath);
  }

  /**
   * Best-effort cleanup of multer temp files for a request that will never reach
   * `storeFiles()`. Multer writes the upload to disk BEFORE the handler runs, so a request
   * rejected by an authorization check inside a service (rather than by a guard) still leaves
   * temp files behind unless the rejecting caller discards them -- see
   * `TournamentFixtureVideosService.uploadAndCreateVideo()`.
   */
  async discardTemps(files: UploadedFile[]): Promise<void> {
    await this.unlinkTemps(files);
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

  private async strictUnlink(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'ENOENT'
      ) return;
      throw err;
    }
  }
}

/** 채팅 파일 내용 확인 — PDF·ZIP 계열(OOXML·HWPX)·OLE 계열(옛 오피스·HWP) 머리 바이트, 텍스트는 앞 8KB 에 NUL 없음. */
async function hasChatFileSignature(filePath: string, kind: 'pdf' | 'zip' | 'ole' | 'text'): Promise<boolean> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(kind === 'text' ? 8192 : 8);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead);
    switch (kind) {
      case 'pdf':
        return header.subarray(0, 5).toString('ascii') === '%PDF-';
      case 'zip':
        return header.length >= 4 && header[0] === 0x50 && header[1] === 0x4b && [0x03, 0x05].includes(header[2]) && [0x04, 0x06].includes(header[3]);
      case 'ole':
        return header.length >= 8 && header.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'));
      case 'text':
        return !header.includes(0);
    }
  } finally {
    await handle.close();
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
