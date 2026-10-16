const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
async function main() {
  const origin = process.env.QA_ORIGIN || 'http://localhost:3013';
  const member = process.env.QA_PERSONA === 'fixture-member';
  const preview = process.env.QA_PREVIEW === '1';
  const phase = preview ? 'preview' : (process.env.QA_PHASE || 'after');
  const route = '/tournaments/1701404b-317b-4018-a90d-2d160b6af45d?from=%2Ftournaments%3Fkind%3Dleague';
  const out = path.resolve('docs/screenshots/tournament-sidebar-local', member ? 'fixture-member' : 'anonymous', phase);
  await fs.mkdir(out, {recursive:true});
  const server = await chromium.launchServer({headless:false, executablePath:process.env.QA_CHROME_PATH});
  console.log(JSON.stringify({nodePid:process.pid,parentPid:process.ppid,browserPid:server.process().pid}));
  const browser = await chromium.connect(server.wsEndpoint());
  const results=[];
  try {
    for (const width of (preview ? [1440] : (process.env.QA_WIDTHS ? process.env.QA_WIDTHS.split(',').map(Number) : [1440,768,390]))) {
      const context=await browser.newContext({viewport:{width,height:1000}});
      if (member) {
        // Browser-only response fixtures: no server identity or membership is changed.
        await context.addInitScript(() => {
          localStorage.setItem('teameet.v1.userId','qa-sidebar-member');
          localStorage.setItem('teameet.v1.session','active');
        });
        const fixtures = new Map([
          ['/api/v1/auth/me', {user:{id:'qa-sidebar-member',email:null,onboardingStatus:'completed'},profile:{displayName:'QA 참가팀원'},termsCompliance:{compliant:true,pendingRequiredDocumentIds:[],nextRoute:null},verification:{emailVerified:true,phoneVerified:true}}],
          ['/api/v1/me/teams', {items:[{teamId:'qa-sidebar-team',name:'QA 참가팀 (화면 검증)',role:'member',logoUrl:null}]}],
          ['/api/v1/tournaments/1701404b-317b-4018-a90d-2d160b6af45d/registrations/my-registrations', [{id:'qa-sidebar-registration',teamId:'qa-sidebar-team',teamName:'QA 참가팀 (화면 검증)',status:'confirmed',rosterLockedAt:null,rosterDeadlineOverrideAt:null,playerCount:7}]],
          ['/api/v1/tournaments/1701404b-317b-4018-a90d-2d160b6af45d/announcements/me', {items:[]}],
        ]);
        await context.route('**/api/v1/**', async route => {
          const request=route.request();
          const data=fixtures.get(new URL(request.url()).pathname);
          if (data !== undefined) return route.fulfill({json:{status:'success',data,timestamp:new Date().toISOString()}});
          if (request.method() !== 'GET') return route.abort();
          return route.continue();
        });
      }
      const page=await context.newPage();
      const errors=[], failures=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.status()>=400)failures.push({url:r.url(),status:r.status()});});
      await page.goto(origin+route,{waitUntil:'domcontentloaded',timeout:180000});
      await page.getByRole('heading',{level:1}).first().waitFor({timeout:90000});
      if (member) {
        await page.getByRole('heading',{name:'우리 팀 참가',exact:true}).waitFor({timeout:30000});
        const entry=page.getByRole('heading',{name:'우리 팀 참가',exact:true});
        const inAside=await entry.evaluate(el=>Boolean(el.closest('.tm-tournament-detail-aside')));
        if (phase === 'after' && inAside !== (width >= 1024)) throw new Error('participant card in wrong column');
        if (await entry.count() !== 1) throw new Error('duplicate participant card');
      }
      await page.screenshot({path:path.join(out,`${width}.png`),fullPage:true});
      results.push({width,persona:member ? 'fixture member; public Alpha content, intercepted membership only' : 'anonymous; real Alpha public API',url:page.url(),errors,failures,
        alignment:await page.evaluate(() => {
          const link = [...document.querySelectorAll('.tm-tournament-detail-article a')].find(el => el.textContent.includes('진행 중인 리그 보기'));
          const aside = document.querySelector('.tm-tournament-detail-aside');
          const body = document.querySelector('.tm-tournament-detail-grid > .tm-match-detail-body');
          if (!link || !aside || !body || innerWidth < 1024) return null;
          const a=link.getBoundingClientRect(), b=aside.getBoundingClientRect(), c=body.getBoundingClientRect();
          return {buttonRight:a.right,asideRight:b.right,rightDelta:a.right-b.right,leftDelta:a.left-c.left-parseFloat(getComputedStyle(body).paddingLeft)};
        }),
        overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),
        headings:await page.getByRole('heading',{level:1}).allTextContents(),
        noticeCount:await page.getByText('참가 전 꼭 확인해 주세요',{exact:true}).count()});
      if (preview) {
        await page.evaluate(() => {
          document.title = '[테스트 참가팀원 미리보기] ' + document.title;
          const note = document.createElement('div');
          note.textContent = '테스트 참가팀원 · 실제 로그인 아님 · 읽기 전용 미리보기';
          note.setAttribute('role', 'status');
          Object.assign(note.style, {position:'fixed',bottom:'16px',left:'50%',transform:'translateX(-50%)',zIndex:'2147483647',padding:'12px 20px',borderRadius:'12px',background:'#191f28',color:'#fff',fontSize:'14px',fontFamily:'sans-serif'});
          document.body.appendChild(note);
        });
        await page.bringToFront();
        console.log('PREVIEW_READY: 참가 확정 팀원 화면. 창을 닫으면 미리보기가 종료됩니다.');
        await new Promise(resolve => page.once('close', resolve));
      }
      await context.close();
    }
  } finally {
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    await browser.close(); await server.close();
  }
  console.log(JSON.stringify(results,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});