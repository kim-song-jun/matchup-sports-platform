const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
  const phase = process.argv[2];
  if (!['before','after'].includes(phase)) throw new Error('before or after required');
  const origin = 'https://alpha.teameet.co.kr';
  const id = 'aef0d98f-17eb-4590-b27d-a2d8bab765e6';
  const out = path.resolve('docs/screenshots/league-detail-routes', phase);
  await fs.mkdir(out, {recursive:true});
  const server = await chromium.launchServer({channel:'chrome',headless:false});
  console.log(JSON.stringify({qaPid:process.pid,parentPid:process.ppid,browserPid:server.process().pid}));
  const browser = await chromium.connect(server.wsEndpoint());
  const results=[];
  try {
    for (const width of [390,768,1440]) {
      const context=await browser.newContext({viewport:{width,height:1000}});
      const page=await context.newPage();
      const active=(await (await context.request.get(origin+'/api/v1/league-matches?state=active&limit=4')).json()).data.items.map(item=>item.leagueId);
      const detailTitle=(await (await context.request.get(origin+'/api/v1/tournaments/'+id)).json()).data.title;
      const errors=[],failed=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.status()>=400)failed.push({path:new URL(r.url()).pathname,status:r.status()});});
      for(const route of ['/home','/tournaments?kind=league']) {
        await page.goto(origin+route,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.querySelectorAll('a[href*="/tournaments/"],a[href*="/league-matches/"]').length>0,{},{timeout:20000}).catch(()=>{});
        if(route==='/home' && active.length) await page.waitForFunction(ids=>Array.from(document.querySelectorAll('a')).some(a=>ids.some(id=>a.getAttribute('href')?.includes('/'+id+'?'))),active,{timeout:20000});
        const links=await page.locator('a').evaluateAll(as=>as.map(a=>({text:a.textContent?.trim(),href:a.getAttribute('href')})).filter(a=>/^\/(league-matches|tournaments)\/[^/?]+(?:\?|$)/.test(a.href||'')));
        results.push({width,route,landed:new URL(page.url()).pathname,links});
        await page.screenshot({path:path.join(out,width+(route==='/home'?'-home':'-list')+'.png')});
        if(route==='/home') {
          const leagueLink=links.find(link=>active.some(id=>link.href.includes('/'+id+'?')));
          if(leagueLink) {
            await page.locator('a[href="'+leagueLink.href+'"]').first().click();
            await page.waitForURL(url=>url.pathname.includes(leagueLink.href.split('?')[0]));
            results.push({width,action:'home-league-click',url:page.url()});
            if(phase==='after' && !new URL(page.url()).pathname.startsWith('/tournaments/'))throw new Error('home league route failed');
          }
        }
        if(route.startsWith('/tournaments')) {
          const target=page.locator('a[href^="/tournaments/'+id+'?"]').first();
          if(await target.count()) {await target.click();await page.waitForURL('**/tournaments/'+id+'?**');results.push({width,action:'list-click',url:page.url()});}
        }
      }
      for(const alias of ['/league-matches/','/leagues/']) {
        const response=await page.goto(origin+alias+id+'?from=%2Fhome',{waitUntil:'domcontentloaded'});
        if(response.status()<400)await page.waitForFunction(title=>document.body.innerText.includes(title),detailTitle,{timeout:20000});
        const current=new URL(page.url());
        results.push({width,alias,status:response.status(),path:current.pathname,from:current.searchParams.get('from')});
        if(phase==='after' && (current.pathname!='/tournaments/'+id || current.searchParams.get('from')!='/home'))throw new Error('alias redirect failed: '+page.url());
        if(alias==='/league-matches/')await page.screenshot({path:path.join(out,width+'-detail.png')});
      }
      results.push({width,errors,failed,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
      await context.close();
    }
  } finally {await browser.close();await server.close();await fs.writeFile(path.join(out,'evidence.json'),JSON.stringify(results,null,2));}
  console.log(JSON.stringify(results));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
