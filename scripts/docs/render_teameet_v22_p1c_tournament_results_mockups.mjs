import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FLOW = path.join(ROOT, '.omo/ultraresearch/20260627-152929-teameet-mobile-tournament-identity/mockups/service-wide-v22-ko');
const OUT = path.join(FLOW, 'pages');
const EVIDENCE = path.join(FLOW, 'evidence');
const MOCK = path.join(ROOT, 'apps/v1_web/public/mock/generated');
const SHEET = 'p1c-tournament-results-contact-sheet-v22.png';

mkdirSync(OUT, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });

const img = (name) => `data:image/webp;base64,${readFileSync(path.join(MOCK, name)).toString('base64')}`;
const images = { futsal: img('futsal-rooftop.webp'), huddle: img('team-huddle.webp') };
const variants = [
  { key: 'a', tone: 'toss-clean', label: 'A 토스 클린' },
  { key: 'b', tone: 'photo-accent', label: 'B 포토 액센트' },
  { key: 'c', tone: 'compact-utility', label: 'C 컴팩트 유틸리티' },
  { key: 'd', tone: 'rounded-community', label: 'D 라운드 커뮤니티' },
];

function css() {
  return `
    :root{--blue50:#eaf3ff;--blue500:#3182f6;--blue600:#2272e8;--green50:#e9f9ee;--green500:#12b76a;--orange50:#fff4e5;--orange500:#f79009;--red50:#fff0f1;--red500:#f04452;--grey50:#f9fafb;--grey100:#f2f4f6;--grey200:#e5e8eb;--grey300:#d1d6db;--grey500:#8b95a1;--grey700:#4e5968;--grey800:#333d4b;--grey900:#191f28;--shadow:0 1px 2px rgba(15,23,42,.05);--font:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}
    *{box-sizing:border-box}body{margin:0;background:#eef1f5;font-family:var(--font);color:var(--grey900)}.screen{width:390px;min-height:1120px;margin:0 auto;background:var(--grey50);overflow:hidden;position:relative}.topbar{height:58px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.96);border-bottom:1px solid var(--grey100);position:sticky;top:0;z-index:2}.topbar strong{font-size:16px}.iconbtn{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--grey100);background:#fff;color:var(--grey700);font-size:14px}.body{padding:18px 20px 96px}.eyebrow{font-size:12px;color:var(--blue600);font-weight:850;margin-bottom:6px}h1{font-size:25px;line-height:1.22;margin:0 0 6px;letter-spacing:0}.sub{margin:0;color:var(--grey500);font-size:13px;line-height:1.48}.section{margin-top:26px}.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.section h2{margin:0;font-size:16px}.link{color:var(--blue600);font-size:13px;font-weight:850}.card{background:#fff;border:1px solid var(--grey100);border-radius:18px;box-shadow:var(--shadow);padding:18px}.row{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:48px;border-bottom:1px solid var(--grey100)}.row:last-child{border-bottom:0}.row-main{min-width:0}.row-title{font-size:14px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row-sub{font-size:12px;color:var(--grey500);margin-top:4px;line-height:1.35}.badge{display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:999px;background:var(--grey100);color:var(--grey700);font-size:11px;font-weight:850;white-space:nowrap}.badge.blue{background:var(--blue50);color:var(--blue600)}.badge.green{background:var(--green50);color:var(--green500)}.badge.orange{background:var(--orange50);color:var(--orange500)}.badge.red{background:var(--red50);color:var(--red500)}.tabs{display:flex;gap:8px;overflow:hidden;margin-top:18px}.tab{height:34px;border-radius:999px;padding:0 13px;display:flex;align-items:center;border:1px solid var(--grey100);background:#fff;color:var(--grey700);font-size:12px;font-weight:850}.tab.active{background:var(--blue500);border-color:var(--blue500);color:#fff}.media{height:98px;border-radius:16px;overflow:hidden;margin-top:14px;position:relative;background:#dfe6ef}.media img{width:100%;height:100%;object-fit:cover;display:block}.media:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(25,31,40,0),rgba(25,31,40,.44))}.media-label{position:absolute;left:12px;bottom:10px;z-index:1;color:#fff;font-size:13px;font-weight:900}.hero-photo{display:none}.photo-accent .hero-photo{display:block}.table{display:grid;gap:0}.thead,.trow{display:grid;grid-template-columns:1.7fr repeat(6,.55fr);align-items:center;min-height:38px;border-bottom:1px solid var(--grey100);font-variant-numeric:tabular-nums}.thead{color:var(--grey500);font-size:11px;font-weight:850}.trow{font-size:12px}.trow:last-child{border-bottom:0}.teamcell{font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.num{text-align:center}.split{display:grid;grid-template-columns:1fr 1fr;gap:10px}.metric{padding:14px;background:var(--grey50);border-radius:16px}.metric strong{display:block;font-size:22px}.metric span{display:block;margin-top:5px;color:var(--grey500);font-size:12px}.scoreline{display:flex;align-items:center;justify-content:center;gap:14px;margin:14px 0}.score{font-size:34px;font-weight:950;font-variant-numeric:tabular-nums}.team{text-align:center;width:100px}.crest{width:38px;height:38px;border-radius:13px;background:var(--blue50);display:grid;place-items:center;margin:0 auto 8px;color:var(--blue600);font-weight:950}.team-name{font-size:13px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bracket{display:grid;gap:12px}.match{background:#fff;border:1px solid var(--grey100);border-radius:18px;padding:16px;box-shadow:var(--shadow)}.match-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.seed-row{display:grid;grid-template-columns:24px 1fr 34px;gap:8px;align-items:center;min-height:30px;font-size:13px}.seed{color:var(--grey500);font-weight:850}.winner{font-weight:950;color:var(--blue600)}.advance{margin-top:10px;padding-top:10px;border-top:1px solid var(--grey100);font-size:12px;color:var(--grey500);line-height:1.45}.action-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.action{min-height:54px;border:1px solid var(--grey100);border-radius:15px;background:#fff;padding:11px;font-size:13px;font-weight:850;color:var(--grey800)}.btn{width:100%;height:48px;border:0;border-radius:14px;background:var(--blue500);color:#fff;font-size:15px;font-weight:900;margin-top:14px}.btn.secondary{background:#fff;color:var(--grey800);border:1px solid var(--grey200)}.bottomnav{position:absolute;left:20px;right:20px;bottom:12px;height:64px;border-radius:24px;background:rgba(255,255,255,.96);border:1px solid rgba(229,232,235,.8);box-shadow:0 8px 24px rgba(20,28,45,.08);display:flex;align-items:center;justify-content:space-around}.navitem{font-size:11px;color:var(--grey500);font-weight:850}.navitem.active{color:var(--blue600)}.compact-utility .body{padding-left:16px;padding-right:16px}.compact-utility .section{margin-top:20px}.compact-utility .card,.compact-utility .match{padding:14px;border-radius:16px}.compact-utility .row{min-height:43px}.compact-utility h1{font-size:23px}.rounded-community .card,.rounded-community .match{border-radius:24px;background:linear-gradient(180deg,#fff,#fbfcff)}.rounded-community .metric{border-radius:20px;background:#f4f8ff}.rounded-community .badge{border-radius:14px}
  `;
}

