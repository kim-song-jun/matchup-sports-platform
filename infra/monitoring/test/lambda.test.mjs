import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ZIP_FILES } from '../install.mjs';
import { RECOVERY_QUIET_MS } from '../lib/dedupe.mjs';
import { buildInstallPlan, DEFAULTS } from '../lib/plan.mjs';
import { evaluateRule, LAMBDA_TIMEOUT_S, RULES } from '../lib/thresholds.mjs';
import { handler, loadAlarmTransitions, loadGroupHistory, messageForSnsRecord, postToSlack } from '../lambda-handler.mjs';
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
    sleep: async () => {},
    loadGroupTransitions: async () => [],
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
  await handler({ Records: [sns(alarm({ AlarmName: 'teameet-prod-disk-high', NewStateValue: 'OK', StateChangeTime: '2026-11-20T02:02:47.000+0000' }))] }, d);
  assert.match(d.posted[0].text, /\(12분\)/);
});

test('an event alarm (restart, heap death) never posts a recovery', async () => {
  for (const name of ['teameet-prod-web-restart', 'teameet-prod-heap-oom']) {
    const d = deps({ lookupAlarmedAt: async () => { throw new Error('must not look up history for a skipped recovery'); } });
    assert.deepEqual(await handler({ Records: [sns(alarm({ AlarmName: name, NewStateValue: 'OK' }))] }, d), { posted: 0 });
  }
  const d = deps();
  await handler({ Records: [sns(alarm({ AlarmName: 'teameet-prod-disk-high', NewStateValue: 'OK', StateChangeTime: '2026-11-20T02:02:47.000+0000' }))] }, d);
  assert.equal(d.posted.length, 1, 'a state alarm still reports its recovery');
});

test('the restart-loop alarm posts its start and its recovery with the duration, unlike the event alarms', async () => {
  const d = deps();
  await handler({ Records: [sns(alarm({ AlarmName: 'teameet-prod-restart-loop' }))] }, d);
  assert.equal(d.posted.length, 1);
  assert.match(d.posted[0].text, /^\[긴급\]\[운영\] 컨테이너가 계속 다시 시작되고 있어요/);
  assert.ok(!d.posted[0].text.includes('회복 알림은 보내지 않아요'));
  assert.ok(d.posted[0].text.includes(`#${encodeURIComponent('재시작-루프')}`));
  const r = deps({ lookupAlarmedAt: async () => '2026-11-20T01:50:47.000+0000' });
  await handler({ Records: [sns(alarm({ AlarmName: 'teameet-prod-restart-loop', NewStateValue: 'OK', StateChangeTime: '2026-11-20T02:05:47.000+0000' }))] }, r);
  assert.equal(r.posted.length, 1);
  assert.match(r.posted[0].text, /^\[회복\]\[운영\].*\(15분\)/s);
});

// Replays restarts through the real restart-loop rule, then feeds every ALARM/OK transition CloudWatch would have
// sent to the handler. Each invocation sees the history as of its own (virtual) clock, which `sleep` moves forward.
// `bursts`: [startMin, lengthMin, periodS][]: a restart every periodS seconds for lengthMin minutes from startMin.
async function replayRestarts({ bursts, minutes }) {
  const rule = RULES.find((r) => r.id === 'restart-loop');
  const perMinute = Array(minutes).fill(0);
  for (const [startMin, lengthMin, periodS] of bursts) {
    for (let t = 0; t < lengthMin * 60; t += periodS) perMinute[startMin + Math.floor(t / 60)] += 1;
  }
  const start = Date.parse('2026-11-20T00:00:00Z');
  const flips = [];
  let state = 'OK';
  for (let i = 0; i < minutes; i += 1) {
    const next = evaluateRule(rule, perMinute.slice(0, i + 1));
    if (next !== state && (next === 'ALARM' || next === 'OK')) { flips.push({ to: next, atMs: start + i * 60_000 }); state = next; }
  }
  const history = flips.map((f) => ({ name: 'teameet-prod-restart-loop', atMs: f.atMs, ...(f.to === 'OK' ? { to: 'OK' } : {}) }));
  const posts = [];
  for (const flip of flips) {
    let nowMs = flip.atMs;
    const d = deps({
      sleep: async (ms) => { nowMs += ms; },
      loadGroupTransitions: async () => history.filter((t) => t.atMs <= nowMs),
      lookupAlarmedAt: async () => undefined,
    });
    const stamp = new Date(flip.atMs).toISOString().replace('Z', '+0000');
    await handler({ Records: [sns(alarm({ AlarmName: 'teameet-prod-restart-loop', NewStateValue: flip.to, StateChangeTime: stamp }))] }, d);
    posts.push(...d.posted.map((p) => ({ to: flip.to, text: p.text })));
  }
  return { flips, posts };
}

