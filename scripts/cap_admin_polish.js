const { chromium } = require('@playwright/test');
const fs=require('fs'); const path=require('path');
const WEB='http://localhost:3013'; const TID='efc6a994-2349-4316-87b0-4e6cd351b4b5';
const REG101='167de01f-5e9c-49aa-a014-24fbb256b772';
const ADMIN={id:'d554f25e-06f4-4d04-b744-a44124230228',email:'admin@teameet.v1'};
const OWNER={id:'3b201848-3579-430f-850c-16b330c94085',email:'owner@teameet.v1'};
const OUT=path.join(__dirname,'..','docs','visual-qa','admin-polish-v8');
async function shoot(b,name,user,url,fn){const c=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});await c.addInitScript(([i,e])=>{localStorage.setItem('teameet.v1.userId',i);localStorage.setItem('teameet.v1.userEmail',e)},[user.id,user.email]);const p=await c.newPage();const errs=[];p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,60))});try{await p.goto(`${WEB}${url}`,{waitUntil:'networkidle',timeout:45000});await p.waitForTimeout(900);if(fn)await fn(p);await p.waitForTimeout(800);fs.mkdirSync(OUT,{recursive:true});await p.screenshot({path:path.join(OUT,`${name}.png`),fullPage:true});const t=(await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');return `${name} errs=${errs.length} | 자동생성:${t.includes('자동 생성')?'O':'-'} :: ${t.slice(0,90)}`}catch(e){return `${name} FAIL ${String(e).slice(0,50)}`}finally{await c.close()}}
(async()=>{const b=await chromium.launch();const o=[];
o.push(await shoot(b,'01-admin-bracket',ADMIN,`/admin/tournaments/${TID}`,async p=>{await p.getByRole('tab',{name:'대진 관리'}).click({timeout:8000}).catch(()=>{});await p.waitForTimeout(1000)}));
o.push(await shoot(b,'02-admin-create',ADMIN,'/admin/tournaments/new'));
o.push(await shoot(b,'03-roster-add',OWNER,`/tournaments/${TID}/registrations/${REG101}/roster`,async p=>{await p.getByRole('button',{name:/추가/}).first().click({timeout:5000}).catch(()=>{});await p.waitForTimeout(800)}));
await b.close();console.log(o.join('\n'))})();
