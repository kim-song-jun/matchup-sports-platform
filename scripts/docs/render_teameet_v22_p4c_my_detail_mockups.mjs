import { badge, renderBatch, row, section, top } from './teameet_v22_mockup_utils.mjs';

const cta = (main, sub = '취소') => `<div class="cta"><span>${sub}</span><button>${main}</button></div>`;
const field = (label, value) => `<label class="field"><span>${label}</span><div>${value}</div></label>`;

function profile(v) {
  return `<div class="screen ${v.tone}">${top('프로필 편집', '저장')}<main>
    <section class="intro">${badge('공개 프로필', 'blue')}<h1>매치와 팀에서 보이는 정보를 정리해요</h1><p>사진, 지역, 종목은 신청 전환과 신뢰 신호에 영향을 줍니다.</p></section>
    ${section('기본 정보', `${field('닉네임', '정민')}${field('활동 지역', '강남구 · 서초구')}${field('소개', '평일 저녁 풋살과 주말 러닝을 즐겨요.')}`)}
    ${section('관심 종목', `<div class="chips">${['풋살','축구','러닝','배드민턴'].map((x, i) => badge(x, i < 2 ? 'blue' : '')).join('')}</div>`)}
    ${section('저장 전 확인', [row('본인 인증', '완료 · 변경 불가', { trail: badge('verified', 'green') }), row('프로필 공개', '팀장과 참가자가 확인 가능', { trail: '켜짐' })].join(''))}
    ${cta('저장하기')}
  </main></div>`;
}

function myMatches(v) {
  return `<div class="screen ${v.tone}">${top('내 매치', '필터')}<main>
    <section class="intro">${badge('참여/개설', 'blue')}<h1>내가 만든 매치와 참가한 매치</h1><p>상태별로 빠르게 확인하고 상세로 이동합니다.</p></section>
    <div class="tabs"><span class="on">참가</span><span>개설</span><span>완료</span></div>
    ${section('오늘', [row('한강 풋살 매치', '확정 · 오늘 19:00 · 서울 디풋살파크', { trail: badge('확정', 'green') }), row('성수 러닝 번개', '대기 · 4/8명 · 내일 07:00', { trail: badge('대기', 'orange') })].join(''))}
    ${section('내가 만든 매치', [row('주말 농구 매치', '모집중 · 6/10명 · 신청자 2명', { trail: '관리' }), row('목요 풋살', '임시저장 · 장소 미입력', { trail: '수정' })].join(''))}
    ${section('빈 상태', `<div class="empty"><b>완료된 매치가 아직 없어요</b><p>경기가 끝나면 후기와 기록을 여기서 확인할 수 있어요.</p></div>`)}
  </main></div>`;
}

function reviewWrite(v) {
  return `<div class="screen ${v.tone}">${top('후기 작성')}<main>
    <section class="intro">${badge('상호 후기', 'green')}<h1>오늘의 경험을 남겨주세요</h1><p>검증된 매치에 대한 후기만 매너 신호에 반영됩니다.</p></section>
    ${section('대상', [row('한강 풋살 매치', '오늘 19:00 · 참가자 8명', { trail: '상세' }), row('김지훈', '같은 팀 · 매너 평가 대상', { trail: badge('대상', 'blue') })].join(''))}
    ${section('매너 평가', `<div class="rating"><b>4.8</b><p>시간 약속, 팀워크, 페어플레이를 기준으로 평가해요.</p></div><div class="chips">${['시간 약속 좋음','패스가 정확함','팀워크 좋음'].map((x) => badge(x, 'blue')).join('')}</div>`)}
    ${section('한 줄 후기', `${field('코멘트', '약속을 잘 지키고 경기 흐름을 잘 맞춰줬어요.')}`)}
    ${cta('후기 제출', '임시저장')}
  </main></div>`;
}

function settingsDetail(v) {
  return `<div class="screen ${v.tone}">${top('설정 상세', '저장')}<main>
    <section class="intro">${badge('개인화', 'blue')}<h1>추천과 알림을 내 방식대로</h1><p>지역, 알림, 관심 종목을 세부 화면에서 조정합니다.</p></section>
    ${section('지역 설정', [row('강남구', '주 활동 지역', { trail: badge('대표', 'blue') }), row('서초구', '보조 활동 지역', { trail: '삭제' }), row('현재 위치 사용', '권한 확인 필요', { trail: badge('확인', 'orange') })].join(''))}
    ${section('알림 설정', [row('참가 확정/취소', '푸시와 알림센터', { trail: badge('켜짐', 'green') }), row('팀 초대', '푸시만 수신', { trail: '변경' }), row('마케팅 알림', '수신하지 않음', { trail: '꺼짐' })].join(''))}
    ${section('관심 종목', `<div class="chips">${['풋살','축구','러닝','수영'].map((x, i) => badge(x, i < 3 ? 'blue' : '')).join('')}</div>`)}
    ${cta('저장하기')}
  </main></div>`;
}

