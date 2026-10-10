'use client';

import { PlacePicker } from '@/components/v1-ui/place-picker';
import type { PlaceValue } from '@/lib/place';
import { fixtureVenuePatch, fixtureVenueValue } from './fixture-venue-patch';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { useV1DeleteFixture, useV1UpdateFixture } from '@/hooks/use-v1-api';
import { useV1AssignTournamentSlot, useV1QuickResult } from '@/hooks/use-v1-bracket-canvas';
import { TEAM_IN_OTHER_GROUP_HIDDEN_NOTE, applyGroupRule, registrationIdsBlockedForGroup } from '@/lib/bracket-group-enrollment';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { classifyFixtureSide, fixtureTeamChangeAccess, isFixtureLocked, isSlotAssignable, type SideKey } from '@/lib/bracket-canvas-layout';
import { isoToKstDatetimeLocal, kstDatetimeLocalToIso } from '@/lib/kst-calendar';
import type {
  V1AdminBracketFixture,
  V1AdminBracketGroup,
  V1AdminBracketSlot,
  V1AdminTournamentRegistration,
} from '@/types/api';
import { fixtureTitle } from './bracket-canvas';
import { BracketQuickResultForm } from './bracket-quick-result-form';
import { BracketResultActions } from './bracket-result-actions';
import { useStartedTeamChangeReason } from './use-started-team-change-reason';

export type BracketNodePanelProps = {
  tournamentId: string;
  fixture: V1AdminBracketFixture;
  groups: V1AdminBracketGroup[];
  slots: V1AdminBracketSlot[];
  registrations: V1AdminTournamentRegistration[];
  /** 신청 목록이 아직 없거나 실패한 상태에서는 팀 선택창을 잠근다("팀 0개"처럼 보이지 않게). */
  registrationsLoaded: boolean;
  sideLabels: Record<SideKey, string>;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onClose: () => void;
};

const SIDE_NAME: Record<SideKey, string> = { HOME: '홈', AWAY: '어웨이' };

const DIRECT_SIDE_BLOCKED = {
  official: '공식 결과가 확정된 경기예요. 결과를 먼저 무효로 돌려 주세요.',
  cancelled: '취소된 경기는 팀을 바꿀 수 없어요.',
} as const;

