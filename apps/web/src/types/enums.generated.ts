// @generated — do not edit. Run pnpm gen:enums to regenerate.
/* eslint-disable */

export type SportType = 'soccer' | 'futsal' | 'basketball' | 'badminton' | 'ice_hockey' | 'figure_skating' | 'short_track' | 'swimming' | 'tennis' | 'baseball' | 'volleyball';
export const SPORTTYPE_VALUES = ['soccer', 'futsal', 'basketball', 'badminton', 'ice_hockey', 'figure_skating', 'short_track', 'swimming', 'tennis', 'baseball', 'volleyball'] as const;

export type VenueType = 'futsal_court' | 'basketball_court' | 'badminton_court' | 'ice_rink' | 'gymnasium' | 'soccer_field' | 'swimming_pool' | 'tennis_court';
export const VENUETYPE_VALUES = ['futsal_court', 'basketball_court', 'badminton_court', 'ice_rink', 'gymnasium', 'soccer_field', 'swimming_pool', 'tennis_court'] as const;

export type MatchStatus = 'recruiting' | 'confirmed' | 'full' | 'in_progress' | 'completed' | 'cancelled';
export const MATCHSTATUS_VALUES = ['recruiting', 'confirmed', 'full', 'in_progress', 'completed', 'cancelled'] as const;

export type ParticipantStatus = 'pending' | 'confirmed' | 'cancelled';
export const PARTICIPANTSTATUS_VALUES = ['pending', 'confirmed', 'cancelled'] as const;

export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'partial_refunded' | 'failed';
export const PAYMENTSTATUS_VALUES = ['pending', 'completed', 'refunded', 'partial_refunded', 'failed'] as const;

export type PaymentMethod = 'card' | 'toss_pay' | 'naver_pay' | 'kakao_pay' | 'transfer';
export const PAYMENTMETHOD_VALUES = ['card', 'toss_pay', 'naver_pay', 'kakao_pay', 'transfer'] as const;

export type OAuthProvider = 'kakao' | 'naver' | 'apple' | 'email';
export const OAUTHPROVIDER_VALUES = ['kakao', 'naver', 'apple', 'email'] as const;

export type UserRole = 'user' | 'admin';
export const USERROLE_VALUES = ['user', 'admin'] as const;

export type AdminUserStatus = 'active' | 'suspended';
export const ADMINUSERSTATUS_VALUES = ['active', 'suspended'] as const;

export type AdminUserAuditAction = 'warn' | 'suspend' | 'reactivate';
export const ADMINUSERAUDITACTION_VALUES = ['warn', 'suspend', 'reactivate'] as const;

export type Gender = 'male' | 'female' | 'other';
export const GENDER_VALUES = ['male', 'female', 'other'] as const;

export type NotificationType = 'match_created' | 'player_joined' | 'player_left' | 'team_announced' | 'match_updated' | 'match_confirmed' | 'match_reminder' | 'match_cancelled' | 'match_completed' | 'review_pending' | 'level_changed' | 'payment_confirmed' | 'payment_refunded' | 'marketplace_order' | 'marketplace_message' | 'team_invitation' | 'elo_changed' | 'badge_earned' | 'no_show_penalty';
export const NOTIFICATIONTYPE_VALUES = ['match_created', 'player_joined', 'player_left', 'team_announced', 'match_updated', 'match_confirmed', 'match_reminder', 'match_cancelled', 'match_completed', 'review_pending', 'level_changed', 'payment_confirmed', 'payment_refunded', 'marketplace_order', 'marketplace_message', 'team_invitation', 'elo_changed', 'badge_earned', 'no_show_penalty'] as const;

export type ChatRoomType = 'team_match' | 'direct' | 'team';
export const CHATROOMTYPE_VALUES = ['team_match', 'direct', 'team'] as const;

export type ChatMessageType = 'text' | 'system';
export const CHATMESSAGETYPE_VALUES = ['text', 'system'] as const;

export type ListingStatus = 'active' | 'sold' | 'reserved' | 'expired' | 'deleted';
export const LISTINGSTATUS_VALUES = ['active', 'sold', 'reserved', 'expired', 'deleted'] as const;

export type TeamRole = 'owner' | 'manager' | 'member';
export const TEAMROLE_VALUES = ['owner', 'manager', 'member'] as const;

export type TeamMembershipStatus = 'active' | 'pending' | 'left' | 'removed';
export const TEAMMEMBERSHIPSTATUS_VALUES = ['active', 'pending', 'left', 'removed'] as const;

