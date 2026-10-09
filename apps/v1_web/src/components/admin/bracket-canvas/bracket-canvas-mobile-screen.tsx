'use client';

import { useMemo } from 'react';
import type { AdminToastVariant } from '@/components/admin';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useV1AdminBracket } from '@/hooks/use-v1-api';
import { buildBracketMobileRounds, candidatesFromRegistrations } from '@/lib/bracket-canvas-mobile-model';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { BracketCanvasMobile } from './bracket-canvas-mobile';
import type { RegistrationsLoadState } from './bracket-team-tray';

export interface BracketCanvasMobileScreenProps {
  tournamentId: string;
  registrations: V1AdminTournamentRegistration[];
  registrationsState: RegistrationsLoadState;
  canWrite: boolean;
  showToast: (message: string, variant?: AdminToastVariant) => void;
}

/** 768px 미만의 대진 그림 화면. 구조 편집 도구(툴바·트레이)는 두지 않고 목록과 시트만 보여 준다. */
export function BracketCanvasMobileScreen({ tournamentId, registrations, registrationsState, canWrite, showToast }: BracketCanvasMobileScreenProps) {
  const { data: bracket, isPending, isError, error, refetch } = useV1AdminBracket(tournamentId);
  const rounds = useMemo(
    () => (bracket === undefined ? [] : buildBracketMobileRounds({ groups: bracket.groups, fixtures: bracket.fixtures, slots: bracket.slots })),
    [bracket],
  );
  const candidates = useMemo(() => candidatesFromRegistrations(registrations), [registrations]);

  if (isPending) {
    return (
      <div role="status" aria-busy="true" aria-label="대진을 불러오는 중이에요">
        <AdminListSkeleton rows={4} />
      </div>
    );
  }
  if (isError || bracket === undefined) {
    return (
      <ErrorState
        title="대진을 불러오지 못했어요"
        message={extractErrorMessage(error, '잠시 뒤 다시 시도해 주세요.')}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <BracketCanvasMobile
      competitionId={tournamentId}
      scope="tournament"
      rounds={rounds}
      slots={bracket.slots}
      candidates={candidates}
      canWrite={canWrite}
      registrationsState={registrationsState}
      showToast={showToast}
    />
  );
}
