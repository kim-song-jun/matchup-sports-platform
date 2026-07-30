#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argumentsList = process.argv.slice(2);
const sourceRoot = argumentsList.find((argument) => !argument.startsWith('--')) ?? '.';
const runSelfTest = argumentsList.includes('--self-test');

const workflowPath = '.github/workflows/deploy-alpha.yml';
const composePath = 'deploy/docker-compose.alpha.yml';
const deployPath = 'deploy/deploy-alpha.sh';
const rollbackPath = 'deploy/rollback-alpha.sh';
const releaseLibraryPath = 'deploy/alpha-release-common.sh';
const sourceLibraryPath = 'deploy/alpha-source-common.sh';
const manifestLibraryPath = 'deploy/alpha-manifest-common.sh';
const rollbackWorkflowPath = '.github/workflows/rollback-alpha.yml';
const provisioningPath = 'scripts/infra/provision-alpha-immutable-deploy.sh';
const targetVerificationPath = 'scripts/release/verify-alpha-aws-target.sh';
const sourcePreparationPath = 'scripts/release/prepare-alpha-source.sh';
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
  [targetVerificationPath, readRequiredFile(targetVerificationPath)],
  [sourcePreparationPath, readRequiredFile(sourcePreparationPath)],
  [manifestBuilderPath, readRequiredFile(manifestBuilderPath)],
  [ssmDeployPath, readRequiredFile(ssmDeployPath)],
  [rollbackBasePath, readRequiredFile(rollbackBasePath)],
]);

const errors = [];

requirePatterns(workflowPath, [
  [/amazon-ecr-login/, 'must authenticate to ECR'],
  [/docker\/build-push-action/, 'must build and push images on the runner'],
  [/imageTag="sha-\$\{RELEASE_SHA\}"/, 'must resolve immutable SHA image tags'],
  [/create-alpha-release-manifest\.sh/, 'must create or reuse the immutable manifest'],
  [/deploy-alpha-via-ssm\.sh/, 'must delegate the pinned release to SSM'],
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
  [/validate_alpha_release_manifest/, 'deploy must validate the release manifest'],
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
  [/ssm:SendCommand/, 'GitHub role must be able to invoke the exact alpha instance'],
  [/s3:GetObjectVersion/, 'EC2 role must read pinned source and manifest versions'],
  [/Environment[\s\S]*alpha/, 'provisioning must validate the alpha target identity'],
]);

forbidPatterns(provisioningPath, [
  [/imageCountMoreThan/, 'lifecycle must not blindly expire tagged rollback images'],
  [/s3:ListBucket/, 'GitHub deploy role must not require bucket listing'],
  [/s3:GetBucketVersioning/, 'GitHub deploy role must not require bucket metadata access'],
]);

forbidPatterns(targetVerificationPath, [
  [/head-bucket/, 'target verification must not require s3:ListBucket'],
  [/get-bucket-versioning/, 'target verification must not require bucket metadata access'],
]);

requirePatterns(sourcePreparationPath, [
  [/--expected-bucket-owner/, 'source object operations must pin the release bucket owner'],
  [/--query VersionId --output text/, 'source upload must require an S3 object version'],
  [/\[\[ "\$\{source_version_id\}" =~/, 'source upload must reject a missing or malformed object version'],
]);

requirePatterns(manifestBuilderPath, [
  [/--expected-bucket-owner/, 'manifest object operations must pin the release bucket owner'],
  [/--query VersionId --output text/, 'manifest upload must require an S3 object version'],
  [/\[\[ "\$\{manifest_version_id\}" =~/, 'manifest upload must reject a missing or malformed object version'],
]);

if (errors.length > 0) {
  console.error('[alpha-immutable-deploy] failed');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('[alpha-immutable-deploy] passed');
if (runSelfTest) verifyNegativeControls();

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

function verifyNegativeControls() {
  const originalDeploy = sources.get(deployPath);
  const originalCompose = sources.get(composePath);
  if (originalDeploy === undefined || originalCompose === undefined) process.exit(1);

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
  sources.set(deployPath, originalDeploy.replaceAll('validate_alpha_release_manifest', 'validate_release_candidate'));
  errors.length = 0;
  requirePatterns(deployPath, [[/validate_alpha_release_manifest/, 'deploy must validate the release manifest']]);
  assertRejected('missing manifest validation');

  sources.set(deployPath, originalDeploy);
  errors.length = 0;
  console.log('[alpha-immutable-deploy] negative controls passed');
}

function assertRejected(label) {
  if (errors.length === 0) {
    console.error(`[alpha-immutable-deploy] negative control was not rejected: ${label}`);
    process.exit(1);
  }
}
