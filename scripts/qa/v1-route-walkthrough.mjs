import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

import {
  auditInteractiveAffordances,
  buildFunctionalProbeResults,
  buildWalkthroughConfig,
  buildWalkthroughTargets,
  findWalkthroughFindings,
} from './v1-route-walkthrough-lib.mjs';
import { readFeatureRows, writeJson } from './v1-open-design-parity-lib.mjs';
import {
  addV1SessionInit,
  normalizeDevLoginSession,
  v1SessionHeaders,
} from './v1-open-design-auth.mjs';
import { DEFAULT_HOST_EMAIL } from './v1-open-design-parity-lib.mjs';

const config = buildWalkthroughConfig(process.argv.slice(2));
const rows = await readFeatureRows(config.matrix);
const targets = buildWalkthroughTargets({
  evidenceRoot: path.join(path.dirname(config.jsonPath), 'routes'),
  outDir: config.outDir,
  routeFilter: config.routeFilter,
  rows,
  viewports: config.viewports,
});

if (config.listOnly) {
  console.log(JSON.stringify({ routeCount: targets.length, targets }, null, 2));
  process.exit(0);
}

const results = [];

for (const target of targets) {
  const browser = await chromium.launch({ headless: true });
  try {
    const routeResult = await runRouteTarget(browser, config.baseUrl, target);
    results.push(routeResult);
    await writeJson(target.auditPath, routeResult);
  } finally {
    if (browser.isConnected()) await browser.close();
  }
}

const summary = {
  baseUrl: config.baseUrl,
  matrix: config.matrix,
  routes: targets.map((target) => target.route),
  results,
  failures: results.filter((result) => result.verdict !== 'pass'),
};

await writeJson(config.jsonPath, summary);

if (summary.failures.length > 0) {
  console.error(JSON.stringify(summary.failures, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: 'pass', routes: results.length, evidence: config.jsonPath }, null, 2));

async function runRouteTarget(browser, baseUrl, target) {
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
    const page = await browser.newPage({ viewport });
    try {
      const session = target.authMode === 'authenticated' ? await devLoginSession() : null;
      if (session) await addV1SessionInit(page, session);
      const captureRoute = await resolveCaptureRoute(baseUrl, target, session);
      const url = new URL(captureRoute, baseUrl).toString();
      actionLog.push({ viewport: viewport.name, action: 'goto', url });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 }).catch(async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      });
      await waitForWalkthroughSettled(page);
      await page.screenshot({ path: screenshot, fullPage: true });
      actionLog.push({ viewport: viewport.name, action: 'screenshot', path: screenshot });
      const metrics = await page.evaluate(collectWalkthroughMetrics);
      const affordanceAudit = await auditInteractiveAffordances(page);
      actionLog.push({ viewport: viewport.name, action: 'functional-affordance-audit', ...affordanceAudit });
      metrics.affordanceAudit = affordanceAudit;
      const functionProbeResults = buildFunctionalProbeResults({ route: target.route, metrics });
      actionLog.push({ viewport: viewport.name, action: 'function-probe', checks: functionProbeResults.map(({ check, status, observed }) => ({ check, status, observed })) });
      viewportResults.push({ viewport, screenshot, metrics, functionProbeResults });
      findings.push(...findWalkthroughFindings({ target, viewport, metrics, functionProbeResults }));
    } catch (error) {
      findings.push({
        level: 'blocking',
        check: 'browser-capture',
        message: error instanceof Error ? error.message : String(error),
        viewport: viewport.name,
      });
    } finally {
      await page.close();
    }
  }

  const blockingFindings = findings.filter((finding) => finding.level === 'blocking');
  return {
    route: target.route,
    captureRoute: target.captureRoute,
    family: target.family,
    persona: target.persona,
    authMode: target.authMode,
    designRefs: target.designRefs,
    visualChecks: target.visualChecks,
    functionChecks: target.functionChecks,
    screenshots: target.screenshots,
    actionLog,
    viewportResults,
    findings,
    verdict: blockingFindings.length === 0 ? 'pass' : 'fail',
    fixRequired: blockingFindings.length > 0,
    unsupportedByV1Contract: [],
  };
}

async function devLoginSession() {
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
  return session;
}

async function resolveCaptureRoute(baseUrl, target, session) {
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
  if (typeof roomId !== 'string' || roomId.length === 0) {
    throw new Error('chat room resolve failed: no roomId in /api/v1/chat/rooms response');
  }

  return `/chat/${roomId}`;
}

async function waitForWalkthroughSettled(page) {
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
        const isRenderingOverlay = /Rendering\s*(?:…|\.\.\.)/.test(bodyText);
        const isAuthChecking = /Checking your session/.test(bodyText);
        if (app) return visible(app) && !isRenderingOverlay && !isAuthChecking;
        return document.body.children.length > 0 && !isRenderingOverlay && !isAuthChecking;
      },
      null,
      { timeout: 10_000 },
    );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    try {
      await page.waitForLoadState('networkidle', { timeout: 3_000 });
    } catch (loadStateError) {
      if (!(loadStateError instanceof Error)) throw loadStateError;
    }
  }
}

function collectWalkthroughMetrics() {
  const visible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const textNodes = Array.from(document.querySelectorAll('button,a,h1,h2,h3,p,span,label'));
  const clipped = textNodes
    .filter((node) => node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2)
    .slice(0, 20)
    .map((node) => ({
      text: (node.textContent ?? '').trim().slice(0, 80),
      className: node.className?.toString() ?? '',
    }));
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
  const app = document.querySelector('.tm-app-frame');
  const appRect = app?.getBoundingClientRect();
  const deadLinks = links.filter((link) => link.href === '#' || link.href.startsWith('file:') || link.href.endsWith('.html'));
  return {
    title: document.title,
    h1: Array.from(document.querySelectorAll('h1')).map((node) => (node.textContent ?? '').trim()).filter(Boolean),
    appFrameVisible: visible(app),
    appWidth: appRect ? Math.round(appRect.width) : 0,
    desktopNavVisible: visible(document.querySelector('.tm-desktop-nav')),
    bottomNavVisible: visible(document.querySelector('.tm-bottom-nav')),
    floatingCtaVisible: visible(document.querySelector('.tm-floating-fab,.tm-fixed-cta')),
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    textClipping: clipped,
    links,
    buttons,
    inputs,
    forms: document.querySelectorAll('form').length,
    deadLinks,
    actionCount: links.length + buttons.length + inputs.length,
    unsupportedSuccessText: /실결제 완료|실환불 완료|관리자 처리 완료|제재 완료/.test(document.body.textContent ?? ''),
  };
}
