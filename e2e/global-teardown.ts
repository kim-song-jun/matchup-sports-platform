import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const AUTH_DIR = path.join(__dirname, '.auth');

/**
 * Clean up E2E test artifacts.
 * Auth state JSON files are removed so the next run starts fresh.
 * DB cleanup removes all users whose nicknames end with 'E2E' and their
 * associated data (cascaded via Prisma relations).
 */
export default async function globalTeardown() {
  // Remove stored auth state files
  if (fs.existsSync(AUTH_DIR)) {
    const files = fs.readdirSync(AUTH_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(AUTH_DIR, file));
      } catch {
        // ignore
      }
    }
    console.log('[global-teardown] Removed auth state files.');
  }

  // Best-effort: remove E2E users and cascaded data via Prisma
  const prisma = new PrismaClient();
  try {
    const deleted = await prisma.user.deleteMany({
      where: { nickname: { endsWith: 'E2E' } },
    });
    console.log(`[global-teardown] Removed ${deleted.count} E2E user(s) from DB.`);
  } catch (err) {
    console.warn(`[global-teardown] DB cleanup failed (non-fatal): ${err}`);
  } finally {
    await prisma.$disconnect();
  }

  console.log('[global-teardown] Done.');
}
