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

// 서버 buildPageInfo 응답과 1:1 대응한다. 커서 전용 목록과 페이지 번호 목록이
// 같은 타입을 쓰도록 이름을 붙였다 — 목록마다 인라인으로 복사하면 확장이 어긋난다.
export type PageInfo = {
  nextCursor: string | null;
  hasNext: boolean;
  // 페이지 번호 페이지네이션. 서버가 buildPageInfo 로 내려주는 목록에만 존재하며,
  // 아직 커서만 지원하는 목록에서는 undefined 다 — 화면은 있을 때만 페이지 UI 를 그린다.
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasPrev?: boolean;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
  pageInfo?: PageInfo;
};

export type AdminListSummary = {
  total: number;
  byStatus: Record<string, number>;
  byCategory?: Record<string, number>;
  byAudience?: Record<string, number>;
};

export type AdminCursorPage<T> = CursorPage<T> & {
  summary: AdminListSummary;
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

/** 휴대폰 본인인증으로 찾은 계정. 이메일은 마스킹된 값만 내려온다. */
export type V1FoundAccount = {
  maskedEmail: string | null;
  providers: string[];
  hasPassword: boolean;
};

export type V1AuthMe = {
  /**
   * 카카오 가입 진행 중에만 채워진다 — 카카오 동의항목이 승인된 앱에서만 값이 오고,
   * 미승인이면 null 이라 화면은 기존처럼 직접 입력을 받는다.
   *
   * 서버는 항상 이 키를 내려주지만(해당 없으면 null) 타입은 optional 로 둔다 — 배포 직후
   * 브라우저에 남아 있는 이전 /auth/me 캐시 응답에는 키 자체가 없어서, required 로 두면
   * 실제로 들어올 수 있는 값을 타입이 부정하게 된다.
   */
  socialSignupPrefill?: {
    name: string | null;
    phone: string | null;
    gender: 'male' | 'female' | null;
  } | null;
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
  termsCompliance?: {
    compliant: boolean;
    pendingRequiredDocumentIds: string[];
    nextRoute: string | null;
  };
  reputation?: unknown;
  verification?: {
    emailVerified: boolean;
    phoneVerified: boolean;
  };
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

export type V1RichContentMark = {
  type: 'bold' | 'italic' | 'underline' | 'strike' | 'link';
  attrs?: { href?: string; target?: '_blank'; rel?: 'noopener noreferrer nofollow' };
};

export type V1RichContentNode = {
  type: 'doc' | 'paragraph' | 'heading' | 'bulletList' | 'orderedList' | 'listItem' | 'blockquote' | 'horizontalRule' | 'hardBreak' | 'image' | 'text';
  attrs?: {
    level?: 2 | 3;
    src?: string;
    alt?: string;
    title?: string | null;
    // Tiptap's Image/TextAlign extensions default unset attrs to `null` (not
    // `undefined`) in the JSON they emit via getJSON() — apps/v1_api's
    // rich-content.ts normalizer explicitly strips these null defaults, so the
    // type must allow them to match what the editor actually sends.
    width?: number | null;
    height?: number | null;
    assetId?: string | null;
    textAlign?: 'left' | 'center' | 'right' | null;
  };
  content?: V1RichContentNode[];
  marks?: V1RichContentMark[];
  text?: string;
};

export type V1RichContentDocument = V1RichContentNode & { type: 'doc' };

export type V1Notice = {
  id?: string;
  noticeId?: string;
  audience?: string;
  title: string;
  category?: string;
  publishedAt: string;
  body?: string | null;
  content?: V1RichContentDocument | null;
  contentVersion?: number;
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
  content?: V1RichContentDocument | null;
  contentVersion?: number;
  targetScreens: V1PopupTargetScreen[];
  targetPaths?: string[];
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

/** #3 1단계: 위저드 장소 입력창 포커스 시 노출하는 최근 사용 장소 칩. */
export type V1RecentVenue = { placeName: string; addressText: string | null };

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
  /** 승인 대기(joinState === 'requested') 중일 때의 신청 시각. 그 외에는 null. */
  requestedAt: string | null;
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

/** 내가 보낸 가입 신청 1건 (GET /me/join-applications items 요소) */
export type V1MyJoinApplication = {
  applicationId: string;
  teamId: string;
  /** V1TeamJoinApplicationStatus — requested | approved | rejected | withdrawn | expired */
  status: string;
  message: string | null;
  createdAt: string;
  reviewedAt: string | null;
  withdrawnAt: string | null;
  team: {
    teamId: string;
    name: string;
    sportId: string;
    logoUrl: string | null;
    introductionPreview: string | null;
  };
};

/** GET /me/join-applications 응답 */
export type V1MyJoinApplicationsPage = {
  items: V1MyJoinApplication[];
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

// ── Team schedules (Task 12 backend / Task 13 frontend) ──────────────────────
// 서버 shipped Prisma enum이 canonical (docs/api/domains/team-schedules.md 참조) —
// 문서의 예전 프로즈(attending|not_attending|undecided 등)가 아니라 아래 값이 실제 계약이다.

export type V1ScheduleType = 'MATCH' | 'TRAINING' | 'EVENT';
export type V1ScheduleVisibility = 'TEAM' | 'MEMBERS' | 'PUBLIC';
export type V1ScheduleState = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
/** WAITLISTED는 서버가 용량 초과 시에만 부여하는 파생 상태 — 클라이언트가 직접 설정할 수 없다. */
export type V1AttendanceStatus = 'GOING' | 'MAYBE' | 'NOT_GOING' | 'WAITLISTED';
export type V1ClientSettableAttendanceStatus = 'GOING' | 'MAYBE' | 'NOT_GOING';
export type V1GuestRecruitmentVisibility = 'MEMBERS' | 'PUBLIC';
/** FILLED은 approvedCount === slots일 때 서버가 파생하는 상태 — 클라이언트가 설정할 수 없다. */
export type V1GuestRecruitmentState = 'OPEN' | 'CLOSED' | 'FILLED';
export type V1GuestApplicationState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

/** GET .../schedules 목록 항목, GET .../schedules/:id 상세의 공통 베이스 (TeamSchedulesService.toSummary) */
export type V1TeamScheduleSummary = {
  id: string;
  title: string;
  type: V1ScheduleType;
  startAt: string;
  endAt: string;
  timezone: string;
  capacity: number | null;
  rsvpDeadlineAt: string | null;
  visibility: V1ScheduleVisibility;
  state: V1ScheduleState;
  version: number;
  teamMatchId: string | null;
  /**
   * 매치 ↔ 팀일정 연동: type이 'MATCH'일 때만 유효한 파생 필드 — TeamMatch.approvedApplicantTeamId
   * 유무로 매 조회 시점 계산된다(false=가확정/상대팀 모집 중, true=확정). MATCH가 아닌 스케줄은
   * 항상 null.
   */
  matchConfirmed: boolean | null;
  goingCount: number;
  waitlistedCount: number;
};

export type V1TeamSchedulesPage = {
  items: V1TeamScheduleSummary[];
  nextCursor: string | null;
};

export type V1ScheduleGuestRecruitmentView = {
  id: string;
  scheduleId: string;
  slots: number;
  closesAt: string;
  note: string | null;
  visibility: V1GuestRecruitmentVisibility;
  state: V1GuestRecruitmentState;
  version: number;
  applicantCount: number;
  approvedCount: number;
};

/** GET .../schedules/:scheduleId 참가자 명단 항목 — 팀원(멤버)에게만 노출됨 */
export type V1ScheduleAttendeeView = {
  userId: string;
  nickname: string;
  profileImageUrl: string | null;
  status: V1AttendanceStatus | 'NO_RESPONSE';
  waitlistPosition: number | null;
};

/** GET .../schedules/:scheduleId 상세 응답 (TeamSchedulesService.detail) */
export type V1TeamScheduleDetail = V1TeamScheduleSummary & {
  cancelReason: string | null;
  cancelledAt: string | null;
  guestRecruitment: V1ScheduleGuestRecruitmentView | null;
  myAttendance: { status: V1AttendanceStatus; version: number; waitlistPosition: number | null } | null;
  /** 활성 팀원 전체 명단(응답자+미응답자). 비멤버/공개 열람자에게는 null. */
  attendees: V1ScheduleAttendeeView[] | null;
};

/** POST/PATCH .../schedules[/:id] 응답 (TeamSchedulesService.toDetailJson + replayed) */
export type V1TeamScheduleMutationResult = {
  id: string;
  teamId: string;
  title: string;
  type: V1ScheduleType;
  startAt: string;
  endAt: string;
  timezone: string;
  capacity: number | null;
  rsvpDeadlineAt: string | null;
  visibility: V1ScheduleVisibility;
  state: V1ScheduleState;
  version: number;
  teamMatchId: string | null;
  matchConfirmed: boolean | null;
  replayed: boolean;
};

// 매치 ↔ 팀일정 연동: MATCH 타입 스케줄은 이제 TeamMatchesService가 트랜잭션 안에서만 만든다 —
// 이 공개 create 경로는 teamMatchId를 더 이상 받지 않는다(백엔드 CreateScheduleDto와 대칭,
// team-schedules.service.ts의 SCHEDULE_MATCH_TYPE_SYSTEM_ONLY 참고).
// `type` 은 V1ScheduleType 전체가 아니라 MATCH 를 뺀 것이다. 전체를 쓰면 서버가 422
// (SCHEDULE_MATCH_TYPE_SYSTEM_ONLY)로 거부할 payload 를 프런트가 타입 검사 통과시킨 채
// 만들어낼 수 있다 — 계약 불일치를 컴파일 시점에 막는다.
export type V1CreateScheduleDto = {
  title: string;
  type: Exclude<V1ScheduleType, 'MATCH'>;
  startAt: string;
  endAt: string;
  timezone: string;
  capacity?: number;
  rsvpDeadlineAt?: string;
  visibility?: V1ScheduleVisibility;
};

export type V1UpdateScheduleDto = {
  expectedVersion: number;
  title?: string;
  startAt?: string;
  endAt?: string;
  capacity?: number;
  /** 명시적으로 null이면 서버가 SQL NULL로 지운다 — omit이면 기존 값 유지 */
  rsvpDeadlineAt?: string | null;
  visibility?: V1ScheduleVisibility;
};

export type V1CancelScheduleDto = {
  expectedVersion: number;
  cancelReason: string;
};

export type V1CancelScheduleResult = {
  state: 'cancelled';
  version: number;
  cancelledAt: string;
  replayed: boolean;
};

export type V1CompleteScheduleResult = {
  state: 'completed';
  version: number;
  completedAt: string;
  replayed: boolean;
};

export type V1TriggerScheduleReminderDto = {
  kind: 'rsvp_deadline' | 'guest_recruitment_close';
};

export type V1TriggerScheduleReminderResult = {
  jobId: string;
  kind: 'rsvp_deadline' | 'guest_recruitment_close';
  status: string;
  replayed: boolean;
};

export type V1SetScheduleAttendanceDto = {
  status: V1ClientSettableAttendanceStatus;
  expectedVersion: number;
};

export type V1SetScheduleAttendanceResult = {
  status: V1AttendanceStatus;
  version: number;
  waitlistPosition: number | null;
  counts: { going: number; maybe: number; notGoing: number; waitlisted: number };
  replayed: boolean;
};

export type V1CreateGuestRecruitmentDto = {
  slots: number;
  closesAt: string;
  note?: string;
  visibility?: V1GuestRecruitmentVisibility;
};

export type V1UpdateGuestRecruitmentDto = {
  expectedVersion: number;
  slots?: number;
  closesAt?: string;
  note?: string;
  visibility?: V1GuestRecruitmentVisibility;
  state?: 'open' | 'closed';
};

export type V1GuestRecruitmentMutationResult = V1ScheduleGuestRecruitmentView & { replayed: boolean };

export type V1CreateGuestApplicationDto = {
  displayName: string;
  note?: string;
};

export type V1GuestApplicationResult = {
  applicationId: string;
  state: V1GuestApplicationState;
  displayName: string;
  note: string | null;
  alreadyApplied: boolean;
  replayed: boolean;
};

/** GET /me/schedule 항목 — TeamSchedulesService.mySchedule */
export type V1MyScheduleItem = V1TeamScheduleSummary & {
  teamId: string;
  teamName: string | null;
  myRole: string | null;
  myAttendanceStatus: V1AttendanceStatus | null;
};

export type V1MySchedulePage = {
  items: V1MyScheduleItem[];
  nextCursor: string | null;
};

export type V1TeamMatch = V1Match & {
  teamMatchId?: string;
  // Task 17: the Game backing this team match (see docs/api/v1/domains/team-matches.md) —
  // the only client-facing way to reach `/api/v1/games/:gameId/result-revisions*`.
  gameId?: string | null;
  sport?: { sportId: string; name: string };
  region?: { regionId: string; name: string; parentName?: string | null } | null;
  place?: { name: string; addressText?: string | null };
  displayState?: V1TeamMatchApiStatus;
  costNote?: string | null;
  rulesText?: string | null;
  minLevelCode?: string | null;
  maxLevelCode?: string | null;
  genderRule?: string | null;
  matchFormat?: string | null;
  matchStyle?: string[];
  uniformColor?: string | null;
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
  matchFormat?: string | null;
  matchStyle?: string[];
  uniformColor?: string | null;
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
    matchFormat?: string | null;
    matchStyle?: string[];
    uniformColor?: string | null;
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

// ─── Task 17: Game aggregate + team result revisions (docs/api/domains/games.md) ───

export type V1GameSourceType = 'TEAM_MATCH' | 'TOURNAMENT_FIXTURE';
// `V1GameState`는 아래 Task 18 블록에 `V1_GAME_STATES` 상수와 함께 선언돼 있다.
// 머지 과정에서 양쪽 브랜치가 각각 같은 유니온을 추가해 중복 선언(TS2300)이
// 발생했으므로, 문서 주석과 상수를 함께 갖춘 쪽만 단일 정의로 남긴다.
export type V1GameResultRevisionState =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'CHANGE_REQUESTED'
  | 'SUPPLEMENT_REQUESTED'
  | 'REJECTED'
  | 'OFFICIAL'
  | 'VOID';

export type V1GameSide = {
  id: string;
  gameId: string;
  sideKey: 'HOME' | 'AWAY';
  teamId: string | null;
  displayNameSnapshot: string;
};

export type V1GameLineupSummary = {
  id: string;
  gameId: string;
  sideId: string;
  revision: number;
  state: string;
  version: number;
  submittedAt: string | null;
  supersedesId: string | null;
};

export type V1Game = {
  id: string;
  sourceType: V1GameSourceType;
  state: V1GameState;
  version: number;
  lastSequence: number;
  competitionConfigVersionId: string;
  currentOfficialRevisionId: string | null;
  sides: V1GameSide[];
  periods: unknown[];
  lineups: V1GameLineupSummary[];
  actorRole: string;
  lineupConfig?: V1LineupConfig;
};

/**
 * `V1GameResultRevision.score` 의 실제 응답 구조 — 두 형태가 실제로 공존한다.
 *
 * (a) 레거시 백필(`apps/v1_api/src/games/migration/game-result-backfill.ts` 의
 *     ScoreSnapshot)로 들어온 경기는 `{ regulation, penalty, goals, incomplete, provenance }`
 *     로 감싸여 있다.
 * (b) 이 화면(team-match 결과 입력, `createResultRevision`)이 새로 만드는 경기는
 *     `CreateGameResultRevisionDto.score`(`GameScoreDto`, `apps/v1_api/src/games/dto/game-result.dto.ts`)를
 *     가공 없이 그대로 저장해 `{ home, away, penalties? }` 로 평평하다. 라이브 DB 확인 결과
 *     실제로 `{"away":1,"home":3}` 형태로 저장되어 있었다 — (a)만 가정하고 `score.regulation`을
 *     읽던 이전 버전은 이 경로에서 언제나 undefined가 되어 "기록 없음"만 표시했다(실제 버그,
 *     2026-08 QA 재현).
 *
 * 읽는 쪽은 반드시 `'regulation' in score` 로 분기해야 한다(`scoreLabel`/`GoalTimeline` 참고).
 */
export type V1GameResultScore =
  | {
      regulation: { home: number; away: number } | null;
      penalty: { home: number; away: number } | null;
      goals: Array<{
        team: 'home' | 'away';
        playerId: string | null;
        playerName: string;
        minute: number | null;
      }>;
      incomplete: boolean;
      provenance?: string;
    }
  | {
      home: number;
      away: number;
      penalties?: { home: number; away: number };
    };

export type V1GameResultCards = { yellow: number; red: number };

export type V1GameResultParticipantRow = {
  id: string;
  resultRevisionId: string;
  participantId: string;
  sideId: string;
  started: boolean;
  minutesPlayed: number | null;
  goals: number;
  assists: number;
  fouls: number;
  cards: V1GameResultCards;
  goalkeeper: boolean;
};

export type V1GameResultRevision = {
  id: string;
  gameId: string;
  revision: number;
  state: V1GameResultRevisionState;
  score: V1GameResultScore;
  eventsHash: string;
  missingScorer: boolean;
  mvpParticipantId: string | null;
  reason: string | null;
  createdByActorType: 'USER' | 'SYSTEM';
  createdByUserId: string | null;
  createdBySystemActor: string | null;
  supersedesId: string | null;
  submittedAt: string | null;
  officialAt: string | null;
  createdAt: string;
  updatedAt: string;
  resultParticipants: V1GameResultParticipantRow[];
};

export type V1GameResultParticipantInput = {
  participantId: string;
  sideId: string;
  started: boolean;
  minutesPlayed?: number;
  goals: number;
  assists: number;
  fouls: number;
  cards: V1GameResultCards;
  goalkeeper: boolean;
};

/**
 * 결과 제출 시 **보내는** 스코어. 서버가 돌려주는 스냅샷(`V1GameResultScore`)과 형태가 다르다 —
 * 보낼 때는 정규시간 점수만 평평하게 보내고, 서버가 regulation/penalty/goals/incomplete 로
 * 감싼 스냅샷을 만들어 돌려준다. 예전에는 두 방향이 한 타입을 공유해서 읽기 쪽 형태가 틀린 채로
 * 컴파일을 통과했다.
 */
export type V1GameResultScoreInput = {
  home: number;
  away: number;
};

export type V1CreateGameResultRevisionPayload = {
  expectedVersion: number;
  score: V1GameResultScoreInput;
  actualParticipants: V1GameResultParticipantInput[];
  eventsHash: string;
  mvpParticipantId?: string;
  reason?: string;
};

export type V1SubmitGameResultRevisionPayload = {
  expectedVersion: number;
};

export type V1DecideGameResultRevisionPayload = {
  expectedVersion: number;
  decision: 'approve' | 'change_request';
  reason?: string;
};

export type V1GameRevisionMutationResult = {
  gameId: string;
  state: V1GameState;
  version: number;
  durableCommandId: string;
  replayed: boolean;
  revisionId: string;
  revision: number;
  revisionState: V1GameResultRevisionState;
};

// ── 팀 매치 라인업 (Task 14/15) ──
// GET .../lineup 은 호출자 소속 팀(내 팀) 쪽 사이드만 돌려준다 — 상대팀 라인업을 읽는
// 엔드포인트는 없다(정정 요청은 내용을 보지 않고 사유만 남기는 blind 액션).
export type V1TeamMatchLineupRole = 'team_owner' | 'team_manager';
export type V1TeamMatchLineupState = 'DRAFT' | 'SUBMITTED' | 'LOCKED';

export type V1TeamMatchLineupStarter = {
  // `V1GameParticipant.id` — Task 17의 결과 입력 폼이 골·카드를 특정 로스터 행에
  // 귀속시키려면 반드시 필요하다(team-match-lineup.service.ts의 라인업 조회 매퍼가
  // 이 값을 실어 보낸다). team-match-result.types.ts의 toResultRosterRows()가
  // participantId로 그대로 사용하므로 지우면 귀속이 undefined가 된다.
  id: string;
  displayName: string;
  jerseyNumber: number | null;
  position: string | null;
  goalkeeper: boolean;
  // 피치 배치 좌표, 0~100 퍼센트(자기 진영 기준: y=0 골라인, y=100 하프라인). 둘 다 있거나 둘 다 없다.
  positionX: number | null;
  positionY: number | null;
};

export type V1TeamMatchLineupBenchEntry = {
  id: string;
  displayName: string;
  jerseyNumber: number | null;
};

// 서버 `V1CompetitionConfigVersion.lineup`이 라인업 응답에 실어 내려주는 종목별
// 포지션·포메이션 사전(T1-5). 프론트에는 하드코딩 카탈로그를 두지 않는다(D-17) —
// apps/v1_web/src/components/lineup/formation-slots.ts가 이 shape의 단일 소비처다.
export type V1LineupConfigPosition = {
  code: string;
  label: string;
  short: string;
  goalkeeper?: boolean;
};

export type V1LineupConfigFormation = {
  code: string;
  label: string;
  outfield: number;
  slots: Array<{ position: string; x: number; y: number }>;
};

export type V1LineupConfig = {
  positions: V1LineupConfigPosition[];
  formations: V1LineupConfigFormation[];
  /**
   * 이 대회에 설정된 **출전 인원**(GK 포함, `CompetitionConfig.lineup.{minPlayers,maxPlayers}`).
   * 대회 "등록" 로스터 크기(`V1Tournament.minPlayers/maxPlayers`)와는 완전히 다른 값이다 —
   * 섞으면 안 된다(서버 `lineup-size.ts`가 같은 경고를 달고 있다).
   *
   * optional인 이유: 이 필드는 나중에 추가돼(2026-08) 프론트가 먼저 배포되는 창구에서는
   * 구버전 응답에 없을 수 있다. 없으면 화면은 인원 안내만 생략하고 나머지는 그대로 동작한다.
   */
  minPlayers?: number;
  maxPlayers?: number;
};

export type V1TeamMatchLineup = {
  teamMatchId: string;
  gameId: string;
  sideId: string;
  role: V1TeamMatchLineupRole;
  lineupId: string | null;
  // revision은 이 라인업 계보의 CAS 토큰(expectedVersion으로 그대로 재사용). 매 저장마다
  // 새 행으로 supersede되므로 row 자체의 `version`과는 별개다 — team-match-lineup.service.ts 참조.
  revision: number;
  state: V1TeamMatchLineupState;
  version: number;
  // 포메이션 프리셋 라벨("4-4-2" 등), null이면 자유 배치.
  formation: string | null;
  publicLineupAt: string | null;
  starters: V1TeamMatchLineupStarter[];
  bench: V1TeamMatchLineupBenchEntry[];
  lineupConfig?: V1LineupConfig;
};

// 저장 요청 한 명분 — userId(연동된 활성 팀원) 또는 displayName(비연동 게스트) 중 하나는
// 반드시 있어야 한다(서버 XOR 검증, 프론트는 이 계약을 어기지 않도록 뷰모델에서 보장).
export type V1TeamMatchLineupParticipantInput = {
  userId?: string;
  displayName?: string;
  jerseyNumber?: number;
  position?: string;
  goalkeeper?: boolean;
  positionX?: number;
  positionY?: number;
};

// Task 15 blocker-2가 막았던 `formation` — V1GameLineup.formation 마이그레이션이
// 추가돼 이제 저장·응답 모두 반영된다.
export type V1TeamMatchLineupSavePayload = {
  expectedVersion: number;
  formation?: string;
  starters: V1TeamMatchLineupParticipantInput[];
  bench: V1TeamMatchLineupParticipantInput[];
};

export type V1TeamMatchLineupSaveResult = {
  teamMatchId: string;
  gameId: string;
  sideId: string;
  lineupId: string;
  revision: number;
  state: V1TeamMatchLineupState;
  version: number;
  replayed: boolean;
};

export type V1TeamMatchLineupSubmitResult = V1TeamMatchLineupSaveResult & {
  publicLineupAt: string | null;
};

export type V1TeamMatchLineupChangeRequestResult = {
  teamMatchId: string;
  gameId: string;
  sideId: string;
  lineupId: string;
  revision: number;
  state: 'change_requested';
  version: number;
  reason: string;
  replayed: boolean;
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
    /** 팀 후기는 참가팀 active 멤버 전원이 쓸 수 있으므로 일반 멤버(member)도 온다. */
    role: 'owner' | 'manager' | 'member';
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

export type V1ReviewTagRate = {
  tagCode: string;
  label: string;
  rate: number;
  count: number;
};

export type V1ReviewSportSummary = {
  sportId: string;
  ratingAvg: number | null;
  ratingCount: number;
  tagRates: V1ReviewTagRate[];
};

export type V1ReviewReceivedSummaryResponse = {
  bySport: V1ReviewSportSummary[];
  availableMonths: string[];
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
  theme: 'light' | 'dark' | 'system';
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
  content: V1RichContentDocument;
  contentVersion: number;
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
  body?: string;
  content: V1RichContentDocument;
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

export type V1ManagedTermsContext = 'signup' | 'tournament_application' | 'footer';
export type V1ManagedTermsRequirement = 'required' | 'optional' | 'display_only';
export type V1ManagedTermsDocumentStatus = 'draft' | 'published' | 'archived';

export type V1AdminTermsPlacement = {
  placementId: string;
  context: V1ManagedTermsContext;
  requirement: V1ManagedTermsRequirement;
  displayOrder: number;
  isActive: boolean;
};

export type V1AdminTermsDocument = {
  documentId: string;
  version: string;
  title: string;
  subtitle: string | null;
  content: string;
  contentHash: string;
  changeSummary: string | null;
  requiresReconsent: boolean;
  enforcementAt: string | null;
  status: V1ManagedTermsDocumentStatus;
  effectiveAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  supersedesDocumentId: string | null;
  consentEventCount: number;
  createdAt: string;
  updatedAt: string;
};

export type V1AdminTermsPolicy = {
  policyId: string;
  code: string;
  name: string;
  isActive: boolean;
  currentDocumentId: string | null;
  placements: V1AdminTermsPlacement[];
  documents: V1AdminTermsDocument[];
  createdAt: string;
  updatedAt: string;
};

export type V1AdminTermsListResult = {
  items: V1AdminTermsPolicy[];
  summary: { total: number; active: number; draftDocuments: number };
};

export type V1AdminTermsPlacementPayload = Omit<V1AdminTermsPlacement, 'placementId'>;
export type V1AdminTermsVersionPayload = {
  version: string;
  title: string;
  subtitle?: string;
  content: string;
  changeSummary?: string;
  effectiveAt?: string | null;
  requiresReconsent?: boolean;
  enforcementAt?: string | null;
};
export type V1AdminTermsPolicyCreatePayload = V1AdminTermsVersionPayload & {
  code: string;
  name: string;
  placements: V1AdminTermsPlacementPayload[];
};
export type V1AdminTermsPolicyUpdatePayload = {
  name: string;
  isActive: boolean;
  placements: V1AdminTermsPlacementPayload[];
};
export type V1AdminTermsStatusPayload = {
  status: Extract<V1ManagedTermsDocumentStatus, 'published' | 'archived'>;
  reason: string;
};

export type V1CurrentTermsItem = {
  policyId: string;
  code: string;
  documentId: string;
  version: string;
  title: string;
  subtitle: string | null;
  content: string;
  changeSummary: string | null;
  requirement: V1ManagedTermsRequirement;
  displayOrder: number;
  requiresReconsent: boolean;
  enforcementAt: string | null;
  effectiveAt: string | null;
  accepted: boolean;
  requiresAction: boolean;
};

export type V1CurrentTerms = {
  context: V1ManagedTermsContext;
  ready: boolean;
  items: V1CurrentTermsItem[];
  compliance: {
    compliant: boolean;
    pendingRequiredDocumentIds: string[];
    nextRoute: string | null;
  } | null;
};
export type V1CurrentSignupTermsItem = V1CurrentTermsItem;
export type V1CurrentSignupTerms = V1CurrentTerms & { context: 'signup' };

export type V1AdminPopupStatus = 'draft' | 'published' | 'archived';

export type V1AdminPopupRow = {
  popupId: string;
  audience: V1AdminNoticeAudience;
  title: string;
  body: string;
  content: V1RichContentDocument;
  contentVersion: number;
  targetScreens: V1PopupTargetScreen[];
  targetPaths?: string[];
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
  body?: string;
  content: V1RichContentDocument;
  targetScreens: V1PopupTargetScreen[];
  targetPaths: string[];
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
  phone: string | null;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  birthDate: string | null;
  displayRegion: string | null;
  bio: string | null;
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
  members: {
    membershipId: string;
    userId: string;
    name: string | null;
    nickname: string | null;
    email: string | null;
    phone: string | null;
    role: 'owner' | 'manager' | 'member';
    joinedAt: string | null;
  }[];
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
  /** 페이지 번호(1부터). cursor 와 함께 보내면 서버가 page 를 우선한다. */
  page?: number;
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
// Admin — SMS / 인증 실패 로그
// ---------------------------------------------------------------------------

/**
 * eventType 은 서버에서 자유 문자열(String 컬럼)로 내려온다 — 프론트는 알고 있는 값만
 * 한국어로 치환하고 모르는 값은 원문 그대로 보여준다(새 이벤트 추가 시 UI 배포 없이도 노출).
 */
export type V1SmsFailureSummary = {
  id: string;
  eventType: string;
  resultCode: string | null;
  phoneMasked: string;
  provider: string | null;
  detail: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
};

export type V1AdminOpsSummary = {
  pushFailures5m: number;
  smsFailures5m: number;
};

// ---------------------------------------------------------------------------
// Admin — 에러 로그 뷰어
// ---------------------------------------------------------------------------

/** source 는 서버(server) / 클라이언트(client) 두 값만 존재한다. */
export type V1AdminErrorLogSource = 'server' | 'client';

/** level 은 error / warn 두 값만 존재한다. */
export type V1AdminErrorLogLevel = 'error' | 'warn';

export type V1AdminErrorLogListItem = {
  id: string;
  source: V1AdminErrorLogSource;
  level: V1AdminErrorLogLevel;
  statusCode: number | null;
  errorCode: string | null;
  method: string | null;
  route: string | null;
  message: string;
  occurrenceCount: number;
  releaseSha: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type V1AdminErrorLogDetail = V1AdminErrorLogListItem & {
  stack: string | null;
  requestBody: unknown;
  requestHeaders: unknown;
  responseBody: unknown;
  context: unknown;
  userId: string | null;
  userAgent: string | null;
};

export type V1AdminErrorLogsPage = {
  items: V1AdminErrorLogListItem[];
  pageInfo: PageInfo;
};

export type V1AdminErrorLogFilters = {
  source?: V1AdminErrorLogSource;
  statusCode?: number;
  level?: V1AdminErrorLogLevel;
  from?: string;
  to?: string;
  q?: string;
  cursor?: string;
  page?: number;
  limit?: number;
};

// ---------------------------------------------------------------------------
// Admin — game operation flags (PUBLIC_LIVE / DIRECTOR_OFFICIALIZE admin toggle)
// ---------------------------------------------------------------------------

export type V1GameOperationFlagKey = 'PUBLIC_LIVE' | 'DIRECTOR_OFFICIALIZE';

export type V1GameOperationFlagValue = 'off' | 'on';

export type V1GameOperationFlag = {
  key: V1GameOperationFlagKey;
  value: V1GameOperationFlagValue;
  version: number;
  ownerActor: string;
  updatedByUserId: string | null;
  rollbackValue: string | null;
  updatedAt: string;
};

/**
 * 게이트 번들 없이 켜고 끄는 간소 경로가 열려 있는지 — `v1_game_operation_gate_settings` 싱글턴
 * 행을 그대로 반영한다(더는 환경변수가 아니라 CAS 가능한 DB 값). `version`은 켜기/끄기 mutation의
 * `expectedVersion`으로 그대로 되돌려 보내야 한다(CAS 충돌 시 VERSION_CONFLICT).
 */
export type V1SimplifiedOperationFlagGateStatus = {
  enabled: boolean;
  version: number;
  updatedByUserId: string | null;
  updatedAt: string;
};

export type V1SimplifiedOperationFlagTogglePayload = {
  expectedVersion: number;
  value: V1GameOperationFlagValue;
  reason: string;
};

/** 간소 전환 모드 스위치 자체를 켜고 끌 때 보내는 payload — PATCH /simplified-gate. */
export type V1SetSimplifiedOperationFlagGatePayload = {
  expectedVersion: number;
  enabled: boolean;
  reason: string;
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
  /** 인앱 알림을 만든 수신자 수. 웹 푸시 도달과는 별개다. */
  sent: number;
  skipped: number;
  failed: number;
  /**
   * 웹 푸시 결과. 서버 구버전 응답에는 없을 수 있어 optional 로 둔다.
   * subscriptions 가 0이면 푸시로는 아무 데도 가지 않았다는 뜻이다.
   */
  push?: {
    subscriptions: number;
    delivered: number;
    failed: number;
    disabled: boolean;
  };
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
  /**
   * 즉시 공개한 시각. **이 값 단독으로 공개 여부를 판단하지 말 것** — 예약 공개는 조회
   * 시점에 판정하므로 예약 시각이 지나도 여기는 null 로 남는다. 판정은
   * `lib/bracket-visibility.ts`의 `isBracketPublished()` 를 쓴다.
   */
  bracketPublishedAt: string | null;
  /** 공개 예약 시각. 아직 공개 전일 때만 내려오며(공개 후 null), "N에 공개 예정" 안내에 쓴다. */
  bracketPublishScheduledAt: string | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  venue: string | null;
  /** 대회 상세 장소 아래에 노출하는 관리자 입력 주차 안내. null이면 서브 텍스트를 숨긴다. */
  parkingInfo?: string | null;
  /** venue를 카카오 로컬 API로 지오코딩한 좌표. 키 미설정/검색 실패 시 null(지도 임베드는 스킵, 네이버 지도 검색 링크로 폴백). */
  latitude: number | null;
  longitude: number | null;
  coverImageUrl: string | null;
  teamCount: number;
  minPlayers: number;
  maxPlayers: number;
  /**
   * 위 minPlayers/maxPlayers("등록" 로스터 크기, 성별 쿼터가 묶이는 값)와는 완전히 다른
   * 값 — "출전 인원"(경기장에 서는 라인업 상한, GK 포함). `GET /admin/tournaments/:id`
   * 응답에만 채워진다(목록/생성 응답은 null/[]) — 조인이 필요해서 상세 화면에서만 계산한다.
   */
  competitionConfigVersionId: string | null;
  lineupMaxPlayers: number | null;
  lineupMinPlayers: number | null;
  /** 이 대회 종목에서 선택 가능한 출전 인원 후보(오름차순). 카탈로그가 없는 종목이면 []. */
  lineupSizeOptions: number[];
  /**
   * "교체 방식/횟수" — 위 lineupMaxPlayers/lineupMinPlayers와 같은
   * V1CompetitionConfigVersion.lineup에 함께 저장되지만 다른 관심사(경기 중 후보→주전
   * 교체를 몇 번까지 허용할지)다. pin된 값이 없으면(미지원 종목/레거시 대회) 둘 다 null.
   */
  substitutionMode: V1SubstitutionMode | null;
  /** substitutionMode가 'rolling'이면 항상 null(무제한). */
  maxSubstitutions: number | null;
  /** 선택 가능한 교체 방식 — 종목·pin 여부와 무관하게 항상 ['limited','rolling'] 두 값
   *  (TournamentsAdminService#loadLineupInfo). 출전 인원 후보와 달리 빈 배열이 되지 않는다. */
  substitutionModeOptions: V1SubstitutionMode[];
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
  operationCounts?: {
    registrations: number;
    fixtures: number;
    announcements: number;
  };
  createdAt: string;
  updatedAt: string;
};

/**
 * 참가팀 공개 정책 통일(fix/v1-publish) — teamId/teamName/teamLogoUrl은 대회가
 * 모집 중(status==='open')이고 조회자가 운영자·스태프가 아니면 전부 null이다
 * (registrationId는 재식별 경로가 없으므로 항상 남는다 — React key 등에 안전하게
 * 쓸 수 있다). "미배정"과는 다른 상태다: 미배정 슬롯은 이 타입 자체가 아예 없거나
 * (groupTeams는 등록된 팀만 배열에 담김) V1TournamentFixture의 homeTeamName처럼
 * 'TBD' 같은 별도 문자열로 구분된다.
 */
export type V1TournamentGroupTeam = {
  id: string;
  registrationId: string;
  teamId: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
  sortOrder: number;
};

export type V1TournamentStanding = {
  registrationId: string;
  teamId: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
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

/**
 * 참가팀 공개 정책 통일(fix/v1-publish) — homeTeamName/awayTeamName은 세 가지 값을
 * 가진다: 슬롯에 팀이 아직 배정 안 됨('TBD', 기존과 동일), 배정은 됐지만 모집 중이라
 * 가려짐(null — homeRegistrationId는 non-null인데 이름만 없는 상태로 구분), 그 외
 * 실명. `null`과 'TBD'를 반드시 구분해서 표시할 것 — 둘 다 "미정"으로 뭉치면 "이미
 * 배정됐지만 비공개"와 "아직 배정 안 됨"을 사용자가 구분할 수 없다.
 */
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
  homeTeamId: string | null;
  homeTeamName: string | null;
  homeTeamLogoUrl: string | null;
  awayRegistrationId: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  awayTeamLogoUrl: string | null;
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
  /**
   * 관리자가 즉시 공개한 시각. **공개 여부 판정은 이 값 단독으로 하지 말 것** —
   * `bracketPublishScheduledAt` 이 지나도 여기는 null 로 남으므로,
   * `lib/bracket-visibility.ts`의 `isBracketPublished()` 로 판정한다.
   */
  bracketPublishedAt: string | null;
  /** 공개 예약 시각. 이 시각이 지나면 스케줄러 없이 조회 시점 판정으로 공개된다. */
  bracketPublishScheduledAt: string | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  venue: string | null;
  /** 대회 상세 장소 아래에 노출하는 관리자 입력 주차 안내. null이면 서브 텍스트를 숨긴다. */
  parkingInfo?: string | null;
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
  /** 예약만 걸었을 때는 아직 공개 전이므로 null. */
  bracketPublishedAt: string | null;
  /** 예약 공개 시각. 즉시 공개했거나 예약이 없으면 null. */
  bracketPublishScheduledAt: string | null;
  alreadyPublished: boolean;
};

export type V1UnpublishBracketResult = {
  tournamentId: string;
  bracketPublishedAt: null;
  bracketPublishScheduledAt: null;
  /** 이미 비공개였으면 true — 되돌릴 것이 없었다는 뜻. */
  alreadyUnpublished: boolean;
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
  pageInfo: PageInfo;
  summary: AdminListSummary;
};

export type V1AdminContentAsset = {
  assetId: string;
  url: string;
  status: 'temporary' | 'attached';
};

export type V1AdminRegistrationListPage = {
  items: V1AdminTournamentRegistration[];
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
};

// Request payload types

/** GET /admin/competition-configs/lineup-size-options?sportId=... 응답 */
export type V1LineupSizeOptions = {
  sportId: string;
  /** false면 이 종목은 아직 경기 설정 카탈로그가 없다(football/futsal 외) — options/substitutionModes는 항상 []. */
  supported: boolean;
  /** 선택 가능한 출전 인원(GK 포함) 오름차순. */
  options: number[];
  defaultMaxPlayers: number | null;
  /** 선택 가능한 교체 방식 — 항상 두 값 모두(제한/무제한), 종목 무관 공통. */
  substitutionModes: V1SubstitutionMode[];
  defaultSubstitutionMode: V1SubstitutionMode | null;
  /** canonical 기본 교체 횟수 — substitutionMode가 'rolling'이면 항상 null. */
  defaultMaxSubstitutions: number | null;
};

/** "교체 방식" — 후보→주전 교체를 제한할지(limited), 무제한 롤링으로 둘지(rolling). */
export type V1SubstitutionMode = 'limited' | 'rolling';

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
  /** "출전 인원"(라인업 상한, GK 포함) — 위 minPlayers/maxPlayers(등록 로스터 크기)와 다른 값.
   * 생략하면 종목의 canonical 기본값을 쓴다. */
  lineupMaxPlayers?: number;
  /** "교체 방식" — 생략하면 종목의 canonical 기본값을 쓴다. */
  substitutionMode?: V1SubstitutionMode;
  /** "교체 횟수" — substitutionMode가 'limited'일 때만 의미가 있다. 'rolling'과 함께 보내면
   * 400으로 거절된다. */
  maxSubstitutions?: number;
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
  parkingInfo?: string | null;
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
  termsDocumentIds: string[];
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

// ─────────────────────────────────────────────────────────────────────────
// Tournament operations shell/board (Task 19 — 백엔드는 Task 18 `tournament-ops/**`)
// ─────────────────────────────────────────────────────────────────────────

/** V1Game.state — Task 18 board가 읽는 실제 상태 컬럼(V1TournamentFixture.status 아님). */
export type V1GameState = 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED' | 'CANCELLED';

export const V1_GAME_STATES: readonly V1GameState[] = ['SCHEDULED', 'LIVE', 'PAUSED', 'ENDED', 'CANCELLED'];

/** 대회 운영 스태프 역할. `PLATFORM_OPS`는 배정 행이 아니라 어드민 테이블에서 유래한다. */
export type V1TournamentStaffRole = 'PLATFORM_OPS' | 'TOURNAMENT_DIRECTOR' | 'FIELD_OPERATOR' | 'SUPPORT_READONLY';

/**
 * 운영 보드 경고 코드 — 순수 영속 상태 함수(페이지네이션 안정 스냅샷에 포함)와
 * `now` 에도 의존하는 값(별도 `liveWarnings`)이 분리돼 있다. 백엔드 doc:
 * apps/v1_api/src/tournament-operations/board/dto/list-operations-query.dto.ts
 */
export type V1TournamentStableWarningCode = 'NO_FIELD_ASSIGNED' | 'MISSING_SCORER' | 'RESULT_REVIEW_OVERDUE';
export type V1TournamentTimeRelativeWarningCode = 'NO_STAFF_ASSIGNED' | 'LINEUP_NOT_SUBMITTED';
export type V1TournamentOperationsWarningCode = V1TournamentStableWarningCode | V1TournamentTimeRelativeWarningCode;

/** `?warning=` 필터는 안정(시간 무관) 코드만 받는다 — 서버가 시간 의존 코드는 400으로 거부한다. */
export const V1_STABLE_WARNING_CODES: readonly V1TournamentStableWarningCode[] = [
  'NO_FIELD_ASSIGNED',
  'MISSING_SCORER',
  'RESULT_REVIEW_OVERDUE',
];

/** GET /tournament-ops/tournaments/:tournamentId/operations 응답의 items[] 항목. */
export type V1TournamentOperationsBoardItem = {
  fixtureId: string;
  tournamentId: string;
  round: string;
  fixtureNumber: number;
  gameId: string | null;
  gameState: V1GameState | null;
  fieldId: string | null;
  fieldName: string | null;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  scheduledAt: string | null;
  /** 확정(OFFICIAL) 리비전의 점수 스냅샷 — `V1GameResultRevision.score` 그대로다
   *  (`game.currentOfficialRevision?.score ?? null`). 두 형태의 유니온이므로 읽을 때는
   *  반드시 `lib/game-result-score` 의 헬퍼를 쓴다(직접 `.home` 을 읽으면 백필된 경기가
   *  `undefined:undefined` 가 된다). 승부차기는 이 안의 `penalties`/`penalty` 에 있다. */
  currentScore: V1GameResultScore | null;
  warnings: V1TournamentStableWarningCode[];
  version: number | null;
  revisionId: string | null;
  stableRevision: string;
};

/** liveWarnings[] 항목 — 안정 스냅샷 밖, `now` 의존. fixtureId로 items[]와 매칭한다. */
export type V1TournamentOperationsLiveWarning = {
  fixtureId: string;
  warnings: V1TournamentTimeRelativeWarningCode[];
};

/** GET /tournament-ops/tournaments/:tournamentId/operations 응답. */
export type V1TournamentOperationsBoardPage = {
  items: V1TournamentOperationsBoardItem[];
  nextCursor: string | null;
  watermark: string;
  liveWarnings: V1TournamentOperationsLiveWarning[];
};

export type V1TournamentOperationsBoardFilters = {
  cursor?: string;
  status?: V1GameState;
  fieldId?: string;
  warning?: V1TournamentStableWarningCode;
  limit?: number;
};

/** GET /tournament-ops/tournaments/:tournamentId/staff 응답의 items[] 항목. */
export type V1TournamentStaffAssignment = {
  id: string;
  tournamentId: string;
  userId: string;
  role: V1TournamentStaffRole;
  fieldId: string | null;
  fixtureIds: string[];
  version: number;
  expiresAt: string | null;
  revokedAt: string | null;
  grantedByUserId: string | null;
  createdAt: string;
  /** 프로필이 없거나 닉네임 미설정이면 null — 그때는 식별자로 대체하지 않는다. */
  nickname?: string | null;
};

export type V1TournamentStaffListResponse = {
  items: V1TournamentStaffAssignment[];
};

/** GET /me/tournament-staff 응답의 items[].assignments[] 항목 — 담당 대회의 개별 배정. */
export type V1MyTournamentStaffAssignment = {
  id: string;
  role: V1TournamentStaffRole;
  fieldId: string | null;
  fieldName: string | null;
  version: number;
  expiresAt: string | null;
  /**
   * 이 배정이 담당하는 경기들. FIELD_OPERATOR 가 대회 셸을 거치지 않고 자기 경기 콘솔로
   * 직행할 때 진입 판정에 쓴다. 필드 단위로만 배정되면 빈 배열이며, 그때는 fieldId 가 범위다.
   */
  fixtureIds: string[];
};

/** GET /me/tournament-staff 응답의 items[] 항목 — 대회 단위로 묶은 "내 담당 대회". */
export type V1MyTournamentStaffGroup = {
  tournamentId: string;
  tournamentTitle: string;
  tournamentStatus: V1TournamentStatus;
  assignments: V1MyTournamentStaffAssignment[];
};

export type V1MyTournamentStaffResponse = {
  items: V1MyTournamentStaffGroup[];
};

/**
 * GET /tournament-ops/tournaments/:tournamentId/staff/user-search 응답의 items[] 항목.
 * 서버가 신원 확인에 필요한 최소한만 내려준다 — 실명·전화번호·원본 이메일은 오지 않고
 * 이메일은 `ab***@example.com` 형태로 마스킹돼 있다.
 */
export type V1TournamentStaffCandidate = {
  id: string;
  nickname: string | null;
  displayName: string | null;
  maskedEmail: string | null;
};

export type V1TournamentStaffCandidateSearchResponse = {
  items: V1TournamentStaffCandidate[];
};

/** POST /tournament-ops/tournaments/:tournamentId/staff 바디. `PLATFORM_OPS`는 배정 대상이 될 수 없다. */
export type V1GrantTournamentStaffPayload = {
  userId: string;
  role: Exclude<V1TournamentStaffRole, 'PLATFORM_OPS'>;
  fieldId?: string;
  fixtureIds?: string[];
  expiresAt?: string;
};

/** POST /tournament-ops/tournaments/:tournamentId/staff/:assignmentId/revoke 바디. */
export type V1RevokeTournamentStaffPayload = {
  expectedVersion: number;
  reason: string;
};

/** GET /tournament-ops/tournaments/:tournamentId/fields 응답의 items[] 항목. */
export type V1TournamentField = {
  id: string;
  tournamentId: string;
  scopeKey: string;
  name: string;
  sortOrder: number;
  active: boolean;
  version: number;
};

export type V1TournamentFieldListResponse = {
  items: V1TournamentField[];
};

/**
 * PATCH/DELETE /tournament-ops/tournaments/:id/fixtures/:fixtureId/field 응답.
 * 해제(DELETE)면 `fieldId` 가 null 로 돌아온다.
 */
export type V1TournamentFixtureFieldResult = {
  fixtureId: string;
  tournamentId: string;
  fieldId: string | null;
};

/** POST /tournament-ops/tournaments/:tournamentId/fields 바디. scopeKey 는 대회 안에서 유일한 안정 식별자예요. */
export type V1CreateTournamentFieldPayload = {
  scopeKey: string;
  name: string;
  sortOrder?: number;
};

export type V1AdminRosterEligibleMember = {
  userId: string;
  nickname: string | null;
  realName: string | null;
  role: 'owner' | 'manager' | 'member';
  alreadyOnRoster: boolean;
  eligible: boolean;
  /** 못 고르는 이유. 화면에 그대로 보여 준다 — 눌러 보고 400 을 받는 일이 없도록. */
  ineligibleReason: string | null;
};

export type V1AdminRosterEligibleMembersResponse = {
  members: V1AdminRosterEligibleMember[];
};
