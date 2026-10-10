'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { AdminToastVariant } from '@/components/admin';
import { StatusChip } from '@/components/v1-ui/status-chip';
import { useV1UpdateFixture } from '@/hooks/use-v1-api';
import { useV1AssignTournamentSlot, useV1QuickResult } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import {
  hasTeam,
  pickableCandidates,
  sideDisplayName,
  type MobileNode,
  type MobilePickCandidate,
  type MobileSide,
} from '@/lib/bracket-canvas-mobile-model';
import { bracketNodeStateChip } from '@/lib/competition-status';
import { extractErrorMessage } from '@/lib/error-message';
import { TEAM_IN_OTHER_GROUP_HIDDEN_NOTE, applyGroupRule, registrationIdsBlockedForGroup, registrationIdsInOppositeFinalStage } from '@/lib/bracket-group-enrollment';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketSlot } from '@/types/api';
import { BracketQuickResultForm } from './bracket-quick-result-form';
import { BracketResultActions } from './bracket-result-actions';
import type { RegistrationsLoadState } from './bracket-team-tray';
import { useLeagueResultToast } from './use-league-result-toast';

export type MobileSheetView = { kind: 'detail' } | { kind: 'pick'; side: 'HOME' | 'AWAY' };

export interface MobileNodeSheetBodyProps {
  node: MobileNode;
  competitionId: string;
  scope: 'tournament' | 'league';
  canWrite: boolean;
  slots: V1AdminBracketSlot[];
  /** 한 팀 한 조 후보 제외용 — tournament scope 에서만 넘긴다. */
  groups?: readonly V1AdminBracketGroup[];
  fixtures?: readonly V1AdminBracketFixture[];
  candidates: MobilePickCandidate[];
  /** 참가팀 조회 상태 — 성공 전에는 팀 고르기를 막는다("팀 0개"처럼 보이지 않게). */
  registrationsState: RegistrationsLoadState;
  showToast: (message: string, variant?: AdminToastVariant) => void;
  view: MobileSheetView;
  onViewChange: (view: MobileSheetView) => void;
  /** 빠른 입력이 성공하면 시트를 닫는다 — 현장 입력은 곧바로 다음 칸으로 넘어가야 한다. */
  onDone: () => void;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[length:var(--font-size-body-sm)] leading-relaxed text-[var(--text-muted)]">{children}</p>;
}

const SIDE_SOURCE_NOTE: Record<'feeder' | 'direct', string> = {
  feeder: '이전 경기 결과로 채워져요.',
  direct: '경기에 직접 지정하는 자리예요.',
};

function SideRow({ label, side, canPick, onPick }: { label: string; side: MobileSide; canPick: boolean; onPick: () => void }) {
  // feeder 는 팀이 이미 있어도 앞 경기 결과로 채워진다는 사실을 알린다(데스크톱 칸 패널과 같다).
  const note = side.source === 'feeder' ? SIDE_SOURCE_NOTE.feeder : !hasTeam(side) && side.source === 'direct' ? SIDE_SOURCE_NOTE.direct : null;
  const verb = hasTeam(side) ? '바꾸기' : '고르기';
  return (
    <li className="flex min-h-[44px] flex-col justify-center gap-0.5 rounded-xl bg-[var(--grey50)] px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">{label}</span>
        <span
          className={`min-w-0 flex-1 break-keep text-right text-[length:var(--font-size-body-sm)] font-semibold ${hasTeam(side) ? 'text-[var(--text-strong)]' : 'text-[var(--text-muted)]'}`}
        >
          {sideDisplayName(side)}
        </span>
        {canPick ? (
          <button type="button" onClick={onPick} aria-label={`${label} 팀 ${verb}`} className="tm-btn tm-btn-sm tm-btn-outline min-h-[44px] shrink-0">
            {hasTeam(side) ? '바꾸기' : '팀 고르기'}
          </button>
        ) : null}
      </div>
      {note ? <span className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{note}</span> : null}
    </li>
  );
}

