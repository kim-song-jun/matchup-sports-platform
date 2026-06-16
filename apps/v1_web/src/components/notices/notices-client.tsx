'use client';

import { useMemo, useState } from 'react';
import { useV1Notice, useV1Notices } from '@/hooks/use-v1-api';
import type { V1Notice } from '@/types/api';
import { NoticeDetailPageView, NoticeListPageView } from './notices-page';
import type { NoticeDetailViewModel, NoticeListViewModel, NoticeModel } from './notices.types';
import { getNoticeDetailViewModel, getNoticeListViewModel } from './notices.view-model';

export function NoticeListPageClient() {
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const query = useV1Notices(selectedCategory === '전체' ? undefined : { category: selectedCategory });
  const fallback = getNoticeListViewModel();
  const notices = sortPinnedFirst(query.data ? getNoticeItems(query.data).map(toNotice) : fallback.notices);
  const categories = useMemo(() => {
    const labels = ['전체', '고정', '업데이트', '안내'];
    return labels.map((label) => ({
      label,
      active: selectedCategory === label,
      onSelect: () => setSelectedCategory(label),
    }));
  }, [selectedCategory]);

  const model: NoticeListViewModel = query.data
    ? {
        ...fallback,
        filters: categories,
        notices,
      }
    : {
        ...fallback,
        filters: categories,
        notices: selectedCategory === '전체' ? notices : notices.filter((notice) => notice.tag === selectedCategory),
      };

  return <NoticeListPageView model={model} />;
}

export function NoticeDetailPageClient({ noticeId }: { noticeId: string }) {
  const query = useV1Notice(noticeId);
  const fallback = getNoticeDetailViewModel(noticeId);
  const model: NoticeDetailViewModel = query.data
    ? {
        ...fallback,
        notice: toNotice(query.data.notice ?? fallbackNotice(noticeId)),
      }
    : fallback;

  return <NoticeDetailPageView model={model} />;
}

function toNotice(notice: V1Notice): NoticeModel {
  const body = notice.body ?? '공지 내용이 아직 등록되지 않았어요.';

  return {
    id: notice.noticeId ?? notice.id ?? 'notice',
    tag: notice.category ?? notice.audience ?? '공지',
    title: notice.title,
    summary: body,
    date: formatDate(notice.publishedAt),
    pinned: notice.category === '고정',
    body: body.split('\n').filter(Boolean),
  };
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

function sortPinnedFirst(notices: NoticeModel[]) {
  return [...notices].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}
