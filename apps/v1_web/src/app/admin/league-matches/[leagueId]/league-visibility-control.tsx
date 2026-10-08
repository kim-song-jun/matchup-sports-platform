'use client';

import { useV1UpdateLeagueVisibility } from '@/hooks/use-v1-api';
import { CompetitionVisibilityControl } from '@/components/admin/competition-visibility-control';

export function LeagueVisibilityControl({ leagueId, isPublic }: { leagueId: string; isPublic: boolean }) {
  const updateVisibility = useV1UpdateLeagueVisibility(leagueId);
  return (
    <CompetitionVisibilityControl
      isPublic={isPublic}
      publicDescription="공개 리그 목록과 검색, 홈 화면에 표시돼요."
      privateDescription="일반 사용자에게 숨겨져요. 관리자 운영과 대진 정보는 유지돼요."
      mutation={updateVisibility}
    />
  );
}
