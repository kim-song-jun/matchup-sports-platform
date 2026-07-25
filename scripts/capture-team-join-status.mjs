/**
 * PR #173 시각 검증 캡처 — 팀 가입 신청 상태/안내.
 *
 * 헤더 dev 인증(localStorage teameet.v1.userId/userEmail → x-v1-user-* 헤더)으로
 * 승인 대기 중인 사용자 세션을 만든 뒤 mobile/tablet/desktop 3폭을 캡처한다.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.CAPTURE_BASE ?? 'http://localhost:3013';
const OUT = process.env.CAPTURE_OUT ?? path.resolve('.screenshots/team-join-status');

// 승인 대기(requested) 신청을 가진 시드 사용자
const USER_ID = '00000000-0000-4000-8000-000000001015';
const USER_EMAIL = 'coverage-extra-c@teameet.v1';
// 해당 사용자가 승인 대기 중인 팀
const PENDING_TEAM_ID = '00000000-0000-4000-8000-000000001201';

const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

const PAGES = [
  { key: 'team-detail-pending', url: `/teams/${PENDING_TEAM_ID}` },
  { key: 'my-join-applications', url: '/my/join-applications' },
];

/**
 * 재동의가 필요한 약관이 있으면 게이트 화면이 먼저 뜬다.
 * DB에 동의 행을 직접 넣는 방식은 관리형 약관(v1_managed_terms_*) 기준선을 만족시키지
 * 못하므로, 실제 사용자와 동일하게 "전체 동의" 카드를 클릭해 통과한다.
 */
async function passTermsGateIfPresent(page) {
  const gate = page.getByText('새 필수 약관을 확인해 주세요');
  if (!(await gate.isVisible().catch(() => false))) return;

  await page.getByText('전체 동의', { exact: true }).click();
  const submit = page.getByRole('button', { name: /동의하고 계속|계속|확인/ });
  await submit.click();
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
    // dev 헤더 인증 — 앱이 localStorage 값을 읽어 x-v1-user-* 헤더로 실어 보낸다.
    await context.addInitScript(
      ([userId, email]) => {
        localStorage.setItem('teameet.v1.userId', userId);
        localStorage.setItem('teameet.v1.userEmail', email);
      },
      [USER_ID, USER_EMAIL],
    );

    const page = await context.newPage();
    for (const target of PAGES) {
      await page.goto(`${BASE}${target.url}`, { waitUntil: 'networkidle' });
      await passTermsGateIfPresent(page);
      // 데이터 렌더 안정화 대기 — join-eligibility 등 후속 쿼리가 도착해
      // 로딩 스켈레톤이 실제 콘텐츠로 교체될 때까지 넉넉히 기다린다.
      await page.waitForTimeout(3000);
      const file = path.join(OUT, `${target.key}--${viewport.key}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`captured ${file}`);
    }
    await context.close();
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
