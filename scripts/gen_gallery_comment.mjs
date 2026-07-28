// PR #21 대회 갤러리 코멘트 마크다운 생성 + raw URL 검증. Run: node scripts/gen_gallery_comment.mjs
import { writeFileSync } from 'fs';
const SHA = 'f42e196c848f8a30da33a72bb75372fd729445d6';
const REPO = 'kim-song-jun/matchup-sports-platform';
const rawBase = `https://raw.githubusercontent.com/${REPO}/${SHA}/docs/visual-qa/tournament-gallery`;

const PAGES = [
  ['01-home', '홈 · 오늘의 추천 (대회 카드)'],
  ['02-consumer-list', '소비자 · 대회 목록'],
  ['03-consumer-detail', '소비자 · 대회 상세 (규정·대진·조별순위·공지)'],
  ['04-consumer-apply', '소비자 · 참가 신청 (팀 선택→동의→결제수단)'],
  ['05-consumer-roster', '소비자 · 명단 작성 (선수·선출여부)'],
  ['06-consumer-my', '소비자 · 내 신청 상태 (결제·명단·취소)'],
  ['07-admin-list', '어드민 · 대회 목록'],
  ['08-admin-create', '어드민 · 대회 생성'],
  ['09-admin-detail-registrations', '어드민 · 상세 — 신청 관리 (입금확인/확정/CSV)'],
  ['10-admin-detail-bracket', '어드민 · 상세 — 대진 관리 (조/픽스처/순위)'],
  ['11-admin-detail-announcements', '어드민 · 상세 — 공지'],
];
const url = (bp, name) => `${rawBase}/${bp}/${name}.png`;

let md = `## 📸 대회 갤러리 v3 — 디자인 루프(R1~R7) + 포맷-인지 브래킷 반영\n\n`;
md += `ultracode 5-에이전트 적대 디자인 감사로 31건(미정의 토큰·오프팔레트 인디고·WCAG 색-only 뱃지·표준 컴포넌트 우회·터치 44px·정렬/타이포)을 잡아 8-워커 병렬 수정한 **이후** 재캡처.\n`;
md += `각 페이지 **📱 mobile 390 · 📲 tablet 768 · 🖥 desktop 1440** 3폭. (SHA 고정 raw URL: \`${SHA.slice(0, 10)}\`)\n\n`;
md += `| 페이지 | 📱 mobile | 📲 tablet | 🖥 desktop |\n|---|---|---|---|\n`;
for (const [name, label] of PAGES) {
  md += `| **${label}** | <img src="${url('mobile', name)}" width="200"> | <img src="${url('tablet', name)}" width="220"> | <img src="${url('desktop', name)}" width="300"> |\n`;
}
md += `\n> 참고(비차단 폴리시): 어드민 대진/픽스처가 현재 팀 UUID로 표시됨(후속 칩 등록). 그 외 전 화면 production fidelity.\n`;

writeFileSync('/tmp/gallery_comment.md', md);
console.log('WROTE /tmp/gallery_comment.md', md.length, 'chars');

// 대표 URL 3개 HEAD 검증
const samples = [url('mobile', '01-home'), url('desktop', '09-admin-detail-registrations'), url('tablet', '03-consumer-detail')];
for (const u of samples) {
  try {
    const r = await fetch(u, { method: 'HEAD' });
    console.log(`${r.status} ${u.replace(rawBase, '…')}`);
  } catch (e) {
    console.log(`ERR ${u}: ${e.message}`);
  }
}
