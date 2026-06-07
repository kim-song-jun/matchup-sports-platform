import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildAdminDesktopFindings,
  buildPageStorybookQaConfig,
  buildPageStorybookReport,
  renderPageStorybookHtml,
} from './v1-page-storybook-qa.mjs';

test('Given Task 101 CLI tokens When config is built Then storybook QA paths and admin focus are explicit', () => {
  const config = buildPageStorybookQaConfig([
    '--base-url',
    'http://localhost:3013',
    '--routes',
    '/admin,/admin/audit',
    '--viewports',
    '1024x900,1440x960,1920x1080',
    '--out',
    'output/playwright/visual-audit/task101-no-fallback-storybook-qa-20260606/admin-desktop',
    '--json',
    'evidence/task101-no-fallback-storybook-qa-20260606/admin-desktop.json',
    '--html',
    'evidence/task101-no-fallback-storybook-qa-20260606/admin-desktop.html',
    '--admin-focus',
  ]);

  assert.equal(config.baseUrl, 'http://localhost:3013');
  assert.deepEqual([...config.routeFilter], ['/admin', '/admin/audit']);
  assert.deepEqual(config.viewports.map((viewport) => viewport.width), [1024, 1440, 1920]);
  assert.equal(config.outDir, 'output/playwright/visual-audit/task101-no-fallback-storybook-qa-20260606/admin-desktop');
  assert.equal(config.jsonPath, 'evidence/task101-no-fallback-storybook-qa-20260606/admin-desktop.json');
  assert.equal(config.htmlPath, 'evidence/task101-no-fallback-storybook-qa-20260606/admin-desktop.html');
  assert.equal(config.adminFocus, true);
});

test('Given a browser capture error When report HTML is rendered Then raw error is shown and no replacement image is emitted', () => {
  const summary = {
    baseUrl: 'http://localhost:3013',
    matrix: 'docs/scenarios/13-v1-open-design-recovery-from-zero.md',
    routeCount: 1,
    resultCount: 0,
    routes: ['/admin'],
    failures: [],
    results: [
      {
        route: '/admin',
        captureRoute: '/admin',
        family: 'community-admin-utility',
        authMode: 'authenticated',
        viewports: [{ name: '1440x960', width: 1440, height: 960 }],
        screenshots: [{ viewport: '1440x960', path: 'output/missing-admin.png' }],
        viewportResults: [],
        findings: [
          {
            level: 'blocking',
            check: 'browser-capture',
            viewport: '1440x960',
            message: 'TypeError: Cannot read properties of undefined',
          },
        ],
        verdict: 'fail',
      },
    ],
  };

  const report = buildPageStorybookReport({
    summary,
    config: { htmlPath: 'evidence/task101/page-storybook.html', adminFocus: true },
    generatedAt: '2026-06-06T00:00:00.000Z',
  });
  const html = renderPageStorybookHtml(report);

  assert.equal(report.status, 'fail');
  assert.equal(report.stories.length, 1);
  assert.equal(report.stories[0].status, 'fail');
  assert.equal(report.stories[0].error, 'TypeError: Cannot read properties of undefined');
  assert.match(html, /TypeError: Cannot read properties of undefined/);
  assert.doesNotMatch(html, /placeholder|data:image|missing-admin\.png"[^>]*alt="Task 101/);
  assert.equal(/<img\b/.test(html), false);
});

test('Given a viewport result points to a missing screenshot file When report is built Then the story fails without an image tag', () => {
  const summary = {
    baseUrl: 'http://localhost:3013',
    matrix: 'docs/scenarios/13-v1-open-design-recovery-from-zero.md',
    routeCount: 1,
    resultCount: 1,
    routes: ['/matches'],
    failures: [],
    results: [
      {
        route: '/matches',
        captureRoute: '/matches',
        family: 'personal-match',
        authMode: 'public',
        viewports: [{ name: '390x844', width: 390, height: 844 }],
        screenshots: [{ viewport: '390x844', path: 'output/missing-match.png' }],
        viewportResults: [
          {
            viewport: { name: '390x844', width: 390, height: 844 },
            screenshot: 'output/missing-match.png',
            metrics: {},
            functionProbeResults: [],
            findings: [],
          },
        ],
        findings: [],
        verdict: 'pass',
      },
    ],
  };

  const report = buildPageStorybookReport({
    summary,
    config: {
      htmlPath: 'evidence/task101/page-storybook.html',
      adminFocus: false,
      existingScreenshots: new Set(),
    },
    generatedAt: '2026-06-06T00:00:00.000Z',
  });
  const html = renderPageStorybookHtml(report);

  assert.equal(report.status, 'fail');
  assert.equal(report.stories[0].error, 'Screenshot file missing: output/missing-match.png');
  assert.equal(/<img\b/.test(html), false);
  assert.match(html, /Screenshot file missing: output\/missing-match\.png/);
});

