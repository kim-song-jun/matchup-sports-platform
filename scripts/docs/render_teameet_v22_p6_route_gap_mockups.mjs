import { badge, renderBatch, row, section, top } from './teameet_v22_mockup_utils.mjs';

const cta = (main, sub = '') => `<div class="cta">${sub ? `<span>${sub}</span>` : ''}<button>${main}</button></div>`;
const field = (label, value) => `<label class="field"><span>${label}</span><div>${value}</div></label>`;

function rootGate(v) {
  return `<div class="screen ${v.tone}">${top('Teameet', '도움')}<main>
    <section class="intro">${badge('세션 확인', 'blue')}<h1>바로 이어서 뛸 준비를 확인해요</h1><p>로그인 상태, 위치 권한, 최근 활동을 확인한 뒤 홈 또는 로그인으로 안내합니다.</p></section>
    ${section('진입 상태', [row('세션 확인 중', '내 주변 활동을 불러오는 중', { trail: badge('진행', 'orange') }), row('로그인 완료', '최근 본 매치와 내 팀으로 이동 가능', { trail: '홈' }), row('로그인 필요', '매치 신청과 팀 관리는 로그인 후 가능', { trail: '로그인' })].join(''))}
    ${section('다음 행동', `<div class="hero"><b>가까운 사람들과 팀을 바로 찾아요</b><p>비로그인 사용자는 둘러보기로 서비스 분위기를 먼저 확인할 수 있어요.</p></div>${cta('로그인', '둘러보기')}`)}
    ${section('오류/권한 상태', [row('위치 권한 필요', '수동 지역 선택으로 계속 가능', { trail: badge('선택', 'orange') }), row('세션 오류', '다시 시도하거나 다른 계정으로 로그인', { trail: '재시도' })].join(''))}
  </main></div>`;
}

function teamMatchList(v) {
  return `<div class="screen ${v.tone}">${top('팀매치', '만들기')}<main>
    <section class="intro">${badge('팀 기반', 'blue')}<h1>우리 팀과 맞는 상대를 찾아요</h1><p>종목, 지역, 실력 조건을 기준으로 팀 단위 매치를 탐색합니다.</p></section>
    <div class="chips">${['전체', '풋살', '축구', '농구', '러닝'].map((x, i) => badge(x, i === 0 ? 'blue' : '')).join('')}</div>
    ${section('추천 팀매치', [row('레드 FC 주말 친선', '풋살 · 마포 · 상대 팀 5-7명', { trail: badge('신청', 'green') }), row('성수 농구 정기전', '농구 · 성수 · 중급 이상', { trail: '상세' }), row('한강 러닝 크루전', '러닝 · 여의도 · 6km', { trail: badge('마감 임박', 'orange') })].join(''), '가까운 순')}
    ${section('내 팀 준비', [row('블루 러너스', '팀매치 생성 가능 · 운영진 권한', { trail: '만들기' }), row('팀이 없다면', '팀을 만든 뒤 팀매치를 등록할 수 있어요', { trail: '팀 만들기' })].join(''))}
    ${section('빈 상태 예시', `<div class="empty"><b>조건에 맞는 팀매치가 없어요</b><p>필터를 줄이거나 직접 팀매치를 만들어 보세요.</p></div>${cta('조건 초기화', '팀매치 만들기')}`)}
  </main></div>`;
}

function termsDetail(v) {
  return `<div class="screen ${v.tone}">${top('약관', '공유')}<main>
    <section class="intro">${badge('v2026.06', 'blue')}<h1>서비스 약관을 확인해요</h1><p>이용약관, 개인정보 처리방침, 위치 기반 서비스 약관을 같은 구조로 제공합니다.</p></section>
    <div class="chips">${['이용약관', '개인정보', '위치 서비스'].map((x, i) => badge(x, i === 0 ? 'blue' : '')).join('')}</div>
    ${section('문서 정보', [row('시행일', '2026.06.29', { trail: badge('최신', 'green') }), row('이전 버전', 'v2026.04 보기', { trail: '보기' }), row('개정 안내', '주요 변경 사항 3개', { trail: '펼침' })].join(''))}
    ${section('본문', `<div class="legal"><h2>제1조 목적</h2><p>Teameet은 사용자가 매치, 팀, 대회 활동을 더 안전하게 찾고 운영할 수 있도록 돕습니다.</p><h2>제2조 계정</h2><p>사용자는 정확한 정보를 바탕으로 계정을 만들고, 타인의 권리를 침해하지 않아야 합니다.</p><h2>제3조 위치와 알림</h2><p>위치 정보와 알림은 사용자가 선택한 범위에서만 추천과 안내에 사용됩니다.</p></div>`)}
    ${section('연결 행동', [row('문의하기', '약관 관련 문의를 보낼 수 있어요', { trail: '문의' }), row('설정으로 이동', '동의와 수신 설정을 바꿔요', { trail: '이동' })].join(''))}
  </main></div>`;
}

