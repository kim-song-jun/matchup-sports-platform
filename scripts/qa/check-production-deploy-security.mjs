#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const workflowPath = process.argv[2] ?? '.github/workflows/deploy.yml';
const workflow = readFileSync(workflowPath, 'utf8');
const errors = [];

const requiredPatterns = [
  {
    pattern: /^permissions:\n  contents: read$/m,
    message: 'workflow permissions must be explicitly limited to contents: read',
  },
  {
    pattern: /EC2_KNOWN_HOSTS: \$\{\{ secrets\.EC2_KNOWN_HOSTS \}\}/,
    message: 'production SSH must use a pinned EC2_KNOWN_HOSTS secret',
  },
  {
    pattern: /StrictHostKeyChecking yes/,
    message: 'production SSH host verification must fail closed',
  },
  {
    pattern: /GA_MEASUREMENT_ID_SECRET: \$\{\{ secrets\.GA_PROD \}\}/,
    message: 'production analytics must use the registered GA_PROD secret',
  },
  {
    pattern: /cat <<'REMOTE_SCRIPT'/,
    message: 'remote deploy script must be streamed with its secret assignments over stdin',
  },
];

const forbiddenPatterns = [
  {
    pattern: /StrictHostKeyChecking\s+no/,
    message: 'production SSH must never disable host-key verification',
  },
  {
    pattern: /ssh[^\n]*\b[A-Z][A-Z0-9_]*_B64=/,
    message: 'encoded secrets must not be interpolated into the SSH process argument list',
  },
  {
    pattern: /secrets\.GA_MEASUREMENT_ID/,
    message: 'GA_MEASUREMENT_ID is not a registered repository secret; use GA_PROD',
  },
];

for (const { pattern, message } of requiredPatterns) {
  if (!pattern.test(workflow)) errors.push(`${workflowPath}: ${message}`);
}

for (const { pattern, message } of forbiddenPatterns) {
  if (pattern.test(workflow)) errors.push(`${workflowPath}: ${message}`);
}

if (errors.length > 0) {
  console.error('[production-deploy-security] failed');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('[production-deploy-security] passed');
