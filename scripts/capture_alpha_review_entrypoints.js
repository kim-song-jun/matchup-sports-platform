// 후기 진입점 hotfix(PR #504) alpha 시각 검증 — 플로우를 따라가며 3폭 캡처.
//
// 이번 변경으로 "들어갈 길"이 생긴 화면들을 순서대로 본다:
//   1) /my/reviews            — 후기 허브(작성할/작성된/받은 3탭)
//   2) /my/reviews?tab=written — 내가 쓴 후기 확인
//   3) /my/reviews?tab=received— 내가 받은 후기 확인
//   4) /tournaments/:id        — 대회 상세: "리뷰할 수 있는 경기" + "대회 후기" 행
//                                (핵심 D1: 대회가 completed 여도 이 진입점이 남아야 한다)
//   5) /tournaments/:id/awards — 대회 후기 작성/열람 화면 (D5 목적지, D6 카피)
//   6) /team-matches/:id       — 팀매치 상세 "후기" 행 (D4, 신설)
//   7) /matches/:id            — 개인 매치 상세 "후기" 카드 (신설)
//
// Run:
//   ALPHA_SESSION_TOKEN=... \
//   ALPHA_TOURNAMENT_ID=... ALPHA_TEAM_MATCH_ID=... ALPHA_MATCH_ID=... \
//   node scripts/capture_alpha_review_entrypoints.js
//
// 저장소가 PUBLIC 이므로 실제 식별자·자격증명을 이 파일에 적지 않는다 — 전부 환경변수로 받는다.
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.ALPHA_BASE || 'https://alpha.teameet.co.kr';
const TOKEN = (process.env.ALPHA_SESSION_TOKEN || '').trim();
const OUT = path.resolve(__dirname, '../docs/visual-qa/alpha-review-entrypoints');
const HIDE =
  'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

if (!TOKEN) {
  console.error('ALPHA_SESSION_TOKEN 이 필요합니다.');
  process.exit(1);
}

const WIDTHS = [
  ['mobile', 390],
  ['tablet', 768],
  ['desktop', 1440],
];

const TOURNAMENT_ID = (process.env.ALPHA_TOURNAMENT_ID || '').trim();
const TEAM_MATCH_ID = (process.env.ALPHA_TEAM_MATCH_ID || '').trim();
const MATCH_ID = (process.env.ALPHA_MATCH_ID || '').trim();
// 실제 작성 화면 — 역할에 따라 상대 팀/상대 선수 대상이 어떻게 갈리는지 보이는 곳
const FIXTURE_ID = (process.env.ALPHA_FIXTURE_ID || '').trim();

const PAGES = [
  // 마이페이지 — "남은 후기 N건" 통합 배너가 뜨는 곳(경기 후기 + 대회 후기 합산)
  ['my-page', '/my'],
  ['reviews-hub', '/my/reviews'],
  ['reviews-written', '/my/reviews?tab=written'],
  ['reviews-received', '/my/reviews?tab=received'],
  // 받은 후기 '개별' 목록(익명 카드) — 탭 화면은 집계 대시보드라 개별 항목이 안 보인다.
  ['reviews-received-detail', '/my/reviews/received'],
  ...(FIXTURE_ID ? [['review-write', `/my/reviews/tournament_fixture/${FIXTURE_ID}`]] : []),
  ...(TOURNAMENT_ID
    ? [
        ['tournament-detail', `/tournaments/${TOURNAMENT_ID}`],
        ['tournament-awards', `/tournaments/${TOURNAMENT_ID}/awards`],
      ]
    : []),
  ...(TEAM_MATCH_ID ? [['team-match-detail', `/team-matches/${TEAM_MATCH_ID}`]] : []),
  ...(MATCH_ID ? [['match-detail', `/matches/${MATCH_ID}`]] : []),
];

// 화면이 실제로 그려졌는지 판정한다. alpha 는 실시간 소켓이 계속 붙어 있어
// networkidle 에 도달하지 않으므로 컨텐츠 기준으로 기다린다.
async function waitForContent(page) {
  await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
  await page
    .waitForFunction(
      () => {
        const text = document.querySelector('main')?.innerText ?? document.body.innerText ?? '';
        return text.trim().length > 40;
      },
      { timeout: 30000 },
    )
    .catch(() => {});
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(900);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const [pageName, urlPath] of PAGES) {
    for (const [widthName, width] of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      await ctx.addCookies([
        {
          name: 'teameet_v1_session',
          value: TOKEN,
          domain: new URL(BASE).hostname,
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'Lax',
        },
      ]);
      // 프로덕션 빌드(alpha)의 hasStoredV1Session()은 쿠키가 아니라 localStorage 힌트를 본다
      // (lib/session-storage.ts). 쿠키만 넣으면 화면이 비로그인으로 판정해 로그인 전용 섹션
      // — 특히 "리뷰할 수 있는 경기" — 이 통째로 빠진 채 캡처된다.
      await ctx.addInitScript(() => {
        try {
          window.localStorage.setItem('teameet.v1.session', 'active');
        } catch {
          /* storage 차단 환경은 무시 */
        }
      });
      const page = await ctx.newPage();
      // alpha 앞단이 짧은 시간에 몰린 요청을 nginx 403 으로 끊는다. 그대로 저장하면
      // "진입점이 없다"가 아니라 에러 페이지를 캡처해 놓고 결함으로 오독하게 된다.
      let response = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        response = await page
          .goto(`${BASE}${urlPath}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
          .catch(() => null);
        if (response && response.status() !== 403) break;
        await page.waitForTimeout(5000 * (attempt + 1));
      }
      await waitForContent(page);

      const file = path.join(OUT, `${pageName}-${widthName}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true });

      // 진입점이 실제로 렌더됐는지를 픽셀이 아니라 텍스트로도 남긴다 — 스크린샷만 보면
      // "있어야 할 CTA 가 없다"를 눈으로 놓친다.
      const probe = await page.evaluate(() => {
        const text = document.body.innerText ?? '';
        const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
        return {
          hasFixtureReviewSection: text.includes('리뷰할 수 있는 경기'),
          hasTournamentReviewRow: text.includes('대회 후기'),
          hasReviewCta: text.includes('후기 남기기'),
          hasPendingReviewBanner: /남은 후기\s*\d+\s*건/.test(text),
          pendingBannerText: (text.match(/남은 후기\s*\d+\s*건[\s\S]{0,80}/) || [''])[0].replace(/\s+/g, ' ').trim(),
          reviewHrefs: hrefs.filter((h) => h && (h.includes('/my/reviews') || h.includes('/awards'))),
        };
      });

      results.push({ page: pageName, width: widthName, status: response?.status() ?? null, file, ...probe });
      console.log(
        `${pageName} ${widthName}(${width}) status=${response?.status() ?? '-'} ` +
          `경기후기섹션=${probe.hasFixtureReviewSection} 대회후기=${probe.hasTournamentReviewRow} ` +
          `후기CTA=${probe.hasReviewCta} 남은후기배너=${probe.hasPendingReviewBanner}`,
      );
      await ctx.close();
    }
  }

  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log(`\n저장: ${OUT}`);
})();
