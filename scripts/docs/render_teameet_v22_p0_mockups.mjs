import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

// Artifact renderer note: this file intentionally keeps the three P0 screen
// templates together so one deterministic command regenerates all evidence.
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

function dataImage(fileName) {
  const file = path.join(MOCK, fileName);
  return `data:image/webp;base64,${readFileSync(file).toString('base64')}`;
}

const images = {
  futsal: dataImage('futsal-rooftop.webp'),
  huddle: dataImage('team-huddle.webp'),
  court: dataImage('basketball-hardwood.webp'),
};

const variants = [
  { key: 'a', label: 'A 토스 클린', tone: 'toss-clean' },
  { key: 'b', label: 'B 포토 액센트', tone: 'photo-accent' },
  { key: 'c', label: 'C 컴팩트 유틸리티', tone: 'compact-utility' },
  { key: 'd', label: 'D 라운드 커뮤니티', tone: 'rounded-community' },
];

function css() {
  return `
    :root {
      --blue50:#eaf3ff; --blue100:#d7e8ff; --blue500:#3182f6; --blue600:#2272e8;
      --green50:#e9f9ee; --green500:#12b76a; --orange50:#fff4e5; --orange500:#fe9800;
      --red50:#fff0f1; --red500:#f04452; --grey50:#f9fafb; --grey100:#f2f4f6;
      --grey200:#e5e8eb; --grey300:#d1d6db; --grey500:#8b95a1; --grey700:#4e5968;
      --grey800:#333d4b; --grey900:#191f28; --surface:#fff; --shadow-1:0 1px 2px rgba(15,23,42,.05);
      --font:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin:0; background:#eef1f5; font-family:var(--font); color:var(--grey900); }
    .screen { width:390px; min-height:1120px; margin:0 auto; background:var(--grey50); overflow:hidden; position:relative; }
    .topbar { position:sticky; top:0; z-index:2; height:58px; padding:0 18px; display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,.96); border-bottom:1px solid var(--grey100); }
    .topbar strong { font-size:16px; letter-spacing:0; }
    .iconbtn { width:34px; height:34px; border-radius:50%; display:grid; place-items:center; border:1px solid var(--grey100); color:var(--grey700); background:#fff; font-size:15px; }
    .body { padding:18px 20px 96px; }
    .eyebrow { font-size:12px; color:var(--blue600); font-weight:700; margin-bottom:6px; }
    h1 { font-size:25px; line-height:1.22; letter-spacing:0; margin:0 0 6px; }
    .sub { color:var(--grey500); font-size:13px; line-height:1.48; margin:0; }
    .section { margin-top:26px; }
    .section-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
    .section h2 { margin:0; font-size:16px; line-height:1.25; letter-spacing:0; }
    .link { color:var(--blue600); font-weight:700; font-size:13px; }
    .card { background:#fff; border:1px solid var(--grey100); border-radius:18px; box-shadow:var(--shadow-1); padding:18px; }
    .row { display:flex; align-items:center; justify-content:space-between; gap:14px; min-height:48px; border-bottom:1px solid var(--grey100); }
    .row:last-child { border-bottom:0; }
    .row-main { min-width:0; }
    .row-title { font-size:14px; font-weight:700; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .row-sub { margin-top:4px; font-size:12px; color:var(--grey500); line-height:1.35; }
    .badge { display:inline-flex; align-items:center; gap:5px; min-height:24px; padding:0 9px; border-radius:999px; font-size:11px; font-weight:800; background:var(--grey100); color:var(--grey700); white-space:nowrap; }
    .badge.blue { background:var(--blue50); color:var(--blue600); }
    .badge.green { background:var(--green50); color:var(--green500); }
    .badge.orange { background:var(--orange50); color:var(--orange500); }
    .badge.red { background:var(--red50); color:var(--red500); }
    .dot { width:8px; height:8px; border-radius:50%; background:var(--blue500); display:inline-block; }
    .btn { width:100%; height:48px; border-radius:14px; border:0; background:var(--blue500); color:#fff; font-size:15px; font-weight:800; margin-top:14px; }
    .btn.secondary { background:#fff; color:var(--grey800); border:1px solid var(--grey200); }
    .split { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .metric { padding:14px; background:var(--grey50); border-radius:16px; }
    .metric strong { display:block; font-size:21px; line-height:1.1; }
    .metric span { display:block; margin-top:5px; color:var(--grey500); font-size:12px; }
    .progress { height:7px; border-radius:99px; background:var(--grey100); overflow:hidden; margin-top:14px; }
    .progress i { display:block; height:100%; width:60%; background:var(--blue500); border-radius:99px; }
    .media { height:154px; border-radius:20px; overflow:hidden; margin-top:16px; background:#dfe6ef; position:relative; }
    .media img { width:100%; height:100%; object-fit:cover; display:block; }
    .media:after { content:""; position:absolute; inset:0; background:linear-gradient(180deg,rgba(25,31,40,0) 30%,rgba(25,31,40,.46)); }
    .media-label { position:absolute; left:14px; bottom:12px; z-index:1; color:#fff; font-size:13px; font-weight:800; }
    .score { text-align:center; padding:22px 16px; }
    .scoreline { display:flex; align-items:center; justify-content:center; gap:16px; margin-top:12px; }
    .team { width:96px; }
    .team .crest { width:38px; height:38px; border-radius:13px; background:var(--blue50); display:grid; place-items:center; margin:0 auto 8px; color:var(--blue600); font-weight:900; }
    .team-name { font-size:13px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .score-num { font-size:36px; font-weight:900; letter-spacing:0; font-variant-numeric:tabular-nums; }
    .timeline { position:relative; padding-left:18px; }
    .timeline:before { content:""; position:absolute; left:4px; top:10px; bottom:10px; width:2px; background:var(--grey100); }
    .event { position:relative; padding:10px 0 10px 12px; }
    .event:before { content:""; position:absolute; left:-18px; top:17px; width:10px; height:10px; border-radius:50%; background:var(--blue500); border:2px solid #fff; }
    .event strong { font-size:14px; }
    .event p { margin:4px 0 0; color:var(--grey500); font-size:12px; }
    .quick-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; }
    .quick { min-height:46px; border:1px solid var(--grey100); background:#fff; border-radius:14px; font-size:13px; font-weight:800; color:var(--grey800); }
    .field { min-height:48px; border:1px solid var(--grey200); border-radius:14px; background:#fff; padding:13px 14px; color:var(--grey500); font-size:13px; }
    .bottomnav { position:absolute; left:20px; right:20px; bottom:12px; height:64px; border-radius:24px; background:rgba(255,255,255,.96); border:1px solid rgba(229,232,235,.8); box-shadow:0 8px 24px rgba(20,28,45,.08); display:flex; justify-content:space-around; align-items:center; }
    .navitem { font-size:11px; color:var(--grey500); font-weight:700; text-align:center; }
    .navitem.active { color:var(--blue600); }
    .photo-accent .hero-photo { display:block; }
    .photo-accent .media { height:96px; border-radius:16px; margin-top:14px; }
    .admin.photo-accent .media { height:86px; }
    .toss-clean .hero-photo, .compact-utility .hero-photo, .rounded-community .hero-photo { display:none; }
    .compact-utility .body { padding-left:16px; padding-right:16px; }
    .compact-utility .section { margin-top:20px; }
    .compact-utility .card { padding:14px; border-radius:16px; }
    .compact-utility .row { min-height:43px; }
    .compact-utility h1 { font-size:23px; }
    .rounded-community .card { border-radius:24px; background:linear-gradient(180deg,#fff,#fbfcff); }
    .rounded-community .metric { border-radius:20px; background:#f4f8ff; }
    .rounded-community .badge { border-radius:14px; }
    .admin .topbar { background:#fff; }
    .admin .screen { background:#f7f8fa; }
    .danger { color:var(--red500); }
    .warn { color:var(--orange500); }
  `;
}

