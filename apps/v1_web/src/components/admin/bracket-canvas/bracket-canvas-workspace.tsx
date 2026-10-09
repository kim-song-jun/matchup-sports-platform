'use client';

import { Globe, LayoutTemplate, Link2, Plus, Shuffle } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { AlertBanner, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import {
  useV1AdminBracket,
  useV1UpdateFixture,
  useV1PublishTournamentBracket,
  useV1UnpublishTournamentBracket,
} from '@/hooks/use-v1-api';
import { useV1AssignTournamentSlot, useV1RandomFillSlots } from '@/hooks/use-v1-bracket-canvas';
import {
  BRACKET_CANVAS_SIDE_PANEL_MEDIA_QUERY,
  BRACKET_LEAGUE_SIDE_COLUMN_MEDIA_QUERY,
  useMediaQuery,
} from '@/hooks/use-media-query';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { buildSideLabelContext, directPlacedRegistrationIds, fixtureSideLabel, type SideKey } from '@/lib/bracket-canvas-layout';
import { buildLeagueStandings } from '@/lib/bracket-league-standings-model';
import { describeStandingsFill } from '@/lib/bracket-standings-fill-message';
import { isBracketPublished } from '@/lib/bracket-visibility';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminTournamentRegistration, V1TournamentFormat } from '@/types/api';
import { BracketCanvas, fixtureTitle } from './bracket-canvas';
import { BracketLeagueGrid } from './bracket-league-grid';
import { BracketLeagueStandings } from './bracket-league-standings';
import { BracketNodePanel } from './bracket-node-panel';
import { BracketStandingsFillButton } from './bracket-standings-fill-button';
import { BracketTeamTray, type RegistrationsLoadState } from './bracket-team-tray';
import { BracketFixtureToolsDialog } from './bracket-fixture-tools-dialog';
import { BracketTemplateDialog } from './bracket-template-dialog';
import { focusFixtureOpener } from './fixture-opener-focus';

export type BracketCanvasWorkspaceProps = {
  tournamentId: string;
  format: V1TournamentFormat | undefined;
  registrations: V1AdminTournamentRegistration[];
  registrationsState: RegistrationsLoadState;
  bracketPublishedAt: string | null | undefined;
  bracketPublishScheduledAt: string | null | undefined;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onShowList: () => void;
};

