// PR #21 Toss-친근화 before/after 갤러리. Run: node scripts/gen_toss_gallery.mjs
import { writeFileSync } from 'fs';
const REPO = 'kim-song-jun/matchup-sports-platform';
const BEFORE_SHA = '369a5117cb7e71b547fa6eefc99158d1457dfa91'; // tournament-gaps-v4
const AFTER_SHA = '63540e364ff55b49e6c99b42c25c0c5e280ed557';  // tournament-toss-v5
const beforeBase = `https://raw.githubusercontent.com/${REPO}/${BEFORE_SHA}/docs/visual-qa/tournament-gaps-v4`;
const afterBase = `https://raw.githubusercontent.com/${REPO}/${AFTER_SHA}/docs/visual-qa/tournament-toss-v5`;

const AFTER = [
  ['01-admin-bracket', '어드민 · 대진 — 토큰화 + 해요체 CTA'],
  ['02-admin-announcements', '어드민 · 공지'],
  ['03-consumer-my', '소비자 · 내 신청 — 확정 친근 배지'],
  ['04-consumer-detail', '소비자 · 대회 상세'],
  ['05-consumer-list', '소비자 · 대회 목록'],
];

let md = `## 🎨 대회 UI Toss-친근화 (ultracode 디자인 감사)\n\n`;
md += `opus ×4 적대 디자인 감사 → 종합 → 수정 → opus 리뷰(onBrand=true, 회귀 0). on-brand 폴리시만 적용, 주관적 방향 전환은 아래 \`directional\`로 분리.\n\n`;

md += `### before → after (핵심 2면)\n\n`;
md += `| 화면 | before | after |\n|---|---|---|\n`;
md += `| **내 신청(확정·명단부족)** — 빨강 "인원 부족" 경고 → 주황 "명단 보강 권장" + "아직 자리가 남았어요…", 취소 버튼 약한 강조 | <img src="${beforeBase}/desktop/03-consumer-my.png" width="260"> | <img src="${afterBase}/desktop/03-consumer-my.png" width="260"> |\n`;
md += `| **어드민 상세** — "{label}(으)로 변경" 로봇 문구·하드코딩 px → "접수 마감하기/대회 취소하기" 해요체·토큰·폼 라벨 | <img src="${beforeBase}/desktop/01-admin-bracket.png" width="260"> | <img src="${afterBase}/desktop/01-admin-bracket.png" width="260"> |\n\n`;

md += `### after 전체 (📱 mobile 390 · 📲 tablet 768 · 🖥 desktop 1440)\n\n`;
md += `| 페이지 | 📱 | 📲 | 🖥 |\n|---|---|---|---|\n`;
for (const [name, label] of AFTER) {
  md += `| **${label}** | <img src="${afterBase}/mobile/${name}.png" width="150"> | <img src="${afterBase}/tablet/${name}.png" width="170"> | <img src="${afterBase}/desktop/${name}.png" width="240"> |\n`;
}

md += `\n### 적용 (on-brand)\n`;
md += `- **공유 a11y/상태**(전 v1 surface): \`.tm-btn\` focus-visible 링(WCAG AA) · 실제 \`prefers-reduced-motion\` · EmptyState 블루 원형 아이콘 + 신규 ErrorState(재시도) · AlertBanner role tone 기반\n`;
md += `- **내 신청**: 확정+명단부족 친근 배지 + 안심 카피, 취소 약한 강조(danger는 확인 모달)\n`;
md += `- **신청**: 계좌번호 복사 버튼(aria-live), 계좌 미설정 시 안내 배너\n`;
md += `- **어드민**: 75+ px→토큰, 해요체 상태 CTA, 폼 라벨 노출 · text-gray 잔여 토큰화\n\n`;
md += `### directional (자동 적용 안 함 — 결정 필요)\n`;
md += `정원 progress bar · 상세 정보 위계 재배치(요약 스트립/메트릭 카드) · 확정 축하 hero · 명단 추가 raw userId→팀원 드롭다운 · 종목 아이덴티티(데이터 필요) · 어드민 빈 단계 박스 축약/모바일 표 스크롤.\n`;

writeFileSync('/tmp/toss_gallery_comment.md', md);
console.log('WROTE', md.length, 'chars');

// raw URL 검증
const urls = [];
for (const [n] of AFTER) for (const bp of ['mobile', 'tablet', 'desktop']) urls.push(`${afterBase}/${bp}/${n}.png`);
urls.push(`${beforeBase}/desktop/03-consumer-my.png`, `${beforeBase}/desktop/01-admin-bracket.png`);
let ok = 0, bad = 0;
for (const u of urls) {
  try { const r = await fetch(u, { method: 'HEAD' }); if (r.status === 200) ok++; else { bad++; console.log(`${r.status} ${u.slice(-40)}`); } }
  catch (e) { bad++; console.log(`ERR ${u.slice(-40)}`); }
}
console.log(`raw URL: ${ok} OK / ${bad} bad (총 ${urls.length})`);
