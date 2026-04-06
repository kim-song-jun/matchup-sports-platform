import { PrismaClient } from '@prisma/client';
import { truncateAll } from './helpers/db-cleanup';

export default async function globalSetup(): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  try {
    await prisma.$connect();
    await truncateAll(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
