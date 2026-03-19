import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * AI 매칭 엔진
 *
 * 최종 점수 = (0.30 × Skill) + (0.25 × Location) + (0.20 × Time)
 *           + (0.15 × Manner) + (0.10 × Position)
 */
@Injectable()
export class MatchingEngineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 사용자에게 추천 매치 계산
   * TODO: 실제 구현
   */
  async getRecommendations(userId: string, limit = 10) {
    // 1. 사용자 프로필 조회 (위치, 선호 종목, 레벨)
    // 2. 활성 매치 목록 조회
    // 3. 각 매치에 대해 매칭 점수 계산
    //    - 스킬 호환성 (ELO 차이 기반)
    //    - 거리 (위도/경도 Haversine)
    //    - 시간 선호도
    //    - 매너 점수
    //    - 포지션 니즈
    // 4. 점수 순 정렬 후 반환
    return [];
  }

  /**
   * ELO 레이팅 업데이트
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

  /**
   * 두 지점 간 거리 계산 (km)
   */
  haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
