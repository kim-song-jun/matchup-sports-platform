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
export type V1TeamMatchApiStatus = 'recruiting' | 'matched' | 'cancelled' | 'completed' | 'expired';
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
  };
  profile: {
    displayName: string;
    nickname?: string | null;
    avatarUrl?: string | null;
    profileVisibility?: string;
    regionSummary?: string | null;
  };
  onboarding?: unknown;
  reputation?: unknown;
};

export type V1DevLoginResponse = V1AuthMe & {
  session: {
    userId: string;
    userEmail: string | null;
  };
  next?: {
    route: string;
  };
};

export type V1AuthSessionResponse = V1DevLoginResponse;

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
  currentLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    capturedAt: string;
    matchedRegionId?: string | null;
  } | null;
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
  region?: { regionId: string; name: string } | null;
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
  region?: { regionId: string; name: string } | null;
  memberCount: number;
  trustState: TrustState | 'none';
  joinPolicy: 'approval_required' | 'closed';
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  introductionPreview?: string | null;
  skillLevelText?: string | null;
  levelLabel?: string | null;
  minLevel?: { code: string; name: string } | null;
  maxLevel?: { code: string; name: string } | null;
  genderRule?: string | null;
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
  sport: { sportId: string; name: string };
  region: { regionId: string; name: string } | null;
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
  region: { regionId: string; name: string } | null;
  joinPolicy?: 'approval_required' | 'closed';
  trustState?: TrustState | 'none';
  version?: string;
  profile: {
    logoUrl: string | null;
    coverImageUrl: string | null;
    introduction: string | null;
    activityAreaText: string | null;
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
  photos?: string[];
  introduction?: string | null;
  activityAreaText?: string | null;
  skillLevelText?: string | null;
  minLevelCode?: string | null;
  maxLevelCode?: string | null;
  genderRule?: string | null;
  joinPolicy: 'approval_required' | 'closed';
  memberGoalCount?: number | null;
};

export type V1TeamUpdatePayload = V1TeamMutationPayload & {
  version: string;
};

export type V1TeamMutationResult = {
  teamId: string;
  membershipId?: string;
  role?: string;
  status?: string;
  updatedAt?: string;
  version?: string;
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
  role?: string;
  status?: string;
  managerCount?: number;
  memberCount?: number;
  removedAt?: string;
};

export type V1TeamMember = {
  membershipId: string;
  userId: string;
  displayName: string;
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
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

export type V1TeamMatch = V1Match & {
  teamMatchId?: string;
  sport?: { sportId: string; name: string };
  region?: { regionId: string; name: string } | null;
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

export type V1ReviewSourceType = 'match' | 'team_match';
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
};

export type V1ChatMessage = {
  messageId: string;
  sender: {
    userId: string;
    displayName: string;
    profileImageUrl: string | null;
  };
  content: string | null;
  status: string;
  sentAt: string;
  mine: boolean;
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
  };
  participants: Array<{
    userId: string;
    displayName: string;
    role: string;
  }>;
};

export type V1ChatRoomResolveResult = {
  roomId: string;
  roomType: 'match' | 'team_match';
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
  authProvider: 'email' | 'kakao' | 'naver' | null;
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
    profileImageUrl: string | null;
    bio: string | null;
    visibilityStatus: 'public' | 'members_only' | 'private';
  };
  reputation: {
    trustState: TrustState;
    mannerScore: number | null;
    activityCount: number;
    reviewCount: number;
  };
  displayName?: string;
  bio?: string;
  trustState?: TrustState;
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
  };
  profile: {
    displayName: string;
    visibilityStatus: 'public' | 'members_only' | 'private';
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
  notice?: { noticeId: string; title: string; pinned: boolean } | null;
  notifications?: { unreadCount: number };
  notices?: V1Notice[];
  recommendedMatches?: V1Match[];
  recommendedTeamMatches?: V1TeamMatch[];
  recommendedTeams?: V1Team[];
};
