import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { css } from './teameet_v22_p1b_styles.mjs';

const ROOT = process.cwd();
const FLOW = path.join(
  ROOT,
  '.omo/ultraresearch/20260627-152929-teameet-mobile-tournament-identity/mockups/service-wide-v22-ko',
);
const OUT = path.join(FLOW, 'pages');
const EVIDENCE = path.join(FLOW, 'evidence');
const MOCK = path.join(ROOT, 'apps/v1_web/public/mock/generated');

mkdirSync(OUT, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });

function image(name) {
  return `data:image/webp;base64,${readFileSync(path.join(MOCK, name)).toString('base64')}`;
}

const images = {
  futsal: image('futsal-rooftop.webp'),
  huddle: image('team-huddle.webp'),
};

const variants = [
  { key: 'a', tone: 'toss-clean', label: 'A 토스 클린' },
  { key: 'b', tone: 'photo-accent', label: 'B 포토 액센트' },
  { key: 'c', tone: 'compact-utility', label: 'C 컴팩트 유틸리티' },
  { key: 'd', tone: 'rounded-community', label: 'D 라운드 커뮤니티' },
];


function topbar(title) {
  return `<header class="topbar"><div class="iconbtn">‹</div><strong>${title}</strong><div class="iconbtn">도움</div></header>`;
}

