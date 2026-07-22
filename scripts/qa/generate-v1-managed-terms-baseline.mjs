import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const ts = require(path.join(repoRoot, 'apps/v1_web/node_modules/typescript'));
const webRoot = path.join(repoRoot, 'apps/v1_web/src');
const migrationName = '20260722090000_v1_managed_terms_v11_baseline';
const migrationDir = path.join(repoRoot, 'apps/v1_api/prisma/migrations', migrationName);
const snapshotPath = path.join(repoRoot, 'apps/v1_api/prisma/data/managed-terms-v1.1.json');
const migrationPath = path.join(migrationDir, 'migration.sql');

const termsSource = parseSource(
  path.join(webRoot, 'components/auth/terms-client.tsx'),
);
const tournamentSource = parseSource(
  path.join(webRoot, 'app/tournaments/[id]/apply/tournament-apply-client.tsx'),
);

const legalReturns = collectReturnArrays(findFunction(termsSource, 'getLegalDocumentSections'));
if (legalReturns.length !== 2) {
  throw new Error('Expected privacy and service return arrays in getLegalDocumentSections');
}

const signupPrivacySections = evaluateLiteral(legalReturns[0]);
const serviceTermsSections = evaluateLiteral(legalReturns[1]);
const privacyPolicySections = evaluateSingleReturn(
  termsSource,
  'getPrivacyPolicySections',
);
const locationSections = evaluateSingleReturn(
  termsSource,
  'getLocationDocumentSections',
);
const tournamentPolicySections = evaluateSingleReturn(
  termsSource,
  'getTournamentPolicyDocumentSections',
);
const supportSections = evaluateSingleReturn(
  termsSource,
  'getSupportDocumentSections',
);
const tournamentDocuments = evaluateVariable(
  tournamentSource,
  'TOURNAMENT_CONSENT_DOCUMENTS',
);

const policies = [
  policy({
    sequence: 1,
    code: 'signup_service_terms',
    name: '회원가입 서비스 이용약관',
    title: '서비스 이용약관',
    content: sectionsToText(serviceTermsSections),
    placements: [['signup', 'required', 0]],
  }),
  policy({
    sequence: 2,
    code: 'signup_privacy',
    name: '회원가입 개인정보 수집·이용 동의',
    title: '개인정보 수집 및 이용 동의',
    content: sectionsToText(signupPrivacySections),
    placements: [['signup', 'required', 1]],
  }),
  policy({
    sequence: 3,
    code: 'footer_service_terms',
    name: '하단 서비스 이용약관',
    title: '서비스 이용약관',
    content: sectionsToText(serviceTermsSections),
    placements: [['footer', 'display_only', 0]],
  }),
  policy({
    sequence: 4,
    code: 'privacy_policy',
    name: '개인정보처리방침',
    title: '개인정보처리방침',
    content: sectionsToText(privacyPolicySections),
    placements: [['footer', 'display_only', 1]],
  }),
  policy({
    sequence: 5,
    code: 'location_terms',
    name: '위치기반서비스 이용약관',
    title: '위치기반서비스 이용약관',
    content: sectionsToText(locationSections),
    placements: [['footer', 'display_only', 2]],
  }),
  policy({
    sequence: 6,
    code: 'tournament_rules',
    name: '대회 규정 및 안내사항',
    title: tournamentDocuments.rules.title,
    content: tournamentDocuments.rules.body,
    placements: [['tournament_application', 'required', 0]],
  }),
  policy({
    sequence: 7,
    code: 'tournament_privacy',
    name: '대회 참가 개인정보 수집·이용 동의',
    title: tournamentDocuments.privacy.title,
    content: tournamentDocuments.privacy.body,
    placements: [['tournament_application', 'required', 1]],
  }),
  policy({
    sequence: 8,
    code: 'tournament_refund',
    name: '참가비 입금·취소·환불 정책',
    title: tournamentDocuments.refund.title,
    content: tournamentDocuments.refund.body,
    placements: [['tournament_application', 'required', 2]],
  }),
  policy({
    sequence: 9,
    code: 'tournament_media',
    name: '사진·영상 촬영 및 홍보 활용 동의',
    title: tournamentDocuments.media.title,
    content: tournamentDocuments.media.body,
    placements: [['tournament_application', 'optional', 3]],
  }),
  policy({
    sequence: 10,
    code: 'tournament_policy',
    name: '대회 운영정책',
    title: '대회 운영정책',
    content: sectionsToText(tournamentPolicySections),
    placements: [['footer', 'display_only', 3]],
  }),
  policy({
    sequence: 11,
    code: 'support',
    name: '고객센터 안내',
    title: '고객센터',
    content: sectionsToText(supportSections),
    placements: [['footer', 'display_only', 4]],
  }),
];

