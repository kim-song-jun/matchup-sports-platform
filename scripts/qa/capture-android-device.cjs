/** Run with Windows Node against an explicitly authorized USB-debugging device. Read-only UI audit. */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const root=process.argv[2],adb=process.argv[3];
const out=path.join(root,'output/playwright/visual-audit/android-20260919');
const mode=process.argv[4]??'user';
const allRoutes=JSON.parse(fs.readFileSync(path.join(out,'inventory.json')));
const explicit=process.argv[5]?JSON.parse(fs.readFileSync(process.argv[5])):null;
const inventory=explicit?allRoutes.filter(r=>Object.hasOwn(explicit,r.route)):mode==='admin'?allRoutes.filter(r=>r.admin||r.route.startsWith('/tournament-ops/')):allRoutes;
const prefix=mode==='user'?'device':`device-${mode}`;
const api=JSON.parse(fs.readFileSync(path.join(out,'device-api-inventory.json')));
const first=(p)=>api[p]?.first?.[0];
const ids={chat:first('/chat/rooms')?.roomId,teams:first('/teams')?.id,tournaments:first('/tournaments')?.id,'league-matches':first('/league-matches')?.leagueId,'team-matches':first('/team-matches')?.teamMatchId};
if(mode==='admin'){const admin=JSON.parse(fs.readFileSync(path.join(out,'device-admin-api.json')));ids.inquiries=admin['/admin/inquiries']?.first?.[0]?.inquiryId;ids['league-series']=admin['/admin/league-series']?.first?.[0]?.id;ids.matches=admin['/admin/matches']?.first?.[0]?.matchId;ids.users=admin['/admin/users']?.first?.[0]?.userId;ids.live=ids.tournaments;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const targets=await fetch('http://127.0.0.1:9223/json').then(r=>r.json());const target=targets.find(p=>p.url.includes('alpha.teameet.co.kr'));if(!target)throw Error('Alpha WebView missing');
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
 const pending=new Map();let serial=0,current=null;
 ws.onmessage=({data})=>{const m=JSON.parse(data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}else if(current&&m.method==='Runtime.exceptionThrown'){current.errors.push(m.params.exceptionDetails.text)}else if(current&&m.method==='Network.responseReceived'&&m.params.response.status>=400){current.network.push({path:new URL(m.params.response.url).pathname,status:m.params.response.status})}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout ${method}`))},25000);pending.set(id,m=>{clearTimeout(timer);m.error?reject(Error(m.error.message)):resolve(m.result)});ws.send(JSON.stringify({id,method,params}))});
 const evaluate=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value};
 await send('Runtime.enable');await send('Network.enable');await send('Page.enable');
 const results=[],links=new Set();
 const flush=()=>fs.writeFileSync(path.join(out,`${prefix}-results.json`),JSON.stringify({total:inventory.length,processed:results.length,device:'SM-A325N Android 13',results},null,2));
 const screenshot=file=>fs.writeFileSync(path.join(out,file),execFileSync(adb,['exec-out','screencap','-p'],{maxBuffer:15*1024*1024}));
 const metrics=()=>evaluate(`(()=>({url:location.pathname,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,keyboard:document.documentElement.dataset.teameetNativeKeyboard,body:document.body.innerText.slice(0,1200),links:[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>h.startsWith('/')),bars:[...document.querySelectorAll('.tm-bottom-nav,.tm-chat-inputbar,.tm-chat-thread,.tm-fixed-cta')].filter(e=>e.getBoundingClientRect().height).map(e=>({class:e.className,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,height:e.getBoundingClientRect().height}))}))()`);
 function resolve(template){
  if(explicit)return explicit[template];
  if(template.includes('[slug]'))return null;
  if(!template.includes('['))return template;
  const regex=new RegExp('^'+template.replace(/\[[^\]]+\]/g,'([a-f0-9-]{36})')+'$');
  const found=[...links].map(l=>l.split('?')[0]).find(l=>regex.test(l));if(found)return found;
  const segments=template.split('/');const family=segments.find(x=>ids[x]);if(family&&segments.filter(s=>s.includes('[')).length===1)return template.replace(/\[[^\]]+\]/,ids[family]);
  return null;
 }
 const priority=['/home','/chat','/chat/[id]','/my','/teams','/teams/[id]'];
 const sorted=[...inventory].sort((a,b)=>{const ai=priority.indexOf(a.route),bi=priority.indexOf(b.route);if(ai>=0||bi>=0)return(ai<0?999:ai)-(bi<0?999:bi);return Number(a.dynamic)-Number(b.dynamic)});
 try{for(const item of sorted){if(results.length)await sleep(mode==='supplement'?8000:2000);
 const route=resolve(item.route);current={template:item.route,route,status:'pending',errors:[],network:[]};
 if(!route){current.status='blocked';current.reason='No existing linked entity for this route';results.push(current);flush();continue;}
 try{
 await send('Page.navigate',{url:`https://alpha.teameet.co.kr${route}`});await sleep(1500);
 for(let i=0;i<15;i++){const state=await evaluate('document.readyState');if(state==='complete')break;await sleep(500)}
 await sleep(mode==='final'?6000:500);current.metrics=await metrics();current.metrics.links.forEach(l=>links.add(l));delete current.metrics.links;
 const slug=item.route.replace(/[^a-zA-Z0-9_-]/g,'_')||'root';current.screenshot=`${prefix}-${slug}.png`;screenshot(current.screenshot);
 current.status=/403 Forbidden/.test(current.metrics.body)?'edge-blocked':/운영자 권한이 필요|권한이 없어요|접근 권한이 없|최고운영자 전용/.test(current.metrics.body)?'permission-blocked':current.metrics.scrollWidth>current.metrics.width+1?'layout-fail':current.metrics.url!==route?'redirect':current.network.some(n=>n.status>=500)?'runtime-fail':'captured-needs-review';
 if(item.route==='/chat/[id]'){
 const rect=await evaluate(`(()=>{const e=document.querySelector('.tm-chat-inputbar input,.tm-chat-inputbar textarea');if(!e||e.disabled)return null;const r=e.getBoundingClientRect();return {x:(r.left+r.width/2)*devicePixelRatio,y:(r.top+r.height/2)*devicePixelRatio+80}})()`);
 if(rect){execFileSync(adb,['shell','input','tap',String(Math.round(rect.x)),String(Math.round(rect.y))]);await sleep(1400);current.keyboardOpen=await metrics();delete current.keyboardOpen.links;screenshot('device-chat-keyboard-open.png');execFileSync(adb,['shell','input','keyevent','4']);await sleep(800);current.keyboardClosed=await metrics();delete current.keyboardClosed.links;screenshot('device-chat-keyboard-closed.png');}
 }
 }catch(e){current.status='blocked';current.reason=e.message}
 results.push(current);flush();console.log(`${results.length}/${inventory.length} ${current.status} ${item.route}`);
 }}finally{flush();ws.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
