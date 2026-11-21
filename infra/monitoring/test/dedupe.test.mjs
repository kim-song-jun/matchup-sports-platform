import assert from 'node:assert/strict';
import test from 'node:test';
import { decideGroupAlarm, POST_AT_OCCURRENCE, REPEAT_GAP_MS, SIBLING_GAP_MS } from '../lib/dedupe.mjs';

const T0 = Date.parse('2026-11-20T01:50:47Z');
const MIN = 60_000;
const RESTART = 'teameet-prod-web-restart';
const HEAP = 'teameet-prod-heap-oom';
const at = (name, offsetMs) => ({ name, atMs: T0 + offsetMs });

// What the Lambda would decide for each transition, given the history it can read at that moment.
const replay = (all) => all.map((t) => ({
  t,
  d: decideGroupAlarm({ name: t.name, changeMs: t.atMs, transitions: all.filter((u) => u.atMs <= t.atMs) }),
}));

test('one heap death fires both alarms seconds apart: only the earlier one posts, and it names the other', () => {
  const transitions = [at(RESTART, 0), at(HEAP, 2_000)];
  const first = decideGroupAlarm({ name: RESTART, changeMs: T0, transitions });
  assert.deepEqual(first, { post: true, occurrence: 1, spanMinutes: 0, alongside: [HEAP] });
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
  assert.deepEqual(decideGroupAlarm({ name: RESTART, changeMs: T0, transitions: [] }), { post: true, occurrence: 1, spanMinutes: 0, alongside: [] });
});

test('the same transition read back with a few ms of difference is not counted twice', () => {
  const d = decideGroupAlarm({ name: RESTART, changeMs: T0, transitions: [at(RESTART, 400)] });
  assert.deepEqual(d, { post: true, occurrence: 1, spanMinutes: 0, alongside: [] });
});

test('a crash loop restarting every 2 minutes for an hour posts at 1, 3, 6, 12 and 24 (the review reproduction)', () => {
  const all = [];
  for (let m = 0; m <= 60; m += 2) all.push(at(RESTART, m * MIN), at(HEAP, m * MIN + 2_000));
  const posted = replay(all).filter(({ d }) => d.post);
  assert.deepEqual(posted.map(({ d }) => d.occurrence), [1, 3, 6, 12, 24]);
  assert.deepEqual(posted.map(({ d }) => d.spanMinutes), [0, 4, 10, 22, 46]);
  assert.ok(posted.every(({ t }) => t.name === RESTART), 'the heap sibling never posts on its own');
});

test('a loop that keeps going escalates past 24 instead of falling silent', () => {
  const all = [];
  for (let m = 0; m <= 200; m += 2) all.push(at(RESTART, m * MIN));
  const occurrences = replay(all).filter(({ d }) => d.post).map(({ d }) => d.occurrence);
  assert.deepEqual(occurrences, POST_AT_OCCURRENCE.filter((n) => n <= 101));
});

test('restarts every 4 minutes: same 1, 3, 6 sequence, the others stay quiet', () => {
  const all = [0, 4, 8, 12, 16, 20, 24].map((m) => at(RESTART, m * MIN));
  const result = replay(all).map(({ d }) => d.post);
  assert.deepEqual(result, [true, false, true, false, false, true, false]);
  assert.equal(replay(all)[1].d.reason, 'repeat-throttled');
});

test('two restarts only seconds apart are two occurrences, not one: the same alarm never joins its own', () => {
  const d = decideGroupAlarm({ name: RESTART, changeMs: T0 + 30_000, transitions: [at(RESTART, 0)] });
  assert.equal(d.post, false);
  assert.equal(d.reason, 'repeat-throttled');
  assert.equal(d.occurrence, 2);
});

test('a gap longer than the repeat gap ends the run: the next restart is a first again', () => {
  const old = [at(RESTART, -(REPEAT_GAP_MS + MIN)), at(RESTART, -(REPEAT_GAP_MS + 3 * MIN))];
  const d = decideGroupAlarm({ name: RESTART, changeMs: T0, transitions: old });
  assert.deepEqual(d, { post: true, occurrence: 1, spanMinutes: 0, alongside: [] });
});

test('a gap just inside the repeat gap keeps the run going', () => {
  const d = decideGroupAlarm({ name: RESTART, changeMs: T0, transitions: [at(RESTART, -(REPEAT_GAP_MS - MIN))] });
  assert.equal(d.occurrence, 2);
});

test('a sibling of a different alarm more than the sibling gap later is its own occurrence', () => {
  const near = decideGroupAlarm({ name: HEAP, changeMs: T0 + SIBLING_GAP_MS - 1_000, transitions: [at(RESTART, 0)] });
  assert.equal(near.reason, 'merged-into-earlier-alarm');
  const apart = decideGroupAlarm({ name: HEAP, changeMs: T0 + SIBLING_GAP_MS + 1_000, transitions: [at(RESTART, 0)] });
  assert.equal(apart.post, false);
  assert.equal(apart.occurrence, 2);
});
