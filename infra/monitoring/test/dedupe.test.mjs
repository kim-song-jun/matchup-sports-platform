import assert from 'node:assert/strict';
import test from 'node:test';
import { decideGroupAlarm, INCIDENT_GAP_MS, REPEAT_WINDOW_MS } from '../lib/dedupe.mjs';

const T0 = Date.parse('2026-11-20T01:50:47Z');
const RESTART = 'teameet-prod-web-restart';
const HEAP = 'teameet-prod-heap-oom';
const at = (name, offsetMs) => ({ name, atMs: T0 + offsetMs });

test('one heap death fires both alarms seconds apart: only the earlier one posts, and it names the other', () => {
  const transitions = [at(RESTART, 0), at(HEAP, 2_000)];
  const first = decideGroupAlarm({ name: RESTART, changeMs: T0, transitions });
  assert.deepEqual(first, { post: true, incident: 1, alongside: [HEAP] });
  const second = decideGroupAlarm({ name: HEAP, changeMs: T0 + 2_000, transitions });
  assert.deepEqual(second, { post: false, reason: 'merged-into-earlier-alarm' });
});

test('exactly one of the two Lambdas posts, whichever alarm flipped first', () => {
  const transitions = [at(HEAP, 0), at(RESTART, 1_000)];
  const decisions = transitions.map((t) => decideGroupAlarm({ name: t.name, changeMs: t.atMs, transitions }));
  assert.equal(decisions.filter((d) => d.post).length, 1);
  assert.equal(decisions[0].post, true);
});

test('a history that has not recorded the current transition yet still decides', () => {
  assert.deepEqual(decideGroupAlarm({ name: RESTART, changeMs: T0, transitions: [] }), { post: true, incident: 1, alongside: [] });
});

test('the same transition read back with a few ms of difference is not counted twice', () => {
  const d = decideGroupAlarm({ name: RESTART, changeMs: T0, transitions: [at(RESTART, 400)] });
  assert.deepEqual(d, { post: true, incident: 1, alongside: [] });
});

test('restarts repeating every 4 minutes: 1st and 3rd post, the 2nd, 4th and 5th stay quiet', () => {
  const times = [0, 4, 8, 12, 16].map((m) => at(RESTART, m * 60_000));
  const posted = times.map((t) => decideGroupAlarm({ name: RESTART, changeMs: t.atMs, transitions: times.filter((u) => u.atMs <= t.atMs) }));
  assert.deepEqual(posted.map((d) => d.post), [true, false, true, false, false]);
  assert.equal(posted[0].incident, 1);
  assert.equal(posted[2].incident, 3);
  assert.equal(posted[1].reason, 'repeat-throttled');
});

test('incidents older than the repeat window do not count: a restart an hour later is a first again', () => {
  const old = at(RESTART, -(REPEAT_WINDOW_MS + 60_000));
  const d = decideGroupAlarm({ name: RESTART, changeMs: T0, transitions: [old, at(RESTART, -(REPEAT_WINDOW_MS + 5 * 60_000))] });
  assert.deepEqual(d, { post: true, incident: 1, alongside: [] });
});

test('two restarts closer than the incident gap are one incident, further apart are two', () => {
  const near = decideGroupAlarm({ name: RESTART, changeMs: T0 + INCIDENT_GAP_MS - 1_000, transitions: [at(RESTART, 0)] });
  assert.equal(near.post, false);
  assert.equal(near.reason, 'merged-into-earlier-alarm');
  const apart = decideGroupAlarm({ name: RESTART, changeMs: T0 + INCIDENT_GAP_MS + 1_000, transitions: [at(RESTART, 0)] });
  assert.equal(apart.reason, 'repeat-throttled');
  assert.equal(apart.incident, 2);
});
