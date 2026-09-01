/**
 * [빈 상태 채우기] `.tm-list-empty` 계열의 computed 값을 재서 **선택자 변경 전후를 대조**한다.
 * #948 은 "화면 변화 0"을 주장하는 PR 이라 스크린샷 두 장으로는 아무것도 증명 못 한다.
 * 사용: node scripts/measure-empty-fill.mjs <라벨>
 */
import { chromium } from 'playwright';
const B='https://alpha.teameet.co.kr';
const label=process.argv[2] ?? '(무라벨)';
const sha=(await fetch(B+'/landing',{method:'HEAD'})).headers.get('x-teameet-commit')?.slice(0,9);
const b=await chromium.launch();
const rows=[];
for (const w of [390,1440]) {
  const p=await (await b.newContext({viewport:{width:w,height:900}})).newPage();
  await p.goto(B+'/matches?q=zzzqqq없는검색어',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(4000);
  rows.push({폭:w, ...await p.evaluate(()=>{
    const sc=document.querySelector('.tm-scroll-area');
    const le=sc?.querySelector('.tm-list-empty');
    const fill=sc?.querySelector('.tm-empty-state-fill');
    if(!sc||!le) return {err:'요소 없음'};
    const c=getComputedStyle(le), r=le.getBoundingClientRect();
    const wrap=[...sc.children][0];
    return {
      empty_display:c.display, empty_dir:c.flexDirection, empty_minH:c.minHeight,
      empty_h:Math.round(r.height),
      wrap_h:Math.round(wrap.getBoundingClientRect().height),
      fill_h:fill?Math.round(fill.getBoundingClientRect().height):null,
      fill_top:fill?Math.round(fill.getBoundingClientRect().top):null,
      overflow:Math.max(0,Math.round(sc.scrollHeight-sc.clientHeight)),
    };
  })});
  await new Promise(r=>setTimeout(r,2500));
}
await b.close();
console.log(`\n[${label}] 서빙 ${sha}`);
console.table(rows);
