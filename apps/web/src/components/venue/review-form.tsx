'use client';

import { useState } from 'react';
import { Star, Send } from 'lucide-react';
import { ImageUpload, type ImageUploadState } from '@/components/ui/image-upload';
import { Textarea } from '@/components/ui/textarea';
import { extractUploadUrls, type UploadAsset } from '@/lib/uploads';

interface ReviewFormProps {
  venueId: string;
  venueType: string;
  onSubmit: (data: ReviewData) => void | Promise<void>;
  onCancel: () => void;
}

export interface ReviewData {
  overallRating: number;
  facilityRating: number;
  accessRating: number;
  costRating: number;
  iceQualityRating?: number;
  comment: string;
  photos: string[];
}

function StarRating({
  value,
  onChange,
  label,
  size = 24,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  size?: number;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex items-center justify-between">
      <span className="text-base text-gray-700 dark:text-gray-300 font-medium">{label}</span>
      <div className="flex items-center gap-1">
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => onChange(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              aria-label={`${star}점`}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl p-1.5 transition-transform active:scale-110 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              <Star
                size={size}
                className={
                  star <= (hovered || value) ? 'text-amber-400' : 'text-gray-200 dark:text-gray-600'
                }
                fill={star <= (hovered || value) ? 'currentColor' : 'none'}
              />
            </button>
          ))}
        </div>
        <span className="ml-2 w-5 text-right text-base font-semibold text-amber-500">
          {value > 0 ? value : '-'}
        </span>
      </div>
    </div>
  );
}

export function ReviewForm({ venueId, venueType, onSubmit, onCancel }: ReviewFormProps) {
  const [overallRating, setOverallRating] = useState(0);
  const [facilityRating, setFacilityRating] = useState(0);
  const [accessRating, setAccessRating] = useState(0);
  const [costRating, setCostRating] = useState(0);
  const [iceQualityRating, setIceQualityRating] = useState(0);
  const [comment, setComment] = useState('');
  const [imageAssets, setImageAssets] = useState<UploadAsset[]>([]);
  const [uploadState, setUploadState] = useState<ImageUploadState>({
    hasPendingUploads: false,
    hasUploadErrors: false,
    pendingCount: 0,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isIceRink = venueType === 'ice_rink';
  const isValid =
    overallRating > 0 &&
    facilityRating > 0 &&
    accessRating > 0 &&
    costRating > 0 &&
    (!isIceRink || iceQualityRating > 0);
  const canSubmit = isValid && !isSubmitting && !uploadState.hasPendingUploads && !uploadState.hasUploadErrors;

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);

    const data: ReviewData = {
      overallRating,
      facilityRating,
      accessRating,
      costRating,
      comment,
      photos: extractUploadUrls(imageAssets),
    };
    if (isIceRink) data.iceQualityRating = iceQualityRating;

    try {
      await onSubmit(data);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-5">리뷰 작성</h3>

      {/* Overall Rating - large */}
      <div className="mb-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">전체 평점</p>
        <div className="flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setOverallRating(star)}
              aria-label={`${star}점`}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl p-1.5 transition-transform active:scale-110 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              <Star
                size={36}
                className={star <= overallRating ? 'text-amber-400' : 'text-gray-200'}
                fill={star <= overallRating ? 'currentColor' : 'none'}
              />
            </button>
          ))}
        </div>
        {overallRating > 0 && (
          <p className="text-2xl font-bold text-amber-500 mt-1">{overallRating}.0</p>
        )}
      </div>

      {/* Detail Ratings */}
      <div className="space-y-4 mb-6">
        <div className="h-px bg-gray-100 dark:bg-gray-700" />
        <StarRating
          value={facilityRating}
          onChange={setFacilityRating}
          label="시설 상태"
          size={24}
        />
        <StarRating
          value={accessRating}
          onChange={setAccessRating}
          label="접근성"
          size={24}
        />
        <StarRating
          value={costRating}
          onChange={setCostRating}
          label="가격 대비"
          size={24}
        />
        {isIceRink && (
          <StarRating
            value={iceQualityRating}
            onChange={setIceQualityRating}
            label="빙질"
            size={24}
          />
        )}
        <div className="h-px bg-gray-100 dark:bg-gray-700" />
      </div>

      {/* Comment */}
      <div className="mb-4">
        <label htmlFor={`venue-review-comment-${venueId}`} className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
          후기 작성
        </label>
        <Textarea
          id={`venue-review-comment-${venueId}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="이용 후기를 자유롭게 작성해주세요"
          rows={4}
          className="resize-none"
        />
      </div>

      {/* Photo upload */}
      <div className="mb-6">
        <ImageUpload
          value={imageAssets}
          onChange={setImageAssets}
          onStateChange={setUploadState}
          max={5}
          accept="image/jpeg,image/png,image/webp,image/gif"
          maxSizeMB={10}
          label="시설 사진 (선택)"
        />
        {uploadState.hasPendingUploads && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            이미지 업로드가 끝난 뒤 리뷰를 등록할 수 있어요.
          </p>
        )}
        {uploadState.hasUploadErrors && (
          <p className="mt-2 text-xs text-red-500 dark:text-red-400">
            실패한 이미지를 다시 시도하거나 제거한 뒤 등록해주세요.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 py-3 text-base font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-base font-bold text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={14} />
          {isSubmitting ? '제출 중...' : '리뷰 등록'}
        </button>
      </div>
    </div>
  );
}
