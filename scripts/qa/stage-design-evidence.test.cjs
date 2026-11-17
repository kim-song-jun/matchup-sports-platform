const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resumeEvidence } = require('./stage-design-evidence.cjs');
const scope = { phase: 'after', origin: 'https://alpha.teameet.co.kr', tournamentId: 'owned', expectedCommit: 'new', routes: [['bracket', '/bracket']] };
const check = { name: 'bracket', route: '/bracket', url: '/bracket', width: 390, release: 'new', passed: true, scroll: [{ after: 400, max: 400 }] };
const report = checks => ({ evidenceVersion: 2, ...scope, checks, interactions: [{ name: 'filtered-final-team-matches', width: 390, passed: true }] });
test('rejects screenshots from another deployment before launching a browser', () => {
  assert.throws(() => resumeEvidence(report([{ ...check, release: 'old' }]), scope), /different deployment/);
});
test('reruns incomplete and failing routes and retains only their completed peers', () => {
  const resumed = resumeEvidence(report([check, { ...check, width: 768, passed: false }, { ...check, width: 1440, passed: undefined }]), scope);
  assert.deepEqual(resumed.checks, [check]); assert.equal(resumed.interactions.length, 1);
});
test('does not resume redirected pages or interactions of failed routes', () => {
  const resumed = resumeEvidence(report([{ ...check, url: '/login' }]), scope);
  assert.deepEqual(resumed.checks, []); assert.deepEqual(resumed.interactions, []);
});
test('rejects evidence from another competition', () => {
  assert.throws(() => resumeEvidence({ ...report([check]), tournamentId: 'someone-else' }, scope), /different QA scope/);
});
test('rejects legacy captures that did not verify scrolling', () => {
  assert.throws(() => resumeEvidence({ ...report([check]), evidenceVersion: undefined }, scope), /older capture format/);
});
test('reruns a route whose claimed success did not reach the content bottom', () => {
  assert.deepEqual(resumeEvidence(report([{ ...check, scroll: [{ after: 0, max: 400 }] }]), scope).checks, []);
});
