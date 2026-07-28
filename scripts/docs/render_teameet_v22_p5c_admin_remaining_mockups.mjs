import { badge, renderBatch, row, section, top } from './teameet_v22_mockup_utils.mjs';

const cta = (main, sub = '취소') => `<div class="cta"><span>${sub}</span><button>${main}</button></div>`;
const field = (label, value) => `<label class="field"><span>${label}</span><div>${value}</div></label>`;

function adminMatches(v) {
  return `<div class="screen ${v.tone}">${top('매치 운영')}<main>
    <section class="intro">${badge('운영 큐', 'blue')}<h1>매치와 팀매치를 상태별로 관리해요</h1><p>취소, 신고, 환불이 필요한 항목을 먼저 보여줍니다.</p></section>
    ${section('주의 필요', [row('한강 풋살 매치', '취소 요청 · 승인 참가자 8명', { trail: badge('처리', 'orange') }), row('레드 FC 팀매치', '상대팀 미확정 · D-2', { trail: '관리' })].join(''))}
    ${section('목록', [row('목요 풋살', '모집중 · 6/10명', { trail: '상세' }), row('성수 농구', '완료 · 후기 대기 4건', { trail: '상세' }), row('러닝 번개', '취소됨 · 사유 기록 완료', { trail: '기록' })].join(''))}
    ${section('상태 변경', `<div class="confirm"><b>우천 취소로 처리할까요?</b><p>참가자에게 알림이 발송되고 환불 상태가 생성됩니다.</p></div>${cta('취소 처리', '보류')}`)}
  </main></div>`;
}

function adminTeams(v) {
  return `<div class="screen ${v.tone}">${top('팀 운영')}<main>
    <section class="intro">${badge('검토', 'orange')}<h1>팀 공개 상태와 신고를 확인해요</h1><p>팀 공개, 휴면, 제한 처리는 사유와 담당자가 기록됩니다.</p></section>
    ${section('검토 필요', [row('성수 위너스 FC', '대표 사진 신고 · 공개 유지 검토', { trail: badge('신고', 'orange') }), row('한강 러너스', '휴면 전환 후보 · 60일 미활동', { trail: '검토' })].join(''))}
    ${section('팀 목록', [row('레드 FC', '정상 · 멤버 18명'), row('블루 러너스', '정상 · 멤버 24명'), row('새 팀 신청', '공개 대기 · 소개 미작성', { trail: badge('대기', 'orange') })].join(''))}
    ${section('처리 확인', `<div class="confirm"><b>팀 공개를 보류할까요?</b><p>팀장에게 보완 사유가 전달되고 공개 목록에서 숨겨집니다.</p></div>${cta('보류 처리', '취소')}`)}
  </main></div>`;
}

function adminTournamentNew(v) {
  return `<div class="screen ${v.tone}">${top('대회 생성', '저장')}<main>
    <section class="intro">${badge('운영자', 'blue')}<h1>대회의 생명주기를 먼저 정해요</h1><p>모집, 입금 확인, 진행, 종료 상태가 자동으로 이어집니다.</p></section>
    ${section('기본 정보', `${field('대회명', '2026 Summer Cup')}${field('종목', '풋살 · 축구')}${field('기간', '2026.07.20 - 2026.08.10')}${field('참가비', '팀당 120,000원')}`)}
    ${section('운영 방식', [row('예선 리그', '4개 조 · 조별 3경기'), row('결선 토너먼트', '8강부터 단판'), row('입금 확인', '관리자 승인 후 확정', { trail: badge('필수', 'orange') })].join(''))}
    ${section('생성 전 확인', `<div class="notice">대회 생성 후에도 모집 전에는 일정과 참가비를 수정할 수 있어요.</div>${cta('대회 생성')}`)}
  </main></div>`;
}

function adminTournamentDetail(v) {
  return `<div class="screen ${v.tone}">${top('대회 운영 상세')}<main>
    <section class="intro">${badge('모집중', 'blue')}<h1>2026 Summer Cup</h1><p>참가팀 24/32 · 입금 확인 18 · 로스터 보완 4</p></section>
    ${section('운영 큐', [row('신청 승인', '대기 7건 · 입금 미확인 3건', { trail: '처리' }), row('공지 발송', '대진/규칙 안내 예약 필요', { trail: '작성' }), row('협찬 배너', '2개 노출중 · 1개 검수 필요', { trail: '관리' })].join(''))}
    ${section('진행 설정', [row('예선 조', 'A-D조 · 편성 완료'), row('결선', '8강 bracket 준비중'), row('상태 변경', '모집중 → 진행중', { trail: badge('예약', 'orange') })].join(''))}
    ${section('최근 기록', [row('김운영 · 입금 승인', '13:20 · 레드 FC'), row('서관리 · 공지 수정', '12:41 · 참가 안내')].join(''))}
  </main></div>`;
}

