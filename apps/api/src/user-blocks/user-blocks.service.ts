import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async block(blockerId: string, blockedId: string, reason?: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('CANNOT_BLOCK_SELF');
    }

    const existing = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    if (existing) {
      throw new ConflictException('ALREADY_BLOCKED');
    }

    return this.prisma.userBlock.create({
      data: { blockerId, blockedId, reason },
      select: {
        id: true,
        blockedId: true,
        reason: true,
        createdAt: true,
      },
    });
  }

  async unblock(blockerId: string, blockedId: string) {
    const existing = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    if (!existing) {
      throw new NotFoundException('BLOCK_NOT_FOUND');
    }

    await this.prisma.userBlock.delete({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
  }

  async listBlocks(userId: string) {
    return this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        blockedId: true,
        reason: true,
        createdAt: true,
        blocked: {
          select: { id: true, nickname: true, profileImageUrl: true },
        },
      },
    });
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const record = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    return record !== null;
  }
}
