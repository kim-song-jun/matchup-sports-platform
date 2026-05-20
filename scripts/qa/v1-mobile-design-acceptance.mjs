import { chromium } from 'playwright';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3013';
const runId = process.env.RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join('output', 'playwright', 'visual-audit', runId);
const execFileAsync = promisify(execFile);

const routes = [
  '/home',
  '/matches',
  '/matches/match-1',
  '/matches/new/sport',
  '/matches/new',
  '/matches/new/place-time',
  '/matches/new/confirm',
  '/matches/new/complete',
  '/matches/match-1/edit',
  '/team-matches',
  '/team-matches/team-match-1',
  '/team-matches/new/team',
  '/team-matches/new/sport',
  '/team-matches/new/info',
  '/team-matches/new/condition',
  '/team-matches/new/place-time',
  '/team-matches/new/confirm',
  '/team-matches/new/complete',
  '/team-matches/team-match-1/edit',
  '/teams',
  '/teams/team-1',
  '/teams/new',
  '/teams/team-1/edit',
  '/teams/team-1/members',
  '/chat',
  '/chat/room-1',
  '/notifications',
  '/notifications/read',
  '/my',
  '/my/matches/joined',
  '/my/matches/created',
  '/my/teams',
  '/my/teams/team-1',
  '/my/teams/team-1/members',
  '/my/profile/edit',
  '/my/settings',
  '/my/settings/notifications',
  '/my/settings/legal',
  '/my/settings/withdrawal',
];

function slug(route) {
  return route.replace(/^\//, '').replaceAll('/', '__') || 'root';
}

async function auditPage(page, route) {
  const url = new URL(route, baseUrl).toString();
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(250);

  const file = `${slug(route)}.png`;
  await page.screenshot({ path: path.join(outDir, file), fullPage: false });

  const checks = await page.evaluate(() => {
    const frame = document.querySelector('.tm-app-frame');
    const fixedChrome = [...document.querySelectorAll('.tm-bottom-nav, .tm-fixed-cta, .tm-chat-inputbar, .tm-floating-fab')];
    const badText = [...document.querySelectorAll('button, a, .tm-badge, .tm-chip, .tm-text-body-lg, .tm-text-heading')]
      .filter((el) => el instanceof HTMLElement)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: (el.textContent || '').trim().slice(0, 80),
          tag: el.tagName.toLowerCase(),
          className: el.className?.toString?.() ?? '',
          rect: { width: rect.width, height: rect.height, left: rect.left, right: rect.right },
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        };
      })
      .filter((item) => item.clientWidth > 0 && item.scrollWidth > item.clientWidth + 2 && item.rect.width < 360)
      .slice(0, 12);

    const frameRect = frame instanceof HTMLElement ? frame.getBoundingClientRect() : null;
    const bodyRect = document.body.getBoundingClientRect();
    const horizontalOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth + 1;
    const frameWidthOk = frameRect ? frameRect.width <= 375 && frameRect.width > 320 : false;
    const fixedRects = fixedChrome
      .filter((el) => el instanceof HTMLElement)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { className: el.className.toString(), top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      });

    return {
      title: document.title,
      frameFound: Boolean(frame),
      frameWidthOk,
      bodyWidth: bodyRect.width,
      horizontalOverflow,
      fixedRects,
      badText,
    };
  });

  const status = response?.status() ?? 0;
  const issues = [];
  if (status < 200 || status >= 400) issues.push(`HTTP ${status}`);
  if (!checks.frameFound) issues.push('missing .tm-app-frame');
  if (!checks.frameWidthOk) issues.push('app frame width outside mobile contract');
  if (checks.horizontalOverflow) issues.push('document has horizontal overflow');
  if (checks.badText.length > 0) issues.push(`possible text overflow: ${checks.badText.length}`);

  return { route, status, screenshot: file, issues, checks };
}

async function auditPageWithChromeCli(route, chromeExe, chromeOutDirWin, chromeOutDirWsl) {
  const url = new URL(route, baseUrl).toString();
  const file = `${slug(route)}.png`;
  const screenshotWinPath = `${chromeOutDirWin}\\${file}`;
  const screenshotWslPath = path.join(chromeOutDirWsl, file);
  const response = await fetch(url);
  const windowSize = process.env.CHROME_CLI_WINDOW_SIZE ?? '487,1056';
  const deviceScaleFactor = process.env.CHROME_CLI_DEVICE_SCALE_FACTOR ?? '1.3';

  await execFileAsync(chromeExe, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--force-device-scale-factor=${deviceScaleFactor}`,
    `--window-size=${windowSize}`,
    '--virtual-time-budget=4000',
    `--screenshot=${screenshotWinPath}`,
    url,
  ], { timeout: 120_000 });
  await copyFile(screenshotWslPath, path.join(outDir, file));

  const issues = [];
  if (response.status < 200 || response.status >= 400) issues.push(`HTTP ${response.status}`);
  return { route, status: response.status, screenshot: file, issues, checks: { capture: 'chrome-cli' } };
}

await mkdir(outDir, { recursive: true });

const results = [];
const chromeCliExecutable = process.env.CHROME_CLI_EXECUTABLE;
if (chromeCliExecutable) {
  const chromeOutDirWsl = process.env.CHROME_CLI_OUT_WSL ?? `/mnt/c/Users/seungmin/codex-v1qa/${runId}`;
  const chromeOutDirWin = process.env.CHROME_CLI_OUT_WIN ?? `C:\\Users\\seungmin\\codex-v1qa\\${runId}`;
  await mkdir(chromeOutDirWsl, { recursive: true });

  for (const route of routes) {
    try {
      results.push(await auditPageWithChromeCli(route, chromeCliExecutable, chromeOutDirWin, chromeOutDirWsl));
      console.log(`${route} OK`);
    } catch (error) {
      results.push({ route, status: 0, screenshot: null, issues: [error instanceof Error ? error.message : String(error)], checks: null });
      console.log(`${route} FAIL`);
    }
  }
} else {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.CHROME_EXECUTABLE;
  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  for (const route of routes) {
    try {
      results.push(await auditPage(page, route));
      console.log(`${route} OK`);
    } catch (error) {
      results.push({ route, status: 0, screenshot: null, issues: [error instanceof Error ? error.message : String(error)], checks: null });
      console.log(`${route} FAIL`);
    }
  }

  await browser.close();
}

const issueCount = results.reduce((sum, result) => sum + result.issues.length, 0);
const markdown = [
  `# V1 Mobile Design Acceptance`,
  '',
  `- Base URL: ${baseUrl}`,
  `- Run ID: ${runId}`,
  `- Viewport: 375x812`,
  `- Routes: ${results.length}`,
  `- Issues: ${issueCount}`,
  '',
  '| Route | Status | Screenshot | Issues |',
  '|---|---:|---|---|',
  ...results.map((result) => `| \`${result.route}\` | ${result.status} | ${result.screenshot ? `\`${result.screenshot}\`` : ''} | ${result.issues.length ? result.issues.join('<br>') : 'OK'} |`),
  '',
].join('\n');

await writeFile(path.join(outDir, 'results.json'), JSON.stringify({ baseUrl, runId, viewport: { width: 375, height: 812 }, results }, null, 2));
await writeFile(path.join(outDir, 'report.md'), markdown);

console.log(`report=${path.join(outDir, 'report.md')}`);
if (issueCount > 0) {
  process.exitCode = 1;
}
