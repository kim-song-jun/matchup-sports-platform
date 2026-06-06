import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { normalizeDevLoginSession, setV1SessionLocalStorage, v1SessionHeaders } from './v1-open-design-auth.mjs';
import { DEFAULT_OPEN_DESIGN_ROOT, emailForRoute, isProtectedRoute } from './v1-open-design-parity-lib.mjs';
import {
  buildDesktopVisualConfig,
  buildDesktopVisualRouteManifest,
  buildRouteVisualExpectations,
  isDesktopViewport,
} from './v1-open-design-desktop-visual-lib.mjs';

const config = buildDesktopVisualConfig(process.argv.slice(2));
const manifest = await buildDesktopVisualRouteManifest(config);

if (config.listOnly) {
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(0);
}

const { baseUrl, outDir, routes, viewports } = manifest;

await mkdir(outDir, { recursive: true });
await mkdir(path.join(outDir, 'screenshots'), { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport });
      await authenticateIfNeeded(page, baseUrl, route);
      const url = new URL(route, baseUrl).toString();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 }).catch(async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      });
      const screenshot = path.join(outDir, 'screenshots', `${viewport.name}_${slug(route)}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      const metrics = await page.evaluate(() => {
        const visible = (element) => {
          if (!element) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const app = document.querySelector('.tm-app-frame');
        const nav = document.querySelector('.tm-desktop-nav');
        const topbar = document.querySelector('.tm-topbar, .tm-search-topbar, .tm-list-searchbar');
        const bottom = document.querySelector('.tm-bottom-nav');
        const fab = document.querySelector('.tm-floating-fab');
        const searchCandidates = [...document.querySelectorAll('input[type="search"], input[aria-label*="검색"], a[aria-label="검색"], .tm-search-input, .tm-list-search-field')];
        const rail = document.querySelector('[data-testid="home-od-right-rail"]');
        const homeLayout = document.querySelector('.tm-home-od-layout');
        const appRect = app?.getBoundingClientRect();
        const navRect = nav?.getBoundingClientRect();
        const layoutRect = homeLayout?.getBoundingClientRect();
        return {
          appWidth: appRect ? Math.round(appRect.width) : 0,
          appLeft: appRect ? Math.round(appRect.left) : null,
          appFrameVisible: visible(app),
          desktopNavVisible: visible(nav),
          desktopNavWidth: navRect ? Math.round(navRect.width) : 0,
          topbarVisible: visible(topbar),
          searchVisible: searchCandidates.some((element) => visible(element)),
          bottomNavVisible: visible(bottom),
          fabVisible: visible(fab),
          homeLayoutWidth: layoutRect ? Math.round(layoutRect.width) : 0,
          homeRightRailVisible: visible(rail),
          overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
        };
      });
      const issues = buildIssues(route, viewport, metrics);
      results.push({ route, viewport, screenshot, ...metrics, issues });
      await page.close();
    }

    await captureOpenDesignReference(browser, outDir, viewport);
  }
} finally {
  await browser.close();
}

const summary = {
  baseUrl,
  viewports,
  routes,
  results,
  failures: results.filter((result) => result.issues.length > 0),
};

await writeFile(path.join(outDir, 'desktop-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

if (summary.failures.length > 0) {
  console.error(JSON.stringify(summary.failures, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'pass', evidence: path.join(outDir, 'desktop-summary.json') }, null, 2));

function buildIssues(route, viewport, metrics) {
  const issues = [];
  const desktop = isDesktopViewport(viewport);
  const expectations = buildRouteVisualExpectations(route);
  const expectedAppWidth = viewport.width;
  const appFrameMeasured = expectations.appFrameRequired || metrics.appFrameVisible;
  if (appFrameMeasured && metrics.appWidth !== expectedAppWidth) {
    issues.push(`expected ${expectedAppWidth}px app workspace, got ${metrics.appWidth}`);
  }
  if (expectations.desktopTopbarRequired && !metrics.topbarVisible) issues.push('topbar is not visible');
  if (expectations.desktopSearchSurfaceRequired && !metrics.searchVisible) issues.push('search input/action surface is not visible');
  if (metrics.overflowX) issues.push('horizontal overflow detected');

  if (desktop) {
    if (appFrameMeasured && !metrics.desktopNavVisible) issues.push('desktop nav is not visible');
    if (appFrameMeasured && metrics.desktopNavWidth !== 240) issues.push(`expected 240px sidebar, got ${metrics.desktopNavWidth}`);
    if (metrics.bottomNavVisible) issues.push('mobile bottom nav is visible on desktop');
    if (metrics.fabVisible) issues.push('mobile FAB is visible on desktop');
    if (expectations.homeRightRailRequired && !metrics.homeRightRailVisible) issues.push('home right rail is not visible on desktop');
    if (expectations.homeRightRailRequired && metrics.homeLayoutWidth < viewport.width - 360) {
      issues.push(`home layout is too narrow for desktop viewport: ${metrics.homeLayoutWidth}`);
    }
    return issues;
  }

  if (metrics.desktopNavVisible) issues.push('desktop nav is visible on mobile');
  if (expectations.mobileBottomNavRequired && !metrics.bottomNavVisible) issues.push('mobile bottom nav is not visible');
  if (expectations.mobileBottomNavForbidden && metrics.bottomNavVisible) issues.push('standalone mobile route shows bottom nav');
  if (expectations.homeMobileFabRequired && !metrics.fabVisible) issues.push('home chat FAB is not visible on mobile');
  if (expectations.homeRightRailRequired && metrics.homeRightRailVisible) issues.push('home desktop right rail is visible on mobile');
  return issues;
}

async function authenticateIfNeeded(page, baseUrl, route) {
  if (!isProtectedRoute(route)) return;
  const email = emailForRoute(route);
  const response = await fetch('http://localhost:8121/api/v1/auth/dev-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`dev-login preflight failed for ${route}: ${response.status} ${text}`);
  }
  const body = JSON.parse(text);
  const session = normalizeDevLoginSession(body, email);
  const authMe = await fetch('http://localhost:8121/api/v1/auth/me', {
    headers: v1SessionHeaders(session),
  });
  if (!authMe.ok) {
    throw new Error(`auth/me preflight failed for ${route}: ${authMe.status} ${await authMe.text()}`);
  }
  await page.goto(new URL('/home', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await setV1SessionLocalStorage(page, session);
}

async function captureOpenDesignReference(browser, outDir, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(pathToFileURL(path.join(DEFAULT_OPEN_DESIGN_ROOT, 'home.html')).href, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.screenshot({ path: path.join(outDir, 'screenshots', `${viewport.name}_open-design_home_reference.png`), fullPage: true });
  await page.close();
}

function slug(route) {
  return route === '/' ? 'root' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_');
}
