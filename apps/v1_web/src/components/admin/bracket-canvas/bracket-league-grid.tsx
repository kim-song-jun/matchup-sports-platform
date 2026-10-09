'use client';

import { Fragment, useMemo } from 'react';
import { buildLeagueGrid } from '@/lib/bracket-league-grid-model';
import { buildSideLabelContext, fixtureSideLabel, type SideKey } from '@/lib/bracket-canvas-layout';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketSlot } from '@/types/api';
import { fixtureTitle } from './bracket-canvas';
import { BracketCanvasNode } from './bracket-canvas-node';

const ROW_LABEL_WIDTH = 72;
// 1440 에서 트레이(240)+패널(320)을 빼고도 조 2개가 가로 스크롤 없이 들어가는 최소 폭. 조가 3개 이상이면 컨테이너 안에서만 스크롤한다.
const COLUMN_MIN_WIDTH = 176;

export type BracketLeagueGridProps = {
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

export function BracketLeagueGrid({
  groups, fixtures, slots, selectedFixtureId, pendingRegistrationId, canWrite, onSelectFixture, onAssignSlot, onAssignDirect,
}: BracketLeagueGridProps) {
  const grid = useMemo(() => buildLeagueGrid({ groups, fixtures }), [groups, fixtures]);
  const labelContext = useMemo(() => buildSideLabelContext(groups, fixtures, slots), [groups, fixtures, slots]);
  const slotsById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);

  return (
    <div
      role="region"
      aria-label="대진 그림"
      data-league-grid=""
      className="overflow-x-auto"
      style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-container)', background: 'var(--card-surface-muted)' }}
    >
      {grid.legacyChunking ? (
        <p className="tm-text-caption px-4 pt-3" style={{ color: 'var(--text-muted)' }}>
          라운드 정보가 없어 경기 번호 순서로 나눴어요.
        </p>
      ) : null}
      <div
        className="grid gap-3 p-4"
        style={{ gridTemplateColumns: `${ROW_LABEL_WIDTH}px repeat(${grid.columns.length}, minmax(${COLUMN_MIN_WIDTH}px, 1fr))` }}
      >
        <div aria-hidden="true" />
        {grid.columns.map((column) => (
          <h3 key={column.key} className="tm-text-caption-strong truncate">{column.label}</h3>
        ))}
        {grid.rows.map((row) => (
          <Fragment key={row.key}>
            <h4 className="tm-text-caption-strong pt-3">{row.label}</h4>
            {grid.columns.map((column) => {
              const cell = row.cells[column.key] ?? [];
              return (
                <div key={column.key} role="group" aria-label={`${row.label} ${column.label}`} className="flex min-w-0 flex-col gap-3">
                  {cell.length === 0 ? (
                    <p
                      className="tm-text-caption px-3 py-3 text-center"
                      style={{ color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-container)' }}
                    >
                      경기 없음
                    </p>
                  ) : (
                    cell.map((fixture) => (
                      <BracketCanvasNode
                        key={fixture.id}
                        fixture={fixture}
                        title={`${fixture.fixtureNumber}번 경기`}
                        fullTitle={fixtureTitle(fixture, groups)}
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
                    ))
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
