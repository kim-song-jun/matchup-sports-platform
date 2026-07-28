import { chromium } from 'playwright';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FLOW = path.join(ROOT, '.omo/ultraresearch/20260627-152929-teameet-mobile-tournament-identity/mockups/service-wide-v22-ko');
const OUT = path.join(FLOW, 'pages');
const EVIDENCE = path.join(FLOW, 'evidence');
mkdirSync(OUT, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });

const variants = [
  { key: 'a', label: 'A 토스 클린', tone: 'toss-clean' },
  { key: 'b', label: 'B 절제된 프로필', tone: 'profile-accent' },
  { key: 'c', label: 'C 컴팩트 유틸리티', tone: 'compact' },
  { key: 'd', label: 'D 라운드 커뮤니티', tone: 'rounded' },
];

const screens = [
  { id: 'B5-01', slug: 'my-home', title: '마이', render: myHome },
  { id: 'B5-04', slug: 'review-hub', title: '후기 관리', render: reviewHub },
  { id: 'B5-06', slug: 'settings-hub', title: '설정', render: settingsHub },
];
const outputName = (screen, variant) => `${screen.id.toLowerCase()}-${screen.slug}-${variant.key}-v22.png`;
const row = (title, sub = '', options = {}) => {
  const { trail = '>', tone = '' } = options;
  return `<div class="row"><div class="row-main"><div class="row-title">${title}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div><div class="trail ${tone}">${trail}</div></div>`;
};
const section = (title, body, action = '') => `<section class="section"><div class="section-head"><h2>${title}</h2>${action ? `<span>${action}</span>` : ''}</div><div class="group">${body}</div></section>`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${text}</span>`;
const top = (title) => `<header class="topbar"><button>알림</button><strong>${title}</strong><button>설정</button></header>`;
const avatar = (name) => `<div class="avatar" aria-label="${name} 프로필">JM</div>`;
const nav = (active = '마이') => `<nav class="bottomnav">${['홈', '매치', '팀', '후기', '마이'].map((item) => `<span class="${item === active ? 'active' : ''}">${item}</span>`).join('')}</nav>`;

function stats(items) {
  return `<div class="stats">${items.map(([label, value, tone = '']) => `<div><strong class="${tone}">${value}</strong><span>${label}</span></div>`).join('')}</div>`;
}

function myHome(variant) {
  return `<div class="screen ${variant.tone}">${top('마이')}<main>
    <section class="profile">${avatar('정민')}<div><h1>정민</h1><p>강남구 · 신논현동</p><div>${badge('풋살', 'blue')}${badge('축구')}${badge('본인 인증 완료', 'green')}</div></div></section>
    ${stats([['참여 매치', '23'], ['내 팀', '2'], ['받은 후기', '18']])}
    ${section('최근 활동', [
      row('오늘 19:00 풋살 매치 확정', '서울 디풋살파크 · 참가자로 확정', { trail: badge('확정', 'green'), tone: 'green' }),
      row('레드 FC 팀 초대 대기', '팀장이 초대 응답을 기다리고 있어요', { trail: badge('대기', 'orange'), tone: 'orange' }),
      row('작성할 후기 2개', '매치 종료 후 3일 안에 작성', { trail: badge('필요', 'blue'), tone: 'blue' }),
    ].join(''))}
    ${section('내 활동 바로가기', [
      row('내 매치', '참가, 대기, 완료된 매치 관리'),
      row('내 팀', '소속 팀과 초대 상태 확인'),
      row('후기 관리', '작성할 후기와 받은 후기 보기'),
      row('설정', '지역, 알림, 관심 종목 변경'),
    ].join(''))}
    ${section('도움', row('고객센터', '문의와 신고 내역') + row('공지사항', '서비스 업데이트와 운영 안내'))}
  </main>${nav()}</div>`;
}

function reviewHub(variant) {
  return `<div class="screen ${variant.tone}">${top('후기 관리')}<main>
    <div class="tabs"><span class="active">작성할 후기</span><span>받은 후기</span></div>
    ${stats([['작성할 후기', '2', 'blue'], ['받은 후기', '18'], ['매너 평균', '4.9', 'green']])}
    ${section('매너 신호', `<div class="signal"><div><strong>4.9</strong><span>검증된 후기 16개 기준</span></div><p>샘플 신호 2개는 점수에 반영 전</p></div>${row('시간 약속', '검증됨 · 5.0', { trail: badge('verified', 'green') })}${row('팀워크', '검증됨 · 4.9', { trail: badge('verified', 'green') })}${row('페어플레이', '샘플 · 2개 수집 중', { trail: badge('sample', 'orange') })}`)}
    ${section('작성할 후기', [
      row('한강 풋살 매치', '오늘 19:00 · 3일 안에 작성', { trail: '작성하기', tone: 'blue' }),
      row('레드 FC 팀 매치', '어제 종료 · 3일 안에 작성', { trail: '작성하기', tone: 'blue' }),
    ].join(''), '2개')}
    ${section('받은 후기', [
      row('이민정 · 풋살', '매너 5.0 · 패스가 정확하고 약속을 잘 지켜요', { trail: badge('검증됨', 'green') }),
      row('박준수 · 축구', '매너 4.8 · 팀워크가 좋았어요', { trail: badge('검증됨', 'green') }),
    ].join(''), '전체보기')}
    <p class="guide">후기는 매치 종료 후 상호 확인된 활동만 검증 신호로 반영돼요.</p>
  </main>${nav('후기')}</div>`;
}

function settingsHub(variant) {
  return `<div class="screen ${variant.tone}">${top('설정')}<main>
    <section class="account">${avatar('정민')}<div><h1>정민</h1><p>본인 인증 완료</p></div>${badge('verified', 'green')}</section>
    ${section('활동 지역', row('강남구 · 서초구', '근처 매치 추천에 사용', { trail: '변경', tone: 'blue' }))}
    ${section('알림', row('알림 설정', '확정/취소/일정 변경', { trail: '저장됨' }) + row('기기 권한 확인 필요', 'OS 권한을 확인해야 푸시가 발송돼요', { trail: badge('확인 필요', 'orange'), tone: 'orange' }))}
    ${section('관심 종목', row('풋살 · 축구 · 러닝', '추천과 검색 필터에 사용', { trail: '편집', tone: 'blue' }))}
    ${section('약관 및 개인정보', [
      row('서비스 이용약관', 'v2026.04 · 필수', { trail: '보기' }),
      row('개인정보 처리방침', 'v2026.04 · 최신', { trail: '보기' }),
      row('마케팅 수신 동의', '선택 · 미동의', { trail: '변경' }),
    ].join(''))}
    ${section('계정', row('로그아웃', '이 기기에서만 로그아웃') + row('회원 탈퇴', '진행 중인 예약/분쟁이 있으면 탈퇴할 수 없어요', { trail: '확인', tone: 'danger' }))}
  </main>${nav()}</div>`;
}

function css() {
  return `:root{--blue50:#eaf3ff;--blue500:#3182f6;--blue600:#2272e8;--green50:#e9f9ee;--green500:#12b76a;--orange50:#fff4e5;--orange500:#fe9800;--red50:#fff0f1;--red500:#f04452;--grey50:#f9fafb;--grey100:#f2f4f6;--grey200:#e5e8eb;--grey500:#8b95a1;--grey700:#4e5968;--grey900:#191f28;--font:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:#eef1f5;font-family:var(--font);color:var(--grey900)}button{font:inherit}.screen{width:390px;min-height:1040px;margin:0 auto;background:var(--grey50);position:relative;overflow:hidden}.topbar{height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.96);border-bottom:1px solid var(--grey100);position:sticky;top:0;z-index:2}.topbar strong{font-size:16px}.topbar button{min-width:42px;border:0;background:transparent;color:var(--grey700);font-size:12px;font-weight:800}main{padding:18px 20px 96px}.profile,.account{display:flex;align-items:center;gap:14px;padding:16px;background:#fff;border:1px solid var(--grey100);border-radius:18px;box-shadow:0 1px 2px rgba(15,23,42,.04)}.account{justify-content:space-between}.avatar{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#dbeafe,#f8fafc);color:var(--blue600);font-size:17px;font-weight:900;border:1px solid var(--grey100)}h1{font-size:18px;line-height:1.25;margin:0 0 4px}p{margin:0;color:var(--grey500);font-size:12px;line-height:1.45}.badge{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:var(--grey100);color:var(--grey700);font-size:11px;font-weight:800;margin-right:5px;white-space:nowrap}.badge.blue{background:var(--blue50);color:var(--blue600)}.badge.green{background:var(--green50);color:var(--green500)}.badge.orange{background:var(--orange50);color:var(--orange500)}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;padding:8px;background:#fff;border:1px solid var(--grey100);border-radius:18px}.stats div{min-height:62px;border-radius:13px;background:var(--grey50);display:grid;place-items:center;padding:9px 4px}.stats strong{font-size:22px;line-height:1;font-variant-numeric:tabular-nums}.stats span{font-size:11px;color:var(--grey500);font-weight:800}.blue{color:var(--blue600)}.green{color:var(--green500)}.orange{color:var(--orange500)}.section{margin-top:22px}.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.section h2{margin:0;font-size:15px}.section-head span{font-size:12px;color:var(--blue600);font-weight:900}.group{background:#fff;border:1px solid var(--grey100);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}.row{min-height:55px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--grey100)}.row:last-child{border-bottom:0}.row-main{min-width:0}.row-title{font-size:14px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row-sub{font-size:12px;line-height:1.4;color:var(--grey500);margin-top:4px}.trail{font-size:12px;font-weight:900;color:var(--grey500);white-space:nowrap}.trail.danger{color:var(--red500)}.tabs{display:flex;gap:8px;margin-bottom:12px}.tabs span{height:34px;padding:0 12px;border-radius:999px;background:#fff;border:1px solid var(--grey100);display:flex;align-items:center;font-size:12px;font-weight:900;color:var(--grey700)}.tabs .active{background:var(--blue500);border-color:var(--blue500);color:#fff}.signal{padding:14px;border-bottom:1px solid var(--grey100);display:flex;justify-content:space-between;gap:12px}.signal strong{font-size:30px;color:var(--blue600);display:block}.signal span{font-size:12px;color:var(--grey700);font-weight:800}.signal p{max-width:145px}.guide{margin-top:14px;padding:13px 14px;border-radius:15px;background:#fff;border:1px solid var(--grey100);color:var(--grey700)}.bottomnav{position:absolute;left:20px;right:20px;bottom:12px;height:62px;border-radius:23px;background:rgba(255,255,255,.96);border:1px solid rgba(229,232,235,.9);box-shadow:0 8px 22px rgba(20,28,45,.08);display:flex;align-items:center;justify-content:space-around}.bottomnav span{font-size:11px;color:var(--grey500);font-weight:900}.bottomnav .active{color:var(--blue600)}.profile-accent .profile,.profile-accent .account{background:linear-gradient(180deg,#fff,#fbfdff)}.profile-accent .avatar{width:66px;height:66px;border-radius:24px}.compact main{padding-left:16px;padding-right:16px}.compact .section{margin-top:18px}.compact .row{min-height:49px;padding:10px 13px}.compact .group,.compact .profile,.compact .account,.compact .stats{border-radius:15px}.compact .stats div{min-height:55px}.rounded .group,.rounded .profile,.rounded .account,.rounded .stats{border-radius:24px}.rounded .stats div{border-radius:18px;background:#f4f8ff}.rounded .avatar{border-radius:21px}`;
}