function adminAudit(v) {
  return `<div class="screen ${v.tone}">${top('감사 기록', '내보내기')}<main>
    <section class="intro">${badge('관리자 전용', 'orange')}<h1>운영 변경 내역을 추적해요</h1><p>누가, 언제, 어떤 사유로 상태를 바꿨는지 확인합니다.</p></section>
    ${section('검색과 필터', `${field('검색', '관리자, 대상, 사유 검색')}<div class="chips">${['전체', '회원', '매치', '팀', '대회', '권한'].map((x, i) => badge(x, i === 0 ? 'blue' : '')).join('')}</div>`)}
    ${section('최근 감사 기록', [row('김운영 · 대회 신청 승인', '13:20 · Red FC · 입금 확인', { trail: '상세' }), row('서관리 · 회원 제한', '12:41 · 신고 누적 · 7일 제한', { trail: badge('중요', 'orange') }), row('김운영 · 경기 스코어 수정', '11:05 · 1:0 -> 2:0 · 오입력 정정', { trail: 'diff' })].join(''))}
    ${section('상세 보기', `<div class="diff"><b>변경 전후</b><p>상태: 신청 대기 -> 승인 완료</p><p>사유: 입금 확인 및 로스터 최소 인원 충족</p><p>대상: 2026 Summer Cup / Red FC</p></div>${cta('대상으로 이동', '내보내기')}`)}
  </main></div>`;
}

const screens = [
  { id: 'B1-00', slug: 'root-session-gate', title: '루트/세션 진입 게이트', render: rootGate },
  { id: 'B3-00', slug: 'team-match-list', title: '팀매치 목록', render: teamMatchList },
  { id: 'B5-09', slug: 'terms-detail', title: '약관 상세', render: termsDetail },
  { id: 'B9-09', slug: 'admin-audit-log', title: '관리자 감사 로그', render: adminAudit },
];

const css = `:root{--blue:#3182f6;--b50:#eaf3ff;--green:#03b26c;--g50:#e9f9ef;--orange:#f59f00;--o50:#fff4e6;--bg:#f9fafb;--g100:#f2f4f6;--g200:#e5e8eb;--g500:#8b95a1;--g700:#4e5968;--g900:#191f28}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--g900);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.screen{width:390px;min-height:1180px;margin:0 auto;background:var(--bg);overflow:hidden}.top{height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.97);border-bottom:1px solid var(--g100);position:sticky;top:0;z-index:2}.top button{border:0;background:transparent;color:var(--g700);font-size:12px;font-weight:800}.top strong{font-size:16px}main{padding:18px 20px 44px}.intro h1{margin:10px 0 0;font-size:24px;line-height:1.22}.intro p,.empty p,.hero p,.legal p,.diff p{margin:8px 0 0;color:var(--g500);font-size:13px;line-height:1.5}.section{margin-top:22px}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.head h2{margin:0;font-size:15px}.head span{font-size:12px;color:var(--blue);font-weight:900}.group{background:white;border:1px solid var(--g100);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}.row{min-height:58px;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--g100)}.row:last-child{border-bottom:0}.main{min-width:0}.row strong{font-size:14px}.row p{margin:5px 0 0;color:var(--g500);font-size:12px;line-height:1.35}.trail{font-size:12px;color:var(--blue);font-weight:900;white-space:nowrap}.badge{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:var(--g100);color:var(--g700);font-size:11px;font-weight:900}.badge.blue{background:var(--b50);color:var(--blue)}.badge.green{background:var(--g50);color:var(--green)}.badge.orange{background:var(--o50);color:var(--orange)}.chips{margin-top:14px;display:flex;gap:8px;flex-wrap:wrap}.field{display:block;padding:14px}.field span{font-size:13px;font-weight:900}.field div{margin-top:8px;min-height:42px;border:1px solid var(--g200);border-radius:13px;padding:11px 12px;background:white;font-size:14px}.hero,.empty,.legal,.diff{padding:18px}.hero b,.empty b,.diff b{font-size:16px}.legal h2{margin:16px 0 0;font-size:15px}.legal h2:first-child{margin-top:0}.cta{margin-top:16px;display:grid;grid-template-columns:1fr 2fr;gap:8px}.cta span,.cta button{height:48px;border-radius:15px;display:grid;place-items:center;font-size:15px;font-weight:900}.cta span{background:white;border:1px solid var(--g200);color:var(--g700)}.cta button{border:0;background:var(--blue);color:white}.focus .intro{padding:16px;border-radius:22px;background:white;border:1px solid var(--g100)}.compact main{padding-left:16px;padding-right:16px}.compact .section{margin-top:16px}.compact .row{min-height:50px}.compact .group{border-radius:15px}.round .group,.round .focus .intro{border-radius:24px}.round .badge{border-radius:13px}`;

await renderBatch({
  screens,
  prefixes: ['b1-00-', 'b3-00-', 'b5-09-', 'b9-09-'],
  css,
  contactName: 'p6-route-gap-contact-sheet-v22.png',
  verificationName: 'teameet-v22-p6-route-gap-verification.md',
  summary: '# Teameet v22 P6 Route Gap Verification\n\n- B1-00 root/session gate\n- B3-00 team-match list\n- B5-09 terms detail\n- B9-09 admin audit log',
});
