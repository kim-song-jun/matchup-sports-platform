// alpha 실측: 승부차기 표시(항목 4b) · 경기 영상(항목 5) · 최종결과 조별리그 조회(항목 6)
//
// 사용법:
//   node scripts/verify_alpha_penalty_video_group.mjs
//
// 대상 대회는 alpha 공개 API 에서 실제 penalties 데이터가 있는 것으로 확인된 대회다.
// (score 3-3, penalties 3-0, round=결승, hasVideo=true)
//
// 이 스크립트는 "보인다/안 보인다"를 눈으로 판단하지 않고 computed style 값까지 뽑는다.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr';
const TID = process.env.TID || '7e3c0f79-c2ee-495c-8ef9-f958785b8460';
const OUT = process.env.OUT_DIR || '/private/tmp/alpha-verify-penalty';

mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);

async function settle(page) {
  // React Query 가 채우는 화면이라 networkidle 만으로는 이르다.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const report = {};

try {
  // ---------- A) 일정 화면의 승부차기 표시 ----------
  await page.goto(`${BASE}/tournaments/${TID}/schedule`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await settle(page);

  report.schedule = await page.evaluate(() => {
    const re = /승부차기/;
    const out = { pageHasPenaltyText: false, nodes: [], bodyTextSample: '' };
    out.bodyTextSample = (document.body.innerText || '').slice(0, 400);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    const seen = new Set();
    while (walker.nextNode()) {
      const el = walker.currentNode;
      // 자식이 없는(=텍스트를 실제로 소유한) 요소만
      if (el.children.length > 0) continue;
      const t = (el.textContent || '').trim();
      if (!re.test(t)) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      // 위쪽 형제/조상에서 본 스코어를 찾아 "스코어 밑" 배치를 확인
      let scoreText = null;
      let p = el.parentElement;
      for (let i = 0; i < 4 && p; i += 1, p = p.parentElement) {
        const m = (p.innerText || '').match(/(\d+)\s*[-–:]\s*(\d+)/);
        if (m && !/승부차기/.test(m[0])) { scoreText = m[0]; break; }
      }
      out.nodes.push({
        text: t,
        fontSizePx: cs.fontSize,
        color: cs.color,
        top: Math.round(rect.top),
        nearbyScore: scoreText,
      });
      out.pageHasPenaltyText = true;
    }
    return out;
  });
  log('[A] schedule penalty nodes:', JSON.stringify(report.schedule.nodes, null, 1));
  await page.screenshot({ path: `${OUT}/schedule-390.png`, fullPage: true });

  // ---------- B) 최종결과 화면: 조별리그 경기 조회 + 경기 영상 ----------
  await page.goto(`${BASE}/tournaments/${TID}/results`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await settle(page);

  report.resultsInitial = await page.evaluate(() => {
    const text = document.body.innerText || '';
    const grab = (re) => (text.match(re) || [null])[0];
    return {
      title: document.title,
      hasGroupToggle: /조별리그\s*경기/.test(text),
      groupToggleLabel: grab(/조별리그\s*경기[^\n]*/),
      hasVideoTab: /경기\s*영상/.test(text),
      videoTabLabel: grab(/경기\s*영상[^\n]*/),
      textSample: text.slice(0, 600),
    };
  });
  log('[B] results initial:', JSON.stringify(report.resultsInitial, null, 1));
  await page.screenshot({ path: `${OUT}/results-390.png`, fullPage: true });

  // 조별리그 토글 펼치기
  const groupBtn = page.locator('button', { hasText: /조별리그\s*경기/ }).first();
  if (await groupBtn.count()) {
    await groupBtn.click();
    await page.waitForTimeout(1200);
    report.groupExpanded = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const idx = text.indexOf('조별리그');
      return {
        expandedSample: text.slice(idx, idx + 900),
        linkCount: document.querySelectorAll('a[href*="/fixtures/"], a[href*="/games/"]').length,
      };
    });
    log('[B2] group expanded:', JSON.stringify(report.groupExpanded, null, 1));
    await page.screenshot({ path: `${OUT}/results-group-expanded-390.png`, fullPage: true });
  } else {
    report.groupExpanded = { error: '조별리그 경기 토글 버튼을 찾지 못함' };
    log('[B2] group toggle NOT FOUND');
  }

  // 경기 영상 탭
  const videoTab = page.locator('button, a', { hasText: /경기\s*영상/ }).first();
  if (await videoTab.count()) {
    await videoTab.click();
    await page.waitForTimeout(2000);
    report.video = await page.evaluate(() => ({
      videoEls: document.querySelectorAll('video').length,
      iframeEls: document.querySelectorAll('iframe').length,
      sources: Array.from(document.querySelectorAll('video source, video, iframe'))
        .map((e) => e.getAttribute('src'))
        .filter(Boolean)
        .slice(0, 5),
      textSample: (document.body.innerText || '').slice(0, 500),
    }));
    log('[C] video:', JSON.stringify(report.video, null, 1));
    await page.screenshot({ path: `${OUT}/results-video-390.png`, fullPage: true });
  } else {
    report.video = { error: '경기 영상 탭을 찾지 못함' };
    log('[C] video tab NOT FOUND');
  }
} catch (err) {
  report.fatal = String(err && err.stack ? err.stack : err);
  log('FATAL', report.fatal);
} finally {
  await page.screenshot({ path: `${OUT}/last.png` }).catch(() => {});
  await browser.close();
}

log('\n===== REPORT JSON =====');
log(JSON.stringify(report, null, 1));
log(`\n스크린샷: ${OUT}`);
