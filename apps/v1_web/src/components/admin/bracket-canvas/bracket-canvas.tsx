'use client';

import { useId, useMemo } from 'react';
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
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketSlot, V1AdminTournamentRegistration, V1SixTeamBracket } from '@/types/api';
import { SixTeamAdminBracket } from './six-team-admin-bracket';
import { bracketTrackLabel } from '@/lib/bracket-track';
import { BracketCanvasNode } from './bracket-canvas-node';
import { BracketGroupBlock } from './bracket-group-block';

export type BracketCanvasProps = {
  sixTeamState?: V1SixTeamBracket | null;
  /** Full context preserves source labels and shared-slot locks in isolated diagrams. */
  labelGroups?: V1AdminBracketGroup[];
  labelFixtures?: V1AdminBracketFixture[];
  registrations?: readonly V1AdminTournamentRegistration[];
  groups: V1AdminBracketGroup[];
  fixtures: V1AdminBracketFixture[];
  slots: V1AdminBracketSlot[];
  selectedFixtureId: string | null;
  pendingRegistrationId: string | null;
  canWrite: boolean;
  onSelectFixture: (fixtureId: string) => void;
  onSelectBye?: (slotId: string) => void;
  onAssignSlot: (slotId: string, registrationId: string) => void;
  onAssignDirect: (fixtureId: string, side: SideKey, registrationId: string) => void;
};

export function fixtureTitle(fixture: V1AdminBracketFixture, groups: readonly V1AdminBracketGroup[]): string {
  if (fixture.displayTitle?.trim()) return fixture.displayTitle;
  const group = groups.find((candidate) => candidate.id === fixture.groupId);
  const groupName = group?.name ?? null;
  const trackLabel = bracketTrackLabel(group?.bracketTrack);
  const title = `${competitionMatchLabel({ groupName, round: fixture.round, legNumber: fixture.legNumber })} ${fixture.fixtureNumber}번 경기`;
  return trackLabel && !title.startsWith(trackLabel + ' · ') ? `${trackLabel} · ${title}` : title;
}

// 선 모양으로도 종류를 구분한다 — 색만으로 전달하지 않는다.
const EDGE_STYLE: Record<CanvasEdgeKind, { dash: string | undefined }> = {
  WINNER: { dash: undefined },
  LOSER: { dash: '6 4' },
  BYE: { dash: '2 3' },
  GROUP_RANK: { dash: '10 4 2 4' },
};

