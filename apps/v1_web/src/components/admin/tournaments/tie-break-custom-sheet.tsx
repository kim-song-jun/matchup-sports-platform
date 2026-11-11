'use client';

import { useState } from 'react';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { Button } from '@/components/v1-ui/button';
import { TieBreakOrderEditor } from '@/components/admin/tournaments/tie-break-order-editor';
import type { V1TournamentTieBreakOrder } from '@/types/api';

type TieBreakCustomSheetProps = {
  open: boolean;
  /** 시트를 열 때의 순서. 열릴 때마다 이 값으로 초안을 새로 만든다. */
  initialOrder: V1TournamentTieBreakOrder;
  onCancel: () => void;
  onApply: (order: V1TournamentTieBreakOrder) => void;
  /** 저장 중이면 버튼을 잠근다(단계별 설정은 바로 저장한다). */
  busy?: boolean;
};

/** 「직접 정하기」 — 기존 위로/아래로 편집기를 바텀시트에 담는다. 대회 기본값과 단계별 설정이 함께 쓴다. */
export function TieBreakCustomSheet({ open, initialOrder, onCancel, onApply, busy = false }: TieBreakCustomSheetProps) {
  if (!open) return null;
  return (
    <BottomSheet open onClose={onCancel} title="직접 정하기">
      <SheetBody initialOrder={initialOrder} onCancel={onCancel} onApply={onApply} busy={busy} />
    </BottomSheet>
  );
}

function SheetBody({ initialOrder, onCancel, onApply, busy }: Omit<TieBreakCustomSheetProps, 'open'> & { busy: boolean }) {
  const [draft, setDraft] = useState<V1TournamentTieBreakOrder>(() => [...initialOrder]);
  return (
    <div className="grid gap-4 px-1 pb-2">
      <TieBreakOrderEditor order={draft} onChange={setDraft} disabled={busy} showHeading={false} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="neutral" block onClick={onCancel} disabled={busy}>취소</Button>
        <Button type="button" variant="primary" block onClick={() => onApply(draft)} disabled={busy}>이 순서로 정하기</Button>
      </div>
    </div>
  );
}
