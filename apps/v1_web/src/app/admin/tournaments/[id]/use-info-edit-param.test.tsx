import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInfoEditParam } from './use-info-edit-param';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/tournaments/t1/info',
  useSearchParams: () => nav.params,
  useRouter: () => ({ replace: nav.replace }),
}));

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
});

describe('useInfoEditParam', () => {
  it('?edit= 값이 섹션 키면 그 섹션을, 아니면 null 을 돌려준다', () => {
    nav.params = new URLSearchParams('edit=rules');
    const { result, rerender } = renderHook(() => useInfoEditParam());
    expect(result.current.section).toBe('rules');

    nav.params = new URLSearchParams('edit=foo');
    rerender();
    expect(result.current.section).toBeNull();

    nav.params = new URLSearchParams();
    rerender();
    expect(result.current.section).toBeNull();
  });

  it('open 은 다른 파라미터를 지킨 채 edit 을 replace 로 넣는다', () => {
    nav.params = new URLSearchParams('from=x');
    const { result } = renderHook(() => useInfoEditParam());

    act(() => result.current.open('entry'));

    expect(nav.replace).toHaveBeenCalledWith('/admin/tournaments/t1/info?from=x&edit=entry', { scroll: false });
  });

  it('close 는 시트를 바로 걷고 edit 만 지운다', async () => {
    nav.params = new URLSearchParams('from=x&edit=entry');
    const { result } = renderHook(() => useInfoEditParam());

    act(() => result.current.close());

    // 주소가 아직 그대로여도 닫힌 것으로 본다 — 닫힌 시트가 주소를 기다리며 남지 않게.
    expect(result.current.section).toBeNull();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/admin/tournaments/t1/info?from=x', { scroll: false }));
  });

  it('남는 파라미터가 없으면 물음표 없이 경로만 남긴다', async () => {
    nav.params = new URLSearchParams('edit=basic');
    const { result } = renderHook(() => useInfoEditParam());

    act(() => result.current.close());

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/admin/tournaments/t1/info', { scroll: false }));
  });

  it('닫은 뒤 같은 섹션을 다시 열 수 있다', async () => {
    nav.params = new URLSearchParams('edit=basic');
    const { result, rerender } = renderHook(() => useInfoEditParam());
    act(() => result.current.close());
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());

    nav.params = new URLSearchParams();
    rerender();
    nav.params = new URLSearchParams('edit=basic');
    rerender();

    expect(result.current.section).toBe('basic');
  });
});
