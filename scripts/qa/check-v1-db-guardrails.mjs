import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const deployFiles = [
  '.github/workflows/deploy.yml',
  // deploy/restart-containers.sh 는 prod ECR digest 고정 전환(deploy-prod.sh 가 activation +
  // migrate + 컨테이너 교체를 전부 흡수)으로 삭제됐다 — 같은 검사 대상을 deploy-prod.sh 로
  // 옮긴다.
  'deploy/deploy-prod.sh',
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

function resolveCommitRange() {
  const head = process.env.GITHUB_SHA || 'HEAD';
  const before = process.env.GITHUB_EVENT_BEFORE;
  if (before && !/^0+$/.test(before)) {
    return { base: before, head };
  }

  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    try {
      git(['fetch', '--no-tags', '--depth=1', 'origin', baseRef], { allowFailure: true });
      git(['rev-parse', '--verify', `origin/${baseRef}`]);
      return { base: `origin/${baseRef}`, head, mergeBase: true };
    } catch {
      // Fall through to the local commit range.
    }
  }

  try {
    git(['rev-parse', '--verify', 'HEAD~1']);
    return { base: 'HEAD~1', head };
  } catch {
    return null;
  }
}

function gitDiffArgs(range, extraArgs) {
  if (range.mergeBase) {
    return ['diff', ...extraArgs, `${range.base}...${range.head}`];
  }
  return ['diff', ...extraArgs, range.base, range.head];
}

function changedFilesForRange() {
  const files = new Set();
  const range = resolveCommitRange();
  if (range) {
    try {
      for (const file of git(gitDiffArgs(range, ['--name-only'])).split(/\r?\n/).filter(Boolean)) {
        files.add(file);
      }
      return files;
    } catch {
      // Fall through to local diff when the configured range is unavailable.
    }
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

function schemaDiffForRange() {
  const range = resolveCommitRange();
  if (!range) {
    return null;
  }

  try {
    const args = range.mergeBase
      ? ['diff', '--unified=0', '--no-ext-diff', `${range.base}...${range.head}`]
      : ['diff', '--unified=0', '--no-ext-diff', range.base, range.head];
    return git([...args, '--', 'apps/v1_api/prisma/schema.prisma']);
  } catch {
    return null;
  }
}

function extractRelationMapAdditions(schemaDiff) {
  if (!schemaDiff) {
    return null;
  }

  const additions = [];
  const hunks = schemaDiff.split(/^@@/m).slice(1);
  if (hunks.length === 0) {
    return null;
  }

  for (const hunk of hunks) {
    const removed = [];
    const added = [];
    for (const line of hunk.split(/\r?\n/)) {
      if (line.startsWith('-') && !line.startsWith('---')) {
        removed.push(line.slice(1));
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        added.push(line.slice(1));
      }
    }

    if (removed.length !== 1 || added.length !== 1) {
      return null;
    }

    const [beforeLine] = removed;
    const [afterLine] = added;
    if (!beforeLine.includes('@relation(') || beforeLine.includes('map:')) {
      return null;
    }

    const beforeClosingParen = beforeLine.lastIndexOf(')');
    if (beforeClosingParen !== beforeLine.length - 1) {
      return null;
    }

    const relationMapAddition = new RegExp(
      `^${escapeRegExp(beforeLine.slice(0, -1))}, map: "([A-Za-z_][A-Za-z0-9_]*)"\\)$`,
    );
    const match = afterLine.match(relationMapAddition);
    if (!match) {
      return null;
    }

    additions.push({ constraintName: match[1], afterLine });
  }

  return additions.length > 0 ? additions : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePrismaIdentifierList(value) {
  const names = value.split(',').map((name) => name.trim());
  if (names.length === 0 || names.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) {
    return null;
  }
  return names;
}

function parseQuotedSqlColumns(value) {
  const columns = value.split(',').map((column) => column.trim().match(/^"([^"]+)"$/)?.[1]);
  return columns.every(Boolean) ? columns : null;
}

function parsePrismaModels(schema) {
  const models = new Map();
  let currentModel = null;

  for (const line of schema.split(/\r?\n/)) {
    const modelStart = line.match(/^model\s+([A-Za-z_][A-Za-z0-9_]*)\s+\{$/);
    if (modelStart) {
      currentModel = { name: modelStart[1], table: modelStart[1], fields: new Map(), relationLines: new Map() };
      models.set(currentModel.name, currentModel);
      continue;
    }

    if (currentModel && line === '}') {
      currentModel = null;
      continue;
    }

    if (!currentModel) {
      continue;
    }

    const tableMap = line.match(/^\s*@@map\("([^"]+)"\)/);
    if (tableMap) {
      currentModel.table = tableMap[1];
      continue;
    }

    const field = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\[\]|\?)?/);
    if (!field) {
      continue;
    }

    const [, fieldName, fieldType] = field;
    const columnMap = line.match(/@map\("([^"]+)"\)/)?.[1] || fieldName;
    currentModel.fields.set(fieldName, columnMap);
    if (line.includes('@relation(')) {
      currentModel.relationLines.set(line, { fieldName, targetModel: fieldType });
    }
  }

  return models;
}

function relationShapeForMapAddition(schema, afterLine) {
  const models = parsePrismaModels(schema);
  for (const model of models.values()) {
    const relation = model.relationLines.get(afterLine);
    if (!relation) {
      continue;
    }

    const relationArguments = afterLine.match(/@relation\((.*)\)$/)?.[1];
    const fieldsMatch = relationArguments?.match(/(?:^|,\s*)fields:\s*\[([^\]]+)\]/);
    const referencesMatch = relationArguments?.match(/(?:^|,\s*)references:\s*\[([^\]]+)\]/);
    if (!fieldsMatch || !referencesMatch) {
      return null;
    }

    const fields = parsePrismaIdentifierList(fieldsMatch[1]);
    const references = parsePrismaIdentifierList(referencesMatch[1]);
    const targetModel = models.get(relation.targetModel);
    if (!fields || !references || fields.length !== references.length || !targetModel) {
      return null;
    }

    const sourceColumns = fields.map((field) => model.fields.get(field));
    const targetColumns = references.map((field) => targetModel.fields.get(field));
    if (sourceColumns.some((column) => !column) || targetColumns.some((column) => !column)) {
      return null;
    }

    return { sourceTable: model.table, sourceColumns, targetTable: targetModel.table, targetColumns };
  }

  return null;
}

