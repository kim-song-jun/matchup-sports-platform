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

// ── Match types ──
export type MatchStatus = 'recruiting' | 'full' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface RecommendationReason {
  type: 'level' | 'distance' | 'popularity' | 'urgency' | 'new';
  label: string;
}

export interface Match {
  id: string;
  hostId: string;
  sportType: string;
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
  teamConfig: Record<string, unknown> | null;
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
  status: string;
  paymentStatus: string;
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
  sportType?: string;
  sportTypes: string[];
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
  reviews?: Array<{ id: string; rating: number; comment: string | null; createdAt: string; user?: { id: string; nickname: string; profileImageUrl: string | null } }>;
  venueReviews?: Array<{ id: string; rating: number; facilityRating: number; accessRating: number; costRating: number; comment: string | null; createdAt: string; user?: { id: string; nickname: string; profileImageUrl: string | null } }>;
}

// ── Lesson types ──
export interface Lesson {
  id: string;
  hostId: string;
  sportType: string;
  type: string;
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
  status: string;
  coachName: string | null;
  coachBio: string | null;
  imageUrl?: string;
  imageUrls?: string[];
  createdAt?: string;
  isRecurring?: boolean;
  recurringDays?: number[];
  host?: { id: string; nickname: string; profileImageUrl: string | null };
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
export type TicketType = 'single' | 'multi' | 'unlimited';
export type TicketStatus = 'active' | 'expired' | 'exhausted' | 'refunded' | 'cancelled';
export type AttendanceStatus = 'scheduled' | 'attended' | 'absent' | 'late' | 'cancelled';

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
  title: string;
  description: string;
  sportType: string;
  category: string;
  condition: string;
  price: number;
  listingType: string;
  status: string;
  imageUrls: string[];
  locationCity: string | null;
  locationDistrict: string | null;
  viewCount: number;
  likeCount: number;
  rentalPricePerDay?: number;
  rentalDeposit?: number;
  seller?: { id: string; nickname: string; profileImageUrl: string | null; mannerScore: number };
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
  sportTypes?: string[];
  sportProfiles?: SportProfile[];
}

export interface SportProfile {
  id: string;
  sportType: string;
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
  sportType: string;
  description: string | null;
  city: string | null;
  district: string | null;
  memberCount: number;
  level: number;
  isRecruiting: boolean;
  logoUrl?: string;
  coverImageUrl?: string | null;
  photos?: string[];
  role: 'owner' | 'manager' | 'member';
  joinedAt?: string;
}

// ── SportTeam ──
export interface SportTeam {
  id: string;
  name: string;
  sportType: string;
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

// ── TeamMatch ──
export interface TeamMatch {
  id: string;
  hostTeamId: string;
  hostUserId?: string;
  sportType: string;
  title: string;
  description?: string | null;
  matchDate: string;
  startTime: string;
  endTime: string;
  totalMinutes?: number;
  quarterCount: number;
  venueName: string;
  venueAddress: string;
  venueInfo?: Record<string, unknown>;
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
  matchStyle?: string;
  hasReferee?: boolean;
  notes?: string;
  status: string;
  refereeSchedule?: Record<string, unknown>;
  scoreHome?: Record<string, unknown>;
  scoreAway?: Record<string, unknown>;
  hostTeam?: SportTeam;
  applicationCount?: number;
  applications?: TeamMatchApplication[];
}

export interface TeamMatchApplication {
  id: string;
  teamMatchId: string;
  applicantTeamId: string;
  status: string;
  message: string | null;
  teamName?: string;
  createdAt?: string;
  applicantTeam?: SportTeam;
}

// ── Notification ──
export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown> | null;
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

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface TeamInvitation {
  id: string;
  teamId: string;
  team: { id: string; name: string; logoUrl?: string };
  inviter: { id: string; nickname: string };
  role: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

// ── Payment ──
export interface Payment {
  id: string;
  amount: number;
  method: string | null;
  status: string;
  orderId: string;
  paymentKey?: string | null;
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
      sportType: string;
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
}

// ── Chat (API contract) ──
export interface ChatRoom {
  id: string;
  name: string;
  type: string;
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

// ── Mercenary ──
export interface MercenaryApplication {
  id: string;
  postId: string;
  userId: string;
  message: string | null;
  status: string;
  appliedAt: string;
  decidedAt: string | null;
  user?: { id: string; nickname: string; profileImageUrl: string | null };
}

export interface MercenaryPost {
  id: string;
  teamId: string;
  authorId?: string;
  sportType: string;
  matchDate: string;
  venue?: string;
  position?: string;
  count?: number;
  level?: number;
  fee?: number;
  notes?: string | null;
  /** @deprecated use notes — kept for backward compat with older API responses */
  description?: string | null;
  status: string;
  team?: SportTeam;
  applications?: MercenaryApplication[];
  author?: { id: string; nickname: string; profileImageUrl?: string | null };
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
  type: string;
  amount: number;
  commission: number;
  netAmount: number;
  payerName: string;
  recipientName: string;
  relatedId: string;
  description: string;
  status: string;
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
  time: string;
  available: boolean;
  matchId?: string;
}

// ── Create input types ──
export interface CreateTeamInput {
  name: string;
  sportType: string;
  description?: string;
  city?: string;
  district?: string;
}

export interface UpdateMatchInput {
  title?: string;
  description?: string;
  imageUrl?: string;
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
  teamConfig?: Record<string, unknown>;
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
  sportType: string;
  type: string;
  title: string;
  description?: string;
  venueName?: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  fee: number;
  levelMin: number;
  levelMax: number;
  coachName?: string;
  coachBio?: string;
}

export interface CreateListingInput {
  title: string;
  description: string;
  sportType: string;
  category: string;
  condition: string;
  price: number;
  listingType: string;
  imageUrls?: string[];
  locationCity?: string;
  locationDistrict?: string;
}

export interface CreateVenueReviewInput {
  rating: number;
  comment?: string;
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

export interface AdminUserDetail extends UserProfile {
  adminStatus?: 'active' | 'suspended';
  warningCount?: number;
  suspensionReason?: string | null;
  adminAuditLog?: AdminActionLog[];
}

export interface CreateTeamMatchInput {
  sportType: string;
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
  teamId?: string;
  message?: string;
  confirmedInfo?: boolean;
  confirmedLevel?: boolean;
}

export interface TeamMatchEvaluationInput {
  opponentTeamId?: string;
  levelAccuracy?: number;
  infoAccuracy?: number;
  mannerRating?: number;
  punctuality?: number;
  paymentClarity?: number;
  cooperation?: number;
  skillRating?: number;
  comment?: string;
}

export interface SendMessageInput {
  content: string;
}

export interface CreateMercenaryPostInput {
  teamId: string;
  matchDate: string;
  sportType: string;
  description?: string;
}

export interface ApplyMercenaryInput {
  message?: string;
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

// ── MyTeamMatchApplication — applicant-side view of team match applications ──
export interface MyTeamMatchApplication {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
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
