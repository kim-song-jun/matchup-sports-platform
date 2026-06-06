import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const DEFAULT_BASE_URL = 'http://localhost:3013';
const DEFAULT_OUT_DIR = 'evidence/desktop-fluid-qa-20260606';
const DEFAULT_SCREENSHOT_DIR = 'output/playwright/visual-audit/desktop-fluid-qa-20260606/intermediate';

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.baseUrl ?? DEFAULT_BASE_URL;
const outDir = args.outDir ?? DEFAULT_OUT_DIR;
const screenshotDir = args.screenshotDir ?? DEFAULT_SCREENSHOT_DIR;
const mode = args.mode ?? 'all';
const viewports = parseViewports(args.viewports ?? '768x900,900x900,1023x900,1024x900,1180x900,1280x900,1440x900,1920x1080');
const routes = parseList(args.routes ?? '/matches,/team-matches,/teams');
const authRoutes = parseList(args.authRoutes ?? '/my/matches/created');
const interactions = args.interactions !== 'false';

await mkdir(outDir, { recursive: true });
await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const routeResults = [];
const authResults = [];
const interactionResults = [];

try {
  if (mode === 'all' || mode === 'routes') {
    for (const route of routes) {
      for (const viewport of viewports) {
        routeResults.push(await captureRoute(browser, route, viewport, false));
      }
    }
  }

  if (mode === 'all' || mode === 'auth') {
    const authViewports = viewports.filter((viewport) => [900, 1023, 1024, 1280].includes(viewport.width));
    for (const route of authRoutes) {
      for (const viewport of authViewports) {
        authResults.push(await captureRoute(browser, route, viewport, true));
      }
    }
  }

  if (interactions && (mode === 'all' || mode === 'interactions')) {
    for (const viewport of viewports.filter((item) => [900, 1023, 1024].includes(item.width))) {
      interactionResults.push(await runMatchInteractions(browser, viewport));
    }
  }
} finally {
  await browser.close();
}

const routeFailures = routeResults.filter((result) => result.issues.length > 0);
const authFailures = authResults.filter((result) => result.issues.length > 0);
const interactionFailures = interactionResults.filter((result) => result.issues.length > 0);

if (routeResults.length) {
  await writeJson(path.join(outDir, args.routesOut ?? 'intermediate-viewport-qa.json'), {
    baseUrl,
    routes,
    viewports,
    results: routeResults,
    failures: routeFailures,
  });
}

if (authResults.length) {
  await writeJson(path.join(outDir, args.authOut ?? 'intermediate-auth-my-qa.json'), {
    baseUrl,
    routes: authRoutes,
    viewports: authResults.map((result) => result.viewport),
    results: authResults,
    failures: authFailures,
  });
}

if (interactionResults.length) {
  await writeJson(path.join(outDir, args.interactionsOut ?? 'intermediate-interactions.json'), {
    baseUrl,
    results: interactionResults,
    failures: interactionFailures,
  });
}

const failures = [...routeFailures, ...authFailures, ...interactionFailures];
if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'pass', outDir, screenshotDir }, null, 2));

