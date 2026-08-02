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
    // ECR digest 고정 전환(build-images 가 러너에서 docker/build-push-action 으로 직접
    // push) 이후 GA_PROD 는 더 이상 EC2 로 SSH streaming 할 필요가 없다 — alpha
    // (deploy-alpha.yml)와 동일하게 build-args 필드에 시크릿 식을 직접 건다.
    pattern: /NEXT_PUBLIC_GA_MEASUREMENT_ID=\$\{\{ secrets\.GA_PROD \}\}/,
    message: 'production analytics must use the registered GA_PROD secret',
  },
  {
    pattern: /cat <<'REMOTE_SCRIPT'/,
    message: 'remote deploy script must be streamed with its secret assignments over stdin',
  },
  {
    pattern: /--exclude backups/,
    message: 'production rsync must exclude the operator backup directory',
  },
  {
    pattern:
      /\(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\)/,
    message: 'manual production deploys must be restricted to the main branch',
  },
  {
    // ECR digest 고정 전환 이후 provenance/sbom attestation 매니페스트가 붙으면 이후
    // digest 조회·스캔 게이트가 예상과 다른 구조를 만난다(alpha-build 보고서 함정 #4).
    pattern: /provenance: false/,
    message: 'production image pushes must disable provenance attestation',
  },
  {
    pattern: /sbom: false/,
    message: 'production image pushes must disable SBOM attestation',
  },
  {
    // IMMUTABLE ECR 리포지토리는 같은 태그 재push 가 불가능하다 — 이미 존재하는 태그면
    // 빌드 자체를 skip 해야 재실행이 멱등하다.
    pattern: /if: steps\.images\.outputs\.api_exists != 'true'/,
    message: 'production API image build must skip when the immutable tag already exists',
  },
  {
    pattern: /imageTag="sha-\$\{RELEASE_SHA\}"/,
    message: 'production immutable image tags must be prefixed with sha-<commit sha>',
  },
  {
    // build-images job 만 OIDC 로 AWS(ECR push, 대상 검증)를 건드린다 — deploy job 은
    // SSH 만 쓰고 AWS API 를 직접 호출하지 않으므로 id-token: write 가 필요 없다.
    pattern: /id-token: write/,
    message: 'build-images job must request an OIDC token to assume the AWS deploy role',
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
  {
    pattern: /--(?:max-used-space|min-free-space)/,
    message: 'production BuildKit does not support v0.17-only prune filters',
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
