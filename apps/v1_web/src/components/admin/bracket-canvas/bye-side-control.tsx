'use client';

import { useV1SetByeSide } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { isFixtureLocked } from '@/lib/bracket-canvas-layout';
import type { V1AdminBracketFixture, V1AdminBracketSlot } from '@/types/api';

type Props = {
  tournamentId: string;
  fixture: V1AdminBracketFixture;
  selectedSlotId?: string;
  fixtures?: readonly V1AdminBracketFixture[];
  slots: readonly V1AdminBracketSlot[];
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onSaved?: () => void;
};

export function ByeSideControl(props: Props) {
  const { fixture, slots } = props;
  const slot = slots.find((row) => (!props.selectedSlotId || row.id === props.selectedSlotId) && (row.kind === 'BYE' || row.byeSortOrder != null) && (row.id === fixture.homeSlotId || row.id === fixture.awaySlotId));
  if (!slot || (!props.fixtures && fixture.bracketSources?.length !== 1)) return null;
  return <ConnectedByeSideControl {...props} slot={slot} />;
}

function ConnectedByeSideControl({ tournamentId, fixture, slot, fixtures, slots, canWrite, showToast, onSaved }: Props & { slot: V1AdminBracketSlot }) {
  const mutation = useV1SetByeSide(tournamentId);
  const current = fixture.homeSlotId === slot.id ? 'HOME' : 'AWAY';
  const locked = isFixtureLocked(fixture) || fixture.game?.hasLiveRecords ||
    (fixture.game?.latestRevision != null && fixture.game.latestRevision.state !== 'VOID');
  const destinations = (fixtures ?? []).filter(row => (row.id !== fixture.id || fixture.bracketSources?.length !== 1) && row.groupId === fixture.groupId && !isFixtureLocked(row))
    .flatMap(row => (['HOME', 'AWAY'] as const).flatMap(side => {
      if (row.id === fixture.id && side === current) return [];
      const id = side === 'HOME' ? row.homeSlotId : row.awaySlotId;
      const peer = slots.find(item => item.id === id && item.groupId === slot.groupId && item.byeSortOrder != null);
      const feeder = row.bracketSources?.find(source => source.side === side && source.outcome === 'WINNER');
      const team = side === 'HOME' ? row.homeRegistrationId : row.awayRegistrationId;
      const direct = !id && !row.bracketSources?.some(source => source.side === side);
      const origin = peer?.id ?? feeder?.fixtureId ?? (direct ? team ?? row.id : null);
      return origin ? [{ value: row.id + side, row, side, origin }] : [];
    }));
  return (
    <label className="flex flex-col gap-2 tm-text-label">
      부전승 위치
      <select aria-label="부전승 위치" className="tm-input min-h-[44px]" value={current}
        disabled={!canWrite || locked || mutation.isPending}
        onChange={(event) => {
          const destination = destinations.find(choice => choice.value === event.target.value);
          if (destination) {
            mutation.mutate({ slotId: slot.id, sourceFixtureId: fixture.id, targetFixtureId: destination.row.id,
              side: destination.side, expectedSide: current, expectedOrigin: destination.origin }, {
              onSuccess: () => { showToast('부전승 위치를 옮겼어요.', 'success'); onSaved?.(); },
              onError: error => showToast(describeBracketCanvasError(error, '부전승 위치를 옮기지 못했어요.'), 'error'),
            });
            return;
          }
          const side = event.target.value === 'HOME' ? 'HOME' : 'AWAY';
          if (side === current) return;
          mutation.mutate({ slotId: slot.id, side, expectedSide: current }, {
            onSuccess: () => { showToast('부전승 위치와 승자 진출 자리를 함께 바꿨어요.', 'success'); onSaved?.(); },
            onError: (error) => showToast(describeBracketCanvasError(error, '부전승 위치를 바꾸지 못했어요.'), 'error'),
          });
        }}>
        <option disabled={current !== 'HOME' && fixture.bracketSources?.length !== 1} value="HOME">홈 · 위</option>
        <option disabled={current !== 'AWAY' && fixture.bracketSources?.length !== 1} value="AWAY">어웨이 · 아래</option>
        {destinations.map(choice => <option key={choice.value} value={choice.value}>
          {choice.row.fixtureNumber}번 경기 · {choice.side === 'HOME' ? '홈' : '어웨이'}와 교환
        </option>)}
      </select>
      <span className="tm-text-caption text-[var(--text-muted)]" role={mutation.isPending ? 'status' : undefined}>
        {mutation.isPending ? '위치와 진출 연결을 저장하고 있어요.' : locked
          ? '경기가 시작됐거나 기록이 있어 위치를 바꿀 수 없어요.'
          : '선택한 자리와 팀·진출 연결을 함께 교환해요.'}
      </span>
    </label>
  );
}
