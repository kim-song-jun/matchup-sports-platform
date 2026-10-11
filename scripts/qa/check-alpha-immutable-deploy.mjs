#!/usr/bin/env node

import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const argumentsList = process.argv.slice(2);
const sourceRoot = argumentsList.find((argument) => !argument.startsWith('--')) ?? '.';
const runSelfTest = argumentsList.includes('--self-test');

// Mirrors the live IAM policies. Apple sign-in and Firebase sync scripts write parameters that live IAM
// does not allow yet (known gap, secrets unset), so they are excluded from the parity check below.
const expectedRuntimeParameterNames = [
  'APNS_BUNDLE_ID',
  'APNS_KEY_ID',
  'APNS_PRIVATE_KEY',
  'APNS_TEAM_ID',
  'KAKAO_APP_ID',
  'KAKAO_CLIENT_ID',
  'KAKAO_CLIENT_SECRET',
  'KAKAO_REDIRECT_URI',
  'SLACK_INQUIRY_WEBHOOK_URL',
];
const syncScriptsOutsideIam = new Set(['sync-alpha-apple-sign-in-env.sh', 'sync-alpha-firebase-env.sh']);

const workflowPath = '.github/workflows/deploy-alpha.yml';
const composePath = 'deploy/docker-compose.alpha.yml';
const deployPath = 'deploy/deploy-alpha.sh';
const rollbackPath = 'deploy/rollback-alpha.sh';
const releaseLibraryPath = 'deploy/alpha-release-common.sh';
const sourceLibraryPath = 'deploy/alpha-source-common.sh';
const manifestLibraryPath = 'deploy/alpha-manifest-common.sh';
const rollbackWorkflowPath = '.github/workflows/rollback-alpha.yml';
const provisioningPath = 'scripts/infra/provision-alpha-immutable-deploy.sh';
const policyRendererPath = 'scripts/infra/render-alpha-immutable-deploy-policies.mjs';
const runtimeSyncPath = 'scripts/release/sync-alpha-inquiry-slack-env.sh';
const firebaseRuntimeSyncPath = 'scripts/release/sync-alpha-firebase-env.sh';
const manifestBuilderPath = 'scripts/release/create-alpha-release-manifest.sh';
const ssmDeployPath = 'scripts/release/deploy-alpha-via-ssm.sh';
const rollbackBasePath = 'scripts/release/resolve-alpha-rollback-base.sh';

const sources = new Map([
  [workflowPath, readRequiredFile(workflowPath)],
  [composePath, readRequiredFile(composePath)],
  [deployPath, readRequiredFile(deployPath)],
  [rollbackPath, readRequiredFile(rollbackPath)],
  [releaseLibraryPath, readRequiredFile(releaseLibraryPath)],
  [sourceLibraryPath, readRequiredFile(sourceLibraryPath)],
  [manifestLibraryPath, readRequiredFile(manifestLibraryPath)],
  [rollbackWorkflowPath, readRequiredFile(rollbackWorkflowPath)],
  [provisioningPath, readRequiredFile(provisioningPath)],
  [policyRendererPath, readRequiredFile(policyRendererPath)],
  [runtimeSyncPath, readRequiredFile(runtimeSyncPath)],
  [firebaseRuntimeSyncPath, readRequiredFile(firebaseRuntimeSyncPath)],
  [manifestBuilderPath, readRequiredFile(manifestBuilderPath)],
  [ssmDeployPath, readRequiredFile(ssmDeployPath)],
  [rollbackBasePath, readRequiredFile(rollbackBasePath)],
]);

const errors = [];
const runtimePolicies = renderRuntimePolicies();
if (runtimePolicies !== undefined) validateRuntimePolicies(runtimePolicies, errors);
validateSyncScriptParameterParity(errors);
validateRuntimeSecretTransport(sources.get(runtimeSyncPath), errors);
validateKakaoSyncBehaviour(errors);
validateSyncScriptsRemoveEnvCopies(errors);

