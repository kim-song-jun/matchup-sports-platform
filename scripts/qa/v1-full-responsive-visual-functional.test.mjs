import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEFAULT_FULL_RESPONSIVE_VIEWPORTS,
  buildFullResponsiveConfig,
  buildFullResponsiveTargets,
  findFullResponsiveFindings,
} from './v1-full-responsive-visual-functional.mjs';
import { readFeatureRows } from './v1-open-design-parity-lib.mjs';

const css = await readFile('apps/v1_web/src/app/globals.css', 'utf8');

test('Given Task 99 contract When config is built Then all mobile-tablet-desktop boundary viewports are included by default', () => {
  const config = buildFullResponsiveConfig([
    '--base-url',
    'http://localhost:3013',
    '--out',
    'output/playwright/visual-audit/task99-full-responsive-qa-20260606/test',
    '--json',
    'evidence/task99-full-responsive-qa-20260606/test.json',
  ]);

  assert.deepEqual(
    config.viewports.map((viewport) => viewport.width),
    [390, 768, 900, 1023, 1024, 1180, 1280, 1440, 1920],
  );
  assert.equal(DEFAULT_FULL_RESPONSIVE_VIEWPORTS, '390x844,768x1024,900x1024,1023x1024,1024x900,1180x900,1280x900,1440x960,1920x1080');
  assert.equal(config.matrix, 'docs/scenarios/13-v1-open-design-recovery-from-zero.md');
});

test('Given current Open Design route matrix When full responsive targets are built Then every implemented route gets every Task 99 viewport', async () => {
  const rows = await readFeatureRows('docs/scenarios/13-v1-open-design-recovery-from-zero.md');
  const config = buildFullResponsiveConfig([]);
  const targets = buildFullResponsiveTargets({ config, rows });

  assert.equal(targets.length, 87);
  assert.equal(targets.every((target) => target.viewports.length === 9), true);
  assert.equal(targets.some((target) => target.route === '/matches'), true);
  assert.equal(targets.some((target) => target.route === '/team-matches'), true);
  assert.equal(targets.some((target) => target.route === '/teams'), true);
  assert.equal(targets.some((target) => target.route === '/my/matches/created'), true);
});

test('Given problematic layout metrics When findings are evaluated Then user-reported responsive failures are blocking', () => {
  const findings = findFullResponsiveFindings({
    target: { route: '/matches', family: 'personal-match', authMode: 'public' },
    viewport: { name: '1024x900', width: 1024, height: 900 },
    metrics: {
      appFrameVisible: true,
      appWidth: 960,
      horizontalOverflow: true,
      desktopNavVisible: false,
      bottomNavVisible: true,
      floatingFabVisible: true,
      filterRailVisible: true,
      filterButtonVisible: false,
      searchVisible: false,
      deadLinks: [{ href: '#', text: 'dead' }],
      textClipping: [{ text: 'clipped', className: 'tm-chip' }],
      actionCount: 0,
      affordanceAudit: { failures: [{ text: 'blocked' }], visibleInteractive: 1 },
      unsupportedSuccessText: false,
    },
    functionProbeResults: [{ check: 'functional-actionability', status: 'fail', failures: [{ text: 'blocked' }] }],
  });

  assert.deepEqual(findings.map((finding) => finding.check), [
    'horizontal-overflow',
    'text-clipping',
    'dead-links',
    'function-affordance',
    'desktop-app-frame-fluidity',
    'desktop-chrome',
    'desktop-chrome',
    'desktop-chrome',
    'list-search',
    'filter-rail',
    'filter-button',
    'functional-actionability',
  ]);
});

test('Given CLI list mode When executed Then route manifest is emitted without launching browser capture', () => {
  const result = spawnSync(process.execPath, [
    'scripts/qa/v1-full-responsive-visual-functional.mjs',
    '--list',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.routeCount, 87);
  assert.deepEqual(body.viewports.map((viewport) => viewport.width), [390, 768, 900, 1023, 1024, 1180, 1280, 1440, 1920]);
});

test('Given teams search state at desktop boundary When CSS is inspected Then team cards do not compress into clipped three-column titles', () => {
  const narrowDesktopCss = blockFor('@media (min-width: 1024px) and (max-width: 1180px)');
  const fullDesktopCss = blockFor('@media (min-width: 1181px)');

  assert.match(
    narrowDesktopCss,
    /\.tm-app-frame-wide \.tm-team-state-desktop-lane \.tm-team-card-stack\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
    'teams search/state route should keep two team columns at 1024-1180 instead of inheriting cramped three-column cards',
  );
  assert.match(
    fullDesktopCss,
    /\.tm-app-frame-wide \.tm-team-state-desktop-lane \.tm-team-card-stack\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(294px,\s*1fr\)\)/s,
    'teams search/state route should use the same roomy auto-fit card minimum as the team list on full desktop',
  );
});

test('Given long family browser sweeps When runner is inspected Then each route target gets an isolated browser lifecycle', async () => {
  const runner = await readFile('scripts/qa/v1-full-responsive-visual-functional.mjs', 'utf8');

  assert.match(
    runner,
    /runTarget\(\{[\s\S]*chromium[\s\S]*for \(const viewport of target\.viewports\)[\s\S]*chromium\.launch/s,
    'full responsive sweeps should launch per viewport so one closed Chromium context cannot abort the remaining route viewports',
  );
  assert.doesNotMatch(
    runner,
    /const browser = await chromium\.launch[\s\S]*for \(const target of targets\)/s,
    'full responsive sweeps should not keep one browser open for an entire large family',
  );
  assert.match(
    runner,
    /getDevLoginSession\(authSessionCache,\s*target\.route\)/,
    'authenticated sweeps should choose the QA account from the current route instead of reusing one global host session',
  );
  assert.match(
    runner,
    /const email = emailForRoute\(route\)/,
    'admin routes should use the admin dev-login account so admin API checks do not fail with host 403s',
  );
  assert.match(
    runner,
    /let page;[\s\S]*try \{[\s\S]*page = await browser\.newPage/s,
    'newPage failures should be captured as route findings instead of crashing before JSON is written',
  );
});

function blockFor(header) {
  const start = css.indexOf(`${header} {`);
  assert.notEqual(start, -1, `Missing CSS block: ${header}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    const char = css[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  throw new Error(`Unclosed CSS block: ${header}`);
}
