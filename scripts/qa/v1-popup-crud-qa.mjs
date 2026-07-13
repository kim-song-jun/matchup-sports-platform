#!/usr/bin/env node

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:13013/v1').replace(/\/$/, '');
const runId = process.env.RUN_ID ?? `popup-crud-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const outDir = path.join('output', 'playwright', 'visual-audit', runId);
const adminEmail = process.env.V1_QA_ADMIN_EMAIL ?? 'admin@teameet.v1';
const userEmail = process.env.V1_QA_USER_EMAIL ?? 'host@teameet.v1';
const marker = Date.now().toString(36);
const popupTitle = `QA 중앙 팝업 ${marker}`;
const initialBody = '관리자 화면에서 생성한 실제 팝업입니다. 홈 화면 중앙 노출을 확인합니다.';
const updatedBody = '수정 완료: 생성, 상세 조회, 수정, 홈 중앙 노출, 삭제 계약을 검증합니다.';
const viewports = [
  { key: 'mobile', width: 390, height: 844, isMobile: true },
  { key: 'tablet', width: 768, height: 1024, isMobile: false },
  { key: 'desktop', width: 1440, height: 900, isMobile: false },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let createdNoticeId = null;

function observe(page, scope) {
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
    if (failure === 'net::ERR_ABORTED' && new URL(url).searchParams.has('_rsc')) return;
    networkErrors.push(`${request.method()} ${url} — ${failure}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith(new URL(baseUrl).origin)) {
      networkErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return { scope, consoleErrors, pageErrors, networkErrors, issues: [] };
}

async function authenticatedContext(email, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
  });
  await context.addInitScript((value) => {
    window.localStorage.setItem('teameet.v1.userEmail', value);
    window.localStorage.removeItem('teameet.v1.userId');
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith('teameet:v1:home-notice:hidden-until:')) window.localStorage.removeItem(key);
    }
  }, email);
  return context;
}

