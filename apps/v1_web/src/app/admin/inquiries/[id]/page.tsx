'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Clock, Mail, MessageSquareText, Pencil, Send, Tag, UserRound } from 'lucide-react';
import {
  AdminEmpty,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import {
  useV1AdminInquiry,
  useV1AdminMe,
  useV1ChangeAdminInquiryStatus,
  useV1ReplyAdminInquiry,
  useV1UpdateAdminInquiryReply,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1InquiryCategory, V1InquiryStatus } from '@/types/api';

const STATUS_LABEL: Record<V1InquiryStatus, string> = {
  received: '접수',
  reviewing: '검토중',
  answered: '답변완료',
  closed: '종결',
};

const CATEGORY_LABEL: Record<V1InquiryCategory, string> = {
  account: '계정',
  match: '매치',
  team: '팀',
  tournament: '대회',
  payment_refund: '결제/환불',
  report: '신고',
  other: '기타',
};

const STATUS_OPTIONS: Array<{ value: V1InquiryStatus; label: string }> = [
  { value: 'received', label: '접수' },
  { value: 'reviewing', label: '검토중' },
  { value: 'answered', label: '답변완료' },
  { value: 'closed', label: '종결' },
];

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function requesterName(inquiry: {
  requesterName: string | null;
  requesterEmail: string | null;
  userId: string | null;
  isGuest: boolean;
}) {
  if (inquiry.isGuest) return '비회원';
  return inquiry.requesterName ?? inquiry.requesterEmail ?? inquiry.userId?.slice(0, 8) ?? '알 수 없음';
}

function requesterContact(inquiry: {
  requesterEmail: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  isGuest: boolean;
}) {
  const email = inquiry.isGuest ? inquiry.guestEmail : inquiry.requesterEmail;
  const phone = inquiry.isGuest ? inquiry.guestPhone : null;
  if (email && phone) return `${email} · ${phone}`;
  return email ?? phone ?? '-';
}

export default function AdminInquiryDetailPage() {
  const params = useParams<{ id: string }>();
  const inquiryId = params.id;
  const { data: adminMe } = useV1AdminMe();
  const { data: inquiry, isPending, isError, error, refetch } = useV1AdminInquiry(inquiryId);
  const replyMutation = useV1ReplyAdminInquiry(inquiryId);
  const updateReplyMutation = useV1UpdateAdminInquiryReply(inquiryId);
  const statusMutation = useV1ChangeAdminInquiryStatus(inquiryId);
  const { toasts, showToast } = useAdminToast();
  const [replyBody, setReplyBody] = useState('');
  const [status, setStatus] = useState<V1InquiryStatus>('reviewing');
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;

  function startEditReply(replyId: string, currentBody: string) {
    setEditingReplyId(replyId);
    setEditDraft(currentBody);
  }

  function cancelEditReply() {
    setEditingReplyId(null);
    setEditDraft('');
  }

  function saveEditReply(replyId: string) {
    const body = editDraft.trim();
    if (!body) {
      showToast('답변 내용을 입력해 주세요.', 'error');
      return;
    }

    updateReplyMutation.mutate(
      { replyId, body },
      {
        onSuccess: () => {
          cancelEditReply();
          showToast('답변을 수정했어요.', 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '답변 수정에 실패했어요.'), 'error');
        },
      },
    );
  }

  useEffect(() => {
    if (inquiry) setStatus(inquiry.status);
  }, [inquiry]);

  function handleReplySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = replyBody.trim();
    if (!body) {
      showToast('답변 내용을 입력해 주세요.', 'error');
      return;
    }

    replyMutation.mutate(
      { body },
      {
        onSuccess: () => {
          setReplyBody('');
          showToast('답변을 등록했어요.', 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '답변 등록에 실패했어요.'), 'error');
        },
      },
    );
  }

  function handleStatusSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    statusMutation.mutate(
      { status },
      {
        onSuccess: () => {
          showToast('문의 상태를 변경했어요.', 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '상태 변경에 실패했어요.'), 'error');
        },
      },
    );
  }

  if (isPending) {
    return <AdminTableSkeleton rows={6} />;
  }

  if (isError || !inquiry) {
    return (
      <>
        <AdminPageHeader
          title="문의 상세"
          action={
            <Link
              href="/admin/inquiries"
              className="inline-flex h-[44px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              목록
            </Link>
          }
        />
        <AdminEmpty
          title="문의 정보를 불러오지 못했어요"
          description={extractErrorMessage(error, '잠시 후 다시 시도해 주세요.')}
          action={
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-600"
            >
              다시 시도
            </button>
          }
        />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="문의 상세"
        description={requesterName(inquiry)}
        action={
          <Link
            href="/admin/inquiries"
            className="inline-flex h-[44px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            목록
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="문의 내용">
          <article className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-[20px] font-bold text-gray-900">{inquiry.title}</h2>
                <div className="mt-3 flex flex-wrap gap-2 text-[13px] text-gray-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Tag size={14} aria-hidden="true" />
                    {CATEGORY_LABEL[inquiry.category]}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound size={14} aria-hidden="true" />
                    {requesterName(inquiry)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Mail size={14} aria-hidden="true" />
                    {requesterContact(inquiry)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={14} aria-hidden="true" />
                    {formatDateTime(inquiry.createdAt)}
                  </span>
                </div>
              </div>
              <AdminStatusPill status={inquiry.status} label={STATUS_LABEL[inquiry.status]} />
            </div>

            <div className="mt-5 whitespace-pre-wrap break-words rounded-xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-800">
              {inquiry.body}
            </div>
          </article>

          <section className="rounded-2xl border border-gray-100 bg-white p-5" aria-label="답변 내역">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-bold text-gray-900">답변</h2>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500">
                <MessageSquareText size={15} aria-hidden="true" />
                {inquiry.replies.length}
              </span>
            </div>

            {inquiry.replies.length > 0 ? (
              <ol className="flex flex-col gap-3">
                {inquiry.replies.map((reply) => {
                  const isEditing = editingReplyId === reply.replyId;
                  return (
                    <li key={reply.replyId} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {reply.adminName ?? '운영팀'}
                          {reply.adminRole ? (
                            <span className="ml-2 text-xs font-medium text-gray-400">{reply.adminRole}</span>
                          ) : null}
                        </p>
                        <div className="flex items-center gap-2">
                          <time className="text-xs text-gray-400">
                            {formatDateTime(reply.createdAt)}
                            {reply.updatedAt !== reply.createdAt ? ' (수정됨)' : ''}
                          </time>
                          {canWrite && !isEditing ? (
                            <button
                              type="button"
                              onClick={() => startEditReply(reply.replyId, reply.body)}
                              aria-label="답변 수정"
                              className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                            >
                              <Pencil size={15} aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {isEditing ? (
                        <div className="mt-2 flex flex-col gap-2">
                          <textarea
                            value={editDraft}
                            onChange={(event) => setEditDraft(event.target.value)}
                            rows={5}
                            maxLength={2000}
                            disabled={updateReplyMutation.isPending}
                            className="resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEditReply(reply.replyId)}
                              disabled={updateReplyMutation.isPending}
                              className="inline-flex h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                            >
                              {updateReplyMutation.isPending ? '저장 중...' : '저장'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditReply}
                              disabled={updateReplyMutation.isPending}
                              className="inline-flex h-[44px] items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700">{reply.body}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                등록된 답변이 없어요.
              </div>
            )}
          </section>
        </section>

        <aside className="flex flex-col gap-4" aria-label="문의 처리">
          <section className="rounded-2xl border border-gray-100 bg-white p-4">
            <h2 className="text-[16px] font-bold text-gray-900">답변 작성</h2>
            <form className="mt-3 flex flex-col gap-3" onSubmit={handleReplySubmit}>
              <textarea
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                rows={8}
                maxLength={2000}
                disabled={!canWrite || replyMutation.isPending}
                className="resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm leading-relaxed text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="답변 내용"
              />
              {!canWrite ? (
                <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  지원 권한은 조회만 가능해요.
                </p>
              ) : null}
              <button
                type="submit"
                disabled={!canWrite || replyMutation.isPending}
                className="inline-flex h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                <Send size={16} aria-hidden="true" />
                {replyMutation.isPending ? '등록 중...' : '답변 등록'}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4">
            <h2 className="text-[16px] font-bold text-gray-900">상태 변경</h2>
            <form className="mt-3 flex flex-col gap-3" onSubmit={handleStatusSubmit}>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as V1InquiryStatus)}
                disabled={!canWrite || statusMutation.isPending}
                className="h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!canWrite || statusMutation.isPending}
                className="inline-flex h-[44px] items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                {statusMutation.isPending ? '변경 중...' : '상태 변경'}
              </button>
            </form>
          </section>
        </aside>
      </div>

      <AdminToasts toasts={toasts} />
    </>
  );
}
