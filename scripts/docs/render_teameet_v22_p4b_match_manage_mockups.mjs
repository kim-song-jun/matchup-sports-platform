import { badge, renderBatch, row, section, top } from './teameet_v22_mockup_utils.mjs';

const cta = (main, sub = '수정') => `<div class="cta"><span>${sub}</span><button>${main}</button></div>`;
const field = (label, value, note = '') => `<label class="field"><span>${label}</span><div>${value}</div>${note ? `<small>${note}</small>` : ''}</label>`;

function complete(v) {
  return `<div class="screen ${v.tone}">${top('매치 생성 완료', '공유')}<main>
    <section class="intro">${badge('생성 완료', 'green')}<h1>한강 풋살 매치가 열렸어요</h1><p>참가자 모집과 알림은 매치 상세에서 관리합니다.</p></section>
    ${section('매치 요약', [row('일정', '7월 4일 토 18:00 · 90분', { trail: '확정' }), row('장소', '서울 디풋살파크 · A코트', { trail: '지도' }), row('모집 인원', '현재 1/10명 · 선착순 승인', { trail: badge('모집중', 'blue') })].join(''))}
    ${section('다음 액션', [row('상세 보기', '참가자와 공지를 관리해요', { trail: '이동' }), row('팀에 공유', '초대 링크로 빠르게 모집', { trail: '복사' }), row('홈으로 이동', '추천 매치와 내 일정을 확인', { trail: '이동' })].join(''))}
    ${section('알림 예약', `<div class="notice">참가 신청이 들어오면 푸시와 알림센터에 동시에 표시돼요.</div>${cta('상세 보기', '홈으로')}`)}
  </main></div>`;
}

function applications(v) {
  return `<div class="screen ${v.tone}">${top('신청자 관리', '필터')}<main>
    <section class="intro">${badge('3명 대기', 'orange')}<h1>참가자를 확인하고 승인해요</h1><p>승인/거절 사유는 신청자에게 안내되고 운영 기록에 남습니다.</p></section>
    ${section('대기 중', [row('김지훈', '풋살 · 매너 4.9 · 최근 경기 12회', { trail: badge('승인', 'green') }), row('이서연', '축구 · 초급 · 자기소개 확인 필요', { trail: badge('검토', 'orange') }), row('박민재', '러닝 · 지역 멀리 있음', { trail: '프로필' })].join(''))}
    ${section('승인 확인', `<div class="confirm"><b>김지훈님을 승인할까요?</b><p>승인하면 참가 확정 알림이 발송되고 정원에 반영됩니다.</p><div><span>보류</span><button>승인</button></div></div>`)}
    ${section('거절 사유', [row('정원 초과', '다음 모집을 안내해요', { trail: '선택' }), row('조건 불일치', '실력/지역 조건 안내', { trail: '선택' }), row('직접 입력', '운영자가 사유를 작성', { trail: '입력' })].join(''))}
  </main></div>`;
}

function edit(v) {
  return `<div class="screen ${v.tone}">${top('매치 편집', '저장')}<main>
    <section class="intro">${badge('편집 가능', 'blue')}<h1>참가자가 보기 전에 정보를 정리해요</h1><p>일정, 장소, 인원 변경은 참가자에게 알림으로 전달됩니다.</p></section>
    ${section('기본 정보', `${field('제목', '한강 풋살 매치')}${field('일정', '7월 4일 토 18:00')}${field('장소', '서울 디풋살파크 A코트')}${field('모집 인원', '10명', '현재 승인 1명 · 최소 6명')}`)}
    ${section('변경 영향', [row('일정 변경', '확정 참가자 1명에게 알림 발송', { trail: badge('주의', 'orange') }), row('참가비', '현재 10,000원 · 변경 없음', { trail: '유지' })].join(''))}
    ${section('삭제 확인', `<div class="danger"><b>매치를 삭제할까요?</b><p>참가 신청과 채팅방이 함께 종료됩니다. 이미 승인된 참가자가 있으면 삭제 전 사유가 필요해요.</p></div>${cta('저장하기', '삭제')}`)}
  </main></div>`;
}

