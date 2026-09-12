import type { Prisma } from '@prisma/client';
import { parseFixtureVideoUrl } from '../tournaments/videos/fixture-video-url';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'node:crypto';

export const VIDEO_UPLOAD_CLEANUP_TYPE = 'VIDEO_UPLOAD_CLEANUP';

/** All video writers use the same transaction-scoped lock namespace. */
export async function lockVideoUrl(tx: Prisma.TransactionClient, url: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${url}))`;
}

/**
 * The wrapper and in-transaction variant make row deletion, zero-reference
 * verification, asset retirement, and outbox creation one atomic unit. The
 * worker later performs physical deletion under the same URL lock.
 */
export async function enqueueUploadedVideoCleanup(prisma: PrismaService, url: string): Promise<void> {
  const parsed = parseFixtureVideoUrl(url);
  if (!parsed.ok || parsed.source !== 'upload') return;

  await prisma.$transaction((tx) => enqueueUploadedVideoCleanupInTx(tx, url));
}

export async function enqueueUploadedVideoCleanupInTx(tx: Prisma.TransactionClient, url: string): Promise<void> {
  const parsed = parseFixtureVideoUrl(url);
  if (!parsed.ok || parsed.source !== 'upload') return;
  await lockVideoUrl(tx, url);
  const teamMatchRefs = await tx.v1TeamMatchVideo.count({ where: { url } });
  if (teamMatchRefs > 0) return;
  await tx.v1UploadAsset.deleteMany({ where: { url } });
  await tx.$executeRaw`
      INSERT INTO v1_outbox_events
        (id, business_key, aggregate_type, aggregate_id, type, payload, available_at, status, attempts, retry_generation, version, created_at, updated_at)
      VALUES
        (${randomUUID()}, ${`video-upload-cleanup:${url}`}, 'UPLOAD_ASSET', ${url}, ${VIDEO_UPLOAD_CLEANUP_TYPE},
         ${JSON.stringify({ url })}::jsonb, CURRENT_TIMESTAMP, 'PENDING'::"V1OutboxStatus", 0, 0, 0,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (business_key) DO NOTHING
  `;
}
