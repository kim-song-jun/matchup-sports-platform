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

async function getLevelRangeIds(sportId: string, minCode: (typeof levels)[number][0], maxCode: (typeof levels)[number][0]) {
  const found = await prisma.v1SportLevel.findMany({
    where: { sportId, code: { in: [minCode, maxCode] } },
    select: { id: true, code: true },
  });
  return {
    minSportLevelId: found.find((level) => level.code === minCode)?.id ?? null,
    maxSportLevelId: found.find((level) => level.code === maxCode)?.id ?? null,
  };
}

async function seedRegions() {
  const parents = [
    ['seoul', '서울', 1, 37.5665, 126.9780],
    ['gyeonggi', '경기', 2, 37.4138, 127.5183],
  ] as const;
  const parentIds: Record<string, string> = {};

  for (const [code, name, sortOrder, centerLat, centerLng] of parents) {
    const region = await prisma.v1Region.upsert({
      where: { code },
      update: { parentId: null, name, level: 1, centerLat, centerLng, isActive: true, sortOrder },
      create: { code, name, level: 1, centerLat, centerLng, isActive: true, sortOrder },
    });

    parentIds[code] = region.id;
  }

  const childRegions = [
    ['seoul', 'seoul-jongno', '종로구', 1, 37.5735, 126.9788],
    ['seoul', 'seoul-jung', '중구', 2, 37.5636, 126.9976],
    ['seoul', 'seoul-yongsan', '용산구', 3, 37.5326, 126.9905],
    ['seoul', 'seoul-seongdong', '성동구', 4, 37.5633, 127.0369],
    ['seoul', 'seoul-gwangjin', '광진구', 5, 37.5384, 127.0823],
    ['seoul', 'seoul-dongdaemun', '동대문구', 6, 37.5744, 127.0396],
    ['seoul', 'seoul-jungnang', '중랑구', 7, 37.6063, 127.0927],
    ['seoul', 'seoul-seongbuk', '성북구', 8, 37.5894, 127.0167],
    ['seoul', 'seoul-gangbuk', '강북구', 9, 37.6396, 127.0257],
    ['seoul', 'seoul-dobong', '도봉구', 10, 37.6688, 127.0471],
    ['seoul', 'seoul-nowon', '노원구', 11, 37.6542, 127.0568],
    ['seoul', 'seoul-eunpyeong', '은평구', 12, 37.6027, 126.9291],
    ['seoul', 'seoul-seodaemun', '서대문구', 13, 37.5791, 126.9368],
    ['seoul', 'seoul-mapo', '마포구', 14, 37.5663, 126.9019],
    ['seoul', 'seoul-yangcheon', '양천구', 15, 37.5169, 126.8664],
    ['seoul', 'seoul-gangseo', '강서구', 16, 37.5509, 126.8495],
    ['seoul', 'seoul-guro', '구로구', 17, 37.4955, 126.8877],
    ['seoul', 'seoul-geumcheon', '금천구', 18, 37.4569, 126.8958],
    ['seoul', 'seoul-yeongdeungpo', '영등포구', 19, 37.5264, 126.8962],
    ['seoul', 'seoul-dongjak', '동작구', 20, 37.5124, 126.9393],
    ['seoul', 'seoul-gwanak', '관악구', 21, 37.4784, 126.9516],
    ['seoul', 'seoul-seocho', '서초구', 22, 37.4836, 127.0327],
    ['seoul', 'seoul-gangnam', '강남구', 23, 37.5172, 127.0473],
    ['seoul', 'seoul-songpa', '송파구', 24, 37.5145, 127.1059],
    ['seoul', 'seoul-gangdong', '강동구', 25, 37.5301, 127.1238],
    ['gyeonggi', 'gyeonggi-suwon', '수원시', 1, 37.2636, 127.0286],
    ['gyeonggi', 'gyeonggi-seongnam', '성남시', 2, 37.4201, 127.1265],
    ['gyeonggi', 'gyeonggi-uijeongbu', '의정부시', 3, 37.7381, 127.0337],
    ['gyeonggi', 'gyeonggi-anyang', '안양시', 4, 37.3943, 126.9568],
    ['gyeonggi', 'gyeonggi-bucheon', '부천시', 5, 37.5035, 126.7660],
    ['gyeonggi', 'gyeonggi-gwangmyeong', '광명시', 6, 37.4786, 126.8646],
    ['gyeonggi', 'gyeonggi-pyeongtaek', '평택시', 7, 36.9921, 127.1127],
    ['gyeonggi', 'gyeonggi-dongducheon', '동두천시', 8, 37.9037, 127.0606],
    ['gyeonggi', 'gyeonggi-ansan', '안산시', 9, 37.3219, 126.8309],
    ['gyeonggi', 'gyeonggi-goyang', '고양시', 10, 37.6584, 126.8320],
    ['gyeonggi', 'gyeonggi-gwacheon', '과천시', 11, 37.4292, 126.9877],
    ['gyeonggi', 'gyeonggi-guri', '구리시', 12, 37.5943, 127.1296],
    ['gyeonggi', 'gyeonggi-namyangju', '남양주시', 13, 37.6360, 127.2165],
    ['gyeonggi', 'gyeonggi-osan', '오산시', 14, 37.1498, 127.0772],
    ['gyeonggi', 'gyeonggi-siheung', '시흥시', 15, 37.3800, 126.8029],
    ['gyeonggi', 'gyeonggi-gunpo', '군포시', 16, 37.3617, 126.9352],
    ['gyeonggi', 'gyeonggi-uiwang', '의왕시', 17, 37.3449, 126.9683],
    ['gyeonggi', 'gyeonggi-hanam', '하남시', 18, 37.5393, 127.2149],
    ['gyeonggi', 'gyeonggi-yongin', '용인시', 19, 37.2411, 127.1776],
    ['gyeonggi', 'gyeonggi-paju', '파주시', 20, 37.7599, 126.7799],
    ['gyeonggi', 'gyeonggi-icheon', '이천시', 21, 37.2723, 127.4350],
    ['gyeonggi', 'gyeonggi-anseong', '안성시', 22, 37.0080, 127.2797],
    ['gyeonggi', 'gyeonggi-gimpo', '김포시', 23, 37.6153, 126.7156],
    ['gyeonggi', 'gyeonggi-hwaseong', '화성시', 24, 37.1996, 126.8310],
    ['gyeonggi', 'gyeonggi-gwangju', '광주시', 25, 37.4294, 127.2550],
    ['gyeonggi', 'gyeonggi-yangju', '양주시', 26, 37.7853, 127.0458],
    ['gyeonggi', 'gyeonggi-pocheon', '포천시', 27, 37.8949, 127.2003],
    ['gyeonggi', 'gyeonggi-yeoju', '여주시', 28, 37.2983, 127.6371],
    ['gyeonggi', 'gyeonggi-yeoncheon', '연천군', 29, 38.0964, 127.0750],
    ['gyeonggi', 'gyeonggi-gapyeong', '가평군', 30, 37.8315, 127.5099],
    ['gyeonggi', 'gyeonggi-yangpyeong', '양평군', 31, 37.4917, 127.4876],
  ] as const;

  const childCodes = childRegions.map(([, code]) => code);
  await prisma.v1Region.updateMany({
    where: { level: 2, code: { notIn: childCodes } },
    data: { isActive: false },
  });

  for (const [parentCode, code, name, sortOrder, centerLat, centerLng] of childRegions) {
    const parentId = parentIds[parentCode];
    await prisma.v1Region.upsert({
      where: { code },
      update: { parentId, name, level: 2, centerLat, centerLng, isActive: true, sortOrder },
      create: { parentId, code, name, level: 2, centerLat, centerLng, isActive: true, sortOrder },
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

  const publicNotices = [
    ['00000000-0000-4000-8000-000000000001', '고정', '이번 주 고정 공지', '주말 경기장 입장 시간과 체크인 안내', '2026-05-18T00:00:00.000Z'],
    ['00000000-0000-4000-8000-000000000002', '업데이트', '매너 점수 업데이트', '경기 후 리뷰 반영 기준 안내', '2026-05-17T00:00:00.000Z'],
    ['00000000-0000-4000-8000-000000000003', '안내', '비 예보 경기 안내', '우천 시 취소와 환불 기준 확인', '2026-05-16T00:00:00.000Z'],
    ['00000000-0000-4000-8000-000000000004', '안내', '프로필 공개 범위 안내', '닉네임, 활동 지역, 선호 종목 공개 범위 기준을 안내합니다.', '2026-05-15T00:00:00.000Z'],
  ] as const;

  for (const [id, category, title, body, publishedAt] of publicNotices) {
    await prisma.v1Notice.upsert({
      where: { id },
      update: {
        audience: 'public',
        category,
        title,
        body,
        status: 'published',
        publishedAt: new Date(publishedAt),
      },
      create: {
        id,
        audience: 'public',
        category,
        title,
        body,
        status: 'published',
        publishedAt: new Date(publishedAt),
      },
    });
  }
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
  const runningNoviceIntermediate = await getLevelRangeIds(sportIds.running, 'novice', 'intermediate');
  const futsalBeginnerAdvanced = await getLevelRangeIds(sportIds.futsal, 'beginner', 'advanced');
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
          ...runningNoviceIntermediate,
          genderRule: '성별 무관',
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
          ...futsalBeginnerAdvanced,
          genderRule: '남',
        },
      },
    },
  });

  await prisma.v1TeamTrustScore.upsert({
    where: { teamId: applicantTeam.id },
    update: {
      trustState: 'estimated',
      mannerScore: 4.5,
      matchCount: 3,
      sourceLabel: '완료 팀매치 리뷰 기반',
      calculatedAt: new Date('2026-05-18T00:00:00.000Z'),
    },
    create: {
      teamId: applicantTeam.id,
      trustState: 'estimated',
      mannerScore: 4.5,
      matchCount: 3,
      sourceLabel: '완료 팀매치 리뷰 기반',
      calculatedAt: new Date('2026-05-18T00:00:00.000Z'),
    },
  });

  await prisma.v1TeamProfile.upsert({
    where: { teamId: ownerTeam.id },
    update: { skillNote: '초보부터 중수까지', ...runningNoviceIntermediate, genderRule: '성별 무관' },
    create: {
      teamId: ownerTeam.id,
      description: '평일 저녁에 함께 뛰는 v1 seed 팀입니다.',
      activityNote: '주 2회 러닝',
      skillNote: '초보부터 중수까지',
      ...runningNoviceIntermediate,
      genderRule: '성별 무관',
    },
  });
  await prisma.v1TeamProfile.upsert({
    where: { teamId: applicantTeam.id },
    update: { ...futsalBeginnerAdvanced, genderRule: '남' },
    create: {
      teamId: applicantTeam.id,
      description: '주말 풋살 상대를 찾는 v1 seed 팀입니다.',
      ...futsalBeginnerAdvanced,
      genderRule: '남',
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
    where: { teamId_userId: { teamId: ownerTeam.id, userId: userIds['admin@teameet.v1'] } },
    update: { role: V1TeamMembershipRole.manager, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z'), leftAt: null, removedByUserId: null },
    create: { teamId: ownerTeam.id, userId: userIds['admin@teameet.v1'], role: V1TeamMembershipRole.manager, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z') },
  });
  await prisma.v1TeamMembership.upsert({
    where: { teamId_userId: { teamId: ownerTeam.id, userId: userIds['member@teameet.v1'] } },
    update: { role: V1TeamMembershipRole.member, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z') },
    create: { teamId: ownerTeam.id, userId: userIds['member@teameet.v1'], role: V1TeamMembershipRole.member, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z') },
  });
  await prisma.v1TeamMembership.upsert({
    where: { teamId_userId: { teamId: ownerTeam.id, userId: userIds['host@teameet.v1'] } },
    update: { role: V1TeamMembershipRole.member, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z'), leftAt: null, removedByUserId: null },
    create: { teamId: ownerTeam.id, userId: userIds['host@teameet.v1'], role: V1TeamMembershipRole.member, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z') },
  });
  await prisma.v1TeamMembership.upsert({
    where: { teamId_userId: { teamId: applicantTeam.id, userId: userIds['host@teameet.v1'] } },
    update: { role: V1TeamMembershipRole.owner, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z'), leftAt: null, removedByUserId: null },
    create: { teamId: applicantTeam.id, userId: userIds['host@teameet.v1'], role: V1TeamMembershipRole.owner, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z') },
  });
  await prisma.v1TeamMembership.upsert({
    where: { teamId_userId: { teamId: applicantTeam.id, userId: userIds['applicant@teameet.v1'] } },
    update: { role: V1TeamMembershipRole.member, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z'), leftAt: null, removedByUserId: null },
    create: { teamId: applicantTeam.id, userId: userIds['applicant@teameet.v1'], role: V1TeamMembershipRole.member, status: 'active', joinedAt: new Date('2026-05-18T00:00:00.000Z') },
  });

  return { ownerTeam, applicantTeam };
}

async function seedMatches(userIds: Record<string, string>, sportIds: Record<string, string>, regionId: string) {
  const runningNoviceIntermediate = await getLevelRangeIds(sportIds.running, 'novice', 'intermediate');
  const match = await prisma.v1Match.upsert({
    where: { id: '00000000-0000-4000-8000-000000000201' },
    update: {
      title: '강남 저녁 러닝 멤버 모집',
      status: 'recruiting',
      ...runningNoviceIntermediate,
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
      ...runningNoviceIntermediate,
      genderRule: '성별 무관',
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
  const futsalIntermediate = await getLevelRangeIds(sportIds.futsal, 'intermediate', 'intermediate');
  const teamMatch = await prisma.v1TeamMatch.upsert({
    where: { id: '00000000-0000-4000-8000-000000000301' },
    update: {
      title: '토요일 풋살 상대팀 모집',
      status: 'recruiting',
      genderRule: '남',
      ...futsalIntermediate,
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
      ...futsalIntermediate,
      genderRule: '남',
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

async function seedHostMinDemoData(
  userIds: Record<string, string>,
  sportIds: Record<string, string>,
  regionId: string,
  ownerTeamId: string,
  applicantTeamId: string,
) {
  const futsalBeginnerIntermediate = await getLevelRangeIds(sportIds.futsal, 'beginner', 'intermediate');
  const runningBeginnerNovice = await getLevelRangeIds(sportIds.running, 'beginner', 'novice');
  const runningNoviceIntermediate = await getLevelRangeIds(sportIds.running, 'novice', 'intermediate');

  type LevelRange = { minSportLevelId: string | null; maxSportLevelId: string | null };
  type ReviewSeed = {
    id: string;
    reviewerUserId: string;
    reviewerTeamId?: string | null;
    sourceType: 'match' | 'team_match';
    sourceId: string;
    targetType: 'user' | 'team';
    targetUserId?: string | null;
    targetTeamId?: string | null;
    rating: number;
    submittedAt: Date;
    tags: Array<readonly [string, string]>;
  };

  const upsertMatch = (
    id: string,
    data: {
      hostUserId: string;
      sportId: string;
      title: string;
      description: string;
      placeName: string;
      startAt: Date;
      endAt: Date;
      maxParticipants: number;
      status: 'recruiting' | 'closed' | 'cancelled' | 'completed';
      levelRange: LevelRange;
      completedAt?: Date | null;
      cancelledAt?: Date | null;
    },
  ) =>
    prisma.v1Match.upsert({
      where: { id },
      update: {
        hostUserId: data.hostUserId,
        sportId: data.sportId,
        regionId,
        title: data.title,
        description: data.description,
        placeName: data.placeName,
        placeAddress: '서울 강남구',
        startAt: data.startAt,
        endAt: data.endAt,
        maxParticipants: data.maxParticipants,
        status: data.status,
        completedAt: data.completedAt ?? null,
        cancelledAt: data.cancelledAt ?? null,
        ...data.levelRange,
      },
      create: {
        id,
        hostUserId: data.hostUserId,
        sportId: data.sportId,
        regionId,
        title: data.title,
        description: data.description,
        placeName: data.placeName,
        placeAddress: '서울 강남구',
        startAt: data.startAt,
        endAt: data.endAt,
        maxParticipants: data.maxParticipants,
        status: data.status,
        completedAt: data.completedAt ?? null,
        cancelledAt: data.cancelledAt ?? null,
        levelNote: '데모 상태 확인용',
        ...data.levelRange,
        genderRule: '성별 무관',
        costNote: '무료',
      },
    });

  const upsertParticipant = (
    matchId: string,
    userId: string,
    role: 'host' | 'participant',
    status: 'active' | 'completed' | 'cancelled' | 'no_show' = 'active',
    applicationId: string | null = null,
  ) =>
    prisma.v1MatchParticipant.upsert({
      where: { matchId_userId: { matchId, userId } },
      update: {
        role,
        status,
        applicationId,
        approvedAt: seedNow,
        completedAt: status === 'completed' ? new Date('2026-05-12T12:00:00.000Z') : null,
        cancelledAt: status === 'cancelled' ? new Date('2026-05-12T09:00:00.000Z') : null,
      },
      create: {
        matchId,
        userId,
        role,
        status,
        applicationId,
        approvedAt: seedNow,
        completedAt: status === 'completed' ? new Date('2026-05-12T12:00:00.000Z') : null,
        cancelledAt: status === 'cancelled' ? new Date('2026-05-12T09:00:00.000Z') : null,
      },
    });

  const completedMatch = await upsertMatch('00000000-0000-4000-8000-000000000203', {
    hostUserId: userIds['host@teameet.v1'],
    sportId: sportIds.futsal,
    title: '성수 풋살파크 완료 매치',
    description: '리뷰 작성/받은 리뷰 데모용 완료 개인매치입니다.',
    placeName: '성수 풋살파크',
    startAt: new Date('2026-05-10T10:00:00.000Z'),
    endAt: new Date('2026-05-10T12:00:00.000Z'),
    maxParticipants: 6,
    status: 'completed',
    completedAt: new Date('2026-05-10T12:00:00.000Z'),
    levelRange: futsalBeginnerIntermediate,
  });
  await upsertParticipant(completedMatch.id, userIds['host@teameet.v1'], 'host', 'completed');
  await upsertParticipant(completedMatch.id, userIds['applicant@teameet.v1'], 'participant', 'completed');
  await upsertParticipant(completedMatch.id, userIds['owner@teameet.v1'], 'participant', 'completed');

  const pendingReviewMatch = await upsertMatch('00000000-0000-4000-8000-000000000204', {
    hostUserId: userIds['host@teameet.v1'],
    sportId: sportIds.running,
    title: '한강 러닝 완료 매치',
    description: '아직 작성하지 않은 리뷰 대상이 남는 완료 개인매치입니다.',
    placeName: '한강공원 반포지구',
    startAt: new Date('2026-05-12T09:00:00.000Z'),
    endAt: new Date('2026-05-12T10:00:00.000Z'),
    maxParticipants: 8,
    status: 'completed',
    completedAt: new Date('2026-05-12T10:00:00.000Z'),
    levelRange: runningBeginnerNovice,
  });
  await upsertParticipant(pendingReviewMatch.id, userIds['host@teameet.v1'], 'host', 'completed');
  await upsertParticipant(pendingReviewMatch.id, userIds['member@teameet.v1'], 'participant', 'completed');

  const cancelledMatch = await upsertMatch('00000000-0000-4000-8000-000000000205', {
    hostUserId: userIds['host@teameet.v1'],
    sportId: sportIds.running,
    title: '우천 취소 러닝',
    description: '취소 상태 확인용 개인매치입니다.',
    placeName: '잠실 한강공원',
    startAt: new Date('2026-05-14T09:00:00.000Z'),
    endAt: new Date('2026-05-14T10:00:00.000Z'),
    maxParticipants: 8,
    status: 'cancelled',
    cancelledAt: new Date('2026-05-13T22:00:00.000Z'),
    levelRange: runningBeginnerNovice,
  });
  await upsertParticipant(cancelledMatch.id, userIds['host@teameet.v1'], 'host', 'cancelled');

  const closedMatch = await upsertMatch('00000000-0000-4000-8000-000000000206', {
    hostUserId: userIds['host@teameet.v1'],
    sportId: sportIds.running,
    title: '정원 마감 러닝',
    description: '마감 상태 확인용 개인매치입니다.',
    placeName: '강남 탄천 산책로',
    startAt: new Date('2026-06-03T10:00:00.000Z'),
    endAt: new Date('2026-06-03T11:00:00.000Z'),
    maxParticipants: 6,
    status: 'closed',
    levelRange: runningNoviceIntermediate,
  });
  await upsertParticipant(closedMatch.id, userIds['host@teameet.v1'], 'host', 'active');

  const requestedMatch = await upsertMatch('00000000-0000-4000-8000-000000000207', {
    hostUserId: userIds['owner@teameet.v1'],
    sportId: sportIds.running,
    title: '팀장원 러닝 신청 대기',
    description: '호스트민이 신청 대기 중인 개인매치입니다.',
    placeName: '양재천 입구',
    startAt: new Date('2026-06-04T10:00:00.000Z'),
    endAt: new Date('2026-06-04T11:00:00.000Z'),
    maxParticipants: 8,
    status: 'recruiting',
    levelRange: runningNoviceIntermediate,
  });
  await prisma.v1MatchApplication.upsert({
    where: { matchId_applicantUserId: { matchId: requestedMatch.id, applicantUserId: userIds['host@teameet.v1'] } },
    update: { status: 'requested', message: '참가 신청합니다.', reviewedByUserId: null, reviewedAt: null, withdrawnAt: null },
    create: { matchId: requestedMatch.id, applicantUserId: userIds['host@teameet.v1'], status: 'requested', message: '참가 신청합니다.' },
  });

  const approvedMatch = await upsertMatch('00000000-0000-4000-8000-000000000208', {
    hostUserId: userIds['owner@teameet.v1'],
    sportId: sportIds.futsal,
    title: '승인 완료 풋살 참여',
    description: '호스트민이 승인되어 참여 예정인 개인매치입니다.',
    placeName: '마포 풋살장',
    startAt: new Date('2026-06-05T10:00:00.000Z'),
    endAt: new Date('2026-06-05T12:00:00.000Z'),
    maxParticipants: 10,
    status: 'recruiting',
    levelRange: futsalBeginnerIntermediate,
  });
  const approvedApplication = await prisma.v1MatchApplication.upsert({
    where: { matchId_applicantUserId: { matchId: approvedMatch.id, applicantUserId: userIds['host@teameet.v1'] } },
    update: { status: 'approved', message: '참여 확정 부탁드립니다.', reviewedByUserId: userIds['owner@teameet.v1'], reviewedAt: seedNow, withdrawnAt: null },
    create: { matchId: approvedMatch.id, applicantUserId: userIds['host@teameet.v1'], status: 'approved', message: '참여 확정 부탁드립니다.', reviewedByUserId: userIds['owner@teameet.v1'], reviewedAt: seedNow },
  });
  await upsertParticipant(approvedMatch.id, userIds['host@teameet.v1'], 'participant', 'active', approvedApplication.id);

  const upsertTeamMatch = (
    id: string,
    data: {
      hostTeamId: string;
      createdByUserId: string;
      title: string;
      description: string;
      startAt: Date;
      endAt: Date;
      status: 'recruiting' | 'matched' | 'cancelled' | 'completed';
      approvedApplicantTeamId?: string | null;
      completedAt?: Date | null;
      cancelledAt?: Date | null;
    },
  ) =>
    prisma.v1TeamMatch.upsert({
      where: { id },
      update: {
        hostTeamId: data.hostTeamId,
        createdByUserId: data.createdByUserId,
        sportId: sportIds.futsal,
        regionId,
        title: data.title,
        description: data.description,
        placeName: '잠실 풋살장',
        placeAddress: '서울 송파구',
        startAt: data.startAt,
        endAt: data.endAt,
        status: data.status,
        approvedApplicantTeamId: data.approvedApplicantTeamId ?? null,
        completedAt: data.completedAt ?? null,
        cancelledAt: data.cancelledAt ?? null,
        ...futsalBeginnerIntermediate,
      },
      create: {
        id,
        hostTeamId: data.hostTeamId,
        createdByUserId: data.createdByUserId,
        sportId: sportIds.futsal,
        regionId,
        title: data.title,
        description: data.description,
        placeName: '잠실 풋살장',
        placeAddress: '서울 송파구',
        startAt: data.startAt,
        endAt: data.endAt,
        formatNote: '6:6',
        status: data.status,
        approvedApplicantTeamId: data.approvedApplicantTeamId ?? null,
        completedAt: data.completedAt ?? null,
        cancelledAt: data.cancelledAt ?? null,
        ...futsalBeginnerIntermediate,
        genderRule: '성별 무관',
        costNote: '구장비 N분의 1',
      },
    });

  const hostedCompletedTeamMatch = await upsertTeamMatch('00000000-0000-4000-8000-000000000303', {
    hostTeamId: applicantTeamId,
    createdByUserId: userIds['host@teameet.v1'],
    title: '송파 풋살 모임 완료 팀매치',
    description: '호스트민 팀이 주최한 완료 팀매치입니다.',
    startAt: new Date('2026-05-11T10:00:00.000Z'),
    endAt: new Date('2026-05-11T12:00:00.000Z'),
    status: 'completed',
    approvedApplicantTeamId: ownerTeamId,
    completedAt: new Date('2026-05-11T12:00:00.000Z'),
  });
  await prisma.v1TeamMatchApplication.upsert({
    where: { teamMatchId_applicantTeamId: { teamMatchId: hostedCompletedTeamMatch.id, applicantTeamId: ownerTeamId } },
    update: { appliedByUserId: userIds['owner@teameet.v1'], status: 'approved', message: '상대팀으로 참여했습니다.', reviewedByUserId: userIds['host@teameet.v1'], reviewedAt: seedNow, withdrawnAt: null },
    create: { teamMatchId: hostedCompletedTeamMatch.id, applicantTeamId: ownerTeamId, appliedByUserId: userIds['owner@teameet.v1'], status: 'approved', message: '상대팀으로 참여했습니다.', reviewedByUserId: userIds['host@teameet.v1'], reviewedAt: seedNow },
  });

  const appliedCompletedTeamMatch = await upsertTeamMatch('00000000-0000-4000-8000-000000000304', {
    hostTeamId: ownerTeamId,
    createdByUserId: userIds['owner@teameet.v1'],
    title: '강남 러닝 크루 완료 팀매치',
    description: '호스트민 팀이 상대팀으로 참여한 완료 팀매치입니다.',
    startAt: new Date('2026-05-13T10:00:00.000Z'),
    endAt: new Date('2026-05-13T12:00:00.000Z'),
    status: 'completed',
    approvedApplicantTeamId: applicantTeamId,
    completedAt: new Date('2026-05-13T12:00:00.000Z'),
  });
  await prisma.v1TeamMatchApplication.upsert({
    where: { teamMatchId_applicantTeamId: { teamMatchId: appliedCompletedTeamMatch.id, applicantTeamId } },
    update: { appliedByUserId: userIds['host@teameet.v1'], status: 'approved', message: '상대팀으로 참여했습니다.', reviewedByUserId: userIds['owner@teameet.v1'], reviewedAt: seedNow, withdrawnAt: null },
    create: { teamMatchId: appliedCompletedTeamMatch.id, applicantTeamId, appliedByUserId: userIds['host@teameet.v1'], status: 'approved', message: '상대팀으로 참여했습니다.', reviewedByUserId: userIds['owner@teameet.v1'], reviewedAt: seedNow },
  });

  await upsertTeamMatch('00000000-0000-4000-8000-000000000305', {
    hostTeamId: applicantTeamId,
    createdByUserId: userIds['host@teameet.v1'],
    title: '취소된 팀매치',
    description: '호스트민 팀의 취소 상태 팀매치입니다.',
    startAt: new Date('2026-05-16T10:00:00.000Z'),
    endAt: new Date('2026-05-16T12:00:00.000Z'),
    status: 'cancelled',
    cancelledAt: new Date('2026-05-15T12:00:00.000Z'),
  });

  await upsertTeamMatch('00000000-0000-4000-8000-000000000306', {
    hostTeamId: applicantTeamId,
    createdByUserId: userIds['host@teameet.v1'],
    title: '새 상대팀 모집중',
    description: '호스트민 팀이 주최한 모집중 팀매치입니다.',
    startAt: new Date('2026-06-06T10:00:00.000Z'),
    endAt: new Date('2026-06-06T12:00:00.000Z'),
    status: 'recruiting',
  });

  const matchedTeamMatch = await upsertTeamMatch('00000000-0000-4000-8000-000000000307', {
    hostTeamId: applicantTeamId,
    createdByUserId: userIds['host@teameet.v1'],
    title: '상대 확정 팀매치',
    description: '상대팀 확정 상태 확인용 팀매치입니다.',
    startAt: new Date('2026-06-07T10:00:00.000Z'),
    endAt: new Date('2026-06-07T12:00:00.000Z'),
    status: 'matched',
    approvedApplicantTeamId: ownerTeamId,
  });
  await prisma.v1TeamMatchApplication.upsert({
    where: { teamMatchId_applicantTeamId: { teamMatchId: matchedTeamMatch.id, applicantTeamId: ownerTeamId } },
    update: { appliedByUserId: userIds['owner@teameet.v1'], status: 'approved', message: '상대팀 확정 상태입니다.', reviewedByUserId: userIds['host@teameet.v1'], reviewedAt: seedNow, withdrawnAt: null },
    create: { teamMatchId: matchedTeamMatch.id, applicantTeamId: ownerTeamId, appliedByUserId: userIds['owner@teameet.v1'], status: 'approved', message: '상대팀 확정 상태입니다.', reviewedByUserId: userIds['host@teameet.v1'], reviewedAt: seedNow },
  });

  const reviewSeeds: ReviewSeed[] = [
    {
      id: '00000000-0000-4000-8000-000000000601',
      reviewerUserId: userIds['applicant@teameet.v1'],
      sourceType: 'match',
      sourceId: completedMatch.id,
      targetType: 'user',
      targetUserId: userIds['host@teameet.v1'],
      rating: 5,
      submittedAt: new Date('2026-05-10T12:30:00.000Z'),
      tags: [['manner', '매너가 좋아요'], ['play_again', '또 같이 운동하고 싶어요']],
    },
    {
      id: '00000000-0000-4000-8000-000000000602',
      reviewerUserId: userIds['owner@teameet.v1'],
      sourceType: 'match',
      sourceId: completedMatch.id,
      targetType: 'user',
      targetUserId: userIds['host@teameet.v1'],
      rating: 4,
      submittedAt: new Date('2026-05-10T12:35:00.000Z'),
      tags: [['punctual', '시간 약속을 잘 지켜요'], ['communication', '소통이 원활해요']],
    },
    {
      id: '00000000-0000-4000-8000-000000000603',
      reviewerUserId: userIds['host@teameet.v1'],
      sourceType: 'match',
      sourceId: completedMatch.id,
      targetType: 'user',
      targetUserId: userIds['applicant@teameet.v1'],
      rating: 5,
      submittedAt: new Date('2026-05-10T12:40:00.000Z'),
      tags: [['teamwork', '팀워크가 좋아요'], ['manner', '매너가 좋아요']],
    },
    {
      id: '00000000-0000-4000-8000-000000000604',
      reviewerUserId: userIds['owner@teameet.v1'],
      reviewerTeamId: ownerTeamId,
      sourceType: 'team_match',
      sourceId: hostedCompletedTeamMatch.id,
      targetType: 'team',
      targetTeamId: applicantTeamId,
      rating: 4,
      submittedAt: new Date('2026-05-11T12:30:00.000Z'),
      tags: [['manner', '매너가 좋아요'], ['communication', '소통이 원활해요']],
    },
    {
      id: '00000000-0000-4000-8000-000000000605',
      reviewerUserId: userIds['host@teameet.v1'],
      reviewerTeamId: applicantTeamId,
      sourceType: 'team_match',
      sourceId: appliedCompletedTeamMatch.id,
      targetType: 'team',
      targetTeamId: ownerTeamId,
      rating: 5,
      submittedAt: new Date('2026-05-13T12:35:00.000Z'),
      tags: [['teamwork', '팀워크가 좋아요'], ['punctual', '시간 약속을 잘 지켜요']],
    },
  ];

  for (const review of reviewSeeds) {
    await prisma.v1PostEventReview.upsert({
      where: { id: review.id },
      update: {
        reviewerUserId: review.reviewerUserId,
        reviewerTeamId: review.reviewerTeamId ?? null,
        sourceType: review.sourceType,
        sourceId: review.sourceId,
        targetType: review.targetType,
        targetUserId: review.targetUserId ?? null,
        targetTeamId: review.targetTeamId ?? null,
        rating: review.rating,
        status: 'submitted',
        submittedAt: review.submittedAt,
        hiddenAt: null,
        removedAt: null,
      },
      create: {
        id: review.id,
        reviewerUserId: review.reviewerUserId,
        reviewerTeamId: review.reviewerTeamId ?? null,
        sourceType: review.sourceType,
        sourceId: review.sourceId,
        targetType: review.targetType,
        targetUserId: review.targetUserId ?? null,
        targetTeamId: review.targetTeamId ?? null,
        rating: review.rating,
        status: 'submitted',
        submittedAt: review.submittedAt,
      },
    });

    await prisma.v1PostEventReviewTag.deleteMany({ where: { reviewId: review.id } });
    for (const [tagCode, labelSnapshot] of review.tags) {
      await prisma.v1PostEventReviewTag.create({
        data: { reviewId: review.id, tagCode, labelSnapshot },
      });
    }
  }

  await prisma.v1UserReputationSummary.upsert({
    where: { userId: userIds['host@teameet.v1'] },
    update: {
      trustState: 'estimated',
      mannerScore: 4.5,
      reviewCount: 2,
      sourceLabel: '완료 경기 리뷰 기반',
      calculatedAt: new Date('2026-05-18T00:00:00.000Z'),
    },
    create: {
      userId: userIds['host@teameet.v1'],
      trustState: 'estimated',
      mannerScore: 4.5,
      reviewCount: 2,
      sourceLabel: '완료 경기 리뷰 기반',
      calculatedAt: new Date('2026-05-18T00:00:00.000Z'),
    },
  });
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

  const notifications = [
    {
      id: '00000000-0000-4000-8000-000000000501',
      recipientUserId: userIds['host@teameet.v1'],
      targetType: V1NotificationTargetType.match,
      targetId: matchId,
      title: '매치 참가 확정',
      body: '성수 풋살파크 · 10명 · 현장 준비 필요',
      deepLink: `/matches/${matchId}`,
      readAt: null,
      createdAt: new Date('2026-05-24T08:05:00.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000502',
      recipientUserId: userIds['host@teameet.v1'],
      targetType: V1NotificationTargetType.team_match,
      targetId: teamMatchId,
      title: '팀매치 신청 도착',
      body: '상대팀 신청이 들어왔습니다. 조건을 확인해 주세요.',
      deepLink: `/team-matches/${teamMatchId}`,
      readAt: null,
      createdAt: new Date('2026-05-24T07:50:00.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000503',
      recipientUserId: userIds['host@teameet.v1'],
      targetType: V1NotificationTargetType.chat,
      targetId: matchRoom.id,
      title: '새 메시지',
      body: '주말 풋살 매치 채팅방에 새 메시지가 있습니다.',
      deepLink: `/chat/rooms/${matchRoom.id}`,
      readAt: new Date('2026-05-24T08:10:00.000Z'),
      createdAt: new Date('2026-05-23T10:00:00.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000504',
      recipientUserId: userIds['host@teameet.v1'],
      targetType: V1NotificationTargetType.notice,
      targetId: '00000000-0000-4000-8000-000000000001',
      title: '공지 업데이트',
      body: '이번 주 고정 공지가 업데이트되었습니다.',
      deepLink: '/notices/00000000-0000-4000-8000-000000000001',
      readAt: new Date('2026-05-24T08:12:00.000Z'),
      createdAt: new Date('2026-05-21T08:30:00.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000505',
      recipientUserId: userIds['applicant@teameet.v1'],
      targetType: V1NotificationTargetType.match,
      targetId: matchId,
      title: '매치 신청 상태 안내',
      body: '신청한 매치가 접수되었습니다.',
      deepLink: `/matches/${matchId}`,
      readAt: null,
      createdAt: new Date('2026-05-24T08:00:00.000Z'),
    },
  ];

  for (const notification of notifications) {
    await prisma.v1Notification.upsert({
      where: { id: notification.id },
      update: notification,
      create: notification,
    });
  }
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

async function seedAdminOps(userIds: Record<string, string>, matchId: string, teamMatchId: string) {
  const ownerAdmin = await prisma.v1AdminUser.findUniqueOrThrow({ where: { userId: userIds['admin@teameet.v1'] } });

  const report = await prisma.v1OpsReport.upsert({
    where: { id: '00000000-0000-4000-8000-000000001801' },
    update: {
      reporterUserId: userIds['applicant@teameet.v1'],
      targetType: 'match',
      targetId: matchId,
      reason: 'safety',
      description: '경기 장소 안내가 실제 위치와 다릅니다.',
      status: 'reviewing',
      priority: 20,
      assignedAdminUserId: ownerAdmin.id,
    },
    create: {
      id: '00000000-0000-4000-8000-000000001801',
      reporterUserId: userIds['applicant@teameet.v1'],
      targetType: 'match',
      targetId: matchId,
      reason: 'safety',
      description: '경기 장소 안내가 실제 위치와 다릅니다.',
      status: 'reviewing',
      priority: 20,
      assignedAdminUserId: ownerAdmin.id,
    },
  });

  const dispute = await prisma.v1OpsDispute.upsert({
    where: { id: '00000000-0000-4000-8000-000000001811' },
    update: {
      reporterUserId: userIds['owner@teameet.v1'],
      targetType: 'team_match',
      targetId: teamMatchId,
      reason: 'payment_refund',
      title: '팀매치 취소 환불 검토',
      description: '상대팀 취소 후 환불 책임 분배가 필요합니다.',
      status: 'assigned',
      amount: 42000,
      assignedAdminUserId: ownerAdmin.id,
    },
    create: {
      id: '00000000-0000-4000-8000-000000001811',
      reporterUserId: userIds['owner@teameet.v1'],
      targetType: 'team_match',
      targetId: teamMatchId,
      reason: 'payment_refund',
      title: '팀매치 취소 환불 검토',
      description: '상대팀 취소 후 환불 책임 분배가 필요합니다.',
      status: 'assigned',
      amount: 42000,
      assignedAdminUserId: ownerAdmin.id,
    },
  });

  const paymentOrder = await prisma.v1PaymentOrder.upsert({
    where: { orderId: 'tm_seed_ops_001' },
    update: {
      buyerUserId: userIds['applicant@teameet.v1'],
      sourceType: 'team_match',
      sourceId: teamMatchId,
      amount: 42000,
      orderName: '팀매치 참가비',
      status: 'confirmed',
      providerPaymentKey: 'test_payment_seed_ops_001',
      providerOrderId: 'tm_seed_ops_001',
      approvedAt: new Date('2026-05-19T08:20:00.000Z'),
    },
    create: {
      id: '00000000-0000-4000-8000-000000001821',
      orderId: 'tm_seed_ops_001',
      buyerUserId: userIds['applicant@teameet.v1'],
      sourceType: 'team_match',
      sourceId: teamMatchId,
      amount: 42000,
      orderName: '팀매치 참가비',
      status: 'confirmed',
      providerPaymentKey: 'test_payment_seed_ops_001',
      providerOrderId: 'tm_seed_ops_001',
      requestedAt: new Date('2026-05-19T08:00:00.000Z'),
      approvedAt: new Date('2026-05-19T08:20:00.000Z'),
      metadataJson: { mode: 'test', source: 'seed' },
    },
  });

  await prisma.v1PaymentRefund.upsert({
    where: { id: '00000000-0000-4000-8000-000000001831' },
    update: {
      paymentOrderId: paymentOrder.id,
      requesterUserId: userIds['owner@teameet.v1'],
      reviewedByAdminUserId: ownerAdmin.id,
      amount: 12000,
      reason: '팀매치 취소 책임 분쟁으로 부분 환불 검토',
      status: 'reviewing',
    },
    create: {
      id: '00000000-0000-4000-8000-000000001831',
      paymentOrderId: paymentOrder.id,
      requesterUserId: userIds['owner@teameet.v1'],
      reviewedByAdminUserId: ownerAdmin.id,
      amount: 12000,
      reason: '팀매치 취소 책임 분쟁으로 부분 환불 검토',
      status: 'reviewing',
      reviewedAt: new Date('2026-05-19T09:00:00.000Z'),
    },
  });

  const seller = await prisma.v1SettlementSeller.upsert({
    where: { userId: userIds['owner@teameet.v1'] },
    update: {
      status: 'verified',
      providerSellerId: 'seller_seed_owner_001',
      displayName: '성수 FC 운영자',
      kycStatus: 'verified',
    },
    create: {
      id: '00000000-0000-4000-8000-000000001841',
      userId: userIds['owner@teameet.v1'],
      status: 'verified',
      providerSellerId: 'seller_seed_owner_001',
      displayName: '성수 FC 운영자',
      email: 'owner@teameet.v1',
      kycStatus: 'verified',
    },
  });

  await prisma.v1SettlementAccount.upsert({
    where: { id: '00000000-0000-4000-8000-000000001842' },
    update: {
      sellerId: seller.id,
      status: 'verified',
      bankName: '토스뱅크',
      accountLast4: '1234',
      accountHolderName: '팀장원',
      verifiedAt: new Date('2026-05-19T07:00:00.000Z'),
    },
    create: {
      id: '00000000-0000-4000-8000-000000001842',
      sellerId: seller.id,
      status: 'verified',
      bankName: '토스뱅크',
      accountLast4: '1234',
      accountHolderName: '팀장원',
      verifiedAt: new Date('2026-05-19T07:00:00.000Z'),
    },
  });

  const settlement = await prisma.v1SettlementBatch.upsert({
    where: { batchKey: 'settlement_seed_202605' },
    update: {
      status: 'approved',
      totalAmount: 30000,
      reviewedByAdminUserId: ownerAdmin.id,
      approvedAt: new Date('2026-05-20T10:00:00.000Z'),
    },
    create: {
      id: '00000000-0000-4000-8000-000000001851',
      batchKey: 'settlement_seed_202605',
      status: 'approved',
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      periodEnd: new Date('2026-05-31T23:59:59.000Z'),
      totalAmount: 30000,
      createdByAdminUserId: ownerAdmin.id,
      reviewedByAdminUserId: ownerAdmin.id,
      approvedAt: new Date('2026-05-20T10:00:00.000Z'),
    },
  });

  await prisma.v1SettlementItem.upsert({
    where: { id: '00000000-0000-4000-8000-000000001852' },
    update: {
      settlementBatchId: settlement.id,
      sellerId: seller.id,
      sourceType: 'team_match',
      sourceId: teamMatchId,
      grossAmount: 42000,
      feeAmount: 12000,
      netAmount: 30000,
      status: 'approved',
    },
    create: {
      id: '00000000-0000-4000-8000-000000001852',
      settlementBatchId: settlement.id,
      sellerId: seller.id,
      sourceType: 'team_match',
      sourceId: teamMatchId,
      grossAmount: 42000,
      feeAmount: 12000,
      netAmount: 30000,
      status: 'approved',
    },
  });

  const payout = await prisma.v1PayoutAttempt.upsert({
    where: { id: '00000000-0000-4000-8000-000000001861' },
    update: {
      settlementBatchId: settlement.id,
      requestedByAdminUserId: ownerAdmin.id,
      status: 'failed',
      amount: 30000,
      failureCode: 'TOSS_PAYOUT_CONTRACT_REQUIRED',
      failureMessage: '지급대행 계약 및 JWE 보안 키 준비 전에는 지급 성공을 표시하지 않습니다.',
    },
    create: {
      id: '00000000-0000-4000-8000-000000001861',
      settlementBatchId: settlement.id,
      requestedByAdminUserId: ownerAdmin.id,
      status: 'failed',
      amount: 30000,
      failureCode: 'TOSS_PAYOUT_CONTRACT_REQUIRED',
      failureMessage: '지급대행 계약 및 JWE 보안 키 준비 전에는 지급 성공을 표시하지 않습니다.',
      rawPayloadJson: { source: 'seed', contractReady: false },
    },
  });

  const events = [
    ['00000000-0000-4000-8000-000000001871', 'report_status_changed', report.id, null, null, null, null, null, 'open', 'reviewing', '신고 검토 배정'],
    ['00000000-0000-4000-8000-000000001872', 'dispute_status_changed', null, dispute.id, null, null, null, null, 'open', 'assigned', '분쟁 담당자 배정'],
    ['00000000-0000-4000-8000-000000001873', 'payment_confirmed', null, null, paymentOrder.id, null, null, null, 'pending', 'confirmed', 'Toss 테스트 결제 승인'],
    ['00000000-0000-4000-8000-000000001874', 'payout_status_changed', null, null, null, null, settlement.id, payout.id, 'requested', 'failed', '지급대행 계약 미준비'],
  ] as const;

  for (const [id, eventType, reportId, disputeId, paymentOrderId, refundId, settlementBatchId, payoutAttemptId, fromStatus, toStatus, reason] of events) {
    await prisma.v1OpsCaseEvent.upsert({
      where: { id },
      update: {
        eventType,
        reportId,
        disputeId,
        paymentOrderId,
        refundId,
        settlementBatchId,
        payoutAttemptId,
        actorAdminUserId: ownerAdmin.id,
        fromStatus,
        toStatus,
        reason,
      },
      create: {
        id,
        eventType,
        reportId,
        disputeId,
        paymentOrderId,
        refundId,
        settlementBatchId,
        payoutAttemptId,
        actorAdminUserId: ownerAdmin.id,
        fromStatus,
        toStatus,
        reason,
      },
    });
  }
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
    ['00000000-0000-4000-8000-000000001101', 'users', 'published', '안내', '사용자 공지 커버리지'],
    ['00000000-0000-4000-8000-000000001102', 'admins', 'published', '안내', '관리자 공지 커버리지'],
    ['00000000-0000-4000-8000-000000001103', 'public', 'draft', '업데이트', '초안 공지 커버리지'],
    ['00000000-0000-4000-8000-000000001104', 'public', 'archived', '안내', '보관 공지 커버리지'],
    ['00000000-0000-4000-8000-000000001105', 'public', 'published', '고정', '이번 주 고정 공지'],
    ['00000000-0000-4000-8000-000000001106', 'public', 'published', '업데이트', '매너 점수 업데이트'],
    ['00000000-0000-4000-8000-000000001107', 'public', 'published', '안내', '비 예보 경기 안내'],
  ] as const;

  for (const [id, audience, status, category, title] of notices) {
    await prisma.v1Notice.upsert({
      where: { id },
      update: {
        audience,
        category,
        status,
        title,
        body: `${title} seed data`,
        publishedAt: status === 'published' ? seedNow : null,
        archivedAt: status === 'archived' ? seedNow : null,
      },
      create: {
        id,
        audience,
        category,
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

  for (const [index, [id, name, status, joinPolicy, trustState]] of specs.entries()) {
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

    const genderRule = index % 3 === 0 ? '여' : index % 3 === 1 ? '남' : '성별 무관';
    const levelRange = await getLevelRangeIds(sportIds.futsal, 'beginner', 'advanced');

    await prisma.v1TeamProfile.upsert({
      where: { teamId: id },
      update: { description: `${name} seed coverage`, activityNote: '상태 커버리지', skillNote: '전체 레벨', ...levelRange, genderRule },
      create: { teamId: id, description: `${name} seed coverage`, activityNote: '상태 커버리지', skillNote: '전체 레벨', ...levelRange, genderRule },
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
  const runningAllLevels = await getLevelRangeIds(sportIds.running, 'beginner', 'advanced');
  const statuses = ['recruiting', 'closed', 'cancelled', 'completed', 'archived'] as const;
  for (const [index, status] of statuses.entries()) {
    const id = `00000000-0000-4000-8000-00000000130${index + 1}`;
    const genderRule = index % 3 === 0 ? '성별 무관' : index % 3 === 1 ? '남' : '여';
    const levelRange = await getLevelRangeIds(sportIds.running, 'beginner', 'advanced');
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
        genderRule,
        ...levelRange,
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
        ...levelRange,
        genderRule,
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
      ...runningAllLevels,
      genderRule: '성별 무관',
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
      ...runningAllLevels,
      genderRule: '성별 무관',
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
  const futsalIntermediate = await getLevelRangeIds(sportIds.futsal, 'intermediate', 'intermediate');
  const statuses = ['recruiting', 'matched', 'cancelled', 'completed', 'archived'] as const;
  for (const [index, status] of statuses.entries()) {
    const id = `00000000-0000-4000-8000-00000000140${index + 1}`;
    const genderRule = index % 3 === 0 ? '여' : index % 3 === 1 ? '남' : '성별 무관';
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
        ...futsalIntermediate,
        genderRule,
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
        ...futsalIntermediate,
        genderRule,
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
      ...futsalIntermediate,
      genderRule: '성별 무관',
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
      ...futsalIntermediate,
      genderRule: '성별 무관',
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

async function seedHostChatDemoData(
  userIds: Record<string, string>,
  sportIds: Record<string, string>,
  regionId: string,
  matchId: string,
  teamMatchId: string,
  ownerTeamId: string,
) {
  const upsertParticipant = async (chatRoomId: string, userId: string, pinnedAt: Date | null = null) =>
    prisma.v1ChatRoomParticipant.upsert({
      where: { chatRoomId_userId: { chatRoomId, userId } },
      update: { status: 'active', leftAt: null, pinnedAt },
      create: { chatRoomId, userId, status: 'active', pinnedAt },
    });

  const upsertMessage = async (id: string, chatRoomId: string, senderUserId: string, body: string, sentAt: Date) =>
    prisma.v1ChatMessage.upsert({
      where: { id },
      update: { chatRoomId, senderUserId, body, status: 'sent', sentAt, hiddenAt: null, deletedAt: null },
      create: { id, chatRoomId, senderUserId, body, status: 'sent', sentAt },
    });

  const primaryMatchRoom = await prisma.v1ChatRoom.upsert({
    where: { matchId },
    update: { status: 'active', lastMessageAt: new Date('2026-05-18T09:00:00.000Z') },
    create: { matchId, status: 'active', lastMessageAt: new Date('2026-05-18T09:00:00.000Z') },
  });
  await upsertParticipant(primaryMatchRoom.id, userIds['host@teameet.v1'], seedNow);
  await upsertParticipant(primaryMatchRoom.id, userIds['applicant@teameet.v1']);
  await upsertMessage('00000000-0000-4000-8000-000000000401', primaryMatchRoom.id, userIds['applicant@teameet.v1'], '오늘 20시에 바로 시작합니다', new Date('2026-05-18T08:40:00.000Z'));
  await upsertMessage('00000000-0000-4000-8000-000000000402', primaryMatchRoom.id, userIds['host@teameet.v1'], '네, 조끼랑 물 챙겨갈게요', new Date('2026-05-18T08:52:00.000Z'));
  await upsertMessage('00000000-0000-4000-8000-000000000403', primaryMatchRoom.id, userIds['applicant@teameet.v1'], '오늘 경기 준비물 확인해 주세요', new Date('2026-05-18T09:00:00.000Z'));

  const extraMatchLevels = await getLevelRangeIds(sportIds.running, 'beginner', 'novice');
  const extraMatch = await prisma.v1Match.upsert({
    where: { id: '00000000-0000-4000-8000-000000000202' },
    update: { title: '강동 러닝 번개', status: 'recruiting', ...extraMatchLevels },
    create: {
      id: '00000000-0000-4000-8000-000000000202',
      hostUserId: userIds['host@teameet.v1'],
      sportId: sportIds.running,
      regionId,
      title: '강동 러닝 번개',
      description: '채팅 목록 확인용 v1 seed 개인매치입니다.',
      placeName: '강동 한강공원 입구',
      placeAddress: '서울 강동구',
      startAt: new Date('2026-05-24T10:00:00.000Z'),
      endAt: new Date('2026-05-24T11:00:00.000Z'),
      maxParticipants: 8,
      levelNote: '입문-초보',
      ...extraMatchLevels,
      genderRule: '여',
      costNote: '무료',
      status: 'recruiting',
      participants: {
        create: {
          userId: userIds['host@teameet.v1'],
          role: V1MatchParticipantRole.host,
          status: 'active',
          approvedAt: seedNow,
        },
      },
    },
  });
  const extraMatchRoom = await prisma.v1ChatRoom.upsert({
    where: { matchId: extraMatch.id },
    update: { status: 'active', lastMessageAt: new Date('2026-05-18T08:40:00.000Z') },
    create: { matchId: extraMatch.id, status: 'active', lastMessageAt: new Date('2026-05-18T08:40:00.000Z') },
  });
  await upsertParticipant(extraMatchRoom.id, userIds['host@teameet.v1']);
  await upsertParticipant(extraMatchRoom.id, userIds['applicant@teameet.v1']);
  await upsertMessage('00000000-0000-4000-8000-000000000421', extraMatchRoom.id, userIds['host@teameet.v1'], '오늘 페이스는 어느 정도인가요?', new Date('2026-05-18T08:20:00.000Z'));
  const extraMatchRead = await upsertMessage('00000000-0000-4000-8000-000000000422', extraMatchRoom.id, userIds['applicant@teameet.v1'], '출발은 한강공원 입구에서 해요', new Date('2026-05-18T08:30:00.000Z'));
  await upsertMessage('00000000-0000-4000-8000-000000000423', extraMatchRoom.id, userIds['host@teameet.v1'], '10분 전에 도착할게요', new Date('2026-05-18T08:40:00.000Z'));
  await prisma.v1ChatRoomParticipant.update({ where: { chatRoomId_userId: { chatRoomId: extraMatchRoom.id, userId: userIds['host@teameet.v1'] } }, data: { lastReadMessageId: extraMatchRead.id } });

  const primaryTeamMatchRoom = await prisma.v1ChatRoom.upsert({
    where: { teamMatchId },
    update: { status: 'active', lastMessageAt: new Date('2026-05-17T21:10:00.000Z') },
    create: { teamMatchId, status: 'active', lastMessageAt: new Date('2026-05-17T21:10:00.000Z') },
  });
  await upsertParticipant(primaryTeamMatchRoom.id, userIds['host@teameet.v1']);
  await upsertParticipant(primaryTeamMatchRoom.id, userIds['owner@teameet.v1']);
  await upsertMessage('00000000-0000-4000-8000-000000000411', primaryTeamMatchRoom.id, userIds['owner@teameet.v1'], '경기장 도착은 30분 전이면 됩니다', new Date('2026-05-17T20:50:00.000Z'));
  const teamMatchRead = await upsertMessage('00000000-0000-4000-8000-000000000412', primaryTeamMatchRoom.id, userIds['host@teameet.v1'], '저희는 파란색으로 맞추겠습니다', new Date('2026-05-17T21:00:00.000Z'));
  await upsertMessage('00000000-0000-4000-8000-000000000413', primaryTeamMatchRoom.id, userIds['owner@teameet.v1'], '상대팀 유니폼은 흰색입니다', new Date('2026-05-17T21:10:00.000Z'));
  await prisma.v1ChatRoomParticipant.update({ where: { chatRoomId_userId: { chatRoomId: primaryTeamMatchRoom.id, userId: userIds['host@teameet.v1'] } }, data: { lastReadMessageId: teamMatchRead.id } });

  const extraTeamMatchLevels = await getLevelRangeIds(sportIds.futsal, 'novice', 'novice');
  const extraTeamMatch = await prisma.v1TeamMatch.upsert({
    where: { id: '00000000-0000-4000-8000-000000000302' },
    update: { title: '잠실 교환매치', status: 'recruiting', ...extraTeamMatchLevels },
    create: {
      id: '00000000-0000-4000-8000-000000000302',
      hostTeamId: ownerTeamId,
      createdByUserId: userIds['owner@teameet.v1'],
      sportId: sportIds.futsal,
      regionId,
      title: '잠실 교환매치',
      description: '채팅 목록 확인용 v1 seed 팀매치입니다.',
      placeName: '잠실 풋살장',
      placeAddress: '서울 송파구',
      startAt: new Date('2026-05-25T10:00:00.000Z'),
      endAt: new Date('2026-05-25T12:00:00.000Z'),
      formatNote: '6:6',
      ...extraTeamMatchLevels,
      genderRule: '여',
      costNote: '구장비 N분의 1',
      status: 'recruiting',
    },
  });
  const extraTeamMatchRoom = await prisma.v1ChatRoom.upsert({
    where: { teamMatchId: extraTeamMatch.id },
    update: { status: 'active', lastMessageAt: new Date('2026-05-16T20:30:00.000Z') },
    create: { teamMatchId: extraTeamMatch.id, status: 'active', lastMessageAt: new Date('2026-05-16T20:30:00.000Z') },
  });
  await upsertParticipant(extraTeamMatchRoom.id, userIds['host@teameet.v1']);
  await upsertParticipant(extraTeamMatchRoom.id, userIds['owner@teameet.v1']);
  await upsertMessage('00000000-0000-4000-8000-000000000431', extraTeamMatchRoom.id, userIds['host@teameet.v1'], '교환매치 조건 확인했습니다', new Date('2026-05-16T20:10:00.000Z'));
  const extraTeamMatchRead = await upsertMessage('00000000-0000-4000-8000-000000000432', extraTeamMatchRoom.id, userIds['owner@teameet.v1'], '공은 저희가 준비하겠습니다', new Date('2026-05-16T20:20:00.000Z'));
  await upsertMessage('00000000-0000-4000-8000-000000000433', extraTeamMatchRoom.id, userIds['host@teameet.v1'], '심판 섭외는 제가 할게요', new Date('2026-05-16T20:30:00.000Z'));
  await prisma.v1ChatRoomParticipant.update({ where: { chatRoomId_userId: { chatRoomId: extraTeamMatchRoom.id, userId: userIds['host@teameet.v1'] } }, data: { lastReadMessageId: extraTeamMatchRead.id } });
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
  await seedHostMinDemoData(userIds, sportIds, regions.seoulGangnam.id, ownerTeam.id, applicantTeam.id);

  await seedChatAndNotifications(userIds, match.id, teamMatch.id);
  await seedHostChatDemoData(userIds, sportIds, regions.seoulSongpa.id, match.id, teamMatch.id, ownerTeam.id);
  await seedAdmin(userIds);
  await seedAdminOps(userIds, match.id, teamMatch.id);

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
