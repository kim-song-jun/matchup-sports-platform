import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const phase = process.argv[2] ?? 'after';
const base = process.env.PLAY_QA_BASE_URL ?? 'http://127.0.0.1:23013';
const root = path.resolve('output/playwright/visual-audit/android-play-readiness', phase);
const id = '9a190000-0000-4000-8000-000000000001';
const room = '9a190000-0000-4000-8000-000000000006';
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ headless: false });
const results = [];
try {
  await writeFile(path.join(root, 'processes.txt'), execFileSync('ps', ['-eo', 'pid,ppid,comm']).toString());
  for (const [name, width, height] of [['mobile',390,844],['tablet',768,1024],['desktop',1440,1000]]) {
    const context = await browser.newContext({ viewport: {width,height}, locale: 'ko-KR', colorScheme: 'light' });
    await context.request.delete(base+'/api/v1/chat/blocked-users/9a190000-0000-4000-8000-000000000002', { headers: { 'x-v1-user-id': id } });
    const page = await context.newPage();
    const errors = [];
    const failed = [];
    page.on('pageerror', e=>errors.push(e.message));
    page.on('console', e=>{if(e.type()==='error') errors.push(e.text())});
    page.on('response', r=>{if(r.status()>=400) failed.push({status:r.status(),url:r.url()})});
    await page.addInitScript(({id})=>{localStorage.setItem('teameet.v1.userId',id);localStorage.setItem('teameet.v1.session','active')},{id});
    await page.goto(base+'/home', { waitUntil:'networkidle', timeout:90000 });
    await page.waitForFunction(()=>!document.body.textContent.includes('로그인이 필요해요'), {timeout:15000});
    await page.goto(base+'/chat/'+room, { waitUntil:'networkidle', timeout:90000 });
    await page.locator('.tm-chat-thread').getByText('이번 주 토요일 풋살에 함께해요. 운동화와 물을 챙겨 주세요.').waitFor({timeout:25000});
    await page.screenshot({path:path.join(root,`${name}-chat.png`),fullPage:true});
    if (phase==='after') {
      await page.getByRole('button',{name:'QA 서연 메시지 신고·차단'}).click();
      await page.getByRole('dialog').waitFor();
      await page.screenshot({path:path.join(root,`${name}-report-dialog.png`),fullPage:true});
      if (name==='mobile') {
        await page.getByLabel('추가 설명 (선택)').fill('브라우저 QA 신고 접수 검증');
        await page.getByRole('button',{name:'신고 접수',exact:true}).click();
        await page.getByText('신고가 접수됐어요.',{exact:false}).waitFor();
        await page.screenshot({path:path.join(root,`${name}-report-saved.png`),fullPage:true});
        await page.getByRole('button',{name:'이 사용자 차단',exact:true}).click();
        await page.getByRole('button',{name:'이 사용자 차단 확인',exact:true}).click();
        await page.getByRole('dialog').waitFor({state:'hidden'});
        await page.locator('.tm-chat-thread').getByText('아직 메시지가 없어요',{exact:true}).waitFor();
        await page.screenshot({path:path.join(root,`${name}-blocked-chat.png`),fullPage:true});
        await page.getByRole('button',{name:'채팅 차단 관리'}).click();
        await page.getByRole('button',{name:'차단 해제'}).waitFor();
        await page.screenshot({path:path.join(root,`${name}-blocked-users.png`),fullPage:true});
        await page.getByRole('button',{name:'차단 해제'}).click();
        await page.getByText('차단한 사용자가 없어요.').waitFor();
        await page.getByRole('button',{name:'닫기',exact:true}).click();
        await page.locator('.tm-chat-thread').getByText('이번 주 토요일 풋살에 함께해요. 운동화와 물을 챙겨 주세요.').waitFor();
      } else await page.getByRole('button',{name:'닫기',exact:true}).click();
    }
    const chatOverflow = await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    await page.goto(base+'/account-deletion',{waitUntil:'networkidle',timeout:90000});
    await page.getByRole('heading',{name:'Teameet 계정 삭제를 요청할 수 있어요'}).waitFor();
    await page.screenshot({path:path.join(root,`${name}-account-deletion.png`),fullPage:true});
    const deletionOverflow = await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    results.push({name,width,height,phase,persona:'isolated fictional QA account',chatOverflow,deletionOverflow,errors,failed});
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(path.join(root,'results.json'),JSON.stringify(results,null,2));
}
console.log(JSON.stringify(results,null,2));
