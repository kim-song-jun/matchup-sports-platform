import * as fs from 'fs';
import { softDeleteE2EUsers } from './fixtures/db-runtime';
import { E2E_AUTH_DIR } from './fixtures/runtime';

/**
 * Clean up E2E test artifacts.
 * Auth state JSON files are removed so the next run starts fresh.
 * DB cleanup soft-deletes E2E users so the next run can recreate them
 * without requiring host Prisma dependencies.
 */
export default async function globalTeardown() {
  // Remove stored auth state files
  if (fs.existsSync(E2E_AUTH_DIR)) {
    const files = fs.readdirSync(E2E_AUTH_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        fs.unlinkSync(`${E2E_AUTH_DIR}/${file}`);
      } catch {
        // ignore
      }
    }
    console.log('[global-teardown] Removed auth state files.');
  }

  try {
    softDeleteE2EUsers();
    console.log('[global-teardown] Soft-deleted E2E users.');
  } catch (err) {
    console.warn(`[global-teardown] DB cleanup failed (non-fatal): ${err}`);
  }

  console.log('[global-teardown] Done.');
}