function SingleBracketCanvas({
  labelGroups,
  labelFixtures,
  sixTeamState,
  registrations,
  groups,
  fixtures,
  slots,
  selectedFixtureId,
  pendingRegistrationId,
  canWrite,
  onSelectFixture,
  onSelectBye,
  onAssignSlot,
  onAssignDirect,
}: BracketCanvasProps) {
  const layout = useMemo(() => buildCanvasLayout({ groups, fixtures, slots }), [groups, fixtures, slots]);
  const labelContext = useMemo(() => buildSideLabelContext(labelGroups ?? groups, labelFixtures ?? fixtures, slots), [labelGroups, labelFixtures, groups, fixtures, slots]);
  const fixturesById = useMemo(() => new Map(fixtures.map((fixture) => [fixture.id, fixture])), [fixtures]);
  const slotsById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  // A group-block slot is locked once any fixture using it has started (same rule as the server's SLOT_LOCKED);
  // pressing a slot without a picked team opens the lowest-numbered fixture that uses it.
  const { lockedSlotIds, firstFixtureBySlot } = useMemo(() => {
    const locked = new Set<string>();
    const first = new Map<string, string>();
    for (const fixture of [...(labelFixtures ?? fixtures)].sort((a, b) => a.fixtureNumber - b.fixtureNumber || a.legNumber - b.legNumber)) {
      for (const slotId of [fixture.homeSlotId, fixture.awaySlotId]) {
        if (slotId === null) continue;
        if (!first.has(slotId)) first.set(slotId, fixture.id);
        if (isFixtureLocked(fixture)) locked.add(slotId);
      }
    }
    return { lockedSlotIds: locked, firstFixtureBySlot: first };
  }, [fixtures, labelFixtures]);
  const hasBracketEdges = layout.edges.some((edge) => edge.kind !== 'GROUP_RANK');
  const hasRankEdges = layout.edges.some((edge) => edge.kind === 'GROUP_RANK');

  if (sixTeamState) return <SixTeamAdminBracket state={sixTeamState} fixtures={fixtures} groups={groups} registrations={registrations} renderFixture={(fixture, labels) => <BracketCanvasNode
    fixture={fixture}
    title={`${fixture.fixtureNumber}번 경기`}
    fullTitle={fixtureTitle(fixture, labelGroups ?? groups)}
    sideLabels={labels ?? { HOME: fixtureSideLabel(fixture, 'HOME', labelContext), AWAY: fixtureSideLabel(fixture, 'AWAY', labelContext) }}
    slots={{ HOME: fixture.homeSlotId ? slotsById.get(fixture.homeSlotId) ?? null : null, AWAY: fixture.awaySlotId ? slotsById.get(fixture.awaySlotId) ?? null : null }}
    selected={fixture.id === selectedFixtureId}
    canWrite={canWrite}
    pendingRegistrationId={pendingRegistrationId}
    onSelect={onSelectFixture}
    onAssign={onAssignSlot}
    onAssignDirect={onAssignDirect}
  />} />;
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
        {layout.byeNodes.map(position => {
          const slot = slotsById.get(position.slotId);
          if (!slot) return null;
          return <button key={slot.id} type="button" aria-label={`부전승 ${slot.teamName ?? slot.label} 편집`} onClick={() => onSelectBye ? onSelectBye(slot.id) : onSelectFixture(position.fixtureId)} className="tm-on-tint absolute flex flex-col justify-center gap-1 rounded-2xl border border-[var(--border-strong)] bg-[var(--card-surface)] p-3 text-left focus-visible:outline-2 focus-visible:outline-blue-500" style={{ left: position.x, top: position.y, width: position.width, height: position.height, background: slot.registrationId !== null ? 'var(--blue50)' : undefined }}>
            <span className="tm-text-caption text-[var(--text-muted)]">부전승</span><span className="tm-text-label truncate font-semibold">{slot.teamName ?? slot.label}</span>
          </button>;
        })}
        {layout.nodes.map((position) => {
          const fixture = fixturesById.get(position.fixtureId);
          if (fixture === undefined) return null;
          return (
            <BracketCanvasNode
              key={fixture.id}
              fixture={fixture}
              position={position}
              title={fixtureTitle(fixture, labelGroups ?? groups)}
              sideLabels={{ HOME: fixtureSideLabel(fixture, 'HOME', labelContext), AWAY: fixtureSideLabel(fixture, 'AWAY', labelContext) }}
              slots={{
                HOME: fixture.homeSlotId === null ? null : (slotsById.get(fixture.homeSlotId) ?? null),
                AWAY: fixture.awaySlotId === null ? null : (slotsById.get(fixture.awaySlotId) ?? null),
              }}
              selected={fixture.id === selectedFixtureId}
              canWrite={canWrite && !groups.some(group => group.id === fixture.groupId && group.bracketTrack && !['overall', 'upper', 'lower'].includes(group.bracketTrack))}
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
            hasSplitQualification={slots.some((slot) => {
              return slot.kind === 'GROUP_RANK'
                && slot.sourceGroupId === block.groupId
                && slot.bracketTrack === 'lower';
            })}
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

/** Named finals have independent geometry: no cross-tournament lines or shared vertical origin. */
export function BracketCanvas(props: BracketCanvasProps) {
  const sectionId = useId();
  const tracks = [...new Set([...props.groups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(group => group.phase !== 'group' && group.bracketTrack && !['overall', 'upper', 'lower'].includes(group.bracketTrack))
    .map(group => group.bracketTrack!))];
  if (props.sixTeamState || tracks.length === 0) return <SingleBracketCanvas {...props} />;
  const namedGroupIds = new Set(props.groups.filter(group => group.phase !== 'group' && tracks.includes(group.bracketTrack ?? '')).map(group => group.id));
  const sections = [
    { name: '예선·기타 대진', groups: props.groups.filter(group => !namedGroupIds.has(group.id)), fixtures: props.fixtures.filter(fixture => !fixture.groupId || !namedGroupIds.has(fixture.groupId)), preliminary: true },
    ...tracks.map(track => {
      const groups = props.groups.filter(group => group.phase !== 'group' && group.bracketTrack === track);
      const ids = new Set(groups.map(group => group.id));
      return { name: track, groups, fixtures: props.fixtures.filter(fixture => fixture.groupId && ids.has(fixture.groupId)), preliminary: false };
    }),
  ].filter(section => section.groups.length || section.fixtures.length).map(section => ({ ...section, name: section.preliminary && section.groups.every(group => group.phase === 'group') && section.fixtures.every(fixture => section.groups.some(group => group.id === fixture.groupId && group.phase === 'group')) ? '예선 조별리그' : section.name }));
  return <div className="min-w-0 space-y-6">
    <nav aria-label="토너먼트 그림 바로가기" className="tm-bracket-filter-scroll">
      {sections.map((section, index) => <button key={(section.preliminary ? 'preliminary:' : 'final:')+section.name} type="button" className="tm-chip" aria-controls={sectionId+'-'+index} onClick={() => {
        const target = document.getElementById(sectionId+'-'+index);
        if (target instanceof HTMLDetailsElement) {
          target.open = true;
          target.querySelector('summary')?.focus({ preventScroll: true });
        }
        target?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
      }}>{section.name}</button>)}
    </nav>
    {sections.map((section, index) => {
      const ids = new Set(section.groups.map(group => group.id));
      const fixtureSlotIds = new Set(section.fixtures.flatMap(fixture => [fixture.homeSlotId, fixture.awaySlotId]));
      const slots = section.preliminary ? props.slots : props.slots.filter(slot => (slot.groupId !== null && ids.has(slot.groupId)) || fixtureSlotIds.has(slot.id));
      const colorIndex = section.groups.find(group => group.bracketColorIndex !== undefined)?.bracketColorIndex;
      const name = section.name;
      return <details key={(section.preliminary ? 'preliminary:' : 'final:')+section.name} id={sectionId+'-'+index} open className="tm-admin-final-section">
        <summary className="tm-admin-final-summary">
          <span>{colorIndex !== undefined ? <span aria-hidden="true" className={'tm-bracket-filter-dot tm-final-color-'+(colorIndex % 10)} /> : null}{name}</span>
          <span className="tm-text-caption text-[var(--text-muted)]">{section.fixtures.length}경기 · 접기/펼치기</span>
        </summary>
        <SingleBracketCanvas {...props} sixTeamState={null} labelGroups={props.groups} labelFixtures={props.fixtures} groups={section.groups} fixtures={section.fixtures} slots={slots} />
      </details>;
    })}
  </div>;
}