const snapshot = {
  schemaVersion: 1,
  canonicalVersion: 'v1.1',
  extractedFrom: [
    'apps/v1_web/src/components/auth/terms-client.tsx',
    'apps/v1_web/src/app/tournaments/[id]/apply/tournament-apply-client.tsx',
  ],
  policies,
};

const expectedSnapshot = JSON.stringify(snapshot, null, 2) + '\n';
const expectedMigration = renderMigration(snapshot);

if (process.argv.includes('--write')) {
  mkdirSync(path.dirname(snapshotPath), { recursive: true });
  mkdirSync(migrationDir, { recursive: true });
  writeFileSync(snapshotPath, expectedSnapshot, 'utf8');
  writeFileSync(migrationPath, expectedMigration, 'utf8');
  process.stdout.write('Wrote ' + path.relative(repoRoot, snapshotPath) + '\n');
  process.stdout.write('Wrote ' + path.relative(repoRoot, migrationPath) + '\n');
  process.exit(0);
}

assertFile(snapshotPath, expectedSnapshot);
assertFile(migrationPath, expectedMigration);
process.stdout.write(
  'Managed terms v1.1 baseline matches current fixed v1 sources (' +
    policies.length +
    ' policies).\n',
);

function parseSource(filePath) {
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function findFunction(sourceFile, name) {
  const statement = sourceFile.statements.find(
    (item) => ts.isFunctionDeclaration(item) && item.name?.text === name,
  );
  if (!statement?.body) throw new Error('Function not found: ' + name);
  return statement;
}

function collectReturnArrays(functionDeclaration) {
  const returns = [];
  visit(functionDeclaration.body);
  return returns;

  function visit(node) {
    if (ts.isReturnStatement(node) && node.expression) {
      const expression = unwrap(node.expression);
      if (ts.isArrayLiteralExpression(expression)) returns.push(expression);
    }
    ts.forEachChild(node, visit);
  }
}

function evaluateSingleReturn(sourceFile, name) {
  const returns = collectReturnArrays(findFunction(sourceFile, name));
  if (returns.length !== 1) {
    throw new Error('Expected one array return in ' + name + ', received ' + returns.length);
  }
  return evaluateLiteral(returns[0]);
}

function evaluateVariable(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer
      ) {
        return evaluateLiteral(declaration.initializer);
      }
    }
  }
  throw new Error('Variable not found: ' + name);
}

function unwrap(node) {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function evaluateLiteral(input) {
  const node = unwrap(input);
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(evaluateLiteral);
  }
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(
      node.properties.map((property) => {
        if (!ts.isPropertyAssignment(property)) {
          throw new Error('Unsupported object property: ' + property.getText());
        }
        return [
          propertyName(property.name),
          evaluateLiteral(property.initializer),
        ];
      }),
    );
  }
  throw new Error('Unsupported literal node: ' + node.getText());
}

function propertyName(node) {
  if (
    ts.isIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node)
  ) {
    return node.text;
  }
  throw new Error('Unsupported property name: ' + node.getText());
}

function sectionsToText(sections) {
  return sections
    .map((section) => section.title + '\n\n' + section.body)
    .join('\n\n');
}

