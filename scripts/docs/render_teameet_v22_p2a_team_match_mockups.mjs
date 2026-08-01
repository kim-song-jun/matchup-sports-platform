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

const image = (name) => `data:image/webp;base64,${readFileSync(path.join(MOCK, name)).toString('base64')}`;
const images = { huddle: image('team-huddle.webp'), futsal: image('futsal-rooftop.webp') };
const variants = [
  { key: 'a', tone: 'toss-clean', label: 'A 토스 클린' },
  { key: 'b', tone: 'photo-accent', label: 'B 포토 액센트' },
  { key: 'c', tone: 'compact-utility', label: 'C 컴팩트 유틸리티' },
  { key: 'd', tone: 'rounded-community', label: 'D 라운드 커뮤니티' },
];

function css() {
  return `
    :root{--blue50:#e8f3ff;--blue100:#d6e7ff;--blue500:#3182f6;--blue600:#2272eb;--green50:#e3f8ef;--green500:#03b26c;--orange50:#fff3e0;--orange500:#fe9800;--red50:#feebec;--red500:#f04452;--grey50:#f9fafb;--grey100:#f2f4f6;--grey150:#eaedf0;--grey200:#e5e8eb;--grey500:#8b95a1;--grey600:#6b7684;--grey700:#4e5968;--grey800:#333d4b;--grey900:#191f28;--shadow-1:0 1px 2px rgba(15,23,42,.05);--font:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif}
    *{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--grey900);font-family:var(--font);-webkit-font-smoothing:antialiased}.screen{width:390px;min-height:1190px;margin:0 auto;background:var(--grey50);overflow:hidden;position:relative}.topbar{position:sticky;top:0;z-index:2;height:58px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.96);border-bottom:1px solid var(--grey100)}.topbar strong{font-size:16px}.iconbtn{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--grey100);background:#fff;color:var(--grey700);font-size:13px;font-weight:800}.body{padding:18px 20px 44px}.progress{margin-bottom:22px}.progress-line{display:flex;align-items:center;justify-content:space-between}.bars{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-top:10px}.bars i{height:4px;border-radius:99px;background:var(--grey200)}.bars i.on{background:var(--blue500)}.eyebrow{font-size:12px;color:var(--blue600);font-weight:800;margin-bottom:7px}h1{margin:0;font-size:25px;line-height:1.22;letter-spacing:0}.sub{margin:8px 0 0;color:var(--grey600);font-size:13px;line-height:1.5}.section{margin-top:27px}.section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.section h2{margin:0;font-size:16px;line-height:1.25}.section-note{color:var(--grey600);font-size:12px;font-weight:700;white-space:nowrap}.card{background:#fff;border:1px solid var(--grey100);border-radius:18px;box-shadow:var(--shadow-1);padding:18px}.row{display:flex;align-items:center;justify-content:space-between;min-height:50px;gap:14px;border-bottom:1px solid var(--grey100)}.row:last-child{border-bottom:0}.row-main{min-width:0}.row-title{font-size:14px;font-weight:800;line-height:1.32;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row-sub{margin-top:4px;color:var(--grey600);font-size:12px;line-height:1.38}.link{color:var(--blue600);font-size:13px;font-weight:800;white-space:nowrap}.badge{display:inline-flex;align-items:center;justify-content:center;min-height:24px;padding:0 9px;border-radius:999px;background:var(--grey100);color:var(--grey700);font-size:11px;font-weight:800;white-space:nowrap}.badge.blue{background:var(--blue50);color:var(--blue600)}.badge.green{background:var(--green50);color:var(--green500)}.badge.orange{background:var(--orange50);color:var(--orange500)}.badge.red{background:var(--red50);color:var(--red500)}
    .team-list{display:grid;gap:10px}.team{border:1px solid var(--grey100);border-radius:18px;background:#fff;padding:15px;text-align:left}.team.active{border-color:rgba(49,130,246,.28);background:var(--blue50)}.team-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.team strong{font-size:15px}.team p{margin:5px 0 0;color:var(--grey600);font-size:12px;line-height:1.4}.team-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.field{margin-top:12px}.label{margin-bottom:7px;color:var(--grey800);font-size:13px;font-weight:800}.input{min-height:48px;border:1px solid var(--grey200);border-radius:14px;background:#fff;padding:13px 14px;color:var(--grey900);font-size:14px;display:flex;align-items:center;justify-content:space-between;gap:10px}.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.notice{margin-top:14px;padding:12px 14px;border-radius:14px;background:var(--blue50);color:var(--blue600);font-size:12px;font-weight:800;line-height:1.45}.notice.orange{background:var(--orange50);color:var(--orange500)}.notice.red{background:var(--red50);color:var(--red500)}.notice.green{background:var(--green50);color:var(--green500)}.cta{margin-top:16px;display:grid;grid-template-columns:1fr 2fr;gap:8px}.btn{min-height:48px;border:0;border-radius:14px;font-size:15px;font-weight:900}.btn.primary{background:var(--blue500);color:#fff}.btn.secondary{background:#fff;color:var(--grey800);border:1px solid var(--grey200)}.media{height:118px;border-radius:18px;overflow:hidden;margin-top:16px;background:#dfe6ef;position:relative}.media img{width:100%;height:100%;object-fit:cover;display:block}.media:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(25,31,40,0),rgba(25,31,40,.48))}.media-label{position:absolute;left:14px;bottom:12px;z-index:1;color:#fff;font-size:13px;font-weight:900}.summary{padding:0;overflow:hidden}.summary-media{height:142px;background-size:cover;background-position:center;position:relative}.summary-media:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(25,31,40,0),rgba(25,31,40,.44))}.summary-body{padding:16px}.summary-title{margin-top:10px;font-size:18px;font-weight:900;line-height:1.32}.chip-row{display:flex;flex-wrap:wrap;gap:6px}.complete-mark{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:var(--blue50);color:var(--blue600);font-size:28px;font-weight:900}.route{margin-top:10px;color:var(--grey500);font-size:11px;font-weight:800}.photo-accent .hero-photo{display:block}.toss-clean .hero-photo,.compact-utility .hero-photo,.rounded-community .hero-photo{display:none}.compact-utility .body{padding-left:16px;padding-right:16px}.compact-utility .section{margin-top:21px}.compact-utility .card{padding:14px;border-radius:16px}.compact-utility .row{min-height:44px}.compact-utility .team{padding:13px;border-radius:16px}.compact-utility h1{font-size:23px}.rounded-community .card,.rounded-community .team{border-radius:24px;background:linear-gradient(180deg,#fff,#fbfcff)}.rounded-community .input,.rounded-community .btn,.rounded-community .notice{border-radius:18px}
  `;
}

