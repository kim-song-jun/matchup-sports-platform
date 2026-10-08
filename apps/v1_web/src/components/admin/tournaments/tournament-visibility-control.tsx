'use client';

import { useV1UpdateTournamentVisibility } from '@/hooks/use-v1-api';
import { CompetitionVisibilityControl } from '@/components/admin/competition-visibility-control';
import type { V1TournamentStatus } from '@/types/api';

/**
 * 공개 조회는 접수 중·마감·진행 중·종료 대회만 연다. 취소된 대회는 공개 설정과 관계없이 일반 화면에
 * 보이지 않고, 준비 중인 대회는 접수를 시작해야 이 설정대로 보인다 — 그 사실을 "현재 상태: 공개"
 * 옆에 그대로 말한다(취소된 대회에 '공개'와 전환 버튼이 남아 관리자가 노출 중인 줄 알았다).
 */
export function TournamentVisibilityControl({
  tournamentId,
  isPublic,
  status,
}: {
  tournamentId: string;
  isPublic: boolean;
  status: V1TournamentStatus;
}) {
  const updateVisibility = useV1UpdateTournamentVisibility(tournamentId);
  return (
    <CompetitionVisibilityControl
      isPublic={isPublic}
      publicDescription="공개 대회 목록과 검색, 홈 화면에 표시돼요."
      privateDescription="일반 사용자에게 숨겨져요. 관리자 운영과 참가·대진 정보는 유지돼요."
      mutation={updateVisibility}
      hiddenReason={status === 'cancelled' ? '취소된 대회는 공개 설정과 관계없이 일반 사용자 화면에 보이지 않아요.' : undefined}
      exposureNote={
        status === 'draft'
          ? isPublic
            ? '준비 중이라 아직 일반 화면에 보이지 않아요. 접수를 시작하면 공개돼요.'
            : '준비 중이라 아직 일반 화면에 보이지 않아요. 접수를 시작해도 비공개로 유지돼요.'
          : undefined
      }
    />
  );
}
