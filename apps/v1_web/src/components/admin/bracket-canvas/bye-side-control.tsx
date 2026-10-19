'use client';

import { useV1SetByeSide } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { isFixtureLocked } from '@/lib/bracket-canvas-layout';
import type { V1AdminBracketFixture, V1AdminBracketSlot } from '@/types/api';

type Props = {
  tournamentId: string;
  fixture: V1AdminBracketFixture;
  slots: readonly V1AdminBracketSlot[];
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onSaved?: () => void;
};

export function ByeSideControl(props: Props) {
  const { fixture, slots } = props;
  const slot = slots.find((row) => row.kind === 'BYE' && (row.id === fixture.homeSlotId || row.id === fixture.awaySlotId));
  if (!slot || fixture.bracketSources?.length !== 1) return null;
  return <ConnectedByeSideControl {...props} slot={slot} />;
}

function ConnectedByeSideControl({ tournamentId, fixture, slot, canWrite, showToast, onSaved }: Props & { slot: V1AdminBracketSlot }) {
  const mutation = useV1SetByeSide(tournamentId);
  const current = fixture.homeSlotId === slot.id ? 'HOME' : 'AWAY';
  const locked = isFixtureLocked(fixture) || fixture.game?.hasLiveRecords ||
    (fixture.game?.latestRevision != null && fixture.game.latestRevision.state !== 'VOID');
  return (
    <label className="flex flex-col gap-2 tm-text-label">
      부전승 위치
      <select aria-label="부전승 위치" className="tm-input min-h-[44px]" value={current}
        disabled={!canWrite || locked || mutation.isPending}
        onChange={(event) => {
          const side = event.target.value === 'HOME' ? 'HOME' : 'AWAY';
          if (side === current) return;
          mutation.mutate({ slotId: slot.id, side, expectedSide: current }, {
            onSuccess: () => { showToast('부전승 위치와 승자 진출 자리를 함께 바꿨어요.', 'success'); onSaved?.(); },
            onError: (error) => showToast(describeBracketCanvasError(error, '부전승 위치를 바꾸지 못했어요.'), 'error'),
          });
        }}>
        <option value="HOME">홈 · 위</option>
        <option value="AWAY">어웨이 · 아래</option>
      </select>
      <span className="tm-text-caption text-[var(--text-muted)]" role={mutation.isPending ? 'status' : undefined}>
        {mutation.isPending ? '위치와 진출 연결을 저장하고 있어요.' : locked
          ? '경기가 시작됐거나 기록이 있어 위치를 바꿀 수 없어요.'
          : '선택하면 같은 상대를 유지하며 승자 자리와 위아래를 교환해요. 그림과 목록에 함께 반영돼요.'}
      </span>
    </label>
  );
}
