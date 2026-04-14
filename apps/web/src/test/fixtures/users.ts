import type { UserProfile } from '@/types/api';

export const mockUser: UserProfile = {
  id: 'user-1',
  nickname: '테스트유저',
  email: 'test@example.com',
  profileImageUrl: null,
  gender: null,
  bio: null,
  mannerScore: 4.5,
  totalMatches: 10,
  locationCity: '서울',
  locationDistrict: '송파구',
};

export const mockAdmin: UserProfile = {
  id: 'user-admin',
  nickname: '관리자',
  email: 'admin@example.com',
  profileImageUrl: null,
  gender: null,
  bio: null,
  mannerScore: 5.0,
  totalMatches: 0,
  locationCity: '서울',
  locationDistrict: '강남구',
};

export const mockUserB: UserProfile = {
  id: 'user-2',
  nickname: '상대유저',
  email: 'user2@example.com',
  profileImageUrl: null,
  gender: null,
  bio: null,
  mannerScore: 4.0,
  totalMatches: 5,
  locationCity: '서울',
  locationDistrict: '마포구',
};
