import { PrismaService } from '../prisma/prisma.service';

export async function assertChatParticipant(
  prisma: PrismaService,
  userId: string,
  roomId: string,
): Promise<boolean> {
  const participant = await prisma.v1ChatRoomParticipant.findFirst({
    where: { chatRoomId: roomId, userId, status: 'active' },
    select: { id: true },
  });
  return participant !== null;
}
