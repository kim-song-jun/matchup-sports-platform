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
  { key: 'b', label: 'B 운영 포커스', tone: 'ops' },
  { key: 'c', label: 'C 컴팩트 콘솔', tone: 'compact' },
  { key: 'd', label: 'D 라운드 콘솔', tone: 'round' },
];
const screens = [
  { id: 'B9-01', slug: 'admin-overview', title: '관리자 홈', render: overview },
  { id: 'B9-02', slug: 'admin-users', title: '회원 관리', render: users },
  { id: 'B9-05', slug: 'admin-tournaments', title: '대회 운영 목록', render: tournaments },
];
const outputName = (screen, variant) => `${screen.id.toLowerCase()}-${screen.slug}-${variant.key}-v22.png`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${text}</span>`;
const row = (title, sub = '', options = {}) => {
  const { trail = '보기', tone = '' } = options;
  return `<div class="row"><div class="main"><strong>${title}</strong>${sub ? `<p>${sub}</p>` : ''}</div><span class="trail ${tone}">${trail}</span></div>`;
};
const section = (title, body, action = '') => `<section class="section"><div class="head"><h2>${title}</h2>${action ? `<span>${action}</span>` : ''}</div><div class="group">${body}</div></section>`;
const top = (title, action = '') => `<header class="top"><button>메뉴</button><strong>${title}</strong><button>${action}</button></header>`;
const metric = (label, value, tone = '') => `<div class="metric"><strong class="${tone}">${value}</strong><span>${label}</span></div>`;

function overview(variant) {
  return `<div class="screen ${variant.tone}">${top('운영 콘솔', '로그')}<main>
    <section class="intro"><h1>오늘 처리할 운영 항목</h1><p>사용자, 매치, 팀, 대회 상태 변경을 한 화면에서 확인해요.</p></section>
    <div class="metrics">${metric('대기 승인', '18', 'blue')}${metric('주의 필요', '6', 'orange')}${metric('오늘 audit', '42')}</div>
    ${section('처리 큐', [
      row('대회 참가 승인 7건', '입금 확인 3건 · 로스터 보완 4건', { trail: badge('대회', 'blue') }),
      row('매치 신고 2건', '운영자 확인 전 · 증빙 첨부 있음', { trail: badge('주의', 'orange') }),
      row('팀 공개 보류 3건', '사진/소개 검토 필요', { trail: badge('팀') }),
    ].join(''))}
    ${section('바로가기', [
      row('회원/관리자 관리', '권한, 제한, 인증 상태 확인'),
      row('매치 운영 관리', '상태 변경과 취소 사유 기록'),
      row('대회 운영 목록', '생성, 신청 승인, 공지 관리'),
      row('감사 로그', '운영자 액션과 변경 이력'),
    ].join(''))}
    ${section('최근 audit', [
      row('김운영 · 참가 승인', 'Teameet Cup · 13:20', { trail: '기록' }),
      row('서관리 · 매치 취소 처리', '사유: 우천 취소 · 12:48', { trail: '기록' }),
    ].join(''))}
  </main></div>`;
}

function users(variant) {
  return `<div class="screen ${variant.tone}">${top('회원 관리', '검색')}<main>
    <section class="intro"><h1>상태 변경은 이유와 함께</h1><p>회원 제한, 관리자 권한, 인증 상태를 audit trail로 남겨요.</p></section>
    <div class="tabs"><span class="on">회원</span><span>관리자</span><span>제한</span></div>
    ${section('검토 필요', [
      row('정민 · 본인 인증 재확인', '신분 정보 재제출 · 2시간 전', { trail: badge('확인', 'orange') }),
      row('서연 · 신고 누적 2건', '매치 매너 신고 · 최근 7일', { trail: badge('주의', 'orange') }),
    ].join(''))}
    ${section('회원 목록', [
      row('김지훈', '풋살 · 정상 · 최근 접속 10분 전', { trail: '상세' }),
      row('이서연', '러닝 · 제한 검토 · 최근 접속 1일 전', { trail: '상세' }),
      row('박민재', '팀장 · 정상 · 팀 2개 운영', { trail: '상세' }),
    ].join(''))}
    ${section('상태 변경 확인', `<div class="confirm"><b>이 회원을 7일 제한할까요?</b><p>사유와 담당자, 처리 시간이 audit log에 저장됩니다.</p><div><button class="ghost">취소</button><button>제한 처리</button></div></div>`)}
  </main></div>`;
}

function tournaments(variant) {
  return `<div class="screen ${variant.tone}">${top('대회 운영', '생성')}<main>
    <section class="intro"><h1>대회 상태를 운영 단계별로</h1><p>모집, 입금 확인, 진행, 종료 상태를 분리해서 관리해요.</p></section>
    <div class="tabs"><span class="on">전체</span><span>모집</span><span>진행</span><span>종료</span></div>
    ${section('주의 필요', [
      row('Teameet Cup', '입금 미확인 3팀 · 로스터 보완 2팀', { trail: badge('D-7', 'blue') }),
      row('성수 러닝 리그', '공지 미게시 · 장소 확인 필요', { trail: badge('확인', 'orange') }),
    ].join(''))}
    ${section('대회 목록', [
      row('2026 Summer Cup', '모집중 · 24/32팀 · 풋살/축구', { trail: '관리' }),
      row('한강 배드민턴 챌린지', '진행중 · 오늘 경기 8개', { trail: '관리' }),
      row('성수 러닝 리그', '준비중 · 승인 대기 4건', { trail: '관리' }),
    ].join(''))}
    ${section('운영 액션', [
      row('신청 승인', '입금/로스터/규칙 동의 확인 후 승인'),
      row('공지 발송', '참가팀 전체 또는 특정 그룹 발송'),
      row('상태 변경', '모집중, 진행중, 종료로 변경하고 기록'),
    ].join(''))}
  </main></div>`;
}

function css() {
  return `:root{--blue:#3182f6;--blue50:#eaf3ff;--green:#03b26c;--green50:#e9f9ef;--orange:#f59f00;--orange50:#fff4e6;--red:#f04452;--red50:#fff1f2;--bg:#f9fafb;--g100:#f2f4f6;--g200:#e5e8eb;--g500:#8b95a1;--g700:#4e5968;--g900:#191f28}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--g900);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif}.screen{width:390px;min-height:1180px;margin:0 auto;background:var(--bg);overflow:hidden}.top{height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.97);border-bottom:1px solid var(--g100);position:sticky;top:0;z-index:2}.top button{border:0;background:transparent;color:var(--g700);font-size:12px;font-weight:800}.top strong{font-size:16px}main{padding:18px 20px 48px}.intro h1{margin:0;font-size:24px;line-height:1.22;letter-spacing:0}.intro p{margin:8px 0 0;color:var(--g500);font-size:13px;line-height:1.5}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}.metric{min-height:74px;background:white;border:1px solid var(--g100);border-radius:18px;display:grid;place-items:center;box-shadow:0 1px 2px rgba(15,23,42,.04)}.metric strong{font-size:24px;line-height:1}.metric span{font-size:11px;color:var(--g500);font-weight:900}.blue{color:var(--blue)}.orange{color:var(--orange)}.section{margin-top:22px}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.head h2{margin:0;font-size:15px}.head span{font-size:12px;color:var(--blue);font-weight:900}.group{background:white;border:1px solid var(--g100);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}.row{min-height:58px;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--g100)}.row:last-child{border-bottom:0}.main{min-width:0}.row strong{display:block;font-size:14px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row p{margin:5px 0 0;color:var(--g500);font-size:12px;line-height:1.35}.trail{font-size:12px;color:var(--blue);font-weight:900;white-space:nowrap}.badge{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:var(--g100);color:var(--g700);font-size:11px;font-weight:900}.badge.blue{background:var(--blue50);color:var(--blue)}.badge.orange{background:var(--orange50);color:var(--orange)}.tabs{display:flex;gap:8px;margin-top:16px}.tabs span{height:34px;padding:0 12px;border-radius:999px;background:white;border:1px solid var(--g100);display:flex;align-items:center;font-size:12px;font-weight:900;color:var(--g700)}.tabs .on{background:var(--blue);border-color:var(--blue);color:white}.confirm{padding:16px}.confirm b{font-size:15px}.confirm p{margin:8px 0 14px;color:var(--g500);font-size:12px;line-height:1.45}.confirm div{display:grid;grid-template-columns:1fr 1.6fr;gap:8px}.confirm button{height:44px;border:0;border-radius:14px;background:var(--blue);color:white;font-weight:900}.confirm .ghost{background:white;color:var(--g700);border:1px solid var(--g200)}.ops .intro{padding:16px;border-radius:22px;background:white;border:1px solid var(--g100)}.compact main{padding-left:16px;padding-right:16px}.compact .section{margin-top:16px}.compact .row{min-height:50px;padding:10px 13px}.compact .group,.compact .metric{border-radius:15px}.compact .intro h1{font-size:22px}.round .group,.round .metric,.round .ops .intro{border-radius:24px}.round .badge{border-radius:13px}`;
}

