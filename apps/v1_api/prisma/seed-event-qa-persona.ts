import { Prisma } from '@prisma/client';

const LOCAL_QA_USER_ID = 'e7e70000-0000-4000-8000-000000000001';
const LOCAL_QA_USER_EMAIL = 'event.qa@teameet.local';
const LOCAL_QA_TEAM_ID = 'e7e70000-0000-4000-8000-000000000002';
const LOCAL_QA_TEAM_NAME = '청라 블루웨이브 FC';
const LOCAL_QA_STARTED_AT = new Date('2026-07-16T09:00:00.000Z');

export const localEventQaRequirements = {
  sportCode: 'futsal',
  sportLevelCode: 'intermediate',
  regionCode: 'incheon-seo',
} as const;

export async function upsertLocalEventQaPersona(
  tx: Prisma.TransactionClient,
  input: {
    sportId: string;
    sportLevelId: string;
    regionId: string;
  },
) {
  const user = await tx.v1User.upsert({
    where: { email: LOCAL_QA_USER_EMAIL },
    update: {
      accountStatus: 'active',
      onboardingStatus: 'completed',
      deletedAt: null,
      emailVerifiedAt: LOCAL_QA_STARTED_AT,
    },
    create: {
      id: LOCAL_QA_USER_ID,
      email: LOCAL_QA_USER_EMAIL,
      accountStatus: 'active',
      onboardingStatus: 'completed',
      emailVerifiedAt: LOCAL_QA_STARTED_AT,
    },
  });

  await tx.v1UserProfile.upsert({
    where: { userId: user.id },
    update: {
      nickname: '윤하늘',
      displayName: '윤하늘',
      gender: 'female',
      birthDate: '19970318',
      bio: '청라에서 주말 풋살을 즐기는 로컬 QA 팀장입니다.',
      displayRegion: '인천 서구',
      visibility: 'public',
      deletedAt: null,
    },
    create: {
      userId: user.id,
      nickname: '윤하늘',
      displayName: '윤하늘',
      gender: 'female',
      birthDate: '19970318',
      bio: '청라에서 주말 풋살을 즐기는 로컬 QA 팀장입니다.',
      displayRegion: '인천 서구',
      visibility: 'public',
    },
  });

  await tx.v1UserOnboardingProgress.upsert({
    where: { userId: user.id },
    update: {
      currentStep: 'completed',
      completedAt: LOCAL_QA_STARTED_AT,
      deferredAt: null,
      draftJson: Prisma.DbNull,
    },
    create: {
      userId: user.id,
      currentStep: 'completed',
      completedAt: LOCAL_QA_STARTED_AT,
    },
  });

  await tx.v1UserSportPreference.upsert({
    where: { userId_sportId: { userId: user.id, sportId: input.sportId } },
    update: {
      sportLevelId: input.sportLevelId,
      isPrimary: true,
    },
    create: {
      userId: user.id,
      sportId: input.sportId,
      sportLevelId: input.sportLevelId,
      isPrimary: true,
    },
  });

  await tx.v1UserRegion.upsert({
    where: { userId_regionId: { userId: user.id, regionId: input.regionId } },
    update: { isPrimary: true },
    create: {
      userId: user.id,
      regionId: input.regionId,
      isPrimary: true,
    },
  });

  await tx.v1UserReputationSummary.upsert({
    where: { userId: user.id },
    update: {
      trustState: 'sample',
      mannerScore: null,
      reviewCount: 0,
      sourceLabel: 'local-event-qa',
      calculatedAt: null,
    },
    create: {
      userId: user.id,
      trustState: 'sample',
      reviewCount: 0,
      sourceLabel: 'local-event-qa',
    },
  });

  await tx.v1NotificationPreference.upsert({
    where: { userId: user.id },
    update: {
      importantEnabled: true,
      activityEnabled: true,
      matchEnabled: true,
      teamEnabled: true,
      teamMatchEnabled: true,
      chatEnabled: true,
      noticeEnabled: true,
      marketingEnabled: false,
    },
    create: {
      userId: user.id,
      importantEnabled: true,
      activityEnabled: true,
      matchEnabled: true,
      teamEnabled: true,
      teamMatchEnabled: true,
      chatEnabled: true,
      noticeEnabled: true,
      marketingEnabled: false,
    },
  });

  await tx.v1Team.upsert({
    where: { id: LOCAL_QA_TEAM_ID },
    update: {
      ownerUserId: user.id,
      sportId: input.sportId,
      regionId: input.regionId,
      name: LOCAL_QA_TEAM_NAME,
      status: 'active',
      joinPolicy: 'approval_required',
      membersVisible: true,
      memberCount: 1,
      managerCount: 0,
      deletedAt: null,
    },
    create: {
      id: LOCAL_QA_TEAM_ID,
      ownerUserId: user.id,
      sportId: input.sportId,
      regionId: input.regionId,
      name: LOCAL_QA_TEAM_NAME,
      status: 'active',
      joinPolicy: 'approval_required',
      membersVisible: true,
      memberCount: 1,
      managerCount: 0,
    },
  });

  await tx.v1TeamProfile.upsert({
    where: { teamId: LOCAL_QA_TEAM_ID },
    update: {
      logoUrl: '/uploads/dev-events/team-huddle.webp',
      coverImageUrl: '/uploads/dev-events/futsal-rooftop.webp',
      description: '청라를 중심으로 주말 저녁에 함께 뛰는 풋살팀입니다.',
      activityNote: '인천 서구 · 토요일 저녁 정기 경기',
      activityDays: ['sat'],
      activityFrequency: 'weekly_1',
      activityTimeSlots: ['evening'],
      activityTypes: ['friendly_match', 'team_match'],
      skillNote: '중급 중심, 매너 있는 경기를 우선합니다.',
      minSportLevelId: input.sportLevelId,
      maxSportLevelId: input.sportLevelId,
      genderRule: '성별 무관',
      memberGoalCount: 12,
      deletedAt: null,
    },
    create: {
      teamId: LOCAL_QA_TEAM_ID,
      logoUrl: '/uploads/dev-events/team-huddle.webp',
      coverImageUrl: '/uploads/dev-events/futsal-rooftop.webp',
      description: '청라를 중심으로 주말 저녁에 함께 뛰는 풋살팀입니다.',
      activityNote: '인천 서구 · 토요일 저녁 정기 경기',
      activityDays: ['sat'],
      activityFrequency: 'weekly_1',
      activityTimeSlots: ['evening'],
      activityTypes: ['friendly_match', 'team_match'],
      skillNote: '중급 중심, 매너 있는 경기를 우선합니다.',
      minSportLevelId: input.sportLevelId,
      maxSportLevelId: input.sportLevelId,
      genderRule: '성별 무관',
      memberGoalCount: 12,
    },
  });

  await tx.v1TeamTrustScore.upsert({
    where: { teamId: LOCAL_QA_TEAM_ID },
    update: {
      trustState: 'sample',
      mannerScore: null,
      matchCount: 0,
      sourceLabel: 'local-event-qa',
      calculatedAt: null,
    },
    create: {
      teamId: LOCAL_QA_TEAM_ID,
      trustState: 'sample',
      matchCount: 0,
      sourceLabel: 'local-event-qa',
    },
  });

  await tx.v1TeamMembership.upsert({
    where: {
      teamId_userId: {
        teamId: LOCAL_QA_TEAM_ID,
        userId: user.id,
      },
    },
    update: {
      role: 'owner',
      status: 'active',
      joinedAt: LOCAL_QA_STARTED_AT,
      leftAt: null,
      removedByUserId: null,
    },
    create: {
      teamId: LOCAL_QA_TEAM_ID,
      userId: user.id,
      role: 'owner',
      status: 'active',
      joinedAt: LOCAL_QA_STARTED_AT,
    },
  });

  return {
    userId: user.id,
    userEmail: LOCAL_QA_USER_EMAIL,
    teamId: LOCAL_QA_TEAM_ID,
    teamName: LOCAL_QA_TEAM_NAME,
    sessionStorage: {
      'teameet.v1.userId': user.id,
      'teameet.v1.userEmail': LOCAL_QA_USER_EMAIL,
      'teameet.v1.session': 'active',
    },
  };
}
