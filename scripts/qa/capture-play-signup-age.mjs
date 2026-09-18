import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const phase = process.argv[2] ?? 'after';
const root = `output/playwright/visual-audit/android-play-readiness/${phase}`;
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ headless: false });
const results = [];
try {
  await writeFile(`${root}/signup-processes.txt`, execFileSync('ps', ['-eo', 'pid,ppid,comm']).toString());
  for (const [name,width,height] of [['mobile',390,844],['tablet',768,1024],['desktop',1440,1000]]) {
    const context = await browser.newContext({viewport:{width,height},locale:'ko-KR'});
    const page = await context.newPage();
    const errors = [], failed = [];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('console', e=>{if(e.type()==='error') errors.push(e.text())});
    page.on('response', r=>{if(r.status()>=400) failed.push({status:r.status(),url:r.url()})});
    await page.addInitScript(()=>{localStorage.setItem('teameet.v1.userId','9a190000-0000-4000-8000-000000000004');localStorage.setItem('teameet.v1.session','active')});
    await page.goto('http://127.0.0.1:23013/signup/social',{waitUntil:'networkidle',timeout:90000});
    await page.getByPlaceholder('예: 1995-01-15').fill('2020-01-01');
    await page.getByText('생년월일',{exact:true}).click();
    if(phase==='after') await page.getByText('만 14세 이상만 가입할 수 있어요.',{exact:true}).waitFor();
    await page.screenshot({path:`${root}/${name}-signup-age.png`,fullPage:true});
    results.push({name,width,height,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors,failed});
    await context.close();
  }
} finally { await browser.close(); await writeFile(`${root}/signup-results.json`,JSON.stringify(results,null,2)); }
