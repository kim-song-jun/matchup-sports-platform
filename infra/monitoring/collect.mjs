#!/usr/bin/env node
// Runs on the server once a minute (systemd timer). Reads docker/proc/df, prints a sample as JSON or
// publishes it with `aws cloudwatch put-metric-data`. Holds no secret: the Slack webhook lives only
// in the Lambda that formats alerts.
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildMetricData, CONTAINER_LABELS } from './lib/metrics.mjs';
import { NAMESPACES } from './lib/thresholds.mjs';
import {
  countNewHeapOom, diffContainers, linesAfter, parseCertDaysLeft, parseDfUsedPct, parseMemPerc,
  parseMeminfo, summarizeNginx,
} from './lib/parse.mjs';

const execFileAsync = promisify(execFile);
const STEP_TIMEOUT_MS = 15_000;
const TOTAL_TIMEOUT_MS = 40_000;
const DEFAULT_CERT_PATH = '/etc/letsencrypt/live/teameet.co.kr/fullchain.pem';

const NAME_BY_LABEL = Object.fromEntries(Object.entries(CONTAINER_LABELS).map(([n, l]) => [l, n]));

export async function realExec(file, args) {
  const { stdout, stderr } = await execFileAsync(file, args, { timeout: STEP_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
  return { stdout, stderr };
}

const splitLines = ({ stdout, stderr }) => `${stdout}\n${stderr}`.split('\n').filter(Boolean);

/**
 * One collection pass. Every step is isolated: a failing step is recorded in `failed` (and the
 * Heartbeat is withheld) instead of aborting the others or being swallowed.
 */
export async function collectSample({ exec, readText, nowMs, state, env, certPath = DEFAULT_CERT_PATH }) {
  const failed = [];
  const step = async (name, fn) => {
    try { return await fn(); } catch (err) {
      failed.push(name);
      console.error(`[collector] ${name} failed: ${String(err.message ?? err).split('\n')[0].slice(0, 200)}`);
      return null;
    }
  };
  const started = Date.now();
  const next = { ...state };

  const containers = await step('docker-inspect', async () => {
    const { stdout } = await exec('docker', ['inspect', ...Object.keys(CONTAINER_LABELS)]);
    return JSON.parse(stdout).map((c) => ({
      name: CONTAINER_LABELS[c.Name.replace(/^\//, '')],
      id: c.Id,
      startedAt: c.State.StartedAt,
      oomKilled: Boolean(c.State.OOMKilled),
    }));
  });
  const diff = containers ? diffContainers(state, containers, nowMs) : null;
  if (diff) {
    next.containers = diff.containers;
    next.deployUntilMs = diff.deployUntilMs;
  }

  const heapOom = { web: 0, api: 0, worker: 0 };
  next.heapLast = { ...(state.heapLast ?? {}) };
  for (const label of Object.keys(heapOom)) {
    const logs = await step(`docker-logs-${label}`, () =>
      exec('docker', ['logs', '--since', '70s', '--timestamps', NAME_BY_LABEL[label]]));
    if (!logs) continue;
    const { count, lastCounted } = countNewHeapOom(splitLines(logs), state.heapLast?.[label] ?? null);
    heapOom[label] = count;
    if (lastCounted) next.heapLast[label] = lastCounted;
  }
  // A cgroup OOM kill leaves no heap line; count it once, on the restart it caused.
  if (diff?.oomKilledRestarts) heapOom.web = Math.max(heapOom.web, diff.restarts.web ?? 0);

  const nginx = await step('nginx-logs', async () => {
    const logs = await exec('docker', ['logs', '--since', '60s', '--timestamps', NAME_BY_LABEL.nginx]);
    const fresh = linesAfter(splitLines(logs), state.nginxLast ?? null);
    if (fresh.newest) next.nginxLast = fresh.newest;
    return summarizeNginx(fresh.lines);
  });

  const webMemPct = await step('docker-stats', async () =>
    parseMemPerc((await exec('docker', ['stats', '--no-stream', '--format', '{{.MemPerc}}', NAME_BY_LABEL.web])).stdout));
  const mem = await step('meminfo', async () => parseMeminfo(await readText('/proc/meminfo')));
  const diskUsedPct = await step('df', async () => parseDfUsedPct((await exec('df', ['-P', '/'])).stdout));

  let originCertDays;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  if (env === 'prod' && state.certDay !== today) {
    originCertDays = await step('origin-cert', async () => {
      const { stdout } = await exec('openssl', ['x509', '-enddate', '-noout', '-in', certPath]);
      return parseCertDaysLeft(stdout, nowMs);
    });
    if (originCertDays !== null) next.certDay = today;
    else originCertDays = undefined;
  }

  return {
    sample: {
      nowMs,
      restarts: diff?.restarts ?? {},
      deploys: diff?.deploys ?? null,
      deployWindow: diff?.deployWindow ?? null,
      heapOom,
      nginx,
      webMemPct,
      memAvailableMB: mem?.memAvailableMB ?? null,
      swapUsedMB: mem?.swapUsedMB ?? null,
      diskUsedPct,
      originCertDays,
      collectorSeconds: Number(((Date.now() - started) / 1000).toFixed(2)),
      failed,
    },
    nextState: next,
  };
}

function parseArgs(argv) {
  const opts = { output: 'json', region: 'ap-northeast-2', stateFile: '/var/lib/teameet-ops/state.json', botNames: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--bot-names') opts.botNames = true;
    else if (['--env', '--output', '--region', '--state-file', '--cert-path'].includes(arg)) {
      const value = argv[(i += 1)];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      opts[arg.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!['prod', 'alpha'].includes(opts.env)) throw new Error('--env must be prod or alpha');
  if (!['json', 'cloudwatch'].includes(opts.output)) throw new Error('--output must be json or cloudwatch');
  return opts;
}

async function readState(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw new Error(`state file ${file} is unreadable: ${err.message}`);
  }
}

async function writeState(file, state) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  setTimeout(() => { console.error('[collector] exceeded 40s, giving up'); process.exit(2); }, TOTAL_TIMEOUT_MS).unref();
  const state = await readState(opts.stateFile);
  const { sample, nextState } = await collectSample({
    exec: realExec, readText: (p) => readFile(p, 'utf8'), nowMs: Date.now(), state, env: opts.env,
    certPath: opts.certPath,
  });
  const metricData = buildMetricData(opts.env, sample, { botNames: opts.botNames });
  if (opts.output === 'json') {
    console.log(JSON.stringify({ namespace: NAMESPACES[opts.env], failed: sample.failed, metricData }, null, 2));
  } else {
    await realExec('aws', ['cloudwatch', 'put-metric-data', '--region', opts.region,
      '--namespace', NAMESPACES[opts.env], '--metric-data', JSON.stringify(metricData)]);
  }
  // State moves forward only after the sample was delivered, so a failed publish is re-counted next minute.
  if (opts.output === 'cloudwatch') await writeState(opts.stateFile, nextState);
  if (sample.failed.length > 0) process.exitCode = 1;
}

// realpath: the install dir or tmp dir may sit behind a symlink, which would make a plain URL compare fail.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`[collector] ${err.message}`); process.exit(1); });
}
