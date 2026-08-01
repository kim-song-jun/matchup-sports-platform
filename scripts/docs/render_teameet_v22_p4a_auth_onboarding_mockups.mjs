import { badge, renderBatch, row, section, top } from './teameet_v22_mockup_utils.mjs';

const nav = () => `<div class="progress"><i></i><i></i><i></i><i></i></div>`;
const field = (label, value, note = '') => `<label class="field"><span>${label}</span><div>${value}</div>${note ? `<small>${note}</small>` : ''}</label>`;
const cta = (main, sub = '이전') => `<div class="cta"><span>${sub}</span><button>${main}</button></div>`;

function signup(v) {
  return `<div class="screen ${v.tone}">${top('회원가입')}<main>${nav()}
    <section class="intro">${badge('1/3단계', 'blue')}<h1>팀과 매치를 위해 필요한 정보만 받아요</h1><p>약관 동의 후 관심 종목과 지역을 이어서 설정합니다.</p></section>
    ${section('약관 동의', [row('서비스 이용약관', '필수 · v2026.04', { trail: badge('동의', 'green') }), row('개인정보 처리방침', '필수 · v2026.04', { trail: badge('동의', 'green') }), row('마케팅 수신 동의', '선택 · 미동의', { trail: '변경' })].join(''))}
    ${section('가입 방식', [row('카카오로 계속하기', '기존 계정이 있으면 자동 연결', { trail: '연결' }), row('이메일로 가입', '이메일 인증 후 시작', { trail: '입력' })].join(''))}
    ${section('완료 상태', `<div class="done"><b>가입이 완료됐어요</b><p>이제 관심 종목과 활동 지역을 설정하면 추천이 정확해져요.</p></div>${cta('온보딩 시작', '로그인으로')}`)}
  </main></div>`;
}

function recovery(v) {
  return `<div class="screen ${v.tone}">${top('인증 복구', '도움')}<main>
    <section class="intro">${badge('복구 필요', 'orange')}<h1>로그인을 이어갈 수 없어요</h1><p>소셜 인증이 중단됐거나 다른 계정과 연결된 상태예요.</p></section>
    ${section('문제 원인', [row('카카오 연결 만료', '다시 인증하면 기존 정보가 유지돼요', { trail: badge('재시도', 'blue') }), row('다른 계정으로 가입됨', '이메일을 확인하고 계정을 선택해요', { trail: '계정 선택' }), row('권한 거부됨', '필수 권한만 다시 요청합니다', { trail: '다시 요청' })].join(''))}
    ${section('지원 경로', [row('고객지원 연결', '가입 이메일과 휴대폰 끝자리로 확인', { trail: '문의' }), row('홈으로 돌아가기', '게스트로 매치를 둘러볼 수 있어요', { trail: '이동' })].join(''))}
    ${section('오류 메시지', `<div class="error"><b>인증 응답이 만료됐어요</b><p>보안을 위해 10분이 지나면 다시 인증해야 합니다.</p></div>${cta('다시 시도', '다른 계정')}`)}
  </main></div>`;
}

function levelRegion(v) {
  return `<div class="screen ${v.tone}">${top('온보딩')}<main>${nav()}
    <section class="intro">${badge('2/3단계', 'blue')}<h1>종목별 실력과 활동 지역을 알려주세요</h1><p>처음부터 정확할 필요는 없고 언제든 바꿀 수 있어요.</p></section>
    ${section('실력 범위', `<div class="chips">${['입문','초급','중급','상급'].map((x, i) => badge(x, i === 1 ? 'blue' : '')).join('')}</div>`)}
    ${section('활동 지역', [row('강남구 · 서초구', '근처 매치 추천에 사용', { trail: '변경' }), row('위치 권한', '주변 매치를 빠르게 찾기 위해 사용', { trail: badge('확인 필요', 'orange') })].join(''))}
    ${section('추천 미리보기', [row('오늘 가능한 풋살 매치', '강남 2km · 6/10명', { trail: badge('추천', 'green') }), row('성수 위너스 FC', '초급 환영 · 응답률 92%', { trail: '보기' })].join(''))}
    ${cta('다음')}
  </main></div>`;
}

