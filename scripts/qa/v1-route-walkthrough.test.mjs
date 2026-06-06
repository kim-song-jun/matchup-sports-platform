import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildFunctionalProbeResults,
  buildWalkthroughTargets,
  classifyAuthMode,
  findWalkthroughFindings,
  parseRouteFilter,
} from './v1-route-walkthrough-lib.mjs';
import { parseViewports, readFeatureRows } from './v1-open-design-parity-lib.mjs';

test('Given route matrix rows When walkthrough targets are built Then every current v1 route receives visual and function checks', async () => {
  const rows = await readFeatureRows('docs/scenarios/13-v1-open-design-recovery-from-zero.md');
  const viewports = parseViewports('390x844,1440x900');

  const targets = buildWalkthroughTargets({
    evidenceRoot: 'evidence/route-by-route-qa-20260605/routes',
    outDir: 'output/playwright/visual-audit/route-by-route-qa-20260605/test',
    routeFilter: parseRouteFilter('/team-matches,/matches,/teams'),
    rows,
    viewports,
  });

  assert.equal(targets.length, 3);
  for (const target of targets) {
    assert.equal(target.visualChecks.length >= 5, true, target.route);
    assert.equal(target.functionChecks.length >= 4, true, target.route);
    assert.equal(target.functionChecks.includes('non-destructive-action-probes'), true, target.route);
    assert.equal(target.viewports.length, 2, target.route);
    assert.equal(target.screenshots.length, 2, target.route);
    assert.match(target.auditPath, /^evidence\/route-by-route-qa-20260605\/routes\//);
    assert.notEqual(target.family, 'unknown', target.route);
  }
});

test('Given team-match completion has stale action affordances When function probes run Then blockers are recorded', () => {
  const viewport = { name: '1440x900', width: 1440, height: 900 };
  const metrics = {
    horizontalOverflow: false,
    deadLinks: [],
    textClipping: [],
    unsupportedSuccessText: false,
    actionCount: 2,
    links: [{ text: '상세 보기', href: '/team-matches/team-match-1' }],
    buttons: [{ text: '팀 채팅에 공유', disabled: false }],
    inputs: [],
    forms: 0,
    bottomNavVisible: false,
  };

  const functionProbeResults = buildFunctionalProbeResults({ route: '/team-matches/new/complete', metrics });
  const findings = findWalkthroughFindings({
    target: { route: '/team-matches/new/complete', authMode: 'authenticated' },
    viewport,
    metrics,
    functionProbeResults,
  });

  assert.deepEqual(functionProbeResults.filter((result) => result.status === 'fail').map((result) => result.check), ['primary-action-affordance']);
  assert.deepEqual(findings.filter((finding) => finding.level === 'blocking').map((finding) => finding.check), ['stale-fixture-link', 'primary-action-affordance']);
});

test('Given dynamic v1 route rows When walkthrough targets are built Then live seed capture routes are used', () => {
  const rows = [
    { route: '/matches/[id]/edit', classification: 'implemented-route', openDesignHtml: 'match-edit.html' },
    { route: '/team-matches/[id]', classification: 'implemented-route', openDesignHtml: 'team-match-detail.html' },
    { route: '/team-matches/[id]/edit', classification: 'implemented-route', openDesignHtml: 'team-match-edit.html' },
    { route: '/teams/[id]', classification: 'implemented-route', openDesignHtml: 'team-detail.html' },
    { route: '/chat/[id]', classification: 'implemented-route', openDesignHtml: 'chat-room.html' },
    { route: '/notices/[id]', classification: 'implemented-route', openDesignHtml: 'notice-detail.html' },
    { route: '/my/reviews/[sourceType]/[sourceId]', classification: 'implemented-route', openDesignHtml: 'my-reviews.html' },
  ];

  const targets = buildWalkthroughTargets({
    evidenceRoot: 'evidence/route-by-route-qa-20260605/routes',
    outDir: 'output/playwright/visual-audit/route-by-route-qa-20260605/test',
    routeFilter: parseRouteFilter('/matches/[id]/edit,/team-matches/[id],/team-matches/[id]/edit,/teams/[id],/chat/[id],/notices/[id],/my/reviews/[sourceType]/[sourceId]'),
    rows,
    viewports: parseViewports('390x844'),
  });

  assert.deepEqual(targets.map((target) => target.captureRoute), [
    '/matches/00000000-0000-4000-8000-000000000201/edit',
    '/team-matches/00000000-0000-4000-8000-000000000306',
    '/team-matches/00000000-0000-4000-8000-000000000306/edit',
    '/teams/00000000-0000-4000-8000-000000000102',
    '/chat/__live_chat_room__',
    '/notices/00000000-0000-4000-8000-000000000001',
    '/my/reviews/match/00000000-0000-4000-8000-000000000204',
  ]);
});

test('Given protected v1 routes When browser auth is injected Then auth-me preflight passes before capture', () => {
  assert.equal(classifyAuthMode('/my'), 'authenticated');
  assert.equal(classifyAuthMode('/chat/[id]'), 'authenticated');
  assert.equal(classifyAuthMode('/admin'), 'authenticated');
  assert.equal(classifyAuthMode('/team-matches/new'), 'authenticated');
  assert.equal(classifyAuthMode('/team-matches/new/team'), 'authenticated');
  assert.equal(classifyAuthMode('/onboarding/region'), 'authenticated');
  assert.equal(classifyAuthMode('/login'), 'public');
  assert.equal(classifyAuthMode('/team-matches'), 'public');
});

test('Given admin route targets When walkthrough targets are built Then admin QA uses an admin persona', () => {
  const targets = buildWalkthroughTargets({
    evidenceRoot: 'evidence/route-by-route-qa-20260605/routes',
    outDir: 'output/playwright/visual-audit/route-by-route-qa-20260605/test',
    routeFilter: parseRouteFilter('/admin,/my'),
    rows: [
      { route: '/admin', classification: 'implemented-route', openDesignHtml: 'admin.html' },
      { route: '/my', classification: 'implemented-route', openDesignHtml: 'my.html' },
    ],
    viewports: parseViewports('390x844'),
  });

  assert.deepEqual(targets.map((target) => [target.route, target.persona]), [
    ['/admin', 'admin@teameet.v1'],
    ['/my', 'host@teameet.v1'],
  ]);
});

test('Given walkthrough CLI tokens When config is built Then evidence and browser output paths are explicit', async () => {
  const module = await import('./v1-route-walkthrough-lib.mjs');
  assert.equal(typeof module.buildWalkthroughConfig, 'function');

  const config = module.buildWalkthroughConfig([
    '--base-url',
    'http://localhost:3013',
    '--matrix',
    'docs/scenarios/13-v1-open-design-recovery-from-zero.md',
    '--routes',
    '/team-matches,/matches',
    '--viewports',
    '390x844,1440x900',
    '--out',
    'output/playwright/visual-audit/route-by-route-qa-20260605/harness-smoke',
    '--json',
    'evidence/route-by-route-qa-20260605/harness-smoke.json',
  ]);

  assert.equal(config.baseUrl, 'http://localhost:3013');
  assert.equal(config.matrix, 'docs/scenarios/13-v1-open-design-recovery-from-zero.md');
  assert.deepEqual([...config.routeFilter], ['/team-matches', '/matches']);
  assert.deepEqual(config.viewports.map((viewport) => viewport.name), ['390x844', '1440x900']);
  assert.equal(config.outDir, 'output/playwright/visual-audit/route-by-route-qa-20260605/harness-smoke');
  assert.equal(config.jsonPath, 'evidence/route-by-route-qa-20260605/harness-smoke.json');
});

test('Given walkthrough CLI list mode When executed Then route targets are printed without launching browser capture', () => {
  const result = spawnSync(process.execPath, [
    'scripts/qa/v1-route-walkthrough.mjs',
    '--base-url',
    'http://localhost:3013',
    '--matrix',
    'docs/scenarios/13-v1-open-design-recovery-from-zero.md',
    '--routes',
    '/team-matches,/matches,/teams',
    '--viewports',
    '390x844,1440x900',
    '--list',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.routeCount, 3);
  assert.equal(body.targets[0].route, '/team-matches');
  assert.equal(body.targets[0].screenshots.length, 2);
});

test('Given route redirects or slow hydration When browser capture runs Then screenshots wait for a settled app frame', async () => {
  const runner = await readFile('scripts/qa/v1-route-walkthrough.mjs', 'utf8');
  const lib = await readFile('scripts/qa/v1-route-walkthrough-lib.mjs', 'utf8');
  assert.match(runner, /async function waitForWalkthroughSettled\(page\)/);
  assert.match(runner, /async function resolveCaptureRoute\(baseUrl, target, session\)/);
  assert.match(runner, /\/api\/v1\/chat\/rooms/);
  assert.match(runner, /await waitForWalkthroughSettled\(page\);\s*await page\.screenshot/s);
  assert.match(runner, /auditInteractiveAffordances,/);
  assert.match(lib, /export async function auditInteractiveAffordances\(page\)/);
  assert.match(lib, /main a\[href\]:visible/);
  assert.match(runner, /functional-affordance-audit/);
  assert.match(runner, /function-probe/);
  assert.match(runner, /buildFunctionalProbeResults/);
  assert.match(runner, /findWalkthroughFindings/);
  assert.match(runner, /for \(const target of targets\)[\s\S]*chromium\.launch/);
  assert.match(lib, /click\(\{\s*trial:\s*true/s);
  assert.match(lib, /functional-actionability/);
  assert.match(runner, /document\.querySelector\('\.tm-app-frame'\)/);
  assert.match(runner, /Rendering/);
  assert.match(runner, /Checking your session/);
});

test('Given browser signals occur When route walkthrough captures a route Then they are blocking findings', async () => {
  const runner = await readFile('scripts/qa/v1-route-walkthrough.mjs', 'utf8');

  assert.match(runner, /page\.on\('pageerror'/);
  assert.match(runner, /page\.on\('console'/);
  assert.match(runner, /page\.on\('requestfailed'/);
  assert.match(runner, /page\.on\('response'/);
  assert.match(runner, /check:\s*'console-error'/);
  assert.match(runner, /check:\s*'response-error'/);
  assert.match(runner, /check:\s*'request-failed'/);
});

test('Given route metrics When functional honesty is evaluated Then clipping and stale fixture links are blocking findings', () => {
  const metrics = {
    horizontalOverflow: false,
    deadLinks: [],
    textClipping: [{ text: 'clipped', className: 'tm-text-label' }],
    unsupportedSuccessText: false,
    actionCount: 1,
    bottomNavVisible: false,
    links: [{ text: '', href: '/matches/match-1' }],
    buttons: [],
    inputs: [],
    forms: 0,
    affordanceAudit: { failures: [], visibleInteractive: 1 },
  };
  const functionProbeResults = buildFunctionalProbeResults({ route: '/matches/[id]/edit', metrics });

  const findings = findWalkthroughFindings({
    target: { route: '/matches/[id]/edit', authMode: 'authenticated' },
    viewport: { name: '1440x900', width: 1440 },
    metrics,
    functionProbeResults,
  });

  assert.equal(findings.some((finding) => finding.check === 'text-clipping' && finding.level === 'blocking'), true);
  assert.equal(findings.some((finding) => finding.check === 'stale-fixture-link' && finding.level === 'blocking'), true);
});
