const {chromium}=require('@playwright/test');
const fs=require('node:fs/promises');const path=require('node:path');
async function main(){
 const phase=process.argv[2];if(!['before','after'].includes(phase))throw Error('phase required');
 const origin='https://alpha.teameet.co.kr',id='aef0d98f-17eb-4590-b27d-a2d8bab765e6';
 const out=path.resolve('docs/screenshots/league-detail-routes',phase);await fs.mkdir(out,{recursive:true});
 const server=await chromium.launchServer({channel:'chrome',headless:false});console.log(JSON.stringify({node:process.pid,parent:process.ppid,browser:server.process().pid}));
 const browser=await chromium.connect(server.wsEndpoint()),results=[];
 try{for(const width of [390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage();
  const get=async route=>(await (await context.request.get(origin+route)).json()).data;
  const league=await get('/api/v1/league-matches/'+id),recent=(await get('/api/v1/league-matches?limit=30')).items[0];
  const fixture=league.fixtures.find(f=>f.status==='completed')||league.fixtures[0];
  const errors=[],failed=[];page.on('pageerror',e=>errors.push({route:new URL(page.url()).pathname,message:e.message}));page.on('response',r=>{if(r.status()>=400)failed.push({path:new URL(r.url()).pathname,status:r.status()});});
  const scenarios=[
   {name:'search',route:'/search?q='+encodeURIComponent(recent.title),target:recent.leagueId,select:()=>page.getByRole('button').filter({hasText:recent.title}).filter({has:page.getByText('정규 리그',{exact:true})}).first()},
   {name:'team',route:'/teams/'+league.teamIds[0],target:id,select:()=>page.locator('a[href*="/'+id+'"]:visible').first()},
   {name:'fixture-parent',route:'/league-matches/'+id+'/fixtures/'+fixture.teamMatchId,target:id,select:()=>page.getByRole('link',{name:league.title,exact:true}).first()},
   {name:'awards-parent',route:'/league-matches/'+id+'/awards',target:id,select:()=>page.getByRole('link',{name:/리그 상세로|리그 순위표 보러가기/}).first()}
  ];
  for(const item of scenarios){try{
   await page.goto(origin+item.route,{waitUntil:'domcontentloaded'});const control=item.select();await control.waitFor({state:'visible',timeout:20000});
   await page.screenshot({path:path.join(out,width+'-'+item.name+'.png')});await control.click();
   await page.waitForURL(url=>url.pathname.endsWith('/'+item.target),{timeout:20000});
   const actual=new URL(page.url());const passed=phase==='before'||actual.pathname==='/tournaments/'+item.target;
   results.push({width,scenario:item.name,passed,url:actual.pathname+actual.search});
  }catch(error){results.push({width,scenario:item.name,passed:item.name==='team'?undefined:false,blocked:item.name==='team',error:error.message});await page.screenshot({path:path.join(out,width+'-'+item.name+'-error.png')});}}
  results.push({width,errors,failed});await context.close();
 }}finally{await browser.close();await server.close();await fs.writeFile(path.join(out,'related-evidence.json'),JSON.stringify(results,null,2));}
 console.log(JSON.stringify(results));if(results.some(r=>r.passed===false))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
