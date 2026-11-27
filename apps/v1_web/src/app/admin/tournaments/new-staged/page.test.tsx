import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import NewStagedPage from './page';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

beforeEach(() => vi.mocked(redirect).mockClear());

describe('옛 단계형 만들기 주소', () => {
  it('새 만들기 화면에서 여러 단계가 골라진 상태로 보낸다', () => {
    NewStagedPage();
    expect(redirect).toHaveBeenCalledWith('/admin/tournaments/new?format=staged');
  });
});
