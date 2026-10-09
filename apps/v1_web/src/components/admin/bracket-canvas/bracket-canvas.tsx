'use client';

import { useMemo } from 'react';
import {
  CANVAS_PADDING,
  buildCanvasLayout,
  buildSideLabelContext,
  fixtureSideLabel,
  isFixtureLocked,
  type CanvasEdgeKind,
  type SideKey,
} from '@/lib/bracket-canvas-layout';
import { competitionMatchLabel } from '@/lib/tournament-round-label';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketSlot } from '@/types/api';
import { BracketCanvasNode } from './bracket-canvas-node';
import { BracketGroupBlock } from './bracket-group-block';

export type BracketCanvasProps = {
  groups: V1AdminBracketGroup[];
  fixtures: V1AdminBracketFixture[];
  slots: V1AdminBracketSlot[];
  selectedFixtureId: string | null;
  pendingRegistrationId: string | null;
  canWrite: boolean;
  onSelectFixture: (fixtureId: string) => void;
  onAssignSlot: (slotId: string, registrationId: string) => void;
  onAssignDirect: (fixtureId: string, side: SideKey, registrationId: string) => void;
};

export function fixtureTitle(fixture: V1AdminBracketFixture, groups: readonly V1AdminBracketGroup[]): string {
  const groupName = groups.find((group) => group.id === fixture.groupId)?.name ?? null;
  return `${competitionMatchLabel({ groupName, round: fixture.round, legNumber: fixture.legNumber })} ${fixture.fixtureNumber}번 경기`;
}

// 선 모양으로도 종류를 구분한다 — 색만으로 전달하지 않는다.
const EDGE_STYLE: Record<CanvasEdgeKind, { dash: string | undefined }> = {
  WINNER: { dash: undefined },
  LOSER: { dash: '6 4' },
  BYE: { dash: '2 3' },
  GROUP_RANK: { dash: '10 4 2 4' },
};

export function BracketCanvas({
  groups,
  fixtures,
  slots,
  selectedFixtureId,
  pendingRegistrationId,
  canWrite,
  onSelectFixture,
  onAssignSlot,
  onAssignDirect,
}: BracketCanvasProps) {
  const layout = useMemo(() => buildCanvasLayout({ groups, fixtures, slots }), [groups, fixtures, slots]);
  const labelContext = useMemo(() => buildSideLabelContext(groups, fixtures, slots), [groups, fixtures, slots]);
  const fixturesById = useMemo(() => new Map(fixtures.map((fixture) => [fixture.id, fixture])), [fixtures]);
  const slotsById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  // A group-block slot is locked once any fixture using it has started (same rule as the server's SLOT_LOCKED);
  // pressing a slot without a picked team opens the lowest-numbered fixture that uses it.
  const { lockedSlotIds, firstFixtureBySlot } = useMemo(() => {
    const locked = new Set<string>();
    const first = new Map<string, string>();
    for (const fixture of [...fixtures].sort((a, b) => a.fixtureNumber - b.fixtureNumber || a.legNumber - b.legNumber)) {
      for (const slotId of [fixture.homeSlotId, fixture.awaySlotId]) {
        if (slotId === null) continue;
        if (!first.has(slotId)) first.set(slotId, fixture.id);
        if (isFixtureLocked(fixture)) locked.add(slotId);
      }
    }
    return { lockedSlotIds: locked, firstFixtureBySlot: first };
  }, [fixtures]);
  const hasBracketEdges = layout.edges.some((edge) => edge.kind !== 'GROUP_RANK');
  const hasRankEdges = layout.edges.some((edge) => edge.kind === 'GROUP_RANK');

  return (
    <div
      role="region"
      aria-label="대진 그림"
      className="overflow-auto"
      style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface-muted)' }}
    >
      <div style={{ position: 'relative', width: layout.width, height: layout.height }}>
        {layout.columns.map((column) => (
          <h3
            key={column.key}
            className="tm-text-caption-strong absolute"
            style={{ left: column.x, top: CANVAS_PADDING, width: column.width }}
          >
            {column.label}
          </h3>
        ))}
        <svg aria-hidden="true" width={layout.width} height={layout.height} className="pointer-events-none absolute left-0 top-0">
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.path}
              fill="none"
              stroke="var(--grey500)"
              strokeWidth={2}
              strokeDasharray={EDGE_STYLE[edge.kind].dash}
            />
          ))}
        </svg>
        {layout.nodes.map((position) => {
          const fixture = fixturesById.get(position.fixtureId);
          if (fixture === undefined) return null;
          return (
            <BracketCanvasNode
              key={fixture.id}
              fixture={fixture}
              position={position}
              title={fixtureTitle(fixture, groups)}
              sideLabels={{ HOME: fixtureSideLabel(fixture, 'HOME', labelContext), AWAY: fixtureSideLabel(fixture, 'AWAY', labelContext) }}
              slots={{
                HOME: fixture.homeSlotId === null ? null : (slotsById.get(fixture.homeSlotId) ?? null),
                AWAY: fixture.awaySlotId === null ? null : (slotsById.get(fixture.awaySlotId) ?? null),
              }}
              selected={fixture.id === selectedFixtureId}
              canWrite={canWrite}
              pendingRegistrationId={pendingRegistrationId}
              onSelect={onSelectFixture}
              onAssign={onAssignSlot}
              onAssignDirect={onAssignDirect}
            />
          );
        })}
        {layout.groupBlocks.map((block) => (
          <BracketGroupBlock
            key={block.groupId}
            block={block}
            canWrite={canWrite}
            lockedSlotIds={lockedSlotIds}
            pendingRegistrationId={pendingRegistrationId}
            onPlace={onAssignSlot}
            onOpenSlot={(slotId) => {
              const fixtureId = firstFixtureBySlot.get(slotId);
              if (fixtureId !== undefined) onSelectFixture(fixtureId);
            }}
          />
        ))}
      </div>
      {hasBracketEdges ? (
        <p className="tm-text-caption px-4 pb-3" style={{ color: 'var(--text-muted)' }}>
          실선은 승자, 점선은 패자가 가는 곳이에요.
        </p>
      ) : null}
      {hasRankEdges ? (
        <p className="tm-text-caption px-4 pb-3" style={{ color: 'var(--text-muted)' }}>
          선과 점이 번갈아 나오는 점선은 조 순위로 올라오는 곳이에요.
        </p>
      ) : null}
    </div>
  );
}
