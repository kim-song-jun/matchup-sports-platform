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
