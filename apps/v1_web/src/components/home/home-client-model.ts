import type {
  V1ChatRoom,
  V1Home,
  V1HomeRecommendation,
  V1HomeShortcut,
  V1Match,
  V1Notice,
  V1Popup,
} from '@/types/api';
import type {
  HomeChatRoom,
  HomeMatchCard,
  HomeNotice,
  HomePopup,
  HomeQuickAction,
  HomeStats,
  HomeViewModel,
} from './home.types';
import { chatRoomTypeLabel } from '@/lib/chat-route';

/** 위치 권한이 없거나 날씨를 아직 못 받았을 때 쓰는 빈 값. 목업 날씨('마포 18도 맑음')를
 *  실제 관측치처럼 보여주지 않는다 — 권한 안내 문구(getWeatherPermissionCopy)가 이유를 말한다. */
export const EMPTY_WEATHER: HomeViewModel['weather'] = { city: '-', temp: '-', cond: '-', wind: '-' };

export function withoutHomeContent(model: HomeViewModel): HomeViewModel {
  return {
    ...model,
    weather: EMPTY_WEATHER,
    viewerName: null,
    signedOut: true,
    hasNewNotification: false,
    chatUnreadCount: 0,
    chatStatus: 'ready',
    chatRooms: [],
    featuredMatch: null,
    recommendedMatches: [],
    popup: null,
    notices: [],
  };
}

export function toHomeModel(
  home: V1Home,
  fallback: HomeViewModel,
  retry: () => void,
  chatUnreadCount: number,
  weather: HomeViewModel['weather'] | null,
): HomeViewModel {
  const recommendedMatches = normalizeMatches(home);
  const unreadCount = home.notifications?.unreadCount ?? 0;
  const viewerName = home.viewer?.authenticated ? home.viewer.displayName : null;

  return {
    ...fallback,
    viewerName,
    signedOut: !home.viewer?.authenticated,
    network: false,
    retry,
    hasNewNotification: unreadCount > 0,
    chatUnreadCount,
    stats: normalizeStats(home),
    featuredMatch: normalizeFeaturedMatch(home, recommendedMatches),
    recommendedMatches,
    quickActions: normalizeShortcuts(home.shortcuts, fallback.quickActions),
    weather: weather ?? EMPTY_WEATHER,
    popup: normalizePopup(home.popup),
    notices: normalizeNotices(home),
  };
}

export function toHomeChatRooms(rooms: V1ChatRoom[]): HomeChatRoom[] {
  return [...rooms]
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return messageTime(b) - messageTime(a);
    })
    .slice(0, 3)
    .map((room) => ({
      id: room.roomId,
      title: room.title,
      typeLabel: chatRoomTypeLabel(room.roomType),
      lastMessage: room.lastMessage?.contentPreview ?? '아직 메시지가 없어요',
      time: formatRelative(room.lastMessage?.sentAt),
      unreadCount: room.unreadCount,
      href: `/chat/${room.roomId}`,
    }));
}