const replayRestartLoop = ({ periodS, loopMin, quietMin }) =>
  replayRestarts({ bursts: [[0, loopMin, periodS]], minutes: loopMin + quietMin });

test('a 240-second restart loop for 2 hours: ALARM only at the 1st, 3rd, 6th, 12th and 24th, one recovery when it ends', async () => {
  const { flips, posts } = await replayRestartLoop({ periodS: 240, loopMin: 120, quietMin: 30 });
  assert.ok(flips.filter((f) => f.to === 'ALARM').length >= 25, 'the rule really flaps here: that is what this test pins');
  const alarms = posts.filter((p) => p.to === 'ALARM');
  assert.deepEqual(alarms.map((p) => p.text.match(/(\d+)번째/)?.[1] ?? 'first'), ['first', '3', '6', '12', '24']);
  const recoveries = posts.filter((p) => p.to === 'OK');
  assert.equal(recoveries.length, 1);
  assert.match(recoveries[0].text, /^\[회복\]\[운영\] 컨테이너가 계속 다시 시작되고 있어요/);
  assert.match(recoveries[0].text, /\((1\d\d)분\)/, 'the recovery reports the length of the whole loop, not of its last flap');
});

// Every [회복] must follow a [긴급] that reached Slack since the previous [회복].
const assertPaired = (posts) => {
  let open = false;
  for (const p of posts) {
    if (p.to === 'ALARM') open = true;
    else {
      assert.ok(open, `a [회복] was posted with no [긴급] before it: ${posts.map((q) => (q.to === 'OK' ? 'R' : 'A')).join('')}`);
      open = false;
    }
  }
  assert.ok(!open, 'the last [긴급] was never recovered');
};

test('a 285-second loop that flaps for 3 hours posts recoveries only as the pair of a [긴급]', async () => {
  const { posts, flips } = await replayRestartLoop({ periodS: 285, loopMin: 180, quietMin: 40 });
  assert.ok(flips.some((f, i) => f.to === 'OK' && flips[i + 1]?.to === 'ALARM' && flips[i + 1].atMs - f.atMs > RECOVERY_QUIET_MS),
    'the rule pauses longer than the quiet period here: that is the case this test pins');
  assertPaired(posts);
});

test('six 6-minute bursts 20 minutes apart: each recovery follows its own [긴급]', async () => {
  const bursts = [0, 1, 2, 3, 4, 5].map((i) => [i * 26, 6, 120]);
  const { posts } = await replayRestarts({ bursts, minutes: 6 * 26 + 30 });
  assert.equal(posts.filter((p) => p.to === 'OK').length, posts.filter((p) => p.to === 'ALARM').length);
  assertPaired(posts);
});

test('a loop that simply stops: one ALARM, then one recovery', async () => {
  const { posts } = await replayRestartLoop({ periodS: 120, loopMin: 30, quietMin: 30 });
  assert.deepEqual(posts.map((p) => p.to), ['ALARM', 'OK']);
});

test('the recovery waits RECOVERY_QUIET_MS before it reads the history, and the Lambda outlives that wait', async () => {
  const waits = [];
  const d = deps({ sleep: async (ms) => { waits.push(ms); } });
  await handler({ Records: [sns(alarm({ AlarmName: 'teameet-prod-restart-loop', NewStateValue: 'OK' }))] }, d);
  assert.deepEqual(waits, [RECOVERY_QUIET_MS]);
  const lambdaStep = buildInstallPlan({ ...DEFAULTS, rdsId: 'rds-main', prodInstanceId: 'i-prod' }).find((s) => s.id === 'lambda');
  const timeout = Number(lambdaStep.args[lambdaStep.args.indexOf('--timeout') + 1]);
  assert.equal(timeout, LAMBDA_TIMEOUT_S);
  assert.ok(timeout * 1000 > RECOVERY_QUIET_MS + 60_000, 'the timeout must leave room for the history reads after the wait');
});

