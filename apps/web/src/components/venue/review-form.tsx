'use client';

import { useState } from 'react';
import { Star, Camera, X, Send } from 'lucide-react';

interface ReviewFormProps {
  venueId: string;
  venueType: string;
  onSubmit: (data: ReviewData) => void;
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
      <span className="text-base text-gray-700 font-medium">{label}</span>
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
              className="p-1.5 transition-transform active:scale-110"
            >
              <Star
                size={size}
                className={
                  star <= (hovered || value) ? 'text-amber-400' : 'text-gray-200'
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
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isIceRink = venueType === 'ice_rink';
  const isValid =
    overallRating > 0 &&
    facilityRating > 0 &&
    accessRating > 0 &&
    costRating > 0 &&
    (!isIceRink || iceQualityRating > 0);

  function handlePhotoClick() {
    // Placeholder: in real implementation, this would open a file picker
    const mockUrl = `/mock-photo-${photos.length + 1}.jpg`;
    setPhotos((prev) => [...prev, mockUrl]);
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    if (!isValid) return;
    setIsSubmitting(true);

    const data: ReviewData = {
      overallRating,
      facilityRating,
      accessRating,
      costRating,
      comment,
      photos,
    };
    if (isIceRink) data.iceQualityRating = iceQualityRating;

    // Simulate submit delay
    setTimeout(() => {
      onSubmit(data);
      setIsSubmitting(false);
    }, 600);
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-100 p-5">
      <h3 className="text-lg font-bold text-gray-900 mb-5">리뷰 작성</h3>

      {/* Overall Rating - large */}
      <div className="mb-6 text-center">
        <p className="text-sm text-gray-500 mb-2">전체 평점</p>
        <div className="flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setOverallRating(star)}
              aria-label={`${star}점`}
              className="p-1.5 transition-transform active:scale-110"
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
        <div className="h-px bg-gray-100" />
        <StarRating
          value={facilityRating}
          onChange={setFacilityRating}
          label="시설 상태"
          size={22}
        />
        <StarRating
          value={accessRating}
          onChange={setAccessRating}
          label="접근성"
          size={22}
        />
        <StarRating
          value={costRating}
          onChange={setCostRating}
          label="가격 대비"
          size={22}
        />
        {isIceRink && (
          <StarRating
            value={iceQualityRating}
            onChange={setIceQualityRating}
            label="빙질"
            size={22}
          />
        )}
        <div className="h-px bg-gray-100" />
      </div>

      {/* Comment */}
      <div className="mb-4">
        <label className="text-sm font-medium text-gray-700 mb-1.5 block">
          후기 작성
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="이용 후기를 자유롭게 작성해주세요"
          rows={4}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base text-gray-900 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-200 transition-colors resize-none"
        />
      </div>

      {/* Photo upload */}
      <div className="mb-6">
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          사진 첨부
        </label>
        <div className="flex gap-2 flex-wrap">
          {photos.map((photo, idx) => (
            <div
              key={idx}
              className="relative h-20 w-20 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden"
            >
              <Camera size={20} className="text-gray-500" />
              <span className="absolute bottom-1 text-2xs text-gray-500">
                사진 {idx + 1}
              </span>
              <button
                type="button"
                onClick={() => removePhoto(idx)}
                className="absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-gray-900/60 text-white"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {photos.length < 5 && (
            <button
              type="button"
              onClick={handlePhotoClick}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-400 transition-colors"
            >
              <Camera size={20} />
              <span className="text-2xs">추가</span>
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1.5">최대 5장까지 첨부 가능</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 text-base font-bold text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={14} />
          {isSubmitting ? '제출 중...' : '리뷰 등록'}
        </button>
      </div>
    </div>
  );
}
