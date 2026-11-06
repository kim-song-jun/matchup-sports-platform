const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_MODULE || '../../node_modules/.pnpm/playwright-core@1.58.2/node_modules/playwright-core');
const mode = process.argv[2];
assert(['before','after'].includes(mode));
const output = path.resolve('docs/screenshots/pr2164-alpha-20261106');
fs.mkdirSync(output,{recursive:true});
const report = {mode,persona:'anonymous public visitor',origin:'https://alpha.teameet.co.kr',screenshots:[],errors:[],failedRequests:[],verdicts:[],cleanup:false};
(async()=>{
 const server = await chromium.launchServer({headless:false});
 report.browserPid=server.process().pid;report.parentPid=process.pid;
 console.log(JSON.stringify({browserPid:report.browserPid,parentPid:process.pid}));
 let browser;
 try {
  browser=await chromium.connect(server.wsEndpoint());
  const context=await browser.newContext({reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push({type:'pageerror',message:e.message,url:page.url()}));
  page.on('console',e=>{if(e.type()==='error')report.errors.push({type:'console',message:e.text()});});
  page.on('response',r=>{if(r.status()>=400 && r.url().startsWith(report.origin))report.failedRequests.push({url:r.url(),status:r.status()});});
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:width===390?844:1024});
   const response=await page.goto(report.origin+'/tournaments?kind=league',{waitUntil:'domcontentloaded'});
   report.commit=response.headers()['x-teameet-commit'];
   await page.getByRole('link',{name:/필터 열기/}).first().waitFor();
   await page.evaluate(()=>document.fonts.ready);
   await page.screenshot({path:path.join(output,`${mode}-cards-${width}.png`),fullPage:true});
   report.screenshots.push(`${mode}-cards-${width}.png`);
   await page.getByRole('link',{name:/필터 열기/}).first().click();
   const dialog=page.getByRole('dialog',{name:'대회·리그 필터'});await dialog.waitFor();
   if(mode==='after'){
    const recruit=dialog.getByRole('group',{name:'모집 상태',exact:true});
    const progress=dialog.getByRole('group',{name:'진행 상태',exact:true});
    await progress.getByRole('button',{name:'진행 중',exact:true}).click();
    await recruit.getByRole('button',{name:'신청 접수 중',exact:true}).click();
    assert.equal(await progress.getByRole('button',{name:'전체',exact:true}).getAttribute('aria-pressed'),'true');
    await progress.getByRole('button',{name:'전체',exact:true}).click();
    assert.equal(await recruit.getByRole('button',{name:'신청 접수 중',exact:true}).getAttribute('aria-pressed'),'true');
    await page.screenshot({path:path.join(output,`${mode}-filter-${width}.png`),fullPage:true});
    report.screenshots.push(`${mode}-filter-${width}.png`);
    await dialog.getByRole('button',{name:'결과 보기',exact:true}).click();
    await page.waitForURL(url=>url.searchParams.get('stage')==='recruiting'&&!url.searchParams.has('filter'));
    await page.getByRole('link',{name:/필터 열기 — 현재 신청 접수 중/}).first().waitFor();
    assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)));
    report.verdicts.push({width,flow:'league: progress to recruiting, other-row All preserves selection, apply updates URL',verdict:'PASS'});
    await page.goto(report.origin+'/tournaments?kind=tournament',{waitUntil:'domcontentloaded'});
    await page.getByRole('link',{name:/필터 열기/}).first().click();
    const tournament=page.getByRole('dialog',{name:'대회·리그 필터'});await tournament.waitFor();
    assert.equal(await tournament.getByRole('button',{name:'준비 중',exact:true}).count(),0);
    report.verdicts.push({width,flow:'tournament filter excludes preparing',verdict:'PASS'});
   }else{
    await page.screenshot({path:path.join(output,`${mode}-filter-${width}.png`),fullPage:true});report.screenshots.push(`${mode}-filter-${width}.png`);
   }
  }
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  assert.equal(report.failedRequests.length,0,JSON.stringify(report.failedRequests));
  await context.close();
 }catch(e){report.failure=e.message;process.exitCode=1;}
 finally{if(browser)await browser.close();await server.close();report.cleanup=true;fs.writeFileSync(path.join(output,`${mode}-report.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})();
