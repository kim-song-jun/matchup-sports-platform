import { createHash } from 'node:crypto';

import type {
  AttendanceStatus,
  ChatRoomType,
  ItemCondition,
  LessonStatus,
  LessonType,
  ListingType,
  MatchStatus,
  MatchStyle,
  MercenaryApplicationStatus,
  MercenaryPostStatus,
  NotificationType,
  OrderStatus,
  ParticipationType,
  PaymentStatus,
  ReportStatus,
  ReportTargetType,
  SettlementStatus,
  SettlementType,
  SportType,
  TeamMatchApplicationStatus,
  TeamMatchStatus,
  TeamRole,
  TicketStatus,
  TournamentStatus,
  UserRole,
  VenueType,
} from '@prisma/client';

export const MOCK_EMAIL_DOMAIN = 'dev.teameet.mock';
export const DEV_MOCK_CATALOG_VERSION = 4;

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
  | 'trackCaptain'
  | 'adminUser'
  | 'newbieA'
  | 'newbieB'
  | 'tennisPro'
  | 'soccerMidfielder'
  | 'baseballPitcher'
  | 'volleyballSetter'
  | 'swimmingRookie'
  | 'extraSeller'
  | 'fillerUser1';

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
  | 'taereungIceLab'
  | 'mapoBaseballCage';

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
  | 'taereungEdges'
  | 'emptyTeam'
  | 'banpoTennisClub'
  | 'figureStarClub';

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
  | 'shortTrackRelay'
  | 'futsalConfirmed'
  | 'basketballFull'
  | 'soccerInProgress'
  | 'tennisCompleted'
  | 'baseballCompleted'
  | 'volleyballCancelled'
  | 'swimCompleted'
  | 'iceCompleted'
  | 'badmintonCancelled'
  | 'trackCompleted';

export type MockLessonKey =
  | 'futsalClinic'
  | 'badmintonStarter'
  | 'iceTransition'
  | 'basketballFinishing'
  | 'soccerFinishing'
  | 'volleyballReceive'
  | 'swimInterval'
  | 'figureEdge'
  | 'tennisServeClinic'
  | 'baseballBattingLab'
  | 'shortTrackSprintLab'
  | 'soccerDefenseClinic';

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
  | 'figureBladeCase'
  | 'futsalGoalieKit'
  | 'basketballShoes'
  | 'tennisBallPack'
  | 'soccerCleats'
  | 'baseballGlove'
  | 'volleyballKneepad'
  | 'swimGoggles'
  | 'hockeyHelmet'
  | 'figureSkates'
  | 'trackSuit';

export type MockMercenaryKey =
  | 'futsalKeeper'
  | 'basketballWing'
  | 'iceDefense'
  | 'badmintonPartner'
  | 'soccerStriker'
  | 'baseballCatcher'
  | 'volleyballMiddle'
  | 'shortTrackPacer'
  | 'futsalForward'
  | 'basketballCenter'
  | 'tennisPartner'
  | 'soccerGoalkeeper'
  | 'baseballOutfielder'
  | 'swimmerExtra'
  | 'figurePartner';

export type MockTeamMatchKey =
  | 'futsalScrimmage'
  | 'basketballChallenge'
  | 'badmintonClubDay'
  | 'soccerWeekendFriendly'
  | 'baseballSundayGame'
  | 'volleyballOpenScrim'
  | 'iceHockeyScrim'
  | 'shortTrackDuel'
  | 'futsalCompleted'
  | 'soccerCompleted';

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
  role?: UserRole;
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
  status?: MatchStatus;
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
  status?: MercenaryPostStatus;
}

interface MockTeamMatchApplicationRecord {
  applicantTeamKey: MockTeamKey;
  status: TeamMatchApplicationStatus;
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
  status?: TeamMatchStatus;
}

interface MockTeamBadgeRecord {
  teamKey: MockTeamKey;
  type: string;
  name: string;
  description: string;
}

interface MockPaymentRecord {
  id: string;
  orderId: string;
  matchKey: MockMatchKey;
  payerKey: MockUserKey;
  amount: number;
  status: PaymentStatus;
}

interface MockMarketplaceOrderRecord {
  orderId: string;
  listingKey: MockListingKey;
  buyerKey: MockUserKey;
  sellerKey: MockUserKey;
  amount: number;
  status: OrderStatus;
}

interface MockMercenaryApplicationRecord {
  postKey: MockMercenaryKey;
  applicantKey: MockUserKey;
  status: MercenaryApplicationStatus;
  message: string;
}

interface MockLessonScheduleRecord {
  lessonKey: MockLessonKey;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  maxParticipants: number;
}

interface MockLessonTicketRecord {
  id: string;
  lessonKey: MockLessonKey;
  ownerKey: MockUserKey;
  planName: string;
  status: TicketStatus;
  usedSessions?: number;
  paidAmount: number;
  expiresAt?: Date;
}

interface MockLessonAttendanceRecord {
  lessonKey: MockLessonKey;
  sessionDate: Date;
  userKey: MockUserKey;
  ticketId: string;
  status: AttendanceStatus;
}

interface MockChatRoomRecord {
  key: string;
  type: ChatRoomType;
  participantKeys: MockUserKey[];
  teamMatchKey?: MockTeamMatchKey;
  messageCount: number;
}

interface MockVenueReviewRecord {
  venueKey: MockVenueKey;
  authorKey: MockUserKey;
  rating: number;
  facilityRating: number;
  accessRating: number;
  costRating: number;
  comment: string;
}

interface MockMatchReviewRecord {
  matchKey: MockMatchKey;
  authorKey: MockUserKey;
  targetKey: MockUserKey;
  mannerRating: number;
  skillRating: number;
  comment: string;
}

interface MockNotificationRecord {
  recipientKey: MockUserKey;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
}

interface MockTournamentRecord {
  title: string;
  organizerKey: MockUserKey;
  sportType: SportType;
  status: TournamentStatus;
  startDate: Date;
  endDate: Date;
  maxParticipants: number;
  currentParticipants: number;
  entryFee: number;
  description: string;
}

interface MockSettlementRecord {
  sourceId: string;
  type: SettlementType;
  amount: number;
  commission: number;
  netAmount: number;
  status: SettlementStatus;
  recipientKey: MockUserKey;
}

interface MockReportRecord {
  reporterKey: MockUserKey;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  status: ReportStatus;
}

interface MockUserBadgeRecord {
  userKey: MockUserKey;
  type: string;
  name: string;
  description: string;
}

