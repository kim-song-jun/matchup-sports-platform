import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildFullResponsiveConfig,
  buildFullResponsiveTargets,
  runFullResponsiveQa,
} from './v1-full-responsive-visual-functional.mjs';
import {
  parseArgs,
  readFeatureRows,
  writeJson,
} from './v1-open-design-parity-lib.mjs';

const DEFAULT_HTML = 'evidence/task101-no-fallback-storybook-qa-20260606/page-storybook-full.html';

export function buildPageStorybookQaConfig(tokens) {
  const args = parseArgs(tokens);
  const fullConfig = buildFullResponsiveConfig(tokens);
  return {
    ...fullConfig,
    htmlPath: String(args.html ?? DEFAULT_HTML),
    adminFocus: args['admin-focus'] === true,
    fromJson: args['from-json'] ? String(args['from-json']) : '',
  };
}

export function buildAdminDesktopFindings({ route, viewport, metrics, functionProbeResults = [] }) {
  if (!isAdminRoute(route) || !viewport || viewport.width < 1024) return [];

  const findings = [];
  if (!metrics?.desktopNavVisible) {
    findings.push({
      level: 'blocking',
      check: 'admin-desktop-chrome',
      viewport: viewport.name,
      message: 'desktop admin shell nav is not visible',
    });
  }
  if (metrics?.bottomNavVisible) {
    findings.push({
      level: 'blocking',
      check: 'admin-desktop-chrome',
      viewport: viewport.name,
      message: 'mobile bottom nav is visible on admin desktop',
    });
  }

  const disabledUnsupportedButton = (metrics?.buttons ?? []).some((button) => {
    const label = String(button.text ?? '');
    return button.disabled === true && /준비 중|처리 불가|미지원|unavailable|not supported/i.test(label);
  });
  if (!disabledUnsupportedButton) {
    findings.push({
      level: 'blocking',
      check: 'admin-unsupported-action',
      viewport: viewport.name,
      message: 'unsupported admin operation is not exposed as a disabled/explicit action',
    });
  }

  const hasAdminShellLink = (metrics?.links ?? []).some((link) => {
    const pathname = normalizeHrefPath(link.href);
    return pathname === '/admin' || pathname === '/admin/audit';
  });
  if (!hasAdminShellLink) {
    findings.push({
      level: 'blocking',
      check: 'admin-shell-link',
      viewport: viewport.name,
      message: 'admin page has no in-shell admin navigation link',
    });
  }

  if (metrics?.unsupportedSuccessText) {
    findings.push({
      level: 'blocking',
      check: 'admin-unsupported-success',
      viewport: viewport.name,
      message: 'unsupported admin operation is shown as completed',
    });
  }

  const failedActionability = functionProbeResults.find((result) => result.check === 'functional-actionability' && result.status === 'fail');
  if (failedActionability || (metrics?.affordanceAudit?.failures ?? []).length > 0) {
    findings.push({
      level: 'blocking',
      check: 'admin-functional-actionability',
      viewport: viewport.name,
      message: 'one or more visible admin controls failed Playwright trial click',
    });
  }

  return findings;
}