function migrationContainsMatchingForeignKey(constraintName, relationShape) {
  const migrationFiles = git(['ls-files', 'apps/v1_api/prisma/migrations']).split(/\r?\n/).filter(Boolean);
  const constraintPattern = new RegExp(
    `CONSTRAINT\\s+"${escapeRegExp(constraintName)}"\\s+FOREIGN\\s+KEY\\s*\\(([^)]*)\\)\\s+REFERENCES\\s+"([^"]+)"\\s*\\(([^)]*)\\)`,
    'gi',
  );

  for (const migrationFile of migrationFiles) {
    const sql = readFileSync(migrationFile, 'utf8');
    for (const match of sql.matchAll(constraintPattern)) {
      const sourceTableMatches = [...sql.slice(0, match.index).matchAll(/CREATE\s+TABLE\s+"([^"]+)"\s*\(/gi)];
      const sourceTable = sourceTableMatches.at(-1)?.[1];
      const sourceColumns = parseQuotedSqlColumns(match[1]);
      const targetColumns = parseQuotedSqlColumns(match[3]);
      if (
        sourceTable === relationShape.sourceTable
        && match[2] === relationShape.targetTable
        && JSON.stringify(sourceColumns) === JSON.stringify(relationShape.sourceColumns)
        && JSON.stringify(targetColumns) === JSON.stringify(relationShape.targetColumns)
      ) {
        return true;
      }
    }
  }

  return false;
}

function isExistingForeignKeyMapAlignment() {
  const additions = extractRelationMapAdditions(schemaDiffForRange());
  if (!additions) {
    return false;
  }

  const schema = readFileSync('apps/v1_api/prisma/schema.prisma', 'utf8');
  return additions.every((addition) => {
    const relationShape = relationShapeForMapAddition(schema, addition.afterLine);
    return relationShape && migrationContainsMatchingForeignKey(addition.constraintName, relationShape);
  });
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

  if (schemaChanged && !migrationChanged && !isExistingForeignKeyMapAlignment()) {
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
