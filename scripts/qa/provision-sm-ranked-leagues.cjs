// Alpha-only fixture provisioning. Password arrives on stdin, never in source or output.
const { PrismaClient } = require('@prisma/client');
const { createHash, randomBytes, scryptSync } = require('node:crypto');
const fs = require('node:fs');
const prisma = new PrismaClient();
const stamp = 'sm20261116';
function id(kind, n) {
  const h = createHash('sha256').update(`${stamp}:${kind}:${n}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== 'v1_postgres' || url.pathname !== '/teameet_alpha') throw Error('Alpha database guard rejected');
  if (!process.argv.includes('--apply')) throw Error('Explicit --apply required');
  if (process.argv.includes('--initialize-record-defaults')) {
    // Match recordSignupConsent(undefined): product default, never an explicit consent.
    await prisma.$transaction(async tx => {
      for(let t=1;t<=20;t++) for(let p=1;p<=7;p++) {
        const tt=String(t).padStart(2,'0'),pp=String(p).padStart(2,'0'),userId=id('user',tt+pp);
        const user=await tx.v1User.findUniqueOrThrow({where:{id:userId}});
        if(user.email!==`${stamp}.t${tt}.p${pp}@teameet.test`)throw Error('Fixture ownership mismatch');
        await tx.v1UserRecordConsent.upsert({where:{userId},update:{},create:{userId,state:'GRANTED',policyHash:'v1-public-record-default-2'}});
      }
    },{timeout:45000});
    console.log(JSON.stringify({initializedFixtureDefaults:140,existingPreferencesPreserved:true}));return;
  }
  const password = fs.readFileSync(0, 'utf8').trim();
  if (password.length < 8) throw Error('Password input required');
  const salt = randomBytes(16).toString('hex');
  const passwordHash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  const now = new Date();
  const report = await prisma.$transaction(async tx => {
    const tournament = await tx.v1Tournament.findFirst({ where: { id: 'ee1675e5-264e-43ec-9a36-bd2f0a3099d9', title: { startsWith: '(테스트) sm ' } } });
    if (!tournament?.stagePlan || tournament.teamCount !== 20) throw Error('Owned tournament guard rejected');
    const sport = await tx.v1Sport.findUniqueOrThrow({ where: { code: 'futsal' } });
    const region = await tx.v1Region.findFirstOrThrow({ orderBy: { id: 'asc' } });
    const teams = [];
    for (let t = 1; t <= 20; t++) {
      const tt = String(t).padStart(2, '0'), members = [];
      for (let p = 1; p <= 7; p++) {
        const pp = String(p).padStart(2, '0'), n = `${tt}${pp}`;
        const userId = id('user', n), email = `${stamp}.t${tt}.p${pp}@teameet.test`;
        const existing = await tx.v1User.findUnique({ where: { id: userId } });
        if (existing) {
          if (existing.email !== email) throw Error('Existing user ownership conflict');
          const identity = await tx.v1AuthIdentity.findUnique({ where: { provider_providerUserKey: { provider: 'email', providerUserKey: email } } });
          if (!identity || identity.userId !== userId) throw Error('Existing identity mismatch');
        } else {
          await tx.v1User.create({ data: {
            id: userId, email, phone: `0000016${tt}${pp}`, phoneVerifiedAt: now, emailVerifiedAt: now,
            accountStatus: 'active', onboardingStatus: 'completed',
            profile: { create: { nickname: `${stamp}t${tt}p${pp}`, displayName: `sm ${tt}팀 ${pp}선수`, realName: `sm${tt}${pp}`, gender: 'male', birthDate: '2000-01-01', bio: 'Alpha test fixture; not a real person.' } },
            authIdentities: { create: { provider: 'email', providerUserKey: email, email, passwordHash, status: 'active' } },
          } });
        }
        members.push(userId);
        await tx.v1UserRecordConsent.upsert({where:{userId},update:{},create:{userId,state:'GRANTED',policyHash:'v1-public-record-default-2'}});
      }
      const teamId = id('team', tt), existingTeam = await tx.v1Team.findUnique({ where: { id: teamId } });
      if (existingTeam) {
        if (existingTeam.ownerUserId !== members[0] || existingTeam.name !== `(테스트) sm ${tt}팀`) throw Error('Existing team ownership conflict');
        if (await tx.v1TeamMembership.count({ where: { teamId, status: 'active' } }) !== 7) throw Error('Existing membership count mismatch');
      } else {
        await tx.v1Team.create({ data: { id: teamId, ownerUserId: members[0], sportId: sport.id, regionId: region.id, name: `(테스트) sm ${tt}팀`, status: 'active', joinPolicy: 'approval_required', memberCount: 7, membersVisible: true,
          profile: { create: { description: 'Alpha-only 20-team ranked league QA fixture.', genderRule:'남' } },
          memberships: { create: members.map((userId, i) => ({ userId, role: i === 0 ? 'owner' : 'member', status: 'active', joinedAt: now })) },
        } });
      }
      teams.push({ teamId, teamNo: t, captainEmail: `${stamp}.t${tt}.p01@teameet.test`, members: members.length });
    }
    return { teams, userCount: 140 };
  }, { timeout: 120000 });
  console.log(JSON.stringify(report));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
