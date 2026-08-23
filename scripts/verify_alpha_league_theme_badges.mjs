/**
 * alpha 리그 화면 보강 검증 2건.
 *   (A) 수동 다크 모드(localStorage 'tm-theme' = dark)에서 리그 화면이 제대로 나오는지
 *   (B) 44px 리그전 배지가 같은 flex 줄의 24px 배지 높이를 늘리는지 (align-items 미지정)
 *
 * 이 스크립트는 로그인하지 않는다 — 리그·팀매치 상세는 비인증으로 열리는 공개 경로다.
 * 필요한 건 대상 id 뿐이다.
 *
 * 사용법:
 *   LEAGUE_IDS='{"tier":"<리그 id>","fixture":"<팀매치 id>"}' \
 *     node scripts/verify_alpha_league_theme_badges.mjs <outDir>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/league-theme-badges';
const L = JSON.parse(process.env.LEAGUE_IDS ?? '{}');
// id 가 없으면 /league-matches/undefined 를 열어 "화면이 이상하다" 는 엉뚱한 결론이 난다.
for (const key of ['tier', 'fixture']) {
  if (!L[key]) {
    console.error(`LEAGUE_IDS 에 "${key}" 가 필요해요. 예: LEAGUE_IDS='{"tier":"<리그 id>","fixture":"<팀매치 id>"}'`);
    process.exit(1);
  }
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = {};

/** (A) 테마별로 리그 화면을 열어 실제 색이 바뀌는지 확인한다. */
async function themePass(theme, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  await ctx.addInitScript((t) => window.localStorage.setItem('tm-theme', t), theme);
  const page = await ctx.newPage();
  for (const [name, path] of [['list', '/league-matches'], ['detail', `/league-matches/${L.tier}`]]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const diag = await page.evaluate(() => {
      // 엘리먼트를 받아 그대로 잰다. 예전엔 selector 를 다시 만들어 querySelector 했는데,
      // Tailwind 클래스에는 `dark:bg-gray-800`·`rounded-[12px]` 처럼 CSS selector 문법에서
      // 깨지는 문자가 들어 있어 evaluate 전체가 예외로 죽었다.
      const styleOf = (el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, color: cs.color, border: cs.borderColor };
      };
      const contrast = (fg, bg) => {
        const lum = (c) => {
          const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((n) => {
            const v = Number(n) / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const a = lum(fg); const b = lum(bg);
        return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
      };
      const bodyCs = getComputedStyle(document.body);
      const th = document.querySelector('th');
      const card = document.querySelector('.tm-card, [class*="rounded"]');
      return {
        htmlClass: document.documentElement.className,
        bodyBg: bodyCs.backgroundColor,
        bodyColor: bodyCs.color,
        bodyContrast: contrast(bodyCs.color, bodyCs.backgroundColor),
        th: th ? { color: getComputedStyle(th).color, contrast: contrast(getComputedStyle(th).color, bodyCs.backgroundColor) } : null,
        card: styleOf(card),
        sampleText: (document.body.innerText || '').slice(0, 60).replace(/\n/g, ' '),
      };
    });
    await page.screenshot({ path: `${OUT}/theme-${theme}-${name}-${width}.png`, fullPage: false });
    report[`theme/${theme}/${name}/${width}`] = diag;
    console.log(`[theme ${theme} ${name} ${width}] html.class="${diag.htmlClass}" bg=${diag.bodyBg} fg=${diag.bodyColor} 대비=${diag.bodyContrast}`);
  }
  await ctx.close();
}

/** (B) 리그전 배지가 있는 줄의 형제 배지 높이를 잰다. */
async function badgePass(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/team-matches/${L.fixture}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const diag = await page.evaluate(() => {
    // 데스크톱/모바일 레이아웃이 같은 카드를 두 번 렌더할 수 있다 — 실제로 보이는 인스턴스만 잰다.
    const links = [...document.querySelectorAll('.tm-league-badge-link')];
    const link = links.find((el) => el.getBoundingClientRect().height > 0) ?? links[0];
    if (!link) return { found: false };
    const row = link.parentElement;
    const rowCs = getComputedStyle(row);
    const siblings = [...row.children].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        text: (el.textContent || '').trim().slice(0, 22),
        cls: el.className.toString().split(' ').filter((c) => c.startsWith('tm-')).join('.'),
        h: Math.round(r.height * 10) / 10,
        top: Math.round(r.top * 10) / 10,
        minH: cs.minHeight,
        alignSelf: cs.alignSelf,
      };
    });
    return {
      found: true,
      rowDisplay: rowCs.display,
      rowAlignItems: rowCs.alignItems,
      rowFlexWrap: rowCs.flexWrap,
      siblings,
    };
  });
  // 배지 줄만 잘라 저장 — 요소가 화면 밖이면 스킵한다(데스크톱은 우측 컬럼이라 보이지 않을 수 있다).
  try {
    const box = await page.locator('.tm-league-badge-link').first().boundingBox({ timeout: 3000 });
    if (box) {
      await page.screenshot({
        path: `${OUT}/badges-${width}-crop.png`,
        clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 90), width: Math.min(width - 1, 420), height: 190 },
      });
    }
  } catch {
    // 크롭 실패는 측정과 무관 — 계산값은 위에서 이미 확보했다.
  }
  await page.screenshot({ path: `${OUT}/badges-${width}.png`, fullPage: true });
  report[`badges/${width}`] = diag;
  console.log(`\n[badges ${width}] found=${diag.found} row: display=${diag.rowDisplay} align-items=${diag.rowAlignItems} wrap=${diag.rowFlexWrap}`);
  (diag.siblings ?? []).forEach((s) => console.log(`   ${s.h}px (min ${s.minH}, self ${s.alignSelf}) top=${s.top} .${s.cls} "${s.text}"`));
  await ctx.close();
}

// 중간에 던져도 chromium 이 남지 않게 finally 로 닫는다 — 실패할수록 여러 번 돌리게 되고,
// 그때마다 브라우저가 쌓이면 호스트가 먼저 죽는다.
try {
  await themePass('dark', 390);
  await themePass('light', 390);
  await badgePass(390);
  await badgePass(1440);
} finally {
  await browser.close();
  // 부분 결과라도 남긴다 — 어디까지 됐는지가 다음 실행의 단서다.
  await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
}
console.log(`\n완료 → ${OUT}`);