function legalWithdrawal(v) {
  return `<div class="screen ${v.tone}">${top('계정과 약관')}<main>
    <section class="intro">${badge('중요', 'orange')}<h1>계정 변경 전 확인이 필요해요</h1><p>진행 중인 예약, 분쟁, 정산이 있으면 탈퇴할 수 없습니다.</p></section>
    ${section('약관', [row('서비스 이용약관', 'v2026.04 · 필수', { trail: '보기' }), row('개인정보 처리방침', 'v2026.04 · 최신', { trail: '보기' }), row('마케팅 수신 동의', '선택 · 미동의', { trail: '변경' })].join(''))}
    ${section('탈퇴 가능 여부', [row('진행 중인 매치', '오늘 19:00 확정 1건', { trail: badge('차단', 'orange') }), row('작성할 후기', '2건 · 탈퇴 전 선택 가능', { trail: '관리' }), row('정산/분쟁', '없음', { trail: badge('정상', 'green') })].join(''))}
    ${section('탈퇴 확인', `<div class="danger"><b>아직 탈퇴할 수 없어요</b><p>진행 중인 매치가 종료된 뒤 다시 시도해 주세요.</p></div>${cta('매치 확인', '취소')}`)}
  </main></div>`;
}

const screens = [
  { id: 'B5-02', slug: 'profile-edit', title: '프로필 편집', render: profile },
  { id: 'B5-03', slug: 'my-matches', title: '내 매치 목록', render: myMatches },
  { id: 'B5-05', slug: 'review-write', title: '후기 작성', render: reviewWrite },
  { id: 'B5-07', slug: 'settings-detail', title: '설정 상세', render: settingsDetail },
  { id: 'B5-08', slug: 'legal-withdrawal', title: '법적/탈퇴', render: legalWithdrawal },
];

const css = `:root{--blue:#3182f6;--b50:#eaf3ff;--green:#03b26c;--g50:#e9f9ef;--orange:#f59f00;--o50:#fff4e6;--red:#f04452;--r50:#fff1f2;--bg:#f9fafb;--g100:#f2f4f6;--g200:#e5e8eb;--g500:#8b95a1;--g700:#4e5968;--g900:#191f28}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--g900);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.screen{width:390px;min-height:1180px;margin:0 auto;background:var(--bg);overflow:hidden}.top{height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.97);border-bottom:1px solid var(--g100);position:sticky;top:0;z-index:2}.top button{border:0;background:transparent;color:var(--g700);font-size:12px;font-weight:800}.top strong{font-size:16px}main{padding:18px 20px 44px}.intro h1{margin:10px 0 0;font-size:24px;line-height:1.22;letter-spacing:0}.intro p{margin:8px 0 0;color:var(--g500);font-size:13px;line-height:1.5}.section{margin-top:22px}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.head h2{margin:0;font-size:15px}.head span{font-size:12px;color:var(--blue);font-weight:900}.group{background:white;border:1px solid var(--g100);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}.row{min-height:58px;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--g100)}.row:last-child{border-bottom:0}.main{min-width:0}.row strong{display:block;font-size:14px;line-height:1.25}.row p{margin:5px 0 0;color:var(--g500);font-size:12px;line-height:1.35}.trail{font-size:12px;color:var(--blue);font-weight:900;white-space:nowrap}.badge{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:var(--g100);color:var(--g700);font-size:11px;font-weight:900}.badge.blue{background:var(--b50);color:var(--blue)}.badge.green{background:var(--g50);color:var(--green)}.badge.orange{background:var(--o50);color:var(--orange)}.chips{padding:13px;display:flex;flex-wrap:wrap;gap:8px}.field{display:block;padding:13px 14px;border-bottom:1px solid var(--g100)}.field:last-child{border-bottom:0}.field span{display:block;font-size:13px;font-weight:900}.field div{margin-top:8px;min-height:42px;border:1px solid var(--g200);border-radius:13px;padding:11px 12px;background:white;font-size:14px}.tabs{display:flex;gap:8px;margin-top:16px}.tabs span{height:34px;padding:0 12px;border-radius:999px;background:white;border:1px solid var(--g100);display:flex;align-items:center;font-size:12px;font-weight:900;color:var(--g700)}.tabs .on{background:var(--blue);border-color:var(--blue);color:white}.empty,.rating,.danger{padding:18px}.empty b,.danger b{font-size:15px}.empty p,.rating p,.danger p{margin:8px 0 0;color:var(--g500);font-size:12px;line-height:1.45}.rating b{font-size:32px;color:var(--blue)}.danger{background:var(--r50);color:var(--red)}.cta{margin-top:18px;display:grid;grid-template-columns:1fr 2fr;gap:8px}.cta span,.cta button{height:48px;border-radius:15px;display:grid;place-items:center;font-size:15px;font-weight:900}.cta span{background:white;border:1px solid var(--g200);color:var(--g700)}.cta button{border:0;background:var(--blue);color:white}.focus .intro{padding:16px;border-radius:22px;background:white;border:1px solid var(--g100)}.compact main{padding-left:16px;padding-right:16px}.compact .section{margin-top:16px}.compact .row{min-height:50px}.compact .group{border-radius:15px}.round .group,.round .focus .intro{border-radius:24px}.round .badge{border-radius:13px}`;

await renderBatch({
  screens,
  prefixes: ['b5-02-', 'b5-03-', 'b5-05-', 'b5-07-', 'b5-08-'],
  css,
  contactName: 'p4c-my-detail-contact-sheet-v22.png',
  verificationName: 'teameet-v22-p4c-my-detail-verification.md',
  summary: '# Teameet v22 P4C My Detail Verification\n\n- B5-02 profile edit\n- B5-03 my match list\n- B5-05 review write\n- B5-07 settings detail\n- B5-08 legal / withdrawal',
});
