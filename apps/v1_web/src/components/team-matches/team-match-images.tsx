'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { SportIllustration, sportIllustration } from '@/components/v1-ui/sport-illustration';
import { cssUrl } from '@/lib/assets';
import { extractErrorMessage } from '@/lib/error-message';

type Images = { imageUrl?: string | null; listImageUrl?: string | null };
type ImageField = 'listImageUrl' | 'imageUrl';

/** A single uploaded image serves both surfaces; an explicit image wins on its own surface. */
export function teamMatchImage(images: Images, surface: 'list' | 'detail') {
  const primary = surface === 'list' ? images.listImageUrl : images.imageUrl;
  const secondary = surface === 'list' ? images.imageUrl : images.listImageUrl;
  return primary?.trim() || secondary?.trim() || null;
}

export function teamMatchBackgroundImage(image: string, sport?: string) {
  // Keep a local sport image behind remote uploads, including broken URLs.
  return `${cssUrl(image)}, ${cssUrl(`/illustrations/${sportIllustration(sport)}-640.webp`)}`;
}

export function TeamMatchImagesPreview({ images, sport }: { images: Images; sport?: string }) {
  return <div className="tm-team-match-images-grid">
    {(['list', 'detail'] as const).map((surface) => {
      const label = surface === 'list' ? '목록 이미지' : '상세 이미지';
      const image = teamMatchImage(images, surface);
      return <Card key={surface} pad={16}>
        <div className="tm-text-label">{label}</div>
        <div className="tm-team-match-image-stage">
          <div role="img" aria-label={`${label} 미리보기`} className={`tm-team-match-image-preview ${surface === 'list' ? 'tm-team-match-image-square' : 'tm-team-match-image-wide'}`}
            style={image ? { backgroundImage: teamMatchBackgroundImage(image, sport) } : undefined}>
            {image ? null : <SportIllustration sport={sport} sizes="200px" />}
          </div>
        </div>
      </Card>;
    })}
  </div>;
}

export function TeamMatchImagesField({ images, sport, onChange, onUpload, onUploadingChange, disabled = false }: {
  images: Images;
  sport?: string;
  onChange: (field: ImageField, value: string) => void;
  onUpload?: (file: File) => Promise<string>;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState<ImageField | null>(null);
  const busy = useRef(false);
  const [error, setError] = useState<{ field: ImageField; message: string } | null>(null);

  const upload = async (event: ChangeEvent<HTMLInputElement>, field: ImageField) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onUpload || busy.current || disabled) return;
    busy.current = true;
    setUploading(field);
    onUploadingChange?.(true);
    setError(null);
    try {
      const url = await onUpload(file);
      if (!url?.trim()) throw new Error('이미지를 업로드하지 못했어요. 다시 시도해 주세요.');
      onChange(field, url);
    } catch (err) {
      setError({ field, message: extractErrorMessage(err, '이미지 업로드에 실패했어요. 다시 시도해 주세요.') });
    } finally {
      busy.current = false;
      setUploading(null);
      onUploadingChange?.(false);
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <p className="tm-text-caption">이미지는 선택 사항이에요. 한 장만 올리면 목록과 상세에 함께 사용하고, 없으면 종목별 기본 이미지를 보여줘요.</p>
      <div className="tm-team-match-images-grid">
        {(['listImageUrl', 'imageUrl'] as const).map((field) => {
          const list = field === 'listImageUrl';
          const label = list ? '목록 이미지' : '상세 이미지';
          const image = teamMatchImage(images, list ? 'list' : 'detail');
          return (
            <Card key={field} pad={16}>
              <div className="tm-text-label">{label} (선택)</div>
              <div className="tm-team-match-image-stage">
                <div role="img" aria-label={`${label} 미리보기`} className={`tm-team-match-image-preview ${list ? 'tm-team-match-image-square' : 'tm-team-match-image-wide'}`}
                  style={image ? { backgroundImage: teamMatchBackgroundImage(image, sport) } : undefined}>
                  {image ? null : <SportIllustration sport={sport} sizes="200px" />}
                </div>
              </div>
              <div className="tm-text-caption" style={{ marginBottom: 8 }}>
                {list ? '정사각형 1:1 권장' : '가로형 16:9 권장'} · {images[field] ? '선택한 이미지' : image ? '다른 이미지와 함께 사용' : '종목 기본 이미지'}
              </div>
              <label className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" style={disabled || uploading || !onUpload ? { opacity: 0.6 } : undefined}>
                {uploading === field ? '업로드 중...' : `${label} ${images[field] ? '변경' : '선택'}`}
                <input className="sr-only" aria-label={label} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || Boolean(uploading) || !onUpload} onChange={(event) => void upload(event, field)} />
              </label>
              {images[field] ? <button className="tm-btn tm-btn-sm tm-btn-ghost tm-btn-block" type="button" disabled={disabled || Boolean(uploading)} style={{ marginTop: 8 }} onClick={() => { onChange(field, ''); setError(null); }}>{label} 제거</button> : null}
              {error?.field === field ? <div role="alert" className="tm-text-caption" style={{ marginTop: 8, color: 'var(--orange700)' }}>{error.message}</div> : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
