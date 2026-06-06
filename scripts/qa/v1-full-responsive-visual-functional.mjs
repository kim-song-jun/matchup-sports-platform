import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  addV1SessionInit,
  normalizeDevLoginSession,
  v1SessionHeaders,
} from './v1-open-design-auth.mjs';
import {
  DEFAULT_HOST_EMAIL,
  REQUIRED_V1_BASE_URL,
  parseViewports,
  readFeatureRows,
  validateV1BaseUrl,
  writeJson,
} from './v1-open-design-parity-lib.mjs';
import {
  auditInteractiveAffordances,
  buildFunctionalProbeResults,
  buildWalkthroughTargets,
  parseRouteFilter,
} from './v1-route-walkthrough-lib.mjs';

export const DEFAULT_FULL_RESPONSIVE_VIEWPORTS = '390x844,768x1024,900x1024,1023x1024,1024x900,1180x900,1280x900,1440x960,1920x1080';
export const DEFAULT_FULL_RESPONSIVE_MATRIX = 'docs/scenarios/13-v1-open-design-recovery-from-zero.md';
export const DEFAULT_FULL_RESPONSIVE_OUT = 'output/playwright/visual-audit/task99-full-responsive-qa-20260606/full';
export const DEFAULT_FULL_RESPONSIVE_JSON = 'evidence/task99-full-responsive-qa-20260606/full-responsive.json';

const LIST_ROUTE_SET = new Set(['/matches', '/team-matches', '/teams']);

export function buildFullResponsiveConfig(tokens) {
  const args = parseArgs(tokens);
  const baseUrl = args['base-url'] ?? REQUIRED_V1_BASE_URL;
  const baseCheck = validateV1BaseUrl(baseUrl);
  if (!baseCheck.ok) throw new Error(baseCheck.message);

  return {
    baseUrl,
    family: args.family ? String(args.family) : '',
    matrix: args.matrix ?? DEFAULT_FULL_RESPONSIVE_MATRIX,
    routeFilter: parseRouteFilter(args.routes ?? ''),
    viewports: parseViewports(args.viewports ?? DEFAULT_FULL_RESPONSIVE_VIEWPORTS),
    outDir: args.out ?? DEFAULT_FULL_RESPONSIVE_OUT,
    jsonPath: args.json ?? DEFAULT_FULL_RESPONSIVE_JSON,
    listOnly: args.list === true,
  };
}

export function buildFullResponsiveTargets({ config, rows }) {
  const targets = buildWalkthroughTargets({
    evidenceRoot: path.join(path.dirname(config.jsonPath), 'routes'),
    outDir: config.outDir,
    routeFilter: config.routeFilter,
    rows,
    viewports: config.viewports,
  });

  if (!config.family) return targets;
  return targets.filter((target) => target.family === config.family);
}