export function buildPageStorybookReport({ summary, config, generatedAt = new Date().toISOString() }) {
  const stories = [];
  const existingScreenshots = config.existingScreenshots;

  for (const result of summary.results ?? []) {
    const viewports = collectResultViewports(result);
    for (const viewport of viewports) {
      const viewportResult = (result.viewportResults ?? []).find((item) => item.viewport?.name === viewport.name);
      const routeFindings = (result.findings ?? []).filter((finding) => !finding.viewport || finding.viewport === viewport.name);
      const viewportFindings = [
        ...routeFindings,
        ...(viewportResult?.findings ?? []),
        ...browserSignalFindings(viewportResult, viewport),
      ];
      const blockingFindings = dedupeFindings(viewportFindings.filter((finding) => finding.level === 'blocking'));
      const screenshotPath = String(viewportResult?.screenshot ?? '');
      const screenshotMissing = screenshotPath && existingScreenshots instanceof Set && !existingScreenshots.has(screenshotPath);
      const rawError = findingMessageForChecks(blockingFindings, ['browser-capture', 'page-error', 'console-error', 'response-error', 'request-failed', 'artifact-path'])
        || (!viewportResult ? `Missing viewport result for ${result.route} ${viewport.name}` : '')
        || (screenshotMissing ? `Screenshot file missing: ${screenshotPath}` : '');
      const screenshot = screenshotMissing ? '' : screenshotPath;
      const adminDesktop = isAdminRoute(result.route) && viewport.width >= 1024;

      stories.push({
        id: `${result.route}__${viewport.name}`,
        route: result.route,
        captureRoute: result.captureRoute,
        family: result.family,
        authMode: result.authMode,
        viewport,
        screenshot,
        status: rawError || blockingFindings.length > 0 ? 'fail' : 'pass',
        error: rawError,
        findings: blockingFindings,
        functionProbeResults: viewportResult?.functionProbeResults ?? [],
        browserSignals: {
          pageErrors: viewportResult?.pageErrors ?? [],
          consoleMessages: viewportResult?.consoleMessages ?? [],
          failedRequests: viewportResult?.failedRequests ?? [],
          responseErrors: viewportResult?.responseErrors ?? [],
        },
        adminDesktop,
      });
    }
  }

  const failures = stories.filter((story) => story.status !== 'pass');
  const adminStories = stories.filter((story) => story.adminDesktop);
  return {
    title: 'Task 101 V1 Page QA Gallery',
    generatedAt,
    baseUrl: summary.baseUrl,
    matrix: summary.matrix,
    routeCount: summary.routeCount ?? (summary.routes ?? []).length,
    resultCount: summary.resultCount ?? stories.length,
    status: failures.length === 0 && (summary.failures ?? []).length === 0 ? 'pass' : 'fail',
    stories,
    failures,
    adminFocus: {
      enabled: Boolean(config.adminFocus),
      routes: unique(adminStories.map((story) => story.route)),
      desktopViewports: unique(adminStories.map((story) => story.viewport.name)),
      failureCount: adminStories.filter((story) => story.status !== 'pass').length,
    },
  };
}

