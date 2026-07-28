#!/usr/bin/env node

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = (process.env.BASE_URL ?? 'http://localhost:3023').replace(/\/$/, '');
const runId = process.env.RUN_ID ?? `rich-content-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const outDir = path.resolve('output', 'playwright', 'visual-audit', runId);
const imagePath = path.resolve('apps/v1_web/public/mock/generated/futsal-rooftop.webp');
const appBasePath = new URL(baseUrl).pathname.replace(/\/$/, '');
const assetFixtures = [
  {
    assetId: '123e4567-e89b-42d3-a456-426614174000',
    url: '/uploads/2026/07/123e4567-e89b-42d3-a456-426614174000.webp',
  },
  {
    assetId: '223e4567-e89b-42d3-a456-426614174000',
    url: '/uploads/2026/07/223e4567-e89b-42d3-a456-426614174000.webp',
  },
  {
    assetId: '323e4567-e89b-42d3-a456-426614174000',
    url: '/uploads/2026/07/323e4567-e89b-42d3-a456-426614174000.webp',
  },
];
const browserAssetUrl = (url) => `${appBasePath}${url}`;

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  window.localStorage.setItem('teameet.v1.userEmail', 'admin@teameet.v1');
  window.localStorage.setItem('teameet.v1.userId', '00000000-0000-4000-8000-000000000001');
});

const issues = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const httpErrors = [];
const managedImageRequests = [];
const deletedAssetIds = [];
const createdNoticePayloads = [];
const createdPopupPayloads = [];
let uploadCount = 0;
let createdPopupRow = null;

const envelope = (data) => ({
  status: 'success',
  data,
  timestamp: new Date().toISOString(),
});

await context.route('**/api/v1/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;
  if (pathname.endsWith('/auth/me')) {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        user: { id: '00000000-0000-4000-8000-000000000001', email: 'admin@teameet.v1', onboardingStatus: 'completed' },
        profile: { displayName: 'QA 관리자' },
      })),
    });
  }
  if (pathname.endsWith('/admin/me')) {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        userId: '00000000-0000-4000-8000-000000000001',
        adminUserId: '00000000-0000-4000-8000-000000000002',
        adminRole: 'owner',
        status: 'active',
        capabilities: ['status:write', 'admin:write'],
        lastActiveAt: null,
      })),
    });
  }
  if (pathname.endsWith('/admin/content-assets') && request.method() === 'POST') {
    const asset = assetFixtures[uploadCount++];
    if (!asset) return route.fulfill({ status: 500, body: 'Unexpected extra upload' });
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        ...asset,
        status: 'temporary',
      })),
    });
  }
  const deleteAssetMatch = pathname.match(/\/admin\/content-assets\/([^/]+)$/);
  if (deleteAssetMatch && request.method() === 'DELETE') {
    const assetId = deleteAssetMatch[1];
    deletedAssetIds.push(assetId);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({ assetId, deleted: true })),
    });
  }
  if (pathname.endsWith('/admin/notices') && request.method() === 'POST') {
    const payload = request.postDataJSON();
    createdNoticePayloads.push(payload);
    const now = new Date().toISOString();
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        notice: {
          noticeId: 'notice-created',
          ...payload,
          body: 'Notice with image',
          contentVersion: 1,
          publishedAt: now,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      })),
    });
  }
  if (pathname.endsWith('/admin/popups') && request.method() === 'POST') {
    const payload = request.postDataJSON();
    createdPopupPayloads.push(payload);
    const now = new Date().toISOString();
    createdPopupRow = {
      popupId: 'popup-created',
      ...payload,
      body: 'Popup with image',
      contentVersion: 1,
      publishedAt: now,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        popup: createdPopupRow,
      })),
    });
  }
  if (pathname.endsWith('/admin/popups/popup-created') && request.method() === 'GET' && createdPopupRow) {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({ popup: createdPopupRow })),
    });
  }
  if ((pathname.endsWith('/admin/notices') || pathname.endsWith('/admin/popups')) && request.method() === 'GET') {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        items: [],
        pageInfo: { nextCursor: null, hasNext: false },
        summary: { total: 0, byStatus: {}, byCategory: {}, byAudience: {} },
      })),
    });
  }
  if (pathname.endsWith('/notifications')) {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(envelope({ items: [], pageInfo: { nextCursor: null, hasNext: false } })),
    });
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: `Unhandled QA route: ${pathname}` }) });
});

await context.route('**/uploads/**', (route) => route.fulfill({ path: imagePath, contentType: 'image/webp' }));

const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
page.on('request', (request) => {
  const pathname = new URL(request.url()).pathname;
  if (pathname.includes('/uploads/') && assetFixtures.some((asset) => pathname.includes(asset.assetId))) managedImageRequests.push(pathname);
});
page.on('response', (response) => {
  if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
});

async function assertNoOverflow(target, label) {
  const overflow = await target.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) issues.push(`${label}: horizontal overflow ${overflow}px`);
}

async function fillEditor(editor, text) {
  await editor.click();
  await page.getByRole('button', { name: '굵게' }).click();
  await editor.pressSequentially(text);
  await page.getByRole('button', { name: '굵게' }).click();
}

function documentImages(document) {
  const images = [];
  const visit = (node) => {
    if (node?.type === 'image') images.push(node);
    node?.content?.forEach(visit);
  };
  visit(document);
  return images;
}

try {
  await page.goto(`${baseUrl}/admin/notices`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: '공지사항 관리' }).waitFor({ timeout: 20_000 });
  const noticeForm = page.locator('form').last();
  await noticeForm.locator('input[maxlength="120"]').fill('리치 공지 미리보기 QA');
  const noticeEditor = noticeForm.locator('.ProseMirror');
  await fillEditor(noticeEditor, '웹과 모바일에서 같은 본문을 확인합니다.');
  await noticeForm.locator('input[type="file"]').setInputFiles(imagePath);
  await noticeEditor.locator('img').waitFor({ state: 'visible', timeout: 20_000 });

  const noticeFrame = page.frameLocator('iframe[title*="공지사항"]');
  await noticeFrame.getByRole('heading', { name: '리치 공지 미리보기 QA' }).waitFor({ timeout: 20_000 });
  await noticeFrame.getByText('웹과 모바일에서 같은 본문을 확인합니다.').waitFor();
  await noticeFrame.locator(`img[src="${browserAssetUrl(assetFixtures[0].url)}"]`).waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(outDir, 'notice-admin-web-preview.png'), fullPage: true });
  await page.getByRole('button', { name: '모바일' }).click();
  await page.waitForTimeout(250);
  const noticeFrameWidth = await page.locator('iframe[title*="공지사항"]').evaluate((element) => element.getBoundingClientRect().width);
  if (Math.abs(noticeFrameWidth - 390) > 1) issues.push(`notice mobile iframe width ${noticeFrameWidth}px`);
  await page.screenshot({ path: path.join(outDir, 'notice-admin-mobile-preview.png'), fullPage: true });
  await assertNoOverflow(page, 'notice admin');
  await noticeForm.getByRole('button', { name: '공지 저장' }).click();
  await page.waitForFunction(() => document.body.textContent?.includes('공지를 발행했어요.'));
  if (createdNoticePayloads.length !== 1) issues.push(`notice image save count ${createdNoticePayloads.length}`);
  const noticeImages = documentImages(createdNoticePayloads[0]?.content);
  if (noticeImages.length !== 1 || noticeImages[0]?.attrs?.assetId !== assetFixtures[0].assetId) {
    issues.push('notice save payload did not retain its managed image');
  }
  if (deletedAssetIds.includes(assetFixtures[0].assetId)) issues.push('saved notice image was deleted as temporary');

  await page.goto(`${baseUrl}/admin/popups`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('heading', { name: '팝업 관리' }).waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: '새 팝업' }).click();
  const popupForm = page.locator('form').last();
  await popupForm.locator('input[maxlength="120"]').fill('리치 팝업 미리보기 QA');
  const popupEditor = popupForm.locator('.ProseMirror');
  await fillEditor(popupEditor, '긴 팝업 본문도 내부에서 스크롤됩니다.');
  await popupForm.locator('input[type="file"]').setInputFiles(imagePath);
  await popupEditor.locator('img').waitFor({ state: 'visible', timeout: 20_000 });
  const popupFrame = page.frameLocator('iframe[title*="팝업"]');
  const dialog = popupFrame.getByRole('dialog', { name: '리치 팝업 미리보기 QA' });
  await dialog.waitFor({ state: 'visible', timeout: 20_000 });
  await dialog.getByText('긴 팝업 본문도 내부에서 스크롤됩니다.').waitFor();
  await dialog.locator(`img[src="${browserAssetUrl(assetFixtures[1].url)}"]`).waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(outDir, 'popup-admin-web-preview.png'), fullPage: true });
  await page.getByRole('button', { name: '모바일' }).click();
  await page.waitForTimeout(250);
  const popupFrameWidth = await page.locator('iframe[title*="팝업"]').evaluate((element) => element.getBoundingClientRect().width);
  if (Math.abs(popupFrameWidth - 390) > 1) issues.push(`popup mobile iframe width ${popupFrameWidth}px`);
  const dialogLayout = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, width: window.innerWidth };
  });
  if (dialogLayout.left < -1 || dialogLayout.right > dialogLayout.width + 1) issues.push('popup dialog escapes the mobile preview viewport');
  await page.screenshot({ path: path.join(outDir, 'popup-admin-mobile-preview.png'), fullPage: true });
  await assertNoOverflow(page, 'popup admin');
  await popupForm.getByRole('button', { name: '팝업 생성' }).click();
  await page.waitForFunction(() => document.body.textContent?.includes('팝업을 공개했어요.'));
  if (createdPopupPayloads.length !== 1) issues.push(`popup image save count ${createdPopupPayloads.length}`);
  const popupImages = documentImages(createdPopupPayloads[0]?.content);
  if (popupImages.length !== 1 || popupImages[0]?.attrs?.assetId !== assetFixtures[1].assetId) {
    issues.push('popup save payload did not retain its managed image');
  }
  if (deletedAssetIds.includes(assetFixtures[1].assetId)) issues.push('saved popup image was deleted as temporary');

  await page.getByRole('button', { name: '새 팝업' }).click();
  const cancelForm = page.locator('form').last();
  await cancelForm.locator('input[maxlength="120"]').fill('취소 이미지 QA');
  await cancelForm.locator('input[type="file"]').setInputFiles(imagePath);
  await cancelForm.locator('.ProseMirror img').waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByRole('button', { name: '편집 닫기' }).click();
  await page.waitForTimeout(250);
  if (!deletedAssetIds.includes(assetFixtures[2].assetId)) issues.push('popup cancel did not delete its temporary managed image');
  if (uploadCount !== assetFixtures.length) issues.push(`managed image upload count ${uploadCount}/${assetFixtures.length}`);
  const invalidImageRequests = managedImageRequests.filter(
    (pathname) => !assetFixtures.some((asset) => pathname === browserAssetUrl(asset.url)),
  );
  if (invalidImageRequests.length) {
    issues.push(`managed image requested outside basePath: ${managedImageRequests.join(', ')}`);
  }
} catch (error) {
  issues.push(error instanceof Error ? error.stack ?? error.message : String(error));
  await page.screenshot({ path: path.join(outDir, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  await context.close();
  await browser.close();
}

const report = {
  runId,
  baseUrl,
  issues,
  consoleErrors,
  pageErrors,
  failedRequests,
  httpErrors,
  verdict: issues.length || consoleErrors.length || pageErrors.length || failedRequests.length || httpErrors.length ? 'FAIL' : 'PASS',
};
await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.verdict !== 'PASS') process.exitCode = 1;