test('Given the same raw finding appears at route and viewport level When report is built Then it is shown once', () => {
  const duplicateFinding = {
    level: 'blocking',
    check: 'response-error',
    viewport: '390x844',
    message: '401 GET http://localhost:3013/api/v1/example',
  };
  const summary = {
    baseUrl: 'http://localhost:3013',
    matrix: 'docs/scenarios/13-v1-open-design-recovery-from-zero.md',
    routeCount: 1,
    resultCount: 1,
    routes: ['/home'],
    failures: [],
    results: [
      {
        route: '/home',
        captureRoute: '/home',
        family: 'public-auth-discovery',
        authMode: 'public',
        viewports: [{ name: '390x844', width: 390, height: 844 }],
        screenshots: [{ viewport: '390x844', path: 'output/home.png' }],
        viewportResults: [
          {
            viewport: { name: '390x844', width: 390, height: 844 },
            screenshot: 'output/home.png',
            metrics: {},
            functionProbeResults: [],
            findings: [duplicateFinding],
          },
        ],
        findings: [duplicateFinding],
        verdict: 'fail',
      },
    ],
  };

  const report = buildPageStorybookReport({
    summary,
    config: { htmlPath: 'evidence/task101/page-storybook.html', adminFocus: false },
    generatedAt: '2026-06-06T00:00:00.000Z',
  });

  assert.equal(report.stories[0].findings.length, 1);
  assert.equal(report.stories[0].error, duplicateFinding.message);
});

test('Given a failed browser request is present without findings When report is built Then the story fails and keeps its screenshot', () => {
  const summary = {
    baseUrl: 'http://localhost:3013',
    matrix: 'docs/scenarios/13-v1-open-design-recovery-from-zero.md',
    routeCount: 1,
    resultCount: 1,
    routes: ['/home'],
    failures: [],
    results: [
      {
        route: '/home',
        captureRoute: '/home',
        family: 'public-auth-discovery',
        authMode: 'public',
        viewports: [{ name: '1440x960', width: 1440, height: 960 }],
        screenshots: [{ viewport: '1440x960', path: 'output/home.png' }],
        viewportResults: [
          {
            viewport: { name: '1440x960', width: 1440, height: 960 },
            screenshot: 'output/home.png',
            metrics: {},
            functionProbeResults: [],
            failedRequests: [{ url: 'http://localhost:3013/api/v1/home', failure: 'net::ERR_FAILED' }],
            findings: [],
          },
        ],
        findings: [],
        verdict: 'pass',
      },
    ],
  };

  const report = buildPageStorybookReport({
    summary,
    config: {
      htmlPath: 'evidence/task101/page-storybook.html',
      adminFocus: false,
      existingScreenshots: new Set(['output/home.png']),
    },
    generatedAt: '2026-06-06T00:00:00.000Z',
  });
  const html = renderPageStorybookHtml(report);

  assert.equal(report.status, 'fail');
  assert.equal(report.stories[0].status, 'fail');
  assert.equal(report.stories[0].error, 'net::ERR_FAILED http://localhost:3013/api/v1/home');
  assert.equal(report.stories[0].screenshot, 'output/home.png');
  assert.equal(/<img\b/.test(html), true);
  assert.match(html, /net::ERR_FAILED http:\/\/localhost:3013\/api\/v1\/home/);
});

