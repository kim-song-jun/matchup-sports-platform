const { chromium } = require('@playwright/test');
const fs = require('node:fs');
(async () => {
 const phase = process.argv[2] || 'before';
 const output = `/tmp/teameet-avatar-qa/${phase}`;
 fs.mkdirSync(output, {recursive:true});
 const browser = await chromium.launch({headless:false, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 console.log(`QA runner PID=${process.pid} PPID=${process.ppid}`);
 const page = await browser.newPage();
 const errors=[]; const failed=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
 const records=[];
 try {
  for (const route of ['/teams','/tournaments','/team-matches']) {
   for(const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900});
    const response=await page.goto(`https://alpha.teameet.co.kr${route}`,{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('main').first().waitFor({state:'visible',timeout:15000});
    await page.screenshot({path:`${output}/${route.slice(1)}-${width}.png`,fullPage:true});
    records.push({route,width,status:response.status(),commit:response.headers()['x-teameet-commit'],url:page.url(),teamIcons:await page.locator('.lucide-users-round').count(),userIcons:await page.locator('.lucide-user-round').count(),patternRects:await page.locator('svg rect').count(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),links:await page.locator('a[href^="/teams/"],a[href^="/tournaments/"]').evaluateAll(nodes=>nodes.slice(0,10).map(n=>n.getAttribute('href')))});
   }
  }
 } finally { await browser.close(); }
 fs.writeFileSync(`${output}/evidence.json`,JSON.stringify({records,errors,failed},null,2));
 console.log(JSON.stringify({records,errors,nonAbortFailures:failed.filter(r=>r.error!=='net::ERR_ABORTED')},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
