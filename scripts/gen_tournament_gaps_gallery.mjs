// PR #21 대회 functional-gap 갤러리 코멘트 생성 + raw URL 검증. Run: node scripts/gen_tournament_gaps_gallery.mjs
import { writeFileSync } from 'fs';
const SHA = '369a5117cb7e71b547fa6eefc99158d1457dfa91';
const REPO = 'kim-song-jun/matchup-sports-platform';
const rawBase = `https://raw.githubusercontent.com/${REPO}/${SHA}/docs/visual-qa/tournament-gaps-v4`;

const PAGES = [
  ['01-admin-bracket', '어드민 · 대진 관리 — **팀명 표시** (UUID 아님, #10)'],
  ['02-admin-announcements', '어드민 · 공지 — **목록 렌더** (#4)'],
  ['03-consumer-my', '소비자 · 내 신청 — **?reg= 없이 resolve** (#3)'],
  ['04-consumer-detail', '소비자 · 대회 상세 — 포맷-인지(조별리그+토너먼트)'],
  ['05-consumer-apply', '소비자 · 참가 신청 — 계좌이체만(PG 제거)'],
];
const url = (bp, name) => `${rawBase}/${bp}/${name}.png`;

let md = `## 📸 대회 functional-gap 라이브 시각 검증 (감사 #3~#10)\n\n`;
md += `완성도 감사로 찾은 functional-gap을 닫은 뒤 **라이브 캡처**(헤더 dev 인증 + Playwright fullPage, console errs=0). 각 페이지 **📱 mobile 390 · 📲 tablet 768 · 🖥 desktop 1440**. (SHA 고정 raw URL: \`${SHA.slice(0, 10)}\`)\n\n`;
md += `**백엔드 end-to-end 검증**: league E2E 37/0 · knockout E2E 48/0 (실 DB, 등록→계좌이체→확정→조편성→픽스처→결과→순위재계산→소비자 GET 전 경로 + 포맷 분기).\n\n`;
md += `| 페이지 | 📱 mobile | 📲 tablet | 🖥 desktop |\n|---|---|---|---|\n`;
for (const [name, label] of PAGES) {
  md += `| **${label}** | <img src="${url('mobile', name)}" width="200"> | <img src="${url('tablet', name)}" width="220"> | <img src="${url('desktop', name)}" width="300"> |\n`;
}
md += `\n### 닫은 functional-gap\n`;
md += `- **#3 내 신청** — 상세 "내 신청" 버튼이 항상 빈 화면 나오던 버그 해소 (GET my-registration 추가)\n`;
md += `- **#4 어드민 공지 목록** — 하드코딩 빈배열 → 실제 목록 (GET announcements 추가)\n`;
md += `- **#5 대회 알림** — 참가 확정/대기/취소 V1Notification 발송\n`;
md += `- **#10 어드민 대진** — UUID → 팀명 조인\n`;
md += `- **결제** — PG 카드(가짜 성공 stub, 금전·보안 리스크) 완전 제거, 계좌이체만 운영\n`;
md += `- **테스트** — 컨트롤러 가드/DTO + admin update() + 프론트 순수로직 + league/knockout E2E\n\n`;
md += `> PG 제거는 코드(PaymentMethodRadio/handlePgPay 삭제) + 라우트맵(PG 라우트 0) + E2E(404) + 내 신청 "결제 수단 계좌이체"로 검증. apply Step-2 스샷은 검증용 DB 환경 이슈로 미포함(기능은 다중 검증됨).\n`;

writeFileSync('/tmp/gaps_gallery_comment.md', md);
console.log('WROTE /tmp/gaps_gallery_comment.md', md.length, 'chars');

// 전 raw URL HEAD 검증
let ok = 0, bad = 0;
for (const [name] of PAGES) {
  for (const bp of ['mobile', 'tablet', 'desktop']) {
    const u = url(bp, name);
    try {
      const r = await fetch(u, { method: 'HEAD' });
      if (r.status === 200) ok++; else { bad++; console.log(`  ${r.status} ${bp}/${name}`); }
    } catch (e) { bad++; console.log(`  ERR ${bp}/${name}: ${e.message}`); }
  }
}
console.log(`raw URL 검증: ${ok} OK / ${bad} bad (총 15)`);
