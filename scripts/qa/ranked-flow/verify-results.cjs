const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../docs/scenarios/evidence');const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const d=read('ranked-full-flow-20261119-after-70-settled.json');const stage=read('ranked-full-flow-20261119-finals-assigned.json');
assert.equal(d.fixtures.length,70);assert.equal(d.fixtures.filter(f=>f.game.hasOfficialResult).length,70);
const appearances=new Map();const groups=[];
for(const g of d.groups){
 const fixtures=d.fixtures.filter(f=>f.groupId===g.id);const count=g.name.includes('예선')?4:5;assert.equal(fixtures.length,count*(count-1)/2);
 const stats=new Map();const pairs=new Set();
 for(const f of fixtures){const pair=[f.homeRegistrationId,f.awayRegistrationId].sort().join(':');assert(!pairs.has(pair));pairs.add(pair);
  for(const [id,gf,ga] of [[f.homeRegistrationId,f.result.homeScore,f.result.awayScore],[f.awayRegistrationId,f.result.awayScore,f.result.homeScore]]){
   appearances.set(id,(appearances.get(id)||0)+1);const s=stats.get(id)||{played:0,points:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0};s.played++;s.points+=gf>ga?3:gf===ga?1:0;s.wins+=gf>ga?1:0;s.draws+=gf===ga?1:0;s.losses+=gf<ga?1:0;s.goalsFor+=gf;s.goalsAgainst+=ga;stats.set(id,s);
  }
 }
 assert.equal(stats.size,count);
 for(const [id,s] of stats){assert.equal(s.played,count-1);const actual=d.standings.find(x=>x.groupId===g.id&&x.registrationId===id);assert(actual);for(const k of ['points','wins','draws','losses','goalsFor','goalsAgainst'])assert.equal(actual[k],s[k],`${g.name} ${id} ${k}`);}
 groups.push({name:g.name,teams:stats.size,matches:fixtures.length,standingsArithmetic:'PASS'});
}
assert.equal(appearances.size,20);for(const n of appearances.values())assert.equal(n,7);
for(const main of stage.pools.filter(x=>x.key.startsWith('main'))){assert.equal(main.registrationIds.length,5);main.sources.forEach((source,i)=>{const pre=stage.pools.find(x=>x.key===source.poolKey);assert(pre.ranks[source.rank-1].includes(main.registrationIds[i]));});}
const report={verdict:'PASS',officialResults:70,teams:20,gamesPerTeam:7,rankSourceMapping:'PASS (A group tied positions resolved with recorded operator reason)',groups};fs.writeFileSync(path.join(root,'ranked-full-flow-20261119-arithmetic.json'),JSON.stringify(report,null,2));console.log(report);
