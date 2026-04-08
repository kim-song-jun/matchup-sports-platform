import { PrismaClient } from '@prisma/client';
import { syncImageData } from './sync-image-data';

const prisma = new PrismaClient();

async function main() {
  await syncImageData(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
