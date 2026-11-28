'use client';

import { useCallback, useMemo, useState } from 'react';

/** 도구 줄(메뉴)과 보기(그림·폰·목록)가 주고받는 보기 상태 — 도구가 쥐고 보기는 읽기만 한다. */
export interface BracketViewControls {
  /** 참가팀 목록을 열었는지. null 이면 아직 아무도 정하지 않아 보기가 기본값을 고른다. */
  trayOpen: boolean | null;
  setTrayOpen(open: boolean): void;
  /** 시간 미정 경기만 보는 중 — 그림은 시간이 있는 칸을 흐리게, 폰·목록은 걸러 낸다. */
  unscheduledOnly: boolean;
  setUnscheduledOnly(on: boolean): void;
  /** 열어 보여 줄 경기 요청. 같은 경기를 다시 요청해도 새로 열리도록 nonce 가 늘어난다. */
  focusRequest: { fixtureId: string; nonce: number } | null;
  requestFocus(fixtureId: string): void;
  /** 보기가 요청을 처리했으면 비운다 — 보기가 다시 마운트돼도 지난 요청이 되살아나지 않게. */
  clearFocusRequest(): void;
}

export function useBracketViewControls(): BracketViewControls {
  const [trayOpen, setTrayOpen] = useState<boolean | null>(null);
  const [unscheduledOnly, setUnscheduledOnly] = useState(false);
  const [focusRequest, setFocusRequest] = useState<BracketViewControls['focusRequest']>(null);
  const requestFocus = useCallback((fixtureId: string) => setFocusRequest(previous => ({ fixtureId, nonce: (previous?.nonce ?? 0) + 1 })), []);
  const clearFocusRequest = useCallback(() => setFocusRequest(null), []);
  return useMemo(
    () => ({ trayOpen, setTrayOpen, unscheduledOnly, setUnscheduledOnly, focusRequest, requestFocus, clearFocusRequest }),
    [trayOpen, unscheduledOnly, focusRequest, requestFocus, clearFocusRequest],
  );
}
