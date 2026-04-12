import { createHash } from 'node:crypto';

import type {
  ItemCondition,
  LessonType,
  ListingType,
  MatchStyle,
  ParticipationType,
  SportType,
  TeamRole,
  VenueType,
} from '@prisma/client';

export const MOCK_EMAIL_DOMAIN = 'dev.matchup.mock';
export const DEV_MOCK_CATALOG_VERSION = 3;

export const MOCK_PROFILE_IMAGE_PATHS = [
  '/mock/profile/profile-01.svg',
  '/mock/profile/profile-02.svg',
  '/mock/profile/profile-03.svg',
  '/mock/profile/profile-04.svg',
  '/mock/profile/profile-05.svg',
  '/mock/profile/profile-06.svg',
  '/mock/profile/profile-07.svg',
  '/mock/profile/profile-08.svg',
  '/mock/profile/profile-09.svg',
  '/mock/profile/profile-10.svg',
  '/mock/profile/profile-11.svg',
  '/mock/profile/profile-12.svg',
] as const;

export type MockUserKey =
  | 'futsalLeader'
  | 'basketballLeader'
  | 'badmintonLeader'
  | 'iceLeader'
  | 'tennisLeader'
  | 'marketSeller'
  | 'soccerCaptain'
  | 'baseballCaptain'
  | 'volleyballCaptain'
  | 'swimmerCoach'
  | 'figureSkater'
  | 'trackCaptain';

export type MockVenueKey =
  | 'seongsanFutsalHub'
  | 'hangangHardwoodCourt'
  | 'seochoRacketStudio'
  | 'jamsilIceDome'
  | 'banpoTennisDeck'
  | 'mokdongSoccerGround'
  | 'gocheokDiamondHub'
  | 'jayangSpikeCenter'
  | 'gangdongAquaticsCenter'
  | 'taereungIceLab';

export type MockTeamKey =
  | 'seongsanStrikers'
  | 'nanjiPress'
  | 'hardwoodSixmen'
  | 'shuttleLab'
  | 'blueLine'
  | 'mokdongEleven'
  | 'gocheokSluggers'
  | 'jayangBlockers'
  | 'gangdongLanes'
  | 'taereungEdges';

export type MockMatchKey =
  | 'weekdayFutsal'
  | 'lateNightBasketball'
  | 'badmintonDoubles'
  | 'icePickup'
  | 'sunriseTennis'
  | 'dawnSoccer'
  | 'battingPractice'
  | 'volleyballRotation'
  | 'swimPaceSession'
  | 'figureEdgeSession'
  | 'shortTrackRelay';

export type MockLessonKey =
  | 'futsalClinic'
  | 'badmintonStarter'
  | 'iceTransition'
  | 'basketballFinishing'
  | 'soccerFinishing'
  | 'volleyballReceive'
  | 'swimInterval'
  | 'figureEdge';

export type MockListingKey =
  | 'futsalShoes'
  | 'basketballJersey'
  | 'badmintonRental'
  | 'goalieGlove'
  | 'tennisBag'
  | 'soccerShinGuards'
  | 'baseballBatRental'
  | 'volleyballBallGroupBuy'
  | 'swimKickboardPack'
  | 'figureBladeCase';

export type MockMercenaryKey =
  | 'futsalKeeper'
  | 'basketballWing'
  | 'iceDefense'
  | 'badmintonPartner'
  | 'soccerStriker'
  | 'baseballCatcher'
  | 'volleyballMiddle'
  | 'shortTrackPacer';

export type MockTeamMatchKey =
  | 'futsalScrimmage'
  | 'basketballChallenge'
  | 'badmintonClubDay'
  | 'soccerWeekendFriendly'
  | 'baseballSundayGame'
  | 'volleyballOpenScrim';

interface MockUserRecord {
  key: MockUserKey;
  email: string;
  nickname: string;
  profileImageUrl: string;
  gender: 'male' | 'female' | 'other';
  birthYear: number;
  bio: string;
  sportTypes: SportType[];
  locationCity: string;
  locationDistrict: string;
  locationLat: number;
  locationLng: number;
  mannerScore: number;
  totalMatches: number;
}

interface MockSportProfileRecord {
  userKey: MockUserKey;
  sportType: SportType;
  level: number;
  eloRating: number;
  preferredPositions: string[];
  matchCount: number;
  winCount: number;
  mvpCount: number;
}

interface MockVenueRecord {
  key: MockVenueKey;
  name: string;
  type: VenueType;
  sportTypes: SportType[];
  address: string;
  lat: number;
  lng: number;
  city: string;
  district: string;
  phone: string;
  description: string;
  facilities: string[];
  operatingHours: Record<string, { open: string; close: string }>;
  pricePerHour: number;
  rating: number;
  reviewCount: number;
  iceQualityAvg?: number;
  rinkSubType?: string;
}

interface MockTeamRecord {
  key: MockTeamKey;
  ownerKey: MockUserKey;
  name: string;
  sportType: SportType;
  description: string;
  city: string;
  district: string;
  level: number;
  isRecruiting: boolean;
  contactInfo: string;
  instagramUrl?: string;
  kakaoOpenChat?: string;
}

interface MockMembershipRecord {
  teamKey: MockTeamKey;
  userKey: MockUserKey;
  role: TeamRole;
}

interface MockMatchRecord {
  key: MockMatchKey;
  hostKey: MockUserKey;
  venueKey: MockVenueKey;
  sportType: SportType;
  title: string;
  description: string;
  matchDate: Date;
  startTime: string;
  endTime: string;
  maxPlayers: number;
  fee: number;
  levelMin: number;
  levelMax: number;
  gender: string;
  participantKeys: MockUserKey[];
}

interface MockLessonPlanRecord {
  name: string;
  type: 'single' | 'multi' | 'unlimited';
  price: number;
  originalPrice?: number;
  totalSessions?: number;
  validDays?: number;
  description?: string;
  sortOrder: number;
}

interface MockLessonRecord {
  key: MockLessonKey;
  hostKey: MockUserKey;
  venueKey: MockVenueKey;
  sportType: SportType;
  type: LessonType;
  title: string;
  description: string;
  lessonDate: Date;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  currentParticipants: number;
  fee: number;
  levelMin: number;
  levelMax: number;
  coachName: string;
  coachBio: string;
  coachUserKey?: MockUserKey;
  ticketPlans: MockLessonPlanRecord[];
}

interface MockListingRecord {
  key: MockListingKey;
  sellerKey: MockUserKey;
  title: string;
  description: string;
  sportType: SportType;
  category: string;
  condition: ItemCondition;
  price: number;
  listingType: ListingType;
  locationCity: string;
  locationDistrict: string;
  rentalPricePerDay?: number;
  rentalDeposit?: number;
  groupBuyTarget?: number;
  groupBuyCurrent?: number;
  groupBuyDeadline?: Date;
  viewCount: number;
  likeCount: number;
}

interface MockMercenaryRecord {
  key: MockMercenaryKey;
  teamKey: MockTeamKey;
  authorKey: MockUserKey;
  sportType: SportType;
  matchDate: Date;
  venue: string;
  position: string;
  count: number;
  level: number;
  fee: number;
  notes: string;
}

interface MockTeamMatchApplicationRecord {
  applicantTeamKey: MockTeamKey;
  status: string;
  message?: string;
  participationType: ParticipationType;
  confirmedInfo: boolean;
  confirmedLevel: boolean;
}

interface MockTeamMatchRecord {
  key: MockTeamMatchKey;
  hostTeamKey: MockTeamKey;
  sportType: SportType;
  title: string;
  description: string;
  matchDate: Date;
  startTime: string;
  endTime: string;
  totalMinutes: number;
  quarterCount: number;
  venueName: string;
  venueAddress: string;
  totalFee: number;
  opponentFee: number;
  requiredLevel: number;
  allowMercenary: boolean;
  matchStyle: MatchStyle;
  hasReferee: boolean;
  notes: string;
  skillGrade: string;
  gameFormat: string;
  matchType: string;
  uniformColor: string;
  applications: MockTeamMatchApplicationRecord[];
}

interface MockTeamBadgeRecord {
  teamKey: MockTeamKey;
  type: string;
  name: string;
  description: string;
}

