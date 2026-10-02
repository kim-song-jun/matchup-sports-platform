import { PrismaClient, V1AdminRole } from '@prisma/client';

const LOCAL_SHOWCASE_DATABASE = 'teameet_alpha';
const LOCAL_SHOWCASE_HOST = 'v1_postgres';
const LOCAL_ADMIN_USER_ID = 'af100000-0000-4000-8000-000000000001';

function assertLocalShowcaseDatabase(databaseUrl: string | undefined) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (parsed.hostname !== LOCAL_SHOWCASE_HOST || databaseName !== LOCAL_SHOWCASE_DATABASE) {
    throw new Error(`Refusing local showcase admin seed for ${parsed.hostname}/${databaseName || '(missing)'}.`);
  }
}

async function main() {
  assertLocalShowcaseDatabase(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  try {
    const user = await prisma.v1User.upsert({
      where: { id: LOCAL_ADMIN_USER_ID },
      update: { accountStatus: 'active', onboardingStatus: 'completed', deletedAt: null },
      create: {
        id: LOCAL_ADMIN_USER_ID,
        email: 'local.showcase.admin@teameet.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
      },
    });
    await prisma.v1AdminUser.upsert({
      where: { userId: user.id },
      update: { adminRole: V1AdminRole.owner, status: 'active', revokedAt: null },
      create: { userId: user.id, adminRole: V1AdminRole.owner, status: 'active' },
    });
    process.stdout.write('{status:ok,adminUsers:1}\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
