import type { V1Notice } from '@/types/api';
import { richContentPreviewText } from '@/lib/rich-content';
import type { NoticeModel } from './notices.types';

// API 시드 데이터 body에 포함된 " seed data" 접미어를 제거한다.
// 배포 전 DB 시드값이 그대로 노출되는 것을 막는 최소 sanitize 처리.
// 실제 공지 내용으로 교체되면 이 함수는 no-op이 된다.
export function sanitizeNoticeBody(raw: string): string {
  return raw.replace(/\s+seed data\s*$/i, '').trim();
}

export function splitNoticeBody(body: string): string[] {
  return body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function toNotice(notice: V1Notice): NoticeModel {
  const rawBody = notice.body ?? '공지 내용이 아직 등록되지 않았어요.';
  const body = sanitizeNoticeBody(rawBody);
  const displayBody = body || '공지 내용을 불러오는 중이에요.';

  return {
    id: notice.noticeId ?? notice.id ?? 'notice',
    tag: notice.category ?? notice.audience ?? '공지',
    title: notice.title,
    summary: richContentPreviewText(notice.content, displayBody),
    date: formatDate(notice.publishedAt),
    body: splitNoticeBody(displayBody),
    content: notice.content ?? undefined,
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}
