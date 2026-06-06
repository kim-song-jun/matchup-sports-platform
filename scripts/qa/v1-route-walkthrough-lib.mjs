import path from 'node:path';
import { emailForRoute } from './v1-open-design-parity-lib.mjs';

import {
  REQUIRED_V1_BASE_URL,
  isProtectedRoute,
  parseViewports,
  validateV1BaseUrl,
} from './v1-open-design-parity-lib.mjs';

const VISUAL_CHECKS = [
  'app-frame-fluidity',
  'horizontal-overflow',
  'text-clipping',
  'desktop-mobile-chrome',
  'visual-density-and-spacing',
];

const FUNCTION_CHECKS = [
  'supported-link-targets',
  'primary-action-affordance',
  'form-or-filter-controls',
  'unsupported-flow-honesty',
  'functional-actionability',
  'non-destructive-action-probes',
];

const LIVE_CAPTURE_IDS = {
  match: '00000000-0000-4000-8000-000000000201',
  reviewMatch: '00000000-0000-4000-8000-000000000204',
  team: '00000000-0000-4000-8000-000000000102',
  teamMatch: '00000000-0000-4000-8000-000000000306',
  chatRoom: '__live_chat_room__',
  notice: '00000000-0000-4000-8000-000000000001',
};

export function parseRouteFilter(value) {
  return new Set(String(value ?? '').split(',').map((route) => route.trim()).filter(Boolean));
}

export function buildWalkthroughConfig(tokens) {
  const args = parseArgs(tokens);
  const baseUrl = args['base-url'] ?? REQUIRED_V1_BASE_URL;
  const baseCheck = validateV1BaseUrl(baseUrl);
  if (!baseCheck.ok) throw new Error(baseCheck.message);
  return {
    baseUrl,
    matrix: args.matrix ?? 'docs/scenarios/13-v1-open-design-recovery-from-zero.md',
    routeFilter: parseRouteFilter(args.routes ?? ''),
    viewports: parseViewports(args.viewports ?? '390x844,1440x900'),
    outDir: args.out ?? 'output/playwright/visual-audit/route-by-route-qa-20260605/default',
    jsonPath: args.json ?? 'evidence/route-by-route-qa-20260605/default.json',
    listOnly: args.list === true,
  };
}

export function classifyAuthMode(route) {
  return isProtectedRoute(route) ? 'authenticated' : 'public';
}

export function buildWalkthroughTargets({ evidenceRoot, outDir, routeFilter, rows, viewports }) {
  const routeOrder = new Map([...routeFilter].map((route, index) => [route, index]));
  return rows
    .filter((row) => row.classification === 'implemented-route' && row.route.startsWith('/'))
    .filter((row) => routeFilter.size === 0 || routeFilter.has(row.route))
    .sort((left, right) => {
      if (routeFilter.size === 0) return 0;
      return (routeOrder.get(left.route) ?? Number.MAX_SAFE_INTEGER) - (routeOrder.get(right.route) ?? Number.MAX_SAFE_INTEGER);
    })
    .map((row) => buildWalkthroughTarget({ evidenceRoot, outDir, row, viewports }));
}

function buildWalkthroughTarget({ evidenceRoot, outDir, row, viewports }) {
  const family = familyForRoute(row.route);
  const routeSlug = slug(row.route);
  return {
    route: row.route,
    captureRoute: captureRouteFor(row.route),
    family,
    authMode: classifyAuthMode(row.route),
    persona: classifyAuthMode(row.route) === 'authenticated' ? emailForRoute(row.route) : 'guest',
    designRefs: {
      openDesignHtml: row.openDesignHtml,
    },
    visualChecks: [...VISUAL_CHECKS],
    functionChecks: [...FUNCTION_CHECKS],
    viewports,
    screenshots: viewports.map((viewport) => ({
      viewport: viewport.name,
      path: path.join(outDir, family, routeSlug, `${viewport.name}.png`),
    })),
    auditPath: path.join(evidenceRoot, family, `${routeSlug}.json`),
  };
}

