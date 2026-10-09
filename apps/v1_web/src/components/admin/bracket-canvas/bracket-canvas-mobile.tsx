'use client';

import { useCallback, useId, useState } from 'react';
import { Zap } from 'lucide-react';
import type { AdminToastVariant } from '@/components/admin';
import { AlertBanner, EmptyState } from '@/components/v1-ui/primitives';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { StatusChip } from '@/components/v1-ui/status-chip';
import {
  hasTeam,
  pickInitialRoundKey,
  sideDisplayName,
  type MobileNode,
  type MobilePickCandidate,
  type MobileRound,
  type MobileSide,
} from '@/lib/bracket-canvas-mobile-model';
import { bracketNodeStateChip } from '@/lib/competition-status';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import type { V1AdminBracketSlot } from '@/types/api';
import { MobileNodeSheetBody, type MobileSheetView } from './bracket-canvas-mobile-sheet';
import type { RegistrationsLoadState } from './bracket-team-tray';

export interface BracketCanvasMobileProps {
  competitionId: string;
  scope: 'tournament' | 'league';
  rounds: MobileRound[];
  slots: V1AdminBracketSlot[];
  candidates: MobilePickCandidate[];
  canWrite: boolean;
  registrationsState: RegistrationsLoadState;
  showToast: (message: string, variant?: AdminToastVariant) => void;
}

// 390 폭에서 탭 한 칸이 44px 터치 타깃과 3~4글자 라벨을 담을 수 있는 한계. 넘으면 셀렉트로 바꾼다.
const ROUND_TABS_MAX = 5;

const selectClass =
  'h-[44px] w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

function findNode(rounds: MobileRound[], fixtureId: string): MobileNode | null {
  for (const round of rounds) {
    for (const section of round.sections) {
      const hit = section.nodes.find((node) => node.fixtureId === fixtureId);
      if (hit) return hit;
    }
  }
  return null;
}

function whenText(node: MobileNode): string | null {
  const parts: string[] = [];
  if (node.scheduledAt) parts.push(`${formatKstDateShort(node.scheduledAt)} ${formatKstTime(node.scheduledAt)}`);
  if (node.venue) parts.push(node.venue);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function SideName({ side }: { side: MobileSide }) {
  return (
    <span
      className={`min-w-0 break-keep text-[length:var(--font-size-body-sm)] font-semibold ${hasTeam(side) ? 'text-[var(--text-strong)]' : 'text-[var(--text-muted)]'}`}
    >
      {sideDisplayName(side)}
    </span>
  );
}

function MobileNodeCard({ node, expanded, onOpen }: { node: MobileNode; expanded: boolean; onOpen: (fixtureId: string) => void }) {
  const when = whenText(node);
  return (
    <button
      type="button"
      onClick={() => onOpen(node.fixtureId)}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      className="flex min-h-[44px] w-full flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-3 text-left transition-colors hover:bg-[var(--grey50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)]"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">{node.title}</span>
        <StatusChip chip={bracketNodeStateChip(node.state)} />
      </span>
      <span className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <SideName side={node.home} />
        <span className="text-[length:var(--font-size-caption)] text-[var(--text-caption)]" aria-hidden="true">vs</span>
        <span className="text-right"><SideName side={node.away} /></span>
      </span>
      {node.scoreText ? (
        <span className="text-center text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">{node.scoreText}</span>
      ) : null}
      {when || node.quickEntered ? (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          {when ? <span>{when}</span> : null}
          {node.quickEntered ? (
            <span className="inline-flex items-center gap-1 font-semibold">
              <Zap size={12} aria-hidden="true" />
              어드민 빠른 입력
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

export function BracketCanvasMobile({ competitionId, scope, rounds, slots, candidates, canWrite, registrationsState, showToast }: BracketCanvasMobileProps) {
  const roundSelectId = useId();
  const [pickedRoundKey, setPickedRoundKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<MobileSheetView>({ kind: 'detail' });
  const closeSheet = useCallback(() => setSelectedId(null), []);
  // 다른 칸을 열 때 이전 칸의 팀 고르기 화면이 남지 않게 한다.
  const openNode = useCallback((fixtureId: string) => {
    setView({ kind: 'detail' });
    setSelectedId(fixtureId);
  }, []);

  const activeKey = rounds.some((round) => round.key === pickedRoundKey) ? pickedRoundKey : pickInitialRoundKey(rounds);
  const activeRound = rounds.find((round) => round.key === activeKey) ?? null;
  // 칸이 사라지면(템플릿 교체·새로고침) 시트도 함께 닫힌다 — 없는 경기의 폼을 붙들지 않는다.
  const selected = selectedId === null ? null : findNode(rounds, selectedId);

  if (rounds.length === 0) {
    return (
      <EmptyState
        title="아직 대진이 없어요"
        sub="대진을 만드는 건 큰 화면에서 해요. 만들어지면 여기서 팀을 넣고 결과를 입력할 수 있어요."
      />
    );
  }

  return (
    <section aria-label="대진 보기" className="flex flex-col gap-3">
      {canWrite ? (
        <AlertBanner tone="info" message="대진 구조는 큰 화면에서 편집해요. 여기서는 팀 넣기와 결과 입력을 할 수 있어요." />
      ) : null}

      {rounds.length <= ROUND_TABS_MAX ? (
        <SegmentedTabs
          role="tablist"
          ariaLabel="라운드"
          items={rounds.map((round) => ({ id: round.key, label: round.label }))}
          activeId={activeKey ?? ''}
          onSelect={setPickedRoundKey}
        />
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={roundSelectId} className="text-[length:var(--font-size-caption)] font-semibold text-[var(--text-muted)]">
            라운드
          </label>
          <select
            id={roundSelectId}
            className={selectClass}
            value={activeKey ?? ''}
            onChange={(event) => setPickedRoundKey(event.target.value)}
          >
            {rounds.map((round) => (
              <option key={round.key} value={round.key}>
                {round.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {activeRound ? (
        <div role="tabpanel" aria-label={activeRound.label} className="flex flex-col gap-4">
          {activeRound.sections.map((section) => (
            <section key={section.key} className="flex flex-col gap-2">
              {activeRound.sections.length > 1 && section.heading ? (
                <h3 className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">{section.heading}</h3>
              ) : null}
              <ul role="list" className="flex flex-col gap-2">
                {section.nodes.map((node) => (
                  <li key={node.fixtureId}>
                    <MobileNodeCard node={node} expanded={selectedId === node.fixtureId} onOpen={openNode} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      {selected ? (
        <BottomSheet open onClose={closeSheet} title={selected.title}>
          <MobileNodeSheetBody
            node={selected}
            competitionId={competitionId}
            scope={scope}
            canWrite={canWrite}
            slots={slots}
            candidates={candidates}
            registrationsState={registrationsState}
            showToast={showToast}
            view={view}
            onViewChange={setView}
            onDone={closeSheet}
          />
        </BottomSheet>
      ) : null}
    </section>
  );
}