async function captureRoute(browser, route, viewport, authenticated) {
  const page = await browser.newPage({ viewport });
  const messages = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) messages.push({ type: message.type(), text: message.text() });
  });
  page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? 'unknown' }));

  try {
    if (authenticated) await seedSession(page);
    const url = new URL(route, baseUrl).toString();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 }).catch(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    });
    await page.waitForTimeout(250);

    const screenshot = path.join(screenshotDir, `${viewport.name}_${slug(route)}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const metrics = await page.evaluate(readLayoutMetrics);
    const issues = buildRouteIssues(route, viewport, metrics, authenticated);
    return { route, viewport, screenshot, authenticated, metrics, messages, failedRequests, issues };
  } finally {
    await page.close();
  }
}

async function runMatchInteractions(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const issues = [];
  try {
    await page.goto(new URL('/matches', baseUrl).toString(), { waitUntil: 'networkidle', timeout: 20_000 }).catch(async () => {
      await page.goto(new URL('/matches', baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 20_000 });
    });
    await page.waitForTimeout(250);

    const search = page.locator('.tm-list-search-field').first();
    if ((await search.count()) === 0) issues.push('search input missing');
    else {
      await search.fill('강남');
      await page.locator('.tm-list-search-submit').first().click();
      await page.waitForTimeout(250);
      if (!page.url().includes('q=%EA%B0%95%EB%82%A8')) issues.push(`search did not update URL: ${page.url()}`);
    }

    await page.goto(new URL('/matches', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    const filter = page.locator('.tm-list-filter-button').first();
    if ((await filter.count()) === 0) issues.push('filter button missing');
    else {
      await filter.click();
      await page.waitForTimeout(250);
      const sheetVisible = await page.locator('.tm-filter-sheet').first().isVisible().catch(() => false);
      if (!sheetVisible && !page.url().includes('filter=1')) issues.push('filter button did not open filter sheet or URL state');
      const sheetBounds = await page.evaluate(readFilterSheetMetrics).catch((error) => ({ error: String(error) }));
      if ('error' in sheetBounds) issues.push(`filter sheet bounds check failed: ${sheetBounds.error}`);
      else if (sheetVisible && sheetBounds.viewportBottomGap > 1) {
        issues.push(`filter overlay leaves bottom gap: ${JSON.stringify(sheetBounds)}`);
      }
    }

    await page.goto(new URL('/matches', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    const sport = page.locator('.tm-sport-chip-row a').nth(1);
    if ((await sport.count()) > 0) {
      const before = page.url();
      await sport.click();
      await page.waitForTimeout(250);
      if (page.url() === before) issues.push('sport chip did not change route state');
    }

    await page.goto(new URL('/matches', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    const create = page.locator('a[aria-label="매치 만들기"], a:has-text("매치 만들기")').first();
    if ((await create.count()) === 0) issues.push('create CTA missing');
    else {
      const href = await create.getAttribute('href');
      if (!href?.startsWith('/matches/new')) issues.push(`create CTA has unexpected href: ${href}`);
    }

    const detail = page.locator('a[aria-label$="상세 보기"]').first();
    if ((await detail.count()) === 0) issues.push('card detail link missing');
    else {
      const href = await detail.getAttribute('href');
      if (!href?.startsWith('/matches/')) issues.push(`detail link has unexpected href: ${href}`);
    }

    const apply = page.locator('a[aria-label$="참가 신청"]').first();
    if ((await apply.count()) === 0) issues.push('card apply link missing');
    else {
      const href = await apply.getAttribute('href');
    if (!href?.includes('intent=apply') && !href?.includes('/apply')) issues.push(`apply link has unexpected href: ${href}`);
    }

    const screenshot = path.join(screenshotDir, `${viewport.name}_matches_interactions.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    return { route: '/matches', viewport, screenshot, issues };
  } finally {
    await page.close();
  }
}

function readLayoutMetrics() {
  const isVisible = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const rectFor = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      bottom: Math.round(rect.bottom),
      right: Math.round(rect.right),
    };
  };
  const styleFor = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      display: style.display,
      position: style.position,
      visibility: style.visibility,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };
  const cards = [...document.querySelectorAll('.tm-match-list-card, .tm-team-match-card, .tm-team-card')].slice(0, 8);
  const cardTops = [...new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top)))];
  const firstRowTop = cardTops[0] ?? null;
  const firstRowCount = firstRowTop === null ? 0 : cards.filter((card) => Math.abs(Math.round(card.getBoundingClientRect().top) - firstRowTop) <= 2).length;
  const cardActions = [...document.querySelectorAll('.tm-match-card-actions a, .tm-team-match-card-actions a, .tm-team-card-actions a')];
  const visibleCardActions = cardActions.filter((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
  const cardActionHitIssues = visibleCardActions.slice(0, 2).flatMap((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    if (centerX < 0 || centerX > window.innerWidth || centerY < 0 || centerY > window.innerHeight) return [];
    const hit = document.elementFromPoint(centerX, centerY);
    const hitLink = hit?.closest?.('a');
    if (hitLink === element || element.contains(hit)) return [];
    return [{
      text: element.textContent?.trim() ?? '',
      href: element.getAttribute('href'),
      rect: {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      },
      hitTag: hit?.tagName ?? null,
      hitClass: typeof hit?.className === 'string' ? hit.className : '',
      hitText: hit?.textContent?.trim().slice(0, 40) ?? '',
      hitHref: hitLink?.getAttribute('href') ?? null,
    }];
  });
  return {
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    appFrame: rectFor('.tm-app-frame'),
    desktopNavVisible: isVisible('.tm-desktop-nav'),
    bottomNavVisible: isVisible('.tm-bottom-nav'),
    floatingFabVisible: isVisible('.tm-floating-fab'),
    filterRailVisible: isVisible('.tm-filter-rail'),
    filterButtonVisible: isVisible('.tm-list-filter-button'),
    filterSheetVisible: isVisible('.tm-filter-sheet'),
    searchVisible: isVisible('.tm-list-search-field'),
    searchbar: styleFor('.tm-list-searchbar'),
    pageHeader: rectFor('.tm-page-header'),
    listGrid: rectFor('.tm-list-grid'),
    filterRail: rectFor('.tm-filter-rail'),
    firstCard: rectFor('.tm-match-list-card, .tm-team-match-card, .tm-team-card'),
    firstRowCardCount: firstRowCount,
    visibleCardActionCount: visibleCardActions.length,
    cardActionHitIssues,
    documentText: document.body.innerText.slice(0, 600),
    activeDataTestIds: [...document.querySelectorAll('[data-testid]')].map((node) => node.getAttribute('data-testid')).filter(Boolean),
  };
}

function readFilterSheetMetrics() {
  const rectFor = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };
  const layer = rectFor('.tm-filter-layer');
  const scrim = rectFor('.tm-filter-scrim');
  const sheet = rectFor('.tm-filter-sheet');
  const bottom = Math.min(
    layer?.bottom ?? window.innerHeight,
    scrim?.bottom ?? window.innerHeight,
    sheet?.bottom ?? window.innerHeight,
  );
  return {
    layer,
    scrim,
    sheet,
    viewportHeight: window.innerHeight,
    viewportBottomGap: Math.max(0, Math.round(window.innerHeight - bottom)),
  };
}

