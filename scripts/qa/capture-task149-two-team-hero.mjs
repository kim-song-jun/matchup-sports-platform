import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const phase = process.env.QA_PHASE ?? 'before';
const id = process.env.QA_MATCH_ID ?? '08f715e8-9ef9-47f2-be2b-d47d3067bdfe';
const out = `docs/screenshots/task149-two-team-hero/${phase}`;
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
const report = [];
try {
  for (const [name,width,height] of [['mobile',390,844],['tablet',768,1024],['desktop',1440,900]]) {
    const context = await browser.newContext({ baseURL:'http://127.0.0.1:3149',viewport:{width,height},extraHTTPHeaders:{'x-v1-user-email':'host@teameet.v1'} });
    const page = await context.newPage(); const errors=[]; const failures=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400 && r.url().includes('/api/')) failures.push(`${r.status()} ${r.url()}`);});
    await page.addInitScript(()=>localStorage.setItem('teameet.v1.userEmail','host@teameet.v1'));
    const session=await context.request.post('http://127.0.0.1:18149/api/v1/auth/dev-session');
    expect(session.status()).toBe(201);
    await page.goto('/home'); await page.waitForLoadState('networkidle');
    await page.goto(`/team-matches/${id}`); await page.waitForLoadState('networkidle');
    const hero=page.locator('.tm-team-vs-hero'); await expect(hero).toBeVisible();
    if(phase==='after') {
      await expect(hero.locator('.tm-team-vs-row').getByText('모집 중',{exact:true})).toHaveCount(2);
      await expect(hero).toContainText('참가할 두 팀을 모집해요');
      await expect(hero.locator('.tm-team-vs-row')).not.toContainText('운영');
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    await page.screenshot({path:`${out}/${name}.png`,fullPage:true});
    report.push({name,width,height,url:page.url(),heroText:await hero.innerText(),errors,failures,overflow});
    expect(errors).toEqual([]); expect(failures).toEqual([]); expect(overflow).toBe(false);
    await context.close();
  }
} finally { await browser.close(); await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2)); }
console.log(JSON.stringify(report));
