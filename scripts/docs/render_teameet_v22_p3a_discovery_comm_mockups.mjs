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
  { key: 'b', label: 'B 라이트 포커스', tone: 'focus' },
  { key: 'c', label: 'C 컴팩트 운영', tone: 'compact' },
  { key: 'd', label: 'D 라운드 소프트', tone: 'round' },
];
const screens = [
  { id: 'B6-01', slug: 'search', title: '통합 검색', render: searchScreen },
  { id: 'B6-02', slug: 'notices', title: '공지', render: noticeScreen },
  { id: 'B6-03', slug: 'notifications', title: '알림', render: notificationScreen },
];

const outputName = (screen, variant) => `${screen.id.toLowerCase()}-${screen.slug}-${variant.key}-v22.png`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${text}</span>`;
const row = (title, sub = '', options = {}) => {
  const { trail = '>', tone = '' } = options;
  return `<div class="row"><div class="main"><strong>${title}</strong>${sub ? `<p>${sub}</p>` : ''}</div><span class="trail ${tone}">${trail}</span></div>`;
};
const section = (title, body, action = '') => `<section class="section"><div class="head"><h2>${title}</h2>${action ? `<span>${action}</span>` : ''}</div><div class="group">${body}</div></section>`;
const top = (title, action = '') => `<header class="top"><button>뒤로</button><strong>${title}</strong><button>${action}</button></header>`;
const nav = (active = '홈') => `<nav class="nav">${['홈', '매치', '팀', '알림', '마이'].map((x) => `<span class="${x === active ? 'active' : ''}">${x}</span>`).join('')}</nav>`;

function searchScreen(variant) {
  const sports = ['풋살', '농구', '러닝', '배드민턴', '수영'];
  return `<div class="screen ${variant.tone}">${top('검색')}<main>
    <section class="intro"><h1>무엇을 찾고 있나요?</h1><p>매치, 팀, 대회, 장소를 한 번에 찾아요.</p><div class="searchbar">성수 풋살</div></section>
    ${section('추천 검색', `<div class="chips">${sports.map((x) => badge(x, x === '풋살' ? 'blue' : '')).join('')}</div>`)}
    ${section('최근 검색', [
      row('성수 풋살', '어제 검색', { trail: '삭제' }),
      row('주말 러닝', '3일 전 검색', { trail: '삭제' }),
    ].join(''), '전체삭제')}
    ${section('검색 결과', [
      row('성수 위너스 FC', '팀 · 성동구 · 최근 활동 2일 전', { trail: badge('팀', 'blue') }),
      row('한강 풋살 매치', '매치 · 7월 4일 토 18:00 · 6/10명', { trail: badge('모집', 'green') }),
      row('Teameet Cup', '대회 · 접수중 · 풋살/축구', { trail: badge('대회') }),
      row('성수 실내구장', '장소 · 실내 · 주차 가능', { trail: badge('장소') }),
    ].join(''))}
    ${section('결과 없음 상태', `<div class="empty"><b>검색 결과가 없어요</b><p>종목이나 지역 범위를 넓혀 다시 검색해 보세요.</p><button>조건 초기화</button></div>`)}
  </main>${nav()}</div>`;
}

function noticeScreen(variant) {
  return `<div class="screen ${variant.tone}">${top('공지', '필터')}<main>
    <section class="intro"><h1>운영 공지</h1><p>대회, 매치, 결제, 서비스 변경사항을 한 곳에서 확인해요.</p></section>
    ${section('중요 공지', [
      row('2026 Summer Cup 운영 안내', '대회 · 오늘 09:00', { trail: badge('중요', 'orange') }),
      row('장마철 실내구장 환불 기준 안내', '매치 · 어제 18:30', { trail: badge('필독') }),
    ].join(''))}
    ${section('전체 공지', [
      row('알림센터 읽음 처리 개선', '서비스 · 06.28', { trail: '보기' }),
      row('팀 초대 링크 만료 정책 변경', '팀 · 06.26', { trail: '보기' }),
      row('후기 검증 신호 업데이트', '후기 · 06.24', { trail: '보기' }),
    ].join(''))}
    ${section('공지 상세 미리보기', `<article class="article"><span>대회</span><h2>2026 Summer Cup 운영 안내</h2><p>참가팀 확정 이후 예선 조 편성이 완료됐습니다. 경기 시작 전 로스터와 유니폼 색상을 다시 확인해 주세요.</p><div class="notice">관련 화면: 대회 상세 · 내 신청 상태 · 경기 일정</div></article>`)}
  </main>${nav('알림')}</div>`;
}

function notificationScreen(variant) {
  return `<div class="screen ${variant.tone}">${top('알림', '설정')}<main>
    <section class="intro"><h1>놓치면 안 되는 변화</h1><p>확정, 취소, 초대, 리뷰 요청을 상태별로 모아 보여줘요.</p></section>
    <div class="tabs"><span class="on">전체</span><span>매치</span><span>팀</span><span>대회</span></div>
    ${section('새 알림', [
      row('한강 풋살 매치 참가 확정', '오늘 19:00 경기 · 방금 전', { trail: badge('확정', 'green') }),
      row('레드 FC 초대가 도착했어요', '팀 초대 · 12분 전', { trail: badge('응답', 'blue') }),
      row('Teameet Cup 입금 확인 필요', '대회 신청 · 오늘 10:20', { trail: badge('필요', 'orange') }),
    ].join(''), '읽음 처리')}
    ${section('이전 알림', [
      row('후기 작성 요청', '어제 종료된 매치 · 3일 안에 작성', { trail: '작성' }),
      row('공지 업데이트', '대회 규칙 및 유의사항 안내', { trail: '보기' }),
      row('팀 일정 변경', '7월 4일 18:00로 변경됨', { trail: '확인' }),
    ].join(''))}
    ${section('빈 상태', `<div class="empty"><b>아직 새 알림이 없어요</b><p>참가 확정, 초대, 공지는 여기에 쌓입니다.</p></div>`)}
  </main>${nav('알림')}</div>`;
}

function css() {
  return `:root{--blue:#3182f6;--blue50:#eaf3ff;--green:#03b26c;--green50:#e9f9ef;--orange:#f59f00;--orange50:#fff4e6;--red:#f04452;--bg:#f9fafb;--g50:#f9fafb;--g100:#f2f4f6;--g200:#e5e8eb;--g500:#8b95a1;--g700:#4e5968;--g900:#191f28}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--g900);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif}.screen{width:390px;min-height:1180px;margin:0 auto;background:var(--bg);position:relative;overflow:hidden}.top{height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.97);border-bottom:1px solid var(--g100);position:sticky;top:0;z-index:2}.top button{border:0;background:transparent;color:var(--g700);font-size:12px;font-weight:800}.top strong{font-size:16px}main{padding:18px 20px 96px}.intro{padding:4px 0 2px}.intro h1{margin:0;font-size:25px;line-height:1.22;letter-spacing:0}.intro p{margin:8px 0 0;color:var(--g500);font-size:13px;line-height:1.5}.searchbar{height:48px;margin-top:16px;border-radius:16px;background:white;border:1px solid var(--g200);display:flex;align-items:center;padding:0 15px;color:var(--g900);font-size:15px;font-weight:800}.section{margin-top:22px}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.head h2{margin:0;font-size:15px;letter-spacing:0}.head span{font-size:12px;color:var(--blue);font-weight:900}.group{background:white;border:1px solid var(--g100);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}.row{min-height:58px;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--g100)}.row:last-child{border-bottom:0}.main{min-width:0}.row strong{display:block;font-size:14px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row p{margin:5px 0 0;color:var(--g500);font-size:12px;line-height:1.35}.trail{font-size:12px;font-weight:900;color:var(--g500);white-space:nowrap}.badge{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:var(--g100);color:var(--g700);font-size:11px;font-weight:900}.badge.blue{background:var(--blue50);color:var(--blue)}.badge.green{background:var(--green50);color:var(--green)}.badge.orange{background:var(--orange50);color:var(--orange)}.chips{padding:13px;display:flex;flex-wrap:wrap;gap:8px}.empty{padding:22px 16px;text-align:center}.empty b{font-size:15px}.empty p{margin:8px auto 0;max-width:245px;color:var(--g500);font-size:12px;line-height:1.45}.empty button{height:38px;margin-top:14px;border:0;border-radius:12px;background:var(--blue);color:white;font-weight:900}.article{padding:16px}.article span{color:var(--blue);font-size:12px;font-weight:900}.article h2{margin:7px 0 8px;font-size:18px;line-height:1.25}.article p{margin:0;color:var(--g700);font-size:13px;line-height:1.55}.notice{margin-top:14px;padding:12px;border-radius:14px;background:var(--blue50);color:var(--blue);font-size:12px;font-weight:800}.tabs{display:flex;gap:8px;margin-top:14px}.tabs span{height:34px;padding:0 12px;border-radius:999px;background:white;border:1px solid var(--g100);display:flex;align-items:center;color:var(--g700);font-size:12px;font-weight:900}.tabs .on{background:var(--blue);border-color:var(--blue);color:white}.nav{position:absolute;left:20px;right:20px;bottom:12px;height:62px;border:1px solid rgba(229,232,235,.9);border-radius:23px;background:rgba(255,255,255,.96);box-shadow:0 8px 22px rgba(20,28,45,.08);display:flex;align-items:center;justify-content:space-around}.nav span{font-size:11px;color:var(--g500);font-weight:900}.nav .active{color:var(--blue)}.focus .intro{padding:18px;background:white;border:1px solid var(--g100);border-radius:22px}.focus .searchbar{background:var(--blue50);border-color:#d8eaff}.compact main{padding-left:16px;padding-right:16px}.compact .section{margin-top:16px}.compact .row{min-height:50px;padding:10px 13px}.compact .group,.compact .searchbar{border-radius:15px}.compact .intro h1{font-size:22px}.round .group,.round .searchbar,.round .focus .intro{border-radius:24px}.round .badge{border-radius:13px}.round .empty button{border-radius:17px}`;
}

