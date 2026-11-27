'use client';
import { FixtureAssignmentWorkspace } from '@/components/admin/bracket-canvas/fixture-assignment-workspace';
import { BracketEmptyState } from '@/components/admin/bracket-canvas/bracket-empty-state';
import { BracketToolsBar } from '@/components/admin/bracket-canvas/bracket-tools-bar';
import { useBracketTools } from '@/components/admin/bracket-canvas/use-bracket-tools';
import { useBracketViewControls } from '@/components/admin/bracket-canvas/use-bracket-view-controls';
import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BracketCanvasMobileScreen } from '@/components/admin/bracket-canvas/bracket-canvas-mobile-screen';
import { BracketCanvasResponsive } from '@/components/admin/bracket-canvas/bracket-canvas-responsive';
import { BracketCanvasWorkspace } from '@/components/admin/bracket-canvas/bracket-canvas-workspace';
import type { RegistrationsLoadState } from '@/components/admin/bracket-canvas/bracket-team-tray';
import { BRACKET_CANVAS_WIDE_MEDIA_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import { useV1AdminTournament, useV1AdminTournamentRegistrations } from '@/hooks/use-v1-api';
import { BracketTab } from '../bracket-tab';
import { tournamentInfoHref } from '../info-sections';
import { useTournamentAdmin } from '../tournament-admin-context';

type BracketView = 'canvas' | 'list';

export default function AdminTournamentBracketPage() {
  return (
    <Suspense fallback={null}>
      <BracketPageBody />
    </Suspense>
  );
}

function BracketPageBody() {
  const { tournamentId, role, canWrite, showToast } = useTournamentAdmin();
  const { data: tournament } = useV1AdminTournament(tournamentId);
  const [stageKey, setStageKey] = useState('');
  const [poolKey, setPoolKey] = useState('');
  const [assignmentMode, setAssignmentMode] = useState<'time' | 'court' | null>(null);
  const controls = useBracketViewControls();
  const stages = tournament?.stagePlan?.stages ?? [];
  const stage = stages.find(item => item.key === stageKey) ?? stages[0];
  const pool = stage?.pools.find(item => item.key === poolKey) ?? stage?.pools[0];
  // 확정 팀 목록은 대진 편성에 필요하다. 셸이 아니라 이 섹션에서만 구독한다.
  const { data: regData, isError: regIsError, error: regError, refetch: refetchRegistrations } = useV1AdminTournamentRegistrations(tournamentId);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wide = useMediaQuery(BRACKET_CANVAS_WIDE_MEDIA_QUERY);
  // 폰은 보기가 하나다 — 주소에 view=list 가 있어도 폰에서는 무시한다.
  const view: BracketView = wide && searchParams.get('view') === 'list' ? 'list' : 'canvas';
  const registrations = regData?.items ?? [];
  // 캐시된 목록은 재조회가 실패해도 쓰되, 실패는 refetchFailed 로 드러낸다.
  const registrationsState: RegistrationsLoadState = {
    status: regData !== undefined ? 'success' : regIsError ? 'error' : 'pending',
    truncated: regData?.truncated ?? false,
    refetchFailed: regIsError && regData !== undefined,
    error: regError,
    onRetry: () => void refetchRegistrations(),
  };
  const tools = useBracketTools({
    tournamentId, tournament, registrations, registrationsState, canWrite, role, showToast, controls, onAssignmentModeChange: setAssignmentMode,
  });

  // 주소가 보기 방식의 정본이다 — 새로고침·뒤로가기에서도 유지되고, 다른 쿼리는 건드리지 않는다.
  const changeView = (next: BracketView) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'list') params.set('view', 'list');
    else params.delete('view');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const body = view === 'canvas' && tools.isEmpty ? (
    <BracketEmptyState
      canWrite={canWrite}
      create={tools.create}
      onCreate={tools.openCreate}
      sixTeamNotice={tournament?.format === 'knockout' && tournament.teamCount === 6 && !tournament.sixTeamMode}
      infoHref={tournamentInfoHref(tournamentId, 'rules')}
      onShowList={wide && tournament?.format !== 'league_knockouts' ? () => changeView('list') : undefined}
    />
  ) : (
    <div className="flex flex-col gap-4">
      {view === 'canvas' && stage && pool && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 tm-text-label">단계
            <select className="tm-input" value={stage.key} onChange={event => { setStageKey(event.target.value); setPoolKey(''); }}>
              {stages.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 tm-text-label">편성
            <select className="tm-input" value={pool.key} onChange={event => setPoolKey(event.target.value)}>
              {stage.pools.map(item => <option key={item.key} value={item.key}>{item.name} · {item.format === 'league' ? '풀리그' : '토너먼트'}</option>)}
            </select>
          </label>
        </div>
      )}
      {view === 'canvas' ? (
        <BracketCanvasResponsive key={pool?.key}
          wide={
            <BracketCanvasWorkspace pool={pool}
              tournamentId={tournamentId}
              format={tournament?.format}
              sixTeamState={tournament?.sixTeamBracket}
              registrations={registrations}
              registrationsState={registrationsState}
              canWrite={canWrite}
              showToast={showToast}
              controls={controls}
            />
          }
          narrow={
            <BracketCanvasMobileScreen pool={pool}
              tournamentId={tournamentId}
              registrations={registrations}
              registrationsState={registrationsState}
              canWrite={canWrite}
              format={tournament?.format}
              sixTeamState={tournament?.sixTeamBracket}
              showToast={showToast}
              controls={controls}
            />
          }
        />
      ) : (
        <BracketTab
          tournamentFormat={tournament?.format}
          tournamentId={tournamentId}
          showToast={showToast}
          registrations={registrations}
          canWrite={canWrite}
          unscheduledOnly={controls.unscheduledOnly}
        />
      )}
    </div>
  );
  const content = (
    <BracketToolsBar tools={tools} tournament={tournament} tournamentId={tournamentId} canWrite={canWrite} view={view} onViewChange={changeView} controls={controls} showToast={showToast}>
      {body}
    </BracketToolsBar>
  );
  return tournament ? <FixtureAssignmentWorkspace tournamentId={tournamentId} canWrite={canWrite}
    canManageFields={role === 'PLATFORM_OPS'} showToast={showToast} mode={assignmentMode} onModeChange={setAssignmentMode}>{content}</FixtureAssignmentWorkspace> : content;
}