export function findFullResponsiveFindings({ target, viewport, metrics, functionProbeResults }) {
  const findings = [];
  const desktop = viewport.width >= 1024;
  const fullDesktop = viewport.width >= 1181;
  const listRoute = LIST_ROUTE_SET.has(target.route);

  if (metrics.horizontalOverflow) {
    findings.push({ level: 'blocking', check: 'horizontal-overflow', viewport: viewport.name, message: 'document scrollWidth exceeds viewport width' });
  }
  if (metrics.textClipping.length > 0) {
    findings.push({ level: 'blocking', check: 'text-clipping', viewport: viewport.name, message: `${metrics.textClipping.length} clipped text nodes` });
  }
  if (metrics.deadLinks.length > 0) {
    findings.push({ level: 'blocking', check: 'dead-links', viewport: viewport.name, message: metrics.deadLinks.map((link) => link.href).join(', ') });
  }
  if (metrics.unsupportedSuccessText) {
    findings.push({ level: 'blocking', check: 'unsupported-success', viewport: viewport.name, message: 'unsupported success copy is visible' });
  }
  if (metrics.actionCount === 0) {
    findings.push({ level: 'blocking', check: 'function-affordance', viewport: viewport.name, message: 'no links, buttons, or inputs found' });
  }

  if (desktop && metrics.appFrameVisible && metrics.appWidth < viewport.width - 2) {
    findings.push({
      level: 'blocking',
      check: 'desktop-app-frame-fluidity',
      viewport: viewport.name,
      message: `app frame is fixed/narrow: ${metrics.appWidth}/${viewport.width}`,
    });
  }
  if (!desktop && (listRoute || metrics.appFrameWide) && metrics.appFrameVisible && metrics.appWidth < viewport.width - 4) {
    findings.push({
      level: 'blocking',
      check: 'mobile-tablet-app-frame-fluidity',
      viewport: viewport.name,
      message: `app frame is fixed/narrow below desktop breakpoint: ${metrics.appWidth}/${viewport.width}`,
    });
  }
  if (desktop && metrics.appFrameVisible && !metrics.desktopNavVisible) {
    findings.push({ level: 'blocking', check: 'desktop-chrome', viewport: viewport.name, message: 'desktop nav is not visible at desktop breakpoint' });
  }
  if (desktop && metrics.bottomNavVisible) {
    findings.push({ level: 'blocking', check: 'desktop-chrome', viewport: viewport.name, message: 'mobile bottom nav is visible on desktop' });
  }
  if (desktop && metrics.floatingFabVisible) {
    findings.push({ level: 'blocking', check: 'desktop-chrome', viewport: viewport.name, message: 'mobile floating CTA is visible on desktop' });
  }
  if (!desktop && metrics.desktopNavVisible) {
    findings.push({ level: 'blocking', check: 'mobile-tablet-chrome', viewport: viewport.name, message: 'desktop nav is visible below desktop breakpoint' });
  }

  if (listRoute && !metrics.searchVisible) {
    findings.push({ level: 'blocking', check: 'list-search', viewport: viewport.name, message: 'list search surface is not visible' });
  }
  if (listRoute && !fullDesktop && metrics.filterRailVisible) {
    findings.push({ level: 'blocking', check: 'filter-rail', viewport: viewport.name, message: 'persistent filter rail is visible before full desktop width' });
  }
  if (listRoute && fullDesktop && !metrics.filterRailVisible) {
    findings.push({ level: 'blocking', check: 'filter-rail', viewport: viewport.name, message: 'persistent filter rail is missing on full desktop width' });
  }
  if (listRoute && !fullDesktop && !metrics.filterButtonVisible) {
    findings.push({ level: 'blocking', check: 'filter-button', viewport: viewport.name, message: 'filter button is missing before full desktop rail breakpoint' });
  }

  const failedActionability = functionProbeResults.find((result) => result.check === 'functional-actionability' && result.status === 'fail');
  if (failedActionability) {
    findings.push({
      level: 'blocking',
      check: 'functional-actionability',
      viewport: viewport.name,
      message: `${failedActionability.failures.length} visible controls failed Playwright trial click`,
    });
  }
  const failedPrimary = functionProbeResults.find((result) => result.check === 'primary-action-affordance' && result.status === 'fail');
  if (failedPrimary) {
    findings.push({
      level: 'blocking',
      check: 'primary-action-affordance',
      viewport: viewport.name,
      message: failedPrimary.failures.map(formatProbeFailure).join('; '),
    });
  }

  return findings;
}

export async function runFullResponsiveQa(config) {
  const rows = await readFeatureRows(config.matrix);
  const targets = buildFullResponsiveTargets({ config, rows });

  const { chromium } = await import('playwright');
  await mkdir(config.outDir, { recursive: true });
  const authSessionCache = { session: null };
  const results = [];

  for (const target of targets) {
    const routeResult = await runTarget({ chromium, baseUrl: config.baseUrl, target, authSessionCache });
    results.push(routeResult);
    await writeJson(target.auditPath, routeResult);
  }

  const failures = results.filter((result) => result.verdict !== 'pass');
  const summary = {
    baseUrl: config.baseUrl,
    matrix: config.matrix,
    routes: targets.map((target) => target.route),
    viewports: config.viewports,
    routeCount: targets.length,
    resultCount: results.reduce((sum, result) => sum + result.viewportResults.length, 0),
    results,
    failures,
  };
  await writeJson(config.jsonPath, summary);
  return summary;
}

