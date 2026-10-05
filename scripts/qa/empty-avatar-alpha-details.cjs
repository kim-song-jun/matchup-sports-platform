const { chromium } = require('@playwright/test');
const fs = require('node:fs');
(async () => {
 const phase = process.argv[2] || 'before';
 const output = `/tmp/teameet-avatar-qa/${phase}`;
 fs.mkdirSync(output, {recursive:true});
 const browser = await chromium.launch({headless:false, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 console.log(`QA runner PID=${process.pid} PPID=${process.ppid}`);
 console.log('Owned browser children:', require('node:child_process').execFileSync('ps',['--ppid',String(process.pid),'-o','pid,ppid,comm'],{encoding:'utf8'}).trim());
 const page = await browser.newPage();
 const errors=[]; const failed=[]; const consoleErrors=[]; let injectingImageFailure=false;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText,intentional:injectingImageFailure&&r.url().includes('/_next/image')}));
 page.on('console',m=>{if(m.type()==='error') consoleErrors.push({message:m.text(),url:m.location().url,intentional:injectingImageFailure&&m.location().url?.includes('/_next/image')});});
 const records=[];
 try {
  for (const route of (process.env.QA_ROUTES === '' ? [] : (process.env.QA_ROUTES || '/teams,/tournaments,/team-matches').split(','))) {
   for(const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900});
    const response=await page.goto(`https://alpha.teameet.co.kr${route}`,{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('main').first().waitFor({state:'visible',timeout:15000});
    await page.waitForFunction(() => Array.from(document.images).filter(img => { const r=img.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }).every(img => img.complete), null, {timeout:8000}).catch(() => {});
    await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
    await page.screenshot({path:`${output}/${route.slice(1)}-${width}.png`,fullPage:true});
    records.push({route,width,status:response.status(),commit:response.headers()['x-teameet-commit'],url:page.url(),teamIcons:await page.locator('.lucide-users-round').count(),userIcons:await page.locator('.lucide-user-round').count(),patternRects:await page.locator('svg rect').count(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),links:await page.locator('a[href^="/teams/"],a[href^="/tournaments/"]').evaluateAll(nodes=>nodes.slice(0,10).map(n=>n.getAttribute('href')))});
    const selector = route === '/teams' ? 'a[href^="/teams/"]' : route === '/tournaments' ? 'a[href^="/tournaments/"]' : 'a[href^="/team-matches/"]';
    const href=await page.locator(selector).evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')).find(h=>/^\/(teams|tournaments|team-matches)\/[0-9a-f-]{36}(?:[?]|$)/.test(h)));
    const link = href ? page.locator(`a[href="${href}"]`).first() : null;
    if (link && href && !href.endsWith('/new')) {
      await link.click();
      await page.waitForURL(url=>url.pathname===href.split('?')[0],{timeout:15000});
      await page.locator('main').first().waitFor({state:'visible'});
      await page.waitForFunction(()=> (document.querySelector('main')?.innerText.length || 0) > 150, null, {timeout:15000});
      await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
    await page.screenshot({path:`${output}/${route.slice(1)}-detail-${width}.png`,fullPage:true});
      records.push({route:href,width,clicked:true,url:page.url(),teamIcons:await page.locator('.lucide-users-round').count(),userIcons:await page.locator('.lucide-user-round').count(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),heading:await page.locator('main').innerText().then(t=>t.slice(0,150))});
      if(route==='/tournaments') {
        const bracket = page.locator('a[href$="/bracket"]:visible').first();
        if(await bracket.count()) {
          const bracketHref=await bracket.getAttribute('href');
          await bracket.click();
          await page.waitForURL(url=>url.pathname===bracketHref,{timeout:15000});
          await page.locator('main').first().waitFor({state:'visible'});
      await page.waitForFunction(()=> (document.querySelector('main')?.innerText.length || 0) > 150, null, {timeout:15000});
          await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
    await page.screenshot({path:`${output}/bracket-${width}.png`,fullPage:true});
          records.push({route:bracketHref,width,clicked:true,teamIcons:await page.locator('.lucide-users-round').count(),patternRects:await page.locator('svg rect').count(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
        }
      }

    }

   }
  }
  if(process.env.QA_PROFILE_ID) {
    for(const width of [390,768,1440]) {
      await page.setViewportSize({width,height:900});
      const route=`/users/${process.env.QA_PROFILE_ID}`;
      const response=await page.goto(`https://alpha.teameet.co.kr${route}`,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=> (document.querySelector('main')?.innerText.length || 0) > 150,null,{timeout:15000});
      await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
    await page.screenshot({path:`${output}/public-profile-${width}.png`,fullPage:true});
      records.push({route,width,status:response.status(),commit:response.headers()['x-teameet-commit'],userIcons:await page.locator('main .lucide-user-round').count(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
    }
  }
  if(phase==='after') {
    injectingImageFailure=true;
    await page.route('**/_next/image?*',route=>route.abort('failed'));
    for(const width of [390,768,1440]) {
      await page.setViewportSize({width,height:900});
      await page.goto('https://alpha.teameet.co.kr/teams',{waitUntil:'domcontentloaded'});
      await page.locator('main .lucide-users-round').first().waitFor({state:'visible'});
      await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
    await page.screenshot({path:`${output}/teams-image-failure-${width}.png`,fullPage:true});
      records.push({route:'/teams',width,scenario:'intentional-image-failure',teamIcons:await page.locator('main .lucide-users-round').count(),patternRects:await page.locator('main svg rect').count(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
    }
    await page.unroute('**/_next/image?*');
  }

 } finally {
  await browser.close();
  fs.writeFileSync(`${output}/evidence.json`,JSON.stringify({records,errors,consoleErrors,failed},null,2));
 }
 console.log(JSON.stringify({records,errors,consoleErrors:consoleErrors.filter(r=>!r.intentional),nonAbortFailures:failed.filter(r=>r.error!=='net::ERR_ABORTED'&&!r.intentional)},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
