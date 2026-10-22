'use client';

import { useId } from 'react';
import { TeamMatchImagesField } from '@/components/team-matches/team-match-images';

export function TournamentImagesField({
  coverImageUrl, listImageUrl, showDetailImage, sportCode, disabled = false,
  onImageChange, onVisibilityChange, onUpload, onUploadingChange,
}: {
  coverImageUrl: string | null;
  listImageUrl: string | null;
  showDetailImage: boolean;
  sportCode?: string;
  disabled?: boolean;
  onImageChange: (field: 'coverImageUrl' | 'listImageUrl', value: string | null) => void;
  onVisibilityChange: (visible: boolean) => void;
  onUpload: (file: File) => Promise<string>;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const hintId = useId();
  return <div>
    <TeamMatchImagesField
      images={{ imageUrl: coverImageUrl, listImageUrl }}
      sport={sportCode}
      disabled={disabled}
      onUpload={onUpload}
      onUploadingChange={onUploadingChange}
      onChange={(field, value) => onImageChange(field === 'imageUrl' ? 'coverImageUrl' : 'listImageUrl', value || null)}
    />
    <label className="mt-4 flex min-h-[44px] items-center gap-3 text-[length:var(--font-size-label)] font-semibold text-[var(--text-strong)]">
      <input type="checkbox" role="switch" aria-checked={showDetailImage} aria-describedby={hintId}
        checked={showDetailImage} disabled={disabled}
        onChange={(event) => onVisibilityChange(event.target.checked)}
        className="h-5 w-5 accent-[var(--blue500)]" />
      상세 이미지 표시
    </label>
    <p id={hintId} className="tm-text-caption mt-1 text-[var(--text-muted)]">
      {showDetailImage
        ? '상세 이미지가 없으면 목록 이미지를 사용하고, 둘 다 없으면 종목 기본 이미지를 보여줘요.'
        : '상세에서 기본 이미지와 이미지 영역을 모두 숨겨요. 목록·홍보 카드와 저장된 사진은 유지돼요.'}
    </p>
  </div>;
}
