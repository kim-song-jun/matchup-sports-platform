import { PrismaClient } from '@prisma/client';

/** Singleton PrismaClient reused across all spec files. */
let _prisma: PrismaClient | undefined;

export function getPrismaTestClient(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL },
      },
    });
  }
  return _prisma;
}

export async function disconnectPrismaTestClient(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = undefined;
  }
}
