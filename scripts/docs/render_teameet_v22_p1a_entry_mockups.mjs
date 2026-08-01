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

const photo = (name) => `data:image/webp;base64,${readFileSync(path.join(MOCK, name)).toString('base64')}`;
const photos = {
  futsal: photo('futsal-rooftop.webp'),
  court: photo('basketball-hardwood.webp'),
  club: photo('badminton-club.webp'),
  huddle: photo('team-huddle.webp'),
};
const variants = [
  { key: 'a', tone: 'toss-clean', label: '토스 클린' },
  { key: 'b', tone: 'photo-accent', label: '포토 액센트' },
  { key: 'c', tone: 'compact-utility', label: '컴팩트 유틸리티' },
  { key: 'd', tone: 'rounded-community', label: '라운드 커뮤니티' },
];
const sports = ['풋살', '농구', '배드민턴', '러닝', '테니스', '야구'];
const locks = {
  brand: 'Teameet',
  loginRedirectNotice: '로그인 후 보던 화면으로 돌아가요',
  onboardingHelper: '여러 개 선택할 수 있어요',
};

function css() {
  return `
    :root{--blue50:#eaf3ff;--blue100:#d7e9ff;--blue500:#3182f6;--blue600:#2272e8;--green50:#e9f9ee;--green500:#12b76a;--orange50:#fff4e5;--orange500:#fe9800;--red50:#fff0f1;--red500:#f04452;--grey50:#f9fafb;--grey100:#f2f4f6;--grey200:#e5e8eb;--grey400:#b0b8c1;--grey500:#8b95a1;--grey700:#4e5968;--grey800:#333d4b;--grey900:#191f28;--shadow-1:0 1px 2px rgba(15,23,42,.05);--font:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}
    *{box-sizing:border-box}body{margin:0;background:#eef1f5;font-family:var(--font);color:var(--grey900)}button{font-family:inherit}.screen{width:390px;min-height:1120px;margin:0 auto;background:var(--grey50);overflow:hidden;position:relative}.screen.landing{min-height:1320px}.topbar{height:58px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.96);border-bottom:1px solid var(--grey100);position:sticky;top:0;z-index:3}.brand{font-size:18px;font-weight:950}.top-title{font-size:16px;font-weight:900}.top-link{font-size:13px;color:var(--blue600);font-weight:850}.back{width:34px;height:34px;border-radius:17px;display:grid;place-items:center;background:#fff;border:1px solid var(--grey100);color:var(--grey700);font-size:24px;line-height:1}.body{padding:22px 20px 96px}.eyebrow{font-size:12px;color:var(--blue600);font-weight:850;margin-bottom:8px}.hero-title{font-size:27px;line-height:1.18;letter-spacing:-.01em;margin:0 0 8px}.sub{margin:0;color:var(--grey500);font-size:14px;line-height:1.5}.section{margin-top:30px}.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.section h2{margin:0;font-size:16px;letter-spacing:-.01em}.link{color:var(--blue600);font-size:13px;font-weight:850}.card{background:#fff;border:1px solid var(--grey100);border-radius:18px;box-shadow:var(--shadow-1);padding:18px}.row{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:52px;border-bottom:1px solid var(--grey100)}.row:last-child{border-bottom:0}.row-main{min-width:0}.row-title{font-size:14px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row-sub{font-size:12px;color:var(--grey500);margin-top:4px;line-height:1.4}.badge{display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:999px;background:var(--grey100);color:var(--grey700);font-size:11px;font-weight:850;white-space:nowrap}.badge.blue{background:var(--blue50);color:var(--blue600)}.badge.green{background:var(--green50);color:var(--green500)}.badge.orange{background:var(--orange50);color:var(--orange500)}.badge.red{background:var(--red50);color:var(--red500)}.cta-stack{display:grid;gap:10px;margin-top:22px}.btn{width:100%;min-height:48px;border:0;border-radius:14px;background:var(--blue500);color:#fff;font-size:15px;font-weight:950}.btn.secondary{background:#fff;color:var(--grey800);border:1px solid var(--grey200)}.btn.text{background:transparent;color:var(--blue600);border:0;min-height:38px}.summary-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px}.metric{padding:14px 11px;background:#fff;border:1px solid var(--grey100);border-radius:16px}.metric strong{display:block;font-size:19px}.metric span{display:block;margin-top:5px;font-size:11px;color:var(--grey500);line-height:1.35}.photo-band{height:118px;border-radius:18px;overflow:hidden;position:relative;background:#dfe6ef;margin-top:16px;display:none}.photo-band img{width:100%;height:100%;object-fit:cover}.photo-band:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(25,31,40,0),rgba(25,31,40,.46))}.photo-label{position:absolute;left:14px;right:14px;bottom:12px;color:#fff;font-size:13px;font-weight:900;z-index:1}.chips{display:flex;flex-wrap:wrap;gap:9px}.chip{min-height:36px;display:flex;align-items:center;gap:7px;padding:0 12px;border-radius:999px;background:#fff;border:1px solid var(--grey100);font-size:13px;font-weight:850;color:var(--grey700)}.chip.selected{background:var(--blue500);border-color:var(--blue500);color:#fff}.dot{width:8px;height:8px;border-radius:50%;background:var(--grey400)}.selected .dot{background:#fff}.field{height:48px;border:1px solid var(--grey200);border-radius:14px;background:#fff;padding:0 14px;display:flex;align-items:center;color:var(--grey700);font-size:13px}.field+.field{margin-top:10px}.notice{padding:14px 16px;border-radius:16px;background:var(--blue50);color:var(--grey800);font-size:13px;line-height:1.45}.error{background:var(--red50);color:var(--red500)}.sport-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sport-card{min-height:86px;background:#fff;border:1px solid var(--grey100);border-radius:18px;padding:14px;display:flex;flex-direction:column;justify-content:space-between}.sport-card.selected{border-color:var(--blue500);background:var(--blue50)}.sport-name{font-size:15px;font-weight:900}.sport-meta{font-size:12px;color:var(--grey500)}.check{align-self:flex-end;width:24px;height:24px;border-radius:12px;background:var(--grey100);color:var(--grey500);display:grid;place-items:center;font-size:12px;font-weight:900}.selected .check{background:var(--blue500);color:#fff}.bottomnav{position:absolute;left:20px;right:20px;bottom:12px;height:64px;border-radius:24px;background:rgba(255,255,255,.96);border:1px solid rgba(229,232,235,.8);box-shadow:0 8px 24px rgba(20,28,45,.08);display:flex;align-items:center;justify-content:space-around}.navitem{font-size:11px;color:var(--grey500);font-weight:850}.navitem.active{color:var(--blue600)}.photo-accent .photo-band{display:block}.compact-utility .body{padding-left:16px;padding-right:16px}.compact-utility .section{margin-top:22px}.compact-utility .card{padding:14px;border-radius:15px}.compact-utility .row{min-height:46px}.compact-utility .hero-title{font-size:24px}.compact-utility .sport-card{min-height:74px;border-radius:15px}.rounded-community .card,.rounded-community .sport-card,.rounded-community .metric{border-radius:24px;background:#fff}.rounded-community .notice{border-radius:22px}.rounded-community .chip{border-radius:18px}.rounded-community .btn{border-radius:18px}.community-hero{padding:4px 0 2px}.community-strip{display:grid;gap:12px;margin-top:20px}.community-block{background:#fff;border:1px solid var(--grey100);border-radius:28px;box-shadow:var(--shadow-1);padding:18px}.community-block.tight{padding:16px}.community-block.blue{background:linear-gradient(180deg,#fff,var(--blue50));border-color:var(--blue100)}.community-title{font-size:15px;font-weight:950;line-height:1.35}.community-sub{font-size:12px;color:var(--grey500);line-height:1.45;margin-top:5px}.community-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px}.community-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.community-pill{min-height:30px;border-radius:15px;background:var(--grey100);color:var(--grey700);font-size:12px;font-weight:850;display:inline-flex;align-items:center;padding:0 10px}.community-pill.blue{background:var(--blue500);color:#fff}.community-rail{display:grid;grid-template-columns:1fr 1fr;gap:10px}.rounded-community .community-actions{grid-template-columns:1fr 1fr;margin-top:20px}.rounded-community .community-actions .btn{min-height:46px}.rounded-community .community-actions .btn:first-child{grid-column:1/-1}.rounded-community .row{border-bottom:0}.rounded-community .row+.row{margin-top:10px;padding-top:10px;border-top:1px solid var(--grey100)}`;
}