interface MockTeamTrustScoreRecord {
  teamKey: MockTeamKey;
  selfLevel: number;
  mannerScore: number;
  lateRate: number;
  noShowRate: number;
  cancelRate: number;
  totalMatches: number;
  totalWins: number;
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
  const past3Days = addDays(today, -3);
  const past7Days = addDays(today, -7);
  const past14Days = addDays(today, -14);
  const past21Days = addDays(today, -21);

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
    {
      key: 'adminUser',
      email: `mock-admin@${MOCK_EMAIL_DOMAIN}`,
      nickname: '매치업관리자',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[0],
      gender: 'male',
      birthYear: 1988,
      bio: '플랫폼 운영 담당 관리자입니다.',
      sportTypes: ['futsal'],
      locationCity: '서울',
      locationDistrict: '강남구',
      locationLat: 37.498,
      locationLng: 127.028,
      mannerScore: 5.0,
      totalMatches: 0,
      role: 'admin',
    },
    {
      key: 'newbieA',
      email: `mock-newbie-a@${MOCK_EMAIL_DOMAIN}`,
      nickname: '뉴비사용자A',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[1],
      gender: 'male',
      birthYear: 2002,
      bio: '스포츠를 막 시작한 초보입니다.',
      sportTypes: ['futsal'],
      locationCity: '서울',
      locationDistrict: '마포구',
      locationLat: 37.561,
      locationLng: 126.909,
      mannerScore: 4.0,
      totalMatches: 0,
    },
    {
      key: 'newbieB',
      email: `mock-newbie-b@${MOCK_EMAIL_DOMAIN}`,
      nickname: '뉴비사용자B',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[2],
      gender: 'female',
      birthYear: 2001,
      bio: '배드민턴에 관심 생긴 사회초년생입니다.',
      sportTypes: ['badminton'],
      locationCity: '서울',
      locationDistrict: '서초구',
      locationLat: 37.487,
      locationLng: 127.014,
      mannerScore: 4.1,
      totalMatches: 0,
    },
    {
      key: 'tennisPro',
      email: `mock-tennis-pro@${MOCK_EMAIL_DOMAIN}`,
      nickname: '준호포핸드',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[3],
      gender: 'male',
      birthYear: 1993,
      bio: '포핸드 드라이브와 서브 리턴을 연구하는 테니스 동호인입니다.',
      sportTypes: ['tennis'],
      locationCity: '서울',
      locationDistrict: '서초구',
      locationLat: 37.503,
      locationLng: 127.012,
      mannerScore: 4.5,
      totalMatches: 22,
    },
    {
      key: 'soccerMidfielder',
      email: `mock-soccer-midfielder@${MOCK_EMAIL_DOMAIN}`,
      nickname: '현수미드필더',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[4],
      gender: 'male',
      birthYear: 1996,
      bio: '빌드업과 압박 수비를 즐기는 축구 미드필더입니다.',
      sportTypes: ['soccer', 'futsal'],
      locationCity: '서울',
      locationDistrict: '양천구',
      locationLat: 37.518,
      locationLng: 126.866,
      mannerScore: 4.6,
      totalMatches: 35,
    },
    {
      key: 'baseballPitcher',
      email: `mock-baseball-pitcher@${MOCK_EMAIL_DOMAIN}`,
      nickname: '재원투수',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[5],
      gender: 'male',
      birthYear: 1994,
      bio: '직구와 변화구 조합으로 타자를 공략하는 아마추어 투수입니다.',
      sportTypes: ['baseball'],
      locationCity: '서울',
      locationDistrict: '구로구',
      locationLat: 37.496,
      locationLng: 126.868,
      mannerScore: 4.3,
      totalMatches: 28,
    },
    {
      key: 'volleyballSetter',
      email: `mock-volleyball-setter@${MOCK_EMAIL_DOMAIN}`,
      nickname: '소연세터',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[6],
      gender: 'female',
      birthYear: 1998,
      bio: '토스 안정성과 속공 운영을 중시하는 배구 세터입니다.',
      sportTypes: ['volleyball'],
      locationCity: '서울',
      locationDistrict: '광진구',
      locationLat: 37.547,
      locationLng: 127.072,
      mannerScore: 4.7,
      totalMatches: 42,
    },
    {
      key: 'swimmingRookie',
      email: `mock-swimming-rookie@${MOCK_EMAIL_DOMAIN}`,
      nickname: '태양수영입문',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[7],
      gender: 'male',
      birthYear: 2000,
      bio: '자유형과 배영을 막 익히고 있는 수영 입문자입니다.',
      sportTypes: ['swimming'],
      locationCity: '서울',
      locationDistrict: '강동구',
      locationLat: 37.545,
      locationLng: 127.139,
      mannerScore: 4.2,
      totalMatches: 8,
    },
    {
      key: 'extraSeller',
      email: `mock-extra-seller@${MOCK_EMAIL_DOMAIN}`,
      nickname: '나라스포마트',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[8],
      gender: 'female',
      birthYear: 1992,
      bio: '다양한 종목 중고 장비를 판매하는 스포츠 마켓 운영자입니다.',
      sportTypes: ['tennis', 'badminton'],
      locationCity: '서울',
      locationDistrict: '서초구',
      locationLat: 37.491,
      locationLng: 127.016,
      mannerScore: 4.4,
      totalMatches: 17,
    },
    {
      key: 'fillerUser1',
      email: `mock-filler-user1@${MOCK_EMAIL_DOMAIN}`,
      nickname: '도경스포러',
      profileImageUrl: MOCK_PROFILE_IMAGE_PATHS[9],
      gender: 'male',
      birthYear: 1999,
      bio: '여러 종목을 가볍게 즐기는 스포츠 생활인입니다.',
      sportTypes: ['basketball', 'volleyball'],
      locationCity: '서울',
      locationDistrict: '용산구',
      locationLat: 37.532,
      locationLng: 126.992,
      mannerScore: 4.3,
      totalMatches: 15,
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
    { userKey: 'tennisPro', sportType: 'tennis', level: 4, eloRating: 1420, preferredPositions: ['BASELINE', 'SERVE_VOLLEY'], matchCount: 18, winCount: 12, mvpCount: 4 },
    { userKey: 'soccerMidfielder', sportType: 'soccer', level: 3, eloRating: 1340, preferredPositions: ['CM', 'CAM'], matchCount: 28, winCount: 16, mvpCount: 3 },
    { userKey: 'soccerMidfielder', sportType: 'futsal', level: 3, eloRating: 1280, preferredPositions: ['ALA'], matchCount: 14, winCount: 8, mvpCount: 1 },
    { userKey: 'baseballPitcher', sportType: 'baseball', level: 4, eloRating: 1470, preferredPositions: ['SP', 'RP'], matchCount: 24, winCount: 15, mvpCount: 5 },
    { userKey: 'volleyballSetter', sportType: 'volleyball', level: 4, eloRating: 1410, preferredPositions: ['S'], matchCount: 36, winCount: 22, mvpCount: 6 },
    { userKey: 'swimmingRookie', sportType: 'swimming', level: 1, eloRating: 900, preferredPositions: ['FREESTYLE'], matchCount: 6, winCount: 2, mvpCount: 0 },
    { userKey: 'extraSeller', sportType: 'tennis', level: 2, eloRating: 1120, preferredPositions: ['DOUBLES'], matchCount: 12, winCount: 6, mvpCount: 1 },
    { userKey: 'extraSeller', sportType: 'badminton', level: 2, eloRating: 1050, preferredPositions: ['DOUBLES'], matchCount: 9, winCount: 4, mvpCount: 0 },
    { userKey: 'fillerUser1', sportType: 'basketball', level: 2, eloRating: 1100, preferredPositions: ['SF'], matchCount: 10, winCount: 5, mvpCount: 0 },
    { userKey: 'fillerUser1', sportType: 'volleyball', level: 2, eloRating: 1060, preferredPositions: ['OH'], matchCount: 8, winCount: 4, mvpCount: 0 },
    { userKey: 'iceLeader', sportType: 'short_track', level: 4, eloRating: 1510, preferredPositions: ['RELAY'], matchCount: 22, winCount: 13, mvpCount: 4 },
    { userKey: 'figureSkater', sportType: 'short_track', level: 3, eloRating: 1240, preferredPositions: ['SPRINT'], matchCount: 15, winCount: 8, mvpCount: 2 },
    { userKey: 'tennisLeader', sportType: 'swimming', level: 2, eloRating: 1070, preferredPositions: ['FREESTYLE'], matchCount: 8, winCount: 3, mvpCount: 0 },
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
    {
      key: 'mapoBaseballCage',
      name: '마포 베이스볼 케이지',
      type: 'gymnasium',
      sportTypes: ['baseball'],
      address: '서울 마포구 월드컵로 85',
      lat: 37.5598,
      lng: 126.9091,
      city: '서울',
      district: '마포구',
      phone: '02-320-5500',
      description: '마포구 소재 실내 야구 배팅 케이지 전용 시설입니다. 신규 오픈으로 아직 리뷰가 없습니다.',
      facilities: ['주차장', '배팅케이지', '라커룸'],
      operatingHours: weekdayHours('10:00', '22:00'),
      pricePerHour: 100000,
      rating: 0,
      reviewCount: 0,
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
    {
      key: 'emptyTeam',
      ownerKey: 'newbieA',
      name: '빈팀테스트',
      sportType: 'futsal',
      description: '멤버가 없는 신규 팀 (페이지네이션 경계 테스트용).',
      city: '서울',
      district: '마포구',
      level: 1,
      isRecruiting: true,
      contactInfo: '카카오톡 문의',
    },
    {
      key: 'banpoTennisClub',
      ownerKey: 'tennisPro',
      name: '반포 테니스 클럽',
      sportType: 'tennis',
      description: '반포 한강공원 테니스 코트를 중심으로 활동하는 테니스 동호회입니다.',
      city: '서울',
      district: '서초구',
      level: 3,
      isRecruiting: true,
      contactInfo: '인스타 DM: @banpo.tennis',
      instagramUrl: 'https://instagram.com/banpo.tennis',
    },
    {
      key: 'figureStarClub',
      ownerKey: 'figureSkater',
      name: '피겨 스타 클럽',
      sportType: 'figure_skating',
      description: '태릉을 중심으로 피겨스케이팅 엣지와 안무를 함께 연구하는 소규모 동호회입니다.',
      city: '서울',
      district: '노원구',
      level: 4,
      isRecruiting: false,
      contactInfo: '오픈카톡: 피겨스타클럽',
    },
  ];

  const memberships: MockMembershipRecord[] = [
    { teamKey: 'seongsanStrikers', userKey: 'basketballLeader', role: 'manager' },
    { teamKey: 'seongsanStrikers', userKey: 'marketSeller', role: 'member' },
    { teamKey: 'seongsanStrikers', userKey: 'soccerMidfielder', role: 'member' },
    { teamKey: 'nanjiPress', userKey: 'futsalLeader', role: 'manager' },
    { teamKey: 'nanjiPress', userKey: 'fillerUser1', role: 'member' },
    { teamKey: 'hardwoodSixmen', userKey: 'marketSeller', role: 'member' },
    { teamKey: 'hardwoodSixmen', userKey: 'fillerUser1', role: 'member' },
    { teamKey: 'shuttleLab', userKey: 'tennisLeader', role: 'member' },
    { teamKey: 'shuttleLab', userKey: 'extraSeller', role: 'member' },
    { teamKey: 'blueLine', userKey: 'marketSeller', role: 'member' },
    { teamKey: 'blueLine', userKey: 'trackCaptain', role: 'member' },
    { teamKey: 'mokdongEleven', userKey: 'futsalLeader', role: 'manager' },
    { teamKey: 'mokdongEleven', userKey: 'soccerMidfielder', role: 'member' },
    { teamKey: 'gocheokSluggers', userKey: 'marketSeller', role: 'member' },
    { teamKey: 'gocheokSluggers', userKey: 'baseballPitcher', role: 'member' },
    { teamKey: 'jayangBlockers', userKey: 'basketballLeader', role: 'manager' },
    { teamKey: 'jayangBlockers', userKey: 'volleyballSetter', role: 'member' },
    { teamKey: 'gangdongLanes', userKey: 'tennisLeader', role: 'member' },
    { teamKey: 'gangdongLanes', userKey: 'swimmingRookie', role: 'member' },
    { teamKey: 'taereungEdges', userKey: 'figureSkater', role: 'member' },
    { teamKey: 'banpoTennisClub', userKey: 'tennisLeader', role: 'member' },
    { teamKey: 'banpoTennisClub', userKey: 'extraSeller', role: 'member' },
    { teamKey: 'figureStarClub', userKey: 'trackCaptain', role: 'member' },
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
    {
      key: 'futsalConfirmed',
      hostKey: 'futsalLeader',
      venueKey: 'seongsanFutsalHub',
      sportType: 'futsal',
      title: '확정된 풋살 6대6',
      description: '참가자가 확정된 풋살 경기입니다.',
      matchDate: in1Day,
      startTime: '18:00',
      endTime: '20:00',
      maxPlayers: 12,
      fee: 12000,
      levelMin: 2,
      levelMax: 4,
      gender: 'any',
      participantKeys: ['futsalLeader', 'marketSeller', 'basketballLeader', 'soccerMidfielder', 'fillerUser1', 'soccerCaptain'],
      status: 'confirmed',
    },
    {
      key: 'basketballFull',
      hostKey: 'basketballLeader',
      venueKey: 'hangangHardwoodCourt',
      sportType: 'basketball',
      title: '만원 농구 3대3',
      description: '이미 정원이 찬 농구 경기입니다.',
      matchDate: in2Days,
      startTime: '20:00',
      endTime: '22:00',
      maxPlayers: 6,
      fee: 15000,
      levelMin: 3,
      levelMax: 5,
      gender: 'any',
      participantKeys: ['basketballLeader', 'marketSeller', 'fillerUser1', 'soccerCaptain', 'soccerMidfielder', 'baseballCaptain'],
      status: 'full',
    },
    {
      key: 'soccerInProgress',
      hostKey: 'soccerCaptain',
      venueKey: 'mokdongSoccerGround',
      sportType: 'soccer',
      title: '진행 중 축구 11대11',
      description: '현재 진행 중인 축구 경기입니다.',
      matchDate: today,
      startTime: '10:00',
      endTime: '12:00',
      maxPlayers: 22,
      fee: 14000,
      levelMin: 2,
      levelMax: 4,
      gender: 'any',
      participantKeys: ['soccerCaptain', 'futsalLeader', 'soccerMidfielder', 'baseballCaptain', 'marketSeller'],
      status: 'in_progress',
    },
    {
      key: 'tennisCompleted',
      hostKey: 'tennisLeader',
      venueKey: 'banpoTennisDeck',
      sportType: 'tennis',
      title: '완료된 테니스 복식',
      description: '이미 완료된 테니스 복식 경기입니다.',
      matchDate: past7Days,
      startTime: '09:00',
      endTime: '11:00',
      maxPlayers: 4,
      fee: 10000,
      levelMin: 2,
      levelMax: 4,
      gender: 'any',
      participantKeys: ['tennisLeader', 'tennisPro', 'extraSeller', 'badmintonLeader'],
      status: 'completed',
    },
    {
      key: 'baseballCompleted',
      hostKey: 'baseballCaptain',
      venueKey: 'gocheokDiamondHub',
      sportType: 'baseball',
      title: '완료된 야구 배팅',
      description: '이미 완료된 야구 배팅 세션입니다.',
      matchDate: past14Days,
      startTime: '19:00',
      endTime: '21:00',
      maxPlayers: 10,
      fee: 18000,
      levelMin: 2,
      levelMax: 5,
      gender: 'any',
      participantKeys: ['baseballCaptain', 'baseballPitcher', 'marketSeller', 'fillerUser1'],
      status: 'completed',
    },
    {
      key: 'volleyballCancelled',
      hostKey: 'volleyballCaptain',
      venueKey: 'jayangSpikeCenter',
      sportType: 'volleyball',
      title: '취소된 배구 세션',
      description: '취소된 배구 정기 세션입니다.',
      matchDate: past3Days,
      startTime: '19:00',
      endTime: '21:00',
      maxPlayers: 12,
      fee: 13000,
      levelMin: 2,
      levelMax: 4,
      gender: 'any',
      participantKeys: ['volleyballCaptain', 'volleyballSetter'],
      status: 'cancelled',
    },
    {
      key: 'swimCompleted',
      hostKey: 'swimmerCoach',
      venueKey: 'gangdongAquaticsCenter',
      sportType: 'swimming',
      title: '완료된 수영 인터벌',
      description: '이미 완료된 수영 인터벌 세션입니다.',
      matchDate: past21Days,
      startTime: '06:00',
      endTime: '07:30',
      maxPlayers: 8,
      fee: 16000,
      levelMin: 1,
      levelMax: 5,
      gender: 'any',
      participantKeys: ['swimmerCoach', 'swimmingRookie', 'tennisLeader'],
      status: 'completed',
    },
    {
      key: 'iceCompleted',
      hostKey: 'iceLeader',
      venueKey: 'jamsilIceDome',
      sportType: 'ice_hockey',
      title: '완료된 아이스하키 훈련전',
      description: '이미 완료된 아이스하키 픽업 게임입니다.',
      matchDate: past7Days,
      startTime: '17:00',
      endTime: '19:00',
      maxPlayers: 10,
      fee: 25000,
      levelMin: 3,
      levelMax: 5,
      gender: 'any',
      participantKeys: ['iceLeader', 'trackCaptain', 'figureSkater'],
      status: 'completed',
    },
    {
      key: 'badmintonCancelled',
      hostKey: 'badmintonLeader',
      venueKey: 'seochoRacketStudio',
      sportType: 'badminton',
      title: '취소된 배드민턴 복식',
      description: '취소된 배드민턴 복식 세션입니다.',
      matchDate: past3Days,
      startTime: '18:00',
      endTime: '20:00',
      maxPlayers: 4,
      fee: 9000,
      levelMin: 1,
      levelMax: 3,
      gender: 'any',
      participantKeys: ['badmintonLeader'],
      status: 'cancelled',
    },
    {
      key: 'trackCompleted',
      hostKey: 'trackCaptain',
      venueKey: 'taereungIceLab',
      sportType: 'short_track',
      title: '완료된 쇼트트랙 스프린트',
      description: '이미 완료된 쇼트트랙 스프린트 훈련입니다.',
      matchDate: past14Days,
      startTime: '18:00',
      endTime: '20:00',
      maxPlayers: 8,
      fee: 24000,
      levelMin: 2,
      levelMax: 5,
      gender: 'any',
      participantKeys: ['trackCaptain', 'figureSkater', 'iceLeader'],
      status: 'completed',
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
      key: 'tennisServeClinic',
      hostKey: 'tennisPro',
      venueKey: 'banpoTennisDeck',
      sportType: 'tennis',
      type: 'clinic',
      title: '테니스 서브 클리닉',
      description: '플랫 서브와 킥 서브를 단계별로 익히는 테니스 서브 전문 클리닉입니다.',
      lessonDate: in4Days,
      startTime: '08:00',
      endTime: '10:00',
      maxParticipants: 8,
      currentParticipants: 3,
      fee: 25000,
      levelMin: 1,
      levelMax: 3,
      coachName: '코치 준호',
      coachBio: '테니스 서브 전문 레슨 경력 3년. 플랫과 킥 서브 지도 전문.',
      coachUserKey: 'tennisPro',
      ticketPlans: [
        { name: '서브 1회권', type: 'single', price: 25000, description: '서브 클리닉 1회 단회권.', sortOrder: 1 },
        { name: '서브 4회권', type: 'multi', price: 88000, originalPrice: 100000, totalSessions: 4, description: '4회 서브 반복 패키지.', sortOrder: 2 },
      ],
    },
    {
      key: 'baseballBattingLab',
      hostKey: 'baseballCaptain',
      venueKey: 'gocheokDiamondHub',
      sportType: 'baseball',
      type: 'clinic',
      title: '야구 배팅 랩',
      description: '스탠스와 임팩트 포인트를 집중 교정하는 야구 배팅 전문 클리닉입니다.',
      lessonDate: in7Days,
      startTime: '18:00',
      endTime: '20:00',
      maxParticipants: 8,
      currentParticipants: 4,
      fee: 32000,
      levelMin: 1,
      levelMax: 5,
      coachName: '코치 성훈',
      coachBio: '포수 출신 배팅 전문 코치. 스탠스 교정과 타격 반복 연습 전문.',
      coachUserKey: 'baseballCaptain',
      ticketPlans: [
        { name: '배팅 1회권', type: 'single', price: 32000, description: '배팅 랩 1회 단회권.', sortOrder: 1 },
        { name: '배팅 3회권', type: 'multi', price: 87000, originalPrice: 96000, totalSessions: 3, description: '3회 집중 배팅 패키지.', sortOrder: 2 },
      ],
    },
    {
      key: 'shortTrackSprintLab',
      hostKey: 'trackCaptain',
      venueKey: 'taereungIceLab',
      sportType: 'short_track',
      type: 'clinic',
      title: '쇼트트랙 스프린트 랩',
      description: '출발 반응과 코너 드라이빙을 집중 훈련하는 쇼트트랙 스프린트 클리닉입니다.',
      lessonDate: in11Days,
      startTime: '09:00',
      endTime: '11:00',
      maxParticipants: 6,
      currentParticipants: 2,
      fee: 38000,
      levelMin: 2,
      levelMax: 5,
      coachName: '코치 민규',
      coachBio: '쇼트트랙 스프린트 훈련 전문 코치. 반응 속도와 코너 드라이빙 지도 경력 5년.',
      coachUserKey: 'trackCaptain',
      ticketPlans: [
        { name: '스프린트 1회권', type: 'single', price: 38000, description: '스프린트 랩 1회 단회권.', sortOrder: 1 },
        { name: '스프린트 5회권', type: 'multi', price: 170000, originalPrice: 190000, totalSessions: 5, description: '5회 집중 스프린트 패키지.', sortOrder: 2 },
      ],
    },
    {
      key: 'soccerDefenseClinic',
      hostKey: 'soccerCaptain',
      venueKey: 'mokdongSoccerGround',
      sportType: 'soccer',
      type: 'clinic',
      title: '축구 수비 클리닉',
      description: '포지셔닝과 1대1 수비 대응을 집중 훈련하는 축구 수비 전문 클리닉입니다.',
      lessonDate: in3Days,
      startTime: '07:00',
      endTime: '09:00',
      maxParticipants: 16,
      currentParticipants: 8,
      fee: 24000,
      levelMin: 2,
      levelMax: 4,
      coachName: '코치 도현',
      coachBio: '수비 포지셔닝과 1대1 대응 전문 코치. 11대11 수비 전술 경력 6년.',
      coachUserKey: 'soccerCaptain',
      ticketPlans: [
        { name: '수비 1회권', type: 'single', price: 24000, description: '수비 클리닉 1회 단회권.', sortOrder: 1 },
        { name: '수비 4회권', type: 'multi', price: 86000, originalPrice: 96000, totalSessions: 4, description: '4회 수비 전술 반복 패키지.', sortOrder: 2 },
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
    {
      key: 'futsalGoalieKit',
      sellerKey: 'extraSeller',
      title: '풋살 골키퍼 장갑 세트',
      description: '나이키 골키퍼 글러브 (라텍스 팜) + 파울러 보호대 세트입니다. 5회 사용.',
      sportType: 'futsal',
      category: '장갑',
      condition: 'good',
      price: 38000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '서초구',
      viewCount: 12,
      likeCount: 3,
    },
    {
      key: 'basketballShoes',
      sellerKey: 'fillerUser1',
      title: '나이키 레브론 20 농구화 280mm',
      description: '나이키 레브론 20. 2개월 착용. 실내 전용. 상태 양호합니다.',
      sportType: 'basketball',
      category: '농구화',
      condition: 'good',
      price: 78000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '용산구',
      viewCount: 45,
      likeCount: 16,
    },
    {
      key: 'tennisBallPack',
      sellerKey: 'extraSeller',
      title: '윌슨 챔피언십 테니스공 12개 공동구매',
      description: '윌슨 챔피언십 테니스볼 12개 공동구매입니다. 클럽원 우선 신청 가능.',
      sportType: 'tennis',
      category: '테니스공',
      condition: 'new',
      price: 8000,
      listingType: 'group_buy',
      locationCity: '서울',
      locationDistrict: '서초구',
      groupBuyTarget: 10,
      groupBuyCurrent: 4,
      groupBuyDeadline: in7Days,
      viewCount: 22,
      likeCount: 7,
    },
    {
      key: 'soccerCleats',
      sellerKey: 'soccerMidfielder',
      title: '아디다스 프레데터 축구화 265mm',
      description: '아디다스 프레데터 축구화. 4회 착용. 천연잔디 전용. 상태 좋습니다.',
      sportType: 'soccer',
      category: '축구화',
      condition: 'like_new',
      price: 62000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '양천구',
      viewCount: 38,
      likeCount: 12,
    },
    {
      key: 'baseballGlove',
      sellerKey: 'baseballPitcher',
      title: '롤링스 투수 글러브 11.5인치',
      description: '롤링스 투수 글러브. 1시즌 사용. 포지션 변경으로 판매합니다.',
      sportType: 'baseball',
      category: '글러브',
      condition: 'good',
      price: 95000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '구로구',
      viewCount: 29,
      likeCount: 9,
    },
    {
      key: 'volleyballKneepad',
      sellerKey: 'volleyballSetter',
      title: '미즈노 배구 무릎 보호대',
      description: '미즈노 배구 무릎 보호대. 3개월 사용. M사이즈. 깨끗한 상태.',
      sportType: 'volleyball',
      category: '보호장비',
      condition: 'good',
      price: 22000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '광진구',
      viewCount: 16,
      likeCount: 4,
    },
    {
      key: 'swimGoggles',
      sellerKey: 'swimmingRookie',
      title: '스피도 수경 렌즈 교체품',
      description: '스피도 수경 + 스페어 렌즈. 신상 교체 후 판매합니다.',
      sportType: 'swimming',
      category: '수경',
      condition: 'like_new',
      price: 18000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '강동구',
      viewCount: 11,
      likeCount: 2,
    },
    {
      key: 'hockeyHelmet',
      sellerKey: 'iceLeader',
      title: 'CCM FitLite 아이스하키 헬멧',
      description: 'CCM FitLite 헬멧. 1년 사용. 사이즈 M. 충격 없음.',
      sportType: 'ice_hockey',
      category: '헬멧',
      condition: 'good',
      price: 65000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '송파구',
      viewCount: 24,
      likeCount: 8,
    },
    {
      key: 'figureSkates',
      sellerKey: 'figureSkater',
      title: '잭슨 피겨스케이트 완제품 235mm',
      description: '잭슨 피겨 235mm. 블레이드 2회 연마. 부츠 상태 양호. 사이즈 교환 후 판매.',
      sportType: 'figure_skating',
      category: '스케이트',
      condition: 'good',
      price: 130000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '노원구',
      viewCount: 33,
      likeCount: 11,
    },
    {
      key: 'trackSuit',
      sellerKey: 'trackCaptain',
      title: '나이키 드라이핏 트랙 수트 세트',
      description: '나이키 드라이핏 상하 세트. 2회 착용. M사이즈. 상태 거의 새것.',
      sportType: 'short_track',
      category: '의류',
      condition: 'like_new',
      price: 55000,
      listingType: 'sell',
      locationCity: '서울',
      locationDistrict: '노원구',
      viewCount: 20,
      likeCount: 6,
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
    {
      key: 'futsalForward',
      teamKey: 'nanjiPress',
      authorKey: 'marketSeller',
      sportType: 'futsal',
      matchDate: in3Days,
      venue: '성산 풋살 허브',
      position: 'PIVO',
      count: 1,
      level: 3,
      fee: 18000,
      notes: '피보 포지션 가능한 공격형 플레이어 구합니다. 압박 스타일 환영.',
    },
    {
      key: 'basketballCenter',
      teamKey: 'hardwoodSixmen',
      authorKey: 'basketballLeader',
      sportType: 'basketball',
      matchDate: in6Days,
      venue: '한강 하드우드 코트',
      position: 'C',
      count: 1,
      level: 3,
      fee: 15000,
      notes: '포스트 업과 스크린 가능한 센터 구합니다. 키 185 이상 선호.',
    },
    {
      key: 'tennisPartner',
      teamKey: 'banpoTennisClub',
      authorKey: 'tennisPro',
      sportType: 'tennis',
      matchDate: in5Days,
      venue: '반포 테니스 데크',
      position: 'Doubles',
      count: 1,
      level: 3,
      fee: 12000,
      notes: '복식 파트너 구합니다. 서브와 발리 기본 가능한 분 환영.',
    },
    {
      key: 'soccerGoalkeeper',
      teamKey: 'mokdongEleven',
      authorKey: 'soccerCaptain',
      sportType: 'soccer',
      matchDate: in4Days,
      venue: '목동 사커 그라운드',
      position: 'GK',
      count: 1,
      level: 3,
      fee: 20000,
      notes: '11대11 경기 골키퍼 구합니다. 크로스 처리 가능한 분 우대.',
      status: 'filled',
    },
    {
      key: 'baseballOutfielder',
      teamKey: 'gocheokSluggers',
      authorKey: 'baseballCaptain',
      sportType: 'baseball',
      matchDate: past7Days,
      venue: '고척 다이아몬드 허브',
      position: 'OF',
      count: 2,
      level: 3,
      fee: 20000,
      notes: '외야 수비와 타격 가능한 선수 구합니다.',
      status: 'closed',
    },
    {
      key: 'swimmerExtra',
      teamKey: 'gangdongLanes',
      authorKey: 'swimmerCoach',
      sportType: 'swimming',
      matchDate: in7Days,
      venue: '강동 아쿠아틱 센터',
      position: 'FREESTYLE',
      count: 2,
      level: 2,
      fee: 14000,
      notes: '레인 공유 인터벌 훈련 함께할 분 구합니다. 기록 측정 도구 지참.',
    },
    {
      key: 'figurePartner',
      teamKey: 'figureStarClub',
      authorKey: 'figureSkater',
      sportType: 'figure_skating',
      matchDate: in9Days,
      venue: '태릉 아이스 랩',
      position: 'Pairs',
      count: 1,
      level: 3,
      fee: 30000,
      notes: '페어 프로그램 연습 파트너 구합니다. 점프 경험자 우대.',
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
    {
      key: 'iceHockeyScrim',
      hostTeamKey: 'blueLine',
      sportType: 'ice_hockey',
      title: '아이스하키 스크림',
      description: '잠실 아이스 돔에서 진행하는 라인 체인지 위주의 아이스하키 스크림입니다.',
      matchDate: in7Days,
      startTime: '21:00',
      endTime: '23:00',
      totalMinutes: 120,
      quarterCount: 3,
      venueName: '잠실 아이스 돔',
      venueAddress: '서울 송파구 올림픽로 240',
      totalFee: 420000,
      opponentFee: 210000,
      requiredLevel: 4,
      allowMercenary: true,
      matchStyle: 'competitive',
      hasReferee: true,
      notes: '풀 장비 착용 필수. 헬멧 규정 준수.',
      skillGrade: 'A',
      gameFormat: '5:5',
      matchType: 'friendly',
      uniformColor: '다크 블루 저지',
      applications: [
        {
          applicantTeamKey: 'taereungEdges',
          status: 'approved',
          message: '아이스하키 연습 겸 참여 희망합니다.',
          participationType: 'team',
          confirmedInfo: true,
          confirmedLevel: true,
        },
      ],
      status: 'scheduled',
    },
    {
      key: 'shortTrackDuel',
      hostTeamKey: 'taereungEdges',
      sportType: 'short_track',
      title: '쇼트트랙 듀얼 레이스',
      description: '태릉 아이스 랩에서 진행하는 1:1 듀얼 레이스와 페이스 훈련입니다.',
      matchDate: in11Days,
      startTime: '08:00',
      endTime: '10:00',
      totalMinutes: 120,
      quarterCount: 4,
      venueName: '태릉 아이스 랩',
      venueAddress: '서울 노원구 화랑로 727',
      totalFee: 350000,
      opponentFee: 175000,
      requiredLevel: 3,
      allowMercenary: false,
      matchStyle: 'competitive',
      hasReferee: true,
      notes: '안전 헬멧 착용 필수. 날카로운 블레이드 주의.',
      skillGrade: 'A-',
      gameFormat: '1:1 dual',
      matchType: 'challenge',
      uniformColor: '레드 상의',
      applications: [],
      status: 'recruiting',
    },
    {
      key: 'futsalCompleted',
      hostTeamKey: 'seongsanStrikers',
      sportType: 'futsal',
      title: '완료된 풋살 스크림',
      description: '이미 완료된 풋살 팀 친선전입니다.',
      matchDate: past14Days,
      startTime: '18:00',
      endTime: '20:00',
      totalMinutes: 120,
      quarterCount: 4,
      venueName: '성산 풋살 허브',
      venueAddress: '서울 마포구 성산로 48',
      totalFee: 240000,
      opponentFee: 120000,
      requiredLevel: 3,
      allowMercenary: false,
      matchStyle: 'friendly',
      hasReferee: false,
      notes: '완료된 경기입니다.',
      skillGrade: 'B+',
      gameFormat: '6:6',
      matchType: 'friendly',
      uniformColor: '검정 상의',
      applications: [
        {
          applicantTeamKey: 'nanjiPress',
          status: 'approved',
          message: '친선전 희망합니다.',
          participationType: 'team',
          confirmedInfo: true,
          confirmedLevel: true,
        },
      ],
      status: 'completed',
    },
    {
      key: 'soccerCompleted',
      hostTeamKey: 'mokdongEleven',
      sportType: 'soccer',
      title: '완료된 축구 교류전',
      description: '이미 완료된 축구 팀 교류전입니다.',
      matchDate: past21Days,
      startTime: '09:00',
      endTime: '11:00',
      totalMinutes: 120,
      quarterCount: 2,
      venueName: '목동 사커 그라운드',
      venueAddress: '서울 양천구 안양천로 939',
      totalFee: 300000,
      opponentFee: 150000,
      requiredLevel: 3,
      allowMercenary: false,
      matchStyle: 'friendly',
      hasReferee: true,
      notes: '완료된 경기입니다.',
      skillGrade: 'B+',
      gameFormat: '11:11',
      matchType: 'friendly',
      uniformColor: '네이비 상의',
      applications: [],
      status: 'completed',
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
      description: '최근 Teameet에 새로 등록된 신생 팀입니다.',
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
      description: '최근 Teameet에 새로 등록된 신생 수영 클럽입니다.',
    },
  ];

  const mercenaryApplications: MockMercenaryApplicationRecord[] = [
    { postKey: 'futsalKeeper', applicantKey: 'marketSeller', status: 'accepted', message: '골키퍼 경험 있습니다. 참가 희망합니다.' },
    { postKey: 'futsalKeeper', applicantKey: 'fillerUser1', status: 'rejected', message: '경기 당일 참가 가능합니다.' },
    { postKey: 'basketballWing', applicantKey: 'fillerUser1', status: 'accepted', message: '윙 포지션 자신 있습니다.' },
    { postKey: 'basketballWing', applicantKey: 'soccerMidfielder', status: 'pending', message: '농구도 즐기고 있습니다. 참가 부탁드립니다.' },
    { postKey: 'iceDefense', applicantKey: 'trackCaptain', status: 'accepted', message: '빙판 수비 경험 있습니다.' },
    { postKey: 'badmintonPartner', applicantKey: 'extraSeller', status: 'pending', message: '복식 파트너 찾고 있었는데 신청합니다.' },
    { postKey: 'badmintonPartner', applicantKey: 'newbieB', status: 'pending', message: '배드민턴 입문 중인데 경험해보고 싶어요.' },
    { postKey: 'soccerStriker', applicantKey: 'futsalLeader', status: 'accepted', message: '공격수 경험 있습니다. 참가할게요.' },
    { postKey: 'soccerStriker', applicantKey: 'soccerMidfielder', status: 'rejected', message: '스트라이커 포지션 도전해보고 싶습니다.' },
    { postKey: 'baseballCatcher', applicantKey: 'baseballPitcher', status: 'accepted', message: '포수 경험 있습니다. 투수와 호흡 맞춰드릴게요.' },
    { postKey: 'volleyballMiddle', applicantKey: 'volleyballSetter', status: 'accepted', message: '미들 블로커도 가능합니다.' },
    { postKey: 'shortTrackPacer', applicantKey: 'figureSkater', status: 'pending', message: '페이스 조율 연습에 관심 있습니다.' },
    { postKey: 'futsalForward', applicantKey: 'futsalLeader', status: 'accepted', message: '피보 포지션 자신 있습니다.' },
    { postKey: 'basketballCenter', applicantKey: 'fillerUser1', status: 'pending', message: '센터 지원합니다.' },
    { postKey: 'tennisPartner', applicantKey: 'extraSeller', status: 'accepted', message: '복식 파트너 매칭 희망합니다.' },
    { postKey: 'tennisPartner', applicantKey: 'tennisLeader', status: 'pending', message: '복식 경기 참가 희망합니다.' },
    { postKey: 'swimmerExtra', applicantKey: 'swimmingRookie', status: 'pending', message: '레인 공유 인터벌 경험하고 싶습니다.' },
    { postKey: 'figurePartner', applicantKey: 'trackCaptain', status: 'pending', message: '피겨 파트너 도전해보고 싶습니다.' },
    { postKey: 'baseballOutfielder', applicantKey: 'marketSeller', status: 'accepted', message: '외야 수비 가능합니다.' },
    { postKey: 'baseballOutfielder', applicantKey: 'fillerUser1', status: 'accepted', message: '타격 자신 있습니다.' },
  ];

  const payments: MockPaymentRecord[] = [
    { id: 'mock-pay-tennisCompleted-tennisLeader', orderId: 'mock-order-pay-tennis-tl', matchKey: 'tennisCompleted', payerKey: 'tennisLeader', amount: 10000, status: 'completed' },
    { id: 'mock-pay-tennisCompleted-tennisPro', orderId: 'mock-order-pay-tennis-tp', matchKey: 'tennisCompleted', payerKey: 'tennisPro', amount: 10000, status: 'completed' },
    { id: 'mock-pay-tennisCompleted-extraSeller', orderId: 'mock-order-pay-tennis-es', matchKey: 'tennisCompleted', payerKey: 'extraSeller', amount: 10000, status: 'completed' },
    { id: 'mock-pay-tennisCompleted-badmintonLeader', orderId: 'mock-order-pay-tennis-bl', matchKey: 'tennisCompleted', payerKey: 'badmintonLeader', amount: 10000, status: 'completed' },
    { id: 'mock-pay-baseballCompleted-baseballCaptain', orderId: 'mock-order-pay-baseball-bc', matchKey: 'baseballCompleted', payerKey: 'baseballCaptain', amount: 18000, status: 'completed' },
    { id: 'mock-pay-baseballCompleted-baseballPitcher', orderId: 'mock-order-pay-baseball-bp', matchKey: 'baseballCompleted', payerKey: 'baseballPitcher', amount: 18000, status: 'completed' },
    { id: 'mock-pay-baseballCompleted-marketSeller', orderId: 'mock-order-pay-baseball-ms', matchKey: 'baseballCompleted', payerKey: 'marketSeller', amount: 18000, status: 'refunded' },
    { id: 'mock-pay-swimCompleted-swimmerCoach', orderId: 'mock-order-pay-swim-sc', matchKey: 'swimCompleted', payerKey: 'swimmerCoach', amount: 16000, status: 'completed' },
    { id: 'mock-pay-swimCompleted-swimmingRookie', orderId: 'mock-order-pay-swim-sr', matchKey: 'swimCompleted', payerKey: 'swimmingRookie', amount: 16000, status: 'completed' },
    { id: 'mock-pay-iceCompleted-iceLeader', orderId: 'mock-order-pay-ice-il', matchKey: 'iceCompleted', payerKey: 'iceLeader', amount: 25000, status: 'completed' },
    { id: 'mock-pay-iceCompleted-trackCaptain', orderId: 'mock-order-pay-ice-tc', matchKey: 'iceCompleted', payerKey: 'trackCaptain', amount: 25000, status: 'completed' },
    { id: 'mock-pay-trackCompleted-trackCaptain', orderId: 'mock-order-pay-track-tc', matchKey: 'trackCompleted', payerKey: 'trackCaptain', amount: 24000, status: 'partial_refunded' },
    { id: 'mock-pay-futsalConfirmed-futsalLeader', orderId: 'mock-order-pay-futsal-fl', matchKey: 'futsalConfirmed', payerKey: 'futsalLeader', amount: 12000, status: 'pending' },
    { id: 'mock-pay-futsalConfirmed-marketSeller', orderId: 'mock-order-pay-futsal-ms', matchKey: 'futsalConfirmed', payerKey: 'marketSeller', amount: 12000, status: 'pending' },
    { id: 'mock-pay-basketballFull-basketballLeader', orderId: 'mock-order-pay-bball-bkl', matchKey: 'basketballFull', payerKey: 'basketballLeader', amount: 15000, status: 'failed' },
  ];

  const marketplaceOrders: MockMarketplaceOrderRecord[] = [
    { orderId: 'mock-order-futsalShoes-soccerMidfielder', listingKey: 'futsalShoes', buyerKey: 'soccerMidfielder', sellerKey: 'marketSeller', amount: 48000, status: 'completed' },
    { orderId: 'mock-order-basketballJersey-fillerUser1', listingKey: 'basketballJersey', buyerKey: 'fillerUser1', sellerKey: 'basketballLeader', amount: 68000, status: 'paid' },
    { orderId: 'mock-order-tennisBag-extraSeller', listingKey: 'tennisBag', buyerKey: 'extraSeller', sellerKey: 'tennisLeader', amount: 39000, status: 'completed' },
    { orderId: 'mock-order-soccerShinGuards-futsalLeader', listingKey: 'soccerShinGuards', buyerKey: 'futsalLeader', sellerKey: 'soccerCaptain', amount: 26000, status: 'shipped' },
    { orderId: 'mock-order-goalieGlove-marketSeller', listingKey: 'goalieGlove', buyerKey: 'marketSeller', sellerKey: 'iceLeader', amount: 82000, status: 'escrow_held' },
    { orderId: 'mock-order-swimKickboard-swimmingRookie', listingKey: 'swimKickboardPack', buyerKey: 'swimmingRookie', sellerKey: 'swimmerCoach', amount: 34000, status: 'delivered' },
    { orderId: 'mock-order-figureBladeCase-trackCaptain', listingKey: 'figureBladeCase', buyerKey: 'trackCaptain', sellerKey: 'figureSkater', amount: 42000, status: 'completed' },
    { orderId: 'mock-order-basketballShoes-basketballLeader', listingKey: 'basketballShoes', buyerKey: 'basketballLeader', sellerKey: 'fillerUser1', amount: 78000, status: 'refunded' },
    { orderId: 'mock-order-soccerCleats-soccerCaptain', listingKey: 'soccerCleats', buyerKey: 'soccerCaptain', sellerKey: 'soccerMidfielder', amount: 62000, status: 'pending' },
    { orderId: 'mock-order-hockeyHelmet-trackCaptain', listingKey: 'hockeyHelmet', buyerKey: 'trackCaptain', sellerKey: 'iceLeader', amount: 65000, status: 'completed' },
  ];

  const lessonSchedules: MockLessonScheduleRecord[] = [
    { lessonKey: 'futsalClinic', sessionDate: in5Days, startTime: '19:30', endTime: '21:30', maxParticipants: 10 },
    { lessonKey: 'futsalClinic', sessionDate: in6Days, startTime: '19:30', endTime: '21:30', maxParticipants: 10 },
    { lessonKey: 'badmintonStarter', sessionDate: in3Days, startTime: '18:30', endTime: '20:00', maxParticipants: 8 },
    { lessonKey: 'badmintonStarter', sessionDate: in4Days, startTime: '18:30', endTime: '20:00', maxParticipants: 8 },
    { lessonKey: 'iceTransition', sessionDate: in9Days, startTime: '14:00', endTime: '16:00', maxParticipants: 10 },
    { lessonKey: 'basketballFinishing', sessionDate: in11Days, startTime: '20:30', endTime: '22:00', maxParticipants: 12 },
    { lessonKey: 'soccerFinishing', sessionDate: in1Day, startTime: '19:00', endTime: '21:00', maxParticipants: 16 },
    { lessonKey: 'soccerFinishing', sessionDate: in2Days, startTime: '19:00', endTime: '21:00', maxParticipants: 16 },
    { lessonKey: 'volleyballReceive', sessionDate: in6Days, startTime: '18:30', endTime: '20:30', maxParticipants: 12 },
    { lessonKey: 'swimInterval', sessionDate: in4Days, startTime: '06:30', endTime: '08:00', maxParticipants: 10 },
    { lessonKey: 'figureEdge', sessionDate: in9Days, startTime: '15:00', endTime: '17:00', maxParticipants: 8 },
    { lessonKey: 'tennisServeClinic', sessionDate: in4Days, startTime: '08:00', endTime: '10:00', maxParticipants: 8 },
    { lessonKey: 'baseballBattingLab', sessionDate: in7Days, startTime: '18:00', endTime: '20:00', maxParticipants: 8 },
    { lessonKey: 'shortTrackSprintLab', sessionDate: in11Days, startTime: '09:00', endTime: '11:00', maxParticipants: 6 },
    { lessonKey: 'soccerDefenseClinic', sessionDate: in3Days, startTime: '07:00', endTime: '09:00', maxParticipants: 16 },
  ];

  const lessonTickets: MockLessonTicketRecord[] = [
    { id: 'mock-ticket-futsal-futsalLeader', lessonKey: 'futsalClinic', ownerKey: 'futsalLeader', planName: '전환 드릴 4회권', status: 'active', usedSessions: 1, paidAmount: 96000 },
    { id: 'mock-ticket-futsal-marketSeller', lessonKey: 'futsalClinic', ownerKey: 'marketSeller', planName: '체험 1회권', status: 'exhausted', usedSessions: 1, paidAmount: 28000 },
    { id: 'mock-ticket-futsal-soccerMidfielder', lessonKey: 'futsalClinic', ownerKey: 'soccerMidfielder', planName: '체험 1회권', status: 'active', usedSessions: 0, paidAmount: 28000 },
    { id: 'mock-ticket-futsal-fillerUser1', lessonKey: 'futsalClinic', ownerKey: 'fillerUser1', planName: '전환 드릴 4회권', status: 'cancelled', usedSessions: 0, paidAmount: 96000 },
    { id: 'mock-ticket-badminton-badmintonLeader', lessonKey: 'badmintonStarter', ownerKey: 'badmintonLeader', planName: '스타터 6회권', status: 'active', usedSessions: 1, paidAmount: 114000 },
    { id: 'mock-ticket-badminton-newbieB', lessonKey: 'badmintonStarter', ownerKey: 'newbieB', planName: '스타터 1회권', status: 'active', usedSessions: 0, paidAmount: 22000 },
    { id: 'mock-ticket-badminton-extraSeller', lessonKey: 'badmintonStarter', ownerKey: 'extraSeller', planName: '스타터 1회권', status: 'exhausted', usedSessions: 1, paidAmount: 22000 },
    { id: 'mock-ticket-ice-iceLeader', lessonKey: 'iceTransition', ownerKey: 'iceLeader', planName: '링크 3회권', status: 'active', usedSessions: 1, paidAmount: 99000 },
    { id: 'mock-ticket-ice-trackCaptain', lessonKey: 'iceTransition', ownerKey: 'trackCaptain', planName: '링크 체험권', status: 'exhausted', usedSessions: 1, paidAmount: 36000 },
    { id: 'mock-ticket-ice-figureSkater', lessonKey: 'iceTransition', ownerKey: 'figureSkater', planName: '링크 체험권', status: 'active', usedSessions: 0, paidAmount: 36000 },
    { id: 'mock-ticket-basketball-basketballLeader', lessonKey: 'basketballFinishing', ownerKey: 'basketballLeader', planName: '실전 5회권', status: 'active', usedSessions: 1, paidAmount: 81000 },
    { id: 'mock-ticket-basketball-fillerUser1', lessonKey: 'basketballFinishing', ownerKey: 'fillerUser1', planName: '실전 1회권', status: 'active', usedSessions: 0, paidAmount: 18000 },
    { id: 'mock-ticket-soccer-soccerCaptain', lessonKey: 'soccerFinishing', ownerKey: 'soccerCaptain', planName: '축구 4회권', status: 'active', usedSessions: 1, paidAmount: 94000 },
    { id: 'mock-ticket-soccer-futsalLeader', lessonKey: 'soccerFinishing', ownerKey: 'futsalLeader', planName: '축구 체험권', status: 'exhausted', usedSessions: 1, paidAmount: 26000 },
    { id: 'mock-ticket-soccer-soccerMidfielder', lessonKey: 'soccerFinishing', ownerKey: 'soccerMidfielder', planName: '축구 4회권', status: 'active', usedSessions: 0, paidAmount: 94000 },
    { id: 'mock-ticket-volleyball-volleyballCaptain', lessonKey: 'volleyballReceive', ownerKey: 'volleyballCaptain', planName: '배구 6회권', status: 'active', usedSessions: 1, paidAmount: 126000 },
    { id: 'mock-ticket-volleyball-volleyballSetter', lessonKey: 'volleyballReceive', ownerKey: 'volleyballSetter', planName: '배구 1회권', status: 'active', usedSessions: 0, paidAmount: 24000 },
    { id: 'mock-ticket-swim-swimmerCoach', lessonKey: 'swimInterval', ownerKey: 'swimmerCoach', planName: '수영 8회권', status: 'active', usedSessions: 1, paidAmount: 208000 },
    { id: 'mock-ticket-swim-swimmingRookie', lessonKey: 'swimInterval', ownerKey: 'swimmingRookie', planName: '수영 1회권', status: 'active', usedSessions: 0, paidAmount: 30000 },
    { id: 'mock-ticket-figure-figureSkater', lessonKey: 'figureEdge', ownerKey: 'figureSkater', planName: '피겨 3회권', status: 'active', usedSessions: 1, paidAmount: 93000 },
    { id: 'mock-ticket-tennis-tennisPro', lessonKey: 'tennisServeClinic', ownerKey: 'tennisPro', planName: '서브 4회권', status: 'active', usedSessions: 1, paidAmount: 88000 },
    { id: 'mock-ticket-tennis-tennisLeader', lessonKey: 'tennisServeClinic', ownerKey: 'tennisLeader', planName: '서브 1회권', status: 'active', usedSessions: 0, paidAmount: 25000 },
    { id: 'mock-ticket-baseball-baseballCaptain', lessonKey: 'baseballBattingLab', ownerKey: 'baseballCaptain', planName: '배팅 3회권', status: 'active', usedSessions: 1, paidAmount: 87000 },
    { id: 'mock-ticket-baseball-baseballPitcher', lessonKey: 'baseballBattingLab', ownerKey: 'baseballPitcher', planName: '배팅 1회권', status: 'active', usedSessions: 0, paidAmount: 32000 },
    { id: 'mock-ticket-shorttrack-trackCaptain', lessonKey: 'shortTrackSprintLab', ownerKey: 'trackCaptain', planName: '스프린트 5회권', status: 'active', usedSessions: 1, paidAmount: 170000 },
    { id: 'mock-ticket-soccer-defense-soccerCaptain', lessonKey: 'soccerDefenseClinic', ownerKey: 'soccerCaptain', planName: '수비 4회권', status: 'active', usedSessions: 1, paidAmount: 86000 },
    { id: 'mock-ticket-soccer-defense-soccerMidfielder', lessonKey: 'soccerDefenseClinic', ownerKey: 'soccerMidfielder', planName: '수비 1회권', status: 'active', usedSessions: 0, paidAmount: 24000 },
    { id: 'mock-ticket-soccer-defense-futsalLeader', lessonKey: 'soccerDefenseClinic', ownerKey: 'futsalLeader', planName: '수비 1회권', status: 'active', usedSessions: 0, paidAmount: 24000 },
    { id: 'mock-ticket-soccer-defense-fillerUser1', lessonKey: 'soccerDefenseClinic', ownerKey: 'fillerUser1', planName: '수비 1회권', status: 'cancelled', usedSessions: 0, paidAmount: 24000 },
    { id: 'mock-ticket-soccer-defense-marketSeller', lessonKey: 'soccerDefenseClinic', ownerKey: 'marketSeller', planName: '수비 1회권', status: 'cancelled', usedSessions: 0, paidAmount: 24000 },
    { id: 'mock-ticket-soccer-defense-baseballCaptain', lessonKey: 'soccerDefenseClinic', ownerKey: 'baseballCaptain', planName: '수비 1회권', status: 'active', usedSessions: 0, paidAmount: 24000 },
    { id: 'mock-ticket-soccer-defense-swimmingRookie', lessonKey: 'soccerDefenseClinic', ownerKey: 'swimmingRookie', planName: '수비 1회권', status: 'active', usedSessions: 0, paidAmount: 24000 },
    { id: 'mock-ticket-soccer-defense-badmintonLeader', lessonKey: 'soccerDefenseClinic', ownerKey: 'badmintonLeader', planName: '수비 1회권', status: 'active', usedSessions: 0, paidAmount: 24000 },
  ];

  const lessonAttendances: MockLessonAttendanceRecord[] = [
    { lessonKey: 'futsalClinic', sessionDate: in5Days, userKey: 'futsalLeader', ticketId: 'mock-ticket-futsal-futsalLeader', status: 'scheduled' },
    { lessonKey: 'futsalClinic', sessionDate: in5Days, userKey: 'marketSeller', ticketId: 'mock-ticket-futsal-marketSeller', status: 'attended' },
    { lessonKey: 'futsalClinic', sessionDate: in5Days, userKey: 'soccerMidfielder', ticketId: 'mock-ticket-futsal-soccerMidfielder', status: 'scheduled' },
    { lessonKey: 'futsalClinic', sessionDate: in6Days, userKey: 'futsalLeader', ticketId: 'mock-ticket-futsal-futsalLeader', status: 'scheduled' },
    { lessonKey: 'badmintonStarter', sessionDate: in3Days, userKey: 'badmintonLeader', ticketId: 'mock-ticket-badminton-badmintonLeader', status: 'scheduled' },
    { lessonKey: 'badmintonStarter', sessionDate: in3Days, userKey: 'newbieB', ticketId: 'mock-ticket-badminton-newbieB', status: 'scheduled' },
    { lessonKey: 'badmintonStarter', sessionDate: in3Days, userKey: 'extraSeller', ticketId: 'mock-ticket-badminton-extraSeller', status: 'absent' },
    { lessonKey: 'badmintonStarter', sessionDate: in4Days, userKey: 'badmintonLeader', ticketId: 'mock-ticket-badminton-badmintonLeader', status: 'scheduled' },
    { lessonKey: 'iceTransition', sessionDate: in9Days, userKey: 'iceLeader', ticketId: 'mock-ticket-ice-iceLeader', status: 'scheduled' },
    { lessonKey: 'iceTransition', sessionDate: in9Days, userKey: 'trackCaptain', ticketId: 'mock-ticket-ice-trackCaptain', status: 'scheduled' },
    { lessonKey: 'iceTransition', sessionDate: in9Days, userKey: 'figureSkater', ticketId: 'mock-ticket-ice-figureSkater', status: 'scheduled' },
    { lessonKey: 'basketballFinishing', sessionDate: in11Days, userKey: 'basketballLeader', ticketId: 'mock-ticket-basketball-basketballLeader', status: 'scheduled' },
    { lessonKey: 'basketballFinishing', sessionDate: in11Days, userKey: 'fillerUser1', ticketId: 'mock-ticket-basketball-fillerUser1', status: 'scheduled' },
    { lessonKey: 'soccerFinishing', sessionDate: in1Day, userKey: 'soccerCaptain', ticketId: 'mock-ticket-soccer-soccerCaptain', status: 'scheduled' },
    { lessonKey: 'soccerFinishing', sessionDate: in1Day, userKey: 'futsalLeader', ticketId: 'mock-ticket-soccer-futsalLeader', status: 'late' },
    { lessonKey: 'soccerFinishing', sessionDate: in1Day, userKey: 'soccerMidfielder', ticketId: 'mock-ticket-soccer-soccerMidfielder', status: 'scheduled' },
    { lessonKey: 'soccerFinishing', sessionDate: in2Days, userKey: 'soccerCaptain', ticketId: 'mock-ticket-soccer-soccerCaptain', status: 'scheduled' },
    { lessonKey: 'soccerFinishing', sessionDate: in2Days, userKey: 'soccerMidfielder', ticketId: 'mock-ticket-soccer-soccerMidfielder', status: 'scheduled' },
    { lessonKey: 'volleyballReceive', sessionDate: in6Days, userKey: 'volleyballCaptain', ticketId: 'mock-ticket-volleyball-volleyballCaptain', status: 'scheduled' },
    { lessonKey: 'volleyballReceive', sessionDate: in6Days, userKey: 'volleyballSetter', ticketId: 'mock-ticket-volleyball-volleyballSetter', status: 'scheduled' },
    { lessonKey: 'swimInterval', sessionDate: in4Days, userKey: 'swimmerCoach', ticketId: 'mock-ticket-swim-swimmerCoach', status: 'scheduled' },
    { lessonKey: 'swimInterval', sessionDate: in4Days, userKey: 'swimmingRookie', ticketId: 'mock-ticket-swim-swimmingRookie', status: 'scheduled' },
    { lessonKey: 'figureEdge', sessionDate: in9Days, userKey: 'figureSkater', ticketId: 'mock-ticket-figure-figureSkater', status: 'scheduled' },
    { lessonKey: 'tennisServeClinic', sessionDate: in4Days, userKey: 'tennisPro', ticketId: 'mock-ticket-tennis-tennisPro', status: 'scheduled' },
    { lessonKey: 'tennisServeClinic', sessionDate: in4Days, userKey: 'tennisLeader', ticketId: 'mock-ticket-tennis-tennisLeader', status: 'scheduled' },
    { lessonKey: 'baseballBattingLab', sessionDate: in7Days, userKey: 'baseballCaptain', ticketId: 'mock-ticket-baseball-baseballCaptain', status: 'scheduled' },
    { lessonKey: 'baseballBattingLab', sessionDate: in7Days, userKey: 'baseballPitcher', ticketId: 'mock-ticket-baseball-baseballPitcher', status: 'scheduled' },
    { lessonKey: 'shortTrackSprintLab', sessionDate: in11Days, userKey: 'trackCaptain', ticketId: 'mock-ticket-shorttrack-trackCaptain', status: 'scheduled' },
    { lessonKey: 'soccerDefenseClinic', sessionDate: in3Days, userKey: 'soccerCaptain', ticketId: 'mock-ticket-soccer-defense-soccerCaptain', status: 'scheduled' },
    { lessonKey: 'soccerDefenseClinic', sessionDate: in3Days, userKey: 'soccerMidfielder', ticketId: 'mock-ticket-soccer-defense-soccerMidfielder', status: 'scheduled' },
    { lessonKey: 'soccerDefenseClinic', sessionDate: in3Days, userKey: 'futsalLeader', ticketId: 'mock-ticket-soccer-defense-futsalLeader', status: 'scheduled' },
    { lessonKey: 'soccerDefenseClinic', sessionDate: in3Days, userKey: 'fillerUser1', ticketId: 'mock-ticket-soccer-defense-fillerUser1', status: 'cancelled' },
    { lessonKey: 'soccerDefenseClinic', sessionDate: in3Days, userKey: 'marketSeller', ticketId: 'mock-ticket-soccer-defense-marketSeller', status: 'cancelled' },
    { lessonKey: 'soccerDefenseClinic', sessionDate: in3Days, userKey: 'baseballCaptain', ticketId: 'mock-ticket-soccer-defense-baseballCaptain', status: 'scheduled' },
    { lessonKey: 'soccerDefenseClinic', sessionDate: in3Days, userKey: 'swimmingRookie', ticketId: 'mock-ticket-soccer-defense-swimmingRookie', status: 'scheduled' },
    { lessonKey: 'soccerDefenseClinic', sessionDate: in3Days, userKey: 'badmintonLeader', ticketId: 'mock-ticket-soccer-defense-badmintonLeader', status: 'scheduled' },
  ];

  // Chat rooms: 12 rooms with programmatic messages (200 total across all rooms)
  const chatRooms: MockChatRoomRecord[] = [
    { key: 'chat-futsal-scrim', type: 'team_match', participantKeys: ['futsalLeader', 'marketSeller', 'basketballLeader'], teamMatchKey: 'futsalScrimmage', messageCount: 20 },
    { key: 'chat-basketball-challenge', type: 'team_match', participantKeys: ['basketballLeader', 'fillerUser1', 'soccerMidfielder'], teamMatchKey: 'basketballChallenge', messageCount: 15 },
    { key: 'chat-badminton-clubday', type: 'team_match', participantKeys: ['badmintonLeader', 'tennisLeader', 'extraSeller'], teamMatchKey: 'badmintonClubDay', messageCount: 18 },
    { key: 'chat-soccer-friendly', type: 'team_match', participantKeys: ['soccerCaptain', 'futsalLeader', 'soccerMidfielder'], teamMatchKey: 'soccerWeekendFriendly', messageCount: 22 },
    { key: 'chat-baseball-sunday', type: 'team_match', participantKeys: ['baseballCaptain', 'baseballPitcher', 'marketSeller'], teamMatchKey: 'baseballSundayGame', messageCount: 16 },
    { key: 'chat-volleyball-scrim', type: 'team_match', participantKeys: ['volleyballCaptain', 'volleyballSetter', 'fillerUser1'], teamMatchKey: 'volleyballOpenScrim', messageCount: 14 },
    { key: 'chat-ice-hockey', type: 'team_match', participantKeys: ['iceLeader', 'trackCaptain', 'figureSkater'], teamMatchKey: 'iceHockeyScrim', messageCount: 19 },
    { key: 'chat-shorttrack-duel', type: 'team_match', participantKeys: ['trackCaptain', 'figureSkater', 'iceLeader'], teamMatchKey: 'shortTrackDuel', messageCount: 12 },
    { key: 'chat-direct-futsal-basketball', type: 'direct', participantKeys: ['futsalLeader', 'basketballLeader'], messageCount: 17 },
    { key: 'chat-direct-ice-track', type: 'direct', participantKeys: ['iceLeader', 'trackCaptain'], messageCount: 13 },
    { key: 'chat-team-strikers', type: 'team', participantKeys: ['futsalLeader', 'basketballLeader', 'marketSeller', 'soccerMidfielder'], messageCount: 25 },
    { key: 'chat-team-hardwood', type: 'team', participantKeys: ['basketballLeader', 'marketSeller', 'fillerUser1'], messageCount: 21 },
  ];

  // Generate chat messages programmatically (total ~212 across 12 rooms)
  const chatMessageSenders: MockUserKey[] = ['futsalLeader', 'basketballLeader', 'marketSeller', 'soccerCaptain', 'iceLeader', 'trackCaptain', 'badmintonLeader', 'tennisLeader'];
  const chatMessageTexts = [
    '경기 시간 확인해주세요!', '장소는 어디서 만나나요?', '참가 확정입니다.', '유니폼 색상이 어떻게 되나요?', '오늘 날씨 괜찮죠?',
    '연습은 충분히 하셨나요?', '경기 기대됩니다!', '장비 챙겨오실 거죠?', '몇 시에 모이면 될까요?', '전략 공유해 드릴게요.',
    '신청해 주셔서 감사합니다.', '잘 부탁드립니다!', '경기 후 식사 어떠세요?', '레벨은 어떻게 되세요?', '다음에 또 같이해요.',
  ];
  const chatMessages = chatRooms.flatMap((room, ri) =>
    Array.from({ length: room.messageCount }, (_, mi) => ({
      chatRoomKey: room.key,
      senderKey: room.participantKeys[mi % room.participantKeys.length],
      content: chatMessageTexts[(ri * 7 + mi) % chatMessageTexts.length],
      type: 'text' as const,
      offsetMinutes: -(room.messageCount - mi) * 5,
    })),
  );

  const venueReviews: MockVenueReviewRecord[] = [
    { venueKey: 'seongsanFutsalHub', authorKey: 'futsalLeader', rating: 5, facilityRating: 5, accessRating: 4, costRating: 4, comment: '조명 환경이 좋고 라운지가 편리해요. 자주 이용합니다.' },
    { venueKey: 'seongsanFutsalHub', authorKey: 'marketSeller', rating: 4, facilityRating: 4, accessRating: 5, costRating: 4, comment: '주차 공간이 충분하고 시설이 깨끗합니다.' },
    { venueKey: 'seongsanFutsalHub', authorKey: 'soccerMidfielder', rating: 5, facilityRating: 5, accessRating: 5, costRating: 4, comment: '팀 라운지 완벽합니다. 강력 추천!' },
    { venueKey: 'hangangHardwoodCourt', authorKey: 'basketballLeader', rating: 4, facilityRating: 4, accessRating: 4, costRating: 3, comment: '하드우드 바닥 상태 좋습니다. 농구하기에 최고.' },
    { venueKey: 'hangangHardwoodCourt', authorKey: 'fillerUser1', rating: 4, facilityRating: 4, accessRating: 5, costRating: 3, comment: '한강뷰 보면서 농구 최고예요.' },
    { venueKey: 'seochoRacketStudio', authorKey: 'badmintonLeader', rating: 5, facilityRating: 5, accessRating: 4, costRating: 4, comment: '라켓 대여 서비스가 편리하고 코트 상태 양호합니다.' },
    { venueKey: 'seochoRacketStudio', authorKey: 'extraSeller', rating: 4, facilityRating: 4, accessRating: 4, costRating: 4, comment: '배드민턴과 테니스 모두 즐길 수 있어 좋아요.' },
    { venueKey: 'jamsilIceDome', authorKey: 'iceLeader', rating: 5, facilityRating: 5, accessRating: 4, costRating: 3, comment: '빙질이 항상 균일하게 관리됩니다. 아이스하키 최고.' },
    { venueKey: 'jamsilIceDome', authorKey: 'figureSkater', rating: 5, facilityRating: 5, accessRating: 4, costRating: 3, comment: '장비 대여 완비, 안전 관리 철저합니다.' },
    { venueKey: 'banpoTennisDeck', authorKey: 'tennisLeader', rating: 4, facilityRating: 4, accessRating: 5, costRating: 4, comment: '야외지만 야간 조명 좋고 한강 뷰가 멋집니다.' },
    { venueKey: 'banpoTennisDeck', authorKey: 'tennisPro', rating: 4, facilityRating: 4, accessRating: 5, costRating: 5, comment: '코트 컨디션 관리가 잘 되어 있습니다.' },
    { venueKey: 'mokdongSoccerGround', authorKey: 'soccerCaptain', rating: 5, facilityRating: 5, accessRating: 4, costRating: 4, comment: '천연잔디 품질이 최고입니다. 야간 조명도 완벽.' },
    { venueKey: 'mokdongSoccerGround', authorKey: 'futsalLeader', rating: 4, facilityRating: 4, accessRating: 4, costRating: 3, comment: '넓은 그라운드에서 11대11 경기 최고!' },
    { venueKey: 'gocheokDiamondHub', authorKey: 'baseballCaptain', rating: 4, facilityRating: 4, accessRating: 4, costRating: 4, comment: '배팅 케이지 상태 좋고 피칭 머신 다양해요.' },
    { venueKey: 'gocheokDiamondHub', authorKey: 'baseballPitcher', rating: 5, facilityRating: 5, accessRating: 4, costRating: 4, comment: '투구 분석 서비스 매우 만족합니다.' },
    { venueKey: 'jayangSpikeCenter', authorKey: 'volleyballCaptain', rating: 5, facilityRating: 5, accessRating: 4, costRating: 4, comment: '코트 2면이라 대기 없이 바로 사용 가능합니다.' },
    { venueKey: 'jayangSpikeCenter', authorKey: 'volleyballSetter', rating: 4, facilityRating: 4, accessRating: 4, costRating: 3, comment: '트레이닝룸 잘 갖춰져 있어서 준비 운동 편하게 했어요.' },
    { venueKey: 'gangdongAquaticsCenter', authorKey: 'swimmerCoach', rating: 5, facilityRating: 5, accessRating: 5, costRating: 4, comment: '기록 측정 장비 완비, 레인 예약 시스템 편리합니다.' },
    { venueKey: 'gangdongAquaticsCenter', authorKey: 'swimmingRookie', rating: 4, facilityRating: 4, accessRating: 5, costRating: 4, comment: '처음 방문했는데 편의시설 좋았어요.' },
    { venueKey: 'taereungIceLab', authorKey: 'figureSkater', rating: 5, facilityRating: 5, accessRating: 4, costRating: 3, comment: '날 정비 서비스 품질 최고, 빙질 완벽합니다.' },
    { venueKey: 'taereungIceLab', authorKey: 'trackCaptain', rating: 5, facilityRating: 5, accessRating: 4, costRating: 3, comment: '영상 분석 서비스가 훈련에 큰 도움이 됩니다.' },
    { venueKey: 'taereungIceLab', authorKey: 'iceLeader', rating: 4, facilityRating: 4, accessRating: 4, costRating: 3, comment: '쇼트트랙 훈련 최적 환경입니다.' },
    { venueKey: 'seongsanFutsalHub', authorKey: 'basketballLeader', rating: 4, facilityRating: 4, accessRating: 4, costRating: 3, comment: '풋살팀 경기 후 라운지에서 미팅 좋았어요.' },
    { venueKey: 'hangangHardwoodCourt', authorKey: 'soccerMidfielder', rating: 3, facilityRating: 3, accessRating: 3, costRating: 3, comment: '주차가 조금 불편했지만 코트는 좋아요.' },
    { venueKey: 'seochoRacketStudio', authorKey: 'tennisLeader', rating: 5, facilityRating: 5, accessRating: 4, costRating: 4, comment: '스트링 서비스 빠르고 퀄리티 좋습니다.' },
    { venueKey: 'jamsilIceDome', authorKey: 'trackCaptain', rating: 5, facilityRating: 5, accessRating: 4, costRating: 3, comment: '아이스하키와 쇼트트랙 함께 즐길 수 있어 최고!' },
    { venueKey: 'mokdongSoccerGround', authorKey: 'soccerMidfielder', rating: 5, facilityRating: 5, accessRating: 4, costRating: 4, comment: '잔디 상태 정말 훌륭합니다.' },
    { venueKey: 'gocheokDiamondHub', authorKey: 'marketSeller', rating: 4, facilityRating: 4, accessRating: 4, costRating: 4, comment: '라커룸 넓고 쾌적합니다.' },
    { venueKey: 'jayangSpikeCenter', authorKey: 'basketballLeader', rating: 4, facilityRating: 4, accessRating: 4, costRating: 3, comment: '배구 전용 시설이라 배구하기 완벽합니다.' },
    { venueKey: 'gangdongAquaticsCenter', authorKey: 'tennisLeader', rating: 4, facilityRating: 4, accessRating: 5, costRating: 4, comment: '수영 후 샤워실 깔끔하고 좋았어요.' },
    { venueKey: 'banpoTennisDeck', authorKey: 'extraSeller', rating: 3, facilityRating: 3, accessRating: 4, costRating: 4, comment: '야외라서 바람이 좀 강할 때 있지만 경치는 최고.' },
    { venueKey: 'taereungIceLab', authorKey: 'swimmingRookie', rating: 4, facilityRating: 4, accessRating: 4, costRating: 3, comment: '수영 훈련 후 얼음 위도 체험해봤어요. 시설 깔끔합니다.' },
  ];

  const matchReviews: MockMatchReviewRecord[] = [
    { matchKey: 'tennisCompleted', authorKey: 'tennisLeader', targetKey: 'tennisPro', mannerRating: 5, skillRating: 4, comment: '매너 좋고 실력도 훌륭했습니다!' },
    { matchKey: 'tennisCompleted', authorKey: 'tennisPro', targetKey: 'tennisLeader', mannerRating: 4, skillRating: 4, comment: '재밌는 복식 경기였어요. 다음에 또 해요.' },
    { matchKey: 'tennisCompleted', authorKey: 'extraSeller', targetKey: 'badmintonLeader', mannerRating: 5, skillRating: 3, comment: '파트너 호흡 잘 맞았습니다.' },
    { matchKey: 'tennisCompleted', authorKey: 'badmintonLeader', targetKey: 'extraSeller', mannerRating: 4, skillRating: 3, comment: '즐거운 테니스 경험이었어요.' },
    { matchKey: 'baseballCompleted', authorKey: 'baseballCaptain', targetKey: 'baseballPitcher', mannerRating: 5, skillRating: 5, comment: '투수와 호흡 환상적이었습니다.' },
    { matchKey: 'baseballCompleted', authorKey: 'baseballPitcher', targetKey: 'baseballCaptain', mannerRating: 5, skillRating: 4, comment: '포수가 리드를 정말 잘 해줬어요.' },
    { matchKey: 'swimCompleted', authorKey: 'swimmerCoach', targetKey: 'swimmingRookie', mannerRating: 4, skillRating: 2, comment: '열심히 따라와 주셔서 감사합니다.' },
    { matchKey: 'swimCompleted', authorKey: 'swimmingRookie', targetKey: 'swimmerCoach', mannerRating: 5, skillRating: 5, comment: '코치님 덕분에 기록 많이 올랐어요!' },
    { matchKey: 'iceCompleted', authorKey: 'iceLeader', targetKey: 'trackCaptain', mannerRating: 5, skillRating: 4, comment: '빙판 수비 도움 많이 됐습니다.' },
    { matchKey: 'iceCompleted', authorKey: 'trackCaptain', targetKey: 'iceLeader', mannerRating: 5, skillRating: 5, comment: '아이스하키 경험 좋았어요. 또 참가하고 싶습니다.' },
    { matchKey: 'iceCompleted', authorKey: 'figureSkater', targetKey: 'iceLeader', mannerRating: 4, skillRating: 5, comment: '매너 좋고 경기 재밌었어요.' },
    { matchKey: 'trackCompleted', authorKey: 'trackCaptain', targetKey: 'figureSkater', mannerRating: 4, skillRating: 4, comment: '함께 달려서 즐거웠어요.' },
    { matchKey: 'trackCompleted', authorKey: 'figureSkater', targetKey: 'trackCaptain', mannerRating: 5, skillRating: 5, comment: '페이스 조율 잘 해주셔서 감사합니다.' },
  ];

  // Generate notifications programmatically (50+)
  const notificationTypes: NotificationType[] = [
    'match_created', 'player_joined', 'match_cancelled', 'match_confirmed',
    'team_announced', 'match_updated', 'payment_confirmed', 'payment_refunded',
    'review_pending', 'badge_earned', 'team_invitation', 'marketplace_order',
    // Task 69 — new types from Wave 0 enum expansion
    'team_application_received', 'team_application_accepted', 'team_application_rejected',
    'team_match_applied', 'team_match_approved', 'team_match_rejected',
    'mercenary_applied', 'mercenary_accepted', 'mercenary_rejected',
    'mercenary_closed', 'mercenary_cancelled',
    'review_received', 'lesson_ticket_purchased',
  ];
  const notificationTitles: Record<string, string> = {
    match_created: '새 매치가 생성되었습니다',
    player_joined: '매치에 새 참가자가 합류했습니다',
    match_cancelled: '매치가 취소되었습니다',
    match_confirmed: '매치가 확정되었습니다',
    team_announced: '팀이 공고를 올렸습니다',
    match_updated: '매치 정보가 변경되었습니다',
    payment_confirmed: '결제가 완료되었습니다',
    payment_refunded: '결제가 환불되었습니다',
    review_pending: '리뷰를 작성해 주세요',
    badge_earned: '새 뱃지를 획득했습니다',
    team_invitation: '팀 초대장이 왔습니다',
    marketplace_order: '장터 주문이 접수되었습니다',
    // Task 69 — new type titles
    team_application_received: '팀 가입 신청이 왔습니다',
    team_application_accepted: '팀 가입 신청이 수락됐습니다',
    team_application_rejected: '팀 가입 신청이 거절됐습니다',
    team_match_applied: '팀 매치 신청이 왔습니다',
    team_match_approved: '팀 매치 신청이 승인됐습니다',
    team_match_rejected: '팀 매치 신청이 거절됐습니다',
    mercenary_applied: '용병 지원이 왔습니다',
    mercenary_accepted: '용병 지원이 수락됐습니다',
    mercenary_rejected: '용병 지원이 거절됐습니다',
    mercenary_closed: '용병 모집이 마감됐습니다',
    mercenary_cancelled: '용병 모집이 취소됐습니다',
    review_received: '리뷰가 등록됐습니다',
    lesson_ticket_purchased: '레슨 티켓이 구매됐습니다',
  };
  const notificationRecipients: MockUserKey[] = [
    'futsalLeader', 'basketballLeader', 'badmintonLeader', 'iceLeader', 'tennisLeader',
    'marketSeller', 'soccerCaptain', 'baseballCaptain', 'volleyballCaptain', 'swimmerCoach',
  ];
  const notifications: MockNotificationRecord[] = Array.from({ length: 70 }, (_, i) => {
    const type = notificationTypes[i % notificationTypes.length];
    const recipient = notificationRecipients[i % notificationRecipients.length];
    return {
      recipientKey: recipient,
      type,
      title: notificationTitles[type] ?? '알림',
      body: `${notificationTitles[type] ?? '알림'} — 자세한 내용은 앱을 확인해주세요.`,
      isRead: i % 3 !== 0,
    };
  });

  const tournaments: MockTournamentRecord[] = [
    {
      title: '서울 풋살 오픈 2026',
      organizerKey: 'futsalLeader',
      sportType: 'futsal',
      status: 'recruiting',
      startDate: in7Days,
      endDate: addDays(today, 21),
      maxParticipants: 160,
      currentParticipants: 60,
      entryFee: 50000,
      description: '서울 전 지역 풋살 팀이 참가하는 오픈 토너먼트입니다. 레벨 제한 없음.',
    },
    {
      title: '한강 3대3 농구 챔피언십',
      organizerKey: 'basketballLeader',
      sportType: 'basketball',
      status: 'ongoing',
      startDate: past7Days,
      endDate: in7Days,
      maxParticipants: 24,
      currentParticipants: 24,
      entryFee: 30000,
      description: '한강 하드우드 코트에서 진행하는 3대3 농구 토너먼트입니다.',
    },
    {
      title: '아이스하키 드래프트 리그 시즌3',
      organizerKey: 'iceLeader',
      sportType: 'ice_hockey',
      status: 'completed',
      startDate: past21Days,
      endDate: past7Days,
      maxParticipants: 36,
      currentParticipants: 36,
      entryFee: 80000,
      description: '잠실 아이스 돔에서 진행된 아이스하키 드래프트 리그 시즌 3입니다.',
    },
    {
      title: '배드민턴 복식 클럽 리그',
      organizerKey: 'badmintonLeader',
      sportType: 'badminton',
      status: 'draft',
      startDate: in11Days,
      endDate: addDays(today, 30),
      maxParticipants: 48,
      currentParticipants: 0,
      entryFee: 20000,
      description: '서초 기반 배드민턴 클럽 리그입니다. 복식 중심으로 운영됩니다.',
    },
  ];

  const settlements: MockSettlementRecord[] = [
    { sourceId: 'mock-pay-tennisCompleted-tennisLeader', type: 'match', amount: 10000, commission: 1000, netAmount: 9000, status: 'completed', recipientKey: 'tennisLeader' },
    { sourceId: 'mock-pay-tennisCompleted-tennisPro', type: 'match', amount: 10000, commission: 1000, netAmount: 9000, status: 'completed', recipientKey: 'tennisLeader' },
    { sourceId: 'mock-pay-baseballCompleted-baseballCaptain', type: 'match', amount: 18000, commission: 1800, netAmount: 16200, status: 'completed', recipientKey: 'baseballCaptain' },
    { sourceId: 'mock-pay-swimCompleted-swimmerCoach', type: 'match', amount: 16000, commission: 1600, netAmount: 14400, status: 'completed', recipientKey: 'swimmerCoach' },
    { sourceId: 'mock-pay-iceCompleted-iceLeader', type: 'match', amount: 25000, commission: 2500, netAmount: 22500, status: 'processing', recipientKey: 'iceLeader' },
    { sourceId: 'mock-order-futsalShoes-soccerMidfielder', type: 'marketplace', amount: 48000, commission: 4800, netAmount: 43200, status: 'completed', recipientKey: 'marketSeller' },
    { sourceId: 'mock-order-tennisBag-extraSeller', type: 'marketplace', amount: 39000, commission: 3900, netAmount: 35100, status: 'pending', recipientKey: 'tennisLeader' },
    { sourceId: 'mock-ticket-futsal-futsalLeader', type: 'lesson', amount: 96000, commission: 9600, netAmount: 86400, status: 'completed', recipientKey: 'futsalLeader' },
  ];

  const reports: MockReportRecord[] = [
    { reporterKey: 'newbieA', targetType: 'user', targetId: 'mock-report-target-1', reason: '비매너 플레이 및 욕설 사용', status: 'pending' },
    { reporterKey: 'newbieB', targetType: 'review', targetId: 'mock-report-target-2', reason: '허위 사실이 포함된 리뷰입니다.', status: 'reviewed' },
    { reporterKey: 'swimmingRookie', targetType: 'listing', targetId: 'mock-report-target-3', reason: '상품 설명과 다른 상태로 발송되었습니다.', status: 'resolved' },
  ];

  const userBadges: MockUserBadgeRecord[] = [
    { userKey: 'futsalLeader', type: 'early_bird', name: '얼리버드', description: '초기 가입 사용자 뱃지입니다.' },
    { userKey: 'basketballLeader', type: 'mvp_10', name: 'MVP 10회', description: 'MVP를 10회 이상 달성한 선수입니다.' },
    { userKey: 'swimmerCoach', type: 'coach', name: '공인 코치', description: '레슨을 성공적으로 운영한 코치입니다.' },
    { userKey: 'iceLeader', type: 'veteran', name: '베테랑', description: '매치 50회 이상 참가한 선수입니다.' },
    { userKey: 'soccerCaptain', type: 'team_leader', name: '팀 리더', description: '팀을 안정적으로 운영하는 리더입니다.' },
    { userKey: 'badmintonLeader', type: 'manner_player', name: '매너 플레이어', description: '매너 점수 4.8 이상을 꾸준히 유지합니다.' },
    { userKey: 'trackCaptain', type: 'speed_demon', name: '속도광', description: '쇼트트랙 스프린트 연속 우승자입니다.' },
    { userKey: 'figureSkater', type: 'artistic', name: '예술파', description: '피겨스케이팅 안무 점수 최우수자입니다.' },
  ];

  const teamTrustScores: MockTeamTrustScoreRecord[] = [
    { teamKey: 'seongsanStrikers', selfLevel: 4, mannerScore: 4.8, lateRate: 2, noShowRate: 0, cancelRate: 3, totalMatches: 24, totalWins: 14 },
    { teamKey: 'hardwoodSixmen', selfLevel: 4, mannerScore: 4.5, lateRate: 5, noShowRate: 2, cancelRate: 5, totalMatches: 18, totalWins: 10 },
    { teamKey: 'shuttleLab', selfLevel: 3, mannerScore: 4.9, lateRate: 0, noShowRate: 0, cancelRate: 1, totalMatches: 12, totalWins: 7 },
    { teamKey: 'blueLine', selfLevel: 5, mannerScore: 4.6, lateRate: 3, noShowRate: 1, cancelRate: 4, totalMatches: 30, totalWins: 19 },
    { teamKey: 'mokdongEleven', selfLevel: 4, mannerScore: 4.7, lateRate: 1, noShowRate: 0, cancelRate: 2, totalMatches: 40, totalWins: 24 },
    { teamKey: 'gocheokSluggers', selfLevel: 4, mannerScore: 4.5, lateRate: 4, noShowRate: 1, cancelRate: 5, totalMatches: 22, totalWins: 13 },
    { teamKey: 'jayangBlockers', selfLevel: 4, mannerScore: 4.6, lateRate: 3, noShowRate: 1, cancelRate: 4, totalMatches: 16, totalWins: 9 },
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
    mercenaryApplications,
    payments,
    marketplaceOrders,
    lessonSchedules,
    lessonTickets,
    lessonAttendances,
    chatRooms,
    chatMessages,
    venueReviews,
    matchReviews,
    notifications,
    tournaments,
    settlements,
    reports,
    userBadges,
    teamTrustScores,
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
