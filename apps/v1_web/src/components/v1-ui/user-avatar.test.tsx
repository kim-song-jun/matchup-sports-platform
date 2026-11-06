import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserAvatar } from './user-avatar';

function optimizerParams(src: string | null) {
  const url = new URL(src ?? '', 'http://localhost');
  return { pathname: url.pathname, url: url.searchParams.get('url'), w: url.searchParams.get('w') };
}

describe('UserAvatar 이미지 경로', () => {
  it('업로드 사진은 원본이 아니라 그려지는 크기의 2배 폭으로 받는다', () => {
    const { container } = render(<UserAvatar imageUrl="/uploads/2026/11/me.png" size={40} />);
    expect(optimizerParams(container.querySelector('img')!.getAttribute('src'))).toEqual({
      pathname: '/_next/image',
      url: '/uploads/2026/11/me.png',
      w: '96',
    });
  });

  it('size 가 커지면 더 넓은 폭을 요청한다', () => {
    const { container } = render(<UserAvatar imageUrl="/uploads/2026/11/me.png" size={72} />);
    expect(optimizerParams(container.querySelector('img')!.getAttribute('src')).w).toBe('256');
  });

  it('최적화기가 못 받아 오는 외부 URL(카카오 프로필 등)은 그대로 둔다', () => {
    const { container } = render(<UserAvatar imageUrl="https://k.kakaocdn.net/dn/abc/profile.jpg" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://k.kakaocdn.net/dn/abc/profile.jpg');
  });

  it('최적화 요청이 실패하면 사람 기본 아이콘으로 돌아가고 이미지를 다시 그리지 않는다', () => {
    const { container } = render(<UserAvatar imageUrl="/uploads/2026/11/broken.png" />);
    expect(container.querySelector('svg')).not.toBeNull();
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('도착하면 기본 아이콘을 걷고 사진을 보여 준다', async () => {
    const { container } = render(<UserAvatar imageUrl="/uploads/2026/11/me.png" />);
    const img = container.querySelector('img') as HTMLImageElement;
    fireEvent.load(img);
    await waitFor(() => expect(container.querySelector('svg')).toBeNull());
    expect(img.style.opacity).toBe('1');
  });
});
