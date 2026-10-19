'use client';

import { useId, useState } from 'react';
import { TeamMatchImagesField } from '@/components/team-matches/team-match-images';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1UpdateLeagueCoverImage, useV1UploadImages } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';

type ImageField = 'listImageUrl' | 'coverImageUrl';

/** Reuse the team-match two-image editor; save only the changed field. */
export function LeagueCoverImageControl({ leagueId, sportCode, coverImageUrl, listImageUrl = null }: {
  leagueId: string;
  sportCode: string;
  coverImageUrl: string | null;
  listImageUrl?: string | null;
}) {
  const headingId = useId();
  const canWrite = useAdminCanWrite();
  const upload = useV1UploadImages();
  const save = useV1UpdateLeagueCoverImage(leagueId);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [removeField, setRemoveField] = useState<ImageField | null>(null);
  const busy = upload.isPending || save.isPending;
  const removeLabel = removeField === 'listImageUrl' ? '목록 이미지' : '상세 이미지';

  function persist(field: ImageField, value: string | null) {
    setFeedback(null);
    save.mutate({ [field]: value }, {
      onSuccess: () => {
        setRemoveField(null);
        setFeedback({ error: false, message: '리그 이미지를 저장했어요.' });
      },
      onError: (err) => {
        setRemoveField(null);
        setFeedback({ error: true, message: extractErrorMessage(err, '이미지를 저장하지 못했어요. 다시 시도해 주세요.') });
      },
    });
  }

  return <section aria-labelledby={headingId} className="mb-6">
    <SectionTitle title="리그 이미지" id={headingId} compact />
    <p className="tm-text-caption mt-2 text-[var(--text-muted)]">파일을 고르면 업로드 후 바로 저장돼요.</p>
    <TeamMatchImagesField
      images={{ imageUrl: coverImageUrl, listImageUrl }}
      sport={sportCode}
      disabled={!canWrite || busy}
      onUpload={async (file) => {
        setFeedback(null);
        const result = await upload.mutateAsync(file);
        const url = result.urls[0];
        if (!url) throw new Error('이미지를 올리지 못했어요. 다시 시도해 주세요.');
        return url;
      }}
      onChange={(field, value) => {
        const target = field === 'imageUrl' ? 'coverImageUrl' : 'listImageUrl';
        if (value) persist(target, value);
        else setRemoveField(target);
      }}
    />
    {!canWrite ? <p className="tm-text-caption mt-2 text-[var(--text-muted)]">현재 계정은 리그 이미지를 바꿀 권한이 없어요.</p> : null}
    {feedback ? <p role={feedback.error ? 'alert' : 'status'} className={`tm-text-caption mt-2 ${feedback.error ? 'text-[var(--red700)]' : 'text-[var(--green700)]'}`}>{feedback.message}</p> : null}
    <ConfirmModal
      open={removeField !== null}
      title={`${removeLabel}를 지울까요?`}
      message="다른 이미지가 있으면 함께 사용하고, 둘 다 없으면 종목 그래픽으로 보여요. 사진은 다시 올릴 수 있어요."
      confirmLabel="지우기" cancelLabel="취소" tone="danger" busy={save.isPending}
      onConfirm={() => { if (removeField) persist(removeField, null); }}
      onCancel={() => setRemoveField(null)}
    />
  </section>;
}
