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
import { AdminCardList, AdminEmpty } from '@/components/admin';
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

      {/* 로딩/에러만 AdminDataTable([],[]) 로 빌려 쓰고 데이터 카드는 손으로 그리던 것을
          정확히 이 용도의 AdminCardList 하나로 — 로딩·에러·빈 상태·카드가 전부 표준. */}
      <AdminCardList<V1AdminTournamentSponsor>
        rows={sponsors}
        keyExtractor={(sponsor) => sponsor.id}
        loading={isPending}
        error={isError ? extractErrorMessage(error, '협찬 목록을 불러오지 못했어요.') : undefined}
        onRetry={() => void refetch()}
        empty={<AdminEmpty title="협찬 정보가 없어요" description="대회 한정 협찬사와 이벤트 정보를 추가해 주세요." />}
        minCardWidth="100%"
        actionLayout="compact"
        card={(sponsor) => ({
          title: sponsor.name,
          subtitle: `${sponsor.isActive ? '공개' : '비공개'} · 정렬 ${sponsor.sortOrder}`,
          statusNode: sponsor.eventTitle ? (
            <span className="shrink-0 rounded-full bg-[var(--blue50)] px-2 py-1 text-xs font-medium text-[var(--blue700)]">
              {sponsor.eventTitle}
            </span>
          ) : undefined,
          description: sponsor.benefitText ? (
            <span className="whitespace-pre-wrap">{sponsor.benefitText}</span>
          ) : undefined,
        })}
        renderActions={
          canWrite
            ? (sponsor) => (
                <>
                  <button
                    type="button"
                    onClick={() => startEdit(sponsor)}
                    className="min-h-[44px] rounded-lg bg-[var(--surface-soft)] px-3 text-xs font-semibold text-[var(--text-body)] transition-colors hover:bg-[var(--border)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                  >
                    수정
                  </button>
                  {sponsor.isActive ? (
                    <button
                      type="button"
                      onClick={() => handleDeactivate(sponsor)}
                      disabled={deactivateSponsor.isPending}
                      className="min-h-[44px] rounded-lg bg-[var(--red50)] px-3 text-xs font-semibold text-[var(--red700)] transition-colors hover:bg-[var(--tint-red)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                    >
                      비공개
                    </button>
                  ) : null}
                </>
              )
            : undefined
        }
      />

      {!isPending && !isError ? <TournamentSponsorsPreview sponsors={sponsors} /> : null}
    </div>
  );
}
