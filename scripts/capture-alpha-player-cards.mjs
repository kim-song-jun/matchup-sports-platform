#!/usr/bin/env node
/**
 * alpha 실화면에서 선수 카드가 계정마다 어떻게 보이는지 캡처한다.
 *
 * 캡처 대상 (계정 하나당 3장):
 *   1) 마이페이지          — 본인이 보는 카드(기록 공개 유도·공유 입구 포함)
 *   2) 공개 프로필          — 남이 보는 카드
 *   3) 공유 화면            — 카톡·인스타로 나가는 그 화면
 *
 * 자격증명은 저장소에 적지 않는다([[public-repo-never-post-prod-identifiers]]) --
 * 계정 목록과 비밀번호는 환경변수로만 받는다:
 *
 *   ALPHA_PASSWORD=... ALPHA_ACCOUNTS=alpha.e2e.player01@…,alpha.e2e.player02@… \
 *     node scripts/capture-alpha-player-cards.mjs
 *
 * 주의: 라이브 경기가 있는 페이지는 10초 폴링이라 networkidle 이 끝나지 않는다 --
 * domcontentloaded + 명시적 대기를 쓴다.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr';
const PASSWORD = process.env.ALPHA_PASSWORD;
const ACCOUNTS = (process.env.ALPHA_ACCOUNTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = process.env.OUT_DIR ?? '.screenshots/player-cards';

if (!PASSWORD || ACCOUNTS.length === 0) {
  console.error('ALPHA_PASSWORD 와 ALPHA_ACCOUNTS(쉼표 구분) 가 필요합니다.');
  process.exit(1);
}

/** 로그인해서 세션 쿠키와 userId 를 얻는다. alpha 는 프로덕션 모드라 헤더 dev 인증이 401 이다. */
async function login(email) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`${email} 로그인 실패 ${res.status}`);
  const raw = res.headers.getSetCookie?.() ?? [];
  const token = raw
    .map((c) => /teameet_v1_session=([^;]+)/.exec(c)?.[1])
    .find(Boolean);
  if (!token) throw new Error(`${email} 세션 쿠키 없음`);
  const me = await fetch(`${BASE}/api/v1/auth/me`, {
    headers: { cookie: `teameet_v1_session=${token}` },
  }).then((r) => r.json());
  return { token, userId: me.data.user.id };
}

/** 카드가 실제로 어떤 값으로 렌더되는지 -- 스샷만으로는 "왜 이렇게 보이는지"를 못 판단한다. */
async function readCard(userId) {
  const res = await fetch(`${BASE}/api/v1/users/${userId}/public-profile`);
  if (!res.ok) return null;
  const data = (await res.json()).data;
  const card = data?.playerCard;
  // 닉네임·후기는 최상위에 있다(profile 하위가 아니다) -- 스샷만으로는 "왜 이렇게 보이는지"
  // 판단이 안 되므로 값도 같이 남긴다.
  const who = { nickname: data?.nickname, reviewCount: data?.reputation?.reviewCount ?? 0 };
  if (!card) return { ...who, hidden: true };
  return {
    ...who,
    tier: card.tier,
    shape: card.shape ?? '(필드 없음)',
    overall: card.overall,
    appearances: card.appearances,
    locked: card.stats.filter((s) => !s.unlocked).length,
  };
}

const WIDTHS = [
  ['mobile', 390],
  ['tablet', 768],
  ['desktop', 1440],
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const summary = [];

  for (const email of ACCOUNTS) {
    const short = email.split('@')[0].replace(/[^a-z0-9]/gi, '-');
    const { token, userId } = await login(email);
    const card = await readCard(userId);
    summary.push({ email: short, userId: userId.slice(0, 8), ...card });

    for (const [label, width] of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width, height: width === 390 ? 900 : 1000 },
        deviceScaleFactor: 2,
      });
      await ctx.addCookies([
        { name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/' },
      ]);
      const page = await ctx.newPage();

      const shots = [
        ['my', `${BASE}/my`],
        ['public', `${BASE}/users/${userId}`],
        ['share', `${BASE}/users/${userId}/card`],
      ];
      for (const [name, url] of shots) {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        const file = path.join(OUT, `${short}-${name}-${label}-${width}.png`);
        await page.screenshot({ path: file, fullPage: name !== 'share' });
        console.log('찍음', file);
      }
      await ctx.close();
    }
  }

  await browser.close();
  await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.table(summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
