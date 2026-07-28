import { badge, renderBatch, row, section, top } from './teameet_v22_mockup_utils.mjs';

const cta = (main, sub = '취소') => `<div class="cta"><span>${sub}</span><button>${main}</button></div>`;
const field = (label, value) => `<label class="field"><span>${label}</span><div>${value}</div></label>`;

function members(v) {
  return `<div class="screen ${v.tone}">${top('팀 멤버')}<main>
    <section class="intro">${badge('18명', 'blue')}<h1>성수 위너스 FC 멤버</h1><p>공개 화면에서는 역할과 최근 활동 정도만 보여줍니다.</p></section>
    ${section('운영진', [row('김지훈', '팀장 · 최근 활동 오늘', { trail: badge('팀장', 'blue') }), row('이서연', '매니저 · 출석 관리', { trail: badge('운영', 'green') })].join(''))}
    ${section('멤버', [row('박민재', '골키퍼 · 최근 활동 2일 전'), row('정우성', '필드 · 최근 활동 4일 전'), row('신규 지원', '가입 대기 · 프로필 검토 필요', { trail: badge('대기', 'orange') })].join(''))}
    ${section('멤버 공개 기준', `<div class="notice">연락처와 개인 식별 정보는 공개하지 않고, 팀 활동에 필요한 정보만 표시합니다.</div>`)}
  </main></div>`;
}

function editTeam(v) {
  return `<div class="screen ${v.tone}">${top('팀 편집', '저장')}<main>
    <section class="intro">${badge('팀장 권한', 'blue')}<h1>팀을 찾는 사람들이 이해하기 쉽게</h1><p>대표 사진, 소개, 활동 지역은 가입 신청 전 가장 먼저 보는 정보예요.</p></section>
    ${section('기본 정보', `${field('팀 이름', '성수 위너스 FC')}${field('대표 종목', '풋살 · 축구')}${field('활동 지역', '성동구 · 광진구')}${field('팀 소개', '평일 저녁 성수와 왕십리에서 모이는 풋살 팀입니다.')}`)}
    ${section('공개 설정', [row('가입 신청', '팀장이 승인 후 합류', { trail: badge('켜짐', 'green') }), row('팀매치 신청', '상대팀 신청 허용', { trail: '허용' })].join(''))}
    ${section('저장 전 확인', `<div class="notice">대표 종목을 바꾸면 팀매치 추천에도 반영됩니다.</div>${cta('저장하기')}`)}
  </main></div>`;
}

function invitations(v) {
  return `<div class="screen ${v.tone}">${top('초대/멤버 관리')}<main>
    <section class="intro">${badge('관리', 'blue')}<h1>초대와 권한 변경을 한 곳에서</h1><p>초대 수락/거절, 역할 변경, 휴면 처리를 기록과 함께 남깁니다.</p></section>
    ${section('초대 대기', [row('민준', '초대 링크 열람 · 아직 미응답', { trail: badge('대기', 'orange') }), row('서연', '가입 신청 · 주 1회 가능', { trail: '검토' })].join(''))}
    ${section('권한 변경', [row('김지훈', '팀장 · 권한 변경 불가', { trail: badge('고정', 'green') }), row('이서연', '매니저 · 일정 관리 가능', { trail: '변경' }), row('박민재', '팀원 · 일반 권한', { trail: '변경' })].join(''))}
    ${section('처리 확인', `<div class="confirm"><b>서연님을 매니저로 지정할까요?</b><p>역할 변경은 팀 기록에 남고 본인에게 알림이 발송됩니다.</p></div>${cta('지정하기', '보류')}`)}
  </main></div>`;
}

const screens = [
  { id: 'B4-03', slug: 'team-members', title: '팀 멤버', render: members },
  { id: 'B4-04', slug: 'team-edit', title: '팀 편집', render: editTeam },
  { id: 'B4-06', slug: 'team-invitations-members', title: '초대/멤버 관리', render: invitations },
];

const css = `:root{--blue:#3182f6;--b50:#eaf3ff;--green:#03b26c;--g50:#e9f9ef;--orange:#f59f00;--o50:#fff4e6;--bg:#f9fafb;--g100:#f2f4f6;--g200:#e5e8eb;--g500:#8b95a1;--g700:#4e5968;--g900:#191f28}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--g900);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.screen{width:390px;min-height:1180px;margin:0 auto;background:var(--bg);overflow:hidden}.top{height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.97);border-bottom:1px solid var(--g100);position:sticky;top:0;z-index:2}.top button{border:0;background:transparent;color:var(--g700);font-size:12px;font-weight:800}.top strong{font-size:16px}main{padding:18px 20px 44px}.intro h1{margin:10px 0 0;font-size:25px;line-height:1.22}.intro p,.notice{margin:8px 0 0;color:var(--g500);font-size:13px;line-height:1.5}.section{margin-top:22px}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.head h2{margin:0;font-size:15px}.head span{font-size:12px;color:var(--blue);font-weight:900}.group{background:white;border:1px solid var(--g100);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}.row{min-height:58px;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--g100)}.row:last-child{border-bottom:0}.main{min-width:0}.row strong{font-size:14px}.row p{margin:5px 0 0;color:var(--g500);font-size:12px;line-height:1.35}.trail{font-size:12px;color:var(--blue);font-weight:900;white-space:nowrap}.badge{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:var(--g100);color:var(--g700);font-size:11px;font-weight:900}.badge.blue{background:var(--b50);color:var(--blue)}.badge.green{background:var(--g50);color:var(--green)}.badge.orange{background:var(--o50);color:var(--orange)}.field{display:block;padding:13px 14px;border-bottom:1px solid var(--g100)}.field:last-child{border-bottom:0}.field span{font-size:13px;font-weight:900}.field div{margin-top:8px;min-height:42px;border:1px solid var(--g200);border-radius:13px;padding:11px 12px;background:white;font-size:14px}.notice,.confirm{padding:16px}.confirm b{font-size:15px}.confirm p{margin:8px 0 0;color:var(--g500);font-size:12px;line-height:1.45}.cta{margin-top:18px;display:grid;grid-template-columns:1fr 2fr;gap:8px}.cta span,.cta button{height:48px;border-radius:15px;display:grid;place-items:center;font-size:15px;font-weight:900}.cta span{background:white;border:1px solid var(--g200);color:var(--g700)}.cta button{border:0;background:var(--blue);color:white}.focus .intro{padding:16px;border-radius:22px;background:white;border:1px solid var(--g100)}.compact main{padding-left:16px;padding-right:16px}.compact .section{margin-top:16px}.compact .row{min-height:50px}.compact .group{border-radius:15px}.round .group,.round .focus .intro{border-radius:24px}.round .badge{border-radius:13px}`;

await renderBatch({
  screens,
  prefixes: ['b4-03-', 'b4-04-', 'b4-06-'],
  css,
  contactName: 'p5b-team-remaining-contact-sheet-v22.png',
  verificationName: 'teameet-v22-p5b-team-remaining-verification.md',
  summary: '# Teameet v22 P5B Team Remaining Verification\n\n- B4-03 members\n- B4-04 edit\n- B4-06 invitations/member management',
});
