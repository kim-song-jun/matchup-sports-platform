import { http, HttpResponse } from 'msw';
import type { V1ChatRoom } from '@/types/api';
import { api, archived, room } from './use-v1-api.chat-refresh-consumer.fixtures';

export const contact: V1ChatRoom = {
  ...archived, roomId: 'room-contact', title: '진행 중인 컨택', status: 'active',
  teamContact: archived.teamContact ? { ...archived.teamContact, contactId: 'contact-2', status: 'accepted' } : null,
  linkedTarget: { type: 'team_contact', id: 'contact-2', title: '진행 중인 컨택', route: '/chat/room-contact' },
};
// Mutable server state is changed by the real actor PATCH, never by seeding query data.
const patches: boolean[] = [];
export const pinServer = {
  pinned: false,
  archivedPinned: false,
  contactPinned: false,
  hasContact: false,
  failFiltered: false,
  failArchived: false,
  baseReads: 0,
  filteredReads: 0,
  archivedReads: 0,
  contactReads: 0,
  patches,
};

export const pinHandlers = [
  http.get(`${api}/chat/rooms`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const ended = params.get('status') === 'archived';
    const filtered = params.get('roomType') === 'team';
    if (ended) pinServer.archivedReads += 1;
    else if (filtered) pinServer.filteredReads += 1;
    else if (params.get('roomType') === 'team_contact') pinServer.contactReads += 1;
    else if (!params.has('roomType')) pinServer.baseReads += 1;
    if ((ended && pinServer.failArchived) || (filtered && pinServer.failFiltered)) {
      return HttpResponse.json({ status: 'error', statusCode: 503, code: 'SERVICE_UNAVAILABLE',
        message: ended ? '종료된 컨택 정보를 불러오지 못했어요.' : '팀 채팅을 불러오지 못했어요.' }, { status: 503 });
    }
    const items = ended ? [{ ...archived, pinned: pinServer.archivedPinned }]
      : params.get('roomType') === 'team_contact' ? pinServer.hasContact ? [{ ...contact, pinned: pinServer.contactPinned }] : []
      : [{ ...room, pinned: pinServer.pinned }];
    return HttpResponse.json({ status: 'success', data: {
      items, nextCursor: null,
      pageInfo: { hasNext: false, nextCursor: null },
    } });
  }),
  http.patch(`${api}/chat/rooms/:roomId/me`, async ({ request, params }) => {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || !('pinned' in body) || typeof body.pinned !== 'boolean') {
      return new HttpResponse(null, { status: 400 });
    }
    const ended = params.roomId === archived.roomId;
    const activeContact = params.roomId === contact.roomId;
    if (!ended && !activeContact && params.roomId !== room.roomId) return new HttpResponse(null, { status: 404 });
    if (ended) pinServer.archivedPinned = body.pinned;
    else if (activeContact) pinServer.contactPinned = body.pinned;
    else pinServer.pinned = body.pinned;
    pinServer.patches.push(body.pinned);
    return HttpResponse.json({ status: 'success', data: {
      roomId: params.roomId, pinned: body.pinned, mutedUntil: null,
      lastReadMessageId: null, status: 'active',
    } });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
];

export { api, archived, room };
