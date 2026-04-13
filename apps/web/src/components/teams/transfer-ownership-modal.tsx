'use client';

import { useState } from 'react';
import { Crown, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useTransferTeamOwnership } from '@/hooks/use-api';
import { useToast } from '@/components/ui/toast';

interface TransferOwnershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  targetUser: {
    userId: string;
    nickname: string;
  };
}

type DemoteOption = 'manager' | 'member';

/**
 * Confirmation modal for transferring team ownership to another member.
 * Only visible to the current owner. Calls POST /teams/:id/transfer-ownership.
 */
export function TransferOwnershipModal({
  isOpen,
  onClose,
  teamId,
  targetUser,
}: TransferOwnershipModalProps) {
  const { toast } = useToast();
  const transferMutation = useTransferTeamOwnership();
  const [demoteTo, setDemoteTo] = useState<DemoteOption>('manager');

  function handleConfirm() {
    transferMutation.mutate(
      { teamId, toUserId: targetUser.userId, demoteTo },
      {
        onSuccess: () => {
          toast('success', `${targetUser.nickname}님에게 팀장 권한이 이전되었어요`);
          onClose();
        },
        onError: () => {
          toast('error', '소유권 이전에 실패했어요. 다시 시도해주세요');
        },
      },
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="팀 소유권 양도">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 mx-auto mb-4">
        <Crown size={24} className="text-amber-500" />
      </div>

      <p className="text-base text-gray-700 dark:text-gray-200 text-center mb-1">
        <span className="font-bold">{targetUser.nickname}</span>님에게 팀장 권한을 이전할게요
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">
        이 작업은 되돌릴 수 없어요
      </p>

      {/* Demotion choice */}
      <fieldset className="mb-5">
        <legend className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          이전 후 내 역할
        </legend>
        <div className="space-y-2">
          <label
            htmlFor="demote-manager"
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
              demoteTo === 'manager'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <input
              id="demote-manager"
              type="radio"
              name="demoteTo"
              value="manager"
              checked={demoteTo === 'manager'}
              onChange={() => setDemoteTo('manager')}
              className="accent-blue-500"
            />
            <div>
              <span className="text-base font-medium text-gray-800 dark:text-gray-100">운영자</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">멤버 초대 및 역할 변경 가능</p>
            </div>
          </label>
          <label
            htmlFor="demote-member"
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
              demoteTo === 'member'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <input
              id="demote-member"
              type="radio"
              name="demoteTo"
              value="member"
              checked={demoteTo === 'member'}
              onChange={() => setDemoteTo('member')}
              className="accent-blue-500"
            />
            <div>
              <span className="text-base font-medium text-gray-800 dark:text-gray-100">일반 멤버</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">일반 참여만 가능</p>
            </div>
          </label>
        </div>
      </fieldset>

      {/* Warning */}
      <div className="flex items-start gap-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-3 mb-5">
        <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-red-600 dark:text-red-400">
          소유권 이전 후 팀 삭제, 멤버 추방 등 팀장 전용 기능을 사용할 수 없게 돼요.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          disabled={transferMutation.isPending}
          className="flex-1 rounded-xl bg-gray-100 dark:bg-gray-700 py-3 text-base font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          돌아가기
        </button>
        <button
          onClick={handleConfirm}
          disabled={transferMutation.isPending}
          className="flex-1 rounded-xl bg-red-500 py-3 text-base font-bold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          {transferMutation.isPending ? '처리 중...' : '소유권 양도하기'}
        </button>
      </div>
    </Modal>
  );
}
