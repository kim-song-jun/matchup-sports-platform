const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../../docs/scenarios/evidence/ranked-replay-20261119');const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const d=read('final-bracket.json'),stage=read('finals-assigned.json');const appearances=new Map();const groupReport=[];
for(let n=1;n<=20;n++){const key=String(n).padStart(2,'0'),app=read(`team-${key}.json`),admit=read(`admission-${key}.json`);assert.equal(app.players,7);assert.equal(admit.reviewedPlayers,7);assert.equal(admit.status,'PASS');for(const suffix of ['application-confirm','application-submitted','seven-registered','admin-roster-review','admin-accept-confirm','admin-accepted'])assert(fs.statSync(path.join(dir,`team-${key}-${suffix}.png`)).size>1000);}
assert.equal(d.fixtures.length,70);assert(d.fixtures.every(f=>f.game.hasOfficialResult));
for(const g of d.groups){const fixtures=d.fixtures.filter(f=>f.groupId===g.id),count=g.name.includes('예선')?4:5;assert.equal(fixtures.length,count*(count-1)/2);const stats=new Map(),pairs=new Set();
 for(const f of fixtures){const pair=[f.homeRegistrationId,f.awayRegistrationId].sort().join(':');assert(!pairs.has(pair));pairs.add(pair);
  for(const [id,gf,ga] of [[f.homeRegistrationId,f.result.homeScore,f.result.awayScore],[f.awayRegistrationId,f.result.awayScore,f.result.homeScore]]){appearances.set(id,(appearances.get(id)||0)+1);const s=stats.get(id)||{played:0,points:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0};s.played++;s.points+=gf>ga?3:gf===ga?1:0;s.wins+=gf>ga?1:0;s.draws+=gf===ga?1:0;s.losses+=gf<ga?1:0;s.goalsFor+=gf;s.goalsAgainst+=ga;stats.set(id,s);}
 }
 assert.equal(stats.size,count);for(const [id,s]of stats){assert.equal(s.played,count-1);const actual=d.standings.find(x=>x.groupId===g.id&&x.registrationId===id);assert(actual);for(const k of ['points','wins','draws','losses','goalsFor','goalsAgainst'])assert.equal(actual[k],s[k],`${g.name} ${k}`);}
 groupReport.push({name:g.name,teams:count,matches:fixtures.length,arithmetic:'PASS'});
}
assert.equal(appearances.size,20);for(const games of appearances.values())assert.equal(games,7);
for(const p of stage.pools.filter(p=>p.stageIndex===1)){assert(p.assigned);assert.equal(p.registrationIds.length,5);p.sources.forEach((source,i)=>assert(stage.pools.find(x=>x.key===source.poolKey).ranks[source.rank-1].includes(p.registrationIds[i])));}
const goal=d.fixtures.find(f=>f.fixtureNumber===1);assert.equal(goal.result.homeScore,1);assert.equal(goal.result.awayScore,0);assert.equal(goal.result.goals.length,1);
const report={verdict:'PASS for application/admission/result arithmetic; six-player enforcement remains FAIL',applications:20,registeredPlayers:140,admissions:20,officialResults:70,gamesPerTeam:7,recordedLiveGoals:1,groups:groupReport};fs.writeFileSync(path.join(dir,'final-arithmetic.json'),JSON.stringify(report,null,2));console.log(report);
