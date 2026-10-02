import { Injectable } from '@nestjs/common';
import { UploadsService } from '../uploads/uploads.service';
import { lockVideoUrl } from '../games/video-url-lock';
import type { GameOperationHandler } from './v1-game-operations-worker.service';

type CleanupPayload = { url: string };

@Injectable()
export class VideoUploadCleanupService {
  constructor(
    private readonly uploads: UploadsService,
  ) {}

  readonly handler: GameOperationHandler = async (claim, tx) => {
    const payload = this.parsePayload(claim.payload);
    await lockVideoUrl(tx, payload.url);
    const teamMatchRefs = await tx.v1TeamMatchVideo.count({ where: { url: payload.url } });
    if (teamMatchRefs > 0) {
      throw new Error(`VIDEO_UPLOAD_CLEANUP references remain for ${payload.url}`);
    }
    const asset = await tx.v1UploadAsset.findUnique({ where: { url: payload.url }, select: { url: true } });
    if (asset !== null) {
      throw new Error(`VIDEO_UPLOAD_CLEANUP asset was not retired for ${payload.url}`);
    }
    // Strict unlink errors escape the handler so the existing worker retry and
    // poison policy owns the failure. ENOENT is treated as idempotent success.
    await this.uploads.removeStoredUrl(payload.url);
  };

  private parsePayload(payload: unknown): CleanupPayload {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new Error('VIDEO_UPLOAD_CLEANUP payload must be an object');
    }
    const url = (payload as { url?: unknown }).url;
    if (typeof url !== 'string' || url.length === 0) {
      throw new Error('VIDEO_UPLOAD_CLEANUP payload.url must be a non-empty string');
    }
    return { url };
  }
}