export type MercenaryPostStatus = 'open' | 'closed' | 'filled' | 'cancelled';
export const MERCENARYPOSTSTATUS_VALUES = ['open', 'closed', 'filled', 'cancelled'] as const;

export type MercenaryApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export const MERCENARYAPPLICATIONSTATUS_VALUES = ['pending', 'accepted', 'rejected', 'withdrawn'] as const;

export type ListingType = 'sell' | 'rent' | 'group_buy';
export const LISTINGTYPE_VALUES = ['sell', 'rent', 'group_buy'] as const;

export type ItemCondition = 'new' | 'like_new' | 'good' | 'fair' | 'poor';
export const ITEMCONDITION_VALUES = ['new', 'like_new', 'good', 'fair', 'poor'] as const;

export type OrderStatus = 'pending' | 'paid' | 'escrow_held' | 'shipped' | 'delivered' | 'completed' | 'disputed' | 'refunded' | 'cancelled';
export const ORDERSTATUS_VALUES = ['pending', 'paid', 'escrow_held', 'shipped', 'delivered', 'completed', 'disputed', 'refunded', 'cancelled'] as const;

export type TournamentStatus = 'draft' | 'recruiting' | 'full' | 'ongoing' | 'completed' | 'cancelled';
export const TOURNAMENTSTATUS_VALUES = ['draft', 'recruiting', 'full', 'ongoing', 'completed', 'cancelled'] as const;

export type LessonType = 'group_lesson' | 'practice_match' | 'free_practice' | 'clinic';
export const LESSONTYPE_VALUES = ['group_lesson', 'practice_match', 'free_practice', 'clinic'] as const;

export type LessonStatus = 'open' | 'closed' | 'cancelled' | 'completed';
export const LESSONSTATUS_VALUES = ['open', 'closed', 'cancelled', 'completed'] as const;

export type TicketType = 'single' | 'multi' | 'unlimited';
export const TICKETTYPE_VALUES = ['single', 'multi', 'unlimited'] as const;

export type TicketStatus = 'active' | 'expired' | 'exhausted' | 'refunded' | 'cancelled';
export const TICKETSTATUS_VALUES = ['active', 'expired', 'exhausted', 'refunded', 'cancelled'] as const;

export type AttendanceStatus = 'scheduled' | 'attended' | 'absent' | 'late' | 'cancelled';
export const ATTENDANCESTATUS_VALUES = ['scheduled', 'attended', 'absent', 'late', 'cancelled'] as const;

export type TeamMatchStatus = 'recruiting' | 'applied' | 'approved' | 'rejected' | 'scheduled' | 'checking_in' | 'in_progress' | 'completed' | 'cancelled' | 'late' | 'no_show' | 'disputed';
export const TEAMMATCHSTATUS_VALUES = ['recruiting', 'applied', 'approved', 'rejected', 'scheduled', 'checking_in', 'in_progress', 'completed', 'cancelled', 'late', 'no_show', 'disputed'] as const;

export type TeamMatchApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';
export const TEAMMATCHAPPLICATIONSTATUS_VALUES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;

export type MatchStyle = 'friendly' | 'competitive' | 'manner_focused';
export const MATCHSTYLE_VALUES = ['friendly', 'competitive', 'manner_focused'] as const;

export type ParticipationType = 'team' | 'guest' | 'regular' | 'mercenary';
export const PARTICIPATIONTYPE_VALUES = ['team', 'guest', 'regular', 'mercenary'] as const;

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export const INVITATIONSTATUS_VALUES = ['pending', 'accepted', 'declined', 'expired'] as const;

export type SettlementType = 'match' | 'marketplace' | 'lesson';
export const SETTLEMENTTYPE_VALUES = ['match', 'marketplace', 'lesson'] as const;

export type SettlementStatus = 'pending' | 'processing' | 'completed' | 'failed';
export const SETTLEMENTSTATUS_VALUES = ['pending', 'processing', 'completed', 'failed'] as const;

export type ReportTargetType = 'user' | 'message' | 'listing' | 'review';
export const REPORTTARGETTYPE_VALUES = ['user', 'message', 'listing', 'review'] as const;

export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';
export const REPORTSTATUS_VALUES = ['pending', 'reviewed', 'resolved', 'dismissed'] as const;

// Convenience aliases
export const SPORT_TYPES = SPORTTYPE_VALUES;
