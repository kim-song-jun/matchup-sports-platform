import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { FUTSAL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config.presets';
import { competitionConfigContentHash } from '../../src/tournaments/competition-config/competition-config.validator';

/** Fresh, isolated friendly game with ordinary players on both submitted lineups. No global seed/reset. */
export async function createSharedRecordFixture(prisma: PrismaClient, startsInMs = -30 * 60_000) {
  const userIds = Array.from({ length: 5 }, () => randomUUID());
  const names = ['김민수', '박지훈', '이서준', '최도윤', '관람 사용자'];
  for (const [i, id] of userIds.entries()) await prisma.v1User.create({ data: {
    id, email: `record-${id}@example.test`, accountStatus: 'active', onboardingStatus: 'completed', phoneVerifiedAt: new Date(),
    profile: { create: { nickname: names[i] } },
  } });
  const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, create: { code: 'futsal', name: '풋살' }, update: {} });
  const region = await prisma.v1Region.create({ data: { code: `record-${randomUUID()}`, name: '서울 마포구', level: 1 } });
  const teams = await Promise.all(['한강 FC', '마포 유나이티드'].map((name, i) => prisma.v1Team.create({ data: { name, sportId: sport.id, regionId: region.id, ownerUserId: userIds[i * 2] } })));
  for (let i = 0; i < 4; i++) await prisma.v1TeamMembership.create({ data: { teamId: teams[Math.floor(i / 2)].id, userId: userIds[i], role: i % 2 === 0 ? 'owner' : 'member', status: 'active' } });
  const hash = competitionConfigContentHash(FUTSAL_V1_CONFIG);
  const config = await prisma.v1CompetitionConfigVersion.upsert({ where: { contentHash: hash }, update: {}, create: {
    sportCode: 'futsal', name: 'futsal-v1', version: 1, contentHash: hash,
    ...JSON.parse(JSON.stringify(FUTSAL_V1_CONFIG)),
  } });
  const startAt = new Date(Date.now() + startsInMs);
  const match = await prisma.v1TeamMatch.create({ data: {
    hostTeamId: teams[0].id, createdByUserId: userIds[0], approvedApplicantTeamId: teams[1].id,
    sportId: sport.id, regionId: region.id, title: '한강 FC vs 마포 유나이티드', placeName: '마포 풋살파크',
    placeAddress: '서울 마포구 월드컵로', description: '함께 뛰고 함께 기록하는 친선 경기입니다.',
    startAt, endAt: new Date(startAt.getTime() + 90 * 60_000), status: 'matched', competitionConfigVersionId: config.id,
  } });
  await prisma.v1TeamMatchApplication.create({ data: { teamMatchId: match.id, applicantTeamId: teams[1].id, appliedByUserId: userIds[2], status: 'approved' } });
  const game = await prisma.v1Game.create({ data: { teamMatchId: match.id, sourceType: 'TEAM_MATCH', competitionConfigVersionId: config.id } });
  const sides = []; const participants = [];
  for (let i = 0; i < 2; i++) {
    const side = await prisma.v1GameSide.create({ data: { gameId: game.id, sideKey: i === 0 ? 'HOME' : 'AWAY', teamId: teams[i].id, displayNameSnapshot: teams[i].name } });
    sides.push(side);
    const lineup = await prisma.v1GameLineup.create({ data: { gameId: game.id, sideId: side.id, revision: 1, state: 'SUBMITTED', submittedAt: new Date() } });
    for (let j = 0; j < 2; j++) participants.push(await prisma.v1GameParticipant.create({ data: { gameId: game.id, sideId: side.id, lineupId: lineup.id, userId: userIds[i * 2 + j], displayNameSnapshot: names[i * 2 + j], jerseyNumber: j === 0 ? 7 : 10 } }));
  }
  await prisma.v1GameVisibilityPolicy.create({ data: { gameId: game.id, mode: 'LIVE' } });
  return { match, game, sides, participants, userIds, teams };
}