function messageTime(room: V1ChatRoom) {
  const sentAt = room.lastMessage?.sentAt;
  if (!sentAt) return 0;
  const date = new Date(sentAt);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatRelative(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** summary 가 없을 때 쓰는 빈 통계 — 목업 숫자(12경기·+3·8)를 사용자 자기 기록으로 보여주면 안 된다. */
const BLANK_STATS: HomeStats = {
  monthlyActivity: '-',
  monthlyActivitySub: '집계 준비 중',
  mannerScore: '-',
  mannerScoreSub: '-',
  joined: '-',
  trustState: '-',
  pending: '-',
};

function normalizeStats(home: V1Home): HomeStats {
  const summary = home.summary;
  if (!summary) return BLANK_STATS;

  const monthlyMatches = summary.monthlyMatches ?? 0;
  const mannerScore = summary.mannerScore;

  return {
    monthlyActivity: monthlyMatches,
    monthlyActivitySub: summary.pendingLabel ?? '신청·참가 합산',
    mannerScore: mannerScore === null ? '-' : mannerScore.toFixed(1),
    mannerScoreSub: trustStateLabel(summary.trustState),
    joined: monthlyMatches,
    trustState: trustStateLabel(summary.trustState),
    pending: summary.pendingLabel ?? '대기 없음',
  };
}

function normalizeFeaturedMatch(home: V1Home, recommendedMatches: HomeMatchCard[]): HomeMatchCard | null {
  if (!home.featuredMatch) return recommendedMatches[0] ?? null;

  // 목업(home.view-model.ts)의 featuredMatch 를 베이스로 쓰지 않는다 — 추천 목록이 비어 있으면
  // 서버가 고른 실제 매치의 제목 위에 목업의 장소('상암월드컵경기장 보조구장')·종목 아이콘·
  // 인원이 그대로 남았다. featuredMatch 응답 자체에는 장소·날짜·종목이 없으므로, 베이스가 될
  // **실제** 추천 카드가 없으면 히어로를 지어내지 않고 아예 보여주지 않는다.
  const recommended =
    recommendedMatches.find((match) => match.id === home.featuredMatch?.matchId) ?? recommendedMatches[0];

  if (!recommended) return null;

  return {
    ...recommended,
    id: home.featuredMatch.matchId,
    title: home.featuredMatch.title,
    currentParticipants: home.featuredMatch.participantCount,
    maxParticipants: home.featuredMatch.capacity,
    reason: home.featuredMatch.reason,
  };
}

function normalizeMatches(home: V1Home) {
  // 실제 추천 매치를 목업 카드 위에 얹지 않는다. 예전에는 index 로 짝지은 목업이 베이스가 돼
  // API 가 안 준 칸(종목 아이콘, 장소, 참가 인원)에 **다른 매치의 값**이 남았다 —
  // 실제로 홈 카드에 "18/22명" 같은 목업 인원이 그대로 보였다.
  const legacyMatches = Array.isArray(home.recommendedMatches) ? home.recommendedMatches : [];
  if (legacyMatches.length) {
    return legacyMatches.map((match) => toHomeMatch(match));
  }

  const recommendations = Array.isArray(home.recommendations) ? home.recommendations : [];
  return recommendations.length
    ? recommendations.map((match) => toHomeRecommendation(match))
    : [];
}

function normalizePopup(popup: V1Popup | null | undefined): HomePopup | null {
  if (!popup) return null;

  return {
    id: popup.popupId,
    title: popup.title,
    body: popup.body,
    trailing: popup.publishedAt ? formatDate(popup.publishedAt) : '팝업',
    linkUrl: popup.linkUrl,
    linkLabel: popup.linkLabel,
  };
}

function normalizeNotices(home: V1Home) {
  const notices = Array.isArray(home.notices) ? home.notices : [];
  if (notices.length) return notices.map(toHomeNotice);
  return [];
}

function normalizeShortcuts(shortcuts: V1HomeShortcut[] | undefined, fallback: HomeQuickAction[]) {
  if (!shortcuts?.length) return fallback;

  const fallbackKeys: V1HomeShortcut['key'][] = ['matches', 'team_matches', 'teams', 'my_team'];

  return fallback.map((action, index) => {
    const shortcutKey = action.key ?? fallbackKeys[index] ?? shortcutKeyFromLabel(action.label);
    const shortcut = shortcuts.find((item) => item.key === shortcutKey);
    if (!shortcut) return action;

    return {
      ...action,
      href: shortcut.enabled && shortcut.route ? shortcut.route : undefined,
      disabled: !shortcut.enabled || !shortcut.route,
      sub: shortcut.enabled ? action.sub : disabledReasonLabel(shortcut.disabledReason),
    };
  });
}

function toHomeRecommendation(match: V1HomeRecommendation): HomeMatchCard {
  const base = emptyMatchCard();
  return {
    ...base,
    id: match.matchId,
    sportLabel: match.sportName,
    title: match.title,
    venue: match.regionName ?? base.venue,
    date: formatDate(match.startsAt),
    time: formatTime(match.startsAt),
    currentParticipants: match.participantCount ?? base.currentParticipants,
    maxParticipants: match.capacity ?? base.maxParticipants,
    actionLabel: '승인제 신청',
  };
}

function toHomeMatch(match: V1Match): HomeMatchCard {
  const capacity = parseCapacity(match.capacityText);

  return {
    ...emptyMatchCard(),
    id: match.id,
    sportLabel: match.sportName,
    title: match.title,
    venue: match.placeName,
    imageUrl: match.imageUrl ?? null,
    date: formatDate(match.startsAt),
    time: formatTime(match.startsAt),
    currentParticipants: capacity.current,
    maxParticipants: capacity.capacity,
    actionLabel: '승인제 신청',
  };
}

function emptyMatchCard(): HomeMatchCard {
  return {
    id: '',
    sport: 'match',
    sportLabel: '',
    title: '',
    venue: '',
    date: '',
    time: '',
    currentParticipants: 0,
    maxParticipants: 1,
    actionLabel: '',
    imageUrl: null,
  };
}

function toHomeNotice(notice: V1Notice): HomeNotice {
  return {
    id: notice.noticeId ?? notice.id ?? 'notice',
    title: notice.title,
    summary: notice.category ?? notice.audience ?? '공지',
    trailing: formatDate(notice.publishedAt),
    body: notice.body?.trim() || undefined,
  };
}

function parseCapacity(text: string) {
  const [current, capacity] = text.match(/\d+/g)?.map(Number) ?? [];
  return {
    current: current ?? 0,
    capacity: capacity ?? Math.max(current ?? 0, 1),
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function shortcutKeyFromLabel(label: string): V1HomeShortcut['key'] {
  if (label === '팀매치') return 'team_matches';
  if (label === '팀') return 'teams';
  if (label === '나의 팀') return 'my_team';
  return 'matches';
}

function disabledReasonLabel(reason: string | null) {
  if (reason === 'joined_team_required') return '팀에 가입한 뒤 이용할 수 있어요';
  return '현재 이용할 수 없어요';
}

function trustStateLabel(value: string) {
  if (value === 'verified') return '인증 완료';
  if (value === 'estimated') return '누적 중';
  return '-';
}
