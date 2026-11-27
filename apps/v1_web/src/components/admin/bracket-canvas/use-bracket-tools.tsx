'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { ActionSheetAction } from '@/components/v1-ui/action-sheet';
import { StagePlanDialog } from '@/components/admin/stages/stage-plan-dialog';
import { useV1AdminBracket } from '@/hooks/use-v1-api';
import { useV1RandomFillSlots } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { describeStandingsFill } from '@/lib/bracket-standings-fill-message';
import type { V1AdminTournamentRegistration, V1Tournament } from '@/types/api';
import { BracketFixtureToolsDialog } from './bracket-fixture-tools-dialog';
import { BracketStandingsFillDialog } from './bracket-standings-fill-dialog';
import { BracketTemplateDialog } from './bracket-template-dialog';
import { summarizeBracket } from './bracket-publish-control';
import {
  bracketCreateAction,
  buildBracketToolMenus,
  hasGroupRankSlots,
  type BracketCreateKey,
  type BracketToolItem,
  type BracketToolKey,
} from './bracket-tool-menus';
import { FinalistAssignmentDialog } from './finalist-assignment-dialog';
import { MultiFinalsWizard } from './multi-finals-wizard';
import type { RegistrationsLoadState } from './bracket-team-tray';
import { unplacedTeamCount } from './unplaced-team-count';
import type { BracketViewControls } from './use-bracket-view-controls';
import { useBracketResetFlow } from './use-bracket-reset-flow';

export interface UseBracketToolsInput {
  tournamentId: string;
  tournament: V1Tournament | undefined;
  registrations: V1AdminTournamentRegistration[];
  registrationsState: RegistrationsLoadState;
  canWrite: boolean;
  role: string;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  controls: BracketViewControls;
  /** 지금 보는 방식 — 그림 보기에만 있는 도구(참가팀 목록)를 목록 보기에서 빼는 데 쓴다. */
  view: 'canvas' | 'list';
  onAssignmentModeChange: (mode: 'time' | 'court' | null) => void;
}

export interface BracketTools {
  loading: boolean;
  isEmpty: boolean;
  hasGroups: boolean;
  summary: string;
  unscheduledCount: number;
  menus: { teamFill: ActionSheetAction[]; match: ActionSheetAction[]; timeVenue: ActionSheetAction[] };
  create: { key: BracketCreateKey; label: string } | null;
  openCreate: () => void;
  resetError: string | null;
  dialogs: ReactNode;
}

type OpenDialog = 'template' | 'stage' | 'standings' | 'finalists' | 'add' | 'link' | null;
type MultiFinalsMode = 'create' | 'rules' | 'assign';

const MULTI_TOAST = { create: '토너먼트 대진을 생성했어요.', rules: '토너먼트 배정 규칙을 저장했어요.', assign: '진출팀을 대진에 배정했어요.' } as const;

