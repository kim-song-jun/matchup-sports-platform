import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MercenaryService } from './mercenary.service';

describe('MercenaryService', () => {
  let service: MercenaryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MercenaryService],
    }).compile();

    service = module.get<MercenaryService>(MercenaryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all posts when no filter is applied', () => {
      const result = service.findAll({});

      expect(result.items).toBeDefined();
      expect(result.items.length).toBe(5);
    });

    it('should filter by sportType', () => {
      const result = service.findAll({ sportType: 'FUTSAL' });

      expect(result.items.length).toBe(2);
      result.items.forEach((post) => {
        expect(post.sportType).toBe('FUTSAL');
      });
    });

    it('should filter by status', () => {
      const result = service.findAll({ status: 'open' });

      expect(result.items.length).toBe(4);
      result.items.forEach((post) => {
        expect(post.status).toBe('open');
      });
    });

    it('should filter by both sportType and status', () => {
      const result = service.findAll({ sportType: 'FUTSAL', status: 'closed' });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('merc-005');
      expect(result.items[0].sportType).toBe('FUTSAL');
      expect(result.items[0].status).toBe('closed');
    });

    it('should return empty items when no posts match filter', () => {
      const result = service.findAll({ sportType: 'TENNIS' });

      expect(result.items).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return a post by id', () => {
      const result = service.findById('merc-001');

      expect(result).toBeDefined();
      expect(result.id).toBe('merc-001');
      expect(result.teamName).toBe('FC 서울 유나이티드');
      expect(result.sportType).toBe('FUTSAL');
    });

    it('should throw NotFoundException when post does not exist', () => {
      expect(() => service.findById('non-existent')).toThrow(
        NotFoundException,
      );
      expect(() => service.findById('non-existent')).toThrow(
        '용병 모집글을 찾을 수 없습니다.',
      );
    });
  });

  describe('create', () => {
    const createData = {
      teamId: 'team-010',
      matchDate: '2026-04-10T14:00:00Z',
      venue: '잠실 운동장',
      position: '미드필더',
      count: 2,
      level: 3,
      fee: 20000,
      notes: '즐겁게 합시다',
    };

    it('should create a new mercenary post', () => {
      const result = service.create('user-100', createData);

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^merc-\d{3}$/);
      expect(result.teamId).toBe('team-010');
      expect(result.venue).toBe('잠실 운동장');
      expect(result.position).toBe('미드필더');
      expect(result.count).toBe(2);
      expect(result.level).toBe(3);
      expect(result.fee).toBe(20000);
      expect(result.notes).toBe('즐겁게 합시다');
      expect(result.status).toBe('open');
      expect(result.applicants).toEqual([]);
      expect(result.createdBy).toBe('user-100');
    });

    it('should set notes to null when not provided', () => {
      const dataWithoutNotes = {
        teamId: 'team-011',
        matchDate: '2026-04-11T10:00:00Z',
        venue: '마포 체육관',
        position: '가드',
        count: 1,
        level: 2,
        fee: 10000,
      };

      const result = service.create('user-101', dataWithoutNotes);

      expect(result.notes).toBeNull();
    });

    it('should increment id for each new post', () => {
      const first = service.create('user-100', createData);
      const second = service.create('user-100', createData);

      expect(first.id).not.toBe(second.id);
    });

    it('should add the new post to findAll results', () => {
      const beforeCount = service.findAll({}).items.length;

      service.create('user-100', createData);

      const afterCount = service.findAll({}).items.length;
      expect(afterCount).toBe(beforeCount + 1);
    });
  });

  describe('apply', () => {
    it('should create a new application', () => {
      const result = service.apply('merc-002', 'user-200');

      expect(result).toEqual({ message: '용병 지원이 완료되었습니다.' });

      const post = service.findById('merc-002');
      expect(post.applicants).toHaveLength(1);
      expect(post.applicants[0].userId).toBe('user-200');
      expect(post.applicants[0].status).toBe('pending');
    });

    it('should return already-applied message when user applies again', () => {
      // merc-001 already has user-010 as applicant
      const result = service.apply('merc-001', 'user-010');

      expect(result).toEqual({ message: '이미 지원한 모집글입니다.' });
    });

    it('should throw NotFoundException when post does not exist', () => {
      expect(() => service.apply('non-existent', 'user-200')).toThrow(
        NotFoundException,
      );
      expect(() => service.apply('non-existent', 'user-200')).toThrow(
        '용병 모집글을 찾을 수 없습니다.',
      );
    });

    it('should allow multiple different users to apply', () => {
      service.apply('merc-004', 'user-300');
      service.apply('merc-004', 'user-301');

      const post = service.findById('merc-004');
      expect(post.applicants).toHaveLength(2);
      expect(post.applicants[0].userId).toBe('user-300');
      expect(post.applicants[1].userId).toBe('user-301');
    });
  });
});