function addDays(base: Date, days: number) {
  const date = new Date(base);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function getKstDateKey(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Failed to resolve KST seed date key');
  }

  return `${year}-${month}-${day}`;
}

function createKstAnchorDate(seedDateKey: string) {
  return new Date(`${seedDateKey}T00:00:00+09:00`);
}

function weekdayHours(open: string, close: string) {
  return {
    mon: { open, close },
    tue: { open, close },
    wed: { open, close },
    thu: { open, close },
    fri: { open, close },
    sat: { open: '09:00', close: '21:00' },
    sun: { open: '09:00', close: '21:00' },
  };
}

export function buildDevMockCatalog(seedDateKey = getKstDateKey()) {
  const today = createKstAnchorDate(seedDateKey);
  const in1Day = addDays(today, 1);
  const in2Days = addDays(today, 2);
  const in3Days = addDays(today, 3);
  const in4Days = addDays(today, 4);
  const in5Days = addDays(today, 5);
  const in6Days = addDays(today, 6);
  const in7Days = addDays(today, 7);
  const in9Days = addDays(today, 9);
  const in11Days = addDays(today, 11);

  const users: MockUserRecord[] = [
    {
      key: 'futsalLeader',
      email: `mock-futsal-leader@${MOCK_EMAIL_DOMAIN}`,
      nickname: '민서풋살러',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[0],
      gender: 'female',
      birthYear: 1997,
      bio: '마포/상암 기반 저녁 풋살을 즐기는 직장인입니다. 빠른 템포의 압박 플레이가 특기예요.',
      sportTypes: ['futsal', 'soccer'],
      locationCity: '서울',
      locationDistrict: '마포구',
      locationLat: 37.5637,
      locationLng: 126.9084,
      mannerScore: 4.7,
      totalMatches: 52,
    },
    {
      key: 'basketballLeader',
      email: `mock-basketball-leader@${MOCK_EMAIL_DOMAIN}`,
      nickname: '하준드리블러',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[1],
      gender: 'male',
      birthYear: 1994,
      bio: '3대3 하프코트와 필름 리뷰를 즐기는 농구 매니아입니다. 용산·이촌 기반.',
      sportTypes: ['basketball', 'volleyball'],
      locationCity: '서울',
      locationDistrict: '용산구',
      locationLat: 37.5341,
      locationLng: 126.9947,
      mannerScore: 4.5,
      totalMatches: 61,
    },
    {
      key: 'badmintonLeader',
      email: `mock-badminton-leader@${MOCK_EMAIL_DOMAIN}`,
      nickname: '서윤라켓퀸',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[2],
      gender: 'female',
      birthYear: 1998,
      bio: '클리어와 드라이브 연습을 좋아하는 배드민턴 동호인입니다. 복식 파트너 상시 환영!',
      sportTypes: ['badminton', 'tennis'],
      locationCity: '서울',
      locationDistrict: '서초구',
      locationLat: 37.4888,
      locationLng: 127.0145,
      mannerScore: 4.8,
      totalMatches: 38,
    },
    {
      key: 'iceLeader',
      email: `mock-ice-leader@${MOCK_EMAIL_DOMAIN}`,
      nickname: '유찬블루라인',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[3],
      gender: 'male',
      birthYear: 1992,
      bio: 'transition drill과 수비 로테이션에 강한 아이스하키 7년차입니다.',
      sportTypes: ['ice_hockey', 'short_track'],
      locationCity: '서울',
      locationDistrict: '송파구',
      locationLat: 37.5146,
      locationLng: 127.1058,
      mannerScore: 4.9,
      totalMatches: 87,
    },
    {
      key: 'tennisLeader',
      email: `mock-tennis-leader@${MOCK_EMAIL_DOMAIN}`,
      nickname: '지우서브에이스',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[4],
      gender: 'other',
      birthYear: 1996,
      bio: 'serve 루틴과 footwork drill을 좋아하는 테니스 동호인입니다. 복식·단식 모두 OK.',
      sportTypes: ['tennis', 'swimming'],
      locationCity: '서울',
      locationDistrict: '서초구',
      locationLat: 37.5008,
      locationLng: 127.0111,
      mannerScore: 4.6,
      totalMatches: 29,
    },
    {
      key: 'marketSeller',
      email: `mock-market-seller@${MOCK_EMAIL_DOMAIN}`,
      nickname: '도윤스포마켓',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[5],
      gender: 'male',
      birthYear: 1995,
      bio: '여러 종목 장비 거래와 팀 운영 보조를 동시에 즐기는 스포츠 올라운더입니다.',
      sportTypes: ['futsal', 'badminton', 'basketball'],
      locationCity: '서울',
      locationDistrict: '강서구',
      locationLat: 37.5588,
      locationLng: 126.8356,
      mannerScore: 4.4,
      totalMatches: 44,
    },
    {
      key: 'soccerCaptain',
      email: `mock-soccer-captain@${MOCK_EMAIL_DOMAIN}`,
      nickname: '도현센터백',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[6],
      gender: 'male',
      birthYear: 1993,
      bio: '주말 11대11 축구를 즐기는 아마추어 수비수입니다. 라인 간격 조율이 특기예요.',
      sportTypes: ['soccer', 'futsal'],
      locationCity: '서울',
      locationDistrict: '양천구',
      locationLat: 37.5164,
      locationLng: 126.8674,
      mannerScore: 4.7,
      totalMatches: 67,
    },
    {
      key: 'baseballCaptain',
      email: `mock-baseball-captain@${MOCK_EMAIL_DOMAIN}`,
      nickname: '성훈포수',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[7],
      gender: 'male',
      birthYear: 1991,
      bio: '수비 시프트와 타석 운영을 즐기는 야구 동호인입니다. 포수 포지션 전문.',
      sportTypes: ['baseball', 'basketball'],
      locationCity: '서울',
      locationDistrict: '구로구',
      locationLat: 37.4982,
      locationLng: 126.867,
      mannerScore: 4.5,
      totalMatches: 74,
    },
    {
      key: 'volleyballCaptain',
      email: `mock-volleyball-captain@${MOCK_EMAIL_DOMAIN}`,
      nickname: '예린스파이커',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[8],
      gender: 'female',
      birthYear: 1995,
      bio: '리시브 라인과 블로킹 타이밍을 세밀하게 맞추는 배구 동호인입니다.',
      sportTypes: ['volleyball', 'basketball'],
      locationCity: '서울',
      locationDistrict: '광진구',
      locationLat: 37.5452,
      locationLng: 127.1038,
      mannerScore: 4.8,
      totalMatches: 58,
    },
    {
      key: 'swimmerCoach',
      email: `mock-swimmer-coach@${MOCK_EMAIL_DOMAIN}`,
      nickname: '가은수영코치',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[9],
      gender: 'female',
      birthYear: 1990,
      bio: '페이스 유지와 기록 측정을 함께 관리하는 수영 코치입니다. 인터벌 훈련 전문.',
      sportTypes: ['swimming', 'tennis'],
      locationCity: '서울',
      locationDistrict: '강동구',
      locationLat: 37.5464,
      locationLng: 127.1423,
      mannerScore: 4.9,
      totalMatches: 93,
    },
    {
      key: 'figureSkater',
      email: `mock-figure-skater@${MOCK_EMAIL_DOMAIN}`,
      nickname: '하린엣지퀸',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[10],
      gender: 'female',
      birthYear: 2000,
      bio: '엣지 컨트롤과 안무 디테일을 연구하는 피겨스케이터입니다.',
      sportTypes: ['figure_skating', 'short_track'],
      locationCity: '서울',
      locationDistrict: '노원구',
      locationLat: 37.6335,
      locationLng: 127.0728,
      mannerScore: 4.7,
      totalMatches: 41,
    },
    {
      key: 'trackCaptain',
      email: `mock-track-captain@${MOCK_EMAIL_DOMAIN}`,
      nickname: '민규스피드',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[11],
      gender: 'male',
      birthYear: 1997,
      bio: '출발 반응과 레이스 운영을 중시하는 쇼트트랙 동호인입니다.',
      sportTypes: ['short_track', 'ice_hockey'],
      locationCity: '서울',
      locationDistrict: '노원구',
      locationLat: 37.6287,
      locationLng: 127.0784,
      mannerScore: 4.6,
      totalMatches: 64,
    },
  ];

  const sportProfiles: MockSportProfileRecord[] = [
    { userKey: 'futsalLeader', sportType: 'futsal', level: 4, eloRating: 1490, preferredPositions: ['FIXO', 'ALA'], matchCount: 41, winCount: 24, mvpCount: 7 },
    { userKey: 'basketballLeader', sportType: 'basketball', level: 4, eloRating: 1535, preferredPositions: ['PG', 'SG'], matchCount: 48, winCount: 29, mvpCount: 11 },
    { userKey: 'badmintonLeader', sportType: 'badminton', level: 3, eloRating: 1320, preferredPositions: ['DOUBLES'], matchCount: 27, winCount: 17, mvpCount: 4 },
    { userKey: 'iceLeader', sportType: 'ice_hockey', level: 5, eloRating: 1795, preferredPositions: ['DF', 'C'], matchCount: 82, winCount: 49, mvpCount: 18 },
    { userKey: 'tennisLeader', sportType: 'tennis', level: 3, eloRating: 1275, preferredPositions: ['BASELINE'], matchCount: 18, winCount: 10, mvpCount: 2 },
    { userKey: 'marketSeller', sportType: 'futsal', level: 3, eloRating: 1215, preferredPositions: ['PIVO'], matchCount: 22, winCount: 11, mvpCount: 3 },
    { userKey: 'marketSeller', sportType: 'badminton', level: 2, eloRating: 1085, preferredPositions: ['DOUBLES'], matchCount: 12, winCount: 6, mvpCount: 1 },
    { userKey: 'soccerCaptain', sportType: 'soccer', level: 4, eloRating: 1510, preferredPositions: ['CB', 'CM'], matchCount: 55, winCount: 31, mvpCount: 8 },
    { userKey: 'baseballCaptain', sportType: 'baseball', level: 4, eloRating: 1460, preferredPositions: ['C', '1B'], matchCount: 61, winCount: 35, mvpCount: 9 },
    { userKey: 'volleyballCaptain', sportType: 'volleyball', level: 4, eloRating: 1445, preferredPositions: ['OH', 'MB'], matchCount: 47, winCount: 28, mvpCount: 6 },
    { userKey: 'swimmerCoach', sportType: 'swimming', level: 5, eloRating: 1620, preferredPositions: ['FREESTYLE', 'IM'], matchCount: 79, winCount: 52, mvpCount: 14 },
    { userKey: 'figureSkater', sportType: 'figure_skating', level: 4, eloRating: 1390, preferredPositions: ['SINGLE'], matchCount: 33, winCount: 19, mvpCount: 5 },
    { userKey: 'trackCaptain', sportType: 'short_track', level: 4, eloRating: 1555, preferredPositions: ['SPRINT'], matchCount: 58, winCount: 34, mvpCount: 10 },
  ];

  const venues: MockVenueRecord[] = [
    {
      key: 'seongsanFutsalHub',
      name: '성산 풋살 허브',
      type: 'futsal_court',
      sportTypes: ['futsal', 'soccer'],
      address: '서울 마포구 성산로 48',
      lat: 37.5669,
      lng: 126.9038,
      city: '서울',
      district: '마포구',
      phone: '02-300-4040',
      description: '마포구 성산동 야간 조명과 팀 라운지를 갖춘 실내외 복합 풋살장입니다. 레인 예약 및 팀 단위 대관 가능.',
      facilities: ['주차장', '샤워실', '팀라운지', '매점'],
      operatingHours: weekdayHours('06:00', '23:00'),
      pricePerHour: 110000,
      rating: 4.6,
      reviewCount: 31,
    },
    {
      key: 'hangangHardwoodCourt',
      name: '한강 하드우드 코트',
      type: 'basketball_court',
      sportTypes: ['basketball'],
      address: '서울 용산구 이촌로 302',
      lat: 37.5209,
      lng: 126.9732,
      city: '서울',
      district: '용산구',
      phone: '02-410-5050',
      description: '용산구 이촌 한강변에 위치한 실내 하드우드 농구 코트입니다. 3대3, 5대5 모두 가능하며 라커룸을 갖추고 있습니다.',
      facilities: ['주차장', '라커룸', '샤워실', '카페'],
      operatingHours: weekdayHours('08:00', '22:00'),
      pricePerHour: 90000,
      rating: 4.4,
      reviewCount: 24,
    },
    {
      key: 'seochoRacketStudio',
      name: '서초 라켓 스튜디오',
      type: 'gymnasium',
      sportTypes: ['badminton', 'tennis'],
      address: '서울 서초구 반포대로 112',
      lat: 37.4948,
      lng: 127.0142,
      city: '서울',
      district: '서초구',
      phone: '02-520-6060',
      description: '배드민턴과 테니스를 한 공간에서 즐길 수 있는 프리미엄 라켓 복합 스튜디오입니다. 라켓 대여 및 스트링 서비스 제공.',
      facilities: ['주차장', '라켓대여', '샤워실', '스트링 서비스'],
      operatingHours: weekdayHours('07:00', '22:00'),
      pricePerHour: 70000,
      rating: 4.7,
      reviewCount: 19,
    },
    {
      key: 'jamsilIceDome',
      name: '잠실 아이스 돔',
      type: 'ice_rink',
      sportTypes: ['ice_hockey', 'figure_skating', 'short_track'],
      address: '서울 송파구 올림픽로 240',
      lat: 37.5152,
      lng: 127.0721,
      city: '서울',
      district: '송파구',
      phone: '02-424-7070',
      description: '올림픽 규격 아이스링크로 아이스하키, 피겨스케이팅, 쇼트트랙 모두 이용 가능합니다. 장비 대여 서비스와 관람석 운영.',
      facilities: ['주차장', '샤워실', '장비대여', '관람석'],
      operatingHours: weekdayHours('09:00', '21:00'),
      pricePerHour: 210000,
      rating: 4.8,
      reviewCount: 14,
      iceQualityAvg: 4.5,
      rinkSubType: 'full_rink',
    },
    {
      key: 'banpoTennisDeck',
      name: '반포 테니스 데크',
      type: 'tennis_court',
      sportTypes: ['tennis'],
      address: '서울 서초구 반포한강공원로 20',
      lat: 37.5091,
      lng: 126.9964,
      city: '서울',
      district: '서초구',
      phone: '02-590-8080',
      description: '반포 한강공원 옆 야외 테니스 코트입니다. 야간 조명을 갖춰 저녁 운동에도 적합하며 한강 뷰를 즐길 수 있습니다.',
      facilities: ['주차장', '라이트', '벤치'],
      operatingHours: weekdayHours('06:00', '22:00'),
      pricePerHour: 50000,
      rating: 4.3,
      reviewCount: 17,
    },
    {
      key: 'mokdongSoccerGround',
      name: '목동 사커 그라운드',
      type: 'soccer_field',
      sportTypes: ['soccer'],
      address: '서울 양천구 안양천로 939',
      lat: 37.5167,
      lng: 126.8678,
      city: '서울',
      district: '양천구',
      phone: '02-620-8181',
      description: '목동 안양천변 천연잔디 11인제 축구 전용 구장입니다. 야간 조명으로 저녁 경기도 가능하며 관람석을 갖추고 있습니다.',
      facilities: ['주차장', '샤워실', '벤치', '조명'],
      operatingHours: weekdayHours('06:00', '22:00'),
      pricePerHour: 145000,
      rating: 4.5,
      reviewCount: 22,
    },
    {
      key: 'gocheokDiamondHub',
      name: '고척 다이아몬드 허브',
      type: 'gymnasium',
      sportTypes: ['baseball'],
      address: '서울 구로구 경인로 430',
      lat: 37.4984,
      lng: 126.8674,
      city: '서울',
      district: '구로구',
      phone: '02-710-9191',
      description: '고척에 위치한 실내 야구 배팅 케이지와 수비 훈련 전용 복합 시설입니다. 배팅머신과 투구 분석 서비스 제공.',
      facilities: ['주차장', '배팅케이지', '라커룸', '카페'],
      operatingHours: weekdayHours('09:00', '23:00'),
      pricePerHour: 120000,
      rating: 4.4,
      reviewCount: 18,
    },
    {
      key: 'jayangSpikeCenter',
      name: '자양 스파이크 센터',
      type: 'gymnasium',
      sportTypes: ['volleyball'],
      address: '서울 광진구 뚝섬로34길 67',
      lat: 37.5379,
      lng: 127.0692,
      city: '서울',
      district: '광진구',
      phone: '02-730-6262',
      description: '광진구 자양동 배구 전용 체육관입니다. 정규 사이즈 코트 2면과 트레이닝룸을 보유하고 있습니다.',
      facilities: ['주차장', '샤워실', '볼대여', '트레이닝룸'],
      operatingHours: weekdayHours('07:00', '22:30'),
      pricePerHour: 88000,
      rating: 4.6,
      reviewCount: 26,
    },
    {
      key: 'gangdongAquaticsCenter',
      name: '강동 아쿠아틱 센터',
      type: 'swimming_pool',
      sportTypes: ['swimming'],
      address: '서울 강동구 구천면로 395',
      lat: 37.5468,
      lng: 127.1336,
      city: '서울',
      district: '강동구',
      phone: '02-840-7373',
      description: '강동구 기록 측정 장비를 갖춘 수영 전용 아쿠아틱 센터입니다. 레인 개별 예약 가능하며 인터벌 훈련 환경을 제공합니다.',
      facilities: ['주차장', '락커', '샤워실', '기록측정'],
      operatingHours: weekdayHours('05:30', '22:00'),
      pricePerHour: 76000,
      rating: 4.7,
      reviewCount: 29,
    },
    {
      key: 'taereungIceLab',
      name: '태릉 아이스 랩',
      type: 'ice_rink',
      sportTypes: ['figure_skating', 'short_track'],
      address: '서울 노원구 화랑로 727',
      lat: 37.6331,
      lng: 127.0699,
      city: '서울',
      district: '노원구',
      phone: '02-960-8484',
      description: '노원구 태릉 인근 피겨스케이팅과 쇼트트랙 전용 아이스 트레이닝 센터입니다. 날 정비 및 영상 분석 서비스 제공.',
      facilities: ['주차장', '샤워실', '날정비', '영상분석실'],
      operatingHours: weekdayHours('08:00', '21:00'),
      pricePerHour: 175000,
      rating: 4.8,
      reviewCount: 16,
      iceQualityAvg: 4.7,
      rinkSubType: 'full_rink',
    },
  ];

  const teams: MockTeamRecord[] = [
    {
      key: 'seongsanStrikers',
      ownerKey: 'futsalLeader',
      name: '성산 스트라이커즈',
      sportType: 'futsal',
      description: '성산/상암 기반 저녁 풋살 팀. 빠른 압박과 템포 유지가 강점입니다. 레벨 3~5 환영.',
      city: '서울',
      district: '마포구',
      level: 4,
      isRecruiting: true,
      contactInfo: '오픈카톡: 성산스트라이커즈',
      instagramUrl: 'https://instagram.com/seongsanstrikers',
      kakaoOpenChat: 'https://open.kakao.com/o/seongsanstrikers',
    },
    {
      key: 'nanjiPress',
      ownerKey: 'marketSeller',
      name: '난지 프레스',
      sportType: 'futsal',
      description: '난지천 야간 친선전 위주로 활동하는 풋살 팀입니다. 실력보다 매너를 중요시합니다.',
      city: '서울',
      district: '강서구',
      level: 3,
      isRecruiting: true,
      contactInfo: '오픈카톡: 난지프레스FC',
      kakaoOpenChat: 'https://open.kakao.com/o/nanjipress',
    },
    {
      key: 'hardwoodSixmen',
      ownerKey: 'basketballLeader',
      name: '하드우드 식스맨',
      sportType: 'basketball',
      description: '3대3 하프코트와 5대5 경기를 즐기는 농구 동호회입니다. 용산·이촌 기반.',
      city: '서울',
      district: '용산구',
      level: 4,
      isRecruiting: true,
      contactInfo: '인스타 DM: @hardwood.sixmen',
      instagramUrl: 'https://instagram.com/hardwood.sixmen',
    },
    {
      key: 'shuttleLab',
      ownerKey: 'badmintonLeader',
      name: '셔틀 랩',
      sportType: 'badminton',
      description: '배드민턴 드릴과 복식 로테이션 연습에 집중하는 서초 기반 라켓 동호회입니다.',
      city: '서울',
      district: '서초구',
      level: 3,
      isRecruiting: true,
      contactInfo: '카카오톡: 셔틀랩배드민턴',
    },
    {
      key: 'blueLine',
      ownerKey: 'iceLeader',
      name: '잠실 블루라인',
      sportType: 'ice_hockey',
      description: '수비 전환과 라인 체인지를 중시하는 잠실 기반 아이스하키 팀입니다. 레벨 4~5.',
      city: '서울',
      district: '송파구',
      level: 5,
      isRecruiting: false,
      contactInfo: '오픈카톡: 잠실블루라인하키',
    },
    {
      key: 'mokdongEleven',
      ownerKey: 'soccerCaptain',
      name: '목동 일레븐',
      sportType: 'soccer',
      description: '주말 11대11 교류전을 즐기는 목동 기반 아마추어 축구 팀입니다.',
      city: '서울',
      district: '양천구',
      level: 4,
      isRecruiting: true,
      contactInfo: '오픈카톡: 목동일레븐FC',
      instagramUrl: 'https://instagram.com/mokdongeleven',
    },
    {
      key: 'gocheokSluggers',
      ownerKey: 'baseballCaptain',
      name: '고척 슬러거즈',
      sportType: 'baseball',
      description: '타순 운영과 실전 배팅 위주로 활동하는 구로·고척 기반 아마추어 야구 클럽입니다.',
      city: '서울',
      district: '구로구',
      level: 4,
      isRecruiting: true,
      contactInfo: '오픈카톡: 고척슬러거즈',
    },
    {
      key: 'jayangBlockers',
      ownerKey: 'volleyballCaptain',
      name: '자양 블로커즈',
      sportType: 'volleyball',
      description: '리시브 라인과 블로킹 타이밍을 중시하는 광진구 자양동 배구 동호회입니다.',
      city: '서울',
      district: '광진구',
      level: 4,
      isRecruiting: true,
      contactInfo: '카카오톡: 자양블로커즈배구',
    },
    {
      key: 'gangdongLanes',
      ownerKey: 'swimmerCoach',
      name: '강동 레인즈',
      sportType: 'swimming',
      description: '레인 스케줄 공유와 기록 측정을 함께 하는 강동구 기반 수영 클럽입니다.',
      city: '서울',
      district: '강동구',
      level: 3,
      isRecruiting: true,
      contactInfo: '오픈카톡: 강동레인즈수영',
    },
    {
      key: 'taereungEdges',
      ownerKey: 'trackCaptain',
      name: '태릉 엣지스',
      sportType: 'short_track',
      description: '아이스 세션 운영과 페이스 컨트롤을 중시하는 태릉 기반 쇼트트랙 동호회입니다.',
      city: '서울',
      district: '노원구',
      level: 4,
      isRecruiting: true,
      contactInfo: '오픈카톡: 태릉엣지스쇼트트랙',
    },
  ];

  const memberships: MockMembershipRecord[] = [
    { teamKey: 'seongsanStrikers', userKey: 'basketballLeader', role: 'manager' },
    { teamKey: 'seongsanStrikers', userKey: 'marketSeller', role: 'member' },
    { teamKey: 'nanjiPress', userKey: 'futsalLeader', role: 'manager' },
    { teamKey: 'hardwoodSixmen', userKey: 'marketSeller', role: 'member' },
    { teamKey: 'shuttleLab', userKey: 'tennisLeader', role: 'member' },
    { teamKey: 'blueLine', userKey: 'marketSeller', role: 'member' },
    { teamKey: 'mokdongEleven', userKey: 'futsalLeader', role: 'manager' },
    { teamKey: 'gocheokSluggers', userKey: 'marketSeller', role: 'member' },
    { teamKey: 'jayangBlockers', userKey: 'basketballLeader', role: 'manager' },
    { teamKey: 'gangdongLanes', userKey: 'tennisLeader', role: 'member' },
    { teamKey: 'taereungEdges', userKey: 'figureSkater', role: 'member' },
  ];

  const matches: MockMatchRecord[] = [
    {
      key: 'weekdayFutsal',
      hostKey: 'futsalLeader',
      venueKey: 'seongsanFutsalHub',
      sportType: 'futsal',
      title: '화요일 저녁 풋살 6대6',
      description: '성산 풋살 허브에서 압박과 전환 속도를 맞추는 픽업 경기입니다. 레벨 2~4 환영!',
      matchDate: in2Days,
      startTime: '20:00',
      endTime: '22:00',
      maxPlayers: 12,
      fee: 12000,
      levelMin: 2,
      levelMax: 4,
      gender: 'any',
      participantKeys: ['futsalLeader', 'marketSeller', 'basketballLeader'],
    },
    {
      key: 'lateNightBasketball',
      hostKey: 'basketballLeader',
      venueKey: 'hangangHardwoodCourt',
      sportType: 'basketball',
      title: '심야 하프코트 3대3',
      description: '한강 하드우드 코트에서 템포와 spacing을 맞추는 3대3 경기입니다. 레벨 무관.',
      matchDate: in3Days,
      startTime: '21:00',
      endTime: '23:00',
      maxPlayers: 6,
      fee: 15000,
      levelMin: 2,
      levelMax: 5,
      gender: 'any',
      participantKeys: ['basketballLeader', 'marketSeller'],
    },
    {
      key: 'badmintonDoubles',
      hostKey: 'badmintonLeader',
      venueKey: 'seochoRacketStudio',
      sportType: 'badminton',
      title: '복식 로테이션 배드민턴',
      description: '서초 라켓 스튜디오에서 라켓 대여 가능한 배드민턴 복식 세션입니다. 입문자도 환영!',
      matchDate: in4Days,
      startTime: '19:00',
      endTime: '21:00',
      maxPlayers: 4,
      fee: 9000,
      levelMin: 1,
      levelMax: 3,
      gender: 'any',
      participantKeys: ['badmintonLeader', 'tennisLeader'],
    },
    {
      key: 'icePickup',
      hostKey: 'iceLeader',
      venueKey: 'jamsilIceDome',
      sportType: 'ice_hockey',
      title: '아이스하키 전환 훈련전',
      description: '잠실 아이스 돔에서 라인 체인지와 수비 전환 위주의 픽업 스크림입니다.',
      matchDate: in6Days,
      startTime: '18:00',
      endTime: '20:00',
      maxPlayers: 10,
      fee: 25000,
      levelMin: 3,
      levelMax: 5,
      gender: 'any',
      participantKeys: ['iceLeader'],
    },
    {
      key: 'sunriseTennis',
      hostKey: 'tennisLeader',
      venueKey: 'banpoTennisDeck',
      sportType: 'tennis',
      title: '새벽 테니스 랠리 세션',
      description: '반포 테니스 데크에서 풋워크와 서브 루틴을 집중 연습하는 새벽 랠리 모임입니다.',
      matchDate: in7Days,
      startTime: '07:00',
      endTime: '09:00',
      maxPlayers: 4,
      fee: 10000,
      levelMin: 1,
      levelMax: 3,
      gender: 'any',
      participantKeys: ['tennisLeader', 'badmintonLeader'],
    },
    {
      key: 'dawnSoccer',
      hostKey: 'soccerCaptain',
      venueKey: 'mokdongSoccerGround',
      sportType: 'soccer',
      title: '주말 새벽 축구 11대11',
      description: '목동 사커 그라운드에서 포지션 밸런스와 라인 간격을 맞추는 11대11 경기입니다.',
      matchDate: in5Days,
      startTime: '06:30',
      endTime: '08:30',
      maxPlayers: 22,
      fee: 14000,
      levelMin: 2,
      levelMax: 4,
      gender: 'any',
      participantKeys: ['soccerCaptain', 'futsalLeader'],
    },
    {
      key: 'battingPractice',
      hostKey: 'baseballCaptain',
      venueKey: 'gocheokDiamondHub',
      sportType: 'baseball',
      title: '실내 배팅 프랙티스',
      description: '고척 다이아몬드 허브 배팅 케이지에서 실전 타격과 수비 포지션 이동을 함께 연습합니다.',
      matchDate: in4Days,
      startTime: '20:30',
      endTime: '22:30',
      maxPlayers: 10,
      fee: 18000,
      levelMin: 2,
      levelMax: 5,
      gender: 'any',
      participantKeys: ['baseballCaptain', 'marketSeller'],
    },
    {
      key: 'volleyballRotation',
      hostKey: 'volleyballCaptain',
      venueKey: 'jayangSpikeCenter',
      sportType: 'volleyball',
      title: '배구 로테이션 정기 세션',
      description: '자양 스파이크 센터에서 리시브 라인과 로테이션 타이밍을 맞추는 정기 배구 모임입니다.',
      matchDate: in6Days,
      startTime: '19:30',
      endTime: '21:30',
      maxPlayers: 12,
      fee: 13000,
      levelMin: 2,
      levelMax: 4,
      gender: 'any',
      participantKeys: ['volleyballCaptain', 'basketballLeader'],
    },
    {
      key: 'swimPaceSession',
      hostKey: 'swimmerCoach',
      venueKey: 'gangdongAquaticsCenter',
      sportType: 'swimming',
      title: '수영 페이스 레인 세션',
      description: '강동 아쿠아틱 센터에서 기록 측정과 인터벌 페이스 관리를 함께 하는 레인 세션입니다.',
      matchDate: in3Days,
      startTime: '06:00',
      endTime: '07:30',
      maxPlayers: 8,
      fee: 16000,
      levelMin: 1,
      levelMax: 5,
      gender: 'any',
      participantKeys: ['swimmerCoach', 'tennisLeader'],
    },
    {
      key: 'figureEdgeSession',
      hostKey: 'figureSkater',
      venueKey: 'taereungIceLab',
      sportType: 'figure_skating',
      title: '피겨 엣지 컨트롤 세션',
      description: '태릉 아이스 랩에서 엣지 전환과 스텝 시퀀스를 집중 연습하는 피겨 세션입니다.',
      matchDate: in7Days,
      startTime: '11:00',
      endTime: '13:00',
      maxPlayers: 6,
      fee: 22000,
      levelMin: 2,
      levelMax: 4,
      gender: 'any',
      participantKeys: ['figureSkater'],
    },
    {
      key: 'shortTrackRelay',
      hostKey: 'trackCaptain',
      venueKey: 'taereungIceLab',
      sportType: 'short_track',
      title: '쇼트트랙 릴레이 런',
      description: '태릉 아이스 랩에서 스타트 반응과 릴레이 교대 타이밍을 맞추는 쇼트트랙 훈련 세션입니다.',
      matchDate: in9Days,
      startTime: '19:00',
      endTime: '21:00',
      maxPlayers: 8,
      fee: 24000,
      levelMin: 2,
      levelMax: 5,
      gender: 'any',
      participantKeys: ['trackCaptain', 'iceLeader', 'figureSkater'],
    },
  ];

  const lessons: MockLessonRecord[] = [
    {
      key: 'futsalClinic',
      hostKey: 'futsalLeader',
      venueKey: 'seongsanFutsalHub',
      sportType: 'futsal',
      type: 'clinic',
      title: '풋살 압박 전환 클리닉',
      description: '전환 수비와 2터치 패턴을 집중 훈련하는 풋살 클리닉입니다. 실전 적용 위주로 진행합니다.',
      lessonDate: in5Days,
      startTime: '19:30',
      endTime: '21:30',
      maxParticipants: 10,
      currentParticipants: 4,
      fee: 28000,
      levelMin: 2,
      levelMax: 4,
      coachName: '코치 민서',
      coachBio: '성산 풋살팀 운영 7년 경력의 풋살 코치입니다. 압박 전술과 전환 드릴 전문.',
      coachUserKey: 'futsalLeader',
      ticketPlans: [
        { name: '체험 1회권', type: 'single', price: 28000, description: '첫 참가용 단회권. 당일 결제 가능.', sortOrder: 1 },
        { name: '전환 드릴 4회권', type: 'multi', price: 96000, originalPrice: 112000, totalSessions: 4, description: '4회 연속 수강 패키지. 전환 드릴 집중 반복.', sortOrder: 2 },
      ],
    },
    {
      key: 'badmintonStarter',
      hostKey: 'badmintonLeader',
      venueKey: 'seochoRacketStudio',
      sportType: 'badminton',
      type: 'group_lesson',
      title: '배드민턴 입문 랩',
      description: '그립, 서브, 복식 로테이션을 단계별로 익히는 배드민턴 입문 클래스입니다. 라켓 대여 가능.',
      lessonDate: in3Days,
      startTime: '18:30',
      endTime: '20:00',
      maxParticipants: 8,
      currentParticipants: 3,
      fee: 22000,
      levelMin: 1,
      levelMax: 2,
      coachName: '코치 서윤',
      coachBio: '배드민턴 동호회 5년 경력. 입문자 위주 소규모 레슨 전문입니다.',
      coachUserKey: 'badmintonLeader',
      ticketPlans: [
        { name: '스타터 1회권', type: 'single', price: 22000, description: '입문자용 단회권. 라켓 대여 포함.', sortOrder: 1 },
        { name: '스타터 6회권', type: 'multi', price: 114000, originalPrice: 132000, totalSessions: 6, description: '6회 입문 패키지. 그립부터 복식 로테이션까지.', sortOrder: 2 },
      ],
    },
    {
      key: 'iceTransition',
      hostKey: 'iceLeader',
      venueKey: 'jamsilIceDome',
      sportType: 'ice_hockey',
      type: 'group_lesson',
      title: '아이스하키 전환 스케이팅',
      description: '블루라인 수비 전환과 스케이팅 자세를 집중 점검하는 아이스하키 그룹 레슨입니다.',
      lessonDate: in9Days,
      startTime: '14:00',
      endTime: '16:00',
      maxParticipants: 10,
      currentParticipants: 5,
      fee: 36000,
      levelMin: 2,
      levelMax: 4,
      coachName: '코치 유찬',
      coachBio: '아이스하키 10년차. 수비 전환 스케이팅과 라인 체인지 전문 코치입니다.',
      coachUserKey: 'iceLeader',
      ticketPlans: [
        { name: '링크 체험권', type: 'single', price: 36000, description: '장비 대여 포함 1회 체험권.', sortOrder: 1 },
        { name: '링크 3회권', type: 'multi', price: 99000, originalPrice: 108000, totalSessions: 3, description: '3회 집중 drill 패키지. 전환 스케이팅 반복.', sortOrder: 2 },
      ],
    },
    {
      key: 'basketballFinishing',
      hostKey: 'basketballLeader',
      venueKey: 'hangangHardwoodCourt',
      sportType: 'basketball',
      type: 'practice_match',
      title: '농구 피니싱 실전 랩',
      description: 'closeout 이후 피니싱과 세컨드 액션을 집중 훈련하는 농구 실전 랩입니다.',
      lessonDate: in11Days,
      startTime: '20:30',
      endTime: '22:00',
      maxParticipants: 12,
      currentParticipants: 6,
      fee: 18000,
      levelMin: 2,
      levelMax: 5,
      coachName: '코치 하준',
      coachBio: '3대3 농구 전문 코치. shot chart 분석과 피니싱 무브 지도 경력 4년.',
      coachUserKey: 'basketballLeader',
      ticketPlans: [
        { name: '실전 1회권', type: 'single', price: 18000, description: '피니싱 실전 1회권.', sortOrder: 1 },
        { name: '실전 5회권', type: 'multi', price: 81000, originalPrice: 90000, totalSessions: 5, description: '5회 반복 훈련 패키지.', sortOrder: 2 },
      ],
    },
    {
      key: 'soccerFinishing',
      hostKey: 'soccerCaptain',
      venueKey: 'mokdongSoccerGround',
      sportType: 'soccer',
      type: 'clinic',
      title: '축구 피니싱 클리닉',
      description: '박스 안 움직임과 세컨드 볼 대응을 집중 훈련하는 축구 피니싱 클리닉입니다.',
      lessonDate: in1Day,
      startTime: '19:00',
      endTime: '21:00',
      maxParticipants: 16,
      currentParticipants: 7,
      fee: 26000,
      levelMin: 2,
      levelMax: 4,
      coachName: '코치 도현',
      coachBio: '11대11 포지셔닝과 피니싱 훈련 전문 아마추어 코치입니다. 5년 경력.',
      coachUserKey: 'soccerCaptain',
      ticketPlans: [
        { name: '축구 체험권', type: 'single', price: 26000, description: '피니싱 클리닉 1회 체험권.', sortOrder: 1 },
        { name: '축구 4회권', type: 'multi', price: 94000, originalPrice: 104000, totalSessions: 4, description: '4회 피니싱 반복 패키지.', sortOrder: 2 },
      ],
    },
    {
      key: 'volleyballReceive',
      hostKey: 'volleyballCaptain',
      venueKey: 'jayangSpikeCenter',
      sportType: 'volleyball',
      type: 'group_lesson',
      title: '배구 리시브 랩',
      description: '서브 리시브와 블로킹 커버를 단계별로 익히는 배구 그룹 레슨입니다. 입문자부터 중급자까지.',
      lessonDate: in6Days,
      startTime: '18:30',
      endTime: '20:30',
      maxParticipants: 12,
      currentParticipants: 5,
      fee: 24000,
      levelMin: 1,
      levelMax: 4,
      coachName: '코치 예린',
      coachBio: '배구 로테이션과 리시브 드릴 전문 코치입니다. 동호회 코치 6년 경력.',
      coachUserKey: 'volleyballCaptain',
      ticketPlans: [
        { name: '배구 1회권', type: 'single', price: 24000, description: '리시브 랩 1회 단회권.', sortOrder: 1 },
        { name: '배구 6회권', type: 'multi', price: 126000, originalPrice: 144000, totalSessions: 6, description: '6회 리시브 드릴 패키지.', sortOrder: 2 },
      ],
    },
    {
      key: 'swimInterval',
      hostKey: 'swimmerCoach',
      venueKey: 'gangdongAquaticsCenter',
      sportType: 'swimming',
      type: 'clinic',
      title: '수영 인터벌 클리닉',
      description: '100m 인터벌과 페이스 체크를 중심으로 진행하는 수영 클리닉입니다. 기록 측정 포함.',
      lessonDate: in4Days,
      startTime: '06:30',
      endTime: '08:00',
      maxParticipants: 10,
      currentParticipants: 4,
      fee: 30000,
      levelMin: 1,
      levelMax: 5,
      coachName: '코치 가은',
      coachBio: '수영 기록 분석과 인터벌 훈련 설계 전문 코치입니다. 레인 스플릿 분석 특기.',
      coachUserKey: 'swimmerCoach',
      ticketPlans: [
        { name: '수영 1회권', type: 'single', price: 30000, description: '인터벌 클리닉 1회 단회권.', sortOrder: 1 },
        { name: '수영 8회권', type: 'multi', price: 208000, originalPrice: 240000, totalSessions: 8, description: '8회 장기 인터벌 훈련 패키지.', sortOrder: 2 },
      ],
    },
    {
      key: 'figureEdge',
      hostKey: 'figureSkater',
      venueKey: 'taereungIceLab',
      sportType: 'figure_skating',
      type: 'group_lesson',
      title: '피겨 엣지 워크숍',
      description: 'inside/outside edge와 turns를 집중 점검하는 피겨스케이팅 워크숍입니다. 소규모 운영.',
      lessonDate: in9Days,
      startTime: '15:00',
      endTime: '17:00',
      maxParticipants: 8,
      currentParticipants: 3,
      fee: 34000,
      levelMin: 1,
      levelMax: 4,
      coachName: '코치 하린',
      coachBio: '피겨스케이팅 엣지 드릴과 프로그램 구성 전문 코치입니다.',
      coachUserKey: 'figureSkater',
      ticketPlans: [
        { name: '피겨 1회권', type: 'single', price: 34000, description: '엣지 워크숍 1회 단회권.', sortOrder: 1 },
        { name: '피겨 3회권', type: 'multi', price: 93000, originalPrice: 102000, totalSessions: 3, description: '3회 엣지 집중 워크숍 패키지.', sortOrder: 2 },
      ],
    },
  ];

  const listings: MockListingRecord[] = [
    {
      key: 'futsalShoes',
      sellerKey: 'marketSeller',
      title: '인도어 풋살화 265mm',
      description: '나이키 인도어 풋살화입니다. 3회 착용. 실내 전용. 상태 매우 좋습니다.',
      sportType: 'futsal',
      category: '풋살화',
      condition: 'good',
      price: 48000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '강서구',
      viewCount: 27,
      likeCount: 8,
    },
    {
      key: 'basketballJersey',
      sellerKey: 'basketballLeader',
      title: '팀 농구 유니폼 세트 (번호 포함)',
      description: '팀 해산 후 판매합니다. 번호 인쇄본 5세트. 사이즈 M~XL 혼합.',
      sportType: 'basketball',
      category: '유니폼',
      condition: 'like_new',
      price: 68000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '용산구',
      viewCount: 34,
      likeCount: 13,
    },
    {
      key: 'badmintonRental',
      sellerKey: 'badmintonLeader',
      title: '요넥스 아크세이버 배드민턴 라켓 대여',
      description: '요넥스 아크세이버 11. 상태 양호. 하루 단위 대여 가능합니다. 보증금 있음.',
      sportType: 'badminton',
      category: '라켓',
      condition: 'good',
      price: 12000,
      listingType: 'rent',
      locationCity: '서울',
      locationDistrict: '서초구',
      rentalPricePerDay: 12000,
      rentalDeposit: 70000,
      viewCount: 18,
      likeCount: 5,
    },
    {
      key: 'goalieGlove',
      sellerKey: 'iceLeader',
      title: 'CCM 아이스하키 골리 글러브',
      description: 'CCM 골리 글러브 세트입니다. 1년 사용. 사이즈 안 맞아 판매합니다.',
      sportType: 'ice_hockey',
      category: '보호장비',
      condition: 'fair',
      price: 82000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '송파구',
      viewCount: 11,
      likeCount: 2,
    },
    {
      key: 'tennisBag',
      sellerKey: 'tennisLeader',
      title: '윌슨 테니스 라켓백 6구',
      description: '윌슨 6구 라켓백입니다. 2개월 사용. 오염 없고 깔끔한 상태입니다.',
      sportType: 'tennis',
      category: '가방',
      condition: 'like_new',
      price: 39000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '서초구',
      viewCount: 21,
      likeCount: 6,
    },
    {
      key: 'soccerShinGuards',
      sellerKey: 'soccerCaptain',
      title: '나이키 축구 신가드 세트 M사이즈',
      description: '나이키 신가드 M사이즈. 사이즈 교환 후 판매. 거의 새것 수준입니다.',
      sportType: 'soccer',
      category: '보호장비',
      condition: 'like_new',
      price: 26000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '양천구',
      viewCount: 17,
      likeCount: 4,
    },
    {
      key: 'baseballBatRental',
      sellerKey: 'baseballCaptain',
      title: '야구 배트 대여 (알루미늄)',
      description: '배팅 케이지 입문자용 알루미늄 배트입니다. 하루 단위 대여. 고척 근처 직거래 선호.',
      sportType: 'baseball',
      category: '배트',
      condition: 'good',
      price: 15000,
      listingType: 'rent',
      locationCity: '서울',
      locationDistrict: '구로구',
      rentalPricePerDay: 15000,
      rentalDeposit: 100000,
      viewCount: 23,
      likeCount: 7,
    },
    {
      key: 'volleyballBallGroupBuy',
      sellerKey: 'volleyballCaptain',
      title: '미카사 V200W 배구공 공동구매',
      description: '팀 훈련용 미카사 V200W 공동구매 진행 중입니다. 12개 모이면 주문 예정.',
      sportType: 'volleyball',
      category: '배구공',
      condition: 'new',
      price: 23000,
      listingType: 'group_buy',
      locationCity: '서울',
      locationDistrict: '광진구',
      groupBuyTarget: 12,
      groupBuyCurrent: 5,
      groupBuyDeadline: in11Days,
      viewCount: 31,
      likeCount: 10,
    },
    {
      key: 'swimKickboardPack',
      sellerKey: 'swimmerCoach',
      title: '스피도 킥보드 + 풀부이 세트',
      description: '스피도 킥보드와 풀부이 세트입니다. 6개월 사용. 상태 좋습니다.',
      sportType: 'swimming',
      category: '훈련도구',
      condition: 'good',
      price: 34000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '강동구',
      viewCount: 14,
      likeCount: 3,
    },
    {
      key: 'figureBladeCase',
      sellerKey: 'figureSkater',
      title: '잭슨 피겨스케이트 블레이드 케이스',
      description: '잭슨 블레이드 케이스입니다. 거의 새것. 사이즈 교환 후 판매. 직거래 선호.',
      sportType: 'figure_skating',
      category: '액세서리',
      condition: 'like_new',
      price: 42000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '노원구',
      viewCount: 19,
      likeCount: 5,
    },
  ];

  const mercenaryPosts: MockMercenaryRecord[] = [
    {
      key: 'futsalKeeper',
      teamKey: 'seongsanStrikers',
      authorKey: 'futsalLeader',
      sportType: 'futsal',
      matchDate: in4Days,
      venue: '성산 풋살 허브',
      position: 'GK',
      count: 1,
      level: 3,
      fee: 20000,
      notes: '킥과 리바운드 처리에 강한 골키퍼 구합니다. 도착 체크 필수. 레벨 3 이상.',
    },
    {
      key: 'basketballWing',
      teamKey: 'hardwoodSixmen',
      authorKey: 'basketballLeader',
      sportType: 'basketball',
      matchDate: in5Days,
      venue: '한강 하드우드 코트',
      position: 'Wing',
      count: 1,
      level: 4,
      fee: 15000,
      notes: '3대3 wing rotation 가능한 분 구합니다. 당일 팀 컬러 맞춰주세요.',
    },
    {
      key: 'iceDefense',
      teamKey: 'blueLine',
      authorKey: 'iceLeader',
      sportType: 'ice_hockey',
      matchDate: in7Days,
      venue: '잠실 아이스 돔',
      position: 'DF',
      count: 1,
      level: 4,
      fee: 30000,
      notes: '블루라인 수비 커버 가능한 레벨 4 이상 수비수 구합니다. 장비 지참 필수.',
    },
    {
      key: 'badmintonPartner',
      teamKey: 'shuttleLab',
      authorKey: 'badmintonLeader',
      sportType: 'badminton',
      matchDate: in6Days,
      venue: '서초 라켓 스튜디오',
      position: 'Doubles',
      count: 1,
      level: 2,
      fee: 10000,
      notes: '복식 파트너 구합니다. 라켓 대여 가능하니 장비 없어도 됩니다.',
    },
    {
      key: 'soccerStriker',
      teamKey: 'mokdongEleven',
      authorKey: 'soccerCaptain',
      sportType: 'soccer',
      matchDate: in7Days,
      venue: '목동 사커 그라운드',
      position: 'ST',
      count: 1,
      level: 3,
      fee: 25000,
      notes: '박스 안 움직임에 강한 공격수 구합니다. 경기 전날까지 라인업 확정 필요.',
    },
    {
      key: 'baseballCatcher',
      teamKey: 'gocheokSluggers',
      authorKey: 'baseballCaptain',
      sportType: 'baseball',
      matchDate: in6Days,
      venue: '고척 다이아몬드 허브',
      position: 'C',
      count: 1,
      level: 4,
      fee: 22000,
      notes: '투수와 호흡 맞출 수 있는 포수 구합니다. 포수 장비 지참 필수.',
    },
    {
      key: 'volleyballMiddle',
      teamKey: 'jayangBlockers',
      authorKey: 'volleyballCaptain',
      sportType: 'volleyball',
      matchDate: in5Days,
      venue: '자양 스파이크 센터',
      position: 'MB',
      count: 1,
      level: 3,
      fee: 18000,
      notes: '블로킹 타이밍 좋은 미들 블로커 구합니다. 로테이션 기본 이해 필요.',
    },
    {
      key: 'shortTrackPacer',
      teamKey: 'taereungEdges',
      authorKey: 'trackCaptain',
      sportType: 'short_track',
      matchDate: in9Days,
      venue: '태릉 아이스 랩',
      position: 'Pacer',
      count: 1,
      level: 4,
      fee: 26000,
      notes: '릴레이 페이스 조율 가능한 선수 구합니다. 안전 장비 착용 필수.',
    },
  ];

  const teamMatches: MockTeamMatchRecord[] = [
    {
      key: 'futsalScrimmage',
      hostTeamKey: 'seongsanStrikers',
      sportType: 'futsal',
      title: '토요일 풋살 스크림',
      description: '성산 풋살 허브에서 진행하는 6대6 친선 스크림입니다. 레벨 3 이상 팀 신청 환영.',
      matchDate: in6Days,
      startTime: '18:00',
      endTime: '20:00',
      totalMinutes: 120,
      quarterCount: 4,
      venueName: '성산 풋살 허브',
      venueAddress: '서울 마포구 성산로 48',
      totalFee: 240000,
      opponentFee: 120000,
      requiredLevel: 3,
      allowMercenary: true,
      matchStyle: 'friendly',
      hasReferee: true,
      notes: '유니폼은 블랙/화이트로 구분합니다.',
      skillGrade: 'B+',
      gameFormat: '6:6',
      matchType: 'invitation',
      uniformColor: '검정 상의',
      applications: [
        {
          applicantTeamKey: 'nanjiPress',
          status: 'pending',
          message: '빠른 압박 스타일로 친선전 희망합니다.',
          participationType: 'team',
          confirmedInfo: true,
          confirmedLevel: true,
        },
      ],
    },
    {
      key: 'basketballChallenge',
      hostTeamKey: 'hardwoodSixmen',
      sportType: 'basketball',
      title: '평일 3대3 챌린지',
      description: '한강 하드우드 코트에서 진행하는 winner stays 3대3 챌린지 매치입니다.',
      matchDate: in7Days,
      startTime: '20:00',
      endTime: '22:00',
      totalMinutes: 120,
      quarterCount: 4,
      venueName: '한강 하드우드 코트',
      venueAddress: '서울 용산구 이촌로 302',
      totalFee: 180000,
      opponentFee: 90000,
      requiredLevel: 4,
      allowMercenary: false,
      matchStyle: 'competitive',
      hasReferee: false,
      notes: 'half court, winner stays rule입니다.',
      skillGrade: 'A-',
      gameFormat: '3:3',
      matchType: 'challenge',
      uniformColor: '화이트 저지',
      applications: [],
    },
    {
      key: 'badmintonClubDay',
      hostTeamKey: 'shuttleLab',
      sportType: 'badminton',
      title: '복식 교류전 데이',
      description: '서초 라켓 스튜디오에서 진행하는 배드민턴 복식 로테이션 위주의 클럽 교류전입니다.',
      matchDate: in11Days,
      startTime: '10:00',
      endTime: '13:00',
      totalMinutes: 180,
      quarterCount: 6,
      venueName: '서초 라켓 스튜디오',
      venueAddress: '서울 서초구 반포대로 112',
      totalFee: 90000,
      opponentFee: 45000,
      requiredLevel: 2,
      allowMercenary: true,
      matchStyle: 'manner_focused',
      hasReferee: false,
      notes: '복식 로테이션 위주 교류전입니다.',
      skillGrade: 'B',
      gameFormat: '2:2',
      matchType: 'exchange',
      uniformColor: '화이트 티셔츠',
      applications: [],
    },
    {
      key: 'soccerWeekendFriendly',
      hostTeamKey: 'mokdongEleven',
      sportType: 'soccer',
      title: '주말 축구 교류전',
      description: '목동 사커 그라운드에서 진행하는 11대11 주말 친선 경기입니다. 레벨 3 이상 팀 신청.',
      matchDate: in7Days,
      startTime: '18:00',
      endTime: '20:00',
      totalMinutes: 120,
      quarterCount: 2,
      venueName: '목동 사커 그라운드',
      venueAddress: '서울 양천구 안양천로 939',
      totalFee: 300000,
      opponentFee: 150000,
      requiredLevel: 3,
      allowMercenary: true,
      matchStyle: 'friendly',
      hasReferee: true,
      notes: '라인업은 경기 전날 22시까지 확정합니다.',
      skillGrade: 'B+',
      gameFormat: '11:11',
      matchType: 'friendly',
      uniformColor: '네이비 상의',
      applications: [],
    },
    {
      key: 'baseballSundayGame',
      hostTeamKey: 'gocheokSluggers',
      sportType: 'baseball',
      title: '일요 야구 게임',
      description: '고척 다이아몬드 허브에서 선발·불펜 분업 방식으로 진행하는 9이닝 아마추어 야구 경기입니다.',
      matchDate: in11Days,
      startTime: '13:00',
      endTime: '16:00',
      totalMinutes: 180,
      quarterCount: 9,
      venueName: '고척 다이아몬드 허브',
      venueAddress: '서울 구로구 경인로 430',
      totalFee: 360000,
      opponentFee: 180000,
      requiredLevel: 3,
      allowMercenary: false,
      matchStyle: 'competitive',
      hasReferee: false,
      notes: '선발/불펜 분업 운영을 기준으로 합니다.',
      skillGrade: 'A-',
      gameFormat: '9 innings',
      matchType: 'league',
      uniformColor: '버건디 저지',
      applications: [],
    },
    {
      key: 'volleyballOpenScrim',
      hostTeamKey: 'jayangBlockers',
      sportType: 'volleyball',
      title: '배구 오픈 스크림',
      description: '자양 스파이크 센터에서 세트별 로테이션과 리시브 라인을 사전 공유하는 오픈 배구 스크림입니다.',
      matchDate: in9Days,
      startTime: '19:00',
      endTime: '21:30',
      totalMinutes: 150,
      quarterCount: 5,
      venueName: '자양 스파이크 센터',
      venueAddress: '서울 광진구 뚝섬로34길 67',
      totalFee: 160000,
      opponentFee: 80000,
      requiredLevel: 2,
      allowMercenary: true,
      matchStyle: 'manner_focused',
      hasReferee: false,
      notes: '세트별 로테이션과 리시브 라인을 사전 공유합니다.',
      skillGrade: 'B',
      gameFormat: '6:6',
      matchType: 'open',
      uniformColor: '화이트 티',
      applications: [],
    },
  ];

  const teamBadges: MockTeamBadgeRecord[] = [
    {
      teamKey: 'seongsanStrikers',
      type: 'manner_player',
      name: '매너 플레이어',
      description: '상대팀과 판정에서 항상 매너 있는 플레이를 한다고 평가받은 팀입니다.',
    },
    {
      teamKey: 'shuttleLab',
      type: 'newcomer',
      name: '신생팀',
      description: '최근 MatchUp에 새로 등록된 신생 팀입니다.',
    },
    {
      teamKey: 'blueLine',
      type: 'referee_hero',
      name: '심판 영웅',
      description: '팀 경기에서 심판 자원봉사를 자주 맡아 주는 팀입니다.',
    },
    {
      teamKey: 'mokdongEleven',
      type: 'honest_team',
      name: '정직한 팀',
      description: '라인업 공개와 경기 정보 설명이 항상 정확하고 안정적인 팀입니다.',
    },
    {
      teamKey: 'gocheokSluggers',
      type: 'punctual',
      name: '시간 약속',
      description: '집합 시간과 장비 준비가 항상 안정적인 팀입니다.',
    },
    {
      teamKey: 'gangdongLanes',
      type: 'newcomer',
      name: '신생 클럽',
      description: '최근 MatchUp에 새로 등록된 신생 수영 클럽입니다.',
    },
  ];

  return {
    seedDateKey,
    users,
    sportProfiles,
    venues,
    teams,
    memberships,
    matches,
    lessons,
    listings,
    mercenaryPosts,
    teamMatches,
    teamBadges,
  };
}

export function getDevMockCatalogChecksum(seedDateKey = getKstDateKey()) {
  const catalog = buildDevMockCatalog(seedDateKey);
  const payload = {
    version: DEV_MOCK_CATALOG_VERSION,
    catalog,
  };

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
