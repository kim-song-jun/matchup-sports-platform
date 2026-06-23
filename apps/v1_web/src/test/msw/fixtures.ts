import type {
  CursorPage,
  V1AdminLog,
  V1AdminOverview,
  V1ChatMessage,
  V1ChatRoom,
  V1Home,
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

export const v1RegionsFixture: V1Region[] = [
  {
    id: 'region-seoul',
    code: 'seoul',
    name: '서울',
    parentId: null,
    level: 1,
    children: [
      { id: 'region-gangdong', code: 'seoul-gangdong', name: '강동구', parentId: 'region-seoul', level: 2 },
      { id: 'region-songpa', code: 'seoul-songpa', name: '송파구', parentId: 'region-seoul', level: 2 },
    ],
  },
  {
    id: 'region-busan',
    code: 'busan',
    name: '부산',
    parentId: null,
    level: 1,
    children: [
      { id: 'region-busan-haeundae', code: 'busan-haeundae', name: '해운대구', parentId: 'region-busan', level: 2 },
      { id: 'region-busan-suyeong', code: 'busan-suyeong', name: '수영구', parentId: 'region-busan', level: 2 },
    ],
  },
  {
    id: 'region-jeju',
    code: 'jeju',
    name: '제주',
    parentId: null,
    level: 1,
    children: [
      { id: 'region-jeju-jeju', code: 'jeju-jeju', name: '제주시', parentId: 'region-jeju', level: 2 },
      { id: 'region-jeju-seogwipo', code: 'jeju-seogwipo', name: '서귀포시', parentId: 'region-jeju', level: 2 },
    ],
  },
];

export const v1RecentSearchesFixture: V1RecentSearch[] = [
  { id: 'recent-1', query: '풋살', searchedAt: '2026-05-18T09:00:00.000Z' },
  { id: 'recent-2', query: '마포', searchedAt: '2026-05-18T08:00:00.000Z' },
];

export const v1NoticesFixture: V1Notice[] = [
  {
    id: 'notice-1',
    title: '이번 주 고정 공지',
    category: '고정',
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
    title: '프로필 공개 범위 안내',
    category: '안내',
    publishedAt: '2026-05-15T00:00:00.000Z',
    body: '닉네임, 활동 지역, 선호 종목 공개 범위 기준을 안내합니다.',
  },
];

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
    displayName: '송준',
    profileImageUrl: null,
    bio: '풋살과 러닝을 중심으로 활동 중입니다.',
    visibilityStatus: 'public',
  },
  reputation: {
    trustState: 'sample',
    mannerScore: 4.8,
    activityCount: 12,
    reviewCount: 5,
  },
  displayName: '송준',
  regionName: '서울 강동',
  bio: '풋살과 러닝을 중심으로 활동 중입니다.',
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
    visibilityStatus: 'public',
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