const screens = [
  { id: 'B9-03', slug: 'admin-matches', title: '관리자 매치 운영', render: adminMatches },
  { id: 'B9-04', slug: 'admin-teams', title: '관리자 팀 운영', render: adminTeams },
  { id: 'B9-06', slug: 'admin-tournament-new', title: '관리자 대회 생성', render: adminTournamentNew },
  { id: 'B9-07', slug: 'admin-tournament-detail', title: '관리자 대회 상세', render: adminTournamentDetail },
];

const css = `:root{--blue:#3182f6;--b50:#eaf3ff;--green:#03b26c;--g50:#e9f9ef;--orange:#f59f00;--o50:#fff4e6;--bg:#f9fafb;--g100:#f2f4f6;--g200:#e5e8eb;--g500:#8b95a1;--g700:#4e5968;--g900:#191f28}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--g900);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.screen{width:390px;min-height:1180px;margin:0 auto;background:var(--bg);overflow:hidden}.top{height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.97);border-bottom:1px solid var(--g100);position:sticky;top:0;z-index:2}.top button{border:0;background:transparent;color:var(--g700);font-size:12px;font-weight:800}.top strong{font-size:16px}main{padding:18px 20px 44px}.intro h1{margin:10px 0 0;font-size:24px;line-height:1.22}.intro p,.notice{margin:8px 0 0;color:var(--g500);font-size:13px;line-height:1.5}.section{margin-top:22px}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.head h2{margin:0;font-size:15px}.head span{font-size:12px;color:var(--blue);font-weight:900}.group{background:white;border:1px solid var(--g100);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}.row{min-height:58px;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--g100)}.row:last-child{border-bottom:0}.main{min-width:0}.row strong{font-size:14px}.row p{margin:5px 0 0;color:var(--g500);font-size:12px;line-height:1.35}.trail{font-size:12px;color:var(--blue);font-weight:900;white-space:nowrap}.badge{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:var(--g100);color:var(--g700);font-size:11px;font-weight:900}.badge.blue{background:var(--b50);color:var(--blue)}.badge.orange{background:var(--o50);color:var(--orange)}.field{display:block;padding:13px 14px;border-bottom:1px solid var(--g100)}.field:last-child{border-bottom:0}.field span{font-size:13px;font-weight:900}.field div{margin-top:8px;min-height:42px;border:1px solid var(--g200);border-radius:13px;padding:11px 12px;background:white;font-size:14px}.notice,.confirm{padding:16px}.confirm b{font-size:15px}.confirm p{margin:8px 0 0;color:var(--g500);font-size:12px;line-height:1.45}.cta{margin-top:18px;display:grid;grid-template-columns:1fr 2fr;gap:8px}.cta span,.cta button{height:48px;border-radius:15px;display:grid;place-items:center;font-size:15px;font-weight:900}.cta span{background:white;border:1px solid var(--g200);color:var(--g700)}.cta button{border:0;background:var(--blue);color:white}.focus .intro{padding:16px;border-radius:22px;background:white;border:1px solid var(--g100)}.compact main{padding-left:16px;padding-right:16px}.compact .section{margin-top:16px}.compact .row{min-height:50px}.compact .group{border-radius:15px}.round .group,.round .focus .intro{border-radius:24px}.round .badge{border-radius:13px}`;

await renderBatch({
  screens,
  prefixes: ['b9-03-', 'b9-04-', 'b9-06-', 'b9-07-'],
  css,
  contactName: 'p5c-admin-remaining-contact-sheet-v22.png',
  verificationName: 'teameet-v22-p5c-admin-remaining-verification.md',
  summary: '# Teameet v22 P5C Admin Remaining Verification\n\n- B9-03 matches/team-matches\n- B9-04 teams\n- B9-06 tournament create\n- B9-07 tournament detail',
});
