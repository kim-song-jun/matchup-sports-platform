const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EVIDENCE_VERSION, resumeEvidence } = require('./stage-design-evidence.cjs');
const scope = { phase: 'after', captureScope: 'full', origin: 'https://alpha.teameet.co.kr', tournamentId: 'owned', expectedCommit: 'new', routes: [['bracket', '/bracket']] };
const check = { name: 'bracket', route: '/bracket', url: '/bracket', width: 390, release: 'new', passed: true, scroll: [{ after: 400, max: 400 }] };
const report = checks => ({ evidenceVersion: EVIDENCE_VERSION, ...scope, checks, interactions: ['filtered-final-team-matches', 'match-detail-back-restores-filters'].map(name => ({ name, width: 390, passed: true })) });
test('rejects screenshots from another deployment before launching a browser', () => {
  assert.throws(() => resumeEvidence(report([{ ...check, release: 'old' }]), scope), /different deployment/);
});
test('reruns incomplete and failing routes and retains only their completed peers', () => {
  const resumed = resumeEvidence(report([check, { ...check, width: 768, passed: false }, { ...check, width: 1440, passed: undefined }]), scope);
  assert.deepEqual(resumed.checks, [check]); assert.equal(resumed.interactions.length, 2);
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
test('reruns screenshot-only success when a required action is missing, failed, or belongs to another viewport', () => {
  for (const interactions of [[], [{ name: 'filtered-final-team-matches', width: 390, passed: true }], report([]).interactions.map(item => ({ ...item, passed: false })), report([]).interactions.map(item => ({ ...item, width: 768 }))]) {
    assert.deepEqual(resumeEvidence({ ...report([check]), interactions }, scope).checks, []);
  }
});
test('mobile admin reuse requires an actual display save, while desktop does not', () => {
  const adminScope = { ...scope, routes: [['admin-bracket', '/admin']] };
  const admin = { ...check, name: 'admin-bracket', route: '/admin', url: '/admin' };
  const names = ['admin-stage-panel', 'admin-period-scope', 'admin-draft-preserved', 'drafts-survive-pool-switch', 'owned-fixture-labels-restored'];
  const interactions = names.map(name => ({ name, width: 390, passed: true }));
  assert.equal(resumeEvidence({ ...report([admin]), interactions }, adminScope).checks.length, 0);
  interactions.find(item => item.name === 'drafts-survive-pool-switch').displaySaveExercised = true;
  assert.equal(resumeEvidence({ ...report([admin]), interactions }, adminScope).checks.length, 1);
  assert.equal(resumeEvidence({ ...report([{ ...admin, width: 768 }]), interactions: names.map(name => ({ name, width: 768, passed: true })) }, adminScope).checks.length, 1);
});
test('focused screenshots cannot substitute for full interaction evidence', () => {
  const focused = { ...report([check]), captureScope: 'admin-bottom', interactions: [] };
  assert.throws(() => resumeEvidence(focused, scope), /different QA scope/);
  assert.equal(resumeEvidence(focused, { ...scope, captureScope: 'admin-bottom' }).checks.length, 1);
  assert.throws(() => resumeEvidence({ ...report([check]), evidenceVersion: 2 }, scope), /older capture format/);
});