function subtitleForCode(code) {
  return {
    signup_service_terms: '회원가입 및 서비스 이용에 필요한 기본 약관',
    signup_privacy: '회원가입과 서비스 제공을 위한 개인정보 수집·이용 기준',
    footer_service_terms: '팀밋 서비스 이용에 적용되는 기본 약관',
    privacy_policy: '팀밋이 개인정보를 처리하고 보호하는 기준',
    location_terms: '주변 경기·팀·대회 추천을 위한 위치정보 이용 기준',
    tournament_rules: '참가 자격, 경기 운영, 노쇼 및 실격 기준',
    tournament_privacy: '대회 신청·운영을 위한 참가자 개인정보 이용 기준',
    tournament_refund: '참가비 입금 기한과 취소·환불 기준',
    tournament_media: '대회 기록과 홍보를 위한 사진·영상 활용 선택 동의',
    tournament_policy: '대회 신청부터 경기 운영·제재까지의 운영 기준',
    support: '계정·대회·입금·환불·신고 문의 안내',
  }[code];
}

function policy(input) {
  const suffix = String(input.sequence).padStart(4, '0');
  return {
    id: 'a1100000-0000-4000-8000-00000000' + suffix,
    code: input.code,
    name: input.name,
    document: {
      id: 'a1110000-0000-4000-8000-00000000' + suffix,
      version: 'v1.1',
      title: input.title,
      subtitle: subtitleForCode(input.code),
      content: input.content,
      contentHash: createHash('sha256').update(input.content, 'utf8').digest('hex'),
      effectiveAt: '2026-07-01T00:00:00.000Z',
      changeSummary: '현재 v1 고정 약관 본문을 관리형 약관 기준선 v1.1로 등록',
    },
    placements: input.placements.map((placement, index) => ({
      id:
        'a112' +
        String(input.sequence).padStart(4, '0') +
        '-0000-4000-8000-00000000' +
        String(index + 1).padStart(4, '0'),
      context: placement[0],
      requirement: placement[1],
      displayOrder: placement[2],
    })),
  };
}

