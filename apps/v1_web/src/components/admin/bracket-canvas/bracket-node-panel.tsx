'use client';

import { ScopedLink as Link } from '@/components/providers/navigation-scope';
import { Trash2, X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useV1DeleteFixture, useV1UpdateFixture } from '@/hooks/use-v1-api';
import { useV1AssignTournamentSlot, useV1QuickResult } from '@/hooks/use-v1-bracket-canvas';
import { TEAM_IN_OTHER_GROUP_HIDDEN_NOTE, applyGroupRule, registrationIdsBlockedForGroup, registrationIdsInOppositeFinalStage } from '@/lib/bracket-group-enrollment';
import { placedRegistrationIdsForSlot } from '@/lib/bracket-slot-candidates';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { classifyFixtureSide, fixtureTeamChangeAccess, isFixtureLocked, isSlotAssignable, type SideKey } from '@/lib/bracket-canvas-layout';
import type {
  V1AdminBracketFixture,
  V1AdminBracketGroup,
  V1AdminBracketSlot,
  V1AdminTournamentRegistration,
} from '@/types/api';
import { fixtureTitle } from './bracket-canvas';
import { BracketQuickResultForm } from './bracket-quick-result-form';
import { BracketResultActions } from './bracket-result-actions';
import { fixtureDeleteConfirm } from './fixture-delete-confirm';
import { FixtureMetadataEditor } from './fixture-metadata-editor';
import { ByeSideControl } from './bye-side-control';
import { useStartedTeamChangeReason } from './use-started-team-change-reason';

export type BracketNodePanelProps = {
  tournamentId: string;
  fixture: V1AdminBracketFixture;
  groups: V1AdminBracketGroup[];
  fixtures: V1AdminBracketFixture[];
  slots: V1AdminBracketSlot[];
  registrations: V1AdminTournamentRegistration[];
  /** 신청 목록이 아직 없거나 실패한 상태에서는 팀 선택창을 잠근다("팀 0개"처럼 보이지 않게). */
  registrationsLoaded: boolean;
  sideLabels: Record<SideKey, string>;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onClose: () => void;
};

const SIDE_NAME: Record<SideKey, string> = { HOME: '홈', AWAY: '원정' };

const DIRECT_SIDE_BLOCKED = {
  official: '공식 결과가 확정된 경기예요. 결과를 먼저 무효로 돌려 주세요.',
  cancelled: '취소된 경기는 팀을 바꿀 수 없어요.',
} as const;

