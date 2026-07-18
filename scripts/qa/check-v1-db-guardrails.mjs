import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const deployFiles = [
  '.github/workflows/deploy.yml',
  'deploy/restart-containers.sh',
  'deploy/setup-ec2.sh',
];

const forbiddenPatterns = [
  {
    pattern: 'prisma db push --skip-generate',
    message: 'v1 production deploy must not run prisma db push.',
  },
  {
    pattern: 'DEPLOY_SYNC_V1_SEED_DATA:-true',
    message: 'v1 seed sync must default to disabled in production deploy scripts.',
  },
];

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', options.allowFailure ? 'ignore' : 'pipe'],
  }).trim();
}

function changedFilesForRange() {
  const head = process.env.GITHUB_SHA || 'HEAD';
  const files = new Set();

  const before = process.env.GITHUB_EVENT_BEFORE;
  if (before && !/^0+$/.test(before)) {
    for (const file of git(['diff', '--name-only', before, head]).split(/\r?\n/).filter(Boolean)) {
      files.add(file);
    }
    return files;
  }

  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    try {
      git(['fetch', '--no-tags', '--depth=1', 'origin', baseRef], { allowFailure: true });
      for (const file of git(['diff', '--name-only', `origin/${baseRef}...${head}`]).split(/\r?\n/).filter(Boolean)) {
        files.add(file);
      }
      return files;
    } catch {
      // Fall through to local diff.
    }
  }

  try {
    for (const file of git(['diff', '--name-only', 'HEAD~1', head]).split(/\r?\n/).filter(Boolean)) {
      files.add(file);
    }
  } catch {
    // A first commit or shallow local checkout can lack HEAD~1.
  }

  for (const file of git(['diff', '--name-only']).split(/\r?\n/).filter(Boolean)) {
    files.add(file);
  }
  for (const file of git(['diff', '--name-only', '--cached']).split(/\r?\n/).filter(Boolean)) {
    files.add(file);
  }
  for (const file of git(['ls-files', '--others', '--exclude-standard']).split(/\r?\n/).filter(Boolean)) {
    files.add(file);
  }

  return files;
}

function checkForbiddenDeployPatterns(errors) {
  for (const file of deployFiles) {
    if (!existsSync(file)) {
      errors.push(`${file} is missing; cannot verify v1 deploy DB guardrails.`);
      continue;
    }

    const content = readFileSync(file, 'utf8');
    for (const { pattern, message } of forbiddenPatterns) {
      if (content.includes(pattern)) {
        errors.push(`${file}: forbidden pattern "${pattern}". ${message}`);
      }
    }
  }
}

function checkSchemaMigrationPair(errors) {
  const changed = changedFilesForRange();
  const schemaChanged = changed.has('apps/v1_api/prisma/schema.prisma');
  const migrationChanged = [...changed].some((file) => file.startsWith('apps/v1_api/prisma/migrations/'));

  if (schemaChanged && !migrationChanged) {
    errors.push(
      [
        'apps/v1_api/prisma/schema.prisma changed without a matching migration under apps/v1_api/prisma/migrations/.',
        'Create and review a Prisma migration before merging a v1 schema change.',
      ].join(' '),
    );
  }
}

function checkProfileAndTeamChatBackfills(errors) {
  const realNameMigration = readFileSync(
    'apps/v1_api/prisma/migrations/20260716090000_v1_user_profile_real_name/migration.sql',
    'utf8',
  );
  const teamChatMigration = readFileSync(
    'apps/v1_api/prisma/migrations/20260716100000_v1_team_chat_membership_backfill/migration.sql',
    'utf8',
  );

  const requiredRealNamePatterns = [
    'SET "real_name" = NULLIF(BTRIM("display_name"), \'\')',
    'AND NULLIF(BTRIM("display_name"), \'\') IS NOT NULL',
  ];
  for (const pattern of requiredRealNamePatterns) {
    if (!realNameMigration.includes(pattern)) {
      errors.push(`real_name migration must preserve every non-blank display_name; missing: ${pattern}`);
    }
  }

  const requiredTeamChatPatterns = [
    'UPDATE "v1_chat_rooms" AS room',
    'COALESCE(membership."joined_at", membership."created_at")',
    'ON CONFLICT ("chat_room_id", "user_id") DO UPDATE',
    '"left_at" = NULL',
    '"v1_chat_room_participants"."visible_from_at"',
    'EXCLUDED."visible_from_at"',
  ];
  for (const pattern of requiredTeamChatPatterns) {
    if (!teamChatMigration.includes(pattern)) {
      errors.push(`team chat backfill is missing required repair behavior: ${pattern}`);
    }
  }
}

const errors = [];
checkForbiddenDeployPatterns(errors);
checkSchemaMigrationPair(errors);
checkProfileAndTeamChatBackfills(errors);

if (errors.length > 0) {
  console.error('[v1-db-guardrails] failed');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('[v1-db-guardrails] passed');
