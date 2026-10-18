const {PrismaClient}=require('@prisma/client');
const fs=require('node:fs');
const p=new PrismaClient();
(async()=>{try{
 if(new URL(process.env.DATABASE_URL).pathname!=='/teameet_alpha')throw Error('Not alpha database');
 const db=await p.$queryRaw`SELECT current_database() AS name`;
 if(db[0].name!=='teameet_alpha')throw Error('Wrong actual database');
 const teams=await p.v1Team.findMany({where:{status:'active',deletedAt:null},orderBy:{createdAt:'asc'},select:{id:true,name:true,sport:{select:{id:true,code:true}},memberships:{where:{status:'active',user:{accountStatus:'active',deletedAt:null}},select:{userId:true,user:{select:{profile:{select:{realName:true}}}}}}}});
 const candidates=teams.filter(t=>t.memberships.length>=8);
 const admin=await p.v1AdminUser.findFirst({where:{status:'active',id:'33aa2e09-5313-4b1f-93bd-df4c031ce9b0'},select:{id:true,adminRole:true}});
 console.log(JSON.stringify({database:db[0].name,activeTeams:teams.length,teamsWithEight:candidates.map(t=>({id:t.id,name:t.name,sport:t.sport.code,members:t.memberships.length,realNames:t.memberships.filter(m=>m.user.profile?.realName).length})),admin,helpers:{plan:fs.existsSync('dist/src/tournaments/templates/bracket-template-plan.js'),standings:fs.existsSync('dist/src/tournaments/tournament-standings-source.js'),canonicalSeed:fs.existsSync('prisma/canonical-tournament-seed.ts')}}));
}finally{await p.$disconnect();}})().catch(e=>{console.error(e.message);process.exitCode=1});
