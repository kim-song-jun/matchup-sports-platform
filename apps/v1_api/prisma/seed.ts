import {
  PrismaClient,
  V1AdminRole,
  V1AuthProvider,
  V1MatchParticipantRole,
  V1NotificationTargetType,
  V1TeamMembershipRole,
  V1TermsKind,
} from '@prisma/client';

const prisma = new PrismaClient();

const sports = [
  ['soccer', '축구'],
  ['futsal', '풋살'],
  ['running', '러닝'],
  ['swimming', '수영'],
] as const;

const levels = [
  ['beginner', '입문'],
  ['novice', '초보'],
  ['intermediate', '중수'],
  ['advanced', '고수'],
] as const;

const users = [
  ['host@teameet.v1', '호스트민'],
  ['applicant@teameet.v1', '지원수'],
  ['owner@teameet.v1', '팀장원'],
  ['manager@teameet.v1', '매니저준'],
  ['member@teameet.v1', '멤버현'],
  ['admin@teameet.v1', '운영자'],
] as const;

const seedNow = new Date('2026-05-18T00:00:00.000Z');
const futureStart = new Date('2026-06-20T10:00:00.000Z');
const futureEnd = new Date('2026-06-20T11:00:00.000Z');
const pastStart = new Date('2026-05-01T10:00:00.000Z');
const pastEnd = new Date('2026-05-01T11:00:00.000Z');

async function seedRuntimeCheck() {
  await prisma.v1RuntimeCheck.upsert({
    where: { key: 'seed' },
    update: { value: 'ok' },
    create: { key: 'seed', value: 'ok' },
  });
}

async function seedSports() {
  const result: Record<string, string> = {};
  const sportCodes = sports.map(([code]) => code);
  const levelCodes = levels.map(([code]) => code);

  await prisma.v1Sport.updateMany({
    where: { code: { notIn: sportCodes } },
    data: { isActive: false },
  });

  for (const [index, [code, name]] of sports.entries()) {
    const sport = await prisma.v1Sport.upsert({
      where: { code },
      update: { name, isActive: true, sortOrder: index + 1 },
      create: { code, name, isActive: true, sortOrder: index + 1 },
    });

    result[code] = sport.id;

    for (const [levelIndex, [levelCode, levelName]] of levels.entries()) {
      await prisma.v1SportLevel.upsert({
        where: {
          sportId_code: {
            sportId: sport.id,
            code: levelCode,
          },
        },
        update: {
          name: levelName,
          description: `${name} ${levelName} 레벨`,
          sortOrder: levelIndex + 1,
          isActive: true,
        },
        create: {
          sportId: sport.id,
          code: levelCode,
          name: levelName,
          description: `${name} ${levelName} 레벨`,
          sortOrder: levelIndex + 1,
          isActive: true,
        },
      });
    }

    await prisma.v1SportLevel.updateMany({
      where: { sportId: sport.id, code: { notIn: levelCodes } },
      data: { isActive: false },
    });
  }

  return result;
}

async function seedRegions() {
  const seoul = await prisma.v1Region.upsert({
    where: { code: 'seoul' },
    update: { name: '서울', level: 1, isActive: true, sortOrder: 1 },
    create: { code: 'seoul', name: '서울', level: 1, isActive: true, sortOrder: 1 },
  });

  const gyeonggi = await prisma.v1Region.upsert({
    where: { code: 'gyeonggi' },
    update: { name: '경기', level: 1, isActive: true, sortOrder: 2 },
    create: { code: 'gyeonggi', name: '경기', level: 1, isActive: true, sortOrder: 2 },
  });

  const childRegions = [
    [seoul.id, 'seoul-gangnam', '강남구', 1],
    [seoul.id, 'seoul-songpa', '송파구', 2],
    [seoul.id, 'seoul-mapo', '마포구', 3],
    [gyeonggi.id, 'gyeonggi-seongnam', '성남시', 1],
    [gyeonggi.id, 'gyeonggi-suwon', '수원시', 2],
  ] as const;

  for (const [parentId, code, name, sortOrder] of childRegions) {
    await prisma.v1Region.upsert({
      where: { code },
      update: { parentId, name, level: 2, isActive: true, sortOrder },
      create: { parentId, code, name, level: 2, isActive: true, sortOrder },
    });
  }

  return {
    seoulGangnam: await prisma.v1Region.findUniqueOrThrow({ where: { code: 'seoul-gangnam' } }),
    seoulSongpa: await prisma.v1Region.findUniqueOrThrow({ where: { code: 'seoul-songpa' } }),
  };
}

async function seedTermsAndNotice() {
  for (const [kind, title, required] of [
    [V1TermsKind.terms, 'Teameet v1 서비스 이용약관', true],
    [V1TermsKind.privacy, 'Teameet v1 개인정보 처리방침', true],
    [V1TermsKind.marketing, 'Teameet v1 마케팅 수신 동의', false],
  ] as const) {
    await prisma.v1TermsDocument.upsert({
      where: { kind_version: { kind, version: '2026-05-18' } },
      update: {
        title,
        content: `${title} seed document`,
        status: 'published',
        isRequired: required,
        publishedAt: new Date('2026-05-18T00:00:00.000Z'),
      },
      create: {
        kind,
        version: '2026-05-18',
        title,
        content: `${title} seed document`,
        status: 'published',
        isRequired: required,
        publishedAt: new Date('2026-05-18T00:00:00.000Z'),
      },
    });
  }

  await prisma.v1Notice.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {
      audience: 'public',
      title: 'Teameet v1 개발 환경 안내',
      body: 'v1 seed 데이터로 생성된 공지입니다.',
      status: 'published',
      publishedAt: new Date('2026-05-18T00:00:00.000Z'),
    },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      audience: 'public',
      title: 'Teameet v1 개발 환경 안내',
      body: 'v1 seed 데이터로 생성된 공지입니다.',
      status: 'published',
      publishedAt: new Date('2026-05-18T00:00:00.000Z'),
    },
  });
}

