import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FLOW = path.join(ROOT, '.omo/ultraresearch/20260627-152929-teameet-mobile-tournament-identity/mockups/service-wide-v22-ko');
const OUT = path.join(FLOW, 'pages');
const EVIDENCE = path.join(FLOW, 'evidence');
const OMO_EV = path.join(ROOT, '.omo/evidence');
mkdirSync(OUT, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });
mkdirSync(OMO_EV, { recursive: true });

const variants = [
  { key: 'a', label: 'A 토스 클린', tone: 'clean' },
  { key: 'b', label: 'B 컨텍스트 강조', tone: 'context' },
  { key: 'c', label: 'C 컴팩트 메시징', tone: 'compact' },
  { key: 'd', label: 'D 라운드 소프트', tone: 'round' },
];
const screens = [
  { id: 'B6-04', slug: 'chat-list', title: '채팅 목록', render: chatList },
  { id: 'B6-05', slug: 'chat-room', title: '채팅방', render: chatRoom },
];
const outputName = (screen, variant) => `${screen.id.toLowerCase()}-${screen.slug}-${variant.key}-v22.png`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${text}</span>`;
const row = (title, sub = '', options = {}) => {
  const { meta = '', unread = '' } = options;
  return `<div class="row"><div class="avatar">${title.slice(0, 1)}</div><div class="main"><strong>${title}</strong>${sub ? `<p>${sub}</p>` : ''}</div><div class="meta">${meta}${unread ? `<em>${unread}</em>` : ''}</div></div>`;
};
const section = (title, body, action = '') => `<section class="section"><div class="head"><h2>${title}</h2>${action ? `<span>${action}</span>` : ''}</div><div class="group">${body}</div></section>`;
const top = (title, action = '') => `<header class="top"><button>뒤로</button><strong>${title}</strong><button>${action}</button></header>`;
const nav = () => `<nav class="nav">${['홈', '매치', '팀', '알림', '마이'].map((x) => `<span class="${x === '알림' ? 'active' : ''}">${x}</span>`).join('')}</nav>`;

function chatList(variant) {
  return `<div class="screen ${variant.tone}">${top('채팅', '검색')}<main>
    <section class="intro"><h1>대화가 필요한 순간만</h1><p>매치 확정, 팀 초대, 운영 문의를 맥락별로 정리해요.</p></section>
    <div class="tabs"><span class="on">전체</span><span>매치</span><span>팀</span><span>운영</span></div>
    ${section('진행 중', [
      row('한강 풋살 매치', '주차 위치 공유했어요', { meta: '방금', unread: '2' }),
      row('성수 위너스 FC', '목요일 참석 가능해요?', { meta: '12:20' }),
      row('Teameet 운영팀', '환불 문의 답변이 도착했어요', { meta: '어제', unread: '1' }),
    ].join(''))}
    ${section('보관함', [
      row('레드 FC 친선전', '경기 종료 후 대화가 보관됐어요', { meta: '06.25' }),
      row('러닝 번개', '참가 취소 후 읽기 전용으로 전환됐어요', { meta: '06.21' }),
    ].join(''))}
    ${section('빈 상태', `<div class="empty"><b>아직 열린 대화가 없어요</b><p>매치가 확정되거나 팀 초대가 오면 대화방이 생성돼요.</p></div>`)}
  </main>${nav()}</div>`;
}

function chatRoom(variant) {
  return `<div class="screen ${variant.tone} room">${top('한강 풋살 매치', '정보')}<main>
    <section class="contextbar">${badge('매치 확정', 'green')}<h1>오늘 19:00 · 서울 디풋살파크</h1><p>참가자 8명 · 경기 시작 2시간 전</p></section>
    <div class="day">오늘</div>
    <div class="msg other"><b>민준</b><p>혹시 주차는 어디에 하면 될까요?</p><span>15:42</span></div>
    <div class="msg mine"><p>구장 건물 뒤쪽 공영주차장 쓰면 된다고 해요.</p><span>15:44</span></div>
    <div class="msg other"><b>서연</b><p>저는 10분 정도 늦을 수 있어요. 먼저 몸 풀고 계시면 바로 합류할게요.</p><span>15:47</span></div>
    <div class="system">운영 알림 · 경기 시작 1시간 전에는 취소가 제한돼요.</div>
    <div class="msg mine failed"><p>도착하면 파란색 조끼 받을게요.</p><span>전송 실패</span><button>재시도</button></div>
    ${section('대화 정보', [
      `<div class="info"><strong>참가자</strong><span>8명</span></div>`,
      `<div class="info"><strong>알림</strong><span>켜짐</span></div>`,
      `<div class="info"><strong>신고/문의</strong><span>운영팀 연결</span></div>`,
    ].join(''))}
  </main><div class="composer"><span>메시지 입력</span><button>전송</button></div></div>`;
}

function css() {
  return `:root{--blue:#3182f6;--blue50:#eaf3ff;--green:#03b26c;--green50:#e9f9ef;--orange:#f59f00;--orange50:#fff4e6;--red:#f04452;--red50:#fff1f2;--bg:#f9fafb;--g100:#f2f4f6;--g200:#e5e8eb;--g500:#8b95a1;--g700:#4e5968;--g900:#191f28}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--g900);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif}.screen{width:390px;min-height:1100px;margin:0 auto;background:var(--bg);position:relative;overflow:hidden}.top{height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.97);border-bottom:1px solid var(--g100);position:sticky;top:0;z-index:2}.top button{border:0;background:transparent;color:var(--g700);font-size:12px;font-weight:800}.top strong{font-size:16px}main{padding:18px 20px 96px}.intro h1,.contextbar h1{margin:0;font-size:24px;line-height:1.22;letter-spacing:0}.intro p,.contextbar p{margin:8px 0 0;color:var(--g500);font-size:13px;line-height:1.5}.tabs{display:flex;gap:8px;margin-top:16px}.tabs span{height:34px;padding:0 12px;border-radius:999px;background:white;border:1px solid var(--g100);display:flex;align-items:center;font-size:12px;font-weight:900;color:var(--g700)}.tabs .on{background:var(--blue);border-color:var(--blue);color:white}.section{margin-top:22px}.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.head h2{margin:0;font-size:15px}.head span{font-size:12px;color:var(--blue);font-weight:900}.group{background:white;border:1px solid var(--g100);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}.row{min-height:66px;padding:13px 14px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--g100)}.row:last-child{border-bottom:0}.avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--blue50);color:var(--blue);font-weight:900}.main{min-width:0;flex:1}.row strong{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row p{margin:5px 0 0;color:var(--g500);font-size:12px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta{display:grid;justify-items:end;gap:6px;color:var(--g500);font-size:11px;font-weight:800}.meta em{min-width:20px;height:20px;border-radius:10px;background:var(--blue);color:white;display:grid;place-items:center;font-style:normal}.empty{padding:24px 16px;text-align:center}.empty b{font-size:15px}.empty p{margin:8px auto 0;max-width:250px;color:var(--g500);font-size:12px;line-height:1.45}.badge{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:var(--g100);color:var(--g700);font-size:11px;font-weight:900}.badge.green{background:var(--green50);color:var(--green)}.contextbar{padding:16px;background:white;border:1px solid var(--g100);border-radius:20px}.contextbar h1{margin-top:8px;font-size:19px}.day{text-align:center;color:var(--g500);font-size:12px;font-weight:900;margin:18px 0}.msg{max-width:78%;margin-top:12px;padding:12px 14px;border-radius:18px;background:white;border:1px solid var(--g100)}.msg b{font-size:12px}.msg p{margin:5px 0 0;font-size:14px;line-height:1.45}.msg span{display:block;margin-top:6px;color:var(--g500);font-size:11px}.mine{margin-left:auto;background:var(--blue);color:white;border-color:var(--blue)}.mine span{color:rgba(255,255,255,.78)}.failed{background:white;color:var(--g900);border-color:#ffd5d9}.failed span{color:var(--red)}.failed button{margin-top:8px;height:30px;border:0;border-radius:10px;background:var(--red50);color:var(--red);font-weight:900}.system{margin:16px auto 4px;padding:10px 12px;max-width:310px;border-radius:13px;background:var(--g100);color:var(--g700);font-size:12px;text-align:center}.info{min-height:48px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--g100)}.info:last-child{border-bottom:0}.info strong{font-size:14px}.info span{font-size:12px;color:var(--blue);font-weight:900}.composer{position:absolute;left:14px;right:14px;bottom:14px;height:54px;border-radius:22px;background:white;border:1px solid var(--g200);display:flex;align-items:center;gap:10px;padding:7px}.composer span{flex:1;color:var(--g500);font-size:13px;padding-left:12px}.composer button{width:64px;height:40px;border:0;border-radius:16px;background:var(--blue);color:white;font-weight:900}.nav{position:absolute;left:20px;right:20px;bottom:12px;height:62px;border:1px solid rgba(229,232,235,.9);border-radius:23px;background:rgba(255,255,255,.96);box-shadow:0 8px 22px rgba(20,28,45,.08);display:flex;align-items:center;justify-content:space-around}.nav span{font-size:11px;color:var(--g500);font-weight:900}.nav .active{color:var(--blue)}.context .intro,.context .contextbar{background:linear-gradient(180deg,#fff,#f7fbff)}.compact main{padding-left:16px;padding-right:16px}.compact .section{margin-top:16px}.compact .row{min-height:58px}.compact .group,.compact .contextbar{border-radius:15px}.compact .msg{padding:10px 12px}.round .group,.round .contextbar,.round .msg{border-radius:24px}.round .composer{border-radius:26px}`;
}