requirePatterns(workflowPath, [
  [/amazon-ecr-login/, 'must authenticate to ECR'],
  [/docker\/build-push-action/, 'must build and push images on the runner'],
  [/imageTag="sha-\$\{RELEASE_SHA\}"/, 'must resolve immutable SHA image tags'],
  [/create-alpha-release-manifest\.sh/, 'must create or reuse the immutable manifest'],
  [/deploy-alpha-via-ssm\.sh/, 'must delegate the pinned release to SSM'],
  [/sync-alpha-firebase-env\.sh/, 'must restore Firebase Admin credentials before deployment'],
  [/runs\?branch=dev&head_sha=\$\{RELEASE_SHA\}/, 'must query CI runs for the exact release SHA'],
  [/select-matching-ci-run\.sh "\$\{RELEASE_SHA\}"/, 'must judge CI via select-matching-ci-run.sh (accepts the Promote bot dispatch of version commits)'],
]);

requirePatterns(firebaseRuntimeSyncPath, [
  [/\/teameet\/alpha\/env\/FIREBASE_ADMIN_JSON/, 'must use the persistent scoped Firebase SecureString'],
  [/readlink -f/, 'must follow the deploy env symlink before writing'],
  [/\/home\/ec2-user\/\.teameet-alpha-runtime\/\.env/, 'must pin the protected runtime env target'],
  [/\.project_id/, 'must validate the Firebase project identity'],
  [/teameet-alpha/, 'must require the dedicated Alpha Firebase project'],
  [/openssl pkey -noout/, 'must parse the Firebase private key before writing'],
  [/FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY/, 'must install all Firebase Admin fields'],
]);

forbidPatterns(firebaseRuntimeSyncPath, [
  [/aws ssm put-parameter/, 'deploy sync must not overwrite the persistent operator-managed Firebase key'],
  [/cat "\$\{env_file\}"/, 'must never print the protected runtime env'],
]);

forbidPatterns(workflowPath, [
  [/imageTag=latest/, 'must not deploy a mutable latest tag'],
  [/uses:\s*[^\n]+@v[0-9]/, 'privileged actions must be pinned to full commits'],
]);

requirePatterns(manifestBuilderPath, [
  [/manifests\/\$\{RELEASE_SHA\}\.json/, 'must persist one manifest per commit SHA'],
  [/SOURCE_VERSION_ID/, 'manifest must bind the versioned source object'],
  [/SOURCE_SHA256/, 'manifest must bind the source checksum'],
  [/api_digest/, 'manifest must bind the API digest'],
  [/web_digest/, 'manifest must bind the Web digest'],
  [/rollbackCompatibleWith/, 'manifest must bind rollback compatibility to the previous SHA'],
  [/migrationValidatedFrom/, 'manifest must retain the exact migration validation base'],
  [/--if-none-match '\*'/, 'manifest creation must be create-only'],
]);

requirePatterns(ssmDeployPath, [
  [/ALPHA_MANIFEST_FILE=/, 'SSM deploy must receive the downloaded manifest'],
  [/ALPHA_MANIFEST_SHA256=/, 'SSM deploy must receive the manifest checksum'],
  [/ALPHA_SOURCE_VERSION_ID=/, 'SSM deploy must bind the downloaded source version'],
  [/ALPHA_SOURCE_SHA256=/, 'SSM deploy must bind the downloaded source checksum'],
]);

