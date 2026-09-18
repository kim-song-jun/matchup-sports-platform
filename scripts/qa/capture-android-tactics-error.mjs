/** Reproduce the observed Android 403 response in the local headed browser. */
import fs from 'node:fs';
import { chromium } from 'playwright';
const out='output/playwright/visual-audit/android-20260919';
const browser=await chromium.launch({headless:false});
const results=[];
try {
  for(const width of [390,768,1440]) {
    const context=await browser.newContext({viewport:{width,height:900},extraHTTPHeaders:{'x-v1-user-email':'host@teameet.v1'}});
    await context.addInitScript(()=>{localStorage.setItem('teameet.v1.session','active');localStorage.setItem('teameet.v1.userEmail','host@teameet.v1');});
    const page=await context.newPage();
    await page.route('**/api/v1/teams/*/games/*/tactics-board',route=>route.fulfill({status:403,json:{statusCode:403,code:'PERMISSION_DENIED',message:'전술보드는 그 팀의 팀원만 볼 수 있어요.'}}));
    await page.goto('http://127.0.0.1:3013/home');
    await page.getByText('오늘의 추천').first().waitFor();
    const entities=JSON.parse(fs.readFileSync(`${out}/entities.json`));
    const teamId=entities.v1Team[0].id;
    await page.goto(`http://127.0.0.1:3013/teams/${teamId}/tactics/a7af0134-1b08-49f8-bfe3-657d41181be7`);
    await page.getByText('이 팀의 전술은 볼 수 없어요').waitFor();
    const screenshot=`tactics-error-after-${width}.png`;
    await page.screenshot({path:`${out}/${screenshot}`});
    results.push({width,screenshot,scenario:'Controlled 403 matching device failure; no remote mutation',layout:await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}))});
    await context.close();
  }
} finally { await browser.close();fs.writeFileSync(`${out}/tactics-error-results.json`,JSON.stringify(results,null,2)); }