export function BracketCanvasWorkspace({
  tournamentId,
  format,
  registrations,
  registrationsState,
  bracketPublishedAt,
  bracketPublishScheduledAt,
  canWrite,
  showToast,
  onShowList,
}: BracketCanvasWorkspaceProps) {
  const { data: bracket, isPending, isError, error, refetch } = useV1AdminBracket(tournamentId);
  const assignSlot = useV1AssignTournamentSlot(tournamentId, 'tournament');
  const updateFixture = useV1UpdateFixture(tournamentId);
  const randomFill = useV1RandomFillSlots(tournamentId, 'tournament');
  const publishBracket = useV1PublishTournamentBracket(tournamentId);
  const unpublishBracket = useV1UnpublishTournamentBracket(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [pendingRegistrationId, setPendingRegistrationId] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [toolsMode, setToolsMode] = useState<'add' | 'link' | null>(null);
  const [standingsSheetOpen, setStandingsSheetOpen] = useState(false);
  const toolbarHintId = useId();
  // 서버 기본값 true: 하이드레이션 전에는 지금 레이아웃(옆 패널)을 유지하고, 좁은 태블릿만 클라이언트에서 시트로 바뀐다.
  const canvasSidePanel = useMediaQuery(BRACKET_CANVAS_SIDE_PANEL_MEDIA_QUERY, true);
  const leagueSideColumn = useMediaQuery(BRACKET_LEAGUE_SIDE_COLUMN_MEDIA_QUERY, true);
  const leagueGrid = format === 'league';
  const sidePanel = leagueGrid ? leagueSideColumn : canvasSidePanel;
  // 넓은 화면에선 순위표가 옆 열에 있으니 열어 둔 시트를 닫아, 다시 좁혀도 저절로 뜨지 않게 한다.
  useEffect(() => {
    if (sidePanel) setStandingsSheetOpen(false);
  }, [sidePanel]);
  const labelContext = useMemo(
    () => (bracket === undefined ? null : buildSideLabelContext(bracket.groups, bracket.fixtures, bracket.slots)),
    [bracket],
  );
  // 순위 채우기 창이 동률 후보 이름을 그리는 데 쓴다 — 동률 팀은 모두 그 조의 조 편성에 들어 있다.
  const teamNames = useMemo(
    () =>
      new Map(
        (bracket?.groups ?? []).flatMap((group) =>
          group.groupTeams.flatMap((team) => (team.registrationId && team.teamName ? [[team.registrationId, team.teamName] as const] : [])),
        ),
      ),
    [bracket],
  );
  const standingsGroups = useMemo(
    () => (bracket === undefined ? [] : buildLeagueStandings({ groups: bracket.groups, standings: bracket.standings })),
    [bracket],
  );

  if (isPending) {
    return (
      <div role="status" aria-busy="true" aria-label="대진을 불러오는 중이에요">
        <AdminListSkeleton rows={4} />
      </div>
    );
  }
  if (isError || bracket === undefined || labelContext === null) {
    return (
      <ErrorState
        title="대진을 불러오지 못했어요"
        message={extractErrorMessage(error, '잠시 뒤 다시 시도해 주세요.')}
        onRetry={() => void refetch()}
      />
    );
  }

  const showStandings = leagueGrid && standingsGroups.length > 0;
  const isEmpty = bracket.groups.length === 0 && bracket.fixtures.length === 0;
  const templateFormat = format === 'knockout' || format === 'league' || format === 'group_knockout' ? format : null;
  const confirmedTeams = registrations.filter((registration) => registration.status === 'confirmed');
  const placedIds = new Set(bracket.slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map((slot) => slot.registrationId));
  const emptySlotCount = bracket.slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId === null).length;
  const unplacedTeamCount = confirmedTeams.filter((registration) => !placedIds.has(registration.id)).length;
  const randomFillBlockedReason =
    registrationsState.status === 'pending'
      ? '참가팀을 불러오는 중이에요.'
      : registrationsState.status === 'error'
        ? '참가팀을 불러오지 못했어요.'
        : emptySlotCount === 0
          ? '비어 있는 자리가 없어요.'
          : unplacedTeamCount === 0
            ? '배정할 수 있는 팀이 없어요.'
            : null;
  const published = isBracketPublished(bracketPublishedAt, bracketPublishScheduledAt);
  const hasPendingSchedule = !!bracketPublishScheduledAt && !published;
  // 비활성 이유는 title 대신 화면에 보이게 둔다 — title 은 터치·키보드에서 보이지 않는다.
  const publishBlockedReason = isEmpty && !published ? '대진을 먼저 만들어야 공개할 수 있어요.' : null;
  const toolbarHint = !isEmpty ? randomFillBlockedReason : publishBlockedReason;
  const selectedFixture = bracket.fixtures.find((fixture) => fixture.id === selectedFixtureId) ?? null;
  const rightColumn = sidePanel && (selectedFixture !== null || showStandings);

  const handleAssign = (slotId: string, registrationId: string) => {
    assignSlot.mutate(
      { slotId, registrationId },
      {
        onSuccess: () => {
          setPendingRegistrationId(null);
          showToast('팀을 넣었어요.', 'success');
        },
        onError: (err) => showToast(describeBracketCanvasError(err, '팀을 넣지 못했어요.'), 'error'),
      },
    );
  };

  const handleAssignDirect = (fixtureId: string, side: SideKey, registrationId: string) => {
    updateFixture.mutate(
      { fixtureId, ...(side === 'HOME' ? { homeRegistrationId: registrationId } : { awayRegistrationId: registrationId }) },
      {
        onSuccess: () => {
          setPendingRegistrationId(null);
          showToast('팀을 넣었어요.', 'success');
        },
        onError: (err) => showToast(describeBracketCanvasError(err, '팀을 넣지 못했어요.'), 'error'),
      },
    );
  };

  const handleRandomFill = () => {
    randomFill.mutate(undefined, {
      onSuccess: (result) => {
        setPendingRegistrationId(null);
        showToast(result.assignments.length === 0 ? '채울 수 있는 자리가 없어요.' : `${result.assignments.length}개 자리를 채웠어요.`, 'success');
      },
      onError: (err) => showToast(describeBracketCanvasError(err, '자리를 채우지 못했어요.'), 'error'),
    });
  };

  const handlePublish = async () => {
    const ok = await confirm({
      title: '대진표 전체 공개',
      message: '공개하면 참가팀과 방문자가 조, 일정, 대진표를 볼 수 있어요. 공개한 뒤에 대진을 바꾸면 바로 보여요.',
      confirmLabel: '전체 공개',
    });
    if (!ok) return;
    publishBracket.mutate(undefined, {
      onSuccess: (result) => showToast(result.alreadyPublished ? '이미 공개된 대진표예요.' : '대진표를 공개했어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '대진표 공개에 실패했어요.'), 'error'),
    });
  };

  const handleUnpublish = async () => {
    const ok = await confirm({
      title: published ? '대진표 공개 취소' : '공개 예약 취소',
      message: published
        ? '대진표를 다시 비공개로 되돌려요. 이미 대진표를 본 참가자의 기억까지 되돌릴 수는 없어요.'
        : '예약된 공개를 취소해요. 대진표는 계속 비공개로 남아요.',
      confirmLabel: published ? '비공개로 되돌리기' : '예약 취소',
      tone: 'danger',
    });
    if (!ok) return;
    unpublishBracket.mutate(undefined, {
      onSuccess: (result) => showToast(result.alreadyUnpublished ? '이미 비공개 상태예요.' : '대진표를 비공개로 되돌렸어요.', 'success'),
      onError: (err) => showToast(extractErrorMessage(err, '공개 취소에 실패했어요.'), 'error'),
    });
  };

  const selectedLabels =
    selectedFixture === null
      ? null
      : {
          HOME: fixtureSideLabel(selectedFixture, 'HOME', labelContext),
          AWAY: fixtureSideLabel(selectedFixture, 'AWAY', labelContext),
        };

  const panel =
    selectedFixture !== null && selectedLabels !== null ? (
      <BracketNodePanel
        key={selectedFixture.id}
        tournamentId={tournamentId}
        fixture={selectedFixture}
        groups={bracket.groups}
        slots={bracket.slots}
        registrations={registrations}
        registrationsLoaded={registrationsState.status === 'success'}
        sideLabels={selectedLabels}
        canWrite={canWrite}
        showToast={showToast}
        onClose={() => {
          if (sidePanel) focusFixtureOpener(selectedFixture.id);
          setSelectedFixtureId(null);
        }}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-4">
      {ConfirmModal}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`tm-badge tm-badge-sm ${published ? 'tm-badge-green' : 'tm-badge-grey'}`} style={{ gap: 4 }}>
          <Globe size={12} strokeWidth={2.2} aria-hidden="true" />
          {published ? '공개 중' : hasPendingSchedule ? '공개 예약됨' : '비공개'}
        </span>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            {!isEmpty && templateFormat !== null ? (
              <Button variant="outline" size="md" onClick={() => setTemplateOpen(true)}>
                <LayoutTemplate size={16} aria-hidden="true" />
                템플릿으로 다시 만들기
              </Button>
            ) : null}
            {!isEmpty ? (
              <Button
                variant="outline"
                size="md"
                disabled={randomFillBlockedReason !== null}
                aria-describedby={randomFillBlockedReason !== null ? toolbarHintId : undefined}
                loading={randomFill.isPending}
                onClick={handleRandomFill}
              >
                <Shuffle size={16} aria-hidden="true" />
                빈 자리 무작위 채우기
              </Button>
            ) : null}
            {!isEmpty && canWrite ? (
              <BracketStandingsFillButton
                tournamentId={tournamentId}
                slots={bracket.slots}
                teamNames={teamNames}
                canWrite={canWrite}
                onFilled={(result) => showToast(describeStandingsFill(result), 'success')}
                onError={(message) => showToast(message, 'error')}
              />
            ) : null}
            {!isEmpty ? (
              <>
                <Button variant="outline" size="md" onClick={() => setToolsMode('add')}>
                  <Plus size={16} aria-hidden="true" />
                  경기 추가
                </Button>
                {!leagueGrid ? (
                  <Button variant="outline" size="md" onClick={() => setToolsMode('link')}>
                    <Link2 size={16} aria-hidden="true" />
                    경기 연결
                  </Button>
                ) : null}
              </>
            ) : null}
            {!published ? (
              <Button variant="primary" size="md" disabled={isEmpty} aria-describedby={publishBlockedReason !== null ? toolbarHintId : undefined} onClick={() => void handlePublish()}>
                지금 전체 공개
              </Button>
            ) : null}
            {published || hasPendingSchedule ? (
              <Button variant="outline" size="md" style={{ color: 'var(--red700)' }} onClick={() => void handleUnpublish()}>
                {published ? '공개 취소' : '예약 취소'}
              </Button>
            ) : null}
          </div>
        ) : null}
        {canWrite && toolbarHint !== null ? (
          <p id={toolbarHintId} className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
            {toolbarHint}
          </p>
        ) : null}
      </div>

      {published && canWrite ? <AlertBanner tone="warning" message="이미 공개된 대진표예요. 바꾸는 즉시 참가팀에게 보여요." /> : null}

      {isEmpty ? (
        <EmptyState
          title="아직 대진이 없어요"
          sub={
            templateFormat === null
              ? '조별+결선 방식은 목록 보기에서 조를 만들어 시작해 주세요.'
              : '템플릿으로 시작하면 경기와 팀 자리가 한 번에 만들어져요. 팀은 나중에 넣어도 돼요.'
          }
          cta={!canWrite ? undefined : templateFormat === null ? '목록으로 보기' : '템플릿으로 시작'}
          onCta={templateFormat === null ? onShowList : () => setTemplateOpen(true)}
        />
      ) : (
        <div
          className={`grid gap-4 ${
            leagueGrid
              ? rightColumn
                ? 'grid-cols-[minmax(0,1fr)_320px]'
                : 'grid-cols-1'
              : !rightColumn
                ? 'lg:grid-cols-[240px_minmax(0,1fr)]'
                : 'lg:grid-cols-[240px_minmax(0,1fr)_320px]'
          }`}
        >
          <div className={leagueGrid ? 'col-span-full' : 'contents'}>
          <BracketTeamTray
            registrations={registrations}
            registrationsState={registrationsState}
            slots={bracket.slots}
            directPlacedIds={directPlacedRegistrationIds(bracket.fixtures, bracket.slots)}
            pendingRegistrationId={pendingRegistrationId}
            canWrite={canWrite}
            collapsible={leagueGrid || !sidePanel}
            onPick={setPendingRegistrationId}
          />
          </div>
          {leagueGrid ? (
            <div className="flex min-w-0 flex-col gap-3">
              {showStandings && (sidePanel ? selectedFixture !== null : true) ? (
                <div className="flex justify-end">
                  {sidePanel ? (
                    <Button variant="outline" size="md" onClick={() => setSelectedFixtureId(null)}>
                      순위표 보기
                    </Button>
                  ) : (
                    <Button variant="outline" size="md" onClick={() => setStandingsSheetOpen(true)}>
                      순위표
                    </Button>
                  )}
                </div>
              ) : null}
              <BracketLeagueGrid
                groups={bracket.groups}
                fixtures={bracket.fixtures}
                slots={bracket.slots}
                selectedFixtureId={selectedFixture?.id ?? null}
                pendingRegistrationId={canWrite ? pendingRegistrationId : null}
                canWrite={canWrite}
                onSelectFixture={setSelectedFixtureId}
                onAssignSlot={handleAssign}
                onAssignDirect={handleAssignDirect}
              />
            </div>
          ) : (
            <BracketCanvas
              groups={bracket.groups}
              fixtures={bracket.fixtures}
              slots={bracket.slots}
              selectedFixtureId={selectedFixture?.id ?? null}
              pendingRegistrationId={canWrite ? pendingRegistrationId : null}
              canWrite={canWrite}
              onSelectFixture={setSelectedFixtureId}
              onAssignSlot={handleAssign}
              onAssignDirect={handleAssignDirect}
            />
          )}
          {rightColumn ? (
            panel !== null ? (
              panel
            ) : (
              <aside aria-label="조별 순위" className="sticky top-4 self-start">
                <BracketLeagueStandings groups={standingsGroups} />
              </aside>
            )
          ) : null}
        </div>
      )}

      {panel !== null && selectedFixture !== null && !sidePanel ? (
        <BottomSheet open onClose={() => setSelectedFixtureId(null)} ariaLabel={fixtureTitle(selectedFixture, bracket.groups)}>
          {panel}
        </BottomSheet>
      ) : null}

      {showStandings && !sidePanel && standingsSheetOpen ? (
        <BottomSheet open onClose={() => setStandingsSheetOpen(false)} title="조별 순위">
          <BracketLeagueStandings groups={standingsGroups} />
        </BottomSheet>
      ) : null}

      <BracketFixtureToolsDialog
        key={toolsMode ?? 'closed'}
        open={toolsMode !== null}
        mode={toolsMode ?? 'add'}
        tournamentId={tournamentId}
        bracket={bracket}
        onClose={() => setToolsMode(null)}
        showToast={showToast}
      />

      {templateFormat !== null ? (
        <BracketTemplateDialog
          open={templateOpen}
          tournamentId={tournamentId}
          format={templateFormat}
          hasExistingBracket={!isEmpty}
          onClose={() => setTemplateOpen(false)}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
}
