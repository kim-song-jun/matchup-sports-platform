'use client';

import { useV1AuthMe, useV1MasterRegions, useV1Profile } from '@/hooks/use-v1-api';
import { retryTransientFailure } from '@/lib/api-client';
import { listRegionNotice, resolveListRegionPreference, resolveMyTeamRegion, type ListRegionNotice } from '@/lib/list-region-preference';

/** 활동 지역 설정 화면. */
export const LOCATION_SETTINGS_HREF = '/my/settings/location';

/**
 * 매치·팀 매치·대회/리그 목록의 "내 지역 먼저" — 저장한 활동 지역(시/도)을 요청에 실을 값과 목록 머리 안내로 돌려준다.
 * 기준은 저장한 활동 지역뿐이다(소속 팀이 있어도 대신하지 않는다). 위치 권한은 쓰지 않고, 비로그인은 프로필을 묻지 않는다.
 * 팀 목록은 같은 판정을 화면 안에서 직접 한다(필터 시트도 같은 지역을 써서). 판정 규칙은 `lib/list-region-preference.ts` 하나다.
 */
export function useListRegionPreference({ applicable, noun, linkRegionId, isContinuation = false }: {
  /** 이 목록에 지금 지역 우선을 걸 수 있는가 — 지역을 직접 고른 목록에는 걸지 않는다. */
  applicable: boolean;
  /** 안내 문구가 부르는 목록의 이름(매치·팀 매치·대회·리그…). */
  noun: string;
  /** 이어 보기 주소가 싣고 온 기준(URL 의 `near`). 없으면 undefined. */
  linkRegionId?: string;
  isContinuation?: boolean;
}): { preferRegionId: string | undefined; notice: ListRegionNotice | undefined } {
  const regions = useV1MasterRegions();
  const authMe = useV1AuthMe({ enabled: true, retry: retryTransientFailure });
  const signedIn = Boolean(authMe.data?.user?.id);
  const profile = useV1Profile({ enabled: signedIn });
  const master = regions.data ?? [];
  const myRegion = resolveMyTeamRegion({
    unresolved: authMe.isPending || (signedIn && (profile.isPending || profile.isError)) || regions.isPending,
    saved: signedIn ? profile.data?.regions : undefined,
    master,
  });
  const preference = resolveListRegionPreference({ applicable, signedIn, linkRegionId, isContinuation, myRegion, master });
  return {
    preferRegionId: preference.status === 'ready' ? preference.regionId : undefined,
    notice: listRegionNotice(preference, LOCATION_SETTINGS_HREF, noun),
  };
}