function clearOwnedPngs() {
  const expected = new Set(screens.flatMap((screen) => variants.map((variant) => outputName(screen, variant))));
  for (const name of readdirSync(OUT)) {
    if (name.endsWith('.png') && ['b5-01-', 'b5-04-', 'b5-06-'].some((prefix) => name.startsWith(prefix)) && !expected.has(name)) rmSync(path.join(OUT, name));
  }
}

function html(screen, variant) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${screen.title}</title><style>${css()}</style></head><body>${screen.render(variant)}</body></html>`;
}

const pngData = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
function sheetHtml(items) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.sheet{width:930px;padding:18px;display:grid;grid-template-columns:repeat(4,210px);gap:28px 18px}.label{height:32px;font-size:12px;color:#191f28;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}img{width:210px;height:420px;object-fit:contain;object-position:top center;display:block;background:#fff}</style></head><body><main class="sheet">${items.map((item) => `<section><div class="label">${item.label}</div><img src="${item.src}" alt=""></section>`).join('')}</main></body></html>`;
}

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
  await page.setContent(sheetHtml(items), { waitUntil: 'load' });
  await page.screenshot({ path: path.join(EVIDENCE, 'p2c-my-utility-contact-sheet-v22.png'), fullPage: true });
  await page.close();
}

clearOwnedPngs();
const browser = await chromium.launch();
const files = await Promise.all(screens.flatMap((screen) => variants.map((variant) => renderScreen(browser, screen, variant))));
await renderSheet(browser);
await browser.close();
console.log(`rendered ${files.length} png files`);
console.log(path.join(EVIDENCE, 'p2c-my-utility-contact-sheet-v22.png'));
