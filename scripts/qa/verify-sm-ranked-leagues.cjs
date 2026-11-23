const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const origin = 'https://alpha.teameet.co.kr';
const tid = 'ee1675e5-264e-43ec-9a36-bd2f0a3099d9';
const reportPath = path.resolve('tmp/sm-ranked-leagues-report.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath)) : { tournamentId: tid, enrollments: [], games: [], findings: [] };
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
const wait = ms => new Promise(r => setTimeout(r, ms));
function seededId(kind, n) { const h = createHash('sha256').update(`sm20261116:${kind}:${n}`).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; }
async function request(cookie, method, route, body, extra = {}) {
  await wait(260); // Alpha nginx API rate: 300/minute. Keep the run serial and below it.
  const r = await fetch(origin + '/api/v1' + route, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45000) });
  const raw = await r.text(); let json; try { json = JSON.parse(raw); } catch { throw Error(`${method} ${route}: HTTP${r.status} non-JSON`); }
  if (!r.ok) { const e = new Error(`${method} ${route}: HTTP${r.status} ${json.code} ${json.message}`); e.code = json.code; throw e; }
  return json.data;
}
async function login(email, password) {
  if (!email || !password) throw Error('Credentials environment required');
  const r = await fetch(origin + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({email,password}) });
  const cookie = r.headers.getSetCookie().map(s => s.split(';')[0]).find(s => s.startsWith('teameet_v1_session='));
  if (!r.ok || !cookie) { const b = await r.json(); throw Error(`Login HTTP${r.status} ${b.code ?? 'no session'}`); }
  return cookie;
}
const api = (cookie) => (method, route, body, extra) => request(cookie, method, route, body, extra);
async function enroll(admin) {
  const root = `/admin/tournaments/${tid}`;
  const t = await admin('GET', root);
  if (t.status === 'draft') await admin('POST', root + '/status', {status:'open'});
  const signup = await request(null, 'GET', '/terms/current?context=signup');
  const signupIds = signup.items.filter(x => x.requirement === 'required').map(x => x.documentId);
  const terms = await request(null, 'GET', '/terms/current?context=tournament_application');
  const termIds = terms.items.filter(x => x.requirement === 'required' || x.code === 'tournament_record_disclosure').map(x => x.documentId);
  for (let n = 1; n <= 20; n++) {
    if (report.enrollments.some(e => e.teamNo === n && e.status === 'confirmed')) continue;
    await wait(7100); // Public login contract: no more than ten requests per minute.
    const tt = String(n).padStart(2, '0');
    const captain = api(await login(`sm20261116.t${tt}.p01@teameet.test`, process.env.QA_PLAYER_PASSWORD));
    await captain('POST', '/terms/consents', {documentIds: signupIds});
    const teamId = seededId('team', tt);
    const team = await captain('GET', `/teams/${teamId}`);
    await captain('PATCH', `/teams/${teamId}`, {version:team.version, name:team.name, sportId:team.sport.sportId, regionId:team.region.regionId, joinPolicy:team.joinPolicy, genderRule:'남', introduction:team.profile.introduction});
    const registration = await captain('POST', `/tournaments/${tid}/registrations`, {teamId});
    const rid = registration.id ?? registration.registrationId;
    if (!rid) throw Error('Missing registration ID');
    const rosterPath = `/tournaments/${tid}/registrations/${rid}/players`;
    let roster = await captain('GET', rosterPath);
    let items = roster.items ?? roster.players ?? roster;
    if (!Array.isArray(items)) throw Error('Unknown roster shape: '+Object.keys(roster));
    for (let p = 1; p <= 7; p++) {
      const pp = String(p).padStart(2, '0'), userId = seededId('user', tt+pp);
      if (items.some(x => x.userId === userId)) continue;
      await captain('POST', rosterPath, { userId, realName:`sm${tt}${pp}`, birthDate:'2000-01-01', jerseyNumber:p, goalkeeper:p === 1, eligibilityStatus:'non_pro' });
    }
    roster = await captain('GET', rosterPath); items = roster.items ?? roster.players ?? roster;
    if (items.length !== 7) throw Error('Roster must contain seven players');
    const current = await captain('GET', `/tournaments/${tid}/registrations/${rid}`);
    if (current.status === 'draft') await captain('POST', `/tournaments/${tid}/registrations/${rid}/submit`, { termsDocumentIds:termIds, paymentMethod:'bank_transfer', agreedRules:true, agreedPrivacy:true, agreedRefund:true, agreedMediaConsent:true });
    const confirmed = await admin('PATCH', `/admin/registrations/${rid}/confirm`, {decision:'confirm',note:'User requested sm Alpha QA'});
    report.enrollments = report.enrollments.filter(e => e.teamNo !== n);
    report.enrollments.push({teamNo:n,teamId,registrationId:rid,status:'confirmed',playerCount:items.length}); save();
    console.log(`Confirmed ${report.enrollments.length}/20 teams; roster ${items.length}/7`);
  }
  let view = await admin('GET', root+'/stages');
  const regs = report.enrollments.sort((a,b)=>a.teamNo-b.teamNo).map(e=>e.registrationId);
  for (let i=0;i<5;i++) {
    const p=view.pools.find(p=>p.key===`pre${i}`);
    if (!p.assigned) view=await admin('PUT',root+'/stages/assignment',{poolKey:p.key,expectedRevision:view.revision,sourceVersion:p.sourceVersion,registrationIds:regs.slice(i*4,i*4+4)});
  }
  report.preliminaryAssignments=view.pools.filter(p=>p.stageIndex===0).map(p=>({key:p.key,registrationIds:p.registrationIds}));
  report.fixtureIds=view.pools.flatMap(p=>p.fixtureIds); save();
  const next=await admin('GET',root);
  if(next.status==='open')await admin('POST',root+'/status',{status:'closed'});
  if(['open','closed'].includes(next.status))await admin('POST',root+'/status',{status:'in_progress'});
  await admin('POST',root+'/publish-bracket',{});
  console.log('Twenty teams assigned to five preliminary leagues; competition in_progress');
}
function canonical(v) { return Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])) : v; }
async function playFixture(admin, cookie, f) {
  const { io } = require(path.join(process.env.QA_MODULE_ROOT, 'socket.io-client'));
  const gid=f.game?.id;
  if(!gid)throw Error('Missing canonical game: '+f.id);
  let g=await admin('GET',`/games/${gid}`);
  const hi=report.enrollments.find(e=>e.registrationId===f.homeRegistrationId)?.teamNo;
  const ai=report.enrollments.find(e=>e.registrationId===f.awayRegistrationId)?.teamNo;
  if(!hi||!ai)throw Error('Unknown fixture entrants');
  const homeWins=hi<ai;
  if(g.currentOfficialRevisionId) { if(!report.games.some(x=>x.fixtureId===f.id))report.games.push({fixtureId:f.id,gameId:gid,officialRevisionId:g.currentOfficialRevisionId});save();return; }
  const clientInstanceId=randomUUID();
  const socket=io(origin+'/game-operations',{extraHeaders:{cookie,Origin:origin},auth:{clientInstanceId,authorizationSubjectVersion:0},reconnection:false});
  try {
    const token=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Takeover timeout')),20000);socket.on('connect_error',e=>{clearTimeout(timer);reject(e);});socket.on('connect',()=>socket.emit('game.takeover.request',{gameId:gid,authorizationSubjectVersion:0,clientInstanceId,lastSequence:g.lastSequence},ack=>{clearTimeout(timer);ack?.status==='granted'?resolve(ack.takeoverToken):reject(Error('Takeover '+JSON.stringify(ack)));}));});
    async function command(name){g=await admin('GET',`/games/${gid}`);const cid=randomUUID();return admin('POST',`/games/${gid}/commands/${name}`,{expectedVersion:g.version,clientCommandId:cid,takeoverToken:token,occurredAt:new Date().toISOString(),payload:{}},{'idempotency-key':cid});}
    if(g.state==='SCHEDULED')await command('start');
    g=await admin('GET',`/games/${gid}`);
    if(g.state==='LIVE') {
      const events=await admin('GET',`/games/${gid}/events`);
      const existing=events.items??events.events??events;
      if(!Array.isArray(existing))throw Error('Unknown game events shape');
      if(!existing.some(e=>e.type==='GOAL')) {
        const lineups=await admin('GET',`/games/${gid}/lineups`);
        const side=g.sides.find(s=>s.sideKey===(homeWins?'HOME':'AWAY'));
        const lineup=lineups.filter(l=>l.sideId===side.id&&l.state==='SUBMITTED').sort((a,b)=>b.revision-a.revision)[0];
        const participant=lineup?.participants[1]??lineup?.participants[0];
        if(!participant)throw Error('Submitted roster participant missing');
        const eid=randomUUID();
        await admin('POST',`/games/${gid}/events`,{expectedVersion:g.version,clientEventId:eid,takeoverToken:token,type:'GOAL',sideId:side.id,participantId:participant.id,period:1,clockMs:60000,occurredAt:new Date().toISOString(),payload:{}},{'idempotency-key':eid});
      }
      await command('end');
    }
    const revs=await admin('GET',`/games/${gid}/result-revisions`);
    const submitted=(revs.items??revs).find(r=>r.state==='SUBMITTED');
    if(!submitted)throw Error('Submitted revision missing');
    const projectionPreviewHash=createHash('sha256').update(JSON.stringify(canonical({score:submitted.score,goalEvents:submitted.goalEvents??null,eventsHash:submitted.eventsHash,mvpParticipantId:submitted.mvpParticipantId??null}))).digest('hex');
    g=await admin('GET',`/games/${gid}`);const cid=randomUUID();
    await admin('POST',`/games/${gid}/result-revisions/${submitted.id}/officialize`,{expectedVersion:g.version,clientCommandId:cid,projectionPreviewHash},{'idempotency-key':cid});
    g=await admin('GET',`/games/${gid}`);
    if(g.state!=='ENDED'||!g.currentOfficialRevisionId)throw Error('Official game state not persisted');
    report.games.push({fixtureId:f.id,gameId:gid,officialRevisionId:g.currentOfficialRevisionId,homeTeamNo:hi,awayTeamNo:ai,homeScore:homeWins?1:0,awayScore:homeWins?0:1});save();
    console.log(`Official result ${report.games.length}/70: ${hi} vs ${ai}`);
  } finally { socket.close(); }
}
async function play(admin,cookie) {
  const root=`/admin/tournaments/${tid}`;
  try {await admin('POST',root+'/status',{status:'completed'});throw Error('Incomplete competition unexpectedly completed');}catch(e){if(e.code!=='STAGE_RESULTS_INCOMPLETE')throw e;report.incompleteEndRejected=true;save();}
  for(let stage=0;stage<2;stage++) {
    let view=await admin('GET',root+'/stages');
    if(stage===1) {
      report.finalsBeforeConfirmation=view.pools.filter(p=>p.stageIndex===1).map(p=>({key:p.key,assigned:p.assigned,candidates:p.candidates}));save();
      for(const key of ['main0','main1','main2','main3']) {
        const p=view.pools.find(p=>p.key===key);
        if(p.candidates.some(c=>c.length!==1))throw Error('Expected unique official-rank candidates');
        const rank=Number(key.slice(-1))+1;
        const expected=report.enrollments.filter(e=>(e.teamNo-1)%4===rank-1).map(e=>e.registrationId);
        if(JSON.stringify([...p.candidates.map(c=>c[0])].sort())!==JSON.stringify(expected.sort()))throw Error('Rank advancement mismatch');
        if(!p.assigned)view=await admin('PUT',root+'/stages/assignment',{poolKey:key,expectedRevision:view.revision,sourceVersion:p.sourceVersion,registrationIds:p.candidates.map(c=>c[0])});
      }
      report.finalsAssigned=view.pools.filter(p=>p.stageIndex===1).map(p=>({key:p.key,registrationIds:p.registrationIds,standings:p.standings}));
      if(report.finalsAssigned.some(p=>p.standings.some(s=>s.points!==0)))throw Error('Preliminary points leaked into finals');
      if(JSON.stringify(view.pools.flatMap(p=>p.fixtureIds).sort())!==JSON.stringify([...report.fixtureIds].sort()))throw Error('Fixture IDs changed');save();
    }
    const ids=new Set(view.pools.filter(p=>p.stageIndex===stage).flatMap(p=>p.fixtureIds));
    const bracket=await admin('GET',root+'/bracket');
    for(const f of bracket.fixtures.filter(f=>ids.has(f.id)).sort((a,b)=>a.fixtureNumber-b.fixtureNumber))await playFixture(admin,cookie,f);
    view=await admin('GET',root+'/stages');
    if(view.pools.some(p=>p.stageIndex===stage&&!p.complete))throw Error('Stage not complete after official results');
    console.log(`Stage ${stage+1}/2 complete`);
  }
  const result=await admin('POST',root+'/status',{status:'completed'});
  report.completed=result;report.finalView=await admin('GET',root+'/stages');delete report.lastError;save();console.log('Competition completed: 70/70 official results');
}
async function review(admin) {
  const t=await request(null,'GET',`/tournaments/${tid}`);
  if(t.status!=='completed'||t.fixtures.length!==70||t.fixtures.some(f=>!f.result||f.status!=='completed'))throw Error('Public completed results mismatch');
  const finals=t.groups.filter(g=>g.stageKey==='main');
  if(finals.length!==4)throw Error('Public finals missing');
  const ranks=finals.map(g=>({poolKey:g.poolKey,name:g.name,standings:[...g.standings].sort((a,b)=>a.position-b.position).map(s=>({position:s.position,teamName:s.teamName,registrationId:s.registrationId,points:s.points,wins:s.wins,losses:s.losses}))}));
  for(const g of ranks){if(g.standings.length!==5||JSON.stringify(g.standings.map(s=>s.points))!==JSON.stringify([12,9,6,3,0]))throw Error('Public final ranking mismatch');}
  const counts=new Map();for(const f of t.fixtures){for(const rid of [f.homeRegistrationId,f.awayRegistrationId])counts.set(rid,(counts.get(rid)??0)+1);}
  if(counts.size!==20||[...counts.values()].some(n=>n!==7))throw Error('Expected seven games per team');
  report.publicFinalRankings=ranks;report.publicFixtureCount=t.fixtures.length;
  report.pageResponses=[];
  for(const route of ['results','awards']){const r=await fetch(`${origin}/tournaments/${tid}/${route}`,{signal:AbortSignal.timeout(30000)});const html=await r.text();const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script(?:\s[^>]*)?>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style(?:\s[^>]*)?>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');report.pageResponses.push({route,status:r.status,bytes:Buffer.byteLength(html),containsTournamentId:html.includes(tid),serverText:text.slice(0,12000)});if(!r.ok)throw Error('Public page HTTP '+r.status);}
  report.awardScopeTracks=finals.map(g=>g.bracketTrack);report.awardSets=t.awardSets??[];
  const records=await request(null,'GET',`/tournaments/${tid}/player-records`);
  if(records.hiddenByEligibility||records.goals.reduce((sum,p)=>sum+p.goals,0)!==70)throw Error('Public cumulative goals mismatch');
  report.playerRecords=records;
  report.visualQA={completed:false,reason:'Browser access host unavailable; native app approval timed out',viewportsVerified:0};
  delete report.lastError;save();console.log(JSON.stringify({status:t.status,fixtures:70,teams:20,gamesPerTeam:7,finals:ranks.map(g=>({poolKey:g.poolKey,topThree:g.standings.slice(0,3)})),pages:report.pageResponses,visualQA:report.visualQA}));
}
async function main(){const cookie=await login(process.env.QA_ADMIN_EMAIL,process.env.QA_ADMIN_PASSWORD);const admin=api(cookie);if(process.argv[2]==='enroll')await enroll(admin);else if(process.argv[2]==='play')await play(admin,cookie);else if(process.argv[2]==='review')await review(admin);else throw Error('Unknown phase');}
main().catch(e=>{report.lastError=e.message;save();console.error(e.message);process.exitCode=1;});