function nav(active = '대회') {
  return `<nav class="bottomnav">
    ${['홈', '매치', '대회', '팀', '마이'].map((item) => `<div class="navitem ${item === active ? 'active' : ''}"><div>${item}</div></div>`).join('')}
  </nav>`;
}

function topbar(title, action = '공유') {
  return `<header class="topbar"><div class="iconbtn">‹</div><strong>${title}</strong><div class="iconbtn">${action.slice(0, 2)}</div></header>`;
}

function row(title, sub, trailing = '') {
  return `<div class="row"><div class="row-main"><div class="row-title">${title}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>${trailing}</div>`;
}

function section(title, body, action = '') {
  return `<section class="section"><div class="section-head"><h2>${title}</h2>${action ? `<span class="link">${action}</span>` : ''}</div>${body}</section>`;
}

function readiness(v) {
  return `
    <div class="screen ${v.tone}">
      ${topbar('내 신청')}
      <main class="body">
        <div class="eyebrow">2026 Summer Cup</div>
        <h1>레드 FC의 대회 준비가 진행 중이에요</h1>
        <p class="sub">로스터와 규정 확인만 마치면 첫 경기 준비가 끝납니다.</p>
        <div class="hero-photo media"><img src="${images.huddle}" alt=""><div class="media-label">레드 FC 참가 신청</div></div>
        ${section('준비 현황', `
          <div class="card">
            <div class="split">
              <div class="metric"><strong>3/5</strong><span>완료한 준비</span></div>
              <div class="metric"><strong>D-12</strong><span>첫 경기까지</span></div>
            </div>
            <div class="progress"><i style="width:60%"></i></div>
            ${row('신청서 제출', '운영자 확인 대기 중', '<span class="badge blue">완료</span>')}
            ${row('로스터 입력', '8/10명 입력됨', '<span class="badge orange">필요</span>')}
            ${row('참가비 입금', '입금 확인 중', '<span class="badge">대기</span>')}
            ${row('대회 규정 확인', '팀장 확인 필요', '<span class="badge orange">필수</span>')}
            ${row('경기 전 체크인', 'D-1 오픈 예정', '<span class="badge">예정</span>')}
            <button class="btn">로스터 마저 입력</button>
            <button class="btn secondary">신청 내용 수정</button>
          </div>
        `)}
        ${section('팀 정보', `
          <div class="card">
            ${row('레드 FC', '풋살 · 주장 홍길동', '<span class="badge blue">8명</span>')}
            ${row('참가 상태', '승인 대기 · 운영자 검토 중', '<span class="badge">확인 중</span>')}
          </div>
        `)}
        ${section('장소와 첫 경기', `
          <div class="card">
            ${row('서울 디풋살파크', '서울 강남구 도산대로 123', '<span class="link">지도</span>')}
            ${row('07.25(토) - 07.26(일)', '첫 경기 07.25 10:00 · A조 1경기', '<span class="badge blue">일정</span>')}
          </div>
        `)}
        ${section('운영 공지', `
          <div class="card">
            ${row('[필수] 참가비 확인', '입금 확인은 운영자가 승인합니다')}
            ${row('[안내] 로스터 수정', '경기 하루 전까지 수정할 수 있어요')}
          </div>
        `, '전체 보기')}
        ${section('도움', `
          <div class="card">
            ${row('운영자에게 문의', '신청, 입금, 로스터 문제를 확인해요', '<span class="link">문의</span>')}
            ${row('대회 상세 보기', '일정, 장소, 규정 다시 보기', '<span class="link">이동</span>')}
          </div>
        `)}
      </main>${nav('대회')}
    </div>`;
}

