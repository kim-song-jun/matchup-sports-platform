'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useV1AssignTournamentSlot, useV1QuickResult } from '@/hooks/use-v1-bracket-canvas';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import type { LeagueBoardNode, LeagueBoardSide } from '@/lib/league-board-model';
import type { V1AdminBracketSlot, V1AdminTournamentRegistration } from '@/types/api';
import { BracketQuickResultForm } from './bracket-quick-result-form';
import { BracketResultActions } from './bracket-result-actions';
import { useLeagueResultToast } from './use-league-result-toast';

export interface LeagueFixturePanelProps {
  leagueId: string;
  node: LeagueBoardNode;
  slots: V1AdminBracketSlot[];
  registrations: V1AdminTournamentRegistration[];
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onEditSchedule: () => void;
  onCancelFixture: () => void;
  onClose: () => void;
}

const SIDE_NAME = { home: '홈', away: '원정' } as const;
const MUTED = { color: 'var(--text-muted)' } as const;

export function LeagueFixturePanel({
  leagueId,
  node,
  slots,
  registrations,
  canWrite,
  showToast,
  onEditSchedule,
  onCancelFixture,
  onClose,
}: LeagueFixturePanelProps) {
  const assignSlot = useV1AssignTournamentSlot(leagueId, 'league');
  const quickResult = useV1QuickResult(leagueId, 'league');
  const [quickError, setQuickError] = useState<string | null>(null);

  const game = node.game;
  // 서버 SLOT_LOCKED 와 같은 기준 — 게임이 예정이고 결과가 없을 때만 자리를 바꿀 수 있다.
  const locked = game !== null && (game.state !== 'SCHEDULED' || game.latestRevision !== null);
  const cancelled = node.state === 'cancelled';
  const confirmed = registrations.filter((registration) => registration.status === 'confirmed');
  const placedIds = new Set(
    slots.filter((slot) => slot.kind !== 'GROUP_RANK' && slot.registrationId !== null).map((slot) => slot.registrationId),
  );
  const bothTeamsSet = node.home.filled && node.away.filled;
  const correctionsHref = `/admin/live/${encodeURIComponent(leagueId)}/records/corrections?fixtureId=${encodeURIComponent(node.fixtureId)}`;
  const consoleHref = `/admin/live/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(node.fixtureId)}/operate`;

  // 정정·무효·확정 훅은 결과 검토 캐시만 비운다 — 리그 보드의 점수·상태는 여기서 다시 읽게 한다.
  const notifyResult = useLeagueResultToast(leagueId, showToast);

  const handleAssign = (slotId: string, value: string) => {
    const registrationId = value === '' ? null : value;
    assignSlot.mutate(
      { slotId, registrationId },
      {
        onSuccess: () => showToast(registrationId === null ? '자리를 비웠어요.' : '팀을 넣었어요.', 'success'),
        onError: (error) => showToast(describeBracketCanvasError(error, '팀을 넣지 못했어요.'), 'error'),
      },
    );
  };

  const renderSide = (sideKey: 'home' | 'away', side: LeagueBoardSide) => {
    let body: React.ReactNode;
    if (side.slotId === null) {
      body = <p className="tm-text-caption" style={MUTED}>자리 없이 만든 경기예요.</p>;
    } else if (locked || cancelled) {
      body = <p className="tm-text-caption" style={MUTED}>경기가 시작됐거나 결과가 있어 팀을 바꿀 수 없어요.</p>;
    } else if (!canWrite) {
      body = null;
    } else {
      const slotId = side.slotId;
      const options = confirmed.filter((registration) => !placedIds.has(registration.id) || registration.id === side.registrationId);
      body = (
        <select
          aria-label={`${SIDE_NAME[sideKey]} 팀 선택`}
          value={side.registrationId ?? ''}
          disabled={assignSlot.isPending}
          onChange={(event) => handleAssign(slotId, event.target.value)}
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
      <div key={sideKey} className="flex flex-col gap-1">
        <p className="tm-text-caption" style={MUTED}>{`${SIDE_NAME[sideKey]} · ${side.label}`}</p>
        {body}
      </div>
    );
  };

  const renderResult = () => {
    if (cancelled) return <p className="tm-text-caption" style={MUTED}>취소된 경기예요.</p>;
    if (game === null) return <p className="tm-text-caption" style={MUTED}>경기 정보가 아직 준비되지 않았어요.</p>;
    if (game.state === 'LIVE' || game.state === 'PAUSED') {
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="tm-text-caption" style={MUTED}>진행 중인 경기는 라이브 콘솔에서 입력해요.</p>
          <Link href={consoleHref} className="tm-btn tm-btn-sm tm-btn-outline">콘솔 열기</Link>
        </div>
      );
    }
    const revision = game.latestRevision;
    if (revision !== null && revision.state !== 'VOID') {
      return (
        <BracketResultActions
          tournamentId={leagueId}
          fixtureId={node.fixtureId}
          game={game}
          isKnockout={false}
          homeLabel={node.home.label}
          awayLabel={node.away.label}
          canWrite={canWrite}
          showToast={notifyResult}
        />
      );
    }
    if (game.hasLiveRecords) {
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="tm-text-caption" style={MUTED}>라이브로 득점이 기록된 경기예요. 결과 정정 화면에서 처리해 주세요.</p>
          <Link href={correctionsHref} className="tm-btn tm-btn-sm tm-btn-outline">결과 정정 화면 열기</Link>
        </div>
      );
    }
    if (!bothTeamsSet) return <p className="tm-text-caption" style={MUTED}>양쪽 팀이 정해지면 점수를 넣을 수 있어요.</p>;
    if (!canWrite) return null;
    return (
      <div className="flex flex-col gap-2">
        {revision !== null ? (
          <p className="tm-text-caption" style={MUTED}>무효 처리된 결과예요. 점수를 다시 넣을 수 있어요.</p>
        ) : null}
        <BracketQuickResultForm
          homeLabel={node.home.label}
          awayLabel={node.away.label}
          isKnockout={false}
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
      aria-label="경기 상세"
      className="flex flex-col gap-5 p-4"
      style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="tm-text-body-lg min-w-0 truncate font-bold" style={{ color: 'var(--text-strong)' }}>
          {`${node.home.label} vs ${node.away.label}`}
        </h2>
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
        {renderSide('home', node.home)}
        {renderSide('away', node.away)}
      </section>

      <section aria-label="결과" className="flex flex-col gap-3">
        <h3 className={sectionTitle} style={{ color: 'var(--text-strong)' }}>결과</h3>
        {renderResult()}
      </section>

      <section aria-label="일정과 장소" className="flex flex-col gap-3">
        <h3 className={sectionTitle} style={{ color: 'var(--text-strong)' }}>일정과 장소</h3>
        <p className="tm-text-label" style={{ color: 'var(--text-body)' }}>
          {`${formatKstDateShort(node.startAt)} ${formatKstTime(node.startAt)} · ${node.placeName}`}
        </p>
        {canWrite && !cancelled ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onEditSchedule} className="tm-btn tm-btn-sm tm-btn-outline" style={{ minHeight: 44 }}>
              일정 수정
            </button>
            {node.state !== 'live' ? (
              <button
                type="button"
                onClick={onCancelFixture}
                className="tm-btn tm-btn-sm tm-btn-outline"
                style={{ minHeight: 44, color: 'var(--red700)' }}
              >
                경기 취소
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </aside>
  );
}
