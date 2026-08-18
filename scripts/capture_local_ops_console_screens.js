/**
 * 이미 만들어 둔 로컬 경기(2:2 · 정규 시간 종료)에서 바뀐 화면을 3폭으로 캡처한다.
 * - 골 토스트(390 찌그러짐 수정 확인) → 그 골은 곧바로 되돌려 2:2 를 복원
 * - 어시스트 시트
 * - 승부차기 패널
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const WEB = process.env.WEB_BASE || 'http://localhost:3013';
const OUT = process.env.OUT_DIR || path.join(process.cwd(), '.screenshots', 'ops-console-step345');
const [tournamentId, fixtureId, userId, userEmail] = process.argv.slice(2);
if (!tournamentId || !fixtureId || !userId || !userEmail) {
  console.error('usage: node scripts/capture_local_ops_console_screens.js <tournamentId> <fixtureId> <userId> <userEmail>');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = [
  [390, 844],
  [768, 1024],
  [1440, 1000],
];

async function confirmIfPresent(page, tag = '') {
  const dialog = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last();
  try {
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    return false;
  }
  const btns = await dialog.locator('button').allInnerTexts();
  const idx = btns.findIndex((t) => /확인|시작|종료|기록|계속|진행|되돌리기/.test(t) && !/취소/.test(t));
  console.log(`  [confirm${tag ? ':' + tag : ''}] ${JSON.stringify(btns)} -> ${idx}`);
  if (idx < 0) return false;
  await dialog.locator('button').nth(idx).click();
  await page.waitForTimeout(900);
  return true;
}

async function shoot(page, name, { fullPage = true } = {}) {
  for (const [w, h] of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`), fullPage });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(400);
  console.log(`  captured ${name}`);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(
    ([id, email]) => {
      try {
        localStorage.setItem('teameet.v1.userId', id);
        localStorage.setItem('teameet.v1.userEmail', email);
      } catch {}
    },
    [userId, userEmail],
  );
  const page = await context.newPage();
  await page.goto(`${WEB}/tournament-ops/tournaments/${tournamentId}/fixtures/${fixtureId}/operate`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForTimeout(6000);

  const MODE = process.env.MODE || 'ended';

  if (MODE === 'live') {
    // 아직 시작 전이면 경기를 시작한다 — 골은 LIVE 피리어드가 있어야 기록된다.
    const startBtn = page.getByRole('button', { name: '경기 시작' }).first();
    if ((await startBtn.count()) && (await startBtn.isEnabled())) {
      await startBtn.click();
      await page.waitForTimeout(900);
      await confirmIfPresent(page, 'start');
      await page.waitForTimeout(2500);
    }
    // 골 토스트 — 390 에서 세로로 찌그러지던 자리. LIVE 경기에서만 기록할 수 있다.
    await page.getByRole('button', { name: '골', exact: true }).first().click();
    const picker = page.locator('[role="dialog"]:visible').last();
    await picker.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(600);
    const names = await picker.evaluate((root) =>
      Array.from(root.querySelectorAll('button'))
        .map((b, i) => ({ i, t: (b.textContent || '').replace(/\s+/g, ' ').trim() }))
        .filter((x) => /(GOLEIRO|FIXO|ALA|PIVO)$/.test(x.t)),
    );
    await picker.locator('button').nth(names[0].i).click();
    await page.waitForTimeout(900);
    await confirmIfPresent(page, 'goal');
    await page.waitForTimeout(1200);
    for (const [w, h] of WIDTHS) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `goal-toast-${w}.png`) });
    }
    console.log('  captured goal-toast');
    console.log('DONE:', fs.readdirSync(OUT).sort().join(', '));
    await browser.close();
    return;
  }

  // 3) 어시스트 시트
  const assistBtn = page.getByRole('button', { name: '이 골에 어시스트 추가' }).first();
  await assistBtn.click();
  await page.waitForTimeout(1200);
  await shoot(page, 'assist-sheet', { fullPage: false });
  const close = page.getByRole('button', { name: /어시스트 없이 두기/ }).first();
  if (await close.count()) {
    await close.click();
    await page.waitForTimeout(1200);
  }

  // 4) 승부차기 패널
  const pk = page.getByRole('button', { name: /승부차기 시작/ }).first();
  if (await pk.count()) {
    await pk.click();
    await confirmIfPresent(page, 'penalty');
    await page.waitForTimeout(1500);
    await shoot(page, 'penalty-panel', { fullPage: false });
  } else {
    console.log('  승부차기 시작 버튼 없음:', (await page.locator('body').innerText()).slice(0, 400));
  }

  console.log('DONE:', fs.readdirSync(OUT).sort().join(', '));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