function liveMatch(v) {
  return `
    <div class="screen ${v.tone}">
      ${topbar('A조 1경기')}
      <main class="body">
        <div class="eyebrow">2026 Summer Cup · LIVE</div>
        <h1>Red FC가 한 점 앞서고 있어요</h1>
        <p class="sub">전반 18:42 · 1구장 · 실시간 기록은 운영자 입력 후 반영됩니다.</p>
        <div class="hero-photo media"><img src="${images.futsal}" alt=""><div class="media-label">1구장 라이브 경기</div></div>
        <section class="section">
          <div class="card score">
            <span class="badge green"><span class="dot"></span>LIVE</span>
            <div class="scoreline">
              <div class="team"><div class="crest">R</div><div class="team-name">Red FC</div></div>
              <div class="score-num">2 : 1</div>
              <div class="team"><div class="crest">W</div><div class="team-name">White FC</div></div>
            </div>
            <button class="btn">타임라인 보기</button>
          </div>
        </section>
        ${section('타임라인', `
          <div class="card timeline">
            <div class="event"><strong>12' 홍길동 득점</strong><p>Red FC · 김철수 도움</p></div>
            <div class="event"><strong>16' 김철수 도움</strong><p>Red FC · 오른쪽 측면 패스</p></div>
            <div class="event"><strong>21' 박민수 경고</strong><p>White FC · 지연 행위</p></div>
            <div class="event"><strong>28' 이지훈 득점</strong><p>White FC · 추격골</p></div>
          </div>
        `, '선수 기록')}
        ${section('선수 기록', `
          <div class="card">
            ${row('홍길동', 'Red FC · MVP 후보', '<span class="badge blue">1골</span>')}
            ${row('김철수', 'Red FC', '<span class="badge">1도움</span>')}
            ${row('이지훈', 'White FC', '<span class="badge blue">1골</span>')}
          </div>
        `)}
        ${section('라인업', `
          <div class="card">
            ${row('Red FC', '홍길동 · 김철수 · 박준호')}
            ${row('White FC', '이지훈 · 박민수 · 최도윤')}
          </div>
        `)}
        ${section('하이라이트', `
          <div class="card">
            ${row('영상은 경기 종료 후 올라와요', '현재는 실시간 기록만 제공됩니다', '<span class="badge">대기</span>')}
          </div>
        `)}
        ${section('대회 바로가기', `
          <div class="card">
            ${row('대회 순위 보기', 'A조 순위와 승점 확인', '<span class="link">이동</span>')}
            ${row('전체 경기 보기', '다음 경기와 종료 경기 확인', '<span class="link">이동</span>')}
          </div>
        `)}
      </main>${nav('대회')}
    </div>`;
}