test('when the history cannot be read for a recovery, it is posted anyway', async () => {
  const d = deps({ loadGroupTransitions: async () => { throw new Error('throttled'); } });
  await handler({ Records: [sns(alarm({ AlarmName: 'teameet-prod-restart-loop', NewStateValue: 'OK' }))] }, d);
  assert.equal(d.posted.length, 1);
  assert.match(d.posted[0].text, /^\[회복\]/);
});

const HEAP_ALARM_TIME = Date.parse('2026-11-20T01:50:47.803Z');
test('one OOM death: the two alarms and their two recoveries become one Slack message', async () => {
  const transitions = [
    { name: 'teameet-prod-web-restart', atMs: HEAP_ALARM_TIME }, { name: 'teameet-prod-heap-oom', atMs: HEAP_ALARM_TIME + 1_500 },
  ];
  const d = deps({ loadGroupTransitions: async () => transitions });
  const events = [
    alarm({ AlarmName: 'teameet-prod-web-restart' }),
    alarm({ AlarmName: 'teameet-prod-heap-oom', StateChangeTime: '2026-11-20T01:50:49.303+0000' }),
    alarm({ AlarmName: 'teameet-prod-web-restart', NewStateValue: 'OK', StateChangeTime: '2026-11-20T01:51:47.000+0000' }),
    alarm({ AlarmName: 'teameet-prod-heap-oom', NewStateValue: 'OK', StateChangeTime: '2026-11-20T01:51:48.000+0000' }),
  ];
  for (const e of events) await handler({ Records: [sns(e)] }, d);
  assert.equal(d.posted.length, 1);
  assert.match(d.posted[0].text, /^\[긴급\]\[운영\] 컨테이너가 다시 시작됐어요/);
  assert.match(d.posted[0].text, /• 같이 울린 경보: heap 부족으로 프로세스가 죽었어요/);
});

test('a sibling alarm waits before reading history, so both alarms of one incident are visible', async () => {
  const order = [];
  const d = deps({
    sleep: async (ms) => { order.push(`sleep:${ms}`); },
    loadGroupTransitions: async () => { order.push('history'); return []; },
  });
  await handler({ Records: [sns(alarm())] }, d);
  assert.deepEqual(order, ['sleep:8000', 'history']);
});

test('the 2nd restart within 30 minutes stays quiet, the 3rd says it is repeating', async () => {
  const min = 60_000;
  const base = HEAP_ALARM_TIME;
  const history = [0, 4, 8].map((m) => ({ name: 'teameet-prod-web-restart', atMs: base + m * min }));
  const stamp = (m) => new Date(base + m * min).toISOString().replace('Z', '+0000');
  const d = deps({ loadGroupTransitions: async () => history });
  await handler({ Records: [sns(alarm({ StateChangeTime: stamp(4) }))] }, d);
  assert.equal(d.posted.length, 0);
  await handler({ Records: [sns(alarm({ StateChangeTime: stamp(8) }))] }, d);
  assert.equal(d.posted.length, 1);
  assert.match(d.posted[0].text, /• 되풀이되고 있어요 — 8분 동안 3번째예요/);
});

test('a crash loop restarting every 2 minutes still reaches Slack at the 3rd, 6th and 12th restart', async () => {
  const min = 60_000;
  const history = [];
  const posts = [];
  for (let m = 0; m <= 24; m += 2) {
    history.push({ name: 'teameet-prod-web-restart', atMs: HEAP_ALARM_TIME + m * min });
    const d = deps({ loadGroupTransitions: async () => history });
    const stamp = new Date(HEAP_ALARM_TIME + m * min).toISOString().replace('Z', '+0000');
    await handler({ Records: [sns(alarm({ StateChangeTime: stamp }))] }, d);
    if (d.posted.length) posts.push([m, d.posted[0].text.match(/(\d+)분 동안 (\d+)번째/)?.slice(1).join('/') ?? 'first']);
  }
  assert.deepEqual(posts, [[0, 'first'], [4, '4/3'], [10, '10/6'], [22, '22/12']]);
});