export function BracketNodePanel({
  tournamentId,
  fixture,
  groups,
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
  const [scheduledAt, setScheduledAt] = useState(() => isoToKstDatetimeLocal(fixture.scheduledAt));
  const [venue, setVenue] = useState<PlaceValue | null>(fixtureVenueValue(fixture));
  const [quickError, setQuickError] = useState<string | null>(null);

  const title = fixtureTitle(fixture, groups);
  const locked = isFixtureLocked(fixture);
  const teamChangeAccess = fixtureTeamChangeAccess(fixture);
  const group = groups.find((candidate) => candidate.id === fixture.groupId);
  const isKnockout = group !== undefined && group.phase !== 'group';
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const confirmed = registrations.filter((registration) => registration.status === 'confirmed');
  const placedIds = new Set(slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map((slot) => slot.registrationId));
  const game = fixture.game;

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
    );
  };

  const slotCandidates = (slot: V1AdminBracketSlot) =>
    applyGroupRule(
      confirmed.filter((registration) => registration.id === slot.registrationId || !placedIds.has(registration.id)),
      (registration) => registration.id,
      registrationIdsBlockedForGroup(groups, slot.groupId),
      slot.registrationId,
    );

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
    if (source === 'direct') {
      const current = side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId;
      if (teamChangeAccess === 'official' || teamChangeAccess === 'cancelled') {
        body = (
          <div className="flex flex-col items-start gap-2">
            <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{DIRECT_SIDE_BLOCKED[teamChangeAccess]}</p>
            {teamChangeAccess === 'official' && canWrite ? (
              <Link href={correctionsHref} className="tm-btn tm-btn-sm tm-btn-outline">결과 정정 화면 열기</Link>
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

  const handleSaveSchedule = (event: FormEvent) => {
    event.preventDefault();
    const iso = scheduledAt === '' ? null : kstDatetimeLocalToIso(scheduledAt);
    if (scheduledAt !== '' && iso === null) {
      showToast('경기 시각을 다시 확인해 주세요.', 'error');
      return;
    }
    updateFixture.mutate(
      { fixtureId: fixture.id, ...(iso === null ? {} : { scheduledAt: iso }), ...fixtureVenuePatch(venue, fixture) },
      {
        onSuccess: () => showToast('일정을 저장했어요.', 'success'),
        onError: (error) => showToast(describeBracketCanvasError(error, '일정을 저장하지 못했어요.'), 'error'),
      },
    );
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: '경기 삭제',
      message: `${title}를 삭제할까요? 되돌릴 수 없어요.`,
      confirmLabel: '삭제',
      tone: 'danger',
    });
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
    if (revision !== null && revision.state !== 'VOID') {
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
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>라이브로 득점이 기록된 경기예요. 결과 정정 화면에서 처리해 주세요.</p>
          <Link href={correctionsHref} className="tm-btn tm-btn-sm tm-btn-outline">결과 정정 화면 열기</Link>
        </div>
      );
    }
    if (fixture.homeRegistrationId === null || fixture.awayRegistrationId === null) {
      return <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>양쪽 팀이 정해지면 점수를 넣을 수 있어요.</p>;
    }
    if (!canWrite) return null;
    return (
      <div className="flex flex-col gap-2">
        {revision !== null ? (
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>무효 처리된 결과예요. 점수를 다시 넣을 수 있어요.</p>
        ) : null}
        <BracketQuickResultForm
          homeLabel={sideLabels.HOME}
          awayLabel={sideLabels.AWAY}
          isKnockout={isKnockout}
          submitLabel="점수 확정"
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

  return (
    <aside
      aria-label="칸 상세"
      className="flex flex-col gap-5 p-4"
      style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="tm-text-body-lg min-w-0 truncate font-bold" style={{ color: 'var(--text-strong)' }}>{title}</h2>
        <button
          type="button"
          aria-label="패널 닫기"
          onClick={onClose}
          className="flex size-11 shrink-0 items-center justify-center transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          style={{ borderRadius: 'var(--radius-control)', color: 'var(--text-muted)' }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <section aria-label="팀 자리" className="flex flex-col gap-3">
        <h3 className={sectionTitle} style={{ color: 'var(--text-strong)' }}>팀 자리</h3>
        {renderSide('HOME')}
        {renderSide('AWAY')}
        {hidesOtherGroupTeams ? (
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{TEAM_IN_OTHER_GROUP_HIDDEN_NOTE}</p>
        ) : null}
      </section>

      <section aria-label="결과" className="flex flex-col gap-3">
        <h3 className={sectionTitle} style={{ color: 'var(--text-strong)' }}>결과</h3>
        {renderResult()}
      </section>

      <section aria-label="일정과 장소" className="flex flex-col gap-3">
        <h3 className={sectionTitle} style={{ color: 'var(--text-strong)' }}>일정과 장소</h3>
        {canWrite ? (
          <form onSubmit={handleSaveSchedule} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${fixture.id}-scheduled`} className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>경기 시각</label>
              <input id={`${fixture.id}-scheduled`} type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="tm-input" style={{ minHeight: 44 }} />
            </div>
            <PlacePicker
              id={`${fixture.id}-venue`}
              label="장소"
              value={venue}
              onChange={setVenue}
              disabled={updateFixture.isPending}
            />
            <Button type="submit" variant="outline" size="md" loading={updateFixture.isPending}>일정 저장</Button>
          </form>
        ) : (
          <p className="tm-text-label" style={{ color: 'var(--text-body)' }}>
            {`${fixture.scheduledAt === null ? '시간 미정' : isoToKstDatetimeLocal(fixture.scheduledAt).replace('T', ' ')} · ${fixture.venue ?? '장소 미정'}`}
          </p>
        )}
      </section>

      {canWrite ? (
        <Button type="button" variant="outline" size="md" className="self-start" style={{ color: 'var(--red700)' }} onClick={() => void handleDelete()}>
          경기 삭제
        </Button>
      ) : null}
      {ConfirmModal}
      {teamChangeDialog}
    </aside>
  );
}
