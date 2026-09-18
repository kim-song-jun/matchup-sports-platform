'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Ban, CheckCircle2, Clock3, MinusCircle, XCircle } from 'lucide-react';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import {
  useV1AcceptTeamContact,
  useV1CreateInquiry,
  useV1CreateTeamContactBlock,
  useV1DeclineTeamContact,
  useV1WithdrawTeamContact,
} from '@/hooks/use-v1-api';
import type { V1ChatRoomTeamContact, V1InquiryReportReason } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { INQUIRY_REPORT_REASON_OPTIONS as REPORT_REASON_OPTIONS, inquiryReportReasonLabel } from '@/lib/v1-status-labels';

/**
 * 컨택 방 상단의 상태 카드("팀 컨택의 채팅 흡수" 스펙 §7.1).
 * 컨택 상세 화면이 채팅방으로 흡수되면서, 거기 있던 상태 배지·만료 안내·수락/거절/철회·
 * 신고·차단이 전부 이 카드로 옮겨왔다. 방 자체의 액션(고정·나가기)은 여기 두지 않는다.
 */

type ContactStatus = V1ChatRoomTeamContact['status'];

const STATUS_VISUAL: Record<
  ContactStatus,
  { label: string; badgeClass: string; Icon: typeof Clock3 }
> = {
  requested: { label: '요청 대기', badgeClass: 'tm-badge-blue', Icon: Clock3 },
  accepted: { label: '수락됨', badgeClass: 'tm-badge-green', Icon: CheckCircle2 },
  declined: { label: '거절됨', badgeClass: 'tm-badge-grey', Icon: XCircle },
  withdrawn: { label: '철회됨', badgeClass: 'tm-badge-grey', Icon: MinusCircle },
  expired: { label: '만료됨', badgeClass: 'tm-badge-grey', Icon: Ban },
};

/** 상태 라벨 — 채팅 목록 배지도 같은 문구를 쓴다. */
export function contactStatusLabel(status: ContactStatus) {
  return STATUS_VISUAL[status].label;
}

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * 컨택 만료까지 남은 시간 — 기존 date-utils 포맷터와 다른 "카운트다운" 값이라 로컬 계산.
 * 컨택 만료 창은 7일이라 시간 단위만 쓰면 `167시간 58분` 처럼 못 읽는 숫자가 나온다 —
 * 하루 이상이면 일 단위로 접는다. 남은 시간은 **항상 내림한다**(실제보다 길게 말하면
 * 사용자가 늦게 대응한다).
 */
export function formatExpiresIn(expiresAt: string): string {
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return '';
  const diffMs = target - Date.now();
  if (diffMs <= 0) return '곧 만료돼요';

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  if (days >= 1) {
    const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
    return hours > 0 ? `${days}일 ${hours}시간 후 만료돼요` : `${days}일 후 만료돼요`;
  }

  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  if (hours > 0) return `${hours}시간 ${minutes}분 후 만료돼요`;
  return `${minutes}분 후 만료돼요`;
}

