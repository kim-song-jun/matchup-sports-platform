/**
 * PR #977 alpha 실측 — 팀 컨택의 채팅 흡수.
 *
 * 두 팀장 계정으로 "요청 → 상대 목록 노출 → 수락 전 전송 차단 → 수락 → 전송" 흐름을 API 로
 * 만들고, 관전자가 실제로 받는 공개 응답을 단언한 뒤 화면을 📱390/📲768/🖥1440 으로 찍는다.
 *
 * 자격증명은 저장소에 적지 않는다(이 저장소는 PUBLIC). 환경변수로만 받는다:
 *   ALPHA_EMAIL_A / ALPHA_EMAIL_B  — A·B 팀 팀장 계정
 *   ALPHA_PASSWORD                 — 공통 비밀번호
 *   ALPHA_TEAM_A_ID / ALPHA_TEAM_B_ID
 *   CAPTURE_BASE (기본 https://alpha.teameet.co.kr) · CAPTURE_OUT (기본 .screenshots/team-contact-chat)
 *
 * A↔B 에 이미 accepted 컨택이 있으면(수락은 되돌릴 수 없다) 요청 단계는 건너뛰고 수락 상태만
 * 찍는다 — 그 사실을 로그로 남긴다. requested 가 있으면 A 가 철회하고 새로 보낸다.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.CAPTURE_BASE ?? 'https://alpha.teameet.co.kr';
const OUT = process.env.CAPTURE_OUT ?? path.resolve('.screenshots/team-contact-chat');
const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length > 0) throw new Error(`필수 환경변수가 없습니다: ${missing.join(', ')}`);
}
requireEnv('ALPHA_EMAIL_A', 'ALPHA_EMAIL_B', 'ALPHA_PASSWORD', 'ALPHA_TEAM_A_ID', 'ALPHA_TEAM_B_ID');
const teamA = process.env.ALPHA_TEAM_A_ID;
const teamB = process.env.ALPHA_TEAM_B_ID;

async function login(email, password) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status} for ${email.replace(/(.{2}).*(@.*)/, '$1***$2')}`);
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const token = cookies.map((c) => c.match(/teameet_v1_session=([^;]+)/)?.[1]).find(Boolean);
  if (!token) throw new Error('세션 쿠키를 못 받았다');
  return token;
}

async function api(token, method, url, body) {
  const res = await fetch(`${BASE}/api/v1${url}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: `teameet_v1_session=${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: json };
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`);
}

const tokenA = await login(process.env.ALPHA_EMAIL_A, process.env.ALPHA_PASSWORD);
const tokenB = await login(process.env.ALPHA_EMAIL_B, process.env.ALPHA_PASSWORD);

// 0) 현재 A↔B 컨택 방 상태
async function findPairRoom(token) {
  const { body } = await api(token, 'GET', '/chat/rooms?roomType=team_contact&limit=50');
  const items = body?.data?.items ?? [];
  return items.find((r) => {
    const c = r.teamContact;
    return c && ((c.fromTeam.id === teamA && c.toTeam.id === teamB) || (c.fromTeam.id === teamB && c.toTeam.id === teamA));
  }) ?? null;
}
let existing = await findPairRoom(tokenA);
console.log('기존 A↔B 컨택 방:', existing ? `${existing.roomId} status=${existing.teamContact.status} mySide=${existing.teamContact.mySide}` : '없음');

let roomId = null;
let contactId = null;
let requestedCaptured = false;

if (existing && existing.teamContact.status === 'requested') {
  // 내가 보낸 요청이면 철회해서 깨끗한 상태에서 다시 시작한다. 상대가 보낸 요청이면 그대로 쓴다.
  if (existing.teamContact.mySide === 'from') {
    const w = await api(tokenA, 'POST', `/team-contacts/${existing.teamContact.contactId}/withdraw`);
    check('기존 requested 철회', w.status === 200 || w.status === 201, `status=${w.status}`);
    existing = null;
  }
}

if (!existing || existing.teamContact.status !== 'accepted') {
  // 1) A → B 컨택 발신
  const created = await api(tokenA, 'POST', `/teams/${teamB}/contacts`, {
    fromTeamId: teamA,
    message: `[실측 ${new Date().toISOString().slice(0, 16)}] 이번 주말 친선전 어떠세요?`,
  });
  check('1) 발신 201 + chatRoomId', created.status === 201 && typeof created.body?.data?.chatRoomId === 'string', `status=${created.status} code=${created.body?.code ?? ''}`);
  roomId = created.body?.data?.chatRoomId ?? null;
  contactId = created.body?.data?.id ?? null;
  if (!roomId) throw new Error(`발신 실패: ${JSON.stringify(created.body).slice(0, 300)}`);
  check('1) route 가 /chat/{roomId}', created.body.data.route === `/chat/${roomId}`);

  // 2) B 목록에 요청 방이 보이고 미읽음 1, mySide to
  const listB = await api(tokenB, 'GET', '/chat/rooms?roomType=team_contact&limit=50');
  const roomB = (listB.body?.data?.items ?? []).find((r) => r.roomId === roomId);
  check('2) B 목록에 방 노출', Boolean(roomB));
  check('2) B unreadCount=1', roomB?.unreadCount === 1, `unread=${roomB?.unreadCount}`);
  check('2) B teamContact.status=requested, mySide=to', roomB?.teamContact?.status === 'requested' && roomB?.teamContact?.mySide === 'to', JSON.stringify(roomB?.teamContact ?? null));
  check('2) linkedTarget → 상대 팀(A)', roomB?.linkedTarget?.route === `/teams/${teamA}`, roomB?.linkedTarget?.route);

  // 3) 수락 전 전송 차단
  const blocked = await api(tokenB, 'POST', `/chat/rooms/${roomId}/messages`, { content: '네 가능해요' });
  check('3) 수락 전 전송 409 TEAM_CONTACT_NOT_ACCEPTED', blocked.status === 409 && blocked.body?.code === 'TEAM_CONTACT_NOT_ACCEPTED', `status=${blocked.status} code=${blocked.body?.code}`);

  // 3-1) 요약 배지
  const sumB = await api(tokenB, 'GET', '/me/team-contacts/summary');
  check('3-1) B 대기 컨택 요약 ≥1', (sumB.body?.data?.pendingInbound ?? 0) >= 1, JSON.stringify(sumB.body?.data));

  // 4) 중복 발신 409 + existingChatRoomId
  const dup = await api(tokenA, 'POST', `/teams/${teamB}/contacts`, { fromTeamId: teamA, message: '한 번 더' });
  check('4) 중복 409 + existingChatRoomId', dup.status === 409 && dup.body?.details?.existingChatRoomId === roomId, `status=${dup.status} details=${JSON.stringify(dup.body?.details)}`);

  // 요청 상태 화면 캡처 (B 관점 + A 관점)
  await captureAll('requested', { B: tokenB, A: tokenA }, roomId, contactId);
  requestedCaptured = true;

  // 5) B 수락 → 시스템 메시지 + A 알림 딥링크
  const acc = await api(tokenB, 'PATCH', `/team-contacts/${contactId}/accept`);
  check('5) 수락 200 + chatRoomId', acc.status === 200 && acc.body?.data?.chatRoomId === roomId, `status=${acc.status}`);
  const msgs = await api(tokenA, 'GET', `/chat/rooms/${roomId}/messages?limit=10`);
  const items = msgs.body?.data?.items ?? [];
  check('5) 시스템 메시지 "컨택을 수락했어요"', items.some((m) => m.messageType === 'system' && m.content === '컨택을 수락했어요'), items.map((m) => `${m.messageType}:${m.content}`).join(' | '));
  const notif = await api(tokenA, 'GET', '/notifications?limit=10');
  const n = (notif.body?.data?.items ?? []).find((x) => x.target?.route === `/chat/${roomId}` || x.deepLink === `/chat/${roomId}`);
  check('5) A 알림 딥링크 /chat/{roomId}', Boolean(n), n ? `${n.title}` : `top=${JSON.stringify((notif.body?.data?.items ?? []).slice(0, 2).map((x) => x.target?.route ?? x.deepLink))}`);
  const sumB2 = await api(tokenB, 'GET', '/me/team-contacts/summary');
  check('5-1) 수락 뒤 B 대기 요약 감소', (sumB2.body?.data?.pendingInbound ?? 99) < (sumB.body?.data?.pendingInbound ?? 0), JSON.stringify(sumB2.body?.data));
} else {
  roomId = existing.roomId;
  contactId = existing.teamContact.contactId;
  console.log('SKIP 요청 단계 — 이미 accepted 컨택이 있어(수락은 되돌릴 수 없음) 수락 상태만 찍는다');
}

// 6) 수락 뒤 전송 허용
const sent = await api(tokenA, 'POST', `/chat/rooms/${roomId}/messages`, { content: `토요일 오후 어떠세요? (${new Date().toISOString().slice(11, 16)})` });
check('6) 수락 뒤 전송 201', sent.status === 201, `status=${sent.status} code=${sent.body?.code ?? ''}`);
const detailA = await api(tokenA, 'GET', `/chat/rooms/${roomId}`);
check('6) 상세 teamContact accepted, mySide from', detailA.body?.data?.teamContact?.status === 'accepted' && detailA.body?.data?.teamContact?.mySide === 'from', JSON.stringify(detailA.body?.data?.teamContact));

await captureAll('accepted', { A: tokenA, B: tokenB }, roomId, contactId);

// 7) 옛 딥링크 리다이렉트
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: tokenA, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my/team-contacts/${contactId}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForURL((u) => u.pathname === `/chat/${roomId}`, { timeout: 20_000 }).catch(() => {});
  check('7) /my/team-contacts/:id → /chat/:roomId', new URL(page.url()).pathname === `/chat/${roomId}`, page.url());
  await page.goto(`${BASE}/my/team-contacts`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(1500);
  check('7) /my/team-contacts → /chat?category=team_contact', new URL(page.url()).pathname === '/chat' && new URL(page.url()).searchParams.get('category') === 'team_contact', page.url());
  await browser.close();
}

await writeFile(path.join(OUT, 'checks.json'), JSON.stringify({ roomId, contactId, requestedCaptured, checks }, null, 2));
const failed = checks.filter((c) => !c.ok);
console.log(`\n=== ${checks.length - failed.length}/${checks.length} PASS ===`);
if (failed.length) { console.log('실패:', failed.map((f) => f.name).join(' / ')); process.exitCode = 1; }

async function shoot(ctx, url, file, theme) {
  const page = await ctx.newPage();
  await page.addInitScript((t) => { try { window.localStorage.setItem('tm-theme', t); } catch {} }, theme);
  const resp = await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: file, fullPage: true });
  const probe = await page.evaluate(() => ({
    httpStatus: 0,
    darkApplied: document.documentElement.classList.contains('dark'),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    hasStatusCard: Boolean(document.querySelector('[aria-label="컨택 상태"]')),
    inputPlaceholder: document.querySelector('input[aria-label="메시지 입력"]')?.getAttribute('placeholder') ?? null,
    inputDisabled: document.querySelector('input[aria-label="메시지 입력"]')?.disabled ?? null,
    badges: Array.from(document.querySelectorAll('.tm-badge')).map((b) => b.textContent.trim()).filter(Boolean).slice(0, 12),
  }));
  probe.httpStatus = resp?.status() ?? 0;
  await page.close();
  // alpha 는 과한 캡처에 403 을 건다 — 샷 사이에 숨을 고른다.
  await new Promise((r) => setTimeout(r, 1500));
  return probe;
}

async function captureAll(phase, tokens, roomId, contactId) {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const PAGES = {
    B: [
      { key: 'chat-room', url: `/chat/${roomId}` },
      { key: 'chat-list', url: '/chat?category=team_contact' },
      { key: 'my-home', url: '/my' },
      { key: 'team-detail-ops', url: `/teams/${teamB}` },
    ],
    A: [
      { key: 'chat-room', url: `/chat/${roomId}` },
      { key: 'chat-list', url: '/chat?category=team_contact' },
    ],
  };
  for (const [who, token] of Object.entries(tokens)) {
    for (const theme of ['light', 'dark']) {
      // 다크는 모바일만 — 캡처 총량을 줄여 alpha 의 403 을 피한다.
      for (const vp of theme === 'dark' ? VIEWPORTS.slice(0, 1) : VIEWPORTS) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, colorScheme: theme });
        await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
        for (const p of PAGES[who]) {
          const file = path.join(OUT, `${phase}-${who}-${p.key}-${theme}-${vp.key}.png`);
          try {
            const probe = await shoot(ctx, p.url, file, theme);
            if (probe.httpStatus !== 200) check(`[${phase}/${who}/${p.key}/${theme}/${vp.key}] HTTP 200`, false, `status=${probe.httpStatus}`);
            console.log(`SHOT ${phase} ${who} ${p.key} ${theme} ${vp.key} http=${probe.httpStatus} dark=${probe.darkApplied} overflow=${probe.overflow} card=${probe.hasStatusCard} input="${probe.inputPlaceholder}"/${probe.inputDisabled} badges=${JSON.stringify(probe.badges)}`);
            if (vp.key === 'mobile' && theme === 'light') {
              if (p.key === 'chat-room') {
                check(`[${phase}/${who}] 채팅방 상태 카드 렌더`, probe.hasStatusCard);
                if (phase === 'requested') check(`[${phase}/${who}] 입력창 잠금 문구`, probe.inputDisabled === true && probe.inputPlaceholder === '수락하면 대화할 수 있어요', `${probe.inputPlaceholder}/${probe.inputDisabled}`);
                if (phase === 'accepted') check(`[${phase}/${who}] 입력창 열림`, probe.inputDisabled === false, `${probe.inputPlaceholder}/${probe.inputDisabled}`);
              }
              if (p.key === 'chat-list' && phase === 'requested' && who === 'B') check('[requested/B] 목록 "답장 필요" 배지', probe.badges.includes('답장 필요'), JSON.stringify(probe.badges));
              if (p.key === 'my-home' && phase === 'requested') check('[requested/B] 마이 메뉴 채팅 배지(숫자)', probe.badges.some((b) => /^\d+$/.test(b)), JSON.stringify(probe.badges));
              if (p.key === 'team-detail-ops' && phase === 'requested') check('[requested/B] 팀 운영 메뉴 받은 컨택 배지', probe.badges.some((b) => /^\d+$/.test(b)), JSON.stringify(probe.badges));
              check(`[${phase}/${who}/${p.key}] 390 가로 오버플로 없음`, probe.overflow === false, `${probe.scrollW}/${probe.innerW}`);
            }
          } catch (e) {
            console.log(`FAIL ${phase} ${who} ${p.key} ${theme} ${vp.key}: ${e.message}`);
            check(`[${phase}/${who}/${p.key}/${theme}/${vp.key}] 캡처`, false, e.message);
          }
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
}
