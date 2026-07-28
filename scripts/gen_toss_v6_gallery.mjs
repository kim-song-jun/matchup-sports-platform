// PR #21 directional 갤러리. Run: node scripts/gen_toss_v6_gallery.mjs
import { writeFileSync } from 'fs';
const SHA = '30611303ef9384b06d98995cb472d122d60665e9';
const REPO = 'kim-song-jun/matchup-sports-platform';
const base = `https://raw.githubusercontent.com/${REPO}/${SHA}/docs/visual-qa/tournament-toss-v6`;

const PAGES = [
  ['01-my-hero', '내 신청 · 확정 hero (#3, 안 B)'],
  ['02-detail-sport', '대회 상세 · 종목 칩 + 메트릭 카드 (#8·#2)'],
  ['03-list-sport', '대회 목록 · 종목 칩 (#8)'],
  ['04-admin-cta', '어드민 · CTA weight + 빈 단계 축약 (#5·#6)'],
  ['06-roster-add-form', '명단 추가 · 팀원 드롭다운 (#7)'],
];
const url = (bp, n) => `${base}/${bp}/${n}.png`;

let md = `## 🎨 대회 directional 디자인 마감 (사용자 승인 항목)\n\n`;
md += `목업 A·B·C 게이트로 방향 확정(상세=메트릭 카드, hero=카드 히어로) 후 ultracode 9에이전트 구현 + opus 리뷰(onBrand=true, 회귀 0). 라이브 캡처(errs=0).\n\n`;
md += `| 화면 | 📱 mobile | 🖥 desktop |\n|---|---|---|\n`;
for (const [n, label] of PAGES) {
  md += `| **${label}** | <img src="${url('mobile', n)}" width="200"> | <img src="${url('desktop', n)}" width="320"> |\n`;
}
md += `\n### 적용\n`;
md += `- **#3 확정 hero**: 확정=녹색/대기=주황 카드 + "참가가 확정됐어요! · {날짜}, {장소}에서 만나요"\n`;
md += `- **#2 상세 위계**: flat 6행 → 메트릭 카드 3(일정·정원+진행막대·참가비) + "아직 N자리 남았어요"\n`;
md += `- **#8 종목 아이덴티티**: sport{code,name} join + getSportAccent 맵 → 상세 헤더·목록 카드 종목 점+라벨\n`;
md += `- **#7 명단**: raw userId 입력 → 팀원 드롭다운(이름+역할)\n`;
md += `- **#5/#6 어드민**: 취소 CTA outline 강등(one-primary), 빈 녹아웃 단계 슬림 한 줄 힌트, 통계 표 모바일 가로 스크롤\n`;
md += `- **#4 레이아웃**: apply 데스크탑 중앙정렬 + StepIndicator "다음: {단계}" 힌트\n\n`;
md += `> standings 진출선은 진출 팀 수 데이터가 모델에 없어 제외(추측 회피) — 별도 데이터 추가 시 후속.\n`;

writeFileSync('/tmp/toss_v6_comment.md', md);
console.log('WROTE', md.length);

let ok = 0, bad = 0;
for (const [n] of PAGES) for (const bp of ['mobile', 'desktop']) {
  try { const r = await fetch(url(bp, n), { method: 'HEAD' }); if (r.status === 200) ok++; else { bad++; console.log(r.status, bp, n); } }
  catch (e) { bad++; console.log('ERR', bp, n); }
}
console.log(`raw URL: ${ok} OK / ${bad} bad`);
