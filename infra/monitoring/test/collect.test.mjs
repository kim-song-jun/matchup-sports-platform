import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectSample } from '../collect.mjs';
import { buildMetricData } from '../lib/metrics.mjs';
import * as fx from './fixtures.mjs';

const NOW = Date.parse('2026-11-20T01:51:00Z');
const inspectJson = (over = {}) => JSON.stringify([
  { Name: '/teameet_v1_web', Id: over.webId ?? 'WEB1', State: { StartedAt: over.webStarted ?? '2026-11-20T01:40:50Z', OOMKilled: over.oom ?? false } },
  { Name: '/teameet_v1_api', Id: 'API1', State: { StartedAt: '2026-11-20T01:40:49Z', OOMKilled: false } },
  { Name: '/teameet_v1_game_operations_worker', Id: 'WRK1', State: { StartedAt: '2026-11-20T01:40:49Z', OOMKilled: false } },
  { Name: '/teameet_nginx', Id: 'NGX1', State: { StartedAt: '2026-11-20T01:40:48Z', OOMKilled: false },
    Mounts: over.mounts ?? [
      { Destination: '/etc/nginx/conf.d/default.conf', Source: '/srv/release/nginx.conf' },
      { Destination: '/etc/letsencrypt', Source: '/srv/release/certbot/conf' },
    ] },
]);

function fakeExec(over = {}) {
  const calls = [];
  const exec = async (file, args) => {
    calls.push([file, ...args].join(' '));
    const key = args[0] === 'logs' ? `logs:${args.at(-1)}` : `${file} ${args[0]}`;
    const table = {
      'docker inspect': () => ({ stdout: over.inspect ?? inspectJson(over), stderr: '' }),
      'logs:teameet_v1_web': () => ({ stdout: '', stderr: over.webLogs ?? '' }),
      'logs:teameet_v1_api': () => ({ stdout: '', stderr: '' }),
      'logs:teameet_v1_game_operations_worker': () => ({ stdout: '', stderr: '' }),
      'logs:teameet_nginx': () => ({ stdout: over.nginx ?? [fx.NGINX_OK, fx.NGINX_502].join('\n'), stderr: '' }),
      'docker stats': () => ({ stdout: '70.5%\n', stderr: '' }),
      'df -P': () => ({ stdout: fx.DF, stderr: '' }),
      'openssl x509': () => ({ stdout: fx.OPENSSL, stderr: '' }),
    };
    if (over.fail?.includes(key)) throw new Error(`${key} exploded`);
    if (!table[key]) throw new Error(`unexpected command ${key}`);
    return table[key]();
  };
  return { exec, calls };
}
const run = (state, over, env = 'prod') =>
  collectSample({ exec: fakeExec(over).exec, readText: async () => fx.MEMINFO, nowMs: NOW, state, env });

test('first pass is a baseline: no restart is invented, every number is read', async () => {
  const { sample, nextState } = await run({});
  assert.deepEqual(sample.restarts, {});
  assert.equal(sample.deploys, 0);
  assert.deepEqual(sample.nginx, { requests: 2, errors5xx: 1, bots: 0, botsByName: {} });
  assert.equal(sample.webMemPct, 70.5);
  assert.equal(sample.memAvailableMB, 488);
  assert.equal(sample.diskUsedPct, 57);
  assert.equal(sample.originCertDays, 42);
  assert.deepEqual(sample.failed, []);
  assert.equal(nextState.containers.web.id, 'WEB1');
});

test('11-20 sequence: second pass sees the web restart plus the heap death in its log', async () => {
  const first = await run({});
  const second = await run(first.nextState, {
    inspect: inspectJson({ webStarted: '2026-11-20T01:53:36Z', oom: false }),
    webLogs: `${fx.GC_LINE}\n${fx.HEAP_FATAL_1}\n${fx.READY_LINE}`,
  });
  assert.deepEqual(second.sample.restarts, { web: 1 });
  assert.deepEqual(second.sample.heapOom, { web: 1, api: 0, worker: 0 });
  // the same log window next minute must not count the death again
  const third = await run(second.nextState, { inspect: inspectJson({ webStarted: '2026-11-20T01:53:36Z' }), webLogs: fx.HEAP_FATAL_1 });
  assert.deepEqual(third.sample.heapOom, { web: 0, api: 0, worker: 0 });
  assert.deepEqual(third.sample.restarts, {});
});

test('a cgroup OOM kill (no heap line) is still counted once, on the restart it caused', async () => {
  const first = await run({});
  const second = await run(first.nextState, { inspect: inspectJson({ webStarted: '2026-11-20T01:53:36Z', oom: true }) });
  assert.equal(second.sample.heapOom.web, 1);
});