function topbar(title) {
  return `<header class="topbar"><div class="iconbtn">‹</div><strong>${title}</strong><div class="iconbtn">도움</div></header>`;
}
function progress(step, label) {
  return `<div class="progress"><div class="progress-line"><span class="badge blue">${step}/6단계</span><span class="section-note">${label}</span></div><div class="bars">${[1, 2, 3, 4, 5, 6].map((n) => `<i class="${n <= step ? 'on' : ''}"></i>`).join('')}</div></div>`;
}
function section(title, body, note = '') {
  return `<section class="section"><div class="section-head"><h2>${title}</h2>${note ? `<span class="section-note">${note}</span>` : ''}</div>${body}</section>`;
}
function row(title, sub = '', trailing = '') {
  return `<div class="row"><div class="row-main"><div class="row-title">${title}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>${trailing}</div>`;
}
function field(label, value) {
  return `<div class="field"><div class="label">${label}</div><div class="input"><span>${value}</span></div></div>`;
}
function cta(primary, secondary = '이전') {
  return `<div class="cta"><button class="btn secondary">${secondary}</button><button class="btn primary">${primary}</button></div>`;
}
function teamCard(team) {
  const name = team.name;
  const meta = team.meta;
  const selected = team.selected;
  const note = team.note;
  const state = selected ? '<span class="badge blue">선택됨</span>' : '<span class="link">선택</span>';
  return `<button class="team ${selected ? 'active' : ''}"><div class="team-top"><strong>${name}</strong>${state}</div><p>${meta}</p><div class="team-meta"><span class="badge">${note}</span><span class="badge green">활동중</span></div></button>`;
}

