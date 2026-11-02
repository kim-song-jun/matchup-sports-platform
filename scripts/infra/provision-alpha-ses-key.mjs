#!/usr/bin/env node
// Create a new Alpha-only SES IAM identity once. Secrets stay in process memory and SSM SecureString.
// Re-running against an existing user or parameters is refused; rotation needs the documented staged procedure.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const region = process.env.ALPHA_AWS_REGION;
const expectedAccount = process.env.ALPHA_EXPECTED_ACCOUNT_ID;
const instanceId = process.env.ALPHA_EC2_INSTANCE_ID;
if (!region || !expectedAccount || !instanceId) throw new Error('Alpha region, account and instance ID are required');
const userName = 'teameet-alpha-ses';
const policyName = 'TeameetAlphaSesSend';
const sender = 'alpha-no-reply@teameet.co.kr';
const domain = 'teameet.co.kr';
const names = ['ALPHA_SES_ACCESS_KEY_ID', 'ALPHA_SES_SECRET_ACCESS_KEY'];
const path = (name) => `/teameet/alpha/env/${name}`;
const aws = (args, options = {}) => execFileSync('aws', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options });
const json = (args, options) => JSON.parse(aws([...args, '--output', 'json'], options));
function retryNewCredentials(operation) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try { return operation(); } catch (error) {
      const message = String(error?.stderr ?? '');
      if (attempt === 14 || !/UnrecognizedClientException|InvalidClientTokenId/.test(message)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    }
  }
  throw new Error('New IAM credentials did not propagate');
}
function putSecureParameter(name, value) {
  const dir = mkdtempSync(join(tmpdir(), 'teameet-alpha-ses-'));
  const payload = join(dir, 'payload.json');
  try {
    writeFileSync(payload, JSON.stringify({ Name: path(name), Value: value, Type: 'SecureString', Overwrite: false }), { mode: 0o600 });
    aws(['ssm', 'put-parameter', '--region', region, '--cli-input-json', `file://${payload}`]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const identity = json(['sts', 'get-caller-identity']);
if (identity.Account !== expectedAccount) throw new Error('Authenticated account differs from pinned Alpha account');
const instance = json(['ec2', 'describe-instances', '--region', region, '--instance-ids', instanceId]).Reservations?.[0]?.Instances?.[0];
const tags = Object.fromEntries((instance?.Tags ?? []).map(({ Key, Value }) => [Key, Value]));
if (instance?.State?.Name !== 'running' || tags.Name !== 'teameet-alpha-dev' || tags.Environment !== 'alpha' || tags.Branch !== 'dev') {
  throw new Error('Instance is not the running dev/Alpha server');
}
const account = json(['sesv2', 'get-account', '--region', region]);
const verified = json(['sesv2', 'get-email-identity', '--region', region, '--email-identity', domain]);
if (!account.SendingEnabled || !account.ProductionAccessEnabled || !verified.VerifiedForSendingStatus) {
  throw new Error('SES sending or domain identity is not ready');
}
const existing = json(['ssm', 'describe-parameters', '--region', region, '--parameter-filters', `Key=Name,Option=BeginsWith,Values=/teameet/alpha/env/ALPHA_SES_`]).Parameters ?? [];
if (existing.length) throw new Error('Alpha SES parameters already exist; use staged rotation instead');
try {
  aws(['iam', 'get-user', '--user-name', userName]);
  throw new Error('Alpha SES IAM user already exists; use staged rotation instead');
} catch (error) {
  if (!String(error.stderr ?? '').includes('NoSuchEntity')) throw error;
}

let createdUser = false;
let createdPolicy = false;
let accessKeyId;
let phase = 'create-user';
const createdParameters = [];
try {
  aws(['iam', 'create-user', '--user-name', userName, '--tags', 'Key=Environment,Value=alpha', 'Key=Purpose,Value=ses-send']);
  createdUser = true;
  phase = 'apply-policy';
  const policy = {
    Version: '2012-10-17',
    Statement: [{
      Sid: 'SendOnlyFromAlphaAddress', Effect: 'Allow', Action: 'ses:SendEmail',
      Resource: `arn:aws:ses:${region}:${expectedAccount}:identity/${domain}`,
      Condition: { StringEquals: { 'ses:FromAddress': sender } },
    }],
  };
  aws(['iam', 'put-user-policy', '--user-name', userName, '--policy-name', policyName, '--policy-document', JSON.stringify(policy)]);
  createdPolicy = true;
  phase = 'simulate-policy';
  const simulate = (from) => json([
    'iam', 'simulate-principal-policy', '--policy-source-arn', `arn:aws:iam::${expectedAccount}:user/${userName}`,
    '--action-names', 'ses:SendEmail', '--resource-arns', policy.Statement[0].Resource,
    '--context-entries', `ContextKeyName=ses:FromAddress,ContextKeyValues=${from},ContextKeyType=string`,
  ]).EvaluationResults?.[0]?.EvalDecision;
  if (simulate(sender) !== 'allowed' || simulate('no-reply@teameet.co.kr') === 'allowed') {
    throw new Error('Alpha sender permission is not confined to its address');
  }
  phase = 'create-key';
  const key = json(['iam', 'create-access-key', '--user-name', userName]).AccessKey;
  accessKeyId = key.AccessKeyId;
  for (const [name, value] of [[names[0], key.AccessKeyId], [names[1], key.SecretAccessKey]]) {
    phase = `store-${name}`;
    putSecureParameter(name, value);
    createdParameters.push(name);
  }
  const sesEnv = { ...process.env, AWS_ACCESS_KEY_ID: key.AccessKeyId, AWS_SECRET_ACCESS_KEY: key.SecretAccessKey, AWS_EC2_METADATA_DISABLED: 'true' };
  delete sesEnv.AWS_SESSION_TOKEN;
  delete sesEnv.AWS_PROFILE;
  delete sesEnv.AWS_DEFAULT_PROFILE;
  phase = 'verify-key-identity';
  const scopedIdentity = retryNewCredentials(() => json(['sts', 'get-caller-identity'], { env: sesEnv }));
  if (scopedIdentity.Account !== expectedAccount || scopedIdentity.Arn !== `arn:aws:iam::${expectedAccount}:user/${userName}`) {
    throw new Error('SES key identity is not the Alpha sender user');
  }
  const message = {
    FromEmailAddress: sender,
    Destination: { ToAddresses: ['success@simulator.amazonses.com'] },
    Content: { Simple: { Subject: { Data: 'Teameet Alpha SES test' }, Body: { Text: { Data: 'Alpha sender verification.' } } } },
  };
  phase = 'ses-mailbox-simulator';
  retryNewCredentials(() => aws(['sesv2', 'send-email', '--region', region, '--cli-input-json', JSON.stringify(message)], { env: sesEnv }));
  console.log('Alpha SES user and two SecureString parameters created; mailbox simulator accepted one test message.');
} catch (error) {
  const awsErrorCode = String(error?.stderr ?? '').match(/An error occurred \(([A-Za-z0-9]+)\)/)?.[1] ?? 'unknown';
  console.error(`Alpha SES provisioning failed at ${phase}; AWS error: ${awsErrorCode}`);
  // Only remove resources created by this invocation. Never print credentials or AWS command bodies.
  for (const name of createdParameters.reverse()) {
    try { aws(['ssm', 'delete-parameter', '--region', region, '--name', path(name)]); } catch { console.error(`Cleanup failed: ${path(name)}`); }
  }
  if (accessKeyId) {
    try { aws(['iam', 'delete-access-key', '--user-name', userName, '--access-key-id', accessKeyId]); } catch { console.error('Cleanup failed: new IAM access key'); }
  }
  if (createdPolicy) {
    try { aws(['iam', 'delete-user-policy', '--user-name', userName, '--policy-name', policyName]); } catch { console.error('Cleanup failed: new IAM policy'); }
  }
  if (createdUser) {
    try { aws(['iam', 'delete-user', '--user-name', userName]); } catch { console.error('Cleanup failed: new IAM user'); }
  }
  throw new Error('Alpha SES provisioning failed; check AWS policy and SES access without exposing key material');
}