function renderMigration(data) {
  const lines = [
    '-- Additive managed-terms baseline. No legacy table or value is updated or deleted.',
    'CREATE TYPE "V1ManagedTermsContext" AS ENUM (\'signup\', \'tournament_application\', \'footer\');',
    'CREATE TYPE "V1ManagedTermsRequirement" AS ENUM (\'required\', \'optional\', \'display_only\');',
    'CREATE TYPE "V1ManagedTermsConsentDecision" AS ENUM (\'accepted\', \'not_accepted\', \'revoked\');',
    'CREATE TYPE "V1ManagedTermsConsentSource" AS ENUM (\'web\', \'admin\', \'legacy_user_consent\', \'legacy_tournament_boolean\');',
    '',
    uuidTextSql(),
    '',
    'CREATE TABLE "v1_managed_terms_policies" (',
    '  "id" TEXT NOT NULL,',
    '  "code" TEXT NOT NULL,',
    '  "name" TEXT NOT NULL,',
    '  "is_active" BOOLEAN NOT NULL DEFAULT true,',
    '  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '  "updated_at" TIMESTAMP(3) NOT NULL,',
    '  CONSTRAINT "v1_managed_terms_policies_pkey" PRIMARY KEY ("id")',
    ');',
    '',
    'CREATE TABLE "v1_managed_terms_documents" (',
    '  "id" TEXT NOT NULL,',
    '  "policy_id" TEXT NOT NULL,',
    '  "version" TEXT NOT NULL,',
    '  "title" TEXT NOT NULL,',
    '  "content" TEXT NOT NULL,',
    '  "content_hash" TEXT NOT NULL,',
    '  "change_summary" TEXT,',
    '  "status" "V1TermsDocumentStatus" NOT NULL DEFAULT \'draft\',',
    '  "effective_at" TIMESTAMP(3),',
    '  "published_at" TIMESTAMP(3),',
    '  "archived_at" TIMESTAMP(3),',
    '  "supersedes_document_id" TEXT,',
    '  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '  "updated_at" TIMESTAMP(3) NOT NULL,',
    '  CONSTRAINT "v1_managed_terms_documents_pkey" PRIMARY KEY ("id")',
    ');',
    '',
    'CREATE TABLE "v1_managed_terms_placements" (',
    '  "id" TEXT NOT NULL,',
    '  "policy_id" TEXT NOT NULL,',
    '  "context" "V1ManagedTermsContext" NOT NULL,',
    '  "requirement" "V1ManagedTermsRequirement" NOT NULL,',
    '  "display_order" INTEGER NOT NULL DEFAULT 0,',
    '  "is_active" BOOLEAN NOT NULL DEFAULT true,',
    '  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '  "updated_at" TIMESTAMP(3) NOT NULL,',
    '  CONSTRAINT "v1_managed_terms_placements_pkey" PRIMARY KEY ("id")',
    ');',
    '',
    'CREATE TABLE "v1_managed_terms_consent_events" (',
    '  "id" TEXT NOT NULL,',
    '  "document_id" TEXT NOT NULL,',
    '  "user_id" TEXT NOT NULL,',
    '  "context" "V1ManagedTermsContext" NOT NULL,',
    '  "decision" "V1ManagedTermsConsentDecision" NOT NULL,',
    '  "decided_at" TIMESTAMP(3),',
    '  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '  "source" "V1ManagedTermsConsentSource" NOT NULL,',
    '  "version_verified" BOOLEAN NOT NULL DEFAULT true,',
    '  "legacy_user_consent_id" TEXT,',
    '  "tournament_registration_id" TEXT,',
    '  "team_id" TEXT,',
    '  "legacy_boolean_value" BOOLEAN,',
    '  "dedupe_key" TEXT,',
    '  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '  CONSTRAINT "v1_managed_terms_consent_events_pkey" PRIMARY KEY ("id")',
    ');',
    '',
    'CREATE TABLE "v1_managed_terms_migration_audits" (',
    '  "id" TEXT NOT NULL,',
    '  "migration_key" TEXT NOT NULL,',
    '  "snapshot" JSONB NOT NULL,',
    '  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
    '  CONSTRAINT "v1_managed_terms_migration_audits_pkey" PRIMARY KEY ("id")',
    ');',
    '',
    'CREATE UNIQUE INDEX "v1_managed_terms_policies_code_key" ON "v1_managed_terms_policies"("code");',
    'CREATE INDEX "v1_managed_terms_policies_is_active_idx" ON "v1_managed_terms_policies"("is_active");',
    'CREATE UNIQUE INDEX "v1_managed_terms_documents_policy_id_version_key" ON "v1_managed_terms_documents"("policy_id", "version");',
    'CREATE INDEX "v1_managed_terms_documents_status_effective_at_idx" ON "v1_managed_terms_documents"("status", "effective_at");',
    'CREATE INDEX "v1_managed_terms_documents_supersedes_document_id_idx" ON "v1_managed_terms_documents"("supersedes_document_id");',
    'CREATE UNIQUE INDEX "v1_managed_terms_placements_policy_id_context_key" ON "v1_managed_terms_placements"("policy_id", "context");',
    'CREATE INDEX "v1_managed_terms_placements_context_is_active_display_order_idx" ON "v1_managed_terms_placements"("context", "is_active", "display_order");',
    'CREATE UNIQUE INDEX "v1_managed_terms_consent_events_dedupe_key_key" ON "v1_managed_terms_consent_events"("dedupe_key");',
    'CREATE INDEX "v1_managed_terms_consent_events_user_id_context_recorded_at_idx" ON "v1_managed_terms_consent_events"("user_id", "context", "recorded_at");',
    'CREATE INDEX "v1_managed_terms_consent_events_document_id_decision_idx" ON "v1_managed_terms_consent_events"("document_id", "decision");',
    'CREATE INDEX "v1_managed_terms_consent_events_legacy_user_consent_id_idx" ON "v1_managed_terms_consent_events"("legacy_user_consent_id");',
    'CREATE INDEX "v1_managed_terms_consent_events_tournament_registration_id_idx" ON "v1_managed_terms_consent_events"("tournament_registration_id");',
    'CREATE INDEX "v1_managed_terms_consent_events_team_id_idx" ON "v1_managed_terms_consent_events"("team_id");',
    'CREATE UNIQUE INDEX "v1_managed_terms_migration_audits_migration_key_key" ON "v1_managed_terms_migration_audits"("migration_key");',
    '',
    'ALTER TABLE "v1_managed_terms_documents" ADD CONSTRAINT "v1_managed_terms_documents_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "v1_managed_terms_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
    'ALTER TABLE "v1_managed_terms_documents" ADD CONSTRAINT "v1_managed_terms_documents_supersedes_document_id_fkey" FOREIGN KEY ("supersedes_document_id") REFERENCES "v1_managed_terms_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
    'ALTER TABLE "v1_managed_terms_placements" ADD CONSTRAINT "v1_managed_terms_placements_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "v1_managed_terms_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
    'ALTER TABLE "v1_managed_terms_consent_events" ADD CONSTRAINT "v1_managed_terms_consent_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "v1_managed_terms_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
    '',
  ];

  for (const item of data.policies) {
    lines.push(
      'INSERT INTO "v1_managed_terms_policies" ("id", "code", "name", "is_active", "created_at", "updated_at") VALUES (' +
        [item.id, item.code, item.name].map(sqlString).join(', ') +
        ', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;',
    );
  }
  lines.push('');

  for (const item of data.policies) {
    const document = item.document;
    lines.push(
      'INSERT INTO "v1_managed_terms_documents" ("id", "policy_id", "version", "title", "content", "content_hash", "change_summary", "status", "effective_at", "published_at", "created_at", "updated_at") VALUES (' +
        [
          sqlString(document.id),
          sqlString(item.id),
          sqlString(document.version),
          sqlString(document.title),
          dollarString(document.content),
          sqlString(document.contentHash),
          sqlString(document.changeSummary),
          "'published'::\"V1TermsDocumentStatus\"",
          sqlString(document.effectiveAt) + '::timestamptz',
          'CURRENT_TIMESTAMP',
          'CURRENT_TIMESTAMP',
          'CURRENT_TIMESTAMP',
        ].join(', ') +
        ') ON CONFLICT ("id") DO NOTHING;',
    );
  }
  lines.push('');

  for (const item of data.policies) {
    for (const placement of item.placements) {
      lines.push(
        'INSERT INTO "v1_managed_terms_placements" ("id", "policy_id", "context", "requirement", "display_order", "is_active", "created_at", "updated_at") VALUES (' +
          [
            sqlString(placement.id),
            sqlString(item.id),
            sqlString(placement.context) + '::"V1ManagedTermsContext"',
            sqlString(placement.requirement) + '::"V1ManagedTermsRequirement"',
            String(placement.displayOrder),
            'true',
            'CURRENT_TIMESTAMP',
            'CURRENT_TIMESTAMP',
          ].join(', ') +
          ') ON CONFLICT ("id") DO NOTHING;',
      );
    }
  }
  lines.push(
    '',
    renderLegacyUserBackfill(data),
    '',
    renderTournamentBackfill(data),
    '',
    renderAudit(data),
    '',
    'DROP FUNCTION v1_managed_terms_v11_uuid_text(TEXT);',
    '',
  );
  return lines.join('\n');
}

