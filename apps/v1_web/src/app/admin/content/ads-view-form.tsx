'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { useV1CreateAdCampaign, useV1UpdateAdCampaign } from '@/hooks/use-v1-ads';
import { useV1DeleteAdminContentAsset, useV1UploadAdminContentAsset } from '@/hooks/use-v1-api';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import type { V1AdCampaign } from '@/types/ads';
import { AdChannelFields, AdTextField } from './ads-view-form-fields';
import {
  AD_ADVERTISER_MAX_LENGTH,
  AD_TITLE_MAX_LENGTH,
  EMPTY_AD_FORM,
  adErrorMessage,
  adFormFromCampaign,
  buildSavePayload,
  type AdChannelFormState,
  type AdFormState,
  type AdPopupFormState,
} from './ads-view-model';

type TemporaryAsset = { assetId: string; url: string };

/**
 * Create or edit one campaign. Images are uploaded as soon as they pass the check, so the form tracks what it
 * uploaded: whatever the saved campaign does not use (replaced, removed, or the form was closed) is deleted again.
 */
export function AdForm({
  campaign,
  canWrite,
  onClose,
  onSaved,
  onReload,
  showToast,
}: {
  /** `null` creates a draft; otherwise the campaign being edited, at the version the form saves against. */
  campaign: V1AdCampaign | null;
  canWrite: boolean;
  onClose: () => void;
  onSaved: (campaign: V1AdCampaign) => void;
  /** Fetches the latest stored campaign so the owner can redo the edit after a version conflict. */
  onReload: () => Promise<void>;
  showToast: (message: string, variant: 'success' | 'error') => void;
}) {
  const createCampaign = useV1CreateAdCampaign();
  const updateCampaign = useV1UpdateAdCampaign();
  const uploadAsset = useV1UploadAdminContentAsset();
  const deleteAsset = useV1DeleteAdminContentAsset();
  const [form, setForm] = useState<AdFormState>(() => (campaign ? adFormFromCampaign(campaign) : EMPTY_AD_FORM));
  const [error, setError] = useState('');
  // Once the owner has tried to save, field-level problems show without waiting for each field to be left.
  const [submitted, setSubmitted] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const temporaryAssets = useRef<TemporaryAsset[]>([]);

  const [imagesBusy, setImagesBusy] = useState({ banner: false, popup: false });
  const saving = createCampaign.isPending || updateCampaign.isPending;
  const locked = !canWrite || saving;
  // Saving mid-upload would store the previous image and unmount the form before the new one is tracked for cleanup.
  const uploadingImage = imagesBusy.banner || imagesBusy.popup;

  async function releaseTemporaryAssets(keepUrls: string[]) {
    const stale = temporaryAssets.current.filter((asset) => !keepUrls.includes(asset.url));
    temporaryAssets.current = [];
    const results = await Promise.allSettled(stale.map((asset) => deleteAsset.mutateAsync(asset.assetId)));
    if (results.some((result) => result.status === 'rejected')) {
      showToast('쓰지 않는 임시 이미지를 정리하지 못했어요. 서버가 나중에 다시 정리해요.', 'error');
    }
  }

  // The form unmounts when the owner opens another row or closes it: nothing it uploaded is saved by then.
  const releaseRef = useRef(releaseTemporaryAssets);
  releaseRef.current = releaseTemporaryAssets;
  useEffect(() => () => void releaseRef.current([]), []);

  async function uploadImage(file: File) {
    const asset = await uploadAsset.mutateAsync(file);
    temporaryAssets.current.push({ assetId: asset.assetId, url: asset.url });
    return asset.url;
  }

  const patchBanner = (patch: Partial<AdChannelFormState>) =>
    setForm((current) => ({ ...current, banner: { ...current.banner, ...patch } }));
  const patchPopup = (patch: Partial<AdPopupFormState>) =>
    setForm((current) => ({ ...current, popup: { ...current.popup, ...patch } }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setConflict(false);
    setSubmitted(true);
    const built = buildSavePayload(form);
    if ('error' in built) {
      setError(built.error);
      return;
    }

    try {
      const { campaign: saved } = campaign
        ? await updateCampaign.mutateAsync({ campaignId: campaign.id, expectedVersion: campaign.version, body: built.payload })
        : await createCampaign.mutateAsync(built.payload);
      await releaseTemporaryAssets([built.payload.banner?.imageUrl, built.payload.popup?.imageUrl].filter((url): url is string => Boolean(url)));
      showToast(campaign ? '광고를 수정했어요.' : '광고 초안을 저장했어요. 게시는 목록에서 눌러 주세요.', 'success');
      onSaved(saved);
    } catch (saveError) {
      setConflict(extractErrorCode(saveError) === 'AD_CAMPAIGN_VERSION_CONFLICT');
      setError(adErrorMessage(saveError, campaign ? '광고를 수정하지 못했어요.' : '광고를 저장하지 못했어요.'));
    }
  }

  async function reload() {
    setReloading(true);
    try {
      await onReload();
    } catch (reloadError) {
      setError(extractErrorMessage(reloadError, '최신 내용을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'));
    } finally {
      setReloading(false);
    }
  }

  async function close() {
    await releaseTemporaryAssets([]);
    onClose();
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)]">{campaign ? '광고 수정' : '새 광고'}</p>
          <h2 className="mt-1 text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">{campaign ? '광고 수정하기' : '광고 만들기'}</h2>
        </div>
        <button
          type="button"
          onClick={() => void close()}
          disabled={saving}
          aria-label="편집 닫기"
          className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-soft)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <X size={19} aria-hidden="true" />
        </button>
      </div>

      <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <AdTextField
          label="캠페인 이름 (내부용)"
          hint="운영자만 봐요. 사용자 화면에는 나오지 않아요."
          value={form.title}
          onChange={(title) => setForm((current) => ({ ...current, title }))}
          maxLength={AD_TITLE_MAX_LENGTH}
          required
          disabled={locked}
        />
        <AdTextField
          label="광고주 표시 이름"
          hint="팝업에서 제목 위에 나와요. 배너에는 나오지 않고, 배너와 팝업 모두 ‘광고’ 표시가 붙어요."
          value={form.advertiserName}
          onChange={(advertiserName) => setForm((current) => ({ ...current, advertiserName }))}
          maxLength={AD_ADVERTISER_MAX_LENGTH}
          required
          disabled={locked}
        />
        <AdChannelFields
          channel="banner"
          state={form.banner}
          disabled={locked}
          upload={uploadImage}
          onPatch={patchBanner}
          showErrors={submitted}
          onImageBusyChange={(banner) => setImagesBusy((current) => ({ ...current, banner }))}
        />
        <AdChannelFields
          channel="popup"
          state={form.popup}
          disabled={locked}
          upload={uploadImage}
          onPatch={patchPopup}
          showErrors={submitted}
          onImageBusyChange={(popup) => setImagesBusy((current) => ({ ...current, popup }))}
        />

        <p className="tm-on-tint rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[length:var(--font-size-caption)] leading-5 text-[var(--text-muted)]">
          {campaign?.status === 'published'
            ? '게시 중인 광고라서 저장하면 바로 반영돼요. 비워 둔 채널은 내려가요.'
            : '저장해도 바로 게시되지 않아요. 게시는 저장한 뒤 목록이나 상세에서 눌러 주세요.'}
        </p>

        {error ? (
          <div role="alert" className="flex flex-col items-start gap-1 rounded-xl border border-[var(--tint-red-border)] bg-[var(--tint-red)] px-3 py-2">
            <p className="text-[length:var(--font-size-label)] font-medium text-[var(--red700)]">{error}</p>
            {conflict ? (
              <button
                type="button"
                onClick={() => void reload()}
                disabled={reloading}
                className="inline-flex min-h-[44px] items-center rounded-lg px-1 text-[length:var(--font-size-label)] font-semibold text-[var(--blue700)] underline underline-offset-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                {reloading ? '불러오는 중…' : '최신 내용 다시 불러오기'}
              </button>
            ) : null}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={locked || uploadingImage}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 text-[length:var(--font-size-body-sm)] font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          {saving ? '저장 중…' : campaign ? '수정 저장' : '초안으로 저장'}
        </button>
      </form>
    </div>
  );
}
