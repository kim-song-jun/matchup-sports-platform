/**
 * 로컬 v1 스택에서 경기 운영 콘솔을 실제로 몰아 상태(라이브 → 2:2 → 정규 종료 →
 * 승부차기)를 만들고, 바뀐 화면을 390/768/1440 세 폭으로 캡처한다.
 * 헤더 dev 인증(localStorage teameet.v1.userId/userEmail)을 쓴다.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const WEB = process.env.WEB_BASE || 'http://localhost:3013';
const OUT = process.env.OUT_DIR || path.join(process.cwd(), '.screenshots', 'ops-console-step345');
const [tournamentId, fixtureId, userId, userEmail] = process.argv.slice(2);
const STAGE = process.env.STAGE || 'all';

if (!tournamentId || !fixtureId || !userId || !userEmail) {
  console.error('usage: node scripts/drive_local_ops_console.js <tournamentId> <fixtureId> <userId> <userEmail>');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const CONSOLE_PATH = `/tournament-ops/tournaments/${tournamentId}/fixtures/${fixtureId}/operate`;

async function dumpButtons(page, tag) {
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map((b) => ({
      t: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      a: b.getAttribute('aria-label'),
      d: b.disabled,
    })),
  );
  console.log(`[${tag}] buttons:`, JSON.stringify(labels, null, 0));
}

async function clickByText(page, text, { exact = false } = {}) {
  const loc = page.getByRole('button', { name: text, exact }).first();
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  await loc.click();
}

/** 확인 모달이 뜨면 확인 버튼을 누른다(없으면 조용히 통과). */
async function confirmIfPresent(page, tag = '') {
  const dialog = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last();
  try {
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    console.log(`  [confirm${tag ? ':' + tag : ''}] 모달 없음`);
    return false;
  }
  const text = (await dialog.innerText()).replace(/\s*\n+\s*/g, ' | ');
  const btns = await dialog.locator('button').allInnerTexts();
  console.log(`  [confirm${tag ? ':' + tag : ''}] ${text.slice(0, 240)} :: buttons=${JSON.stringify(btns)}`);
  const idx = btns.findIndex((t) => /확인|시작|종료|기록|계속|진행|네|예/.test(t) && !/취소|아니/.test(t));
  if (idx < 0) return false;
  await dialog.locator('button').nth(idx).click();
  await page.waitForTimeout(800);
  return true;
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [browser error]', m.text().slice(0, 200));
  });
  await page.goto(WEB + CONSOLE_PATH, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
  await page.getByRole('button', { name: '경기 시작' }).first().waitFor({ timeout: 60000 }).catch(() => {});

  const bodyText = async () => (await page.locator('body').innerText()).replace(/\s*\n+\s*/g, ' | ');
  const scoreLine = async () => {
    const m = (await bodyText()).match(/스코어 \| ([0-9]+ : [0-9]+)/);
    return m ? m[1] : '?';
  };

  // 1) 경기 시작
  if (await page.getByRole('button', { name: '경기 시작' }).count()) {
    await clickByText(page, '경기 시작');
    await page.waitForTimeout(1000);
    await confirmIfPresent(page, 'start');
    await page.waitForTimeout(3000);
    console.log('  after-start body:', (await bodyText()).slice(0, 500));
  }
  console.log('after start:', await scoreLine());

  /** 골 1건 기록. sideIndex 0=홈, 1=원정. captureAssist면 어시스트 시트를 캡처. */
  async function recordGoal(sideIndex, playerIndex, captureAssist) {
    await clickByText(page, '골', { exact: true });
    const dialog = page.locator('[role="dialog"]:visible').last();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(600);
    // LineupGrid: 사이드별 섹션 안의 선수 버튼
    const names = await dialog.evaluate((root) =>
      Array.from(root.querySelectorAll('button'))
        .map((b, i) => ({ i, t: (b.textContent || '').replace(/\s+/g, ' ').trim() }))
        .filter((x) => /(GOLEIRO|FIXO|ALA|PIVO|GK|DF|MF|FW)$/.test(x.t)),
    );
    console.log('  picker players:', JSON.stringify(names.map((n) => n.t)));
    const half = Math.floor(names.length / 2);
    const target = names[sideIndex === 0 ? playerIndex : half + playerIndex];
    if (!target) throw new Error('선수 버튼을 찾지 못했어요');
    console.log('  choose:', target.t);
    await dialog.locator('button').nth(target.i).click();
    await page.waitForTimeout(1200);
    await confirmIfPresent(page);
    await page.waitForTimeout(1500);
    // 어시스트 시트
    const sheet = page.locator('[role="dialog"]:visible').last();
    if (await sheet.count()) {
      const t = (await sheet.innerText()).replace(/\s*\n+\s*/g, ' | ');
      console.log('  sheet:', t.slice(0, 300));
      if (captureAssist && /어시스트/.test(t)) {
        return { sheetOpen: true };
      }
      const skip = page.getByRole('button', { name: /어시스트 없이 두기/ }).first();
      if (await skip.count()) {
        await skip.click();
        await page.waitForTimeout(1200);
      }
    }
    return { sheetOpen: false };
  }

  // 2) 2:2 만들기 — 첫 골에서 어시스트 시트를 세 폭으로 캡처
  const first = await recordGoal(0, 0, true);
  if (first.sheetOpen) {
    for (const w of [390, 768, 1440]) {
      await page.setViewportSize({ width: w, height: w === 390 ? 844 : w === 768 ? 1024 : 1000 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `assist-sheet-${w}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(500);
    const skip = page.getByRole('button', { name: /어시스트 없이 두기/ }).first();
    if (await skip.count()) {
      await skip.click();
      await page.waitForTimeout(1200);
    }
  }
  console.log('score after 1:', await scoreLine());
  await recordGoal(1, 0, false);
  await recordGoal(0, 1, false);
  await recordGoal(1, 1, false);
  console.log('score after 4 goals:', await scoreLine());

  // 이벤트 목록(팀 레일·색 점)이 살아있는 라이브 화면 캡처
  for (const w of [390, 768, 1440]) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : w === 768 ? 1024 : 1000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `live-events-${w}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 3) 정규 시간 종료까지: 전반 종료 → 후반 시작 → 후반 종료
  for (const label of [/전반 종료|피리어드 종료/, /후반 시작|피리어드 시작/, /후반 종료|피리어드 종료/]) {
    const btn = page.getByRole('button', { name: label }).first();
    if (await btn.count()) {
      await btn.click();
      await confirmIfPresent(page);
      await page.waitForTimeout(2500);
      console.log('  ran:', (await btn.textContent().catch(() => '')) || String(label));
    } else {
      console.log('  missing:', String(label));
      await dumpButtons(page, 'period-step');
    }
  }
  console.log('after regulation:', (await bodyText()).slice(0, 600));

  // 4) 승부차기 패널
  const pk = page.getByRole('button', { name: /승부차기 시작/ }).first();
  if (await pk.count()) {
    await pk.click();
    await confirmIfPresent(page);
    await page.waitForTimeout(1800);
    for (const w of [390, 768, 1440]) {
      await page.setViewportSize({ width: w, height: w === 390 ? 844 : w === 768 ? 1024 : 1000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `penalty-panel-${w}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  } else {
    console.log('승부차기 시작 버튼 없음');
    await dumpButtons(page, 'after-regulation');
  }

  console.log('DONE. files:', fs.readdirSync(OUT).join(', '));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
