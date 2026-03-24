export const SportType = {
  SOCCER: 'soccer',
  FUTSAL: 'futsal',
  BASKETBALL: 'basketball',
  BADMINTON: 'badminton',
  ICE_HOCKEY: 'ice_hockey',
  FIGURE_SKATING: 'figure_skating',
  SHORT_TRACK: 'short_track',
  SWIMMING: 'swimming',
  TENNIS: 'tennis',
  BASEBALL: 'baseball',
  VOLLEYBALL: 'volleyball',
} as const;

export type SportType = (typeof SportType)[keyof typeof SportType];

export const SportLabel: Record<SportType, string> = {
  soccer: '축구',
  futsal: '풋살',
  basketball: '농구',
  badminton: '배드민턴',
  ice_hockey: '아이스하키',
  figure_skating: '피겨스케이팅',
  short_track: '쇼트트랙',
  swimming: '수영',
  tennis: '테니스',
  baseball: '야구',
  volleyball: '배구',
};

export const MatchStatus = {
  RECRUITING: 'recruiting',
  FULL: 'full',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

export const PaymentStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  REFUNDED: 'refunded',
  FAILED: 'failed',
  PARTIAL_REFUNDED: 'partial_refunded',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const UserLevel = {
  BEGINNER: 1,
  ELEMENTARY: 2,
  INTERMEDIATE: 3,
  ADVANCED: 4,
  EXPERT: 5,
} as const;

export const UserLevelLabel: Record<number, string> = {
  1: '입문',
  2: '초급',
  3: '중급',
  4: '상급',
  5: '고수',
};

export const VenueType = {
  FUTSAL_COURT: 'futsal_court',
  BASKETBALL_COURT: 'basketball_court',
  BADMINTON_COURT: 'badminton_court',
  ICE_RINK: 'ice_rink',
  GYMNASIUM: 'gymnasium',
  SOCCER_FIELD: 'soccer_field',
  SWIMMING_POOL: 'swimming_pool',
  TENNIS_COURT: 'tennis_court',
} as const;

export type VenueType = (typeof VenueType)[keyof typeof VenueType];

export const Positions: Record<string, Record<string, string>> = {
  soccer: {
    GK: '골키퍼',
    DF: '수비수',
    MF: '미드필더',
    FW: '공격수',
    ALL: '올라운더',
  },
  futsal: {
    GK: '골키퍼',
    DF: '수비수',
    MF: '미드필더',
    FW: '공격수',
    ALL: '올라운더',
  },
  basketball: {
    PG: '포인트가드',
    SG: '슈팅가드',
    SF: '스몰포워드',
    PF: '파워포워드',
    C: '센터',
    ALL: '올라운더',
  },
  ice_hockey: {
    GK: '골키퍼',
    DF: '수비수',
    FW: '공격수',
    C: '센터',
    ALL: '올라운더',
  },
  badminton: {
    ALL: '올라운더',
  },
  swimming: {},
  tennis: {},
  baseball: {
    P: '투수',
    C: '포수',
    IF: '내야수',
    OF: '외야수',
    ALL: '올라운더',
  },
  volleyball: {
    S: '세터',
    OH: '아웃사이드 히터',
    MB: '미들 블로커',
    OP: '아포짓 스파이커',
    L: '리베로',
    ALL: '올라운더',
  },
};
