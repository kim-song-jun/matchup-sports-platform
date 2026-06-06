import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { normalizeDevLoginSession, setV1SessionLocalStorage } from './v1-open-design-auth.mjs';

const options = parseArgs(process.argv.slice(2));
const baseUrl = options.baseUrl ?? 'http://localhost:3013';
const outDir = options.out ?? 'evidence/open-design-rebuild-final';
const routes = ['/matches', '/team-matches', '/teams', '/my', '/search?q=풋살'];

if (!baseUrl.startsWith('http://localhost:3013')) {
  throw new Error(`v1 function map must target http://localhost:3013, got ${baseUrl}`);
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await authenticateIfNeeded(page, baseUrl, route);
    await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'networkidle', timeout: 20_000 }).catch(async () => {
      await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 20_000 });
    });
    const result = await page.evaluate(() => {
      const hrefs = Array.from(document.querySelectorAll('a[href]')).map((node) => node.getAttribute('href') ?? '');
      const buttons = Array.from(document.querySelectorAll('button')).map((node) => (node.textContent ?? node.getAttribute('aria-label') ?? '').trim()).filter(Boolean);
      const deadLinks = hrefs.filter((href) => href === '#' || href.startsWith('file:') || href.endsWith('.html'));
      return {
        hrefs,
        buttons,
        deadLinks,
        hasSearchInput: Boolean(document.querySelector('input[aria-label*="검색"], .tm-search-input, .tm-list-search-field')),
        hasCreateAction: hrefs.some((href) => /\/new|\/matches\/new|\/team-matches\/new|\/teams\/new/.test(href)),
        hasFilterAction: hrefs.some((href) => href.includes('filter')) || buttons.some((label) => label.includes('필터')),
      };
    });
    const issues = [];
    if (result.deadLinks.length > 0) issues.push(`dead desktop links: ${result.deadLinks.join(', ')}`);
    if (route !== '/my' && !result.hasSearchInput) issues.push('search input missing');
    if (route !== '/search?q=풋살' && route !== '/my' && !result.hasCreateAction) issues.push('create action missing');
    if ((route === '/matches' || route === '/team-matches' || route === '/teams') && !result.hasFilterAction) issues.push('filter action missing');
    results.push({ route, ...result, issues });
    await page.close();
  }
} finally {
  await browser.close();
}

const healthResponse = await fetch('http://localhost:8121/api/v1/health');
const healthBody = await healthResponse.text();
await writeFile(path.join(outDir, 'backend-health.txt'), `HTTP ${healthResponse.status}\n${healthBody}\n`);

const summary = {
  baseUrl,
  routes,
  backendHealthy: healthResponse.ok && healthBody.includes('"db":true'),
  results,
  failures: results.filter((result) => result.issues.length > 0),
};

if (!summary.backendHealthy) {
  summary.failures.push({ route: 'backend', issues: ['backend health is not 200 db true'] });
}

await writeFile(path.join(outDir, 'function-map.json'), `${JSON.stringify(summary, null, 2)}\n`);

if (summary.failures.length > 0) {
  console.error(JSON.stringify(summary.failures, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'pass', evidence: path.join(outDir, 'function-map.json') }, null, 2));

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--base-url') parsed.baseUrl = args[++index];
    else if (token === '--out') parsed.out = args[++index];
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
