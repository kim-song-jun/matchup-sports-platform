'use client';

import { useV1UpdateTournamentVisibility } from '@/hooks/use-v1-api';
import { CompetitionVisibilityControl } from '@/components/admin/competition-visibility-control';

export function TournamentVisibilityControl({ tournamentId, isPublic }: { tournamentId: string; isPublic: boolean }) {
  const updateVisibility = useV1UpdateTournamentVisibility(tournamentId);
  return (
    <CompetitionVisibilityControl
      isPublic={isPublic}
      publicDescription="공개 대회 목록과 검색, 홈 화면에 표시돼요."
      privateDescription="일반 사용자에게 숨겨져요. 관리자 운영과 참가·대진 정보는 유지돼요."
      mutation={updateVisibility}
    />
  );
}
