'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  useV1AdminTournamentPopups,
  useV1CreateTournamentPopup,
  useV1DeleteTournamentPopup,
  useV1UpdateTournamentPopup,
} from '@/hooks/use-v1-api';
import { AdminDataTable, AdminEmpty } from '@/components/admin';
import { extractErrorMessage } from '@/lib/error-message';
import { TournamentPopupForm } from './tournament-popup-form';
import {
  emptyPopupForm,
  formFromPopup,
  popupPayloadFromForm,
  type PopupForm,
} from './tournament-popup-admin-model';
import type { V1AdminTournamentPopup } from '@/types/api';

const STATUS_LABEL: Record<V1AdminTournamentPopup['status'], string> = {
  draft: '초안',
  published: '발행 중',
  archived: '보관',
};

export function TournamentPopupTab({
  tournamentId,
  showToast,
}: {
  tournamentId: string;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const [form, setForm] = useState<PopupForm>(emptyPopupForm);
  const [editingPopupId, setEditingPopupId] = useState<string | null>(null);
  const { data, isPending, isError, error, refetch } = useV1AdminTournamentPopups(tournamentId);
  const createPopup = useV1CreateTournamentPopup(tournamentId);
  const updatePopup = useV1UpdateTournamentPopup(tournamentId);
  const deletePopup = useV1DeleteTournamentPopup(tournamentId);
  const popups = data?.items ?? [];
  const formMode = editingPopupId ? 'update' : 'create';
  const formPending = createPopup.isPending || updatePopup.isPending;

  const setField = <K extends keyof PopupForm>(field: K, value: PopupForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptyPopupForm);
    setEditingPopupId(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;

    if (editingPopupId) {
      updatePopup.mutate(
        { popupId: editingPopupId, body: popupPayloadFromForm(form) },
        {
          onSuccess: () => {
            resetForm();
            showToast('팝업을 수정했어요.', 'success');
          },
          onError: (err) => showToast(extractErrorMessage(err, '팝업을 수정하지 못했어요.'), 'error'),
        },
      );
      return;
    }

    createPopup.mutate(popupPayloadFromForm(form), {
      onSuccess: () => {
        resetForm();
        showToast('팝업을 추가했어요.', 'success');
      },
      onError: (err) => showToast(extractErrorMessage(err, '팝업을 추가하지 못했어요.'), 'error'),
    });
  };

  const startEdit = (popup: V1AdminTournamentPopup) => {
    setForm(formFromPopup(popup));
    setEditingPopupId(popup.id);
  };

  const handleDelete = (popup: V1AdminTournamentPopup) => {
    const confirmed = window.confirm(`"${popup.title}" 팝업을 삭제할까요? 삭제한 팝업은 복구할 수 없어요.`);
    if (!confirmed) return;
    deletePopup.mutate(popup.id, {
      onSuccess: () => {
        if (editingPopupId === popup.id) resetForm();
        showToast('팝업을 삭제했어요.', 'success');
      },
      onError: (err) => showToast(extractErrorMessage(err, '팝업을 삭제하지 못했어요.'), 'error'),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <TournamentPopupForm
        form={form}
        mode={formMode}
        pending={formPending}
        setField={setField}
        onSubmit={handleSubmit}
        onCancel={editingPopupId ? resetForm : undefined}
      />

      {(isPending || isError) && (
        <AdminDataTable
          columns={[]}
          rows={[]}
          keyExtractor={() => ''}
          loading={isPending}
          error={isError ? extractErrorMessage(error, '팝업 목록을 불러오지 못했어요.') : undefined}
          onRetry={() => void refetch()}
        />
      )}

      {!isPending && !isError && popups.length === 0 && (
        <AdminEmpty title="등록된 팝업이 없어요" description="대회 상세 페이지에 노출할 공지·홍보 팝업을 추가해 주세요." />
      )}

      {!isPending && !isError && popups.length > 0 && (
        <div className="flex flex-col gap-3">
          {popups.map((popup) => (
            <div key={popup.id} className="rounded-2xl border border-gray-100 bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-gray-900 truncate">{popup.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {STATUS_LABEL[popup.status]}
                    {popup.displayStartAt || popup.displayEndAt
                      ? ` · ${popup.displayStartAt ?? '제한 없음'} ~ ${popup.displayEndAt ?? '제한 없음'}`
                      : ' · 노출 기간 제한 없음'}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                {popup.body}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(popup)}
                  className={[
                    'min-h-[44px] rounded-lg bg-gray-100 px-3 text-xs font-semibold text-gray-700',
                    'transition-colors hover:bg-gray-200',
                  ].join(' ')}
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(popup)}
                  disabled={deletePopup.isPending}
                  className={[
                    'min-h-[44px] rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-600',
                    'transition-colors hover:bg-red-100 disabled:opacity-50',
                  ].join(' ')}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
