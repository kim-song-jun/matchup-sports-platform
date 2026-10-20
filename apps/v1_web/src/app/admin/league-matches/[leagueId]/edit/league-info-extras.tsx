'use client';

import { useV1AdminLeagueMatch } from '@/hooks/use-v1-api';
import { LeagueCoverImageControl } from '../league-cover-image-control';
import { LeagueVenueControl } from '../league-venue-control';

/** 리그 정보 섹션의 폼 아래 — 대표 이미지와 기본 장소. 폼과 같은 폭·같은 왼쪽 선에 맞춘다. */
export function LeagueInfoExtras({ leagueId }: { leagueId: string }) {
  const { data: series } = useV1AdminLeagueMatch(leagueId);
  // 로딩·오류는 셸이 이미 처리한다 — 여기서는 데이터가 올 때까지 비워 둔다.
  if (!series) return null;

  return (
    <div className="mt-6 max-w-2xl">
      <LeagueCoverImageControl leagueId={leagueId} sportCode={series.sportCode} coverImageUrl={series.coverImageUrl} listImageUrl={series.listImageUrl} />
      <LeagueVenueControl leagueId={leagueId} defaultPlace={series.defaultPlace ?? null} recentVenues={series.recentVenues} />
    </div>
  );
}
