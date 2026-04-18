// ── Enum imports (generated from Prisma schema — single source of truth) ──
export type {
  SportType,
  VenueType,
  MatchStatus,
  ParticipantStatus,
  PaymentStatus,
  PaymentMethod,
  OAuthProvider,
  UserRole,
  AdminUserStatus,
  AdminUserAuditAction,
  Gender,
  NotificationType,
  ChatRoomType,
  ChatMessageType,
  ListingStatus,
  TeamRole,
  TeamMembershipStatus,
  MercenaryPostStatus,
  MercenaryApplicationStatus,
  ListingType,
  ItemCondition,
  OrderStatus,
  TournamentStatus,
  LessonType,
  LessonStatus,
  TicketType,
  TicketStatus,
  AttendanceStatus,
  TeamMatchStatus,
  TeamMatchApplicationStatus,
  MatchStyle,
  ParticipationType,
  InvitationStatus,
  SettlementType,
  SettlementStatus,
  ReportTargetType,
  ReportStatus,
} from './enums.generated';
export { SPORT_TYPES, SPORTTYPE_VALUES } from './enums.generated';

import type {
  SportType,
  MatchStatus,
  PaymentStatus,
  PaymentMethod,
  NotificationType,
  ChatRoomType,
  ListingStatus,
  TeamRole,
  MercenaryPostStatus,
  MercenaryApplicationStatus,
  ListingType,
  ItemCondition,
  TournamentStatus,
  LessonType,
  LessonStatus,
  TicketType,
  TicketStatus,
  AttendanceStatus,
  TeamMatchStatus,
  TeamMatchApplicationStatus,
  MatchStyle,
  InvitationStatus,
  SettlementType,
  SettlementStatus,
} from './enums.generated';

// ── Named interfaces for JSON fields (no more Record<string, unknown>) ──
export interface TeamConfig {
  maxRoster: number;
  positions: string[];
  ruleOverrides?: {
    strictAge?: boolean;
    strictLevel?: boolean;
    positionLocked?: boolean;
  };
}

export interface MatchResult {
  winnerId?: string;
  teamScores: Array<{ teamId: string; score: number }>;
  events: Array<{ minute: number; type: string; playerId?: string }>;
}

export interface VenueCoords {
  lat: number;
  lng: number;
}

export interface VenueInfo {
  indoor?: boolean;
  parking?: boolean;
  shower?: boolean;
  notes?: string;
}

