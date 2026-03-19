import type { SportType } from '../constants/sports';

export interface User {
  id: string;
  email: string | null;
  nickname: string;
  profileImageUrl: string | null;
  phone: string | null;
  gender: 'male' | 'female' | 'other' | null;
  birthYear: number | null;
  bio: string | null;
  sportTypes: SportType[];
  locationLat: number | null;
  locationLng: number | null;
  locationCity: string | null;
  locationDistrict: string | null;
  mannerScore: number;
  totalMatches: number;
  oauthProvider: 'kakao' | 'naver' | 'apple';
  createdAt: string;
}

export interface UserSportProfile {
  id: string;
  userId: string;
  sportType: SportType;
  level: number;
  eloRating: number;
  preferredPositions: string[];
  matchCount: number;
  winCount: number;
  mvpCount: number;
}

export interface UserPublicProfile {
  id: string;
  nickname: string;
  profileImageUrl: string | null;
  gender: 'male' | 'female' | 'other' | null;
  mannerScore: number;
  totalMatches: number;
  sportProfiles: UserSportProfile[];
}