export function renderPageStorybookHtml(report) {
  const htmlPath = report.htmlPath ?? DEFAULT_HTML;
  const cards = report.stories.map((story) => renderStoryCard(story, htmlPath)).join('\n');
  const adminRoutes = report.adminFocus.routes.length > 0 ? report.adminFocus.routes.join(', ') : 'none';
  const adminViewports = report.adminFocus.desktopViewports.length > 0 ? report.adminFocus.desktopViewports.join(', ') : 'none';

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.title)}</title>
  <style>
    :root { color-scheme: light; --blue: #3182f6; --ink: #191f28; --muted: #6b7684; --line: #e5e8eb; --bg: #f6f8fa; --fail: #e5484d; --ok: #0ca678; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { position: sticky; top: 0; z-index: 2; background: rgba(255,255,255,.94); border-bottom: 1px solid var(--line); padding: 20px 28px; }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; letter-spacing: 0; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; color: var(--muted); font-size: 13px; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px; background: #fff; }
    .pill.ok { color: var(--ok); border-color: rgba(12,166,120,.28); }
    .pill.fail { color: var(--fail); border-color: rgba(229,72,77,.28); }
    main { width: min(100%, 1800px); margin: 0 auto; padding: 28px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 20px; align-items: start; }
    article { background: #fff; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    .story-head { display: flex; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
    .route { font-weight: 760; overflow-wrap: anywhere; }
    .sub { margin-top: 4px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .status { align-self: flex-start; border-radius: 999px; padding: 5px 9px; font-weight: 740; font-size: 12px; text-transform: uppercase; }
    .status.pass { color: var(--ok); background: rgba(12,166,120,.1); }
    .status.fail { color: var(--fail); background: rgba(229,72,77,.1); }
    .shot img { display: block; width: 100%; height: auto; background: #fff; }
    .error { margin: 0; padding: 16px; color: #b42318; background: #fff5f5; border-top: 1px solid rgba(229,72,77,.16); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; }
    details { border-top: 1px solid var(--line); padding: 12px 16px; }
    summary { cursor: pointer; color: var(--blue); font-weight: 700; }
    pre { margin: 10px 0 0; padding: 12px; border-radius: 6px; background: #f2f4f6; overflow: auto; font-size: 12px; line-height: 1.45; }
    @media (max-width: 720px) { header, main { padding: 18px; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(report.title)}</h1>
    <div class="meta">
      <span class="pill ${report.status === 'pass' ? 'ok' : 'fail'}">status ${escapeHtml(report.status)}</span>
      <span class="pill">routes ${report.routeCount}</span>
      <span class="pill">stories ${report.stories.length}</span>
      <span class="pill">failures ${report.failures.length}</span>
      <span class="pill">admin ${escapeHtml(adminRoutes)}</span>
      <span class="pill">admin desktop ${escapeHtml(adminViewports)}</span>
      <span class="pill">${escapeHtml(report.generatedAt)}</span>
    </div>
  </header>
  <main>
    <section class="grid">
${cards}
    </section>
  </main>
</body>
</html>
`;
}

export async function runPageStorybookQa(config) {
  if (config.listOnly) {
    const rows = await readFeatureRows(config.matrix);
    const targets = buildFullResponsiveTargets({ config, rows });
    return {
      listOnly: true,
      routeCount: targets.length,
      viewports: config.viewports,
      routes: targets.map((target) => ({ route: target.route, family: target.family, authMode: target.authMode })),
    };
  }

  const summary = config.fromJson
    ? JSON.parse(await readFile(config.fromJson, 'utf8'))
    : await runFullResponsiveQa(config);

  if (config.adminFocus) applyAdminDesktopFindings(summary);

  if (!(config.existingScreenshots instanceof Set)) {
    config.existingScreenshots = await collectExistingScreenshots(summary);
  }
  const report = buildPageStorybookReport({ summary, config });
  report.htmlPath = config.htmlPath;
  await mkdir(path.dirname(config.htmlPath), { recursive: true });
  await writeFile(config.htmlPath, renderPageStorybookHtml(report));
  await writeJson(config.jsonPath, { ...summary, pageStorybook: summarizeReport(report) });

  return report;
}

function applyAdminDesktopFindings(summary) {
  for (const result of summary.results ?? []) {
    const adminFindings = [];
    for (const viewportResult of result.viewportResults ?? []) {
      const findings = buildAdminDesktopFindings({
        route: result.route,
        viewport: viewportResult.viewport,
        metrics: viewportResult.metrics,
        functionProbeResults: viewportResult.functionProbeResults,
      });
      if (findings.length === 0) continue;
      viewportResult.findings = [...(viewportResult.findings ?? []), ...findings];
      adminFindings.push(...findings);
    }
    if (adminFindings.length > 0) {
      result.findings = [...(result.findings ?? []), ...adminFindings];
      result.verdict = 'fail';
    }
  }
  summary.failures = (summary.results ?? []).filter((result) => result.verdict !== 'pass');
}

function renderStoryCard(story, htmlPath) {
  const detail = {
    findings: story.findings,
    functionProbeResults: story.functionProbeResults,
    browserSignals: story.browserSignals,
  };
  const image = story.screenshot
    ? `<div class="shot"><img src="${escapeHtml(relativeAssetPath(htmlPath, story.screenshot))}" alt="${escapeHtml(`${story.route} ${story.viewport.name}`)}"></div>`
    : '';
  const error = story.error || !story.screenshot
    ? `<pre class="error">${escapeHtml(story.error || 'No screenshot captured for this story.')}</pre>`
    : '';
  const media = `${image}${error}`;

  return `      <article>
        <div class="story-head">
          <div>
            <div class="route">${escapeHtml(story.route)}</div>
            <div class="sub">${escapeHtml(story.viewport.name)} · ${escapeHtml(story.family)} · ${escapeHtml(story.authMode)} · capture ${escapeHtml(story.captureRoute)}</div>
          </div>
          <span class="status ${escapeHtml(story.status)}">${escapeHtml(story.status)}</span>
        </div>
        ${media}
        <details>
          <summary>QA details</summary>
          <pre>${escapeHtml(JSON.stringify(detail, null, 2))}</pre>
        </details>
      </article>`;
}

function collectResultViewports(result) {
  const fromResult = (result.viewports ?? []).filter(Boolean);
  if (fromResult.length > 0) return fromResult;
  return unique((result.screenshots ?? []).map((item) => item.viewport)).map((name) => parseViewportName(name));
}

async function collectExistingScreenshots(summary) {
  const paths = [];
  for (const result of summary.results ?? []) {
    for (const viewportResult of result.viewportResults ?? []) {
      if (viewportResult.screenshot) paths.push(String(viewportResult.screenshot));
    }
  }

  const existingScreenshots = new Set();
  await Promise.all(paths.map(async (screenshotPath) => {
    try {
      await stat(screenshotPath);
      existingScreenshots.add(screenshotPath);
    } catch {
      // Missing screenshot files are surfaced as failed stories by buildPageStorybookReport.
    }
  }));
  return existingScreenshots;
}

function findingMessageForChecks(findings, checks) {
  const finding = findings.find((item) => checks.includes(item.check));
  return finding?.message ? String(finding.message) : '';
}

function browserSignalFindings(viewportResult, viewport) {
  if (!viewportResult) return [];
  const findings = [];
  const pageErrors = viewportResult.pageErrors ?? [];
  const consoleErrors = (viewportResult.consoleMessages ?? []).filter((message) => message.type === 'error');
  const responseErrors = viewportResult.responseErrors ?? [];
  const failedRequests = viewportResult.failedRequests ?? [];
  if (pageErrors.length > 0) {
    findings.push({ level: 'blocking', check: 'page-error', viewport: viewport.name, message: pageErrors.join('; ') });
  }
  if (consoleErrors.length > 0) {
    findings.push({ level: 'blocking', check: 'console-error', viewport: viewport.name, message: consoleErrors.map((message) => message.text ?? '').join('; ') });
  }
  if (responseErrors.length > 0) {
    findings.push({
      level: 'blocking',
      check: 'response-error',
      viewport: viewport.name,
      message: responseErrors.map((response) => `${response.status ?? 'error'} ${response.method ?? 'GET'} ${response.url ?? ''}`.trim()).join('; '),
    });
  }
  if (failedRequests.length > 0) {
    findings.push({
      level: 'blocking',
      check: 'request-failed',
      viewport: viewport.name,
      message: failedRequests.map((request) => `${request.failure ?? 'unknown'} ${request.url ?? ''}`.trim()).join('; '),
    });
  }
  return findings;
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.level ?? ''}:${finding.check ?? ''}:${finding.viewport ?? ''}:${finding.message ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeReport(report) {
  return {
    title: report.title,
    generatedAt: report.generatedAt,
    htmlPath: report.htmlPath,
    status: report.status,
    storyCount: report.stories.length,
    failureCount: report.failures.length,
    failures: report.failures.map((story) => ({
      route: story.route,
      viewport: story.viewport.name,
      error: story.error,
      findings: story.findings,
    })),
    adminFocus: report.adminFocus,
  };
}

function isAdminRoute(route) {
  return route === '/admin' || String(route).startsWith('/admin/');
}

function normalizeHrefPath(href) {
  if (!href) return '';
  try {
    return new URL(href, 'http://localhost:3013').pathname.replace(/\/$/, '') || '/';
  } catch {
    return String(href).split('?')[0].replace(/\/$/, '') || '/';
  }
}

function parseViewportName(name) {
  const [widthText, heightText] = String(name).split('x');
  return { name: String(name), width: Number(widthText), height: Number(heightText) };
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function relativeAssetPath(htmlPath, assetPath) {
  return path.relative(path.dirname(htmlPath), assetPath).split(path.sep).join('/');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  const config = buildPageStorybookQaConfig(process.argv.slice(2));
  const report = await runPageStorybookQa(config);
  if (report.listOnly) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (report.status !== 'pass') {
    console.error(JSON.stringify({
      status: 'fail',
      html: config.htmlPath,
      failures: report.failures.map((story) => ({
        route: story.route,
        viewport: story.viewport.name,
        error: story.error,
        findings: story.findings,
      })),
    }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: 'pass', html: config.htmlPath, stories: report.stories.length }, null, 2));
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  await main();
}
