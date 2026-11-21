import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  alarmName, describeAlarm, evaluateRule, groupAlarmNames, HEALTH_CHECKS, RULES, rulesFor, SPIKE_5XX_EXPRESSION,
  SPIKE_5XX_MIN_COUNT, SPIKE_5XX_MIN_RATIO, spike5xxValue,
} from '../lib/thresholds.mjs';

const rule = (id) => RULES.find((r) => r.id === id);

test('every rule is well formed and ids are unique', () => {
  const ids = new Set();
  for (const r of RULES) {
    assert.ok(!ids.has(r.id), `duplicate rule id ${r.id}`);
    ids.add(r.id);
    assert.ok(r.datapointsToAlarm >= 1 && r.datapointsToAlarm <= r.evaluationPeriods, r.id);
    assert.ok(['critical', 'warning'].includes(r.severity), r.id);
    assert.ok(['breaching', 'notBreaching', 'ignore'].includes(r.missing), r.id);
    assert.ok(alarmName('prod', r.id).length <= 255);
  }
});

test('alpha pages on exactly six things and never as critical', () => {
  const alpha = rulesFor('alpha');
  assert.deepEqual(alpha.map((r) => r.id).sort(), ['collector-silent', 'collector-step-failed', 'disk-high', 'heap-oom', 'restart-loop', 'web-restart']);
  assert.ok(alpha.every((r) => r.severity === 'warning'));
  assert.ok(rulesFor('prod').some((r) => r.severity === 'critical'));
});

test('a restart or heap death alarms on the first minute', () => {
  const restart = rule('web-restart');
  assert.equal(evaluateRule(restart, [0, 0, 1]), 'ALARM');
  assert.equal(evaluateRule(restart, [0, 0, 0]), 'OK');
  assert.equal(evaluateRule(rule('heap-oom'), [1]), 'ALARM');
});

test('5xx spike: 11-20 windows alarm, the 11-15 one-off and quiet nights do not', () => {
  const windows = {
    // [5xx, requests] per 5 minutes, from the 11-20 nginx analysis
    '01:55': [463, 1395], '02:00': [155, 1054], '02:05': [51, 1165], '02:10': [3, 1002],
    '11-15 00:20': [52, 1500], '03:15': [2, 756],
  };
  const v = (k) => spike5xxValue({ errors: windows[k][0], requests: windows[k][1] });
  assert.equal(evaluateRule(rule('5xx-spike'), [v('01:55'), v('02:00')]), 'ALARM');
  assert.equal(evaluateRule(rule('5xx-spike'), [v('02:00'), v('02:05')]), 'ALARM');
  assert.equal(evaluateRule(rule('5xx-spike'), [v('02:10'), v('03:15')]), 'OK');
  // one bad window followed by a good one must not page
  assert.equal(evaluateRule(rule('5xx-spike'), [v('11-15 00:20'), v('03:15')]), 'OK');
});

test('5xx spike needs both the count and the ratio, and ignores deploy windows', () => {
  assert.equal(spike5xxValue({ errors: SPIKE_5XX_MIN_COUNT, requests: 500 }), 1);
  assert.equal(spike5xxValue({ errors: SPIKE_5XX_MIN_COUNT - 1, requests: 100 }), 0);
  // plenty of errors but under 2% of a busy window
  assert.equal(spike5xxValue({ errors: 15, requests: 1000 }), 0);
  assert.equal(spike5xxValue({ errors: 40, requests: 2000 }), 1);
  assert.equal(spike5xxValue({ errors: 40, requests: 2000, deployWindow: 1 }), 0);
});

test('the metric-math expression carries the same numbers as spike5xxValue', () => {
  assert.ok(SPIKE_5XX_EXPRESSION.includes(`>=${SPIKE_5XX_MIN_COUNT} `));
  assert.ok(SPIKE_5XX_EXPRESSION.includes(`>=${SPIKE_5XX_MIN_RATIO}*`));
  assert.ok(SPIKE_5XX_EXPRESSION.includes('FILL(m3,0)<1'));
});

test('server memory: 5 low minutes warn, 4 do not; 3 very low minutes are critical', () => {
  assert.equal(evaluateRule(rule('mem-available-low'), [199, 150, 180, 190, 170]), 'ALARM');
  assert.equal(evaluateRule(rule('mem-available-low'), [199, 150, 180, 190, 250]), 'OK');
  assert.equal(evaluateRule(rule('mem-available-low'), [277, 312, 330, 300, 288]), 'OK');
  assert.equal(evaluateRule(rule('mem-available-critical'), [90, 80, 99]), 'ALARM');
  assert.equal(evaluateRule(rule('mem-available-critical'), [90, 100, 99]), 'OK');
});

