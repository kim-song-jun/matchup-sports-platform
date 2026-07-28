import { writeFileSync } from 'fs';
const SHA = 'ea8eefbb3d5a88184fc5fa994ac6776e440cff55';
const base = `https://raw.githubusercontent.com/kim-song-jun/matchup-sports-platform/${SHA}/docs/visual-qa/tournament-advance-v7`;
const P = [['01-standings-advance','소비자 순위표 진출선 (상위 N팀 틴트+"진출"+캡션)'],['02-admin-advance-input','어드민 · 조 만들기 "진출 팀 수" 입력']];
let md = `## 📸 조별리그 진출선 라이브 검증 (남은 directional 마감)\n\n`;
md += `\`V1TournamentGroup.advanceCount\` 모델 추가로 "진출 팀 수 데이터 없음" 막힘 해소. 소비자 순위표에 상위 N팀 진출선(blue 틴트+"진출" 배지+"상위 N팀 진출" 캡션), 어드민 조 만들기에 진출 팀 수 입력. errs=0. (SHA \`${SHA.slice(0,10)}\`)\n\n`;
md += `| 화면 | 📱 mobile | 🖥 desktop |\n|---|---|---|\n`;
for (const [n,l] of P) md += `| **${l}** | <img src="${base}/mobile/${n}.png" width="220"> | <img src="${base}/desktop/${n}.png" width="320"> |\n`;
md += `\n> advanceCount=null이면 진출 표시 없음(진출 팀 수가 데이터에 있을 때만 표시 — 추측 제거).\n`;
writeFileSync('/tmp/advance_gallery.md', md);
let ok=0,bad=0;
for (const [n] of P) for (const bp of ['mobile','desktop']) { const r=await fetch(`${base}/${bp}/${n}.png`,{method:'HEAD'}); r.status===200?ok++:(bad++,console.log(r.status,bp,n)); }
console.log(`raw URL: ${ok} OK / ${bad} bad`);
