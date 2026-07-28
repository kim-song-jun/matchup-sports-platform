import { badge, renderBatch, row, section, top } from './teameet_v22_mockup_utils.mjs';

const cta = (main, sub = '공유') => `<div class="cta"><span>${sub}</span><button>${main}</button></div>`;

function tournamentDetail(v) {
  return `<div class="screen ${v.tone}">${top('대회 상세', '공유')}<main>
    <section class="intro">${badge('모집중', 'blue')}<h1>2026 Summer Cup</h1><p>풋살/축구 · 서울 · 07.20 - 08.10 · 24/32팀</p></section>
    ${section('상태별 허브', [row('참가 신청', '입금 확인 후 참가 확정', { trail: badge('가능', 'green') }), row('내 신청 상태', '로스터 보완 2명 필요', { trail: '확인' }), row('공지', '운영 안내 3건 · 최근 오늘 09:00', { trail: '보기' })].join(''))}
    ${section('대회 정보', [row('진행 방식', '예선 리그 + 결선 토너먼트'), row('장소', '서울 디풋살파크 외 2곳'), row('참가비', '팀당 120,000원'), row('상금/혜택', '우승 200만원 · MVP 상품')].join(''))}
    ${section('참가팀/일정', [row('참가팀', '24개 팀 · 8팀 모집 가능', { trail: '보기' }), row('경기 일정', '예선 48경기 · 결선 7경기', { trail: '보기' }), row('순위/브래킷', '대회 시작 후 공개', { trail: '대기' })].join(''))}
    ${cta('참가 신청')}
  </main></div>`;
}

function mediaReview(v) {
  return `<div class="screen ${v.tone}">${top('영상과 리뷰')}<main>
    <section class="intro">${badge('종료 후', 'green')}<h1>경기 기록을 다시 볼 수 있어요</h1><p>영상, 하이라이트, 리뷰, 매너 평가가 경기 종료 후 연결됩니다.</p></section>
    ${section('영상', [row('결승 하이라이트', '03:12 · 득점 장면 4개', { trail: badge('영상', 'blue') }), row('예선 A조 3경기', '전체 영상 업로드 대기', { trail: badge('대기', 'orange') }), row('내 팀 클립', '레드 FC 관련 장면 6개', { trail: '보기' })].join(''))}
    ${section('리뷰/매너 평가', [row('작성할 리뷰', '결승전 상대팀 · 3일 안에 작성', { trail: '작성' }), row('받은 리뷰', '검증된 후기 12개 · 평균 4.9', { trail: badge('검증', 'green') }), row('MVP 추천', '참가팀 투표 26표 수집', { trail: '보기' })].join(''))}
    ${section('다음 대회', [row('가을 풋살 리그', '사전 알림 신청 가능'), row('동네 팀매치 추천', '대회 참가팀끼리 이어서 경기')].join(''))}
    ${cta('리뷰 작성', '영상 보기')}
  </main></div>`;
}

const screens = [
  { id: 'B7-02', slug: 'tournament-detail-expanded', title: '대회 상세 확장', render: tournamentDetail },
  { id: 'B8-06', slug: 'tournament-video-review', title: '영상/리뷰 섹션', render: mediaReview },
];

const css = `:root{--blue:#3182f6;--b50:#eaf3ff;--green:#03b26c;--g50:#e9f9ef;--orange:#f59f00;--o50:#fff4e6;--bg:#f9fafb;--g100:#f2f4f6;--g200:#e5e8eb;--g500:#8b95a1;--g700:#4e5968;--g900:#191f28}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--g900);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Segoe UI",sans-serif}.screen{width:390px;min-height:1180px;margin:0 auto;background:var(--bg);overflow:hidden}.top{height:56px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.97);border-bottom:1px solid var(--g100);position:sticky;top:0;z-index:2}.top button{border:0;background:transparent;color:var(--g700);font-size:12px;font-weight:800}.top strong{font-size:16px}main{padding:18px 20px 44px}.intro h1{margin:10px 0 0;font-size:25px;line-height:1.22}.intro p{margin:8px 0 0;color:var(--g500);font-size:13px;line-height:1.5}.section{margin-top:22px}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.head h2{margin:0;font-size:15px}.head span{font-size:12px;color:var(--blue);font-weight:900}.group{background:white;border:1px solid var(--g100);border-radius:18px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}.row{min-height:58px;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--g100)}.row:last-child{border-bottom:0}.main{min-width:0}.row strong{font-size:14px}.row p{margin:5px 0 0;color:var(--g500);font-size:12px;line-height:1.35}.trail{font-size:12px;color:var(--blue);font-weight:900;white-space:nowrap}.badge{display:inline-flex;align-items:center;min-height:23px;padding:0 8px;border-radius:999px;background:var(--g100);color:var(--g700);font-size:11px;font-weight:900}.badge.blue{background:var(--b50);color:var(--blue)}.badge.green{background:var(--g50);color:var(--green)}.badge.orange{background:var(--o50);color:var(--orange)}.cta{margin-top:18px;display:grid;grid-template-columns:1fr 2fr;gap:8px}.cta span,.cta button{height:48px;border-radius:15px;display:grid;place-items:center;font-size:15px;font-weight:900}.cta span{background:white;border:1px solid var(--g200);color:var(--g700)}.cta button{border:0;background:var(--blue);color:white}.focus .intro{padding:16px;border-radius:22px;background:white;border:1px solid var(--g100)}.compact main{padding-left:16px;padding-right:16px}.compact .section{margin-top:16px}.compact .row{min-height:50px}.compact .group{border-radius:15px}.round .group,.round .focus .intro{border-radius:24px}.round .badge{border-radius:13px}`;

await renderBatch({
  screens,
  prefixes: ['b7-02-', 'b8-06-'],
  css,
  contactName: 'p5d-tournament-media-contact-sheet-v22.png',
  verificationName: 'teameet-v22-p5d-tournament-media-verification.md',
  summary: '# Teameet v22 P5D Tournament Detail / Media Verification\n\n- B7-02 tournament detail expanded\n- B8-06 video/review section',
});
