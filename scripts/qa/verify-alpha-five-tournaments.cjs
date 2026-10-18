const {chromium}=require('@playwright/test');
const {readFile,mkdir,writeFile}=require('node:fs/promises');
const {execFileSync}=require('node:child_process');
const BASE='https://alpha.teameet.co.kr';
const IDS=Array.from({length:5},(_,i)=>`d5202610-1018-4000-8000-${String(i+1).padStart(12,'0')}`);
(async()=>{
 const credentials=JSON.parse(await readFile(process.argv[2],'utf8'));
 const output='tmp/qa-alpha-five/browser';await mkdir(output,{recursive:true});
 const server=await chromium.launchServer({headless:false});
 const receipt={browserPid:server.process().pid,parentPid:process.pid,viewport:{width:1440,height:1000},tournaments:[],consoleErrors:[],pageErrors:[],httpErrors:[]};
 console.log(execFileSync('ps',['-o','pid,ppid,args','-p',String(receipt.browserPid)],{encoding:'utf8'}));
 try{
  const browser=await chromium.connect(server.wsEndpoint());const context=await browser.newContext({viewport:receipt.viewport});
  const login=await context.request.post(BASE+'/api/v1/auth/login',{data:credentials});if(!login.ok())throw Error('Admin login failed: '+login.status());
  await context.addInitScript(()=>localStorage.setItem('teameet.v1.session','active'));
  const me=await context.request.get(BASE+'/api/v1/auth/me');if(!me.ok())throw Error('Authenticated session missing');
  const page=await context.newPage();
  page.on('pageerror',e=>receipt.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')receipt.consoleErrors.push(m.text())});page.on('response',r=>{if(r.status()>=400)receipt.httpErrors.push({status:r.status(),path:new URL(r.url()).pathname})});
  async function get(route){const response=await context.request.get(BASE+'/api/v1'+route);if(!response.ok())throw Error(route+': '+response.status());return(await response.json()).data;}
  // Hydrate the authenticated shell before entering the protected tournament route.
  await page.goto(BASE+'/admin',{waitUntil:'domcontentloaded'});
  await page.getByRole('link',{name:'대회',exact:true}).first().waitFor();
  for(const [index,id] of IDS.entries()){
   const registrations=await get(`/admin/tournaments/${id}/registrations?limit=50`);
   if(registrations.items.length!==20||registrations.items.some(r=>r.playerCount!==8||r.status!=='confirmed'))throw Error('Admin roster counts do not match20x8');
   const bracket=await get(`/admin/tournaments/${id}/bracket`);
   if(bracket.fixtures.length!==41||bracket.fixtures.filter(f=>f.result).length!==25)throw Error('Admin result projection mismatch');
   const roster=await get(`/admin/registrations/${registrations.items[0].id}/players`);
   if(roster.players.length!==8||roster.players.some(p=>!p.realName))throw Error('Existing player names missing');
   const groupFixture=bracket.fixtures.find(f=>f.homeRegistrationId&&f.awayRegistrationId&&!f.result);
   const lineups=await get(`/games/${groupFixture.game.id}/lineups`);
   if(lineups.length!==2||lineups.some(l=>l.participants.length!==8))throw Error('Remaining game does not have8players per side');
   await page.goto(BASE+`/admin/tournaments/${id}/bracket`,{waitUntil:'domcontentloaded'});
   await page.getByText(`(테스트) 20팀·8명 12강 · 조별 1경기 남음 ${String(index+1).padStart(2,'0')}`,{exact:true}).first().waitFor();
   await page.screenshot({path:`${output}/admin-${index+1}.png`,fullPage:true});
   receipt.tournaments.push({id,adminTeams:20,playersPerTeam:8,adminFixtures:41,completed:25,remainingGameLineups:[8,8],sampleRoster:8,adminPage:true});
  }
  await page.goto(BASE+`/tournaments/${IDS[0]}/bracket?tab=standings`,{waitUntil:'domcontentloaded'});
  await page.getByRole('region',{name:'12강 부전승',exact:true}).first().waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('svg path title')).filter(t=>t.textContent.startsWith('부전승 →')).length===4);
  await page.locator('[data-bracket-node^="bye-slot:"]').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:`${output}/public-bracket.png`,fullPage:true});receipt.publicByeConnections=4;
  await context.close();await browser.close();
 }finally{await server.close();receipt.browserClosed=true;await writeFile(output+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');}
 if(receipt.tournaments.length!==5||receipt.consoleErrors.length||receipt.pageErrors.length||receipt.httpErrors.length)throw Error('UI verification incomplete or has browser errors');
 console.log(JSON.stringify(receipt));
})().catch(e=>{console.error(e.message);process.exitCode=1});