export function BracketNodePanel({
  tournamentId,
  fixture,
  groups,
  fixtures,
  slots,
  registrations,
  registrationsLoaded,
  sideLabels,
  canWrite,
  showToast,
  onClose,
}: BracketNodePanelProps) {
  const assignSlot = useV1AssignTournamentSlot(tournamentId, 'tournament');
  const quickResult = useV1QuickResult(tournamentId, 'tournament');
  const updateFixture = useV1UpdateFixture(tournamentId);
  const deleteFixture = useV1DeleteFixture(tournamentId);
  const { confirm, ConfirmModal } = useConfirm();
  const { requestReason, dialog: teamChangeDialog } = useStartedTeamChangeReason();
  const [quickError, setQuickError] = useState<string | null>(null);

  const title = fixtureTitle(fixture, groups);
  const locked = isFixtureLocked(fixture);
  const teamChangeAccess = fixtureTeamChangeAccess(fixture);
  const group = groups.find((candidate) => candidate.id === fixture.groupId);
  const isKnockout = group !== undefined && group.phase !== 'group';
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const confirmed = registrations.filter((registration) => registration.status === 'confirmed');
  const game = fixture.game;
  // 단계·결선 경기는 팀을 자리가 아니라 「팀 채우기」 메뉴의 단계 관리가 정하고, 삭제도 단계 구성이 맡는다.
  const stageManaged = groups.some((candidate) => candidate.id === fixture.groupId && candidate.bracketTrack?.startsWith('stage:'));

  const handleAssign = (slot: V1AdminBracketSlot, registrationId: string) => {
    assignSlot.mutate(
      { slotId: slot.id, registrationId: registrationId === '' ? null : registrationId },
      {
        onSuccess: () => showToast(registrationId === '' ? '자리를 비웠어요.' : '팀을 넣었어요.', 'success'),
        onError: (error) => showToast(describeBracketCanvasError(error, '팀을 넣지 못했어요.'), 'error'),
      },
    );
  };

  const handleAssignDirect = async (side: SideKey, registrationId: string) => {
    const value = registrationId === '' ? null : registrationId;
    // 시작된 경기는 명단·기록이 지워지므로 확인과 사유를 먼저 받는다.
    const teamChangeReason = teamChangeAccess === 'started' ? await requestReason([sideLabels[side]]) : undefined;
    if (teamChangeReason === null) return;
    updateFixture.mutate(
      {
        fixtureId: fixture.id,
        ...(side === 'HOME' ? { homeRegistrationId: value } : { awayRegistrationId: value }),
        ...(teamChangeReason === undefined ? {} : { teamChangeReason }),
      },
      {
        onSuccess: (result) => {
          const removed = result.startedTeamChange?.removedEventCount ?? 0;
          showToast(
            result.startedTeamChange === null
              ? value === null ? '자리를 비웠어요.' : '팀을 넣었어요.'
              : `팀을 바꿨어요. 옛 팀 기록 ${removed}건을 지웠어요.`,
            'success',
          );
        },
        onError: (error) => showToast(describeBracketCanvasError(error, '팀을 넣지 못했어요.'), 'error'),
      },
    );
  };

  const directCandidates = (side: SideKey) => {
    const current = side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId;
    const other = side === 'HOME' ? fixture.awayRegistrationId : fixture.homeRegistrationId;
    return applyGroupRule(
      confirmed.filter((registration) => registration.id !== other),
      (registration) => registration.id,
      registrationIdsBlockedForGroup(groups, fixture.groupId),
      current,
      registrationIdsInOppositeFinalStage(groups, fixtures, fixture.groupId),
    );
  };

  const slotCandidates = (slot: V1AdminBracketSlot) => {
    const placedIds = placedRegistrationIdsForSlot(slots, slot, groups);
    return applyGroupRule(
      confirmed.filter((registration) => registration.id === slot.registrationId || !placedIds.has(registration.id)),
      (registration) => registration.id,
      registrationIdsBlockedForGroup(groups, slot.groupId),
      slot.registrationId,
    );
  };

  // 선택창을 실제로 그리는 쪽과 같은 후보 계산에서 다른 조 팀 때문에 후보가 줄었는지 읽는다.
  const hidesOtherGroupTeams = (['HOME', 'AWAY'] as const).some((side) => {
    if (!canWrite) return false;
    const slotId = side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId;
    const slot = slotId === null ? undefined : slotsById.get(slotId);
    if (classifyFixtureSide(fixture, side, slotsById) === 'direct') {
      if (teamChangeAccess === 'official' || teamChangeAccess === 'cancelled') return false;
      return directCandidates(side).hidesOtherGroupTeams;
    }
    if (slot === undefined || !isSlotAssignable(slot) || locked) return false;
    return slotCandidates(slot).hidesOtherGroupTeams;
  });

  const renderSide = (side: SideKey) => {
    const slotId = side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId;
    const slot = slotId === null ? undefined : slotsById.get(slotId);
    const source = classifyFixtureSide(fixture, side, slotsById);
    let body: React.ReactNode;
    if (groups.some(group => group.id === fixture.groupId && group.bracketTrack && !['overall', 'upper', 'lower'].includes(group.bracketTrack))) {
      body = <p className="tm-text-caption text-[var(--text-muted)]">진출팀은 「팀 채우기」 메뉴에서 정해요.</p>;
    } else if (source === 'direct') {
      const current = side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId;
      if (teamChangeAccess === 'official' || teamChangeAccess === 'cancelled') {
        body = (
          <div className="flex flex-col items-start gap-2">
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{DIRECT_SIDE_BLOCKED[teamChangeAccess]}</p>
            {teamChangeAccess === 'official' && canWrite ? (
              <Link href={correctionsHref} className="tm-btn tm-btn-sm tm-btn-outline">결과 고치기 화면 열기</Link>
            ) : null}
          </div>
        );
      } else if (!canWrite) {
        body = null;
      } else {
        const candidates = directCandidates(side).shown;
        body = (
          <select
            aria-label={`${SIDE_NAME[side]} 팀 선택`}
            value={current ?? ''}
            disabled={!registrationsLoaded || updateFixture.isPending}
            onChange={(event) => void handleAssignDirect(side, event.target.value)}
            className="tm-input"
            style={{ minHeight: 44 }}
          >
            <option value="">비워 두기</option>
            {candidates.map((registration) => (
              <option key={registration.id} value={registration.id}>
                {registration.teamName ?? registration.teamId}
              </option>
            ))}
          </select>
        );
      }
    } else if (slot === undefined) {
      // feeder: 슬롯 없이 이전 경기 결과로만 채워지는 사이드
      body = <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>이전 경기 결과로 채워져요.</p>;
    } else if (!isSlotAssignable(slot)) {
      body = <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>조 순위가 나오면 채워져요.</p>;
    } else if (locked) {
      body = <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>경기가 시작됐거나 결과가 있어 팀을 바꿀 수 없어요.</p>;
    } else if (!canWrite) {
      body = null;
    } else {
      const options = slotCandidates(slot).shown;
      body = (
        <select
          aria-label={`${SIDE_NAME[side]} 팀 선택`}
          value={slot.registrationId ?? ''}
          disabled={!registrationsLoaded || assignSlot.isPending}
          onChange={(event) => handleAssign(slot, event.target.value)}
          className="tm-input"
          style={{ minHeight: 44 }}
        >
          <option value="">비워 두기</option>
          {options.map((registration) => (
            <option key={registration.id} value={registration.id}>
              {registration.teamName ?? registration.teamId}
            </option>
          ))}
        </select>
      );
    }
    return (
      <div key={side} className="flex flex-col gap-1">
        <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{`${SIDE_NAME[side]} · ${sideLabels[side]}`}</p>
        {body}
      </div>
    );
  };

  const handleDelete = async () => {
    const ok = await confirm(fixtureDeleteConfirm({ title, fixture, fixtures }));
    if (!ok) return;
    deleteFixture.mutate(fixture.id, {
      onSuccess: () => {
        showToast('경기를 삭제했어요.', 'success');
        onClose();
      },
      onError: (error) => showToast(describeBracketCanvasError(error, '경기를 삭제하지 못했어요.'), 'error'),
    });
  };

  const correctionsHref = `/admin/live/${encodeURIComponent(tournamentId)}/records/corrections?fixtureId=${encodeURIComponent(fixture.id)}`;

  const renderResult = () => {
    if (game === null) return <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>경기 정보가 아직 준비되지 않았어요.</p>;
    if (game.state === 'CANCELLED') return <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>취소된 경기예요.</p>;
    if (game.state === 'LIVE' || game.state === 'PAUSED') {
      return <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>진행 중인 경기는 라이브 콘솔에서 입력해요.</p>;
    }
    const revision = game.latestRevision;
    if (revision?.state === 'VOID') return <BracketResultActions tournamentId={tournamentId} fixtureId={fixture.id} game={game}
      isKnockout={isKnockout} homeLabel={sideLabels.HOME} awayLabel={sideLabels.AWAY} canWrite={canWrite} showToast={showToast} />;
    if (revision !== null) {
      return (
        <BracketResultActions
          tournamentId={tournamentId}
          fixtureId={fixture.id}
          game={game}
          isKnockout={isKnockout}
          homeLabel={sideLabels.HOME}
          awayLabel={sideLabels.AWAY}
          canWrite={canWrite}
          showToast={showToast}
        />
      );
    }
    if (game.hasLiveRecords) {
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>라이브로 득점이 기록된 경기예요. 결과 고치기 화면에서 처리해 주세요.</p>
          <Link href={correctionsHref} className="tm-btn tm-btn-sm tm-btn-outline">결과 고치기 화면 열기</Link>
        </div>
      );
    }
    if (fixture.homeRegistrationId === null || fixture.awayRegistrationId === null) {
      return <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>양쪽 팀이 정해지면 점수를 넣을 수 있어요.</p>;
    }
    if (!canWrite) return null;
    return (
      <div className="flex flex-col gap-2">
        <BracketQuickResultForm
          homeLabel={sideLabels.HOME}
          awayLabel={sideLabels.AWAY}
          isKnockout={isKnockout}
          submitLabel="점수 확정"
          confirmBeforeSubmit
          pending={quickResult.isPending}
          errorMessage={quickError}
          onSubmit={(score) => {
            setQuickError(null);
            quickResult.mutate(
              { gameId: game.id, expectedVersion: game.version, score },
              {
                onSuccess: () => showToast('점수를 확정했어요.', 'success'),
                onError: (error) => setQuickError(describeBracketCanvasError(error, '점수를 확정하지 못했어요.')),
              },
            );
          }}
        />
      </div>
    );
  };

  const sectionTitle = 'tm-text-label font-semibold';

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // 확인 창은 portal 이라 React 이벤트는 올라와도 DOM 은 패널 밖이다 — 패널 안에서 누른 ESC 만 닫는다.
    if (event.key === 'Escape' && !event.defaultPrevented && event.currentTarget.contains(event.target as Node)) onClose();
  };
  const iconButton = 'flex size-11 shrink-0 items-center justify-center transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500';

  return (
    <aside
      aria-label="칸 상세"
      onKeyDown={onKeyDown}
      className="flex flex-col gap-5 p-4"
      style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface)', boxShadow: 'var(--shadow-dropdown)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="tm-text-body-lg min-w-0 truncate font-bold" style={{ color: 'var(--text-strong)' }}>{title}</h2>
        <div className="flex shrink-0 items-center">
          {canWrite && !stageManaged ? (
            <button type="button" aria-label="경기 삭제" onClick={() => void handleDelete()} className={iconButton}
              style={{ borderRadius: 'var(--radius-control)', color: 'var(--red700)' }}>
              <Trash2 size={18} aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" aria-label="패널 닫기" onClick={onClose} className={iconButton}
            style={{ borderRadius: 'var(--radius-control)', color: 'var(--text-muted)' }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <section aria-label="팀 자리" className="flex flex-col gap-3">
        <h3 className={sectionTitle} style={{ color: 'var(--text-strong)' }}>팀 자리</h3>
        {renderSide('HOME')}
        {renderSide('AWAY')}
        <ByeSideControl tournamentId={tournamentId} fixture={fixture} slots={slots} canWrite={canWrite && !stageManaged} showToast={showToast} onSaved={onClose} />
        {hidesOtherGroupTeams ? (
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{TEAM_IN_OTHER_GROUP_HIDDEN_NOTE}</p>
        ) : null}
      </section>

      <FixtureMetadataEditor tournamentId={tournamentId} fixture={fixture} groups={groups} fixtures={fixtures} slots={slots} canWrite={canWrite} showToast={showToast} />

      <section aria-label="결과" className="flex flex-col gap-3">
        <h3 className={sectionTitle} style={{ color: 'var(--text-strong)' }}>결과</h3>
        {renderResult()}
      </section>

      {ConfirmModal}
      {teamChangeDialog}
    </aside>
  );
}