function ResultSection({ node, competitionId, scope, canWrite, showToast, onDone }: MobileNodeSheetBodyProps) {
  // 폼은 제출 로직을 갖지 않는다(PR-3 계약) — 변이를 여기서 소유하고 폼의 onSubmit 으로 잇는다.
  const quickResult = useV1QuickResult(competitionId, scope);
  const notifyLeagueResult = useLeagueResultToast(competitionId, showToast);
  const [quickError, setQuickError] = useState<string | null>(null);
  const homeName = sideDisplayName(node.home);
  const awayName = sideDisplayName(node.away);

  if (node.state === 'cancelled') return <Note>취소된 경기예요.</Note>;
  if (node.state === 'live') return <Note>진행 중인 경기예요. 결과는 라이브 콘솔에서 넣어요.</Note>;
  if (!canWrite) return null;
  if (node.game === null) return <Note>이 경기는 아직 결과를 넣을 수 없어요.</Note>;

  if (node.state === 'scheduled') {
    if (!hasTeam(node.home) || !hasTeam(node.away)) return <Note>두 팀이 정해지면 점수를 넣을 수 있어요.</Note>;
    const { id: gameId, version } = node.game;
    return (
      <BracketQuickResultForm
        homeLabel={homeName}
        awayLabel={awayName}
        isKnockout={node.knockout}
        submitLabel="점수 확정"
        pending={quickResult.isPending}
        errorMessage={quickError}
        onSubmit={(score) => {
          setQuickError(null);
          quickResult.mutate(
            { gameId, expectedVersion: version, score },
            {
              onSuccess: () => {
                showToast('점수를 확정했어요.');
                onDone();
              },
              onError: (error) => setQuickError(describeBracketCanvasError(error, '점수를 확정하지 못했어요.')),
            },
          );
        }}
      />
    );
  }

  // 라이브로 득점이 기록된 경기는 그림에서 점수만 고치면 기록과 어긋난다 — 기존 정정 화면으로 보낸다.
  if (node.state === 'official' && node.game.hasLiveRecords) {
    return (
      <div className="flex flex-col gap-2">
        <Note>득점 기록이 있는 경기는 결과 정정 화면에서 고쳐요.</Note>
        <Link
          href={`/admin/live/${encodeURIComponent(competitionId)}/records/corrections?fixtureId=${encodeURIComponent(node.fixtureId)}`}
          className="tm-btn tm-btn-md tm-btn-outline min-h-[44px]"
        >
          결과 정정 화면으로 가기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {node.quickEntered ? <Note>어드민 빠른 입력으로 확정한 결과예요. 득점자는 기록되지 않았어요.</Note> : null}
      <BracketResultActions
        tournamentId={competitionId}
        fixtureId={node.fixtureId}
        game={node.game}
        isKnockout={node.knockout}
        homeLabel={homeName}
        awayLabel={awayName}
        canWrite={canWrite}
        showToast={scope === 'league' ? notifyLeagueResult : showToast}
      />
    </div>
  );
}

interface TeamPickerViewProps {
  sideLabel: string;
  heading: string;
  currentRegistrationId: string | null;
  options: MobilePickCandidate[];
  hiddenNote?: string;
  registrationsState: RegistrationsLoadState;
  pending: boolean;
  onSubmit: (registrationId: string | null) => void;
  onBack: () => void;
}

function TeamPickerView({ sideLabel, heading, currentRegistrationId, options, hiddenNote, registrationsState, pending, onSubmit, onBack }: TeamPickerViewProps) {
  const ready = registrationsState.status === 'success';
  const retry = (
    <div role="alert" className="flex flex-col items-start gap-2">
      <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
        {extractErrorMessage(registrationsState.error, '참가팀을 불러오지 못했어요.')}
      </p>
      <button type="button" onClick={registrationsState.onRetry} className="tm-btn tm-btn-sm tm-btn-outline min-h-[44px]">
        다시 시도
      </button>
    </div>
  );
  const shown = options.filter((option) => option.registrationId !== currentRegistrationId);

  let list: ReactNode;
  if (registrationsState.status === 'pending') {
    list = <p role="status" className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">참가팀을 불러오는 중이에요.</p>;
  } else if (registrationsState.status === 'error') {
    list = retry;
  } else if (shown.length === 0) {
    list = registrationsState.refetchFailed ? null : (
      <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
        넣을 수 있는 팀이 없어요. 확정된 참가팀이 모두 다른 자리에 있어요.
      </p>
    );
  } else {
    list = (
      // 시트(.tm-filter-sheet)는 touch-action: none 이라 긴 목록은 이 목록에서 pan-y 를 풀어야 스크롤된다.
      <ul
        role="list"
        aria-label="넣을 수 있는 팀"
        className="flex flex-col gap-1 overflow-y-auto overscroll-contain"
        style={{ touchAction: 'pan-y', maxHeight: '40dvh' }}
      >
        {shown.map((option) => (
          <li key={option.registrationId}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onSubmit(option.registrationId)}
              className="flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--grey50)] disabled:opacity-50"
            >
              {option.teamName}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-1">
      <button type="button" onClick={onBack} className="tm-btn tm-btn-sm tm-btn-ghost min-h-[44px] self-start">
        <ChevronLeft size={16} aria-hidden="true" />
        경기로 돌아가기
      </button>
      <p className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
        {sideLabel} · {heading}
      </p>
      {currentRegistrationId !== null ? (
        <button
          type="button"
          disabled={!ready || pending}
          onClick={() => onSubmit(null)}
          className="tm-btn tm-btn-md tm-btn-outline min-h-[44px]"
        >
          현재 팀 비우기
        </button>
      ) : null}
      {list}
      {hiddenNote ? <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{hiddenNote}</p> : null}
      {registrationsState.refetchFailed ? (
        <>
          {retry}
          {shown.length > 0 ? (
            <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">이전에 불러온 목록이에요.</p>
          ) : null}
        </>
      ) : null}
      {registrationsState.status === 'success' && registrationsState.truncated ? (
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">참가팀이 많아 일부만 불러왔어요.</p>
      ) : null}
    </div>
  );
}

interface PickerCommon {
  sideLabel: string;
  competitionId: string;
  registrationsState: RegistrationsLoadState;
  showToast: MobileNodeSheetBodyProps['showToast'];
  onBack: () => void;
}

async function runAssign(
  request: () => Promise<unknown>,
  registrationId: string | null,
  { showToast, onBack }: Pick<PickerCommon, 'showToast' | 'onBack'>,
) {
  try {
    await request();
    showToast(registrationId === null ? '자리를 비웠어요.' : '팀을 넣었어요.');
    onBack();
  } catch (err) {
    showToast(describeBracketCanvasError(err, '팀을 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.'), 'error');
  }
}

/** 자리(slot)에 연결된 사이드 — 서버 규칙(S3)과 같은 후보 필터. */
function SlotTeamPicker({
  slot, slots, groups, candidates, scope, ...common
}: PickerCommon & { slot: V1AdminBracketSlot; slots: V1AdminBracketSlot[]; groups: readonly V1AdminBracketGroup[]; candidates: MobilePickCandidate[]; scope: 'tournament' | 'league' }) {
  const assign = useV1AssignTournamentSlot(common.competitionId, scope);
  const { shown, hidesOtherGroupTeams } = applyGroupRule(
    pickableCandidates(candidates, slots, slot),
    (candidate) => candidate.registrationId,
    registrationIdsBlockedForGroup(groups, slot.groupId),
    slot.registrationId,
  );
  return (
    <TeamPickerView
      sideLabel={common.sideLabel}
      heading={slot.label}
      currentRegistrationId={slot.registrationId}
      options={shown}
      hiddenNote={hidesOtherGroupTeams ? TEAM_IN_OTHER_GROUP_HIDDEN_NOTE : undefined}
      registrationsState={common.registrationsState}
      pending={assign.isPending}
      onSubmit={(registrationId) => void runAssign(() => assign.mutateAsync({ slotId: slot.id, registrationId }), registrationId, common)}
      onBack={common.onBack}
    />
  );
}

/** 자리 없이 경기에 직접 지정하는 사이드 — 데스크톱 칸 패널처럼 경기를 고쳐 저장하고, 반대편 팀은 뺀다. */
function DirectTeamPicker({
  node, side, groups, fixtures, candidates, ...common
}: PickerCommon & { node: MobileNode; side: 'HOME' | 'AWAY'; groups: readonly V1AdminBracketGroup[]; fixtures: readonly V1AdminBracketFixture[]; candidates: MobilePickCandidate[] }) {
  const updateFixture = useV1UpdateFixture(common.competitionId);
  const mine = side === 'HOME' ? node.home : node.away;
  const other = side === 'HOME' ? node.away : node.home;
  const { shown, hidesOtherGroupTeams } = applyGroupRule(
    candidates.filter((candidate) => candidate.registrationId !== other.registrationId),
    (candidate) => candidate.registrationId,
    registrationIdsBlockedForGroup(groups, node.groupId),
    mine.registrationId,
    registrationIdsInOppositeFinalStage(groups, fixtures, node.groupId),
  );
  return (
    <TeamPickerView
      sideLabel={common.sideLabel}
      heading="경기에 직접 지정"
      currentRegistrationId={mine.registrationId}
      options={shown}
      hiddenNote={hidesOtherGroupTeams ? TEAM_IN_OTHER_GROUP_HIDDEN_NOTE : undefined}
      registrationsState={common.registrationsState}
      pending={updateFixture.isPending}
      onSubmit={(registrationId) =>
        void runAssign(
          () =>
            updateFixture.mutateAsync({
              fixtureId: node.fixtureId,
              ...(side === 'HOME' ? { homeRegistrationId: registrationId } : { awayRegistrationId: registrationId }),
            }),
          registrationId,
          common,
        )
      }
      onBack={common.onBack}
    />
  );
}

// 서버 SLOT_LOCKED·데스크톱 칸 패널과 같은 기준 — 예정 상태에 결과(무효 포함)가 없을 때만 팀을 바꾼다.
function isNodeLocked(node: MobileNode): boolean {
  const game = node.game;
  return node.state === 'cancelled' || (game !== null && (game.state !== 'SCHEDULED' || game.latestRevision !== null));
}

export function MobileNodeSheetBody(props: MobileNodeSheetBodyProps) {
  const { node, scope, canWrite, view, onViewChange } = props;
  const groups = props.groups ?? [];
  const editable = canWrite && !isNodeLocked(node);
  const slotById = (id: string | null) => props.slots.find((candidate) => candidate.id === id) ?? null;
  const pickKind = (side: MobileSide): 'slot' | 'direct' | null => {
    if (!editable) return null;
    if (side.source === 'slot') return side.slotKind !== 'GROUP_RANK' && slotById(side.slotId) !== null ? 'slot' : null;
    // 리그 모바일의 자리 없는 경기는 안내만 한다(Task 10).
    return side.source === 'direct' && scope === 'tournament' ? 'direct' : null;
  };

  if (view.kind === 'pick') {
    const side = view.side === 'HOME' ? node.home : node.away;
    const kind = pickKind(side);
    const common = {
      sideLabel: view.side === 'HOME' ? '홈' : '어웨이',
      competitionId: props.competitionId,
      registrationsState: props.registrationsState,
      showToast: props.showToast,
      onBack: () => onViewChange({ kind: 'detail' }),
    };
    const slot = slotById(side.slotId);
    if (kind === 'slot' && slot !== null) {
      return <SlotTeamPicker {...common} slot={slot} slots={props.slots} groups={groups} candidates={props.candidates} scope={scope} />;
    }
    if (kind === 'direct') {
      return <DirectTeamPicker {...common} node={node} side={view.side} groups={groups} fixtures={props.fixtures ?? []} candidates={props.candidates} />;
    }
  }

  const hasRankSlot = editable && [node.home, node.away].some((side) => side.slotKind === 'GROUP_RANK');

  return (
    <div className="flex flex-col gap-4 pb-1">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip chip={bracketNodeStateChip(node.state)} />
        {node.scoreText ? (
          <span className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">{node.scoreText}</span>
        ) : null}
      </div>
      <ul role="list" aria-label="참가팀" className="flex flex-col gap-2">
        <SideRow label="홈" side={node.home} canPick={pickKind(node.home) !== null} onPick={() => onViewChange({ kind: 'pick', side: 'HOME' })} />
        <SideRow label="어웨이" side={node.away} canPick={pickKind(node.away) !== null} onPick={() => onViewChange({ kind: 'pick', side: 'AWAY' })} />
      </ul>
      {hasRankSlot ? <Note>조 순위가 정해지면 큰 화면에서 순위대로 채워요.</Note> : null}
      <ResultSection {...props} />
    </div>
  );
}
