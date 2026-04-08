import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UserBlocksService } from './user-blocks.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  userBlock: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('UserBlocksService', () => {
  let service: UserBlocksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserBlocksService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UserBlocksService>(UserBlocksService);
    jest.clearAllMocks();
  });

  describe('block', () => {
    it('throws BadRequestException when blocking self', async () => {
      await expect(service.block('user-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.userBlock.findUnique).not.toHaveBeenCalled();
    });

    it('throws ConflictException when already blocked', async () => {
      mockPrisma.userBlock.findUnique.mockResolvedValue({ id: 'block-1' });

      await expect(service.block('user-1', 'user-2')).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates block and returns selected fields', async () => {
      const created = {
        id: 'block-1',
        blockedId: 'user-2',
        reason: 'spam',
        createdAt: new Date(),
      };
      mockPrisma.userBlock.findUnique.mockResolvedValue(null);
      mockPrisma.userBlock.create.mockResolvedValue(created);

      const result = await service.block('user-1', 'user-2', 'spam');

      expect(mockPrisma.userBlock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { blockerId: 'user-1', blockedId: 'user-2', reason: 'spam' },
        }),
      );
      expect(result).toEqual(created);
    });
  });

  describe('unblock', () => {
    it('throws NotFoundException when block does not exist', async () => {
      mockPrisma.userBlock.findUnique.mockResolvedValue(null);

      await expect(service.unblock('user-1', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes block when it exists', async () => {
      mockPrisma.userBlock.findUnique.mockResolvedValue({ id: 'block-1' });
      mockPrisma.userBlock.delete.mockResolvedValue({ id: 'block-1' });

      await service.unblock('user-1', 'user-2');

      expect(mockPrisma.userBlock.delete).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId: 'user-1', blockedId: 'user-2' } },
      });
    });
  });

  describe('listBlocks', () => {
    it('returns blocks for given userId', async () => {
      const blocks = [
        {
          id: 'block-1',
          blockedId: 'user-2',
          reason: null,
          createdAt: new Date(),
          blocked: { id: 'user-2', nickname: '홍길동', profileImageUrl: null },
        },
      ];
      mockPrisma.userBlock.findMany.mockResolvedValue(blocks);

      const result = await service.listBlocks('user-1');

      expect(mockPrisma.userBlock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { blockerId: 'user-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual(blocks);
    });
  });

  describe('isBlocked', () => {
    it('returns true when block record exists', async () => {
      mockPrisma.userBlock.findUnique.mockResolvedValue({ id: 'block-1' });

      const result = await service.isBlocked('user-1', 'user-2');

      expect(result).toBe(true);
    });

    it('returns false when block record does not exist', async () => {
      mockPrisma.userBlock.findUnique.mockResolvedValue(null);

      const result = await service.isBlocked('user-1', 'user-2');

      expect(result).toBe(false);
    });
  });
});