test('missing data: a silent collector alarms, a quiet counter does not', () => {
  const silent = rule('collector-silent');
  assert.equal(evaluateRule(silent, [1, 1, null, null, null, null, null]), 'ALARM');
  assert.equal(evaluateRule(silent, [1, 1, 1, null, 1]), 'OK');
  assert.equal(evaluateRule(rule('web-restart'), [null]), 'OK');
  assert.equal(evaluateRule(silent, [null, null]), 'INSUFFICIENT_DATA');
});

test('prod steady state from the 7-day measurement stays quiet', () => {
  assert.equal(evaluateRule(rule('web-memory-high'), Array(10).fill(70)), 'OK');
  assert.equal(evaluateRule(rule('web-memory-high'), Array(10).fill(99)), 'ALARM');
  assert.equal(evaluateRule(rule('swap-high'), Array(10).fill(449)), 'OK');
  assert.equal(evaluateRule(rule('disk-high'), [57, 57]), 'OK');
  assert.equal(evaluateRule(rule('disk-high'), [81, 82]), 'ALARM');
  assert.equal(evaluateRule(rule('rds-memory-low'), [51 * 1024 * 1024, 73 * 1024 * 1024, 60 * 1024 * 1024]), 'OK');
  assert.equal(evaluateRule(rule('rds-connections-high'), [8, 8]), 'OK');
  assert.equal(evaluateRule(rule('ec2-cpu-high'), [77.6, 45, 18]), 'OK');
});

test('describeAlarm resolves the stack alarms and nothing else', () => {
  assert.equal(describeAlarm('teameet-prod-heap-oom').severity, 'critical');
  assert.equal(describeAlarm('teameet-alpha-heap-oom').severity, 'warning');
  assert.equal(describeAlarm('teameet-prod-backup-missing'), null, 'mail-only alarms never reach the Lambda');
  assert.equal(describeAlarm('teameet-prod-health-web').severity, 'critical');
  assert.equal(describeAlarm('something-else'), null);
});

test('every runbook anchor used in Slack links exists as a heading in docs/ops/ops-alerts.md', () => {
  const md = readFileSync(fileURLToPath(new URL('../../../docs/ops/ops-alerts.md', import.meta.url)), 'utf8');
  const slugs = new Set(md.split('\n').filter((l) => /^#{2,3} /.test(l)).map((l) =>
    l.replace(/^#+ /, '').trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-')));
  const anchors = new Set([...RULES.map((r) => r.anchor), ...HEALTH_CHECKS.map((h) => h.anchor)]);
  for (const a of anchors) assert.ok(slugs.has(a), `runbook has no heading for #${a}`);
});

// Per-minute restart counts the collector would publish for a container that restarts every `periodS` seconds.
function restartMinutes(periodS, minutes) {
  return Array.from({ length: minutes }, (_, m) => {
    let n = 0;
    for (let t = 0; t < minutes * 60; t += periodS) if (t >= m * 60 && t < (m + 1) * 60) n += 1;
    return n;
  });
}

test('restart-loop: a loop faster than a minute is ALARM and stays ALARM until it stops, then recovers', () => {
  const loop = rule('restart-loop');
  const state = (values) => values.map((_, i) => evaluateRule(loop, values.slice(0, i + 1)));
  const fast = restartMinutes(50, 30);
  // The event alarm never leaves ALARM here (a restart every minute): that is the gap this rule closes.
  assert.ok(state(fast).slice(3).every((v) => v === 'ALARM'));
  assert.equal(evaluateRule(rule('web-restart'), fast.slice(-1)), 'ALARM');
  const stopped = [...fast, ...Array(12).fill(0)];
  assert.equal(state(stopped).at(-1), 'OK', 'recovers once fewer than 3 of the last 10 minutes have a restart');
  assert.equal(state(stopped)[fast.length + 2], 'ALARM', 'does not flap off the minute the loop pauses');
});

test('restart-loop: a single restart or one OOM death (restart + heap in the same minute) stays quiet', () => {
  const loop = rule('restart-loop');
  assert.equal(evaluateRule(loop, [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]), 'OK');
  assert.equal(evaluateRule(loop, [0, 0, 0, 0, 0, 1, 0, 0, 1, 0]), 'OK');
  assert.equal(evaluateRule(loop, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'OK');
});

test('restart-loop: the 2-minute and the 65-second loops of the review reproduction both alarm', () => {
  for (const periodS of [65, 120]) {
    assert.equal(evaluateRule(rule('restart-loop'), restartMinutes(periodS, 12)), 'ALARM', `${periodS}s`);
  }
});

test('restart-loop is a state alarm in a group of its own: no event flag, so its recovery is posted, and its ALARMs are counted', () => {
  const loop = rule('restart-loop');
  assert.equal(loop.event, undefined);
  assert.equal(loop.group, 'restart-loop');
  assert.deepEqual(groupAlarmNames('prod', 'restart-loop'), ['teameet-prod-restart-loop'], 'it must not share a group with the event alarms');
  assert.equal(loop.source.kind, 'sum-containers');
});