const top = (title, action = '공유') => `<header class="topbar"><div class="iconbtn">‹</div><strong>${title}</strong><div class="iconbtn">${action.slice(0, 2)}</div></header>`;
const nav = () => `<nav class="bottomnav">${['홈', '매치', '대회', '팀', '마이'].map((item) => `<div class="navitem ${item === '대회' ? 'active' : ''}">${item}</div>`).join('')}</nav>`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${text}</span>`;
const row = (title, sub = '', trailing = '') => `<div class="row"><div class="row-main"><div class="row-title">${title}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>${trailing}</div>`;
const sec = (title, body, action = '') => `<section class="section"><div class="section-head"><h2>${title}</h2>${action ? `<span class="link">${action}</span>` : ''}</div>${body}</section>`;
const tabs = (items, active) => `<div class="tabs">${items.map((item) => `<div class="tab ${item === active ? 'active' : ''}">${item}</div>`).join('')}</div>`;

function standings(v) {
  const teams = [
    ['레드에프씨', 3, 2, 1, 0, '+4', 7],
    ['블루윙즈', 3, 2, 0, 1, '+2', 6],
    ['화이트에프씨', 3, 1, 1, 1, '0', 4],
    ['강서풋살', 3, 0, 0, 3, '-6', 0],
  ];
  return `<div class="screen ${v.tone}">${top('순위표')}<main class="body">
    <div class="eyebrow">2026 서머컵 · 진행 중</div><h1>A조 승점 경쟁이 좁혀졌어요</h1><p class="sub">운영자가 결과를 저장하면 승점과 득실이 바로 갱신됩니다.</p>
    <div class="hero-photo media"><img src="${images.futsal}" alt=""><div class="media-label">오늘의 A조 경기</div></div>${tabs(['A조', 'B조', '전체'], 'A조')}
    ${sec('A조 순위', `<div class="card table"><div class="thead"><div>팀</div><div class="num">경</div><div class="num">승</div><div class="num">무</div><div class="num">패</div><div class="num">득실</div><div class="num">승점</div></div>${teams.map((t) => `<div class="trow"><div class="teamcell">${t[0]}</div>${t.slice(1).map((n) => `<div class="num">${n}</div>`).join('')}</div>`).join('')}</div>`)}
    ${sec('다음 경기', `<div class="card">${row('레드에프씨 대 블루윙즈', '오늘 18:00 · 1구장 · A조 4경기', badge('예정', 'blue'))}${row('순위 영향', '레드에프씨 승리 시 조 1위 확정', badge('승점', 'orange'))}<button class="btn">경기 목록 보기</button></div>`)}
    ${sec('순위 산정', `<div class="card">${row('정렬 기준', '승점, 득실, 다득점 순으로 정렬합니다')}${row('반영 상태', '결과 저장 후 순위표와 대진표가 갱신됩니다', badge('자동', 'green'))}${row('검토 중 결과', '이의가 있으면 확정 전까지 보류됩니다', badge('보류', 'orange'))}</div>`)}
    ${sec('대회 이동', `<div class="card">${row('대진표 보기', '결선 라운드와 승자 이동 확인', '<span class="link">이동</span>')}${row('전체 경기 결과', '실시간, 예정, 종료 경기 모아보기', '<span class="link">이동</span>')}</div>`)}
  </main>${nav()}</div>`;
}

function matchNode(title, status, rows, note) {
  return `<div class="match"><div class="match-head"><strong>${title}</strong>${badge(status, status === '종료' ? 'green' : 'orange')}</div>${rows.map((r) => `<div class="seed-row"><div class="seed">${r.seed}</div><div class="${r.win ? 'winner' : ''}">${r.team}</div><div class="num">${r.score}</div></div>`).join('')}<div class="advance">${note}</div></div>`;
}

function bracket(v) {
  return `<div class="screen ${v.tone}">${top('대진표')}<main class="body">
    <div class="eyebrow">2026 서머컵 · 결선 진행</div><h1>4강 진출 팀이 확정되고 있어요</h1><p class="sub">라운드별 결과와 다음 라운드 이동을 한 화면씩 확인합니다.</p>
    <div class="hero-photo media"><img src="${images.futsal}" alt=""><div class="media-label">결선 라운드</div></div>${tabs(['8강', '4강', '결승'], '8강')}
    ${sec('8강 결과', `<div class="bracket">${matchNode('8강 1경기', '종료', [{ seed: '1', team: '한강러너스', score: '2', win: true }, { seed: '8', team: '송파위너스', score: '1' }], '한강러너스가 4강 1경기로 이동합니다.')}${matchNode('8강 2경기', '종료', [{ seed: '4', team: '마포라이트닝', score: '0' }, { seed: '5', team: '팀밋에프씨', score: '0', win: true }], '승부차기 3 : 4, 팀밋에프씨가 4강 1경기로 이동합니다.')}${matchNode('8강 3경기', '예정', [{ seed: '2', team: '레드에프씨', score: '-' }, { seed: '7', team: '강서풋살', score: '-' }], '오늘 19:00 시작, 승자는 4강 2경기로 이동합니다.')}</div>`)}
    ${sec('다음 라운드', `<div class="card">${row('4강 1경기', '한강러너스 대 팀밋에프씨 · 내일 14:00', badge('확정', 'green'))}${row('4강 2경기', '8강 3경기 승자 대 8강 4경기 승자', badge('대기', 'orange'))}</div>`)}
    ${sec('결과 검토', `<div class="card">${row('보류 규칙', '이의 제기 중인 결과는 대진 이동을 보류합니다')}${row('운영 반영', '확정 저장 후 순위표와 경기 목록에 함께 반영됩니다', badge('동기화', 'blue'))}</div>`)}
    ${sec('대회 이동', `<div class="card">${row('경기 목록 보기', '결선 경기 시간과 상세 기록 확인', '<span class="link">이동</span>')}${row('순위표 보기', '조별 성적과 최종 순위 확인', '<span class="link">이동</span>')}</div>`)}
  </main>${nav()}</div>`;
}

function completed(v) {
  return `<div class="screen ${v.tone}">${top('대회 결과')}<main class="body">
    <div class="eyebrow">2026 서머컵 · 종료</div><h1>레드에프씨가 우승했어요</h1><p class="sub">결승 결과, 수상 기록, 하이라이트와 후기를 한곳에서 확인합니다.</p>
    <div class="hero-photo media"><img src="${images.huddle}" alt=""><div class="media-label">우승 팀 기록</div></div>
    <section class="section"><div class="card"><div style="text-align:center">${badge('우승', 'green')}<div class="scoreline"><div class="team"><div class="crest">레</div><div class="team-name">레드에프씨</div></div><div class="score">3 : 2</div><div class="team"><div class="crest">블</div><div class="team-name">블루윙즈</div></div></div><p class="sub">결승 · 서울 디풋살파크 · 07.26 18:00</p></div></div></section>
    ${sec('수상 기록', `<div class="card"><div class="split"><div class="metric"><strong>홍길동</strong><span>최우수 선수</span></div><div class="metric"><strong>김철수</strong><span>득점왕</span></div></div>${row('준우승', '블루윙즈 · 결승 2득점', badge('2위', 'blue'))}${row('페어플레이', '화이트에프씨 · 경고 0회', badge('수상', 'green'))}</div>`)}
    ${sec('다시 보기', `<div class="action-grid"><button class="action">하이라이트 보기</button><button class="action">사진 모아보기</button><button class="action">후기 작성</button><button class="action">기록 공유</button></div>`)}
    ${sec('다음 대회', `<div class="card">${row('가을 풋살컵', '9월 접수 예정 · 같은 지역 우선 알림', badge('알림', 'orange'))}${row('알림 상태', '참가 모집보다 종료 후 재방문을 먼저 안내합니다', badge('선택', 'blue'))}<button class="btn">다음 대회 알림 받기</button><button class="btn secondary">최종 순위 보기</button></div>`)}
    ${sec('결과 이동', `<div class="card">${row('전체 경기 결과', '예선부터 결승까지 스코어 확인', '<span class="link">이동</span>')}${row('대진표 보기', '결선 이동과 최종 결과 확인', '<span class="link">이동</span>')}</div>`)}
  </main>${nav()}</div>`;
}

const screens = [
  { id: 'B8-03', slug: 'tournament-standings', title: '순위표', render: standings },
  { id: 'B8-04', slug: 'tournament-bracket', title: '대진표', render: bracket },
  { id: 'B8-05', slug: 'tournament-completed-retention', title: '종료 결과', render: completed },
];

const outputName = (screen, variant) => `${screen.id.toLowerCase()}-${screen.slug}-${variant.key}-v22.png`;
const expectedNames = () => new Set(screens.flatMap((screen) => variants.map((variant) => outputName(screen, variant))));
function clearOwnedPngs() {
  const expected = expectedNames();
  const prefixes = screens.map((screen) => `${screen.id.toLowerCase()}-`);
  for (const name of readdirSync(OUT)) {
    if (name.endsWith('.png') && prefixes.some((prefix) => name.startsWith(prefix)) && !expected.has(name)) rmSync(path.join(OUT, name));
  }
}
function html(screen, variant) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${screen.title} ${variant.label}</title><style>${css()}</style></head><body>${screen.render(variant)}</body></html>`;
}
const pngData = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
function sheetHtml(items) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.sheet{width:930px;padding:18px;display:grid;grid-template-columns:repeat(4,210px);gap:28px 18px}.label{height:32px;font-size:12px;color:#191f28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}img{width:210px;height:420px;object-fit:contain;object-position:top center;display:block;background:#fff}</style></head><body><main class="sheet">${items.map((item) => `<section><div class="label">${item.label}</div><img src="${item.src}" alt=""></section>`).join('')}</main></body></html>`;
}
async function renderScreen(browser, screen) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  for (const variant of variants) {
    await page.setContent(html(screen, variant), { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(OUT, outputName(screen, variant)), fullPage: true });
  }
  await page.close();
}
async function renderSheet(browser) {
  const page = await browser.newPage({ viewport: { width: 980, height: 1420 }, deviceScaleFactor: 1 });
  const items = screens.flatMap((screen) => variants.map((variant) => ({ label: `${screen.id} ${screen.title} · ${variant.label}`, src: pngData(path.join(OUT, outputName(screen, variant))) })));
  await page.setContent(sheetHtml(items), { waitUntil: 'load' });
  await page.screenshot({ path: path.join(EVIDENCE, SHEET), fullPage: true });
  await page.close();
}

clearOwnedPngs();
const browser = await chromium.launch();
await Promise.all(screens.map((screen) => renderScreen(browser, screen)));
await renderSheet(browser);
await browser.close();
console.log(`rendered ${screens.length * variants.length} png files`);
console.log(OUT);
console.log(path.join(EVIDENCE, SHEET));
