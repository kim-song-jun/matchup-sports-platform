import { badge, renderBatch, row, section, top } from './teameet_v22_mockup_utils.mjs';

const cta = (main, sub = '이전') => `<div class="cta"><span>${sub}</span><button>${main}</button></div>`;
const field = (label, value) => `<label class="field"><span>${label}</span><div>${value}</div></label>`;

function sport(v) {
  return `<div class="screen ${v.tone}">${top('팀매치 만들기')}<main>
    <section class="intro">${badge('2/5단계', 'blue')}<h1>팀 성격에 맞는 종목을 선택하세요</h1><p>팀의 대표 종목과 다른 종목도 열 수 있지만 참가자에게 명확히 보여줘야 해요.</p></section>
    ${section('종목 선택', `<div class="chips">${['풋살','축구','농구','러닝','배드민턴'].map((x, i) => badge(x, i === 0 ? 'blue' : '')).join('')}</div>`)}
    ${section('팀 종목과의 관계', [row('레드 FC 대표 종목', '풋살 · 축구', { trail: badge('일치', 'green') }), row('다른 종목 개최', '참가 조건에 별도 안내 필요', { trail: '가능' })].join(''))}
    ${section('참가자에게 보이는 설명', `${field('종목 안내', '풋살 5:5 · 실내구장 · 풋살화 권장')}`)}
    ${cta('다음')}
  </main></div>`;
}

function placeTime(v) {
  return `<div class="screen ${v.tone}">${top('장소와 시간')}<main>
    <section class="intro">${badge('3/5단계', 'blue')}<h1>상대팀이 결정하기 쉬운 조건을 적어요</h1><p>장소, 일정, 비용이 명확할수록 신청 전환이 좋아집니다.</p></section>
    ${section('장소/일정', `${field('장소', '서울 디풋살파크 A코트')}${field('날짜', '7월 12일 일요일')}${field('시간', '18:00 · 90분')}${field('팀당 비용', '60,000원')}`)}
    ${section('예약 상태', [row('구장 예약', '예약 확정 전 · 직접 확인 필요', { trail: badge('확인', 'orange') }), row('우천/취소 기준', '실내구장 · 당일 취소 제한', { trail: '안내' })].join(''))}
    ${section('저장 상태', `<div class="notice">장소와 시간은 상대팀 신청 전에 수정할 수 있어요.</div>${cta('다음')}`)}
  </main></div>`;
}

function detailEdit(v) {
  return `<div class="screen ${v.tone}">${top('팀매치 상세', '편집')}<main>
    <section class="intro">${badge('모집중', 'blue')}<h1>레드 FC vs 상대팀 모집</h1><p>풋살 · 7월 12일 18:00 · 서울 디풋살파크</p></section>
    ${section('신청 현황', [row('상대팀 신청', '2팀 대기 · 1팀 검토중', { trail: badge('검토', 'orange') }), row('내 팀 로스터', '8/10명 확정', { trail: '관리' }), row('채팅방', '상대팀 확정 후 자동 생성', { trail: '대기' })].join(''))}
    ${section('조건', [row('실력 범위', '초급-중급'), row('유니폼', '파란색 상의'), row('비용', '팀당 60,000원')].join(''))}
    ${section('편집/취소', `<div class="danger"><b>상대팀 확정 전까지만 주요 조건을 바꿀 수 있어요</b><p>확정 이후 변경은 상대팀에게 알림과 재확인이 필요합니다.</p></div>${cta('신청팀 보기', '취소 요청')}`)}
  </main></div>`;
}

const screens = [
  { id: 'B3-02', slug: 'team-match-sport', title: '팀매치 종목', render: sport },
  { id: 'B3-03', slug: 'team-match-place-time', title: '팀매치 장소/시간', render: placeTime },
  { id: 'B3-06', slug: 'team-match-detail-edit', title: '팀매치 상세/편집', render: detailEdit },
];

const css = `:root{--blue:#3182f6;--b50:#eaf3ff;--green:#03b26c;--g50:#e9f9ef;--orange:#f59f00;--o50:#fff4e6;--red:#f04452;--r50:#fff1f2;--bg:#f9fafb;--g100:#f2f4f6;--g200:#e5e8eb;--g500:#8b95a1;--g700:#4e5968;--g900:#191f28}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--g900);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.screen{width:390px;min-height:1180px;margin:0 auto;background:var(--bg);overflow:hidden}.top{height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.97);border-bottom:1px solid var(--g100);position:sticky;top:0;z-index:2}.top button{border:0;background:transparent;color:var(--g700);font-size:12px;font-weight:800}.top strong{font-size:16px}main{padding:18px 20px 44px}.intro h1{margin:10px 0 0;font-size:25px;line-height:1.22}.intro p,.notice{margin:8px 0 0;color:var(--g500);font-size:13px;line-height:1.5}.section{margin-top:22px}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.head h2{margin:0;font-size:15px}.head span{font-size:12px;color:var(--blue);font-weight:900}.group{background:white;border:1px solid var(--g100);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}.row{min-height:58px;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--g100)}.row:last-child{border-bottom:0}.main{min-width:0}.row strong{font-size:14px}.row p{margin:5px 0 0;color:var(--g500);font-size:12px;line-height:1.35}.trail{font-size:12px;color:var(--blue);font-weight:900;white-space:nowrap}.badge{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:var(--g100);color:var(--g700);font-size:11px;font-weight:900}.badge.blue{background:var(--b50);color:var(--blue)}.badge.green{background:var(--g50);color:var(--green)}.badge.orange{background:var(--o50);color:var(--orange)}.chips{padding:13px;display:flex;flex-wrap:wrap;gap:8px}.field{display:block;padding:13px 14px;border-bottom:1px solid var(--g100)}.field:last-child{border-bottom:0}.field span{font-size:13px;font-weight:900}.field div{margin-top:8px;min-height:42px;border:1px solid var(--g200);border-radius:13px;padding:11px 12px;background:white;font-size:14px}.notice,.danger{padding:16px}.danger{background:var(--r50);color:var(--red)}.danger b{font-size:15px}.danger p{margin:8px 0 0;color:var(--g500);font-size:12px;line-height:1.45}.cta{margin-top:18px;display:grid;grid-template-columns:1fr 2fr;gap:8px}.cta span,.cta button{height:48px;border-radius:15px;display:grid;place-items:center;font-size:15px;font-weight:900}.cta span{background:white;border:1px solid var(--g200);color:var(--g700)}.cta button{border:0;background:var(--blue);color:white}.focus .intro{padding:16px;border-radius:22px;background:white;border:1px solid var(--g100)}.compact main{padding-left:16px;padding-right:16px}.compact .section{margin-top:16px}.compact .row{min-height:50px}.compact .group{border-radius:15px}.round .group,.round .focus .intro{border-radius:24px}.round .badge{border-radius:13px}`;

await renderBatch({
  screens,
  prefixes: ['b3-02-', 'b3-03-', 'b3-06-'],
  css,
  contactName: 'p5a-team-match-remaining-contact-sheet-v22.png',
  verificationName: 'teameet-v22-p5a-team-match-remaining-verification.md',
  summary: '# Teameet v22 P5A Team Match Remaining Verification\n\n- B3-02 sport selection\n- B3-03 place/time\n- B3-06 detail/edit',
});