async function seedUsers() {
  const result: Record<string, string> = {};
  const requiredTerms = await prisma.v1TermsDocument.findMany({
    where: {
      isRequired: true,
      status: 'published',
    },
    select: { id: true },
  });

  for (const [email, nickname] of users) {
    const user = await prisma.v1User.upsert({
      where: { email },
      update: { accountStatus: 'active', onboardingStatus: 'completed' },
      create: {
        email,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        authIdentities: {
          create: {
            provider: V1AuthProvider.email,
            providerUserKey: email,
            email,
            status: 'active',
          },
        },
        profile: {
          create: {
            nickname,
            visibility: 'public',
            displayName: nickname,
          },
        },
        onboardingProgress: {
          create: {
            currentStep: 'completed',
            completedAt: new Date('2026-05-18T00:00:00.000Z'),
          },
        },
        reputationSummary: {
          create: {
            trustState: 'sample',
            mannerScore: 4.5,
            reviewCount: 3,
            sourceLabel: 'seed',
            calculatedAt: new Date('2026-05-18T00:00:00.000Z'),
          },
        },
        notificationPreference: {
          create: {
            importantEnabled: true,
            activityEnabled: true,
            marketingEnabled: false,
          },
        },
      },
    });

    result[email] = user.id;

    for (const termsDocument of requiredTerms) {
      await prisma.v1UserTermsConsent.upsert({
        where: {
          userId_termsDocumentId: {
            userId: user.id,
            termsDocumentId: termsDocument.id,
          },
        },
        update: {
          acceptedAt: new Date('2026-05-18T00:00:00.000Z'),
          revokedAt: null,
        },
        create: {
          userId: user.id,
          termsDocumentId: termsDocument.id,
          acceptedAt: new Date('2026-05-18T00:00:00.000Z'),
        },
      });
    }
  }

  return result;
}

