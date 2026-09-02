import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/deploy-alpha.yml', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../release/sync-alpha-firebase-env.sh', import.meta.url), 'utf8');

test('alpha deployment restores Firebase before application activation', () => {
  const syncIndex = workflow.indexOf('bash scripts/release/sync-alpha-firebase-env.sh');
  const deployIndex = workflow.indexOf('bash scripts/release/deploy-alpha-via-ssm.sh');
  assert.notEqual(syncIndex, -1);
  assert.notEqual(deployIndex, -1);
  assert.ok(syncIndex < deployIndex);
});

test('Firebase key stays operator-managed in one persistent SecureString', () => {
  assert.match(sync, /readonly parameter_name='\/teameet\/alpha\/env\/FIREBASE_ADMIN_JSON'/);
  assert.doesNotMatch(sync, /aws ssm put-parameter/);
  assert.match(sync, /aws ssm get-parameter[\s\S]*--with-decryption/);
});

test('sync follows and pins the protected runtime env target', () => {
  assert.match(sync, /env_file="\\\$\(readlink -f/);
  assert.match(sync, /\/home\/ec2-user\/\.teameet-alpha-runtime\/\.env/);
  assert.match(sync, /cat "\\\$\{tmp\}" > "\\\$\{env_file\}"/);
  assert.doesNotMatch(sync, /mv "\\\$\{tmp\}" "\\\$\{env_file\}"/);
});

test('sync validates identity and private-key readability before writing', () => {
  assert.match(sync, /select\(\.type == "service_account"\)/);
  assert.match(sync, /\[ "\\\$\{project_id\}" = teameet-alpha \]/);
  assert.match(sync, /openssl pkey -noout/);
  assert.match(sync, /FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY/);
});

test('sync never prints the protected env or credential values', () => {
  assert.doesNotMatch(sync, /cat "\\\$\{env_file\}"/);
  assert.doesNotMatch(sync, /echo .*private_key/);
  assert.doesNotMatch(sync, /echo .*client_email/);
});