test('a redeploy is a deploy + deploy window, never a restart', async () => {
  const first = await run({});
  const second = await run(first.nextState, { inspect: inspectJson({ webId: 'WEB2', webStarted: '2026-11-20T01:55:00Z' }) });
  assert.deepEqual(second.sample.restarts, {});
  assert.equal(second.sample.deploys, 1);
  assert.equal(second.sample.deployWindow, 1);
});

test('nginx lines are not recounted when the log window overlaps the previous one', async () => {
  const first = await run({});
  const second = await run(first.nextState, {});
  assert.equal(second.sample.nginx.requests, 0);
});

test('the origin certificate is read once per day, in prod only', async () => {
  const first = await run({});
  const again = await run(first.nextState);
  assert.equal(again.sample.originCertDays, undefined);
  const alpha = await run({}, {}, 'alpha');
  assert.equal(alpha.sample.originCertDays, undefined);
});

test('an optional step that fails is counted, keeps the heartbeat, and does not stop the other steps', async () => {
  const { sample } = await run({}, { fail: ['docker stats'] });
  assert.deepEqual(sample.failed, ['docker-stats']);
  assert.equal(sample.webMemPct, null);
  assert.equal(sample.diskUsedPct, 57);
  const data = buildMetricData('prod', sample);
  assert.ok(data.some((d) => d.MetricName === 'Heartbeat'), 'a failed optional read is not a stopped server');
  assert.equal(data.find((d) => d.MetricName === 'StepFailures').Value, 1);
  assert.ok(!data.some((d) => d.MetricName === 'WebMemPct'), 'no made-up zero for a failed read');
  assert.ok(data.some((d) => d.MetricName === 'DiskUsedPct'));
});

test('a step that feeds the restart / heap counters withholds the heartbeat when it fails', async () => {
  for (const fail of [['docker inspect'], ['logs:teameet_v1_web']]) {
    const { sample } = await run({}, { fail });
    const data = buildMetricData('prod', sample);
    assert.ok(!data.some((d) => d.MetricName === 'Heartbeat'), `${fail[0]}: collector cannot see containers, so it goes silent`);
    assert.ok(data.some((d) => d.MetricName === 'StepFailures' && d.Value >= 1));
  }
});

test('the origin certificate is read from the directory nginx has mounted, not from an assumed host path', async () => {
  const fake = fakeExec();
  const { sample } = await collectSample({ exec: fake.exec, readText: async () => fx.MEMINFO, nowMs: NOW, state: {}, env: 'prod' });
  assert.equal(sample.originCertDays, 42);
  assert.ok(fake.calls.includes('openssl x509 -enddate -noout -in /srv/release/certbot/conf/live/teameet.co.kr/fullchain.pem'));
});

test('--cert-path overrides the mount lookup', async () => {
  const fake = fakeExec();
  await collectSample({ exec: fake.exec, readText: async () => fx.MEMINFO, nowMs: NOW, state: {}, env: 'prod', certPath: '/x/fullchain.pem' });
  assert.ok(fake.calls.includes('openssl x509 -enddate -noout -in /x/fullchain.pem'));
});

test('no letsencrypt mount: the certificate step fails visibly, the heartbeat survives, the cert is retried next minute', async () => {
  const { sample, nextState } = await run({}, { mounts: [] });
  assert.deepEqual(sample.failed, ['origin-cert']);
  assert.equal(sample.originCertDays, undefined);
  assert.equal(nextState.certDay, undefined);
  const data = buildMetricData('prod', sample);
  assert.ok(data.some((d) => d.MetricName === 'Heartbeat'));
  assert.ok(!data.some((d) => d.MetricName === 'OriginCertDays'));
});

test('nginx logs are read from the end of the file with a line cap', async () => {
  const fake = fakeExec();
  await collectSample({ exec: fake.exec, readText: async () => fx.MEMINFO, nowMs: NOW, state: {}, env: 'prod' });
  assert.ok(fake.calls.includes('docker logs --since 60s --tail 20000 --timestamps teameet_nginx'));
});

test('a minute that fills the line cap is reported as truncated, not published as exact', async () => {
  const lines = Array.from({ length: 20_000 }, () => fx.NGINX_OK).join('\n');
  const { sample } = await run({}, { nginx: lines });
  assert.deepEqual(sample.failed, ['nginx-logs-truncated']);
  assert.ok(sample.nginx.requests > 0);
});

test('a failed nginx read neither publishes zeros nor advances the log position', async () => {
  const { sample, nextState } = await run({ nginxLast: 'KEEP' }, { fail: ['logs:teameet_nginx'] });
  assert.equal(sample.nginx, null);
  assert.equal(nextState.nginxLast, 'KEEP');
});

