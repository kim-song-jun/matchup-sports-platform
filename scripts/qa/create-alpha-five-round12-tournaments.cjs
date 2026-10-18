/* User-requested alpha fixtures. Default is read-only planning; CREATE_ONLY writes new IDs. */
const { PrismaClient } = require('@prisma/client');
const { createHash, randomUUID } = require('node:crypto');
const path = require('node:path');
require('ts-node/register/transpile-only');
const fromDist = name => require(path.join(process.cwd(), 'dist/src/tournaments', name));
const { planBracketTemplate } = fromDist('templates/bracket-template-plan.js');
const { loadCanonicalStandingsSource } = fromDist('tournament-standings-source.js');
const { recalculateAndUpsertGroupStandings } = fromDist('tournament-group-standings.js');
const { recalculateAndUpsertOverallStandings } = fromDist('tournament-overall-standings.js');
const { ensureCanonicalTournamentMatch, ensureCanonicalOfficialResult } = require(path.join(process.cwd(), 'prisma/canonical-tournament-seed.ts'));
const prisma = new PrismaClient();
const IDS = Array.from({ length: 5 }, (_, i) => `d5202610-1018-4000-8000-${String(i + 1).padStart(12, '0')}`);
const PREFIX = '(테스트) 20팀·8명 12강 · 조별 1경기 남음';
const APPLY = process.env.ALPHA_FIVE_APPLY === 'CREATE_ONLY';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function selectSquads(teams) {
  // Bipartite matching avoids putting one existing member on two teams in one tournament.
  const owners = new Map(), slots = new Map(), selected = [];
  const teamById = new Map(teams.map(team => [team.id, team]));
  function augment(slot, seen) {
    const team = teamById.get(slots.get(slot));
    for (const member of team.memberships) {
      if (seen.has(member.userId)) continue;
      seen.add(member.userId);
      const previous = owners.get(member.userId);
      if (!previous || augment(previous, seen)) { owners.set(member.userId, slot); return true; }
    }
    return false;
  }
  for (const team of teams) {
    const snapshot = new Map(owners);
    let ok = true;
    for (let index = 0; index < 8; index++) {
      const slot = `${team.id}:${index}`; slots.set(slot, team.id);
      if (!augment(slot, new Set())) { ok = false; break; }
    }
    if (!ok) { owners.clear(); for (const [id, slot] of snapshot) owners.set(id, slot); continue; }
    selected.push(team);
    if (selected.length === 20) break;
  }
  if (selected.length !== 20) throw Error(`Only ${selected.length} existing teams support 8 distinct real-name members`);
  return selected.map(team => ({ ...team, players: team.memberships.filter(member => owners.get(member.userId)?.startsWith(`${team.id}:`)).sort((a,b) => a.userId.localeCompare(b.userId)) }));
}

async function fingerprint(teams) {
  const teamIds = teams.map(team => team.id);
  const userIds = teams.flatMap(team => team.memberships.map(member => member.userId));
  return hash(await Promise.all([
    prisma.v1Team.findMany({ where: { id: { in: teamIds } }, orderBy: { id: 'asc' } }),
    prisma.v1TeamMembership.findMany({ where: { teamId: { in: teamIds } }, orderBy: { id: 'asc' } }),
    prisma.v1User.findMany({ where: { id: { in: userIds } }, select: { id: true, updatedAt: true, accountStatus: true }, orderBy: { id: 'asc' } }),
    prisma.v1UserProfile.findMany({ where: { userId: { in: userIds } }, select: { userId: true, updatedAt: true }, orderBy: { userId: 'asc' } }),
  ]));
}

