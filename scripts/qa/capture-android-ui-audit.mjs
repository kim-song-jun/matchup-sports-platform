/** Headed v1 route audit. Bridge/inset emulation is explicitly not Android device proof. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const out=path.resolve(process.env.ANDROID_AUDIT_OUTPUT ?? 'output/playwright/visual-audit/android-20260919');
const base=process.env.V1_WEB_BASE ?? 'http://127.0.0.1:3013';
const allRoutes=JSON.parse(fs.readFileSync(path.join(out,'inventory.json')));
const selected=process.env.AUDIT_ROUTES?.split(',');
const inventory=selected?allRoutes.filter(r=>selected.includes(r.route)):allRoutes;
const prefix=selected?'browser-rerun':'browser';
const entities=JSON.parse(fs.readFileSync(path.join(out,'entities.json')));
const first=(name)=>entities[name]?.[0]?.id;
function resolveRoute(route){
 let model=route.includes('/team-matches/')?'v1TeamMatch':route.includes('/teams/')?'v1Team':route.includes('/chat/')?'v1ChatRoom':route.includes('/notices/')?'v1Notice':route.includes('/inquiries/')?'v1Inquiry':route.includes('/users/')?'v1User':route.includes('/matches/')&&!route.includes('/tournaments/')?'v1Match':route.includes('/tournaments/')||route.includes('/live/')?'v1Tournament':null;
 return route.replace(/\[([^\]]+)\]/g,(_,key)=>first(key==='id'?model:({scheduleId:'v1TeamSchedule',tournamentId:'v1Tournament',contactId:'v1TeamContact',seriesId:'v1LeagueSeries'}[key]))??`[${key}]`);
}
const results=[];
const save=()=>fs.writeFileSync(path.join(out,`${prefix}-results.json`),JSON.stringify({total:inventory.length,processed:results.length,results},null,2));
const browser=await chromium.launch({headless:false});
console.log(`Runner PID ${process.pid}; headed browser opened`);
try {
 for(const persona of ['user','admin']){
 const email=persona==='admin'?'admin@teameet.v1':'host@teameet.v1';
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,extraHTTPHeaders:{'x-v1-user-email':email}});
 await context.addInitScript(({email})=>{localStorage.setItem('teameet.v1.session','active');localStorage.setItem('teameet.v1.userEmail',email);localStorage.removeItem('teameet.v1.userId');},{email});
 const page=await context.newPage();page.setDefaultTimeout(6000);
 await page.goto(`${base}/home`,{timeout:60000});
 await page.waitForTimeout(1500);
 for(const item of inventory.filter(r=>r.admin===(persona==='admin'))){
 const route=resolveRoute(item.route);const result={template:item.route,route,persona,viewport:'390x844',status:'pending',console:[],network:[]};
 if(route.includes('[')){result.status='blocked';result.reason='No real QA entity for dynamic route';results.push(result);save();continue;}
 const onConsole=msg=>{if(msg.type()==='error')result.console.push(msg.text().slice(0,350));};
 const onError=err=>result.console.push(err.message.slice(0,350));
 const onResponse=res=>{if(res.status()>=400)result.network.push({path:new URL(res.url()).pathname,status:res.status()});};
 page.on('console',onConsole);page.on('pageerror',onError);page.on('response',onResponse);
 try{
 const response=await page.goto(`${base}${route}`,{timeout:60000,waitUntil:'domcontentloaded'});
 await page.waitForTimeout(selected?4500:1200);
 const slug=item.route.replace(/[^a-zA-Z0-9_-]/g,'_')||'root';
 result.screenshot=`${prefix}-${slug}.png`;
 await page.screenshot({path:path.join(out,result.screenshot),fullPage:true,timeout:15000});
 result.layout=await page.evaluate(()=>({url:location.pathname,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,text:document.body.innerText.slice(0,1600),bars:[...document.querySelectorAll('.tm-bottom-nav,.tm-chat-inputbar,.tm-fixed-cta')].filter(e=>e.getBoundingClientRect().height).map(e=>({class:e.className,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,height:e.getBoundingClientRect().height}))}));
 result.http=response?.status();result.status=result.layout.scrollWidth>392?'layout-fail':result.http>=400||result.network.some(r=>r.status>=500)?'runtime-fail':result.layout.url!==route?'redirect':'captured-needs-review';
 }catch(e){result.status='blocked';result.reason=e.message.slice(0,400);}
 finally{page.off('console',onConsole);page.off('pageerror',onError);page.off('response',onResponse);}
 results.push(result);save();console.log(`${results.length}/${inventory.length} ${result.status} ${item.route}`);
 }
 await context.close();
 }
}finally{await browser.close();save();}
