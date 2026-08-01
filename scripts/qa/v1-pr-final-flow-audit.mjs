/**
 * V1 PR-final visual/functional route audit.
 *
 * Captures every apps/v1_web page route across mobile/tablet/desktop and writes
 * screenshot + runtime evidence for PR review. This runner intentionally uses
 * the v1 dev-auth contract (`teameet.v1.userEmail`) instead of legacy Bearer
 * token helpers.
 *
 * Usage:
 *   node scripts/qa/v1-pr-final-flow-audit.mjs
 *
 * Optional env:
 *   V1_WEB_BASE=http://localhost:3013/v1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const APP_DIR = path.join(REPO_ROOT, 'apps', 'v1_web', 'src', 'app');
const WEB_BASE = (process.env.V1_WEB_BASE ?? 'http://localhost:3013/v1').replace(/\/$/, '');
const BASE_PATH = new URL(WEB_BASE).pathname.replace(/\/$/, '');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUTPUT_DIR = path.join(REPO_ROOT, 'output', 'playwright', 'visual-audit', `v1-pr-final-${STAMP}`);

const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
  { key: 'tablet', width: 768, height: 1024, isMobile: false, hasTouch: true },
  { key: 'desktop', width: 1280, height: 900, isMobile: false, hasTouch: false },
];

const PERSONAS = {
  guest: { email: null },
  user: { email: 'host@teameet.v1' },
  teamOwner: { email: 'owner@teameet.v1' },
  admin: { email: 'admin@teameet.v1' },
};

const KNOWN_IDS = {
  tournamentId: 'dcce32e8-834f-450b-94a7-feb7186e99df',
  teamId: '29732f9e-16ce-4101-b1fb-cc0f98ac44ed',
};

const COPY_RISK_PATTERNS = [
  'V1 authentication is required',
  '커버리지',
  '만료 표시',
  '고정 공지',
  '대회 후 허브',
  '준비 중이에요',
  'AI',
];

const DYNAMIC_RESOLVERS = {
  '/matches/[id]': { source: '/matches', pattern: /^\/matches\/(?!new(?:\/|$))[^/]+$/ },
  '/matches/[id]/edit': { source: '/my/matches/created', pattern: /^\/matches\/[^/]+\/edit$/ },
  '/matches/[id]/applications': { source: '/my/matches/created', pattern: /^\/matches\/[^/]+\/applications$/ },
  '/team-matches/[id]': { source: '/team-matches', pattern: /^\/team-matches\/(?!new(?:\/|$))[^/]+$/ },
  '/team-matches/[id]/edit': { source: '/team-matches', pattern: /^\/team-matches\/[^/]+\/edit$/ },
  '/teams/[id]': { known: `/teams/${KNOWN_IDS.teamId}` },
  '/teams/[id]/members': { known: `/teams/${KNOWN_IDS.teamId}/members` },
  '/teams/[id]/edit': { known: `/teams/${KNOWN_IDS.teamId}/edit` },
  '/my/teams/[id]': { known: `/my/teams/${KNOWN_IDS.teamId}` },
  '/my/teams/[id]/members': { known: `/my/teams/${KNOWN_IDS.teamId}/members` },
  '/notices/[id]': { source: '/notices', pattern: /^\/notices\/[^/]+$/ },
  '/chat/[id]': { source: '/chat', pattern: /^\/chat\/[^/]+$/ },
  '/my/reviews/[sourceType]/[sourceId]': { source: '/my/reviews', pattern: /^\/my\/reviews\/[^/]+\/[^/]+$/ },
  '/tournaments/[id]': { known: `/tournaments/${KNOWN_IDS.tournamentId}` },
  '/tournaments/[id]/apply': { known: `/tournaments/${KNOWN_IDS.tournamentId}/apply` },
  '/tournaments/[id]/my': { known: `/tournaments/${KNOWN_IDS.tournamentId}/my` },
  '/tournaments/[id]/registrations/[registrationId]/roster': {
    source: `/tournaments/${KNOWN_IDS.tournamentId}/my`,
    pattern: /^\/tournaments\/[^/]+\/registrations\/[^/]+\/roster$/,
  },
  '/admin/tournaments/[id]': { known: `/admin/tournaments/${KNOWN_IDS.tournamentId}` },
};

function collectPageFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectPageFiles(full));
      continue;
    }

    if (entry.isFile() && entry.name === 'page.tsx') files.push(full);
  }

  return files;
}

function routeTemplateFromPageFile(file) {
  const relative = path.relative(APP_DIR, file);
  if (relative === 'page.tsx') return '/';

  const segments = relative
    .replace(/\/page\.tsx$/, '')
    .split(path.sep)
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));

  return segments.length ? `/${segments.join('/')}` : '/';
}

function slugify(value) {
  if (value === '/') return 'root';
  return value
    .replace(/^\//, '')
    .replace(/\//g, '__')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .toLowerCase();
}

function personaForRoute(template) {
  if (template.startsWith('/admin')) return 'admin';
  if (
    template === '/' ||
    template.startsWith('/landing') ||
    template.startsWith('/login') ||
    template.startsWith('/signup') ||
    template.startsWith('/terms') ||
    template.startsWith('/auth') ||
    template.startsWith('/callback')
  ) {
    return 'guest';
  }
  if (template.startsWith('/teams') || template.startsWith('/team-matches') || template.startsWith('/my/teams') || template.startsWith('/tournaments')) {
    return 'teamOwner';
  }
  return 'user';
}

function normalizePathFromHref(href) {
  if (!href) return null;
  try {
    const url = new URL(href, WEB_BASE);
    let pathname = url.pathname;
    if (BASE_PATH && pathname.startsWith(`${BASE_PATH}/`)) pathname = pathname.slice(BASE_PATH.length);
    if (BASE_PATH && pathname === BASE_PATH) pathname = '/';
    return `${pathname}${url.search}`;
  } catch {
    return null;
  }
}

async function installSession(context, personaKey) {
  const persona = PERSONAS[personaKey] ?? PERSONAS.user;
  await context.addInitScript((email) => {
    try {
      if (email) {
        window.localStorage.setItem('teameet.v1.userEmail', email);
        window.localStorage.removeItem('teameet.v1.userId');
      } else {
        window.localStorage.removeItem('teameet.v1.userEmail');
        window.localStorage.removeItem('teameet.v1.userId');
      }
    } catch {
      /* Playwright storage can be unavailable on browser error pages. */
    }
  }, persona.email);
}