function teamSelectScreen(v) {
  return `<div class="screen ${v.tone}">${topbar('팀매치 만들기')}<main class="body">
    ${progress(1, '팀 선택')}
    <div class="eyebrow">팀 기반 매치</div><h1>어느 팀으로 매치를 만들까요?</h1>
    <p class="sub">팀장 또는 운영진 권한이 있는 팀만 팀매치를 열 수 있어요.</p>
    <div class="route">/team-matches/new · /team-matches/new/team</div>
    <div class="hero-photo media"><img src="${images.huddle}" alt=""><div class="media-label">레드 FC 준비 완료</div></div>
    ${section('내 팀', `<div class="team-list">
      ${teamCard({ name: '레드 FC', meta: '풋살 · 서울 마포 · 멤버 12명', selected: true, note: '운영진 권한' })}
      ${teamCard({ name: '블루 러너스', meta: '러닝 · 서울 성동 · 멤버 18명', selected: false, note: '공동 리더' })}
      ${teamCard({ name: '한강 배드민턴', meta: '배드민턴 · 서울 영등포 · 멤버 8명', selected: false, note: '팀원 권한' })}
    </div>`, '3개 팀')}
    ${section('팀 준비도', `<div class="card">
      ${row('운영 권한', '레드 FC 운영진으로 생성 가능', '<span class="badge green">가능</span>')}
      ${row('팀 프로필', '사진, 지역, 종목이 공개돼요', '<span class="badge orange">보완</span>')}
      ${row('연락 가능한 멤버', '최근 7일 활동 멤버 9명', '<span class="badge green">충분</span>')}
      ${row('최근 활동', '지난주 팀매치 1회 진행', '<span class="badge">참고</span>')}
      <div class="notice orange">팀 프로필 사진과 지역을 채우면 신청 신뢰도가 높아져요.</div>
      <div class="notice">팀장 또는 운영진만 생성할 수 있어요.</div>
      ${cta('다음', '취소')}
    </div>`)}
    ${section('팀이 없다면', `<div class="card">${row('새 팀 만들기', '아직 운영 중인 팀이 없어요. 팀을 만든 뒤 팀매치를 등록해 보세요.', '<span class="link">만들기</span>')}</div>`)}
  </main></div>`;
}

function conditionInfoScreen(v) {
  return `<div class="screen ${v.tone}">${topbar('팀매치 만들기')}<main class="body">
    ${progress(4, '조건과 소개')}
    <div class="eyebrow">상대 팀 조건</div><h1>상대 팀이 확인할 조건을 정해요</h1>
    <p class="sub">실력 범위와 필요한 인원을 명확히 쓰면 불필요한 조율을 줄일 수 있어요.</p>
    <div class="route">/team-matches/new/condition · /team-matches/new/info</div>
    <div class="hero-photo media"><img src="${images.futsal}" alt=""><div class="media-label">친선 중심 팀매치</div></div>
    ${section('경기 조건', `<div class="card">
      <div class="two">${field('실력 범위', '입문-중수')}${field('경기 레벨', '친선 중심')}</div>
      <div class="two">${field('필요 인원', '상대 팀 5-7명')}${field('성별 조건', '성별 무관')}</div>
      ${field('나이대', '20-40대')}
      <div class="notice red">필요 인원은 최소 5명 이상으로 입력해 주세요.</div>
    </div>`)}
    ${section('팀 소개', `<div class="card">
      ${field('소개 제목', '레드 FC 주말 친선 팀매치')}
      <div class="field"><div class="label">소개 문구</div><div class="input" style="min-height:92px;align-items:flex-start">승패보다 매너 있는 경기와 꾸준한 교류를 중요하게 생각해요.</div></div>
      ${row('응답 방식', '신청 팀을 운영진이 확인 후 승인', '<span class="badge orange">승인형</span>')}
      <div class="notice">필수 조건을 모두 채우면 다음 단계로 이동할 수 있어요.</div>
      <div class="notice green">조건과 소개가 임시 저장됐어요.</div>
      ${cta('다음')}
    </div>`)}
  </main></div>`;
}