async function runTarget({ chromium, baseUrl, target, authSessionCache }) {
  const actionLog = [];
  const viewportResults = [];
  const findings = [];

  for (const viewport of target.viewports) {
    const screenshot = target.screenshots.find((item) => item.viewport === viewport.name)?.path;
    if (!screenshot) {
      findings.push({ level: 'blocking', check: 'artifact-path', message: `missing screenshot path for ${viewport.name}` });
      continue;
    }
    await mkdir(path.dirname(screenshot), { recursive: true });
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.CHROME_EXECUTABLE,
    });
    let page;
    const pageErrors = [];
    const consoleMessages = [];
    const failedRequests = [];
    const responseErrors = [];

    try {
      page = await browser.newPage({ viewport });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text() });
      });
      page.on('requestfailed', (request) => {
        failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? 'unknown' });
      });
      page.on('response', (response) => {
        if (response.status() >= 400) {
          const request = response.request();
          responseErrors.push({
            url: response.url(),
            status: response.status(),
            statusText: response.statusText(),
            method: request.method(),
            resourceType: request.resourceType(),
          });
        }
      });
      const session = target.authMode === 'authenticated'
        ? await getDevLoginSession(authSessionCache)
        : null;
      if (session) await addV1SessionInit(page, session);
      const captureRoute = await resolveCaptureRoute({ baseUrl, target, session });
      const url = new URL(captureRoute, baseUrl).toString();
      actionLog.push({ viewport: viewport.name, action: 'goto', url });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 }).catch(async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      });
      await waitForSettled(page);
      await page.screenshot({ path: screenshot, fullPage: true });
      const metrics = await page.evaluate(collectFullResponsiveMetrics);
      metrics.affordanceAudit = await auditInteractiveAffordances(page);
      const functionProbeResults = buildFunctionalProbeResults({ route: target.route, metrics });
      const viewportFindings = findFullResponsiveFindings({ target, viewport, metrics, functionProbeResults });
      if (pageErrors.length > 0) {
        viewportFindings.push({ level: 'blocking', check: 'page-error', viewport: viewport.name, message: pageErrors.join('; ') });
      }
      if (responseErrors.length > 0) {
        viewportFindings.push({
          level: 'blocking',
          check: 'response-error',
          viewport: viewport.name,
          message: responseErrors.map((response) => `${response.status} ${response.method} ${response.url}`).join('; '),
        });
      }
      if (failedRequests.length > 0) {
        viewportFindings.push({
          level: 'blocking',
          check: 'request-failed',
          viewport: viewport.name,
          message: failedRequests.map((request) => `${request.failure} ${request.url}`).join('; '),
        });
      }
      findings.push(...viewportFindings);
      viewportResults.push({
        viewport,
        screenshot,
        metrics,
        functionProbeResults,
        pageErrors,
        consoleMessages,
        failedRequests,
        responseErrors,
        findings: viewportFindings,
      });
      actionLog.push({
        viewport: viewport.name,
        action: 'capture',
        screenshot,
        findingCount: viewportFindings.length,
        visibleInteractive: metrics.affordanceAudit.visibleInteractive,
      });
    } catch (error) {
      findings.push({
        level: 'blocking',
        check: 'browser-capture',
        message: error instanceof Error ? error.message : String(error),
        viewport: viewport.name,
      });
    } finally {
      if (page && !page.isClosed()) await page.close();
      if (browser.isConnected()) await browser.close();
    }
  }

  const blockingFindings = findings.filter((finding) => finding.level === 'blocking');
  return {
    route: target.route,
    captureRoute: target.captureRoute,
    family: target.family,
    authMode: target.authMode,
    viewports: target.viewports,
    screenshots: target.screenshots,
    actionLog,
    viewportResults,
    findings,
    verdict: blockingFindings.length === 0 ? 'pass' : 'fail',
  };
}