const top = (title, right = '') => `<header class="topbar"><div class="back">‹</div><div class="top-title">${title}</div>${right ? `<div class="top-link">${right}</div>` : '<div style="width:34px"></div>'}</header>`;
const section = (title, body, action = '') => `<section class="section"><div class="section-head"><h2>${title}</h2>${action ? `<span class="link">${action}</span>` : ''}</div>${body}</section>`;
const row = (title, sub = '', trailing = '') => `<div class="row"><div class="row-main"><div class="row-title">${title}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>${trailing}</div>`;
const nav = (active = '홈') => `<nav class="bottomnav">${['홈', '매치', '팀', '대회', '마이'].map((item) => `<div class="navitem ${item === active ? 'active' : ''}">${item}</div>`).join('')}</nav>`;
const sportChips = () => `<div class="chips">${sports.map((name, index) => `<div class="chip ${index < 3 ? 'selected' : ''}"><i class="dot"></i>${name}</div>`).join('')}</div>`;

function landing(v) {
  if (v.key === 'd') {
    return `<div class="screen landing ${v.tone}"><header class="topbar"><div class="brand">${locks.brand}</div><div class="top-link">로그인</div></header><main class="body">
      <div class="community-hero"><div class="eyebrow">근처 스포츠를 한곳에서</div><h1 class="hero-title">오늘 같이 뛸 사람과 팀을 바로 찾아요</h1><p class="sub">매치, 팀, 대회를 한 화면에서 훑고 내 종목으로 시작합니다.</p></div>
      <div class="cta-stack community-actions"><button class="btn">시작하기</button><button class="btn secondary">로그인</button><button class="btn text">매치 둘러보기</button></div>
      <section class="section"><div class="section-head"><h2>지금 가까운 활동</h2></div><div class="community-rail"><div class="community-block blue"><div class="community-title">근처 매치 18개</div><div class="community-sub">오늘 바로 뛸 수 있는 일정</div></div><div class="community-block"><div class="community-title">모집 중 팀 7개</div><div class="community-sub">종목별로 가입 가능한 팀</div></div><div class="community-block"><div class="community-title">이번 주 대회 3개</div><div class="community-sub">접수 중인 일정만 요약</div></div><div class="community-block"><div class="community-title">게스트 탐색</div><div class="community-sub">신청 전까지 둘러보기 가능</div></div></div></section>
      <section class="section"><div class="section-head"><h2>바로 할 수 있는 일</h2></div><div class="community-strip"><div class="community-block tight"><div class="community-title">매치 찾기</div><div class="community-sub">오늘 19:00 · 마포 풋살 · 3자리</div><div class="community-meta"><span class="badge blue">모집중</span><span class="link">보기</span></div></div><div class="community-block tight"><div class="community-title">팀 둘러보기</div><div class="community-sub">농구, 배드민턴, 러닝 팀 추천</div><div class="community-meta"><span class="badge green">추천</span><span class="link">보기</span></div></div><div class="community-block tight"><div class="community-title">대회 확인</div><div class="community-sub">이번 주 접수 중인 일정만 정리</div><div class="community-meta"><span class="badge">요약</span><span class="link">보기</span></div></div></div></section>
      ${section('지원 종목', sportChips())}
      <section class="section"><div class="section-head"><h2>진입 상태</h2></div><div class="community-block"><div class="community-pills"><span class="community-pill blue">로그인 전 둘러보기</span><span class="community-pill">위치 권한 선택</span><span class="community-pill">대회 균형 노출</span></div><p class="community-sub">신청 전에는 로그인 안내를 보여주고, 위치를 허용하면 가까운 매치를 먼저 보여줘요.</p></div></section>
    </main>${nav('홈')}</div>`;
  }
  return `<div class="screen landing ${v.tone}"><header class="topbar"><div class="brand">${locks.brand}</div><div class="top-link">로그인</div></header><main class="body">
    <div class="eyebrow">근처 스포츠를 한곳에서</div><h1 class="hero-title">오늘 같이 뛸 사람과 팀을 바로 찾아요</h1><p class="sub">매치, 팀, 대회를 한 화면에서 훑고 내 종목으로 시작합니다.</p>
    <div class="cta-stack"><button class="btn">시작하기</button><button class="btn secondary">로그인</button><button class="btn text">매치 둘러보기</button></div>
    <div class="photo-band"><img src="${photos.futsal}" alt=""><div class="photo-label">마포 주변 풋살과 농구 매치가 열려 있어요</div></div>
    ${section('지금 가까운 활동', `<div class="summary-grid"><div class="metric"><strong>18개</strong><span>근처 매치</span></div><div class="metric"><strong>7개</strong><span>모집 중 팀</span></div><div class="metric"><strong>3개</strong><span>이번 주 대회</span></div></div>`)}
    ${section('바로 할 수 있는 일', `<div class="card">${row('매치 찾기','오늘 19:00 · 마포 풋살 · 3자리','<span class="badge blue">모집중</span>')}${row('팀 둘러보기','농구, 배드민턴, 러닝 팀 추천','<span class="link">보기</span>')}${row('대회 확인','이번 주 접수 중인 일정만 정리','<span class="badge">요약</span>')}</div>`)}
    ${section('지원 종목', sportChips())}
    ${section('진입 상태', `<div class="card">${row('로그인 전 둘러보기','신청 전에는 로그인 안내를 보여줘요','<span class="badge green">가능</span>')}${row('위치 권한','허용하면 가까운 매치를 먼저 보여줘요','<span class="badge orange">선택</span>')}${row('대회 과집중 방지','대회는 매치, 팀과 같은 위계로 노출','<span class="badge">균형</span>')}</div>`)}
  </main>${nav('홈')}</div>`;
}

