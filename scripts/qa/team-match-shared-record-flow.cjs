const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createHmac } = require('node:crypto');
const base = process.env.RECORD_QA_ORIGIN || 'http://127.0.0.1:3016';
const root = 'output/playwright/visual-audit/team-match-shared-record/after';
const fixtures = JSON.parse(fs.readFileSync('/tmp/teameet-record-fixtures.json'));
const results = []; const errors = []; const failedRequests = []; const bootstrapResponses = []; const consoleErrors = [];
let browser;
function cookie(id) {
  const iat = Math.floor(Date.now()/1000);
  const value = 'v1.' + Buffer.from(JSON.stringify({sub:id,iat,exp:iat+7*86400})).toString('base64url');
  return value + '.' + createHmac('sha256','record-qa-local-only-session-secret-20260921').update(value).digest('base64url');
}
async function context(id, width) {
  const ctx = await browser.newContext({viewport:{width,height:width===390?844:1000}});
  if(id) {
    await ctx.addCookies([{name:'teameet_v1_session',value:cookie(id),url:base,httpOnly:true,sameSite:'Lax'}]);
    await ctx.addInitScript(id=>{localStorage.setItem('teameet.v1.session','1');localStorage.setItem('teameet.v1.userId',id);},id);
  }
  const page = await ctx.newPage();
  page.on('pageerror',e=>errors.push({width,error:String(e)}));
  let bootstrapping = !!id;
  page.on('console', message => { if (message.type() === 'error' && !bootstrapping) consoleErrors.push({width, message: message.text(), location: message.location()}); });
  page.on('response',r=>{if(r.status()>=400 && r.url().includes('/api/v1/') && !r.url().includes('/auth/me')) (bootstrapping ? bootstrapResponses : failedRequests).push({width,status:r.status(),url:r.url()});});
  if(id) {
    await page.goto(base+'/home');
    await page.waitForTimeout(1200);
    if(page.url().includes('/terms')) {
      await page.getByRole('button',{name:/전체 동의/}).click();
      await page.getByRole('button',{name:'동의하고 계속하기'}).click();
      await page.waitForURL('**/home');
    }
    const auth = await ctx.request.get(base+'/api/v1/auth/me');
    if(!auth.ok()) throw new Error(`auth hydrate ${auth.status()} ${await auth.text()}`);
  }
  bootstrapping = false;
  return {ctx,page};
}
async function shot(page,width,name) {
  await page.addStyleTag({content:'nextjs-portal {display:none!important}'});
  await page.screenshot({path:path.join(root,`${width}-${name}.png`),fullPage:true});
  const dimensions = await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  results.push({width,step:name,url:page.url(),dimensions});
  console.log('PASS',width,name);
}
(async()=>{
  fs.mkdirSync(root,{recursive:true});
  browser=await chromium.launch({headless:false,args:['--no-sandbox']});
  for(const [index,width] of [390,768,1440].entries()) {
    const f=fixtures.fixtures[index];
    const publicUser=await context(null,width);
    const host=await context(f.userIds[1],width);
    const away=await context(f.userIds[3],width);
    const scheduled=fixtures.scheduled;
    await publicUser.page.goto(`${base}/team-matches/${scheduled.match.id}`);
    await expect(publicUser.page.locator('body')).toContainText('마포 풋살파크');
    await shot(publicUser.page,width,'01-before-start');
    await publicUser.page.goto(base+'/team-matches');
    await expect(publicUser.page.getByText('진행 중').first()).toBeVisible();
    await shot(publicUser.page,width,'02-live-list');
    await publicUser.page.goto(`${base}/team-matches/${f.match.id}`);
    await expect(publicUser.page.getByRole('region',{name:'경기 현황'})).toBeVisible();
    await expect(publicUser.page.getByRole('button',{name:'득점 추가'})).toHaveCount(0);
    await shot(publicUser.page,width,'03-public-detail');
    await host.page.goto(`${base}/team-matches/${f.match.id}`);
    await expect(host.page).toHaveURL(new RegExp(`/team-matches/${f.match.id}/record$`));
    await expect(host.page.getByRole('button',{name:'득점 추가'})).toBeVisible();
    await away.page.goto(`${base}/team-matches/${f.match.id}`);
    await expect(away.page).toHaveURL(new RegExp(`/team-matches/${f.match.id}/record$`));
    await shot(host.page,width,'04-participant-scoreboard');
    await host.page.getByRole('button',{name:'득점 추가'}).click();
    await host.page.getByLabel('득점 선수').selectOption(f.participants[0].id);
    await host.page.getByLabel('득점 시간 (선택)').fill('12');
    await shot(host.page,width,'05-add-goal');
    await host.page.getByRole('button',{name:'득점 등록'}).click();
    await expect(away.page.getByLabel('점수 1 대 0')).toBeVisible({timeout:10000});
    await shot(away.page,width,'06-other-player-synced');
    await away.page.getByRole('button',{name:/김민수.*수정/}).click();
    await away.page.getByLabel('득점 선수').selectOption(f.participants[1].id);
    await away.page.getByRole('button',{name:'수정 저장'}).click();
    await expect(host.page.getByRole('button',{name:/박지훈.*삭제/})).toBeVisible({timeout:10000});
    await shot(away.page,width,'07-edited-scorer');
    await host.page.getByRole('button',{name:/박지훈.*삭제/}).click();
    await expect(host.page.getByLabel('점수 0 대 0')).toBeVisible();
    await host.page.getByText(/^변경 이력 ·/).click();
    await host.page.getByRole('button',{name:'이 변경 되돌리기'}).first().click();
    await expect(away.page.getByLabel('점수 1 대 0')).toBeVisible({timeout:10000});
    await away.page.getByText(/^변경 이력 ·/).click();
    await expect(away.page.getByText('변경 되돌리기', {exact:false}).first()).toBeVisible({timeout:10000});
    await shot(host.page,width,'08-restored-history');
    await host.page.getByText(/^변경 이력 ·/).click();
    await away.page.getByText(/^변경 이력 ·/).click();
    // Keep a draft open while the other player adds a goal: stale overwrite is blocked in the actual browser.
    await host.page.getByRole('button',{name:'득점 추가'}).click();
    await host.page.getByLabel('득점 선수').selectOption(f.participants[0].id);
    await away.page.getByRole('button',{name:'득점 추가'}).click();
    await away.page.getByLabel('득점 선수').selectOption(f.participants[2].id);
    await away.page.getByRole('button',{name:'득점 등록'}).click();
    await expect(away.page.getByLabel('점수 1 대 1')).toBeVisible({timeout:10000});
    await host.page.bringToFront();
    await expect(host.page.getByRole('button',{name:'득점 등록'})).toBeDisabled({timeout:10000});
    await expect(host.page.getByText(/작성 중 다른 참가자가/)).toBeVisible();
    await shot(host.page,width,'09-concurrent-edit');
    await host.page.getByRole('button',{name:'최신 기록 확인'}).click();
    await host.page.getByRole('button',{name:'우리 팀 종료 확인'}).click();
    await shot(host.page,width,'10-end-confirm-dialog');
    await host.page.getByRole('button',{name:'이 기록으로 종료 확인'}).click();
    await expect(away.page.getByText('확인 완료',{exact:true})).toHaveCount(1,{timeout:10000});
    await shot(away.page,width,'11-other-team-confirmation');
    await away.page.getByRole('button',{name:'우리 팀 종료 확인'}).click();
    await away.page.getByRole('button',{name:'이 기록으로 종료 확인'}).click();
    await expect(host.page.getByText('결과가 확정되어 기록이 잠겼어요.')).toBeVisible({timeout:10000});
    await expect(host.page.getByRole('button',{name:'득점 추가'})).toHaveCount(0);
    await shot(host.page,width,'12-official-locked');
    await host.ctx.close(); await away.ctx.close(); await publicUser.ctx.close();
  }
  fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify({results,errors,failedRequests,bootstrapResponses,consoleErrors},null,2));
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]); expect(consoleErrors).toEqual([]);
})().catch(e=>{fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'failure.json'),JSON.stringify({error:String(e),results,errors,failedRequests},null,2));console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
