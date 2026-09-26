import { Prisma } from '@prisma/client';

/** 컨택이 끝난(거절·철회·만료) 채팅방을 보관한다. 만료 lazy-flip 뒤에 항상 같이 부른다. */
export const ENDED_CONTACT_STATUSES = ['declined', 'withdrawn', 'expired'] as const;

export async function archiveEndedContactRooms(
  client: Pick<Prisma.TransactionClient, 'v1ChatRoom'>,
  contactWhere: Prisma.V1TeamContactWhereInput,
) {
  return client.v1ChatRoom.updateMany({
    where: {
      status: 'active',
      teamContact: { is: { status: { in: [...ENDED_CONTACT_STATUSES] }, ...contactWhere } },
    },
    data: { status: 'archived' },
  });
}