function login(v) {
  if (v.key === 'd') {
    return `<div class="screen ${v.tone}">${top('로그인', '')}<main class="body">
      <div class="community-hero"><div class="eyebrow">리다이렉트 유지</div><h1 class="hero-title">${locks.loginRedirectNotice}</h1><p class="sub">마포 풋살 매치 신청 화면을 유지하고 로그인 후 이어서 진행합니다.</p></div>
      <section class="section"><div class="section-head"><h2>로그인 방법</h2></div><div class="community-strip"><div class="community-block blue"><div class="community-title">카카오로 계속하기</div><div class="community-sub">가장 빠른 로그인 방식</div><div class="community-meta"><span class="badge blue">추천</span><span class="link">진행</span></div></div><div class="community-rail"><div class="community-block tight"><div class="community-title">이메일로 로그인</div><div class="community-sub">입력 상태에서 바로 진행</div></div><div class="community-block tight"><div class="community-title">로그인 없이 둘러보기</div><div class="community-sub">신청, 채팅, 팀 생성 제한</div></div></div></div></section>
      <section class="section"><div class="section-head"><h2>이메일 로그인</h2></div><div class="community-block"><div class="field">가입한 이메일</div><div class="field">비밀번호</div><div class="cta-stack"><button class="btn">이메일로 로그인</button><button class="btn text">비밀번호 재설정</button></div></div></section>
      <section class="section"><div class="section-head"><h2>오류와 복구</h2></div><div class="notice error">이메일 또는 비밀번호를 확인해 주세요. 계속 실패하면 재설정 링크를 받을 수 있어요.</div><div class="community-strip"><div class="community-block tight"><div class="community-title">재설정 링크 받기</div><div class="community-sub">가입한 이메일로 안내를 보내요</div><div class="community-meta"><span class="badge">복구</span><span class="link">받기</span></div></div><div class="community-block tight"><div class="community-title">리다이렉트 유지</div><div class="community-sub">로그인 후 마포 풋살 매치 신청으로 이동</div><div class="community-meta"><span class="badge green">유지</span></div></div></div></section>
      <p class="sub" style="margin-top:26px">계속하면 서비스 이용약관과 개인정보 처리방침에 동의한 것으로 봅니다.</p>
    </main></div>`;
  }
  return `<div class="screen ${v.tone}">${top('로그인', '')}<main class="body">
    <div class="eyebrow">계속하려면 로그인</div><h1 class="hero-title">${locks.loginRedirectNotice}</h1><p class="sub">마포 풋살 매치 신청 화면을 유지하고 로그인 후 이어서 진행합니다.</p>
    <div class="photo-band"><img src="${photos.huddle}" alt=""><div class="photo-label">팀 초대와 매치 신청을 같은 계정에 저장해요</div></div>
    ${section('로그인 방법', `<div class="card">${row('카카오로 계속하기','가장 빠른 로그인 방식','<span class="badge blue">추천</span>')}${row('이메일로 로그인','아래 입력 상태에서 바로 진행','<span class="link">선택됨</span>')}${row('로그인 없이 둘러보기','신청, 채팅, 팀 생성은 제한돼요','<span class="badge">게스트</span>')}</div>`)}
    ${section('이메일 로그인', `<div class="card"><div class="field">가입한 이메일</div><div class="field">비밀번호</div><button class="btn">이메일로 로그인</button><button class="btn text">비밀번호 재설정</button></div>`)}
    ${section('오류와 복구', `<div class="notice error">이메일 또는 비밀번호를 확인해 주세요. 계속 실패하면 재설정 링크를 받을 수 있어요.</div><div style="height:10px"></div><div class="card">${row('재설정 링크 받기','가입한 이메일로 안내를 보내요','<span class="link">받기</span>')}${row('리다이렉트 유지','로그인 후 마포 풋살 매치 신청으로 이동','<span class="badge green">유지</span>')}</div>`)}
    <p class="sub" style="margin-top:26px">계속하면 서비스 이용약관과 개인정보 처리방침에 동의한 것으로 봅니다.</p>
  </main></div>`;
}

