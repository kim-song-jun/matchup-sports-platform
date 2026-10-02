import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: vi.fn(),
}));

import { useV1AdminMe } from '@/hooks/use-v1-api';
import { useAdminCanWrite } from './use-admin-can-write';

const useV1AdminMeMock = vi.mocked(useV1AdminMe);

describe('useAdminCanWrite', () => {
  it('capabilities 에 status:write 가 있으면 true', () => {
    useV1AdminMeMock.mockReturnValue({
      data: { capabilities: ['status:write', 'status:read'] },
    } as ReturnType<typeof useV1AdminMe>);
    const { result } = renderHook(() => useAdminCanWrite());
    expect(result.current).toBe(true);
  });

  it('capabilities 에 status:write 가 없으면 false', () => {
    useV1AdminMeMock.mockReturnValue({
      data: { capabilities: ['status:read'] },
    } as ReturnType<typeof useV1AdminMe>);
    const { result } = renderHook(() => useAdminCanWrite());
    expect(result.current).toBe(false);
  });

  it('data 가 undefined(로딩 중)면 false', () => {
    useV1AdminMeMock.mockReturnValue({
      data: undefined,
    } as ReturnType<typeof useV1AdminMe>);
    const { result } = renderHook(() => useAdminCanWrite());
    expect(result.current).toBe(false);
  });
});