function renderLegacyUserBackfill(data) {
  const serviceDocumentId = documentId(data, 'signup_service_terms');
  const privacyDocumentId = documentId(data, 'signup_privacy');
  return [
    '-- Preserve legacy signup acceptance and revocation without changing the original rows.',
    'WITH mapped AS (',
    '  SELECT c.*, CASE d."kind"',
    "    WHEN 'terms'::\"V1TermsKind\" THEN " + sqlString(serviceDocumentId),
    "    WHEN 'privacy'::\"V1TermsKind\" THEN " + sqlString(privacyDocumentId),
    '    ELSE NULL',
    '  END AS managed_document_id',
    '  FROM "v1_user_terms_consents" c',
    '  JOIN "v1_terms_documents" d ON d."id" = c."terms_document_id"',
    '), candidates AS (',
    "  SELECT *, 'legacy-user:' || \"id\" || ':accepted' AS dedupe FROM mapped WHERE managed_document_id IS NOT NULL",
    ')',
    'INSERT INTO "v1_managed_terms_consent_events" ("id", "document_id", "user_id", "context", "decision", "decided_at", "recorded_at", "source", "version_verified", "legacy_user_consent_id", "dedupe_key", "created_at")',
    "SELECT v1_managed_terms_v11_uuid_text(md5(dedupe)), managed_document_id, \"user_id\", 'signup'::\"V1ManagedTermsContext\", 'accepted'::\"V1ManagedTermsConsentDecision\", \"accepted_at\", CURRENT_TIMESTAMP, 'legacy_user_consent'::\"V1ManagedTermsConsentSource\", false, \"id\", dedupe, CURRENT_TIMESTAMP",
    'FROM candidates',
    'ON CONFLICT ("dedupe_key") DO NOTHING;',
    '',
    'WITH mapped AS (',
    '  SELECT c.*, CASE d."kind"',
    "    WHEN 'terms'::\"V1TermsKind\" THEN " + sqlString(serviceDocumentId),
    "    WHEN 'privacy'::\"V1TermsKind\" THEN " + sqlString(privacyDocumentId),
    '    ELSE NULL',
    '  END AS managed_document_id',
    '  FROM "v1_user_terms_consents" c',
    '  JOIN "v1_terms_documents" d ON d."id" = c."terms_document_id"',
    '), candidates AS (',
    "  SELECT *, 'legacy-user:' || \"id\" || ':revoked' AS dedupe FROM mapped WHERE managed_document_id IS NOT NULL AND \"revoked_at\" IS NOT NULL",
    ')',
    'INSERT INTO "v1_managed_terms_consent_events" ("id", "document_id", "user_id", "context", "decision", "decided_at", "recorded_at", "source", "version_verified", "legacy_user_consent_id", "dedupe_key", "created_at")',
    "SELECT v1_managed_terms_v11_uuid_text(md5(dedupe)), managed_document_id, \"user_id\", 'signup'::\"V1ManagedTermsContext\", 'revoked'::\"V1ManagedTermsConsentDecision\", \"revoked_at\", CURRENT_TIMESTAMP, 'legacy_user_consent'::\"V1ManagedTermsConsentSource\", false, \"id\", dedupe, CURRENT_TIMESTAMP",
    'FROM candidates',
    'ON CONFLICT ("dedupe_key") DO NOTHING;',
  ].join('\n');
}

