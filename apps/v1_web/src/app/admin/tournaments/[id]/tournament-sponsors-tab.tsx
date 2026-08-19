'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  useV1AdminTournamentSponsors,
  useV1CreateTournamentSponsor,
  useV1DeactivateTournamentSponsor,
  useV1UpdateTournamentSponsor,
  useV1UploadImages,
} from '@/hooks/use-v1-api';
import { AdminDataTable, AdminEmpty } from '@/components/admin';
import { extractErrorMessage } from '@/lib/error-message';
import { TournamentSponsorForm } from './tournament-sponsors-form';
import { TournamentSponsorsPreview } from './tournament-sponsors-preview';
import {
  emptySponsorForm,
  formFromSponsor,
  sponsorPayloadFromForm,
  type SponsorForm,
} from './tournament-sponsors-admin-model';
import type { V1AdminTournamentSponsor } from '@/types/api';

export function TournamentSponsorsTab({
  tournamentId,
  canWrite,
  showToast,
}: {
  tournamentId: string;
  canWrite: boolean;
  showToast: (msg: string, v?: 'success' | 'error') => void;
}) {
  const [form, setForm] = useState<SponsorForm>(emptySponsorForm);
  const [editingSponsorId, setEditingSponsorId] = useState<string | null>(null);
  const [logoUploadError, setLogoUploadError] = useState('');
  const { data, isPending, isError, error, refetch } = useV1AdminTournamentSponsors(tournamentId);
  const createSponsor = useV1CreateTournamentSponsor(tournamentId);
  const updateSponsor = useV1UpdateTournamentSponsor(tournamentId);
  const deactivateSponsor = useV1DeactivateTournamentSponsor(tournamentId);
  const uploadImages = useV1UploadImages();
  const sponsors = data?.items ?? [];
  const formMode = editingSponsorId ? 'update' : 'create';
  const formPending = createSponsor.isPending || updateSponsor.isPending;

  const setField = (field: keyof SponsorForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setForm(emptySponsorForm);
    setEditingSponsorId(null);
    setLogoUploadError('');
  };

  const handleSelectLogo = async (file: File) => {
    setLogoUploadError('');
    try {
      const result = await uploadImages.mutateAsync([file]);
      const uploadedUrl = result.urls[0];
      if (!uploadedUrl) throw new Error('업로드된 로고 주소를 받지 못했어요.');
      setField('logoUrl', uploadedUrl);
    } catch (err) {
      setLogoUploadError(extractErrorMessage(err, '로고 이미지를 업로드하지 못했어요.'));
    }
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
      {canWrite ? (
        <TournamentSponsorForm
          form={form}
          mode={formMode}
          pending={formPending}
          uploadingLogo={uploadImages.isPending}
          logoUploadError={logoUploadError}
          onSelectLogo={(file) => void handleSelectLogo(file)}
          setField={setField}
          onSubmit={handleSubmit}
          onCancel={editingSponsorId ? resetForm : undefined}
        />
      ) : (
        <p
          className="rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-xs text-[var(--text-muted)]"
          role="status"
        >
          조회 전용 권한으로 접속했어요. 협찬 정보를 추가하거나 변경하려면 운영 권한이 필요해요.
        </p>
      )}

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
            <div key={sponsor.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-[var(--text-strong)] truncate">{sponsor.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {sponsor.isActive ? '공개' : '비공개'} · 정렬 {sponsor.sortOrder}
                  </p>
                </div>
                {sponsor.eventTitle ? (
                  <span className="shrink-0 rounded-full bg-[var(--blue50)] px-2 py-1 text-xs font-medium text-[var(--blue700)]">
                    {sponsor.eventTitle}
                  </span>
                ) : null}
              </div>
              {sponsor.benefitText ? (
                <p className="mt-3 text-[13px] text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
                  {sponsor.benefitText}
                </p>
              ) : null}
              {canWrite ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(sponsor)}
                    className={[
                      'min-h-[44px] rounded-lg bg-[var(--surface-soft)] px-3 text-xs font-semibold text-[var(--text-body)]',
                      'transition-colors hover:bg-[var(--border)]',
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
                        'min-h-[44px] rounded-lg bg-[var(--red50)] px-3 text-xs font-semibold text-[var(--red700)]',
                        'transition-colors hover:bg-[var(--tint-red)] disabled:opacity-50',
                      ].join(' ')}
                    >
                      비공개
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {!isPending && !isError ? <TournamentSponsorsPreview sponsors={sponsors} /> : null}
    </div>
  );
}
