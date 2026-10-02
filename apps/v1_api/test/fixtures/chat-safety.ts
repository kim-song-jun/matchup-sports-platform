import type { PrismaClient } from '@prisma/client';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
export const chatSafetyIds = {
  a: '9a190000-0000-4000-8000-000000000001',
  b: '9a190000-0000-4000-8000-000000000002',
  c: '9a190000-0000-4000-8000-000000000003',
  outsider: '9a190000-0000-4000-8000-000000000004',
  team: '9a190000-0000-4000-8000-000000000005',
  room: '9a190000-0000-4000-8000-000000000006',
  message: '9a190000-0000-4000-8000-000000000007',
};
/** Only call on an isolated integration database. No real users or content. */
export async function createChatSafetyFixture(prisma: PrismaClient) {
  const ids = chatSafetyIds;
  const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, create: { code: 'futsal', name: '풋살' }, update: {} });
  const region = await prisma.v1Region.upsert({ where: { code: 'qa-play-readiness' }, create: { code: 'qa-play-readiness', name: '심사 준비 QA 지역', level: 1 }, update: {} });
  for (const [key, name] of [['a', 'QA 민준'], ['b', 'QA 서연'], ['c', 'QA 지훈'], ['outsider', 'QA 외부인']] as const) {
    await prisma.v1User.create({ data: { id: ids[key], email: `${key}@play-readiness.invalid`, onboardingStatus: 'completed', phoneVerifiedAt: new Date(), profile: { create: { nickname: name, displayName: name } } } });
    const terms = new ManagedTermsRuntimeService(prisma as PrismaService);
    const current = await terms.currentTerms('signup', ids[key]);
    await terms.acceptSignupTerms(ids[key], current.items.filter((item) => item.requirement === 'required').map((item) => item.documentId));
  }
  await prisma.v1Team.create({ data: { id: ids.team, ownerUserId: ids.a, sportId: sport.id, regionId: region.id, name: '심사 준비 QA 풋살팀', memberCount: 3,
    memberships: { create: [ids.a, ids.b, ids.c].map((userId) => ({ userId, role: userId === ids.a ? 'owner' : 'member' })) },
  } });
  await prisma.v1ChatRoom.create({ data: { id: ids.room, teamId: ids.team, lastMessageAt: new Date(), participants: { create: [ids.a, ids.b, ids.c].map((userId) => ({ userId, visibleFromAt: new Date('2020-01-01') })) } } });
  await prisma.v1ChatMessage.create({ data: { id: ids.message, chatRoomId: ids.room, senderUserId: ids.b, body: '이번 주 토요일 풋살에 함께해요. 운동화와 물을 챙겨 주세요.' } });
}
