export function chatRoomHref(roomId: string, route?: string | null) {
  if (route?.startsWith('/chat/rooms/')) return route.replace('/chat/rooms/', '/chat/');
  if (route?.startsWith('/chat/')) return route;
  return `/chat/${roomId}`;
}
