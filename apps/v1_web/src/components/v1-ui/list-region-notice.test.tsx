import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListRegionNotice } from './list-region-notice';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const withLink = { text: '가까운 팀 매치를 먼저 보려면', link: { label: '지역 설정', href: '/my/settings/location' } };

beforeEach(() => {
  router.push.mockClear();
  window.history.replaceState(null, '', '/team-matches?sport=futsal');
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('ListRegionNotice — 지역 설정 링크의 출처', () => {
  it('"지역 설정"을 누르면 들어온 목록 주소를 출처(?from=)로 붙여 이동한다 — 설정 화면의 뒤로가기가 그 목록으로 돌아온다', () => {
    render(<ListRegionNotice notice={withLink} />);
    const link = screen.getByRole('link', { name: '지역 설정' });
    // 서버 HTML 은 출처 없이 그대로다(화면마다 달라지지 않게).
    expect(link.getAttribute('href')).toBe('/my/settings/location');

    fireEvent.click(link);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/my/settings/location?from=%2Fteam-matches%3Fsport%3Dfutsal');
  });

  it('저장한 활동 지역을 쓰는 안내(링크 없음)에는 링크를 내지 않는다', () => {
    render(<ListRegionNotice notice={{ text: '내 활동 지역(서울)의 팀 매치를 먼저 보여 줘요' }} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