function confirmCompleteScreen(v) {
  return `<div class="screen ${v.tone}">${topbar('팀매치 만들기')}<main class="body">
    ${progress(6, '작성 내용 확인')}
    <div class="eyebrow">최종 확인</div><h1>이 내용으로 팀매치를 열까요?</h1>
    <p class="sub">등록하면 팀매치 목록과 레드 FC 팀 페이지에 함께 노출돼요.</p>
    <div class="route">/team-matches/new/confirm · /team-matches/new/complete</div>
    ${section('상대 팀에게 보이는 요약', `<div class="card summary">
      <div class="summary-media hero-photo" style="background-image:url('${images.futsal}')"><div class="media-label">마포 풋살파크</div></div>
      <div class="summary-body"><div class="chip-row"><span class="badge blue">풋살</span><span class="badge">입문-중수</span><span class="badge">상대 팀 5-7명</span></div><div class="summary-title">레드 FC 주말 친선 팀매치</div><p class="sub">매너 있는 경기와 꾸준한 교류를 원하는 팀을 기다려요.</p></div>
    </div>`)}
    ${section('핵심 정보', `<div class="card">
      ${row('팀', '레드 FC · 풋살 · 서울 마포')}
      ${row('장소', '마포 풋살파크')}
      ${row('일시', '7월 11일 토 18:00-20:00')}
      ${row('조건', '입문-중수 · 상대 팀 5-7명')}
      ${row('승인 방식', '레드 FC 운영진 승인 후 확정')}
    </div>`)}
    ${section('제출 상태', `<div class="card">
      <div class="notice">신청한 상대 팀은 레드 FC 운영진 승인 전까지 확정되지 않아요.</div>
      <div class="notice orange">팀매치를 만들고 있어요. 잠시만 기다려 주세요.</div>
      <div class="notice red">팀매치를 만들지 못했어요. 입력한 내용을 유지한 채 다시 시도할 수 있어요.</div>
      ${cta('팀매치 만들기')}
    </div>`)}
    ${section('완료 후', `<div class="card">
      <div class="complete-mark">✓</div>
      <div class="summary-title">팀매치가 등록됐어요</div>
      <p class="sub">신청이 들어오면 팀 알림과 내 팀매치에서 확인할 수 있어요.</p>
      <div class="notice green">팀매치 상세 화면으로 이동할 수 있어요.</div>
      ${cta('상세 보기', '팀에 공유')}
    </div>`)}
  </main></div>`;
}

const screens = [
  { id: 'B3-01', slug: 'team-match-team-select', render: teamSelectScreen },
  { id: 'B3-04', slug: 'team-match-condition-info', render: conditionInfoScreen },
  { id: 'B3-05', slug: 'team-match-confirm-complete', render: confirmCompleteScreen },
];
function outputName(screen, variant) {
  return `${screen.id.toLowerCase()}-${screen.slug}-${variant.key}-v22.png`;
}
function clearOwnedPngs() {
  const expected = new Set(screens.flatMap((screen) => variants.map((variant) => outputName(screen, variant))));
  for (const name of readdirSync(OUT)) {
    if (name.endsWith('.png') && ['b3-01-', 'b3-04-', 'b3-05-'].some((prefix) => name.startsWith(prefix)) && !expected.has(name)) rmSync(path.join(OUT, name));
  }
}
function html(screen, variant) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css()}</style></head><body>${screen.render(variant)}</body></html>`;
}
function pngData(file) {
  return `data:image/png;base64,${readFileSync(file).toString('base64')}`;
}
function sheetHtml(items) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif;color:#191f28}.sheet{width:930px;padding:18px;display:grid;grid-template-columns:repeat(4,210px);gap:28px 18px}.label{height:32px;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}img{width:210px;height:420px;object-fit:contain;object-position:top center;display:block;background:#fff}</style></head><body><main class="sheet">${items.map((item) => `<section><div class="label">${item.label}</div><img src="${item.src}" alt=""></section>`).join('')}</main></body></html>`;
}
async function renderOne(browser, screen, variant) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html(screen, variant), { waitUntil: 'load' });
  const file = path.join(OUT, outputName(screen, variant));
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return file;
}
async function renderSheet(browser) {
  const items = screens.flatMap((screen) => variants.map((variant) => ({ label: `${screen.id} ${variant.label}`, src: pngData(path.join(OUT, outputName(screen, variant))) })));
  const page = await browser.newPage({ viewport: { width: 980, height: 1420 }, deviceScaleFactor: 1 });
  await page.setContent(sheetHtml(items), { waitUntil: 'load' });
  const sheetPath = path.join(EVIDENCE, 'p2a-team-match-contact-sheet-v22.png');
  await page.screenshot({ path: sheetPath, fullPage: true });
  await page.close();
  return sheetPath;
}

clearOwnedPngs();
const browser = await chromium.launch();
const files = await Promise.all(screens.flatMap((screen) => variants.map((variant) => renderOne(browser, screen, variant))));
const sheet = await renderSheet(browser);
await browser.close();

console.log(`rendered ${files.length} png files`);
console.log(sheet);
