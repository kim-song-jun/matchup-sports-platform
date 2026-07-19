export type ApiEnvelope<T> = {
  status: 'success';
  data: T;
  timestamp: string;
};

export type ApiErrorBody = {
  status: 'error';
  statusCode: number;
  code: string;
  message: unknown;
  details?: unknown;
  requestId?: string;
  timestamp: string;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
  pageInfo?: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

export type V1Status = 'open' | 'pending' | 'confirmed' | 'closed' | 'cancelled';
export type V1MatchApiStatus = V1Status | 'recruiting' | 'completed' | 'expired' | 'full';
export type V1TeamMatchApiStatus = 'recruiting' | 'closed' | 'matched' | 'cancelled' | 'completed' | 'expired';
export type V1ViewerState = 'none' | 'guest' | 'host' | 'requested' | 'approved' | 'participant' | 'rejected' | 'withdrawn';
export type V1TeamMatchViewerState = 'none' | 'guest' | 'host_team' | 'requested' | 'approved' | 'rejected' | 'withdrawn';
export type TrustState = 'verified' | 'estimated' | 'sample';

export type V1User = {
  id: string;
  email: string | null;
  displayName: string;
  onboardingStatus: string;
};

export type V1AuthMe = {
  user: {
    id: string;
    email: string | null;
    phone?: string | null;
    accountStatus?: string;
    onboardingStatus: string;
    lastLoginAt?: string | null;
    createdAt?: string;
    authProvider?: 'email' | 'kakao' | 'naver' | null;
    authProviders?: Array<'email' | 'kakao' | 'naver' | string>;
    hasPassword?: boolean;
  };
  profile: {
    displayName: string;
    nickname?: string | null;
    avatarUrl?: string | null;
    regionSummary?: string | null;
  };
  onboarding?: unknown;
  reputation?: unknown;
};

export type V1AuthSessionResponse = V1AuthMe & {
  session: {
    userId: string;
    userEmail: string | null;
  };
  next?: {
    route: string;
  };
};

export type V1Sport = {
  id: string;
  code?: string;
  name: string;
  levels: { id: string; code?: string; name: string; description?: string | null }[];
};

export type V1Region = {
  id: string;
  code?: string;
  name: string;
  parentId: string | null;
  level?: number;
  centerLat?: number | null;
  centerLng?: number | null;
  parent?: { id: string; code?: string; name: string } | null;
  children?: V1Region[];
};

export type V1MasterSportsResponse = {
  sports: V1Sport[];
};

export type V1MasterRegionsResponse = {
  regions: Array<Omit<V1Region, 'parentId'> & { parentId?: string | null; children?: Array<Omit<V1Region, 'parentId' | 'children'> & { parentId?: string | null }> }>;
};

export type V1ResolveLocationResponse = {
  region: V1Region | null;
  source: 'kakao' | 'nearest' | 'none';
  distanceMeters?: number | null;
};

export type V1MyRegionUpdateResult = {
  region: {
    regionId: string;
    name: string;
  };
  updatedAt: string;
};

export type V1OnboardingStep = 'terms' | 'signup' | 'sport' | 'level' | 'region' | 'confirm' | 'done';

export type V1OnboardingDetail = {
  status: string;
  currentStep: V1OnboardingStep;
  canResume: boolean;
  missing: Array<'terms' | 'profile' | 'sports' | 'levels' | 'regions'>;
  sports: Array<{
    sportId: string;
    sportName: string;
    levelId: string | null;
    levelName: string | null;
  }>;
  regions: Array<{
    regionId: string;
    name: string;
    primary: boolean;
  }>;
  regionOptional: boolean;
};

export type V1OnboardingPreferencePayload = {
  sports?: Array<{ sportId: string; levelId?: string | null }>;
  regions?: Array<{ regionId: string; primary: boolean }>;
  currentStep: Extract<V1OnboardingStep, 'sport' | 'level' | 'region' | 'confirm'>;
};

export type V1OnboardingMutationResult = {
  status: string;
  currentStep?: string;
  canContinue?: boolean;
  missing: string[];
  next?: { route: string; reason: string };
  limited?: boolean;
};

export type V1Notice = {
  id?: string;
  noticeId?: string;
  audience?: string;
  title: string;
  category?: string;
  publishedAt: string;
  body?: string | null;
};

export type V1PopupTargetScreen =
  | 'home'
  | 'matches'
  | 'team_matches'
  | 'teams'
  | 'tournaments'
  | 'lessons'
  | 'marketplace'
  | 'mercenary'
  | 'venues'
  | 'community'
  | 'chat'
  | 'notifications'
  | 'profile'
  | 'my';

export type V1Popup = {
  popupId: string;
  title: string;
  body: string;
  targetScreens: V1PopupTargetScreen[];
  linkUrl: string | null;
  linkLabel: string | null;
  publishedAt: string | null;
};

export type V1ActivePopupResponse = {
  popup: V1Popup | null;
};

export type V1NoticesResponse = {
  notices: V1Notice[];
  pageInfo?: {
    hasNextPage?: boolean;
    nextCursor: string | null;
  };
};

export type V1NoticeResponse = {
  notice: V1Notice;
};

export type V1RecentSearch = {
  id: string;
  query: string;
  filters?: unknown;
  searchedAt: string;
};

export type V1RecentSearchesResponse = {
  items: V1RecentSearch[];
};

export type V1InquiryCategory =
  | 'account'
  | 'match'
  | 'team'
  | 'tournament'
  | 'payment_refund'
  | 'report'
  | 'other';

export type V1InquiryStatus = 'received' | 'reviewing' | 'answered' | 'closed';

export type V1InquiryRelatedType =
  | 'match'
  | 'team'
  | 'team_match'
  | 'tournament'
  | 'registration'
  | 'payment'
  | 'user';

export type V1Inquiry = {
  inquiryId: string;
  category: V1InquiryCategory;
  title: string;
  body: string;
  contact: string | null;
  relatedType: V1InquiryRelatedType | null;
  relatedId: string | null;
  status: V1InquiryStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  replies?: V1InquiryReply[];
};

export type V1InquiryReply = {
  replyId: string;
  adminName: string | null;
  adminRole: 'owner' | 'ops' | 'support' | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type V1InquiriesPage = {
  items: V1Inquiry[];
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

export type V1CreateInquiryPayload = {
  category: V1InquiryCategory;
  title: string;
  body: string;
  contact?: string;
  relatedType?: V1InquiryRelatedType;
  relatedId?: string;
  /** 비로그인(게스트) 문의자의 이메일 — 로그인 상태가 아니면 guestPhone과 함께 최소 1개 필수 */
  guestEmail?: string;
  /** 비로그인(게스트) 문의자의 전화번호 — 로그인 상태가 아니면 guestEmail과 함께 최소 1개 필수 */
  guestPhone?: string;
};

export type V1Match = {
  id: string;
  matchId?: string;
  title: string;
  description?: string | null;
  descriptionPreview?: string | null;
  imageUrl?: string | null;
  sportName: string;
  sport?: { sportId: string; name: string };
  levelLabel?: string | null;
  minLevel?: { code: string; name: string } | null;
  maxLevel?: { code: string; name: string } | null;
  regionName?: string | null;
  region?: { regionId: string; name: string; parentName?: string | null } | null;
  placeName: string;
  place?: { name: string; addressText?: string | null };
  startsAt: string;
  endsAt?: string | null;
  deadlineAt?: string | null;
  capacityText: string;
  capacity?: number;
  participantCount?: number;
  status: V1Status;
  displayState?: string;
  approvalRequired?: boolean;
  paymentRequired?: boolean;
  viewerState?: V1ViewerState;
  viewer?: {
    state: V1ViewerState;
    applicationId: string | null;
    participantId: string | null;
    canApply: boolean;
    ctaLabel?: string;
    disabledReason?: string | null;
    manageRoute?: string | null;
  };
  host?: {
    userId: string;
    displayName: string;
    profileImageUrl?: string | null;
    trustState?: string;
  };
  participantsPreview?: Array<{
    participantId: string;
    userId: string;
    displayName: string;
    role: string;
    status: string;
  }>;
  rulesText?: string | null;
  genderRule?: string | null;
  ctaState?: string;
};

export type V1MatchEdit = {
  matchId: string;
  editable: boolean;
  lockedReason: string | null;
  form: {
    sportId: string;
    regionId?: string | null;
    title: string;
    description?: string | null;
    imageUrl?: string | null;
    startsAt: string;
    endsAt?: string | null;
    deadlineAt?: string | null;
    capacity: number;
    manualPlaceName: string;
    addressText?: string | null;
    rulesText?: string | null;
    minLevelCode?: string | null;
    maxLevelCode?: string | null;
    genderRule?: string | null;
  };
  status: V1MatchApiStatus;
  participantCount: number;
  version: string;
};

export type V1MatchApplicationEligibility = {
  matchId: string;
  eligible: boolean;
  reasonCode: string;
  message: string;
  viewerState: Exclude<V1ViewerState, 'guest'>;
  applicationId: string | null;
  participantId: string | null;
  requiresApproval: boolean;
  requiresPayment: boolean;
};

export type V1MatchApplicationResult = {
  applicationId: string;
  matchId: string;
  status: string;
  viewerState: V1ViewerState;
  detailRoute: string;
};

export type V1MatchMutationPayload = {
  sportId: string;
  regionId: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  deadlineAt?: string | null;
  capacity: number;
  manualPlaceName: string;
  addressText?: string | null;
  rulesText?: string | null;
  minLevelCode?: string | null;
  maxLevelCode?: string | null;
  genderRule?: string | null;
};

export type V1MatchUpdatePayload = V1MatchMutationPayload & {
  version: string;
};

export type V1MatchMutationResult = {
  matchId: string;
  status: V1MatchApiStatus;
  hostParticipantId?: string;
  detailRoute: string;
  manageRoute?: string;
  updatedAt?: string;
  version?: string;
};

export type V1MatchApplication = {
  applicationId: string;
  applicantUserId: string;
  displayName: string;
  profileImageUrl: string | null;
  trustState: string;
  mannerScore: number | null;
  reviewCount: number;
  status: string;
  message: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type V1MatchApplicationsPage = {
  matchId: string;
  items: V1MatchApplication[];
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

export type V1Team = {
  id: string;
  teamId?: string;
  name: string;
  sportName: string;
  sport?: { sportId: string; name: string };
  regionName: string;
  region?: { regionId: string; name: string; parentName?: string | null } | null;
  memberCount: number;
  trustState: TrustState | 'none';
  joinPolicy: 'approval_required' | 'closed';
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  introductionPreview?: string | null;
  activityAreaText?: string | null;
  activityDays?: string[];
  activityFrequency?: string | null;
  activityTimeSlots?: string[];
  activityTypes?: string[];
  activityMemo?: string | null;
  activitySummary?: string | null;
  memberGoalCount?: number | null;
  skillLevelText?: string | null;
  levelLabel?: string | null;
  minLevel?: { code: string; name: string } | null;
  maxLevel?: { code: string; name: string } | null;
  genderRule?: string | null;
  /**
   * 팀장 — nickname/displayName 미설정 시 백엔드에서 '팀장'으로 폴백(항상 non-empty).
   * optional인 이유: 이 필드를 아직 채우지 않는 기존 fixture/mock과의 하위 호환
   * (V1Team의 다른 대다수 필드와 동일하게 optional 컨벤션을 따름).
   */
  owner?: {
    userId: string;
    displayName: string;
    profileImageUrl: string | null;
  };
  /** 감독 — manager 역할 멤버가 없으면 null */
  manager?: {
    userId: string;
    displayName: string;
  } | null;
  viewerRole?: string;
  viewerJoinState?: string;
};

export type V1MyTeam = {
  teamId: string;
  membershipId: string;
  name: string;
  role: 'owner' | 'manager' | 'member';
  status: string;
  logoUrl: string | null;
  coverImageUrl?: string | null;
  activityAreaText?: string | null;
  activityDays?: string[];
  activityFrequency?: string | null;
  activityTimeSlots?: string[];
  activityTypes?: string[];
  activityMemo?: string | null;
  activitySummary?: string | null;
  memberGoalCount?: number | null;
  sport: { sportId: string; name: string };
  region: { regionId: string; name: string; parentName?: string | null } | null;
  trust?: {
    trustState: TrustState | 'none';
    score: number | null;
  };
  memberCount: number;
  canManage: boolean;
  canCreateTeamMatch: boolean;
  detailRoute: string;
  manageRoute: string | null;
};

export type V1MyTeamsResponse = V1MyTeam[] & {
  items: V1MyTeam[];
};

export type V1TeamDetail = {
  id?: string;
  teamId: string;
  name: string;
  status: string;
  visibility: string;
  sportName?: string;
  sport: { sportId: string; name: string };
  regionName?: string | null;
  region: { regionId: string; name: string; parentName?: string | null } | null;
  joinPolicy?: 'approval_required' | 'closed';
  trustState?: TrustState | 'none';
  version?: string;
  membersVisibilityEnabled: boolean;
  canViewMembers: boolean;
  profile: {
    logoUrl: string | null;
    coverImageUrl: string | null;
    introduction: string | null;
    activityAreaText: string | null;
    activityDays: string[];
    activityFrequency: string | null;
    activityTimeSlots: string[];
    activityTypes: string[];
    activityMemo: string | null;
    activitySummary: string | null;
    skillLevelText: string | null;
    levelLabel?: string | null;
    minLevel?: { code: string; name: string } | null;
    maxLevel?: { code: string; name: string } | null;
    genderRule?: string | null;
    joinPolicy: string;
    memberGoalCount: number | null;
  };
  owner: {
    userId: string;
    displayName: string;
    profileImageUrl: string | null;
  };
  membersPreview: Array<{
    membershipId: string;
    userId: string;
    displayName: string;
    role: string;
  }>;
  memberCount: number;
  managerCount: number;
  trust: {
    trustState: TrustState;
    score: number | null;
  };
  viewer: {
    role: string;
    membershipId: string | null;
    joinState: string;
    canRequestJoin: boolean;
    disabledReason: string | null;
    manageRoute: string | null;
  };
};

export type V1TeamMutationPayload = {
  sportId: string;
  regionId: string;
  name: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  introduction?: string | null;
  activityAreaText?: string | null;
  activityDays?: string[];
  activityFrequency?: string | null;
  activityTimeSlots?: string[];
  activityTypes?: string[];
  activityMemo?: string | null;
  skillLevelText?: string | null;
  minLevelCode?: string | null;
  maxLevelCode?: string | null;
  genderRule?: string | null;
  joinPolicy: 'approval_required' | 'closed';
  memberGoalCount?: number | null;
};

export type V1TeamUpdatePayload = V1TeamMutationPayload & {
  version: string;
  membersVisibilityEnabled?: boolean;
};

export type V1TeamMutationResult = {
  teamId: string;
  membershipId?: string;
  role?: string;
  status?: string;
  updatedAt?: string;
  version?: string;
  membersVisibilityEnabled?: boolean;
  detailRoute: string;
  manageRoute?: string;
};

export type V1TeamJoinEligibility = {
  teamId: string;
  eligible: boolean;
  reasonCode: string;
  message: string;
  joinPolicy: 'approval_required' | 'closed';
  viewerRole: string;
  joinState: string;
  applicationId: string | null;
  requiresApproval: boolean;
  immediateJoinSupported: boolean;
};

export type V1TeamJoinApplicationResult = {
  applicationId: string;
  teamId: string;
  status: string;
  joinState: string;
  requiresApproval?: boolean;
  immediateJoinSupported?: boolean;
  membershipId?: string;
  memberCount?: number;
};

export type V1TeamJoinApplication = {
  applicationId: string;
  status: string;
  message: string | null;
  createdAt: string;
  applicant: {
    userId: string;
    displayName: string;
    profileImageUrl: string | null;
    trustState: string;
  };
};

export type V1TeamJoinApplicationsPage = {
  teamId: string;
  reviewerRole: string;
  items: V1TeamJoinApplication[];
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

export type V1TeamMembershipMutationResult = {
  membershipId: string;
  teamId: string;
  role?: 'owner' | 'manager' | 'member' | string;
  status?: string;
  managerCount?: number;
  memberCount?: number;
  removedAt?: string;
};

export type V1TeamMember = {
  membershipId: string;
  userId: string;
  displayName: string;
  realName: string | null;
  phone: string | null;
  birthDate: string | null;
  gender: 'male' | 'female' | null;
  profileImageUrl: string | null;
  role: 'owner' | 'manager' | 'member';
  status: string;
  joinedAt: string;
  canChangeRole: boolean;
  canRemove: boolean;
};

export type V1TeamMembersPage = {
  items: V1TeamMember[];
  summary: {
    ownerCount: number;
    managerCount: number;
    memberCount: number;
  };
  viewerRole: 'owner' | 'manager' | 'member';
  membersVisibilityEnabled?: boolean;
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

export type V1TeamMatch = V1Match & {
  teamMatchId?: string;
  sport?: { sportId: string; name: string };
  region?: { regionId: string; name: string; parentName?: string | null } | null;
  place?: { name: string; addressText?: string | null };
  displayState?: V1TeamMatchApiStatus;
  costNote?: string | null;
  rulesText?: string | null;
  minLevelCode?: string | null;
  maxLevelCode?: string | null;
  genderRule?: string | null;
  paymentRequired?: boolean;
  hostTeamId?: string;
  hostTeamName?: string;
  hostTeam?: {
    teamId: string;
    name: string;
    logoUrl?: string | null;
    trustState?: string;
    ownerUserId?: string;
  };
  approvedOpponentTeam?: {
    teamId: string;
    name: string;
    applicationId: string;
  } | null;
  viewerState?: V1TeamMatchViewerState;
  viewer?: {
    state: V1TeamMatchViewerState;
    manageableHostTeam?: boolean;
    eligibleTeams?: Array<{
      teamId: string;
      name: string;
      role: string;
      eligible: boolean;
      reasonCode: string;
    }>;
    manageRoute?: string | null;
  };
  applicantTeamState?: string;
};

export type V1TeamMatchMutationPayload = {
  hostTeamId: string;
  sportId: string;
  regionId: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  deadlineAt?: string | null;
  manualPlaceName: string;
  addressText?: string | null;
  costNote?: string | null;
  rulesText?: string | null;
  minLevelCode?: string | null;
  maxLevelCode?: string | null;
  genderRule?: string | null;
};

export type V1TeamMatchUpdatePayload = V1TeamMatchMutationPayload & {
  version: string;
};

export type V1TeamMatchMutationResult = {
  teamMatchId: string;
  status: V1TeamMatchApiStatus;
  hostTeamId?: string;
  detailRoute: string;
  manageRoute?: string;
  updatedAt?: string;
  version?: string;
};

export type V1TeamMatchEdit = {
  teamMatchId: string;
  editable: boolean;
  lockedReason: string | null;
  form: {
    hostTeamId: string;
    sportId: string;
    regionId: string;
    title: string;
    description?: string | null;
    imageUrl?: string | null;
    startsAt: string;
    endsAt?: string | null;
    deadlineAt?: string | null;
    manualPlaceName: string;
    addressText?: string | null;
    costNote?: string | null;
    rulesText?: string | null;
    minLevelCode?: string | null;
    maxLevelCode?: string | null;
    genderRule?: string | null;
  };
  status: V1TeamMatchApiStatus;
  version: string;
};

export type V1TeamMatchEligibility = {
  teamMatchId: string;
  requiresApproval: boolean;
  requiresPayment: boolean;
  teams: Array<{
    teamId: string;
    name: string;
    role: string;
    eligible: boolean;
    reasonCode: string;
    applicationId: string | null;
  }>;
};

export type V1TeamMatchApplicationResult = {
  applicationId: string;
  teamMatchId: string;
  applicantTeamId: string;
  status: string;
  requiresApproval?: boolean;
  requiresPayment?: boolean;
  teamMatchStatus?: V1TeamMatchApiStatus;
  approvedApplicantTeamId?: string | null;
};

export type V1TeamMatchApplication = {
  applicationId: string;
  status: string;
  message: string | null;
  createdAt: string;
  reviewedAt: string | null;
  applicantTeam: {
    teamId: string;
    name: string;
    logoUrl: string | null;
    trustState: string;
    score: number | null;
    matchCount: number;
  };
  appliedBy: {
    userId: string;
    displayName: string;
    profileImageUrl: string | null;
  };
  canApprove: boolean;
  canReject: boolean;
};

export type V1TeamMatchApplicationsPage = {
  teamMatchId: string;
  items: V1TeamMatchApplication[];
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

export type V1MyTeamMatch = {
  teamMatchId: string;
  title: string;
  sportName: string;
  startsAt: string;
  status: V1TeamMatchApiStatus;
  relation: 'host_team' | 'requested' | 'approved' | 'rejected' | 'withdrawn';
  teamId?: string | null;
  teamName?: string | null;
  applicationId: string | null;
  manageRoute: string | null;
  detailRoute: string;
};

export type V1ReviewSourceType = 'match' | 'team_match' | 'tournament_fixture';
export type V1ReviewTargetType = 'user' | 'team';

export type V1ReviewActorUser = {
  userId: string;
  name: string;
  imageUrl: string | null;
};

export type V1ReviewActorTeam = {
  teamId: string;
  name: string;
  imageUrl?: string | null;
  role?: 'owner' | 'manager';
};

export type V1ReviewTag = {
  tagCode: string;
  label: string;
};

export type V1ReviewDetail = {
  reviewId: string;
  sourceType: V1ReviewSourceType;
  sourceId: string;
  targetType: V1ReviewTargetType;
  targetUser: V1ReviewActorUser | null;
  targetTeam: V1ReviewActorTeam | null;
  reviewerUser: V1ReviewActorUser;
  reviewerTeam: V1ReviewActorTeam | null;
  rating: number;
  tags: V1ReviewTag[];
  status: 'submitted' | 'hidden' | 'removed';
  submittedAt: string;
};

export type V1ReviewListItem = {
  sourceType: V1ReviewSourceType;
  sourceId: string;
  title: string;
  completedAt: string | null;
  targetType: V1ReviewTargetType;
  targetCount: number;
  reviewedCount: number;
  remainingCount: number;
  state: 'ready' | 'done';
  reviewerTeam?: { teamId: string; name: string } | null;
  targetTeam?: { teamId: string; name: string } | null;
};

export type V1ReviewListResponse = {
  items: V1ReviewListItem[];
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

export type V1ReviewReceivedResponse = {
  items: V1ReviewDetail[];
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

export type V1ReviewTarget = {
  targetType: V1ReviewTargetType;
  targetUserId: string | null;
  targetTeamId: string | null;
  name: string;
  imageUrl: string | null;
  subtitle: string;
  alreadySubmitted: boolean;
  review: V1ReviewDetail | null;
  locked: boolean;
  lockReason: string | null;
};

export type V1ReviewSourceResponse = {
  source: {
    sourceType: V1ReviewSourceType;
    sourceId: string;
    title: string;
    completedAt: string | null;
  };
  reviewerTeam: {
    teamId: string;
    name: string;
    role: 'owner' | 'manager';
  } | null;
  targets: V1ReviewTarget[];
};

export type V1ReviewSubmitPayload = {
  sourceType: V1ReviewSourceType;
  sourceId: string;
  targetType: V1ReviewTargetType;
  targetUserId?: string | null;
  targetTeamId?: string | null;
  rating: number;
  tagCodes: string[];
};

export type V1ReviewSubmitResponse = {
  review: V1ReviewDetail;
  alreadySubmitted: boolean;
};

export type V1ChatRoom = {
  roomId: string;
  roomType: 'match' | 'team' | 'team_match';
  title: string;
  status: string;
  linkedTarget: {
    type: 'match' | 'team' | 'team_match' | null;
    id: string | null;
    title: string;
    route: string | null;
  };
  lastMessage: {
    messageId: string;
    contentPreview: string;
    sentAt: string;
  } | null;
  unreadCount: number;
  pinned: boolean;
  muted: boolean;
  mutedUntil?: string | null;
};

export type V1ChatMessage = {
  messageId: string;
  sender: {
    userId: string;
    displayName: string;
    profileImageUrl: string | null;
  };
  messageType?: 'text' | 'system';
  systemEventType?: 'joined' | 'left' | null;
  content: string | null;
  status: string;
  sentAt: string;
  mine: boolean;
  unreadCount?: number;
};

export type V1ChatRoomDetail = {
  roomId: string;
  roomType: 'match' | 'team' | 'team_match';
  status: string;
  title: string;
  linkedTarget: V1ChatRoom['linkedTarget'];
  me: {
    participantId: string | null;
    status: string;
    pinned: boolean;
    mutedUntil: string | null;
    lastReadMessageId: string | null;
    visibleFromAt?: string | null;
  };
  participants: Array<{
    userId: string;
    displayName: string;
    role: string;
  }>;
};

export type V1ChatRoomResolveResult = {
  roomId: string;
  roomType: 'match' | 'team' | 'team_match';
  created: boolean;
  route: string;
};

export type V1ChatMessageSendResult = {
  messageId: string;
  roomId: string;
  content: string;
  status: string;
  sentAt: string;
};

export type V1ChatRoomMeUpdate = {
  roomId: string;
  pinned: boolean;
  mutedUntil: string | null;
  lastReadMessageId: string | null;
  status: string;
};

export type V1ChatRoomLeaveResult = {
  roomId: string;
  status: string;
};

export type V1Notification = {
  notificationId: string;
  type: string;
  title: string;
  body: string | null;
  target: {
    type: string;
    id: string | null;
    route: string | null;
  };
  status: 'created' | 'read';
  readAt: string | null;
  createdAt: string;
};

export type V1NotificationsPage = CursorPage<V1Notification> & {
  unreadCount: number;
};

export type V1NotificationPreferences = {
  importantEnabled: boolean;
  activityEnabled: boolean;
  marketingEnabled: boolean;
};

export type V1Profile = {
  userId: string;
  accountStatus: string;
  email: string | null;
  phone?: string | null;
  authProvider: 'email' | 'kakao' | 'naver' | null;
  authProviders?: Array<'email' | 'kakao' | 'naver' | string>;
  hasPassword?: boolean;
  onboardingStatus?: 'not_started' | 'terms_done' | 'social_terms_required' | 'social_profile_required' | 'signup_done' | 'sport_done' | 'level_done' | 'region_done' | 'completed' | 'deferred';
  regionName: string | null;
  sports?: Array<{
    sportId: string;
    sportName: string;
    levelId: string | null;
    levelName: string | null;
    primary: boolean;
  }>;
  regions?: Array<{
    regionId: string;
    regionName: string;
    primary: boolean;
  }>;
  profile: {
    displayName: string;
    realName: string | null;
    nickname?: string | null;
    profileImageUrl: string | null;
    birthDate?: string | null;
    gender: 'male' | 'female' | null;
  };
  reputation: {
    trustState: TrustState;
    mannerScore: number | null;
    activityCount: number;
    reviewCount: number;
  };
  displayName?: string;
  trustState?: TrustState;
};

export type V1PublicProfile = {
  userId: string;
  displayName: string;
  nickname: string | null;
  profileImageUrl: string | null;
  reputation: {
    trustState: TrustState;
    mannerScore: number | null;
    activityCount: number;
    reviewCount: number;
  };
  activitySummary: {
    totals: {
      matchCount: number;
      teamCount: number;
      reviewCount: number;
    };
    monthly: {
      matchCount: number;
      teamJoinCount: number;
      reviewCount: number;
    };
  } | null;
};

export type V1MyActivitySummary = {
  totals: {
    activityCount: number;
    teamCount: number;
    mannerScore: number | null;
  };
  monthly: {
    matchCount: number;
    mannerScore: number | null;
    winRate: number | null;
  };
};

export type V1Settings = {
  account: {
    email: string;
    phone: string | null;
    accountStatus: string;
    providers: string[];
    hasPassword?: boolean;
  };
  profile: {
    displayName: string;
  };
  notifications: {
    matchEnabled: boolean;
    teamEnabled: boolean;
    teamMatchEnabled: boolean;
    chatEnabled: boolean;
    noticeEnabled: boolean;
    marketingEnabled: boolean;
  };
};

export type V1HomeRecommendation = {
  matchId: string;
  title: string;
  sportName: string;
  regionName: string | null;
  startsAt: string;
  participantCount?: number;
  capacity?: number;
};

export type V1HomeShortcut = {
  key: 'matches' | 'team_matches' | 'teams' | 'my_team';
  enabled: boolean;
  route: string | null;
  disabledReason: string | null;
};

export type V1Home = {
  viewer?: {
    authenticated: boolean;
    displayName: string | null;
    onboardingStatus: 'pending' | 'completed' | 'deferred' | null;
  };
  summary?: {
    monthlyMatches: number | null;
    mannerScore: number | null;
    trustState: string;
    pendingLabel: string | null;
  };
  featuredMatch?: {
    matchId: string;
    title: string;
    reason: string;
    participantCount: number;
    capacity: number;
  } | null;
  shortcuts?: V1HomeShortcut[];
  recommendations?: V1HomeRecommendation[];
  popup?: V1Popup | null;
  notifications?: { unreadCount: number };
  notices?: V1Notice[];
  recommendedMatches?: V1Match[];
  recommendedTeamMatches?: V1TeamMatch[];
  recommendedTeams?: V1Team[];
};

export type V1AdminOverview = {
  users: { active: number; suspended: number; blocked: number; withdrawalPending: number };
  matches: { recruiting: number; cancelled: number; completed: number };
  teams: { active: number; suspended: number; archived: number };
  teamMatches: { recruiting: number; matched: number; cancelled: number };
  recentActions: { actionLogId: string; actionType: string; targetType: string; createdAt: string }[];
};

export type V1AdminLog = {
  actionLogId: string;
  adminUserId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  beforeState: unknown;
  afterState: unknown;
  createdAt: string;
};

export type V1AdminStatusChangeLog = {
  statusChangeLogId: string;
  targetType: string;
  targetId: string;
  fromStatus: string;
  toStatus: string;
  actorUserId: string | null;
  adminUserId: string | null;
  reason: string | null;
  createdAt: string;
};

export type V1AdminMe = {
  userId: string;
  adminUserId: string;
  adminRole: 'owner' | 'ops' | 'support';
  status: 'active';
  capabilities: string[];
  lastActiveAt: string | null;
};

export type V1AdminNoticeStatus = 'draft' | 'published' | 'archived';
export type V1AdminNoticeAudience = 'public' | 'users' | 'admins';
export type V1AdminNoticeCategory = '업데이트' | '안내';

export type V1AdminNoticeRow = {
  noticeId: string;
  audience: V1AdminNoticeAudience;
  category: V1AdminNoticeCategory;
  title: string;
  body: string;
  status: V1AdminNoticeStatus;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type V1AdminNoticeCreatePayload = {
  audience: V1AdminNoticeAudience;
  category: V1AdminNoticeCategory;
  title: string;
  body: string;
  status: V1AdminNoticeStatus;
};

export type V1AdminNoticeUpdatePayload = V1AdminNoticeCreatePayload;

export type V1AdminNoticeCreateResult = {
  notice: V1AdminNoticeRow;
};

export type V1AdminNoticeUpdateResult = {
  notice: V1AdminNoticeRow;
};

export type V1AdminNoticeDetailResult = {
  notice: V1AdminNoticeRow;
};

export type V1AdminNoticeDeleteResult = {
  noticeId: string;
  deleted: true;
};

export type V1AdminPopupStatus = 'draft' | 'published' | 'archived';

export type V1AdminPopupRow = {
  popupId: string;
  audience: V1AdminNoticeAudience;
  title: string;
  body: string;
  targetScreens: V1PopupTargetScreen[];
  linkUrl: string | null;
  linkLabel: string | null;
  status: V1AdminPopupStatus;
  publishedAt: string | null;
  archivedAt: string | null;
  displayStartAt: string | null;
  displayEndAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type V1AdminPopupCreatePayload = {
  audience: V1AdminNoticeAudience;
  title: string;
  body: string;
  targetScreens: V1PopupTargetScreen[];
  linkUrl?: string | null;
  linkLabel?: string | null;
  status: V1AdminPopupStatus;
  displayStartAt?: string | null;
  displayEndAt?: string | null;
};

export type V1AdminPopupUpdatePayload = V1AdminPopupCreatePayload;

export type V1AdminPopupCreateResult = {
  popup: V1AdminPopupRow;
};

export type V1AdminPopupUpdateResult = {
  popup: V1AdminPopupRow;
};

export type V1AdminPopupDetailResult = {
  popup: V1AdminPopupRow;
};

export type V1AdminPopupDeleteResult = {
  popupId: string;
  deleted: true;
};
export type V1AdminInquiryRow = {
  inquiryId: string;
  userId: string | null;
  /** true면 비회원(guest) 문의 — userId가 없고 guestEmail/guestPhone으로만 식별됨 */
  isGuest: boolean;
  requesterName: string | null;
  requesterEmail: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  category: V1InquiryCategory;
  title: string;
  status: V1InquiryStatus;
  relatedType: V1InquiryRelatedType | null;
  relatedId: string | null;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type V1AdminInquiryReply = V1InquiryReply & {
  adminUserId: string | null;
};

export type V1AdminInquiryDetail = V1AdminInquiryRow & {
  body: string;
  contact: string | null;
  replies: V1AdminInquiryReply[];
};

export type V1AdminInquiryReplyPayload = {
  body: string;
};

export type V1AdminInquiryStatusPayload = {
  status: V1InquiryStatus;
  reason?: string;
};

/** GET /admin/inquiries/pending-count — 미답변(received/reviewing) 문의 건수 */
export type V1AdminInquiryPendingCount = {
  count: number;
};

export type V1AdminUserRow = {
  userId: string;
  nickname: string | null;
  displayName: string | null;
  email: string | null;
  authProviders: Array<'kakao' | 'naver' | 'email'>;
  gender: 'male' | 'female' | null;
  accountStatus: 'active' | 'suspended' | 'blocked' | 'withdrawal_pending' | 'deleted';
  onboardingStatus: string;
  lastLoginAt: string | null;
  createdAt: string;
  hostedMatchCount: number;
  ownedTeamCount: number;
  membershipCount: number;
  teamRoleCounts?: {
    owner: number;
    manager: number;
    member: number;
  };
  adminRole: 'owner' | 'ops' | 'support' | null;
};

export type V1AdminUserDetail = V1AdminUserRow & {
  deletedAt: string | null;
  withdrawalRequest: {
    reason: string | null;
    requestedAt: string;
  } | null;
  reputationSummary: {
    trustState: string;
    mannerScore: string | null;
    reviewCount: number;
    calculatedAt: string | null;
  } | null;
  hostedMatches: { matchId: string; title: string; status: string; startAt: string }[];
  ownedTeams: { teamId: string; name: string; status: string; memberCount: number }[];
  teamMemberships?: {
    membershipId: string;
    teamId: string;
    name: string;
    status: string;
    memberCount: number;
    role: 'owner' | 'manager' | 'member';
    joinedAt: string | null;
  }[];
};

export type V1AdminDeleteUserPayload = {
  reason: string;
};

export type V1AdminMatchRow = {
  matchId: string;
  title: string;
  sportName: string;
  sportCode: string;
  hostUserId: string;
  hostName: string | null;
  placeName: string;
  startAt: string;
  status: 'recruiting' | 'closed' | 'cancelled' | 'completed' | 'archived';
  participantCount: number;
  maxParticipants: number;
  createdAt: string;
};

export type V1AdminMatchDetail = V1AdminMatchRow & {
  description: string | null;
  regionName: string | null;
  deadlineAt: string | null;
  applicationCount: number;
};

export type V1AdminTeamRow = {
  teamId: string;
  name: string;
  sportName: string;
  ownerUserId: string;
  ownerName: string | null;
  memberCount: number;
  managerCount: number;
  status: 'active' | 'suspended' | 'archived';
  createdAt: string;
};

export type V1AdminTeamDetail = V1AdminTeamRow & {
  regionName: string;
  trustScore: {
    trustState: string;
    mannerScore: string | null;
    matchCount: number;
    calculatedAt: string | null;
  } | null;
  recentHostedTeamMatches: { teamMatchId: string; title: string; status: string; startAt: string }[];
};

export type V1AdminTeamMatchRow = {
  teamMatchId: string;
  title: string;
  hostTeamId: string;
  hostTeamName: string;
  sportName: string;
  startAt: string;
  status: 'recruiting' | 'closed' | 'matched' | 'cancelled' | 'completed' | 'archived';
  createdAt: string;
};

export type V1AdminStatusChangeResult = {
  previousStatus: string;
  status: string;
  actionLogId: string;
  statusChangeLogId: string;
};

export type AdminListFilters = {
  status?: string;
  q?: string;
  sportId?: string;
  audience?: string;
  category?: string;
  targetType?: string;
  cursor?: string;
  limit?: number;
};

export type V1AdminRow = {
  adminUserId: string;
  userId: string;
  nickname: string | null;
  displayName: string | null;
  email: string | null;
  adminRole: 'owner' | 'ops' | 'support';
  status: 'active' | 'revoked' | 'suspended';
  grantedByAdminUserId: string | null;
  grantedAt: string;
  revokedAt: string | null;
};

export type V1AdminGrantResult = V1AdminRow;

export type V1PushFailureSummary = {
  id: string;
  userIdHash: string;
  endpointSuffix: string;
  statusCode: number | null;
  occurredAt: string;
  acknowledgedAt: string | null;
};

// ---------------------------------------------------------------------------
// Admin — manual web push send
// ---------------------------------------------------------------------------

export type V1AdminPushSendTarget = 'user' | 'broadcast';

export type V1AdminPushSendPayload = {
  target: V1AdminPushSendTarget;
  /** target === 'user'일 때만 필수 */
  userId?: string;
  title: string;
  body?: string;
  url?: string;
};

export type V1AdminPushSendResult = {
  sent: number;
  skipped: number;
  failed: number;
};

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/uploads — 이미지 업로드
 *  - Content-Type : multipart/form-data
 *  - 필드 이름    : 'files' (최대 5개, 개당 5 MB, jpeg/png/webp)
 *  - 응답 형식   : ApiEnvelope<V1UploadImagesResult>  즉, `data: { urls: string[] }`
 *                  urls 값은 루트-상대 경로(/uploads/…)이며 웹 앱이 next.config rewrite로 프록시합니다.
 */
export type V1UploadImagesResult = {
  urls: string[];
};

// ---------------------------------------------------------------------------
// Tournament
// ---------------------------------------------------------------------------

export type V1TournamentStatus =
  | 'draft'
  | 'open'
  | 'closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type V1TournamentFormat = 'league' | 'knockout' | 'group_knockout';
export type V1TournamentGenderCategory = 'mixed' | 'male' | 'female';

export type V1PublicTournamentStatus = Extract<
  V1TournamentStatus,
  'open' | 'closed' | 'in_progress' | 'completed'
>;

export type V1TournamentRegistrationStatus =
  | 'draft'
  | 'submitted'
  | 'awaiting_payment'
  | 'payment_checking'
  | 'paid'
  | 'confirmed'
  | 'waitlisted'
  | 'cancel_requested'
  | 'cancelled';

export type V1TournamentParticipantStatus = Extract<
  V1TournamentRegistrationStatus,
  'confirmed' | 'waitlisted'
>;

export type V1TournamentPaymentMethod = 'pg' | 'bank_transfer';

export type V1TournamentPaymentStatus =
  | 'ready'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export type V1PlayerEligibilityStatus = 'non_pro' | 'pro' | 'needs_review';

export type V1TournamentGroupPhase = 'group' | 'semi' | 'final' | 'third_place';

export type V1AnnouncementAudience =
  | 'public'
  | 'all_registered'
  | 'confirmed_only'
  | 'waitlist';

export type V1AnnouncementCategory =
  | 'general'
  | 'venue'
  | 'sponsor'
  | 'media'
  | 'results'
  | 'review';

/** Serialized by TournamentsReadService.serializeCard — list view */
export type V1TournamentListItem = {
  id: string;
  sportId: string;
  /** Enriched sport object — code + name; sportId retained for back-compat */
  sport: { code: string; name: string };
  title: string;
  status: V1TournamentStatus;
  format: V1TournamentFormat;
  registrationDeadlineAt: string | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  venue: string | null;
  coverImageUrl: string | null;
  teamCount: number;
  genderCategory: V1TournamentGenderCategory | null;
  entryFee: number;
  prizePool: number | null;
  prizeSummary: string | null;
  prizeBreakdown: string | null;
  promoHomeEnabled: boolean;
  promoHomeTitle: string | null;
  promoHomeSubtitle: string | null;
  promoHomeImageUrl: string | null;
  promoHomeBadgeText: string | null;
  promoHomeDateText: string | null;
  promoHomeTeamsText: string | null;
  promoHomeLocationText: string | null;
  promoHomePrizeText: string | null;
  promoHomePriority: number;
  promoListEnabled: boolean;
  promoListTitle: string | null;
  promoListSubtitle: string | null;
  promoListImageUrl: string | null;
  promoListBadgeText: string | null;
  promoListDateText: string | null;
  promoListTeamsText: string | null;
  promoListLocationText: string | null;
  promoListPrizeText: string | null;
  promoListPriority: number;
  campaignSlug: string | null;
  confirmedCount: number;
  pendingPaymentCount: number;
  createdAt: string;
  updatedAt: string;
};

/** Serialized by TournamentsAdminService.serialize — admin view (includes bank / player range) */
export type V1Tournament = {
  id: string;
  sportId: string;
  title: string;
  status: V1TournamentStatus;
  format: V1TournamentFormat;
  registrationDeadlineAt: string | null;
  /** 명단(선수단) 제출 마감일 — 지나면 신청 팀의 명단 추가/삭제/수정이 차단된다(팀별 예외 부여 가능) */
  rosterDeadlineAt: string | null;
  /** null이면 대진표(조/픽스처) 비공개 — 공개 상세 API는 이 값이 채워질 때까지 groups/fixtures를 숨긴다 */
  bracketPublishedAt: string | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  venue: string | null;
  /** venue를 카카오 로컬 API로 지오코딩한 좌표. 키 미설정/검색 실패 시 null(지도 임베드는 스킵, 네이버 지도 검색 링크로 폴백). */
  latitude: number | null;
  longitude: number | null;
  coverImageUrl: string | null;
  teamCount: number;
  minPlayers: number;
  maxPlayers: number;
  genderCategory: V1TournamentGenderCategory | null;
  genderMinMale: number | null;
  genderMaxMale: number | null;
  genderMinFemale: number | null;
  genderMaxFemale: number | null;
  entryFee: number;
  prizePool: number | null;
  prizeSummary: string | null;
  prizeBreakdown: string | null;
  promoHomeEnabled: boolean;
  promoHomeTitle: string | null;
  promoHomeSubtitle: string | null;
  promoHomeImageUrl: string | null;
  promoHomeBadgeText: string | null;
  promoHomeDateText: string | null;
  promoHomeTeamsText: string | null;
  promoHomeLocationText: string | null;
  promoHomePrizeText: string | null;
  promoHomePriority: number;
  promoListEnabled: boolean;
  promoListTitle: string | null;
  promoListSubtitle: string | null;
  promoListImageUrl: string | null;
  promoListBadgeText: string | null;
  promoListDateText: string | null;
  promoListTeamsText: string | null;
  promoListLocationText: string | null;
  promoListPrizeText: string | null;
  promoListPriority: number;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  rulesText: string | null;
  refundPolicyText: string | null;
  registrationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type V1TournamentGroupTeam = {
  id: string;
  registrationId: string;
  teamId: string;
  teamName: string;
  sortOrder: number;
};

export type V1TournamentStanding = {
  registrationId: string;
  teamId: string;
  teamName: string;
  position: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  recalculatedAt: string | null;
};

export type V1TournamentGroup = {
  id: string;
  name: string;
  phase: string;
  sortOrder: number;
  advanceCount: number | null;
  groupTeams: V1TournamentGroupTeam[];
  standings: V1TournamentStanding[];
};

/** 경기 득점자 — 명단에 있으면 playerId, 비회원/대타는 playerId=null + playerName만 */
export type V1TournamentFixtureGoal = {
  id: string;
  team: 'home' | 'away';
  playerId: string | null;
  playerName: string;
  minute: number | null;
};

export type V1TournamentFixtureResult = {
  homeScore: number;
  awayScore: number;
  hasPenalty: boolean;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  note: string | null;
  recordedAt: string;
  goals: V1TournamentFixtureGoal[];
};

/** 경기 하이라이트/중계 영상 — 경기당 여러 개 */
export type V1TournamentFixtureVideo = {
  id: string;
  title: string | null;
  url: string;
};

export type V1TournamentFixture = {
  id: string;
  groupId: string | null;
  round: string;
  fixtureNumber: number;
  legNumber: number;
  scheduledAt: string | null;
  venue: string | null;
  status: string;
  homeRegistrationId: string | null;
  homeTeamName: string;
  awayRegistrationId: string | null;
  awayTeamName: string;
  result: V1TournamentFixtureResult | null;
  videos: V1TournamentFixtureVideo[];
};

export type V1TournamentAnnouncement = {
  id: string;
  title: string;
  body: string;
  category: V1AnnouncementCategory;
  audience: string;
  publishedAt: string;
  createdAt: string;
};

export type V1TournamentSponsor = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  benefitText: string | null;
  boothText: string | null;
  eventTitle: string | null;
  eventDescription: string | null;
  eventResultText: string | null;
  sortOrder: number;
};

export type V1TournamentParticipantTeam = {
  registrationId: string;
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  teamRegionName: string | null;
  status: V1TournamentParticipantStatus;
  confirmedAt: string | null;
};

/** Serialized by TournamentsReadService.get — full public detail */
export type V1TournamentDetail = {
  id: string;
  sportId: string;
  /** Enriched sport object — code + name; sportId retained for back-compat */
  sport: { code: string; name: string };
  title: string;
  status: V1TournamentStatus;
  format: V1TournamentFormat;
  registrationDeadlineAt: string | null;
  /** 명단(선수단) 제출 마감일 — 지나면 신청 팀의 명단 추가/삭제/수정이 차단된다(팀별 예외 부여 가능). */
  rosterDeadlineAt: string | null;
  /** null이면 groups/fixtures가 빈 배열로 내려온다(대진표 비공개). 관리자가 일괄 공개하면 타임스탬프가 채워진다. */
  bracketPublishedAt: string | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  venue: string | null;
  /** venue를 카카오 로컬 API로 지오코딩한 좌표. 키 미설정/검색 실패 시 null(지도 임베드는 스킵, 네이버 지도 검색 링크로 폴백). */
  latitude: number | null;
  longitude: number | null;
  coverImageUrl: string | null;
  teamCount: number;
  minPlayers: number;
  maxPlayers: number;
  genderCategory: V1TournamentGenderCategory | null;
  genderMinMale: number | null;
  genderMaxMale: number | null;
  genderMinFemale: number | null;
  genderMaxFemale: number | null;
  entryFee: number;
  prizePool: number | null;
  prizeSummary: string | null;
  prizeBreakdown: string | null;
  promoHomeEnabled: boolean;
  promoHomeTitle: string | null;
  promoHomeSubtitle: string | null;
  promoHomeImageUrl: string | null;
  promoHomeBadgeText: string | null;
  promoHomeDateText: string | null;
  promoHomeTeamsText: string | null;
  promoHomeLocationText: string | null;
  promoHomePrizeText: string | null;
  promoHomePriority: number;
  promoListEnabled: boolean;
  promoListTitle: string | null;
  promoListSubtitle: string | null;
  promoListImageUrl: string | null;
  promoListBadgeText: string | null;
  promoListDateText: string | null;
  promoListTeamsText: string | null;
  promoListLocationText: string | null;
  promoListPrizeText: string | null;
  promoListPriority: number;
  campaignSlug: string | null;
  rulesText: string | null;
  refundPolicyText: string | null;
  confirmedCount: number;
  participantTeams: V1TournamentParticipantTeam[];
  pendingPaymentCount: number;
  groups: V1TournamentGroup[];
  fixtures: V1TournamentFixture[];
  announcements: V1TournamentAnnouncement[];
  sponsors: V1TournamentSponsor[];
  /** 대회 참가팀 후기 (status=completed 이후 참가 확정팀만 작성 가능) */
  reviews: V1TournamentReview[];
  /** 어드민이 입력한 개인 어워드 (MVP, 득점왕 등) */
  awards: V1TournamentAward[];
  /** 대회 상세 진입 시 노출할 활성 팝업(published + 노출 기간 내) 1건. 없으면 null. */
  popup: V1TournamentDetailPopup | null;
  createdAt: string;
  updatedAt: string;
};

export type V1TournamentReview = {
  id: string;
  authorId: string;
  authorNickname: string;
  authorProfileImageUrl: string | null;
  teamName: string | null;
  rating: number; // 1~5
  comment: string | null;
  photoUrls: string[];
  createdAt: string;
};

export type V1TournamentReviewsPage = {
  items: V1TournamentReview[];
  total: number;
  page: number;
  pageSize: number;
};

/** 어드민: 리뷰 모더레이션 뷰 — 공개 리뷰 필드 + 숨김 상태 */
export type V1AdminTournamentReview = V1TournamentReview & {
  hiddenAt: string | null;
  hiddenReason: string | null;
};

export type V1AdminTournamentReviewsPage = {
  items: V1AdminTournamentReview[];
  total: number;
  page: number;
  pageSize: number;
};

export type V1PendingTournamentReview = {
  tournamentId: string;
  tournamentTitle: string;
  completedAt: string;
};

export type V1TournamentAward = {
  id: string;
  awardType: string;   // 'mvp' | 'top_scorer' | ...
  awardLabel: string;  // 'MVP' | '득점왕' | ...
  recipientName: string;
  teamName: string | null;
  note: string | null;
};

/** Shared payment summary embedded in registrations */
export type V1TournamentPaymentSummary = {
  method: V1TournamentPaymentMethod;
  status: V1TournamentPaymentStatus;
  amount: number;
  paidAt: string | null;
  paymentDueAt: string | null;
};

export type V1TournamentPaymentInstructions = {
  bankName: string;
  bankAccount: string;
  bankHolder: string;
};

/** Serialized by TournamentRegistrationsService.serialize (consumer-facing) */
export type V1TournamentRegistration = {
  id: string;
  tournamentId: string;
  teamId: string;
  teamName?: string | null;
  appliedByUserId: string;
  status: V1TournamentRegistrationStatus;
  depositorName: string | null;
  agreedRules: boolean;
  agreedPrivacy: boolean;
  agreedRefund: boolean;
  agreedMediaConsent: boolean;
  confirmedAt: string | null;
  rosterLockedAt: string | null;
  /** 어드민이 부여한 명단 제출 마감 예외 — 부여된 이후에는 마감이 지나도 명단을 계속 수정할 수 있다 */
  rosterDeadlineOverrideAt: string | null;
  cancelRequestedAt: string | null;
  cancelReason: string | null;
  playerCount: number;
  payment: V1TournamentPaymentSummary | null;
  paymentInstructions: V1TournamentPaymentInstructions | null;
  createdAt: string;
  updatedAt: string;
};

/** Serialized by AdminRegistrationsService.serialize — admin view (extra confirmedByAdminUserId) */
export type V1AdminTournamentRegistration = Omit<
  V1TournamentRegistration,
  'paymentInstructions'
> & {
  confirmedByAdminUserId: string | null;
  // 목록 응답에만 포함(team join). mutation 응답에는 없음 → optional.
  teamName?: string | null;
  payment:
    | (V1TournamentPaymentSummary & { confirmedByAdminUserId: string | null })
    | null;
};

export type V1AdminTournamentRegistrationWithIdempotent =
  V1AdminTournamentRegistration & { alreadyProcessed: boolean };

/** Serialized by TournamentPlayersService.serializePlayer */
export type V1TournamentPlayer = {
  id: string;
  userId: string;
  realName: string;
  birthDateSnapshot: string | null;
  genderSnapshot: 'male' | 'female' | null;
  eligibilityStatus: V1PlayerEligibilityStatus;
  eligibilityNote: string | null;
  addedAt: string;
  removedAt: string | null;
};

export type V1TournamentRosterResponse = {
  players: V1TournamentPlayer[];
  belowMinimum: boolean;
};

export type V1AdminTournamentPlayer = V1TournamentPlayer & {
  phone: string | null;
  isTeamCaptain: boolean;
};

/** 어드민 전용 로스터 조회 응답 — 팀 비멤버 어드민도 조회 가능 (Task 110) */
export type V1AdminTournamentRosterResponse = Omit<V1TournamentRosterResponse, 'players'> & {
  players: V1AdminTournamentPlayer[];
  registrationId: string;
  teamId: string;
  teamName: string;
  rosterLockedAt: string | null;
};

/** Admin bracket bracket view: TournamentBracketService.getBracket groups item */
export type V1AdminBracketGroup = {
  id: string;
  tournamentId: string;
  name: string;
  phase: string;
  sortOrder: number;
  advanceCount: number | null;
  createdAt: string;
  updatedAt: string;
  groupTeams: V1AdminBracketGroupTeam[];
};

export type V1AdminBracketGroupTeam = {
  id: string;
  groupId: string;
  registrationId: string;
  teamName: string;
  sortOrder: number;
  createdAt: string;
};

export type V1AdminBracketFixture = {
  id: string;
  tournamentId: string;
  groupId: string | null;
  round: string;
  fixtureNumber: number;
  legNumber: number;
  parentFixtureId: string | null;
  homeRegistrationId: string | null;
  homeTeamName: string;
  awayRegistrationId: string | null;
  awayTeamName: string;
  scheduledAt: string | null;
  venue: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  result: V1AdminBracketResult | null;
  videos: V1TournamentFixtureVideo[];
};

export type V1AdminBracketResult = {
  id: string;
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  hasPenalty: boolean;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  note: string | null;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
  goals: V1TournamentFixtureGoal[];
};

export type V1AdminBracketStanding = {
  id: string;
  groupId: string;
  registrationId: string;
  teamName: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  position: number;
  recalculatedAt: string | null;
};

export type V1AdminTournamentBracket = {
  groups: V1AdminBracketGroup[];
  fixtures: V1AdminBracketFixture[];
  standings: V1AdminBracketStanding[];
};

/** Admin tournament announcement (includes tournamentId, body, updatedAt — full admin serialize) */
export type V1AdminTournamentAnnouncement = {
  id: string;
  tournamentId: string;
  title: string;
  body: string;
  category: V1AnnouncementCategory;
  audience: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type V1AdminTournamentAnnouncementWithIdempotent = V1AdminTournamentAnnouncement & {
  alreadyPublished: boolean;
};

export type V1AdminTournamentSponsor = V1TournamentSponsor & {
  tournamentId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type V1AdminTournamentStatusChangeResult = {
  tournamentId: string;
  previousStatus: V1TournamentStatus;
  status: V1TournamentStatus;
  alreadyInStatus: boolean;
};

/** Task 109 Track 6 — 대진표 일괄 공개 응답 */
export type V1PublishBracketResult = {
  tournamentId: string;
  bracketPublishedAt: string;
  alreadyPublished: boolean;
};

export type V1StandingsRecalculateResult = {
  tournamentId: string;
  groupCount: number;
  recalculatedAt: string;
};

export type V1ExportRosterCsvResult = {
  filename: string;
  csv: string;
};

export type V1TournamentListPage = {
  items: V1TournamentListItem[];
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

export type V1AdminTournamentListPage = {
  items: V1Tournament[];
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

export type V1AdminRegistrationListPage = {
  items: V1AdminTournamentRegistration[];
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

// Request payload types

export type V1CreateTournamentPayload = {
  sportId: string;
  title: string;
  format?: V1TournamentFormat;
  registrationDeadlineAt?: string;
  /** 명단(선수단) 제출 마감일 */
  rosterDeadlineAt?: string;
  scheduledAt?: string;
  scheduledEndAt?: string | null;
  venue?: string;
  coverImageUrl?: string | null;
  teamCount?: number;
  minPlayers?: number;
  maxPlayers?: number;
  genderCategory?: V1TournamentGenderCategory;
  genderMinMale?: number;
  genderMaxMale?: number;
  genderMinFemale?: number;
  genderMaxFemale?: number;
  entryFee?: number;
  prizePool?: number;
  prizeSummary?: string;
  prizeBreakdown?: string;
  promoHomeEnabled?: boolean;
  promoHomeTitle?: string;
  promoHomeSubtitle?: string;
  promoHomeImageUrl?: string;
  promoHomeBadgeText?: string;
  promoHomeDateText?: string;
  promoHomeTeamsText?: string;
  promoHomeLocationText?: string;
  promoHomePrizeText?: string;
  promoHomePriority?: number;
  promoListEnabled?: boolean;
  promoListTitle?: string;
  promoListSubtitle?: string;
  promoListImageUrl?: string;
  promoListBadgeText?: string;
  promoListDateText?: string;
  promoListTeamsText?: string;
  promoListLocationText?: string;
  promoListPrizeText?: string;
  promoListPriority?: number;
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
  rulesText?: string;
  refundPolicyText?: string;
};

export type V1UpdateTournamentPayload = Omit<
  Partial<V1CreateTournamentPayload>,
  | 'genderMinMale'
  | 'genderMaxMale'
  | 'genderMinFemale'
  | 'genderMaxFemale'
  | 'registrationDeadlineAt'
  | 'rosterDeadlineAt'
  | 'scheduledAt'
  | 'venue'
  | 'bankName'
  | 'bankAccount'
  | 'bankHolder'
  | 'rulesText'
  | 'refundPolicyText'
> & {
  genderMinMale?: number | null;
  genderMaxMale?: number | null;
  genderMinFemale?: number | null;
  genderMaxFemale?: number | null;
  registrationDeadlineAt?: string | null;
  rosterDeadlineAt?: string | null;
  scheduledAt?: string | null;
  venue?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  bankHolder?: string | null;
  rulesText?: string | null;
  refundPolicyText?: string | null;
};

export type V1ChangeTournamentStatusPayload = {
  status: V1TournamentStatus;
  reason?: string;
};

export type V1CreateRegistrationPayload = {
  teamId: string;
};

export type V1SubmitRegistrationPayload = {
  paymentMethod: V1TournamentPaymentMethod;
  depositorName?: string;
  agreedRules: boolean;
  agreedPrivacy: boolean;
  agreedRefund: boolean;
  agreedMediaConsent?: boolean;
};

export type V1CancelRegistrationRequestPayload = {
  reason?: string;
};

export type V1AddPlayerPayload = {
  userId: string;
  realName: string;
  birthDate?: string;
  eligibilityStatus?: V1PlayerEligibilityStatus;
};

export type V1UpdatePlayerEligibilityPayload = {
  eligibilityStatus: V1PlayerEligibilityStatus;
  note?: string;
};

export type V1AdminConfirmPaymentPayload = {
  note?: string;
};

export type V1AdminConfirmRegistrationPayload = {
  decision: 'confirm' | 'waitlist';
  note?: string;
};

export type V1AdminCancelRegistrationPayload = {
  reason?: string;
};

export type V1AdminRosterLockPayload = {
  note?: string;
};

export type V1CreateGroupPayload = {
  name: string;
  phase?: V1TournamentGroupPhase;
  sortOrder?: number;
  advanceCount?: number;
};

export type V1CreateGroupTeamPayload = {
  groupId: string;
  registrationId: string;
  sortOrder?: number;
};

export type V1UpdateFixturePayload = {
  scheduledAt?: string;
  venue?: string;
  homeRegistrationId?: string;
  awayRegistrationId?: string;
};

export type V1CreateFixturePayload = {
  groupId?: string;
  round: string;
  fixtureNumber: number;
  legNumber?: number;
  parentFixtureId?: string;
  homeRegistrationId?: string;
  awayRegistrationId?: string;
  scheduledAt?: string;
  venue?: string;
};

export type V1RecordResultPayload = {
  homeScore: number;
  awayScore: number;
  hasPenalty?: boolean;
  homePenaltyScore?: number;
  awayPenaltyScore?: number;
  note?: string;
  /** 전달 시 replace-all — 생략하면 기존 영상 목록 유지 */
  videos?: { title?: string; url: string }[];
  /** 전달 시 replace-all — 생략하면 기존 득점 기록 유지 */
  goals?: { team: 'home' | 'away'; playerId?: string; playerName: string; minute?: number }[];
};

export type V1CreateAnnouncementPayload = {
  title: string;
  body: string;
  category?: V1AnnouncementCategory;
  audience?: V1AnnouncementAudience;
  publish?: boolean;
};

export type V1CreateTournamentSponsorPayload = {
  name: string;
  description?: string;
  logoUrl?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  benefitText?: string;
  boothText?: string;
  eventTitle?: string;
  eventDescription?: string;
  eventResultText?: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type V1UpdateTournamentSponsorPayload = Partial<V1CreateTournamentSponsorPayload>;

/** 대회 상세 공개 응답에 포함되는 활성 팝업 1건(published + 노출 기간 내) */
export type V1TournamentDetailPopup = {
  popupId: string;
  title: string;
  body: string;
  imageUrl: string | null;
};

export type V1AdminTournamentPopup = {
  id: string;
  tournamentId: string;
  title: string;
  body: string;
  imageUrl: string | null;
  status: V1TournamentPopupStatus;
  displayStartAt: string | null;
  displayEndAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** V1TournamentPopup 상태 — 기존 V1AdminPopupStatus(홈 팝업)와 동일 값, 별도 타입으로 유지 */
export type V1TournamentPopupStatus = 'draft' | 'published' | 'archived';

export type V1CreateTournamentPopupPayload = {
  title: string;
  body: string;
  imageUrl?: string;
  status: V1TournamentPopupStatus;
  displayStartAt?: string | null;
  displayEndAt?: string | null;
};

export type V1UpdateTournamentPopupPayload = V1CreateTournamentPopupPayload;

export type V1AdminTournamentPopupListResult = {
  items: V1AdminTournamentPopup[];
};

export type V1DeleteTournamentPopupResult = {
  popupId: string;
  deleted: boolean;
};

export type V1UpdateAnnouncementPayload = V1CreateAnnouncementPayload;

export type V1DeleteAnnouncementResult = {
  id: string;
  tournamentId: string;
  deleted: boolean;
};

export type V1AdminAnnouncementListResult = {
  items: V1AdminTournamentAnnouncement[];
};

export type V1AdminTournamentSponsorListResult = {
  items: V1AdminTournamentSponsor[];
};

// ── Team Invitations ──────────────────────────────────────────────────────────

export type V1InvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

/** 보낸 초대 1건 (GET /teams/:teamId/invitations items 요소) */
export type V1TeamInvitationSummary = {
  invitationId: string;
  teamId: string;
  invitedUserId: string;
  status: V1InvitationStatus;
  message: string | null;
  createdAt: string;
  invitedUser: {
    userId: string;
    displayName: string;
    profileImageUrl: string | null;
  };
};

/** GET /teams/:teamId/invitations 응답 */
export type V1TeamInvitationsPage = {
  teamId: string;
  items: V1TeamInvitationSummary[];
};

/** 받은 초대 1건 (GET /me/invitations items 요소) */
export type V1ReceivedInvitation = {
  invitationId: string;
  teamId: string;
  status: V1InvitationStatus;
  message: string | null;
  createdAt: string;
  team: {
    teamId: string;
    name: string;
    sportId: string;
    logoUrl: string | null;
    introductionPreview: string | null;
  };
  invitedBy: {
    userId: string;
    displayName: string;
    profileImageUrl: string | null;
  };
};

/** GET /me/invitations 응답 */
export type V1ReceivedInvitationsPage = {
  items: V1ReceivedInvitation[];
};

/** POST /teams/:teamId/invitations 응답 */
export type V1SendInvitationResult = {
  invitationId: string;
  teamId: string;
  invitedUserId: string;
  status: V1InvitationStatus;
  alreadyInvited: boolean;
};

/** POST /teams/:teamId/invitations/:invitationId/cancel
 *  POST /team-invitations/:invitationId/accept
 *  POST /team-invitations/:invitationId/decline 공통 응답 형태 */
export type V1InvitationActionResult = {
  invitationId: string;
  teamId?: string;
  membershipId?: string;
  status: V1InvitationStatus;
  alreadyCancelled?: boolean;
  alreadyProcessed?: boolean;
};

/** 어드민이 편집하는 외부 연동 키의 출처 — 어떤 값이 실제로 쓰이고 있는지 화면에 안내하기 위함. */
export type V1IntegrationKeySource = 'admin' | 'env' | 'none';

/**
 * GET/PATCH /admin/settings/integrations 응답.
 * 값이 DB(어드민 설정)에 있으면 마스킹(끝 4자리만 노출)해서 반환하지만, source가 'env'
 * (환경변수 폴백 사용 중)이거나 'none'(둘 다 없음)이면 DB 원문 자체가 없으므로 null을 반환한다
 * — "값은 항상 마스킹"이 아니라 "DB에 값이 있을 때만 마스킹, 그 외엔 null".
 */
export type V1IntegrationSettings = {
  kakaoRestApiKey: string | null;
  kakaoRestApiKeySource: V1IntegrationKeySource;
  kakaoMapsJsKey: string | null;
  kakaoMapsJsKeySource: V1IntegrationKeySource;
  updatedAt: string | null;
};

/** PATCH /admin/settings/integrations 바디 — undefined=미변경, ""=삭제(env 폴백 복귀), 값=설정 */
export type V1UpdateIntegrationSettingsPayload = {
  kakaoRestApiKey?: string;
  kakaoMapsJsKey?: string;
};

/** GET /public/integrations/kakao-maps-key — 인증 불필요, 카카오맵 JS SDK 로드용 공개 키. */
export type V1PublicKakaoMapsKeyResponse = {
  kakaoMapsJsKey: string | null;
};
