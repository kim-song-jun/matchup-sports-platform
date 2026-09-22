import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
const dbURL = new URL(process.env.DATABASE_URL ?? '');
if (dbURL.hostname !== '127.0.0.1' || dbURL.port !== '55439' || dbURL.username !== 'parity_qa') {
  throw new Error('This fixture-writing verifier requires the isolated parity_qa database on 127.0.0.1:55439');
}
const require = createRequire(new URL('../../apps/v1_api/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const origin = process.env.QA_API_ORIGIN ?? 'http://127.0.0.1:18149';
if (new URL(origin).hostname !== '127.0.0.1') throw new Error('Local QA API required');
const report = [];
async function api(email, route, data, status=201, method='POST') {
  const response=await fetch(`${origin}/api/v1${route}`,{method,headers:{'x-v1-user-email':email,'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const body=await response.json();
  assert.equal(response.status,status,`${route}: ${JSON.stringify(body)}`);
  return body.data ?? body;
}
try {
 const host=await prisma.v1User.findUniqueOrThrow({where:{email:'host@teameet.v1'}});
 const guest=await prisma.v1User.findUniqueOrThrow({where:{email:'applicant@teameet.v1'}});
 const late=await prisma.v1User.findUniqueOrThrow({where:{email:'manager@teameet.v1'}});
 const sport=await prisma.v1Sport.findUniqueOrThrow({where:{code:'futsal'}});
 const regionId='region-seoul-jongno';
 const team=async(user,name)=>prisma.v1Team.create({data:{ownerUserId:user.id,sportId:sport.id,regionId,name, memberships:{create:{userId:user.id,role:'owner',status:'active',joinedAt:new Date()}}}});
 const home=await team(host,'QA 홈팀 '+Date.now());const away=await team(guest,'QA 원정팀 '+Date.now());const extra=await team(late,'QA 늦은 신청팀 '+Date.now());
 const start=new Date(Date.now()+10*86400000); const end=new Date(start.getTime()+2*3600000); const deadline=new Date(Date.now()+86400000);const past=new Date(Date.now()-60000);
 const payload={sportId:sport.id,regionId,title:'조건 일치 실제 API '+Date.now(),manualPlaceName:'검증 전용 구장',startsAt:start.toISOString(),endsAt:end.toISOString(),deadlineAt:deadline.toISOString(),matchFormat:'5:5',matchStyle:['패스 연습'],genderRule:'성별 무관',costNote:'총 90,000원 · 상대팀 30,000원'};
 for(const kind of ['regular','admin']) {
  const route=kind==='admin'?'/admin/team-matches':'/team-matches';const email=kind==='admin'?'admin@teameet.v1':host.email;
  const body=kind==='admin'?{...payload,clientCommandId:randomUUID()}:{...payload,hostTeamId:home.id};
  const invalid=await api(email,route,{...body,deadlineAt:past.toISOString()},400);assert.equal(invalid.code,'VALIDATION_FAILED');
  const created=await api(email,route,body);const id=created.teamMatchId;
  const apps=[];
  if(kind==='admin') apps.push(await api(host.email,`/team-matches/${id}/applications`,{applicantTeamId:home.id}));
  apps.push(await api(guest.email,`/team-matches/${id}/applications`,{applicantTeamId:away.id}));
  await prisma.v1TeamMatch.update({where:{id},data:{deadlineAt:past}});
  const rejected=await api(late.email,`/team-matches/${id}/applications`,{applicantTeamId:extra.id},409);
  assert.equal(rejected.code,'NOT_RECRUITING');
  const confirmRoute=kind==='admin'?`/admin/team-matches/${id}/applications/${apps[0].applicationId}/approve`:`/team-match-applications/${apps[0].applicationId}/approve`;
  const confirmBody=kind==='admin'?{clientCommandId:randomUUID()}:{};
  // Future + closed, and elapsed kickoff + recruiting, are both non-confirmable.
  await prisma.v1TeamMatch.update({where:{id},data:{status:'closed'}});
  await api(email,confirmRoute,confirmBody,409);
  await prisma.v1TeamMatch.update({where:{id},data:{status:'recruiting',startAt:past}});
  await api(email,confirmRoute,confirmBody,409);
  await prisma.v1TeamMatch.update({where:{id},data:{startAt:start}});
  if(kind==='regular') {
    const applications=await api(email,`/team-matches/${id}/applications`,undefined,200,'GET');
    assert.equal(applications.items[0].canApprove,true);
  }
  await api(email,confirmRoute,confirmBody);
  if(kind==='admin') {
    const firstApproved=await prisma.v1TeamMatch.findUniqueOrThrow({where:{id},include:{game:true}});
    assert.equal(firstApproved.status,'recruiting');assert.equal(firstApproved.game,null);
    await api(email,`/admin/team-matches/${id}/applications/${apps[1].applicationId}/approve`,{clientCommandId:randomUUID()});
  }
  const saved=await prisma.v1TeamMatch.findUniqueOrThrow({where:{id},include:{game:true}});
  assert.equal(saved.status,'matched');assert.equal(saved.hostTeamId,home.id);assert.equal(saved.approvedApplicantTeamId,away.id);assert.ok(saved.game);
  assert.equal(await prisma.v1TeamSchedule.count({where:{teamMatchId:id}}),2);
  assert.deepEqual(saved.matchStyle,['패스 연습']);
  report.push({kind,id,pastDeadlineCreate:400,lateApplication:409,closedConfirmation:409,startedConfirmation:409,afterDeadlineConfirmation:201,schedules:2,game:true});
 }
 // The relaxed CHECK must still reject an ordinary hostless friendly and incomplete platform metadata.
 const platform=await api('admin@teameet.v1','/admin/team-matches',{...payload,clientCommandId:randomUUID()});
 for(const data of [{platformManaged:false},{placeName:null},{regionId:null},{startAt:null},{createdByUserId:null}]) {
  await assert.rejects(()=>prisma.v1TeamMatch.update({where:{id:platform.teamMatchId},data}),e=>String(e).includes('v1_team_matches_friendly_required_ck'));
 }
 report.push({constraint:'platform host exception only; actor/region/place/start retained',rejectedMutations:5});
} finally {
 await prisma.$disconnect();
 await fs.mkdir('docs/screenshots/task149-parity-validation',{recursive:true});
 await fs.writeFile('docs/screenshots/task149-parity-validation/api-report.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