requirePatterns(composePath, [
  [/v1_uploads_init:[\s\S]*?image:\s*\$\{ALPHA_API_IMAGE:\?/, 'upload initializer must use the exact API digest'],
  [/image:\s*\$\{ALPHA_API_IMAGE:\?/, 'API image must be an explicit digest reference'],
  [/image:\s*\$\{ALPHA_WEB_IMAGE:\?/, 'Web image must be an explicit digest reference'],
]);

forbidPatterns(composePath, [
  [/teameet-v1-api:\$\{ALPHA_RELEASE_VERSION/, 'API must not use a local release tag'],
  [/teameet-v1-web:\$\{ALPHA_RELEASE_VERSION/, 'Web must not use a local release tag'],
]);

requirePatterns(deployPath, [
  [/validate_alpha_final_release_manifest \\/, 'deploy must validate the release manifest'],
  [/write_candidate_manifest/, 'deploy must write candidate state before mutation'],
  [/assert_running_release_digests/, 'deploy must verify running image digests'],
  [/promote_candidate_manifest/, 'deploy must atomically promote candidate state'],
  [/restore_active_release/, 'failed deploy must restore the prior active images'],
  [/prepare_alpha_release_source/, 'deploy must prepare an immutable source directory'],
  [/activate_alpha_release_source/, 'deploy must atomically activate candidate source'],
  [/restore_legacy_alpha_source/, 'first immutable failure must restore legacy source'],
]);

forbidPatterns(deployPath, [
  [/\bdocker\s+build\b/, 'EC2 must not build application images'],
  [/\bdocker\s+compose\b[^\n]*\bbuild\b/, 'EC2 Compose must not build application images'],
]);

requirePatterns(rollbackPath, [
  [/PREVIOUS_MANIFEST/, 'rollback must require previous state'],
  [/assert_running_release_digests/, 'rollback must verify restored image digests'],
  [/swap_active_previous_manifests/, 'rollback must atomically swap release states'],
  [/activate_alpha_release_source/, 'rollback must activate the previous pinned source'],
]);

requirePatterns(sourceLibraryPath, [
  [/ALPHA_SOURCE_RELEASES_DIR/, 'source releases must use a dedicated versioned directory'],
  [/ALPHA_RUNTIME_CONFIG_DIR/, 'runtime configuration must remain outside release source'],
  [/ALPHA_RUNTIME_METADATA_FILE/, 'release metadata must remain outside immutable source'],
  [/ln -s "\$\{target_dir\}"/, 'activation must use a symlink to an immutable source directory'],
  [/mv -Tf/, 'Linux activation must replace the live symlink without following it'],
  [/\.source-sha256/, 'source reuse must bind the pinned source checksum'],
  [/rsync -ani --delete/, 'source reuse must reject local directory drift'],
  [/restore_legacy_alpha_source/, 'initial conversion must retain a legacy restore path'],
]);

requirePatterns(rollbackBasePath, [
  [/\.teameet-alpha-release/, 'first immutable conversion must resolve the legacy receipt'],
  [/migration_base_sha/, 'migration compatibility must use canonical or legacy release state'],
  [/check-expand-contract-migrations\.sh/, 'migration base must gate the candidate before deployment'],
]);

requirePatterns(manifestLibraryPath, [
  [/schemaVersion/, 'manifest validator must pin a schema version'],
  [/environment.*alpha/, 'manifest validator must pin the alpha environment'],
  [/\.images\.api\.uri == \(\.images\.api\.repository \+ "@" \+ \.images\.api\.digest\)/, 'manifest validator must require digest image references'],
  [/expand-contract/, 'rollback must declare the database compatibility policy'],
  [/rollbackCompatibleWith/, 'stored manifests must declare their rollback compatibility base'],
  [/migrationValidatedFrom/, 'stored manifests must retain migration validation provenance'],
]);

requirePatterns(releaseLibraryPath, [
  [/candidate/, 'release state must include candidate'],
  [/active/, 'release state must include active'],
  [/previous/, 'release state must include previous'],
  [/activeManifestSha256/, 'release state must retain the independently supplied active manifest checksum'],
  [/previousManifestSha256/, 'release state must retain the previous manifest checksum'],
]);

requirePatterns(rollbackWorkflowPath, [
  [/@[0-9a-f]{40}/, 'privileged rollback actions must be pinned to commits'],
  [/expected_active_sha/, 'rollback must require a stale-operation guard'],
]);

requirePatterns(provisioningPath, [
  [/sts:AssumeRoleWithWebIdentity/, 'provisioning must pin the GitHub OIDC trust policy'],
  [/render-alpha-immutable-deploy-policies\.mjs/, 'provisioning must use the canonical IAM policy renderer'],
  [/Environment[\s\S]*alpha/, 'provisioning must validate the alpha target identity'],
]);

requirePatterns(policyRendererPath, [
  [/ssm:SendCommand/, 'GitHub role must be able to invoke the exact alpha instance'],
  [/s3:GetObjectVersion/, 'EC2 role must read pinned source and manifest versions'],
  [/ssm:PutParameter/, 'GitHub role must write the scoped alpha runtime parameter'],
  [/ssm:GetParameter/, 'EC2 role must read the scoped alpha runtime parameter'],
]);

forbidPatterns(provisioningPath, [
  [/imageCountMoreThan/, 'lifecycle must not blindly expire tagged rollback images'],
]);

if (errors.length > 0) {
  console.error('[alpha-immutable-deploy] failed');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('[alpha-immutable-deploy] passed');
if (runSelfTest) verifyNegativeControls(runtimePolicies);

function renderRuntimePolicies() {
  const accountId = '123456789012';
  const result = spawnSync(process.execPath, [
    policyRendererPath,
    '--policy', 'all',
    '--region', 'ap-northeast-2',
    '--account', accountId,
    '--bucket', `teameet-alpha-deploy-${accountId}-ap-northeast-2`,
    '--instance', 'i-00000000000000000',
  ], {
    cwd: resolve(sourceRoot),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    errors.push(`${provisioningPath}: failed to render IAM policies: ${result.stderr.trim()}`);
    return undefined;
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    errors.push(`${provisioningPath}: rendered IAM policies are not valid JSON: ${error.message}`);
    return undefined;
  }
}

function validateSyncScriptParameterParity(targetErrors) {
  for (const file of readdirSync(resolve(sourceRoot, 'scripts/release'))) {
    if (!/^sync-alpha-.+-env\.sh$/.test(file) || syncScriptsOutsideIam.has(file)) continue;
    const source = readFileSync(resolve(sourceRoot, 'scripts/release', file), 'utf8');
    const written = new Set();
    const namesArray = source.match(/^names=\(([^)]*)\)/m);
    if (namesArray) namesArray[1].trim().split(/\s+/).forEach((name) => written.add(name));
    const literal = source.match(/parameter_name='\/teameet\/alpha\/env\/([A-Z0-9_]+)'/);
    if (literal) written.add(literal[1]);
    if (written.size === 0) {
      targetErrors.push(`scripts/release/${file}: no SSM parameter names found; parity check cannot cover it`);
    }
    for (const name of written) {
      if (!expectedRuntimeParameterNames.includes(name)) {
        targetErrors.push(`scripts/release/${file}: writes ${name}, which the alpha IAM parameter list does not allow`);
      }
    }
  }
}

// Runs the Kakao sync against a stubbed aws/jq: well-formed secrets must reach put-parameter, malformed
// ones must leave AWS untouched. A guard that rejects everything still exits 0, so only this catches it.
function validateKakaoSyncBehaviour(targetErrors) {
  const script = resolve(sourceRoot, 'scripts/release/sync-alpha-kakao-env.sh');
  const stubDir = mkdtempSync(join(tmpdir(), 'kakao-sync-stub-'));
  const callLog = join(stubDir, 'aws-calls.log');
  try {
    writeFileSync(join(stubDir, 'aws'), [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> '${callLog}'`,
      'case "$2" in send-command) echo cmd-0;; get-command-invocation) echo Success;; esac',
      '',
    ].join('\n'));
    writeFileSync(join(stubDir, 'jq'), '#!/usr/bin/env bash\necho "{}"\n');
    chmodSync(join(stubDir, 'aws'), 0o755);
    chmodSync(join(stubDir, 'jq'), 0o755);
    const valid = {
      INSTANCE_ID: 'i-0123456789abcdef0',
      AWS_REGION: 'ap-northeast-2',
      SECRET_KAKAO_CLIENT_ID: '0123456789abcdef0123456789abcdef',
      SECRET_KAKAO_CLIENT_SECRET: 'AbCdEf0123456789AbCdEf0123456789',
      SECRET_ALPHA_KAKAO_REDIRECT_URI: 'https://alpha.teameet.co.kr/callback/kakao',
      SECRET_KAKAO_APP_ID: '1234567',
    };
    const run = (overrides) => {
      rmSync(callLog, { force: true });
      const result = spawnSync('bash', [script], {
        encoding: 'utf8',
        env: { ...process.env, ...valid, ...overrides, PATH: `${stubDir}:${process.env.PATH}` },
      });
      let calls = '';
      try { calls = readFileSync(callLog, 'utf8'); } catch { calls = ''; }
      const written = [...calls.matchAll(/put-parameter .*--name \/teameet\/alpha\/env\/([A-Z_]+)/g)].map((match) => match[1]);
      return { result, calls, written };
    };

    const happy = run({});
    const expected = ['KAKAO_CLIENT_ID', 'KAKAO_CLIENT_SECRET', 'KAKAO_REDIRECT_URI', 'KAKAO_APP_ID'];
    if (happy.result.status !== 0 || expected.some((name) => !happy.written.includes(name))) {
      targetErrors.push(`scripts/release/sync-alpha-kakao-env.sh: well-formed secrets did not write ${expected.join(', ')} (exit ${happy.result.status}, wrote [${happy.written.join(', ')}])`);
    }
    for (const [label, overrides] of [
      ['foreign redirect host', { SECRET_ALPHA_KAKAO_REDIRECT_URI: 'https://evil.example/callback/kakao' }],
      ['short client id', { SECRET_KAKAO_CLIENT_ID: 'abc' }],
    ]) {
      const rejected = run(overrides);
      if (rejected.result.status !== 0 || rejected.calls !== '') {
        targetErrors.push(`scripts/release/sync-alpha-kakao-env.sh: ${label} must warn and leave AWS untouched (exit ${rejected.result.status})`);
      }
    }
  } finally {
    rmSync(stubDir, { recursive: true, force: true });
  }
}

// The remote half copies the protected .env (every runtime secret) to a temp file; clearing the EXIT trap
// on success skips its removal, so each deploy would leave another copy on the alpha host.
function validateSyncScriptsRemoveEnvCopies(targetErrors) {
  for (const file of readdirSync(resolve(sourceRoot, 'scripts/release'))) {
    if (!/^sync-alpha-.+-env\.sh$/.test(file)) continue;
    const source = readFileSync(resolve(sourceRoot, 'scripts/release', file), 'utf8');
    if (/^trap - EXIT$/m.test(source)) {
      targetErrors.push(`scripts/release/${file}: must not clear the EXIT trap; it removes the temp copy of deploy/.env`);
    }
  }
}

function validateRuntimePolicies(policies, targetErrors) {
  // Independent copy of the live allowlist; sorted like the renderer's output.
  const parameterArn = expectedRuntimeParameterNames.map(
    (name) => `arn:aws:ssm:ap-northeast-2:123456789012:parameter/teameet/alpha/env/${name}`,
  );
  validateRuntimePolicy(
    policies?.github,
    {
      label: 'GitHub deploy role',
      sid: 'WriteAlphaRuntimeParameter',
      action: 'ssm:PutParameter',
      resource: parameterArn,
    },
    targetErrors,
  );
  validateRuntimePolicy(
    policies?.instance,
    {
      label: 'Alpha EC2 role',
      sid: 'ReadAlphaRuntimeParameter',
      action: 'ssm:GetParameter',
      resource: parameterArn,
    },
    targetErrors,
  );
}

function validateRuntimePolicy(policy, expected, targetErrors) {
  const statements = Array.isArray(policy?.Statement) ? policy.Statement : [];
  const runtimeStatements = statements.filter((statement) => {
    const actions = Array.isArray(statement?.Action) ? statement.Action : [statement?.Action];
    return actions.some((action) => action === 'ssm:PutParameter' || action === 'ssm:GetParameter');
  });
  if (runtimeStatements.length !== 1) {
    targetErrors.push(`${provisioningPath}: ${expected.label} must have exactly one runtime Parameter statement`);
    return;
  }
  const [statement] = runtimeStatements;
  if (
    statement.Sid !== expected.sid ||
    statement.Effect !== 'Allow' ||
    statement.Action !== expected.action ||
    JSON.stringify(statement.Resource) !== JSON.stringify(expected.resource)
  ) {
    targetErrors.push(
      `${provisioningPath}: ${expected.label} runtime Parameter statement must be exactly ${expected.action} on the explicit parameter list`,
    );
  }
}

function validateRuntimeSecretTransport(source, targetErrors) {
  if (typeof source !== 'string') {
    targetErrors.push(`${runtimeSyncPath}: source is unavailable`);
    return;
  }
  if (!/aws ssm put-parameter[\s\S]*?--name "\$\{parameter_name\}"[\s\S]*?--value "\$\{SECRET_SLACK_INQUIRY_WEBHOOK_URL\}"[\s\S]*?--type SecureString/.test(source)) {
    targetErrors.push(`${runtimeSyncPath}: webhook must enter SSM only through the scoped SecureString`);
  }
  const remoteScript = source.match(/remote_script=\$\(cat <<REMOTE\r?\n([\s\S]*?)\r?\nREMOTE\r?\n\)/)?.[1];
  if (!remoteScript) {
    targetErrors.push(`${runtimeSyncPath}: remote script boundary is missing`);
    return;
  }
  if (/SECRET_SLACK_INQUIRY_WEBHOOK_URL|hooks\.slack\.com/.test(remoteScript)) {
    targetErrors.push(`${runtimeSyncPath}: remote script must not contain the webhook secret or its variable`);
  }
  if (!/aws ssm get-parameter[\s\S]*?--name \$\{parameter_name\}[\s\S]*?--with-decryption/.test(remoteScript)) {
    targetErrors.push(`${runtimeSyncPath}: remote script must retrieve the scoped Parameter with decryption`);
  }
  const parametersBlock = source.match(/parameters="[\s\S]*?"\r?\ncommand_id=/)?.[0] ?? '';
  if (!parametersBlock || /SECRET_SLACK_INQUIRY_WEBHOOK_URL|hooks\.slack\.com/.test(parametersBlock)) {
    targetErrors.push(`${runtimeSyncPath}: SSM parameters must contain only the remote script, never the webhook secret`);
  }
  const sendCommand = source.match(/command_id="\$\(aws ssm send-command[\s\S]*?--output text\)"/)?.[0] ?? '';
  if (
    !sendCommand ||
    !/--parameters "\$\{parameters\}"/.test(sendCommand) ||
    /SECRET_SLACK_INQUIRY_WEBHOOK_URL|hooks\.slack\.com/.test(sendCommand)
  ) {
    targetErrors.push(`${runtimeSyncPath}: send-command must receive only the sanitized parameters document`);
  }
}

function readRequiredFile(filePath) {
  try {
    return readFileSync(resolve(sourceRoot, filePath), 'utf8');
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[alpha-immutable-deploy] missing ${filePath}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

function requirePatterns(filePath, requirements) {
  const source = sources.get(filePath);
  if (source === undefined) return;
  for (const [pattern, message] of requirements) {
    if (!pattern.test(source)) errors.push(`${filePath}: ${message}`);
  }
}

function forbidPatterns(filePath, forbidden) {
  const source = sources.get(filePath);
  if (source === undefined) return;
  for (const [pattern, message] of forbidden) {
    if (pattern.test(source)) errors.push(`${filePath}: ${message}`);
  }
}

function verifyNegativeControls(renderedPolicies) {
  const originalDeploy = sources.get(deployPath);
  const originalCompose = sources.get(composePath);
  const originalProvisioning = sources.get(provisioningPath);
  const originalRuntimeSync = sources.get(runtimeSyncPath);
  if (
    originalDeploy === undefined ||
    originalCompose === undefined ||
    originalProvisioning === undefined ||
    originalRuntimeSync === undefined ||
    renderedPolicies === undefined
  ) process.exit(1);

  sources.set(deployPath, `${originalDeploy}\ndocker build .\n`);
  errors.length = 0;
  forbidPatterns(deployPath, [[/\bdocker\s+build\b/, 'EC2 must not build application images']]);
  assertRejected('EC2 docker build');

  sources.set(deployPath, originalDeploy);
  sources.set(composePath, originalCompose.replace(
    /image:\s*\$\{ALPHA_API_IMAGE:\?[^\n]+/,
    'image: teameet-v1-api:${ALPHA_RELEASE_VERSION:-alpha}',
  ));
  errors.length = 0;
  requirePatterns(composePath, [[/image:\s*\$\{ALPHA_API_IMAGE:\?/, 'API image must be an explicit digest reference']]);
  forbidPatterns(composePath, [[/teameet-v1-api:\$\{ALPHA_RELEASE_VERSION/, 'API must not use a local release tag']]);
  assertRejected('tag-only API image');

  sources.set(composePath, originalCompose);
  sources.set(deployPath, originalDeploy.replaceAll('validate_alpha_final_release_manifest', 'validate_release_candidate'));
  errors.length = 0;
  requirePatterns(deployPath, [[/validate_alpha_final_release_manifest \\/, 'deploy must validate the release manifest']]);
  assertRejected('missing manifest validation');

  assertPolicyRejected('swapped runtime Parameter role actions', renderedPolicies, (policies) => {
    runtimeStatement(policies.github).Action = 'ssm:GetParameter';
    runtimeStatement(policies.instance).Action = 'ssm:PutParameter';
  });
  assertPolicyRejected('extra runtime Parameter action', renderedPolicies, (policies) => {
    runtimeStatement(policies.github).Action = ['ssm:PutParameter', 'ssm:GetParameter'];
  });
  assertPolicyRejected('broad runtime Parameter resource', renderedPolicies, (policies) => {
    runtimeStatement(policies.github).Resource = 'arn:aws:ssm:ap-northeast-2:123456789012:parameter/teameet/alpha/env/*';
  });

  assertPolicyRejected('unexpected runtime Parameter name', renderedPolicies, (policies) => {
    runtimeStatement(policies.github).Resource.push('arn:aws:ssm:ap-northeast-2:123456789012:parameter/teameet/alpha/env/OTHER');
  });
  assertPolicyRejected('missing runtime Parameter name', renderedPolicies, (policies) => {
    runtimeStatement(policies.instance).Resource.pop();
  });

  errors.length = 0;
  validateRuntimeSecretTransport(
    originalRuntimeSync.replace(
      'remote_script=$(cat <<REMOTE\nset -Eeuo pipefail',
      'remote_script=$(cat <<REMOTE\nset -Eeuo pipefail\nvalue="${SECRET_SLACK_INQUIRY_WEBHOOK_URL}"',
    ),
    errors,
  );
  assertRejected('webhook variable in remote script');

  errors.length = 0;
  validateRuntimeSecretTransport(
    originalRuntimeSync.replace(
      'parameters="$(jq -nc --arg script "${remote_script}" \'{commands:[$script]}\')"',
      'parameters="${SECRET_SLACK_INQUIRY_WEBHOOK_URL}"',
    ),
    errors,
  );
  assertRejected('webhook variable in SSM parameters');

  errors.length = 0;
  validateRuntimeSecretTransport(
    originalRuntimeSync.replace(
      '--parameters "${parameters}"',
      '--parameters "${SECRET_SLACK_INQUIRY_WEBHOOK_URL}"',
    ),
    errors,
  );
  assertRejected('webhook variable in send-command');

  sources.set(deployPath, originalDeploy);
  sources.set(provisioningPath, originalProvisioning);
  errors.length = 0;
  console.log('[alpha-immutable-deploy] negative controls passed');
}

function assertPolicyRejected(label, renderedPolicies, mutate) {
  const policies = JSON.parse(JSON.stringify(renderedPolicies));
  mutate(policies);
  const policyErrors = [];
  validateRuntimePolicies(policies, policyErrors);
  if (policyErrors.length === 0) {
    console.error(`[alpha-immutable-deploy] negative control was not rejected: ${label}`);
    process.exit(1);
  }
}

function runtimeStatement(policy) {
  return policy.Statement.find((statement) => {
    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    return actions.some((action) => action === 'ssm:PutParameter' || action === 'ssm:GetParameter');
  });
}

function assertRejected(label) {
  if (errors.length === 0) {
    console.error(`[alpha-immutable-deploy] negative control was not rejected: ${label}`);
    process.exit(1);
  }
}