function adminControl(v) {
  return `
    <div class="screen ${v.tone} admin">
      ${topbar('경기 운영', '저장')}
      <main class="body">
        <div class="eyebrow">관리자 · LIVE 관리</div>
        <h1>스코어와 이벤트를 입력해요</h1>
        <p class="sub">2026 Summer Cup · A조 1경기. 입력 내용은 사용자 화면과 순위 계산에 반영됩니다.</p>
        <div class="hero-photo media"><img src="${images.futsal}" alt=""><div class="media-label">운영자 경기 컨트롤</div></div>
        <section class="section">
          <div class="card score">
            <span class="badge blue">LIVE 관리</span>
            <div class="scoreline">
              <div class="team"><div class="crest">R</div><div class="team-name">Red FC</div></div>
              <div class="score-num">2 : 1</div>
              <div class="team"><div class="crest">W</div><div class="team-name">White FC</div></div>
            </div>
            <div class="split">
              <button class="quick">Red +1</button>
              <button class="quick">Red -1</button>
              <button class="quick">White +1</button>
              <button class="quick">White -1</button>
            </div>
            <button class="btn">이벤트 입력</button>
            <button class="btn secondary danger">경기 종료</button>
          </div>
        </section>
        ${section('이벤트 종류', `
          <div class="quick-grid">
            <button class="quick">득점</button>
            <button class="quick">도움</button>
            <button class="quick">경고</button>
            <button class="quick">퇴장</button>
            <button class="quick">교체</button>
            <button class="quick">기타</button>
          </div>
        `)}
        ${section('입력 폼', `
          <div class="card">
            <div class="field">팀 선택 · Red FC</div>
            <div style="height:10px"></div>
            <div class="field">선수 선택 · 홍길동</div>
            <div style="height:10px"></div>
            <div class="field">시간 입력 · 29분</div>
            <div style="height:10px"></div>
            <div class="field">메모 선택 입력</div>
            <button class="btn">기록 저장</button>
          </div>
        `)}
        ${section('최근 이벤트', `
          <div class="card">
            ${row('12분 득점 · 홍길동', 'Red FC · 사용자 화면 반영됨', '<span class="badge green">저장</span>')}
            ${row('16분 도움 · 김철수', 'Red FC · 사용자 화면 반영됨', '<span class="badge green">저장</span>')}
            ${row('21분 경고 · 박민수', 'White FC · 감사 로그 기록', '<span class="badge">기록</span>')}
          </div>
        `)}
        ${section('자동 반영 상태', `
          <div class="card">
            ${row('스코어 사용자 화면', '방금 전 반영됨', '<span class="badge green">완료</span>')}
            ${row('A조 순위 재계산', '경기 종료 후 확정됩니다', '<span class="badge orange">대기</span>')}
            ${row('브래킷 영향', '현재 라운드에는 영향 없음', '<span class="badge">없음</span>')}
          </div>
        `)}
        ${section('안전 기록', `
          <div class="card">
            ${row('마지막 저장', '방금 전 · 관리자 김운영')}
            ${row('변경 기록 보기', '점수/이벤트 수정 내역 확인', '<span class="link">열기</span>')}
          </div>
        `)}
      </main>
    </div>`;
}

