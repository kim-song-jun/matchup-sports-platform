'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { stageBracketView } from '@/lib/stage-bracket-view';
import type { StagePool } from '@/types/stage-plan';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { Button } from '@/components/v1-ui/button';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useV1AdminBracket } from '@/hooks/use-v1-api';
import {
  BRACKET_CANVAS_SIDE_PANEL_MEDIA_QUERY,
  BRACKET_LEAGUE_SIDE_COLUMN_MEDIA_QUERY,
  useMediaQuery,
} from '@/hooks/use-media-query';
import { buildSideLabelContext, directPlacedRegistrationIds, fixtureSideLabel } from '@/lib/bracket-canvas-layout';
import { buildLeagueStandings } from '@/lib/bracket-league-standings-model';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminTournamentRegistration, V1TournamentFormat, V1SixTeamBracket } from '@/types/api';
import { BracketCanvas, fixtureTitle } from './bracket-canvas';
import { BracketLeagueGrid } from './bracket-league-grid';
import { BracketLeagueStandings } from './bracket-league-standings';
import { ByeSlotEditor } from './bye-slot-editor';
import { BracketNodePanel } from './bracket-node-panel';
import { BracketTeamTray, type RegistrationsLoadState } from './bracket-team-tray';
import { focusFixtureOpener } from './fixture-opener-focus';
import { panelDockSide } from './panel-dock-side';
import { unplacedTeamCount } from './unplaced-team-count';
import type { BracketViewControls } from './use-bracket-view-controls';
import { useTeamPlacement } from './use-team-placement';

export type BracketCanvasWorkspaceProps = {
  pool?: StagePool;
  sixTeamState?: V1SixTeamBracket | null;
  tournamentId: string;
  format: V1TournamentFormat | undefined;
  registrations: V1AdminTournamentRegistration[];
  registrationsState: RegistrationsLoadState;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  controls: BracketViewControls;
};