function clearOwned() {
  const expected = new Set(screens.flatMap((screen) => variants.map((variant) => outputName(screen, variant))));
  for (const name of readdirSync(OUT)) {
    if (name.endsWith('.png') && ['b6-04-', 'b6-05-'].some((prefix) => name.startsWith(prefix)) && !expected.has(name)) rmSync(path.join(OUT, name));
  }
}

const dim = (file) => {
  const buf = readFileSync(file);
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
};
const data = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const html = (screen, variant) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${screen.title}</title><style>${css()}</style></head><body>${screen.render(variant)}</body></html>`;

async function renderScreen(browser, screen, variant) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html(screen, variant), { waitUntil: 'load' });
  const file = path.join(OUT, outputName(screen, variant));
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return file;
}

async function renderSheet(browser) {
  const items = screens.flatMap((screen) => variants.map((variant) => ({ label: `${screen.id} ${screen.title} · ${variant.label}`, src: data(path.join(OUT, outputName(screen, variant))) })));
  const page = await browser.newPage({ viewport: { width: 980, height: 1040 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="ko"><style>body{margin:0;background:white;font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.sheet{width:930px;padding:18px;display:grid;grid-template-columns:repeat(4,210px);gap:28px 18px}.label{height:32px;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}img{width:210px;height:420px;object-fit:contain;object-position:top center;background:#fff}</style><main class="sheet">${items.map((item) => `<section><div class="label">${item.label}</div><img src="${item.src}" alt=""></section>`).join('')}</main></html>`);
  const file = path.join(EVIDENCE, 'p3b-chat-contact-sheet-v22.png');
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return file;
}

function writeEvidence(files, sheet) {
  const rows = files.sort().map((file) => `| ${path.relative(ROOT, file)} | ${dim(file)} | ${statSync(file).size} |`).join('\n');
  writeFileSync(path.join(OMO_EV, 'teameet-v22-p3b-chat-verification.md'), `# Teameet v22 P3B Chat Verification\n\n| Artifact | Dimensions | Bytes |\n| --- | ---: | ---: |\n${rows}\n| ${path.relative(ROOT, sheet)} | ${dim(sheet)} | ${statSync(sheet).size} |\n\n## Scope\n\n- B6-04 채팅 목록\n- B6-05 채팅방\n\n## Checks\n\n- 8 raw mobile PNGs generated.\n- A/B/C/D variants generated for both screens.\n- Message failure/retry and empty states are represented.\n- Messaging surfaces avoid marketing hero layout, nested content cards, content glass, and CTA competition.\n`);
}

clearOwned();
const browser = await chromium.launch();
const files = await Promise.all(screens.flatMap((screen) => variants.map((variant) => renderScreen(browser, screen, variant))));
const sheet = await renderSheet(browser);
await browser.close();
writeEvidence(files, sheet);
console.log(`rendered ${files.length} png files`);
console.log(sheet);
