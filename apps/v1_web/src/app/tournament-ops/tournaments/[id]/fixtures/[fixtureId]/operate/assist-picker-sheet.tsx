'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/v1-ui/button';
import { extractErrorMessage } from '@/lib/error-message';
import type { GameEventRecord, GameLineupParticipant } from '@/types/game-operations';

export interface AssistPickerSheetProps {
  readonly open: boolean;
  readonly event: GameEventRecord;
  readonly scorerName: string;
  readonly teammates: readonly GameLineupParticipant[];
  readonly onAttach: (assistParticipantId: string) => Promise<void>;
  readonly onClose: () => void;
}

/**
 * event-capture-modal.tsx의 예전 assist step과 동일한 시각 언어를 재사용하되,
 * "이미 확정된 GOAL을 되돌리고 어시스트를 넣어 재기록한다"는 두 단계 조작을
 * 사용자에게는 한 번의 선택으로 보여준다.
 */
export function AssistPickerSheet({ open, event, scorerName, teammates, onAttach, onClose }: AssistPickerSheetProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  const pick = async (teammate: GameLineupParticipant) => {
    setPending(teammate.id);
    setError(null);
    try {
      await onAttach(teammate.id);
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, '어시스트를 추가하지 못했어요. 다시 시도해주세요.'));
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assist-picker-title"
        className="w-full max-w-[440px] rounded-t-2xl bg-white p-5 sm:rounded-2xl dark:bg-gray-800"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="assist-picker-title" className="text-base font-bold text-gray-900 dark:text-white">
            {scorerName}의 골, 어시스트한 선수는?
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {error ? (
          <p role="alert" className="mb-2 text-2xs font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto" role="list">
          {teammates.map((teammate) => (
            <Button
              key={teammate.id}
              size="md"
              variant="outline"
              loading={pending === teammate.id}
              disabled={pending !== null}
              onClick={() => pick(teammate)}
            >
              <span className="tabular-nums text-gray-400">{teammate.jerseyNumber ?? '-'}</span>
              {teammate.displayNameSnapshot}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
