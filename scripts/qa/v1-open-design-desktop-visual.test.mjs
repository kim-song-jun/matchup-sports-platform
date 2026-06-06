import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDesktopVisualConfig,
  buildDesktopVisualRouteManifest,
  buildRouteVisualExpectations,
  resolveDesktopVisualRoutes,
} from './v1-open-design-desktop-visual-lib.mjs';

test('Given CLI viewport options When desktop visual config is built Then routes and viewports are explicit', () => {
  const config = buildDesktopVisualConfig([
    '--base-url',
    'http://localhost:3013',
    '--routes',
    '/home',
    '--viewports',
    '1280x900,1440x900,375x812',
    '--out',
    'evidence/v1-home-open-design-desktop-remake/browser',
  ]);

  assert.equal(config.baseUrl, 'http://localhost:3013');
  assert.deepEqual(config.routes, ['/home']);
  assert.deepEqual(config.viewports, [
    { name: '1280x900', width: 1280, height: 900 },
    { name: '1440x900', width: 1440, height: 900 },
    { name: '375x812', width: 375, height: 812 },
  ]);
  assert.equal(config.outDir, 'evidence/v1-home-open-design-desktop-remake/browser');
});

test('Given the Open Design route matrix and list flag When desktop routes are resolved Then only current v1 routes are listed', async () => {
  const config = buildDesktopVisualConfig([
    '--base-url',
    'http://localhost:3013',
    '--matrix',
    'docs/scenarios/13-v1-open-design-recovery-from-zero.md',
    '--viewports',
    '1280x900,1920x1080',
    '--out',
    'output/playwright/visual-audit/ulw-full-visual-qa-20260605-wide',
    '--list',
  ]);

  const routes = await resolveDesktopVisualRoutes(config);
  const manifest = await buildDesktopVisualRouteManifest(config);

  assert.equal(config.matrix, 'docs/scenarios/13-v1-open-design-recovery-from-zero.md');
  assert.equal(config.listOnly, true);
  assert.equal(routes.length, 87);
  assert.equal(routes.includes('/home'), true);
  assert.equal(routes.includes('/admin/audit'), true);
  assert.equal(routes.includes('/matches/[id]/edit'), true);
  assert.equal(routes.includes('(design-only)'), false);
  assert.equal(manifest.routeCount, 87);
});

test('Given mobile standalone search routes When expectations are built Then bottom nav is not required', () => {
  assert.deepEqual(buildRouteVisualExpectations('/search'), {
    appFrameRequired: false,
    desktopSearchSurfaceRequired: false,
    desktopTopbarRequired: false,
    homeMobileFabRequired: false,
    homeRightRailRequired: false,
    mobileBottomNavRequired: false,
    mobileBottomNavForbidden: true,
  });

  assert.deepEqual(buildRouteVisualExpectations('/search?q=%ED%92%8B%EC%82%B4'), {
    appFrameRequired: false,
    desktopSearchSurfaceRequired: false,
    desktopTopbarRequired: false,
    homeMobileFabRequired: false,
    homeRightRailRequired: false,
    mobileBottomNavRequired: false,
    mobileBottomNavForbidden: true,
  });
});

test('Given auth standalone routes When expectations are built Then desktop app chrome is not required', () => {
  const expectations = buildRouteVisualExpectations('/login');

  assert.equal(expectations.appFrameRequired, false);
  assert.equal(expectations.desktopTopbarRequired, false);
  assert.equal(expectations.desktopSearchSurfaceRequired, false);
});

test('Given top-level match list routes When expectations are built Then desktop app chrome and search are required', () => {
  for (const route of ['/matches', '/team-matches']) {
    const expectations = buildRouteVisualExpectations(route);

    assert.equal(expectations.appFrameRequired, true, route);
    assert.equal(expectations.desktopTopbarRequired, true, route);
    assert.equal(expectations.desktopSearchSurfaceRequired, true, route);
  }
});

test('Given match detail routes When expectations are built Then desktop topbar and search are not required', () => {
  for (const route of ['/matches/[id]', '/team-matches/[id]']) {
    const expectations = buildRouteVisualExpectations(route);

    assert.equal(expectations.appFrameRequired, false, route);
    assert.equal(expectations.desktopTopbarRequired, false, route);
    assert.equal(expectations.desktopSearchSurfaceRequired, false, route);
  }
});

test('Given completion and wizard routes When expectations are built Then desktop app chrome and search are not required', () => {
  for (const route of [
    '/matches/new/complete',
    '/matches/new/confirm',
    '/team-matches/new/condition',
    '/team-matches/new/complete',
  ]) {
    const expectations = buildRouteVisualExpectations(route);

    assert.equal(expectations.appFrameRequired, false, route);
    assert.equal(expectations.desktopTopbarRequired, false, route);
    assert.equal(expectations.desktopSearchSurfaceRequired, false, route);
  }
});

test('Given app chrome routes When expectations are built Then mobile bottom nav remains required', () => {
  assert.deepEqual(buildRouteVisualExpectations('/home'), {
    appFrameRequired: true,
    desktopSearchSurfaceRequired: true,
    desktopTopbarRequired: true,
    homeMobileFabRequired: true,
    homeRightRailRequired: true,
    mobileBottomNavRequired: true,
    mobileBottomNavForbidden: false,
  });

  assert.equal(buildRouteVisualExpectations('/matches').mobileBottomNavRequired, true);
});