async function seedTeams(userIds: Record<string, string>, sportIds: Record<string, string>, regionId: string) {
  const ownerTeam = await prisma.v1Team.upsert({
    where: { id: '00000000-0000-4000-8000-000000000101' },
    update: {
      name: '강남 러닝 크루',
      ownerUserId: userIds['owner@teameet.v1'],
      sportId: sportIds.running,
      regionId,
      status: 'active',
      memberCount: 3,
      managerCount: 1,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000101',
      name: '강남 러닝 크루',
      ownerUserId: userIds['owner@teameet.v1'],
      sportId: sportIds.running,
      regionId,
      status: 'active',
      memberCount: 3,
      managerCount: 1,
      profile: {
        create: {
          description: '평일 저녁에 함께 뛰는 v1 seed 팀입니다.',
          activityNote: '주 2회 러닝',
          skillNote: '초보부터 중수까지',
        },
      },
      trustScore: {
        create: {
          trustState: 'sample',
          mannerScore: 4.6,
          matchCount: 8,
          sourceLabel: 'seed',
          calculatedAt: new Date('2026-05-18T00:00:00.000Z'),
        },
      },
    },
  });

  const applicantTeam = await prisma.v1Team.upsert({
    where: { id: '00000000-0000-4000-8000-000000000102' },
    update: {
      name: '송파 풋살 모임',
      ownerUserId: userIds['host@teameet.v1'],
      sportId: sportIds.futsal,
      regionId,
      status: 'active',
      memberCount: 2,
      managerCount: 0,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000102',
      name: '송파 풋살 모임',
      ownerUserId: userIds['host@teameet.v1'],
      sportId: sportIds.futsal,
      regionId,
      status: 'active',
      memberCount: 2,
      profile: {
        create: {
          description: '주말 풋살 상대를 찾는 v1 seed 팀입니다.',
        },
      },
    },
  });

  await prisma.v1TeamMembership.upsert({
    where: { teamId_userId: { teamId: ownerTeam.id, userId: userIds['owner@teameet.v1'] } },
    update: { role: V1TeamMembershipRole.owner, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z') },
    create: { teamId: ownerTeam.id, userId: userIds['owner@teameet.v1'], role: V1TeamMembershipRole.owner, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z') },
  });
  await prisma.v1TeamMembership.upsert({
    where: { teamId_userId: { teamId: ownerTeam.id, userId: userIds['manager@teameet.v1'] } },
    update: { role: V1TeamMembershipRole.manager, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z') },
    create: { teamId: ownerTeam.id, userId: userIds['manager@teameet.v1'], role: V1TeamMembershipRole.manager, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z') },
  });
  await prisma.v1TeamMembership.upsert({
    where: { teamId_userId: { teamId: ownerTeam.id, userId: userIds['member@teameet.v1'] } },
    update: { role: V1TeamMembershipRole.member, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z') },
    create: { teamId: ownerTeam.id, userId: userIds['member@teameet.v1'], role: V1TeamMembershipRole.member, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z') },
  });

  return { ownerTeam, applicantTeam };
}

async function seedMatches(userIds: Record<string, string>, sportIds: Record<string, string>, regionId: string) {
  const match = await prisma.v1Match.upsert({
    where: { id: '00000000-0000-4000-8000-000000000201' },
    update: {
      title: '강남 저녁 러닝 멤버 모집',
      status: 'recruiting',
    },
    create: {
      id: '00000000-0000-4000-8000-000000000201',
      hostUserId: userIds['host@teameet.v1'],
      sportId: sportIds.running,
      regionId,
      title: '강남 저녁 러닝 멤버 모집',
      description: '가볍게 5km 뛰는 v1 seed 매치입니다.',
      placeName: '강남역 11번 출구',
      placeAddress: '서울 강남구',
      startAt: new Date('2026-05-20T10:00:00.000Z'),
      endAt: new Date('2026-05-20T11:00:00.000Z'),
      maxParticipants: 6,
      levelNote: '초보 환영',
      genderRule: '무관',
      costNote: '무료',
      status: 'recruiting',
      participants: {
        create: {
          userId: userIds['host@teameet.v1'],
          role: V1MatchParticipantRole.host,
          status: 'active',
          approvedAt: new Date('2026-05-18T00:00:00.000Z'),
        },
      },
    },
  });

  await prisma.v1MatchApplication.upsert({
    where: { matchId_applicantUserId: { matchId: match.id, applicantUserId: userIds['applicant@teameet.v1'] } },
    update: { status: 'requested', message: '참여하고 싶습니다.' },
    create: { matchId: match.id, applicantUserId: userIds['applicant@teameet.v1'], status: 'requested', message: '참여하고 싶습니다.' },
  });

  return match;
}

async function seedTeamMatches(
  userIds: Record<string, string>,
  sportIds: Record<string, string>,
  regionId: string,
  ownerTeamId: string,
  applicantTeamId: string,
) {
  const teamMatch = await prisma.v1TeamMatch.upsert({
    where: { id: '00000000-0000-4000-8000-000000000301' },
    update: {
      title: '토요일 풋살 상대팀 모집',
      status: 'recruiting',
    },
    create: {
      id: '00000000-0000-4000-8000-000000000301',
      hostTeamId: ownerTeamId,
      createdByUserId: userIds['owner@teameet.v1'],
      sportId: sportIds.futsal,
      regionId,
      title: '토요일 풋살 상대팀 모집',
      description: '가볍게 6:6 풋살 경기할 팀을 찾습니다.',
      placeName: '잠실 풋살장',
      placeAddress: '서울 송파구',
      startAt: new Date('2026-05-23T05:00:00.000Z'),
      endAt: new Date('2026-05-23T07:00:00.000Z'),
      formatNote: '6:6',
      genderRule: '무관',
      costNote: '구장비 N분의 1',
      status: 'recruiting',
    },
  });

  await prisma.v1TeamMatchApplication.upsert({
    where: { teamMatchId_applicantTeamId: { teamMatchId: teamMatch.id, applicantTeamId } },
    update: {
      appliedByUserId: userIds['host@teameet.v1'],
      status: 'requested',
      message: '상대팀으로 신청합니다.',
    },
    create: {
      teamMatchId: teamMatch.id,
      applicantTeamId,
      appliedByUserId: userIds['host@teameet.v1'],
      status: 'requested',
      message: '상대팀으로 신청합니다.',
    },
  });

  return teamMatch;
}

async function seedChatAndNotifications(
  userIds: Record<string, string>,
  matchId: string,
  teamMatchId: string,
) {
  const matchRoom = await prisma.v1ChatRoom.upsert({
    where: { matchId },
    update: { status: 'active', lastMessageAt: new Date('2026-05-18T00:00:00.000Z') },
    create: { matchId, status: 'active', lastMessageAt: new Date('2026-05-18T00:00:00.000Z') },
  });

  await prisma.v1ChatRoomParticipant.upsert({
    where: { chatRoomId_userId: { chatRoomId: matchRoom.id, userId: userIds['host@teameet.v1'] } },
    update: { status: 'active' },
    create: { chatRoomId: matchRoom.id, userId: userIds['host@teameet.v1'], status: 'active' },
  });

  await prisma.v1ChatMessage.upsert({
    where: { id: '00000000-0000-4000-8000-000000000401' },
    update: {
      chatRoomId: matchRoom.id,
      senderUserId: userIds['host@teameet.v1'],
      body: 'v1 seed 매치 채팅입니다.',
      status: 'sent',
    },
    create: {
      id: '00000000-0000-4000-8000-000000000401',
      chatRoomId: matchRoom.id,
      senderUserId: userIds['host@teameet.v1'],
      body: 'v1 seed 매치 채팅입니다.',
      status: 'sent',
    },
  });

  await prisma.v1ChatRoom.upsert({
    where: { teamMatchId },
    update: { status: 'active' },
    create: { teamMatchId, status: 'active' },
  });

  await prisma.v1Notification.upsert({
    where: { id: '00000000-0000-4000-8000-000000000501' },
    update: {
      recipientUserId: userIds['applicant@teameet.v1'],
      targetType: V1NotificationTargetType.match,
      targetId: matchId,
      title: '매치 신청 상태 안내',
      body: '신청한 매치가 접수되었습니다.',
      deepLink: `/matches/${matchId}`,
    },
    create: {
      id: '00000000-0000-4000-8000-000000000501',
      recipientUserId: userIds['applicant@teameet.v1'],
      targetType: V1NotificationTargetType.match,
      targetId: matchId,
      title: '매치 신청 상태 안내',
      body: '신청한 매치가 접수되었습니다.',
      deepLink: `/matches/${matchId}`,
    },
  });
}

async function seedAdmin(userIds: Record<string, string>) {
  await prisma.v1AdminUser.upsert({
    where: { userId: userIds['admin@teameet.v1'] },
    update: { adminRole: V1AdminRole.owner, status: 'active' },
    create: {
      userId: userIds['admin@teameet.v1'],
      adminRole: V1AdminRole.owner,
      status: 'active',
      grantedAt: new Date('2026-05-18T00:00:00.000Z'),
    },
  });
}

async function upsertCoverageUser(input: {
  id: string;
  email: string;
  nickname: string;
  accountStatus?: 'active' | 'suspended' | 'blocked' | 'withdrawal_pending' | 'deleted';
  onboardingStatus?:
    | 'not_started'
    | 'terms_done'
    | 'signup_done'
    | 'sport_done'
    | 'level_done'
    | 'region_done'
    | 'completed'
    | 'deferred';
  trustState?: 'verified' | 'estimated' | 'sample' | 'none';
}) {
  const accountStatus = input.accountStatus ?? 'active';
  const onboardingStatus = input.onboardingStatus ?? 'completed';
  const deletedAt = accountStatus === 'deleted' ? seedNow : null;
  const user = await prisma.v1User.upsert({
    where: { email: input.email },
    update: { accountStatus, onboardingStatus, deletedAt },
    create: {
      id: input.id,
      email: input.email,
      accountStatus,
      onboardingStatus,
      deletedAt,
    },
  });

  await prisma.v1UserProfile.upsert({
    where: { userId: user.id },
    update: {
      nickname: input.nickname,
      displayName: input.nickname,
      visibility: accountStatus === 'deleted' ? 'private' : 'public',
      deletedAt,
    },
    create: {
      userId: user.id,
      nickname: input.nickname,
      displayName: input.nickname,
      visibility: accountStatus === 'deleted' ? 'private' : 'public',
      deletedAt,
    },
  });

  await prisma.v1AuthIdentity.upsert({
    where: { provider_providerUserKey: { provider: V1AuthProvider.email, providerUserKey: input.email } },
    update: { userId: user.id, email: input.email, status: accountStatus === 'blocked' ? 'blocked' : 'active' },
    create: {
      userId: user.id,
      provider: V1AuthProvider.email,
      providerUserKey: input.email,
      email: input.email,
      status: accountStatus === 'blocked' ? 'blocked' : 'active',
    },
  });

  await prisma.v1UserOnboardingProgress.upsert({
    where: { userId: user.id },
    update: {
      currentStep: onboardingStatus,
      completedAt: onboardingStatus === 'completed' ? seedNow : null,
      deferredAt: onboardingStatus === 'deferred' ? seedNow : null,
    },
    create: {
      userId: user.id,
      currentStep: onboardingStatus,
      completedAt: onboardingStatus === 'completed' ? seedNow : null,
      deferredAt: onboardingStatus === 'deferred' ? seedNow : null,
    },
  });

  await prisma.v1UserReputationSummary.upsert({
    where: { userId: user.id },
    update: {
      trustState: input.trustState ?? 'sample',
      mannerScore: input.trustState === 'none' ? null : 4.2,
      reviewCount: input.trustState === 'none' ? 0 : 2,
      sourceLabel: 'seed-coverage',
      calculatedAt: input.trustState === 'none' ? null : seedNow,
    },
    create: {
      userId: user.id,
      trustState: input.trustState ?? 'sample',
      mannerScore: input.trustState === 'none' ? null : 4.2,
      reviewCount: input.trustState === 'none' ? 0 : 2,
      sourceLabel: 'seed-coverage',
      calculatedAt: input.trustState === 'none' ? null : seedNow,
    },
  });

  await prisma.v1NotificationPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, importantEnabled: true, activityEnabled: true, marketingEnabled: false },
  });

  return user;
}

async function seedCoverageUsers() {
  const result: Record<string, string> = {};
  const coverageUsers = [
    ['00000000-0000-4000-8000-000000001001', 'coverage-active@teameet.v1', '활성커버', 'active', 'completed', 'verified'],
    ['00000000-0000-4000-8000-000000001002', 'coverage-suspended@teameet.v1', '정지커버', 'suspended', 'completed', 'estimated'],
    ['00000000-0000-4000-8000-000000001003', 'coverage-blocked@teameet.v1', '차단커버', 'blocked', 'completed', 'sample'],
    ['00000000-0000-4000-8000-000000001004', 'coverage-withdrawal@teameet.v1', '탈퇴대기커버', 'withdrawal_pending', 'completed', 'none'],
    ['00000000-0000-4000-8000-000000001005', 'coverage-deleted@teameet.v1', '삭제커버', 'deleted', 'completed', 'none'],
    ['00000000-0000-4000-8000-000000001006', 'coverage-not-started@teameet.v1', '시작전커버', 'active', 'not_started', 'sample'],
    ['00000000-0000-4000-8000-000000001007', 'coverage-terms@teameet.v1', '약관커버', 'active', 'terms_done', 'sample'],
    ['00000000-0000-4000-8000-000000001008', 'coverage-signup@teameet.v1', '가입커버', 'active', 'signup_done', 'sample'],
    ['00000000-0000-4000-8000-000000001009', 'coverage-sport@teameet.v1', '종목커버', 'active', 'sport_done', 'sample'],
    ['00000000-0000-4000-8000-000000001010', 'coverage-level@teameet.v1', '레벨커버', 'active', 'level_done', 'sample'],
    ['00000000-0000-4000-8000-000000001011', 'coverage-region@teameet.v1', '지역커버', 'active', 'region_done', 'sample'],
    ['00000000-0000-4000-8000-000000001012', 'coverage-deferred@teameet.v1', '나중커버', 'active', 'deferred', 'sample'],
    ['00000000-0000-4000-8000-000000001013', 'coverage-extra-a@teameet.v1', '추가A커버', 'active', 'completed', 'verified'],
    ['00000000-0000-4000-8000-000000001014', 'coverage-extra-b@teameet.v1', '추가B커버', 'active', 'completed', 'estimated'],
    ['00000000-0000-4000-8000-000000001015', 'coverage-extra-c@teameet.v1', '추가C커버', 'active', 'completed', 'sample'],
    ['00000000-0000-4000-8000-000000001016', 'coverage-extra-d@teameet.v1', '추가D커버', 'active', 'completed', 'none'],
    ['00000000-0000-4000-8000-000000001017', 'coverage-extra-e@teameet.v1', '추가E커버', 'active', 'completed', 'sample'],
    ['00000000-0000-4000-8000-000000001018', 'coverage-extra-f@teameet.v1', '추가F커버', 'active', 'completed', 'sample'],
    ['00000000-0000-4000-8000-000000001019', 'coverage-extra-g@teameet.v1', '추가G커버', 'active', 'completed', 'sample'],
    ['00000000-0000-4000-8000-000000001020', 'coverage-extra-h@teameet.v1', '추가H커버', 'active', 'completed', 'sample'],
  ] as const;

  for (const [id, email, nickname, accountStatus, onboardingStatus, trustState] of coverageUsers) {
    const user = await upsertCoverageUser({ id, email, nickname, accountStatus, onboardingStatus, trustState });
    result[email] = user.id;
  }

  await prisma.v1AuthIdentity.upsert({
    where: { provider_providerUserKey: { provider: V1AuthProvider.kakao, providerUserKey: 'coverage-kakao-active' } },
    update: { userId: result['coverage-active@teameet.v1'], status: 'active', unlinkedAt: null },
    create: {
      userId: result['coverage-active@teameet.v1'],
      provider: V1AuthProvider.kakao,
      providerUserKey: 'coverage-kakao-active',
      email: 'coverage-active@teameet.v1',
      status: 'active',
    },
  });

  await prisma.v1AuthIdentity.upsert({
    where: { provider_providerUserKey: { provider: V1AuthProvider.naver, providerUserKey: 'coverage-naver-unlinked' } },
    update: { userId: result['coverage-extra-a@teameet.v1'], status: 'unlinked', unlinkedAt: seedNow },
    create: {
      userId: result['coverage-extra-a@teameet.v1'],
      provider: V1AuthProvider.naver,
      providerUserKey: 'coverage-naver-unlinked',
      email: 'coverage-extra-a@teameet.v1',
      status: 'unlinked',
      unlinkedAt: seedNow,
    },
  });

  return result;
}

async function seedCoverageTermsAndNotices() {
  await prisma.v1TermsDocument.upsert({
    where: { kind_version: { kind: V1TermsKind.terms, version: '2026-05-18-draft' } },
    update: { title: 'Teameet v1 draft terms', content: 'draft terms coverage', status: 'draft', isRequired: true },
    create: { kind: V1TermsKind.terms, version: '2026-05-18-draft', title: 'Teameet v1 draft terms', content: 'draft terms coverage', status: 'draft', isRequired: true },
  });
  await prisma.v1TermsDocument.upsert({
    where: { kind_version: { kind: V1TermsKind.privacy, version: '2026-05-18-archived' } },
    update: {
      title: 'Teameet v1 archived privacy',
      content: 'archived privacy coverage',
      status: 'archived',
      isRequired: true,
      archivedAt: seedNow,
    },
    create: {
      kind: V1TermsKind.privacy,
      version: '2026-05-18-archived',
      title: 'Teameet v1 archived privacy',
      content: 'archived privacy coverage',
      status: 'archived',
      isRequired: true,
      archivedAt: seedNow,
    },
  });

  const notices = [
    ['00000000-0000-4000-8000-000000001101', 'users', 'published', '사용자 공지 커버리지'],
    ['00000000-0000-4000-8000-000000001102', 'admins', 'published', '관리자 공지 커버리지'],
    ['00000000-0000-4000-8000-000000001103', 'public', 'draft', '초안 공지 커버리지'],
    ['00000000-0000-4000-8000-000000001104', 'public', 'archived', '보관 공지 커버리지'],
  ] as const;

  for (const [id, audience, status, title] of notices) {
    await prisma.v1Notice.upsert({
      where: { id },
      update: {
        audience,
        status,
        title,
        body: `${title} seed data`,
        publishedAt: status === 'published' ? seedNow : null,
        archivedAt: status === 'archived' ? seedNow : null,
      },
      create: {
        id,
        audience,
        status,
        title,
        body: `${title} seed data`,
        publishedAt: status === 'published' ? seedNow : null,
        archivedAt: status === 'archived' ? seedNow : null,
      },
    });
  }
}

async function seedCoverageTeams(
  userIds: Record<string, string>,
  sportIds: Record<string, string>,
  regionId: string,
) {
  const specs = [
    ['00000000-0000-4000-8000-000000001201', '커버 활성 승인 팀', 'active', 'approval_required', 'verified'],
    ['00000000-0000-4000-8000-000000001202', '커버 가입 마감 팀', 'active', 'closed', 'estimated'],
    ['00000000-0000-4000-8000-000000001203', '커버 정지 팀', 'suspended', 'approval_required', 'sample'],
    ['00000000-0000-4000-8000-000000001204', '커버 보관 팀', 'archived', 'approval_required', 'none'],
  ] as const;

  for (const [id, name, status, joinPolicy, trustState] of specs) {
    await prisma.v1Team.upsert({
      where: { id },
      update: {
        name,
        ownerUserId: userIds['coverage-active@teameet.v1'],
        sportId: sportIds.futsal,
        regionId,
        status,
        joinPolicy,
        memberCount: 1,
        managerCount: 0,
      },
      create: {
        id,
        name,
        ownerUserId: userIds['coverage-active@teameet.v1'],
        sportId: sportIds.futsal,
        regionId,
        status,
        joinPolicy,
        memberCount: 1,
        managerCount: 0,
      },
    });

    await prisma.v1TeamProfile.upsert({
      where: { teamId: id },
      update: { description: `${name} seed coverage`, activityNote: '상태 커버리지', skillNote: '전체 레벨' },
      create: { teamId: id, description: `${name} seed coverage`, activityNote: '상태 커버리지', skillNote: '전체 레벨' },
    });

    await prisma.v1TeamTrustScore.upsert({
      where: { teamId: id },
      update: {
        trustState,
        mannerScore: trustState === 'none' ? null : 4.1,
        matchCount: trustState === 'none' ? 0 : 4,
        sourceLabel: 'seed-coverage',
        calculatedAt: trustState === 'none' ? null : seedNow,
      },
      create: {
        teamId: id,
        trustState,
        mannerScore: trustState === 'none' ? null : 4.1,
        matchCount: trustState === 'none' ? 0 : 4,
        sourceLabel: 'seed-coverage',
        calculatedAt: trustState === 'none' ? null : seedNow,
      },
    });
  }

  const memberships = [
    ['00000000-0000-4000-8000-000000001201', userIds['coverage-active@teameet.v1'], 'owner', 'active'],
    ['00000000-0000-4000-8000-000000001201', userIds['coverage-extra-a@teameet.v1'], 'manager', 'removed'],
    ['00000000-0000-4000-8000-000000001201', userIds['coverage-extra-b@teameet.v1'], 'member', 'left'],
    ['00000000-0000-4000-8000-000000001202', userIds['coverage-active@teameet.v1'], 'owner', 'active'],
  ] as const;

  for (const [teamId, userId, role, status] of memberships) {
    await prisma.v1TeamMembership.upsert({
      where: { teamId_userId: { teamId, userId } },
      update: {
        role,
        status,
        joinedAt: seedNow,
        leftAt: status === 'left' || status === 'removed' ? seedNow : null,
        removedByUserId: status === 'removed' ? userIds['coverage-active@teameet.v1'] : null,
      },
      create: {
        teamId,
        userId,
        role,
        status,
        joinedAt: seedNow,
        leftAt: status === 'left' || status === 'removed' ? seedNow : null,
        removedByUserId: status === 'removed' ? userIds['coverage-active@teameet.v1'] : null,
      },
    });
  }

  const joinApps = [
    ['00000000-0000-4000-8000-000000001201', userIds['coverage-extra-c@teameet.v1'], 'requested'],
    ['00000000-0000-4000-8000-000000001201', userIds['coverage-extra-d@teameet.v1'], 'approved'],
    ['00000000-0000-4000-8000-000000001201', userIds['coverage-extra-e@teameet.v1'], 'rejected'],
    ['00000000-0000-4000-8000-000000001201', userIds['coverage-extra-f@teameet.v1'], 'withdrawn'],
    ['00000000-0000-4000-8000-000000001201', userIds['coverage-extra-g@teameet.v1'], 'expired'],
  ] as const;

  for (const [teamId, applicantUserId, status] of joinApps) {
    await prisma.v1TeamJoinApplication.upsert({
      where: { teamId_applicantUserId: { teamId, applicantUserId } },
      update: {
        status,
        message: `team join ${status} coverage`,
        reviewedByUserId: status === 'approved' || status === 'rejected' ? userIds['coverage-active@teameet.v1'] : null,
        reviewedAt: status === 'approved' || status === 'rejected' ? seedNow : null,
        withdrawnAt: status === 'withdrawn' ? seedNow : null,
      },
      create: {
        teamId,
        applicantUserId,
        status,
        message: `team join ${status} coverage`,
        reviewedByUserId: status === 'approved' || status === 'rejected' ? userIds['coverage-active@teameet.v1'] : null,
        reviewedAt: status === 'approved' || status === 'rejected' ? seedNow : null,
        withdrawnAt: status === 'withdrawn' ? seedNow : null,
      },
    });
  }
}

async function seedCoverageMatches(
  userIds: Record<string, string>,
  sportIds: Record<string, string>,
  regionId: string,
) {
  const statuses = ['recruiting', 'closed', 'cancelled', 'completed', 'archived'] as const;
  for (const [index, status] of statuses.entries()) {
    const id = `00000000-0000-4000-8000-00000000130${index + 1}`;
    await prisma.v1Match.upsert({
      where: { id },
      update: {
        title: `개인 매치 ${status} 커버리지`,
        hostUserId: userIds['coverage-active@teameet.v1'],
        sportId: sportIds.running,
        regionId,
        status,
        startAt: futureStart,
        endAt: futureEnd,
        cancelledAt: status === 'cancelled' ? seedNow : null,
        completedAt: status === 'completed' ? seedNow : null,
      },
      create: {
        id,
        hostUserId: userIds['coverage-active@teameet.v1'],
        sportId: sportIds.running,
        regionId,
        title: `개인 매치 ${status} 커버리지`,
        description: `${status} 상태 확인용 개인 매치입니다.`,
        placeName: '커버리지 운동장',
        placeAddress: '서울 강남구',
        startAt: futureStart,
        endAt: futureEnd,
        maxParticipants: 6,
        levelNote: '상태 커버리지',
        genderRule: '무관',
        costNote: '무료',
        status,
        cancelledAt: status === 'cancelled' ? seedNow : null,
        completedAt: status === 'completed' ? seedNow : null,
      },
    });
  }

  await prisma.v1Match.upsert({
    where: { id: '00000000-0000-4000-8000-000000001306' },
    update: {
      title: '개인 매치 expired 표시 커버리지',
      hostUserId: userIds['coverage-active@teameet.v1'],
      sportId: sportIds.running,
      regionId,
      status: 'recruiting',
      startAt: pastStart,
      endAt: pastEnd,
    },
    create: {
      id: '00000000-0000-4000-8000-000000001306',
      hostUserId: userIds['coverage-active@teameet.v1'],
      sportId: sportIds.running,
      regionId,
      title: '개인 매치 expired 표시 커버리지',
      description: 'DB status는 recruiting이지만 API display status가 expired인 샘플입니다.',
      placeName: '과거 운동장',
      placeAddress: '서울 강남구',
      startAt: pastStart,
      endAt: pastEnd,
      maxParticipants: 6,
      status: 'recruiting',
    },
  });

  const participantStatuses = ['active', 'removed', 'cancelled', 'no_show', 'completed'] as const;
  for (const [index, status] of participantStatuses.entries()) {
    await prisma.v1MatchParticipant.upsert({
      where: {
        matchId_userId: {
          matchId: '00000000-0000-4000-8000-000000001301',
          userId: userIds[`coverage-extra-${String.fromCharCode(97 + index)}@teameet.v1`],
        },
      },
      update: {
        role: index === 0 ? 'host' : 'participant',
        status,
        approvedAt: seedNow,
        cancelledAt: status === 'cancelled' || status === 'removed' ? seedNow : null,
        completedAt: status === 'completed' ? seedNow : null,
      },
      create: {
        matchId: '00000000-0000-4000-8000-000000001301',
        userId: userIds[`coverage-extra-${String.fromCharCode(97 + index)}@teameet.v1`],
        role: index === 0 ? 'host' : 'participant',
        status,
        approvedAt: seedNow,
        cancelledAt: status === 'cancelled' || status === 'removed' ? seedNow : null,
        completedAt: status === 'completed' ? seedNow : null,
      },
    });
  }

  const applicationStatuses = ['requested', 'approved', 'rejected', 'withdrawn', 'cancelled_by_host', 'expired'] as const;
  for (const [index, status] of applicationStatuses.entries()) {
    const applicantUserId = userIds[`coverage-extra-${String.fromCharCode(99 + index)}@teameet.v1`];
    await prisma.v1MatchApplication.upsert({
      where: {
        matchId_applicantUserId: {
          matchId: '00000000-0000-4000-8000-000000001302',
          applicantUserId,
        },
      },
      update: {
        status,
        message: `match application ${status} coverage`,
        reviewedByUserId: status === 'approved' || status === 'rejected' || status === 'cancelled_by_host' ? userIds['coverage-active@teameet.v1'] : null,
        reviewedAt: status === 'approved' || status === 'rejected' || status === 'cancelled_by_host' ? seedNow : null,
        withdrawnAt: status === 'withdrawn' ? seedNow : null,
      },
      create: {
        matchId: '00000000-0000-4000-8000-000000001302',
        applicantUserId,
        status,
        message: `match application ${status} coverage`,
        reviewedByUserId: status === 'approved' || status === 'rejected' || status === 'cancelled_by_host' ? userIds['coverage-active@teameet.v1'] : null,
        reviewedAt: status === 'approved' || status === 'rejected' || status === 'cancelled_by_host' ? seedNow : null,
        withdrawnAt: status === 'withdrawn' ? seedNow : null,
      },
    });
  }
}

async function seedCoverageTeamMatches(
  userIds: Record<string, string>,
  sportIds: Record<string, string>,
  regionId: string,
) {
  const statuses = ['recruiting', 'matched', 'cancelled', 'completed', 'archived'] as const;
  for (const [index, status] of statuses.entries()) {
    const id = `00000000-0000-4000-8000-00000000140${index + 1}`;
    await prisma.v1TeamMatch.upsert({
      where: { id },
      update: {
        title: `팀 매치 ${status} 커버리지`,
        hostTeamId: '00000000-0000-4000-8000-000000001201',
        createdByUserId: userIds['coverage-active@teameet.v1'],
        sportId: sportIds.futsal,
        regionId,
        status,
        approvedApplicantTeamId: status === 'matched' ? '00000000-0000-4000-8000-000000001202' : null,
        startAt: futureStart,
        endAt: futureEnd,
        cancelledAt: status === 'cancelled' ? seedNow : null,
        completedAt: status === 'completed' ? seedNow : null,
      },
      create: {
        id,
        hostTeamId: '00000000-0000-4000-8000-000000001201',
        createdByUserId: userIds['coverage-active@teameet.v1'],
        sportId: sportIds.futsal,
        regionId,
        title: `팀 매치 ${status} 커버리지`,
        description: `${status} 상태 확인용 팀 매치입니다.`,
        placeName: '커버리지 풋살장',
        placeAddress: '서울 송파구',
        startAt: futureStart,
        endAt: futureEnd,
        formatNote: '6:6',
        genderRule: '무관',
        costNote: '구장비 N분의 1',
        status,
        approvedApplicantTeamId: status === 'matched' ? '00000000-0000-4000-8000-000000001202' : null,
        cancelledAt: status === 'cancelled' ? seedNow : null,
        completedAt: status === 'completed' ? seedNow : null,
      },
    });
  }

  await prisma.v1TeamMatch.upsert({
    where: { id: '00000000-0000-4000-8000-000000001406' },
    update: {
      title: '팀 매치 expired 표시 커버리지',
      hostTeamId: '00000000-0000-4000-8000-000000001201',
      createdByUserId: userIds['coverage-active@teameet.v1'],
      sportId: sportIds.futsal,
      regionId,
      status: 'recruiting',
      startAt: pastStart,
      endAt: pastEnd,
    },
    create: {
      id: '00000000-0000-4000-8000-000000001406',
      hostTeamId: '00000000-0000-4000-8000-000000001201',
      createdByUserId: userIds['coverage-active@teameet.v1'],
      sportId: sportIds.futsal,
      regionId,
      title: '팀 매치 expired 표시 커버리지',
      description: 'DB status는 recruiting이지만 API display status가 expired인 팀 매치 샘플입니다.',
      placeName: '과거 풋살장',
      placeAddress: '서울 송파구',
      startAt: pastStart,
      endAt: pastEnd,
      status: 'recruiting',
    },
  });

  const applicationStatuses = ['requested', 'approved', 'rejected', 'withdrawn', 'expired'] as const;
  for (const [index, status] of applicationStatuses.entries()) {
    const applicantTeamId = `00000000-0000-4000-8000-00000000120${index === 0 ? 2 : index + 4}`;
    if (index > 0) {
      await prisma.v1Team.upsert({
        where: { id: applicantTeamId },
        update: {
          name: `커버 신청 팀 ${status}`,
          ownerUserId: userIds['coverage-active@teameet.v1'],
          sportId: sportIds.futsal,
          regionId,
          status: 'active',
          joinPolicy: 'approval_required',
          memberCount: 1,
          managerCount: 0,
        },
        create: {
          id: applicantTeamId,
          name: `커버 신청 팀 ${status}`,
          ownerUserId: userIds['coverage-active@teameet.v1'],
          sportId: sportIds.futsal,
          regionId,
          status: 'active',
          joinPolicy: 'approval_required',
          memberCount: 1,
          managerCount: 0,
        },
      });
    }

    await prisma.v1TeamMatchApplication.upsert({
      where: {
        teamMatchId_applicantTeamId: {
          teamMatchId: '00000000-0000-4000-8000-000000001401',
          applicantTeamId,
        },
      },
      update: {
        appliedByUserId: userIds['coverage-active@teameet.v1'],
        status,
        message: `team match application ${status} coverage`,
        reviewedByUserId: status === 'approved' || status === 'rejected' ? userIds['coverage-active@teameet.v1'] : null,
        reviewedAt: status === 'approved' || status === 'rejected' ? seedNow : null,
        withdrawnAt: status === 'withdrawn' ? seedNow : null,
      },
      create: {
        teamMatchId: '00000000-0000-4000-8000-000000001401',
        applicantTeamId,
        appliedByUserId: userIds['coverage-active@teameet.v1'],
        status,
        message: `team match application ${status} coverage`,
        reviewedByUserId: status === 'approved' || status === 'rejected' ? userIds['coverage-active@teameet.v1'] : null,
        reviewedAt: status === 'approved' || status === 'rejected' ? seedNow : null,
        withdrawnAt: status === 'withdrawn' ? seedNow : null,
      },
    });
  }
}

async function seedCoverageChatNotificationsAndAdmin(userIds: Record<string, string>) {
  const archivedRoom = await prisma.v1ChatRoom.upsert({
    where: { matchId: '00000000-0000-4000-8000-000000001303' },
    update: { status: 'archived', lastMessageAt: seedNow },
    create: { matchId: '00000000-0000-4000-8000-000000001303', status: 'archived', lastMessageAt: seedNow },
  });

  await prisma.v1ChatRoomParticipant.upsert({
    where: { chatRoomId_userId: { chatRoomId: archivedRoom.id, userId: userIds['coverage-active@teameet.v1'] } },
    update: { status: 'left', leftAt: seedNow },
    create: { chatRoomId: archivedRoom.id, userId: userIds['coverage-active@teameet.v1'], status: 'left', leftAt: seedNow },
  });
  await prisma.v1ChatRoomParticipant.upsert({
    where: { chatRoomId_userId: { chatRoomId: archivedRoom.id, userId: userIds['coverage-extra-h@teameet.v1'] } },
    update: { status: 'active', leftAt: null, pinnedAt: seedNow },
    create: { chatRoomId: archivedRoom.id, userId: userIds['coverage-extra-h@teameet.v1'], status: 'active', pinnedAt: seedNow },
  });

  const chatMessages = [
    ['00000000-0000-4000-8000-000000001501', 'sent', null, null],
    ['00000000-0000-4000-8000-000000001502', 'hidden', seedNow, null],
    ['00000000-0000-4000-8000-000000001503', 'deleted', null, seedNow],
  ] as const;

  for (const [id, status, hiddenAt, deletedAt] of chatMessages) {
    await prisma.v1ChatMessage.upsert({
      where: { id },
      update: {
        chatRoomId: archivedRoom.id,
        senderUserId: userIds['coverage-active@teameet.v1'],
        body: `chat message ${status} coverage`,
        status,
        hiddenAt,
        deletedAt,
      },
      create: {
        id,
        chatRoomId: archivedRoom.id,
        senderUserId: userIds['coverage-active@teameet.v1'],
        body: `chat message ${status} coverage`,
        status,
        hiddenAt,
        deletedAt,
      },
    });
  }

  const notifications = [
    ['00000000-0000-4000-8000-000000001601', V1NotificationTargetType.match, '00000000-0000-4000-8000-000000001301', '/matches/00000000-0000-4000-8000-000000001301', null],
    ['00000000-0000-4000-8000-000000001602', V1NotificationTargetType.team, '00000000-0000-4000-8000-000000001201', '/teams/00000000-0000-4000-8000-000000001201', seedNow],
    ['00000000-0000-4000-8000-000000001603', V1NotificationTargetType.team_match, '00000000-0000-4000-8000-000000001401', '/team-matches/00000000-0000-4000-8000-000000001401', null],
    ['00000000-0000-4000-8000-000000001604', V1NotificationTargetType.chat, archivedRoom.id, `/chat/rooms/${archivedRoom.id}`, seedNow],
    ['00000000-0000-4000-8000-000000001605', V1NotificationTargetType.notice, '00000000-0000-4000-8000-000000000001', '/notices/00000000-0000-4000-8000-000000000001', null],
    ['00000000-0000-4000-8000-000000001606', V1NotificationTargetType.system, null, null, seedNow],
  ] as const;

  for (const [id, targetType, targetId, deepLink, readAt] of notifications) {
    await prisma.v1Notification.upsert({
      where: { id },
      update: {
        recipientUserId: userIds['coverage-active@teameet.v1'],
        targetType,
        targetId,
        title: `${targetType} 알림 커버리지`,
        body: `${targetType} target coverage`,
        deepLink,
        readAt,
      },
      create: {
        id,
        recipientUserId: userIds['coverage-active@teameet.v1'],
        targetType,
        targetId,
        title: `${targetType} 알림 커버리지`,
        body: `${targetType} target coverage`,
        deepLink,
        readAt,
      },
    });
  }

  const adminSpecs = [
    [userIds['coverage-extra-h@teameet.v1'], V1AdminRole.ops, 'active'],
    [userIds['coverage-extra-g@teameet.v1'], V1AdminRole.support, 'suspended'],
    [userIds['coverage-extra-f@teameet.v1'], V1AdminRole.support, 'revoked'],
  ] as const;
  for (const [userId, adminRole, status] of adminSpecs) {
    await prisma.v1AdminUser.upsert({
      where: { userId },
      update: { adminRole, status, revokedAt: status === 'revoked' ? seedNow : null },
      create: {
        userId,
        adminRole,
        status,
        grantedByAdminUserId: userIds['admin@teameet.v1'],
        grantedAt: seedNow,
        revokedAt: status === 'revoked' ? seedNow : null,
      },
    });
  }

  const ownerAdmin = await prisma.v1AdminUser.findUniqueOrThrow({ where: { userId: userIds['admin@teameet.v1'] } });
  await prisma.v1AdminActionLog.upsert({
    where: { id: '00000000-0000-4000-8000-000000001701' },
    update: {
      adminUserId: ownerAdmin.id,
      action: 'seed.coverage.review',
      targetType: 'system',
      targetId: 'seed-coverage',
      reason: 'seed coverage action log',
      beforeJson: { coverage: false },
      afterJson: { coverage: true },
    },
    create: {
      id: '00000000-0000-4000-8000-000000001701',
      adminUserId: ownerAdmin.id,
      action: 'seed.coverage.review',
      targetType: 'system',
      targetId: 'seed-coverage',
      reason: 'seed coverage action log',
      beforeJson: { coverage: false },
      afterJson: { coverage: true },
    },
  });

  const statusLogs = [
    ['00000000-0000-4000-8000-000000001711', 'user', userIds['coverage-active@teameet.v1'], 'not_started', 'completed', 'user'],
    ['00000000-0000-4000-8000-000000001712', 'team', '00000000-0000-4000-8000-000000001203', 'active', 'suspended', 'admin'],
    ['00000000-0000-4000-8000-000000001713', 'system', 'seed-coverage', null, 'created', 'system'],
  ] as const;

  for (const [id, targetType, targetId, fromStatus, toStatus, actorType] of statusLogs) {
    await prisma.v1StatusChangeLog.upsert({
      where: { id },
      update: {
        targetType,
        targetId,
        fromStatus,
        toStatus,
        actorType,
        actorUserId: actorType === 'user' ? userIds['coverage-active@teameet.v1'] : null,
        adminUserId: actorType === 'admin' ? ownerAdmin.id : null,
        reason: `${actorType} status log coverage`,
      },
      create: {
        id,
        targetType,
        targetId,
        fromStatus,
        toStatus,
        actorType,
        actorUserId: actorType === 'user' ? userIds['coverage-active@teameet.v1'] : null,
        adminUserId: actorType === 'admin' ? ownerAdmin.id : null,
        reason: `${actorType} status log coverage`,
      },
    });
  }
}

async function main() {
  await seedRuntimeCheck();
  const sportIds = await seedSports();
  const regions = await seedRegions();
  await seedTermsAndNotice();
  const userIds = await seedUsers();

  const runningLevel = await prisma.v1SportLevel.findFirstOrThrow({
    where: { sportId: sportIds.running, code: 'beginner' },
  });

  await prisma.v1UserSportPreference.upsert({
    where: { userId_sportId: { userId: userIds['host@teameet.v1'], sportId: sportIds.running } },
    update: { sportLevelId: runningLevel.id, isPrimary: true },
    create: { userId: userIds['host@teameet.v1'], sportId: sportIds.running, sportLevelId: runningLevel.id, isPrimary: true },
  });

  await prisma.v1UserRegion.upsert({
    where: { userId_regionId: { userId: userIds['host@teameet.v1'], regionId: regions.seoulGangnam.id } },
    update: { isPrimary: true },
    create: { userId: userIds['host@teameet.v1'], regionId: regions.seoulGangnam.id, isPrimary: true },
  });

  const { ownerTeam, applicantTeam } = await seedTeams(userIds, sportIds, regions.seoulGangnam.id);
  const match = await seedMatches(userIds, sportIds, regions.seoulGangnam.id);
  const teamMatch = await seedTeamMatches(userIds, sportIds, regions.seoulSongpa.id, ownerTeam.id, applicantTeam.id);

  await seedChatAndNotifications(userIds, match.id, teamMatch.id);
  await seedAdmin(userIds);

  const coverageUserIds = { ...userIds, ...(await seedCoverageUsers()) };
  await seedCoverageTermsAndNotices();
  await seedCoverageTeams(coverageUserIds, sportIds, regions.seoulGangnam.id);
  await seedCoverageMatches(coverageUserIds, sportIds, regions.seoulGangnam.id);
  await seedCoverageTeamMatches(coverageUserIds, sportIds, regions.seoulSongpa.id);
  await seedCoverageChatNotificationsAndAdmin(coverageUserIds);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
