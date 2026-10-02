import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
const out=path.resolve('output/playwright/visual-audit/android-20260919');
const api='http://127.0.0.1:8121/api/v1';
const rooms=await fetch(`${api}/chat/rooms`,{headers:{'x-v1-user-email':'host@teameet.v1'}}).then(r=>r.json());
const room=rooms.data.items[0];if(!room)throw Error('Actual QA chat room required');
const browser=await chromium.launch({headless:false});const results=[];
try{for(const width of [390,768,1440]){
 const context=await browser.newContext({viewport:{width,height:width===1440?900:844},isMobile:width===390,hasTouch:width<1440});
 await context.addInitScript(()=>{localStorage.setItem('teameet.v1.session','active');localStorage.setItem('teameet.v1.userEmail','host@teameet.v1')});
 const page=await context.newPage();await page.goto('http://127.0.0.1:3013/home');await page.waitForTimeout(1000);
 for(const route of ['/home','/chat',`/chat/${room.roomId}`]){
 await page.goto(`http://127.0.0.1:3013${route}`);await page.waitForTimeout(1000);
 const close=page.getByRole('button',{name:'닫기',exact:true});if(await close.count())await close.first().click();
 for(const state of (width===390?['browser','native-inset-48','native-ime-open','native-ime-closed']:['browser'])){
 if(state==='native-inset-48')await page.evaluate(()=>{document.documentElement.style.setProperty('--teameet-native-safe-bottom','48px');document.documentElement.style.setProperty('--v1-shell-safe-bottom','48px')});
 if(state==='native-ime-open'){await page.setViewportSize({width,height:500});await page.evaluate(()=>{document.documentElement.dataset.teameetNativeKeyboard='open'});const field=page.locator('.tm-chat-inputbar input,.tm-chat-inputbar textarea');if(await field.count())await field.first().focus();}
 if(state==='native-ime-closed'){await page.setViewportSize({width,height:844});await page.evaluate(()=>{document.documentElement.dataset.teameetNativeKeyboard='closed'});}
 await page.waitForTimeout(250);
 const slug=route.replace(/[^a-zA-Z0-9_-]/g,'_');const screenshot=`focus-${width}-${slug}-${state}.png`;
 await page.screenshot({path:path.join(out,screenshot)});
 const metrics=await page.evaluate(()=>({height:innerHeight,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('.tm-bottom-nav,.tm-chat-inputbar,.tm-chat-inputbar input,.tm-chat-inputbar textarea,.tm-chat-thread')].map(e=>({class:e.className,visible:!!e.getBoundingClientRect().height,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,height:e.getBoundingClientRect().height}))}));
 results.push({route,width,state,screenshot,metrics,disclaimer:'Browser controlled viewport/inset only, not Android IME proof'});
 }
 }await context.close();
}}finally{await browser.close();fs.writeFileSync(path.join(out,'focus-results.json'),JSON.stringify(results,null,2));}
console.log(`Captured ${results.length} focus scenarios`);
