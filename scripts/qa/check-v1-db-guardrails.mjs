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

const errors = [];
checkForbiddenDeployPatterns(errors);
checkSchemaMigrationPair(errors);

if (errors.length > 0) {
  console.error('[v1-db-guardrails] failed');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('[v1-db-guardrails] passed');
