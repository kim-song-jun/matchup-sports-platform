import type { Venue, VenueScheduleSlot } from '@/types/api';

export const mockVenue: Venue = {
  id: 'venue-1',
  name: '서울 풋살장',
  type: 'futsal_court',
  sportTypes: ['futsal', 'soccer'],
  address: '서울시 송파구 올림픽로 25',
  city: '서울',
  district: '송파구',
  phone: '02-1234-5678',
  description: '깔끔한 인조잔디 구장',
  facilities: ['주차장', '샤워실'],
  operatingHours: {
    mon: { open: '06:00', close: '23:00' },
    tue: { open: '06:00', close: '23:00' },
    wed: { open: '06:00', close: '23:00' },
    thu: { open: '06:00', close: '23:00' },
    fri: { open: '06:00', close: '23:00' },
    sat: { open: '07:00', close: '22:00' },
    sun: { open: '07:00', close: '22:00' },
  },
  pricePerHour: 50000,
  rating: 4.5,
  reviewCount: 12,
  imageUrls: [],
};

export const mockVenueScheduleSlot: VenueScheduleSlot = {
  id: 'slot-1',
  title: '주말 풋살 경기',
  matchDate: '2026-05-10',
  startTime: '14:00',
  endTime: '16:00',
  sportType: 'soccer',
  status: 'recruiting',
};

export const mockVenueReview = {
  id: 'vr-1',
  venueId: 'venue-1',
  userId: 'user-1',
  rating: 5,
  facilityRating: 5,
  accessRating: 4,
  costRating: 4,
  comment: '시설이 깔끔하고 좋아요',
  createdAt: '2024-01-05T10:00:00.000Z',
  user: { id: 'user-1', nickname: '테스트유저', profileImageUrl: null },
};