function familyForRoute(route) {
  if (route === '/admin' || route.startsWith('/admin/') || route === '/chat' || route.startsWith('/chat/') || route === '/notifications' || route.startsWith('/notifications/')) {
    return 'community-admin-utility';
  }
  if (route === '/team-matches' || route.startsWith('/team-matches/')) return 'team-match';
  if (route === '/matches' || route.startsWith('/matches/') || route.startsWith('/my/matches/')) return 'personal-match';
  if (route === '/my' || route.startsWith('/my/') || route === '/teams' || route.startsWith('/teams/')) return 'teams-account-reviews';
  return 'public-auth-discovery';
}

function captureRouteFor(route) {
  let captureRoute = route;
  if (captureRoute.startsWith('/my/reviews/')) {
    return captureRoute
      .replace('[sourceType]', 'match')
      .replace('[sourceId]', LIVE_CAPTURE_IDS.reviewMatch);
  }
  if (captureRoute.startsWith('/team-matches/')) {
    captureRoute = captureRoute.replace('[id]', LIVE_CAPTURE_IDS.teamMatch);
  } else if (captureRoute.startsWith('/chat/')) {
    captureRoute = captureRoute.replace('[id]', LIVE_CAPTURE_IDS.chatRoom);
  } else if (captureRoute.startsWith('/notices/')) {
    captureRoute = captureRoute.replace('[id]', LIVE_CAPTURE_IDS.notice);
  } else if (captureRoute.startsWith('/matches/')) {
    captureRoute = captureRoute.replace('[id]', LIVE_CAPTURE_IDS.match);
  } else if (captureRoute.startsWith('/teams/') || captureRoute.startsWith('/my/teams/')) {
    captureRoute = captureRoute.replace('[id]', LIVE_CAPTURE_IDS.team);
  } else {
    captureRoute = captureRoute.replace('[id]', LIVE_CAPTURE_IDS.match);
  }
  return captureRoute
    .replace('[sourceType]', 'match')
    .replace('[sourceId]', LIVE_CAPTURE_IDS.match);
}

function slug(route) {
  return route === '/' ? 'root' : route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_');
}

export function buildFunctionalProbeResults({ route, metrics }) {
  const unsupportedActions = findUnsupportedActiveActions(route, metrics);
  const actionabilityFailures = metrics.affordanceAudit?.failures ?? [];
  return [
    { check: 'supported-link-targets', status: metrics.deadLinks.length === 0 ? 'pass' : 'fail', observed: metrics.links.length, failures: metrics.deadLinks },
    { check: 'primary-action-affordance', status: unsupportedActions.length === 0 ? 'pass' : 'fail', observed: metrics.buttons.length + metrics.links.length, failures: unsupportedActions },
    { check: 'form-or-filter-controls', status: metrics.forms > 0 || metrics.inputs.length > 0 ? 'pass' : 'not-applicable', observed: metrics.forms + metrics.inputs.length, failures: [] },
    { check: 'unsupported-flow-honesty', status: metrics.unsupportedSuccessText ? 'fail' : 'pass', observed: metrics.unsupportedSuccessText ? 1 : 0, failures: metrics.unsupportedSuccessText ? ['unsupported success copy is visible'] : [] },
    { check: 'functional-actionability', status: actionabilityFailures.length === 0 ? 'pass' : 'fail', observed: metrics.affordanceAudit?.visibleInteractive ?? 0, failures: actionabilityFailures },
    { check: 'non-destructive-action-probes', status: metrics.actionCount > 0 && actionabilityFailures.length === 0 ? 'pass' : 'fail', observed: metrics.actionCount, failures: metrics.actionCount > 0 ? actionabilityFailures : ['no links, buttons, or inputs found'] },
  ];
}

export async function auditInteractiveAffordances(page) {
  const controls = page.locator('main a[href]:visible,main button:visible:not([disabled]),.tm-fixed-cta a[href]:visible,.tm-fixed-cta button:visible:not([disabled])');
  const controlCount = Math.min(await controls.count(), 25);
  const failures = [];

  for (let index = 0; index < controlCount; index += 1) {
    const control = controls.nth(index);
    const label = await control.evaluate((node) => ({
      tagName: node.tagName.toLowerCase(),
      text: (node.textContent ?? node.getAttribute('aria-label') ?? '').trim().slice(0, 80),
      href: node.getAttribute('href') ?? '',
    }));

    try {
      await control.click({ trial: true, timeout: 300 });
    } catch (error) {
      failures.push({
        ...label,
        message: error instanceof Error ? error.message.split('\n')[0] : String(error),
      });
    }
  }

  const disabledButtons = await page.locator('main button:visible:disabled,.tm-fixed-cta button:visible:disabled').evaluateAll((nodes) => nodes.map((node) => ({
    text: (node.textContent ?? node.getAttribute('aria-label') ?? '').trim().slice(0, 80),
  })));

  return {
    visibleInteractive: controlCount,
    actionable: controlCount - failures.length,
    failures,
    disabledButtons,
  };
}

