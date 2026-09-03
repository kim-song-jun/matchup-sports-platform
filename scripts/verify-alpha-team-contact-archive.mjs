/**
 * PR #992 alpha 실측 — 끝난 팀 컨택 방 자동 보관 + "종료된 컨택 보기".
 *
 * A↔B 팀쌍은 이미 accepted 라(되돌릴 수 없음) B 팀장이 소유한 세 번째 팀 C 를 만들어
 * C→A 컨택을 보내고 A 가 거절한다. 그 뒤 방이 보관됐는지를 공개 API 로 단언하고,
 * B 관점의 채팅 목록(토글 전/후)과 보관된 방을 📱390/📲768/🖥1440 으로 찍는다.
 *
 * 자격증명은 저장소에 적지 않는다(PUBLIC). 환경변수:
 *   ALPHA_EMAIL_A / ALPHA_EMAIL_B / ALPHA_PASSWORD / ALPHA_TEAM_A_ID / ALPHA_TEAM_B_ID
 *   CAPTURE_BASE (기본 https://alpha.teameet.co.kr) · CAPTURE_OUT (기본 .screenshots/team-contact-archive)
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.CAPTURE_BASE ?? 'https://alpha.teameet.co.kr';
const OUT = process.env.CAPTURE_OUT ?? path.resolve('.screenshots/team-contact-archive');
const TEAM_C_NAME = 'E2E 알파 C팀';
const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];
for (const n of ['ALPHA_EMAIL_A', 'ALPHA_EMAIL_B', 'ALPHA_PASSWORD', 'ALPHA_TEAM_A_ID', 'ALPHA_TEAM_B_ID']) {
  if (!process.env[n]) throw new Error(`필수 환경변수가 없습니다: ${n}`);
}
const teamA = process.env.ALPHA_TEAM_A_ID;
const teamB = process.env.ALPHA_TEAM_B_ID;

async function login(email, password) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const token = cookies.map((c) => c.match(/teameet_v1_session=([^;]+)/)?.[1]).find(Boolean);
  if (!token) throw new Error('세션 쿠키를 못 받았다');
  return token;
}
async function api(token, method, url, body) {
  const res = await fetch(`${BASE}/api/v1${url}`, { method, headers: { 'content-type': 'application/json', cookie: `teameet_v1_session=${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: json };
}
const checks = [];
function check(name, ok, detail) { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`); }

const tokenA = await login(process.env.ALPHA_EMAIL_A, process.env.ALPHA_PASSWORD);
const tokenB = await login(process.env.ALPHA_EMAIL_B, process.env.ALPHA_PASSWORD);

// 0) B 팀장이 소유한 C 팀 확보
let teamC = null;
{
  const mine = await api(tokenB, 'GET', '/me/teams');
  const items = mine.body?.data?.items ?? mine.body?.data ?? [];
  teamC = items.find((t) => t.name === TEAM_C_NAME)?.teamId ?? null;
  if (!teamC) {
    const b = await api(tokenB, 'GET', `/teams/${teamB}`);
    const created = await api(tokenB, 'POST', '/teams', { sportId: b.body.data.sport.sportId, regionId: b.body.data.region.regionId, name: TEAM_C_NAME, joinPolicy: 'approval_required', introduction: '컨택 보관 실측용 팀' });
    check('0) C 팀 생성', created.status === 201, `status=${created.status} code=${created.body?.code ?? ''}`);
    teamC = created.body?.data?.teamId ?? created.body?.data?.id ?? null;
  } else {
    console.log('0) C 팀 재사용', teamC);
  }
  if (!teamC) throw new Error('C 팀을 확보하지 못했다');
}

// 1) C↔A 에 남아 있는 요청이 있으면 정리한다(내가 보낸 requested 만 철회 가능)
{
  const rooms = await api(tokenB, 'GET', '/chat/rooms?roomType=team_contact&limit=50');
  const pair = (rooms.body?.data?.items ?? []).find((r) => r.teamContact && ((r.teamContact.fromTeam.id === teamC && r.teamContact.toTeam.id === teamA) || (r.teamContact.fromTeam.id === teamA && r.teamContact.toTeam.id === teamC)));
  if (pair?.teamContact.status === 'requested' && pair.teamContact.mySide === 'from') {
    const w = await api(tokenB, 'POST', `/team-contacts/${pair.teamContact.contactId}/withdraw`);
    console.log('1) 기존 requested 철회', w.status);
  } else if (pair?.teamContact.status === 'accepted') {
    throw new Error('C↔A 가 이미 accepted 라 거절 흐름을 만들 수 없다 — 다른 팀 이름으로 다시 실행하세요');
  }
}

// 2) C→A 발신, A 거절
const created = await api(tokenB, 'POST', `/teams/${teamA}/contacts`, { fromTeamId: teamC, message: `[보관 실측 ${new Date().toISOString().slice(0, 16)}] 한 번 붙어볼까요?` });
check('2) C→A 발신 201', created.status === 201, `status=${created.status} code=${created.body?.code ?? ''}`);
const roomId = created.body?.data?.chatRoomId; const contactId = created.body?.data?.id;
if (!roomId) throw new Error(`발신 실패: ${JSON.stringify(created.body).slice(0, 300)}`);
const declined = await api(tokenA, 'PATCH', `/team-contacts/${contactId}/decline`, { reason: '이번 주는 어려워요' });
check('2) A 거절 200 + chatRoomId', declined.status === 200 && declined.body?.data?.chatRoomId === roomId, `status=${declined.status}`);

// 3) 보관 단언 (B 관점)
const active = await api(tokenB, 'GET', '/chat/rooms?roomType=team_contact&limit=50');
check('3) 기본 목록에서 사라짐', !(active.body?.data?.items ?? []).some((r) => r.roomId === roomId));
const archived = await api(tokenB, 'GET', '/chat/rooms?roomType=team_contact&status=archived&limit=50');
const archivedRoom = (archived.body?.data?.items ?? []).find((r) => r.roomId === roomId);
check('3) status=archived 목록에 있음', Boolean(archivedRoom));
check('3) teamContact declined + 사유 + mySide from', archivedRoom?.teamContact?.status === 'declined' && archivedRoom?.teamContact?.declineReason === '이번 주는 어려워요' && archivedRoom?.teamContact?.mySide === 'from', JSON.stringify(archivedRoom?.teamContact ?? null));
const detail = await api(tokenB, 'GET', `/chat/rooms/${roomId}`);
check('3) 상세 200 + status archived', detail.status === 200 && detail.body?.data?.status === 'archived', `status=${detail.status} room=${detail.body?.data?.status}`);
const msgs = await api(tokenB, 'GET', `/chat/rooms/${roomId}/messages?limit=10`);
check('3) 시스템 메시지 "컨택을 거절했어요"', (msgs.body?.data?.items ?? []).some((m) => m.messageType === 'system' && m.content === '컨택을 거절했어요'));
const send = await api(tokenB, 'POST', `/chat/rooms/${roomId}/messages`, { content: '그래도 한 번만' });
check('3) 보관된 방 전송 409', send.status === 409, `status=${send.status} code=${send.body?.code}`);
const activeA = await api(tokenA, 'GET', '/chat/rooms?roomType=team_contact&limit=50');
check('3) A 기본 목록에서도 사라짐', !(activeA.body?.data?.items ?? []).some((r) => r.roomId === roomId));

// 4) 화면 캡처 (B 관점)
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: tokenB, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  // 목록: 토글 전 → 토글 후
  const page = await ctx.newPage();
  const resp = await page.goto(`${BASE}/chat?category=team_contact`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, `list-before-${vp.key}.png`) });
  // getByRole 은 숨겨진 요소(모바일에서 감춰진 데스크톱 사본 등)를 기본으로 제외한다.
  const toggle = page.getByRole('button', { name: '종료된 컨택 보기' }).first();
  const hasToggle = (await toggle.count()) > 0;
  if (hasToggle) await toggle.click();
  await page.waitForTimeout(2500);
  const probe = await page.evaluate(() => ({
    endedSection: Array.from(document.querySelectorAll('.tm-chat-section-label')).map((e) => e.textContent?.trim()).filter((t) => t?.startsWith('종료된 컨택')),
    badges: Array.from(document.querySelectorAll('.tm-badge')).map((b) => b.textContent?.trim()),
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  }));
  await page.screenshot({ path: path.join(OUT, `list-after-${vp.key}.png`) });
  console.log(`SHOT list ${vp.key} http=${resp?.status()} toggle=${hasToggle} ended=${JSON.stringify(probe.endedSection)} badges=${JSON.stringify(probe.badges.slice(0, 8))} overflow=${probe.overflow}`);
  if (vp.key === 'mobile') {
    check('4) 토글 버튼 렌더', hasToggle);
    check('4) 토글 뒤 "종료된 컨택 N" 섹션', probe.endedSection.length > 0, JSON.stringify(probe.endedSection));
    check('4) 종료 목록에 "거절됨" 배지', probe.badges.includes('거절됨'), JSON.stringify(probe.badges.slice(0, 8)));
    check('4) 390 가로 오버플로 없음', probe.overflow === false);
  }
  await page.close();
  // 보관된 방
  const room = await ctx.newPage();
  const r2 = await room.goto(`${BASE}/chat/${roomId}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await room.waitForTimeout(3000);
  await room.screenshot({ path: path.join(OUT, `room-archived-${vp.key}.png`) });
  const p2 = await room.evaluate(() => ({
    card: Boolean(document.querySelector('[aria-label="컨택 상태"]')),
    placeholder: document.querySelector('input[aria-label="메시지 입력"]')?.getAttribute('placeholder') ?? null,
    disabled: document.querySelector('input[aria-label="메시지 입력"]')?.disabled ?? null,
    reason: document.body.innerText.includes('거절 사유: 이번 주는 어려워요'),
  }));
  console.log(`SHOT room ${vp.key} http=${r2?.status()} card=${p2.card} input="${p2.placeholder}"/${p2.disabled} reason=${p2.reason}`);
  if (vp.key === 'mobile') {
    check('4) 보관된 방 상태 카드 + 거절 사유', p2.card && p2.reason);
    check('4) 보관된 방 입력 잠금 문구', p2.disabled === true && p2.placeholder === '종료된 컨택이에요', `${p2.placeholder}/${p2.disabled}`);
  }
  await room.close();
  await ctx.close();
  await new Promise((r) => setTimeout(r, 1500));
}
await browser.close();
await writeFile(path.join(OUT, 'checks.json'), JSON.stringify({ roomId, contactId, teamC, checks }, null, 2));
const failed = checks.filter((c) => !c.ok);
console.log(`\n=== ${checks.length - failed.length}/${checks.length} PASS ===`);
if (failed.length) { console.log('실패:', failed.map((f) => f.name).join(' / ')); process.exitCode = 1; }