function onboarding(v) {
  const metas = ['오늘 매치 8개', '팀 모집 4개', '클럽 추천 6개', '주간 모임 5개', '레슨과 매치', '동호회와 경기'];
  return `<div class="screen ${v.tone}">${top('관심 종목', '1/3')}<main class="body">
    <div class="eyebrow">${locks.onboardingHelper}</div><h1 class="hero-title">함께 하고 싶은 종목을 선택해 주세요</h1><p class="sub">선택한 종목으로 매치, 팀, 대회 추천을 먼저 보여드립니다.</p>
    <div class="photo-band"><img src="${photos.court}" alt=""><div class="photo-label">선택한 종목 기준으로 홈 피드를 구성해요</div></div>
    ${section('선택 현황', `<div class="notice">3개 선택 · 풋살, 농구, 배드민턴</div>`)}
    ${section('종목 선택', `<div class="sport-grid">${sports.map((name, index) => `<div class="sport-card ${index < 3 ? 'selected' : ''}"><div class="check">${index < 3 ? '선' : ''}</div><div><div class="sport-name">${name}</div><div class="sport-meta">${metas[index]}</div></div></div>`).join('')}</div>`)}
    ${section('다음 단계 안내', `<div class="card">${row('선택 없을 때','다음을 누르면 종목을 먼저 선택하라고 안내','<span class="badge orange">안내</span>')}${row('선택 후 다음','레벨 설정으로 이동','<span class="badge green">가능</span>')}${row('추천 기준','선택한 종목으로 홈과 알림을 정리','<span class="badge blue">적용</span>')}</div>`)}
    <div class="cta-stack"><button class="btn">다음</button><button class="btn text">나중에 설정하기</button></div>
  </main></div>`;
}