function confirm(v) {
  return `<div class="screen ${v.tone}">${top('온보딩 확인')}<main>${nav()}
    <section class="intro">${badge('3/3단계', 'green')}<h1>이 설정으로 시작할까요?</h1><p>종목, 지역, 알림 설정을 확인하고 홈으로 이동합니다.</p></section>
    ${section('설정 요약', [row('관심 종목', '풋살 · 축구 · 러닝', { trail: '수정' }), row('실력 범위', '초급-중급', { trail: '수정' }), row('활동 지역', '강남구 · 서초구', { trail: '수정' }), row('알림', '확정/취소/초대 알림 켜짐', { trail: badge('켜짐', 'green') })].join(''))}
    ${section('이어하기 상태', `<div class="done"><b>중간에 나가도 이어서 할 수 있어요</b><p>다음 접속 시 마지막 단계부터 다시 보여줍니다.</p></div>`)}
    ${cta('Teameet 시작하기', '다시 설정')}
  </main></div>`;
}

const screens = [
  { id: 'B1-03', slug: 'signup-flow', title: '회원가입', render: signup },
  { id: 'B1-04', slug: 'auth-recovery', title: '인증 복구', render: recovery },
  { id: 'B1-06', slug: 'onboarding-level-region', title: '레벨/지역', render: levelRegion },
  { id: 'B1-07', slug: 'onboarding-confirm-resume', title: '온보딩 확인', render: confirm },
];

const css = `:root{--blue:#3182f6;--b50:#eaf3ff;--green:#03b26c;--g50:#e9f9ef;--orange:#f59f00;--o50:#fff4e6;--red:#f04452;--r50:#fff1f2;--bg:#f9fafb;--g100:#f2f4f6;--g200:#e5e8eb;--g500:#8b95a1;--g700:#4e5968;--g900:#191f28}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--g900);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.screen{width:390px;min-height:1180px;margin:0 auto;background:var(--bg);overflow:hidden}.top{height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.97);border-bottom:1px solid var(--g100);position:sticky;top:0;z-index:2}.top button{border:0;background:transparent;color:var(--g700);font-size:12px;font-weight:800}.top strong{font-size:16px}main{padding:18px 20px 44px}.progress{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:18px}.progress i{height:3px;border-radius:2px;background:var(--blue)}.intro h1{margin:10px 0 0;font-size:25px;line-height:1.22;letter-spacing:0}.intro p{margin:8px 0 0;color:var(--g500);font-size:13px;line-height:1.5}.section{margin-top:22px}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.head h2{margin:0;font-size:15px}.head span{font-size:12px;color:var(--blue);font-weight:900}.group{background:white;border:1px solid var(--g100);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}.row{min-height:58px;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--g100)}.row:last-child{border-bottom:0}.main{min-width:0}.row strong{display:block;font-size:14px;line-height:1.25}.row p{margin:5px 0 0;color:var(--g500);font-size:12px;line-height:1.35}.trail{font-size:12px;color:var(--blue);font-weight:900;white-space:nowrap}.badge{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:var(--g100);color:var(--g700);font-size:11px;font-weight:900}.badge.blue{background:var(--b50);color:var(--blue)}.badge.green{background:var(--g50);color:var(--green)}.badge.orange{background:var(--o50);color:var(--orange)}.done,.error{padding:18px;text-align:left}.done b,.error b{font-size:15px}.done p,.error p{margin:8px 0 0;color:var(--g500);font-size:12px;line-height:1.45}.error{background:var(--r50);color:var(--red)}.chips{padding:13px;display:flex;flex-wrap:wrap;gap:8px}.cta{margin-top:18px;display:grid;grid-template-columns:1fr 2fr;gap:8px}.cta span,.cta button{height:48px;border-radius:15px;display:grid;place-items:center;font-size:15px;font-weight:900}.cta span{background:white;border:1px solid var(--g200);color:var(--g700)}.cta button{border:0;background:var(--blue);color:white}.focus .intro{padding:16px;border-radius:22px;background:white;border:1px solid var(--g100)}.compact main{padding-left:16px;padding-right:16px}.compact .section{margin-top:16px}.compact .row{min-height:50px}.compact .group{border-radius:15px}.round .group,.round .focus .intro{border-radius:24px}.round .badge{border-radius:13px}`;

await renderBatch({
  screens,
  prefixes: ['b1-03-', 'b1-04-', 'b1-06-', 'b1-07-'],
  css,
  contactName: 'p4a-auth-onboarding-contact-sheet-v22.png',
  verificationName: 'teameet-v22-p4a-auth-onboarding-verification.md',
  summary: '# Teameet v22 P4A Auth / Onboarding Verification\n\n- B1-03 회원가입 flow\n- B1-04 auth recovery\n- B1-06 level/region onboarding\n- B1-07 confirm/resume onboarding',
});
