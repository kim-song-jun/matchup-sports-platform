'use client';

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BracketCanvasWorkspace } from '@/components/admin/bracket-canvas/bracket-canvas-workspace';
import type { RegistrationsLoadState } from '@/components/admin/bracket-canvas/bracket-team-tray';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { useV1AdminTournament, useV1AdminTournamentRegistrations } from '@/hooks/use-v1-api';
import { BracketTab } from '../bracket-tab';
import { useTournamentAdmin } from '../tournament-admin-context';

type BracketView = 'canvas' | 'list';

const VIEW_ITEMS = [
  { id: 'canvas', label: '그림' },
  { id: 'list', label: '목록' },
];

export default function AdminTournamentBracketPage() {
  return (
    <Suspense fallback={null}>
      <BracketPageBody />
    </Suspense>
  );
}

function BracketPageBody() {
  const { tournamentId, canWrite, showToast } = useTournamentAdmin();
  const { data: tournament } = useV1AdminTournament(tournamentId);
  // 확정 팀 목록은 대진 편성에 필요하다. 셸이 아니라 이 섹션에서만 구독한다.
  const { data: regData, isError: regIsError, error: regError, refetch: refetchRegistrations } = useV1AdminTournamentRegistrations(tournamentId);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view: BracketView = searchParams.get('view') === 'list' ? 'list' : 'canvas';
  const registrations = regData?.items ?? [];
  // 캐시된 목록이 있으면 재조회 실패여도 그 목록을 쓴다.
  const registrationsState: RegistrationsLoadState = {
    status: regData !== undefined ? 'success' : regIsError ? 'error' : 'pending',
    truncated: regData?.truncated ?? false,
    error: regError,
    onRetry: () => void refetchRegistrations(),
  };

  // 주소가 보기 방식의 정본이다 — 새로고침·뒤로가기에서도 유지되고, 다른 쿼리는 건드리지 않는다.
  const changeView = (next: BracketView) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'list') params.set('view', 'list');
    else params.delete('view');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <SegmentedTabs
        ariaLabel="대진 보기 방식"
        role="tablist"
        items={VIEW_ITEMS}
        activeId={view}
        onSelect={(id) => changeView(id === 'list' ? 'list' : 'canvas')}
      />
      {view === 'canvas' ? (
        <BracketCanvasWorkspace
          tournamentId={tournamentId}
          format={tournament?.format}
          registrations={registrations}
          registrationsState={registrationsState}
          bracketPublishedAt={tournament?.bracketPublishedAt}
          bracketPublishScheduledAt={tournament?.bracketPublishScheduledAt}
          canWrite={canWrite}
          showToast={showToast}
          onShowList={() => changeView('list')}
        />
      ) : (
        <BracketTab
          tournamentId={tournamentId}
          showToast={showToast}
          registrations={registrations}
          registrationDeadlineAt={tournament?.registrationDeadlineAt}
          tournamentStatus={tournament?.status}
          bracketPublishedAt={tournament?.bracketPublishedAt}
          bracketPublishScheduledAt={tournament?.bracketPublishScheduledAt}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}
