'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  useV1AdminTournamentSponsors,
  useV1CreateTournamentSponsor,
  useV1DeactivateTournamentSponsor,
  useV1UpdateTournamentSponsor,
} from '@/hooks/use-v1-api';
import { AdminDataTable, AdminEmpty } from '@/components/admin';
import { extractErrorMessage } from '@/lib/error-message';
import { TournamentSponsorForm } from './tournament-sponsors-form';
import {
  emptySponsorForm,
  formFromSponsor,
  sponsorPayloadFromForm,
  type SponsorForm,
} from './tournament-sponsors-admin-model';
import type { V1AdminTournamentSponsor } from '@/types/api';

export function TournamentSponsorsTab({
  tournamentId,
  showToast,
}: {
  tournamentId: string;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const [form, setForm] = useState<SponsorForm>(emptySponsorForm);
  const [editingSponsorId, setEditingSponsorId] = useState<string | null>(null);
  const { data, isPending, isError, error, refetch } = useV1AdminTournamentSponsors(tournamentId);
  const createSponsor = useV1CreateTournamentSponsor(tournamentId);
  const updateSponsor = useV1UpdateTournamentSponsor(tournamentId);
  const deactivateSponsor = useV1DeactivateTournamentSponsor(tournamentId);
  const sponsors = data?.items ?? [];
  const formMode = editingSponsorId ? 'update' : 'create';
  const formPending = createSponsor.isPending || updateSponsor.isPending;

  const setField = (field: keyof SponsorForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptySponsorForm);
    setEditingSponsorId(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) return;

    if (editingSponsorId) {
      updateSponsor.mutate(
        {
          sponsorId: editingSponsorId,
          body: sponsorPayloadFromForm(form, 'update'),
        },
        {
          onSuccess: () => {
            resetForm();
            showToast('협찬 정보를 수정했어요.', 'success');
          },
          onError: (err) =>
            showToast(extractErrorMessage(err, '협찬 정보를 수정하지 못했어요.'), 'error'),
        },
      );
      return;
    }

    createSponsor.mutate(
      sponsorPayloadFromForm(form, 'create'),
      {
        onSuccess: () => {
          resetForm();
          showToast('협찬 정보를 추가했어요.', 'success');
        },
        onError: (err) =>
          showToast(extractErrorMessage(err, '협찬 정보를 추가하지 못했어요.'), 'error'),
      },
    );
  };

  const startEdit = (sponsor: V1AdminTournamentSponsor) => {
    setForm(formFromSponsor(sponsor));
    setEditingSponsorId(sponsor.id);
  };

  const handleDeactivate = (sponsor: V1AdminTournamentSponsor) => {
    deactivateSponsor.mutate(sponsor.id, {
      onSuccess: () => {
        if (editingSponsorId === sponsor.id) resetForm();
        showToast('협찬 정보를 비공개로 전환했어요.', 'success');
      },
      onError: (err) =>
        showToast(extractErrorMessage(err, '협찬 정보를 비공개로 전환하지 못했어요.'), 'error'),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <TournamentSponsorForm
        form={form}
        mode={formMode}
        pending={formPending}
        setField={setField}
        onSubmit={handleSubmit}
        onCancel={editingSponsorId ? resetForm : undefined}
      />

      {(isPending || isError) && (
        <AdminDataTable
          columns={[]}
          rows={[]}
          keyExtractor={() => ''}
          loading={isPending}
          error={isError ? extractErrorMessage(error, '협찬 목록을 불러오지 못했어요.') : undefined}
          onRetry={() => void refetch()}
        />
      )}

      {!isPending && !isError && sponsors.length === 0 && (
        <AdminEmpty title="협찬 정보가 없어요" description="대회 한정 협찬사와 이벤트 정보를 추가해 주세요." />
      )}

      {!isPending && !isError && sponsors.length > 0 && (
        <div className="flex flex-col gap-3">
          {sponsors.map((sponsor) => (
            <div key={sponsor.id} className="rounded-2xl border border-gray-100 bg-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-gray-900 truncate">{sponsor.name}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {sponsor.isActive ? '공개' : '비공개'} · 정렬 {sponsor.sortOrder}
                  </p>
                </div>
                {sponsor.eventTitle ? (
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600">
                    {sponsor.eventTitle}
                  </span>
                ) : null}
              </div>
              {sponsor.benefitText ? (
                <p className="mt-3 text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {sponsor.benefitText}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(sponsor)}
                  className={[
                    'min-h-[36px] rounded-lg bg-gray-100 px-3 text-xs font-semibold text-gray-700',
                    'transition-colors hover:bg-gray-200',
                  ].join(' ')}
                >
                  수정
                </button>
                {sponsor.isActive ? (
                  <button
                    type="button"
                    onClick={() => handleDeactivate(sponsor)}
                    disabled={deactivateSponsor.isPending}
                    className={[
                      'min-h-[36px] rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-600',
                      'transition-colors hover:bg-red-100 disabled:opacity-50',
                    ].join(' ')}
                  >
                    비공개
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