test('alarm history is read page by page and only the ALARM transitions are kept', async () => {
  const item = (summary, iso) => ({ HistorySummary: summary, Timestamp: new Date(iso) });
  const pages = [
    { AlarmHistoryItems: [item('Alarm updated from OK to ALARM', '2026-11-20T01:50:47Z'), item('Alarm updated from ALARM to OK', '2026-11-20T01:51:47Z')], NextToken: 't1' },
    { AlarmHistoryItems: [item('Alarm updated from OK to ALARM', '2026-11-20T01:48:47Z')] },
  ];
  const seen = [];
  const send = async (input) => { seen.push(input.NextToken); return pages[seen.length - 1]; };
  const found = await loadAlarmTransitions(send, 'teameet-prod-web-restart', new Date('2026-11-20T00:00:00Z'));
  assert.deepEqual(seen, [undefined, 't1']);
  assert.deepEqual(found.map((f) => f.atMs), [Date.parse('2026-11-20T01:50:47Z'), Date.parse('2026-11-20T01:48:47Z')]);
});

test('OK transitions are kept (marked) only when asked for, for state alarms', async () => {
  const item = (summary, iso) => ({ HistorySummary: summary, Timestamp: new Date(iso) });
  const send = async () => ({ AlarmHistoryItems: [item('Alarm updated from ALARM to OK', '2026-11-20T01:51:47Z'), item('Alarm updated from OK to ALARM', '2026-11-20T01:50:47Z')] });
  const start = new Date('2026-11-20T00:00:00Z');
  assert.equal((await loadAlarmTransitions(send, 'a', start)).length, 1);
  const withOk = await loadAlarmTransitions(send, 'a', start, { withOk: true });
  assert.deepEqual(withOk.map((t) => t.to ?? 'ALARM'), ['OK', 'ALARM']);
});

test('a group history keeps the OK transitions of state alarms only, never those of event alarms', async () => {
  const item = (summary, iso) => ({ HistorySummary: summary, Timestamp: new Date(iso) });
  const send = async () => ({ AlarmHistoryItems: [item('Alarm updated from ALARM to OK', '2026-11-20T01:51:47Z'), item('Alarm updated from OK to ALARM', '2026-11-20T01:50:47Z')] });
  const names = ['teameet-prod-web-restart', 'teameet-prod-restart-loop'];
  const found = await loadGroupHistory(send, names, new Date('2026-11-20T00:00:00Z'));
  assert.deepEqual(found.map((t) => `${t.name.split('-').slice(2).join('-')}:${t.to ?? 'ALARM'}`),
    ['web-restart:ALARM', 'restart-loop:OK', 'restart-loop:ALARM']);
});

test('paging stops at the cap even when CloudWatch keeps returning a token', async () => {
  let calls = 0;
  const send = async () => { calls += 1; return { AlarmHistoryItems: [], NextToken: 'more' }; };
  await loadAlarmTransitions(send, 'x', new Date());
  assert.equal(calls, 5);
});

test('when the alarm history cannot be read, the alarm is posted as it is', async () => {
  const d = deps({ loadGroupTransitions: async () => { throw new Error('throttled'); } });
  const result = await handler({ Records: [sns(alarm())] }, d);
  assert.equal(result.posted, 1);
  assert.match(d.posted[0].text, /^\[긴급\]\[운영\] 컨테이너가 다시 시작됐어요/);
});

test('an alarm outside any group never reads history or waits', async () => {
  const d = deps({
    sleep: async () => { throw new Error('no wait expected'); },
    loadGroupTransitions: async () => { throw new Error('no history expected'); },
  });
  await handler({ Records: [sns(alarm({ AlarmName: 'teameet-prod-disk-high' }))] }, d);
  assert.equal(d.posted.length, 1);
});

test('INSUFFICIENT_DATA posts nothing', async () => {
  const d = deps();
  assert.deepEqual(await handler({ Records: [sns(alarm({ NewStateValue: 'INSUFFICIENT_DATA' }))] }, d), { posted: 0 });
  assert.equal(d.posted.length, 0);
});

test('a plain-text SNS message (maintenance script) is forwarded scrubbed', async () => {
  const text = await messageForSnsRecord(
    sns('maintenance from 203.0.113.9 by account 123456789012', 'Window'), deps());
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
