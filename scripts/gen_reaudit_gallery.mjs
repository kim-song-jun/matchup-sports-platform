import { writeFileSync } from 'fs';
const SHA='7b896906b4304de915e5923bbe483556cc745b0e';
const base=`https://raw.githubusercontent.com/kim-song-jun/matchup-sports-platform/${SHA}/docs/visual-qa`;
const C=[['rework-v8/desktop/01-detail','상세 데스크탑 — 안 A 2단+스티키 레일·상금 카드·CTA 인지·브래킷 풀폭'],['rework-v8/desktop/04-my','내 신청 데스크탑 — 2단+명단 등록 nudge'],['rework-v8/mobile/03-apply-step2','신청 — 주문 요약(대회·팀·총액·상금·계좌)'],['rework-v8/desktop/02-list','목록 — 그리드+상금 배지']];
const A=[['admin-polish-v8/01-admin-bracket','어드민 대진 — 대진 자동 생성+라운드 select+중복방지'],['admin-polish-v8/03-roster-add','명단 추가 — 중립 솔리드+YYYY-MM-DD+팀원 prefill']];
let md=`## 🎨 대회 전체 재검수 개선 (ultracode 5-비평 적대 감사 → 8건)\n\n`;
md+=`다회 폴리시 후에도 "아직 아쉽다"는 피드백에 5-비평 적대 재검수로 production 한 끗 부족 8건을 발굴 → 사용자 결정(상금 모델+표시·전부·데스크탑 안 A) 후 구현. 라이브 errs=0. (SHA \`${SHA.slice(0,10)}\`)\n\n`;
md+=`### 소비자\n| 화면 | 캡처 |\n|---|---|\n`;
for(const [p,l] of C) md+=`| **${l}** | <img src="${base}/${p}.png" width="340"> |\n`;
md+=`\n### 어드민\n| 화면 | 캡처 |\n|---|---|\n`;
for(const [p,l] of A) md+=`| **${l}** | <img src="${base}/${p}.png" width="340"> |\n`;
md+=`\n### 해결한 8건\n- #1 상금 모델+표시(참가비 prize-blue 분리) · #2 CTA 신청-인지+한국어 에러 · #3 결제 직전 주문 요약\n- #4 데스크탑 안 A 2단(빈 우측 해소) · #5 브래킷 실연결선 풀폭\n- #6 어드민 대진 자동 생성+라운드 taxonomy+중복방지 · #7 네이티브 date/blue틴트 제거 · #8 명단 prefill+확정후 nudge\n\n게이트: api tsc 0·jest 25/295 · web tsc 0·next build 0(85p)·vitest 0.\n`;
writeFileSync('/tmp/reaudit_gallery.md',md);
let ok=0,bad=0; for(const [p] of [...C,...A]){const r=await fetch(`${base}/${p}.png`,{method:'HEAD'}); r.status===200?ok++:(bad++,console.log(r.status,p));}
console.log(`raw URL: ${ok} OK / ${bad} bad`);
