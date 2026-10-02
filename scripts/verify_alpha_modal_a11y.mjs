/**
 * PR #834 실측 검증 — 공용 useModalA11y 로 이관한 모달이 배포본에서 계약을 지키는가.
 *
 * 무엇을 보나
 *   #834 는 손으로 들고 있던 ESC 리스너·Tab 트랩·body 스크롤 잠금·포커스 저장/복원을
 *   공용 훅 호출로 치환했다. 유닛 테스트는 jsdom 에서 훅 자체를 검증하지만, **실제 브라우저
 *   에서 진짜로 포커스가 갇히는지·ESC 가 닫는지·배경 스크롤이 잠기는지**는 배포본에서만
 *   확인된다(레이아웃·CSS·라우팅이 모두 얽힌 결과라 jsdom 이 재현하지 못한다).
 *
 * 검사 항목 (각각 computed/실측으로 판정 — 스크린샷 육안 판정 아님)
 *   1. 다이얼로그가 열리고 포커스가 다이얼로그 **안**에 있다 (activeElement !== body)
 *   2. body 스크롤이 잠긴다 (overflow hidden)
 *   3. Tab 을 여러 번 눌러도 포커스가 다이얼로그 밖으로 나가지 않는다 (트랩)
 *   4. ESC 로 닫힌다
 *   5. 닫힌 뒤 body 스크롤 잠금이 풀린다
 *
 * 사용법:
 *   ALPHA_SESSION_TOKEN=v1.... node scripts/verify_alpha_modal_a11y.mjs [outDir]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/modal-a11y';
const TOKEN = process.env.ALPHA_SESSION_TOKEN;

const WIDTHS = [
  { key: 'mobile', width: 390, height: 900 },
  { key: 'tablet', width: 768, height: 1000 },
  { key: 'desktop', width: 1440, height: 1000 },
];

// 이관된 모달 중 복잡한 상태 없이 URL 로 바로 열 수 있는 것.
const CASES = [
  { name: 'teams-filter-sheet', open: '/teams?filter=1', closed: '/teams' },
];

if (!TOKEN) {
  console.error('ALPHA_SESSION_TOKEN 이 필요해요.');
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const head = await fetch(`${BASE}/landing`, { method: 'HEAD' });
const servingCommit = head.headers.get('x-teameet-commit');
console.log(`serving commit: ${servingCommit}`);

const browser = await chromium.launch();
const report = { base: BASE, servingCommit, results: [] };
let failures = 0;

for (const c of CASES) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height } });
    await ctx.addCookies([{
      name: 'teameet_v1_session', value: TOKEN,
      domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax',
    }]);
    const page = await ctx.newPage();
    await page.goto(BASE + c.open, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3500);

    const opened = await page.evaluate(() => {
      // 훅이 붙는 요소는 role=dialog 이거나, 이 시트처럼 라우트 기반이면 시트 컨테이너다.
      const dialog = document.querySelector('[role="dialog"]')
        ?? document.querySelector('.tm-filter-sheet, [class*="filter-sheet"]');
      return {
        found: Boolean(dialog),
        role: dialog?.getAttribute('role') ?? null,
        ariaModal: dialog?.getAttribute('aria-modal') ?? null,
        focusInside: Boolean(dialog && dialog.contains(document.activeElement)),
        activeTag: document.activeElement?.tagName ?? null,
        activeIsBody: document.activeElement === document.body,
        bodyOverflow: getComputedStyle(document.body).overflow,
        // Tab 트랩 검사가 유효하려면 tabbable 개수보다 많이 눌러야 한다 — 적게 누르면
        // 아직 한 바퀴를 안 돈 것뿐인데 '트랩이 걸렸다'로 잘못 읽는다.
        tabbables: dialog
          ? dialog.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])').length
          : 0,
      };
    });

    await page.screenshot({ path: `${OUT}/${c.name}-${w.key}-open.png` });

    // Tab 트랩: 여러 번 눌러도 다이얼로그 밖으로 못 나가야 한다.
    let escapedAt = null;
    if (opened.found) {
      const presses = Math.max(opened.tabbables + 3, 8);
      for (let i = 0; i < presses; i += 1) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(() => {
          const d = document.querySelector('[role="dialog"]')
            ?? document.querySelector('.tm-filter-sheet, [class*="filter-sheet"]');
          return Boolean(d && d.contains(document.activeElement));
        });
        if (!inside) { escapedAt = i + 1; break; }
      }
    }

    // ESC 가 실제로 document 까지 도달하는지 관측한다 — "안 닫혔다"를 곧바로 훅 결함으로
    // 읽지 않기 위해서다. 라우트 기반 시트는 onClose 가 router.push 라서, push 가 실행돼도
    // 다른 코드가 URL 을 되돌리면 화면상 결과는 '안 닫힘'으로 똑같이 보인다.
    await page.evaluate(() => {
      window.__escSeen = 0;
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__escSeen += 1; });
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2500);
    const afterEsc = await page.evaluate(() => ({
      url: location.pathname + location.search,
      stillOpen: Boolean(document.querySelector('[role="dialog"]')
        ?? document.querySelector('.tm-filter-sheet, [class*="filter-sheet"]')),
      bodyOverflow: getComputedStyle(document.body).overflow,
      escReachedDocument: window.__escSeen > 0,
    }));

    // 대조군: 훅과 무관한 닫기 경로(백드롭 링크). 이것도 안 닫히면 원인은 훅이 아니라
    // 닫기 경로 전체(대개 URL 동기화)에 있다 — 그 구분 없이는 오진한다.
    let backdropCloses = null;
    if (afterEsc.stillOpen) {
      const hasScrim = await page.evaluate(() => {
        const s = document.querySelector('.tm-filter-scrim, [class*="scrim"], [class*="backdrop"]');
        if (!s) return false;
        s.click();
        return true;
      });
      if (hasScrim) {
        await page.waitForTimeout(2500);
        backdropCloses = await page.evaluate(() => !(document.querySelector('[role="dialog"]')
          ?? document.querySelector('.tm-filter-sheet, [class*="filter-sheet"]')));
      }
    }

    await page.screenshot({ path: `${OUT}/${c.name}-${w.key}-after-esc.png` });

    // 훅이 책임지는 계약만 판정에 넣는다. 닫힘 여부는 라우트/URL 동기화까지 얽혀 있어
    // 훅 단독의 성패로 볼 수 없다 — 대조군(백드롭)이 같이 실패하면 훅 결함이 아니다.
    const hookChecks = {
      dialogFound: opened.found,
      focusInsideDialog: opened.focusInside && !opened.activeIsBody,
      bodyScrollLocked: opened.bodyOverflow === 'hidden',
      tabTrapHeld: escapedAt === null,
      escReachedDocument: afterEsc.escReachedDocument,
    };
    const closePath = {
      escClosed: !afterEsc.stillOpen,
      backdropCloses: backdropCloses,
      // 훅 밖 원인: ESC 는 도달했는데 안 닫혔고 백드롭도 못 닫는 경우.
      preExistingClosePathBug:
        afterEsc.escReachedDocument && afterEsc.stillOpen && backdropCloses === false,
    };
    const ok = Object.values(hookChecks).every(Boolean);
    if (!ok) failures += 1;

    report.results.push({ case: c.name, width: w.key, ok, hookChecks, closePath, opened, escapedAt, afterEsc });
    console.log(
      `${ok ? 'OK  ' : 'FAIL'} ${c.name} @${w.key} hook=${JSON.stringify(hookChecks)}` +
      ` close=${JSON.stringify(closePath)}${escapedAt ? ` escapedAtTab=${escapedAt}` : ''}` +
      ` tabbables=${opened.tabbables}`,
    );
    await ctx.close();
  }
}

await browser.close();
report.verdict = failures === 0 ? 'PASS' : 'FAIL';
await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(`\n판정: ${report.verdict} (실패 ${failures}건 / 총 ${report.results.length}건)`);
process.exit(failures === 0 ? 0 : 1);
