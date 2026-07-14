import type {
  CursorPage,
  V1AdminInquiryDetail,
  V1AdminInquiryRow,
  V1AdminLog,
  V1AdminNoticeRow,
  V1AdminPopupRow,
  V1AdminOverview,
  V1ChatMessage,
  V1ChatRoom,
  V1Home,
  V1Inquiry,
  V1Match,
  V1Notification,
  V1Notice,
  V1Profile,
  V1Region,
  V1RecentSearch,
  V1ReviewDetail,
  V1ReviewListResponse,
  V1ReviewReceivedResponse,
  V1ReviewSourceResponse,
  V1ReviewSubmitResponse,
  V1Settings,
  V1Sport,
  V1Team,
  V1TeamMatch,
  V1User,
} from '@/types/api';

export const v1UserFixture: V1User = {
  id: 'user-1',
  email: 'songjun@example.com',
  displayName: '송준',
  onboardingStatus: 'completed',
};

export const v1SportsFixture: V1Sport[] = [
  { id: 'sport-soccer', name: '축구', levels: [{ id: 'soccer-beginner', name: '입문' }, { id: 'soccer-novice', name: '초보' }, { id: 'soccer-intermediate', name: '중수' }, { id: 'soccer-advanced', name: '고수' }] },
  { id: 'sport-futsal', name: '풋살', levels: [{ id: 'futsal-beginner', name: '입문' }, { id: 'futsal-novice', name: '초보' }, { id: 'futsal-intermediate', name: '중수' }, { id: 'futsal-advanced', name: '고수' }] },
  { id: 'sport-running', name: '러닝', levels: [{ id: 'running-beginner', name: '입문' }, { id: 'running-novice', name: '초보' }, { id: 'running-intermediate', name: '중수' }, { id: 'running-advanced', name: '고수' }] },
  { id: 'sport-swimming', name: '수영', levels: [{ id: 'swimming-beginner', name: '입문' }, { id: 'swimming-novice', name: '초보' }, { id: 'swimming-intermediate', name: '중수' }, { id: 'swimming-advanced', name: '고수' }] },
];