export function TeamContactStatusCard({ contact }: { contact: V1ChatRoomTeamContact }) {
  const { contactId, status, mySide } = contact;
  const counterpart = mySide === 'to' ? contact.fromTeam : contact.toTeam;
  const myTeam = mySide === 'to' ? contact.toTeam : contact.fromTeam;
  const visual = STATUS_VISUAL[status];

  const acceptContact = useV1AcceptTeamContact(contactId);
  const declineContact = useV1DeclineTeamContact(contactId);
  const withdrawContact = useV1WithdrawTeamContact(contactId);
  const createBlock = useV1CreateTeamContactBlock(myTeam.id);
  const reportContact = useV1CreateInquiry();

  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [blockConfirming, setBlockConfirming] = useState(false);
  const [blockCreated, setBlockCreated] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const declineReasonId = useId();

  const actionsPending = acceptContact.isPending || declineContact.isPending || withdrawContact.isPending;

  function handleAccept() {
    setActionError(null);
    acceptContact.mutate(undefined, {
      onError: (err) => setActionError(extractErrorMessage(err, '수락하지 못했어요. 잠시 후 다시 시도해 주세요.')),
    });
  }

  function handleDecline() {
    setActionError(null);
    const trimmed = declineReason.trim();
    declineContact.mutate(
      { reason: trimmed.length > 0 ? trimmed : undefined },
      {
        onSuccess: () => setDeclineOpen(false),
        onError: (err) => setActionError(extractErrorMessage(err, '거절하지 못했어요. 잠시 후 다시 시도해 주세요.')),
      },
    );
  }

  function handleWithdraw() {
    setActionError(null);
    withdrawContact.mutate(undefined, {
      onError: (err) => setActionError(extractErrorMessage(err, '철회하지 못했어요. 잠시 후 다시 시도해 주세요.')),
    });
  }

  function handleCreateBlock() {
    setBlockError(null);
    createBlock.mutate(
      { blockedTeamId: counterpart.id },
      {
        onSuccess: () => {
          setBlockConfirming(false);
          setBlockCreated(true);
        },
        onError: (err) => setBlockError(extractErrorMessage(err, '차단하지 못했어요. 잠시 후 다시 시도해 주세요.')),
      },
    );
  }

  function handleReportSubmit(reason: V1InquiryReportReason, detail: string) {
    setReportError(null);
    const reasonLabel = inquiryReportReasonLabel(reason);
    const trimmedDetail = detail.trim();
    reportContact.mutate(
      {
        category: 'report',
        relatedType: 'team_contact',
        relatedId: contactId,
        reportReason: reason,
        title: `팀 컨택 신고: ${reasonLabel}`,
        body: trimmedDetail.length > 0 ? trimmedDetail : reasonLabel,
      },
      {
        onSuccess: () => {
          setReportDialogOpen(false);
          setReportSubmitted(true);
        },
        onError: (err) => setReportError(extractErrorMessage(err, '신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.')),
      },
    );
  }

  return (
    <>
      <section className="tm-card tm-chat-contact-card" aria-label="컨택 상태" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span className={`tm-badge ${visual.badgeClass}`} style={{ gap: 4 }}>
            <visual.Icon size={14} strokeWidth={2.2} aria-hidden="true" />
            {visual.label}
          </span>
          {status === 'requested' ? (
            <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>{formatExpiresIn(contact.expiresAt)}</span>
          ) : null}
        </div>

        <div className="tm-text-body">
          <Link href={`/teams/${counterpart.id}`} className="tm-chat-contact-team-link" style={{ fontWeight: 700 }}>
            {counterpart.name}
          </Link>
          <span style={{ color: 'var(--text-muted)' }}>
            {mySide === 'to' ? '에서 우리 팀에 보낸 컨택이에요' : `에 우리 팀(${myTeam.name})이 보낸 컨택이에요`}
          </span>
        </div>

        {status === 'declined' && contact.declineReason ? (
          <div className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>거절 사유: {contact.declineReason}</div>
        ) : null}

        {status === 'requested' && mySide === 'to' ? (
          declineOpen ? (
            <div role="group" aria-label="거절 사유 입력" style={{ display: 'grid', gap: 8 }}>
              <label htmlFor={declineReasonId} className="tm-text-label">거절 사유 (선택, 상대 팀에게 전달돼요)</label>
              <textarea
                id={declineReasonId}
                className="tm-input"
                style={{ resize: 'none', lineHeight: 1.5 }}
                rows={2}
                maxLength={200}
                value={declineReason}
                onChange={(event) => setDeclineReason(event.target.value)}
                disabled={actionsPending}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="tm-btn tm-btn-lg tm-btn-neutral" style={{ flex: 1, minHeight: 44 }} onClick={() => setDeclineOpen(false)} disabled={actionsPending}>
                  취소
                </button>
                <button type="button" className="tm-btn tm-btn-lg tm-btn-danger" style={{ flex: 1, minHeight: 44 }} onClick={handleDecline} disabled={actionsPending}>
                  {declineContact.isPending ? '거절하는 중' : '거절하기'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="tm-btn tm-btn-lg tm-btn-neutral" style={{ flex: 1, minHeight: 44 }} onClick={() => setDeclineOpen(true)} disabled={actionsPending}>
                거절
              </button>
              <button type="button" className="tm-btn tm-btn-lg tm-btn-primary" style={{ flex: 1, minHeight: 44 }} onClick={handleAccept} disabled={actionsPending}>
                {acceptContact.isPending ? '수락하는 중' : '수락'}
              </button>
            </div>
          )
        ) : null}

        {status === 'requested' && mySide === 'from' ? (
          <button type="button" className="tm-btn tm-btn-lg tm-btn-outline tm-btn-block" style={{ minHeight: 44 }} onClick={handleWithdraw} disabled={actionsPending}>
            {withdrawContact.isPending ? '철회하는 중' : '컨택 철회'}
          </button>
        ) : null}

        {actionError ? (
          <div role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>{actionError}</div>
        ) : null}

        {/* 신고·차단은 컨택 상태와 무관하게 항상 노출한다 — 거절·만료 뒤에 신고할 이유가 생기기도 한다. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {reportSubmitted ? (
            <span role="status" className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>신고가 접수됐어요. 검토 후 처리할게요.</span>
          ) : (
            <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" style={{ minHeight: 44 }} onClick={() => setReportDialogOpen(true)}>
              신고하기
            </button>
          )}
          {blockCreated ? (
            <span role="status" className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>
              {counterpart.name} 팀을 차단했어요. 팀 설정에서 해제할 수 있어요.
            </span>
          ) : blockConfirming ? (
            <span role="group" aria-label="팀 차단 확인" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="tm-text-caption" style={{ color: 'var(--text-muted)' }}>차단하면 {counterpart.name} 팀은 우리 팀에 컨택을 보낼 수 없어요.</span>
              <button type="button" className="tm-btn tm-btn-sm tm-btn-neutral" style={{ minHeight: 44 }} onClick={() => setBlockConfirming(false)} disabled={createBlock.isPending}>
                취소
              </button>
              <button type="button" className="tm-btn tm-btn-sm tm-btn-danger" style={{ minHeight: 44 }} onClick={handleCreateBlock} disabled={createBlock.isPending}>
                {createBlock.isPending ? '차단하는 중' : '차단하기'}
              </button>
            </span>
          ) : (
            <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" style={{ minHeight: 44 }} onClick={() => setBlockConfirming(true)}>
              차단하기
            </button>
          )}
        </div>
        {blockError ? (
          <div role="alert" className="tm-text-caption" style={{ color: 'var(--red700)' }}>{blockError}</div>
        ) : null}
      </section>

      <ReportContactDialog
        open={reportDialogOpen}
        saving={reportContact.isPending}
        error={reportError}
        onClose={() => {
          setReportDialogOpen(false);
          setReportError(null);
        }}
        onSubmit={handleReportSubmit}
      />
    </>
  );
}

function ReportContactDialog({
  open,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: V1InquiryReportReason, detail: string) => void;
}) {
  const idPrefix = useId();
  const titleId = `${idPrefix}-report-title`;
  const [reason, setReason] = useState<V1InquiryReportReason | null>(null);
  const [detail, setDetail] = useState('');

  const { dialogRef, onBackdropClick } = useModalA11y<HTMLElement, HTMLDivElement>({ open, onClose });

  useEffect(() => {
    if (!open) return;
    setReason(null);
    setDetail('');
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
      style={{ background: 'rgba(25,31,40,0.45)' }}
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[360px] rounded-2xl overflow-hidden"
        style={{ background: 'var(--card-surface, #fff)', boxShadow: '0 8px 32px rgba(20,28,45,0.14)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: '24px 20px 16px', display: 'grid', gap: 12 }}>
          <p id={titleId} className="tm-text-body-lg" style={{ fontWeight: 700, margin: 0 }}>
            컨택 신고하기
          </p>
          <p className="tm-text-caption" style={{ color: 'var(--text-muted)', margin: 0 }}>
            신고 사유를 선택해 주세요. 상세 설명은 선택이에요.
          </p>

          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
            <legend className="tm-text-label" style={{ padding: 0, marginBottom: 4 }}>
              신고 사유
            </legend>
            {REPORT_REASON_OPTIONS.map((option) => {
              const inputId = `${idPrefix}-reason-${option.value}`;
              return (
                <label
                  key={option.value}
                  htmlFor={inputId}
                  className="tm-text-body"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    id={inputId}
                    name="team-contact-report-reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value)}
                  />
                  {option.label}
                </label>
              );
            })}
          </fieldset>

          <label htmlFor={`${idPrefix}-report-detail`} className="tm-text-label">
            상세 설명 (선택)
          </label>
          <textarea
            id={`${idPrefix}-report-detail`}
            className="tm-input"
            style={{ resize: 'none', lineHeight: 1.5 }}
            rows={3}
            maxLength={500}
            value={detail}
            placeholder="상황을 알려주시면 검토에 도움이 돼요."
            onChange={(event) => setDetail(event.target.value)}
            disabled={saving}
          />

          {error !== null ? (
            <p className="tm-text-caption" role="alert" style={{ color: 'var(--red700)', margin: 0 }}>
              {error}
            </p>
          ) : null}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 20px 20px' }}>
          <button type="button" className="tm-btn tm-btn-lg tm-btn-neutral" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            type="button"
            className="tm-btn tm-btn-lg tm-btn-danger"
            disabled={reason === null || saving}
            onClick={() => {
              if (reason === null) return;
              onSubmit(reason, detail);
            }}
          >
            {saving ? '접수하는 중' : '신고 접수'}
          </button>
        </div>
      </div>
    </div>
  );
}