function buildRouteIssues(route, viewport, metrics, authenticated) {
  const issues = [];
  const desktop = viewport.width >= 1024;
  if (metrics.horizontalOverflow) issues.push(`horizontal overflow: scrollWidth ${metrics.scrollWidth}, viewport ${metrics.innerWidth}`);
  if (!metrics.searchVisible && route !== '/my/matches/created') issues.push('search input is not visible');
  if (desktop) {
    if (!metrics.desktopNavVisible) issues.push('desktop nav missing at desktop breakpoint');
    if (metrics.bottomNavVisible) issues.push('mobile bottom nav visible at desktop breakpoint');
    if (metrics.floatingFabVisible) issues.push('mobile FAB visible at desktop breakpoint');
    if (['/matches', '/team-matches', '/teams'].includes(route) && metrics.searchbar?.position === 'sticky') issues.push('desktop searchbar is still sticky/mobile-styled');
    if (['/matches', '/team-matches', '/teams'].includes(route) && viewport.width >= 1181 && !metrics.filterRailVisible) issues.push('desktop filter rail missing at full desktop width');
    if (viewport.width <= 1024 && route === '/team-matches' && metrics.firstRowCardCount > 1) issues.push(`team-match cards are too dense at narrow desktop: ${metrics.firstRowCardCount} columns`);
    if (viewport.width <= 1024 && ['/matches', '/teams'].includes(route) && metrics.firstRowCardCount > 2) issues.push(`cards are too dense at narrow desktop: ${metrics.firstRowCardCount} columns`);
  } else {
    if (metrics.desktopNavVisible) issues.push('desktop nav visible below desktop breakpoint');
    if (!metrics.bottomNavVisible && !authenticated) issues.push('mobile bottom nav missing below desktop breakpoint');
    if (metrics.filterRailVisible) issues.push('persistent filter rail visible below desktop breakpoint');
    if (['/matches', '/team-matches', '/teams'].includes(route) && !metrics.filterButtonVisible) issues.push('mobile/tablet filter button missing');
    if (metrics.appFrame?.width && metrics.appFrame.width < metrics.innerWidth - 4) {
      issues.push(`app frame appears fixed/narrow below desktop breakpoint: ${metrics.appFrame.width}/${metrics.innerWidth}`);
    }
    if (viewport.width >= 768 && ['/matches', '/team-matches', '/teams'].includes(route) && metrics.visibleCardActionCount < 2) {
      issues.push(`tablet card actions are not visible: ${metrics.visibleCardActionCount}`);
    }
  }
  if (viewport.width >= 768 && ['/matches', '/team-matches', '/teams'].includes(route) && metrics.cardActionHitIssues?.length) {
    issues.push(`card action hit targets are obstructed: ${JSON.stringify(metrics.cardActionHitIssues)}`);
  }
  if (authenticated && !metrics.activeDataTestIds.includes('my-matches-open-design')) {
    issues.push('authenticated my matches screen did not hydrate expected surface');
  }
  if (metrics.filterRailVisible && metrics.pageHeader && metrics.filterRail && !desktop && metrics.filterRail.top < metrics.pageHeader.top) {
    issues.push('filter rail is stacked above page header below desktop breakpoint');
  }
  return issues;
}

async function seedSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem('teameet.v1.userEmail', 'host@teameet.v1');
    localStorage.setItem('authUser', JSON.stringify({ email: 'host@teameet.v1', nickname: '호스트민' }));
  });
}

function parseArgs(tokens) {
  const parsed = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = tokens[index + 1];
    if (!next || next.startsWith('--')) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}


function parseViewports(value) {
  return String(value).split(',').filter(Boolean).map((item) => {
    const [widthText, heightText] = item.split('x');
    const width = Number(widthText);
    const height = Number(heightText);
    if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Error(`Invalid viewport: ${item}`);
    return { name: `${width}x${height}`, width, height };
  });
}

function parseList(value) {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function slug(route) {
  return route === '/' ? 'root' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_');
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