function progress(step, label) {
  return `<div class="progress">
    <div class="progress-line"><span class="badge blue">${step}/4단계</span><span class="section-note">${label}</span></div>
    <div class="bars">${[1, 2, 3, 4].map((n) => `<i class="${n <= step ? 'on' : ''}"></i>`).join('')}</div>
  </div>`;
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

function levelRangeField() {
  return `<div class="field">
    <div class="label">레벨 범위</div>
    <div class="two">
      <div class="input"><span>최소 입문</span></div>
      <div class="input"><span>최대 중수</span></div>
    </div>
  </div>`;
}

function cta(primary, secondary = '이전') {
  return `<div class="cta"><button class="btn secondary">${secondary}</button><button class="btn primary">${primary}</button></div>`;
}

function startScreen(v) {
  return `<div class="screen ${v.tone}">
    ${topbar('매치 만들기')}
    <main class="body">
      ${progress(1, '종목 선택')}
      <div class="eyebrow">개인 매치</div>
      <h1>어떤 매치를 열까요?</h1>
      <p class="sub">종목을 고르면 제목, 인원, 규칙까지 한 흐름으로 이어서 입력해요.</p>
      <div class="hero-photo media"><img src="${images.huddle}" alt=""><div class="media-label">여러 종목을 한 흐름으로 생성</div></div>
      ${section('종목 선택', `<div class="sport-grid">
        <button class="sport active"><strong>풋살</strong><span>선택됨</span></button>
        <button class="sport"><strong>축구</strong><span>팀 경기 가능</span></button>
        <button class="sport"><strong>러닝</strong><span>가벼운 모임</span></button>
        <button class="sport"><strong>수영</strong><span>레인 공유</span></button>
      </div>`, '다중 종목')}
      ${section('먼저 정할 것', `<div class="card">
        ${field('매치 제목', '주말 저녁 풋살 초보 환영 매치')}
        <div class="two">${field('모집 인원', '10명')}${field('성별 조건', '성별 무관')}</div>
        ${levelRangeField()}
        ${field('규칙', '풋살화 착용, 지각 시 호스트에게 연락')}
        <div class="helper">필수 정보가 비어 있으면 다음 단계에서 바로 알려줘요.</div>
        <div class="notice">입력 중인 내용은 이 기기에서 임시 저장돼요.</div>
        <div class="notice orange">종목과 제목을 확인한 뒤 다음 단계로 이동해요.</div>
        ${cta('다음', '취소')}
      </div>`)}
    </main>
  </div>`;
}

function placeTimeScreen(v) {
  return `<div class="screen ${v.tone}">
    ${topbar('매치 만들기')}
    <main class="body">
      ${progress(3, '장소와 시간')}
      <div class="eyebrow">장소와 시간</div>
      <h1>언제 어디서 모이나요?</h1>
      <p class="sub">검색에 쓰이는 지역과 실제 만나는 장소를 나눠 입력해요.</p>
      <div class="hero-photo media"><img src="${images.futsal}" alt=""><div class="media-label">마포 풋살파크</div></div>
      ${section('장소', `<div class="card">
        ${field('지역', '서울 마포구')}
        ${field('장소 검색', '마포 풋살파크 검색')}
        ${row('현재 위치로 찾기', '가까운 체육시설을 추천해요', '<span class="link">찾기</span>')}
        ${field('상세 주소', '서울 마포구 월드컵북로 31')}
      </div>`)}
      ${section('일정', `<div class="card">
        ${field('날짜', '2026-07-04')}
        <div class="two">${field('시작 시간', '18:00')}${field('종료 시간', '20:00')}</div>
        <div class="two">${field('신청 마감일', '2026-07-04')}${field('신청 마감시간', '15:00')}</div>
        <div class="notice red">신청 마감은 시작 시간보다 빨라야 해요.</div>
      </div>`)}
      ${section('인원과 비용', `<div class="card">
        <div class="two">${field('최대 인원', '10명')}${field('참가비', '12,000원')}</div>
        <div class="helper">참가비가 없으면 무료로 표시돼요.</div>
        <div class="notice orange">장소, 날짜, 시작 시간을 입력해 주세요.</div>
        <div class="notice">다음 단계에서 참가자가 보는 요약을 확인해요.</div>
        ${cta('다음')}
      </div>`)}
    </main>
  </div>`;
}

function confirmScreen(v) {
  return `<div class="screen ${v.tone}">
    ${topbar('매치 만들기')}
    <main class="body">
      ${progress(4, '작성 내용 확인')}
      <div class="eyebrow">최종 확인</div>
      <h1>이 내용으로 매치를 열까요?</h1>
      <p class="sub">등록하면 매치 목록과 상세 화면에 바로 공개돼요.</p>
      ${section('참가자에게 보이는 요약', `<div class="card summary">
        <div class="summary-media hero-photo" style="background-image:url('${images.futsal}')"><div class="media-label">마포 풋살파크</div></div>
        <div class="summary-body">
          <div class="chip-row"><span class="badge blue">풋살</span><span class="badge">입문-중수</span><span class="badge">성별 무관</span></div>
          <div class="summary-title">주말 저녁 풋살 초보 환영 매치</div>
          <p class="sub">초보도 편하게 참여할 수 있는 친선 매치예요.</p>
        </div>
      </div>`)}
      ${section('핵심 정보', `<div class="card">
        ${row('장소', '마포 풋살파크 · 서울 마포구 월드컵북로 31')}
        ${row('일시', '7월 4일 토 18:00-20:00')}
        ${row('신청 마감', '7월 4일 토 15:00')}
        ${row('인원', '최대 10명')}
        ${row('참가비', '1인 12,000원')}
      </div>`)}
      ${section('규칙', `<div class="card"><div class="rule-list">
        <div class="rule"><span class="check">확</span>풋살화 착용</div>
        <div class="rule"><span class="check">확</span>시작 10분 전 도착</div>
        <div class="rule"><span class="check">확</span>지각 시 호스트에게 연락</div>
      </div></div>`)}
      ${section('제출 상태', `<div class="card">
        <div class="notice">생성 후 신청자는 호스트 승인 전까지 확정되지 않아요.</div>
        <div class="notice orange">매치를 만들고 있어요. 잠시만 기다려 주세요.</div>
        <div class="notice red">매치를 만들지 못했어요. 입력한 내용을 유지한 채 다시 시도할 수 있어요.</div>
        <div class="helper">생성되면 매치 상세 화면으로 이동해요.</div>
        ${cta('매치 만들기')}
      </div>`)}
    </main>
  </div>`;
}

const screens = [
  { id: 'B2-01', slug: 'match-new-start', render: startScreen },
  { id: 'B2-02', slug: 'match-place-time', render: placeTimeScreen },
  { id: 'B2-03', slug: 'match-confirm', render: confirmScreen },
];

function outputName(screen, variant) {
  return `${screen.id.toLowerCase()}-${screen.slug}-${variant.key}-v22.png`;
}

function clearOwnedPngs() {
  const expected = new Set(screens.flatMap((screen) => variants.map((variant) => outputName(screen, variant))));
  const prefixes = ['b2-01-', 'b2-02-', 'b2-03-'];
  for (const name of readdirSync(OUT)) {
    if (name.endsWith('.png') && prefixes.some((prefix) => name.startsWith(prefix)) && !expected.has(name)) {
      rmSync(path.join(OUT, name));
    }
  }
}

function html(screen, variant) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css()}</style></head><body>${screen.render(variant)}</body></html>`;
}

async function renderOne(browser, screen, variant) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(html(screen, variant), { waitUntil: 'load' });
  const file = path.join(OUT, outputName(screen, variant));
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return file;
}

function pngData(file) {
  return `data:image/png;base64,${readFileSync(file).toString('base64')}`;
}

function sheetHtml(items) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif;color:#191f28}
    .sheet{width:930px;padding:18px;display:grid;grid-template-columns:repeat(4,210px);gap:28px 18px}
    .label{height:32px;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    img{width:210px;height:420px;object-fit:contain;object-position:top center;display:block;background:#fff}
  </style></head><body><main class="sheet">${items.map((item) => `<section><div class="label">${item.label}</div><img src="${item.src}" alt=""></section>`).join('')}</main></body></html>`;
}

async function renderSheet(browser) {
  const items = screens.flatMap((screen) => variants.map((variant) => {
    const file = path.join(OUT, outputName(screen, variant));
    return { label: `${screen.id} ${variant.label}`, src: pngData(file) };
  }));
  const page = await browser.newPage({ viewport: { width: 980, height: 1420 }, deviceScaleFactor: 1 });
  await page.setContent(sheetHtml(items), { waitUntil: 'load' });
  const sheetPath = path.join(EVIDENCE, 'p1b-match-create-contact-sheet-v22.png');
  await page.screenshot({ path: sheetPath, fullPage: true });
  await page.screenshot({ path: path.join(EVIDENCE, 'p1b-match-create-r4-contact-sheet-v22.png'), fullPage: true });
  await page.close();
  return sheetPath;
}

clearOwnedPngs();
const browser = await chromium.launch();
const files = await Promise.all(screens.flatMap((screen) => variants.map((variant) => renderOne(browser, screen, variant))));
const sheet = await renderSheet(browser);
await browser.close();

console.log(`rendered ${files.length} png files`);
for (const file of files.sort()) console.log(file);
console.log(sheet);
