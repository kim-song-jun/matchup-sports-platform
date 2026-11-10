'use client';

import { useQuery } from '@tanstack/react-query';
import { useV1DataSource } from '@/components/providers/v1-data-source';
import { v1Keys } from '@/lib/query-keys';

/** 서버 계약: `apps/v1_api/src/tournaments/discipline/admin-discipline.service.ts`. 날짜는 JSON 이라 ISO 문자열이다. */

export type V1AdminDisciplineStatus = 'SUSPENDED' | 'IMMINENT' | 'CARDS';

export type V1AdminDisciplinePlayer = {
  userId: string;
  displayName: string;
  /** 계정 실명 — 프로필에 있을 때만 온다. */
  realName?: string;
  teamId: string;
  teamName: string;
  status: V1AdminDisciplineStatus;
  yellowTotal: number;
  redTotal: number;
  /** 정지 중일 때 다음 경기를 포함한 남은 정지 경기 수. 그 밖에는 0. */
  remainingMatches: number;
  reason: string | null;
  /** 그 팀이 아직 시작하지 않은 가장 이른 경기. 남은 경기가 없으면 null. */
  nextGame: { teamMatchId: string; gameId: string | null; startAt: string | null; opponentName: string | null } | null;
};

export type V1AdminDisciplineOverview = {
  competitionId: string;
  title: string;
  kind: 'TOURNAMENT' | 'LEAGUE';
  /** 정지 규정이 둘 다 꺼진 대회·리그는 null. */
  rules: { yellowAccumulationLimit: number | null; redCardSuspensionMatches: number | null } | null;
  summary: { suspended: number; imminent: number; withCards: number };
  players: V1AdminDisciplinePlayer[];
};

/** 플랫폼 어드민 전용 징계 현황 — 대회·리그 id 가 같은 경로를 쓴다. */
export function useV1AdminDiscipline(competitionId: string) {
  const { v1Get } = useV1DataSource();
  return useQuery({
    queryKey: v1Keys.adminDiscipline(competitionId),
    queryFn: () => v1Get<V1AdminDisciplineOverview>(`/admin/tournaments/${encodeURIComponent(competitionId)}/discipline`),
    enabled: competitionId !== '',
  });
}