const v1RegionGroups = [
  ['seoul', '서울', ['종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구']],
  ['busan', '부산', ['중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군']],
  ['daegu', '대구', ['중구', '동구', '서구', '남구', '북구', '수성구', '달서구', '달성군', '군위군']],
  ['incheon', '인천', ['중구', '동구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '강화군', '옹진군']],
  ['gwangju', '광주', ['동구', '서구', '남구', '북구', '광산구']],
  ['daejeon', '대전', ['동구', '중구', '서구', '유성구', '대덕구']],
  ['ulsan', '울산', ['중구', '남구', '동구', '북구', '울주군']],
  ['sejong', '세종', ['세종시']],
  ['gyeonggi', '경기', ['수원시', '성남시', '의정부시', '안양시', '부천시', '광명시', '평택시', '동두천시', '안산시', '고양시', '과천시', '구리시', '남양주시', '오산시', '시흥시', '군포시', '의왕시', '하남시', '용인시', '파주시', '이천시', '안성시', '김포시', '화성시', '광주시', '양주시', '포천시', '여주시', '연천군', '가평군', '양평군']],
  ['gangwon', '강원', ['춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시', '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군', '양구군', '인제군', '고성군', '양양군']],
  ['chungbuk', '충북', ['청주시', '충주시', '제천시', '보은군', '옥천군', '영동군', '증평군', '진천군', '괴산군', '음성군', '단양군']],
  ['chungnam', '충남', ['천안시', '공주시', '보령시', '아산시', '서산시', '논산시', '계룡시', '당진시', '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군', '태안군']],
  ['jeonbuk', '전북', ['전주시', '군산시', '익산시', '정읍시', '남원시', '김제시', '완주군', '진안군', '무주군', '장수군', '임실군', '순창군', '고창군', '부안군']],
  ['jeonnam', '전남', ['목포시', '여수시', '순천시', '나주시', '광양시', '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군', '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군']],
  ['gyeongbuk', '경북', ['포항시', '경주시', '김천시', '안동시', '구미시', '영주시', '영천시', '상주시', '문경시', '경산시', '의성군', '청송군', '영양군', '영덕군', '청도군', '고령군', '성주군', '칠곡군', '예천군', '봉화군', '울진군', '울릉군']],
  ['gyeongnam', '경남', ['창원시', '진주시', '통영시', '사천시', '김해시', '밀양시', '거제시', '양산시', '의령군', '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군']],
  ['jeju', '제주', ['제주시', '서귀포시']],
] as const;

function toRegionCode(parentCode: string, name: string) {
  const romanized: Record<string, string> = {
    강남구: 'gangnam', 강동구: 'gangdong', 강북구: 'gangbuk', 강서구: 'gangseo', 강화군: 'ganghwa', 강릉시: 'gangneung', 강진군: 'gangjin',
    거제시: 'geoje', 거창군: 'geochang', 경산시: 'gyeongsan', 경주시: 'gyeongju', 계룡시: 'gyeryong', 계양구: 'gyeyang', 고령군: 'goryeong', 고성군: 'goseong', 고양시: 'goyang', 고창군: 'gochang', 고흥군: 'goheung', 곡성군: 'gokseong', 공주시: 'gongju', 과천시: 'gwacheon', 관악구: 'gwanak', 광명시: 'gwangmyeong', 광산구: 'gwangsan', 광양시: 'gwangyang', 광주시: 'gwangju', 광진구: 'gwangjin', 괴산군: 'goesan', 구례군: 'gurye', 구로구: 'guro', 구리시: 'guri', 구미시: 'gumi', 군산시: 'gunsan', 군위군: 'gunwi', 군포시: 'gunpo', 금산군: 'geumsan', 금정구: 'geumjeong', 금천구: 'geumcheon', 기장군: 'gijang', 김제시: 'gimje', 김천시: 'gimcheon', 김포시: 'gimpo', 김해시: 'gimhae',
    나주시: 'naju', 남구: 'nam', 남동구: 'namdong', 남양주시: 'namyangju', 남원시: 'namwon', 남해군: 'namhae', 노원구: 'nowon', 논산시: 'nonsan',
    단양군: 'danyang', 달서구: 'dalseo', 달성군: 'dalseong', 담양군: 'damyang', 당진시: 'dangjin', 대덕구: 'daedeok', 도봉구: 'dobong', 동구: 'dong', 동대문구: 'dongdaemun', 동두천시: 'dongducheon', 동래구: 'dongnae', 동작구: 'dongjak', 동해시: 'donghae',
    마포구: 'mapo', 목포시: 'mokpo', 무안군: 'muan', 무주군: 'muju', 문경시: 'mungyeong', 미추홀구: 'michuhol', 밀양시: 'miryang',
    보령시: 'boryeong', 보성군: 'boseong', 보은군: 'boeun', 봉화군: 'bonghwa', 부산진구: 'busanjin', 부안군: 'buan', 부여군: 'buyeo', 부천시: 'bucheon', 부평구: 'bupyeong', 북구: 'buk',
    사상구: 'sasang', 사천시: 'sacheon', 사하구: 'saha', 산청군: 'sancheong', 삼척시: 'samcheok', 상주시: 'sangju', 서구: 'seo', 서귀포시: 'seogwipo', 서대문구: 'seodaemun', 서산시: 'seosan', 서천군: 'seocheon', 서초구: 'seocho', 성남시: 'seongnam', 성동구: 'seongdong', 성북구: 'seongbuk', 성주군: 'seongju', 세종시: 'city', 속초시: 'sokcho', 송파구: 'songpa', 수성구: 'suseong', 수영구: 'suyeong', 수원시: 'suwon', 순창군: 'sunchang', 순천시: 'suncheon', 시흥시: 'siheung', 신안군: 'sinan',
    아산시: 'asan', 안동시: 'andong', 안산시: 'ansan', 안성시: 'anseong', 안양시: 'anyang', 양구군: 'yanggu', 양산시: 'yangsan', 양양군: 'yangyang', 양주시: 'yangju', 양천구: 'yangcheon', 양평군: 'yangpyeong', 여수시: 'yeosu', 여주시: 'yeoju', 연수구: 'yeonsu', 연제구: 'yeonje', 연천군: 'yeoncheon', 영광군: 'yeonggwang', 영덕군: 'yeongdeok', 영도구: 'yeongdo', 영동군: 'yeongdong', 영등포구: 'yeongdeungpo', 영암군: 'yeongam', 영양군: 'yeongyang', 영월군: 'yeongwol', 영주시: 'yeongju', 영천시: 'yeongcheon', 예산군: 'yesan', 예천군: 'yecheon', 오산시: 'osan', 옥천군: 'okcheon', 완도군: 'wando', 완주군: 'wanju', 용산구: 'yongsan', 용인시: 'yongin', 울릉군: 'ulleung', 울주군: 'ulju', 울진군: 'uljin', 원주시: 'wonju', 유성구: 'yuseong', 은평구: 'eunpyeong', 음성군: 'eumseong', 의령군: 'uiryeong', 의성군: 'uiseong', 의왕시: 'uiwang', 의정부시: 'uijeongbu', 이천시: 'icheon', 익산시: 'iksan', 인제군: 'inje',
    장성군: 'jangseong', 장수군: 'jangsu', 장흥군: 'jangheung', 전주시: 'jeonju', 정선군: 'jeongseon', 정읍시: 'jeongeup', 제주시: 'jeju', 제천시: 'jecheon', 종로구: 'jongno', 중구: 'jung', 중랑구: 'jungnang', 증평군: 'jeungpyeong', 진도군: 'jindo', 진안군: 'jinan', 진주시: 'jinju', 진천군: 'jincheon',
    창녕군: 'changnyeong', 창원시: 'changwon', 천안시: 'cheonan', 철원군: 'cheorwon', 청도군: 'cheongdo', 청송군: 'cheongsong', 청양군: 'cheongyang', 청주시: 'cheongju', 춘천시: 'chuncheon', 충주시: 'chungju', 칠곡군: 'chilgok',
    태백시: 'taebaek', 태안군: 'taean', 통영시: 'tongyeong',
    파주시: 'paju', 평창군: 'pyeongchang', 평택시: 'pyeongtaek', 포천시: 'pocheon', 포항시: 'pohang',
    하남시: 'hanam', 하동군: 'hadong', 함안군: 'haman', 함양군: 'hamyang', 함평군: 'hampyeong', 합천군: 'hapcheon', 해남군: 'haenam', 해운대구: 'haeundae', 홍성군: 'hongseong', 홍천군: 'hongcheon', 화성시: 'hwaseong', 화순군: 'hwasun', 화천군: 'hwacheon', 횡성군: 'hoengseong',
  };
  return `${parentCode}-${romanized[name] ?? name}`;
}

export const v1RegionsFixture: V1Region[] = v1RegionGroups.map(([code, name, children]) => {
  const parentId = `region-${code}`;
  return {
    id: parentId,
    code,
    name,
    parentId: null,
    level: 1,
    children: children.map((childName) => ({
      id: `region-${toRegionCode(code, childName)}`,
      code: toRegionCode(code, childName),
      name: childName,
      parentId,
      level: 2,
    })),
  };
});

export const v1RecentSearchesFixture: V1RecentSearch[] = [
  { id: 'recent-1', query: '풋살', searchedAt: '2026-05-18T09:00:00.000Z' },
  { id: 'recent-2', query: '마포', searchedAt: '2026-05-18T08:00:00.000Z' },
];

export const v1InquiriesFixture: { items: V1Inquiry[]; pageInfo: { nextCursor: string | null; hasNext: boolean } } = {
  items: [
    {
      inquiryId: 'inquiry-1',
      category: 'account',
      title: '로그인 문의',
      body: '이메일 로그인 과정에서 도움이 필요해요.',
      contact: null,
      relatedType: null,
      relatedId: null,
      status: 'received',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
      closedAt: null,
      replies: [],
    },
  ],
  pageInfo: { nextCursor: null, hasNext: false },
};

export function toAdminInquiryRow(inquiry: V1Inquiry): V1AdminInquiryRow {
  return {
    inquiryId: inquiry.inquiryId,
    userId: 'user-1',
    isGuest: false,
    requesterName: '송준',
    requesterEmail: 'songjun@example.com',
    guestEmail: null,
    guestPhone: null,
    category: inquiry.category,
    title: inquiry.title,
    status: inquiry.status,
    relatedType: inquiry.relatedType,
    relatedId: inquiry.relatedId,
    replyCount: inquiry.replies?.length ?? 0,
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
    closedAt: inquiry.closedAt,
  };
}

export function toAdminInquiryDetail(inquiry: V1Inquiry): V1AdminInquiryDetail {
  return {
    ...toAdminInquiryRow(inquiry),
    body: inquiry.body,
    contact: inquiry.contact,
    replies: (inquiry.replies ?? []).map((reply) => ({ ...reply, adminUserId: 'admin-1' })),
  };
}

export const v1NoticesFixture: V1Notice[] = [
  {
    id: 'notice-1',
    title: '이번 주 이용 안내',
    category: '안내',
    publishedAt: '2026-05-18T00:00:00.000Z',
    body: '주말 경기장 입장 시간과 체크인 안내',
  },
  {
    id: 'notice-2',
    title: '매너 점수 업데이트',
    category: '업데이트',
    publishedAt: '2026-05-17T00:00:00.000Z',
    body: '경기 후 리뷰 반영 기준 안내',
  },
  {
    id: 'notice-3',
    title: '비 예보 경기 안내',
    category: '안내',
    publishedAt: '2026-05-16T00:00:00.000Z',
    body: '우천 시 취소와 환불 기준 확인',
  },
  {
    id: 'notice-4',
    title: '계정 보안 안내',
    category: '안내',
    publishedAt: '2026-05-15T00:00:00.000Z',
    body: '이메일, 휴대폰 번호, 생년월일 같은 개인정보는 공개 프로필에 노출하지 않습니다.',
  },
];

export const v1AdminNoticesFixture: V1AdminNoticeRow[] = v1NoticesFixture.map((notice) => ({
  noticeId: notice.id ?? notice.noticeId ?? 'notice',
  audience: (notice.audience ?? 'public') as V1AdminNoticeRow['audience'],
  category: (notice.category ?? '안내') as V1AdminNoticeRow['category'],
  title: notice.title,
  body: notice.body ?? '',
  status: 'published',
  publishedAt: notice.publishedAt,
  archivedAt: null,
  createdAt: notice.publishedAt,
  updatedAt: notice.publishedAt,
}));

export const v1AdminPopupsFixture: V1AdminPopupRow[] = [{
  popupId: 'popup-1',
  audience: 'public',
  title: '이번 주 홈 팝업',
  body: '주말 경기장 입장 시간과 체크인 안내',
  status: 'published',
  publishedAt: '2026-05-18T00:00:00.000Z',
  archivedAt: null,
  displayStartAt: null,
  displayEndAt: null,
  createdAt: '2026-05-18T00:00:00.000Z',
  updatedAt: '2026-05-18T00:00:00.000Z',
}];
export const v1MatchesFixture: V1Match[] = [
  {
    id: 'match-1',
    title: '성수 풋살장 동네 5:5',
    sportName: '풋살',
    levelLabel: '초보-중수',
    minLevel: { code: 'novice', name: '초보' },
    maxLevel: { code: 'intermediate', name: '중수' },
    placeName: '성수 실내풋살장',
    startsAt: '2026-05-18T20:00:00.000Z',
    capacityText: '7/10명',
    status: 'open',
    ctaState: 'can_apply',
  },
];

export const v1TeamsFixture: V1Team[] = [
  {
    id: 'team-1',
    name: '성수 볼러즈',
    sportName: '풋살',
    regionName: '서울 강동',
    memberCount: 18,
    trustState: 'verified',
    joinPolicy: 'approval_required',
    levelLabel: '초보-중수',
    minLevel: { code: 'novice', name: '초보' },
    maxLevel: { code: 'intermediate', name: '중수' },
  },
];

export const v1TeamMatchesFixture: V1TeamMatch[] = [
  {
    id: 'team-match-1',
    title: '마포 FC 상대팀 모집',
    sportName: '축구',
    levelLabel: 'A-',
    minLevel: { code: 'advanced', name: '고수' },
    maxLevel: { code: 'advanced', name: '고수' },
    placeName: '마포 월드컵 보조구장',
    startsAt: '2026-05-22T21:00:00.000Z',
    capacityText: '상대 0/1팀',
    status: 'open',
    hostTeamId: 'team-1',
    hostTeamName: '마포 FC',
    applicantTeamState: 'eligible',
  },
];

export const v1WrittenReviewFixture: V1ReviewDetail = {
  reviewId: 'review-written-1',
  sourceType: 'match',
  sourceId: 'match-completed-1',
  targetType: 'user',
  targetUser: { userId: 'user-2', name: '민준', imageUrl: null },
  targetTeam: null,
  reviewerUser: { userId: 'user-1', name: '송준', imageUrl: null },
  reviewerTeam: null,
  rating: 5,
  tags: [
    { tagCode: 'manner', label: '매너가 좋아요' },
    { tagCode: 'teamwork', label: '팀워크가 좋아요' },
  ],
  status: 'submitted',
  submittedAt: '2026-05-18T22:10:00.000Z',
};

export const v1TeamWrittenReviewFixture: V1ReviewDetail = {
  reviewId: 'review-team-written-1',
  sourceType: 'team_match',
  sourceId: 'team-match-completed-1',
  targetType: 'team',
  targetUser: null,
  targetTeam: { teamId: 'team-2', name: '마포 FC', imageUrl: null },
  reviewerUser: { userId: 'user-1', name: '송준', imageUrl: null },
  reviewerTeam: { teamId: 'team-1', name: '성수 볼러즈', imageUrl: null },
  rating: 4,
  tags: [
    { tagCode: 'punctual', label: '시간 약속을 잘 지켜요' },
    { tagCode: 'communication', label: '소통이 원활해요' },
  ],
  status: 'submitted',
  submittedAt: '2026-05-19T22:10:00.000Z',
};

export const v1ReviewsPendingFixture: V1ReviewListResponse = {
  items: [
    {
      sourceType: 'match',
      sourceId: 'match-completed-1',
      title: '성수 풋살파크 개인 매치',
      completedAt: '2026-05-18T21:30:00.000Z',
      targetType: 'user',
      targetCount: 3,
      reviewedCount: 1,
      remainingCount: 2,
      state: 'ready',
    },
    {
      sourceType: 'team_match',
      sourceId: 'team-match-completed-1',
      title: '성수 볼러즈 vs 마포 FC',
      completedAt: '2026-05-19T21:30:00.000Z',
      targetType: 'team',
      targetCount: 1,
      reviewedCount: 0,
      remainingCount: 1,
      reviewerTeam: { teamId: 'team-1', name: '성수 볼러즈' },
      targetTeam: { teamId: 'team-2', name: '마포 FC' },
      state: 'ready',
    },
  ],
  pageInfo: { nextCursor: null, hasNext: false },
};

export const v1ReviewsWrittenFixture: V1ReviewListResponse = {
  items: [
    {
      sourceType: 'match',
      sourceId: 'match-completed-1',
      title: '성수 풋살파크 개인 매치',
      completedAt: '2026-05-18T21:30:00.000Z',
      targetType: 'user',
      targetCount: 3,
      reviewedCount: 3,
      remainingCount: 0,
      state: 'done',
    },
    {
      sourceType: 'team_match',
      sourceId: 'team-match-completed-1',
      title: '성수 볼러즈 vs 마포 FC',
      completedAt: '2026-05-19T21:30:00.000Z',
      targetType: 'team',
      targetCount: 1,
      reviewedCount: 1,
      remainingCount: 0,
      reviewerTeam: { teamId: 'team-1', name: '성수 볼러즈' },
      targetTeam: { teamId: 'team-2', name: '마포 FC' },
      state: 'done',
    },
  ],
  pageInfo: { nextCursor: null, hasNext: false },
};

export const v1ReviewsReceivedFixture: V1ReviewReceivedResponse = {
  items: [
    {
      reviewId: 'review-received-1',
      sourceType: 'match',
      sourceId: 'match-completed-1',
      targetType: 'user',
      targetUser: { userId: 'user-1', name: '송준', imageUrl: null },
      targetTeam: null,
      reviewerUser: { userId: 'user-2', name: '민준', imageUrl: null },
      reviewerTeam: null,
      rating: 5,
      tags: [{ tagCode: 'play_again', label: '또 같이 운동하고 싶어요' }],
      status: 'submitted',
      submittedAt: '2026-05-18T22:14:00.000Z',
    },
    {
      reviewId: 'review-team-received-1',
      sourceType: 'team_match',
      sourceId: 'team-match-completed-1',
      targetType: 'team',
      targetUser: null,
      targetTeam: { teamId: 'team-1', name: '성수 볼러즈', imageUrl: null },
      reviewerUser: { userId: 'user-3', name: '도윤', imageUrl: null },
      reviewerTeam: { teamId: 'team-2', name: '마포 FC', imageUrl: null },
      rating: 4,
      tags: [{ tagCode: 'communication', label: '소통이 원활해요' }],
      status: 'submitted',
      submittedAt: '2026-05-19T22:14:00.000Z',
    },
  ],
  pageInfo: { nextCursor: null, hasNext: false },
};

export const v1ReviewMatchSourceFixture: V1ReviewSourceResponse = {
  source: {
    sourceType: 'match',
    sourceId: 'match-completed-1',
    title: '성수 풋살파크 개인 매치',
    completedAt: '2026-05-18T21:30:00.000Z',
  },
  reviewerTeam: null,
  targets: [
    {
      targetType: 'user',
      targetUserId: 'user-2',
      targetTeamId: null,
      name: '민준',
      imageUrl: null,
      subtitle: '개인 매치 참가자',
      alreadySubmitted: true,
      review: v1WrittenReviewFixture,
      locked: true,
      lockReason: 'ALREADY_SUBMITTED',
    },
    {
      targetType: 'user',
      targetUserId: 'user-3',
      targetTeamId: null,
      name: '서연',
      imageUrl: null,
      subtitle: '개인 매치 참가자',
      alreadySubmitted: false,
      review: null,
      locked: false,
      lockReason: null,
    },
  ],
};

export const v1ReviewTeamMatchSourceFixture: V1ReviewSourceResponse = {
  source: {
    sourceType: 'team_match',
    sourceId: 'team-match-completed-1',
    title: '성수 볼러즈 vs 마포 FC',
    completedAt: '2026-05-19T21:30:00.000Z',
  },
  reviewerTeam: { teamId: 'team-1', name: '성수 볼러즈', role: 'owner' },
  targets: [
    {
      targetType: 'team',
      targetUserId: null,
      targetTeamId: 'team-2',
      name: '마포 FC',
      imageUrl: null,
      subtitle: '상대 팀',
      alreadySubmitted: false,
      review: null,
      locked: false,
      lockReason: null,
    },
  ],
};

export const v1ReviewSubmitFixture: V1ReviewSubmitResponse = {
  review: v1TeamWrittenReviewFixture,
  alreadySubmitted: false,
};

export const v1ChatRoomsFixture: CursorPage<V1ChatRoom> = {
  items: [
    {
      roomId: 'chat-1',
      roomType: 'match',
      title: '성수 풋살장 동네 5:5',
      status: 'active',
      linkedTarget: { type: 'match', id: 'match-1', title: '성수 풋살장 동네 5:5', route: '/matches/match-1' },
      lastMessage: {
        messageId: 'message-1',
        contentPreview: '오늘 경기 전 준비물을 확인해 주세요.',
        sentAt: '2026-05-18T09:00:00.000Z',
      },
      unreadCount: 2,
      pinned: false,
      muted: false,
      mutedUntil: null,
    },
  ],
  nextCursor: null,
};

export const v1ChatMessagesFixture: CursorPage<V1ChatMessage> = {
  items: [
    {
      messageId: 'message-1',
      sender: { userId: 'user-2', displayName: '상대', profileImageUrl: null },
      content: '오늘 경기 전 준비물을 확인해 주세요.',
      status: 'sent',
      sentAt: '2026-05-18T09:00:00.000Z',
      mine: false,
    },
  ],
  nextCursor: null,
};

v1ChatRoomsFixture.items = [
  {
    roomId: 'chat-match-1',
    roomType: 'match',
    title: '성수 풋살 5:5',
    status: 'active',
    linkedTarget: { type: 'match', id: 'match-1', title: '성수 풋살 5:5', route: '/matches/match-1' },
    lastMessage: { messageId: 'chat-match-1-m3', contentPreview: '오늘 경기 준비물 확인해 주세요', sentAt: '2026-05-18T09:00:00.000Z' },
    unreadCount: 2,
    pinned: true,
    muted: false,
    mutedUntil: null,
  },
  {
    roomId: 'chat-match-2',
    roomType: 'match',
    title: '강동 러닝 번개',
    status: 'active',
    linkedTarget: { type: 'match', id: 'match-2', title: '강동 러닝 번개', route: '/matches/match-2' },
    lastMessage: { messageId: 'chat-match-2-m3', contentPreview: '나: 10분 전에 도착할게요', sentAt: '2026-05-18T08:40:00.000Z' },
    unreadCount: 0,
    pinned: false,
    muted: false,
    mutedUntil: null,
  },
  {
    roomId: 'chat-team-1',
    roomType: 'team',
    title: '성수 러너스 FC',
    status: 'active',
    linkedTarget: { type: 'team', id: 'team-1', title: '성수 러너스 FC', route: '/teams/team-1' },
    lastMessage: { messageId: 'chat-team-1-m3', contentPreview: '새 멤버 신청이 들어왔어요', sentAt: '2026-05-18T08:20:00.000Z' },
    unreadCount: 4,
    pinned: false,
    muted: false,
    mutedUntil: null,
  },
  {
    roomId: 'chat-team-2',
    roomType: 'team',
    title: '강동 위클리 풋살',
    status: 'active',
    linkedTarget: { type: 'team', id: 'team-2', title: '강동 위클리 풋살', route: '/teams/team-2' },
    lastMessage: { messageId: 'chat-team-2-m3', contentPreview: '나: 회비 공지 올려둘게요', sentAt: '2026-05-17T22:00:00.000Z' },
    unreadCount: 0,
    pinned: false,
    muted: false,
    mutedUntil: null,
  },
  {
    roomId: 'chat-team-match-1',
    roomType: 'team_match',
    title: '마포 FC 팀매치',
    status: 'active',
    linkedTarget: { type: 'team_match', id: 'team-match-1', title: '마포 FC 팀매치', route: '/team-matches/team-match-1' },
    lastMessage: { messageId: 'chat-team-match-1-m3', contentPreview: '상대팀 유니폼은 흰색입니다', sentAt: '2026-05-17T21:10:00.000Z' },
    unreadCount: 1,
    pinned: false,
    muted: false,
    mutedUntil: null,
  },
  {
    roomId: 'chat-team-match-2',
    roomType: 'team_match',
    title: '잠실 교환매치',
    status: 'active',
    linkedTarget: { type: 'team_match', id: 'team-match-2', title: '잠실 교환매치', route: '/team-matches/team-match-2' },
    lastMessage: { messageId: 'chat-team-match-2-m3', contentPreview: '나: 심판 섭외는 제가 할게요', sentAt: '2026-05-16T20:30:00.000Z' },
    unreadCount: 0,
    pinned: false,
    muted: false,
    mutedUntil: null,
  },
];

export const v1ChatMessagesByRoomFixture: Record<string, CursorPage<V1ChatMessage>> = {
  'chat-match-1': {
    items: [
      { messageId: 'chat-match-1-m3', sender: { userId: 'user-2', displayName: '상대팀장', profileImageUrl: null }, content: '오늘 경기 준비물 확인해 주세요', status: 'sent', sentAt: '2026-05-18T09:00:00.000Z', mine: false },
      { messageId: 'chat-match-1-m2', sender: { userId: 'user-1', displayName: '나', profileImageUrl: null }, content: '네, 조끼랑 물 챙겨갈게요', status: 'sent', sentAt: '2026-05-18T08:52:00.000Z', mine: true },
      { messageId: 'chat-match-1-m1', sender: { userId: 'user-2', displayName: '상대팀장', profileImageUrl: null }, content: '오늘 20시에 바로 시작합니다', status: 'sent', sentAt: '2026-05-18T08:40:00.000Z', mine: false },
    ],
    nextCursor: null,
  },
  'chat-match-2': {
    items: [
      { messageId: 'chat-match-2-m3', sender: { userId: 'user-1', displayName: '나', profileImageUrl: null }, content: '10분 전에 도착할게요', status: 'sent', sentAt: '2026-05-18T08:40:00.000Z', mine: true },
      { messageId: 'chat-match-2-m2', sender: { userId: 'user-3', displayName: '러닝메이트', profileImageUrl: null }, content: '출발은 한강공원 입구에서 해요', status: 'sent', sentAt: '2026-05-18T08:30:00.000Z', mine: false },
      { messageId: 'chat-match-2-m1', sender: { userId: 'user-1', displayName: '나', profileImageUrl: null }, content: '오늘 페이스는 어느 정도인가요?', status: 'sent', sentAt: '2026-05-18T08:20:00.000Z', mine: true },
    ],
    nextCursor: null,
  },
  'chat-team-1': {
    items: [
      { messageId: 'chat-team-1-m3', sender: { userId: 'user-4', displayName: '운영진', profileImageUrl: null }, content: '새 멤버 신청이 들어왔어요', status: 'sent', sentAt: '2026-05-18T08:20:00.000Z', mine: false },
      { messageId: 'chat-team-1-m2', sender: { userId: 'user-5', displayName: '민준', profileImageUrl: null }, content: '이번 주 정기전 참석 가능합니다', status: 'sent', sentAt: '2026-05-18T08:00:00.000Z', mine: false },
      { messageId: 'chat-team-1-m1', sender: { userId: 'user-1', displayName: '나', profileImageUrl: null }, content: '참석 여부 오늘 안에 남겨주세요', status: 'sent', sentAt: '2026-05-18T07:50:00.000Z', mine: true },
    ],
    nextCursor: null,
  },
  'chat-team-2': {
    items: [
      { messageId: 'chat-team-2-m3', sender: { userId: 'user-1', displayName: '나', profileImageUrl: null }, content: '회비 공지 올려둘게요', status: 'sent', sentAt: '2026-05-17T22:00:00.000Z', mine: true },
      { messageId: 'chat-team-2-m2', sender: { userId: 'user-6', displayName: '서연', profileImageUrl: null }, content: '다음 주 대관비 먼저 확인해볼게요', status: 'sent', sentAt: '2026-05-17T21:50:00.000Z', mine: false },
      { messageId: 'chat-team-2-m1', sender: { userId: 'user-1', displayName: '나', profileImageUrl: null }, content: '이번 달 회비 정리하겠습니다', status: 'sent', sentAt: '2026-05-17T21:40:00.000Z', mine: true },
    ],
    nextCursor: null,
  },
  'chat-team-match-1': {
    items: [
      { messageId: 'chat-team-match-1-m3', sender: { userId: 'user-7', displayName: '마포FC', profileImageUrl: null }, content: '상대팀 유니폼은 흰색입니다', status: 'sent', sentAt: '2026-05-17T21:10:00.000Z', mine: false },
      { messageId: 'chat-team-match-1-m2', sender: { userId: 'user-1', displayName: '나', profileImageUrl: null }, content: '저희는 파란색으로 맞추겠습니다', status: 'sent', sentAt: '2026-05-17T21:00:00.000Z', mine: true },
      { messageId: 'chat-team-match-1-m1', sender: { userId: 'user-7', displayName: '마포FC', profileImageUrl: null }, content: '경기장 도착은 30분 전이면 됩니다', status: 'sent', sentAt: '2026-05-17T20:50:00.000Z', mine: false },
    ],
    nextCursor: null,
  },
  'chat-team-match-2': {
    items: [
      { messageId: 'chat-team-match-2-m3', sender: { userId: 'user-1', displayName: '나', profileImageUrl: null }, content: '심판 섭외는 제가 할게요', status: 'sent', sentAt: '2026-05-16T20:30:00.000Z', mine: true },
      { messageId: 'chat-team-match-2-m2', sender: { userId: 'user-8', displayName: '잠실팀', profileImageUrl: null }, content: '공은 저희가 준비하겠습니다', status: 'sent', sentAt: '2026-05-16T20:20:00.000Z', mine: false },
      { messageId: 'chat-team-match-2-m1', sender: { userId: 'user-1', displayName: '나', profileImageUrl: null }, content: '교환매치 조건 확인했습니다', status: 'sent', sentAt: '2026-05-16T20:10:00.000Z', mine: true },
    ],
    nextCursor: null,
  },
};

export const v1NotificationsFixture = {
  items: [
    {
      notificationId: 'notification-1',
      type: 'match',
      title: '매치 참가 확정',
      body: '성수 풋살파크 · 10명 · 현장 준비 필요',
      target: { type: 'match', id: 'match-1', route: '/matches/match-1' },
      status: 'created',
      readAt: null,
      createdAt: '2026-05-24T08:05:00.000Z',
    },
    {
      notificationId: 'notification-2',
      type: 'team_match',
      title: '팀매치 신청 도착',
      body: '상대팀 신청이 들어왔어요. 조건을 확인해 주세요.',
      target: { type: 'team_match', id: 'team-match-1', route: '/team-matches/team-match-1' },
      status: 'created',
      readAt: null,
      createdAt: '2026-05-24T07:50:00.000Z',
    },
    {
      notificationId: 'notification-3',
      type: 'chat',
      title: '새 메시지',
      body: '주말 풋살 매치 채팅방에 새 메시지가 있어요.',
      target: { type: 'chat', id: 'chat-1', route: '/chat/rooms/chat-1' },
      status: 'read',
      readAt: '2026-05-24T08:10:00.000Z',
      createdAt: '2026-05-23T10:00:00.000Z',
    },
    {
      notificationId: 'notification-4',
      type: 'notice',
      title: '공지 업데이트',
      body: '이번 주 고정 공지가 업데이트됐어요.',
      target: { type: 'notice', id: 'notice-1', route: '/notices/notice-1' },
      status: 'read',
      readAt: '2026-05-24T08:12:00.000Z',
      createdAt: '2026-05-21T08:30:00.000Z',
    },
  ],
  nextCursor: null,
  unreadCount: 2,
};

export const v1ProfileFixture: V1Profile = {
  userId: 'user-1',
  accountStatus: 'active',
  email: 'host@teameet.v1',
  authProvider: 'email',
  profile: {
    gender: 'male',
    displayName: '송준',
    profileImageUrl: null,
  },
  reputation: {
    trustState: 'sample',
    mannerScore: 4.8,
    activityCount: 12,
    reviewCount: 5,
  },
  displayName: '송준',
  regionName: '서울 강동',
  trustState: 'sample',
};

export const v1SettingsFixture: V1Settings = {
  account: {
    email: 'host@teameet.v1',
    phone: null,
    accountStatus: 'active',
    providers: ['password'],
  },
  profile: {
    displayName: '송준',
  },
  notifications: {
    matchEnabled: true,
    teamEnabled: true,
    teamMatchEnabled: true,
    chatEnabled: true,
    noticeEnabled: true,
    marketingEnabled: false,
  },
};

export const v1HomeFixture: V1Home = {
  popup: {
    popupId: 'popup-1',
    title: '이번 주 홈 팝업',
    body: '주말 경기장 입장 시간과 체크인 안내',
    publishedAt: '2026-05-18T00:00:00.000Z',
  },
  notices: v1NoticesFixture,
  recommendedMatches: v1MatchesFixture,
  recommendedTeamMatches: v1TeamMatchesFixture,
  recommendedTeams: v1TeamsFixture,
};

export const v1AdminOverviewFixture: V1AdminOverview = {
  users: { active: 10, suspended: 1, blocked: 1, withdrawalPending: 0 },
  matches: { recruiting: 2, cancelled: 0, completed: 1 },
  teams: { active: 4, suspended: 0, archived: 0 },
  teamMatches: { recruiting: 1, matched: 1, cancelled: 0 },
  recentActions: [
    { actionLogId: 'alog-1', actionType: 'user.status.update', targetType: 'user', createdAt: '2026-05-18T09:00:00.000Z' },
  ],
};

export const v1AdminLogsFixture: CursorPage<V1AdminLog> = {
  items: [
    {
      actionLogId: 'admin-log-1',
      adminUserId: 'admin-1',
      actionType: 'user.status.update',
      targetType: 'user',
      targetId: 'user-1',
      reason: 'smoke test',
      beforeState: null,
      afterState: null,
      createdAt: '2026-05-18T09:00:00.000Z',
    },
  ],
  nextCursor: null,
};