export function useBracketTools(input: UseBracketToolsInput): BracketTools {
  const { tournamentId, tournament, registrations, registrationsState, canWrite, role, showToast, controls, view, onAssignmentModeChange } = input;
  const { data: bracket, isPending, refetch } = useV1AdminBracket(tournamentId);
  const randomFill = useV1RandomFillSlots(tournamentId, 'tournament');
  const resetFlow = useBracketResetFlow(tournamentId, canWrite, showToast);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  // 닫히는 동안 내용이 바뀌지 않게 마지막 방식을 남겨 둔다.
  const [multiFinals, setMultiFinals] = useState<{ mode: MultiFinalsMode; open: boolean }>({ mode: 'create', open: false });
  const format = tournament?.format;
  const hasStagePlan = Boolean(tournament?.stagePlan);
  const groups = useMemo(() => bracket?.groups ?? [], [bracket]);
  const fixtures = useMemo(() => bracket?.fixtures ?? [], [bracket]);
  const slots = useMemo(() => bracket?.slots ?? [], [bracket]);
  const loaded = bracket !== undefined;
  const isEmpty = loaded && groups.length === 0 && fixtures.length === 0;
  const confirmedTeams = registrations.filter((registration) => registration.status === 'confirmed');
  const teamNames = useMemo(
    () => new Map(groups.flatMap((group) => group.groupTeams.flatMap((team) => (team.registrationId && team.teamName ? [[team.registrationId, team.teamName] as const] : [])))),
    [groups],
  );
  const templateFormat = format === 'knockout' || format === 'league' || format === 'group_knockout' ? format : null;
  const supportsRound12 = groups.filter((group) => group.phase === 'group').length === 5 && groups.some((group) => group.phase === 'round12');
  const unscheduledCount = fixtures.filter((fixture) => fixture.scheduledAt === null).length;

  // 무작위 채우기는 자리만 채우므로 경기에 직접 들어간 팀은 미배정으로 센다.
  const placedIds = new Set(slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map((slot) => slot.registrationId));
  const emptySlotCount = slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId === null).length;
  const slotUnplacedCount = confirmedTeams.filter((registration) => !placedIds.has(registration.id)).length;
  const randomFillBlockedReason =
    registrationsState.status === 'pending' ? '참가팀을 불러오는 중이에요.'
      : registrationsState.status === 'error' ? '참가팀을 불러오지 못했어요.'
        : emptySlotCount === 0 ? '비어 있는 자리가 없어요.'
          : slotUnplacedCount === 0 ? '배정할 수 있는 팀이 없어요.'
            : null;
  // 방식을 모르면 리그에도 토너먼트 폼이 열리므로, 알 때까지 경기 추가·연결을 막는다.
  const formatUnknownReason = format === undefined ? '대회 방식을 아직 확인하지 못해 경기를 추가하거나 연결할 수 없어요.' : null;

  const create = bracketCreateAction({ format, hasStagePlan, canWrite });
  const openCreate = (key: BracketCreateKey) => {
    if (key === 'template') setDialog('template');
    else if (key === 'stage') setDialog('stage');
    else setMultiFinals({ mode: 'create', open: true });
  };

  const handleRandomFill = () => randomFill.mutate(undefined, {
    onSuccess: (result) => showToast(result.assignments.length === 0 ? '채울 수 있는 자리가 없어요.' : `${result.assignments.length}개 자리를 채웠어요.`, 'success'),
    onError: (err) => showToast(describeBracketCanvasError(err, '자리를 채우지 못했어요.'), 'error'),
  });
  const handlers: Record<BracketToolKey, () => void> = {
    'random-fill': handleRandomFill,
    'standings-fill': () => setDialog('standings'),
    finalists: () => setDialog('finalists'),
    'team-tray': () => controls.setTrayOpen(true),
    'stage-teams': () => setDialog('stage'),
    'multi-finals-assign': () => setMultiFinals({ mode: 'assign', open: true }),
    'multi-finals-rules': () => setMultiFinals({ mode: 'rules', open: true }),
    'add-fixture': () => setDialog('add'),
    'link-fixtures': () => setDialog('link'),
    template: () => setDialog('template'),
    'multi-finals-create': () => openCreate('multi-finals-create'),
    reset: resetFlow.start,
    'time-assign': () => onAssignmentModeChange('time'),
    'court-assign': () => onAssignmentModeChange('court'),
    'unscheduled-only': () => controls.setUnscheduledOnly(!controls.unscheduledOnly),
  };

  const model = buildBracketToolMenus({
    format, hasStagePlan, isEmpty, canWrite: canWrite && loaded, leagueGrid: format === 'league',
    hasGroupPhase: groups.some((group) => group.phase === 'group'), hasGroupRankSlots: hasGroupRankSlots(slots),
    randomFillBlockedReason, formatUnknownReason,
    unplacedTeamCount: bracket === undefined ? 0 : unplacedTeamCount(registrations, bracket),
    unscheduledCount, unscheduledOnly: controls.unscheduledOnly, canvasView: view === 'canvas',
  });
  const toAction = (item: BracketToolItem): ActionSheetAction => ({
    key: item.key, label: item.label, description: item.description, destructive: item.destructive, groupLabel: item.groupLabel,
    disabled: Boolean(item.disabledReason), disabledReason: item.disabledReason, onSelect: handlers[item.key],
  });
  const menus = { teamFill: model.teamFill.map(toAction), match: model.match.map(toAction), timeVenue: model.timeVenue.map(toAction) };

  const close = () => setDialog(null);
  const dialogs = (
    <>
      {bracket !== undefined && format !== undefined ? (
        <BracketFixtureToolsDialog
          key={dialog === 'add' || dialog === 'link' ? `tools-${dialog}` : 'tools-closed'}
          open={dialog === 'add' || dialog === 'link'}
          mode={dialog === 'link' ? 'link' : 'add'}
          format={format}
          tournamentId={tournamentId}
          bracket={bracket}
          onFixtureCreated={controls.requestFocus}
          onClose={close}
          showToast={showToast}
        />
      ) : null}
      {templateFormat !== null ? (
        <BracketTemplateDialog
          open={dialog === 'template'}
          tournamentId={tournamentId}
          format={templateFormat}
          allowSplitBracket={tournament?.kind === 'regular_tournament'}
          confirmedTeamCount={confirmedTeams.length}
          confirmedTeamCountStatus={registrationsState.status}
          hasExistingBracket={!isEmpty}
          onApplied={() => {
            void refetch().then(({ data }) => {
              const first = [...(data?.fixtures ?? [])].sort((a, b) => a.fixtureNumber - b.fixtureNumber)[0];
              if (first) controls.requestFocus(first.id);
            });
          }}
          onClose={close}
          showToast={showToast}
        />
      ) : null}
      {dialog === 'standings' ? (
        <BracketStandingsFillDialog
          open
          tournamentId={tournamentId}
          teamNames={teamNames}
          onClose={close}
          onFilled={(result) => showToast(describeStandingsFill(result), 'success')}
          onError={(message) => showToast(message, 'error')}
        />
      ) : null}
      {dialog === 'finalists' ? <FinalistAssignmentDialog tournamentId={tournamentId} supportsRound12={supportsRound12} onClose={close} showToast={showToast} /> : null}
      {tournament !== undefined && hasStagePlan ? (
        <StagePlanDialog open={dialog === 'stage'} onClose={close} tournamentId={tournamentId} canWrite={canWrite} canOverride={role === 'PLATFORM_OPS'} tournamentStatus={tournament.status} />
      ) : null}
      {format === 'league_knockouts' && !hasStagePlan ? (
        <MultiFinalsWizard
          tournamentId={tournamentId}
          mode={multiFinals.mode}
          open={multiFinals.open}
          onClose={() => setMultiFinals((previous) => ({ ...previous, open: false }))}
          onApplied={() => showToast(MULTI_TOAST[multiFinals.mode], 'success')}
        />
      ) : null}
      {resetFlow.ConfirmModal}
    </>
  );

  return {
    loading: isPending,
    isEmpty,
    hasGroups: groups.length > 0,
    summary: summarizeBracket(groups, fixtures),
    unscheduledCount,
    menus,
    create,
    openCreate: () => { if (create !== null) openCreate(create.key); },
    resetError: resetFlow.error,
    dialogs,
  };
}
