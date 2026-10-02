'use client';

import { useV1AdminMe } from '@/hooks/use-v1-api';

/** 어드민 쓰기 권한(status:write) — 12개 화면이 같은 한 줄을 복제하던 것의 단일 소스.
 * 로딩 중엔 false(쓰기 UI는 늦게 열리는 쪽이 안전). */
export function useAdminCanWrite(): boolean {
  const { data: adminMe } = useV1AdminMe();
  return adminMe?.capabilities.includes('status:write') ?? false;
}
