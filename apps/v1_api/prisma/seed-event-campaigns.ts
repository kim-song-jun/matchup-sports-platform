import { PrismaClient } from '@prisma/client';
import { ConfigModule } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  campaignAssetFile,
  createCampaignContent,
  createManagedCampaignSlug,
  DEFAULT_CAMPAIGN_ASSET_FILE,
  MANAGED_SLUG_PREFIX,
} from './seed-event-campaign-content';
import type { TournamentCampaignSeedInput } from './seed-event-campaign-content';
import {
  localEventQaRequirements,
  upsertLocalEventQaPersona,
} from './seed-event-qa-persona';

let prisma: PrismaClient | null = null;
const PUBLIC_TOURNAMENT_STATUSES = ['open', 'closed', 'in_progress', 'completed'] as const;
const LOCAL_EVENT_SEED_DATABASE = 'teameet_v1_dev';

function assertLocalSeedAllowed() {
  if (process.env.NODE_ENV?.toLowerCase() === 'production') {
    throw new Error('Refusing to seed local event campaigns in production.');
  }
  if (process.env.V1_ALLOW_LOCAL_EVENT_SEED !== 'true') {
    throw new Error(
      'Set V1_ALLOW_LOCAL_EVENT_SEED=true to confirm this local-only event campaign seed.',
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  const parsedDatabaseUrl = new URL(databaseUrl);
  const hostname = parsedDatabaseUrl.hostname.toLowerCase();
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!loopbackHosts.has(hostname)) {
    throw new Error(`Refusing to seed a non-loopback database host: ${hostname}`);
  }

  const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\/+/, ''));
  if (databaseName !== LOCAL_EVENT_SEED_DATABASE) {
    throw new Error(
      `Refusing to seed database ${databaseName || '(missing)'}; expected ${LOCAL_EVENT_SEED_DATABASE}.`,
    );
  }
}

async function ensureManagedAsset(fileName: string) {
  const source = path.resolve(
    __dirname,
    `../../v1_web/public/mock/generated/${fileName}`,
  );
  const destination = path.resolve(__dirname, `../uploads/dev-events/${fileName}`);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

async function ensureManagedImage(sportCode: string) {
  await ensureManagedAsset(campaignAssetFile(sportCode));
}

async function main() {
  await ConfigModule.forRoot();
  assertLocalSeedAllowed();
  const client = new PrismaClient();
  prisma = client;

  const tournaments: TournamentCampaignSeedInput[] = await client.v1Tournament.findMany({
    where: {
      deletedAt: null,
      status: { in: [...PUBLIC_TOURNAMENT_STATUSES] },
    },
    orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    take: 6,
    select: {
      id: true,
      title: true,
      status: true,
      format: true,
      genderCategory: true,
      scheduledAt: true,
      registrationDeadlineAt: true,
      venue: true,
      teamCount: true,
      entryFee: true,
      prizeSummary: true,
      sport: {
        select: {
          code: true,
          name: true,
        },
      },
      campaign: {
        select: {
          slug: true,
          publishedAt: true,
        },
      },
    },
  });

  if (tournaments.length === 0) {
    throw new Error('No eligible local tournaments were found for event campaign seeding.');
  }

  const [qaSport, qaRegion, qaSportLevel] = await Promise.all([
    client.v1Sport.findUnique({
      where: { code: localEventQaRequirements.sportCode },
      select: { id: true, isActive: true },
    }),
    client.v1Region.findUnique({
      where: { code: localEventQaRequirements.regionCode },
      select: { id: true, isActive: true },
    }),
    client.v1SportLevel.findFirst({
      where: {
        sport: { code: localEventQaRequirements.sportCode },
        code: localEventQaRequirements.sportLevelCode,
        isActive: true,
      },
      select: { id: true },
    }),
  ]);
  if (!qaSport?.isActive) {
    throw new Error(
      `Required active sport was not found: ${localEventQaRequirements.sportCode}`,
    );
  }
  if (!qaRegion?.isActive) {
    throw new Error(
      `Required active region was not found: ${localEventQaRequirements.regionCode}`,
    );
  }
  if (!qaSportLevel) {
    throw new Error(
      `Required active sport level was not found: ${localEventQaRequirements.sportCode}/${localEventQaRequirements.sportLevelCode}`,
    );
  }

  await Promise.all(
    [
      ...[...new Set(tournaments.map((tournament) => tournament.sport.code))].map(
        ensureManagedImage,
      ),
      ensureManagedAsset(DEFAULT_CAMPAIGN_ASSET_FILE),
    ],
  );

  const result = await client.$transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    let preserved = 0;
    const managedCampaigns: Array<{ slug: string; tournamentTitle: string }> = [];
    const now = new Date();
    const qaPersona = await upsertLocalEventQaPersona(tx, {
      sportId: qaSport.id,
      sportLevelId: qaSportLevel.id,
      regionId: qaRegion.id,
    });

    for (const tournament of tournaments) {
      if (tournament.campaign && !tournament.campaign.slug.startsWith(MANAGED_SLUG_PREFIX)) {
        preserved += 1;
        continue;
      }

      const slug = createManagedCampaignSlug(tournament);
      const content = createCampaignContent(tournament);
      if (tournament.campaign) {
        await tx.v1TournamentCampaign.update({
          where: { tournamentId: tournament.id },
          data: {
            slug,
            status: 'published',
            content,
            publishedAt: tournament.campaign.publishedAt ?? now,
            archivedAt: null,
          },
        });
        updated += 1;
      } else {
        await tx.v1TournamentCampaign.create({
          data: {
            tournamentId: tournament.id,
            slug,
            status: 'published',
            content,
            publishedAt: now,
          },
        });
        created += 1;
      }
      managedCampaigns.push({ slug, tournamentTitle: tournament.title });
    }

    return { created, updated, preserved, managedCampaigns, qaPersona };
  });

  console.log(
    JSON.stringify({
      status: 'ok',
      ...result,
    }),
  );
}

main()
  .then(async () => {
    await prisma?.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma?.$disconnect();
    process.exit(1);
  });
