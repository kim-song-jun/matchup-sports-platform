import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FLOW = path.join(ROOT, '.omo/ultraresearch/20260627-152929-teameet-mobile-tournament-identity/mockups/service-wide-v22-ko');
const OUT = path.join(FLOW, 'pages');
const EVIDENCE = path.join(FLOW, 'evidence');
const MOCK = path.join(ROOT, 'apps/v1_web/public/mock/generated');
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
    :root{--blue50:#eaf3ff;--blue500:#3182f6;--blue600:#2272e8;--green50:#e9f9ee;--green500:#12b76a;--orange50:#fff4e5;--orange500:#fe9800;--red50:#fff0f1;--red500:#f04452;--grey50:#f9fafb;--grey100:#f2f4f6;--grey200:#e5e8eb;--grey500:#8b95a1;--grey700:#4e5968;--grey800:#333d4b;--grey900:#191f28;--shadow-1:0 1px 2px rgba(15,23,42,.05);--font:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}
    *{box-sizing:border-box}body{margin:0;background:#eef1f5;font-family:var(--font);color:var(--grey900)}.screen{width:390px;min-height:1120px;margin:0 auto;background:var(--grey50);overflow:hidden;position:relative}.topbar{height:58px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.96);border-bottom:1px solid var(--grey100);position:sticky;top:0;z-index:2}.topbar strong{font-size:16px}.iconbtn{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--grey100);background:#fff;color:var(--grey700)}.top-spacer{width:34px;height:34px}.body{padding:18px 20px 96px}.eyebrow{font-size:12px;color:var(--blue600);font-weight:800;margin-bottom:6px}h1{font-size:25px;line-height:1.22;margin:0 0 6px}.sub{margin:0;color:var(--grey500);font-size:13px;line-height:1.45}.section{margin-top:26px}.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.section h2{margin:0;font-size:16px}.link{color:var(--blue600);font-size:13px;font-weight:800}.card{background:#fff;border:1px solid var(--grey100);border-radius:18px;box-shadow:var(--shadow-1);padding:18px}.row{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:48px;border-bottom:1px solid var(--grey100)}.row:last-child{border-bottom:0}.row-main{min-width:0}.row-title{font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row-sub{font-size:12px;color:var(--grey500);margin-top:4px;line-height:1.35}.badge{display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:999px;background:var(--grey100);color:var(--grey700);font-size:11px;font-weight:800;white-space:nowrap}.badge.blue{background:var(--blue50);color:var(--blue600)}.badge.green{background:var(--green50);color:var(--green500)}.badge.orange{background:var(--orange50);color:var(--orange500)}.badge.red{background:var(--red50);color:var(--red500)}.btn{width:100%;height:48px;border:0;border-radius:14px;background:var(--blue500);color:#fff;font-size:15px;font-weight:900;margin-top:14px}.btn.secondary{background:#fff;color:var(--grey800);border:1px solid var(--grey200)}.field{min-height:48px;border:1px solid var(--grey200);border-radius:14px;background:#fff;padding:13px 14px;color:var(--grey700);font-size:13px}.field+.field{margin-top:10px}.split{display:grid;grid-template-columns:1fr 1fr;gap:10px}.metric{padding:14px;background:var(--grey50);border-radius:16px}.metric strong{font-size:21px;display:block}.metric span{font-size:12px;color:var(--grey500);display:block;margin-top:5px}.progress{height:7px;border-radius:99px;background:var(--grey100);overflow:hidden;margin-top:12px}.progress i{display:block;height:100%;background:var(--blue500);border-radius:99px}.media{height:96px;border-radius:16px;overflow:hidden;margin-top:14px;position:relative;background:#dfe6ef}.media img{width:100%;height:100%;object-fit:cover}.media:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(25,31,40,0),rgba(25,31,40,.46))}.media-label{position:absolute;left:12px;bottom:10px;z-index:1;color:#fff;font-size:13px;font-weight:900}.tabs{display:flex;gap:8px;overflow:hidden}.tab{min-height:34px;border-radius:999px;padding:0 12px;display:flex;align-items:center;background:#fff;border:1px solid var(--grey100);font-size:12px;font-weight:800;color:var(--grey700)}.tab.active{background:var(--blue500);color:#fff;border-color:var(--blue500)}.score{font-size:22px;font-weight:900;font-variant-numeric:tabular-nums}.bottomnav{position:absolute;left:20px;right:20px;bottom:12px;height:64px;border-radius:24px;background:rgba(255,255,255,.96);border:1px solid rgba(229,232,235,.8);box-shadow:0 8px 24px rgba(20,28,45,.08);display:flex;align-items:center;justify-content:space-around}.navitem{font-size:11px;color:var(--grey500);font-weight:800}.navitem.active{color:var(--blue600)}.photo-accent .hero-photo{display:block}.toss-clean .hero-photo,.compact-utility .hero-photo,.rounded-community .hero-photo{display:none}.compact-utility .body{padding-left:16px;padding-right:16px}.compact-utility .section{margin-top:20px}.compact-utility .card{padding:14px;border-radius:16px}.compact-utility .row{min-height:43px}.compact-utility h1{font-size:23px}.rounded-community .card{border-radius:24px;background:linear-gradient(180deg,#fff,#fbfcff)}.rounded-community .metric{border-radius:20px;background:#f4f8ff}.danger{color:var(--red500)}
  `;
}

const top = (title, action = '필터') => `<header class="topbar"><div class="iconbtn">‹</div><strong>${title}</strong>${action ? `<div class="iconbtn">${action.slice(0, 2)}</div>` : '<div class="top-spacer"></div>'}</header>`;
const nav = (active = '대회') => `<nav class="bottomnav">${['홈', '매치', '대회', '팀', '마이'].map((x) => `<div class="navitem ${x === active ? 'active' : ''}">${x}</div>`).join('')}</nav>`;
const row = (title, sub = '', trailing = '') => `<div class="row"><div class="row-main"><div class="row-title">${title}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>${trailing}</div>`;
const sec = (title, body, action = '') => `<section class="section"><div class="section-head"><h2>${title}</h2>${action ? `<span class="link">${action}</span>` : ''}</div>${body}</section>`;

function applyScreen(v) {
  return `<div class="screen ${v.tone}">${top('참가 신청', '닫기')}<main class="body">
    <div class="eyebrow">2026 Summer Cup</div><h1>레드 FC로 참가 신청을 제출해요</h1><p class="sub">팀 정보와 규정 동의를 확인하면 운영자가 승인 상태를 업데이트합니다.</p>
    <div class="hero-photo media"><img src="${images.futsal}" alt=""><div class="media-label">서울 디풋살파크</div></div>
    ${sec('대회 요약', `<div class="card">${row('풋살 · 2026 Summer Cup','07.25(토) - 07.26(일)','<span class="badge blue">모집중</span>')}${row('서울 디풋살파크','서울 강남구 도산대로 123','<span class="link">지도</span>')}${row('참가비','팀당 120,000원','<span class="badge">입금</span>')}</div>`)}
    ${sec('참가 팀', `<div class="card">${row('레드 FC','주장 홍길동 · 로스터 8/10명','<span class="badge blue">선택됨</span>')}${row('팀 변경','다른 내 팀으로 신청하기','<span class="link">변경</span>')}</div>`)}
    ${sec('참가 조건', `<div class="card">${row('참가 가능 종목','풋살 팀만 신청 가능','<span class="badge green">확인</span>')}${row('최소 인원','8명 이상 필요 · 현재 8명','<span class="badge green">충족</span>')}${row('승인 방식','입금 확인 후 최종 승인','<span class="badge orange">대기</span>')}${row('로스터 수정','경기 하루 전까지 가능','<span class="badge">안내</span>')}</div>`)}
    ${sec('규정 동의', `<div class="card">${row('대회 규정 확인','경기 방식과 유의사항을 확인했어요','<span class="badge blue">필수</span>')}${row('환불/취소 정책','마감 이후 환불 제한이 있어요','<span class="badge blue">필수</span>')}${row('개인정보 제공 동의','운영자 확인과 경기 기록에 사용돼요','<span class="badge blue">필수</span>')}</div>`)}
    ${sec('제출 전 확인', `<div class="card">${row('로스터 기준','최소 인원을 충족했습니다','<span class="badge green">가능</span>')}${row('오류 예시','로스터가 부족하면 여기에서 알려줘요','<span class="badge">검증</span>')}<button class="btn">신청 제출</button><p class="row-sub">제출 후 내 신청에서 승인, 입금, 로스터 상태를 확인할 수 있어요.</p></div>`)}
  </main>${nav('대회')}</div>`;
}

function rosterScreen(v) {
  const players = ['홍길동 · 7 · FW · 주장', '김철수 · 10 · MF', '박준호 · 3 · DF', '이민재 · 1 · GK', '최도윤 · 11 · FW', '정우진 · 6 · MF', '오세훈 · 4 · DF', '강민재 · 8 · MF'];
  return `<div class="screen ${v.tone}">${top('로스터 입력', '')}<main class="body">
    <div class="eyebrow">2026 Summer Cup · 레드 FC</div><h1>출전 선수 8명이 등록됐어요</h1><p class="sub">등번호와 포지션을 확인하고 경기 전까지 명단을 저장해 주세요.</p>
    <div class="hero-photo media"><img src="${images.huddle}" alt=""><div class="media-label">레드 FC 로스터</div></div>
    ${sec('입력 현황', `<div class="card"><div class="split"><div class="metric"><strong>8/10명</strong><span>입력 완료</span></div><div class="metric"><strong>최소 8명</strong><span>출전 기준</span></div></div><div class="progress"><i style="width:80%"></i></div>${row('수정 기한','07.24(금) 18:00까지 수정 가능','<span class="badge orange">마감 전</span>')}${row('최소 인원','8명 이상 · 현재 충족','<span class="badge green">가능</span>')}${row('남은 슬롯','2명 더 등록 가능','<span class="badge">여유</span>')}</div>`)}
    ${sec('선수 추가', `<div class="card">${row('팀 멤버에서 불러오기','기존 팀원을 빠르게 추가해요','<span class="link">불러오기</span>')}${row('새 선수 직접 입력','이름, 등번호, 포지션을 입력해요','<span class="link">추가</span>')}</div>`)}
    ${sec('출전 명단', `<div class="card">${players.map((p) => row(p.split(' · ')[0], p.split(' · ').slice(1).join(' · '), '<span class="link">수정</span>')).join('')}</div>`, '전체')}
    ${sec('검증', `<div class="card">${row('등번호 중복 확인','중복되면 저장할 수 없어요','<span class="badge green">정상</span>')}${row('필수 포지션','GK 1명 이상 등록됨','<span class="badge green">정상</span>')}${row('저장 상태','마지막 저장 2분 전','<span class="badge">임시저장</span>')}<button class="btn">로스터 저장</button></div>`)}
  </main>${nav('대회')}</div>`;
}

function matchListScreen(v) {
  return `<div class="screen ${v.tone}">${top('경기')}<main class="body">
    <div class="eyebrow">2026 Summer Cup</div><h1>지금 진행 중인 경기와 다음 일정을 확인해요</h1><p class="sub">LIVE, 예정, 종료 경기를 상태별로 빠르게 찾을 수 있습니다.</p>
    <div class="hero-photo media"><img src="${images.futsal}" alt=""><div class="media-label">오늘의 경기</div></div>
    <section class="section"><div class="tabs"><div class="tab active">전체</div><div class="tab">LIVE</div><div class="tab">예정</div><div class="tab">종료</div><div class="tab">내 팀</div></div></section>
    ${sec('LIVE', `<div class="card">${row('A조 1경기','전반 18:42 · 1구장','<span class="badge green">LIVE</span>')}${row('Red FC vs White FC','현재 스코어','<span class="score">2 : 1</span>')}<button class="btn">경기 보기</button></div>`)}
    ${sec('예정 경기', `<div class="card">${row('A조 2경기','Blue Wings vs FC Seoul · 11:00','<span class="badge blue">예정</span>')}${row('B조 1경기','Rival 풋살 vs Team Meet FC · 12:00','<span class="badge blue">예정</span>')}${row('B조 2경기','강서 FC vs 한강 FC · 13:00','<span class="badge">대기</span>')}</div>`)}
    ${sec('종료 경기', `<div class="card">${row('예선 1경기','Team Meet FC 1 : 0 Rival 풋살','<span class="badge">종료</span>')}${row('예선 2경기','Blue Wings 3 : 2 강서 FC','<span class="badge">종료</span>')}</div>`)}
    ${sec('대회 바로가기', `<div class="card">${row('순위 보기','조별 승점과 득실차 확인','<span class="link">이동</span>')}${row('대진표 보기','결선 라운드와 다음 상대 확인','<span class="link">이동</span>')}</div>`)}
  </main>${nav('대회')}</div>`;
}

const allScreens = [
  { id: 'B7-03', slug: 'tournament-apply', render: applyScreen },
  { id: 'B7-05', slug: 'tournament-roster', render: rosterScreen },
  { id: 'B8-01', slug: 'tournament-match-list', render: matchListScreen },
];
const requestedIds = new Set((process.env.TEAMEET_SCREEN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean));
const screens = requestedIds.size ? allScreens.filter((screen) => requestedIds.has(screen.id)) : allScreens;
if (!screens.length) throw new Error(`No screens matched TEAMEET_SCREEN_IDS=${process.env.TEAMEET_SCREEN_IDS}`);
const outputName = (s, v) => `${s.id.toLowerCase()}-${s.slug}-${v.key}-v22.png`;
const expectedNames = () => new Set(screens.flatMap((s) => variants.map((v) => outputName(s, v))));
function clearOwnedPngs() {
  const expected = expectedNames();
  const prefixes = screens.map((s) => `${s.id.toLowerCase()}-`);
  for (const name of readdirSync(OUT)) {
    if (name.endsWith('.png') && prefixes.some((p) => name.startsWith(p)) && !expected.has(name)) rmSync(path.join(OUT, name));
  }
}
function html(screen, variant) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css()}</style></head><body>${screen.render(variant)}</body></html>`;
}
const pngData = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
function sheetHtml(items) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.sheet{width:930px;padding:18px;display:grid;grid-template-columns:repeat(4,210px);gap:28px 18px}.label{height:32px;font-size:12px;color:#191f28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}img{width:210px;height:420px;object-fit:contain;object-position:top center;display:block;background:#fff}</style></head><body><main class="sheet">${items.map((x) => `<section><div class="label">${x.name.replace('-v22.png', '')}</div><img src="${x.src}" alt=""></section>`).join('')}</main></body></html>`;
}
async function renderSheet(browser) {
  const p = await browser.newPage({ viewport: { width: 980, height: 1420 }, deviceScaleFactor: 1 });
  const items = screens.flatMap((s) => variants.map((v) => {
    const name = outputName(s, v);
    return { name, src: pngData(path.join(OUT, name)) };
  }));
  await p.setContent(sheetHtml(items), { waitUntil: 'load' });
  const sheetName = process.env.TEAMEET_SHEET_NAME || 'p0b-contact-sheet-v22.png';
  await p.screenshot({ path: path.join(EVIDENCE, sheetName), fullPage: true });
  await p.close();
}

clearOwnedPngs();
const browser = await chromium.launch();
const sheetOnly = process.env.TEAMEET_SHEET_ONLY === '1';
if (!sheetOnly) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  for (const screen of screens) {
    for (const variant of variants) {
      await page.setContent(html(screen, variant), { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(OUT, outputName(screen, variant)), fullPage: true });
    }
  }
  await page.close();
}
await renderSheet(browser);
await browser.close();
console.log(`rendered ${sheetOnly ? 0 : screens.length * variants.length} png files`);
console.log(OUT);
console.log(path.join(EVIDENCE, process.env.TEAMEET_SHEET_NAME || 'p0b-contact-sheet-v22.png'));
