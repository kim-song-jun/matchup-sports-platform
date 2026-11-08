import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CoverImageUploader } from './cover-image-uploader';

function previewSrc(value: string | null) {
  const { container } = render(<CoverImageUploader value={value} onSelectFile={() => {}} onClear={() => {}} />);
  return container.querySelector('img')?.getAttribute('src') ?? '';
}

describe('CoverImageUploader 미리보기', () => {
  it('업로드된 커버는 원본이 아니라 최적화기를 거쳐 받는다', () => {
    const src = new URL(previewSrc('/uploads/2026/11/cover.jpg'), 'http://localhost');
    expect(src.pathname).toBe('/_next/image');
    expect(src.searchParams.get('url')).toBe('/uploads/2026/11/cover.jpg');
  });

  it('올리기 전 blob 미리보기는 최적화기로 보내지 않는다', () => {
    expect(previewSrc('blob:https://teameet.co.kr/3f2a')).toBe('blob:https://teameet.co.kr/3f2a');
  });
});
