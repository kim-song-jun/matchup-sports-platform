/**
 * 순위·브래킷 여백 수정안의 사전 검증.
 *
 * 이 저장소는 로컬 next 서버로 검증하지 않는다(프로젝트 규칙 — 실배포 alpha가 ground
 * truth). 그래서 머지 전에는 alpha 실화면에 이번 변경과 같은 델타(마크업 제거 + CSS)를
 * 주입해 같은 지표를 before/after로 재는 방식으로 방향을 확인한다. 배포 후에는 같은
 * 지표를 주입 없이 다시 재서 실제 값과 일치하는지 확인해야 한다(이 스크립트의 --deployed).
 *
 * 사용: node scripts/verify-bracket-spacing-delta.mjs [--deployed]
 */
import { chromium } from 'playwright';

const DEPLOYED = process.argv.includes('--deployed');
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > -1 ? process.argv[shotsIdx + 1] : null;
if (SHOTS) { const { mkdirSync } = await import('node:fs'); mkdirSync(SHOTS, { recursive: true }); }
const BASE = 'https://alpha.teameet.co.kr';
const TOURNAMENTS = [
  { key: 'completed(결승만)', id: '305ccc98-5b59-4c4d-99a0-29b9168390c4' },
  { key: 'inprogress(4강+결승)', id: 'aa100000-0000-4000-8000-000000000004' },
];
const WIDTHS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
];

