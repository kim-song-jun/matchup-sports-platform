import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const baseURL = process.env.QA_WEB_ORIGIN ?? 'http://127.0.0.1:3149';
const api = process.env.QA_API_ORIGIN ?? 'http://127.0.0.1:18149';
const phase = process.env.QA_PHASE ?? 'before';
const out = path.resolve(`docs/screenshots/task149-parity-validation/${phase}`);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
const report = [];
try {
  for (const [viewportName, width, height] of [['mobile',390,844],['tablet',768,1024],['desktop',1440,900]]) {
    for (const kind of ['admin','regular']) {
      const email = kind === 'admin' ? 'admin@teameet.v1' : 'host@teameet.v1';
      const context = await browser.newContext({ baseURL, viewport: { width, height }, timezoneId:'Asia/Seoul', extraHTTPHeaders: { 'x-v1-user-email': email } });
      const page = await context.newPage();
      const errors=[];const failures=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
      page.on('response',r=>{if(r.status()>=400 && r.url().includes('/api/')) failures.push(`${r.status()} ${r.url()}`);});
      await page.addInitScript(email=>localStorage.setItem('teameet.v1.userEmail',email),email);
      const session = await context.request.post(`${api}/api/v1/auth/dev-session`,{headers:{'x-v1-user-email':email}});
      expect(session.status()).toBe(201);
      await page.goto('/home');
      await expect(page.locator('body')).not.toContainText('로그인이 필요해요');
      await page.waitForLoadState('networkidle');
      if(kind==='regular') {
        const res=await context.request.get(`${api}/api/v1/me/teams?permission=manage_team`);
        const data=(await res.json()).data;
        const team=data.items.find(t=>t.canCreateTeamMatch);
        if(!team) throw new Error('No creatable seed team');
        const start=new Date(Date.now()+14*86400000);const date=start.toISOString().slice(0,10);
        await page.evaluate(({team,date})=>{
          localStorage.setItem('teameet:v1:team-match-selection',JSON.stringify({savedAt:Date.now(),value:{teamId:team.teamId,sportId:team.sport.sportId,regionId:'region-seoul-jongno'}}));
          localStorage.setItem('teameet:v1:team-match-draft:v3',JSON.stringify({savedAt:Date.now(),value:{title:`주말 친선 팀매치 ${Date.now()}`,description:'함께 즐기는 친선 경기예요.',venue:'잠실 풋살장',date,startTime:'23:00',endTime:'',grade:'중수',format:'5:5',style:['친선'],gender:'성별 무관'}}));
        },{team,date});
        await page.goto('/team-matches/new/place-time');
        await expect(page.getByText('장소와 시간',{exact:true}).first()).toBeVisible();
        await expect(page.locator('#field-startTime')).toHaveValue('23:00');
      }else{
        await page.goto('/admin/team-matches/new');
        await expect(page.getByLabel('매치 제목')).toBeVisible();
      }
      let createdId;
      // Each viewport gets its own ordinary recruitment (avoid idempotent replay of identical draft).
      if (phase === 'after' && kind === 'regular') {
        await page.goto('/team-matches/new/condition');
        await page.getByLabel('경기 스타일 직접입력').fill('패스 연습');
        await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0;});});
        await page.screenshot({path:path.join(out,`${viewportName}-regular-condition.png`),fullPage:true});
        await page.getByRole('button',{name:'다음',exact:true}).click();
        await expect(page.locator('#field-startTime')).toHaveValue('23:00');
      }
      if (phase === 'after') {
        const date = new Date(Date.now()+14*86400000).toISOString().slice(0,10);
        const nextDate = new Date(Date.now()+15*86400000).toISOString().slice(0,10);
        const title = `조건 일치 검증 ${kind} ${viewportName} ${Date.now()}`;
        if (kind === 'admin') {
          const sports = (await (await context.request.get(`${api}/api/v1/master/sports`)).json()).data.sports;
          await page.getByLabel('종목',{exact:true}).selectOption(sports.find(s=>s.code==='futsal').id);
          await page.getByLabel('지역',{exact:true}).selectOption('region-seoul-jongno');
          await page.getByLabel('매치 제목').fill(title);
          await page.getByLabel('경기 장소').fill('잠실 풋살장');
          await page.getByLabel('실력등급').selectOption('intermediate');
          await page.getByLabel('경기방식',{exact:true}).fill('5:5');
          await page.getByRole('button',{name:'친선',exact:true}).click();
          await page.getByLabel('경기 스타일 직접입력').fill('패스 연습');
          await page.getByLabel('총비용').fill('90000');
          await page.getByLabel('상대팀 부담금').fill('30000');
          await page.getByLabel('경기 시작').fill(`${date}T23:00`);
          await page.getByLabel('경기 종료 (선택)').fill(`${nextDate}T01:00`);
          await page.getByLabel('신청 마감').fill('2000-01-01T12:00');
          await expect(page.getByRole('button',{name:'팀 신청 모집 시작하기'})).toBeDisabled();
          await expect(page.getByRole('alert').filter({hasText:'신청 마감은 지금 이후'})).toBeVisible();
          await page.screenshot({path:path.join(out,`${viewportName}-admin-invalid.png`),fullPage:true});
          await page.getByLabel('신청 마감').fill('');
        } else {
          await page.locator('#field-endTime').fill('22:00');
          await page.getByRole('button',{name:'다음',exact:true}).click();
          await expect(page.getByText('종료 시간은 시작 시간보다 늦어야 해요',{exact:true})).toBeVisible();
          await page.screenshot({path:path.join(out,`${viewportName}-regular-invalid.png`),fullPage:true});
          await page.locator('#field-endTime').fill('01:00');
          await page.locator('#field-endDate').fill(nextDate);
        }
      }
      await page.addStyleTag({content:'nextjs-portal,[data-nextjs-dev-tools-button]{display:none!important}'});
      await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0;});});
      await page.screenshot({path:path.join(out,`${viewportName}-${kind}.png`),fullPage:true});
      if (phase === 'after') {
        if(kind==='regular') {
          await page.getByRole('button',{name:'다음',exact:true}).click();
          await expect(page).toHaveURL(/\/confirm$/);
          await expect(page.getByText('입력한 내용을 확인해 주세요',{exact:true})).toBeVisible();
        }
        const responsePromise = page.waitForResponse(r=>r.request().method()==='POST' && new URL(r.url()).pathname === (kind==='admin'?'/api/v1/admin/team-matches':'/api/v1/team-matches'));
        await page.getByRole('button',{name:kind==='admin'?'팀 신청 모집 시작하기':'팀매치 만들기',exact:true}).click();
        const response = await responsePromise;
        const body = await response.json();
        expect(response.status(), JSON.stringify(body)).toBe(201);
        createdId=body.data.teamMatchId;
        const persisted=(await (await context.request.get(`${api}/api/v1/team-matches/${createdId}`)).json()).data;
        expect(persisted.startsAt).toBeTruthy();
        expect(persisted.endsAt).toBeTruthy();
        expect(new Date(persisted.endsAt)-new Date(persisted.startsAt)).toBe(2*3600000);
        expect(persisted.matchStyle).toContain('패스 연습');
        await page.goto(`/team-matches/${createdId}`);
        await page.waitForLoadState('networkidle');
        await page.screenshot({path:path.join(out,`${viewportName}-${kind}-detail.png`),fullPage:true});
        if(kind==='regular') {
          await page.goto(`/team-matches/${createdId}/edit`);
          await expect(page.locator('#field-endDate')).toHaveValue(new Date(Date.now()+15*86400000).toISOString().slice(0,10));
          await expect(page.locator('#field-endTime')).toHaveValue('01:00');
          const savedResponse=page.waitForResponse(r=>r.request().method()==='PATCH' && new URL(r.url()).pathname===`/api/v1/team-matches/${createdId}`);
          await page.getByRole('button',{name:'변경사항 저장',exact:true}).click();
          expect((await savedResponse).status()).toBe(200);
          const edited=(await (await context.request.get(`${api}/api/v1/team-matches/${createdId}`)).json()).data;
          expect(edited.endsAt).toBe(persisted.endsAt);
          expect(edited.startsAt).toBe(persisted.startsAt);
        }
      }
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      report.push({viewportName,kind,createdId,url:page.url(),errors,failures,overflow});
      await context.close();
      expect(errors).toEqual([]);
      expect(failures).toEqual([]);
      expect(overflow).toBe(false);
    }
  }
}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
