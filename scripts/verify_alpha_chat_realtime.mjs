/**
 * PR #828 실측 검증 — 채팅방 실시간 수신이 실제로 동작하는가.
 *
 * 무엇을 증명하나
 *   `useV1ChatRoomSocket` 훅은 원래 만들어져 있었지만 **어느 화면에서도 호출되지 않아서**
 *   서버가 `chat:message` 를 emitToUser 해도 받는 쪽이 없었다. 열어 둔 채팅방은 30초
 *   staleTime + 창 포커스 refetch 에만 의존했다. #828 은 `ChatRoomPageClient` 에서 그
 *   훅을 실제로 마운트한다.
 *
 *   유닛 테스트는 "화면이 훅을 마운트하는가"까지만 본다. 소켓이 실제로 연결되고 이벤트가
 *   도달해 화면이 갱신되는지는 배포본에서만 확인된다 — 그래서 이 스크립트가 있다.
 *
 * 판정 방법 (reload 없이)
 *   1. 관찰자(A) 브라우저로 채팅방을 연다.
 *   2. 페이지의 네트워크를 감시해 **이후 발생하는 모든 fetch 를 기록**한다.
 *   3. 발신자(B)가 REST 로 새 메시지를 보낸다.
 *   4. A 의 DOM 에 그 메시지 문구가 나타나는지 기다린다 — **페이지를 새로고침하지 않는다.**
 *   5. 30초 staleTime 폴백과 구분하기 위해 대기 상한을 그보다 짧게 둔다(기본 12초).
 *      12초 안에 뜨면 소켓 경로가 실제로 살아 있다는 뜻이다.
 *
 * 자격증명은 **환경변수로만** 넘긴다(이 저장소는 PUBLIC).
 *
 * 사용법:
 *   OBSERVER_TOKEN=v1.... SENDER_TOKEN=v1.... ROOM_ID=<uuid> \
 *     node scripts/verify_alpha_chat_realtime.mjs [outDir]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/chat-realtime';
const OBSERVER_TOKEN = process.env.OBSERVER_TOKEN;
const SENDER_TOKEN = process.env.SENDER_TOKEN;
const ROOM_ID = process.env.ROOM_ID;
// 30초 staleTime 폴백보다 확실히 짧게 — 이 안에 뜨면 소켓 때문이지 refetch 때문이 아니다.
const WAIT_MS = Number(process.env.WAIT_MS ?? 12000);

if (!OBSERVER_TOKEN || !SENDER_TOKEN || !ROOM_ID) {
  console.error('OBSERVER_TOKEN / SENDER_TOKEN / ROOM_ID 가 모두 필요해요.');
  process.exit(1);
}

const cookieFor = (token) => ({
  name: 'teameet_v1_session',
  value: token,
  domain: new URL(BASE).hostname,
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
});

await mkdir(OUT, { recursive: true });

const marker = `실시간검증-${process.env.RUN_TAG ?? 'run'}-${process.hrtime.bigint().toString(36)}`;
const report = { base: BASE, roomId: ROOM_ID, marker, steps: [] };
const step = (name, data) => {
  report.steps.push({ name, ...data });
  console.log(`[${name}]`, JSON.stringify(data));
};

// 배포본 정체를 먼저 박제한다 — 어떤 커밋을 보고 판정했는지 나중에 다투지 않기 위해서.
const head = await fetch(`${BASE}/landing`, { method: 'HEAD' });
report.servingCommit = head.headers.get('x-teameet-commit');
report.servingRelease = head.headers.get('x-teameet-release');
step('serving', { commit: report.servingCommit, release: report.servingRelease });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([cookieFor(OBSERVER_TOKEN)]);
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
});
const wsFrames = [];
page.on('websocket', (ws) => {
  wsFrames.push({ url: ws.url(), at: 'open' });
  ws.on('framereceived', (f) => {
    const payload = typeof f.payload === 'string' ? f.payload : '';
    if (payload.includes('chat:message')) wsFrames.push({ at: 'chat:message', payload: payload.slice(0, 300) });
  });
});

// 라이브 폴링이 있는 화면은 networkidle 이 끝나지 않는다 — domcontentloaded + 명시 대기.
await page.goto(`${BASE}/chat/${ROOM_ID}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);

const openedTitle = await page.title();
const socketOpened = wsFrames.some((f) => f.at === 'open');
step('room-opened', { title: openedTitle, websocketOpened: socketOpened, websockets: wsFrames.filter((f) => f.at === 'open').map((f) => f.url) });

await page.screenshot({ path: `${OUT}/01-before-send.png`, fullPage: false });

// 관찰자 페이지에서 발생하는 fetch 를 기록 — 소켓이 아니라 폴링으로 갱신됐을 가능성을
// 나중에 배제하기 위해서다.
const requests = [];
page.on('request', (r) => {
  if (r.url().includes('/api/v1/chat/')) requests.push({ t: Date.now(), method: r.method(), url: r.url().replace(BASE, '') });
});

const sendAt = Date.now();
const sendRes = await fetch(`${BASE}/api/v1/chat/rooms/${ROOM_ID}/messages`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: `teameet_v1_session=${SENDER_TOKEN}` },
  body: JSON.stringify({ content: marker }),
});
const sendBody = await sendRes.text();
step('sent', { status: sendRes.status, marker, body: sendBody.slice(0, 300) });

if (!sendRes.ok) {
  report.verdict = 'INCONCLUSIVE_SEND_FAILED';
  await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  console.error('메시지 전송이 실패해 판정할 수 없어요.');
  process.exit(2);
}

let appearedMs = null;
try {
  await page.getByText(marker, { exact: false }).first().waitFor({ state: 'visible', timeout: WAIT_MS });
  appearedMs = Date.now() - sendAt;
} catch {
  appearedMs = null;
}

await page.screenshot({ path: `${OUT}/02-after-send.png`, fullPage: false });

// reload 없이 떴는지 명시 확인 — 이 스크립트는 goto 를 한 번만 한다.
report.navigations = page.url();
report.consoleErrors = consoleErrors;
report.chatRequestsAfterSend = requests;
report.wsChatFrames = wsFrames.filter((f) => f.at === 'chat:message').length;

step('appeared', { appearedMs, waitedMs: WAIT_MS, wsChatFrames: report.wsChatFrames, chatFetches: requests.length });

report.verdict = appearedMs !== null ? 'PASS_REALTIME' : 'FAIL_NO_REALTIME';
await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await browser.close();

console.log(`\n판정: ${report.verdict}  (배포 커밋 ${report.servingCommit?.slice(0, 8)})`);
if (appearedMs !== null) {
  console.log(`새 메시지가 새로고침 없이 ${appearedMs}ms 만에 화면에 나타났어요 (staleTime 30s 폴백보다 훨씬 빠름).`);
} else {
  console.log(`${WAIT_MS}ms 안에 나타나지 않았어요 — 소켓 경로가 살아 있지 않을 수 있어요.`);
}
process.exit(appearedMs !== null ? 0 : 1);