function renderTournamentBackfill(data) {
  const values = [
    ['rules', 'agreed_rules', documentId(data, 'tournament_rules')],
    ['privacy', 'agreed_privacy', documentId(data, 'tournament_privacy')],
    ['refund', 'agreed_refund', documentId(data, 'tournament_refund')],
    ['media', 'agreed_media_consent', documentId(data, 'tournament_media')],
  ];
  const lateralValues = values
    .map(
      (item) =>
        '(' +
        sqlString(item[0]) +
        ', r."' +
        item[1] +
        '", ' +
        sqlString(item[2]) +
        ')',
    )
    .join(',\n    ');
  return [
    '-- Snapshot every tournament registration boolean, including false, without updating it.',
    'WITH candidates AS (',
    '  SELECT r.*, item.policy_code, item.legacy_value, item.managed_document_id,',
    "    'legacy-tournament:' || r.\"id\" || ':' || item.policy_code AS dedupe",
    '  FROM "v1_tournament_registrations" r',
    '  CROSS JOIN LATERAL (VALUES',
    '    ' + lateralValues,
    '  ) AS item(policy_code, legacy_value, managed_document_id)',
    ')',
    'INSERT INTO "v1_managed_terms_consent_events" ("id", "document_id", "user_id", "context", "decision", "decided_at", "recorded_at", "source", "version_verified", "tournament_registration_id", "team_id", "legacy_boolean_value", "dedupe_key", "created_at")',
    "SELECT v1_managed_terms_v11_uuid_text(md5(dedupe)), managed_document_id, \"applied_by_user_id\", 'tournament_application'::\"V1ManagedTermsContext\",",
    "  CASE WHEN legacy_value THEN 'accepted'::\"V1ManagedTermsConsentDecision\" ELSE 'not_accepted'::\"V1ManagedTermsConsentDecision\" END,",
    "  NULL, CURRENT_TIMESTAMP, 'legacy_tournament_boolean'::\"V1ManagedTermsConsentSource\", false, \"id\", \"team_id\", legacy_value, dedupe, CURRENT_TIMESTAMP",
    'FROM candidates',
    'ON CONFLICT ("dedupe_key") DO NOTHING;',
  ].join('\n');
}