try {
  const desktop = viewports[2];
  const context = await authenticatedContext(adminEmail, desktop);
  const page = await context.newPage();
  const result = observe(page, 'admin-crud');
  results.push(result);

  try {
    const response = await page.goto(`${baseUrl}/admin/popups`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    if (!response?.ok()) result.issues.push(`admin route HTTP ${response?.status() ?? 0}`);
    await page.getByRole('heading', { name: '팝업 관리' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('link', { name: '팝업' }).waitFor({ state: 'visible' });

    await page.getByRole('button', { name: '새 팝업' }).click();
    await page.getByLabel('제목').fill(popupTitle);
    await page.getByLabel('본문').fill(initialBody);
    const createResponsePromise = page.waitForResponse((item) => item.request().method() === 'POST' && item.url().includes('/admin/notices'));
    await page.getByRole('button', { name: '팝업 생성' }).click();
    const createResponse = await createResponsePromise;
    if (!createResponse.ok()) result.issues.push(`create HTTP ${createResponse.status()}`);
    const createJson = await createResponse.json();
    createdNoticeId = createJson?.data?.notice?.noticeId ?? null;
    if (!createdNoticeId) result.issues.push('created notice id missing');

    await page.getByRole('heading', { name: popupTitle }).waitFor({ state: 'visible', timeout: 20_000 });
    const createdCard = page.locator('li').filter({ hasText: popupTitle });
    await createdCard.getByRole('button', { name: '조회' }).click();
    await page.getByText(initialBody, { exact: true }).last().waitFor({ state: 'visible' });

    await page.getByRole('button', { name: '수정하기' }).click();
    await page.getByLabel('본문').fill(updatedBody);
    const updateResponsePromise = page.waitForResponse((item) => item.request().method() === 'PATCH' && item.url().includes(`/admin/notices/${createdNoticeId}`));
    await page.getByRole('button', { name: '수정 저장' }).click();
    const updateResponse = await updateResponsePromise;
    if (!updateResponse.ok()) result.issues.push(`update HTTP ${updateResponse.status()}`);
    await page.getByText(updatedBody, { exact: true }).last().waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(outDir, 'admin-desktop-crud-complete.png'), fullPage: true });
  } catch (error) {
    result.issues.push(error instanceof Error ? error.message : String(error));
    await page.screenshot({ path: path.join(outDir, 'admin-crud-failure.png'), fullPage: true }).catch(() => {});
  }
  await context.close();

  if (createdNoticeId) {
    for (const viewport of viewports) {
      const adminContext = await authenticatedContext(adminEmail, viewport);
      const adminPage = await adminContext.newPage();
      const result = observe(adminPage, `admin-${viewport.key}`);
      results.push(result);
      try {
        await adminPage.goto(`${baseUrl}/admin/popups`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
        await adminPage.getByRole('heading', { name: '팝업 관리' }).waitFor({ state: 'visible', timeout: 30_000 });
        await adminPage.getByLabel('팝업 검색').fill(popupTitle);
        const card = adminPage.locator('li').filter({ hasText: popupTitle });
        await card.waitFor({ state: 'visible', timeout: 20_000 });
        await card.getByRole('button', { name: '조회' }).click();
        await adminPage.getByText(updatedBody, { exact: true }).last().waitFor({ state: 'visible' });
        const overflow = await adminPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) result.issues.push(`horizontal overflow ${overflow}px`);
        await adminPage.screenshot({ path: path.join(outDir, `admin-${viewport.key}.png`), fullPage: true });
      } catch (error) {
        result.issues.push(error instanceof Error ? error.message : String(error));
      }
      await adminContext.close();

      const userContext = await authenticatedContext(userEmail, viewport);
      const homePage = await userContext.newPage();
      const homeResult = observe(homePage, `home-${viewport.key}`);
      results.push(homeResult);
      try {
        await homePage.goto(`${baseUrl}/home`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
        const dialog = homePage.getByRole('dialog', { name: popupTitle });
        await dialog.waitFor({ state: 'visible', timeout: 30_000 });
        const layout = await dialog.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            centerX: (rect.left + rect.right) / 2,
            centerY: (rect.top + rect.bottom) / 2,
            viewportX: window.innerWidth / 2,
            viewportY: window.innerHeight / 2,
            overflowX: document.documentElement.scrollWidth - window.innerWidth,
          };
        });
        const deltaX = Math.abs(layout.centerX - layout.viewportX);
        const deltaY = Math.abs(layout.centerY - layout.viewportY);
        if (deltaX > 2) homeResult.issues.push(`horizontal center delta ${deltaX}px`);
        if (deltaY > 2) homeResult.issues.push(`vertical center delta ${deltaY}px`);
        if (layout.overflowX > 1) homeResult.issues.push(`horizontal overflow ${layout.overflowX}px`);
        await homePage.screenshot({ path: path.join(outDir, `home-${viewport.key}-centered.png`), fullPage: false });
      } catch (error) {
        homeResult.issues.push(error instanceof Error ? error.message : String(error));
      }
      await userContext.close();
    }
  }
} finally {
  if (createdNoticeId) {
    const cleanupContext = await authenticatedContext(adminEmail, viewports[2]);
    const cleanupResponse = await cleanupContext.request.delete(`${baseUrl}/api/v1/admin/notices/${createdNoticeId}`, {
      headers: { 'x-v1-user-email': adminEmail },
    });
    if (!cleanupResponse.ok()) {
      results.push({ scope: 'cleanup', consoleErrors: [], pageErrors: [], networkErrors: [], issues: [`delete cleanup HTTP ${cleanupResponse.status()}`] });
    }
    await cleanupContext.close();
  }
  await browser.close();
}

for (const result of results) {
  result.issues.push(...result.consoleErrors.map((item) => `console: ${item}`));
  result.issues.push(...result.pageErrors.map((item) => `pageerror: ${item}`));
  result.issues.push(...result.networkErrors.map((item) => `network: ${item}`));
}
const issueCount = results.reduce((sum, result) => sum + result.issues.length, 0);
const report = [
  '# V1 Admin Popup CRUD & Centered Home Popup QA',
  '',
  `- Base URL: ${baseUrl}`,
  `- Run ID: ${runId}`,
  `- Admin persona: ${adminEmail}`,
  `- User persona: ${userEmail}`,
  `- CRUD: create → detail → update → delete cleanup`,
  `- Verdict: ${issueCount === 0 ? 'PASS' : `FAIL (${issueCount} issues)`}`,
  '',
  '| Scope | Console | Page | Network | Issues |',
  '|---|---:|---:|---:|---|',
  ...results.map((result) => `| ${result.scope} | ${result.consoleErrors.length} | ${result.pageErrors.length} | ${result.networkErrors.length} | ${result.issues.length ? result.issues.join('<br>') : 'OK'} |`),
  '',
].join('\n');
await writeFile(path.join(outDir, 'results.json'), JSON.stringify({ baseUrl, runId, popupTitle, createdNoticeId, issueCount, results }, null, 2));
await writeFile(path.join(outDir, 'report.md'), report);
console.log(`verdict=${issueCount === 0 ? 'PASS' : 'FAIL'}`);
console.log(`report=${path.join(outDir, 'report.md')}`);
if (issueCount > 0) process.exitCode = 1;