// ── Common API response wrapper ──
export interface ApiResponse<T> {
  status: 'success' | 'error';
  data: T;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── Match types ──

export interface RecommendationReason {
  type: 'level' | 'distance' | 'popularity' | 'urgency' | 'new';
  label: string;
}

export interface Match {
  id: string;
  hostId: string;
  sportType: SportType;
  title: string;
  description: string | null;
  venueId: string;
  matchDate: string;
  startTime: string;
  endTime: string;
  maxPlayers: number;
  currentPlayers: number;
  fee: number;
  levelMin: number;
  levelMax: number;
  gender: string;
  status: MatchStatus;
  imageUrl?: string;
  teamConfig: TeamConfig | null;
  createdAt?: string;
  venue?: { id: string; name: string; city: string; district?: string; address?: string; rating?: number; reviewCount?: number; lat?: number; lng?: number; imageUrls?: string[] };
  host?: { id: string; nickname: string; profileImageUrl: string | null; mannerScore?: number; totalMatches?: number };
  participants?: MatchParticipant[];
  teams?: Team[];
  score?: number;
  reasons?: RecommendationReason[];
}

export interface MatchParticipant {
  id: string;
  matchId: string;
  userId: string;
  teamId: string | null;
  status: 'pending' | 'confirmed' | 'cancelled';
  paymentStatus: PaymentStatus;
  joinedAt?: string;
  nickname?: string;
  arrivedAt?: string | null;
  arrivalPhotoUrl?: string | null;
  user?: { id: string; nickname: string; profileImageUrl: string | null };
}

export interface Team {
  id: string;
  matchId: string;
  name: string;
  color: string;
}

// ── Venue types ──
export interface Venue {
  id: string;
  name: string;
  type: string;
  sportType?: SportType;
  sportTypes: SportType[];
  address: string;
  lat?: number;
  lng?: number;
  city: string;
  district: string;
  phone: string | null;
  description: string | null;
  facilities: string[];
  operatingHours: Record<string, { open: string; close: string; closed?: boolean }>;
  pricePerHour: number | null;
  rating: number;
  reviewCount: number;
  imageUrls: string[];
  ownerId?: string | null;
  owner?: { id: string; nickname?: string; profileImageUrl?: string | null } | null;
  reviews?: Array<{ id: string; rating: number; facilityRating?: number; accessRating?: number; costRating?: number; iceQuality?: number | null; comment: string | null; createdAt: string; user?: { id: string; nickname: string; profileImageUrl: string | null } }>;
  venueReviews?: Array<{ id: string; rating: number; facilityRating?: number; accessRating?: number; costRating?: number; iceQuality?: number | null; comment: string | null; createdAt: string; user?: { id: string; nickname: string; profileImageUrl: string | null } }>;
}

// ── Lesson types ──
export interface Lesson {
  id: string;
  hostId: string;
  teamId?: string | null;
  venueId?: string | null;
  sportType: SportType;
  type: LessonType;
  title: string;
  description: string | null;
  venueName: string | null;
  lessonDate: string;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  currentParticipants: number;
  fee: number;
  levelMin: number;
  levelMax: number;
  status: LessonStatus;
  coachName: string | null;
  coachBio: string | null;
  imageUrl?: string;
  imageUrls?: string[];
  createdAt?: string;
  isRecurring?: boolean;
  recurringDays?: number[];
  team?: { id: string; name: string };
  venue?: { id: string; name: string };
  host?: { id: string; nickname: string; profileImageUrl: string | null; mannerScore?: number };
  participants?: LessonParticipant[];
  ticketPlans?: LessonTicketPlan[];
  upcomingSchedules?: LessonSchedule[];
}

export interface LessonParticipant {
  id: string;
  userId: string;
  nickname?: string;
  joinedAt?: string;
  user?: { id: string; nickname: string; profileImageUrl: string | null };
}

// ── Ticket types ──
// TicketType, TicketStatus, AttendanceStatus re-exported from enums.generated

// Ticket plan — product that coach creates
export interface LessonTicketPlan {
  id: string;
  lessonId: string;
  name: string;
  type: TicketType;
  price: number;
  originalPrice?: number;
  totalSessions?: number; // for multi type
  validDays?: number; // for unlimited type
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

// Purchased ticket instance
export interface LessonTicket {
  id: string;
  planId: string;
  userId: string;
  lessonId: string;
  status: TicketStatus;
  totalSessions?: number;
  usedSessions: number;
  startDate?: string;
  expiresAt?: string;
  paidAmount: number;
  purchasedAt: string;
  plan?: LessonTicketPlan;
  lesson?: Lesson;
  attendances?: LessonAttendance[];
}

export interface LessonTicketPurchaseResponse {
  ticket: LessonTicket;
  payment: {
    orderId: string;
    amount: number;
    ticketId: string;
  };
}

// Individual session in a lesson schedule
export interface LessonSchedule {
  id: string;
  lessonId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  maxParticipants?: number;
  note?: string;
  isCancelled: boolean;
  cancelReason?: string;
  attendeeCount?: number;
}

// Attendance record
export interface LessonAttendance {
  id: string;
  scheduleId: string;
  ticketId: string;
  userId: string;
  status: AttendanceStatus;
  checkedInAt?: string;
  user?: { id: string; nickname: string; profileImageUrl: string | null };
}

// ── Marketplace types ──
export interface MarketplaceListing {
  id: string;
  sellerId: string;
  teamId?: string | null;
  venueId?: string | null;
  title: string;
  description: string;
  sportType: SportType;
  category: string;
  condition: ItemCondition;
  price: number;
  listingType: ListingType;
  status: ListingStatus;
  imageUrls: string[];
  locationCity: string | null;
  locationDistrict: string | null;
  viewCount: number;
  likeCount: number;
  rentalPricePerDay?: number;
  rentalDeposit?: number;
  team?: { id: string; name: string };
  venue?: { id: string; name: string };
  seller?: { id: string; nickname: string; profileImageUrl: string | null; mannerScore: number };
}

export interface Tournament {
  id: string;
  title: string;
  description?: string | null;
  sportType: SportType;
  city?: string | null;
  district?: string | null;
  venueName?: string | null;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  entryFee?: number | null;
  status?: TournamentStatus;
  imageUrl?: string | null;
  teamId?: string | null;
  venueId?: string | null;
  team?: { id: string; name: string } | null;
  venue?: { id: string; name: string } | null;
  organizer?: { id: string; nickname: string; profileImageUrl?: string | null } | null;
  participantCount?: number;
  maxParticipants?: number;
  createdAt?: string;
}

// ── User types ──
export interface UserProfile {
  id: string;
  nickname: string;
  email: string | null;
  profileImageUrl: string | null;
  gender: string | null;
  bio: string | null;
  mannerScore: number;
  totalMatches: number;
  locationCity: string | null;
  locationDistrict: string | null;
  city?: string;
  district?: string;
  teamCount?: number;
  createdAt?: string;
  lastLoginAt?: string;
  provider?: string;
  winCount?: number;
  sportTypes?: SportType[];
  sportProfiles?: SportProfile[];
}

export interface SportProfile {
  id: string;
  sportType: SportType;
  level: number;
  eloRating: number;
  preferredPositions: string[];
  matchCount: number;
  winCount: number;
  mvpCount: number;
  position?: string;
}

// ── MyTeam — flattened shape returned by useMyTeams() ──
// Backend returns TeamMembership & { team: SportTeam }; the hook normalizes to this.
export interface MyTeam {
  id: string;
  name: string;
  sportType: SportType;
  sportTypes: SportType[];
  description: string | null;
  city: string | null;
  district: string | null;
  memberCount: number;
  level: number;
  isRecruiting: boolean;
  logoUrl?: string;
  coverImageUrl?: string | null;
  photos?: string[];
  role: TeamRole;
  joinedAt?: string;
}

// ── SportTeam ──
export interface SportTeam {
  id: string;
  ownerId?: string;
  name: string;
  sportType: SportType;
  sportTypes: SportType[];
  description: string | null;
  city: string | null;
  district: string | null;
  memberCount: number;
  level: number;
  skillGrade?: string;
  proPlayerCount?: number;
  uniformColor?: string;
  isRecruiting: boolean;
  contactInfo?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
  kakaoOpenChat?: string;
  websiteUrl?: string;
  shortsUrl?: string;
  photos?: string[];
  mannerScore?: number;
  matchCount?: number;
  applicationCount?: number;
  owner?: { id: string; nickname: string; mannerScore?: number };
}

export interface TeamHub {
  team: SportTeam;
  sections: {
    goodsCount: number;
    passesCount: number;
    eventsCount: number;
  };
  goods: MarketplaceListing[];
  passes: Lesson[];
  events: Tournament[];
  capabilities?: {
    canEditProfile?: boolean;
    canManageGoods?: boolean;
    canManagePasses?: boolean;
    canManageEvents?: boolean;
  };
}

export interface VenueHub {
  venue: Venue;
  sections: {
    goodsCount: number;
    passesCount: number;
    eventsCount: number;
    scheduleCount?: number;
    reviewCount?: number;
  };
  goods: MarketplaceListing[];
  passes: Lesson[];
  events: Tournament[];
  capabilities?: {
    canEditProfile?: boolean;
    canManageGoods?: boolean;
    canManagePasses?: boolean;
    canManageEvents?: boolean;
  };
}

export type TeamMatchOutcome = 'win' | 'draw' | 'lose';
export type TeamMatchQuarterScoreMap = Record<string, number>;

export interface TeamMatchArrivalCheck {
  id: string;
  teamMatchId: string;
  teamId: string;
  isHome: boolean;
  arrivedAt?: string | null;
  lat?: number | null;
  lng?: number | null;
  photoUrl?: string | null;
  opponentStatus?: string | null;
  opponentNote?: string | null;
  gameCompleted?: boolean | null;
  createdAt?: string;
}

export interface TeamMatchEvaluation {
  id: string;
  teamMatchId: string;
  evaluatorTeamId: string;
  evaluatedTeamId: string;
  levelAccuracy: number;
  infoAccuracy: number;
  mannerRating: number;
  punctuality: number;
  paymentClarity: number;
  cooperation: number;
  comment?: string | null;
  createdAt?: string;
}

// ── TeamMatch ──
export interface TeamMatch {
  id: string;
  hostTeamId: string;
  hostUserId?: string;
  guestTeamId?: string | null;
  sportType: SportType;
  title: string;
  description?: string | null;
  matchDate: string;
  startTime: string;
  endTime: string;
  totalMinutes?: number;
  quarterCount: number;
  venueName: string;
  venueAddress: string;
  venueInfo?: VenueInfo | null;
  totalFee: number;
  opponentFee: number;
  requiredLevel?: number;
  hasProPlayers?: boolean;
  proPlayerCount?: number;
  skillGrade?: string;
  gameFormat?: string;
  matchType?: 'invitation' | 'exchange' | 'away';
  uniformColor?: string;
  isFreeInvitation?: boolean;
  allowMercenary?: boolean;
  matchStyle?: MatchStyle;
  hasReferee?: boolean;
  notes?: string;
  status: TeamMatchStatus;
  refereeSchedule?: Record<string, string> | null;
  scoreHome?: TeamMatchQuarterScoreMap | null;
  scoreAway?: TeamMatchQuarterScoreMap | null;
  resultHome?: TeamMatchOutcome | null;
  resultAway?: TeamMatchOutcome | null;
  hostTeam?: SportTeam;
  guestTeam?: SportTeam | null;
  applicationCount?: number;
  applications?: TeamMatchApplication[];
  arrivalChecks?: TeamMatchArrivalCheck[];
  evaluations?: TeamMatchEvaluation[];
}

export interface TeamMatchApplication {
  id: string;
  teamMatchId: string;
  applicantTeamId: string;
  status: TeamMatchApplicationStatus;
  message: string | null;
  teamName?: string;
  createdAt?: string;
  applicantTeam?: SportTeam;
}

export interface TeamMatchRefereeSchedule {
  hasReferee: boolean;
  quarterCount: number;
  schedule: Record<string, string> | null;
}

// ── Notification ──
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, string | number | boolean | null> | null;
  category?: 'match' | 'team' | 'chat' | 'payment' | 'system';
  link?: string | null;
  ctaLabel?: string | null;
}

export interface NotificationPreference {
  id: string | null;
  matchEnabled: boolean;
  teamEnabled: boolean;
  chatEnabled: boolean;
  paymentEnabled: boolean;
}

// InvitationStatus re-exported from enums.generated

export interface TeamInvitation {
  id: string;
  teamId: string;
  team: { id: string; name: string; logoUrl?: string };
  inviter: { id: string; nickname: string };
  role: TeamRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

// ── Payment ──
export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod | null;
  status: PaymentStatus;
  orderId: string;
  paymentKey?: string | null;
  pgProvider?: string | null;
  paidAt: string | null;
  createdAt: string;
  refundAmount?: number | null;
  refundReason?: string | null;
  refundedAt?: string | null;
  participantId?: string | null;
  sourceType?: 'match' | 'lesson' | 'marketplace' | 'unknown';
  sourceName?: string | null;
  participant?: {
    id: string;
    status: string;
    paymentStatus: string;
    match?: {
      id: string;
      title: string;
      sportType: SportType;
      matchDate: string;
      startTime: string;
      endTime?: string;
      fee?: number;
      venue?: { id: string; name: string; address?: string | null };
      venueName?: string | null;
      venueAddress?: string | null;
    };
  };
  user?: { id: string; nickname: string; email?: string; profileImageUrl: string | null };
}

export interface PreparedPayment {
  paymentId: string;
  orderId: string;
  amount: number;
}

export interface PreparedLessonTicketPurchase {
  ticket: LessonTicket;
  payment: {
    orderId: string;
    amount: number;
    ticketId: string;
  };
}

// ── Admin stats ──
export interface AdminStats {
  totalUsers: number;
  totalMatches: number;
  totalLessons: number;
  totalTeams: number;
  totalVenues: number;
  activeListings: number;
  totalRevenue: number;
  activeTeams: number;
  todayNewUsers?: number;
  todayMatches?: number;
  pendingReports?: number;
  pendingSettlements?: number;
  todayReports?: number;
}

export interface AdminReview {
  id: string;
  matchId?: string;
  matchTitle?: string;
  reviewerId?: string;
  reviewerName?: string;
  targetId?: string;
  targetName?: string;
  mannerRating?: number;
  skillRating?: number;
  comment?: string | null;
  match?: { id: string; title: string };
  author?: { id: string; nickname: string };
  target?: { id: string; nickname: string };
  createdAt: string;
}

export interface AdminStatisticsOverview {
  periodLabel: string;
  matchTrend: Array<{ month: string; count: number }>;
  revenueTrend: Array<{ month: string; revenue: number }>;
  sportDistribution: Array<{ sport: string; count: number }>;
  topVenues: Array<{
    name: string;
    city: string;
    matches: number;
    revenue: number;
    rating: number;
  }>;
  userGrowth: {
    totalUsers: number;
    thisMonth: number;
    lastMonth: number;
    growthRate: number;
    activeUsers: number;
    teamCount: number;
  };
}

// ── Chat (API contract) ──
// ChatRoomType re-exported from enums.generated

export interface ChatRoom {
  id: string;
  name: string;
  type: ChatRoomType;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  createdAt: string;
  imageUrl?: string | null;
  deletedAt?: string | null;
  sender?: { id: string; nickname: string; profileImageUrl: string | null };
}

export interface CreateChatRoomInput {
  type: ChatRoomType;
  teamMatchId?: string;
  participantIds?: string[];
}

// ── Mercenary ──
export interface MercenaryApplication {
  id: string;
  postId: string;
  userId: string;
  message: string | null;
  status: MercenaryApplicationStatus;
  appliedAt: string;
  decidedAt: string | null;
  decidedBy?: string | null;
  user?: { id: string; nickname: string; profileImageUrl: string | null };
}

export interface MercenaryViewerState {
  isAuthenticated: boolean;
  isAuthor: boolean;
  canManage: boolean;
  canApply: boolean;
  applyBlockReason: string | null;
  myApplicationStatus: MercenaryApplicationStatus | null;
  myApplicationId: string | null;
}

export interface MercenaryPost {
  id: string;
  teamId: string;
  authorId?: string;
  sportType: SportType;
  matchDate: string;
  venue?: string;
  position?: string;
  count?: number;
  level?: number;
  fee?: number;
  notes?: string | null;
  /** @deprecated use notes — kept for backward compat with older API responses */
  description?: string | null;
  status: MercenaryPostStatus;
  team?: SportTeam;
  applications?: MercenaryApplication[];
  applicationCount?: number;
  author?: { id: string; nickname: string; profileImageUrl?: string | null };
  viewer?: MercenaryViewerState;
  canManageApplications?: boolean;
  canApply?: boolean;
  applyBlockReason?: string | null;
  viewerApplication?: MercenaryApplication | null;
}

// ── Badge ──
export interface Badge {
  id: string;
  type: string;
  name: string;
  description: string;
  earned?: boolean;
  earnedAt?: string;
}

// ── Dispute ──
export interface AdminActionLog {
  id: string;
  action: string;
  actor: string;
  note?: string | null;
  createdAt: string;
}

export interface Dispute {
  id: string;
  reporterTeamId: string;
  reportedTeamId: string;
  teamMatchId: string;
  type: string;
  description: string;
  status: string;
  resolution?: string | null;
  createdAt: string;
  updatedAt?: string;
  adminNotes?: string;
  reporterTeam?: {
    id: string;
    name: string;
    captain?: string;
    trustScore?: number;
    memberCount?: number;
  };
  reportedTeam?: {
    id: string;
    name: string;
    captain?: string;
    trustScore?: number;
    memberCount?: number;
  };
  match?: {
    id: string;
    date: string;
    startTime?: string;
    endTime?: string;
    venue?: string;
    address?: string;
    sport?: string;
  };
  arrivalCheck?: {
    reporterArrival?: string | null;
    reportedArrival?: string | null;
    reporterCheckedIn?: boolean;
    reportedCheckedIn?: boolean;
  };
  evidence?: Array<{
    id: string;
    type: string;
    description: string;
  }>;
  history?: AdminActionLog[];
}

// ── Settlement ──
export interface Settlement {
  id: string;
  type: SettlementType;
  amount: number;
  commission: number;
  netAmount: number;
  payerName: string;
  recipientName: string;
  relatedId: string;
  description: string;
  status: SettlementStatus;
  processedAt: string | null;
  createdAt: string;
  failureReason?: string | null;
  history?: AdminActionLog[];
}

export interface SettlementSummary {
  total: number;
  commission: number;
  pending: number;
  refunded: number;
  processedCount: number;
  pendingCount: number;
  refundedCount: number;
  failedCount: number;
}

// ── Review ──
export interface PendingReview {
  matchId: string;
  matchTitle: string;
  target: { id: string; nickname: string; profileImageUrl: string | null };
}

// ── Venue Schedule ──
export interface VenueScheduleSlot {
  id: string;
  title: string;
  matchDate: string;
  startTime: string;
  endTime: string;
  sportType: SportType;
  status: MatchStatus;
}

// ── Create input types ──
export interface CreateMatchInput {
  title: string;
  description?: string;
  imageUrl?: string;
  sportType: string; // string kept for form compatibility — Phase 3 will narrow to SportType
  venueId: string;
  matchDate: string;
  startTime: string;
  endTime: string;
  maxPlayers: number;
  fee?: number;
  levelMin?: number;
  levelMax?: number;
  gender?: string;
  teamConfig?: TeamConfig;
}

export interface CreateTeamInput {
  name: string;
  sportTypes: string[];
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  photos?: string[];
  city?: string;
  district?: string;
  level?: number;
  isRecruiting?: boolean;
  contactInfo?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
  shortsUrl?: string;
  kakaoOpenChat?: string;
  websiteUrl?: string;
}

export interface UpdateMatchInput {
  title?: string;
  description?: string;
  imageUrl?: string | null;
  sportType?: string;
  venueId?: string;
  location?: string;
  matchDate?: string;
  startTime?: string;
  endTime?: string;
  maxPlayers?: number;
  fee?: number;
  levelMin?: number;
  levelMax?: number;
  gender?: string;
  teamConfig?: TeamConfig;
  status?: MatchStatus;
}

// Alias kept for backward compat — prefer UpdateMatchInput
export type UpdateMatchPayload = UpdateMatchInput;

export interface CancelMatchPayload {
  reason?: string;
}

export interface Upload {
  id: string;
  userId: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface CreateLessonInput {
  sportType: string; // string kept for form compatibility — Phase 3 will narrow to SportType
  type: string; // string kept for form compatibility — Phase 3 will narrow to LessonType
  title: string;
  description?: string;
  venueId?: string;
  teamId?: string;
  venueName?: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  fee?: number;
  levelMin?: number;
  levelMax?: number;
  coachName?: string;
  coachBio?: string;
  imageUrls?: string[];
  isRecurring?: boolean;
  recurringDays?: number[];
  recurringUntil?: string;
}

export interface CreateListingInput {
  title: string;
  description: string;
  sportType: string; // string kept for form compatibility — Phase 3 will narrow to SportType
  teamId?: string;
  venueId?: string;
  category: string;
  condition: ItemCondition;
  price: number;
  listingType: ListingType;
  imageUrls?: string[];
  locationCity?: string;
  locationDistrict?: string;
  rentalPricePerDay?: number;
  rentalDeposit?: number;
  groupBuyTarget?: number;
  groupBuyDeadline?: string;
}

export type UpdateListingInput = Partial<CreateListingInput> & { status?: ListingStatus };

export interface CreateTournamentInput {
  title: string;
  sportType: string; // string kept for form compatibility — Phase 3 will narrow to SportType
  eventDate: string;
  description?: string;
  entryFee?: number;
  teamId?: string;
  venueId?: string;
}

export interface CreateVenueReviewInput {
  rating: number;
  facilityRating: number;
  accessRating: number;
  costRating: number;
  iceQuality?: number;
  comment?: string;
  imageUrls?: string[];
}

export interface PreparePaymentInput {
  participantId: string;
  amount: number;
  method: string;
  orderId?: string;
}

export interface ConfirmPaymentInput {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface RefundPaymentInput {
  reason?: string;
  note?: string;
}

export interface ConfirmLessonTicketPaymentInput {
  ticketId: string;
  paymentKey?: string;
}

export interface AdminUserDetail extends UserProfile {
  adminStatus?: 'active' | 'suspended';
  warningCount?: number;
  suspensionReason?: string | null;
  adminAuditLog?: AdminActionLog[];
}

export interface AdminTeamMember {
  id: string;
  nickname: string;
  email?: string | null;
  profileImageUrl?: string | null;
  mannerScore?: number;
  role: TeamRole;
  joinedAt: string;
}

export interface AdminTeamDetail extends SportTeam {
  createdAt?: string;
  updatedAt?: string;
  owner?: {
    id: string;
    nickname: string;
    email?: string | null;
    profileImageUrl?: string | null;
    mannerScore?: number;
  };
  members: AdminTeamMember[];
  recentTeamMatches: Array<{
    id: string;
    title: string;
    matchDate: string;
    startTime: string;
    endTime: string;
    venueName: string;
    totalFee: number;
    opponentFee: number;
    status: TeamMatchStatus;
  }>;
}

export interface CreateTeamMatchInput {
  hostTeamId: string;
  sportType: string; // string kept for form compatibility — Phase 3 will narrow to SportType
  title: string;
  matchDate: string;
  startTime: string;
  endTime: string;
  quarterCount: number;
  venueName: string;
  venueAddress: string;
  totalFee: number;
  opponentFee?: number;
  totalMinutes?: number;
  requiredLevel?: number;
  hasProPlayers?: boolean;
  allowMercenary?: boolean;
  matchStyle?: string;
  hasReferee?: boolean;
  notes?: string;
  // task 17: match meta fields
  skillGrade?: string;
  gameFormat?: string;
  matchType?: 'invitation' | 'exchange' | 'away';
  proPlayerCount?: number;
  uniformColor?: string;
  isFreeInvitation?: boolean;
}

export interface ApplyTeamMatchInput {
  applicantTeamId: string;
  message?: string;
  confirmedInfo?: boolean;
  confirmedLevel?: boolean;
}

export interface TeamMatchEvaluationInput {
  evaluatorTeamId: string;
  evaluatedTeamId: string;
  levelAccuracy: number;
  infoAccuracy: number;
  mannerRating: number;
  punctuality: number;
  paymentClarity: number;
  cooperation: number;
  comment?: string;
}

export interface SubmitTeamMatchResultInput {
  scoreHome: TeamMatchQuarterScoreMap;
  scoreAway: TeamMatchQuarterScoreMap;
  resultHome: TeamMatchOutcome;
  resultAway: TeamMatchOutcome;
}

export interface TeamMatchCheckInInput {
  teamId: string;
  lat?: number;
  lng?: number;
  photoUrl?: string;
}

export interface SendMessageInput {
  content: string;
}

export interface CreateMercenaryPostInput {
  teamId: string;
  matchDate: string;
  sportType: string; // string kept for form compatibility — Phase 3 will narrow to SportType
  venue: string;
  position: string;
  count?: number;
  level?: number;
  fee?: number;
  notes?: string;
}

export interface ApplyMercenaryInput {
  message?: string;
}

export interface UpdateMercenaryPostInput {
  matchDate?: string;
  sportType?: string;
  venue?: string;
  position?: string;
  count?: number;
  level?: number;
  fee?: number;
  notes?: string;
}

export interface UpdateStatusInput {
  status: string;
}

export interface CheckoutResult {
  paymentKey: string;
}

export interface ArriveMatchInput {
  lat: number;
  lng: number;
  photoUrl: string;
}

// ── TeamApplication — pending membership application ──
export interface TeamApplication {
  id: string;
  teamId: string;
  userId: string;
  user: {
    id: string;
    nickname: string;
    profileImageUrl: string | null;
    mannerScore: number;
  };
  createdAt: string;
}

// ── UserPublicProfile — PII-stripped public view of a user ──
export interface UserPublicProfile {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
  sportProfiles: SportProfile[];
  mannerScore: number;
  recentMatchCount?: number;
}

// ── MyTeamMatchApplication — applicant-side view of team match applications ──
export interface MyTeamMatchApplication {
  id: string;
  status: TeamMatchApplicationStatus;
  message: string | null;
  createdAt: string;
  teamMatch: {
    id: string;
    title: string;
    matchDate: string;
    startTime: string;
    endTime: string;
    venueName: string;
    hostTeam?: { id: string; name: string };
  };
  applicantTeam?: { id: string; name: string };
}