function renderAudit(data) {
  const mappedKinds = "('terms'::\"V1TermsKind\", 'privacy'::\"V1TermsKind\")";
  return [
    '-- Capture immutable parity evidence after the idempotent backfill.',
    'INSERT INTO "v1_managed_terms_migration_audits" ("id", "migration_key", "snapshot", "created_at")',
    'SELECT ' + sqlString('a1130000-0000-4000-8000-000000000001') + ', ' + sqlString(migrationName) + ', jsonb_build_object(',
    "  'legacyTermsDocuments', (SELECT COUNT(*) FROM \"v1_terms_documents\"),",
    "  'legacyUserConsents', (SELECT COUNT(*) FROM \"v1_user_terms_consents\"),",
    "  'legacyUserConsentsMapped', (SELECT COUNT(*) FROM \"v1_user_terms_consents\" c JOIN \"v1_terms_documents\" d ON d.\"id\" = c.\"terms_document_id\" WHERE d.\"kind\" IN " + mappedKinds + '),',
    "  'legacyUserConsentsUnmapped', (SELECT COUNT(*) FROM \"v1_user_terms_consents\" c JOIN \"v1_terms_documents\" d ON d.\"id\" = c.\"terms_document_id\" WHERE d.\"kind\" NOT IN " + mappedKinds + '),',
    "  'tournamentRegistrations', (SELECT COUNT(*) FROM \"v1_tournament_registrations\"),",
    "  'agreedRulesTrue', (SELECT COUNT(*) FROM \"v1_tournament_registrations\" WHERE \"agreed_rules\"),",
    "  'agreedPrivacyTrue', (SELECT COUNT(*) FROM \"v1_tournament_registrations\" WHERE \"agreed_privacy\"),",
    "  'agreedRefundTrue', (SELECT COUNT(*) FROM \"v1_tournament_registrations\" WHERE \"agreed_refund\"),",
    "  'agreedMediaTrue', (SELECT COUNT(*) FROM \"v1_tournament_registrations\" WHERE \"agreed_media_consent\"),",
    "  'managedPolicies', (SELECT COUNT(*) FROM \"v1_managed_terms_policies\"),",
    "  'managedV11Documents', (SELECT COUNT(*) FROM \"v1_managed_terms_documents\" WHERE \"version\" = 'v1.1'),",
    "  'managedConsentEvents', (SELECT COUNT(*) FROM \"v1_managed_terms_consent_events\")",
    '), CURRENT_TIMESTAMP',
    'ON CONFLICT ("migration_key") DO NOTHING;',
  ].join('\n');
}

function documentId(data, code) {
  const item = data.policies.find((policyItem) => policyItem.code === code);
  if (!item) throw new Error('Policy not found: ' + code);
  return item.document.id;
}

function uuidTextSql() {
  return [
    '-- Local immutable helper for deterministic UUID-shaped text IDs.',
    'CREATE FUNCTION v1_managed_terms_v11_uuid_text(hash TEXT) RETURNS TEXT AS $$',
    "  SELECT substr(hash, 1, 8) || '-' || substr(hash, 9, 4) || '-' || substr(hash, 13, 4) || '-' || substr(hash, 17, 4) || '-' || substr(hash, 21, 12);",
    '$$ LANGUAGE SQL IMMUTABLE;',
  ].join('\n');
}

function sqlString(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function dollarString(value) {
  if (value.includes('$terms$')) throw new Error('Unexpected SQL dollar tag in content');
  return '$terms$' + value + '$terms$';
}

function assertFile(filePath, expected) {
  const actual = readFileSync(filePath, 'utf8');
  if (actual !== expected) {
    throw new Error(path.relative(repoRoot, filePath) + ' is stale; run with --write');
  }
}
