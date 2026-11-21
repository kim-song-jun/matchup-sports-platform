import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ZIP_FILES } from '../install.mjs';
import { handler, messageForSnsRecord, postToSlack } from '../lambda-handler.mjs';
import {
  buildSummary, kstDayWindow, reduceSeries, summarizeCost, summaryQueries, SUMMARY_METRICS, yesterdayKst,
} from '../lib/summary.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WEBHOOK = 'https://hooks.slack.com/services/T000/B000/XXXXXXXX';
const sns = (message, subject) => ({
  Sns: { Message: typeof message === 'string' ? message : JSON.stringify(message), Subject: subject },
});
const alarm = (over = {}) => ({
  AlarmName: 'teameet-prod-web-restart', NewStateValue: 'ALARM', StateChangeTime: '2026-11-20T01:50:47.803+0000',
  NewStateReason: 'Threshold Crossed', AlarmArn: 'arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:x', ...over,
});

const deps = (over = {}) => {
  const posted = [];
  return {
    posted,
    getWebhook: async () => WEBHOOK,
    post: async (url, text) => { posted.push({ url, text }); },
    lookupAlarmedAt: async () => '2026-11-20T01:50:47.000Z',
    loadSummary: async (env, date) => ({ env, date, requests: 10 }),
    ...over,
  };
};

test('the Lambda zip contains every local file the handler (transitively) imports', () => {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/from '(\.[^']+)'/g)) visit(relative(ROOT, join(dirname(join(ROOT, file)), m[1])));
  };
  visit('lambda-handler.mjs');
  assert.deepEqual([...seen].sort(), [...ZIP_FILES].sort());
});

test('an SNS alarm becomes one Slack post to the webhook from SSM', async () => {
  const d = deps();
  const result = await handler({ Records: [sns(alarm())] }, d);
  assert.equal(result.posted, 1);
  assert.equal(d.posted[0].url, WEBHOOK);
  assert.match(d.posted[0].text, /^\[긴급\]\[운영\] 컨테이너가 다시 시작됐어요/);
});

test('a recovery asks for the alarm start so it can show how long it lasted', async () => {
  const d = deps();
  await handler({ Records: [sns(alarm({ NewStateValue: 'OK', StateChangeTime: '2026-11-20T02:02:47.000+0000' }))] }, d);
  assert.match(d.posted[0].text, /\(12분\)/);
});

test('INSUFFICIENT_DATA posts nothing', async () => {
  const d = deps();
  assert.deepEqual(await handler({ Records: [sns(alarm({ NewStateValue: 'INSUFFICIENT_DATA' }))] }, d), { posted: 0 });
  assert.equal(d.posted.length, 0);
});

test('a plain-text SNS message (maintenance script) is forwarded scrubbed', async () => {
  const text = await messageForSnsRecord(
    sns('maintenance from 203.0.113.9 by account 123456789012', 'Window'), async () => undefined);
  assert.equal(text, '[공지][운영] Window\nmaintenance from [IP] by account');
});

test('the scheduler tick posts the daily summary', async () => {
  const d = deps();
  await handler({ mode: 'daily-summary' }, d);
  assert.match(d.posted[0].text, /^\[하루 요약\]\[운영\] \d\d-\d\d\(.\)\n• 요청 10건/);
});

test('an unknown event shape fails loudly instead of posting nothing', async () => {
  await assert.rejects(handler({ hello: 1 }, deps()), /unsupported event shape/);
});

test('one failed post does not drop the others, and the failure still surfaces', async () => {
  const attempted = [];
  const d = deps({
    post: async (url, text) => { attempted.push(text); if (text.includes('컨테이너')) throw new Error('Slack down'); },
  });
  await assert.rejects(
    handler({ Records: [sns(alarm()), sns(alarm({ AlarmName: 'teameet-prod-heap-oom' }))] }, d), /Slack down/);
  assert.equal(attempted.length, 2);
});

test('postToSlack refuses anything that is not an Incoming Webhook URL, and never calls out', async () => {
  let called = false;
  const fetchFn = async () => { called = true; return { ok: true, status: 200, text: async () => 'ok' }; };
  await assert.rejects(postToSlack('https://evil.example/services/T/B/X', 'hi', fetchFn), /not a Slack Incoming Webhook/);
  await assert.rejects(postToSlack('http://hooks.slack.com/services/T/B/X', 'hi', fetchFn), /not a Slack/);
  assert.equal(called, false);
});

test('postToSlack: anything but a literal "ok" is a failure (a 200 HTML page is not delivery)', async () => {
  const reply = (status, body) => async () => ({ ok: status < 400, status, text: async () => body });
  await postToSlack(WEBHOOK, 'hi', reply(200, 'ok'));
  await assert.rejects(postToSlack(WEBHOOK, 'hi', reply(200, '<html>login</html>')), /Slack webhook failed/);
  await assert.rejects(postToSlack(WEBHOOK, 'hi', reply(404, 'no_service')), /404/);
});