async function getDevLoginSession(cache) {
  if (cache.session) return cache.session;

  const response = await fetch('http://localhost:8121/api/v1/auth/dev-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: DEFAULT_HOST_EMAIL }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`dev-login failed: ${response.status} ${text}`);
  const session = normalizeDevLoginSession(JSON.parse(text));
  const authMe = await fetch('http://localhost:8121/api/v1/auth/me', {
    headers: v1SessionHeaders(session),
  });
  if (!authMe.ok) throw new Error(`auth/me failed: ${authMe.status} ${await authMe.text()}`);
  cache.session = session;
  return session;
}

async function resolveCaptureRoute({ baseUrl, target, session }) {
  if (target.captureRoute !== '/chat/__live_chat_room__') return target.captureRoute;
  if (!session) return '/chat';

  const response = await fetch(new URL('/api/v1/chat/rooms', baseUrl), {
    headers: v1SessionHeaders(session),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`chat room resolve failed: ${response.status} ${text}`);
  const payload = JSON.parse(text);
  const items = payload?.data?.items ?? payload?.items ?? [];
  const roomId = items[0]?.roomId;
  if (typeof roomId !== 'string' || roomId.length === 0) throw new Error('chat room resolve failed: no roomId in response');
  return `/chat/${roomId}`;
}

async function waitForSettled(page) {
  try {
    await page.waitForFunction(
      () => {
        const visible = (node) => {
          if (!node) return false;
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        const app = document.querySelector('.tm-app-frame');
        const bodyText = document.body?.textContent ?? '';
        if (/Rendering\s*(?:…|\.\.\.)/.test(bodyText)) return false;
        if (/Checking your session/.test(bodyText)) return false;
        return app ? visible(app) : document.body.children.length > 0;
      },
      null,
      { timeout: 10_000 },
    );
  } catch {
    await page.waitForLoadState('domcontentloaded', { timeout: 3_000 }).catch(() => {});
  }
}

function collectFullResponsiveMetrics() {
  const visible = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const app = document.querySelector('.tm-app-frame');
  const appRect = app?.getBoundingClientRect();
  const links = Array.from(document.querySelectorAll('a[href]')).map((node) => ({
    text: (node.textContent ?? node.getAttribute('aria-label') ?? '').trim().slice(0, 80),
    href: node.getAttribute('href') ?? '',
  }));
  const buttons = Array.from(document.querySelectorAll('button')).map((node) => ({
    text: (node.textContent ?? node.getAttribute('aria-label') ?? '').trim().slice(0, 80),
    disabled: node.hasAttribute('disabled'),
  }));
  const inputs = Array.from(document.querySelectorAll('input,textarea,select')).map((node) => ({
    label: node.getAttribute('aria-label') ?? node.getAttribute('placeholder') ?? node.getAttribute('name') ?? '',
    tagName: node.tagName.toLowerCase(),
    type: node.getAttribute('type') ?? '',
  }));
  const textClipping = Array.from(document.querySelectorAll('button,a,h1,h2,h3,p,span,label,.tm-chip,.tm-badge'))
    .filter((node) => node instanceof HTMLElement)
    .filter((node) => node.clientWidth > 0 && (node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2))
    .slice(0, 20)
    .map((node) => ({
      text: (node.textContent ?? '').trim().slice(0, 80),
      className: node.className?.toString() ?? '',
    }));
  const deadLinks = links.filter((link) => link.href === '#' || link.href.startsWith('file:') || link.href.endsWith('.html'));

  return {
    title: document.title,
    h1: Array.from(document.querySelectorAll('h1')).map((node) => (node.textContent ?? '').trim()).filter(Boolean),
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    appFrameVisible: visible('.tm-app-frame'),
    appWidth: appRect ? Math.round(appRect.width) : 0,
    desktopNavVisible: visible('.tm-desktop-nav'),
    bottomNavVisible: visible('.tm-bottom-nav'),
    floatingFabVisible: visible('.tm-floating-fab'),
    fixedActionVisible: visible('.tm-fixed-cta'),
    appFrameWide: app instanceof HTMLElement ? app.classList.contains('tm-app-frame-wide') : false,
    filterRailVisible: visible('.tm-filter-rail,[data-testid="filter-rail"]'),
    filterButtonVisible: visible('.tm-list-filter-button'),
    searchVisible: visible('.tm-list-search-field,.tm-list-search-input,input[type="search"],input[aria-label*="검색"],a[aria-label="검색"]'),
    deadLinks,
    links,
    buttons,
    inputs,
    forms: document.querySelectorAll('form').length,
    actionCount: links.length + buttons.length + inputs.length,
    textClipping,
    unsupportedSuccessText: /실결제 완료|실환불 완료|관리자 처리 완료|제재 완료/.test(document.body.textContent ?? ''),
  };
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

function formatProbeFailure(failure) {
  if (typeof failure === 'string') return failure;
  const href = failure.href ? ` ${failure.href}` : '';
  return `${failure.kind ?? 'control'}:${failure.text ?? ''}${href} (${failure.reason ?? 'not actionable'})`;
}

async function main() {
  const config = buildFullResponsiveConfig(process.argv.slice(2));
  const rows = await readFeatureRows(config.matrix);
  const targets = buildFullResponsiveTargets({ config, rows });

  if (config.listOnly) {
    console.log(JSON.stringify({
      routeCount: targets.length,
      viewports: config.viewports,
      routes: targets.map((target) => ({ route: target.route, family: target.family, authMode: target.authMode })),
    }, null, 2));
    return;
  }

  const summary = await runFullResponsiveQa(config);
  if (summary.failures.length > 0) {
    console.error(JSON.stringify({
      status: 'fail',
      evidence: config.jsonPath,
      routeCount: summary.routeCount,
      resultCount: summary.resultCount,
      failures: summary.failures.map((failure) => ({
        route: failure.route,
        family: failure.family,
        findings: failure.findings.slice(0, 12),
      })),
    }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: 'pass', evidence: config.jsonPath, routeCount: summary.routeCount, resultCount: summary.resultCount }, null, 2));
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  await main();
}