const screens = [
  { id: 'B7-04', slug: 'tournament-my-readiness', title: '대회 내 신청 상태', render: readiness },
  { id: 'B8-02', slug: 'tournament-live-match-detail', title: '대회 경기 상세 실시간', render: liveMatch },
  { id: 'B9-08', slug: 'admin-match-control-room', title: '관리자 경기 이벤트 입력', render: adminControl },
];

function outputName(screen, variant) {
  return `${screen.id.toLowerCase()}-${screen.slug}-${variant.key}-v22.png`;
}

function expectedOutputNames() {
  return new Set(screens.flatMap((screen) => variants.map((variant) => outputName(screen, variant))));
}

function clearStalePagePngs() {
  const expected = expectedOutputNames();
  const ownedPrefixes = screens.map((screen) => `${screen.id.toLowerCase()}-`);
  for (const fileName of readdirSync(OUT)) {
    const isOwned = ownedPrefixes.some((prefix) => fileName.startsWith(prefix));
    if (isOwned && fileName.endsWith('.png') && !expected.has(fileName)) {
      rmSync(path.join(OUT, fileName));
    }
  }
}

function html(screen, variant) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${screen.id} ${variant.label}</title><style>${css()}</style></head><body>${screen.render(variant)}</body></html>`;
}

function pngDataUrl(filePath) {
  return `data:image/png;base64,${readFileSync(filePath).toString('base64')}`;
}

function contactSheetHtml(items) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    body { margin:0; background:#fff; font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif; }
    .sheet { width:930px; padding:18px; display:grid; grid-template-columns:repeat(4,210px); gap:28px 18px; }
    .label { height:32px; font-size:12px; color:#191f28; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    img { width:210px; height:420px; object-fit:contain; object-position:top center; display:block; background:#fff; }
  </style></head><body><main class="sheet">
    ${items.map((item) => `<section><div class="label">${item.name.replace('-v22.png', '')}</div><img src="${item.src}" alt=""></section>`).join('')}
  </main></body></html>`;
}

async function renderContactSheet(browser) {
  const sheetPage = await browser.newPage({ viewport: { width: 980, height: 1420 }, deviceScaleFactor: 1 });
  const items = screens.flatMap((screen) =>
    variants.map((variant) => {
      const name = outputName(screen, variant);
      return { name, src: pngDataUrl(path.join(OUT, name)) };
    }),
  );
  await sheetPage.setContent(contactSheetHtml(items), { waitUntil: 'load' });
  await sheetPage.screenshot({
    path: path.join(EVIDENCE, 'p0-contact-sheet-v22.png'),
    fullPage: true,
  });
  await sheetPage.close();
}

clearStalePagePngs();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });

for (const screen of screens) {
  for (const variant of variants) {
    await page.setContent(html(screen, variant), { waitUntil: 'networkidle' });
    await page.screenshot({
      path: path.join(OUT, outputName(screen, variant)),
      fullPage: true,
    });
  }
}

await page.close();
await renderContactSheet(browser);
await browser.close();

console.log(`rendered ${screens.length * variants.length} png files`);
console.log(OUT);
console.log(path.join(EVIDENCE, 'p0-contact-sheet-v22.png'));