async function verify(tx, id) {
  const tournament = await tx.v1Tournament.findUniqueOrThrow({ where: { id }, include: {
    registrations: { include: { players: { where: { removedAt: null }, select: { userId: true } } } },
    groups: { include: { groupTeams: true, standings: true } },
    tournamentMatchDetails: { include: { teamMatch: { include: { game: { include: { currentOfficialRevision: true, participants: true } } } } } },
  } });
  if (!tournament.title.startsWith(PREFIX)) throw Error('Reserved ID belongs to another tournament');
  const groups = tournament.groups.filter(group => group.phase === 'group');
  const groupIds = new Set(groups.map(group => group.id));
  const details = tournament.tournamentMatchDetails;
  const stage = details.filter(detail => groupIds.has(detail.groupId));
  const knockout = details.filter(detail => !groupIds.has(detail.groupId));
  const players = tournament.registrations.flatMap(registration => registration.players);
  const summary = { id, title: tournament.title, teams: tournament.registrations.length, players: players.length, uniquePlayers: new Set(players.map(player => player.userId)).size,
    groups: groups.map(group => { const fixtures = stage.filter(detail => detail.groupId === group.id); return { name: group.name, teams: group.groupTeams.length,
      completed: fixtures.filter(detail => detail.teamMatch.game.currentOfficialRevision?.state === 'OFFICIAL').length,
      remaining: fixtures.filter(detail => detail.teamMatch.game.state === 'SCHEDULED').length, standings: group.standings.length }; }),
    knockoutFixtures: knockout.length,
    knockoutAssigned: knockout.filter(detail => detail.homeRegistrationId || detail.awayRegistrationId).length,
    byeSlots: await tx.v1TournamentSlot.count({ where: { tournamentId: id, kind: 'BYE' } }),
    edges: await tx.v1TournamentMatchAdvancementEdge.count({ where: { tournamentId: id } }),
    overallStandings: await tx.v1TournamentOverallStanding.count({ where: { tournamentId: id } }),
    rosterSizeCorrect: tournament.registrations.every(registration => registration.players.length === 8),
    gameRosterSizesCorrect: stage.every(detail => detail.teamMatch.game.participants.length === 16),
  };
  if (summary.teams !== 20 || summary.players !== 160 || summary.uniquePlayers !== 160 || !summary.rosterSizeCorrect || !summary.gameRosterSizesCorrect || summary.groups.length !== 5 || summary.groups.some(group => group.teams !== 4 || group.completed !== 5 || group.remaining !== 1 || group.standings !== 4) || summary.knockoutFixtures !== 11 || summary.knockoutAssigned !== 0 || summary.byeSlots !== 4 || summary.edges !== 10 || summary.overallStandings !== 20) throw Error('Created tournament failed count/state invariants: '+JSON.stringify(summary));
  return summary;
}

