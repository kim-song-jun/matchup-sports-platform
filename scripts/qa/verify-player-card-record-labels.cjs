// Headed route QA. Deployed Alpha is the default; credentials stay in memory.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/playwright/visual-audit/player-card-record-labels');
const snapshot = process.env.QA_PROFILE_SNAPSHOT;
if (!snapshot) throw new Error('QA_PROFILE_SNAPSHOT must point to a public profile JSON snapshot');
const profile = JSON.parse(fs.readFileSync(snapshot, 'utf8'));
const account = process.env.QA_ACCOUNTS_CSV ? JSON.parse(execFileSync('python3', ['-c',
  'import csv,json,sys\nwith open(sys.argv[1],encoding="utf-8-sig") as f:\n rows=[r for r in csv.DictReader(f) if r["선수"]==sys.argv[2]]\nif len(rows)!=1: raise ValueError("Expected one QA account")\nr=rows[0]\nprint(json.dumps({"email":r["로그인 아이디"],"password":r["비밀번호"]}))',
  process.env.QA_ACCOUNTS_CSV, profile.displayName], {encoding:'utf8'})) : null;

(async () => {
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({headless:false, executablePath:process.env.QA_CHROME_PATH, args:['--no-sandbox'], timeout:30000});
  const cdp = await browser.newBrowserCDPSession();
  const processes = (await cdp.send('SystemInfo.getProcessInfo')).processInfo;
  fs.writeFileSync(path.join(out,'browser-owner.json'), JSON.stringify({runnerPid:process.pid, headed:true, processes},null,2));
  const results=[];
  const ownerSessions=new Map();
  try {
    for (const [phase, origin] of [['before',process.env.QA_BEFORE_ORIGIN || 'https://alpha.teameet.co.kr'],['after',process.env.QA_AFTER_ORIGIN || 'https://alpha.teameet.co.kr']].filter(([phase])=>!process.env.QA_PHASE || phase===process.env.QA_PHASE)) {
      for (const route of [...(account ? ['owner'] : []),'profile','share']) {
        for (const width of [390,768,1440]) {
          const context = await browser.newContext({viewport:{width,height:900}, reducedMotion:'reduce'});
          const page = await context.newPage();
          if (route==='owner') {
            const login=await context.request.post(origin+'/api/v1/auth/login',{data:account});
            if(!login.ok())throw Error('QA owner login failed');
            ownerSessions.set(context.request,origin);
            await context.addInitScript(()=>localStorage.setItem('teameet.v1.session','active'));
            await page.goto(origin+'/home',{waitUntil:'domcontentloaded',timeout:120000});
            const me=await page.request.get(origin+'/api/v1/auth/me');
            if(!me.ok())throw Error('QA owner session unavailable');
            await page.locator('a[href="/my"]:visible').first().waitFor({state:'visible',timeout:30000});
          }
          const errors=[], network=[];
          page.on('pageerror',e=>errors.push(e.message));
          page.on('response',r=>{if(r.status()>=400)network.push({path:new URL(r.url()).pathname,status:r.status()});});
          const url=route==='owner'?origin+'/my':origin+'/users/'+profile.userId+(route==='share'?'/card':'');
          await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
          const card=page.locator('.tm-player-card').first();
          await card.waitFor({state:'visible',timeout:90000});
          await card.scrollIntoViewIfNeeded();
          await page.screenshot({path:path.join(out,`${phase}-${route}-${width}-front.png`),fullPage:true});
          await page.getByRole('button',{name:/카드 뒤집기/}).click();
          await page.waitForTimeout(600);
          const back=page.locator('.tm-pcard-backface').first();
          const text=await back.innerText();
          const metrics=await back.evaluate(el=>{
            const box=el.getBoundingClientRect(),eq=el.querySelector('.tm-pcard-back-eq').getBoundingClientRect();
            return {clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,equationInside: eq.bottom<=box.bottom,documentOverflow:document.documentElement.scrollWidth>innerWidth};
          });
          await page.screenshot({path:path.join(out,`${phase}-${route}-${width}-back.png`),fullPage:true});
          const response=await page.request.get(origin+'/api/v1/users/'+profile.userId+'/public-profile');
          if(!response.ok())throw Error('Public card API unavailable for comparison');
          const expected=(await response.json()).data.playerCard;
          const records=expected.records;
          const pointValues=expected.stats.filter(s=>s.unlocked&&s.value!==null).map(s=>`${s.value}점`);
          const row={phase,route,width,metrics,errors,network,text,records:records||null,hasRawRecords:Boolean(records)&&text.includes(`실제 ${records.goals}골 / ${records.appearances}경기`)&&text.includes(`실제 ${records.assists}도움 / ${records.appearances}경기`),hasPointUnits:pointValues.every(value=>text.includes(value)),hasSubjectiveTags:/성실 출석|골 결정력/.test(text)};
          results.push(row);
          fs.writeFileSync(path.join(out,'route-results.json'),JSON.stringify(results,null,2));
          console.log(JSON.stringify({phase,route,width,metrics,errors,network,hasRawRecords:row.hasRawRecords,hasPointUnits:row.hasPointUnits,hasSubjectiveTags:row.hasSubjectiveTags}));
          if(phase==='after'&&(!row.hasRawRecords||!row.hasPointUnits||row.hasSubjectiveTags||errors.length||!metrics.equationInside||metrics.documentOverflow))throw Error('Updated card route verification failed');
          if(route==='owner') {
            const logout=await context.request.post(origin+'/api/v1/auth/logout');
            if(!logout.ok())throw Error('QA owner logout failed');
            ownerSessions.delete(context.request);
          }
          await context.close();
        }
      }
    }
  } finally {
    for(const [request,origin] of ownerSessions) {
      try { await request.post(origin+'/api/v1/auth/logout'); }
      catch { console.error('QA owner session cleanup failed'); }
    }
    await browser.close();
    console.log('Owned headed browser closed');
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