async function resolveFromSource(page, spec) {
  await page.goto(`${WEB_BASE}${spec.source}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 7_000 }).catch(() => {});
  await page.waitForTimeout(600);

  const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]'), (node) => node.href));
  for (const href of hrefs) {
    const normalized = normalizePathFromHref(href);
    if (normalized && spec.pattern.test(normalized.split('?')[0])) return normalized;
  }

  return null;
}

async function resolveRoutes(browser, routeTemplates) {
  const resolved = new Map();
  const unresolved = [];
  const contextCache = new Map();

  async function pageForPersona(personaKey) {
    if (contextCache.has(personaKey)) return contextCache.get(personaKey);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await installSession(context, personaKey);
    const page = await context.newPage();
    contextCache.set(personaKey, { context, page });
    return { context, page };
  }

  for (const template of routeTemplates) {
    if (!template.includes('[')) {
      resolved.set(template, template);
      continue;
    }

    const spec = DYNAMIC_RESOLVERS[template];
    if (!spec) {
      unresolved.push({ template, reason: 'no resolver spec' });
      continue;
    }

    if (spec.known) {
      resolved.set(template, spec.known);
      continue;
    }

    const personaKey = personaForRoute(template);
    const { page } = await pageForPersona(personaKey);
    const route = await resolveFromSource(page, spec).catch((error) => {
      unresolved.push({ template, source: spec.source, reason: error.message });
      return null;
    });

    if (route) resolved.set(template, route);
    else unresolved.push({ template, source: spec.source, reason: 'no matching link found' });
  }

  await Promise.all(Array.from(contextCache.values(), ({ context }) => context.close()));
  return { resolved, unresolved };
}

async function captureRoute({ context, viewport, route, template, personaKey, index, total }) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const apiProblems = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
  });
  page.on('pageerror', (error) => pageErrors.push(error.message.slice(0, 500)));
  page.on('requestfailed', (request) => {
    requestFailures.push({ url: request.url(), failure: request.failure()?.errorText ?? 'request failed' });
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400 && response.url().includes('/api/v1/')) {
      apiProblems.push({ status, url: response.url().replace(WEB_BASE, '') });
    }
  });

  const fileName = `${String(index).padStart(3, '0')}_${slugify(template)}__${slugify(route)}.png`;
  const filePath = path.join(OUTPUT_DIR, viewport.key, fileName);
  const fullUrl = `${WEB_BASE}${route}`;

  let navigationError = null;
  try {
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 7_000 }).catch(() => {});
    await page.waitForTimeout(700);
  } catch (error) {
    navigationError = error.message;
  }

  let metrics = null;
  try {
    metrics = await page.evaluate((copyRiskPatterns) => {
      const doc = document.documentElement;
      const body = document.body;
      const text = (body?.innerText ?? '').replace(/\s+/g, ' ').trim();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth ?? 0);
      const scrollHeight = Math.max(doc.scrollHeight, body?.scrollHeight ?? 0);
      const brokenImages = Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).length;
      const riskCopy = copyRiskPatterns.filter((pattern) => text.includes(pattern));

      return {
        title: document.title,
        url: window.location.href,
        viewportWidth,
        viewportHeight,
        scrollWidth,
        scrollHeight,
        overflowX: Math.max(0, scrollWidth - viewportWidth),
        hasAuthWall: Boolean(document.querySelector('[data-testid="auth-wall"], [data-testid="admin-auth-wall"]')),
        hasAlert: Boolean(document.querySelector('[role="alert"]')),
        hasVisibleMain: Boolean(document.querySelector('main')),
        brokenImages,
        riskCopy,
        textSample: text.slice(0, 260),
      };
    }, COPY_RISK_PATTERNS);
  } catch (error) {
    metrics = { evaluateError: error.message };
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let screenshotError = null;
  try {
    await page.screenshot({ path: filePath, fullPage: true });
  } catch (error) {
    screenshotError = error.message;
  }
  await page.close();

  const flags = [];
  if (navigationError) flags.push('navigation-error');
  if (screenshotError) flags.push('screenshot-error');
  if ((metrics?.overflowX ?? 0) > 2) flags.push('horizontal-overflow');
  if (metrics?.hasAuthWall && personaKey !== 'guest') flags.push('unexpected-auth-wall');
  if (metrics?.hasAlert) flags.push('visible-alert');
  if ((metrics?.brokenImages ?? 0) > 0) flags.push('broken-images');
  if (consoleErrors.length > 0) flags.push('console-errors');
  if (pageErrors.length > 0) flags.push('page-errors');
  if (apiProblems.length > 0) flags.push('api-errors');
  if ((metrics?.riskCopy ?? []).length > 0) flags.push('copy-risk');

  return {
    template,
    route,
    personaKey,
    viewport: viewport.key,
    status: flags.length ? 'needs-review' : 'ok',
    flags,
    screenshot: path.relative(REPO_ROOT, filePath),
    navigationError,
    screenshotError,
    metrics,
    consoleErrors,
    pageErrors,
    requestFailures: requestFailures.slice(0, 10),
    apiProblems: apiProblems.slice(0, 10),
    index,
    total,
  };
}

async function runInteractionChecks(browser) {
  const checks = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await installSession(context, 'teamOwner');
  const page = await context.newPage();
  const outDir = path.join(OUTPUT_DIR, 'interactions');
  fs.mkdirSync(outDir, { recursive: true });

  async function record(name, fn) {
    const result = { name, status: 'ok', details: null, screenshot: null };
    try {
      result.details = await fn();
      const screenshot = path.join(outDir, `${slugify(name)}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      result.screenshot = path.relative(REPO_ROOT, screenshot);
    } catch (error) {
      result.status = 'failed';
      result.details = error.message;
    }
    checks.push(result);
  }

  await record('search quick condition toggle', async () => {
    await page.goto(`${WEB_BASE}/search`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const button = page.getByRole('button', { name: /마감임박/ }).first();
    await button.click();
    await page.waitForTimeout(500);
    const pressed = await button.getAttribute('aria-pressed').catch(() => null);
    return { url: page.url(), ariaPressed: pressed };
  });

  await record('matches type segment team', async () => {
    await page.goto(`${WEB_BASE}/matches`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.getByRole('tab', { name: '팀' }).click();
    await page.waitForTimeout(800);
    return { url: page.url(), text: (await page.locator('body').innerText()).slice(0, 180) };
  });

  await record('tournament list first card navigation', async () => {
    await page.goto(`${WEB_BASE}/tournaments`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const href = await page.locator('a[href^="/v1/tournaments/"], a[href^="/tournaments/"]').first().getAttribute('href');
    if (!href) throw new Error('No tournament detail link found');
    await page.locator('a[href^="/v1/tournaments/"], a[href^="/tournaments/"]').first().click();
    await page.waitForURL(/\/tournaments\/[^/]+/, { timeout: 15_000 });
    return { href, url: page.url() };
  });

  await record('tournament detail apply entry', async () => {
    await page.goto(`${WEB_BASE}/tournaments/${KNOWN_IDS.tournamentId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.getByRole('link', { name: /참가 신청|팀으로 참가 신청|신청/ }).first().click();
    await page.waitForURL(/\/tournaments\/[^/]+\/apply/, { timeout: 15_000 });
    return { url: page.url() };
  });

  await record('team detail members entry', async () => {
    await page.goto(`${WEB_BASE}/teams/${KNOWN_IDS.teamId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const link = page.locator('a[href$="/members"]').first();
    const href = await link.getAttribute('href');
    if (!href) throw new Error('No members link found');
    await link.click();
    await page.waitForURL(/\/teams\/[^/]+\/members/, { timeout: 15_000 });
    return { href, url: page.url() };
  });

  await context.close();
  return checks;
}

function writeSummary({ catalog, unresolved, results, interactions }) {
  const byStatus = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  const flagged = results.filter((item) => item.status !== 'ok');
  const unresolvedLines = unresolved.map((item) => `- ${item.template}: ${item.reason}${item.source ? ` (source: ${item.source})` : ''}`);
  const flaggedLines = flagged.slice(0, 120).map((item) => {
    const flags = item.flags.join(', ');
    return `- ${item.viewport} ${item.template} -> ${item.route}: ${flags} (${item.screenshot})`;
  });
  const interactionLines = interactions.map((item) => `- [${item.status}] ${item.name}: ${typeof item.details === 'string' ? item.details : JSON.stringify(item.details)}${item.screenshot ? ` (${item.screenshot})` : ''}`);

  const summary = [
    `# V1 PR-final flow audit`,
    ``,
    `- Timestamp: ${STAMP}`,
    `- Web base: ${WEB_BASE}`,
    `- Page templates discovered: ${catalog.length}`,
    `- Viewports: ${VIEWPORTS.map((item) => `${item.key} ${item.width}x${item.height}`).join(', ')}`,
    `- Captures attempted: ${results.length}`,
    `- Status: ${Object.entries(byStatus).map(([key, value]) => `${key} ${value}`).join(' / ') || 'none'}`,
    `- Unresolved dynamic routes: ${unresolved.length}`,
    ``,
    `## Unresolved Dynamic Routes`,
    ``,
    unresolvedLines.length ? unresolvedLines.join('\n') : '- None',
    ``,
    `## Needs Review`,
    ``,
    flaggedLines.length ? flaggedLines.join('\n') : '- None',
    flagged.length > flaggedLines.length ? `\n- ...and ${flagged.length - flaggedLines.length} more in manifest.json` : '',
    ``,
    `## Interaction Checks`,
    ``,
    interactionLines.length ? interactionLines.join('\n') : '- None',
    ``,
    `## Screenshot Root`,
    ``,
    path.relative(REPO_ROOT, OUTPUT_DIR),
    ``,
  ].join('\n');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'summary.md'), summary);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) fs.mkdirSync(path.join(OUTPUT_DIR, viewport.key), { recursive: true });

  const catalog = collectPageFiles(APP_DIR)
    .map(routeTemplateFromPageFile)
    .sort((a, b) => a.localeCompare(b))
    .map((template) => ({
      template,
      personaKey: personaForRoute(template),
      dynamic: template.includes('['),
    }));

  const browser = await chromium.launch({ headless: true });
  const { resolved, unresolved } = await resolveRoutes(browser, catalog.map((item) => item.template));

  const results = [];
  let index = 0;
  const total = catalog.filter((item) => resolved.has(item.template)).length * VIEWPORTS.length;

  for (const viewport of VIEWPORTS) {
    const contextByPersona = new Map();
    async function getContext(personaKey) {
      if (contextByPersona.has(personaKey)) return contextByPersona.get(personaKey);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.key === 'desktop' ? 1 : 2,
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
      });
      await installSession(context, personaKey);
      contextByPersona.set(personaKey, context);
      return context;
    }

    for (const item of catalog) {
      const route = resolved.get(item.template);
      if (!route) continue;
      index += 1;
      const context = await getContext(item.personaKey);
      const result = await captureRoute({
        context,
        viewport,
        route,
        template: item.template,
        personaKey: item.personaKey,
        index,
        total,
      });
      results.push(result);
      console.log(`[${index}/${total}] ${result.status.toUpperCase()} ${viewport.key} ${item.template} -> ${route}`);
    }

    await Promise.all(Array.from(contextByPersona.values(), (context) => context.close()));
  }

  const interactions = await runInteractionChecks(browser);
  await browser.close();

  const manifest = {
    timestamp: STAMP,
    webBase: WEB_BASE,
    outputDir: path.relative(REPO_ROOT, OUTPUT_DIR),
    catalog,
    unresolved,
    results,
    interactions,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  writeSummary({ catalog, unresolved, results, interactions });

  const ok = results.filter((item) => item.status === 'ok').length;
  const needsReview = results.length - ok;
  console.log(`\nDone. ${ok} ok / ${needsReview} needs-review / ${unresolved.length} unresolved`);
  console.log(path.join(OUTPUT_DIR, 'summary.md'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
