// 대회 도메인 폴리시 시각 검증 — 최종결과 히어로·그리드 / 어드민 대진·신청·대회정보 / 생성 폼 상금 섹션.
//
// Usage:
//   TID=<tournamentId> node scripts/qa/capture_tournament_polish.js
// Env:
//   TID      (required) 캡처 대상 대회 ID (completed 상태 + 결선 결과 보유)
//   WEB_BASE (default http://localhost:3013) v1 web 베이스 URL
//   API_BASE (default http://localhost:8121) v1 API 베이스 URL — 실행 전 도달성 체크용
//   OUT_DIR  (default <repo>/output/playwright/tournament-polish) PNG·manifest 출력 디렉토리
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WEB_BASE = process.env.WEB_BASE || 'http://localhost:3013';
const API_BASE = process.env.API_BASE || 'http://localhost:8121';
const OUT_DIR = process.env.OUT_DIR || path.join(REPO_ROOT, 'output', 'playwright', 'tournament-polish');
const TID = process.env.TID;
if (!TID) {
  console.error('TID 환경변수가 필요해요. 예: TID=<tournamentId> node scripts/qa/capture_tournament_polish.js');
  process.exit(1);
}

const ADMIN = [null, 'admin@teameet.v1'];
const PUBLIC = [null, null];
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

// [name, route, auth, width, adminTab(선택) — 어드민 상세의 role=tab 라벨]
const SHOTS = [
  ['results-mobile', `/tournaments/${TID}/results`, PUBLIC, 390, null],
  ['results-tablet', `/tournaments/${TID}/results`, PUBLIC, 768, null],
  ['results-desktop', `/tournaments/${TID}/results`, PUBLIC, 1440, null],
  ['admin-registrations-desktop', `/admin/tournaments/${TID}`, ADMIN, 1440, '신청 관리'],
  ['admin-bracket-desktop', `/admin/tournaments/${TID}`, ADMIN, 1440, '대진 관리'],
  ['admin-info-desktop', `/admin/tournaments/${TID}`, ADMIN, 1440, '대회 정보'],
  ['admin-new-desktop', `/admin/tournaments/new`, ADMIN, 1440, null],
];

(async () => {
  try {
    const res = await fetch(`${API_BASE}/api/v1/tournaments/${TID}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error(`API_BASE(${API_BASE})에서 대회(${TID})를 읽지 못했어요: ${e.message || e}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const out = {};
  let failures = 0;
  try {
    for (const [name, route, auth, w, adminTab] of SHOTS) {
      // 샷 단위로 격리 — 한 샷이 실패해도 나머지 샷·cleanup·manifest 작성을 보장한다.
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
      try {
        await ctx.addInitScript(([i, e]) => {
          if (i) window.localStorage.setItem('teameet.v1.userId', i);
          if (e) window.localStorage.setItem('teameet.v1.userEmail', e);
        }, auth);
        const page = await ctx.newPage();
        const errs = [];
        page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
        await page.goto(`${WEB_BASE}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
        await page.addStyleTag({ content: HIDE });
        if (adminTab) {
          await page.getByRole('tab', { name: adminTab }).click();
          await page.waitForTimeout(700);
          await page.waitForLoadState('networkidle');
        }
        // 입장 애니메이션(최대 ~1.2s)이 끝난 정지 상태를 캡처
        await page.waitForTimeout(1500);
        const file = path.join(OUT_DIR, `${name}.png`);
        // fullPage 캡처는 CSS 키프레임을 재시작시켜 입장 애니메이션의 초기 프레임(투명)이 찍힌다
        // → 유한 애니메이션을 종료 상태로 fast-forward 하는 disabled 모드로 정지 화면을 얻는다.
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
        out[name] = { file, consoleErrors: errs };
        console.log(`${name}: ${file}${errs.length ? ` (console errors: ${errs.length})` : ''}`);
      } catch (e) {
        failures += 1;
        out[name] = { error: e.message || String(e) };
        console.error(`${name}: FAILED — ${e.message || e}`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(out, null, 2));
  }
  console.log(`done${failures ? ` (${failures} shot(s) failed — manifest에 기록됨)` : ''}`);
  if (failures) process.exit(1);
})();
