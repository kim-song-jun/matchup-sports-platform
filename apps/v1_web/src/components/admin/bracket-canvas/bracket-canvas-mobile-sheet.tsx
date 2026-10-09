'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { AdminToastVariant } from '@/components/admin';
import { StatusChip } from '@/components/v1-ui/status-chip';
import { useV1QuickResult } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { hasTeam, sideDisplayName, type MobileNode, type MobileSide } from '@/lib/bracket-canvas-mobile-model';
import { bracketNodeStateChip } from '@/lib/competition-status';
import { BracketQuickResultForm } from './bracket-quick-result-form';
import { BracketResultActions } from './bracket-result-actions';

export interface MobileNodeSheetBodyProps {
  node: MobileNode;
  competitionId: string;
  scope: 'tournament' | 'league';
  canWrite: boolean;
  showToast: (message: string, variant?: AdminToastVariant) => void;
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

function SideRow({ label, side }: { label: string; side: MobileSide }) {
  const note = !hasTeam(side) && side.source !== 'slot' ? SIDE_SOURCE_NOTE[side.source] : null;
  return (
    <li className="flex min-h-[44px] flex-col justify-center gap-0.5 rounded-xl bg-[var(--grey50)] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">{label}</span>
        <span
          className={`min-w-0 break-keep text-right text-[length:var(--font-size-body-sm)] font-semibold ${hasTeam(side) ? 'text-[var(--text-strong)]' : 'text-[var(--text-muted)]'}`}
        >
          {sideDisplayName(side)}
        </span>
      </div>
      {note ? <span className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{note}</span> : null}
    </li>
  );
}

function ResultSection({ node, competitionId, scope, canWrite, showToast, onDone }: MobileNodeSheetBodyProps) {
  // 폼은 제출 로직을 갖지 않는다(PR-3 계약) — 변이를 여기서 소유하고 폼의 onSubmit 으로 잇는다.
  const quickResult = useV1QuickResult(competitionId, scope);
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
        showToast={showToast}
      />
    </div>
  );
}

export function MobileNodeSheetBody(props: MobileNodeSheetBodyProps) {
  const { node } = props;
  return (
    <div className="flex flex-col gap-4 pb-1">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip chip={bracketNodeStateChip(node.state)} />
        {node.scoreText ? (
          <span className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">{node.scoreText}</span>
        ) : null}
      </div>
      <ul role="list" aria-label="참가팀" className="flex flex-col gap-2">
        <SideRow label="홈" side={node.home} />
        <SideRow label="어웨이" side={node.away} />
      </ul>
      <ResultSection {...props} />
    </div>
  );
}
