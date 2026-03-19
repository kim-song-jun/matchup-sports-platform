import type { SportType, MatchStatus } from '../constants/sports';

export interface Match {
  id: string;
  hostId: string;
  sportType: SportType;
  title: string;
  description: string | null;
  venueId: string;
  matchDate: string;
  startTime: string;
  endTime: string;
  maxPlayers: number;
  currentPlayers: number;
  fee: number;
  levelMin: number;
  levelMax: number;
  gender: 'any' | 'male' | 'female';
  status: MatchStatus;
  teamConfig: TeamConfig | null;
  createdAt: string;
}

export interface TeamConfig {
  teamCount: number;
  playersPerTeam: number;
  autoBalance: boolean;
}

export interface MatchParticipant {
  id: string;
  matchId: string;
  userId: string;
  teamId: string | null;
  status: 'confirmed' | 'pending' | 'cancelled';
  paymentStatus: 'pending' | 'completed' | 'refunded';
  joinedAt: string;
}

export interface MatchListItem {
  id: string;
  sportType: SportType;
  title: string;
  matchDate: string;
  startTime: string;
  endTime: string;
  venueName: string;
  venueCity: string;
  maxPlayers: number;
  currentPlayers: number;
  fee: number;
  levelMin: number;
  levelMax: number;
  status: MatchStatus;
  hostNickname: string;
  hostProfileImage: string | null;
}

export interface MatchDetail extends Match {
  venue: {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
  };
  host: {
    id: string;
    nickname: string;
    profileImageUrl: string | null;
    mannerScore: number;
  };
  participants: MatchParticipantInfo[];
  teams: Team[] | null;
}

export interface MatchParticipantInfo {
  userId: string;
  nickname: string;
  profileImageUrl: string | null;
  level: number;
  position: string | null;
  teamId: string | null;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  players: string[];
}