function clearOwned() {
  const expected = new Set(screens.flatMap((screen) => variants.map((variant) => outputName(screen, variant))));
  for (const name of readdirSync(OUT)) {
    if (name.endsWith('.png') && ['b9-01-', 'b9-02-', 'b9-05-'].some((prefix) => name.startsWith(prefix)) && !expected.has(name)) rmSync(path.join(OUT, name));
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
  const page = await browser.newPage({ viewport: { width: 980, height: 1420 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="ko"><style>body{margin:0;background:white;font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.sheet{width:930px;padding:18px;display:grid;grid-template-columns:repeat(4,210px);gap:28px 18px}.label{height:32px;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}img{width:210px;height:420px;object-fit:contain;object-position:top center;background:#fff}</style><main class="sheet">${items.map((item) => `<section><div class="label">${item.label}</div><img src="${item.src}" alt=""></section>`).join('')}</main></html>`);
  const file = path.join(EVIDENCE, 'p3c-admin-ops-contact-sheet-v22.png');
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return file;
}

function writeEvidence(files, sheet) {
  const rows = files.sort().map((file) => `| ${path.relative(ROOT, file)} | ${dim(file)} | ${statSync(file).size} |`).join('\n');
  writeFileSync(path.join(OMO_EV, 'teameet-v22-p3c-admin-ops-verification.md'), `# Teameet v22 P3C Admin Ops Verification\n\n| Artifact | Dimensions | Bytes |\n| --- | ---: | ---: |\n${rows}\n| ${path.relative(ROOT, sheet)} | ${dim(sheet)} | ${statSync(sheet).size} |\n\n## Scope\n\n- B9-01 관리자 홈\n- B9-02 회원/관리자 관리\n- B9-05 대회 운영 목록\n\n## Checks\n\n- 12 raw mobile PNGs generated.\n- A/B/C/D variants generated for each admin screen.\n- Admin actions include confirmation or audit context before status changes.\n- Operator screens stay tool-first with solid groups, clear hierarchy, and one dominant action.\n`);
}

clearOwned();
const browser = await chromium.launch();
const files = await Promise.all(screens.flatMap((screen) => variants.map((variant) => renderScreen(browser, screen, variant))));
const sheet = await renderSheet(browser);
await browser.close();
writeEvidence(files, sheet);
console.log(`rendered ${files.length} png files`);
console.log(sheet);
