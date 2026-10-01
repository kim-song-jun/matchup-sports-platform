export function chatRoomHref(roomId: string, route?: string | null) {
  if (route?.startsWith('/chat/rooms/')) return route.replace('/chat/rooms/', '/chat/');
  if (route?.startsWith('/chat/')) return route;
  return `/chat/${roomId}`;
}

/**
 * 채팅방 종류 라벨의 단일 소스.
 *
 * 이 매핑이 세 화면(채팅 목록 · 채팅방 헤더 · 홈 최근 채팅 위젯)에 각각 인라인으로
 * 흩어져 있었고, 실제로 갈렸다 — `team_contact` 분기를 앞의 두 곳에만 추가하는 바람에
 * 홈 위젯에서는 팀컨택 방이 계속 '팀매치'로 잘못 불렸다. 새 roomType 이 생길 때마다
 * 같은 사고가 반복되므로 한 곳에서만 관리한다.
 */
export type ChatRoomTypeLabel = '개인매치' | '팀' | '팀컨택' | '팀매치';

export function chatRoomTypeLabel(
  roomType: 'match' | 'team' | 'team_match' | 'team_contact',
): ChatRoomTypeLabel {
  switch (roomType) {
    case 'match':
      return '개인매치';
    case 'team':
      return '팀';
    case 'team_contact':
      return '팀컨택';
    case 'team_match':
      return '팀매치';
  }
}

const CHAT_CONTEXT_DESTINATION: Record<'match' | 'team' | 'team_match' | 'team_contact', string | null> = {
  match: '매치 상세 보기',
  team: '팀 상세 보기',
  team_match: '경기 상세 보기',
  team_contact: null,
};

/**
 * 채팅방 위 연결 카드의 부제 — 무슨 대화인지와 카드가 어디로 가는지(방 목록 한 줄처럼 읽히지 않게, F62).
 * `team_match` 방은 친선 팀매치와 리그 경기가 함께 쓰는데 서버가 경기 종류를 싣지 않아 "경기"로
 * 부른다(F63). 목록 필터 라벨(`chatRoomTypeLabel`)은 따로 둔다.
 */
export function chatRoomContextSub(roomType: 'match' | 'team' | 'team_match' | 'team_contact'): string {
  const kind = roomType === 'team_match' ? '경기 채팅' : `${chatRoomTypeLabel(roomType)} 채팅`;
  const destination = CHAT_CONTEXT_DESTINATION[roomType];
  return destination === null ? kind : `${kind} · ${destination}`;
}