function clearOwned() {
  const expected = new Set(screens.flatMap((screen) => variants.map((variant) => outputName(screen, variant))));
  for (const name of readdirSync(OUT)) {
    if (name.endsWith('.png') && ['b6-01-', 'b6-02-', 'b6-03-'].some((prefix) => name.startsWith(prefix)) && !expected.has(name)) rmSync(path.join(OUT, name));
  }
}

const pngData = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const dim = (file) => {
  const buf = readFileSync(file);
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
};
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
  const items = screens.flatMap((screen) => variants.map((variant) => ({ label: `${screen.id} ${screen.title} · ${variant.label}`, src: pngData(path.join(OUT, outputName(screen, variant))) })));
  const page = await browser.newPage({ viewport: { width: 980, height: 1420 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="ko"><style>body{margin:0;background:white;font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.sheet{width:930px;padding:18px;display:grid;grid-template-columns:repeat(4,210px);gap:28px 18px}.label{height:32px;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}img{width:210px;height:420px;object-fit:contain;object-position:top center;background:#fff}</style><main class="sheet">${items.map((item) => `<section><div class="label">${item.label}</div><img src="${item.src}" alt=""></section>`).join('')}</main></html>`);
  const file = path.join(EVIDENCE, 'p3a-discovery-comm-contact-sheet-v22.png');
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return file;
}

function writeEvidence(files, sheet) {
  const rows = files.sort().map((file) => `| ${path.relative(ROOT, file)} | ${dim(file)} | ${statSync(file).size} |`).join('\n');
  writeFileSync(path.join(OMO_EV, 'teameet-v22-p3a-discovery-comm-verification.md'), `# Teameet v22 P3A Discovery / Communication Verification\n\n| Artifact | Dimensions | Bytes |\n| --- | ---: | ---: |\n${rows}\n| ${path.relative(ROOT, sheet)} | ${dim(sheet)} | ${statSync(sheet).size} |\n\n## Scope\n\n- B6-01 통합 검색\n- B6-02 공지 목록/상세\n- B6-03 알림 센터\n\n## Checks\n\n- 12 raw mobile PNGs generated.\n- A/B/C/D variants generated for each screen.\n- Raw mobile pages without device chrome, content glass, nested content cards, or tournament overfocus.\n- Utility rhythm remains compact and readable for mobile-first use.\n`);
}

clearOwned();
const browser = await chromium.launch();
const files = await Promise.all(screens.flatMap((screen) => variants.map((variant) => renderScreen(browser, screen, variant))));
const sheet = await renderSheet(browser);
await browser.close();
writeEvidence(files, sheet);
console.log(`rendered ${files.length} png files`);
console.log(sheet);
