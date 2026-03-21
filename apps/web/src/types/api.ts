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
  status: string;
  teamConfig: Record<string, unknown> | null;
  createdAt?: string;
  venue?: { id: string; name: string; city: string; district?: string; address?: string; rating?: number; reviewCount?: number; lat?: number; lng?: number };
  host?: { id: string; nickname: string; profileImageUrl: string | null; mannerScore?: number; totalMatches?: number };
  participants?: MatchParticipant[];
  teams?: Team[];
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
  createdAt?: string;
  host?: { id: string; nickname: string; profileImageUrl: string | null };
  participants?: LessonParticipant[];
}

export interface LessonParticipant {
  id: string;
  userId: string;
  nickname?: string;
  joinedAt?: string;
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
  isRecruiting: boolean;
  contactInfo?: string;
  coverImageUrl?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
  kakaoOpenChat?: string;
  websiteUrl?: string;
  shortsUrl?: string;
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
}

// ── Payment ──
export interface Payment {
  id: string;
  amount: number;
  method: string | null;
  status: string;
  orderId: string;
  paidAt: string | null;
  createdAt: string;
  user?: { id: string; nickname: string; email?: string; profileImageUrl: string | null };
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

// ── Chat ──
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
  sender?: { id: string; nickname: string; profileImageUrl: string | null };
}

// ── Mercenary ──
export interface MercenaryPost {
  id: string;
  teamId: string;
  matchDate: string;
  sportType: string;
  description: string | null;
  status: string;
  team?: SportTeam;
}

// ── Badge ──
export interface Badge {
  id: string;
  type: string;
  name: string;
  description: string;
}

// ── Dispute ──
export interface Dispute {
  id: string;
  reporterId: string;
  targetId: string;
  type: string;
  description: string;
  status: string;
  createdAt: string;
}

// ── Settlement ──
export interface Settlement {
  id: string;
  amount: number;
  status: string;
  processedAt: string | null;
  createdAt: string;
}

export interface SettlementSummary {
  totalAmount: number;
  pendingAmount: number;
  processedAmount: number;
  count: number;
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
  orderId: string;
  amount: number;
  method: string;
  itemName: string;
}

export interface ConfirmPaymentInput {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface RefundPaymentInput {
  reason?: string;
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

export interface CheckoutInput {
  orderId: string;
  amount: number;
  method: string;
  itemName: string;
}

export interface CheckoutResult {
  paymentKey: string;
}
