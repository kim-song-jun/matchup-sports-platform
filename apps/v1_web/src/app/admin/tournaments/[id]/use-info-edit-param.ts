'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { closeOverlayThenNavigate } from '@/lib/overlay-history';
import { parseInfoEditParam, type TournamentInfoSectionKey } from './info-sections';

/** 대회 정보 화면에서 열려 있는 수정 섹션 — 주소의 `?edit=` 가 출처다. */
export function useInfoEditParam(): {
  section: TournamentInfoSectionKey | null;
  open: (key: TournamentInfoSectionKey) => void;
  close: () => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get('edit');
  // 닫을 때는 시트를 먼저 걷어 뒤로가기 표식을 회수하고 그 뒤에 주소를 바꾼다. 주소를 먼저 바꾸면
  // `?edit=` 가 남은 항목이 뒤에 깔려 뒤로가기가 시트를 다시 연다.
  const [dismissed, setDismissed] = useState<string | null>(null);
  // 주소가 바뀐 같은 렌더에서 낡은 닫힘 표식을 버린다. 조건이 있어 한 번만 돌고, effect 로 옮기면 낡은 표식으로 한 프레임을 더 그린다.
  if (dismissed !== null && dismissed !== raw) setDismissed(null);

  const replaceEdit = useCallback(
    (key: TournamentInfoSectionKey | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key) params.set('edit', key);
      else params.delete('edit');
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const close = useCallback(() => {
    void closeOverlayThenNavigate(
      () => setDismissed(raw),
      () => replaceEdit(null),
    );
  }, [raw, replaceEdit]);

  return {
    section: raw !== null && raw === dismissed ? null : parseInfoEditParam(raw),
    open: replaceEdit,
    close,
  };
}
