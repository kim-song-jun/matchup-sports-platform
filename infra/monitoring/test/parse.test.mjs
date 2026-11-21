import assert from 'node:assert/strict';
import test from 'node:test';
import {
  botKind, countNewHeapOom, diffContainers, linesAfter, parseCertDaysLeft, parseDfUsedPct, parseMemPerc,
  parseMeminfo, parseNginxLine, summarizeNginx,
} from '../lib/parse.mjs';
import * as fx from './fixtures.mjs';

test('nginx line: status and bot label only, no address or path in the result', () => {
  assert.deepEqual(parseNginxLine(fx.NGINX_OK), { status: 200, bot: null });
  assert.deepEqual(parseNginxLine(fx.NGINX_504), { status: 504, bot: 'GPTBot' });
  const parsed = parseNginxLine(fx.NGINX_502);
  assert.deepEqual(Object.keys(parsed).sort(), ['bot', 'status']);
});

test('nginx line: escaped quotes in the user agent do not break the parse', () => {
  assert.deepEqual(parseNginxLine(fx.NGINX_QUOTED_UA), { status: 200, bot: 'Bytespider' });
});

test('nginx error-log lines and junk are ignored, not counted as requests', () => {
  assert.equal(parseNginxLine(fx.NGINX_ERROR_LOG_LINE), null);
  assert.equal(parseNginxLine(''), null);
});

test('summarizeNginx counts requests, 5xx (500-599 only) and bots', () => {
  const s = summarizeNginx([fx.NGINX_OK, fx.NGINX_502, fx.NGINX_504, fx.NGINX_GPT_200, fx.NGINX_ERROR_LOG_LINE]);
  assert.deepEqual(s, { requests: 4, errors5xx: 2, bots: 2, botsByName: { GPTBot: 2 } });
  assert.equal(summarizeNginx([`${fx.NGINX_OK.replace(' 200 ', ' 499 ')}`]).errors5xx, 0);
  assert.equal(summarizeNginx([`${fx.NGINX_OK.replace(' 200 ', ' 599 ')}`]).errors5xx, 1);
});

test('botKind: named bots, other bots, and people', () => {
  assert.equal(botKind('Mozilla/5.0 (compatible; ClaudeBot/1.0)'), 'ClaudeBot');
  assert.equal(botKind('Mozilla/5.0 (compatible; Googlebot/2.1)'), 'Googlebot');
  assert.equal(botKind('meta-externalagent/1.1'), 'meta-externalagent');
  assert.equal(botKind('Mozilla/5.0 (compatible; Yeti/1.1)'), 'other');
  assert.equal(botKind('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1'), null);
});

test('heap OOM: only the FATAL line counts (GC / Ready lines do not)', () => {
  const r = countNewHeapOom([fx.GC_LINE, fx.HEAP_FATAL_1, fx.READY_LINE]);
  assert.equal(r.count, 1);
  assert.equal(r.lastCounted, '2026-11-20T01:50:47.803569805Z');
});

test('heap OOM: both real 11-20 wordings are counted', () => {
  assert.equal(countNewHeapOom([fx.HEAP_FATAL_1, fx.HEAP_FATAL_2]).count, 2);
});

test('heap OOM: an overlapping window does not count the same death twice', () => {
  const first = countNewHeapOom([fx.HEAP_FATAL_1]);
  const second = countNewHeapOom([fx.HEAP_FATAL_1, fx.HEAP_FATAL_2], first.lastCounted);
  assert.equal(second.count, 1);
  assert.equal(second.lastCounted, '2026-11-20T02:02:59.150362759Z');
  assert.equal(countNewHeapOom([fx.HEAP_FATAL_2], second.lastCounted).count, 0);
});

test('heap OOM: timestamps with trimmed fractional zeros still order correctly', () => {
  const a = '2026-11-20T01:50:47.8Z FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory';
  const b = '2026-11-20T01:50:47.803569805Z FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory';
  assert.equal(countNewHeapOom([b], '2026-11-20T01:50:47.8Z').count, 1);
  assert.equal(countNewHeapOom([a], '2026-11-20T01:50:47.803569805Z').count, 0);
});

test('linesAfter keeps only newer timestamped lines', () => {
  const r = linesAfter([fx.NGINX_OK, 'no timestamp here'], '2026-11-20T01:50:29.000000000Z');
  assert.equal(r.lines.length, 1);
  assert.equal(linesAfter([fx.NGINX_OK], '2026-11-20T01:50:30.123456789Z').lines.length, 0);
});

test('/proc/meminfo -> available MB and swap used MB (11-21 prod shape)', () => {
  assert.deepEqual(parseMeminfo(fx.MEMINFO), { memAvailableMB: 488, swapUsedMB: 449 });
  assert.throws(() => parseMeminfo('MemTotal: 1 kB\n'), /MemAvailable/);
});

test('df -P / -> used percent', () => {
  assert.equal(parseDfUsedPct(fx.DF), 57);
  assert.throws(() => parseDfUsedPct('garbage'), /unexpected df/);
});

test('docker stats MemPerc', () => {
  assert.equal(parseMemPerc('67.12%\n'), 67.12);
  assert.throws(() => parseMemPerc('--'), /unexpected MemPerc/);
});

test('openssl enddate -> whole days left', () => {
  const now = Date.parse('2026-11-21T00:00:00Z');
  assert.equal(parseCertDaysLeft(fx.OPENSSL, now), 41);
  assert.throws(() => parseCertDaysLeft('nope', now), /unexpected openssl/);
});

const c = (name, id, startedAt, oomKilled = false) => ({ name, id, startedAt, oomKilled });

test('restart = same container id, new StartedAt; redeploy = new id', () => {
  const t0 = Date.parse('2026-11-20T01:50:00Z');
  const base = diffContainers({}, [c('web', 'A', 's1'), c('api', 'B', 's1')], t0);
  assert.deepEqual(base.restarts, {});
  assert.equal(base.deploys, 0);

  const restarted = diffContainers({ containers: base.containers }, [c('web', 'A', 's2', true), c('api', 'B', 's1')], t0 + 60_000);
  assert.deepEqual(restarted.restarts, { web: 1 });
  assert.equal(restarted.oomKilledRestarts, 1);
  assert.equal(restarted.deploys, 0);

  const redeployed = diffContainers({ containers: base.containers }, [c('web', 'Z', 's9'), c('api', 'B', 's1')], t0 + 60_000);
  assert.deepEqual(redeployed.restarts, {});
  assert.equal(redeployed.deploys, 1);
});

test('a redeploy opens a 3 minute deploy window that then closes', () => {
  const t0 = Date.parse('2026-11-20T01:50:00Z');
  const base = diffContainers({}, [c('web', 'A', 's1')], t0);
  const deployed = diffContainers({ containers: base.containers }, [c('web', 'Z', 's2')], t0 + 60_000);
  assert.equal(deployed.deployWindow, 1);
  const during = diffContainers({ containers: deployed.containers, deployUntilMs: deployed.deployUntilMs }, [c('web', 'Z', 's2')], t0 + 60_000 + 120_000);
  assert.equal(during.deployWindow, 1);
  const after = diffContainers({ containers: deployed.containers, deployUntilMs: deployed.deployUntilMs }, [c('web', 'Z', 's2')], t0 + 60_000 + 181_000);
  assert.equal(after.deployWindow, 0);
});
