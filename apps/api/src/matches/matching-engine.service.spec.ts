import { Test, TestingModule } from '@nestjs/testing';
import { MatchingEngineService } from './matching-engine.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MatchingEngineService', () => {
  let service: MatchingEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingEngineService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get<MatchingEngineService>(MatchingEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── haversineDistance ──────────────────────────────────────────────────────

  describe('haversineDistance', () => {
    it('should return 0 for identical coordinates', () => {
      expect(service.haversineDistance(37.5, 127.0, 37.5, 127.0)).toBe(0);
    });

    it('should calculate ~111 km per degree of latitude', () => {
      const km = service.haversineDistance(0, 0, 1, 0);
      expect(km).toBeCloseTo(111.2, 0);
    });

    it('should calculate distance between Seoul and Busan (~325 km)', () => {
      // Seoul: 37.5665, 126.9780 — Busan: 35.1796, 129.0756
      const km = service.haversineDistance(37.5665, 126.978, 35.1796, 129.0756);
      expect(km).toBeGreaterThan(300);
      expect(km).toBeLessThan(350);
    });
  });

  // ─── scoreSkill ─────────────────────────────────────────────────────────────

  describe('scoreSkill', () => {
    it('should return 100 when user level is within match range', () => {
      expect(
        service.scoreSkill({ level: 3 }, { levelMin: 1, levelMax: 5 }),
      ).toBe(100);
    });

    it('should return 100 at exact boundary (levelMin)', () => {
      expect(
        service.scoreSkill({ level: 1 }, { levelMin: 1, levelMax: 5 }),
      ).toBe(100);
    });

    it('should return 100 at exact boundary (levelMax)', () => {
      expect(
        service.scoreSkill({ level: 5 }, { levelMin: 1, levelMax: 5 }),
      ).toBe(100);
    });

    it('should penalise linearly for each level outside range', () => {
      // 1 level below levelMin → 100 - 20 = 80
      expect(
        service.scoreSkill({ level: 0 }, { levelMin: 1, levelMax: 5 }),
      ).toBe(80);
      // 2 levels above levelMax → 100 - 40 = 60
      expect(
        service.scoreSkill({ level: 7 }, { levelMin: 1, levelMax: 5 }),
      ).toBe(60);
    });

    it('should clamp to 0 when gap >= 5', () => {
      expect(
        service.scoreSkill({ level: 10 }, { levelMin: 1, levelMax: 5 }),
      ).toBe(0);
    });

    it('should return 50 (neutral) when userProfile is null', () => {
      expect(
        service.scoreSkill(null, { levelMin: 1, levelMax: 5 }),
      ).toBe(50);
    });
  });

  // ─── scoreLocation ──────────────────────────────────────────────────────────

  describe('scoreLocation', () => {
    const seoulUser = {
      locationLat: 37.5665,
      locationLng: 126.978,
      locationCity: '서울',
      locationDistrict: '중구',
    };

    const seoulVenueNear = {
      id: 'v1',
      name: '서울장',
      city: '서울',
      district: '중구',
      imageUrls: [],
      lat: 37.5665,
      lng: 126.978,
    };

    const busanVenueNear = {
      id: 'v2',
      name: '부산장',
      city: '부산',
      district: '해운대구',
      imageUrls: [],
      lat: 35.1796,
      lng: 129.0756,
    };

    const matchNear = {
      id: 'm1',
      levelMin: 1,
      levelMax: 5,
      currentPlayers: 5,
      maxPlayers: 10,
      createdAt: new Date(),
      matchDate: new Date(Date.now() + 86_400_000),
      startTime: '18:00',
      venue: seoulVenueNear,
    };

    const matchFar = { ...matchNear, id: 'm2', venue: busanVenueNear };
    const matchNoVenue = { ...matchNear, id: 'm3', venue: null };

    it('should return 100 for venue at the exact same coordinates', () => {
      expect(service.scoreLocation(seoulUser, matchNear)).toBe(100);
    });

    it('should return 0 for venue farther than 30 km', () => {
      expect(service.scoreLocation(seoulUser, matchFar)).toBe(0);
    });

    it('should return 0 when venue is null', () => {
      expect(service.scoreLocation(seoulUser, matchNoVenue)).toBe(0);
    });

    it('should fall back to city match when user has no coordinates', () => {
      const noCoordUser = {
        locationLat: null,
        locationLng: null,
        locationCity: '서울',
        locationDistrict: '중구',
      };
      // same city + same district → 80
      expect(service.scoreLocation(noCoordUser, matchNear)).toBe(80);
    });

    it('should return 50 when only city matches (no district match)', () => {
      const noCoordUser = {
        locationLat: null,
        locationLng: null,
        locationCity: '서울',
        locationDistrict: '강남구', // different district
      };
      expect(service.scoreLocation(noCoordUser, matchNear)).toBe(50);
    });

    it('should return 0 when neither coordinates nor city match', () => {
      const noCoordUser = {
        locationLat: null,
        locationLng: null,
        locationCity: '부산',
        locationDistrict: '해운대구',
      };
      // seoulVenueNear.city = '서울' — no match
      expect(service.scoreLocation(noCoordUser, matchNear)).toBe(0);
    });
  });

  // ─── scoreTime ──────────────────────────────────────────────────────────────

  describe('scoreTime', () => {
    const future = (days: number) => new Date(Date.now() + 86_400_000 * days);

    it('should return 100 for match within 1 day', () => {
      expect(service.scoreTime({ matchDate: future(0.5) })).toBe(100);
    });

    it('should return 80 for match within 3 days', () => {
      expect(service.scoreTime({ matchDate: future(2) })).toBe(80);
    });

    it('should return 60 for match within 7 days', () => {
      expect(service.scoreTime({ matchDate: future(5) })).toBe(60);
    });

    it('should return 40 for match within 14 days', () => {
      expect(service.scoreTime({ matchDate: future(10) })).toBe(40);
    });

    it('should return 20 for match more than 14 days away', () => {
      expect(service.scoreTime({ matchDate: future(20) })).toBe(20);
    });

    it('should return 0 for past match', () => {
      expect(service.scoreTime({ matchDate: future(-1) })).toBe(0);
    });
  });

  // ─── scorePopularity ────────────────────────────────────────────────────────

  describe('scorePopularity', () => {
    it('should return 100 for 40–80 % fill rate', () => {
      expect(service.scorePopularity({ currentPlayers: 4, maxPlayers: 10 })).toBe(100);
      expect(service.scorePopularity({ currentPlayers: 8, maxPlayers: 10 })).toBe(100);
    });

    it('should return 0 for empty match', () => {
      expect(service.scorePopularity({ currentPlayers: 0, maxPlayers: 10 })).toBe(0);
    });

    it('should return 0 for full match (100 % fill)', () => {
      expect(service.scorePopularity({ currentPlayers: 10, maxPlayers: 10 })).toBe(0);
    });

    it('should return 0 when maxPlayers is 0 (guard)', () => {
      expect(service.scorePopularity({ currentPlayers: 0, maxPlayers: 0 })).toBe(0);
    });
  });

  // ─── scoreFreshness ─────────────────────────────────────────────────────────

  describe('scoreFreshness', () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

    it('should return 100 for matches created less than 3 hours ago', () => {
      expect(service.scoreFreshness({ createdAt: hoursAgo(1) })).toBe(100);
    });

    it('should return 80 for matches created less than 24 hours ago', () => {
      expect(service.scoreFreshness({ createdAt: hoursAgo(12) })).toBe(80);
    });

    it('should return 50 for matches created less than 72 hours ago', () => {
      expect(service.scoreFreshness({ createdAt: hoursAgo(48) })).toBe(50);
    });

    it('should return 20 for older matches', () => {
      expect(service.scoreFreshness({ createdAt: hoursAgo(200) })).toBe(20);
    });
  });

  // ─── calculateMatchScore ────────────────────────────────────────────────────

  describe('calculateMatchScore', () => {
    const user = {
      locationLat: 37.5665,
      locationLng: 126.978,
      locationCity: '서울',
      locationDistrict: '중구',
    };

    const match = {
      id: 'm1',
      levelMin: 1,
      levelMax: 5,
      currentPlayers: 5,
      maxPlayers: 10,
      createdAt: new Date(Date.now() - 3_600_000), // 1 hour ago
      matchDate: new Date(Date.now() + 86_400_000), // tomorrow
      startTime: '18:00',
      venue: {
        id: 'v1',
        name: '서울장',
        city: '서울',
        district: '중구',
        imageUrls: [],
        lat: 37.5665,
        lng: 126.978,
      },
    };

    it('should return a score between 0 and 100', () => {
      const score = service.calculateMatchScore(user, match, { level: 3 });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return higher score for user within level range vs out of range', () => {
      const inRange = service.calculateMatchScore(user, match, { level: 3 });
      const outOfRange = service.calculateMatchScore(user, match, { level: 10 });
      expect(inRange).toBeGreaterThan(outOfRange);
    });

    it('should return 50-based score when userProfile is null', () => {
      const score = service.calculateMatchScore(user, match, null);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  // ─── calculateReasons ───────────────────────────────────────────────────────

  describe('calculateReasons', () => {
    const baseUser = {
      locationLat: 37.5665,
      locationLng: 126.978,
      locationCity: '서울',
      locationDistrict: '중구',
    };

    const baseMatch = {
      id: 'm1',
      levelMin: 1,
      levelMax: 5,
      currentPlayers: 5,
      maxPlayers: 10,
      createdAt: new Date(Date.now() - 3_600_000),
      matchDate: new Date(Date.now() + 86_400_000),
      startTime: '18:00',
      venue: {
        id: 'v1',
        name: '서울장',
        city: '서울',
        district: '중구',
        imageUrls: [],
        lat: 37.5665,
        lng: 126.978,
      },
    };

    it('should return at most 3 reasons', () => {
      const reasons = service.calculateReasons(baseUser, baseMatch, 80);
      expect(reasons.length).toBeLessThanOrEqual(3);
    });

    it('should include urgency reason for match more than 80 % full', () => {
      const almostFull = { ...baseMatch, currentPlayers: 9, maxPlayers: 10 };
      const reasons = service.calculateReasons(baseUser, almostFull, 80);
      expect(reasons.some((r) => r.type === 'urgency')).toBe(true);
    });

    it('should include distance reason when user has coordinates and venue is near', () => {
      const reasons = service.calculateReasons(baseUser, baseMatch, 80);
      expect(reasons.some((r) => r.type === 'distance')).toBe(true);
    });

    it('should include new reason for match created within 24 hours', () => {
      const freshMatch = { ...baseMatch, createdAt: new Date(Date.now() - 1_800_000) };
      const reasons = service.calculateReasons(baseUser, freshMatch, 80);
      expect(reasons.some((r) => r.type === 'new')).toBe(true);
    });

    it('should include district label when user has no coordinates but same district', () => {
      const noCoordUser = {
        locationLat: null,
        locationLng: null,
        locationCity: '서울',
        locationDistrict: '중구',
      };
      const oldMatch = {
        ...baseMatch,
        createdAt: new Date(Date.now() - 86_400_000 * 5), // 5 days old → no 'new'
        currentPlayers: 1, // low fill → no 'urgency'/'popularity'
      };
      const reasons = service.calculateReasons(noCoordUser, oldMatch, 60);
      expect(reasons.some((r) => r.type === 'distance')).toBe(true);
      const distanceReason = reasons.find((r) => r.type === 'distance')!;
      expect(distanceReason.label).toContain('중구');
    });
  });

  // ─── calculateEloChange ─────────────────────────────────────────────────────

  describe('calculateEloChange', () => {
    it('should return positive change for win against equal opponent', () => {
      expect(service.calculateEloChange(1000, 1000, true)).toBeGreaterThan(0);
    });

    it('should return negative change for loss against equal opponent', () => {
      expect(service.calculateEloChange(1000, 1000, false)).toBeLessThan(0);
    });

    it('should be symmetric: win gain + loss penalty = 0', () => {
      const gain = service.calculateEloChange(1000, 1000, true);
      const penalty = service.calculateEloChange(1000, 1000, false);
      expect(gain + penalty).toBe(0);
    });

    it('should give smaller gain when winning against weaker opponent', () => {
      const gainVsStrong = service.calculateEloChange(1000, 1200, true);
      const gainVsWeak = service.calculateEloChange(1000, 800, true);
      expect(gainVsStrong).toBeGreaterThan(gainVsWeak);
    });
  });
});