async function main() {
  if (new URL(process.env.DATABASE_URL).pathname !== '/teameet_alpha') throw Error('Refusing non-alpha runtime URL');
  const database = await prisma.$queryRaw`SELECT current_database() AS name`;
  if (database[0].name !== 'teameet_alpha') throw Error('Refusing non-alpha actual database');
  const admin = await prisma.v1AdminUser.findFirst({ where: { status: 'active', id: '33aa2e09-5313-4b1f-93bd-df4c031ce9b0' }, select: { id: true, userId: true } });
  if (!admin) throw Error('Authorized active admin not found');
  const teams = await prisma.v1Team.findMany({ where: { status: 'active', deletedAt: null, sport: { code: 'futsal' } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { memberships: { where: { status: 'active', user: { accountStatus: 'active', deletedAt: null, profile: { is: { deletedAt: null, realName: { not: null } } } } },
      include: { user: { select: { profile: { select: { realName: true, nickname: true, displayName: true, birthDate: true, gender: true } } } } }, orderBy: { userId: 'asc' } } } });
  const candidates = teams.filter(team => team.memberships.filter(member => member.user.profile.realName.trim()).length >= 8 && !/테스트|QA|E2E/i.test(team.name));
  for (const team of candidates) team.memberships = team.memberships.filter(member => member.user.profile.realName.trim());
  const squads = selectSquads(candidates);
  if (squads.some(team => team.players.length !== 8)) throw Error('Matching did not select exactly 8 per team');
  const template = await prisma.v1Tournament.findFirst({ where: { id: 'ad200600-0000-4000-8000-000000000003', competitionConfigVersionId: { not: null } }, include: { competitionConfig: true } });
  if (!template?.competitionConfig) throw Error('Known alpha competition config not found');
  const plan = planBracketTemplate({ kind: 'group_knockout', groupCount: 5, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false, qualificationMode: 'cross_group_round12' }, { fixtureNumberOffset: 0 });
  if (plan.fixtures.length !== 41 || plan.byeSlots.length !== 4 || plan.edges.length !== 10) throw Error('Unexpected runtime template');
  console.log(JSON.stringify({ mode: APPLY ? 'CREATE_ONLY' : 'READ_ONLY_PLAN', ids: IDS, teams: squads.map(team => ({ id: team.id, name: team.name, players: team.players.length })), uniquePlayers: new Set(squads.flatMap(team => team.players.map(member => member.userId))).size, fixturesPerTournament: plan.fixtures.length }));
  if (!APPLY) return;
  const before = await fingerprint(squads);
  const userIds = squads.flatMap(team => team.players.map(member => member.userId));
  const previousEligibility = await prisma.v1TournamentPlayer.findMany({ where: { userId: { in: userIds }, removedAt: null }, select: { userId: true, eligibilityStatus: true }, orderBy: { updatedAt: 'desc' } });
  const eligibility = new Map(); for (const row of previousEligibility) if (!eligibility.has(row.userId)) eligibility.set(row.userId, row.eligibilityStatus);
  const now = new Date(), past = new Date(now.getTime() - 48*3600000), tomorrow = new Date(now.getTime()+24*3600000);
  for (const [variant, tournamentId] of IDS.entries()) {
    const summary = await prisma.$transaction(async tx => {
      if (await tx.v1Tournament.findUnique({ where: { id: tournamentId }, select: { id: true } })) return { preserved: true, ...await verify(tx,tournamentId) };
      const title = `${PREFIX} ${String(variant+1).padStart(2,'0')}`;
      await tx.v1Tournament.create({ data: { id: tournamentId, title, sportId: squads[0].sportId, regionId: squads[0].regionId, kind: 'regular_tournament', format: 'group_knockout', status: 'in_progress', isPublic: true,
        competitionConfigVersionId: template.competitionConfigVersionId, teamCount: 20, minPlayers: 8, maxPlayers: 8, genderCategory: 'mixed', entryFee: 0,
        scheduledAt: past, scheduledEndAt: new Date(tomorrow.getTime()+24*3600000), registrationDeadlineAt: new Date(past.getTime()-3600000), rosterDeadlineAt: new Date(past.getTime()-1800000), bracketPublishedAt: now,
        rulesText: 'ALPHA 운영 연습용 테스트 대회입니다. 기존20팀·팀당8명. 각 조 마지막1경기를 입력한 뒤 조 간 성적 비교로12강 진출팀을 확정하세요. 점수는 운영 연습용 합성 결과이며 실제 경기 전적이 아닙니다.', refundPolicyText: '무료 테스트 대회로 실제 결제는 없어요.', createdByAdminUserId: admin.id } });
      const ordered = squads.map((_, index) => squads[(index+variant*3)%20]);
      const registrations = new Map();
      for (const team of ordered) {
        const registration = await tx.v1TournamentRegistration.create({ data: { tournamentId, teamId: team.id, appliedByUserId: team.ownerUserId, entrySource: 'seeded', status: 'confirmed', confirmedAt: past, confirmedByAdminUserId: admin.id, agreedRules: false, agreedPrivacy: false, agreedRefund: false, agreedMediaConsent: false, adjustmentNote: '사용자 요청 ALPHA 운영 연습용 강제 등록. 실제 팀의 신청/동의로 간주하지 않아요.' } });
        await tx.v1TournamentPlayer.createMany({ data: team.players.map((member, index) => ({ registrationId: registration.id, userId: member.userId, realName: member.user.profile.realName, birthDateSnapshot: member.user.profile.birthDate, genderSnapshot: member.user.profile.gender,
          jerseyNumber: index+1, goalkeeper: index===0, eligibilityStatus: eligibility.get(member.userId) ?? 'needs_review', eligibilityNote: '기존 명단의 자격 상태를 복사한 ALPHA 연습용 명단. 새 자격 판정은 하지 않았어요.' })) });
        registrations.set(team.id,registration.id);
      }
      const groupIds = new Map(), slotIds = new Map(), fixtureIds = new Map(), entryTeams = new Map();
      for (const group of plan.groups) {
        const created = await tx.v1TournamentGroup.create({ data: { tournamentId, name: group.name, phase: group.phase, sortOrder: group.sortOrder, advanceCount: group.advanceCount } }); groupIds.set(group.key,created.id);
        if (group.phase==='group') for (let j=0;j<4;j++) { const team=ordered[group.sortOrder*4+j]; await tx.v1TournamentGroupTeam.create({ data: { groupId:created.id, registrationId:registrations.get(team.id), sortOrder:j } }); }
      }
      for (const slot of plan.slots) {
        const sourceGroup = plan.groups.find(group => group.key===slot.groupKey);
        const team = slot.kind==='ENTRY' && sourceGroup.phase==='group' ? ordered[sourceGroup.sortOrder*4+slot.position-1] : null;
        const created=await tx.v1TournamentSlot.create({ data: { tournamentId, kind:slot.kind, groupId:groupIds.get(slot.groupKey), position:slot.position, byeSortOrder:slot.kind==='BYE'?(slot.position-1)*2:null, sourceGroupId:slot.sourceGroupKey?groupIds.get(slot.sourceGroupKey):null, registrationId:team?registrations.get(team.id):null } });
        slotIds.set(slot.key,created.id); if(team)entryTeams.set(slot.key,team);
      }
      await tx.v1TournamentByeSlot.createMany({ data:plan.byeSlots.map(slot => ({groupId:groupIds.get(slot.groupKey),sortOrder:slot.sortOrder})) });
      const counters=new Map();
      for (const fixture of plan.fixtures) {
        const group=plan.groups.find(group => group.key===fixture.groupKey), isGroup=group.phase==='group';
        const n=(counters.get(fixture.groupKey)??0)+1;counters.set(fixture.groupKey,n);
        const complete=isGroup&&n<=5, home=entryTeams.get(fixture.homeSlotKey),away=entryTeams.get(fixture.awaySlotKey);
        const startAt=complete?new Date(past.getTime()+fixture.fixtureNumber*20*60000):new Date(tomorrow.getTime()+fixture.fixtureNumber*20*60000);
        const match=await ensureCanonicalTournamentMatch(tx,{ tournamentId,sportId:squads[0].sportId,competitionConfigVersionId:template.competitionConfigVersionId,title:`${title} ${group.name} ${fixture.fixtureNumber}번 경기`,startAt,placeName:null,status:complete?'completed':'matched',
          homeTeamId:home?.id??null,awayTeamId:away?.id??null,homeTeamName:home?.name??'TBD',awayTeamName:away?.name??'TBD',hostTeamId:home?.id??null,groupId:groupIds.get(fixture.groupKey),round:fixture.round,fixtureNumber:fixture.fixtureNumber,legNumber:fixture.legNumber,
          homeRegistrationId:home?registrations.get(home.id):null,awayRegistrationId:away?registrations.get(away.id):null,matchId:randomUUID(),
          homePlayers:home?.players.map((member,index)=>({userId:member.userId,displayName:member.user.profile.nickname??member.user.profile.displayName??'팀원',jerseyNumber:index+1}))??[],awayPlayers:away?.players.map((member,index)=>({userId:member.userId,displayName:member.user.profile.nickname??member.user.profile.displayName??'팀원',jerseyNumber:index+1}))??[] });
        await tx.v1TeamMatch.update({where:{id:match.id},data:{homeSlotId:fixture.homeSlotKey?slotIds.get(fixture.homeSlotKey):null,awaySlotId:fixture.awaySlotKey?slotIds.get(fixture.awaySlotKey):null}});
        if(isGroup) {
          const starterCount=Math.min(8,template.competitionConfig.lineup.maxPlayers??5);
          const bench=[...home.players.slice(starterCount),...away.players.slice(starterCount)].map(member=>member.userId);
          if(bench.length)await tx.v1GameParticipant.updateMany({where:{gameId:match.gameId,userId:{in:bench}},data:{started:false}});
        }
        if(complete)await ensureCanonicalOfficialResult(tx,{gameId:match.gameId,tournamentId,homeTeamId:home.id,awayTeamId:away.id,homeScore:(n+group.sortOrder+variant)%4,awayScore:(n*2+variant+group.sortOrder)%3,playedAt:startAt,recordedAt:new Date(startAt.getTime()+15*60000),sourceHash:hash({task:'alpha-five-20261018',tournamentId,fixture:fixture.key})});
        fixtureIds.set(fixture.key,match.id);
      }
      await tx.v1TournamentMatchAdvancementEdge.createMany({data:plan.edges.map(edge=>({tournamentId,sourceTeamMatchId:fixtureIds.get(edge.sourceFixtureKey),sourceOutcome:edge.outcome,targetTeamMatchId:fixtureIds.get(edge.targetFixtureKey),targetSide:edge.targetSide}))});
      const source=await loadCanonicalStandingsSource(tx,tournamentId);
      for(const group of source.groups)await recalculateAndUpsertGroupStandings(tx,{tournamentId,configVersionId:source.configVersionId,config:source.config,group},source.recalculatedAt);
      await recalculateAndUpsertOverallStandings(tx,{tournamentId,configVersionId:source.configVersionId,config:source.config,groups:source.groups},source.recalculatedAt);
      await tx.v1AdminActionLog.create({data:{adminUserId:admin.id,action:'tournament.qa.create_existing_teams_round12',targetType:'tournament',targetId:tournamentId,afterJson:{task:'20261090',teams:20,players:160,completed:25,remaining:5,knockout:11,syntheticResults:true,actualConsent:false}}});
      return {preserved:false,...await verify(tx,tournamentId)};
    },{timeout:120000,maxWait:5000});
    console.log(JSON.stringify({createdTournament:summary}));
  }
  const after=await fingerprint(squads);
  console.log(JSON.stringify({existingTeamsAndMembershipsUnchanged:before===after}));
  if(before!==after)throw Error('Existing entity fingerprint changed; review concurrent writes');
}
main().catch(error=>{ console.error(JSON.stringify({errorType:error.name,errorCode:error.code??null,message:error.name?.startsWith('Prisma')?'Prisma operation failed; transaction was rolled back.':error.message}));process.exitCode=1; }).finally(()=>prisma.$disconnect());