test('Given an HTTP response error has a valid screenshot When report is built Then the error is visible without hiding the screenshot', () => {
  const responseFinding = {
    level: 'blocking',
    check: 'response-error',
    viewport: '1440x960',
    message: '500 GET http://localhost:3013/api/v1/home',
  };
  const summary = {
    baseUrl: 'http://localhost:3013',
    matrix: 'docs/scenarios/13-v1-open-design-recovery-from-zero.md',
    routeCount: 1,
    resultCount: 1,
    routes: ['/home'],
    failures: [],
    results: [
      {
        route: '/home',
        captureRoute: '/home',
        family: 'public-auth-discovery',
        authMode: 'public',
        viewports: [{ name: '1440x960', width: 1440, height: 960 }],
        screenshots: [{ viewport: '1440x960', path: 'output/home.png' }],
        viewportResults: [
          {
            viewport: { name: '1440x960', width: 1440, height: 960 },
            screenshot: 'output/home.png',
            metrics: {},
            functionProbeResults: [],
            findings: [responseFinding],
          },
        ],
        findings: [responseFinding],
        verdict: 'fail',
      },
    ],
  };

  const report = buildPageStorybookReport({
    summary,
    config: {
      htmlPath: 'evidence/task101/page-storybook.html',
      adminFocus: false,
      existingScreenshots: new Set(['output/home.png']),
    },
    generatedAt: '2026-06-06T00:00:00.000Z',
  });
  const html = renderPageStorybookHtml(report);

  assert.equal(report.status, 'fail');
  assert.equal(report.stories[0].error, responseFinding.message);
  assert.equal(report.stories[0].screenshot, 'output/home.png');
  assert.equal(/<img\b/.test(html), true);
});

test('Given a console error has a valid screenshot When report is built Then the story fails without hiding the screenshot', () => {
  const summary = {
    baseUrl: 'http://localhost:3013',
    matrix: 'docs/scenarios/13-v1-open-design-recovery-from-zero.md',
    routeCount: 1,
    resultCount: 1,
    routes: ['/home'],
    failures: [],
    results: [
      {
        route: '/home',
        captureRoute: '/home',
        family: 'public-auth-discovery',
        authMode: 'public',
        viewports: [{ name: '1440x960', width: 1440, height: 960 }],
        screenshots: [{ viewport: '1440x960', path: 'output/home.png' }],
        viewportResults: [
          {
            viewport: { name: '1440x960', width: 1440, height: 960 },
            screenshot: 'output/home.png',
            metrics: {},
            functionProbeResults: [],
            findings: [],
            consoleMessages: [{ type: 'error', text: 'Uncaught TypeError: broken' }],
          },
        ],
        findings: [],
        verdict: 'pass',
      },
    ],
  };

  const report = buildPageStorybookReport({
    summary,
    config: { htmlPath: 'evidence/task101/page-storybook.html', adminFocus: false, existingScreenshots: new Set(['output/home.png']) },
    generatedAt: '2026-06-06T00:00:00.000Z',
  });
  const html = renderPageStorybookHtml(report);

  assert.equal(report.status, 'fail');
  assert.equal(report.stories[0].error, 'Uncaught TypeError: broken');
  assert.equal(report.stories[0].screenshot, 'output/home.png');
  assert.equal(/<img\b/.test(html), true);
});

test('Given admin desktop metrics When blockers are evaluated Then internal or mobile-like admin UI fails', () => {
  const findings = buildAdminDesktopFindings({
    route: '/admin',
    viewport: { name: '1440x960', width: 1440, height: 960 },
    metrics: {
      appFrameVisible: true,
      appWidth: 1200,
      desktopNavVisible: false,
      bottomNavVisible: true,
      links: [{ text: '매치', href: '/team-matches/team-match-1/manage' }],
      buttons: [],
      internalAdminCopyVisible: true,
      unsupportedSuccessText: true,
      affordanceAudit: { failures: [{ text: '감사 로그', message: 'covered by overlay' }], visibleInteractive: 2 },
    },
    functionProbeResults: [{ check: 'functional-actionability', status: 'fail', failures: [{ text: '감사 로그' }] }],
  });

  assert.deepEqual(findings.map((finding) => finding.check), [
    'admin-desktop-chrome',
    'admin-desktop-chrome',
    'admin-shell-link',
    'admin-dead-manage-route',
    'admin-internal-copy',
    'admin-unsupported-success',
    'admin-functional-actionability',
  ]);
});

