#!/usr/bin/env node
// Creates the Slack alerting stack in AWS. Default is a dry run that only prints what would be
// created (aws commands + IAM policies); nothing is called until --apply is given.
//   node infra/monitoring/install.mjs                       # dry run
//   node infra/monitoring/install.mjs --apply --prod-instance-id i-... --alpha-instance-id i-... --rds-id ...
//   node infra/monitoring/install.mjs --teardown [--apply]  # removes what this script created
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildInstallPlan, buildTeardownPlan, DEFAULTS } from './lib/plan.mjs';
import { runPlan } from './lib/run-plan.mjs';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
export const ZIP_FILES = ['lambda-handler.mjs', 'lib/dedupe.mjs', 'lib/format.mjs', 'lib/thresholds.mjs', 'lib/summary.mjs'];

const VALUE_FLAGS = {
  '--region': 'region', '--host': 'host', '--webhook-param': 'webhookParam', '--prod-instance-id': 'prodInstanceId',
  '--alpha-instance-id': 'alphaInstanceId', '--rds-id': 'rdsId',
};

export function parseArgs(argv) {
  const opts = { apply: false, teardown: false, includeAlpha: DEFAULTS.includeAlpha };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--dry-run') opts.apply = false;
    else if (arg === '--teardown') opts.teardown = true;
    else if (arg === '--no-alpha') opts.includeAlpha = false;
    else if (VALUE_FLAGS[arg]) {
      const value = argv[(i += 1)];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      opts[VALUE_FLAGS[arg]] = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

export async function buildZip() {
  const dir = await mkdtemp(join(tmpdir(), 'teameet-ops-lambda-'));
  const zip = join(dir, 'lambda.zip');
  await execFileAsync('zip', ['-q', zip, ...ZIP_FILES], { cwd: HERE });
  return zip;
}

export async function awsExec(args) {
  const { stdout } = await execFileAsync('aws', args, { maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const steps = opts.teardown ? buildTeardownPlan(opts) : buildInstallPlan(opts);
  console.log(opts.apply
    ? '== 실제로 만들어요(--apply) =='
    : '== 미리보기(--dry-run, 기본값): 아무것도 만들지 않아요. 실제 생성은 --apply ==');
  await runPlan(steps, { apply: opts.apply, exec: awsExec, log: (line) => console.log(line), buildZip });
  console.log(opts.apply ? '끝났어요.' : '미리보기가 끝났어요. 만든 것이 없어요.');
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