test('postToSlack sends {text} as JSON', async () => {
  let captured;
  await postToSlack(WEBHOOK, 'hello', async (url, init) => {
    captured = { url, init };
    return { ok: true, status: 200, text: async () => 'ok' };
  });
  assert.equal(captured.url, WEBHOOK);
  assert.deepEqual(JSON.parse(captured.init.body), { text: 'hello' });
});

// ---- summary ----

test('KST day windows: 11-20 KST is 11-19 15:00Z to 11-20 15:00Z', () => {
  const { startMs, endMs } = kstDayWindow('2026-11-20');
  assert.equal(new Date(startMs).toISOString(), '2026-11-19T15:00:00.000Z');
  assert.equal(endMs - startMs, 86_400_000);
  assert.equal(yesterdayKst(Date.parse('2026-11-21T00:00:00Z')), '2026-11-20'); // 09:00 KST on 11-21
});

test('reduceSeries ignores gaps and returns null when there is nothing', () => {
  assert.equal(reduceSeries([1, null, 3], 'sum'), 4);
  assert.equal(reduceSeries([], 'max'), null);
  assert.equal(reduceSeries([5, 2], 'min'), 2);
});

const hour = (iso) => Date.parse(iso);
const seriesFor = (map) => SUMMARY_METRICS.map((m) => map[m.key] ?? { timestamps: [], values: [] });

test('buildSummary: sums the KST day only, averages the 7 days before it, keeps restarts per container', () => {
  const inDay = [hour('2026-11-19T15:00:00Z'), hour('2026-11-20T00:00:00Z'), hour('2026-11-20T14:00:00Z')];
  const nextDay = [hour('2026-11-20T15:00:00Z')];
  const prior = [hour('2026-11-15T00:00:00Z'), hour('2026-11-16T00:00:00Z')];
  const s = buildSummary({
    env: 'prod', dateKst: '2026-11-20',
    series: seriesFor({
      requests: { timestamps: [...prior, ...inDay, ...nextDay], values: [700, 700, 100, 200, 300, 999] },
      'restarts:web': { timestamps: inDay, values: [2, 0, 3] },
      'heapOom:web': { timestamps: inDay, values: [1, 0, 4] },
      memAvailableMinMB: { timestamps: inDay, values: [400, 277, 350] },
    }),
    rds: { freeMemMinBytes: 51 * 1024 ** 2, freeStorageMinBytes: 16.9 * 1024 ** 3 },
    alarms: { fired: 7, open: 0 },
  });
  assert.equal(s.requests, 600);
  assert.equal(s.requestsAvg7d, 200);
  assert.equal(s.restarts.web, 5);
  assert.equal(s.restarts.api, 0);
  assert.equal(s.heapOom, 5);
  assert.equal(s.memAvailableMinMB, 277);
  assert.equal(s.rdsFreeMemMinMB, 51);
  assert.equal(s.alarmsFired, 7);
});

test('buildSummary: no datapoints at all means null (unknown), never 0', () => {
  const s = buildSummary({ env: 'prod', dateKst: '2026-11-20', series: seriesFor({}) });
  assert.equal(s.requests, null);
  assert.equal(s.restarts, null);
  assert.equal(s.heapOom, null);
  assert.equal(s.alarmsFired, null);
  assert.equal(s.rdsFreeMemMinMB, null);
});

test('summaryQueries asks for hourly buckets in the right namespace with unique ids', () => {
  const q = summaryQueries('prod');
  assert.equal(new Set(q.map((x) => x.Id)).size, SUMMARY_METRICS.length);
  assert.ok(q.every((x) => x.MetricStat.Period === 3600 && x.MetricStat.Metric.Namespace === 'Teameet/Ops/Prod'));
  const nginxRestarts = q.find((x) => x.MetricStat.Metric.MetricName === 'Restarts'
    && x.MetricStat.Metric.Dimensions[0].Value === 'nginx');
  assert.equal(nginxRestarts.MetricStat.Stat, 'Sum');
});

test('cost: last confirmed day is two days back; month to date stops there; last month is a full sum', () => {
  const rows = [
    { date: '2026-10-30', usd: 5 }, { date: '2026-10-31', usd: 5 },
    { date: '2026-11-17', usd: 4 }, { date: '2026-11-18', usd: 4.5 }, { date: '2026-11-19', usd: 4.71 },
    { date: '2026-11-20', usd: 1 },
  ];
  const c = summarizeCost(rows, '2026-11-21', 50);
  assert.equal(c.confirmedDate, '11-19');
  assert.equal(c.confirmedDay, 4.71);
  assert.equal(c.monthToDate, 4 + 4.5 + 4.71);
  assert.equal(c.forecast, 4 + 4.5 + 4.71 + 50);
  assert.equal(c.lastMonth, 10);
  assert.equal(summarizeCost(rows, '2026-11-25'), null);
});
