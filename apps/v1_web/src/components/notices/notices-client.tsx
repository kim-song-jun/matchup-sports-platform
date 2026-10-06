'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useV1Notice, useV1Notices } from '@/hooks/use-v1-api';
import type { V1Notice, V1NoticeResponse, V1NoticesResponse } from '@/types/api';
import { toNotice } from './notices.format';
import { NoticeDetailPageView, NoticeListPageView } from './notices-page';
import type { NoticeDetailViewModel, NoticeListViewModel } from './notices.types';
import { getNoticeDetailViewModel, getNoticeListViewModel } from './notices.view-model';

const NOTICE_CATEGORIES = ['전체', '업데이트', '안내'] as const;

/** `seed` 는 서버가 받은 전체(무필터) 목록이다 — 분류를 고르면 쓰지 않는다. */
export function NoticeListPageClient({ seed }: { readonly seed?: V1NoticesResponse } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlCategory = NOTICE_CATEGORIES.find((category) => category === searchParams.get('category')) ?? '전체';
  const [selectedCategory, setSelectedCategory] = useState(urlCategory);
  useEffect(() => setSelectedCategory(urlCategory), [urlCategory]);
  // 상세를 즉시 열어도 router.replace 반영 전의 쿼리로 복귀하지 않도록 로컬 선택값을 쓴다.
  const listParams = new URLSearchParams(searchParams.toString());
  if (selectedCategory === '전체') listParams.delete('category');
  else listParams.set('category', selectedCategory);
  const listQuery = listParams.toString();

  const query = useV1Notices(
    selectedCategory === '전체' ? undefined : { category: selectedCategory },
    { seed: selectedCategory === '전체' ? seed : undefined },
  );
  const fallback = getNoticeListViewModel();
  const categories = NOTICE_CATEGORIES.map((label) => ({
    label,
    active: selectedCategory === label,
    onSelect: () => {
      setSelectedCategory(label);
      const nextParams = new URLSearchParams(listParams);
      if (label === '전체') nextParams.delete('category');
      else nextParams.set('category', label);
      const nextQuery = nextParams.toString();
      router.replace(`/notices${nextQuery ? `?${nextQuery}` : ''}`, { scroll: false });
    },
  }));

  const status: NoticeListViewModel['status'] = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : 'ready';

  // fallback 정적 목업은 ready 상태에서 실제 데이터가 없을 때만 사용한다.
  // 로딩·에러 중에는 목업을 실데이터처럼 노출하지 않는다.
  const noticesFromApi = query.data ? getNoticeItems(query.data).map(toNotice) : [];
  // Copilot: ready 상태에선 API 결과(빈 배열 포함)를 그대로 사용 — 실제 공지가 0건일 때
  // 목업을 실데이터처럼 노출하지 않는다. fallback 은 응답 자체가 없는 예외(query.data 부재)에만.
  const noticesReady = status === 'ready'
    ? (query.data ? noticesFromApi : fallback.notices)
    : [];
  const visibleNotices = selectedCategory === '전체'
    ? noticesReady
    : noticesReady.filter((notice) => notice.tag === selectedCategory);

  const model: NoticeListViewModel = {
    ...fallback,
    filters: categories,
    selfHref: listQuery ? `/notices?${listQuery}` : undefined,
    notices: visibleNotices,
    status,
    onRetry: query.isError ? () => query.refetch() : undefined,
  };

  return <NoticeListPageView model={model} />;
}

export function NoticeDetailPageClient({ noticeId, seed }: { noticeId: string; seed?: V1NoticeResponse | null }) {
  const query = useV1Notice(noticeId, { seed });
  const fallback = getNoticeDetailViewModel(noticeId);

  const status: NoticeDetailViewModel['status'] = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : 'ready';

  // fallback 정적 목업은 ready 상태에서 실제 데이터가 없을 때만 사용한다.
  // 로딩·에러 중에는 목업을 실데이터처럼 노출하지 않는다.
  const model: NoticeDetailViewModel = {
    ...fallback,
    notice:
      status === 'ready' && query.data
        ? toNotice(query.data.notice ?? fallbackNotice(noticeId))
        : fallback.notice,
    status,
    onRetry: query.isError ? () => query.refetch() : undefined,
  };

  return <NoticeDetailPageView model={model} />;
}

function getNoticeItems(data: unknown): V1Notice[] {
  if (Array.isArray(data)) return data as V1Notice[];
  if (typeof data === 'object' && data && 'notices' in data && Array.isArray((data as { notices?: unknown }).notices)) {
    return (data as { notices: V1Notice[] }).notices;
  }
  return [];
}

function fallbackNotice(noticeId: string): V1Notice {
  const fallback = getNoticeDetailViewModel(noticeId).notice;
  return {
    id: fallback.id,
    title: fallback.title,
    category: fallback.tag,
    body: fallback.body.join('\n'),
    publishedAt: new Date().toISOString(),
  };
}
