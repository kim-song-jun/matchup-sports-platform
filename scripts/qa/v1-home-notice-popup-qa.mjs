#!/usr/bin/env node

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:13013/v1').replace(/\/$/, '');
const runId = process.env.RUN_ID ?? `home-notice-popup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const outDir = path.join('output', 'playwright', 'visual-audit', runId);
const userEmail = process.env.V1_QA_USER_EMAIL ?? 'host@teameet.v1';
const viewports = [
  { key: 'mobile', width: 390, height: 844, isMobile: true },
  { key: 'tablet', width: 768, height: 1024, isMobile: false },
  { key: 'desktop', width: 1440, height: 900, isMobile: false },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
  });
  await context.addInitScript((email) => {
    window.localStorage.setItem('teameet.v1.userEmail', email);
    window.localStorage.removeItem('teameet.v1.userId');
    if (window.sessionStorage.getItem('__v1_home_notice_qa_reset__')) return;
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith('teameet:v1:home-notice:hidden-until:')) {
        window.localStorage.removeItem(key);
      }
    }
    window.sessionStorage.setItem('__v1_home_notice_qa_reset__', '1');
  }, userEmail);

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const networkErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'failed';
    const url = request.url();
    // Next Link의 speculative RSC prefetch는 reload/context close 때 정상적으로 취소된다.
    if (failure === 'net::ERR_ABORTED' && new URL(url).searchParams.has('_rsc')) return;
    networkErrors.push(`${request.method()} ${url} — ${failure}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith(new URL(baseUrl).origin)) {
      networkErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });

  const issues = [];
  let noticeTitle = null;
  let hiddenUntil = null;

  try {
    const response = await page.goto(`${baseUrl}/home`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    if (!response?.ok()) issues.push(`home HTTP ${response?.status() ?? 0}`);

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 30_000 });
    noticeTitle = await dialog.getByRole('heading').innerText();
    await dialog.getByRole('link', { name: '자세히 보기' }).waitFor({ state: 'visible' });
    await dialog.getByRole('button', { name: '일주일 안 보기' }).waitFor({ state: 'visible' });

    const layout = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const buttons = [...element.querySelectorAll('button, a')].map((button) => {
        const buttonRect = button.getBoundingClientRect();
        return { text: button.textContent?.trim() ?? '', width: buttonRect.width, height: buttonRect.height };
      });
      return {
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        documentScrollWidth: document.documentElement.scrollWidth,
        buttons,
      };
    });

    if (layout.rect.left < 0 || layout.rect.right > layout.viewport.width) issues.push('dialog horizontal overflow');
    if (layout.rect.top < 0 || layout.rect.bottom > layout.viewport.height) issues.push('dialog vertical overflow');
    const horizontalCenterDelta = Math.abs((layout.rect.left + layout.rect.right) / 2 - layout.viewport.width / 2);
    const verticalCenterDelta = Math.abs((layout.rect.top + layout.rect.bottom) / 2 - layout.viewport.height / 2);
    if (horizontalCenterDelta > 2) issues.push(`dialog is not horizontally centered (${horizontalCenterDelta}px)`);
    if (verticalCenterDelta > 2) issues.push(`dialog is not vertically centered (${verticalCenterDelta}px)`);
    if (layout.documentScrollWidth > layout.viewport.width + 1) issues.push('page horizontal overflow');
    for (const button of layout.buttons) {
      if (button.height < 44) issues.push(`small action target: ${button.text} (${button.height}px)`);
    }

    await page.screenshot({ path: path.join(outDir, `${viewport.key}-popup-open.png`), fullPage: false });

    await dialog.getByRole('button', { name: '일주일 안 보기' }).click();
    await dialog.waitFor({ state: 'hidden' });
    hiddenUntil = await page.evaluate(() => {
      const key = Object.keys(window.localStorage).find((item) => item.startsWith('teameet:v1:home-notice:hidden-until:'));
      return key ? Number(window.localStorage.getItem(key)) : null;
    });
    if (!hiddenUntil || hiddenUntil < Date.now() + 6 * 24 * 60 * 60 * 1000) issues.push('seven-day suppression timestamp missing');

    await page.screenshot({ path: path.join(outDir, `${viewport.key}-popup-hidden.png`), fullPage: false });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(750);
    if (await page.getByRole('dialog').count()) issues.push('suppressed notice reopened after reload');
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
    await page.screenshot({ path: path.join(outDir, `${viewport.key}-failure.png`), fullPage: false }).catch(() => {});
  }

  issues.push(...consoleErrors.map((error) => `console: ${error}`));
  issues.push(...pageErrors.map((error) => `pageerror: ${error}`));
  issues.push(...networkErrors.map((error) => `network: ${error}`));
  results.push({ viewport, noticeTitle, hiddenUntil, consoleErrors, pageErrors, networkErrors, issues });
  console.log(`${viewport.key}: ${issues.length ? `FAIL (${issues.length})` : 'PASS'}`);
  await context.close();
}

await browser.close();

const issueCount = results.reduce((sum, result) => sum + result.issues.length, 0);
const report = [
  '# V1 Home Notice Popup QA',
  '',
  `- Base URL: ${baseUrl}`,
  `- Run ID: ${runId}`,
  `- Persona: ${userEmail}`,
  `- Viewports: ${viewports.map((item) => `${item.key} ${item.width}x${item.height}`).join(', ')}`,
  `- Verdict: ${issueCount === 0 ? 'PASS' : `FAIL (${issueCount} issues)`}`,
  '',
  '| Viewport | Notice | Console | Page | Network | Issues |',
  '|---|---|---:|---:|---:|---|',
  ...results.map((result) =>
    `| ${result.viewport.key} | ${result.noticeTitle ?? '-'} | ${result.consoleErrors.length} | ${result.pageErrors.length} | ${result.networkErrors.length} | ${result.issues.length ? result.issues.join('<br>') : 'OK'} |`,
  ),
  '',
].join('\n');

await writeFile(path.join(outDir, 'results.json'), JSON.stringify({ baseUrl, runId, userEmail, issueCount, results }, null, 2));
await writeFile(path.join(outDir, 'report.md'), report);
console.log(`report=${path.join(outDir, 'report.md')}`);
if (issueCount > 0) process.exitCode = 1;
