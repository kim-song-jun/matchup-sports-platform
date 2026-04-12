'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useCreateReport } from '@/hooks/use-api';

type ReportReason = 'spam' | 'abuse' | 'fraud' | 'other';

export interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** e.g. 'message', 'user', 'match' */
  targetType: string;
  targetId: string;
  targetName?: string;
}

const REASONS: ReportReason[] = ['spam', 'abuse', 'fraud', 'other'];

export function ReportModal({ isOpen, onClose, targetType, targetId, targetName }: ReportModalProps) {
  const t = useTranslations('report');
  const tc = useTranslations('common');
  const { toast } = useToast();
  const createReport = useCreateReport();

  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [validationError, setValidationError] = useState(false);

  const reasonLabelMap: Record<ReportReason, string> = {
    spam: t('reasonSpam'),
    abuse: t('reasonAbuse'),
    fraud: t('reasonFraud'),
    other: t('reasonOther'),
  };

  function handleClose() {
    setSelectedReason(null);
    setDetail('');
    setValidationError(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedReason) {
      setValidationError(true);
      return;
    }

    try {
      await createReport.mutateAsync({
        targetType,
        targetId,
        reason: selectedReason,
        detail: detail.trim() || undefined,
      });
      toast('success', t('successToast'));
      handleClose();
    } catch {
      toast('error', t('errorToast'));
    }
  }

  const title = targetName ? t('targetLabel', { name: targetName }) : t('title');

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="sm">
      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-5">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 mx-auto mb-4">
            <Flag size={22} className="text-red-500" aria-hidden="true" />
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {t('reasonLabel')}
            </legend>
            <div className="space-y-2">
              {REASONS.map((reason) => (
                <label
                  key={reason}
                  htmlFor={`report-reason-${reason}`}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 cursor-pointer min-h-[44px] transition-colors ${
                    selectedReason === reason
                      ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10 dark:border-blue-400'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <input
                    id={`report-reason-${reason}`}
                    type="radio"
                    name="report-reason"
                    value={reason}
                    checked={selectedReason === reason}
                    onChange={() => {
                      setSelectedReason(reason);
                      setValidationError(false);
                    }}
                    className="h-4 w-4 accent-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-200">
                    {reasonLabelMap[reason]}
                  </span>
                </label>
              ))}
            </div>
            {validationError && (
              <p role="alert" className="mt-2 text-xs text-red-500">
                {t('reasonRequired')}
              </p>
            )}
          </fieldset>
        </div>

        <div className="mb-6">
          <label
            htmlFor="report-detail"
            className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
          >
            {t('detailLabel')}
          </label>
          <Textarea
            id="report-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t('detailPlaceholder')}
            maxLength={500}
            rows={3}
            className="resize-none"
          />
          <p className="mt-1 text-right text-2xs text-gray-400 dark:text-gray-500">
            {detail.length}/500
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 py-2.5 text-base font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors min-h-[44px]"
          >
            {tc('cancel')}
          </button>
          <button
            type="submit"
            disabled={createReport.isPending}
            className="flex-1 rounded-xl bg-red-500 py-2.5 text-base font-semibold text-white hover:bg-red-600 active:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
          >
            {createReport.isPending ? t('submitting') : t('submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
