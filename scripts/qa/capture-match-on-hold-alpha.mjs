import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const phase=process.argv[2]??'before';
const out=`output/playwright/visual-audit/match-on-hold/alpha-${phase}`;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false});
try {
 const rows=execFileSync('ps',['-eo','pid=,ppid=,comm='],{encoding:'utf8'}).trim().split('\n').map(x=>{const [pid,ppid,...name]=x.trim().split(/\s+/);return {pid:Number(pid),ppid:Number(ppid),name:name.join(' ')};});
 const owned=new Set([process.pid]);for(let n=0;n<10;n++)for(const r of rows)if(owned.has(r.ppid))owned.add(r.pid);
 await writeFile(`${out}/processes.json`,JSON.stringify(rows.filter(r=>owned.has(r.pid)),null,2));
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 const verdict=[];
 for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:1000});
  await page.goto('https://alpha.teameet.co.kr/matches/7bb12840-33b4-46b6-b200-ea0eb677a104',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(() => document.body.innerText.includes('종료 확인 중') || document.body.innerText.includes('보류 · 진행 결정 대기'),{},{timeout:60000});
  if(phase==='after')await page.getByRole('heading',{name:'보류 · 진행 결정 대기'}).waitFor();
  await page.locator('.tm-match-detail-title').waitFor({state:'visible'});
  await page.waitForTimeout(1500); // Let the existing route entrance animation finish before capturing.
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  const text=await page.locator('body').innerText();
  await page.screenshot({path:`${out}/match-${width}.png`,fullPage:true});
  verdict.push({width,overflow,url:page.url(),hasOnHold:text.includes('보류'),hasCompletionPending:text.includes('종료 확인 중')});
 }
 await writeFile(`${out}/verdict.json`,JSON.stringify({persona:'unauthenticated public reader; no mutation',verdict,errors},null,2));
 console.log(JSON.stringify({out,verdict,errors}));
 if(phase==='after'&&(verdict.some(v=>v.overflow||!v.hasOnHold||v.hasCompletionPending)||errors.length))throw new Error('Alpha QA failed');
}finally{await browser.close();}
