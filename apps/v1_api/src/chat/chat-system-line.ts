import type { Prisma, V1ChatSystemEventType } from '@prisma/client';

/** 입장·퇴장 줄의 문장. 팀 채팅 가입·탈퇴·내보내기와 다른 방의 첫 입장이 모두 이 문장을 쓴다. */
export function chatSystemLineBody(displayName: string, event: V1ChatSystemEventType): string {
  return event === 'joined' ? `${displayName}님이 들어왔어요` : `${displayName}님이 나갔어요`;
}

/**
 * 채팅방에 입장·퇴장 시스템 줄을 쓰고 방의 마지막 메시지 시각을 옮긴다 — 시스템 줄을 쓰는 유일한 경로.
 * 내보내기도 '나갔어요'로 쓴다: 채팅은 팀원 모두가 보므로 누가 내보냈는지를 드러내지 않는다(H1-left).
 */
export async function appendChatSystemLine(
  tx: Prisma.TransactionClient,
  input: { chatRoomId: string; userId: string; event: V1ChatSystemEventType; at: Date; displayName?: string },
): Promise<void> {
  const displayName = input.displayName ?? (await lookupDisplayName(tx, input.userId));
  const notice = await tx.v1ChatMessage.create({
    data: {
      chatRoomId: input.chatRoomId,
      senderUserId: input.userId,
      body: chatSystemLineBody(displayName, input.event),
      status: 'sent',
      messageType: 'system',
      systemEventType: input.event,
      sentAt: input.at,
    },
    select: { sentAt: true },
  });
  await tx.v1ChatRoom.update({ where: { id: input.chatRoomId }, data: { lastMessageAt: notice.sentAt } });
}

async function lookupDisplayName(tx: Prisma.TransactionClient, userId: string): Promise<string> {
  const user = await tx.v1User.findUnique({
    where: { id: userId },
    select: { profile: { select: { nickname: true, displayName: true } } },
  });
  return user?.profile?.nickname ?? user?.profile?.displayName ?? '참여자';
}
