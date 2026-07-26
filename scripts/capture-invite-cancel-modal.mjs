/**
 * PR #173 — 초대 취소 확인 모달 캡처.
 *
 * confirmLabel('취소')과 기본 cancelLabel('취소')이 같아 버튼 두 개가 모두 "취소"로
 * 보이던 문제를 고친 뒤의 화면을 남긴다. 팀 owner로 멤버 관리 화면에 들어가
 * 초대 탭 → 초대 취소를 눌러 모달이 열린 상태를 찍는다.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.CAPTURE_BASE ?? 'http://localhost:3014';
const OUT = process.env.CAPTURE_OUT ?? path.resolve('.screenshots/team-join-status');

// 강남 러닝 크루의 owner (pending 초대 2건 보유)
const USER_ID = '6be1407f-8ecf-4915-a87f-2cb352d1e355';
const USER_EMAIL = 'owner@teameet.v1';
const TEAM_ID = '00000000-0000-4000-8000-000000000101';

const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'desktop', width: 1440, height: 900 },
];

async function passTermsGateIfPresent(page) {
  const gate = page.getByText('새 필수 약관을 확인해 주세요');
  if (!(await gate.isVisible().catch(() => false))) return;
  await page.getByText('전체 동의', { exact: true }).click();
  await page.getByRole('button', { name: /동의하고 계속|계속|확인/ }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
    });
    await context.addInitScript(
      ([userId, email]) => {
        localStorage.setItem('teameet.v1.userId', userId);
        localStorage.setItem('teameet.v1.userEmail', email);
      },
      [USER_ID, USER_EMAIL],
    );

    const page = await context.newPage();
    await page.goto(`${BASE}/teams/${TEAM_ID}/members`, { waitUntil: 'networkidle' });
    await passTermsGateIfPresent(page);
    await page.waitForTimeout(3000);

    // 초대 탭으로 이동 (라벨은 "초대 <건수>" 형태)
    await page.getByRole('button', { name: /^초대 \d+$/ }).click();
    await page.waitForTimeout(600);

    // 첫 초대의 취소 버튼 → 확인 모달
    await page.getByRole('button', { name: /님 초대 취소$/ }).first().click();
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(500);

    const file = path.join(OUT, `invite-cancel-modal--${viewport.key}.png`);
    await page.screenshot({ path: file });
    console.log(`captured ${file}`);

    await context.close();
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