const screens = [
  { id: 'B2-04', slug: 'match-complete', title: '매치 생성 완료', render: complete },
  { id: 'B2-05', slug: 'match-applications', title: '신청자 관리', render: applications },
  { id: 'B2-06', slug: 'match-edit', title: '매치 편집', render: edit },
];

const css = `:root{--blue:#3182f6;--b50:#eaf3ff;--green:#03b26c;--g50:#e9f9ef;--orange:#f59f00;--o50:#fff4e6;--red:#f04452;--r50:#fff1f2;--bg:#f9fafb;--g100:#f2f4f6;--g200:#e5e8eb;--g500:#8b95a1;--g700:#4e5968;--g900:#191f28}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--g900);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.screen{width:390px;min-height:1180px;margin:0 auto;background:var(--bg);overflow:hidden}.top{height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.97);border-bottom:1px solid var(--g100);position:sticky;top:0;z-index:2}.top button{border:0;background:transparent;color:var(--g700);font-size:12px;font-weight:800}.top strong{font-size:16px}main{padding:18px 20px 44px}.intro h1{margin:10px 0 0;font-size:25px;line-height:1.22;letter-spacing:0}.intro p,.notice{margin:8px 0 0;color:var(--g500);font-size:13px;line-height:1.5}.section{margin-top:22px}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.head h2{margin:0;font-size:15px}.head span{font-size:12px;color:var(--blue);font-weight:900}.group{background:white;border:1px solid var(--g100);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}.row{min-height:58px;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--g100)}.row:last-child{border-bottom:0}.main{min-width:0}.row strong{display:block;font-size:14px;line-height:1.25}.row p{margin:5px 0 0;color:var(--g500);font-size:12px;line-height:1.35}.trail{font-size:12px;color:var(--blue);font-weight:900;white-space:nowrap}.badge{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:var(--g100);color:var(--g700);font-size:11px;font-weight:900}.badge.blue{background:var(--b50);color:var(--blue)}.badge.green{background:var(--g50);color:var(--green)}.badge.orange{background:var(--o50);color:var(--orange)}.notice,.confirm,.danger{padding:16px}.confirm b,.danger b{font-size:15px}.confirm p,.danger p{margin:8px 0 14px;color:var(--g500);font-size:12px;line-height:1.45}.confirm div{display:grid;grid-template-columns:1fr 1.6fr;gap:8px}.confirm span,.confirm button{height:42px;border-radius:14px;display:grid;place-items:center;font-weight:900}.confirm span{border:1px solid var(--g200);color:var(--g700)}.confirm button{border:0;background:var(--blue);color:white}.danger{background:var(--r50);color:var(--red)}.field{display:block;padding:13px 14px;border-bottom:1px solid var(--g100)}.field:last-child{border-bottom:0}.field span{display:block;font-size:13px;font-weight:900}.field div{margin-top:8px;min-height:42px;border:1px solid var(--g200);border-radius:13px;padding:11px 12px;background:white;font-size:14px}.field small{display:block;margin-top:7px;color:var(--orange);font-size:12px;font-weight:800}.cta{margin-top:18px;display:grid;grid-template-columns:1fr 2fr;gap:8px}.cta span,.cta button{height:48px;border-radius:15px;display:grid;place-items:center;font-size:15px;font-weight:900}.cta span{background:white;border:1px solid var(--g200);color:var(--g700)}.cta button{border:0;background:var(--blue);color:white}.focus .intro{padding:16px;border-radius:22px;background:white;border:1px solid var(--g100)}.compact main{padding-left:16px;padding-right:16px}.compact .section{margin-top:16px}.compact .row{min-height:50px}.compact .group{border-radius:15px}.round .group,.round .focus .intro{border-radius:24px}.round .badge{border-radius:13px}`;

await renderBatch({
  screens,
  prefixes: ['b2-04-', 'b2-05-', 'b2-06-'],
  css,
  contactName: 'p4b-match-manage-contact-sheet-v22.png',
  verificationName: 'teameet-v22-p4b-match-manage-verification.md',
  summary: '# Teameet v22 P4B Match Manage Verification\n\n- B2-04 match creation complete\n- B2-05 application management\n- B2-06 match edit/delete confirmation',
});