/** 이번 변경과 같은 내용을 라이브 DOM에 주입 (배포 후 측정에서는 호출하지 않는다) */
const applyDelta = () => {
  document.querySelector('.tm-bracket-page-eyebrow')?.remove();

  const page = document.querySelector('.tm-tourn-sub-page');
  if (page) page.style.paddingBottom = '16px';

  // 결선 라운드 수 ≤ 2 → slim-bracket 클래스 (배포본에서는 서버가 붙인다)
  const grid = document.querySelector('.tm-bracket-page-grid');
  const roundLabels = new Set(
    [...document.querySelectorAll('.tm-bk2-pill')].map((p) => p.textContent?.trim()),
  );
  if (grid && roundLabels.size === 1) {
    grid.classList.add('tm-bracket-page-grid-slim-bracket');
  }

  // 일정 탭 래퍼 (배포본에서는 .tm-bracket-schedule-pane 마크업)
  const flexPane = document.querySelector('.tm-tourn-sub-page > div[style*="flex: 1"]');
  const scheduleRoot = flexPane?.firstElementChild;
  if (scheduleRoot && !document.querySelector('.tm-tourn-sub-grid')) {
    scheduleRoot.classList.add('tm-bracket-schedule-pane');
  }

  const css = `
    @media (max-width: 767px) {
      .tm-bracket-page-intro { padding: 16px 20px; }
      .tm-bracket-page-intro p { display: none; }
    }
    @media (max-width: 479px) { .tm-bracket-page-intro { gap: 12px; flex-direction: row; } }
    .tm-standings-table td button > svg { margin-left: 2px !important; flex-shrink: 0; }
    .tm-standings-table th:nth-child(3), .tm-standings-table td:nth-child(3) { width: 18%; min-width: 56px; }
    .tm-standings-table th:nth-child(4), .tm-standings-table td:nth-child(4) { width: 13%; min-width: 44px; }
    .tm-standings-table th:nth-child(5), .tm-standings-table td:nth-child(5) { width: 13%; min-width: 44px; }
    @media (min-width: 1024px) {
      .tm-bracket-page-grid.tm-tourn-sub-grid-6040.tm-bracket-page-grid-slim-bracket,
      .tm-bracket-page-grid.tm-tourn-sub-grid-2col.tm-bracket-page-grid-slim-bracket {
        grid-template-columns: minmax(320px, 370px) minmax(280px, 460px);
        justify-content: center;
      }
      .tm-bracket-schedule-pane { max-width: 840px; margin: 0 auto; width: 100%; }
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
};

const measure = () => {
  const scroller = document.querySelector('.tm-scroll-area') ?? document.scrollingElement;
  const areaTop = Math.round(scroller.getBoundingClientRect().top);
  const areaH = scroller.clientHeight;
  const tablist = document.querySelector('[role="tablist"][aria-label="보기 방식"]');
  const chrome = tablist ? Math.round(tablist.getBoundingClientRect().bottom) - areaTop : null;

  // 순위표 첫 행: 팀명 끝 ~ 전적 시작 사이 빈 띠
  let standingsGap = null;
  let standingsRowW = null;
  const tr = document.querySelector('.tm-standings-table tbody tr');
  if (tr) {
    const tds = tr.querySelectorAll('td');
    const nameEl = [...tds[1].querySelectorAll('span')].find((s) => s.textContent?.trim());
    const recordEl = tds[2];
    if (nameEl && recordEl) {
      standingsGap = Math.round(recordEl.getBoundingClientRect().left - nameEl.getBoundingClientRect().right);
      standingsRowW = Math.round(tr.getBoundingClientRect().width);
    }
  }

  // 일정 카드 폭
  const scoreLeaf = [...document.querySelectorAll('*')].find(
    (e) => e.children.length === 0 && /^\d+\s*:\s*\d+$/.test((e.textContent || '').trim()),
  );
  const card = scoreLeaf?.closest('.tm-card');
  const cardW = card ? Math.round(card.getBoundingClientRect().width) : null;

  // 스크롤 끝에서 flownav 아래 죽은 공간
  const flownav = document.querySelector('.tm-tourn-sub-flownav');
  const scrollBottom =
    scroller === document.scrollingElement ? window.innerHeight : Math.round(scroller.getBoundingClientRect().bottom);
  const dead = flownav ? scrollBottom - Math.round(flownav.getBoundingClientRect().bottom) : null;

  const cols = [...document.querySelectorAll('.tm-tourn-sub-col')].map((c) => Math.round(c.getBoundingClientRect().width));

  return {
    introH: Math.round(document.querySelector('.tm-bracket-page-intro')?.getBoundingClientRect().height ?? 0),
    chrome,
    chromePct: chrome != null ? Math.round((chrome / areaH) * 100) : null,
    standingsRowW,
    standingsGap,
    cardW,
    dead,
    cols: cols.join('/'),
    overflow: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
  };
};

const browser = await chromium.launch();
const rows = [];
for (const t of TOURNAMENTS) {
  for (const size of WIDTHS) {
    for (const tab of ['schedule', 'standings']) {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/tournaments/${t.id}/bracket`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForSelector('[role="tablist"][aria-label="보기 방식"]', { timeout: 30_000 });
      await page.waitForTimeout(1300);
      if (tab === 'standings') {
        await page.getByRole('tab', { name: '순위 · 대진표' }).click();
        await page.waitForTimeout(800);
      }
      if (!DEPLOYED) {
        await page.evaluate(applyDelta);
        await page.waitForTimeout(400);
      }
      // 크롬 높이는 스크롤 0에서만 의미가 있다(스크롤하면 탭바가 위로 빠져나가 음수가 된다).
      const top = await page.evaluate(measure);
      await page.evaluate(() => {
        const s = document.querySelector('.tm-scroll-area') ?? document.scrollingElement;
        s.scrollTop = s.scrollHeight;
      });
      await page.waitForTimeout(400);
      const bottom = await page.evaluate(measure);
      if (SHOTS) {
        await page.evaluate(() => {
          const s = document.querySelector('.tm-scroll-area') ?? document.scrollingElement;
          s.scrollTop = 0;
        });
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${SHOTS}/${DEPLOYED ? 'after' : 'sim'}-${t.key.replace(/[()\s+·]/g, '')}-${size.name}-${tab}.png` });
      }
      rows.push({
        대회: t.key, 폭: size.name, 탭: tab,
        introH: top.introH, chrome: top.chrome, chromePct: top.chromePct,
        standingsRowW: top.standingsRowW, standingsGap: top.standingsGap,
        cardW: top.cardW, cols: top.cols, overflow: top.overflow,
        dead: bottom.dead,
      });
      await ctx.close();
    }
  }
}
await browser.close();
console.log(DEPLOYED ? '=== 배포본 실측 ===' : '=== 델타 주입 시뮬레이션 ===');
console.table(rows);
