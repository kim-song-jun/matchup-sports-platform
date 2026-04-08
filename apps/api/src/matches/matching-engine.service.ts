import { Injectable } from '@nestjs/common';

export interface RecommendationReason {
  type: 'level' | 'distance' | 'popularity' | 'urgency' | 'new';
  label: string;
}

export interface ScoredMatch {
  score: number;
  reasons: RecommendationReason[];
}

interface MatchForScoring {
  id: string;
  levelMin: number;
  levelMax: number;
  currentPlayers: number;
  maxPlayers: number;
  createdAt: Date;
  matchDate: Date;
  startTime: string;
  venue: {
    lat: number;
    lng: number;
    city: string;
    district: string;
  } | null;
}

interface UserForScoring {
  locationLat: number | null;
  locationLng: number | null;
  locationCity: string | null;
  locationDistrict: string | null;
}

interface UserProfileForScoring {
  level: number;
}

/** Weight constants for each dimension (must sum to 100) */
const WEIGHT_SKILL = 30;
const WEIGHT_LOCATION = 30;
const WEIGHT_TIME = 20;
const WEIGHT_POPULARITY = 10;
const WEIGHT_FRESHNESS = 10;

/** Distance threshold in km beyond which location score becomes 0 */
const MAX_DISTANCE_KM = 30;

@Injectable()
export class MatchingEngineService {
  /**
   * Calculates a 0–100 composite recommendation score for a single match.
   */
  calculateMatchScore(
    user: UserForScoring,
    match: MatchForScoring,
    userProfile: UserProfileForScoring | null,
  ): number {
    const skill = this.scoreSkill(userProfile, match);
    const location = this.scoreLocation(user, match);
    const time = this.scoreTime(match);
    const popularity = this.scorePopularity(match);
    const freshness = this.scoreFreshness(match);

    return Math.round(
      (skill * WEIGHT_SKILL) / 100 +
        (location * WEIGHT_LOCATION) / 100 +
        (time * WEIGHT_TIME) / 100 +
        (popularity * WEIGHT_POPULARITY) / 100 +
        (freshness * WEIGHT_FRESHNESS) / 100,
    );
  }

  /**
   * Returns up to 3 human-readable reasons why this match is recommended.
   */
  calculateReasons(
    user: UserForScoring,
    match: MatchForScoring,
    _score: number,
  ): RecommendationReason[] {
    const reasons: RecommendationReason[] = [];

    // Level fit
    const profile: UserProfileForScoring | null = null; // score already computed by caller
    const levelScore = this.scoreSkill(profile, match);
    if (levelScore >= 70) {
      reasons.push({ type: 'level', label: '내 레벨에 맞는 경기' });
    }

    // Distance
    if (user.locationLat !== null && user.locationLng !== null && match.venue) {
      const km = this.haversineDistance(
        user.locationLat,
        user.locationLng,
        match.venue.lat,
        match.venue.lng,
      );
      if (km <= MAX_DISTANCE_KM) {
        const kmLabel = km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
        reasons.push({ type: 'distance', label: `가까운 위치 (${kmLabel})` });
      }
    } else if (
      match.venue &&
      user.locationDistrict &&
      match.venue.district === user.locationDistrict
    ) {
      reasons.push({ type: 'distance', label: `같은 지역 (${user.locationDistrict})` });
    }

    // Urgency — more than 80 % full
    const fillRate = match.maxPlayers > 0 ? match.currentPlayers / match.maxPlayers : 0;
    if (fillRate >= 0.8) {
      reasons.push({ type: 'urgency', label: '마감 임박' });
    }

    // Popularity — between 40 % and 79 % fill rate
    if (fillRate >= 0.4 && fillRate < 0.8) {
      reasons.push({ type: 'popularity', label: '참가자 많음' });
    }

    // New — created within the last 24 hours
    const ageHours = (Date.now() - match.createdAt.getTime()) / 3_600_000;
    if (ageHours <= 24) {
      reasons.push({ type: 'new', label: '새로 등록된 경기' });
    }

    return reasons.slice(0, 3);
  }

  /**
   * Returns a 0–100 skill-level compatibility score.
   * Full score when user level is inside [levelMin, levelMax].
   * Penalised linearly up to 5 levels outside the range.
   */
  scoreSkill(
    userProfile: UserProfileForScoring | null,
    match: Pick<MatchForScoring, 'levelMin' | 'levelMax'>,
  ): number {
    if (!userProfile) return 50; // neutral score when no profile
    const { level } = userProfile;
    if (level >= match.levelMin && level <= match.levelMax) return 100;
    const gap = level < match.levelMin ? match.levelMin - level : level - match.levelMax;
    return Math.max(0, Math.round(100 - gap * 20));
  }

  /**
   * Returns a 0–100 location proximity score.
   * Uses haversine distance when coordinates are available;
   * falls back to city/district text matching.
   */
  scoreLocation(
    user: UserForScoring,
    match: MatchForScoring,
  ): number {
    if (!match.venue) return 0;

    if (user.locationLat !== null && user.locationLng !== null) {
      const km = this.haversineDistance(
        user.locationLat,
        user.locationLng,
        match.venue.lat,
        match.venue.lng,
      );
      if (km >= MAX_DISTANCE_KM) return 0;
      return Math.round(100 * (1 - km / MAX_DISTANCE_KM));
    }

    // Coordinate fallback: text-based city/district matching
    if (user.locationCity && match.venue.city === user.locationCity) {
      if (user.locationDistrict && match.venue.district === user.locationDistrict) {
        return 80;
      }
      return 50;
    }
    return 0;
  }

  /**
   * Returns a 0–100 time-preference score.
   * Favours matches happening in the near future (1–7 days).
   */
  scoreTime(match: Pick<MatchForScoring, 'matchDate'>): number {
    const daysUntil = (match.matchDate.getTime() - Date.now()) / 86_400_000;
    if (daysUntil < 0) return 0;
    if (daysUntil <= 1) return 100;
    if (daysUntil <= 3) return 80;
    if (daysUntil <= 7) return 60;
    if (daysUntil <= 14) return 40;
    return 20;
  }

  /**
   * Returns a 0–100 popularity score based on fill rate.
   * Sweet spot: 40–80 % full.
   */
  scorePopularity(match: Pick<MatchForScoring, 'currentPlayers' | 'maxPlayers'>): number {
    if (match.maxPlayers === 0) return 0;
    const ratio = match.currentPlayers / match.maxPlayers;
    if (ratio >= 0.4 && ratio <= 0.8) return 100;
    if (ratio < 0.4) return Math.round(ratio * 250); // 0 → 0, 0.4 → 100
    // > 0.8 — nearly full, slight penalty
    return Math.round((1 - ratio) * 500); // 0.8 → 100, 1.0 → 0
  }

  /**
   * Returns a 0–100 freshness score based on how recently the match was created.
   * Matches created in the last 3 hours get full score.
   */
  scoreFreshness(match: Pick<MatchForScoring, 'createdAt'>): number {
    const ageHours = (Date.now() - match.createdAt.getTime()) / 3_600_000;
    if (ageHours <= 3) return 100;
    if (ageHours <= 24) return 80;
    if (ageHours <= 72) return 50;
    return 20;
  }

  /**
   * Calculates great-circle distance between two coordinates using the
   * haversine formula. Returns kilometres.
   */
  haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * ELO rating change for a single game outcome.
   */
  calculateEloChange(
    playerElo: number,
    opponentElo: number,
    won: boolean,
    kFactor = 32,
  ): number {
    const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    const actual = won ? 1 : 0;
    return Math.round(kFactor * (actual - expected));
  }
}