export function findWalkthroughFindings({ target, viewport, metrics, functionProbeResults }) {
  const findings = [];
  if (metrics.horizontalOverflow) findings.push({ level: 'blocking', check: 'horizontal-overflow', viewport: viewport.name, message: 'document scrollWidth exceeds viewport width' });
  if (metrics.deadLinks.length > 0) findings.push({ level: 'blocking', check: 'dead-links', viewport: viewport.name, message: metrics.deadLinks.map((link) => link.href).join(', ') });
  if (metrics.textClipping.length > 0) findings.push({ level: 'blocking', check: 'text-clipping', viewport: viewport.name, message: `${metrics.textClipping.length} clipped text nodes` });
  if (metrics.unsupportedSuccessText) findings.push({ level: 'blocking', check: 'unsupported-success', viewport: viewport.name, message: 'unsupported success copy is visible' });
  if (metrics.actionCount === 0) findings.push({ level: 'blocking', check: 'function-affordance', viewport: viewport.name, message: 'no links, buttons, or inputs found' });
  if (viewport.width >= 1024 && metrics.bottomNavVisible) findings.push({ level: 'blocking', check: 'desktop-chrome', viewport: viewport.name, message: 'mobile bottom nav visible on desktop' });
  if (target.authMode === 'authenticated' && metrics.actionCount === 0) findings.push({ level: 'blocking', check: 'auth-hydration', viewport: viewport.name, message: 'authenticated page rendered without affordances' });
  const staleFixtureLinks = findStaleFixtureLinks(target.route, metrics);
  if (staleFixtureLinks.length > 0) findings.push({ level: 'blocking', check: 'stale-fixture-link', viewport: viewport.name, message: staleFixtureLinks.map((link) => link.href).join(', ') });
  const failedProbe = functionProbeResults.find((result) => result.check === 'primary-action-affordance' && result.status === 'fail');
  if (failedProbe) findings.push({ level: 'blocking', check: failedProbe.check, viewport: viewport.name, message: failedProbe.failures.map(formatProbeFailure).join('; ') });
  const failedActionability = functionProbeResults.find((result) => result.check === 'functional-actionability' && result.status === 'fail');
  if (failedActionability) findings.push({ level: 'blocking', check: failedActionability.check, viewport: viewport.name, message: `${failedActionability.failures.length} visible controls failed Playwright trial click` });
  return findings;
}

function findStaleFixtureLinks(route, metrics) {
  const liveEntityRoute = route.includes('[id]/edit') || route.endsWith('/new/complete');
  if (!liveEntityRoute) return [];
  return metrics.links.filter((link) => /\/matches\/match-1(?:\/|$)|\/team-matches\/team-match-1(?:\/|$)/.test(link.href));
}

function findUnsupportedActiveActions(route, metrics) {
  if (route !== '/team-matches/new/complete') return [];
  const staleDetail = metrics.links.filter((link) => link.text === '상세 보기' && link.href.includes('/team-matches/team-match-1')).map((link) => ({ kind: 'link', text: link.text, href: link.href, reason: 'completion detail link is not server-bound' }));
  const activeShare = metrics.buttons.filter((button) => button.text === '팀 채팅에 공유' && !button.disabled).map((button) => ({ kind: 'button', text: button.text, reason: 'future share action must be disabled or labelled as preparing' }));
  return [...staleDetail, ...activeShare];
}

function formatProbeFailure(failure) {
  if (typeof failure === 'string') return failure;
  const href = failure.href ? ` ${failure.href}` : '';
  return `${failure.kind}:${failure.text}${href} (${failure.reason})`;
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
