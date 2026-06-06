import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { normalizeDevLoginSession, setV1SessionLocalStorage } from './v1-open-design-auth.mjs';

const DEFAULT_ROUTES = ['/home', '/matches', '/team-matches', '/teams', '/my', '/search'];
const options = parseArgs(process.argv.slice(2));
const baseUrl = options.baseUrl ?? 'http://localhost:3013';
const outDir = options.out ?? 'evidence/open-design-rebuild-final';
const routes = options.routes ?? DEFAULT_ROUTES;
const viewport = { width: 390, height: 844 };

if (!baseUrl.startsWith('http://localhost:3013')) {
  throw new Error(`v1 mobile audit must target http://localhost:3013, got ${baseUrl}`);
}

await mkdir(outDir, { recursive: true });
await mkdir(path.join(outDir, 'screenshots'), { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const route of routes) {
    const page = await browser.newPage({ viewport });
    await authenticateIfNeeded(page, baseUrl, route);
    await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'networkidle', timeout: 20_000 }).catch(async () => {
      await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 20_000 });
    });
    const screenshot = path.join(outDir, 'screenshots', `mobile_${slug(route)}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const metrics = await page.evaluate(() => {
      const app = document.querySelector('.tm-app-frame, .tm-search-frame');
      const nav = document.querySelector('.tm-desktop-nav');
      const bottom = document.querySelector('.tm-bottom-nav');
      const fixedCta = document.querySelector('.tm-fixed-cta');
      const appRect = app?.getBoundingClientRect();
      const ctaRect = fixedCta?.getBoundingClientRect();
      return {
        appWidth: appRect ? Math.round(appRect.width) : 0,
        desktopNavVisible: Boolean(nav) && getComputedStyle(nav).display !== 'none',
        bottomNavVisible: Boolean(bottom) && getComputedStyle(bottom).display !== 'none',
        bottomNavLinks: bottom ? bottom.querySelectorAll('a').length : 0,
        fixedCtaReachable: !fixedCta || (ctaRect ? ctaRect.bottom <= window.innerHeight + 2 && ctaRect.top >= 0 : true),
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
      };
    });
    const requiresBottomNav = route !== '/search';
    const issues = [];
    if (metrics.appWidth > 480) issues.push(`mobile app is wider than mobile shell: ${metrics.appWidth}`);
    if (metrics.desktopNavVisible) issues.push('desktop nav is visible on mobile');
    if (requiresBottomNav && !metrics.bottomNavVisible) issues.push('mobile bottom nav is missing');
    if (requiresBottomNav && metrics.bottomNavLinks !== 5) issues.push(`expected 5 bottom nav links, got ${metrics.bottomNavLinks}`);
    if (!metrics.fixedCtaReachable) issues.push('fixed CTA is not reachable in viewport');
    if (metrics.overflowX) issues.push('horizontal overflow detected');
    results.push({ route, screenshot, ...metrics, issues });
    await page.close();
  }
} finally {
  await browser.close();
}

const summary = {
  baseUrl,
  viewport,
  routes,
  results,
  failures: results.filter((result) => result.issues.length > 0),
};

await writeFile(path.join(outDir, 'mobile-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

if (summary.failures.length > 0) {
  console.error(JSON.stringify(summary.failures, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'pass', evidence: path.join(outDir, 'mobile-summary.json') }, null, 2));

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--base-url') parsed.baseUrl = args[++index];
    else if (token === '--out') parsed.out = args[++index];
    else if (token === '--routes') parsed.routes = (args[++index] ?? '').split(',').filter(Boolean);
  }
  return parsed;
}

async function authenticateIfNeeded(page, baseUrl, route) {
  if (!route.startsWith('/my')) return;
  const response = await fetch('http://localhost:8121/api/v1/auth/dev-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'host@teameet.v1' }),
  });
  if (!response.ok) return;
  const body = await response.json();
  const session = normalizeDevLoginSession(body);
  await page.goto(new URL('/home', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await setV1SessionLocalStorage(page, session);
}

function slug(route) {
  return route === '/' ? 'root' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_');
}
