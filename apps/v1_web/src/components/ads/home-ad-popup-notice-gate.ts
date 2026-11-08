'use client';

import { useEffect, useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { isHomePopupHidden } from '@/components/home/home-notice-popup';
import type { V1ActivePopupResponse } from '@/types/api';

type NoticeLookup = Pick<UseQueryResult<V1ActivePopupResponse>, 'data' | 'isError' | 'isFetching' | 'isSuccess'>;

/**
 * Whether the home ad popup may take its turn behind the notice popup. A notice always goes first, so the ad
 * waits for a finished, fresh lookup that leaves no notice to show: a notice hidden for a week counts as none.
 *
 * Two outcomes close the ad's turn for the rest of the visit (until the page is reloaded), because the notice
 * has used it: a notice that showed, whatever way the user dismissed it, and a failed lookup, which cannot be
 * told apart from "there is a notice".
 */
export function useNoticeAllowsHomeAd({ onHome, notice }: { onHome: boolean; notice: NoticeLookup }): boolean {
  const noticeId = notice.data?.popup?.popupId ?? null;
  const noticeShows = noticeId !== null && !isHomePopupHidden(noticeId);
  const [turnUsedThisVisit, setTurnUsedThisVisit] = useState(false);

  useEffect(() => {
    if (onHome && (noticeShows || notice.isError)) setTurnUsedThisVisit(true);
  }, [onHome, noticeShows, notice.isError]);

  return onHome && notice.isSuccess && !notice.isFetching && !noticeShows && !turnUsedThisVisit;
}