test('a clean pass publishes zero-valued counters and a heartbeat', async () => {
  const { sample } = await run({});
  const data = buildMetricData('prod', sample);
  const restarts = data.filter((d) => d.MetricName === 'Restarts');
  assert.deepEqual(restarts.map((d) => d.Dimensions[0].Value), ['web', 'api', 'worker', 'nginx']);
  assert.ok(restarts.every((d) => d.Value === 0));
  assert.equal(data.filter((d) => d.MetricName === 'HeapOom').length, 3);
  assert.ok(data.some((d) => d.MetricName === 'Heartbeat' && d.Value === 1));
  assert.ok(data.every((d) => d.Timestamp === '2026-11-20T01:51:00.000Z'));
});

test('alpha publishes only what its five alarms read', async () => {
  const { sample } = await run({}, {}, 'alpha');
  const names = new Set(buildMetricData('alpha', sample).map((d) => d.MetricName));
  assert.deepEqual([...names].sort(), ['CollectorSeconds', 'DiskUsedPct', 'HeapOom', 'Heartbeat', 'Restarts', 'StepFailures']);
});

test('bot names become a Bot dimension only when asked', async () => {
  const over = { nginx: [fx.NGINX_504, fx.NGINX_GPT_200].join('\n') };
  const { sample } = await run({}, over);
  assert.ok(!buildMetricData('prod', sample).some((d) => d.Dimensions?.[0]?.Name === 'Bot'));
  const named = buildMetricData('prod', sample, { botNames: true }).filter((d) => d.Dimensions?.[0]?.Name === 'Bot');
  assert.deepEqual(named.map((d) => [d.Dimensions[0].Value, d.Value]), [['GPTBot', 2]]);
});

test('published data carries no address, path, or user agent', async () => {
  const { sample } = await run({}, { nginx: [fx.NGINX_504, fx.NGINX_OK].join('\n') });
  const text = JSON.stringify(buildMetricData('prod', sample, { botNames: true }));
  assert.ok(!/203\.0\.113|\/tournaments|Mozilla|openai/.test(text));
});

test('collect.mjs rejects bad arguments before touching docker', () => {
  const script = fileURLToPath(new URL('../collect.mjs', import.meta.url));
  for (const args of [[], ['--env', 'staging'], ['--env', 'prod', '--output', 'xml'], ['--env', 'prod', '--nope']]) {
    const res = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { PATH: '' } });
    assert.equal(res.status, 1, args.join(' '));
    assert.match(res.stderr, /collector\]/);
  }
});

const SCRIPT = fileURLToPath(new URL('../install-collector.sh', import.meta.url));

test('install-collector.sh dry run writes nothing', () => {
  const root = mkdtempSync(join(tmpdir(), 'ops-install-'));
  const out = execFileSync('bash', [SCRIPT, '--env', 'prod', '--root', root], { encoding: 'utf8' });
  assert.match(out, /dry run/);
  assert.deepEqual(readdirSync(root), []);
});

test('install-collector.sh --apply --root installs the units and the files collect.mjs imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'ops-install-'));
  execFileSync('bash', [SCRIPT, '--env', 'alpha', '--apply', '--root', root], { encoding: 'utf8' });
  const lib = join(root, 'usr/local/lib/teameet-ops');
  for (const f of ['collect.mjs', 'lib/thresholds.mjs', 'lib/parse.mjs', 'lib/metrics.mjs']) assert.ok(existsSync(join(lib, f)), f);
  assert.equal(readFileSync(join(root, 'etc/teameet-ops/collector.env'), 'utf8'), 'TEAMEET_ENV=alpha\n');
  assert.ok(existsSync(join(root, 'etc/systemd/system/teameet-ops-metrics.timer')));
  // the installed copy must run on its own (imports resolve inside the install dir)
  const res = spawnSync(process.execPath, [join(lib, 'collect.mjs'), '--env', 'nope'], { encoding: 'utf8' });
  assert.match(res.stderr, /--env must be prod or alpha/);
  execFileSync('bash', [SCRIPT, '--env', 'alpha', '--apply', '--uninstall', '--root', root]);
  assert.ok(!existsSync(join(lib, 'collect.mjs')));
  assert.ok(!existsSync(join(root, 'etc/systemd/system/teameet-ops-metrics.timer')));
});

test('install-collector.sh requires an --env', () => {
  const res = spawnSync('bash', [SCRIPT], { encoding: 'utf8' });
  assert.equal(res.status, 2);
});

test('the service runs collect.mjs once under flock with the env file value', () => {
  const unit = readFileSync(fileURLToPath(new URL('../systemd/teameet-ops-metrics.service', import.meta.url)), 'utf8');
  assert.match(unit, /ExecStart=\/usr\/bin\/flock -n \/run\/teameet-ops-metrics\.lock .*collect\.mjs --env \$\{TEAMEET_ENV\} --output cloudwatch/);
  assert.match(unit, /Type=oneshot/);
  const timer = readFileSync(fileURLToPath(new URL('../systemd/teameet-ops-metrics.timer', import.meta.url)), 'utf8');
  assert.match(timer, /OnCalendar=\*:0\/1/);
});