test('Given customer ERP admin workspace metrics When blockers are evaluated Then service operations links are accepted', () => {
  const findings = buildAdminDesktopFindings({
    route: '/admin',
    viewport: { name: '1440x960', width: 1440, height: 960 },
    metrics: {
      desktopNavVisible: true,
      bottomNavVisible: false,
      links: [
        { text: '업무 이력', href: '/admin/audit' },
        { text: '팀 매치 만들기', href: '/team-matches/new' },
        { text: '멤버/요청', href: '/my/teams/team-1/members' },
      ],
      buttons: [],
      internalAdminCopyVisible: false,
      unsupportedSuccessText: false,
      affordanceAudit: { failures: [], visibleInteractive: 2 },
    },
    functionProbeResults: [],
  });

  assert.deepEqual(findings, []);
});

test('Given admin route output When storybook report is built Then desktop admin stories are grouped as a focus section', () => {
  const summary = {
    baseUrl: 'http://localhost:3013',
    matrix: 'docs/scenarios/13-v1-open-design-recovery-from-zero.md',
    routeCount: 2,
    resultCount: 2,
    routes: ['/admin', '/admin/audit'],
    failures: [],
    results: [
      adminPassResult('/admin', '1280x900'),
      adminPassResult('/admin/audit', '1920x1080'),
    ],
  };

  const report = buildPageStorybookReport({
    summary,
    config: { htmlPath: 'evidence/task101/admin.html', adminFocus: true },
    generatedAt: '2026-06-06T00:00:00.000Z',
  });

  assert.equal(report.status, 'pass');
  assert.equal(report.adminFocus.enabled, true);
  assert.deepEqual(report.adminFocus.routes, ['/admin', '/admin/audit']);
  assert.deepEqual(report.adminFocus.desktopViewports, ['1280x900', '1920x1080']);
  assert.equal(report.stories.every((story) => story.adminDesktop), true);
});

test('Given page storybook runner source When inspected Then it reuses live route QA and writes HTML without masking failures', async () => {
  const runner = await readFile('scripts/qa/v1-page-storybook-qa.mjs', 'utf8');
  const fullRunner = await readFile('scripts/qa/v1-full-responsive-visual-functional.mjs', 'utf8');

  assert.match(runner, /runFullResponsiveQa/);
  assert.match(runner, /buildPageStorybookReport/);
  assert.match(runner, /renderPageStorybookHtml/);
  assert.match(runner, /existingScreenshots/);
  assert.match(runner, /process\.exit\(1\)/);
  assert.match(fullRunner, /page\.on\('response'/);
  assert.match(fullRunner, /responseErrors/);
  assert.match(fullRunner, /status\(\) >= 400/);
  assert.match(fullRunner, /check:\s*'console-error'/);
  assert.match(fullRunner, /check:\s*'response-error'/);
  assert.match(fullRunner, /check:\s*'request-failed'/);
  assert.match(fullRunner, /visibleBodyText/);
  assert.match(fullRunner, /ignoredTags = new Set\(\['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'\]\)/);
  assert.doesNotMatch(runner, /placeholder|fallbackImage|data:image/);
});

function adminPassResult(route, viewportName) {
  const [widthText, heightText] = viewportName.split('x');
  const viewport = { name: viewportName, width: Number(widthText), height: Number(heightText) };
  return {
    route,
    captureRoute: route,
    family: 'community-admin-utility',
    authMode: 'authenticated',
    viewports: [viewport],
    screenshots: [{ viewport: viewportName, path: `output/${route.replace('/', '')}-${viewportName}.png` }],
    viewportResults: [
      {
        viewport,
        screenshot: `output/${route.replace('/', '')}-${viewportName}.png`,
        metrics: {
          appFrameVisible: true,
          appWidth: viewport.width,
          desktopNavVisible: true,
          bottomNavVisible: false,
          links: [
            { text: route === '/admin' ? '업무 이력' : '워크스페이스', href: route === '/admin' ? '/admin/audit' : '/admin' },
            { text: '팀 매치 만들기', href: '/team-matches/new' },
          ],
          buttons: [],
          internalAdminCopyVisible: false,
          unsupportedSuccessText: false,
          affordanceAudit: { failures: [], visibleInteractive: 1 },
        },
        functionProbeResults: [{ check: 'functional-actionability', status: 'pass', failures: [] }],
        findings: [],
      },
    ],
    findings: [],
    verdict: 'pass',
  };
}
