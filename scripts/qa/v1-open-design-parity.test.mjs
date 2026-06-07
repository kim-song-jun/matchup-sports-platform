import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFeatureAuditReport,
  buildReportPlan,
  emailForRoute,
  isProtectedRoute,
  parsePairs,
  parseViewports,
  validateV1BaseUrl,
} from './v1-open-design-parity-lib.mjs';

test('Given a legacy base URL When validated Then it is rejected with the v1 port', () => {
  const result = validateV1BaseUrl('http://localhost:3003');

  assert.equal(result.ok, false);
  assert.match(result.message, /localhost:3013/);
});

test('Given CLI pair and viewport strings When parsed Then typed capture targets are returned', () => {
  const pairs = parsePairs('home.html:/home,my.html:/my');
  const viewports = parseViewports('375x812,1280x900');

  assert.deepEqual(pairs, [
    { staticHtml: 'home.html', liveRoute: '/home' },
    { staticHtml: 'my.html', liveRoute: '/my' },
  ]);
  assert.deepEqual(viewports, [
    { name: '375x812', width: 375, height: 812 },
    { name: '1280x900', width: 1280, height: 900 },
  ]);
});

test('Given feature audit rows When implemented route evidence is missing Then failures are reported', () => {
  const report = buildFeatureAuditReport([
    {
      route: '/home',
      classification: 'implemented-route',
      requiredPageFeatures: 'overview cards',
      currentV1FeatureEvidence: '',
      featureImplementationStatus: 'implemented-well',
      featureVerificationCommand: '',
      featureEvidencePath: '',
    },
  ]);

  assert.equal(report.ok, false);
  assert.deepEqual(report.failures, [
    '/home missing currentV1FeatureEvidence',
    '/home missing featureVerificationCommand',
    '/home missing featureEvidencePath',
  ]);
});

test('Given a capture pair When a report plan is built Then static and live screenshot paths are explicit', () => {
  const plan = buildReportPlan({
    baseUrl: 'http://localhost:3013',
    outPath: 'evidence/task-3-home-parity.json',
    openDesignRoot: '/tmp/open-design',
    pairs: parsePairs('home.html:/home'),
    runId: 'task-3-home',
    viewports: parseViewports('1280x900'),
  });

  assert.equal(plan.captures[0].staticScreenshot, 'output/playwright/visual-audit/task-3-home/static/home__1280x900.png');
  assert.equal(plan.captures[0].liveScreenshot, 'output/playwright/visual-audit/task-3-home/live/home__1280x900.png');
  assert.equal(plan.captures[0].staticUrl, 'file:///tmp/open-design/home.html');
  assert.equal(plan.captures[0].liveUrl, 'http://localhost:3013/home');
});

test('Given v1 route paths When protected-route status is checked Then auth-gated pages are covered broadly', () => {
  for (const route of [
    '/my',
    '/chat/room-1',
    '/admin/audit',
    '/onboarding/sport',
    '/matches/new',
    '/matches/new/sport',
    '/matches/[id]/edit',
    '/team-matches/new',
    '/team-matches/new/team',
    '/team-matches/new/place-time',
    '/team-matches/[id]/edit',
    '/teams/new',
    '/teams/[id]/edit',
    '/teams/[id]/members',
    '/reviews/new',
  ]) {
    assert.equal(isProtectedRoute(route), true, route);
  }

  for (const route of ['/home', '/login', '/matches', '/teams']) {
    assert.equal(isProtectedRoute(route), false, route);
  }
});

test('Given protected v1 route paths When QA auth email is selected Then admin workspace routes use an operations account', () => {
  assert.equal(emailForRoute('/admin'), 'owner@teameet.v1');
  assert.equal(emailForRoute('/admin/audit'), 'owner@teameet.v1');
  assert.equal(emailForRoute('/my'), 'host@teameet.v1');
  assert.equal(emailForRoute('/matches/new'), 'host@teameet.v1');
});