const screens = [
  { id: 'B1-01', slug: 'landing', title: '랜딩', render: landing },
  { id: 'B1-02', slug: 'login', title: '로그인', render: login },
  { id: 'B1-05', slug: 'onboarding-sport', title: '관심 종목', render: onboarding },
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
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${screen.id}</title><style>${css()}</style></head><body>${screen.render(variant)}</body></html>`;
}

const pngData = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

function sheetHtml(items) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>body{margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.sheet{width:930px;padding:18px;display:grid;grid-template-columns:repeat(4,210px);gap:28px 18px}.label{height:32px;font-size:12px;color:#191f28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}img{width:210px;height:420px;object-fit:contain;object-position:top center;display:block;background:#fff}</style></head><body><main class="sheet">${items.map((item) => `<section><div class="label">${item.label}</div><img src="${item.src}" alt=""></section>`).join('')}</main></body></html>`;
}

async function renderSheet(browser) {
  const page = await browser.newPage({ viewport: { width: 980, height: 1420 }, deviceScaleFactor: 1 });
  const items = screens.flatMap((screen) => variants.map((variant) => {
    const name = outputName(screen, variant);
    return { label: `${screen.title} ${variant.label}`, src: pngData(path.join(OUT, name)) };
  }));
  await page.setContent(sheetHtml(items), { waitUntil: 'load' });
  await page.screenshot({ path: path.join(EVIDENCE, 'p1a-entry-contact-sheet-v22.png'), fullPage: true });
  await page.close();
}

clearOwnedPngs();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
for (const screen of screens) {
  for (const variant of variants) {
    await page.setContent(html(screen, variant), { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(OUT, outputName(screen, variant)), fullPage: true });
  }
}
await page.close();
await renderSheet(browser);
await browser.close();
console.log(`rendered ${screens.length * variants.length} png files`);
console.log(path.join(EVIDENCE, 'p1a-entry-contact-sheet-v22.png'));