export function BracketCanvasWorkspace({
  pool,
  sixTeamState,
  tournamentId,
  format,
  registrations,
  registrationsState,
  canWrite,
  showToast,
  controls,
}: BracketCanvasWorkspaceProps) {
  const { data: bracket, isPending, isError, error, refetch } = useV1AdminBracket(tournamentId);
  const [selectedByeSlotId, setSelectedByeSlotId] = useState<string | null>(null);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [pendingRegistrationId, setPendingRegistrationId] = useState<string | null>(null);
  const [standingsSheetOpen, setStandingsSheetOpen] = useState(false);
  // 열림 기본값은 참가팀이 처음 불러와졌을 때 한 번만 정한다 — 팀을 다 넣어도 저절로 접히지 않게.
  const [initialTrayOpen, setInitialTrayOpen] = useState<boolean | null>(null);
  const [dock, setDock] = useState<'start' | 'end'>('end');
  const areaRef = useRef<HTMLDivElement>(null);
  const handledFocusNonce = useRef(0);
  // 서버 기본값 true: 하이드레이션 전에는 지금 레이아웃(옆 패널)을 유지하고, 좁은 태블릿만 클라이언트에서 시트로 바뀐다.
  const canvasSidePanel = useMediaQuery(BRACKET_CANVAS_SIDE_PANEL_MEDIA_QUERY, true);
  const leagueSideColumn = useMediaQuery(BRACKET_LEAGUE_SIDE_COLUMN_MEDIA_QUERY, true);
  const visible = useMemo(() => bracket && stageBracketView(bracket, pool), [bracket, pool]);
  const leagueGrid = pool ? pool.format === 'league' : format === 'league';
  const sidePanel = leagueGrid ? leagueSideColumn : canvasSidePanel;
  const placement = useTeamPlacement(tournamentId, bracket ?? { groups: [], fixtures: [], standings: [], slots: [] }, showToast, () => setPendingRegistrationId(null));
  // 넓은 화면에선 순위표가 옆 열에 있으니 열어 둔 시트를 닫아, 다시 좁혀도 저절로 뜨지 않게 한다.
  useEffect(() => {
    if (sidePanel) setStandingsSheetOpen(false);
  }, [sidePanel]);
  const labelContext = useMemo(
    () => (bracket === undefined ? null : buildSideLabelContext(bracket.groups, bracket.fixtures, bracket.slots)),
    [bracket],
  );
  const standingsGroups = useMemo(
    () => (visible === undefined ? [] : buildLeagueStandings({ groups: visible.groups, standings: visible.standings })),
    [visible],
  );
  const filterMatchIds = useMemo(
    () => (controls.unscheduledOnly && visible ? new Set(visible.fixtures.filter((fixture) => fixture.scheduledAt === null).map((fixture) => fixture.id)) : undefined),
    [controls.unscheduledOnly, visible],
  );

  // 도구 메뉴가 요청한 경기를 연다. 아직 대진에 없으면 요청을 남겨 두었다가 불러온 뒤에 연다.
  useEffect(() => {
    const request = controls.focusRequest;
    if (request === null || request.nonce === handledFocusNonce.current) return;
    if (!bracket?.fixtures.some((fixture) => fixture.id === request.fixtureId)) return;
    handledFocusNonce.current = request.nonce;
    setSelectedByeSlotId(null);
    setSelectedFixtureId(request.fixtureId);
    controls.clearFocusRequest();
  }, [controls, bracket]);

  // 패널은 열린 칸의 반대쪽 가장자리에 붙는다 — 칸을 가리지 않게.
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (area === null || selectedFixtureId === null) return;
    const opener = Array.from(area.querySelectorAll<HTMLElement>('[data-fixture-opener]')).find((element) => element.getAttribute('data-fixture-opener') === selectedFixtureId);
    if (opener === undefined) {
      setDock('end');
      return;
    }
    const areaRect = area.getBoundingClientRect();
    const openerRect = opener.getBoundingClientRect();
    setDock(panelDockSide({ nodeCenterX: openerRect.left + openerRect.width / 2 - areaRect.left, containerWidth: areaRect.width }));
  }, [selectedFixtureId, sidePanel]);

  if (isPending) {
    return (
      <div role="status" aria-busy="true" aria-label="대진을 불러오는 중이에요">
        <AdminListSkeleton rows={4} />
      </div>
    );
  }
  if (isError || visible === undefined || bracket === undefined || labelContext === null) {
    return (
      <ErrorState
        title="대진을 불러오지 못했어요"
        message={extractErrorMessage(error, '잠시 뒤 다시 시도해 주세요.')}
        onRetry={() => void refetch()}
      />
    );
  }

  const showStandings = leagueGrid && standingsGroups.length > 0;
  const staged = bracket.groups.some(group => group.bracketTrack?.startsWith('stage:'));
  const confirmedTeams = registrations.filter((registration) => registration.status === 'confirmed');
  if (initialTrayOpen === null && registrationsState.status !== 'pending') {
    setInitialTrayOpen(registrationsState.status === 'error' || unplacedTeamCount(registrations, bracket) > 0);
  }
  // 고른 팀이 다른 경로(무작위 채우기 등)로 자리에 들어갔으면 선택을 푼다.
  const placedIds = new Set(bracket.slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map((slot) => slot.registrationId));
  const activePendingId = pendingRegistrationId !== null && !placedIds.has(pendingRegistrationId) ? pendingRegistrationId : null;
  const trayCollapsible = leagueGrid || !canvasSidePanel;
  const trayColumnOpen = controls.trayOpen ?? initialTrayOpen ?? true;
  const selectedFixture = bracket.fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? null;

  const selectedLabels =
    selectedFixture === null
      ? null
      : {
          HOME: fixtureSideLabel(selectedFixture, 'HOME', labelContext),
          AWAY: fixtureSideLabel(selectedFixture, 'AWAY', labelContext),
        };

  const selectedBye = bracket.slots.find(slot => slot.id === selectedByeSlotId && (slot.kind === 'BYE' || slot.byeSortOrder != null));
  const selectFixture = (id: string) => { setSelectedByeSlotId(null); setSelectedFixtureId(id); };
  const selectBye = (slotId: string) => { const fixture = bracket.fixtures.find(f => f.homeSlotId === slotId || f.awaySlotId === slotId); if (fixture) { setSelectedByeSlotId(slotId); setSelectedFixtureId(fixture.id); } };
  const panel = selectedBye && selectedFixture ? <ByeSlotEditor key={selectedBye.id} tournamentId={tournamentId} slot={selectedBye} fixture={selectedFixture} groups={bracket.groups} slots={bracket.slots} candidates={confirmedTeams.map(r => ({ registrationId: r.id, teamName: r.teamName ?? r.teamId }))} canWrite={canWrite && !staged} registrationsLoaded={registrationsState.status === 'success'} onClose={() => { setSelectedByeSlotId(null); setSelectedFixtureId(null); }} /> :
    selectedFixture !== null && selectedLabels !== null ? (
      <BracketNodePanel
        key={selectedFixture.id}
        tournamentId={tournamentId}
        fixture={selectedFixture}
        groups={bracket.groups}
        fixtures={bracket.fixtures}
        slots={bracket.slots}
        registrations={registrations}
        registrationsLoaded={registrationsState.status === 'success'}
        sideLabels={selectedLabels}
        canWrite={canWrite}
        showToast={showToast}
        autoFocusTitle={sidePanel}
        onClose={() => {
          if (sidePanel) focusFixtureOpener(selectedFixture.id);
          setSelectedFixtureId(null);
        }}
      />
    ) : null;

  const tray = (collapsible: boolean) => (
    <BracketTeamTray
      registrations={registrations}
      registrationsState={registrationsState}
      slots={bracket.slots}
      directPlacedIds={directPlacedRegistrationIds(bracket.fixtures, bracket.slots)}
      pendingRegistrationId={activePendingId}
      canWrite={canWrite && !staged}
      collapsible={collapsible}
      expanded={collapsible ? controls.trayOpen === true : undefined}
      onExpandedChange={collapsible ? controls.setTrayOpen : undefined}
      onClose={collapsible ? undefined : () => controls.setTrayOpen(false)}
      onPick={setPendingRegistrationId}
    />
  );
  const sharedViewProps = {
    selectedFixtureId: selectedFixture?.id ?? null,
    filterMatchIds,
    pendingRegistrationId: canWrite && !staged ? activePendingId : null,
    canWrite: canWrite && !staged,
    onSelectFixture: selectFixture,
    onAssignSlot: placement.placeIntoSlot,
    onAssignDirect: placement.placeDirect,
  };

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-4">
      {trayCollapsible ? tray(true) : null}
      {leagueGrid && showStandings && !sidePanel ? (
        <div className="flex justify-end">
          <Button variant="outline" size="md" onClick={() => setStandingsSheetOpen(true)}>
            순위표
          </Button>
        </div>
      ) : null}
      <div className={leagueGrid ? (showStandings && sidePanel ? 'grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4' : 'grid grid-cols-1 gap-4') : 'flex items-start gap-4'}>
        {!trayCollapsible && trayColumnOpen ? <div className="w-[240px] shrink-0">{tray(false)}</div> : null}
        <div ref={areaRef} data-testid="bracket-canvas-area" className={leagueGrid ? 'relative min-w-0' : 'relative min-w-0 flex-1'}>
          {leagueGrid ? (
            <BracketLeagueGrid groups={visible.groups} fixtures={visible.fixtures} slots={visible.slots} {...sharedViewProps} />
          ) : (
            <BracketCanvas
              scopedPool={Boolean(pool)}
              sixTeamState={sixTeamState}
              registrations={registrations}
              groups={visible.groups}
              fixtures={visible.fixtures}
              slots={visible.slots}
              onSelectBye={selectBye}
              {...sharedViewProps}
            />
          )}
          {panel !== null && sidePanel ? (
            <div data-dock={dock} className={`pointer-events-none absolute inset-y-0 z-10 w-[360px] max-w-full ${dock === 'start' ? 'start-0' : 'end-0'}`}>
              <div className="pointer-events-auto sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">{panel}</div>
            </div>
          ) : null}
        </div>
        {leagueGrid && showStandings && sidePanel ? (
          <aside aria-label="조별 순위" className="sticky top-4 self-start">
            <BracketLeagueStandings groups={standingsGroups} />
          </aside>
        ) : null}
      </div>

      {panel !== null && selectedFixture !== null && !sidePanel ? (
        <BottomSheet open onClose={() => { setSelectedByeSlotId(null); setSelectedFixtureId(null); }} ariaLabel={selectedBye ? "부전승 자리 편집" : fixtureTitle(selectedFixture, bracket.groups)}>
          {panel}
        </BottomSheet>
      ) : null}

      {showStandings && !sidePanel && standingsSheetOpen ? (
        <BottomSheet open onClose={() => setStandingsSheetOpen(false)} title="조별 순위">
          <BracketLeagueStandings groups={standingsGroups} />
        </BottomSheet>
      ) : null}
    </div>
  );
}
