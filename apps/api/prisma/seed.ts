import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Users ──
  const users = await Promise.all([
    prisma.user.upsert({
      where: { nickname: '축구왕민수' },
      update: {},
      create: {
        nickname: '축구왕민수',
        email: 'minsu@test.com',
        oauthProvider: 'kakao',
        oauthId: 'kakao_minsu_001',
        gender: 'male',
        birthYear: 1995,
        bio: '풋살 좋아하는 직장인입니다',
        sportTypes: ['futsal', 'basketball'],
        locationCity: '서울',
        locationDistrict: '마포구',
        locationLat: 37.5563,
        locationLng: 126.9236,
        mannerScore: 4.2,
        totalMatches: 48,
      },
    }),
    prisma.user.upsert({
      where: { nickname: '농구러버지영' },
      update: {},
      create: {
        nickname: '농구러버지영',
        email: 'jiyoung@test.com',
        oauthProvider: 'naver',
        oauthId: 'naver_jiyoung_001',
        gender: 'female',
        birthYear: 1998,
        bio: '농구 3년차! 같이 운동해요',
        sportTypes: ['basketball', 'badminton'],
        locationCity: '서울',
        locationDistrict: '강남구',
        locationLat: 37.4979,
        locationLng: 127.0276,
        mannerScore: 4.5,
        totalMatches: 35,
      },
    }),
    prisma.user.upsert({
      where: { nickname: '하키마스터준호' },
      update: {},
      create: {
        nickname: '하키마스터준호',
        email: 'junho@test.com',
        oauthProvider: 'kakao',
        oauthId: 'kakao_junho_001',
        gender: 'male',
        birthYear: 1990,
        bio: '아이스하키 10년차 고인물',
        sportTypes: ['ice_hockey', 'futsal'],
        locationCity: '서울',
        locationDistrict: '송파구',
        locationLat: 37.5145,
        locationLng: 127.1060,
        mannerScore: 4.8,
        totalMatches: 120,
      },
    }),
    prisma.user.upsert({
      where: { nickname: '배드민턴소희' },
      update: {},
      create: {
        nickname: '배드민턴소희',
        email: 'sohee@test.com',
        oauthProvider: 'apple',
        oauthId: 'apple_sohee_001',
        gender: 'female',
        birthYear: 2000,
        bio: '배드민턴 초보인데 같이 쳐요~',
        sportTypes: ['badminton'],
        locationCity: '서울',
        locationDistrict: '서초구',
        locationLat: 37.4837,
        locationLng: 127.0324,
        mannerScore: 3.8,
        totalMatches: 12,
      },
    }),
    prisma.user.upsert({
      where: { nickname: '올라운더태현' },
      update: {},
      create: {
        nickname: '올라운더태현',
        email: 'taehyun@test.com',
        oauthProvider: 'kakao',
        oauthId: 'kakao_taehyun_001',
        gender: 'male',
        birthYear: 1993,
        bio: '다 잘하진 못하지만 다 좋아합니다',
        sportTypes: ['futsal', 'basketball', 'badminton', 'ice_hockey'],
        locationCity: '서울',
        locationDistrict: '영등포구',
        locationLat: 37.5264,
        locationLng: 126.8964,
        mannerScore: 4.0,
        totalMatches: 65,
      },
    }),
  ]);

  console.log(`  ✅ ${users.length} users created`);

  // ── Sport Profiles ──
  const profiles = [
    { userId: users[0].id, sportType: 'futsal' as const, level: 4, eloRating: 1450, preferredPositions: ['FW', 'MF'], matchCount: 38, winCount: 22, mvpCount: 8 },
    { userId: users[0].id, sportType: 'basketball' as const, level: 2, eloRating: 1050, preferredPositions: ['SG'], matchCount: 10, winCount: 4, mvpCount: 1 },
    { userId: users[1].id, sportType: 'basketball' as const, level: 3, eloRating: 1250, preferredPositions: ['PG', 'SG'], matchCount: 30, winCount: 18, mvpCount: 5 },
    { userId: users[1].id, sportType: 'badminton' as const, level: 2, eloRating: 1100, preferredPositions: ['ALL'], matchCount: 5, winCount: 2, mvpCount: 0 },
    { userId: users[2].id, sportType: 'ice_hockey' as const, level: 5, eloRating: 1800, preferredPositions: ['FW', 'C'], matchCount: 100, winCount: 62, mvpCount: 25 },
    { userId: users[2].id, sportType: 'futsal' as const, level: 3, eloRating: 1200, preferredPositions: ['DF'], matchCount: 20, winCount: 10, mvpCount: 2 },
    { userId: users[3].id, sportType: 'badminton' as const, level: 1, eloRating: 850, preferredPositions: ['ALL'], matchCount: 12, winCount: 3, mvpCount: 0 },
    { userId: users[4].id, sportType: 'futsal' as const, level: 3, eloRating: 1180, preferredPositions: ['ALL'], matchCount: 25, winCount: 12, mvpCount: 3 },
    { userId: users[4].id, sportType: 'basketball' as const, level: 3, eloRating: 1220, preferredPositions: ['PF', 'C'], matchCount: 20, winCount: 11, mvpCount: 4 },
    { userId: users[4].id, sportType: 'ice_hockey' as const, level: 2, eloRating: 980, preferredPositions: ['DF'], matchCount: 10, winCount: 3, mvpCount: 0 },
  ];

  for (const p of profiles) {
    await prisma.userSportProfile.upsert({
      where: { userId_sportType: { userId: p.userId, sportType: p.sportType } },
      update: {},
      create: p,
    });
  }
  console.log(`  ✅ ${profiles.length} sport profiles created`);

  // ── Venues ──
  const venues = await Promise.all([
    prisma.venue.create({
      data: {
        name: '마포 풋살파크',
        type: 'futsal_court',
        sportTypes: ['futsal'],
        address: '서울 마포구 월드컵북로 396',
        lat: 37.5663,
        lng: 126.9014,
        city: '서울',
        district: '마포구',
        phone: '02-300-1234',
        description: '실내 풋살장 2면, 야외 1면 보유. 주차 가능.',
        imageUrls: [],
        facilities: ['주차장', '샤워실', '탈의실', '매점'],
        operatingHours: { mon: { open: '06:00', close: '23:00' }, tue: { open: '06:00', close: '23:00' }, wed: { open: '06:00', close: '23:00' }, thu: { open: '06:00', close: '23:00' }, fri: { open: '06:00', close: '23:00' }, sat: { open: '08:00', close: '22:00' }, sun: { open: '08:00', close: '22:00' } },
        pricePerHour: 120000,
        rating: 4.3,
        reviewCount: 28,
      },
    }),
    prisma.venue.create({
      data: {
        name: '강남 스포츠센터',
        type: 'gymnasium',
        sportTypes: ['basketball', 'badminton'],
        address: '서울 강남구 테헤란로 152',
        lat: 37.5012,
        lng: 127.0396,
        city: '서울',
        district: '강남구',
        phone: '02-555-6789',
        description: '농구 코트 2면, 배드민턴 4면 운영',
        imageUrls: [],
        facilities: ['주차장', '샤워실', '탈의실', '카페', '운동기구'],
        operatingHours: { mon: { open: '07:00', close: '22:00' }, tue: { open: '07:00', close: '22:00' }, wed: { open: '07:00', close: '22:00' }, thu: { open: '07:00', close: '22:00' }, fri: { open: '07:00', close: '22:00' }, sat: { open: '09:00', close: '20:00' }, sun: { open: '09:00', close: '18:00' } },
        pricePerHour: 80000,
        rating: 4.1,
        reviewCount: 45,
      },
    }),
    prisma.venue.create({
      data: {
        name: '잠실 아이스링크',
        type: 'ice_rink',
        sportTypes: ['ice_hockey', 'figure_skating', 'short_track'],
        address: '서울 송파구 올림픽로 25',
        lat: 37.5153,
        lng: 127.0729,
        city: '서울',
        district: '송파구',
        phone: '02-410-1234',
        description: '올림픽 규격 아이스링크. 장비 대여 가능.',
        imageUrls: [],
        facilities: ['주차장', '샤워실', '장비대여', '관람석', '매점'],
        operatingHours: { mon: { open: '10:00', close: '21:00' }, tue: { open: '10:00', close: '21:00' }, wed: { open: '10:00', close: '21:00' }, thu: { open: '10:00', close: '21:00' }, fri: { open: '10:00', close: '21:00' }, sat: { open: '09:00', close: '21:00' }, sun: { open: '09:00', close: '18:00' } },
        pricePerHour: 200000,
        rating: 4.6,
        reviewCount: 18,
        iceQualityAvg: 4.4,
        rinkSubType: 'full_rink',
      },
    }),
    prisma.venue.create({
      data: {
        name: '영등포 배드민턴클럽',
        type: 'badminton_court',
        sportTypes: ['badminton'],
        address: '서울 영등포구 국제금융로 10',
        lat: 37.5254,
        lng: 126.9282,
        city: '서울',
        district: '영등포구',
        phone: '02-780-5555',
        description: '배드민턴 전용 6면 코트',
        imageUrls: [],
        facilities: ['주차장', '샤워실', '탈의실'],
        operatingHours: { mon: { open: '06:00', close: '23:00' }, tue: { open: '06:00', close: '23:00' }, wed: { open: '06:00', close: '23:00' }, thu: { open: '06:00', close: '23:00' }, fri: { open: '06:00', close: '23:00' }, sat: { open: '07:00', close: '21:00' }, sun: { open: '07:00', close: '21:00' } },
        pricePerHour: 30000,
        rating: 3.9,
        reviewCount: 12,
      },
    }),
  ]);
  console.log(`  ✅ ${venues.length} venues created`);

  // ── Matches ──
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 2);
  const nextSat = new Date(today); nextSat.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7 || 7));
  const nextSun = new Date(nextSat); nextSun.setDate(nextSat.getDate() + 1);

  const matches = await Promise.all([
    prisma.match.create({
      data: {
        hostId: users[0].id,
        sportType: 'futsal',
        title: '주말 풋살 한판! 🔥',
        description: '마포 풋살파크에서 즐거운 풋살 합시다. 초보도 환영!',
        venueId: venues[0].id,
        matchDate: nextSat,
        startTime: '18:00',
        endTime: '20:00',
        maxPlayers: 10,
        currentPlayers: 4,
        fee: 15000,
        levelMin: 2,
        levelMax: 4,
        gender: 'any',
        status: 'recruiting',
        teamConfig: { teamCount: 2, playersPerTeam: 5, autoBalance: true },
      },
    }),
    prisma.match.create({
      data: {
        hostId: users[1].id,
        sportType: 'basketball',
        title: '농구 3대3 모집 🏀',
        description: '강남 스포츠센터 농구코트에서 3:3 합니다',
        venueId: venues[1].id,
        matchDate: nextSun,
        startTime: '14:00',
        endTime: '16:00',
        maxPlayers: 6,
        currentPlayers: 3,
        fee: 12000,
        levelMin: 2,
        levelMax: 4,
        gender: 'any',
        status: 'recruiting',
        teamConfig: { teamCount: 2, playersPerTeam: 3, autoBalance: true },
      },
    }),
    prisma.match.create({
      data: {
        hostId: users[2].id,
        sportType: 'ice_hockey',
        title: '아이스하키 픽업게임 🏒',
        description: '잠실 링크에서 하키 합시다. 장비 있으신 분만!',
        venueId: venues[2].id,
        matchDate: nextSat,
        startTime: '10:00',
        endTime: '12:00',
        maxPlayers: 12,
        currentPlayers: 7,
        fee: 25000,
        levelMin: 3,
        levelMax: 5,
        gender: 'any',
        status: 'recruiting',
      },
    }),
    prisma.match.create({
      data: {
        hostId: users[3].id,
        sportType: 'badminton',
        title: '배드민턴 복식 모집 🏸',
        description: '초보끼리 재밌게 쳐요! 라켓 없어도 돼요',
        venueId: venues[3].id,
        matchDate: tomorrow,
        startTime: '19:00',
        endTime: '21:00',
        maxPlayers: 4,
        currentPlayers: 2,
        fee: 8000,
        levelMin: 1,
        levelMax: 3,
        gender: 'any',
        status: 'recruiting',
        teamConfig: { teamCount: 2, playersPerTeam: 2, autoBalance: true },
      },
    }),
    prisma.match.create({
      data: {
        hostId: users[4].id,
        sportType: 'futsal',
        title: '퇴근 후 풋살 ⚡',
        description: '영등포 근처 직장인 풋살! 가볍게 한 게임',
        venueId: venues[0].id,
        matchDate: dayAfter,
        startTime: '20:00',
        endTime: '22:00',
        maxPlayers: 10,
        currentPlayers: 6,
        fee: 15000,
        levelMin: 2,
        levelMax: 5,
        gender: 'any',
        status: 'recruiting',
      },
    }),
  ]);

  // Add participants
  for (const match of matches) {
    await prisma.matchParticipant.create({
      data: {
        matchId: match.id,
        userId: match.hostId,
        status: 'confirmed',
        paymentStatus: 'completed',
      },
    });
  }
  // Additional participants
  await prisma.matchParticipant.createMany({
    data: [
      { matchId: matches[0].id, userId: users[2].id, status: 'confirmed', paymentStatus: 'completed' },
      { matchId: matches[0].id, userId: users[4].id, status: 'confirmed', paymentStatus: 'completed' },
      { matchId: matches[0].id, userId: users[1].id, status: 'confirmed', paymentStatus: 'completed' },
      { matchId: matches[1].id, userId: users[0].id, status: 'confirmed', paymentStatus: 'completed' },
      { matchId: matches[1].id, userId: users[4].id, status: 'confirmed', paymentStatus: 'completed' },
      { matchId: matches[2].id, userId: users[0].id, status: 'confirmed', paymentStatus: 'completed' },
      { matchId: matches[2].id, userId: users[4].id, status: 'confirmed', paymentStatus: 'completed' },
      { matchId: matches[4].id, userId: users[0].id, status: 'confirmed', paymentStatus: 'completed' },
      { matchId: matches[4].id, userId: users[1].id, status: 'confirmed', paymentStatus: 'completed' },
      { matchId: matches[4].id, userId: users[2].id, status: 'confirmed', paymentStatus: 'completed' },
    ],
  });

  console.log(`  ✅ ${matches.length} matches + participants created`);

  // ── Marketplace Listings ──
  await prisma.marketplaceListing.createMany({
    data: [
      {
        sellerId: users[2].id,
        title: 'CCM 아이스하키 스틱 (우타)',
        description: '2년 사용. 상태 좋습니다. 시니어 사이즈.',
        sportType: 'ice_hockey',
        category: '하키스틱',
        condition: 'good',
        price: 80000,
        listingType: 'sell',
        status: 'active',
        imageUrls: [],
        locationCity: '서울',
        locationDistrict: '송파구',
        viewCount: 23,
        likeCount: 5,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
      {
        sellerId: users[0].id,
        title: '나이키 풋살화 265mm',
        description: '3번 착용. 사이즈 안 맞아서 판매합니다.',
        sportType: 'futsal',
        category: '풋살화',
        condition: 'like_new',
        price: 55000,
        listingType: 'sell',
        status: 'active',
        imageUrls: [],
        locationCity: '서울',
        locationDistrict: '마포구',
        viewCount: 45,
        likeCount: 12,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
      {
        sellerId: users[1].id,
        title: '요넥스 배드민턴 라켓 대여',
        description: '아크세이버 11. 하루 5천원에 대여합니다.',
        sportType: 'badminton',
        category: '라켓',
        condition: 'good',
        price: 5000,
        listingType: 'rent',
        rentalPricePerDay: 5000,
        rentalDeposit: 50000,
        status: 'active',
        imageUrls: [],
        locationCity: '서울',
        locationDistrict: '강남구',
        viewCount: 15,
        likeCount: 3,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    ],
  });
  console.log('  ✅ 3 marketplace listings created');

  // ── Lessons / 강좌 ──
  await prisma.lesson.createMany({
    data: [
      {
        hostId: users[2].id,
        sportType: 'ice_hockey',
        type: 'group_lesson',
        title: '아이스하키 기초 레슨',
        description: '스케이팅 기초부터 패스, 슈팅까지. 장비 대여 포함.',
        venueName: '잠실 아이스링크',
        venueId: venues[2].id,
        lessonDate: nextSat,
        startTime: '14:00',
        endTime: '16:00',
        maxParticipants: 8,
        currentParticipants: 3,
        fee: 35000,
        levelMin: 1,
        levelMax: 2,
        coachName: '김준호 코치',
        coachBio: '아이스하키 국가대표 출신, 지도자 자격증 보유',
        imageUrls: [],
      },
      {
        hostId: users[0].id,
        sportType: 'futsal',
        type: 'practice_match',
        title: '풋살 연습 경기',
        description: '실전 감각을 키우는 연습 경기. 피드백 포함.',
        venueName: '마포 풋살파크',
        venueId: venues[0].id,
        lessonDate: nextSun,
        startTime: '10:00',
        endTime: '12:00',
        maxParticipants: 10,
        currentParticipants: 6,
        fee: 12000,
        levelMin: 2,
        levelMax: 4,
        imageUrls: [],
      },
      {
        hostId: users[3].id,
        sportType: 'badminton',
        type: 'group_lesson',
        title: '배드민턴 입문 클래스',
        description: '라켓 잡는법부터 서브, 스매시까지!',
        venueName: '영등포 배드민턴클럽',
        venueId: venues[3].id,
        lessonDate: tomorrow,
        startTime: '18:00',
        endTime: '20:00',
        maxParticipants: 6,
        currentParticipants: 2,
        fee: 20000,
        levelMin: 1,
        levelMax: 2,
        coachName: '박소희 코치',
        coachBio: '전 실업팀 선수, 배드민턴 전문 강사',
        imageUrls: [],
      },
      {
        hostId: users[4].id,
        sportType: 'basketball',
        type: 'free_practice',
        title: '농구 자유 연습 (코트 대여)',
        description: '강남 스포츠센터 농구코트 2시간 대여. 자유롭게 연습하세요.',
        venueName: '강남 스포츠센터',
        venueId: venues[1].id,
        lessonDate: dayAfter,
        startTime: '16:00',
        endTime: '18:00',
        maxParticipants: 12,
        currentParticipants: 4,
        fee: 5000,
        levelMin: 1,
        levelMax: 5,
        imageUrls: [],
      },
    ],
  });
  console.log('  ✅ 4 lessons created');

  // ── Sport Teams ──
  await prisma.sportTeam.createMany({
    data: [
      {
        ownerId: users[2].id,
        name: '잠실 아이스베어스',
        sportType: 'ice_hockey',
        description: '송파구 기반 아이스하키 동호회. 주 1회 정기전.',
        city: '서울',
        district: '송파구',
        memberCount: 18,
        level: 4,
        isRecruiting: true,
        contactInfo: '오픈카톡: icebears2024',
      },
      {
        ownerId: users[0].id,
        name: 'FC 마포',
        sportType: 'futsal',
        description: '마포구 직장인 풋살 동호회. 매주 토요일 저녁.',
        city: '서울',
        district: '마포구',
        memberCount: 15,
        level: 3,
        isRecruiting: true,
        contactInfo: '카카오톡: fcmapo',
      },
    ],
  });
  console.log('  ✅ 2 sport teams created');

  console.log('\n🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
